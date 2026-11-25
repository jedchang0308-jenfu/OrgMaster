import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { assertDev057ExternalMigrationEntries } from './dev057-projed-external-migration.mjs'

export const DEV057_USERS_RELEASE_MODE = 'DEV057_PROJED_USERS_APPEND'
export const DEV057_USERS_BASELINE_COUNT = 65
export const DEV057_USERS_ENTRY_COUNT = 69
export const DEV057_USERS_MIGRATION = Object.freeze({"order": 66, "version": "dev057-orgmaster-070", "path": "db/migrations/070_dev057_projed_user_directory.sql", "sourceSha256": "ffe38fc3b9f91e01ae985df779d1c9a32b6eff7f6d3ac540944be77d0692cbf0", "appliedSha256": "5592206cd44737811eea35c9a1695efa1e11acd52b664c7d53ca144a8e0587ce"})
export const DEV057_ALL_USERS_MIGRATION = Object.freeze({"order":67,"version":"dev057-orgmaster-071","path":"db/migrations/071_dev057_all_user_directory.sql","sourceSha256":"1d62ade3e30a487d4b22439c10dd6a67db59291ccca2f1eefd5a8b9c1d55144d","appliedSha256":"da4bd59644f1bd66f71fe75f878bc08c274d74db451776915e2bba9fa5cfa9d4"})
export const DEV057_USERS_OPTIMIZED_MIGRATION = Object.freeze({"order":68,"version":"dev057-orgmaster-072","path":"db/migrations/072_dev057_user_directory_optimized_grants.sql","sourceSha256":"30557828dc97ea11ac74a55dfd7b51dde01f7f09016bfca43a3c931164c246b9","appliedSha256":"c2d6d66989f23b9ce149fce104e985a4c31212e88b089d844d560f3fd1e6f08d"})
const DEV057_USERS_BULK_MIGRATION = Object.freeze({"order":69,"version":"dev057-orgmaster-073","path":"db/migrations/073_dev057_bulk_principal_mapping_counts.sql","sourceSha256":"d50d40ac401b4cc0137d760374972c89f1da4383862ede9fd1f1c6d189dcbf45","appliedSha256":"e9d12647d530e3b7b8166fa95662b677a64b94afa474787240feb2ad85743ff9"})
export const DEV057_USERS_MIGRATIONS = Object.freeze([DEV057_USERS_MIGRATION, DEV057_ALL_USERS_MIGRATION, DEV057_USERS_OPTIMIZED_MIGRATION, DEV057_USERS_BULK_MIGRATION])
export const DEV057_USERS_REMEDIATION = Object.freeze({
  kind: 'PROJED_USER_DIRECTORY', migrationEntries: DEV057_USERS_MIGRATIONS,
  consumerApplicationId: 'projed', applicationId: 'projed', contractVersion: 'orgmaster.projed-users.v1',
})
const fail = code => { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
export function assertDev057UsersMigrationEntries(entries, historical = false) {
  if (!Array.isArray(entries) || entries.length !== DEV057_USERS_ENTRY_COUNT && !(historical && [66,67,68].includes(entries.length))) fail('MIGRATION_SET_DRIFT')
  assertDev057ExternalMigrationEntries(entries.slice(0, DEV057_USERS_BASELINE_COUNT))
  for (const expected of DEV057_USERS_MIGRATIONS.slice(0,entries.length-DEV057_USERS_BASELINE_COUNT)) {
    const observed=entries[expected.order-1]
    const {order,version,path,sourceSha256,appliedSha256}=observed
    if (!same({order,version,path,sourceSha256,appliedSha256},expected)) fail('DEV057_USERS_MIGRATION_APPEND_INVALID')
    const name=expected.path.split('/').at(-1).replace(/^\d+_/, '').replace(/\.sql$/, '')
    if (Object.hasOwn(observed,'sqlBase64') && observed.name!==name) fail('DEV057_USERS_MIGRATION_NAME_INVALID')
  }
  return entries
}
export function assertDev057UsersAppend(before, after) {
  assertDev057UsersMigrationEntries(after?.entries)
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...rest }) => rest
  if (![DEV057_USERS_BASELINE_COUNT,66,67,68].includes(before?.entries?.length) || before.baselineCount !== 10
    || !same(staticInputs(before), staticInputs(after)) || !same(before.entries, after.entries.slice(0, before.entries.length))) fail('DEV057_USERS_MIGRATION_APPEND_INVALID')
  if ([66,67,68].includes(before.entries.length)) assertDev057UsersMigrationEntries(before.entries, true)
  const { sourceRevision, manifestSha256, ...inputs } = after
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: after.entries.length-before.entries.length, migrationInputsSha256: sha256(canonicalize(inputs)) }
}
export function assertDev057UsersReleaseAuthority(readiness, authorization, intent = null) {
  const intentValid = intent === null || (intent.ownerApplicationId === 'orgmaster'
    && typeof intent.sourceRevision === 'string' && intent.sourceRevision.length > 0
    && typeof intent.releaseId === 'string' && intent.releaseId.length > 0
    && intent.baselineIntentRef !== null && typeof intent.baselineIntentRef === 'object')
  if (!intentValid || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1' || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || [readiness, authorization].some(row => row.devId !== 'DEV-057' || row.slice !== '057-PROJED-USERS' || !same(row.remediation, DEV057_USERS_REMEDIATION)
      || intent && (row.ownerApplicationId !== 'orgmaster' || row.ownerApplicationId !== intent.ownerApplicationId || !intent.baselineIntentRef
        || row.sourceRevision !== intent.sourceRevision || row.releaseId !== intent.releaseId || !same(row.baselineIntentRef, intent.baselineIntentRef)))) fail('DEV057_USERS_AUTHORITY_INVALID')
  if (readiness.schemaPredecessorRef !== undefined || authorization.schemaPredecessorRef !== undefined) fail('DEV057_USERS_AUTHORITY_INVALID')
  return { releaseMode: DEV057_USERS_RELEASE_MODE, remediation: DEV057_USERS_REMEDIATION }
}
