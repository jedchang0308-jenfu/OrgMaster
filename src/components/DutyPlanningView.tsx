import { useMemo, useState } from 'react'
import { deriveDutyAnomalies, summarizeDutyAnomalies, type DutyAnomaly } from '../duties'
import type { DutyRepairIntent } from '../dutyPlanning'
import type { OrganizationCommand, OrganizationCommandResult } from '../organizationCommands'
import type { OrgDirectoryState } from '../types'
import { DutyCard } from './DutyCard'

interface DutyPlanningViewProps {
  state: OrgDirectoryState
  editingEnabled: boolean
  onCommand: (command: OrganizationCommand) => OrganizationCommandResult
  onSelectDuty: (dutyId: string) => void
}

function anomalyLabel(anomaly: DutyAnomaly) {
  if (anomaly.type === 'pending-reassignment') return '待重新分配'
  if (anomaly.type === 'no-executor') return '無執行職位'
  return '缺少主執行'
}

export function DutyPlanningView({ state, editingEnabled, onCommand, onSelectDuty }: DutyPlanningViewProps) {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'reminder'>('all')
  const anomalies = useMemo(() => deriveDutyAnomalies(state), [state])
  const rows = useMemo(() => state.duties.map((duty) => ({ duty, anomalies: anomalies.filter((anomaly) => anomaly.dutyId === duty.id) })).filter((row) => filter === 'all' || row.anomalies.some((anomaly) => anomaly.severity === filter)), [anomalies, filter, state.duties])
  const positions = state.positions.filter((position) => position.status === 'active').sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'))
  const canEdit = editingEnabled
  const summary = summarizeDutyAnomalies(anomalies)
  const updatePending = (anomaly: DutyAnomaly, resolution: NonNullable<Extract<DutyRepairIntent, { kind: 'pending-reassignment' }>['resolution']>) => {
    if (anomaly.type !== 'pending-reassignment' || !anomaly.relationId) return
    onCommand({ type: 'COMMIT_DUTY_PLANNING_CHANGE', intent: { anomalyId: anomaly.id as `relation:${string}`, kind: 'pending-reassignment', dutyId: anomaly.dutyId, relationId: anomaly.relationId, resolution } })
  }
  const updateGap = (anomaly: DutyAnomaly, targetPositionId: string) => {
    if (!targetPositionId || (anomaly.type !== 'missing-primary-executor' && anomaly.type !== 'no-executor')) return
    onCommand({ type: 'COMMIT_DUTY_PLANNING_CHANGE', intent: { anomalyId: anomaly.id as `duty:${string}:missing-primary` | `duty:${string}:no-executor`, kind: anomaly.type, dutyId: anomaly.dutyId, resolution: { kind: 'set-primary', targetPositionId, newRelationId: `rel-${crypto.randomUUID()}` } } })
  }
  return <section className="duty-planning-view" aria-label="待處理職掌與修復"><div className="duty-view-toolbar"><div><strong>待處理職掌</strong></div><div className="duty-view-toolbar__actions"><select aria-label="待處理程度篩選" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">全部待處理（{summary.anomalyCount}）</option><option value="high">高優先（{summary.anomalies.filter((item) => item.severity === 'high').length}）</option><option value="medium">中優先（{summary.anomalies.filter((item) => item.severity === 'medium').length}）</option><option value="reminder">提醒（{summary.anomalies.filter((item) => item.severity === 'reminder').length}）</option></select></div></div><div className="duty-planner-table"><table className="duty-matrix"><thead><tr><th>工作執掌</th><th>待處理原因</th><th>修復操作</th></tr></thead><tbody>{rows.map(({ duty, anomalies: dutyAnomalies }) => <tr key={duty.id}><th scope="row"><DutyCard duty={duty} density="compact" subtitle={duty.description ?? undefined} onClick={() => onSelectDuty(duty.id)} aria-label={`${duty.title}，開啟工作執掌明細`} title="開啟工作執掌明細" /></th><td><div className="duty-anomaly-list">{dutyAnomalies.length === 0 ? <span className="muted">無</span> : dutyAnomalies.map((anomaly) => <span key={anomaly.id} className={`duty-anomaly duty-anomaly--${anomaly.severity}`}>{anomalyLabel(anomaly)}</span>)}</div></td><td><div className="duty-plan-actions">{dutyAnomalies.length === 0 ? <span className="muted">不需修復</span> : dutyAnomalies.map((anomaly) => <div className="duty-plan-row" key={anomaly.id}><span>{anomalyLabel(anomaly)}</span>{canEdit && anomaly.type === 'pending-reassignment' && <><select aria-label={`${duty.title} ${anomalyLabel(anomaly)}目標`} defaultValue="" onChange={(event) => { if (event.target.value) updatePending(anomaly, { kind: 'assign', targetPositionId: event.target.value }) }}><option value="">選擇目標</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select><button type="button" className="secondary-button" onClick={() => updatePending(anomaly, { kind: 'drop' })}>不再指派</button></>}{canEdit && (anomaly.type === 'missing-primary-executor' || anomaly.type === 'no-executor') && <select aria-label={`${duty.title} ${anomalyLabel(anomaly)}目標`} defaultValue="" onChange={(event) => updateGap(anomaly, event.target.value)}><option value="">選擇目標</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select>}{!canEdit && <small className="muted">唯讀</small>}</div>)}</div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="duty-empty">目前沒有符合篩選條件的職掌。</div>}</div></section>
}
