import { deriveDutyAnomalies, getActiveDutyRelations } from './duties'
import type { OrganizationCommand } from './organizationCommands'
import type { DutyPositionRelation, DutyRelationType, OrgDirectoryState } from './types'
import type { DutyConfigurationExactLane } from './dutyConfigurationRoute'

export const dutyConfigurationLaneLabels: Record<DutyConfigurationExactLane, string> = {
  'primary-execute': '主執行',
  collaborate: '協作',
  review: '審核',
  countersign: '會簽',
}

export const dutyConfigurationLaneGroups = [
  { key: 'execute', label: '執行', lanes: ['primary-execute', 'collaborate'] as DutyConfigurationExactLane[] },
  { key: 'review', label: '審核', lanes: ['review', 'countersign'] as DutyConfigurationExactLane[] },
]

export type DutyConfigurationIntent = {
  dutyId: string
  positionId: string
  lane: DutyConfigurationExactLane
  sourceRelationId?: string | null
  newRelationId?: string
}

export type DutyConfigurationResolution =
  | { status: 'command'; command: OrganizationCommand }
  | { status: 'noop'; code?: DutyConfigurationIssueCode }
  | { status: 'invalid'; code: DutyConfigurationIssueCode }

export type DutyConfigurationIssueCode = 'DUTY_NOT_FOUND' | 'POSITION_NOT_FOUND' | 'LANE_REQUIRED' | 'SOURCE_RELATION_INVALID' | 'SOURCE_LANE_MISMATCH' | 'PRIMARY_EXECUTOR_REQUIRED' | 'PRIMARY_REQUIRES_EXPLICIT_REMOVAL' | 'DUPLICATE_ASSIGNMENT' | 'PRIMARY_CONFLICT' | 'PENDING_LANE_MISMATCH'

function relationForLane(lane: DutyConfigurationExactLane): Pick<DutyPositionRelation, 'relationType' | 'isPrimaryExecutor'> {
  if (lane === 'primary-execute') return { relationType: 'execute', isPrimaryExecutor: true }
  if (lane === 'collaborate') return { relationType: 'execute', isPrimaryExecutor: false }
  if (lane === 'review') return { relationType: 'review', isPrimaryExecutor: false }
  return { relationType: 'countersign', isPrimaryExecutor: false }
}

function laneForRelation(relation: DutyPositionRelation): DutyConfigurationExactLane {
  if (relation.relationType === 'execute') return relation.isPrimaryExecutor ? 'primary-execute' : 'collaborate'
  if (relation.relationType === 'collaborate') return 'collaborate'
  return relation.relationType
}

function newRelationId(state: OrgDirectoryState, requested?: string) {
  if (requested && !state.dutyPositionRelations.some((relation) => relation.id === requested)) return requested
  let index = state.dutyPositionRelations.length + 1
  while (state.dutyPositionRelations.some((relation) => relation.id === `rel-duty-${index}`)) index += 1
  return `rel-duty-${index}`
}

function relationOrder(state: OrgDirectoryState, dutyId: string, relationType: DutyRelationType) {
  return state.dutyPositionRelations.filter((relation) => relation.dutyId === dutyId && relation.relationType === relationType).length
}

export function resolveDutyConfigurationCommand(state: OrgDirectoryState, intent: DutyConfigurationIntent): DutyConfigurationResolution {
  if (!state.duties.some((duty) => duty.id === intent.dutyId)) return { status: 'invalid', code: 'DUTY_NOT_FOUND' }
  const position = state.positions.find((candidate) => candidate.id === intent.positionId && candidate.status === 'active')
  if (!position) return { status: 'invalid', code: 'POSITION_NOT_FOUND' }
  if (!intent.lane) return { status: 'invalid', code: 'LANE_REQUIRED' }

  const relations = getActiveDutyRelations(state, intent.dutyId)
  const mapped = relationForLane(intent.lane)
  const target = relations.find((relation) => relation.target.kind === 'position' && relation.target.positionId === intent.positionId && relation.relationType === mapped.relationType)
  const source = intent.sourceRelationId ? state.dutyPositionRelations.find((relation) => relation.id === intent.sourceRelationId) : undefined
  if (intent.sourceRelationId) {
    if (!source || source.dutyId !== intent.dutyId || source.target.kind !== 'pending-reassignment') return { status: 'invalid', code: 'SOURCE_RELATION_INVALID' }
    const sourceLane = laneForRelation(source)
    const allowed = sourceLane === intent.lane
    if (!allowed) return { status: 'invalid', code: 'SOURCE_LANE_MISMATCH' }
    return {
      status: 'command',
      command: {
        type: 'UPSERT_DUTY_RELATION',
        relation: {
          id: source.id,
          dutyId: intent.dutyId,
          relationType: mapped.relationType,
          target: { kind: 'position', positionId: intent.positionId },
          isPrimaryExecutor: mapped.isPrimaryExecutor,
          order: mapped.isPrimaryExecutor ? 0 : relationOrder(state, intent.dutyId, mapped.relationType),
        },
      },
    }
  }

  if (target) {
    if (intent.lane === 'primary-execute' && !target.isPrimaryExecutor) {
      const primary = relations.find((relation) => relation.relationType === 'execute' && relation.isPrimaryExecutor)
      if (primary && primary.target.kind === 'position' && primary.target.positionId !== intent.positionId) {
        return { status: 'command', command: { type: 'TRANSFER_PRIMARY_DUTY_EXECUTOR', dutyId: intent.dutyId, sourceRelationId: primary.id, targetPositionId: intent.positionId, targetRelationId: target.id } }
      }
      return { status: 'command', command: { type: 'UPSERT_DUTY_RELATION', relation: { ...target, isPrimaryExecutor: true, order: 0 } } }
    }
    if (intent.lane === 'primary-execute' || mapped.relationType !== 'execute') {
      return { status: 'command', command: { type: 'REMOVE_DUTY_RELATION', relationId: target.id } }
    }
  }

  if (intent.lane === 'primary-execute') {
    const primary = relations.find((relation) => relation.relationType === 'execute' && relation.isPrimaryExecutor)
    if (primary && primary.target.kind === 'position' && primary.target.positionId !== intent.positionId) {
      const targetExecute = relations.find((relation) => relation.relationType === 'execute' && relation.target.kind === 'position' && relation.target.positionId === intent.positionId)
      return { status: 'command', command: { type: 'TRANSFER_PRIMARY_DUTY_EXECUTOR', dutyId: intent.dutyId, sourceRelationId: primary.id, targetPositionId: intent.positionId, targetRelationId: targetExecute?.id ?? newRelationId(state, intent.newRelationId) } }
    }
  }
  return {
    status: 'command',
    command: {
      type: 'UPSERT_DUTY_RELATION',
      relation: {
        id: newRelationId(state, intent.newRelationId),
        dutyId: intent.dutyId,
        relationType: mapped.relationType,
        target: { kind: 'position', positionId: intent.positionId },
        isPrimaryExecutor: mapped.isPrimaryExecutor,
        order: mapped.isPrimaryExecutor ? 0 : relationOrder(state, intent.dutyId, mapped.relationType),
      },
    },
  }
}

/**
 * R2 的拖曳只負責「指派」，不把點擊或拖曳解讀成移除／降級。
 * 需要移除關係或永久移轉主執行，仍由 Duty Inspector 的明確操作完成。
 */
export function resolveDutyConfigurationAssignmentCommand(state: OrgDirectoryState, intent: DutyConfigurationIntent): DutyConfigurationResolution {
  if (!state.duties.some((duty) => duty.id === intent.dutyId)) return { status: 'invalid', code: 'DUTY_NOT_FOUND' }
  const position = state.positions.find((candidate) => candidate.id === intent.positionId && candidate.status === 'active')
  if (!position) return { status: 'invalid', code: 'POSITION_NOT_FOUND' }
  if (!intent.lane) return { status: 'invalid', code: 'LANE_REQUIRED' }

  const relations = getActiveDutyRelations(state, intent.dutyId)
  const mapped = relationForLane(intent.lane)
  const source = intent.sourceRelationId
    ? state.dutyPositionRelations.find((relation) => relation.id === intent.sourceRelationId)
    : undefined
  if (intent.sourceRelationId) {
    if (!source || source.dutyId !== intent.dutyId || source.target.kind !== 'pending-reassignment') return { status: 'invalid', code: 'SOURCE_RELATION_INVALID' }
    if (laneForRelation(source) !== intent.lane) return { status: 'invalid', code: 'PENDING_LANE_MISMATCH' }
  }

  const targetRelation = relations.find((relation) => relation.target.kind === 'position'
    && relation.target.positionId === intent.positionId
    && relation.relationType === mapped.relationType
    && relation.isPrimaryExecutor === mapped.isPrimaryExecutor)
  if (targetRelation) return { status: 'noop' }

  if (intent.lane === 'primary-execute') {
    const primary = relations.find((relation) => relation.relationType === 'execute' && relation.isPrimaryExecutor)
    if (primary?.target.kind === 'position' && primary.target.positionId === intent.positionId) return { status: 'noop' }
    if (primary && primary.target.kind === 'position' && primary.target.positionId !== intent.positionId) {
      const existingTarget = relations.find((relation) => relation.relationType === 'execute'
        && relation.target.kind === 'position'
        && relation.target.positionId === intent.positionId)
      return {
        status: 'command',
        command: {
          type: 'TRANSFER_PRIMARY_DUTY_EXECUTOR',
          dutyId: intent.dutyId,
          sourceRelationId: primary.id,
          targetPositionId: intent.positionId,
          targetRelationId: existingTarget?.id ?? newRelationId(state, intent.newRelationId),
        },
      }
    }
    const existingOther = relations.find((relation) => relation.relationType === 'execute'
      && relation.target.kind === 'position'
      && relation.target.positionId === intent.positionId)
    if (existingOther && !existingOther.isPrimaryExecutor) {
      return {
        status: 'command',
        command: {
          type: 'UPSERT_DUTY_RELATION',
          relation: { ...existingOther, isPrimaryExecutor: true, order: 0 },
        },
      }
    }
  }

  if (intent.lane !== 'primary-execute') {
    const existingSameType = relations.find((relation) => relation.relationType === mapped.relationType
      && relation.target.kind === 'position'
      && relation.target.positionId === intent.positionId)
    if (existingSameType) return { status: 'noop', code: 'DUPLICATE_ASSIGNMENT' }
  }

  return {
    status: 'command',
    command: {
      type: 'UPSERT_DUTY_RELATION',
      relation: {
        id: source?.id ?? newRelationId(state, intent.newRelationId),
        dutyId: intent.dutyId,
        relationType: mapped.relationType,
        target: { kind: 'position', positionId: intent.positionId },
        isPrimaryExecutor: mapped.isPrimaryExecutor,
        order: mapped.isPrimaryExecutor ? 0 : relationOrder(state, intent.dutyId, mapped.relationType),
      },
    },
  }
}

export type DutyConfigurationDropIntent = DutyConfigurationIntent
export type DutyConfigurationDropResolution = DutyConfigurationResolution
export const resolveDutyConfigurationDropCommand = resolveDutyConfigurationAssignmentCommand

export interface DutyConfigurationProjection {
  labels: string[]
  laneLabels: Record<DutyConfigurationExactLane, string[]>
}

export function projectDutyConfiguration(state: OrgDirectoryState, positionId: string, dutyId?: string | null): DutyConfigurationProjection {
  const laneLabels: Record<DutyConfigurationExactLane, string[]> = {
    'primary-execute': [], collaborate: [], review: [], countersign: [],
  }
  const duties = new Map(state.duties.map((duty) => [duty.id, duty]))
  const relations = state.dutyPositionRelations.filter((relation) => relation.target.kind === 'position' && relation.target.positionId === positionId && (!dutyId || relation.dutyId === dutyId))
  for (const relation of relations) laneLabels[laneForRelation(relation)].push(duties.get(relation.dutyId)?.title ?? relation.dutyId)
  const labels = Object.values(laneLabels).flat()
  return { labels, laneLabels }
}

export function dutyConfigurationAttentionCount(state: OrgDirectoryState) {
  return deriveDutyAnomalies(state).length
}

export function dutyConfigurationAttentionLabel(state: OrgDirectoryState) {
  const count = dutyConfigurationAttentionCount(state)
  return count > 0 ? `待處理 ${count}` : '無待處理項目'
}

export function dutyConfigurationIssueMessage(code: DutyConfigurationIssueCode) {
  const messages: Record<string, string> = {
    DUTY_NOT_FOUND: '找不到此工作事項',
    POSITION_NOT_FOUND: '此職位不存在或已停用',
    LANE_REQUIRED: '請先選擇配置類型',
    SOURCE_RELATION_INVALID: '待重新分配關係已不存在',
    SOURCE_LANE_MISMATCH: '此待重新分配關係不能放入目前類型',
    PRIMARY_EXECUTOR_REQUIRED: '主執行關係無法完成',
    PRIMARY_REQUIRES_EXPLICIT_REMOVAL: '目前職位是主執行；若要改成協作，請先在 Inspector 明確移除主執行',
    DUPLICATE_ASSIGNMENT: '此職位已配置相同責任類型',
    PRIMARY_CONFLICT: '此工作事項已有其他主執行職位',
    PENDING_LANE_MISMATCH: '待重新分配項目只能放回原本的責任類型',
  }
  return messages[code] ?? '工作事項配置未完成'
}
