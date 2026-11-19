import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import {
  DEV059_MIGRATION_ENTRY_COUNT,
  DEV060_FMS_CATALOG_ACTIVATION_MIGRATION,
  assertDev059MigrationEntries,
} from './dev059-fms-authority-migration.mjs'

export const DEV060_RELEASE_MODE = 'DEV060_FMS_CATALOG_ACTIVATION_APPEND'
export const DEV060_MIGRATION_PREFIX_COUNT = DEV059_MIGRATION_ENTRY_COUNT - 1
export const DEV060_MIGRATION_ENTRY_COUNT = DEV059_MIGRATION_ENTRY_COUNT
export const DEV060_FMS_CATALOG_ACTIVATION_REMEDIATION = Object.freeze({
  kind: 'FMS_CATALOG_ACTIVATION_RECEIPTS',
  migrationEntries: Object.freeze([DEV060_FMS_CATALOG_ACTIVATION_MIGRATION]),
  consumerApplicationId: 'jf-fms',
  applicationId: 'financial-management-system',
  contractVersion: 'orgmaster.fms-catalog-activation.v1',
})

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)

export function assertDev060MigrationEntries(entries) {
  try { assertDev059MigrationEntries(entries) } catch { fail('DEV060_MIGRATION_APPEND_INVALID') }
  const actual = entries.at(-1)
  const expected = DEV060_FMS_CATALOG_ACTIVATION_MIGRATION
  const identity = ({ order, version, path, sourceSha256, appliedSha256 }) => ({ order, version, path, sourceSha256, appliedSha256 })
  if (!same(identity(actual), identity(expected))
    || (Object.hasOwn(actual ?? {}, 'sqlBase64') && actual.name !== 'dev060_fms_catalog_activation_receipts_v1')) fail('DEV060_MIGRATION_APPEND_INVALID')
  return entries
}

export function assertDev060FmsCatalogActivationAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  assertDev060MigrationEntries(after.entries)
  if (canonicalize(staticInputs(before)) !== canonicalize(staticInputs(after))
    || before.baselineCount !== 10
    || before.entries?.length !== DEV060_MIGRATION_PREFIX_COUNT
    || canonicalize(before.entries) !== canonicalize(after.entries.slice(0, DEV060_MIGRATION_PREFIX_COUNT))) fail('DEV060_MIGRATION_APPEND_INVALID')
  return {
    migrationDisposition: 'FORWARD_APPLY',
    pendingMigrationCount: 1,
    migrationInputsSha256: sha256(canonicalize(migrationInputs(after))),
  }
}

export function assertDev060FmsCatalogActivationReleaseAuthority(readiness, authorization, intent = null) {
  if (readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || [readiness, authorization].some(row => row.devId !== 'DEV-060' || row.slice !== '060-FMS-CATALOG-ACTIVATION'
      || !same(row.remediation, DEV060_FMS_CATALOG_ACTIVATION_REMEDIATION)
      || (intent && (row.ownerApplicationId !== intent.ownerApplicationId || row.sourceRevision !== intent.sourceRevision
        || row.releaseId !== intent.releaseId || !intent.baselineIntentRef || !same(row.baselineIntentRef, intent.baselineIntentRef))))) fail('DEV060_FMS_CATALOG_ACTIVATION_INVALID')
  return { releaseMode: DEV060_RELEASE_MODE, remediation: DEV060_FMS_CATALOG_ACTIVATION_REMEDIATION }
}
