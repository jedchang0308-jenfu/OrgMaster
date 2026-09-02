import { createHash } from 'node:crypto'
import type { ExternalRoleCatalogRoleV1, GovernanceOrganizationSnapshotV1, PositionRolePolicyV1, PositionRoleRecommendationStateV1, RecommendationDecisionV1 } from './types'

export type PositionRoleRecommendationV1 = {
  recommendationId: string
  employeeId: string
  applicationId: 'ai-pdm'
  stableRoleId: string
  roleCode: string
  roleName: string
  catalogVersion: string
  state: PositionRoleRecommendationStateV1
  scope: { kind: 'workspace' | 'project'; value: string }
  sourcePositionIds: string[]
  sourcePositionAssignmentIds: string[]
  policyId: string
  policyVersion: number
  reason: string
}

type RecommendationCatalogRole = ExternalRoleCatalogRoleV1 & {
  recommendationAllowed?: boolean
  roleDefinitionHash?: string
}

type RecommendationInput = {
  employeeId: string
  organization: GovernanceOrganizationSnapshotV1
  policies: PositionRolePolicyV1[]
  catalog: {
    catalogVersion: string
    roles: RecommendationCatalogRole[]
  }
  workspaceKey: string
  existingRoleAssignments?: Array<{ employeeId: string; roleId: string; scope: { kind: string; value?: string } }>
  decisions?: RecommendationDecisionV1[]
  organizationVersionId?: string
  organizationRevision?: string
  now?: string
}

function hash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isActive(validFrom: string, validTo: string | null, now: string) {
  const at = Date.parse(now)
  return Date.parse(validFrom) <= at && (validTo === null || at < Date.parse(validTo))
}

function policyScope(policy: PositionRolePolicyV1, workspaceKey: string) {
  if (policy.defaultScopeSource === 'jenfu_workspace') return { kind: 'workspace' as const, value: workspaceKey }
  if (!policy.fixedScopeKey?.trim()) return null
  return { kind: 'project' as const, value: policy.fixedScopeKey }
}

export function buildPositionRoleRecommendations(input: RecommendationInput): PositionRoleRecommendationV1[] {
  const now = input.now ?? new Date().toISOString()
  const activeAssignments = input.organization.assignments.filter((assignment) => assignment.employeeId === input.employeeId && isActive(assignment.validFrom, assignment.validTo, now))
  const activePositionIds = new Set(input.organization.positions.filter((position) => position.status === 'active').map((position) => position.id))
  const employeePositionAssignments = activeAssignments.filter((assignment) => activePositionIds.has(assignment.positionId))
  const byRoleAndScope = new Map<string, PositionRoleRecommendationV1[]>()

  for (const policy of input.policies.filter((candidate) => candidate.applicationId === 'ai-pdm' && candidate.status === 'active')) {
    const matchingAssignments = employeePositionAssignments.filter((assignment) => assignment.positionId === policy.positionId)
    if (!matchingAssignments.length) continue
    const role = input.catalog.roles.find((candidate) => candidate.stableRoleId === policy.stableRoleId)
    if (!role || role.status !== 'active' || role.assignable === false || role.recommendationAllowed === false) continue
    const scope = policyScope(policy, input.workspaceKey)
    if (!scope || !role.allowedScopeKinds.includes(scope.kind)) continue
    const sourcePositionIds = [...new Set(matchingAssignments.map((assignment) => assignment.positionId))].sort()
    const sourcePositionAssignmentIds = [...new Set(matchingAssignments.map((assignment) => assignment.id))].sort()
    if (!role.roleDefinitionHash?.trim()) continue
    const recommendationId = hash([
      'ai-pdm', input.employeeId, sourcePositionAssignmentIds.join(','), policy.id,
      policy.version, role.stableRoleId, `${scope.kind}:${scope.value}`,
      input.catalog.catalogVersion, role.roleDefinitionHash,
    ].join('|'))
    const existing = input.existingRoleAssignments?.some((assignment) => assignment.employeeId === input.employeeId && assignment.roleId === role.stableRoleId && assignment.scope.kind === scope.kind && assignment.scope.value === scope.value)
    const decision = input.decisions?.find((candidate) => candidate.recommendationId === recommendationId)
    const recommendation: PositionRoleRecommendationV1 = {
      recommendationId,
      employeeId: input.employeeId,
      applicationId: 'ai-pdm',
      stableRoleId: role.stableRoleId,
      roleCode: role.code,
      roleName: role.displayName,
      catalogVersion: input.catalog.catalogVersion,
      state: decision?.decision === 'dismissed' ? 'dismissed' : existing ? 'already_assigned' : 'ready',
      scope,
      sourcePositionIds,
      sourcePositionAssignmentIds,
      policyId: policy.id,
      policyVersion: policy.version,
      reason: 'active Position assignment matched active Position-to-Role policy',
    }
    const key = `${role.stableRoleId}|${scope.kind}|${scope.value}`
    const list = byRoleAndScope.get(key) ?? []
    list.push(recommendation)
    byRoleAndScope.set(key, list)
  }

  const byRole = new Map<string, PositionRoleRecommendationV1[]>()
  for (const recommendation of [...byRoleAndScope.values()].flat()) {
    const key = recommendation.stableRoleId
    const list = byRole.get(key) ?? []
    list.push(recommendation)
    byRole.set(key, list)
  }
  for (const list of byRole.values()) {
    const scopeKeys = new Set(list.map((recommendation) => `${recommendation.scope.kind}:${recommendation.scope.value}`))
    if (scopeKeys.size > 1) for (const recommendation of list) recommendation.state = 'scope_conflict'
  }
  return [...byRoleAndScope.values()].flat().sort((a, b) => a.recommendationId.localeCompare(b.recommendationId))
}
