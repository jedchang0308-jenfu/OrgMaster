import {
  DEPARTMENT_FRAME_PADDING_BOTTOM,
  DEPARTMENT_FRAME_PADDING_TOP,
  DEPARTMENT_FRAME_PADDING_X,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
} from './layout'
import type { Department, HierarchyNode, LayoutResult } from './types'

export interface DepartmentGroupView {
  departmentId: string
  label: string
  visiblePositionIds: string[]
  anchorPositionId: string
  bounds: { x: number; y: number; width: number; height: number }
  paletteIndex: number
}

export interface DepartmentGroupInput {
  nodes: HierarchyNode[]
  layout: LayoutResult
  departments: Department[]
  nodeHeights?: Record<string, number>
  getDepartmentName?: (departmentId: string | null) => string
}

/**
 * Calculates the visual frame for each department without changing the hierarchy.
 * V1 validation guarantees one connected department subtree; this layer only paints it.
 */
export function buildDepartmentGroups({
  nodes,
  layout,
  departments,
  nodeHeights = {},
  getDepartmentName = (departmentId) => departments.find((item) => item.id === departmentId)?.name ?? '未設定部門',
}: DepartmentGroupInput): DepartmentGroupView[] {
  const grouped = new Map<string, HierarchyNode[]>()
  for (const node of nodes) {
    if (!node.departmentId || !layout.visibleIds.has(node.id) || !layout.positions[node.id]) continue
    const group = grouped.get(node.departmentId) ?? []
    group.push(node)
    grouped.set(node.departmentId, group)
  }

  return [...grouped.entries()]
    .map(([departmentId, group]) => ({ departmentId, group }))
    .sort((first, second) => {
      const firstAnchor = [...first.group].sort(anchorComparator(nodes))[0]
      const secondAnchor = [...second.group].sort(anchorComparator(nodes))[0]
      return getDepth(nodes, firstAnchor.id) - getDepth(nodes, secondAnchor.id)
        || firstAnchor.order - secondAnchor.order
        || firstAnchor.id.localeCompare(secondAnchor.id)
        || first.departmentId.localeCompare(second.departmentId)
    })
    .map(({ departmentId, group }) => {
      const bounds = group.reduce((current, node) => {
        const point = layout.positions[node.id]
        const height = nodeHeights[node.id] ?? ORG_NODE_HEIGHT
        return {
          minX: Math.min(current.minX, point.x),
          minY: Math.min(current.minY, point.y),
          maxX: Math.max(current.maxX, point.x + ORG_NODE_WIDTH),
          maxY: Math.max(current.maxY, point.y + height),
        }
      }, { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY })
      const paddedBounds = {
        x: bounds.minX - DEPARTMENT_FRAME_PADDING_X,
        y: bounds.minY - DEPARTMENT_FRAME_PADDING_TOP,
        width: bounds.maxX - bounds.minX + DEPARTMENT_FRAME_PADDING_X * 2,
        height: bounds.maxY - bounds.minY + DEPARTMENT_FRAME_PADDING_TOP + DEPARTMENT_FRAME_PADDING_BOTTOM,
      }
      const anchor = [...group].sort((first, second) => {
        const firstDepth = getDepth(nodes, first.id)
        const secondDepth = getDepth(nodes, second.id)
        return firstDepth - secondDepth || first.order - second.order || first.id.localeCompare(second.id)
      })[0]
      return {
        departmentId,
        label: getDepartmentName(departmentId),
        visiblePositionIds: group.map((node) => node.id),
        anchorPositionId: anchor.id,
        bounds: paddedBounds,
        paletteIndex: stablePaletteIndex(departmentId),
      }
    })
}

function anchorComparator(nodes: HierarchyNode[]) {
  return (first: HierarchyNode, second: HierarchyNode) => getDepth(nodes, first.id) - getDepth(nodes, second.id) || first.order - second.order || first.id.localeCompare(second.id)
}

function stablePaletteIndex(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0
  return Math.abs(hash) % 6
}

function getDepth(nodes: HierarchyNode[], id: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let depth = 0
  let cursor = byId.get(id)
  const seen = new Set<string>()
  while (cursor?.parentId && !seen.has(cursor.parentId)) {
    seen.add(cursor.parentId)
    cursor = byId.get(cursor.parentId)
    depth += 1
  }
  return depth
}
