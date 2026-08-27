import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from './screenshotData'
import { normalizeProcessPlanningState, resolveProcessPlanningHighlights, validateProcessPlanningState } from './processPlanning'

function stateWithPlanning(overrides: Partial<typeof screenshotOrganizationState> = {}) {
  return {
    ...screenshotOrganizationState,
    processes: [{ id: 'p1', title: '  出貨流程  ', description: '  依訂單出貨  ', order: 0 }],
    processNodes: [
      { id: 'n1', processId: 'p1', title: '  確認訂單 ', parentNodeId: null, order: 0 },
      { id: 'n2', processId: 'p1', title: '備料', parentNodeId: 'n1', order: 0 },
    ],
    processEdges: [{ id: 'e1', processId: 'p1', fromNodeId: 'n1', toNodeId: 'n2' }],
    processNodeDutyLinks: [{ id: 'l1', processNodeId: 'n1', dutyId: 'duty-shipping', order: 0 }],
    duties: [{ id: 'duty-shipping', title: '出貨處理', description: null }],
    dutyPositionRelations: [],
    ...overrides,
  }
}

describe('process planning domain', () => {
  it('normalizes titles and deterministic sibling ordering without changing relationships', () => {
    const normalized = normalizeProcessPlanningState(stateWithPlanning())
    expect(normalized.processes[0]).toMatchObject({ title: '出貨流程', description: '依訂單出貨', order: 0 })
    expect(normalized.processNodes.find((node) => node.id === 'n1')?.order).toBe(0)
    expect(normalized.processNodes.find((node) => node.id === 'n2')?.parentNodeId).toBe('n1')
    expect(validateProcessPlanningState(normalized)).toEqual({ ok: true })
  })

  it('rejects cross-process edges and parent cycles', () => {
    const invalidEdge = stateWithPlanning({
      processes: [
        { id: 'p1', title: '流程一', description: null, order: 0 },
        { id: 'p2', title: '流程二', description: null, order: 1 },
      ],
      processEdges: [{ id: 'e1', processId: 'p1', fromNodeId: 'n1', toNodeId: 'n3' }],
      processNodes: [
        { id: 'n1', processId: 'p1', title: 'A', parentNodeId: null, order: 0 },
        { id: 'n3', processId: 'p2', title: 'B', parentNodeId: null, order: 0 },
      ],
    })
    expect(validateProcessPlanningState(invalidEdge)).toMatchObject({ ok: false, issue: { code: 'PROCESS_EDGE_ENDPOINT_INVALID' } })
    const cycle = stateWithPlanning({ processNodes: [
      { id: 'n1', processId: 'p1', title: 'A', parentNodeId: 'n2', order: 0 },
      { id: 'n2', processId: 'p1', title: 'B', parentNodeId: 'n1', order: 0 },
    ] })
    expect(validateProcessPlanningState(cycle)).toMatchObject({ ok: false, issue: { code: 'PROCESS_NODE_CYCLE' } })
  })

  it('resolves the process-node-duty-position highlight bridge', () => {
    const state = stateWithPlanning({
      dutyPositionRelations: [{ id: 'r1', dutyId: 'duty-shipping', relationType: 'execute', target: { kind: 'position', positionId: 'ceo' }, isPrimaryExecutor: true, order: 0 }],
    })
    expect(resolveProcessPlanningHighlights(state, { processId: 'p1', processNodeId: 'n1', dutyId: null, positionId: null })).toEqual({
      processNodeIds: new Set(['n1']),
      dutyIds: new Set(['duty-shipping']),
      positionIds: new Set(['ceo']),
    })
  })
})
