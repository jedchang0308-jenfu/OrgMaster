import type { DutyConfigurationExactLane } from './dutyConfigurationRoute'

export const DUTY_CONFIGURATION_DRAG_MIME = 'application/x-orgmaster-duty-configuration+json'

export interface DutyConfigurationDragPayload {
  version: 1
  dutyId: string
  lane: DutyConfigurationExactLane
  sourceRelationId: string | null
  newRelationId: string
}

export type DutyConfigurationDropCandidate = 'command' | 'noop' | 'invalid'

export type DutyConfigurationDragState =
  | { phase: 'idle' }
  | {
      phase: 'native-dragging' | 'keyboard-grabbed'
      payload: DutyConfigurationDragPayload
      candidatePositionId: string | null
      candidateKind: DutyConfigurationDropCandidate | null
    }
  | {
      phase: 'committing'
      payload: DutyConfigurationDragPayload
      candidatePositionId: string
    }

const exactLanes = new Set<DutyConfigurationExactLane>([
  'primary-execute',
  'collaborate',
  'review',
  'countersign',
])

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function serializeDutyConfigurationDragPayload(payload: DutyConfigurationDragPayload): string {
  return JSON.stringify({
    version: 1,
    dutyId: payload.dutyId,
    lane: payload.lane,
    sourceRelationId: payload.sourceRelationId,
    newRelationId: payload.newRelationId,
  })
}

export function parseDutyConfigurationDragPayload(raw: string | null | undefined): DutyConfigurationDragPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const lane = parsed.lane === 'other-execute' ? 'collaborate' : parsed.lane
    if (parsed.version !== 1 || !nonEmptyString(parsed.dutyId) || !exactLanes.has(lane as DutyConfigurationExactLane)) return null
    if (!(parsed.sourceRelationId === null || parsed.sourceRelationId === undefined || nonEmptyString(parsed.sourceRelationId))) return null
    if (!nonEmptyString(parsed.newRelationId)) return null
    return {
      version: 1,
      dutyId: parsed.dutyId,
      lane: lane as DutyConfigurationExactLane,
      sourceRelationId: parsed.sourceRelationId ? parsed.sourceRelationId : null,
      newRelationId: parsed.newRelationId,
    }
  } catch {
    return null
  }
}

export function createDutyConfigurationDragState(): DutyConfigurationDragState {
  return { phase: 'idle' }
}

export function startDutyConfigurationDrag(
  payload: DutyConfigurationDragPayload,
  mode: 'native' | 'keyboard',
): DutyConfigurationDragState {
  return {
    phase: mode === 'native' ? 'native-dragging' : 'keyboard-grabbed',
    payload,
    candidatePositionId: null,
    candidateKind: null,
  }
}

export function updateDutyConfigurationDragCandidate(
  state: DutyConfigurationDragState,
  positionId: string | null,
  kind: DutyConfigurationDropCandidate | null,
): DutyConfigurationDragState {
  if (state.phase !== 'native-dragging' && state.phase !== 'keyboard-grabbed') return state
  return { ...state, candidatePositionId: positionId, candidateKind: positionId ? kind : null }
}

export function beginDutyConfigurationDrop(
  state: DutyConfigurationDragState,
  positionId: string,
): DutyConfigurationDragState {
  if ((state.phase !== 'native-dragging' && state.phase !== 'keyboard-grabbed') || !positionId) return state
  return { phase: 'committing', payload: state.payload, candidatePositionId: positionId }
}

export function cancelDutyConfigurationDrag(): DutyConfigurationDragState {
  return { phase: 'idle' }
}

export interface DutyConfigurationAutoPanOptions {
  threshold?: number
  maxStep?: number
}

export function getDutyConfigurationAutoPanDelta(
  point: { x: number; y: number },
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  options: DutyConfigurationAutoPanOptions = {},
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
