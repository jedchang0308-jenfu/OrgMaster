import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import {
  DEV058_MIGRATION_ENTRY_COUNT,
  DEV058_MIGRATION_PREFIX_COUNT,
  assertDev058MigrationEntries,
} from './dev058-role-policy-migration.mjs'

export const DEV059_FMS_AUTHORITY_MIGRATION = Object.freeze({
  order: 36,
  version: 'dev059-orgmaster-038',
  path: 'db/migrations/038_dev065_fms_authority_projection.sql',
  sourceSha256: '78f21d02147e64c3100c8a6eb0cc27bd11eab8aaf268204baacf3bf7368569c9',
  appliedSha256: '47b5b1edf1231a31a3af0d0b355283f3acc24c0653cb29b861f99698d5186da3',
})
export const DEV059_RELEASE_MODE = 'DEV059_FMS_AUTHORITY_APPEND'
export const DEV059_MIGRATION_ENTRY_COUNT = DEV058_MIGRATION_ENTRY_COUNT + 1
export const DEV059_FMS_AUTHORITY_REMEDIATION = Object.freeze({
  kind: 'FMS_AUTHORITY_PROJECTION',
  migrationEntries: Object.freeze([DEV059_FMS_AUTHORITY_MIGRATION]),
  consumerApplicationId: 'jf-fms',
  applicationId: 'financial-management-system',
  contractVersion: 'jenfu.orgmaster.fms-authority.v1',
})

const identity = ({ order, version, path, sourceSha256, appliedSha256 }) => [order, version, path, sourceSha256, appliedSha256]

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)

export function assertDev059MigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV059_MIGRATION_ENTRY_COUNT) fail('MIGRATION_SET_DRIFT')
  assertDev058MigrationEntries(entries.slice(0, DEV058_MIGRATION_ENTRY_COUNT))
  if (canonicalize(identity(entries.at(-1))) !== canonicalize(identity(DEV059_FMS_AUTHORITY_MIGRATION))) fail('DEV059_MIGRATION_APPEND_INVALID')
  if (Object.hasOwn(entries.at(-1) ?? {}, 'sqlBase64')
    && entries.at(-1).name !== 'dev065_fms_authority_projection') fail('DEV059_MIGRATION_NAME_INVALID')
  return entries
}

export function assertDev059FmsAuthorityAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  assertDev059MigrationEntries(after.entries)
  const beforeEntryCount = before.entries?.length
  if (canonicalize(staticInputs(before)) !== canonicalize(staticInputs(after))
    || before.baselineCount !== 10
    || !Number.isSafeInteger(beforeEntryCount)
    || beforeEntryCount < DEV058_MIGRATION_PREFIX_COUNT
    || beforeEntryCount > DEV058_MIGRATION_ENTRY_COUNT
    || canonicalize(before.entries) !== canonicalize(after.entries.slice(0, beforeEntryCount))) fail('DEV059_MIGRATION_APPEND_INVALID')
  return {
    migrationDisposition: 'FORWARD_APPLY',
    pendingMigrationCount: DEV059_MIGRATION_ENTRY_COUNT - beforeEntryCount,
    migrationInputsSha256: sha256(canonicalize(migrationInputs(after))),
  }
}

export function assertDev059FmsAuthorityReleaseAuthority(readiness, authorization, intent = null) {
  if (readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || [readiness, authorization].some(row => row.devId !== 'DEV-059' || row.slice !== '059-FMS-AUTHORITY'
      || !same(row.remediation, DEV059_FMS_AUTHORITY_REMEDIATION)
      || (intent && (row.ownerApplicationId !== intent.ownerApplicationId || row.sourceRevision !== intent.sourceRevision
        || row.releaseId !== intent.releaseId || !intent.baselineIntentRef || !same(row.baselineIntentRef, intent.baselineIntentRef))))) fail('DEV059_FMS_AUTHORITY_INVALID')
  return { releaseMode: DEV059_RELEASE_MODE, remediation: DEV059_FMS_AUTHORITY_REMEDIATION }
}
