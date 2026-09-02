import { describe, expect, it } from 'vitest'
import type { OrgDirectoryState } from '../types'
import { screenshotOrganizationState } from '../screenshotData'
import { resolveRegisteredDrop, type WorkspaceEntityDragPayloadV1 } from './entityDrag'
import {
  createRelationPlacementSession,
  getRelationPlacementAutoPanDelta,
  reduceRelationPlacementSession,
  resolveRelationPlacementCapability,
  sameRelationPlacementPayload,
  type RelationPlacementCandidate,
  type RelationPlacementCapabilitySet,
} from './relationPlacement'

const state: OrgDirectoryState = {
  ...screenshotOrganizationState,
  duties: [{ id: 'duty-1', title: '工程圖審核', description: null }],
  processes: [{ id: 'process-1', title: '設計', description: null, order: 0 }],
  processNodes: [{ id: 'node-1', processId: 'process-1', title: '審核', parentNodeId: null, order: 0 }],
}

const employee: WorkspaceEntityDragPayloadV1 = {
  version: 1,
  kind: 'employee',
  sourceModuleId: 'employees',
  employeeId: state.employees[0].id,
  sourcePositionId: null,
}

const capabilities: RelationPlacementCapabilitySet = {
  organizationAssignment: { canRead: true, canMutate: true },
  dutyConfiguration: { canRead: true, canMutate: true },
  processPlanning: { canRead: true, canMutate: true },
}

describe('relation placement session', () => {
  it('keeps native and keyboard input in one guarded lifecycle', () => {
    const idle = createRelationPlacementSession()
    const placing = reduceRelationPlacementSession(idle, { type: 'BEGIN', inputMode: 'native-drag', payload: employee })
    expect(placing.phase).toBe('placing')
    const candidate: RelationPlacementCandidate = {
      target: { kind: 'position', positionId: state.positions[0].id },
      status: 'intent',
      effect: 'assign',
      code: null,
    }
    const previewed = reduceRelationPlacementSession(placing, { type: 'PREVIEW', candidate })
    expect(previewed).toMatchObject({ phase: 'placing', candidate })
    const committing = reduceRelationPlacementSession(previewed, { type: 'BEGIN_COMMIT', target: candidate.target })
    expect(committing).toMatchObject({ phase: 'committing', target: candidate.target })
    expect(reduceRelationPlacementSession(committing, { type: 'BEGIN', inputMode: 'keyboard', payload: employee })).toBe(committing)
    expect(reduceRelationPlacementSession(committing, { type: 'FINISH' })).toEqual({ phase: 'idle' })
  })

  it('cancels stale preview and compares payload identity by semantic fields', () => {
    const placing = reduceRelationPlacementSession(createRelationPlacementSession(), { type: 'BEGIN', inputMode: 'keyboard', payload: employee })
    expect(reduceRelationPlacementSession(placing, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
    expect(sameRelationPlacementPayload(employee, { ...employee })).toBe(true)
    expect(sameRelationPlacementPayload(employee, { ...employee, sourcePositionId: 'position-other' })).toBe(false)
    expect(sameRelationPlacementPayload(employee, { ...employee, sourceModuleId: 'organization' })).toBe(false)
  })

  it('[E2-UNLOAD] clears a placing session through owner cleanup cancellation', () => {
    const placing = reduceRelationPlacementSession(createRelationPlacementSession(), { type: 'BEGIN', inputMode: 'native-drag', payload: employee })
    const previewed = reduceRelationPlacementSession(placing, {
      type: 'PREVIEW',
      candidate: {
        target: { kind: 'position', positionId: state.positions[0].id },
        status: 'intent',
        effect: 'assign',
        code: null,
      },
    })

    expect(reduceRelationPlacementSession(previewed, { type: 'CANCEL' })).toEqual({ phase: 'idle' })
    expect(reduceRelationPlacementSession({ phase: 'idle' }, { type: 'PREVIEW', candidate: null })).toEqual({ phase: 'idle' })
  })
})

describe('relation placement capability and geometry', () => {
  it('selects the relation owner and fails closed for unsupported pairs', () => {
    expect(resolveRelationPlacementCapability(employee, { kind: 'position', positionId: 'p' }, capabilities)).toEqual(capabilities.organizationAssignment)
    expect(resolveRelationPlacementCapability({ ...employee, kind: 'process-node', processNodeId: 'node-1', sourceModuleId: 'processes' } as WorkspaceEntityDragPayloadV1, { kind: 'duty', dutyId: 'duty-1' }, capabilities)).toEqual(capabilities.processPlanning)
    expect(resolveRelationPlacementCapability(employee, { kind: 'duty', dutyId: 'duty-1' }, capabilities)).toMatchObject({ canMutate: false, canRead: false })
  })

  it('uses the same edge auto-pan curve as the old drag implementation', () => {
    expect(getRelationPlacementAutoPanDelta({ x: 2, y: 50 }, { left: 0, right: 200, top: 0, bottom: 100 })).toEqual({ x: -14, y: 0 })
    expect(getRelationPlacementAutoPanDelta({ x: 100, y: 50 }, { left: 0, right: 200, top: 0, bottom: 100 })).toEqual({ x: 0, y: 0 })
    expect(getRelationPlacementAutoPanDelta({ x: 100, y: 50 }, { left: 0, right: 200, top: 0, bottom: 100 }, { threshold: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('keeps candidate preview derived from the registered resolver', () => {
    const targetPosition = state.positions.find((position) => !state.assignments.some((assignment) => assignment.positionId === position.id && assignment.employeeId === employee.employeeId))!
    const target = { kind: 'position' as const, positionId: targetPosition.id }
    expect(resolveRegisteredDrop(state, capabilities.organizationAssignment, employee, target).status).toBe('intent')
  })

  it('[E2-INVALID] rejects an unsupported source/target pair without an effect', () => {
    const resolution = resolveRegisteredDrop(state, capabilities.organizationAssignment, employee, { kind: 'duty', dutyId: 'duty-1' })
    expect(resolution).toEqual({ status: 'rejected', code: 'DROP_PAIR_UNSUPPORTED' })
  })

  it('[E2-CAPABILITY-LOSS] fails closed when mutation capability is revoked before commit', () => {
    const revoked: RelationPlacementCapabilitySet = {
      ...capabilities,
      organizationAssignment: { canRead: true, canMutate: false, reason: '目前版本為唯讀' },
    }
    expect(resolveRelationPlacementCapability(employee, { kind: 'position', positionId: 'position-1' }, revoked)).toEqual(revoked.organizationAssignment)
    const resolution = resolveRegisteredDrop(state, revoked.organizationAssignment, employee, { kind: 'position', positionId: state.positions[0].id })
    expect(resolution).toEqual({ status: 'rejected', code: 'READ_ONLY' })
  })
})
