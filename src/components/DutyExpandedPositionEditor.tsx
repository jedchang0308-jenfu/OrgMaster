import { useEffect, useMemo, useRef } from 'react'
import { dutyResponsibilityColumnForSource, evaluateDutyDrop, type DutyPlacementSource, type DutyPlacementTarget } from '../dutyPlacement'
import type { DutyAnomalyPressPoint } from '../dutyAnomalyPressInteraction'
import { buildDutyExpandedPositionSections, sortDutyMatrixPositions } from '../dutyPlanningPresentation'
import type { Department, Duty, OrgDirectoryState, OrganizationLevel } from '../types'
import { DutyRelationEditorRow } from './DutyRelationEditorRow'

interface DutyExpandedPositionEditorProps {
  state: OrgDirectoryState
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  editingEnabled: boolean
  focusPositionId?: string | null
  dragSource?: DutyPlacementSource | null
  dragCandidate?: { target: DutyPlacementTarget; anchor: HTMLElement } | null
  dropHighlightPositionId?: string | null
  onOpenPlacement: (source: DutyPlacementSource, anchor: HTMLElement) => void
  onPointerDragStart: (source: DutyPlacementSource, pointerId: number, anchor: HTMLElement, point: DutyAnomalyPressPoint) => void
  onPointerDragMove: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragEnd: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragCancel: (pointerId: number) => void
  onSelectDuty: (duty: Duty) => void
  query?: string
  positionQuery?: string
  departmentFilter?: string
}

export function DutyExpandedPositionEditor({
  state,
  departments,
  organizationLevels,
  editingEnabled,
  focusPositionId = null,
  dragSource = null,
  dragCandidate = null,
  dropHighlightPositionId = null,
  onOpenPlacement,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  onPointerDragCancel,
  onSelectDuty,
  query = '',
  positionQuery = '',
  departmentFilter = '',
}: DutyExpandedPositionEditorProps) {
  const sectionRefs = useRef(new Map<string, HTMLElement>())
  const sourceColumn = dragSource ? dutyResponsibilityColumnForSource(state, dragSource) : null
  const positions = useMemo(
    () => sortDutyMatrixPositions(state.positions, departments, state.members, organizationLevels),
    [departments, organizationLevels, state.members, state.positions],
  )
  const sections = useMemo(
    () => buildDutyExpandedPositionSections(state, positions, { dutyQuery: query, positionQuery, departmentId: departmentFilter }),
    [departmentFilter, positionQuery, positions, query, state],
  )

  useEffect(() => {
    if (!focusPositionId) return
    const frame = window.requestAnimationFrame(() => {
      const target = sectionRefs.current.get(focusPositionId)
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.classList.add('is-focus-target')
      window.setTimeout(() => target.classList.remove('is-focus-target'), 1200)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusPositionId, sections])

  const isValidTarget = (positionId: string) => {
    if (!dragSource || !sourceColumn) return false
    return evaluateDutyDrop(state, [], dragSource, { positionId, column: sourceColumn }).kind !== 'reject'
  }

  return (
    <section
      className="duty-expanded-position-editor duty-expanded-position-editor--compact"
      aria-label="全部職位與工作執掌"
      data-duty-scroll-owner="right"
      tabIndex={-1}
    >
      {sections.length === 0 && <p className="duty-expanded-position-editor__empty">目前篩選沒有符合條件的職位。</p>}
      {sections.map((section) => {
        const validTarget = isValidTarget(section.position.id)
        const candidate = dragCandidate?.target.positionId === section.position.id
        const highlighted = dropHighlightPositionId === section.position.id
        const emptyMessage = !section.hasAnyRelation
          ? '尚無職掌'
          : !section.hasVisibleRelation
            ? '沒有符合搜尋的職掌'
            : null
        return <section
          key={section.position.id}
          ref={(element) => {
            if (element) sectionRefs.current.set(section.position.id, element)
            else sectionRefs.current.delete(section.position.id)
          }}
          className={[
            'duty-expanded-position-editor__position',
            validTarget ? 'is-drop-target' : '',
            candidate ? 'is-drop-candidate' : '',
            highlighted ? 'is-drop-success' : '',
          ].filter(Boolean).join(' ')}
          data-duty-drop-position="true"
          data-position-id={section.position.id}
          aria-label={`${section.position.title} 的工作執掌`}
        >
          <header className="duty-expanded-position-editor__position-header">
            <h2>{section.position.title}</h2>
            <span>{section.department?.name ?? departments.find((department) => department.id === section.position.departmentId)?.name ?? '未設定部門'}</span>
          </header>
          {section.groups.map((group) => <div key={group.id} className="duty-expanded-position-editor__group">
            <h3>{group.label}</h3>
            <div className="duty-expanded-position-editor__rows">
              {group.rows.map((row) => {
                const duty = state.duties.find((item) => item.id === row.dutyId)
                if (!duty) return null
                return <DutyRelationEditorRow
                  key={row.relationId}
                  duty={duty}
                  row={row}
                  editingEnabled={editingEnabled}
                  onSelect={() => onSelectDuty(duty)}
                  onOpenPlacement={(anchor) => onOpenPlacement({ kind: 'relation', relationId: row.relationId }, anchor)}
                  onPointerDragStart={onPointerDragStart}
                  onPointerDragMove={onPointerDragMove}
                  onPointerDragEnd={onPointerDragEnd}
                  onPointerDragCancel={onPointerDragCancel}
                />
              })}
            </div>
          </div>)}
          {emptyMessage && <p className="duty-expanded-position-editor__empty-row">{emptyMessage}</p>}
        </section>
      })}
    </section>
  )
}
