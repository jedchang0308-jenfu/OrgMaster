import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { previewFinancialManagementGrant, publishFinancialManagementGrant } from './applicationManagementGrantStore'
import { previewFinancialRoleAssignment, publishFinancialRoleAssignment } from './applicationRoleAssignmentStore'
import { FINANCIAL_ROLE_ASSIGNMENT_MANAGE, FINANCIAL_ROLE_ASSIGNMENT_PUBLISH } from './applicationEntitlementCommon'
import { FINANCIAL_CATALOG_VERSION } from '../src/governance/financialCatalog'

const roots: string[] = []

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev039-entitlement-'))
  roots.push(root)
  const sourceManifest = JSON.parse(await readFile(resolve('data/orgmaster-workspace.v1.json'), 'utf8'))
  const currentId = sourceManifest.currentVersionId as string
  const currentEntry = sourceManifest.entries.find((entry: { id: string }) => entry.id === currentId)
  await mkdir(join(root, 'data', 'orgmaster-versions'), { recursive: true })
  await writeFile(join(root, 'data', 'orgmaster-workspace.v1.json'), `${JSON.stringify({ ...sourceManifest, entries: [currentEntry] }, null, 2)}\n`)
  await writeFile(join(root, 'data', 'orgmaster-versions', `${currentId}.json`), await readFile(resolve('data/orgmaster-versions', `${currentId}.json`), 'utf8'))
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
    expect((await publishFinancialRoleAssignment(root, actor, { ...input, commandId: 'dev039-role-assignment-1', requestHash: preview.requestHash, previewHash: preview.previewHash })).replayed).toBe(true)
    const latest = await readGovernanceStore(root)
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
})
