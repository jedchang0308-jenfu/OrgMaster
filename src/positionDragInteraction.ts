import { DROP_CANDIDATE_EXIT_RADIUS, sameDropCandidate, type DropCandidate } from './drag'
import type { Point } from './types'

export const POSITION_DRAG_THRESHOLD = 6
export const POSITION_Y_SNAP_RADIUS = 14
export const POSITION_HIERARCHY_INTENT_X_THRESHOLD = 28
export type PositionDragPhase = 'idle' | 'dragging' | 'candidate-pending' | 'previewed'

export interface PositionDragState {
  phase: PositionDragPhase
  movingId: string | null
  candidate: DropCandidate | null
  stableSince: number | null
  latestPointer: Point | null
}

export function createPositionDragState(): PositionDragState {
  return {
    phase: 'idle',
    movingId: null,
    candidate: null,
    stableSince: null,
    latestPointer: null,
  }
}

export function startPositionDrag(movingId: string, pointer: Point): PositionDragState {
  return {
    phase: 'dragging',
    movingId,
    candidate: null,
    stableSince: null,
    latestPointer: pointer,
  }
}

export function updatePositionDragPointer(state: PositionDragState, pointer: Point): PositionDragState {
  return { ...state, latestPointer: pointer }
}

export function setPendingPositionDragCandidate(
  state: PositionDragState,
  candidate: DropCandidate,
  stableSince: number,
): PositionDragState {
  return {
    ...state,
    phase: 'candidate-pending',
    candidate,
    stableSince,
  }
}

export function setPreviewedPositionDragCandidate(
  state: PositionDragState,
  candidate: DropCandidate,
): PositionDragState {
  return {
    ...state,
    phase: 'previewed',
    candidate,
    stableSince: null,
  }
}

export function clearPositionDragCandidate(state: PositionDragState): PositionDragState {
  return {
    ...state,
    phase: state.movingId ? 'dragging' : 'idle',
    candidate: null,
    stableSince: null,
  }
}

export function resetPositionDrag(): PositionDragState {
  return createPositionDragState()
}

export function canCommitPositionDrag(state: PositionDragState, releaseCandidate: DropCandidate | null) {
  return state.phase === 'previewed'
    && Boolean(state.candidate)
    && Boolean(releaseCandidate)
    && sameDropCandidate(state.candidate, releaseCandidate)
}

export function shouldRetainDropPreview(distance: number | null) {
  return distance !== null && distance <= DROP_CANDIDATE_EXIT_RADIUS
}

export function sameOptionalPoint(first: Point | undefined, second: Point | undefined) {
  if (first === second) return true
  if (!first || !second) return false
  return first.x === second.x && first.y === second.y
}

export function calculateDragOffset(point: Point, origin: Point, grabOffset: Point): Point {
  return {
    x: point.x - origin.x - grabOffset.x,
    y: point.y - origin.y - grabOffset.y,
  }
}

export function isVerticalPositionDrag(offset: Point) {
  return Math.abs(offset.x) < POSITION_HIERARCHY_INTENT_X_THRESHOLD
}

export interface PositionYSnapResult {
  y: number
  targetId: string | null
}

export function snapPositionY(
  y: number,
  nodes: Array<{ id: string; position: Point }>,
  movingId: string,
): PositionYSnapResult {
  const nearest = nodes
    .filter((node) => node.id !== movingId)
    .map((node) => ({ node, distance: Math.abs(node.position.y - y) }))
    .sort((first, second) => first.distance - second.distance || first.node.id.localeCompare(second.node.id))[0]

  return nearest && nearest.distance <= POSITION_Y_SNAP_RADIUS
    ? { y: nearest.node.position.y, targetId: nearest.node.id }
    : { y, targetId: null }
}
