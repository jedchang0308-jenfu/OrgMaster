export const DUTY_ANOMALY_LONG_PRESS_MS = 450
export const DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX = 6

export type DutyAnomalyPressPhase = 'idle' | 'pressing' | 'picked-up' | 'cancelled'

export interface DutyAnomalyPressPoint {
  x: number
  y: number
}

export interface DutyAnomalyPressState {
  phase: DutyAnomalyPressPhase
  anomalyId: string | null
  pointerId: number | null
  origin: DutyAnomalyPressPoint | null
  latest: DutyAnomalyPressPoint | null
  startedAt: number | null
}

function samePointer(state: DutyAnomalyPressState, pointerId: number) {
  return state.pointerId === pointerId && state.pointerId !== null
}

function distanceFromOrigin(state: DutyAnomalyPressState, point: DutyAnomalyPressPoint) {
  if (!state.origin) return Number.POSITIVE_INFINITY
  return Math.hypot(point.x - state.origin.x, point.y - state.origin.y)
}

export function createDutyAnomalyPressState(): DutyAnomalyPressState {
  return {
    phase: 'idle',
    anomalyId: null,
    pointerId: null,
    origin: null,
    latest: null,
    startedAt: null,
  }
}

export function startDutyAnomalyPress(anomalyId: string, pointerId: number, point: DutyAnomalyPressPoint, startedAt: number): DutyAnomalyPressState {
  return {
    phase: 'pressing',
    anomalyId,
    pointerId,
    origin: point,
    latest: point,
    startedAt,
  }
}

export function updateDutyAnomalyPress(state: DutyAnomalyPressState, pointerId: number, point: DutyAnomalyPressPoint): DutyAnomalyPressState {
  if (!samePointer(state, pointerId) || state.phase === 'idle' || state.phase === 'cancelled') return state
  if (state.phase === 'pressing' && distanceFromOrigin(state, point) > DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX) {
    return { ...state, phase: 'cancelled', latest: point }
  }
  return { ...state, latest: point }
}

export function canActivateDutyAnomalyLongPress(state: DutyAnomalyPressState, now: number): boolean {
  if (state.phase !== 'pressing' || state.startedAt === null || !state.latest) return false
  return now - state.startedAt >= DUTY_ANOMALY_LONG_PRESS_MS
    && distanceFromOrigin(state, state.latest) <= DUTY_ANOMALY_PRESS_MOVE_TOLERANCE_PX
}

export function activateDutyAnomalyLongPress(state: DutyAnomalyPressState, now: number): DutyAnomalyPressState {
  if (!canActivateDutyAnomalyLongPress(state, now)) return state
  return { ...state, phase: 'picked-up' }
}

export function cancelDutyAnomalyPress(state: DutyAnomalyPressState, pointerId?: number): DutyAnomalyPressState {
  if (pointerId !== undefined && !samePointer(state, pointerId)) return state
  if (state.phase === 'idle') return state
  return { ...state, phase: 'cancelled' }
}

export function resetDutyAnomalyPress(): DutyAnomalyPressState {
  return createDutyAnomalyPressState()
}
