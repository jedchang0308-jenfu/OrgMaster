import type { HierarchyNode, LayoutResult, OrganizationLevel, OrganizationLevelBand, OrgMember, Point } from './types'

type HierarchyInput = HierarchyNode | OrgMember

function parentOf(member: HierarchyInput) {
  return 'parentId' in member ? member.parentId ?? null : null
}

function departmentOf(member: HierarchyInput) {
  return 'departmentId' in member ? member.departmentId ?? null : null
}

// High-density canvas metrics: keep text legible while reducing empty routing space.
export const ORG_NODE_WIDTH = 106
export const ORG_NODE_HEIGHT = 60
export const LEVEL_GAP = 20
export const SIBLING_GAP = 4
export const ROOT_GAP = 20
export const VERTICAL_CHILD_OFFSET = 24
export const DEPARTMENT_FRAME_PADDING_X = 10
export const DEPARTMENT_FRAME_PADDING_TOP = 36
export const DEPARTMENT_FRAME_PADDING_BOTTOM = 20
export const DEPARTMENT_FRAME_GAP = 4
// Keep distinct level rows visually separated with 50% more cross-level space.
export const ORGANIZATION_LEVEL_BAND_GAP = 30
export const ORGANIZATION_LEVEL_LABEL_WIDTH = 132
// Keep same-level vertical collision spacing compact at 50% of the prior gap.
export const ORGANIZATION_LEVEL_NODE_GAP = 10

export const DEPARTMENT_HORIZONTAL_GAP = DEPARTMENT_FRAME_PADDING_X * 2 + DEPARTMENT_FRAME_GAP
export const DEPARTMENT_VERTICAL_GAP = DEPARTMENT_FRAME_PADDING_TOP + DEPARTMENT_FRAME_PADDING_BOTTOM + DEPARTMENT_FRAME_GAP

export function getOrgNodeHeight(activeAssigneeCount: number) {
  return ORG_NODE_HEIGHT + Math.max(0, activeAssigneeCount - 1) * 21
}

interface SubtreeLayout {
  width: number
  height: number
  root: Point
  positions: Record<string, Point>
}

interface DepartmentFrameRect {
  departmentId: string
  anchorId: string
  x: number
  y: number
  width: number
  height: number
}

function orderedChildren(members: HierarchyInput[]) {
  const children = new Map<string | null, HierarchyInput[]>()

  for (const member of members) {
    const siblings = children.get(parentOf(member)) ?? []
    siblings.push(member)
    children.set(parentOf(member), siblings)
  }

  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.order - b.order)
  }

  return children
}

function translate(
  source: Record<string, Point>,
  x: number,
  y: number,
  target: Record<string, Point>,
) {
  for (const [id, point] of Object.entries(source)) {
    target[id] = { x: point.x + x, y: point.y + y }
  }
}

function siblingGap(first: HierarchyInput, second: HierarchyInput, axis: 'horizontal' | 'vertical') {
  // Treat two unassigned positions as the same compact bucket. `null` means
  // "not configured", not "a different department"; otherwise a vertical
  // stack of ordinary unassigned positions gets the large department gap.
  const sameDepartment = departmentOf(first) === departmentOf(second)
  if (sameDepartment) return SIBLING_GAP
  return axis === 'horizontal' ? DEPARTMENT_HORIZONTAL_GAP : DEPARTMENT_VERTICAL_GAP
}

function departmentLevelGap(parent: HierarchyInput, childMembers: HierarchyInput[]) {
  const parentDepartment = departmentOf(parent)
  return childMembers.some((child) => {
    const childDepartment = departmentOf(child)
    return parentDepartment !== null && childDepartment !== null && childDepartment !== parentDepartment
  })
    ? DEPARTMENT_VERTICAL_GAP
    : LEVEL_GAP
}

function collectVisibleDescendants(
  anchorId: string,
  children: Map<string | null, HierarchyInput[]>,
  visibleIds: Set<string>,
) {
  const result = new Set<string>()
  const queue = [anchorId]
  while (queue.length) {
    const current = queue.shift()!
    if (!visibleIds.has(current) || result.has(current)) continue
    result.add(current)
    for (const child of children.get(current) ?? []) queue.push(child.id)
  }
  return result
}

function getNodeDepth(byId: Map<string, HierarchyInput>, id: string) {
  let depth = 0
  let cursor = byId.get(id)
  const visited = new Set<string>()
  while (cursor && parentOf(cursor) && !visited.has(parentOf(cursor)!)) {
    const parentId = parentOf(cursor)!
    visited.add(parentId)
    cursor = byId.get(parentId)
    depth += 1
  }
  return depth
}

function buildDepartmentFrameRects(
  members: HierarchyInput[],
  positions: Record<string, Point>,
  visibleIds: Set<string>,
  nodeHeights: Record<string, number>,
) {
  const byId = new Map(members.map((member) => [member.id, member]))
  const grouped = new Map<string, HierarchyInput[]>()
  for (const member of members) {
    const departmentId = departmentOf(member)
    if (!departmentId || !visibleIds.has(member.id) || !positions[member.id]) continue
    const group = grouped.get(departmentId) ?? []
    group.push(member)
    grouped.set(departmentId, group)
  }

  return [...grouped.entries()].map(([departmentId, group]) => {
    const anchor = [...group].sort((first, second) => {
      const firstHasForeignParent = parentOf(first) === null || departmentOf(byId.get(parentOf(first)! ) ?? first) !== departmentId
      const secondHasForeignParent = parentOf(second) === null || departmentOf(byId.get(parentOf(second)! ) ?? second) !== departmentId
      return Number(secondHasForeignParent) - Number(firstHasForeignParent)
        || getNodeDepth(byId, first.id) - getNodeDepth(byId, second.id)
        || first.order - second.order
        || first.id.localeCompare(second.id)
    })[0]
    const bounds = group.reduce((current, member) => {
      const point = positions[member.id]
      const height = nodeHeights[member.id] ?? ORG_NODE_HEIGHT
      return {
        minX: Math.min(current.minX, point.x),
        minY: Math.min(current.minY, point.y),
        maxX: Math.max(current.maxX, point.x + ORG_NODE_WIDTH),
        maxY: Math.max(current.maxY, point.y + height),
      }
    }, { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY })
    return {
      departmentId,
      anchorId: anchor.id,
      x: bounds.minX - DEPARTMENT_FRAME_PADDING_X,
      y: bounds.minY - DEPARTMENT_FRAME_PADDING_TOP,
      width: bounds.maxX - bounds.minX + DEPARTMENT_FRAME_PADDING_X * 2,
      height: bounds.maxY - bounds.minY + DEPARTMENT_FRAME_PADDING_TOP + DEPARTMENT_FRAME_PADDING_BOTTOM,
    }
  }).sort((first, second) => getNodeDepth(byId, first.anchorId) - getNodeDepth(byId, second.anchorId)
    || (byId.get(first.anchorId)?.order ?? 0) - (byId.get(second.anchorId)?.order ?? 0)
    || first.anchorId.localeCompare(second.anchorId)
    || first.departmentId.localeCompare(second.departmentId))
}

function framesOverlap(first: DepartmentFrameRect, second: DepartmentFrameRect) {
  return first.x < second.x + second.width + DEPARTMENT_FRAME_GAP
    && first.x + first.width + DEPARTMENT_FRAME_GAP > second.x
    && first.y < second.y + second.height + DEPARTMENT_FRAME_GAP
    && first.y + first.height + DEPARTMENT_FRAME_GAP > second.y
}

/**
 * Keeps the single department-frame visual language honest. The tree layout
 * remains authoritative; only whole position branches are translated when two
 * derived department frames would otherwise overlap.
 */
function resolveDepartmentFrameOverlaps(
  members: HierarchyInput[],
  layout: LayoutResult,
  children: Map<string | null, HierarchyInput[]>,
  nodeHeights: Record<string, number>,
): LayoutResult {
  if (!members.some((member) => departmentOf(member))) return layout
  const positions = Object.fromEntries(Object.entries(layout.positions).map(([id, point]) => [id, { x: point.x + ORGANIZATION_LEVEL_LABEL_WIDTH, y: point.y }]))
  const maxPasses = Math.max(1, members.length * members.length * 4)

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const frames = buildDepartmentFrameRects(members, positions, layout.visibleIds, nodeHeights)
    let collisionResolved = false

    outer: for (let firstIndex = 0; firstIndex < frames.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < frames.length; secondIndex += 1) {
        const fixed = frames[firstIndex]
        const moving = frames[secondIndex]
        if (!framesOverlap(fixed, moving)) continue

        const movedIds = collectVisibleDescendants(moving.anchorId, children, layout.visibleIds)
        if (movedIds.has(fixed.anchorId)) continue
        const moveRight = fixed.x + fixed.width + DEPARTMENT_FRAME_GAP - moving.x
        const moveDown = fixed.y + fixed.height + DEPARTMENT_FRAME_GAP - moving.y
        const offset = moveRight <= moveDown
          ? { x: Math.max(0, moveRight), y: 0 }
          : { x: 0, y: Math.max(0, moveDown) }

        for (const id of movedIds) {
          const point = positions[id]
          if (point) positions[id] = { x: point.x + offset.x, y: point.y + offset.y }
        }
        collisionResolved = true
        break outer
      }
    }

    if (!collisionResolved) break
  }

  const visibleMembers = members.filter((member) => layout.visibleIds.has(member.id) && positions[member.id])
  return {
    ...layout,
    positions,
    width: visibleMembers.reduce((maximum, member) => Math.max(maximum, positions[member.id].x + ORG_NODE_WIDTH), 0),
    height: visibleMembers.reduce((maximum, member) => Math.max(maximum, positions[member.id].y + (nodeHeights[member.id] ?? ORG_NODE_HEIGHT)), 0),
  }
}

interface OrganizationLevelLayoutOptions {
  mode?: 'tree' | 'levels'
  levels?: OrganizationLevel[]
  positionYOverrides?: Record<string, number>
}

function organizationLevelOf(member: HierarchyInput) {
  return 'organizationLevelId' in member ? member.organizationLevelId : null
}

function applyOrganizationLevelBands(
  members: HierarchyInput[],
  layout: LayoutResult,
  nodeHeights: Record<string, number>,
  levels: OrganizationLevel[],
): LayoutResult {
  const positions = Object.fromEntries(Object.entries(layout.positions).map(([id, point]) => [id, { ...point }]))
  const originalPositions = Object.fromEntries(Object.entries(layout.positions).map(([id, point]) => [id, { ...point }]))
  const visibleMembers = members.filter((member) => layout.visibleIds.has(member.id) && positions[member.id])
  const memberByLevel = new Map<string, HierarchyInput[]>()
  for (const member of visibleMembers) {
    const levelId = organizationLevelOf(member)
    if (!levelId) continue
    const group = memberByLevel.get(levelId) ?? []
    group.push(member)
    memberByLevel.set(levelId, group)
  }

  const levelBands: OrganizationLevelBand[] = []
  let bandY = 28
  for (const level of [...levels].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))) {
    const group = [...(memberByLevel.get(level.id) ?? [])].sort((first, second) => (
      originalPositions[first.id].y - originalPositions[second.id].y
      || originalPositions[first.id].x - originalPositions[second.id].x
      || first.order - second.order
      || first.id.localeCompare(second.id)
    ))
    const placed: Array<{ x: number; y: number; width: number; height: number }> = []
    const positionById = new Map(group.map((member) => [member.id, {
      member,
      // A level guide is the shared top baseline for that level. Preserve
      // branch structure through X positions and only move cards downward
      // when their horizontal ranges actually collide.
      desiredY: bandY,
    }]))

    for (const member of group) {
      const candidate = positionById.get(member.id)!
      let y = candidate.desiredY
      const height = nodeHeights[member.id] ?? ORG_NODE_HEIGHT
      const x = positions[member.id].x
      const overlappingPlaced = placed
        .filter((other) => x < other.x + other.width
          && x + ORG_NODE_WIDTH > other.x)
        .sort((first, second) => first.y - second.y)
      for (const other of overlappingPlaced) {
        if (y < other.y + other.height + ORGANIZATION_LEVEL_NODE_GAP) {
          y = other.y + other.height + ORGANIZATION_LEVEL_NODE_GAP
        }
      }
      positions[member.id] = { x, y }
      placed.push({ x, y, width: ORG_NODE_WIDTH, height })
    }

    const height = group.length > 0
      ? Math.max(...group.map((member) => positions[member.id].y + (nodeHeights[member.id] ?? ORG_NODE_HEIGHT))) - bandY
      : ORG_NODE_HEIGHT
    levelBands.push({ levelId: level.id, name: level.name, order: level.order, y: bandY, height })
    bandY += height + ORGANIZATION_LEVEL_BAND_GAP
  }

  const unassigned = visibleMembers.filter((member) => !organizationLevelOf(member))
  if (unassigned.length > 0) {
    const minimumY = bandY
    const originalMinimum = unassigned.reduce((minimum, member) => Math.min(minimum, positions[member.id].y), Number.POSITIVE_INFINITY)
    for (const member of unassigned) positions[member.id].y = minimumY + positions[member.id].y - originalMinimum
  }

  return {
    ...layout,
    positions,
    levelBands,
    width: visibleMembers.reduce((maximum, member) => Math.max(maximum, positions[member.id].x + ORG_NODE_WIDTH), 0),
    height: visibleMembers.reduce((maximum, member) => Math.max(maximum, positions[member.id].y + (nodeHeights[member.id] ?? ORG_NODE_HEIGHT)), 0),
  }
}

function applyPositionYOverrides(
  members: HierarchyInput[],
  layout: LayoutResult,
  nodeHeights: Record<string, number>,
  positionYOverrides: Record<string, number> | undefined,
): LayoutResult {
  if (!positionYOverrides) return layout
  const positions = Object.fromEntries(Object.entries(layout.positions).map(([id, point]) => [id, { ...point }]))
  for (const member of members) {
    const override = positionYOverrides[member.id]
    if (!layout.visibleIds.has(member.id) || !Number.isFinite(override)) continue
    positions[member.id] = { ...positions[member.id], y: Math.max(0, override) }
  }
  const visibleMembers = members.filter((member) => layout.visibleIds.has(member.id) && positions[member.id])
  return {
    ...layout,
    positions,
    height: visibleMembers.reduce((maximum, member) => Math.max(maximum, positions[member.id].y + (nodeHeights[member.id] ?? ORG_NODE_HEIGHT)), 0),
  }
}

export function layoutOrganization(
  members: HierarchyInput[],
  nodeHeights: Record<string, number> = {},
  options: OrganizationLevelLayoutOptions = {},
): LayoutResult {
  const byId = new Map(members.map((member) => [member.id, member]))
  const children = orderedChildren(members)
  const visibleIds = new Set<string>()
  const visiting = new Set<string>()

  const buildSubtree = (id: string): SubtreeLayout => {
    if (visiting.has(id)) {
      throw new Error(`Circular organization hierarchy detected at ${id}`)
    }

    const member = byId.get(id)
    if (!member) {
      throw new Error(`Unknown organization member: ${id}`)
    }

    visiting.add(id)
    visibleIds.add(id)
    const nodeHeight = nodeHeights[id] ?? ORG_NODE_HEIGHT

    const childMembers = member.collapsed ? [] : (children.get(id) ?? [])
    const childLayouts = childMembers.map((child) => buildSubtree(child.id))
    const positions: Record<string, Point> = {}

    if (childLayouts.length === 0) {
      positions[id] = { x: 0, y: 0 }
      visiting.delete(id)
      return {
        width: ORG_NODE_WIDTH,
        height: nodeHeight,
        root: { x: 0, y: 0 },
        positions,
      }
    }

    if (member.childrenAxis === 'horizontal') {
      const horizontalGaps = childMembers.slice(1).map((child, index) => siblingGap(childMembers[index], child, 'horizontal'))
      const childrenWidth = childLayouts.reduce((sum, child) => sum + child.width, 0)
        + horizontalGaps.reduce((sum, gap) => sum + gap, 0)
      const width = Math.max(ORG_NODE_WIDTH, childrenWidth)
      const startX = (width - childrenWidth) / 2
      const childY = nodeHeight + departmentLevelGap(member, childMembers)
      let cursorX = startX
      let maxChildHeight = 0

      for (let index = 0; index < childLayouts.length; index += 1) {
        const child = childLayouts[index]
        translate(child.positions, cursorX, childY, positions)
        cursorX += child.width + (horizontalGaps[index] ?? 0)
        maxChildHeight = Math.max(maxChildHeight, child.height)
      }

      const root = { x: (width - ORG_NODE_WIDTH) / 2, y: 0 }
      positions[id] = root
      visiting.delete(id)
      return {
        width,
        height: childY + maxChildHeight,
        root,
        positions,
      }
    }

    const verticalGaps = childMembers.slice(1).map((child, index) => siblingGap(childMembers[index], child, 'vertical'))
    const childrenHeight = childLayouts.reduce((sum, child) => sum + child.height, 0)
      + verticalGaps.reduce((sum, gap) => sum + gap, 0)
    const childrenStartY = nodeHeight + departmentLevelGap(member, childMembers)
    // Vertical children stack below the parent with a small right offset.
    // This keeps the branch compact instead of pushing the entire child tree beside it.
    const childX = VERTICAL_CHILD_OFFSET
    let cursorY = childrenStartY
    let maxChildWidth = 0

    for (let index = 0; index < childLayouts.length; index += 1) {
      const child = childLayouts[index]
      translate(child.positions, childX, cursorY, positions)
      cursorY += child.height + (verticalGaps[index] ?? 0)
      maxChildWidth = Math.max(maxChildWidth, child.width)
    }

    const root = { x: 0, y: 0 }
    positions[id] = root
    visiting.delete(id)
    return {
      width: Math.max(ORG_NODE_WIDTH, childX + maxChildWidth),
      height: childrenStartY + childrenHeight,
      root,
      positions,
    }
  }

  const roots = (children.get(null) ?? []).filter((root) => byId.has(root.id))
  const rootLayouts = roots.map((root) => buildSubtree(root.id))
  const positions: Record<string, Point> = {}
  let cursorX = 0
  let height = 0

  for (let index = 0; index < rootLayouts.length; index += 1) {
    const root = rootLayouts[index]
    translate(root.positions, cursorX, 0, positions)
    const nextRoot = roots[index + 1]
    cursorX += root.width + (nextRoot ? siblingGap(roots[index], nextRoot, 'horizontal') : 0)
    height = Math.max(height, root.height)
  }

  const baseLayout = {
    positions,
    visibleIds,
    width: Math.max(0, cursorX),
    height,
  }
  const treeLayout = resolveDepartmentFrameOverlaps(members, baseLayout, children, nodeHeights)
  return options.mode === 'levels' && options.levels
    ? applyOrganizationLevelBands(members, treeLayout, nodeHeights, options.levels)
    : applyPositionYOverrides(members, treeLayout, nodeHeights, options.positionYOverrides)
}

export function isDescendant(
  members: HierarchyInput[],
  possibleDescendantId: string,
  ancestorId: string,
) {
  const byId = new Map(members.map((member) => [member.id, member]))
  let cursor = byId.get(possibleDescendantId)
  const visited = new Set<string>()

  while (cursor && parentOf(cursor)) {
    const parentId = parentOf(cursor)!
    if (parentId === ancestorId) return true
    if (visited.has(parentId)) return false
    visited.add(parentId)
    cursor = byId.get(parentId)
  }

  return false
}

export function getDepth(members: HierarchyInput[], id: string) {
  const byId = new Map(members.map((member) => [member.id, member]))
  let depth = 1
  let cursor = byId.get(id)
  const visited = new Set<string>()

  while (cursor && parentOf(cursor) && !visited.has(parentOf(cursor)!)) {
    const parentId = parentOf(cursor)!
    visited.add(parentId)
    cursor = byId.get(parentId)
    depth += 1
  }

  return depth
}

export function normalizeOrders(members: HierarchyInput[], parentId: string | null) {
  const ordered = members
    .filter((member) => parentOf(member) === parentId)
    .sort((a, b) => a.order - b.order)
    .map((member, order) => ({ ...member, order }))
  const orderById = new Map(ordered.map((member) => [member.id, member.order]))

  return members.map((member) => {
    const order = orderById.get(member.id)
    return order === undefined ? member : { ...member, order }
  })
}
