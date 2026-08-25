import {
  isDescendant,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  SIBLING_GAP,
} from './layout'
import type { ChildrenAxis, HierarchyNode, OrgMember, Point } from './types'

type HierarchyInput = HierarchyNode | OrgMember

function parentOf(member: HierarchyInput) {
  return 'parentId' in member ? member.parentId ?? null : null
}

export type DropCandidate =
  | {
      type: 'child'
      targetId: string
    }
  | {
      type: 'sibling'
      parentId: string | null
      insertIndex: number
    }

export interface DropCandidateMatch {
  candidate: DropCandidate
  distance: number
}

interface DropZone {
  candidate: DropCandidate
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  priority: number
}

const CHILD_ZONE_INSET_X = ORG_NODE_WIDTH * 0.28
const CHILD_ZONE_INSET_Y = ORG_NODE_HEIGHT * 0.24
const SLOT_WIDTH = 24
const SLOT_CROSS_PADDING = 18
const SLOT_OUTER_OFFSET = SIBLING_GAP + SLOT_WIDTH / 2
export const MAGNET_RADIUS = 34
export const CANDIDATE_EXIT_MARGIN = 12
export const DROP_CANDIDATE_EXIT_RADIUS = MAGNET_RADIUS + CANDIDATE_EXIT_MARGIN

export function sameDropCandidate(first: DropCandidate | null, second: DropCandidate | null) {
  if (!first || !second || first.type !== second.type) return false
  if (first.type === 'child' && second.type === 'child') {
    return first.targetId === second.targetId
  }
  if (first.type === 'sibling' && second.type === 'sibling') {
    return first.parentId === second.parentId && first.insertIndex === second.insertIndex
  }
  return false
}

function distanceToRect(point: Point, rect: DropZone['rect']) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

function createChildZone(targetId: string, position: Point): DropZone {
  return {
    candidate: { type: 'child', targetId },
    rect: {
      x: position.x + CHILD_ZONE_INSET_X,
      y: position.y + CHILD_ZONE_INSET_Y,
      width: ORG_NODE_WIDTH - CHILD_ZONE_INSET_X * 2,
      height: ORG_NODE_HEIGHT - CHILD_ZONE_INSET_Y * 2,
    },
    priority: 0,
  }
}

function createSiblingZone(
  parentId: string | null,
  insertIndex: number,
  siblings: HierarchyInput[],
  nodeById: Map<string, { position: Point }>,
  childrenAxis: ChildrenAxis,
): DropZone | null {
  const before = siblings[insertIndex - 1]
  const after = siblings[insertIndex]
  const beforePosition = before ? nodeById.get(before.id)?.position : undefined
  const afterPosition = after ? nodeById.get(after.id)?.position : undefined
  if (!beforePosition && !afterPosition) return null

  if (childrenAxis === 'horizontal') {
    const rowY = afterPosition?.y ?? beforePosition?.y ?? 0
    const axisX = afterPosition
      ? beforePosition
        ? (beforePosition.x + ORG_NODE_WIDTH + afterPosition.x) / 2
        : afterPosition.x - SLOT_OUTER_OFFSET
      : beforePosition!.x + ORG_NODE_WIDTH + SLOT_OUTER_OFFSET

    return {
      candidate: { type: 'sibling', parentId, insertIndex },
      rect: {
        x: axisX - SLOT_WIDTH / 2,
        y: rowY - SLOT_CROSS_PADDING,
        width: SLOT_WIDTH,
        height: ORG_NODE_HEIGHT + SLOT_CROSS_PADDING * 2,
      },
      priority: 1,
    }
  }

  const columnX = afterPosition?.x ?? beforePosition?.x ?? 0
  const axisY = afterPosition
    ? beforePosition
      ? (beforePosition.y + ORG_NODE_HEIGHT + afterPosition.y) / 2
      : afterPosition.y - SLOT_OUTER_OFFSET
    : beforePosition!.y + ORG_NODE_HEIGHT + SLOT_OUTER_OFFSET

  return {
    candidate: { type: 'sibling', parentId, insertIndex },
    rect: {
      x: columnX - SLOT_CROSS_PADDING,
      y: axisY - SLOT_WIDTH / 2,
      width: ORG_NODE_WIDTH + SLOT_CROSS_PADDING * 2,
      height: SLOT_WIDTH,
    },
    priority: 1,
  }
}

function buildDropZones(
  draggedId: string,
  nodes: Array<{ id: string; position: Point }>,
  members: HierarchyInput[],
) {
  const visibleIds = new Set(nodes.map((node) => node.id))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const memberById = new Map(members.map((member) => [member.id, member]))
  const zones: DropZone[] = []

  for (const node of nodes) {
    if (node.id === draggedId || isDescendant(members, node.id, draggedId)) continue
    zones.push(createChildZone(node.id, node.position))
  }

  const siblingGroups = new Map<string | null, HierarchyInput[]>()
  for (const member of members) {
    if (!visibleIds.has(member.id) || member.id === draggedId) continue
    const siblings = siblingGroups.get(parentOf(member)) ?? []
    siblings.push(member)
    siblingGroups.set(parentOf(member), siblings)
  }

  for (const [parentId, siblings] of siblingGroups) {
    if (parentId && (parentId === draggedId || isDescendant(members, parentId, draggedId))) continue
    siblings.sort((a, b) => a.order - b.order)
    const childrenAxis = parentId ? memberById.get(parentId)?.childrenAxis ?? 'horizontal' : 'horizontal'
    for (let insertIndex = 0; insertIndex <= siblings.length; insertIndex += 1) {
      const zone = createSiblingZone(parentId, insertIndex, siblings, nodeById, childrenAxis)
      if (zone) zones.push(zone)
    }
  }

  return zones
}

function findCandidateZone(
  point: Point,
  candidate: DropCandidate,
  draggedId: string,
  nodes: Array<{ id: string; position: Point }>,
  members: HierarchyInput[],
) {
  return buildDropZones(draggedId, nodes, members).find((zone) => sameDropCandidate(zone.candidate, candidate))
}

export function getDropCandidateDistance(
  point: Point,
  candidate: DropCandidate,
  draggedId: string,
  nodes: Array<{ id: string; position: Point }>,
  members: HierarchyInput[],
) {
  const zone = findCandidateZone(point, candidate, draggedId, nodes, members)
  return zone ? distanceToRect(point, zone.rect) : null
}

export function findDropCandidate(
  point: Point,
  draggedId: string,
  nodes: Array<{ id: string; position: Point }>,
  members: HierarchyInput[],
): DropCandidateMatch | null {
  const matches = buildDropZones(draggedId, nodes, members)
    .map((zone) => ({
      candidate: zone.candidate,
      distance: distanceToRect(point, zone.rect),
      priority: zone.priority,
    }))
    .filter((match) => match.distance <= MAGNET_RADIUS)
    .sort((a, b) => a.distance - b.distance || a.priority - b.priority)

  const match = matches[0]
  return match ? { candidate: match.candidate, distance: match.distance } : null
}
