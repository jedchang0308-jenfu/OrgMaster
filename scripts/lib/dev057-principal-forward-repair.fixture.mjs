import assert from 'node:assert/strict'
import { buildRuntimeConfig, canonicalize, releasePaths, sha256, stageReceipt } from './dev012-owner-release-runtime.mjs'

export function createPrincipalOnlyRepairFixture() {
  const bucket = 'jenfu-platform-prod-orgmaster-release'
  const serviceName = 'orgmaster-prod'
  const prefix = `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release`
  const profile = { application: { id: 'orgmaster', repository: 'jedchang0308-jenfu/OrgMaster' },
    artifact: { releaseBucket: bucket, uri: `${prefix}/orgmaster` },
    target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName, runtimeServiceAccount: 'runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
    runtime: { containerName: 'orgmaster', cloudSqlProxyContainer: 'proxy', cloudSqlProxyImage: 'proxy@sha256:' + 'c'.repeat(64), port: 8080, cloudSqlProxyPort: 5432, concurrency: 20, timeoutSeconds: 60, maxInstances: 1, poolMax: 4 },
    environment: { requiredPlainEnvironmentNames: ['NODE_ENV', 'AUTH_MODE'], fixedValues: { NODE_ENV: 'production' },
      controlledValues: { AUTH_MODE: { defaultValue: 'principal', allowedValues: ['principal'] } },
      requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'own-secret' } } }
  const runtime = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production', AUTH_MODE: 'principal' }, secretVersions: { SESSION_SECRET: '7' } })
  const source = 'a'.repeat(40), old = `${serviceName}-previous`, recovery = `${serviceName}-recovery`, candidate = `${serviceName}-candidate`
  const uid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
  const image = `${prefix}/orgmaster-recovery@sha256:${'d'.repeat(64)}`
  const objects = new Map()
  const put = (uri, value) => {
    const bytes = Buffer.from(canonicalize(value) + '\n')
    const row = { ref: { uri, sha256: sha256(bytes) }, bytes, value }
    objects.set(uri, row); return row
  }
  const proof = put(`gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${source}.json`, {
    schemaVersion: 'orgmaster.principal-only-recovery.v1', sourceRevision: source, projectId: 'jenfu-platform-prod',
    region: 'asia-east1', service: serviceName, serviceUid: uid, oldRevision: old, recoveryRevision: recovery, imageDigest: image, status: 'PASS',
  })
  const runtimeRow = put(`gs://${bucket}/receipts/runtime.json`, { runtimeConfig: runtime })
  const intent = { ownerApplicationId: profile.application.id, releaseId: 'DEV057-FAILED-RELEASE', sourceRevision: source, previousRevision: old,
    sourceLockRef: { uri: `gs://${bucket}/receipts/source-lock.json`, sha256: 'e'.repeat(64) },
    runtimeConfigRef: runtimeRow.ref, migrationManifestSha256: 'f'.repeat(64),
    principalOnlyRecovery: { revision: recovery, imageDigest: image, serviceUid: uid, receiptRef: proof.ref },

  }
  const baseline = put(`gs://${bucket}/receipts/releases/${intent.releaseId}/release-intent.json`, intent)
  const paths = releasePaths(profile, intent, baseline.ref.sha256)
  const seal = (stage, facts, previousReceiptRef = null) => put(paths[stage], stageReceipt({ profile, intent, stage,
    facts, previousReceiptRef, observedAt: '2026-09-30T00:00:00Z' }))
  const deployment = put(paths.deployment, { sourceRevision: source, releaseIntentRef: baseline.ref, artifactDigest: `${profile.artifact.uri}@sha256:${'1'.repeat(64)}` })
  const migration = seal('migrate', { disposition: 'UNCHANGED_VERIFIED', manifestSha256: intent.migrationManifestSha256 })
  seal('candidate', { candidateRevision: candidate, artifactDigest: deployment.value.artifactDigest,
    deploymentCapsuleRef: deployment.ref, migrationReceiptRef: migration.ref })
  const rollback = seal('rollback', { result: 'ROLLED_BACK', previousRevision: recovery, databaseDisposition: 'FORWARD_APPLIED' })
  seal('terminal', { result: 'ROLLED_BACK', previousRevision: recovery, databaseDisposition: 'FORWARD_APPLIED' }, rollback.ref)
  const controlCore = { inputFingerprint: '3'.repeat(64), leaseExpiresAt: '2026-09-30T00:02:00Z', deadlineAt: '2026-09-30T04:00:00Z', schemaVersion: 'jenfu.dev012.owner-control-head.v1', state: 'FINALIZED', result: 'ROLLED_BACK',
    ownerApplicationId: profile.application.id, service: serviceName, controlBucket: bucket, releaseId: intent.releaseId,
    sourceRevision: source, sourceLockSha256: intent.sourceLockRef.sha256, previousRevision: recovery, candidateRevision: candidate,
    ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/42` }
  const control = { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) }
  put(paths.control, control)
  const service = { name: `projects/jenfu-platform-prod/locations/asia-east1/services/${serviceName}`,
    uid, generation: '2', observedGeneration: '2', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    traffic: [{ revision: recovery, percent: 100 }], trafficStatuses: [{ revision: recovery, percent: 100 }] }
  const revision = { name: `${service.name}/revisions/${recovery}`, containers: [{ name: profile.runtime.containerName, image }],
    conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  const run = { id: '42', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: source }
  const calls = []
  const transport = {
    async readBytes(uri) { if (!objects.has(uri)) throw new Error('MISSING'); return objects.get(uri) },
    async readJson(ref) { const row = await this.readBytes(ref.uri); assert.deepEqual(ref, row.ref); return row },
    async getService() { return service }, async getRevision(_profile, name) { calls.push(name); assert.equal(name, recovery); return revision },
    async readOwnerRun() { return run },
  }
  return { input: { profile, transport, baselineIntentRef: baseline.ref }, objects, put, seal, paths,
    runtime, service, revision, run, intent, recovery, old, calls, controlCore }
}
