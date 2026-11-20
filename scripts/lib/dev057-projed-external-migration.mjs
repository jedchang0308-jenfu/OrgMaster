import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { assertDev057ProjedMigrationEntries } from './dev057-projed-principal-migration.mjs'

export const DEV057_EXTERNAL_RELEASE_MODE = 'DEV057_PROJED_EXTERNAL_APPEND'
export const DEV057_EXTERNAL_BASELINE_COUNT = 64
export const DEV057_EXTERNAL_ENTRY_COUNT = 65
export const DEV057_EXTERNAL_MIGRATION = Object.freeze({
  order: 65, version: 'dev057-orgmaster-069', path: 'db/migrations/069_dev057_projed_external_qualification.sql',
  sourceSha256: 'b38613efeede89b3e6b39b1a3fd4e74c9c94b85381ee540f104e77c1c94a1169',
  appliedSha256: 'b7e389cafdbb693244300725fd080270f54f2b20da8f9c1003c9ef1a774eb641',
})
export const DEV057_EXTERNAL_REMEDIATION = Object.freeze({
  kind: 'PROJED_EXTERNAL_QUALIFICATION', migrationEntries: Object.freeze([DEV057_EXTERNAL_MIGRATION]),
  consumerApplicationId: 'projed', applicationId: 'projed', contractVersion: 'orgmaster.projed-external-qualification.v1',
})
const fail = code => { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
export function assertDev057ExternalMigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV057_EXTERNAL_ENTRY_COUNT) fail('MIGRATION_SET_DRIFT')
  assertDev057ProjedMigrationEntries(entries.slice(0, DEV057_EXTERNAL_BASELINE_COUNT))
  const { order, version, path, sourceSha256, appliedSha256 } = entries[64]
  if (!same({ order, version, path, sourceSha256, appliedSha256 }, DEV057_EXTERNAL_MIGRATION)) fail('DEV057_EXTERNAL_MIGRATION_APPEND_INVALID')
  if (Object.hasOwn(entries[64], 'sqlBase64') && entries[64].name !== 'dev057_projed_external_qualification') fail('DEV057_EXTERNAL_MIGRATION_NAME_INVALID')
  return entries
}
export function assertDev057ExternalAppend(before, after) {
  assertDev057ExternalMigrationEntries(after?.entries)
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...rest }) => rest
  if (before?.entries?.length !== DEV057_EXTERNAL_BASELINE_COUNT || before.baselineCount !== 10
    || !same(staticInputs(before), staticInputs(after)) || !same(before.entries, after.entries.slice(0, DEV057_EXTERNAL_BASELINE_COUNT))) fail('DEV057_EXTERNAL_MIGRATION_APPEND_INVALID')
  const { sourceRevision, manifestSha256, ...inputs } = after
  return { migrationDisposition: 'FORWARD_APPLY', pendingMigrationCount: 1, migrationInputsSha256: sha256(canonicalize(inputs)) }
}
export function assertDev057ExternalReleaseAuthority(readiness, authorization, intent = null) {
  const intentValid = intent === null || (intent.ownerApplicationId === 'orgmaster'
    && typeof intent.sourceRevision === 'string' && intent.sourceRevision.length > 0
    && typeof intent.releaseId === 'string' && intent.releaseId.length > 0
    && intent.baselineIntentRef !== null && typeof intent.baselineIntentRef === 'object')
  if (!intentValid || readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1' || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || [readiness, authorization].some(row => row.devId !== 'DEV-057' || row.slice !== '057-PROJED-EXTERNAL' || !same(row.remediation, DEV057_EXTERNAL_REMEDIATION)
      || intent && (row.ownerApplicationId !== 'orgmaster' || row.ownerApplicationId !== intent.ownerApplicationId || !intent.baselineIntentRef
        || row.sourceRevision !== intent.sourceRevision || row.releaseId !== intent.releaseId || !same(row.baselineIntentRef, intent.baselineIntentRef)))) fail('DEV057_EXTERNAL_AUTHORITY_INVALID')
  return { releaseMode: DEV057_EXTERNAL_RELEASE_MODE, remediation: DEV057_EXTERNAL_REMEDIATION }
}
