import dagre from '@dagrejs/dagre'
import type { ProcessEdge, ProcessNode } from './types'

export type ProcessPlanningLayoutMode = 'mindmap' | 'flow'

export interface ProcessPlanningLayoutNode {
  id: string
  title: string
  position: { x: number; y: number }
  width: number
  height: number
}

export interface ProcessPlanningLayoutEdge {
  id: string
  source: string
  target: string
  feedback: boolean
}

export interface ProcessPlanningLayoutInput {
  nodes: ProcessNode[]
  edges: ProcessEdge[]
  mode: ProcessPlanningLayoutMode
}

export interface ProcessPlanningLayoutResult {
  nodes: ProcessPlanningLayoutNode[]
  edges: ProcessPlanningLayoutEdge[]
  width: number
  height: number
  engine: 'dagre' | 'fallback'
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 76
const NODE_SEPARATION = 48
const RANK_SEPARATION = 100
const PADDING = 36

function projectedEdges(input: ProcessPlanningLayoutInput): ProcessPlanningLayoutEdge[] {
  const allowed = input.mode === 'mindmap'
    ? input.nodes.flatMap((node) => node.parentNodeId ? [{ id: `parent:${node.id}`, source: node.parentNodeId, target: node.id }] : [])
    : input.edges
      .filter((edge) => input.nodes.some((node) => node.id === edge.fromNodeId) && input.nodes.some((node) => node.id === edge.toNodeId))
      .map((edge) => ({ id: edge.id, source: edge.fromNodeId, target: edge.toNodeId }))
  const adjacency = new Map<string, string[]>()
  for (const edge of allowed) {
    const targets = adjacency.get(edge.source) ?? []
    targets.push(edge.target)
    adjacency.set(edge.source, targets)
  }
  const hasAlternatePath = (source: string, target: string, skipId: string) => {
    const queue = [source]
    const seen = new Set([source])
    while (queue.length) {
      const current = queue.shift()!
      for (const nextEdge of allowed) {
        if (nextEdge.id === skipId || nextEdge.source !== current || seen.has(nextEdge.target)) continue
        if (nextEdge.target === target) return true
        seen.add(nextEdge.target)
        queue.push(nextEdge.target)
      }
    }
    return false
  }
  return allowed
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((edge) => ({ ...edge, feedback: input.mode === 'flow' && hasAlternatePath(edge.target, edge.source, edge.id) }))
}

function dagreLayout(nodes: ProcessNode[], edges: ProcessPlanningLayoutEdge[]): ProcessPlanningLayoutResult {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_SEPARATION, ranksep: RANK_SEPARATION, marginx: PADDING, marginy: PADDING })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const edge of edges) graph.setEdge(edge.source, edge.target, {}, edge.id)
  dagre.layout(graph)
  const raw = nodes.map((node) => {
    const point = graph.node(node.id)
    return {
      id: node.id,
      title: node.title,
      position: { x: Math.round(point.x - NODE_WIDTH / 2), y: Math.round(point.y - NODE_HEIGHT / 2) },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }
  })
  const minX = Math.min(0, ...raw.map((node) => node.position.x))
  const minY = Math.min(0, ...raw.map((node) => node.position.y))
  const normalized = raw.map((node) => ({ ...node, position: { x: node.position.x - minX + PADDING, y: node.position.y - minY + PADDING } }))
  return {
    nodes: normalized,
    edges,
    width: Math.max(320, Math.max(0, ...normalized.map((node) => node.position.x + node.width)) + PADDING),
    height: Math.max(220, Math.max(0, ...normalized.map((node) => node.position.y + node.height)) + PADDING),
    engine: 'dagre',
  }
}

function fallbackLayout(nodes: ProcessNode[], edges: ProcessPlanningLayoutEdge[]): ProcessPlanningLayoutResult {
  const incoming = new Set(edges.map((edge) => edge.target))
  const children = new Map<string, ProcessNode[]>()
  for (const node of nodes) {
    const siblings = children.get(node.parentNodeId ?? '__root__') ?? []
    siblings.push(node)
    children.set(node.parentNodeId ?? '__root__', siblings)
  }
  for (const siblings of children.values()) siblings.sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))
  const levels = new Map<string, number>()
  const visit = (node: ProcessNode, level: number, stack: Set<string>) => {
    if (stack.has(node.id)) return
    if ((levels.get(node.id) ?? -1) >= level) return
    levels.set(node.id, level)
    const next = new Set(stack).add(node.id)
    for (const child of children.get(node.id) ?? []) visit(child, level + 1, next)
  }
  for (const node of children.get('__root__') ?? []) visit(node, 0, new Set())
  for (const node of nodes) if (!levels.has(node.id)) levels.set(node.id, incoming.has(node.id) ? 1 : 0)
  const rows = new Map<number, ProcessNode[]>()
  for (const node of nodes) {
    const row = rows.get(levels.get(node.id) ?? 0) ?? []
    row.push(node)
    rows.set(levels.get(node.id) ?? 0, row)
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [level, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    row.sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))
    row.forEach((node, index) => positions.set(node.id, { x: PADDING + level * (NODE_WIDTH + RANK_SEPARATION), y: PADDING + index * (NODE_HEIGHT + NODE_SEPARATION) }))
  }
  const resultNodes = nodes.map((node) => ({ id: node.id, title: node.title, position: positions.get(node.id) ?? { x: PADDING, y: PADDING }, width: NODE_WIDTH, height: NODE_HEIGHT }))
  return {
    nodes: resultNodes,
    edges,
    width: Math.max(320, Math.max(0, ...resultNodes.map((node) => node.position.x + node.width)) + PADDING),
    height: Math.max(220, Math.max(0, ...resultNodes.map((node) => node.position.y + node.height)) + PADDING),
    engine: 'fallback',
  }
}

export function layoutProcessPlanningGraph(input: ProcessPlanningLayoutInput): ProcessPlanningLayoutResult {
  const nodes = [...input.nodes].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))
  const edges = projectedEdges(input)
  if (!nodes.length) return { nodes: [], edges, width: 320, height: 220, engine: 'dagre' }
  try {
    return dagreLayout(nodes, edges)
  } catch {
    return fallbackLayout(nodes, edges)
  }
}

