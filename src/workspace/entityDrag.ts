import { getActiveAssignments } from '../assignments'
import { resolveDutyConfigurationAssignmentCommand, type DutyConfigurationIssueCode } from '../dutyConfiguration'
import type { DutyConfigurationExactLane } from '../dutyConfigurationRoute'
import type { OrganizationCommand } from '../organizationCommands'
import type { OrgDirectoryState } from '../types'
import { isWorkspaceModuleId } from './moduleRegistry'
import type { ModuleCapability, WorkspaceModuleId } from './types'

export const WORKSPACE_ENTITY_DRAG_MIME = 'application/x-orgmaster-entity'

export type WorkspaceEntityDragPayloadV1 =
  | {
      version: 1
      kind: 'employee'
      sourceModuleId: WorkspaceModuleId
      employeeId: string
      sourcePositionId: string | null
    }
  | {
      version: 1
      kind: 'duty'
      sourceModuleId: WorkspaceModuleId
      dutyId: string
      lane: DutyConfigurationExactLane | null
      sourceRelationId: string | null
    }
  | {
      version: 1
      kind: 'process-node'
      sourceModuleId: WorkspaceModuleId
      processNodeId: string
    }

export type RegisteredDropTarget =
  | { kind: 'position'; positionId: string }
  | { kind: 'employee-unassign' }
  | { kind: 'process-node'; processNodeId: string }
  | { kind: 'duty'; dutyId: string }

export type DomainMutationIntent =
  | {
      kind: 'employee-assignment'
      employeeId: string
      sourcePositionId: string | null
      targetPositionId: string | null
    }
  | { kind: 'organization-command'; command: OrganizationCommand }

export type RegisteredDropIssueCode =
  | 'READ_ONLY'
  | 'PAYLOAD_INVALID'
  | 'DROP_PAIR_UNSUPPORTED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'POSITION_NOT_FOUND'
  | 'SOURCE_ASSIGNMENT_NOT_FOUND'
  | 'DUTY_NOT_FOUND'
  | 'PROCESS_NODE_NOT_FOUND'
  | 'DUTY_LANE_REQUIRED'
  | 'DUPLICATE_RELATION'
  | DutyConfigurationIssueCode

export type RegisteredDropResolution =
  | { status: 'intent'; intent: DomainMutationIntent }
  | { status: 'noop'; code: 'SAME_TARGET' | 'DUPLICATE_RELATION' | 'DUPLICATE_ASSIGNMENT' }
  | { status: 'rejected'; code: RegisteredDropIssueCode }

/**
 * A stable, UI-independent description of what a registered drop will do.
 * The resolver remains the source of truth; this enum is only for affordances
 * (labels, icons and preview styling) and is deliberately not persisted.
 */
export type RegisteredDropEffect =
  | 'assign'
  | 'assign-additional'
  | 'move'
  | 'unassign'
  | 'replace'
  | 'configure'
  | 'transfer-primary'
  | 'link'
  | 'noop'
  | 'rejected'

interface DataTransferReader {
  getData(format: string): string
}

interface DataTransferWriter {
  setData(format: string, data: string): void
}

const lanes = new Set<DutyConfigurationExactLane>(['primary-execute', 'collaborate', 'review', 'countersign'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index])
}

function isStableId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && value.length <= 200
}

function isNullableStableId(value: unknown): value is string | null {
  return value === null || isStableId(value)
}

function parseWorkspaceEntityDragPayload(value: unknown): WorkspaceEntityDragPayloadV1 | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.sourceModuleId !== 'string' || !isWorkspaceModuleId(value.sourceModuleId)) return null
  if (value.kind === 'employee') {
    if (!hasExactKeys(value, ['version', 'kind', 'sourceModuleId', 'employeeId', 'sourcePositionId'])) return null
    return isStableId(value.employeeId) && isNullableStableId(value.sourcePositionId)
      ? value as WorkspaceEntityDragPayloadV1
      : null
  }
  if (value.kind === 'duty') {
    if (!hasExactKeys(value, ['version', 'kind', 'sourceModuleId', 'dutyId', 'lane', 'sourceRelationId'])) return null
    const lane = value.lane
    return isStableId(value.dutyId)
      && (lane === null || (typeof lane === 'string' && lanes.has(lane as DutyConfigurationExactLane)))
      && isNullableStableId(value.sourceRelationId)
      ? value as WorkspaceEntityDragPayloadV1
      : null
  }
  if (value.kind === 'process-node') {
    if (!hasExactKeys(value, ['version', 'kind', 'sourceModuleId', 'processNodeId'])) return null
    return isStableId(value.processNodeId) ? value as WorkspaceEntityDragPayloadV1 : null
  }
  return null
}

export function readWorkspaceEntityDrag(dataTransfer: DataTransferReader): WorkspaceEntityDragPayloadV1 | null {
  const raw = dataTransfer.getData(WORKSPACE_ENTITY_DRAG_MIME)
  if (!raw) return null
  try {
    return parseWorkspaceEntityDragPayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeWorkspaceEntityDrag(dataTransfer: DataTransferWriter, payload: WorkspaceEntityDragPayloadV1) {
  const parsed = parseWorkspaceEntityDragPayload(payload)
  if (!parsed) return false
  dataTransfer.setData(WORKSPACE_ENTITY_DRAG_MIME, JSON.stringify(parsed))
  return true
}

function nextProcessDutyLinkId(state: OrgDirectoryState) {
  let index = state.processNodeDutyLinks.length + 1
  while (state.processNodeDutyLinks.some((link) => link.id === `process-duty-${index}`)) index += 1
  return `process-duty-${index}`
}

function resolveEmployeeDrop(
  state: OrgDirectoryState,
  payload: Extract<WorkspaceEntityDragPayloadV1, { kind: 'employee' }>,
  target: RegisteredDropTarget,
): RegisteredDropResolution {
  if (!state.employees.some((employee) => employee.id === payload.employeeId)) return { status: 'rejected', code: 'EMPLOYEE_NOT_FOUND' }
  const activeAssignments = getActiveAssignments(state.assignments)
  const sourceAssignment = payload.sourcePositionId
    ? activeAssignments.find((assignment) => assignment.employeeId === payload.employeeId && assignment.positionId === payload.sourcePositionId)
    : null
  if (payload.sourcePositionId && !sourceAssignment) return { status: 'rejected', code: 'SOURCE_ASSIGNMENT_NOT_FOUND' }

  if (target.kind === 'employee-unassign') {
    if (!payload.sourcePositionId) return { status: 'noop', code: 'SAME_TARGET' }
    return {
      status: 'intent',
      intent: {
        kind: 'employee-assignment',
        employeeId: payload.employeeId,
        sourcePositionId: payload.sourcePositionId,
        targetPositionId: null,
      },
    }
  }
  if (target.kind !== 'position') return { status: 'rejected', code: 'DROP_PAIR_UNSUPPORTED' }
  if (!state.positions.some((position) => position.id === target.positionId && position.status === 'active')) return { status: 'rejected', code: 'POSITION_NOT_FOUND' }
  if (payload.sourcePositionId === target.positionId) return { status: 'noop', code: 'SAME_TARGET' }
  const alreadyAssigned = activeAssignments.some((assignment) => assignment.employeeId === payload.employeeId && assignment.positionId === target.positionId)
  if (alreadyAssigned && !payload.sourcePositionId) return { status: 'noop', code: 'DUPLICATE_ASSIGNMENT' }
  return {
    status: 'intent',
    intent: {
      kind: 'employee-assignment',
      employeeId: payload.employeeId,
      sourcePositionId: payload.sourcePositionId,
      targetPositionId: target.positionId,
    },
  }
}

function resolveDutyToPosition(
  state: OrgDirectoryState,
  payload: Extract<WorkspaceEntityDragPayloadV1, { kind: 'duty' }>,
  target: Extract<RegisteredDropTarget, { kind: 'position' }>,
): RegisteredDropResolution {
  if (!payload.lane) return { status: 'rejected', code: 'DUTY_LANE_REQUIRED' }
  const resolution = resolveDutyConfigurationAssignmentCommand(state, {
    dutyId: payload.dutyId,
    positionId: target.positionId,
    lane: payload.lane,
    sourceRelationId: payload.sourceRelationId,
  })
  if (resolution.status === 'command') return { status: 'intent', intent: { kind: 'organization-command', command: resolution.command } }
  if (resolution.status === 'noop') return { status: 'noop', code: resolution.code === 'DUPLICATE_ASSIGNMENT' ? 'DUPLICATE_ASSIGNMENT' : 'SAME_TARGET' }
  return { status: 'rejected', code: resolution.code }
}

function resolveProcessDutyLink(
  state: OrgDirectoryState,
  processNodeId: string,
  dutyId: string,
): RegisteredDropResolution {
  const node = state.processNodes.find((candidate) => candidate.id === processNodeId)
  if (!node) return { status: 'rejected', code: 'PROCESS_NODE_NOT_FOUND' }
  if (!state.duties.some((duty) => duty.id === dutyId)) return { status: 'rejected', code: 'DUTY_NOT_FOUND' }
  if (state.processNodeDutyLinks.some((link) => link.processNodeId === processNodeId && link.dutyId === dutyId)) {
    return { status: 'noop', code: 'DUPLICATE_RELATION' }
  }
  const order = state.processNodeDutyLinks.filter((link) => link.processNodeId === processNodeId).length
  return {
    status: 'intent',
    intent: {
      kind: 'organization-command',
      command: {
        type: 'LINK_PROCESS_NODE_DUTY',
        link: { id: nextProcessDutyLinkId(state), processNodeId, dutyId, order },
      },
    },
  }
}

export function resolveRegisteredDrop(
  state: OrgDirectoryState,
  capability: Pick<ModuleCapability, 'canMutate'>,
  payload: WorkspaceEntityDragPayloadV1 | null,
  target: RegisteredDropTarget,
): RegisteredDropResolution {
  if (!capability.canMutate) return { status: 'rejected', code: 'READ_ONLY' }
  const parsed = parseWorkspaceEntityDragPayload(payload)
  if (!parsed) return { status: 'rejected', code: 'PAYLOAD_INVALID' }
  if (parsed.kind === 'employee') return resolveEmployeeDrop(state, parsed, target)
  if (parsed.kind === 'duty') {
    if (target.kind === 'position') return resolveDutyToPosition(state, parsed, target)
    if (target.kind === 'process-node') return resolveProcessDutyLink(state, target.processNodeId, parsed.dutyId)
    return { status: 'rejected', code: 'DROP_PAIR_UNSUPPORTED' }
  }
  if (target.kind === 'duty') return resolveProcessDutyLink(state, parsed.processNodeId, target.dutyId)
  return { status: 'rejected', code: 'DROP_PAIR_UNSUPPORTED' }
}

/**
 * Projects a fresh resolver result into a small visual vocabulary. It must be
 * called with the same current state and payload used by resolveRegisteredDrop
 * and must never be used as a mutation command by itself.
 */
export function describeRegisteredDropEffect(
  state: OrgDirectoryState,
  payload: WorkspaceEntityDragPayloadV1 | null,
  target: RegisteredDropTarget,
  resolution: RegisteredDropResolution,
): RegisteredDropEffect {
  if (resolution.status === 'rejected') return 'rejected'
  if (resolution.status === 'noop') return 'noop'
  if (!payload) return 'rejected'

  if (payload.kind === 'employee' && payload.sourcePositionId && target.kind === 'employee-unassign') return 'unassign'
  if (payload.kind === 'employee' && target.kind === 'position') {
    const targetPosition = state.positions.find((position) => position.id === target.positionId)
    const occupied = getActiveAssignments(state.assignments).some((assignment) => assignment.positionId === target.positionId)
    if (occupied && targetPosition && !targetPosition.allowMultipleAssignees) return 'replace'
    if (payload.sourcePositionId) return 'move'
    return occupied ? 'assign-additional' : 'assign'
  }
  if (payload.kind === 'duty' && target.kind === 'position') {
    const command = resolution.intent.kind === 'organization-command' ? resolution.intent.command : null
    return command?.type === 'TRANSFER_PRIMARY_DUTY_EXECUTOR' ? 'transfer-primary' : 'configure'
  }
  if ((payload.kind === 'duty' && target.kind === 'process-node') || (payload.kind === 'process-node' && target.kind === 'duty')) return 'link'
  return 'rejected'
}
