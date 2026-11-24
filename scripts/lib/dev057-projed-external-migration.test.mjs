import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildOrgmasterPackage } from '../dev010-n1c-orgmaster-package.mjs'
import { buildDev040MigrationBundle, sourceSha256, unwrapMigrationTransaction } from './dev040-orgmaster-independent-release.mjs'
import { assertDev057ExternalAppend, assertDev057ExternalMigrationEntries, assertDev057ExternalReleaseAuthority, DEV057_EXTERNAL_MIGRATION, DEV057_EXTERNAL_REMEDIATION } from './dev057-projed-external-migration.mjs'
import { assertDev057ProjedAppend, assertDev057ProjedMigrationEntries, assertReviewedOrgmasterMigrationEntries } from './dev057-projed-principal-migration.mjs'
import { parseDeployProductionArgs } from '../dev040-deploy-production.mjs'
const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json', 'utf8'))
const n1c = JSON.parse(fs.readFileSync('config/dev-010/n1c-orgmaster.json', 'utf8'))
const files = new Map(profile.migrations.entries.map(row => [row.path, fs.readFileSync(path.resolve(row.path))]))
const after = buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, 'a'.repeat(40)).bundle
const before = { ...after, sourceRevision: 'b'.repeat(40), entries: after.entries.slice(0, 64) }
test('external generation pins exact source and applied SQL after the immutable 64-entry predecessor', () => {
  const bytes = files.get(DEV057_EXTERNAL_MIGRATION.path)
  assert.equal(sourceSha256(bytes), DEV057_EXTERNAL_MIGRATION.sourceSha256)
  assert.equal(sourceSha256(unwrapMigrationTransaction(bytes)), DEV057_EXTERNAL_MIGRATION.appliedSha256)
  assert.equal(after.entries.length, 65)
  assert.equal(assertDev057ExternalMigrationEntries(after.entries), after.entries)
  for (const entries of [after.entries.slice(0, 60), before.entries, after.entries]) assert.equal(assertReviewedOrgmasterMigrationEntries(entries), entries)
  assert.equal(assertDev057ExternalAppend(before, after).pendingMigrationCount, 1)
})
test('the original Principal 60-to-64 recipe cannot consume 069', () => {
  assert.equal(assertDev057ProjedMigrationEntries(before.entries), before.entries)
  assert.throws(() => assertDev057ProjedMigrationEntries(after.entries), /MIGRATION_SET_DRIFT/)
  assert.throws(() => assertDev057ProjedAppend({ ...before, entries: before.entries.slice(0, 60) }, after), /MIGRATION_SET_DRIFT/)
})
test('external append rejects earlier, partial, unknown and altered ledgers', () => {
  for (const count of [0, 60, 61, 63, 65]) assert.throws(() => assertDev057ExternalAppend({ ...before, entries: after.entries.slice(0, count) }, after))
  for (const index of [0, 30, 60, 63, 64]) {
    const changed = structuredClone(after); changed.entries[index].appliedSha256 = '0'.repeat(64)
    assert.throws(() => assertDev057ExternalMigrationEntries(changed.entries))
  }
  assert.throws(() => assertDev057ExternalAppend({ ...before, ledger: 'foreign' }, after))
  const changed = structuredClone(after); changed.entries[64].name = 'foreign'
  assert.throws(() => assertDev057ExternalMigrationEntries(changed.entries), /MIGRATION_NAME_INVALID/)
})
test('external authority requires its own sealed recipe and source/baseline bindings', () => {
  const intent = { ownerApplicationId: 'orgmaster', sourceRevision: 'a'.repeat(40), releaseId: 'EXTERNAL-TEST', baselineIntentRef: { uri: 'gs://fixture/baseline', sha256: 'c'.repeat(64) } }
  const common = { ...intent, devId: 'DEV-057', slice: '057-PROJED-EXTERNAL', remediation: DEV057_EXTERNAL_REMEDIATION }
  const ready = { ...common, schemaVersion: 'orgmaster.routine-release-readiness.v1' }
  const authorization = { ...common, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' }
  assert.equal(assertDev057ExternalReleaseAuthority(ready, authorization, intent).releaseMode, 'DEV057_PROJED_EXTERNAL_APPEND')
  for (const change of [{ slice: '057-PROJED-PRINCIPAL' }, { sourceRevision: 'b'.repeat(40) }, { remediation: {} }, { baselineIntentRef: null }, { ownerApplicationId: 'platform' }]) assert.throws(() => assertDev057ExternalReleaseAuthority(ready, { ...authorization, ...change }, intent))
})

test('schema predecessor is a narrow immutable authority input and cannot change resume semantics', () => {
  const ref = { uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/releases/SCHEMA-PREVIOUS/release-intent.json', sha256: 'd'.repeat(64) }
  const input = `--dev057-schema-predecessor-ref=${ref.uri}#sha256=${ref.sha256}`
  const infra = `--dev057-infra-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/tool-rotations/${'a'.repeat(40)}/app-infra.json#sha256=${'e'.repeat(64)}`
  const args = ['--migration-only', '--dev057-projed-external-append', infra, input]
  assert.deepEqual(parseDeployProductionArgs(args).schemaPredecessorRef, ref)
  for (const rejected of [args.filter(a => a !== '--migration-only'), args.filter(a => a !== '--dev057-projed-external-append'),
    [...args, input], [input], [input, `--resume-capsule-ref=${ref.uri}#sha256=${ref.sha256}`],
    [...args.slice(0, -1), input.replace('jenfu-platform-prod-orgmaster-release', 'another-owner')]]) assert.throws(() => parseDeployProductionArgs(rejected))
  const intent = { ownerApplicationId: 'orgmaster', sourceRevision: 'a'.repeat(40), releaseId: 'EXTERNAL-TEST', baselineIntentRef: ref }
  const common = { ...intent, devId: 'DEV-057', slice: '057-PROJED-EXTERNAL', remediation: DEV057_EXTERNAL_REMEDIATION, schemaPredecessorRef: ref }
  const ready = { ...common, schemaVersion: 'orgmaster.routine-release-readiness.v1' }
  const auth = { ...common, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' }
  assert.deepEqual(assertDev057ExternalReleaseAuthority(ready, auth, intent).schemaPredecessorRef, ref)
  for (const changed of [undefined, null, { ...ref, sha256: 'f'.repeat(64) }, { ...ref, uri: ref.uri.replace('release-intent', 'migrate') }]) {
    assert.throws(() => assertDev057ExternalReleaseAuthority(ready, { ...auth, schemaPredecessorRef: changed }, intent))
  }
})
