import {assertFmsProjectionCurrentEntries} from './dev070-fms-projection-current-migration.mjs'
import { assertDev057UsersMigrationEntries, DEV057_USERS_ENTRY_COUNT } from './dev057-projed-users-migration.mjs'
import { assertDev057ExternalMigrationEntries, DEV057_EXTERNAL_ENTRY_COUNT } from './dev057-projed-external-migration.mjs'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { DEV070_MIGRATION_ENTRY_COUNT, assertDev070MigrationEntries } from './dev070-administration-migration.mjs'

export const DEV057_PROJED_MIGRATIONS = Object.freeze([
  Object.freeze({
    order: 61,
    version: 'dev057-orgmaster-065',
    path: 'db/migrations/065_dev057_projed_principal_publication.sql',
    sourceSha256: '09d6438673cdea17d41fd3a86b7032aae6d0bc9810bf19f2ae09531964e7153d',
    appliedSha256: '2ffbca8c2b87407dc420cec5f675addd73470055e4305c5c4f84c6320cbed49f',
  }),
  Object.freeze({
    order: 62,
    version: 'dev057-orgmaster-066',
    path: 'db/migrations/066_dev057_projed_principal_state_reader.sql',
    sourceSha256: '2d098555162ef1cdbbc86126df4974171754b959ed4611877f99105f4e42597f',
    appliedSha256: '4f2b0e7b005f319175dae1b7d624f8da378e0d8c27b851296efeb61ac6265963',
  }),
  Object.freeze({
    order: 63,
    version: 'dev057-orgmaster-067',
    path: 'db/migrations/067_dev057_projed_employee_private_admission.sql',
    sourceSha256: '2e5db34d47a81b2a4e3bd9465373e4fcf29d8148af183e6bb8a7e4cbe6276ad6',
    appliedSha256: '7fad572cd77370c5e7b230bcef9b9319c1f3d287226eed57cb61c7d37842b7af',
  }),
  Object.freeze({order:64,version:'dev057-orgmaster-068',path:'db/migrations/068_dev057_projed_central_revocation.sql',sourceSha256:'85d36aa0f36045405b29ce401fc5df7494a2ebf9ed530ee6f08e86aec8478b64',appliedSha256:'f6bcc2f6cf21721fc53825ace00ccdeda93f0e81267a834567d7343e065f42d8'}),
])

export const DEV057_PROJED_RELEASE_MODE = 'DEV057_PROJED_PRINCIPAL_APPEND'
export const DEV057_PROJED_BASELINE_COUNT = 60
export const DEV057_PROJED_MIGRATION_ENTRY_COUNT = DEV057_PROJED_BASELINE_COUNT + DEV057_PROJED_MIGRATIONS.length
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

// Released owner operations may consume either reviewed complete generation.
// This does not admit partial bundles or change either append recipe's bounds.
export function assertReviewedOrgmasterMigrationEntries(entries) {
  if (entries?.length === 71 || entries?.length === 69 && entries.at(-1)?.version === 'dev070-orgmaster-073') return assertFmsProjectionCurrentEntries(entries)
  if (entries?.length === DEV057_USERS_ENTRY_COUNT) return assertDev057UsersMigrationEntries(entries)
  if ([66,67,68,69].includes(entries?.length)) return assertDev057UsersMigrationEntries(entries, true)
  if (entries?.length === DEV057_EXTERNAL_ENTRY_COUNT) return assertDev057ExternalMigrationEntries(entries)
  return entries?.length === DEV057_PROJED_MIGRATION_ENTRY_COUNT
    ? assertDev057ProjedMigrationEntries(entries)
    : assertDev070MigrationEntries(entries)
}

export function assertDev057ProjedMigrationEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== DEV057_PROJED_MIGRATION_ENTRY_COUNT
    || DEV070_MIGRATION_ENTRY_COUNT !== DEV057_PROJED_BASELINE_COUNT) fail('MIGRATION_SET_DRIFT')

  assertDev070MigrationEntries(entries.slice(0, DEV057_PROJED_BASELINE_COUNT))
  if (canonicalize(entries.slice(DEV057_PROJED_BASELINE_COUNT).map(identity)) !== canonicalize(DEV057_PROJED_MIGRATIONS.map(identity))) {
    fail('DEV057_PROJED_MIGRATION_APPEND_INVALID')
  }

  const expectedNames = ['dev057_projed_principal_publication', 'dev057_projed_principal_state_reader', 'dev057_projed_employee_private_admission', 'dev057_projed_central_revocation']
  if (entries.slice(DEV057_PROJED_BASELINE_COUNT).some((entry, index) => Object.hasOwn(entry ?? {}, 'sqlBase64')
    && entry.name !== expectedNames[index])) fail('DEV057_PROJED_MIGRATION_NAME_INVALID')
  return entries
}

export function assertDev057ProjedAppend(before, after) {
  const staticInputs = ({ sourceRevision, manifestSha256, entries, ...inputs }) => inputs
  const migrationInputs = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  assertDev057ProjedMigrationEntries(after?.entries)

  if (!Array.isArray(before?.entries) || before.entries.length !== DEV057_PROJED_BASELINE_COUNT
    || before.baselineCount !== 10
    || !same(staticInputs(before), staticInputs(after))
    || !same(before.entries, after.entries.slice(0, DEV057_PROJED_BASELINE_COUNT))) fail('DEV057_PROJED_MIGRATION_APPEND_INVALID')

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
