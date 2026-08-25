import { describe, expect, it } from 'vitest'
import { resolveDirectSupervisor } from './directSupervisor'
import type { Employee, PositionView } from './types'

const employees: Employee[] = [
  { id: 'employee', name: '員工', departmentIds: [], primaryAssignmentId: 'assignment-employee', administrativeApproverOverrideEmployeeId: null },
  { id: 'supervisor', name: '主管', departmentIds: [], primaryAssignmentId: 'assignment-supervisor', administrativeApproverOverrideEmployeeId: null },
]

const members: PositionView[] = [
  {
    id: 'supervisor-position', order: 0, childrenAxis: 'horizontal', parentPositionId: null, organizationLevelId: null, title: '主管職位', roleId: 'manager', departmentId: null, allowMultipleAssignees: false,
    activeAssignments: [{ id: 'assignment-supervisor', employeeId: 'supervisor', positionId: 'supervisor-position', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null }],
  },
  {
    id: 'employee-position', order: 0, childrenAxis: 'horizontal', parentPositionId: 'supervisor-position', organizationLevelId: null, title: '員工職位', roleId: 'staff', departmentId: null, allowMultipleAssignees: false,
    activeAssignments: [{ id: 'assignment-employee', employeeId: 'employee', positionId: 'employee-position', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null }],
  },
]

describe('resolveDirectSupervisor', () => {
  it('resolves the unique assignee of the immediate parent position', () => {
    expect(resolveDirectSupervisor(members, employees, 'employee')).toMatchObject({
      status: 'resolved',
      supervisorEmployeeId: 'supervisor',
      supervisorPositionTitle: '主管職位',
    })
  })

  it('does not resolve when the employee has no primary assignment', () => {
    const state = employees.map((employee) => employee.id === 'employee' ? { ...employee, primaryAssignmentId: null } : employee)
    expect(resolveDirectSupervisor(members, state, 'employee')).toMatchObject({ status: 'unresolved', reason: 'NO_PRIMARY_ASSIGNMENT' })
  })

  it('reports multiple direct supervisors without choosing one', () => {
    const multiple = members.map((member) => member.id === 'supervisor-position'
      ? {
          ...member,
          activeAssignments: [...member.activeAssignments, { id: 'assignment-supervisor-2', employeeId: 'supervisor-2', positionId: member.id, assignmentType: 'regular' as const, validFrom: '2026-01-01', validTo: null }],
        }
      : member)
    expect(resolveDirectSupervisor(multiple, employees, 'employee')).toMatchObject({ status: 'unresolved', reason: 'DIRECT_SUPERVISOR_MULTIPLE' })
  })
})
