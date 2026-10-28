import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildOrgmasterPackage } from '../dev010-n1c-orgmaster-package.mjs'
import {
  buildDev040MigrationBundle,
  sourceSha256,
  unwrapMigrationTransaction,
} from './dev040-orgmaster-independent-release.mjs'
import {
  assertDev057ProjedAppend,
  assertDev057ProjedMigrationEntries,
  assertDev057ProjedReleaseAuthority,
  DEV057_PROJED_MIGRATIONS,
  DEV057_PROJED_MIGRATION_ENTRY_COUNT,
  DEV057_PROJED_RELEASE_MODE,
  DEV057_PROJED_REMEDIATION,
} from './dev057-projed-principal-migration.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'))
const profile = readJson('config/release/dev040-orgmaster-independent-production-v3.json')
const n1c = readJson('config/dev-010/n1c-orgmaster.json')
const migrationFiles = new Map(profile.migrations.entries.map(entry => [
  entry.path,
  fs.readFileSync(path.join(repoRoot, entry.path)),
]))
const sourceBundle = buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), migrationFiles, 'a'.repeat(40)).bundle
const before = { ...sourceBundle, entries: sourceBundle.entries.slice(0, 38) }
const after = sourceBundle

const ref = { uri: 'gs://orgmaster-release/receipts/baseline-intent.json', sha256: 'c'.repeat(64) }
const intent = {
  ownerApplicationId: 'orgmaster',
  sourceRevision: 'd'.repeat(40),
  releaseId: 'DEV057-PROJED-PRINCIPAL-001',
  baselineIntentRef: ref,
}
const authorityCommon = {
  ...intent,
  devId: 'DEV-057',
  slice: '057-PROJED-PRINCIPAL',
  remediation: DEV057_PROJED_REMEDIATION,
}
const readiness = { ...authorityCommon, schemaVersion: 'orgmaster.routine-release-readiness.v1' }
const authorization = {
  ...authorityCommon,
  schemaVersion: 'orgmaster.routine-release-authorization.v1',
  authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION',
}

test('DEV-057 ProJED suffix matches exact source and applied migration bytes', () => {
  assert.equal(DEV057_PROJED_RELEASE_MODE, 'DEV057_PROJED_PRINCIPAL_APPEND')
  assert.equal(DEV057_PROJED_MIGRATION_ENTRY_COUNT, 40)
  assert.equal(before.entries.length, 38)
  assert.equal(after.entries.length, DEV057_PROJED_MIGRATION_ENTRY_COUNT)
  assert.equal(sourceBundle.baselineCount, 10)
  for (const migration of DEV057_PROJED_MIGRATIONS) {
    const source = fs.readFileSync(path.join(repoRoot, migration.path))
    const applied = Buffer.from(unwrapMigrationTransaction(source), 'utf8')
    assert.equal(sourceSha256(source), migration.sourceSha256, `${migration.path} source hash`)
    assert.equal(sourceSha256(applied), migration.appliedSha256, `${migration.path} applied hash`)
  }
  assert.equal(assertDev057ProjedMigrationEntries(after.entries), after.entries)
})

test('migration entries reject hash changes, altered prefixes, unknown suffixes, and partial release sets', () => {
  for (const field of ['sourceSha256', 'appliedSha256']) {
    const changedHash = structuredClone(after.entries)
    changedHash[38][field] = '0'.repeat(64)
    assert.throws(() => assertDev057ProjedMigrationEntries(changedHash))
  }

  const changedPrefix = structuredClone(after.entries)
  changedPrefix[12].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev057ProjedMigrationEntries(changedPrefix))

  assert.throws(() => assertDev057ProjedMigrationEntries(after.entries.slice(0, 39)))
  assert.throws(() => assertDev057ProjedMigrationEntries([...after.entries, { order: 41, version: 'unknown', path: 'unknown.sql' }]))
})

test('append accepts only the unchanged 38-row baseline to exact 40-row suffix', () => {
  const result = assertDev057ProjedAppend(before, after)
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 2)
  assert.match(result.migrationInputsSha256, /^[0-9a-f]{64}$/u)

  const partialBefore = { ...before, entries: [...before.entries, after.entries[38]] }
  assert.throws(() => assertDev057ProjedAppend(partialBefore, after), /DEV057_PROJED_MIGRATION_APPEND_INVALID/u)
  const changedPrefix = structuredClone(before)
  changedPrefix.entries[7].sourceSha256 = '0'.repeat(64)
  assert.throws(() => assertDev057ProjedAppend(changedPrefix, after))
  assert.throws(() => assertDev057ProjedAppend(before, { ...after, baselineCount: 9 }))
  assert.throws(() => assertDev057ProjedAppend(before, { ...after, region: 'us-central1' }))
})

test('release authority binds existing operator basis and exact DEV-057 intent', () => {
  assert.deepEqual(assertDev057ProjedReleaseAuthority(readiness, authorization, intent), {
    releaseMode: DEV057_PROJED_RELEASE_MODE,
    remediation: DEV057_PROJED_REMEDIATION,
  })

  const invalidPairs = [
    [{ ...readiness, slice: '057-WRITER-FENCE' }, authorization, intent],
    [readiness, { ...authorization, authorizationBasis: 'OTHER' }, intent],
    [readiness, authorization, { ...intent, sourceRevision: 'e'.repeat(40) }],
    [readiness, authorization, { ...intent, releaseId: 'OTHER' }],
    [readiness, authorization, { ...intent, baselineIntentRef: { ...ref, sha256: 'f'.repeat(64) } }],
    [readiness, authorization, { ...intent, ownerApplicationId: 'other' }],
  ]
  for (const args of invalidPairs) assert.throws(() => assertDev057ProjedReleaseAuthority(...args), /DEV057_PROJED_PRINCIPAL_AUTHORITY_INVALID/u)
})
