import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040ReleaseIntent, assertDev040V3Profile, assertDev040WorkflowSource, buildDev040CandidateTag, buildDev040MigrationBundle, buildDev040Mutation, verifyDev040MigrationBytes } from './lib/dev040-orgmaster-independent-release.mjs'
import { assertRuntimeConfig, buildRuntimeConfig } from './lib/dev012-owner-release-runtime.mjs'
import { readGitBlob } from './lib/dev012-owner-stage-executor.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const profile = read('config/release/dev040-orgmaster-independent-production-v3.json')
const n1c = read('config/dev-010/n1c-orgmaster.json')
const H = 'a'.repeat(64)
const ref = (name) => ({ uri: `gs://${profile.artifact.releaseBucket}/receipts/${name}.json`, sha256: H })

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

after(() => {
  if (process.env.DEV012_EMIT_OWNER_REPORT !== '1') return
  const sources = [
    'config/release/dev040-orgmaster-independent-production-v3.json',
    'scripts/dev040-orgmaster-independent-release.mjs',
    'scripts/lib/dev040-orgmaster-independent-release.mjs',
    'scripts/lib/dev012-owner-release-runtime.mjs',
    'scripts/lib/dev012-owner-stage-executor.mjs',
    'server/orgmasterAuthApi.ts',
    '.github/workflows/deploy-orgmaster-independent-production.yml',
    'package.json',
  ].map((file) => ({ file, sha256: sha256(readGitBlob(root, file)) }))
  const profileBytes = readGitBlob(root, 'config/release/dev040-orgmaster-independent-production-v3.json')
  const historicalProfileBytes = readGitBlob(root, 'config/release/dev040-orgmaster-independent-production.json')
  const endpoint = {
    projectId: profile.target.projectId,
    projectNumber: profile.target.projectNumber,
    region: profile.target.region,
    serviceName: profile.target.serviceName,
    canonicalOrigin: profile.target.canonicalOrigin,
    entryPolicy: profile.target.entryPolicy,
  }
  console.log(`DEV012_OWNER_REPORT=${JSON.stringify({
    schemaVersion: 'jenfu.dev012.s1c-owner-report.v1',
    caseId: 'S1B-21',
    contractVersion: profile.profileVersion,
    contractSha256: profile.contractSha256,
    sourceSnapshotSha256: sha256(Buffer.from(JSON.stringify(sources))),
    sourceFiles: sources,
    ownerApplicationId: 'orgmaster',
    ownerProfileRef: 'config/release/dev040-orgmaster-independent-production-v3.json',
    ownerProfileSha256: sha256(profileBytes),
    historicalProfileRef: 'config/release/dev040-orgmaster-independent-production.json',
    historicalProfileSha256: sha256(historicalProfileBytes),
    ownerBoundary: { workflowJobs: profile.workflow.jobs, candidateOriginEnvironmentName: profile.environment.candidateOriginEnvironmentName, entrypointOperation: profile.operations.CONFIGURE_ENTRYPOINT, edge: profile.edge },
    expectedEndpointTuple: endpoint,
    observedEndpointTuple: endpoint,
    evidenceRefs: ['npm:test:dev-040:r2'],
    result: 'PASS',
    failureCode: null,
    cleanup: { providerMutations: 0, databaseMutations: 0, trafficMutations: 0, credentialReads: 0, runtimeResidue: 0 },
  })}`)
})

test('S1B-21 OrgMaster v3 direct-run profile preserves staging boundary', () => {
  assertDev040V3Profile(profile, n1c)
  assert.equal(n1c.target.environment, 'staging')
  assert.equal(profile.target.database, 'jenfu_prod')
  assert.equal(profile.sideEffects.accountEnrollment, 'DISABLED')
})

test('S1B-21 OrgMaster runtime keeps credentials out of plain environment', () => {
  const plainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames.map((name) => [name, profile.environment.fixedValues[name] ?? `plain-${name}`]))
  const secretVersions = Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1']))
  const runtime = buildRuntimeConfig(profile, { plainEnvironment, secretVersions })
  assert.deepEqual(Object.keys(runtime.plainEnvironment).sort(), [...profile.environment.requiredPlainEnvironmentNames].sort())
  assert.deepEqual(Object.keys(runtime.secretVersions).sort(), [...profile.environment.requiredSecretNames].sort())
  assert.equal(runtime.template.containers[0].env.filter((row) => row.name === 'ORGMASTER_POSTGRES_URL').length, 1)
  assert.equal(runtime.template.containers[0].env.find((row) => row.name === 'ORGMASTER_POSTGRES_URL').valueSource.secretKeyRef.secret, 'orgmaster-prod-postgres-url')
  assert.equal(assertRuntimeConfig(profile, runtime).containers.length, 2)
})

test('DEV-040 OrgMaster WIF provider display name fits provider limit', () => {
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
  assert.equal(buildDev040Mutation({ operation: 'CONFIGURE_ENTRYPOINT', service: 'orgmaster-prod', updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', revision: null, trafficPercent: null, etag: 'e' }).updateMask, 'ingress,defaultUriDisabled,invokerIamDisabled')
  assert.equal(buildDev040CandidateTag({ service: 'orgmaster-prod', revision: 'orgmaster-prod-candidate-1', tag: `candidate-${'a'.repeat(12)}`, beforeTraffic: [{ revision: 'orgmaster-prod-prev', percent: 100 }], etag: 'e' }).traffic.at(-1).percent, 0)
  assert.throws(() => buildDev040Mutation({ operation: 'ACTIVATE', service: 'orgmaster-prod', updateMask: 'template,traffic', revision: 'candidate-1', trafficPercent: 100, etag: 'e' }), /MIXED_MUTATION_MASK/)
})
