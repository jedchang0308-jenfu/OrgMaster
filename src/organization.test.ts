import { describe, expect, it } from 'vitest'
import { buildPositionViews, getDepartmentLabel } from './organization'
import type { Assignment, OrgMember, Position } from './types'

const members: OrgMember[] = [
  { id: 'position-a', order: 0, childrenAxis: 'horizontal' },
]

const positions: Position[] = [
  {
    id: 'position-a',
    roleId: 'role-a',
    departmentId: 'department-a',
    parentPositionId: null,
    organizationLevelId: null,
    title: '專案小組',
    status: 'active',
    allowMultipleAssignees: true,
  },
]

const assignments: Assignment[] = [
  { id: 'assignment-primary', employeeId: 'employee-a', positionId: 'position-a', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
  { id: 'assignment-acting', employeeId: 'employee-b', positionId: 'position-a', assignmentType: 'acting', validFrom: '2026-02-01', validTo: null },
  { id: 'assignment-old', employeeId: 'employee-c', positionId: 'position-a', assignmentType: 'regular', validFrom: '2025-01-01', validTo: '2026-02-01' },
]

describe('buildPositionViews', () => {
  it('keeps all active assignments and their assignment types on the position view', () => {
    const [view] = buildPositionViews(members, positions, assignments, '2026-03-01')

    expect(view.allowMultipleAssignees).toBe(true)
    expect(view.activeAssignments).toEqual([
      assignments[0],
      assignments[1],
    ])
  })
})

describe('department labels', () => {
  it('shows a stable unassigned label when the referenced department was deleted', () => {
    expect(getDepartmentLabel([], 'deleted-department')).toBe('未設定部門')
    expect(getDepartmentLabel([], null)).toBe('未設定部門')
  })
})
