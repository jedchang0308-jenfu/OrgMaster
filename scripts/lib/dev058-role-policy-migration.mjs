import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

// One exact append recipe shared by the source planner and the native runner.
// This binds machine inputs; it grants no authority to execute a release.
export const DEV058_RELEASE_MODE = 'DEV058_ROLE_POLICY_APPEND'
export const DEV058_MIGRATION_PREFIX_COUNT = 31
export const DEV058_MIGRATION_PREFIX_SHA256 = '74adc39d496282f27986bbef09450f3b194aea960839164d3bf02078e7dabc4c'
export const DEV058_MIGRATION_ENTRIES = Object.freeze([
  Object.freeze({ order: 32, version: 'dev058-orgmaster-034', path: 'db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql', sourceSha256: '5206a2c0098db100c64a6e76e0b220a3e3759dfb1e69cba52f7559ddbfb831d0', appliedSha256: 'a76afb99b66fbb7045981230737d2a83119ee4f18763925351456e227bd11843' }),
  Object.freeze({ order: 33, version: 'dev058-orgmaster-035', path: 'db/migrations/035_dev058_ai_pdm_compatibility_definer_read.sql', sourceSha256: '80ae5123812f9909ca17b2581fe2638576cf182905bc11761f937595ec9271ee', appliedSha256: '502d1d7858dbd82745a60d007aeb187703b032928720da695871aaba7ab50fed' }),
  Object.freeze({ order: 34, version: 'dev058-orgmaster-036', path: 'db/migrations/036_dev058_retire_unused_role_policy_readiness.sql', sourceSha256: 'e5a6d5e6d808ad7d5a327b70e9cbc976b58ef894db0dc54a681f8fecfc2636a1', appliedSha256: '075b5a48233a51723c64059baa2c45735f891fcbcd93ab60664161acbf10e2f4' }),
  Object.freeze({ order: 35, version: 'dev058-orgmaster-037', path: 'db/migrations/037_dev058_human_privileged_portal_visibility.sql', sourceSha256: '5f2d9cfdc3e3999310da0ddbb804acb30ed009e1c701940c1ee726f8b84a8e7f', appliedSha256: '5edb7a18448b4849ff848a572564098cd2d3be491ad182775b5c91761ef1103f' }),
])
export const DEV058_MIGRATION_ENTRY_COUNT = DEV058_MIGRATION_PREFIX_COUNT + DEV058_MIGRATION_ENTRIES.length
export const DEV058_ROLE_POLICY_REMEDIATION = Object.freeze({
  kind: 'ROLE_POLICY_CATALOG_COMPATIBILITY',
  migrationEntries: DEV058_MIGRATION_ENTRIES,
  consumerApplicationId: 'ai-pdm',
})

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
const identity = ({ order, version, path, sourceSha256, appliedSha256 }) => [order, version, path, sourceSha256, appliedSha256]

export function assertDev058MigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV058_MIGRATION_ENTRY_COUNT) fail('MIGRATION_SET_DRIFT')
  if (sha256(JSON.stringify(entries.slice(0, DEV058_MIGRATION_PREFIX_COUNT).map(identity))) !== DEV058_MIGRATION_PREFIX_SHA256) fail('MIGRATION_PREFIX_001_031_DRIFT')
  if (!same(entries.slice(DEV058_MIGRATION_PREFIX_COUNT).map(identity), DEV058_MIGRATION_ENTRIES.map(identity))) fail('DEV058_MIGRATION_APPEND_INVALID')
  // Profile entries have no name. Native bundle names must match the reviewed
  // path, since the runner persists that name into the migration ledger.
  if (entries.some(entry => Object.hasOwn(entry, 'sqlBase64')
    && entry.name !== entry.path.split('/').at(-1).replace(/^\d{3}_/u, '').replace(/\.sql$/u, ''))) fail('DEV058_MIGRATION_NAME_INVALID')
  return entries
}

export function assertDev058RolePolicyAuthority(readiness, authorization, intent = null) {
  if (readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || [readiness, authorization].some(row => row.devId !== 'DEV-058' || row.slice !== '058-ROLE-POLICY'
      || !same(row.remediation, DEV058_ROLE_POLICY_REMEDIATION)
      || (intent && (row.ownerApplicationId !== intent.ownerApplicationId || row.sourceRevision !== intent.sourceRevision
        || row.releaseId !== intent.releaseId || !intent.baselineIntentRef || !same(row.baselineIntentRef, intent.baselineIntentRef))))) fail('DEV058_ROLE_POLICY_AUTHORITY_INVALID')
  return { releaseMode: DEV058_RELEASE_MODE, remediation: DEV058_ROLE_POLICY_REMEDIATION }
}

export function assertDev058RolePolicyAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  assertDev058MigrationEntries(after.entries)
  if (!same(staticInputs(before), staticInputs(after)) || before.baselineCount !== 10
    || before.entries?.length !== DEV058_MIGRATION_PREFIX_COUNT
    || !same(before.entries, after.entries.slice(0, DEV058_MIGRATION_PREFIX_COUNT))) fail('DEV058_MIGRATION_APPEND_INVALID')
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: DEV058_MIGRATION_ENTRIES.length, migrationInputsSha256: sha256(canonicalize(migrationInputs(after))) }
}
