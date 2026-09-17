import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildOwnerReceipt, canonicalize, createReleasePlan, hardJoinCandidate, loadProfile, sha256 } from './lib/dev013-orgmaster-staging-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = loadProfile()
const sourceRevision = 'a'.repeat(40)
const sourceTree = 'e'.repeat(40)
const image = `${profile.artifact.uri}@sha256:${'b'.repeat(64)}`
const origin = 'https://orgmaster-stg-123456789.asia-east1.run.app'
const broker = 'https://jenfu-platform-stg-123456789.asia-east1.run.app'
const identity = { email: profile.target.runtimeServiceAccount, uniqueId: '100000000000000000001', disabled: false }

function hashReceipt(core) { return { ...core, receiptSha256: sha256(canonicalize(core)) } }

const secretReferences = { ORGMASTER_SESSION_HASH_PEPPER: { secretId: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER, version: '7' } }
const floor = hashReceipt({ schemaVersion: 'jenfu.dev013.orgmaster-rollback-floor.v2', serviceName: profile.target.serviceName, revision: 'orgmaster-stg-00001-guard', providerEtag: 'etag-floor', artifactDigest: image, sourceRevision, sourceTree, secretReferences, authStateVersion: 'v2', originalAuthTimeGuard: true, protectedRequestEpochGuard: true, securityFloor: profile.release.securityFloor.id, preDev013Image: false, status: 'SECURITY_FLOOR_READY', releaseAuthority: false })
const base = { schemaVersion: 'jenfu.dev013.orgmaster-staging-release-request.v2', projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, rollbackFloor: floor, productionMutations: 0, siblingMutations: 0, databaseMutations: 0, migrationExecutions: 0 }

function candidateRequest() {
  return { ...base, operation: 'candidate', sourceRevision, sourceTree, artifactDigest: image, ssoHandoffMode: 'on', publicBaseUrl: origin, brokerOrigin: broker, previousRevision: floor.revision, platformManifestSha256: profile.platformManifest.sha256, canonicalContractSha256: profile.canonicalContract.sha256 }
}

function service({ revision, activeRevision, etag, mode = 'on' }) {
  return {
    uri: origin,
    projectId: profile.target.projectId,
    region: profile.target.region,
    serviceName: profile.target.serviceName,
    runtimeServiceAccount: profile.target.runtimeServiceAccount,
    image,
    deletionProtection: true,
    minInstances: 0,
    maxInstances: 1,
    entryPolicy: profile.target.entryPolicy,
    labels: profile.target.requiredLabels,
    etag,
    latestCreatedRevision: revision,
    latestReadyRevision: revision,
    traffic: [
      { revision: activeRevision, percent: 100, tag: null },
      ...(revision === activeRevision ? [] : [{ revision, percent: 0, tag: `candidate-${sourceRevision.slice(0, 12)}` }]),
    ],
    containers: [{ name: 'orgmaster', env: [
      { name: 'ORGMASTER_PUBLIC_BASE_URL', value: origin },
      { name: 'ORGMASTER_JENFU_SSO_BROKER_ORIGIN', value: broker },
      { name: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', value: mode },
      { name: 'DEV013_L3_SOURCE_REVISION', value: sourceRevision },
      { name: 'DEV013_L3_SOURCE_TREE', value: sourceTree },
      { name: 'ORGMASTER_SESSION_HASH_PEPPER', valueSource: { secretKeyRef: { secret: profile.secret.references.ORGMASTER_SESSION_HASH_PEPPER, version: '7' } } },
    ] }],
  }
}

test('candidate may create only a same-source same-digest on revision without traffic', () => {
  const plan = createReleasePlan(candidateRequest(), profile)
  assert.deepEqual(plan.mutationTypes, ['revision', 'runtime-env'])
  assert.equal(plan.schemaVersion, 'jenfu.dev013.orgmaster-release-plan.v2')
  assert.equal(plan.candidate.handoffMode, 'on')
  assert.equal(plan.gcloud.args[2], 'update')
  assert.ok(plan.gcloud.args.includes('--no-traffic'))
  assert.ok(plan.gcloud.args.includes(profile.target.serviceName))
  assert.ok(!plan.gcloud.args.join(' ').includes('ai-pdm-stg'))
  assert.ok(!plan.gcloud.args.join(' ').includes('jenfu-platform-stg --'))
  assert.throws(() => createReleasePlan({ ...candidateRequest(), artifactDigest: `${profile.artifact.uri}@sha256:${'c'.repeat(64)}` }, profile), /CANDIDATE_INVALID/u)
})

test('candidate hard join precedes traffic activation and final browser-ready receipt', async () => {
  const candidatePlan = createReleasePlan(candidateRequest(), profile)
  const candidateRevision = 'orgmaster-stg-00002-candidate'
  const candidate = hardJoinCandidate({ plan: candidatePlan, serviceReadback: service({ revision: candidateRevision, activeRevision: floor.revision, etag: 'etag-candidate' }), identityReadback: identity, observedAt: '2026-09-17T01:00:00.000Z' }, profile)
  assert.equal(candidate.status, 'ENABLED_REVISION_READY')
  const activation = createReleasePlan({ ...base, operation: 'activate', candidateReceipt: candidate }, profile)
  assert.deepEqual(activation.mutationTypes, ['traffic'])
  assert.ok(activation.gcloud.args.includes(`${candidateRevision}=100`))
  const owner = buildOwnerReceipt({ activationPlan: activation, candidateReceipt: candidate, serviceReadback: service({ revision: candidateRevision, activeRevision: candidateRevision, etag: 'etag-active' }), identityReadback: identity, observedAt: '2026-09-17T01:05:00.000Z' }, profile)
  assert.equal(owner.status, 'OWNER_READY_FOR_L3_BROWSER')
  assert.equal(owner.runtime.ssoHandoffMode, 'on')
  assert.equal(owner.hardJoin.trafficPercent, 100)
  assert.deepEqual(owner.boundaries.secretReferences, secretReferences)
  const validator = await import(pathToFileURL(path.resolve(root, '..', 'Jenfu-Platform', 'scripts', 'lib', 'dev013-l3-contract.mjs')))
  const manifest = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'Jenfu-Platform', 'config', 'dev-013', 'l3-managed-staging.json'), 'utf8'))
  assert.equal(validator.assertOwnerReceipt(owner, 'orgmaster', manifest), owner)
  const offState = service({ revision: candidateRevision, activeRevision: floor.revision, etag: 'etag-not-active' })
  assert.throws(() => buildOwnerReceipt({ activationPlan: activation, candidateReceipt: candidate, serviceReadback: offState, identityReadback: identity }, profile), /ACTIVE_HARD_JOIN_INVALID/u)
})

test('rollback targets the retained off-mode guard floor only', () => {
  const rollback = createReleasePlan({ ...base, operation: 'rollback' }, profile)
  assert.deepEqual(rollback.mutationTypes, ['traffic'])
  assert.ok(rollback.gcloud.args.includes(`${floor.revision}=100`))
  assert.throws(() => createReleasePlan({ ...base, operation: 'rollback', rollbackFloor: { ...floor, preDev013Image: true } }, profile), /RELEASE_FLOOR_INVALID/u)
  assert.throws(() => createReleasePlan({ ...base, operation: 'rollback', siblingMutations: 1 }, profile), /RELEASE_BOUNDARY_INVALID/u)
})
