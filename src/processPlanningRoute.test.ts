import { describe, expect, it } from 'vitest'
import { buildProcessPlanningUrl, normalizeProcessPlanningLocation, readProcessPlanningLocation } from './processPlanningRoute'
import { screenshotOrganizationState } from './screenshotData'

describe('process planning route', () => {
  it('keeps view and selection in a shareable URL', () => {
    const location = readProcessPlanningLocation({ pathname: '/process-planning', search: '?view=flow&process=p1&node=n1&duty=d1' })
    expect(location).toMatchObject({ active: true, view: 'flow', processId: 'p1', processNodeId: 'n1', dutyId: 'd1' })
    expect(buildProcessPlanningUrl(location)).toBe('/process-planning?view=flow&process=p1&node=n1&duty=d1')
  })

  it('drops stale node and duty selections during canonicalization', () => {
    const state = { ...screenshotOrganizationState, processes: [{ id: 'p1', title: '流程', description: null, order: 0 }], processNodes: [{ id: 'n1', processId: 'p1', title: '節點', parentNodeId: null, order: 0 }], processEdges: [], processNodeDutyLinks: [], duties: [], dutyPositionRelations: [] }
    expect(normalizeProcessPlanningLocation({ active: true, view: 'mindmap', processId: 'p1', processNodeId: 'missing', dutyId: 'missing' }, state)).toEqual({ active: true, view: 'mindmap', processId: 'p1', processNodeId: null, dutyId: null })
  })
})
