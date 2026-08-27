import { describe, expect, it } from 'vitest'
import {
  beginDutyConfigurationDrop,
  createDutyConfigurationDragState,
  getDutyConfigurationAutoPanDelta,
  parseDutyConfigurationDragPayload,
  serializeDutyConfigurationDragPayload,
  startDutyConfigurationDrag,
  updateDutyConfigurationDragCandidate,
} from './dutyConfigurationDrag'

describe('duty configuration drag contract', () => {
  const payload = {
    version: 1 as const,
    dutyId: 'd1',
    lane: 'primary-execute' as const,
    sourceRelationId: null,
    newRelationId: 'r1',
  }

  it('serializes only the versioned allow-list and rejects malformed payloads', () => {
    expect(parseDutyConfigurationDragPayload(serializeDutyConfigurationDragPayload(payload))).toEqual(payload)
    expect(parseDutyConfigurationDragPayload('{"version":2,"dutyId":"d1","lane":"review","newRelationId":"r1"}')).toBeNull()
    expect(parseDutyConfigurationDragPayload('{"version":1,"dutyId":"d1","lane":"unknown","newRelationId":"r1"}')).toBeNull()
  })

  it('keeps source selection, candidate and commit as explicit states', () => {
    const started = startDutyConfigurationDrag(payload, 'keyboard')
    expect(started.phase).toBe('keyboard-grabbed')
    const candidate = updateDutyConfigurationDragCandidate(started, 'p1', 'command')
    expect(candidate).toMatchObject({ candidatePositionId: 'p1', candidateKind: 'command' })
    expect(beginDutyConfigurationDrop(candidate, 'p1')).toMatchObject({ phase: 'committing', candidatePositionId: 'p1' })
    expect(createDutyConfigurationDragState()).toEqual({ phase: 'idle' })
  })

  it('returns bounded two-dimensional edge pan deltas', () => {
    expect(getDutyConfigurationAutoPanDelta({ x: 2, y: 2 }, { left: 0, right: 100, top: 0, bottom: 100 }, { threshold: 48, maxStep: 14 })).toEqual({ x: -14, y: -14 })
    expect(getDutyConfigurationAutoPanDelta({ x: 50, y: 50 }, { left: 0, right: 100, top: 0, bottom: 100 })).toEqual({ x: 0, y: 0 })
  })
})
