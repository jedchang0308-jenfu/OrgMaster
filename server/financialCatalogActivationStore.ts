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
import { assertFinancialCatalogInitializationProof, catalogInitializationRoot, createFinancialCatalogInitializationAdoptionProof, type FinancialCatalogInitializationOwnerReader, type FinancialCatalogInitializationActorProof } from './financialCatalogInitializationAdoption'
import { currentPersistenceTransactionDatabase, usesCloudSqlPersistence, withPersistenceTransaction } from './orgmasterPersistenceRepository'
import { withAdministrativePrincipalSource } from './orgmasterAdministrationIdentity'
import type { GovernanceOrgSource } from '../src/governance/types'

const ACTIVATE = 'financial_catalog_activate'
const OPERATIONS = ['financial-management-system.catalog.import', 'financial-management-system.catalog.publish', 'financial-management-system.catalog.activate'] as const
type RecordProof = NonNullable<GovernanceCommandReceiptV2['financialCatalogActivation']>
/** Trusted server composition only. HTTP request parsing never accepts an IO port. */
export type FinancialCatalogActivationPersistence = { read: typeof readGovernanceStore; source: typeof loadOrganizationSource; commit: typeof commitGovernanceMutation }
const persistenceDefault: FinancialCatalogActivationPersistence = { read: readGovernanceStore, source: loadOrganizationSource, commit: commitGovernanceMutation }
export type FinancialCatalogActivationOptions = { handoffSource?: FmsCatalogCheckpoint['source']; initializationOwnerReader?: FinancialCatalogInitializationOwnerReader; persistence?: FinancialCatalogActivationPersistence }
async function sourceWithAdmission(source: GovernanceOrgSource) {
  return usesCloudSqlPersistence() ? withPersistenceTransaction(() => withAdministrativePrincipalSource(source, currentPersistenceTransactionDatabase())) : source
}
function normalActivation(document: GovernanceDocumentV3, actor: GovernanceActorContext) {
  return OPERATIONS.every(operation => hasFinancialManagementGrant(document, actor, operation))
}
function assertCatalogReader(document: GovernanceDocumentV3, source: GovernanceOrgSource, actor: GovernanceActorContext) {
  if (hasFinancialManagementGrant(document, actor, OPERATIONS[0])) assertFinancialAuthority(document, actor, OPERATIONS[0])
  else catalogInitializationRoot(document, source, actor)
}
async function initializationProof(document: GovernanceDocumentV3, source: GovernanceOrgSource, actor: GovernanceActorContext,
  candidate: ExternalRoleCatalogSnapshotV1, options: FinancialCatalogActivationOptions, operationId?: string) {
  if (normalActivation(document, actor)) { assertActivationAuthority(document, actor); return undefined }
  return createFinancialCatalogInitializationAdoptionProof({ document, source, actor, currentCatalog: currentCatalog(document),
    candidate, ownerReader: options.initializationOwnerReader, handoffSource: options.handoffSource, operationId })
}
export type FinancialCatalogActivationInput = {
  reason: string
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
  initializationOperationId?: string
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
    candidate: binding(candidate), sourceDraftId: candidate.sourceDraftId, sourceDraftRevision: candidate.sourceDraftRevision,
    ...(request.initializationOperationId ? { initializationOperationId: request.initializationOperationId } : {}) })
}
function preview(document: GovernanceDocumentV3, organizationRevision: string, candidate: ExternalRoleCatalogSnapshotV1,
  actor: GovernanceActorContext, request: FinancialCatalogActivationInput, rootProof?: FinancialCatalogInitializationActorProof) {
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
    ...(rootProof ? { initializationAdoption: rootProof } : {}),
  }
  return { applicationId: FINANCIAL_APPLICATION_ID, requestHash, previewHash: commandRequestHash({ requestHash, impact }), ...impact,
    allowedOperations: { activate: !alreadyActive && removedAssignedRoleIds.length === 0 && (!!rootProof || normalActivation(document, actor)) } }
}
export async function readFinancialCatalogActivationWorkspace(root: string, actor: GovernanceActorContext, options: FinancialCatalogActivationOptions = {}) {
  const persistence = options.persistence ?? persistenceDefault
  const current = await persistence.read(root)
  const source = await sourceWithAdmission(await persistence.source(root))
  assertCatalogReader(current.document, source, actor)
  let initializationAvailable = false
  try { catalogInitializationRoot(current.document, source, actor); initializationAvailable = !currentCatalog(current.document).roles.some(role => role.stableRoleId === 'role-system-admin') } catch { /* Ordinary catalog grants remain independent. */ }
  return { applicationId: FINANCIAL_APPLICATION_ID, governanceRevision: current.revision, organizationRevision: source.workspaceRevision,
    fmsOrigin: readFinancialCatalogPeerOrigin(),
    assignmentVersion: current.document.activePolicyVersionId, activeCatalog: binding(currentCatalog(current.document)),
    initializationAdoption: initializationAvailable ? { status: options.initializationOwnerReader && options.handoffSource ? 'ready' : 'owner_readback_unavailable', fixedRoleId: 'role-system-admin' } : null,
    allowedOperations: { preview: true, activate: normalActivation(current.document, actor) || initializationAvailable && !!options.initializationOwnerReader && !!options.handoffSource } }
}
export async function previewFinancialCatalogActivation(root: string, actor: GovernanceActorContext, release: unknown, request: FinancialCatalogActivationInput, options: FinancialCatalogActivationOptions = {}) {
  validateRequest(request)
  const persistence = options.persistence ?? persistenceDefault
  const current = await persistence.read(root)
  const source = await sourceWithAdmission(await persistence.source(root))
  assertCatalogReader(current.document, source, actor)
  assertExpectedRevisions(request, current.revision, source.workspaceRevision)
  const candidate = validateAndNormalizeFinancialCatalogRelease(release, actor)
  const rootProof = hasFinancialManagementGrant(current.document, actor, OPERATIONS[0]) ? undefined : await initializationProof(current.document, source, actor, candidate, options, request.initializationOperationId)
  // Legacy users may preview without all three grants, but a root-only preview needs the owner proof.
  return preview(current.document, source.workspaceRevision, candidate, actor, request, rootProof?.actorProof)
}
function ownReceipt(document: GovernanceDocumentV3, commandId: string, actor: GovernanceActorContext) {
  const receipt = document.commandReceipts.find(item => item.commandId === commandId)
  if (!receipt) return null
  const proof = receipt.financialCatalogActivation
  const event = document.auditEvents.find(item => item.id === receipt.auditReference && item.commandId === commandId &&
    item.action === ACTIVATE && item.entityType === 'financialCatalogRelease')
  const published = proof && document.publishedVersions.find(item => item.id === proof.assignmentVersionAfter && item.kind === 'assignment-governance-v3')
  if (!proof || !(proof.contractVersion === 'orgmaster.fms-catalog-activation-record.v1' && !proof.actorProof ||
    proof.contractVersion === 'orgmaster.fms-catalog-initialization-activation-record.v1' && proof.actorProof?.kind === 'platform_root_catalog_initialization' && !Object.hasOwn(proof, 'grantIds')) || !event ||
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
  options: FinancialCatalogActivationOptions = {}) {
  validateRequest(request)
  if (typeof request.commandId !== 'string' || !request.commandId.trim() || request.commandId.length > 128 ||
    !/^[a-f0-9]{64}$/u.test(request.requestHash) || !/^[a-f0-9]{64}$/u.test(request.previewHash)) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const persistence = options.persistence ?? persistenceDefault
  const observed = await persistence.read(root)
  const observedSource = await sourceWithAdmission(await persistence.source(root))
  assertCatalogReader(observed.document, observedSource, actor)
  const candidate = validateAndNormalizeFinancialCatalogRelease(release, actor)
  if (request.requestHash !== activationRequestHash(candidate, actor, request)) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
  const replay = ownReceipt(observed.document, request.commandId, actor)
  if (replay) {
    const saved = replay.financialCatalogActivation!
    if (saved.actorProof?.kind === 'platform_root_catalog_initialization') catalogInitializationRoot(observed.document, observedSource, actor)
    else assertActivationAuthority(observed.document, actor)
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
  const committed = await persistence.commit(root, request.expectedGovernanceRevision, async (current, source) => {
    const admittedSource = await sourceWithAdmission(source)
    const rootProof = await initializationProof(current.document, admittedSource, actor, candidate, options, request.initializationOperationId)
    assertExpectedRevisions(request, current.revision, source.workspaceRevision)
    const calculated = preview(current.document, source.workspaceRevision, candidate, actor, request, rootProof?.actorProof)
    if (calculated.requestHash !== request.requestHash) throw new ApplicationEntitlementError('REQUEST_HASH_CONFLICT')
    if (calculated.previewHash !== request.previewHash) throw new ApplicationEntitlementError('PREVIEW_HASH_CONFLICT')
    if (!calculated.compatible) throw new ApplicationEntitlementError('CATALOG_INCOMPATIBLE')
    if (calculated.alreadyActive) throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
    const admittedAt = Date.now()
    if (rootProof && request.fmsCheckpoint !== undefined) throw new ApplicationEntitlementError('INVALID_COMMAND')
    const acceptedCheckpoint = checkpoint(request, actor, candidate, calculated.expected, options.handoffSource, true, admittedAt)
    const normalProof = actorProof(current.document, actor, admittedAt)
    const { grantIds: _unused, ...authentication } = normalProof
    const proof = rootProof ? { ...authentication, actorProof: assertFinancialCatalogInitializationProof(rootProof, candidate, actor, admittedAt) } : normalProof
    const priorReleases = current.document.publishedVersions.filter(version => version.kind === 'assignment-governance-v3')
      .flatMap(version => version.externalRoleCatalogs).filter(catalog => catalog.applicationId === FINANCIAL_APPLICATION_ID && catalog.catalogVersion === candidate.catalogVersion)
    if (priorReleases.some(catalog => catalog.contentSha256 !== candidate.contentSha256 || catalog.artifactSha256 !== candidate.artifactSha256))
      throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
    const at = new Date().toISOString()
    const catalogs = rootProof ? current.document.publishedVersions.find(version => version.id === current.document.activePolicyVersionId)!
      : null
    const validationCatalogs = catalogs?.kind === 'assignment-governance-v3'
      ? catalogs.externalRoleCatalogs.map(catalog => catalog.applicationId === FINANCIAL_APPLICATION_ID ? candidate : catalog)
      : [await readActiveAiPdmRoleCatalog(root), candidate]
    const draft = current.document.draft
    const publicationBase = rootProof ? { ...current.document, draft: { ...draft, roleAssignments: currentPublishedPolicyV3(current.document)!.roleAssignments } } : current.document
    const nextDraft = { ...publicationBase.draft, roleAssignments: rebaseFinancialCatalogAssignments(publicationBase, candidate), updatedAt: at }
    let document = publishFinancialPolicy(publicationBase, nextDraft, validationCatalogs, source, actor, request.reason.trim(), at)
    if (rootProof) document.draft = { ...draft, roleAssignments: rebaseFinancialCatalogAssignments(current.document, candidate), basePolicyVersionId: document.activePolicyVersionId, updatedAt: at }
    const published = document.publishedVersions.at(-1)!
    const activation = { contractVersion: rootProof ? 'orgmaster.fms-catalog-initialization-activation-record.v1' : 'orgmaster.fms-catalog-activation-record.v1', principalId: actor.principalId,
      ...proof, catalogVersion: candidate.catalogVersion, contentSha256: candidate.contentSha256!, artifactSha256: candidate.artifactSha256!,
      governanceRevisionBefore: current.revision, organizationRevision: source.workspaceRevision,
      assignmentVersionBefore: current.document.activePolicyVersionId!, catalogBindingRevisionBefore: calculated.expected.catalogBindingRevision,
      grantRevisionBefore: calculated.expected.grantRevision, assignmentVersionAfter: published.id, publishedSnapshotHash: published.snapshotHash,
      ...(acceptedCheckpoint ? { fmsCheckpoint: acceptedCheckpoint } : {}) } as RecordProof
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
      reasonCode: ACTIVATE, updatedBy: actor.principalId, validationCatalogs }
  }, actor, document => normalActivation(document, actor) ? assertActivationAuthority(document, actor) : catalogInitializationRoot(document, observedSource, actor))
  const receipt = ownReceipt(committed.document, request.commandId, actor)
  if (!receipt) throw new ApplicationEntitlementError('COMMAND_NOT_OBSERVED')
  return receipt
}
export async function readFinancialCatalogActivationReceipt(root: string, actor: GovernanceActorContext, commandId: string, options: FinancialCatalogActivationOptions = {}) {
  if (typeof commandId !== 'string' || !commandId.trim() || commandId.length > 128) throw new ApplicationEntitlementError('INVALID_COMMAND')
  const persistence = options.persistence ?? persistenceDefault
  const current = await persistence.read(root)
  if (hasFinancialManagementGrant(current.document, actor, 'financial-management-system.catalog.read')) assertFinancialAuthority(current.document, actor, 'financial-management-system.catalog.read')
  else catalogInitializationRoot(current.document, await sourceWithAdmission(await persistence.source(root)), actor)
  return ownReceipt(current.document, commandId, actor) ?? {
    contractVersion: 'orgmaster.governance-command-receipt.v2' as const, commandId, requestHash: '', previewHash: '',
    receiptStatus: 'not_found' as const, acceptedAt: null, terminalAt: null, decisionCode: 'COMMAND_NOT_FOUND', auditReference: null,
    securityAlertReference: null, sessionRefresh: 'pending' as const, governanceRevision: current.revision, replayed: false, attempt: 0 }
}
