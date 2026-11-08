import { rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { activateFinancialCatalog, previewFinancialCatalogActivation, readFinancialCatalogActivationReceipt, readFinancialCatalogActivationWorkspace } from './financialCatalogActivationStore'
import { assertFinancialCatalogInitializationProof, createFinancialCatalogInitializationAdoptionProof } from './financialCatalogInitializationAdoption'
import { getGovernancePaths, loadOrganizationSource, readGovernanceStore } from './orgmasterGovernanceStore'
import { isolatedCatalogRelease, persistInitializationFixture, setupCatalogInitializationFixture } from './financialCatalogInitializationAdoption.fixture'
import { validateAndNormalizeFinancialCatalogRelease } from './financialCatalogReleaseStore'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { administrativeDefinitionBindings } from '../src/governance/administrativeDefinitions'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() { const value = await setupCatalogInitializationFixture(); roots.push(value.root); return value }
describe('root-only exact immutable FMS catalog adoption', () => {
  it('previews and adopts only the fixed additive release without creating Owner or operation grants; recovery reuses its own receipt', async () => {
    const { root, actor, release, request, options } = await setup()
    const preview = await previewFinancialCatalogActivation(root, actor, release, request, options)
    expect(preview.allowedOperations.activate).toBe(true)
    expect(preview.addedRoles).toEqual([{ stableRoleId: 'role-system-admin', displayName: '系統管理員' }])
    const command = { ...request, commandId: 'root-first-adoption', requestHash: preview.requestHash, previewHash: preview.previewHash }
    const receipt = await activateFinancialCatalog(root, actor, release, command, options)
    expect(receipt.financialCatalogActivation).toMatchObject({ actorProof: { kind: 'platform_root_catalog_initialization', administrationVersion: 1 } })
    expect(receipt.financialCatalogActivation).not.toHaveProperty('grantIds')
    const persisted = await readGovernanceStore(root)
    expect(persisted.document.draft.managementGrants).toEqual([])
    expect(persisted.document.draft.roleAssignments.some(row => row.roleId === 'role-owner')).toBe(false)
    expect((await activateFinancialCatalog(root, actor, release, command, options)).replayed).toBe(true)
    expect(await readFinancialCatalogActivationReceipt(root, actor, command.commandId)).toEqual(receipt)
    const workspace = await readFinancialCatalogActivationWorkspace(root, actor, options)
    expect(workspace.initializationAdoption).toBeNull()
  })
  it('keeps an explicit first-initialization operation on the root adoption path when the root also has ordinary catalog grants', async () => {
    const { root, actor, release, request, options } = await setup()
    const current = await readGovernanceStore(root)
    const capabilities = ['financial-management-system.catalog.import', 'financial-management-system.catalog.publish',
      'financial-management-system.catalog.activate'] as const
    current.document.draft.managementGrants.push(...capabilities.map((capability, index) => ({
      id: `existing-catalog-grant-${index}`, principalId: actor.principalId, employeeId: actor.employeeId!, applicationId: 'financial-management-system' as const,
      capability, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
      grantedByPrincipalId: actor.principalId, reason: 'existing ordinary catalog authority',
    })))
    const orgmasterAdministrator = current.document.draft.administration!.grants.find(grant => grant.applicationId === 'orgmaster')!
    current.document.draft.administration!.grants.push({ ...orgmasterAdministrator, id: '20000000-0000-4000-8000-000000000070',
      applicationId: 'financial-management-system', reason: 'existing FMS application administrator',
      catalogBinding: administrativeDefinitionBindings['financial-management-system'] })
    await persistInitializationFixture(root, current.document)
    const freshRequest = { ...request, expectedGovernanceRevision: (await readGovernanceStore(root)).revision }
    const preview = await previewFinancialCatalogActivation(root, actor, release, freshRequest, options)
    expect(preview.initializationAdoption).toMatchObject({ kind: 'platform_root_catalog_initialization' })
    const receipt = await activateFinancialCatalog(root, actor, release, { ...freshRequest, commandId: 'root-with-ordinary-grants',
      requestHash: preview.requestHash, previewHash: preview.previewHash }, options)
    expect(receipt.financialCatalogActivation).toMatchObject({ actorProof: { kind: 'platform_root_catalog_initialization' } })
    expect(receipt.financialCatalogActivation).not.toHaveProperty('fmsCheckpoint')
  })
  it('preserves unpublished ordinary and management drafts instead of publishing them along with the catalog', async () => {
    const fixture = await setup(), { root, actor, release, request, options } = fixture
    const current = await readGovernanceStore(root)
    current.document.draft.applicationRoles[0].description = 'unpublished draft description'
    current.document.draft.managementGrants.push({ id: 'unpublished-read', principalId: actor.principalId, employeeId: actor.employeeId!, applicationId: 'financial-management-system', capability: 'financial-management-system.catalog.read', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, grantedByPrincipalId: actor.principalId, reason: 'draft only' })
    await writeFile(getGovernancePaths(root).current, JSON.stringify(current.document, null, 2) + '\n')
    const fresh = { ...request, expectedGovernanceRevision: (await readGovernanceStore(root)).revision }
    const preview = await previewFinancialCatalogActivation(root, actor, release, fresh, options)
    await activateFinancialCatalog(root, actor, release, { ...fresh, commandId: 'preserve-draft', requestHash: preview.requestHash, previewHash: preview.previewHash }, options)
    const next = (await readGovernanceStore(root)).document, published = next.publishedVersions.at(-1)!
    if (published.kind !== 'assignment-governance-v3') throw new Error('EXPECTED_V3')
    expect(published.policy.managementGrants).toEqual([])
    expect(published.policy.applicationRoles[0].description).not.toBe('unpublished draft description')
    expect(next.draft.managementGrants).toEqual(current.document.draft.managementGrants)
    expect(next.draft.applicationRoles).toEqual(current.document.draft.applicationRoles)
  })
  it('rebases published ordinary assignments and unpublished additions independently', async () => {
    const { root, actor, release, previousRelease, request, options } = await setup(), current = await readGovernanceStore(root)
    const assignment = { id: 'ordinary-viewer', employeeId: actor.employeeId!, applicationId: 'financial-management-system' as const,
      roleId: 'role-viewer', roleCodeSnapshot: 'viewer', roleNameSnapshot: 'role-viewer', catalogVersion: previousRelease.version,
      scope: { kind: 'workspace' as const, value: 'company-jenfu' }, status: 'active' as const, validFrom: '2026-01-01T00:00:00.000Z', validTo: null,
      effectState: 'not-synchronized' as const, basis: 'manual' as const, subjectKind: 'employee' as const, targetPrincipalId: null, sources: [],
      metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: actor.principalId, createdReason: 'isolated ordinary viewer' }
    current.document.draft.roleAssignments = [assignment]
    await persistInitializationFixture(root, current.document)
    const published = await readGovernanceStore(root)
    published.document.draft.roleAssignments.push({ ...assignment, id: 'unpublished-sales', roleId: 'role-sales', roleCodeSnapshot: 'sales', roleNameSnapshot: 'role-sales' })
    await writeFile(getGovernancePaths(root).current, JSON.stringify(published.document, null, 2) + '\n')
    const fresh = { ...request, expectedGovernanceRevision: (await readGovernanceStore(root)).revision }
    const preview = await previewFinancialCatalogActivation(root, actor, release, fresh, options)
    await activateFinancialCatalog(root, actor, release, { ...fresh, commandId: 'independent-rebase', requestHash: preview.requestHash, previewHash: preview.previewHash }, options)
    const next = (await readGovernanceStore(root)).document, version = next.publishedVersions.at(-1)!
    if (version.kind !== 'assignment-governance-v3') throw new Error('EXPECTED_V3')
    expect(version.policy.roleAssignments.map(row => row.id)).toEqual(['ordinary-viewer'])
    expect(next.draft.roleAssignments.map(row => row.id)).toEqual(['ordinary-viewer', 'unpublished-sales'])
    expect(next.draft.roleAssignments.every(row => row.catalogVersion === release.version && row.authoringCatalogVersion === previousRelease.version)).toBe(true)
  })
  it.each(['remove', 'rename', 'custom-edit', 'ordinary-capability', 'extra-role'])('rejects %s in the initialization delta without writing', async change => {
    const { root, actor, request, options } = await setup(), before = await readGovernanceStore(root)
    const release = isolatedCatalogRelease(actor, true, roles => {
      if (change === 'remove') roles.splice(roles.findIndex(role => role.stableRoleId === 'role-sales'), 1)
      if (change === 'rename') roles[0].displayName = 'changed'
      if (change === 'custom-edit') roles.find(role => role.stableRoleId === 'role-custom')!.assignmentPolicy = 'open'
      if (change === 'ordinary-capability') roles[0].capabilityIds = ['finance.users.manage']
      if (change === 'extra-role') roles.push({ ...roles[0], stableRoleId: 'role-extra', code: 'extra' })
    })
    const ownerReader = { read: async () => ({ ...(await options.initializationOwnerReader.read({} as never))!, release }) }
    await expect(previewFinancialCatalogActivation(root, actor, release, request, { ...options, initializationOwnerReader: ownerReader })).rejects.toMatchObject({ code: 'CATALOG_INCOMPATIBLE' })
    expect((await readGovernanceStore(root)).raw).toBe(before.raw)
  })
  it('fails closed for absent owner readback and rejects forged cloned proof objects', async () => {
    const { root, actor, release, previousRelease, request, options } = await setup(), current = await readGovernanceStore(root)
    await expect(previewFinancialCatalogActivation(root, actor, release, request)).rejects.toMatchObject({ code: 'FINANCIAL_CATALOG_UNAVAILABLE' })
    const candidate = validateAndNormalizeFinancialCatalogRelease(release, actor), source = await loadOrganizationSource(root)
    const proof = await createFinancialCatalogInitializationAdoptionProof({ document: current.document, source, actor, currentCatalog: validateAndNormalizeFinancialCatalogRelease(previousRelease, actor), candidate,
      ownerReader: options.initializationOwnerReader, handoffSource: 'local_test', operationId: request.initializationOperationId })
    expect(() => assertFinancialCatalogInitializationProof(structuredClone(proof), candidate, actor)).toThrow('FINANCIAL_CATALOG_UNAVAILABLE')
  })
  it.each(['stale', 'wrong-source', 'wrong-operation', 'unavailable'])('rejects %s owner readback before writing', async change => {
    const { root, actor, release, request, options } = await setup(), before = await readGovernanceStore(root)
    const original = await options.initializationOwnerReader.read({} as never)
    const reader = { read: async () => {
      if (change === 'unavailable') throw new Error('owner unavailable')
      return { ...original!, ...(change === 'stale' ? { readAt: new Date(Date.now() - 10001).toISOString() } : change === 'wrong-source' ? { source: 'formal' as const } : { operationId: 'different-operation' }) }
    } }
    await expect(previewFinancialCatalogActivation(root, actor, release, request, { ...options, initializationOwnerReader: reader })).rejects.toMatchObject({ code: 'FINANCIAL_CATALOG_UNAVAILABLE' })
    expect((await readGovernanceStore(root)).raw).toBe(before.raw)
  })
  it.each(['other-principal', 'stale-auth', 'revoked-root', 'inactive-human'])('rejects %s before owner IO', async change => {
    const { root, actor, release, request, options } = await setup()
    let candidateActor = actor
    if (change === 'other-principal') candidateActor = { ...actor, principalId: 'same-employee-other-principal' }
    if (change === 'stale-auth') candidateActor = { ...actor, authenticatedAt: new Date(Date.now() - 300001).toISOString() }
    if (change === 'revoked-root' || change === 'inactive-human') {
      const current = await readGovernanceStore(root)
      if (change === 'revoked-root') current.document.draft.administration!.grants[0].status = 'revoked'
      else current.document.draft.principalAdmissions![0].status = 'inactive'
      await persistInitializationFixture(root, current.document)
    }
    await expect(previewFinancialCatalogActivation(root, candidateActor, release, { ...request, expectedGovernanceRevision: (await readGovernanceStore(root)).revision }, options)).rejects.toMatchObject({ code: 'APP_MANAGEMENT_GRANT_REQUIRED' })
  })
  it('uses verified HTTP root context and rejects browser proof fields when the owner reader is unavailable', async () => {
    const { root, actor, release, request } = await setup()
    const middleware = createOrgmasterGovernanceMiddleware(root, false)
    const server = createServer((req, res) => {
      setVerifiedRequestIdentity(req, { id: actor.sessionId, principalId: actor.principalId, employeeId: actor.employeeId, identityIssuer: actor.issuer, identitySubject: actor.subject,
        assuranceLevel: actor.assuranceLevel, authenticatedAt: actor.authenticatedAt, principalAuthEpoch: 0 } as never)
      middleware(req, res, () => { res.statusCode = 404; res.end() })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('SERVER_ADDRESS')
      const response = await fetch(`http://127.0.0.1:${address.port}/api/orgmaster/governance/applications/financial-management-system/catalog/activation/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, release, rootInitialization: true, actorProof: { kind: 'platform_root_catalog_initialization' } }) })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ code: 'FINANCIAL_CATALOG_UNAVAILABLE' })
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  })
})
