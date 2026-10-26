import { randomUUID } from 'node:crypto'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceCommandReceiptV2, GovernanceDocumentV3, GovernanceRoleAssignmentV3, ManagementGrantV1 } from '../src/governance/types'
import { appendGovernanceAudit, commitGovernanceMutation, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { readActiveAiPdmRoleCatalog } from './applicationRoleCatalogRegistry'
import { validateAndNormalizeFinancialCatalogRelease } from './financialCatalogReleaseStore'
import {
  ApplicationEntitlementError,
  FINANCIAL_APPLICATION_ID,
  FINANCIAL_ROLE_ASSIGNMENT_MANAGE,
  FINANCIAL_ROLE_ASSIGNMENT_PUBLISH,
  assertExpectedRevisions,
  assertPrivilegedAdmin,
  catalogBinding,
  commandRequestHash,
  isActiveEmployee,
  previewHash as makePreviewHash,
  publishFinancialPolicy,
} from './applicationEntitlementCommon'

const INITIAL_ROLE_IDS = ['role-finance-manager', 'role-owner'] as const
const INITIAL_CAPABILITIES = [FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH] as const

export type FinancialInitialAuthorityInput = {
  employeeId: string
  stableRoleIds: string[]
  scope: { kind: 'workspace'; value: string }
  validFrom: string
  validUntil: string | null
  reason: string
  release: unknown
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
}

export type FinancialInitialAuthorityPublishInput = FinancialInitialAuthorityInput & {
  commandId: string
  requestHash: string
  previewHash: string
}

function currentFinancialCatalog(document: GovernanceDocumentV3) {
  const version = document.publishedVersions.find((entry) => entry.id === document.activePolicyVersionId)
  return version?.kind === 'assignment-governance-v3'
    ? version.externalRoleCatalogs.find((catalog) => catalog.applicationId === FINANCIAL_APPLICATION_ID) ?? null
    : null
}

function assertUninitialized(document: GovernanceDocumentV3) {
  const policy = document.publishedVersions.find((entry) => entry.id === document.activePolicyVersionId)
  const activePolicy = policy?.kind === 'assignment-governance-v3' ? policy.policy : null
  const hasDraftAuthority = document.draft.roleAssignments.some((assignment) => assignment.applicationId === FINANCIAL_APPLICATION_ID)
    || document.draft.managementGrants.some((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID)
  const hasPublishedAuthority = activePolicy?.roleAssignments.some((assignment) => assignment.applicationId === FINANCIAL_APPLICATION_ID)
    || activePolicy?.managementGrants.some((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID)
  if (currentFinancialCatalog(document) || hasDraftAuthority || hasPublishedAuthority) throw new ApplicationEntitlementError('INITIAL_AUTHORITY_ALREADY_EXISTS')
}

function validateInput(
  document: GovernanceDocumentV3,
  organization: Awaited<ReturnType<typeof loadOrganizationSource>>,
  actor: GovernanceActorContext,
  input: FinancialInitialAuthorityInput,
) {
  assertPrivilegedAdmin(document, actor)
  assertUninitialized(document)
  if (!actor.employeeId || input.employeeId !== actor.employeeId || !isActiveEmployee(organization, input.employeeId)) throw new ApplicationEntitlementError('INITIAL_AUTHORITY_TARGET_INVALID')
  if (input.scope.kind !== 'workspace' || input.scope.value !== 'company-jenfu') throw new ApplicationEntitlementError('UNSUPPORTED_SCOPE')
  if (!input.reason.trim() || input.reason.trim().length > 240) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const from = Date.parse(input.validFrom)
  const until = input.validUntil === null ? null : Date.parse(input.validUntil)
  if (!Number.isFinite(from) || (input.validUntil !== null && !Number.isFinite(until)) || (until !== null && from >= until)) throw new ApplicationEntitlementError('INVALID_VALIDITY')
  const roleIds = [...new Set(input.stableRoleIds)].sort()
  if (roleIds.length !== INITIAL_ROLE_IDS.length || roleIds.some((roleId, index) => roleId !== INITIAL_ROLE_IDS[index])) throw new ApplicationEntitlementError('INITIAL_AUTHORITY_ROLE_SET_INVALID')
  const catalog = validateAndNormalizeFinancialCatalogRelease(input.release, actor)
  for (const roleId of INITIAL_ROLE_IDS) {
    const role = catalog.roles.find((candidate) => candidate.stableRoleId === roleId)
    if (!role || role.status !== 'active' || !role.assignable || role.assignmentDisposition !== 'selectable' || role.assignmentPolicy !== 'open' || role.subjectKind !== 'employee' || role.assignmentTier !== 'app_admin' || role.allowedScopeKinds.length !== 1 || role.allowedScopeKinds[0] !== 'workspace') throw new ApplicationEntitlementError('CATALOG_INCOMPATIBLE')
  }
  return catalog
}

function assignmentFor(input: FinancialInitialAuthorityInput, catalog: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext, roleId: typeof INITIAL_ROLE_IDS[number]): GovernanceRoleAssignmentV3 {
  const role = catalog.roles.find((candidate) => candidate.stableRoleId === roleId)!
  return {
    id: `financial-assignment-${commandRequestHash({ employeeId: input.employeeId, stableRoleId: roleId, scope: input.scope, validFrom: input.validFrom, validUntil: input.validUntil }).slice(0, 32)}`,
    employeeId: input.employeeId,
    applicationId: FINANCIAL_APPLICATION_ID,
    roleId,
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
}

function grantFor(input: FinancialInitialAuthorityInput, actor: GovernanceActorContext, capability: typeof INITIAL_CAPABILITIES[number]): ManagementGrantV1 {
  return {
    id: `financial-management-grant-${commandRequestHash({ principalId: actor.principalId, employeeId: input.employeeId, capability, validFrom: input.validFrom, validUntil: input.validUntil }).slice(0, 32)}`,
    principalId: actor.principalId,
    employeeId: input.employeeId,
    applicationId: FINANCIAL_APPLICATION_ID,
    capability,
    status: 'active',
    validFrom: input.validFrom,
    validTo: input.validUntil,
    grantedByPrincipalId: actor.principalId,
    reason: input.reason.trim(),
  }
}

function buildPreview(document: GovernanceDocumentV3, organizationRevision: string, input: FinancialInitialAuthorityInput, catalog: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext) {
  const assignments = INITIAL_ROLE_IDS.map((roleId) => assignmentFor(input, catalog, actor, roleId))
  const grants = INITIAL_CAPABILITIES.map((capability) => grantFor(input, actor, capability))
  const { commandId: _commandId, requestHash: _requestHash, previewHash: _previewHash, ...requestCore } = input as FinancialInitialAuthorityPublishInput
  const requestHash = commandRequestHash({ applicationId: FINANCIAL_APPLICATION_ID, ...requestCore })
  const preview = {
    applicationId: FINANCIAL_APPLICATION_ID,
    catalogBinding: catalogBinding(catalog),
    beforeAssignments: document.draft.roleAssignments.filter((assignment) => assignment.applicationId === FINANCIAL_APPLICATION_ID),
    afterAssignments: assignments,
    beforeGrants: document.draft.managementGrants.filter((grant) => grant.applicationId === FINANCIAL_APPLICATION_ID),
    afterGrants: grants,
    authorizationEffect: 'not_committed' as const,
    organizationRevision,
  }
  return { ...preview, requestHash, previewHash: makePreviewHash(preview) }
}

export async function previewFinancialInitialAuthority(root: string, actor: GovernanceActorContext, input: FinancialInitialAuthorityInput) {
  const current = await readGovernanceStore(root)
  const source = await loadOrganizationSource(root)
  assertExpectedRevisions(input, current.revision, source.workspaceRevision)
  const catalog = validateInput(current.document, source, actor, input)
  return buildPreview(current.document, source.workspaceRevision, input, catalog, actor)
}

function replayReceipt(document: GovernanceDocumentV3, request: FinancialInitialAuthorityPublishInput): GovernanceCommandReceiptV2 | null {
  const receipt = document.commandReceipts.find((entry) => entry.commandId === request.commandId)
  if (!receipt) return null
  if (receipt.requestHash !== request.requestHash || receipt.previewHash !== request.previewHash) throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
  return { ...receipt, replayed: true }
}

export async function publishFinancialInitialAuthority(root: string, actor: GovernanceActorContext, request: FinancialInitialAuthorityPublishInput) {
  if (!request.commandId.trim()) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const observed = await readGovernanceStore(root)
  const replay = replayReceipt(observed.document, request)
  if (replay) return replay
  const committedAt = new Date().toISOString()
  const committed = await commitGovernanceMutation(root, request.expectedGovernanceRevision, async (current, source) => {
    assertExpectedRevisions(request, current.revision, source.workspaceRevision)
    const catalog = validateInput(current.document, source, actor, request)
    const preview = buildPreview(current.document, source.workspaceRevision, request, catalog, actor)
    if (request.requestHash !== preview.requestHash) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
    if (request.previewHash !== preview.previewHash) throw new ApplicationEntitlementError('PREVIEW_HASH_CONFLICT')
    const assignments = INITIAL_ROLE_IDS.map((roleId) => assignmentFor(request, catalog, actor, roleId))
    const grants = INITIAL_CAPABILITIES.map((capability) => grantFor(request, actor, capability))
    const nextDraft = {
      ...current.document.draft,
      roleAssignments: [...current.document.draft.roleAssignments, ...assignments],
      managementGrants: [...current.document.draft.managementGrants, ...grants],
      updatedAt: committedAt,
    }
    const aiPdm = await readActiveAiPdmRoleCatalog(root)
    let document = publishFinancialPolicy(current.document, nextDraft, [aiPdm, catalog], source, actor, request.reason, committedAt)
    document = appendGovernanceAudit(document, { commandId: request.commandId, reason: request.reason.trim(), type: 'financial_initial_authority_bootstrap' }, actor, {
      action: 'financial_initial_authority_bootstrap', entityType: 'applicationInitialAuthority', entityId: inputEntityId(request.employeeId),
      beforeHash: commandRequestHash({ assignments: preview.beforeAssignments, grants: preview.beforeGrants, catalog: null }),
      afterHash: commandRequestHash({ assignments: preview.afterAssignments, grants: preview.afterGrants, catalog: preview.catalogBinding }),
    }, committedAt)
    const auditReference = document.auditEvents.at(-1)?.id ?? null
    const publishedVersion = document.publishedVersions.at(-1)!
    document = appendGovernanceAudit(document, { commandId: randomUUID(), reason: request.reason.trim(), type: 'PUBLISH_ASSIGNMENTS' }, actor,
      { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: publishedVersion.id, beforeHash: current.document.activePolicyVersionId, afterHash: publishedVersion.snapshotHash }, committedAt)
    const receipt: GovernanceCommandReceiptV2 = {
      contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: request.commandId, requestHash: preview.requestHash, previewHash: preview.previewHash,
      receiptStatus: 'applied', acceptedAt: committedAt, terminalAt: committedAt, decisionCode: 'COMMAND_APPLIED', auditReference,
      securityAlertReference: null, sessionRefresh: 'pending', governanceRevision: publishedVersion.id, replayed: false, attempt: 1,
    }
    document = { ...document, commandReceipts: [...document.commandReceipts, receipt] }
    return { document, reasonCode: 'financial_initial_authority_bootstrap', updatedBy: actor.principalId, validationCatalogs: [aiPdm, catalog] }
  }, actor, (document) => assertPrivilegedAdmin(document, actor))
  const receipt = committed.document.commandReceipts.find((entry) => entry.commandId === request.commandId)
  if (!receipt) throw new ApplicationEntitlementError('COMMAND_NOT_OBSERVED')
  return { ...receipt, governanceRevision: committed.revision }
}

function inputEntityId(employeeId: string) { return `${FINANCIAL_APPLICATION_ID}:${employeeId}` }

export async function readFinancialInitialAuthorityReceipt(root: string, commandId: string) {
  const current = await readGovernanceStore(root)
  return current.document.commandReceipts.find((entry) => entry.commandId === commandId) ?? {
    contractVersion: 'orgmaster.governance-command-receipt.v2' as const, commandId, requestHash: '', previewHash: '', receiptStatus: 'not_found' as const,
    acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND', auditReference: null, securityAlertReference: null,
    sessionRefresh: 'pending' as const, governanceRevision: current.revision, replayed: false, attempt: 0,
  }
}
