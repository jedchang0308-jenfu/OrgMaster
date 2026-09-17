#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = join(root, 'db', 'migrations', '012_dev047_managed_identity_bridge.sql')
const migrationBytes = await readFile(migrationPath)
const migration = migrationBytes.toString('utf8').replaceAll('\r\n', '\n')
const source = async (relative) => readFile(join(root, relative), 'utf8')
const checks = []
async function check(name, fn) { try { await fn(); checks.push({ name, status: 'PASS' }) } catch (error) { checks.push({ name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }) } }
function includesAll(text, values) { for (const value of values) assert.match(text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), `missing ${value}`) }

await check('migration header and forward-only boundary', () => {
  assert.match(migration, /^-- DB-CHANGE\n-- owner: orgmaster\n-- schemas: orgmaster_core, orgmaster_contract\n-- contract-impact: orgmaster\.identity-visibility \/ organization\.active-principal\.v1 managed-row expansion and current-employee enforcement\n-- compatibility: additive\n-- governance-review: DEV-047/mu)
  assert.match(migration, /BEGIN;[\s\S]*SET LOCAL ROLE jenfu_orgmaster_migrator[\s\S]*COMMIT;/u)
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|SCHEMA)\b/iu)
  assert.doesNotMatch(migration, /\bGRANT\s+ALL\b/iu)
  assert.doesNotMatch(migration, /FROM\s+organization\.v_active_principal_mappings_v1/iu)
})
await check('required managed tables, sequences and routines', () => includesAll(migration, [
  'employee_number_assignments', 'employee_number_tombstones', 'employee_number_legacy_exemptions', 'managed_identity_directory_read_budget', 'managed_identity_admission_authority', 'managed_identity_invalidation_applications', 'managed_daily_identities', 'managed_identity_observations', 'managed_identity_candidate_leases', 'managed_identity_command_receipts', 'managed_identity_refresh_outbox', 'managed_identity_lifecycle_outbox', 'principal_identity_reservations', 'managed_identity_audit_events', 'managed_identity_mapping_version_seq', 'managed_identity_refresh_request_seq', 'v_current_workspace_employees_v1', 'read_employee_managed_identity_v1', 'resolve_managed_identity_auth_v1', 'assign_employee_number_v1', 'lease_managed_identity_candidate_v1', 'confirm_managed_identity_link_v1', 'bind_managed_identity_auth_v1', 'reserve_managed_directory_read_v1', 'enqueue_managed_identity_refresh_v1', 'claim_managed_identity_refresh_v1', 'complete_managed_identity_refresh_v1', 'retry_managed_identity_refresh_v1', 'prune_managed_identity_ephemera_v1', 'enqueue_managed_identity_lifecycle_invalidations_v1', 'claim_managed_identity_lifecycle_invalidations_v1', 'complete_managed_identity_lifecycle_invalidation_v1', 'retry_managed_identity_lifecycle_invalidation_v1', 'write_active_persistence_artifacts_with_identity_fence_v1', 'set_managed_identity_admission_v1',
]))
await check('zero provider-write and fixed Directory scope', async () => {
  const [port, api, auth] = await Promise.all([source('server/orgmasterManagedDirectoryPort.ts'), source('src/managedIdentity/apiClient.ts'), source('server/orgmasterManagedIdentityAuthBridge.ts')])
  assert.match(port, /admin\.directory\.user\.readonly/u); assert.doesNotMatch(port, /users\.insert|users\.update|users\.delete|method:\s*['"](?:POST|PUT|PATCH|DELETE)/iu)
  assert.match(api, /credentials:\s*['"]same-origin['"]/u); assert.match(auth, /google\.com/u)
})
await check('Node and DB authorities default off', async () => {
  const [authApi, server] = await Promise.all([source('server/orgmasterAuthApi.ts'), source('server/orgmasterServer.ts')])
  assert.match(authApi, /ORGMASTER_MANAGED_IDENTITY_ENABLED\s*===\s*['"]true['"]/u); assert.match(server, /managedIdentityEnabled\s*\?\?\s*\(devIdentityEnabled\s*\|\|\s*runtime\.managedLoginEnabled\s*===\s*true\)/u); assert.match(migration, /admission_enabled boolean NOT NULL DEFAULT false/u)
})
await check('Employee entry follows server capability; feature-off state never calls the local-only identity flow', async () => {
  const [panel, managed, gate, app, regression] = await Promise.all([source('src/components/DirectoryDetailPanel.tsx'), source('src/components/EmployeeManagedIdentitySection.tsx'), source('src/auth/AuthGate.tsx'), source('src/App.tsx'), source('src/components/DirectoryDetailPanel.test.tsx')])
  assert.match(panel, /managedIdentityEnabled\s*\?\s*<EmployeeManagedIdentitySection/u)
  assert.doesNotMatch(panel, /EmployeeIdentitySection/u)
  assert.match(panel, /員工編號管理尚未啟用。/u)
  assert.doesNotMatch(managed, /EmployeeAccountSetupDialog|invite_new|resendInvitation/u)
  assert.match(gate, /state\.mode\?\.managedLoginEnabled/u)
  assert.match(app, /if \(managedIdentityEnabled && status === 'active'/u)
  includesAll(regression, ['員工編號管理尚未啟用。', 'auth.managedIdentityEnabled = true'])
})
await check('frozen canonical principal manifest', async () => {
  const fixture = JSON.parse(await readFile(join(root, 'qa', 'dev-047', 'contracts', 'active-principal.managed.json'), 'utf8'))
  assert.equal(fixture.contractVersion, 'jenfu.platform-auth.v1'); assert.equal(fixture.directoryContractVersion, 'organization.active-principal.v1'); assert.match(fixture.identityIssuer, /^https:\/\/securetoken\.google\.com\//u); assert.ok(Number.isSafeInteger(fixture.mappingVersion) && fixture.mappingVersion >= 1)
})
const [authApi, localStore, postgresRunner] = await Promise.all([
  source('server/orgmasterAuthApi.ts'),
  source('server/orgmasterManagedIdentityStore.ts'),
  source('scripts/qc-dev-047-postgres.mjs'),
])
const correctionEvidence = {
  A17: () => {
    includesAll(authApi, ['managedLoginEnabled', 'resolveFirebaseIdentity', 'resolveActivePrincipal', 'epochs.read'])
    includesAll(migration, ['confirm_managed_identity_link_v1', 'bind_managed_identity_auth_v1', 'v_active_principal_mappings_v1'])
    includesAll(postgresRunner, ["check('A17'", 'issuer-managed', 'subject-one'])
  },
  A18: () => {
    includesAll(migration, ['managed_identity_admission_authority', 'admission_enabled', 'enqueue_managed_identity_lifecycle_invalidations_v1', 'legacy_candidates'])
    includesAll(postgresRunner, ["check('A18'", 'QC_OUTBOX_FAILURE', 'rollbackPreservedAdmission'])
  },
  A19: () => {
    includesAll(migration, ['principal_identity_reservations', "source_kind IN ('legacy','managed')", 'MANAGED_IDENTITY_IDENTITY_CONFLICT'])
    includesAll(localStore, ['principalIdentityReservations', 'sourceKind: \'managed\''])
    includesAll(postgresRunner, ["check('A19'", 'issuer-historical'])
  },
  A20: () => {
    includesAll(migration, ['employee_number text NOT NULL UNIQUE', 'FOR UPDATE', 'EMPLOYEE_NUMBER_CONFLICT'])
    includesAll(postgresRunner, ["check('A20'", 'Promise.allSettled', 'successfulWriters'])
  },
  A21: () => {
    includesAll(migration, ['managed_identity_directory_read_budget', 'lease_version', 'rerun_requested', 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'])
    includesAll(localStore, ['leaseVersion', 'rerunRequested', 'MANAGED_IDENTITY_REFRESH_LEASE_CONFLICT'])
    includesAll(postgresRunner, ["check('A21'", 'worker-old', 'successorSequence'])
  },
  A22: () => {
    includesAll(localStore, ['orgmaster-managed-identity-txn.v1.json', "journal.status !== 'prepare'", 'writeVerifiedAtomicFile(paths.current', "status: 'committed'"])
    includesAll(migration, ['v_current_workspace_employees_v1', 'REVOKE ALL ON ALL TABLES IN SCHEMA orgmaster_core', 'GRANT EXECUTE ON FUNCTION'])
    includesAll(postgresRunner, ["check('A22'", 'employee-old-snapshot', "code: '42501'"])
  },
}
for (const [caseId, verify] of Object.entries(correctionEvidence)) await check(`${caseId} correction-review source evidence`, verify)

const failed = checks.filter((entry) => entry.status === 'FAIL')
const evidence = { contract: 'DEV-047', evidenceScope: 'LOCAL_ISOLATED', status: failed.length ? 'FAIL' : 'PASS', generatedAt: new Date().toISOString(), migrationSha256: createHash('sha256').update(migrationBytes).digest('hex'), checks }
const output = join(root, 'qa', 'dev-047', 'contracts', 'manifest.json')
await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (failed.length) process.exit(1)
