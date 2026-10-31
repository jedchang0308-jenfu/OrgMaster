import { randomUUID } from 'node:crypto'
import { readApplicationRoleCatalogs } from './applicationRoleCatalogRegistry'
import { appendGovernanceAudit, commitGovernanceMutation, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { validateFinancialExternalRoleCatalog } from '../src/governance/financialCatalog'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceCommandReceiptV2, GovernanceDocumentV3, GovernanceRoleAssignmentV3 } from '../src/governance/types'
import {
  ApplicationEntitlementError,
  FINANCIAL_APPLICATION_ID,
  FINANCIAL_ROLE_ASSIGNMENT_MANAGE,
  FINANCIAL_ROLE_ASSIGNMENT_PUBLISH,
  type FinancialRoleAssignmentInput,
  type FinancialRoleAssignmentPublishInput,
  assertExpectedCatalog,
  assertExpectedRevisions,
  assertFinancialAuthority,
  hasFinancialManagementGrant,
  catalogBinding,
  commandRequestHash,
  isActiveEmployee,
  policyFromDraft,
  previewHash as makePreviewHash,
  publishFinancialPolicy,
} from './applicationEntitlementCommon'

export type FinancialRoleAssignmentWorkspace = {
  applicationId: typeof FINANCIAL_APPLICATION_ID
  catalogBinding: ReturnType<typeof catalogBinding>
  governanceRevision: string
  organizationRevision: string
  assignmentVersionId: string | null
  roles: Array<{ stableRoleId: string; roleCode: string; roleName: string }>
  allowedOperations: { preview: true; publish: boolean }
  assignments: Array<{
    assignmentId: string
    employeeId: string
    employeeName?: string
    stableRoleId: string
    roleCode: string
    roleName: string
    scope: { kind: 'workspace'; value: string }
    status: 'active' | 'revoked'
    validFrom: string
    validUntil: string | null
  }>
}

function financialCatalog(catalogs: ExternalRoleCatalogSnapshotV1[]) {
  const catalog = catalogs.find((entry) => entry.applicationId === FINANCIAL_APPLICATION_ID)
  if (!catalog || validateFinancialExternalRoleCatalog(catalog).length) throw new ApplicationEntitlementError('CATALOG_REGISTRY_UNAVAILABLE')
  return catalog
}

function validateAssignmentInput(input: FinancialRoleAssignmentInput, catalog: ExternalRoleCatalogSnapshotV1, organization: Awaited<ReturnType<typeof loadOrganizationSource>>) {
  assertExpectedCatalog(input, catalogBinding(catalog))
  if (!input.employeeId.trim() || input.operation === 'upsert' && !isActiveEmployee(organization, input.employeeId)) throw new ApplicationEntitlementError('EMPLOYEE_NOT_FOUND')
  if (input.scope.kind !== 'workspace' || input.scope.value !== 'company-jenfu') throw new ApplicationEntitlementError('UNSUPPORTED_SCOPE')
  if (!input.reason.trim() || input.reason.trim().length > 240) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const from = Date.parse(input.validFrom)
  const until = input.validUntil === null ? null : Date.parse(input.validUntil)
  if (!Number.isFinite(from) || (input.validUntil !== null && !Number.isFinite(until)) || (until !== null && from >= until)) throw new ApplicationEntitlementError('INVALID_VALIDITY')
  if (input.operation === 'upsert') {
    if (!input.stableRoleId?.trim()) throw new ApplicationEntitlementError('ROLE_NOT_FOUND')
    const role = catalog.roles.find((entry) => entry.stableRoleId === input.stableRoleId)
    if (!role) throw new ApplicationEntitlementError('ROLE_NOT_FOUND')
    if (role.status !== 'active' || !role.assignable || role.assignmentDisposition === 'legacy-only' || role.assignmentPolicy === 'existing_only') throw new ApplicationEntitlementError('CATALOG_INCOMPATIBLE')
    if (role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin') throw new ApplicationEntitlementError('UNSUPPORTED_SUBJECT')
  }
}

function redacted(assignment: GovernanceRoleAssignmentV3) {
  return {
    assignmentId: assignment.id,
    employeeId: assignment.employeeId,
    stableRoleId: assignment.roleId,
    roleCode: assignment.roleCodeSnapshot,
    roleName: assignment.roleNameSnapshot,
    scope: assignment.scope as { kind: 'workspace'; value: string },
    status: assignment.status,
    validFrom: assignment.validFrom,
    validUntil: assignment.validTo,
  }
}

function currentAssignments(document: GovernanceDocumentV3) {
  return document.draft.roleAssignments.filter((assignment) => assignment.applicationId === FINANCIAL_APPLICATION_ID)
}

function assignmentTarget(document: GovernanceDocumentV3, input: FinancialRoleAssignmentInput) {
  if (input.operation === 'revoke') {
    const found = currentAssignments(document).find((assignment) => assignment.id === input.assignmentId && assignment.status === 'active')
    if (!found) throw new ApplicationEntitlementError('ASSIGNMENT_NOT_FOUND')
    if (found.employeeId !== input.employeeId || found.scope.kind !== input.scope.kind
      || !('value' in found.scope) || found.scope.value !== input.scope.value
      || input.stableRoleId !== undefined && input.stableRoleId !== found.roleId) {
      throw new ApplicationEntitlementError('ASSIGNMENT_NOT_FOUND')
    }
    return found
  }
  const existing = currentAssignments(document).find((assignment) => assignment.id === input.assignmentId)
    ?? currentAssignments(document).find((assignment) => assignment.status === 'active' && assignment.employeeId === input.employeeId && assignment.roleId === input.stableRoleId && assignment.scope.kind === input.scope.kind && assignment.scope.value === input.scope.value)
  return existing ?? null
}

function applyAssignment(document: GovernanceDocumentV3, input: FinancialRoleAssignmentInput, catalog: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext, now: string) {
  const existing = assignmentTarget(document, input)
  if (input.operation === 'revoke') {
    if (!existing) throw new ApplicationEntitlementError('ASSIGNMENT_NOT_FOUND')
    return document.draft.roleAssignments.map((assignment) => assignment.id === existing.id ? { ...assignment, status: 'revoked' as const, validTo: input.validUntil, createdByPrincipalId: actor.principalId, createdReason: input.reason.trim() } : assignment)
  }
  const role = catalog.roles.find((entry) => entry.stableRoleId === input.stableRoleId)
  if (!role) throw new ApplicationEntitlementError('ROLE_NOT_FOUND')
  const next: GovernanceRoleAssignmentV3 = {
    id: existing?.id ?? `financial-assignment-${commandRequestHash({ employeeId: input.employeeId, stableRoleId: input.stableRoleId, scope: input.scope, validFrom: input.validFrom, validUntil: input.validUntil }).slice(0, 32)}`,
    employeeId: input.employeeId,
    applicationId: FINANCIAL_APPLICATION_ID,
    roleId: role.stableRoleId,
    roleCodeSnapshot: role.code,
    roleNameSnapshot: role.displayName,
    catalogVersion: catalog.catalogVersion,
    authoringCatalogVersion: catalog.catalogVersion,
    authoringCatalogSha256: catalog.catalogSha256 ?? catalog.contentSha256 ?? catalog.payloadHash,
    scope: input.scope,
    status: 'active',
    validFrom: input.validFrom,
    validTo: input.validUntil,
    effectState: 'not-synchronized',
    basis: 'manual',
    subjectKind: 'employee',
    targetPrincipalId: null,
    sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: actor.principalId,
    createdReason: input.reason.trim(),
  }
  return existing
    ? document.draft.roleAssignments.map((assignment) => assignment.id === existing.id ? next : assignment)
    : [...document.draft.roleAssignments, next]
}

function buildPreview(document: GovernanceDocumentV3, organizationRevision: string, input: FinancialRoleAssignmentInput, catalog: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext) {
  const before = currentAssignments(document)
  const after = applyAssignment(document, input, catalog, actor, new Date().toISOString())
  const { commandId: _commandId, requestHash: _requestHash, previewHash: _previewHash, ...requestCore } = input as FinancialRoleAssignmentPublishInput
  const requestHash = commandRequestHash({ applicationId: FINANCIAL_APPLICATION_ID, ...requestCore })
  const preview = {
    applicationId: FINANCIAL_APPLICATION_ID,
    catalogBinding: catalogBinding(catalog),
    beforeAssignments: before.map(redacted),
    afterAssignments: after.filter((assignment) => assignment.applicationId === FINANCIAL_APPLICATION_ID).map(redacted),
    candidateAssignmentVersionId: document.activePolicyVersionId,
    incompatibleAssignmentIds: [],
    authorizationEffect: 'not_committed' as const,
    organizationRevision,
  }
  return { ...preview, requestHash, previewHash: makePreviewHash(preview) }
}

export async function readFinancialRoleAssignmentWorkspace(root: string, actor: GovernanceActorContext) {
  const current = await readGovernanceStore(root)
  const catalogs = await readApplicationRoleCatalogs(root, { requirePublishedFinancial: true })
  const catalog = financialCatalog(catalogs)
  assertFinancialAuthority(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_MANAGE)
  const source = await loadOrganizationSource(root)
  return {
    applicationId: FINANCIAL_APPLICATION_ID,
    catalogBinding: catalogBinding(catalog),
    governanceRevision: current.revision,
    organizationRevision: source.workspaceRevision,
    assignmentVersionId: current.document.activePolicyVersionId,
    roles: catalog.roles.filter(role => role.status === 'active' && role.assignable
      && role.assignmentDisposition !== 'legacy-only' && role.assignmentPolicy !== 'existing_only'
      && role.subjectKind === 'employee' && role.assignmentTier === 'app_admin')
      .map(role => ({ stableRoleId: role.stableRoleId, roleCode: role.code, roleName: role.displayName })),
    allowedOperations: { preview: true, publish: hasFinancialManagementGrant(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH) },
    assignments: currentAssignments(current.document).map(assignment => ({ ...redacted(assignment),
      employeeName: source.state.employees.find(employee => employee.id === assignment.employeeId)?.name ?? assignment.employeeId })),
  } satisfies FinancialRoleAssignmentWorkspace
}

export async function previewFinancialRoleAssignment(root: string, actor: GovernanceActorContext, input: FinancialRoleAssignmentInput) {
  const current = await readGovernanceStore(root)
  const source = await loadOrganizationSource(root)
  const catalog = financialCatalog(await readApplicationRoleCatalogs(root, { requirePublishedFinancial: true }))
  assertFinancialAuthority(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_MANAGE)
  assertExpectedRevisions(input, current.revision, source.workspaceRevision)
  validateAssignmentInput(input, catalog, source)
  return buildPreview(current.document, source.workspaceRevision, input, catalog, actor)
}

function financialAssignmentReceipt(document: GovernanceDocumentV3, receipt: GovernanceCommandReceiptV2) {
  return document.auditEvents.some(event => event.id === receipt.auditReference
    && event.commandId === receipt.commandId && event.entityType === 'applicationRoleAssignment'
    && ['financial_role_assignment_upsert', 'financial_role_assignment_revoke'].includes(event.action))
}

function replayReceipt(document: GovernanceDocumentV3, request: FinancialRoleAssignmentPublishInput): GovernanceCommandReceiptV2 | null {
  const receipt = document.commandReceipts.find((entry) => entry.commandId === request.commandId)
  if (!receipt) return null
  if (!financialAssignmentReceipt(document, receipt)) throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
  if (receipt.requestHash !== request.requestHash || receipt.previewHash !== request.previewHash) throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
  return { ...receipt, replayed: true }
}

export async function publishFinancialRoleAssignment(root: string, actor: GovernanceActorContext, request: FinancialRoleAssignmentPublishInput) {
  if (!request.commandId.trim()) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const observed = await readGovernanceStore(root)
  assertFinancialAuthority(observed.document, actor, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH)
  const replay = replayReceipt(observed.document, request)
  if (replay) return replay
  const committed = await commitGovernanceMutation(root, request.expectedGovernanceRevision, async (current, source) => {
    const catalogs = await readApplicationRoleCatalogs(root, { requirePublishedFinancial: true })
    const catalog = financialCatalog(catalogs)
    assertFinancialAuthority(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH)
    assertExpectedRevisions(request, current.revision, source.workspaceRevision)
    validateAssignmentInput(request, catalog, source)
    const preview = buildPreview(current.document, source.workspaceRevision, request, catalog, actor)
    if (request.requestHash !== preview.requestHash) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
    if (request.previewHash !== preview.previewHash) throw new ApplicationEntitlementError('PREVIEW_HASH_CONFLICT')
    const nextRoleAssignments = applyAssignment(current.document, request, catalog, actor, new Date().toISOString())
    const nextDraft = { ...current.document.draft, roleAssignments: nextRoleAssignments, updatedAt: new Date().toISOString() }
    let document = publishFinancialPolicy(current.document, nextDraft, catalogs, source, actor, request.reason, new Date().toISOString())
    document = appendGovernanceAudit(document, { commandId: request.commandId, reason: request.reason.trim(), type: request.operation }, actor, { action: `financial_role_assignment_${request.operation}`, entityType: 'applicationRoleAssignment', entityId: request.assignmentId ?? null, beforeHash: commandRequestHash(preview.beforeAssignments), afterHash: commandRequestHash(preview.afterAssignments) })
    const auditReference = document.auditEvents.at(-1)?.id ?? null
    const publishedVersion = document.publishedVersions.at(-1)!
    document = appendGovernanceAudit(document, { commandId: randomUUID(), reason: request.reason.trim(), type: 'PUBLISH_ASSIGNMENTS' }, actor,
      { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: publishedVersion.id, beforeHash: null, afterHash: publishedVersion.snapshotHash })
    const receipt: GovernanceCommandReceiptV2 = {
      contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: request.commandId, requestHash: preview.requestHash, previewHash: preview.previewHash,
      receiptStatus: 'applied', acceptedAt: new Date().toISOString(), terminalAt: new Date().toISOString(), decisionCode: 'COMMAND_APPLIED', auditReference,
      securityAlertReference: null, sessionRefresh: 'pending', governanceRevision: document.publishedVersions.at(-1)?.id ?? current.revision, replayed: false, attempt: 1,
    }
    document = { ...document, commandReceipts: [...document.commandReceipts, receipt] }
    return { document, reasonCode: 'financial_role_assignment_publish', updatedBy: actor.principalId }
  }, actor, (document) => assertFinancialAuthority(document, actor, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH))
  const receipt = committed.document.commandReceipts.find((entry) => entry.commandId === request.commandId)
  if (!receipt) throw new ApplicationEntitlementError('COMMAND_NOT_OBSERVED')
  return { ...receipt, governanceRevision: committed.revision }
}

export async function readFinancialRoleAssignmentReceipt(root: string, commandId: string, actor: GovernanceActorContext) {
  if (!commandId.trim() || commandId.length > 128) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const current = await readGovernanceStore(root)
  assertFinancialAuthority(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_MANAGE)
  const receipt = current.document.commandReceipts.find((entry) => entry.commandId === commandId)
  const ownNamespace = receipt && financialAssignmentReceipt(current.document, receipt)
  return ownNamespace ? receipt : {
    contractVersion: 'orgmaster.governance-command-receipt.v2' as const, commandId, requestHash: '', previewHash: '', receiptStatus: 'not_found' as const,
    acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND', auditReference: null, securityAlertReference: null, sessionRefresh: 'pending' as const, governanceRevision: current.revision, replayed: false, attempt: 0,
  }
}
