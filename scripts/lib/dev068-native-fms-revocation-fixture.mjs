import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { createOrgmasterFmsRevocationClient } from '../../server/orgmasterFmsRevocationClient.ts'

const app = 'financial-management-system'
const company = 'jenfu-machinery'
const epoch = '1:1'
const orgOrigin = 'http://localhost:1000'
const fmsOrigin = 'https://fms.example.invalid'
const ownerIssuer = 'https://accounts.google.com'
const ownerTerminal = 'SELECT * FROM orgmaster_contract.read_fms_session_publication_v1($1,$2)'
const httpMode = request => new URL(request.url).pathname.endsWith('/readback') ? 'readback' : 'dispatch'

/** Runs production transport and receipt parsing against two databases on the same disposable cluster. */
export async function withNativeFmsRevocation({ fixture, ownerDatabase, platformDatabase, fmsRoot, platformRoot,
  affected, unaffected }, exercise) {
  assert.equal(fixture.handle.targetClass, 'task-owned-local')
  assert.equal(fixture.handle.host, '127.0.0.1')
  const moduleAt = (root, file) => import(pathToFileURL(resolve(root, file)).href)
  const [{ createFmsRevocationHandler, createFmsRevocationRelay }, { createFmsRevocationReceiver, createPostgresFmsRevocationStore },
    { createFmsOwnerTerminalReader }, { createFmsRevocationCallerAuthenticator }, { seedFmsReviewerProjection }] = await Promise.all([
    moduleAt(platformRoot, 'src/lib/auth/fms-session-revocation-service.ts'),
    moduleAt(fmsRoot, 'lib/server/integration/session-revocations.ts'),
    moduleAt(fmsRoot, 'lib/server/integration/owner-session-revocations.ts'),
    moduleAt(fmsRoot, 'lib/server/integration/session-revocation-caller.ts'),
    moduleAt(fmsRoot, 'lib/server/integration/reviewer-projection.ts'),
  ])
  const { rows: workloads } = await fixture.admin.query(`SELECT owner,provider_subject,
    db_session_user || '.gserviceaccount.com' AS email FROM orgmaster_core.workload_principal_bindings
    WHERE purpose IN ('managed-identity-lifecycle','principal-lifecycle-invalidation') ORDER BY owner`)
  assert.deepEqual(workloads.map(row => row.owner), ['orgmaster', 'platform'])
  const [org, platform] = workloads
  const database = 'dev068_' + randomUUID().replaceAll('-', '')
  await fixture.admin.query('CREATE ROLE fms_migrator NOLOGIN; ALTER ROLE fms_runtime NOLOGIN')
  await fixture.admin.query(`CREATE DATABASE ${database} OWNER fms_migrator`)
  const local = new pg.Client({ host: fixture.handle.host, port: fixture.handle.port,
    database, user: 'postgres', ssl: false })
  try {
    await local.connect()
    await local.query("SET statement_timeout='15s'")
    const migrate = async file => local.query(await readFile(resolve(fmsRoot, 'db/postgres', file), 'utf8'))
    await migrate('001_dev065_session_foundation.sql')
    await local.query(`INSERT INTO fms_core.fms_database_identity(schema_version,deployment_mode,run_id)
      VALUES('fms.pg.session-foundation.v1','local_test','dev068-three-owner')`)
    for (const file of ['002_dev065_command_ledger_foundation.sql', '025_dev068_session_authorization.sql',
      '026_dev068_reviewer_projection.sql'])
      await migrate(file)
    for (const input of [affected, unaffected])
      await local.query(`INSERT INTO fms_core.principal_profile_links VALUES
        ($1,$2,$3,$3,$4,'human_personal','v1','active',now(),now())`, [app, company, input.principalId, input.employeeId])
    await local.query('SET ROLE fms_runtime')
    const provider = {
      readSnapshot: work => work(local),
      async serializable(work) {
        await local.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        try { const result = await work(local); await local.query('COMMIT'); return result }
        catch (error) { await local.query('ROLLBACK'); throw error }
      },
    }
    const baseline = await seedFmsReviewerProjection(provider, ownerDatabase, epoch)
    const capture = async principal => (await local.query(
      'SELECT fms_core.capture_authorization_revision_v1($1) AS revision', [principal])).rows[0].revision
    const oldTokens = new Map()
    for (const person of [affected, unaffected]) {
      const { principalId, employeeId } = person
      const token = randomBytes(32).toString('hex')
      const now = new Date().toISOString()
      const until = new Date(Date.now() + 600_000).toISOString()
      await local.query(`INSERT INTO fms_core.app_sessions
        (application_id,company_id,token_hash,session_id,source,identity_issuer,identity_subject,account_type,
         principal_id,employee_id,profile_id,profile_binding_version,mapping_version,typed_account_version,auth_epoch,
         authenticated_at,authenticated_at_source,created_at,created_at_source,expires_at,expires_at_source)
        VALUES($1,$2,$3,$3,'local_test','fixture-issuer',$4,'human_personal',$4,$5,$4,'v1','v1','v1',1,
          $6::text::timestamptz,$6,$6::text::timestamptz,$6,$7::text::timestamptz,$7)`,
      [app, company, token, principalId, employeeId, now, until])
      const snapshot = { applicationId: app, principalId, employeeId, assignmentVersion: 'fixture', governanceRevision: 'fixture' }
      const saved = await local.query('SELECT fms_core.store_session_authorization_v1($1,$2,$3,$4) AS stored',
        [principalId, token, await capture(principalId), { snapshot, authorizationEpoch: epoch }])
      assert.equal(saved.rows[0].stored, true)
      oldTokens.set(principalId, token)
    }
    const hasOldSession = async principal => (await local.query(
      'SELECT token_hash FROM fms_core.authorized_sessions_v1 WHERE principal_id=$1 AND token_hash=$2',
      [principal, oldTokens.get(principal)])).rowCount === 1
    const hasOldWrite = async principal => (await local.query(
      'SELECT fms_core.lock_finance_session_authorization_v1($1,$2,$3,$4) AS allowed',
      [principal, createHash('sha256').update(oldTokens.get(principal)).digest('hex'), 'fixture', 'fixture'])).rows[0].allowed
    assert.equal(await hasOldSession(affected.principalId), true)
    assert.equal(await hasOldWrite(affected.principalId), true)
    const receive = createFmsRevocationReceiver({
      store: createPostgresFmsRevocationStore(provider),
      readTerminalEvidence: createFmsOwnerTerminalReader(ownerDatabase, ownerDatabase),
      authenticate: createFmsRevocationCallerAuthenticator({ audience: fmsOrigin, database: ownerDatabase,
        async verify(token, audience) {
          assert.equal(token, 'isolated-platform')
          assert.equal(audience, fmsOrigin)
          const now = Math.floor(Date.now() / 1000)
          return { iss: ownerIssuer, aud: audience, sub: platform.provider_subject, email: platform.email,
            email_verified: true, iat: now - 1, exp: now + 60 }
        } }),
    })
    let prepared, terminal
    const relay = createFmsRevocationRelay({ targetOrigin: fmsOrigin, tokenProvider: async () => 'isolated-platform',
      async fetchImpl(url, init) {
        const request = new Request(url, init)
        const command = await request.clone().json()
        const mode = httpMode(request)
        let receipt
        try { receipt = await receive(request, () => request.json(), mode) }
        catch (error) { if (error.status === 404 && mode === 'readback') return new Response(null, { status: 404 }); throw error }
        if (mode === 'dispatch' && command.phase === 'prepare') {
          assert.equal(prepared, undefined)
          assert.equal(command.baselineVersion, baseline)
          assert.deepEqual(command.principalIds, [affected.principalId])
          assert.equal((await ownerDatabase.query(ownerTerminal, [command.operationId, command.terminalEventId])).rowCount, 0)
          assert.equal(await hasOldSession(affected.principalId), false)
          assert.equal(await hasOldWrite(affected.principalId), false)
          assert.equal(await capture(affected.principalId), null)
          assert.equal(await hasOldSession(unaffected.principalId), true)
          prepared = { command, receipt }
          throw new Error('lost first prepare response after the native FMS commit')
        }
        if (mode === 'dispatch' && command.phase === 'published') terminal = { command, receipt }
        return Response.json(receipt)
      },
    })
    const portal = createFmsRevocationHandler({ database: platformDatabase, audience: orgOrigin, relay,
      async verify(token, audience) {
        assert.equal(token, 'isolated-orgmaster')
        assert.equal(audience, orgOrigin)
        return { issuer: ownerIssuer, audience, subject: org.provider_subject, email: org.email }
      },
    })
    const producer = createOrgmasterFmsRevocationClient({ local: true, tokenProvider: async () => 'isolated-orgmaster',
      async fetch(url, init) {
        const request = new Request(url, init)
        const mode = httpMode(request)
        try { return Response.json(await portal(request, mode)) }
        catch (error) { if (error.status === 404 && mode === 'readback') return new Response(null, { status: 404 }); throw error }
      },
    })
    await exercise(producer)
    assert.ok(prepared && terminal)
    assert.equal(terminal.command.prepareReceiptId, prepared.receipt.receiptId)
    assert.equal(terminal.command.operationId, prepared.command.operationId)
    assert.deepEqual(await producer.readback(terminal.command), terminal.receipt)
    const { rows: [result] } = await local.query(`SELECT terminal_state,prepare_receipt_id,terminal_receipt_id
      FROM fms_core.authorization_revocations WHERE source_app='orgmaster' AND operation_id=$1`, [terminal.command.operationId])
    assert.deepEqual(result, { terminal_state: 'published', prepare_receipt_id: prepared.receipt.receiptId,
      terminal_receipt_id: terminal.receipt.receiptId })
    assert.equal(await hasOldSession(affected.principalId), false)
    assert.equal(await hasOldWrite(affected.principalId), false)
    assert.notEqual(await capture(affected.principalId), null)
    assert.equal(await hasOldSession(unaffected.principalId), true)
    console.log('PASS OrgMaster → Platform → FMS native change: revoke and block writes before publication, recover one prepare receipt, verify one linked terminal, keep unrelated session')
  } finally {
    await local.end()
    await fixture.admin.query(`DROP DATABASE ${database}`)
  }
}
