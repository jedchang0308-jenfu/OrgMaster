import { randomUUID } from 'node:crypto'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { buildOrganizationSnapshot } from '../src/governance/validation'
import { canonicalJson, sha256 } from '../src/governance/commands'
import {
  assertFreshPrivilegedSession,
  assertPrivilegedPreconditions,
  applyPrivilegedAssignment,
  buildPrivilegedPreview,
  hasCrossAppOverride,
  privilegedAssignmentWorkspace,
  privilegedRequestHash,
  resolvePrivilegedAdmission,
  SYSTEM_ADMIN_ROLE_ID,
  PrivilegedAssignmentError,
  type PrivilegedAssignmentRequest,
  type PrivilegedSessionEvidence,
} from '../src/governance/privilegedAssignments'
import type { GovernanceActorContext, GovernanceCommandReceiptV2, GovernanceDocumentV3 } from '../src/governance/types'
import {
  actorHasPolicyPermission,
  appendGovernanceAudit,
  commitGovernanceMutation,
  loadOrganizationSource,
  readGovernanceStore,
} from './orgmasterGovernanceStore'

export type PrivilegedAssignmentPublishRequest = PrivilegedAssignmentRequest & {
  commandId: string
  requestHash: string
  previewHash: string
}

function employeeExists(source: Awaited<ReturnType<typeof loadOrganizationSource>>, employeeId: string) {
  return source.state.employees.some((employee) => employee.id === employeeId && (employee as { status?: string }).status !== 'inactive')
}

function assertOverride(document: GovernanceDocumentV3, actor: GovernanceActorContext, now = new Date().toISOString()) {
  if (!hasCrossAppOverride(document, actor, now)) throw new PrivilegedAssignmentError('PRIVILEGED_MUTATION_REQUIRED')
}

function requestTarget(document: GovernanceDocumentV3, request: PrivilegedAssignmentRequest, now: string) {
  if (request.operation === 'grant_system_admin') {
    const target = resolvePrivilegedAdmission(document, request.employeeId, request.principalAdmissionId, now)
    return { employeeId: request.employeeId, admissionId: request.principalAdmissionId, principalId: target.link.principalId, targetHint: target.principalHint, assignment: null }
  }
  const assignment = document.draft.roleAssignments.find((value) => value.id === request.assignmentId && value.applicationId === 'ai-pdm' && value.roleId === SYSTEM_ADMIN_ROLE_ID && value.subjectKind === 'principal')
  if (!assignment?.targetPrincipalId) throw new PrivilegedAssignmentError('PRIVILEGED_ASSIGNMENT_NOT_FOUND')
  const admission = (document.draft.principalAdmissions ?? []).find((value) => {
    const link = value.identityLinkId ? document.draft.identityLinks.find((candidate) => candidate.id === value.identityLinkId) : undefined
    return link?.principalId === assignment.targetPrincipalId && link.employeeId === assignment.employeeId
  })
  if (!admission) throw new PrivilegedAssignmentError('PRIVILEGED_PRINCIPAL_REQUIRED')
  return { employeeId: assignment.employeeId, admissionId: admission.id, principalId: assignment.targetPrincipalId, targetHint: `privileged•••${admission.id.replace(/[^A-Za-z0-9]/g, '').slice(-4) || '••••'}`, assignment }
}

export async function readPrivilegedAssignmentWorkspace(root: string, actor: GovernanceActorContext) {
  const current = await readGovernanceStore(root)
  const source = await loadOrganizationSource(root)
  const canView = actor.bootstrap || actorHasPolicyPermission(current.document.draft, actor, 'orgmaster.governance.manage') || hasCrossAppOverride(current.document, actor)
  if (!canView) throw new PrivilegedAssignmentError('PRIVILEGED_VIEW_REQUIRED')
  return privilegedAssignmentWorkspace(current.document, source, readAiPdmRoleCatalog(), current.revision, actor)
}

export async function previewPrivilegedAssignment(root: string, actor: GovernanceActorContext, request: PrivilegedAssignmentRequest) {
  const current = await readGovernanceStore(root)
  const source = await loadOrganizationSource(root)
  const catalog = readAiPdmRoleCatalog()
  const now = new Date().toISOString()
  assertOverride(current.document, actor, now)
  assertPrivilegedPreconditions(current.document, source, catalog, current.revision, request)
  const target = requestTarget(current.document, request, now)
  if (!employeeExists(source, target.employeeId)) throw new PrivilegedAssignmentError('EMPLOYEE_NOT_FOUND')
  return buildPrivilegedPreview(current.document, actor, request, now)
}

function terminalReplay(document: GovernanceDocumentV3, actor: GovernanceActorContext, request: PrivilegedAssignmentPublishRequest) {
  const receipt = document.commandReceipts.find((value) => value.commandId === request.commandId)
  if (!receipt) return null
  const calculated = privilegedRequestHash(actor.principalId, request, request.previewHash)
  if (receipt.requestHash !== calculated || request.requestHash !== calculated || receipt.previewHash !== request.previewHash) throw new PrivilegedAssignmentError('COMMAND_ID_REUSED')
  return { ...receipt, replayed: true }
}

function policyFromDraft(document: GovernanceDocumentV3) {
  const { basePolicyVersionId: _basePolicyVersionId, updatedAt: _updatedAt, ...policy } = document.draft
  return policy
}

export async function publishPrivilegedAssignment(
  root: string,
  actor: GovernanceActorContext,
  session: PrivilegedSessionEvidence,
  request: PrivilegedAssignmentPublishRequest,
) {
  if (!request.commandId.trim()) throw new PrivilegedAssignmentError('INVALID_COMMAND')
  const observed = await readGovernanceStore(root)
  const replay = terminalReplay(observed.document, actor, request)
  if (replay) return replay
  assertFreshPrivilegedSession(actor, session)

  const committed = await commitGovernanceMutation(root, request.expected.governanceRevision, (current, source) => {
    const now = new Date()
    const committedAt = now.toISOString()
    const catalog = readAiPdmRoleCatalog()
    assertFreshPrivilegedSession(actor, session, now)
    assertOverride(current.document, actor, committedAt)
    assertPrivilegedPreconditions(current.document, source, catalog, current.revision, request)
    const target = requestTarget(current.document, request, committedAt)
    if (!employeeExists(source, target.employeeId)) throw new PrivilegedAssignmentError('EMPLOYEE_NOT_FOUND')
    const preview = buildPrivilegedPreview(current.document, actor, request, committedAt)
    if (request.requestHash !== preview.requestHash) throw new PrivilegedAssignmentError('REQUEST_HASH_MISMATCH')
    if (request.previewHash !== preview.previewHash) throw new PrivilegedAssignmentError('PREVIEW_HASH_MISMATCH')

    if (preview.noOp) {
      const receipt: GovernanceCommandReceiptV2 = {
        contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: request.commandId,
        requestHash: preview.requestHash, previewHash: preview.previewHash, receiptStatus: 'applied',
        acceptedAt: committedAt, terminalAt: committedAt, decisionCode: 'COMMAND_NOOP', auditReference: null,
        securityAlertReference: null, sessionRefresh: 'completed', governanceRevision: current.revision,
        replayed: false, attempt: 1,
      }
      return { document: { ...current.document, commandReceipts: [...current.document.commandReceipts, receipt] }, reasonCode: 'privileged_assignment_noop', updatedBy: actor.principalId }
    }

    const beforeAssignment = request.operation === 'revoke_system_admin' ? target.assignment : null
    const applied = applyPrivilegedAssignment(current.document, catalog, actor, request, committedAt)
    if (applied.status === 'noop') throw new PrivilegedAssignmentError('COMMAND_NOT_OBSERVED')
    const assignment = applied.document.draft.roleAssignments.find((value) => value.id === applied.assignmentId)
    if (!assignment) throw new PrivilegedAssignmentError('COMMAND_NOT_OBSERVED')
    const beforeHash = beforeAssignment ? sha256(canonicalJson(beforeAssignment)) : null
    const afterHash = sha256(canonicalJson(assignment))
    const draftDocument: GovernanceDocumentV3 = applied.document
    const nextDraft = draftDocument.draft
    const policy = policyFromDraft(draftDocument)
    const organizationSnapshot = buildOrganizationSnapshot(source, committedAt)
    const snapshotPayload = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: [catalog], organizationSnapshot, effectState: 'not-synchronized' as const }
    const version = {
      kind: 'assignment-governance-v3' as const,
      id: `assignment-policy-${randomUUID()}`,
      versionNumber: current.document.publishedVersions.length + 1,
      publishedAt: committedAt,
      publishedByPrincipalId: actor.principalId,
      publishReason: request.reason.trim(),
      snapshotHash: sha256(canonicalJson(snapshotPayload)),
      effectState: 'not-synchronized' as const,
      policy,
      externalRoleCatalogs: [catalog],
      organizationSnapshot,
    }
    let document: GovernanceDocumentV3 = {
      ...draftDocument,
      activePolicyVersionId: version.id,
      publishedVersions: [...current.document.publishedVersions, version],
      draft: { ...nextDraft, basePolicyVersionId: version.id },
    }
    const auditCommand = { commandId: request.commandId, reason: request.reason.trim(), type: request.operation }
    document = appendGovernanceAudit(document, auditCommand, actor, {
      action: request.operation,
      entityType: 'roleAssignment',
      entityId: assignment.id,
      beforeHash,
      afterHash,
      detail: {
        targetPrincipalAdmissionId: target.admissionId, employeeId: target.employeeId, applicationId: 'ai-pdm', stableRoleId: SYSTEM_ADMIN_ROLE_ID,
        scope: { kind: 'global' }, requestHash: preview.requestHash, previewHash: preview.previewHash,
        catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.payloadHash,
        organizationRevision: source.workspaceRevision, governanceRevisionBefore: current.revision,
        assuranceLevel: 'aal2', authenticatedAt: session.authenticatedAt!, sessionReference: session.sessionId,
      },
    }, committedAt)
    const auditReference = document.auditEvents.at(-1)!.id
    const securityAlertReference = `security-alert-${randomUUID()}`
    const invalidationReference = `session-invalidation-${randomUUID()}`
    const receipt: GovernanceCommandReceiptV2 = {
      contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: request.commandId,
      requestHash: preview.requestHash, previewHash: preview.previewHash, receiptStatus: 'applied',
      acceptedAt: committedAt, terminalAt: committedAt, decisionCode: 'COMMAND_APPLIED', auditReference,
      securityAlertReference, sessionRefresh: 'pending', governanceRevision: version.id,
      replayed: false, attempt: 1,
    }
    document = {
      ...document,
      securityAlertIntents: [...document.securityAlertIntents, {
        id: securityAlertReference, commandId: request.commandId, operation: request.operation,
        actorPrincipalId: actor.principalId, employeeId: target.employeeId, targetHint: target.targetHint,
        auditReference, reasonSha256: sha256(request.reason.trim()), status: 'pending', createdAt: committedAt,
      }],
      sessionInvalidationOutbox: [...document.sessionInvalidationOutbox, {
        id: invalidationReference, commandId: request.commandId, targetPrincipalId: target.principalId,
        reason: 'privileged_assignment_changed', status: 'pending', createdAt: committedAt,
      }],
      commandReceipts: [...document.commandReceipts, receipt],
    }
    return {
      document,
      reasonCode: request.operation,
      updatedBy: actor.principalId,
      entitlementChanges: [{ operationId: request.commandId, employeeId: target.employeeId, applicationId: 'ai-pdm' as const, eventKind: 'role_assignment_changed' as const, actor: actor.principalId, reasonCode: 'privileged_assignment_changed' }],
    }
  })
  const receipt = committed.document.commandReceipts.find((value) => value.commandId === request.commandId)
  if (!receipt) throw new PrivilegedAssignmentError('COMMAND_NOT_OBSERVED')
  return receipt
}

export async function readPrivilegedAssignmentReceipt(root: string, commandId: string) {
  const current = await readGovernanceStore(root)
  return current.document.commandReceipts.find((value) => value.commandId === commandId) ?? {
    contractVersion: 'orgmaster.governance-command-receipt.v2' as const,
    commandId, requestHash: '0'.repeat(64), previewHash: '0'.repeat(64), receiptStatus: 'not_found' as const,
    acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_OBSERVED', auditReference: null,
    securityAlertReference: null, sessionRefresh: 'pending' as const, governanceRevision: current.revision,
    replayed: false, attempt: 0,
  }
}

export { PrivilegedAssignmentError }
