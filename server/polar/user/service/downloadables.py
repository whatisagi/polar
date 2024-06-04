from collections.abc import Sequence
from datetime import timedelta
from uuid import UUID

import structlog
from itsdangerous import SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import contains_eager

from polar.config import settings
from polar.exceptions import (
    BadRequest,
    ResourceNotFound,
    ResourceUnavailable,
)
from polar.file.schemas import FileDownload
from polar.file.service import file as file_service
from polar.kit.pagination import PaginationParams, paginate
from polar.kit.services import ResourceService
from polar.kit.utils import utc_now
from polar.models import Benefit, User
from polar.models.downloadable import Downloadable, DownloadableStatus
from polar.models.file import File
from polar.postgres import AsyncSession, sql

from ..schemas.downloadables import (
    DownloadableCreate,
    DownloadableRead,
    DownloadableUpdate,
    DownloadableURL,
)

log = structlog.get_logger()

token_serializer = URLSafeTimedSerializer(
    settings.S3_FILES_DOWNLOAD_SECRET, settings.S3_FILES_DOWNLOAD_SALT
)


class DownloadableService(
    ResourceService[Downloadable, DownloadableCreate, DownloadableUpdate]
):
    async def get_list(
        self,
        session: AsyncSession,
        *,
        user: User,
        pagination: PaginationParams,
        organization_id: UUID | None = None,
        benefit_id: UUID | None = None,
    ) -> tuple[Sequence[Downloadable], int]:
        statement = self._get_base_query(user)

        if organization_id:
            statement = statement.where(File.organization_id == organization_id)

        if benefit_id:
            statement = statement.where(Downloadable.benefit_id == benefit_id)

        return await paginate(session, statement, pagination=pagination)

    async def grant_for_benefit_file(
        self,
        session: AsyncSession,
        user: User,
        benefit_id: UUID,
        file_id: UUID,
    ) -> Downloadable | None:
        file = await file_service.get(session, file_id)
        if not file:
            log.info(
                "downloadables.grant.file_not_found",
                file_id=file_id,
                user_id=user.id,
                benefit_id=benefit_id,
                granted=False,
            )
            return None

        create_schema = DownloadableCreate(
            file_id=file.id,
            user_id=user.id,
            benefit_id=benefit_id,
            status=DownloadableStatus.granted,
        )
        records = await self.upsert_many(
            session,
            create_schemas=[create_schema],
            constraints=[
                Downloadable.file_id,
                Downloadable.user_id,
                Downloadable.benefit_id,
            ],
            mutable_keys={
                "status",
            },
            autocommit=False,
        )
        await session.flush()
        instance = records[0]
        assert instance.id is not None

        log.info(
            "downloadables.grant",
            file_id=file.id,
            user_id=user.id,
            downloadables_id=instance.id,
            benefit_id=benefit_id,
            granted=True,
        )
        return instance

    async def revoke_for_benefit(
        self,
        session: AsyncSession,
        user: User,
        benefit_id: UUID,
    ) -> None:
        statement = (
            sql.update(Downloadable)
            .where(
                Downloadable.user_id == user.id,
                Downloadable.benefit_id == benefit_id,
                Downloadable.status == DownloadableStatus.granted,
                Downloadable.deleted_at.is_(None),
            )
            .values(
                status=DownloadableStatus.revoked,
                modified_at=utc_now(),
            )
        )
        log.info(
            "downloadables.revoked",
            user_id=user.id,
            benefit_id=benefit_id,
        )
        await session.execute(statement)

    async def increment_download_count(
        self,
        session: AsyncSession,
        downloadable: Downloadable,
    ) -> Downloadable:
        downloadable.downloaded += 1
        downloadable.last_downloaded_at = utc_now()
        session.add(downloadable)
        await session.flush()
        return downloadable

    def generate_downloadable_schemas(
        self, downloadables: Sequence[Downloadable]
    ) -> list[DownloadableRead]:
        items = []
        for downloadable in downloadables:
            item = self.generate_downloadable_schema(downloadable)
            items.append(item)
        return items

    def generate_downloadable_schema(
        self, downloadable: Downloadable
    ) -> DownloadableRead:
        token = self.create_download_token(downloadable)
        file_download = FileDownload.from_presigned(
            downloadable.file,
            url=token.url,
            expires_at=token.expires_at,
        )
        return DownloadableRead(
            id=downloadable.id,
            benefit_id=downloadable.benefit_id,
            file=file_download,
        )

    def create_download_token(self, downloadable: Downloadable) -> DownloadableURL:
        expires_at = utc_now() + timedelta(seconds=settings.S3_FILES_PRESIGN_TTL)

        last_downloaded_at = 0.0
        if downloadable.last_downloaded_at:
            last_downloaded_at = downloadable.last_downloaded_at.timestamp()

        token = token_serializer.dumps(
            dict(
                id=str(downloadable.id),
                # Not used initially, but good for future rate limiting
                downloaded=downloadable.downloaded,
                last_downloaded_at=last_downloaded_at,
            )
        )
        redirect_to = f"{settings.BASE_URL}/users/downloadables/{token}"
        return DownloadableURL(url=redirect_to, expires_at=expires_at)

    async def get_from_token_or_raise(
        self, session: AsyncSession, user: User, token: str
    ) -> Downloadable:
        try:
            unpacked = token_serializer.loads(
                token, max_age=settings.S3_FILES_PRESIGN_TTL
            )
            id = UUID(unpacked["id"])
        except SignatureExpired:
            raise ResourceUnavailable()
        except KeyError:
            raise BadRequest()

        statement = self._get_base_query(user).where(Downloadable.id == id)
        res = await session.execute(statement)
        downloadable = res.scalars().one_or_none()
        if not downloadable:
            raise ResourceNotFound()

        await self.increment_download_count(session, downloadable)
        return downloadable

    def generate_download_schema(self, downloadable: Downloadable) -> DownloadableRead:
        file_schema = file_service.generate_downloadable_schema(downloadable.file)
        return DownloadableRead(
            id=downloadable.id,
            benefit_id=downloadable.benefit_id,
            file=file_schema,
        )

    def _get_base_query(self, user: User) -> sql.Select[tuple[Downloadable]]:
        statement = (
            sql.select(Downloadable)
            .join(File)
            .join(Benefit)
            .options(contains_eager(Downloadable.file))
            .where(
                Downloadable.user_id == user.id,
                Downloadable.status == DownloadableStatus.granted,
                Downloadable.deleted_at.is_(None),
                File.deleted_at.is_(None),
                File.is_uploaded == True,  # noqa
                File.is_enabled == True,  # noqa
                Benefit.deleted_at.is_(None),
            )
            .order_by(Downloadable.created_at.desc())
        )
        return statement


downloadable = DownloadableService(Downloadable)
