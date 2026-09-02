import { describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import type { OrgDirectoryState } from '../types'
import {
  readWorkspaceEntityDrag,
  describeRegisteredDropEffect,
  resolveRegisteredDrop,
  WORKSPACE_ENTITY_DRAG_MIME,
  writeWorkspaceEntityDrag,
  type WorkspaceEntityDragPayloadV1,
} from './entityDrag'

const state: OrgDirectoryState = {
  ...screenshotOrganizationState,
  duties: [{ id: 'duty-1', title: '工程圖審核', description: null }],
  processes: [{ id: 'process-1', title: '設計', description: null, order: 0 }],
  processNodes: [{ id: 'node-1', processId: 'process-1', title: '審核', parentNodeId: null, order: 0 }],
}
const writable = { canMutate: true }

describe('workspace entity drag', () => {
  it('uses a separate strict MIME payload and rejects panel or expanded domain objects', () => {
    const values = new Map<string, string>()
    const transfer = { getData: (key: string) => values.get(key) ?? '', setData: (key: string, value: string) => values.set(key, value) }
    const payload: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'employee', sourceModuleId: 'employees', employeeId: state.employees[0].id, sourcePositionId: null }
    expect(writeWorkspaceEntityDrag(transfer, payload)).toBe(true)
    expect(values.has(WORKSPACE_ENTITY_DRAG_MIME)).toBe(true)
    expect(readWorkspaceEntityDrag(transfer)).toEqual(payload)
    values.set(WORKSPACE_ENTITY_DRAG_MIME, JSON.stringify({ ...payload, employeeName: '不可信名稱' }))
    expect(readWorkspaceEntityDrag(transfer)).toBeNull()
    values.set(WORKSPACE_ENTITY_DRAG_MIME, JSON.stringify({ version: 1, kind: 'panel-layout', sourceModuleId: 'employees' }))
    expect(readWorkspaceEntityDrag(transfer)).toBeNull()
  })

  it('resolves employee assignment and readonly/invalid drops without committing', () => {
    const employeeId = state.employees[0].id
    const target = state.positions.find((position) => !state.assignments.some((assignment) => assignment.positionId === position.id && assignment.employeeId === employeeId))!
    const payload: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'employee', sourceModuleId: 'employees', employeeId, sourcePositionId: null }
    expect(resolveRegisteredDrop(state, writable, payload, { kind: 'position', positionId: target.id })).toEqual({ status: 'intent', intent: { kind: 'employee-assignment', employeeId, sourcePositionId: null, targetPositionId: target.id } })
    expect(resolveRegisteredDrop(state, { canMutate: false }, payload, { kind: 'position', positionId: target.id })).toEqual({ status: 'rejected', code: 'READ_ONLY' })
    expect(resolveRegisteredDrop(state, writable, null, { kind: 'position', positionId: target.id })).toEqual({ status: 'rejected', code: 'PAYLOAD_INVALID' })
  })

  it('describes assignment, replacement, unassign and relation effects without mutating state', () => {
    const employeeId = state.employees[0].id
    const assignedPosition = state.assignments.find((assignment) => assignment.employeeId === employeeId)?.positionId
    const freePosition = state.positions.find((position) => position.id !== assignedPosition && !state.assignments.some((assignment) => assignment.positionId === position.id))!
    const sourcePayload: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'employee', sourceModuleId: 'organization', employeeId, sourcePositionId: assignedPosition ?? null }
    const moveResolution = resolveRegisteredDrop(state, writable, sourcePayload, { kind: 'position', positionId: freePosition.id })
    expect(describeRegisteredDropEffect(state, sourcePayload, { kind: 'position', positionId: freePosition.id }, moveResolution)).toBe('move')
    const unassignTarget = { kind: 'employee-unassign' as const }
    const unassignResolution = resolveRegisteredDrop(state, writable, sourcePayload, unassignTarget)
    expect(describeRegisteredDropEffect(state, sourcePayload, unassignTarget, unassignResolution)).toBe('unassign')
    const duty: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'duty', sourceModuleId: 'duties', dutyId: 'duty-1', lane: 'review', sourceRelationId: null }
    const dutyTarget = { kind: 'position' as const, positionId: freePosition.id }
    const dutyResolution = resolveRegisteredDrop(state, writable, duty, dutyTarget)
    expect(describeRegisteredDropEffect(state, duty, dutyTarget, dutyResolution)).toBe('configure')
  })

  it('reuses the duty resolver and produces one canonical process-link command', () => {
    const positionId = state.positions[0].id
    const duty: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'duty', sourceModuleId: 'duties', dutyId: 'duty-1', lane: 'review', sourceRelationId: null }
    const positionDrop = resolveRegisteredDrop(state, writable, duty, { kind: 'position', positionId })
    expect(positionDrop).toMatchObject({ status: 'intent', intent: { kind: 'organization-command', command: { type: 'UPSERT_DUTY_RELATION', relation: { dutyId: 'duty-1', target: { kind: 'position', positionId }, relationType: 'review' } } } })
    const processDrop = resolveRegisteredDrop(state, writable, { ...duty, lane: null }, { kind: 'process-node', processNodeId: 'node-1' })
    expect(processDrop).toEqual({ status: 'intent', intent: { kind: 'organization-command', command: { type: 'LINK_PROCESS_NODE_DUTY', link: { id: 'process-duty-1', processNodeId: 'node-1', dutyId: 'duty-1', order: 0 } } } })
    const linked = { ...state, processNodeDutyLinks: [{ id: 'existing', processNodeId: 'node-1', dutyId: 'duty-1', order: 0 }] }
    expect(resolveRegisteredDrop(linked, writable, duty, { kind: 'process-node', processNodeId: 'node-1' })).toEqual({ status: 'noop', code: 'DUPLICATE_RELATION' })
    expect(vi.fn()).not.toHaveBeenCalled()
  })
})
