import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { dutyConfigurationIssueMessage, resolveDutyConfigurationAssignmentCommand } from '../dutyConfiguration'
import {
  beginDutyConfigurationDrop,
  cancelDutyConfigurationDrag,
  createDutyConfigurationDragState,
  DUTY_CONFIGURATION_DRAG_MIME,
  parseDutyConfigurationDragPayload,
  startDutyConfigurationDrag,
  updateDutyConfigurationDragCandidate,
  type DutyConfigurationDragPayload,
  type DutyConfigurationDragState,
} from '../dutyConfigurationDrag'
import { buildProcessPlanningUrl, type ProcessPlanningLocation } from '../processPlanningRoute'
import { canMutateProcessPlanning } from '../processPlanningCapability'
import { resolveProcessPlanningHighlights } from '../processPlanning'
import type { OrganizationCommand } from '../organizationCommands'
import type { OrgDirectoryState } from '../types'
import { ProcessPlanningCanvas } from './ProcessPlanningCanvas'
import { ProcessDutyBridge } from './ProcessDutyBridge'
import { ProcessOrganizationCanvas } from './ProcessOrganizationCanvas'

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

function activeDragPayload(state: DutyConfigurationDragState): DutyConfigurationDragPayload | null {
  return state.phase === 'native-dragging' || state.phase === 'keyboard-grabbed' || state.phase === 'committing' ? state.payload : null
}

export function ProcessPlanningWorkbench({ state, location, editingEnabled, serverReady, recoveryOpen, mobileReadOnly, onCommand, onNavigate, onClose }: ProcessPlanningWorkbenchProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(location.processNodeId)
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(location.dutyId)
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [dropNotice, setDropNotice] = useState<string | null>(null)
  const [dutyDragState, setDutyDragState] = useState<DutyConfigurationDragState>(() => createDutyConfigurationDragState())
  const [processTitleDraft, setProcessTitleDraft] = useState('')
  const [nodeTitleDraft, setNodeTitleDraft] = useState('')
  const [edgeSourceId, setEdgeSourceId] = useState('')
  const [edgeTargetId, setEdgeTargetId] = useState('')
  const [organizationProjectionVisible, setOrganizationProjectionVisible] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1101)
  const writable = canMutateProcessPlanning({ editingEnabled, serverReady, recoveryOpen, mobileReadOnly, viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth })
  const processes = useMemo(() => [...state.processes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), [state.processes])
  const activeProcess = processes.find((process) => process.id === location.processId) ?? processes[0] ?? null
  const nodes = useMemo(() => activeProcess ? state.processNodes.filter((node) => node.processId === activeProcess.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) : [], [activeProcess, state.processNodes])
  const edges = useMemo(() => activeProcess ? state.processEdges.filter((edge) => edge.processId === activeProcess.id) : [], [activeProcess, state.processEdges])
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedPosition = state.positions.find((position) => position.id === selectedPositionId && position.status === 'active') ?? null
  const highlights = useMemo(() => resolveProcessPlanningHighlights(state, {
    processId: activeProcess?.id ?? null,
    processNodeId: selectedNodeId,
    dutyId: selectedDutyId,
    positionId: selectedPositionId,
  }), [activeProcess?.id, selectedDutyId, selectedNodeId, selectedPositionId, state])

  useEffect(() => {
    setSelectedNodeId(location.processNodeId)
    setSelectedDutyId(location.dutyId)
  }, [location.dutyId, location.processNodeId])
  useEffect(() => setProcessTitleDraft(activeProcess?.title ?? ''), [activeProcess?.id, activeProcess?.title])
  useEffect(() => setNodeTitleDraft(selectedNode?.title ?? ''), [selectedNode?.id, selectedNode?.title])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDutyDragState(cancelDutyConfigurationDrag())
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(min-width: 1101px)')
    const update = () => setOrganizationProjectionVisible(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const navigate = (next: Partial<Pick<ProcessPlanningLocation, 'view' | 'processId' | 'processNodeId' | 'dutyId'>>) => onNavigate(buildProcessPlanningUrl({ view: next.view ?? location.view, processId: next.processId === undefined ? location.processId : next.processId, processNodeId: next.processNodeId === undefined ? location.processNodeId : next.processNodeId, dutyId: next.dutyId === undefined ? location.dutyId : next.dutyId }))
  const selectNode = (nodeId: string) => { setSelectedNodeId(nodeId); setSelectedDutyId(null); navigate({ processNodeId: nodeId, dutyId: null }) }
  const selectDuty = (dutyId: string | null) => { setSelectedDutyId(dutyId); navigate({ dutyId }) }
  const selectPosition = (positionId: string | null) => setSelectedPositionId(positionId)

  const commitDutyPayload = (positionId: string, payload: DutyConfigurationDragPayload) => {
    if (!writable) return
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
    } else setDropNotice(resolution.status === 'noop' ? '此責任已存在' : dutyConfigurationIssueMessage(resolution.code))
    setDutyDragState(cancelDutyConfigurationDrag())
  }
  const handleDutyDrop = (positionId: string, event: DragEvent<HTMLElement>) => {
    if (!writable) return
    const payload = parseDutyConfigurationDragPayload(event.dataTransfer.getData(DUTY_CONFIGURATION_DRAG_MIME))
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    setDutyDragState((current) => beginDutyConfigurationDrop(current.phase === 'idle' ? startDutyConfigurationDrag(payload, 'native') : current, positionId))
    commitDutyPayload(positionId, payload)
  }
  const handleDutyDragOver = (positionId: string, event: DragEvent<HTMLElement>) => {
    if (!writable) return
    const payload = activeDragPayload(dutyDragState) ?? parseDutyConfigurationDragPayload(event.dataTransfer.getData(DUTY_CONFIGURATION_DRAG_MIME))
    if (!payload) return
    event.preventDefault()
    const resolution = resolveDutyConfigurationAssignmentCommand(state, { dutyId: payload.dutyId, positionId, lane: payload.lane, sourceRelationId: payload.sourceRelationId, newRelationId: payload.newRelationId })
    const kind = resolution.status === 'command' ? 'command' : resolution.status === 'noop' ? 'noop' : 'invalid'
    setDutyDragState((current) => updateDutyConfigurationDragCandidate(current.phase === 'idle' ? startDutyConfigurationDrag(payload, 'native') : current, positionId, kind))
  }
  const startDutyDrag = (payload: DutyConfigurationDragPayload, mode: 'native' | 'keyboard') => {
    if (!writable) return
    setDutyDragState(startDutyConfigurationDrag(payload, mode))
    setDropNotice(mode === 'keyboard' ? '已抓取責任，請在組織圖職位按 Enter 放置；Esc 取消' : null)
  }
  const keyboardDropPositionId = dutyDragState.phase === 'keyboard-grabbed' ? dutyDragState.candidatePositionId : null
  const handleKeyboardDrop = (positionId: string) => {
    const payload = activeDragPayload(dutyDragState)
    if (!payload || dutyDragState.phase !== 'keyboard-grabbed') return
    commitDutyPayload(positionId, payload)
  }
  const handleKeyboardFocus = (positionId: string) => {
    if (dutyDragState.phase !== 'keyboard-grabbed') return
    const payload = dutyDragState.payload
    const resolution = resolveDutyConfigurationAssignmentCommand(state, { dutyId: payload.dutyId, positionId, lane: payload.lane, sourceRelationId: payload.sourceRelationId, newRelationId: payload.newRelationId })
    const kind = resolution.status === 'command' ? 'command' : resolution.status === 'noop' ? 'noop' : 'invalid'
    setDutyDragState((current) => updateDutyConfigurationDragCandidate(current, positionId, kind))
  }

  const createNode = (parentNodeId: string | null) => {
    if (!activeProcess || !writable) return
    const id = `process-node-${crypto.randomUUID()}`
    const order = nodes.filter((node) => node.parentNodeId === parentNodeId).length
    onCommand({ type: 'CREATE_PROCESS_NODE', node: { id, processId: activeProcess.id, title: '新流程節點', parentNodeId, order } })
    selectNode(id)
  }
  const saveProcessTitle = () => {
    if (!activeProcess || !writable || !processTitleDraft.trim()) return
    onCommand({ type: 'UPDATE_PROCESS', processId: activeProcess.id, title: processTitleDraft })
  }
  const saveNodeTitle = () => {
    if (!selectedNode || !writable || !nodeTitleDraft.trim()) return
    onCommand({ type: 'UPDATE_PROCESS_NODE', nodeId: selectedNode.id, title: nodeTitleDraft })
  }
  const moveSelectedNode = (delta: -1 | 1) => {
    if (!selectedNode || !writable) return
    const siblings = nodes.filter((node) => node.parentNodeId === selectedNode.parentNodeId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    const index = siblings.findIndex((node) => node.id === selectedNode.id)
    const nextIndex = index + delta
    if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return
    onCommand({ type: 'MOVE_PROCESS_NODE', nodeId: selectedNode.id, parentNodeId: selectedNode.parentNodeId, insertIndex: nextIndex })
  }
  const reparentSelectedNode = (parentNodeId: string | null) => {
    if (!selectedNode || !writable) return
    const order = nodes.filter((node) => node.parentNodeId === parentNodeId && node.id !== selectedNode.id).length
    onCommand({ type: 'MOVE_PROCESS_NODE', nodeId: selectedNode.id, parentNodeId, insertIndex: order })
  }
  const addEdge = () => {
    if (!activeProcess || !writable || !edgeSourceId || !edgeTargetId || edgeSourceId === edgeTargetId) return
    onCommand({ type: 'CREATE_PROCESS_EDGE', edge: { id: `process-edge-${crypto.randomUUID()}`, processId: activeProcess.id, fromNodeId: edgeSourceId, toNodeId: edgeTargetId } })
  }

  return <main className="process-planning-page" aria-label="流程與職掌規劃工作台">
    <header className="process-planning-page__header"><div><span className="eyebrow">流程規劃</span><h1>流程 × 工作職掌 × 組織責任</h1></div><div className="process-planning-page__actions"><span className={`process-capability-pill${writable ? ' is-writable' : ''}`}>{writable ? '可編輯' : '唯讀'}</span><button type="button" className="secondary-button" onClick={onClose}>← 返回組織圖</button></div></header>
    <nav className="process-planning-tabs" aria-label="流程規劃視角"><button type="button" className={location.view === 'mindmap' ? 'is-active' : undefined} onClick={() => navigate({ view: 'mindmap' })}>責任心智圖</button><button type="button" className={location.view === 'flow' ? 'is-active' : undefined} onClick={() => navigate({ view: 'flow' })}>流程圖</button></nav>
    <div className="process-planning-grid">
      <aside className="process-planning-processes" aria-label="流程清單"><header className="process-panel-heading"><span>流程清單</span><small>{processes.length} 個</small></header>{processes.map((process) => <button type="button" key={process.id} className={process.id === activeProcess?.id ? 'is-active' : undefined} onClick={() => { setSelectedNodeId(null); setSelectedDutyId(null); navigate({ processId: process.id, processNodeId: null, dutyId: null }) }}><strong>{process.title}</strong><small>{state.processNodes.filter((node) => node.processId === process.id).length} 節點</small></button>)}{writable && <button type="button" className="process-add-button" onClick={() => { const id = `process-${crypto.randomUUID()}`; onCommand({ type: 'CREATE_PROCESS', process: { id, title: '新流程', description: null, order: processes.length } }); setSelectedNodeId(null); setSelectedDutyId(null); navigate({ processId: id, processNodeId: null, dutyId: null }) }}>＋ 新增流程</button>}{processes.length === 0 && <p className="process-empty">尚未建立流程，先新增一個流程再開始繪製。</p>}</aside>
      <section className="process-planning-graph-panel"><header className="process-panel-heading"><span>{activeProcess?.title ?? '未選擇流程'}</span><span>{activeProcess && writable && <button type="button" className="process-add-inline" onClick={() => createNode(null)}>＋ 根節點</button>}<small>{location.view === 'mindmap' ? '由父子節點呈現' : '由流程連線呈現'}</small></span></header>{activeProcess && writable && <div className="process-inline-editor"><label>流程名稱<input aria-label="流程名稱" value={processTitleDraft} onChange={(event) => setProcessTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveProcessTitle() }} /></label><button type="button" onClick={saveProcessTitle}>儲存</button></div>}<ReactFlowProvider><ProcessPlanningCanvas nodes={nodes} edges={edges} mode={location.view} selectedNodeId={selectedNodeId} relatedNodeIds={highlights.processNodeIds} onSelectNode={selectNode} /></ReactFlowProvider>{selectedNode && writable && <div className="process-node-editor"><label>節點名稱<input aria-label="節點名稱" value={nodeTitleDraft} onChange={(event) => setNodeTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveNodeTitle() }} /></label><div className="process-editor-actions"><button type="button" onClick={saveNodeTitle}>儲存</button><button type="button" onClick={() => createNode(selectedNode.id)}>＋ 子節點</button><button type="button" onClick={() => createNode(selectedNode.parentNodeId)}>＋ 同層</button><button type="button" onClick={() => moveSelectedNode(-1)}>↑</button><button type="button" onClick={() => moveSelectedNode(1)}>↓</button><button type="button" disabled={nodes.some((node) => node.parentNodeId === selectedNode.id)} onClick={() => onCommand({ type: 'DELETE_PROCESS_LEAF_NODE', nodeId: selectedNode.id })}>刪除</button></div><label>移至父節點<select aria-label="移至父節點" value={selectedNode.parentNodeId ?? ''} onChange={(event) => reparentSelectedNode(event.target.value || null)}><option value="">根節點</option>{nodes.filter((node) => node.id !== selectedNode.id && !nodes.some((candidate) => candidate.id === selectedNode.id && candidate.parentNodeId === node.id)).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label></div>}{location.view === 'flow' && activeProcess && writable && <div className="process-edge-editor"><span className="process-subheading">流程連線</span><select aria-label="連線起點" value={edgeSourceId} onChange={(event) => setEdgeSourceId(event.target.value)}><option value="">起點</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><span aria-hidden="true">→</span><select aria-label="連線終點" value={edgeTargetId} onChange={(event) => setEdgeTargetId(event.target.value)}><option value="">終點</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><button type="button" onClick={addEdge}>＋ 連線</button>{edges.map((edge) => <button type="button" key={edge.id} className="process-edge-chip" onClick={() => onCommand({ type: 'DELETE_PROCESS_EDGE', edgeId: edge.id })}>刪除 {nodes.find((node) => node.id === edge.fromNodeId)?.title ?? edge.fromNodeId} → {nodes.find((node) => node.id === edge.toNodeId)?.title ?? edge.toNodeId}</button>)}</div>}</section>
      <ProcessDutyBridge state={state} processNodeId={selectedNodeId} selectedDutyId={selectedDutyId} selectedPositionId={selectedPositionId} editingEnabled={writable} relatedDutyIds={highlights.dutyIds} onSelectDuty={selectDuty} onSelectPosition={selectPosition} onCommand={onCommand} onStartDrag={startDutyDrag} onCancelDrag={() => setDutyDragState(cancelDutyConfigurationDrag())} />
      <aside className="process-planning-org-panel" aria-label="組織職位"><header className="process-panel-heading"><span>組織責任視角</span><small>{selectedPosition ? `已選：${selectedPosition.title}` : '拖曳責任到職位'}</small></header>{dropNotice && <p className="process-drop-notice" role="status">{dropNotice}</p>}{organizationProjectionVisible ? <ReactFlowProvider><ProcessOrganizationCanvas state={state} selectedPositionId={selectedPositionId} relatedPositionIds={highlights.positionIds} editingEnabled={writable} keyboardDropPositionId={keyboardDropPositionId} onSelectPosition={(positionId) => selectPosition(positionId)} onDutyDrop={handleDutyDrop} onDutyDragOver={handleDutyDragOver} onKeyboardDrop={handleKeyboardDrop} onKeyboardFocus={handleKeyboardFocus} /></ReactFlowProvider> : <p className="process-empty process-org-canvas-collapsed">窄桌面保留 Duty bridge 的職位選擇；放大視窗可開啟組織責任圖。</p>}</aside>
    </div>
  </main>
}
