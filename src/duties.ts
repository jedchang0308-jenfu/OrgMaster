import type {
  Duty,
  DutyPositionRelation,
  DutyRelationTarget,
  DutyRelationType,
  OrgDirectoryState,
  Position,
} from './types'

export type DutyValidationCode =
  | 'DUTY_ID_INVALID'
  | 'DUTY_ID_DUPLICATE'
  | 'DUTY_TITLE_REQUIRED'
  | 'DUTY_TITLE_TOO_LONG'
  | 'DUTY_TITLE_MULTILINE'
  | 'DUTY_DESCRIPTION_TOO_LONG'
  | 'DUTY_RELATION_ID_INVALID'
  | 'DUTY_RELATION_ID_DUPLICATE'
  | 'DUTY_RELATION_DUTY_MISSING'
  | 'DUTY_RELATION_TARGET_INVALID'
  | 'DUTY_RELATION_TARGET_INACTIVE'
  | 'DUTY_RELATION_DUPLICATE'
  | 'DUTY_RELATION_PRIMARY_INVALID'
  | 'DUTY_PRIMARY_EXECUTOR_DUPLICATE'
  | 'DUTY_RELATION_ORDER_INVALID'
  | 'DUTY_RELATION_PENDING_SNAPSHOT_INVALID'

export interface DutyValidationIssue {
  code: DutyValidationCode
  dutyIds: string[]
  relationIds: string[]
  positionIds: string[]
}

export type DutyValidationResult = { ok: true } | { ok: false; issue: DutyValidationIssue }

export type DutyAnomalyType = 'pending-reassignment' | 'missing-primary-executor' | 'no-executor'
export type DutyAnomalySeverity = 'high' | 'medium' | 'reminder'

export interface DutyAnomaly {
  id: string
  type: DutyAnomalyType
  severity: DutyAnomalySeverity
  dutyId: string
  relationId?: string
  resolvedByRelatedPlan?: boolean
}

export interface DutyAnomalySummary {
  anomalies: DutyAnomaly[]
  anomalyCount: number
  dutyCount: number
  highestSeverity: DutyAnomalySeverity | null
}

const SAFE_ID = /^[A-Za-z0-9-]{1,80}$/
const relationTypes: DutyRelationType[] = ['execute', 'review', 'collaborate', 'countersign']

function issue(code: DutyValidationCode, dutyIds: string[] = [], relationIds: string[] = [], positionIds: string[] = []): DutyValidationResult {
  return { ok: false, issue: { code, dutyIds, relationIds, positionIds } }
}

function isRelationType(value: unknown): value is DutyRelationType {
  return typeof value === 'string' && relationTypes.includes(value as DutyRelationType)
}

function isPendingTarget(target: DutyRelationTarget): target is Extract<DutyRelationTarget, { kind: 'pending-reassignment' }> {
  return target.kind === 'pending-reassignment'
}

function relationGroup(relation: DutyPositionRelation): string {
  if (relation.relationType === 'execute') return relation.isPrimaryExecutor ? 'primary-execute' : 'execute'
  return relation.relationType
}

export function normalizeDutyRelationOrders(relations: DutyPositionRelation[]): DutyPositionRelation[] {
  const groups = new Map<string, DutyPositionRelation[]>()
  for (const relation of relations) {
    if (relation.target.kind !== 'position') continue
    const key = `${relation.dutyId}:${relation.target.positionId}:${relationGroup(relation)}`
    const group = groups.get(key) ?? []
    group.push(relation)
    groups.set(key, group)
  }
  const orderById = new Map<string, number>()
  for (const group of groups.values()) {
    group.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    group.forEach((relation, index) => orderById.set(relation.id, index))
  }
  return relations.map((relation) => orderById.has(relation.id)
    ? { ...relation, order: relationGroup(relation) === 'primary-execute' ? 0 : orderById.get(relation.id)! }
    : relation)
}

export function normalizeDutyState(state: OrgDirectoryState): OrgDirectoryState {
  const duties = state.duties.map((duty) => ({
    ...duty,
    id: duty.id.trim(),
    title: duty.title.trim(),
    description: duty.description?.trim() || null,
  }))
  return { ...state, duties, dutyPositionRelations: normalizeDutyRelationOrders(state.dutyPositionRelations) }
}

export function validateDutyState(state: OrgDirectoryState): DutyValidationResult {
  const dutyIds = new Set<string>()
  for (const duty of state.duties) {
    if (!SAFE_ID.test(duty.id)) return issue('DUTY_ID_INVALID', [duty.id])
    if (dutyIds.has(duty.id)) return issue('DUTY_ID_DUPLICATE', [duty.id])
    dutyIds.add(duty.id)
    if (typeof duty.title !== 'string' || duty.title.trim().length === 0) return issue('DUTY_TITLE_REQUIRED', [duty.id])
    if (duty.title.length > 120) return issue('DUTY_TITLE_TOO_LONG', [duty.id])
    if (/\r|\n/.test(duty.title)) return issue('DUTY_TITLE_MULTILINE', [duty.id])
    if (duty.description !== null && duty.description.length > 2000) return issue('DUTY_DESCRIPTION_TOO_LONG', [duty.id])
  }

  const positionById = new Map(state.positions.map((position) => [position.id, position]))
  const relationIds = new Set<string>()
  const relationKeys = new Set<string>()
  const activePrimaryByDuty = new Map<string, string>()
  const denseGroups = new Map<string, number[]>()
  for (const relation of state.dutyPositionRelations) {
    if (!SAFE_ID.test(relation.id)) return issue('DUTY_RELATION_ID_INVALID', [relation.dutyId], [relation.id])
    if (relationIds.has(relation.id)) return issue('DUTY_RELATION_ID_DUPLICATE', [relation.dutyId], [relation.id])
    relationIds.add(relation.id)
    if (!dutyIds.has(relation.dutyId)) return issue('DUTY_RELATION_DUTY_MISSING', [relation.dutyId], [relation.id])
    if (!isRelationType(relation.relationType)) return issue('DUTY_RELATION_TARGET_INVALID', [relation.dutyId], [relation.id])
    if (!Number.isInteger(relation.order) || relation.order < 0) return issue('DUTY_RELATION_ORDER_INVALID', [relation.dutyId], [relation.id])
    if (relation.target.kind === 'position') {
      const position = positionById.get(relation.target.positionId)
      if (!position) return issue('DUTY_RELATION_TARGET_INVALID', [relation.dutyId], [relation.id], [relation.target.positionId])
      if (position.status !== 'active') return issue('DUTY_RELATION_TARGET_INACTIVE', [relation.dutyId], [relation.id], [position.id])
      const key = `${relation.dutyId}:${position.id}:${relation.relationType}`
      if (relationKeys.has(key)) return issue('DUTY_RELATION_DUPLICATE', [relation.dutyId], [relation.id], [position.id])
      relationKeys.add(key)
      if (relation.isPrimaryExecutor && relation.relationType !== 'execute') return issue('DUTY_RELATION_PRIMARY_INVALID', [relation.dutyId], [relation.id], [position.id])
      if (relation.isPrimaryExecutor) {
        if (activePrimaryByDuty.has(relation.dutyId)) return issue('DUTY_PRIMARY_EXECUTOR_DUPLICATE', [relation.dutyId], [relation.id], [position.id])
        activePrimaryByDuty.set(relation.dutyId, relation.id)
      }
      const groupKey = `${relation.dutyId}:${position.id}:${relationGroup(relation)}`
      const orders = denseGroups.get(groupKey) ?? []
      orders.push(relation.order)
      denseGroups.set(groupKey, orders)
    } else if (relation.target.kind === 'pending-reassignment') {
      if (relation.target.formerPositionId.length === 0 || relation.target.formerPositionTitle.length === 0) {
        return issue('DUTY_RELATION_PENDING_SNAPSHOT_INVALID', [relation.dutyId], [relation.id])
      }
      if (relation.isPrimaryExecutor && relation.relationType !== 'execute') return issue('DUTY_RELATION_PRIMARY_INVALID', [relation.dutyId], [relation.id])
    } else {
      return issue('DUTY_RELATION_TARGET_INVALID', [relation.dutyId], [relation.id])
    }
  }
  for (const [key, orders] of denseGroups) {
    const sorted = [...orders].sort((a, b) => a - b)
    if (sorted.some((order, index) => order !== index) || (key.endsWith('primary-execute') && sorted.some((order) => order !== 0))) {
      return issue('DUTY_RELATION_ORDER_INVALID')
    }
  }
  return { ok: true }
}

export function deriveDutyAnomalies(state: OrgDirectoryState): DutyAnomaly[] {
  const result: DutyAnomaly[] = []
  for (const relation of state.dutyPositionRelations) {
    if (isPendingTarget(relation.target)) {
      result.push({ id: `relation:${relation.id}`, type: 'pending-reassignment', severity: 'reminder', dutyId: relation.dutyId, relationId: relation.id })
    }
  }
  for (const duty of state.duties) {
    const activeRelations = state.dutyPositionRelations.filter((relation) => relation.dutyId === duty.id && relation.target.kind === 'position')
    const executeRelations = activeRelations.filter((relation) => relation.relationType === 'execute')
    const primary = executeRelations.filter((relation) => relation.isPrimaryExecutor)
    if (executeRelations.length === 0) {
      result.push({ id: `duty:${duty.id}:no-executor`, type: 'no-executor', severity: 'high', dutyId: duty.id })
    } else if (primary.length === 0) {
      result.push({ id: `duty:${duty.id}:missing-primary`, type: 'missing-primary-executor', severity: 'medium', dutyId: duty.id })
    }
  }
  return result
}

const severityOrder: Record<DutyAnomalySeverity, number> = { high: 0, medium: 1, reminder: 2 }

export function summarizeDutyAnomalies(anomalies: DutyAnomaly[]): DutyAnomalySummary {
  const uniqueDutyIds = new Set(anomalies.map((anomaly) => anomaly.dutyId))
  const highestSeverity = anomalies.length === 0
    ? null
    : [...anomalies].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])[0].severity
  return { anomalies, anomalyCount: anomalies.length, dutyCount: uniqueDutyIds.size, highestSeverity }
}

export function filterAndSortDutyRows(
  state: OrgDirectoryState,
  anomalies: DutyAnomaly[] = deriveDutyAnomalies(state),
  type?: DutyAnomalyType,
) {
  const dutyById = new Map(state.duties.map((duty) => [duty.id, duty]))
  const grouped = new Map<string, DutyAnomaly[]>()
  for (const anomaly of anomalies) {
    if (type && anomaly.type !== type) continue
    const list = grouped.get(anomaly.dutyId) ?? []
    list.push(anomaly)
    grouped.set(anomaly.dutyId, list)
  }
  return [...grouped.entries()]
    .map(([dutyId, matchedAnomalies]) => {
      const allAnomalies = anomalies.filter((anomaly) => anomaly.dutyId === dutyId)
      const highest = [...allAnomalies].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])[0]
      return { duty: dutyById.get(dutyId)!, anomalies: allAnomalies, matchedAnomalies, highestSeverity: highest?.severity ?? null }
    })
    .sort((a, b) => severityOrder[a.highestSeverity ?? 'reminder'] - severityOrder[b.highestSeverity ?? 'reminder']
      || a.duty.title.localeCompare(b.duty.title, 'zh-Hant')
      || a.duty.id.localeCompare(b.duty.id))
}

export function findDutyRelationOverlapWarnings(state: OrgDirectoryState) {
  const result: Array<{ dutyId: string; positionId: string; relationTypes: DutyRelationType[] }> = []
  const groups = new Map<string, DutyRelationType[]>()
  for (const relation of state.dutyPositionRelations) {
    if (relation.target.kind !== 'position') continue
    const key = `${relation.dutyId}:${relation.target.positionId}`
    const types = groups.get(key) ?? []
    if (!types.includes(relation.relationType)) types.push(relation.relationType)
    groups.set(key, types)
  }
  for (const [key, relationTypesForPosition] of groups) {
    if (relationTypesForPosition.length < 2) continue
    const [dutyId, positionId] = key.split(':')
    result.push({ dutyId, positionId, relationTypes: relationTypesForPosition.sort() })
  }
  return result
}

export function invalidateDutyRelationsForPositions(state: OrgDirectoryState, invalidatedPositionIds: Iterable<string>): OrgDirectoryState {
  const invalidated = new Set(invalidatedPositionIds)
  if (invalidated.size === 0) return state
  const positionById = new Map(state.positions.map((position) => [position.id, position]))
  const departmentById = new Map(state.departments.map((department) => [department.id, department]))
  const relations = state.dutyPositionRelations.map((relation) => {
    if (relation.target.kind !== 'position' || !invalidated.has(relation.target.positionId)) return relation
    const position = positionById.get(relation.target.positionId)
    if (!position) return relation
    const department = position.departmentId ? departmentById.get(position.departmentId) : undefined
    return {
      ...relation,
      target: {
        kind: 'pending-reassignment' as const,
        formerPositionId: position.id,
        formerPositionTitle: position.title,
        formerDepartmentId: position.departmentId,
        formerDepartmentName: department?.name ?? null,
      },
    }
  })
  return { ...state, dutyPositionRelations: relations }
}

export function getActiveDutyRelations(state: OrgDirectoryState, dutyId: string, positionId?: string) {
  return state.dutyPositionRelations.filter((relation) => relation.dutyId === dutyId
    && relation.target.kind === 'position'
    && (positionId === undefined || relation.target.positionId === positionId))
}

export function getPositionRelations(state: OrgDirectoryState, positionId: string) {
  return state.dutyPositionRelations.filter((relation) => relation.target.kind === 'position' && relation.target.positionId === positionId)
}

export function getDuty(state: OrgDirectoryState, dutyId: string): Duty | undefined {
  return state.duties.find((duty) => duty.id === dutyId)
}

export function getPosition(state: OrgDirectoryState, positionId: string): Position | undefined {
  return state.positions.find((position) => position.id === positionId)
}
