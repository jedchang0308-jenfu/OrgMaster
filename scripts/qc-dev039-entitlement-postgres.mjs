#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(projectRoot, 'db', 'migrations', '009_dev039_application_entitlement_v2.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')

function runStaticGate() {
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/u)
  assert.equal(/\bDROP\s+(TABLE|VIEW)\b/iu.test(migration), false)
  assert.match(migration, /WITH \(security_barrier = true\)/u)
  assert.match(migration, /REVOKE ALL ON[\s\S]*FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;/u)
  assert.match(migration, /GRANT SELECT ON[\s\S]*v_application_entitlement_authority_v2,[\s\S]*v_effective_role_assignments_v2[\s\S]*TO jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime;/u)
  assert.match(migration, /authority_mode text NOT NULL DEFAULT 'local_legacy'/u)
  assert.match(migration, /CHECK \(application_id = 'financial-management-system'\)/u)
}

function connectionConfig(raw) {
  assert.ok(raw, 'DEV039_POSTGRES_URL is required when DEV039_RUN_POSTGRES=1')
  const url = new URL(raw)
  assert.ok(url.protocol === 'postgres:' || url.protocol === 'postgresql:', 'DEV039 PostgreSQL URL must use postgres://')
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'DEV039 live gate only accepts a loopback PostgreSQL URL')
  return { connectionString: url.toString(), ssl: false, connectionTimeoutMillis: 5000 }
}

async function runLiveGate() {
  const client = new Client(connectionConfig(process.env.DEV039_POSTGRES_URL))
  const catalogVersion = 'financial-management-system.role-catalog.2026-09-03.v1'
  const catalogSha = 'a'.repeat(64)
  const checks = []
  try {
    await client.connect()
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jenfu_platform_migrator') THEN CREATE ROLE jenfu_platform_migrator; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jenfu_platform_runtime') THEN CREATE ROLE jenfu_platform_runtime; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jenfu_orgmaster_runtime') THEN CREATE ROLE jenfu_orgmaster_runtime; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jenfu_ai_pdm_runtime') THEN CREATE ROLE jenfu_ai_pdm_runtime; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS access_governance AUTHORIZATION jenfu_platform_migrator;
      CREATE TABLE IF NOT EXISTS access_governance.dev039_ai_pdm_v1_sentinel (id text PRIMARY KEY);
      INSERT INTO access_governance.dev039_ai_pdm_v1_sentinel (id) VALUES ('preserved') ON CONFLICT DO NOTHING;
    `)
    await client.query(migration)
    checks.push('migration_applied')

    await client.query(`
      INSERT INTO access_governance.application_role_catalog_versions_v2
        (application_id, catalog_version, catalog_sha256, payload_sha256, status, snapshot)
      VALUES ($1, $2, $3, $3, 'active', '{"fixture":"dev039"}'::jsonb)
    `, ['financial-management-system', catalogVersion, catalogSha])
    await client.query(`
      INSERT INTO access_governance.application_role_assignments_v2
        (assignment_id, application_id, employee_id, stable_role_id, role_code_snapshot, role_name_snapshot,
         catalog_version, catalog_sha256, scope_kind, scope_value, status, valid_from, valid_until,
         governance_revision, organization_revision, created_by_principal_id, created_reason)
      VALUES
        ('dev039-active', 'financial-management-system', 'emp-001', 'role-finance-staff', 'finance-staff', '財務人員',
         $1, $2, 'workspace', 'company-jenfu', 'active', CURRENT_TIMESTAMP - INTERVAL '1 minute', NULL,
         'g-1', 'o-1', 'dev039-fixture', 'isolated gate fixture'),
        ('dev039-expired', 'financial-management-system', 'emp-002', 'role-finance-staff', 'finance-staff',
         '財務人員', $1, $2, 'workspace', 'company-jenfu', 'active', CURRENT_TIMESTAMP - INTERVAL '2 days',
         CURRENT_TIMESTAMP - INTERVAL '1 day', 'g-1', 'o-1', 'dev039-fixture', 'expired fixture')
    `, [catalogVersion, catalogSha])
    checks.push('default_off_projection_seeded')

    const authority = await client.query(`SELECT application_id, employee_id, authority_mode FROM access_governance.v_application_entitlement_authority_v2 WHERE employee_id = 'emp-001'`)
    assert.deepEqual(authority.rows, [{ application_id: 'financial-management-system', employee_id: 'emp-001', authority_mode: 'local_legacy' }])
    const effective = await client.query(`SELECT assignment_id, employee_id, stable_role_id, authority_mode FROM access_governance.v_effective_role_assignments_v2 ORDER BY assignment_id`)
    assert.deepEqual(effective.rows, [{ assignment_id: 'dev039-active', employee_id: 'emp-001', stable_role_id: 'role-finance-staff', authority_mode: 'local_legacy' }])
    checks.push('exact_binding_and_time_filter')

    const defaults = await client.query(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'access_governance' AND table_name = 'application_role_assignments_v2' AND column_name = 'authority_mode'
    `)
    assert.equal(defaults.rows[0]?.column_default, "'local_legacy'::text")
    const sentinel = await client.query(`SELECT id FROM access_governance.dev039_ai_pdm_v1_sentinel`)
    assert.deepEqual(sentinel.rows, [{ id: 'preserved' }])
    checks.push('ai_pdm_sentinel_preserved')

    await client.query('BEGIN')
    await client.query('SAVEPOINT dev039_duplicate_catalog')
    await assert.rejects(
      client.query(`INSERT INTO access_governance.application_role_catalog_versions_v2 (application_id, catalog_version, catalog_sha256, payload_sha256, status, snapshot) VALUES ('financial-management-system', 'financial-management-system.role-catalog.2026-09-04.v1', $1, $1, 'active', '{}'::jsonb)`, [catalogSha]),
      (error) => error?.code === '23505',
    )
    await client.query('ROLLBACK TO SAVEPOINT dev039_duplicate_catalog')
    await client.query('COMMIT')
    checks.push('one_active_catalog_enforced')

    await client.query('SET ROLE jenfu_platform_runtime')
    const runtimeAcl = await client.query(`
      SELECT
        has_table_privilege(current_user, 'access_governance.application_role_assignments_v2', 'SELECT') AS table_select,
        has_table_privilege(current_user, 'access_governance.v_effective_role_assignments_v2', 'SELECT') AS view_select
    `)
    assert.deepEqual(runtimeAcl.rows, [{ table_select: false, view_select: true }])
    await client.query('RESET ROLE')
    checks.push('runtime_acl_boundary')
  } finally {
    await client.end().catch(() => undefined)
  }
  return { checks, databaseRuntime: 'isolated-postgresql-live' }
}

runStaticGate()
if (process.env.DEV039_RUN_POSTGRES === '1') {
  const result = await runLiveGate()
  console.log(JSON.stringify({ status: 'PASS', mode: 'live-isolated-postgresql-gate', migration: path.relative(projectRoot, migrationPath).replaceAll('\\', '/'), ...result }))
} else {
  console.log(JSON.stringify({
    status: 'PASS',
    mode: 'static-migration-gate',
    migration: path.relative(projectRoot, migrationPath).replaceAll('\\', '/'),
    databaseRuntime: 'NOT_CONFIGURED',
    note: 'Static SQL safety gate passed; set DEV039_RUN_POSTGRES=1 with a loopback DEV039_POSTGRES_URL for the isolated live gate.',
  }))
}
