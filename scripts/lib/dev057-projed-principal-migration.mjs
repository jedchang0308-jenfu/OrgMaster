import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { DEV059_MIGRATION_ENTRY_COUNT, assertDev059MigrationEntries } from './dev059-fms-authority-migration.mjs'

export const DEV057_PROJED_MIGRATIONS = Object.freeze([
  Object.freeze({
    order: 39,
    version: 'dev057-orgmaster-041',
    path: 'db/migrations/041_dev057_projed_principal_publication.sql',
    sourceSha256: '09d6438673cdea17d41fd3a86b7032aae6d0bc9810bf19f2ae09531964e7153d',
    appliedSha256: '2ffbca8c2b87407dc420cec5f675addd73470055e4305c5c4f84c6320cbed49f',
  }),
  Object.freeze({
    order: 40,
    version: 'dev057-orgmaster-042',
    path: 'db/migrations/042_dev057_projed_principal_state_reader.sql',
    sourceSha256: '2d098555162ef1cdbbc86126df4974171754b959ed4611877f99105f4e42597f',
    appliedSha256: '4f2b0e7b005f319175dae1b7d624f8da378e0d8c27b851296efeb61ac6265963',
  }),
  Object.freeze({
    order: 41,
    version: 'dev057-orgmaster-043',
    path: 'db/migrations/043_dev057_projed_employee_private_admission.sql',
    sourceSha256: '2e5db34d47a81b2a4e3bd9465373e4fcf29d8148af183e6bb8a7e4cbe6276ad6',
    appliedSha256: '7fad572cd77370c5e7b230bcef9b9319c1f3d287226eed57cb61c7d37842b7af',
  }),
])

export const DEV057_PROJED_RELEASE_MODE = 'DEV057_PROJED_PRINCIPAL_APPEND'
export const DEV057_PROJED_MIGRATION_ENTRY_COUNT = 38 + DEV057_PROJED_MIGRATIONS.length
export const DEV057_PROJED_REMEDIATION = Object.freeze({
  kind: 'PROJED_PRINCIPAL_PUBLICATION',
  migrationEntries: DEV057_PROJED_MIGRATIONS,
  consumerApplicationId: 'platform',
  applicationId: 'projed',
  contractVersion: 'orgmaster.projed-principal.v1',
})

const identity = ({ order, version, path, sourceSha256, appliedSha256 }) => [order, version, path, sourceSha256, appliedSha256]
const same = (a, b) => canonicalize(a) === canonicalize(b)

function fail(code) { throw Object.assign(new Error(code), { code }) }

export function assertDev057ProjedMigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV057_PROJED_MIGRATION_ENTRY_COUNT
    || DEV059_MIGRATION_ENTRY_COUNT !== 38) fail('MIGRATION_SET_DRIFT')

  assertDev059MigrationEntries(entries.slice(0, 38))
  if (canonicalize(entries.slice(38).map(identity)) !== canonicalize(DEV057_PROJED_MIGRATIONS.map(identity))) {
    fail('DEV057_PROJED_MIGRATION_APPEND_INVALID')
  }

  const expectedNames = ['dev057_projed_principal_publication', 'dev057_projed_principal_state_reader', 'dev057_projed_employee_private_admission']
  if (entries.slice(38).some((entry, index) => Object.hasOwn(entry ?? {}, 'sqlBase64')
    && entry.name !== expectedNames[index])) fail('DEV057_PROJED_MIGRATION_NAME_INVALID')
  return entries
}

export function assertDev057ProjedAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  assertDev057ProjedMigrationEntries(after?.entries)

  if (!Array.isArray(before?.entries) || before.entries.length !== 38
    || before.baselineCount !== 10
    || !same(staticInputs(before), staticInputs(after))
    || !same(before.entries, after.entries.slice(0, 38))) fail('DEV057_PROJED_MIGRATION_APPEND_INVALID')

  return {
    migrationDisposition: 'FORWARD_APPLY',
    pendingMigrationCount: DEV057_PROJED_MIGRATIONS.length,
    migrationInputsSha256: sha256(canonicalize(migrationInputs(after))),
  }
}

export function assertDev057ProjedReleaseAuthority(readiness, authorization, intent = null) {
  const intentValid = intent === null || (intent.ownerApplicationId === 'orgmaster'
    && typeof intent.sourceRevision === 'string' && intent.sourceRevision.length > 0
    && typeof intent.releaseId === 'string' && intent.releaseId.length > 0
    && intent.baselineIntentRef !== null && typeof intent.baselineIntentRef === 'object')
  if (readiness?.schemaVersion !== 'orgmaster.routine-release-readiness.v1'
    || authorization?.schemaVersion !== 'orgmaster.routine-release-authorization.v1'
    || authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
    || !intentValid
    || [readiness, authorization].some(row => row.devId !== 'DEV-057' || row.slice !== '057-PROJED-PRINCIPAL'
      || !same(row.remediation, DEV057_PROJED_REMEDIATION)
      || (intent && (row.ownerApplicationId !== intent.ownerApplicationId
        || row.sourceRevision !== intent.sourceRevision || row.releaseId !== intent.releaseId
        || !intent.baselineIntentRef || !same(row.baselineIntentRef, intent.baselineIntentRef))))) {
    fail('DEV057_PROJED_PRINCIPAL_AUTHORITY_INVALID')
  }
  return { releaseMode: DEV057_PROJED_RELEASE_MODE, remediation: DEV057_PROJED_REMEDIATION }
}
