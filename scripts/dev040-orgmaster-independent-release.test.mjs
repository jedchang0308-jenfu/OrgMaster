import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040R2Profile, assertDev040ReleaseIntent, assertDev040WorkflowSource, buildDev040CandidateTag, buildDev040MigrationBundle, buildDev040Mutation, verifyDev040MigrationBytes } from './lib/dev040-orgmaster-independent-release.mjs'

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const profile = read('config/release/dev040-orgmaster-independent-production.json')
const n1c = read('config/dev-010/n1c-orgmaster.json')
const H = 'a'.repeat(64)
const ref = (name) => ({ uri: `gs://${profile.artifact.releaseBucket}/receipts/${name}.json`, sha256: H })

test('S1B-21 OrgMaster production profile preserves staging boundary', () => {
  assertDev040R2Profile(profile, n1c)
  assert.equal(n1c.target.environment, 'staging')
  assert.equal(profile.target.database, 'jenfu_prod')
  assert.equal(profile.sideEffects.accountEnrollment, 'DISABLED')
})

test('S1B-21 OrgMaster WIF provider display name fits provider limit', () => {
  const source = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/workload-identity.tf', import.meta.url), 'utf8')
  const displayName = source.match(/display_name\s*=\s*"([^"]+)"/u)?.[1]
  assert.ok(displayName)
  assert.ok(displayName.length <= 32)
})

test('S1B-21 OrgMaster exact 001-011 source bytes', () => {
  const files = new Map(profile.migrations.entries.map((entry) => [entry.path, fs.readFileSync(new URL(`../${entry.path}`, import.meta.url))]))
  assert.equal(verifyDev040MigrationBytes(profile, files), true)
  const bundle = buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, 'a'.repeat(40))
  assert.equal(bundle.bundle.entries.length, 11)
  assert.equal(bundle.bundle.entries[10].version, 'dev040-r2-orgmaster-011')
})

test('S1B-21 OrgMaster release intent is exact, owner-bound and immutable', () => {
  const intent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'orgmaster', releaseId: 'REL-ORGMASTER-001', sourceRevision: 'b'.repeat(40), sourceSha256: H, sourceLockRef: ref('source'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), migrationManifestSha256: H, previousRevision: 'orgmaster-prod-prev', deadlineAt: '2026-09-08T01:00:00.000Z' }
  assert.equal(assertDev040ReleaseIntent(intent, profile), intent)
  assert.throws(() => assertDev040ReleaseIntent({ ...intent, ownerApplicationId: 'ai-pdm' }, profile), /RELEASE_INTENT_INVALID/)
})

test('S1B-21 OrgMaster single-capsule workflow and owner masks', () => {
  assert.equal(assertDev040WorkflowSource(fs.readFileSync(new URL('../.github/workflows/deploy-orgmaster-independent-production.yml', import.meta.url), 'utf8')), true)
  assert.equal(buildDev040Mutation({ operation: 'CREATE_CANDIDATE', service: 'orgmaster-prod', updateMask: 'template', revision: 'candidate-1', trafficPercent: 0, etag: 'e' }).trafficPercent, 0)
  assert.equal(buildDev040CandidateTag({ service: 'orgmaster-prod', revision: 'orgmaster-prod-candidate-1', tag: `candidate-${'a'.repeat(12)}`, beforeTraffic: [{ revision: 'orgmaster-prod-prev', percent: 100 }], etag: 'e' }).traffic.at(-1).percent, 0)
  assert.throws(() => buildDev040Mutation({ operation: 'ACTIVATE', service: 'orgmaster-prod', updateMask: 'template,traffic', revision: 'candidate-1', trafficPercent: 100, etag: 'e' }), /MIXED_MUTATION_MASK/)
})
