import structlog

from polar.config import settings
from polar.redis import create_redis

from .client import get_app_client

log = structlog.get_logger()


async def verify_app_configuration() -> None:
    if settings.GITHUB_APP_IDENTIFIER == "__UNSET__":
        log.info(
            "github.verify-app", message="GitHub App is not configured", all_ok=False
        )
        return

    async with create_redis() as redis:
        client = get_app_client(redis)
        app = await client.rest.apps.async_get_authenticated()

    assert app.parsed_data is not None
    permissions = app.parsed_data.permissions
    events = app.parsed_data.events

    all_ok = True

    expected_permissions = {
        "issues": "write",
        "pull_requests": "write",
        "members": "read",
        "emails": "read",
    }

    expected_events = [
        "issues",
        "issue_comment",
        "label",
        "public",
        "repository",
        "milestone",
    ]

    for perm in expected_permissions:
        if getattr(permissions, perm) == expected_permissions[perm]:
            continue
        log.error(
            "github.verify-app.unexpected-permission - you might need to update the GitHub App",  # noqa: E501
            key=perm,
            expected=expected_permissions[perm],
            got=getattr(permissions, perm),
        )
        all_ok = False

    for event in expected_events:
        if event in events:
            continue
        log.error(
            "github.verify-app.missing-event - you might need to update the GitHub App",
            key=event,
        )
        all_ok = False

    log.info("github.verify-app", all_ok=all_ok)
