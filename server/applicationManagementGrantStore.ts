import { readApplicationRoleCatalogs } from './applicationRoleCatalogRegistry'
import { appendGovernanceAudit, commitGovernanceMutation, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import type { GovernanceActorContext, GovernanceCommandReceiptV2, GovernanceDocumentV3, GovernanceRoleAssignmentV3, ManagementGrantV1 } from '../src/governance/types'
import {
  ApplicationEntitlementError,
  FINANCIAL_APPLICATION_ID,
  FINANCIAL_ROLE_ASSIGNMENT_MANAGE,
  FINANCIAL_ROLE_ASSIGNMENT_PUBLISH,
  FinancialManagementGrantInput,
  FinancialManagementGrantOperation,
  FinancialManagementGrantPublishInput,
  assertExpectedRevisions,
  assertPrivilegedAdmin,
  activeFinancialGrants,
  commandRequestHash,
  grantKey,
  isActiveEmployee,
  previewHash as makePreviewHash,
  publishFinancialPolicy,
} from './applicationEntitlementCommon'

function activeAdmission(document: GovernanceDocumentV3, principalId: string, employeeId: string) {
  const link = document.draft.identityLinks.find((entry) => entry.principalId === principalId && entry.employeeId === employeeId && entry.status === 'active')
  if (!link) return null
  return (document.draft.principalAdmissions ?? []).find((admission) => admission.identityLinkId === link.id && admission.status === 'active') ?? null
}

function validateOperation(operation: FinancialManagementGrantOperation, document: GovernanceDocumentV3, source: Awaited<ReturnType<typeof loadOrganizationSource>>, actor: GovernanceActorContext) {
  if (!operation.principalId.trim() || !operation.employeeId.trim()) throw new ApplicationEntitlementError('PRINCIPAL_NOT_FOUND')
  if (!isActiveEmployee(source, operation.employeeId)) throw new ApplicationEntitlementError('EMPLOYEE_NOT_FOUND')
  if (operation.principalId === actor.principalId || operation.employeeId === actor.employeeId) throw new ApplicationEntitlementError('SELF_GRANT_FORBIDDEN')
  const admission = activeAdmission(document, operation.principalId, operation.employeeId)
  if (!admission) throw new ApplicationEntitlementError('PRINCIPAL_NOT_FOUND')
  if (admission.accountType !== 'human_personal') throw new ApplicationEntitlementError('UNSUPPORTED_SUBJECT')
  if (!Array.isArray(operation.capabilities) || operation.capabilities.length === 0 || new Set(operation.capabilities).size !== operation.capabilities.length || operation.capabilities.some((capability) => capability !== FINANCIAL_ROLE_ASSIGNMENT_MANAGE && capability !== FINANCIAL_ROLE_ASSIGNMENT_PUBLISH)) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const from = Date.parse(operation.validFrom)
  const until = operation.validUntil === null ? null : Date.parse(operation.validUntil)
  if (!Number.isFinite(from) || (operation.validUntil !== null && !Number.isFinite(until)) || (until !== null && from >= until)) throw new ApplicationEntitlementError('INVALID_VALIDITY')
  if (!operation.reason.trim() || operation.reason.trim().length > 240) throw new ApplicationEntitlementError('INVALID_COMMAND')
}

function currentGrants(document: GovernanceDocumentV3) {
  return activeFinancialGrants(document)
}

function applyGrantOperations(document: GovernanceDocumentV3, operations: FinancialManagementGrantOperation[], actor: GovernanceActorContext) {
  let grants = [...document.draft.managementGrants]
  for (const operation of operations) {
    for (const capability of operation.capabilities) {
      const key = `${operation.principalId}|${operation.employeeId}|${FINANCIAL_APPLICATION_ID}|${capability}`
      const existingIndex = grants.findIndex((grant) => grantKey(grant) === key)
      const existing = existingIndex >= 0 ? grants[existingIndex] : null
      const next: ManagementGrantV1 = {
        id: existing?.id ?? `financial-management-grant-${commandRequestHash({ principalId: operation.principalId, employeeId: operation.employeeId, capability, validFrom: operation.validFrom, validUntil: operation.validUntil }).slice(0, 32)}`,
        principalId: operation.principalId,
        employeeId: operation.employeeId,
        applicationId: FINANCIAL_APPLICATION_ID,
        capability,
        status: operation.operation === 'upsert' ? 'active' : 'revoked',
        validFrom: operation.validFrom,
        validTo: operation.validUntil,
        grantedByPrincipalId: actor.principalId,
        reason: operation.reason.trim(),
      }
      if (existingIndex >= 0) grants[existingIndex] = next
      else if (operation.operation === 'upsert') grants.push(next)
      else throw new ApplicationEntitlementError('ASSIGNMENT_NOT_FOUND')
    }
  }
  return grants
}

function ensureGovernorContinuity(grants: ManagementGrantV1[]) {
  const active = grants.filter((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID && grant.status === 'active')
  const manage = new Set(active.filter((grant) => grant.capability === FINANCIAL_ROLE_ASSIGNMENT_MANAGE).map((grant) => `${grant.principalId}|${grant.employeeId}`))
  const publish = new Set(active.filter((grant) => grant.capability === FINANCIAL_ROLE_ASSIGNMENT_PUBLISH).map((grant) => `${grant.principalId}|${grant.employeeId}`))
  if (![...manage].some((key) => publish.has(key))) throw new ApplicationEntitlementError('GOVERNANCE_CONTINUITY_REQUIRED')
}

function redacted(grant: ManagementGrantV1) {
  return { grantId: grant.id, principalId: grant.principalId, employeeId: grant.employeeId, applicationId: grant.applicationId, capability: grant.capability, status: grant.status, validFrom: grant.validFrom, validUntil: grant.validTo }
}

function buildPreview(document: GovernanceDocumentV3, organizationRevision: string, input: FinancialManagementGrantInput, actor: GovernanceActorContext) {
  const before = currentGrants(document)
  const after = applyGrantOperations(document, input.operations, actor)
  ensureGovernorContinuity(after)
  const { commandId: _commandId, requestHash: _requestHash, previewHash: _previewHash, ...requestCore } = input as FinancialManagementGrantPublishInput
  const requestHash = commandRequestHash({ applicationId: FINANCIAL_APPLICATION_ID, ...requestCore })
  const preview = {
    applicationId: FINANCIAL_APPLICATION_ID,
    beforeGrants: before.map(redacted),
    afterGrants: after.filter((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID).map(redacted),
    authorizationEffect: 'not_committed' as const,
    organizationRevision,
  }
  return { ...preview, requestHash, previewHash: makePreviewHash(preview) }
}

export async function readFinancialManagementGrantWorkspace(root: string, actor: GovernanceActorContext) {
  const current = await readGovernanceStore(root)
  assertPrivilegedAdmin(current.document, actor)
  const source = await loadOrganizationSource(root)
  return { applicationId: FINANCIAL_APPLICATION_ID, governanceRevision: current.revision, organizationRevision: source.workspaceRevision, grants: currentGrants(current.document).map(redacted) }
}

export async function previewFinancialManagementGrant(root: string, actor: GovernanceActorContext, input: FinancialManagementGrantInput) {
  const current = await readGovernanceStore(root)
  const source = await loadOrganizationSource(root)
  assertPrivilegedAdmin(current.document, actor)
  assertExpectedRevisions(input, current.revision, source.workspaceRevision)
  if (!Array.isArray(input.operations) || input.operations.length === 0 || input.operations.length > 16) throw new ApplicationEntitlementError('INVALID_COMMAND')
  input.operations.forEach((operation) => validateOperation(operation, current.document, source, actor))
  return buildPreview(current.document, source.workspaceRevision, input, actor)
}

function replayReceipt(document: GovernanceDocumentV3, request: FinancialManagementGrantPublishInput): GovernanceCommandReceiptV2 | null {
  const receipt = document.commandReceipts.find((entry) => entry.commandId === request.commandId)
  if (!receipt) return null
  if (receipt.requestHash !== request.requestHash || receipt.previewHash !== request.previewHash) throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
  return { ...receipt, replayed: true }
}

export async function publishFinancialManagementGrant(root: string, actor: GovernanceActorContext, request: FinancialManagementGrantPublishInput) {
  if (!request.commandId.trim()) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const observed = await readGovernanceStore(root)
  const replay = replayReceipt(observed.document, request)
  if (replay) return replay
  const committed = await commitGovernanceMutation(root, request.expectedGovernanceRevision, async (current, source) => {
    assertPrivilegedAdmin(current.document, actor)
    assertExpectedRevisions(request, current.revision, source.workspaceRevision)
    if (!Array.isArray(request.operations) || request.operations.length === 0 || request.operations.length > 16) throw new ApplicationEntitlementError('INVALID_COMMAND')
    request.operations.forEach((operation) => validateOperation(operation, current.document, source, actor))
    const preview = buildPreview(current.document, source.workspaceRevision, request, actor)
    if (request.requestHash !== preview.requestHash) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
    if (request.previewHash !== preview.previewHash) throw new ApplicationEntitlementError('PREVIEW_HASH_CONFLICT')
    const nextDraft = { ...current.document.draft, managementGrants: applyGrantOperations(current.document, request.operations, actor), updatedAt: new Date().toISOString() }
    const catalogs = await readApplicationRoleCatalogs(root)
    let document = publishFinancialPolicy(current.document, nextDraft, catalogs, source, actor, request.operations.map((operation) => operation.reason.trim()).join('; '), new Date().toISOString())
    document = appendGovernanceAudit(document, { commandId: request.commandId, reason: request.operations.map((operation) => operation.reason.trim()).join('; '), type: 'financial_management_grant_batch' }, actor, { action: 'financial_management_grant_batch', entityType: 'applicationManagementGrant', entityId: null, beforeHash: commandRequestHash(preview.beforeGrants), afterHash: commandRequestHash(preview.afterGrants) })
    const receipt: GovernanceCommandReceiptV2 = {
      contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: request.commandId, requestHash: preview.requestHash, previewHash: preview.previewHash, receiptStatus: 'applied', acceptedAt: new Date().toISOString(), terminalAt: new Date().toISOString(), decisionCode: 'COMMAND_APPLIED', auditReference: document.auditEvents.at(-1)?.id ?? null, securityAlertReference: null, sessionRefresh: 'pending', governanceRevision: document.publishedVersions.at(-1)?.id ?? current.revision, replayed: false, attempt: 1,
    }
    document = { ...document, commandReceipts: [...document.commandReceipts, receipt] }
    return { document, reasonCode: 'financial_management_grant_publish', updatedBy: actor.principalId }
  })
  const receipt = committed.document.commandReceipts.find((entry) => entry.commandId === request.commandId)
  if (!receipt) throw new ApplicationEntitlementError('COMMAND_NOT_OBSERVED')
  return { ...receipt, governanceRevision: committed.revision }
}

export async function readFinancialManagementGrantReceipt(root: string, commandId: string) {
  const current = await readGovernanceStore(root)
  return current.document.commandReceipts.find((entry) => entry.commandId === commandId) ?? {
    contractVersion: 'orgmaster.governance-command-receipt.v2' as const, commandId, requestHash: '', previewHash: '', receiptStatus: 'not_found' as const, acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND', auditReference: null, securityAlertReference: null, sessionRefresh: 'pending' as const, governanceRevision: current.revision, replayed: false, attempt: 0,
  }
}
