import { ORGMASTER_PERMISSIONS } from '../governance/aiPdmCatalog'

export type OrgMasterPermissionCode = typeof ORGMASTER_PERMISSIONS[number]['code']
export type OrgMasterPermissionProjectionV1 = {
  contractVersion: 'orgmaster.frontend-permission-projection.v1'
  applicationId: 'orgmaster'
  principalId: string
  generatedAt: string
  governanceRevision: string
  permissions: Record<OrgMasterPermissionCode, boolean>
  management: { crossAppOverride: boolean }
}
export function isOrgMasterPermissionProjection(value: unknown, principalId: string): value is OrgMasterPermissionProjectionV1 {
  if (!value || typeof value !== 'object') return false
  const body = value as Partial<OrgMasterPermissionProjectionV1>
  return body.contractVersion === 'orgmaster.frontend-permission-projection.v1'
    && body.applicationId === 'orgmaster' && body.principalId === principalId
    && typeof body.generatedAt === 'string' && Number.isFinite(Date.parse(body.generatedAt))
    && typeof body.governanceRevision === 'string' && Boolean(body.governanceRevision)
    && typeof body.management?.crossAppOverride === 'boolean'
    && Boolean(body.permissions && !Array.isArray(body.permissions)
      && Object.keys(body.permissions).length === ORGMASTER_PERMISSIONS.length
      && ORGMASTER_PERMISSIONS.every(({ code }) => typeof body.permissions?.[code] === 'boolean'))
}
