import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { OrgDirectoryState } from '../types'
import { collectLayoutModules, defaultWorkspaceLayout, reconcileWorkspaceLayout, resolveAutomaticPanelTarget } from './layout'
import { flushWorkspaceLayoutSave, loadWorkspaceLayout, scheduleWorkspaceLayoutSave } from './layoutStorage'
import { getWorkspaceDefaultContext } from './moduleRegistry'
import { readLegacyWorkspaceIntent, readWorkspaceRoute, writeWorkspaceRoute } from './route'
import { createWorkspaceState, reduceWorkspaceState, type WorkspaceAction } from './state'
import type {
  EntityRef,
  PanelCloseGuard,
  PanelCloseGuardResult,
  WorkspaceOpenIntent,
  RequestPanelClose,
  WorkspaceLayoutV1,
  WorkspaceModuleContextMap,
  WorkspaceModuleId,
  WorkspaceRouteState,
  WorkspaceState,
  WorkspaceTransition,
} from './types'

interface WorkspaceLocationLike {
  pathname: string
  search: string
  hash: string
}

export interface WorkspaceBrowserAdapter {
  location(): WorkspaceLocationLike
  push(url: string): void
  replace(url: string): void
  subscribePopState(listener: () => void): () => void
  focus(target: string): void
  viewportWidth(): number
}

export interface WorkspaceBootstrapResult {
  state: WorkspaceState
  canonicalUrl: string
  usedLegacyWorkspace: boolean
}

function routeForLayout(layout: WorkspaceLayoutV1): WorkspaceRouteState {
  const openPanels = collectLayoutModules(layout)
  const contexts: WorkspaceRouteState['contexts'] = {}
  for (const moduleId of openPanels) {
    ;(contexts as Partial<Record<WorkspaceModuleId, unknown>>)[moduleId] = getWorkspaceDefaultContext(moduleId)
  }
  return { openPanels, focusedPanel: openPanels[0] ?? null, selection: null, openDetails: [], contexts }
}

export function createWorkspaceBootstrap(
  organizationState: OrgDirectoryState,
  location: WorkspaceLocationLike,
  savedLayout: WorkspaceLayoutV1 | null,
): WorkspaceBootstrapResult {
  const snapshot = readWorkspaceRoute(location, organizationState)
  const baseLayout = savedLayout ?? defaultWorkspaceLayout()
  if (snapshot.explicitPanels) {
    const layout = reconcileWorkspaceLayout(baseLayout, snapshot.route.openPanels, snapshot.route.focusedPanel)
    const state = createWorkspaceState(layout, snapshot.route)
    return { state, canonicalUrl: writeWorkspaceRoute(state.route), usedLegacyWorkspace: false }
  }
  const legacy = readLegacyWorkspaceIntent(location, organizationState)
  if (legacy) {
    const baseState = createWorkspaceState(baseLayout, routeForLayout(baseLayout))
    const transition = reduceWorkspaceState(baseState, { type: 'OPEN_OR_FOCUS', intent: legacy }, { organizationState })
    return { state: transition.state, canonicalUrl: writeWorkspaceRoute(transition.state.route), usedLegacyWorkspace: true }
  }
  const state = createWorkspaceState(baseLayout, routeForLayout(baseLayout))
  return { state, canonicalUrl: writeWorkspaceRoute(state.route), usedLegacyWorkspace: false }
}

function defaultBrowser(): WorkspaceBrowserAdapter {
  return {
    location: () => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }),
    push: (url) => window.history.pushState({}, '', url),
    replace: (url) => window.history.replaceState({}, '', url),
    subscribePopState: (listener) => {
      window.addEventListener('popstate', listener)
      return () => window.removeEventListener('popstate', listener)
    },
    focus: (target) => {
      window.requestAnimationFrame(() => document.getElementById(target)?.focus())
    },
    viewportWidth: () => window.innerWidth,
  }
}

export interface UseWorkspaceControllerOptions {
  organizationState: OrgDirectoryState
  enabled?: boolean
  browser?: WorkspaceBrowserAdapter
  initialLayout?: WorkspaceLayoutV1 | null
  onLayoutPersistenceFailure?: () => void
}

export interface WorkspaceController {
  state: WorkspaceState
  announcement: string
  dispatch(action: WorkspaceAction): void
  openOrFocus<K extends WorkspaceModuleId>(moduleId: K, context?: WorkspaceModuleContextMap[K], source?: WorkspaceOpenIntent['source']): void
  updatePanelContext<K extends WorkspaceModuleId>(moduleId: K, context: WorkspaceModuleContextMap[K], options?: { openDetail?: boolean }): void
  setDetailVisibility(moduleId: WorkspaceModuleId, visible: boolean): void
  requestWorkspaceDetailTransition(moduleId: WorkspaceModuleId, options: { visible: boolean; context?: WorkspaceModuleContextMap[WorkspaceModuleId]; focusTarget?: string }): Promise<PanelCloseGuardResult>
  requestWorkspacePanelClose: RequestPanelClose
  registerWorkspacePanelCloseGuard(moduleId: WorkspaceModuleId, guard: PanelCloseGuard | null): () => void
  setSharedSelection(ref: EntityRef | null, sourcePanelId: WorkspaceModuleId | 'global-search'): void
}

export function useWorkspaceController({
  organizationState,
  enabled = true,
  browser: suppliedBrowser,
  initialLayout,
  onLayoutPersistenceFailure,
}: UseWorkspaceControllerOptions): WorkspaceController {
  const browserRef = useRef<WorkspaceBrowserAdapter | null>(null)
  if (!browserRef.current) browserRef.current = suppliedBrowser ?? defaultBrowser()
  const browser = browserRef.current
  const bootstrapRef = useRef<WorkspaceBootstrapResult | null>(null)
  if (!bootstrapRef.current) {
    const savedLayout = initialLayout === undefined ? loadWorkspaceLayout() : initialLayout
    bootstrapRef.current = createWorkspaceBootstrap(organizationState, browser.location(), savedLayout)
  }
  const [state, replaceState] = useReducer((_previous: WorkspaceState, next: WorkspaceState) => next, bootstrapRef.current.state)
  const stateRef = useRef(state)
  stateRef.current = state
  const organizationStateRef = useRef(organizationState)
  organizationStateRef.current = organizationState
  const layoutPersistenceFailureRef = useRef(onLayoutPersistenceFailure)
  layoutPersistenceFailureRef.current = onLayoutPersistenceFailure
  const closeGuards = useRef(new Map<WorkspaceModuleId, PanelCloseGuard>())
  const detailTransitionRevision = useRef(0)
  const [announcement, setAnnouncement] = useState('')
  const startedRef = useRef(false)

  const executeEffects = useCallback((transition: WorkspaceTransition) => {
    for (const effect of transition.effects) {
      if (effect.type === 'push-route') browser.push(writeWorkspaceRoute(effect.route))
      else if (effect.type === 'replace-route') browser.replace(writeWorkspaceRoute(effect.route))
      else if (effect.type === 'schedule-layout-save') scheduleWorkspaceLayoutSave(effect.layout, { onFailure: () => layoutPersistenceFailureRef.current?.() })
      else if (effect.type === 'focus-element') browser.focus(effect.target)
      else if (effect.type === 'announce') setAnnouncement(effect.message)
    }
  }, [browser])

  const commitTransition = useCallback((transition: WorkspaceTransition) => {
    if (transition.state === stateRef.current && transition.effects.length === 0) return
    stateRef.current = transition.state
    replaceState(transition.state)
    executeEffects(transition)
  }, [executeEffects])

  const dispatch = useCallback((action: WorkspaceAction) => {
    commitTransition(reduceWorkspaceState(stateRef.current, action, { organizationState: organizationStateRef.current }))
  }, [commitTransition])

  const runCloseGuard = useCallback(async (moduleId: WorkspaceModuleId): Promise<PanelCloseGuardResult> => {
    dispatch({ type: 'SET_CLOSE_PENDING', moduleId })
    try {
      return await (closeGuards.current.get(moduleId)?.() ?? Promise.resolve({ kind: 'allow' as const }))
    } catch {
      return { kind: 'keep-open' }
    } finally {
      dispatch({ type: 'SET_CLOSE_PENDING', moduleId: null })
    }
  }, [dispatch])

  const requestWorkspacePanelClose = useCallback<RequestPanelClose>(async (moduleId) => {
    if (!stateRef.current.session.panels[moduleId]) return { kind: 'allow' }
    const result = await runCloseGuard(moduleId)
    if (result.kind === 'allow') {
      dispatch({ type: 'COMMIT_CLOSE_PANEL', moduleId })
      const nextFocus = stateRef.current.session.focusedPanel
      if (nextFocus) browser.focus(`workspace-tab-${nextFocus}`)
    } else {
      browser.focus(result.focusTarget ?? `workspace-close-${moduleId}`)
    }
    return result
  }, [browser, dispatch, runCloseGuard])

  const registerWorkspacePanelCloseGuard = useCallback((moduleId: WorkspaceModuleId, guard: PanelCloseGuard | null) => {
    if (guard) closeGuards.current.set(moduleId, guard)
    else closeGuards.current.delete(moduleId)
    return () => {
      if (!guard || closeGuards.current.get(moduleId) === guard) closeGuards.current.delete(moduleId)
    }
  }, [])

  const openOrFocus = useCallback(<K extends WorkspaceModuleId>(
    moduleId: K,
    context: WorkspaceModuleContextMap[K] | undefined = undefined,
    source: WorkspaceOpenIntent['source'] = 'launcher',
  ) => {
    const current = stateRef.current
    const availableWidth = Math.max(0, browser.viewportWidth())
    const target = current.session.panels[moduleId]
      ? undefined
      : resolveAutomaticPanelTarget(current.layout, current.session.focusedPanel, moduleId, availableWidth)
    dispatch({ type: 'OPEN_OR_FOCUS', intent: { moduleId, ...(context === undefined ? {} : { context }), source } as WorkspaceOpenIntent, target })
  }, [browser, dispatch])

  const updatePanelContext = useCallback(<K extends WorkspaceModuleId>(moduleId: K, context: WorkspaceModuleContextMap[K], options?: { openDetail?: boolean }) => {
    dispatch({ type: 'UPDATE_PANEL_CONTEXT', moduleId, context: context as WorkspaceModuleContextMap[WorkspaceModuleId], openDetail: options?.openDetail })
  }, [dispatch])
  const setDetailVisibility = useCallback((moduleId: WorkspaceModuleId, visible: boolean) => {
    dispatch({ type: 'SET_DETAIL_VISIBILITY', moduleId, visible })
  }, [dispatch])
  const requestWorkspaceDetailTransition = useCallback(async (moduleId: WorkspaceModuleId, options: { visible: boolean; context?: WorkspaceModuleContextMap[WorkspaceModuleId]; focusTarget?: string }): Promise<PanelCloseGuardResult> => {
    const panel = stateRef.current.session.panels[moduleId]
    if (!panel) return { kind: 'allow' }
    const revision = ++detailTransitionRevision.current
    const replacingOpenDetail = options.visible
      && options.context !== undefined
      && stateRef.current.session.openDetails.includes(moduleId)
      && JSON.stringify(panel.context) !== JSON.stringify(options.context)
    const result = (!options.visible || replacingOpenDetail) ? await runCloseGuard(moduleId) : { kind: 'allow' as const }
    if (revision !== detailTransitionRevision.current) return { kind: 'keep-open' }
    if (result.kind === 'allow') {
      if (options.context !== undefined) dispatch({ type: 'UPDATE_PANEL_CONTEXT', moduleId, context: options.context, openDetail: options.visible })
      else dispatch({ type: 'SET_DETAIL_VISIBILITY', moduleId, visible: options.visible })
      if (!options.visible && options.focusTarget) browser.focus(options.focusTarget)
    } else {
      browser.focus(result.focusTarget ?? options.focusTarget ?? `workspace-close-${moduleId}`)
    }
    return result
  }, [browser, dispatch, runCloseGuard])
  const setSharedSelection = useCallback((ref: EntityRef | null, sourcePanelId: WorkspaceModuleId | 'global-search') => {
    dispatch({ type: 'SET_SHARED_SELECTION', selection: { ref, sourcePanelId, revision: stateRef.current.session.sharedSelection.revision + 1 } })
  }, [dispatch])

  useEffect(() => {
    if (!enabled) return
    const bootstrap = startedRef.current
      ? bootstrapRef.current!
      : createWorkspaceBootstrap(
          organizationStateRef.current,
          browser.location(),
          initialLayout === undefined ? loadWorkspaceLayout() : initialLayout,
        )
    bootstrapRef.current = bootstrap
    startedRef.current = true
    stateRef.current = bootstrap.state
    replaceState(bootstrap.state)
    browser.replace(bootstrap.canonicalUrl)
    scheduleWorkspaceLayoutSave(bootstrap.state.layout, { onFailure: () => layoutPersistenceFailureRef.current?.() })
    const pageHide = () => flushWorkspaceLayoutSave()
    window.addEventListener('pagehide', pageHide)
    return () => {
      window.removeEventListener('pagehide', pageHide)
      flushWorkspaceLayoutSave()
    }
  }, [browser, enabled, initialLayout])

  useEffect(() => {
    if (!enabled) return
    return browser.subscribePopState(() => {
    void (async () => {
      const snapshot = readWorkspaceRoute(browser.location(), organizationStateRef.current)
      const route = snapshot.explicitPanels
        ? snapshot.route
        : (() => {
            const legacy = readLegacyWorkspaceIntent(browser.location(), organizationStateRef.current)
            return legacy
              ? createWorkspaceBootstrap(organizationStateRef.current, browser.location(), stateRef.current.layout).state.route
              : snapshot.route
          })()
      const removed = collectLayoutModules(stateRef.current.layout).filter((moduleId) => !route.openPanels.includes(moduleId))
      const focused = stateRef.current.session.focusedPanel
      removed.sort((first, second) => first === focused ? -1 : second === focused ? 1 : 0)
      for (const moduleId of removed) {
        const result = await runCloseGuard(moduleId)
        if (result.kind === 'keep-open') {
          browser.replace(writeWorkspaceRoute(stateRef.current.route))
          setAnnouncement('尚有未完成編輯')
          browser.focus(result.focusTarget ?? `workspace-close-${moduleId}`)
          return
        }
      }
      dispatch({ type: 'RECONCILE_ROUTE', route })
      if (!snapshot.explicitPanels) browser.replace(writeWorkspaceRoute(stateRef.current.route))
    })()
    })
  }, [browser, dispatch, enabled, runCloseGuard])

  useEffect(() => {
    if (!enabled) return
    dispatch({ type: 'RECONCILE_VERSION', state: organizationState })
  }, [dispatch, enabled, organizationState])

  return {
    state,
    announcement,
    dispatch,
    openOrFocus,
    updatePanelContext,
    setDetailVisibility,
    requestWorkspaceDetailTransition,
    requestWorkspacePanelClose,
    registerWorkspacePanelCloseGuard,
    setSharedSelection,
  }
}
