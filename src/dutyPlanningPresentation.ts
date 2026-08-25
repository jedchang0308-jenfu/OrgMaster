import { dutyColumnForRelation, dutyMatrixColumnForResponsibilityColumn, type DutyMatrixColumn, type DutyResponsibilityColumn } from './dutyPlacement'
import { deriveDutyAnomalies, type DutyAnomaly, type DutyAnomalyType } from './duties'
import type { Department, Duty, DutyRelationType, OrganizationLevel, OrgDirectoryState, OrgMember, Position } from './types'

export type DutyPlanningViewportMode = 'wide' | 'medium' | 'narrow'

export interface DutyMatrixRow {
  dutyId: string
  relationId: string
  positionId: string
  column: DutyResponsibilityColumn
  matrixColumn: DutyMatrixColumn
  relationType: DutyRelationType
  isPrimaryExecutor: boolean
  draggable: boolean
}

export type DutyResponsibilityFilter = 'all' | DutyMatrixColumn

export interface DutyPositionSummary {
  position: Position
  counts: Record<DutyMatrixColumn, number>
  total: number
}

export interface DutyPositionResponsibilityGroup {
  id: DutyMatrixColumn
  label: '執行' | '審核' | '協作'
  rows: DutyMatrixRow[]
}

export interface DutyExpandedPositionSection {
  position: Position
  department: Department | null
  groups: DutyPositionResponsibilityGroup[]
  hasAnyRelation: boolean
  hasVisibleRelation: boolean
}

export interface DutyAnomalyCategoryItem {
  duty: Duty
  anomaly: DutyAnomaly
  context: string | null
}

export interface DutyAnomalyCategory {
  id: DutyAnomalyType
  label: '無執行職位' | '缺少主執行' | '待重新分配'
  items: DutyAnomalyCategoryItem[]
}

const DUTY_MASTER_COLUMNS: Array<{ id: DutyMatrixColumn; label: DutyPositionResponsibilityGroup['label'] }> = [
  { id: 'execute', label: '執行' },
  { id: 'review', label: '審核' },
  { id: 'collaborate', label: '協作' },
]

export function getDutyPlanningViewportMode(width: number): DutyPlanningViewportMode {
  if (width >= 1280) return 'wide'
  if (width >= 1024) return 'medium'
  return 'narrow'
}

function orderDepartmentsByHierarchy(departments: Department[]) {
  const departmentById = new Map(departments.map((department) => [department.id, department]))
  const sourceOrder = new Map(departments.map((department, index) => [department.id, index]))
  const childrenByParent = new Map<string | null, Department[]>()
  for (const department of departments) {
    const parentId = department.parentId && departmentById.has(department.parentId) ? department.parentId : null
    const children = childrenByParent.get(parentId) ?? []
    children.push(department)
    childrenByParent.set(parentId, children)
  }
  for (const children of childrenByParent.values()) {
    children.sort((first, second) => (sourceOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER))
  }
  const ordered: Department[] = []
  const visited = new Set<string>()
  const visit = (department: Department) => {
    if (visited.has(department.id)) return
    visited.add(department.id)
    ordered.push(department)
    for (const child of childrenByParent.get(department.id) ?? []) visit(child)
  }
  for (const root of childrenByParent.get(null) ?? []) visit(root)
  for (const department of departments) visit(department)
  return ordered
}

export function sortDutyMatrixPositions(
  positions: Position[],
  departments: Department[],
  members: OrgMember[],
  organizationLevels: OrganizationLevel[],
) {
  const activePositions = positions.filter((position) => position.status === 'active')
  const memberOrderById = new Map(members.map((member) => [member.id, member.order]))
  const levelOrderById = new Map(organizationLevels.map((level) => [level.id, level.order]))
  const knownDepartmentIds = new Set(departments.map((department) => department.id))
  const orderedDepartmentIds = orderDepartmentsByHierarchy(departments).map((department) => department.id)
  const unknownDepartmentIds = [...new Set(activePositions
    .map((position) => position.departmentId)
    .filter((departmentId): departmentId is string => Boolean(departmentId && !knownDepartmentIds.has(departmentId))))]
    .sort((first, second) => first.localeCompare(second))
  const groupIds: Array<string | null> = [...orderedDepartmentIds, ...unknownDepartmentIds, null]
  const compareSiblings = (first: Position, second: Position) => {
    const memberOrder = (memberOrderById.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (memberOrderById.get(second.id) ?? Number.MAX_SAFE_INTEGER)
    if (memberOrder) return memberOrder
    const levelOrder = (levelOrderById.get(first.organizationLevelId ?? '') ?? Number.MAX_SAFE_INTEGER) - (levelOrderById.get(second.organizationLevelId ?? '') ?? Number.MAX_SAFE_INTEGER)
    return levelOrder || first.title.localeCompare(second.title, 'zh-Hant') || first.id.localeCompare(second.id)
  }
  const compareRoots = (first: Position, second: Position) => {
    const levelOrder = (levelOrderById.get(first.organizationLevelId ?? '') ?? Number.MAX_SAFE_INTEGER) - (levelOrderById.get(second.organizationLevelId ?? '') ?? Number.MAX_SAFE_INTEGER)
    return levelOrder || compareSiblings(first, second)
  }
  const ordered: Position[] = []
  const visited = new Set<string>()
  for (const departmentId of groupIds) {
    const group = activePositions.filter((position) => position.departmentId === departmentId)
    if (group.length === 0) continue
    const groupIdsSet = new Set(group.map((position) => position.id))
    const childrenByParent = new Map<string, Position[]>()
    for (const position of group) {
      if (!position.parentPositionId || !groupIdsSet.has(position.parentPositionId)) continue
      const children = childrenByParent.get(position.parentPositionId) ?? []
      children.push(position)
      childrenByParent.set(position.parentPositionId, children)
    }
    for (const children of childrenByParent.values()) children.sort(compareSiblings)
    const visit = (position: Position) => {
      if (visited.has(position.id)) return
      visited.add(position.id)
      ordered.push(position)
      for (const child of childrenByParent.get(position.id) ?? []) visit(child)
    }
    const roots = group
      .filter((position) => !position.parentPositionId || !groupIdsSet.has(position.parentPositionId))
      .sort(compareRoots)
    for (const root of roots) visit(root)
    // Invalid legacy cycles must not make a position disappear from this read-only projection.
    for (const position of [...group].sort(compareRoots)) visit(position)
  }
  // Active positions with unusual department values remain visible as a final fail-safe.
  for (const position of activePositions) {
    if (visited.has(position.id)) continue
    ordered.push(position)
  }
  return ordered
}

function activeRelations(state: OrgDirectoryState) {
  return state.dutyPositionRelations.filter((relation) => relation.target.kind === 'position')
}

function normalizedDutyQuery(value: string | undefined) {
  return value?.trim().toLocaleLowerCase('zh-Hant') ?? ''
}

function matchingDutyIds(state: OrgDirectoryState, query: string) {
  const normalized = normalizedDutyQuery(query)
  if (!normalized) return null
  return new Set(state.duties
    .filter((duty) => duty.title.toLocaleLowerCase('zh-Hant').includes(normalized)
      || (duty.description ?? '').toLocaleLowerCase('zh-Hant').includes(normalized))
    .map((duty) => duty.id))
}

export function buildDutyMatrixRows(state: OrgDirectoryState, positions: Position[]) {
  const chips: DutyMatrixRow[] = activeRelations(state).map((relation) => ({
    dutyId: relation.dutyId,
    relationId: relation.id,
    positionId: relation.target.kind === 'position' ? relation.target.positionId : '',
    column: dutyColumnForRelation(relation),
    matrixColumn: dutyMatrixColumnForResponsibilityColumn(dutyColumnForRelation(relation)),
    relationType: relation.relationType,
    isPrimaryExecutor: relation.isPrimaryExecutor,
    draggable: true,
  }))
  const positionIds = new Set(positions.map((position) => position.id))
  return chips.filter((chip) => positionIds.has(chip.positionId))
}

export function buildDutyMasterPositionSummaries(
  state: OrgDirectoryState,
  sortedPositions: Position[],
  filters: { dutyQuery: string; positionQuery: string; departmentId: string },
): DutyPositionSummary[] {
  const positionQuery = normalizedDutyQuery(filters.positionQuery)
  const dutyIds = matchingDutyIds(state, filters.dutyQuery)
  const positions = sortedPositions.filter((position) => {
    const matchesPosition = !positionQuery || position.title.toLocaleLowerCase('zh-Hant').includes(positionQuery)
    const matchesDepartment = !filters.departmentId || position.departmentId === filters.departmentId
    return matchesPosition && matchesDepartment
  })
  const rows = buildDutyMatrixRows(state, positions)
  const countsByPosition = new Map<string, Record<DutyMatrixColumn, number>>()
  for (const position of positions) {
    countsByPosition.set(position.id, { execute: 0, review: 0, collaborate: 0 })
  }
  for (const row of rows) {
    if (dutyIds && !dutyIds.has(row.dutyId)) continue
    const counts = countsByPosition.get(row.positionId)
    if (counts) counts[row.matrixColumn] += 1
  }
  return positions.map((position) => {
    const counts = countsByPosition.get(position.id) ?? { execute: 0, review: 0, collaborate: 0 }
    return { position, counts, total: counts.execute + counts.review + counts.collaborate }
  })
}

export function buildDutyMasterResponsibilityGroups(
  state: OrgDirectoryState,
  positionId: string,
  dutyQuery: string,
  filter: DutyResponsibilityFilter,
): DutyPositionResponsibilityGroup[] {
  const dutyIds = matchingDutyIds(state, dutyQuery)
  const activePositions = state.positions.filter((position) => position.status === 'active')
  const rows = buildDutyMatrixRows(state, activePositions)
    .filter((row) => row.positionId === positionId && (!dutyIds || dutyIds.has(row.dutyId)))
  const columns = filter === 'all' ? DUTY_MASTER_COLUMNS : DUTY_MASTER_COLUMNS.filter((column) => column.id === filter)
  return columns.map((column) => ({
    id: column.id,
    label: column.label,
    rows: rows.filter((row) => row.matrixColumn === column.id),
  }))
}

export function resolveDutyMasterPositionId(
  summaries: DutyPositionSummary[],
  requestedPositionId: string | null,
  currentPositionId: string | null,
): string | null {
  const ids = new Set(summaries.map((summary) => summary.position.id))
  if (currentPositionId && ids.has(currentPositionId)) return currentPositionId
  if (requestedPositionId && ids.has(requestedPositionId)) return requestedPositionId
  return summaries[0]?.position.id ?? null
}

const EXPANDED_CATEGORY_ORDER: Array<{ id: DutyAnomalyType; label: DutyAnomalyCategory['label'] }> = [
  { id: 'no-executor', label: '無執行職位' },
  { id: 'missing-primary-executor', label: '缺少主執行' },
  { id: 'pending-reassignment', label: '待重新分配' },
]

export function buildDutyExpandedPositionSections(
  state: OrgDirectoryState,
  sortedPositions: Position[],
  filters: { dutyQuery: string; positionQuery: string; departmentId: string },
): DutyExpandedPositionSection[] {
  const positionQuery = normalizedDutyQuery(filters.positionQuery)
  const dutyIds = matchingDutyIds(state, filters.dutyQuery)
  const positions = sortedPositions.filter((position) => {
    const matchesPosition = !positionQuery || position.title.toLocaleLowerCase('zh-Hant').includes(positionQuery)
    const matchesDepartment = !filters.departmentId || position.departmentId === filters.departmentId
    return matchesPosition && matchesDepartment
  })
  const rows = buildDutyMatrixRows(state, positions)
  const departmentById = new Map(state.departments.map((department) => [department.id, department]))
  return positions.map((position) => {
    const positionRows = rows.filter((row) => row.positionId === position.id)
    const visibleRows = dutyIds ? positionRows.filter((row) => dutyIds.has(row.dutyId)) : positionRows
    const groups = DUTY_MASTER_COLUMNS
      .map((column) => ({
        id: column.id,
        label: column.label,
        rows: visibleRows.filter((row) => row.matrixColumn === column.id),
      }))
      .filter((group) => group.rows.length > 0)
    return {
      position,
      department: departmentById.get(position.departmentId ?? '') ?? null,
      groups,
      hasAnyRelation: positionRows.length > 0,
      hasVisibleRelation: visibleRows.length > 0,
    }
  })
}

export function buildDutyAnomalyCategories(state: OrgDirectoryState): DutyAnomalyCategory[] {
  const dutyById = new Map(state.duties.map((duty) => [duty.id, duty]))
  const anomalies = deriveDutyAnomalies(state)
  return EXPANDED_CATEGORY_ORDER.map(({ id, label }) => {
    const items = anomalies
      .filter((anomaly) => anomaly.type === id)
      .map((anomaly) => {
        const duty = dutyById.get(anomaly.dutyId)
        if (!duty) return null
        const relation = anomaly.relationId
          ? state.dutyPositionRelations.find((candidate) => candidate.id === anomaly.relationId)
          : null
        const context = anomaly.type === 'pending-reassignment' && relation?.target.kind === 'pending-reassignment'
          ? `原職位：${relation.target.formerPositionTitle}`
          : null
        return { duty, anomaly, context }
      })
      .filter((item): item is DutyAnomalyCategoryItem => Boolean(item))
      .sort((first, second) => first.duty.title.localeCompare(second.duty.title, 'zh-Hant')
        || (first.context ?? '').localeCompare(second.context ?? '', 'zh-Hant')
        || first.anomaly.id.localeCompare(second.anomaly.id))
    return { id, label, items }
  }).filter((category) => category.items.length > 0)
}
