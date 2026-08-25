import { randomUUID } from 'node:crypto'
import type { GovernanceDocumentV1, GovernancePolicyVersionV1, PermissionEvaluationRequestV1, PermissionEvaluationResultV1 } from './types'
import { isActiveAt, scopeMatches } from './validation'

type Options = { now?: string; receiptId?: string; timeSource?: PermissionEvaluationResultV1['timeSource'] }
function base(version: GovernancePolicyVersionV1 | null, request: PermissionEvaluationRequestV1, now: string, options: Options): PermissionEvaluationResultV1 {
  return { status: 'denied', reason: 'POLICY_DATA_INVALID', receiptId: options.receiptId ?? `receipt-${randomUUID()}`, policyVersionId: version?.id ?? null, policySnapshotHash: version?.snapshotHash ?? null, organizationVersionId: version?.organizationSnapshot.workspaceVersionId ?? null, organizationRevision: version?.organizationSnapshot.workspaceRevision ?? null, principalId: null, matchedRoleIds: [], delegationId: null, evaluatedAt: now, timeSource: options.timeSource ?? (request.asOf ? 'local-simulator' : 'server') }
}
export function evaluatePermission(document: GovernanceDocumentV1, request: PermissionEvaluationRequestV1, options: Options = {}): PermissionEvaluationResultV1 {
  const now = options.now ?? request.asOf ?? new Date().toISOString(); const version = document.activePolicyVersionId ? document.publishedVersions.find((v) => v.id === document.activePolicyVersionId) ?? null : null; const result = base(version, request, now, options)
  if (!version) return { ...result, reason: 'NO_ACTIVE_POLICY' }
  const policy = version.policy; const permission = policy.permissions.find((v) => v.applicationId === request.applicationId && v.code === request.permissionCode)
  if (!permission || permission.status !== 'active') return { ...result, reason: 'PERMISSION_UNKNOWN' }
  const links = policy.identityLinks.filter((v) => v.issuer === request.issuer && v.subject === request.subject)
  if (links.length > 1) return { ...result, reason: 'PRINCIPAL_CONFLICT' }; const link = links[0]
  if (!link) return { ...result, reason: 'IDENTITY_NOT_LINKED' }
  if (link.status !== 'active' || !isActiveAt(link.status, link.validFrom, link.validTo, now)) return { ...result, reason: 'IDENTITY_INACTIVE', principalId: link.principalId }
  result.principalId = link.principalId
  if (!request.scope || request.scope.kind !== 'global' && !request.scope.value.trim()) return { ...result, reason: 'SCOPE_REQUIRED' }
  const activeRoleIds = new Set(policy.applicationRoles.filter((role) => role.applicationId === request.applicationId && role.status === 'active').map((role) => role.id))
  const roleIds = new Set(policy.roleAssignments.filter((a) => activeRoleIds.has(a.roleId) && a.employeeId === link.employeeId && a.status === 'active' && isActiveAt(a.status, a.validFrom, a.validTo, now) && scopeMatches(a.scope, request.scope)).map((a) => a.roleId))
  const grants = policy.rolePermissionGrants.filter((grant) => roleIds.has(grant.roleId) && grant.permissionId === permission.id)
  if (grants.some((grant) => grant.effect === 'deny')) return { ...result, reason: 'EXPLICIT_DENY', matchedRoleIds: [...roleIds] }
  if (grants.some((grant) => grant.effect === 'allow')) return { ...result, status: 'allowed', reason: 'ALLOWED_ROLE', matchedRoleIds: [...roleIds] }
  const delegations = policy.delegations.filter((d) => d.applicationId === request.applicationId && d.toEmployeeId === link.employeeId && d.permissionIds.includes(permission.id) && d.status === 'active' && isActiveAt(d.status, d.validFrom, d.validTo, now) && scopeMatches(d.scope, request.scope))
  for (const delegation of delegations) {
    const sourceRoleIds = new Set(policy.roleAssignments.filter((a) => activeRoleIds.has(a.roleId) && a.employeeId === delegation.fromEmployeeId && a.status === 'active' && isActiveAt(a.status, a.validFrom, a.validTo, now) && scopeMatches(a.scope, request.scope)).map((a) => a.roleId))
    const sourceGrants = policy.rolePermissionGrants.filter((grant) => sourceRoleIds.has(grant.roleId) && grant.permissionId === permission.id)
    if (sourceGrants.some((grant) => grant.effect === 'deny')) continue
    if (sourceGrants.some((grant) => grant.effect === 'allow')) return { ...result, status: 'allowed', reason: 'ALLOWED_DELEGATION', delegationId: delegation.id, matchedRoleIds: [...sourceRoleIds] }
  }
  return { ...result, reason: delegations.length ? 'DELEGATION_INVALID' : 'NO_MATCHING_ROLE' }
}
