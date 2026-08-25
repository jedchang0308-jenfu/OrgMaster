import { useEffect, useRef, useState } from 'react'
import { deriveDutyAnomalies } from '../duties'
import { getDutyDragAutoScrollDelta, resolveDutyDragScrollOwner } from '../dutyDragAutoScroll'
import { dutyResponsibilityColumnForSource, evaluateDutyDrop, createDutyDropIntent, type DutyPlacementSource, type DutyPlacementTarget } from '../dutyPlacement'
import { getDutyPlanningViewportMode } from '../dutyPlanningPresentation'
import type { DutyPlanIntent } from '../dutyPlanning'
import type { OrganizationCommand, OrganizationCommandResult } from '../organizationCommands'
import type { Department, OrgDirectoryState, OrganizationLevel } from '../types'
import type { DutyAnomalyPressPoint } from '../dutyAnomalyPressInteraction'
import { DutyCardDragPreview } from './DutyCardDragPreview'
import { DutyAnomalyPanel } from './DutyAnomalyPanel'
import { DutyExpandedPositionEditor } from './DutyExpandedPositionEditor'
import { DutyMoveCopyPopover } from './DutyMoveCopyPopover'
import { DutyRelationPlacementMenu } from './DutyRelationPlacementMenu'

interface DutyPlanningWorkbenchProps {
  state: OrgDirectoryState
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  editingEnabled: boolean
  focusPositionId?: string | null
  onCommand: (command: OrganizationCommand) => OrganizationCommandResult
  surface?: 'workbench' | 'matrix'
  onNavigateSurface?: (surface: 'workbench' | 'matrix' | 'anomalies') => void
  onSelectDuty: (dutyId: string) => void
  matrixQuery?: string
  matrixPositionQuery?: string
  matrixDepartmentFilter?: string
  onMatrixQueryChange?: (value: string) => void
  onMatrixPositionQueryChange?: (value: string) => void
  onMatrixDepartmentFilterChange?: (value: string) => void
}

interface PlacementMenuState {
  source: DutyPlacementSource
  anchor: HTMLElement
}

interface ChooserState {
  source: Extract<DutyPlacementSource, { kind: 'relation' }>
  target: DutyPlacementTarget
  anchor: HTMLElement
  returnFocus: HTMLElement | null
}

type DutyWorkbenchDragSession =
  | { mode: 'pointer'; source: DutyPlacementSource; pointerId: number; sourceAnchor: HTMLElement; sourceTitle: string; sourceLabel: string; latest: DutyAnomalyPressPoint; candidate: { target: DutyPlacementTarget; anchor: HTMLElement } | null }
  | { mode: 'native'; source: DutyPlacementSource; sourceAnchor: HTMLElement; sourceTitle: string; sourceLabel: string; latest: DutyAnomalyPressPoint; candidate: { target: DutyPlacementTarget; anchor: HTMLElement } | null }
  | null

export function DutyPlanningWorkbench({ state, departments, organizationLevels, editingEnabled, focusPositionId, onCommand, onSelectDuty, matrixQuery = '', matrixPositionQuery = '', matrixDepartmentFilter = '' }: DutyPlanningWorkbenchProps) {
  const [viewportMode, setViewportMode] = useState(() => getDutyPlanningViewportMode(typeof window === 'undefined' ? 1440 : window.innerWidth))
  const [dragSession, setDragSession] = useState<DutyWorkbenchDragSession>(null)
  const [chooser, setChooser] = useState<ChooserState | null>(null)
  const [placementMenu, setPlacementMenu] = useState<PlacementMenuState | null>(null)
  const [placementStatus, setPlacementStatus] = useState<string | null>(null)
  const [dropHighlightPositionId, setDropHighlightPositionId] = useState<string | null>(null)
  const dragSessionRef = useRef<DutyWorkbenchDragSession>(null)
  const pointerFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollPointRef = useRef<DutyAnomalyPressPoint | null>(null)
  const stateRef = useRef(state)
  const highlightTimerRef = useRef<number | null>(null)
  stateRef.current = state

  const commitDragSession = (next: DutyWorkbenchDragSession) => {
    dragSessionRef.current = next
    setDragSession(next)
  }
  const clearPointerFrame = () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current)
    pointerFrameRef.current = null
  }
  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
    autoScrollPointRef.current = null
  }
  const clearHighlight = () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = null
    setDropHighlightPositionId(null)
  }

  useEffect(() => {
    const update = () => setViewportMode(getDutyPlanningViewportMode(window.innerWidth))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const canEdit = editingEnabled
  const evaluateDropForSource = (source: DutyPlacementSource, target: DutyPlacementTarget) => evaluateDutyDrop(stateRef.current, [], source, target)

  const commitIntent = (intent: DutyPlanIntent) => {
    if (!canEdit) return
    const result = onCommand({ type: 'COMMIT_DUTY_PLANNING_CHANGE', intent })
    if (result.status === 'rejected') setPlacementStatus('資料或目標已變更，請重新操作')
    else setPlacementStatus(null)
    clearPointerFrame()
    stopAutoScroll()
    commitDragSession(null)
    setChooser(null)
  }

  const handleDrop = (source: DutyPlacementSource, target: DutyPlacementTarget, anchor: HTMLElement, returnFocus: HTMLElement | null = null) => {
    if (!canEdit) return
    const currentState = stateRef.current
    const result = evaluateDutyDrop(currentState, [], source, target)
    if (result.kind === 'reject') {
      setPlacementStatus('資料或目標已變更，請重新操作')
      clearPointerFrame()
      stopAutoScroll()
      commitDragSession(null)
      return
    }
    if (result.kind === 'choose-move-copy') {
      commitDragSession(null)
      stopAutoScroll()
      setChooser({ source: result.source, target: result.target, anchor, returnFocus: returnFocus ?? anchor })
      return
    }
    const intent = createDutyDropIntent(currentState, source, target, { planItemId: `plan-${crypto.randomUUID()}`, newRelationId: `rel-${crypto.randomUUID()}` })
    if (!intent) return
    clearHighlight()
    setDropHighlightPositionId(target.positionId)
    highlightTimerRef.current = window.setTimeout(clearHighlight, 1200)
    commitIntent(intent)
  }

  const choose = (decision: 'move' | 'copy') => {
    if (!chooser) return
    const intent = createDutyDropIntent(stateRef.current, chooser.source, chooser.target, { planItemId: `plan-${crypto.randomUUID()}`, newRelationId: `rel-${crypto.randomUUID()}` }, decision)
    if (intent) commitIntent(intent)
  }

  const readDropTargetAt = (point: DutyAnomalyPressPoint, source: DutyPlacementSource) => {
    const element = document.elementFromPoint(point.x, point.y)
    const positionSection = element?.closest<HTMLElement>('[data-duty-drop-position="true"]')
    const positionId = positionSection?.dataset.positionId
    const sourceColumn = dutyResponsibilityColumnForSource(stateRef.current, source)
    if (!positionSection || !positionId || !sourceColumn) return null
    return { target: { positionId, column: sourceColumn }, anchor: positionSection }
  }

  const sourceDetails = (source: DutyPlacementSource) => {
    const currentState = stateRef.current
    const anomaly = source.kind === 'anomaly' ? deriveDutyAnomalies(currentState).find((item) => item.id === source.anomalyId) : undefined
    const relation = source.kind === 'relation' ? currentState.dutyPositionRelations.find((item) => item.id === source.relationId) : undefined
    const dutyId = anomaly?.dutyId ?? relation?.dutyId
    const sourceTitle = currentState.duties.find((duty) => duty.id === dutyId)?.title ?? '工作執掌'
    const sourceLabel = anomaly
      ? anomaly.type === 'pending-reassignment' ? '待重新分配' : anomaly.type === 'no-executor' ? '無執行職位' : '缺少主執行'
      : relation?.isPrimaryExecutor ? '主執行' : relation?.relationType === 'execute' ? '其他執行' : relation?.relationType === 'review' ? '審核' : relation?.relationType === 'collaborate' ? '協作' : '會簽'
    return { sourceTitle, sourceLabel }
  }

  const schedulePointerHitTest = () => {
    if (pointerFrameRef.current !== null) return
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null
      const current = dragSessionRef.current
      if (!current || (current.mode !== 'pointer' && current.mode !== 'native')) return
      const candidate = readDropTargetAt(current.latest, current.source)
      const validCandidate = candidate && evaluateDropForSource(current.source, candidate.target).kind !== 'reject' ? candidate : null
      commitDragSession({ ...current, candidate: validCandidate })
    })
  }

  const scheduleAutoScroll = (point: DutyAnomalyPressPoint) => {
    autoScrollPointRef.current = point
    if (autoScrollFrameRef.current !== null) return
    const tick = () => {
      autoScrollFrameRef.current = null
      const current = dragSessionRef.current
      const latest = autoScrollPointRef.current
      if (!current || (current.mode !== 'pointer' && current.mode !== 'native') || !latest) return
      const owner = resolveDutyDragScrollOwner(document.elementFromPoint(latest.x, latest.y))
      if (!owner) return
      const delta = getDutyDragAutoScrollDelta(latest.y, owner.getBoundingClientRect())
      if (!delta) return
      const maxScroll = Math.max(0, owner.scrollHeight - owner.clientHeight)
      const nextScrollTop = Math.min(maxScroll, Math.max(0, owner.scrollTop + delta))
      if (nextScrollTop === owner.scrollTop) return
      owner.scrollTop = nextScrollTop
      schedulePointerHitTest()
      autoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    autoScrollFrameRef.current = window.requestAnimationFrame(tick)
  }

  const startPointerDutyDrag = (source: DutyPlacementSource, pointerId: number, sourceAnchor: HTMLElement, point: DutyAnomalyPressPoint) => {
    if (!canEdit) return
    const { sourceTitle, sourceLabel } = sourceDetails(source)
    commitDragSession({ mode: 'pointer', source, pointerId, sourceAnchor, sourceTitle, sourceLabel, latest: point, candidate: null })
    scheduleAutoScroll(point)
    schedulePointerHitTest()
  }
  const startNativeDutyDrag = (source: DutyPlacementSource, sourceAnchor: HTMLElement, point: DutyAnomalyPressPoint) => {
    if (!canEdit) return
    const { sourceTitle, sourceLabel } = sourceDetails(source)
    commitDragSession({ mode: 'native', source, sourceAnchor, sourceTitle, sourceLabel, latest: point, candidate: null })
    scheduleAutoScroll(point)
    schedulePointerHitTest()
  }
  const movePointerDutyDrag = (pointerId: number, point: DutyAnomalyPressPoint) => {
    const current = dragSessionRef.current
    if (!current || current.mode !== 'pointer' || current.pointerId !== pointerId) return
    commitDragSession({ ...current, latest: point })
    scheduleAutoScroll(point)
    schedulePointerHitTest()
  }
  const cancelPointerDutyDrag = (pointerId: number) => {
    const current = dragSessionRef.current
    if (!current || current.mode !== 'pointer' || current.pointerId !== pointerId) return
    clearPointerFrame()
    stopAutoScroll()
    commitDragSession(null)
  }
  const endPointerDutyDrag = (pointerId: number, point: DutyAnomalyPressPoint) => {
    const current = dragSessionRef.current
    if (!current || current.mode !== 'pointer' || current.pointerId !== pointerId) return
    clearPointerFrame()
    stopAutoScroll()
    const release = readDropTargetAt(point, current.source)
    if (!release) {
      commitDragSession(null)
      return
    }
    const result = evaluateDropForSource(current.source, release.target)
    if (result.kind !== 'stage' && result.kind !== 'choose-move-copy') {
      setPlacementStatus('資料或目標已變更，請重新操作')
      commitDragSession(null)
      return
    }
    handleDrop(current.source, release.target, release.anchor, current.sourceAnchor)
  }

  const handleNativeDragStart = (event: React.DragEvent<HTMLElement>) => {
    if (!canEdit) return
    const handle = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-duty-drag-source-kind][data-duty-drag-source-id]')
      : null
    if (!handle) return
    const kind = handle.dataset.dutyDragSourceKind
    const id = handle.dataset.dutyDragSourceId
    if (!id || (kind !== 'anomaly' && kind !== 'relation')) return
    const source: DutyPlacementSource = kind === 'anomaly' ? { kind: 'anomaly', anomalyId: id } : { kind: 'relation', relationId: id }
    const rect = handle.getBoundingClientRect()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${kind}:${id}`)
    startNativeDutyDrag(source, handle, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }

  const handleNativeDragOver = (event: React.DragEvent<HTMLElement>) => {
    const current = dragSessionRef.current
    if (!current || current.mode !== 'native') return
    const point = { x: event.clientX, y: event.clientY }
    const candidate = readDropTargetAt(point, current.source)
    const validCandidate = candidate && evaluateDropForSource(current.source, candidate.target).kind !== 'reject' ? candidate : null
    if (validCandidate) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
    commitDragSession({ ...current, latest: point, candidate: validCandidate })
    scheduleAutoScroll(point)
  }

  const handleNativeDrop = (event: React.DragEvent<HTMLElement>) => {
    const current = dragSessionRef.current
    if (!current || current.mode !== 'native') return
    const release = readDropTargetAt({ x: event.clientX, y: event.clientY }, current.source)
    if (!release) return
    event.preventDefault()
    handleDrop(current.source, release.target, release.anchor, current.sourceAnchor)
  }

  const handleNativeDragEnd = () => {
    if (dragSessionRef.current?.mode !== 'native') return
    clearPointerFrame()
    stopAutoScroll()
    commitDragSession(null)
  }

  useEffect(() => {
    const cancel = () => {
      clearPointerFrame()
      stopAutoScroll()
      if (dragSessionRef.current?.mode === 'pointer' || dragSessionRef.current?.mode === 'native') commitDragSession(null)
    }
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('blur', cancel)
      clearPointerFrame()
      stopAutoScroll()
      clearHighlight()
      dragSessionRef.current = null
    }
  }, [])

  const openPlacementMenu = (source: DutyPlacementSource, anchor: HTMLElement) => {
    if (!canEdit) return
    setPlacementMenu({ source, anchor })
  }
  const submitPlacement = (target: DutyPlacementTarget, anchor: HTMLElement) => {
    if (!placementMenu) return
    const source = placementMenu.source
    const returnFocus = placementMenu.anchor
    setPlacementMenu(null)
    handleDrop(source, target, anchor, returnFocus)
  }

  const dragSource = dragSession?.source ?? null
  const dragCandidate = dragSession?.candidate ?? null
  return <section
    className={`duty-workbench duty-workbench--${viewportMode}`}
    aria-label="工作職掌規劃台"
    onDragStart={handleNativeDragStart}
    onDragOver={handleNativeDragOver}
    onDrop={handleNativeDrop}
    onDragEnd={handleNativeDragEnd}
  >
    {placementStatus && <div className="duty-placement-status" role="status">{placementStatus}</div>}
    <div className="duty-workbench__pending">
      <div className="duty-workbench__section-heading"><strong>待處理職掌</strong></div>
      <DutyAnomalyPanel
        state={state}
        canEdit={canEdit}
        onSelectDuty={onSelectDuty}
        onOpenPlacement={openPlacementMenu}
        onPointerDragStart={startPointerDutyDrag}
        onPointerDragMove={movePointerDutyDrag}
        onPointerDragEnd={endPointerDutyDrag}
        onPointerDragCancel={cancelPointerDutyDrag}
      />
    </div>
    <DutyExpandedPositionEditor
      state={state}
      departments={departments}
      organizationLevels={organizationLevels}
      editingEnabled={editingEnabled}
      focusPositionId={focusPositionId}
      dragSource={dragSource}
      dragCandidate={dragCandidate}
      dropHighlightPositionId={dropHighlightPositionId}
      onOpenPlacement={openPlacementMenu}
      onPointerDragStart={startPointerDutyDrag}
      onPointerDragMove={movePointerDutyDrag}
      onPointerDragEnd={endPointerDutyDrag}
      onPointerDragCancel={cancelPointerDutyDrag}
      onSelectDuty={onSelectDuty ? (duty) => onSelectDuty(duty.id) : () => undefined}
      query={matrixQuery}
      positionQuery={matrixPositionQuery}
      departmentFilter={matrixDepartmentFilter}
    />
    {dragSession && <DutyCardDragPreview title={dragSession.sourceTitle} label={dragSession.sourceLabel} point={dragSession.latest} hasCandidate={Boolean(dragSession.candidate)} />}
    {placementMenu && <DutyRelationPlacementMenu
      state={state}
      source={placementMenu.source}
      anchor={placementMenu.anchor}
      onRequest={submitPlacement}
      onCancel={() => setPlacementMenu(null)}
    />}
    {chooser && <DutyMoveCopyPopover anchor={chooser.anchor} returnFocus={chooser.returnFocus} onSelect={choose} onCancel={() => setChooser(null)} />}
  </section>
}
