import type { HierarchyNode, OrgDirectoryState, OrgMember, Position } from './types'

export type OrganizationValidationCode =
  | 'DUPLICATE_POSITION_ID'
  | 'DUPLICATE_LAYOUT_ID'
  | 'MISSING_LAYOUT'
  | 'ORPHAN_LAYOUT'
  | 'UNKNOWN_DEPARTMENT'
  | 'MISSING_PARENT'
  | 'SELF_PARENT'
  | 'HIERARCHY_CYCLE'
  | 'DEPARTMENT_DISCONNECTED'
  | 'DUPLICATE_LEVEL_ID'
  | 'DUPLICATE_LEVEL_ORDER'
  | 'DUPLICATE_LEVEL_NAME'
  | 'INVALID_LEVEL_ORDER'
  | 'EMPTY_LEVEL_CATALOG'
  | 'UNKNOWN_ORGANIZATION_LEVEL'
  | 'INVALID_PARENT_LEVEL_ORDER'
  | 'INCOMPLETE_LEVEL_ASSIGNMENT'

export type OrganizationValidationResult =
  | { ok: true }
  | {
      ok: false
      code: OrganizationValidationCode
      positionIds: string[]
    departmentIds: string[]
    }

export interface OrganizationValidationOptions {
  allowDisconnectedDepartments?: boolean
}

function issue(
  code: OrganizationValidationCode,
  positionIds: string[] = [],
  departmentIds: string[] = [],
): OrganizationValidationResult {
  return { ok: false, code, positionIds, departmentIds }
}

function duplicateIds<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const item of items) {
    if (seen.has(item.id) && !duplicates.includes(item.id)) duplicates.push(item.id)
    seen.add(item.id)
  }
  return duplicates
}

export function buildHierarchyNodes(state: OrgDirectoryState): HierarchyNode[] {
  const memberById = new Map(state.members.map((member) => [member.id, member]))
  return state.positions
    .filter((position) => position.status === 'active')
    .flatMap((position) => {
      const member = memberById.get(position.id)
      if (!member) return []
      return [{
        ...member,
        parentId: position.parentPositionId,
        organizationLevelId: position.organizationLevelId,
        departmentId: position.departmentId,
        title: position.title,
      }]
    })
}

export function buildHierarchyNodesFromParts(
  positions: Position[],
  members: OrgMember[],
): HierarchyNode[] {
  const memberById = new Map(members.map((member) => [member.id, member]))
  return positions
    .filter((position) => position.status === 'active')
    .flatMap((position) => {
      const member = memberById.get(position.id)
      if (!member) return []
      return [{
        ...member,
        parentId: position.parentPositionId,
        organizationLevelId: position.organizationLevelId,
        departmentId: position.departmentId,
        title: position.title,
      }]
    })
}

function validateHierarchy(nodes: HierarchyNode[]): OrganizationValidationResult {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const missingParentIds = nodes
    .filter((node) => node.parentId !== null && !byId.has(node.parentId))
    .map((node) => node.id)
  if (missingParentIds.length) return issue('MISSING_PARENT', missingParentIds)

  const selfParentIds = nodes.filter((node) => node.parentId === node.id).map((node) => node.id)
  if (selfParentIds.length) return issue('SELF_PARENT', selfParentIds)

  const state = new Map<string, 0 | 1 | 2>()
  const cycleIds: string[] = []
  const visit = (id: string) => {
    const mark = state.get(id) ?? 0
    if (mark === 1) {
      cycleIds.push(id)
      return
    }
    if (mark === 2) return
    state.set(id, 1)
    const parentId = byId.get(id)?.parentId
    if (parentId !== null && parentId !== undefined && byId.has(parentId)) visit(parentId)
    state.set(id, 2)
  }
  for (const node of nodes) visit(node.id)
  if (cycleIds.length) return issue('HIERARCHY_CYCLE', [...new Set(cycleIds)])
  return { ok: true }
}

function validateDepartmentConnectivity(nodes: HierarchyNode[]): OrganizationValidationResult {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) adjacency.set(node.id, new Set())
  for (const node of nodes) {
    if (node.parentId === null) continue
    const parent = byId.get(node.parentId)
    if (parent?.departmentId && parent.departmentId === node.departmentId && node.departmentId) {
      adjacency.get(node.id)?.add(parent.id)
      adjacency.get(parent.id)?.add(node.id)
    }
  }

  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.departmentId) continue
    const group = groups.get(node.departmentId) ?? []
    group.push(node.id)
    groups.set(node.departmentId, group)
  }
  for (const [departmentId, ids] of groups) {
    if (ids.length <= 1) continue
    const seen = new Set<string>([ids[0]])
    const queue = [ids[0]]
    while (queue.length) {
      const current = queue.shift()!
      for (const adjacent of adjacency.get(current) ?? []) {
        if (!seen.has(adjacent)) {
          seen.add(adjacent)
          queue.push(adjacent)
        }
      }
    }
    if (seen.size !== ids.length) return issue('DEPARTMENT_DISCONNECTED', ids, [departmentId])
  }
  return { ok: true }
}

export function validateOrganizationState(
  state: OrgDirectoryState,
  options: OrganizationValidationOptions = {},
): OrganizationValidationResult {
  const positionDuplicates = duplicateIds(state.positions)
  if (positionDuplicates.length) return issue('DUPLICATE_POSITION_ID', positionDuplicates)
  const layoutDuplicates = duplicateIds(state.members)
  if (layoutDuplicates.length) return issue('DUPLICATE_LAYOUT_ID', layoutDuplicates)

  const activePositions = state.positions.filter((position) => position.status === 'active')
  const activeIds = new Set(activePositions.map((position) => position.id))
  const layoutIds = new Set(state.members.map((member) => member.id))
  const missingLayoutIds = activePositions.filter((position) => !layoutIds.has(position.id)).map((position) => position.id)
  if (missingLayoutIds.length) return issue('MISSING_LAYOUT', missingLayoutIds)
  const orphanLayoutIds = state.members.filter((member) => !activeIds.has(member.id)).map((member) => member.id)
  if (orphanLayoutIds.length) return issue('ORPHAN_LAYOUT', orphanLayoutIds)

  if (state.organizationLevels.length === 0) return issue('EMPTY_LEVEL_CATALOG')
  const levelIdDuplicates = duplicateIds(state.organizationLevels)
  if (levelIdDuplicates.length) return issue('DUPLICATE_LEVEL_ID')
  const levelOrders = state.organizationLevels.map((level) => level.order)
  if (new Set(levelOrders).size !== levelOrders.length) return issue('DUPLICATE_LEVEL_ORDER')
  const sortedOrders = [...levelOrders].sort((first, second) => first - second)
  if (sortedOrders.some((order, index) => !Number.isInteger(order) || order !== index)) return issue('INVALID_LEVEL_ORDER')
  const levelNames = state.organizationLevels.map((level) => level.name.trim())
  if (levelNames.some((name) => !name) || new Set(levelNames).size !== levelNames.length) return issue('DUPLICATE_LEVEL_NAME')
  const levelById = new Map(state.organizationLevels.map((level) => [level.id, level]))
  const unknownLevelPositionIds = state.positions
    .filter((position) => position.organizationLevelId !== null && !levelById.has(position.organizationLevelId))
    .map((position) => position.id)
  if (unknownLevelPositionIds.length) return issue('UNKNOWN_ORGANIZATION_LEVEL', unknownLevelPositionIds)

  const departmentIds = new Set(state.departments.map((department) => department.id))
  const unknownDepartmentIds = activePositions
    .filter((position) => position.departmentId !== null && !departmentIds.has(position.departmentId))
    .map((position) => position.id)
  if (unknownDepartmentIds.length) return issue('UNKNOWN_DEPARTMENT', unknownDepartmentIds)

  const nodes = buildHierarchyNodes(state)
  const hierarchyResult = validateHierarchy(nodes)
  if (!hierarchyResult.ok) return hierarchyResult
  const positionById = new Map(activePositions.map((position) => [position.id, position]))
  const invalidLevelOrderIds = activePositions.flatMap((position) => {
    if (!position.parentPositionId || !position.organizationLevelId) return []
    const parent = positionById.get(position.parentPositionId)
    if (!parent?.organizationLevelId) return []
    const parentOrder = levelById.get(parent.organizationLevelId)?.order
    const childOrder = levelById.get(position.organizationLevelId)?.order
    return parentOrder === undefined || childOrder === undefined || parentOrder >= childOrder
      ? [parent.id, position.id]
      : []
  })
  if (invalidLevelOrderIds.length) return issue('INVALID_PARENT_LEVEL_ORDER', [...new Set(invalidLevelOrderIds)])
  if (state.organizationLayout.mode === 'levels') {
    const incompleteIds = activePositions.filter((position) => position.organizationLevelId === null).map((position) => position.id)
    if (incompleteIds.length) return issue('INCOMPLETE_LEVEL_ASSIGNMENT', incompleteIds)
  }
  if (options.allowDisconnectedDepartments) return { ok: true }
  return validateDepartmentConnectivity(nodes)
}

export function collectActiveBranchIds(state: OrgDirectoryState, rootId: string) {
  const nodes = buildHierarchyNodes(state)
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

export function getHierarchyDepth(nodes: HierarchyNode[], id: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let depth = 1
  let cursor = byId.get(id)
  const visited = new Set<string>()
  while (cursor?.parentId && !visited.has(cursor.parentId)) {
    visited.add(cursor.parentId)
    cursor = byId.get(cursor.parentId)
    depth += 1
  }
  return depth
}

export function isHierarchyDescendant(nodes: HierarchyNode[], possibleDescendantId: string, ancestorId: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let cursor = byId.get(possibleDescendantId)
  const visited = new Set<string>()
  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) return true
    if (visited.has(cursor.parentId)) return false
    visited.add(cursor.parentId)
    cursor = byId.get(cursor.parentId)
  }
  return false
}
