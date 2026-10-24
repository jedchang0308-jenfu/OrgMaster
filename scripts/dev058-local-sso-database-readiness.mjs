import assert from 'node:assert/strict'
import { withDev058Dev123Database } from './dev058-dev123-native-bootstrap.mjs'

// Schema and runtime ACL readiness only. This does not issue a session or prove
// Google login, Directory verification, a normal UI journey, or production.
try {
  await withDev058Dev123Database(async ({ admin, platformRuntimeReadback, platformMigrationEvidence }) => {
    assert.ok(platformMigrationEvidence, 'ACTUAL_PLATFORM_ROOT_REQUIRED')
    const row = (await admin.query(`SELECT
      (SELECT count(*)::int FROM platform_core.schema_migrations) AS platform_migrations,
      (SELECT count(*)::int FROM platform_core.portal_app_sessions) AS portal_sessions,
      to_regclass('platform_contract.task_owned_principal_auth_state') IS NULL AS no_synthetic_auth_state,
      to_regclass('platform_contract.task_owned_manifest_fixture') IS NULL AS no_synthetic_manifest,
      to_regprocedure('platform_contract.read_principal_auth_state_v3(text)') IS NOT NULL AS actual_v3_auth_state,
      to_regclass('orgmaster_contract.v_ai_pdm_principal_effective_grants_v4') IS NOT NULL AS actual_v4_grants,
      to_regclass('ai_pdm_contract.v_role_policy_publications_v1') IS NOT NULL AS actual_role_policy_history,
      (SELECT count(*)::int FROM ai_pdm_contract.v_application_role_catalog_v1) AS initial_catalog_rows
    `)).rows[0]
    assert.deepEqual(row, { platform_migrations: 11, portal_sessions: 0, no_synthetic_auth_state: true,
      no_synthetic_manifest: true, actual_v3_auth_state: true, actual_v4_grants: true,
      actual_role_policy_history: true, initial_catalog_rows: 9 })
    console.log(JSON.stringify({ threeAppDatabaseReadiness: 'PASS', ...row, platformRuntimeReadback,
      platformSource: platformMigrationEvidence.sourceRevision,
      deferredUnusedBodies: platformMigrationEvidence.deferredUnusedBodies,
      evidenceScope: 'task-owned PostgreSQL; no normal login or authority-switch proof' }))
  })
} catch (error) {
  console.log(JSON.stringify({ threeAppDatabaseReadiness: 'FAIL', code: error.code,
    message: error.message, migration: error.migrationLabel }))
  process.exitCode = 1
}
