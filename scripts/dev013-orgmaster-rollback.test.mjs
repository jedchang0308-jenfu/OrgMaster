import assert from 'node:assert/strict'
import test from 'node:test'
import { createReleasePlan, loadProfile } from './lib/dev013-orgmaster-staging-release.mjs'

const profile = loadProfile()
const H40 = 'a'.repeat(40)
const image = `${profile.artifact.uri}@sha256:${'b'.repeat(64)}`
const previousImage = `${profile.artifact.uri}@sha256:${'c'.repeat(64)}`
const floor = { schemaVersion: 'jenfu.dev013.orgmaster-rollback-floor.v1', serviceName: profile.target.serviceName, revision: 'orgmaster-stg-00001-guard', artifactDigest: previousImage, sourceRevision: 'd'.repeat(40), authStateVersion: 'v2', originalAuthTimeGuard: true, protectedRequestEpochGuard: true, securityFloor: profile.release.securityFloor.id, preDev013Image: false }
const base = { schemaVersion: 'jenfu.dev013.orgmaster-staging-release-request.v1', projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, rollbackFloor: floor, productionMutations: 0, siblingMutations: 0, databaseMutations: 0, migrationExecutions: 0 }

test('candidate may create only an OrgMaster revision and runtime env with immutable digest', () => {
  const plan = createReleasePlan({ ...base, operation: 'candidate', sourceRevision: H40, sourceTree: 'e'.repeat(40), artifactDigest: image, ssoHandoffMode: 'off', publicBaseUrl: 'https://orgmaster-stg-123456789.asia-east1.run.app', brokerOrigin: 'https://jenfu-platform-stg-123456789.asia-east1.run.app', previousRevision: floor.revision, platformManifestSha256: profile.platformManifest.sha256, canonicalContractSha256: profile.canonicalContract.sha256 }, profile)
  assert.deepEqual(plan.mutationTypes, ['revision', 'runtime-env'])
  assert.equal(plan.gcloud.args[2], 'update')
  assert.ok(plan.gcloud.args.includes('--no-traffic'))
  assert.ok(plan.gcloud.args.includes(profile.target.serviceName))
  assert.ok(!plan.gcloud.args.join(' ').includes('ai-pdm-stg'))
  assert.ok(!plan.gcloud.args.join(' ').includes('jenfu-platform-stg --'))
})

test('activate changes only own traffic and rollback targets the retained guard floor', () => {
  const activate = createReleasePlan({ ...base, operation: 'activate', candidateRevision: 'orgmaster-stg-00002-candidate' }, profile)
  assert.deepEqual(activate.mutationTypes, ['traffic'])
  assert.ok(activate.gcloud.args.includes('orgmaster-stg-00002-candidate=100'))
  const rollback = createReleasePlan({ ...base, operation: 'rollback' }, profile)
  assert.deepEqual(rollback.mutationTypes, ['traffic'])
  assert.ok(rollback.gcloud.args.includes(`${floor.revision}=100`))
})

test('rollback floor rejects pre-DEV-013 or missing auth-state/original-auth-time guards', () => {
  assert.throws(() => createReleasePlan({ ...base, operation: 'rollback', rollbackFloor: { ...floor, preDev013Image: true } }, profile), /RELEASE_FLOOR_INVALID/u)
  assert.throws(() => createReleasePlan({ ...base, operation: 'rollback', rollbackFloor: { ...floor, originalAuthTimeGuard: false } }, profile), /RELEASE_FLOOR_INVALID/u)
  assert.throws(() => createReleasePlan({ ...base, operation: 'rollback', siblingMutations: 1 }, profile), /RELEASE_BOUNDARY_INVALID/u)
})
