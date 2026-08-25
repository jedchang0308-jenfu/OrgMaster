import { assignEmployee, currentDateKey, getActiveAssignments, isAssignmentActive, unassignEmployee } from './assignments'
import { resolveAdministrativeApprover } from './administrativeApproval'
import type { Assignment, Employee, OrgDirectoryState } from './types'

export type EmployeeResponsibilityValidationCode =
  | 'PRIMARY_ASSIGNMENT_UNKNOWN'
  | 'PRIMARY_ASSIGNMENT_WRONG_EMPLOYEE'
  | 'PRIMARY_ASSIGNMENT_CLOSED'
  | 'PRIMARY_ASSIGNMENT_ACTING'
  | 'PRIMARY_POSITION_INACTIVE'
  | 'APPROVER_OVERRIDE_UNKNOWN'
  | 'APPROVER_OVERRIDE_SELF'
  | 'APPROVER_OVERRIDE_WITHOUT_PRIMARY'

export type EmployeeResponsibilityMutationCode =
  | 'UNKNOWN_EMPLOYEE'
  | 'UNKNOWN_ASSIGNMENT'
  | 'ASSIGNMENT_NOT_OWNED'
  | 'ASSIGNMENT_NOT_CURRENT'
  | 'ACTING_CANNOT_BE_PRIMARY'
  | 'UNKNOWN_APPROVER'
  | 'SELF_APPROVER'
  | 'NO_PRIMARY_ASSIGNMENT'
  | 'HIERARCHY_APPROVER_ALREADY_UNIQUE'

export type EmployeeResponsibilityMutationResult =
  | { status: 'applied'; state: OrgDirectoryState }
  | { status: 'noop'; state: OrgDirectoryState }
  | { status: 'rejected'; code: EmployeeResponsibilityMutationCode; state: OrgDirectoryState }

export type EmployeeResponsibilityValidationResult =
  | { ok: true }
  | {
      ok: false
      code: EmployeeResponsibilityValidationCode
      employeeIds: string[]
      assignmentIds: string[]
    }

function rejected(state: OrgDirectoryState, code: EmployeeResponsibilityMutationCode): EmployeeResponsibilityMutationResult {
  return { status: 'rejected', code, state }
}

function getAssignmentById(assignments: Assignment[], assignmentId: string) {
  return assignments.find((assignment) => assignment.id === assignmentId)
}

function isCurrentRegularAssignment(
  assignment: Assignment,
  state: OrgDirectoryState,
  asOf?: string,
) {
  const position = state.positions.find((candidate) => candidate.id === assignment.positionId)
  const current = asOf ? isAssignmentActive(assignment, asOf) : assignment.validTo === null
  return current && assignment.assignmentType === 'regular' && position?.status === 'active'
}

export function validateEmployeeResponsibilities(
  state: OrgDirectoryState,
  asOf?: string,
): EmployeeResponsibilityValidationResult {
  const employeeIds = new Set(state.employees.map((employee) => employee.id))
  const assignmentsById = new Map(state.assignments.map((assignment) => [assignment.id, assignment]))
  const positionById = new Map(state.positions.map((position) => [position.id, position]))

  for (const employee of state.employees) {
    if (employee.primaryAssignmentId) {
      const assignment = assignmentsById.get(employee.primaryAssignmentId)
      if (!assignment) {
        return { ok: false, code: 'PRIMARY_ASSIGNMENT_UNKNOWN', employeeIds: [employee.id], assignmentIds: [employee.primaryAssignmentId] }
      }
      if (assignment.employeeId !== employee.id) {
        return { ok: false, code: 'PRIMARY_ASSIGNMENT_WRONG_EMPLOYEE', employeeIds: [employee.id], assignmentIds: [assignment.id] }
      }
      if (asOf ? !isAssignmentActive(assignment, asOf) : assignment.validTo !== null) {
        return { ok: false, code: 'PRIMARY_ASSIGNMENT_CLOSED', employeeIds: [employee.id], assignmentIds: [assignment.id] }
      }
      if (assignment.assignmentType === 'acting') {
        return { ok: false, code: 'PRIMARY_ASSIGNMENT_ACTING', employeeIds: [employee.id], assignmentIds: [assignment.id] }
      }
      if (positionById.get(assignment.positionId)?.status !== 'active') {
        return { ok: false, code: 'PRIMARY_POSITION_INACTIVE', employeeIds: [employee.id], assignmentIds: [assignment.id] }
      }
    }

    if (employee.administrativeApproverOverrideEmployeeId) {
      if (!employee.primaryAssignmentId) {
        return { ok: false, code: 'APPROVER_OVERRIDE_WITHOUT_PRIMARY', employeeIds: [employee.id], assignmentIds: [] }
      }
      if (!employeeIds.has(employee.administrativeApproverOverrideEmployeeId)) {
        return { ok: false, code: 'APPROVER_OVERRIDE_UNKNOWN', employeeIds: [employee.id], assignmentIds: [] }
      }
      if (employee.administrativeApproverOverrideEmployeeId === employee.id) {
        return { ok: false, code: 'APPROVER_OVERRIDE_SELF', employeeIds: [employee.id], assignmentIds: [] }
      }
    }
  }

  return { ok: true }
}

export function setPrimaryAssignment(
  state: OrgDirectoryState,
  employeeId: string,
  assignmentId: string,
  asOf = currentDateKey(),
): EmployeeResponsibilityMutationResult {
  const employee = state.employees.find((candidate) => candidate.id === employeeId)
  if (!employee) return rejected(state, 'UNKNOWN_EMPLOYEE')

  const assignment = getAssignmentById(state.assignments, assignmentId)
  if (!assignment) return rejected(state, 'UNKNOWN_ASSIGNMENT')
  if (assignment.employeeId !== employeeId) return rejected(state, 'ASSIGNMENT_NOT_OWNED')
  if (!isAssignmentActive(assignment, asOf)) return rejected(state, 'ASSIGNMENT_NOT_CURRENT')
  if (assignment.assignmentType === 'acting') return rejected(state, 'ACTING_CANNOT_BE_PRIMARY')
  if (state.positions.find((position) => position.id === assignment.positionId)?.status !== 'active') {
    return rejected(state, 'ASSIGNMENT_NOT_CURRENT')
  }
  if (employee.primaryAssignmentId === assignmentId) return { status: 'noop', state }

  return {
    status: 'applied',
    state: {
      ...state,
      employees: state.employees.map((candidate) => (
        candidate.id === employeeId ? { ...candidate, primaryAssignmentId: assignmentId } : candidate
      )),
    },
  }
}

export function setAdministrativeApproverOverride(
  state: OrgDirectoryState,
  employeeId: string,
  approverEmployeeId: string | null,
  asOf = currentDateKey(),
): EmployeeResponsibilityMutationResult {
  const employee = state.employees.find((candidate) => candidate.id === employeeId)
  if (!employee) return rejected(state, 'UNKNOWN_EMPLOYEE')
  if (approverEmployeeId === employeeId) return rejected(state, 'SELF_APPROVER')
  if (approverEmployeeId && !state.employees.some((candidate) => candidate.id === approverEmployeeId)) {
    return rejected(state, 'UNKNOWN_APPROVER')
  }
  if (employee.administrativeApproverOverrideEmployeeId === approverEmployeeId) return { status: 'noop', state }
  if (approverEmployeeId && !employee.primaryAssignmentId) return rejected(state, 'NO_PRIMARY_ASSIGNMENT')

  if (approverEmployeeId && !employee.administrativeApproverOverrideEmployeeId) {
    const stateWithoutOverride: OrgDirectoryState = {
      ...state,
      employees: state.employees.map((candidate) => (
        candidate.id === employeeId
          ? { ...candidate, administrativeApproverOverrideEmployeeId: null }
          : candidate
      )),
    }
    const currentResolution = resolveAdministrativeApprover(stateWithoutOverride, employeeId, asOf)
    if (currentResolution.status === 'resolved') return rejected(state, 'HIERARCHY_APPROVER_ALREADY_UNIQUE')
  }

  return {
    status: 'applied',
    state: {
      ...state,
      employees: state.employees.map((candidate) => (
        candidate.id === employeeId
          ? { ...candidate, administrativeApproverOverrideEmployeeId: approverEmployeeId }
          : candidate
      )),
    },
  }
}

export function reconcileEmployeeResponsibilities(
  state: OrgDirectoryState,
  asOf = currentDateKey(),
): OrgDirectoryState {
  const employeeIds = new Set(state.employees.map((employee) => employee.id))
  const assignmentById = new Map(state.assignments.map((assignment) => [assignment.id, assignment]))
  let changed = false

  const employees = state.employees.map((employee) => {
    let primaryAssignmentId = employee.primaryAssignmentId
    if (primaryAssignmentId) {
      const assignment = assignmentById.get(primaryAssignmentId)
      if (!assignment || assignment.employeeId !== employee.id || !isCurrentRegularAssignment(assignment, state, asOf)) {
        primaryAssignmentId = null
      }
    }

    let administrativeApproverOverrideEmployeeId = employee.administrativeApproverOverrideEmployeeId
    if (
      administrativeApproverOverrideEmployeeId === employee.id
      || (administrativeApproverOverrideEmployeeId && !employeeIds.has(administrativeApproverOverrideEmployeeId))
    ) {
      administrativeApproverOverrideEmployeeId = null
    }

    if (
      primaryAssignmentId !== employee.primaryAssignmentId
      || administrativeApproverOverrideEmployeeId !== employee.administrativeApproverOverrideEmployeeId
    ) {
      changed = true
      return { ...employee, primaryAssignmentId, administrativeApproverOverrideEmployeeId }
    }
    return employee
  })

  return changed ? { ...state, employees } : state
}

/**
 * Applies an assignment drag and repairs the employee responsibility pointers
 * in the same state transition. The UI should use this wrapper instead of
 * committing `assignments` directly so a closed primary assignment can never
 * leave a dangling main-job reference.
 */
export function assignEmployeeWithResponsibilities(
  state: OrgDirectoryState,
  employeeId: string,
  targetPositionId: string,
  sourcePositionId: string | null = null,
  options: { asOf?: string; assignmentId?: string; allowMultipleAssignees?: boolean } = {},
): OrgDirectoryState {
  const asOf = options.asOf ?? currentDateKey()
  const beforeActive = getActiveAssignments(state.assignments, asOf)
  const sourceAssignment = sourcePositionId
    ? beforeActive.find((assignment) => assignment.positionId === sourcePositionId && assignment.employeeId === employeeId)
    : undefined
  const beforeRegularCount = beforeActive.filter((assignment) => assignment.employeeId === employeeId && assignment.assignmentType === 'regular').length
  const assignments = assignEmployee(state.assignments, employeeId, targetPositionId, sourcePositionId, options)
  if (assignments === state.assignments) return state

  const nextActive = getActiveAssignments(assignments, asOf)
  const targetAssignment = nextActive.find((assignment) => assignment.positionId === targetPositionId && assignment.employeeId === employeeId)
  const employee = state.employees.find((candidate) => candidate.id === employeeId)
  let nextState: OrgDirectoryState = { ...state, assignments }

  if (employee && targetAssignment) {
    const movedPrimary = sourceAssignment?.id === employee.primaryAssignmentId
    const firstRegularAssignment = !employee.primaryAssignmentId
      && beforeRegularCount === 0
      && targetAssignment.assignmentType === 'regular'
    if (movedPrimary || firstRegularAssignment) {
      nextState = {
        ...nextState,
        employees: nextState.employees.map((candidate) => (
          candidate.id === employeeId
            ? { ...candidate, primaryAssignmentId: targetAssignment.assignmentType === 'regular' ? targetAssignment.id : null }
            : candidate
        )),
      }
    }
  }

  return reconcileEmployeeResponsibilities(nextState, asOf)
}

export function unassignEmployeeWithResponsibilities(
  state: OrgDirectoryState,
  positionId: string,
  employeeId: string,
  asOf = currentDateKey(),
): OrgDirectoryState {
  const assignments = unassignEmployee(state.assignments, positionId, employeeId, { asOf })
  if (assignments === state.assignments) return state
  return reconcileEmployeeResponsibilities({ ...state, assignments }, asOf)
}
