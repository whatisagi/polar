'use client'

import { useListMemberOrganizations } from '@/hooks/queries'
import type { Organization } from '@polar-sh/sdk'

export const useIsOrganizationAdmin = (org?: Organization) => {
  const listOrganizationsQuery = useListMemberOrganizations()
  return listOrganizationsQuery.data?.items?.some((o) => o.id === org?.id)
}
