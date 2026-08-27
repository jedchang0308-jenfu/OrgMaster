import { validateExternalRoleCatalog } from './aiPdmCatalog'
import type { ExternalRoleCatalogSnapshotV1, GovernanceDocumentV1, GovernanceDocumentV2, GovernanceOrgSource, GovernancePolicyDataV1, GovernancePolicyDataV2, GovernancePolicyVersionV1, GovernanceRoleAssignmentV2, GovernanceRoleDelegationV2, GovernanceScopeV1 } from './types'

export type GovernanceValidationIssue = { code: string; path: string; message: string }
export class GovernanceValidationError extends Error {
  constructor(public readonly issues: GovernanceValidationIssue[]) { super('GOVERNANCE_VALIDATION_FAILED'); this.name = 'GovernanceValidationError' }
}

const CODE = /^[a-z0-9][a-z0-9._-]{0,79}$/
const iso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const inWindow = (from: string, to: string | null, at: string) => Date.parse(from) <= Date.parse(at) && (to === null || Date.parse(at) < Date.parse(to))
export function scopeKey(scope: GovernanceScopeV1) { return scope.kind === 'global' ? 'global' : `${scope.kind}:${scope.value}` }
export function scopeMatches(assignment: GovernanceScopeV1, requested: GovernanceScopeV1) {
  if (assignment.kind === 'global') return true
  if (assignment.kind !== requested.kind) return false
  return assignment.value === requested.value
}
export function isScopeValid(scope: unknown): scope is GovernanceScopeV1 {
  return !!scope && typeof scope === 'object' && ((scope as { kind?: string }).kind === 'global'
    || ['workspace', 'department', 'project', 'product'].includes((scope as { kind?: string }).kind ?? '')
      && typeof (scope as { value?: unknown }).value === 'string'
      && (scope as { value: string }).value.trim().length > 0)
}

export function validatePolicyData(data: GovernancePolicyDataV1, source?: GovernanceOrgSource, at = new Date().toISOString()): GovernanceValidationIssue[] {
  const issues: GovernanceValidationIssue[] = []
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message })
  const ids = <T extends { id: string }>(items: T[], path: string) => {
    const seen = new Set<string>(); items.forEach((item, index) => { if (!item.id || seen.has(item.id)) issue('DUPLICATE_ID', `${path}[${index}].id`, 'id 必須唯一'); seen.add(item.id) })
  }
  ids(data.applications, 'applications'); ids(data.identityLinks, 'identityLinks'); ids(data.applicationRoles, 'applicationRoles'); ids(data.permissions, 'permissions'); ids(data.rolePermissionGrants, 'rolePermissionGrants'); ids(data.roleAssignments, 'roleAssignments'); ids(data.delegations, 'delegations'); ids(data.approvalPolicies, 'approvalPolicies')
  const appIds = new Set(data.applications.filter((v) => v.status === 'active').map((v) => v.id))
  const employeeIds = new Set(source?.state.employees.map((v) => v.id) ?? [])
  const roleIds = new Set(data.applicationRoles.map((v) => v.id)); const permissionIds = new Set(data.permissions.map((v) => v.id))
  const orgRoleIds = new Set(source?.state.roles.map((v) => v.id) ?? [])
  const identityKeys = new Set<string>(); const identityEmployees = new Set<string>()
  data.identityLinks.forEach((link, index) => {
    if (!link.issuer?.trim() || link.issuer.length > 255 || !link.subject?.trim() || link.subject.length > 255) issue('IDENTITY_INVALID', `identityLinks[${index}]`, 'issuer／subject 必須為 1–255 字元')
    if (source && !employeeIds.has(link.employeeId)) issue('EMPLOYEE_NOT_FOUND', `identityLinks[${index}].employeeId`, 'employee 不存在')
    if (link.status === 'active') {
      const key = `${link.issuer}\0${link.subject}`; if (identityKeys.has(key)) issue('IDENTITY_CONFLICT', `identityLinks[${index}]`, 'active issuer + subject 重複'); identityKeys.add(key)
      const employeeKey = `${link.issuer}\0${link.employeeId}`; if (identityEmployees.has(employeeKey)) issue('IDENTITY_CONFLICT', `identityLinks[${index}]`, 'active issuer + employee 重複'); identityEmployees.add(employeeKey)
    }
    if (!iso(link.validFrom) || (link.validTo !== null && !iso(link.validTo)) || (link.validTo !== null && Date.parse(link.validFrom) >= Date.parse(link.validTo))) issue('EFFECTIVE_PERIOD_INVALID', `identityLinks[${index}]`, '有效期間無效')
  })
  const appRoleCodes = new Set<string>(); data.applicationRoles.forEach((role, index) => { if (!appIds.has(role.applicationId)) issue('APPLICATION_NOT_FOUND', `applicationRoles[${index}]`, 'application 不存在'); if (!CODE.test(role.code)) issue('CODE_INVALID', `applicationRoles[${index}].code`, 'code 格式無效'); const key = `${role.applicationId}:${role.code}`; if (appRoleCodes.has(key)) issue('DUPLICATE_CODE', `applicationRoles[${index}].code`, '同 application code 重複'); appRoleCodes.add(key) })
  const permissionCodes = new Set<string>(); data.permissions.forEach((permission, index) => { if (!appIds.has(permission.applicationId)) issue('APPLICATION_NOT_FOUND', `permissions[${index}]`, 'application 不存在'); if (!CODE.test(permission.code)) issue('CODE_INVALID', `permissions[${index}].code`, 'code 格式無效'); const key = `${permission.applicationId}:${permission.kind}:${permission.code}`; if (permissionCodes.has(key)) issue('DUPLICATE_CODE', `permissions[${index}].code`, '同 application／kind code 重複'); permissionCodes.add(key) })
  data.rolePermissionGrants.forEach((grant, index) => { if (!roleIds.has(grant.roleId)) issue('REFERENCE_NOT_FOUND', `rolePermissionGrants[${index}].roleId`, 'role 不存在'); if (!permissionIds.has(grant.permissionId)) issue('REFERENCE_NOT_FOUND', `rolePermissionGrants[${index}].permissionId`, 'permission 不存在') })
  data.roleAssignments.forEach((assignment, index) => { if (source && !employeeIds.has(assignment.employeeId)) issue('EMPLOYEE_NOT_FOUND', `roleAssignments[${index}]`, 'employee 不存在'); if (!roleIds.has(assignment.roleId)) issue('REFERENCE_NOT_FOUND', `roleAssignments[${index}].roleId`, 'role 不存在'); if (!isScopeValid(assignment.scope)) issue('SCOPE_INVALID', `roleAssignments[${index}].scope`, 'scope 無效'); if (!iso(assignment.validFrom) || (assignment.validTo !== null && !iso(assignment.validTo)) || (assignment.validTo !== null && Date.parse(assignment.validFrom) >= Date.parse(assignment.validTo))) issue('EFFECTIVE_PERIOD_INVALID', `roleAssignments[${index}]`, '有效期間無效') })
  data.delegations.forEach((delegation, index) => { if (!appIds.has(delegation.applicationId)) issue('APPLICATION_NOT_FOUND', `delegations[${index}]`, 'application 不存在'); if (source && (!employeeIds.has(delegation.fromEmployeeId) || !employeeIds.has(delegation.toEmployeeId))) issue('EMPLOYEE_NOT_FOUND', `delegations[${index}]`, 'employee 不存在'); if (delegation.fromEmployeeId === delegation.toEmployeeId) issue('DELEGATION_SELF', `delegations[${index}]`, '代理人不可與來源相同'); delegation.permissionIds.forEach((id) => { if (!permissionIds.has(id)) issue('REFERENCE_NOT_FOUND', `delegations[${index}].permissionIds`, 'permission 不存在') }); if (!isScopeValid(delegation.scope) || !iso(delegation.validFrom) || !iso(delegation.validTo) || Date.parse(delegation.validFrom) >= Date.parse(delegation.validTo)) issue('DELEGATION_INVALID', `delegations[${index}]`, '代理設定無效') })
  const policies = data.approvalPolicies
  policies.forEach((policy, index) => { if (policy.applicationId !== 'ai-pdm') issue('APPLICATION_INVALID', `approvalPolicies[${index}]`, '審核政策只能屬於 AI-PDM'); if (!isScopeValid(policy.scope)) issue('SCOPE_INVALID', `approvalPolicies[${index}].scope`, 'scope 無效'); if (!Number.isInteger(policy.quorum) || policy.quorum < 1 || policy.quorum > 9) issue('QUORUM_INVALID', `approvalPolicies[${index}].quorum`, 'quorum 必須為 1–9'); if (policy.sequence !== 'parallel' || policy.selfApproval !== 'deny' || policy.unresolvedBehavior !== 'deny') issue('POLICY_MODE_UNSUPPORTED', `approvalPolicies[${index}]`, 'MVP 僅支援 parallel／deny'); if (!iso(policy.validFrom) || (policy.validTo !== null && !iso(policy.validTo)) || (policy.validTo !== null && Date.parse(policy.validFrom) >= Date.parse(policy.validTo))) issue('EFFECTIVE_PERIOD_INVALID', `approvalPolicies[${index}]`, '有效期間無效'); policy.reviewerSelectors.forEach((selector, selectorIndex) => { if (selector.kind === 'application_role' && !roleIds.has(selector.roleId)) issue('REFERENCE_NOT_FOUND', `approvalPolicies[${index}].reviewerSelectors[${selectorIndex}]`, 'role 不存在'); if (selector.kind === 'organization_role' && source && !orgRoleIds.has(selector.organizationRoleId)) issue('REFERENCE_NOT_FOUND', `approvalPolicies[${index}].reviewerSelectors[${selectorIndex}]`, 'organization role 不存在'); if (selector.kind === 'employee' && source && !employeeIds.has(selector.employeeId)) issue('EMPLOYEE_NOT_FOUND', `approvalPolicies[${index}].reviewerSelectors[${selectorIndex}]`, 'employee 不存在') }) })
  for (let i = 0; i < policies.length; i += 1) for (let j = i + 1; j < policies.length; j += 1) { const a = policies[i]; const b = policies[j]; if (a.status === 'active' && b.status === 'active' && a.actionCode === b.actionCode && scopeKey(a.scope) === scopeKey(b.scope) && overlaps(a.validFrom, a.validTo, b.validFrom, b.validTo)) issue('POLICY_OVERLAP', `approvalPolicies[${j}]`, '同 action／scope 有效期間重疊') }
  if (source) { const positionIds = new Set(source.state.positions.map((v) => v.id)); data.roleAssignments.forEach((a, i) => { if (!employeeIds.has(a.employeeId)) issue('EMPLOYEE_NOT_FOUND', `roleAssignments[${i}]`, 'employee 不存在') }); source.state.assignments.forEach((a) => { if (!positionIds.has(a.positionId)) issue('ORGANIZATION_INVALID', 'organization', 'assignment position 不存在') }) }
  return issues
}
export function overlaps(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null) { return Date.parse(aFrom) < (bTo ? Date.parse(bTo) : Infinity) && Date.parse(bFrom) < (aTo ? Date.parse(aTo) : Infinity) }
export function validateDocument(document: GovernanceDocumentV1, source?: GovernanceOrgSource): GovernanceValidationIssue[] {
  const issues = validatePolicyData(document.draft, source)
  if (document.app !== 'OrgMaster' || document.schemaVersion !== 1) issues.push({ code: 'SCHEMA_UNSUPPORTED', path: '', message: 'schemaVersion 必須為 1' })
  if (document.activePolicyVersionId && !document.publishedVersions.some((v) => v.id === document.activePolicyVersionId)) issues.push({ code: 'ACTIVE_VERSION_NOT_FOUND', path: 'activePolicyVersionId', message: 'active version 不存在' })
  return issues
}
export function assertValidDocument(document: GovernanceDocumentV1, source?: GovernanceOrgSource) { const issues = validateDocument(document, source); if (issues.length) throw new GovernanceValidationError(issues); return document }
export function buildOrganizationSnapshot(source: GovernanceOrgSource, capturedAt = new Date().toISOString()) {
  return { workspaceVersionId: source.workspaceVersionId, workspaceRevision: source.workspaceRevision, capturedAt, employees: source.state.employees.map((v) => ({ id: v.id, primaryAssignmentId: v.primaryAssignmentId })), departments: source.state.departments.map((v) => ({ id: v.id, parentId: v.parentId })), organizationRoles: source.state.roles.map((v) => ({ id: v.id })), positions: source.state.positions.map(({ id, roleId, departmentId, parentPositionId, status }) => ({ id, roleId, departmentId, parentPositionId, status })), assignments: source.state.assignments.map(({ id, employeeId, positionId, assignmentType, validFrom, validTo }) => ({ id, employeeId, positionId, assignmentType, validFrom, validTo })) }
}
export function isActiveAt(status: string, from: string, to: string | null, at: string) { return status === 'active' && iso(from) && inWindow(from, to, at) }

export function validatePolicyDataV2(data: GovernancePolicyDataV2, source?: GovernanceOrgSource, catalogs: ExternalRoleCatalogSnapshotV1[] = [], at = new Date().toISOString()): GovernanceValidationIssue[] {
  const issues: GovernanceValidationIssue[] = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  const ids = <T extends { id: string }>(items: T[], path: string) => { const seen = new Set<string>(); items.forEach((item, index) => { if (!item.id || seen.has(item.id)) add('DUPLICATE_ID', `${path}[${index}].id`, 'id 必須唯一'); seen.add(item.id) }) }
  ids(data.applications, 'applications'); ids(data.identityLinks, 'identityLinks'); ids(data.applicationRoles, 'applicationRoles'); ids(data.permissions, 'permissions'); ids(data.rolePermissionGrants, 'rolePermissionGrants'); ids(data.roleAssignments, 'roleAssignments'); ids(data.roleDelegations, 'roleDelegations')
  const appIds = new Set(data.applications.filter((v) => v.status === 'active').map((v) => v.id)); const employeeIds = new Set(source?.state.employees.map((v) => v.id) ?? []); const roles = new Map(data.applicationRoles.map((role) => [role.id, role])); const permissions = new Map(data.permissions.map((permission) => [permission.id, permission])); const catalogByApp = new Map(catalogs.map((catalog) => [catalog.applicationId, catalog]))
  for (const catalog of catalogs) { if (catalog.validationState === 'stale') add('EXTERNAL_CATALOG_STALE', `catalogs.${catalog.applicationId}`, '外部 catalog 已過期'); if (catalog.validationState === 'invalid') add('EXTERNAL_CATALOG_INVALID', `catalogs.${catalog.applicationId}`, '外部 catalog 驗證失敗'); if (catalog.validationState === 'unavailable') add('EXTERNAL_CATALOG_UNAVAILABLE', `catalogs.${catalog.applicationId}`, '外部 catalog 暫時無法取得') }
  for (const [index, role] of data.applicationRoles.entries()) { if (role.applicationId !== 'orgmaster') add('EXTERNAL_CATALOG_READ_ONLY', `applicationRoles[${index}]`, '外部 application role 只能由外部系統定義'); if (!appIds.has(role.applicationId)) add('APPLICATION_NOT_FOUND', `applicationRoles[${index}]`, 'application 不存在') }
  for (const [index, permission] of data.permissions.entries()) { if (permission.applicationId !== 'orgmaster') add('EXTERNAL_CATALOG_READ_ONLY', `permissions[${index}]`, '外部 permission 只能由外部系統定義'); if (!appIds.has(permission.applicationId)) add('APPLICATION_NOT_FOUND', `permissions[${index}]`, 'application 不存在') }
  for (const [index, grant] of data.rolePermissionGrants.entries()) { const role = roles.get(grant.roleId); const permission = permissions.get(grant.permissionId); if (!role || !permission) add('REFERENCE_NOT_FOUND', `rolePermissionGrants[${index}]`, 'role／permission 不存在'); else if (role.applicationId !== 'orgmaster' || permission.applicationId !== 'orgmaster') add('EXTERNAL_CATALOG_READ_ONLY', `rolePermissionGrants[${index}]`, '外部 role permission mapping 只讀') }
  for (const [index, link] of data.identityLinks.entries()) { if (source && !employeeIds.has(link.employeeId)) add('EMPLOYEE_NOT_FOUND', `identityLinks[${index}].employeeId`, 'employee 不存在'); if (!iso(link.validFrom) || (link.validTo !== null && !iso(link.validTo)) || (link.validTo !== null && Date.parse(link.validFrom) >= Date.parse(link.validTo))) add('EFFECTIVE_PERIOD_INVALID', `identityLinks[${index}]`, '有效期間無效') }
  const activeAssignments = new Map<string, GovernanceRoleAssignmentV2>()
  for (const [index, assignment] of data.roleAssignments.entries()) {
    const role = roles.get(assignment.roleId); const catalog = assignment.applicationId === 'ai-pdm' ? catalogByApp.get('ai-pdm') : undefined; const catalogRole = catalog?.roles.find((entry) => entry.stableRoleId === assignment.roleId)
    if (source && !employeeIds.has(assignment.employeeId)) add('EMPLOYEE_NOT_FOUND', `roleAssignments[${index}].employeeId`, 'employee 不存在')
    if (!role && assignment.applicationId === 'orgmaster') add('REFERENCE_NOT_FOUND', `roleAssignments[${index}].roleId`, 'OrgMaster role 不存在')
    if (!isScopeValid(assignment.scope)) add('SCOPE_INVALID', `roleAssignments[${index}].scope`, 'scope 無效')
    if (!iso(assignment.validFrom) || (assignment.validTo !== null && !iso(assignment.validTo)) || (assignment.validTo !== null && Date.parse(assignment.validFrom) >= Date.parse(assignment.validTo))) add('EFFECTIVE_PERIOD_INVALID', `roleAssignments[${index}]`, '有效期間無效')
    if (assignment.applicationId === 'orgmaster') { if (!role || role.applicationId !== 'orgmaster' || assignment.catalogVersion !== null || assignment.effectState !== 'orgmaster-enforced' || assignment.roleCodeSnapshot !== role.code || assignment.roleNameSnapshot !== role.name) add('INTERNAL_ASSIGNMENT_INVALID', `roleAssignments[${index}]`, 'OrgMaster assignment snapshot 無效') }
    if (assignment.applicationId === 'ai-pdm') { if (!catalog || validateExternalRoleCatalog(catalog).length) add('EXTERNAL_CATALOG_INVALID', `roleAssignments[${index}]`, '外部 catalog 無效'); if (!catalogRole) add('EXTERNAL_ROLE_UNKNOWN', `roleAssignments[${index}].roleId`, '外部 role 不存在'); else { if (catalogRole.status !== 'active') add('EXTERNAL_ROLE_INACTIVE', `roleAssignments[${index}].roleId`, '外部 role 已停用'); if (!catalogRole.assignable) add('EXTERNAL_ROLE_UNASSIGNABLE', `roleAssignments[${index}].roleId`, '外部 role 不可指派'); if (!catalogRole.allowedScopeKinds.includes(assignment.scope.kind)) add('EXTERNAL_SCOPE_UNSUPPORTED', `roleAssignments[${index}].scope`, '外部 role 不允許此 scope'); if (assignment.catalogVersion !== catalog?.catalogVersion || assignment.effectState !== 'not-synchronized' || assignment.roleCodeSnapshot !== catalogRole.code || assignment.roleNameSnapshot !== catalogRole.displayName) add('EXTERNAL_ASSIGNMENT_SNAPSHOT_INVALID', `roleAssignments[${index}]`, '外部 role snapshot 與 catalog 不一致') } }
    if (assignment.status === 'active') { const key = `${assignment.employeeId}|${assignment.applicationId}|${assignment.roleId}|${scopeKey(assignment.scope)}`; if (activeAssignments.has(key)) add('DUPLICATE_ACTIVE_ASSIGNMENT', `roleAssignments[${index}]`, '同一員工／角色／scope 只能有一筆 active assignment'); activeAssignments.set(key, assignment) }
  }
  for (const [index, delegation] of data.roleDelegations.entries()) {
    const sourceAssignment = data.roleAssignments.find((assignment) => assignment.id === delegation.sourceAssignmentId); const delegateSource = sourceAssignment?.applicationId === 'ai-pdm' ? sourceAssignment : undefined; const catalog = catalogByApp.get('ai-pdm'); const catalogRole = catalog?.roles.find((entry) => entry.stableRoleId === delegation.roleId)
    if (!sourceAssignment || !delegateSource || sourceAssignment.status !== 'active') add('ROLE_DELEGATION_INVALID', `roleDelegations[${index}].sourceAssignmentId`, '代理來源 assignment 無效')
    if (delegation.fromEmployeeId === delegation.toEmployeeId) add('DELEGATION_SELF', `roleDelegations[${index}]`, '代理人不可與來源相同')
    if (source && (!employeeIds.has(delegation.fromEmployeeId) || !employeeIds.has(delegation.toEmployeeId))) add('EMPLOYEE_NOT_FOUND', `roleDelegations[${index}]`, 'employee 不存在')
    if (!catalog || !catalogRole || delegation.catalogVersion !== catalog.catalogVersion) add('ROLE_DELEGATION_INVALID', `roleDelegations[${index}]`, '代理 catalog role 無效')
    if (delegateSource && (delegation.fromEmployeeId !== delegateSource.employeeId || delegation.applicationId !== delegateSource.applicationId || delegation.roleId !== delegateSource.roleId || delegation.catalogVersion !== delegateSource.catalogVersion || scopeKey(delegation.scope) !== scopeKey(delegateSource.scope) || delegation.effectState !== 'not-synchronized')) add('ROLE_DELEGATION_INVALID', `roleDelegations[${index}]`, '代理必須完整繼承來源 assignment')
    if (!iso(delegation.validFrom) || !iso(delegation.validTo) || Date.parse(delegation.validFrom) >= Date.parse(delegation.validTo) || (delegateSource && (Date.parse(delegation.validFrom) < Date.parse(delegateSource.validFrom) || (delegateSource.validTo !== null && Date.parse(delegation.validTo) > Date.parse(delegateSource.validTo))))) add('ROLE_DELEGATION_INVALID', `roleDelegations[${index}]`, '代理期間不可超出來源 assignment')
  }
  return issues
}

export function validateDocumentV2(document: GovernanceDocumentV2, source?: GovernanceOrgSource, catalogs: ExternalRoleCatalogSnapshotV1[] = []): GovernanceValidationIssue[] {
  const issues = validatePolicyDataV2(document.draft, source, catalogs)
  if (document.app !== 'OrgMaster' || document.schemaVersion !== 2) issues.push({ code: 'SCHEMA_UNSUPPORTED', path: '', message: 'schemaVersion 必須為 2' })
  if (document.activePolicyVersionId && !document.publishedVersions.some((version) => version.id === document.activePolicyVersionId)) issues.push({ code: 'ACTIVE_VERSION_NOT_FOUND', path: 'activePolicyVersionId', message: 'active version 不存在' })
  for (const catalog of catalogs) issues.push(...validateExternalRoleCatalog(catalog))
  return issues
}
