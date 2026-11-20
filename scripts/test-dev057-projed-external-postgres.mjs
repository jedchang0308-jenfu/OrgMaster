import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withAdministrationPostgresFixture, prepareAdministrationInitializationFixture, drainAdministrationFixtureEvents, createAdministrativeHumanFixture } from './lib/dev070-administration-postgres-fixture.mjs'

const platformRoot = process.env.ORGMASTER_DEV057_PLATFORM_ROOT ?? 'C:/VIBE CODING/Jenfu-Platform'
const adapter = await import(pathToFileURL(resolve(platformRoot, 'scripts/lib/dev022-administration-lifecycle-fixture.mjs')).href)
let passed = 0
await withAdministrationPostgresFixture(async fixture => {
  const { admin, connect, handle } = fixture
  await admin.query('CREATE ROLE projed_runtime_disposable LOGIN')
  for (const name of (await readdir('db/migrations')).filter(name => /^\d{3}_.*\.sql$/.test(name) && Number(name.slice(0, 3)) >= 51 && Number(name.slice(0, 3)) <= 69).sort()) {
    await admin.query(await readFile(resolve('db/migrations', name), 'utf8'))
  }
  const runtime = await connect('orgmaster-prod-runtime@jenfu-platform-prod.iam')
  const consumer = await connect('projed_runtime_disposable')
  const platform = await connect('platform-prod-runtime@jenfu-platform-prod.iam')
  async function check(id, run) { await run(); passed++; console.log(`PASS ${id}`) }
  const notify = async request => (await runtime.query('SELECT orgmaster_core.notify_projed_external_request_v1($1::jsonb) result', [JSON.stringify(request)])).rows[0].result
  const read = async (invite, principal) => (await consumer.query('SELECT * FROM orgmaster_contract.read_projed_external_qualification_v1($1,$2)', [invite, principal])).rows
  const calendarPrincipal = async subject => (await consumer.query('SELECT * FROM orgmaster_contract.read_projed_calendar_principal_v1($1)', [subject])).rows
  await check('calendar-unregistered-owner-is-explicit-without-creating-a-principal', async () => {
    const rows = await calendarPrincipal('never-enrolled-' + randomUUID())
    assert.equal(rows.length, 1); assert.equal(rows[0].status, 'UNREGISTERED'); assert.equal(rows[0].principal_id, null)
  })
  const request = { contractVersion: 'orgmaster.projed-external-qualification.v1', action: 'submit', requestId: randomUUID(), invitationId: randomUUID(), inviterPrincipalId: 'principal-legacy', boardId: 'board-fixture', role: 'member', expiresAt: new Date(Date.now() + 3600000).toISOString(), contactEmail: 'external@example.invalid', company: '', note: '' }
  let row = await notify(request)
  await check('pending-notification-and-exact-replay', async () => {
    assert.equal(row.status, 'PENDING'); assert.equal(row.principalId, null)
    assert.deepEqual(await notify(request), row)
    await assert.rejects(notify({ ...request, boardId: 'other-board' }), /EXTERNAL_CONFLICT/)
    assert.deepEqual(await read(request.invitationId, 'untrusted'), [])
  })
  await check('consumer-read-only-ACL', async () => {
    await assert.rejects(consumer.query('SELECT * FROM orgmaster_core.projed_external_requests_v1'), /permission denied/)
    await assert.rejects(consumer.query("SELECT orgmaster_core.notify_projed_external_request_v1('{}')"), /permission denied/)
    await assert.rejects(consumer.query("SELECT orgmaster_core.manage_projed_external_request_v1('{}',NULL)"), /permission denied/)
  })
  await check('missing-or-forged-human-session-rejected', async () => {
    await assert.rejects(runtime.query("SELECT orgmaster_core.manage_projed_external_request_v1('{}',NULL)"))
    await assert.rejects(runtime.query('SELECT orgmaster_core.manage_projed_external_request_v1($1,NULL)', [JSON.stringify({ kind: 'principal', principalId: 'principal-legacy', sessionId: randomUUID() })]))
  })
  const initialization = await prepareAdministrationInitializationFixture(fixture)
  await initialization.initialize()
  await drainAdministrationFixtureEvents(fixture, adapter.createAdministrationLifecycleFixtureDispatch({ database: platform, handle }))
  await adapter.initializePrincipalForAdministrationFixture({ database: platform, handle, principalId: 'principal-legacy' })
  const human = await createAdministrativeHumanFixture(fixture)
  const actor = { ...human.actor, principalId: human.principalId }
  const manage = async command => (await runtime.query('SELECT orgmaster_core.manage_projed_external_request_v1($1,$2) result', [JSON.stringify(actor), command ? JSON.stringify(command) : null])).rows[0].result
  const command = (action, record = row) => ({ commandId: randomUUID(), requestId: record.requestId, expectedRevision: record.revision, action, note: 'isolated fixture' })
  await check('approve-before-provider-proof-remains-pending-and-cas', async () => {
    const approval = command('approve')
    row = await manage(approval)
    assert.equal(row.decision, 'APPROVED'); assert.equal(row.status, 'PENDING'); assert.equal(row.principalId, null)
    assert.deepEqual(await manage(approval), row)
    await assert.rejects(manage({ ...approval, commandId: randomUUID() }), /EXTERNAL_CONFLICT/)
  })
  const googleSubject = 'external-google-' + randomUUID()
  const publication = (await runtime.query('SELECT orgmaster_core.enroll_projed_principal_v1($1,$2,$3,$4,$5) result', [randomUUID(), 'https://securetoken.google.com/external-isolated', 'firebase-' + randomUUID(), googleSubject, new Date().toISOString()])).rows[0].result
  const binding = { contractVersion: request.contractVersion, action: 'bind', requestId: request.requestId, principalId: publication.principalId, googleSubject }
  await check('immutable-provider-pair-binding-and-principal-reuse', async () => {
    await assert.rejects(notify({ ...binding, googleSubject: 'unrelated' }), /EXTERNAL_IDENTITY_CONFLICT/)
    row = await notify(binding)
    assert.equal(row.status, 'ACTIVE'); assert.equal(row.principalId, publication.principalId)
    assert.deepEqual(await notify(binding), row)
    const result = await read(request.invitationId, publication.principalId)
    assert.equal(result.length, 1); assert.equal(result[0].status, 'ACTIVE'); assert.equal(result[0].board_id, request.boardId)
    assert.deepEqual(await read(request.invitationId, 'another-principal'), [])
    assert.equal((await calendarPrincipal(googleSubject))[0].principal_id, publication.principalId)
    assert.equal((await calendarPrincipal(googleSubject))[0].status, 'ACTIVE')
  })
  await check('real-session-epoch-fence', async () => {
    await assert.rejects(runtime.query('SELECT orgmaster_core.manage_projed_external_request_v1($1,NULL)', [JSON.stringify({ ...actor, principalAuthEpoch: actor.principalAuthEpoch + 1 })]), /IDENTITY_CONTEXT_REQUIRED/)
  })
  await check('missing-revocation-hook-fails-closed-and-rolls-back', async () => {
    await admin.query('CREATE SCHEMA projed_contract; GRANT USAGE ON SCHEMA projed_contract TO jenfu_orgmaster_migrator')
    await assert.rejects(manage(command('disable')), /PROJED_REVOCATION_CONTRACT_UNAVAILABLE/)
    assert.equal((await read(request.invitationId, publication.principalId))[0].status, 'ACTIVE')
    await admin.query(`CREATE TABLE projed_contract.fixture_revocations(subject text);
      CREATE FUNCTION projed_contract.invalidate_google_sessions_v1(text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'INSERT INTO projed_contract.fixture_revocations VALUES($1)';
      REVOKE ALL ON FUNCTION projed_contract.invalidate_google_sessions_v1(text) FROM PUBLIC;
      GRANT USAGE ON SCHEMA projed_contract TO jenfu_orgmaster_migrator;
      GRANT EXECUTE ON FUNCTION projed_contract.invalidate_google_sessions_v1(text) TO jenfu_orgmaster_migrator`)
    await runtime.query('BEGIN')
    await manage(command('disable'))
    await runtime.query('ROLLBACK')
    assert.equal((await read(request.invitationId, publication.principalId))[0].status, 'ACTIVE')
    assert.equal((await admin.query('SELECT count(*) count FROM projed_contract.fixture_revocations')).rows[0].count, '0')
  })
  await check('global-disable-and-restore-fence-personal-admission', async () => {
    // Mature an already bound/approved membership beyond its original invite
    // token window. Central restoration must preserve that relationship.
    await admin.query("UPDATE orgmaster_core.projed_external_requests_v1 SET expires_at=clock_timestamp()-interval '1 second' WHERE request_id=$1", [row.requestId])
    row = await manage(command('disable'))
    assert.equal(row.status, 'INACTIVE')
    assert.equal((await calendarPrincipal(googleSubject))[0].status, 'INACTIVE')
    assert.equal((await admin.query('SELECT count(*) count FROM projed_contract.fixture_revocations')).rows[0].count, '1')
    assert.equal((await read(request.invitationId, publication.principalId))[0].status, 'INACTIVE')
    assert.equal((await admin.query('SELECT status FROM orgmaster_core.projed_principal_admissions WHERE principal_id=$1', [publication.principalId])).rows[0].status, 'inactive')
    await assert.rejects(notify(binding), /EXTERNAL_CONFLICT/)
    row = await manage(command('restore'))
    assert.equal(row.status, 'ACTIVE')
    assert.ok(Date.parse(row.expiresAt) < Date.now())
    assert.equal((await admin.query('SELECT count(*) count FROM projed_contract.fixture_revocations')).rows[0].count, '2')
  })
  await check('withdrawn-request-never-reactivated-by-replayed-notification', async () => {
    const withdrawn = await notify({ contractVersion: request.contractVersion, action: 'withdraw', requestId: request.requestId })
    assert.equal(withdrawn.status, 'WITHDRAWN'); assert.equal((await notify(request)).status, 'WITHDRAWN')
    await assert.rejects(notify(binding), /EXTERNAL_CONFLICT/)
    await assert.rejects(manage(command('restore', withdrawn)), /EXTERNAL_CONFLICT/)
  })
  await check('rejection-affects-only-request-and-cannot-be-reopened', async () => {
    const rejectedRequest = { ...request, requestId: randomUUID(), invitationId: randomUUID() }
    const pending = await notify(rejectedRequest)
    const rejected = await manage(command('reject', pending))
    assert.equal(rejected.status, 'REJECTED'); assert.equal(rejected.approvedBy, human.principalId)
    await assert.rejects(notify({ ...binding, requestId: pending.requestId }), /EXTERNAL_CONFLICT/)
    assert.equal((await admin.query('SELECT status FROM orgmaster_core.projed_principal_admissions WHERE principal_id=$1', [publication.principalId])).rows[0].status, 'active')
    const workspace = await manage()
    assert.equal(workspace.requests.length, 2)
  })
}, { platformRoot })
console.log(JSON.stringify({ status: 'PASS', scope: 'ISOLATED_SYNTHETIC_ONLY', checks: passed, cleanup: 'task-owned manager completed' }))
