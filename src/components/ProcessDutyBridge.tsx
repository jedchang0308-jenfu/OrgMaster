import { useLayoutEffect, useMemo, useRef, type DragEvent, type KeyboardEvent } from 'react'
import type { OrganizationCommand } from '../organizationCommands'
import { resolveDutyConfigurationAssignmentCommand } from '../dutyConfiguration'
import type { DutyConfigurationExactLane } from '../dutyConfigurationRoute'
import type { Duty, OrgDirectoryState, ProcessNodeDutyLink } from '../types'
import { WORKSPACE_ENTITY_DRAG_MIME, writeWorkspaceEntityDrag, type RegisteredDropTarget, type WorkspaceEntityDragPayloadV1 } from '../workspace/entityDrag'
import type { RelationPlacementInputMode } from '../workspace/relationPlacement'
import type { WorkspaceModuleId } from '../workspace/types'

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
  relatedDutyIds?: ReadonlySet<string>
  workspaceEntityDragSource?: WorkspaceModuleId
  onRelationBegin?: (payload: WorkspaceEntityDragPayloadV1, inputMode: RelationPlacementInputMode, source?: HTMLElement | null) => void
  onRelationPreview?: (target: RegisteredDropTarget, event?: DragEvent<HTMLElement>) => void
  onRelationCommit?: (target: RegisteredDropTarget, dataTransfer?: DataTransfer) => void
  onRelationCancel?: () => void
}

const laneLabels: Record<ResponsibilityLane, string> = {
  'primary-execute': '主執行',
  collaborate: '協作',
  review: '審核',
  countersign: '會簽',
}

function dutyFocusKey(kind: 'linked' | 'available', dutyId: string) {
  return `${kind}:${encodeURIComponent(dutyId)}`
}

function linkedDuties(state: OrgDirectoryState, nodeId: string | null) {
  if (!nodeId) return []
  const linkIds = new Set(state.processNodeDutyLinks.filter((link) => link.processNodeId === nodeId).map((link) => link.dutyId))
  return state.duties.filter((duty) => linkIds.has(duty.id))
}

export function ProcessDutyBridge({ state, processNodeId, selectedDutyId, selectedPositionId, editingEnabled, onSelectDuty, onSelectPosition, onCommand, relatedDutyIds = new Set<string>(), workspaceEntityDragSource, onRelationBegin, onRelationPreview, onRelationCommit, onRelationCancel }: ProcessDutyBridgeProps) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const pendingFocusRef = useRef<string | null>(null)
  const linked = linkedDuties(state, processNodeId)
  const linkedIds = useMemo(() => new Set(linked.map((duty) => duty.id)), [linked])
  const activeDutyId = selectedDutyId ?? linked[0]?.id ?? null
  const activeDuty = state.duties.find((duty) => duty.id === activeDutyId) ?? null
  const activePosition = state.positions.find((position) => position.id === selectedPositionId && position.status === 'active') ?? null
  const relationTargetEnabled = editingEnabled && Boolean(onRelationPreview && onRelationCommit)
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    const target = Array.from(sectionRef.current?.querySelectorAll<HTMLButtonElement>('[data-process-duty-focus]') ?? [])
      .find((button) => button.dataset.processDutyFocus === pending)
    if (!target) return
    pendingFocusRef.current = null
    target.focus()
  })
  const linkDuty = (duty: Duty) => {
    if (!processNodeId || !editingEnabled) return
    pendingFocusRef.current = dutyFocusKey('linked', duty.id)
    const link: ProcessNodeDutyLink = { id: `process-duty-${crypto.randomUUID()}`, processNodeId, dutyId: duty.id, order: linked.length }
    onCommand({ type: 'LINK_PROCESS_NODE_DUTY', link })
    onSelectDuty(duty.id)
  }
  const unlinkDuty = (dutyId: string) => {
    if (!processNodeId || !editingEnabled) return
    const link = state.processNodeDutyLinks.find((candidate) => candidate.processNodeId === processNodeId && candidate.dutyId === dutyId)
    if (!link) return
    pendingFocusRef.current = dutyFocusKey('available', dutyId)
    onCommand({ type: 'UNLINK_PROCESS_NODE_DUTY', linkId: link.id })
    if (activeDutyId === dutyId) onSelectDuty(linked.find((duty) => duty.id !== dutyId)?.id ?? null)
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
    if (!editingEnabled || !workspaceEntityDragSource || !onRelationBegin) return
    event.stopPropagation()
    // This source creates a cross-panel relation, so keep the native HTML5
    // operation aligned with ProcessNode targets (`dropEffect = 'link'`).
    // A mismatched `copy`/`link` contract can make Chromium suppress the
    // terminal `drop` event even though dragover is observed.
    event.dataTransfer.effectAllowed = 'link'
    const relationPayload: WorkspaceEntityDragPayloadV1 = {
      version: 1,
      kind: 'duty',
      sourceModuleId: workspaceEntityDragSource,
      dutyId: duty.id,
      lane,
      sourceRelationId: null,
    }
    writeWorkspaceEntityDrag(event.dataTransfer, relationPayload)
    onRelationBegin(relationPayload, 'native-drag', event.currentTarget)
  }
  const previewDutyTarget = (event: DragEvent<HTMLElement>, dutyId: string) => {
    if (!relationTargetEnabled || !onRelationPreview || !Array.from(event.dataTransfer.types).includes(WORKSPACE_ENTITY_DRAG_MIME)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'link'
    onRelationPreview({ kind: 'duty', dutyId }, event)
  }
  const commitDutyTarget = (event: DragEvent<HTMLElement>, dutyId: string) => {
    if (!relationTargetEnabled || !onRelationCommit || !Array.from(event.dataTransfer.types).includes(WORKSPACE_ENTITY_DRAG_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    onRelationCommit({ kind: 'duty', dutyId }, event.dataTransfer)
  }
  return <section ref={sectionRef} className="process-duty-bridge" aria-label="職掌與組織責任連結">
    <header className="process-panel-heading"><span>職掌連結</span><small>{processNodeId ? `${linked.length} 項` : '先選流程節點'}</small></header>
    {!processNodeId && <p className="process-empty">點選左側流程節點後，這裡會顯示其職掌。</p>}
    {processNodeId && <>
      <div className="process-duty-bridge__linked">{linked.length === 0 && <p className="process-empty">尚未連結職掌</p>}{linked.map((duty) => <div className="process-duty-bridge__linked-row" key={duty.id}><button type="button" data-process-duty-focus={dutyFocusKey('linked', duty.id)} data-relation-placement-target={relationTargetEnabled ? 'duty' : undefined} data-duty-id={relationTargetEnabled ? duty.id : undefined} tabIndex={relationTargetEnabled ? 0 : undefined} aria-label={relationTargetEnabled ? `職掌${duty.title}，可放置流程節點` : undefined} className={`process-duty-bridge__linked-select ${duty.id === activeDutyId ? 'is-active' : ''}${relatedDutyIds.has(duty.id) ? ' is-related' : ''}`} onClick={() => onSelectDuty(duty.id)} onDragOver={(event) => previewDutyTarget(event, duty.id)} onDrop={(event) => commitDutyTarget(event, duty.id)}>{duty.title}</button><button type="button" className="process-duty-bridge__unlink" aria-label={`解除 ${duty.title} 與目前流程節點的連結`} disabled={!editingEnabled} onClick={() => unlinkDuty(duty.id)}>解除</button></div>)}</div>
      <div className="process-duty-bridge__all"><span className="process-subheading">加入既有職掌</span>{state.duties.filter((duty) => !linkedIds.has(duty.id)).slice(0, 8).map((duty) => <button type="button" data-process-duty-focus={dutyFocusKey('available', duty.id)} data-relation-placement-target={relationTargetEnabled ? 'duty' : undefined} data-duty-id={relationTargetEnabled ? duty.id : undefined} tabIndex={relationTargetEnabled ? 0 : undefined} aria-label={relationTargetEnabled ? `職掌${duty.title}，可放置流程節點` : undefined} key={duty.id} disabled={!editingEnabled} onClick={() => linkDuty(duty)} onDragOver={(event) => previewDutyTarget(event, duty.id)} onDrop={(event) => commitDutyTarget(event, duty.id)}>＋ {duty.title}</button>)}{state.duties.filter((duty) => !linkedIds.has(duty.id)).length > 8 && <small>請使用工作執掌清單搜尋更多</small>}{processNodeId && editingEnabled && <button type="button" className="process-add-button" onClick={() => { const dutyId = `duty-${crypto.randomUUID()}`; onCommand({ type: 'CREATE_DUTY_AND_LINK_PROCESS_NODE', duty: { id: dutyId, title: '新工作職掌', description: null }, link: { id: `process-duty-${crypto.randomUUID()}`, processNodeId, dutyId, order: linked.length } }); onSelectDuty(dutyId) }}>＋ 新增並連結職掌</button>}</div>
      <div className="process-duty-bridge__responsibility">
        <span className="process-subheading">指定組織責任</span>
        <select aria-label="選擇責任職位" value={selectedPositionId ?? ''} onChange={(event) => onSelectPosition(event.target.value || null)}><option value="">選擇職位</option>{state.positions.filter((position) => position.status === 'active').map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select>
        {activeDuty && <div className="process-lane-buttons">{(Object.keys(laneLabels) as ResponsibilityLane[]).map((lane) => <button type="button" key={lane} disabled={!editingEnabled} draggable={editingEnabled && Boolean(onRelationBegin)} data-relation-placement-source-kind="duty" data-duty-id={activeDuty.id} data-duty-lane={lane} onClick={() => assignLane(lane)} onDragStart={(event) => startLaneDrag(event, activeDuty, lane)} onDragEnd={onRelationCancel} onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { if (!editingEnabled || !onRelationBegin || !workspaceEntityDragSource || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); const relationPayload: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'duty', sourceModuleId: workspaceEntityDragSource, dutyId: activeDuty.id, lane, sourceRelationId: null }; onRelationBegin(relationPayload, 'keyboard', event.currentTarget) }}>{laneLabels[lane]}</button>)}</div>}
        {activeDuty && activePosition && <small>{activeDuty.title} → {activePosition.title}</small>}
        {activeDuty && !activePosition && <small>拖曳責任類型到右側職位，或先選擇職位後點擊責任類型。</small>}
      </div>
    </>}
  </section>
}
