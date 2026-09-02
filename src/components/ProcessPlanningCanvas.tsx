import { Background, BackgroundVariant, Controls, Handle, Position as FlowPosition, ReactFlow, useNodesInitialized, useReactFlow, type Edge, type Node } from '@xyflow/react'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { layoutProcessPlanningGraph } from '../processPlanningLayout'
import type { ProcessEdge, ProcessNode } from '../types'
import type { RegisteredDropTarget, WorkspaceEntityDragPayloadV1 } from '../workspace/entityDrag'
import type { RelationPlacementCandidate } from '../workspace/relationPlacement'
import type { RelationPlacementBegin, RelationPlacementCancel, RelationPlacementCommit, RelationPlacementOutcome, RelationPlacementPreview } from '../workspace/relationDragInteraction'
import type { WorkspaceModuleId } from '../workspace/types'
import { createRelationDropTargetProps, createRelationDragSourceProps } from './workspace/relationPlacementBindings'
import { useRelationCanvasAutoPan } from './workspace/useRelationCanvasAutoPan'

interface ProcessCanvasNodeData extends Record<string, unknown> {
  processNodeId: string
  title: string
  selected: boolean
  related: boolean
  onSelect: () => void
  workspaceEntityDragSource?: WorkspaceModuleId
  onRelationBegin?: RelationPlacementBegin
  onRelationPreview?: RelationPlacementPreview
  onRelationCommit?: RelationPlacementCommit
  onRelationCancel?: RelationPlacementCancel
  relationPlacementActive?: boolean
  relationPlacementCandidate?: RelationPlacementCandidate | null
  relationPlacementOutcome?: RelationPlacementOutcome | null
}

export type ProcessCanvasNode = Node<ProcessCanvasNodeData>
export type ProcessCanvasEdge = Edge

interface ProcessPlanningCanvasProps {
  nodes: ProcessNode[]
  edges: ProcessEdge[]
  mode: 'mindmap' | 'flow'
  selectedNodeId: string | null
  relatedNodeIds?: ReadonlySet<string>
  onSelectNode: (nodeId: string) => void
  workspaceEntityDragSource?: WorkspaceModuleId
  onRelationBegin?: RelationPlacementBegin
  onRelationPreview?: RelationPlacementPreview
  onRelationCommit?: RelationPlacementCommit
  onRelationCancel?: RelationPlacementCancel
  relationPlacementActive?: boolean
  relationPlacementCandidate?: RelationPlacementCandidate | null
  relationPlacementOutcome?: RelationPlacementOutcome | null
}

function ProcessNodeCard({ data }: { data: ProcessCanvasNodeData }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    data.onSelect()
  }
  const startRelationKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!data.workspaceEntityDragSource || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    const payload: WorkspaceEntityDragPayloadV1 = { version: 1, kind: 'process-node', sourceModuleId: data.workspaceEntityDragSource, processNodeId: data.processNodeId }
    data.onRelationBegin?.(payload, 'keyboard', event.currentTarget)
  }
  return <>
    <Handle type="target" position={FlowPosition.Top} isConnectable={false} />
    <Handle type="source" position={FlowPosition.Bottom} isConnectable={false} />
    <div
      className={`process-canvas-node nodrag${data.selected ? ' is-selected' : ''}${data.related ? ' is-related' : ''}`}
      role="button"
      tabIndex={0}
      {...(data.workspaceEntityDragSource && data.onRelationBegin && data.onRelationCancel ? createRelationDragSourceProps({
        enabled: true,
        payload: { version: 1, kind: 'process-node', sourceModuleId: data.workspaceEntityDragSource, processNodeId: data.processNodeId },
        stopMouseDownPropagation: true,
        onBegin: data.onRelationBegin,
        onCancel: data.onRelationCancel,
      }) : { draggable: false })}
      {...createRelationDropTargetProps({
        active: Boolean(data.relationPlacementActive),
        available: Boolean(data.onRelationPreview && data.onRelationCommit),
        target: { kind: 'process-node', processNodeId: data.processNodeId },
        candidate: data.relationPlacementCandidate,
        outcome: data.relationPlacementOutcome,
        onPreview: data.onRelationPreview,
        onCommit: data.onRelationCommit,
      })}
      data-process-node-id={data.processNodeId}
      onClick={data.onSelect}
      onKeyDown={handleKeyDown}
      aria-pressed={data.selected}
    >
      <span className="process-canvas-node__dot" aria-hidden="true" />
      <strong>{data.title}</strong>
      {data.workspaceEntityDragSource && <button
        type="button"
        className="process-canvas-node__relation-handle nodrag"
        data-relation-drag-handle="true"
        aria-label={`拖曳流程節點${data.title}至其他面板`}
         title="拖曳以建立流程關係"
         onMouseDownCapture={(event) => event.stopPropagation()}
         onPointerDownCapture={(event) => event.stopPropagation()}
         onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={startRelationKeyboard}
      >⇢</button>}
    </div>
  </>
}

const nodeTypes = { process: ProcessNodeCard }

export function ProcessPlanningCanvas({ nodes, edges, mode, selectedNodeId, relatedNodeIds = new Set<string>(), onSelectNode, workspaceEntityDragSource, onRelationBegin, onRelationPreview, onRelationCommit, onRelationCancel, relationPlacementActive = false, relationPlacementCandidate = null, relationPlacementOutcome = null }: ProcessPlanningCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const { fitView, getViewport, setViewport } = useReactFlow<ProcessCanvasNode, ProcessCanvasEdge>()
  const relationCanvasAutoPan = useRelationCanvasAutoPan({ active: relationPlacementActive, getViewport, setViewport })
  const nodesInitialized = useNodesInitialized({ includeHiddenNodes: false })
  const layout = useMemo(() => layoutProcessPlanningGraph({ nodes, edges, mode }), [edges, mode, nodes])
  const flowNodes = useMemo<ProcessCanvasNode[]>(() => layout.nodes.map((node) => ({
    id: node.id,
    type: 'process',
    position: node.position,
    data: { processNodeId: node.id, title: node.title, selected: node.id === selectedNodeId, related: relatedNodeIds.has(node.id), onSelect: () => onSelectNode(node.id), workspaceEntityDragSource, onRelationBegin, onRelationPreview, onRelationCommit, onRelationCancel, relationPlacementActive, relationPlacementCandidate, relationPlacementOutcome },
    draggable: false,
    selectable: true,
  })), [layout.nodes, onRelationBegin, onRelationCancel, onRelationCommit, onRelationPreview, onSelectNode, relatedNodeIds, relationPlacementActive, relationPlacementCandidate, relationPlacementOutcome, selectedNodeId, workspaceEntityDragSource])
  const flowEdges = useMemo<ProcessCanvasEdge[]>(() => layout.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.feedback,
    style: edge.feedback ? { stroke: '#c27a1a', strokeDasharray: '5 4' } : undefined,
    label: edge.feedback ? '回饋' : undefined,
  })), [layout.edges])
  useEffect(() => {
    const host = canvasRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    let frame: number | null = null
    const cancelFrame = () => {
      if (frame === null || typeof window.cancelAnimationFrame !== 'function') return
      window.cancelAnimationFrame(frame)
      frame = null
    }
    const scheduleFit = () => {
      cancelFrame()
      const run = () => {
        frame = null
        if (!host.isConnected || host.closest('[hidden]')) return
        const rect = host.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        // React Flow measures custom nodes after the first paint. A second frame
        // lets the measured node bounds and the split container settle before
        // the single lifecycle-owned fitView call.
        const fit = () => {
          frame = null
          if (!host.isConnected || host.closest('[hidden]')) return
          const settledRect = host.getBoundingClientRect()
          if (settledRect.width <= 0 || settledRect.height <= 0) return
          void fitView({ duration: 0, padding: 0.18, maxZoom: 1.1 })
        }
        if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(fit)
        else fit()
      }
      if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(run)
      else run()
    }
    const observer = new ResizeObserver(scheduleFit)
    observer.observe(host)
    scheduleFit()
    return () => {
      cancelFrame()
      observer.disconnect()
    }
  }, [fitView, mode, layout.nodes.length, layout.edges.length, nodesInitialized])
  return <div ref={canvasRef} className="process-planning-canvas" aria-label={mode === 'mindmap' ? '流程心智圖' : '流程圖'} onDragOver={relationCanvasAutoPan.onCanvasDragOver}>
    <ReactFlow<ProcessCanvasNode, ProcessCanvasEdge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) => onSelectNode(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.3}
      maxZoom={1.4}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d8dee8" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
    <div className="process-planning-canvas__meta">{layout.engine === 'dagre' ? '自動排版' : '保守排版'} · {layout.nodes.length} 節點</div>
  </div>
}
