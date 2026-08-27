import { Background, BackgroundVariant, Controls, Handle, Position as FlowPosition, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { useMemo, type KeyboardEvent } from 'react'
import { layoutProcessPlanningGraph } from '../processPlanningLayout'
import type { ProcessEdge, ProcessNode } from '../types'

export type ProcessCanvasNode = Node<{ title: string; selected: boolean; related: boolean; onSelect: () => void }>
export type ProcessCanvasEdge = Edge

interface ProcessPlanningCanvasProps {
  nodes: ProcessNode[]
  edges: ProcessEdge[]
  mode: 'mindmap' | 'flow'
  selectedNodeId: string | null
  relatedNodeIds?: ReadonlySet<string>
  onSelectNode: (nodeId: string) => void
}

function ProcessNodeCard({ data }: { data: { title: string; selected: boolean; related: boolean; onSelect: () => void } }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    data.onSelect()
  }
  return <>
    <Handle type="target" position={FlowPosition.Top} isConnectable={false} />
    <Handle type="source" position={FlowPosition.Bottom} isConnectable={false} />
    <div className={`process-canvas-node${data.selected ? ' is-selected' : ''}${data.related ? ' is-related' : ''}`} role="button" tabIndex={0} onClick={data.onSelect} onKeyDown={handleKeyDown} aria-pressed={data.selected}>
      <span className="process-canvas-node__dot" aria-hidden="true" />
      <strong>{data.title}</strong>
    </div>
  </>
}

const nodeTypes = { process: ProcessNodeCard }

export function ProcessPlanningCanvas({ nodes, edges, mode, selectedNodeId, relatedNodeIds = new Set<string>(), onSelectNode }: ProcessPlanningCanvasProps) {
  const layout = useMemo(() => layoutProcessPlanningGraph({ nodes, edges, mode }), [edges, mode, nodes])
  const flowNodes = useMemo<ProcessCanvasNode[]>(() => layout.nodes.map((node) => ({
    id: node.id,
    type: 'process',
    position: node.position,
    data: { title: node.title, selected: node.id === selectedNodeId, related: relatedNodeIds.has(node.id), onSelect: () => onSelectNode(node.id) },
    draggable: false,
    selectable: true,
  })), [layout.nodes, onSelectNode, relatedNodeIds, selectedNodeId])
  const flowEdges = useMemo<ProcessCanvasEdge[]>(() => layout.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.feedback,
    style: edge.feedback ? { stroke: '#c27a1a', strokeDasharray: '5 4' } : undefined,
    label: edge.feedback ? '回饋' : undefined,
  })), [layout.edges])
  return <div className="process-planning-canvas" aria-label={mode === 'mindmap' ? '流程心智圖' : '流程圖'}>
    <ReactFlow<ProcessCanvasNode, ProcessCanvasEdge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) => onSelectNode(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
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
