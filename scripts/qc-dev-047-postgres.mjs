#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { classifyTarget, requiredCorrectionCases, resolvePostgresBin, resultExitCode, supportsServerVersion } from './lib/dev047-postgres-qc-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const suite = process.argv.find((value) => value.startsWith('--suite='))?.slice('--suite='.length) ?? 'dev047'
if (!['dev047', 'dev049'].includes(suite)) throw new Error(`Unsupported suite: ${suite}`)
const dev049 = suite === 'dev049'
const outputDir = path.join(root, 'qa', dev049 ? 'dev-049' : 'dev-047', 'postgres')
const outputPath = path.join(outputDir, 'manifest.json')
const migrations = fs.readdirSync(path.join(root, 'db', 'migrations')).filter((name) => /^\d{3}_.*\.sql$/u.test(name) && Number(name.slice(0, 3)) <= (dev049 ? 13 : 12)).sort()
const checks = []
const cleanup = { clientClosed: false, clusterStopped: false, portReleased: false, tempRemoved: false }
let client
let port
let taskRoot
let clusterDir
let postgresLog
let postgresBin
let postgresPid = null
let started = false
let firstFailure = null
let serverVersion = null
let interruptedBy = null
const migrationEvidence = []

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`)
  return result
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer(); server.unref(); server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address(); const selected = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(selected))
    })
  })
}
async function released(selectedPort) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: selectedPort }); socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}
async function check(id, label, task) {
  if (interruptedBy) throw new Error(`Interrupted by ${interruptedBy}`)
  try {
    const detail = await task()
    checks.push({ id, label, status: 'PASS', detail: detail ?? null })
    process.stdout.write(`PASS ${id} ${label}\n`)
  } catch (error) {
    checks.push({ id, label, status: 'FAIL', error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
async function transactionAs(role, task, database = client) {
  await database.query('BEGIN')
  try {
    await database.query(`SET LOCAL ROLE ${role}`)
    const result = await task(database)
    await database.query('COMMIT')
    return result
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
async function queryAs(role, text, values = [], database = client) { return transactionAs(role, (db) => db.query(text, values), database) }
async function expectDatabaseError(task, matcher) {
  try { await task() } catch (error) {
    if (typeof matcher === 'string') assert.match(String(error?.message), new RegExp(matcher, 'u'))
    else assert.equal(error?.code, matcher.code)
    return error
  }
  assert.fail('Expected database operation to fail')
}

function governanceFixture() {
  const role = { id: 'role-orgmaster-admin', applicationId: 'orgmaster', status: 'active' }
  const assignment = { employeeId: 'employee-legacy', applicationId: 'orgmaster', roleId: role.id, status: 'active', scope: { kind: 'global' }, validFrom: '2026-01-01T00:00:00.000Z' }
  return {
    app: 'OrgMaster', schemaVersion: 3, activePolicyVersionId: 'gov-active', draft: {}, auditEvents: [], commandReceipts: [], securityAlertIntents: [], sessionInvalidationOutbox: [],
    publishedVersions: [
      { id: 'gov-old', kind: 'assignment-governance-v3', versionNumber: 1, publishedAt: '2026-01-01T00:00:00.000Z', policy: { applications: [], identityLinks: [{ employeeId: 'employee-one', issuer: 'issuer-historical', subject: 'subject-historical', principalId: 'principal-old', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }], applicationRoles: [], roleAssignments: [] } },
      { id: 'gov-active', kind: 'assignment-governance-v3', versionNumber: 2, publishedAt: '2026-02-01T00:00:00.000Z', policy: { applications: [{ applicationId: 'orgmaster', status: 'active' }, { applicationId: 'ai-pdm', status: 'active' }], identityLinks: [{ employeeId: 'employee-legacy', issuer: 'issuer-legacy', subject: 'subject-legacy', principalId: 'principal-legacy', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }], applicationRoles: [role], roleAssignments: [assignment] } },
    ],
  }
}

async function bootstrap(dbName) {
  await client.query(`
    CREATE ROLE jenfu_platform_migrator NOLOGIN;
    CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
    CREATE ROLE jenfu_platform_runtime NOLOGIN;
    CREATE ROLE jenfu_orgmaster_runtime NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE ROLE jenfu_r1_verifier NOLOGIN;
    GRANT CREATE ON DATABASE ${dbName} TO jenfu_platform_migrator, jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_platform_migrator;
    CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS
      SELECT NULL::text AS application_id, NULL::text AS stable_role_id, NULL::text AS role_code,
             NULL::text AS subject_kind, false::boolean AS assignable, '{}'::jsonb AS allowed_scope_kinds,
             false::boolean AS delegation_allowed WHERE false;
    ALTER VIEW ai_pdm_contract.v_application_role_catalog_v1 OWNER TO jenfu_platform_migrator;
  `)
}

async function applyMigrations() {
  for (const name of migrations) {
    if (name === '012_dev047_managed_identity_bridge.sql') await seedPersistence()
    if (dev049 && name === '013_dev049_existing_google_primary_account_link.sql') {
      await client.query(`WITH fixture_clock AS (SELECT clock_timestamp() AS now) INSERT INTO orgmaster_core.managed_identity_candidate_leases(lease_id,token_hash_sha256,actor_binding_sha256,employee_id,employee_number,expected_primary_email,directory_customer_id,directory_user_id,primary_email,source_etag,workspace_revision,registry_revision,created_at,expires_at) SELECT '49000000-0000-4000-8000-000000000001',$1,$2,'employee-one','JFS0001','legacy@jenfu.example','customer-1','legacy-user','legacy@jenfu.example','legacy-etag',$3,'legacy-file-hash',now,now+interval '5 minutes' FROM fixture_clock`, ['a'.repeat(64), 'b'.repeat(64), '4'.repeat(64)])
    }
    const bytes = fs.readFileSync(path.join(root, 'db', 'migrations', name))
    await client.query(bytes.toString('utf8'))
    migrationEvidence.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
  }
}

function persistenceFixture() {
  const currentDocument = { kind: 'document', state: { employees: [
    { id: 'employee-one', status: 'active' }, { id: 'employee-two', status: 'active' },
    { id: 'employee-three', status: 'active' }, { id: 'employee-four', status: 'active' },
    { id: 'employee-legacy', status: 'active' }, { id: 'employee-inactive', status: 'inactive' },
  ] } }
  const oldDocument = { kind: 'document', state: { employees: [{ id: 'employee-old-snapshot', status: 'active' }] } }
  const artifacts = [
    ['orgmaster-workspace.v1.json', 'workspace-manifest', { currentVersionId: 'current' }],
    ['orgmaster-versions/current.json', 'workspace-version', currentDocument],
    ['orgmaster-versions/old.json', 'workspace-version', oldDocument],
    ['orgmaster-governance.v3.json', 'governance', governanceFixture()],
  ]
  return { currentDocument, oldDocument, artifacts }
}

async function seedPersistence() {
  const batchId = '47000000-0000-4000-8000-000000000001'
  const { artifacts } = persistenceFixture()
  await client.query(`INSERT INTO orgmaster_core.persistence_batches
    (id, source_revision, contract_version, source_manifest, artifact_count, media_count, source_bytes, status, imported_at, verified_at, activated_at)
    VALUES ($1, $2, 'jenfu.orgmaster-persistence.v1', '{}'::jsonb, $3, 0, 0, 'active', clock_timestamp(), clock_timestamp(), clock_timestamp())`, [batchId, '4'.repeat(64), artifacts.length])
  for (const [key, kind, payload] of artifacts) await client.query(`INSERT INTO orgmaster_core.persistence_artifacts
    (batch_id, artifact_key, artifact_kind, payload, source_sha256, canonical_sha256, source_bytes, imported_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $5, 0, clock_timestamp())`, [batchId, key, kind, JSON.stringify(payload), sha256(JSON.stringify(payload))])
  await client.query(`UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1, authority_version=1, updated_at=clock_timestamp(), updated_by='dev-047-qc', reason_code='isolated-fixture' WHERE singleton=true`, [batchId])
}

async function createIdentity(employeeId, employeeNumber, directoryUserId) {
  const assignment = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1($1,$2,'dev-047-qc',$3,$4,clock_timestamp())`, [employeeId, employeeNumber, '4'.repeat(64), dev049 ? '0' : null])
  const registryRevision = assignment.rows[0].revision
  const email = `${employeeNumber.toLowerCase()}@jenfu.example`
  const lease = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1($1,$2,$3,'customer-1',$4,$3,'etag-1',$5,$6,'actor-1')`, [employeeId, employeeNumber, email, directoryUserId, '4'.repeat(64), registryRevision])
  const confirmed = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1($1,$2,$3,$4,$5,'actor-1')`, [`confirm-${employeeId}`, employeeId, lease.rows[0].candidate_token, '4'.repeat(64), registryRevision])
  assert.equal(confirmed.rows[0].principal_id, `principal-managed:${confirmed.rows[0].identity_record_id}`)
  return { ...confirmed.rows[0], email, registryRevision }
}

function confirmFingerprint({ actor, employeeId, candidateToken, workspaceRevision, registryRevision }) {
  const hex = (value) => value === null ? '-' : Buffer.from(value, 'utf8').toString('hex').toLowerCase()
  const tokenHash = crypto.createHash('sha256').update(candidateToken).digest('hex')
  return crypto.createHash('sha256').update(['dev049.confirm.v1', actor, employeeId, tokenHash, workspaceRevision, registryRevision].map(hex).join('|')).digest('hex')
}

async function enableAdmission(evidence = 'qa://dev-049/postgres') {
  for (const applicationId of ['orgmaster', 'ai-pdm']) {
    const row = (await client.query(`SELECT support_revision FROM orgmaster_core.managed_identity_invalidation_applications WHERE application_id=$1`, [applicationId])).rows[0]
    await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.attest_managed_identity_invalidation_support_v1($1,$2,$3,'dev-049-qc')`, [applicationId, Number(row.support_revision), evidence])
  }
  await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.set_managed_identity_admission_v1(1,true,'dev-049-qc','dev049-enable')`)
}

async function runDev049Checks() {
  let candidate
  await check('D49-01', 'assignment-scoped revision and old-lease invalidation', async () => {
    const invalidated = await client.query(`SELECT invalidated_at IS NOT NULL AS invalidated FROM orgmaster_core.managed_identity_candidate_leases WHERE lease_id='49000000-0000-4000-8000-000000000001'`)
    assert.equal(invalidated.rows[0].invalidated, true)
    const first = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-one','JFS0001','dev-049-qc',$1,'0',clock_timestamp())`, ['4'.repeat(64)])
    assert.equal(first.rows[0].revision, '1')
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-two','JFS0002','dev-049-qc',$1,'0',clock_timestamp())`, ['4'.repeat(64)])
    const detail = await queryAs('jenfu_orgmaster_runtime', `SELECT employee_number,registry_revision FROM orgmaster_core.read_employee_managed_identity_v1('employee-one')`)
    assert.deepEqual(detail.rows, [{ employee_number: 'JFS0001', registry_revision: '1' }])
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-one','JFS0003','dev-049-qc',$1,'0',clock_timestamp())`, ['4'.repeat(64)]), 'MANAGED_IDENTITY_REVISION_CONFLICT')
    return { employeeOneRevision: detail.rows[0].registry_revision, unrelatedEmployeeDidNotInvalidate: true, oldLeaseInvalidated: true }
  })

  await check('D49-02', 'explicit primary email, redacted candidate DTO and receipt-first replay', async () => {
    const email = 'jedchang0308@jenfu.example'
    const lease = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1('employee-one','JFS0001',$1,'customer-1','directory-one',$1,'etag-1',$2,'1','actor-1')`, [email, '4'.repeat(64)])
    candidate = { token: lease.rows[0].candidate_token, email }
    const preflight = await queryAs('jenfu_orgmaster_runtime', `SELECT orgmaster_core.read_managed_identity_candidate_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1') AS result`, [candidate.token, '4'.repeat(64)])
    assert.equal(preflight.rows[0].result.kind, 'candidate')
    assert.equal(preflight.rows[0].result.snapshot.primaryEmail, email)
    const first = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1')`, [candidate.token, '4'.repeat(64)])
    const replayRead = await queryAs('jenfu_orgmaster_runtime', `SELECT orgmaster_core.read_managed_identity_candidate_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1') AS result`, [candidate.token, '4'.repeat(64)])
    const replay = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1')`, [candidate.token, '4'.repeat(64)])
    assert.equal(replayRead.rows[0].result.kind, 'replayed')
    assert.equal(replay.rows[0].identity_record_id, first.rows[0].identity_record_id)
    const fingerprint = confirmFingerprint({ actor: 'actor-1', employeeId: 'employee-one', candidateToken: candidate.token, workspaceRevision: '4'.repeat(64), registryRevision: '1' })
    const counts = await client.query(`SELECT (SELECT count(*)::int FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-one') AS identities,(SELECT count(*)::int FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='confirm-employee-one') AS receipts,(SELECT count(*)::int FROM orgmaster_core.managed_identity_audit_events WHERE command_id='confirm-employee-one' AND action='managed_identity_link_confirmed') AS audits,(SELECT request_hash_sha256 FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='confirm-employee-one') AS fingerprint`)
    assert.deepEqual(counts.rows[0], { identities: 1, receipts: 1, audits: 1, fingerprint })
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-2')`, [candidate.token, '4'.repeat(64)]), 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('new-command','employee-one',$1,$2,'1','actor-1')`, [candidate.token, '4'.repeat(64)]), 'MANAGED_IDENTITY_CANDIDATE_INVALID')
    return { identityRecordId: first.rows[0].identity_record_id, receiptFirstReplay: true, fingerprint }
  })

  await check('D49-03', 'pending alias, first bind, active no-op and canonical contract row', async () => {
    await enableAdmission()
    const alias = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.resolve_managed_identity_alias_v1('JFS0001')`)
    assert.equal(alias.rows[0].login_hint, candidate.email)
    assert.equal(alias.rows[0].link_state, 'directory_linked_pending_auth')
    const first = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1('employee-one','issuer-managed','subject-one',$1,'bind-one')`, [candidate.email])
    const second = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1('employee-one','issuer-managed','subject-one',$1,'bind-two')`, [candidate.email])
    assert.equal(first.rows[0].admission_revision, second.rows[0].admission_revision)
    const audits = await client.query(`SELECT count(*)::int AS count FROM orgmaster_core.managed_identity_audit_events WHERE action='managed_identity_auth_bound' AND employee_id='employee-one'`)
    assert.equal(audits.rows[0].count, 1)
    const canonical = await queryAs('jenfu_platform_runtime', `SELECT employee_id,mapping_version FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_issuer='issuer-managed' AND principal_subject='subject-one'`)
    assert.equal(canonical.rows.length, 1)
    assert.equal(canonical.rows[0].employee_id, 'employee-one')
    return { pendingAlias: true, admissionRevision: Number(first.rows[0].admission_revision), bindAuditCount: 1 }
  })

  await check('D49-04', 'confirm transaction rollback leaves no partial identity or receipt', async () => {
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-three','JFS0003','dev-049-qc',$1,'0',clock_timestamp())`, ['4'.repeat(64)])
    const email = 'rollback@jenfu.example'
    const lease = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1('employee-three','JFS0003',$1,'customer-1','directory-three',$1,'etag-3',$2,'1','actor-3')`, [email, '4'.repeat(64)])
    await client.query(`CREATE FUNCTION orgmaster_core.dev049_qc_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='managed_identity_link_confirmed' THEN RAISE EXCEPTION 'QC_CONFIRM_ROLLBACK'; END IF; RETURN NEW; END $$`)
    await client.query(`CREATE TRIGGER dev049_qc_reject_audit BEFORE INSERT ON orgmaster_core.managed_identity_audit_events FOR EACH ROW EXECUTE FUNCTION orgmaster_core.dev049_qc_reject_audit()`)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('rollback-command','employee-three',$1,$2,'1','actor-3')`, [lease.rows[0].candidate_token, '4'.repeat(64)]), 'QC_CONFIRM_ROLLBACK')
    const state = await client.query(`SELECT (SELECT count(*)::int FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-three') AS identities,(SELECT count(*)::int FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='rollback-command') AS receipts,(SELECT consumed_at IS NULL FROM orgmaster_core.managed_identity_candidate_leases WHERE token_hash_sha256=encode(public.digest(convert_to($1,'UTF8'),'sha256'),'hex')) AS reusable`, [lease.rows[0].candidate_token])
    assert.deepEqual(state.rows[0], { identities: 0, receipts: 0, reusable: true })
    await client.query(`DROP TRIGGER dev049_qc_reject_audit ON orgmaster_core.managed_identity_audit_events; DROP FUNCTION orgmaster_core.dev049_qc_reject_audit()`)
    return { rollbackAtomic: true, leasePreserved: true }
  })

  await check('D49-05', 'runtime remains routine-only and PUBLIC has no affected EXECUTE', async () => {
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.employee_number_assignments`), { code: '42501' })
    const privileges = await client.query(`SELECT has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.read_managed_identity_candidate_v1(text,text,text,text,text,text)','EXECUTE') AS runtime_execute, has_function_privilege('jenfu_platform_runtime','orgmaster_core.read_managed_identity_candidate_v1(text,text,text,text,text,text)','EXECUTE') AS public_execute`)
    assert.deepEqual(privileges.rows[0], { runtime_execute: true, public_execute: false })
    return { directTableReadDenied: true, runtimeExecute: true, publicExecute: false }
  })

  await check('D49-06', 'managed-login owner CAS, receipts, lifecycle barriers and ACL', async () => {
    const created = await createIdentity('employee-four', 'JFS0004', 'directory-four')
    const alias = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.resolve_managed_login_alias_v1('JFS0004')`)
    assert.equal(alias.rows.length, 1)
    assert.equal(alias.rows[0].link_state, 'directory_linked_pending_auth')
    assert.equal(Object.hasOwn(alias.rows[0], 'primary_email'), false)
    const pending = alias.rows[0]
    const commandId = '49000000-0000-4000-8000-000000000049'
    const requestHash = 'c'.repeat(64)
    const verifySql = `SELECT * FROM orgmaster_core.verify_managed_login_identity_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`
    const first = await queryAs('jenfu_orgmaster_runtime', verifySql, [commandId, requestHash, 'customer-1', 'directory-four', 'issuer-owner', 'subject-four', 'employee-four', pending.identity_record_id, pending.identity_revision, pending.registry_revision, pending.link_state, null, null, 'platform-caller-subject'])
    assert.equal(first.rows[0].link_state, 'active')
    assert.equal(first.rows[0].identity_revision, (BigInt(pending.identity_revision) + 1n).toString())
    assert.equal(first.rows[0].registry_revision, pending.registry_revision)
    const replay = await queryAs('jenfu_orgmaster_runtime', verifySql, [commandId, requestHash, 'customer-1', 'directory-four', 'issuer-owner', 'subject-four', 'employee-four', pending.identity_record_id, first.rows[0].identity_revision, pending.registry_revision, 'active', 'issuer-owner', 'subject-four', 'platform-caller-subject'])
    assert.equal(replay.rows[0].mapping_version, first.rows[0].mapping_version)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', verifySql, [commandId, 'd'.repeat(64), 'customer-1', 'directory-four', 'issuer-owner', 'subject-four', 'employee-four', pending.identity_record_id, first.rows[0].identity_revision, pending.registry_revision, 'active', 'issuer-owner', 'subject-four', 'platform-caller-subject']), 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
    const secondCommand = '49000000-0000-4000-8000-000000000050'
    const noop = await queryAs('jenfu_orgmaster_runtime', verifySql, [secondCommand, 'e'.repeat(64), 'customer-1', 'directory-four', 'issuer-owner', 'subject-four', 'employee-four', pending.identity_record_id, first.rows[0].identity_revision, pending.registry_revision, 'active', 'issuer-owner', 'subject-four', 'platform-caller-subject'])
    assert.equal(noop.rows[0].identity_revision, first.rows[0].identity_revision)
    const receipt = await client.query(`SELECT response_payload::text AS payload,(SELECT count(*)::int FROM orgmaster_core.managed_identity_audit_events WHERE command_id=$1 AND action='managed_login_identity_verified') AS audits FROM orgmaster_core.managed_identity_command_receipts WHERE command_id=$1`, [commandId])
    assert.equal(receipt.rows.length, 1)
    assert.equal(receipt.rows[0].audits, 1)
    assert.doesNotMatch(receipt.rows[0].payload, /@|token|primaryEmail/iu)
    const beforeLifecycle = await queryAs('jenfu_platform_runtime', `SELECT employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_issuer='issuer-owner' AND principal_subject='subject-four'`)
    assert.deepEqual(beforeLifecycle.rows, [{ employee_id: 'employee-four' }])
    await client.query(`INSERT INTO orgmaster_core.managed_identity_lifecycle_outbox(operation_id,employee_id,application_id,event_kind,actor,reason_code,status,next_attempt_at) VALUES ('qc-owner-barrier','employee-four','orgmaster','managed_identity_lifecycle_changed','qc','qc-barrier','pending',clock_timestamp()),('qc-legacy-barrier','employee-legacy','orgmaster','managed_identity_lifecycle_changed','qc','qc-barrier','pending',clock_timestamp())`)
    const blockedAlias = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.resolve_managed_login_alias_v1('JFS0004')`)
    const blockedRead = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.read_managed_login_identity_v1('customer-1','directory-four')`)
    const blockedMappings = await queryAs('jenfu_platform_runtime', `SELECT employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE employee_id IN ('employee-four','employee-legacy')`)
    assert.equal(blockedAlias.rows.length, 0)
    assert.equal(blockedRead.rows.length, 0)
    assert.equal(blockedMappings.rows.length, 0)
    const privileges = await client.query(`SELECT
      has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.resolve_managed_login_alias_v1(text)','EXECUTE') AS owner_alias,
      has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.read_managed_login_identity_v1(text,text)','EXECUTE') AS owner_read,
      has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.verify_managed_login_identity_v1(text,text,text,text,text,text,text,uuid,bigint,bigint,text,text,text,text)','EXECUTE') AS owner_verify,
      has_function_privilege('jenfu_platform_runtime','orgmaster_core.resolve_managed_login_alias_v1(text)','EXECUTE') AS platform_alias`)
    assert.deepEqual(privileges.rows[0], { owner_alias: true, owner_read: true, owner_verify: true, platform_alias: false })
    return { identityRecordId: created.identity_record_id, exactOneRevisionAdvance: true, registryRevisionStable: true, receiptReplay: true, lifecycleBarrierBranches: ['managed', 'legacy'], ownerOnlyAcl: true }
  })
}

async function main() {
  const target = classifyTarget(process.env)
  if (!target.ok) throw Object.assign(new Error(target.detail), { reasonCode: target.reasonCode })
  const runtime = resolvePostgresBin(process.env)
  if (!runtime.ok) throw Object.assign(new Error(runtime.detail), { reasonCode: runtime.reasonCode })
  postgresBin = runtime.bin
  taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), dev049 ? 'orgmaster-dev049-qc-' : 'orgmaster-dev047-qc-'))
  clusterDir = path.join(taskRoot, 'cluster'); postgresLog = path.join(taskRoot, 'postgres.log'); port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: { project: root, purpose: dev049 ? 'DEV-049 isolated PostgreSQL 001-013 QC' : 'DEV-047 isolated PostgreSQL 001-012 and A17-A22 QC', port, owningProcessTree: 'qc-dev-047-postgres.mjs -> task-owned PostgreSQL cluster', cleanupCondition: 'client closed, cluster stopped, port released, task temp removed', mutationScope: taskRoot, primaryDataWrites: false } })}\n`)
  run(path.join(postgresBin, 'initdb.exe'), ['-D', clusterDir, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-l', postgresLog, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  postgresPid = Number.parseInt(fs.readFileSync(path.join(clusterDir, 'postmaster.pid'), 'utf8').split(/\r?\n/u)[0], 10)
  const dbName = `${dev049 ? 'dev049' : 'dev047'}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  run(path.join(postgresBin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', dbName])
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/${dbName}`
  client = new pg.Client({ connectionString, application_name: dev049 ? 'orgmaster-dev049-qc' : 'orgmaster-dev047-qc' })
  await client.connect()
  serverVersion = (await client.query('SHOW server_version')).rows[0].server_version
  if (!supportsServerVersion(serverVersion)) throw Object.assign(new Error(`PostgreSQL 17/18 required; got ${serverVersion}`), { reasonCode: 'POSTGRES_VERSION_UNSUPPORTED' })
  await bootstrap(dbName); await applyMigrations()

  if (dev049) { await runDev049Checks(); return }

  let identityOne
  await check('A17', 'managed link, admission, first-login bind and active-principal mapping', async () => {
    identityOne = await createIdentity('employee-one', 'JFS0001', 'directory-one')
    const before = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.resolve_managed_identity_auth_v1($1)`, [identityOne.email])
    assert.equal(before.rowCount, 0)
    for (const applicationId of ['orgmaster', 'ai-pdm']) {
      const row = (await client.query(`SELECT support_revision FROM orgmaster_core.managed_identity_invalidation_applications WHERE application_id=$1`, [applicationId])).rows[0]
      await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.attest_managed_identity_invalidation_support_v1($1,$2,'qa://dev-047/a17','dev-047-qc')`, [applicationId, Number(row.support_revision)])
    }
    const enabled = await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.set_managed_identity_admission_v1(1,true,'dev-047-qc','a17-enable')`)
    assert.equal(enabled.rows[0].admission_enabled, true)
    const bound = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1('employee-one','issuer-managed','subject-one',$1,'bind-one')`, [identityOne.email])
    assert.equal(bound.rows[0].link_state, 'active')
    const visible = await queryAs('jenfu_platform_runtime', `SELECT employee_id, principal_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_issuer='issuer-managed' AND principal_subject='subject-one'`)
    assert.deepEqual(visible.rows, [{ employee_id: 'employee-one', principal_id: identityOne.principal_id }])
    return { identityRecordId: identityOne.identity_record_id, mappingVersion: Number(bound.rows[0].admission_revision) }
  })

  await check('A18', 'admission gate, legacy continuity and transactional invalidation rollback', async () => {
    const legacy = await queryAs('jenfu_platform_runtime', `SELECT employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy'`)
    assert.deepEqual(legacy.rows, [{ employee_id: 'employee-legacy' }])
    await client.query(`CREATE FUNCTION orgmaster_core.dev047_qc_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QC_OUTBOX_FAILURE'; END $$`)
    await client.query(`CREATE TRIGGER dev047_qc_reject_outbox BEFORE INSERT ON orgmaster_core.managed_identity_lifecycle_outbox FOR EACH ROW EXECUTE FUNCTION orgmaster_core.dev047_qc_reject_outbox()`)
    const authority = (await client.query(`SELECT revision FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true`)).rows[0]
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,false,'dev-047-qc','forced-failure')`, [Number(authority.revision)]), 'QC_OUTBOX_FAILURE')
    assert.equal((await client.query(`SELECT admission_enabled FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true`)).rows[0].admission_enabled, true)
    await client.query(`DROP TRIGGER dev047_qc_reject_outbox ON orgmaster_core.managed_identity_lifecycle_outbox; DROP FUNCTION orgmaster_core.dev047_qc_reject_outbox()`)
    return { rollbackPreservedAdmission: true, legacyMappingPreserved: true }
  })

  await check('A19', 'historical issuer-subject reservation blocks reassignment', async () => {
    const reserved = await client.query(`SELECT employee_id, source_kind FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer='issuer-historical' AND principal_subject='subject-historical'`)
    assert.deepEqual(reserved.rows, [{ employee_id: 'employee-one', source_kind: 'legacy' }])
    const identityTwo = await createIdentity('employee-two', 'JFS0002', 'directory-two')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1('employee-two','issuer-historical','subject-historical',$1,'bind-two')`, [identityTwo.email]), 'MANAGED_IDENTITY_IDENTITY_CONFLICT')
    return { reservationSource: 'gov-old', rejectedEmployee: 'employee-two' }
  })

  await check('A20', 'concurrent employee-number writers preserve singleton ownership', async () => {
    const peers = [new pg.Client({ connectionString }), new pg.Client({ connectionString })]
    await Promise.all(peers.map((peer) => peer.connect()))
    const results = await Promise.allSettled([
      queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-three','JFS0099','writer-a',$1,NULL,clock_timestamp())`, ['4'.repeat(64)], peers[0]),
      queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-four','JFS0099','writer-b',$1,NULL,clock_timestamp())`, ['4'.repeat(64)], peers[1]),
    ])
    await Promise.all(peers.map((peer) => peer.end()))
    assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1)
    assert.equal(results.filter((entry) => entry.status === 'rejected').length, 1)
    const owner = await client.query(`SELECT employee_id FROM orgmaster_core.employee_number_assignments WHERE employee_number='JFS0099'`)
    assert.equal(owner.rowCount, 1)
    return { owner: owner.rows[0].employee_id, successfulWriters: 1 }
  })

  await check('A21', 'budget, dedup, lease expiry, old-worker rejection and successor sequencing', async () => {
    const grants = []
    for (let index = 0; index < 61; index += 1) grants.push((await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.reserve_managed_directory_read_v1()`)).rows[0])
    assert.equal(grants.filter((row) => row.allowed).length, 60); assert.equal(grants[60].allowed, false)
    const queued = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.enqueue_managed_identity_refresh_v1('employee-one','manual','refresh-1','actor-1')`)
    const duplicate = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.enqueue_managed_identity_refresh_v1('employee-one','manual','refresh-2','actor-1')`)
    assert.equal(duplicate.rows[0].disposition, 'deduplicated'); assert.equal(duplicate.rows[0].request_id, queued.rows[0].request_id)
    const firstClaim = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.claim_managed_identity_refresh_v1('worker-old',1,30)`)
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.enqueue_managed_identity_refresh_v1('employee-one','domain','refresh-domain','actor-1')`)
    await client.query(`UPDATE orgmaster_core.managed_identity_refresh_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE request_id=$1`, [firstClaim.rows[0].request_id])
    const reclaimed = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.claim_managed_identity_refresh_v1('worker-new',1,30)`)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.complete_managed_identity_refresh_v1($1,'worker-old',$2,'customer-1','directory-one','present',$3,'etag-2','success')`, [firstClaim.rows[0].request_id, Number(firstClaim.rows[0].lease_version), identityOne.email]), 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT')
    const completed = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.complete_managed_identity_refresh_v1($1,'worker-new',$2,'customer-1','directory-one','present',$3,'etag-3','success')`, [reclaimed.rows[0].request_id, Number(reclaimed.rows[0].lease_version), identityOne.email])
    assert.equal(completed.rows[0].disposition, 'superseded')
    const successor = await client.query(`SELECT request_sequence, state FROM orgmaster_core.managed_identity_refresh_outbox WHERE identity_record_id=$1 ORDER BY request_sequence DESC LIMIT 1`, [identityOne.identity_record_id])
    assert.equal(successor.rows[0].state, 'queued'); assert.ok(Number(successor.rows[0].request_sequence) > Number(reclaimed.rows[0].request_sequence))
    return { allowedReads: 60, deniedReads: 1, reclaimedLeaseVersion: Number(reclaimed.rows[0].lease_version), successorSequence: Number(successor.rows[0].request_sequence) }
  })

  await check('A22', 'current-workspace read barrier and routine-only runtime ACL', async () => {
    const current = await client.query(`SELECT employee_id FROM orgmaster_core.v_current_workspace_employees_v1 ORDER BY employee_id`)
    assert.equal(current.rows.some((row) => row.employee_id === 'employee-old-snapshot'), false)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.employee_number_assignments`), { code: '42501' })
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `UPDATE orgmaster_core.employee_number_assignments SET updated_by='bypass' WHERE employee_id='employee-one'`), { code: '42501' })
    const callable = await queryAs('jenfu_orgmaster_runtime', `SELECT employee_id FROM orgmaster_core.read_employee_managed_identity_v1('employee-one')`)
    assert.deepEqual(callable.rows, [{ employee_id: 'employee-one' }])
    return { currentEmployeeCount: current.rowCount, oldSnapshotExcluded: true, directTableReadDenied: true, directTableWriteDenied: true }
  })
}

process.once('SIGINT', () => { interruptedBy = 'SIGINT' })
process.once('SIGTERM', () => { interruptedBy = 'SIGTERM' })
try { await main() } catch (error) { firstFailure = { reasonCode: error?.reasonCode ?? 'QC_EXECUTION_FAILED', code: error?.code ?? null, routine: error?.routine ?? null, where: error?.where ?? null, detail: error?.detail ?? null, message: error instanceof Error ? error.stack ?? error.message : String(error) } }
finally {
  if (client) { await client.end().catch(() => undefined); cleanup.clientClosed = true } else cleanup.clientClosed = true
  if (started) cleanup.clusterStopped = spawnSync(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-m', 'fast', '-w', 'stop'], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'ignore' }).status === 0
  else cleanup.clusterStopped = true
  if (port) cleanup.portReleased = await released(port); else cleanup.portReleased = true
  if (taskRoot) { try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); cleanup.tempRemoved = !fs.existsSync(taskRoot) } catch { cleanup.tempRemoved = false } } else cleanup.tempRemoved = true
}

const requiredCases = dev049 ? ['D49-01','D49-02','D49-03','D49-04','D49-05','D49-06'] : requiredCorrectionCases
const allRequiredPassed = requiredCases.every((id) => checks.some((entry) => entry.id === id && entry.status === 'PASS'))
const status = !firstFailure && allRequiredPassed && Object.values(cleanup).every(Boolean) ? 'PASS' : firstFailure?.reasonCode === 'POSTGRES_RUNTIME_MISSING' ? 'BLOCKED' : 'FAIL'
const manifest = {
  contract: dev049 ? 'DEV-049' : 'DEV-047', runner: dev049 ? 'DEV-049-postgres-qc-v1' : 'DEV-047-postgres-qc-v1', evidenceScope: 'TASK_OWNED_LOCAL_ISOLATED', status,
  generatedAt: new Date().toISOString(), productionWrites: false, executedCaseCount: checks.length,
  serverVersion, acceptedServerMajors: [17, 18], migrations: migrationEvidence, checks, firstFailure,
  source: {
    runnerSha256: sha256(fs.readFileSync(path.join(root, 'scripts', 'qc-dev-047-postgres.mjs'))),
    contractRunnerSha256: sha256(fs.readFileSync(path.join(root, 'scripts', dev049 ? 'qc-dev-049-contract.mjs' : 'qc-dev-047-contract.mjs'))),
    fixtureSha256: sha256(JSON.stringify(persistenceFixture())),
  },
  runtime: { project: root, purpose: dev049 ? 'DEV-049 isolated PostgreSQL validation' : 'DEV-047 isolated PostgreSQL validation', port, postgresPid, owningProcessTree: `node:${process.pid} -> postgres:${postgresPid ?? 'not-started'}`, mutationScope: taskRoot ?? null, interruptedBy, cleanup },
}
fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ status, evidence: outputPath, serverVersion, executedCaseCount: checks.length, cleanup, firstFailure }, null, 2)}\n`)
process.exitCode = dev049 ? (status === 'PASS' && checks.length === requiredCases.length && Object.values(cleanup).every(Boolean) ? 0 : 2) : resultExitCode(manifest)
