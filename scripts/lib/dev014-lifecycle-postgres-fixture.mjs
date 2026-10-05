import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const LOOPBACK = '127.0.0.1'
const TASK_ROOT_PREFIX = 'orgmaster-dev014-disposable-pg-'
const APPLICATION_NAME = 'orgmaster-dev014-disposable-pg'
const PLATFORM_MIGRATIONS = Object.freeze([
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
const ORGMASTER_MIGRATIONS = Object.freeze([
  '001_dev004_orgmaster_app_sessions.sql',
  '002_dev006_orgmaster_persistence.sql',
  '003_dev006_orgmaster_runtime_repository.sql',
  '004_dev040_active_principal_view.sql',
  '005_dev005_entitlement_governance.sql',
  '006_dev040_identity_admission_projection.sql',
  '007_dev009_privileged_governance.sql',
  '008_dev002_portal_app_visibility.sql',
  '009_dev039_application_entitlement_v2.sql',
  '010_dev010_neutral_schema_boundary.sql',
  '011_dev046_workbench_list_width_preferences.sql',
  '012_dev047_managed_identity_bridge.sql',
  '013_dev049_existing_google_primary_account_link.sql',
  '014_dev050_orgmaster_session_admission.sql',
  '015_dev013_restore_runtime_session_dml.sql',
  '016_dev014_managed_identity_lifecycle_contract.sql',
  '017_dev014_invalidation_application_registration.sql',
  '018_dev014_employee_activation_contract.sql',
  '019_dev014_workspace_revision_contract.sql',
  '020_dev014_current_projection_contract.sql',
  '021_dev057_identity_grant_writer_fence.sql',
  '022_dev014_managed_login_session_admission.sql',
  '023_dev014_authority_principal_projection_contract.sql',
  '024_dev057_principal_identity_invariants.sql',
  '025_dev057_ai_pdm_principal_effective_grants_v2.sql',
  '026_dev057_session_principal_policy_path.sql',
  '027_dev057_principal_cutover_source_manifest.sql',
  '028_dev057_ai_pdm_principal_effective_grants_v3.sql',
  '029_dev057_human_business_principal_grants_v4.sql',
  '030_dev057_employee_number_command_receipt.sql',
  '031_dev014_principal_lifecycle_v2.sql',
])
const SCHEMAS = Object.freeze(['platform_core', 'platform_contract', 'orgmaster_core', 'orgmaster_contract', 'ai_pdm_contract'])
const RUNTIME_LOGINS = Object.freeze([
  Object.freeze({ user: 'orgmaster-prod-runtime@jenfu-platform-prod.iam', group: 'jenfu_orgmaster_runtime', other: 'jenfu_platform_runtime' }),
  Object.freeze({ user: 'platform-prod-runtime@jenfu-platform-prod.iam', group: 'jenfu_platform_runtime', other: 'jenfu_orgmaster_runtime' }),
])
const ROLES = Object.freeze([
  'jenfu_platform_migrator', 'jenfu_orgmaster_migrator', 'jenfu_ai_pdm_migrator',
  'jenfu_platform_runtime', 'jenfu_orgmaster_runtime', 'jenfu_ai_pdm_runtime', 'jenfu_r1_verifier',
  ...RUNTIME_LOGINS.map((entry) => entry.user),
])

function fail(code, cause) {
  const error = new Error(code)
  error.code = code
  if (cause !== undefined) error.cause = cause
  return error
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

const SYNTHETIC_CAPACITY_POPULATION = 500
const CAPACITY_GOVERNANCE_ISSUER = 'issuer-capacity-governance'
const CAPACITY_MANAGED_ISSUER = 'issuer-capacity-managed'

export function buildSyntheticCapacityPopulation() {
  return Object.freeze(Array.from({ length: SYNTHETIC_CAPACITY_POPULATION }, (_, index) => {
    const ordinal = String(index + 1).padStart(4, '0')
    const id = 'd1400000-0140-4000-8000-' + (index + 1).toString(16).padStart(12, '0')
    return Object.freeze({
      id,
      principal: 'principal-managed:' + id,
      employeeId: 'employee-capacity-' + ordinal,
      email: 'capacity-' + ordinal + '@example.test',
      directoryCustomerId: 'capacity-customer-synthetic',
      directoryUserId: 'capacity-user-' + ordinal,
    })
  }))
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function assertRealDirectory(directory, code) {
  try {
    const stat = fs.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(fs.realpathSync(directory), directory)) throw fail(code)
  } catch (error) {
    if (error?.code === code) throw error
    throw fail(code, error)
  }
}

function assertTaskOwnedHandle(handle) {
  if (!handle || typeof handle !== 'object' || !Object.isFrozen(handle) ||
      handle.targetClass !== 'task-owned-local' || handle.host !== LOOPBACK ||
      !Number.isSafeInteger(handle.port) || handle.port < 1024 || handle.port > 65535 ||
      typeof handle.databaseName !== 'string' || !/^dev014_[a-f0-9]{20}$/u.test(handle.databaseName) ||
      typeof handle.taskRoot !== 'string' || !path.isAbsolute(handle.taskRoot) ||
      typeof handle.dataRoot !== 'string' || typeof handle.client?.query !== 'function' ||
      typeof handle.client?.connect !== 'function' || typeof handle.client?.end !== 'function' ||
      typeof handle.measureDataRootBytes !== 'function' || typeof handle.cleanup !== 'function') {
    throw fail('DEV014_FIXTURE_HANDLE_REJECTED')
  }
  const taskRoot = path.resolve(handle.taskRoot)
  if (!new RegExp('^' + TASK_ROOT_PREFIX + '[a-z0-9_-]{1,80}$', 'iu').test(path.basename(taskRoot)) ||
      !samePath(handle.dataRoot, path.join(taskRoot, 'cluster')) ||
      !Number.isSafeInteger(handle.process?.pid) || handle.process.pid <= 0 ||
      !Number.isSafeInteger(handle.process?.ownerProcessId) || handle.process.ownerProcessId <= 0 ||
      path.basename(handle.process?.command ?? '').toLowerCase() !== 'postgres.exe') {
    throw fail('DEV014_FIXTURE_HANDLE_REJECTED')
  }
  assertRealDirectory(taskRoot, 'DEV014_FIXTURE_TASK_ROOT_REJECTED')
  assertRealDirectory(handle.dataRoot, 'DEV014_FIXTURE_DATA_ROOT_REJECTED')
  let measuredBytes
  try {
    // The manager-issued closure checks its private WeakMap and exact task root.
    measuredBytes = handle.measureDataRootBytes()
  } catch (error) {
    throw fail('DEV014_FIXTURE_HANDLE_NOT_MANAGER_OWNED', error)
  }
  if (!Number.isSafeInteger(measuredBytes) || measuredBytes < 0) throw fail('DEV014_FIXTURE_DATA_ROOT_MEASUREMENT_INVALID')
  const parameters = handle.client.connectionParameters
  if (!parameters || parameters.host !== LOOPBACK || Number(parameters.port) !== handle.port ||
      parameters.database !== handle.databaseName || parameters.user !== 'postgres' ||
      parameters.application_name !== APPLICATION_NAME || parameters.isDomainSocket !== false ||
      Boolean(parameters.ssl) || parameters.options) {
    throw fail('DEV014_FIXTURE_CLIENT_TARGET_REJECTED')
  }
  return { taskRoot, measuredBytes }
}

function assertRepositoryRoot(rootValue, expectedName) {
  if (typeof rootValue !== 'string' || !path.isAbsolute(rootValue)) throw fail('DEV014_FIXTURE_REPOSITORY_ROOT_INVALID')
  const root = path.resolve(rootValue)
  assertRealDirectory(root, 'DEV014_FIXTURE_REPOSITORY_ROOT_INVALID')
  if (path.basename(root).toLowerCase() !== expectedName.toLowerCase()) throw fail('DEV014_FIXTURE_REPOSITORY_ROOT_INVALID')
  const marker = path.join(root, 'AGENTS.md')
  try {
    const stat = fs.lstatSync(marker)
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath(fs.realpathSync(marker), marker)) throw fail('DEV014_FIXTURE_REPOSITORY_ROOT_INVALID')
  } catch (error) {
    if (error?.code === 'DEV014_FIXTURE_REPOSITORY_ROOT_INVALID') throw error
    throw fail('DEV014_FIXTURE_REPOSITORY_ROOT_INVALID', error)
  }
  return root
}

function readExactFile(root, repo, relativePath) {
  const filePath = path.join(root, ...relativePath.split('/'))
  try {
    const stat = fs.lstatSync(filePath)
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath(fs.realpathSync(filePath), filePath)) throw fail('DEV014_FIXTURE_SOURCE_FILE_REJECTED')
    const bytes = fs.readFileSync(filePath)
    return {
      repo,
      path: relativePath,
      bytes,
      evidence: Object.freeze({ repo, path: relativePath, bytes: bytes.length, sha256: sha256(bytes) }),
    }
  } catch (error) {
    if (error?.code === 'DEV014_FIXTURE_SOURCE_FILE_REJECTED') throw error
    throw fail('DEV014_FIXTURE_SOURCE_FILE_UNAVAILABLE', error)
  }
}

function readSourceSet(platformRoot, orgmasterRoot) {
  const files = new Map()
  for (const name of PLATFORM_MIGRATIONS) {
    files.set('platform:' + name, readExactFile(platformRoot, 'platform', 'db/migrations/' + name))
  }
  for (const name of ORGMASTER_MIGRATIONS) {
    files.set('orgmaster:' + name, readExactFile(orgmasterRoot, 'orgmaster', 'db/migrations/' + name))
  }
  const provenance = [
    readExactFile(orgmasterRoot, 'orgmaster', 'scripts/qc-dev-047-postgres.mjs'),
    readExactFile(orgmasterRoot, 'orgmaster', 'scripts/lib/dev014-disposable-postgres.mjs'),
    readExactFile(orgmasterRoot, 'orgmaster', 'scripts/lib/dev014-lifecycle-postgres-fixture.mjs'),
  ].map((entry) => entry.evidence)
  return { files, provenance }
}

function governanceFixture(capacityIdentities = []) {
  const role = { id: 'role-orgmaster-admin', applicationId: 'orgmaster', status: 'active' }
  const aiRole = { id: 'role-rd', applicationId: 'ai-pdm', status: 'active' }
  const identityLink = {
    id: 'identity-link-legacy', employeeId: 'employee-legacy', issuer: 'issuer-legacy',
    subject: 'subject-legacy', principalId: 'principal-legacy', status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  }
  const capacityLinks = capacityIdentities.map((identity, index) => ({
    id: 'identity-link-capacity-' + String(index + 1).padStart(4, '0'),
    employeeId: identity.employeeId,
    issuer: CAPACITY_GOVERNANCE_ISSUER,
    subject: 'governance-' + identity.id,
    principalId: identity.principal,
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  }))
  const capacityAdmissions = capacityLinks.map((link) => ({
    identityLinkId: link.id, status: 'active', accountType: 'human_personal',
  }))
  return {
    app: 'OrgMaster',
    schemaVersion: 3,
    activePolicyVersionId: 'gov-active',
    draft: {},
    auditEvents: [],
    commandReceipts: [],
    securityAlertIntents: [],
    sessionInvalidationOutbox: [],
    publishedVersions: [
      {
        id: 'gov-old', kind: 'assignment-governance-v3', versionNumber: 1,
        publishedAt: '2026-01-01T00:00:00.000Z',
        policy: {
          applications: [],
          identityLinks: [{ employeeId: 'employee-one', issuer: 'issuer-historical', subject: 'subject-historical',
            principalId: 'principal-old', status: 'active', validFrom: '2026-01-01T00:00:00.000Z' }],
          applicationRoles: [], roleAssignments: [],
        },
      },
      {
        id: 'gov-active', kind: 'assignment-governance-v3', versionNumber: 2,
        publishedAt: '2026-02-01T00:00:00.000Z',
        organizationSnapshot: { workspaceVersionId: 'current', workspaceRevision: '9'.repeat(64) },
        policy: {
          applications: [
            { id: 'orgmaster', applicationId: 'orgmaster', status: 'active' },
            { id: 'ai-pdm', applicationId: 'ai-pdm', status: 'active' },
          ],
          identityLinks: [identityLink, ...capacityLinks],
          principalAdmissions: [
            { identityLinkId: identityLink.id, status: 'active', accountType: 'human_personal' },
            ...capacityAdmissions,
          ],
          applicationRoles: [role, aiRole],
          roleAssignments: [
            { employeeId: 'employee-legacy', applicationId: 'orgmaster', roleId: role.id, status: 'active',
              subjectKind: 'employee', targetPrincipalId: null, scope: { kind: 'global' }, validFrom: '2026-01-01T00:00:00.000Z' },
            { id: 'assignment-ai-rd', employeeId: 'employee-legacy', applicationId: 'ai-pdm', roleId: aiRole.id,
              roleCodeSnapshot: 'rd', catalogVersion: 'ai-pdm.role-catalog.qc', status: 'active',
              subjectKind: 'employee', targetPrincipalId: null, basis: 'manual', sources: [],
              scope: { kind: 'workspace', value: 'company-jenfu' }, validFrom: '2026-01-01T00:00:00.000Z' },
          ],
        },
      },
    ],
  }
}

function persistenceFixture(capacityIdentities = []) {
  const currentDocument = {
    kind: 'document',
    state: { employees: [
      { id: 'employee-one', status: 'active' }, { id: 'employee-two', status: 'active' },
      { id: 'employee-three', status: 'active' }, { id: 'employee-four', status: 'active' },
      { id: 'employee-legacy', status: 'active' }, { id: 'employee-inactive', status: 'inactive' },
      ...capacityIdentities.map((identity) => ({ id: identity.employeeId, status: 'active' })),
    ] },
  }
  const oldDocument = { kind: 'document', state: { employees: [{ id: 'employee-old-snapshot', status: 'active' }] } }
  return {
    artifacts: [
      ['orgmaster-workspace.v1.json', 'workspace-manifest', { currentVersionId: 'current' }],
      ['orgmaster-versions/current.json', 'workspace-version', currentDocument],
      ['orgmaster-versions/old.json', 'workspace-version', oldDocument],
      ['orgmaster-governance.v3.json', 'governance', governanceFixture(capacityIdentities)],
    ],
  }
}

function migrationPlan(files) {
  const platform = (name) => files.get('platform:' + name)
  const orgmaster = (name) => files.get('orgmaster:' + name)
  return [
    ...PLATFORM_MIGRATIONS.slice(0, 3).map(platform),
    ...ORGMASTER_MIGRATIONS.slice(0, 11).map(orgmaster),
    ...ORGMASTER_MIGRATIONS.slice(11, 30).map(orgmaster),
    ...PLATFORM_MIGRATIONS.slice(3, 10).map(platform),
    orgmaster(ORGMASTER_MIGRATIONS[30]),
    platform(PLATFORM_MIGRATIONS[10]),
  ]
}

async function assertPristineDatabase(handle) {
  let result
  try {
    result = await handle.client.query(
      "SELECT current_database() AS database_name, session_user::text AS session_user, current_user::text AS current_user, " +
      "host(inet_server_addr())::text AS server_address, inet_server_port() AS server_port, " +
      "current_setting('transaction_read_only') AS transaction_read_only, current_setting('application_name') AS application_name, " +
      "(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner, " +
      "(SELECT count(*)::int FROM pg_namespace WHERE nspname=ANY($1::text[])) AS existing_schema_count, " +
      "(SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($2::text[])) AS existing_role_count",
      [SCHEMAS, ROLES],
    )
  } catch (error) {
    throw fail('DEV014_FIXTURE_DATABASE_READBACK_FAILED', error)
  }
  const row = result.rows?.[0]
  if (result.rowCount !== 1 || row?.database_name !== handle.databaseName ||
      row?.session_user !== 'postgres' || row?.current_user !== 'postgres' ||
      row?.server_address !== LOOPBACK || Number(row?.server_port) !== handle.port ||
      row?.transaction_read_only !== 'off' || row?.application_name !== APPLICATION_NAME ||
      row?.database_owner !== 'postgres' || Number(row?.existing_schema_count) !== 0 ||
      Number(row?.existing_role_count) !== 0) {
    const error = fail('DEV014_FIXTURE_DATABASE_TARGET_OR_PRISTINE_CHECK_FAILED')
    error.targetReadback = Object.freeze({
      rowCount: result.rowCount ?? null,
      databaseName: row?.database_name ?? null,
      sessionUser: row?.session_user ?? null,
      currentUser: row?.current_user ?? null,
      serverAddress: row?.server_address ?? null,
      serverPort: row?.server_port ?? null,
      applicationName: row?.application_name ?? null,
      transactionReadOnly: row?.transaction_read_only ?? null,
      databaseOwner: row?.database_owner ?? null,
      existingSchemaCount: row?.existing_schema_count ?? null,
      existingRoleCount: row?.existing_role_count ?? null,
    })
    throw error
  }
}

async function bootstrap(handle) {
  const database = handle.databaseName
  if (!/^dev014_[a-f0-9]{20}$/u.test(database)) throw fail('DEV014_FIXTURE_DATABASE_NAME_REJECTED')
  const sql = [
    'CREATE ROLE jenfu_platform_migrator NOLOGIN;',
    'CREATE ROLE jenfu_orgmaster_migrator NOLOGIN;',
    'CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;',
    'CREATE ROLE jenfu_platform_runtime NOLOGIN;',
    'CREATE ROLE jenfu_orgmaster_runtime NOLOGIN;',
    'CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;',
    'CREATE ROLE jenfu_r1_verifier NOLOGIN;',
    'CREATE ROLE "orgmaster-prod-runtime@jenfu-platform-prod.iam" LOGIN;',
    'CREATE ROLE "platform-prod-runtime@jenfu-platform-prod.iam" LOGIN;',
    'GRANT CREATE ON DATABASE "' + database + '" TO jenfu_platform_migrator, jenfu_orgmaster_migrator;',
    'GRANT jenfu_orgmaster_runtime TO "orgmaster-prod-runtime@jenfu-platform-prod.iam";',
    'GRANT jenfu_platform_runtime TO "platform-prod-runtime@jenfu-platform-prod.iam";',
    'CREATE SCHEMA platform_contract AUTHORIZATION jenfu_platform_migrator;',
    'CREATE SCHEMA orgmaster_core AUTHORIZATION jenfu_orgmaster_migrator;',
    'CREATE SCHEMA orgmaster_contract AUTHORIZATION jenfu_orgmaster_migrator;',
    'CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_platform_migrator;',
    'CREATE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS SELECT ' +
      "'jenfu.application-role-catalog.v1'::text AS contract_version, 'ai-pdm'::text AS application_id, " +
      "'fixture-v3'::text AS catalog_version, now()::timestamptz AS published_at, repeat('0',64)::text AS catalog_sha256, " +
      "0::integer AS display_order, 'role-rd'::text AS stable_role_id, 'rd'::text AS role_code, " +
      "'RD fixture'::text AS display_name, true::boolean AS assignable, 'standard'::text AS risk, " +
      "'employee'::text AS subject_kind, true::boolean AS recommendation_allowed, true::boolean AS delegation_allowed, " +
      "'{\"workspace\":true}'::jsonb AS allowed_scope_kinds, 'standard'::text AS assignment_tier, " +
      "'[]'::jsonb AS permissions, '{}'::jsonb AS metadata, repeat('0',64)::text AS role_definition_hash;",
    'ALTER VIEW ai_pdm_contract.v_application_role_catalog_v1 OWNER TO jenfu_platform_migrator;',
    'GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_orgmaster_migrator;',
    'GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO jenfu_orgmaster_migrator;',
  ].join('\n')
  try {
    await handle.client.query('BEGIN')
    await handle.client.query(sql)
    await handle.client.query('COMMIT')
  } catch (error) {
    await handle.client.query('ROLLBACK').catch(() => undefined)
    throw fail('DEV014_FIXTURE_BOOTSTRAP_FAILED', error)
  }
}

async function seedPersistence(handle, capacityIdentities = []) {
  const client = handle.client
  const batchId = '47000000-0000-4000-8000-000000000001'
  const artifacts = persistenceFixture(capacityIdentities).artifacts
  try {
    await client.query('BEGIN')
    const prior = await client.query(
      'SELECT (SELECT count(*)::int FROM orgmaster_core.persistence_batches WHERE id=$1::uuid) AS batch_count, ' +
      '(SELECT count(*)::int FROM orgmaster_core.persistence_authority WHERE singleton=true AND active_batch_id IS NULL) AS empty_authority_count',
      [batchId],
    )
    if (prior.rowCount !== 1 || Number(prior.rows[0].batch_count) !== 0 || Number(prior.rows[0].empty_authority_count) !== 1) {
      throw fail('DEV014_FIXTURE_PERSISTENCE_SEED_TARGET_INVALID')
    }
    await client.query(
      "INSERT INTO orgmaster_core.persistence_batches (id, source_revision, contract_version, source_manifest, artifact_count, media_count, source_bytes, status, imported_at, verified_at, activated_at) " +
      "VALUES ($1, $2, 'jenfu.orgmaster-persistence.v1', '{}'::jsonb, $3, 0, 0, 'active', clock_timestamp(), clock_timestamp(), clock_timestamp())",
      [batchId, '4'.repeat(64), artifacts.length],
    )
    for (const [key, kind, payload] of artifacts) {
      const serialized = JSON.stringify(payload)
      const digest = sha256(Buffer.from(serialized, 'utf8'))
      await client.query(
        'INSERT INTO orgmaster_core.persistence_artifacts ' +
        '(batch_id, artifact_key, artifact_kind, payload, source_sha256, canonical_sha256, source_bytes, imported_at) ' +
        'VALUES ($1, $2, $3, $4::jsonb, $5, $5, 0, clock_timestamp())',
        [batchId, key, kind, serialized, digest],
      )
    }
    const activated = await client.query(
      "UPDATE orgmaster_core.persistence_authority SET active_batch_id=$1, authority_version=1, updated_at=clock_timestamp(), " +
      "updated_by='dev-047-qc', reason_code='isolated-fixture' WHERE singleton=true AND active_batch_id IS NULL",
      [batchId],
    )
    if (activated.rowCount !== 1) throw fail('DEV014_FIXTURE_PERSISTENCE_AUTHORITY_INVALID')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error?.code?.startsWith('DEV014_FIXTURE_')) throw error
    throw fail('DEV014_FIXTURE_PERSISTENCE_SEED_FAILED', error)
  }
}

async function seedCapacityPopulation(handle, capacityIdentities) {
  const client = handle.client
  const records = capacityIdentities.map((identity) => ({
    identity_record_id: identity.id,
    principal_id: identity.principal,
    employee_id: identity.employeeId,
    primary_email: identity.email,
    directory_customer_id: identity.directoryCustomerId,
    directory_user_id: identity.directoryUserId,
  }))
  try {
    await client.query('BEGIN')
    const managed = await client.query(
      "INSERT INTO orgmaster_core.managed_daily_identities " +
      "(identity_record_id,employee_id,principal_id,directory_customer_id,directory_user_id,last_verified_primary_email," +
      "auth_issuer,auth_subject,bound_at,link_state,revision,admission_revision,admission_changed_at,created_by,updated_by) " +
      "SELECT record.identity_record_id,record.employee_id,record.principal_id,record.directory_customer_id,record.directory_user_id," +
      "record.primary_email,$2,record.identity_record_id::text,clock_timestamp()-interval '20 minutes','active',1," +
      "nextval('orgmaster_core.managed_identity_mapping_version_seq'),clock_timestamp()-interval '20 minutes'," +
      "'dev014-synthetic-capacity-fixture','dev014-synthetic-capacity-fixture' " +
      "FROM jsonb_to_recordset($1::jsonb) AS record(identity_record_id uuid,principal_id text,employee_id text," +
      "primary_email text,directory_customer_id text,directory_user_id text)",
      [JSON.stringify(records), CAPACITY_MANAGED_ISSUER],
    )
    if (managed.rowCount !== SYNTHETIC_CAPACITY_POPULATION) throw fail('DEV014_FIXTURE_CAPACITY_MANAGED_IDENTITY_COUNT_INVALID')
    const observations = await client.query(
      "INSERT INTO orgmaster_core.managed_identity_observations " +
      "(identity_record_id,primary_email,directory_state,source_etag,last_applied_request_sequence,adapter_outcome," +
      "trusted_observed_at,last_attempt_at,freshness) " +
      "SELECT record.identity_record_id,record.primary_email,'present','synthetic-capacity-'||record.identity_record_id::text," +
      "0,'success',clock_timestamp()-interval '20 minutes',clock_timestamp()-interval '20 minutes','fresh' " +
      "FROM jsonb_to_recordset($1::jsonb) AS record(identity_record_id uuid,principal_id text,employee_id text," +
      "primary_email text,directory_customer_id text,directory_user_id text)",
      [JSON.stringify(records)],
    )
    if (observations.rowCount !== SYNTHETIC_CAPACITY_POPULATION) throw fail('DEV014_FIXTURE_CAPACITY_OBSERVATION_COUNT_INVALID')
    const reservations = await client.query(
      "INSERT INTO orgmaster_core.principal_identity_reservations " +
      "(principal_issuer,principal_subject,employee_id,first_seen_at,source_kind,source_revision) " +
      "SELECT $2,record.identity_record_id::text,record.employee_id,clock_timestamp()-interval '20 minutes'," +
      "'managed','managed:'||record.identity_record_id::text " +
      "FROM jsonb_to_recordset($1::jsonb) AS record(identity_record_id uuid,principal_id text,employee_id text," +
      "primary_email text,directory_customer_id text,directory_user_id text)",
      [JSON.stringify(records), CAPACITY_MANAGED_ISSUER],
    )
    if (reservations.rowCount !== SYNTHETIC_CAPACITY_POPULATION) throw fail('DEV014_FIXTURE_CAPACITY_RESERVATION_COUNT_INVALID')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error?.code?.startsWith('DEV014_FIXTURE_')) throw error
    throw fail('DEV014_FIXTURE_CAPACITY_SEED_FAILED', error)
  }
}

async function verifyLocalSessionUser(handle, login) {
  let client
  try {
    const Client = handle.client.constructor
    client = new Client({
      host: LOOPBACK, port: handle.port, database: handle.databaseName, user: login.user,
      application_name: 'orgmaster-dev014-fixture-session-user', ssl: false,
    })
    await client.connect()
    const result = await client.query(
      'SELECT current_database() AS database_name, session_user::text AS session_user, current_user::text AS current_user, ' +
      'host(inet_server_addr())::text AS server_address, inet_server_port() AS server_port, ' +
      "pg_has_role(session_user, $1, 'MEMBER') AS own_runtime_group, pg_has_role(session_user, $2, 'MEMBER') AS sibling_runtime_group",
      [login.group, login.other],
    )
    const row = result.rows?.[0]
    if (result.rowCount !== 1 || row?.database_name !== handle.databaseName ||
        row?.session_user !== login.user || row?.current_user !== login.user ||
        row?.server_address !== LOOPBACK || Number(row?.server_port) !== handle.port ||
        row?.own_runtime_group !== true || row?.sibling_runtime_group !== false) {
      throw fail('DEV014_FIXTURE_LOCAL_SESSION_USER_CHECK_FAILED')
    }
    return Object.freeze({
      sessionUser: row.session_user, currentUser: row.current_user,
      ownRuntimeGroup: login.group, siblingRuntimeGroup: login.other,
      ownRuntimeGroupMember: true, siblingRuntimeGroupMember: false,
      authentication: 'LOCAL_TRUST_SYNTHETIC_ONLY',
    })
  } catch (error) {
    if (error?.code === 'DEV014_FIXTURE_LOCAL_SESSION_USER_CHECK_FAILED') throw error
    throw fail('DEV014_FIXTURE_LOCAL_SESSION_USER_CONNECT_FAILED', error)
  } finally {
    if (client) await client.end().catch(() => undefined)
  }
}

/**
 * Initialize the fixed DEV-014 lifecycle integration fixture on a fresh,
 * manager-issued task-owned local PostgreSQL handle. Importing this module is
 * inert. This does not update or satisfy Production migration manifests.
 */
export async function initializeLifecycleFixture(handle, options) {
  const target = assertTaskOwnedHandle(handle)
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some((key) => !['platformRoot', 'orgmasterRoot', 'capacityPopulation'].includes(key))) {
    throw fail('DEV014_FIXTURE_OPTIONS_INVALID')
  }
  if (Object.hasOwn(options, 'capacityPopulation') && options.capacityPopulation !== SYNTHETIC_CAPACITY_POPULATION) {
    throw fail('DEV014_FIXTURE_CAPACITY_POPULATION_INVALID')
  }
  const capacityIdentities = options.capacityPopulation === SYNTHETIC_CAPACITY_POPULATION
    ? buildSyntheticCapacityPopulation()
    : Object.freeze([])
  const platformRoot = assertRepositoryRoot(options.platformRoot, 'Jenfu-Platform')
  const orgmasterRoot = assertRepositoryRoot(options.orgmasterRoot, 'OrgMaster')
  const sourceSet = readSourceSet(platformRoot, orgmasterRoot)
  const plan = migrationPlan(sourceSet.files)
  await assertPristineDatabase(handle)
  await bootstrap(handle)

  const appliedMigrations = []
  let persistenceSeeded = false
  for (const migration of plan) {
    if (migration.repo === 'orgmaster' && migration.path === 'db/migrations/012_dev047_managed_identity_bridge.sql') {
      await seedPersistence(handle, capacityIdentities)
      persistenceSeeded = true
    }
    try {
      await handle.client.query(migration.bytes.toString('utf8'))
    } catch (error) {
      await handle.client.query('ROLLBACK').catch(() => undefined)
      throw fail('DEV014_FIXTURE_MIGRATION_FAILED:' + migration.repo + ':' + migration.path, error)
    }
    appliedMigrations.push(migration.evidence)
  }
  if (!persistenceSeeded || appliedMigrations.length !== 42) throw fail('DEV014_FIXTURE_MIGRATION_PLAN_INCOMPLETE')
  if (capacityIdentities.length > 0) await seedCapacityPopulation(handle, capacityIdentities)

  const localSessionUserReadbacks = []
  for (const login of RUNTIME_LOGINS) localSessionUserReadbacks.push(await verifyLocalSessionUser(handle, login))
  return Object.freeze({
    schema: 'dev014-lifecycle-postgres-fixture.v1',
    status: 'INITIALIZED',
    evidenceScope: 'LOCAL_SYNTHETIC_ONLY',
    targetClass: 'task-owned-local',
    target: Object.freeze({
      host: LOOPBACK, port: handle.port, databaseName: handle.databaseName,
      serverVersion: handle.serverVersion, taskRoot: target.taskRoot,
      dataRootBytesAtStart: target.measuredBytes,
    }),
    productionReleaseAuthority: false,
    productionExecutionCount: 0,
    fullDev014Complete: false,
    liveCloudSqlIamAuthentication: 'NOT_TESTED',
    liveSessionUser: 'UNKNOWN_NOT_QUERIED',
    fixture: Object.freeze({
      syntheticOnly: true,
      principal: Object.freeze({
        principalId: 'principal-legacy', identityLinkId: 'identity-link-legacy',
        status: 'active', accountType: 'human_personal',
      }),
      employees: Object.freeze([
        Object.freeze({ employeeId: 'employee-one', status: 'active' }),
        Object.freeze({ employeeId: 'employee-two', status: 'active' }),
        Object.freeze({ employeeId: 'employee-three', status: 'active' }),
        Object.freeze({ employeeId: 'employee-four', status: 'active' }),
        Object.freeze({ employeeId: 'employee-legacy', status: 'active' }),
        Object.freeze({ employeeId: 'employee-inactive', status: 'inactive' }),
        ...capacityIdentities.map((identity) => Object.freeze({ employeeId: identity.employeeId, status: 'active' })),
      ]),
      ...(capacityIdentities.length > 0 ? { capacityPopulation: capacityIdentities.length } : {}),
      persistenceSeededBefore: 'orgmaster 012_dev047_managed_identity_bridge',
      runtimeIamAuthentication: 'LOCAL_TRUST_SYNTHETIC_ONLY',
    }),
    localSessionUserReadbacks: Object.freeze(localSessionUserReadbacks),
    ...(capacityIdentities.length > 0 ? { capacityIdentities } : {}),
    fixtureProvenance: Object.freeze(sourceSet.provenance),
    appliedMigrations: Object.freeze(appliedMigrations),
  })
}
