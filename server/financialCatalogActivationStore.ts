import { randomUUID } from 'node:crypto'
import { currentPublishedPolicyV3 } from '../src/governance/evaluatePermission'
import { publicationSnapshotHash } from '../src/governance/commands'
import { isActiveAt } from '../src/governance/validation'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceCommandReceiptV2, GovernanceDocumentV3 } from '../src/governance/types'
import { appendGovernanceAudit, commitGovernanceMutation, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { readActiveAiPdmRoleCatalog } from './applicationRoleCatalogRegistry'
import { ApplicationEntitlementError, assertExpectedRevisions, assertFinancialAuthority, commandRequestHash, FINANCIAL_APPLICATION_ID, hasFinancialManagementGrant, publishFinancialPolicy } from './applicationEntitlementCommon'
import { rebaseFinancialCatalogAssignments, validateAndNormalizeFinancialCatalogRelease } from './financialCatalogReleaseStore'
import { readFinancialCatalogPeerOrigin, verifyFinancialCatalogCheckpoint, type CatalogActivationExpected, type FmsCatalogCheckpoint } from './financialCatalogIntent'

const ACTIVATE = 'financial_catalog_activate'
const OPERATIONS = ['financial-management-system.catalog.import', 'financial-management-system.catalog.publish', 'financial-management-system.catalog.activate'] as const
type RecordProof = NonNullable<GovernanceCommandReceiptV2['financialCatalogActivation']>
export type FinancialCatalogActivationInput = {
  reason: string
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
}
export type FinancialCatalogActivationPublishInput = FinancialCatalogActivationInput & {
  commandId: string
  requestHash: string
  previewHash: string
  fmsCheckpoint?: unknown
}

function assertActivationAuthority(document: GovernanceDocumentV3, actor: GovernanceActorContext) {
  for (const operation of OPERATIONS) assertFinancialAuthority(document, actor, operation)
}
function validateRequest(request: FinancialCatalogActivationInput) {
  if (typeof request.reason !== 'string' || !request.reason.trim() || request.reason.trim().length > 240 ||
    typeof request.expectedGovernanceRevision !== 'string' || !request.expectedGovernanceRevision ||
    typeof request.expectedOrganizationRevision !== 'string' || !request.expectedOrganizationRevision) throw new ApplicationEntitlementError('INVALID_COMMAND')
}
function currentCatalog(document: GovernanceDocumentV3) {
  const version = document.publishedVersions.find(item => item.id === document.activePolicyVersionId)
  if (!version || version.kind !== 'assignment-governance-v3') throw new ApplicationEntitlementError('FINANCIAL_CATALOG_UNAVAILABLE')
  const catalog = version.externalRoleCatalogs.find(item => item.applicationId === FINANCIAL_APPLICATION_ID)
  if (!catalog) throw new ApplicationEntitlementError('FINANCIAL_CATALOG_UNAVAILABLE')
  return catalog
}
function binding(catalog: ExternalRoleCatalogSnapshotV1) {
  return { applicationId: FINANCIAL_APPLICATION_ID, catalogVersion: catalog.catalogVersion,
    contentSha256: catalog.contentSha256 ?? catalog.catalogSha256 ?? catalog.payloadHash, artifactSha256: catalog.artifactSha256 ?? null }
}
function activationRequestHash(candidate: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext, request: FinancialCatalogActivationInput) {
  return commandRequestHash({ applicationId: FINANCIAL_APPLICATION_ID, operation: 'catalog.activate',
    principalId: actor.principalId, employeeId: actor.employeeId, reason: request.reason.trim(),
    expectedGovernanceRevision: request.expectedGovernanceRevision, expectedOrganizationRevision: request.expectedOrganizationRevision,
    candidate: binding(candidate), sourceDraftId: candidate.sourceDraftId, sourceDraftRevision: candidate.sourceDraftRevision })
}
function preview(document: GovernanceDocumentV3, organizationRevision: string, candidate: ExternalRoleCatalogSnapshotV1,
  actor: GovernanceActorContext, request: FinancialCatalogActivationInput) {
  const before = currentCatalog(document), prior = new Map(before.roles.map(role => [role.stableRoleId, role]))
  const next = new Map(candidate.roles.map(role => [role.stableRoleId, role]))
  const assignments = document.draft.roleAssignments.filter(item => item.applicationId === FINANCIAL_APPLICATION_ID && item.status === 'active')
  const removedAssignedRoleIds = [...new Set(assignments.filter(item => !next.has(item.roleId)).map(item => item.roleId))].sort()
  const alreadyActive = commandRequestHash(binding(before)) === commandRequestHash(binding(candidate))
  const changedRoles = candidate.roles.filter(role => prior.has(role.stableRoleId)).flatMap(role => {
    const old = prior.get(role.stableRoleId)!
    const added = (role.capabilityIds ?? []).filter(id => !(old.capabilityIds ?? []).includes(id)).sort()
    const removed = (old.capabilityIds ?? []).filter(id => !(role.capabilityIds ?? []).includes(id)).sort()
    const renamed = old.displayName !== role.displayName
    const assignmentPolicyChanged = old.assignmentPolicy !== role.assignmentPolicy
    return added.length || removed.length || renamed || assignmentPolicyChanged || old.roleDefinitionHash !== role.roleDefinitionHash
      ? [{ stableRoleId: role.stableRoleId, displayName: role.displayName, addedCapabilities: added, removedCapabilities: removed, renamed, assignmentPolicyChanged }] : []
  })
  const requestHash = activationRequestHash(candidate, actor, request)
  const impact = {
    before: binding(before), after: binding(candidate), assignmentVersion: document.activePolicyVersionId,
    expected: { governanceRevision: request.expectedGovernanceRevision, assignmentVersion: document.activePolicyVersionId!,
      catalogBindingRevision: binding(before).contentSha256, grantRevision: request.expectedGovernanceRevision },
    addedRoles: candidate.roles.filter(role => !prior.has(role.stableRoleId)).map(role => ({ stableRoleId: role.stableRoleId, displayName: role.displayName })),
    removedRoles: before.roles.filter(role => !next.has(role.stableRoleId)).map(role => ({ stableRoleId: role.stableRoleId, displayName: role.displayName })),
    changedRoles,
    affectedAssignmentCount: assignments.filter(item => item.catalogVersion !== candidate.catalogVersion).length,
    preservedAssignmentIds: assignments.filter(item => next.has(item.roleId)).map(item => item.id).sort(),
    removedAssignedRoleIds,
    compatible: removedAssignedRoleIds.length === 0,
    alreadyActive,
    organizationRevision,
  }
  return { applicationId: FINANCIAL_APPLICATION_ID, requestHash, previewHash: commandRequestHash({ requestHash, impact }), ...impact,
    allowedOperations: { activate: !alreadyActive && removedAssignedRoleIds.length === 0 && OPERATIONS.every(operation => hasFinancialManagementGrant(document, actor, operation)) } }
}
export async function readFinancialCatalogActivationWorkspace(root: string, actor: GovernanceActorContext) {
  const current = await readGovernanceStore(root)
  assertFinancialAuthority(current.document, actor, OPERATIONS[0])
  const source = await loadOrganizationSource(root)
  return { applicationId: FINANCIAL_APPLICATION_ID, governanceRevision: current.revision, organizationRevision: source.workspaceRevision,
    fmsOrigin: readFinancialCatalogPeerOrigin(),
    assignmentVersion: current.document.activePolicyVersionId, activeCatalog: binding(currentCatalog(current.document)),
    allowedOperations: { preview: true, activate: OPERATIONS.every(operation => hasFinancialManagementGrant(current.document, actor, operation)) } }
}
export async function previewFinancialCatalogActivation(root: string, actor: GovernanceActorContext, release: unknown, request: FinancialCatalogActivationInput) {
  validateRequest(request)
  const current = await readGovernanceStore(root)
  assertFinancialAuthority(current.document, actor, OPERATIONS[0])
  const source = await loadOrganizationSource(root)
  assertExpectedRevisions(request, current.revision, source.workspaceRevision)
  return preview(current.document, source.workspaceRevision, validateAndNormalizeFinancialCatalogRelease(release, actor), actor, request)
}
function ownReceipt(document: GovernanceDocumentV3, commandId: string, actor: GovernanceActorContext) {
  const receipt = document.commandReceipts.find(item => item.commandId === commandId)
  if (!receipt) return null
  const proof = receipt.financialCatalogActivation
  const event = document.auditEvents.find(item => item.id === receipt.auditReference && item.commandId === commandId &&
    item.action === ACTIVATE && item.entityType === 'financialCatalogRelease')
  const published = proof && document.publishedVersions.find(item => item.id === proof.assignmentVersionAfter && item.kind === 'assignment-governance-v3')
  if (!proof || proof.contractVersion !== 'orgmaster.fms-catalog-activation-record.v1' || !event ||
    proof.principalId !== actor.principalId || proof.employeeId !== actor.employeeId || event.actorPrincipalId !== actor.principalId ||
    event.entityId !== proof.catalogVersion || event.afterHash !== publicationSnapshotHash({ requestHash: receipt.requestHash, previewHash: receipt.previewHash, record: proof }) ||
    !published || published.snapshotHash !== proof.publishedSnapshotHash || published.publishedByPrincipalId !== actor.principalId ||
    receipt.governanceRevision !== published.id || receipt.acceptedAt !== published.publishedAt || receipt.terminalAt !== published.publishedAt ||
    receipt.receiptStatus !== 'applied') throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
  return receipt
}
function actorProof(document: GovernanceDocumentV3, actor: GovernanceActorContext, nowMs: number) {
  if (!actor.employeeId || !Number.isSafeInteger(actor.principalAuthEpoch) || Number(actor.principalAuthEpoch) < 0 ||
    typeof actor.authenticatedAt !== 'string' || !Number.isFinite(Date.parse(actor.authenticatedAt))) throw new ApplicationEntitlementError('IDENTITY_REQUIRED')
  const at = new Date(nowMs).toISOString()
  if (Date.parse(actor.authenticatedAt) > nowMs) throw new ApplicationEntitlementError('IDENTITY_REQUIRED')
  const grants = currentPublishedPolicyV3(document)?.managementGrants.filter(grant =>
    grant.applicationId === FINANCIAL_APPLICATION_ID && grant.principalId === actor.principalId &&
    grant.employeeId === actor.employeeId && OPERATIONS.includes(grant.capability as typeof OPERATIONS[number]) &&
    isActiveAt(grant.status, grant.validFrom, grant.validTo, at)) ?? []
  if (grants.length > 64) throw new ApplicationEntitlementError('FINANCIAL_CATALOG_UNAVAILABLE')
  return { employeeId: actor.employeeId, grantIds: [...new Set(grants.map(grant => grant.id))].sort(),
    authEpoch: Number(actor.principalAuthEpoch), authenticatedAt: new Date(actor.authenticatedAt).toISOString(), authorityReadAt: at }
}
function checkpoint(request: FinancialCatalogActivationPublishInput, actor: GovernanceActorContext,
  candidate: ExternalRoleCatalogSnapshotV1, expected: CatalogActivationExpected,
  source: FmsCatalogCheckpoint['source'] | undefined, requireUnexpired = true, nowMs = Date.now()) {
  if (request.fmsCheckpoint === undefined) return undefined
  if (!actor.employeeId) throw new ApplicationEntitlementError('IDENTITY_REQUIRED')
  return verifyFinancialCatalogCheckpoint(request.fmsCheckpoint, { operationId: request.commandId, principalId: actor.principalId,
    employeeId: actor.employeeId, catalogVersion: candidate.catalogVersion, contentSha256: candidate.contentSha256!,
    artifactSha256: candidate.artifactSha256!, previewHash: request.previewHash, expected }, source, nowMs, requireUnexpired)
}
export async function activateFinancialCatalog(root: string, actor: GovernanceActorContext, release: unknown, request: FinancialCatalogActivationPublishInput,
  options: { handoffSource?: FmsCatalogCheckpoint['source'] } = {}) {
  validateRequest(request)
  if (typeof request.commandId !== 'string' || !request.commandId.trim() || request.commandId.length > 128 ||
    !/^[a-f0-9]{64}$/u.test(request.requestHash) || !/^[a-f0-9]{64}$/u.test(request.previewHash)) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const observed = await readGovernanceStore(root)
  assertActivationAuthority(observed.document, actor)
  const candidate = validateAndNormalizeFinancialCatalogRelease(release, actor)
  if (request.requestHash !== activationRequestHash(candidate, actor, request)) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
  const replay = ownReceipt(observed.document, request.commandId, actor)
  if (replay) {
    const saved = replay.financialCatalogActivation!
    const incoming = checkpoint(request, actor, candidate, { governanceRevision: saved.governanceRevisionBefore,
      assignmentVersion: saved.assignmentVersionBefore, catalogBindingRevision: saved.catalogBindingRevisionBefore,
      grantRevision: saved.grantRevisionBefore }, options.handoffSource, false)
    if (publicationSnapshotHash(incoming ?? null) !== publicationSnapshotHash(saved.fmsCheckpoint ?? null))
      throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
    if (replay.requestHash !== request.requestHash || replay.previewHash !== request.previewHash ||
      replay.financialCatalogActivation?.catalogVersion !== candidate.catalogVersion ||
      replay.financialCatalogActivation?.contentSha256 !== candidate.contentSha256 ||
      replay.financialCatalogActivation?.artifactSha256 !== candidate.artifactSha256) throw new ApplicationEntitlementError('COMMAND_ID_CONFLICT')
    return { ...replay, replayed: true }
  }
  const committed = await commitGovernanceMutation(root, request.expectedGovernanceRevision, async (current, source) => {
    assertActivationAuthority(current.document, actor)
    assertExpectedRevisions(request, current.revision, source.workspaceRevision)
    const calculated = preview(current.document, source.workspaceRevision, candidate, actor, request)
    if (calculated.requestHash !== request.requestHash) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
    if (calculated.previewHash !== request.previewHash) throw new ApplicationEntitlementError('PREVIEW_HASH_CONFLICT')
    if (!calculated.compatible) throw new ApplicationEntitlementError('CATALOG_INCOMPATIBLE')
    if (calculated.alreadyActive) throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
    const admittedAt = Date.now()
    const acceptedCheckpoint = checkpoint(request, actor, candidate, calculated.expected, options.handoffSource, true, admittedAt)
    const proof = actorProof(current.document, actor, admittedAt)
    const priorReleases = current.document.publishedVersions.filter(version => version.kind === 'assignment-governance-v3')
      .flatMap(version => version.externalRoleCatalogs).filter(catalog => catalog.applicationId === FINANCIAL_APPLICATION_ID && catalog.catalogVersion === candidate.catalogVersion)
    if (priorReleases.some(catalog => catalog.contentSha256 !== candidate.contentSha256 || catalog.artifactSha256 !== candidate.artifactSha256))
      throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
    const at = new Date().toISOString(), aiPdm = await readActiveAiPdmRoleCatalog(root)
    const nextDraft = { ...current.document.draft, roleAssignments: rebaseFinancialCatalogAssignments(current.document, candidate), updatedAt: at }
    let document = publishFinancialPolicy(current.document, nextDraft, [aiPdm, candidate], source, actor, request.reason.trim(), at)
    const published = document.publishedVersions.at(-1)!
    const activation: RecordProof = { contractVersion: 'orgmaster.fms-catalog-activation-record.v1', principalId: actor.principalId,
      ...proof, catalogVersion: candidate.catalogVersion, contentSha256: candidate.contentSha256!, artifactSha256: candidate.artifactSha256!,
      governanceRevisionBefore: current.revision, organizationRevision: source.workspaceRevision,
      assignmentVersionBefore: current.document.activePolicyVersionId!, catalogBindingRevisionBefore: calculated.expected.catalogBindingRevision,
      grantRevisionBefore: calculated.expected.grantRevision, assignmentVersionAfter: published.id, publishedSnapshotHash: published.snapshotHash,
      ...(acceptedCheckpoint ? { fmsCheckpoint: acceptedCheckpoint } : {}) }
    document = appendGovernanceAudit(document, { commandId: request.commandId, reason: request.reason.trim(), type: ACTIVATE }, actor,
      { action: ACTIVATE, entityType: 'financialCatalogRelease', entityId: candidate.catalogVersion, beforeHash: current.document.activePolicyVersionId,
        afterHash: publicationSnapshotHash({ requestHash: calculated.requestHash, previewHash: calculated.previewHash, record: activation }) }, at)
    const auditReference = document.auditEvents.at(-1)!.id
    document = appendGovernanceAudit(document, { commandId: randomUUID(), reason: request.reason.trim(), type: 'PUBLISH_ASSIGNMENTS' }, actor,
      { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: published.id, beforeHash: current.document.activePolicyVersionId, afterHash: published.snapshotHash }, at)
    const receipt: GovernanceCommandReceiptV2 = { contractVersion: 'orgmaster.governance-command-receipt.v2', commandId: request.commandId,
      requestHash: calculated.requestHash, previewHash: calculated.previewHash, receiptStatus: 'applied', acceptedAt: at, terminalAt: at,
      decisionCode: 'COMMAND_APPLIED', auditReference, securityAlertReference: null, sessionRefresh: 'pending',
      governanceRevision: published.id, replayed: false, attempt: 1, financialCatalogActivation: activation }
    return { document: { ...document, commandReceipts: [...document.commandReceipts, receipt] },
      reasonCode: ACTIVATE, updatedBy: actor.principalId, validationCatalogs: [aiPdm, candidate] }
  }, actor, document => assertActivationAuthority(document, actor))
  const receipt = ownReceipt(committed.document, request.commandId, actor)
  if (!receipt) throw new ApplicationEntitlementError('COMMAND_NOT_OBSERVED')
  return receipt
}
export async function readFinancialCatalogActivationReceipt(root: string, actor: GovernanceActorContext, commandId: string) {
  if (typeof commandId !== 'string' || !commandId.trim() || commandId.length > 128) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const current = await readGovernanceStore(root)
  assertFinancialAuthority(current.document, actor, 'financial-management-system.catalog.read')
  return ownReceipt(current.document, commandId, actor) ?? {
    contractVersion: 'orgmaster.governance-command-receipt.v2' as const, commandId, requestHash: '', previewHash: '',
    receiptStatus: 'not_found' as const, acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND', auditReference: null,
    securityAlertReference: null, sessionRefresh: 'pending' as const, governanceRevision: current.revision, replayed: false, attempt: 0 }
}
