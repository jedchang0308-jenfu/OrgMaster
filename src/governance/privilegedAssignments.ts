import { randomUUID } from 'node:crypto'
import { canonicalJson, sha256 } from './commands'
import { classifyAssignmentSurface } from './assignmentSurface'
import { isActiveAt } from './validation'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceDocumentV3, GovernanceOrgSource, GovernanceRoleAssignmentV3 } from './types'

export const SYSTEM_ADMIN_APPLICATION_ID = 'ai-pdm' as const
export const SYSTEM_ADMIN_ROLE_ID = 'role-system-admin' as const
export const PRIVILEGED_REAUTH_WINDOW_MS = 5 * 60 * 1000

export type PrivilegedAssignmentOperation =
  | { operation: 'grant_system_admin'; employeeId: string; principalAdmissionId: string }
  | { operation: 'revoke_system_admin'; assignmentId: string }

export type PrivilegedAssignmentExpected = {
  catalogVersion: string
  catalogPayloadHash: string
  governanceRevision: string
  organizationRevision: string
}

export type PrivilegedAssignmentRequest = PrivilegedAssignmentOperation & {
  applicationId: 'ai-pdm'
  stableRoleId: 'role-system-admin'
  expected: PrivilegedAssignmentExpected
  reason: string
}

export type PrivilegedAssignmentPreview = {
  previewHash: string
  requestHash: string
  beforeHolderCount: number
  afterHolderCount: number
  targetHint: string
  affectedSessionCount: number
  securityAlertRequired: true
  noOp: boolean
}

export type PrivilegedSessionEvidence = {
  sessionId: string
  principalId: string
  assuranceLevel: 'aal1' | 'aal2'
  authenticatedAt: string | null
}

export class PrivilegedAssignmentError extends Error {
  constructor(public readonly code: string, public readonly details?: unknown) {
    super(code)
    this.name = 'PrivilegedAssignmentError'
  }
}

function redactedHint(admissionId: string) {
  const suffix = admissionId.replace(/[^A-Za-z0-9]/g, '').slice(-4) || '••••'
  return `privileged•••${suffix}`
}

function latestSourceDataAt(...values: Array<string | undefined>) {
  const valid = values.filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
  if (valid.length === 0) throw new PrivilegedAssignmentError('ORGMASTER_SOURCE_UNAVAILABLE')
  return valid.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest)
}

export function privilegedRequestHash(actorPrincipalId: string, request: PrivilegedAssignmentRequest, previewHash = '') {
  return sha256(canonicalJson({
    actorPrincipalId,
    applicationId: request.applicationId,
    stableRoleId: request.stableRoleId,
    operation: request.operation,
    payload: request.operation === 'grant_system_admin'
      ? { employeeId: request.employeeId, principalAdmissionId: request.principalAdmissionId }
      : { assignmentId: request.assignmentId },
    expected: request.expected,
    reason: request.reason.trim(),
    previewHash,
  }))
}

export function assertPrivilegedRequestContract(request: PrivilegedAssignmentRequest) {
  if (request.applicationId !== SYSTEM_ADMIN_APPLICATION_ID || request.stableRoleId !== SYSTEM_ADMIN_ROLE_ID) throw new PrivilegedAssignmentError('CATALOG_ROLE_CONTRACT_MISMATCH')
  if (!request.reason.trim() || request.reason.trim().length > 240) throw new PrivilegedAssignmentError('INVALID_COMMAND')
  if (!request.expected.catalogVersion || !/^[a-f0-9]{64}$/u.test(request.expected.catalogPayloadHash) || !request.expected.governanceRevision || !request.expected.organizationRevision) throw new PrivilegedAssignmentError('INVALID_COMMAND')
  if (request.operation === 'grant_system_admin' && (!request.employeeId.trim() || !request.principalAdmissionId.trim())) throw new PrivilegedAssignmentError('INVALID_COMMAND')
  if (request.operation === 'revoke_system_admin' && !request.assignmentId.trim()) throw new PrivilegedAssignmentError('INVALID_COMMAND')
}

export function assertFreshPrivilegedSession(actor: GovernanceActorContext, session: PrivilegedSessionEvidence, now = new Date()) {
  const authenticatedAt = session.authenticatedAt ? Date.parse(session.authenticatedAt) : Number.NaN
  const commitAt = now.getTime()
  if (session.assuranceLevel !== 'aal2' || session.principalId !== actor.principalId || !session.sessionId.trim()
    || !Number.isFinite(authenticatedAt) || authenticatedAt > commitAt || commitAt - authenticatedAt > PRIVILEGED_REAUTH_WINDOW_MS) {
    throw new PrivilegedAssignmentError('STEP_UP_REQUIRED')
  }
}

export function hasCrossAppOverride(document: GovernanceDocumentV3, actor: GovernanceActorContext, at = new Date().toISOString()) {
  const activeLink = document.draft.identityLinks.find((link) => link.principalId === actor.principalId && link.employeeId === actor.employeeId
    && link.issuer === actor.issuer && link.subject === actor.subject && isActiveAt(link.status, link.validFrom, link.validTo, at))
  if (!activeLink) return false
  const privilegedAdmission = (document.draft.principalAdmissions ?? []).find((admission) => admission.identityLinkId === activeLink.id && admission.accountType === 'human_privileged' && admission.status === 'active')
  if (!privilegedAdmission) return false
  return document.draft.managementGrants.some((grant) => grant.principalId === actor.principalId && grant.employeeId === actor.employeeId
    && grant.applicationId === 'ai-pdm' && grant.capability === 'orgmaster.cross_app_override'
    && isActiveAt(grant.status, grant.validFrom, grant.validTo, at))
}

export function resolvePrivilegedAdmission(document: GovernanceDocumentV3, employeeId: string, admissionId: string, at = new Date().toISOString()) {
  const admission = (document.draft.principalAdmissions ?? []).find((value) => value.id === admissionId)
  const link = admission?.identityLinkId ? document.draft.identityLinks.find((value) => value.id === admission.identityLinkId) : undefined
  if (!admission || admission.accountType !== 'human_privileged' || admission.status !== 'active' || !link || link.employeeId !== employeeId
    || !isActiveAt(link.status, link.validFrom, link.validTo, at)) throw new PrivilegedAssignmentError('PRINCIPAL_ADMISSION_INELIGIBLE')
  return { admission, link, principalHint: redactedHint(admission.id) }
}

function admissionForAssignment(document: GovernanceDocumentV3, assignment: GovernanceRoleAssignmentV3) {
  return (document.draft.principalAdmissions ?? []).find((admission) => {
    const link = admission.identityLinkId ? document.draft.identityLinks.find((value) => value.id === admission.identityLinkId) : undefined
    return link?.principalId === assignment.targetPrincipalId && link.employeeId === assignment.employeeId
  })
}

export function assertPrivilegedPreconditions(document: GovernanceDocumentV3, source: GovernanceOrgSource, catalog: ExternalRoleCatalogSnapshotV1, revision: string, request: PrivilegedAssignmentRequest) {
  assertPrivilegedRequestContract(request)
  const role = catalog.roles.find((value) => value.stableRoleId === SYSTEM_ADMIN_ROLE_ID)
  if (!role || classifyAssignmentSurface('ai-pdm', role) !== 'privileged_system_admin') throw new PrivilegedAssignmentError('CATALOG_ROLE_CONTRACT_MISMATCH')
  if (request.expected.catalogVersion !== catalog.catalogVersion) throw new PrivilegedAssignmentError('CATALOG_VERSION_CONFLICT')
  if (request.expected.catalogPayloadHash !== catalog.payloadHash) throw new PrivilegedAssignmentError('CATALOG_PAYLOAD_HASH_MISMATCH')
  if (request.expected.governanceRevision !== revision) throw new PrivilegedAssignmentError('REVISION_CONFLICT')
  if (request.expected.organizationRevision !== source.workspaceRevision) throw new PrivilegedAssignmentError('ORGANIZATION_VERSION_INVALID')
  if (document.migration.unresolvedAssignments.length || document.migration.unresolvedDelegations.length) throw new PrivilegedAssignmentError('LEGACY_MIGRATION_UNRESOLVED')
  return role
}

export function buildPrivilegedPreview(document: GovernanceDocumentV3, actor: GovernanceActorContext, request: PrivilegedAssignmentRequest, now = new Date().toISOString()): PrivilegedAssignmentPreview {
  const active = document.draft.roleAssignments.filter((assignment) => assignment.applicationId === 'ai-pdm' && assignment.roleId === SYSTEM_ADMIN_ROLE_ID && assignment.subjectKind === 'principal' && assignment.status === 'active' && isActiveAt(assignment.status, assignment.validFrom, assignment.validTo, now))
  let targetHint: string
  let afterHolderCount: number
  let affectedSessionCount: number
  let noOp = false
  if (request.operation === 'grant_system_admin') {
    const target = resolvePrivilegedAdmission(document, request.employeeId, request.principalAdmissionId, now)
    if (target.link.principalId === actor.principalId) throw new PrivilegedAssignmentError('PRIVILEGED_SELF_ASSIGNMENT_DENIED')
    noOp = active.some((assignment) => assignment.targetPrincipalId === target.link.principalId && assignment.scope.kind === 'global')
    targetHint = target.principalHint
    afterHolderCount = active.length + (noOp ? 0 : 1)
    affectedSessionCount = noOp ? 0 : 1
  } else {
    const assignment = document.draft.roleAssignments.find((value) => value.id === request.assignmentId && value.applicationId === 'ai-pdm' && value.roleId === SYSTEM_ADMIN_ROLE_ID && value.subjectKind === 'principal')
    if (!assignment) throw new PrivilegedAssignmentError('PRIVILEGED_ASSIGNMENT_NOT_FOUND')
    const admission = admissionForAssignment(document, assignment)
    targetHint = redactedHint(admission?.id ?? assignment.id)
    noOp = assignment.status === 'revoked'
    afterHolderCount = Math.max(0, active.length - (noOp ? 0 : 1))
    affectedSessionCount = noOp ? 0 : 1
  }
  const previewBase = { applicationId: request.applicationId, stableRoleId: request.stableRoleId, operation: request.operation, payload: request.operation === 'grant_system_admin' ? { employeeId: request.employeeId, principalAdmissionId: request.principalAdmissionId } : { assignmentId: request.assignmentId }, expected: request.expected, reason: request.reason.trim(), beforeHolderCount: active.length, afterHolderCount, targetHint, affectedSessionCount, securityAlertRequired: true as const, noOp }
  const previewHash = sha256(canonicalJson(previewBase))
  const requestHash = privilegedRequestHash(actor.principalId, request, previewHash)
  return { requestHash, beforeHolderCount: active.length, afterHolderCount, targetHint, affectedSessionCount, securityAlertRequired: true as const, noOp, previewHash }
}

export function privilegedAssignmentWorkspace(document: GovernanceDocumentV3, source: GovernanceOrgSource, catalog: ExternalRoleCatalogSnapshotV1, revision: string, actor: GovernanceActorContext, now = new Date().toISOString(), mutationAllowed = hasCrossAppOverride(document, actor, now)) {
  const role = catalog.roles.find((value) => value.stableRoleId === SYSTEM_ADMIN_ROLE_ID)
  const blockers: string[] = []
  if (!role || classifyAssignmentSurface('ai-pdm', role) !== 'privileged_system_admin') blockers.push('CATALOG_ROLE_CONTRACT_MISMATCH')
  if (document.migration.unresolvedAssignments.length || document.migration.unresolvedDelegations.length) blockers.push('LEGACY_MIGRATION_UNRESOLVED')
  if (!mutationAllowed) blockers.push('PRIVILEGED_MUTATION_REQUIRED')
  const activeEmployeeIds = new Set(source.state.employees.filter((employee) => (employee as { status?: string }).status !== 'inactive').map((employee) => employee.id))
  const eligiblePrincipals = (document.draft.principalAdmissions ?? []).flatMap((admission) => {
    const link = admission.identityLinkId ? document.draft.identityLinks.find((value) => value.id === admission.identityLinkId) : undefined
    if (admission.accountType !== 'human_privileged' || admission.status !== 'active' || !link || !activeEmployeeIds.has(link.employeeId) || !isActiveAt(link.status, link.validFrom, link.validTo, now)) return []
    return [{ employeeId: link.employeeId, principalAdmissionId: admission.id, principalHint: redactedHint(admission.id), accountType: 'human_privileged' as const, status: 'active' as const }]
  })
  const assignments = document.draft.roleAssignments.filter((assignment) => assignment.applicationId === 'ai-pdm' && assignment.roleId === SYSTEM_ADMIN_ROLE_ID && assignment.subjectKind === 'principal').map((assignment) => {
    const admission = admissionForAssignment(document, assignment)
    const audit = [...document.auditEvents].reverse().find((event) => (event.entityType === 'roleAssignment' || event.entityType === 'governanceRoleAssignmentV3') && event.entityId === assignment.id)
    return {
      assignmentId: assignment.id, employeeId: assignment.employeeId, principalAdmissionId: admission?.id ?? 'unresolved-admission',
      principalHint: redactedHint(admission?.id ?? assignment.id), status: assignment.status, validFrom: assignment.validFrom,
      validTo: assignment.validTo, auditReference: audit?.id ?? 'migration-unresolved-audit',
    }
  })
  if (mutationAllowed && eligiblePrincipals.length === 0 && assignments.length === 0) blockers.push('NO_ELIGIBLE_PRINCIPAL')
  return {
    contractVersion: 'orgmaster.privileged-assignment-workspace.v1' as const,
    applicationId: SYSTEM_ADMIN_APPLICATION_ID,
    stableRoleId: SYSTEM_ADMIN_ROLE_ID,
    catalogVersion: catalog.catalogVersion,
    catalogPayloadHash: catalog.payloadHash,
    governanceRevision: revision,
    organizationVersionId: source.workspaceVersionId,
    organizationRevision: source.workspaceRevision,
    sourceDataAt: latestSourceDataAt(document.draft.updatedAt, source.sourceDataAt),
    mutationAllowed: blockers.length === 0,
    blockers,
    role: role ? {
      stableRoleId: role.stableRoleId, roleCode: role.code, displayName: role.displayName, status: role.status,
      assignable: role.assignable, riskLevel: role.riskLevel, subjectKind: role.subjectKind,
      assignmentTier: role.assignmentTier, recommendationAllowed: role.recommendationAllowed,
      delegationAllowed: role.delegationAllowed, allowedScopeKinds: role.allowedScopeKinds,
    } : null,
    eligiblePrincipals,
    assignments,
  }
}

export function applyPrivilegedAssignment(document: GovernanceDocumentV3, catalog: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext, request: PrivilegedAssignmentRequest, committedAt: string) {
  const active = document.draft.roleAssignments.filter((assignment) => assignment.applicationId === 'ai-pdm' && assignment.roleId === SYSTEM_ADMIN_ROLE_ID && assignment.subjectKind === 'principal' && assignment.status === 'active' && assignment.targetPrincipalId)
  if (request.operation === 'grant_system_admin') {
    const target = resolvePrivilegedAdmission(document, request.employeeId, request.principalAdmissionId, committedAt)
    if (target.link.principalId === actor.principalId) throw new PrivilegedAssignmentError('PRIVILEGED_SELF_ASSIGNMENT_DENIED')
    const existing = active.find((assignment) => assignment.targetPrincipalId === target.link.principalId && assignment.scope.kind === 'global')
    if (existing) return { document, status: 'noop' as const, assignmentId: existing.id, employeeId: existing.employeeId, principalAdmissionId: request.principalAdmissionId, targetPrincipalId: target.link.principalId, targetHint: target.principalHint }
    const role = catalog.roles.find((value) => value.stableRoleId === SYSTEM_ADMIN_ROLE_ID)
    if (!role || classifyAssignmentSurface('ai-pdm', role) !== 'privileged_system_admin') throw new PrivilegedAssignmentError('CATALOG_ROLE_CONTRACT_MISMATCH')
    const assignment: GovernanceRoleAssignmentV3 = {
      id: `assignment-system-admin-${randomUUID()}`,
      employeeId: request.employeeId,
      applicationId: 'ai-pdm',
      roleId: SYSTEM_ADMIN_ROLE_ID,
      roleCodeSnapshot: 'system_admin',
      roleNameSnapshot: role.displayName,
      catalogVersion: catalog.catalogVersion,
      scope: { kind: 'global' },
      status: 'active',
      validFrom: committedAt,
      validTo: null,
      effectState: 'not-synchronized',
      basis: 'manual',
      subjectKind: 'principal',
      targetPrincipalId: target.link.principalId,
      sources: [],
      metadata: { sponsorEmployeeId: actor.employeeId, reviewDueAt: null },
      createdByPrincipalId: actor.principalId,
      createdReason: request.reason.trim(),
    }
    return {
      document: { ...document, draft: { ...document.draft, roleAssignments: [...document.draft.roleAssignments, assignment], updatedAt: committedAt } },
      status: 'applied' as const,
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      principalAdmissionId: request.principalAdmissionId,
      targetPrincipalId: target.link.principalId,
      targetHint: target.principalHint,
    }
  }
  const index = document.draft.roleAssignments.findIndex((assignment) => assignment.id === request.assignmentId && assignment.applicationId === 'ai-pdm' && assignment.roleId === SYSTEM_ADMIN_ROLE_ID && assignment.subjectKind === 'principal')
  if (index < 0) throw new PrivilegedAssignmentError('PRIVILEGED_ASSIGNMENT_NOT_FOUND')
  const target = document.draft.roleAssignments[index]
  if (target.status === 'revoked') return { document, status: 'noop' as const, assignmentId: target.id, employeeId: target.employeeId, principalAdmissionId: admissionForAssignment(document, target)?.id ?? 'unresolved-admission', targetPrincipalId: target.targetPrincipalId ?? '', targetHint: redactedHint(admissionForAssignment(document, target)?.id ?? target.id) }
  if (!target.targetPrincipalId) throw new PrivilegedAssignmentError('SYSTEM_ADMIN_PRINCIPAL_REQUIRED')
  const admission = admissionForAssignment(document, target)
  const nextAssignment = { ...target, status: 'revoked' as const, validTo: committedAt }
  const roleAssignments = [...document.draft.roleAssignments]
  roleAssignments[index] = nextAssignment
  return {
    document: { ...document, draft: { ...document.draft, roleAssignments, updatedAt: committedAt } },
    status: 'applied' as const,
    assignmentId: target.id,
    employeeId: target.employeeId,
    principalAdmissionId: admission?.id ?? 'unresolved-admission',
    targetPrincipalId: target.targetPrincipalId,
    targetHint: redactedHint(admission?.id ?? target.id),
  }
}
