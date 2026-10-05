import { assertDev040ReleaseIntent } from './lib/dev040-orgmaster-independent-release.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { buildReleaseIntent, buildRuntimeConfigReceipt, buildSourceFreeze, parsePrerequisiteProducerArgs, resolveOwnerInputPath } from './lib/dev012-owner-prerequisite-producer.mjs'
import { sha256 } from './lib/dev012-owner-release-runtime.mjs'

const H40 = 'a'.repeat(40)
const H64 = 'b'.repeat(64)
const NOW = '2026-09-08T00:00:00.000Z'
const profile = {
  application: { id: 'platform', repository: 'owner/platform', branch: 'main' },
  target: { projectId: 'project', runtimeServiceAccount: 'runtime@project.iam.gserviceaccount.com', region: 'region' },
  artifact: { releaseBucket: 'owner-bucket', migrationRunnerUri: 'region.pkg.dev/project/repo/migration' },
  schemas: { releaseIntent: 'owner.intent.v2' },
  runtime: { containerName: 'app', cloudSqlProxyContainer: 'proxy', cloudSqlProxyImage: 'proxy@sha256:' + 'c'.repeat(64), port: 8080, cloudSqlProxyPort: 5432, concurrency: 20, timeoutSeconds: 60, maxInstances: 1, network: 'vpc', subnet: 'subnet', cpu: '1', memory: '512Mi', startupProbePath: '/ready', cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'project:region:instance' },
  environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'session-secret' } },
}
const ref = (name) => ({ uri: `gs://owner-bucket/receipts/releases/REL-001/${name}.json`, sha256: H64 })
const sourceLock = buildSourceFreeze({ profile, releaseId: 'REL-001', observedAt: NOW, git: { clean: true, branch: 'main', sourceRevision: H40, sourceTree: 'c'.repeat(40), remoteRevision: H40 }, sourceIdentityBytes: Buffer.from('tree-manifest'), migrationBundle: { bundle: { manifestSha256: H64 } } })

test('source freeze binds clean official remote revision, canonical tree identity and migration manifest', () => {
  assert.equal(sourceLock.status, 'SOURCE_FROZEN')
  assert.equal(sourceLock.releaseAuthority, true)
  assert.equal(sourceLock.sourceSha256, sha256(Buffer.from('tree-manifest')))
  assert.throws(() => buildSourceFreeze({ profile, releaseId: 'REL-001', observedAt: NOW, git: { ...sourceLock, clean: false }, sourceIdentityBytes: Buffer.from('tree-manifest'), migrationBundle: { bundle: { manifestSha256: H64 } } }), /SOURCE_FREEZE_INPUT_INVALID/)
})

test('runtime receipt contains a complete immutable two-container template without secret bytes', () => {
  const receipt = buildRuntimeConfigReceipt({ profile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  assert.equal(receipt.runtimeConfig.template.containers.length, 2)
  assert.equal(receipt.runtimeConfig.template.containers[0].env[1].valueSource.secretKeyRef.version, '7')
  assert.equal(JSON.stringify(receipt).includes('secret-value'), false)
})

test('release intent accepts only owner refs and release-authority prerequisites', () => {
  const input = { baselineIntentRef: ref('baseline'), sourceLockRef: ref('source-lock'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), previousRevision: 'platform-00001-old', deadlineAt: '2999-01-01T00:00:00.000Z' }
  const runtime = buildRuntimeConfigReceipt({ profile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  const common = { releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', status: 'PASS', projectId: 'project' }
  const values = { sourceLock, authorization: { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }, readiness: { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }, foundation: { ...common, ownerApplicationId: 'shared-foundation', sourceRevision: 'f'.repeat(40) }, infra: { ...common, migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64) }, runtimeConfig: runtime }
  const intent = buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: values, validateIntent: () => true })
  assert.equal(intent.sourceRevision, H40)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: { ...values, runtimeConfig: { ...values.runtimeConfig, ownerApplicationId: 'sibling' } }, validateIntent: () => true }), /PREREQUISITE_OWNER_MISMATCH/)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: { ...values, runtimeConfig: { ...values.runtimeConfig, sourceRevision: 'f'.repeat(40) } }, validateIntent: () => true }), /PREREQUISITE_SOURCE_MISMATCH/)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input: { ...input, foundationReceiptRef: { ...ref('foundation'), uri: 'gs://sibling/receipts/foundation.json' } }, sourceLock, prerequisiteValues: values, validateIntent: () => true }), /PREREQUISITE_REF_INVALID/)
})

test('release intent requires a prior baseline, not initialization data or principal refs', () => {
  const orgProfile = profile
  const input = { baselineIntentRef: ref('baseline'), sourceLockRef: ref('source-lock'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), previousRevision: 'orgmaster-prod-00001-old', deadlineAt: '2999-01-01T00:00:00.000Z' }
  const runtime = buildRuntimeConfigReceipt({ profile: orgProfile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  const common = { releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', status: 'PASS', projectId: 'project' }
  const readiness = { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }
  const values = { sourceLock, authorization: { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }, readiness, foundation: { ...common, ownerApplicationId: 'shared-foundation', sourceRevision: 'f'.repeat(40) }, infra: { ...common, migrationRunnerDigest: orgProfile.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64) }, runtimeConfig: runtime }
  assert.equal(buildReleaseIntent({ profile: orgProfile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: values, validateIntent: () => true }).sourceRevision, H40)
  assert.throws(() => buildReleaseIntent({ profile: orgProfile, releaseId: 'REL-001', input: { ...input, baselineIntentRef: undefined }, sourceLock, prerequisiteValues: values, validateIntent: () => true }), /RELEASE_BASELINE_REQUIRED/)
})

test('CLI has an exact four-stage input surface including source-bound infra reuse', () => {
  assert.deepEqual(parsePrerequisiteProducerArgs(['--stage', 'source-freeze', '--release-id', 'REL-001']), { stage: 'source-freeze', releaseId: 'REL-001', inputPath: null })
  assert.throws(() => parsePrerequisiteProducerArgs(['--stage', 'release-intent', '--release-id', 'REL-001']), /INVALID_ARGUMENTS/)
  assert.equal(parsePrerequisiteProducerArgs(['--stage', 'infra-reuse', '--release-id', 'REL-001', '--input', 'output/dev-012/inputs/reuse.json']).stage, 'infra-reuse')
  assert.equal(resolveOwnerInputPath('/owner', 'output/dev-012/inputs/runtime.json').endsWith(['owner', 'output', 'dev-012', 'inputs', 'runtime.json'].join(path.sep)), true)
  assert.throws(() => resolveOwnerInputPath('/owner', '../sibling/secret.json'), /INPUT_PATH_OUT_OF_SCOPE/)
})

test('orgmaster intent producer preserves maintenance recovery for its real consumer', () => {
  const p = { ...profile, application: { ...profile.application, id: 'orgmaster' },
    schemas: { releaseIntent: 'jenfu.dev040.orgmaster-release-intent.v2' } }
  const lock = { ...sourceLock, ownerApplicationId: 'orgmaster' }
  const input = { baselineIntentRef: ref('baseline'), sourceLockRef: ref('source-lock'), authorizationPolicyRef: ref('authorization'),
    readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'),
    runtimeConfigRef: ref('runtime'), previousRevision: 'orgmaster-prod-old', deadlineAt: '2999-01-01T00:00:00.000Z',
    principalOnlyRecovery: { revision: 'orgmaster-prod-recovery', serviceUid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5',
      imageDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:${H64}`,
      receiptRef: { uri: `gs://owner-bucket/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${H40}.json`, sha256: H64 } },
  }
  const common = { releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', status: 'PASS', projectId: 'project' }
  const authority = { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: input.deadlineAt }
  const values = { sourceLock: lock, authorization: authority, readiness: authority,
    foundation: { ...common, ownerApplicationId: 'shared-foundation', sourceRevision: 'f'.repeat(40) },
    infra: { ...common, migrationRunnerDigest: p.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64) },
    runtimeConfig: buildRuntimeConfigReceipt({ profile: p, releaseId: 'REL-001', sourceLock: lock,
      plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW }) }
  const produce = (changed = {}) => buildReleaseIntent({ profile: p, releaseId: 'REL-001',
    input: { ...input, ...changed }, sourceLock: lock, prerequisiteValues: values, validateIntent: assertDev040ReleaseIntent })
  const intent = produce()
  assert.deepEqual(intent.principalOnlyRecovery, input.principalOnlyRecovery)
  assert.notEqual(intent.principalOnlyRecovery, input.principalOnlyRecovery)
  for (const changed of [
    { principalOnlyRecovery: { ...input.principalOnlyRecovery, revision: input.previousRevision } },
    { principalOnlyRecovery: { ...input.principalOnlyRecovery, receiptRef: { ...input.principalOnlyRecovery.receiptRef, uri: 'gs://sibling/receipts/proof.json' } } },
  ]) assert.throws(() => produce(changed))
})
