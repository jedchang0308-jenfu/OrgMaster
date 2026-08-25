import type { Assignment, AssignmentType } from './types'

export interface AssignmentOptions {
  asOf?: string
  assignmentId?: string
  assignmentType?: AssignmentType
  allowMultipleAssignees?: boolean
}

export function currentDateKey() {
  return new Date().toISOString().slice(0, 10)
}

export function isAssignmentActive(assignment: Assignment, asOf = currentDateKey()) {
  return assignment.validFrom <= asOf && (assignment.validTo === null || asOf < assignment.validTo)
}

export function getActiveAssignments(assignments: Assignment[], asOf = currentDateKey()) {
  return assignments.filter((assignment) => isAssignmentActive(assignment, asOf))
}

function closeActiveAssignments(
  assignments: Assignment[],
  predicate: (assignment: Assignment) => boolean,
  asOf: string,
) {
  return assignments.map((assignment) => (
    isAssignmentActive(assignment, asOf) && predicate(assignment)
      ? { ...assignment, validTo: asOf }
      : assignment
  ))
}

export function assignEmployee(
  assignments: Assignment[],
  employeeId: string,
  targetPositionId: string,
  sourcePositionId: string | null = null,
  options: AssignmentOptions = {},
) {
  const asOf = options.asOf ?? currentDateKey()
  const activeAssignments = getActiveAssignments(assignments, asOf)
  const targetAssignments = activeAssignments.filter((assignment) => assignment.positionId === targetPositionId)
  const targetAssignment = targetAssignments.find((assignment) => assignment.employeeId === employeeId)
  const sourceAssignment = sourcePositionId
    ? activeAssignments.find((assignment) => (
      assignment.positionId === sourcePositionId && assignment.employeeId === employeeId
    ))
    : null

  if (sourcePositionId === targetPositionId) return assignments
  if (targetAssignment) {
    if (!sourceAssignment) return assignments
    return closeActiveAssignments(assignments, (assignment) => assignment.id === sourceAssignment.id, asOf)
  }

  // A multi-assignee position keeps its existing occupants. A single-assignee
  // position preserves the previous replace behavior.
  const shouldReplaceTarget = !options.allowMultipleAssignees

  let next = closeActiveAssignments(
    assignments,
    (assignment) => (
      (shouldReplaceTarget && assignment.positionId === targetPositionId)
      || (sourceAssignment != null && assignment.id === sourceAssignment.id)
    ),
    asOf,
  )

  const assignmentId = options.assignmentId
    ?? `assignment-${employeeId}-${targetPositionId}-${asOf}-${assignments.length}`
  next = next.filter((assignment) => assignment.id !== assignmentId)
  next.push({
    id: assignmentId,
    employeeId,
    positionId: targetPositionId,
    assignmentType: options.assignmentType ?? 'regular',
    validFrom: asOf,
    validTo: null,
  })
  return next
}

export function unassignEmployee(
  assignments: Assignment[],
  positionId: string,
  employeeIdOrOptions?: string | AssignmentOptions,
  options: AssignmentOptions = {},
) {
  const employeeId = typeof employeeIdOrOptions === 'string' ? employeeIdOrOptions : undefined
  const resolvedOptions = typeof employeeIdOrOptions === 'string'
    ? options
    : employeeIdOrOptions ?? {}
  const asOf = resolvedOptions.asOf ?? currentDateKey()
  return closeActiveAssignments(
    assignments,
    (assignment) => assignment.positionId === positionId
      && (employeeId === undefined || assignment.employeeId === employeeId),
    asOf,
  )
}

export function closeAssignmentsForPositions(
  assignments: Assignment[],
  positionIds: Set<string>,
  options: AssignmentOptions = {},
) {
  const asOf = options.asOf ?? currentDateKey()
  return closeActiveAssignments(assignments, (assignment) => positionIds.has(assignment.positionId), asOf)
}

export function closeAssignmentsForEmployee(
  assignments: Assignment[],
  employeeId: string,
  options: AssignmentOptions = {},
) {
  const asOf = options.asOf ?? currentDateKey()
  return closeActiveAssignments(assignments, (assignment) => assignment.employeeId === employeeId, asOf)
}
