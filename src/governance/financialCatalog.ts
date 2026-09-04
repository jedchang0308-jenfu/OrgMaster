import type { ExternalRoleCatalogSnapshotV1 } from './types'

export const FINANCIAL_APPLICATION_ID = 'financial-management-system' as const
export const FINANCIAL_CATALOG_VERSION = 'financial-management-system.role-catalog.2026-09-03.v1' as const
export const FINANCIAL_CATALOG_SHA256 = '801c08887bdee6e082823400bc9ad37dd329474887d7774537161655d94332e3' as const
export const FINANCIAL_ROLE_IDS = ['role-owner', 'role-finance-manager', 'role-finance-staff', 'role-sales', 'role-procurement', 'role-viewer'] as const

export function validateFinancialExternalRoleCatalog(snapshot: ExternalRoleCatalogSnapshotV1) {
  const issues: Array<{ code: string; path: string; message: string }> = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  if (snapshot.applicationId !== FINANCIAL_APPLICATION_ID) add('EXTERNAL_CATALOG_OWNER_INVALID', 'applicationId', 'catalog owner 必須為 financial-management-system')
  if (snapshot.sourceKind !== 'bundled-fixture') add('EXTERNAL_CATALOG_SOURCE_INVALID', 'sourceKind', 'Financial catalog 必須來自已驗證 fixture')
  if (snapshot.catalogVersion !== FINANCIAL_CATALOG_VERSION) add('EXTERNAL_CATALOG_VERSION_CONFLICT', 'catalogVersion', 'Financial catalog version 不符合目前契約')
  if (snapshot.effectState !== 'not-synchronized') add('EXTERNAL_CATALOG_EFFECT_INVALID', 'effectState', 'Current Phase 不得宣稱已同步')
  const sha = snapshot.catalogSha256 ?? snapshot.payloadHash
  if (!/^[a-f0-9]{64}$/u.test(sha) || sha !== FINANCIAL_CATALOG_SHA256 || snapshot.payloadHash !== FINANCIAL_CATALOG_SHA256) add('EXTERNAL_CATALOG_INVALID', 'payloadHash', 'Financial catalog payload hash 不一致')
  if (snapshot.roles.length !== FINANCIAL_ROLE_IDS.length) add('EXTERNAL_CATALOG_ROLE_COUNT_INVALID', 'roles', 'Financial catalog role count 不一致')
  for (const [index, role] of snapshot.roles.entries()) {
    if (role.stableRoleId !== FINANCIAL_ROLE_IDS[index]) add('EXTERNAL_ROLE_UNKNOWN', `roles[${index}].stableRoleId`, 'Financial stable role ID 不一致')
    if (role.status !== 'active' || role.assignable !== true || role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin' || role.recommendationAllowed !== false || role.delegationAllowed !== false || role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== 'workspace') add('CATALOG_ROLE_CONTRACT_MISMATCH', `roles[${index}]`, 'Financial role 必須是 active employee workspace app_admin ordinary role')
  }
  return issues
}
