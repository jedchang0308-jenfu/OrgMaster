import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
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
import { ManagementMethodPrototype } from './components/ManagementMethodPrototype'
import { GovernanceCenter } from './components/GovernanceCenter'
import { VersionWorkspacePanel } from './components/VersionWorkspacePanel'
import { ManagementMethodListPage } from './components/managementMethods/ManagementMethodListPage'
import { ManagementMethodDocumentPage } from './components/managementMethods/ManagementMethodDocumentPage'
import { buildManagementMethodsUrl, readManagementMethodLocation, type ManagementMethodLocation } from './managementMethods/route'
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
import { buildDutyPlanningUrl, readDutyPlanningLocation, type DutyPlanningLocation, type DutyPlanningStatusFilter, type DutyPlanningView } from './dutyPlanningRoute'
import { buildDutyConfigurationUrl, normalizeDutyConfigurationLocation, readDutyConfigurationLocation, type DutyConfigurationExactLane, type DutyConfigurationLocation } from './dutyConfigurationRoute'
import { canMutateDutyConfiguration } from './dutyConfigurationCapability'
import { buildProcessPlanningUrl, canonicalProcessPlanningUrl, normalizeProcessPlanningLocation, readProcessPlanningLocation, type ProcessPlanningLocation } from './processPlanningRoute'
import { ProcessPlanningWorkbench } from './components/ProcessPlanningWorkbench'
import { dutyConfigurationIssueMessage, dutyConfigurationLaneLabels, resolveDutyConfigurationDropCommand, type DutyConfigurationIssueCode } from './dutyConfiguration'
import {
  DUTY_CONFIGURATION_DRAG_MIME,
  beginDutyConfigurationDrop,
  createDutyConfigurationDragState,
  getDutyConfigurationAutoPanDelta,
  parseDutyConfigurationDragPayload,
  serializeDutyConfigurationDragPayload,
  startDutyConfigurationDrag as createDutyDragState,
  updateDutyConfigurationDragCandidate,
  type DutyConfigurationDragPayload,
  type DutyConfigurationDragState,
  type DutyConfigurationDropCandidate,
} from './dutyConfigurationDrag'
import {
  initialManagementMethodPrototype,
  findPrototypeStep,
  getPrototypeStepNumber,
  responsibilityTypeLabel,
  togglePrototypeResponsibility,
  type PrototypeResponsibilityType,
} from './managementMethodPrototype'
import {
  buildManagementMethodPrototypeUrl,
  buildPrototypeResponsibilityUrl,
  readManagementMethodPrototypeLocation,
  type ManagementMethodPrototypeLocation,
  type PrototypeResponsibilityContext,
} from './managementMethodPrototypeRoute'
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
import type { ChildrenAxis, EmployeeDragPayload, HierarchyNode, OrganizationLevel, OrgDirectoryState, OrgMember, Point, PositionView, Role } from './types'
import type { OrgWorkspaceIndex, OrgWorkspaceVersionSummary, WorkspaceMode } from './versionWorkspace'

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
const EMPLOYEE_DRAG_TYPE = 'application/x-orgmaster-employee'
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
  const [organizationIssue, setOrganizationIssue] = useState<string | null>(null)
  const [organizationIssueTarget, setOrganizationIssueTarget] = useState<OrganizationUiIssue['target'] | null>(null)
  const [levelOrderPreview, setLevelOrderPreview] = useState<OrganizationLevel[] | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(() => orgStateSignature(initialState))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [recoveryOpen] = useState(false)
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
  const [dutyPlanningLocation, setDutyPlanningLocation] = useState<DutyPlanningLocation>(() => readDutyPlanningLocation(window.location))
  const [dutyConfigurationLocation, setDutyConfigurationLocation] = useState<DutyConfigurationLocation>(() => readDutyConfigurationLocation(window.location))
  const [processPlanningLocation, setProcessPlanningLocation] = useState<ProcessPlanningLocation>(() => readProcessPlanningLocation(window.location))
  const [dutyConfigurationExpandedDutyId, setDutyConfigurationExpandedDutyId] = useState<string | null>(() => readDutyConfigurationLocation(window.location).dutyId)
  const [dutyConfigurationError, setDutyConfigurationError] = useState<string | null>(null)
  const [dutyDetailOpen, setDutyDetailOpen] = useState(false)
  const [dutyDragState, setDutyDragState] = useState<DutyConfigurationDragState>(() => createDutyConfigurationDragState())
  const dutyDragPayloadRef = useRef<DutyConfigurationDragPayload | null>(null)
  const dutyDragSourceFocusRef = useRef<HTMLElement | null>(null)
  const dutyDragPointerRef = useRef<{ x: number; y: number } | null>(null)
  const [dutyEditDialog, setDutyEditDialog] = useState<'create' | null>(null)
  const [dutyDeleteDialog, setDutyDeleteDialog] = useState(false)
  const [managementMethodState, setManagementMethodState] = useState(initialManagementMethodPrototype)
  const [managementMethodLocation, setManagementMethodLocation] = useState<ManagementMethodPrototypeLocation>(() => readManagementMethodPrototypeLocation(window.location))
  const [managementMethodRoute, setManagementMethodRoute] = useState<ManagementMethodLocation>(() => readManagementMethodLocation(window.location))
  const [mobileReadOnly, setMobileReadOnly] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const lastInteractedPanelRef = useRef<WorkspacePanelId | null>(null)

  useEffect(() => {
    const syncDutyPlanningLocation = () => {
      setDutyPlanningLocation(readDutyPlanningLocation(window.location))
      const nextDutyLocation = readDutyConfigurationLocation(window.location)
      setDutyConfigurationLocation(nextDutyLocation)
      setDutyConfigurationExpandedDutyId(nextDutyLocation.dutyId)
      setProcessPlanningLocation(readProcessPlanningLocation(window.location))
    }
    window.addEventListener('popstate', syncDutyPlanningLocation)
    return () => window.removeEventListener('popstate', syncDutyPlanningLocation)
  }, [])

  useEffect(() => {
    // Do not normalize a deep link against the screenshot seed while the
    // workspace version is still hydrating. Otherwise a valid Process/node
    // query is stripped before the selected draft is loaded.
    if (!serverReady || serverHydrationPendingRef.current || !processPlanningLocation.active) return
    const normalized = normalizeProcessPlanningLocation(processPlanningLocation, currentState)
    const canonical = canonicalProcessPlanningUrl(processPlanningLocation, currentState)
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (canonical && canonical !== currentUrl) {
      window.history.replaceState({}, '', canonical)
      setProcessPlanningLocation(normalized)
    }
  }, [currentState, processPlanningLocation, serverReady])

  useEffect(() => {
    const syncManagementMethodLocation = () => {
      setManagementMethodLocation(readManagementMethodPrototypeLocation(window.location))
      setManagementMethodRoute(readManagementMethodLocation(window.location))
    }
    window.addEventListener('popstate', syncManagementMethodLocation)
    return () => window.removeEventListener('popstate', syncManagementMethodLocation)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobileReadOnly(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const context = managementMethodLocation.responsibilityContext
    if (!mobileReadOnly || !context) return
    window.history.replaceState({}, '', buildManagementMethodPrototypeUrl(context.stepId))
    setManagementMethodLocation(readManagementMethodPrototypeLocation(window.location))
    setManagementMethodRoute(readManagementMethodLocation(window.location))
  }, [managementMethodLocation.responsibilityContext, mobileReadOnly])

  useEffect(() => {
    if (!dutyConfigurationLocation.active) return
    const normalized = normalizeDutyConfigurationLocation(dutyConfigurationLocation, currentState)
    if (!normalized.replaceUrl) return
    window.history.replaceState({}, '', normalized.replaceUrl)
    setDutyConfigurationLocation(normalized.location)
  }, [currentState, dutyConfigurationLocation])

  useEffect(() => {
    if (!dutyPlanningLocation.isDutyPlanningPage) return
    const canonical = buildDutyPlanningUrl({ view: dutyPlanningLocation.view ?? 'audit', query: dutyPlanningLocation.query, anomalyTypes: dutyPlanningLocation.anomalyTypes })
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl === canonical) return
    window.history.replaceState({}, '', canonical)
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
  }, [dutyPlanningLocation])

  useEffect(() => {
    document.title = managementMethodRoute.isListPage || managementMethodRoute.isDocumentPage
      ? '管理辦法｜OrgMaster'
      : managementMethodLocation.isEditorPage
      ? `${managementMethodState.method.code} ${managementMethodState.method.title}｜OrgMaster`
      : dutyConfigurationLocation.active
        ? '組織架構／工作事項配置｜OrgMaster'
      : dutyPlanningLocation.isDutyPlanningPage
        ? '工作職掌規劃台｜OrgMaster'
        : managementMethodLocation.responsibilityContext
          ? '工作事項責任配置｜OrgMaster'
          : 'OrgMaster 組織架構圖'
  }, [dutyConfigurationLocation.active, dutyPlanningLocation.isDutyPlanningPage, managementMethodLocation.isEditorPage, managementMethodLocation.responsibilityContext, managementMethodRoute.isDocumentPage, managementMethodRoute.isListPage, managementMethodState.method.code, managementMethodState.method.title])

  const openDutyPlanningPage = useCallback((view: DutyPlanningView = 'audit', query = '', anomalyTypes: DutyPlanningStatusFilter[] = []) => {
    const nextUrl = buildDutyPlanningUrl({ view, query, anomalyTypes })
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl !== nextUrl) window.history.pushState({}, '', nextUrl)
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
    // Opening the workbench from the duty directory must leave configuration
    // mode immediately; otherwise the stale configuration flag prevents the
    // planning page branch from rendering after the URL changes.
    const nextDutyConfigurationLocation = readDutyConfigurationLocation(window.location)
    setDutyConfigurationLocation(nextDutyConfigurationLocation)
    setDutyConfigurationExpandedDutyId(nextDutyConfigurationLocation.dutyId)
    setDutyDetailOpen(false)
  }, [])

  const openProcessPlanningPage = useCallback((processId?: string | null, view: 'mindmap' | 'flow' = 'mindmap') => {
    const nextUrl = buildProcessPlanningUrl({ view, processId: processId ?? null, processNodeId: null, dutyId: null })
    window.history.pushState({}, '', nextUrl)
    setProcessPlanningLocation(readProcessPlanningLocation(window.location))
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
    setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
  }, [])

  const navigateProcessPlanning = useCallback((url: string) => {
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState({}, '', url)
    setProcessPlanningLocation(readProcessPlanningLocation(window.location))
  }, [])

  const closeProcessPlanningPage = useCallback(() => {
    window.history.pushState({}, '', '/')
    setProcessPlanningLocation(readProcessPlanningLocation(window.location))
  }, [])

  const navigateDutyPlanningView = useCallback((view: DutyPlanningView) => {
    const nextUrl = buildDutyPlanningUrl({ view, query: dutyPlanningLocation.query, anomalyTypes: dutyPlanningLocation.anomalyTypes })
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.pushState({}, '', nextUrl)
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
  }, [dutyPlanningLocation.anomalyTypes, dutyPlanningLocation.query])

  const updateDutyPlanningQuery = useCallback((query: string) => {
    const nextUrl = buildDutyPlanningUrl({ view: dutyPlanningLocation.view ?? 'audit', query, anomalyTypes: dutyPlanningLocation.anomalyTypes })
    window.history.replaceState({}, '', nextUrl)
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
  }, [dutyPlanningLocation.anomalyTypes, dutyPlanningLocation.view])

  const updateDutyPlanningStatuses = useCallback((anomalyTypes: DutyPlanningStatusFilter[]) => {
    const nextUrl = buildDutyPlanningUrl({ view: dutyPlanningLocation.view ?? 'audit', query: dutyPlanningLocation.query, anomalyTypes })
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.pushState({}, '', nextUrl)
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
  }, [dutyPlanningLocation.query, dutyPlanningLocation.view])

  const clearDutyPlanningFilters = useCallback(() => {
    const nextUrl = buildDutyPlanningUrl({ view: dutyPlanningLocation.view ?? 'audit', query: '', anomalyTypes: [] })
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState({}, '', nextUrl)
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
  }, [dutyPlanningLocation.view])

  const closeDutyPlanningPage = useCallback(() => {
    window.history.replaceState({}, '', '/')
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
  }, [])

  const openDutyConfiguration = useCallback((focusPositionId?: string | null, dutyId?: string | null) => {
    const nextUrl = buildDutyConfigurationUrl({ dutyId, focusPositionId, attentionOnly: false })
    window.history.pushState({}, '', nextUrl)
    setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
    setDutyConfigurationExpandedDutyId(null)
    setDutyConfigurationError(null)
    setDutyDetailOpen(false)
    setActiveDirectory('duties')
    setDirectorySelection(null)
    setInspectorOpen(false)
    setDutyDragState(createDutyConfigurationDragState())
    dutyDragSourceFocusRef.current = null
    dutyDragPayloadRef.current = null
  }, [])

  const openManagementMethodPage = useCallback((focusStepId?: string | null) => {
    const nextUrl = focusStepId ? buildManagementMethodPrototypeUrl(focusStepId) : buildManagementMethodsUrl()
    window.history.pushState({}, '', nextUrl)
    setManagementMethodLocation(readManagementMethodPrototypeLocation(window.location))
    setManagementMethodRoute(readManagementMethodLocation(window.location))
  }, [])

  const closeManagementMethodPage = useCallback(() => {
    window.history.pushState({}, '', '/')
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
    setManagementMethodLocation(readManagementMethodPrototypeLocation(window.location))
    setManagementMethodRoute(readManagementMethodLocation(window.location))
  }, [])

  const openPrototypeResponsibility = useCallback((context: PrototypeResponsibilityContext) => {
    window.history.pushState({}, '', buildPrototypeResponsibilityUrl(context))
    setDutyPlanningLocation(readDutyPlanningLocation(window.location))
    setManagementMethodLocation(readManagementMethodPrototypeLocation(window.location))
    setManagementMethodRoute(readManagementMethodLocation(window.location))
    setActiveDirectory(null)
    setSelectedId(null)
    setDirectorySelection(null)
    setInspectorOpen(false)
  }, [])

  const finishPrototypeResponsibility = useCallback(() => {
    const context = readManagementMethodPrototypeLocation(window.location).responsibilityContext
    openManagementMethodPage(context?.stepId ?? null)
  }, [openManagementMethodPage])

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

  const closeRoleRiskPanel = useCallback(() => {
    setRoleRiskSettingsOpen(false)
  }, [])

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
  const changeActiveDirectory = useCallback((next: DirectoryKind | null) => {
    const previous = activeDirectory
    if (next === 'duties' && !dutyConfigurationLocation.active) {
      window.history.pushState({}, '', buildDutyConfigurationUrl({ attentionOnly: false }))
      setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
      setDutyConfigurationError(null)
    } else if (dutyConfigurationLocation.active && next !== 'duties') {
      window.history.replaceState({}, '', '/')
      setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
      setDutyConfigurationError(null)
      dutyDragSourceFocusRef.current = null
      dutyDragPayloadRef.current = null
      setDutyDragState(createDutyConfigurationDragState())
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
  }, [activeDirectory, dutyConfigurationLocation.active, focusAfterClose])
  const recordPanelInteraction = useCallback((event: { target: EventTarget | null }) => {
    const panel = workspacePanelFromTarget(event.target)
    if (panel) lastInteractedPanelRef.current = panel
  }, [])
  const setRiskInteraction = useCallback((positionId: string | null) => {
    setRiskInteractionPositionId(positionId)
  }, [])
  const [nodes, setNodes] = useState<OrgFlowNode[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [roleRiskSettingsOpen, setRoleRiskSettingsOpen] = useState(false)
  const [governanceOpen, setGovernanceOpen] = useState(false)
  const governanceButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousGovernanceOpenRef = useRef(false)
  useEffect(() => {
    if (previousGovernanceOpenRef.current && !governanceOpen) governanceButtonRef.current?.focus()
    previousGovernanceOpenRef.current = governanceOpen
  }, [governanceOpen])
  const [focusTitleToken, setFocusTitleToken] = useState(0)
  const [searchFocusToken, setSearchFocusToken] = useState(0)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [dragVisualOffset, setDragVisualOffset] = useState<Point | null>(null)
  const [dragSnapTargetId, setDragSnapTargetId] = useState<string | null>(null)
  const [employeeDrag, setEmployeeDrag] = useState<EmployeeDragPayload | null>(null)
  const [assignmentNotice, setAssignmentNotice] = useState('')
  const activeVersionIdRef = useRef(activeVersionId)
  const workspaceModeRef = useRef(workspaceMode)
  const workspaceIndexRef = useRef(workspaceIndex)
  const editingEnabledRef = useRef(false)
  activeVersionIdRef.current = activeVersionId
  workspaceModeRef.current = workspaceMode
  workspaceIndexRef.current = workspaceIndex
  editingEnabledRef.current = workspaceMode === 'draft-edit' || workspaceMode === 'current-maintenance'
  const editingEnabled = editingEnabledRef.current
  const prototypeResponsibilityContext = mobileReadOnly ? null : managementMethodLocation.responsibilityContext
  const dutyConfigurationWritable = dutyConfigurationLocation.active && canMutateDutyConfiguration({
    editingEnabled,
    serverReady,
    recoveryOpen,
    mobileReadOnly,
    viewportWidth: window.innerWidth,
    hoverCapable: window.matchMedia('(hover: hover)').matches,
    finePointer: window.matchMedia('(pointer: fine)').matches,
  })
  const organizationEditingEnabled = editingEnabled && !prototypeResponsibilityContext && !dutyConfigurationLocation.active
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
    const nextUrl = buildDutyConfigurationUrl({ dutyId: nextDutyId, attentionOnly: dutyConfigurationLocation.attentionOnly })
    window.history.replaceState({}, '', nextUrl)
    setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
    setDutyConfigurationExpandedDutyId(nextDutyId)
    setDutyConfigurationError(null)
    setDutyDetailOpen(false)
  }, [dutyConfigurationExpandedDutyId, dutyConfigurationLocation.attentionOnly])

  const openDutyConfigurationDetail = useCallback((dutyId: string) => {
    const nextUrl = buildDutyConfigurationUrl({ dutyId, attentionOnly: dutyConfigurationLocation.attentionOnly })
    window.history.replaceState({}, '', nextUrl)
    setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
    setDutyConfigurationExpandedDutyId((currentDutyId) => currentDutyId === dutyId ? currentDutyId : null)
    setDutyConfigurationError(null)
    setDutyDetailOpen(true)
  }, [dutyConfigurationLocation.attentionOnly])

  const selectDutyLane = useCallback((lane: DutyConfigurationExactLane) => {
    if (!dutyConfigurationLocation.dutyId) return
    const nextUrl = buildDutyConfigurationUrl({ ...dutyConfigurationLocation, dutyId: dutyConfigurationLocation.dutyId, lane, attentionOnly: dutyConfigurationLocation.attentionOnly })
    window.history.replaceState({}, '', nextUrl)
    setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
    setDutyConfigurationError(null)
  }, [dutyConfigurationLocation])

  const startDutyConfigurationDrag = useCallback((payload: DutyConfigurationDragPayload, mode: 'native' | 'keyboard') => {
    if (!dutyConfigurationWritable || !dutyConfigurationLocation.active) return
    dutyDragSourceFocusRef.current = mode === 'keyboard' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dutyDragPayloadRef.current = payload
    setDutyDragState(createDutyDragState(payload, mode))
    setDutyConfigurationError(null)
  }, [dutyConfigurationLocation.active, dutyConfigurationWritable])

  const cancelDutyConfigurationDrag = useCallback(() => {
    const focusTarget = dutyDragSourceFocusRef.current
    dutyDragSourceFocusRef.current = null
    dutyDragPayloadRef.current = null
    setDutyDragState(createDutyConfigurationDragState())
    if (focusTarget?.isConnected) {
      window.requestAnimationFrame(() => focusTarget.focus())
    }
  }, [])

  const resolveDutyDropCandidate = useCallback((payload: DutyConfigurationDragPayload, positionId: string): { kind: DutyConfigurationDropCandidate; code?: DutyConfigurationIssueCode } => {
    const resolution = resolveDutyConfigurationDropCommand(currentStateRef.current, {
      dutyId: payload.dutyId,
      positionId,
      lane: payload.lane,
      sourceRelationId: payload.sourceRelationId,
      newRelationId: payload.newRelationId,
    })
    if (resolution.status === 'command') return { kind: 'command' }
    if (resolution.status === 'noop') return { kind: 'noop', code: resolution.code }
    return { kind: 'invalid', code: resolution.code }
  }, [])

  const updateDutyDropCandidate = useCallback((positionId: string, event?: DragEvent<HTMLElement>) => {
    const payload = dutyDragPayloadRef.current ?? parseDutyConfigurationDragPayload(event?.dataTransfer.getData(DUTY_CONFIGURATION_DRAG_MIME))
    if (!payload || !dutyConfigurationWritable) return
    dutyDragPayloadRef.current = payload
    const candidate = resolveDutyDropCandidate(payload, positionId)
    setDutyDragState((current) => updateDutyConfigurationDragCandidate(current, positionId, candidate.kind))
    if (event) {
      dutyDragPointerRef.current = { x: event.clientX, y: event.clientY }
      const canvas = event.currentTarget.closest<HTMLElement>('.canvas-wrap')
      if (canvas) {
        const delta = getDutyConfigurationAutoPanDelta({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect())
        if (delta.x || delta.y) {
          const viewport = getViewport()
          void setViewport({ ...viewport, x: viewport.x + delta.x, y: viewport.y + delta.y }, { duration: 0 })
        }
      }
    }
  }, [dutyConfigurationWritable, getViewport, resolveDutyDropCandidate, setViewport])

  const commitDutyDrop = useCallback((positionId: string) => {
    const payload = dutyDragPayloadRef.current
    if (!payload || !dutyConfigurationWritable) return
    const candidate = resolveDutyDropCandidate(payload, positionId)
    if (candidate.kind !== 'command') {
      setDutyConfigurationError(candidate.code ? dutyConfigurationIssueMessage(candidate.code) : candidate.kind === 'noop' ? '此配置已存在，未重複新增' : '此位置無法配置工作執掌')
      cancelDutyConfigurationDrag()
      return
    }
    const resolution = resolveDutyConfigurationDropCommand(currentStateRef.current, {
      dutyId: payload.dutyId,
      positionId,
      lane: payload.lane,
      sourceRelationId: payload.sourceRelationId,
      newRelationId: payload.newRelationId,
    })
    if (resolution.status !== 'command') return
    setDutyDragState(beginDutyConfigurationDrop(dutyDragState, positionId))
    const result = executeOrganizationCommand(currentStateRef.current, resolution.command)
    if (result.status === 'applied') {
      commitState(result.state)
      setDutyConfigurationError(null)
      const nextUrl = buildDutyConfigurationUrl({ dutyId: payload.dutyId, lane: payload.lane, attentionOnly: dutyConfigurationLocation.attentionOnly, focusPositionId: positionId, sourceRelationId: null })
      window.history.replaceState({}, '', nextUrl)
      setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
    } else if (result.status === 'rejected') {
      setDutyConfigurationError(organizationIssueMessage(result.issue, departments))
    }
    cancelDutyConfigurationDrag()
  }, [cancelDutyConfigurationDrag, commitState, departments, dutyConfigurationLocation.attentionOnly, dutyConfigurationWritable, dutyDragState, resolveDutyDropCandidate])

  const positionViews = useMemo(
    () => buildPositionViews(members, positions, assignments, TODAY),
    [assignments, members, positions],
  )
  const prototypeResponsibilityLabelsByPositionId = useMemo(() => {
    const labels = new Map<string, string[]>()
    if (!prototypeResponsibilityContext) return new Map<string, string>()
    for (const assignment of managementMethodState.assignments) {
      if (assignment.workItemId !== prototypeResponsibilityContext.workItemId) continue
      labels.set(assignment.positionId, [...(labels.get(assignment.positionId) ?? []), responsibilityTypeLabel(assignment.relationType)])
    }
    return new Map(Array.from(labels.entries()).map(([positionId, values]) => [positionId, values.join(' · ')]))
  }, [managementMethodState.assignments, prototypeResponsibilityContext])
  const dutyDropCandidateByPositionId = useMemo(() => {
    const map = new Map<string, DutyConfigurationDropCandidate>()
    const payload = dutyDragPayloadRef.current
    const candidatePositionId = dutyDragState.phase === 'native-dragging' || dutyDragState.phase === 'keyboard-grabbed'
      ? dutyDragState.candidatePositionId
      : null
    if (!payload || !dutyConfigurationLocation.active || !candidatePositionId) return map
    map.set(candidatePositionId, resolveDutyDropCandidate(payload, candidatePositionId).kind)
    return map
  }, [dutyConfigurationLocation.active, dutyDragState, resolveDutyDropCandidate])

  const activatePosition = useCallback((positionId: string) => {
    if (!prototypeResponsibilityContext) {
      selectPosition(positionId)
      return
    }
    setManagementMethodState((current) => togglePrototypeResponsibility(current, {
      workItemId: prototypeResponsibilityContext.workItemId,
      positionId,
      relationType: prototypeResponsibilityContext.relationType,
    }))
  }, [prototypeResponsibilityContext, selectPosition])

  const changePrototypeRelationType = useCallback((relationType: PrototypeResponsibilityType) => {
    if (!prototypeResponsibilityContext) return
    const context = { ...prototypeResponsibilityContext, relationType }
    window.history.replaceState({}, '', buildPrototypeResponsibilityUrl(context))
    setManagementMethodLocation(readManagementMethodPrototypeLocation(window.location))
  }, [prototypeResponsibilityContext])
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
    void loadWorkspaceIndex().then(async (result) => {
      if (!active) return
      if (result.status !== 'loaded') {
        serverHydrationPendingRef.current = false
        setAssignmentNotice(`${result.message}；請確認目前是用 npm run dev:local 啟動`)
        setServerReady(true)
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
        setAssignmentNotice(loaded.message)
      } else {
        serverHydrationSignatureRef.current = orgStateSignature(loaded.value.document.state)
        // Restore edit capability for an active draft selected in this browser
        // session. Without this, a deep link can load the draft data while the
        // UI remains read-only, preventing process-planning changes from ever
        // reaching the autosave path after reload.
        setWorkspaceMode(loaded.value.version.kind === 'draft' && loaded.value.version.status === 'active' ? 'draft-edit' : 'current-view')
      }
      setServerReady(true)
    })
    return () => {
      active = false
    }
  }, [hydrateWorkspaceVersion])

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
      setAssignmentNotice(saved.statusCode === 409 ? '版本已被其他視窗更新；請重新載入後再儲存' : saved.message)
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
      if (saved.statusCode === 409) setAssignmentNotice('版本已被其他視窗更新；自動儲存暫停，請重新載入後再編輯')
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

  const startEmployeeDrag = useCallback((event: DragEvent<HTMLElement>, payload: EmployeeDragPayload) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      return
    }
    event.stopPropagation()
    event.dataTransfer.effectAllowed = payload.sourcePositionId ? 'move' : 'copyMove'
    event.dataTransfer.setData(EMPLOYEE_DRAG_TYPE, JSON.stringify(payload))
    setEmployeeDrag(payload)
  }, [])

  const finishEmployeeDrag = useCallback(() => {
    setEmployeeDrag(null)
  }, [])

  const changeAssignment = useCallback((
    employeeId: string,
    targetPositionId: string,
    sourcePositionId: string | null = null,
  ) => {
    if (!editingEnabledRef.current) {
      setAssignmentNotice('目前版本為唯讀；請先進入草稿編輯或現行版維護')
      setEmployeeDrag(null)
      return
    }
    const target = positionViewById.get(targetPositionId)
    const employee = employeeById.get(employeeId)
    if (!target || !employee || sourcePositionId === targetPositionId) {
      setEmployeeDrag(null)
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
    setEmployeeDrag(null)
  }, [commitState, employeeById, positionViewById])

  const dropEmployeeOnPosition = useCallback((event: DragEvent<HTMLElement>, targetPositionId: string) => {
    let payload = employeeDrag
    if (!payload) {
      try {
        payload = JSON.parse(event.dataTransfer.getData(EMPLOYEE_DRAG_TYPE)) as EmployeeDragPayload
      } catch {
        return
      }
    }
    changeAssignment(payload.employeeId, targetPositionId, payload.sourcePositionId)
  }, [changeAssignment, employeeDrag])

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
    setEmployeeDrag(null)
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
          const dutyDropCandidate = dutyDropCandidateByPositionId.get(member.id)
          const positionSelectHandler = activatePosition
          const dataChanged = !previous
            || previous.data.member !== viewMember
            || previous.data.employees !== employees
            || previous.data.childCount !== childTotal
            || previous.data.onToggle !== toggleCollapse
            || previous.data.onSelectPosition !== positionSelectHandler
            || previous.data.onSelectEmployee !== selectEmployee
            || previous.data.onEmployeeDragStart !== startEmployeeDrag
            || previous.data.onEmployeeDragEnd !== finishEmployeeDrag
            || previous.data.onEmployeeDrop !== dropEmployeeOnPosition
            || previous.data.employeeDragging !== Boolean(employeeDrag)
            || previous.data.showDragPlaceholder !== showDragPlaceholder
            || previous.data.employeeHighlighted !== employeeHighlighted
            || previous.data.riskLevel !== riskState?.level
            || previous.data.riskRelated !== riskRelated
            || previous.data.onRiskInteraction !== setRiskInteraction
            || previous.data.editingEnabled !== organizationEditingEnabled
            || previous.data.dutyConfigurationActive !== dutyConfigurationLocation.active
            || previous.data.dutyDropCandidate !== dutyDropCandidate
            || previous.data.dutyKeyboardGrabbed !== (dutyDragState.phase === 'keyboard-grabbed')
            || previous.data.dutyKeyboardLaneLabel !== (dutyDragState.phase === 'keyboard-grabbed' ? dutyConfigurationLaneLabels[dutyDragState.payload.lane] : undefined)
            || previous.data.onDutyDropPosition !== commitDutyDrop
            || previous.data.onDutyDragOver !== updateDutyDropCandidate
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
                onEmployeeDragStart: startEmployeeDrag,
                onEmployeeDragEnd: finishEmployeeDrag,
                onEmployeeDrop: dropEmployeeOnPosition,
                employeeDragging: Boolean(employeeDrag),
                dragOffset,
                showDragPlaceholder,
                employeeHighlighted,
                riskLevel: riskState?.level,
                riskRelated,
                onRiskInteraction: setRiskInteraction,
                editingEnabled: organizationEditingEnabled,
                dutyConfigurationActive: dutyConfigurationLocation.active,
                dutyDropCandidate,
                dutyKeyboardGrabbed: dutyDragState.phase === 'keyboard-grabbed',
                dutyKeyboardLaneLabel: dutyDragState.phase === 'keyboard-grabbed' ? dutyConfigurationLaneLabels[dutyDragState.payload.lane] : undefined,
                onDutyDropPosition: commitDutyDrop,
                onDutyDragOver: updateDutyDropCandidate,
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
    dropEmployeeOnPosition,
    employeeById,
    employeeDrag,
    finishEmployeeDrag,
    previewLayout,
    previewMembers,
     previewPositionViewById,
     previewEmployeesByPositionId,
    positionRiskById,
    relatedRiskPositionIds,
    removeAssignment,
    selectedEmployeePositionIds,
    selectedId,
    activatePosition,
    selectEmployee,
    prototypeResponsibilityLabelsByPositionId,
    dutyDropCandidateByPositionId,
    dutyDragState,
    dutyConfigurationLocation.active,
    dutyConfigurationLocation.dutyId,
    commitDutyDrop,
    updateDutyDropCandidate,
    startEmployeeDrag,
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
    if (dutyPlanningLocation.isDutyPlanningPage || !serverReady) return

    const frame = window.requestAnimationFrame(() => {
      fitOrganization()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dutyPlanningLocation.isDutyPlanningPage, fitOrganization, serverReady])

  const selectNode = useCallback((id: string) => {
    activatePosition(id)
    if (!prototypeResponsibilityContext && window.innerWidth <= 1100) centerNodeInCanvas(id)
  }, [activatePosition, centerNodeInCanvas, prototypeResponsibilityContext])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A failed document is a recovery gate: keyboard shortcuts must not
      // mutate, save, undo, or dismiss the empty fallback workspace.
      if (recoveryOpen) return
      if (dutyDragState.phase === 'keyboard-grabbed') {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          cancelDutyConfigurationDrag()
          return
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-position-id][tabindex="0"]'))
          const current = document.activeElement?.closest<HTMLElement>('[data-position-id]')
          const currentIndex = current ? targets.indexOf(current) : -1
          const nextIndex = event.shiftKey
            ? (currentIndex <= 0 ? targets.length - 1 : currentIndex - 1)
            : (currentIndex + 1) % Math.max(targets.length, 1)
          targets[nextIndex]?.focus()
          return
        }
        if (event.key === 'Enter' || event.key === ' ') return
      }
      if (prototypeResponsibilityContext && event.key === 'Escape') {
        event.preventDefault()
        finishPrototypeResponsibility()
        return
      }
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return
        if (governanceOpen) {
          event.preventDefault()
          setGovernanceOpen(false)
          return
        }
        if (positionContextMenu) {
          event.preventDefault()
          closePositionContextMenu()
          return
        }
        const action = resolveEscapeDismissAction({
          recoveryOpen,
          deleteOpen,
          directoryDialogOpen: Boolean(directoryDialog),
          roleRiskOpen: roleRiskSettingsOpen,
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
        else if (action === 'dismiss-role-risk') closeRoleRiskPanel()
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
    cancelDutyConfigurationDrag,
    closeDirectoryPanel,
    closeInspectorPanel,
    closePositionContextMenu,
    closeRoleRiskPanel,
    deleteOpen,
    dutyDragState.phase,
    directoryDialog,
    fitOrganization,
    editingEnabled,
    finishPrototypeResponsibility,
    queueTitleEdit,
    redo,
    recoveryOpen,
    reorderSelected,
    positionContextMenu,
    saveDocument,
    saveDocumentCopy,
    selected,
    inspectorOpen,
    roleRiskSettingsOpen,
    governanceOpen,
    prototypeResponsibilityContext,
    setChildrenAxis,
    undo,
  ])

  const selectedChildCount = selected ? childCount.get(selected.id) ?? 0 : 0
  const selectedDutyForConfiguration = dutyConfigurationLocation.dutyId
    ? duties.find((duty) => duty.id === dutyConfigurationLocation.dutyId) ?? null
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
  const directoryDetailSelection: DirectoryDetailSelection | null = directorySelection?.kind === 'employees' || directorySelection?.kind === 'departments'
    ? { kind: directorySelection.kind, id: directorySelection.id }
    : null
  const prototypeContextStep = prototypeResponsibilityContext
    ? findPrototypeStep(managementMethodState, prototypeResponsibilityContext.stepId)
    : null
  const prototypeContextWorkItem = prototypeResponsibilityContext
    ? managementMethodState.workItems.find((item) => item.id === prototypeResponsibilityContext.workItemId) ?? null
    : null
  const prototypeContextStepNumber = prototypeResponsibilityContext
    ? getPrototypeStepNumber(managementMethodState, prototypeResponsibilityContext.stepId)
    : '--'

  if (managementMethodRoute.isListPage) {
    return <ManagementMethodListPage onClose={closeManagementMethodPage} onOpen={(methodId, view) => {
      const next = `/management-methods/${encodeURIComponent(methodId)}?view=${view ?? 'draft'}`
      window.history.pushState({}, '', next)
      setManagementMethodRoute(readManagementMethodLocation(window.location))
    }} />
  }

  if (managementMethodRoute.isDocumentPage && managementMethodRoute.methodId) {
    return <ManagementMethodDocumentPage methodId={managementMethodRoute.methodId} initialView={managementMethodRoute.view} initialChapter={managementMethodRoute.chapter} state={currentState} onClose={closeManagementMethodPage} />
  }

  if (managementMethodLocation.isEditorPage) {
    return (
      <ManagementMethodPrototype
        state={managementMethodState}
        setState={setManagementMethodState}
        positions={positionViews}
        focusStepId={managementMethodLocation.focusStepId}
        onClose={closeManagementMethodPage}
        onConfigureResponsibility={openPrototypeResponsibility}
      />
    )
  }

  if (processPlanningLocation.active) {
    return <ProcessPlanningWorkbench
      state={currentState}
      location={processPlanningLocation}
      editingEnabled={editingEnabled}
      serverReady={serverReady}
      recoveryOpen={recoveryOpen}
      mobileReadOnly={mobileReadOnly}
      onCommand={runOrganizationCommand}
      onNavigate={navigateProcessPlanning}
      onClose={closeProcessPlanningPage}
    />
  }

  if (dutyPlanningLocation.isDutyPlanningPage && !dutyConfigurationLocation.active) {
    return (
      <DutyCenter
        open
        presentation="page"
        onClose={closeDutyPlanningPage}
        state={currentState}
        departments={departments}
        organizationLevels={organizationLevels}
        isDirty={isDirty}
        savedAt={savedAt}
        persistenceKind={persistenceKind}
        autoSavePending={autoSavePending}
        autoSaveError={autoSaveError}
        onSave={saveDocument}
        onSaveCopy={saveDocumentCopy}
        onBackup={backupDocument}
        view={dutyPlanningLocation.view ?? 'audit'}
        query={dutyPlanningLocation.query}
        anomalyTypes={dutyPlanningLocation.anomalyTypes}
        onNavigateView={navigateDutyPlanningView}
        onQueryChange={updateDutyPlanningQuery}
        onAnomalyTypesChange={updateDutyPlanningStatuses}
        onClearFilters={clearDutyPlanningFilters}
        onOpenDutyConfiguration={(dutyId) => openDutyConfiguration(null, dutyId)}
        onOpenProcessPlanning={() => openProcessPlanningPage()}
      />
    )
  }

  return (
    <div className={`app-shell${prototypeResponsibilityContext ? ' is-prototype-responsibility' : ''}${dutyConfigurationLocation.active ? ' is-duty-configuration' : ''}${dutyConfigurationLocation.active && !dutyConfigurationWritable ? ' is-duty-configuration-readonly' : ''}`}>
      <Toolbar
        members={positionViews}
        employees={employees}
        departments={departments}
        organizationLevels={organizationLevels}
        searchFocusToken={searchFocusToken}
        onSearchSelect={showSelected}
        roleRiskSettingsOpen={roleRiskSettingsOpen}
        onOpenRoleRiskSettings={() => {
          lastInteractedPanelRef.current = 'role-risk'
          setRoleRiskSettingsOpen(true)
        }}
        governanceOpen={governanceOpen}
        onOpenGovernance={() => setGovernanceOpen(true)}
        onOpenManagementMethods={() => openManagementMethodPage()}
        onOpenProcessPlanning={() => openProcessPlanningPage()}
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
      />
      {prototypeResponsibilityContext && prototypeContextStep && prototypeContextWorkItem && (
        <section className="prototype-responsibility-bar" aria-label="工作事項責任配置">
          <button type="button" className="prototype-responsibility-bar__return" onClick={finishPrototypeResponsibility}>
            {managementMethodState.method.code}／{prototypeContextStep.stage.title}／步驟 {prototypeContextStepNumber}
          </button>
          <div className="prototype-responsibility-bar__work-item">
            <span>工作事項</span>
            <strong>{prototypeContextWorkItem.title}</strong>
          </div>
          <label className="prototype-responsibility-bar__relation">
            <span>責任類型</span>
            <select
              value={prototypeResponsibilityContext.relationType}
              onChange={(event) => changePrototypeRelationType(event.target.value as PrototypeResponsibilityType)}
            >
              <option value="primary-execute">主執行</option>
              <option value="execute">共同執行</option>
              <option value="review">審核</option>
              <option value="collaborate">協作</option>
              <option value="countersign">會簽</option>
            </select>
          </label>
          <p><MousePointerClick size={15} />直接點選組織圖上的職位；再次點選可取消。</p>
          <button type="button" className="prototype-responsibility-bar__done" onClick={finishPrototypeResponsibility}>
            <Check size={16} />完成
          </button>
        </section>
      )}
      <GovernanceCenter
        open={governanceOpen}
        onClose={() => setGovernanceOpen(false)}
        employees={employees}
        departments={departments}
        roles={roles}
        currentOrganizationVersionId={workspaceIndex?.currentVersionId ?? null}
      />

      <main
        className={[
          'workspace',
          inspectorOpen || (dutyConfigurationLocation.active && dutyDetailOpen) ? 'has-inspector' : '',
          dutyConfigurationLocation.active ? 'is-duty-configuration' : '',
        ].filter(Boolean).join(' ')}
        onPointerDownCapture={recordPanelInteraction}
        onFocusCapture={recordPanelInteraction}
      >
        <DirectoryDock
          employees={employees}
          departments={departments}
          members={positionViews}
          positions={positions}
          assignments={assignments}
          organizationLevels={organizationLevels}
          levelIssue={organizationIssueTarget === 'level' ? organizationIssue : null}
          editingEnabled={organizationEditingEnabled}
          selected={selected}
          directorySelection={directorySelection}
          activeDirectory={activeDirectory}
          onActiveDirectoryChange={changeActiveDirectory}
          onEmployeeDragStart={startEmployeeDrag}
          onEmployeeDragEnd={finishEmployeeDrag}
          onAssignEmployee={(employeeId, targetPositionId) => changeAssignment(employeeId, targetPositionId)}
          onSelectPosition={prototypeResponsibilityContext ? activatePosition : showSelected}
          onSelectEntity={selectEntity}
          onAddEmployee={() => {
            if (!organizationEditingEnabled) { setAssignmentNotice('責任配置期間暫停修改組織資料'); return }
            setDirectoryDialog({ type: 'add-employee' })
          }}
          onAddPosition={addPositionFromDirectory}
          onAddDepartment={() => {
            if (!organizationEditingEnabled) { setAssignmentNotice('責任配置期間暫停修改組織資料'); return }
            setDirectoryDialog({ type: 'add-department' })
          }}
          onDeleteEmployee={(employeeId) => {
            if (!organizationEditingEnabled) { setAssignmentNotice('責任配置期間暫停修改組織資料'); return }
            setDirectoryDialog({ type: 'delete-employee', employeeId })
          }}
          onDeletePosition={requestDeletePosition}
          onDeleteDepartment={(departmentId) => {
            if (!organizationEditingEnabled) { setAssignmentNotice('責任配置期間暫停修改組織資料'); return }
            setDirectoryDialog({ type: 'delete-department', departmentId })
          }}
          onEditEmployee={(employeeId) => {
            if (!organizationEditingEnabled) { setAssignmentNotice('責任配置期間暫停修改組織資料'); return }
            setDirectoryDialog({ type: 'edit-employee', employeeId })
          }}
          onEditPosition={(positionId) => {
            showSelected(positionId)
            queueTitleEdit()
          }}
          onEditDepartment={(departmentId) => {
            if (!organizationEditingEnabled) { setAssignmentNotice('責任配置期間暫停修改組織資料'); return }
            setDirectoryDialog({ type: 'edit-department', departmentId })
          }}
          onAddOrganizationLevel={addOrganizationLevel}
          onRenameOrganizationLevel={renameOrganizationLevel}
          onDeleteOrganizationLevel={deleteOrganizationLevel}
          onReorderOrganizationLevels={reorderOrganizationLevels}
          onPreviewOrganizationLevels={previewOrganizationLevels}
          duties={duties}
          dutyPositionRelations={dutyPositionRelations}
          dutyConfigurationLocation={dutyConfigurationLocation}
          dutyConfigurationExpandedDutyId={dutyConfigurationExpandedDutyId}
          dutyConfigurationWritable={dutyConfigurationWritable}
          dutyConfigurationError={dutyConfigurationError}
          onSelectDuty={selectDutyFromPicker}
          onSelectDutyLane={selectDutyLane}
          onOpenDutyConfigurationDetail={openDutyConfigurationDetail}
          onStartDutyDrag={startDutyConfigurationDrag}
          onCancelDutyDrag={cancelDutyConfigurationDrag}
          dutyDragState={dutyDragState}
          onOpenDutyPlanning={() => openDutyPlanningPage('audit')}
          onCreateDuty={() => {
            if (!dutyConfigurationWritable) {
              setDutyConfigurationError('目前版本為唯讀；請先進入草稿編輯或現行版維護')
              return
            }
            setDutyEditDialog('create')
          }}
        />

        <div
          className={employeeDrag ? 'canvas-wrap is-employee-drop-zone' : 'canvas-wrap'}
          tabIndex={-1}
          data-workspace-focus-fallback
          onDragOver={(event) => {
            if (!employeeDrag) return
            event.preventDefault()
            event.dataTransfer.dropEffect = employeeDrag.sourcePositionId ? 'move' : 'copy'
          }}
          onDrop={(event) => {
            if (!employeeDrag) return
            event.preventDefault()
            if (employeeDrag.sourcePositionId) removeAssignment(employeeDrag.sourcePositionId, employeeDrag.employeeId)
            else finishEmployeeDrag()
          }}
        >
          <ReactFlow<OrgFlowNode, OrgFlowEdge>
            className={draggingId ? 'is-dragging' : undefined}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            deleteKeyCode={null}
            onNodeClick={(_event, node) => selectNode(node.id)}
            onNodeDoubleClick={(_event, node) => {
              setPositionContextMenu(null)
              if (!prototypeResponsibilityContext) selectNode(node.id)
              if (organizationEditingEnabled) queueTitleEdit()
            }}
            onNodeContextMenu={prototypeResponsibilityContext || dutyConfigurationLocation.active ? undefined : openPositionContextMenu}
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
              <RoleRiskRelationLayer
                relations={visibleRiskRelations}
                positions={previewLayout.positions}
                nodeHeights={previewNodeHeights}
              />
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

        {inspectorOpen && (directoryDetailSelection ? (
          <DirectoryDetailPanel
            selection={directoryDetailSelection}
            employees={employees}
            departments={departments}
            organizationLevels={organizationLevels}
            members={positionViews}
            onSetPrimaryAssignment={changePrimaryAssignment}
            editingEnabled={organizationEditingEnabled}
            onSelectPosition={showSelected}
            onSelectEntity={selectEntity}
            onClose={closeInspectorPanel}
          />
        ) : (
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
            onOpenLevelDirectory={() => changeActiveDirectory('levels')}
            onClose={closeInspectorPanel}
            editingEnabled={organizationEditingEnabled}
            duties={duties}
            dutyRelations={selected ? dutyPositionRelations.filter((relation) => relation.target.kind === 'position' && relation.target.positionId === selected.id) : []}
            onOpenDutyConfiguration={(positionId) => openDutyConfiguration(positionId)}
          />
        ))}

        {roleRiskSettingsOpen && (
          <RoleCombinationRiskPanel
            roles={roles}
            rules={roleCombinationRiskRules}
            onUpsert={upsertRoleRiskRule}
            onSetEnabled={setRoleRiskRuleEnabled}
            onDelete={deleteRoleRiskRule}
            editingEnabled={organizationEditingEnabled}
            onClose={closeRoleRiskPanel}
          />
        )}

        {dutyConfigurationLocation.active && dutyDetailOpen && <DutyDetailDrawer
          duty={selectedDutyForConfiguration}
          state={currentState}
          editingEnabled={dutyConfigurationWritable}
          placementMode="organization-chart"
          displayMode="inspector"
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
            const nextUrl = buildDutyConfigurationUrl({ dutyId: relation.dutyId, lane, sourceRelationId: relation.id })
            window.history.replaceState({}, '', nextUrl)
            setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
            setDutyDetailOpen(false)
            setDutyConfigurationError(null)
          }}
        />}
      </main>

      {dutyEditDialog === 'create' && <DutyEditDialog onCancel={() => setDutyEditDialog(null)} onSave={saveNewDuty} />}
      {dutyDeleteDialog && selectedDutyForConfiguration && <DutyDeleteDialog dutyTitle={selectedDutyForConfiguration.title} relationCount={currentState.dutyPositionRelations.filter((relation) => relation.dutyId === selectedDutyForConfiguration.id).length} onCancel={() => setDutyDeleteDialog(false)} onConfirm={() => {
        const result = runDutyConfigurationCommand({ type: 'DELETE_DUTY', dutyId: selectedDutyForConfiguration.id })
        if (result?.status === 'applied') {
          setDutyDeleteDialog(false)
          setDutyDetailOpen(false)
          const nextUrl = buildDutyConfigurationUrl({ attentionOnly: dutyConfigurationLocation.attentionOnly })
          window.history.replaceState({}, '', nextUrl)
          setDutyConfigurationLocation(readDutyConfigurationLocation(window.location))
        }
      }} />}

      {positionContextMenu && contextPosition && (
        <PositionContextMenu
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
        />
      )}

      {directoryDialog?.type === 'add-employee' && (
        <AddEmployeeDialog
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={createEmployee}
        />
      )}

      {directoryDialog?.type === 'add-department' && (
        <AddDepartmentDialog
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={createDepartment}
        />
      )}

      {directoryDialog?.type === 'edit-employee' && dialogEmployee && (
        <EditEmployeeDialog
          employee={dialogEmployee}
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={(name, departmentIds) => updateEmployee(dialogEmployee.id, name, departmentIds)}
        />
      )}

      {directoryDialog?.type === 'edit-department' && dialogDepartment && (
        <EditDepartmentDialog
          department={dialogDepartment}
          departments={departments}
          onClose={() => setDirectoryDialog(null)}
          onSubmit={(name, parentId) => updateDepartment(dialogDepartment.id, name, parentId)}
        />
      )}

      {directoryDialog?.type === 'delete-employee' && dialogEmployee && (
        <DeleteEmployeeDialog
          employee={dialogEmployee}
          assignmentCount={positionViews.filter((member) => (
            member.activeAssignments.some((assignment) => assignment.employeeId === dialogEmployee.id)
          )).length}
          onClose={() => setDirectoryDialog(null)}
          onConfirm={() => deleteEmployee(dialogEmployee.id)}
        />
      )}

      {directoryDialog?.type === 'delete-department' && dialogDepartment && (
        <DeleteDepartmentDialog
          department={dialogDepartment}
          departments={departments}
          employeeCount={employees.filter((employee) => employee.departmentIds.includes(dialogDepartment.id)).length}
          positionCount={positions.filter((position) => position.status === 'active' && position.departmentId === dialogDepartment.id).length}
          issue={inspectorIssue?.target === 'delete' ? inspectorIssue : null}
          onClose={() => setDirectoryDialog(null)}
          onConfirm={(replacementDepartmentId) => deleteDepartment(dialogDepartment.id, replacementDepartmentId)}
        />
      )}

      {deleteOpen && selected && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDeleteOpen(false)}>
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
        </div>
      )}

      {workspaceDrawerOpen && workspaceIndex && (
        <VersionWorkspacePanel
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
        />
      )}

    </div>
  )
}
