import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { executeRecoveryOperation } from './dev057-principal-recovery-operator.mjs'
import { parseDeployProductionArgs } from './dev040-deploy-production.mjs'

const sourceRevision = 'a'.repeat(40)
const oldRevision = 'orgmaster-prod-oldrevision'
const digest = 'b'.repeat(64)
const imageDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:${digest}`
const bucket = 'jenfu-platform-prod-orgmaster-release'
const profile = { target: { projectId: 'jenfu-platform-prod', region: 'asia-east1',
  serviceName: 'orgmaster-prod', runtimeServiceAccount: 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
artifact: { releaseBucket: bucket },
identities: { builder: 'orgmaster-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
runtime: { containerName: 'orgmaster' }, build: { maximumAllowedSeverity: 'MEDIUM' } }
const sourceProof = { schemaVersion: 'jenfu.dev012.official-merged-source.v1',
  repository: 'jedchang0308-jenfu/OrgMaster', branch: 'master', sourceRevision,
  sourceTree: 'c'.repeat(40), reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED',
  pullRequestNumber: 158, requiredChecks: ['Production Source QC'],
  branchProtected: true, rulesetId: 24077876,
  status: 'OFFICIAL_MERGED_PR_VERIFIED' }
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

function harness(scaling = { scalingMode: 'AUTOMATIC' }) {
  const oldTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: oldRevision, percent: 100 }
  let service = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod',
    uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', etag: 'etag-one',
    generation: '10', observedGeneration: '10', reconciling: false,
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    scaling: structuredClone(scaling),
    ingress: 'INGRESS_TRAFFIC_ALL', invokerIamDisabled: true,
    defaultUriDisabled: false, traffic: [oldTraffic], trafficStatuses: [oldTraffic] }
  const calls = []
  const receipts = new Map()
  const revisions = new Map()
  let buildRequest = null
  let revisionRequest = null
  const transport = {
    async readBytes(uri) {
      if (receipts.has(uri)) return receipts.get(uri)
      const error = new Error('missing'); error.code = 'MISSING'; throw error
    },
    async getService() { return structuredClone(service) },
    effectiveRevision(value) { return value.trafficStatuses.find((row) => Number(row.percent) === 100).revision },
    async putBytes(uri, bytes) {
      assert.match(uri, /source\/releases\/DEV057-RECOVERY/u)
      calls.push('source')
      return { ref: { uri, sha256: hash(bytes) }, metadata: { generation: '42' } }
    },
    async request(url, options) {
      if (url.includes('cloudbuild.googleapis.com')) {
        assert.equal(options.method, 'POST')
        buildRequest = JSON.parse(options.body)
        calls.push('build')
        return { name: 'operations/build-one' }
      }
      assert.match(url, /artifactregistry.googleapis.com/u)
      calls.push('artifact')
      return { dockerImages: [{ uri: imageDigest }] }
    },
    async waitBuild() {
      return { status: 'SUCCESS', projectId: 'jenfu-platform-prod',
        serviceAccount: buildRequest.serviceAccount,
        options: { requestedVerifyOption: 'VERIFIED' },
        sourceProvenance: { resolvedStorageSource: { ...buildRequest.source.storageSource } },
        results: { images: [{ name: buildRequest.images[0], digest: `sha256:${digest}` }] } }
    },
    async waitArtifactEvidence() { calls.push('scan'); return { status: 'PASS' } },
    async patchService(_profile, request, mask) {
      assert.equal(mask, 'template')
      assert.equal(request.etag, service.etag)
      revisionRequest = request
      calls.push('revision')
      const generation = String(Number(service.generation) + 1)
      service = { ...service, etag: `etag-${generation}`, generation, observedGeneration: generation,
        latestCreatedRevision: request.template.revision }
      revisions.set(request.template.revision, { name: `${service.name}/revisions/${request.template.revision}`,
        serviceAccount: request.template.serviceAccount,
        conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
        containers: [{ name: 'orgmaster', image: imageDigest,
          startupProbe: { httpGet: { path: '/login', port: 8080 } } }] })
      return { response: structuredClone(service) }
    },
    async getRevision(_profile, name) {
      assert.ok(revisions.has(name))
      return revisions.get(name)
    },
    async putJson(uri, proof) {
      calls.push('receipt')
      const bytes = Buffer.from(`${JSON.stringify(proof)}\n`)
      assert.equal(receipts.has(uri), false, 'new proof publication must never overwrite an immutable receipt')
      const receipt = { bytes, ref: { uri, sha256: hash(bytes) }, metadata: { generation: String(43 + receipts.size) } }
      receipts.set(uri, receipt)
      return receipt
    },
  }
  return { transport, calls, receipts, service: () => service,
    serveMaintenance(revision) {
      assert.ok(revisions.has(revision))
      const generation = String(Number(service.generation) + 1)
      const traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision, percent: 100 }]
      service = { ...service, generation, observedGeneration: generation, etag: `etag-${generation}`,
        scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 }, traffic, trafficStatuses: traffic }
    } }
}

test('owner recovery operator builds once, creates only an untagged revision, and reuses the immutable proof', async () => {
  const h = harness()
  const input = { profile, sourceRevision, archive: Buffer.from('official-source-archive'),
    sourceProof, transport: h.transport }
  const first = await executeRecoveryOperation(input)
  assert.equal(first.status, 'PASS')
  assert.equal(first.imageDigest, imageDigest)
  assert.deepEqual(parseDeployProductionArgs([`--principal-only-recovery-ref=${first.ref.uri}#sha256=${first.ref.sha256}`]).principalOnlyRecoveryRef, first.ref)
  assert.deepEqual(h.calls, ['source', 'build', 'artifact', 'scan', 'revision', 'receipt'])
  assert.equal(h.service().traffic[0].revision, oldRevision)
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  const second = await executeRecoveryOperation(input)
  assert.equal(second.status, 'REUSED_PASS')
  assert.deepEqual(h.calls, ['source', 'build', 'artifact', 'scan', 'revision', 'receipt'])
})

test('owner recovery operator refuses a non-official source before a provider mutation', async () => {
  const h = harness()
  await assert.rejects(executeRecoveryOperation({ profile, sourceRevision,
    archive: Buffer.from('source'), sourceProof: { ...sourceProof, branchProtected: false },
    transport: h.transport }), /DEV057_RECOVERY_OPERATOR_SOURCE_INVALID/u)
  assert.deepEqual(h.calls, [])
})

test('same-source consecutive maintenance recoveries allocate distinct immutable proofs without reusing the serving recovery as rollback', async () => {
  const h = harness()
  const input = { profile, sourceRevision, archive: Buffer.from('official-source-archive'), sourceProof, transport: h.transport }
  const first = await executeRecoveryOperation(input)
  const firstBytes = Buffer.from(h.receipts.get(first.ref.uri).bytes)
  h.serveMaintenance(first.recoveryRevision)
  const second = await executeRecoveryOperation(input)
  assert.equal(second.status, 'PASS')
  assert.notEqual(second.ref.uri, first.ref.uri)
  assert.notEqual(second.recoveryRevision, first.recoveryRevision)
  assert.deepEqual(h.receipts.get(first.ref.uri).bytes, firstBytes)
  assert.equal(JSON.parse(h.receipts.get(second.ref.uri).bytes).oldRevision, first.recoveryRevision)
  assert.equal((await executeRecoveryOperation(input)).status, 'REUSED_PASS')
  h.serveMaintenance(second.recoveryRevision)
  const third = await executeRecoveryOperation(input)
  assert.equal(third.status, 'PASS')
  assert.equal(new Set([first.recoveryRevision, second.recoveryRevision, third.recoveryRevision]).size, 3)
  assert.equal(h.receipts.size, 3)
})

test('stopped owner recovery creates an untagged revision without reopening traffic or scaling', async () => {
  const h = harness({ scalingMode: 'MANUAL', manualInstanceCount: 0 })
  const patch = h.transport.patchService
  h.transport.patchService = async (ownerProfile, request, mask) => {
    assert.deepEqual(Object.keys(request).sort(), ['etag', 'name', 'template'])
    return patch(ownerProfile, request, mask)
  }
  const result = await executeRecoveryOperation({ profile, sourceRevision,
    archive: Buffer.from('official-source-archive'), sourceProof, transport: h.transport })
  assert.equal(result.status, 'PASS')
  assert.deepEqual(h.service().scaling, { scalingMode: 'MANUAL', manualInstanceCount: 0 })
  assert.equal(h.service().traffic[0].revision, oldRevision)
  assert.equal(h.service().trafficStatuses.some(row => row.tag), false)
  assert.deepEqual(h.calls, ['source', 'build', 'artifact', 'scan', 'revision', 'receipt'])
})

test('nonzero or unspecified manual capacity cannot enter recovery mutation', async () => {
  for (const manualInstanceCount of [1, '1', -1, null, undefined, NaN]) {
    const h = harness({ scalingMode: 'MANUAL', manualInstanceCount })
    await assert.rejects(executeRecoveryOperation({ profile, sourceRevision,
      archive: Buffer.from('source'), sourceProof, transport: h.transport }),
      /DEV057_RECOVERY_OPERATOR_REVISION_INPUT_INVALID/u)
    assert.deepEqual(h.calls, [])
  }
})

test('stopped recovery still rejects failed artifact policy before creating a revision', async () => {
  const h = harness({ scalingMode: 'MANUAL', manualInstanceCount: 0 })
  h.transport.waitArtifactEvidence = async () => { h.calls.push('scan'); throw new Error('ARTIFACT_POLICY_FAILED') }
  await assert.rejects(executeRecoveryOperation({ profile, sourceRevision,
    archive: Buffer.from('source'), sourceProof, transport: h.transport }), /ARTIFACT_POLICY_FAILED/u)
  assert.deepEqual(h.calls, ['source', 'build', 'artifact', 'scan'])
})

test('recovery readback rejects changed stopped capacity and publishes no proof', async () => {
  const h = harness({ scalingMode: 'MANUAL', manualInstanceCount: 0 })
  const patch = h.transport.patchService
  h.transport.patchService = async (...args) => {
    const result = await patch(...args)
    h.service().scaling.manualInstanceCount = 1
    return result
  }
  await assert.rejects(executeRecoveryOperation({ profile, sourceRevision,
    archive: Buffer.from('source'), sourceProof, transport: h.transport }),
    /DEV057_RECOVERY_OPERATOR_REVISION_READBACK_INVALID/u)
  assert.equal(h.calls.includes('receipt'), false)
})
