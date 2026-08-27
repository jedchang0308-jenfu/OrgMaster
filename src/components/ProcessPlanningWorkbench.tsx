import { ReactFlowProvider } from '@xyflow/react'
import { useMemo, useState, type DragEvent } from 'react'
import { dutyConfigurationIssueMessage, resolveDutyConfigurationAssignmentCommand } from '../dutyConfiguration'
import { DUTY_CONFIGURATION_DRAG_MIME, parseDutyConfigurationDragPayload } from '../dutyConfigurationDrag'
import { buildProcessPlanningUrl, type ProcessPlanningLocation, type ProcessPlanningView } from '../processPlanningRoute'
import { canMutateProcessPlanning } from '../processPlanningCapability'
import type { OrganizationCommand } from '../organizationCommands'
import type { OrgDirectoryState } from '../types'
import { ProcessPlanningCanvas } from './ProcessPlanningCanvas'
import { ProcessDutyBridge } from './ProcessDutyBridge'

interface ProcessPlanningWorkbenchProps {
  state: OrgDirectoryState
  location: ProcessPlanningLocation
  editingEnabled: boolean
  serverReady: boolean
  recoveryOpen: boolean
  mobileReadOnly: boolean
  onCommand: (command: OrganizationCommand) => void
  onNavigate: (url: string) => void
  onClose: () => void
}

export function ProcessPlanningWorkbench({ state, location, editingEnabled, serverReady, recoveryOpen, mobileReadOnly, onCommand, onNavigate, onClose }: ProcessPlanningWorkbenchProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(location.processNodeId)
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(location.dutyId)
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [dropNotice, setDropNotice] = useState<string | null>(null)
  const writable = canMutateProcessPlanning({ editingEnabled, serverReady, recoveryOpen, mobileReadOnly, viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth })
  const processes = useMemo(() => [...state.processes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), [state.processes])
  const activeProcess = processes.find((process) => process.id === location.processId) ?? processes[0] ?? null
  const nodes = useMemo(() => activeProcess ? state.processNodes.filter((node) => node.processId === activeProcess.id) : [], [activeProcess, state.processNodes])
  const edges = useMemo(() => activeProcess ? state.processEdges.filter((edge) => edge.processId === activeProcess.id) : [], [activeProcess, state.processEdges])
  const navigate = (next: Partial<Pick<ProcessPlanningLocation, 'view' | 'processId' | 'processNodeId' | 'dutyId'>>) => onNavigate(buildProcessPlanningUrl({ view: next.view ?? location.view, processId: next.processId === undefined ? location.processId : next.processId, processNodeId: next.processNodeId === undefined ? location.processNodeId : next.processNodeId, dutyId: next.dutyId === undefined ? location.dutyId : next.dutyId }))
  const selectNode = (nodeId: string) => { setSelectedNodeId(nodeId); setSelectedDutyId(null); navigate({ processNodeId: nodeId, dutyId: null }) }
  const selectDuty = (dutyId: string | null) => { setSelectedDutyId(dutyId); navigate({ dutyId }) }
  const selectPosition = (positionId: string | null) => setSelectedPositionId(positionId)
  const handleDutyDrop = (positionId: string, event: DragEvent<HTMLButtonElement>) => {
    if (!writable) return
    const payload = parseDutyConfigurationDragPayload(event.dataTransfer.getData(DUTY_CONFIGURATION_DRAG_MIME))
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    const resolution = resolveDutyConfigurationAssignmentCommand(state, {
      dutyId: payload.dutyId,
      positionId,
      lane: payload.lane,
      sourceRelationId: payload.sourceRelationId,
      newRelationId: payload.newRelationId,
    })
    if (resolution.status === 'command') {
      onCommand(resolution.command)
      setSelectedDutyId(payload.dutyId)
      setSelectedPositionId(positionId)
      setDropNotice('已配置責任')
      return
    }
    setDropNotice(resolution.status === 'noop' ? '此責任已存在' : dutyConfigurationIssueMessage(resolution.code))
  }
  return <main className="process-planning-page" aria-label="流程與職掌規劃工作台">
    <header className="process-planning-page__header"><div><span className="eyebrow">流程規劃</span><h1>流程 × 工作職掌 × 組織責任</h1></div><div className="process-planning-page__actions"><span className={`process-capability-pill${writable ? ' is-writable' : ''}`}>{writable ? '可編輯' : '唯讀'}</span><button type="button" className="secondary-button" onClick={onClose}>← 返回組織圖</button></div></header>
    <nav className="process-planning-tabs" aria-label="流程規劃視角"><button type="button" className={location.view === 'mindmap' ? 'is-active' : undefined} onClick={() => navigate({ view: 'mindmap' })}>責任心智圖</button><button type="button" className={location.view === 'flow' ? 'is-active' : undefined} onClick={() => navigate({ view: 'flow' })}>流程圖</button></nav>
    <div className="process-planning-grid">
      <aside className="process-planning-processes" aria-label="流程清單"><header className="process-panel-heading"><span>流程清單</span><small>{processes.length} 個</small></header>{processes.map((process) => <button type="button" key={process.id} className={process.id === activeProcess?.id ? 'is-active' : undefined} onClick={() => { setSelectedNodeId(null); setSelectedDutyId(null); navigate({ processId: process.id, processNodeId: null, dutyId: null }) }}><strong>{process.title}</strong><small>{state.processNodes.filter((node) => node.processId === process.id).length} 節點</small></button>)}{writable && <button type="button" className="process-add-button" onClick={() => { const id = `process-${crypto.randomUUID()}`; onCommand({ type: 'CREATE_PROCESS', process: { id, title: '新流程', description: null, order: processes.length } }); setSelectedNodeId(null); setSelectedDutyId(null); navigate({ processId: id, processNodeId: null, dutyId: null }) }}>＋ 新增流程</button>}{processes.length === 0 && <p className="process-empty">尚未建立流程，先新增一個流程再開始繪製。</p>}</aside>
      <section className="process-planning-graph-panel"><header className="process-panel-heading"><span>{activeProcess?.title ?? '未選擇流程'}</span><span>{activeProcess && writable && <button type="button" className="process-add-inline" onClick={() => { const id = `process-node-${crypto.randomUUID()}`; onCommand({ type: 'CREATE_PROCESS_NODE', node: { id, processId: activeProcess.id, title: '新流程節點', parentNodeId: null, order: nodes.filter((node) => node.parentNodeId === null).length } }); selectNode(id) }}>＋ 節點</button>}<small>{location.view === 'mindmap' ? '由父子節點呈現' : '由流程連線呈現'}</small></span></header><ReactFlowProvider><ProcessPlanningCanvas nodes={nodes} edges={edges} mode={location.view} selectedNodeId={selectedNodeId} onSelectNode={selectNode} /></ReactFlowProvider></section>
      <ProcessDutyBridge state={state} processNodeId={selectedNodeId} selectedDutyId={selectedDutyId} selectedPositionId={selectedPositionId} editingEnabled={writable} onSelectDuty={selectDuty} onSelectPosition={selectPosition} onCommand={onCommand} />
      <aside className="process-planning-org-panel" aria-label="組織職位"><header className="process-panel-heading"><span>組織責任視角</span><small>{selectedPositionId ? '已選職位' : '拖曳責任到職位'}</small></header>{dropNotice && <p className="process-drop-notice" role="status">{dropNotice}</p>}{state.departments.map((department) => { const positions = state.positions.filter((position) => position.status === 'active' && position.departmentId === department.id); if (!positions.length) return null; return <section key={department.id} className="process-org-group"><h2>{department.name}</h2>{positions.map((position) => <button type="button" key={position.id} className={position.id === selectedPositionId ? 'is-active' : undefined} onClick={() => selectPosition(position.id)} onDragOver={(event) => { if (!writable || !Array.from(event.dataTransfer.types).includes(DUTY_CONFIGURATION_DRAG_MIME)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={(event) => handleDutyDrop(position.id, event)}><span>{position.title}</span><small>{state.dutyPositionRelations.filter((relation) => relation.target.kind === 'position' && relation.target.positionId === position.id).length} 職掌</small></button>)}</section> })}</aside>
    </div>
  </main>
}
