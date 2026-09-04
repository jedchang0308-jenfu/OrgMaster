import { closeAssignmentsForPositions } from './assignments'
import { reconcileEmployeeResponsibilities } from './employeeResponsibilities'
import { removeDepartmentFromDirectory } from './directories'
import { duplicatePosition } from './positions'
import { invalidateDutyRelationsForPositions, normalizeDutyRelationOrders, normalizeDutyState, validateDutyState, type DutyValidationCode } from './duties'
import { normalizeProcessPlanningState, validateProcessPlanningState, type ProcessPlanningValidationCode } from './processPlanning'
import { projectDutyPlan, type DutyPlanIntent } from './dutyPlanning'
import {
  buildHierarchyNodes,
  collectActiveBranchIds,
  isHierarchyDescendant,
  validateOrganizationState,
  type OrganizationValidationOptions,
  type OrganizationValidationCode,
} from './organizationHierarchy'
import type { ChildrenAxis, Duty, DutyPositionRelation, OrganizationLayoutMode, OrgDirectoryState, Position, ProcessDefinition, ProcessEdge, ProcessNode, ProcessNodeDutyLink, Role } from './types'

export type OrganizationCommand =
  | {
      type: 'ADD_POSITION'
      position: Pick<Position, 'id' | 'roleId' | 'title' | 'departmentId' | 'parentPositionId' | 'organizationLevelId'>
      role?: Role
      order: number
    }
  | { type: 'MOVE_POSITION'; positionId: string; parentPositionId: string | null; insertIndex: number }
  | { type: 'REORDER_POSITION'; positionId: string; delta: -1 | 1 }
  | { type: 'CHANGE_POSITION_DEPARTMENT'; positionId: string; departmentId: string | null }
  | { type: 'PATCH_POSITION'; positionId: string; title?: string; roleId?: string; role?: Role; departmentId?: string | null; organizationLevelId?: string | null; allowMultipleAssignees?: boolean; childrenAxis?: ChildrenAxis }
  | { type: 'DUPLICATE_POSITION'; sourcePositionId: string; newPositionId: string }
  | { type: 'DELETE_POSITION'; positionId: string; mode: 'branch' | 'promote'; asOf: string }
  | { type: 'DELETE_DEPARTMENT'; departmentId: string; replacementDepartmentId?: string }
  | { type: 'ADD_ORGANIZATION_LEVEL'; level: { id: string; name: string } }
  | { type: 'RENAME_ORGANIZATION_LEVEL'; levelId: string; name: string }
  | { type: 'DELETE_ORGANIZATION_LEVEL'; levelId: string }
  | { type: 'REORDER_ORGANIZATION_LEVELS'; levelIds: string[] }
  | { type: 'SET_ORGANIZATION_LAYOUT'; mode?: OrganizationLayoutMode; showLevelGuides?: boolean }
  | { type: 'SET_POSITION_Y_OVERRIDE'; positionId: string; y: number | null }
  | { type: 'CREATE_DUTY'; duty: Duty }
  | { type: 'PATCH_DUTY'; dutyId: string; title?: string; description?: string | null }
  | { type: 'DELETE_DUTY'; dutyId: string }
  | { type: 'UPSERT_DUTY_RELATION'; relation: DutyPositionRelation }
  | { type: 'REMOVE_DUTY_RELATION'; relationId: string }
  | { type: 'REORDER_DUTY_RELATION'; relationId: string; delta: -1 | 1 }
  | { type: 'TRANSFER_PRIMARY_DUTY_EXECUTOR'; dutyId: string; sourceRelationId: string; targetPositionId: string; targetRelationId: string }
  | { type: 'COMMIT_DUTY_PLANNING_CHANGE'; intent: DutyPlanIntent }
  | { type: 'CREATE_PROCESS'; process: ProcessDefinition }
  | { type: 'UPDATE_PROCESS'; processId: string; title?: string; description?: string | null }
  | { type: 'DELETE_EMPTY_PROCESS'; processId: string }
  | { type: 'CREATE_PROCESS_NODE'; node: ProcessNode }
  | { type: 'UPDATE_PROCESS_NODE'; nodeId: string; title: string }
  | { type: 'MOVE_PROCESS_NODE'; nodeId: string; parentNodeId: string | null; insertIndex: number }
  | { type: 'DELETE_PROCESS_LEAF_NODE'; nodeId: string }
  | { type: 'CREATE_PROCESS_EDGE'; edge: ProcessEdge }
  | { type: 'DELETE_PROCESS_EDGE'; edgeId: string }
  | { type: 'LINK_PROCESS_NODE_DUTY'; link: ProcessNodeDutyLink }
  | { type: 'UNLINK_PROCESS_NODE_DUTY'; linkId: string }
  | { type: 'CREATE_DUTY_AND_LINK_PROCESS_NODE'; duty: Duty; link: ProcessNodeDutyLink }

export type OrganizationCommandIssueCode = OrganizationValidationCode
  | DutyValidationCode
  | ProcessPlanningValidationCode
  | 'POSITION_NOT_FOUND'
  | 'DEPARTMENT_NOT_FOUND'
  | 'INVALID_DEPARTMENT_REPLACEMENT'
  | 'DUPLICATE_ID'
  | 'ROLE_NOT_FOUND'
  | 'INVALID_INSERT_INDEX'
  | 'INVALID_POSITION_Y'
  | 'ORGANIZATION_LEVEL_NOT_FOUND'
  | 'ORGANIZATION_LEVEL_IN_USE'
  | 'INVALID_LEVEL_SEQUENCE'
  | 'NO_LOWER_ORGANIZATION_LEVEL'
  | 'DUTY_PLAN_INCOMPLETE'
  | 'DUTY_PLAN_STALE'
  | 'DUTY_PLAN_TARGET_INVALID'
  | 'DUTY_PLAN_PRIMARY_CONFLICT'
  | 'DUTY_PLAN_DOMAIN_INVALID'
  | 'READ_ONLY'

export type OrganizationCommandResult =
  | { status: 'applied'; state: OrgDirectoryState; changedPositionIds: string[] }
  | { status: 'noop'; state: OrgDirectoryState }
  | {
      status: 'rejected'
      state: OrgDirectoryState
      issue: { code: OrganizationCommandIssueCode; positionIds: string[]; departmentIds: string[]; dutyIds: string[]; processIds: string[]; processNodeIds: string[] }
    }

function reject(
  state: OrgDirectoryState,
  code: OrganizationCommandIssueCode,
  positionIds: string[] = [],
  departmentIds: string[] = [],
  dutyIds: string[] = [],
  processIds: string[] = [],
  processNodeIds: string[] = [],
): OrganizationCommandResult {
  return { status: 'rejected', state, issue: { code, positionIds, departmentIds, dutyIds, processIds, processNodeIds } }
}

function normalizeOrders(state: OrgDirectoryState, parentPositionId: string | null) {
  const nodes = buildHierarchyNodes(state)
    .filter((node) => node.parentId === parentPositionId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const orderById = new Map(nodes.map((node, index) => [node.id, index]))
  return {
    ...state,
    members: state.members.map((member) => {
      const order = orderById.get(member.id)
      return order === undefined ? member : { ...member, order }
    }),
  }
}

function removePositionYOverrides(state: OrgDirectoryState, positionIds: Iterable<string>) {
  const positionYOverrides = { ...(state.organizationLayout.positionYOverrides ?? {}) }
  let changed = false
  for (const positionId of positionIds) {
    if (!(positionId in positionYOverrides)) continue
    delete positionYOverrides[positionId]
    changed = true
  }
  return changed
    ? { ...state, organizationLayout: { ...state.organizationLayout, positionYOverrides } }
    : state
}

function validateApplied(
  state: OrgDirectoryState,
  changedPositionIds: string[],
  originalState = state,
  validationOptions?: OrganizationValidationOptions,
  asOf?: string,
): OrganizationCommandResult {
  const repaired = normalizeDutyState(reconcileEmployeeResponsibilities(state, asOf))
  const normalized = normalizeProcessPlanningState(repaired)
  const validation = validateOrganizationState(normalized, validationOptions)
  if (!validation.ok) return reject(originalState, validation.code, validation.positionIds, validation.departmentIds)
  const dutyValidation = validateDutyState(normalized)
  if (!dutyValidation.ok) return reject(originalState, dutyValidation.issue.code, dutyValidation.issue.positionIds)
  const processValidation = validateProcessPlanningState(normalized)
  if (!processValidation.ok) return reject(originalState, processValidation.issue.code, [], [], processValidation.issue.dutyIds, processValidation.issue.processIds, processValidation.issue.processNodeIds)
  return { status: 'applied', state: normalized, changedPositionIds }
}

function processSiblings(state: OrgDirectoryState, processId: string, parentNodeId: string | null) {
  return state.processNodes
    .filter((node) => node.processId === processId && node.parentNodeId === parentNodeId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

function isProcessNodeDescendant(state: OrgDirectoryState, candidateId: string, ancestorId: string) {
  const byId = new Map(state.processNodes.map((node) => [node.id, node]))
  let current = byId.get(candidateId)
  const seen = new Set<string>()
  while (current?.parentNodeId) {
    if (current.parentNodeId === ancestorId) return true
    if (seen.has(current.id)) return true
    seen.add(current.id)
    current = byId.get(current.parentNodeId)
  }
  return false
}

function reorderProcessSiblings(state: OrgDirectoryState, nodeId: string, parentNodeId: string | null, insertIndex: number) {
  const moving = state.processNodes.find((node) => node.id === nodeId)
  if (!moving) return state
  const siblings = processSiblings(state, moving.processId, parentNodeId).filter((node) => node.id !== nodeId)
  const ids = siblings.map((node) => node.id)
  ids.splice(insertIndex, 0, nodeId)
  const orderById = new Map(ids.map((id, order) => [id, order]))
  return {
    ...state,
    processNodes: state.processNodes.map((node) => {
      const order = orderById.get(node.id)
      return order === undefined ? node : { ...node, order, ...(node.id === nodeId ? { parentNodeId } : {}) }
    }),
  }
}

function positionOrReject(state: OrgDirectoryState, id: string) {
  const position = state.positions.find((item) => item.id === id && item.status === 'active')
  return position ?? null
}

function resolveRoleMutation(
  state: OrgDirectoryState,
  roleId: string | undefined,
  role: Role | undefined,
) {
  if (roleId === undefined && role === undefined) {
    return { ok: true as const, roles: state.roles, roleId: undefined as string | undefined }
  }

  const nextRoleId = roleId ?? role?.id
  if (!nextRoleId || (role && role.id !== nextRoleId)) return { ok: false as const }

  const existing = state.roles.find((item) => item.id === nextRoleId)
  if (!existing && !role) return { ok: false as const }
  if (existing && role && existing.name !== role.name) return { ok: false as const }

  return {
    ok: true as const,
    roles: existing ? state.roles : [...state.roles, role!],
    roleId: nextRoleId,
  }
}

export function executeOrganizationCommand(
  state: OrgDirectoryState,
  command: OrganizationCommand,
): OrganizationCommandResult {
  if (command.type === 'CREATE_DUTY') {
    if (state.duties.some((duty) => duty.id === command.duty.id)) return reject(state, 'DUTY_ID_DUPLICATE')
    const next = { ...state, duties: [...state.duties, { ...command.duty, title: command.duty.title.trim(), description: command.duty.description?.trim() || null }] }
    return validateApplied(next, [], state)
  }

  if (command.type === 'PATCH_DUTY') {
    const duty = state.duties.find((item) => item.id === command.dutyId)
    if (!duty) return reject(state, 'DUTY_RELATION_DUTY_MISSING')
    const nextDuty = { ...duty, ...(command.title === undefined ? {} : { title: command.title.trim() }), ...(command.description === undefined ? {} : { description: command.description?.trim() || null }) }
    if (JSON.stringify(duty) === JSON.stringify(nextDuty)) return { status: 'noop', state }
    return validateApplied({ ...state, duties: state.duties.map((item) => item.id === duty.id ? nextDuty : item) }, [], state)
  }

  if (command.type === 'DELETE_DUTY') {
    if (!state.duties.some((duty) => duty.id === command.dutyId)) return reject(state, 'DUTY_RELATION_DUTY_MISSING')
    const processLinks = state.processNodeDutyLinks.filter((link) => link.dutyId === command.dutyId)
    if (processLinks.length) {
      const processNodeIds = processLinks.map((link) => link.processNodeId)
      const processIds = state.processNodes.filter((node) => processNodeIds.includes(node.id)).map((node) => node.processId)
      return reject(state, 'DUTY_PROCESS_LINK_IN_USE', [], [], [command.dutyId], [...new Set(processIds)], processNodeIds)
    }
    return validateApplied({
      ...state,
      duties: state.duties.filter((duty) => duty.id !== command.dutyId),
      dutyPositionRelations: state.dutyPositionRelations.filter((relation) => relation.dutyId !== command.dutyId),
    }, [], state)
  }

  if (command.type === 'UPSERT_DUTY_RELATION') {
    const relation = command.relation
    if (!state.duties.some((duty) => duty.id === relation.dutyId)) return reject(state, 'DUTY_RELATION_DUTY_MISSING')
    if (relation.target.kind !== 'position' || !positionOrReject(state, relation.target.positionId)) return reject(state, 'DUTY_RELATION_TARGET_INVALID')
    const targetPositionId = relation.target.positionId
    const duplicate = state.dutyPositionRelations.find((candidate) => candidate.id !== relation.id
      && candidate.dutyId === relation.dutyId
      && candidate.relationType === relation.relationType
      && candidate.target.kind === 'position'
      && candidate.target.positionId === targetPositionId)
    if (duplicate) return reject(state, 'DUTY_RELATION_DUPLICATE')
    const old = state.dutyPositionRelations.find((candidate) => candidate.id === relation.id)
    if (old && JSON.stringify(old) === JSON.stringify(relation)) return { status: 'noop', state }
    if (relation.isPrimaryExecutor) {
      const primary = state.dutyPositionRelations.find((candidate) => candidate.dutyId === relation.dutyId && candidate.isPrimaryExecutor && candidate.id !== relation.id)
      if (primary) return reject(state, 'DUTY_PRIMARY_EXECUTOR_DUPLICATE')
    }
    const nextRelations = old
      ? state.dutyPositionRelations.map((candidate) => candidate.id === relation.id ? relation : candidate)
      : [...state.dutyPositionRelations, relation]
    return validateApplied({ ...state, dutyPositionRelations: normalizeDutyRelationOrders(nextRelations) }, [targetPositionId], state)
  }

  if (command.type === 'REMOVE_DUTY_RELATION') {
    const relation = state.dutyPositionRelations.find((candidate) => candidate.id === command.relationId)
    if (!relation) return reject(state, 'DUTY_RELATION_ID_INVALID')
    return validateApplied({ ...state, dutyPositionRelations: state.dutyPositionRelations.filter((candidate) => candidate.id !== relation.id) }, relation.target.kind === 'position' ? [relation.target.positionId] : [], state)
  }

  if (command.type === 'REORDER_DUTY_RELATION') {
    const relation = state.dutyPositionRelations.find((candidate) => candidate.id === command.relationId)
    if (!relation || relation.target.kind !== 'position') return reject(state, 'DUTY_RELATION_ID_INVALID')
    const relationPositionId = relation.target.positionId
    const sameGroup = state.dutyPositionRelations
      .filter((candidate) => candidate.dutyId === relation.dutyId && candidate.target.kind === 'position' && candidate.target.positionId === relationPositionId
        && candidate.relationType === relation.relationType && candidate.isPrimaryExecutor === relation.isPrimaryExecutor)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    const index = sameGroup.findIndex((candidate) => candidate.id === relation.id)
    const swap = index + command.delta
    if (swap < 0 || swap >= sameGroup.length) return { status: 'noop', state }
    const first = sameGroup[index]
    const second = sameGroup[swap]
    return validateApplied({ ...state, dutyPositionRelations: state.dutyPositionRelations.map((candidate) => candidate.id === first.id ? { ...candidate, order: second.order } : candidate.id === second.id ? { ...candidate, order: first.order } : candidate) }, [relationPositionId], state)
  }

  if (command.type === 'TRANSFER_PRIMARY_DUTY_EXECUTOR') {
    const source = state.dutyPositionRelations.find((relation) => relation.id === command.sourceRelationId)
    if (!source || source.dutyId !== command.dutyId || source.relationType !== 'execute' || !source.isPrimaryExecutor || source.target.kind !== 'position') return reject(state, 'DUTY_RELATION_PRIMARY_INVALID')
    const target = positionOrReject(state, command.targetPositionId)
    if (!target || target.id === source.target.positionId) return reject(state, 'DUTY_RELATION_TARGET_INVALID')
    const existingTarget = state.dutyPositionRelations.find((relation) => relation.dutyId === command.dutyId && relation.relationType === 'execute' && relation.target.kind === 'position' && relation.target.positionId === target.id)
    const targetRelation = existingTarget ?? { id: command.targetRelationId, dutyId: command.dutyId, relationType: 'execute' as const, target: { kind: 'position' as const, positionId: target.id }, isPrimaryExecutor: true, order: 0 }
    if (!existingTarget && state.dutyPositionRelations.some((relation) => relation.id === command.targetRelationId)) return reject(state, 'DUTY_RELATION_ID_DUPLICATE')
    const relations = state.dutyPositionRelations.filter((relation) => relation.id !== source.id)
      .map((relation) => relation.id === existingTarget?.id ? { ...relation, isPrimaryExecutor: true, order: 0 } : relation)
    if (!existingTarget) relations.push(targetRelation)
    return validateApplied({ ...state, dutyPositionRelations: normalizeDutyRelationOrders(relations) }, [source.target.positionId, target.id], state)
  }

  if (command.type === 'COMMIT_DUTY_PLANNING_CHANGE') {
    const projection = projectDutyPlan(state, [command.intent])
    if (projection.issues.length > 0) {
      const issueCode = projection.issues[0].code === 'INCOMPLETE' ? 'DUTY_PLAN_INCOMPLETE'
        : projection.issues[0].code === 'STALE' ? 'DUTY_PLAN_STALE'
          : projection.issues[0].code === 'TARGET_INVALID' ? 'DUTY_PLAN_TARGET_INVALID'
            : projection.issues[0].code === 'PRIMARY_CONFLICT' ? 'DUTY_PLAN_PRIMARY_CONFLICT'
              : 'DUTY_PLAN_DOMAIN_INVALID'
      return reject(state, issueCode, projection.changedRelationIds)
    }
    return validateApplied(projection.state, projection.changedRelationIds, state)
  }

  if (command.type === 'CREATE_PROCESS') {
    if (state.processes.some((process) => process.id === command.process.id)) return reject(state, 'PROCESS_ID_DUPLICATE', [], [], [], [command.process.id])
    const next = { ...state, processes: [...state.processes, { ...command.process, title: command.process.title.trim(), description: command.process.description?.trim() || null }] }
    return validateApplied(next, [], state)
  }

  if (command.type === 'UPDATE_PROCESS') {
    const process = state.processes.find((item) => item.id === command.processId)
    if (!process) return reject(state, 'PROCESS_NOT_FOUND', [], [], [], [command.processId])
    const nextProcess = {
      ...process,
      ...(command.title === undefined ? {} : { title: command.title.trim() }),
      ...(command.description === undefined ? {} : { description: command.description?.trim() || null }),
    }
    if (JSON.stringify(process) === JSON.stringify(nextProcess)) return { status: 'noop', state }
    return validateApplied({ ...state, processes: state.processes.map((item) => item.id === process.id ? nextProcess : item) }, [], state)
  }

  if (command.type === 'DELETE_EMPTY_PROCESS') {
    if (!state.processes.some((process) => process.id === command.processId)) return reject(state, 'PROCESS_NOT_FOUND', [], [], [], [command.processId])
    const nodeIds = state.processNodes.filter((node) => node.processId === command.processId).map((node) => node.id)
    if (nodeIds.length) return reject(state, 'PROCESS_NOT_EMPTY', [], [], [], [command.processId], nodeIds)
    return validateApplied({ ...state, processes: state.processes.filter((process) => process.id !== command.processId) }, [], state)
  }

  if (command.type === 'CREATE_PROCESS_NODE') {
    const node = command.node
    if (!state.processes.some((process) => process.id === node.processId)) return reject(state, 'PROCESS_NOT_FOUND', [], [], [], [node.processId], [node.id])
    if (state.processNodes.some((candidate) => candidate.id === node.id)) return reject(state, 'PROCESS_NODE_ID_DUPLICATE', [], [], [], [node.processId], [node.id])
    if (node.parentNodeId !== null) {
      const parent = state.processNodes.find((candidate) => candidate.id === node.parentNodeId)
      if (!parent || parent.processId !== node.processId) return reject(state, 'PROCESS_NODE_PARENT_INVALID', [], [], [], [node.processId], [node.id, node.parentNodeId])
    }
    const next = { ...state, processNodes: [...state.processNodes, { ...node, title: node.title.trim() }] }
    return validateApplied(next, [], state)
  }

  if (command.type === 'UPDATE_PROCESS_NODE') {
    const node = state.processNodes.find((candidate) => candidate.id === command.nodeId)
    if (!node) return reject(state, 'PROCESS_NODE_NOT_FOUND', [], [], [], [command.nodeId], [command.nodeId])
    const nextNode = { ...node, title: command.title.trim() }
    if (JSON.stringify(node) === JSON.stringify(nextNode)) return { status: 'noop', state }
    return validateApplied({ ...state, processNodes: state.processNodes.map((candidate) => candidate.id === node.id ? nextNode : candidate) }, [], state)
  }

  if (command.type === 'MOVE_PROCESS_NODE') {
    const node = state.processNodes.find((candidate) => candidate.id === command.nodeId)
    if (!node) return reject(state, 'PROCESS_NODE_NOT_FOUND', [], [], [], [command.nodeId], [command.nodeId])
    if (command.parentNodeId === node.id || (command.parentNodeId && isProcessNodeDescendant(state, command.parentNodeId, node.id))) {
      return reject(state, 'PROCESS_NODE_CYCLE', [], [], [], [node.processId], [node.id, command.parentNodeId ?? node.id])
    }
    if (command.parentNodeId !== null) {
      const parent = state.processNodes.find((candidate) => candidate.id === command.parentNodeId)
      if (!parent || parent.processId !== node.processId) return reject(state, 'PROCESS_NODE_PARENT_INVALID', [], [], [], [node.processId], [node.id, command.parentNodeId])
    }
    const siblingCount = processSiblings(state, node.processId, command.parentNodeId).filter((candidate) => candidate.id !== node.id).length
    if (!Number.isInteger(command.insertIndex) || command.insertIndex < 0 || command.insertIndex > siblingCount) return reject(state, 'PROCESS_NODE_ORDER_INVALID', [], [], [], [node.processId], [node.id])
    const next = reorderProcessSiblings(state, node.id, command.parentNodeId, command.insertIndex)
    return validateApplied(next, [], state)
  }

  if (command.type === 'DELETE_PROCESS_LEAF_NODE') {
    const node = state.processNodes.find((candidate) => candidate.id === command.nodeId)
    if (!node) return reject(state, 'PROCESS_NODE_NOT_FOUND', [], [], [], [command.nodeId], [command.nodeId])
    const childIds = state.processNodes.filter((candidate) => candidate.parentNodeId === node.id).map((candidate) => candidate.id)
    if (childIds.length) return reject(state, 'PROCESS_NODE_HAS_CHILDREN', [], [], [], [node.processId], [node.id, ...childIds])
    const next = {
      ...state,
      processNodes: state.processNodes.filter((candidate) => candidate.id !== node.id),
      processEdges: state.processEdges.filter((edge) => edge.fromNodeId !== node.id && edge.toNodeId !== node.id),
      processNodeDutyLinks: state.processNodeDutyLinks.filter((link) => link.processNodeId !== node.id),
    }
    return validateApplied(next, [], state)
  }

  if (command.type === 'CREATE_PROCESS_EDGE') {
    const edge = command.edge
    const from = state.processNodes.find((node) => node.id === edge.fromNodeId)
    const to = state.processNodes.find((node) => node.id === edge.toNodeId)
    if (!state.processes.some((process) => process.id === edge.processId) || !from || !to || from.processId !== edge.processId || to.processId !== edge.processId) return reject(state, 'PROCESS_EDGE_ENDPOINT_INVALID', [], [], [], [edge.processId], [edge.fromNodeId, edge.toNodeId])
    if (edge.fromNodeId === edge.toNodeId) return reject(state, 'PROCESS_EDGE_SELF_LOOP', [], [], [], [edge.processId], [edge.fromNodeId])
    if (state.processEdges.some((candidate) => candidate.id === edge.id)) return reject(state, 'PROCESS_EDGE_ID_DUPLICATE', [], [], [], [edge.processId], [edge.id])
    if (state.processEdges.some((candidate) => candidate.processId === edge.processId && candidate.fromNodeId === edge.fromNodeId && candidate.toNodeId === edge.toNodeId)) return reject(state, 'PROCESS_EDGE_DUPLICATE', [], [], [], [edge.processId], [edge.fromNodeId, edge.toNodeId])
    return validateApplied({ ...state, processEdges: [...state.processEdges, edge] }, [], state)
  }

  if (command.type === 'DELETE_PROCESS_EDGE') {
    if (!state.processEdges.some((edge) => edge.id === command.edgeId)) return { status: 'noop', state }
    return validateApplied({ ...state, processEdges: state.processEdges.filter((edge) => edge.id !== command.edgeId) }, [], state)
  }

  if (command.type === 'LINK_PROCESS_NODE_DUTY') {
    const link = command.link
    const node = state.processNodes.find((candidate) => candidate.id === link.processNodeId)
    if (!node || !state.duties.some((duty) => duty.id === link.dutyId)) return reject(state, 'PROCESS_DUTY_LINK_REFERENCE_INVALID', [], [], [link.dutyId], node ? [node.processId] : [], [link.processNodeId])
    if (state.processNodeDutyLinks.some((candidate) => candidate.id === link.id)) return reject(state, 'PROCESS_DUTY_LINK_ID_DUPLICATE', [], [], [link.dutyId], [node.processId], [node.id])
    if (state.processNodeDutyLinks.some((candidate) => candidate.processNodeId === link.processNodeId && candidate.dutyId === link.dutyId)) return reject(state, 'PROCESS_DUTY_LINK_DUPLICATE', [], [], [link.dutyId], [node.processId], [node.id])
    return validateApplied({ ...state, processNodeDutyLinks: [...state.processNodeDutyLinks, link] }, [], state)
  }

  if (command.type === 'UNLINK_PROCESS_NODE_DUTY') {
    if (!state.processNodeDutyLinks.some((link) => link.id === command.linkId)) return { status: 'noop', state }
    return validateApplied({ ...state, processNodeDutyLinks: state.processNodeDutyLinks.filter((link) => link.id !== command.linkId) }, [], state)
  }

  if (command.type === 'CREATE_DUTY_AND_LINK_PROCESS_NODE') {
    const node = state.processNodes.find((candidate) => candidate.id === command.link.processNodeId)
    if (!node) return reject(state, 'PROCESS_NODE_NOT_FOUND', [], [], [], [], [command.link.processNodeId])
    if (state.duties.some((duty) => duty.id === command.duty.id)) return reject(state, 'DUTY_ID_DUPLICATE', [], [], [command.duty.id], [node.processId], [node.id])
    if (state.processNodeDutyLinks.some((link) => link.processNodeId === command.link.processNodeId && link.dutyId === command.duty.id)) return reject(state, 'PROCESS_DUTY_LINK_DUPLICATE', [], [], [command.duty.id], [node.processId], [node.id])
    const next = {
      ...state,
      duties: [...state.duties, { ...command.duty, title: command.duty.title.trim(), description: command.duty.description?.trim() || null }],
      processNodeDutyLinks: [...state.processNodeDutyLinks, { ...command.link, dutyId: command.duty.id }],
    }
    return validateApplied(next, [], state)
  }

  if (command.type === 'ADD_ORGANIZATION_LEVEL') {
    const next = {
      ...state,
      organizationLevels: [...state.organizationLevels, {
        id: command.level.id,
        name: command.level.name.trim(),
        order: state.organizationLevels.length,
      }],
    }
    return validateApplied(next, [], state)
  }

  if (command.type === 'RENAME_ORGANIZATION_LEVEL') {
    if (!state.organizationLevels.some((level) => level.id === command.levelId)) return reject(state, 'ORGANIZATION_LEVEL_NOT_FOUND')
    const next = {
      ...state,
      organizationLevels: state.organizationLevels.map((level) => level.id === command.levelId
        ? { ...level, name: command.name.trim() }
        : level),
    }
    return validateApplied(next, [], state)
  }

  if (command.type === 'DELETE_ORGANIZATION_LEVEL') {
    if (!state.organizationLevels.some((level) => level.id === command.levelId)) return reject(state, 'ORGANIZATION_LEVEL_NOT_FOUND')
    const usedPositionIds = state.positions.filter((position) => position.organizationLevelId === command.levelId).map((position) => position.id)
    if (usedPositionIds.length) return reject(state, 'ORGANIZATION_LEVEL_IN_USE', usedPositionIds)
    const organizationLevels = state.organizationLevels
      .filter((level) => level.id !== command.levelId)
      .sort((first, second) => first.order - second.order)
      .map((level, order) => ({ ...level, order }))
    return validateApplied({ ...state, organizationLevels }, [], state)
  }

  if (command.type === 'REORDER_ORGANIZATION_LEVELS') {
    const currentIds = new Set(state.organizationLevels.map((level) => level.id))
    if (command.levelIds.length !== currentIds.size
      || new Set(command.levelIds).size !== command.levelIds.length
      || command.levelIds.some((id) => !currentIds.has(id))) return reject(state, 'INVALID_LEVEL_SEQUENCE')
    const orderById = new Map(command.levelIds.map((id, order) => [id, order]))
    const next = {
      ...state,
      organizationLevels: state.organizationLevels.map((level) => ({ ...level, order: orderById.get(level.id)! })),
    }
    return validateApplied(next, state.positions.filter((position) => position.organizationLevelId !== null).map((position) => position.id), state)
  }

  if (command.type === 'SET_ORGANIZATION_LAYOUT') {
    const next = {
      ...state,
      organizationLayout: {
        ...state.organizationLayout,
        mode: command.mode ?? state.organizationLayout.mode,
        showLevelGuides: command.showLevelGuides ?? state.organizationLayout.showLevelGuides,
      },
    }
    return validateApplied(next, [], state)
  }

  if (command.type === 'SET_POSITION_Y_OVERRIDE') {
    if (!positionOrReject(state, command.positionId)) return reject(state, 'POSITION_NOT_FOUND', [command.positionId])
    if (command.y !== null && (!Number.isFinite(command.y) || command.y < 0)) return reject(state, 'INVALID_POSITION_Y', [command.positionId])
    const positionYOverrides = { ...(state.organizationLayout.positionYOverrides ?? {}) }
    if (command.y === null) delete positionYOverrides[command.positionId]
    else positionYOverrides[command.positionId] = command.y
    if (JSON.stringify(positionYOverrides) === JSON.stringify(state.organizationLayout.positionYOverrides ?? {})) return { status: 'noop', state }
    return validateApplied({
      ...state,
      organizationLayout: { ...state.organizationLayout, positionYOverrides },
    }, [command.positionId], state)
  }

  if (command.type === 'ADD_POSITION') {
    if (state.positions.some((position) => position.id === command.position.id) || state.members.some((member) => member.id === command.position.id)) {
      return reject(state, 'DUPLICATE_ID', [command.position.id])
    }
    if (command.position.departmentId !== null && !state.departments.some((department) => department.id === command.position.departmentId)) {
      return reject(state, 'DEPARTMENT_NOT_FOUND', [], [command.position.departmentId])
    }
    const roleMutation = resolveRoleMutation(state, command.position.roleId, command.role)
    if (!roleMutation.ok) return reject(state, 'ROLE_NOT_FOUND', [command.position.id])
    const parent = command.position.parentPositionId
      ? state.positions.find((position) => position.id === command.position.parentPositionId && position.status === 'active')
      : null
    if (parent?.organizationLevelId) {
      const parentLevel = state.organizationLevels.find((level) => level.id === parent.organizationLevelId)
      const maximumOrder = Math.max(...state.organizationLevels.map((level) => level.order))
      if (parentLevel?.order === maximumOrder) return reject(state, 'NO_LOWER_ORGANIZATION_LEVEL', [parent.id])
    }
    const siblingNodes = buildHierarchyNodes(state)
      .filter((node) => node.parentId === command.position.parentPositionId)
      .sort((a, b) => a.order - b.order)
    const insertIndex = Math.max(0, Math.min(command.order, siblingNodes.length))
    let next: OrgDirectoryState = {
      ...state,
      roles: roleMutation.roles,
      positions: [...state.positions, {
        ...command.position,
        status: 'active',
        allowMultipleAssignees: false,
      }],
      members: [...state.members, {
        id: command.position.id,
        order: insertIndex,
        childrenAxis: 'horizontal',
      }],
    }
    const destinationIds = [...siblingNodes.map((node) => node.id)]
    destinationIds.splice(insertIndex, 0, command.position.id)
    const orderById = new Map(destinationIds.map((id, index) => [id, index]))
    next = {
      ...next,
      members: next.members.map((member) => {
        const order = orderById.get(member.id)
        const expanded = command.position.parentPositionId !== null && member.id === command.position.parentPositionId
        return order === undefined && !expanded ? member : { ...member, ...(order === undefined ? {} : { order }), ...(expanded ? { collapsed: false } : {}) }
      }),
    }
    return validateApplied(next, [command.position.id], state)
  }

  if (command.type === 'MOVE_POSITION') {
    const moving = positionOrReject(state, command.positionId)
    if (!moving) return reject(state, 'POSITION_NOT_FOUND', [command.positionId])
    if (command.parentPositionId === command.positionId) return reject(state, 'SELF_PARENT', [command.positionId])
    const nodes = buildHierarchyNodes(state)
    if (command.parentPositionId && !nodes.some((node) => node.id === command.parentPositionId)) {
      return reject(state, 'MISSING_PARENT', [command.positionId])
    }
    if (command.parentPositionId && isHierarchyDescendant(nodes, command.parentPositionId, command.positionId)) {
      return reject(state, 'HIERARCHY_CYCLE', [command.positionId, command.parentPositionId])
    }
    const siblings = nodes
      .filter((node) => node.parentId === command.parentPositionId && node.id !== command.positionId)
      .sort((a, b) => a.order - b.order)
    if (!Number.isInteger(command.insertIndex) || command.insertIndex < 0 || command.insertIndex > siblings.length) {
      return reject(state, 'INVALID_INSERT_INDEX', [command.positionId])
    }
    const orderedIds = siblings.map((node) => node.id)
    orderedIds.splice(command.insertIndex, 0, command.positionId)
    const orderById = new Map(orderedIds.map((id, index) => [id, index]))
    let next: OrgDirectoryState = {
      ...state,
      positions: state.positions.map((position) => position.id === command.positionId
        ? { ...position, parentPositionId: command.parentPositionId }
        : position),
      members: state.members.map((member) => {
        const order = orderById.get(member.id)
        return order === undefined ? member : { ...member, order }
      }),
    }
    // A move changes two sibling sets when the parent changes. Normalize both
    // in the same proposed snapshot so order never develops a gap.
    next = normalizeOrders(next, moving.parentPositionId)
    next = normalizeOrders(next, command.parentPositionId)
    if (command.parentPositionId) {
      const targetMember = next.members.find((member) => member.id === command.parentPositionId)
      if (targetMember?.collapsed) {
        next = { ...next, members: next.members.map((member) => member.id === command.parentPositionId ? { ...member, collapsed: false } : member) }
      }
    }
    return validateApplied(next, [command.positionId], state)
  }

  if (command.type === 'REORDER_POSITION') {
    const position = positionOrReject(state, command.positionId)
    if (!position) return reject(state, 'POSITION_NOT_FOUND', [command.positionId])
    const nodes = buildHierarchyNodes(state)
    const current = nodes.find((node) => node.id === command.positionId)!
    const siblings = nodes.filter((node) => node.parentId === current.parentId).sort((a, b) => a.order - b.order)
    const index = siblings.findIndex((node) => node.id === command.positionId)
    const swapIndex = index + command.delta
    if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return { status: 'noop', state }
    const first = siblings[index]
    const second = siblings[swapIndex]
    const next = {
      ...state,
      members: state.members.map((member) => {
        if (member.id === first.id) return { ...member, order: second.order }
        if (member.id === second.id) return { ...member, order: first.order }
        return member
      }),
    }
    return validateApplied(next, [first.id, second.id], state)
  }

  if (command.type === 'CHANGE_POSITION_DEPARTMENT') {
    const position = positionOrReject(state, command.positionId)
    if (!position) return reject(state, 'POSITION_NOT_FOUND', [command.positionId])
    if (command.departmentId !== null && !state.departments.some((department) => department.id === command.departmentId)) {
      return reject(state, 'DEPARTMENT_NOT_FOUND', [command.positionId], [command.departmentId])
    }
    if (position.departmentId === command.departmentId) return { status: 'noop', state }
    const next = {
      ...state,
      positions: state.positions.map((item) => item.id === command.positionId ? { ...item, departmentId: command.departmentId } : item),
    }
    return validateApplied(next, [command.positionId], state)
  }

  if (command.type === 'PATCH_POSITION') {
    const position = positionOrReject(state, command.positionId)
    if (!position) return reject(state, 'POSITION_NOT_FOUND', [command.positionId])
    if (command.departmentId !== undefined && command.departmentId !== null && !state.departments.some((department) => department.id === command.departmentId)) {
      return reject(state, 'DEPARTMENT_NOT_FOUND', [command.positionId], [command.departmentId])
    }
    const roleMutation = resolveRoleMutation(state, command.roleId, command.role)
    if (!roleMutation.ok) return reject(state, 'ROLE_NOT_FOUND', [command.positionId])
    const nextPosition = {
      ...position,
      ...(command.title !== undefined ? { title: command.title.trim() || '未命名職位' } : {}),
      ...(roleMutation.roleId !== undefined ? { roleId: roleMutation.roleId } : {}),
      ...(command.departmentId !== undefined ? { departmentId: command.departmentId } : {}),
      ...(command.organizationLevelId !== undefined ? { organizationLevelId: command.organizationLevelId } : {}),
      ...(command.allowMultipleAssignees !== undefined ? { allowMultipleAssignees: command.allowMultipleAssignees } : {}),
    }
    const currentMember = state.members.find((member) => member.id === command.positionId)
    const nextMember = command.childrenAxis !== undefined && currentMember
      ? { ...currentMember, childrenAxis: command.childrenAxis }
      : currentMember
    if (JSON.stringify(nextPosition) === JSON.stringify(position)
      && JSON.stringify(nextMember) === JSON.stringify(currentMember)
      && roleMutation.roles === state.roles) return { status: 'noop', state }
    const next = {
      ...state,
      roles: roleMutation.roles,
      positions: state.positions.map((item) => item.id === command.positionId ? nextPosition : item),
      members: nextMember ? state.members.map((item) => item.id === command.positionId ? nextMember : item) : state.members,
    }
    return validateApplied(next, [command.positionId], state)
  }

  if (command.type === 'DUPLICATE_POSITION') {
    const source = positionOrReject(state, command.sourcePositionId)
    if (!source) return reject(state, 'POSITION_NOT_FOUND', [command.sourcePositionId])
    if (state.positions.some((position) => position.id === command.newPositionId) || state.members.some((member) => member.id === command.newPositionId)) {
      return reject(state, 'DUPLICATE_ID', [command.newPositionId])
    }
    const duplicated = duplicatePosition(state.members, state.positions, command.sourcePositionId, command.newPositionId)
    return validateApplied({ ...state, ...duplicated }, [command.newPositionId], state)
  }

  if (command.type === 'DELETE_POSITION') {
    const position = positionOrReject(state, command.positionId)
    if (!position) return reject(state, 'POSITION_NOT_FOUND', [command.positionId])
    const nodes = buildHierarchyNodes(state)
    const selected = nodes.find((node) => node.id === command.positionId)!
    const children = nodes.filter((node) => node.parentId === command.positionId).sort((a, b) => a.order - b.order)
    const branchIds = command.mode === 'branch' ? collectActiveBranchIds(state, command.positionId) : new Set([command.positionId])
    if (command.mode === 'promote') {
      const siblings = nodes.filter((node) => node.parentId === selected.parentId && node.id !== selected.id).sort((a, b) => a.order - b.order)
      const ordered = [
        ...siblings.filter((node) => node.order < selected.order).map((node) => node.id),
        ...children.map((node) => node.id),
        ...siblings.filter((node) => node.order > selected.order).map((node) => node.id),
      ]
      const orderById = new Map(ordered.map((id, index) => [id, index]))
      const next = invalidateDutyRelationsForPositions(removePositionYOverrides({
        ...state,
        positions: state.positions.map((item) => item.id === command.positionId
          ? { ...item, status: 'inactive' as const }
          : children.some((child) => child.id === item.id)
            ? { ...item, parentPositionId: selected.parentId }
            : item),
        members: state.members
          .filter((member) => member.id !== command.positionId)
          .map((member) => {
            const order = orderById.get(member.id)
            return order === undefined ? member : { ...member, order }
          }),
        assignments: closeAssignmentsForPositions(state.assignments, branchIds, { asOf: command.asOf }),
      }, [command.positionId]), branchIds)
      return validateApplied(next, [command.positionId, ...children.map((child) => child.id)], state, undefined, command.asOf)
    }
    const parentId = selected.parentId
    let next = invalidateDutyRelationsForPositions(removePositionYOverrides({
      ...state,
      positions: state.positions.map((item) => branchIds.has(item.id) ? { ...item, status: 'inactive' as const } : item),
      members: state.members.filter((member) => !branchIds.has(member.id)),
      assignments: closeAssignmentsForPositions(state.assignments, branchIds, { asOf: command.asOf }),
    }, branchIds), branchIds)
    next = normalizeOrders(next, parentId)
    return validateApplied(next, [...branchIds], state, undefined, command.asOf)
  }

  const department = state.departments.find((item) => item.id === command.departmentId)
  if (!department) return reject(state, 'DEPARTMENT_NOT_FOUND', [], [command.departmentId])
  if (command.replacementDepartmentId && !state.departments.some((item) => item.id === command.replacementDepartmentId && item.id !== command.departmentId)) {
    return reject(state, 'DEPARTMENT_NOT_FOUND', [], [command.replacementDepartmentId])
  }
  const next = removeDepartmentFromDirectory(state, command.departmentId, command.replacementDepartmentId)
  if (next === state && command.replacementDepartmentId) {
    return reject(state, 'INVALID_DEPARTMENT_REPLACEMENT', [], [command.replacementDepartmentId])
  }
  return validateApplied(
    next,
    state.positions.filter((position) => position.departmentId === command.departmentId).map((position) => position.id),
    state,
    { allowDisconnectedDepartments: Boolean(command.replacementDepartmentId) },
  )
}
