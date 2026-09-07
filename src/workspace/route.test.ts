import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import { WORKSPACE_MODULE_ORDER } from './moduleRegistry'
import { readLegacyWorkspaceIntent, readWorkspaceRoute, writeWorkspaceRoute } from './route'
import type { WorkspaceRouteState } from './types'

const state = {
  ...screenshotOrganizationState,
  duties: [{ id: 'duty-1', title: '繪圖', description: null }],
  processes: [{ id: 'process-1', title: '出貨', description: null, order: 0 }],
  processNodes: [{ id: 'node-1', processId: 'process-1', title: '審核', parentNodeId: null, order: 0 }],
  processNodeDutyLinks: [{ id: 'link-1', processNodeId: 'node-1', dutyId: 'duty-1', order: 0 }],
}

describe('workspace route', () => {
  it('round-trips the exact ten-module semantic context and ignores unknown panels', () => {
    const route: WorkspaceRouteState = {
      openPanels: [...WORKSPACE_MODULE_ORDER],
      focusedPanel: 'duties',
      selection: { kind: 'duty', id: 'duty-1' },
      openDetails: ['employees', 'positions', 'departments', 'duties', 'management-methods'],
      contexts: {
        employees: { employeeId: state.employees[0].id, query: '張' },
        positions: { positionId: state.positions[0].id, query: '總經理' },
        departments: { departmentId: state.departments[0].id },
        levels: { levelId: state.organizationLevels[0].id },
        duties: { dutyId: 'duty-1', lane: 'review', view: 'audit', query: '圖', statusFilters: ['no-executor'], focusPositionId: state.positions[0].id, sourceRelationId: null, attentionOnly: true },
        processes: { processId: 'process-1', processNodeId: 'node-1', dutyId: 'duty-1', view: 'flow' },
        'management-methods': { methodId: 'method-1', view: 'readable', query: '人員', chapter: '目的' },
        'role-risks': { ruleId: null, employeeId: state.employees[0].id },
        governance: { section: 'audit' },
      },
    }
    const url = new URL(writeWorkspaceRoute(route), 'http://localhost')
    url.searchParams.append('panels', 'unknown')
    const parsed = readWorkspaceRoute(url, state).route
    expect(parsed.openPanels).toEqual(WORKSPACE_MODULE_ORDER)
    expect(parsed.focusedPanel).toBe('duties')
    expect(parsed.selection).toEqual({ kind: 'duty', id: 'duty-1' })
    expect(parsed.contexts.duties).toMatchObject({ dutyId: 'duty-1', lane: 'review', view: 'audit', attentionOnly: true })
    expect(parsed.contexts.processes).toEqual({ processId: 'process-1', processNodeId: 'node-1', dutyId: 'duty-1', view: 'flow' })
    expect(parsed.contexts['management-methods']).toMatchObject({ methodId: 'method-1', view: 'readable', chapter: '目的' })
  })

  it('supports explicit zero panels and sanitizes stale entity IDs', () => {
    expect(readWorkspaceRoute({ pathname: '/', search: '?panels=none&select=employee:missing' }, state)).toEqual({
      explicitPanels: true,
      route: { openPanels: [], focusedPanel: null, selection: null, openDetails: [], contexts: {} },
    })
  })

  it('distinguishes an explicit details=none from legacy detail inference', () => {
    const legacy = readWorkspaceRoute({
      pathname: '/',
      search: `?panels=employees&employee=${encodeURIComponent(state.employees[0].id)}`,
    }, state).route
    expect(legacy.openDetails).toEqual(['employees'])

    const explicitNone = readWorkspaceRoute({
      pathname: '/',
      search: `?panels=employees&employee=${encodeURIComponent(state.employees[0].id)}&details=none`,
    }, state).route
    expect(explicitNone.openDetails).toEqual([])
  })

  it('accepts an explicit detail token without a selected entity for empty/create detail', () => {
    const route = readWorkspaceRoute({ pathname: '/', search: '?panels=employees&details=employees' }, state).route
    expect(route.openDetails).toEqual(['employees'])
  })

  it('maps legacy duty, process and management-method routes into workspace intents', () => {
    expect(readLegacyWorkspaceIntent({ pathname: '/', search: '?mode=duty-config&duty=duty-1&lane=review' }, state)).toMatchObject({ moduleId: 'duties', source: 'legacy-route', context: { dutyId: 'duty-1', lane: 'review' } })
    expect(readLegacyWorkspaceIntent({ pathname: '/process-planning', search: '?view=flow&process=process-1&node=node-1&duty=duty-1' }, state)).toMatchObject({ moduleId: 'processes', context: { processId: 'process-1', processNodeId: 'node-1', dutyId: 'duty-1', view: 'flow' } })
    expect(readLegacyWorkspaceIntent({ pathname: '/management-methods/method-1', search: '?view=readable', hash: '#目的' }, state)).toMatchObject({ moduleId: 'management-methods', context: { methodId: 'method-1', view: 'readable', chapter: '目的' } })
  })
})
