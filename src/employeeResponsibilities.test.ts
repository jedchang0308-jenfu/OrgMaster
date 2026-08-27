import { describe, expect, it } from 'vitest'
import { resolveAdministrativeApprover } from './administrativeApproval'
import {
  assignEmployeeWithResponsibilities,
  setAdministrativeApproverOverride,
  setPrimaryAssignment,
  validateEmployeeResponsibilities,
} from './employeeResponsibilities'
import type { Assignment, Department, Employee, OrgDirectoryState, OrgMember, Position, Role } from './types'
import { createDefaultOrganizationLevels } from './organizationLevels'

const departments: Department[] = [{ id: 'dept', name: '部門', parentId: null }]
const roles: Role[] = [{ id: 'manager', name: '主管' }, { id: 'staff', name: '專員' }]
const positions: Position[] = [
  { id: 'manager-position', roleId: 'manager', departmentId: 'dept', parentPositionId: null, organizationLevelId: null, title: '主管', status: 'active', allowMultipleAssignees: false },
  { id: 'staff-position', roleId: 'staff', departmentId: 'dept', parentPositionId: 'manager-position', organizationLevelId: null, title: '專員', status: 'active', allowMultipleAssignees: false },
  { id: 'vacant-position', roleId: 'manager', departmentId: 'dept', parentPositionId: null, organizationLevelId: null, title: '待補主管', status: 'active', allowMultipleAssignees: false },
]
const members: OrgMember[] = positions.map((position, order) => ({ id: position.id, order, childrenAxis: 'horizontal' }))
const employees: Employee[] = [
  { id: 'alice', name: 'Alice', departmentIds: ['dept'], primaryAssignmentId: 'alice-staff', administrativeApproverOverrideEmployeeId: null },
  { id: 'bob', name: 'Bob', departmentIds: ['dept'], primaryAssignmentId: 'bob-manager', administrativeApproverOverrideEmployeeId: null },
  { id: 'cara', name: 'Cara', departmentIds: ['dept'], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
]
const assignments: Assignment[] = [
  { id: 'alice-staff', employeeId: 'alice', positionId: 'staff-position', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
  { id: 'bob-manager', employeeId: 'bob', positionId: 'manager-position', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
]

function state(overrides: Partial<OrgDirectoryState> = {}): OrgDirectoryState {
  return { employees, departments, roles, positions, assignments, members, roleCombinationRiskRules: [], organizationLevels: createDefaultOrganizationLevels(), organizationLayout: { mode: 'tree', showLevelGuides: true }, duties: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [], ...overrides }
}

describe('administrative approval route', () => {
  it('resolves the unique active assignee of the main job parent', () => {
    expect(resolveAdministrativeApprover(state(), 'alice', '2026-08-15')).toMatchObject({
      status: 'resolved',
      source: 'position_hierarchy',
      approverEmployeeId: 'bob',
      supervisorPositionId: 'manager-position',
    })
  })

  it('does not guess when the main job is missing or the parent has multiple people', () => {
    expect(resolveAdministrativeApprover(state(), 'cara', '2026-08-15')).toMatchObject({ status: 'unresolved', reason: 'NO_PRIMARY_ASSIGNMENT' })
    const multipleManagers = state({
      employees: [...employees, { id: 'david', name: 'David', departmentIds: ['dept'], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }],
      assignments: [...assignments, { id: 'david-manager', employeeId: 'david', positionId: 'manager-position', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null }],
    })
    expect(resolveAdministrativeApprover(multipleManagers, 'alice', '2026-08-15')).toMatchObject({ status: 'unresolved', reason: 'PARENT_POSITION_MULTIPLE_ASSIGNEES' })
  })

  it('allows an explicit override only when hierarchy cannot uniquely resolve', () => {
    const noManager = state({ assignments: [assignments[0]] })
    const result = setAdministrativeApproverOverride(noManager, 'alice', 'bob', '2026-08-15')
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(resolveAdministrativeApprover(result.state, 'alice', '2026-08-15')).toMatchObject({ status: 'resolved', source: 'employee_override', approverEmployeeId: 'bob' })
    expect(setAdministrativeApproverOverride(state(), 'alice', 'bob', '2026-08-15')).toMatchObject({ status: 'rejected', code: 'HIERARCHY_APPROVER_ALREADY_UNIQUE' })
  })
})

describe('employee responsibility invariants', () => {
  it('rejects acting assignments as a main job and detects dangling references', () => {
    const acting = { ...assignments[0], assignmentType: 'acting' as const }
    expect(setPrimaryAssignment(state({ assignments: [acting, assignments[1] ] }), 'alice', acting.id, '2026-08-15'))
      .toMatchObject({ status: 'rejected', code: 'ACTING_CANNOT_BE_PRIMARY' })
    expect(validateEmployeeResponsibilities(state({ employees: [{ ...employees[0], primaryAssignmentId: 'missing' }, ...employees.slice(1)] })))
      .toMatchObject({ ok: false, code: 'PRIMARY_ASSIGNMENT_UNKNOWN' })
  })

  it('moves a main assignment and repairs the pointer atomically', () => {
    const result = assignEmployeeWithResponsibilities(state(), 'alice', 'manager-position', 'staff-position', {
      asOf: '2026-08-15',
      assignmentId: 'alice-manager',
      allowMultipleAssignees: true,
    })
    expect(result.employees.find((employee) => employee.id === 'alice')?.primaryAssignmentId).toBe('alice-manager')
    expect(result.assignments.find((assignment) => assignment.id === 'alice-staff')?.validTo).toBe('2026-08-15')
    expect(validateEmployeeResponsibilities(result, '2026-08-15')).toEqual({ ok: true })
  })
})
