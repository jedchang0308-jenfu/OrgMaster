import type {
  DutyPositionRelation,
  OrgDirectoryState,
  ProcessDefinition,
  ProcessEdge,
  ProcessNode,
  ProcessNodeDutyLink,
} from './types'

export type ProcessPlanningCollections = Pick<OrgDirectoryState, 'processes' | 'processNodes' | 'processEdges' | 'processNodeDutyLinks'>

export type ProcessPlanningValidationCode =
  | 'PROCESS_ID_DUPLICATE'
  | 'PROCESS_NOT_FOUND'
  | 'PROCESS_TITLE_INVALID'
  | 'PROCESS_DESCRIPTION_INVALID'
  | 'PROCESS_NOT_EMPTY'
  | 'PROCESS_NODE_ID_DUPLICATE'
  | 'PROCESS_NODE_NOT_FOUND'
  | 'PROCESS_NODE_TITLE_INVALID'
  | 'PROCESS_NODE_PARENT_INVALID'
  | 'PROCESS_NODE_CYCLE'
  | 'PROCESS_NODE_HAS_CHILDREN'
  | 'PROCESS_NODE_ORDER_INVALID'
  | 'PROCESS_EDGE_ID_DUPLICATE'
  | 'PROCESS_EDGE_NOT_FOUND'
  | 'PROCESS_EDGE_ENDPOINT_INVALID'
  | 'PROCESS_EDGE_SELF_LOOP'
  | 'PROCESS_EDGE_DUPLICATE'
  | 'PROCESS_DUTY_LINK_ID_DUPLICATE'
  | 'PROCESS_DUTY_LINK_NOT_FOUND'
  | 'PROCESS_DUTY_LINK_REFERENCE_INVALID'
  | 'PROCESS_DUTY_LINK_DUPLICATE'
  | 'PROCESS_DUTY_LINK_ORDER_INVALID'
  | 'DUTY_PROCESS_LINK_IN_USE'

export interface ProcessPlanningValidationIssue {
  code: ProcessPlanningValidationCode
  processIds: string[]
  processNodeIds: string[]
  dutyIds: string[]
}

export type ProcessPlanningValidationResult =
  | { ok: true }
  | { ok: false; issue: ProcessPlanningValidationIssue }

export interface ProcessPlanningSelection {
  processId: string | null
  processNodeId: string | null
  dutyId: string | null
  positionId: string | null
}

export interface ProcessPlanningHighlights {
  processNodeIds: Set<string>
  dutyIds: Set<string>
  positionIds: Set<string>
}

const emptyIssue = (code: ProcessPlanningValidationCode, ids: Partial<ProcessPlanningValidationIssue> = {}): ProcessPlanningValidationIssue => ({
  code,
  processIds: ids.processIds ?? [],
  processNodeIds: ids.processNodeIds ?? [],
  dutyIds: ids.dutyIds ?? [],
})

export function createEmptyProcessPlanningCollections(): ProcessPlanningCollections {
  return {
    processes: [],
    processNodes: [],
    processEdges: [],
    processNodeDutyLinks: [],
  }
}

function canonicalText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function canonicalDescription(value: string | null) {
  if (value === null) return null
  const result = canonicalText(value)
  return result || null
}

function byOrderAndId<T extends { order: number; id: string }>(first: T, second: T) {
  return first.order - second.order || first.id.localeCompare(second.id)
}

function sortAndReindex<T extends { order: number; id: string }>(items: T[]): T[] {
  return [...items].sort(byOrderAndId).map((item, index) => ({ ...item, order: index }))
}

function siblingKey(processId: string, parentNodeId: string | null) {
  return `${processId}\u0000${parentNodeId ?? ''}`
}

export function normalizeProcessPlanningState(state: OrgDirectoryState): OrgDirectoryState {
  const processes: ProcessDefinition[] = sortAndReindex(state.processes.map((process) => ({
    ...process,
    title: canonicalText(process.title),
    description: canonicalDescription(process.description),
  })))
  const nodes = state.processNodes.map((node) => ({ ...node, title: canonicalText(node.title) }))
  const groups = new Map<string, ProcessNode[]>()
  for (const node of nodes) {
    const key = siblingKey(node.processId, node.parentNodeId)
    const group = groups.get(key) ?? []
    group.push(node)
    groups.set(key, group)
  }
  const processNodes = [...groups.values()].flatMap((group) => sortAndReindex(group))
  const linksByNode = new Map<string, ProcessNodeDutyLink[]>()
  for (const link of state.processNodeDutyLinks) {
    const links = linksByNode.get(link.processNodeId) ?? []
    links.push({ ...link })
    linksByNode.set(link.processNodeId, links)
  }
  const processNodeDutyLinks = [...linksByNode.values()].flatMap((links) => sortAndReindex(links))
  return {
    ...state,
    processes,
    processNodes,
    processEdges: state.processEdges.map((edge) => ({ ...edge })),
    processNodeDutyLinks,
  }
}

function isValidTitle(value: string) {
  const canonical = canonicalText(value)
  return canonical.length >= 1 && canonical.length <= 120
}

function isValidDescription(value: string | null) {
  return value === null || canonicalDescription(value)!.length <= 500
}

function checkOrders<T extends { order: number; id: string }>(items: T[]) {
  const ordered = [...items].sort(byOrderAndId)
  return ordered.every((item, index) => item.order === index)
}

function parentCycle(nodes: ProcessNode[], start: ProcessNode) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  let cursor: ProcessNode | undefined = start
  while (cursor?.parentNodeId) {
    if (seen.has(cursor.id)) return true
    seen.add(cursor.id)
    cursor = byId.get(cursor.parentNodeId)
  }
  return false
}

export function validateProcessPlanningState(state: OrgDirectoryState): ProcessPlanningValidationResult {
  const processIds = new Set<string>()
  for (const process of state.processes) {
    if (processIds.has(process.id)) return { ok: false, issue: emptyIssue('PROCESS_ID_DUPLICATE', { processIds: [process.id] }) }
    processIds.add(process.id)
    if (typeof process.id !== 'string' || !process.id.trim()) return { ok: false, issue: emptyIssue('PROCESS_TITLE_INVALID') }
    if (!isValidTitle(process.title)) return { ok: false, issue: emptyIssue('PROCESS_TITLE_INVALID', { processIds: [process.id] }) }
    if (!isValidDescription(process.description)) return { ok: false, issue: emptyIssue('PROCESS_DESCRIPTION_INVALID', { processIds: [process.id] }) }
  }
  if (!checkOrders(state.processes)) return { ok: false, issue: emptyIssue('PROCESS_NODE_ORDER_INVALID', { processIds: state.processes.map((process) => process.id) }) }

  const nodeIds = new Set<string>()
  const nodesByProcess = new Map<string, ProcessNode[]>()
  for (const node of state.processNodes) {
    if (nodeIds.has(node.id)) return { ok: false, issue: emptyIssue('PROCESS_NODE_ID_DUPLICATE', { processNodeIds: [node.id] }) }
    nodeIds.add(node.id)
    if (!processIds.has(node.processId)) return { ok: false, issue: emptyIssue('PROCESS_NOT_FOUND', { processIds: [node.processId], processNodeIds: [node.id] }) }
    if (!isValidTitle(node.title)) return { ok: false, issue: emptyIssue('PROCESS_NODE_TITLE_INVALID', { processIds: [node.processId], processNodeIds: [node.id] }) }
    const list = nodesByProcess.get(node.processId) ?? []
    list.push(node)
    nodesByProcess.set(node.processId, list)
  }
  const nodeById = new Map(state.processNodes.map((node) => [node.id, node]))
  for (const node of state.processNodes) {
    if (node.parentNodeId !== null) {
      const parent = nodeById.get(node.parentNodeId)
      if (!parent || parent.processId !== node.processId) return { ok: false, issue: emptyIssue('PROCESS_NODE_PARENT_INVALID', { processIds: [node.processId], processNodeIds: [node.id, node.parentNodeId] }) }
      if (parentCycle(state.processNodes, node)) return { ok: false, issue: emptyIssue('PROCESS_NODE_CYCLE', { processIds: [node.processId], processNodeIds: [node.id, parent.id] }) }
    }
  }
  const siblingGroups = new Map<string, ProcessNode[]>()
  for (const node of state.processNodes) {
    const key = siblingKey(node.processId, node.parentNodeId)
    const group = siblingGroups.get(key) ?? []
    group.push(node)
    siblingGroups.set(key, group)
  }
  for (const [key, group] of siblingGroups) {
    if (!checkOrders(group)) {
      const [processId] = key.split('\u0000')
      return { ok: false, issue: emptyIssue('PROCESS_NODE_ORDER_INVALID', { processIds: [processId], processNodeIds: group.map((node) => node.id) }) }
    }
  }

  const edgeIds = new Set<string>()
  const edgePairs = new Set<string>()
  for (const edge of state.processEdges) {
    if (edgeIds.has(edge.id)) return { ok: false, issue: emptyIssue('PROCESS_EDGE_ID_DUPLICATE', { processIds: [edge.processId], processNodeIds: [edge.fromNodeId, edge.toNodeId] }) }
    edgeIds.add(edge.id)
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    if (!processIds.has(edge.processId) || !from || !to || from.processId !== edge.processId || to.processId !== edge.processId) return { ok: false, issue: emptyIssue('PROCESS_EDGE_ENDPOINT_INVALID', { processIds: [edge.processId], processNodeIds: [edge.fromNodeId, edge.toNodeId] }) }
    if (edge.fromNodeId === edge.toNodeId) return { ok: false, issue: emptyIssue('PROCESS_EDGE_SELF_LOOP', { processIds: [edge.processId], processNodeIds: [edge.fromNodeId] }) }
    const pair = `${edge.processId}\u0000${edge.fromNodeId}\u0000${edge.toNodeId}`
    if (edgePairs.has(pair)) return { ok: false, issue: emptyIssue('PROCESS_EDGE_DUPLICATE', { processIds: [edge.processId], processNodeIds: [edge.fromNodeId, edge.toNodeId] }) }
    edgePairs.add(pair)
  }

  const linkIds = new Set<string>()
  const linkPairs = new Set<string>()
  const linksByNode = new Map<string, ProcessNodeDutyLink[]>()
  const dutyIds = new Set(state.duties.map((duty) => duty.id))
  for (const link of state.processNodeDutyLinks) {
    if (linkIds.has(link.id)) return { ok: false, issue: emptyIssue('PROCESS_DUTY_LINK_ID_DUPLICATE', { processNodeIds: [link.processNodeId], dutyIds: [link.dutyId] }) }
    linkIds.add(link.id)
    const node = nodeById.get(link.processNodeId)
    if (!node || !dutyIds.has(link.dutyId)) return { ok: false, issue: emptyIssue('PROCESS_DUTY_LINK_REFERENCE_INVALID', { processIds: node ? [node.processId] : [], processNodeIds: [link.processNodeId], dutyIds: [link.dutyId] }) }
    const pair = `${link.processNodeId}\u0000${link.dutyId}`
    if (linkPairs.has(pair)) return { ok: false, issue: emptyIssue('PROCESS_DUTY_LINK_DUPLICATE', { processIds: [node.processId], processNodeIds: [node.id], dutyIds: [link.dutyId] }) }
    linkPairs.add(pair)
    const list = linksByNode.get(link.processNodeId) ?? []
    list.push(link)
    linksByNode.set(link.processNodeId, list)
  }
  for (const [nodeId, links] of linksByNode) {
    if (!checkOrders(links)) {
      const node = nodeById.get(nodeId)
      return { ok: false, issue: emptyIssue('PROCESS_DUTY_LINK_ORDER_INVALID', { processIds: node ? [node.processId] : [], processNodeIds: [nodeId], dutyIds: links.map((link) => link.dutyId) }) }
    }
  }
  return { ok: true }
}

function relationPositionIds(relations: DutyPositionRelation[], dutyIds: Set<string>) {
  return new Set(relations.flatMap((relation) => (
    dutyIds.has(relation.dutyId) && relation.target.kind === 'position' ? [relation.target.positionId] : []
  )))
}

export function resolveProcessPlanningHighlights(state: OrgDirectoryState, selection: ProcessPlanningSelection): ProcessPlanningHighlights {
  const processNodeIds = new Set<string>()
  const dutyIds = new Set<string>()
  const positionIds = new Set<string>()
  if (selection.processNodeId) {
    const node = state.processNodes.find((candidate) => candidate.id === selection.processNodeId)
    if (node && (!selection.processId || node.processId === selection.processId)) {
      processNodeIds.add(node.id)
      for (const link of state.processNodeDutyLinks) if (link.processNodeId === node.id) dutyIds.add(link.dutyId)
    }
  }
  if (selection.dutyId) dutyIds.add(selection.dutyId)
  if (selection.positionId) positionIds.add(selection.positionId)
  if (dutyIds.size) {
    for (const link of state.processNodeDutyLinks) {
      const node = state.processNodes.find((candidate) => candidate.id === link.processNodeId)
      if (dutyIds.has(link.dutyId) && node && (!selection.processId || node.processId === selection.processId)) processNodeIds.add(node.id)
    }
    for (const positionId of relationPositionIds(state.dutyPositionRelations, dutyIds)) positionIds.add(positionId)
  }
  if (selection.positionId) {
    const positionDutyIds = new Set(state.dutyPositionRelations
      .filter((relation) => relation.target.kind === 'position' && relation.target.positionId === selection.positionId)
      .map((relation) => relation.dutyId))
    for (const dutyId of positionDutyIds) dutyIds.add(dutyId)
    for (const link of state.processNodeDutyLinks) {
      const node = state.processNodes.find((candidate) => candidate.id === link.processNodeId)
      if (positionDutyIds.has(link.dutyId) && node && (!selection.processId || node.processId === selection.processId)) processNodeIds.add(node.id)
    }
  }
  if (selection.processId) {
    for (const node of state.processNodes) if (node.processId === selection.processId && processNodeIds.has(node.id)) processNodeIds.add(node.id)
  }
  return { processNodeIds, dutyIds, positionIds }
}
