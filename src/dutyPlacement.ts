import { deriveDutyAnomalies, type DutyAnomaly } from './duties'
import { getDutyPlanIntentId, type DutyPlanIntent, type DutyRelationPlacementIntent } from './dutyPlanning'
import type { DutyPositionRelation, DutyRelationType, OrgDirectoryState } from './types'

export type DutyResponsibilityColumn = 'primary-execute' | 'other-execute' | 'review' | 'collaborate' | 'countersign'
export type DutyMatrixColumn = 'execute' | 'review' | 'collaborate'

export type DutyPlacementSource =
  | { kind: 'relation'; relationId: string }
  | { kind: 'anomaly'; anomalyId: string }

export interface DutyPlacementTarget {
  positionId: string
  column: DutyResponsibilityColumn
}

export type DutyDropEvaluation =
  | { kind: 'stage'; source: DutyPlacementSource; target: DutyPlacementTarget }
  | { kind: 'choose-move-copy'; source: Extract<DutyPlacementSource, { kind: 'relation' }>; target: DutyPlacementTarget }
  | { kind: 'reject'; code: 'SOURCE_STALE' | 'TARGET_INVALID' | 'TARGET_DUPLICATE' | 'RELATION_TYPE_MISMATCH' | 'PLACEMENT_CONFLICT'; message: string }

export function dutyColumnForRelation(relation: Pick<DutyPositionRelation, 'relationType' | 'isPrimaryExecutor'>): DutyResponsibilityColumn {
  if (relation.relationType === 'execute') return relation.isPrimaryExecutor ? 'primary-execute' : 'other-execute'
  return relation.relationType
}

export function dutyRelationTypeForColumn(column: DutyResponsibilityColumn): DutyRelationType {
  return column === 'primary-execute' || column === 'other-execute' ? 'execute' : column
}

export function dutyMatrixColumnForResponsibilityColumn(column: DutyResponsibilityColumn): DutyMatrixColumn {
  if (column === 'primary-execute' || column === 'other-execute') return 'execute'
  if (column === 'review' || column === 'countersign') return 'review'
  return 'collaborate'
}

function activePosition(state: OrgDirectoryState, positionId: string) {
  return state.positions.some((position) => position.id === positionId && position.status === 'active')
}

function existingPlacementForSource(intents: DutyPlanIntent[], relationId: string) {
  return intents.some((intent) => intent.kind === 'place-relation' && intent.sourceRelationId === relationId)
}

function existingRepairForAnomaly(intents: DutyPlanIntent[], anomalyId: string) {
  return intents.some((intent) => intent.kind !== 'place-relation' && intent.anomalyId === anomalyId)
}

function relationForAnomaly(state: OrgDirectoryState, anomaly: DutyAnomaly) {
  return anomaly.relationId ? state.dutyPositionRelations.find((relation) => relation.id === anomaly.relationId) : undefined
}

function anomalyTargetColumn(state: OrgDirectoryState, anomaly: DutyAnomaly): DutyResponsibilityColumn | null {
  if (anomaly.type === 'missing-primary-executor' || anomaly.type === 'no-executor') return 'primary-execute'
  const relation = relationForAnomaly(state, anomaly)
  return relation ? dutyColumnForRelation(relation) : null
}

export function dutyResponsibilityColumnForSource(state: OrgDirectoryState, source: DutyPlacementSource): DutyResponsibilityColumn | null {
  if (source.kind === 'relation') {
    const relation = state.dutyPositionRelations.find((item) => item.id === source.relationId)
    return relation ? dutyColumnForRelation(relation) : null
  }
  const anomaly = deriveDutyAnomalies(state).find((item) => item.id === source.anomalyId)
  return anomaly ? anomalyTargetColumn(state, anomaly) : null
}

export function dutyPlacementTargetForMatrixCell(
  state: OrgDirectoryState,
  source: DutyPlacementSource,
  positionId: string,
  matrixColumn: DutyMatrixColumn,
): DutyPlacementTarget | null {
  const column = dutyResponsibilityColumnForSource(state, source)
  if (!column || dutyMatrixColumnForResponsibilityColumn(column) !== matrixColumn) return null
  return { positionId, column }
}

export function evaluateDutyDrop(state: OrgDirectoryState, intents: DutyPlanIntent[], source: DutyPlacementSource, target: DutyPlacementTarget): DutyDropEvaluation {
  if (!activePosition(state, target.positionId)) return { kind: 'reject', code: 'TARGET_INVALID', message: '目標職位不存在或已失效' }
  if (source.kind === 'anomaly') {
    const anomaly = deriveDutyAnomalies(state).find((item) => item.id === source.anomalyId)
    if (!anomaly) return { kind: 'reject', code: 'SOURCE_STALE', message: '異常已不存在，請重新載入目前狀態' }
    if (existingRepairForAnomaly(intents, source.anomalyId)) return { kind: 'reject', code: 'PLACEMENT_CONFLICT', message: '這個異常已經有規劃，請先復原原規劃' }
    const expectedColumn = anomalyTargetColumn(state, anomaly)
    if (!expectedColumn) return { kind: 'reject', code: 'SOURCE_STALE', message: '失效關係內容不足，無法判斷責任欄' }
    if (target.column !== expectedColumn) return { kind: 'reject', code: 'RELATION_TYPE_MISMATCH', message: '異常只能放到原責任類型欄' }
    return { kind: 'stage', source, target }
  }
  const relation = state.dutyPositionRelations.find((item) => item.id === source.relationId)
  if (!relation || relation.target.kind !== 'position') return { kind: 'reject', code: 'SOURCE_STALE', message: '來源關係已不存在或已失效' }
  if (existingPlacementForSource(intents, relation.id)) return { kind: 'reject', code: 'PLACEMENT_CONFLICT', message: '這個責任關係已經有規劃，請先復原原規劃' }
  if (relation.target.positionId === target.positionId) return { kind: 'reject', code: 'TARGET_INVALID', message: '目標職位必須不同於來源職位' }
  if (dutyColumnForRelation(relation) !== target.column) return { kind: 'reject', code: 'RELATION_TYPE_MISMATCH', message: '只能在相同責任欄移動或複製' }
  const duplicate = state.dutyPositionRelations.some((candidate) => candidate.id !== relation.id
    && candidate.dutyId === relation.dutyId
    && candidate.relationType === relation.relationType
    && candidate.target.kind === 'position'
    && candidate.target.positionId === target.positionId)
  if (duplicate && !relation.isPrimaryExecutor) return { kind: 'reject', code: 'TARGET_DUPLICATE', message: '目標職位已有相同責任關係' }
  return relation.isPrimaryExecutor
    ? { kind: 'stage', source, target }
    : { kind: 'choose-move-copy', source, target }
}

export function createDutyDropIntent(
  state: OrgDirectoryState,
  source: DutyPlacementSource,
  target: DutyPlacementTarget,
  ids: { planItemId: string; newRelationId: string },
  decision?: 'move' | 'copy',
): DutyPlanIntent | null {
  if (source.kind === 'anomaly') {
    const anomaly = deriveDutyAnomalies(state).find((item) => item.id === source.anomalyId)
    if (!anomaly) return null
    if (anomaly.type === 'pending-reassignment') {
      return {
        anomalyId: anomaly.id as `relation:${string}`,
        kind: 'pending-reassignment',
        dutyId: anomaly.dutyId,
        relationId: anomaly.relationId!,
        resolution: { kind: 'assign', targetPositionId: target.positionId },
      }
    }
    return {
      anomalyId: anomaly.id as `duty:${string}:missing-primary` | `duty:${string}:no-executor`,
      kind: anomaly.type,
      dutyId: anomaly.dutyId,
      resolution: { kind: 'set-primary', targetPositionId: target.positionId, newRelationId: ids.newRelationId },
    }
  }
  const relation = state.dutyPositionRelations.find((item) => item.id === source.relationId)
  if (!relation || relation.target.kind !== 'position') return null
  if (!relation.isPrimaryExecutor && !decision) return null
  const placement: DutyRelationPlacementIntent = {
    planItemId: ids.planItemId,
    kind: 'place-relation',
    dutyId: relation.dutyId,
    sourceRelationId: relation.id,
    sourcePositionId: relation.target.positionId,
    relationType: relation.relationType,
    sourceIsPrimaryExecutor: relation.isPrimaryExecutor,
    resolution: relation.isPrimaryExecutor
      ? { mode: 'move', targetPositionId: target.positionId, newRelationId: ids.newRelationId }
      : decision === 'copy'
        ? { mode: 'copy', targetPositionId: target.positionId, newRelationId: ids.newRelationId }
        : { mode: 'move', targetPositionId: target.positionId, newRelationId: null },
  }
  return placement
}

export function dutyPlacementItemId(intent: DutyPlanIntent) {
  return getDutyPlanIntentId(intent)
}
