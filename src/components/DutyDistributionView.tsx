import { useMemo } from 'react'
import { buildDutyDistributionRows, filterDutyDistributionRows } from '../dutyPlanningPresentation'
import type { OrgDirectoryState } from '../types'

const lanes = ['primary-execute', 'collaborate', 'review', 'countersign'] as const
const labels = { 'primary-execute': '主執行', collaborate: '協作', review: '審核', countersign: '會簽' } as const

interface DutyDistributionViewProps {
  state: OrgDirectoryState
  query: string
  onQueryChange: (value: string) => void
}

export function DutyDistributionView({ state, query, onQueryChange }: DutyDistributionViewProps) {
  const rows = useMemo(() => filterDutyDistributionRows(buildDutyDistributionRows(state), query), [query, state])
  return <section className="duty-planning-view duty-planning-distribution" aria-labelledby="duty-distribution-heading">
    <div className="duty-planning-toolbar"><label className="duty-planning-search"><span>搜尋職位或部門</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜尋職位或部門" /></label>{query.trim() && <button type="button" className="secondary-button duty-planning-clear" onClick={() => onQueryChange('')}>清除條件</button>}</div>
    <div className="duty-planning-table-wrap"><table className="duty-planning-table duty-planning-distribution-table"><caption id="duty-distribution-heading" className="sr-only">責任分布</caption><thead><tr><th scope="col">職位</th><th scope="col">部門</th>{lanes.map((lane) => <th scope="col" key={lane}>{labels[lane]}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.positionId}><th scope="row">{row.positionTitle}</th><td>{row.departmentTitle}</td>{lanes.map((lane) => <td key={lane} className="duty-planning-count">{row.counts[lane]}</td>)}</tr>)}</tbody></table></div>
    {rows.length === 0 && <div className="duty-planning-empty" role="status">{state.positions.filter((position) => position.status === 'active').length === 0 ? '目前尚無可盤點職位' : '沒有符合條件的職位'}</div>}
  </section>
}
