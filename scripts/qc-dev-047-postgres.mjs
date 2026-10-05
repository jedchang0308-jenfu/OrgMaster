#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { prepareNativeAiPdmCatalog } from './lib/dev057-native-ai-pdm-catalog-postgres-qc.mjs'
import { employeeNumberCases, runEmployeeNumberChecks } from './lib/dev057-employee-number-postgres-qc.mjs'
import { classifyTarget, requiredCorrectionCases, resolvePostgresBin, resultExitCode, supportsServerVersion } from './lib/dev047-postgres-qc-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const suite = process.argv.find((value) => value.startsWith('--suite='))?.slice('--suite='.length) ?? 'dev047'
if (!['dev047', 'dev049', 'dev050', 'dev052', 'dev053', 'dev054', 'dev055', 'dev057'].includes(suite)) throw new Error(`Unsupported suite: ${suite}`)
const dev049 = suite === 'dev049'
const dev050 = suite === 'dev050'
const dev052 = suite === 'dev052'
const dev053 = suite === 'dev053'
const dev054 = suite === 'dev054'
const dev055 = suite === 'dev055'
const dev057 = suite === 'dev057'
const numberScope = process.argv.includes('--scope=employee-number-command')
if (numberScope && !dev057) throw new Error('NUMBER_COMMAND_SCOPE_REQUIRES_DEV057')
const dev055OrLater = dev055 || dev057
const dev049OrLater = dev049 || dev050 || dev052 || dev053 || dev054 || dev055 || dev057
const outputDir = path.join(root, dev057 ? 'dev-057' : dev049 ? 'dev-049' : dev050 ? 'dev-050' : dev052 ? 'dev-052' : dev053 ? 'dev-053' : dev054 ? 'dev-054' : dev055 ? 'dev-055' : 'dev-047', 'postgres')
const configuredDev057Output = process.env.DEV057_QC_OUTPUT_PATH?.trim()
const dev057ConsumerRoot = process.env.DEV057_CROSS_OWNER_AI_PDM_ROOT?.trim() || null
const packageReadOnly = process.env.DEV057_PACKAGE_READ_ONLY === '1'
if (packageReadOnly && (!dev057 || !dev057ConsumerRoot)) throw new Error('DEV057_PACKAGE_READ_REQUIRES_CROSS_OWNER_SUITE')
if (dev057ConsumerRoot && !dev057) throw new Error('DEV057_CONSUMER_PROBE_REQUIRES_DEV057_SUITE')
const outputPath = dev057 ? path.resolve(configuredDev057Output || path.join(os.tmpdir(), `orgmaster-dev057-postgres-${process.pid}.json`)) : path.join(outputDir, 'manifest.json')
if (dev057 && configuredDev057Output && fs.existsSync(outputPath)) throw new Error('DEV057_QC_OUTPUT_ALREADY_EXISTS')
const migrationCeiling = dev057 ? 30 : dev055 ? 20 : dev054 ? 19 : dev053 ? 17 : dev052 ? 16 : dev050 ? 15 : dev049 ? 13 : 12
const migrations = fs.readdirSync(path.join(root, 'db', 'migrations')).filter((name) => /^\d{3}_.*\.sql$/u.test(name) && Number(name.slice(0, 3)) <= migrationCeiling).sort()
const checks = []
const cleanup = { clientClosed: false, auxiliaryClientsClosed: false, clusterStopped: false, portReleased: false, tempRemoved: false }
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
let connectionString = null
let binderClient = null
let publisherClient = null
const auxiliaryClients = new Set()
let interruptedBy = null
const migrationEvidence = []
let dev057ContractSurfaceBefore = null
let dev057ContractSurfaceAfter = null

async function readDev057ContractSurface() {
  return (await client.query(`SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
      coalesce(c.relacl::text, '<default>') AS acl,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position)
        FROM information_schema.columns i
        WHERE i.table_schema=n.nspname AND i.table_name=c.relname), '[]'::jsonb) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='orgmaster_contract' AND c.relkind='v'
      AND c.relname = ANY($1::text[])
    ORDER BY c.relname`, [[
    'v_active_principal_mappings_v1',
    'v_orgmaster_session_principals_v1',
    'v_portal_app_visibility_v1',
  ]])).rows
}

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
  const assignment = { employeeId: 'employee-legacy', applicationId: 'orgmaster', roleId: role.id, status: 'active', ...(dev055OrLater ? { subjectKind: 'employee', targetPrincipalId: null } : {}), scope: { kind: 'global' }, validFrom: '2026-01-01T00:00:00.000Z' }
  const identityLink = { ...(dev055OrLater ? { id: 'identity-link-legacy' } : {}), employeeId: 'employee-legacy', issuer: 'issuer-legacy', subject: 'subject-legacy', principalId: 'principal-legacy', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
  const aiRole = { id: 'role-rd', applicationId: 'ai-pdm', status: 'active' }
  const aiAssignment = { id: 'assignment-ai-rd', employeeId: 'employee-legacy', applicationId: 'ai-pdm', roleId: aiRole.id, roleCodeSnapshot: 'rd', catalogVersion: 'ai-pdm.role-catalog.qc', status: 'active', subjectKind: 'employee', targetPrincipalId: null, basis: 'manual', sources: [], scope: { kind: 'workspace', value: 'company-jenfu' }, validFrom: '2026-01-01T00:00:00.000Z' }
  return {
    app: 'OrgMaster', schemaVersion: 3, activePolicyVersionId: 'gov-active', draft: {}, auditEvents: [], commandReceipts: [], securityAlertIntents: [], sessionInvalidationOutbox: [],
    publishedVersions: [
      { id: 'gov-old', kind: 'assignment-governance-v3', versionNumber: 1, publishedAt: '2026-01-01T00:00:00.000Z', policy: { applications: [], identityLinks: [{ employeeId: 'employee-one', issuer: 'issuer-historical', subject: 'subject-historical', principalId: 'principal-old', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }], applicationRoles: [], roleAssignments: [] } },
      { id: 'gov-active', kind: 'assignment-governance-v3', versionNumber: 2, publishedAt: '2026-02-01T00:00:00.000Z', ...(dev055OrLater ? { organizationSnapshot: { workspaceVersionId: 'current', workspaceRevision: '9'.repeat(64) } } : {}), policy: { applications: dev053 ? [{ id: 'orgmaster', status: 'active' }, { id: 'ai-pdm', status: 'active' }] : [{ id: 'orgmaster', applicationId: 'orgmaster', status: 'active' }, { id: 'ai-pdm', applicationId: 'ai-pdm', status: 'active' }], identityLinks: [identityLink], ...(dev055OrLater ? { principalAdmissions: [{ identityLinkId: identityLink.id, status: 'active', accountType: 'human_personal' }] } : {}), applicationRoles: dev055OrLater ? [role, aiRole] : [role], roleAssignments: dev055OrLater ? [assignment, aiAssignment] : [assignment] } },
    ],
  }
}

async function bootstrap(dbName) {
  await client.query(`
    CREATE ROLE jenfu_platform_migrator NOLOGIN;
    CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_platform_runtime NOLOGIN;
    CREATE ROLE jenfu_orgmaster_runtime NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE ROLE jenfu_r1_verifier NOLOGIN;
    GRANT CREATE ON DATABASE ${dbName} TO jenfu_platform_migrator, jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_platform_migrator;
    CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS
      ${dev057 ? "SELECT 'jenfu.application-role-catalog.v1'::text AS contract_version, 'ai-pdm'::text AS application_id,\n      'fixture-v3'::text AS catalog_version, now()::timestamptz AS published_at, repeat('0',64)::text AS catalog_sha256,\n      0::integer AS display_order, 'role-rd'::text AS stable_role_id, 'rd'::text AS role_code,\n      'RD fixture'::text AS display_name, true::boolean AS assignable, 'standard'::text AS risk,\n      'employee'::text AS subject_kind, true::boolean AS recommendation_allowed, true::boolean AS delegation_allowed,\n      '{\"workspace\":true}'::jsonb AS allowed_scope_kinds, 'standard'::text AS assignment_tier,\n      '[]'::jsonb AS permissions, '{}'::jsonb AS metadata, repeat('0',64)::text AS role_definition_hash" : "SELECT 'ai-pdm'::text AS application_id, 'role-rd'::text AS stable_role_id, 'rd'::text AS role_code,\n      'employee'::text AS subject_kind, true::boolean AS assignable, '{\"workspace\":true}'::jsonb AS allowed_scope_kinds,\n      false::boolean AS delegation_allowed"};
    ALTER VIEW ai_pdm_contract.v_application_role_catalog_v1 OWNER TO jenfu_platform_migrator;
    GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator;
    GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO jenfu_orgmaster_migrator;
  `)
}

async function activeGovernanceArtifact() {
  const result = await client.query(`SELECT artifact.batch_id::text AS batch_id, artifact.payload, trim(artifact.canonical_sha256) AS canonical_sha256
    FROM orgmaster_core.persistence_authority authority
    JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id
    WHERE authority.singleton=true AND artifact.artifact_key='orgmaster-governance.v3.json' AND artifact.artifact_kind='governance'`)
  assert.equal(result.rowCount, 1)
  return result.rows[0]
}

async function saveFixtureGovernance(payload) {
  const batch = await activeGovernanceArtifact()
  const bytes = Buffer.from(JSON.stringify(payload))
  const digest = sha256(bytes)
  await client.query(`UPDATE orgmaster_core.persistence_artifacts SET payload=$1::jsonb,source_sha256=$2,canonical_sha256=$2,source_bytes=$3
    WHERE batch_id=$4::uuid AND artifact_key='orgmaster-governance.v3.json'`, [JSON.stringify(payload), digest, bytes.length, batch.batch_id])
}

function appendGovernanceVersion(payload, activeVersion, id) {
  const next = structuredClone(payload)
  const versionNumber = Math.max(...next.publishedVersions.map((version) => Number(version.versionNumber) || 0)) + 1
  const version = { ...structuredClone(activeVersion), id, versionNumber, publishedAt: new Date().toISOString() }
  next.publishedVersions.push(version)
  next.activePolicyVersionId = id
  return { payload: next, version }
}

function governanceChange(payload, expectedCanonicalSha256) {
  const bytes = Buffer.from(JSON.stringify(payload))
  return [{
    artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance',
    expectedCanonicalSha256, nextCanonicalSha256: sha256(bytes), sourceSha256: sha256(bytes),
    sourceBytes: bytes.length, payload,
  }]
}

async function openAuxClient(applicationName) {
  const peer = new pg.Client({ connectionString, application_name: applicationName })
  auxiliaryClients.add(peer)
  await peer.connect()
  return peer
}

async function closeAuxClient(peer) {
  await peer.end().catch(() => undefined)
  auxiliaryClients.delete(peer)
}

async function applyMigrations() {
  for (const name of migrations) {
    if (name === '012_dev047_managed_identity_bridge.sql') await seedPersistence()
    if (dev049OrLater && name === '013_dev049_existing_google_primary_account_link.sql') {
      await client.query(`WITH fixture_clock AS (SELECT clock_timestamp() AS now) INSERT INTO orgmaster_core.managed_identity_candidate_leases(lease_id,token_hash_sha256,actor_binding_sha256,employee_id,employee_number,expected_primary_email,directory_customer_id,directory_user_id,primary_email,source_etag,workspace_revision,registry_revision,created_at,expires_at) SELECT '49000000-0000-4000-8000-000000000001',$1,$2,'employee-one','JFS0001','legacy@jenfu.example','customer-1','legacy-user','legacy@jenfu.example','legacy-etag',$3,'legacy-file-hash',now,now+interval '5 minutes' FROM fixture_clock`, ['a'.repeat(64), 'b'.repeat(64), currentWorkspaceRevision()])
    }
    const bytes = fs.readFileSync(path.join(root, 'db', 'migrations', name))
    if (dev057 && name === '021_dev057_identity_grant_writer_fence.sql') {
      dev057ContractSurfaceBefore = await readDev057ContractSurface()
      const identityId = '57000000-0000-4000-8000-000000000001'
      await client.query(`INSERT INTO orgmaster_core.managed_daily_identities(
          identity_record_id,employee_id,principal_id,directory_customer_id,directory_user_id,last_verified_primary_email,
          auth_issuer,auth_subject,link_state,admission_revision,admission_changed_at,created_by,updated_by
        ) VALUES ($1::uuid,'employee-four','principal-managed:' || $1::uuid::text,'dev057-preflight','collision','collision@jenfu.example',
          'issuer-legacy','subject-legacy','active',1,clock_timestamp(),'dev057-qc','dev057-qc')`, [identityId])
      await client.query(`INSERT INTO orgmaster_core.managed_identity_observations(identity_record_id,primary_email,directory_state,adapter_outcome,trusted_observed_at,last_attempt_at,freshness)
        VALUES ($1::uuid,'collision@jenfu.example','present','success',clock_timestamp(),clock_timestamp(),'fresh')`, [identityId])
      let preflightError = null
      try { await client.query(bytes.toString('utf8')) } catch (error) {
        preflightError = error
        await client.query('ROLLBACK').catch(() => undefined)
      }
      assert.match(String(preflightError?.message ?? ''), /ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS/u)
      await client.query('DELETE FROM orgmaster_core.managed_identity_observations WHERE identity_record_id=$1::uuid', [identityId])
      await client.query('DELETE FROM orgmaster_core.managed_daily_identities WHERE identity_record_id=$1::uuid', [identityId])
      checks.push({ id: 'D57-01', label: 'migration preflight rejects an existing legacy/managed active-principal collision before replacing views', status: 'PASS', detail: { expected: 'ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS', transactionRolledBack: true } })
      process.stdout.write('PASS D57-01 migration preflight rejects an existing active-principal collision\n')
    }
    if (dev057 && name === '024_dev057_principal_identity_invariants.sql') {
      const artifact = await activeGovernanceArtifact()
      const conflicting = structuredClone(artifact.payload)
      const active = conflicting.publishedVersions.find((version) => version.id === conflicting.activePolicyVersionId)
      active.policy.identityLinks.push({ id: 'identity-link-owner-conflict', employeeId: 'employee-two', issuer: 'issuer-owner-conflict', subject: 'subject-owner-conflict', principalId: 'principal-legacy', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' })
      active.policy.principalAdmissions.push({ identityLinkId: 'identity-link-owner-conflict', status: 'active', accountType: 'human_personal' })
      await saveFixtureGovernance(conflicting)
      let preflightError = null
      try { await client.query(bytes.toString('utf8')) } catch (error) {
        preflightError = error
        await client.query('ROLLBACK').catch(() => undefined)
      }
      assert.match(String(preflightError?.message ?? ''), /PRINCIPAL_HISTORY_OWNER_CONFLICT/u)
      await saveFixtureGovernance(artifact.payload)
      checks.push({ id: 'D57-10', label: 'migration rejects one principal assigned to two Employees without partial DDL', status: 'PASS', detail: { expected: 'PRINCIPAL_HISTORY_OWNER_CONFLICT', transactionRolledBack: true } })
      process.stdout.write('PASS D57-10 migration rejects cross-Employee principal ownership\n')
    }
    await client.query(bytes.toString('utf8'))
    if (dev057 && name === '021_dev057_identity_grant_writer_fence.sql') {
      dev057ContractSurfaceAfter = await readDev057ContractSurface()
    }
    migrationEvidence.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
  }
}

async function runDev050Checks() {
  await check('D50-01', 'app-scoped session principal view has frozen contract columns', async () => {
    const columns = await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='orgmaster_contract' AND table_name='v_orgmaster_session_principals_v1' ORDER BY ordinal_position`)
    assert.deepEqual(columns.rows, [
      { column_name: 'contract_version', data_type: 'text' },
      { column_name: 'principal_issuer', data_type: 'text' },
      { column_name: 'principal_subject', data_type: 'text' },
      { column_name: 'principal_id', data_type: 'text' },
      { column_name: 'employee_id', data_type: 'text' },
      { column_name: 'employee_status', data_type: 'text' },
      { column_name: 'mapping_version', data_type: 'bigint' },
      { column_name: 'published_at', data_type: 'timestamp with time zone' },
    ])
    return { columns: columns.rows.map((row) => row.column_name), contractVersion: 'orgmaster.session-principal.v1' }
  })

  await check('D50-02', 'view projects only active OrgMaster-assigned employees', async () => {
    const rows = await queryAs('jenfu_orgmaster_runtime', `SELECT contract_version,employee_id,employee_status FROM orgmaster_contract.v_orgmaster_session_principals_v1 ORDER BY employee_id`)
    assert.ok(rows.rows.every((row) => row.contract_version === 'orgmaster.session-principal.v1' && row.employee_status === 'active'))
    assert.ok(rows.rows.some((row) => row.employee_id === 'employee-legacy'), 'fixture OrgMaster employee missing')
    return { rowCount: rows.rowCount, employeeIds: rows.rows.map((row) => row.employee_id) }
  })

  await check('D50-03', 'runtime-only ACL does not broaden shared consumers', async () => {
    const privileges = await client.query(`SELECT
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_contract.v_orgmaster_session_principals_v1','SELECT') AS orgmaster_select,
      has_table_privilege('jenfu_platform_runtime','orgmaster_contract.v_orgmaster_session_principals_v1','SELECT') AS platform_select,
      has_table_privilege('jenfu_ai_pdm_runtime','orgmaster_contract.v_orgmaster_session_principals_v1','SELECT') AS ai_select,
      (SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='orgmaster_contract' AND c.relname='v_orgmaster_session_principals_v1') AS owner`)
    assert.deepEqual(privileges.rows[0], { orgmaster_select: true, platform_select: false, ai_select: false, owner: 'jenfu_orgmaster_migrator' })
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime', `SELECT * FROM orgmaster_contract.v_orgmaster_session_principals_v1`), { code: '42501' })
    return { owner: privileges.rows[0].owner, orgmasterSelect: true, platformSelect: false, aiPdmSelect: false }
  })

  await check('D50-04', 'shared active-principal contract remains unchanged and readable', async () => {
    const shared = await queryAs('jenfu_platform_runtime', `SELECT contract_version,employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 ORDER BY employee_id`)
    assert.ok(shared.rows.every((row) => row.contract_version === 'organization.active-principal.v1'))
    assert.ok(shared.rows.some((row) => row.employee_id === 'employee-legacy'))
    return { sharedRowCount: shared.rowCount, sharedContractVersion: 'organization.active-principal.v1' }
  })

  await check('D50-05', 'runtime session DML is restored without sibling or owner privileges', async () => {
    const privileges = await client.query(`SELECT
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_core.app_sessions','SELECT') AS orgmaster_select,
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_core.app_sessions','INSERT') AS orgmaster_insert,
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_core.app_sessions','UPDATE') AS orgmaster_update,
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_core.app_sessions','DELETE') AS orgmaster_delete,
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_core.app_sessions','TRUNCATE') AS orgmaster_truncate,
      has_table_privilege('jenfu_platform_runtime','orgmaster_core.app_sessions','SELECT') AS platform_select,
      has_table_privilege('jenfu_ai_pdm_runtime','orgmaster_core.app_sessions','SELECT') AS ai_select,
      (SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='orgmaster_core' AND c.relname='app_sessions') AS owner`)
    assert.deepEqual(privileges.rows[0], {
      orgmaster_select: true, orgmaster_insert: true, orgmaster_update: true, orgmaster_delete: true,
      orgmaster_truncate: false, platform_select: false, ai_select: false, owner: 'jenfu_orgmaster_migrator',
    })

    const id = '50000000-0000-4000-8000-000000000015'
    await queryAs('jenfu_orgmaster_runtime', `INSERT INTO orgmaster_core.app_sessions
      (id,session_id_hash,identity_issuer,identity_subject,principal_id,employee_id,app_id,auth_epoch,issued_at,expires_at,last_seen_at,revoked_at,revoke_reason,assurance_level,created_at,updated_at)
      VALUES ($1,$2,'https://securetoken.google.com/jenfu-test','runtime-session-subject','runtime-session-principal','employee-legacy','orgmaster',0,clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp(),NULL,NULL,'aal1',clock_timestamp(),clock_timestamp())`, [id, '5'.repeat(64)])
    const selected = await queryAs('jenfu_orgmaster_runtime', `SELECT id::text,revoked_at FROM orgmaster_core.app_sessions WHERE id=$1`, [id])
    assert.deepEqual(selected.rows, [{ id, revoked_at: null }])
    await queryAs('jenfu_orgmaster_runtime', `UPDATE orgmaster_core.app_sessions SET revoked_at=clock_timestamp(),revoke_reason='qc' WHERE id=$1`, [id])
    await queryAs('jenfu_orgmaster_runtime', `DELETE FROM orgmaster_core.app_sessions WHERE id=$1`, [id])
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime', `SELECT id FROM orgmaster_core.app_sessions LIMIT 1`), { code: '42501' })
    await expectDatabaseError(() => queryAs('jenfu_ai_pdm_runtime', `SELECT id FROM orgmaster_core.app_sessions LIMIT 1`), { code: '42501' })
    return { owner: privileges.rows[0].owner, dml: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], siblingRead: false, truncate: false }
  })
}

async function runDev052Checks() {
  await check('D52-01', 'lifecycle producer publishes the exact v1 contract and manifest', async () => {
    const events = await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='orgmaster_contract' AND table_name='v_managed_identity_lifecycle_events_v1' ORDER BY ordinal_position`)
    const principals = await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='orgmaster_contract' AND table_name='v_managed_identity_lifecycle_event_principals_v1' ORDER BY ordinal_position`)
    assert.deepEqual(events.rows, [
      { column_name: 'event_id', data_type: 'text' },
      { column_name: 'employee_id', data_type: 'text' },
      { column_name: 'event_kind', data_type: 'text' },
    ])
    assert.deepEqual(principals.rows, [
      { column_name: 'event_id', data_type: 'text' },
      { column_name: 'principal_issuer', data_type: 'text' },
      { column_name: 'principal_subject', data_type: 'text' },
    ])
    const manifest = await queryAs('jenfu_platform_migrator', `SELECT contract_version,signature_sha256,payload_sha256 FROM orgmaster_contract.v_contract_manifest_v1 WHERE contract_id='orgmaster.identity-lifecycle'`)
    assert.deepEqual(manifest.rows, [{ contract_version: 'jenfu.orgmaster-contract.managed-identity-lifecycle.v1', signature_sha256: '57771a5c7f2406245f724ee07f2c80ef95bd918dc9dbc66a2823a7a1626de5ee', payload_sha256: null }])
    return { eventColumns: events.rows.map((row) => row.column_name), principalColumns: principals.rows.map((row) => row.column_name), contractVersion: manifest.rows[0].contract_version }
  })

  await check('D52-02', 'producer exposes only Platform events and preserves reserved principals behind the lifecycle barrier', async () => {
    const rows = await client.query(`INSERT INTO orgmaster_core.managed_identity_lifecycle_outbox(operation_id,employee_id,application_id,event_kind,actor,reason_code,status,next_attempt_at) VALUES
      ('dev052-platform','employee-legacy','platform','managed_identity_lifecycle_changed','dev-052-qc','contract-check','pending',clock_timestamp()),
      ('dev052-orgmaster','employee-legacy','orgmaster','managed_identity_lifecycle_changed','dev-052-qc','contract-check','pending',clock_timestamp())
      RETURNING event_id::text,application_id`)
    const platformEvent = rows.rows.find((row) => row.application_id === 'platform').event_id
    const events = await queryAs('jenfu_platform_migrator', `SELECT event_id,employee_id,event_kind FROM orgmaster_contract.v_managed_identity_lifecycle_events_v1 ORDER BY event_id`)
    assert.deepEqual(events.rows, [{ event_id: platformEvent, employee_id: 'employee-legacy', event_kind: 'managed_identity_lifecycle_changed' }])
    const principals = await queryAs('jenfu_platform_migrator', `SELECT event_id,principal_issuer,principal_subject FROM orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1 ORDER BY principal_issuer,principal_subject`)
    assert.deepEqual(principals.rows, [{ event_id: platformEvent, principal_issuer: 'issuer-legacy', principal_subject: 'subject-legacy' }])
    const active = await queryAs('jenfu_platform_runtime', `SELECT employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE employee_id='employee-legacy'`)
    assert.equal(active.rowCount, 0)
    return { platformEvent, siblingEventCount: 0, reservedPrincipalCount: principals.rowCount, activeProjectionCount: active.rowCount }
  })

  await check('D52-03', 'only the Platform migrator can read lifecycle producer views', async () => {
    const privileges = await client.query(`SELECT
      has_table_privilege('jenfu_platform_migrator','orgmaster_contract.v_managed_identity_lifecycle_events_v1','SELECT') AS platform_migrator_events,
      has_table_privilege('jenfu_platform_migrator','orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1','SELECT') AS platform_migrator_principals,
      has_table_privilege('jenfu_platform_runtime','orgmaster_contract.v_managed_identity_lifecycle_events_v1','SELECT') AS platform_runtime_events,
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_contract.v_managed_identity_lifecycle_events_v1','SELECT') AS orgmaster_runtime_events`)
    assert.deepEqual(privileges.rows[0], { platform_migrator_events: true, platform_migrator_principals: true, platform_runtime_events: false, orgmaster_runtime_events: false })
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime', `SELECT * FROM orgmaster_contract.v_managed_identity_lifecycle_events_v1`), { code: '42501' })
    await expectDatabaseError(() => queryAs('jenfu_platform_migrator', `SELECT * FROM orgmaster_core.managed_identity_lifecycle_outbox`), { code: '42501' })
    return { leastPrivilege: true, directCoreReadDenied: true }
  })
}

async function runDev053Checks() {
  const applicationRows = async () => (await client.query(`SELECT application_id,status,support_state,support_revision::text,source_governance_version_id FROM orgmaster_core.managed_identity_invalidation_applications ORDER BY application_id`)).rows
  const governanceChange = async (payload) => {
    const observed = (await client.query(`SELECT artifact.canonical_sha256 FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=authority.active_batch_id AND artifact.artifact_key='orgmaster-governance.v3.json' WHERE authority.singleton=true`)).rows[0]
    return [{ artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance', expectedCanonicalSha256: observed.canonical_sha256, nextCanonicalSha256: sha256(JSON.stringify(payload)), sourceSha256: sha256(JSON.stringify(payload)), sourceBytes: Buffer.byteLength(JSON.stringify(payload)), payload }]
  }

  await check('D53-01', 'id-form applications backfill all required invalidation consumers at revision one', async () => {
    assert.deepEqual(await applicationRows(), [
      { application_id: 'ai-pdm', status: 'active', support_state: 'pending', support_revision: '1', source_governance_version_id: 'gov-active' },
      { application_id: 'orgmaster', status: 'active', support_state: 'pending', support_revision: '1', source_governance_version_id: 'gov-active' },
      { application_id: 'platform', status: 'active', support_state: 'pending', support_revision: '1', source_governance_version_id: 'gov-active' },
    ])
    const privileges = await client.query(`SELECT
      has_function_privilege('jenfu_orgmaster_migrator','orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(text)','EXECUTE') AS migrator_execute,
      has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(text)','EXECUTE') AS runtime_execute,
      has_function_privilege('jenfu_platform_migrator','orgmaster_core.synchronize_managed_identity_invalidation_applications_v1(text)','EXECUTE') AS platform_execute`)
    assert.deepEqual(privileges.rows[0], { migrator_execute: true, runtime_execute: false, platform_execute: false })
    return { applications: ['ai-pdm', 'orgmaster', 'platform'], revision: 1, directRuntimeExecute: false }
  })

  await check('D53-02', 'unchanged application set remains writable while admission is enabled', async () => {
    for (const applicationId of ['ai-pdm', 'orgmaster', 'platform']) {
      await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.attest_managed_identity_invalidation_support_v1($1,1,$2,'dev-053-qc')`, [applicationId, `qa://dev-053/${applicationId}`])
    }
    const enabled = await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.set_managed_identity_admission_v1(1,true,'dev-053-qc','enable')`)
    const payload = governanceFixture()
    payload.auditEvents = [{ id: 'dev053-same-set' }]
    const changes = await governanceChange(payload)
    const before = (await client.query(`SELECT authority_version::text FROM orgmaster_core.persistence_authority WHERE singleton=true`)).rows[0]
    const written = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev-053-qc','same-set','dev053-same-set','[]'::jsonb)`, [JSON.stringify(changes), '5'.repeat(64)])
    assert.equal(written.rows[0].authority_version, (BigInt(before.authority_version) + 1n).toString())
    assert.equal(enabled.rows[0].admission_enabled, true)
    return { authorityVersionAdvanced: true, admissionEnabled: true }
  })

  await check('D53-03', 'application-set changes fail atomically while admission is enabled and succeed after disable', async () => {
    const payload = governanceFixture()
    payload.publishedVersions.find((version) => version.id === payload.activePolicyVersionId).policy.applications = [{ id: 'orgmaster', status: 'active' }]
    const changes = await governanceChange(payload)
    const before = (await client.query(`SELECT authority_version::text,active_batch_id::text FROM orgmaster_core.persistence_authority WHERE singleton=true`)).rows[0]
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev-053-qc','remove-app','dev053-remove','[]'::jsonb)`, [JSON.stringify(changes), '6'.repeat(64)]), 'INVALIDATION_APPLICATION_SET_CHANGE_REQUIRES_ADMISSION_OFF')
    const rolledBack = (await client.query(`SELECT authority_version::text,active_batch_id::text FROM orgmaster_core.persistence_authority WHERE singleton=true`)).rows[0]
    assert.deepEqual(rolledBack, before)
    const authority = (await client.query(`SELECT revision::text FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true`)).rows[0]
    await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,false,'dev-053-qc','disable-for-set-change')`, [authority.revision])
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev-053-qc','remove-app','dev053-remove','[]'::jsonb)`, [JSON.stringify(changes), '6'.repeat(64)])
    const rows = await applicationRows()
    assert.equal(rows.find((row) => row.application_id === 'ai-pdm').status, 'inactive')
    assert.equal(rows.find((row) => row.application_id === 'orgmaster').status, 'active')
    assert.equal(rows.find((row) => row.application_id === 'platform').status, 'active')
    return { admissionOnRollback: true, admissionOffSetChange: true, mandatoryConsumersPreserved: ['orgmaster', 'platform'] }
  })
}

async function runDev054Checks() {
  const revisionFor = async (employeeId) => {
    const result = await client.query(`SELECT workspace_revision FROM orgmaster_core.v_current_workspace_employees_v1 WHERE employee_id=$1`, [employeeId])
    assert.equal(result.rowCount, 1)
    return result.rows[0].workspace_revision
  }

  await check('D54-01', 'exact employee, revision and assignment permit activation without correction', async () => {
    const revision = await revisionFor('employee-inactive')
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-inactive','JFS0098','dev-054-qc',$1,'0',clock_timestamp())`, [revision])
    const result = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-inactive',$1)`, [revision])
    assert.deepEqual(result.rows, [{ allowed: true, correction_required: false }])
    return { employeeId: 'employee-inactive', assignment: 'JFS0098', allowed: true, correctionRequired: false }
  })

  await check('D54-02', 'unresolved one-time legacy employee exemption permits activation with correction', async () => {
    const revision = await revisionFor('employee-one')
    const exemption = await client.query(`SELECT resolved_at FROM orgmaster_core.employee_number_legacy_exemptions WHERE employee_id='employee-one'`)
    assert.deepEqual(exemption.rows, [{ resolved_at: null }])
    const result = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-one',$1)`, [revision])
    assert.deepEqual(result.rows, [{ allowed: true, correction_required: true }])
    return { employeeId: 'employee-one', source: 'employee_number_legacy_exemptions', allowed: true, correctionRequired: true }
  })

  await check('D54-03', 'employee without assignment or unresolved exemption is rejected with correction', async () => {
    const revision = await revisionFor('employee-two')
    await client.query(`UPDATE orgmaster_core.employee_number_legacy_exemptions SET resolved_at=clock_timestamp() WHERE employee_id='employee-two'`)
    const result = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-two',$1)`, [revision])
    assert.deepEqual(result.rows, [{ allowed: false, correction_required: true }])
    return { employeeId: 'employee-two', allowed: false, correctionRequired: true }
  })

  await check('D54-04', 'workspace revision and employee drift fail closed without correction claim', async () => {
    const wrongRevision = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-one',$1)`, ['0'.repeat(64)])
    const missingEmployee = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-missing',$1)`, ['0'.repeat(64)])
    assert.deepEqual(wrongRevision.rows, [{ allowed: false, correction_required: false }])
    assert.deepEqual(missingEmployee.rows, [{ allowed: false, correction_required: false }])
    return { revisionDriftDenied: true, missingEmployeeDenied: true }
  })

  await check('D54-05', 'activation routine is owned by migrator and executable only by OrgMaster runtime', async () => {
    const privileges = await client.query(`SELECT
      has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.assert_employee_activation_v1(text,text)','EXECUTE') AS orgmaster_execute,
      has_function_privilege('jenfu_platform_runtime','orgmaster_core.assert_employee_activation_v1(text,text)','EXECUTE') AS platform_execute,
      has_function_privilege('jenfu_ai_pdm_runtime','orgmaster_core.assert_employee_activation_v1(text,text)','EXECUTE') AS ai_pdm_execute,
      (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='orgmaster_core' AND p.proname='assert_employee_activation_v1') AS owner`)
    assert.deepEqual(privileges.rows, [{ orgmaster_execute: true, platform_execute: false, ai_pdm_execute: false, owner: 'jenfu_orgmaster_migrator' }])
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-one',$1)`, ['0'.repeat(64)]), { code: '42501' })
    await expectDatabaseError(() => queryAs('jenfu_ai_pdm_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-one',$1)`, ['0'.repeat(64)]), { code: '42501' })
    return { owner: 'jenfu_orgmaster_migrator', orgmasterRuntimeExecute: true, siblingExecute: false }
  })

  await check('D54-06', 'workspace fence uses the current artifact canonical SHA instead of the persistence batch source revision', async () => {
    const observed = await client.query(`SELECT
      b.source_revision AS batch_source_revision,
      v.workspace_revision
      FROM orgmaster_core.persistence_authority a
      JOIN orgmaster_core.persistence_batches b ON b.id=a.active_batch_id
      JOIN orgmaster_core.v_current_workspace_employees_v1 v ON v.employee_id='employee-inactive'
      WHERE a.singleton=true`)
    assert.equal(observed.rowCount, 1)
    assert.equal(observed.rows[0].workspace_revision, currentWorkspaceRevision())
    assert.notEqual(observed.rows[0].batch_source_revision, observed.rows[0].workspace_revision)
    const canonical = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-inactive',$1)`, [observed.rows[0].workspace_revision])
    const batchSource = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assert_employee_activation_v1('employee-inactive',$1)`, [observed.rows[0].batch_source_revision])
    assert.deepEqual(canonical.rows, [{ allowed: true, correction_required: false }])
    assert.deepEqual(batchSource.rows, [{ allowed: false, correction_required: false }])
    return { canonicalRevisionAccepted: true, batchSourceRevisionRejected: true, revisionsAreDistinct: true }
  })
}

async function runDev055Checks() {
  const enableEmployeeAuthority = async () => {
    await client.query(`INSERT INTO orgmaster_core.employee_authority_overrides
      (application_id,employee_id,authority_source,authority_version,updated_at,operation_id,actor,reason)
      VALUES ('ai-pdm','employee-legacy','orgmaster_authority',2,clock_timestamp(),'dev055-qc','dev-055-qc','projection-contract-qc')
      ON CONFLICT (application_id,employee_id) DO UPDATE SET authority_source=EXCLUDED.authority_source, authority_version=EXCLUDED.authority_version, updated_at=EXCLUDED.updated_at, operation_id=EXCLUDED.operation_id, actor=EXCLUDED.actor, reason=EXCLUDED.reason`)
  }

  await check('D55-01', 'contract projections keep their frozen columns and owners', async () => {
    const columns = async (view) => (await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='orgmaster_contract' AND table_name=$1 ORDER BY ordinal_position`, [view])).rows
    assert.deepEqual((await columns('v_ai_pdm_entitlement_authority_v1')).map((row) => row.column_name), ['contract_version','application_id','authority_source','authority_version','employee_id','updated_at','operation_id'])
    assert.deepEqual((await columns('v_ai_pdm_effective_role_assignments_v1')).map((row) => row.column_name), ['contract_version','assignment_version_id','assignment_version','assignment_id','grant_kind','delegation_id','application_id','identity_issuer','identity_subject','principal_id','employee_id','subject_kind','target_principal_id','stable_role_id','role_code','catalog_version','scope_kind','scope_key','valid_from','valid_until','published_at','authority_version'])
    assert.deepEqual((await columns('v_portal_app_visibility_v1')).map((row) => row.column_name), ['application_id','principal_issuer','principal_subject','assignment_version','visibility_state'])
    const owners = await client.query(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='orgmaster_contract' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [['v_ai_pdm_entitlement_authority_v1','v_ai_pdm_effective_role_assignments_v1','v_portal_app_visibility_v1']])
    assert.ok(owners.rows.every((row) => row.owner === 'jenfu_orgmaster_migrator'))
    return { views: owners.rows.map((row) => row.relname), owner: 'jenfu_orgmaster_migrator' }
  })

  await check('D55-02', 'current principal mapping preserves existing AI-PDM authority, roles and portal visibility', async () => {
    await enableEmployeeAuthority()
    const mapping = await queryAs('jenfu_platform_runtime', `SELECT employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE employee_id='employee-legacy'`)
    const authority = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id,authority_source,authority_version::text FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1 WHERE employee_id='employee-legacy'`)
    const effective = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id,stable_role_id,role_code,scope_kind,scope_key FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 WHERE employee_id='employee-legacy'`)
    const portal = await queryAs('jenfu_platform_runtime', `SELECT application_id,visibility_state FROM orgmaster_contract.v_portal_app_visibility_v1 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy' ORDER BY application_id`)
    assert.deepEqual(mapping.rows, [{ employee_id: 'employee-legacy' }])
    assert.deepEqual(authority.rows, [{ employee_id: 'employee-legacy', authority_source: 'orgmaster_authority', authority_version: '2' }])
    assert.deepEqual(effective.rows, [{ employee_id: 'employee-legacy', stable_role_id: 'role-rd', role_code: 'rd', scope_kind: 'workspace', scope_key: 'company-jenfu' }])
    assert.deepEqual(portal.rows, [{ application_id: 'ai-pdm', visibility_state: 'visible' }, { application_id: 'orgmaster', visibility_state: 'visible' }])
    return { preservedEmployee: 'employee-legacy', applications: portal.rows.map((row) => row.application_id), role: 'rd' }
  })

  await check('D55-03', 'workspace canonical revision drift does not require governance republish', async () => {
    const before = await queryAs('jenfu_ai_pdm_runtime', `SELECT assignment_id,employee_id,role_code FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 ORDER BY assignment_id`)
    await client.query(`UPDATE orgmaster_core.persistence_artifacts SET canonical_sha256=$1 WHERE artifact_key='orgmaster-versions/current.json'`, ['a'.repeat(64)])
    const governance = await client.query(`SELECT version.value#>>'{organizationSnapshot,workspaceRevision}' AS frozen_revision FROM orgmaster_core.persistence_authority authority JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id JOIN orgmaster_core.persistence_artifacts artifact ON artifact.batch_id=batch.id AND artifact.artifact_key='orgmaster-governance.v3.json' CROSS JOIN LATERAL jsonb_array_elements(artifact.payload->'publishedVersions') version(value) WHERE authority.singleton=true AND version.value->>'id'=artifact.payload->>'activePolicyVersionId'`)
    const after = await queryAs('jenfu_ai_pdm_runtime', `SELECT assignment_id,employee_id,role_code FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 ORDER BY assignment_id`)
    assert.equal(governance.rows[0].frozen_revision, '9'.repeat(64))
    assert.notEqual(governance.rows[0].frozen_revision, 'a'.repeat(64))
    assert.deepEqual(after.rows, before.rows)
    return { frozenGovernanceRevision: governance.rows[0].frozen_revision, currentWorkspaceRevision: 'a'.repeat(64), effectiveAssignmentsStable: true }
  })

  await check('D55-04', 'pending managed identity remains absent from authority, roles and portal visibility', async () => {
    const identityId = '55000000-0000-4000-8000-000000000001'
    await client.query(`INSERT INTO orgmaster_core.managed_daily_identities(identity_record_id,employee_id,principal_id,directory_customer_id,directory_user_id,last_verified_primary_email,link_state,created_by,updated_by)
      VALUES ($1::uuid,'employee-two','principal-managed:' || $1::uuid::text,'customer-1','directory-pending','pending@jenfu.example','directory_linked_pending_auth','dev-055-qc','dev-055-qc')`, [identityId])
    const authority = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1 WHERE employee_id='employee-two'`)
    const effective = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 WHERE employee_id='employee-two'`)
    const portal = await queryAs('jenfu_platform_runtime', `SELECT application_id FROM orgmaster_contract.v_portal_app_visibility_v1 WHERE principal_subject='pending-subject'`)
    assert.equal(authority.rowCount, 0); assert.equal(effective.rowCount, 0); assert.equal(portal.rowCount, 0)
    return { employeeId: 'employee-two', linkState: 'directory_linked_pending_auth', projectedRows: 0 }
  })

  await check('D55-05', 'consumer ACL is preserved and historical compatibility views remain untouched', async () => {
    const privileges = await client.query(`SELECT
      has_table_privilege('jenfu_platform_runtime','orgmaster_contract.v_portal_app_visibility_v1','SELECT') AS platform_visibility,
      has_table_privilege('jenfu_ai_pdm_runtime','orgmaster_contract.v_ai_pdm_entitlement_authority_v1','SELECT') AS ai_authority,
      has_table_privilege('jenfu_ai_pdm_runtime','orgmaster_contract.v_ai_pdm_effective_role_assignments_v1','SELECT') AS ai_effective,
      has_table_privilege('jenfu_orgmaster_runtime','orgmaster_contract.v_ai_pdm_effective_role_assignments_v1','SELECT') AS orgmaster_effective`)
    assert.deepEqual(privileges.rows, [{ platform_visibility: true, ai_authority: true, ai_effective: true, orgmaster_effective: true }])
    const legacyDefinition = (await client.query(`SELECT pg_get_viewdef('access_governance.v_effective_role_assignments_v1'::regclass,true) AS definition`)).rows[0].definition
    const contractDefinition = (await client.query(`SELECT pg_get_viewdef('orgmaster_contract.v_ai_pdm_effective_role_assignments_v1'::regclass,true) AS definition`)).rows[0].definition
    assert.match(legacyDefinition, /organizationSnapshot/u)
    assert.doesNotMatch(contractDefinition, /organizationSnapshot/u)
    return { platformVisibility: true, aiAuthority: true, aiEffective: true, existingOrgMasterReadPreserved: true, compatibilityViewUnchanged: true }
  })
}

async function runDev057Checks() {
  await check('D57-24', 'fixture diagnostic executes native owner SELECTs in a read-only snapshot', async () => {
    const { readDiagnosticSnapshot } = await import('./dev057-production-principal-pair-diagnostic-runner.mjs')
    const employeeIds = ['01a0c82b-11c6-77ab-887f-58df9d243e63',
      '01a0c82b-372c-7d20-ba3b-6e3b892d2f63']
    let readOnlyChecks = 0
    const database = { async query(sql, values) {
      if (/SELECT/u.test(sql)) {
        assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on')
        readOnlyChecks += 1
      }
      return client.query(sql, values)
    } }
    const observed = await readDiagnosticSnapshot(database, { employeeIds })
    assert.equal(observed.observationOnly, true)
    assert.equal(observed.releaseAuthority, false)
    assert.deepEqual(observed.employees.map((item) => item.employeeId), employeeIds)
    assert.equal(observed.employees[0].typedAccountCount, 0)
    assert.deepEqual(observed.employees[0].effectiveGrants, [])
    assert.deepEqual(observed.pairs, [])
    assert.equal(readOnlyChecks, 8)
    return { nativeOwnerMigrations: 29, readOnlyChecks, selectedEmployeeCount: 2,
      fixturePresent: false, scope: 'SQL_AND_READONLY_CONTRACT_NOT_PRODUCTION_LOGIN' }
  })
  let recipientLink

  await check('D57-09', 'principal reservations preserve resolved and unresolved provider-pair history', async () => {
    const history = await queryAs('jenfu_platform_runtime', "SELECT principal_issuer,principal_subject,principal_id,employee_id,account_type,resolution_status,active FROM orgmaster_contract.v_principal_alias_history_v1 ORDER BY principal_issuer")
    assert.deepEqual(history.rows, [
      { principal_issuer: 'issuer-historical', principal_subject: 'subject-historical', principal_id: null, employee_id: 'employee-one', account_type: null, resolution_status: 'unresolved', active: false },
      { principal_issuer: 'issuer-legacy', principal_subject: 'subject-legacy', principal_id: 'principal-legacy', employee_id: 'employee-legacy', account_type: 'human_personal', resolution_status: 'resolved', active: true },
    ])
    const owner = await client.query("SELECT principal_id,employee_id,account_type FROM orgmaster_core.principal_ownership_reservations")
    assert.deepEqual(owner.rows, [{ principal_id: 'principal-legacy', employee_id: 'employee-legacy', account_type: 'human_personal' }])
    const grants = await client.query("SELECT has_table_privilege('jenfu_ai_pdm_migrator','orgmaster_contract.v_active_principal_accounts_v1','SELECT') AS ai_typed, has_table_privilege('jenfu_ai_pdm_migrator','orgmaster_contract.v_principal_alias_history_v1','SELECT') AS ai_history, has_table_privilege('jenfu_orgmaster_runtime','orgmaster_core.principal_ownership_reservations','SELECT') AS runtime_private")
    assert.deepEqual(grants.rows, [{ ai_typed: true, ai_history: false, runtime_private: false }])
    await expectDatabaseError(() => queryAs('jenfu_ai_pdm_runtime', 'SELECT * FROM orgmaster_contract.v_principal_alias_history_v1'), { code: '42501' })
    return { resolved: 1, unresolved: 1, aiMigratorTypedOnly: true, directRuntimeTableReadDenied: true }
  })

  await check('D57-18', 'v2 session admission reads published policy roles and applications', async () => {
    const rows = await queryAs('jenfu_orgmaster_runtime', `
      SELECT contract_version,principal_id,employee_id
      FROM orgmaster_contract.v_orgmaster_session_principals_v2
      WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy'
    `)
    assert.deepEqual(rows.rows, [{
      contract_version: 'orgmaster.session-principal.v2',
      principal_id: 'principal-legacy', employee_id: 'employee-legacy'
    }])
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime',
      'SELECT * FROM orgmaster_contract.v_orgmaster_session_principals_v2'), { code: '42501' })
    return { activePrincipalCount: 1, platformAccessDenied: true }
  })
  await check('D57-19', 'cutover producer manifest is exact and AI-PDM migrator can read only the contract view', async () => {
    const contractIds = ['orgmaster.principal-cutover-source', 'orgmaster.ai-pdm-principal-effective-grants']
    const before = (await queryAs('jenfu_ai_pdm_migrator', `
      SELECT contract_id,contract_version,signature_sha256,payload_sha256
      FROM orgmaster_contract.v_contract_manifest_v1
      WHERE contract_id = ANY($1::text[]) ORDER BY contract_id
    `, [contractIds])).rows
    assert.equal(before.length, 2)
    assert.deepEqual(before.find((row) => row.contract_id === 'orgmaster.principal-cutover-source'), {
      contract_id: 'orgmaster.principal-cutover-source',
      contract_version: 'jenfu.orgmaster.principal-cutover-source.v1',
      signature_sha256: 'ff36f90ac9b42d740d44cd049f45e27e5d08db0226dc9510041bd5bad9b51531',
      payload_sha256: null,
    })
    await expectDatabaseError(() => queryAs('jenfu_ai_pdm_migrator',
      "SELECT * FROM orgmaster_core.contract_manifest"), { code: '42501' })
    await client.query(fs.readFileSync(path.join(root, 'db', 'migrations', '027_dev057_principal_cutover_source_manifest.sql'), 'utf8'))
    const after = (await queryAs('jenfu_ai_pdm_migrator', `
      SELECT contract_id,contract_version,signature_sha256,payload_sha256
      FROM orgmaster_contract.v_contract_manifest_v1
      WHERE contract_id = ANY($1::text[]) ORDER BY contract_id
    `, [contractIds])).rows
    assert.deepEqual(after, before)
    return { manifestRows: 2, idempotentReplay: true, coreReadDenied: true }
  })
  await check('D57-02', 'principal mapping and AI-PDM portal visibility do not depend on an OrgMaster role or the AI-PDM authority selector', async () => {
    const columns = async (schema, view) => (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [schema, view])).rows.map((row) => row.column_name)
    assert.deepEqual(await columns('orgmaster_contract', 'v_active_principal_mappings_v1'), ['contract_version','principal_issuer','principal_subject','principal_id','employee_id','employee_status','mapping_version','published_at'])
    assert.deepEqual(await columns('orgmaster_contract', 'v_portal_app_visibility_v1'), ['application_id','principal_issuer','principal_subject','assignment_version','visibility_state'])
    assert.deepEqual(dev057ContractSurfaceAfter, dev057ContractSurfaceBefore, 'migration 021 must preserve all three v1 contract column, owner and ACL signatures')
    const activeDefinition = (await client.query(`SELECT pg_get_viewdef('orgmaster_contract.v_active_principal_mappings_v1'::regclass,true) AS definition`)).rows[0].definition
    const portalDefinition = (await client.query(`SELECT pg_get_viewdef('orgmaster_contract.v_portal_app_visibility_v1'::regclass,true) AS definition`)).rows[0].definition
    assert.doesNotMatch(activeDefinition, /assignment\.value->>'applicationId'\s*=\s*'orgmaster'/u)
    assert.doesNotMatch(portalDefinition, /v_ai_pdm_entitlement_authority_v1/u)
    assert.match(portalDefinition, /v_application_role_catalog_v1/u)
    assert.match(portalDefinition, /roleDelegations/u)

    const artifact = await activeGovernanceArtifact()
    const payload = structuredClone(artifact.payload)
    const version = payload.publishedVersions.find((item) => item.id === payload.activePolicyVersionId)
    version.policy.roleAssignments = version.policy.roleAssignments.filter((assignment) => assignment.applicationId !== 'orgmaster')
    recipientLink = { id: 'identity-link-recipient', employeeId: 'employee-two', issuer: 'issuer-recipient', subject: 'subject-recipient', principalId: 'principal-recipient', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
    version.policy.identityLinks.push(recipientLink)
    version.policy.principalAdmissions.push({ identityLinkId: recipientLink.id, status: 'active', accountType: 'human_personal' })
    version.policy.roleDelegations = [{
      id: 'delegation-recipient', sourceAssignmentId: 'assignment-ai-rd', fromEmployeeId: 'employee-legacy', toEmployeeId: 'employee-two',
      roleId: 'role-rd', catalogVersion: 'ai-pdm.role-catalog.qc', scope: { kind: 'workspace', value: 'company-jenfu' }, status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z',
    }]
    await saveFixtureGovernance(payload)

    const mapping = await queryAs('jenfu_platform_runtime', `SELECT employee_id FROM orgmaster_contract.v_active_principal_mappings_v1 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy'`)
    const portal = await queryAs('jenfu_platform_runtime', `SELECT application_id,assignment_version::text,visibility_state FROM orgmaster_contract.v_portal_app_visibility_v1 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy' ORDER BY application_id`)
    const orgmasterSession = await queryAs('jenfu_orgmaster_runtime', `SELECT employee_id FROM orgmaster_contract.v_orgmaster_session_principals_v1 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy'`)
    const aiOnlySession = await queryAs('jenfu_orgmaster_runtime', `SELECT employee_id FROM orgmaster_contract.v_orgmaster_session_principals_v2 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy'`)
    assert.deepEqual(mapping.rows, [{ employee_id: 'employee-legacy' }])
    assert.deepEqual(portal.rows, [{ application_id: 'ai-pdm', assignment_version: '2', visibility_state: 'visible' }])
    assert.equal(orgmasterSession.rowCount, 0, 'AI-PDM-only admission must not create an OrgMaster session principal')
    assert.deepEqual(aiOnlySession.rows, [{ employee_id: 'employee-legacy' }], 'v2 must admit a published AI-PDM-only principal')
    return { orgmasterRoleAssignments: 0, legacyIdentityMappingPreserved: true, portalApplications: portal.rows.map((row) => row.application_id), authoritySelectorInPortalView: false, orgmasterSessionRows: orgmasterSession.rowCount, aiOnlySessionRows: aiOnlySession.rowCount, v1ColumnsOwnersAndAclsPreserved: true }
  })

  await check('D57-03', 'effective AI-PDM role assignments remain authority-gated while portal visibility is stable', async () => {
    const initial = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 WHERE employee_id='employee-legacy'`)
    assert.equal(initial.rowCount, 0)
    await client.query(`INSERT INTO orgmaster_core.employee_authority_overrides(application_id,employee_id,authority_source,authority_version,updated_at,operation_id,actor,reason)
      VALUES ('ai-pdm','employee-legacy','orgmaster_authority',4,clock_timestamp(),'dev057-authority','dev-057-qc','authority-projection-check')
      ON CONFLICT (application_id,employee_id) DO UPDATE SET authority_source=EXCLUDED.authority_source,authority_version=EXCLUDED.authority_version,updated_at=EXCLUDED.updated_at,operation_id=EXCLUDED.operation_id,actor=EXCLUDED.actor,reason=EXCLUDED.reason`)
    const effective = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id,stable_role_id,role_code,scope_kind,scope_key,authority_version::text FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 WHERE employee_id='employee-legacy'`)
    const portal = await queryAs('jenfu_platform_runtime', `SELECT application_id,assignment_version::text FROM orgmaster_contract.v_portal_app_visibility_v1 WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy' ORDER BY application_id`)
    assert.deepEqual(effective.rows, [{ employee_id: 'employee-legacy', stable_role_id: 'role-rd', role_code: 'rd', scope_kind: 'workspace', scope_key: 'company-jenfu', authority_version: '4' }])
    assert.deepEqual(portal.rows, [{ application_id: 'ai-pdm', assignment_version: '2' }])
    return { effectiveRoleCount: effective.rowCount, authorityVersion: effective.rows[0].authority_version, portalVisibilityUnaffected: true }
  })

  await check('D57-04', 'delegated AI-PDM permission grants portal visibility to the recipient principal', async () => {
    const portal = await queryAs('jenfu_platform_runtime', `SELECT application_id,principal_issuer,principal_subject,assignment_version::text,visibility_state FROM orgmaster_contract.v_portal_app_visibility_v1 WHERE principal_issuer='issuer-recipient' AND principal_subject='subject-recipient'`)
    const effective = await queryAs('jenfu_ai_pdm_runtime', `SELECT employee_id,grant_kind,delegation_id,role_code FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 WHERE employee_id='employee-two'`)
    assert.deepEqual(portal.rows, [{ application_id: 'ai-pdm', principal_issuer: 'issuer-recipient', principal_subject: 'subject-recipient', assignment_version: '2', visibility_state: 'visible' }])
    assert.equal(effective.rowCount, 0)
    return { recipient: 'employee-two', portalVisible: true, effectiveRoleAuthorityStillRequired: true, assignmentVersion: portal.rows[0].assignment_version }
  })

  await check('D57-05', 'governance publisher rejects historical-principal reassignment and duplicate active pairs', async () => {
    const artifact = await activeGovernanceArtifact()
    const conflicting = structuredClone(artifact.payload)
    const active = conflicting.publishedVersions.find((item) => item.id === conflicting.activePolicyVersionId)
    const legacy = active.policy.identityLinks.find((item) => item.issuer === 'issuer-legacy' && item.subject === 'subject-legacy')
    legacy.employeeId = 'employee-two'
    const conflictChanges = governanceChange(conflicting, artifact.canonical_sha256)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','owner-conflict','dev057-owner-conflict','[]'::jsonb)`, [JSON.stringify(conflictChanges), 'c'.repeat(64)]), 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT')

    const duplicate = structuredClone(artifact.payload)
    const duplicateActive = duplicate.publishedVersions.find((item) => item.id === duplicate.activePolicyVersionId)
    duplicateActive.policy.identityLinks.push({ ...structuredClone(duplicateActive.policy.identityLinks.find((item) => item.issuer === 'issuer-legacy' && item.subject === 'subject-legacy')), id: 'identity-link-duplicate', employeeId: 'employee-two' })
    const duplicateChanges = governanceChange(duplicate, artifact.canonical_sha256)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','duplicate-pair','dev057-duplicate-pair','[]'::jsonb)`, [JSON.stringify(duplicateChanges), 'd'.repeat(64)]), 'ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS')
    return { reassignmentRejected: 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT', duplicateRejected: 'ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS' }
  })

  await check('D57-06', 'bind and governance publication serialize in both writer orders', async () => {
    const activeApplications = await client.query(`SELECT application_id,support_revision FROM orgmaster_core.managed_identity_invalidation_applications WHERE status='active' ORDER BY application_id`)
    for (const row of activeApplications.rows) {
      const applicationId = row.application_id
      await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.attest_managed_identity_invalidation_support_v1($1,$2,'qa://dev-057/writer-fence','dev-057-qc')`, [applicationId, Number(row.support_revision)])
    }
    const admission = (await client.query(`SELECT revision,admission_enabled FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true`)).rows[0]
    if (!admission.admission_enabled) await queryAs('jenfu_orgmaster_migrator', `SELECT * FROM orgmaster_core.set_managed_identity_admission_v1($1,true,'dev-057-qc','writer-fence-check')`, [Number(admission.revision)])
    const employeeFour = await createIdentity('employee-four', 'JFS0004', 'directory-four')
    const employeeThree = await createIdentity('employee-three', 'JFS0003', 'directory-three')

    const waitForLock = async (applicationName) => {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const result = await client.query(`SELECT wait_event_type FROM pg_stat_activity WHERE application_name=$1 AND state='active'`, [applicationName])
        if (result.rows.some((row) => row.wait_event_type === 'Lock')) return true
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      throw new Error(`QC_WRITER_DID_NOT_WAIT_FOR_ADMISSION_LOCK:${applicationName}`)
    }
    const bindSql = `SELECT * FROM orgmaster_core.bind_managed_identity_auth_v1($1,$2,$3,$4,$5)`
    const publishAndHold = async (peer, employeeId, pairSuffix, operationId) => {
      const artifact = await activeGovernanceArtifact()
      const next = structuredClone(artifact.payload)
      const current = next.publishedVersions.find((item) => item.id === next.activePolicyVersionId)
      const admission = { id: `identity-link-${pairSuffix}`, employeeId, issuer: `issuer-${pairSuffix}`, subject: `subject-${pairSuffix}`, principalId: `principal-${pairSuffix}`, status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
      const appended = appendGovernanceVersion(next, current, `gov-${pairSuffix}`)
      appended.version.policy.identityLinks.push(admission)
      appended.version.policy.principalAdmissions.push({ identityLinkId: admission.id, status: 'active', accountType: 'human_personal' })
      const changes = governanceChange(appended.payload, artifact.canonical_sha256)
      await peer.query('BEGIN')
      await peer.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      await peer.query(`SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','concurrent-publish',$3,'[]'::jsonb)`, [JSON.stringify(changes), 'e'.repeat(64), operationId])
      return admission
    }

    const publisherFirst = await openAuxClient('orgmaster-dev057-publisher-first')
    const bindAfterPublisher = await openAuxClient('orgmaster-dev057-bind-after-publisher')
    let publisherFirstOpen = false
    let bindAfterPublisherOpen = false
    try {
      const pair = await publishAndHold(publisherFirst, 'employee-four', 'race-publisher-first', 'dev057-publisher-first')
      publisherFirstOpen = true
      await bindAfterPublisher.query('BEGIN'); bindAfterPublisherOpen = true
      await bindAfterPublisher.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      const bindAttempt = bindAfterPublisher.query(bindSql, ['employee-four', pair.issuer, pair.subject, employeeFour.email, 'dev057-bind-after-publisher']).then(() => null, (error) => error)
      await waitForLock('orgmaster-dev057-bind-after-publisher')
      await publisherFirst.query('COMMIT'); publisherFirstOpen = false
      const bindError = await bindAttempt
      assert.match(String(bindError?.message ?? ''), /MANAGED_IDENTITY_IDENTITY_CONFLICT/u)
      await bindAfterPublisher.query('ROLLBACK').catch(() => undefined); bindAfterPublisherOpen = false
    } finally {
      if (publisherFirstOpen) await publisherFirst.query('ROLLBACK').catch(() => undefined)
      if (bindAfterPublisherOpen) await bindAfterPublisher.query('ROLLBACK').catch(() => undefined)
      await closeAuxClient(publisherFirst); await closeAuxClient(bindAfterPublisher)
    }

    const binderFirst = await openAuxClient('orgmaster-dev057-binder-first')
    const publishAfterBinder = await openAuxClient('orgmaster-dev057-publish-after-binder')
    let binderFirstOpen = false
    let publishAfterBinderOpen = false
    try {
      await binderFirst.query('BEGIN'); binderFirstOpen = true
      await binderFirst.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      const bound = await binderFirst.query(bindSql, ['employee-three', 'issuer-race-binder-first', 'subject-race-binder-first', employeeThree.email, 'dev057-binder-first'])
      assert.equal(bound.rows[0].link_state, 'active')
      const artifact = await activeGovernanceArtifact()
      const next = structuredClone(artifact.payload)
      const current = next.publishedVersions.find((item) => item.id === next.activePolicyVersionId)
      const identity = { id: 'identity-link-race-binder-first', employeeId: 'employee-three', issuer: 'issuer-race-binder-first', subject: 'subject-race-binder-first', principalId: 'principal-race-binder-first', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
      const appended = appendGovernanceVersion(next, current, 'gov-race-binder-first')
      appended.version.policy.identityLinks.push(identity)
      appended.version.policy.principalAdmissions.push({ identityLinkId: identity.id, status: 'active', accountType: 'human_personal' })
      const changes = governanceChange(appended.payload, artifact.canonical_sha256)
      await publishAfterBinder.query('BEGIN'); publishAfterBinderOpen = true
      await publishAfterBinder.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      const publishAttempt = publishAfterBinder.query(`SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','concurrent-publish','dev057-publish-after-binder','[]'::jsonb)`, [JSON.stringify(changes), 'f'.repeat(64)]).then(() => null, (error) => error)
      await waitForLock('orgmaster-dev057-publish-after-binder')
      await binderFirst.query('COMMIT'); binderFirstOpen = false
      const publishError = await publishAttempt
      assert.match(String(publishError?.message ?? ''), /PRINCIPAL_IDENTITY_RESERVATION_CONFLICT/u)
      await publishAfterBinder.query('ROLLBACK').catch(() => undefined); publishAfterBinderOpen = false
    } finally {
      if (binderFirstOpen) await binderFirst.query('ROLLBACK').catch(() => undefined)
      if (publishAfterBinderOpen) await publishAfterBinder.query('ROLLBACK').catch(() => undefined)
      await closeAuxClient(binderFirst); await closeAuxClient(publishAfterBinder)
    }
    return { publisherFirst: 'bind waited, then rejected the published pair', binderFirst: 'publisher waited, then rejected the reserved pair', lock: 'managed_identity_admission_authority.singleton' }
  })

  await check('D57-11', 'both writers enforce immutable principal ownership while allowing distinct principals and aliases', async () => {
    const attempt = async (suffix, link, accountType) => {
      const artifact = await activeGovernanceArtifact()
      const current = artifact.payload.publishedVersions.find((version) => version.id === artifact.payload.activePolicyVersionId)
      const appended = appendGovernanceVersion(artifact.payload, current, `gov-${suffix}`)
      appended.version.policy.identityLinks.push(link)
      appended.version.policy.principalAdmissions.push({ identityLinkId: link.id, status: 'active', accountType })
      const changes = governanceChange(appended.payload, artifact.canonical_sha256)
      return queryAs('jenfu_orgmaster_runtime', "SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','principal-ownership',$3,'[]'::jsonb)", [JSON.stringify(changes), '1'.repeat(64), `dev057-${suffix}`])
    }
    const link = (suffix, employeeId, principalId, issuer = `issuer-${suffix}`, subject = `subject-${suffix}`) =>
      ({ id: `identity-link-${suffix}`, employeeId, issuer, subject, principalId, status: 'active', validFrom: '2026-01-01T00:00:00.000Z' })

    await expectDatabaseError(() => attempt('principal-other-employee', link('principal-other-employee', 'employee-two', 'principal-legacy'), 'human_personal'), 'PRINCIPAL_OWNERSHIP_CONFLICT')
    await expectDatabaseError(() => attempt('principal-other-class', link('principal-other-class', 'employee-legacy', 'principal-legacy'), 'human_privileged'), 'PRINCIPAL_OWNERSHIP_CONFLICT')
    await expectDatabaseError(() => attempt('unresolved-reuse', link('unresolved-reuse', 'employee-one', 'principal-old', 'issuer-historical', 'subject-historical'), 'human_personal'), 'PRINCIPAL_IDENTITY_RESERVATION_CONFLICT')

    const artifact = await activeGovernanceArtifact()
    const current = artifact.payload.publishedVersions.find((version) => version.id === artifact.payload.activePolicyVersionId)
    const appended = appendGovernanceVersion(artifact.payload, current, 'gov-principal-aliases')
    const samePrincipal = link('same-principal-alias', 'employee-legacy', 'principal-legacy')
    const secondPrincipal = link('second-principal-same-employee', 'employee-two', 'principal-second')
    appended.version.policy.identityLinks.push(samePrincipal, secondPrincipal)
    appended.version.policy.principalAdmissions.push(
      { identityLinkId: samePrincipal.id, status: 'active', accountType: 'human_personal' },
      { identityLinkId: secondPrincipal.id, status: 'active', accountType: 'human_personal' },
    )
    const changes = governanceChange(appended.payload, artifact.canonical_sha256)
    await queryAs('jenfu_orgmaster_runtime', "SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','principal-ownership','dev057-principal-aliases','[]'::jsonb)", [JSON.stringify(changes), '2'.repeat(64)])

    const aliases = await queryAs('jenfu_platform_runtime', "SELECT principal_issuer,principal_id,employee_id,resolution_status,active FROM orgmaster_contract.v_principal_alias_history_v1 WHERE principal_id='principal-legacy' ORDER BY principal_issuer")
    assert.deepEqual(aliases.rows, [
      { principal_issuer: 'issuer-legacy', principal_id: 'principal-legacy', employee_id: 'employee-legacy', resolution_status: 'resolved', active: true },
      { principal_issuer: 'issuer-same-principal-alias', principal_id: 'principal-legacy', employee_id: 'employee-legacy', resolution_status: 'resolved', active: true },
    ])
    const employeeTwo = await client.query("SELECT principal_id FROM orgmaster_core.principal_ownership_reservations WHERE employee_id='employee-two' ORDER BY principal_id")
    assert.deepEqual(employeeTwo.rows.map((row) => row.principal_id), ['principal-recipient', 'principal-second'])
    const managed = await client.query("SELECT pair.principal_id=identity.principal_id AS exact FROM orgmaster_core.principal_identity_reservations pair JOIN orgmaster_core.managed_daily_identities identity ON identity.auth_issuer=pair.principal_issuer AND identity.auth_subject=pair.principal_subject WHERE pair.principal_issuer='issuer-race-binder-first'")
    assert.deepEqual(managed.rows, [{ exact: true }])
    return { crossEmployeeRejected: true, accountTypeChangeRejected: true, unresolvedReuseRejected: true, samePrincipalAliases: aliases.rowCount, employeeTwoPrincipals: employeeTwo.rowCount, managedPairBound: true }
  })

  await check('D57-17', 'principal grant v2 has one alias-independent row per effective grant', async () => {
    const columns = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='orgmaster_contract' AND table_name='v_ai_pdm_principal_effective_grants_v2'
      ORDER BY ordinal_position`)
    assert.ok(columns.rows.some((row) => row.column_name === 'principal_id'))
    assert.ok(!columns.rows.some((row) => ['identity_issuer', 'identity_subject', 'principal_issuer', 'principal_subject'].includes(row.column_name)))
    const fields = 'principal_id,employee_id,assignment_id,grant_kind,delegation_id,stable_role_id,scope_kind,scope_key,authority_version::text'
    const legacy = await queryAs('jenfu_ai_pdm_runtime', `SELECT ${fields} FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 WHERE principal_id='principal-legacy' ORDER BY identity_issuer`)
    const canonical = await queryAs('jenfu_ai_pdm_runtime', `SELECT ${fields} FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2 WHERE principal_id='principal-legacy'`)
    const ownerReadback = await queryAs('jenfu_ai_pdm_migrator', `SELECT ${fields} FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2 WHERE principal_id='principal-legacy'`)
    assert.equal(legacy.rowCount, 2, 'two admitted aliases must each expose the same old grant')
    assert.equal(canonical.rowCount, 1, 'principal grant must not multiply by alias count')
    assert.deepEqual(ownerReadback.rows, canonical.rows, 'AI-PDM owner command reads exactly the runtime grant')
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime', `SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2`), { code: '42501' })
    await client.query('BEGIN')
    try {
      await client.query(`INSERT INTO orgmaster_core.principal_identity_reservations
        (principal_issuer,principal_subject,employee_id,first_seen_at,source_kind,source_revision)
        VALUES ('issuer-unresolved-grant','subject-unresolved-grant','employee-legacy',
                clock_timestamp(),'legacy','dev057-unresolved-grant')`)
      const uncertain = await client.query(`SELECT count(*)::integer AS n
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        WHERE principal_id='principal-legacy'`)
      assert.equal(uncertain.rows[0].n, 0, 'unresolved historical pair must suppress principal grants')
    } finally {
      await client.query('ROLLBACK')
    }
    assert.deepEqual(legacy.rows[0], legacy.rows[1])
    assert.deepEqual(canonical.rows, [legacy.rows[0]])
    const manifestBytes = fs.readFileSync(path.join(root, 'contracts',
      'orgmaster-ai-pdm-principal-effective-grants', 'v2', 'contract-manifest.json'))
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    assert.deepEqual(manifest.columns, columns.rows.map((row) => row.column_name))
    const published = await queryAs('jenfu_ai_pdm_runtime', `SELECT contract_version,signature_sha256,payload_sha256
      FROM orgmaster_contract.v_contract_manifest_v1
      WHERE contract_id='orgmaster.ai-pdm-principal-effective-grants'`)
    assert.equal(published.rowCount, 1)
    assert.equal(published.rows[0].contract_version, manifest.contractVersion)
    assert.equal(published.rows[0].signature_sha256,
      sha256(Buffer.from(manifestBytes.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8')))
    assert.equal(published.rows[0].payload_sha256, null)
    return { aliasRows: legacy.rowCount, principalRows: canonical.rowCount,
      columns: manifest.columns, manifestSha256: published.rows[0].signature_sha256 }
  })

  await check('D57-20', 'principal grant v3 follows published assignments without the per-employee authority switch', async () => {
    const manifestBytes = fs.readFileSync(path.join(root, 'contracts',
      'orgmaster-ai-pdm-principal-effective-grants', 'v3', 'contract-manifest.json'))
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    const columns = (await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='orgmaster_contract' AND table_name='v_ai_pdm_principal_effective_grants_v3'
      ORDER BY ordinal_position`)).rows.map((row) => row.column_name)
    assert.deepEqual(columns, manifest.columns)
    assert.ok(!columns.includes('authority_version'))
    const readV3 = () => queryAs('jenfu_ai_pdm_runtime', `SELECT principal_id,employee_id,assignment_id,assignment_version
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
      WHERE principal_id='principal-legacy'`)
    const baseline = await readV3()
    assert.equal(baseline.rowCount, 1)
    assert.deepEqual((await queryAs('jenfu_ai_pdm_migrator', `SELECT principal_id,employee_id,assignment_id,assignment_version
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
      WHERE principal_id='principal-legacy'`)).rows, baseline.rows)
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime',
      'SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3'), { code: '42501' })
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE orgmaster_core.employee_authority_overrides
        SET authority_source='legacy_authority',authority_version=authority_version+1
        WHERE application_id='ai-pdm' AND employee_id='employee-legacy'`)
      await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
      const legacy = await client.query(`SELECT assignment_id
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        WHERE principal_id='principal-legacy'`)
      assert.equal(legacy.rowCount, 0, 'v2 remains gated by the old authority switch')
      const independent = await client.query(`SELECT principal_id,employee_id,assignment_id,assignment_version
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
        WHERE principal_id='principal-legacy'`)
      assert.deepEqual(independent.rows, baseline.rows,
        'the published Principal grant must not change when the old switch changes')
    } finally {
      await client.query('ROLLBACK')
    }
    const published = await queryAs('jenfu_ai_pdm_runtime', `SELECT contract_version,signature_sha256,payload_sha256
      FROM orgmaster_contract.v_contract_manifest_v1
      WHERE contract_id='orgmaster.ai-pdm-principal-effective-grants-v3'`)
    const manifestSha256 = sha256(Buffer.from(manifestBytes.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8'))
    assert.deepEqual(published.rows, [{ contract_version: manifest.contractVersion,
      signature_sha256: manifestSha256, payload_sha256: null }])
    const cutover = await queryAs('jenfu_ai_pdm_migrator', `SELECT contract_version,signature_sha256,payload_sha256
      FROM orgmaster_contract.v_contract_manifest_v1
      WHERE contract_id='orgmaster.principal-cutover-source-v2'`)
    assert.deepEqual(cutover.rows, [{
      contract_version: 'jenfu.orgmaster.principal-cutover-source.v2',
      signature_sha256: '6e3da9bf2ce73df35ba00c31c2cb0173e8637f178499c6839d5ac4798d647175',
      payload_sha256: null
    }])
    return { principalRows: baseline.rowCount, columns, manifestSha256,
      oldAuthoritySwitchIndependent: true, platformReadDenied: true }
  })

  await check('D57-23', 'human management Principal receives published business roles with unchanged scope and immediate revocation', async () => {
    const before = await activeGovernanceArtifact()
    const current = before.payload.publishedVersions.find((version) => version.id === before.payload.activePolicyVersionId)
    const appended = appendGovernanceVersion(before.payload, current, 'gov-human-business-v4')
    for (const [id, principalId, accountType] of [
      ['business-manager', 'principal-business-manager', 'human_privileged'],
      ['business-manager-alias', 'principal-business-manager', 'human_privileged'],
      ['business-service', 'principal-business-service', 'service'],
    ]) {
      const link = { id: 'identity-link-' + id, employeeId: accountType === 'service' ? 'employee-two' : 'employee-legacy', principalId,
        issuer: 'issuer-' + id, subject: 'subject-' + id, status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
      appended.version.policy.identityLinks.push(link)
      appended.version.policy.principalAdmissions.push({ identityLinkId: link.id, status: 'active', accountType })
    }
    await client.query('BEGIN')
    try {
      await client.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      await client.query("SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','human-business-v4','dev057-human-business-v4','[]'::jsonb)",
        [JSON.stringify(governanceChange(appended.payload, before.canonical_sha256)), sha256(Buffer.from('D57-23-human-business-publish'))])
      await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
      const rows = (await client.query("SELECT principal_id,role_code,scope_kind,scope_key FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id='principal-business-manager'")).rows
      assert.deepEqual(rows, [{ principal_id: 'principal-business-manager', role_code: 'rd', scope_kind: 'workspace', scope_key: 'company-jenfu' }])
      assert.equal((await client.query("SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3 WHERE principal_id='principal-business-manager'")).rowCount, 0)
      assert.equal((await client.query("SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id='principal-business-service'")).rowCount, 0)
      const personal = (await client.query("SELECT role_code,scope_kind,scope_key FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id='principal-legacy'")).rows
      assert.deepEqual(personal, rows.map(({ principal_id: _principal, ...grant }) => grant))
      await client.query('SET LOCAL ROLE NONE')
      const latest = await activeGovernanceArtifact()
      const active = latest.payload.publishedVersions.find((version) => version.id === latest.payload.activePolicyVersionId)
      const revoked = appendGovernanceVersion(latest.payload, active, 'gov-human-business-v4-revoked')
      for (const assignment of revoked.version.policy.roleAssignments) {
        if (assignment.employeeId === 'employee-legacy' && assignment.applicationId === 'ai-pdm') assignment.status = 'revoked'
      }
      await client.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      await client.query("SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc','human-business-v4-revoke','dev057-human-business-v4-revoke','[]'::jsonb)",
        [JSON.stringify(governanceChange(revoked.payload, latest.canonical_sha256)), sha256(Buffer.from('D57-23-human-business-revoke'))])
      await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
      assert.equal((await client.query("SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id IN ('principal-business-manager','principal-legacy')")).rowCount, 0)
      return { privilegedDailyRole: true, aliasesDoNotDuplicateGrant: true, personalEquivalent: true, serviceDenied: true, scopePreserved: true, revokedImmediately: true, historicalV3Unchanged: true }
    } finally { await client.query('ROLLBACK') }
  })

  await check('D57-12', 'owner reservations cannot be rewritten and runtime cannot call the private writer', async () => {
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_migrator', "UPDATE orgmaster_core.principal_ownership_reservations SET employee_id='employee-two' WHERE principal_id='principal-legacy'"), 'PRINCIPAL_OWNERSHIP_IMMUTABLE')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_migrator', "UPDATE orgmaster_core.principal_identity_reservations SET source_revision='rewritten' WHERE principal_issuer='issuer-legacy'"), 'PRINCIPAL_IDENTITY_RESERVATION_IMMUTABLE')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_migrator', "DELETE FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer='issuer-legacy'"), 'PRINCIPAL_IDENTITY_RESERVATION_IMMUTABLE')
    const privileges = await client.query("SELECT has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.write_active_persistence_artifacts_with_identity_fence_base_v1(jsonb,text,text,text,text,jsonb)','EXECUTE') AS private_writer, has_function_privilege('jenfu_orgmaster_runtime','orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(jsonb,text,text,text,text,jsonb)','EXECUTE') AS public_writer")
    assert.deepEqual(privileges.rows, [{ private_writer: false, public_writer: true }])
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', "SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_base_v1('[]'::jsonb,'revision','actor','reason','operation','[]'::jsonb)"), { code: '42501' })
    return { ownerMutationRejected: true, aliasDeletionRejected: true, privateWriterRuntimeDenied: true }
  })

  await check('D57-13', 'managed-login verification binds the exact principal and bind replay preserves one reservation', async () => {
    const pending = (await client.query("SELECT identity.identity_record_id,identity.employee_id,identity.principal_id,identity.directory_customer_id,identity.directory_user_id,identity.revision,identity.link_state,assignment.revision AS registry_revision FROM orgmaster_core.managed_daily_identities identity JOIN orgmaster_core.employee_number_assignments assignment ON assignment.employee_id=identity.employee_id WHERE identity.employee_id='employee-four'")).rows[0]
    assert.equal(pending.link_state, 'directory_linked_pending_auth')
    const verified = await queryAs('jenfu_orgmaster_runtime', "SELECT employee_id,principal_id,link_state FROM orgmaster_core.verify_managed_login_identity_v1($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9,$10,$11,$12,$13,$14)", [
      'dev057-managed-verify', '3'.repeat(64), pending.directory_customer_id, pending.directory_user_id,
      'issuer-managed-verify', 'subject-managed-verify', pending.employee_id, pending.identity_record_id,
      Number(pending.revision), Number(pending.registry_revision), pending.link_state, null, null, 'dev057-qc',
    ])
    assert.deepEqual(verified.rows, [{ employee_id: pending.employee_id, principal_id: pending.principal_id, link_state: 'active' }])
    const reserved = (await client.query("SELECT principal_id,employee_id,source_kind FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer='issuer-managed-verify' AND principal_subject='subject-managed-verify'")).rows
    assert.deepEqual(reserved, [{ principal_id: pending.principal_id, employee_id: pending.employee_id, source_kind: 'managed' }])

    const bound = (await client.query("SELECT principal_id,employee_id,last_verified_primary_email FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-three'")).rows[0]
    const replay = await queryAs('jenfu_orgmaster_runtime', "SELECT principal_id,employee_id,link_state FROM orgmaster_core.bind_managed_identity_auth_v1($1,$2,$3,$4,$5)", [
      bound.employee_id, 'issuer-race-binder-first', 'subject-race-binder-first', bound.last_verified_primary_email, 'dev057-bind-replay',
    ])
    assert.deepEqual(replay.rows, [{ principal_id: bound.principal_id, employee_id: bound.employee_id, link_state: 'active' }])
    const reservationCount = (await client.query("SELECT count(*)::integer AS count FROM orgmaster_core.principal_identity_reservations WHERE principal_issuer='issuer-race-binder-first' AND principal_subject='subject-race-binder-first'")).rows[0].count
    assert.equal(reservationCount, 1)
    return { verifiedManagedPrincipal: pending.principal_id, replayReservationCount: reservationCount }
  })

  await check('D57-14', 'authority v2 atomically switches, replays and reverses with exact target and readback', async () => {
    const artifact = await activeGovernanceArtifact()
    const assignmentVersionId = artifact.payload.activePolicyVersionId
    const sql = 'SELECT * FROM orgmaster_contract.switch_employee_entitlement_authority_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)'
    const args = (source, expected, operationId, principalId = 'principal-legacy') => [
      'ai-pdm', 'employee-legacy', source, expected, operationId, 'dev057-v2-batch',
      assignmentVersionId, 'principal-admin', 'dev057-authority-v2',
      principalId, 'issuer-legacy', 'subject-legacy',
    ]
    const firstArgs = args('legacy_authority', 4, 'dev057-v2-to-legacy')
    const first = (await queryAs('jenfu_orgmaster_runtime', sql, firstArgs)).rows[0]
    assert.equal(String(first.authority_version), '5')
    assert.equal(first.replayed, false)
    assert.equal(first.session_refresh_state, 'pending')
    const replay = (await queryAs('jenfu_orgmaster_runtime', sql, firstArgs)).rows[0]
    assert.equal(replay.replayed, true)
    assert.equal(replay.receipt_id, first.receipt_id)
    assert.equal(replay.outbox_event_id, first.outbox_event_id)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', sql, args('legacy_authority', 4, 'dev057-v2-to-legacy', 'principal-other')), 'ENTITLEMENT_AUTHORITY_OPERATION_REUSED')

    const readback = (await queryAs('jenfu_orgmaster_runtime', "SELECT receipt,outbox FROM orgmaster_contract.read_employee_authority_operation_v1('ai-pdm','employee-legacy','dev057-v2-to-legacy')")).rows[0]
    assert.equal(readback.receipt.targetPrincipalId, 'principal-legacy')
    assert.equal(readback.receipt.requestHash.length, 64)
    assert.equal(readback.receipt.authorityVersion, 5)
    assert.equal(readback.outbox.eventId, first.outbox_event_id)
    assert.equal(readback.outbox.operationId, 'dev057-v2-to-legacy')
    assert.equal(readback.outbox.employeeId, 'employee-legacy')
    assert.equal(readback.outbox.applicationId, 'ai-pdm')
    assert.equal(readback.outbox.actor, 'principal-admin')
    assert.equal(readback.outbox.reasonCode, 'entitlement_authority_switch')
    assert.ok(Number.isFinite(Date.parse(readback.outbox.createdAt)))
    assert.equal(readback.outbox.status, 'pending')
    await expectDatabaseError(() => queryAs('jenfu_platform_runtime', "SELECT * FROM orgmaster_contract.read_employee_authority_operation_v1('ai-pdm','employee-legacy','dev057-v2-to-legacy')"), { code: '42501' })
    const platformReadback = await queryAs('jenfu_platform_migrator', "SELECT receipt FROM orgmaster_contract.read_employee_authority_operation_v1('ai-pdm','employee-legacy','dev057-v2-to-legacy')")
    assert.equal(platformReadback.rowCount, 1)

    const reverse = (await queryAs('jenfu_orgmaster_runtime', sql, args('orgmaster_authority', 5, 'dev057-v2-to-orgmaster'))).rows[0]
    assert.equal(String(reverse.authority_version), '6')
    assert.equal(reverse.replayed, false)
    const authority = (await client.query("SELECT authority_source,authority_version FROM orgmaster_core.employee_authority_overrides WHERE application_id='ai-pdm' AND employee_id='employee-legacy'")).rows[0]
    assert.deepEqual(authority, { authority_source: 'orgmaster_authority', authority_version: '6' })
    const outboxCount = (await client.query("SELECT count(*)::integer AS count FROM orgmaster_core.entitlement_change_outbox WHERE operation_id IN ('dev057-v2-to-legacy','dev057-v2-to-orgmaster')")).rows[0].count
    assert.equal(outboxCount, 2)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', sql, args('legacy_authority', 6, 'dev057-v2-wrong-target', 'principal-other')), 'ENTITLEMENT_AUTHORITY_TARGET_IDENTITY_INVALID')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', sql, args('legacy_authority', 5, 'dev057-v2-stale-version')), 'ENTITLEMENT_AUTHORITY_VERSION_CONFLICT')

    const peer = await openAuxClient('orgmaster-dev057-v2-repeatable-read')
    try {
      await peer.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      await peer.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      await expectDatabaseError(() => peer.query(sql, args('legacy_authority', 6, 'dev057-v2-wrong-isolation')), 'authority_transaction_mode_invalid')
      await peer.query('ROLLBACK')
    } finally { await closeAuxClient(peer) }
    const denied = (await client.query("SELECT count(*)::integer AS count FROM orgmaster_core.authority_switch_receipts WHERE operation_id IN ('dev057-v2-wrong-target','dev057-v2-stale-version','dev057-v2-wrong-isolation')")).rows[0].count
    assert.equal(denied, 0)
    return { firstAuthorityVersion: 5, reverseAuthorityVersion: 6, replayedReceiptId: replay.receipt_id, outboxCount, deniedMutationCount: denied }
  })

  await check('D57-15', 'authority v2 rereads target admission after waiting for the producer lock', async () => {
    const artifact = await activeGovernanceArtifact()
    const changed = structuredClone(artifact.payload)
    const active = changed.publishedVersions.find((version) => version.id === changed.activePolicyVersionId)
    active.policy.identityLinks = active.policy.identityLinks.filter((link) => link.issuer !== 'issuer-legacy')
    const peer = await openAuxClient('orgmaster-dev057-v2-lock-race')
    let producerOpen = false
    let peerOpen = false
    try {
      await client.query('BEGIN'); producerOpen = true
      await client.query('SELECT 1 FROM orgmaster_core.managed_identity_admission_authority WHERE singleton=true FOR UPDATE')
      await saveFixtureGovernance(changed)
      await peer.query('BEGIN'); peerOpen = true
      await peer.query('SET LOCAL ROLE jenfu_orgmaster_runtime')
      const attempt = peer.query('SELECT * FROM orgmaster_contract.switch_employee_entitlement_authority_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [
        'ai-pdm', 'employee-legacy', 'legacy_authority', 6, 'dev057-v2-lock-race', 'dev057-v2-batch',
        changed.activePolicyVersionId, 'principal-admin', 'dev057-authority-v2',
        'principal-legacy', 'issuer-legacy', 'subject-legacy',
      ]).then(() => null, (error) => error)
      const deadline = Date.now() + 5000
      let waited = false
      while (Date.now() < deadline) {
        const activity = await client.query("SELECT wait_event_type FROM pg_stat_activity WHERE application_name='orgmaster-dev057-v2-lock-race' AND state='active'")
        if (activity.rows.some((row) => row.wait_event_type === 'Lock')) { waited = true; break }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      assert.equal(waited, true, 'authority v2 did not wait for the producer lock')
      await client.query('COMMIT'); producerOpen = false
      const error = await attempt
      assert.match(String(error?.message ?? ''), /ENTITLEMENT_AUTHORITY_TARGET_IDENTITY_INVALID/u)
      await peer.query('ROLLBACK'); peerOpen = false
      const receiptCount = (await client.query("SELECT count(*)::integer AS count FROM orgmaster_core.authority_switch_receipts WHERE operation_id='dev057-v2-lock-race'")).rows[0].count
      const authority = (await client.query("SELECT authority_version FROM orgmaster_core.employee_authority_overrides WHERE application_id='ai-pdm' AND employee_id='employee-legacy'")).rows[0]
      assert.equal(receiptCount, 0)
      assert.equal(String(authority.authority_version), '6')
      return { waitedForProducerLock: true, postLockTargetRejected: true, receiptCount, authorityVersion: 6 }
    } finally {
      if (producerOpen) await client.query('ROLLBACK').catch(() => undefined)
      if (peerOpen) await peer.query('ROLLBACK').catch(() => undefined)
      await closeAuxClient(peer)
      await saveFixtureGovernance(artifact.payload)
    }
  })

  await check('D57-16', 'issued principal session binding is immutable while last-seen and revocation remain writable', async () => {
    const id = '57000000-0000-4000-8000-000000000016'
    await queryAs('jenfu_orgmaster_runtime', `INSERT INTO orgmaster_core.app_sessions
      (id,session_id_hash,identity_issuer,identity_subject,principal_id,employee_id,app_id,
       auth_epoch,session_schema_version,epoch_kind,principal_auth_epoch,issued_at,authenticated_at,
       expires_at,last_seen_at,assurance_level,created_at,updated_at)
      VALUES ($1,$2,'issuer-session','subject-session','principal-legacy','employee-legacy','orgmaster',
        0,2,'principal',7,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',
        clock_timestamp(),'aal1',clock_timestamp(),clock_timestamp())`, [id, '7'.repeat(64)])
    await queryAs('jenfu_orgmaster_runtime', `UPDATE orgmaster_core.app_sessions
      SET last_seen_at=clock_timestamp(), revoked_at=clock_timestamp(), revoke_reason='dev057-qc'
      WHERE id=$1`, [id])
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `UPDATE orgmaster_core.app_sessions
      SET principal_auth_epoch=8 WHERE id=$1`, [id]), 'ORGMASTER_SESSION_BINDING_IMMUTABLE')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `UPDATE orgmaster_core.app_sessions
      SET principal_id='principal-other' WHERE id=$1`, [id]), 'ORGMASTER_SESSION_BINDING_IMMUTABLE')
    const row = (await client.query(`SELECT principal_id,principal_auth_epoch,revoked_at
      FROM orgmaster_core.app_sessions WHERE id=$1`, [id])).rows[0]
    assert.equal(row.principal_id, 'principal-legacy')
    assert.equal(String(row.principal_auth_epoch), '7')
    assert.ok(row.revoked_at)
    return { immutablePrincipal: true, immutableEpoch: true, revocationAllowed: true }
  })

  await check('D57-07', 'identity-only producer keeps unclassified legacy mapping out of the account-typed adapter', async () => {
    const artifact = await activeGovernanceArtifact()
    const payload = structuredClone(artifact.payload)
    const version = payload.publishedVersions.find((item) => item.id === payload.activePolicyVersionId)
    version.policy.identityLinks.push({
      id: 'identity-link-unclassified', employeeId: 'employee-two', issuer: 'issuer-unclassified',
      subject: 'subject-unclassified', principalId: 'principal-unclassified', status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
    })
    await saveFixtureGovernance(payload)

    const canonical = await queryAs('jenfu_platform_runtime', `SELECT principal_id,employee_id
      FROM orgmaster_contract.v_active_principal_mappings_v1
      WHERE principal_issuer='issuer-unclassified' AND principal_subject='subject-unclassified'`)
    const typed = await queryAs('jenfu_platform_runtime', `SELECT account_type
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_issuer='issuer-unclassified' AND principal_subject='subject-unclassified'`)
    const explicitLegacy = await queryAs('jenfu_platform_runtime', `SELECT account_type
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_issuer='issuer-legacy' AND principal_subject='subject-legacy'`)
    await client.query(`INSERT INTO orgmaster_core.employee_authority_overrides
      (application_id,employee_id,authority_source,authority_version,updated_at,operation_id,actor,reason)
      VALUES ('ai-pdm','employee-two','orgmaster_authority',4,clock_timestamp(),
              'dev057-unclassified-projection','dev-057-qc','typed-projection-check')
      ON CONFLICT (application_id,employee_id) DO UPDATE SET
        authority_source=EXCLUDED.authority_source,authority_version=EXCLUDED.authority_version,
        updated_at=EXCLUDED.updated_at,operation_id=EXCLUDED.operation_id,
        actor=EXCLUDED.actor,reason=EXCLUDED.reason`)
    const unclassifiedPortal = await queryAs('jenfu_platform_runtime', `SELECT application_id
      FROM orgmaster_contract.v_portal_app_visibility_v1
      WHERE principal_issuer='issuer-unclassified' AND principal_subject='subject-unclassified'`)
    const unclassifiedEffective = await queryAs('jenfu_ai_pdm_runtime', `SELECT assignment_id
      FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
      WHERE identity_issuer='issuer-unclassified' AND identity_subject='subject-unclassified'`)
    const admittedPortal = await queryAs('jenfu_platform_runtime', `SELECT application_id
      FROM orgmaster_contract.v_portal_app_visibility_v1
      WHERE principal_issuer='issuer-recipient' AND principal_subject='subject-recipient'`)
    const admittedEffective = await queryAs('jenfu_ai_pdm_runtime', `SELECT assignment_id
      FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
      WHERE identity_issuer='issuer-recipient' AND identity_subject='subject-recipient'`)
    assert.deepEqual(canonical.rows, [{ principal_id: 'principal-unclassified', employee_id: 'employee-two' }])
    assert.equal(typed.rowCount, 0, 'unclassified legacy mapping must not receive an implicit account type')
    assert.deepEqual(explicitLegacy.rows, [{ account_type: 'human_personal' }])
    assert.equal(unclassifiedPortal.rowCount, 0, 'unclassified mapping must not create Portal visibility')
    assert.equal(unclassifiedEffective.rowCount, 0, 'unclassified mapping must not inherit effective grants')
    assert.deepEqual(admittedPortal.rows, [{ application_id: 'ai-pdm' }])
    assert.equal(admittedEffective.rowCount, 1, 'classified recipient retains its effective grant')
    const duplicated = structuredClone(payload)
    const duplicatedVersion = duplicated.publishedVersions.find((item) => item.id === duplicated.activePolicyVersionId)
    const admission = duplicatedVersion.policy.principalAdmissions.find((item) => item.identityLinkId === recipientLink.id)
    assert.ok(admission)
    duplicatedVersion.policy.principalAdmissions.push(structuredClone(admission))
    await saveFixtureGovernance(duplicated)
    const ambiguousTyped = await queryAs('jenfu_platform_runtime', `SELECT account_type
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_issuer='issuer-recipient' AND principal_subject='subject-recipient'`)
    const ambiguousPortal = await queryAs('jenfu_platform_runtime', `SELECT application_id
      FROM orgmaster_contract.v_portal_app_visibility_v1
      WHERE principal_issuer='issuer-recipient' AND principal_subject='subject-recipient'`)
    const ambiguousEffective = await queryAs('jenfu_ai_pdm_runtime', `SELECT assignment_id
      FROM orgmaster_contract.v_ai_pdm_effective_role_assignments_v1
      WHERE identity_issuer='issuer-recipient' AND identity_subject='subject-recipient'`)
    assert.equal(ambiguousTyped.rowCount, 2, 'producer ambiguity must stay observable')
    assert.equal(ambiguousPortal.rowCount, 0, 'Portal must reject ambiguous typed pair')
    assert.equal(ambiguousEffective.rowCount, 0, 'grant projection must reject ambiguous typed pair')
    await saveFixtureGovernance(payload)
    return { canonicalContainsUnclassifiedLegacy: true, typedAdapterRowsForIt: 0,
      unclassifiedPortalRows: 0, unclassifiedEffectiveRows: 0,
      classifiedPortalRows: admittedPortal.rowCount, classifiedEffectiveRows: admittedEffective.rowCount,
      ambiguousTypedRows: ambiguousTyped.rowCount, ambiguousPortalRows: 0, ambiguousEffectiveRows: 0,
      explicitLegacyAdmissionPreserved: true }
  })

  await check('D57-08', 'active managed mapping reaches typed adapter only through an exact managed identity match', async () => {
    const canonical = await queryAs('jenfu_platform_runtime', `SELECT principal_id,employee_id,mapping_version::text
      FROM orgmaster_contract.v_active_principal_mappings_v1
      WHERE principal_issuer='issuer-race-binder-first' AND principal_subject='subject-race-binder-first'`)
    const typed = await queryAs('jenfu_platform_runtime', `SELECT principal_id,employee_id,account_type,mapping_version::text
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_issuer='issuer-race-binder-first' AND principal_subject='subject-race-binder-first'`)
    const legacyProjection = await client.query(`SELECT principal_id,employee_id
      FROM access_governance.v_active_principal_links_v1
      WHERE principal_issuer='issuer-race-binder-first' AND principal_subject='subject-race-binder-first'`)
    assert.equal(canonical.rowCount, 1, 'managed identity must be present in the published identity producer')
    assert.equal(typed.rowCount, 1, 'exact active managed identity must be present in the typed adapter')
    assert.deepEqual(typed.rows[0], {
      principal_id: canonical.rows[0].principal_id,
      employee_id: canonical.rows[0].employee_id,
      account_type: 'human_personal',
      mapping_version: canonical.rows[0].mapping_version,
    })
    assert.equal(legacyProjection.rowCount, 0, 'Platform-owned legacy projection remains unchanged and is not the managed-principal contract')
    return { canonicalProducerRows: canonical.rowCount, typedAdapterRows: typed.rowCount, accountType: typed.rows[0].account_type, platformLegacyProjectionUnchanged: true }
  })

  if (dev057ConsumerRoot) await check('D57-21', packageReadOnly ? 'published Principal grants drive actual share metadata and package access, revocation, scope and restore on one PostgreSQL' : 'published Principal grants drive AI-PDM assignment, revocation, scope and native v4 transfer decision on one PostgreSQL', async () => {
    const consumerRoot = fs.realpathSync(dev057ConsumerRoot)
    const packageName = JSON.parse(fs.readFileSync(path.join(consumerRoot, 'package.json'), 'utf8')).name
    assert.equal(packageName, 'ai-pdm')
    const consumerTest = path.join(consumerRoot, 'src', 'lib', 'repositories', 'jenfu-principal-grants-v3.postgres-contract.test.ts')
    const vitest = path.join(consumerRoot, 'node_modules', 'vitest', 'vitest.mjs')
    assert.ok(fs.existsSync(consumerTest) && fs.existsSync(vitest), 'AI-PDM source and installed test runner are required')
    await client.query('CREATE ROLE dev057_ai_pdm_consumer_probe LOGIN IN ROLE jenfu_ai_pdm_runtime')
    await client.query('CREATE ROLE dev057_orgmaster_catalog_probe LOGIN IN ROLE jenfu_orgmaster_runtime')
    const catalogProbe=(expectedVersion)=>{
      const probe=spawnSync(process.execPath,[path.join(root,'node_modules','vitest','vitest.mjs'),'run','server/aiPdmRoleCatalogRepository.postgres.test.ts'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:90_000,env:{...process.env,CI:'1',DEV057_PRODUCT_CATALOG_EXPECTED_VERSION:expectedVersion,DEV057_PRODUCT_CATALOG_POSTGRES_URL:connectionString.replace('postgres@','dev057_orgmaster_catalog_probe@'),...(expectedVersion.endsWith('.v6')?{DEV057_PRODUCT_WORKSPACE_FIXTURE_POSTGRES_URL:connectionString}:{})}})
      assert.equal(probe.status,0,'OrgMaster active '+expectedVersion+' read failed: '+(probe.error?.message??'')+'\n'+(probe.stdout??'')+'\n'+(probe.stderr??''))
      assert.match(probe.stdout,expectedVersion.endsWith('.v6')?/Tests\s+2 passed/u:/Tests\s+1 passed/u,'OrgMaster product catalog and v6 workspace read must execute, not skip')
    }
    const { catalog: principalCatalog, evidence: catalogPublicationEvidence } = await prepareNativeAiPdmCatalog(client, consumerRoot, catalogProbe)
    catalogPublicationEvidence.orgmasterActiveCatalogReadback=['v5','v6']
    const snapshotSql=fs.readFileSync(path.join(consumerRoot,'db/postgres/056_role_capability_display_snapshot.sql'),'utf8')
    await client.query('SET search_path=ai_pdm_core,pg_catalog')
    try { await client.query(snapshotSql) } finally { await client.query('RESET search_path') }
    await client.query('ALTER TABLE ai_pdm_core.role_capability_display_snapshots OWNER TO jenfu_ai_pdm_migrator; GRANT USAGE ON SCHEMA ai_pdm_core TO dev057_ai_pdm_consumer_probe; GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.role_capability_display_snapshots TO dev057_ai_pdm_consumer_probe')
    const snapshotProbe=spawnSync(process.execPath,[vitest,'run','src/lib/repositories/role-capability-display-snapshot.postgres-contract.test.ts'],{cwd:consumerRoot,encoding:'utf8',windowsHide:true,timeout:90_000,env:{...process.env,CI:'1',DEV121_ROLE_DISPLAY_POSTGRES_URL:connectionString.replace('postgres@','dev057_ai_pdm_consumer_probe@')}})
    assert.equal(snapshotProbe.status,0,'Actual 056 asynchronous display snapshot failed: '+(snapshotProbe.error?.message??'')+'\n'+(snapshotProbe.stdout??'')+'\n'+(snapshotProbe.stderr??''))
    assert.match(snapshotProbe.stdout,/Tests\s+3 passed/u,'all native snapshot cases must execute, not skip')
    catalogPublicationEvidence.displaySnapshot={migration056Sha256:sha256(snapshotSql),executedCases:3,provider:'postgres',restrictedRole:'dev057_ai_pdm_consumer_probe',securityAuthority:false}
    const {readDiagnosticSnapshot}=await import('./dev057-production-principal-pair-diagnostic-runner.mjs')
    let formalReadChecks=0
    const readonlyDatabase={async query(sql,values){if(/SELECT/u.test(sql)){assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');formalReadChecks++}return client.query(sql,values)}}
    await assert.rejects(readDiagnosticSnapshot(readonlyDatabase,{schemaVersion:'orgmaster.dev057-principal-pair-diagnostic-operation.v3',operationId:'dev121-local-native-readback',sourceRevision:'1'.repeat(40),projectId:'jenfu-platform-prod',region:'asia-east1',database:'jenfu_prod',applicationId:'ai-pdm',principalId:'principal-firebase-b71682bf0d7cc5596b48dfad991e4096',employeeId:'employee-shijie'}),/SOURCE_AMBIGUOUS/)
    assert.equal(formalReadChecks,4)
    catalogPublicationEvidence.formalDiagnostic={actualSelectQueries:4,readOnly:true,absentFixtureRejected:true,scope:'NATIVE_SQL_COMPATIBILITY_ONLY_NOT_FORMAL_PRODUCTION_GRANT_PROOF'}
    catalogProbe(principalCatalog.catalogVersion)
    await client.query(`CREATE TABLE ai_pdm_core.role_priority_versions (
        status text NOT NULL, priority_json text NOT NULL);
      CREATE TABLE ai_pdm_core.principal_accounts (
        principal_id text PRIMARY KEY, pdm_user_id text NOT NULL,
        employee_id text NOT NULL, account_type text NOT NULL,
        company_id text NOT NULL, account_status text NOT NULL,
        system_role_enabled boolean NOT NULL);
      INSERT INTO ai_pdm_core.principal_accounts VALUES
        ('principal-legacy','qc-profile-legacy','employee-legacy',
         'human_personal','company-jenfu','active',true);
      GRANT USAGE ON SCHEMA ai_pdm_contract TO dev057_ai_pdm_consumer_probe;
      GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO dev057_ai_pdm_consumer_probe;
      GRANT USAGE ON SCHEMA ai_pdm_core TO dev057_ai_pdm_consumer_probe;
      GRANT SELECT ON ai_pdm_core.role_priority_versions,
        ai_pdm_core.principal_accounts TO dev057_ai_pdm_consumer_probe;`)
    await client.query('INSERT INTO ai_pdm_core.role_priority_versions VALUES ($1,$2)',
      ['active', JSON.stringify(principalCatalog.roles.map((role) => role.roleCode))])
    // Exercise the normal transfer command against this same owner-published
    // grant. The fixture tables are task-owned; no application migration or
    // production database is modified by this contract probe.
    await client.query(`
      CREATE TABLE ai_pdm_core.users (
        id text PRIMARY KEY, company_id text NOT NULL, display_name text NOT NULL);
      INSERT INTO ai_pdm_core.users VALUES ('qc-profile-legacy','company-jenfu','QC reviewer');
      INSERT INTO ai_pdm_core.users VALUES ('qc-profile-owner','company-jenfu','QC owner');
      ALTER TABLE ai_pdm_core.principal_accounts
        ADD COLUMN lifecycle_version integer NOT NULL DEFAULT 1,
        ADD COLUMN profile_version integer NOT NULL DEFAULT 1,
        ADD COLUMN minimum_assurance text NOT NULL DEFAULT 'aal1',
        ADD COLUMN session_invalid_before timestamptz;
      ALTER TABLE ai_pdm_core.principal_accounts
        ADD CONSTRAINT dev057_principal_profile_triplet
        UNIQUE(company_id,pdm_user_id,principal_id);
      CREATE TABLE ai_pdm_core.approval_platform_requests (
        id text PRIMARY KEY,company_id text NOT NULL,action_code text NOT NULL,
        request_status text NOT NULL,title text NOT NULL,reason text NOT NULL,
        requested_by text NOT NULL,requested_at timestamptz NOT NULL DEFAULT now(),
        payload_json jsonb NOT NULL,package_id text,
        domain_code text NOT NULL DEFAULT 'transfer',
        created_at timestamptz NOT NULL DEFAULT now(),
        apply_status text NOT NULL DEFAULT 'not_ready',
        apply_attempts integer NOT NULL DEFAULT 0,resolved_by text,
        resolved_at timestamptz,applied_by text,applied_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE ai_pdm_core.approval_platform_actions (
        action_code text PRIMARY KEY,title text NOT NULL);
      INSERT INTO ai_pdm_core.approval_platform_actions VALUES
        ('transfer.package_review','技轉審核');
      CREATE TABLE ai_pdm_core.approval_platform_packages (
        id text PRIMARY KEY,package_code text,package_status text);
      CREATE TABLE ai_pdm_core.approval_platform_events (
        id text PRIMARY KEY,request_id text,package_id text,
        event_type text NOT NULL,actor_id text,detail_json jsonb NOT NULL,
        created_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.transfer_packages (
        id text PRIMARY KEY,company_id text NOT NULL,package_status text NOT NULL,
        review_request_id text,review_snapshot_hash text,
        approved_by text,approved_at timestamptz,
        row_version integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE ai_pdm_core.transfer_packages
        ADD COLUMN package_code text NOT NULL DEFAULT 'TRF-QC',
        ADD COLUMN title text NOT NULL DEFAULT '技轉包',
        ADD COLUMN case_type text NOT NULL DEFAULT 'new_part',
        ADD COLUMN case_reason text NOT NULL DEFAULT 'QC',
        ADD COLUMN source_reference_status text NOT NULL DEFAULT 'not_required',
        ADD COLUMN source_reference text,
        ADD COLUMN source_reference_reason text,
        ADD COLUMN owner_id text NOT NULL DEFAULT 'qc-profile-owner',
        ADD COLUMN created_by text NOT NULL DEFAULT 'qc-profile-owner',
        ADD COLUMN review_snapshot_version integer NOT NULL DEFAULT 0,
        ADD COLUMN submitted_by text,
        ADD COLUMN submitted_at timestamptz,
        ADD COLUMN published_by text,
        ADD COLUMN published_at timestamptz,
        ADD COLUMN release_failure_correlation_id text,
        ADD COLUMN cancel_reason text,
        ADD COLUMN cancelled_by text,
        ADD COLUMN cancelled_at timestamptz,
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
      CREATE TABLE ai_pdm_core.transfer_package_items (
        id text PRIMARY KEY, company_id text NOT NULL, package_id text NOT NULL,
        entity_type text NOT NULL, entity_id text NOT NULL, entity_code text NOT NULL,
        display_label text NOT NULL, root_code text, record_status text NOT NULL,
        added_by text NOT NULL, created_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.numbering_draft_workspaces (
        id text PRIMARY KEY, company_id text NOT NULL, row_version integer NOT NULL,
        lifecycle_status text NOT NULL, owner_id text NOT NULL);
      CREATE TABLE ai_pdm_core.transfer_package_draft_items (
        id text PRIMARY KEY, company_id text NOT NULL, package_id text NOT NULL,
        workspace_id text NOT NULL, requiredness text NOT NULL,
        inclusion_reason text NOT NULL, captured_workspace_version integer NOT NULL,
        added_by text NOT NULL, created_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.part_numbers (
        id text PRIMARY KEY, company_id text NOT NULL, record_status text NOT NULL,
        updated_at timestamptz NOT NULL, part_name text NOT NULL, item_kind text NOT NULL,
        custom_specification text, series_code text);
      CREATE TABLE ai_pdm_core.part_variant_attributes (
        part_number_id text PRIMARY KEY, updated_at timestamptz,
        material_code text, material_label text, color_code text, color_label text,
        surface_treatment text, variant_note text);
      CREATE TABLE ai_pdm_core.approval_platform_targets (
        id text PRIMARY KEY, request_id text NOT NULL, target_role text NOT NULL,
        target_type text NOT NULL, target_id text NOT NULL, target_code text,
        target_label text NOT NULL, target_status text NOT NULL,
        snapshot_json jsonb NOT NULL, sort_order integer NOT NULL,
        created_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.approval_platform_impact_snapshots (
        id text PRIMARY KEY, request_id text NOT NULL, package_id text,
        snapshot_hash text NOT NULL, snapshot_json jsonb NOT NULL,
        captured_by text NOT NULL, captured_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.approval_platform_decisions (
        id text PRIMARY KEY,request_id text NOT NULL,approver_role text NOT NULL,
        approver_id text NOT NULL,decision text NOT NULL,comment text,
        decided_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.number_candidate_reservations (
        id text PRIMARY KEY,company_id text NOT NULL,approval_request_id text,
        reservation_state text NOT NULL,row_version integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE ai_pdm_core.transfer_package_events (
        id text PRIMARY KEY,company_id text NOT NULL,package_id text NOT NULL,
        event_type text NOT NULL,actor_id text NOT NULL,
        detail_json jsonb NOT NULL,created_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.submissions (
        id text PRIMARY KEY,company_id text NOT NULL,item_id text NOT NULL,
        status text NOT NULL,released_at timestamptz,updated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO ai_pdm_core.submissions
        (id,company_id,item_id,status,released_at) VALUES
        ('f07-current','company-jenfu','f07-item','Released','2026-09-29T12:00:00Z'),
        ('f07-old','company-jenfu','f07-item','Released','2026-09-28T12:00:00Z'),
        ('f07-other-company','company-other','f07-other','Released','2026-09-29T12:00:00Z'),
        ('f07-draft','company-jenfu','f07-draft-item','Draft',NULL),
        ('f07-no-package','company-jenfu','f07-no-package-item','Released','2026-09-29T12:00:00Z');
      ALTER TABLE ai_pdm_core.submissions ADD COLUMN submitted_by text NOT NULL DEFAULT 'qc-profile-legacy';
      CREATE TABLE ai_pdm_core.submission_files (
        id text PRIMARY KEY,submission_id text NOT NULL,original_filename text NOT NULL,
        file_role text NOT NULL,local_path text NOT NULL,storage_provider text,
        storage_bucket text,storage_key text,sha256 text NOT NULL,file_size bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY(submission_id) REFERENCES ai_pdm_core.submissions(id));
      CREATE TABLE ai_pdm_core.release_packages (
        id text PRIMARY KEY,submission_id text NOT NULL UNIQUE,
        package_filename text NOT NULL,local_path text NOT NULL,
        storage_provider text,storage_bucket text,storage_key text,
        sha256 text NOT NULL,file_size bigint NOT NULL,manifest_json text NOT NULL,
        created_by text,created_at timestamptz NOT NULL,
        FOREIGN KEY(submission_id) REFERENCES ai_pdm_core.submissions(id));
      -- Minimal synthetic detail tables are query fixtures, not AI-PDM schema conformance.
      -- Actual resolvers, parameter binding, read/update transactions and audit writer execute unchanged.
      CREATE TABLE ai_pdm_core.items (id text PRIMARY KEY,part_number text,part_name text);
      INSERT INTO ai_pdm_core.items SELECT DISTINCT item_id,item_id,'Task-owned part' FROM ai_pdm_core.submissions;
      CREATE TABLE ai_pdm_core.readonly_shares (
        id text PRIMARY KEY,submission_id text NOT NULL REFERENCES ai_pdm_core.submissions(id),
        token_hash text NOT NULL UNIQUE,label text NOT NULL,expires_at timestamptz,
        revoked_at timestamptz,revoked_by text REFERENCES ai_pdm_core.users(id),
        created_by text NOT NULL REFERENCES ai_pdm_core.users(id),access_count integer NOT NULL DEFAULT 0,
        last_accessed_at timestamptz,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
      CREATE TABLE ai_pdm_core.supplier_portal_responses (
        id text PRIMARY KEY,submission_id text,share_id text,status text,closed_by text,created_at timestamptz);
      CREATE TABLE ai_pdm_core.submission_part_scopes (submission_id text,part_number text,part_number_id text);
      CREATE TABLE ai_pdm_core.file_references (submission_id text,source_filename text,referenced_filename text);
      CREATE TABLE ai_pdm_core.approval_steps (submission_id text,reviewer_id text,sequence_no integer,decided_at timestamptz);
      CREATE TABLE ai_pdm_core.submission_lifecycle_requests (
        id text,submission_id text,requested_by text,decided_by text,request_status text,created_at timestamptz);
      CREATE TABLE ai_pdm_core.item_locks (
        id text,item_id text,locked_by text,released_at timestamptz,expires_at timestamptz,created_at timestamptz);
      CREATE TABLE ai_pdm_core.submission_snapshots (submission_id text,snapshot_json text);
      CREATE TABLE ai_pdm_core.drawing_revision_packages (
        id text,company_id text,source_submission_id text,status text,revision text);
      CREATE TABLE ai_pdm_core.drawing_revision_package_review_approvals (
        package_id text,candidate_revision_id text,snapshot_hash text);
      CREATE TABLE ai_pdm_core.numbering_candidate_revision_drafts (
        id text,formal_revision_package_id text,review_snapshot_hash text);
      CREATE TABLE ai_pdm_core.drawing_revision_fff_assessments (id text,company_id text,submission_id text);
      CREATE TABLE ai_pdm_core.review_confirmation_events (review_id text,company_id text,action text);
      CREATE TABLE ai_pdm_core.audit_logs (
        id text PRIMARY KEY,submission_id text,actor_id text,action text NOT NULL,
        detail_json text NOT NULL,company_id text,scope_kind text NOT NULL,
        created_at timestamptz NOT NULL,
        FOREIGN KEY(submission_id) REFERENCES ai_pdm_core.submissions(id));
      CREATE TABLE ai_pdm_core.platform_command_receipts (
        id text PRIMARY KEY,company_id text NOT NULL,command_name text NOT NULL,
        schema_version integer NOT NULL,idempotency_key text NOT NULL,
        actor_id text,principal_id text,platform_principal_id text,
        platform_organization_id text,correlation_id text NOT NULL,
        command_status text NOT NULL,response_json jsonb NOT NULL,
        created_at timestamptz NOT NULL,completed_at timestamptz,
        UNIQUE(company_id,command_name,idempotency_key),
        FOREIGN KEY(company_id,actor_id,principal_id)
          REFERENCES ai_pdm_core.principal_accounts(company_id,pdm_user_id,principal_id));
      CREATE TABLE ai_pdm_core.platform_outbox_events (
        id text PRIMARY KEY,company_id text NOT NULL,aggregate_type text NOT NULL,
        aggregate_id text NOT NULL,event_type text NOT NULL,
        schema_version integer NOT NULL,payload_json jsonb NOT NULL,
        actor_id text,principal_id text,platform_principal_id text,
        platform_organization_id text,correlation_id text NOT NULL,
        idempotency_key text NOT NULL,delivery_status text NOT NULL,
        attempt_count integer NOT NULL,next_attempt_at timestamptz,
        last_error text,occurred_at timestamptz NOT NULL,published_at timestamptz,
        updated_at timestamptz NOT NULL,
        UNIQUE(company_id,event_type,idempotency_key),
        FOREIGN KEY(company_id,actor_id,principal_id)
          REFERENCES ai_pdm_core.principal_accounts(company_id,pdm_user_id,principal_id));
      INSERT INTO ai_pdm_core.approval_platform_requests
        (id,company_id,action_code,request_status,title,reason,requested_by,payload_json)
      SELECT 'APR-TRF-00000000-0000-4000-8000-0000000000' || suffix,
        'company-jenfu','transfer.package_review','pending',
        'Review transfer ' || label,'ready for review','qc-profile-legacy',
        jsonb_build_object('transferPackageId','package-org-' || label,
          'snapshotHash',repeat('b',64),'reviewer',
          jsonb_build_object('version',1,'principalId','principal-legacy',
            'profileId','qc-profile-legacy'))
      FROM (VALUES ('09','assigned'),('10','revoked'),('11','scoped'),
        ('12','restored')) AS fixture(suffix,label);
      INSERT INTO ai_pdm_core.transfer_packages
        (id,company_id,package_status,review_request_id,review_snapshot_hash)
      SELECT 'package-org-' || label,'company-jenfu','InReview',
        'APR-TRF-00000000-0000-4000-8000-0000000000' || suffix,repeat('b',64)
      FROM (VALUES ('09','assigned'),('10','revoked'),('11','scoped'),
        ('12','restored')) AS fixture(suffix,label);
      INSERT INTO ai_pdm_core.transfer_packages
        (id,company_id,package_status,review_request_id,review_snapshot_hash)
      VALUES ('package-org-flow','company-jenfu','Draft',NULL,NULL);
      INSERT INTO ai_pdm_core.part_numbers
        (id,company_id,record_status,updated_at,part_name,item_kind)
      VALUES ('part-org-flow','company-jenfu','Active',now(),'Grant flow part','part');
      INSERT INTO ai_pdm_core.transfer_package_items
        (id,company_id,package_id,entity_type,entity_id,entity_code,
         display_label,root_code,record_status,added_by,created_at)
      VALUES ('item-org-flow','company-jenfu','package-org-flow','part_number',
        'part-org-flow','P-ORG-FLOW','Grant flow part','P-ORG-FLOW',
        'Active','qc-profile-owner',now());
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ai_pdm_core
        TO dev057_ai_pdm_consumer_probe;
    `)
    const readable = await client.query("SELECT has_table_privilege('dev057_ai_pdm_consumer_probe','orgmaster_contract.v_ai_pdm_principal_effective_grants_v3','SELECT') AS granted")
    assert.equal(readable.rows[0].granted, true)
    const typed = await client.query(`SELECT principal_id,employee_id,account_type,principal_issuer,principal_subject
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_id='principal-legacy'`)
    assert.ok(typed.rowCount >= 1, 'published Principal must have an active typed account')
    assert.ok(typed.rows.every((row) => row.principal_id === 'principal-legacy' &&
      row.employee_id === 'employee-legacy' && row.account_type === 'human_personal'),
    'provider aliases must resolve to the same canonical Principal and Employee')
    const flowOwner = await queryAs('jenfu_ai_pdm_runtime', `
      SELECT principal_issuer,principal_subject,principal_id,employee_id,account_type
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_issuer='issuer-race-binder-first'
        AND principal_subject='subject-race-binder-first'`)
    assert.equal(flowOwner.rowCount, 1, 'flow owner must be an exact published typed Principal')
    assert.equal(flowOwner.rows[0].employee_id, 'employee-three')
    assert.equal(flowOwner.rows[0].account_type, 'human_personal')
    await client.query(`INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,employee_id,account_type,company_id,account_status,system_role_enabled)
      VALUES ($1,'qc-profile-owner','employee-three','human_personal','company-jenfu','active',true)`,
      [flowOwner.rows[0].principal_id])

    const consumerUrl = connectionString.replace('postgres@', 'dev057_ai_pdm_consumer_probe@')
    const transferTest = path.join(consumerRoot, 'src', 'lib',
      'transfer-package-orgmaster-grant.postgres-contract.test.ts')
    assert.ok(fs.existsSync(transferTest), 'AI-PDM transfer command test is required')
    const probe = (phase, version) => {
      const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.config.ts',
        'src/lib/repositories/jenfu-principal-grants-v3.postgres-contract.test.ts'], {
        cwd: consumerRoot, encoding: 'utf8', windowsHide: true, timeout: 90_000,
        env: { ...process.env, CI: '1', DEV057_CONTRACT_POSTGRES_URL: consumerUrl,
          DEV057_CONTRACT_PHASE: phase, DEV057_CONTRACT_VERSION: version },
      })
      assert.equal(result.status, 0, `AI-PDM ${phase} consumer failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
      assert.match(result.stdout, /Tests\s+2 passed/u, 'native authorization and published display cases must both execute, not skip')
    }
    const transferProbe = (phase) => {
      if (packageReadOnly) return
      const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.config.ts',
        'src/lib/transfer-package-orgmaster-grant.postgres-contract.test.ts'], {
        cwd: consumerRoot, encoding: 'utf8', windowsHide: true, timeout: 90_000,
        env: { ...process.env, CI: '1', DEV057_CONTRACT_POSTGRES_URL: consumerUrl,
          DEV057_CONTRACT_PHASE: phase, PDM_DB_PROVIDER: 'postgres',
          PDM_POSTGRES_URL: consumerUrl, DEV010_N2_DATABASE_BOUNDARY: 'required',
          DEV057_FLOW_OWNER_PRINCIPAL_ID: flowOwner.rows[0].principal_id },
      })
      assert.equal(result.status, 0, `AI-PDM ${phase} transfer failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
    }
    const downloadTest = path.join(consumerRoot, 'src/lib/principal-published-release-package.postgres-contract.test.ts')
    assert.ok(fs.existsSync(downloadTest), 'actual Principal package HTTP test is required')
    const shareReadEvidence = []
    const downloadProbe = (phase) => {
      const dataDir = path.join(taskRoot, 'aipdm-download-data')
      const repositoryDir = path.join(taskRoot, 'aipdm-download-repository')
      const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.config.ts',
        'src/lib/principal-published-release-package.postgres-contract.test.ts'], {
        cwd: consumerRoot, encoding: 'utf8', windowsHide: true, timeout: 90_000,
        env: { ...process.env, CI: '1', DEV057_CONTRACT_POSTGRES_URL: consumerUrl,
          DEV057_CONTRACT_PHASE: phase, PDM_DB_PROVIDER: 'postgres',
          PDM_POSTGRES_URL: consumerUrl, DEV010_N2_DATABASE_BOUNDARY: 'required',
          PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir,
          DEV057_FILE_QC_ROOT: taskRoot,
          PDM_STORAGE_PROVIDER: 'local_repository', PDM_AUTH_MODE: 'firebase_bff',
          PDM_JENFU_PLATFORM_AUTH_MODE: 'on', PDM_JENFU_ENTITLEMENT_MODE: 'enforce',
          JENFU_FIREBASE_PROJECT_ID: 'dev057-synthetic', PDM_FIREBASE_PROJECT_ID: 'dev057-synthetic',
          JENFU_IDENTITY_AUDIENCE: 'dev057-synthetic',
          JENFU_IDENTITY_ISSUER: 'https://securetoken.google.com/dev057-synthetic',
          PDM_SESSION_ISSUER: 'https://ai-pdm.test', PDM_SESSION_AUDIENCE: 'dev057-file-qc',
          PDM_SESSION_CURRENT_KEY_ID: 'dev057-qc-key',
          PDM_SESSION_CURRENT_SECRET: 'task-owned-synthetic-session-secret-for-local-qc-only' },
      })
      assert.equal(result.status, 0, `AI-PDM ${phase} file consumer failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
      assert.match(result.stdout, /Tests\s+15 passed/u, 'all actual package and share HTTP checks must execute, not skip')
      const reportLine = result.stdout.split(/\r?\n/u).find(line => line.startsWith('{"dev057ShareReadConformance":'))
      assert.ok(reportLine, 'share result must distinguish authorization from known business serialization failure')
      const report = JSON.parse(reportLine).dev057ShareReadConformance
      assert.equal(report.phase, phase)
      const metadataAllowed = !['revoked', 'out-of-scope', 'file-revoked', 'file-scoped', 'file-handoff'].includes(phase)
      assert.equal(report.status, metadataAllowed ? 'PASS_SHARE_READ' : 'PASS_AUTHORIZATION_ONLY')
      assert.equal(report.cases.length, 6)
      assert.equal(new Set(report.cases.map(item => item.id)).size, 6)
      assert.ok(report.cases.every(item => item.authorization === 'PASS'))
      assert.equal(report.publicMetadataPositivePass, metadataAllowed)
      assert.equal(report.publicMetadataBusiness, metadataAllowed ? 'PASS_METADATA' : 'AUTHORIZATION_DENIED')
      assert.equal(report.businessKnownBlocked.status, metadataAllowed ? 'RESOLVED_IN_THIS_LOCAL_PHASE' : 'NOT_RUN_AUTHORIZATION_DENIED')
      assert.equal(report.businessKnownBlocked.code, metadataAllowed ? null : 'NOT_RUN')
      assert.equal(report.businessKnownBlocked.querySha256, '7216177d70e9f26e64e462bccdebe2e2226e6434197bdea03563a105a372337c')
      assert.equal(report.actualOrg029Producer, true)
      assert.equal(report.actualShareResolverAndDelivery, true)
      assert.equal(report.providerConformance, false)
      assert.equal(report.productionL4, false)
      shareReadEvidence.push(report)
      process.stdout.write(JSON.stringify({ dev057ShareReadConformance: report }) + '\n')
    }
    const nativeTransferEvidence = []
    const numberingProbe = (phase, extra = {}) => {
      if (packageReadOnly) return
      const runner = path.join(consumerRoot, 'scripts/qc-dev-121-numbering-owner-grant-postgres.mjs')
      const result = spawnSync(process.execPath, [runner], {
        cwd: consumerRoot, encoding: 'utf8', windowsHide: true, timeout: 180_000,
        env: { ...process.env, DEV057_FILE_QC_ROOT: taskRoot,
          DEV057_NUMBERING_ADMIN_URL: connectionString, DEV057_CONTRACT_PHASE: phase, ...extra }
      })
      assert.equal(result.status, 0, 'AI-PDM numbering ' + phase + ' failed: ' + (result.stdout || '') + '\n' + (result.stderr || ''))
      assert.match(result.stdout, /"status":"PASS"/u)
      if (extra.DEV057_NATIVE_TRANSFER_PROBE === '1') {
        const lines = result.stdout.trim().split(/\r?\n/u)
        const receipt = JSON.parse(lines.findLast((line) => line.startsWith('{"status":"PASS"')))
        assert.equal(receipt.consumerProbe, 'orgmaster-v4-transfer-approval')
        assert.equal(receipt.phase, phase)
        assert.equal(receipt.actorPrincipalId, extra.DEV057_NUMBERING_PRINCIPAL_ID)
        assert.equal(receipt.actorAccountType, extra.DEV057_NUMBERING_ACCOUNT_TYPE)
        assert.equal(receipt.ownerPrincipalId, extra.DEV057_FLOW_OWNER_PRINCIPAL_ID)
        assert.equal(receipt.ownerAccountType, extra.DEV057_FLOW_OWNER_ACCOUNT_TYPE)
        assert.equal(receipt.productionWrites, false)
        nativeTransferEvidence.push({ phase, actorPrincipalId: receipt.actorPrincipalId,
          actorAccountType: receipt.actorAccountType, ownerPrincipalId: receipt.ownerPrincipalId,
          ownerAccountType: receipt.ownerAccountType, status: receipt.status,
          session: receipt.session, productionWrites: receipt.productionWrites })
      }
    }
    const publish = async (suffix, changeAssignment) => {
      const artifact = await activeGovernanceArtifact()
      const active = artifact.payload.publishedVersions.find((version) => version.id === artifact.payload.activePolicyVersionId)
      const versionId = `gov-dev057-contract-${suffix}`
      const appended = appendGovernanceVersion(artifact.payload, active, versionId)
      const assignment = appended.version.policy.roleAssignments.find((item) => item.id === 'assignment-ai-rd')
      assert.ok(assignment, 'the published AI-PDM assignment must exist before an owner change')
      changeAssignment(assignment, appended.version.policy)
      const changes = governanceChange(appended.payload, artifact.canonical_sha256)
      await queryAs('jenfu_orgmaster_runtime',
        "SELECT * FROM orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1($1::jsonb,$2,'dev057-qc',$3,$4,'[]'::jsonb)",
        [JSON.stringify(changes), sha256(`dev057-contract-${suffix}`), `contract-${suffix}`, `dev057-contract-${suffix}`])
      return versionId
    }

    // Verified human management accounts consume the same explicitly published
    // business roles; no administrator bypass or synthetic local grants.
    const personalRows = typed.rows.filter((row) => row.principal_issuer === 'issuer-legacy' &&
      row.principal_subject === 'subject-legacy')
    assert.equal(personalRows.length, 1, 'personal reviewer requires one exact published provider pair')
    const personalReviewer = {
      DEV057_NUMBERING_PRINCIPAL_ID: personalRows[0].principal_id,
      DEV057_NUMBERING_EMPLOYEE_ID: personalRows[0].employee_id,
      DEV057_NUMBERING_ACCOUNT_TYPE: personalRows[0].account_type,
      DEV057_NUMBERING_ISSUER: personalRows[0].principal_issuer,
      DEV057_NUMBERING_SUBJECT: personalRows[0].principal_subject,
    }
    const businessReviewer = {
      DEV057_NUMBERING_PRINCIPAL_ID: 'principal-business-manager',
      DEV057_NUMBERING_EMPLOYEE_ID: 'employee-legacy',
      DEV057_NUMBERING_ACCOUNT_TYPE: 'human_privileged',
      DEV057_NUMBERING_ISSUER: 'issuer-business-manager',
      DEV057_NUMBERING_SUBJECT: 'subject-business-manager',
    }
    const nativeOwner = {
      DEV057_FLOW_OWNER_PRINCIPAL_ID: flowOwner.rows[0].principal_id,
      DEV057_FLOW_OWNER_EMPLOYEE_ID: flowOwner.rows[0].employee_id,
      DEV057_FLOW_OWNER_ACCOUNT_TYPE: flowOwner.rows[0].account_type,
      DEV057_FLOW_OWNER_ISSUER: flowOwner.rows[0].principal_issuer,
      DEV057_FLOW_OWNER_SUBJECT: flowOwner.rows[0].principal_subject,
    }
    const nativeTransferProbe = (phase) => {
      numberingProbe(phase, { DEV057_NATIVE_TRANSFER_PROBE: '1', ...nativeOwner, ...personalReviewer })
      numberingProbe(phase, { DEV057_NATIVE_TRANSFER_PROBE: '1',
        ...nativeOwner, ...businessReviewer })
    }
    const assigned = await publish('reviewer-assigned', (assignment, policy) => {
      const link = { id: 'identity-link-business-manager',
        employeeId: 'employee-legacy', principalId: businessReviewer.DEV057_NUMBERING_PRINCIPAL_ID,
        issuer: businessReviewer.DEV057_NUMBERING_ISSUER,
        subject: businessReviewer.DEV057_NUMBERING_SUBJECT,
        status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
      policy.identityLinks.push(link)
      policy.principalAdmissions.push({ identityLinkId: link.id,
        status: 'active', accountType: businessReviewer.DEV057_NUMBERING_ACCOUNT_TYPE })
      assignment.roleId = 'role-rd-manager'
      assignment.roleCodeSnapshot = 'rd_manager'
      assignment.catalogVersion = principalCatalog.catalogVersion
    })
    probe('assigned', assigned)
    transferProbe('assigned')
    downloadProbe('assigned')
    numberingProbe('assigned')
    nativeTransferProbe('assigned')
    const currentScope = await publish('current-scope', (assignment) => {
      assignment.scope = { kind: 'workspace', value: 'current' }
    })
    probe('current-scope', currentScope)
    const revoked = await publish('revoked', (assignment) => { assignment.status = 'revoked' })
    probe('revoked', revoked)
    transferProbe('revoked')
    downloadProbe('revoked')
    numberingProbe('revoked')
    nativeTransferProbe('revoked')
    const scoped = await publish('scoped', (assignment) => {
      assignment.status = 'active'
      assignment.scope = { kind: 'workspace', value: 'company-other' }
    })
    probe('out-of-scope', scoped)
    transferProbe('out-of-scope')
    downloadProbe('out-of-scope')
    numberingProbe('out-of-scope')
    nativeTransferProbe('out-of-scope')
    const restored = await publish('restored', (assignment) => {
      assignment.scope = { kind: 'workspace', value: 'company-jenfu' }
    })
    probe('restored', restored)
    transferProbe('restored')
    downloadProbe('restored')
    numberingProbe('restored')
    nativeTransferProbe('restored')
    const flow = await publish('flow', (assignment, policy) => {
      assignment.roleId = 'role-pdm-admin'
      assignment.roleCodeSnapshot = 'pdm_admin'
      policy.roleAssignments.push({
        id: 'assignment-ai-owner-flow', employeeId: 'employee-three',
        applicationId: 'ai-pdm', roleId: 'role-rd-manager',
        roleCodeSnapshot: 'rd_manager', catalogVersion: principalCatalog.catalogVersion,
        status: 'active', subjectKind: 'employee', targetPrincipalId: null,
        basis: 'manual', sources: [],
        scope: { kind: 'workspace', value: 'company-jenfu' },
        validFrom: '2026-01-01T00:00:00.000Z'
      })
    })
    const flowGrants = await queryAs('jenfu_ai_pdm_runtime', `
      SELECT principal_id,employee_id,role_code,scope_kind,scope_key
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3
      WHERE principal_id=$1`, [flowOwner.rows[0].principal_id])
    assert.ok(flowGrants.rows.some((grant) => grant.employee_id === 'employee-three' &&
      grant.role_code === 'rd_manager' && grant.scope_kind === 'workspace' &&
      grant.scope_key === 'company-jenfu'),
    'the historical published v3 owner grant remains readable before AI-PDM submits a review')
    const nativeFlowGrants = await queryAs('jenfu_ai_pdm_runtime', `
      SELECT principal_id,employee_id,role_code,scope_kind,scope_key
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
      WHERE principal_id=$1`, [flowOwner.rows[0].principal_id])
    assert.ok(nativeFlowGrants.rows.some((grant) => grant.employee_id === 'employee-three' &&
      grant.role_code === 'rd_manager' && grant.scope_kind === 'workspace' &&
      grant.scope_key === 'company-jenfu'), 'native transfer owner must have the actual v4 published grant')
    transferProbe('flow')
    downloadProbe('flow')
    nativeTransferProbe('flow')
    if (!packageReadOnly) {
    const reviewProbe = spawnSync(process.execPath,
      [path.join(consumerRoot,'scripts/qc-dev-121-numbering-owner-grant-postgres.mjs')], {
      cwd:consumerRoot,encoding:'utf8',windowsHide:true,timeout:180_000,
      env:{...process.env,DEV057_FILE_QC_ROOT:taskRoot,DEV057_NUMBERING_ADMIN_URL:connectionString,
        DEV057_CONTRACT_PHASE:'flow',DEV057_NATIVE_REVIEW_PROBE:'1',
        DEV057_FLOW_OWNER_PRINCIPAL_ID:flowOwner.rows[0].principal_id}
    })
    assert.equal(reviewProbe.status,0,'AI-PDM part/drawing review chain failed: '+(reviewProbe.stdout||'')+'\n'+(reviewProbe.stderr||''))
    assert.match(reviewProbe.stdout,/"status":"PASS"/u)
    }
    const delegationRecipient = await queryAs('jenfu_ai_pdm_runtime',
      "SELECT principal_id,employee_id,account_type,principal_issuer,principal_subject FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_issuer='issuer-managed-verify' AND principal_subject='subject-managed-verify'")
    assert.equal(delegationRecipient.rowCount,1,'the delegation recipient must have an exact verified account')
    assert.equal(delegationRecipient.rows[0].employee_id,'employee-four')
    assert.equal(delegationRecipient.rows[0].account_type,'human_personal')
    const delegationId = 'delegation-dev057-principal-numbering'
    await publish('delegation-active', (assignment,policy) => {
      policy.roleDelegations = [{id:delegationId,sourceAssignmentId:assignment.id,
        fromEmployeeId:'employee-legacy',toEmployeeId:'employee-two',roleId:assignment.roleId,
        catalogVersion:assignment.catalogVersion,scope:structuredClone(assignment.scope),status:'active',
        validFrom:'2026-01-01T00:00:00.000Z',validTo:'2099-01-01T00:00:00.000Z'}]
    })
    const unresolvedDelegated = await queryAs('jenfu_ai_pdm_runtime',
      "SELECT principal_id FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3 WHERE principal_id='principal-recipient'")
    assert.equal(unresolvedDelegated.rowCount,0,'an employee with unresolved ownership must remain excluded')
    await publish('delegation-verified-recipient',(assignment,policy) => {
      policy.roleDelegations[0].toEmployeeId=delegationRecipient.rows[0].employee_id
    })
    const delegated = await queryAs('jenfu_ai_pdm_runtime',
      "SELECT principal_id,grant_kind,delegation_id,scope_key FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v3 WHERE principal_id=$1",[delegationRecipient.rows[0].principal_id])
    assert.deepEqual(delegated.rows,[{principal_id:delegationRecipient.rows[0].principal_id,grant_kind:'delegated',delegation_id:delegationId,scope_key:'company-jenfu'}])
    const delegatedActor = {DEV057_NUMBERING_ACTOR:'delegated',
      DEV057_NUMBERING_DELEGATE_PRINCIPAL_ID:delegationRecipient.rows[0].principal_id,
      DEV057_NUMBERING_DELEGATE_EMPLOYEE_ID:delegationRecipient.rows[0].employee_id,
      DEV057_NUMBERING_DELEGATE_ISSUER:delegationRecipient.rows[0].principal_issuer,
      DEV057_NUMBERING_DELEGATE_SUBJECT:delegationRecipient.rows[0].principal_subject}
    numberingProbe('assigned',delegatedActor)
    await publish('delegation-source-revoked',assignment => {assignment.status='revoked'})
    numberingProbe('revoked',delegatedActor)
    await publish('delegation-wrong-scope',(assignment,policy) => {
      assignment.status='active';assignment.scope={kind:'workspace',value:'company-other'}
      policy.roleDelegations[0].scope=structuredClone(assignment.scope)
    })
    numberingProbe('out-of-scope',delegatedActor)
    await publish('delegation-expired',(assignment,policy) => {
      assignment.scope={kind:'workspace',value:'company-jenfu'}
      policy.roleDelegations[0].scope=structuredClone(assignment.scope)
      policy.roleDelegations[0].validTo='2026-01-02T00:00:00.000Z'
    })
    numberingProbe('revoked',delegatedActor)
    await publish('delegation-retired',(assignment,policy) => {policy.roleDelegations=[]})
    const fileHandoff = await publish('file-handoff', (assignment) => {
      assignment.roleId = 'role-manufacturing'
      assignment.roleCodeSnapshot = 'manufacturing'
    })
    downloadProbe('file-handoff')
    const fileRevoked = await publish('file-revoked', (assignment) => { assignment.status = 'revoked' })
    downloadProbe('file-revoked')
    const fileScoped = await publish('file-scoped', (assignment) => {
      assignment.status = 'active'
      assignment.scope = { kind: 'workspace', value: 'company-other' }
    })
    downloadProbe('file-scoped')
    await publish('file-restore', (assignment) => {
      assignment.roleId = 'role-pdm-admin'
      assignment.roleCodeSnapshot = 'pdm_admin'
      assignment.scope = { kind: 'workspace', value: 'company-jenfu' }
    })
    const publicMetadataPositivePass = shareReadEvidence.some(report => report.publicMetadataPositivePass === true)
    const businessKnownBlocked = publicMetadataPositivePass
      ? 'D122-08/LOCAL_METADATA_VERIFIED_PRODUCTION_NOT_RUN'
      : 'D122-08/NOT_RUN_AUTHORIZATION_DENIED'
    if (packageReadOnly) return {
      evidenceScope: 'TARGETED_ACTUAL_ORG029_PRODUCER_AND_AI_SHARE_READ_CONSUMER_AUTH_ONLY', catalogPublicationEvidence,
      consumerPackage: packageName, runtimeRole: 'dev057_ai_pdm_consumer_probe',
      downloadTestSha256: sha256(fs.readFileSync(downloadTest)),
      producer029Sha256: sha256(fs.readFileSync(path.join(root,'db/migrations/029_dev057_human_business_principal_grants_v4.sql'))),
      publishedVersions: [assigned,revoked,scoped,restored,flow,fileHandoff,fileRevoked,fileScoped],
      shareReadEvidence, actualShareReadCasesPerPhase: 6, totalHttpCasesPerPhase: 15,
      verifiedSession: 'synthetic-v2-principal', providerConformance: false, productionL4: false,
      businessDetailSchema: 'minimal-synthetic-query-fixture', storageBytes: 'task-owned-synthetic',
      transferNumberingAndReviewProbes: 'NOT_RUN_SELECTED_READ_SCOPE',
      publicMetadataPositivePass, businessKnownBlocked,
      download: 'actual HTTP, owner-published v4 grants, restricted PostgreSQL, token/resource resolver, actual local bytes and persisted Principal audit' }
    return { shareReadEvidence, catalogPublicationEvidence, publicMetadataPositivePass,
      businessKnownBlocked, nativeTransferEvidence, nativeTransferTestSha256: sha256(fs.readFileSync(path.join(consumerRoot,
      'src/lib/transfer-package-principal-grants-v4.postgres-contract.test.ts'))),
      consumerPackage: packageName, consumerTestSha256: sha256(fs.readFileSync(consumerTest)),
      transferTestSha256: sha256(fs.readFileSync(transferTest)),
      downloadTestSha256: sha256(fs.readFileSync(downloadTest)), downloadVersions: [fileHandoff, fileRevoked, fileScoped],
      download: 'actual-http, owner grant-v3, restricted PostgreSQL, actual local bytes, Principal audit, no Firebase session proof',
      runtimeRole: 'dev057_ai_pdm_consumer_probe', publishedVersions: [assigned, currentScope, revoked, scoped, restored, flow],
      workspaceDisplayPhases: ['assigned','current-scope','revoked','out-of-scope','restored'],
      decisions: ['allowed', 'entitlement_assignment_not_found', 'entitlement_scope_mismatch', 'allowed', 'allowed'],
      transfer: ['committed', 'no-write', 'no-write', 'committed', 'submitted-and-committed'] }
  })
  if (dev057ConsumerRoot) await check('D57-22', 'management HTTP publishes and revokes a Principal grant through the product PostgreSQL writer', async () => {
    const configuredPlatformRoot = process.env.DEV057_PLATFORM_PRODUCER_ROOT?.trim()
    assert.ok(configuredPlatformRoot, 'DEV057_PLATFORM_PRODUCER_ROOT is required for official epoch composition')
    const platformRoot = fs.realpathSync(configuredPlatformRoot)
    const { buildPlatformMigrationBundle } = await import(pathToFileURL(path.join(platformRoot, 'scripts/lib/dev011-platform-provider.mjs')).href)
    const platformProfile = JSON.parse(fs.readFileSync(path.join(platformRoot, 'config/dev-011/platform-independent-release-v3.json'), 'utf8'))
    const platformFiles = new Map(platformProfile.migrations.entries.map(entry =>
      [entry.path, fs.readFileSync(path.join(platformRoot, entry.path))]))
    const platformSource = run('git', ['-C', platformRoot, 'rev-parse', 'HEAD']).stdout.trim()
    const { bundle } = buildPlatformMigrationBundle(platformProfile, platformFiles, platformSource)
    await client.query('CREATE SCHEMA platform_contract AUTHORIZATION jenfu_platform_migrator')
    const baseFiles = [
      '001_platform_auth_epoch_and_portal_sessions.sql',
      '002_dev005_employee_auth_epoch_invalidation.sql',
      '003_dev010_platform_contract_producer.sql',
      '005_dev013_sso_handoff_and_auth_state.sql',
      '006_dev014_global_invalidation_consumer.sql',
    ]
    for (const name of baseFiles) await client.query(platformFiles.get('db/migrations/' + name).toString('utf8'))
    // Use the Platform owner's existing atomic 008 -> 009 supersession producer.
    await client.query('BEGIN')
    try {
      await client.query('SET LOCAL ROLE jenfu_platform_migrator')
      await client.query('SET LOCAL check_function_bodies = off')
      await client.query(Buffer.from(bundle.entries[7].sqlBase64, 'base64').toString('utf8'))
      await client.query('SET LOCAL check_function_bodies = on')
      await client.query(Buffer.from(bundle.entries[8].sqlBase64, 'base64').toString('utf8'))
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    await client.query(platformFiles.get('db/migrations/010_dev015_principal_auth_contract_manifest.sql').toString('utf8'))
    const manifest = (await queryAs('jenfu_orgmaster_runtime',
      "SELECT contract_version, signature_sha256::text FROM platform_contract.v_contract_manifest_v1 WHERE contract_id='platform.principal-auth-state'")).rows
    assert.deepEqual(manifest, [{ contract_version: 'jenfu.platform-contract.principal-auth-state.v3',
      signature_sha256: '2e56c51ca3d2ad4889d818013cc503fc2727c6817d1d9d71663538901d3de385' }])
    const managedActor = (await client.query("SELECT principal_id, employee_id, principal_issuer, principal_subject FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_issuer='issuer-managed-verify' AND principal_subject='subject-managed-verify'")).rows
    assert.equal(managedActor.length, 1, 'native verified managed actor is required')
    const testPath = path.join(root, 'server', 'orgmasterGovernanceProduct.postgres.test.ts')
    assert.ok(fs.existsSync(testPath), 'product governance integration test is required')
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
      'run', 'server/orgmasterGovernanceProduct.postgres.test.ts'], {
      cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000,
      env: { ...process.env, CI: '1',
        DEV057_PRODUCT_GOVERNANCE_ADMIN_URL: connectionString,
        DEV057_PRODUCT_GOVERNANCE_PRINCIPAL: managedActor[0].principal_id,
        DEV057_PRODUCT_GOVERNANCE_EMPLOYEE: managedActor[0].employee_id,
        DEV057_PRODUCT_GOVERNANCE_ISSUER: managedActor[0].principal_issuer,
        DEV057_PRODUCT_GOVERNANCE_SUBJECT: managedActor[0].principal_subject,
        DEV057_PRODUCT_GOVERNANCE_RUNTIME_URL: connectionString.replace('postgres@', 'dev057_orgmaster_catalog_probe@'),
        DEV057_PRODUCT_GOVERNANCE_CONSUMER_URL: connectionString.replace('postgres@', 'dev057_ai_pdm_consumer_probe@'),
      },
    })
    assert.equal(result.status, 0,
      `OrgMaster product governance failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
    assert.match(result.stdout, /Tests\s+3 passed/u,
      'product governance PostgreSQL probe must execute, not skip')
    // Seal only this exact test's scalar checkpoint protocol, never the full child output.
    const withdrawals = ['session', 'epoch', 'governance-cas', 'workspace', 'managed-quarantine', 'admission']
    const checkpoints = result.stdout.split(/\r?\n/u).map(line => line.trim())
      .filter(line => line.startsWith('{"dev057GovernanceCheckpoint":'))
      .map(line => {
        const row = JSON.parse(line).dev057GovernanceCheckpoint
        assert.ok(row && typeof row.stage === 'string' && Number.isSafeInteger(row.elapsedMs) && row.elapsedMs >= 0,
          'product checkpoint must have a fixed stage and elapsed time')
        const projected = { stage: row.stage, elapsedMs: row.elapsedMs }
        if (row.withdrawal !== undefined) { assert.ok(withdrawals.includes(row.withdrawal)); projected.withdrawal = row.withdrawal }
        if (row.forStage !== undefined) { assert.ok([...withdrawals, 'write-first-revoker'].includes(row.forStage)); projected.forStage = row.forStage }
        if (row.status !== undefined) { assert.ok([200, 201, 401, 409].includes(row.status)); projected.status = row.status }
        return projected
      })
    const expectedCheckpoints = [
      ...['read-before', 'read-after', 'publish-before', 'publish-after', 'revoke-before', 'revoke-after'].map(stage => [stage, null, null]),
      ...withdrawals.flatMap(withdrawal => [
        ['race-before', withdrawal, null], ['lock-wait-before', null, withdrawal],
        ['lock-wait-observed', null, withdrawal], ['race-withdrawal-committed', withdrawal, null],
        ['race-assertions-after', withdrawal, null], ['race-after', withdrawal, null],
      ]),
      ['write-first-before', null, null], ['write-first-ready', null, null],
      ['lock-wait-before', null, 'write-first-revoker'], ['lock-wait-observed', null, 'write-first-revoker'],
      ['write-first-commit-before', null, null], ['write-first-commit-after', null, null],
      ['write-first-after', null, null], ['cleanup-after', null, null],
    ]
    assert.equal(checkpoints.length, 50, 'all native product stages must be observed')
    assert.deepEqual(checkpoints.map(row => [row.stage, row.withdrawal ?? null, row.forStage ?? null]), expectedCheckpoints)
    return { testSha256: sha256(fs.readFileSync(testPath)), checkpoints, verifiedSession: 'persisted-v2-principal-with-official-epoch-contract',
      platformEpochComposition: { source: platformSource, manifest, migrations: [...baseFiles,
        '008_dev014_platform_authority_switch_contract.sql','009_dev015_principal_auth_state.sql',
        '010_dev015_principal_auth_contract_manifest.sql'].map(name => ({ owner: 'platform',
          path: 'db/migrations/' + name, sha256: sha256(platformFiles.get('db/migrations/' + name)) })) },
      phases: ['managed-no-json-alias', 'published-assignment', 'published-revocation',
        'same-snapshot-cas', 'workspace-withdrawal', 'managed-quarantine',
        'session-revocation', 'principal-epoch-withdrawal', 'write-first-revoke-waits'], ownerApi: 'actual-http',
      consumer: 'ai-pdm-runtime-grant-v3' }
  })
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

function currentWorkspaceRevision() {
  return sha256(JSON.stringify(persistenceFixture().currentDocument))
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
  const assignment = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1($1,$2,'dev-047-qc',$3,$4,clock_timestamp())`, [employeeId, employeeNumber, currentWorkspaceRevision(), dev049OrLater ? '0' : null])
  const registryRevision = assignment.rows[0].revision
  const email = `${employeeNumber.toLowerCase()}@jenfu.example`
  const lease = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1($1,$2,$3,'customer-1',$4,$3,'etag-1',$5,$6,'actor-1')`, [employeeId, employeeNumber, email, directoryUserId, currentWorkspaceRevision(), registryRevision])
  const confirmed = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1($1,$2,$3,$4,$5,'actor-1')`, [`confirm-${employeeId}`, employeeId, lease.rows[0].candidate_token, currentWorkspaceRevision(), registryRevision])
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
    const first = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-one','JFS0001','dev-049-qc',$1,'0',clock_timestamp())`, [currentWorkspaceRevision()])
    assert.equal(first.rows[0].revision, '1')
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-two','JFS0002','dev-049-qc',$1,'0',clock_timestamp())`, [currentWorkspaceRevision()])
    const detail = await queryAs('jenfu_orgmaster_runtime', `SELECT employee_number,registry_revision FROM orgmaster_core.read_employee_managed_identity_v1('employee-one')`)
    assert.deepEqual(detail.rows, [{ employee_number: 'JFS0001', registry_revision: '1' }])
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-one','JFS0003','dev-049-qc',$1,'0',clock_timestamp())`, [currentWorkspaceRevision()]), 'MANAGED_IDENTITY_REVISION_CONFLICT')
    return { employeeOneRevision: detail.rows[0].registry_revision, unrelatedEmployeeDidNotInvalidate: true, oldLeaseInvalidated: true }
  })

  await check('D49-02', 'explicit primary email, redacted candidate DTO and receipt-first replay', async () => {
    const email = 'jedchang0308@jenfu.example'
    const lease = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1('employee-one','JFS0001',$1,'customer-1','directory-one',$1,'etag-1',$2,'1','actor-1')`, [email, currentWorkspaceRevision()])
    candidate = { token: lease.rows[0].candidate_token, email }
    const preflight = await queryAs('jenfu_orgmaster_runtime', `SELECT orgmaster_core.read_managed_identity_candidate_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1') AS result`, [candidate.token, currentWorkspaceRevision()])
    assert.equal(preflight.rows[0].result.kind, 'candidate')
    assert.equal(preflight.rows[0].result.snapshot.primaryEmail, email)
    const first = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1')`, [candidate.token, currentWorkspaceRevision()])
    const replayRead = await queryAs('jenfu_orgmaster_runtime', `SELECT orgmaster_core.read_managed_identity_candidate_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1') AS result`, [candidate.token, currentWorkspaceRevision()])
    const replay = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-1')`, [candidate.token, currentWorkspaceRevision()])
    assert.equal(replayRead.rows[0].result.kind, 'replayed')
    assert.equal(replay.rows[0].identity_record_id, first.rows[0].identity_record_id)
    const fingerprint = confirmFingerprint({ actor: 'actor-1', employeeId: 'employee-one', candidateToken: candidate.token, workspaceRevision: currentWorkspaceRevision(), registryRevision: '1' })
    const counts = await client.query(`SELECT (SELECT count(*)::int FROM orgmaster_core.managed_daily_identities WHERE employee_id='employee-one') AS identities,(SELECT count(*)::int FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='confirm-employee-one') AS receipts,(SELECT count(*)::int FROM orgmaster_core.managed_identity_audit_events WHERE command_id='confirm-employee-one' AND action='managed_identity_link_confirmed') AS audits,(SELECT request_hash_sha256 FROM orgmaster_core.managed_identity_command_receipts WHERE command_id='confirm-employee-one') AS fingerprint`)
    assert.deepEqual(counts.rows[0], { identities: 1, receipts: 1, audits: 1, fingerprint })
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('confirm-employee-one','employee-one',$1,$2,'1','actor-2')`, [candidate.token, currentWorkspaceRevision()]), 'MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('new-command','employee-one',$1,$2,'1','actor-1')`, [candidate.token, currentWorkspaceRevision()]), 'MANAGED_IDENTITY_CANDIDATE_INVALID')
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
    await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-three','JFS0003','dev-049-qc',$1,'0',clock_timestamp())`, [currentWorkspaceRevision()])
    const email = 'rollback@jenfu.example'
    const lease = await queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.lease_managed_identity_candidate_v1('employee-three','JFS0003',$1,'customer-1','directory-three',$1,'etag-3',$2,'1','actor-3')`, [email, currentWorkspaceRevision()])
    await client.query(`CREATE FUNCTION orgmaster_core.dev049_qc_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='managed_identity_link_confirmed' THEN RAISE EXCEPTION 'QC_CONFIRM_ROLLBACK'; END IF; RETURN NEW; END $$`)
    await client.query(`CREATE TRIGGER dev049_qc_reject_audit BEFORE INSERT ON orgmaster_core.managed_identity_audit_events FOR EACH ROW EXECUTE FUNCTION orgmaster_core.dev049_qc_reject_audit()`)
    await expectDatabaseError(() => queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.confirm_managed_identity_link_v1('rollback-command','employee-three',$1,$2,'1','actor-3')`, [lease.rows[0].candidate_token, currentWorkspaceRevision()]), 'QC_CONFIRM_ROLLBACK')
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
  taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), dev057 ? 'orgmaster-dev057-qc-' : dev049 ? 'orgmaster-dev049-qc-' : dev050 ? 'orgmaster-dev050-qc-' : dev052 ? 'orgmaster-dev052-qc-' : dev053 ? 'orgmaster-dev053-qc-' : dev054 ? 'orgmaster-dev054-qc-' : dev055 ? 'orgmaster-dev055-qc-' : 'orgmaster-dev047-qc-'))
  clusterDir = path.join(taskRoot, 'cluster'); postgresLog = path.join(taskRoot, 'postgres.log'); port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: { project: root, purpose: dev057 ? 'DEV-057 isolated PostgreSQL 001-030 principal ownership and producer QC' : dev049 ? 'DEV-049 isolated PostgreSQL 001-013 QC' : dev050 ? 'DEV-050 and DEV-013 recovery isolated PostgreSQL 001-015 QC' : dev052 ? 'DEV-052 isolated PostgreSQL 001-016 lifecycle contract QC' : dev053 ? 'DEV-053 isolated PostgreSQL 001-017 application registration QC' : dev054 ? 'DEV-054 isolated PostgreSQL 001-019 activation and workspace revision contract QC' : dev055 ? 'DEV-055 isolated PostgreSQL 001-020 current projection contract QC' : 'DEV-047 isolated PostgreSQL 001-012 and A17-A22 QC', port, owningProcessTree: 'qc-dev-047-postgres.mjs -> task-owned PostgreSQL cluster', cleanupCondition: 'all clients closed, cluster stopped, port released, temporary root removed', mutationScope: taskRoot, primaryDataWrites: false } })}\n`)
  run(path.join(postgresBin, 'initdb.exe'), ['-D', clusterDir, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-l', postgresLog, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  postgresPid = Number.parseInt(fs.readFileSync(path.join(clusterDir, 'postmaster.pid'), 'utf8').split(/\r?\n/u)[0], 10)
  const dbName = `${dev057 ? 'dev057' : dev049 ? 'dev049' : dev050 ? 'dev050' : dev052 ? 'dev052' : dev053 ? 'dev053' : dev054 ? 'dev054' : dev055 ? 'dev055' : 'dev047'}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  run(path.join(postgresBin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', dbName])
  connectionString = `postgresql://postgres@127.0.0.1:${port}/${dbName}`
  client = new pg.Client({ connectionString, application_name: dev057 ? 'orgmaster-dev057-qc' : dev049 ? 'orgmaster-dev049-qc' : dev050 ? 'orgmaster-dev050-qc' : dev052 ? 'orgmaster-dev052-qc' : dev053 ? 'orgmaster-dev053-qc' : dev054 ? 'orgmaster-dev054-qc' : dev055 ? 'orgmaster-dev055-qc' : 'orgmaster-dev047-qc' })
  await client.connect()
  serverVersion = (await client.query('SHOW server_version')).rows[0].server_version
  if (!supportsServerVersion(serverVersion)) throw Object.assign(new Error(`PostgreSQL 17/18 required; got ${serverVersion}`), { reasonCode: 'POSTGRES_VERSION_UNSUPPORTED' })
  await bootstrap(dbName); await applyMigrations()

  if (dev049) { await runDev049Checks(); return }
  if (dev050) { await runDev050Checks(); return }
  if (dev052) { await runDev052Checks(); return }
  if (dev053) { await runDev053Checks(); return }
  if (dev054) { await runDev054Checks(); return }
  if (dev055) { await runDev055Checks(); return }
  if (dev057) {
    if (numberScope) await runEmployeeNumberChecks({ client, check, queryAs, expectDatabaseError, openAuxClient, closeAuxClient, currentWorkspaceRevision })
    else await runDev057Checks()
    return
  }

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
      queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-three','JFS0099','writer-a',$1,NULL,clock_timestamp())`, [currentWorkspaceRevision()], peers[0]),
      queryAs('jenfu_orgmaster_runtime', `SELECT * FROM orgmaster_core.assign_employee_number_v1('employee-four','JFS0099','writer-b',$1,NULL,clock_timestamp())`, [currentWorkspaceRevision()], peers[1]),
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
  await Promise.all([...auxiliaryClients].map(async (peer) => { await peer.end().catch(() => undefined); auxiliaryClients.delete(peer) }))
  cleanup.auxiliaryClientsClosed = auxiliaryClients.size === 0
  if (client) { await client.end().catch(() => undefined); cleanup.clientClosed = true } else cleanup.clientClosed = true
  if (started) cleanup.clusterStopped = spawnSync(path.join(postgresBin, 'pg_ctl.exe'), ['-D', clusterDir, '-m', 'fast', '-w', 'stop'], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'ignore' }).status === 0
  else cleanup.clusterStopped = true
  if (port) cleanup.portReleased = await released(port); else cleanup.portReleased = true
  if (taskRoot) { try {
    const absolute = path.resolve(taskRoot)
    if (path.dirname(absolute).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() || !/^orgmaster-dev\d+-qc-/u.test(path.basename(absolute))) throw new Error('QC_CLEANUP_TARGET_MISMATCH')
    fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); cleanup.tempRemoved = !fs.existsSync(taskRoot) } catch { cleanup.tempRemoved = false } } else cleanup.tempRemoved = true
}

const requiredCases = dev049 ? ['D49-01','D49-02','D49-03','D49-04','D49-05','D49-06'] : dev050 ? ['D50-01','D50-02','D50-03','D50-04','D50-05'] : dev052 ? ['D52-01','D52-02','D52-03'] : dev053 ? ['D53-01','D53-02','D53-03'] : dev054 ? ['D54-01','D54-02','D54-03','D54-04','D54-05','D54-06'] : dev055 ? ['D55-01','D55-02','D55-03','D55-04','D55-05'] : numberScope ? ['D57-01','D57-10', ...employeeNumberCases] : dev057 ? ['D57-01','D57-02','D57-03','D57-04','D57-05','D57-06','D57-07','D57-08','D57-09','D57-10','D57-11','D57-12','D57-13','D57-14','D57-15','D57-16','D57-17','D57-18','D57-19','D57-20','D57-23','D57-24', ...(dev057ConsumerRoot ? ['D57-21','D57-22'] : [])] : requiredCorrectionCases
const allRequiredPassed = requiredCases.every((id) => checks.some((entry) => entry.id === id && entry.status === 'PASS'))
const status = !firstFailure && allRequiredPassed && Object.values(cleanup).every(Boolean) ? 'PASS' : firstFailure?.reasonCode === 'POSTGRES_RUNTIME_MISSING' ? 'BLOCKED' : 'FAIL'
const manifest = {
  contract: dev049 ? 'DEV-049' : dev050 ? 'DEV-050' : dev052 ? 'DEV-052' : dev053 ? 'DEV-053' : dev054 ? 'DEV-054' : dev055 ? 'DEV-055' : dev057 ? 'DEV-057' : 'DEV-047', runner: dev049 ? 'DEV-049-postgres-qc-v1' : dev050 ? 'DEV-050-postgres-qc-v1' : dev052 ? 'DEV-052-postgres-qc-v1' : dev053 ? 'DEV-053-postgres-qc-v1' : dev054 ? 'DEV-054-postgres-qc-v1' : dev055 ? 'DEV-055-postgres-qc-v1' : dev057 ? 'DEV-057-postgres-qc-v2' : 'DEV-047-postgres-qc-v1', evidenceScope: 'TASK_OWNED_LOCAL_ISOLATED', status,
  generatedAt: new Date().toISOString(), productionWrites: false, executedCaseCount: checks.length,
  validationSlice: numberScope ? 'employee-number-command-v2' : 'existing-suite',
  ...(numberScope ? { numberCommandQcSha256: sha256(fs.readFileSync(path.join(root, 'scripts/lib/dev057-employee-number-postgres-qc.mjs'))) } : {}),
  sourceRevision: run('git', ['rev-parse', 'HEAD']).stdout.trim(), dirty: run('git', ['status', '--short']).stdout.trim().split(/\r?\n/u).filter(Boolean),
  serverVersion, acceptedServerMajors: [17, 18], migrations: migrationEvidence, checks, firstFailure,
  source: {
    runnerSha256: sha256(fs.readFileSync(path.join(root, 'scripts', 'qc-dev-047-postgres.mjs'))),
    contractRunnerSha256: sha256(fs.readFileSync(path.join(root, 'scripts', dev049 ? 'qc-dev-049-contract.mjs' : dev050 ? 'qc-dev-050-contract.mjs' : dev052 ? 'qc-dev-052-contract.mjs' : dev053 ? 'qc-dev-053-contract.mjs' : dev054 ? 'qc-dev-054-contract.mjs' : dev055 ? 'qc-dev-055-contract.mjs' : dev057 ? 'qc-dev-057-contract.mjs' : 'qc-dev-047-contract.mjs'))),
    fixtureSha256: sha256(JSON.stringify(persistenceFixture())),
  },
  runtime: { project: root, purpose: dev049 ? 'DEV-049 isolated PostgreSQL validation' : dev050 ? 'DEV-050 isolated PostgreSQL validation' : dev052 ? 'DEV-052 isolated PostgreSQL validation' : dev053 ? 'DEV-053 isolated PostgreSQL validation' : dev054 ? 'DEV-054 isolated PostgreSQL validation' : dev055 ? 'DEV-055 isolated PostgreSQL validation' : dev057 ? 'DEV-057 isolated PostgreSQL validation' : 'DEV-047 isolated PostgreSQL validation', port, postgresPid, owningProcessTree: `node:${process.pid} -> postgres:${postgresPid ?? 'not-started'}`, mutationScope: taskRoot ?? null, interruptedBy, cleanup },
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ status, evidence: outputPath, serverVersion, executedCaseCount: checks.length, cleanup, firstFailure }, null, 2)}\n`)
process.exitCode = (dev049 || dev050 || dev052 || dev053 || dev054 || dev055 || dev057) ? (status === 'PASS' && checks.length === requiredCases.length && Object.values(cleanup).every(Boolean) ? 0 : 2) : resultExitCode(manifest)
