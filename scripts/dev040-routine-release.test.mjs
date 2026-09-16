import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createGitArchive, createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'
import { buildRuntimeConfig, canonicalize, releasePaths, sha256, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'
import { assertRoutineMigrationUnchanged, assertRoutineRuntimeReadback, verifyRoutineRelease } from './lib/dev040-routine-release.mjs'

const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json'))
const n1c = JSON.parse(fs.readFileSync('config/dev-010/n1c-orgmaster.json'))
const files = new Map(profile.migrations.entries.map((entry) => [entry.path, fs.readFileSync(entry.path)]))
const buildBundle = (revision) => buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, revision)
const oldSource = 'a'.repeat(40), newSource = 'b'.repeat(40)
const bucket = profile.artifact.releaseBucket
const oldBundle = buildBundle(oldSource), newBundle = buildBundle(newSource)
const plain = { ...profile.environment.fixedValues }
for (const name of profile.environment.requiredPlainEnvironmentNames) plain[name] ??= 'fixture-public-value'
const runtime = buildRuntimeConfig(profile, { plainEnvironment: plain, secretVersions: Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1'])) })

function harness() {
  const objects = new Map()
  function put(uri, value) { const bytes = Buffer.from(`${canonicalize(value)}\n`); const result = { bytes, ref: { uri, sha256: sha256(bytes) }, value }; objects.set(uri, result); return result.ref }
  const receipt = (name, value) => put(`gs://${bucket}/receipts/fixture/${name}.json`, value)
  const previousRevision = 'orgmaster-prod-aaaaaaaaaaaa'
  const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
  const oldIntent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'orgmaster', releaseId: 'ROUTINE-BASELINE', sourceRevision: oldSource, sourceSha256: 'e'.repeat(64), sourceLockRef: receipt('source', {}), authorizationPolicyRef: receipt('auth', {}), readinessReceiptRef: receipt('ready', {}), foundationReceiptRef: receipt('foundation', {}), infraReceiptRef: receipt('infra', {}), runtimeConfigRef: receipt('runtime', { runtimeConfig: runtime }), migrationManifestSha256: oldBundle.bundle.manifestSha256, previousRevision: 'old-revision', deadlineAt: '2020-01-01T00:00:00Z' }
  // A prior release's expiry must not invalidate its historical evidence.
  const baselineIntentRef = receipt('intent', oldIntent)
  const paths = releasePaths(profile, oldIntent, baselineIntentRef.sha256)
  const bundleRef = put(`gs://${bucket}/source/migration-bundles/fixture.json`, oldBundle.bundle)
  const deploymentRef = put(paths.deployment, { sourceRevision: oldSource, releaseIntentRef: baselineIntentRef, migrationBundleRef: bundleRef, artifactDigest })
  const migrationRef = put(paths.migrate, { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: oldSource, manifestSha256: oldBundle.bundle.manifestSha256, status: 'PASS', boundaryStatus: 'PASS' })
  const seal = (stage, facts) => stageReceipt({ profile, intent: oldIntent, stage, facts, observedAt: '2020-01-01T00:00:00Z' })
  put(paths.candidate, seal('candidate', { deploymentCapsuleRef: deploymentRef, migrationReceiptRef: migrationRef, candidateRevision: previousRevision }))
  put(paths.terminal, seal('terminal', { result: 'RELEASED', remainingHumanAction: 0, candidateRevision: previousRevision, artifactDigest }))
  const revision = { ...structuredClone(runtime.template), containers: structuredClone(runtime.template.containers) }
  revision.containers[0].image = artifactDigest
  const service = { traffic: [{ revision: previousRevision, percent: 100 }], trafficStatuses: [{ revision: previousRevision, percent: 100 }] }
  const transport = { async readBytes(uri) { if (!objects.has(uri)) throw new Error('MISSING'); return objects.get(uri) }, async readJson(ref) { const result = await this.readBytes(ref.uri); assert.equal(ref.sha256, result.ref.sha256); return result }, effectiveRevision: () => previousRevision, assertServiceSettled() {}, assertCanonicalEntrypoint() {}, assertRevisionReady(_profile, value, digest) { assert.equal(value.containers[0].image, digest) }, async getRevision() { return revision } }
  const intent = { ...oldIntent, releaseId: 'ROUTINE-NEXT', sourceRevision: newSource, previousRevision, baselineIntentRef, migrationManifestSha256: newBundle.bundle.manifestSha256 }
  const authority = { ownerApplicationId: 'orgmaster', sourceRevision: newSource, releaseId: intent.releaseId, releaseMode: 'APPLICATION_ONLY', baselineIntentRef }
  const values = { runtimeConfig: { runtimeConfig: structuredClone(runtime) }, authorization: { ...authority }, readiness: { ...authority } }
  const input = { root: '.', profile, transport, intent, values, service, buildMigrationBundle: async () => newBundle, fingerprint: () => 'f'.repeat(64) }
  return { input, objects, paths, put, revision }
}

test('routine release reuses unchanged SQL and infrastructure with no bootstrap or live DDL', async () => {
  const h = harness()
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.liveLedgerRead, false)
  assert.equal(result.baselineMigrationRef.uri, h.paths.migrate)
  assert.equal(result.migrationInputsSha256, assertRoutineMigrationUnchanged(oldBundle.bundle, newBundle.bundle))
})
test('routine release rejects changed SQL, not just a changed application source SHA', () => {
  const changed = structuredClone(newBundle.bundle); changed.entries[10].sqlBase64 = 'changed'
  assert.throws(() => assertRoutineMigrationUnchanged(oldBundle.bundle, changed), /ROUTINE_MIGRATION_CHANGED/)
})
test('routine release rejects missing, wrong-owner, unsealed or unsuccessful baseline evidence', async () => {
  for (const defect of ['missing', 'owner', 'hash', 'failed']) {
    const h = harness()
    if (defect === 'missing') h.objects.delete(h.paths.migrate)
    else {
      const value = structuredClone(h.objects.get(h.paths.terminal).value)
      if (defect === 'owner') value.ownerApplicationId = 'other'
      if (defect === 'hash') value.receiptSha256 = '0'.repeat(64)
      if (defect === 'failed') value.facts.result = 'ROLLED_BACK'
      h.put(h.paths.terminal, value)
    }
    await assert.rejects(() => verifyRoutineRelease(h.input))
  }
})
test('routine release rejects infrastructure, runtime, traffic and authority drift', async () => {
  for (const defect of ['infra', 'runtime', 'traffic', 'authority', 'tag']) {
    const h = harness()
    if (defect === 'infra') h.input.fingerprint = (_root, revision) => revision
    if (defect === 'runtime') h.input.values.runtimeConfig.runtimeConfig.secretVersions.ORGMASTER_POSTGRES_URL = '2'
    if (defect === 'traffic') h.input.intent.previousRevision = 'different-revision'
    if (defect === 'authority') h.input.values.authorization.sourceRevision = oldSource
    if (defect === 'tag') h.input.service.traffic.push({ tag: 'another-release' })
    await assert.rejects(() => verifyRoutineRelease(h.input), /ROUTINE_/)
  }
})
test('routine release rejects provider secret/environment drift and allows only the candidate-origin extra', () => {
  const h = harness()
  h.revision.containers[0].env.push({ name: profile.environment.candidateOriginEnvironmentName, value: 'https://candidate.example' })
  assert.equal(assertRoutineRuntimeReadback(profile, runtime, h.revision), true)
  h.revision.containers[0].env.push({ name: 'ORGMASTER_MANAGED_IDENTITY_ENABLED', value: 'true' })
  assert.throws(() => assertRoutineRuntimeReadback(profile, runtime, h.revision), /ROUTINE_RUNTIME_DRIFT/)
})

test('Git archive excludes untracked files but still rejects modified tracked source', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orgmaster-release-source-test-'))
  const git = (...args) => { const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  try {
    git('init', '--quiet')
    fs.writeFileSync(path.join(dir, 'source.txt'), 'committed source')
    git('add', 'source.txt')
    git('-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', 'commit', '--quiet', '-m', 'fixture')
    const revision = git('rev-parse', 'HEAD')
    fs.writeFileSync(path.join(dir, 'private-untracked.txt'), 'must not deploy')
    assert.ok(createGitSourceIdentity(dir, revision).length)
    const archive = createGitArchive(dir, revision).toString('utf8')
    assert.ok(archive.includes('source.txt'))
    assert.ok(!archive.includes('private-untracked.txt'))
    assert.ok(!archive.includes('must not deploy'))
    fs.writeFileSync(path.join(dir, 'source.txt'), 'dirty source')
    assert.throws(() => createGitArchive(dir, revision), /SOURCE_CHECKOUT_NOT_FROZEN/)
  } finally {
    // Only this test-created exact temporary directory is removed.
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
