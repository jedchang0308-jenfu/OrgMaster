import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { DutyAnomalyPressPoint } from '../dutyAnomalyPressInteraction'
import type { DutyPlacementSource } from '../dutyPlacement'
import type { DutyMatrixRow } from '../dutyPlanningPresentation'
import type { Duty } from '../types'

interface DutyRelationEditorRowProps {
  duty: Duty
  row: DutyMatrixRow
  editingEnabled: boolean
  onSelect: () => void
  onOpenPlacement: (anchor: HTMLElement) => void
  onPointerDragStart: (source: DutyPlacementSource, pointerId: number, anchor: HTMLElement, point: DutyAnomalyPressPoint) => void
  onPointerDragMove: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragEnd: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragCancel: (pointerId: number) => void
}

function exactLaneLabel(row: DutyMatrixRow) {
  if (row.column === 'primary-execute') return '主責執行'
  if (row.column === 'collaborate') return '執行協作'
  if (row.column === 'review') return '審核'
  if (row.column === 'countersign') return '會簽'
  return '協作'
}

function badgeTone(row: DutyMatrixRow) {
  if (row.column === 'primary-execute') return 'info'
  if (row.column === 'countersign') return 'warning'
  return 'neutral'
}

function badgeLabel(row: DutyMatrixRow) {
  if (row.column === 'primary-execute') return '主責'
  if (row.column === 'collaborate') return '協作'
  if (row.column === 'review') return '審核'
  if (row.column === 'countersign') return '會簽'
  return null
}

export function DutyRelationEditorRow({
  duty,
  row,
  editingEnabled,
  onSelect,
  onOpenPlacement,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  onPointerDragCancel,
}: DutyRelationEditorRowProps) {
  const source: DutyPlacementSource = { kind: 'relation', relationId: row.relationId }
  const pointerCapturedRef = useRef(false)
  const movedRef = useRef(false)
  const suppressClickRef = useRef(false)
  const startPointRef = useRef<DutyAnomalyPressPoint | null>(null)
  const label = exactLaneLabel(row)
  const badge = badgeLabel(row)

  const pointerPoint = (event: ReactPointerEvent<HTMLButtonElement>): DutyAnomalyPressPoint => ({ x: event.clientX, y: event.clientY })

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editingEnabled || !row.draggable || event.pointerType !== 'mouse' || event.button !== 0) return
    event.preventDefault()
    pointerCapturedRef.current = true
    movedRef.current = false
    suppressClickRef.current = false
    startPointRef.current = pointerPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    onPointerDragStart(source, event.pointerId, event.currentTarget, pointerPoint(event))
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerCapturedRef.current) return
    const startPoint = startPointRef.current
    if (startPoint && Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y) > 4) movedRef.current = true
    onPointerDragMove(event.pointerId, pointerPoint(event))
  }

  const releasePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerCapturedRef.current) return
    pointerCapturedRef.current = false
    suppressClickRef.current = movedRef.current
    startPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onPointerDragEnd(event.pointerId, pointerPoint(event))
  }

  const cancelPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerCapturedRef.current) return
    pointerCapturedRef.current = false
    suppressClickRef.current = true
    startPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onPointerDragCancel(event.pointerId)
  }

  const handleHandleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      suppressClickRef.current = false
      return
    }
    if (editingEnabled && row.draggable) onOpenPlacement(event.currentTarget)
  }

  const handleHandleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!editingEnabled || !row.draggable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onOpenPlacement(event.currentTarget)
  }

  return (
    <div className="duty-relation-editor-row" data-duty-relation-id={row.relationId}>
      {editingEnabled && row.draggable && <button
        type="button"
        className="duty-relation-editor-row__handle"
        draggable={editingEnabled && row.draggable}
        data-duty-relation-handle="true"
        data-duty-drag-source-kind="relation"
        data-duty-drag-source-id={row.relationId}
        aria-label={`配置「${duty.title}」的${label}責任`}
        title={`拖曳到另一職位；點擊或按 Enter 選擇目標`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={cancelPointer}
        onClick={handleHandleClick}
        onKeyDown={handleHandleKeyDown}
      >⠿</button>}
      <button
        type="button"
        className="duty-relation-editor-row__content"
        onClick={onSelect}
        aria-label={`${duty.title}，${label}，開啟工作執掌明細`}
      >
        <strong className="duty-relation-editor-row__title">{duty.title}</strong>
        {badge && <span className={`duty-relation-editor-row__badge duty-relation-editor-row__badge--${badgeTone(row)}`}>{badge}</span>}
      </button>
    </div>
  )
}
