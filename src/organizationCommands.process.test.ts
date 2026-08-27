import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from './screenshotData'
import { executeOrganizationCommand } from './organizationCommands'

function baseState() {
  return {
    ...screenshotOrganizationState,
    processes: [{ id: 'p1', title: '出貨流程', description: null, order: 0 }],
    processNodes: [{ id: 'n1', processId: 'p1', title: '確認訂單', parentNodeId: null, order: 0 }],
    processEdges: [],
    processNodeDutyLinks: [],
    duties: [{ id: 'd1', title: '出貨處理', description: null }],
    dutyPositionRelations: [],
  }
}

describe('process planning organization commands', () => {
  it('creates, moves and deletes a process leaf atomically', () => {
    const state = baseState()
    const created = executeOrganizationCommand(state, { type: 'CREATE_PROCESS_NODE', node: { id: 'n2', processId: 'p1', title: '備料', parentNodeId: 'n1', order: 0 } })
    expect(created.status).toBe('applied')
    const moved = executeOrganizationCommand(created.status === 'applied' ? created.state : state, { type: 'MOVE_PROCESS_NODE', nodeId: 'n2', parentNodeId: null, insertIndex: 1 })
    expect(moved.status).toBe('applied')
    const deleted = executeOrganizationCommand(moved.status === 'applied' ? moved.state : state, { type: 'DELETE_PROCESS_LEAF_NODE', nodeId: 'n2' })
    expect(deleted.status).toBe('applied')
    expect(deleted.status === 'applied' ? deleted.state.processNodes.map((node) => node.id) : []).toEqual(['n1'])
  })

  it('does not delete a duty referenced by a process node and does not partially mutate', () => {
    const state = { ...baseState(), processNodeDutyLinks: [{ id: 'l1', processNodeId: 'n1', dutyId: 'd1', order: 0 }] }
    const result = executeOrganizationCommand(state, { type: 'DELETE_DUTY', dutyId: 'd1' })
    expect(result).toMatchObject({ status: 'rejected', issue: { code: 'DUTY_PROCESS_LINK_IN_USE', dutyIds: ['d1'], processIds: ['p1'], processNodeIds: ['n1'] } })
    expect(result.state).toBe(state)
  })

  it('creates a duty and its process link in one command', () => {
    const state = baseState()
    const result = executeOrganizationCommand(state, { type: 'CREATE_DUTY_AND_LINK_PROCESS_NODE', duty: { id: 'd2', title: '包裝', description: null }, link: { id: 'l2', processNodeId: 'n1', dutyId: 'd2', order: 0 } })
    expect(result.status).toBe('applied')
    if (result.status === 'applied') {
      expect(result.state.duties.some((duty) => duty.id === 'd2')).toBe(true)
      expect(result.state.processNodeDutyLinks).toContainEqual({ id: 'l2', processNodeId: 'n1', dutyId: 'd2', order: 0 })
    }
  })
})
