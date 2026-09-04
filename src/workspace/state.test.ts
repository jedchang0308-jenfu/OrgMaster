import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import { collectLayoutModules, defaultWorkspaceLayout } from './layout'
import { createWorkspaceState, reduceWorkspaceState } from './state'

const context = { organizationState: screenshotOrganizationState }

describe('workspace state', () => {
  it('opens once, focuses an existing panel and preserves pinned context', () => {
    let current = createWorkspaceState(defaultWorkspaceLayout())
    const first = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'employees', source: 'launcher', context: { employeeId: screenshotOrganizationState.employees[0].id, query: '' } },
    }, context)
    current = first.state
    expect(collectLayoutModules(current.layout)).toEqual(['organization', 'employees'])
    expect(first.effects.some((effect) => effect.type === 'push-route')).toBe(true)
    current = reduceWorkspaceState(current, { type: 'SET_PINNED', moduleId: 'employees', pinned: true }, context).state
    const promoted = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'employees', source: 'launcher', context: { employeeId: screenshotOrganizationState.employees[1].id, query: 'new' } },
    }, context)
    expect(collectLayoutModules(promoted.state.layout)).toEqual(['organization', 'employees'])
    expect(promoted.state.session.panels.employees?.context).toEqual({ employeeId: screenshotOrganizationState.employees[0].id, query: '' })
    expect(promoted.effects).toContainEqual({ type: 'announce', message: '員工面板已聚焦' })
  })

  it('supports a true zero-panel state after the last panel close', () => {
    const current = createWorkspaceState(defaultWorkspaceLayout())
    const closed = reduceWorkspaceState(current, { type: 'COMMIT_CLOSE_PANEL', moduleId: 'organization' }, context)
    expect(collectLayoutModules(closed.state.layout)).toEqual([])
    expect(closed.state.session.focusedPanel).toBeNull()
    expect(closed.state.route.openPanels).toEqual([])
  })

  it('preserves existing context when launcher focus has no explicit context', () => {
    let current = createWorkspaceState(defaultWorkspaceLayout())
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'employees', source: 'launcher', context: { employeeId: screenshotOrganizationState.employees[0].id, query: '張' } },
    }, context).state
    const focused = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'employees', source: 'launcher' },
    }, context)
    expect(focused.state.session.panels.employees?.context).toEqual({ employeeId: screenshotOrganizationState.employees[0].id, query: '張' })
  })

  it('collapses and reopens detail without changing the selected context', () => {
    let current = createWorkspaceState(defaultWorkspaceLayout())
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'employees', source: 'launcher', context: { employeeId: screenshotOrganizationState.employees[0].id, query: '張' } },
    }, context).state
    const collapsed = reduceWorkspaceState(current, { type: 'SET_DETAIL_VISIBILITY', moduleId: 'employees', visible: false }, context)
    expect(collapsed.state.session.openDetails).toEqual([])
    expect(collapsed.state.session.panels.employees?.context).toEqual({ employeeId: screenshotOrganizationState.employees[0].id, query: '張' })
    expect(collapsed.state.route.openDetails).toEqual([])

    const reopenedFromSameSelection = reduceWorkspaceState(collapsed.state, {
      type: 'UPDATE_PANEL_CONTEXT',
      moduleId: 'employees',
      context: { employeeId: screenshotOrganizationState.employees[0].id, query: '張' },
      openDetail: true,
    }, context)
    expect(reopenedFromSameSelection.state.session.openDetails).toEqual(['employees'])

    const reopened = reduceWorkspaceState(collapsed.state, { type: 'SET_DETAIL_VISIBILITY', moduleId: 'employees', visible: true }, context)
    expect(reopened.state.session.openDetails).toEqual(['employees'])
    expect(reopened.state.session.panels.employees?.context).toEqual({ employeeId: screenshotOrganizationState.employees[0].id, query: '張' })
  })

  it('focuses an already-active tab in another visible region', () => {
    let current = createWorkspaceState(defaultWorkspaceLayout())
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'employees', source: 'launcher', context: { employeeId: null, query: '' } },
      target: { kind: 'edge', stackPath: [], edge: 'right' },
    }, context).state
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'organization', source: 'launcher', context: {} },
    }, context).state

    const focused = reduceWorkspaceState(current, { type: 'SET_ACTIVE_TAB', stackPath: [1], moduleId: 'employees' }, context)
    expect(focused.state.layout).toBe(current.layout)
    expect(focused.state.session.focusedPanel).toBe('employees')
    expect(focused.state.route.focusedPanel).toBe('employees')
    expect(focused.effects.map((effect) => effect.type)).toEqual(['replace-route'])
  })

  it('maps a flattened narrow-mode tab back to its desktop stack', () => {
    let current = createWorkspaceState(defaultWorkspaceLayout())
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'role-risks', source: 'launcher', context: { ruleId: null, employeeId: null } },
      target: { kind: 'edge', stackPath: [], edge: 'right' },
    }, context).state
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'governance', source: 'launcher', context: { section: 'identity' } },
      target: { kind: 'stack', stackPath: [1] },
    }, context).state

    const focused = reduceWorkspaceState(current, { type: 'SET_ACTIVE_TAB', stackPath: [], moduleId: 'role-risks' }, context)
    expect(focused.state.session.focusedPanel).toBe('role-risks')
    expect(focused.state.route.focusedPanel).toBe('role-risks')
    expect(focused.state.layout.root).toMatchObject({
      kind: 'split',
      second: { kind: 'stack', activeTab: 'role-risks' },
    })
  })

  it('updates semantic panel context even when the panel is pinned', () => {
    const organizationState = { ...screenshotOrganizationState, duties: [{ id: 'duty-1', title: '測試職掌', description: null }] }
    const reducerContext = { organizationState }
    let current = createWorkspaceState(defaultWorkspaceLayout())
    current = reduceWorkspaceState(current, {
      type: 'OPEN_OR_FOCUS',
      intent: { moduleId: 'duties', source: 'launcher', context: { dutyId: null, lane: null, view: 'configuration', query: '', statusFilters: [], focusPositionId: null, sourceRelationId: null, attentionOnly: false } },
    }, reducerContext).state
    current = reduceWorkspaceState(current, { type: 'SET_PINNED', moduleId: 'duties', pinned: true }, reducerContext).state
    const updated = reduceWorkspaceState(current, {
      type: 'UPDATE_PANEL_CONTEXT',
      moduleId: 'duties',
      context: { dutyId: 'duty-1', lane: 'review', view: 'configuration', query: '', statusFilters: [], focusPositionId: null, sourceRelationId: null, attentionOnly: false },
    }, reducerContext)

    expect(updated.state.session.panels.duties?.context).toMatchObject({ dutyId: 'duty-1', lane: 'review' })
    expect(updated.effects.map((effect) => effect.type)).toEqual(['replace-route'])
  })

  it('sanitizes shared selection and version-switched panel context', () => {
    let current = createWorkspaceState(defaultWorkspaceLayout())
    current = reduceWorkspaceState(current, {
      type: 'SET_SHARED_SELECTION',
      selection: { ref: { kind: 'employee', id: 'missing' }, sourcePanelId: 'global-search', revision: 1 },
    }, context).state
    expect(current.session.sharedSelection.ref).toBeNull()
    const nextState = { ...screenshotOrganizationState, employees: [] }
    current = reduceWorkspaceState(current, { type: 'RECONCILE_VERSION', state: nextState }, { organizationState: nextState }).state
    expect(current.session.sharedSelection.ref).toBeNull()
  })
})
