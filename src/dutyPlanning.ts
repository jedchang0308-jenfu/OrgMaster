import {
  deriveDutyAnomalies,
  normalizeDutyRelationOrders,
  validateDutyState,
  type DutyAnomaly,
} from './duties'
import type { DutyPositionRelation, DutyRelationType, OrgDirectoryState } from './types'

export type DutyRepairIntent =
  | {
      anomalyId: `relation:${string}`
      kind: 'pending-reassignment'
      dutyId: string
      relationId: string
      resolution: null | { kind: 'assign'; targetPositionId: string } | { kind: 'drop' }
    }
  | {
      anomalyId: `duty:${string}:missing-primary` | `duty:${string}:no-executor`
      kind: 'missing-primary-executor' | 'no-executor'
      dutyId: string
      resolution: null | { kind: 'set-primary'; targetPositionId: string; newRelationId: string }
    }

export interface DutyRelationPlacementIntent {
  planItemId: string
  kind: 'place-relation'
  dutyId: string
  sourceRelationId: string
  sourcePositionId: string
  relationType: DutyRelationType
  sourceIsPrimaryExecutor: boolean
  resolution:
    | { mode: 'move'; targetPositionId: string; newRelationId: string | null }
    | { mode: 'copy'; targetPositionId: string; newRelationId: string }
}

export type DutyPlanIntent = DutyRepairIntent | DutyRelationPlacementIntent

export type DutyPlanIssueCode =
  | 'INCOMPLETE'
  | 'STALE'
  | 'SOURCE_STALE'
  | 'TARGET_INVALID'
  | 'TARGET_DUPLICATE'
  | 'RELATION_TYPE_MISMATCH'
  | 'PLACEMENT_CONFLICT'
  | 'PRIMARY_CONFLICT'
  | 'DOMAIN_INVALID'

export interface DutyPlanIssue {
  itemId: string
  dutyId: string | null
  kind: 'repair' | 'placement' | 'domain'
  code: DutyPlanIssueCode
  message: string
  anomalyId?: string
  planItemId?: string
}

export interface DutyPlanProjection {
  state: OrgDirectoryState
  anomalies: DutyAnomaly[]
  issues: DutyPlanIssue[]
  changedRelationIds: string[]
  changedDutyIds: string[]
}

const SAFE_ID = /^[A-Za-z0-9-]{1,80}$/

function isSafeId(value: unknown) {
  return typeof value === 'string' && SAFE_ID.test(value)
}

export function getDutyPlanIntentId(intent: DutyPlanIntent) {
  return intent.kind === 'place-relation' ? intent.planItemId : intent.anomalyId
}

function cloneState(state: OrgDirectoryState): OrgDirectoryState {
  return JSON.parse(JSON.stringify(state)) as OrgDirectoryState
}

function canonicalIntents(intents: DutyPlanIntent[]) {
  return [...intents].sort((a, b) => {
    const aSource = a.kind === 'place-relation' ? a.sourceRelationId : 'relationId' in a ? a.relationId : ''
    const bSource = b.kind === 'place-relation' ? b.sourceRelationId : 'relationId' in b ? b.relationId : ''
    return a.kind.localeCompare(b.kind)
      || a.dutyId.localeCompare(b.dutyId)
      || getDutyPlanIntentId(a).localeCompare(getDutyPlanIntentId(b))
      || aSource.localeCompare(bSource)
  })
}

function activePosition(state: OrgDirectoryState, positionId: string) {
  return state.positions.find((position) => position.id === positionId && position.status === 'active')
}

function addIssue(issues: DutyPlanIssue[], intent: DutyPlanIntent | null, code: DutyPlanIssueCode, message: string, kind?: DutyPlanIssue['kind'], dutyId?: string | null) {
  if (!intent) {
    issues.push({ itemId: 'domain', dutyId: dutyId ?? null, kind: kind ?? 'domain', code, message })
    return
  }
  const isPlacement = intent.kind === 'place-relation'
  issues.push({
    itemId: getDutyPlanIntentId(intent),
    dutyId: intent.dutyId,
    kind: isPlacement ? 'placement' : 'repair',
    code,
    message,
    ...(isPlacement ? { planItemId: intent.planItemId } : { anomalyId: intent.anomalyId }),
  })
}

function markChange(changedRelationIds: Set<string>, changedDutyIds: Set<string>, relationId: string, dutyId: string) {
  changedRelationIds.add(relationId)
  changedDutyIds.add(dutyId)
}

function setPrimaryForDuty(
  relations: DutyPositionRelation[],
  dutyId: string,
  targetPositionId: string,
  newRelationId: string,
  issues: DutyPlanIssue[],
  intent: DutyPlanIntent,
  changedRelationIds: Set<string>,
  changedDutyIds: Set<string>,
) {
  const existingTarget = relations.find((relation) => relation.dutyId === dutyId
    && relation.relationType === 'execute'
    && relation.target.kind === 'position'
    && relation.target.positionId === targetPositionId)
  const otherPrimary = relations.find((relation) => relation.dutyId === dutyId
    && relation.relationType === 'execute'
    && relation.isPrimaryExecutor
    && relation.id !== existingTarget?.id)
  if (otherPrimary && !existingTarget) {
    addIssue(issues, intent, 'PRIMARY_CONFLICT', '目標套用後會與其他主執行同時存在')
    return false
  }
  if (otherPrimary) {
    const index = relations.indexOf(otherPrimary)
    relations.splice(index, 1, { ...otherPrimary, isPrimaryExecutor: false, order: 0 })
    markChange(changedRelationIds, changedDutyIds, otherPrimary.id, dutyId)
  }
  if (existingTarget) {
    relations.splice(relations.indexOf(existingTarget), 1, { ...existingTarget, isPrimaryExecutor: true, order: 0 })
    markChange(changedRelationIds, changedDutyIds, existingTarget.id, dutyId)
    return true
  }
  if (!isSafeId(newRelationId) || relations.some((relation) => relation.id === newRelationId)) {
    addIssue(issues, intent, 'DOMAIN_INVALID', '新增關係識別碼無效或重複')
    return false
  }
  relations.push({ id: newRelationId, dutyId, relationType: 'execute', target: { kind: 'position', positionId: targetPositionId }, isPrimaryExecutor: true, order: 0 })
  markChange(changedRelationIds, changedDutyIds, newRelationId, dutyId)
  return true
}

function applyPendingIntent(
  state: OrgDirectoryState,
  intent: Extract<DutyRepairIntent, { kind: 'pending-reassignment' }>,
  issues: DutyPlanIssue[],
  changedRelationIds: Set<string>,
  changedDutyIds: Set<string>,
) {
  const relationIndex = state.dutyPositionRelations.findIndex((relation) => relation.id === intent.relationId)
  const relation = relationIndex >= 0 ? state.dutyPositionRelations[relationIndex] : null
  if (!relation || relation.dutyId !== intent.dutyId || relation.target.kind !== 'pending-reassignment') {
    addIssue(issues, intent, 'STALE', '失效關係已不存在或語意已改變')
    return
  }
  if (!intent.resolution) {
    addIssue(issues, intent, 'INCOMPLETE', '尚未選擇目標或不再指派')
    return
  }
  if (intent.resolution.kind === 'drop') {
    state.dutyPositionRelations.splice(relationIndex, 1)
    markChange(changedRelationIds, changedDutyIds, relation.id, relation.dutyId)
    return
  }
  if (!activePosition(state, intent.resolution.targetPositionId)) {
    addIssue(issues, intent, 'TARGET_INVALID', '目標職位不存在或已失效')
    return
  }
  const targetPositionId = intent.resolution.targetPositionId
  const duplicateIndex = state.dutyPositionRelations.findIndex((candidate) => candidate.dutyId === relation.dutyId
    && candidate.relationType === relation.relationType
    && candidate.target.kind === 'position'
    && candidate.target.positionId === targetPositionId)
  if (duplicateIndex >= 0 && duplicateIndex !== relationIndex) {
    const duplicate = state.dutyPositionRelations[duplicateIndex]
    if (relation.isPrimaryExecutor && !setPrimaryForDuty(state.dutyPositionRelations, relation.dutyId, targetPositionId, relation.id, issues, intent, changedRelationIds, changedDutyIds)) return
    state.dutyPositionRelations.splice(relationIndex, 1)
    markChange(changedRelationIds, changedDutyIds, relation.id, relation.dutyId)
    markChange(changedRelationIds, changedDutyIds, duplicate.id, duplicate.dutyId)
    return
  }
  const nextTarget = { kind: 'position' as const, positionId: targetPositionId }
  const nextRelation = { ...relation, target: nextTarget, order: relation.isPrimaryExecutor ? 0 : relation.order }
  state.dutyPositionRelations.splice(relationIndex, 1, nextRelation)
  markChange(changedRelationIds, changedDutyIds, relation.id, relation.dutyId)
  if (relation.isPrimaryExecutor) setPrimaryForDuty(state.dutyPositionRelations, relation.dutyId, targetPositionId, relation.id, issues, intent, changedRelationIds, changedDutyIds)
}

function applyGapIntent(
  state: OrgDirectoryState,
  intent: Extract<DutyRepairIntent, { kind: 'missing-primary-executor' | 'no-executor' }>,
  issues: DutyPlanIssue[],
  changedRelationIds: Set<string>,
  changedDutyIds: Set<string>,
) {
  const currentAnomaly = deriveDutyAnomalies(state).find((anomaly) => anomaly.id === intent.anomalyId)
  if (!currentAnomaly) {
    addIssue(issues, intent, 'STALE', '異常已不存在，請重新確認目前狀態')
    return
  }
  if (!intent.resolution) {
    addIssue(issues, intent, 'INCOMPLETE', '尚未選擇主執行目標')
    return
  }
  const target = activePosition(state, intent.resolution.targetPositionId)
  if (!target) {
    addIssue(issues, intent, 'TARGET_INVALID', '目標職位不存在或已失效')
    return
  }
  setPrimaryForDuty(state.dutyPositionRelations, intent.dutyId, target.id, intent.resolution.newRelationId, issues, intent, changedRelationIds, changedDutyIds)
}

function preflightPlacementConflicts(intents: DutyRelationPlacementIntent[], issues: DutyPlanIssue[]) {
  const sourceIds = new Map<string, DutyRelationPlacementIntent>()
  const newIds = new Map<string, DutyRelationPlacementIntent>()
  const primaryTargets = new Map<string, DutyRelationPlacementIntent>()
  for (const intent of intents) {
    const previousSource = sourceIds.get(intent.sourceRelationId)
    if (previousSource) addIssue(issues, intent, 'PLACEMENT_CONFLICT', '同一來源關係在同一草案只能配置一次')
    else sourceIds.set(intent.sourceRelationId, intent)
    const newRelationId = intent.resolution.newRelationId
    if (newRelationId) {
      const previousId = newIds.get(newRelationId)
      if (previousId) addIssue(issues, intent, 'PLACEMENT_CONFLICT', '草案內新增關係識別碼重複')
      else newIds.set(newRelationId, intent)
    }
    if (intent.sourceIsPrimaryExecutor) {
      const key = `${intent.dutyId}:${intent.resolution.targetPositionId}`
      const previousTarget = primaryTargets.get(key)
      if (previousTarget) addIssue(issues, intent, 'PRIMARY_CONFLICT', '同一職掌的主執行目標重複')
      else primaryTargets.set(key, intent)
    }
  }
}

function applyPlacementIntent(
  state: OrgDirectoryState,
  intent: DutyRelationPlacementIntent,
  issues: DutyPlanIssue[],
  changedRelationIds: Set<string>,
  changedDutyIds: Set<string>,
) {
  const sourceIndex = state.dutyPositionRelations.findIndex((relation) => relation.id === intent.sourceRelationId)
  const source = sourceIndex >= 0 ? state.dutyPositionRelations[sourceIndex] : null
  const target = activePosition(state, intent.resolution.targetPositionId)
  if (!source || source.target.kind !== 'position'
    || source.dutyId !== intent.dutyId
    || source.target.positionId !== intent.sourcePositionId
    || source.relationType !== intent.relationType
    || source.isPrimaryExecutor !== intent.sourceIsPrimaryExecutor) {
    addIssue(issues, intent, 'SOURCE_STALE', '來源關係已不存在或內容已改變')
    return
  }
  if (!target || target.id === intent.sourcePositionId) {
    addIssue(issues, intent, 'TARGET_INVALID', '目標職位不存在、已失效或與來源相同')
    return
  }
  if (intent.sourceIsPrimaryExecutor && intent.relationType !== 'execute') {
    addIssue(issues, intent, 'RELATION_TYPE_MISMATCH', '只有主執行關係可以使用主執行配置語意')
    return
  }
  if (intent.sourceIsPrimaryExecutor && intent.resolution.mode === 'copy') {
    addIssue(issues, intent, 'RELATION_TYPE_MISMATCH', '主執行關係不可複製')
    return
  }
  if (intent.sourceIsPrimaryExecutor && intent.resolution.mode === 'move' && !isSafeId(intent.resolution.newRelationId)) {
    addIssue(issues, intent, 'DOMAIN_INVALID', '主執行移動需要預先保存新關係識別碼')
    return
  }
  if (!intent.sourceIsPrimaryExecutor && intent.resolution.mode === 'copy' && !isSafeId(intent.resolution.newRelationId)) {
    addIssue(issues, intent, 'DOMAIN_INVALID', '複製關係識別碼無效')
    return
  }
  if (!intent.sourceIsPrimaryExecutor && intent.resolution.mode === 'move' && intent.resolution.newRelationId !== null) {
    addIssue(issues, intent, 'DOMAIN_INVALID', '非主執行移動不得產生新關係識別碼')
    return
  }
  const existingTarget = state.dutyPositionRelations.find((relation) => relation.id !== source.id
    && relation.dutyId === intent.dutyId
    && relation.relationType === intent.relationType
    && relation.target.kind === 'position'
    && relation.target.positionId === target.id)
  if (existingTarget && !intent.sourceIsPrimaryExecutor) {
    addIssue(issues, intent, 'TARGET_DUPLICATE', '目標職位已存在相同責任關係')
    return
  }
  if (existingTarget && intent.sourceIsPrimaryExecutor && existingTarget.isPrimaryExecutor) {
    addIssue(issues, intent, 'PRIMARY_CONFLICT', '目標職位已有主執行關係')
    return
  }
  if (intent.sourceIsPrimaryExecutor) {
    const newRelationId = intent.resolution.newRelationId
    if (!existingTarget && (!newRelationId || state.dutyPositionRelations.some((relation) => relation.id === newRelationId))) {
      addIssue(issues, intent, 'DOMAIN_INVALID', '新增主執行關係識別碼無效或重複')
      return
    }
    state.dutyPositionRelations.splice(sourceIndex, 1)
    markChange(changedRelationIds, changedDutyIds, source.id, source.dutyId)
    if (existingTarget) {
      state.dutyPositionRelations.splice(state.dutyPositionRelations.indexOf(existingTarget), 1, { ...existingTarget, isPrimaryExecutor: true, order: 0 })
      markChange(changedRelationIds, changedDutyIds, existingTarget.id, existingTarget.dutyId)
    } else {
      if (!newRelationId) return
      const next: DutyPositionRelation = { id: newRelationId, dutyId: intent.dutyId, relationType: 'execute', target: { kind: 'position', positionId: target.id }, isPrimaryExecutor: true, order: 0 }
      state.dutyPositionRelations.push(next)
      markChange(changedRelationIds, changedDutyIds, next.id, next.dutyId)
    }
    return
  }
  if (intent.resolution.mode === 'move') {
    const next = { ...source, target: { kind: 'position' as const, positionId: target.id }, order: source.order }
    state.dutyPositionRelations.splice(sourceIndex, 1, next)
    markChange(changedRelationIds, changedDutyIds, source.id, source.dutyId)
    return
  }
  const newRelationId = intent.resolution.newRelationId
  if (state.dutyPositionRelations.some((relation) => relation.id === newRelationId)) {
    addIssue(issues, intent, 'DOMAIN_INVALID', '複製關係識別碼已存在')
    return
  }
  const next: DutyPositionRelation = { ...source, id: newRelationId, target: { kind: 'position' as const, positionId: target.id }, order: source.order }
  state.dutyPositionRelations.push(next)
  markChange(changedRelationIds, changedDutyIds, next.id, next.dutyId)
}

export function projectDutyPlan(state: OrgDirectoryState, intents: DutyPlanIntent[]): DutyPlanProjection {
  const next = cloneState(state)
  const issues: DutyPlanIssue[] = []
  const changedRelationIds = new Set<string>()
  const changedDutyIds = new Set<string>()
  const canonical = canonicalIntents(intents)
  const placements = canonical.filter((intent): intent is DutyRelationPlacementIntent => intent.kind === 'place-relation')
  preflightPlacementConflicts(placements, issues)
  for (const intent of canonical) {
    if (intent.kind === 'pending-reassignment') applyPendingIntent(next, intent, issues, changedRelationIds, changedDutyIds)
  }
  for (const intent of canonical) {
    if (intent.kind === 'place-relation') applyPlacementIntent(next, intent, issues, changedRelationIds, changedDutyIds)
  }
  for (const intent of canonical) {
    if (intent.kind !== 'pending-reassignment' && intent.kind !== 'place-relation') applyGapIntent(next, intent, issues, changedRelationIds, changedDutyIds)
  }
  next.dutyPositionRelations = normalizeDutyRelationOrders(next.dutyPositionRelations)
  const validation = validateDutyState(next)
  if (!validation.ok) issues.push({ itemId: 'domain', dutyId: validation.issue.dutyIds[0] ?? null, kind: 'domain', code: 'DOMAIN_INVALID', message: validation.issue.code })
  return {
    state: next,
    anomalies: deriveDutyAnomalies(next),
    issues,
    changedRelationIds: [...changedRelationIds],
    changedDutyIds: [...changedDutyIds],
  }
}
