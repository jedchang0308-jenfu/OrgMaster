import { closeAssignmentsForEmployee } from './assignments'
import { reconcileEmployeeResponsibilities } from './employeeResponsibilities'
import { canSetDepartmentParent, getDepartmentDescendantIds } from './organization'
import type { Assignment, Department, Employee, OrgDirectoryState, Position } from './types'

export interface DepartmentSummary extends Department {
  employeeCount: number
  positionCount: number
  assignedPositionCount: number
  childCount: number
}

export function summarizeDepartments(
  departments: Department[],
  employees: Employee[],
  positions: Position[],
  assignments: Assignment[],
  asOf = new Date().toISOString().slice(0, 10),
): DepartmentSummary[] {
  const employeeCounts = new Map<string, number>()
  const positionCounts = new Map<string, number>()
  const assignedPositionCounts = new Map<string, number>()
  const childCounts = new Map<string, number>()
  const activePositionIds = new Set<string>()

  for (const employee of employees) {
    for (const departmentId of employee.departmentIds) {
      employeeCounts.set(departmentId, (employeeCounts.get(departmentId) ?? 0) + 1)
    }
  }

  for (const position of positions) {
    if (position.status !== 'active') continue
    activePositionIds.add(position.id)
    if (position.departmentId) {
      positionCounts.set(position.departmentId, (positionCounts.get(position.departmentId) ?? 0) + 1)
    }
  }

  for (const assignment of assignments) {
    if (assignment.validFrom > asOf || (assignment.validTo !== null && asOf >= assignment.validTo)) continue
    if (!activePositionIds.has(assignment.positionId)) continue
    const position = positions.find((item) => item.id === assignment.positionId)
    if (position?.departmentId) {
      assignedPositionCounts.set(position.departmentId, (assignedPositionCounts.get(position.departmentId) ?? 0) + 1)
    }
  }

  for (const department of departments) {
    if (department.parentId) childCounts.set(department.parentId, (childCounts.get(department.parentId) ?? 0) + 1)
  }

  return departments.map((department) => ({
    ...department,
    employeeCount: employeeCounts.get(department.id) ?? 0,
    positionCount: positionCounts.get(department.id) ?? 0,
    assignedPositionCount: assignedPositionCounts.get(department.id) ?? 0,
    childCount: childCounts.get(department.id) ?? 0,
  }))
}

export function removeEmployeeFromDirectory(
  state: OrgDirectoryState,
  employeeId: string,
  asOf = new Date().toISOString().slice(0, 10),
): OrgDirectoryState {
  if (!state.employees.some((employee) => employee.id === employeeId)) return state

  return reconcileEmployeeResponsibilities({
    ...state,
    employees: state.employees.filter((employee) => employee.id !== employeeId),
    assignments: closeAssignmentsForEmployee(state.assignments, employeeId, { asOf }),
  }, asOf)
}

export function removeDepartmentFromDirectory(
  state: OrgDirectoryState,
  departmentId: string,
  replacementDepartmentId?: string,
): OrgDirectoryState {
  const department = state.departments.find((item) => item.id === departmentId)
  if (!department) return state

  const replacement = replacementDepartmentId
    ? state.departments.find((item) => item.id === replacementDepartmentId && item.id !== departmentId)
    : null
  if (replacement && getDepartmentDescendantIds(state.departments, departmentId).has(replacement.id)) return state
  const nextParentId = replacement?.id ?? department.parentId
  return {
    ...state,
    departments: state.departments
      .filter((item) => item.id !== departmentId)
      .map((item) => item.parentId === departmentId ? { ...item, parentId: nextParentId } : item),
    employees: state.employees.map((employee) => {
      if (!employee.departmentIds.includes(departmentId)) return employee
      const remainingDepartmentIds = employee.departmentIds.filter((id) => id !== departmentId)
      const departmentIds = replacement && !remainingDepartmentIds.includes(replacement.id)
        ? [...remainingDepartmentIds, replacement.id]
        : remainingDepartmentIds
      return { ...employee, departmentIds }
    }),
    positions: state.positions.map((position) => position.departmentId === departmentId
      ? { ...position, departmentId: replacement?.id ?? null }
      : position),
  }
}

export function updateEmployeeInDirectory(
  state: OrgDirectoryState,
  employeeId: string,
  name: string,
  departmentIds: string[],
): OrgDirectoryState {
  const employee = state.employees.find((item) => item.id === employeeId)
  const normalizedName = name.trim()
  const normalizedDepartmentIds = [...new Set(departmentIds)]
  if (!employee || !normalizedDepartmentIds.every((id) => state.departments.some((item) => item.id === id)) || !normalizedName) return state
  if (employee.name === normalizedName && employee.departmentIds.length === normalizedDepartmentIds.length
    && employee.departmentIds.every((id, index) => id === normalizedDepartmentIds[index])) return state

  return {
    ...state,
    employees: state.employees.map((item) => (
      item.id === employeeId
        ? { ...item, name: normalizedName, departmentIds: normalizedDepartmentIds }
        : item
    )),
  }
}

export function updateDepartmentInDirectory(
  state: OrgDirectoryState,
  departmentId: string,
  name: string,
  parentId: string | null,
): OrgDirectoryState {
  const department = state.departments.find((item) => item.id === departmentId)
  const normalizedName = name.trim()
  if (!department || !normalizedName || !canSetDepartmentParent(state.departments, departmentId, parentId)) return state

  const normalizedKey = normalizedName.toLocaleLowerCase('zh-Hant')
  const duplicate = state.departments.some((item) => (
    item.id !== departmentId
    && item.name.trim().toLocaleLowerCase('zh-Hant') === normalizedKey
  ))
  if (duplicate) return state
  if (department.name === normalizedName && department.parentId === parentId) return state

  return {
    ...state,
    departments: state.departments.map((item) => item.id === departmentId
      ? { ...item, name: normalizedName, parentId }
      : item),
  }
}

export function renameDepartmentInDirectory(
  state: OrgDirectoryState,
  departmentId: string,
  name: string,
): OrgDirectoryState {
  const department = state.departments.find((item) => item.id === departmentId)
  if (!department) return state
  return updateDepartmentInDirectory(state, departmentId, name, department.parentId)
}
