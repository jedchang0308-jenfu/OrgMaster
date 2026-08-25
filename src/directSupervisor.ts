import type { Employee, PositionView } from './types'

export type DirectSupervisorUnresolvedReason =
  | 'NO_PRIMARY_ASSIGNMENT'
  | 'PRIMARY_ASSIGNMENT_UNAVAILABLE'
  | 'NO_DIRECT_SUPERVISOR_POSITION'
  | 'DIRECT_SUPERVISOR_POSITION_UNAVAILABLE'
  | 'DIRECT_SUPERVISOR_VACANT'
  | 'DIRECT_SUPERVISOR_SELF_ONLY'
  | 'DIRECT_SUPERVISOR_MULTIPLE'

export type DirectSupervisorResolution =
  | {
      status: 'resolved'
      employeeId: string
      supervisorEmployeeId: string
      supervisorPositionId: string
      supervisorPositionTitle: string
    }
  | {
      status: 'unresolved'
      employeeId: string
      reason: DirectSupervisorUnresolvedReason
      supervisorPositionId: string | null
      supervisorPositionTitle: string | null
    }

/**
 * Resolves the direct supervisor for display only.
 * It follows the employee's primary assignment to the position's immediate
 * parent and never applies approval overrides or jumps to an ancestor.
 */
export function resolveDirectSupervisor(
  members: PositionView[],
  employees: Employee[],
  employeeId: string,
): DirectSupervisorResolution {
  const employee = employees.find((candidate) => candidate.id === employeeId)
  const primaryAssignmentId = employee?.primaryAssignmentId ?? null
  if (!employee || !primaryAssignmentId) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'NO_PRIMARY_ASSIGNMENT',
      supervisorPositionId: null,
      supervisorPositionTitle: null,
    }
  }

  const primaryAssignment = members
    .flatMap((member) => member.activeAssignments)
    .find((assignment) => assignment.id === primaryAssignmentId && assignment.employeeId === employeeId)
  if (!primaryAssignment) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'PRIMARY_ASSIGNMENT_UNAVAILABLE',
      supervisorPositionId: null,
      supervisorPositionTitle: null,
    }
  }

  const primaryPosition = members.find((member) => member.id === primaryAssignment.positionId)
  if (!primaryPosition?.parentPositionId) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'NO_DIRECT_SUPERVISOR_POSITION',
      supervisorPositionId: null,
      supervisorPositionTitle: null,
    }
  }

  const supervisorPosition = members.find((member) => member.id === primaryPosition.parentPositionId)
  if (!supervisorPosition) {
    return {
      status: 'unresolved',
      employeeId,
      reason: 'DIRECT_SUPERVISOR_POSITION_UNAVAILABLE',
      supervisorPositionId: primaryPosition.parentPositionId,
      supervisorPositionTitle: null,
    }
  }

  const supervisorEmployeeIds = [...new Set(supervisorPosition.activeAssignments.map((assignment) => assignment.employeeId))]
  const otherSupervisorEmployeeIds = supervisorEmployeeIds.filter((candidate) => candidate !== employeeId)
  if (otherSupervisorEmployeeIds.length === 1) {
    return {
      status: 'resolved',
      employeeId,
      supervisorEmployeeId: otherSupervisorEmployeeIds[0],
      supervisorPositionId: supervisorPosition.id,
      supervisorPositionTitle: supervisorPosition.title,
    }
  }

  return {
    status: 'unresolved',
    employeeId,
    reason: supervisorEmployeeIds.length === 0
      ? 'DIRECT_SUPERVISOR_VACANT'
      : otherSupervisorEmployeeIds.length === 0
        ? 'DIRECT_SUPERVISOR_SELF_ONLY'
        : 'DIRECT_SUPERVISOR_MULTIPLE',
    supervisorPositionId: supervisorPosition.id,
    supervisorPositionTitle: supervisorPosition.title,
  }
}
