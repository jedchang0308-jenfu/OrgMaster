/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import type { WorkspaceEntityDragPayloadV1 } from './entityDrag'
import {
  describeRelationPlacementFeedback,
  isRelationDragInteractiveDescendant,
  projectRelationPlacementTarget,
  relationDropEffectFor,
  sameRelationPlacementTarget,
} from './relationDragInteraction'

const payload: WorkspaceEntityDragPayloadV1 = {
  version: 1,
  kind: 'employee',
  sourceModuleId: 'employees',
  employeeId: 'employee-1',
  sourcePositionId: null,
}

describe('relation drag interaction projection', () => {
  it('excludes interactive descendants but allows the source root itself', () => {
    const root = document.createElement('button')
    const label = document.createElement('span')
    const nestedButton = document.createElement('button')
    root.append(label, nestedButton)
    document.body.appendChild(root)
    expect(isRelationDragInteractiveDescendant(root, root)).toBe(false)
    expect(isRelationDragInteractiveDescendant(label, root)).toBe(false)
    expect(isRelationDragInteractiveDescendant(nestedButton, root)).toBe(true)
    nestedButton.dataset.relationDragHandle = 'true'
    expect(isRelationDragInteractiveDescendant(nestedButton, root)).toBe(false)
    root.remove()
  })

  it('maps intent, noop and rejected candidates to distinct non-colour feedback', () => {
    const target = { kind: 'position' as const, positionId: 'position-1' }
    const valid = { target, status: 'intent' as const, effect: 'move' as const, code: null }
    const noop = { target, status: 'noop' as const, effect: 'noop' as const, code: 'DUPLICATE_ASSIGNMENT' as const }
    const rejected = { target, status: 'rejected' as const, effect: 'rejected' as const, code: 'DROP_PAIR_UNSUPPORTED' as const }
    expect(describeRelationPlacementFeedback(valid)).toBe('可移動任職')
    expect(describeRelationPlacementFeedback(noop)).toBe('此任職已存在，未重複建立')
    expect(describeRelationPlacementFeedback(rejected)).toBe('此資料不能放到該類型落點')
    expect(relationDropEffectFor(valid)).toBe('move')
    expect(relationDropEffectFor({ ...valid, effect: 'link' })).toBe('link')
    expect(relationDropEffectFor(noop)).toBe('none')
  })

  it('projects availability without duplicating resolver pair logic', () => {
    const target = { kind: 'position' as const, positionId: 'position-1' }
    expect(projectRelationPlacementTarget({ active: false, available: true, target })).toMatchObject({ state: 'idle', dropEffect: 'none' })
    expect(projectRelationPlacementTarget({ active: true, available: true, target })).toMatchObject({ state: 'available', message: '可放置' })
    expect(projectRelationPlacementTarget({
      active: true,
      available: true,
      target,
      candidate: { target, status: 'intent', effect: 'assign', code: null },
    })).toMatchObject({ state: 'valid', dropEffect: 'copy', message: '可建立任職' })
    expect(projectRelationPlacementTarget({
      active: false,
      available: false,
      target,
      outcome: { target, state: 'rejected', message: '資料失效', token: 1 },
    })).toMatchObject({ state: 'rejected', message: '資料失效' })
    expect(payload.kind).toBe('employee')
  })

  it('compares only registered target identity', () => {
    expect(sameRelationPlacementTarget({ kind: 'position', positionId: 'p1' }, { kind: 'position', positionId: 'p1' })).toBe(true)
    expect(sameRelationPlacementTarget({ kind: 'position', positionId: 'p1' }, { kind: 'position', positionId: 'p2' })).toBe(false)
    expect(sameRelationPlacementTarget({ kind: 'employee-unassign' }, { kind: 'employee-unassign' })).toBe(true)
    expect(sameRelationPlacementTarget({ kind: 'duty', dutyId: 'd1' }, { kind: 'process-node', processNodeId: 'd1' })).toBe(false)
  })
})
