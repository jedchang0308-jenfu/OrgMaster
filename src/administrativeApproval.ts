import { currentDateKey, getActiveAssignments } from './assignments'
import type { OrgDirectoryState } from './types'

export type AdministrativeApprovalUnresolvedReason =
  | 'NO_PRIMARY_ASSIGNMENT'
  | 'PRIMARY_ASSIGNMENT_NOT_CURRENT'
  | 'NO_PARENT_POSITION'
  | 'PARENT_POSITION_VACANT'
  | 'PARENT_POSITION_MULTIPLE_ASSIGNEES'
  | 'SELF_APPROVAL_ONLY'
  | 'INVALID_OVERRIDE'

export type AdministrativeApprovalResolution =
  | {
      status: 'resolved'
      source: 'position_hierarchy' | 'employee_override'
      employeeId: string
      approverEmployeeId: string
      primaryAssignmentId: string
      primaryPositionId: string
      supervisorPositionId: string | null
    }
  | {
      status: 'unresolved'
      employeeId: string
      reason: AdministrativeApprovalUnresolvedReason
      primaryAssignmentId: string | null
      primaryPositionId: string | null
      supervisorPositionId: string | null
    }

export function resolveAdministrativeApprover(
  state: OrgDirectoryState,
  employeeId: string,
  asOf = currentDateKey(),
): AdministrativeApprovalResolution {
  const employee = state.employees.find((candidate) => candidate.id === employeeId)
  if (!employee || !employee.primaryAssignmentId) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'NO_PRIMARY_ASSIGNMENT',
      primaryAssignmentId: employee?.primaryAssignmentId ?? null,
      primaryPositionId: null,
      supervisorPositionId: null,
    }
  }

  const activeAssignments = getActiveAssignments(state.assignments, asOf)
  const primaryAssignment = activeAssignments.find((assignment) => (
    assignment.id === employee.primaryAssignmentId
      && assignment.employeeId === employeeId
      && assignment.assignmentType === 'regular'
  ))
  if (!primaryAssignment) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'PRIMARY_ASSIGNMENT_NOT_CURRENT',
      primaryAssignmentId: employee.primaryAssignmentId,
      primaryPositionId: null,
      supervisorPositionId: null,
    }
  }

  const primaryPosition = state.positions.find((position) => (
    position.id === primaryAssignment.positionId && position.status === 'active'
  ))
  if (!primaryPosition) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'PRIMARY_ASSIGNMENT_NOT_CURRENT',
      primaryAssignmentId: primaryAssignment.id,
      primaryPositionId: primaryAssignment.positionId,
      supervisorPositionId: null,
    }
  }

  const override = employee.administrativeApproverOverrideEmployeeId
  if (override) {
    const validOverride = state.employees.some((candidate) => candidate.id === override && candidate.id !== employeeId)
    if (validOverride) {
      return {
        status: 'resolved',
        source: 'employee_override',
        employeeId,
        approverEmployeeId: override,
        primaryAssignmentId: primaryAssignment.id,
        primaryPositionId: primaryPosition.id,
        supervisorPositionId: primaryPosition.parentPositionId,
      }
    }
    return {
      status: 'unresolved',
      employeeId,
      reason: 'INVALID_OVERRIDE',
      primaryAssignmentId: primaryAssignment.id,
      primaryPositionId: primaryPosition.id,
      supervisorPositionId: primaryPosition.parentPositionId,
    }
  }

  if (!primaryPosition.parentPositionId) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'NO_PARENT_POSITION',
      primaryAssignmentId: primaryAssignment.id,
      primaryPositionId: primaryPosition.id,
      supervisorPositionId: null,
    }
  }

  const supervisorPosition = state.positions.find((position) => position.id === primaryPosition.parentPositionId)
  if (!supervisorPosition || supervisorPosition.status !== 'active') {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'PARENT_POSITION_VACANT',
      primaryAssignmentId: primaryAssignment.id,
      primaryPositionId: primaryPosition.id,
      supervisorPositionId: primaryPosition.parentPositionId,
    }
  }

  const supervisorEmployees = [...new Set(
    activeAssignments
      .filter((assignment) => assignment.positionId === supervisorPosition.id)
      .map((assignment) => assignment.employeeId),
  )]
  const otherEmployees = supervisorEmployees.filter((candidate) => candidate !== employeeId)
  if (otherEmployees.length === 1) {
    return {
      status: 'resolved',
      source: 'position_hierarchy',
      employeeId,
      approverEmployeeId: otherEmployees[0],
      primaryAssignmentId: primaryAssignment.id,
      primaryPositionId: primaryPosition.id,
      supervisorPositionId: supervisorPosition.id,
    }
  }

  return {
    status: 'unresolved',
    employeeId,
    reason: supervisorEmployees.length === 0
      ? 'PARENT_POSITION_VACANT'
      : otherEmployees.length === 0
        ? 'SELF_APPROVAL_ONLY'
        : 'PARENT_POSITION_MULTIPLE_ASSIGNEES',
    primaryAssignmentId: primaryAssignment.id,
    primaryPositionId: primaryPosition.id,
    supervisorPositionId: supervisorPosition.id,
  }
}

