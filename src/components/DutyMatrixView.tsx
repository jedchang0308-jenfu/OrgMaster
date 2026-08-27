import { useMemo, useState } from 'react'
import { dutyMatrixColumnForResponsibilityColumn, dutyResponsibilityColumnForSource, evaluateDutyDrop, type DutyMatrixColumn, type DutyPlacementSource, type DutyPlacementTarget } from '../dutyPlacement'
import { buildDutyMatrixRows, sortDutyMatrixPositions } from '../dutyPlanningPresentation'
import type { Department, Duty, OrgDirectoryState, OrganizationLevel } from '../types'
import type { DutyAnomalyPressPoint } from '../dutyAnomalyPressInteraction'
import { dutyRelationLabels } from './DutyDetailDrawer'
import { DutyCardDragSurface } from './DutyCardDragSurface'

interface DutyMatrixViewProps {
  state: OrgDirectoryState
  departments: Department[]
  organizationLevels: OrganizationLevel[]
  editingEnabled: boolean
  focusPositionId?: string | null
  dragSource?: DutyPlacementSource | null
  dragSessionMode?: 'native' | 'pointer' | null
  dragCandidate?: { target: DutyPlacementTarget; anchor: HTMLElement } | null
  onDragStart?: (source: DutyPlacementSource) => void
  onDragEnd?: () => void
  onRequestDrop?: (source: DutyPlacementSource, target: DutyPlacementTarget, anchor: HTMLElement) => void
  onPointerDragStart: (source: DutyPlacementSource, pointerId: number, anchor: HTMLElement, point: DutyAnomalyPressPoint) => void
  onPointerDragMove: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragEnd: (pointerId: number, point: DutyAnomalyPressPoint) => void
  onPointerDragCancel: (pointerId: number) => void
  matrixTitle?: string
  onOpenMatrix?: () => void
  onSelectDuty: (duty: Duty) => void
  query?: string
  positionQuery?: string
  departmentFilter?: string
  onQueryChange?: (value: string) => void
  onPositionQueryChange?: (value: string) => void
  onDepartmentFilterChange?: (value: string) => void
  showToolbar?: boolean
}

const columns: Array<{ id: DutyMatrixColumn; label: string }> = [
  { id: 'execute', label: '執行' },
  { id: 'review', label: '審核' },
]

export function DutyMatrixView({ state, departments, organizationLevels, editingEnabled, focusPositionId, dragSource = null, dragSessionMode = null, dragCandidate = null, onDragStart, onDragEnd, onRequestDrop, onPointerDragStart, onPointerDragMove, onPointerDragEnd, onPointerDragCancel, matrixTitle = '職掌矩陣', onOpenMatrix, onSelectDuty, query: controlledQuery, positionQuery: controlledPositionQuery, departmentFilter: controlledDepartmentFilter, onQueryChange, onPositionQueryChange, onDepartmentFilterChange, showToolbar = true }: DutyMatrixViewProps) {
  const [internalQuery, setInternalQuery] = useState('')
  const [internalPositionQuery, setInternalPositionQuery] = useState('')
  const [internalDepartmentFilter, setInternalDepartmentFilter] = useState('')
  const query = controlledQuery ?? internalQuery
  const positionQuery = controlledPositionQuery ?? internalPositionQuery
  const departmentFilter = controlledDepartmentFilter ?? internalDepartmentFilter
  const updateQuery = onQueryChange ?? setInternalQuery
  const updatePositionQuery = onPositionQueryChange ?? setInternalPositionQuery
  const updateDepartmentFilter = onDepartmentFilterChange ?? setInternalDepartmentFilter
  const positions = useMemo(
    () => sortDutyMatrixPositions(state.positions, departments, state.members, organizationLevels),
    [departments, organizationLevels, state.members, state.positions],
  )
  const normalizedPositionQuery = positionQuery.trim().toLocaleLowerCase('zh-Hant')
  const filteredPositions = positions.filter((position) => (!normalizedPositionQuery || position.title.toLocaleLowerCase('zh-Hant').includes(normalizedPositionQuery)) && (!departmentFilter || position.departmentId === departmentFilter) && (!focusPositionId || position.id === focusPositionId || state.dutyPositionRelations.some((relation) => relation.target.kind === 'position' && relation.target.positionId === position.id && state.duties.some((duty) => duty.id === relation.dutyId))))
  const duties = state.duties.filter((duty) => `${duty.title} ${duty.description ?? ''}`.toLocaleLowerCase('zh-Hant').includes(query.trim().toLocaleLowerCase('zh-Hant')))
  const chips = useMemo(() => buildDutyMatrixRows(state, filteredPositions), [filteredPositions, state])
  const chipsFor = (positionId: string, column: DutyMatrixColumn) => chips.filter((chip) => chip.positionId === positionId && chip.matrixColumn === column)
  const sourceColumn = dragSource ? dutyResponsibilityColumnForSource(state, dragSource) : null
  const canEdit = editingEnabled

  // Native drag remains accepted for compatibility, but visible matrix cards
  // use the same pointer long-press surface as anomaly cards. This keeps
  // click-to-open and press-to-move deterministic across desktop browsers.
  const canDrop = (target: DutyPlacementTarget) => {
    if (dragSessionMode === 'pointer' || !dragSource) return false
    return evaluateDutyDrop(state, [], dragSource, target).kind !== 'reject'
  }
  const isCandidate = (target: DutyPlacementTarget) => dragSessionMode === 'pointer' && dragCandidate?.target.positionId === target.positionId && dragCandidate.target.column === target.column

  const renderCard = (chip: ReturnType<typeof buildDutyMatrixRows>[number]) => {
    const duty = state.duties.find((item) => item.id === chip.dutyId)
    if (!duty) return null
    const rawSource: DutyPlacementSource = { kind: 'relation', relationId: chip.relationId }
    const source = rawSource
    const label = chip.column === 'primary-execute' ? '執行（主責）' : chip.column === 'collaborate' ? '執行（協作）' : dutyRelationLabels[chip.relationType]
    const badges = chip.column === 'primary-execute'
      ? [{ label: '主責', tone: 'info' as const }]
      : chip.column === 'collaborate'
        ? [{ label: '協作' }]
        : chip.column === 'review'
          ? [{ label: '審核' }]
          : chip.column === 'countersign'
            ? [{ label: '會簽', tone: 'warning' as const }]
            : []
    return <div className="duty-card-wrap" key={`${chip.dutyId}-${chip.relationId}`}>
      <DutyCardDragSurface
        duty={duty}
        source={source}
        canEdit={canEdit && chip.draggable}
        badges={badges}
        density="compact"
        label={label}
        onPointerDragStart={onPointerDragStart}
        onPointerDragMove={onPointerDragMove}
        onPointerDragEnd={onPointerDragEnd}
        onPointerDragCancel={onPointerDragCancel}
        onSelect={() => onSelectDuty(duty)}
        aria-label={`${duty.title}，${label}，開啟工作執掌明細`}
        title={`單擊開啟工作執掌明細；滑鼠左鍵長按可移動此${label}`}
      />
    </div>
  }

  return (
    <section className="duty-matrix-view" aria-label="工作執掌矩陣">
      {showToolbar && <div className="duty-view-toolbar"><div>{onOpenMatrix ? <a className="duty-matrix-title-link" href="/duty-planning/matrix" onClick={(event) => { event.preventDefault(); onOpenMatrix() }}><strong>{matrixTitle}</strong></a> : <strong>{matrixTitle}</strong>}</div><div className="duty-view-toolbar__actions"><input aria-label="搜尋工作執掌" placeholder="搜尋執掌" value={query} onChange={(event) => updateQuery(event.target.value)} /><input aria-label="搜尋職位" placeholder="搜尋職位" value={positionQuery} onChange={(event) => updatePositionQuery(event.target.value)} /><select aria-label="依部門篩選" value={departmentFilter} onChange={(event) => updateDepartmentFilter(event.target.value)}><option value="">全部部門</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div></div>}
      {focusPositionId && <div className="duty-filter-note">已聚焦職位：{state.positions.find((position) => position.id === focusPositionId)?.title ?? focusPositionId} · <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('orgmaster-duty-clear-focus'))}>清除聚焦</button></div>}
      <div className="duty-matrix-scroll"><table className="duty-matrix"><thead><tr><th>職位</th>{columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr></thead><tbody>{filteredPositions.map((position) => <tr key={position.id} className={position.id === focusPositionId ? 'is-focused' : undefined}><th scope="row"><span>{position.title}</span><small>{departments.find((department) => department.id === position.departmentId)?.name ?? '未設定部門'}</small></th>{columns.map((column) => { const exactColumn = sourceColumn && dutyMatrixColumnForResponsibilityColumn(sourceColumn) === column.id ? sourceColumn : null; const target = exactColumn ? { positionId: position.id, column: exactColumn } : null; const targetCanDrop = Boolean(target && canDrop(target)); const candidate = Boolean(target && isCandidate(target)); return <td key={column.id} data-duty-drop-cell="true" data-position-id={position.id} data-matrix-column={column.id} data-responsibility-column={exactColumn ?? undefined} className={`${targetCanDrop ? 'is-drop-target ' : ''}${candidate ? 'is-drop-candidate' : ''}`.trim() || undefined} onDragOver={(event) => { if (targetCanDrop) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); if (dragSource && target && targetCanDrop && event.currentTarget instanceof HTMLElement) onRequestDrop?.(dragSource, target, event.currentTarget); onDragEnd?.() }}><div className="duty-matrix-cell" aria-label={`${position.title} ${column.label}`}>{chipsFor(position.id, column.id).filter((chip) => duties.some((duty) => duty.id === chip.dutyId)).map(renderCard)}</div></td> })}</tr>)}</tbody></table>{filteredPositions.length === 0 && <div className="duty-empty">目前篩選沒有職位資料。</div>}</div>
    </section>
  )
}
