import { describe, expect, it } from 'vitest'
import { layoutProcessPlanningGraph } from './processPlanningLayout'

describe('process planning layout', () => {
  it('renders deterministic mindmap and marks flow feedback edges', () => {
    const nodes = [
      { id: 'a', processId: 'p', title: 'A', parentNodeId: null, order: 0 },
      { id: 'b', processId: 'p', title: 'B', parentNodeId: 'a', order: 0 },
      { id: 'c', processId: 'p', title: 'C', parentNodeId: 'a', order: 1 },
    ]
    const mindmap = layoutProcessPlanningGraph({ nodes, edges: [], mode: 'mindmap' })
    expect(mindmap.nodes).toHaveLength(3)
    expect(mindmap.edges.map((edge) => edge.id)).toEqual(['parent:b', 'parent:c'])
    const flow = layoutProcessPlanningGraph({ nodes, edges: [{ id: 'e1', processId: 'p', fromNodeId: 'a', toNodeId: 'b' }, { id: 'e2', processId: 'p', fromNodeId: 'b', toNodeId: 'a' }], mode: 'flow' })
    expect(flow.edges.some((edge) => edge.feedback)).toBe(true)
  })
})
