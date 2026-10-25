import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { createAiPdmRoleCatalog, readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { buildOrganizationSnapshot } from '../src/governance/validation'
import { privilegedRequestHash } from '../src/governance/privilegedAssignments'
import { GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import type { ExternalRoleCatalogSnapshotV1 } from '../src/governance/types'
import { appendGovernanceAudit, ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { previewPrivilegedAssignment, publishPrivilegedAssignment } from './privilegedAssignmentStore'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'
import { storedGovernanceCatalogs } from './governanceReduction'
import { AI_PDM_ROLE_CATALOG_V7_VERSION, readPublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import { decodeDynamicAiPdmRoleCatalog } from './aiPdmDynamicRoleCatalog'
import vectors from '../config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json'

const catalogOverride = vi.hoisted(() => ({ value: undefined as ExternalRoleCatalogSnapshotV1 | undefined }))
vi.mock('./applicationRoleCatalogRegistry', async importOriginal => {
  const original = await importOriginal<typeof import('./applicationRoleCatalogRegistry')>()
  return {
    ...original,
    readActiveAiPdmRoleCatalog: async (...args: Parameters<typeof original.readActiveAiPdmRoleCatalog>) =>
      catalogOverride.value ?? original.readActiveAiPdmRoleCatalog(...args),
    readApplicationRoleCatalogs: async (...args: Parameters<typeof original.readApplicationRoleCatalogs>) =>
      catalogOverride.value ? [catalogOverride.value] : original.readApplicationRoleCatalogs(...args),
  }
})

const roots: string[] = []

beforeEach(() => { catalogOverride.value = undefined })
afterEach(async () => { catalogOverride.value = undefined; await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev009-store-'))
  roots.push(root)
  await writeSyntheticWorkspaceFixture(root)
  return root
}

function dynamicCatalogFixture() {
  const vector = vectors[2]
  const policy = vector.policy
  return { vector, rows: policy.roles.map((role, index) => ({
    contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm',
    catalog_version: policy.candidateCatalogVersion, catalog_sha256: policy.contentHash,
    published_at: vector.publishedAt, display_order: index, stable_role_id: role.stableRoleId,
    role_code: role.roleCode, display_name: role.displayName, assignable: role.assignable,
    risk: role.risk, subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
    delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
    assignment_tier: role.assignmentTier, metadata: role.metadata, permissions: role.permissions,
    role_definition_hash: role.roleDefinitionHash, role_status: role.roleStatus,
    publication_format: policy.format, canonicalization_version: 'jenfu.canonical-json.v1',
    role_schema_id: policy.roleSchemaId, role_profile_schema_id: policy.roleProfileSchemaId,
    baseline_role_identity_hash: policy.baselineRoleIdentityHash, role_identity_hash: policy.roleIdentityHash,
    registry_hash: policy.registryHash, protected_policy_hash: policy.protectedPolicyHash,
    role_profile_hash: policy.roleProfileHash, permission_role_id: policy.roleProfiles[index].permissionRoleId,
    presentation_name: policy.roleProfiles[index].presentationName, presentation_order: policy.roleProfiles[index].presentationOrder,
    assignment_disposition: policy.roleProfiles[index].assignmentDisposition, lifecycle: 'active',
  })) }
}

describe('privileged assignment store transaction', () => {
  it('publishes one immutable V3 effect with audit, alert and invalidation, then terminal-replays after freshness expires', async () => {
    const root = await fixtureRoot()
    const seeded = await ensureGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const employeeIds = source.state.employees.slice(0, 2).map((employee) => employee.id)
    expect(employeeIds).toHaveLength(2)
    const [actorEmployeeId, targetEmployeeId] = employeeIds
    const issuer = 'https://securetoken.google.com/dev009-fixture'
    const actorSubject = 'actor-subject'
    const targetSubject = 'target-subject'
    const actorPrincipalId = 'principal-override-fixture'
    const targetPrincipalId = 'principal-target-fixture'
    const recordedAt = new Date().toISOString()
    const actorLink = { id: 'link-actor', principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
    const targetLink = { id: 'link-target', principalId: targetPrincipalId, issuer, subject: targetSubject, employeeId: targetEmployeeId, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
    seeded.document.draft.identityLinks = [actorLink, targetLink]
    seeded.document.draft.principalAdmissions = [
      { id: 'admission-actor', identityLinkId: actorLink.id, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(issuer, actorSubject), issuerFingerprintSha256: issuerFingerprintSha256(issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt },
      { id: 'admission-target', identityLinkId: targetLink.id, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(issuer, targetSubject), issuerFingerprintSha256: issuerFingerprintSha256(issuer), evidenceRefSha256: 'b'.repeat(64), recordedAt },
    ]
    seeded.document.draft.managementGrants = [{ id: 'grant-override', principalId: actorPrincipalId, employeeId: actorEmployeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'bootstrap-fixture', reason: 'fixture' }]
    const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(seeded.document.draft)
    seeded.document.publishedVersions.push({ kind: 'assignment-governance-v3', id: 'published-override-fixture',
      versionNumber: 1, publishedAt: recordedAt, publishedByPrincipalId: actorPrincipalId,
      publishReason: 'fixture', snapshotHash: 'fixture', effectState: 'not-synchronized',
      policy, externalRoleCatalogs: [readAiPdmRoleCatalog()], organizationSnapshot: buildOrganizationSnapshot(source) })
    seeded.document.activePolicyVersionId = 'published-override-fixture'
    await writeFile(getGovernancePaths(root).current, `${JSON.stringify(seeded.document, null, 2)}\n`)

    const current = await readGovernanceStore(root)
    const catalog = readAiPdmRoleCatalog()
    const actor = { principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, bootstrap: false }
    const request = {
      operation: 'grant_system_admin' as const, employeeId: targetEmployeeId, principalAdmissionId: 'admission-target',
      applicationId: 'ai-pdm' as const, stableRoleId: 'role-system-admin' as const, reason: 'DEV-009 exact privileged grant',
      expected: { catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.payloadHash, governanceRevision: current.revision, organizationRevision: source.workspaceRevision },
    }
    const preview = await previewPrivilegedAssignment(root, actor, request)
    expect(preview.requestHash).toBe(privilegedRequestHash(actorPrincipalId, request, preview.previewHash))
    const publishRequest = { ...request, commandId: 'command-dev009-grant-1', requestHash: preview.requestHash, previewHash: preview.previewHash }
    const freshSession = { sessionId: 'session-fixture', principalId: actorPrincipalId, assuranceLevel: 'aal1' as const, authenticatedAt: new Date(Date.now() - 60_000).toISOString() }
    const receipt = await publishPrivilegedAssignment(root, actor, freshSession, publishRequest)
    expect(receipt).toMatchObject({ receiptStatus: 'applied', decisionCode: 'COMMAND_APPLIED', replayed: false, sessionRefresh: 'pending' })
    expect(receipt.securityAlertReference).toBeTruthy()

    const persisted = await readGovernanceStore(root)
    expect(persisted.document.publishedVersions.at(-1)?.kind).toBe('assignment-governance-v3')
    expect(persisted.document.draft.roleAssignments.at(-1)).toMatchObject({ employeeId: targetEmployeeId, targetPrincipalId, subjectKind: 'principal', basis: 'manual', validTo: null })
    expect(persisted.document.auditEvents.filter((event) => event.commandId === publishRequest.commandId && event.entityType === 'roleAssignment')).toHaveLength(1)
    const version = persisted.document.publishedVersions.at(-1)!
    const bindingEvents = persisted.document.auditEvents.filter(event =>
      event.entityType === 'assignmentVersion' && event.entityId === version.id && event.afterHash === version.snapshotHash)
    expect(bindingEvents).toHaveLength(1)
    expect(bindingEvents[0].commandId).not.toBe(publishRequest.commandId)
    expect(new Set(persisted.document.auditEvents.map(event => event.commandId)).size).toBe(persisted.document.auditEvents.length)
    expect(persisted.document.auditEvents.find(event => event.id === receipt.auditReference)?.entityType).toBe('roleAssignment')
    expect(() => appendGovernanceAudit(persisted.document,
      { commandId: bindingEvents[0].commandId, type: 'UPSERT_ROLE_ASSIGNMENT', reason: 'reuse visible internal publication id' },
      actor, { action: 'UPSERT_ROLE_ASSIGNMENT', entityType: 'roleAssignment', entityId: null, beforeHash: null, afterHash: null }))
      .toThrowError(expect.objectContaining({ code: 'COMMAND_ID_REUSED' }))
    expect(persisted.document.auditEvents.find((event) => event.commandId === publishRequest.commandId)?.detail?.assuranceLevel).toBe('aal1')
    expect(persisted.document.securityAlertIntents).toHaveLength(1)
    expect(persisted.document.sessionInvalidationOutbox).toHaveLength(1)
    const reordered = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reordered)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)]))
    }
    await writeFile(getGovernancePaths(root).current, JSON.stringify(reordered(persisted.document)))
    expect(storedGovernanceCatalogs((await readGovernanceStore(root)).document)).not.toBeNull()

    const expiredSession = { ...freshSession, authenticatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }
    const replay = await publishPrivilegedAssignment(root, actor, expiredSession, publishRequest)
    expect(replay).toMatchObject({ replayed: true, auditReference: receipt.auditReference, securityAlertReference: receipt.securityAlertReference })
    await expect(publishPrivilegedAssignment(root, actor, expiredSession, { ...publishRequest, requestHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
  })

  it('revokes a prior-catalog system_admin after the active AI-PDM catalog changes', async () => {
    const oldArtifact = await readPublishedAiPdmRoleCatalog(process.cwd(), AI_PDM_ROLE_CATALOG_V7_VERSION)
    const oldCatalog = createAiPdmRoleCatalog('valid', oldArtifact.publishedAt, oldArtifact)
    catalogOverride.value = oldCatalog
    const root = await fixtureRoot()
    const seeded = await ensureGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const actorEmployeeId = source.state.employees[0].id
    const issuer = 'https://securetoken.google.com/dev058-fixture'
    const actorSubject = 'actor-subject'
    const actorPrincipalId = 'principal-override-fixture'
    const recordedAt = new Date().toISOString()
    const actorLink = { id: 'link-actor', principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
    seeded.document.draft.identityLinks = [actorLink]
    seeded.document.draft.principalAdmissions = [{ id: 'admission-actor', identityLinkId: actorLink.id, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(issuer, actorSubject), issuerFingerprintSha256: issuerFingerprintSha256(issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt }]
    seeded.document.draft.managementGrants = [{ id: 'grant-override', principalId: actorPrincipalId, employeeId: actorEmployeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'bootstrap-fixture', reason: 'fixture' }]
    seeded.document.draft.roleAssignments.push({ id: 'old-system-admin', employeeId: actorEmployeeId, applicationId: 'ai-pdm', roleId: 'role-system-admin', roleCodeSnapshot: 'system_admin', roleNameSnapshot: '系統管理員', catalogVersion: oldCatalog.catalogVersion, scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'principal', targetPrincipalId: actorPrincipalId, sources: [], createdByPrincipalId: actorPrincipalId })
    const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(seeded.document.draft)
    const organizationSnapshot = buildOrganizationSnapshot(source, recordedAt)
    const snapshot = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: [oldCatalog], organizationSnapshot, effectState: 'not-synchronized' as const }
    const version = { ...snapshot, id: 'published-old-catalog', versionNumber: 1, publishedAt: recordedAt, publishedByPrincipalId: actorPrincipalId, publishReason: 'fixture', hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash: '' }
    version.snapshotHash = publicationSnapshotHash(snapshot)
    seeded.document.publishedVersions.push(version)
    seeded.document.activePolicyVersionId = version.id
    seeded.document.draft.basePolicyVersionId = version.id
    seeded.document = appendGovernanceAudit(seeded.document, { commandId: 'publish-old-catalog', reason: 'fixture' }, { principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, bootstrap: true }, { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: version.id, beforeHash: null, afterHash: version.snapshotHash }, recordedAt)
    await writeFile(getGovernancePaths(root).current, `${JSON.stringify(seeded.document, null, 2)}\n`)

    const dynamic = dynamicCatalogFixture()
    const currentArtifact = decodeDynamicAiPdmRoleCatalog(dynamic.rows, [oldArtifact])
    catalogOverride.value = createAiPdmRoleCatalog('valid', currentArtifact.publishedAt, currentArtifact)
    const current = await readGovernanceStore(root)
    const actor = { principalId: actorPrincipalId, issuer, subject: actorSubject, employeeId: actorEmployeeId, bootstrap: false }
    const request = { operation: 'revoke_system_admin' as const, assignmentId: 'old-system-admin', applicationId: 'ai-pdm' as const, stableRoleId: 'role-system-admin' as const, reason: 'catalog drift must not block withdrawal', expected: { catalogVersion: catalogOverride.value.catalogVersion, catalogPayloadHash: catalogOverride.value.payloadHash, governanceRevision: current.revision, organizationRevision: source.workspaceRevision } }
    const preview = await previewPrivilegedAssignment(root, actor, request)
    const session = { sessionId: 'fresh-session', principalId: actorPrincipalId, assuranceLevel: 'aal1' as const, authenticatedAt: new Date(Date.now() - 30_000).toISOString() }
    const receipt = await publishPrivilegedAssignment(root, actor, session, { ...request, commandId: 'revoke-after-catalog-change', requestHash: preview.requestHash, previewHash: preview.previewHash })
    expect(receipt).toMatchObject({ receiptStatus: 'applied', decisionCode: 'COMMAND_APPLIED' })
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.roleAssignments.find(value => value.id === 'old-system-admin')?.status).toBe('revoked')
    expect(persisted.document.publishedVersions.at(-1)?.externalRoleCatalogs.map(value => value.catalogVersion)).toEqual([catalogOverride.value.catalogVersion, oldCatalog.catalogVersion])
  })
})
