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
export const DEV065_FMS_PORTAL_VISIBILITY_MIGRATION = Object.freeze({
  order: 37,
  version: 'dev065-orgmaster-039',
  path: 'db/migrations/039_dev065_fms_portal_visibility.sql',
  sourceSha256: '8a39b85b0e091e5ca674f39c41571dc3babcf2d9df4efbd6db075a4e4c529270',
  appliedSha256: 'cce612b37ff2a7c660f636480ef0ffb64c165cab87fb495afaba877e2d970541',
})
export const DEV065_FMS_HUMAN_BUSINESS_AUTHORITY_V2_MIGRATION = Object.freeze({
  order: 38,
  version: 'dev065-orgmaster-040',
  path: 'db/migrations/040_dev065_fms_human_business_authority_v2.sql',
  sourceSha256: 'c2b921711d73ef829b8f64f4381219175a1a44df6aaa22893fbdd7e1080946ce',
  appliedSha256: 'cf461db2e8ae115f24c7a6acf593e04b577c723fc6c2fc91d9bd19179ca2b126',
})
export const DEV060_FMS_CATALOG_ACTIVATION_MIGRATION = Object.freeze({
  order: 39,
  version: 'dev060-orgmaster-041',
  path: 'db/migrations/041_dev060_fms_catalog_activation_receipts_v1.sql',
  sourceSha256: 'ef07d43635451e532f2e625d545aae6cd9e6cd3720210d87ba72fb26f21242c9',
  appliedSha256: '09cac4ea5769f66502b80c44ceff961617fc604e2ec5a2a18ff92f53f5bf8908',
})
// Extend the existing exact owner append recipe; historical SQL and the
// immutable DEV-058 prefix retain their original identities and checksums.
export const DEV059_FMS_AUTHORITY_MIGRATIONS = Object.freeze([
  DEV059_FMS_AUTHORITY_MIGRATION,
  DEV065_FMS_PORTAL_VISIBILITY_MIGRATION,
  DEV065_FMS_HUMAN_BUSINESS_AUTHORITY_V2_MIGRATION,
  DEV060_FMS_CATALOG_ACTIVATION_MIGRATION,
])
export const DEV059_RELEASE_MODE = 'DEV059_FMS_AUTHORITY_APPEND'
export const DEV059_MIGRATION_ENTRY_COUNT = DEV058_MIGRATION_ENTRY_COUNT + DEV059_FMS_AUTHORITY_MIGRATIONS.length
export const DEV059_FMS_AUTHORITY_REMEDIATION = Object.freeze({
  kind: 'FMS_AUTHORITY_PROJECTION',
  migrationEntries: DEV059_FMS_AUTHORITY_MIGRATIONS,
  consumerApplicationId: 'jf-fms',
  applicationId: 'financial-management-system',
  contractVersion: 'jenfu.orgmaster.fms-authority.v2',
  catalogActivationContractVersion: 'orgmaster.fms-catalog-activation.v1',
})

const identity = ({ order, version, path, sourceSha256, appliedSha256 }) => [order, version, path, sourceSha256, appliedSha256]

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)

export function assertDev059MigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV059_MIGRATION_ENTRY_COUNT) fail('MIGRATION_SET_DRIFT')
  assertDev058MigrationEntries(entries.slice(0, DEV058_MIGRATION_ENTRY_COUNT))
  if (canonicalize(entries.slice(-DEV059_FMS_AUTHORITY_MIGRATIONS.length).map(identity))
    !== canonicalize(DEV059_FMS_AUTHORITY_MIGRATIONS.map(identity))) fail('DEV059_MIGRATION_APPEND_INVALID')
  const expectedNames = ['dev065_fms_authority_projection', 'dev065_fms_portal_visibility', 'dev065_fms_human_business_authority_v2', 'dev060_fms_catalog_activation_receipts_v1']
  if (entries.slice(-expectedNames.length).some((entry, index) => Object.hasOwn(entry ?? {}, 'sqlBase64')
    && entry.name !== expectedNames[index])) fail('DEV059_MIGRATION_NAME_INVALID')
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
    || beforeEntryCount >= DEV059_MIGRATION_ENTRY_COUNT
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
