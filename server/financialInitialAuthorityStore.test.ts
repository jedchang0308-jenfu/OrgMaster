import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { buildOrganizationSnapshot } from '../src/governance/validation'
import { previewFinancialRoleAssignment } from './applicationRoleAssignmentStore'
import { FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH } from './applicationEntitlementCommon'
import { previewFinancialInitialAuthority, publishFinancialInitialAuthority } from './financialInitialAuthorityStore'
import { appendGovernanceAudit, ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function sha256(value: string) { return createHash('sha256').update(value).digest('hex') }
function role(stableRoleId: string, code: string, displayName: string) {
  const raw = { stableRoleId, code, displayName, builtIn: true, capabilityIds: ['finance.dashboard.view'], allowedScopeKinds: ['workspace'], assignmentPolicy: 'open' as const }
  return { ...raw, roleDefinitionHash: sha256(canonicalJson(raw)) }
}
function release(principalId: string, employeeId: string) {
  const createdAt = '2026-10-26T00:00:00.000Z'
  const document = {
    formatVersion: 'jf.configuration-catalog.v1', applicationId: 'financial-management-system', catalogVersion: 'financial-management-system.catalog.initial.v1',
    registryVersion: 'fms.configuration.registry.v1', roles: [role('role-finance-manager', 'finance-manager', '財務主管'), role('role-owner', 'owner', '負責人'), role('role-viewer', 'viewer', '檢視者')],
    publishedAt: createdAt, publishedBy: { principalId, employeeId },
  }
  const artifactUtf8 = `${canonicalJson(document)}\n`
  return { applicationId: document.applicationId, version: document.catalogVersion, contentSha256: sha256(canonicalJson(document)), artifactSha256: sha256(artifactUtf8), artifactUtf8, sourceDraftId: 'initial-authority-bootstrap', sourceDraftRevision: 1, createdBy: document.publishedBy, createdAt }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-financial-initial-authority-'))
  roots.push(root)
  await writeSyntheticWorkspaceFixture(root)
  await ensureGovernanceStore(root)
  const current = await readGovernanceStore(root)
  const source = await loadOrganizationSource(root)
  const employeeId = source.state.employees[0].id
  const otherEmployeeId = source.state.employees[1].id
  const actor = { principalId: 'principal-initial-owner', employeeId, issuer: 'https://securetoken.google.com/test', subject: 'initial-owner', bootstrap: false }
  const link = { id: 'identity-initial-owner', principalId: actor.principalId, employeeId, issuer: actor.issuer, subject: actor.subject, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
  current.document.draft.identityLinks = [link]
  current.document.draft.principalAdmissions = [{ id: 'admission-initial-owner', identityLinkId: link.id, accountType: 'human_privileged', status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(link.issuer, link.subject), issuerFingerprintSha256: issuerFingerprintSha256(link.issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt: link.validFrom }]
  const aiCatalog = readAiPdmRoleCatalog()
  const systemRole = aiCatalog.roles.find((candidate) => candidate.stableRoleId === 'role-system-admin')!
  current.document.draft.roleAssignments = [{ id: 'assignment-system-admin', employeeId, applicationId: 'ai-pdm', roleId: systemRole.stableRoleId, roleCodeSnapshot: systemRole.code, roleNameSnapshot: systemRole.displayName, catalogVersion: aiCatalog.catalogVersion, scope: { kind: 'global' }, status: 'active', validFrom: link.validFrom, validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'principal', targetPrincipalId: actor.principalId, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'bootstrap', createdReason: 'fixture' }]
  current.document.draft.managementGrants = [{ id: 'grant-cross-app', principalId: actor.principalId, employeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: link.validFrom, validTo: null, grantedByPrincipalId: 'bootstrap', reason: 'fixture' }]
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = current.document.draft
  const payload = { kind: 'assignment-governance-v3' as const, policy, externalRoleCatalogs: [aiCatalog], organizationSnapshot: buildOrganizationSnapshot(source), effectState: 'not-synchronized' as const }
  const version = { ...payload, id: 'initial-authority-policy', versionNumber: 1, publishedAt: link.validFrom, publishedByPrincipalId: actor.principalId, publishReason: 'fixture', hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash: publicationSnapshotHash(payload) }
  current.document.activePolicyVersionId = version.id
  current.document.publishedVersions = [version]
  current.document.draft.basePolicyVersionId = version.id
  current.document.auditEvents = appendGovernanceAudit(current.document, { commandId: 'fixture-publish', reason: 'fixture', type: 'PUBLISH_ASSIGNMENTS' }, actor, { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: version.id, beforeHash: null, afterHash: version.snapshotHash }).auditEvents
  await writeFile(getGovernancePaths(root).current, `${JSON.stringify(current.document, null, 2)}\n`)
  return { root, source, actor, employeeId, otherEmployeeId }
}

describe('FMS initial authority bootstrap', () => {
  it('atomically publishes the application catalog, selected roles and minimum role-governance grants', async () => {
    const value = await fixture()
    const before = await readGovernanceStore(value.root)
    const input = { employeeId: value.employeeId, stableRoleIds: ['role-owner', 'role-finance-manager'], scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-10-26T00:00:00.000Z', validUntil: null, reason: 'Establish initial FMS owner authority', release: release(value.actor.principalId, value.employeeId), expectedGovernanceRevision: before.revision, expectedOrganizationRevision: value.source.workspaceRevision }
    const preview = await previewFinancialInitialAuthority(value.root, value.actor, input)
    expect(preview.afterAssignments.map((assignment) => assignment.roleId)).toEqual(['role-finance-manager', 'role-owner'])
    expect(preview.afterGrants.map((grant) => grant.capability)).toEqual([FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH])
    const request = { ...input, commandId: 'financial-initial-authority-1', requestHash: preview.requestHash, previewHash: preview.previewHash }
    const receipt = await publishFinancialInitialAuthority(value.root, value.actor, request)
    expect(receipt).toMatchObject({ receiptStatus: 'applied', decisionCode: 'COMMAND_APPLIED', replayed: false })
    expect((await publishFinancialInitialAuthority(value.root, value.actor, request)).replayed).toBe(true)
    const persisted = await readGovernanceStore(value.root)
    expect(persisted.document.draft.roleAssignments.filter((assignment) => assignment.applicationId === 'financial-management-system').map((assignment) => assignment.roleId).sort()).toEqual(['role-finance-manager', 'role-owner'])
    expect(persisted.document.draft.managementGrants.filter((grant) => grant.applicationId === 'financial-management-system')).toHaveLength(2)
    expect(persisted.document.publishedVersions.at(-1)?.externalRoleCatalogs.find((catalog) => catalog.applicationId === 'financial-management-system')?.sourceKind).toBe('application-contract')
    const roleInput = { operation: 'upsert' as const, employeeId: value.otherEmployeeId, stableRoleId: 'role-viewer', scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: input.validFrom, validUntil: null, reason: 'normal assignment after bootstrap', expectedCatalogVersion: preview.catalogBinding.catalogVersion, expectedCatalogPayloadHash: preview.catalogBinding.catalogSha256, expectedGovernanceRevision: persisted.revision, expectedOrganizationRevision: value.source.workspaceRevision }
    await expect(previewFinancialRoleAssignment(value.root, value.actor, roleInput)).resolves.toMatchObject({ applicationId: 'financial-management-system' })
    await expect(previewFinancialInitialAuthority(value.root, value.actor, { ...input, expectedGovernanceRevision: persisted.revision })).rejects.toMatchObject({ code: 'INITIAL_AUTHORITY_ALREADY_EXISTS' })
  })

  it('rejects a different target, incomplete role set and missing privileged authority before mutation', async () => {
    const value = await fixture()
    const before = await readGovernanceStore(value.root)
    const input = { employeeId: value.employeeId, stableRoleIds: ['role-owner', 'role-finance-manager'], scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-10-26T00:00:00.000Z', validUntil: null, reason: 'Establish initial FMS owner authority', release: release(value.actor.principalId, value.employeeId), expectedGovernanceRevision: before.revision, expectedOrganizationRevision: value.source.workspaceRevision }
    await expect(previewFinancialInitialAuthority(value.root, value.actor, { ...input, employeeId: value.otherEmployeeId })).rejects.toMatchObject({ code: 'INITIAL_AUTHORITY_TARGET_INVALID' })
    await expect(previewFinancialInitialAuthority(value.root, value.actor, { ...input, stableRoleIds: ['role-owner'] })).rejects.toMatchObject({ code: 'INITIAL_AUTHORITY_ROLE_SET_INVALID' })
    await expect(previewFinancialInitialAuthority(value.root, { ...value.actor, principalId: 'not-the-admin' }, input)).rejects.toMatchObject({ code: 'PRIVILEGED_ADMIN_REQUIRED' })
    expect((await readGovernanceStore(value.root)).revision).toBe(before.revision)
  })
})
