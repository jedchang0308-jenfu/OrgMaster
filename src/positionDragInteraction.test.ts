import { describe, expect, it } from 'vitest'
import {
  canCommitPositionDrag,
  calculateDragOffset,
  clearPositionDragCandidate,
  createPositionDragState,
  POSITION_DRAG_THRESHOLD,
  POSITION_HIERARCHY_INTENT_X_THRESHOLD,
  POSITION_Y_SNAP_RADIUS,
  sameOptionalPoint,
  isVerticalPositionDrag,
  setPendingPositionDragCandidate,
  setPreviewedPositionDragCandidate,
  shouldRetainDropPreview,
  snapPositionY,
  startPositionDrag,
  updatePositionDragPointer,
} from './positionDragInteraction'

const candidate = { type: 'sibling' as const, parentId: 'parent', insertIndex: 1 }

describe('position drag interaction state', () => {
  it('uses a small pointer movement threshold to distinguish click from drag', () => {
    expect(POSITION_DRAG_THRESHOLD).toBe(6)
  })

  it('treats two missing optional points as equal', () => {
    expect(sameOptionalPoint(undefined, undefined)).toBe(true)
    expect(sameOptionalPoint(undefined, { x: 0, y: 0 })).toBe(false)
    expect(sameOptionalPoint({ x: 4, y: 8 }, { x: 4, y: 8 })).toBe(true)
  })

  it('keeps the latest pointer and follows the pending to previewed phases', () => {
    const started = startPositionDrag('position-a', { x: 10, y: 20 })
    const pending = setPendingPositionDragCandidate(started, candidate, 100)
    const previewed = setPreviewedPositionDragCandidate(updatePositionDragPointer(pending, { x: 14, y: 24 }), candidate)

    expect(started.phase).toBe('dragging')
    expect(pending).toMatchObject({ phase: 'candidate-pending', stableSince: 100, candidate })
    expect(previewed).toMatchObject({ phase: 'previewed', latestPointer: { x: 14, y: 24 }, candidate })
    expect(canCommitPositionDrag(previewed, candidate)).toBe(true)
    expect(canCommitPositionDrag(previewed, { type: 'sibling', parentId: 'parent', insertIndex: 2 })).toBe(false)
  })

  it('clears the candidate and returns to free dragging', () => {
    const previewed = setPreviewedPositionDragCandidate(startPositionDrag('position-a', { x: 0, y: 0 }), candidate)
    const cleared = clearPositionDragCandidate(previewed)

    expect(cleared).toMatchObject({ phase: 'dragging', movingId: 'position-a', candidate: null, stableSince: null })
    expect(canCommitPositionDrag(cleared, candidate)).toBe(false)
    expect(shouldRetainDropPreview(46)).toBe(true)
    expect(shouldRetainDropPreview(46.01)).toBe(false)
    expect(shouldRetainDropPreview(null)).toBe(false)
  })

  it('calculates the free drag offset from the latest pointer', () => {
    expect(calculateDragOffset({ x: 120, y: 90 }, { x: 20, y: 30 }, { x: 10, y: 15 }))
      .toEqual({ x: 90, y: 45 })
    expect(createPositionDragState().phase).toBe('idle')
  })

  it('keeps vertical tree-card drags out of hierarchy preview zones', () => {
    expect(POSITION_HIERARCHY_INTENT_X_THRESHOLD).toBe(28)
    expect(isVerticalPositionDrag({ x: 27, y: 120 })).toBe(true)
    expect(isVerticalPositionDrag({ x: -27, y: 120 })).toBe(true)
    expect(isVerticalPositionDrag({ x: 28, y: 120 })).toBe(false)
  })

  it('snaps a tree card to the nearest neighbor Y position within the magnet radius', () => {
    const nodes = [
      { id: 'moving', position: { x: 0, y: 100 } },
      { id: 'near', position: { x: 140, y: 180 } },
      { id: 'far', position: { x: 280, y: 260 } },
    ]
    expect(snapPositionY(180 - POSITION_Y_SNAP_RADIUS + 1, nodes, 'moving')).toEqual({ y: 180, targetId: 'near' })
    expect(snapPositionY(180 - POSITION_Y_SNAP_RADIUS - 1, nodes, 'moving')).toEqual({ y: 165, targetId: null })
  })
})
