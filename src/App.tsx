import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  useReactFlow,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, Check, MousePointerClick, Trash2, UserRoundPlus } from 'lucide-react'
import { screenshotOrganizationState } from './screenshotData'
import { removeEmployeeFromDirectory, updateDepartmentInDirectory, updateEmployeeInDirectory } from './directories'
import {
  layoutOrganization,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  getOrgNodeHeight,
} from './layout'
import { Inspector, type OrganizationUiIssue, type PositionParentGroup, type PositionParentOption } from './components/Inspector'
import { DepartmentGroupLayer } from './components/DepartmentGroupLayer'
import { OrganizationLevelGuideLayer } from './components/OrganizationLevelGuideLayer'
import { PositionYSnapGuide } from './components/PositionYSnapGuide'
import { RoleRiskRelationLayer } from './components/RoleRiskRelationLayer'
import { DirectoryDock, type DirectoryKind, type DirectorySelection } from './components/DirectoryDock'
import { DirectoryDetailPanel, type DirectoryDetailSelection } from './components/DirectoryDetailPanel'
import {
  AddDepartmentDialog,
  AddEmployeeDialog,
  DeleteDepartmentDialog,
  DeleteEmployeeDialog,
  EditDepartmentDialog,
  EditEmployeeDialog,
} from './components/DirectoryDialogs'
import { PositionContextMenu } from './components/PositionContextMenu'
import { OrgNode, type OrgFlowNode } from './components/OrgNode'
import { getSharedHorizontalBranchOffset, OrthogonalEdge, type OrgFlowEdge } from './components/OrthogonalEdge'
import {
  findDropCandidate,
  getDropCandidateDistance,
  sameDropCandidate,
  type DropCandidate,
} from './drag'
import {
  calculateDragOffset,
  canCommitPositionDrag,
  clearPositionDragCandidate,
  createPositionDragState,
  POSITION_DRAG_THRESHOLD,
  isVerticalPositionDrag,
  resetPositionDrag,
  sameOptionalPoint,
  setPendingPositionDragCandidate,
  setPreviewedPositionDragCandidate,
  shouldRetainDropPreview,
  snapPositionY,
  startPositionDrag,
  updatePositionDragPointer,
  type PositionDragState,
} from './positionDragInteraction'
import { Toolbar } from './components/Toolbar'
import { DutyCenter } from './components/DutyCenter'
import { DutyDetailDrawer } from './components/DutyDetailDrawer'
import { DutyDeleteDialog, DutyEditDialog } from './components/DutyDialogs'
import { GovernanceCenter } from './components/GovernanceCenter'
import { VersionWorkspacePanel } from './components/VersionWorkspacePanel'
import { ManagementMethodListPage } from './components/managementMethods/ManagementMethodListPage'
import { ManagementMethodDocumentPage } from './components/managementMethods/ManagementMethodDocumentPage'
import {
  RoleCombinationRiskPanel,
  type RoleCombinationRiskDraft,
} from './components/RoleCombinationRiskPanel'
import { buildPositionViews, getDepartmentName, TODAY } from './organization'
import { groupByDepartmentAndLevel } from './positionGrouping'
import { getNextOrganizationLevelId } from './organizationLevels'
import { buildHierarchyNodes, getHierarchyDepth, isHierarchyDescendant } from './organizationHierarchy'
import { buildDepartmentGroups } from './departmentGroups'
import { resolveEscapeDismissAction, type WorkspacePanelId } from './panelDismissal'
import { executeOrganizationCommand, type OrganizationCommand, type OrganizationCommandResult } from './organizationCommands'
import {
  createDownloadFilename,
  createOrgDocumentFile,
  downloadOrgDocument,
  orgStateSignature,
  type OrgDocumentKind,
} from './documentStorage'
import { loadWorkspaceIndex, loadWorkspaceVersion, saveWorkspaceDocument, createWorkspaceDraft as createWorkspaceDraftRequest, updateWorkspaceEntryClient } from './serverWorkspaceStorage'
import { type DutyPlanningStatusFilter, type DutyPlanningView } from './dutyPlanningRoute'
import { readDutyConfigurationLocation, type DutyConfigurationExactLane, type DutyConfigurationLocation } from './dutyConfigurationRoute'
import { canMutateDutyConfiguration } from './dutyConfigurationCapability'
import { readProcessPlanningLocation, type ProcessPlanningLocation } from './processPlanningRoute'
import { ProcessPlanningWorkbench } from './components/ProcessPlanningWorkbench'
import { resolvePositionRole } from './rolePositionMapping'
import {
  assignEmployeeWithResponsibilities,
  setPrimaryAssignment,
  unassignEmployeeWithResponsibilities,
} from './employeeResponsibilities'
import {
  buildPositionRiskVisualStates,
  deriveRoleCombinationRiskMatches,
  removeRoleCombinationRiskRule,
  selectVisibleRoleRiskRelations,
  setRoleCombinationRiskRuleEnabled,
  upsertRoleCombinationRiskRule,
} from './roleCombinationRisks'
import type { ChildrenAxis, HierarchyNode, OrganizationLevel, OrgDirectoryState, OrgMember, Point, PositionView, Role } from './types'
import type { OrgWorkspaceIndex, OrgWorkspaceVersionSummary, WorkspaceMode } from './versionWorkspace'
import { WorkspaceShell } from './components/workspace/WorkspaceShell'
import { WorkspaceOverlayProvider, WorkspacePortal } from './components/workspace/WorkspaceOverlayHosts'
import { WorkspaceLauncher } from './components/workspace/WorkspaceLauncher'
import { OrganizationPanel } from './components/workspace/OrganizationPanel'
import { renderWorkspaceDrawer, renderWorkspacePanel, type WorkspaceDrawerRenderer, type WorkspacePanelRenderer } from './components/workspace/WorkspaceModuleSurfaces'
import { MasterDataModuleAdapter, type MasterDataModuleId } from './components/workspace/adapters/MasterDataModuleAdapter'
import { DutyModuleAdapter } from './components/workspace/adapters/DutyModuleAdapter'
import { ProcessModuleAdapter } from './components/workspace/adapters/ProcessModuleAdapter'
import { ManagementMethodModuleAdapter } from './components/workspace/adapters/ManagementMethodModuleAdapter'
import { RoleRiskModuleAdapter } from './components/workspace/adapters/RoleRiskModuleAdapter'
import { GovernanceModuleAdapter } from './components/workspace/adapters/GovernanceModuleAdapter'
import { useWorkspaceController } from './workspace/useWorkspaceController'
import { classifyIndexFailure, classifyVersionFailure } from './workspace/hydration'
import { observeWorkspaceEnvironment, resolveModuleCapability } from './workspace/capability'
import { describeRegisteredDropEffect, readWorkspaceEntityDrag, resolveRegisteredDrop, type DomainMutationIntent, type RegisteredDropTarget, type WorkspaceEntityDragPayloadV1 } from './workspace/entityDrag'
import {
  createRelationPlacementSession,
  getRelationPlacementAutoPanDelta,
  reduceRelationPlacementSession,
  resolveRelationPlacementCapability,
  sameRelationPlacementPayload,
  type RelationPlacementCandidate,
  type RelationPlacementInputMode,
} from './workspace/relationPlacement'
import { getWorkspaceModule } from './workspace/moduleRegistry'
import type { DrawerWorkspaceModuleId, PromotionIntent, WorkspaceEnvironment, WorkspaceHydrationState, WorkspaceModuleId } from './workspace/types'

const nodeTypes: NodeTypes = { org: OrgNode }
const edgeTypes: EdgeTypes = { orthogonal: OrthogonalEdge }

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

type MemberUpdater = OrgMember[] | ((members: OrgMember[]) => OrgMember[])
type OrgStateUpdater = OrgDirectoryState | ((state: OrgDirectoryState) => OrgDirectoryState)

interface DragPreview {
  movingId: string
  candidate: DropCandidate
}

interface PositionDragGeometry {
  nodes: Array<{ id: string; position: Point }>
  hierarchyNodes: HierarchyNode[]
}

interface PositionContextMenuState {
  positionId: string
  x: number
  y: number
}

type DirectoryDialogState =
  | { type: 'add-employee' }
  | { type: 'add-department' }
  | { type: 'edit-employee'; employeeId: string }
  | { type: 'edit-department'; departmentId: string }
  | { type: 'delete-employee'; employeeId: string }
  | { type: 'delete-department'; departmentId: string }

const PREVIEW_STABLE_MS = 120
const CANDIDATE_SWITCH_MARGIN = 10
const AUTO_SAVE_DELAY_MS = 500

function newPositionRoleInput(roles: Role[]) {
  return resolvePositionRole(roles, '新職位', () => crypto.randomUUID())
}

function moveCommandFromCandidate(
  movingId: string,
  candidate: DropCandidate,
  hierarchyNodes: Array<{ id: string; parentId: string | null }>,
): OrganizationCommand {
  return candidate.type === 'child'
    ? {
        type: 'MOVE_POSITION',
        positionId: movingId,
        parentPositionId: candidate.targetId,
        insertIndex: hierarchyNodes.filter((node) => node.parentId === candidate.targetId && node.id !== movingId).length,
      }
    : {
        type: 'MOVE_POSITION',
        positionId: movingId,
        parentPositionId: candidate.parentId,
        insertIndex: candidate.insertIndex,
      }
}

type RejectedOrganizationIssue = Extract<OrganizationCommandResult, { status: 'rejected' }>['issue']

function organizationIssueMessage(issue: RejectedOrganizationIssue, departments: OrgDirectoryState['departments']) {
  const departmentName = issue.departmentIds
    .map((id) => departments.find((department) => department.id === id)?.name)
    .filter(Boolean)
    .join('、')
  return issue.code === 'DEPARTMENT_DISCONNECTED'
    ? `${departmentName || '此部門'} 會分裂成多個區塊`
    : issue.code === 'HIERARCHY_CYCLE'
      ? '不能將職位放到自己的下層'
      : issue.code === 'MISSING_PARENT'
        ? '指定的上級職位已不存在'
        : issue.code === 'DEPARTMENT_NOT_FOUND'
          ? '指定的部門已不存在'
          : issue.code === 'INVALID_DEPARTMENT_REPLACEMENT'
            ? '替代部門不能是目前部門的下層部門'
            : issue.code === 'INVALID_PARENT_LEVEL_ORDER'
              ? '上級職位必須位於更高的組織層級'
              : issue.code === 'INCOMPLETE_LEVEL_ASSIGNMENT'
                ? '尚有使用中職位未設定層級'
                : issue.code === 'ORGANIZATION_LEVEL_IN_USE'
                  ? `此層級仍有 ${issue.positionIds.length} 個職位使用，請先逐一改派`
                  : issue.code === 'NO_LOWER_ORGANIZATION_LEVEL'
                    ? '此職位已在最低層；請先新增較低層級或調整層級'
                    : issue.code === 'DUPLICATE_LEVEL_NAME'
                      ? '層級名稱不可空白或重複'
                      : issue.code === 'INVALID_LEVEL_SEQUENCE'
                      ? '層級排序資料不完整，未變更'
                      : issue.code === 'INVALID_POSITION_Y'
                        ? 'Y 軸位置無效，未變更'
                        : issue.code === 'DUTY_PLAN_INCOMPLETE'
                          ? '請先完成職掌修復選擇'
                          : issue.code === 'DUTY_PLAN_STALE'
                            ? '職掌資料已更新，請重試'
                            : issue.code === 'DUTY_PLAN_TARGET_INVALID'
                              ? '目標職位不存在或已失效'
                              : issue.code === 'DUTY_PLAN_PRIMARY_CONFLICT'
                                ? '此工作執掌已有其他主執行職位'
                                : issue.code === 'DUTY_PLAN_DOMAIN_INVALID'
                                  ? '職掌關係資料無效，未變更'
                                  : '無法完成這個組織調整'
}

function resolveOrganizationIssueTarget(command: OrganizationCommand, issue: RejectedOrganizationIssue): OrganizationUiIssue['target'] {
  return command.type === 'DELETE_POSITION' || command.type === 'DELETE_DEPARTMENT'
    ? 'delete'
    : command.type === 'ADD_ORGANIZATION_LEVEL'
      || command.type === 'RENAME_ORGANIZATION_LEVEL'
      || command.type === 'DELETE_ORGANIZATION_LEVEL'
      || command.type === 'REORDER_ORGANIZATION_LEVELS'
      || command.type === 'SET_ORGANIZATION_LAYOUT'
      || (command.type === 'PATCH_POSITION' && command.organizationLevelId !== undefined)
      || (command.type === 'ADD_POSITION' && issue.code === 'NO_LOWER_ORGANIZATION_LEVEL')
      ? 'level'
    : command.type === 'SET_POSITION_Y_OVERRIDE'
      ? 'drag'
    : command.type === 'CHANGE_POSITION_DEPARTMENT'
      || (command.type === 'PATCH_POSITION' && command.departmentId !== undefined)
      ? 'department'
      : 'parent'
}

function useOrgHistory(initial: OrgDirectoryState) {
  const [history, setHistory] = useState<HistoryState<OrgDirectoryState>>({
    past: [],
    present: initial,
    future: [],
  })

  const commitState = useCallback((updater: OrgStateUpdater) => {
    setHistory((current) => {
      const next = typeof updater === 'function' ? updater(current.present) : updater
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current
      return {
        past: [...current.past, current.present].slice(-80),
        present: next,
        future: [],
      }
    })
  }, [])

  const commit = useCallback((updater: MemberUpdater) => {
    commitState((current) => {
      const members = typeof updater === 'function' ? updater(current.members) : updater
      return members === current.members ? current : { ...current, members }
    })
  }, [commitState])

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0]
      if (!next) return current
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      }
    })
  }, [])

  const replaceState = useCallback((next: OrgDirectoryState) => {
    setHistory({ past: [], present: next, future: [] })
  }, [])

  return {
    ...history.present,
    commit,
    commitState,
    undo,
    redo,
    replaceState,
  }
}

function isTextEditor(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-org-editor]'))
}

function workspacePanelFromTarget(target: EventTarget | null): WorkspacePanelId | null {
  if (!(target instanceof Element)) return null
  const panel = target.closest<HTMLElement>('[data-workspace-panel]')?.dataset.workspacePanel
  return panel === 'directory' || panel === 'inspector' || panel === 'role-risk' ? panel : null
}

function findDataElement(attribute: string, value: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`))
    .find((element) => element.getAttribute(attribute) === value) ?? null
}

export default function App() {
  const initialState = screenshotOrganizationState
  const [serverReady, setServerReady] = useState(false)
  const [serverRevision, setServerRevision] = useState<string | null>(null)
  const [workspaceIndex, setWorkspaceIndex] = useState<OrgWorkspaceIndex | null>(null)
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('current-view')
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceHydration, setWorkspaceHydration] = useState<WorkspaceHydrationState>({ kind: 'loading' })
  const [workspaceHydrationRetry, setWorkspaceHydrationRetry] = useState(0)
  const {
    members,
    employees,
    departments,
    roles,
    positions,
    assignments,
    roleCombinationRiskRules,
    organizationLevels,
    organizationLayout,
    duties,
    dutyPositionRelations,
    processes,
    processNodes,
    processEdges,
    processNodeDutyLinks,
    commit: commitHistory,
    commitState: commitStateHistory,
    undo,
    redo,
    replaceState,
  } = useOrgHistory(initialState)
  const currentState = useMemo<OrgDirectoryState>(() => ({
    members,
    employees,
    departments,
    roles,
    positions,
    assignments,
    roleCombinationRiskRules,
    organizationLevels,
    organizationLayout,
    duties,
    dutyPositionRelations,
    processes,
    processNodes,
    processEdges,
    processNodeDutyLinks,
  }), [assignments, departments, duties, dutyPositionRelations, employees, members, organizationLayout, organizationLevels, positions, processEdges, processNodeDutyLinks, processNodes, processes, roleCombinationRiskRules, roles])
  const currentSignature = useMemo(() => orgStateSignature(currentState), [currentState])
  const [workspaceLayoutNotice, setWorkspaceLayoutNotice] = useState('')
  const reportWorkspaceLayoutPersistenceFailure = useCallback(() => {
    setWorkspaceLayoutNotice('工作台排列無法保存；本次仍可繼續使用')
  }, [])
  const workspaceController = useWorkspaceController({
    organizationState: currentState,
    enabled: workspaceHydration.kind === 'ready',
    onLayoutPersistenceFailure: reportWorkspaceLayoutPersistenceFailure,
  })
  const [workspaceModuleQueries, setWorkspaceModuleQueries] = useState({ employees: '', positions: '', duties: '', managementMethods: '' })
  const [organizationIssue, setOrganizationIssue] = useState<string | null>(null)
  const [organizationIssueTarget, setOrganizationIssueTarget] = useState<OrganizationUiIssue['target'] | null>(null)
  const [levelOrderPreview, setLevelOrderPreview] = useState<OrganizationLevel[] | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(() => orgStateSignature(initialState))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const recoveryOpen = workspaceHydration.kind !== 'ready'
  const [persistenceKind, setPersistenceKind] = useState<OrgDocumentKind | null>(null)
  const [autoSavePending, setAutoSavePending] = useState(false)
  const [autoSaveError, setAutoSaveError] = useState(false)
  const serverReadyRef = useRef(serverReady)
  const serverHydrationPendingRef = useRef(false)
  const serverHydrationSignatureRef = useRef<string | null>(null)
  const currentStateRef = useRef(currentState)
  const currentSignatureRef = useRef(currentSignature)
  const recoveryOpenRef = useRef(recoveryOpen)
  const savedSignatureRef = useRef(savedSignature)
  const serverRevisionRef = useRef(serverRevision)
  currentStateRef.current = currentState
  currentSignatureRef.current = currentSignature
  recoveryOpenRef.current = recoveryOpen
  savedSignatureRef.current = savedSignature
  serverReadyRef.current = serverReady
  serverRevisionRef.current = serverRevision
  const isDirty = savedSignature !== currentSignature
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDirectory, setActiveDirectory] = useState<DirectoryKind | null>(() => readDutyConfigurationLocation(window.location).active ? 'duties' : 'employees')
  const [riskInteractionPositionId, setRiskInteractionPositionId] = useState<string | null>(null)
  const [directorySelection, setDirectorySelection] = useState<DirectorySelection | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [dutyConfigurationLocation, setDutyConfigurationLocation] = useState<DutyConfigurationLocation>(() => readDutyConfigurationLocation(window.location))
  const [dutyConfigurationExpandedDutyId, setDutyConfigurationExpandedDutyId] = useState<string | null>(() => readDutyConfigurationLocation(window.location).dutyId)
  const [dutyConfigurationError, setDutyConfigurationError] = useState<string | null>(null)
  const [dutyDetailOpen, setDutyDetailOpen] = useState(false)
  const [relationPlacement, dispatchRelationPlacement] = useReducer(
    reduceRelationPlacementSession,
    undefined,
    createRelationPlacementSession,
  )
  const relationPlacementSourceFocusRef = useRef<HTMLElement | null>(null)
  const relationPlacementSourcePayloadRef = useRef<WorkspaceEntityDragPayloadV1 | null>(null)
  const relationPlacementCommitLockRef = useRef(false)
  const relationPlacementBeginTimerRef = useRef<number | null>(null)
  const clearRelationPlacementBeginTimer = useCallback(() => {
    if (relationPlacementBeginTimerRef.current === null) return
    window.clearTimeout(relationPlacementBeginTimerRef.current)
    relationPlacementBeginTimerRef.current = null
  }, [])
  useEffect(() => () => clearRelationPlacementBeginTimer(), [clearRelationPlacementBeginTimer])
  const [dutyEditDialog, setDutyEditDialog] = useState<'create' | null>(null)
  const [dutyDeleteDialog, setDutyDeleteDialog] = useState(false)
  const [mobileReadOnly, setMobileReadOnly] = useState(() => window.matchMedia('(max-width: 1023px), (hover: none), (pointer: coarse)').matches)
  const [workspaceEnvironment, setWorkspaceEnvironment] = useState<WorkspaceEnvironment>(() => ({
    viewportWidth: window.innerWidth,
    hoverCapable: window.matchMedia('(hover: hover)').matches,
    finePointer: window.matchMedia('(pointer: fine)').matches,
    mobileReadOnly: window.matchMedia('(max-width: 1023px), (hover: none), (pointer: coarse)').matches,
    serverReady: false,
    recoveryState: 'blocked',
    workspaceMode: 'current-view',
  }))
  const lastInteractedPanelRef = useRef<WorkspacePanelId | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px), (hover: none), (pointer: coarse)')
    const update = () => setMobileReadOnly(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => observeWorkspaceEnvironment({
    serverReady,
    recoveryState: workspaceHydration.kind === 'ready' ? 'none' : 'blocked',
    workspaceMode,
  }, setWorkspaceEnvironment), [serverReady, workspaceHydration.kind, workspaceMode])

  useEffect(() => {
    const focused = workspaceController.state.session.focusedPanel
    document.title = focused ? `${getWorkspaceModule(focused).label}｜OrgMaster` : 'OrgMaster 工作台'
  }, [workspaceController.state.session.focusedPanel])

  const openDutyPlanningPage = useCallback((view: DutyPlanningView = 'audit', query = '', anomalyTypes: DutyPlanningStatusFilter[] = []) => {
    workspaceController.openOrFocus('duties', {
      dutyId: null,
      lane: null,
      view,
      query,
      statusFilters: anomalyTypes,
      focusPositionId: null,
      sourceRelationId: null,
      attentionOnly: false,
    }, 'cross-panel')
  }, [workspaceController.openOrFocus])

  const openProcessPlanningPage = useCallback((processId?: string | null, view: 'mindmap' | 'flow' = 'mindmap') => {
    const context = { view, processId: processId ?? null, processNodeId: null, dutyId: null }
    workspaceController.openOrFocus('processes', context, 'cross-panel')
  }, [workspaceController.openOrFocus])

  const navigateProcessPlanning = useCallback((url: string) => {
    const target = new URL(url, window.location.origin)
    const next = readProcessPlanningLocation({ pathname: target.pathname, search: target.search } as Location)
    if (!next.active) return
    workspaceController.updatePanelContext('processes', { view: next.view, processId: next.processId, processNodeId: next.processNodeId, dutyId: next.dutyId })
  }, [workspaceController.updatePanelContext])

  const openDutyConfiguration = useCallback((focusPositionId?: string | null, dutyId?: string | null) => {
    const next = { active: true, attentionOnly: false, dutyId: dutyId ?? null, lane: null, focusPositionId: focusPositionId ?? null, sourceRelationId: null, legacySurface: null } satisfies DutyConfigurationLocation
    setDutyConfigurationLocation(next)
    workspaceController.openOrFocus('organization', {}, 'cross-panel')
    workspaceController.openDrawer('duties')
    setDutyConfigurationExpandedDutyId(null)
    setDutyConfigurationError(null)
    setDutyDetailOpen(false)
    setActiveDirectory('duties')
    setDirectorySelection(null)
    setInspectorOpen(false)
    clearRelationPlacementBeginTimer()
    dispatchRelationPlacement({ type: 'CANCEL' })
    relationPlacementSourceFocusRef.current = null
    relationPlacementSourcePayloadRef.current = null
    relationPlacementCommitLockRef.current = false
  }, [clearRelationPlacementBeginTimer, workspaceController.openDrawer, workspaceController.openOrFocus])

  const focusAfterClose = useCallback((resolveTarget: () => HTMLElement | null) => {
    window.requestAnimationFrame(() => {
      const target = resolveTarget()
      if (target && target.isConnected && !target.hasAttribute('disabled')) {
        target.focus()
        return
      }
      document.querySelector<HTMLElement>('[data-workspace-focus-fallback]')?.focus()
    })
  }, [])

  const closeDirectoryPanel = useCallback(() => {
    const kind = activeDirectory
    if (!kind) return
    setActiveDirectory(null)
    focusAfterClose(() => findDataElement('data-directory-rail-kind', kind))
  }, [activeDirectory, focusAfterClose])

  const closeInspectorPanel = useCallback(() => {
    const selection = directorySelection
    const positionId = selectedId
    setInspectorOpen(false)
    setSelectedId(null)
    setDirectorySelection(null)
    focusAfterClose(() => {
      if (selection?.kind === 'employees') return findDataElement('data-employee-id', selection.id)
      if (selection?.kind === 'departments') return findDataElement('data-department-id', selection.id)
      if (selection?.kind === 'positions') return findDataElement('data-directory-position-id', selection.id)
      if (positionId) return findDataElement('data-id', positionId)
      return null
    })
  }, [directorySelection, focusAfterClose, selectedId])

  const selectPosition = useCallback((id: string) => {
    setSelectedId(id)
    setDirectorySelection({ kind: 'positions', id })
    setInspectorOpen(true)
    lastInteractedPanelRef.current = 'inspector'
    if (window.innerWidth <= 1100) setActiveDirectory(null)
  }, [])
  const selectEntity = useCallback((selection: DirectorySelection) => {
    setDirectorySelection(selection)
    setInspectorOpen(true)
    lastInteractedPanelRef.current = 'inspector'
    if (window.innerWidth <= 1100) setActiveDirectory(null)
  }, [])
  const selectEmployee = useCallback((employeeId: string) => {
    selectEntity({ kind: 'employees', id: employeeId })
  }, [selectEntity])
  const selectDepartment = useCallback((departmentId: string) => {
    selectEntity({ kind: 'departments', id: departmentId })
  }, [selectEntity])
  const sharedWorkspaceSelection = workspaceController.state.session.sharedSelection
  useEffect(() => {
    const ref = sharedWorkspaceSelection.ref
    if (!ref) {
      setSelectedId(null)
      setDirectorySelection(null)
      setInspectorOpen(false)
      return
    }
    if (ref.kind === 'position') {
      setSelectedId(ref.id)
      setDirectorySelection({ kind: 'positions', id: ref.id })
    } else if (ref.kind === 'employee') setDirectorySelection({ kind: 'employees', id: ref.id })
    else if (ref.kind === 'department') setDirectorySelection({ kind: 'departments', id: ref.id })
    else if (ref.kind === 'level') setDirectorySelection({ kind: 'levels', id: ref.id })
    else if (ref.kind === 'duty') setDirectorySelection({ kind: 'duties', id: ref.id })
    setInspectorOpen(sharedWorkspaceSelection.sourcePanelId === 'organization')
  }, [sharedWorkspaceSelection.ref, sharedWorkspaceSelection.revision, sharedWorkspaceSelection.sourcePanelId])
  const changeActiveDirectory = useCallback((next: DirectoryKind | null) => {
    const previous = activeDirectory
    if (next === 'duties' && !dutyConfigurationLocation.active) {
      setDutyConfigurationLocation({ active: true, attentionOnly: false, dutyId: null, lane: null, focusPositionId: null, sourceRelationId: null, legacySurface: null })
      setDutyConfigurationError(null)
    } else if (dutyConfigurationLocation.active && next !== 'duties') {
      setDutyConfigurationLocation({ active: false, attentionOnly: false, dutyId: null, lane: null, focusPositionId: null, sourceRelationId: null, legacySurface: null })
      setDutyConfigurationError(null)
      clearRelationPlacementBeginTimer()
      dispatchRelationPlacement({ type: 'CANCEL' })
      relationPlacementSourceFocusRef.current = null
      relationPlacementSourcePayloadRef.current = null
      relationPlacementCommitLockRef.current = false
    }
    setActiveDirectory(next)
    if (next) {
      lastInteractedPanelRef.current = 'directory'
      if (window.innerWidth <= 1100) {
        setInspectorOpen(false)
        setSelectedId(null)
        setDirectorySelection(null)
      }
    } else if (previous) {
      focusAfterClose(() => findDataElement('data-directory-rail-kind', previous))
    }
  }, [activeDirectory, clearRelationPlacementBeginTimer, dutyConfigurationLocation.active, focusAfterClose])
  const recordPanelInteraction = useCallback((event: { target: EventTarget | null }) => {
    const panel = workspacePanelFromTarget(event.target)
    if (panel) lastInteractedPanelRef.current = panel
  }, [])
  const setRiskInteraction = useCallback((positionId: string | null) => {
    setRiskInteractionPositionId(positionId)
  }, [])
  const [nodes, setNodes] = useState<OrgFlowNode[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const governanceButtonRef = useRef<HTMLButtonElement | null>(null)
  const [focusTitleToken, setFocusTitleToken] = useState(0)
  const [searchFocusToken, setSearchFocusToken] = useState(0)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [dragVisualOffset, setDragVisualOffset] = useState<Point | null>(null)
  const [dragSnapTargetId, setDragSnapTargetId] = useState<string | null>(null)
  const [assignmentNotice, setAssignmentNotice] = useState('')
  const activeVersionIdRef = useRef(activeVersionId)
  const workspaceModeRef = useRef(workspaceMode)
  const workspaceIndexRef = useRef(workspaceIndex)
  const editingEnabledRef = useRef(false)
  activeVersionIdRef.current = activeVersionId
  workspaceModeRef.current = workspaceMode
  workspaceIndexRef.current = workspaceIndex
  editingEnabledRef.current = (workspaceMode === 'draft-edit' || workspaceMode === 'current-maintenance')
    && serverReady
    && workspaceHydration.kind === 'ready'
  const editingEnabled = editingEnabledRef.current
  const currentDrawer = workspaceController.state.session.drawer
  const dutyPanelContext = workspaceController.state.session.panels.duties?.context
  const effectiveDutyConfigurationLocation = useMemo<DutyConfigurationLocation>(() => dutyPanelContext?.view === 'configuration'
    ? {
        active: true,
        attentionOnly: dutyPanelContext.attentionOnly,
        dutyId: dutyPanelContext.dutyId,
        lane: dutyPanelContext.lane,
        focusPositionId: dutyPanelContext.focusPositionId,
        sourceRelationId: dutyPanelContext.sourceRelationId,
        legacySurface: null,
      }
    : { ...dutyConfigurationLocation, active: currentDrawer === 'duties' }, [currentDrawer, dutyConfigurationLocation, dutyPanelContext])
  const dutyConfigurationActive = effectiveDutyConfigurationLocation.active
  const dutyConfigurationWritable = dutyConfigurationActive && canMutateDutyConfiguration({
    editingEnabled,
    serverReady,
    recoveryOpen,
    mobileReadOnly,
    viewportWidth: window.innerWidth,
    hoverCapable: window.matchMedia('(hover: hover)').matches,
    finePointer: window.matchMedia('(pointer: fine)').matches,
  })
  const masterDataEditingEnabled = editingEnabled
  const organizationEditingEnabled = masterDataEditingEnabled && !dutyConfigurationActive
  const workspaceMutationAllowed = resolveModuleCapability('organization', workspaceEnvironment, { canRead: true, canMutate: true }).canMutate
  const relationPlacementCapabilities = useMemo(() => ({
    organizationAssignment: resolveModuleCapability('organization', workspaceEnvironment, {
      canRead: true,
      canMutate: organizationEditingEnabled,
    }),
    dutyConfiguration: {
      canRead: true,
      canMutate: dutyConfigurationWritable,
      reason: dutyConfigurationWritable ? undefined : '工作執掌配置目前為唯讀',
    },
    processPlanning: resolveModuleCapability('processes', workspaceEnvironment, {
      canRead: true,
      canMutate: editingEnabled,
    }),
  }), [dutyConfigurationWritable, editingEnabled, organizationEditingEnabled, workspaceEnvironment])
  const commitState = useCallback((updater: OrgStateUpdater) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請選擇草稿或進入現行版維護')
      return
    }
    commitStateHistory(updater)
  }, [commitStateHistory])
  const commit = useCallback((updater: MemberUpdater) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請選擇草稿或進入現行版維護')
      return
    }
    commitHistory(updater)
  }, [commitHistory])

  const finishRelationPlacement = useCallback(() => {
    clearRelationPlacementBeginTimer()
    dispatchRelationPlacement({ type: 'FINISH' })
    relationPlacementSourceFocusRef.current = null
    relationPlacementSourcePayloadRef.current = null
    relationPlacementCommitLockRef.current = false
  }, [clearRelationPlacementBeginTimer])

  const beginRelationPlacement = useCallback((payload: WorkspaceEntityDragPayloadV1, inputMode: RelationPlacementInputMode, source?: HTMLElement | null) => {
    if (!editingEnabledRef.current || mobileReadOnly) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return false
    }
    if (inputMode === 'keyboard') {
      relationPlacementSourceFocusRef.current = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      relationPlacementSourcePayloadRef.current = payload
    }
    clearRelationPlacementBeginTimer()
    // React state updates during native dragstart can cancel the browser drag
    // before the first dragover. Defer the single session transition to the
    // next task; the existing owner/resolver remains unchanged.
    relationPlacementBeginTimerRef.current = window.setTimeout(() => {
      relationPlacementBeginTimerRef.current = null
      dispatchRelationPlacement({ type: 'BEGIN', inputMode, payload })
      setAssignmentNotice('已抓取關係；請移至可用落點，Enter 放置，Escape 取消')
    }, 0)
    return true
  }, [clearRelationPlacementBeginTimer, mobileReadOnly])

  const cancelRelationPlacement = useCallback(() => {
    clearRelationPlacementBeginTimer()
    const source = relationPlacementSourceFocusRef.current
    const payload = relationPlacementSourcePayloadRef.current
    relationPlacementSourceFocusRef.current = null
    relationPlacementSourcePayloadRef.current = null
    relationPlacementCommitLockRef.current = false
    dispatchRelationPlacement({ type: 'CANCEL' })
    if (source || payload) window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      let fallback: HTMLElement | null = null
      if (payload?.kind === 'process-node') {
        fallback = Array.from(document.querySelectorAll<HTMLElement>('.process-canvas-node__relation-handle'))
          .find((element) => element.closest<HTMLElement>('[data-process-node-id]')?.dataset.processNodeId === payload.processNodeId) ?? null
      } else if (payload?.kind === 'duty') {
        fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-relation-placement-source-kind="duty"]'))
          .find((element) => element.dataset.dutyId === payload.dutyId && element.dataset.dutyLane === payload.lane) ?? null
      } else if (payload?.kind === 'employee') {
        fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-relation-placement-source-kind="employee"]'))
          .find((element) => element.dataset.employeeId === payload.employeeId) ?? null
      }
      if (fallback?.isConnected) {
        fallback.focus()
        return
      }
      if (source?.isConnected) source.focus()
    }))
  }, [clearRelationPlacementBeginTimer])

  useEffect(() => {
    if (relationPlacement.phase !== 'placing') return
    if (!editingEnabled || mobileReadOnly) {
      cancelRelationPlacement()
      return
    }
    const candidate = relationPlacement.candidate
    const target = candidate?.target
    if (candidate?.status === 'intent' && target && !resolveRelationPlacementCapability(relationPlacement.payload, target, relationPlacementCapabilities).canMutate) {
      cancelRelationPlacement()
    }
  }, [cancelRelationPlacement, editingEnabled, mobileReadOnly, relationPlacement, relationPlacementCapabilities])

  // A placement session is owned by the surfaces that rendered its source and
  // (after preview) its target. Closing either surface must tear down the
  // session so the document-level keyboard listener cannot outlive its UI.
  useEffect(() => {
    if (relationPlacement.phase !== 'placing') return
    const requiredModules = new Set<WorkspaceModuleId>([relationPlacement.payload.sourceModuleId])
    const target = relationPlacement.candidate?.target
    if (target) {
      // Position and employee-unassign targets are rendered by the
      // organization canvas. Duty and process-node targets are rendered by
      // the process planning panel (the duty bridge lives there too).
      requiredModules.add(target.kind === 'position' || target.kind === 'employee-unassign' ? 'organization' : 'processes')
    }
    const openPanels = workspaceController.state.route.openPanels
    const drawer = workspaceController.state.session.drawer
    const surfaceClosed = [...requiredModules].some((moduleId) => !openPanels.includes(moduleId) && drawer !== moduleId)
    if (surfaceClosed) cancelRelationPlacement()
  }, [cancelRelationPlacement, relationPlacement, workspaceController.state.route.openPanels, workspaceController.state.session.drawer])

  const relationPlacementCandidate = useCallback((payload: WorkspaceEntityDragPayloadV1, target: RegisteredDropTarget): RelationPlacementCandidate => {
    const capability = resolveRelationPlacementCapability(payload, target, relationPlacementCapabilities)
    const resolution = resolveRegisteredDrop(currentStateRef.current, capability, payload, target)
    return {
      target,
      status: resolution.status,
      effect: describeRegisteredDropEffect(currentStateRef.current, payload, target, resolution),
      code: resolution.status === 'intent' ? null : resolution.code,
    }
  }, [relationPlacementCapabilities])

  const previewRelationPlacementTarget = useCallback((target: RegisteredDropTarget, event?: DragEvent<HTMLElement>) => {
    if (relationPlacement.phase !== 'placing') return null
    const candidate = relationPlacementCandidate(relationPlacement.payload, target)
    dispatchRelationPlacement({ type: 'PREVIEW', candidate })
    return candidate
  }, [relationPlacement, relationPlacementCandidate])

  const commitDomainMutationIntent = useCallback((intent: DomainMutationIntent) => {
    const base = currentStateRef.current
    if (intent.kind === 'employee-assignment') {
      let next: OrgDirectoryState
      if (intent.targetPositionId === null) {
        if (!intent.sourcePositionId) return false
        next = unassignEmployeeWithResponsibilities(base, intent.sourcePositionId, intent.employeeId, TODAY)
      } else {
        const target = base.positions.find((position) => position.id === intent.targetPositionId && position.status === 'active')
        if (!target) return false
        next = assignEmployeeWithResponsibilities(base, intent.employeeId, intent.targetPositionId, intent.sourcePositionId, {
          asOf: TODAY,
          allowMultipleAssignees: target.allowMultipleAssignees,
        })
      }
      if (next === base) return false
      commitState(next)
      setAssignmentNotice(intent.targetPositionId ? '已建立員工任職關係' : '已解除員工任職關係')
      return true
    }
    const result = executeOrganizationCommand(base, intent.command)
    if (result.status === 'applied') {
      commitState(result.state)
      setOrganizationIssue(null)
      setOrganizationIssueTarget(null)
      setAssignmentNotice('已建立跨面板關係')
      return true
    }
    if (result.status === 'rejected') {
      setOrganizationIssue(organizationIssueMessage(result.issue, departments))
      setOrganizationIssueTarget(resolveOrganizationIssueTarget(intent.command, result.issue))
    }
    return false
  }, [commitState, departments])

  const commitRelationPlacementTarget = useCallback((target: RegisteredDropTarget, dataTransfer?: DataTransfer) => {
    if (relationPlacement.phase !== 'placing' || relationPlacementCommitLockRef.current) return false
    const activePayload = relationPlacement.phase === 'placing' ? relationPlacement.payload : null
    const nativePayload = dataTransfer ? readWorkspaceEntityDrag(dataTransfer) : null
    const payload = dataTransfer ? nativePayload : activePayload
    if (!sameRelationPlacementPayload(activePayload, payload)) {
      setAssignmentNotice('拖曳資料已失效，未建立關係')
      cancelRelationPlacement()
      return false
    }
    const capability = resolveRelationPlacementCapability(payload, target, relationPlacementCapabilities)
    const resolution = resolveRegisteredDrop(currentStateRef.current, capability, payload, target)
    const candidate: RelationPlacementCandidate = {
      target,
      status: resolution.status,
      effect: describeRegisteredDropEffect(currentStateRef.current, payload, target, resolution),
      code: resolution.status === 'intent' ? null : resolution.code,
    }
    dispatchRelationPlacement({ type: 'PREVIEW', candidate })
    if (resolution.status !== 'intent') {
      setAssignmentNotice(resolution.status === 'noop' ? '關係已存在，未重複建立' : resolution.code === 'READ_ONLY' ? '目前為唯讀，無法建立關係' : '此資料無法放到該落點')
      cancelRelationPlacement()
      return false
    }
    relationPlacementCommitLockRef.current = true
    dispatchRelationPlacement({ type: 'BEGIN_COMMIT', target })
    try {
      return commitDomainMutationIntent(resolution.intent)
    } finally {
      finishRelationPlacement()
    }
  }, [cancelRelationPlacement, commitDomainMutationIntent, finishRelationPlacement, relationPlacement, relationPlacementCapabilities])
  const [positionContextMenu, setPositionContextMenu] = useState<PositionContextMenuState | null>(null)
  const [directoryDialog, setDirectoryDialog] = useState<DirectoryDialogState | null>(null)
  const positionDragRef = useRef<PositionDragState>(createPositionDragState())
  const positionDragGeometryRef = useRef<PositionDragGeometry | null>(null)
  const dragPreviewTimerRef = useRef<number | null>(null)
  const dragOriginRef = useRef<Point | null>(null)
  const dragGrabOffsetRef = useRef<Point | null>(null)

  const upsertRoleRiskRule = useCallback((draft: RoleCombinationRiskDraft) => {
    const result = upsertRoleCombinationRiskRule(roleCombinationRiskRules, roles, {
      id: draft.id ?? crypto.randomUUID(),
      roleAId: draft.roleAId,
      roleBId: draft.roleBId,
      level: draft.level,
      reason: draft.reason,
      enabled: draft.enabled,
    })
    if (result.ok) {
      commitState((state) => ({ ...state, roleCombinationRiskRules: result.rules }))
    }
    return result
  }, [commitState, roleCombinationRiskRules, roles])

  const setRoleRiskRuleEnabled = useCallback((ruleId: string, enabled: boolean) => {
    commitState((state) => ({
      ...state,
      roleCombinationRiskRules: setRoleCombinationRiskRuleEnabled(state.roleCombinationRiskRules, ruleId, enabled),
    }))
  }, [commitState])

  const deleteRoleRiskRule = useCallback((ruleId: string) => {
    commitState((state) => ({
      ...state,
      roleCombinationRiskRules: removeRoleCombinationRiskRule(state.roleCombinationRiskRules, ruleId),
    }))
  }, [commitState])
  const contextMenuTriggerRef = useRef<HTMLElement | null>(null)
  const {
    fitView,
    getZoom,
    getNode,
    getViewport,
    setViewport,
    setCenter,
    screenToFlowPosition,
  } = useReactFlow<OrgFlowNode, OrgFlowEdge>()

  const runOrganizationCommand = useCallback((command: OrganizationCommand) => {
    const result = executeOrganizationCommand(currentState, command)
    if (result.status === 'applied') {
      commitState(result.state)
      setOrganizationIssue(null)
      setOrganizationIssueTarget(null)
    } else if (result.status === 'rejected') {
      setOrganizationIssue(organizationIssueMessage(result.issue, departments))
      setOrganizationIssueTarget(resolveOrganizationIssueTarget(command, result.issue))
    }
    return result
  }, [commitState, currentState, departments])

  const selectDutyFromPicker = useCallback((dutyId: string) => {
    const nextDutyId = dutyConfigurationExpandedDutyId === dutyId ? null : dutyId
    const next = { ...effectiveDutyConfigurationLocation, active: true, dutyId: nextDutyId, lane: nextDutyId ? effectiveDutyConfigurationLocation.lane : null }
    setDutyConfigurationLocation(next)
    const current = workspaceController.state.session.panels.duties?.context
    if (current) workspaceController.updatePanelContext('duties', { ...current, view: 'configuration', dutyId: nextDutyId, lane: next.lane })
    setDutyConfigurationExpandedDutyId(nextDutyId)
    setDutyConfigurationError(null)
    setDutyDetailOpen(false)
  }, [dutyConfigurationExpandedDutyId, effectiveDutyConfigurationLocation, workspaceController.state.session.panels.duties?.context, workspaceController.updatePanelContext])

  const openDutyConfigurationDetail = useCallback((dutyId: string) => {
    setDutyConfigurationLocation((current) => ({ ...current, active: true, dutyId }))
    const current = workspaceController.state.session.panels.duties?.context
    if (current) workspaceController.updatePanelContext('duties', { ...current, view: 'configuration', dutyId })
    setDutyConfigurationExpandedDutyId((currentDutyId) => currentDutyId === dutyId ? currentDutyId : null)
    setDutyConfigurationError(null)
    setDutyDetailOpen(true)
  }, [workspaceController.state.session.panels.duties?.context, workspaceController.updatePanelContext])

  const selectDutyLane = useCallback((lane: DutyConfigurationExactLane) => {
    if (!effectiveDutyConfigurationLocation.dutyId) return
    setDutyConfigurationLocation((current) => ({ ...current, lane }))
    const current = workspaceController.state.session.panels.duties?.context
    if (current) workspaceController.updatePanelContext('duties', { ...current, view: 'configuration', dutyId: effectiveDutyConfigurationLocation.dutyId, lane })
    setDutyConfigurationError(null)
  }, [effectiveDutyConfigurationLocation.dutyId, workspaceController.state.session.panels.duties?.context, workspaceController.updatePanelContext])

  const positionViews = useMemo(
    () => buildPositionViews(members, positions, assignments, TODAY),
    [assignments, members, positions],
  )
  const riskMatches = useMemo(() => deriveRoleCombinationRiskMatches({
    rules: roleCombinationRiskRules,
    roles,
    positions,
    assignments,
    asOf: TODAY,
  }), [assignments, positions, roleCombinationRiskRules, roles])
  const positionRiskStates = useMemo(() => buildPositionRiskVisualStates(riskMatches), [riskMatches])
  const positionRiskById = useMemo(
    () => new Map(positionRiskStates.map((state) => [state.positionId, state])),
    [positionRiskStates],
  )
  const activeRiskPositionId = riskInteractionPositionId && positionRiskById.has(riskInteractionPositionId)
    ? riskInteractionPositionId
    : selectedId && positionRiskById.has(selectedId)
      ? selectedId
      : null
  const selected = positionViews.find((member) => member.id === selectedId) ?? null
  const hierarchyNodes = useMemo(() => buildHierarchyNodes(currentState), [currentState])
  const memberById = useMemo(() => new Map(hierarchyNodes.map((member) => [member.id, member])), [hierarchyNodes])
  const positionViewById = useMemo(() => new Map(positionViews.map((member) => [member.id, member])), [positionViews])
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])
  const selectedEmployeeId = directorySelection?.kind === 'employees' ? directorySelection.id : null
  const selectedEmployeePositionIds = useMemo(() => {
    const positionIds = new Set<string>()
    if (!selectedEmployeeId) return positionIds

    for (const member of positionViews) {
      if (member.activeAssignments.some((assignment) => assignment.employeeId === selectedEmployeeId)) {
        positionIds.add(member.id)
      }
    }
    return positionIds
  }, [positionViews, selectedEmployeeId])
  const selectedEmployees = selected
    ? selected.activeAssignments
      .map((assignment) => employeeById.get(assignment.employeeId))
      .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee))
    : []
  const selectedDepartmentName = selected ? getDepartmentName(departments, selected.departmentId) : ''
  const contextPosition = positionContextMenu ? positionViewById.get(positionContextMenu.positionId) ?? null : null
  const parentOptions = useMemo<PositionParentOption[]>(() => (
    selected ? [{ id: null, label: '最高層（無上級）' }] : []
  ), [selected])
  const parentOptionGroups = useMemo<PositionParentGroup[]>(() => {
    if (!selected) return []
    const candidates = hierarchyNodes
      .filter((node) => node.id !== selected.id && !isHierarchyDescendant(hierarchyNodes, node.id, selected.id))
      .sort((a, b) => getHierarchyDepth(hierarchyNodes, a.id) - getHierarchyDepth(hierarchyNodes, b.id) || a.order - b.order || a.id.localeCompare(b.id))
    return groupByDepartmentAndLevel(candidates, departments, organizationLevels, (node) => node).map((group) => ({
      key: group.key,
      label: group.label,
      options: group.items.map((node) => ({
        id: node.id,
        label: `${node.title} · ${getDepartmentName(departments, node.departmentId)}`,
      })),
    }))
  }, [departments, hierarchyNodes, organizationLevels, selected])
  const inspectorIssue: OrganizationUiIssue | null = organizationIssue && organizationIssueTarget
    ? { target: organizationIssueTarget, code: 'organization', message: organizationIssue }
    : null
  const childCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const member of hierarchyNodes) {
      if (member.parentId) counts.set(member.parentId, (counts.get(member.parentId) ?? 0) + 1)
    }
    return counts
  }, [hierarchyNodes])
  const dialogEmployee = directoryDialog?.type === 'delete-employee' || directoryDialog?.type === 'edit-employee'
    ? employees.find((employee) => employee.id === directoryDialog.employeeId) ?? null
    : null
  const dialogDepartment = directoryDialog?.type === 'delete-department' || directoryDialog?.type === 'edit-department'
    ? departments.find((department) => department.id === directoryDialog.departmentId) ?? null
    : null
  const nodeHeights = useMemo(
    () => Object.fromEntries(positionViews.map((member) => [member.id, getOrgNodeHeight(member.activeAssignments.length)])),
    [positionViews],
  )
  const effectiveOrganizationLevels = levelOrderPreview ?? organizationLevels
  const layout = useMemo(() => layoutOrganization(hierarchyNodes, nodeHeights, {
    mode: levelOrderPreview ? 'levels' : organizationLayout.mode,
    levels: effectiveOrganizationLevels,
    positionYOverrides: levelOrderPreview || organizationLayout.mode === 'levels'
      ? undefined
      : organizationLayout.positionYOverrides,
  }), [effectiveOrganizationLevels, hierarchyNodes, levelOrderPreview, nodeHeights, organizationLayout.mode, organizationLayout.positionYOverrides])
  const previewState = useMemo(() => {
    if (!dragPreview) return currentState
    const candidate = dragPreview.candidate
    const previewCommand = moveCommandFromCandidate(dragPreview.movingId, candidate, buildHierarchyNodes(currentState))
    const result = executeOrganizationCommand(currentState, previewCommand)
    return result.status === 'applied' ? result.state : currentState
  }, [currentState, dragPreview])
  const previewMembers = useMemo(() => buildHierarchyNodes(previewState), [previewState])
  const previewMemberById = useMemo(
    () => new Map(previewMembers.map((member) => [member.id, member])),
    [previewMembers],
  )
  const previewPositionViews = useMemo(
    () => buildPositionViews(previewState.members, previewState.positions, previewState.assignments, TODAY),
    [previewState],
  )
  const previewPositionViewById = useMemo(
    () => new Map(previewPositionViews.map((member) => [member.id, member])),
    [previewPositionViews],
  )
  const previewEmployeesByPositionId = useMemo(() => new Map(
    previewPositionViews.map((member) => [
      member.id,
      member.activeAssignments
        .map((assignment) => employeeById.get(assignment.employeeId))
        .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee)),
    ]),
  ), [employeeById, previewPositionViews])
  const previewNodeHeights = useMemo(
    () => Object.fromEntries(previewPositionViews.map((member) => [member.id, getOrgNodeHeight(member.activeAssignments.length)])),
    [previewPositionViews],
  )
  const previewLayout = useMemo(
    () => layoutOrganization(previewMembers, previewNodeHeights, {
      mode: levelOrderPreview ? 'levels' : organizationLayout.mode,
      levels: levelOrderPreview ?? previewState.organizationLevels,
      positionYOverrides: levelOrderPreview || organizationLayout.mode === 'levels'
        ? undefined
        : organizationLayout.positionYOverrides,
    }),
    [levelOrderPreview, organizationLayout.mode, organizationLayout.positionYOverrides, previewMembers, previewNodeHeights, previewState.organizationLevels],
  )
  const positionYSnapGuide = useMemo(() => {
    if (!draggingId || !dragSnapTargetId || levelOrderPreview || organizationLayout.mode !== 'tree') return null
    const movingPosition = previewLayout.positions[draggingId]
    const targetPosition = previewLayout.positions[dragSnapTargetId]
    if (!movingPosition || !targetPosition) return null
    return { movingPosition, targetPosition }
  }, [dragSnapTargetId, draggingId, levelOrderPreview, organizationLayout.mode, previewLayout.positions])
  const visibleRiskRelations = useMemo(
    () => selectVisibleRoleRiskRelations(riskMatches, activeRiskPositionId, previewLayout.visibleIds),
    [activeRiskPositionId, previewLayout.visibleIds, riskMatches],
  )
  const relatedRiskPositionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const relation of visibleRiskRelations) {
      for (const positionId of relation.positionIds) {
        if (positionId !== activeRiskPositionId) ids.add(positionId)
      }
    }
    return ids
  }, [activeRiskPositionId, visibleRiskRelations])
  const departmentGroups = useMemo(
    () => buildDepartmentGroups({
      nodes: previewMembers,
      layout: previewLayout,
      departments,
      nodeHeights: previewNodeHeights,
      getDepartmentName: (departmentId) => getDepartmentName(departments, departmentId),
    }),
    [departments, previewLayout, previewMembers, previewNodeHeights],
  )

  const activeWorkspaceVersion = useMemo(
    () => workspaceIndex?.versions.find((version) => version.id === activeVersionId) ?? null,
    [activeVersionId, workspaceIndex],
  )
  const updateWorkspaceVersionSummary = useCallback((version: OrgWorkspaceVersionSummary) => {
    setWorkspaceIndex((current) => current ? {
      ...current,
      versions: current.versions.map((candidate) => candidate.id === version.id ? version : candidate),
    } : current)
  }, [])

  const hydrateWorkspaceVersion = useCallback(async (versionId: string, shouldReplace = true) => {
    const result = await loadWorkspaceVersion(versionId)
    if (result.status !== 'loaded') return result
    const { version, document } = result.value
    if (shouldReplace) replaceState(document.state)
    setActiveVersionId(version.id)
    setServerRevision(version.revision)
    setSavedSignature(orgStateSignature(document.state))
    setSavedAt(document.savedAt)
    setPersistenceKind(document.kind)
    updateWorkspaceVersionSummary(version)
    return result
  }, [replaceState, updateWorkspaceVersionSummary])

  useEffect(() => {
    let active = true
    serverHydrationPendingRef.current = true
    setServerReady(false)
    setWorkspaceHydration({ kind: 'loading' })
    void loadWorkspaceIndex().then(async (result) => {
      if (!active) return
      const indexHydration = classifyIndexFailure(result)
      if (indexHydration.kind !== 'ready' || result.status !== 'loaded') {
        serverHydrationPendingRef.current = false
        setWorkspaceHydration(indexHydration)
        return
      }
      setWorkspaceIndex(result.value)
      let preferredVersionId: string | null = null
      try { preferredVersionId = window.sessionStorage.getItem('orgmaster.workspace.active-version.v1') } catch { /* best effort */ }
      const currentVersionId = result.value.versions.some((version) => version.id === preferredVersionId)
        ? preferredVersionId!
        : result.value.currentVersionId
      const loaded = await hydrateWorkspaceVersion(currentVersionId)
      if (!active) return
      if (loaded.status !== 'loaded') {
        serverHydrationPendingRef.current = false
        setWorkspaceHydration(classifyVersionFailure(loaded, currentVersionId, currentVersionId === result.value.currentVersionId))
      } else {
        serverHydrationSignatureRef.current = orgStateSignature(loaded.value.document.state)
        // Restore edit capability for an active draft selected in this browser
        // session. Without this, a deep link can load the draft data while the
        // UI remains read-only, preventing process-planning changes from ever
        // reaching the autosave path after reload.
        setWorkspaceMode(loaded.value.version.kind === 'draft' && loaded.value.version.status === 'active' ? 'draft-edit' : 'current-view')
        serverHydrationPendingRef.current = false
        setWorkspaceHydration({ kind: 'ready' })
        setServerReady(true)
      }
    })
    return () => {
      active = false
    }
  }, [hydrateWorkspaceVersion, workspaceHydrationRetry])

  useEffect(() => {
    if (!serverReady) return
    let active = true
    const syncFromComputer = async () => {
      const indexResult = await loadWorkspaceIndex()
      if (!active || indexResult.status !== 'loaded') return
      setWorkspaceIndex(indexResult.value)
      const version = indexResult.value.versions.find((candidate) => candidate.id === activeVersionIdRef.current)
      if (!version || version.revision === serverRevisionRef.current) return
      const incoming = await loadWorkspaceVersion(version.id)
      if (!active || incoming.status !== 'loaded') return
      const incomingSignature = orgStateSignature(incoming.value.document.state)
      if (incomingSignature === currentSignatureRef.current) {
        setSavedSignature(incomingSignature)
        setSavedAt(incoming.value.document.savedAt)
        setPersistenceKind(incoming.value.document.kind)
        setServerRevision(incoming.value.version.revision)
        return
      }
      if (currentSignatureRef.current !== savedSignatureRef.current) {
        setAssignmentNotice('另一個視窗已有較新版本；目前視窗有未儲存變更，未覆蓋目前編輯。')
        return
      }
      replaceState(incoming.value.document.state)
      setSavedSignature(incomingSignature)
      setSavedAt(incoming.value.document.savedAt)
      setPersistenceKind(incoming.value.document.kind)
      setServerRevision(incoming.value.version.revision)
      setAssignmentNotice('已同步另一個版本工作區視窗的更新')
    }
    const timer = window.setInterval(() => { void syncFromComputer() }, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [replaceState, serverReady])

  const saveDocument = useCallback(async () => {
    if (!activeVersionIdRef.current || !activeWorkspaceVersion) {
      setAssignmentNotice('目前沒有可儲存的版本')
      return
    }
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return
    }
    const saved = await saveWorkspaceDocument(
      activeVersionIdRef.current,
      createOrgDocumentFile(currentState, activeWorkspaceVersion.kind === 'current' ? 'document' : 'draft'),
      serverRevisionRef.current ?? activeWorkspaceVersion.revision,
      workspaceModeRef.current === 'current-maintenance' ? 'current-maintenance' : 'draft-edit',
    )
    if (saved.status !== 'loaded') {
      if (saved.statusCode === 409) {
        const message = '版本已被其他視窗更新；目前未儲存內容仍保留，重新載入前不會覆蓋'
        setAssignmentNotice(message)
        setWorkspaceHydration({ kind: 'conflict', message })
        setServerReady(false)
      } else setAssignmentNotice(saved.message)
      return
    }
    setSavedSignature(orgStateSignature(saved.value.document.state))
    setSavedAt(saved.value.document.savedAt)
    setServerRevision(saved.value.version.revision)
    setPersistenceKind(saved.value.document.kind)
    updateWorkspaceVersionSummary(saved.value.version)
    setAutoSavePending(false)
    setAutoSaveError(false)
    setAssignmentNotice('已儲存目前版本，所有 localhost:5000 視窗共用')
  }, [activeWorkspaceVersion, currentState, updateWorkspaceVersionSummary])

  const persistDraft = useCallback(async () => {
    const version = workspaceIndexRef.current?.versions.find((candidate) => candidate.id === activeVersionIdRef.current)
    if (!serverReadyRef.current || recoveryOpenRef.current || serverHydrationPendingRef.current || !version || !editingEnabledRef.current) return false
    const saved = await saveWorkspaceDocument(
      version.id,
      createOrgDocumentFile(currentStateRef.current, version.kind === 'current' ? 'document' : 'draft'),
      serverRevisionRef.current ?? version.revision,
      workspaceModeRef.current === 'current-maintenance' ? 'current-maintenance' : 'draft-edit',
    )
    if (saved.status !== 'loaded') {
      setAutoSavePending(false)
      setAutoSaveError(true)
      if (saved.statusCode === 409) {
        const message = '版本已被其他視窗更新；自動儲存已暫停，目前未儲存內容仍保留'
        setAssignmentNotice(message)
        setWorkspaceHydration({ kind: 'conflict', message })
        setServerReady(false)
      }
      return false
    }
    setSavedSignature(orgStateSignature(saved.value.document.state))
    setSavedAt(saved.value.document.savedAt)
    setServerRevision(saved.value.version.revision)
    setPersistenceKind(saved.value.document.kind)
    updateWorkspaceVersionSummary(saved.value.version)
    setAutoSavePending(false)
    setAutoSaveError(false)
    return true
  }, [updateWorkspaceVersionSummary])

  const switchWorkspaceVersion = useCallback(async (versionId: string) => {
    const target = workspaceIndexRef.current?.versions.find((version) => version.id === versionId)
    if (!target) return
    if (target.id === activeVersionIdRef.current) {
      setWorkspaceMode(target.kind === 'draft' && target.status === 'active' ? 'draft-edit' : 'current-view')
      return
    }
    if (isDirty && editingEnabledRef.current && !(await persistDraft())) return
    setWorkspaceBusy(true)
    const result = await hydrateWorkspaceVersion(versionId)
    setWorkspaceBusy(false)
    if (result.status !== 'loaded') {
      setAssignmentNotice(result.message)
      return
    }
    setWorkspaceMode(result.value.version.kind === 'draft' && result.value.version.status === 'active' ? 'draft-edit' : 'current-view')
    setWorkspaceDrawerOpen(false)
    setAssignmentNotice(`已切換至「${result.value.version.name}」`)
    try { window.sessionStorage.setItem('orgmaster.workspace.active-version.v1', versionId) } catch { /* best effort */ }
  }, [hydrateWorkspaceVersion, isDirty, persistDraft])

  const enterCurrentMaintenance = useCallback(() => {
    if (activeWorkspaceVersion?.kind !== 'current') return
    setWorkspaceMode('current-maintenance')
    setAssignmentNotice('已進入現行版維護；儲存前仍會檢查其他視窗的版本修訂')
  }, [activeWorkspaceVersion])

  const toggleCurrentMaintenance = useCallback(async () => {
    if (activeWorkspaceVersion?.kind !== 'current') return
    if (workspaceModeRef.current === 'current-view') {
      enterCurrentMaintenance()
      return
    }
    if (workspaceModeRef.current !== 'current-maintenance') return
    if (isDirty && !(await persistDraft())) return
    setWorkspaceMode('current-view')
    setAssignmentNotice('已切換為唯讀；目前版本不會寫入變更')
  }, [activeWorkspaceVersion, enterCurrentMaintenance, isDirty, persistDraft])

  const createDraft = useCallback(async (sourceVersionId: string, name: string) => {
    const index = workspaceIndexRef.current
    if (!index) return
    setWorkspaceBusy(true)
    const result = await createWorkspaceDraftRequest(sourceVersionId, name, index.manifestRevision)
    setWorkspaceBusy(false)
    if (result.status !== 'loaded') {
      setAssignmentNotice(result.statusCode === 409 ? '版本清單已被其他視窗更新，請重新開啟工作區後再建立草稿' : result.message)
      return
    }
    setWorkspaceIndex(result.value.workspace)
    const loaded = await hydrateWorkspaceVersion(result.value.createdVersionId)
    if (loaded.status === 'loaded') {
      setWorkspaceMode('draft-edit')
      setWorkspaceDrawerOpen(false)
      setAssignmentNotice(`已建立草稿「${loaded.value.version.name}」`)
    } else {
      setAssignmentNotice(loaded.message)
    }
  }, [hydrateWorkspaceVersion])

  const updateWorkspaceEntry = useCallback(async (versionId: string, action: 'rename' | 'archive' | 'restore', name?: string) => {
    const index = workspaceIndexRef.current
    if (!index) return
    setWorkspaceBusy(true)
    const result = await updateWorkspaceEntryClient(versionId, action, index.manifestRevision, name)
    setWorkspaceBusy(false)
    if (result.status !== 'loaded') {
      setAssignmentNotice(result.statusCode === 409 ? '版本清單已被其他視窗更新，請重新開啟工作區後再操作' : result.message)
      return
    }
    setWorkspaceIndex(result.value)
    if (action === 'archive' && versionId === activeVersionIdRef.current) {
      const loaded = await hydrateWorkspaceVersion(result.value.currentVersionId)
      if (loaded.status === 'loaded') setWorkspaceMode('current-view')
    }
  }, [hydrateWorkspaceVersion])

  useEffect(() => {
    if (recoveryOpen || !serverReady || !editingEnabled) {
      setAutoSavePending(false)
      return
    }
    if (serverHydrationPendingRef.current) {
      if (serverHydrationSignatureRef.current !== currentSignature) return
      serverHydrationPendingRef.current = false
      setAutoSavePending(false)
      return
    }
    setAutoSavePending(true)
    const timer = window.setTimeout(() => {
      void persistDraft()
    }, AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [currentSignature, editingEnabled, persistDraft, recoveryOpen, serverReady])

  useEffect(() => {
    const flushDraft = () => {
      void persistDraft()
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushDraft()
    }
    window.addEventListener('pagehide', flushDraft)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('pagehide', flushDraft)
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [persistDraft])

  const saveDocumentCopy = useCallback(() => {
    const document = createOrgDocumentFile(currentState, 'copy')
    const downloaded = downloadOrgDocument(document, createDownloadFilename('copy'))
    setAssignmentNotice(downloaded ? '已下載可編輯副本' : '副本下載失敗，請確認瀏覽器下載權限')
  }, [currentState])

  const backupDocument = useCallback(() => {
    const document = createOrgDocumentFile(currentState, 'backup')
    const downloaded = downloadOrgDocument(document, createDownloadFilename('backup'))
    setAssignmentNotice(downloaded ? '已下載完整備份檔' : '備份下載失敗，請確認瀏覽器下載權限')
  }, [currentState])

  const toggleCollapse = useCallback((id: string) => {
    commit((current) => current.map((member) => (
      member.id === id ? { ...member, collapsed: !member.collapsed } : member
    )))
  }, [commit])

  const changeAssignment = useCallback((
    employeeId: string,
    targetPositionId: string,
    sourcePositionId: string | null = null,
  ) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return
    }
    const target = positionViewById.get(targetPositionId)
    const employee = employeeById.get(employeeId)
    if (!target || !employee || sourcePositionId === targetPositionId) {
      return
    }
    const replaced = !target.allowMultipleAssignees
      && target.activeAssignments.some((assignment) => assignment.employeeId !== employeeId)
    commitState((current) => assignEmployeeWithResponsibilities(current, employeeId, targetPositionId, sourcePositionId, {
        asOf: TODAY,
        allowMultipleAssignees: target.allowMultipleAssignees,
      }))
    setAssignmentNotice(
      `${sourcePositionId ? '已移動' : '已指派'} ${employee.name} 至「${target.title}」${replaced ? '，原指派已解除' : ''}`,
    )
  }, [commitState, employeeById, positionViewById])

  const removeAssignment = useCallback((positionId: string, employeeId: string) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return
    }
    const position = positionViewById.get(positionId)
    const employee = employeeById.get(employeeId) ?? null
    if (!position || !employee) return
    commitState((current) => unassignEmployeeWithResponsibilities(current, positionId, employeeId, TODAY))
    setAssignmentNotice(`已將 ${employee.name} 移出「${position.title}」`)
  }, [commitState, employeeById, positionViewById])

  useEffect(() => {
    if (!assignmentNotice) return
    const timer = window.setTimeout(() => setAssignmentNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [assignmentNotice])

  useEffect(() => {
    if (!positionContextMenu) return
    const closeMenu = () => setPositionContextMenu(null)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('wheel', closeMenu, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('wheel', closeMenu, true)
    }
  }, [positionContextMenu])

  useLayoutEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      let changed = current.length !== previewMembers.filter((member) => previewLayout.visibleIds.has(member.id)).length
      const next = previewMembers
        .filter((member) => previewLayout.visibleIds.has(member.id) && previewPositionViewById.has(member.id))
        .map((member) => {
          const previous = currentById.get(member.id)
          const isDraggingNode = member.id === draggingId
          const showDragPlaceholder = isDraggingNode && !dragPreview
          const dragOffset = showDragPlaceholder ? dragVisualOffset ?? { x: 0, y: 0 } : undefined
          const position = showDragPlaceholder && previous
            ? previous.position
            : previewLayout.positions[member.id]
          const selectedState = member.id === selectedId
          const childTotal = childCount.get(member.id) ?? 0
          const viewMember = previewPositionViewById.get(member.id)!
          const employeeHighlighted = selectedEmployeePositionIds.has(member.id)
          const riskState = positionRiskById.get(member.id)
          const riskRelated = relatedRiskPositionIds.has(member.id)
          const employees = previewEmployeesByPositionId.get(member.id) ?? []
          const relationPlacementActive = relationPlacement.phase === 'placing'
            && (relationPlacement.payload.kind === 'employee' || relationPlacement.payload.kind === 'duty')
          const relationPlacementCandidate = relationPlacementActive
            && relationPlacement.candidate?.target.kind === 'position'
            && relationPlacement.candidate.target.positionId === member.id
            ? relationPlacement.candidate
            : null
          const positionSelectHandler = selectPosition
          const dataChanged = !previous
            || previous.data.member !== viewMember
            || previous.data.employees !== employees
            || previous.data.childCount !== childTotal
            || previous.data.onToggle !== toggleCollapse
            || previous.data.onSelectPosition !== positionSelectHandler
            || previous.data.onSelectEmployee !== selectEmployee
            || previous.data.onRelationBegin !== beginRelationPlacement
            || previous.data.onRelationCommit !== commitRelationPlacementTarget
            || previous.data.onRelationCancel !== cancelRelationPlacement
            || previous.data.relationPlacementActive !== relationPlacementActive
            || previous.data.relationPlacementCandidate !== relationPlacementCandidate
            || previous.data.showDragPlaceholder !== showDragPlaceholder
            || previous.data.employeeHighlighted !== employeeHighlighted
            || previous.data.riskLevel !== riskState?.level
            || previous.data.riskRelated !== riskRelated
            || previous.data.onRiskInteraction !== setRiskInteraction
            || previous.data.editingEnabled !== organizationEditingEnabled
            || previous.data.onRelationPreview !== previewRelationPlacementTarget
            || !sameOptionalPoint(previous.data.dragOffset, dragOffset)
          if (!previous || !sameOptionalPoint(previous.position, position) || previous.selected !== selectedState || dataChanged) {
            changed = true
            return {
              ...previous,
              id: member.id,
              type: 'org' as const,
              position,
              selected: selectedState,
              data: {
                member: viewMember,
                employees,
                childCount: childTotal,
                onToggle: toggleCollapse,
                onSelectPosition: positionSelectHandler,
                onSelectEmployee: selectEmployee,
                onRelationBegin: beginRelationPlacement,
                onRelationCommit: commitRelationPlacementTarget,
                onRelationCancel: cancelRelationPlacement,
                relationPlacementActive,
                relationPlacementCandidate,
                dragOffset,
                showDragPlaceholder,
                employeeHighlighted,
                riskLevel: riskState?.level,
                riskRelated,
                onRiskInteraction: setRiskInteraction,
                editingEnabled: organizationEditingEnabled,
                onRelationPreview: previewRelationPlacementTarget,
              },
            }
          }
          return previous
        })
      return changed ? next : current
    })
  }, [
    childCount,
    dragPreview,
    dragVisualOffset,
    draggingId,
    beginRelationPlacement,
    cancelRelationPlacement,
    commitRelationPlacementTarget,
    relationPlacement,
    previewRelationPlacementTarget,
    previewLayout,
    previewMembers,
     previewPositionViewById,
     previewEmployeesByPositionId,
    positionRiskById,
    relatedRiskPositionIds,
    selectedEmployeePositionIds,
    selectedId,
    selectEmployee,
    selectPosition,
    effectiveDutyConfigurationLocation.dutyId,
    setRiskInteraction,
    toggleCollapse,
    organizationEditingEnabled,
  ])

  useEffect(() => {
    if (selectedId && !memberById.has(selectedId)) {
      const fallbackId = hierarchyNodes.find((member) => member.parentId === null)?.id ?? hierarchyNodes[0]?.id
      if (fallbackId) selectPosition(fallbackId)
      else {
        setDirectorySelection(null)
        setInspectorOpen(false)
      }
    }
  }, [hierarchyNodes, memberById, selectPosition, selectedId])

  const edges = useMemo<OrgFlowEdge[]>(() => {
    const visibleChildren = previewMembers
      .filter((member) => member.parentId && previewLayout.visibleIds.has(member.id) && previewLayout.visibleIds.has(member.parentId))
    const childYsByParent = new Map<string, number[]>()
    for (const member of visibleChildren) {
      const point = previewLayout.positions[member.id]
      if (!member.parentId || !point) continue
      const childYs = childYsByParent.get(member.parentId) ?? []
      childYs.push(point.y)
      childYsByParent.set(member.parentId, childYs)
    }

    return visibleChildren.map((member) => {
      const parent = previewMemberById.get(member.parentId!)!
      const isHorizontal = parent.childrenAxis === 'horizontal'
      const parentPoint = previewLayout.positions[parent.id]
      const horizontalBranchOffset = isHorizontal && parentPoint
        ? getSharedHorizontalBranchOffset(
            parentPoint.y,
            previewNodeHeights[parent.id] ?? ORG_NODE_HEIGHT,
            childYsByParent.get(parent.id) ?? [],
          )
        : undefined
      return {
        id: `${parent.id}-${member.id}`,
        source: parent.id,
        target: member.id,
        sourceHandle: isHorizontal ? 'source-bottom' : 'source-bottom-right',
        targetHandle: isHorizontal ? 'target-top' : 'target-left',
        type: 'orthogonal',
        selectable: false,
        focusable: false,
        data: { childrenAxis: parent.childrenAxis, horizontalBranchOffset },
      }
    })
  }, [previewLayout, previewMemberById, previewMembers, previewNodeHeights])

  const onNodesChange = useCallback((changes: NodeChange<OrgFlowNode>[]) => {
    const changesToApply = changes.filter((change) => !(change.type === 'position' && change.id === positionDragRef.current.movingId))
    if (changesToApply.length === 0) return
    setNodes((current) => applyNodeChanges(changesToApply, current))
  }, [])

  const queueTitleEdit = useCallback(() => {
    setFocusTitleToken((token) => token + 1)
  }, [])

  const centerNodeInCanvas = useCallback((id: string) => {
    window.setTimeout(() => {
      const node = getNode(id)
      if (!node) return
      void setCenter(
        node.position.x + ORG_NODE_WIDTH / 2,
        node.position.y + ORG_NODE_HEIGHT / 2,
        { zoom: getZoom(), duration: 280 },
      )
    }, 80)
  }, [getNode, getZoom, setCenter])

  const addRoot = useCallback(() => {
    const id = crypto.randomUUID()
    const departmentId = departments[0]?.id
    if (!departmentId) return
    const roleInput = newPositionRoleInput(roles)
    const result = runOrganizationCommand({
      type: 'ADD_POSITION',
      position: { id, parentPositionId: null, organizationLevelId: [...organizationLevels].sort((first, second) => first.order - second.order)[0]?.id ?? null, roleId: roleInput.roleId, departmentId, title: '新職位' },
      role: roleInput.role,
      order: hierarchyNodes.filter((node) => node.parentId === null).length,
    })
    if (result.status !== 'applied') return
    selectPosition(id)
    queueTitleEdit()
    centerNodeInCanvas(id)
  }, [centerNodeInCanvas, departments, hierarchyNodes, organizationLevels, queueTitleEdit, roles, runOrganizationCommand])

  const addChild = useCallback((sourceId = selectedId) => {
    const source = positionViews.find((member) => member.id === sourceId)
    if (!source) return
    const id = crypto.randomUUID()
    const order = hierarchyNodes.filter((member) => member.parentId === source.id).length
    const departmentId = source.departmentId ?? departments[0]?.id
    if (!departmentId) return
    const organizationLevelId = getNextOrganizationLevelId(organizationLevels, source.organizationLevelId)
    if (source.organizationLevelId && !organizationLevelId) {
      setOrganizationIssue('此職位已在最低層；請先新增較低層級或調整層級')
      setOrganizationIssueTarget('level')
      setAssignmentNotice('無法新增子職位：目前職位已在最低組織層級')
      return
    }
    const roleInput = newPositionRoleInput(roles)
    const result = runOrganizationCommand({
      type: 'ADD_POSITION',
      position: { id, parentPositionId: source.id, organizationLevelId, roleId: roleInput.roleId, departmentId, title: '新職位' },
      role: roleInput.role,
      order,
    })
    if (result.status !== 'applied') return
    selectPosition(id)
    queueTitleEdit()
    centerNodeInCanvas(id)
  }, [centerNodeInCanvas, departments, hierarchyNodes, organizationLevels, positionViews, queueTitleEdit, roles, runOrganizationCommand, selectedId])

  const addSibling = useCallback((sourceId = selectedId) => {
    const source = positionViews.find((member) => member.id === sourceId)
    if (!source) return
    const id = crypto.randomUUID()
    const roleInput = newPositionRoleInput(roles)

    // A sibling under a different-department parent would create a second
    // disconnected block if it inherited the source department. Keep V1's
    // single-continuous-department rule by leaving that new position
    // unassigned; the inspector can assign the department explicitly later.
    const parent = source.parentPositionId
      ? hierarchyNodes.find((node) => node.id === source.parentPositionId)
      : null
    const departmentId = source.departmentId && parent?.departmentId === source.departmentId
      ? source.departmentId
      : null
    const result = runOrganizationCommand({
      type: 'ADD_POSITION',
      position: { id, parentPositionId: source.parentPositionId, organizationLevelId: source.organizationLevelId, roleId: roleInput.roleId, departmentId, title: '新職位' },
      role: roleInput.role,
      order: source.order + 1,
    })
    if (result.status !== 'applied') return
    if (source.departmentId && departmentId === null) {
      setAssignmentNotice('已新增同階職位；為避免部門分裂，請在右側確認所屬部門')
    }
    selectPosition(id)
    queueTitleEdit()
    centerNodeInCanvas(id)
  }, [centerNodeInCanvas, hierarchyNodes, positionViews, queueTitleEdit, roles, runOrganizationCommand, selectedId])

  const addPositionFromDirectory = useCallback(() => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return
    }
    if (selected) {
      addSibling(selectedId)
      return
    }

    const id = crypto.randomUUID()
    const departmentId = departments[0]?.id
    if (!departmentId) return
    const roleInput = newPositionRoleInput(roles)
    const result = runOrganizationCommand({
      type: 'ADD_POSITION',
      position: { id, parentPositionId: null, organizationLevelId: [...organizationLevels].sort((first, second) => first.order - second.order)[0]?.id ?? null, roleId: roleInput.roleId, departmentId, title: '新職位' },
      role: roleInput.role,
      order: hierarchyNodes.filter((node) => node.parentId === null).length,
    })
    if (result.status !== 'applied') return
    selectPosition(id)
    queueTitleEdit()
    centerNodeInCanvas(id)
  }, [addSibling, centerNodeInCanvas, departments, hierarchyNodes, organizationLevels, queueTitleEdit, roles, runOrganizationCommand, selected, selectedId])

  const createEmployee = useCallback((name: string, departmentIds: string[]) => {
    if (!departmentIds.every((id) => departments.some((item) => item.id === id))) return
    commitState((current) => ({
      ...current,
      employees: [...current.employees, {
        id: crypto.randomUUID(),
        name,
        departmentIds,
        primaryAssignmentId: null,
        administrativeApproverOverrideEmployeeId: null,
      }],
    }))
    setDirectoryDialog(null)
    setAssignmentNotice(`已新增員工 ${name}`)
  }, [commitState, departments])

  const createDepartment = useCallback((name: string, parentId: string | null) => {
    commitState((current) => ({
      ...current,
      departments: [...current.departments, { id: crypto.randomUUID(), name, parentId }],
    }))
    setDirectoryDialog(null)
    setAssignmentNotice(`已新增部門 ${name}`)
  }, [commitState])

  const updateEmployee = useCallback((employeeId: string, name: string, departmentIds: string[]) => {
    const employee = employees.find((item) => item.id === employeeId)
    if (!employee) return
    commitState((current) => updateEmployeeInDirectory(current, employeeId, name, departmentIds))
    setDirectoryDialog(null)
    setAssignmentNotice(`已更新員工 ${name}`)
  }, [commitState, employees])

  const updateDepartment = useCallback((departmentId: string, name: string, parentId: string | null) => {
    const department = departments.find((item) => item.id === departmentId)
    if (!department) return
    commitState((current) => updateDepartmentInDirectory(current, departmentId, name, parentId))
    setDirectoryDialog(null)
    setAssignmentNotice(`已更新部門 ${name}`)
  }, [commitState, departments])

  const changePrimaryAssignment = useCallback((employeeId: string, assignmentId: string) => {
    const result = setPrimaryAssignment(currentState, employeeId, assignmentId, TODAY)
    if (result.status === 'rejected') {
      setAssignmentNotice('主職只能選擇本人目前有效的一般任職')
      return
    }
    commitState(result.state)
    setAssignmentNotice('已更新主職；直屬主管路徑會依新的主職重新判定')
  }, [commitState, currentState])

  const deleteEmployee = useCallback((employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId)
    if (!employee) return
    commitState((current) => removeEmployeeFromDirectory(current, employeeId))
    setDirectoryDialog(null)
    setAssignmentNotice(`已刪除員工 ${employee.name}，並解除其職位指派`)
  }, [commitState, employees])

  const deleteDepartment = useCallback((departmentId: string, replacementDepartmentId?: string) => {
    const department = departments.find((item) => item.id === departmentId)
    if (!department) return
    const affectedEmployeeCount = employees.filter((employee) => employee.departmentIds.includes(departmentId)).length
    const affectedPositionCount = positions.filter((position) => position.status === 'active' && position.departmentId === departmentId).length
    const result = runOrganizationCommand({ type: 'DELETE_DEPARTMENT', departmentId, replacementDepartmentId })
    if (result.status === 'rejected') return
    setDirectoryDialog(null)
    setAssignmentNotice(
      replacementDepartmentId
        ? `已刪除部門 ${department.name}，${affectedEmployeeCount} 位員工與 ${affectedPositionCount} 個職位已轉移`
        : affectedEmployeeCount > 0 || affectedPositionCount > 0
          ? `已刪除部門 ${department.name}；相關員工與職位暫列為未設定部門`
          : `已刪除部門 ${department.name}`,
    )
  }, [departments, employees, positions, runOrganizationCommand])

  const requestDeletePosition = useCallback((positionId: string) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return
    }
    setPositionContextMenu(null)
    selectPosition(positionId)
    setDeleteOpen(true)
  }, [])

  const duplicateSelected = useCallback(() => {
    if (!selected) return
    const id = crypto.randomUUID()
    const result = runOrganizationCommand({ type: 'DUPLICATE_POSITION', sourcePositionId: selected.id, newPositionId: id })
    if (result.status !== 'applied') return
    setPositionContextMenu(null)
    selectPosition(id)
    setAssignmentNotice(`已複製「${selected.title}」；員工與下屬未複製`)
    queueTitleEdit()
    centerNodeInCanvas(id)
  }, [centerNodeInCanvas, queueTitleEdit, runOrganizationCommand, selected])

  const patchSelected = useCallback((patch: Partial<Pick<PositionView, 'title' | 'roleId' | 'departmentId' | 'organizationLevelId' | 'childrenAxis' | 'allowMultipleAssignees'>>) => {
    if (!selectedId) return
    const roleInput = patch.title !== undefined
      ? resolvePositionRole(roles, patch.title, () => crypto.randomUUID())
      : null
    runOrganizationCommand({
      type: 'PATCH_POSITION',
      positionId: selectedId,
      title: patch.title,
      roleId: roleInput?.roleId ?? patch.roleId,
      role: roleInput?.role,
      departmentId: patch.departmentId,
      organizationLevelId: patch.organizationLevelId,
      allowMultipleAssignees: patch.allowMultipleAssignees,
      childrenAxis: patch.childrenAxis,
    })
  }, [roles, runOrganizationCommand, selectedId])

  const previewOrganizationLevels = useCallback((levels: OrganizationLevel[] | null) => {
    setLevelOrderPreview(levels)
  }, [])

  const addOrganizationLevel = useCallback((name: string) => {
    const result = runOrganizationCommand({
      type: 'ADD_ORGANIZATION_LEVEL',
      level: { id: crypto.randomUUID(), name },
    })
    if (result.status === 'applied') setAssignmentNotice(`已新增組織層級「${name.trim()}」`)
    return result.status === 'applied' || result.status === 'noop'
  }, [runOrganizationCommand])

  const renameOrganizationLevel = useCallback((levelId: string, name: string) => {
    const result = runOrganizationCommand({ type: 'RENAME_ORGANIZATION_LEVEL', levelId, name })
    if (result.status === 'applied') setAssignmentNotice(`已更新組織層級為「${name.trim()}」`)
    return result.status === 'applied' || result.status === 'noop'
  }, [runOrganizationCommand])

  const deleteOrganizationLevel = useCallback((levelId: string) => {
    const level = organizationLevels.find((candidate) => candidate.id === levelId)
    const result = runOrganizationCommand({ type: 'DELETE_ORGANIZATION_LEVEL', levelId })
    if (result.status === 'applied') setAssignmentNotice(`已刪除組織層級「${level?.name ?? ''}」`)
    return result.status === 'applied' || result.status === 'noop'
  }, [organizationLevels, runOrganizationCommand])

  const reorderOrganizationLevels = useCallback((levelIds: string[]) => {
    const result = runOrganizationCommand({ type: 'REORDER_ORGANIZATION_LEVELS', levelIds })
    if (result.status === 'applied') setAssignmentNotice('已套用新的組織層級順序')
    return result.status === 'applied' || result.status === 'noop'
  }, [runOrganizationCommand])

  const setChildrenAxis = useCallback((childrenAxis: ChildrenAxis) => {
    patchSelected({ childrenAxis })
  }, [patchSelected])

  const reorderSelected = useCallback((delta: -1 | 1) => {
    if (!selected) return
    runOrganizationCommand({ type: 'REORDER_POSITION', positionId: selected.id, delta })
  }, [runOrganizationCommand, selected])

  const clearDragPreviewTimer = useCallback(() => {
    if (dragPreviewTimerRef.current === null) return
    window.clearTimeout(dragPreviewTimerRef.current)
    dragPreviewTimerRef.current = null
  }, [])

  const previewPositionCandidate = useCallback((movingId: string, candidate: DropCandidate) => {
    const interaction = positionDragRef.current
    if (interaction.movingId !== movingId
      || interaction.phase !== 'candidate-pending'
      || !sameDropCandidate(interaction.candidate, candidate)) return

    const currentHierarchyNodes = buildHierarchyNodes(currentStateRef.current)
    const previewCommand = moveCommandFromCandidate(movingId, candidate, currentHierarchyNodes)
    const previewResult = executeOrganizationCommand(currentStateRef.current, previewCommand)
    if (previewResult.status !== 'applied') {
      positionDragRef.current = clearPositionDragCandidate(interaction)
      setDragPreview(null)
      if (previewResult.status === 'rejected') {
        setAssignmentNotice(organizationIssueMessage(previewResult.issue, departments))
      }
      return
    }

    positionDragRef.current = setPreviewedPositionDragCandidate(interaction, candidate)
    setDragPreview({ movingId, candidate })
    setAssignmentNotice('')
    setDragVisualOffset({ x: 0, y: 0 })
  }, [departments])

  const onNodeDragStart: OnNodeDrag<OrgFlowNode> = useCallback((event, draggedNode) => {
    if (!editingEnabledRef.current) return
    clearDragPreviewTimer()
    positionDragGeometryRef.current = {
      nodes: nodes.map((node) => ({ id: node.id, position: { ...node.position } })),
      hierarchyNodes: hierarchyNodes.map((node) => ({ ...node })),
    }
    setPositionContextMenu(null)
    const origin = layout.positions[draggedNode.id] ?? draggedNode.position
    const point = 'clientX' in event
      ? screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : { x: origin.x + ORG_NODE_WIDTH / 2, y: origin.y + ORG_NODE_HEIGHT / 2 }
    positionDragRef.current = startPositionDrag(draggedNode.id, point)
    dragOriginRef.current = origin
    dragGrabOffsetRef.current = { x: point.x - origin.x, y: point.y - origin.y }
    setOrganizationIssue(null)
    setOrganizationIssueTarget(null)
    setAssignmentNotice('')
    setDraggingId(draggedNode.id)
    setDragPreview(null)
    setDragVisualOffset({ x: 0, y: 0 })
    setDragSnapTargetId(null)
  }, [clearDragPreviewTimer, hierarchyNodes, layout.positions, nodes, screenToFlowPosition])

  const openPositionContextMenu = useCallback((event: React.MouseEvent, node: OrgFlowNode) => {
    event.preventDefault()
    if (!editingEnabledRef.current) return
    const menuWidth = 216
    const menuHeight = 238
    const viewportMargin = 8
    const x = Math.max(viewportMargin, Math.min(event.clientX, window.innerWidth - menuWidth - viewportMargin))
    const y = Math.max(viewportMargin, Math.min(event.clientY, window.innerHeight - menuHeight - viewportMargin))
    contextMenuTriggerRef.current = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node')
    selectPosition(node.id)
    setPositionContextMenu({ positionId: node.id, x, y })
  }, [])

  const closePositionContextMenu = useCallback(() => {
    setPositionContextMenu(null)
    window.requestAnimationFrame(() => contextMenuTriggerRef.current?.focus())
  }, [])

  const onNodeDrag: OnNodeDrag<OrgFlowNode> = useCallback((event, draggedNode) => {
    const interaction = positionDragRef.current
    if (interaction.movingId !== draggedNode.id) return
    const geometry = positionDragGeometryRef.current ?? {
      nodes: nodes.map((node) => ({ id: node.id, position: { ...node.position } })),
      hierarchyNodes,
    }
    const origin = dragOriginRef.current ?? draggedNode.position
    const grabOffset = dragGrabOffsetRef.current ?? { x: ORG_NODE_WIDTH / 2, y: ORG_NODE_HEIGHT / 2 }
    const point = 'clientX' in event
      ? screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : {
        x: draggedNode.position.x + grabOffset.x,
          y: draggedNode.position.y + grabOffset.y,
        }
    const nextOffset = calculateDragOffset(point, origin, grabOffset)
    positionDragRef.current = updatePositionDragPointer(interaction, point)
    const isTreeYDrag = !levelOrderPreview
      && organizationLayout.mode === 'tree'
      && isVerticalPositionDrag(nextOffset)
    const match = isTreeYDrag
      ? null
      : findDropCandidate(point, draggedNode.id, geometry.nodes, geometry.hierarchyNodes)
    if (!match) {
      clearDragPreviewTimer()
      const activeCandidate = positionDragRef.current.candidate
      const activeDistance = activeCandidate
        ? getDropCandidateDistance(point, activeCandidate, draggedNode.id, geometry.nodes, geometry.hierarchyNodes)
        : null
      if (!isTreeYDrag
        && positionDragRef.current.phase === 'previewed'
        && activeCandidate
        && shouldRetainDropPreview(activeDistance)) return
      positionDragRef.current = clearPositionDragCandidate(positionDragRef.current)
      setDragPreview(null)
      setAssignmentNotice('')
      if (!levelOrderPreview && organizationLayout.mode === 'tree') {
        const snapped = snapPositionY(origin.y + nextOffset.y, geometry.nodes, draggedNode.id)
        setDragVisualOffset((current) => {
          const adjusted = { x: 0, y: snapped.y - origin.y }
          return sameOptionalPoint(current ?? undefined, adjusted) ? current : adjusted
        })
        setDragSnapTargetId(snapped.targetId)
      } else {
        setDragVisualOffset((current) => sameOptionalPoint(current ?? undefined, nextOffset) ? current : nextOffset)
        setDragSnapTargetId(null)
      }
      return
    }

    setDragVisualOffset((current) => sameOptionalPoint(current ?? undefined, nextOffset) ? current : nextOffset)
    setDragSnapTargetId(null)

    const activeCandidate = positionDragRef.current.candidate
    if (activeCandidate && !sameDropCandidate(activeCandidate, match.candidate)) {
      const activeDistance = getDropCandidateDistance(
        point,
        activeCandidate,
        draggedNode.id,
        geometry.nodes,
        geometry.hierarchyNodes,
      )
      if (activeDistance !== null && match.distance + CANDIDATE_SWITCH_MARGIN >= activeDistance) return
    }

    if (positionDragRef.current.phase === 'previewed'
      && sameDropCandidate(positionDragRef.current.candidate, match.candidate)) return

    const now = performance.now()
    if (positionDragRef.current.phase === 'candidate-pending'
      && sameDropCandidate(positionDragRef.current.candidate, match.candidate)) {
      if (now - (positionDragRef.current.stableSince ?? now) < PREVIEW_STABLE_MS) return
      clearDragPreviewTimer()
      previewPositionCandidate(draggedNode.id, match.candidate)
      return
    } else {
      clearDragPreviewTimer()
      positionDragRef.current = setPendingPositionDragCandidate(positionDragRef.current, match.candidate, now)
      setDragPreview(null)
      setAssignmentNotice('')
      dragPreviewTimerRef.current = window.setTimeout(() => {
        dragPreviewTimerRef.current = null
        previewPositionCandidate(draggedNode.id, match.candidate)
      }, PREVIEW_STABLE_MS)
      return
    }
  }, [clearDragPreviewTimer, hierarchyNodes, levelOrderPreview, nodes, organizationLayout.mode, previewPositionCandidate, screenToFlowPosition])

  const onNodeDragStop: OnNodeDrag<OrgFlowNode> = useCallback((event, draggedNode) => {
    clearDragPreviewTimer()
    const interaction = positionDragRef.current
    const origin = dragOriginRef.current ?? draggedNode.position
    const grabOffset = dragGrabOffsetRef.current ?? { x: ORG_NODE_WIDTH / 2, y: ORG_NODE_HEIGHT / 2 }
    const releasePoint = 'clientX' in event
      ? screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : {
          x: draggedNode.position.x + grabOffset.x,
          y: draggedNode.position.y + grabOffset.y,
        }
    const geometry = positionDragGeometryRef.current ?? {
      nodes: nodes.map((node) => ({ id: node.id, position: { ...node.position } })),
      hierarchyNodes,
    }
    const releaseOffset = calculateDragOffset(releasePoint, origin, grabOffset)
    const isTreeYDrag = !levelOrderPreview
      && organizationLayout.mode === 'tree'
      && isVerticalPositionDrag(releaseOffset)
    const currentHierarchyNodes = buildHierarchyNodes(currentStateRef.current)
    const releaseMatch = isTreeYDrag
      ? null
      : findDropCandidate(releasePoint, draggedNode.id, geometry.nodes, currentHierarchyNodes)
    const releaseDistance = interaction.candidate
      ? getDropCandidateDistance(releasePoint, interaction.candidate, draggedNode.id, geometry.nodes, currentHierarchyNodes)
      : null
    const canCommit = canCommitPositionDrag(interaction, releaseMatch?.candidate ?? null)
    const candidate = canCommit ? releaseMatch?.candidate ?? null : null
    const moveCommand = candidate ? moveCommandFromCandidate(draggedNode.id, candidate, currentHierarchyNodes) : null
    const result = moveCommand ? executeOrganizationCommand(currentStateRef.current, moveCommand) : null
    const yOverride = isTreeYDrag && !result
      ? snapPositionY(releasePoint.y - grabOffset.y, geometry.nodes, draggedNode.id)
      : null
    positionDragRef.current = resetPositionDrag()
    positionDragGeometryRef.current = null
    dragOriginRef.current = null
    dragGrabOffsetRef.current = null
    setDraggingId(null)
    setDragVisualOffset(null)
    setDragSnapTargetId(null)
    setDragPreview(null)
    setAssignmentNotice('')
    if (result?.status === 'applied') {
      setOrganizationIssue(null)
      setOrganizationIssueTarget(null)
      commitState(result.state)
      selectPosition(draggedNode.id)
      return
    }

    if (result?.status === 'rejected') {
      setOrganizationIssue(organizationIssueMessage(result.issue, departments))
      setOrganizationIssueTarget(resolveOrganizationIssueTarget(moveCommand!, result.issue))
    }

    if (yOverride && Math.abs(yOverride.y - origin.y) >= POSITION_DRAG_THRESHOLD) {
      const yResult = executeOrganizationCommand(currentStateRef.current, {
        type: 'SET_POSITION_Y_OVERRIDE',
        positionId: draggedNode.id,
        y: yOverride.y,
      })
      if (yResult.status === 'applied') {
        commitState(yResult.state)
        setAssignmentNotice(yOverride.targetId
          ? `已磁吸對齊「${memberById.get(yOverride.targetId)?.title ?? '鄰近職位'}」，並固定 Y 軸位置`
          : `已固定「${memberById.get(draggedNode.id)?.title ?? '此職位'}」的 Y 軸位置`)
      } else if (yResult.status === 'rejected') {
        setOrganizationIssue(organizationIssueMessage(yResult.issue, departments))
        setOrganizationIssueTarget('drag')
      }
    }

    setNodes((current) => current.map((node) => ({
      ...node,
      position: layout.positions[node.id] ?? node.position,
    })))
  }, [clearDragPreviewTimer, commitState, departments, hierarchyNodes, layout.positions, levelOrderPreview, memberById, nodes, organizationLayout.mode, screenToFlowPosition, selectPosition])

  const showSelected = useCallback((id: string) => {
    const ancestors = new Set<string>()
    let cursor = memberById.get(id)
    while (cursor?.parentId) {
      ancestors.add(cursor.parentId)
      cursor = memberById.get(cursor.parentId)
    }
    const needsReveal = members.some((member) => ancestors.has(member.id) && member.collapsed)
    if (needsReveal) {
      commit((current) => current.map((member) => ancestors.has(member.id) ? { ...member, collapsed: false } : member))
    }
    selectPosition(id)
    window.setTimeout(() => {
      const node = getNode(id)
      if (node) void fitView({ nodes: [node], duration: 320, padding: 1.2, maxZoom: 1.15 })
    }, needsReveal ? 80 : 0)
  }, [commit, fitView, getNode, memberById, members])

  const confirmDelete = useCallback((mode: 'branch' | 'promote') => {
    if (!selected) return
    const result = runOrganizationCommand({ type: 'DELETE_POSITION', positionId: selected.id, mode, asOf: TODAY })
    if (result.status === 'rejected') return

    setDeleteOpen(false)
    const nextId = selected.parentPositionId ?? hierarchyNodes.find((member) => member.id !== selected.id && member.parentId === null)?.id
    if (nextId) selectPosition(nextId)
    else {
      setSelectedId(null)
      setDirectorySelection(null)
      setInspectorOpen(false)
    }
  }, [hierarchyNodes, runOrganizationCommand, selectPosition, selected])

  const fitOrganization = useCallback(() => {
    void fitView({ duration: 320, padding: 0.04, maxZoom: 1.15 })
  }, [fitView])

  useEffect(() => {
    if (!serverReady) return

    const frame = window.requestAnimationFrame(() => {
      fitOrganization()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fitOrganization, serverReady])

  const selectNode = useCallback((id: string) => {
    selectPosition(id)
    if (window.innerWidth <= 1100) centerNodeInCanvas(id)
  }, [centerNodeInCanvas, selectPosition])

  useEffect(() => {
    const relationKeyboardActive = relationPlacement.phase === 'placing' && relationPlacement.inputMode === 'keyboard'
    if (!relationKeyboardActive) return

    const onKeyboardPlacementKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelRelationPlacement()
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const active = document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>('[data-relation-placement-target]')
          : null
        if (active) {
          const target: RegisteredDropTarget | null = active.dataset.relationPlacementTarget === 'position' && active.dataset.positionId
            ? { kind: 'position', positionId: active.dataset.positionId }
            : active.dataset.relationPlacementTarget === 'process-node' && active.dataset.processNodeId
              ? { kind: 'process-node', processNodeId: active.dataset.processNodeId }
              : active.dataset.relationPlacementTarget === 'duty' && active.dataset.dutyId
                ? { kind: 'duty', dutyId: active.dataset.dutyId }
                : active.dataset.relationPlacementTarget === 'employee-unassign'
                  ? { kind: 'employee-unassign' }
                  : null
          if (target) {
            event.preventDefault()
            event.stopPropagation()
            commitRelationPlacementTarget(target)
            return
          }
        }
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-relation-placement-target][tabindex="0"], [data-relation-placement-target="employee-unassign"]'))
        const current = document.activeElement?.closest<HTMLElement>('[data-relation-placement-target]')
        const currentIndex = current ? targets.indexOf(current) : -1
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? targets.length - 1 : currentIndex - 1)
          : (currentIndex + 1) % Math.max(targets.length, 1)
        targets[nextIndex]?.focus()
      }
    }

    // Keyboard relation placement owns Escape/Tab before the quick drawer's
    // document-level dismiss handler. This keeps the source drawer mounted so
    // cancellation can restore focus to the original grab control.
    document.addEventListener('keydown', onKeyboardPlacementKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyboardPlacementKeyDown, true)
  }, [
    commitRelationPlacementTarget,
    cancelRelationPlacement,
    relationPlacement,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A failed document is a recovery gate: keyboard shortcuts must not
      // mutate, save, undo, or dismiss the empty fallback workspace.
      if (recoveryOpen) return
      if (relationPlacement.phase === 'placing' && relationPlacement.inputMode === 'keyboard') {
        return
      }
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return
        if (positionContextMenu) {
          event.preventDefault()
          closePositionContextMenu()
          return
        }
        const action = resolveEscapeDismissAction({
          recoveryOpen,
          deleteOpen,
          directoryDialogOpen: Boolean(directoryDialog),
          roleRiskOpen: false,
          editorBoundaryActive: isTextEditor(event.target),
          focusedPanel: workspacePanelFromTarget(event.target) ?? workspacePanelFromTarget(document.activeElement),
          lastInteractedPanel: lastInteractedPanelRef.current,
          inspectorOpen,
          directoryOpen: activeDirectory !== null,
        })
        if (action === 'none') return
        event.preventDefault()
        if (action === 'close-delete-dialog') setDeleteOpen(false)
        else if (action === 'close-directory-dialog') setDirectoryDialog(null)
        else if (action === 'close-inspector') closeInspectorPanel()
        else if (action === 'close-directory') closeDirectoryPanel()
        return
      }

      if (deleteOpen || directoryDialog) return

      if (isTextEditor(event.target)) return

      if (positionContextMenu) return

      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (event.shiftKey) saveDocumentCopy()
        else saveDocument()
        return
      }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (!editingEnabled) return
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        if (!editingEnabled) return
        redo()
        return
      }
      if (command && event.key === '0') {
        event.preventDefault()
        fitOrganization()
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        setSearchFocusToken((token) => token + 1)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault()
        return
      }
      if (!selected) return
      if (event.key === 'Enter') {
        event.preventDefault()
        addSibling()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        addChild()
      } else if (event.key === 'F2' || event.key === ' ') {
        event.preventDefault()
        queueTitleEdit()
      } else if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault()
        reorderSelected(-1)
      } else if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        reorderSelected(1)
      } else if (event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        setChildrenAxis('horizontal')
      } else if (event.altKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        setChildrenAxis('vertical')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    addChild,
    addSibling,
    activeDirectory,
    cancelRelationPlacement,
    closeDirectoryPanel,
    closeInspectorPanel,
    closePositionContextMenu,
    deleteOpen,
    relationPlacement,
    directoryDialog,
    fitOrganization,
    editingEnabled,
    queueTitleEdit,
    redo,
    recoveryOpen,
    reorderSelected,
    positionContextMenu,
    saveDocument,
    saveDocumentCopy,
    selected,
    inspectorOpen,
    setChildrenAxis,
    undo,
  ])

  const selectedChildCount = selected ? childCount.get(selected.id) ?? 0 : 0
  const selectedDutyForConfiguration = effectiveDutyConfigurationLocation.dutyId
    ? duties.find((duty) => duty.id === effectiveDutyConfigurationLocation.dutyId) ?? null
    : null
  const runDutyConfigurationCommand = useCallback((command: OrganizationCommand) => {
    if (!dutyConfigurationWritable) {
      setDutyConfigurationError('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return null
    }
    const result = executeOrganizationCommand(currentStateRef.current, command)
    if (result.status === 'applied') {
      commitState(result.state)
      setDutyConfigurationError(null)
    } else if (result.status === 'rejected') {
      setDutyConfigurationError(organizationIssueMessage(result.issue, departments))
    }
    return result
  }, [commitState, departments, dutyConfigurationWritable])
  const saveNewDuty = useCallback((title: string, description: string | null) => {
    const id = `duty-${crypto.randomUUID()}`
    const result = runDutyConfigurationCommand({ type: 'CREATE_DUTY', duty: { id, title, description } })
    if (result?.status === 'applied') {
      setDutyEditDialog(null)
      selectDutyFromPicker(id)
    }
  }, [runDutyConfigurationCommand, selectDutyFromPicker])
  const renderDirectorySurface = (kind: DirectoryKind) => (
    <DirectoryDock
      presentation="surface"
      employees={employees}
      departments={departments}
      members={positionViews}
      positions={positions}
      assignments={assignments}
      organizationLevels={organizationLevels}
      levelIssue={organizationIssueTarget === 'level' ? organizationIssue : null}
      editingEnabled={kind === 'duties' ? dutyConfigurationWritable : masterDataEditingEnabled}
      selected={selected}
      directorySelection={directorySelection}
      activeDirectory={kind}
      onActiveDirectoryChange={() => undefined}
      onRelationBegin={beginRelationPlacement}
      onRelationPreview={previewRelationPlacementTarget}
      onRelationCancel={cancelRelationPlacement}
      onAssignEmployee={(employeeId, targetPositionId) => changeAssignment(employeeId, targetPositionId)}
      onSelectPosition={(positionId) => {
        showSelected(positionId)
        workspaceController.setSharedSelection({ kind: 'position', id: positionId }, kind === 'duties' ? 'duties' : 'positions')
        const context = workspaceController.state.session.panels.positions?.context
        if (context) workspaceController.updatePanelContext('positions', { ...context, positionId })
      }}
      onSelectEntity={(selection) => {
        selectEntity(selection)
        const entityKind = selection.kind === 'employees' ? 'employee'
          : selection.kind === 'positions' ? 'position'
            : selection.kind === 'departments' ? 'department'
              : selection.kind === 'levels' ? 'level'
                : 'duty'
        workspaceController.setSharedSelection({ kind: entityKind, id: selection.id }, kind === 'duties' ? 'duties' : kind)
        if (selection.kind === 'employees') {
          const context = workspaceController.state.session.panels.employees?.context
          if (context) workspaceController.updatePanelContext('employees', { ...context, employeeId: selection.id })
        } else if (selection.kind === 'positions') {
          const context = workspaceController.state.session.panels.positions?.context
          if (context) workspaceController.updatePanelContext('positions', { ...context, positionId: selection.id })
        } else if (selection.kind === 'departments') {
          const context = workspaceController.state.session.panels.departments?.context
          if (context) workspaceController.updatePanelContext('departments', { departmentId: selection.id })
        } else if (selection.kind === 'levels') {
          const context = workspaceController.state.session.panels.levels?.context
          if (context) workspaceController.updatePanelContext('levels', { levelId: selection.id })
        }
      }}
      onAddEmployee={() => {
        if (!masterDataEditingEnabled) { setAssignmentNotice('目前版本為唯讀，無法修改員工資料'); return }
        setDirectoryDialog({ type: 'add-employee' })
      }}
      onAddPosition={addPositionFromDirectory}
      onAddDepartment={() => {
        if (!masterDataEditingEnabled) { setAssignmentNotice('目前版本為唯讀，無法修改部門資料'); return }
        setDirectoryDialog({ type: 'add-department' })
      }}
      onDeleteEmployee={(employeeId) => {
        if (!masterDataEditingEnabled) { setAssignmentNotice('目前版本為唯讀，無法修改員工資料'); return }
        setDirectoryDialog({ type: 'delete-employee', employeeId })
      }}
      onDeletePosition={requestDeletePosition}
      onDeleteDepartment={(departmentId) => {
        if (!masterDataEditingEnabled) { setAssignmentNotice('目前版本為唯讀，無法修改部門資料'); return }
        setDirectoryDialog({ type: 'delete-department', departmentId })
      }}
      onEditEmployee={(employeeId) => {
        if (!masterDataEditingEnabled) { setAssignmentNotice('目前版本為唯讀，無法修改員工資料'); return }
        setDirectoryDialog({ type: 'edit-employee', employeeId })
      }}
      onEditPosition={(positionId) => { showSelected(positionId); queueTitleEdit() }}
      onEditDepartment={(departmentId) => {
        if (!masterDataEditingEnabled) { setAssignmentNotice('目前版本為唯讀，無法修改部門資料'); return }
        setDirectoryDialog({ type: 'edit-department', departmentId })
      }}
      onAddOrganizationLevel={addOrganizationLevel}
      onRenameOrganizationLevel={renameOrganizationLevel}
      onDeleteOrganizationLevel={deleteOrganizationLevel}
      onReorderOrganizationLevels={reorderOrganizationLevels}
      onPreviewOrganizationLevels={previewOrganizationLevels}
      duties={duties}
      dutyPositionRelations={dutyPositionRelations}
      dutyConfigurationLocation={effectiveDutyConfigurationLocation}
      dutyConfigurationExpandedDutyId={dutyConfigurationExpandedDutyId}
      dutyConfigurationWritable={dutyConfigurationWritable}
      dutyConfigurationError={dutyConfigurationError}
      onSelectDuty={selectDutyFromPicker}
      onSelectDutyLane={selectDutyLane}
      onOpenDutyConfigurationDetail={openDutyConfigurationDetail}
      onOpenDutyPlanning={() => openDutyPlanningPage('audit')}
      workspaceEntityDragSource={kind === 'duties' ? 'duties' : kind === 'employees' ? 'employees' : undefined}
      onRelationCommit={kind === 'duties' ? commitRelationPlacementTarget : undefined}
      initialQuery={kind === 'employees'
        ? workspaceController.state.session.panels.employees?.context.query ?? workspaceModuleQueries.employees
        : kind === 'positions'
          ? workspaceController.state.session.panels.positions?.context.query ?? workspaceModuleQueries.positions
          : kind === 'duties'
            ? workspaceController.state.session.panels.duties?.context.query ?? workspaceModuleQueries.duties
            : ''}
      onQueryChange={(query) => {
        if (kind === 'employees') {
          setWorkspaceModuleQueries((current) => ({ ...current, employees: query }))
          const context = workspaceController.state.session.panels.employees?.context
          if (context) workspaceController.updatePanelContext('employees', { ...context, query })
        } else if (kind === 'positions') {
          setWorkspaceModuleQueries((current) => ({ ...current, positions: query }))
          const context = workspaceController.state.session.panels.positions?.context
          if (context) workspaceController.updatePanelContext('positions', { ...context, query })
        } else if (kind === 'duties') {
          setWorkspaceModuleQueries((current) => ({ ...current, duties: query }))
          const context = workspaceController.state.session.panels.duties?.context
          if (context) workspaceController.updatePanelContext('duties', { ...context, query })
        }
      }}
      onCreateDuty={() => {
        if (!dutyConfigurationWritable) {
          setDutyConfigurationError('目前版本為唯讀；請先進入草稿編輯或現行版維護')
          return
        }
        setDutyEditDialog('create')
      }}
    />
  )
  const directoryDetailSelection: DirectoryDetailSelection | null = directorySelection?.kind === 'employees' || directorySelection?.kind === 'departments'
    ? { kind: directorySelection.kind, id: directorySelection.id }
    : null
  const selectPositionFromMasterDetail = (positionId: string) => {
    showSelected(positionId)
    const source = workspaceController.state.session.focusedPanel
    workspaceController.setSharedSelection({ kind: 'position', id: positionId }, source === 'employees' || source === 'departments' || source === 'positions' ? source : 'positions')
    const context = workspaceController.state.session.panels.positions?.context
    if (context) workspaceController.updatePanelContext('positions', { ...context, positionId })
  }
  const selectEntityFromMasterDetail = (selection: DirectorySelection) => {
    selectEntity(selection)
    const source = workspaceController.state.session.focusedPanel
    const sourcePanel = source === 'employees' || source === 'departments' || source === 'positions' ? source : selection.kind === 'employees' ? 'employees' : selection.kind === 'departments' ? 'departments' : 'positions'
    const kind = selection.kind === 'employees' ? 'employee' : selection.kind === 'departments' ? 'department' : selection.kind === 'positions' ? 'position' : selection.kind === 'levels' ? 'level' : 'duty'
    workspaceController.setSharedSelection({ kind, id: selection.id }, sourcePanel)
    if (selection.kind === 'employees') {
      const context = workspaceController.state.session.panels.employees?.context
      if (context) workspaceController.updatePanelContext('employees', { ...context, employeeId: selection.id })
    } else if (selection.kind === 'departments') {
      const context = workspaceController.state.session.panels.departments?.context
      if (context) workspaceController.updatePanelContext('departments', { departmentId: selection.id })
    }
  }
  const renderMasterDataDetail = (moduleId: MasterDataModuleId) => {
    if (!directorySelection || directorySelection.kind !== moduleId) return null
    if (directoryDetailSelection) return (
      <DirectoryDetailPanel
        selection={directoryDetailSelection}
        employees={employees}
        departments={departments}
        organizationLevels={organizationLevels}
        members={positionViews}
        onSetPrimaryAssignment={changePrimaryAssignment}
        editingEnabled={masterDataEditingEnabled}
        onSelectPosition={selectPositionFromMasterDetail}
        onSelectEntity={selectEntityFromMasterDetail}
        onClose={closeInspectorPanel}
      />
    )
    if (directorySelection.kind !== 'positions') return null
    return (
      <Inspector
      member={selected}
      employees={selectedEmployees}
      departments={departments}
      roles={roles}
      organizationLevels={organizationLevels}
      activeAssignments={selected?.activeAssignments ?? []}
      departmentName={selectedDepartmentName}
      childCount={selectedChildCount}
      depth={selected ? getHierarchyDepth(hierarchyNodes, selected.id) : 0}
      focusTitleToken={focusTitleToken}
      parentOptions={parentOptions}
      parentOptionGroups={parentOptionGroups}
      issue={inspectorIssue}
      onPatch={patchSelected}
      onParentChange={(parentPositionId) => {
        if (!selected) return
        runOrganizationCommand({
          type: 'MOVE_POSITION',
          positionId: selected.id,
          parentPositionId,
          insertIndex: hierarchyNodes.filter((node) => node.parentId === parentPositionId && node.id !== selected.id).length,
        })
      }}
      onUnassignEmployee={(employeeId) => selected && removeAssignment(selected.id, employeeId)}
      onDelete={() => setDeleteOpen(true)}
      onOpenLevelDirectory={() => workspaceController.openDrawer('levels')}
      onClose={closeInspectorPanel}
      editingEnabled={masterDataEditingEnabled}
      duties={duties}
      dutyRelations={selected ? dutyPositionRelations.filter((relation) => relation.target.kind === 'position' && relation.target.positionId === selected.id) : []}
      onOpenDutyConfiguration={(positionId) => openDutyConfiguration(positionId)}
      />
    )
  }
  const organizationInspector = renderMasterDataDetail('positions')
  const dutyConfigurationDetail = dutyConfigurationActive && dutyDetailOpen ? (
    <DutyDetailDrawer
      duty={selectedDutyForConfiguration}
      state={currentState}
      editingEnabled={dutyConfigurationWritable}
      placementMode="organization-chart"
      displayMode="panel"
      onClose={() => setDutyDetailOpen(false)}
      onPatchDuty={(patch) => {
        if (!selectedDutyForConfiguration) return
        runDutyConfigurationCommand({ type: 'PATCH_DUTY', dutyId: selectedDutyForConfiguration.id, ...patch })
      }}
      onRemoveRelation={(relationId) => runDutyConfigurationCommand({ type: 'REMOVE_DUTY_RELATION', relationId })}
      onDeleteDuty={() => setDutyDeleteDialog(true)}
      onSelectPendingRelation={(relationId) => {
        const relation = currentState.dutyPositionRelations.find((item) => item.id === relationId)
        if (!relation) return
        const lane = relation.relationType === 'execute' ? (relation.isPrimaryExecutor ? 'primary-execute' : 'collaborate') : relation.relationType
        setDutyConfigurationLocation((current) => ({ ...current, active: true, dutyId: relation.dutyId, lane, sourceRelationId: relation.id }))
        const current = workspaceController.state.session.panels.duties?.context
        if (current) workspaceController.updatePanelContext('duties', { ...current, view: 'configuration', dutyId: relation.dutyId, lane, sourceRelationId: relation.id })
        setDutyDetailOpen(false)
        setDutyConfigurationError(null)
      }}
    />
  ) : undefined
  const organizationSurface = (
    <OrganizationPanel
      hasInspector={inspectorOpen && directorySelection?.kind === 'positions'}
      dutyConfigurationActive={dutyConfigurationActive}
      onPointerDownCapture={recordPanelInteraction}
      onFocusCapture={recordPanelInteraction}
    >
      <div
        className="canvas-wrap"
        tabIndex={-1}
        data-workspace-focus-fallback
      >
        {relationPlacement.phase === 'placing'
          && relationPlacement.payload.kind === 'employee'
          && relationPlacement.payload.sourcePositionId
          && <button
            type="button"
            className="relation-placement-unassign"
            data-relation-placement-target="employee-unassign"
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'move'
              previewRelationPlacementTarget({ kind: 'employee-unassign' }, event)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              commitRelationPlacementTarget({ kind: 'employee-unassign' }, event.dataTransfer)
            }}
          >解除目前任職</button>}
        <ReactFlow<OrgFlowNode, OrgFlowEdge>
          className={draggingId ? 'is-dragging' : undefined}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          deleteKeyCode={null}
          onNodeClick={(_event, node) => {
            selectNode(node.id)
            workspaceController.setSharedSelection({ kind: 'position', id: node.id }, 'organization')
          }}
          onNodeDoubleClick={(_event, node) => {
            setPositionContextMenu(null)
            selectNode(node.id)
            workspaceController.setSharedSelection({ kind: 'position', id: node.id }, 'organization')
            if (organizationEditingEnabled) queueTitleEdit()
          }}
          onNodeContextMenu={dutyConfigurationActive ? undefined : openPositionContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeDragThreshold={POSITION_DRAG_THRESHOLD}
          nodeClickDistance={POSITION_DRAG_THRESHOLD}
          onPaneClick={() => {
            setPositionContextMenu(null)
            setSelectedId(null)
            setDirectorySelection(null)
            setInspectorOpen(false)
            workspaceController.setSharedSelection(null, 'organization')
          }}
          nodesConnectable={false}
          nodesDraggable={organizationEditingEnabled}
          elementsSelectable
          selectionOnDrag
          panOnScroll
          minZoom={0.2}
          maxZoom={1.8}
          fitView
          fitViewOptions={{ padding: 0.04, maxZoom: 1.05 }}
          proOptions={{ hideAttribution: true }}
          aria-label="組織架構圖編輯畫布"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cfd5dd" />
          <ViewportPortal>
            {(organizationLayout.mode === 'levels' || Boolean(levelOrderPreview))
              && organizationLayout.showLevelGuides
              && previewLayout.levelBands
              && <OrganizationLevelGuideLayer bands={previewLayout.levelBands} width={previewLayout.width} />}
            {positionYSnapGuide && <PositionYSnapGuide {...positionYSnapGuide} />}
            <DepartmentGroupLayer groups={departmentGroups} onSelectDepartment={selectDepartment} />
            <RoleRiskRelationLayer relations={visibleRiskRelations} positions={previewLayout.positions} nodeHeights={previewNodeHeights} />
          </ViewportPortal>
          <Controls position="bottom-left" showInteractive={false} />
          {nodes.length > 12 && (
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              maskColor="rgba(246, 247, 249, 0.68)"
              nodeColor={(node) => node.selected ? '#3f6df6' : memberById.get(node.id)?.parentId === null ? '#24324a' : '#b9c2cf'}
            />
          )}
        </ReactFlow>

        {assignmentNotice && <div className="assignment-notice" role="status">{assignmentNotice}</div>}
        {members.length === 0 && (
          <div className="canvas-empty">
            <div><UserRoundPlus size={24} /></div>
            <strong>建立第一個職位</strong>
            <span>從根職位開始，接著用 Tab 快速新增子職位。</span>
            <button type="button" onClick={addRoot}>新增根職位</button>
          </div>
        )}
      </div>

      {inspectorOpen && directorySelection?.kind === 'positions' && organizationInspector}
      {positionContextMenu && contextPosition && <PositionContextMenu
        x={positionContextMenu.x}
        y={positionContextMenu.y}
        title={contextPosition.title}
        onAddChild={() => {
          const sourceId = positionContextMenu.positionId
          setPositionContextMenu(null)
          addChild(sourceId)
        }}
        onAddSibling={() => {
          const sourceId = positionContextMenu.positionId
          setPositionContextMenu(null)
          addSibling(sourceId)
        }}
        onDuplicate={duplicateSelected}
        onEdit={() => {
          setPositionContextMenu(null)
          queueTitleEdit()
        }}
        onDelete={() => {
          setPositionContextMenu(null)
          setDeleteOpen(true)
        }}
        onClose={closePositionContextMenu}
      />}
    </OrganizationPanel>
  )
  const registerRiskCloseGuard = useCallback((guard: Parameters<typeof workspaceController.registerWorkspacePanelCloseGuard>[1]) => {
    workspaceController.registerWorkspacePanelCloseGuard('role-risks', guard)
  }, [workspaceController.registerWorkspacePanelCloseGuard])
  const registerManagementMethodCloseGuard = useCallback((guard: Parameters<typeof workspaceController.registerWorkspacePanelCloseGuard>[1]) => {
    workspaceController.registerWorkspacePanelCloseGuard('management-methods', guard)
  }, [workspaceController.registerWorkspacePanelCloseGuard])

  const renderMasterDataPanel = (moduleId: MasterDataModuleId, visibility: 'active' | 'hidden') => (
    <MasterDataModuleAdapter
      moduleId={moduleId}
      visibility={visibility}
      list={renderDirectorySurface(moduleId)}
      detail={renderMasterDataDetail(moduleId) || undefined}
    />
  )

  const panelRenderers: Partial<Record<WorkspaceModuleId, WorkspacePanelRenderer>> = {
    organization: () => organizationSurface,
    employees: (visibility) => renderMasterDataPanel('employees', visibility),
    positions: (visibility) => renderMasterDataPanel('positions', visibility),
    departments: (visibility) => renderMasterDataPanel('departments', visibility),
    levels: (visibility) => renderMasterDataPanel('levels', visibility),
    duties: (visibility) => {
      const context = workspaceController.state.session.panels.duties?.context
      if (!context || context.view === 'configuration') return <DutyModuleAdapter mode="configuration" visibility={visibility} detail={dutyConfigurationDetail}>{renderDirectorySurface('duties')}</DutyModuleAdapter>
      return (
        <DutyModuleAdapter mode={context.view} visibility={visibility}>
          <DutyCenter
            state={currentState}
            view={context.view}
            query={context.query}
            anomalyTypes={context.statusFilters}
            onNavigateView={(view) => workspaceController.updatePanelContext('duties', { ...context, view })}
            onQueryChange={(query) => workspaceController.updatePanelContext('duties', { ...context, query })}
            onAnomalyTypesChange={(statusFilters) => workspaceController.updatePanelContext('duties', { ...context, statusFilters })}
            onClearFilters={() => workspaceController.updatePanelContext('duties', { ...context, query: '', statusFilters: [] })}
            onOpenDutyConfiguration={(dutyId) => openDutyConfiguration(null, dutyId)}
            displayMode="panel"
          />
        </DutyModuleAdapter>
      )
    },
    processes: (visibility) => {
      const context = workspaceController.state.session.panels.processes?.context
      if (!context) return null
      const location: ProcessPlanningLocation = { active: true, ...context }
      return (
        <ProcessModuleAdapter visibility={visibility}>
          <ProcessPlanningWorkbench
          state={currentState}
          location={location}
          editingEnabled={editingEnabled}
          serverReady={serverReady}
          recoveryOpen={workspaceHydration.kind !== 'ready'}
          mobileReadOnly={mobileReadOnly}
          onCommand={runOrganizationCommand}
          onNavigate={navigateProcessPlanning}
          onRelationBegin={beginRelationPlacement}
          onRelationPreview={previewRelationPlacementTarget}
          onRelationCommit={commitRelationPlacementTarget}
          onRelationCancel={cancelRelationPlacement}
          />
        </ProcessModuleAdapter>
      )
    },
    'management-methods': (visibility) => {
      const context = workspaceController.state.session.panels['management-methods']?.context
      if (!context || !context.methodId || context.view === 'list') {
        return <ManagementMethodModuleAdapter mode="list" visibility={visibility}><ManagementMethodListPage
            visibility={visibility}
            workspaceMutationAllowed={workspaceMutationAllowed}
            initialQuery={context?.query ?? workspaceModuleQueries.managementMethods}
            onQueryChange={(query) => {
              setWorkspaceModuleQueries((current) => ({ ...current, managementMethods: query }))
              workspaceController.updatePanelContext('management-methods', { methodId: null, view: 'list', query, chapter: null })
            }}
            onOpen={(methodId, view) => workspaceController.updatePanelContext('management-methods', { methodId, view: view ?? 'draft', query: context?.query ?? '', chapter: null })}
          /></ManagementMethodModuleAdapter>
      }
      return <ManagementMethodModuleAdapter mode={context.view} visibility={visibility}><ManagementMethodDocumentPage
          methodId={context.methodId}
          initialView={context.view}
          initialChapter={context.chapter}
          state={currentState}
          onClose={() => workspaceController.updatePanelContext('management-methods', { ...context, methodId: null, view: 'list', chapter: null })}
          visibility={visibility}
          workspaceMutationAllowed={workspaceMutationAllowed}
          requestCloseGuardRegistration={registerManagementMethodCloseGuard}
          onViewChange={(view) => workspaceController.updatePanelContext('management-methods', { ...context, view })}
          onChapterChange={(chapter) => workspaceController.updatePanelContext('management-methods', { ...context, chapter })}
        /></ManagementMethodModuleAdapter>
    },
    'role-risks': (visibility) => <RoleRiskModuleAdapter visibility={visibility}><RoleCombinationRiskPanel
        roles={roles}
        rules={roleCombinationRiskRules}
        onUpsert={upsertRoleRiskRule}
        onSetEnabled={setRoleRiskRuleEnabled}
        onDelete={deleteRoleRiskRule}
        editingEnabled={workspaceMutationAllowed}
        requestCloseGuardRegistration={registerRiskCloseGuard}
      /></RoleRiskModuleAdapter>,
    governance: (visibility) => <GovernanceModuleAdapter visibility={visibility}><GovernanceCenter
        employees={employees}
        departments={departments}
        roles={roles}
        currentOrganizationVersionId={workspaceIndex?.currentVersionId ?? null}
        visibility={visibility}
        workspaceMutationAllowed={workspaceMutationAllowed}
        initialSection={workspaceController.state.session.panels.governance?.context.section ?? 'identity'}
        onSectionChange={(section) => workspaceController.updatePanelContext('governance', { section })}
      /></GovernanceModuleAdapter>,
  }

  const drawerRenderers: Partial<Record<DrawerWorkspaceModuleId, WorkspaceDrawerRenderer>> = {
    employees: () => renderDirectorySurface('employees'),
    positions: () => renderDirectorySurface('positions'),
    departments: () => renderDirectorySurface('departments'),
    levels: () => renderDirectorySurface('levels'),
    duties: () => renderDirectorySurface('duties'),
    processes: () => <div className="workspace-quick-list" role="list">{[...processes].sort((a, b) => a.order - b.order).map((process) => <button type="button" role="listitem" key={process.id} onClick={() => workspaceController.promote({ moduleId: 'processes', source: 'drawer', context: { processId: process.id, processNodeId: null, dutyId: null, view: 'mindmap' } })}>{process.title}</button>)}</div>,
    'management-methods': () => <ManagementMethodListPage
      visibility="active"
      workspaceMutationAllowed={workspaceMutationAllowed}
      initialQuery={workspaceController.state.session.panels['management-methods']?.context.query ?? workspaceModuleQueries.managementMethods}
      onQueryChange={(query) => {
        setWorkspaceModuleQueries((current) => ({ ...current, managementMethods: query }))
        const context = workspaceController.state.session.panels['management-methods']?.context
        if (context) workspaceController.updatePanelContext('management-methods', { ...context, query })
      }}
      onOpen={(methodId, view) => workspaceController.promote({ moduleId: 'management-methods', source: 'drawer', context: { methodId, view: view ?? 'draft', query: '', chapter: null } })}
    />,
  }

  const openPanels = workspaceController.state.route.openPanels
  const workspaceLauncher = <WorkspaceLauncher
    openPanels={openPanels}
    onOpenDrawer={workspaceController.openDrawer}
    onOpenPanel={(moduleId) => workspaceController.openOrFocus(moduleId)}
    disabled={workspaceHydration.kind !== 'ready'}
  />

  const drawerPromotionIntent: PromotionIntent | undefined = currentDrawer ? (() => {
    if (currentDrawer === 'employees') return { moduleId: 'employees', source: 'drawer' as const, context: { employeeId: directorySelection?.kind === 'employees' ? directorySelection.id : null, query: workspaceModuleQueries.employees } }
    if (currentDrawer === 'positions') return { moduleId: 'positions', source: 'drawer' as const, context: { positionId: directorySelection?.kind === 'positions' ? directorySelection.id : selectedId, query: workspaceModuleQueries.positions } }
    if (currentDrawer === 'departments') return { moduleId: 'departments', source: 'drawer' as const, context: { departmentId: directorySelection?.kind === 'departments' ? directorySelection.id : null } }
    if (currentDrawer === 'levels') return { moduleId: 'levels', source: 'drawer' as const, context: { levelId: directorySelection?.kind === 'levels' ? directorySelection.id : null } }
    if (currentDrawer === 'duties') return { moduleId: 'duties', source: 'drawer' as const, context: { dutyId: effectiveDutyConfigurationLocation.dutyId, lane: effectiveDutyConfigurationLocation.lane, view: 'configuration' as const, query: workspaceModuleQueries.duties, statusFilters: [], focusPositionId: effectiveDutyConfigurationLocation.focusPositionId, sourceRelationId: effectiveDutyConfigurationLocation.sourceRelationId, attentionOnly: effectiveDutyConfigurationLocation.attentionOnly } }
    if (currentDrawer === 'processes') return { moduleId: 'processes', source: 'drawer' as const, context: workspaceController.state.session.panels.processes?.context ?? { processId: processes[0]?.id ?? null, processNodeId: null, dutyId: null, view: 'mindmap' as const } }
    return { moduleId: 'management-methods', source: 'drawer' as const, context: workspaceController.state.session.panels['management-methods']?.context ?? { methodId: null, view: 'list' as const, query: workspaceModuleQueries.managementMethods, chapter: null } }
  })() as PromotionIntent : undefined
  const renderGlobalOverlay = (node: ReactNode) => <WorkspacePortal scope="global">{node}</WorkspacePortal>

  return (
    <WorkspaceOverlayProvider>
      <div className={`app-shell${dutyConfigurationActive ? ' is-duty-configuration' : ''}${dutyConfigurationActive && !dutyConfigurationWritable ? ' is-duty-configuration-readonly' : ''}`}>
      <WorkspaceShell
        controller={workspaceController}
        hydration={workspaceHydration}
        mobileSingleSurface={mobileReadOnly || workspaceEnvironment.viewportWidth < 1024}
        drawerPromotionIntent={drawerPromotionIntent}
        onRetry={() => {
          if (workspaceHydration.kind === 'conflict' && isDirty && !window.confirm('重新載入會捨棄目前尚未儲存的內容，確定繼續？')) return
          setWorkspaceHydrationRetry((value) => value + 1)
        }}
        onDownloadRecoveryCopy={saveDocumentCopy}
        onSwitchToCurrent={() => {
          const currentVersionId = workspaceIndex?.currentVersionId
          if (currentVersionId) void switchWorkspaceVersion(currentVersionId)
        }}
        header={<Toolbar
          workspaceLauncher={workspaceLauncher}
          members={positionViews}
          employees={employees}
          departments={departments}
          organizationLevels={organizationLevels}
          searchFocusToken={searchFocusToken}
          onSearchSelect={(positionId) => {
            workspaceController.openOrFocus('organization')
            workspaceController.setSharedSelection({ kind: 'position', id: positionId }, 'global-search')
            showSelected(positionId)
          }}
          roleRiskSettingsOpen={Boolean(workspaceController.state.session.panels['role-risks'])}
          onOpenRoleRiskSettings={() => workspaceController.openOrFocus('role-risks')}
          governanceOpen={Boolean(workspaceController.state.session.panels.governance)}
          onOpenGovernance={() => workspaceController.openOrFocus('governance')}
          onOpenManagementMethods={() => workspaceController.openDrawer('management-methods')}
          onOpenProcessPlanning={() => workspaceController.openDrawer('processes')}
          governanceButtonRef={governanceButtonRef}
          isDirty={isDirty}
          savedAt={savedAt}
          persistenceKind={persistenceKind}
          autoSavePending={autoSavePending}
          autoSaveError={autoSaveError}
          onSave={saveDocument}
          onSaveCopy={saveDocumentCopy}
          onBackup={backupDocument}
          versions={workspaceIndex?.versions ?? []}
          activeVersionId={activeVersionId}
          workspaceMode={workspaceMode}
          onSelectVersion={(versionId) => { void switchWorkspaceVersion(versionId) }}
          onOpenWorkspace={() => setWorkspaceDrawerOpen(true)}
          onToggleCurrentMaintenance={() => { void toggleCurrentMaintenance() }}
        />}
        renderPanel={(moduleId, visibility) => renderWorkspacePanel(moduleId, visibility, panelRenderers)}
        renderDrawer={(moduleId) => renderWorkspaceDrawer(moduleId, drawerRenderers)}
      />
      {workspaceLayoutNotice && renderGlobalOverlay(<div className="workspace-layout-notice" role="status">{workspaceLayoutNotice}</div>)}

      {dutyEditDialog === 'create' && renderGlobalOverlay(<DutyEditDialog onCancel={() => setDutyEditDialog(null)} onSave={saveNewDuty} />)}
      {dutyDeleteDialog && selectedDutyForConfiguration && renderGlobalOverlay(<DutyDeleteDialog dutyTitle={selectedDutyForConfiguration.title} relationCount={currentState.dutyPositionRelations.filter((relation) => relation.dutyId === selectedDutyForConfiguration.id).length} onCancel={() => setDutyDeleteDialog(false)} onConfirm={() => {
        const result = runDutyConfigurationCommand({ type: 'DELETE_DUTY', dutyId: selectedDutyForConfiguration.id })
        if (result?.status === 'applied') {
          setDutyDeleteDialog(false)
          setDutyDetailOpen(false)
          const next = { ...effectiveDutyConfigurationLocation, active: dutyConfigurationActive, dutyId: null, lane: null, focusPositionId: null, sourceRelationId: null }
          setDutyConfigurationLocation(next)
          const current = workspaceController.state.session.panels.duties?.context
          if (current) workspaceController.updatePanelContext('duties', { ...current, dutyId: null, lane: null, focusPositionId: null, sourceRelationId: null })
        }
      }} />)}

      {directoryDialog?.type === 'add-employee' && (
        renderGlobalOverlay(<AddEmployeeDialog
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={createEmployee}
        />)
      )}

      {directoryDialog?.type === 'add-department' && (
        renderGlobalOverlay(<AddDepartmentDialog
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={createDepartment}
        />)
      )}

      {directoryDialog?.type === 'edit-employee' && dialogEmployee && (
        renderGlobalOverlay(<EditEmployeeDialog
          employee={dialogEmployee}
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={(name, departmentIds) => updateEmployee(dialogEmployee.id, name, departmentIds)}
        />)
      )}

      {directoryDialog?.type === 'edit-department' && dialogDepartment && (
        renderGlobalOverlay(<EditDepartmentDialog
          department={dialogDepartment}
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={(name, parentId) => updateDepartment(dialogDepartment.id, name, parentId)}
        />)
      )}

      {directoryDialog?.type === 'delete-employee' && dialogEmployee && (
        renderGlobalOverlay(<DeleteEmployeeDialog
          employee={dialogEmployee}
          assignmentCount={positionViews.filter((member) => (
            member.activeAssignments.some((assignment) => assignment.employeeId === dialogEmployee.id)
          )).length}
          onClose={() => setDirectoryDialog(null)}
          onConfirm={() => deleteEmployee(dialogEmployee.id)}
        />)
      )}

      {directoryDialog?.type === 'delete-department' && dialogDepartment && (
        renderGlobalOverlay(<DeleteDepartmentDialog
          department={dialogDepartment}
          departments={departments}
          employeeCount={employees.filter((employee) => employee.departmentIds.includes(dialogDepartment.id)).length}
          positionCount={positions.filter((position) => position.status === 'active' && position.departmentId === dialogDepartment.id).length}
          issue={inspectorIssue?.target === 'delete' ? inspectorIssue : null}
          onClose={() => setDirectoryDialog(null)}
          onConfirm={(replacementDepartmentId) => deleteDepartment(dialogDepartment.id, replacementDepartmentId)}
        />)
      )}

      {deleteOpen && selected && (
        renderGlobalOverlay(<div className="dialog-backdrop" role="presentation" onMouseDown={() => setDeleteOpen(false)}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog__icon dialog__icon--danger"><AlertTriangle size={22} /></div>
            <div className="dialog__content">
              <h2 id="delete-title">刪除「{selected.title}」？</h2>
              {inspectorIssue?.target === 'delete' && <p className="dialog-field__help is-error" role="alert">{inspectorIssue.message}</p>}
              {selectedChildCount > 0 ? (
                <p>此職位有 {selectedChildCount} 個直接子職位。請選擇要保留子職位，還是刪除整個分支。</p>
              ) : (
                <p>此操作會移除職位；員工仍保留在清單，可使用 Ctrl+Z 復原。</p>
              )}
            </div>
            <div className="dialog__actions">
              <button type="button" className="button-secondary" onClick={() => setDeleteOpen(false)}>取消</button>
              {selectedChildCount > 0 && (
                <button type="button" className="button-secondary" onClick={() => confirmDelete('promote')}>只刪職位，子職位上移</button>
              )}
              <button type="button" className="button-danger" onClick={() => confirmDelete('branch')}>
                <Trash2 size={16} />
                {selectedChildCount > 0 ? '刪除整個分支' : '刪除職位'}
              </button>
            </div>
          </section>
        </div>)
      )}

      {workspaceDrawerOpen && workspaceIndex && (
        renderGlobalOverlay(<VersionWorkspacePanel
          versions={workspaceIndex.versions}
          activeVersionId={activeVersionId}
          onSelect={(versionId) => { void switchWorkspaceVersion(versionId) }}
          onCreate={(sourceVersionId, name) => { void createDraft(sourceVersionId, name) }}
          onRename={(versionId, name) => { void updateWorkspaceEntry(versionId, 'rename', name) }}
          onArchive={(versionId) => { void updateWorkspaceEntry(versionId, 'archive') }}
          onRestore={(versionId) => { void updateWorkspaceEntry(versionId, 'restore') }}
          onEnterCurrentMaintenance={enterCurrentMaintenance}
          onClose={() => setWorkspaceDrawerOpen(false)}
          busy={workspaceBusy}
        />)
      )}

      </div>
    </WorkspaceOverlayProvider>
  )
}
