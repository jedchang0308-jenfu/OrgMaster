import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { isolatedCatalogRelease, initializationOperationId } from './financialCatalogInitializationAdoption.fixture'
import { createCatalogInitializationPostgresFixturePersistence } from './financialCatalogInitializationPostgres.fixture'
import { validateAndNormalizeFinancialCatalogRelease } from './financialCatalogReleaseStore'
import { createFinancialCatalogInitializationHttpReader, FMS_INITIALIZATION_HANDOFF_PATH } from './financialCatalogInitializationOwnerHttp'
import { FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH } from '../src/governance/financialCatalog'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { publicationSnapshotHash } from '../src/governance/commands'
import type { GovernanceActorContext } from '../src/governance/types'
const require = createRequire(import.meta.url)
const fixtures = require(resolve(process.cwd(), 'scripts/lib/dev070-administration-postgres-fixture.mjs'))

it.skipIf(process.env.DEV070_RUN_POSTGRES !== '1')('runs root-only catalog adoption through real HTTP, restricted v3 writer and point-only SQL receipt', async () => {
  const platformPath = process.env.DEV070_PLATFORM_FIXTURE_MODULE
  if (!platformPath) throw new Error('DEV070_PLATFORM_OWNER_FIXTURE_MODULE_REQUIRED')
  const platformAdapter = require(platformPath)
  await fixtures.withAdministrationPostgresFixture(async (fixture: any) => {
    const publisher: GovernanceActorContext = { principalId: 'principal-legacy', employeeId: 'employee-legacy', issuer: 'issuer-legacy', subject: 'subject-legacy', bootstrap: false }
    const previousRelease = isolatedCatalogRelease(publisher, false), release = isolatedCatalogRelease(publisher, true)
    // The shared SQL fixture predates product v3 history parsing. Supply its missing
    // empty historical catalog arrays before the owner plan binds the source revision.
    await fixture.admin.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=jsonb_set(payload,'{publishedVersions}',(SELECT jsonb_agg(value||jsonb_build_object('externalRoleCatalogs',COALESCE(value->'externalRoleCatalogs','[]'::jsonb))) FROM jsonb_array_elements(payload->'publishedVersions')))
      WHERE artifact_key='orgmaster-governance.v3.json'`)
    await fixture.admin.query("UPDATE orgmaster_core.persistence_artifacts SET canonical_sha256=orgmaster_core.administration_sha256_v1(payload) WHERE artifact_key='orgmaster-governance.v3.json'")
    const initialization = await fixtures.prepareAdministrationInitializationFixture(fixture, { acceptedCatalogs: [validateAndNormalizeFinancialCatalogRelease(previousRelease, publisher)] })
    await initialization.initialize()
    const platform = await fixture.connect('platform-prod-runtime@jenfu-platform-prod.iam')
    await fixtures.drainAdministrationFixtureEvents(fixture, platformAdapter.createAdministrationLifecycleFixtureDispatch({ database: platform, handle: fixture.handle }))
    await platformAdapter.initializePrincipalForAdministrationFixture({ database: platform, handle: fixture.handle, principalId: publisher.principalId })
    const human = await fixtures.createAdministrativeHumanFixture(fixture), fms = await fixture.connect('fms_runtime')
    const session = (await fixture.admin.query('SELECT * FROM orgmaster_core.app_sessions WHERE id=$1', [human.sessionId])).rows[0]
    const root = (await fms.query('SELECT * FROM orgmaster_contract.read_fms_administration_initialization_v1($1,$2)', [human.principalId, human.employeeId])).rows[0]
    expect(root).toBeTruthy()
    const ownerServer = createServer(async (request, response) => {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const packet = JSON.parse(Buffer.concat(chunks).toString())
      if (request.method !== 'POST' || request.url !== FMS_INITIALIZATION_HANDOFF_PATH || packet.operationId !== initializationOperationId || packet.actor.principalId !== publisher.principalId) { response.statusCode = 403; response.end(); return }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ schemaVersion: 'fms.catalog-initialization-handoff.v1', operationId: initializationOperationId,
        initializationReceiptId: 'isolated-real-http-publish-receipt', receiptBodySha256: 'c'.repeat(64), principalId: publisher.principalId, employeeId: publisher.employeeId,
        sourceRoleDefinitionHash: FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH,
        issuance: { rootGrantId: root.root_grant_id, administrationVersion: String(root.administration_version), publishedPolicyId: root.published_policy_id, publishedAt: new Date(root.published_at).toISOString() }, release, previousRelease }))
    })
    await new Promise<void>(resolve => ownerServer.listen(0, '127.0.0.1', resolve))
    const ownerAddress = ownerServer.address(); if (!ownerAddress || typeof ownerAddress === 'string') throw new Error('OWNER_FIXTURE_ADDRESS')
    const httpReader = createFinancialCatalogInitializationHttpReader({ request: async (_canonical, body) => {
      const response = await fetch(`http://127.0.0.1:${ownerAddress.port}${FMS_INITIALIZATION_HANDOFF_PATH}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error('OWNER_FIXTURE_REFUSED')
      return response.json()
    } })
    const ownerReader = { read: async (input: Parameters<typeof httpReader.read>[0]) => { const value = await httpReader.read(input); return value && { ...value, source: 'local_test' as const } } }
    const persistence = createCatalogInitializationPostgresFixturePersistence(human.runtime)
    const middleware = createOrgmasterGovernanceMiddleware('isolated-sql-fixture', false, false, { initializationOwnerReader: ownerReader, handoffSource: 'local_test', persistence })
    const server = createServer((request, response) => {
      setVerifiedRequestIdentity(request, { id: human.sessionId, principalId: human.principalId, employeeId: human.employeeId,
        identityIssuer: session.identity_issuer, identitySubject: session.identity_subject, authenticatedAt: session.authenticated_at.toISOString(), assuranceLevel: session.assurance_level, principalAuthEpoch: Number(session.principal_auth_epoch) } as never)
      middleware(request, response, () => { response.statusCode = 404; response.end() })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('ORG_FIXTURE_ADDRESS')
    const api = `http://127.0.0.1:${address.port}/api/orgmaster/governance/applications/financial-management-system/catalog/activation`
    const post = async (suffix: string, body: unknown) => {
      const response = await fetch(api + suffix, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const value = await response.json(); if (!response.ok) throw new Error(`ADOPTION_HTTP_${response.status}:${JSON.stringify(value)}`); return value
    }
    try {
      const before = await persistence.read(''), source = await persistence.source('')
      const request = { release, reason: '隔離實際runtime writer採用', initializationOperationId, expectedGovernanceRevision: before.revision, expectedOrganizationRevision: source.workspaceRevision }
      const preview = await post('/preview', request)
      expect(preview.initializationAdoption.kind).toBe('platform_root_catalog_initialization')
      const commandId = 'isolated-root-adoption-' + initializationOperationId
      const receipt = await post('/activate', { ...request, commandId, requestHash: preview.requestHash, previewHash: preview.previewHash })
      expect(receipt.financialCatalogActivation.grantIds).toBeUndefined()
      const parameters = [publisher.principalId, publisher.employeeId, initializationOperationId, 'isolated-real-http-publish-receipt', release.version, release.contentSha256, release.artifactSha256]
      const sql = 'SELECT orgmaster_contract.read_fms_catalog_initialization_activation_v1($1,$2,$3,$4,$5,$6,$7) receipt'
      const proof = (await fms.query(sql, parameters)).rows[0].receipt
      expect(proof.contractVersion).toBe('orgmaster.fms-catalog-initialization-activation.v1')
      expect(proof.manifestSha256).toBe('3ceb1923576b054e17213bffb5557f74bb1bb1042068cb4fe07aae4103ab50ad')
      expect(proof.auditAfterHash).toBe(publicationSnapshotHash({ requestHash: proof.requestHash, previewHash: proof.previewHash, record: proof.record }))
      expect(proof.record).toEqual(receipt.financialCatalogActivation)
      expect((await fms.query(sql, ['other-principal', ...parameters.slice(1)])).rows[0].receipt).toBeNull()
      await expect(human.runtime.query(sql, parameters)).rejects.toThrow(/permission denied/)
      const after = await persistence.read('')
      expect(after.document.draft.managementGrants).toEqual(before.document.draft.managementGrants)
      expect(after.document.draft.roleAssignments.some(row => row.roleId === 'role-owner')).toBe(false)
      expect((after.document.draft as unknown as Record<string, unknown>).unpublishedBusinessMarker).toBe('preserve-only-in-draft')
      const consumerPath = process.env.DEV070_FMS_INITIALIZATION_CONSUMER_MODULE
      if (consumerPath) {
        const consumer = await import(/* @vite-ignore */ consumerPath)
        const handoff = { schemaVersion: 'fms.catalog-initialization-handoff.v1', operationId: initializationOperationId, initializationReceiptId: parameters[3], receiptBodySha256: 'c'.repeat(64),
          principalId: publisher.principalId, employeeId: publisher.employeeId, sourceRoleDefinitionHash: FINANCIAL_ADMINISTRATIVE_DEFINITION_HASH,
          issuance: { rootGrantId: root.root_grant_id, administrationVersion: String(root.administration_version), publishedPolicyId: root.published_policy_id, publishedAt: new Date(root.published_at).toISOString() }, release, previousRelease }
        expect(await consumer.readInitializationActivationConfirmation(fms, handoff, 'local_test')).toMatchObject({ status: 'committed', currentlyActive: true, orgCommandId: commandId })
        await expect(consumer.readInitializationActivationConfirmation(fms, { ...handoff, receiptBodySha256: 'd'.repeat(64) }, 'local_test')).rejects.toMatchObject({ code: 'INITIALIZATION_ACTIVATION_INVALID' })
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await new Promise<void>((resolve, reject) => ownerServer.close(error => error ? reject(error) : resolve()))
    }
  }, { platformRoot: process.env.DEV070_PLATFORM_ROOT })
}, 120000)
