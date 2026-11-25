import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { assertDev057ExternalMigrationEntries } from './dev057-projed-external-migration.mjs'

export const DEV057_USERS_RELEASE_MODE = 'DEV057_PROJED_USERS_APPEND'
export const DEV057_USERS_BASELINE_COUNT = 65
export const DEV057_USERS_ENTRY_COUNT = 66
export const DEV057_USERS_MIGRATION = Object.freeze({"order": 66, "version": "dev057-orgmaster-070", "path": "db/migrations/070_dev057_projed_user_directory.sql", "sourceSha256": "ffe38fc3b9f91e01ae985df779d1c9a32b6eff7f6d3ac540944be77d0692cbf0", "appliedSha256": "5592206cd44737811eea35c9a1695efa1e11acd52b664c7d53ca144a8e0587ce"})
export const DEV057_USERS_REMEDIATION = Object.freeze({
  kind: 'PROJED_USER_DIRECTORY', migrationEntries: Object.freeze([DEV057_USERS_MIGRATION]),
  consumerApplicationId: 'projed', applicationId: 'projed', contractVersion: 'orgmaster.projed-users.v1',
})
const fail = code => { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
export function assertDev057UsersMigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV057_USERS_ENTRY_COUNT) fail('MIGRATION_SET_DRIFT')
  assertDev057ExternalMigrationEntries(entries.slice(0, DEV057_USERS_BASELINE_COUNT))
  const { order, version, path, sourceSha256, appliedSha256 } = entries[65]
  if (!same({ order, version, path, sourceSha256, appliedSha256 }, DEV057_USERS_MIGRATION)) fail('DEV057_USERS_MIGRATION_APPEND_INVALID')
  if (Object.hasOwn(entries[65], 'sqlBase64') && entries[65].name !== 'dev057_projed_user_directory') fail('DEV057_USERS_MIGRATION_NAME_INVALID')
  return entries
}
export function assertDev057UsersAppend(before, after) {
  assertDev057UsersMigrationEntries(after?.entries)
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...rest }) => rest
  if (before?.entries?.length !== DEV057_USERS_BASELINE_COUNT || before.baselineCount !== 10
    || !same(staticInputs(before), staticInputs(after)) || !same(before.entries, after.entries.slice(0, DEV057_USERS_BASELINE_COUNT))) fail('DEV057_USERS_MIGRATION_APPEND_INVALID')
  const { sourceRevision, manifestSha256, ...inputs } = after
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(inputs)) }
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
