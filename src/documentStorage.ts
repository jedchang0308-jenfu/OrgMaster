import { validateOrganizationState, type OrganizationValidationCode } from './organizationHierarchy'
import {
  validateRoleCombinationRiskRules,
  type RoleCombinationRiskRuleValidationCode,
} from './roleCombinationRisks'
import { validateEmployeeResponsibilities, type EmployeeResponsibilityValidationCode } from './employeeResponsibilities'
import { normalizeDutyState, validateDutyState, type DutyValidationCode } from './duties'
import { createDefaultOrganizationLevels } from './organizationLevels'
import { createEmptyProcessPlanningCollections, normalizeProcessPlanningState, validateProcessPlanningState, type ProcessPlanningValidationCode } from './processPlanning'
import type { Employee, OrgDirectoryState, OrgMember, Position } from './types'
import { isUuidV7 } from './employeeIdentity'

export const ORG_DOCUMENT_VERSION = 8 as const
export const ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v8'
export const ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v8'
export const LEGACY_V7_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v7'
export const LEGACY_V7_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v7'
export const LEGACY_V6_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v6'
export const LEGACY_V6_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v6'
export const LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v5'
export const LEGACY_V5_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v5'
export const LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v4'
export const LEGACY_V4_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v4'
export const LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v3'
export const LEGACY_V3_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v3'
export const LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v2'
export const LEGACY_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.v1'
export const LEGACY_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v1'
export const RECOVERY_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.recovery.v8'
export const RECOVERY_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.recovery.v8'
export const LEGACY_V7_RECOVERY_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.recovery.v7'
export const LEGACY_V7_RECOVERY_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.recovery.v7'
export const LEGACY_V6_RECOVERY_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.recovery.v6'
export const LEGACY_V6_RECOVERY_ORG_DOCUMENT_DRAFT_STORAGE_KEY = 'orgmaster.local-draft.recovery.v6'
// Backward-compatible alias for callers that used the earlier name.
export const ORG_DOCUMENT_RECOVERY_KEY = RECOVERY_ORG_DOCUMENT_STORAGE_KEY

export type OrgDocumentKind = 'document' | 'draft' | 'copy' | 'backup'

export interface OrgDocumentFile {
  app: 'OrgMaster'
  /** V7 remains readable for pre-rekey local state; canonical post-rekey writes are V8. */
  version: 7 | typeof ORG_DOCUMENT_VERSION
  kind: OrgDocumentKind
  savedAt: string
  state: OrgDirectoryState
}

export type DocumentFailureCode =
  | 'INVALID_JSON'
  | 'INVALID_APP'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_DOCUMENT_SHAPE'
  | 'MIGRATION_ID_MISMATCH'
  | RoleCombinationRiskRuleValidationCode
  | OrganizationValidationCode
  | EmployeeResponsibilityValidationCode
  | DutyValidationCode
  | ProcessPlanningValidationCode
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'EMPLOYEE_ID_INVALID'

export type ParseOrgDocumentResult =
  | { ok: true; document: OrgDocumentFile; sourceVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; compatibility?: { implicitActiveEmployeeCount: number } }
  | { ok: false; code: DocumentFailureCode; positionIds: string[]; departmentIds: string[]; dutyIds: string[]; processIds: string[]; processNodeIds: string[] }

export type LocalDocumentLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; document: OrgDocumentFile; sourceVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
  | {
      status: 'failed'
      code: DocumentFailureCode
      sourceKey: string
      raw: string
      positionIds: string[]
      departmentIds: string[]
      dutyIds: string[]
      processIds: string[]
      processNodeIds: string[]
    }

type OrgDirectoryStateV6 = Omit<OrgDirectoryState, 'processes' | 'processNodes' | 'processEdges' | 'processNodeDutyLinks'>
type OrgDirectoryStateV5 = Omit<OrgDirectoryStateV6, 'duties' | 'dutyPositionRelations'>
type LegacyPosition = Omit<Position, 'organizationLevelId'> & { organizationLevelId?: unknown }

type V4OrgDirectoryState = Omit<OrgDirectoryStateV5, 'positions' | 'organizationLevels' | 'organizationLayout'> & {
  positions: LegacyPosition[]
  organizationLevels?: unknown
  organizationLayout?: unknown
}

type LegacyOrgDirectoryState = Omit<V4OrgDirectoryState, 'roleCombinationRiskRules'> & {
  roleCombinationRiskRules?: unknown
}

const LEGACY_STATE_KEYS = [
  'employees',
  'departments',
  'roles',
  'positions',
  'assignments',
  'members',
] as const

const V4_STATE_KEYS = [...LEGACY_STATE_KEYS, 'roleCombinationRiskRules'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLegacyOrgDirectoryState(value: unknown): value is LegacyOrgDirectoryState {
  return isRecord(value) && LEGACY_STATE_KEYS.every((key) => Array.isArray(value[key]))
}

function isV4OrgDirectoryState(value: unknown): value is V4OrgDirectoryState {
  return isRecord(value) && V4_STATE_KEYS.every((key) => Array.isArray(value[key]))
}

function isV5OrgDirectoryState(value: unknown): value is OrgDirectoryStateV5 {
  return isV4OrgDirectoryState(value)
    && Array.isArray(value.organizationLevels)
    && isRecord(value.organizationLayout)
    && (value.organizationLayout.mode === 'tree' || value.organizationLayout.mode === 'levels')
    && typeof value.organizationLayout.showLevelGuides === 'boolean'
}

function isV6OrgDirectoryState(value: unknown): value is OrgDirectoryStateV6 {
  return isV5OrgDirectoryState(value)
    && Array.isArray((value as Record<string, unknown>).duties)
    && Array.isArray((value as Record<string, unknown>).dutyPositionRelations)
}

function isOrgDirectoryState(value: unknown): value is OrgDirectoryState {
  return isV6OrgDirectoryState(value)
    && Array.isArray((value as Record<string, unknown>).processes)
    && Array.isArray((value as Record<string, unknown>).processNodes)
    && Array.isArray((value as Record<string, unknown>).processEdges)
    && Array.isArray((value as Record<string, unknown>).processNodeDutyLinks)
}

function normalizePositionYOverrides(value: unknown): Record<string, number> | null {
  if (value === undefined) return {}
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.some(([, y]) => typeof y !== 'number' || !Number.isFinite(y) || y < 0)) return null
  return Object.fromEntries(entries) as Record<string, number>
}

function getDefaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function cloneOrgState(state: OrgDirectoryState): OrgDirectoryState {
  return JSON.parse(JSON.stringify(state)) as OrgDirectoryState
}

export function orgStateSignature(state: OrgDirectoryState): string {
  return JSON.stringify(state)
}

function failure(
  code: DocumentFailureCode,
  positionIds: string[] = [],
  departmentIds: string[] = [],
  dutyIds: string[] = [],
  processIds: string[] = [],
  processNodeIds: string[] = [],
): ParseOrgDocumentResult {
  return { ok: false, code, positionIds, departmentIds, dutyIds, processIds, processNodeIds }
}

function validationFailure(state: OrgDirectoryState): ParseOrgDocumentResult | null {
  const result = validateOrganizationState(state, { allowDisconnectedDepartments: true })
  if (!result.ok) return failure(result.code, result.positionIds, result.departmentIds)
  const responsibilityResult = validateEmployeeResponsibilities(state)
  return responsibilityResult.ok
    ? null
    : failure(responsibilityResult.code, responsibilityResult.assignmentIds)
}

function normalizeSiblingOrders<T extends Pick<OrgDirectoryState, 'positions' | 'members'>>(state: T): T {
  const memberById = new Map(state.members.map((member) => [member.id, member]))
  const groups = new Map<string | null, string[]>()
  for (const position of state.positions) {
    if (position.status !== 'active' || !memberById.has(position.id)) continue
    const ids = groups.get(position.parentPositionId) ?? []
    ids.push(position.id)
    groups.set(position.parentPositionId, ids)
  }
  const orderById = new Map<string, number>()
  for (const ids of groups.values()) {
    ids.sort((first, second) => (memberById.get(first)?.order ?? 0) - (memberById.get(second)?.order ?? 0) || first.localeCompare(second))
    ids.forEach((id, index) => orderById.set(id, index))
  }
  return {
    ...state,
    members: state.members.map((member) => orderById.has(member.id) ? { ...member, order: orderById.get(member.id)! } : member),
  } as T
}

function addEmptyDuties(state: OrgDirectoryStateV5): OrgDirectoryState {
  return { ...state, duties: [], dutyPositionRelations: [], ...createEmptyProcessPlanningCollections() }
}

function addEmptyProcessPlanning(state: OrgDirectoryStateV6): OrgDirectoryState {
  return { ...state, ...createEmptyProcessPlanningCollections() }
}

function containsLegacyParentField(state: Pick<OrgDirectoryState, 'members'>) {
  return state.members.some((member) => isRecord(member) && 'parentId' in member)
}

function stripLegacyParentField(state: OrgDirectoryState): OrgDirectoryState {
  return {
    ...state,
    members: state.members.map((member) => {
      const legacy = member as OrgMember & { parentId?: string | null }
      const { parentId: _legacyParentId, ...layout } = legacy
      return layout
    }),
  }
}

function normalizeDepartmentIds(value: Record<string, unknown>): string[] | null {
  const rawDepartmentIds = value.departmentIds
  const legacyDepartmentId = value.departmentId
  if (rawDepartmentIds !== undefined) {
    if (!Array.isArray(rawDepartmentIds) || rawDepartmentIds.some((id) => typeof id !== 'string')) return null
    return [...new Set(rawDepartmentIds)]
  }
  if (legacyDepartmentId === undefined || legacyDepartmentId === null) return []
  return typeof legacyDepartmentId === 'string' ? [legacyDepartmentId] : null
}

type LegacyAssignment = Omit<import('./types').Assignment, 'assignmentType'> & {
  assignmentType: 'primary' | 'secondary' | 'acting'
}

function normalizeLegacyAssignments(rawAssignments: unknown[]): import('./types').Assignment[] | null {
  const assignments: import('./types').Assignment[] = []
  for (const value of rawAssignments) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.employeeId !== 'string' || typeof value.positionId !== 'string') return null
    if (typeof value.validFrom !== 'string' || (value.validTo !== null && typeof value.validTo !== 'string')) return null
    const assignmentType = value.assignmentType
    if (assignmentType !== 'primary' && assignmentType !== 'secondary' && assignmentType !== 'regular' && assignmentType !== 'acting') return null
    const legacy = value as unknown as LegacyAssignment
    assignments.push({
      ...legacy,
      assignmentType: legacy.assignmentType === 'acting' ? 'acting' : 'regular',
    })
  }
  return assignments
}

function normalizeV4Assignments(rawAssignments: unknown[]): import('./types').Assignment[] | null {
  const assignments: import('./types').Assignment[] = []
  for (const value of rawAssignments) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.employeeId !== 'string' || typeof value.positionId !== 'string') return null
    if (typeof value.validFrom !== 'string' || (value.validTo !== null && typeof value.validTo !== 'string')) return null
    if (value.assignmentType !== 'regular' && value.assignmentType !== 'acting') return null
    assignments.push(value as unknown as import('./types').Assignment)
  }
  return assignments
}

function normalizeLegacyEmployees(rawEmployees: unknown[], rawAssignments: unknown[]): Employee[] | null {
  const employees: Employee[] = []
  for (const value of rawEmployees) {
    if (!isRecord(value)) return null
    if (typeof value.id !== 'string' || typeof value.name !== 'string') return null
    if (value.status !== undefined && value.status !== 'active' && value.status !== 'inactive') return null
    const departmentIds = normalizeDepartmentIds(value)
    if (!departmentIds) return null
    const primaryCandidates = rawAssignments.filter((assignment): assignment is Record<string, unknown> => (
      isRecord(assignment)
        && assignment.employeeId === value.id
        && assignment.validTo === null
        && (assignment.assignmentType === 'primary' || assignment.assignmentType === 'regular')
    ))
    const { departmentId: _legacyDepartmentId, primaryAssignmentId: _legacyPrimaryAssignmentId, administrativeApproverOverrideEmployeeId: _legacyOverride, ...rest } = value
    employees.push({
      ...rest,
      status: value.status === undefined ? 'active' : value.status,
      departmentIds,
      primaryAssignmentId: primaryCandidates.length === 1 ? primaryCandidates[0].id as string : null,
      administrativeApproverOverrideEmployeeId: null,
    } as Employee)
  }
  return employees
}

function normalizeV4Employees(rawEmployees: unknown[]): Employee[] | null {
  const employees: Employee[] = []
  for (const value of rawEmployees) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
    const departmentIds = normalizeDepartmentIds(value)
    if (!departmentIds) return null
    if (value.status !== undefined && value.status !== 'active' && value.status !== 'inactive') return null
    if (value.primaryAssignmentId !== null && typeof value.primaryAssignmentId !== 'string') return null
    if (value.administrativeApproverOverrideEmployeeId !== null && typeof value.administrativeApproverOverrideEmployeeId !== 'string') return null
    employees.push({
      ...value,
      status: value.status ?? 'active',
      departmentIds,
      primaryAssignmentId: value.primaryAssignmentId as string | null,
      administrativeApproverOverrideEmployeeId: value.administrativeApproverOverrideEmployeeId as string | null,
    } as Employee)
  }
  return employees
}

function getLegacyHierarchyDepth(positions: LegacyPosition[], id: string) {
  const byId = new Map(positions.filter((position) => position.status === 'active').map((position) => [position.id, position]))
  let depth = 1
  let cursor = byId.get(id)
  const visited = new Set<string>()
  while (cursor?.parentPositionId && !visited.has(cursor.parentPositionId)) {
    visited.add(cursor.parentPositionId)
    cursor = byId.get(cursor.parentPositionId)
    depth += 1
  }
  return depth
}

function upgradeLegacyOrganizationLevels(state: V4OrgDirectoryState): OrgDirectoryStateV5 {
  const activePositions = state.positions.filter((position) => position.status === 'active')
  const depthById = new Map(activePositions.map((position) => [position.id, getLegacyHierarchyDepth(state.positions, position.id)]))
  const maximumDepth = Math.max(1, ...depthById.values())
  const organizationLevels = createDefaultOrganizationLevels(maximumDepth)
  return {
    ...state,
    positions: state.positions.map((position) => {
      const { organizationLevelId: _legacyOrganizationLevelId, ...legacyPosition } = position
      const depth = depthById.get(position.id)
      return {
        ...legacyPosition,
        organizationLevelId: position.status === 'active' && depth
          ? organizationLevels[depth - 1].id
          : null,
      }
    }),
    organizationLevels,
    organizationLayout: { mode: 'tree', showLevelGuides: true, positionYOverrides: {} },
  }
}

function normalizeV2State(state: LegacyOrgDirectoryState, source: Record<string, unknown>): ParseOrgDocumentResult {
  if (containsLegacyParentField(state)) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => !('parentPositionId' in position))) return failure('INVALID_DOCUMENT_SHAPE')
  const assignments = normalizeLegacyAssignments(state.assignments)
  const employees = assignments ? normalizeLegacyEmployees(state.employees, state.assignments) : null
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  const normalized: V4OrgDirectoryState = {
    ...state,
    employees,
    assignments,
    positions: state.positions.map((position) => ({ ...position, parentPositionId: position.parentPositionId ?? null })),
    members: state.members.map((member) => ({ ...member })),
    roleCombinationRiskRules: [],
  }
  const ordered = normalizeSiblingOrders(upgradeLegacyOrganizationLevels(normalized))
  const withDuties = addEmptyDuties(ordered)
  return validationFailure(withDuties) ?? { ok: true, document: createOrgDocumentFile(withDuties, source.kind as OrgDocumentKind, source.savedAt as string), sourceVersion: 2 }
}

function migrateV1State(state: LegacyOrgDirectoryState, envelope: Record<string, unknown>): ParseOrgDocumentResult {
  const legacyMembers = state.members as Array<OrgMember & { parentId?: string | null }>
  const activePositions = state.positions.filter((position) => position.status === 'active')
  const activeIds = new Set(activePositions.map((position) => position.id))
  const memberIds = new Set(legacyMembers.map((member) => member.id))
  const missing = activePositions.filter((position) => !memberIds.has(position.id)).map((position) => position.id)
  const orphan = legacyMembers.filter((member) => !activeIds.has(member.id)).map((member) => member.id)
  if (missing.length || orphan.length) return failure('MIGRATION_ID_MISMATCH', [...missing, ...orphan])

  const memberById = new Map(legacyMembers.map((member) => [member.id, member]))
  const assignments = normalizeLegacyAssignments(state.assignments)
  const employees = assignments ? normalizeLegacyEmployees(state.employees, state.assignments) : null
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  const migratedPositions: LegacyPosition[] = state.positions.map((position) => ({
    ...position,
    parentPositionId: position.status === 'active' ? memberById.get(position.id)?.parentId ?? null : null,
  }))
  const migrated: V4OrgDirectoryState = {
    ...state,
    employees,
    assignments,
    positions: migratedPositions,
    members: legacyMembers.map(({ parentId: _legacyParentId, ...member }) => member),
    roleCombinationRiskRules: [],
  }
  const ordered = normalizeSiblingOrders(upgradeLegacyOrganizationLevels(migrated))
  const withDuties = addEmptyDuties(ordered)
  const invalid = validationFailure(withDuties)
  if (invalid) return invalid
  return { ok: true, document: createOrgDocumentFile(withDuties, envelope.kind as OrgDocumentKind, envelope.savedAt as string), sourceVersion: 1 }
}

function normalizeV3State(state: V4OrgDirectoryState, source: Record<string, unknown>): ParseOrgDocumentResult {
  if (containsLegacyParentField(state)) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => !('parentPositionId' in position))) return failure('INVALID_DOCUMENT_SHAPE')
  const assignments = normalizeLegacyAssignments(state.assignments)
  const employees = assignments ? normalizeLegacyEmployees(state.employees, state.assignments) : null
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  // V3 documents created before the three-level model used `warning` for the
  // middle level. Normalize that legacy value before validating the current
  // contract so existing files remain readable without preserving a fourth UI level.
  const roleCombinationRiskRules = state.roleCombinationRiskRules.map((rule) => {
    const legacyRule = rule as unknown as { level?: unknown; reason?: unknown }
    const normalizedReason = typeof legacyRule.reason === 'string' ? legacyRule.reason.trim() : ''
    return {
      ...rule,
      level: legacyRule.level === 'warning' ? 'medium' as const : rule.level,
      reason: normalizedReason,
    }
  })
  const riskValidation = validateRoleCombinationRiskRules(roleCombinationRiskRules, state.roles)
  if (!riskValidation.ok) return failure(riskValidation.code)
  const normalized = normalizeSiblingOrders(upgradeLegacyOrganizationLevels({
    ...state,
    employees,
    assignments,
    positions: state.positions.map((position) => ({ ...position, parentPositionId: position.parentPositionId ?? null })),
    members: state.members.map((member) => ({ ...member })),
    roleCombinationRiskRules,
  }))
  const withDuties = addEmptyDuties(normalized)
  return validationFailure(withDuties)
    ?? { ok: true, document: createOrgDocumentFile(withDuties, source.kind as OrgDocumentKind, source.savedAt as string), sourceVersion: 3 }
}

function normalizeV4State(state: V4OrgDirectoryState, source: Record<string, unknown>): ParseOrgDocumentResult {
  if (containsLegacyParentField(state)) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => !('parentPositionId' in position))) return failure('INVALID_DOCUMENT_SHAPE')
  const employees = normalizeV4Employees(state.employees)
  const assignments = normalizeV4Assignments(state.assignments)
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  const roleCombinationRiskRules = state.roleCombinationRiskRules.map((rule) => {
    const normalizedReason = typeof rule.reason === 'string' ? rule.reason.trim() : ''
    return { ...rule, reason: normalizedReason }
  })
  const riskValidation = validateRoleCombinationRiskRules(roleCombinationRiskRules, state.roles)
  if (!riskValidation.ok) return failure(riskValidation.code)
  const normalized = normalizeSiblingOrders(upgradeLegacyOrganizationLevels({
    ...state,
    employees,
    assignments,
    positions: state.positions.map((position) => ({ ...position, parentPositionId: position.parentPositionId ?? null })),
    members: state.members.map((member) => ({ ...member })),
    roleCombinationRiskRules,
  }))
  const withDuties = addEmptyDuties(normalized)
  return validationFailure(withDuties)
    ?? { ok: true, document: createOrgDocumentFile(withDuties, source.kind as OrgDocumentKind, source.savedAt as string), sourceVersion: 4 }
}

function normalizeV5State(state: OrgDirectoryStateV5, source: Record<string, unknown>): ParseOrgDocumentResult {
  if (containsLegacyParentField(state)) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => !('parentPositionId' in position) || !('organizationLevelId' in position))) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => position.organizationLevelId !== null && typeof position.organizationLevelId !== 'string')) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.organizationLevels.some((level) => !isRecord(level)
    || typeof level.id !== 'string'
    || typeof level.name !== 'string'
    || typeof level.order !== 'number')) return failure('INVALID_DOCUMENT_SHAPE')
  const employees = normalizeV4Employees(state.employees)
  const assignments = normalizeV4Assignments(state.assignments)
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  const roleCombinationRiskRules = state.roleCombinationRiskRules.map((rule) => ({
    ...rule,
    reason: typeof rule.reason === 'string' ? rule.reason.trim() : '',
  }))
  const positionYOverrides = normalizePositionYOverrides(state.organizationLayout.positionYOverrides)
  if (!positionYOverrides) return failure('INVALID_DOCUMENT_SHAPE')
  const riskValidation = validateRoleCombinationRiskRules(roleCombinationRiskRules, state.roles)
  if (!riskValidation.ok) return failure(riskValidation.code)
  const normalized = normalizeSiblingOrders({
    ...state,
    employees,
    assignments,
    positions: state.positions.map((position) => ({ ...position, parentPositionId: position.parentPositionId ?? null })),
    members: state.members.map((member) => ({ ...member })),
    roleCombinationRiskRules,
    organizationLevels: state.organizationLevels.map((level) => ({ ...level, name: level.name.trim() })),
    organizationLayout: { ...state.organizationLayout, positionYOverrides },
  })
  const withDuties = addEmptyDuties(normalized)
  return validationFailure(withDuties)
    ?? { ok: true, document: createOrgDocumentFile(withDuties, source.kind as OrgDocumentKind, source.savedAt as string), sourceVersion: 5 }
}

function normalizeV6State(state: OrgDirectoryStateV6, source: Record<string, unknown>): ParseOrgDocumentResult {
  if (containsLegacyParentField(state)) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => !('parentPositionId' in position) || !('organizationLevelId' in position))) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => position.organizationLevelId !== null && typeof position.organizationLevelId !== 'string')) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.organizationLevels.some((level) => !isRecord(level)
    || typeof level.id !== 'string'
    || typeof level.name !== 'string'
    || typeof level.order !== 'number')) return failure('INVALID_DOCUMENT_SHAPE')
  const employees = normalizeV4Employees(state.employees)
  const assignments = normalizeV4Assignments(state.assignments)
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  const roleCombinationRiskRules = state.roleCombinationRiskRules.map((rule) => ({ ...rule, reason: typeof rule.reason === 'string' ? rule.reason.trim() : '' }))
  const positionYOverrides = normalizePositionYOverrides(state.organizationLayout.positionYOverrides)
  if (!positionYOverrides) return failure('INVALID_DOCUMENT_SHAPE')
  const riskValidation = validateRoleCombinationRiskRules(roleCombinationRiskRules, state.roles)
  if (!riskValidation.ok) return failure(riskValidation.code)
  const normalized = normalizeDutyState(normalizeSiblingOrders({
    ...state,
    ...createEmptyProcessPlanningCollections(),
    employees,
    assignments,
    positions: state.positions.map((position) => ({ ...position, parentPositionId: position.parentPositionId ?? null })),
    members: state.members.map((member) => ({ ...member })),
    roleCombinationRiskRules,
    organizationLevels: state.organizationLevels.map((level) => ({ ...level, name: level.name.trim() })),
    organizationLayout: { ...state.organizationLayout, positionYOverrides },
  }))
  const dutyValidation = validateDutyState(normalized)
  if (!dutyValidation.ok) return failure(dutyValidation.issue.code, dutyValidation.issue.positionIds)
  return validationFailure(normalized)
    ?? { ok: true, document: createOrgDocumentFile(normalized, source.kind as OrgDocumentKind, source.savedAt as string), sourceVersion: 6 }
}

function normalizeV7State(state: OrgDirectoryState, source: Record<string, unknown>): ParseOrgDocumentResult {
  if (containsLegacyParentField(state)) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => !('parentPositionId' in position) || !('organizationLevelId' in position))) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.positions.some((position) => position.organizationLevelId !== null && typeof position.organizationLevelId !== 'string')) return failure('INVALID_DOCUMENT_SHAPE')
  if (state.organizationLevels.some((level) => !isRecord(level)
    || typeof level.id !== 'string'
    || typeof level.name !== 'string'
    || typeof level.order !== 'number')) return failure('INVALID_DOCUMENT_SHAPE')
  const employees = normalizeV4Employees(state.employees)
  const assignments = normalizeV4Assignments(state.assignments)
  if (!employees || !assignments) return failure('INVALID_DOCUMENT_SHAPE')
  const roleCombinationRiskRules = state.roleCombinationRiskRules.map((rule) => ({ ...rule, reason: typeof rule.reason === 'string' ? rule.reason.trim() : '' }))
  const positionYOverrides = normalizePositionYOverrides(state.organizationLayout.positionYOverrides)
  if (!positionYOverrides) return failure('INVALID_DOCUMENT_SHAPE')
  const riskValidation = validateRoleCombinationRiskRules(roleCombinationRiskRules, state.roles)
  if (!riskValidation.ok) return failure(riskValidation.code)
  const normalized = normalizeProcessPlanningState(normalizeDutyState(normalizeSiblingOrders({
    ...state,
    employees,
    assignments,
    positions: state.positions.map((position) => ({ ...position, parentPositionId: position.parentPositionId ?? null })),
    members: state.members.map((member) => ({ ...member })),
    roleCombinationRiskRules,
    organizationLevels: state.organizationLevels.map((level) => ({ ...level, name: level.name.trim() })),
    organizationLayout: { ...state.organizationLayout, positionYOverrides },
  })))
  const dutyValidation = validateDutyState(normalized)
  if (!dutyValidation.ok) return failure(dutyValidation.issue.code, dutyValidation.issue.positionIds)
  const processValidation = validateProcessPlanningState(normalized)
  if (!processValidation.ok) return failure(processValidation.issue.code, [], [], processValidation.issue.dutyIds, processValidation.issue.processIds, processValidation.issue.processNodeIds)
  return validationFailure(normalized)
    ?? { ok: true, document: createOrgDocumentFile(normalized, source.kind as OrgDocumentKind, source.savedAt as string), sourceVersion: 7 }
}

export function createOrgDocumentFile(
  state: OrgDirectoryState,
  kind: OrgDocumentKind,
  savedAt = new Date().toISOString(),
): OrgDocumentFile {
  const normalized = normalizeProcessPlanningState(normalizeDutyState(stripLegacyParentField({
    ...state,
    employees: state.employees.map((employee) => ({ ...employee, status: employee.status ?? 'active' })),
  })))
  const canonicalEmployeeIds = normalized.employees.every((employee) => isUuidV7(employee.id))
  return { app: 'OrgMaster', version: canonicalEmployeeIds ? ORG_DOCUMENT_VERSION : 7, kind, savedAt, state: cloneOrgState(normalized) }
}

function withEmployeeCompatibility(result: ParseOrgDocumentResult, state: unknown): ParseOrgDocumentResult {
  if (!result.ok) return result
  const employees = isRecord(state) && Array.isArray(state.employees) ? state.employees : []
  return {
    ...result,
    compatibility: {
      implicitActiveEmployeeCount: employees.filter((employee) => isRecord(employee) && employee.status === undefined).length,
    },
  }
}

export function parseOrgDocument(input: unknown): ParseOrgDocumentResult {
  if (!isRecord(input)) return failure('INVALID_DOCUMENT_SHAPE')
  if (input.app !== 'OrgMaster') return failure('INVALID_APP')
  if (input.version !== 1 && input.version !== 2 && input.version !== 3 && input.version !== 4 && input.version !== 5 && input.version !== 6 && input.version !== 7 && input.version !== 8) return failure('UNSUPPORTED_VERSION')
  if (input.kind !== 'document' && input.kind !== 'draft' && input.kind !== 'copy' && input.kind !== 'backup') return failure('INVALID_DOCUMENT_SHAPE')
  if (typeof input.savedAt !== 'string') return failure('INVALID_DOCUMENT_SHAPE')
  if (input.version === 8) {
    if (!isOrgDirectoryState(input.state)) return failure('INVALID_DOCUMENT_SHAPE')
    const migrated = withEmployeeCompatibility(normalizeV7State(input.state, input), input.state)
    if (!migrated.ok) return migrated
    const employees = migrated.document.state.employees
    const employeeIds = new Set(employees.map((employee) => employee.id))
    if (employees.some((employee) => !isUuidV7(employee.id)) || migrated.document.state.assignments.some((assignment) => !employeeIds.has(assignment.employeeId)) || employees.some((employee) => employee.administrativeApproverOverrideEmployeeId !== null && !employeeIds.has(employee.administrativeApproverOverrideEmployeeId))) return failure('EMPLOYEE_ID_INVALID')
    return { ...migrated, sourceVersion: 8 as const }
  }
  if (input.version === 7) {
    return isOrgDirectoryState(input.state)
      ? withEmployeeCompatibility(normalizeV7State(input.state, input), input.state)
      : failure('INVALID_DOCUMENT_SHAPE')
  }
  if (input.version === 6) {
    return isV6OrgDirectoryState(input.state)
      ? withEmployeeCompatibility(normalizeV6State(input.state, input), input.state)
      : failure('INVALID_DOCUMENT_SHAPE')
  }
  if (input.version === 5) {
    return isV5OrgDirectoryState(input.state)
      ? withEmployeeCompatibility(normalizeV5State(input.state, input), input.state)
      : failure('INVALID_DOCUMENT_SHAPE')
  }
  if (input.version === 4) {
    return isV4OrgDirectoryState(input.state)
      ? withEmployeeCompatibility(normalizeV4State(input.state, input), input.state)
      : failure('INVALID_DOCUMENT_SHAPE')
  }
  if (input.version === 3) {
    return isV4OrgDirectoryState(input.state)
      ? withEmployeeCompatibility(normalizeV3State(input.state, input), input.state)
      : failure('INVALID_DOCUMENT_SHAPE')
  }
  if (!isLegacyOrgDirectoryState(input.state)) return failure('INVALID_DOCUMENT_SHAPE')
  return withEmployeeCompatibility(input.version === 2
    ? normalizeV2State(input.state, input)
    : migrateV1State(input.state, input), input.state)
}

function parseRaw(raw: string): ParseOrgDocumentResult {
  try {
    return parseOrgDocument(JSON.parse(raw))
  } catch {
    return failure('INVALID_JSON')
  }
}

function loadFailure(sourceKey: string, raw: string, result: Extract<ParseOrgDocumentResult, { ok: false }>): LocalDocumentLoadResult {
  return { status: 'failed', sourceKey, raw, code: result.code, positionIds: result.positionIds, departmentIds: result.departmentIds, dutyIds: result.dutyIds, processIds: result.processIds, processNodeIds: result.processNodeIds }
}

function preferNewerDocument(first: OrgDocumentFile, second: OrgDocumentFile): OrgDocumentFile {
  const firstTime = Date.parse(first.savedAt)
  const secondTime = Date.parse(second.savedAt)
  if (Number.isFinite(firstTime) && Number.isFinite(secondTime)) {
    return secondTime > firstTime ? second : first
  }
  return first
}

export function loadLocalDocument(storage: Storage | null = getDefaultStorage()): LocalDocumentLoadResult {
  if (!storage) return { status: 'empty' }
  let draftRaw: string | null
  let currentRaw: string | null
  let v7DraftRaw: string | null
  let v7Raw: string | null
  let v6DraftRaw: string | null
  let v6Raw: string | null
  let v5DraftRaw: string | null
  let v5Raw: string | null
  let v4DraftRaw: string | null
  let v4Raw: string | null
  let v3DraftRaw: string | null
  let v3Raw: string | null
  let legacyDraftRaw: string | null
  let v2Raw: string | null
  let v1Raw: string | null
  try {
    draftRaw = storage.getItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    currentRaw = storage.getItem(ORG_DOCUMENT_STORAGE_KEY)
    v7DraftRaw = storage.getItem(LEGACY_V7_ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    v7Raw = storage.getItem(LEGACY_V7_ORG_DOCUMENT_STORAGE_KEY)
    v6DraftRaw = storage.getItem(LEGACY_V6_ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    v6Raw = storage.getItem(LEGACY_V6_ORG_DOCUMENT_STORAGE_KEY)
    v5DraftRaw = storage.getItem(LEGACY_V5_ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    v5Raw = storage.getItem(LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY)
    v4DraftRaw = storage.getItem(LEGACY_V4_ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    v4Raw = storage.getItem(LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY)
    v3DraftRaw = storage.getItem(LEGACY_V3_ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    v3Raw = storage.getItem(LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY)
    legacyDraftRaw = storage.getItem(LEGACY_ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    v2Raw = storage.getItem(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY)
    v1Raw = storage.getItem(LEGACY_ORG_DOCUMENT_STORAGE_KEY)
  } catch {
    return { status: 'failed', sourceKey: ORG_DOCUMENT_STORAGE_KEY, raw: '', code: 'STORAGE_READ_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] }
  }

  const parsedDraft = draftRaw ? parseRaw(draftRaw) : null
  if (parsedDraft && !parsedDraft.ok) return loadFailure(ORG_DOCUMENT_DRAFT_STORAGE_KEY, draftRaw!, parsedDraft)
  const parsedCurrent = currentRaw ? parseRaw(currentRaw) : null
  if (parsedCurrent && !parsedCurrent.ok) return loadFailure(ORG_DOCUMENT_STORAGE_KEY, currentRaw!, parsedCurrent)
  if (parsedDraft?.ok || parsedCurrent?.ok) {
    if (parsedDraft?.ok && parsedCurrent?.ok) {
      const document = preferNewerDocument(parsedDraft.document, parsedCurrent.document)
      return {
        status: 'loaded',
        document,
        sourceVersion: document === parsedDraft.document ? parsedDraft.sourceVersion : parsedCurrent.sourceVersion,
      }
    }
    const parsed = parsedDraft?.ok ? parsedDraft : parsedCurrent!
    return { status: 'loaded', document: parsed.document, sourceVersion: parsed.sourceVersion }
  }

  const parsedV7Draft = v7DraftRaw ? parseRaw(v7DraftRaw) : null
  if (parsedV7Draft && !parsedV7Draft.ok) return loadFailure(LEGACY_V7_ORG_DOCUMENT_DRAFT_STORAGE_KEY, v7DraftRaw!, parsedV7Draft)
  const parsedV7 = v7Raw ? parseRaw(v7Raw) : null
  if (parsedV7 && !parsedV7.ok) return loadFailure(LEGACY_V7_ORG_DOCUMENT_STORAGE_KEY, v7Raw!, parsedV7)
  if (parsedV7Draft?.ok || parsedV7?.ok) {
    const parsed = parsedV7Draft?.ok && parsedV7?.ok
      ? (preferNewerDocument(parsedV7Draft.document, parsedV7.document) === parsedV7Draft.document ? parsedV7Draft : parsedV7)
      : parsedV7Draft?.ok ? parsedV7Draft : parsedV7!
    const destinationKey = parsed.document.kind === 'draft' ? ORG_DOCUMENT_DRAFT_STORAGE_KEY : ORG_DOCUMENT_STORAGE_KEY
    try { storage.setItem(destinationKey, JSON.stringify(parsed.document)) }
    catch { return { status: 'failed', sourceKey: parsed.document.kind === 'draft' ? LEGACY_V7_ORG_DOCUMENT_DRAFT_STORAGE_KEY : LEGACY_V7_ORG_DOCUMENT_STORAGE_KEY, raw: parsed.document.kind === 'draft' ? v7DraftRaw! : v7Raw!, code: 'STORAGE_WRITE_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] } }
    return { status: 'loaded', document: parsed.document, sourceVersion: parsed.sourceVersion }
  }

  const parsedV6Draft = v6DraftRaw ? parseRaw(v6DraftRaw) : null
  if (parsedV6Draft && !parsedV6Draft.ok) return loadFailure(LEGACY_V6_ORG_DOCUMENT_DRAFT_STORAGE_KEY, v6DraftRaw!, parsedV6Draft)
  const parsedV6 = v6Raw ? parseRaw(v6Raw) : null
  if (parsedV6 && !parsedV6.ok) return loadFailure(LEGACY_V6_ORG_DOCUMENT_STORAGE_KEY, v6Raw!, parsedV6)
  if (parsedV6Draft?.ok || parsedV6?.ok) {
    const parsed = parsedV6Draft?.ok && parsedV6?.ok
      ? (preferNewerDocument(parsedV6Draft.document, parsedV6.document) === parsedV6Draft.document ? parsedV6Draft : parsedV6)
      : parsedV6Draft?.ok ? parsedV6Draft : parsedV6!
    const destinationKey = parsed.document.kind === 'draft' ? ORG_DOCUMENT_DRAFT_STORAGE_KEY : ORG_DOCUMENT_STORAGE_KEY
    try {
      storage.setItem(destinationKey, JSON.stringify(parsed.document))
    } catch {
      return { status: 'failed', sourceKey: parsed.document.kind === 'draft' ? LEGACY_V6_ORG_DOCUMENT_DRAFT_STORAGE_KEY : LEGACY_V6_ORG_DOCUMENT_STORAGE_KEY, raw: parsed.document.kind === 'draft' ? v6DraftRaw! : v6Raw!, code: 'STORAGE_WRITE_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] }
    }
    return { status: 'loaded', document: parsed.document, sourceVersion: parsed.sourceVersion }
  }

  const parsedV5Draft = v5DraftRaw ? parseRaw(v5DraftRaw) : null
  if (parsedV5Draft && !parsedV5Draft.ok) return loadFailure(LEGACY_V5_ORG_DOCUMENT_DRAFT_STORAGE_KEY, v5DraftRaw!, parsedV5Draft)
  const parsedV5 = v5Raw ? parseRaw(v5Raw) : null
  if (parsedV5 && !parsedV5.ok) return loadFailure(LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY, v5Raw!, parsedV5)
  if (parsedV5Draft?.ok || parsedV5?.ok) {
    const parsed = parsedV5Draft?.ok && parsedV5?.ok
      ? (preferNewerDocument(parsedV5Draft.document, parsedV5.document) === parsedV5Draft.document ? parsedV5Draft : parsedV5)
      : parsedV5Draft?.ok ? parsedV5Draft : parsedV5!
    const destinationKey = parsed.document.kind === 'draft' ? ORG_DOCUMENT_DRAFT_STORAGE_KEY : ORG_DOCUMENT_STORAGE_KEY
    try {
      storage.setItem(destinationKey, JSON.stringify(parsed.document))
    } catch {
      return { status: 'failed', sourceKey: parsed.document.kind === 'draft' ? LEGACY_V5_ORG_DOCUMENT_DRAFT_STORAGE_KEY : LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY, raw: parsed.document.kind === 'draft' ? v5DraftRaw! : v5Raw!, code: 'STORAGE_WRITE_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] }
    }
    return { status: 'loaded', document: parsed.document, sourceVersion: parsed.sourceVersion }
  }

  const parsedV4Draft = v4DraftRaw ? parseRaw(v4DraftRaw) : null
  if (parsedV4Draft && !parsedV4Draft.ok) {
    return loadFailure(LEGACY_V4_ORG_DOCUMENT_DRAFT_STORAGE_KEY, v4DraftRaw!, parsedV4Draft)
  }
  const parsedV4 = v4Raw ? parseRaw(v4Raw) : null
  if (parsedV4 && !parsedV4.ok) return loadFailure(LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY, v4Raw!, parsedV4)
  if (parsedV4Draft?.ok || parsedV4?.ok) {
    const parsed = parsedV4Draft?.ok && parsedV4?.ok
      ? (preferNewerDocument(parsedV4Draft.document, parsedV4.document) === parsedV4Draft.document ? parsedV4Draft : parsedV4)
      : parsedV4Draft?.ok ? parsedV4Draft : parsedV4!
    const destinationKey = parsed.document.kind === 'draft' ? ORG_DOCUMENT_DRAFT_STORAGE_KEY : ORG_DOCUMENT_STORAGE_KEY
    try {
      storage.setItem(destinationKey, JSON.stringify(parsed.document))
    } catch {
      return { status: 'failed', sourceKey: parsed.document.kind === 'draft' ? LEGACY_V4_ORG_DOCUMENT_DRAFT_STORAGE_KEY : LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY, raw: parsed.document.kind === 'draft' ? v4DraftRaw! : v4Raw!, code: 'STORAGE_WRITE_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] }
    }
    return { status: 'loaded', document: parsed.document, sourceVersion: parsed.sourceVersion }
  }

  const parsedV3Draft = v3DraftRaw ? parseRaw(v3DraftRaw) : null
  if (parsedV3Draft && !parsedV3Draft.ok) {
    return loadFailure(LEGACY_V3_ORG_DOCUMENT_DRAFT_STORAGE_KEY, v3DraftRaw!, parsedV3Draft)
  }
  const parsedV3 = v3Raw ? parseRaw(v3Raw) : null
  if (parsedV3 && !parsedV3.ok) return loadFailure(LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY, v3Raw!, parsedV3)

  const parsedLegacyDraft = legacyDraftRaw ? parseRaw(legacyDraftRaw) : null
  if (parsedLegacyDraft && !parsedLegacyDraft.ok) {
    return loadFailure(LEGACY_ORG_DOCUMENT_DRAFT_STORAGE_KEY, legacyDraftRaw!, parsedLegacyDraft)
  }
  const parsedV2 = v2Raw ? parseRaw(v2Raw) : null
  if (parsedV2 && !parsedV2.ok) return loadFailure(LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY, v2Raw!, parsedV2)
  type ParsedDocument = Extract<ParseOrgDocumentResult, { ok: true }>
  const candidates: Array<{ parsed: ParsedDocument; sourceKey: string; raw: string }> = []
  if (parsedV3Draft?.ok) candidates.push({ parsed: parsedV3Draft, sourceKey: LEGACY_V3_ORG_DOCUMENT_DRAFT_STORAGE_KEY, raw: v3DraftRaw! })
  if (parsedV3?.ok) candidates.push({ parsed: parsedV3, sourceKey: LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY, raw: v3Raw! })
  if (parsedLegacyDraft?.ok) candidates.push({ parsed: parsedLegacyDraft, sourceKey: LEGACY_ORG_DOCUMENT_DRAFT_STORAGE_KEY, raw: legacyDraftRaw! })
  if (parsedV2?.ok) candidates.push({ parsed: parsedV2, sourceKey: LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY, raw: v2Raw! })
  const preferredVersion = candidates.reduce<number>((version, candidate) => Math.max(version, candidate.parsed.sourceVersion), 0)
  const legacyCandidate = candidates
    .filter((candidate) => candidate.parsed.sourceVersion === preferredVersion)
    .reduce<{ parsed: ParsedDocument; sourceKey: string; raw: string } | null>((selected, candidate) => {
      if (!selected) return candidate
      return preferNewerDocument(selected.parsed.document, candidate.parsed.document) === candidate.parsed.document ? candidate : selected
    }, null)
  if (legacyCandidate) {
    const destinationKey = legacyCandidate.parsed.document.kind === 'draft'
      ? ORG_DOCUMENT_DRAFT_STORAGE_KEY
      : ORG_DOCUMENT_STORAGE_KEY
    try {
      storage.setItem(destinationKey, JSON.stringify(legacyCandidate.parsed.document))
    } catch {
      return { status: 'failed', sourceKey: legacyCandidate.sourceKey, raw: legacyCandidate.raw, code: 'STORAGE_WRITE_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] }
    }
    return { status: 'loaded', document: legacyCandidate.parsed.document, sourceVersion: legacyCandidate.parsed.sourceVersion }
  }

  if (!v1Raw) return { status: 'empty' }
  const parsedV1 = parseRaw(v1Raw)
  if (!parsedV1.ok) return loadFailure(LEGACY_ORG_DOCUMENT_STORAGE_KEY, v1Raw, parsedV1)
  try {
    storage.setItem(ORG_DOCUMENT_STORAGE_KEY, JSON.stringify(parsedV1.document))
  } catch {
    return { status: 'failed', sourceKey: LEGACY_ORG_DOCUMENT_STORAGE_KEY, raw: v1Raw, code: 'STORAGE_WRITE_FAILED', positionIds: [], departmentIds: [], dutyIds: [], processIds: [], processNodeIds: [] }
  }
  return { status: 'loaded', document: parsedV1.document, sourceVersion: parsedV1.sourceVersion }
}

/** Compatibility helper for callers that only need a normalized document. */
export function loadLocalDocumentOrNull(storage: Storage | null = getDefaultStorage()): OrgDocumentFile | null {
  const result = loadLocalDocument(storage)
  return result.status === 'loaded' ? result.document : null
}

export function archiveFailedLocalDocument(
  result: Extract<LocalDocumentLoadResult, { status: 'failed' }>,
  storage: Storage | null = getDefaultStorage(),
): boolean {
  if (!storage) return false
  if (
    result.sourceKey === LEGACY_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_V7_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_V7_ORG_DOCUMENT_DRAFT_STORAGE_KEY
    || result.sourceKey === LEGACY_V6_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_V6_ORG_DOCUMENT_DRAFT_STORAGE_KEY
    || result.sourceKey === LEGACY_V5_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_V5_ORG_DOCUMENT_DRAFT_STORAGE_KEY
    || result.sourceKey === LEGACY_V4_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_V4_ORG_DOCUMENT_DRAFT_STORAGE_KEY
    || result.sourceKey === LEGACY_V3_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_V3_ORG_DOCUMENT_DRAFT_STORAGE_KEY
    || result.sourceKey === LEGACY_V2_ORG_DOCUMENT_STORAGE_KEY
    || result.sourceKey === LEGACY_ORG_DOCUMENT_DRAFT_STORAGE_KEY
  ) return true
  try {
    const recoveryKey = result.sourceKey === ORG_DOCUMENT_DRAFT_STORAGE_KEY
      ? RECOVERY_ORG_DOCUMENT_DRAFT_STORAGE_KEY
      : RECOVERY_ORG_DOCUMENT_STORAGE_KEY
    storage.setItem(recoveryKey, result.raw)
    return true
  } catch {
    return false
  }
}

export function saveLocalDocument(
  state: OrgDirectoryState,
  storage: Storage | null = getDefaultStorage(),
  savedAt = new Date().toISOString(),
): OrgDocumentFile | null {
  return saveDocumentToStorage(state, ORG_DOCUMENT_STORAGE_KEY, 'document', storage, savedAt)
}

export function saveDraftLocalDocument(
  state: OrgDirectoryState,
  storage: Storage | null = getDefaultStorage(),
  savedAt = new Date().toISOString(),
): OrgDocumentFile | null {
  return saveDocumentToStorage(state, ORG_DOCUMENT_DRAFT_STORAGE_KEY, 'draft', storage, savedAt)
}

export function clearDraftLocalDocument(storage: Storage | null = getDefaultStorage()): boolean {
  if (!storage) return false
  try {
    storage.removeItem(ORG_DOCUMENT_DRAFT_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

function saveDocumentToStorage(
  state: OrgDirectoryState,
  key: string,
  kind: OrgDocumentKind,
  storage: Storage | null,
  savedAt: string,
): OrgDocumentFile | null {
  if (!storage || containsLegacyParentField(state)) return null
  const normalized = normalizeSiblingOrders(state)
  if (!validateOrganizationState(normalized, { allowDisconnectedDepartments: true }).ok) return null
  if (!validateRoleCombinationRiskRules(normalized.roleCombinationRiskRules, normalized.roles).ok) return null
  if (!validateEmployeeResponsibilities(normalized).ok) return null
  if (!validateDutyState(normalized).ok) return null
  if (!validateProcessPlanningState(normalized).ok) return null
  const document = createOrgDocumentFile(normalized, kind, savedAt)
  try {
    storage.setItem(key, JSON.stringify(document))
    return document
  } catch {
    return null
  }
}

export function createDownloadFilename(kind: Exclude<OrgDocumentKind, 'document' | 'draft'>, date = new Date()): string {
  const timestamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `orgmaster-${kind}-${timestamp}.json`
}

export function downloadOrgDocument(document: OrgDocumentFile, filename: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
  return true
}

export function downloadRawDocument(raw: string | null, filename = 'orgmaster-recovery.json'): boolean {
  if (!raw || typeof URL === 'undefined' || typeof Blob === 'undefined' || typeof window === 'undefined') return false
  const blob = new Blob([raw], { type: 'application/json;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
  return true
}
