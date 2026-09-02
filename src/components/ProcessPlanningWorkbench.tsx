import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import { buildProcessPlanningUrl, type ProcessPlanningLocation } from '../processPlanningRoute'
import { canMutateProcessPlanning } from '../processPlanningCapability'
import { resolveProcessPlanningHighlights } from '../processPlanning'
import type { OrganizationCommand } from '../organizationCommands'
import type { OrgDirectoryState } from '../types'
import type { RegisteredDropTarget, WorkspaceEntityDragPayloadV1 } from '../workspace/entityDrag'
import type { RelationPlacementCandidate, RelationPlacementInputMode } from '../workspace/relationPlacement'
import type {
  RelationPlacementBegin,
  RelationPlacementCancel,
  RelationPlacementCommit,
  RelationPlacementOutcome,
  RelationPlacementPreview,
} from '../workspace/relationDragInteraction'
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
  onRelationBegin?: RelationPlacementBegin
  onRelationPreview?: RelationPlacementPreview
  onRelationCommit?: RelationPlacementCommit
  onRelationCancel?: RelationPlacementCancel
  relationPlacementActive?: boolean
  relationPlacementCandidate?: RelationPlacementCandidate | null
  relationPlacementOutcome?: RelationPlacementOutcome | null
}

export function ProcessPlanningWorkbench({ state, location, editingEnabled, serverReady, recoveryOpen, mobileReadOnly, onCommand, onNavigate, onRelationBegin, onRelationPreview, onRelationCommit, onRelationCancel, relationPlacementActive = false, relationPlacementCandidate = null, relationPlacementOutcome = null }: ProcessPlanningWorkbenchProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(location.processNodeId)
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(location.dutyId)
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [processTitleDraft, setProcessTitleDraft] = useState('')
  const [nodeTitleDraft, setNodeTitleDraft] = useState('')
  const [edgeSourceId, setEdgeSourceId] = useState('')
  const [edgeTargetId, setEdgeTargetId] = useState('')
  const writable = canMutateProcessPlanning({ editingEnabled, serverReady, recoveryOpen, mobileReadOnly, viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth })
  const processes = useMemo(() => [...state.processes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), [state.processes])
  const activeProcess = processes.find((process) => process.id === location.processId) ?? processes[0] ?? null
  const nodes = useMemo(() => activeProcess ? state.processNodes.filter((node) => node.processId === activeProcess.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) : [], [activeProcess, state.processNodes])
  const edges = useMemo(() => activeProcess ? state.processEdges.filter((edge) => edge.processId === activeProcess.id) : [], [activeProcess, state.processEdges])
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
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
  const navigate = (next: Partial<Pick<ProcessPlanningLocation, 'view' | 'processId' | 'processNodeId' | 'dutyId'>>) => onNavigate(buildProcessPlanningUrl({ view: next.view ?? location.view, processId: next.processId === undefined ? location.processId : next.processId, processNodeId: next.processNodeId === undefined ? location.processNodeId : next.processNodeId, dutyId: next.dutyId === undefined ? location.dutyId : next.dutyId }))
  const selectNode = (nodeId: string) => { setSelectedNodeId(nodeId); setSelectedDutyId(null); navigate({ processId: activeProcess?.id ?? location.processId, processNodeId: nodeId, dutyId: null }) }
  const selectDuty = (dutyId: string | null) => { setSelectedDutyId(dutyId); navigate({ dutyId }) }
  const selectPosition = (positionId: string | null) => setSelectedPositionId(positionId)
  const createProcess = () => {
    if (!writable) return
    const id = `process-${crypto.randomUUID()}`
    onCommand({ type: 'CREATE_PROCESS', process: { id, title: '新流程', description: null, order: processes.length } })
    setSelectedNodeId(null)
    setSelectedDutyId(null)
    navigate({ processId: id, processNodeId: null, dutyId: null })
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
  return <main className="process-planning-page process-planning-page--panel" aria-label="流程與職掌規劃工作台">
    <nav className="process-planning-tabs" aria-label="流程規劃視角"><button type="button" className={location.view === 'mindmap' ? 'is-active' : undefined} onClick={() => navigate({ view: 'mindmap' })}>責任心智圖</button><button type="button" className={location.view === 'flow' ? 'is-active' : undefined} onClick={() => navigate({ view: 'flow' })}>流程圖</button></nav>
    <div className="process-planning-grid is-shared-organization">
      <aside className="process-planning-processes" aria-label="流程清單"><header className="process-panel-heading"><span>流程清單</span><small>{processes.length} 個</small></header>{processes.map((process) => <button type="button" key={process.id} className={process.id === activeProcess?.id ? 'is-active' : undefined} onClick={() => { setSelectedNodeId(null); setSelectedDutyId(null); navigate({ processId: process.id, processNodeId: null, dutyId: null }) }}><strong>{process.title}</strong><small>{state.processNodes.filter((node) => node.processId === process.id).length} 節點</small></button>)}{processes.length > 0 && writable && <button type="button" className="process-add-button" onClick={createProcess}>＋ 新增流程</button>}{processes.length === 0 && <div className="process-empty-state"><p className="process-empty">{writable ? '尚未建立流程，新增一個流程開始繪製。' : '目前版本尚未建立流程。'}</p>{writable ? <button type="button" className="process-add-button process-empty-state__add" onClick={createProcess}>＋ 新增流程</button> : <small className="process-empty-state__hint">目前版本為唯讀，請先切換可編輯草稿。</small>}</div>}</aside>
      <section className="process-planning-graph-panel"><header className="process-panel-heading"><span>{activeProcess?.title ?? '未選擇流程'}</span><span>{activeProcess && writable && <button type="button" className="process-add-inline" onClick={() => createNode(null)}>＋ 根節點</button>}<small>{location.view === 'mindmap' ? '由父子節點呈現' : '由流程連線呈現'}</small></span></header>{activeProcess && writable && <div className="process-inline-editor"><label>流程名稱<input aria-label="流程名稱" value={processTitleDraft} onChange={(event) => setProcessTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveProcessTitle() }} /></label><button type="button" onClick={saveProcessTitle}>儲存</button></div>}<ReactFlowProvider><ProcessPlanningCanvas nodes={nodes} edges={edges} mode={location.view} selectedNodeId={selectedNodeId} relatedNodeIds={highlights.processNodeIds} onSelectNode={selectNode} workspaceEntityDragSource={writable ? 'processes' : undefined} onRelationBegin={onRelationBegin} onRelationPreview={onRelationPreview} onRelationCommit={onRelationCommit} onRelationCancel={onRelationCancel} relationPlacementActive={relationPlacementActive} relationPlacementCandidate={relationPlacementCandidate} relationPlacementOutcome={relationPlacementOutcome} /></ReactFlowProvider>{selectedNode && writable && <div className="process-node-editor"><label>節點名稱<input aria-label="節點名稱" value={nodeTitleDraft} onChange={(event) => setNodeTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveNodeTitle() }} /></label><div className="process-editor-actions"><button type="button" onClick={saveNodeTitle}>儲存</button><button type="button" onClick={() => createNode(selectedNode.id)}>＋ 子節點</button><button type="button" onClick={() => createNode(selectedNode.parentNodeId)}>＋ 同層</button><button type="button" onClick={() => moveSelectedNode(-1)}>↑</button><button type="button" onClick={() => moveSelectedNode(1)}>↓</button><button type="button" disabled={nodes.some((node) => node.parentNodeId === selectedNode.id)} onClick={() => onCommand({ type: 'DELETE_PROCESS_LEAF_NODE', nodeId: selectedNode.id })}>刪除</button></div><label>移至父節點<select aria-label="移至父節點" value={selectedNode.parentNodeId ?? ''} onChange={(event) => reparentSelectedNode(event.target.value || null)}><option value="">根節點</option>{nodes.filter((node) => node.id !== selectedNode.id && !nodes.some((candidate) => candidate.id === selectedNode.id && candidate.parentNodeId === node.id)).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label></div>}{location.view === 'flow' && activeProcess && writable && <div className="process-edge-editor"><span className="process-subheading">流程連線</span><select aria-label="連線起點" value={edgeSourceId} onChange={(event) => setEdgeSourceId(event.target.value)}><option value="">起點</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><span aria-hidden="true">→</span><select aria-label="連線終點" value={edgeTargetId} onChange={(event) => setEdgeTargetId(event.target.value)}><option value="">終點</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><button type="button" onClick={addEdge}>＋ 連線</button>{edges.map((edge) => <button type="button" key={edge.id} className="process-edge-chip" onClick={() => onCommand({ type: 'DELETE_PROCESS_EDGE', edgeId: edge.id })}>刪除 {nodes.find((node) => node.id === edge.fromNodeId)?.title ?? edge.fromNodeId} → {nodes.find((node) => node.id === edge.toNodeId)?.title ?? edge.toNodeId}</button>)}</div>}</section>
      <ProcessDutyBridge state={state} processNodeId={selectedNodeId} selectedDutyId={selectedDutyId} selectedPositionId={selectedPositionId} editingEnabled={writable} relatedDutyIds={highlights.dutyIds} onSelectDuty={selectDuty} onSelectPosition={selectPosition} onCommand={onCommand} workspaceEntityDragSource={writable ? 'processes' : undefined} onRelationBegin={onRelationBegin} onRelationPreview={onRelationPreview} onRelationCommit={onRelationCommit} onRelationCancel={onRelationCancel} relationPlacementActive={relationPlacementActive} relationPlacementCandidate={relationPlacementCandidate} relationPlacementOutcome={relationPlacementOutcome} />
    </div>
  </main>
}
