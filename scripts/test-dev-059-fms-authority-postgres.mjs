import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { createDisposablePostgresManager } from './lib/dev014-disposable-postgres.mjs'

const root = process.cwd()
const manifestHashV1 = 'abdbcf13cdaea492a8e506d274800b74e2336dafd38be221efa1f4b14d28c6c2'
const manifestHashV2 = 'a7a12188c7b1bb1860f008edfca1abaced2fe3c4afa144c5457f1b5b83c571bb'
const checks = []
const manager = createDisposablePostgresManager()
let handle
let cleanup

const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const pass = (id) => { checks.push(id); console.log(`PASS ${id}`) }

async function connect(user, applicationName) {
  const client = new pg.Client({ host: handle.host, port: handle.port, database: handle.databaseName, user, ssl: false, application_name: applicationName })
  await client.connect()
  return client
}
async function seedOwnerState(client) {
  const now = '2026-01-01T00:00:00.000Z'
  const catalogHash = 'c'.repeat(64)
  const artifactHash = 'd'.repeat(64)
  const roles = [
    { stableRoleId: 'role-operator', code: 'operator', displayName: 'Operator', status: 'active', subjectKind: 'employee', assignmentTier: 'app_admin', allowedScopeKinds: ['workspace'], assignmentPolicy: 'open', roleDefinitionHash: '1'.repeat(64) },
    { stableRoleId: 'role-reviewer', code: 'reviewer', displayName: 'Reviewer', status: 'active', subjectKind: 'employee', assignmentTier: 'app_admin', allowedScopeKinds: ['workspace'], assignmentPolicy: 'open', roleDefinitionHash: '2'.repeat(64) },
  ]
  const catalog = {
    applicationId: 'financial-management-system', catalogVersion: 'fms.catalog.native.v1', sourceKind: 'application-contract',
    validationState: 'valid', effectState: 'not-synchronized', contentSha256: catalogHash, catalogSha256: catalogHash,
    artifactSha256: artifactHash, publishedByPrincipalId: 'principal-publisher', publishedByEmployeeId: 'employee-publisher',
    sourceDraftId: 'draft-native-1', sourceDraftRevision: 1, roles,
  }
  const people = [
    ['one', 'human_personal'], ['two', 'human_personal'], ['three', 'human_privileged'], ['four', 'human_personal'],
  ]
  const identityLinks = people.map(([name]) => ({ id: `link-${name}`, issuer: 'https://issuer.native', subject: `subject-${name}`, principalId: `principal-${name}`, employeeId: `employee-${name}`, status: 'active', validFrom: now, validTo: null }))
  const principalAdmissions = people.map(([name, accountType]) => ({ identityLinkId: `link-${name}`, accountType, status: 'active' }))
  const assignment = (name, roleId, extra = {}) => ({ id: `assignment-${name}`, employeeId: `employee-${name}`, applicationId: 'financial-management-system', roleId, roleCodeSnapshot: roleId.replace('role-', ''), roleNameSnapshot: roleId, catalogVersion: catalog.catalogVersion, authoringCatalogVersion: catalog.catalogVersion, authoringCatalogSha256: catalogHash, status: 'active', subjectKind: 'employee', targetPrincipalId: null, scope: { kind: 'workspace', value: 'company-jenfu' }, validFrom: '2026-01-01T00:00:00.000Z', validTo: null, ...extra })
  const activeVersion = {
    id: 'assignment-governance-native-v1', kind: 'assignment-governance-v3', versionNumber: 1, publishedAt: now, snapshotHash: 'e'.repeat(64),
    externalRoleCatalogs: [catalog],
    policy: {
      identityLinks, principalAdmissions,
      roleAssignments: [
        assignment('one', 'role-operator'), assignment('two', 'role-reviewer'),
        assignment('three', 'role-reviewer'),
        assignment('four', 'role-reviewer', { id: 'assignment-four-expired', validTo: '2026-02-01T00:00:00.000Z' }),
      ],
      managementGrants: [{ id: 'grant-three-catalog-read', principalId: 'principal-three', employeeId: 'employee-three', applicationId: 'financial-management-system', capability: 'financial-management-system.catalog.read', status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null }],
    },
  }
  const governance = { app: 'OrgMaster', schemaVersion: 3, activePolicyVersionId: activeVersion.id, draft: {}, publishedVersions: [activeVersion], auditEvents: [], migration: {}, commandReceipts: [], securityAlertIntents: [], sessionInvalidationOutbox: [] }
  const workspaceManifest = { currentVersionId: 'current' }
  const workspace = { kind: 'document', state: { employees: people.map(([name]) => ({ id: `employee-${name}`, status: 'active' })).concat([{ id: 'employee-publisher', status: 'active' }]) } }
  const batchId = randomUUID()
  const artifacts = [
    ['orgmaster-governance.v3.json', 'governance', governance],
    ['orgmaster-workspace.v1.json', 'workspace-manifest', workspaceManifest],
    ['orgmaster-versions/current.json', 'workspace-version', workspace],
  ]
  await client.query(`INSERT INTO orgmaster_core.persistence_batches
    (id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at,activated_at)
    VALUES ($1,$2,'jenfu.orgmaster-persistence.v1','{}'::jsonb,$3,0,0,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`, [batchId, 'f'.repeat(64), artifacts.length])
  for (const [key, kind, payload] of artifacts) {
    const digest = hash(payload)
    await client.query(`INSERT INTO orgmaster_core.persistence_artifacts
      (batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,$5,0,clock_timestamp())`, [batchId, key, kind, JSON.stringify(payload), digest])
  }
  const activated = await client.query(`UPDATE orgmaster_core.persistence_authority
    SET active_batch_id=$1,authority_version=authority_version+1,updated_at=clock_timestamp(),updated_by='dev059-native',reason_code='isolated-fixture'
    WHERE singleton=true`, [batchId])
  assert.equal(activated.rowCount, 1)
}

try {
  handle = await manager.startDisposablePostgres({ purpose: 'DEV-059 FMS authority isolated PostgreSQL contract' })
  console.log(JSON.stringify({ runtime: { pid: handle.process.pid, port: handle.port, taskRoot: handle.taskRoot, database: handle.databaseName, production: false } }))
  const admin = handle.client
  await admin.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE ROLE jenfu_platform_migrator NOLOGIN;
    CREATE ROLE jenfu_platform_runtime NOLOGIN;
    CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
    CREATE ROLE jenfu_orgmaster_runtime LOGIN;
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE ROLE fms_runtime LOGIN;
    CREATE ROLE jenfu_r1_verifier NOLOGIN;
    CREATE ROLE jenfu_workspace NOLOGIN;
    DO $database_grants$
    BEGIN
      EXECUTE format('GRANT CREATE ON DATABASE %I TO jenfu_platform_migrator, jenfu_orgmaster_migrator', current_database());
    END
    $database_grants$;
    CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA platform_contract AUTHORIZATION jenfu_platform_migrator;
    CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS
      SELECT NULL::text AS application_id, NULL::text AS stable_role_id, NULL::text AS role_code,
        NULL::text AS subject_kind, false::boolean AS assignable, '[]'::jsonb AS allowed_scope_kinds,
        false::boolean AS delegation_allowed WHERE false;
    ALTER VIEW ai_pdm_contract.v_application_role_catalog_v1 OWNER TO jenfu_ai_pdm_migrator;
    GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_platform_migrator, jenfu_orgmaster_migrator;
    GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO jenfu_platform_migrator, jenfu_orgmaster_migrator;
    CREATE VIEW platform_contract.v_principal_lifecycle_receipts_v2 AS
      SELECT NULL::text AS contract_version, NULL::text AS receipt_id, NULL::uuid AS event_id,
        NULL::text AS operation_id, NULL::text AS source_revision, NULL::text AS snapshot_hash,
        NULL::text AS delivery_principal_id, NULL::text AS executor_principal_id, false::boolean AS principal_only WHERE false;
    ALTER VIEW platform_contract.v_principal_lifecycle_receipts_v2 OWNER TO jenfu_platform_migrator;
    GRANT USAGE ON SCHEMA platform_contract TO jenfu_orgmaster_migrator;
    GRANT SELECT ON platform_contract.v_principal_lifecycle_receipts_v2 TO jenfu_orgmaster_migrator;`)

  const profile = JSON.parse(fs.readFileSync(path.join(root, 'config/release/dev040-orgmaster-independent-production-v3.json'), 'utf8'))
  assert.equal(profile.migrations.entries.length, 39)
  let ownerStateSeeded = false
  for (const entry of profile.migrations.entries.slice(0, -1)) {
    if (!ownerStateSeeded && entry.path.startsWith('db/migrations/012_')) {
      await seedOwnerState(admin)
      ownerStateSeeded = true
    }
    try {
      await admin.query(fs.readFileSync(path.join(root, entry.path), 'utf8'))
    } catch (error) {
      error.message = `${entry.version}: ${error.message}`
      throw error
    }
  }
  assert.equal(ownerStateSeeded, true)
  const finalEntry = profile.migrations.entries.at(-1)
  assert.equal(finalEntry.version, 'dev060-orgmaster-041')
  await admin.query(fs.readFileSync(path.join(root, finalEntry.path), 'utf8'))
  pass('production-profile-migrations-001-through-041')

  const legacyAuthority = await admin.query(`SELECT principal_id, assignments, protected_grants, manifest_hash FROM orgmaster_contract.v_fms_authority_v1 ORDER BY principal_id`)
  assert.deepEqual(legacyAuthority.rows.map((row) => row.principal_id), ['principal-one', 'principal-three', 'principal-two'])
  assert.equal(legacyAuthority.rows.find((row) => row.principal_id === 'principal-three').assignments.length, 0)
  assert.ok(legacyAuthority.rows.every((row) => row.manifest_hash === manifestHashV1))
  pass('v1-authority-remains-compatible')

  const authority = await admin.query(`SELECT principal_id, employee_id, assignments, protected_grants, manifest_hash, workspace_revision FROM orgmaster_contract.v_fms_authority_v2 ORDER BY principal_id`)
  assert.deepEqual(authority.rows.map((row) => row.principal_id), ['principal-one', 'principal-three', 'principal-two'])
  assert.equal(authority.rows.find((row) => row.principal_id === 'principal-three').assignments.length, 1)
  assert.equal(authority.rows.find((row) => row.principal_id === 'principal-three').protected_grants.length, 1)
  assert.ok(authority.rows.every((row) => row.manifest_hash === manifestHashV2 && /^[a-f0-9]{64}$/u.test(row.workspace_revision)))
  pass('v2-authority-projects-typed-human-business-assignment')

  const portal = await admin.query(`SELECT application_id, principal_subject, assignment_version::text, visibility_state
    FROM orgmaster_contract.v_portal_app_visibility_v1
    WHERE application_id='financial-management-system'
    ORDER BY principal_subject`)
  assert.deepEqual(portal.rows, [
    { application_id: 'financial-management-system', principal_subject: 'subject-one', assignment_version: '1', visibility_state: 'visible' },
    { application_id: 'financial-management-system', principal_subject: 'subject-three', assignment_version: '1', visibility_state: 'visible' },
    { application_id: 'financial-management-system', principal_subject: 'subject-two', assignment_version: '1', visibility_state: 'visible' },
  ])
  assert.equal((await admin.query(`SELECT has_table_privilege('jenfu_platform_runtime','orgmaster_contract.v_portal_app_visibility_v1','SELECT') AS allowed`)).rows[0].allowed, true)
  pass('portal-visibility-reuses-effective-fms-authority')

  const candidates = await admin.query(`SELECT principal_id, employee_id, stable_role_id FROM orgmaster_contract.v_fms_principal_candidates_v2 ORDER BY principal_id`)
  assert.deepEqual(candidates.rows, [
    { principal_id: 'principal-one', employee_id: 'employee-one', stable_role_id: 'role-operator' },
    { principal_id: 'principal-three', employee_id: 'employee-three', stable_role_id: 'role-reviewer' },
    { principal_id: 'principal-two', employee_id: 'employee-two', stable_role_id: 'role-reviewer' },
  ])
  pass('candidate-denominator-requires-effective-typed-human-assignment')

  const admissions = await admin.query(`SELECT principal_id, employee_id, account_type, typed_account_version, mapping_version, security_binding_stamp FROM orgmaster_contract.v_fms_principal_admissions_v2 ORDER BY principal_id`)
  assert.equal(admissions.rows.length, 4)
  assert.ok(admissions.rows.every((row) => row.typed_account_version === row.mapping_version && row.security_binding_stamp === null))
  pass('typed-principal-admission-readback')

  const fms = await connect('fms_runtime', 'dev059-fms-reader')
  try {
    assert.equal((await fms.query('SELECT count(*)::int AS count FROM orgmaster_contract.v_fms_authority_v2')).rows[0].count, 3)
    await assert.rejects(fms.query('SELECT * FROM orgmaster_core.persistence_artifacts LIMIT 1'), (error) => error.code === '42501')
    await assert.rejects(fms.query(`UPDATE orgmaster_contract.v_fms_authority_v2 SET employee_id='tampered'`), (error) => ['42501', '55000'].includes(error.code))
  } finally { await fms.end() }
  pass('fms-runtime-read-only-versioned-views')

  for (const role of ['jenfu_platform_runtime', 'jenfu_ai_pdm_runtime']) {
    const denied = await admin.query(`SELECT has_schema_privilege($1,'orgmaster_contract','USAGE') AS schema_usage,
      has_table_privilege($1,'orgmaster_contract.v_fms_authority_v2','SELECT') AS authority_select`, [role])
    assert.equal(denied.rows[0].authority_select, false)
  }
  pass('non-fms-peer-runtimes-denied-authority-view')

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'contracts/orgmaster-fms-authority/v2/contract-manifest.json'), 'utf8'))
  const manifestBytes = fs.readFileSync(path.join(root, 'contracts/orgmaster-fms-authority/v2/contract-manifest.json'), 'utf8').replace(/\r\n/gu, '\n')
  assert.equal(hash(manifestBytes), manifestHashV2)
  assert.equal(manifest.contractVersion, 'jenfu.orgmaster.fms-authority.v2')
  assert.deepEqual((await admin.query(`SELECT signature_sha256 FROM orgmaster_core.contract_manifest WHERE contract_id='orgmaster.fms-authority-v2'`)).rows, [{ signature_sha256: manifestHashV2 }])
  pass('manifest-and-database-pin-match')
} finally {
  if (handle) cleanup = await handle.cleanup()
  console.log(JSON.stringify({ status: checks.length === 9 && cleanup?.clientClosed && cleanup?.clusterStopped && cleanup?.portReleased && cleanup?.tempRemoved ? 'PASS' : 'FAIL', checks, cleanup, production: false }))
}
// The task-owned runtime is fully released by the finally block above.
