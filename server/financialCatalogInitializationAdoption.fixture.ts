import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'
import { appendGovernanceAudit, ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { FINANCIAL_ADMINISTRATIVE_CAPABILITIES, FINANCIAL_ROLE_IDS } from '../src/governance/financialCatalog'
import { GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { buildOrganizationSnapshot } from '../src/governance/validation'
import { validateAndNormalizeFinancialCatalogRelease, type FmsCatalogReleaseInput } from './financialCatalogReleaseStore'
import type { GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import type { FinancialCatalogInitializationOwnerReader } from './financialCatalogInitializationAdoption'
export const initializationOperationId = '10000000-0000-4000-8000-000000000070'
export function isolatedCatalogRelease(actor: GovernanceActorContext, admin: boolean, transform?: (roles: Record<string, unknown>[]) => void): FmsCatalogReleaseInput {
  const roles: Record<string, unknown>[] = FINANCIAL_ROLE_IDS.filter(id => admin || id !== 'role-system-admin').map(id => ({ stableRoleId: id,
    code: id.slice(5), displayName: id === 'role-system-admin' ? '系統管理員' : id, builtIn: true,
    capabilityIds: id === 'role-system-admin' ? [...FINANCIAL_ADMINISTRATIVE_CAPABILITIES] : ['finance.dashboard.view'],
    allowedScopeKinds: ['workspace'], assignmentPolicy: 'open' }))
  roles.push({ stableRoleId: 'role-custom', code: 'custom', displayName: '自訂角色', builtIn: false, capabilityIds: [], allowedScopeKinds: ['workspace'], assignmentPolicy: 'existing_only' })
  transform?.(roles)
  const ordered = roles.map(role => ({ ...role, roleDefinitionHash: publicationSnapshotHash(role) })).sort((a, b) => String(a.stableRoleId).localeCompare(String(b.stableRoleId)))
  const createdAt = '2026-11-05T00:00:00.000Z'
  const catalog = { formatVersion: 'jf.configuration-catalog.v1', applicationId: 'financial-management-system', catalogVersion: admin ? 'fms.isolated.after' : 'fms.isolated.before', registryVersion: 'fms.registry.v1', roles: ordered,
    publishedAt: createdAt, publishedBy: { principalId: actor.principalId, employeeId: actor.employeeId } }
  // commandRequestHash uses the same canonical JSON as the owner-normalized format.
  const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}' : JSON.stringify(value)
  const artifactUtf8 = canonical(catalog) + '\n'
  return { applicationId: catalog.applicationId, version: catalog.catalogVersion, contentSha256: publicationSnapshotHash(catalog), artifactSha256: createHash('sha256').update(artifactUtf8).digest('hex'), artifactUtf8,
    sourceDraftId: admin ? 'actual-isolated-init-draft' : 'actual-isolated-baseline-draft', sourceDraftRevision: 2, createdBy: catalog.publishedBy as { principalId: string; employeeId: string }, createdAt }
}
export async function persistInitializationFixture(root: string, document: GovernanceDocumentV3, catalog?: ReturnType<typeof validateAndNormalizeFinancialCatalogRelease>) {
  const source = await loadOrganizationSource(root)
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
  const prior = document.publishedVersions.find(item => item.id === document.activePolicyVersionId)
  const payload = { kind: 'assignment-governance-v3' as const, effectState: 'not-synchronized' as const, policy,
    externalRoleCatalogs: catalog ? [readAiPdmRoleCatalog(), catalog] : prior!.kind === 'assignment-governance-v3' ? prior!.externalRoleCatalogs : [], organizationSnapshot: buildOrganizationSnapshot(source) }
  const id = 'isolated-' + randomUUID(), snapshotHash = publicationSnapshotHash(payload)
  document.publishedVersions.push({ ...payload, id, versionNumber: document.publishedVersions.length + 1, publishedAt: new Date().toISOString(), publishedByPrincipalId: 'isolated-fixture', publishReason: 'isolated fixture', hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash })
  document.activePolicyVersionId = id; document.draft.basePolicyVersionId = id
  document = appendGovernanceAudit(document, { commandId: randomUUID(), reason: 'isolated fixture', type: 'PUBLISH_ASSIGNMENTS' },
    { principalId: 'isolated-fixture', employeeId: null, issuer: 'fixture', subject: 'fixture', bootstrap: true },
    { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: id, beforeHash: null, afterHash: snapshotHash })
  await writeFile(getGovernancePaths(root).current, JSON.stringify(document, null, 2) + '\n')
}
export async function setupCatalogInitializationFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dev070-root-catalog-'))
  await writeSyntheticWorkspaceFixture(root); await ensureGovernanceStore(root)
  const current = await readGovernanceStore(root), source = await loadOrganizationSource(root), employeeId = source.state.employees[0].id
  const actor: GovernanceActorContext = { principalId: 'root-only', employeeId, issuer: 'https://issuer.invalid', subject: 'root-only', bootstrap: false,
    sessionId: randomUUID(), assuranceLevel: 'aal1', principalAuthEpoch: 0, authenticatedAt: new Date(Date.now() - 1000).toISOString() }
  current.document.draft.identityLinks = [{ id: 'identity-root', principalId: actor.principalId, employeeId, issuer: actor.issuer, subject: actor.subject, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }]
  const { issuerFingerprintSha256, principalFingerprintSha256 } = await import('../src/governance/identityAdmission')
  current.document.draft.principalAdmissions = [{ id: 'root-admission', identityLinkId: 'identity-root', accountType: 'human_personal', status: 'active', sharedRetirementState: 'not_applicable',
    principalFingerprintSha256: principalFingerprintSha256(actor.issuer, actor.subject), issuerFingerprintSha256: issuerFingerprintSha256(actor.issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt: '2026-01-01T00:00:00.000Z' }]
  current.document.draft.administration = { contractVersion: 'orgmaster.administration-policy.v1', version: 1, initializedByCommandId: randomUUID(), grants: [null, 'orgmaster'].map(applicationId => ({
    id: randomUUID(), principalId: actor.principalId, employeeId, roleCode: applicationId ? 'application_system_admin' : 'platform_super_admin', applicationId: applicationId as 'orgmaster' | null,
    subjectKind: 'principal', basis: 'manual', scope: { kind: applicationId ? 'global' : 'platform' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    createdBy: { kind: 'owner_workload', id: 'isolated-owner' }, reason: 'isolated fixture', catalogBinding: applicationId ? { catalogVersion: 'orgmaster.system-admin.v1', contentSha256: 'a'.repeat(64), stableRoleId: 'role-orgmaster-admin', roleDefinitionHash: 'b'.repeat(64) } : null })) }
  const previousRelease = isolatedCatalogRelease(actor, false), release = isolatedCatalogRelease(actor, true)
  await persistInitializationFixture(root, current.document, validateAndNormalizeFinancialCatalogRelease(previousRelease, actor))
  const ownerReader: FinancialCatalogInitializationOwnerReader = { read: async () => ({ source: 'local_test', operationId: initializationOperationId, publishReceiptId: initializationOperationId + ':catalog.publish', receiptBodySha256: 'c'.repeat(64), readAt: new Date().toISOString(), previousRelease, release }) }
  const active = await readGovernanceStore(root)
  return { root, actor, previousRelease, release, ownerReader, options: { initializationOwnerReader: ownerReader, handoffSource: 'local_test' as const },
    request: { reason: '採用固定管理角色', expectedGovernanceRevision: active.revision, expectedOrganizationRevision: source.workspaceRevision, initializationOperationId } }
}
