import type { ExternalRoleCatalogRoleV1, ExternalRoleCatalogSnapshotV1 } from './types'

export const FINANCIAL_APPLICATION_ID = 'financial-management-system' as const
export const FINANCIAL_CATALOG_VERSION = 'financial-management-system.role-catalog.2026-11-05.v5' as const
export const FINANCIAL_CATALOG_SHA256 = '7ba0b947b596ad90bc6078febff979b3204545cdecdcd679e3dd4fa561466486' as const
export const FINANCIAL_ROLE_IDS = ['role-owner', 'role-finance-manager', 'role-finance-staff', 'role-sales', 'role-procurement', 'role-viewer','role-system-admin'] as const
export const FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH='2a8ab5c084e00f9cd1f9a87e193d1269ea85c80eb66fba78c1b6ab2ab467ce11'
export const FINANCIAL_ADMINISTRATIVE_CAPABILITIES=['finance.capability_catalog.view','finance.role_assignment.manage','finance.users.manage'] as const

/**
 * A trusted old FMS catalog proves only the immutable snapshot recorded on an
 * existing assignment. The current catalog still decides whether the stable
 * role is active, assignable and compatible with the assignment scope.
 */
export function historicalFinancialRoleSnapshotMatches(value: {
  catalogVersion: string | null; roleId: string; roleCodeSnapshot: string;
  roleNameSnapshot: string; scope: { kind: string }
}, currentRole: ExternalRoleCatalogRoleV1 | undefined, trustedHistory: ExternalRoleCatalogSnapshotV1[] = []) {
  if (!currentRole || !value.catalogVersion) return false
  const snapshot = trustedHistory.find(entry => entry.applicationId === FINANCIAL_APPLICATION_ID
    && entry.catalogVersion === value.catalogVersion)
  if (!snapshot || validateFinancialExternalRoleCatalog(snapshot).length) return false
  const historicalRole = snapshot.roles.find(entry => entry.stableRoleId === value.roleId)
  return !!historicalRole
    && historicalRole.code === value.roleCodeSnapshot
    && historicalRole.displayName === value.roleNameSnapshot
    && historicalRole.allowedScopeKinds.includes(value.scope.kind as 'workspace' | 'project' | 'global')
    && currentRole.allowedScopeKinds.includes(value.scope.kind as 'workspace' | 'project' | 'global')
}

export function validateFinancialExternalRoleCatalog(snapshot: ExternalRoleCatalogSnapshotV1) {
  const issues: Array<{ code: string; path: string; message: string }> = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  if (snapshot.applicationId !== FINANCIAL_APPLICATION_ID) add('EXTERNAL_CATALOG_OWNER_INVALID', 'applicationId', 'catalog owner 必須為 financial-management-system')
  if (snapshot.sourceKind !== 'bundled-fixture' && snapshot.sourceKind !== 'application-contract') add('EXTERNAL_CATALOG_SOURCE_INVALID', 'sourceKind', 'Financial catalog 必須來自 FMS application contract')
  if (snapshot.effectState !== 'not-synchronized') add('EXTERNAL_CATALOG_EFFECT_INVALID', 'effectState', 'Current Phase 不得宣稱已同步')
  if (snapshot.sourceKind === 'bundled-fixture') {
    const legacy=snapshot.catalogVersion==='financial-management-system.role-catalog.2026-09-03.v1'
    if (snapshot.catalogVersion !== FINANCIAL_CATALOG_VERSION&&!legacy) add('EXTERNAL_CATALOG_VERSION_CONFLICT', 'catalogVersion', 'fixture Financial catalog version 不符合目前相容測試契約')
    const sha = snapshot.catalogSha256 ?? snapshot.payloadHash
    const expectedHash=legacy?'801c08887bdee6e082823400bc9ad37dd329474887d7774537161655d94332e3':FINANCIAL_CATALOG_SHA256
    if (!/^[a-f0-9]{64}$/u.test(sha) || sha !== expectedHash || snapshot.payloadHash !== expectedHash) add('EXTERNAL_CATALOG_INVALID', 'payloadHash', 'fixture Financial catalog payload hash 不一致')
    if (snapshot.roles.length !== (legacy?6:FINANCIAL_ROLE_IDS.length)) add('EXTERNAL_CATALOG_ROLE_COUNT_INVALID', 'roles', 'fixture Financial catalog role count 不一致')
  } else {
    if (!snapshot.catalogVersion.trim() || !snapshot.registryVersion?.trim() || snapshot.formatVersion !== 'jf.configuration-catalog.v1') add('EXTERNAL_CATALOG_INVALID', 'catalogVersion', 'FMS application catalog provenance 不完整')
    if (!/^[a-f0-9]{64}$/u.test(snapshot.contentSha256 ?? '') || snapshot.catalogSha256 !== snapshot.contentSha256 || snapshot.payloadHash !== snapshot.contentSha256 || !/^[a-f0-9]{64}$/u.test(snapshot.artifactSha256 ?? '')) add('EXTERNAL_CATALOG_INVALID', 'contentSha256', 'FMS catalog content/artifact hash 不一致')
    if (!snapshot.publishedByPrincipalId?.trim() || !snapshot.publishedByEmployeeId?.trim() || !snapshot.sourceDraftId?.trim() || !Number.isSafeInteger(snapshot.sourceDraftRevision) || (snapshot.sourceDraftRevision ?? 0) < 0) add('EXTERNAL_CATALOG_PROVENANCE_INVALID', 'sourceDraftId', 'FMS catalog release provenance 不完整')
    if (!snapshot.roles.length) add('EXTERNAL_ROLE_UNKNOWN', 'roles', 'FMS catalog 至少需要一個 role')
  }
  for (const [index, role] of snapshot.roles.entries()) {
    if(role.stableRoleId==='role-system-admin'){
      const capabilities=[...(role.capabilityIds??[])].sort()
      if(role.code!=='system-admin'||role.displayName!=='系統管理員'||role.status!=='active'||role.assignable!==false||role.subjectKind!=='principal'||role.allowedScopeKinds.length!==1||role.allowedScopeKinds[0]!=='workspace'||role.recommendationAllowed!==false||role.delegationAllowed!==false||role.assignmentDisposition!=='hidden-protected'
       || snapshot.sourceKind==='application-contract'&&(role.roleDefinitionHash!==FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH||JSON.stringify(capabilities)!==JSON.stringify(FINANCIAL_ADMINISTRATIVE_CAPABILITIES)||role.builtIn!==true||role.assignmentPolicy!=='open'))add('CATALOG_ROLE_CONTRACT_MISMATCH',`roles[${index}]`,'FMS 系統管理員定義必須保持窄管理能力及 Principal subject')
      continue
    }
    if (snapshot.sourceKind === 'bundled-fixture') {
      if (role.stableRoleId !== FINANCIAL_ROLE_IDS[index]) add('EXTERNAL_ROLE_UNKNOWN', `roles[${index}].stableRoleId`, 'Financial stable role ID 不一致')
      if (role.status !== 'active' || role.assignable !== true || role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin' || role.recommendationAllowed !== false || role.delegationAllowed !== false || role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== 'workspace') add('CATALOG_ROLE_CONTRACT_MISMATCH', `roles[${index}]`, 'Financial role 必須是 active employee workspace app_admin ordinary role')
    } else if (!role.stableRoleId.trim() || !role.code.trim() || !role.displayName.trim() || role.status !== 'active' || role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin' || role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== 'workspace' || !Array.isArray(role.capabilityIds) || !/^[a-f0-9]{64}$/u.test(role.roleDefinitionHash ?? '') || !['open', 'existing_only'].includes(role.assignmentPolicy ?? '')) {
      add('CATALOG_ROLE_CONTRACT_MISMATCH', `roles[${index}]`, 'FMS role 必須保留完整能力、scope、assignment policy 與 role hash')
    }
  }
  return issues
}
