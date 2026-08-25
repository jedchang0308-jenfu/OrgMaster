import { randomUUID } from 'node:crypto'
import type { GovernanceDocumentV1, GovernancePolicyVersionV1, GovernanceApprovalPolicyV1, ReviewerResolutionRequestV1, ReviewerResolutionResultV1 } from './types'
import { isActiveAt, scopeMatches, scopeKey } from './validation'

type Options = { now?: string; receiptId?: string; timeSource?: ReviewerResolutionResultV1['timeSource'] }
function result(version: GovernancePolicyVersionV1 | null, request: ReviewerResolutionRequestV1, now: string, options: Options): ReviewerResolutionResultV1 { return { status: 'unresolved', reason: 'POLICY_DATA_INVALID', receiptId: options.receiptId ?? `receipt-${randomUUID()}`, policyVersionId: version?.id ?? null, policySnapshotHash: version?.snapshotHash ?? null, organizationVersionId: version?.organizationSnapshot.workspaceVersionId ?? null, organizationRevision: version?.organizationSnapshot.workspaceRevision ?? null, requestorPrincipalId: null, reviewerPrincipalIds: [], delegationIds: [], quorum: null, sequence: null, evaluatedAt: now, timeSource: options.timeSource ?? (request.asOf ? 'local-simulator' : 'server') } }
function findPolicy(policies: GovernanceApprovalPolicyV1[], request: ReviewerResolutionRequestV1, now: string) {
  const exact = policies.filter((p) => p.status === 'active' && p.applicationId === request.applicationId && p.actionCode === request.actionCode && scopeKey(p.scope) === scopeKey(request.scope) && isActiveAt(p.status, p.validFrom, p.validTo, now))
  if (exact.length > 1) return { conflict: true as const }
  if (exact.length === 1) return { policy: exact[0] }
  const global = policies.filter((p) => p.status === 'active' && p.applicationId === request.applicationId && p.actionCode === request.actionCode && p.scope.kind === 'global' && isActiveAt(p.status, p.validFrom, p.validTo, now))
  if (global.length > 1) return { conflict: true as const }; return { policy: global[0] }
}
export function resolveReviewers(document: GovernanceDocumentV1, request: ReviewerResolutionRequestV1, options: Options = {}): ReviewerResolutionResultV1 {
  const now = options.now ?? request.asOf ?? new Date().toISOString(); const version = document.activePolicyVersionId ? document.publishedVersions.find((v) => v.id === document.activePolicyVersionId) ?? null : null; const output = result(version, request, now, options)
  if (!version) return { ...output, reason: 'NO_ACTIVE_POLICY' }
  const requestorLink = version.policy.identityLinks.filter((v) => v.issuer === request.requestor.issuer && v.subject === request.requestor.subject)
  if (requestorLink.length !== 1) return { ...output, reason: requestorLink.length > 1 ? 'POLICY_DATA_INVALID' : 'REQUESTOR_NOT_LINKED' }
  const link = requestorLink[0]; output.requestorPrincipalId = link.principalId
  if (link.status !== 'active' || !isActiveAt(link.status, link.validFrom, link.validTo, now)) return { ...output, reason: 'REQUESTOR_NOT_LINKED' }
  const selected = findPolicy(version.policy.approvalPolicies, request, now)
  if ('conflict' in selected && selected.conflict) return { ...output, reason: 'POLICY_CONFLICT' }
  const policy = selected.policy
  if (!policy) return { ...output, reason: 'POLICY_NOT_FOUND' }
  output.quorum = policy.quorum; output.sequence = policy.sequence
  const snapshot = version.organizationSnapshot; const primaryByEmployee = new Map(snapshot.employees.map((v) => [v.id, v.primaryAssignmentId])); const assignmentsByEmployee = new Map<string, typeof snapshot.assignments>()
  for (const assignment of snapshot.assignments) { const current = assignmentsByEmployee.get(assignment.employeeId) ?? []; current.push(assignment); assignmentsByEmployee.set(assignment.employeeId, current) }
  const positionById = new Map(snapshot.positions.map((v) => [v.id, v])); const identityByEmployee = new Map<string, typeof version.policy.identityLinks[number]>()
  for (const candidate of version.policy.identityLinks) if (candidate.status === 'active' && isActiveAt(candidate.status, candidate.validFrom, candidate.validTo, now) && candidate.issuer === request.requestor.issuer) { if (identityByEmployee.has(candidate.employeeId)) return { ...output, reason: 'POLICY_DATA_INVALID' }; identityByEmployee.set(candidate.employeeId, candidate) }
  const employees = new Set<string>()
  for (const selector of policy.reviewerSelectors) {
    if (selector.kind === 'employee') employees.add(selector.employeeId)
    if (selector.kind === 'application_role') version.policy.roleAssignments.filter((a) => a.roleId === selector.roleId && version.policy.applicationRoles.some((role) => role.id === a.roleId && role.status === 'active') && a.status === 'active' && isActiveAt(a.status, a.validFrom, a.validTo, now) && scopeMatches(a.scope, request.scope)).forEach((a) => employees.add(a.employeeId))
    if (selector.kind === 'organization_role') snapshot.positions.filter((p) => p.roleId === selector.organizationRoleId && p.status === 'active').forEach((position) => assignmentsByEmployee.forEach((items, employeeId) => { if (items.some((a) => a.positionId === position.id && a.assignmentType === 'regular' && Date.parse(a.validFrom) <= Date.parse(now) && (!a.validTo || Date.parse(now) < Date.parse(a.validTo)))) employees.add(employeeId) }))
    if (selector.kind === 'direct_supervisor') {
      const primaryId = primaryByEmployee.get(link.employeeId); const primary = snapshot.assignments.find((a) => a.id === primaryId && a.assignmentType === 'regular'); const position = primary ? positionById.get(primary.positionId) : undefined
      if (!position) return { ...output, reason: 'NO_PRIMARY_ASSIGNMENT' }
      if (!position.parentPositionId) return { ...output, reason: 'SUPERVISOR_UNRESOLVED' }
      const supervisorPositionId = position.parentPositionId; assignmentsByEmployee.forEach((items, employeeId) => { if (items.some((a) => a.positionId === supervisorPositionId && a.assignmentType === 'regular' && Date.parse(a.validFrom) <= Date.parse(now) && (!a.validTo || Date.parse(now) < Date.parse(a.validTo)))) employees.add(employeeId) })
    }
  }
  const reviewerEmployees = [...employees].filter((id) => id !== link.employeeId && identityByEmployee.has(id)); const principalIds = reviewerEmployees.map((id) => identityByEmployee.get(id)!.principalId)
  const delegationIds: string[] = []
  for (const delegation of version.policy.delegations) {
    if (delegation.applicationId !== request.applicationId || delegation.status !== 'active' || !isActiveAt(delegation.status, delegation.validFrom, delegation.validTo, now) || !scopeMatches(delegation.scope, request.scope)) continue
    if (reviewerEmployees.includes(delegation.fromEmployeeId) && identityByEmployee.has(delegation.toEmployeeId)) { const delegateLink = identityByEmployee.get(delegation.toEmployeeId)!; if (!principalIds.includes(delegateLink.principalId)) { principalIds.push(delegateLink.principalId); delegationIds.push(delegation.id) } }
  }
  if (principalIds.length === 0) return { ...output, reason: employees.size ? 'NO_ELIGIBLE_REVIEWER' : 'NO_ELIGIBLE_REVIEWER' }
  if (principalIds.length < policy.quorum) return { ...output, reason: 'INSUFFICIENT_REVIEWERS', reviewerPrincipalIds: principalIds, delegationIds }
  return { ...output, status: 'resolved', reason: 'RESOLVED', reviewerPrincipalIds: principalIds, delegationIds }
}
