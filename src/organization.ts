import { getActiveAssignments, type AssignmentOptions } from './assignments'
import type { Assignment, Department, OrgMember, Position, PositionView } from './types'

export const TODAY = new Date().toISOString().slice(0, 10)

export function buildPositionViews(
  members: OrgMember[],
  positions: Position[],
  assignments: Assignment[],
  asOf = TODAY,
): PositionView[] {
  const positionById = new Map(positions.map((position) => [position.id, position]))
  const assignmentsByPosition = new Map<string, Assignment[]>()
  for (const assignment of getActiveAssignments(assignments, asOf)) {
    const current = assignmentsByPosition.get(assignment.positionId) ?? []
    current.push(assignment)
    assignmentsByPosition.set(assignment.positionId, current)
  }

  return members.flatMap((member) => {
    const position = positionById.get(member.id)
    if (!position || position.status !== 'active') return []
    return [{
      ...member,
      parentPositionId: position.parentPositionId,
      organizationLevelId: position.organizationLevelId,
      title: position.title,
      roleId: position.roleId,
      departmentId: position.departmentId,
      allowMultipleAssignees: position.allowMultipleAssignees,
      activeAssignments: assignmentsByPosition.get(position.id) ?? [],
    }]
  })
}

export function getDepartmentName(departments: Department[], departmentId: string | null) {
  return departments.find((department) => department.id === departmentId)?.name ?? '未設定部門'
}

export function getDepartmentPath(departments: Department[], departmentId: string | null) {
  if (!departmentId) return []
  const byId = new Map(departments.map((department) => [department.id, department]))
  const path: Department[] = []
  const visited = new Set<string>()
  let current = byId.get(departmentId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path
}

export function getDepartmentLabel(departments: Department[], departmentId: string | null) {
  return getDepartmentPath(departments, departmentId).map((department) => department.name).join(' / ') || '未設定部門'
}

export function getDepartmentDescendantIds(departments: Department[], departmentId: string) {
  const descendants = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const department of departments) {
      if (department.parentId && (department.parentId === departmentId || descendants.has(department.parentId)) && !descendants.has(department.id)) {
        descendants.add(department.id)
        changed = true
      }
    }
  }
  return descendants
}

export function canSetDepartmentParent(
  departments: Department[],
  departmentId: string,
  parentId: string | null,
) {
  if (parentId === departmentId) return false
  if (!parentId) return true
  return !getDepartmentDescendantIds(departments, departmentId).has(parentId)
}

export function positionAssignmentOptions(asOf: string): AssignmentOptions {
  return { asOf }
}
