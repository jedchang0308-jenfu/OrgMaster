import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  activateDutyAnomalyLongPress,
  canActivateDutyAnomalyLongPress,
  cancelDutyAnomalyPress,
  createDutyAnomalyPressState,
  resetDutyAnomalyPress,
  startDutyAnomalyPress,
  updateDutyAnomalyPress,
  DUTY_ANOMALY_LONG_PRESS_MS,
  type DutyAnomalyPressPoint,
  type DutyAnomalyPressState,
} from '../dutyAnomalyPressInteraction'
import type { DutyPlacementSource } from '../dutyPlacement'
import type { Duty } from '../types'
import { DutyCard, type DutyCardBadge, type DutyCardTone } from './DutyCard'

export interface DutyCardDragSurfaceProps {
  duty: Pick<Duty, 'id' | 'title'>
  source: DutyPlacementSource
  canEdit: boolean
  badges?: DutyCardBadge[]
  className?: string
  density?: 'regular' | 'compact'
  showTitle?: boolean
  label: string
  onSelect: () => void
  onPointerDragStart: (source: DutyPlacementSource, pointerId: number, anchor: HTMLElement, point: DutyAnomalyPressPoint) => void
  onPointerDragMove: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragEnd: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragCancel: (pointerId: number) => void
  tone?: DutyCardTone
  title: string
  nativeDraggable?: boolean
  onNativeDragStart?: React.DragEventHandler<HTMLButtonElement>
  onNativeDragEnd?: React.DragEventHandler<HTMLButtonElement>
}

function pointFromEvent(event: ReactPointerEvent<HTMLElement>): DutyAnomalyPressPoint {
  return { x: event.clientX, y: event.clientY }
}

function sourceId(source: DutyPlacementSource) {
  return source.kind === 'anomaly' ? source.anomalyId : source.relationId
}

export function DutyCardDragSurface({ duty, source, canEdit, badges, className = '', density = 'regular', showTitle = true, label, onSelect, onPointerDragStart, onPointerDragMove, onPointerDragEnd, onPointerDragCancel, tone = 'default', title, nativeDraggable = false, onNativeDragStart, onNativeDragEnd }: DutyCardDragSurfaceProps) {
  const stateRef = useRef<DutyAnomalyPressState>(createDutyAnomalyPressState())
  const timerRef = useRef<number | null>(null)
  const suppressNextClickRef = useRef(false)
  const dragCancelRef = useRef(onPointerDragCancel)
  const [phase, setPhase] = useState(stateRef.current.phase)
  dragCancelRef.current = onPointerDragCancel

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const reset = () => {
    clearTimer()
    stateRef.current = resetDutyAnomalyPress()
    setPhase('idle')
  }
  const cancel = (notifyParent = true) => {
    const current = stateRef.current
    if (current.phase === 'idle') return
    clearTimer()
    if (current.phase === 'picked-up' && notifyParent && current.pointerId !== null) dragCancelRef.current(current.pointerId)
    suppressNextClickRef.current = suppressNextClickRef.current || current.phase === 'picked-up' || current.phase === 'cancelled'
    stateRef.current = cancelDutyAnomalyPress(current)
    setPhase('cancelled')
  }
  const releaseCapture = (element: HTMLElement, pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  }
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // A container that opts into nativeDraggable leaves this pointer sequence
    // to the browser. The current matrix and anomaly surfaces both use the
    // 450ms long-press state machine so click and move behavior stay aligned.
    if (!canEdit || nativeDraggable || event.button !== 0 || event.pointerType !== 'mouse') return
    const element = event.currentTarget
    const point = pointFromEvent(event)
    stateRef.current = startDutyAnomalyPress(sourceId(source), event.pointerId, point, performance.now())
    setPhase('pressing')
    element.setPointerCapture(event.pointerId)
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const current = stateRef.current
      const now = performance.now()
      if (!canActivateDutyAnomalyLongPress(current, now) || current.pointerId === null || !current.latest) return
      const picked = activateDutyAnomalyLongPress(current, now)
      stateRef.current = picked
      setPhase(picked.phase)
      suppressNextClickRef.current = true
      onPointerDragStart(source, current.pointerId, element, current.latest)
    }, DUTY_ANOMALY_LONG_PRESS_MS)
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = stateRef.current
    if (current.pointerId !== event.pointerId || current.phase === 'idle') return
    const next = updateDutyAnomalyPress(current, event.pointerId, pointFromEvent(event))
    stateRef.current = next
    setPhase(next.phase)
    if (current.phase === 'pressing' && next.phase === 'cancelled') {
      clearTimer()
      suppressNextClickRef.current = true
      event.preventDefault()
      return
    }
    if (next.phase === 'picked-up' && next.latest) {
      event.preventDefault()
      onPointerDragMove(event.pointerId, next.latest)
    }
  }
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = stateRef.current
    if (current.pointerId !== event.pointerId || current.phase === 'idle') return
    const point = pointFromEvent(event)
    clearTimer()
    if (current.phase === 'picked-up') {
      suppressNextClickRef.current = true
      event.preventDefault()
      onPointerDragEnd(event.pointerId, point)
    } else if (current.phase === 'cancelled') {
      suppressNextClickRef.current = true
      event.preventDefault()
    }
    reset()
    releaseCapture(event.currentTarget, event.pointerId)
  }
  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const current = stateRef.current
    if (current.pointerId !== event.pointerId) return
    cancel()
    reset()
    releaseCapture(event.currentTarget, event.pointerId)
  }
  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const current = stateRef.current
    if (current.pointerId !== event.pointerId || current.phase === 'idle') return
    cancel()
    reset()
  }
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.detail !== 0 && suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onSelect()
  }
  const handleNativeDragStart: React.DragEventHandler<HTMLButtonElement> = (event) => {
    cancel(false)
    reset()
    onNativeDragStart?.(event)
  }
  const handleNativeDragEnd: React.DragEventHandler<HTMLButtonElement> = (event) => {
    reset()
    onNativeDragEnd?.(event)
  }

  useEffect(() => {
    if (phase === 'idle') return
    const handleWindowBlur = () => { cancel() }
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      }
    }
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [phase])

  useEffect(() => () => {
    const current = stateRef.current
    if (current.phase === 'picked-up' && current.pointerId !== null) dragCancelRef.current(current.pointerId)
    clearTimer()
  }, [])

  const interactionTitle = nativeDraggable ? title.replace('滑鼠左鍵長按', '拖曳') : title
  return <DutyCard
    duty={duty}
    badges={badges}
    density={density}
    showTitle={showTitle}
    tone={tone}
    className={`${className}${phase === 'pressing' ? ' is-pressing' : ''}${phase === 'picked-up' ? ' is-picked-up' : ''}`.trim()}
    draggable={nativeDraggable}
    data-duty-drag-enabled={canEdit ? 'true' : undefined}
    aria-label={`${duty.title}：${label}；${interactionTitle}`}
    title={interactionTitle}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    onPointerCancel={handlePointerCancel}
    onLostPointerCapture={handleLostPointerCapture}
    onDragStart={handleNativeDragStart}
    onDragEnd={handleNativeDragEnd}
    onClick={handleClick}
  />
}
