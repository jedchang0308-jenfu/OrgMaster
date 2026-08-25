import type { GovernanceDocumentV1, GovernanceOrgSource, GovernancePolicyDataV1, GovernancePolicyVersionV1, GovernanceScopeV1 } from './types'

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
