import { Background, BackgroundVariant, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { useMemo } from 'react'
import { layoutProcessPlanningGraph } from '../processPlanningLayout'
import type { ProcessEdge, ProcessNode } from '../types'

export type ProcessCanvasNode = Node<{ title: string; selected: boolean; related: boolean }>
export type ProcessCanvasEdge = Edge

interface ProcessPlanningCanvasProps {
  nodes: ProcessNode[]
  edges: ProcessEdge[]
  mode: 'mindmap' | 'flow'
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

function ProcessNodeCard({ data }: { data: { title: string; selected: boolean; related: boolean } }) {
  return <div className={`process-canvas-node${data.selected ? ' is-selected' : ''}${data.related ? ' is-related' : ''}`} role="button" tabIndex={0}>
    <span className="process-canvas-node__dot" aria-hidden="true" />
    <strong>{data.title}</strong>
  </div>
}

const nodeTypes = { process: ProcessNodeCard }

export function ProcessPlanningCanvas({ nodes, edges, mode, selectedNodeId, onSelectNode }: ProcessPlanningCanvasProps) {
  const layout = useMemo(() => layoutProcessPlanningGraph({ nodes, edges, mode }), [edges, mode, nodes])
  const flowNodes = useMemo<ProcessCanvasNode[]>(() => layout.nodes.map((node) => ({
    id: node.id,
    type: 'process',
    position: node.position,
    data: { title: node.title, selected: node.id === selectedNodeId, related: false },
    draggable: false,
    selectable: true,
  })), [layout.nodes, selectedNodeId])
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
