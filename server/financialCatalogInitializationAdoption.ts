import { administrationPolicy, assertPlatformAdministrator, assertRecentAdministrativeAuthentication, publishedAdministrationPolicy } from '../src/governance/administration'
import { FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH, FINANCIAL_ROLE_IDS } from '../src/governance/financialCatalog'
import type { ExternalRoleCatalogSnapshotV1, GovernanceActorContext, GovernanceDocumentV3, GovernanceOrgSource } from '../src/governance/types'
import { ApplicationEntitlementError, commandRequestHash } from './applicationEntitlementCommon'
import { validateAndNormalizeFinancialCatalogRelease, type FmsCatalogReleaseInput } from './financialCatalogReleaseStore'
import type { FmsCatalogCheckpoint } from './financialCatalogIntent'

/** Implemented by the FMS owner adapter. Browser JSON and postMessage are never this reader. */
export interface FinancialCatalogInitializationOwnerReader {
  read(input: { operationId: string; principalId: string; employeeId: string; authenticatedAt: string; assuranceLevel: 'aal1' | 'aal2'; principalAuthEpoch: number;
    catalogVersion: string; contentSha256: string; artifactSha256: string;
    sourceDraftId: string; sourceDraftRevision: number }): Promise<{
      source: FmsCatalogCheckpoint['source']; operationId: string; publishReceiptId: string; readAt: string;
      receiptBodySha256: string;
      release: FmsCatalogReleaseInput; previousRelease: FmsCatalogReleaseInput
    } | null>
}
export type FinancialCatalogInitializationActorProof = {
  kind: 'platform_root_catalog_initialization'; rootGrantId: string; administrationVersion: number;
  sourceRoleDefinitionHash: string; initializationOperationId: string; initializationReceiptId: string; receiptBodySha256: string; source: FmsCatalogCheckpoint['source']
}
type Proof = { actorProof: FinancialCatalogInitializationActorProof; bindingHash: string; principalId: string; employeeId: string; expiresAt: number }
const issued = new WeakSet<object>()
const unavailable = (): never => { throw new ApplicationEntitlementError('FINANCIAL_CATALOG_UNAVAILABLE') }
const incompatible = (): never => { throw new ApplicationEntitlementError('CATALOG_INCOMPATIBLE') }
export function catalogInitializationRoot(document: GovernanceDocumentV3, source: GovernanceOrgSource, actor: GovernanceActorContext, at = new Date().toISOString()) {
  const policy = publishedAdministrationPolicy(document)
  try {
    if (!policy || actor.bootstrap || !Number.isSafeInteger(actor.principalAuthEpoch) || Number(actor.principalAuthEpoch) < 0) unavailable()
    assertRecentAdministrativeAuthentication(actor, at)
    assertPlatformAdministrator(policy!, source, actor, at)
  } catch { throw new ApplicationEntitlementError('APP_MANAGEMENT_GRANT_REQUIRED') }
  const administration = administrationPolicy(policy!)
  return { administrationVersion: administration.version, rootGrantId: administration.grants.find(grant => grant.roleCode === 'platform_super_admin'
    && grant.principalId === actor.principalId && grant.employeeId === actor.employeeId && grant.status === 'active' && grant.validFrom <= at)!.id }
}
const definition = (role: ExternalRoleCatalogSnapshotV1['roles'][number]) => ({
  stableRoleId: role.stableRoleId, code: role.code, displayName: role.displayName, status: role.status,
  builtIn: role.builtIn, capabilityIds: role.capabilityIds, allowedScopeKinds: role.allowedScopeKinds,
  assignmentPolicy: role.assignmentPolicy, roleDefinitionHash: role.roleDefinitionHash,
})
export function assertFinancialCatalogInitializationDelta(before: ExternalRoleCatalogSnapshotV1, candidate: ExternalRoleCatalogSnapshotV1) {
  if (before.roles.some(role => role.stableRoleId === 'role-system-admin') || candidate.sourceKind !== 'application-contract'
    || !FINANCIAL_ROLE_IDS.filter(id => id !== 'role-system-admin').every(id => before.roles.some(role => role.stableRoleId === id))
    || candidate.roles.length !== before.roles.length + 1) incompatible()
  for (const role of before.roles) {
    const next = candidate.roles.find(item => item.stableRoleId === role.stableRoleId)
    if (!next || commandRequestHash(definition(role)) !== commandRequestHash(definition(next))) incompatible()
  }
  const added = candidate.roles.filter(role => !before.roles.some(item => item.stableRoleId === role.stableRoleId))
  if (added.length !== 1 || added[0].stableRoleId !== 'role-system-admin' || added[0].roleDefinitionHash !== FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH) incompatible()
}
/** This proof can only be minted from a fresh root and the configured owner's immutable operation readback. */
export async function createFinancialCatalogInitializationAdoptionProof(input: {
  document: GovernanceDocumentV3; source: GovernanceOrgSource; actor: GovernanceActorContext;
  currentCatalog: ExternalRoleCatalogSnapshotV1; candidate: ExternalRoleCatalogSnapshotV1;
  ownerReader?: FinancialCatalogInitializationOwnerReader; handoffSource?: FmsCatalogCheckpoint['source']; operationId?: string; nowMs?: number
}): Promise<Proof> {
  const { document, source, actor, candidate, currentCatalog } = input, now = input.nowMs ?? Date.now()
  const root = catalogInitializationRoot(document, source, actor, new Date(now).toISOString())
  if (!input.ownerReader || !input.handoffSource || !actor.employeeId || !input.operationId || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(input.operationId)
    || currentCatalog.roles.some(role => role.stableRoleId === 'role-system-admin')) unavailable()
  let readback: Awaited<ReturnType<FinancialCatalogInitializationOwnerReader['read']>>
  try { readback = await input.ownerReader!.read({ operationId: input.operationId!, principalId: actor.principalId, employeeId: actor.employeeId!,
      authenticatedAt: actor.authenticatedAt!, assuranceLevel: actor.assuranceLevel!, principalAuthEpoch: actor.principalAuthEpoch!,
      catalogVersion: candidate.catalogVersion, contentSha256: candidate.contentSha256!, artifactSha256: candidate.artifactSha256!,
      sourceDraftId: candidate.sourceDraftId!, sourceDraftRevision: candidate.sourceDraftRevision! }) }
  catch { return unavailable() }
  const receivedAt = input.nowMs ?? Date.now()
  if (!readback || readback.source !== input.handoffSource || readback.operationId !== input.operationId || !readback.publishReceiptId || !/^[a-f0-9]{64}$/u.test(readback.receiptBodySha256)
    || !Number.isFinite(Date.parse(readback.readAt)) || receivedAt - Date.parse(readback.readAt) < 0 || receivedAt - Date.parse(readback.readAt) > 10_000 || receivedAt - now > 10_000) unavailable()
  const normalizeOwnerRelease = (release: FmsCatalogReleaseInput, publisher: GovernanceActorContext) => {
    try { return validateAndNormalizeFinancialCatalogRelease(release, publisher) } catch { return unavailable() }
  }
  const actual = normalizeOwnerRelease(readback!.release, actor)
  if (commandRequestHash(actual) !== commandRequestHash(candidate)) throw new ApplicationEntitlementError('CATALOG_BINDING_CONFLICT')
  const previous = readback!.previousRelease
  if (!previous?.createdBy) unavailable()
  const baseline = normalizeOwnerRelease(previous, { ...actor, principalId: previous.createdBy.principalId, employeeId: previous.createdBy.employeeId })
  assertFinancialCatalogInitializationDelta(baseline, candidate)
  if (currentCatalog.sourceKind === 'application-contract') assertFinancialCatalogInitializationDelta(currentCatalog, candidate)
  else {
    // The old six-role fixture has no capability definitions. The owner's pinned baseline supplies those;
    // the accepted fixture still has to match every visible identity/status and contain no custom role.
    if (currentCatalog.catalogVersion !== 'financial-management-system.role-catalog.2026-09-03.v1' || currentCatalog.roles.length !== baseline.roles.length) incompatible()
    for (const role of currentCatalog.roles) {
      const old = baseline.roles.find(value => value.stableRoleId === role.stableRoleId)
      if (!old || ['code', 'displayName', 'status', 'subjectKind'].some(key => role[key as keyof typeof role] !== old[key as keyof typeof old])) incompatible()
    }
  }
  const proof: Proof = { actorProof: { kind: 'platform_root_catalog_initialization', ...root,
    sourceRoleDefinitionHash: FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH, initializationOperationId: readback!.operationId,
    initializationReceiptId: readback!.publishReceiptId, receiptBodySha256: readback!.receiptBodySha256, source: readback!.source }, bindingHash: commandRequestHash(candidate),
    principalId: actor.principalId, employeeId: actor.employeeId!, expiresAt: Math.min(now + 10_000, Date.parse(actor.authenticatedAt!) + 300_000) }
  issued.add(proof)
  Object.freeze(proof.actorProof)
  return Object.freeze(proof)
}
export function assertFinancialCatalogInitializationProof(proof: Proof, candidate: ExternalRoleCatalogSnapshotV1, actor: GovernanceActorContext, nowMs = Date.now()) {
  if (!issued.has(proof) || nowMs >= proof.expiresAt || proof.principalId !== actor.principalId || proof.employeeId !== actor.employeeId
    || proof.bindingHash !== commandRequestHash(candidate)) unavailable()
  return proof.actorProof
}
