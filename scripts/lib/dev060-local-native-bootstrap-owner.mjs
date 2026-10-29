import { createHash } from 'node:crypto'

// Owner-scoped local bootstrap. Called only by the admitted disposable-cluster
// coordinator; no runtime/HTTP route imports this module.
const OWNER = 'orgmaster'
const MIGRATOR = 'jenfu_orgmaster_migrator'
const HASH = /^[a-f0-9]{64}$/u
const LOCAL_ISSUER = 'urn:jenfu:local-principal-sandbox'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => Object.assign(new Error('LOCAL_NATIVE_ORGMASTER_' + code), { code: 'LOCAL_NATIVE_ORGMASTER_' + code })
const LEDGER_COLUMNS = Object.freeze([
  ['version', 'text', null],
  ['name', 'text', null],
  ['checksum_sha256', 'character', 64],
  ['source_revision', 'text', null],
  ['applied_at', 'timestamp with time zone', null],
])
const RECEIPT_COLUMNS = Object.freeze([
  ['source_path', 'text', null],
  ['source_sha256', 'character', 64],
  ['applied_sha256', 'character', 64],
  ['source_revision', 'text', null],
  ['applied_at', 'timestamp with time zone', null],
])
async function assertTableColumns(client, table, expected, errorCode) {
  const result = await client.query(`SELECT column_name,data_type,is_nullable,character_maximum_length
    FROM information_schema.columns
    WHERE table_schema='orgmaster_core' AND table_name=$1
    ORDER BY ordinal_position`, [table])
  const rows = result.rows ?? []
  const valid = rows.length === expected.length && expected.every(([name, type, length], index) => {
    const row = rows[index]
    return row?.column_name === name && row?.data_type === type && row?.is_nullable === 'NO' &&
      (length === null ? row?.character_maximum_length === null : Number(row?.character_maximum_length) === length)
  })
  if (!valid) throw fail(errorCode)
}
function migrationPath(entry) { return typeof entry?.path === 'string' ? entry.path : undefined }
function isSafeLocalSourcePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    value.startsWith('db/migrations/local/') && value.endsWith('.sql') &&
    !value.includes('\\') && !value.split('/').some(part => part === '' || part === '.' || part === '..')
}
function migrationSourceError(entry) {
  const error = fail('SOURCE_INVALID')
  if (migrationPath(entry)) error.sourcePath = migrationPath(entry)
  return error
}
function sanitizedMigrationError(error, entry) {
  const knownCode = typeof error?.code === 'string' && error.code.startsWith('LOCAL_NATIVE_ORGMASTER_')
    ? error.code.slice('LOCAL_NATIVE_ORGMASTER_'.length)
    : 'MIGRATION_FAILED'
  const wrapped = fail(knownCode)
  wrapped.owner = OWNER
  if (migrationPath(entry)) wrapped.sourcePath = migrationPath(entry)
  if (typeof error?.code === 'string' && /^[0-9A-Z_]{1,64}$/u.test(error.code) &&
      !error.code.startsWith('LOCAL_NATIVE_ORGMASTER_')) wrapped.databaseCode = error.code
  return wrapped
}
async function guardTarget(client) {
  const result = await client.query("SELECT current_database() AS database_name, host(inet_server_addr()) AS address")
  const row = result.rows?.[0]
  if (result.rows?.length !== 1 || !/^jenfu_local_[a-z0-9_]{3,51}$/.test(row.database_name) || !['127.0.0.1','::1'].includes(row.address)) throw fail('TARGET_INVALID')
}
async function transact(client, work) {
  await guardTarget(client)
  await client.query('BEGIN')
  try { await client.query('SET LOCAL ROLE ' + MIGRATOR); const result = await work(); await client.query('COMMIT'); return result }
  catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error }
}
export async function insertLedger(client, entry, sourceRevision) {
  if (entry.owner !== OWNER || typeof entry.version !== 'string' || !entry.version ||
      typeof entry.name !== 'string' || !entry.name || !HASH.test(entry.appliedSha256) ||
      !/^[a-f0-9]{40}$/u.test(sourceRevision)) throw migrationSourceError(entry)
  await client.query('INSERT INTO orgmaster_core.schema_migrations(version,name,checksum_sha256,source_revision) VALUES($1,$2,$3,$4)', [entry.version,entry.name,entry.appliedSha256,sourceRevision])
}
export async function executeMigration(client, entry, sourceRevision, options = {}) {
  if (!entry || entry.owner !== OWNER || typeof entry.version !== 'string' || !entry.version ||
      typeof entry.name !== 'string' || !entry.name || typeof entry.sql !== 'string' ||
      sha256(Buffer.from(entry.sql,'utf8')) !== entry.appliedSha256 || !/^[a-f0-9]{40}$/u.test(sourceRevision)) {
    throw migrationSourceError(entry)
  }
  if (entry.localOnly === true && (!isSafeLocalSourcePath(entry.path) || !HASH.test(entry.sourceSha256) ||
      (options.ledgerEntries?.length ?? 0) !== 0)) throw migrationSourceError(entry)
  await guardTarget(client)
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE ' + MIGRATOR)
    if (entry.localOnly === true) {
      await ensureLocalReceiptTable(client)
      const existing = await client.query(`SELECT source_path, btrim(source_sha256) AS source_sha256,
          btrim(applied_sha256) AS applied_sha256, source_revision
        FROM orgmaster_core.local_native_bootstrap_receipts WHERE source_path=$1`, [entry.path])
      if ((existing.rows ?? []).length > 1) throw fail('LOCAL_RECEIPT_INVALID')
      if (existing.rows?.length === 1) {
        const row = existing.rows[0]
        if (row.source_path !== entry.path || row.source_sha256 !== entry.sourceSha256 ||
            row.applied_sha256 !== entry.appliedSha256 || row.source_revision !== sourceRevision) {
          throw fail('LOCAL_RECEIPT_CONFLICT')
        }
        await client.query('COMMIT')
        return { reused: true }
      }
    } else {
      await assertTableColumns(client, 'schema_migrations', LEDGER_COLUMNS, 'LEDGER_SHAPE_INVALID')
      const existing = await client.query(`SELECT version,name,btrim(checksum_sha256) AS applied_sha256,source_revision
        FROM orgmaster_core.schema_migrations WHERE version=$1`, [entry.version])
      if ((existing.rows ?? []).length > 1) throw fail('LEDGER_ROW_INVALID')
      if (existing.rows?.length === 1) {
        const row = existing.rows[0]
        if (row.version !== entry.version || row.name !== entry.name ||
            row.applied_sha256 !== entry.appliedSha256 || row.source_revision !== sourceRevision) {
          throw fail('MIGRATION_LEDGER_CONFLICT')
        }
        await client.query('COMMIT')
        return { reused: true }
      }
    }
    if (options.before) await options.before(client)
    await client.query(entry.sql)
    if (entry.localOnly === true) {
      await client.query(`INSERT INTO orgmaster_core.local_native_bootstrap_receipts
        (source_path,source_sha256,applied_sha256,source_revision) VALUES($1,$2,$3,$4)`,
      [entry.path,entry.sourceSha256,entry.appliedSha256,sourceRevision])
    } else {
      const seenVersions = new Map()
      for (const ledger of [entry, ...(options.ledgerEntries ?? [])]) {
        const previous = seenVersions.get(ledger.version)
        if (previous) {
          if (previous.name !== ledger.name || previous.appliedSha256 !== ledger.appliedSha256) throw fail('LEDGER_ENTRY_CONFLICT')
          continue
        }
        seenVersions.set(ledger.version, ledger)
        await insertLedger(client, ledger, sourceRevision)
      }
    }
    await client.query('COMMIT')
    return { reused: false }
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{})
    throw sanitizedMigrationError(error, entry)
  }
}
export async function createLedger(client, sourceRevision, audit) {
  await transact(client, async () => {
    await client.query("CREATE TABLE IF NOT EXISTS orgmaster_core.schema_migrations (version text PRIMARY KEY,name text NOT NULL,checksum_sha256 char(64) NOT NULL,source_revision text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),CONSTRAINT n1c_orgmaster_checksum_valid CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'))")
    await assertTableColumns(client, 'schema_migrations', LEDGER_COLUMNS, 'LEDGER_SHAPE_INVALID')
  })
  audit.bootstrapObjects.push({owner:MIGRATOR,object:'orgmaster_core.schema_migrations',sourceRevision})
}
export async function createLegacyStage(client) {
  await guardTarget(client)
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE ' + MIGRATOR)
    // The immutable N1C package strips CREATE SCHEMA for all three legacy
    // owner namespaces; migration 010 later relocates their real objects.
    for (const schema of ['orgmaster','organization','access_governance']) {
      await client.query('CREATE SCHEMA IF NOT EXISTS ' + schema + ' AUTHORIZATION jenfu_orgmaster_migrator')
      const owner = await client.query('SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1', [schema])
      if (owner.rows?.length !== 1 || owner.rows[0].owner !== MIGRATOR) throw fail('LEGACY_SCHEMA_OWNER_MISMATCH')
      await client.query('REVOKE ALL ON SCHEMA ' + schema + ' FROM PUBLIC')
    }
    await client.query('COMMIT')
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error }
}

export async function verifyOrgmasterSeed(client, sandboxId) {
  let result
  try {
    result = await client.query(`WITH active AS (
      SELECT authority.active_batch_id, batch.source_revision, governance.payload,
        governance.payload->>'activePolicyVersionId' AS active_policy_version_id
      FROM orgmaster_core.persistence_authority authority
      JOIN orgmaster_core.persistence_batches batch ON batch.id=authority.active_batch_id AND batch.status='active'
      JOIN orgmaster_core.persistence_artifacts governance ON governance.batch_id=batch.id
        AND governance.artifact_key='orgmaster-governance.v3.json' AND governance.artifact_kind='governance'
      WHERE authority.singleton=true
    ), all_links AS (
      SELECT identity.value AS link
      FROM active
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(active.payload->'publishedVersions')='array'
        THEN active.payload->'publishedVersions' ELSE '[]'::jsonb END) version(value)
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(version.value#>'{policy,identityLinks}')='array'
        THEN version.value#>'{policy,identityLinks}' ELSE '[]'::jsonb END) identity(value)
    )
    SELECT active.active_batch_id::text, active.source_revision,
      jsonb_array_length(active.payload->'publishedVersions')::int AS version_count,
      (SELECT count(*)::int FROM all_links) AS identity_link_count,
      (SELECT count(*)::int FROM all_links WHERE link->>'issuer' IS DISTINCT FROM $1
        OR COALESCE(link->>'subject','') !~ '^local-[a-z0-9-]+$'
        OR COALESCE(link->>'principalId','') !~ '^local-[a-z0-9-]+$'
        OR COALESCE(link->>'employeeId','') !~ '^employee-local-[a-z0-9-]+$') AS invalid_identity_link_count,
      active.active_policy_version_id,
      (SELECT count(*)::int FROM jsonb_array_elements(active.payload->'publishedVersions') version(value)
        WHERE version.value->>'id'=active.active_policy_version_id
          AND version.value->>'kind'='assignment-governance-v3') AS active_policy_match_count
    FROM active`, [LOCAL_ISSUER])
  } catch { throw fail('ORGMASTER_SEED_READBACK_FAILED') }
  const row = result.rows?.[0]
  if (result.rows?.length !== 1 || !row.active_batch_id || !/^[a-f0-9-]{36}$/iu.test(row.active_batch_id) ||
    !HASH.test(String(row.source_revision ?? '')) || Number(row.version_count) < 1 ||
    Number(row.identity_link_count) < 1 || Number(row.invalid_identity_link_count) !== 0 ||
    Number(row.active_policy_match_count) !== 1 || !row.active_policy_version_id || Number(row.version_count) < 1) {
    throw fail('ORGMASTER_SEED_READBACK_INVALID')
  }
  return Object.freeze({ batchId: row.active_batch_id, sourceRevision: row.source_revision,
    activePolicyVersionId: row.active_policy_version_id, identityLinkCount: Number(row.identity_link_count), sandboxId })
}

export async function verifyLocalObjects(client) {
  await guardTarget(client)
  const objects=await client.query("SELECT to_regclass('orgmaster_core.local_sandbox_session_bindings') IS NOT NULL AS binding,to_regclass('orgmaster_contract.v_local_principal_publications_v1') IS NOT NULL AS publication,to_regclass('orgmaster_core.local_principal_lifecycle_events') IS NOT NULL AS lifecycle_events,to_regclass('orgmaster_contract.v_local_principal_lifecycle_events_v1') IS NOT NULL AS lifecycle_contract,to_regclass('orgmaster_core.local_principal_lifecycle_session_bindings') IS NOT NULL AS lifecycle_session_bindings")
  const disabled=await client.query("SELECT count(*)::int AS value FROM orgmaster_core.workload_principal_bindings WHERE principal_id IN ('principal-workload:orgmaster-managed-identity-lifecycle','principal-workload:platform-principal-lifecycle-invalidation') AND enabled=false")
  if(objects.rows?.length!==1 || objects.rows[0].binding!==true || objects.rows[0].publication!==true ||
    objects.rows[0].lifecycle_events!==true || objects.rows[0].lifecycle_contract!==true ||
    objects.rows[0].lifecycle_session_bindings!==true || disabled.rows?.[0]?.value!==2)throw fail('LOCAL_OBJECTS_MISSING')
  return {objects:['orgmaster_core.local_sandbox_session_bindings','orgmaster_contract.v_local_principal_publications_v1',
    'orgmaster_core.local_principal_lifecycle_events','orgmaster_contract.v_local_principal_lifecycle_events_v1',
    'orgmaster_core.local_principal_lifecycle_session_bindings'],workloadBindingsDisabled:2}
}

async function ensureLocalReceiptTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS orgmaster_core.local_native_bootstrap_receipts (
    source_path text PRIMARY KEY,
    source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    applied_sha256 char(64) NOT NULL CHECK (applied_sha256 ~ '^[a-f0-9]{64}$'),
    source_revision text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`)
  await client.query('REVOKE ALL ON TABLE orgmaster_core.local_native_bootstrap_receipts FROM PUBLIC')
  await assertTableColumns(client, 'local_native_bootstrap_receipts', RECEIPT_COLUMNS, 'LOCAL_RECEIPT_SHAPE_INVALID')
  const result = await client.query(`SELECT pg_get_userbyid(c.relowner) AS owner,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
        WHERE acl.grantee <> c.relowner) AS has_non_owner_grant
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='orgmaster_core' AND c.relname='local_native_bootstrap_receipts' AND c.relkind='r'`)
  const row = result.rows?.[0]
  if (result.rows?.length !== 1 || row.owner !== MIGRATOR || row.has_non_owner_grant !== false) {
    throw fail('LOCAL_RECEIPT_OWNER_OR_ACL_INVALID')
  }
}

export async function verifyNoSessions(client) {
  let inTransaction = false
  try {
    await guardTarget(client)
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    inTransaction = true
    const catalog = await client.query(`SELECT n.nspname AS schema_name,c.relname,c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname='orgmaster' AND c.relname='app_sessions')
         OR (n.nspname='orgmaster_core' AND c.relname IN ('app_sessions','schema_migrations'))
      ORDER BY n.nspname,c.relname`)
    const knownRelations = new Map([
      ['orgmaster.app_sessions', { schema: 'orgmaster', name: 'app_sessions', sql: 'SELECT count(*)::int AS row_count FROM orgmaster.app_sessions', kind: 'session' }],
      ['orgmaster_core.app_sessions', { schema: 'orgmaster_core', name: 'app_sessions', sql: 'SELECT count(*)::int AS row_count FROM orgmaster_core.app_sessions', kind: 'session' }],
      ['orgmaster_core.schema_migrations', { schema: 'orgmaster_core', name: 'schema_migrations', sql: 'SELECT count(*)::int AS row_count FROM orgmaster_core.schema_migrations', kind: 'ledger' }],
    ])
    const found = new Map()
    let hasLegacyCompatibilityView = false
    for (const relation of catalog.rows ?? []) {
      const key = `${relation.schema_name}.${relation.relname}`
      const specification = knownRelations.get(key)
      if (!specification || found.has(key)) throw fail('SESSION_FOUNDATION_DRIFT')
      // Immutable 010 retains the old name as a compatibility view. The real
      // core table below remains mandatory and its full row count is checked.
      if (key === 'orgmaster.app_sessions' && relation.relkind === 'v') {
        hasLegacyCompatibilityView = true
        continue
      }
      if (!['r', 'p'].includes(relation.relkind)) throw fail('SESSION_FOUNDATION_DRIFT')
      found.set(key, specification)
    }
    if (hasLegacyCompatibilityView && !found.has('orgmaster_core.app_sessions')) throw fail('SESSION_FOUNDATION_DRIFT')

    const sessionTables = [...found.values()].filter(relation => relation.kind === 'session')
    if (sessionTables.length === 0) {
      const ledger = found.get('orgmaster_core.schema_migrations')
      if (ledger) {
        const ledgerCount = await readRelationCount(client, ledger)
        if (ledgerCount !== 0) throw fail('SESSION_FOUNDATION_DRIFT')
      }
      await client.query('COMMIT')
      inTransaction = false
      return { sessions: 0, phase: 'before-native-session-foundation' }
    }

    for (const table of sessionTables) {
      if (await readRelationCount(client, table) !== 0) throw fail('SESSIONS_PRESENT')
    }
    await client.query('COMMIT')
    inTransaction = false
    return { sessions: 0 }
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {})
    if (typeof error?.code === 'string' && error.code.startsWith('LOCAL_NATIVE_ORGMASTER_')) throw error
    const wrapped = fail('SESSION_READBACK_FAILED')
    if (typeof error?.code === 'string' && /^[0-9A-Z_]{1,64}$/u.test(error.code)) wrapped.databaseCode = error.code
    throw wrapped
  }
}

async function readRelationCount(client, relation) {
  const result = await client.query(relation.sql)
  const row = result.rows?.[0]
  if (result.rows?.length !== 1 || !Number.isInteger(row?.row_count) || row.row_count < 0) {
    throw fail(relation.kind === 'ledger' ? 'LEDGER_READBACK_INVALID' : 'SESSION_READBACK_INVALID')
  }
  return row.row_count
}
