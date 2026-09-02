import type { Point } from '../types'
import type {
  RegisteredDropEffect,
  RegisteredDropResolution,
  RegisteredDropTarget,
  WorkspaceEntityDragPayloadV1,
} from './entityDrag'
import type { ModuleCapability, WorkspaceModuleId } from './types'

export type RelationPlacementInputMode = 'native-drag' | 'keyboard'

export type RelationPlacementCandidateCode = Extract<RegisteredDropResolution, { status: 'noop' | 'rejected' }>['code'] | null

export type RelationPlacementCandidate = {
  target: RegisteredDropTarget
  status: RegisteredDropResolution['status']
  effect: RegisteredDropEffect
  code: RelationPlacementCandidateCode
}

export type RelationPlacementCapabilitySet = {
  organizationAssignment: ModuleCapability
  dutyConfiguration: ModuleCapability
  processPlanning: ModuleCapability
}

export type RelationPlacementSession =
  | { phase: 'idle' }
  | {
      phase: 'placing'
      inputMode: RelationPlacementInputMode
      payload: WorkspaceEntityDragPayloadV1
      candidate: RelationPlacementCandidate | null
    }
  | {
      phase: 'committing'
      inputMode: RelationPlacementInputMode
      payload: WorkspaceEntityDragPayloadV1
      target: RegisteredDropTarget
    }

export type RelationPlacementAction =
  | { type: 'BEGIN'; inputMode: RelationPlacementInputMode; payload: WorkspaceEntityDragPayloadV1 }
  | { type: 'PREVIEW'; candidate: RelationPlacementCandidate | null }
  | { type: 'BEGIN_COMMIT'; target: RegisteredDropTarget }
  | { type: 'CANCEL' }
  | { type: 'FINISH' }

export function createRelationPlacementSession(): RelationPlacementSession {
  return { phase: 'idle' }
}

/**
 * Small, deterministic state machine shared by native and keyboard placement.
 * No domain object or mutation intent is stored here, which keeps stale
 * previews from becoming accidental commits.
 */
export function reduceRelationPlacementSession(
  session: RelationPlacementSession,
  action: RelationPlacementAction,
): RelationPlacementSession {
  if (action.type === 'CANCEL' || action.type === 'FINISH') return { phase: 'idle' }
  if (action.type === 'BEGIN') {
    return session.phase === 'idle'
      ? { phase: 'placing', inputMode: action.inputMode, payload: action.payload, candidate: null }
      : session
  }
  if (action.type === 'PREVIEW') {
    return session.phase === 'placing' ? { ...session, candidate: action.candidate } : session
  }
  if (action.type === 'BEGIN_COMMIT') {
    return session.phase === 'placing'
      ? { phase: 'committing', inputMode: session.inputMode, payload: session.payload, target: action.target }
      : session
  }
  return session
}

export function sameRelationPlacementPayload(
  left: WorkspaceEntityDragPayloadV1 | null,
  right: WorkspaceEntityDragPayloadV1 | null,
) {
  if (!left || !right || left.kind !== right.kind || left.sourceModuleId !== right.sourceModuleId) return false
  if (left.kind === 'employee' && right.kind === 'employee') {
    return left.employeeId === right.employeeId && left.sourcePositionId === right.sourcePositionId
  }
  if (left.kind === 'duty' && right.kind === 'duty') {
    return left.dutyId === right.dutyId && left.lane === right.lane && left.sourceRelationId === right.sourceRelationId
  }
  return left.kind === 'process-node' && right.kind === 'process-node' && left.processNodeId === right.processNodeId
}

function moduleCapability(capabilities: RelationPlacementCapabilitySet, moduleId: WorkspaceModuleId) {
  if (moduleId === 'organization' || moduleId === 'employees' || moduleId === 'positions') return capabilities.organizationAssignment
  if (moduleId === 'duties') return capabilities.dutyConfiguration
  if (moduleId === 'processes') return capabilities.processPlanning
  return { canRead: false, canMutate: false, reason: '此來源尚未註冊關係配置能力' } satisfies ModuleCapability
}

/** Returns the capability that owns the registered relation, fail-closed. */
export function resolveRelationPlacementCapability(
  payload: WorkspaceEntityDragPayloadV1 | null,
  target: RegisteredDropTarget,
  capabilities: RelationPlacementCapabilitySet,
): ModuleCapability {
  if (!payload) return { canRead: false, canMutate: false, reason: '拖曳資料不存在' }
  if (payload.kind === 'employee' && (target.kind === 'position' || target.kind === 'employee-unassign')) {
    return capabilities.organizationAssignment
  }
  if (payload.kind === 'duty' && target.kind === 'position') return moduleCapability(capabilities, payload.sourceModuleId)
  if (payload.kind === 'duty' && target.kind === 'process-node') return capabilities.processPlanning
  if (payload.kind === 'process-node' && target.kind === 'duty') return capabilities.processPlanning
  return { canRead: false, canMutate: false, reason: '此關係組合尚未註冊' }
}

export interface RelationPlacementAutoPanOptions {
  threshold?: number
  maxStep?: number
}

export function getRelationPlacementAutoPanDelta(
  point: Point,
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  options: RelationPlacementAutoPanOptions = {},
) {
  const threshold = options.threshold ?? 48
  const maxStep = options.maxStep ?? 14
  if (threshold <= 0 || maxStep <= 0) return { x: 0, y: 0 }
  const edgeDelta = (distance: number, direction: -1 | 1) => {
    if (distance < 0 || distance >= threshold) return 0
    return direction * Math.ceil(maxStep * (1 - distance / threshold))
  }
  return {
    x: point.x < rect.left + threshold
      ? edgeDelta(point.x - rect.left, -1)
      : point.x > rect.right - threshold
        ? edgeDelta(rect.right - point.x, 1)
        : 0,
    y: point.y < rect.top + threshold
      ? edgeDelta(point.y - rect.top, -1)
      : point.y > rect.bottom - threshold
        ? edgeDelta(rect.bottom - point.y, 1)
        : 0,
  }
}
