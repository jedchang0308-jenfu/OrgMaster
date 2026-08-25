import { getActiveAssignments } from './assignments'
import type {
  Assignment,
  Position,
  PositionRiskVisualState,
  Role,
  RoleCombinationRiskLevel,
  RoleCombinationRiskMatch,
  RoleCombinationRiskRule,
  RoleRiskVisualRelation,
} from './types'

export type RoleCombinationRiskRuleValidationCode =
  | 'INVALID_RISK_RULE_SHAPE'
  | 'DUPLICATE_RISK_RULE_ID'
  | 'RISK_RULE_SELF_PAIR'
  | 'RISK_RULE_DUPLICATE_PAIR'
  | 'RISK_RULE_UNKNOWN_ROLE'
  | 'RISK_RULE_INVALID_LEVEL'

export type RoleCombinationRiskRuleValidationResult =
  | { ok: true }
  | { ok: false; code: RoleCombinationRiskRuleValidationCode; ruleIds: string[] }

export type RoleCombinationRiskRuleMutationResult =
  | { ok: true; rules: RoleCombinationRiskRule[] }
  | { ok: false; code: RoleCombinationRiskRuleValidationCode; ruleIds: string[] }

export interface RoleCombinationRiskInput {
  rules: RoleCombinationRiskRule[]
  roles: Role[]
  positions: Position[]
  assignments: Assignment[]
  asOf: string
}

const LEVEL_PRIORITY: Record<RoleCombinationRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRiskLevel(value: unknown): value is RoleCombinationRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high'
}

function validationFailure(
  code: RoleCombinationRiskRuleValidationCode,
  ruleIds: string[],
): RoleCombinationRiskRuleValidationResult {
  return { ok: false, code, ruleIds: [...new Set(ruleIds)].sort() }
}

export function canonicalRolePairKey(roleAId: string, roleBId: string): string {
  return [roleAId, roleBId].sort().join('::')
}

function canonicalPositionPair(positionAId: string, positionBId: string): readonly [string, string] {
  return [positionAId, positionBId].sort() as [string, string]
}

export function validateRoleCombinationRiskRules(
  rules: unknown,
  roles: Role[],
): RoleCombinationRiskRuleValidationResult {
  if (!Array.isArray(rules)) return validationFailure('INVALID_RISK_RULE_SHAPE', [])

  const roleIds = new Set(roles.map((role) => role.id))
  const idOwner = new Map<string, string[]>()
  const pairOwner = new Map<string, string[]>()

  for (const value of rules) {
    if (!isRecord(value)) return validationFailure('INVALID_RISK_RULE_SHAPE', [])
    const id = typeof value.id === 'string' ? value.id : ''
    const roleAId = typeof value.roleAId === 'string' ? value.roleAId : ''
    const roleBId = typeof value.roleBId === 'string' ? value.roleBId : ''
    if (!id || !roleAId || !roleBId || typeof value.enabled !== 'boolean') {
      return validationFailure('INVALID_RISK_RULE_SHAPE', id ? [id] : [])
    }
    if (!isRiskLevel(value.level)) return validationFailure('RISK_RULE_INVALID_LEVEL', [id])
    if (roleAId === roleBId) return validationFailure('RISK_RULE_SELF_PAIR', [id])
    if (!roleIds.has(roleAId) || !roleIds.has(roleBId)) {
      return validationFailure('RISK_RULE_UNKNOWN_ROLE', [id])
    }

    const ids = idOwner.get(id) ?? []
    ids.push(id)
    idOwner.set(id, ids)

    const pairKey = canonicalRolePairKey(roleAId, roleBId)
    const pairRuleIds = pairOwner.get(pairKey) ?? []
    pairRuleIds.push(id)
    pairOwner.set(pairKey, pairRuleIds)
  }

  const duplicateIds = [...idOwner.entries()]
    .filter(([, ids]) => ids.length > 1)
    .flatMap(([id]) => [id])
  if (duplicateIds.length) return validationFailure('DUPLICATE_RISK_RULE_ID', duplicateIds)

  const duplicatePairs = [...pairOwner.values()].filter((ids) => ids.length > 1).flat()
  if (duplicatePairs.length) return validationFailure('RISK_RULE_DUPLICATE_PAIR', duplicatePairs)

  return { ok: true }
}

export function upsertRoleCombinationRiskRule(
  rules: RoleCombinationRiskRule[],
  roles: Role[],
  candidate: RoleCombinationRiskRule,
): RoleCombinationRiskRuleMutationResult {
  const existingIndex = rules.findIndex((rule) => rule.id === candidate.id)
  const normalizedCandidate = { ...candidate, reason: candidate.reason.trim() }
  const next = existingIndex === -1
    ? [...rules, normalizedCandidate]
    : rules.map((rule, index) => index === existingIndex ? { ...normalizedCandidate, id: rule.id } : rule)
  const validation = validateRoleCombinationRiskRules(next, roles)
  return validation.ok ? { ok: true, rules: next } : validation
}

export function removeRoleCombinationRiskRule(
  rules: RoleCombinationRiskRule[],
  ruleId: string,
): RoleCombinationRiskRule[] {
  if (!rules.some((rule) => rule.id === ruleId)) return rules
  return rules.filter((rule) => rule.id !== ruleId)
}

export function setRoleCombinationRiskRuleEnabled(
  rules: RoleCombinationRiskRule[],
  ruleId: string,
  enabled: boolean,
): RoleCombinationRiskRule[] {
  const rule = rules.find((candidate) => candidate.id === ruleId)
  if (!rule || rule.enabled === enabled) return rules
  return rules.map((candidate) => candidate.id === ruleId ? { ...candidate, enabled } : candidate)
}

export function deriveRoleCombinationRiskMatches({
  rules,
  roles,
  positions,
  assignments,
  asOf,
}: RoleCombinationRiskInput): RoleCombinationRiskMatch[] {
  const validation = validateRoleCombinationRiskRules(rules, roles)
  if (!validation.ok) return []

  const enabledRuleByPair = new Map(
    rules
      .filter((rule) => rule.enabled)
      .map((rule) => [canonicalRolePairKey(rule.roleAId, rule.roleBId), rule]),
  )
  if (enabledRuleByPair.size === 0) return []

  const validRoleIds = new Set(roles.map((role) => role.id))
  const activePositionById = new Map(
    positions
      .filter((position) => position.status === 'active' && validRoleIds.has(position.roleId))
      .map((position) => [position.id, position]),
  )
  const positionsByEmployee = new Map<string, Map<string, Position>>()
  for (const assignment of getActiveAssignments(assignments, asOf)) {
    const position = activePositionById.get(assignment.positionId)
    if (!position) continue
    const employeePositions = positionsByEmployee.get(assignment.employeeId) ?? new Map<string, Position>()
    employeePositions.set(position.id, position)
    positionsByEmployee.set(assignment.employeeId, employeePositions)
  }

  const matches = new Map<string, RoleCombinationRiskMatch>()
  for (const [employeeId, positionMap] of positionsByEmployee) {
    const employeePositions = [...positionMap.values()].sort((a, b) => a.id.localeCompare(b.id))
    for (let firstIndex = 0; firstIndex < employeePositions.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < employeePositions.length; secondIndex += 1) {
        const first = employeePositions[firstIndex]
        const second = employeePositions[secondIndex]
        if (first.roleId === second.roleId) continue
        const rule = enabledRuleByPair.get(canonicalRolePairKey(first.roleId, second.roleId))
        if (!rule) continue
        const positionIds = canonicalPositionPair(first.id, second.id)
        const key = `${employeeId}::${rule.id}::${positionIds[0]}::${positionIds[1]}`
        matches.set(key, { ruleId: rule.id, employeeId, positionIds, level: rule.level })
      }
    }
  }

  return [...matches.values()].sort((first, second) => (
    first.positionIds[0].localeCompare(second.positionIds[0])
    || first.positionIds[1].localeCompare(second.positionIds[1])
    || first.ruleId.localeCompare(second.ruleId)
    || first.employeeId.localeCompare(second.employeeId)
  ))
}

export function buildPositionRiskVisualStates(
  matches: RoleCombinationRiskMatch[],
): PositionRiskVisualState[] {
  const states = new Map<string, { level: RoleCombinationRiskLevel; counterparts: Set<string> }>()
  for (const match of matches) {
    const [first, second] = match.positionIds
    for (const [positionId, counterpartId] of [[first, second], [second, first]] as const) {
      const current = states.get(positionId)
      if (!current) {
        states.set(positionId, { level: match.level, counterparts: new Set([counterpartId]) })
        continue
      }
      if (LEVEL_PRIORITY[match.level] > LEVEL_PRIORITY[current.level]) current.level = match.level
      current.counterparts.add(counterpartId)
    }
  }

  return [...states.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([positionId, state]) => ({
      positionId,
      level: state.level,
      counterpartPositionIds: [...state.counterparts].sort(),
    }))
}

export function selectVisibleRoleRiskRelations(
  matches: RoleCombinationRiskMatch[],
  focusedPositionId: string | null,
  visiblePositionIds: ReadonlySet<string>,
): RoleRiskVisualRelation[] {
  if (!focusedPositionId || !visiblePositionIds.has(focusedPositionId)) return []
  const relations = new Map<string, RoleRiskVisualRelation>()
  for (const match of matches) {
    if (!match.positionIds.includes(focusedPositionId)) continue
    if (!match.positionIds.every((positionId) => visiblePositionIds.has(positionId))) continue
    const id = `role-risk-relation::${match.positionIds[0]}::${match.positionIds[1]}`
    const current = relations.get(id)
    if (!current || LEVEL_PRIORITY[match.level] > LEVEL_PRIORITY[current.level]) {
      relations.set(id, { id, positionIds: match.positionIds, level: match.level })
    }
  }
  return [...relations.values()].sort((first, second) => first.id.localeCompare(second.id))
}
