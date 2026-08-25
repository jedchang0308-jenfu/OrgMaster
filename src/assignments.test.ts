import { describe, expect, it } from 'vitest'
import { assignEmployee, getActiveAssignments, unassignEmployee } from './assignments'
import type { Assignment } from './types'

const assignments: Assignment[] = [
  { id: 'a-assignment', employeeId: 'employee-1', positionId: 'a', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
  { id: 'b-assignment', employeeId: 'employee-2', positionId: 'b', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
]

describe('employee assignments', () => {
  it('keeps historical records and allows one person to hold multiple positions', () => {
    const result = assignEmployee(assignments, 'employee-1', 'c', null, {
      asOf: '2026-03-01',
      assignmentId: 'c-assignment',
    })

    expect(getActiveAssignments(result, '2026-02-28')).toHaveLength(2)
    expect(getActiveAssignments(result, '2026-03-01')
      .filter((assignment) => assignment.employeeId === 'employee-1'))
      .toHaveLength(2)
  })

  it('adds another person to a multi-assignee position without replacing the current person', () => {
    const result = assignEmployee(assignments, 'employee-2', 'a', null, {
      asOf: '2026-03-01',
      assignmentId: 'a-second-assignment',
      allowMultipleAssignees: true,
    })

    const active = getActiveAssignments(result, '2026-03-01')
      .filter((assignment) => assignment.positionId === 'a')
    expect(active.map((assignment) => assignment.employeeId)).toEqual(['employee-1', 'employee-2'])
    expect(result.find((assignment) => assignment.id === 'a-assignment')?.validTo).toBeNull()
  })

  it('moves only the selected employee out of a multi-assignee source position', () => {
    const sourceAssignments: Assignment[] = [
      { id: 'source-one', employeeId: 'employee-1', positionId: 'source', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
      { id: 'source-two', employeeId: 'employee-2', positionId: 'source', assignmentType: 'regular', validFrom: '2026-01-01', validTo: null },
    ]
    const result = assignEmployee(sourceAssignments, 'employee-1', 'target', 'source', {
      asOf: '2026-03-01',
      assignmentId: 'target-one',
      allowMultipleAssignees: true,
    })

    expect(result.find((assignment) => assignment.id === 'source-one')?.validTo).toBe('2026-03-01')
    expect(result.find((assignment) => assignment.id === 'source-two')?.validTo).toBeNull()
    expect(getActiveAssignments(result, '2026-03-01').find((assignment) => assignment.positionId === 'target')?.employeeId)
      .toBe('employee-1')
  })

  it('moves an assignment and closes the old and replaced records', () => {
    const result = assignEmployee(assignments, 'employee-1', 'b', 'a', {
      asOf: '2026-03-01',
      assignmentId: 'moved-assignment',
    })
    const active = getActiveAssignments(result, '2026-03-01')

    expect(active.find((assignment) => assignment.positionId === 'a')).toBeUndefined()
    expect(active.find((assignment) => assignment.positionId === 'b')?.employeeId).toBe('employee-1')
    expect(result.find((assignment) => assignment.id === 'a-assignment')?.validTo).toBe('2026-03-01')
    expect(result.find((assignment) => assignment.id === 'b-assignment')?.validTo).toBe('2026-03-01')
  })

  it('unassigns a position without deleting the assignment history', () => {
    const result = unassignEmployee(assignments, 'a', { asOf: '2026-03-01' })

    expect(getActiveAssignments(result, '2026-03-01').some((assignment) => assignment.positionId === 'a')).toBe(false)
    expect(result.find((assignment) => assignment.positionId === 'a')?.validTo).toBe('2026-03-01')
  })
})
