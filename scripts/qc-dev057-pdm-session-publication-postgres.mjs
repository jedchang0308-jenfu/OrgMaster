import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createServer as createHttpServer } from 'node:http'
import { performance } from 'node:perf_hooks'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import {
  withAdministrationPostgresFixture, prepareAdministrationInitializationFixture,
  createAdministrativeHumanFixture, createAdditionalAdministrationTargetFixture,
  drainAdministrationFixtureEvents,
} from './lib/dev070-administration-postgres-fixture.mjs'

// Node's test CLI loads compiled TypeScript via this repository's Vite.
import { createServer } from 'vite'
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
const { publishAfterOrgmasterPdmRevocation, reconcileOrgmasterPdmPublications } =
  await vite.ssrLoadModule('/server/orgmasterPdmPublication.ts')
const { withOrgmasterPdmRevocationClient } = await vite.ssrLoadModule('/server/orgmasterPdmPublication.ts')
const { createAdministrationRequestHandler } = await vite.ssrLoadModule('/server/orgmasterAdministrationApi.ts')
const { setVerifiedRequestIdentity } = await vite.ssrLoadModule('/server/orgmasterRequestIdentity.ts')
const { createPostgresManagedIdentityLifecycleRepository } = await vite.ssrLoadModule('/server/orgmasterManagedIdentityLifecycleRepository.ts')
const { closeOrgmasterPersistencePool } = await vite.ssrLoadModule('/server/orgmasterPersistenceRepository.ts')
const { administrativeDefinitionBindings } = await vite.ssrLoadModule('/src/governance/administrativeDefinitions.ts')
const platformRoot = process.env.DEV070_PLATFORM_FIXTURE_ROOT ?? 'C:/VIBE CODING/Jenfu-Platform'
const platformFixture = await import(pathToFileURL(resolve(platformRoot, 'scripts/lib/dev022-administration-lifecycle-fixture.mjs')).href)
await withAdministrationPostgresFixture(async fixture => {
  const { admin, connect, handle } = fixture
  for (const file of ['056_dev057_ai_pdm_session_authority.sql', '057_dev057_pdm_session_publication.sql']) {
    await admin.query(await readFile(new URL('../db/migrations/' + file, import.meta.url), 'utf8'))
  }
  const version = async () => (await admin.query(
    'SELECT authority_version::text AS version FROM orgmaster_core.persistence_authority',
  )).rows[0].version
  const definition = (await admin.query(`
    SELECT payload FROM orgmaster_core.persistence_artifacts artifact
    JOIN orgmaster_core.persistence_authority owner ON owner.active_batch_id = artifact.batch_id
    WHERE artifact.artifact_key='orgmaster-governance.v3.json'
  `)).rows[0].payload
  const policy = definition.publishedVersions.find(row => row.id === definition.activePolicyVersionId)
  const grant = policy.policy.roleAssignments.find(row => row.applicationId === 'ai-pdm')
  const org = await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
  const writer = await connect('postgres')
  await writer.query('SET jit=off')
  await org.query('SET jit=off')
  // The callback is synthetic. Use PostgreSQL for MVCC, savepoints, outbox and locking,
  // and the actual v6 impact reader against the modified publication in each pass.
  const apply = async () => {
    const affected = (await writer.query(`
      SELECT payload, batch_id FROM orgmaster_core.persistence_artifacts artifact
      JOIN orgmaster_core.persistence_authority owner ON owner.active_batch_id=artifact.batch_id
      WHERE artifact.artifact_key='orgmaster-governance.v3.json'
    `)).rows[0]
    const document = affected.payload
    const current = document.publishedVersions.find(row => row.id === document.activePolicyVersionId)
    current.policy.roleAssignments = current.policy.roleAssignments.filter(row => row.id !== grant.id)
    await writer.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb
      WHERE batch_id=$2 AND artifact_key='orgmaster-governance.v3.json'`, [JSON.stringify(document), affected.batch_id])
    await writer.query('UPDATE orgmaster_core.persistence_authority SET authority_version = authority_version + 1')
    return { published: true }
  }
  const transaction = async fn => {
    await writer.query('BEGIN')
    try { const result = await fn(); await writer.query('COMMIT'); return result }
    catch (error) { await writer.query('ROLLBACK'); throw error }
  }
  const receipts = new Map()
  let failure = 'prepare'
  const calls = []
  let phaseHook
  const client = {
    async readback(command) { return receipts.get(command.eventId) ?? null },
    async dispatch(command) {
      calls.push(command)
      const known = receipts.get(command.eventId)
      if (known) return known
      if (command.phase === failure) throw Error('TEST_RELAY_UNAVAILABLE')
      await phaseHook?.(command)
      const result = {
        contractVersion: 'ai-pdm.session-revocation-receipt.v1',
        eventId: command.eventId,
        operationId: command.operationId, phase: command.phase,
        digest: command.digest, receiptId: randomUUID(), appliedAt: new Date().toISOString(),
      }
      receipts.set(command.eventId, result)
      return result
    },
  }
  const base = await version()
  const options = {
    actor:'principal-legacy', commandKey:'scope-change', request: { action:'remove', id:grant.id },
    enabled:true, transaction, database:()=>writer, deliveryDatabase:()=>org, write:apply, client,
  }
  await assert.rejects(publishAfterOrgmasterPdmRevocation(options), /PDM_PUBLICATION_PENDING/)
  assert.equal(await version(), base, 'Failed dispatch leaves existing publication in effect')
  assert.equal((await org.query('SELECT * FROM orgmaster_core.pdm_session_publication_v1')).rowCount, 1)
  assert.deepEqual(calls[0].principalIds, ['principal-legacy'])
  await assert.rejects(publishAfterOrgmasterPdmRevocation({ ...options, commandKey:'overlap' }), /PDM_PUBLICATION_PENDING/)
  assert.equal(calls.length, 1, 'Overlapping operation never dispatches a second prepare')
  failure = 'published'
  phaseHook = async command => {
    if (command.phase === 'prepare') assert.equal(await version(), base)
  }
  assert.deepEqual(await publishAfterOrgmasterPdmRevocation(options), { published:true })
  assert.equal(await version(), (BigInt(base)+1n).toString())
  assert.equal(calls[1].eventId, calls[0].eventId)
  const proof = (await admin.query(
    'SELECT * FROM orgmaster_contract.read_ai_pdm_session_publication_v1($1,$2)',
    [calls[0].operationId, calls[0].publicationVersion],
  )).rows[0]
  assert.equal(proof.publication_version, calls[0].publicationVersion)
  failure = null
  assert.deepEqual(await reconcileOrgmasterPdmPublications(org, client), { selected:1, completed:1 })
  assert.equal(calls[3].eventId, calls[2].eventId, 'Terminal retry keeps the sealed event ID')
  const beforeNoop = calls.length
  await publishAfterOrgmasterPdmRevocation({ ...options, commandKey:'already-removed' })
  assert.equal(calls.length, beforeNoop, 'Effective no-op does not dispatch')
  assert.equal((await org.query('SELECT * FROM orgmaster_core.pdm_session_publication_v1')).rowCount, 1)
  const cancelPolicy = async () => {
    const document = structuredClone(definition)
    const affected = (await writer.query('SELECT active_batch_id AS id FROM orgmaster_core.persistence_authority')).rows[0]
    await writer.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb
      WHERE batch_id=$2 AND artifact_key='orgmaster-governance.v3.json'`, [JSON.stringify(document), affected.id])
    await writer.query('UPDATE orgmaster_core.persistence_authority SET authority_version = authority_version + 1')
  }
  phaseHook = async command => {
    if (command.phase === 'prepare') await admin.query(
      'UPDATE orgmaster_core.persistence_authority SET authority_version = authority_version + 1',
    )
  }
  await assert.rejects(publishAfterOrgmasterPdmRevocation({
    ...options, commandKey:'cancel-on-baseline-drift', request:{ action:'restore' }, write:cancelPolicy,
  }), /PDM_PUBLICATION_CONFLICT/)
  const cancelled = (await org.query(`SELECT operation_id, publication_version, decision, terminal_receipt
    FROM orgmaster_core.pdm_session_publication_v1 WHERE command_key='cancel-on-baseline-drift'`)).rows[0]
  assert.equal(cancelled.decision, 'cancelled')
  assert.equal(cancelled.terminal_receipt.phase, 'cancelled')
  assert.equal((await admin.query('SELECT * FROM orgmaster_contract.read_ai_pdm_session_publication_v1($1,$2)',
    [cancelled.operation_id, cancelled.publication_version])).rowCount, 0)
  assert.equal((await admin.query(`SELECT * FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6()
    WHERE assignment_id=$1`, [grant.id])).rowCount, 0)
  const initialization = await prepareAdministrationInitializationFixture(fixture)
  await initialization.initialize()
  const platform = await connect('platform-prod-runtime@jenfu-platform-prod.iam')
  const dispatchLifecycle = platformFixture.createAdministrationLifecycleFixtureDispatch({ database: platform, handle })
  await drainAdministrationFixtureEvents(fixture, dispatchLifecycle)
  await platformFixture.initializePrincipalForAdministrationFixture({ database: platform, handle, principalId: 'principal-legacy' })
  const human = await createAdministrativeHumanFixture(fixture)
  const target = await createAdditionalAdministrationTargetFixture(fixture)
  const administrativeGrant = await human.command('grant_application_administrator', {
    target: { principalId:target.principalId, employeeId:target.employeeId,
      applicationId:'ai-pdm', validFrom:'2026-01-01T00:00:00.000Z', validTo:null },
    catalogBindings: { 'ai-pdm': administrativeDefinitionBindings['ai-pdm'] },
  })
  const session = (await admin.query('SELECT * FROM orgmaster_core.app_sessions WHERE id=$1', [human.sessionId])).rows[0]
  const handler = createAdministrationRequestHandler(undefined, { lifecycle: { async runOnce() {} } })
  const server = createHttpServer(async (request, response) => {
    setVerifiedRequestIdentity(request, {
      id:human.sessionId, principalId:human.principalId, employeeId:human.employeeId,
      identityIssuer:session.identity_issuer, identitySubject:session.identity_subject,
      authenticatedAt:session.authenticated_at.toISOString(), assuranceLevel:session.assurance_level,
      principalAuthEpoch:Number(session.principal_auth_epoch), sessionSchemaVersion:2, epochKind:'principal',
    })
    const readBody = async () => {
      let body = ''
      for await (const chunk of request) body += chunk
      return JSON.parse(body)
    }
    await withOrgmasterPdmRevocationClient(client, () =>
      handler(request, response, process.cwd(), '/administrators/commands', readBody))
  })
  const settings = {
    ORGMASTER_PERSISTENCE_MODE:'cloud-sql',
    ORGMASTER_POSTGRES_URL:`postgresql://${encodeURIComponent('orgmaster-prod-runtime@jenfu-platform-prod.iam')}@127.0.0.1:${handle.port}/${handle.databaseName}?sslmode=disable`,
    ORGMASTER_PDM_SESSION_REVOCATION_ENABLED:'true',
  }
  const priorEnv = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]))
  Object.assign(process.env, settings)
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const httpCommit = () => fetch(origin + '/api/orgmaster/governance/administrators/commands', {
      method:'POST', headers:{ origin, 'content-type':'application/json' }, body:JSON.stringify(administrativeGrant),
    })
    const countCommands = async () => (await admin.query(
      'SELECT 1 FROM orgmaster_core.administrative_command_receipts_v1 WHERE command_id=$1', [administrativeGrant.commandId],
    )).rowCount
    failure = 'prepare'
    phaseHook = null
    const denied = await httpCommit()
    assert.equal(denied.status, 503, JSON.stringify(await denied.json()))
    assert.equal(await countCommands(), 0)
    failure = null
    phaseHook = async command => {
      if (command.phase === 'prepare') {
        assert.deepEqual(command.principalIds, [target.principalId])
        assert.equal(await countCommands(), 0)
      } else if (command.phase === 'published') {
        assert.equal(await countCommands(), 1)
      }
    }
    const applied = await httpCommit()
    const receipt = await applied.json()
    assert.equal(applied.status, 200, JSON.stringify(receipt))
    assert.equal(receipt.result, 'applied')
    assert.equal(await countCommands(), 1)
    assert.equal((await httpCommit()).status, 200)
    assert.equal(await countCommands(), 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await closeOrgmasterPersistencePool()
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  await drainAdministrationFixtureEvents(fixture, dispatchLifecycle)
  const scope = (await admin.query(
    'SELECT role_code FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6($1,$2)',
    [target.principalId, target.employeeId],
  )).rows
  assert.ok(scope.some(grant => grant.role_code === 'application_system_admin'))
  const pool = new pg.Pool({
    connectionString: settings.ORGMASTER_POSTGRES_URL, max: 4, ssl: false,
    options: '-c jit=off',
  })
  try {
    const lease = randomUUID()
    const queued = (await admin.query(`INSERT INTO orgmaster_core.managed_identity_refresh_outbox (
        identity_record_id, trigger, state, request_sequence, attempt_count, available_at,
        lease_version, lease_worker_id, lease_until
      ) VALUES ($1,'periodic','leased',nextval('orgmaster_core.managed_identity_refresh_request_seq'),
        1,clock_timestamp(),1,$2,clock_timestamp()+interval '60 seconds')
      ON CONFLICT (identity_record_id) WHERE state IN ('queued','leased','retry') DO UPDATE
      SET state='leased', lease_worker_id=$2, lease_until=clock_timestamp()+interval '60 seconds',
          lease_version=orgmaster_core.managed_identity_refresh_outbox.lease_version+1,
          rerun_requested=false
      RETURNING request_id, lease_version`, [target.identityId, lease])).rows[0]
    const repository = createPostgresManagedIdentityLifecycleRepository({ pool, pdmPublicationDatabase:pool })
    const control = { signal:new AbortController().signal, deadlineAt:performance.now()+30_000 }
    const executor = await repository.resolveExecutor(control)
    const claim = { requestId:queued.request_id, leaseGeneration:Number(queued.lease_version) }
    const state = () => admin.query(`SELECT link_state FROM orgmaster_core.managed_daily_identities
      WHERE identity_record_id=$1`, [target.identityId]).then(result => result.rows[0].link_state)
    const complete = () => withOrgmasterPdmRevocationClient(client, () => repository.completeRefresh(
      executor, lease, claim, { directoryState:'suspended', primaryEmail:'second@example.invalid', sourceEtag:null },
      control,
    ))
    failure = 'prepare'
    phaseHook = null
    const prior = await version()
    await assert.rejects(complete(), /PDM_PUBLICATION_PENDING/)
    assert.equal(await state(), 'active')
    assert.equal(await version(), prior)
    failure = null
    phaseHook = async command => {
      if (command.phase === 'prepare') {
        assert.deepEqual(command.principalIds, [target.principalId])
        assert.equal(await state(), 'active')
      } else if (command.phase === 'published') {
        assert.equal(await state(), 'conflict')
      }
    }
    assert.equal(await complete(), 'applied')
    assert.equal(await state(), 'conflict')
    assert.equal(await version(), (BigInt(prior)+1n).toString())
    assert.equal(await complete(), 'applied')
    assert.equal(await version(), (BigInt(prior)+1n).toString())
  } finally {
    await pool.end()
  }
  console.log('DEV-057 PDM publication: missing receipt, overlap, stable retry, atomic readback, terminal recovery, cancellation, no-op, normal administrative HTTP and Directory suspension PASS')
})
} finally { await vite.close() }
