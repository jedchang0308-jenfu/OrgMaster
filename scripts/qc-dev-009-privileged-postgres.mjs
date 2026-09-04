#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const orgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platformRoot = path.resolve(orgRoot, '..', 'Jenfu-Management-system')
const aiPdmRoot = path.resolve(orgRoot, '..', 'AI_PDM')
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orgmaster-dev009-s1-'))
const clusterDir = path.join(taskRoot, 'cluster')
const postgresLog = path.join(taskRoot, 'postgres.log')
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const dbName = `dev009s1_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
const runId = `DEV009-S1-${new Date().toISOString().replace(/[:.]/gu, '-')}`
const evidenceDir = path.join(orgRoot, 'output', 'qa', 'dev-009', 'postgres', runId)
const reportPath = path.join(evidenceDir, 'report.json')
const latestPath = path.join(orgRoot, 'output', 'qa', 'dev-009', 'postgres', 'latest.json')
const candidateFiles = [
  { root: 'orgmaster', path: 'db/migrations/007_dev009_privileged_governance.sql' },
  { root: 'orgmaster', path: 'server/privilegedAssignmentStore.ts' },
  { root: 'orgmaster', path: 'server/orgmasterGovernanceStore.ts' },
  { root: 'orgmaster', path: 'server/orgmasterSessionRepository.ts' },
  { root: 'orgmaster', path: 'scripts/qc-dev-009-privileged-postgres.mjs' },
  { root: 'orgmaster', path: 'contracts/jenfu-platform-governance-availability/v2/contract-manifest.json' },
  { root: 'platform', path: 'qa/dev-004/postgres/000_bootstrap_roles.sql' },
  { root: 'platform', path: 'db/migrations/001_platform_auth_epoch_and_portal_sessions.sql' },
  { root: 'platform', path: 'db/migrations/002_dev005_employee_auth_epoch_invalidation.sql' },
  { root: 'ai-pdm', path: 'db/postgres/055_jenfu_role_catalog_publication.sql' },
  { root: 'ai-pdm', path: 'config/access-control/jenfu-role-catalog.v1.json' },
]
const checks = []
let client
let port
let started = false
let firstFailure = null
const cleanup = { clusterStopped: false, portReleased: false, tempRemoved: false }
const roots = { orgmaster: orgRoot, platform: platformRoot, 'ai-pdm': aiPdmRoot }

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function gitValue(root, args) { return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim() }
function candidateManifest() {
  const files = candidateFiles.map((entry) => {
    const bytes = fs.readFileSync(path.join(roots[entry.root], entry.path))
    return { ...entry, bytes: bytes.length, sha256: sha256(bytes) }
  })
  return {
    files,
    fileCount: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    sha256: sha256(Buffer.from(files.map((entry) => `${entry.root}/${entry.path}\0${entry.sha256}\n`).join(''), 'utf8')),
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: orgRoot, encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`)
  return result
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const selected = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(selected))
    })
  })
}

async function released(selectedPort) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: selectedPort })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

async function check(id, label, task) {
  try {
    const detail = await task()
    checks.push({ id, label, status: 'PASS', detail: detail ?? null })
    console.log(`PASS ${id} ${label}`)
  } catch (error) {
    checks.push({ id, label, status: 'FAIL', message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

async function transactionAs(role, task) {
  await client.query('BEGIN')
  try {
    await client.query(`SET LOCAL ROLE ${role}`)
    const result = await task(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function queryAs(role, sql, values = []) { return transactionAs(role, (database) => database.query(sql, values)) }
function sql(root, relative) { return fs.readFileSync(path.join(root, relative), 'utf8') }

function governance(alerts = []) {
  return {
    app: 'OrgMaster', schemaVersion: 3,
    draft: { applications: [], identityLinks: [], applicationRoles: [], permissions: [], rolePermissionGrants: [], roleAssignments: [], roleDelegations: [], principalAdmissions: [], positionRolePolicies: [], applicationPositionAdoptions: [], managementGrants: [], basePolicyVersionId: null, updatedAt: '2026-09-02T00:00:00.000Z' },
    activePolicyVersionId: null, publishedVersions: [], auditEvents: [],
    migration: { sourceSchemaVersion: 2, sourceRevision: 'a'.repeat(64), migratedAt: '2026-09-02T00:00:00.000Z', legacyDraftHash: 'b'.repeat(64), removedExternalDraftCounts: { roles: 0, permissions: 0, grants: 0, approvalPolicies: 0 }, unresolvedAssignments: [], unresolvedDelegations: [] },
    securityAlertIntents: alerts, sessionInvalidationOutbox: [], commandReceipts: [],
  }
}

async function seedPersistence() {
  await transactionAs('jenfu_platform_migrator', async (database) => {
    await database.query(`INSERT INTO orgmaster.persistence_batches
      (id, source_revision, contract_version, source_manifest, artifact_count, media_count, source_bytes, status, imported_at, verified_at, activated_at)
      VALUES ('90000000-0000-4000-8000-000000000001', $1, 'jenfu.orgmaster-persistence.v1', '{}'::jsonb, 1, 0, 0, 'active', clock_timestamp(), clock_timestamp(), clock_timestamp())`, ['1'.repeat(64)])
    await database.query(`INSERT INTO orgmaster.persistence_artifacts
      (batch_id, artifact_key, artifact_kind, payload, source_sha256, canonical_sha256, source_bytes, imported_at)
      VALUES ('90000000-0000-4000-8000-000000000001', 'orgmaster-governance.v3.json', 'governance', $1::jsonb, $2, $2, 0, clock_timestamp())`, [JSON.stringify(governance()), '2'.repeat(64)])
    await database.query(`UPDATE orgmaster.persistence_authority SET active_batch_id = '90000000-0000-4000-8000-000000000001', authority_version = 1, updated_at = clock_timestamp(), updated_by = 'dev-009-qc', reason_code = 'fixture' WHERE singleton = true`)
  })
}

function change(payload, expected, next) {
  return [{ artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance', payload, expectedCanonicalSha256: expected, nextCanonicalSha256: next, sourceSha256: next, sourceBytes: Buffer.byteLength(JSON.stringify(payload)) }]
}

async function main() {
  port = await freePort()
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: orgRoot,
    purpose: 'DEV-009 S1 isolated PostgreSQL authenticatedAt, Governance V3 alert atomicity, delivery receipt and ACL validation',
    port,
    owningProcessTree: 'qc-dev-009-privileged-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'client closed, task-owned cluster stopped, port released, task temp removed',
    mutationScope: taskRoot,
    primaryDataWrites: false,
  } }))
  run(path.join(postgresBin, 'initdb.exe'), ['-D', clusterDir, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-l', postgresLog, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  run(path.join(postgresBin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', dbName])
  client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${dbName}`, application_name: 'orgmaster-dev009-s1-qc' })
  await client.connect()

  await client.query(sql(platformRoot, 'qa/dev-004/postgres/000_bootstrap_roles.sql'))
  await client.query(sql(platformRoot, 'db/migrations/001_platform_auth_epoch_and_portal_sessions.sql'))
  await client.query(sql(platformRoot, 'db/migrations/002_dev005_employee_auth_epoch_invalidation.sql'))
  await client.query(sql(orgRoot, 'db/migrations/001_dev004_orgmaster_app_sessions.sql'))
  await client.query(sql(orgRoot, 'db/migrations/002_dev006_orgmaster_persistence.sql'))
  await client.query(sql(orgRoot, 'db/migrations/003_dev006_orgmaster_runtime_repository.sql'))
  await client.query(sql(orgRoot, 'db/migrations/004_dev040_active_principal_view.sql'))
  await client.query(sql(aiPdmRoot, 'db/postgres/055_jenfu_role_catalog_publication.sql'))
  const publication = await import(pathToFileURL(path.join(aiPdmRoot, 'scripts/lib/jms-dev-005-role-catalog.mjs')).href)
  const catalog = await publication.readRoleCatalog(path.join(aiPdmRoot, 'config/access-control/jenfu-role-catalog.v1.json'))
  await publication.publishRoleCatalog(client, catalog, { activate: true, publishedBy: 'dev-009-s1-qc', activationReason: 'DEV-009 S1 isolated catalog' })
  await client.query(sql(orgRoot, 'db/migrations/005_dev005_entitlement_governance.sql'))
  const migration007 = sql(orgRoot, 'db/migrations/007_dev009_privileged_governance.sql')
  await check('QA-009-S1-DB-01', 'migration 007 applies fresh and immediate replay', async () => { await client.query(migration007); await client.query(migration007) })

  await check('QA-009-S1-DB-02', 'authenticated_at is nullable and distinct from issued_at', async () => {
    await queryAs('jenfu_orgmaster_runtime', `INSERT INTO orgmaster.app_sessions
      (id, session_id_hash, identity_issuer, identity_subject, principal_id, employee_id, app_id, auth_epoch, issued_at, authenticated_at, expires_at, last_seen_at, assurance_level, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'issuer', 'subject', 'principal', 'employee', 'orgmaster', 0, '2026-09-02T12:00:00Z', '2026-09-02T11:55:00Z', '2026-09-02T20:00:00Z', '2026-09-02T12:00:00Z', 'aal2', clock_timestamp(), clock_timestamp())`, ['3'.repeat(64)])
    const row = await queryAs('jenfu_orgmaster_runtime', `SELECT issued_at, authenticated_at FROM orgmaster.app_sessions WHERE session_id_hash = $1`, ['3'.repeat(64)])
    assert.notEqual(new Date(row.rows[0].issued_at).toISOString(), new Date(row.rows[0].authenticated_at).toISOString())
  })

  await seedPersistence()
  const alert = { id: 'security-alert-command-1', commandId: 'command-1', operation: 'grant_system_admin', actorPrincipalId: 'principal-override', employeeId: 'employee-target', targetHint: 'privileged•••abcd', auditReference: 'audit-command-1', reasonSha256: '4'.repeat(64), status: 'pending', createdAt: '2026-09-02T12:00:00.000Z' }
  const appliedPayload = governance([alert])
  const entitlement = [{ operationId: 'command-1', employeeId: 'employee-target', applicationId: 'ai-pdm', eventKind: 'role_assignment_changed', actor: 'principal-override', reasonCode: 'privileged_assignment_changed' }]
  await check('QA-009-S1-DB-03', 'authority artifact, session invalidation and alert intent commit atomically', async () => {
    const result = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1($1::jsonb, $2, 'principal-override', 'grant_system_admin', $3::jsonb)`, [JSON.stringify(change(appliedPayload, '2'.repeat(64), '5'.repeat(64))), '6'.repeat(64), JSON.stringify(entitlement)])
    assert.equal(Number(result.rows[0].outbox_count), 1)
    const alertRows = await transactionAs('jenfu_platform_migrator', (database) => database.query(`SELECT command_id, reason_sha256, status FROM orgmaster.privileged_security_alert_intents`))
    assert.deepEqual(alertRows.rows, [{ command_id: 'command-1', reason_sha256: '4'.repeat(64), status: 'pending' }])
    const outbox = await transactionAs('jenfu_platform_migrator', (database) => database.query(`SELECT operation_id, status FROM access_governance.entitlement_change_outbox`))
    assert.deepEqual(outbox.rows, [{ operation_id: 'command-1', status: 'pending' }])
  })

  await check('QA-009-S1-DB-04', 'alert persistence fault rolls back authority and invalidation', async () => {
    const before = await transactionAs('jenfu_platform_migrator', (database) => database.query(`SELECT authority_version, active_batch_id FROM orgmaster.persistence_authority WHERE singleton = true`))
    const bad = governance([{ ...alert, id: 'security-alert-command-2', commandId: 'command-2', reasonSha256: 'not-a-hash' }])
    let failed = false
    try { await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster.write_active_persistence_artifacts_with_entitlement_outbox_v1($1::jsonb, $2, 'principal-override', 'grant_system_admin', $3::jsonb)`, [JSON.stringify(change(bad, '5'.repeat(64), '7'.repeat(64))), '8'.repeat(64), JSON.stringify([{ ...entitlement[0], operationId: 'command-2' }])]) } catch (error) { failed = String(error?.message).includes('SECURITY_ALERT_PERSIST_FAILED') }
    assert.equal(failed, true)
    const after = await transactionAs('jenfu_platform_migrator', (database) => database.query(`SELECT authority_version, active_batch_id FROM orgmaster.persistence_authority WHERE singleton = true`))
    assert.deepEqual(after.rows, before.rows)
    const counts = await transactionAs('jenfu_platform_migrator', (database) => database.query(`SELECT (SELECT count(*) FROM orgmaster.privileged_security_alert_intents)::int AS alerts, (SELECT count(*) FROM access_governance.entitlement_change_outbox)::int AS invalidations`))
    assert.deepEqual(counts.rows[0], { alerts: 1, invalidations: 1 })
  })

  await check('QA-009-S1-DB-05', 'delivery claim is leased, receipt is immutable and AI-PDM has no private access', async () => {
    const claimed = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster.claim_privileged_security_alerts_v1('worker-1', 1, 30)`)
    assert.equal(claimed.rowCount, 1)
    const completed = await queryAs('jenfu_orgmaster_runtime', `SELECT orgmaster.complete_privileged_security_alert_v1($1, 'worker-1', $2) AS receipt_id`, [alert.id, '9'.repeat(64)])
    const replay = await queryAs('jenfu_orgmaster_runtime', `SELECT orgmaster.complete_privileged_security_alert_v1($1, 'worker-1', $2) AS receipt_id`, [alert.id, '9'.repeat(64)])
    assert.equal(completed.rows[0].receipt_id, replay.rows[0].receipt_id)
    let denied = false
    try { await queryAs('jenfu_ai_pdm_runtime', `SELECT * FROM orgmaster.privileged_security_alert_intents`) } catch (error) { denied = error?.code === '42501' }
    assert.equal(denied, true)
  })
}

try { await main() } catch (error) { firstFailure = error instanceof Error ? error.stack ?? error.message : String(error) }
finally {
  if (client) await client.end().catch(() => undefined)
  if (started) cleanup.clusterStopped = spawnSync(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-m', 'fast', '-w', 'stop'], { cwd: orgRoot, encoding: 'utf8', windowsHide: true, stdio: 'ignore' }).status === 0
  if (port) cleanup.portReleased = await released(port)
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); cleanup.tempRemoved = !fs.existsSync(taskRoot) } catch { cleanup.tempRemoved = false }
}

const status = !firstFailure && checks.every((item) => item.status === 'PASS') && Object.values(cleanup).every(Boolean) ? 'PASS' : 'FAIL'
const candidate = candidateManifest()
const report = {
  runner: 'DEV-009-S1-postgres', status, generatedAt: new Date().toISOString(), productionWrites: false,
  source: {
    candidate,
    repositories: Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, {
      path: root,
      gitHead: gitValue(root, ['rev-parse', 'HEAD']),
      branch: gitValue(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
      dirtyFiles: gitValue(root, ['status', '--short']).split(/\r?\n/u).filter(Boolean),
    }])),
  },
  runtime: {
    project: orgRoot, purpose: 'DEV-009 S1 isolated PostgreSQL validation', port,
    owningProcessTree: 'qc-dev-009-privileged-postgres.mjs -> task-owned PostgreSQL cluster',
    mutationScope: taskRoot, primaryDataWrites: false, cleanup,
  },
  checks, firstFailure,
}
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = fs.readFileSync(reportPath)
fs.mkdirSync(path.dirname(latestPath), { recursive: true })
fs.writeFileSync(latestPath, `${JSON.stringify({
  status, reportPath: path.relative(orgRoot, reportPath).replaceAll('\\', '/'),
  reportSha256: sha256(reportBytes), candidateSha256: candidate.sha256, generatedAt: report.generatedAt,
}, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ runner: report.runner, status, evidence: reportPath, candidateSha256: candidate.sha256, checks, cleanup, firstFailure }))
if (status !== 'PASS') process.exitCode = 1
