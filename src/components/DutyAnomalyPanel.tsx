import { useMemo } from 'react'
import type { DutyAnomalyPressPoint } from '../dutyAnomalyPressInteraction'
import { buildDutyAnomalyCategories } from '../dutyPlanningPresentation'
import type { DutyPlacementSource } from '../dutyPlacement'
import type { OrgDirectoryState } from '../types'
import { DutyPendingSourceRow } from './DutyPendingSourceRow'

interface DutyAnomalyPanelProps {
  state: OrgDirectoryState
  canEdit: boolean
  onSelectDuty: (dutyId: string) => void
  onOpenPlacement: (source: DutyPlacementSource, anchor: HTMLElement) => void
  onPointerDragStart: (source: DutyPlacementSource, pointerId: number, anchor: HTMLElement, point: DutyAnomalyPressPoint) => void
  onPointerDragMove: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragEnd: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragCancel: (pointerId: number) => void
}

export function DutyAnomalyPanel({ state, canEdit, onSelectDuty, onOpenPlacement, onPointerDragStart, onPointerDragMove, onPointerDragEnd, onPointerDragCancel }: DutyAnomalyPanelProps) {
  const categories = useMemo(() => buildDutyAnomalyCategories(state), [state])
  return <aside className="duty-anomaly-panel" aria-label="待處理職掌" data-duty-scroll-owner="left">
    {categories.length === 0 && <p className="duty-anomaly-panel__empty">目前沒有待處理職掌。</p>}
    {categories.map((category) => <section key={category.id} className="duty-anomaly-category" aria-labelledby={`duty-anomaly-category-${category.id}`}>
      <h2 id={`duty-anomaly-category-${category.id}`}>{category.label}</h2>
      <div className="duty-anomaly-category__items">
        {category.items.map(({ duty, anomaly, context }) => <DutyPendingSourceRow
          key={anomaly.id}
          duty={duty}
          anomaly={anomaly}
          context={context}
          editingEnabled={canEdit}
          onSelect={() => onSelectDuty(duty.id)}
          onOpenPlacement={(anchor) => onOpenPlacement({ kind: 'anomaly', anomalyId: anomaly.id }, anchor)}
          onPointerDragStart={onPointerDragStart}
          onPointerDragMove={onPointerDragMove}
          onPointerDragEnd={onPointerDragEnd}
          onPointerDragCancel={onPointerDragCancel}
        />)}
      </div>
    </section>)}
  </aside>
}
