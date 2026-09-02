import type { DutyConfigurationExactLane } from '../dutyConfigurationRoute'
import type { DutyPlanningStatusFilter, DutyPlanningView } from '../dutyPlanningRoute'
import type { ProcessPlanningView } from '../processPlanningRoute'
import type { OrgDirectoryState } from '../types'

export interface WorkspaceModuleContextMap {
  organization: Record<string, never>
  employees: { employeeId: string | null; query: string }
  positions: { positionId: string | null; query: string }
  departments: { departmentId: string | null }
  levels: { levelId: string | null }
  duties: {
    dutyId: string | null
    lane: DutyConfigurationExactLane | null
    view: 'configuration' | DutyPlanningView
    query: string
    statusFilters: DutyPlanningStatusFilter[]
    focusPositionId: string | null
    sourceRelationId: string | null
    attentionOnly: boolean
  }
  processes: {
    processId: string | null
    processNodeId: string | null
    dutyId: string | null
    view: ProcessPlanningView
  }
  'management-methods': {
    methodId: string | null
    view: 'list' | 'draft' | 'readable'
    query: string
    chapter: string | null
  }
  'role-risks': { ruleId: string | null; employeeId: string | null }
  governance: {
    section: 'identity' | 'catalog' | 'assignments' | 'delegation' | 'versions' | 'audit' | 'check'
  }
}

export type WorkspaceModuleId = keyof WorkspaceModuleContextMap

export type EntityRef =
  | { kind: 'employee'; id: string }
  | { kind: 'position'; id: string }
  | { kind: 'department'; id: string }
  | { kind: 'level'; id: string }
  | { kind: 'duty'; id: string }
  | { kind: 'process'; id: string }
  | { kind: 'process-node'; id: string }
  | { kind: 'management-method'; id: string }
  | { kind: 'role-risk-rule'; id: string }

export interface ModuleSurfaceDescriptor<K extends WorkspaceModuleId> {
  id: K
  label: string
  supportsCollapsibleDetail: boolean
  minWidth: number
  minHeight: number
  supportedSelectionKinds: EntityRef['kind'][]
  queryKeys: readonly string[]
  defaultContext: WorkspaceModuleContextMap[K]
  readRouteContext(params: URLSearchParams, hash: string): WorkspaceModuleContextMap[K]
  writeRouteContext(context: WorkspaceModuleContextMap[K], params: URLSearchParams): string | null
  sanitizeContext(context: WorkspaceModuleContextMap[K], state: OrgDirectoryState): WorkspaceModuleContextMap[K]
}

export type WorkspaceModuleDescriptorMap = {
  [K in WorkspaceModuleId]: ModuleSurfaceDescriptor<K>
}

export type WorkspaceLayoutNodeV1 =
  | { kind: 'stack'; tabs: WorkspaceModuleId[]; activeTab: WorkspaceModuleId }
  | {
      kind: 'split'
      axis: 'horizontal' | 'vertical'
      ratio: number
      first: WorkspaceLayoutNodeV1
      second: WorkspaceLayoutNodeV1
    }

export interface WorkspaceLayoutVisualState {
  scrollTop?: number
  canvasViewport?: { x: number; y: number; zoom: number }
  localView?: string
}

export interface WorkspaceLayoutV1 {
  version: 1
  root: WorkspaceLayoutNodeV1 | null
  visualState: Partial<Record<WorkspaceModuleId, WorkspaceLayoutVisualState>>
}

export type LayoutEdge = 'left' | 'right' | 'top' | 'bottom'

export type LayoutDropTarget =
  | { kind: 'stack'; stackPath: number[] }
  | { kind: 'edge'; stackPath: number[]; edge: LayoutEdge }

export type WorkspaceRouteContexts = Partial<{
  [K in WorkspaceModuleId]: WorkspaceModuleContextMap[K]
}>

export interface WorkspaceRouteState {
  openPanels: WorkspaceModuleId[]
  focusedPanel: WorkspaceModuleId | null
  selection: EntityRef | null
  openDetails: WorkspaceModuleId[]
  contexts: WorkspaceRouteContexts
}

export interface WorkspaceRouteSnapshot {
  explicitPanels: boolean
  route: WorkspaceRouteState
}

export interface SharedSelection {
  ref: EntityRef | null
  sourcePanelId: WorkspaceModuleId | 'global-search' | 'route'
  revision: number
}

export interface PanelSessionState<Context> {
  pinned: boolean
  context: Context
  localSelection: EntityRef | null
}

export type WorkspacePanelSessionMap = Partial<{
  [K in WorkspaceModuleId]: PanelSessionState<WorkspaceModuleContextMap[K]>
}>

export interface WorkspaceSessionState {
  focusedPanel: WorkspaceModuleId | null
  sharedSelection: SharedSelection
  panels: WorkspacePanelSessionMap
  openDetails: WorkspaceModuleId[]
  closePendingModuleId: WorkspaceModuleId | null
}

export interface WorkspaceState {
  layout: WorkspaceLayoutV1
  route: WorkspaceRouteState
  session: WorkspaceSessionState
}

export type WorkspaceOpenSource = 'launcher' | 'legacy-route' | 'global-search' | 'cross-panel'

export type WorkspaceOpenIntent = {
  [K in WorkspaceModuleId]: {
    moduleId: K
    context?: WorkspaceModuleContextMap[K]
    source: WorkspaceOpenSource
  }
}[WorkspaceModuleId]

export type PanelCloseGuardResult =
  | { kind: 'allow' }
  | { kind: 'keep-open'; focusTarget?: string }

export type PanelCloseGuard = () => Promise<PanelCloseGuardResult>
export type RequestPanelClose = (moduleId: WorkspaceModuleId) => Promise<PanelCloseGuardResult>

export type WorkspaceSurfaceVisibility = 'active' | 'hidden'

export interface WorkspaceEnvironment {
  viewportWidth: number
  hoverCapable: boolean
  finePointer: boolean
  mobileReadOnly: boolean
  serverReady: boolean
  recoveryState: 'none' | 'blocked'
  workspaceMode: 'current-view' | 'current-maintenance' | 'draft-edit'
}

export interface WorkspaceCompositionCapability {
  canCompose: boolean
  mobileReadOnly: boolean
  reason?: string
}

export interface ModuleCapability {
  canRead: boolean
  canMutate: boolean
  reason?: string
}

export type WorkspaceHydrationState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'index-unavailable'; message: string }
  | { kind: 'workspace-invalid'; message: string }
  | { kind: 'version-invalid'; versionId: string | null; isCurrent: boolean; message: string }
  | { kind: 'conflict'; message: string }

export type WorkspaceEffect =
  | { type: 'push-route'; route: WorkspaceRouteState }
  | { type: 'replace-route'; route: WorkspaceRouteState }
  | { type: 'schedule-layout-save'; layout: WorkspaceLayoutV1 }
  | { type: 'focus-element'; target: string }
  | { type: 'announce'; message: string }

export interface WorkspaceTransition {
  state: WorkspaceState
  effects: WorkspaceEffect[]
}
