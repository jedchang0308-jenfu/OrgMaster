import { describe, expect, it } from 'vitest'
import {
  removeDepartmentFromDirectory,
  removeEmployeeFromDirectory,
  summarizeDepartments,
  updateDepartmentInDirectory,
  updateEmployeeInDirectory,
} from './directories'
import type { Assignment, Department, Employee, OrgDirectoryState, OrgMember, Position, Role } from './types'
import { createDefaultOrganizationLevels } from './organizationLevels'

const departments: Department[] = [
  { id: 'design', name: '設計部', parentId: null },
  { id: 'sales', name: '業務部', parentId: null },
  { id: 'empty', name: '新事業部', parentId: 'sales' },
]

const employees: Employee[] = [
  { id: 'amy', name: 'Amy', status: 'active', departmentIds: ['design'], primaryAssignmentId: 'lead-assignment', administrativeApproverOverrideEmployeeId: null },
  { id: 'ben', name: 'Ben', status: 'active', departmentIds: ['design'], primaryAssignmentId: 'designer-assignment', administrativeApproverOverrideEmployeeId: null },
  { id: 'cara', name: 'Cara', status: 'active', departmentIds: ['sales'], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
]

const members: OrgMember[] = [
  { id: 'lead', order: 0, childrenAxis: 'horizontal' },
  { id: 'designer', order: 0, childrenAxis: 'horizontal' },
  { id: 'open-role', order: 1, childrenAxis: 'horizontal' },
]

const roles: Role[] = [
  { id: 'lead-role', name: '主管' },
  { id: 'designer-role', name: '設計師' },
  { id: 'sales-role', name: '業務' },
]

const positions: Position[] = [
  { id: 'lead', roleId: 'lead-role', departmentId: 'design', parentPositionId: null, organizationLevelId: null, title: '設計主管', status: 'active', allowMultipleAssignees: false },
  { id: 'designer', roleId: 'designer-role', departmentId: 'design', parentPositionId: 'lead', organizationLevelId: null, title: '設計師', status: 'active', allowMultipleAssignees: false },
  { id: 'open-role', roleId: 'sales-role', departmentId: 'sales', parentPositionId: null, organizationLevelId: null, title: '業務主管', status: 'active', allowMultipleAssignees: false },
]

const assignments: Assignment[] = [
  { id: 'lead-assignment', employeeId: 'amy', positionId: 'lead', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
  { id: 'designer-assignment', employeeId: 'ben', positionId: 'designer', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
]

function state(overrides: Partial<OrgDirectoryState> = {}): OrgDirectoryState {
  return { departments, employees, roles, positions, assignments, members, roleCombinationRiskRules: [], organizationLevels: createDefaultOrganizationLevels(), organizationLayout: { mode: 'tree', showLevelGuides: true }, duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [], ...overrides }
}

describe('summarizeDepartments', () => {
  it('counts employees, positions, and active assignments independently', () => {
    expect(summarizeDepartments(departments, employees, positions, assignments, '2026-03-01')).toEqual([
      { ...departments[0], employeeCount: 2, positionCount: 2, assignedPositionCount: 2, childCount: 0 },
      { ...departments[1], employeeCount: 1, positionCount: 1, assignedPositionCount: 0, childCount: 1 },
      { ...departments[2], employeeCount: 0, positionCount: 0, assignedPositionCount: 0, childCount: 0 },
    ])
  })

  it('counts one employee once per department membership while allowing multiple positions', () => {
    const multiRolePositions = [
      ...positions,
      { id: 'second-role', roleId: 'designer-role', departmentId: 'design', parentPositionId: null, organizationLevelId: null, title: '顧問', status: 'active' as const, allowMultipleAssignees: false },
    ]
    const multiRoleAssignments = [
      ...assignments,
      { id: 'second-assignment', employeeId: 'amy', positionId: 'second-role', assignmentType: 'regular' as const, validFrom: '2026-01-01', validTo: null },
    ]

    expect(summarizeDepartments(departments, employees, multiRolePositions, multiRoleAssignments, '2026-03-01')[0])
      .toMatchObject({ employeeCount: 2, positionCount: 3, assignedPositionCount: 3 })
  })

  it('counts a multi-department employee in each selected department', () => {
    const multiDepartmentEmployees = employees.map((employee) => employee.id === 'amy'
      ? { ...employee, departmentIds: ['design', 'sales'] }
      : employee)
    const summary = summarizeDepartments(departments, multiDepartmentEmployees, positions, assignments, '2026-03-01')

    expect(summary.find((department) => department.id === 'design')?.employeeCount).toBe(2)
    expect(summary.find((department) => department.id === 'sales')?.employeeCount).toBe(2)
  })
})

describe('directory mutations', () => {
  it('removes an employee and closes every assignment atomically', () => {
    const next = removeEmployeeFromDirectory(state(), 'amy', '2026-03-01')

    expect(next.employees.some((employee) => employee.id === 'amy')).toBe(false)
    expect(next.assignments.find((assignment) => assignment.employeeId === 'amy')?.validTo).toBe('2026-03-01')
  })

  it('moves employees and positions to a valid replacement before removing a department', () => {
    const next = removeDepartmentFromDirectory(state(), 'design', 'sales')

    expect(next.departments.some((department) => department.id === 'design')).toBe(false)
    expect(next.employees.filter((employee) => employee.id === 'amy' || employee.id === 'ben')
      .every((employee) => employee.departmentIds.includes('sales'))).toBe(true)
    expect(next.positions.filter((position) => position.id === 'lead' || position.id === 'designer')
      .every((position) => position.departmentId === 'sales')).toBe(true)
  })

  it('preserves an employee\'s other departments when one department is removed', () => {
    const original = state({
      employees: employees.map((employee) => employee.id === 'amy'
        ? { ...employee, departmentIds: ['design', 'sales'] }
        : employee),
    })
    const next = removeDepartmentFromDirectory(original, 'design')

    expect(next.employees.find((employee) => employee.id === 'amy')?.departmentIds).toEqual(['sales'])
  })

  it('allows deleting an occupied department without a replacement and keeps records unassigned', () => {
    const original = state()
    const next = removeDepartmentFromDirectory(original, 'design')

    expect(next).not.toBe(original)
    expect(next.departments.some((department) => department.id === 'design')).toBe(false)
    expect(next.employees.filter((employee) => employee.id === 'amy' || employee.id === 'ben')
      .every((employee) => employee.departmentIds.length === 0)).toBe(true)
    expect(next.positions.filter((position) => position.id === 'lead' || position.id === 'designer')
      .every((position) => position.departmentId === null)).toBe(true)
    expect(next.assignments).toBe(assignments)
  })

  it('rejects deleting a department into one of its descendants', () => {
    const nested = state({
      departments: [
        { id: 'root', name: '根', parentId: null },
        { id: 'child', name: '子', parentId: 'root' },
      ],
    })
    expect(removeDepartmentFromDirectory(nested, 'root', 'child')).toBe(nested)
  })

  it('removes an empty department and promotes its children', () => {
    const next = removeDepartmentFromDirectory(state(), 'empty')
    expect(next.departments.map((department) => department.id)).toEqual(['design', 'sales'])
  })

  it('edits an employee while preserving their id and position assignments', () => {
    const original = state()
    const next = updateEmployeeInDirectory(original, 'amy', 'Amy Chen', ['sales'])

    expect(next.employees.find((employee) => employee.id === 'amy')).toEqual({
      id: 'amy',
      name: 'Amy Chen',
      status: 'active',
      departmentIds: ['sales'],
      primaryAssignmentId: 'lead-assignment',
      administrativeApproverOverrideEmployeeId: null,
    })
    expect(next.assignments).toBe(assignments)
  })

  it('updates an employee with multiple unique departments', () => {
    const next = updateEmployeeInDirectory(state(), 'amy', 'Amy', ['sales', 'design', 'sales'])

    expect(next.employees.find((employee) => employee.id === 'amy')?.departmentIds).toEqual(['sales', 'design'])
  })

  it('renames and reparents a department without changing employee ids', () => {
    const next = updateDepartmentInDirectory(state(), 'design', '產品設計部', 'sales')

    expect(next.departments.find((department) => department.id === 'design')).toEqual({
      id: 'design',
      name: '產品設計部',
      parentId: 'sales',
    })
    expect(next.employees.find((employee) => employee.id === 'amy')?.departmentIds).toEqual(['design'])
  })

  it('rejects moving a department below its own descendant', () => {
    const nested = state({
      departments: [
        { id: 'root', name: '根', parentId: null },
        { id: 'child', name: '子', parentId: 'root' },
      ],
    })
    expect(updateDepartmentInDirectory(nested, 'root', '根', 'child')).toBe(nested)
  })
})
