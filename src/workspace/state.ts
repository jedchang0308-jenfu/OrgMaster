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
import { getWorkspaceDefaultContext, getWorkspaceModule, isDrawerWorkspaceModuleId } from './moduleRegistry'
import { sanitizeEntityRef } from './route'
import type {
  DrawerWorkspaceModuleId,
  LayoutDropTarget,
  PromotionIntent,
  SharedSelection,
  WorkspaceModuleId,
  WorkspaceModuleContextMap,
  WorkspaceRouteState,
  WorkspaceSessionState,
  WorkspaceState,
  WorkspaceTransition,
} from './types'

export type WorkspaceAction =
  | { type: 'OPEN_OR_FOCUS'; intent: PromotionIntent; target?: LayoutDropTarget }
  | { type: 'UPDATE_PANEL_CONTEXT'; moduleId: WorkspaceModuleId; context: WorkspaceModuleContextMap[WorkspaceModuleId] }
  | { type: 'COMMIT_CLOSE_PANEL'; moduleId: WorkspaceModuleId }
  | { type: 'SET_ACTIVE_TAB'; stackPath: number[]; moduleId: WorkspaceModuleId }
  | { type: 'MOVE_PANEL'; moduleId: WorkspaceModuleId; target: LayoutDropTarget }
  | { type: 'RESIZE_SPLIT'; splitPath: number[]; ratio: number }
  | { type: 'SET_PINNED'; moduleId: WorkspaceModuleId; pinned: boolean }
  | { type: 'SET_SHARED_SELECTION'; selection: SharedSelection }
  | { type: 'OPEN_DRAWER'; moduleId: DrawerWorkspaceModuleId }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'SET_CLOSE_PENDING'; moduleId: WorkspaceModuleId | null }
  | { type: 'RESTORE_DEFAULT' }
  | { type: 'RECONCILE_ROUTE'; route: WorkspaceRouteState }
  | { type: 'RECONCILE_VERSION'; state: OrgDirectoryState }

export interface WorkspaceReducerContext {
  organizationState: OrgDirectoryState
}

function routeFromState(state: WorkspaceState): WorkspaceRouteState {
  const openPanels = collectLayoutModules(state.layout)
  const contexts: WorkspaceRouteState['contexts'] = {}
  for (const moduleId of openPanels) {
    const panel = state.session.panels[moduleId]
    if (panel) contexts[moduleId] = panel.context as never
  }
  return {
    openPanels,
    focusedPanel: state.session.focusedPanel && openPanels.includes(state.session.focusedPanel) ? state.session.focusedPanel : null,
    selection: state.session.sharedSelection.ref,
    contexts,
  }
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
    drawer: null,
    focusedPanel: route.focusedPanel && route.openPanels.includes(route.focusedPanel)
      ? route.focusedPanel
      : route.openPanels[0] ?? null,
    sharedSelection: { ref: route.selection, sourcePanelId: 'route', revision: 0 },
    panels,
    closePendingModuleId: null,
  }
}

export function createWorkspaceState(layout = defaultWorkspaceLayout(), route?: WorkspaceRouteState): WorkspaceState {
  const openPanels = collectLayoutModules(layout)
  const initialRoute = route ?? {
    openPanels,
    focusedPanel: openPanels[0] ?? null,
    selection: null,
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
  intent: PromotionIntent,
  organizationState: OrgDirectoryState,
  target?: LayoutDropTarget,
): WorkspaceTransition {
  const descriptor = getWorkspaceModule(intent.moduleId)
  const context = descriptor.sanitizeContext(intent.context as never, organizationState)
  const existing = state.session.panels[intent.moduleId]
  let layout = state.layout
  const panels = { ...state.session.panels }
  if (!existing) {
    const focusedPath = state.session.focusedPanel ? findWorkspacePanelPath(layout, state.session.focusedPanel) : null
    layout = insertWorkspacePanel(layout, intent.moduleId, target ?? (focusedPath ? { kind: 'stack', stackPath: focusedPath } : undefined))
    if (!collectLayoutModules(layout).includes(intent.moduleId)) return { state, effects: [{ type: 'announce', message: '無法開啟此功能面板' }] }
    panels[intent.moduleId] = { pinned: false, context, localSelection: null } as never
  } else if (!existing.pinned) {
    panels[intent.moduleId] = { ...existing, context } as never
  }
  layout = focusWorkspacePanel(layout, intent.moduleId)
  const next: WorkspaceState = {
    ...state,
    layout,
    session: {
      ...state.session,
      drawer: intent.source === 'drawer' ? null : state.session.drawer,
      focusedPanel: intent.moduleId,
      panels,
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
      drawer: null,
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
    if (JSON.stringify(panel.context) === JSON.stringify(nextContext)) return { state, effects: [] }
    const next = {
      ...state,
      session: {
        ...state.session,
        panels: {
          ...state.session.panels,
          [action.moduleId]: { ...panel, context: nextContext },
        },
      },
    } as WorkspaceState
    const route = routeFromState(next)
    return { state: { ...next, route }, effects: [{ type: 'replace-route', route }] }
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
  if (action.type === 'OPEN_DRAWER') {
    if (!isDrawerWorkspaceModuleId(action.moduleId) || state.session.drawer === action.moduleId) return { state, effects: [] }
    return { state: { ...state, session: { ...state.session, drawer: action.moduleId } }, effects: [{ type: 'focus-element', target: `workspace-drawer-${action.moduleId}` }] }
  }
  if (action.type === 'CLOSE_DRAWER') {
    if (!state.session.drawer) return { state, effects: [] }
    return { state: { ...state, session: { ...state.session, drawer: null } }, effects: [{ type: 'focus-element', target: 'workspace-launcher' }] }
  }
  if (action.type === 'SET_CLOSE_PENDING') {
    if (state.session.closePendingModuleId === action.moduleId) return { state, effects: [] }
    return { state: { ...state, session: { ...state.session, closePendingModuleId: action.moduleId } }, effects: [] }
  }
  if (action.type === 'RESTORE_DEFAULT') {
    const layout = defaultWorkspaceLayout()
    const route = { openPanels: ['organization'] as WorkspaceModuleId[], focusedPanel: 'organization' as const, selection: null, contexts: {} }
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
