import { useMemo } from 'react'
import { buildDutyAuditRows, filterDutyAuditRows, type DutyAuditRow } from '../dutyPlanningPresentation'
import type { DutyPlanningStatusFilter } from '../dutyPlanningRoute'
import type { OrgDirectoryState } from '../types'

const statusOptions: Array<{ id: DutyPlanningStatusFilter; label: string }> = [
  { id: 'no-executor', label: '無執行職位' },
  { id: 'missing-primary-executor', label: '缺少主執行' },
  { id: 'pending-reassignment', label: '待重新分配' },
]

interface DutyAuditViewProps {
  state: OrgDirectoryState
  query: string
  anomalyTypes: DutyPlanningStatusFilter[]
  onQueryChange: (value: string) => void
  onAnomalyTypesChange: (value: DutyPlanningStatusFilter[]) => void
  onClearFilters: () => void
  onSelectDuty: (dutyId: string) => void
}

const laneKeys = ['primary-execute', 'collaborate', 'review', 'countersign'] as const
const laneLabels = { 'primary-execute': '主執行', collaborate: '協作', review: '審核', countersign: '會簽' } as const

function renderAssignments(row: DutyAuditRow, lane: typeof laneKeys[number]) {
  const values = row.assignments[lane]
  if (values.length === 0) return <span className="duty-planning-empty-cell">—</span>
  return <span className="duty-planning-assignment-list">{values.map((value) => <span key={value.id}>{value.label}</span>)}</span>
}

export function DutyAuditView({ state, query, anomalyTypes, onQueryChange, onAnomalyTypesChange, onClearFilters, onSelectDuty }: DutyAuditViewProps) {
  const rows = useMemo(() => filterDutyAuditRows(buildDutyAuditRows(state), { query, anomalyTypes }), [anomalyTypes, query, state])
  const hasFilters = Boolean(query.trim() || anomalyTypes.length)
  return <section className="duty-planning-view duty-planning-audit" aria-labelledby="duty-audit-heading">
    <div className="duty-planning-toolbar">
      <label className="duty-planning-search"><span>搜尋工作執掌</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜尋工作執掌" /></label>
      <fieldset className="duty-planning-status-filter"><legend>規劃狀態</legend>{statusOptions.map((option) => <label key={option.id}><input type="checkbox" checked={anomalyTypes.includes(option.id)} onChange={(event) => onAnomalyTypesChange(event.target.checked ? [...anomalyTypes, option.id] : anomalyTypes.filter((item) => item !== option.id))} />{option.label}</label>)}</fieldset>
      {hasFilters && <button type="button" className="secondary-button duty-planning-clear" onClick={onClearFilters}>清除條件</button>}
    </div>
    <div className="duty-planning-table-wrap"><table className="duty-planning-table"><caption id="duty-audit-heading" className="sr-only">責任盤點</caption><thead><tr><th scope="col">工作執掌</th>{laneKeys.map((lane) => <th scope="col" key={lane}>{laneLabels[lane]}</th>)}<th scope="col">規劃狀態</th></tr></thead><tbody>{rows.map((row) => <tr key={row.dutyId}><th scope="row"><button type="button" className="duty-planning-duty-link" onClick={() => onSelectDuty(row.dutyId)}>{row.dutyTitle}</button></th>{laneKeys.map((lane) => <td key={lane}>{renderAssignments(row, lane)}</td>)}<td>{row.anomalyTypes.length === 0 ? <span className="muted">—</span> : <span className="duty-planning-status-list">{row.anomalyTypes.map((type) => <span key={type}>{statusOptions.find((option) => option.id === type)?.label}</span>)}</span>}</td></tr>)}</tbody></table></div>
    {rows.length === 0 && <div className="duty-planning-empty" role="status">{state.duties.length === 0 ? '目前尚未建立工作執掌' : '沒有符合條件的工作執掌'}</div>}
  </section>
}
