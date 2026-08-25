import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { DutyAnomalyPressPoint } from '../dutyAnomalyPressInteraction'
import type { DutyAnomaly } from '../duties'
import type { DutyPlacementSource } from '../dutyPlacement'
import type { Duty } from '../types'

interface DutyPendingSourceRowProps {
  duty: Duty
  anomaly: DutyAnomaly
  context: string | null
  editingEnabled: boolean
  onSelect: () => void
  onOpenPlacement: (anchor: HTMLElement) => void
  onPointerDragStart: (source: DutyPlacementSource, pointerId: number, anchor: HTMLElement, point: DutyAnomalyPressPoint) => void
  onPointerDragMove: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragEnd: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragCancel: (pointerId: number) => void
}

export function DutyPendingSourceRow({
  duty,
  anomaly,
  context,
  editingEnabled,
  onSelect,
  onOpenPlacement,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  onPointerDragCancel,
}: DutyPendingSourceRowProps) {
  const source: DutyPlacementSource = { kind: 'anomaly', anomalyId: anomaly.id }
  const pointerCapturedRef = useRef(false)
  const suppressClickRef = useRef(false)
  const movedRef = useRef(false)
  const startPointRef = useRef<DutyAnomalyPressPoint | null>(null)

  const point = (event: ReactPointerEvent<HTMLButtonElement>): DutyAnomalyPressPoint => ({ x: event.clientX, y: event.clientY })
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Start the existing Pointer fallback first; native desktop dragstart may
    // supersede this session, while touch/keyboard use the placement menu.
    if (!editingEnabled || event.pointerType !== 'mouse' || event.button !== 0) return
    event.preventDefault()
    pointerCapturedRef.current = true
    suppressClickRef.current = false
    movedRef.current = false
    startPointRef.current = point(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    onPointerDragStart(source, event.pointerId, event.currentTarget, point(event))
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerCapturedRef.current) return
    event.preventDefault()
    const start = startPointRef.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4) movedRef.current = true
    onPointerDragMove(event.pointerId, point(event))
  }
  const releasePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerCapturedRef.current) return
    pointerCapturedRef.current = false
    suppressClickRef.current = movedRef.current
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (movedRef.current) onPointerDragEnd(event.pointerId, point(event))
    else onPointerDragCancel(event.pointerId)
    startPointRef.current = null
  }
  const cancelPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerCapturedRef.current) return
    pointerCapturedRef.current = false
    suppressClickRef.current = true
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onPointerDragCancel(event.pointerId)
    startPointRef.current = null
  }
  const handlePlacementClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      suppressClickRef.current = false
      return
    }
    onOpenPlacement(event.currentTarget)
  }
  const handlePlacementKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpenPlacement(event.currentTarget)
  }

  return <div className="duty-pending-source-row" data-duty-anomaly-id={anomaly.id}>
    {editingEnabled && <button
      type="button"
      className="duty-pending-source-row__handle"
      draggable={editingEnabled}
      aria-label={`配置「${duty.title}」到職位`}
      title="拖曳到右側職位；點擊或按 Enter 選擇目標"
      data-duty-anomaly-handle="true"
      data-duty-drag-source-kind="anomaly"
      data-duty-drag-source-id={anomaly.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
      onClick={handlePlacementClick}
      onKeyDown={handlePlacementKeyDown}
    >⠿</button>}
    <button
      type="button"
      className="duty-pending-source-row__content"
      onClick={onSelect}
      aria-label={`${duty.title}${context ? `，${context}` : ''}，開啟工作執掌明細`}
    >
      <strong>{duty.title}</strong>
      {context && <small>{context}</small>}
    </button>
  </div>
}
