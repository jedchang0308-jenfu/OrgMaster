import { useMemo, type DragEvent } from 'react'
import type { OrganizationCommand } from '../organizationCommands'
import { resolveDutyConfigurationAssignmentCommand } from '../dutyConfiguration'
import { DUTY_CONFIGURATION_DRAG_MIME, serializeDutyConfigurationDragPayload } from '../dutyConfigurationDrag'
import type { DutyConfigurationExactLane } from '../dutyConfigurationRoute'
import type { Duty, OrgDirectoryState, ProcessNodeDutyLink } from '../types'

type ResponsibilityLane = DutyConfigurationExactLane

interface ProcessDutyBridgeProps {
  state: OrgDirectoryState
  processNodeId: string | null
  selectedDutyId: string | null
  selectedPositionId: string | null
  editingEnabled: boolean
  onSelectDuty: (dutyId: string | null) => void
  onSelectPosition: (positionId: string | null) => void
  onCommand: (command: OrganizationCommand) => void
}

const laneLabels: Record<ResponsibilityLane, string> = {
  'primary-execute': '主執行',
  collaborate: '協作',
  review: '審核',
  countersign: '會簽',
}

function linkedDuties(state: OrgDirectoryState, nodeId: string | null) {
  if (!nodeId) return []
  const linkIds = new Set(state.processNodeDutyLinks.filter((link) => link.processNodeId === nodeId).map((link) => link.dutyId))
  return state.duties.filter((duty) => linkIds.has(duty.id))
}

export function ProcessDutyBridge({ state, processNodeId, selectedDutyId, selectedPositionId, editingEnabled, onSelectDuty, onSelectPosition, onCommand }: ProcessDutyBridgeProps) {
  const linked = linkedDuties(state, processNodeId)
  const linkedIds = useMemo(() => new Set(linked.map((duty) => duty.id)), [linked])
  const activeDutyId = selectedDutyId ?? linked[0]?.id ?? null
  const activeDuty = state.duties.find((duty) => duty.id === activeDutyId) ?? null
  const activePosition = state.positions.find((position) => position.id === selectedPositionId && position.status === 'active') ?? null
  const linkDuty = (duty: Duty) => {
    if (!processNodeId) return
    const link: ProcessNodeDutyLink = { id: `process-duty-${crypto.randomUUID()}`, processNodeId, dutyId: duty.id, order: linked.length }
    onCommand({ type: 'LINK_PROCESS_NODE_DUTY', link })
    onSelectDuty(duty.id)
  }
  const assignLane = (lane: ResponsibilityLane) => {
    if (!activeDuty || !activePosition || !editingEnabled) return
    const resolution = resolveDutyConfigurationAssignmentCommand(state, {
      dutyId: activeDuty.id,
      positionId: activePosition.id,
      lane,
      newRelationId: `rel-duty-${crypto.randomUUID()}`,
    })
    if (resolution.status === 'command') onCommand(resolution.command)
  }
  const startLaneDrag = (event: DragEvent<HTMLButtonElement>, duty: Duty, lane: ResponsibilityLane) => {
    if (!editingEnabled) return
    const source = state.dutyPositionRelations.find((relation) => relation.dutyId === duty.id
      && relation.target.kind === 'position'
      && relation.target.positionId === activePosition?.id
      && ((lane === 'primary-execute' && relation.relationType === 'execute' && relation.isPrimaryExecutor)
        || (lane === 'collaborate' && relation.relationType === 'execute' && !relation.isPrimaryExecutor)
        || (lane === 'review' && relation.relationType === 'review')
        || (lane === 'countersign' && relation.relationType === 'countersign')))
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(DUTY_CONFIGURATION_DRAG_MIME, serializeDutyConfigurationDragPayload({
      version: 1,
      dutyId: duty.id,
      lane,
      sourceRelationId: source?.id ?? null,
      newRelationId: `rel-duty-${crypto.randomUUID()}`,
    }))
  }
  return <section className="process-duty-bridge" aria-label="職掌與組織責任連結">
    <header className="process-panel-heading"><span>職掌連結</span><small>{processNodeId ? `${linked.length} 項` : '先選流程節點'}</small></header>
    {!processNodeId && <p className="process-empty">點選左側流程節點後，這裡會顯示其職掌。</p>}
    {processNodeId && <>
      <div className="process-duty-bridge__linked">{linked.length === 0 && <p className="process-empty">尚未連結職掌</p>}{linked.map((duty) => <button type="button" key={duty.id} className={duty.id === activeDutyId ? 'is-active' : undefined} onClick={() => onSelectDuty(duty.id)}>{duty.title}</button>)}</div>
      <div className="process-duty-bridge__all"><span className="process-subheading">加入既有職掌</span>{state.duties.filter((duty) => !linkedIds.has(duty.id)).slice(0, 8).map((duty) => <button type="button" key={duty.id} disabled={!editingEnabled} onClick={() => linkDuty(duty)}>＋ {duty.title}</button>)}{state.duties.filter((duty) => !linkedIds.has(duty.id)).length > 8 && <small>請使用工作執掌清單搜尋更多</small>}{processNodeId && editingEnabled && <button type="button" className="process-add-button" onClick={() => { const dutyId = `duty-${crypto.randomUUID()}`; onCommand({ type: 'CREATE_DUTY_AND_LINK_PROCESS_NODE', duty: { id: dutyId, title: '新工作職掌', description: null }, link: { id: `process-duty-${crypto.randomUUID()}`, processNodeId, dutyId, order: linked.length } }); onSelectDuty(dutyId) }}>＋ 新增並連結職掌</button>}</div>
      <div className="process-duty-bridge__responsibility">
        <span className="process-subheading">指定組織責任</span>
        <select aria-label="選擇責任職位" value={selectedPositionId ?? ''} onChange={(event) => onSelectPosition(event.target.value || null)}><option value="">選擇職位</option>{state.positions.filter((position) => position.status === 'active').map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select>
        {activeDuty && <div className="process-lane-buttons">{(Object.keys(laneLabels) as ResponsibilityLane[]).map((lane) => <button type="button" key={lane} disabled={!editingEnabled} draggable={editingEnabled} onClick={() => assignLane(lane)} onDragStart={(event) => startLaneDrag(event, activeDuty, lane)}>{laneLabels[lane]}</button>)}</div>}
        {activeDuty && activePosition && <small>{activeDuty.title} → {activePosition.title}</small>}
        {activeDuty && !activePosition && <small>拖曳責任類型到右側職位，或先選擇職位後點擊責任類型。</small>}
      </div>
    </>}
  </section>
}
