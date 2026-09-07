import type { OrgDirectoryState } from '../types'
import {
  collectLayoutModules,
  defaultWorkspaceLayout,
  findWorkspacePanelPath,
  focusWorkspacePanel,
  insertWorkspacePanel,
  moveWorkspacePanel,
  reconcileWorkspaceLayout,
  removeWorkspacePanel,
  resizeWorkspaceSplit,
  setWorkspaceActiveTab,
} from './layout'
import { getWorkspaceDefaultContext, getWorkspaceModule } from './moduleRegistry'
import { sanitizeEntityRef } from './route'
import type {
  LayoutDropTarget,
  WorkspaceOpenIntent,
  SharedSelection,
  WorkspaceModuleId,
  WorkspaceModuleContextMap,
  WorkspaceRouteState,
  WorkspaceSessionState,
  WorkspaceState,
  WorkspaceTransition,
} from './types'

export type WorkspaceAction =
  | { type: 'OPEN_OR_FOCUS'; intent: WorkspaceOpenIntent; target?: LayoutDropTarget }
  | { type: 'UPDATE_PANEL_CONTEXT'; moduleId: WorkspaceModuleId; context: WorkspaceModuleContextMap[WorkspaceModuleId]; openDetail?: boolean }
  | { type: 'SET_DETAIL_VISIBILITY'; moduleId: WorkspaceModuleId; visible: boolean }
  | { type: 'COMMIT_CLOSE_PANEL'; moduleId: WorkspaceModuleId }
  | { type: 'SET_ACTIVE_TAB'; stackPath: number[]; moduleId: WorkspaceModuleId }
  | { type: 'MOVE_PANEL'; moduleId: WorkspaceModuleId; target: LayoutDropTarget }
  | { type: 'RESIZE_SPLIT'; splitPath: number[]; ratio: number }
  | { type: 'SET_PINNED'; moduleId: WorkspaceModuleId; pinned: boolean }
  | { type: 'SET_SHARED_SELECTION'; selection: SharedSelection }
  | { type: 'SET_CLOSE_PENDING'; moduleId: WorkspaceModuleId | null }
  | { type: 'RESTORE_DEFAULT' }
  | { type: 'RECONCILE_ROUTE'; route: WorkspaceRouteState }
  | { type: 'RECONCILE_VERSION'; state: OrgDirectoryState }

export interface WorkspaceReducerContext {
  organizationState: OrgDirectoryState
}

function routeFromState(state: WorkspaceState): WorkspaceRouteState {
  const openPanels = collectLayoutModules(state.layout)
  const openDetails = state.session.openDetails.filter((moduleId) => openPanels.includes(moduleId))
  const contexts: WorkspaceRouteState['contexts'] = {}
  for (const moduleId of openPanels) {
    const panel = state.session.panels[moduleId]
    if (panel) contexts[moduleId] = panel.context as never
  }
  return {
    openPanels,
    focusedPanel: state.session.focusedPanel && openPanels.includes(state.session.focusedPanel) ? state.session.focusedPanel : null,
    selection: state.session.sharedSelection.ref,
    openDetails,
    contexts,
  }
}

function contextRequestsDetail(moduleId: WorkspaceModuleId, context: WorkspaceModuleContextMap[WorkspaceModuleId]) {
  if (!getWorkspaceModule(moduleId).supportsCollapsibleDetail) return false
  if (moduleId === 'employees') return Boolean((context as WorkspaceModuleContextMap['employees']).employeeId)
  if (moduleId === 'positions') return Boolean((context as WorkspaceModuleContextMap['positions']).positionId)
  if (moduleId === 'departments') return Boolean((context as WorkspaceModuleContextMap['departments']).departmentId)
  if (moduleId === 'duties') return Boolean((context as WorkspaceModuleContextMap['duties']).dutyId)
  if (moduleId === 'levels') return Boolean((context as WorkspaceModuleContextMap['levels']).levelId)
  if (moduleId === 'processes') {
    const processContext = context as WorkspaceModuleContextMap['processes']
    return Boolean(processContext.processId || processContext.processNodeId || processContext.dutyId)
  }
  if (moduleId === 'management-methods') return Boolean((context as WorkspaceModuleContextMap['management-methods']).methodId)
  if (moduleId === 'role-risks') {
    const riskContext = context as WorkspaceModuleContextMap['role-risks']
    return Boolean(riskContext.ruleId || riskContext.employeeId)
  }
  return false
}

export function createWorkspaceSessionState(route: WorkspaceRouteState): WorkspaceSessionState {
  const panels: WorkspaceSessionState['panels'] = {}
  for (const moduleId of route.openPanels) {
    panels[moduleId] = {
      pinned: false,
      context: (route.contexts[moduleId] ?? getWorkspaceDefaultContext(moduleId)) as never,
      localSelection: null,
    }
  }
  return {
    focusedPanel: route.focusedPanel && route.openPanels.includes(route.focusedPanel)
      ? route.focusedPanel
      : route.openPanels[0] ?? null,
    sharedSelection: { ref: route.selection, sourcePanelId: 'route', revision: 0 },
    panels,
    openDetails: route.openDetails.filter((moduleId) => {
      const panel = panels[moduleId]
      return Boolean(panel && route.openPanels.includes(moduleId) && getWorkspaceModule(moduleId).supportsCollapsibleDetail)
    }),
    closePendingModuleId: null,
  }
}

export function createWorkspaceState(layout = defaultWorkspaceLayout(), route?: WorkspaceRouteState): WorkspaceState {
  const openPanels = collectLayoutModules(layout)
  const initialRoute = route ?? {
    openPanels,
    focusedPanel: openPanels[0] ?? null,
    selection: null,
    openDetails: [],
    contexts: {},
  }
  const reconciledLayout = reconcileWorkspaceLayout(layout, initialRoute.openPanels, initialRoute.focusedPanel)
  const state: WorkspaceState = {
    layout: reconciledLayout,
    route: initialRoute,
    session: createWorkspaceSessionState(initialRoute),
  }
  return { ...state, route: routeFromState(state) }
}

function withWorkspaceEffects(previous: WorkspaceState, next: WorkspaceState, routeEffect: 'push-route' | 'replace-route' | null): WorkspaceTransition {
  if (next === previous) return { state: previous, effects: [] }
  const route = routeFromState(next)
  const state = { ...next, route }
  return {
    state,
    effects: [
      ...(routeEffect ? [{ type: routeEffect, route } as const] : []),
      { type: 'schedule-layout-save', layout: state.layout },
    ],
  }
}

export function openOrFocusPanel(
  state: WorkspaceState,
  intent: WorkspaceOpenIntent,
  organizationState: OrgDirectoryState,
  target?: LayoutDropTarget,
): WorkspaceTransition {
  const descriptor = getWorkspaceModule(intent.moduleId)
  const existing = state.session.panels[intent.moduleId]
  const context = descriptor.sanitizeContext(
    (intent.context ?? existing?.context ?? getWorkspaceDefaultContext(intent.moduleId)) as never,
    organizationState,
  )
  let layout = state.layout
  const panels = { ...state.session.panels }
  let openDetails = state.session.openDetails
  if (!existing) {
    const focusedPath = state.session.focusedPanel ? findWorkspacePanelPath(layout, state.session.focusedPanel) : null
    layout = insertWorkspacePanel(layout, intent.moduleId, target ?? (focusedPath ? { kind: 'stack', stackPath: focusedPath } : undefined))
    if (!collectLayoutModules(layout).includes(intent.moduleId)) return { state, effects: [{ type: 'announce', message: '無法開啟此功能面板' }] }
    panels[intent.moduleId] = { pinned: false, context, localSelection: null } as never
    if (intent.context !== undefined && contextRequestsDetail(intent.moduleId, context)) openDetails = [...openDetails, intent.moduleId]
  } else if (!existing.pinned && intent.context !== undefined) {
    panels[intent.moduleId] = { ...existing, context } as never
    if (contextRequestsDetail(intent.moduleId, context) && !openDetails.includes(intent.moduleId)) openDetails = [...openDetails, intent.moduleId]
  }
  layout = focusWorkspacePanel(layout, intent.moduleId)
  const next: WorkspaceState = {
    ...state,
    layout,
    session: {
      ...state.session,
      focusedPanel: intent.moduleId,
      panels,
      openDetails,
    },
  }
  const transition = withWorkspaceEffects(state, next, 'push-route')
  if (existing) transition.effects.push({ type: 'announce', message: `${descriptor.label}面板已聚焦` })
  return transition
}

export function commitCloseWorkspacePanel(state: WorkspaceState, moduleId: WorkspaceModuleId): WorkspaceTransition {
  if (!state.session.panels[moduleId]) return { state, effects: [] }
  const layout = removeWorkspacePanel(state.layout, moduleId)
  const panels = { ...state.session.panels }
  delete panels[moduleId]
  const openPanels = collectLayoutModules(layout)
  const focusedPanel = state.session.focusedPanel === moduleId
    ? openPanels[0] ?? null
    : state.session.focusedPanel
  return withWorkspaceEffects(state, {
    ...state,
    layout,
    session: {
      ...state.session,
      panels,
      openDetails: state.session.openDetails.filter((detailModuleId) => detailModuleId !== moduleId),
      focusedPanel,
      closePendingModuleId: null,
    },
  }, 'push-route')
}

export function pinWorkspacePanel(state: WorkspaceState, moduleId: WorkspaceModuleId, pinned: boolean): WorkspaceTransition {
  const panel = state.session.panels[moduleId]
  if (!panel || panel.pinned === pinned) return { state, effects: [] }
  const panels = { ...state.session.panels, [moduleId]: { ...panel, pinned } }
  return withWorkspaceEffects(state, { ...state, session: { ...state.session, panels } }, null)
}

export function setSharedSelection(
  state: WorkspaceState,
  selection: SharedSelection,
  organizationState: OrgDirectoryState,
): WorkspaceTransition {
  const sanitized = { ...selection, ref: sanitizeEntityRef(selection.ref, organizationState) }
  if (
    JSON.stringify(sanitized.ref) === JSON.stringify(state.session.sharedSelection.ref)
    && sanitized.sourcePanelId === state.session.sharedSelection.sourcePanelId
  ) return { state, effects: [] }
  return withWorkspaceEffects(state, { ...state, session: { ...state.session, sharedSelection: sanitized } }, 'replace-route')
}

function reconcileRoute(state: WorkspaceState, route: WorkspaceRouteState, organizationState: OrgDirectoryState): WorkspaceTransition {
  const layout = reconcileWorkspaceLayout(state.layout, route.openPanels, route.focusedPanel)
  const panels: WorkspaceSessionState['panels'] = {}
  for (const moduleId of route.openPanels) {
    const existing = state.session.panels[moduleId]
    const context = getWorkspaceModule(moduleId).sanitizeContext(
      (route.contexts[moduleId] ?? existing?.context ?? getWorkspaceDefaultContext(moduleId)) as never,
      organizationState,
    )
    panels[moduleId] = existing?.pinned ? existing as never : { pinned: false, context, localSelection: null } as never
  }
  const next: WorkspaceState = {
    ...state,
    layout,
    session: {
      ...state.session,
      focusedPanel: route.focusedPanel && route.openPanels.includes(route.focusedPanel) ? route.focusedPanel : route.openPanels[0] ?? null,
      sharedSelection: {
        ref: sanitizeEntityRef(route.selection, organizationState),
        sourcePanelId: 'route',
        revision: state.session.sharedSelection.revision + 1,
      },
      panels,
      openDetails: route.openDetails.filter((moduleId) => {
        const panel = panels[moduleId]
        return Boolean(panel && getWorkspaceModule(moduleId).supportsCollapsibleDetail)
      }),
    },
  }
  return withWorkspaceEffects(state, next, null)
}

export function reduceWorkspaceState(
  state: WorkspaceState,
  action: WorkspaceAction,
  context: WorkspaceReducerContext,
): WorkspaceTransition {
  if (action.type === 'OPEN_OR_FOCUS') return openOrFocusPanel(state, action.intent, context.organizationState, action.target)
  if (action.type === 'UPDATE_PANEL_CONTEXT') {
    const panel = state.session.panels[action.moduleId]
    if (!panel) return { state, effects: [] }
    const nextContext = getWorkspaceModule(action.moduleId).sanitizeContext(action.context as never, context.organizationState)
    const contextUnchanged = JSON.stringify(panel.context) === JSON.stringify(nextContext)
    const nextOpenDetails = action.openDetail === true
      ? [...state.session.openDetails.filter((moduleId) => moduleId !== action.moduleId), action.moduleId]
      : action.openDetail === false
        ? state.session.openDetails.filter((moduleId) => moduleId !== action.moduleId)
        : state.session.openDetails
    if (contextUnchanged && JSON.stringify(nextOpenDetails) === JSON.stringify(state.session.openDetails)) return { state, effects: [] }
    const next = {
      ...state,
      session: {
        ...state.session,
        panels: contextUnchanged ? state.session.panels : {
          ...state.session.panels,
          [action.moduleId]: { ...panel, context: nextContext },
        },
        openDetails: nextOpenDetails,
      },
    } as WorkspaceState
    const route = routeFromState(next)
    return { state: { ...next, route }, effects: [{ type: 'replace-route', route }] }
  }
  if (action.type === 'SET_DETAIL_VISIBILITY') {
    const panel = state.session.panels[action.moduleId]
    if (!panel || !getWorkspaceModule(action.moduleId).supportsCollapsibleDetail) return { state, effects: [] }
    const visible = action.visible
    const openDetails = visible
      ? [...state.session.openDetails.filter((moduleId) => moduleId !== action.moduleId), action.moduleId]
      : state.session.openDetails.filter((moduleId) => moduleId !== action.moduleId)
    if (JSON.stringify(openDetails) === JSON.stringify(state.session.openDetails)) return { state, effects: [] }
    return withWorkspaceEffects(state, { ...state, session: { ...state.session, openDetails } }, 'push-route')
  }
  if (action.type === 'COMMIT_CLOSE_PANEL') return commitCloseWorkspacePanel(state, action.moduleId)
  if (action.type === 'SET_ACTIVE_TAB') {
    const requestedLayout = setWorkspaceActiveTab(state.layout, action.stackPath, action.moduleId)
    // Narrow mode flattens every open module into one temporary tab strip, so
    // its visual stack path does not necessarily exist in the persisted desktop
    // split tree. Fall back to the module's canonical desktop stack to keep the
    // URL/session focus and the restored desktop active tab aligned.
    const layout = requestedLayout === state.layout
      ? focusWorkspacePanel(state.layout, action.moduleId)
      : requestedLayout
    if (layout === state.layout && state.session.focusedPanel === action.moduleId) return { state, effects: [] }
    if (layout === state.layout) {
      const next = { ...state, session: { ...state.session, focusedPanel: action.moduleId } }
      const route = routeFromState(next)
      return { state: { ...next, route }, effects: [{ type: 'replace-route', route }] }
    }
    return withWorkspaceEffects(state, { ...state, layout, session: { ...state.session, focusedPanel: action.moduleId } }, 'replace-route')
  }
  if (action.type === 'MOVE_PANEL') {
    const layout = moveWorkspacePanel(state.layout, action.moduleId, action.target)
    return layout === state.layout ? { state, effects: [] } : withWorkspaceEffects(state, { ...state, layout }, null)
  }
  if (action.type === 'RESIZE_SPLIT') {
    const layout = resizeWorkspaceSplit(state.layout, action.splitPath, action.ratio)
    return layout === state.layout ? { state, effects: [] } : withWorkspaceEffects(state, { ...state, layout }, null)
  }
  if (action.type === 'SET_PINNED') {
    return pinWorkspacePanel(state, action.moduleId, action.pinned)
  }
  if (action.type === 'SET_SHARED_SELECTION') {
    return setSharedSelection(state, action.selection, context.organizationState)
  }
  if (action.type === 'SET_CLOSE_PENDING') {
    if (state.session.closePendingModuleId === action.moduleId) return { state, effects: [] }
    return { state: { ...state, session: { ...state.session, closePendingModuleId: action.moduleId } }, effects: [] }
  }
  if (action.type === 'RESTORE_DEFAULT') {
    const layout = defaultWorkspaceLayout()
    const route = { openPanels: ['organization'] as WorkspaceModuleId[], focusedPanel: 'organization' as const, selection: null, openDetails: [], contexts: {} }
    const next = createWorkspaceState(layout, route)
    return { state: next, effects: [{ type: 'push-route', route: next.route }, { type: 'schedule-layout-save', layout }] }
  }
  if (action.type === 'RECONCILE_ROUTE') return reconcileRoute(state, action.route, context.organizationState)
  if (action.type === 'RECONCILE_VERSION') {
    const panels = { ...state.session.panels }
    for (const moduleId of collectLayoutModules(state.layout)) {
      const panel = panels[moduleId]
      if (!panel) continue
      panels[moduleId] = { ...panel, context: getWorkspaceModule(moduleId).sanitizeContext(panel.context as never, action.state) } as never
    }
    const next = {
      ...state,
      session: {
        ...state.session,
        panels,
        openDetails: state.session.openDetails.filter((moduleId) => {
          const panel = panels[moduleId]
          return Boolean(panel && getWorkspaceModule(moduleId).supportsCollapsibleDetail)
        }),
        sharedSelection: {
          ...state.session.sharedSelection,
          ref: sanitizeEntityRef(state.session.sharedSelection.ref, action.state),
          revision: state.session.sharedSelection.revision + 1,
        },
      },
    }
    return withWorkspaceEffects(state, next, 'replace-route')
  }
  return { state, effects: [] }
}
