import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { deriveDutyAnomalies } from '../duties'
import { dutyResponsibilityColumnForSource, evaluateDutyDrop, type DutyPlacementSource, type DutyPlacementTarget } from '../dutyPlacement'
import type { OrgDirectoryState, Position } from '../types'

interface DutyRelationPlacementMenuProps {
  state: OrgDirectoryState
  source: DutyPlacementSource
  anchor: HTMLElement
  onRequest: (target: DutyPlacementTarget, anchor: HTMLElement) => void
  onCancel: () => void
}

function focusableElements(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
}

export function DutyRelationPlacementMenu({ state, source, anchor, onRequest, onCancel }: DutyRelationPlacementMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const relation = source.kind === 'relation'
    ? state.dutyPositionRelations.find((item) => item.id === source.relationId)
    : null
  const anomaly = source.kind === 'anomaly' ? deriveDutyAnomalies(state).find((item) => item.id === source.anomalyId) : null
  const dutyId = relation?.dutyId ?? anomaly?.dutyId
  const duty = dutyId ? state.duties.find((item) => item.id === dutyId) : null
  const sourcePositionId = relation?.target.kind === 'position' ? relation.target.positionId : null
  const sourceColumn = dutyResponsibilityColumnForSource(state, source)
  const availableTargets = useMemo(() => {
    if (!sourceColumn) return []
    return state.positions
      .filter((position) => position.status === 'active' && position.id !== sourcePositionId)
      .filter((position) => evaluateDutyDrop(state, [], source, { positionId: position.id, column: sourceColumn }).kind !== 'reject')
      .sort((first, second) => first.title.localeCompare(second.title, 'zh-Hant') || first.id.localeCompare(second.id))
  }, [source, sourceColumn, sourcePositionId, state])
  const [targetPositionId, setTargetPositionId] = useState(availableTargets[0]?.id ?? '')
  const rect = anchor.getBoundingClientRect()
  const style = useMemo(() => ({
    left: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 300)),
    top: Math.max(12, Math.min(rect.top, window.innerHeight - 250)),
  }), [rect.right, rect.top])

  useEffect(() => {
    setTargetPositionId(availableTargets[0]?.id ?? '')
  }, [availableTargets])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const select = dialogRef.current?.querySelector<HTMLElement>('select')
      select?.focus()
    })
    const closeOutside = (event: PointerEvent) => {
      if (dialogRef.current && event.target instanceof Node && !dialogRef.current.contains(event.target)) onCancel()
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside, true)
    }
  }, [onCancel])

  useEffect(() => () => {
    if (anchor.isConnected) anchor.focus()
    else document.querySelector<HTMLElement>('.duty-expanded-position-editor')?.focus()
  }, [anchor])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const items = focusableElements(dialogRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const submit = () => {
    if (!sourceColumn || !targetPositionId) return
    onRequest({ positionId: targetPositionId, column: sourceColumn }, anchor)
  }

  if (!duty || !sourceColumn) return null
  const sourceLabel = sourceColumn === 'primary-execute' ? '主責執行'
    : sourceColumn === 'other-execute' ? '共同執行'
      : sourceColumn === 'review' ? '審核'
        : sourceColumn === 'countersign' ? '會簽'
          : '協作'
  const sourcePosition = state.positions.find((position) => position.id === sourcePositionId)
  const sourceContext = source.kind === 'anomaly'
    ? anomaly?.type === 'pending-reassignment' ? '待重新分配' : anomaly?.type === 'no-executor' ? '無執行職位' : '缺少主執行'
    : sourcePosition?.title ?? '目前職位'
  return createPortal(
    <div
      ref={dialogRef}
      className="duty-relation-placement-menu"
      role="dialog"
      aria-modal="false"
      aria-label={`配置「${duty.title}」的${sourceLabel}責任`}
      style={style}
      onKeyDown={handleKeyDown}
    >
      <strong>配置到其他職位</strong>
      <span className="duty-relation-placement-menu__source">{sourceContext} · {sourceLabel}</span>
      {availableTargets.length > 0 ? <>
        <label>
          目標職位
          <select value={targetPositionId} onChange={(event) => setTargetPositionId(event.target.value)}>
            {availableTargets.map((position: Position) => <option key={position.id} value={position.id}>{position.title}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button" onClick={submit}>繼續</button>
      </> : <p className="duty-relation-placement-menu__empty" role="status">目前沒有可用的其他職位。</p>}
      <button type="button" className="duty-relation-placement-menu__cancel" onClick={onCancel}>取消</button>
    </div>,
    document.body,
  )
}
