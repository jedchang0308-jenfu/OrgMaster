import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

import { createDisposablePostgresManager } from './lib/dev014-disposable-postgres.mjs'

const ORG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GOVERNOR = 'C:/Users/user/.codex/skills/ai-dev-resource-governor/scripts/resource_governor.py'
const POSTGRES18_BIN = 'C:/Program Files/PostgreSQL/18/bin'
const PDM_ROLES = Object.freeze({ migrator: 'jenfu_ai_pdm_migrator', runtime: 'jenfu_ai_pdm_runtime' })
const ORG_ROLES = Object.freeze({ migrator: 'jenfu_orgmaster_migrator', runtime: 'jenfu_orgmaster_runtime' })
const PLATFORM_ROLES = Object.freeze({
  migrator: 'jenfu_platform_migrator',
  runtime: 'jenfu_platform_runtime',
  login: 'platform-prod-runtime@jenfu-platform-prod.iam',
})
const PLATFORM_MIGRATION_NAMES = Object.freeze([
  '001_platform_auth_epoch_and_portal_sessions.sql',
  '002_dev005_employee_auth_epoch_invalidation.sql',
  '003_dev010_platform_contract_producer.sql',
  '004_dev010_orgmaster_consumer.sql',
  '005_dev013_sso_handoff_and_auth_state.sql',
  '006_dev014_global_invalidation_consumer.sql',
  '007_dev014_managed_login_intents.sql',
  '008_dev014_platform_authority_switch_contract.sql',
  '009_dev015_principal_auth_state.sql',
  '010_dev015_principal_auth_contract_manifest.sql',
  '011_dev014_principal_lifecycle_receipt_v2.sql',
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function requireRoot(name) {
  const value = process.env[name]
  if (!value || !path.isAbsolute(value)) throw new Error(`${name}_ABSOLUTE_PATH_REQUIRED`)
  return fs.realpathSync(value)
}

function resolvePlatformRoot(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('OPTIONS_OBJECT_REQUIRED')
  }
  const value = Object.hasOwn(options, 'platformRoot') ? options.platformRoot : process.env.PLATFORM_DEV058_ROOT
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('PLATFORM_DEV058_ROOT_ABSOLUTE_PATH_REQUIRED')
  const requestedRoot = path.resolve(value)
  const root = fs.realpathSync(requestedRoot)
  const marker = path.join(root, 'AGENTS.md')
  const migrations = path.join(root, 'db', 'migrations')
  const assertRegular = (candidate, code) => {
    const stat = fs.lstatSync(candidate)
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath(fs.realpathSync(candidate), candidate)) throw new Error(code)
  }
  const rootStat = fs.lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !samePath(requestedRoot, root)) {
    throw new Error('PLATFORM_DEV058_ROOT_DIRECTORY_REJECTED')
  }
  assertRegular(marker, 'PLATFORM_DEV058_ROOT_MARKER_REJECTED')
  const migrationStat = fs.lstatSync(migrations)
  if (!migrationStat.isDirectory() || migrationStat.isSymbolicLink() || !samePath(fs.realpathSync(migrations), migrations)) {
    throw new Error('PLATFORM_DEV058_ROOT_MIGRATIONS_REJECTED')
  }
  return root
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function readPlatformMigrations(platformRoot) {
  return PLATFORM_MIGRATION_NAMES.map((name, index) => {
    const sourcePath = path.join(platformRoot, 'db', 'migrations', name)
    const stat = fs.lstatSync(sourcePath)
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath(fs.realpathSync(sourcePath), sourcePath)) {
      throw new Error(`PLATFORM_MIGRATION_SOURCE_REJECTED:${name}`)
    }
    const bytes = fs.readFileSync(sourcePath)
    return Object.freeze({
      index: index + 1,
      name,
      relativePath: `db/migrations/${name}`,
      bytes,
      sourceSha256: sha256(bytes),
    })
  })
}

function runtimeConnectionUrl(handle, user) {
  return `postgresql://${encodeURIComponent(user)}@${handle.host}:${handle.port}/${handle.databaseName}?sslmode=disable`
}

function requireGovernorSession() {
  const value = process.env.ORGMASTER_DEV058_GOVERNOR_SESSION
  assert.match(value ?? '', /^[a-f0-9-]{36}$/iu, 'An active task-owned Governor session is required')
  return value
}

function safePostgresEnvironment() {
  const environment = { DEV047_POSTGRES_BIN: POSTGRES18_BIN }
  for (const name of ['Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec']) {
    if (typeof process.env[name] === 'string') environment[name] = process.env[name]
  }
  return environment
}

function runtime(action, session, handle, startToken) {
  const args = [GOVERNOR, '--agent-host', 'codex', '--format', 'json', 'session', 'runtime', action,
    '--session', session, '--pid', String(handle.process.pid), '--start-token', startToken]
  if (action === 'register') {
    args.push('--executable', handle.process.command,
      '--purpose', 'DEV-058/DEV-123 task-owned native PostgreSQL bootstrap',
      '--cleanup-condition', 'exact task cluster stopped, private port released and task directory removed',
      '--port', String(handle.port))
  } else {
    args.push('--reason', 'stopped')
  }
  return JSON.parse(execFileSync('python', args, { encoding: 'utf8', windowsHide: true }))
}

async function startToken(handle) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `(Get-Process -Id ${handle.process.pid}).StartTime.ToUniversalTime().ToFileTimeUtc().ToString()`],
  { encoding: 'utf8', windowsHide: true }).trim()
}

async function connectTaskClient(handle, applicationName, user = 'postgres') {
  const client = new pg.Client({
    host: handle.host,
    port: handle.port,
    database: handle.databaseName,
    user,
    ssl: false,
    connectionTimeoutMillis: 10_000,
    application_name: applicationName,
  })
  await client.connect()
  return client
}

function stripTransactionEnvelope(sql) {
  const normalized = String(sql).replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').trim()
  const lines = normalized.split('\n')
  let firstStatement = 0
  while (firstStatement < lines.length && (lines[firstStatement].trim() === '' || lines[firstStatement].trim().startsWith('--'))) firstStatement += 1
  if (lines[firstStatement]?.trim() === 'BEGIN;' && lines.at(-1)?.trim() === 'COMMIT;') {
    lines.splice(firstStatement, 1)
    lines.pop()
    return lines.join('\n').trim()
  }
  return normalized
}

async function applyOwnedSql(client, role, sql, label, after = null, before = null) {
  await client.query('BEGIN')
  try {
    await client.query(`SET LOCAL ROLE ${role}`)
    if (before) await before()
    await client.query(stripTransactionEnvelope(sql))
    if (after) await after()
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    error.migrationLabel = label
    throw error
  }
}

function governanceFixture() {
  const identityLink = { id: 'identity-link-legacy', employeeId: 'employee-legacy', issuer: 'issuer-legacy',
    subject: 'subject-legacy', principalId: 'principal-legacy', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }
  const orgmasterRole = { id: 'role-orgmaster-admin', applicationId: 'orgmaster', status: 'active' }
  const aiPdmRole = { id: 'role-rd', applicationId: 'ai-pdm', status: 'active' }
  return { app: 'OrgMaster', schemaVersion: 3, activePolicyVersionId: 'gov-active', draft: {}, auditEvents: [],
    commandReceipts: [], securityAlertIntents: [], sessionInvalidationOutbox: [], publishedVersions: [
      { id: 'gov-old', kind: 'assignment-governance-v3', versionNumber: 1, publishedAt: '2026-01-01T00:00:00.000Z',
        policy: { applications: [], identityLinks: [{ employeeId: 'employee-one', issuer: 'issuer-historical',
          subject: 'subject-historical', principalId: 'principal-old', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }],
          applicationRoles: [], roleAssignments: [] } },
      { id: 'gov-active', kind: 'assignment-governance-v3', versionNumber: 2, publishedAt: '2026-02-01T00:00:00.000Z',
        organizationSnapshot: { workspaceVersionId: 'current', workspaceRevision: '9'.repeat(64) },
        policy: { applications: [{ id: 'orgmaster', applicationId: 'orgmaster', status: 'active' },
          { id: 'ai-pdm', applicationId: 'ai-pdm', status: 'active' }], identityLinks: [identityLink],
          principalAdmissions: [{ identityLinkId: identityLink.id, status: 'active', accountType: 'human_personal' }],
          applicationRoles: [orgmasterRole, aiPdmRole], roleAssignments: [
            { employeeId: 'employee-legacy', applicationId: 'orgmaster', roleId: orgmasterRole.id, status: 'active',
              subjectKind: 'employee', targetPrincipalId: null, scope: { kind: 'global' }, validFrom: '2026-01-01T00:00:00.000Z' },
            { id: 'assignment-ai-rd', employeeId: 'employee-legacy', applicationId: 'ai-pdm', roleId: aiPdmRole.id,
              roleCodeSnapshot: 'rd', catalogVersion: 'ai-pdm.role-catalog.qc', status: 'active', subjectKind: 'employee',
              targetPrincipalId: null, basis: 'manual', sources: [], scope: { kind: 'workspace', value: 'company-jenfu' },
              validFrom: '2026-01-01T00:00:00.000Z' }] } },
    ] }
}

function persistenceArtifacts() {
  const currentDocument = { kind: 'document', state: { employees: [
    { id: 'employee-one', status: 'active' }, { id: 'employee-two', status: 'active' },
    { id: 'employee-three', status: 'active' }, { id: 'employee-four', status: 'active' },
    { id: 'employee-legacy', status: 'active' }, { id: 'employee-inactive', status: 'inactive' }] } }
  const oldDocument = { kind: 'document', state: { employees: [{ id: 'employee-old-snapshot', status: 'active' }] } }
  return [
    ['orgmaster-workspace.v1.json', 'workspace-manifest', { currentVersionId: 'current' }],
    ['orgmaster-versions/current.json', 'workspace-version', currentDocument],
    ['orgmaster-versions/old.json', 'workspace-version', oldDocument],
    ['orgmaster-governance.v3.json', 'governance', governanceFixture()],
  ]
}

async function seedDev014Persistence(client) {
  const batchId = '47000000-0000-4000-8000-000000000001'
  const artifacts = persistenceArtifacts()
  const fixtureRevision = sha256(Buffer.from('DEV058/DEV123 task-owned governance artifact fixture'))
  await client.query('BEGIN')
  try {
    const prior = await client.query(`SELECT
      (SELECT count(*)::int FROM orgmaster_core.persistence_batches WHERE id=$1::uuid) AS batch_count,
      (SELECT count(*)::int FROM orgmaster_core.persistence_authority WHERE singleton=true AND active_batch_id IS NULL) AS empty_authority_count`, [batchId])
    assert.deepEqual(prior.rows, [{ batch_count: 0, empty_authority_count: 1 }])
    await client.query(`INSERT INTO orgmaster_core.persistence_batches
      (id,source_revision,contract_version,source_manifest,artifact_count,media_count,source_bytes,status,imported_at,verified_at,activated_at)
      VALUES ($1,$2,'jenfu.orgmaster-persistence.v1','{}'::jsonb,$3,0,0,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`,
    [batchId, fixtureRevision, artifacts.length])
    for (const [key, kind, payload] of artifacts) {
      const serialized = JSON.stringify(payload)
      const digest = sha256(Buffer.from(serialized, 'utf8'))
      await client.query(`INSERT INTO orgmaster_core.persistence_artifacts
        (batch_id,artifact_key,artifact_kind,payload,source_sha256,canonical_sha256,source_bytes,imported_at)
        VALUES ($1,$2,$3,$4::jsonb,$5,$5,0,clock_timestamp())`, [batchId, key, kind, serialized, digest])
    }
    const activated = await client.query(`UPDATE orgmaster_core.persistence_authority
      SET active_batch_id=$1,authority_version=1,updated_at=clock_timestamp(),updated_by='dev058-dev123-native-bootstrap',reason_code='isolated-fixture'
      WHERE singleton=true AND active_batch_id IS NULL`, [batchId])
    assert.equal(activated.rowCount, 1)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function seedDev121V3Catalog(client, catalog) {
  assert.equal(typeof catalog.catalogVersion, 'string')
  assert.equal(typeof catalog.catalogSha256, 'string')
  assert.equal(catalog.roles.length, 9)
  await client.query('BEGIN')
  try {
    const prior = await client.query(`SELECT
      (SELECT count(*)::int FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=$1) AS publication_count,
      (SELECT count(*)::int FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1) AS entry_count,
      (SELECT count(*)::int FROM ai_pdm_core.active_role_catalog WHERE application_id='ai-pdm') AS active_count`, [catalog.catalogVersion])
    assert.deepEqual(prior.rows, [{ publication_count: 0, entry_count: 0, active_count: 0 }])
    await client.query('SET ROLE jenfu_ai_pdm_migrator')
    await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications
      (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
      VALUES($1,$2,$3,$4,$5,'active','DEV-013 fixture')`,
    [catalog.catalogVersion, catalog.contractVersion, catalog.applicationId, catalog.publishedAt, catalog.catalogSha256])
    for (const [order, role] of catalog.roles.entries()) await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries
      (catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
       recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`,
    [catalog.catalogVersion, order, role.stableRoleId, role.roleCode, role.displayName, role.assignable, role.risk, role.subjectKind,
      role.recommendationAllowed, role.delegationAllowed, JSON.stringify(role.allowedScopeKinds), role.assignmentTier,
      JSON.stringify(role.permissions), JSON.stringify(role.metadata ?? null), role.roleDefinitionHash])
    await client.query(`INSERT INTO ai_pdm_core.active_role_catalog
      (application_id,catalog_version,activated_at,activated_by,activation_reason)
      VALUES('ai-pdm',$1,now(),'DEV-013 fixture','catalog baseline')`, [catalog.catalogVersion])
    await client.query('RESET ROLE')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function preparePdmLegacyLedger(client, packageValue) {
  await client.query(`CREATE TABLE ai_pdm_legacy_stage.pdm_schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`)
  for (const entry of packageValue.legacyLedger) await client.query(
    'INSERT INTO ai_pdm_legacy_stage.pdm_schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
  [entry.version, entry.name, entry.checksum])
}

async function createBaseDatabase(admin, pdmConfig, { platformRoot = null } = {}) {
  const hasActualPlatform = platformRoot !== null
  await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await admin.query(`DO $roles$
    BEGIN
      CREATE ROLE jenfu_platform_migrator NOLOGIN;
      CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;
      CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
      CREATE ROLE jenfu_platform_runtime NOLOGIN;
      CREATE ROLE jenfu_orgmaster_runtime LOGIN;
      CREATE ROLE jenfu_ai_pdm_runtime LOGIN;
      CREATE ROLE jenfu_r1_verifier NOLOGIN;
      CREATE ROLE jenfu_workspace NOLOGIN;
    END
  $roles$`)
  if (hasActualPlatform) {
    await admin.query(`CREATE ROLE "${PLATFORM_ROLES.login}" LOGIN;
      GRANT ${PLATFORM_ROLES.runtime} TO "${PLATFORM_ROLES.login}";
      CREATE SCHEMA platform_core AUTHORIZATION jenfu_platform_migrator;
      DO $database_owner_bootstrap$
      BEGIN
        EXECUTE format('GRANT CREATE ON DATABASE %I TO jenfu_platform_migrator', current_database());
      END
      $database_owner_bootstrap$`)
  }
  await admin.query(`CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_legacy_stage AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA orgmaster AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA organization AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA access_governance AUTHORIZATION jenfu_orgmaster_migrator;
    CREATE SCHEMA platform_contract AUTHORIZATION jenfu_platform_migrator;`)
  if (!hasActualPlatform) {
    await admin.query(`CREATE TABLE platform_contract.task_owned_manifest_fixture (
        contract_id text PRIMARY KEY, contract_version text NOT NULL,
        signature_sha256 char(64) NOT NULL, payload_sha256 char(64));
      ALTER TABLE platform_contract.task_owned_manifest_fixture OWNER TO jenfu_platform_migrator;
      CREATE VIEW platform_contract.v_contract_manifest_v1 AS
        SELECT contract_id,contract_version,signature_sha256,payload_sha256 FROM platform_contract.task_owned_manifest_fixture;
      ALTER VIEW platform_contract.v_contract_manifest_v1 OWNER TO jenfu_platform_migrator;
      CREATE TABLE platform_contract.task_owned_principal_auth_state (
        principal_id text PRIMARY KEY, auth_epoch bigint NOT NULL DEFAULT 0,
        revoked_before timestamptz NULL, version bigint NOT NULL DEFAULT 1);
      ALTER TABLE platform_contract.task_owned_principal_auth_state OWNER TO jenfu_platform_migrator;
      CREATE OR REPLACE FUNCTION platform_contract.read_principal_auth_state_v3(p_principal_id text)
      RETURNS TABLE(principal_id text, auth_epoch bigint, revoked_before timestamptz, version bigint)
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = platform_contract, pg_catalog
      AS $function$
        SELECT state.principal_id, state.auth_epoch, state.revoked_before, state.version
        FROM task_owned_principal_auth_state state
        WHERE state.principal_id = p_principal_id
      $function$;
      ALTER FUNCTION platform_contract.read_principal_auth_state_v3(text) OWNER TO jenfu_platform_migrator;
      REVOKE ALL ON FUNCTION platform_contract.read_principal_auth_state_v3(text) FROM PUBLIC;
      GRANT USAGE ON SCHEMA platform_contract TO jenfu_ai_pdm_migrator, jenfu_orgmaster_migrator, jenfu_ai_pdm_runtime, jenfu_orgmaster_runtime;
      GRANT SELECT ON platform_contract.v_contract_manifest_v1 TO jenfu_ai_pdm_migrator;
      GRANT EXECUTE ON FUNCTION platform_contract.read_principal_auth_state_v3(text)
        TO jenfu_ai_pdm_migrator, jenfu_ai_pdm_runtime, jenfu_orgmaster_migrator, jenfu_orgmaster_runtime`)
    await admin.query(`INSERT INTO platform_contract.task_owned_manifest_fixture
      (contract_id,contract_version,signature_sha256,payload_sha256) VALUES($1,$2,$3,NULL)`,
    [pdmConfig.migration.requiredDependency.contractId, pdmConfig.migration.requiredDependency.contractVersion,
      pdmConfig.migration.requiredDependency.signatureSha256])
  }
}

async function createLedgers(pdmOwner, orgOwner) {
  await pdmOwner.query('SET ROLE jenfu_ai_pdm_migrator')
  await pdmOwner.query(`CREATE TABLE ai_pdm_core.schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum_sha256 char(64) NOT NULL,
    source_revision text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT n1c_ai_pdm_checksum_valid CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'))`)
  await pdmOwner.query('RESET ROLE')
  await orgOwner.query('SET ROLE jenfu_orgmaster_migrator')
  await orgOwner.query(`CREATE TABLE orgmaster_core.schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum_sha256 char(64) NOT NULL,
    source_revision text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT n1c_orgmaster_checksum_valid CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'))`)
  await orgOwner.query('RESET ROLE')
}

function gitHead(root) {
  const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  assert.match(value, /^[0-9a-f]{40}$/u)
  return value
}

export async function withDev058Dev123Database(evaluate, options = {}) {
  if (typeof evaluate !== 'function') throw new TypeError('EVALUATE_CALLBACK_REQUIRED')
  const pdmRoot = requireRoot('PDM_DEV123_ROOT')
  const orgRoot = ORG_ROOT
  const platformRoot = resolvePlatformRoot(options)
  const platformMigrations = platformRoot ? readPlatformMigrations(platformRoot) : []
  const session = requireGovernorSession()
  const manager = createDisposablePostgresManager({ environment: safePostgresEnvironment(), maxConnections: options.maxConnections })
  let handle
  let registered = false
  let governorStartToken = null
  let callbackResult
  let failure = null
  let cleanupFailure = null
  const clients = []
  try {
    handle = await manager.startDisposablePostgres({ purpose: 'DEV-058/DEV-123 isolated native owner bootstrap' })
    if (!String(handle.serverVersion).startsWith('18.')) throw new Error(`POSTGRES18_REQUIRED:${handle.serverVersion}`)
    governorStartToken = await startToken(handle)
    runtime('register', session, handle, governorStartToken)
    registered = true

    const admin = handle.client
    const pdmOwner = await connectTaskClient(handle, 'codex-dev123-pdm-owner-bootstrap')
    clients.push(pdmOwner)
    const orgOwner = await connectTaskClient(handle, 'codex-dev058-orgmaster-owner-bootstrap')
    clients.push(orgOwner)

    const [{ buildDev117MigrationPackage }, { buildOrgmasterPackage }, { buildAiPdmPackage }] = await Promise.all([
      import(pathToFileURL(path.join(pdmRoot, 'scripts', 'lib', 'dev117-ai-pdm-continuous-release.mjs')).href),
      import(pathToFileURL(path.join(orgRoot, 'scripts', 'dev010-n1c-orgmaster-package.mjs')).href),
      import(pathToFileURL(path.join(pdmRoot, 'scripts', 'dev010-n1c-ai-pdm-package.mjs')).href),
    ])
    const pdmConfig = JSON.parse(fs.readFileSync(path.join(pdmRoot, 'config', 'platform', 'dev-010-n1c-ai-pdm.json'), 'utf8'))
    const pdmProfile = JSON.parse(fs.readFileSync(path.join(pdmRoot, 'config', 'release', 'dev117-ai-pdm-independent-production-v3.json'), 'utf8'))
    const v3Catalog = JSON.parse(fs.readFileSync(path.join(pdmRoot, 'config', 'access-control', 'jenfu-role-catalog.v1.json'), 'utf8'))
    const baselinePdmPackage = buildAiPdmPackage(pdmConfig)
    const pdmPackage = { entries: buildDev117MigrationPackage(pdmProfile, pdmConfig).entries.filter(item => Number(path.basename(item.sourcePath).slice(0,3)) <= 85) }
    const orgPackage = buildOrgmasterPackage()
    const pdmRevision = gitHead(pdmRoot)
    const orgRevision = gitHead(orgRoot)
    const platformRevision = platformRoot ? gitHead(platformRoot) : null

    await createBaseDatabase(admin, pdmConfig, { platformRoot })
    await createLedgers(pdmOwner, orgOwner)
    async function applyPlatform(item) {
      const ledgerEntries = item.index === 3 ? platformMigrations.slice(0, 3) : item.index < 3 ? [] : [item]
      await applyOwnedSql(pdmOwner, PLATFORM_ROLES.migrator, item.bytes.toString('utf8'),
        `Platform owner migration ${item.relativePath}`, async () => {
          for (const entry of ledgerEntries) {
            await pdmOwner.query(`INSERT INTO platform_core.schema_migrations(version,name,checksum_sha256,source_revision)
              VALUES($1,$2,$3,$4)`, [entry.name.slice(0, 3), entry.name.slice(4, -4), entry.sourceSha256, platformRevision])
          }
        }, item.index === 8 ? async () => {
          // Historical authority-switch bodies reference retired compatibility
          // relations. Preserve the original SQL without giving Platform access
          // to OrgMaster core; this unused body is not part of the SSO proof.
          await pdmOwner.query('SET LOCAL check_function_bodies = off')
        } : null)
    }
    if (platformRoot) {
      for (const item of platformMigrations.slice(0, 3)) await applyPlatform(item)
    }
    async function applyPdm(item) {
      if (item.sourcePath.includes('/066_')) await seedDev121V3Catalog(pdmOwner, v3Catalog)
      await applyOwnedSql(pdmOwner, PDM_ROLES.migrator, item.sql, `AI-PDM owner prefix ${item.sourcePath}`, async () => {
        await pdmOwner.query(`INSERT INTO ai_pdm_core.schema_migrations(version,name,checksum_sha256,source_revision)
          VALUES($1,$2,$3,$4)`, [item.version, item.name, item.outputSha256, pdmRevision])
      }, item.sourcePath.includes('/062_') ? () => preparePdmLegacyLedger(pdmOwner, baselinePdmPackage) : null)
    }
    for (const item of pdmPackage.entries.slice(0, 15)) await applyPdm(item)
    for (const item of orgPackage.entries) {
      await applyOwnedSql(orgOwner, ORG_ROLES.migrator, item.sql, `OrgMaster owner prefix ${item.sourcePath}`, async () => {
        await orgOwner.query(`INSERT INTO orgmaster_core.schema_migrations(version,name,checksum_sha256,source_revision)
          VALUES($1,$2,$3,$4)`, [item.version, item.name, item.outputSha256, orgRevision])
      })
    }
    const orgMigrationRoot = path.join(orgRoot, 'db', 'migrations')
    const orgMigrations = fs.readdirSync(orgMigrationRoot)
      .filter(name => /^0(1[1-9]|2[0-9]|3[01]|3[45])_.*\.sql$/u.test(name)).sort()
    const deferredOrgMigrations = orgMigrations.filter(name => name.startsWith('034_') || name.startsWith('035_'))
    async function applyOrgMigration(name) {
      if (name.startsWith('012_')) await seedDev014Persistence(orgOwner)
      const bytes = fs.readFileSync(path.join(orgMigrationRoot, name))
      await applyOwnedSql(orgOwner, ORG_ROLES.migrator, bytes.toString('utf8'), `OrgMaster owner migration ${name}`, async () => {
        await orgOwner.query(`INSERT INTO orgmaster_core.schema_migrations(version,name,checksum_sha256,source_revision)
          VALUES($1,$2,$3,$4)`, [name.slice(0, 3), name.slice(4, -4), sha256(bytes), orgRevision])
      })
    }
    for (const name of orgMigrations.filter(name => !deferredOrgMigrations.includes(name) && !name.startsWith('031_'))) {
      await applyOrgMigration(name)
    }
    if (platformRoot) {
      for (const item of platformMigrations.slice(3, 10)) await applyPlatform(item)
    }
    for (const name of orgMigrations.filter(name => name.startsWith('031_'))) await applyOrgMigration(name)
    if (platformRoot) await applyPlatform(platformMigrations[10])
    for (const item of pdmPackage.entries.slice(15)) await applyPdm(item)
    for (const name of deferredOrgMigrations) {
      await applyOrgMigration(name)
    }
    const pdmPost085Root = path.join(pdmRoot, 'db', 'postgres')
    const pdmPost085 = fs.readdirSync(pdmPost085Root).filter(name => /^08[6-8]_.*\.sql$/u.test(name)).sort()
    for (const name of pdmPost085) {
      const bytes = fs.readFileSync(path.join(pdmPost085Root, name))
      await applyOwnedSql(pdmOwner, PDM_ROLES.migrator, bytes.toString('utf8'), `AI-PDM owner migration ${name}`)
    }
    const org036 = fs.readFileSync(path.join(orgMigrationRoot, '036_dev058_retire_unused_role_policy_readiness.sql'), 'utf8')
    await applyOwnedSql(orgOwner, ORG_ROLES.migrator, org036, 'OrgMaster owner migration 036_dev058_retire_unused_role_policy_readiness.sql')
    const org037 = fs.readFileSync(path.join(orgMigrationRoot, '037_dev058_human_privileged_portal_visibility.sql'), 'utf8')
    await applyOwnedSql(orgOwner, ORG_ROLES.migrator, org037, 'OrgMaster owner migration 037_dev058_human_privileged_portal_visibility.sql')

    // The existing small disposable cluster reserves three superuser slots.
    // Release completed owner connections before opening real runtime sessions.
    await pdmOwner.end()
    await orgOwner.end()
    clients.splice(0, 2)

    const pdmRuntime = await connectTaskClient(handle, 'codex-dev123-pdm-runtime-bootstrap', PDM_ROLES.runtime)
    clients.push(pdmRuntime)
    const orgRuntime = await connectTaskClient(handle, 'codex-dev058-orgmaster-runtime-bootstrap', ORG_ROLES.runtime)
    clients.push(orgRuntime)
    await pdmRuntime.query(`SET ROLE ${PDM_ROLES.runtime}`)
    await orgRuntime.query(`SET ROLE ${ORG_ROLES.runtime}`)
    const callbackInput = { admin, pdmRuntime, orgRuntime, handle, pdmRoot, orgRoot }
    if (platformRoot) {
      const platformRuntime = await connectTaskClient(handle, 'codex-dev058-platform-runtime-bootstrap', PLATFORM_ROLES.login)
      clients.push(platformRuntime)
      await platformRuntime.query(`SET ROLE ${PLATFORM_ROLES.runtime}`)
      const runtimeReadback = (await platformRuntime.query(`
        SELECT session_user::text AS session_user, current_user::text AS current_user,
          pg_has_role(session_user, $1, 'member') AS runtime_member,
          pg_has_role(session_user, $2, 'member') AS migrator_member,
          has_schema_privilege(current_user, 'platform_core', 'USAGE') AS platform_core_usage,
          has_schema_privilege(current_user, 'platform_core', 'CREATE') AS platform_core_create,
          has_table_privilege(current_user, 'platform_contract.v_contract_manifest_v1', 'SELECT') AS manifest_select,
          has_function_privilege(current_user, 'platform_contract.read_principal_auth_state_v3(text)', 'EXECUTE') AS auth_state_execute
      `, [PLATFORM_ROLES.runtime, PLATFORM_ROLES.migrator])).rows[0]
      assert.deepEqual(runtimeReadback, {
        session_user: PLATFORM_ROLES.login,
        current_user: PLATFORM_ROLES.runtime,
        runtime_member: true,
        migrator_member: false,
        platform_core_usage: true,
        platform_core_create: false,
        manifest_select: true,
        auth_state_execute: true,
      })
      callbackInput.platformRoot = platformRoot
      callbackInput.platformRuntime = platformRuntime
      callbackInput.platformRuntimeUrl = runtimeConnectionUrl(handle, PLATFORM_ROLES.login)
      callbackInput.platformRuntimeReadback = runtimeReadback
      callbackInput.platformMigrationEvidence = Object.freeze({
        sourceRevision: platformRevision,
        deferredUnusedBodies: Object.freeze(['008_dev014_platform_authority_switch_contract.sql']),
        migrations: Object.freeze(platformMigrations.map(({ index, name, relativePath, sourceSha256 }) =>
          Object.freeze({ index, name, relativePath, sourceSha256 }))),
      })
    }
    callbackResult = await evaluate(callbackInput)
  } catch (error) {
    failure = error
  } finally {
    for (const client of clients.reverse()) await client.end().catch(() => undefined)
    if (handle) {
      try {
        const cleanup = await handle.cleanup()
        if (!cleanup.clientClosed || !cleanup.clusterStopped || !cleanup.portReleased || !cleanup.tempRemoved) {
          throw new Error('DEV058_DEV123_NATIVE_CLEANUP_INCOMPLETE')
        }
        if (registered) runtime('release', session, handle, governorStartToken)
        console.log(JSON.stringify({nativeCleanup:cleanup}))
      } catch (error) {
        cleanupFailure = error
      }
    }
  }
  if (failure) throw failure
  if (cleanupFailure) throw cleanupFailure
  return callbackResult
}
