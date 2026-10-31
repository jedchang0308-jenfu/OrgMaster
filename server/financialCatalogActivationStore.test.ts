import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'
import { issuerFingerprintSha256, principalFingerprintSha256 } from '../src/governance/identityAdmission'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { FINANCIAL_CATALOG_VERSION } from '../src/governance/financialCatalog'
import { GOVERNANCE_PUBLICATION_HASH_FORMAT, publicationSnapshotHash } from '../src/governance/commands'
import { buildOrganizationSnapshot } from '../src/governance/validation'
import { writeSyntheticWorkspaceFixture } from './syntheticWorkspaceFixture'
import { readFinancialRoleCatalog } from './financialRoleCatalogRepository'
import { appendGovernanceAudit, ensureGovernanceStore, getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { activateFinancialCatalog, previewFinancialCatalogActivation, readFinancialCatalogActivationReceipt, readFinancialCatalogActivationWorkspace } from './financialCatalogActivationStore'
import type { GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
  return JSON.stringify(value)
}
async function persistFixture(root: string, document: GovernanceDocumentV3) {
  const source = await loadOrganizationSource(root)
  const { basePolicyVersionId: _base, updatedAt: _updated, ...policy } = structuredClone(document.draft)
  const id = 'fixture-publication-' + (document.publishedVersions.length + 1)
  const prior = document.publishedVersions.find(item => item.id === document.activePolicyVersionId)
  const payload = { kind: 'assignment-governance-v3' as const, effectState: 'not-synchronized' as const,
    policy, externalRoleCatalogs: prior?.kind === 'assignment-governance-v3' ? prior.externalRoleCatalogs : [readAiPdmRoleCatalog(), await readFinancialRoleCatalog('valid')],
    organizationSnapshot: buildOrganizationSnapshot(source) }
  const snapshotHash = publicationSnapshotHash(payload)
  document.publishedVersions.push({ ...payload, id, versionNumber: document.publishedVersions.length + 1,
    publishedAt: new Date().toISOString(), publishedByPrincipalId: 'fixture', publishReason: 'isolated fixture',
    hashFormat: GOVERNANCE_PUBLICATION_HASH_FORMAT, snapshotHash })
  document.activePolicyVersionId = id
  document.draft.basePolicyVersionId = id
  document = appendGovernanceAudit(document, { commandId: 'fixture-' + id, reason: 'isolated fixture', type: 'PUBLISH_ASSIGNMENTS' },
    { principalId: 'fixture', employeeId: null, issuer: 'fixture', subject: 'fixture', bootstrap: true },
    { action: 'PUBLISH_ASSIGNMENTS', entityType: 'assignmentVersion', entityId: id, beforeHash: null, afterHash: snapshotHash })
  await writeFile(getGovernancePaths(root).current, JSON.stringify(document, null, 2) + '\n')
}
async function setup(missingCapability?: string) {
  const root = await mkdtemp(join(tmpdir(), 'fms-catalog-activation-')); roots.push(root)
  await writeSyntheticWorkspaceFixture(root); await ensureGovernanceStore(root)
  const current = await readGovernanceStore(root), source = await loadOrganizationSource(root)
  const employeeId = source.state.employees[0].id, issuer = 'https://securetoken.google.com/catalog-test'
  const actor: GovernanceActorContext = { principalId: 'catalog-owner', employeeId, issuer, subject: 'catalog-owner',
    bootstrap: false, principalAuthEpoch: 0, authenticatedAt: new Date(Date.now() - 60_000).toISOString() }
  current.document.draft.identityLinks = [{ id: 'catalog-link', principalId: actor.principalId, employeeId, issuer,
    subject: actor.subject, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }]
  current.document.draft.principalAdmissions = [{ id: 'catalog-admission', identityLinkId: 'catalog-link', accountType: 'human_personal',
    status: 'active', sharedRetirementState: 'not_applicable', principalFingerprintSha256: principalFingerprintSha256(issuer, actor.subject),
    issuerFingerprintSha256: issuerFingerprintSha256(issuer), evidenceRefSha256: 'a'.repeat(64), recordedAt: '2026-01-01T00:00:00.000Z' }]
  current.document.draft.roleAssignments.push({ id: 'catalog-owner-assignment', employeeId, applicationId: 'financial-management-system',
    roleId: 'role-owner', roleCodeSnapshot: 'owner', roleNameSnapshot: '負責人', catalogVersion: FINANCIAL_CATALOG_VERSION,
    scope: { kind: 'workspace', value: 'company-jenfu' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
    effectState: 'not-synchronized', basis: 'manual', subjectKind: 'employee', targetPrincipalId: null, sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'fixture', createdReason: 'isolated fixture' })
  current.document.draft.managementGrants = ['catalog.import', 'catalog.publish', 'catalog.activate', 'catalog.read']
    .filter(capability => capability !== missingCapability).map(capability => ({ id: capability, principalId: actor.principalId, employeeId,
      applicationId: 'financial-management-system' as const, capability: 'financial-management-system.' + capability,
      status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: 'fixture', reason: 'isolated fixture' }))
  await persistFixture(root, current.document)
  const workspace = await readFinancialCatalogActivationWorkspace(root, actor)
  const request = { reason: 'Native catalog compatibility activation', expectedGovernanceRevision: workspace.governanceRevision,
    expectedOrganizationRevision: workspace.organizationRevision }
  return { root, actor, request }
}
function releaseFor(actor: GovernanceActorContext, roleId = 'role-owner') {
  const base = { stableRoleId: roleId, code: roleId === 'role-owner' ? 'owner' : 'viewer', displayName: 'Updated role',
    builtIn: roleId === 'role-owner', capabilityIds: ['finance.dashboard.view'], allowedScopeKinds: ['workspace'], assignmentPolicy: 'open' as const }
  const role = { ...base, roleDefinitionHash: sha(canonical(base)) }, createdAt = '2026-10-27T00:00:00.000Z'
  const catalog = { formatVersion: 'jf.configuration-catalog.v1', applicationId: 'financial-management-system',
    catalogVersion: 'financial-management-system.catalog.activation.v2', registryVersion: 'fms.registry.v2', roles: [role],
    publishedAt: createdAt, publishedBy: { principalId: actor.principalId, employeeId: actor.employeeId } }
  const artifactUtf8 = canonical(catalog) + '\n'
  return { applicationId: catalog.applicationId, version: catalog.catalogVersion, contentSha256: sha(canonical(catalog)),
    artifactSha256: sha(artifactUtf8), artifactUtf8, sourceDraftId: 'published-draft', sourceDraftRevision: 2,
    createdBy: catalog.publishedBy, createdAt }
}
describe('native FMS catalog activation lifecycle', () => {
  it('connects mounted workspace, preview, activation and original-command readback through the verified session', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const middleware = createOrgmasterGovernanceMiddleware(root, false)
    const session: OrgmasterSession = { id: 'native-catalog-session', identityIssuer: actor.issuer, identitySubject: actor.subject,
      principalId: actor.principalId, employeeId: actor.employeeId!, authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 0,
      issuedAt: actor.authenticatedAt!, authenticatedAt: actor.authenticatedAt!, expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null, assuranceLevel: 'aal1' }
    const server = createServer((incoming, response) => {
      if (!incoming.url?.endsWith('/unauthenticated')) setVerifiedRequestIdentity(incoming, session)
      middleware(incoming, response, () => { response.statusCode = 404; response.end() })
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TEST_LISTENER_MISSING')
    const origin = `http://127.0.0.1:${address.port}`, path = '/api/orgmaster/governance/applications/financial-management-system/catalog/activation'
    const post = (suffix: string, body: unknown) => fetch(origin + path + suffix, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    try {
      expect((await fetch(origin + path)).status).toBe(200)
      const previewResponse = await post('/preview', { release, ...request })
      expect(previewResponse.status).toBe(200)
      const calculated = await previewResponse.json()
      const command = { release, ...request, commandId: 'native-http-activation', requestHash: calculated.requestHash, previewHash: calculated.previewHash }
      const activated = await post('/activate', command)
      expect(activated.status).toBe(200)
      const receipt = await activated.json()
      expect(receipt).toMatchObject({ receiptStatus: 'applied', commandId: command.commandId, authorizationEffect: 'committed' })
      const observed = await fetch(origin + path + '/commands/' + command.commandId)
      expect(observed.status).toBe(200)
      expect(await observed.json()).toMatchObject({ requestHash: command.requestHash, previewHash: command.previewHash, receiptStatus: 'applied' })
      const general = await (await fetch(origin + '/api/orgmaster/governance')).json()
      expect(general.document.commandReceipts.find((item: { commandId: string }) => item.commandId === command.commandId)).not.toHaveProperty('financialCatalogActivation')
      expect((await fetch(origin + path + '/commands/missing')).status).toBe(404)
      const unauthenticated = await fetch(origin + path + '/unauthenticated')
      // This mounted-store fixture has no Firebase provider; the outer auth
      // runtime owns production 401 semantics. Missing trusted context cannot
      // become a successful governance request here.
      expect(unauthenticated.status).toBe(503)
      expect(await unauthenticated.json()).toMatchObject({ error: 'IDENTITY_PROVIDER_NOT_CONFIGURED' })
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })

  it('previews without writes, commits policy and one receipt atomically, and replays the original command', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const original = await readFile(getGovernancePaths(root).current, 'utf8')
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    expect(calculated).toMatchObject({ compatible: true, affectedAssignmentCount: 1, preservedAssignmentIds: ['catalog-owner-assignment'], allowedOperations: { activate: true } })
    expect(await readFile(getGovernancePaths(root).current, 'utf8')).toBe(original)
    const command = { ...request, commandId: 'activate-once', requestHash: calculated.requestHash, previewHash: calculated.previewHash }
    const receipt = await activateFinancialCatalog(root, actor, release, command)
    expect(receipt).toMatchObject({ receiptStatus: 'applied', replayed: false, financialCatalogActivation: {
      principalId: actor.principalId, catalogVersion: release.version, contentSha256: release.contentSha256, authEpoch: 0 } })
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.roleAssignments.find(item => item.id === 'catalog-owner-assignment')).toMatchObject({ catalogVersion: release.version, authoringCatalogVersion: FINANCIAL_CATALOG_VERSION })
    expect(persisted.document.commandReceipts.filter(item => item.commandId === command.commandId)).toHaveLength(1)
    expect(persisted.document.auditEvents.filter(item => item.commandId === command.commandId)).toHaveLength(1)
    expect(await readFinancialCatalogActivationReceipt(root, actor, command.commandId)).toEqual(receipt)
    expect(await activateFinancialCatalog(root, actor, release, command)).toEqual({ ...receipt, replayed: true })
    expect((await readGovernanceStore(root)).raw).toBe(persisted.raw)
    await expect(activateFinancialCatalog(root, actor, release, { ...command, reason: 'changed reason' })).rejects.toMatchObject({ code: 'REQUEST_HASH_CONFLICT' })
  })
  it('shows incompatible removal of an assigned role and refuses activation without changing data', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor, 'role-viewer')
    const original = (await readGovernanceStore(root)).raw
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    expect(calculated).toMatchObject({ compatible: false, removedAssignedRoleIds: ['role-owner'], allowedOperations: { activate: false } })
    await expect(activateFinancialCatalog(root, actor, release, { ...request, commandId: 'incompatible',
      requestHash: calculated.requestHash, previewHash: calculated.previewHash })).rejects.toMatchObject({ code: 'CATALOG_INCOMPATIBLE' })
    expect((await readGovernanceStore(root)).raw).toBe(original)
  })
  it('rechecks current activation authority before replaying an already applied command', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    const command = { ...request, commandId: 'revoked-after-commit', requestHash: calculated.requestHash, previewHash: calculated.previewHash }
    const receipt = await activateFinancialCatalog(root, actor, release, command)
    const current = await readGovernanceStore(root)
    current.document.draft.managementGrants = current.document.draft.managementGrants.filter(item => item.capability !== 'financial-management-system.catalog.activate')
    await persistFixture(root, current.document)
    await expect(activateFinancialCatalog(root, actor, release, command)).rejects.toMatchObject({ code: 'APP_MANAGEMENT_GRANT_REQUIRED' })
    expect(await readFinancialCatalogActivationReceipt(root, actor, command.commandId)).toEqual(receipt)
  })
  it('rejects an owner assignment for another workspace despite all protected grants', async () => {
    const { root, actor } = await setup()
    const current = await readGovernanceStore(root)
    current.document.draft.roleAssignments.find(item => item.id === 'catalog-owner-assignment')!.scope = { kind: 'workspace', value: 'other-workspace' }
    await persistFixture(root, current.document)
    await expect(readFinancialCatalogActivationWorkspace(root, actor)).rejects.toMatchObject({ code: 'APP_MANAGEMENT_GRANT_REQUIRED' })
  })
  it('lets only one concurrent writer publish from the same governance revision', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    const results = await Promise.allSettled(['race-a', 'race-b'].map(commandId => activateFinancialCatalog(root, actor, release,
      { ...request, commandId, requestHash: calculated.requestHash, previewHash: calculated.previewHash })))
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find(item => item.status === 'rejected')
    expect(failure && failure.status === 'rejected' && failure.reason).toMatchObject({ code: 'REVISION_CONFLICT' })
    const current = await readGovernanceStore(root)
    expect(current.document.commandReceipts.filter(item => ['race-a', 'race-b'].includes(item.commandId))).toHaveLength(1)
  })
  it('refuses a stale governance preview and a missing verified authentication stamp without writes', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    const command = { ...request, commandId: 'stale-publication', requestHash: calculated.requestHash, previewHash: calculated.previewHash }
    const current = await readGovernanceStore(root)
    await expect(activateFinancialCatalog(root, { ...actor, principalAuthEpoch: undefined }, release, command)).rejects.toMatchObject({ code: 'IDENTITY_REQUIRED' })
    expect((await readGovernanceStore(root)).raw).toBe(current.raw)
    await persistFixture(root, current.document)
    await expect(activateFinancialCatalog(root, actor, release, command)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })
  it('retains one command receipt and rejects altered receipt proof even while its publication is valid', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    const command = { ...request, commandId: 'receipt-binding', requestHash: calculated.requestHash, previewHash: calculated.previewHash }
    await activateFinancialCatalog(root, actor, release, command)
    const current = await readGovernanceStore(root)
    const receipt = current.document.commandReceipts.find(item => item.commandId === command.commandId)!
    receipt.financialCatalogActivation!.authEpoch += 1
    await writeFile(getGovernancePaths(root).current, JSON.stringify(current.document, null, 2) + '\n')
    await expect(readFinancialCatalogActivationReceipt(root, actor, command.commandId)).rejects.toMatchObject({ code: 'COMMAND_ID_CONFLICT' })
  })
  it.each(['catalog.publish', 'catalog.activate'])('requires the distinct %s grant at activation', async missing => {
    const { root, actor, request } = await setup(missing), release = releaseFor(actor)
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    expect(calculated.allowedOperations.activate).toBe(false)
    await expect(activateFinancialCatalog(root, actor, release, { ...request, commandId: 'no-authority',
      requestHash: calculated.requestHash, previewHash: calculated.previewHash })).rejects.toMatchObject({ code: 'APP_MANAGEMENT_GRANT_REQUIRED' })
  })
  it('binds preview to source revisions and rejects changed release hashes and stale previews', async () => {
    const { root, actor, request } = await setup(), release = releaseFor(actor)
    const calculated = await previewFinancialCatalogActivation(root, actor, release, request)
    await expect(previewFinancialCatalogActivation(root, actor, release, { ...request, expectedOrganizationRevision: 'stale' })).rejects.toMatchObject({ code: 'ORGANIZATION_REVISION_CONFLICT' })
    await expect(activateFinancialCatalog(root, actor, release, { ...request, commandId: 'stale-preview',
      requestHash: calculated.requestHash, previewHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'PREVIEW_HASH_CONFLICT' })
    await expect(activateFinancialCatalog(root, actor, { ...release, artifactUtf8: release.artifactUtf8 + ' ' }, { ...request,
      commandId: 'changed-artifact', requestHash: calculated.requestHash, previewHash: calculated.previewHash })).rejects.toThrow('FINANCIAL_CATALOG_RELEASE_INVALID')
  })
})
