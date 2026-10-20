import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { appendGovernanceAudit, ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, publishGovernance, readGovernanceStore, setActivePolicy } from './orgmasterGovernanceStore'
import { GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { previewFinancialManagementGrant, publishFinancialManagementGrant } from './applicationManagementGrantStore'
import { previewFinancialRoleAssignment, publishFinancialRoleAssignment } from './applicationRoleAssignmentStore'
import { assertFinancialAuthority, FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH } from './applicationEntitlementCommon'
import { FINANCIAL_CATALOG_VERSION } from '../src/governance/financialCatalog'
import { readApplicationRoleCatalogs } from './applicationRoleCatalogRegistry'
import { buildOrganizationSnapshot, validateDocumentV3 } from '../src/governance/validation'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'
import { storedGovernanceCatalogs } from './governanceReduction'

const roots: string[] = []

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev039-entitlement-'))
  roots.push(root)
  await writeSyntheticWorkspaceFixture(root)
  await ensureGovernanceStore(root)
  return root
}

function personalLink(id: string, principalId: string, issuer: string, subject: string, employeeId: string) {
  return { id, principalId, issuer, subject, employeeId, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null }
}

function admission(id: string, link: ReturnType<typeof personalLink>, accountType: 'human_personal' | 'human_privileged') {
  return { id, identityLinkId: link.id, accountType, status: 'active' as const, sharedRetirementState: 'not_applicable' as const, principalFingerprintSha256: principalFingerprintSha256(link.issuer, link.subject), issuerFingerprintSha256: issuerFingerprintSha256(link.issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt: '2026-01-01T00:00:00.000Z' }
}

async function writeDocument(root: string, document: Awaited<ReturnType<typeof readGovernanceStore>>['document']) {
  if (!document.activePolicyVersionId) {
    const source = await loadOrganizationSource(root)
    const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
    const id = 'published-fixture'
    const payload = { kind: 'assignment-governance-v3' as const, effectState: 'not-synchronized' as const, policy,
      externalRoleCatalogs: [readAiPdmRoleCatalog(), await readFinancialRoleCatalog('valid')],
      organizationSnapshot: buildOrganizationSnapshot(source) }
    const snapshotHash = publicationSnapshotHash(payload)
    document.publishedVersions.push({ ...payload, id, versionNumber: 1,
      publishedAt: new Date().toISOString(), publishedByPrincipalId: 'fixture', publishReason: 'fixture',
      hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash })
    document.activePolicyVersionId = id
    document.draft.basePolicyVersionId = id
    document.auditEvents = appendGovernanceAudit(document, { commandId: 'fixture-seed', reason: 'fixture', type: 'PUBLISH_ASSIGNMENTS' },
      { principalId: 'fixture', employeeId: null, issuer: 'fixture', subject: 'fixture', bootstrap: true },
      { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: id, beforeHash: null, afterHash: snapshotHash }).auditEvents
  }
  await writeFile(getGovernancePaths(root).current, `${JSON.stringify(document, null, 2)}\n`)
}

describe('DEV-039 generic Financial entitlement v2', () => {
  it('requires exact Financial catalog binding and publishes an employee assignment atomically', async () => {
    const root = await fixtureRoot()
    const seeded = await readGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const [actorEmployeeId, targetEmployeeId] = source.state.employees.slice(0, 2).map((employee) => employee.id)
    const issuer = 'https://securetoken.google.com/dev039-owner'
    const actorLink = personalLink('link-owner', 'principal-owner', issuer, 'owner-subject', actorEmployeeId)
    const actorAdmission = admission('admission-owner', actorLink, 'human_personal')
    const financeCatalog = await readFinancialRoleCatalog('valid')
    seeded.document.draft.identityLinks = [actorLink]
    seeded.document.draft.principalAdmissions = [actorAdmission]
    seeded.document.draft.roleAssignments.push({ id: 'financial-owner', employeeId: actorEmployeeId, applicationId: 'financial-management-system', roleId: 'role-owner', roleCodeSnapshot: 'owner', roleNameSnapshot: '負責人', catalogVersion: FINANCIAL_CATALOG_VERSION, scope: { kind: 'workspace', value: 'company-jenfu' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: actorLink.principalId, createdReason: 'DEV-039 fixture' })
    seeded.document.draft.managementGrants = [
      { id: 'financial-manage', principalId: actorLink.principalId, employeeId: actorEmployeeId, applicationId: 'financial-management-system', capability: FINANCIAL_ROLE_ASSIGNMENT_MANAGE, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'privileged-fixture', reason: 'DEV-039 fixture' },
      { id: 'financial-publish', principalId: actorLink.principalId, employeeId: actorEmployeeId, applicationId: 'financial-management-system', capability: FINANCIAL_ROLE_ASSIGNMENT_PUBLISH, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'privileged-fixture', reason: 'DEV-039 fixture' },
    ]
    await writeDocument(root, seeded.document)
    const current = await readGovernanceStore(root)
    const actor = { principalId: actorLink.principalId, issuer, subject: actorLink.subject, employeeId: actorEmployeeId, bootstrap: false }
    const input = { operation: 'upsert' as const, employeeId: targetEmployeeId, stableRoleId: 'role-finance-staff', scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, reason: 'DEV-039 assign Finance Staff', expectedCatalogVersion: financeCatalog.catalogVersion, expectedCatalogPayloadHash: financeCatalog.payloadHash, expectedGovernanceRevision: current.revision, expectedOrganizationRevision: source.workspaceRevision }
    const preview = await previewFinancialRoleAssignment(root, actor, input)
    const receipt = await publishFinancialRoleAssignment(root, actor, { ...input, commandId: 'dev039-role-assignment-1', requestHash: preview.requestHash, previewHash: preview.previewHash })
    expect(receipt).toMatchObject({ receiptStatus: 'applied', decisionCode: 'COMMAND_APPLIED', replayed: false })
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.roleAssignments).toContainEqual(expect.objectContaining({ employeeId: targetEmployeeId, applicationId: 'financial-management-system', roleId: 'role-finance-staff', status: 'active' }))
    expect(persisted.document.publishedVersions.at(-1)?.externalRoleCatalogs.some((catalog) => catalog.applicationId === 'financial-management-system')).toBe(true)
    expect(persisted.document.auditEvents.some((event) => event.commandId === 'dev039-role-assignment-1')).toBe(true)
    expect(storedGovernanceCatalogs(persisted.document)).not.toBeNull()
    expect(persisted.document.auditEvents.find(event => event.id === receipt.auditReference)?.entityType).toBe('applicationRoleAssignment')
    expect(persisted.document.auditEvents.filter(event => event.commandId === receipt.commandId)).toHaveLength(1)
    expect(new Set(persisted.document.auditEvents.map(event => event.commandId)).size).toBe(persisted.document.auditEvents.length)
    expect((await publishFinancialRoleAssignment(root, actor, { ...input, commandId: 'dev039-role-assignment-1', requestHash: preview.requestHash, previewHash: preview.previewHash })).replayed).toBe(true)
    const latest = await readGovernanceStore(root)
    const collisionInput = { ...input, expectedGovernanceRevision: latest.revision }
    const collisionPreview = await previewFinancialRoleAssignment(root, actor, collisionInput)
    const internalCommandId = latest.document.auditEvents.find(event => event.entityType === 'assignmentVersion' &&
      event.entityId === latest.document.activePolicyVersionId)!.commandId
    await expect(publishFinancialRoleAssignment(root, actor, { ...collisionInput, commandId: internalCommandId,
      requestHash: collisionPreview.requestHash, previewHash: collisionPreview.previewHash }))
      .rejects.toMatchObject({ code: 'COMMAND_ID_REUSED' })
    expect((await readGovernanceStore(root)).revision).toBe(latest.revision)
    await expect(previewFinancialRoleAssignment(root, actor, { ...input, expectedGovernanceRevision: latest.revision, expectedCatalogPayloadHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'CATALOG_BINDING_CONFLICT' })
  })

  it('allows only exact privileged admins to establish a Financial management grant and preserves a governor', async () => {
    const root = await fixtureRoot()
    const seeded = await readGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const [adminEmployeeId, targetEmployeeId] = source.state.employees.slice(0, 2).map((employee) => employee.id)
    const issuer = 'https://securetoken.google.com/dev039-admin'
    const adminLink = personalLink('link-admin', 'principal-admin', issuer, 'admin-subject', adminEmployeeId)
    const targetLink = personalLink('link-target', 'principal-target', issuer, 'target-subject', targetEmployeeId)
    const adminAdmission = admission('admission-admin', adminLink, 'human_privileged')
    const targetAdmission = admission('admission-target', targetLink, 'human_personal')
    const aiCatalog = readAiPdmRoleCatalog()
    seeded.document.draft.identityLinks = [adminLink, targetLink]
    seeded.document.draft.principalAdmissions = [adminAdmission, targetAdmission]
    const systemRole = aiCatalog.roles.find((role) => role.stableRoleId === 'role-system-admin')!
    seeded.document.draft.roleAssignments.push({ id: 'system-admin-fixture', employeeId: adminEmployeeId, applicationId: 'ai-pdm', roleId: systemRole.stableRoleId, roleCodeSnapshot: systemRole.code, roleNameSnapshot: systemRole.displayName, catalogVersion: aiCatalog.catalogVersion, scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'principal', targetPrincipalId: adminLink.principalId, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'bootstrap-fixture', createdReason: 'DEV-039 fixture' })
    seeded.document.draft.managementGrants = [{ id: 'override-fixture', principalId: adminLink.principalId, employeeId: adminEmployeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'bootstrap-fixture', reason: 'DEV-039 fixture' }]
    await writeDocument(root, seeded.document)
    const current = await readGovernanceStore(root)
    const actor = { principalId: adminLink.principalId, issuer, subject: adminLink.subject, employeeId: adminEmployeeId, bootstrap: false }
    const input = { operations: [{ operation: 'upsert' as const, principalId: targetLink.principalId, employeeId: targetEmployeeId, capabilities: [FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH], validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, reason: 'DEV-039 establish governor' }], expectedGovernanceRevision: current.revision, expectedOrganizationRevision: source.workspaceRevision }
    const preview = await previewFinancialManagementGrant(root, actor, input)
    const receipt = await publishFinancialManagementGrant(root, actor, { ...input, commandId: 'dev039-grant-1', requestHash: preview.requestHash, previewHash: preview.previewHash })
    expect(receipt).toMatchObject({ receiptStatus: 'applied', replayed: false })
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.managementGrants.filter((grant) => grant.applicationId === 'financial-management-system' && grant.status === 'active')).toHaveLength(2)
    expect(storedGovernanceCatalogs(persisted.document)).not.toBeNull()
    expect(persisted.document.auditEvents.find(event => event.id === receipt.auditReference)?.entityType).toBe('applicationManagementGrant')
    expect(persisted.document.auditEvents.filter(event => event.commandId === receipt.commandId)).toHaveLength(1)
    expect(new Set(persisted.document.auditEvents.map(event => event.commandId)).size).toBe(persisted.document.auditEvents.length)
    expect((await publishFinancialManagementGrant(root, actor, { ...input, commandId: 'dev039-grant-1', requestHash: preview.requestHash, previewHash: preview.previewHash })).replayed).toBe(true)
    const latest = await readGovernanceStore(root)
    await expect(previewFinancialManagementGrant(root, actor, { ...input, expectedGovernanceRevision: latest.revision, operations: [{ ...input.operations[0], principalId: actor.principalId, employeeId: adminEmployeeId }] })).rejects.toMatchObject({ code: 'SELF_GRANT_FORBIDDEN' })
  })

  it('delivers the grant-then-owner-assignment sequence without seeding the owner grant', async () => {
    const root = await fixtureRoot()
    const seeded = await readGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const [adminEmployeeId, ownerEmployeeId, targetEmployeeId] = source.state.employees.slice(0, 3).map((employee) => employee.id)
    const issuer = 'https://securetoken.google.com/dev039-sequence'
    const adminLink = personalLink('link-sequence-admin', 'principal-sequence-admin', issuer, 'sequence-admin', adminEmployeeId)
    const ownerLink = personalLink('link-sequence-owner', 'principal-sequence-owner', issuer, 'sequence-owner', ownerEmployeeId)
    const adminAdmission = admission('admission-sequence-admin', adminLink, 'human_privileged')
    const ownerAdmission = admission('admission-sequence-owner', ownerLink, 'human_personal')
    const aiCatalog = readAiPdmRoleCatalog()
    const systemRole = aiCatalog.roles.find((role) => role.stableRoleId === 'role-system-admin')!
    const financeCatalog = await readFinancialRoleCatalog('valid')
    seeded.document.draft.identityLinks = [adminLink, ownerLink]
    seeded.document.draft.principalAdmissions = [adminAdmission, ownerAdmission]
    seeded.document.draft.roleAssignments.push(
      { id: 'system-admin-sequence-fixture', employeeId: adminEmployeeId, applicationId: 'ai-pdm', roleId: systemRole.stableRoleId, roleCodeSnapshot: systemRole.code, roleNameSnapshot: systemRole.displayName, catalogVersion: aiCatalog.catalogVersion, scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'principal', targetPrincipalId: adminLink.principalId, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'bootstrap-fixture', createdReason: 'DEV-039 sequence fixture' },
      { id: 'financial-owner-sequence-fixture', employeeId: ownerEmployeeId, applicationId: 'financial-management-system', roleId: 'role-owner', roleCodeSnapshot: 'owner', roleNameSnapshot: '負責人', catalogVersion: financeCatalog.catalogVersion, scope: { kind: 'workspace', value: 'company-jenfu' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'bootstrap-fixture', createdReason: 'DEV-039 sequence fixture' },
    )
    seeded.document.draft.managementGrants = [{ id: 'override-sequence-fixture', principalId: adminLink.principalId, employeeId: adminEmployeeId, applicationId: 'ai-pdm', capability: 'orgmaster.cross_app_override', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'bootstrap-fixture', reason: 'DEV-039 sequence fixture' }]
    await writeDocument(root, seeded.document)

    const grantCurrent = await readGovernanceStore(root)
    const adminActor = { principalId: adminLink.principalId, issuer, subject: adminLink.subject, employeeId: adminEmployeeId, bootstrap: false }
    const grantInput = { operations: [{ operation: 'upsert' as const, principalId: ownerLink.principalId, employeeId: ownerEmployeeId, capabilities: [FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH], validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, reason: 'DEV-039 sequence governor grant' }], expectedGovernanceRevision: grantCurrent.revision, expectedOrganizationRevision: source.workspaceRevision }
    const grantPreview = await previewFinancialManagementGrant(root, adminActor, grantInput)
    const grantReceipt = await publishFinancialManagementGrant(root, adminActor, { ...grantInput, commandId: 'dev039-sequence-grant', requestHash: grantPreview.requestHash, previewHash: grantPreview.previewHash })
    expect(grantReceipt).toMatchObject({ receiptStatus: 'applied', replayed: false })

    const assignmentCurrent = await readGovernanceStore(root)
    const ownerActor = { principalId: ownerLink.principalId, issuer, subject: ownerLink.subject, employeeId: ownerEmployeeId, bootstrap: false }
    const assignmentInput = { operation: 'upsert' as const, employeeId: targetEmployeeId, stableRoleId: 'role-finance-staff', scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, reason: 'DEV-039 sequence assignment', expectedCatalogVersion: financeCatalog.catalogVersion, expectedCatalogPayloadHash: financeCatalog.payloadHash, expectedGovernanceRevision: assignmentCurrent.revision, expectedOrganizationRevision: source.workspaceRevision }
    const assignmentPreview = await previewFinancialRoleAssignment(root, ownerActor, assignmentInput)
    const assignmentReceipt = await publishFinancialRoleAssignment(root, ownerActor, { ...assignmentInput, commandId: 'dev039-sequence-assignment', requestHash: assignmentPreview.requestHash, previewHash: assignmentPreview.previewHash })
    expect(assignmentReceipt).toMatchObject({ receiptStatus: 'applied', replayed: false })
    expect((await publishFinancialRoleAssignment(root, ownerActor, { ...assignmentInput, commandId: 'dev039-sequence-assignment', requestHash: assignmentPreview.requestHash, previewHash: assignmentPreview.previewHash })).replayed).toBe(true)
  })
  it('rejects a stale draft Financial owner and grant after activating a published withdrawal', async () => {
    const root = await fixtureRoot()
    const seeded = await readGovernanceStore(root)
    const source = await loadOrganizationSource(root)
    const [employeeId, targetEmployeeId] = source.state.employees.slice(0, 2).map(employee => employee.id)
    const actor = { principalId: 'managed-owner', employeeId, issuer: 'issuer', subject: 'uid', bootstrap: false }
    const actorLink = personalLink('existing-financial-actor', actor.principalId, actor.issuer, actor.subject, employeeId)
    seeded.document.draft.identityLinks = [actorLink]
    seeded.document.draft.principalAdmissions = [admission('existing-financial-admission', actorLink, 'human_personal')]
    const makeAssignment = (applicationId: 'orgmaster' | 'financial-management-system', roleId: string) => ({
      id: applicationId, employeeId, applicationId, roleId, roleCodeSnapshot: roleId === 'role-owner' ? 'owner' : 'orgmaster_admin',
      roleNameSnapshot: applicationId === 'orgmaster' ? 'OrgMaster 管理者' : '負責人', catalogVersion: applicationId === 'orgmaster' ? null : FINANCIAL_CATALOG_VERSION,
      scope: applicationId === 'orgmaster' ? { kind: 'global' as const } : { kind: 'workspace' as const, value: 'company-jenfu' },
      status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
      effectState: applicationId === 'orgmaster' ? 'orgmaster-enforced' as const : 'not-synchronized' as const,
      basis: 'manual' as const, subjectKind: 'employee' as const, targetPrincipalId: null, sources: [],
      metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: actor.principalId, createdReason: 'fixture',
    })
    seeded.document.draft.roleAssignments = [makeAssignment('orgmaster', 'role-orgmaster-admin'), makeAssignment('financial-management-system', 'role-owner')]
    seeded.document.draft.managementGrants = [FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH].map(capability => ({
      id: capability, principalId: actor.principalId, employeeId, applicationId: 'financial-management-system' as const,
      capability, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
      grantedByPrincipalId: 'fixture', reason: 'fixture',
    }))
    await writeDocument(root, seeded.document)
    const current = await readGovernanceStore(root)
    expect(() => assertFinancialAuthority(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH)).not.toThrow()
    const prior = current.document.publishedVersions[0]
    if (prior.kind !== 'assignment-governance-v3') throw Error('fixture')
    // Publish a real audit-bound target, then simulate a stale editable draft.
    const withdrawalDraft = structuredClone(current.document)
    withdrawalDraft.draft.roleAssignments = withdrawalDraft.draft.roleAssignments.filter(assignment => assignment.applicationId === 'orgmaster')
    withdrawalDraft.draft.managementGrants = []
    await writeDocument(root, withdrawalDraft)
    const prepared = await readGovernanceStore(root)
    const withdrawal = await publishGovernance(root, prepared.revision, 'prepare-withdrawal', 'prepare Financial withdrawal', source.workspaceVersionId, actor)
    const withdrawn = withdrawal.document.publishedVersions.find(version => version.id === withdrawal.versionId)!
    withdrawal.document.activePolicyVersionId = prior.id
    withdrawal.document.draft = current.document.draft
    await writeDocument(root, withdrawal.document)
    const beforeActivation = await readGovernanceStore(root)
    await setActivePolicy(root, beforeActivation.revision, 'activate-withdrawal', 'withdraw Financial', withdrawn.id, actor)
    const active = await readGovernanceStore(root)
    expect(active.document.draft.roleAssignments.some(assignment => assignment.applicationId === 'financial-management-system')).toBe(true)
    expect(active.document.draft.managementGrants).toHaveLength(2)
    expect(() => assertFinancialAuthority(active.document, actor, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH)).toThrow('APP_MANAGEMENT_GRANT_REQUIRED')
    const catalog = await readFinancialRoleCatalog('valid')
    const request = { operation: 'upsert' as const, employeeId: targetEmployeeId, stableRoleId: 'role-finance-staff',
      scope: { kind: 'workspace' as const, value: 'company-jenfu' }, validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null, reason: 'stale draft cannot authorize', expectedCatalogVersion: catalog.catalogVersion,
      expectedCatalogPayloadHash: catalog.payloadHash, expectedGovernanceRevision: active.revision,
      expectedOrganizationRevision: source.workspaceRevision }
    await expect(previewFinancialRoleAssignment(root, actor, request)).rejects.toMatchObject({ code: 'APP_MANAGEMENT_GRANT_REQUIRED' })
    await expect(publishFinancialRoleAssignment(root, actor, { ...request, commandId: 'stale-draft-self-authorize',
      requestHash: 'a'.repeat(64), previewHash: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'APP_MANAGEMENT_GRANT_REQUIRED' })
    expect((await readGovernanceStore(root)).revision).toBe(active.revision)
  })

})
