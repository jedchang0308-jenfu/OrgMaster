import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createGitArchive, createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'
import { buildRuntimeConfig, canonicalize, releasePaths, resolvePlainEnvironment, sha256, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'
import { assertDev013ControlledMigrationAppend, assertDev013MigrationInfraReceipt, assertDev013PredecessorReceipt, assertDev014ActivationContractAppend, assertDev014ActivationContractRemediation, assertDev014ApplicationRegistrationAppend, assertDev014ContractMigrationAppend, assertDev014LoginFixtureCorrection, assertDev014ProjectionContractAppend, assertDev014ProjectionContractRemediation, assertRoutineMigrationUnchanged, assertRoutineRuntimeReadback, filterControlledInfrastructureTree, resolveRoutineControlBaseline, verifyRoutineRelease, releaseInfrastructureInputs } from './lib/dev040-routine-release.mjs'
import { dev013L4SequenceStep } from './lib/dev013-l4-transition-sequence.mjs'

const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json'))
const n1c = JSON.parse(fs.readFileSync('config/dev-010/n1c-orgmaster.json'))
const files = new Map(profile.migrations.entries.map((entry) => [entry.path, fs.readFileSync(entry.path)]))
const buildBundle = (revision) => buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, revision)
const oldSource = 'a'.repeat(40), newSource = 'b'.repeat(40)
const bucket = profile.artifact.releaseBucket
const oldBundle = buildBundle(oldSource), newBundle = buildBundle(newSource)
function prefixBundle(bundle, count) {
  const { manifestSha256: _manifestSha256, ...core } = bundle
  const value = { ...core, entries: bundle.entries.slice(0, count) }
  return { ...value, manifestSha256: sha256(canonicalize(value)) }
}
const legacyOldBundle = prefixBundle(oldBundle.bundle, 11)
const dev013OldBundle = prefixBundle(oldBundle.bundle, 15)
const dev013NewBundle = prefixBundle(newBundle.bundle, 15)
const dev014ContractBundle = prefixBundle(newBundle.bundle, 16)
const plain = resolvePlainEnvironment(profile, Object.fromEntries(profile.environment.requiredPlainEnvironmentNames
  .filter((name) => !Object.hasOwn(profile.environment.fixedValues, name) && !Object.hasOwn(profile.environment.controlledValues, name))
  .map((name) => [name, 'fixture-public-value'])))
const runtime = buildRuntimeConfig(profile, { plainEnvironment: plain, secretVersions: Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1'])) })

function harness({ baselineRuntime = runtime, nextRuntime = runtime, baselineBundle = oldBundle.bundle, currentBundle = newBundle } = {}) {
  const objects = new Map()
  function put(uri, value) { const bytes = Buffer.from(`${canonicalize(value)}\n`); const result = { bytes, ref: { uri, sha256: sha256(bytes) }, value }; objects.set(uri, result); return result.ref }
  const receipt = (name, value) => put(`gs://${bucket}/receipts/fixture/${name}.json`, value)
  const previousRevision = 'orgmaster-prod-aaaaaaaaaaaa'
  const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
  const oldIntent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'orgmaster', releaseId: 'ROUTINE-BASELINE', sourceRevision: oldSource, sourceSha256: 'e'.repeat(64), sourceLockRef: receipt('source', {}), authorizationPolicyRef: receipt('auth', {}), readinessReceiptRef: receipt('ready', {}), foundationReceiptRef: receipt('foundation', {}), infraReceiptRef: receipt('infra', {}), runtimeConfigRef: receipt('runtime', { runtimeConfig: baselineRuntime }), migrationManifestSha256: baselineBundle.manifestSha256, previousRevision: 'old-revision', deadlineAt: '2020-01-01T00:00:00Z' }
  // A prior release's expiry must not invalidate its historical evidence.
  const baselineIntentRef = receipt('intent', oldIntent)
  const paths = releasePaths(profile, oldIntent, baselineIntentRef.sha256)
  const bundleRef = put(`gs://${bucket}/source/migration-bundles/fixture.json`, baselineBundle)
  const deploymentRef = put(paths.deployment, { sourceRevision: oldSource, releaseIntentRef: baselineIntentRef, migrationBundleRef: bundleRef, artifactDigest })
  const migrationRef = put(paths.migrate, { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision: oldSource, manifestSha256: baselineBundle.manifestSha256, status: 'PASS', boundaryStatus: 'PASS' })
  const seal = (stage, facts) => stageReceipt({ profile, intent: oldIntent, stage, facts, observedAt: '2020-01-01T00:00:00Z' })
  put(paths.candidate, seal('candidate', { deploymentCapsuleRef: deploymentRef, migrationReceiptRef: migrationRef, candidateRevision: previousRevision }))
  put(paths.terminal, seal('terminal', { result: 'RELEASED', remainingHumanAction: 0, candidateRevision: previousRevision, artifactDigest }))
  const revision = { ...structuredClone(baselineRuntime.template), containers: structuredClone(baselineRuntime.template.containers) }
  revision.containers[0].image = artifactDigest
  const service = { traffic: [{ revision: previousRevision, percent: 100 }], trafficStatuses: [{ revision: previousRevision, percent: 100 }] }
  const transport = { async readBytes(uri) { if (!objects.has(uri)) throw new Error('MISSING'); return objects.get(uri) }, async readJson(ref) { const result = await this.readBytes(ref.uri); assert.equal(ref.sha256, result.ref.sha256); return result }, effectiveRevision: () => previousRevision, assertServiceSettled() {}, assertCanonicalEntrypoint() {}, assertRevisionReady(_profile, value, digest) { assert.equal(value.containers[0].image, digest) }, async getRevision() { return revision } }
  const intent = { ...oldIntent, releaseId: 'ROUTINE-NEXT', sourceRevision: newSource, previousRevision, baselineIntentRef, migrationManifestSha256: currentBundle.bundle.manifestSha256 }
  const authority = { ownerApplicationId: 'orgmaster', sourceRevision: newSource, releaseId: intent.releaseId, baselineIntentRef }
  const values = { runtimeConfig: { runtimeConfig: structuredClone(nextRuntime) }, authorization: { ...authority }, readiness: { ...authority } }
  const input = { root: '.', profile, transport, intent, values, service, buildMigrationBundle: async () => currentBundle, fingerprint: () => 'f'.repeat(64), transitionFingerprint: () => 't'.repeat(64) }
  return { input, objects, paths, put, revision }
}

function transitionReadiness(h, { from, to, action }) {
  const previousControlledEnvironment = { ORGMASTER_JENFU_SSO_HANDOFF_MODE: from }
  const controlledEnvironment = { ORGMASTER_JENFU_SSO_HANDOFF_MODE: to }
  const transition = { field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from, to, action, predecessorReceiptRef: { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/predecessor.json', sha256: '9'.repeat(64) } }
  const sequenceStep = dev013L4SequenceStep('orgmaster', transition, previousControlledEnvironment, controlledEnvironment)
  h.input.values.authorization = {
    ...h.input.values.authorization,
    schemaVersion: 'jenfu.dev013.l4-owner-transition-authorization.v1',
    authorizationBasis: 'OPERATOR_INVOKED_DEV013_L4',
    observedAt: '2026-09-18T00:00:00.000Z',
    expiresAt: '2026-09-18T08:00:00.000Z',
  }
  h.input.values.readiness = {
    ...h.input.values.readiness,
    schemaVersion: 'jenfu.dev013.l4-owner-transition-readiness.v2',
    devId: 'DEV-013',
    slice: '013-R1',
    observedAt: '2026-09-18T00:00:00.000Z',
    expiresAt: '2026-09-18T08:00:00.000Z',
    sequenceRoot: { schemaVersion: 'jenfu.dev013.l4-sequence-root.v2', authorizationId: 'DEV013-L4-AUTH-TEST0001', authorizationStatementSha256: '7'.repeat(64), manifestSha256: '8'.repeat(64), authorizedAt: '2026-09-18T00:00:00.000Z', expiresAt: '2026-09-18T08:00:00.000Z', receiptRef: { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/root.json', sha256: '8'.repeat(64) } },
    sequenceStep,
    previousControlledEnvironment,
    controlledEnvironment,
    transition,
  }
}

function attachForwardInfra(h, sourceRevision = newSource) {
  const core = { schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'orgmaster', sourceRevision, projectId: profile.target.projectId, region: profile.target.region, migrationRunnerDigest: `${profile.artifact.migrationRunnerUri}@sha256:${'4'.repeat(64)}`, status: 'APPLIED', releaseAuthority: true }
  const value = { ...core, receiptSha256: sha256(canonicalize(core)) }
  const ref = h.put(`gs://${bucket}/receipts/fixture/forward-infra.json`, value)
  h.input.intent.infraReceiptRef = ref
  h.input.values.infra = value
  return value
}

test('controlled infrastructure fingerprint excludes only the source-bound migration runner Dockerfile', () => {
  const runner = `100644 blob ${'a'.repeat(40)}\tinfra/google-cloud/dev-040-production-release/migration-runner.Dockerfile`
  const terraform = `100644 blob ${'b'.repeat(40)}\tinfra/google-cloud/dev-040-production-release/migration.tf`
  const filtered = filterControlledInfrastructureTree(Buffer.from(`${runner}\0${terraform}\0`)).toString('utf8')
  assert.equal(filtered, `${terraform}\0`)
  const changedTerraform = `100644 blob ${'c'.repeat(40)}\tinfra/google-cloud/dev-040-production-release/migration.tf`
  assert.notEqual(
    filterControlledInfrastructureTree(Buffer.from(`${runner}\0${terraform}\0`)).toString('utf8'),
    filterControlledInfrastructureTree(Buffer.from(`${runner}\0${changedTerraform}\0`)).toString('utf8'),
  )
})

test('routine release reuses unchanged SQL and infrastructure with no bootstrap or live DDL', async () => {
  const h = harness()
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.liveLedgerRead, false)
  assert.equal(result.baselineMigrationRef.uri, h.paths.migrate)
  assert.equal(result.migrationInputsSha256, assertRoutineMigrationUnchanged(oldBundle.bundle, newBundle.bundle))
  assert.equal(result.releaseMode, 'ROUTINE_UNCHANGED_RUNTIME')
})

test('DEV-013 controlled release permits only the sealed off-to-on handoff transition', async () => {
  const enabledPlain = resolvePlainEnvironment(profile, runtime.plainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const enabledRuntime = buildRuntimeConfig(profile, { plainEnvironment: enabledPlain, secretVersions: runtime.secretVersions })
  const h = harness({ nextRuntime: enabledRuntime })
  transitionReadiness(h, { from: 'off', to: 'on', action: 'activate' })
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV013_CONTROLLED_ENVIRONMENT')
  assert.deepEqual(result.controlledTransition, { releaseMode: 'DEV013_CONTROLLED_ENVIRONMENT', field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from: 'off', to: 'on', action: 'activate', predecessorReceiptRef: h.input.values.readiness.transition.predecessorReceiptRef })
})

test('DEV-013 controlled release permits only the sealed 012-015 append before candidate', async () => {
  const enabledPlain = resolvePlainEnvironment(profile, runtime.plainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const enabledRuntime = buildRuntimeConfig(profile, { plainEnvironment: enabledPlain, secretVersions: runtime.secretVersions })
  const h = harness({ baselineRuntime: runtime, nextRuntime: enabledRuntime, baselineBundle: legacyOldBundle, currentBundle: { bundle: dev013NewBundle } })
  transitionReadiness(h, { from: 'off', to: 'on', action: 'activate' })
  const infra = attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 4)
  assert.deepEqual(assertDev013ControlledMigrationAppend(legacyOldBundle, dev013NewBundle).pendingMigrationCount, 4)
  const changed = structuredClone(dev013NewBundle)
  changed.entries[10].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev013ControlledMigrationAppend(legacyOldBundle, changed), /DEV013_MIGRATION_APPEND_INVALID/u)
  const changedAppend = structuredClone(dev013NewBundle)
  changedAppend.entries[14].sourceSha256 = '0'.repeat(64)
  assert.throws(() => assertDev013ControlledMigrationAppend(legacyOldBundle, changedAppend), /DEV013_MIGRATION_APPEND_INVALID/u)
  assert.equal(assertDev013MigrationInfraReceipt(infra, profile, newSource), infra)
  assert.throws(() => assertDev013MigrationInfraReceipt({ ...infra, sourceRevision: oldSource }, profile, newSource), /DEV013_MIGRATION_INFRA_RECEIPT_INVALID/u)
})

test('DEV-014 producer contract remediation permits only migration 016 with unchanged runtime', async () => {
  const h = harness({ baselineBundle: dev013OldBundle, currentBundle: { bundle: dev014ContractBundle } })
  const remediation = {
    kind: 'MANAGED_IDENTITY_LIFECYCLE_CONTRACT_COMPLETION',
    migrationVersion: 'dev014-orgmaster-016',
    contractVersion: 'jenfu.orgmaster-contract.managed-identity-lifecycle.v1',
    consumerApplicationId: 'platform',
  }
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-PRODUCER-CONTRACT', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-PRODUCER-CONTRACT', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_PRODUCER_CONTRACT_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev014ContractMigrationAppend(dev013OldBundle, dev014ContractBundle).pendingMigrationCount, 1)
  const drift = structuredClone(dev014ContractBundle)
  drift.entries[15].sourceSha256 = '0'.repeat(64)
  assert.throws(() => assertDev014ContractMigrationAppend(dev013OldBundle, drift), /DEV014_CONTRACT_MIGRATION_APPEND_INVALID/u)
})

test('DEV-014 application registration remediation permits only migration 017 with unchanged runtime', async () => {
  const migration017Bundle = prefixBundle(newBundle.bundle, 17)
  const h = harness({ baselineBundle: prefixBundle(oldBundle.bundle, 16), currentBundle: { bundle: migration017Bundle } })
  const remediation = {
    kind: 'MANAGED_IDENTITY_INVALIDATION_APPLICATION_REGISTRATION',
    migrationVersion: 'dev014-orgmaster-017',
    requiredApplications: ['ai-pdm', 'orgmaster', 'platform'],
    sourceIdFields: ['applicationId', 'id'],
  }
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-APPLICATION-REGISTRATION', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-APPLICATION-REGISTRATION', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_APPLICATION_REGISTRATION_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev014ApplicationRegistrationAppend(prefixBundle(oldBundle.bundle, 16), migration017Bundle).pendingMigrationCount, 1)
  const drift = structuredClone(migration017Bundle)
  drift.entries[16].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev014ApplicationRegistrationAppend(prefixBundle(oldBundle.bundle, 16), drift), /DEV014_APPLICATION_REGISTRATION_APPEND_INVALID/u)
})

test('DEV-014 activation contract remediation permits only migration 019 with unchanged runtime', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 18)
  const migration019Bundle = prefixBundle(newBundle.bundle, 19)
  const remediation = {
    kind: 'LOGIN_FIXTURE_EMPLOYEE_ACTIVATION_CONTRACT',
    migrationVersion: 'dev014-orgmaster-019',
    functionSignature: 'orgmaster_core.assert_employee_activation_v1(text,text)',
    viewSignature: 'orgmaster_core.v_current_workspace_employees_v1',
    employeeIds: ['01a0c82b-11c6-77ab-887f-58df9d243e63', '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'],
  }
  const h = harness({ baselineBundle, currentBundle: { bundle: migration019Bundle } })
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-LOGIN-FIXTURE-CONTRACT', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-LOGIN-FIXTURE-CONTRACT', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_ACTIVATION_CONTRACT_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev014ActivationContractAppend(baselineBundle, migration019Bundle).pendingMigrationCount, 1)
  assert.equal(assertDev014ActivationContractRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(migration019Bundle)
  drift.entries[18].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev014ActivationContractAppend(baselineBundle, drift), /DEV014_ACTIVATION_CONTRACT_APPEND_INVALID/u)
})

test('DEV-014 projection contract remediation permits only migration 020 with unchanged runtime', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 19)
  const remediation = {
    kind: 'CURRENT_PROJECTION_CONTRACT_CORRECTION',
    migrationVersion: 'dev014-orgmaster-020',
    contractViews: [
      'orgmaster_contract.v_ai_pdm_entitlement_authority_v1',
      'orgmaster_contract.v_ai_pdm_effective_role_assignments_v1',
      'orgmaster_contract.v_portal_app_visibility_v1',
    ],
    applicationId: 'ai-pdm',
  }
  const h = harness({ baselineBundle })
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-PROJECTION-CONTRACT', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-PROJECTION-CONTRACT', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_PROJECTION_CONTRACT_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev014ProjectionContractAppend(baselineBundle, newBundle.bundle).pendingMigrationCount, 1)
  assert.equal(assertDev014ProjectionContractRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(newBundle.bundle)
  drift.entries[19].sourceSha256 = '0'.repeat(64)
  assert.throws(() => assertDev014ProjectionContractAppend(baselineBundle, drift), /DEV014_PROJECTION_CONTRACT_APPEND_INVALID/u)
})

test('DEV-014 activation contract owner producer exposes the bounded release mode', () => {
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev014-activation-contract-remediation/u)
  assert.match(producer, /slice: '014-LOGIN-FIXTURE-CONTRACT'/u)
  assert.match(producer, /kind: 'LOGIN_FIXTURE_EMPLOYEE_ACTIVATION_CONTRACT'/u)
  assert.match(producer, /migrationVersion: 'dev014-orgmaster-019'/u)
  assert.match(producer, /functionSignature: 'orgmaster_core\.assert_employee_activation_v1\(text,text\)'/u)
  assert.match(producer, /viewSignature: 'orgmaster_core\.v_current_workspace_employees_v1'/u)
})

test('DEV-014 projection contract owner producer exposes the bounded release mode', () => {
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev014-projection-contract-remediation/u)
  assert.match(producer, /slice: '014-PROJECTION-CONTRACT'/u)
  assert.match(producer, /kind: 'CURRENT_PROJECTION_CONTRACT_CORRECTION'/u)
  assert.match(producer, /migrationVersion: 'dev014-orgmaster-020'/u)
  assert.match(producer, /orgmaster_contract\.v_ai_pdm_effective_role_assignments_v1/u)
})

test('DEV-014 login-fixture correction reuses only an exact prior-source infrastructure fingerprint', async () => {
  const correction = {
    kind: 'LOGIN_FIXTURE_ACTIVATION_CONTRACT_CORRECTION',
    applicationId: 'ai-pdm',
    employeeIds: ['01a0c82b-11c6-77ab-887f-58df9d243e63', '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'],
    infrastructureBinding: 'EXACT_RECEIPT_SOURCE_FINGERPRINT',
  }
  const h = harness()
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-LOGIN-FIXTURE-CORRECTION', correction }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-LOGIN-FIXTURE-CORRECTION', correction }
  attachForwardInfra(h, oldSource)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_LOGIN_FIXTURE_CORRECTION')
  assert.equal(result.migrationDisposition, 'UNCHANGED_VERIFIED')
  assert.equal(assertDev014LoginFixtureCorrection(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)

  const drift = harness()
  drift.input.values.authorization = h.input.values.authorization
  drift.input.values.readiness = h.input.values.readiness
  attachForwardInfra(drift, oldSource)
  drift.input.fingerprint = (_root, revision) => revision
  await assert.rejects(() => verifyRoutineRelease(drift.input), /ROUTINE_INFRA_CHANGED/u)
})

test('DEV-013 controlled release can add the default-off guard to the historical production runtime', async () => {
  const legacyProfile = structuredClone(profile)
  legacyProfile.environment.requiredPlainEnvironmentNames = legacyProfile.environment.requiredPlainEnvironmentNames.filter((name) => !['ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'ORGMASTER_JENFU_SSO_BROKER_ORIGIN'].includes(name))
  delete legacyProfile.environment.fixedValues.ORGMASTER_JENFU_SSO_BROKER_ORIGIN
  delete legacyProfile.environment.controlledValues
  const legacyPlain = Object.fromEntries(Object.entries(runtime.plainEnvironment).filter(([name]) => legacyProfile.environment.requiredPlainEnvironmentNames.includes(name)))
  const legacyRuntime = buildRuntimeConfig(legacyProfile, { plainEnvironment: legacyPlain, secretVersions: runtime.secretVersions })
  const h = harness({ baselineRuntime: legacyRuntime })
  transitionReadiness(h, { from: null, to: 'off', action: 'guard' })
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.controlledTransition.action, 'guard')
})

test('DEV-014 protected release permits only the exact managed Directory runtime activation with fresh runner provenance', async () => {
  const fields = [
    'ORGMASTER_MANAGED_IDENTITY_ENABLED',
    'ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID',
    'ORGMASTER_GOOGLE_DIRECTORY_DOMAIN',
    'ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT',
    'ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL',
    'ORGMASTER_PLATFORM_LOGIN_CALLER_EMAIL',
    'ORGMASTER_PLATFORM_LOGIN_CALLER_SUBJECT',
  ]
  const legacyProfile = structuredClone(profile)
  legacyProfile.environment.requiredPlainEnvironmentNames = legacyProfile.environment.requiredPlainEnvironmentNames.filter((name) => !fields.includes(name))
  for (const name of fields) delete legacyProfile.environment.fixedValues[name]
  const legacyPlain = Object.fromEntries(Object.entries(runtime.plainEnvironment).filter(([name]) => legacyProfile.environment.requiredPlainEnvironmentNames.includes(name)))
  const legacyRuntime = buildRuntimeConfig(legacyProfile, { plainEnvironment: legacyPlain, secretVersions: runtime.secretVersions })
  const h = harness({ baselineRuntime: legacyRuntime })
  const activation = { kind: 'MANAGED_DIRECTORY_RUNTIME_ACTIVATION', addedPlainEnvironmentNames: fields, directoryScope: 'https://www.googleapis.com/auth/admin.directory.user.readonly' }
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-LOGIN', activation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-LOGIN', activation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_MANAGED_DIRECTORY_ACTIVATION')
  assert.equal(result.migrationDisposition, 'UNCHANGED_VERIFIED')
  const drift = harness({ baselineRuntime: legacyRuntime, nextRuntime: structuredClone(runtime) })
  drift.input.values.runtimeConfig.runtimeConfig.plainEnvironment.ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID = 'wrong'
  drift.input.values.authorization = h.input.values.authorization
  drift.input.values.readiness = h.input.values.readiness
  attachForwardInfra(drift)
  await assert.rejects(() => verifyRoutineRelease(drift.input), /DEV014_RUNTIME_ACTIVATION_INVALID/u)
})

test('DEV-013 predecessor receipt accepts only an exact live root or released owner terminal', () => {
  const ref = { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/root.json', sha256: '9'.repeat(64) }
  const rootCore = { schemaVersion: 'jenfu.dev013.l4-execution-authorization.v2', devId: 'DEV-013', slice: '013-R1', authorizationId: 'DEV013-L4-AUTH-TEST0001', authorizationBasis: 'HUMAN_PRODUCTION_SCOPE', authorizationStatementSha256: '7'.repeat(64), manifestSha256: '8'.repeat(64), projectId: profile.target.projectId, projectNumber: '9536592944', region: profile.target.region, cloudSqlInstance: 'jenfu-platform-prod-pg', database: 'jenfu_prod', authorizedActions: ['owner-native release', 'Platform migration 005', 'runtime config', 'candidate', 'traffic', 'L4 browser', 'global logout', 'rollback', 'observation'], forbiddenMutations: ['retained edge', 'Billing', 'custom domain', 'Firebase Hosting', 'shared load balancer', 'sibling owner state', 'database down migration', 'service deletion'], status: 'PASS', releaseAuthority: true, remainingHumanAction: 0, evidenceScope: 'PRODUCTION_BOUND', authorizedAt: '2026-09-18T00:00:00.000Z', expiresAt: '2026-09-18T08:00:00.000Z' }
  const root = { ...rootCore, receiptSha256: sha256(canonicalize(rootCore)) }
  const platformProfile = { ...profile, application: { ...profile.application, id: 'platform' } }
  const transition = { action: 'guard', changes: [{ field: 'PORTAL_SSO_AI_PDM_PHASE', from: null, to: 'off' }, { field: 'PORTAL_SSO_ORGMASTER_PHASE', from: null, to: 'off' }], predecessorReceiptRef: ref }
  const currentStep = dev013L4SequenceStep('platform', transition, { PORTAL_SSO_AI_PDM_PHASE: null, PORTAL_SSO_ORGMASTER_PHASE: null }, { PORTAL_SSO_AI_PDM_PHASE: 'off', PORTAL_SSO_ORGMASTER_PHASE: 'off' })
  assert.equal(assertDev013PredecessorReceipt(root, ref, platformProfile, '2026-09-18T00:00:00.000Z', currentStep).schemaVersion, root.schemaVersion)
  const sourceBoundRootCore = { ...rootCore, sourceRevisionByApplication: { platform: 'a'.repeat(40), orgmaster: 'b'.repeat(40), 'ai-pdm': 'c'.repeat(40) } }
  const sourceBoundRoot = { ...sourceBoundRootCore, receiptSha256: sha256(canonicalize(sourceBoundRootCore)) }
  assert.throws(() => assertDev013PredecessorReceipt(sourceBoundRoot, ref, platformProfile, '2026-09-18T00:00:00.000Z', currentStep), /DEV013_PREDECESSOR_RECEIPT_INVALID/u)
  const wrongProjectCore = { ...rootCore, projectId: 'wrong-project' }
  const wrongProject = { ...wrongProjectCore, receiptSha256: sha256(canonicalize(wrongProjectCore)) }
  assert.throws(() => assertDev013PredecessorReceipt(wrongProject, ref, platformProfile, '2026-09-18T00:00:00.000Z', currentStep), /DEV013_PREDECESSOR_RECEIPT_INVALID/u)
})

test('DEV-013 controlled release rejects an unbound readiness receipt or unrelated runtime drift', async () => {
  const enabledPlain = resolvePlainEnvironment(profile, runtime.plainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const enabledRuntime = buildRuntimeConfig(profile, { plainEnvironment: enabledPlain, secretVersions: runtime.secretVersions })
  const missing = harness({ nextRuntime: enabledRuntime })
  await assert.rejects(() => verifyRoutineRelease(missing.input), /DEV013_CONTROLLED_TRANSITION_AUTHORITY_INVALID/u)
  const secretDrift = harness({ nextRuntime: structuredClone(enabledRuntime) })
  secretDrift.input.values.runtimeConfig.runtimeConfig.secretVersions.ORGMASTER_POSTGRES_URL = '2'
  transitionReadiness(secretDrift, { from: 'off', to: 'on', action: 'activate' })
  await assert.rejects(() => verifyRoutineRelease(secretDrift.input), /ROUTINE_RUNTIME_CHANGED/u)
})

test('infrastructure identity ignores retired bootstrap metadata but covers every remaining input', () => {
  assert.deepEqual(releaseInfrastructureInputs({ ...profile, productionData: { required: true } }), profile)
  for (const field of ['runtime', 'target', 'identities', 'migrations', 'unknownFutureInput']) {
    assert.notEqual(canonicalize(releaseInfrastructureInputs({ ...profile, [field]: 'changed' })), canonicalize(profile))
  }
})

test('successive source releases reuse the latest sealed baseline without initialization authority', async () => {
  const h = harness()
  const first = await verifyRoutineRelease(h.input)
  const intent = h.input.intent
  const ref = h.put(`gs://${bucket}/receipts/second/intent.json`, intent)
  const paths = releasePaths(profile, intent, ref.sha256)
  const artifactDigest = h.revision.containers[0].image
  const revision = intent.previousRevision
  const bundleRef = h.put(`gs://${bucket}/source/migration-bundles/second.json`, newBundle.bundle)
  const deploymentRef = h.put(paths.deployment, { sourceRevision: intent.sourceRevision, releaseIntentRef: ref, migrationBundleRef: bundleRef, artifactDigest })
  const seal = (stage, facts) => stageReceipt({ profile, intent, stage, facts, observedAt: '2026-09-16T00:00:00Z' })
  const migrationRef = h.put(paths.migrate, seal('migrate', { ...first, disposition: 'UNCHANGED_VERIFIED', manifestSha256: intent.migrationManifestSha256 }))
  h.put(paths.candidate, seal('candidate', { deploymentCapsuleRef: deploymentRef, migrationReceiptRef: migrationRef, candidateRevision: revision }))
  h.put(paths.terminal, seal('terminal', { result: 'RELEASED', remainingHumanAction: 0, candidateRevision: revision, artifactDigest }))
  const sourceRevision = 'c'.repeat(40)
  const nextBundle = buildBundle(sourceRevision)
  h.input.intent = { ...intent, releaseId: 'ROUTINE-THIRD', sourceRevision, baselineIntentRef: ref, migrationManifestSha256: nextBundle.bundle.manifestSha256 }
  h.input.buildMigrationBundle = async () => nextBundle
  for (const name of ['authorization', 'readiness']) h.input.values[name] = { ...h.input.values[name], sourceRevision, releaseId: 'ROUTINE-THIRD', baselineIntentRef: ref }
  const second = await verifyRoutineRelease(h.input)
  assert.equal(second.liveLedgerRead, false)
  assert.deepEqual(second.baselineIntentRef, ref)
  assert.equal(second.migrationInputsSha256, first.migrationInputsSha256)
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

test('a finalized failed attempt resolves only its sealed original production baseline', async () => {
  const h = harness()
  const attemptRef = h.put(`gs://${bucket}/receipts/failed-attempt.json`, h.input.intent)
  const attempt = h.objects.get(attemptRef.uri)
  const paths = releasePaths(profile, attempt.value, attemptRef.sha256)
  const core = { ownerApplicationId: 'orgmaster', service: profile.target.serviceName, state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED', releaseId: attempt.value.releaseId, sourceRevision: attempt.value.sourceRevision }
  const control = { ...core, controlSha256: sha256(canonicalize(core)) }
  const terminal = stageReceipt({ profile, intent: attempt.value, stage: 'terminal', facts: { result: core.result, previousRevision: attempt.value.previousRevision }, observedAt: '2026-09-16T00:00:00Z' })
  h.put(paths.terminal, terminal)
  assert.deepEqual(await resolveRoutineControlBaseline({ profile, transport: h.input.transport, control, attempt }), attempt.value.baselineIntentRef)
  h.objects.delete(paths.terminal)
  await assert.rejects(() => resolveRoutineControlBaseline({ profile, transport: h.input.transport, control, attempt }), /MISSING/)
  await assert.rejects(() => resolveRoutineControlBaseline({ profile, transport: h.input.transport, control: { ...control, state: 'ACTIVE' }, attempt }), /ROUTINE_CONTROL_NOT_FINALIZED/)
})
