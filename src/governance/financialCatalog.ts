import type { ExternalRoleCatalogSnapshotV1 } from './types'

export const FINANCIAL_APPLICATION_ID = 'financial-management-system' as const
export const FINANCIAL_CATALOG_VERSION = 'financial-management-system.role-catalog.2026-09-03.v1' as const
export const FINANCIAL_CATALOG_SHA256 = '801c08887bdee6e082823400bc9ad37dd329474887d7774537161655d94332e3' as const
export const FINANCIAL_ROLE_IDS = ['role-owner', 'role-finance-manager', 'role-finance-staff', 'role-sales', 'role-procurement', 'role-viewer'] as const

export function validateFinancialExternalRoleCatalog(snapshot: ExternalRoleCatalogSnapshotV1) {
  const issues: Array<{ code: string; path: string; message: string }> = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  if (snapshot.applicationId !== FINANCIAL_APPLICATION_ID) add('EXTERNAL_CATALOG_OWNER_INVALID', 'applicationId', 'catalog owner 必須為 financial-management-system')
  if (snapshot.sourceKind !== 'bundled-fixture' && snapshot.sourceKind !== 'application-contract') add('EXTERNAL_CATALOG_SOURCE_INVALID', 'sourceKind', 'Financial catalog 必須來自 FMS application contract')
  if (snapshot.effectState !== 'not-synchronized') add('EXTERNAL_CATALOG_EFFECT_INVALID', 'effectState', 'Current Phase 不得宣稱已同步')
  if (snapshot.sourceKind === 'bundled-fixture') {
    if (snapshot.catalogVersion !== FINANCIAL_CATALOG_VERSION) add('EXTERNAL_CATALOG_VERSION_CONFLICT', 'catalogVersion', 'fixture Financial catalog version 不符合目前相容測試契約')
    const sha = snapshot.catalogSha256 ?? snapshot.payloadHash
    if (!/^[a-f0-9]{64}$/u.test(sha) || sha !== FINANCIAL_CATALOG_SHA256 || snapshot.payloadHash !== FINANCIAL_CATALOG_SHA256) add('EXTERNAL_CATALOG_INVALID', 'payloadHash', 'fixture Financial catalog payload hash 不一致')
    if (snapshot.roles.length !== FINANCIAL_ROLE_IDS.length) add('EXTERNAL_CATALOG_ROLE_COUNT_INVALID', 'roles', 'fixture Financial catalog role count 不一致')
  } else {
    if (!snapshot.catalogVersion.trim() || !snapshot.registryVersion?.trim() || snapshot.formatVersion !== 'jf.configuration-catalog.v1') add('EXTERNAL_CATALOG_INVALID', 'catalogVersion', 'FMS application catalog provenance 不完整')
    if (!/^[a-f0-9]{64}$/u.test(snapshot.contentSha256 ?? '') || snapshot.catalogSha256 !== snapshot.contentSha256 || snapshot.payloadHash !== snapshot.contentSha256 || !/^[a-f0-9]{64}$/u.test(snapshot.artifactSha256 ?? '')) add('EXTERNAL_CATALOG_INVALID', 'contentSha256', 'FMS catalog content/artifact hash 不一致')
    if (!snapshot.publishedByPrincipalId?.trim() || !snapshot.publishedByEmployeeId?.trim() || !snapshot.sourceDraftId?.trim() || !Number.isSafeInteger(snapshot.sourceDraftRevision) || (snapshot.sourceDraftRevision ?? 0) < 0) add('EXTERNAL_CATALOG_PROVENANCE_INVALID', 'sourceDraftId', 'FMS catalog release provenance 不完整')
    if (!snapshot.roles.length) add('EXTERNAL_ROLE_UNKNOWN', 'roles', 'FMS catalog 至少需要一個 role')
  }
  for (const [index, role] of snapshot.roles.entries()) {
    if (snapshot.sourceKind === 'bundled-fixture') {
      if (role.stableRoleId !== FINANCIAL_ROLE_IDS[index]) add('EXTERNAL_ROLE_UNKNOWN', `roles[${index}].stableRoleId`, 'Financial stable role ID 不一致')
      if (role.status !== 'active' || role.assignable !== true || role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin' || role.recommendationAllowed !== false || role.delegationAllowed !== false || role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== 'workspace') add('CATALOG_ROLE_CONTRACT_MISMATCH', `roles[${index}]`, 'Financial role 必須是 active employee workspace app_admin ordinary role')
    } else if (!role.stableRoleId.trim() || !role.code.trim() || !role.displayName.trim() || role.status !== 'active' || role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin' || role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== 'workspace' || !Array.isArray(role.capabilityIds) || !/^[a-f0-9]{64}$/u.test(role.roleDefinitionHash ?? '') || !['open', 'existing_only'].includes(role.assignmentPolicy ?? '')) {
      add('CATALOG_ROLE_CONTRACT_MISMATCH', `roles[${index}]`, 'FMS role 必須保留完整能力、scope、assignment policy 與 role hash')
    }
  }
  return issues
}
