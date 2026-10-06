import { parseDeployProductionArgs, selectDeployInfrastructureRef, verifyDeployProductionRelease } from './dev040-deploy-production.mjs'
import { buildReauthReceipt, EXPECTED } from './lib/dev057-smoke-credential-reauth.mjs'
import { buildSmokeInfraReuseReceipt, expectedSmokeWorkflowSource, MAX_SMOKE_REUSE_CHAIN_DEPTH, smokeInfraTemplateProjection } from './lib/dev057-smoke-rotation-continuation.mjs'
import { buildSourceFreeze, executePrerequisiteProducer, parsePrerequisiteProducerArgs } from './lib/dev012-owner-prerequisite-producer.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertMigrationReceipt, createGitArchive, createGitSourceIdentity, executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'
import { buildRuntimeConfig, canonicalize, createOwnerTransport, releasePaths, resolvePlainEnvironment, sha256, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'
import { assertDev013ControlledMigrationAppend, assertDev013MigrationInfraReceipt, assertDev013PredecessorReceipt, assertDev014ActivationContractAppend, assertDev014ActivationContractRemediation, assertDev014ApplicationRegistrationAppend, assertDev014ContractMigrationAppend, assertDev014LoginFixtureCorrection, assertDev014ManagedPrincipalProjectionAppend, assertDev014ManagedPrincipalProjectionRemediation, assertDev014ProjectionContractAppend, assertDev014ProjectionContractRemediation, assertDev057CutoverInfraTransition, assertDev057PrincipalSmokeBlobTransition, assertDev057CatalogReadbackPackagingTransition, assertDev057PrincipalSmokeInfraTransition, assertDev057PrincipalSmokeProfileTransition, assertDev057WriterFenceAppend, assertDev057WriterFenceRemediation, assertRoutineMigrationUnchanged, assertRoutineRuntimeReadback, filterControlledInfrastructureTree, resolveRoutineControlBaseline, verifyRoutineRelease, releaseInfrastructureInputs, assertDev014LifecycleReplayInfra } from './lib/dev040-routine-release.mjs'
import { dev013L4SequenceStep } from './lib/dev013-l4-transition-sequence.mjs'
import { DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION, assertDev014PrincipalLifecycleV2Append, assertDev014PrincipalLifecycleV2Remediation, assertDev014PrincipalLifecycleRuntimeGuard } from './lib/dev014-principal-lifecycle-release.mjs'
import { DEV057_CUTOVER_SOURCE_REMEDIATION, DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_REMEDIATION, DEV057_PRINCIPAL_CONTRACT_REMEDIATION, DEV057_PRINCIPAL_GRANTS_V3_REMEDIATION, DEV057_PRINCIPAL_GRANTS_V4_REMEDIATION } from './lib/dev057-principal-contract-release.mjs'
import { assertDev057CutoverSourceAppend, assertDev057CutoverSourceRemediation, assertDev057EmployeeNumberCommandReceiptV2Append, assertDev057EmployeeNumberCommandReceiptV2Remediation, assertDev057PrincipalContractAppend, assertDev057PrincipalContractRemediation, assertDev057PrincipalGrantsV3Append, assertDev057PrincipalGrantsV3Remediation, assertDev057PrincipalGrantsV4Append, assertDev057PrincipalGrantsV4Remediation } from './lib/dev040-routine-release.mjs'

test('production runtime image includes every approved catalog read by governance', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8')
  const repository = fs.readFileSync('server/aiPdmRoleCatalogRepository.ts', 'utf8')
  const names = [...new Set([...repository.matchAll(/file:\s*'(ai-pdm-role-catalog\.v\d+\.json)'/gu)].map((match) => match[1]))]
  assert.ok(names.length > 0, 'approved source artifacts must be identifiable')
  const runnerStart = dockerfile.search(/^FROM scratch AS runner\s*$/mu)
  assert.ok(runnerStart >= 0, 'the final application stage must be identifiable')
  const runner = dockerfile.slice(runnerStart)
  for (const name of names) {
    const catalog = JSON.parse(fs.readFileSync(path.join('config/catalogs', name), 'utf8'))
    assert.equal(catalog.applicationId, 'ai-pdm')
    assert.equal(catalog.roles.length, 9)
    const escapedName = name.replaceAll('.', '\\.')
    assert.match(runner, new RegExp(`^COPY --from=builder --chown=65532:65532 /app/config/catalogs/${escapedName} \\./config/catalogs/${escapedName}$`, 'mu'))
  }
  assert.match(runner, /^COPY --from=builder --chown=65532:65532 \/app\/contracts \.\/contracts$/mu)
})

test('DEV-014 CLI check and prepare-only paths cannot invoke lifecycle service mutation or workflow dispatch', () => {
  const source = fs.readFileSync(new URL('./dev040-deploy-production.mjs', import.meta.url), 'utf8')
  const main = source.slice(source.indexOf('async function main()'))
  const checkReturn = main.indexOf('if (options.check) {')
  const prerequisiteReceiptWrites = main.indexOf("for (const [name, value] of [['source-lock'")
  const lifecycleGuard = main.indexOf('if (options.dev014PrincipalLifecycleV2Remediation && !options.prepareOnly)')
  const quiescenceCall = main.indexOf('await executePrincipalLifecycleQuiescence(')
  const workflowDispatch = main.indexOf("if (!options.prepareOnly) command('gh'")

  assert.ok(checkReturn >= 0 && checkReturn < prerequisiteReceiptWrites)
  assert.ok(prerequisiteReceiptWrites < quiescenceCall)
  assert.ok(lifecycleGuard >= 0 && lifecycleGuard < quiescenceCall)
  assert.ok(quiescenceCall < workflowDispatch)
  assert.match(main.slice(workflowDispatch), /if \(!options\.prepareOnly\) command\('gh'/u)
})

const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json'))
const n1c = JSON.parse(fs.readFileSync('config/dev-010/n1c-orgmaster.json'))
const historicalProfile = structuredClone(profile)
historicalProfile.environment.controlledValues.ORGMASTER_JENFU_SSO_HANDOFF_MODE = { defaultValue: 'off', allowedValues: ['off', 'on'] }
const historicalPlain = resolvePlainEnvironment(historicalProfile, Object.fromEntries(historicalProfile.environment.requiredPlainEnvironmentNames
  .filter((name) => !Object.hasOwn(historicalProfile.environment.fixedValues, name) && !Object.hasOwn(historicalProfile.environment.controlledValues, name))
  .map((name) => [name, 'fixture-public-value'])))
const historicalRuntime = buildRuntimeConfig(historicalProfile, { plainEnvironment: historicalPlain, secretVersions: Object.fromEntries(historicalProfile.environment.requiredSecretNames.map((name) => [name, '1'])) })

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

function harness({ baselineRuntime = runtime, nextRuntime = runtime, baselineBundle = oldBundle.bundle, currentBundle = newBundle, baselineInfra = {} } = {}) {
  const objects = new Map()
  function put(uri, value) { const bytes = Buffer.from(`${canonicalize(value)}\n`); const result = { bytes, ref: { uri, sha256: sha256(bytes) }, value }; objects.set(uri, result); return result.ref }
  const receipt = (name, value) => put(`gs://${bucket}/receipts/fixture/${name}.json`, value)
  const previousRevision = 'orgmaster-prod-aaaaaaaaaaaa'
  const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
  const oldIntent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'orgmaster', releaseId: 'ROUTINE-BASELINE', sourceRevision: oldSource, sourceSha256: 'e'.repeat(64), sourceLockRef: receipt('source', {}), authorizationPolicyRef: receipt('auth', {}), readinessReceiptRef: receipt('ready', {}), foundationReceiptRef: receipt('foundation', { ownerApplicationId: 'shared-foundation', projectId: profile.target.projectId, status: 'PASS', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER' }), infraReceiptRef: receipt('infra', baselineInfra), runtimeConfigRef: receipt('runtime', { runtimeConfig: baselineRuntime }), migrationManifestSha256: baselineBundle.manifestSha256, previousRevision: 'old-revision', deadlineAt: '2020-01-01T00:00:00Z' }
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
  const enabledPlain = resolvePlainEnvironment(historicalProfile, historicalRuntime.plainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const enabledRuntime = buildRuntimeConfig(historicalProfile, { plainEnvironment: enabledPlain, secretVersions: historicalRuntime.secretVersions })
  const h = harness({ baselineRuntime: historicalRuntime, nextRuntime: enabledRuntime })
  h.input.profile = historicalProfile
  transitionReadiness(h, { from: 'off', to: 'on', action: 'activate' })
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV013_CONTROLLED_ENVIRONMENT')
  assert.deepEqual(result.controlledTransition, { releaseMode: 'DEV013_CONTROLLED_ENVIRONMENT', field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from: 'off', to: 'on', action: 'activate', predecessorReceiptRef: h.input.values.readiness.transition.predecessorReceiptRef })
})

test('DEV-013 controlled release permits only the sealed 012-015 append before candidate', async () => {
  const enabledPlain = resolvePlainEnvironment(historicalProfile, historicalRuntime.plainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const enabledRuntime = buildRuntimeConfig(historicalProfile, { plainEnvironment: enabledPlain, secretVersions: historicalRuntime.secretVersions })
  const h = harness({ baselineRuntime: historicalRuntime, nextRuntime: enabledRuntime, baselineBundle: legacyOldBundle, currentBundle: { bundle: dev013NewBundle } })
  h.input.profile = historicalProfile
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
  const currentBundle = { bundle: prefixBundle(newBundle.bundle, 20) }
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
  const h = harness({ baselineBundle, currentBundle })
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-PROJECTION-CONTRACT', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-PROJECTION-CONTRACT', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_PROJECTION_CONTRACT_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev014ProjectionContractAppend(baselineBundle, currentBundle.bundle).pendingMigrationCount, 1)
  assert.equal(assertDev014ProjectionContractRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(currentBundle.bundle)
  drift.entries[19].sourceSha256 = '0'.repeat(64)
  assert.throws(() => assertDev014ProjectionContractAppend(baselineBundle, drift), /DEV014_PROJECTION_CONTRACT_APPEND_INVALID/u)
})

test('DEV-014 managed principal projection remediation permits only migrations 022-023 with unchanged runtime', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 21)
  const currentBundle = { bundle: prefixBundle(newBundle.bundle, 23) }
  const remediation = {
    kind: 'MANAGED_PRINCIPAL_PROJECTION_CONTRACT_CORRECTION',
    migrationVersions: ['dev014-orgmaster-022', 'dev014-orgmaster-023'],
    producerView: 'orgmaster_contract.v_active_principal_mappings_v1',
    adapterViews: ['orgmaster_contract.v_active_principal_accounts_v1'],
    applicationId: 'ai-pdm',
    employeeIds: ['01a0c82b-11c6-77ab-887f-58df9d243e63', '01a0c82b-372c-7d20-ba3b-6e3b892d2f63'],
  }
  const h = harness({ baselineBundle, currentBundle })
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-MANAGED-PRINCIPAL-PROJECTION', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-MANAGED-PRINCIPAL-PROJECTION', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_MANAGED_PRINCIPAL_PROJECTION_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 2)
  assert.equal(assertDev014ManagedPrincipalProjectionAppend(baselineBundle, currentBundle.bundle).pendingMigrationCount, 2)
  assert.equal(assertDev014ManagedPrincipalProjectionRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(currentBundle.bundle)
  drift.entries[21].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev014ManagedPrincipalProjectionAppend(baselineBundle, drift), /DEV014_MANAGED_PRINCIPAL_PROJECTION_APPEND_INVALID/u)
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

test('DEV-014 managed principal projection owner producer exposes both migrations and the canonical producer', () => {
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev014-managed-principal-projection-remediation/u)
  assert.match(producer, /slice: '014-MANAGED-PRINCIPAL-PROJECTION'/u)
  assert.match(producer, /migrationVersions: \['dev014-orgmaster-022', 'dev014-orgmaster-023'\]/u)
  assert.match(producer, /orgmaster_contract\.v_active_principal_mappings_v1/u)
})

test('DEV-057 writer fence remediation permits only migration 021 with unchanged runtime', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 20)
  const remediation = {
    kind: 'IDENTITY_GRANT_WRITER_FENCE',
    migrationVersion: 'dev057-orgmaster-021',
    contractViews: ['orgmaster_contract.v_active_principal_mappings_v1', 'orgmaster_contract.v_portal_app_visibility_v1'],
    serializationRow: 'orgmaster_core.managed_identity_admission_authority.singleton',
    concurrencyCases: ['governance-publication-before-bind', 'bind-before-governance-publication'],
    applicationId: 'ai-pdm',
  }
  const currentBundle = { bundle: prefixBundle(newBundle.bundle, 21) }
  const h = harness({ baselineBundle, currentBundle })
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-057', slice: '057-WRITER-FENCE', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-057', slice: '057-WRITER-FENCE', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV057_WRITER_FENCE_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev057WriterFenceAppend(baselineBundle, currentBundle.bundle).pendingMigrationCount, 1)
  assert.equal(assertDev057WriterFenceRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(currentBundle.bundle)
  drift.entries[20].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev057WriterFenceAppend(baselineBundle, drift), /DEV057_WRITER_FENCE_APPEND_INVALID/u)
})

test('DEV-057 owner producer exposes the exact writer-fence release mode', () => {
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev057-writer-fence-remediation/u)
  assert.match(producer, /--dev057-infra-ref=/u)
  assert.match(producer, /slice: '057-WRITER-FENCE'/u)
  assert.match(producer, /migrationVersion: 'dev057-orgmaster-021'/u)
  assert.match(producer, /serializationRow: 'orgmaster_core\.managed_identity_admission_authority\.singleton'/u)
})

test('DEV-057 principal contract accepts only exact 022-026 append from released 021 baseline', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 21)
  const currentBundle = { bundle: prefixBundle(newBundle.bundle, 26) }
  const h = harness({ baselineBundle, currentBundle })
  const remediation = DEV057_PRINCIPAL_CONTRACT_REMEDIATION
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-057', slice: '057-PRINCIPAL-CONTRACT', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-057', slice: '057-PRINCIPAL-CONTRACT', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV057_PRINCIPAL_CONTRACT_REMEDIATION')
  assert.equal(result.migrationDisposition, 'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount, 5)
  assert.equal(assertDev057PrincipalContractAppend(baselineBundle, currentBundle.bundle).pendingMigrationCount, 5)
  assert.equal(assertDev057PrincipalContractRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  for (const index of [21, 22, 23, 24, 25]) {
    const drift = structuredClone(currentBundle.bundle)
    drift.entries[index].appliedSha256 = '0'.repeat(64)
    assert.throws(() => assertDev057PrincipalContractAppend(baselineBundle, drift), /DEV057_PRINCIPAL_CONTRACT_APPEND_INVALID/u)
  }
  const changedRuntime = harness({ baselineBundle, currentBundle, nextRuntime: { ...runtime, secretVersions: { ...runtime.secretVersions, [profile.environment.requiredSecretNames[0]]: '2' } } })
  changedRuntime.input.values.authorization = h.input.values.authorization
  changedRuntime.input.values.readiness = h.input.values.readiness
  attachForwardInfra(changedRuntime)
  await assert.rejects(() => verifyRoutineRelease(changedRuntime.input), /DEV013_CONTROLLED_TRANSITION_AUTHORITY_INVALID|ROUTINE_RUNTIME_CHANGED/u)
})

test('DEV-057 owner producer exposes exact principal-contract release mode', () => {
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev057-principal-contract-remediation/u)
  assert.match(producer, /--dev057-infra-ref=/u)
  assert.match(producer, /slice: '057-PRINCIPAL-CONTRACT'/u)
  assert.deepEqual(DEV057_PRINCIPAL_CONTRACT_REMEDIATION.migrationVersions, ['dev014-orgmaster-022', 'dev014-orgmaster-023', 'dev057-orgmaster-024', 'dev057-orgmaster-025', 'dev057-orgmaster-026'])
})

test('DEV-057 cutover source accepts only exact 027 append from released 026 baseline', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 26)
  const currentBundle = { bundle: prefixBundle(newBundle.bundle, 27) }
  const h = harness({ baselineBundle, currentBundle })
  const remediation = DEV057_CUTOVER_SOURCE_REMEDIATION
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-057', slice: '057-CUTOVER-SOURCE', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-057', slice: '057-CUTOVER-SOURCE', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV057_CUTOVER_SOURCE_REMEDIATION')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev057CutoverSourceAppend(baselineBundle, currentBundle.bundle).pendingMigrationCount, 1)
  assert.equal(assertDev057CutoverSourceRemediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(currentBundle.bundle)
  drift.entries[26].appliedSha256 = '0'.repeat(64)
  assert.throws(() => assertDev057CutoverSourceAppend(baselineBundle, drift), /DEV057_CUTOVER_SOURCE_APPEND_INVALID/u)
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev057-cutover-source-remediation/u)
})

test('DEV-057 principal-only grants accepts only exact 028 append from released 027 baseline', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 27)
  const currentBundle = { bundle: prefixBundle(newBundle.bundle, 28) }
  const h = harness({ baselineBundle, currentBundle })
  const remediation = DEV057_PRINCIPAL_GRANTS_V3_REMEDIATION
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-057', slice: '057-PRINCIPAL-GRANTS-V3', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-057', slice: '057-PRINCIPAL-GRANTS-V3', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV057_PRINCIPAL_GRANTS_V3_REMEDIATION')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(assertDev057PrincipalGrantsV3Append(baselineBundle, currentBundle.bundle).pendingMigrationCount, 1)
  assert.equal(assertDev057PrincipalGrantsV3Remediation(h.input.values.readiness, h.input.values.authorization).releaseMode, result.releaseMode)
  const drift = structuredClone(currentBundle.bundle)
  drift.entries[27].sourceSha256 = '0'.repeat(64)
  assert.throws(() => assertDev057PrincipalGrantsV3Append(baselineBundle, drift), /DEV057_PRINCIPAL_GRANTS_V3_APPEND_INVALID/u)
  h.input.transitionFingerprint = (_root, revision) => revision
  let checked = false
  h.input.principalSmokeInfraTransition = (_root, before, after) => {
    assert.equal(before, oldSource); assert.equal(after, newSource); checked = true
  }
  assert.equal((await verifyRoutineRelease(h.input)).releaseMode, 'DEV057_PRINCIPAL_GRANTS_V3_REMEDIATION')
  assert.equal(checked, true)
  const missingReceipt = harness({ baselineBundle, currentBundle })
  missingReceipt.input.values.authorization = h.input.values.authorization
  missingReceipt.input.values.readiness = h.input.values.readiness
  missingReceipt.input.transitionFingerprint = h.input.transitionFingerprint
  missingReceipt.input.principalSmokeInfraTransition = () => assert.fail('must not admit unbound smoke delta')
  await assert.rejects(() => verifyRoutineRelease(missingReceipt.input), /ROUTINE_INFRA_CHANGED/u)
  const producer = fs.readFileSync('scripts/dev040-deploy-production.mjs', 'utf8')
  assert.match(producer, /--dev057-principal-grants-v3-remediation/u)

  const root = path.resolve('.')
  const baseline = '5bc170eee061e4de8b5a85b3421121145c206edb'
  const source = '65795fa62ba04518be68eccd34a56c29570b1f68'
  assert.match(assertDev057PrincipalSmokeInfraTransition(root, baseline, source), /^[a-f0-9]{64}$/u)
  assert.throws(() => assertDev057PrincipalSmokeInfraTransition(root, source, baseline), /PRINCIPAL_SMOKE_INFRA_DELTA_INVALID/u)
  const before = JSON.parse(spawnSync('git', ['show', baseline + ':config/release/dev040-orgmaster-independent-production-v3.json'], { encoding: 'utf8' }).stdout)
  const after = JSON.parse(spawnSync('git', ['show', source + ':config/release/dev040-orgmaster-independent-production-v3.json'], { encoding: 'utf8' }).stdout)
  assertDev057PrincipalSmokeProfileTransition(before, after)
  for (const mutate of [
    (p) => { p.verification.brokerOrigin = 'https://sibling.example' },
    (p) => { p.verification.sessionPath = '/api/auth/firebase/session' },
    (p) => { p.verification.authenticatedProbes[0].expectedStatus = 403 },
    (p) => { p.incidentRuntime.controllerAudience = 'https://sibling.example' },
  ]) {
    const drift = structuredClone(after); mutate(drift)
    assert.throws(() => assertDev057PrincipalSmokeProfileTransition(before, drift), /PRINCIPAL_SMOKE_INFRA_DELTA_INVALID/u)
  }
})

test('DEV-057 cutover admits only the exact source-frozen operator and receipt IAM delta', async () => {
  const root = path.resolve('.')
  const baselineRevision = '48120534cbde4a06d0f3cd6d5de76171ca7e0699'
  // This is a historical infrastructure transition. A later application or
  // grant-v3 commit must not become its expected "after" source by being HEAD.
  const cutoverRevision = '51ce0d0e003dbb5ea06688ea74f541066e70946d'
  assert.match(assertDev057CutoverInfraTransition(root, baselineRevision, cutoverRevision), /^[a-f0-9]{64}$/u)
  assert.throws(() => assertDev057CutoverInfraTransition(root, cutoverRevision, baselineRevision), /DEV057_CUTOVER_INFRA_DELTA_INVALID/u)
  assert.throws(() => assertDev057CutoverInfraTransition(root, baselineRevision, baselineRevision), /DEV057_CUTOVER_INFRA_DELTA_INVALID/u)

  const h = harness({ baselineBundle: prefixBundle(oldBundle.bundle, 26), currentBundle: { bundle: prefixBundle(newBundle.bundle, 27) } })
  const remediation = DEV057_CUTOVER_SOURCE_REMEDIATION
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-057', slice: '057-CUTOVER-SOURCE', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-057', slice: '057-CUTOVER-SOURCE', remediation }
  attachForwardInfra(h)
  h.input.transitionFingerprint = (_root, revision) => revision
  let checked = false
  h.input.cutoverInfraTransition = (_root, before, after) => {
    assert.equal(before, oldSource)
    assert.equal(after, newSource)
    checked = true
  }
  assert.equal((await verifyRoutineRelease(h.input)).releaseMode, 'DEV057_CUTOVER_SOURCE_REMEDIATION')
  assert.equal(checked, true)

  const missingReceipt = harness({ baselineBundle: prefixBundle(oldBundle.bundle, 26), currentBundle: { bundle: prefixBundle(newBundle.bundle, 27) } })
  missingReceipt.input.values.authorization = h.input.values.authorization
  missingReceipt.input.values.readiness = h.input.values.readiness
  missingReceipt.input.transitionFingerprint = h.input.transitionFingerprint
  missingReceipt.input.cutoverInfraTransition = () => assert.fail('must not accept an unbound infrastructure delta')
  await assert.rejects(() => verifyRoutineRelease(missingReceipt.input), /ROUTINE_INFRA_CHANGED/u)
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
  const h = harness({ baselineRuntime: legacyRuntime, nextRuntime: historicalRuntime })
  h.input.profile = historicalProfile
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
  const enabledPlain = resolvePlainEnvironment(historicalProfile, historicalRuntime.plainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const enabledRuntime = buildRuntimeConfig(historicalProfile, { plainEnvironment: enabledPlain, secretVersions: historicalRuntime.secretVersions })
  const missing = harness({ baselineRuntime: historicalRuntime, nextRuntime: enabledRuntime })
  missing.input.profile = historicalProfile
  await assert.rejects(() => verifyRoutineRelease(missing.input), /DEV013_CONTROLLED_TRANSITION_AUTHORITY_INVALID/u)
  const secretDrift = harness({ baselineRuntime: historicalRuntime, nextRuntime: structuredClone(enabledRuntime) })
  secretDrift.input.profile = historicalProfile
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


test('real routine verifier and baseline resolver repair a sealed Principal-only maintenance rollback', async () => {
  const h = harness()
  const uid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
  const recoveryRevision = 'orgmaster-prod-recovery-aaaaaaaaaaaa'
  const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-recovery@sha256:${'9'.repeat(64)}`
  const baselineIntent = structuredClone(h.objects.get(h.input.intent.baselineIntentRef.uri).value)
  baselineIntent.previousRevision = 'orgmaster-prod-prior'
  const proofRef = h.put(`gs://${bucket}/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/${oldSource}.json`, {
    schemaVersion: 'orgmaster.principal-only-recovery.v1', sourceRevision: oldSource,
    projectId: profile.target.projectId, region: profile.target.region, service: profile.target.serviceName,
    serviceUid: uid, oldRevision: baselineIntent.previousRevision, recoveryRevision, imageDigest: image, status: 'PASS',
  })
  baselineIntent.principalOnlyRecovery = { revision: recoveryRevision, imageDigest: image, serviceUid: uid, receiptRef: proofRef }
  const baselineRef = h.put(`gs://${bucket}/receipts/releases/${baselineIntent.releaseId}/release-intent.json`, baselineIntent)
  const paths = releasePaths(profile, baselineIntent, baselineRef.sha256)
  const deployment = structuredClone(h.objects.get(h.paths.deployment).value)
  deployment.releaseIntentRef = baselineRef
  const deploymentRef = h.put(paths.deployment, deployment)
  const migrationRef = h.put(paths.migrate, h.objects.get(h.paths.migrate).value)
  const seal = (stage, facts, previousReceiptRef = null) => h.put(paths[stage], stageReceipt({ profile,
    intent: baselineIntent, stage, facts, previousReceiptRef, observedAt: '2026-09-30T00:00:00Z' }))
  const candidateRevision = 'orgmaster-prod-failedcandidate'
  seal('candidate', { deploymentCapsuleRef: deploymentRef, migrationReceiptRef: migrationRef,
    candidateRevision, artifactDigest: deployment.artifactDigest })
  const rollbackRef = seal('rollback', { result: 'ROLLED_BACK', previousRevision: recoveryRevision, databaseDisposition: 'FORWARD_APPLIED' })
  seal('terminal', { result: 'ROLLED_BACK', previousRevision: recoveryRevision, databaseDisposition: 'FORWARD_APPLIED' }, rollbackRef)
  const core = { inputFingerprint: '3'.repeat(64), leaseExpiresAt: '2026-09-30T00:02:00Z', deadlineAt: '2026-09-30T04:00:00Z', schemaVersion: 'jenfu.dev012.owner-control-head.v1', state: 'FINALIZED', result: 'ROLLED_BACK',
    ownerApplicationId: profile.application.id, service: profile.target.serviceName, controlBucket: bucket,
    releaseId: baselineIntent.releaseId, sourceRevision: oldSource, sourceLockSha256: baselineIntent.sourceLockRef.sha256,
    previousRevision: recoveryRevision, candidateRevision,
    ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/42` }
  const control = { ...core, controlSha256: sha256(canonicalize(core)) }
  h.put(paths.control, control)
  const service = { name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`,
    uid, generation: '2', observedGeneration: '2', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    traffic: [{ revision: recoveryRevision, percent: 100 }], trafficStatuses: [{ revision: recoveryRevision, percent: 100 }] }
  h.input.service = service
  h.input.transport.getService = async () => service
  h.input.transport.effectiveRevision = () => recoveryRevision
  h.input.transport.readOwnerRun = async () => ({ id: '42', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: oldSource })
  h.input.transport.getRevision = async (_profile, name) => {
    assert.equal(name, recoveryRevision, 'old authorization revision must not be inspected as an active baseline')
    return { name: `${service.name}/revisions/${name}`, containers: [{ name: profile.runtime.containerName, image }],
      conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  }
  h.input.intent.previousRevision = recoveryRevision
  h.input.intent.baselineIntentRef = baselineRef
  h.input.intent.principalOnlyRecovery = { ...baselineIntent.principalOnlyRecovery, revision: 'orgmaster-prod-recovery-bbbbbbbbbbbb' }
  for (const kind of ['authorization', 'readiness']) h.input.values[kind].baselineIntentRef = baselineRef
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.previousRevision, recoveryRevision)
  assert.equal(result.migrationDisposition, 'UNCHANGED_VERIFIED')
  assert.deepEqual(result.principalOnlyForwardRepair, { rollbackRef, recoveryRef: proofRef })
  assert.deepEqual(await resolveRoutineControlBaseline({ profile, transport: h.input.transport, control,
    attempt: h.objects.get(baselineRef.uri) }), baselineRef)
  delete h.input.intent.principalOnlyRecovery
  await assert.rejects(() => verifyRoutineRelease(h.input), /ROUTINE_REPAIR_RUNTIME_CHANGED/)
})

test('DEV-057 cookie correction seals historical and Principal-only source transitions', () => {
  const historical = '1add0e6508568d591faa190cabf64e2470fb620c'
  const principal = 'b8d6b8a92a044bcd59e11efd8a6c0f7f2e319b55'
  const corrected = 'b9c6bfeca843c6ef551d95834b59f5471c097abc'
  for (const before of [historical, principal]) assertDev057PrincipalSmokeBlobTransition(before, corrected)
  for (const [before, after] of [[corrected, principal], [corrected, historical], [principal, historical], [principal, 'a'.repeat(40)], [null, corrected]]) {
    assert.throws(() => assertDev057PrincipalSmokeBlobTransition(before, after), /PRINCIPAL_SMOKE_INFRA_DELTA_INVALID/u)
  }
})

test('DEV-057 catalog packaging accepts only the reviewed read-only v4-to-v5 recipe correction', () => {
  const before = '66cebdc6bbd1e44fa611acfcc004ace459c1f37e'
  const after = '464590365d2e0607f46eeadee8b819b01116748a'
  assertDev057CatalogReadbackPackagingTransition(before, after)
  for (const pair of [[after, before], [null, after], [before, 'a'.repeat(40)], ['b'.repeat(40), after]]) {
    assert.throws(() => assertDev057CatalogReadbackPackagingTransition(...pair), /CATALOG_PACKAGING_DELTA_INVALID/u)
  }
  for (const baseline of ['5bc170eee061e4de8b5a85b3421121145c206edb',
    '8e6c1233491f8822463fed508ef59829cda6754a']) {
    assert.match(assertDev057PrincipalSmokeInfraTransition(path.resolve('.'), baseline,
      '802fd5864ce28abf93774bc98b782e1036317014'), /^[a-f0-9]{64}$/u)
  }
})

test('DEV-057 grant v4 admits only sealed 028-to-029 append with fresh runner evidence', async () => {
 const baselineBundle=prefixBundle(oldBundle.bundle,28);
 const currentBundle={bundle:prefixBundle(newBundle.bundle,29)};
 const h=harness({baselineBundle,currentBundle});
 const remediation=DEV057_PRINCIPAL_GRANTS_V4_REMEDIATION;
 h.input.values.authorization={...h.input.values.authorization,schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION',devId:'DEV-057',slice:'057-PRINCIPAL-GRANTS-V4',remediation};
 h.input.values.readiness={...h.input.values.readiness,schemaVersion:'orgmaster.routine-release-readiness.v1',devId:'DEV-057',slice:'057-PRINCIPAL-GRANTS-V4',remediation};
 attachForwardInfra(h);
 const result=await verifyRoutineRelease(h.input);
 assert.equal(result.releaseMode,'DEV057_PRINCIPAL_GRANTS_V4_REMEDIATION');
 assert.equal(result.pendingMigrationCount,1);
 assert.equal(assertDev057PrincipalGrantsV4Remediation(h.input.values.readiness,h.input.values.authorization).releaseMode,result.releaseMode);
 for(const field of ['version','path','sourceSha256','appliedSha256']) {
  const drift=structuredClone(currentBundle.bundle);drift.entries[28][field]='wrong';
  assert.throws(()=>assertDev057PrincipalGrantsV4Append(baselineBundle,drift),/DEV057_PRINCIPAL_GRANTS_V4_APPEND_INVALID/);
 }
 const prefixDrift=structuredClone(currentBundle.bundle);prefixDrift.entries[27].sourceSha256='0'.repeat(64);
 assert.throws(()=>assertDev057PrincipalGrantsV4Append(baselineBundle,prefixDrift),/DEV057_PRINCIPAL_GRANTS_V4_APPEND_INVALID/);
 assert.throws(()=>assertDev057PrincipalGrantsV4Append(prefixBundle(baselineBundle,27),currentBundle.bundle),/DEV057_PRINCIPAL_GRANTS_V4_APPEND_INVALID/);
 const missing=harness({baselineBundle,currentBundle});missing.input.values.authorization=h.input.values.authorization;missing.input.values.readiness=h.input.values.readiness;
 await assert.rejects(()=>verifyRoutineRelease(missing.input),/DEV013_MIGRATION_INFRA_RECEIPT_INVALID/);
 const invalid=structuredClone(h.input.values.readiness);invalid.remediation={...remediation,contractView:'orgmaster_contract.wrong'};
 assert.throws(()=>assertDev057PrincipalGrantsV4Remediation(invalid,h.input.values.authorization),/DEV057_PRINCIPAL_GRANTS_V4_AUTHORITY_INVALID/);
 h.input.transitionFingerprint=(_root,revision)=>revision;
 await assert.rejects(()=>verifyRoutineRelease(h.input),/ROUTINE_INFRA_CHANGED/);
});

test('DEV-057 employee number command v2 admits only the exact sealed 029-to-030 append', async () => {
 const baselineBundle=prefixBundle(oldBundle.bundle,29);
 const currentBundle={bundle:prefixBundle(newBundle.bundle,30)};
 const h=harness({baselineBundle,currentBundle});
 const remediation=DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_REMEDIATION;
 h.input.values.authorization={...h.input.values.authorization,schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION',devId:'DEV-057',slice:'057-EMPLOYEE-NUMBER-COMMAND-RECEIPT-V2',remediation};
 h.input.values.readiness={...h.input.values.readiness,schemaVersion:'orgmaster.routine-release-readiness.v1',devId:'DEV-057',slice:'057-EMPLOYEE-NUMBER-COMMAND-RECEIPT-V2',remediation};
 attachForwardInfra(h);
 const result=await verifyRoutineRelease(h.input);
 assert.equal(result.releaseMode,'DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_REMEDIATION');
 assert.equal(result.pendingMigrationCount,1);
 assert.equal(assertDev057EmployeeNumberCommandReceiptV2Remediation(h.input.values.readiness,h.input.values.authorization).releaseMode,result.releaseMode);
 assert.equal(assertDev057EmployeeNumberCommandReceiptV2Append(baselineBundle,currentBundle.bundle).pendingMigrationCount,1);
 for(const field of ['version','path','sourceSha256','appliedSha256']) {
  const drift=structuredClone(currentBundle.bundle);drift.entries[29][field]='wrong';
  assert.throws(()=>assertDev057EmployeeNumberCommandReceiptV2Append(baselineBundle,drift),/DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_APPEND_INVALID/);
 }
 const prefixDrift=structuredClone(currentBundle.bundle);prefixDrift.entries[28].sourceSha256='0'.repeat(64);
 assert.throws(()=>assertDev057EmployeeNumberCommandReceiptV2Append(baselineBundle,prefixDrift),/DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_APPEND_INVALID/);
 assert.throws(()=>assertDev057EmployeeNumberCommandReceiptV2Append(prefixBundle(baselineBundle,28),currentBundle.bundle),/DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_APPEND_INVALID/);
 assert.throws(()=>assertDev057EmployeeNumberCommandReceiptV2Append(baselineBundle,prefixBundle(currentBundle.bundle,29)),/DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_APPEND_INVALID/);
 const invalid=structuredClone(h.input.values.readiness);invalid.remediation={...remediation,appliedSha256:'0'.repeat(64)};
 assert.throws(()=>assertDev057EmployeeNumberCommandReceiptV2Remediation(invalid,h.input.values.authorization),/DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_AUTHORITY_INVALID/);
 const mixed=harness({baselineBundle,currentBundle});
 mixed.input.values.authorization=h.input.values.authorization;mixed.input.values.readiness=h.input.values.readiness;
 await assert.rejects(()=>verifyRoutineRelease(mixed.input),/DEV013_MIGRATION_INFRA_RECEIPT_INVALID/);
});

test('DEV-057 employee number command v2 CLI mode is exclusive and requires its own infra receipt', () => {
 const ref=`gs://${bucket}/receipts/releases/REL-EMPLOYEE-NUMBER/app-infra.json#sha256=${'a'.repeat(64)}`;
 const options=parseDeployProductionArgs(['--prepare-only','--dev057-employee-number-command-receipt-v2-remediation',`--dev057-infra-ref=${ref}`]);
 assert.equal(options.dev057EmployeeNumberCommandReceiptV2Remediation,true);
 assert.equal(options.infraOption,'dev057');
 assert.throws(()=>parseDeployProductionArgs(['--prepare-only','--dev057-employee-number-command-receipt-v2-remediation']),/DEV057_CONTROLLED_TRANSITION_INPUT_INCOMPLETE/);
 assert.throws(()=>parseDeployProductionArgs(['--prepare-only','--dev057-employee-number-command-receipt-v2-remediation','--dev057-principal-grants-v4-remediation',`--dev057-infra-ref=${ref}`]),/DEV057_CONTROLLED_TRANSITION_INPUT_INVALID/);
});


function smokeContinuationHarness({ controllerImageDigest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:' + '3'.repeat(64) } = {}) {
  const h = harness()
  const infraProfile = JSON.parse(fs.readFileSync('config/release/dev040-production-release-infra-plan.json'))
  const addresses = [...infraProfile.stageA, ...infraProfile.stageBAdditional].sort()
  const appliedAt = '2026-09-23T08:01:00.000Z'
  const credential = buildReauthReceipt({ sourceRevision: newSource,
    expected: { issuer: EXPECTED.issuer, subject: 'synthetic-provider-subject-001' },
    authTime: Math.floor(Date.parse('2026-09-23T08:00:00.000Z') / 1000),
    authenticatedAt: '2026-09-23T08:00:10.000Z', observedAt: '2026-09-23T08:00:30.000Z',
    principal: { principalId: 'principal-synthetic-001', employeeId: 'employee-synthetic-001' },
    previousVersion: '7', newVersion: '8' })
  const sealed = (core) => ({ ...core, receiptSha256: sha256(canonicalize(core)) })
  const priorCore = { schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'orgmaster',
    projectId: profile.target.projectId, region: profile.target.region, sourceRevision: oldSource,
    foundationManifestSha256: '1'.repeat(64),
    migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + '2'.repeat(64),
    controllerImageDigest,
    terraformAddressCount: addresses.length, terraformAddressesSha256: sha256(canonicalize(addresses)),
    stateLineage: 'a1234567-0123-4567-89ab-0123456789ab', stateSerial: 5,
    binaryPlanSha256: '4'.repeat(64), planJsonSha256: '5'.repeat(64), stateJsonSha256: '6'.repeat(64), outputManifestSha256: '7'.repeat(64),
    observedAt: '2026-09-22T08:00:00.000Z', status: 'APPLIED', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER' }
  const priorUri = h.input.intent.infraReceiptRef.uri
  const priorRef = h.put(priorUri, sealed(priorCore))
  const baselineRead = h.objects.get(h.input.intent.baselineIntentRef.uri)
  baselineRead.value.infraReceiptRef = priorRef
  const originalLock = buildSourceFreeze({ profile, releaseId: baselineRead.value.releaseId, observedAt: '2020-01-01T00:00:00Z',
    git: { sourceRevision: oldSource, sourceTree: oldSource, branch: 'master', remoteRevision: oldSource, clean: true },
    sourceIdentityBytes: Buffer.from('own original released source identity'), migrationBundle: oldBundle })
  baselineRead.value.sourceLockRef = h.put('gs://' + bucket + '/receipts/fixture/original-source-lock.json', originalLock)
  baselineRead.value.sourceSha256 = originalLock.sourceSha256
  h.input.intent.baselineIntentRef = h.put(baselineRead.ref.uri, baselineRead.value)
  h.input.values.authorization.baselineIntentRef = h.input.intent.baselineIntentRef
  h.input.values.readiness.baselineIntentRef = h.input.intent.baselineIntentRef
  // Refresh source-bound baseline receipt paths after changing the baseline intent hash.
  const oldPaths = h.paths
  const newPaths = releasePaths(profile, baselineRead.value, h.input.intent.baselineIntentRef.sha256)
  for (const name of ['candidate', 'terminal', 'migrate', 'deployment']) {
    const value = structuredClone(h.objects.get(oldPaths[name]).value)
    if (name === 'deployment') value.releaseIntentRef = h.input.intent.baselineIntentRef
    h.put(newPaths[name], value)
  }
  const migrationRef = h.objects.get(newPaths.migrate).ref
  const deploymentRef = h.objects.get(newPaths.deployment).ref
  const candidate = structuredClone(h.objects.get(newPaths.candidate).value)
  const { receiptSha256: _seal, ...candidateCore } = candidate
  candidateCore.facts.deploymentCapsuleRef = deploymentRef
  candidateCore.facts.migrationReceiptRef = migrationRef
  h.put(newPaths.candidate, sealed(candidateCore))
  const credentialUri = 'gs://' + bucket + '/receipts/credential-reauth/synthetic.json'
  let rotationCore = { ...priorCore, sourceRevision: newSource, stateSerial: 6, observedAt: appliedAt,
    mutationProfile: 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION', candidateSmokeRefreshTokenSecretVersion: '8',
    credentialEvidenceRef: h.put(credentialUri, credential) }
  const rotationUri = 'gs://' + bucket + '/receipts/releases/SMOKE-ROTATION-FIXTURE/app-infra.json'
  const sourceEdits = new Map()
  h.input.readSourceFile = (_root, revision, file) => sourceEdits.get(revision + ':' + file) ?? fs.readFileSync(file)
  const requests = []
  const workflowName = 'projects/jenfu-platform-prod/locations/asia-east1/workflows/orgmaster-prod-candidate-smoke'
  const workflow = { name: workflowName, state: 'ACTIVE', revisionId: '000008-synthetic',
    serviceAccount: 'projects/jenfu-platform-prod/serviceAccounts/' + profile.identities.smoke,
    sourceContents: expectedSmokeWorkflowSource({ ...h.input, sourceRevision: newSource, version: '8' }) }
  const secret = { name: 'projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/8', state: 'ENABLED' }
  h.input.transport.request = async (url) => {
    requests.push(url)
    if (url === 'https://workflows.googleapis.com/v1/' + workflowName) return workflow
    if (['8', 'latest'].some((version) => url === 'https://secretmanager.googleapis.com/v1/projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/' + version)) return secret
    assert.fail('Unexpected provider request ' + url)
  }
  const update = ({ rotation = {}, proof = {}, reseal = true } = {}) => {
    const nextCredential = structuredClone({ ...credential, ...proof })
    if (reseal) { const { receiptSha256: _hash, ...core } = nextCredential; nextCredential.receiptSha256 = sha256(canonicalize(core)) }
    rotationCore = { ...rotationCore, credentialEvidenceRef: h.put(credentialUri, nextCredential), ...rotation }
    const next = sealed(rotationCore)
    if (!reseal) next.receiptSha256 = '0'.repeat(64)
    const ref = h.put(rotationUri, next)
    h.input.values.infra = next
    h.options = parseDeployProductionArgs(['--check', '--smoke-rotation-ref=' + ref.uri + '#sha256=' + ref.sha256])
    h.input.intent.infraReceiptRef = selectDeployInfrastructureRef(h.options, { intent: baselineRead.value })
  }
  update()
  return Object.assign(h, { update, requests, workflow, secret, sourceEdits, addresses, rotationUri })
}

async function smokeReuseHarness({ oci = false } = {}) {
  const childDocument = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { digest: 'sha256:' + 'e'.repeat(64) }, layers: [{ digest: 'sha256:' + 'f'.repeat(64) }] }
  const childBytes = Buffer.from(JSON.stringify(childDocument) + '\n')
  const indexDocument = { schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{
    digest: 'sha256:' + sha256(childBytes), size: childBytes.length, mediaType: childDocument.mediaType,
    platform: { os: 'linux', architecture: 'amd64' } }] }
  const parentBytes = Buffer.from(JSON.stringify(indexDocument) + '\n')
  const controllerUri = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller'
  const parentImage = controllerUri + '@sha256:' + sha256(parentBytes), childImage = controllerUri + '@sha256:' + sha256(childBytes)
  const h = smokeContinuationHarness(oci ? { controllerImageDigest: parentImage } : {})
  const sourceRevision = 'c'.repeat(40), releaseId = 'SMOKE-REUSE-FIXTURE'
  const manifest = { project_id: profile.target.projectId, region: profile.target.region, source_revision: newSource,
    foundation_manifest_sha256: '1'.repeat(64), application_service: profile.target.serviceName,
    runtime_identity: profile.target.runtimeServiceAccount, release_bucket: bucket,
    candidate_smoke_secret: EXPECTED.secretId, incident_runtime: true,
    migration_runner_digest: profile.artifact.migrationRunnerUri + '@sha256:' + '2'.repeat(64),
    controller_image_digest: h.input.values.infra.controllerImageDigest }
  const state = { values: { root_module: { resources: h.addresses.map((address) => ({ address, mode: address.startsWith('data.') ? 'data' : 'managed',
    values: address === 'google_workflows_workflow.candidate_smoke[0]' ? {
      name: profile.verification.candidateWorkflowName, project: profile.target.projectId, region: profile.target.region,
      source_contents: h.workflow.sourceContents } : {} })) }, outputs: { app_release_infra_manifest: { value: manifest } } } }
  const jobName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/orgmaster-prod-migration-runner'
  const controllerName = 'projects/jenfu-platform-prod/locations/asia-east1/services/orgmaster-prod-abort-controller'
  const sql = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
  const job = { name: jobName, uid: 'job-synthetic-immutable-uid', etag: 'job-e1', generation: '2', observedGeneration: '2', template: { parallelism: 1, taskCount: 1,
    template: { serviceAccount: 'orgmaster-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com', executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
      timeout: '1800s', maxRetries: 0, containers: [{ name: 'migration', image: manifest.migration_runner_digest, args: ['--bundle-ref-required'],
        env: [{ name: 'POSTGRES_DATABASE', value: 'jenfu_prod' }, { name: 'CLOUD_SQL_INSTANCE_CONNECTION_NAME', value: sql }],
        resources: { limits: { cpu: '1', memory: '512Mi' } }, volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }],
      volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: [sql] } }],
      vpcAccess: { egress: 'ALL_TRAFFIC', networkInterfaces: [{ network: 'projects/jenfu-platform-prod/global/networks/jenfu-platform-prod-vpc',
        subnetwork: 'projects/jenfu-platform-prod/regions/asia-east1/subnetworks/jenfu-platform-prod-runtime' }] } } } }
  const controller = { name: controllerName, uid: 'controller-synthetic-immutable-uid', etag: 'controller-e1', generation: '3', observedGeneration: '3',
    latestReadyRevision: controllerName + '/revisions/orgmaster-prod-abort-controller-00003-fixture',
    latestCreatedRevision: controllerName + '/revisions/orgmaster-prod-abort-controller-00003-fixture',
    traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100 }],
    trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100, revision: 'orgmaster-prod-abort-controller-00003-fixture' }],
    ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER', template: { serviceAccount: profile.identities.controller, timeout: '60s',
      maxInstanceRequestConcurrency: 1, scaling: { minInstanceCount: 0, maxInstanceCount: 1 }, containers: [{ name: 'controller',
        image: manifest.controller_image_digest, ports: [{ containerPort: 8080 }],
        env: [{ name: 'GITHUB_READ_TOKEN', valueSource: { secretKeyRef: { secret: 'orgmaster-prod-release-controller-github-token', version: '1' } } }],
        resources: { limits: { cpu: '1', memory: '256Mi' }, cpuIdle: true } }] } }
  state.values.root_module.resources.find((row) => row.address === 'google_cloud_run_v2_job.migration[0]').values = {
    name: 'orgmaster-prod-migration-runner', uid: job.uid, project: profile.target.projectId, location: profile.target.region,
    template: [{ parallelism: 1, task_count: 1, template: [{ service_account: job.template.template.serviceAccount,
      execution_environment: 'EXECUTION_ENVIRONMENT_GEN2', timeout: '1800s', max_retries: 0,
      containers: [{ name: 'migration', image: manifest.migration_runner_digest, args: ['--bundle-ref-required'], command: [],
        env: [{ name: 'CLOUD_SQL_INSTANCE_CONNECTION_NAME', value: sql }, { name: 'POSTGRES_DATABASE', value: 'jenfu_prod' }],
        resources: [{ limits: { cpu: '1', memory: '512Mi' } }], volume_mounts: [{ name: 'cloudsql', mount_path: '/cloudsql' }] }],
      volumes: [{ name: 'cloudsql', cloud_sql_instance: [{ instances: [sql] }] }], vpc_access: [{ egress: 'ALL_TRAFFIC',
        network_interfaces: [{ network: 'jenfu-platform-prod-vpc', subnetwork: 'jenfu-platform-prod-runtime' }] }] }] }] }
  state.values.root_module.resources.find((row) => row.address === 'google_cloud_run_v2_service.abort_controller[0]').values = {
    name: 'orgmaster-prod-abort-controller', uid: controller.uid, project: profile.target.projectId, location: profile.target.region,
    ingress: controller.ingress, template: [{ service_account: profile.identities.controller, timeout: '60s',
      max_instance_request_concurrency: 1, scaling: [{ min_instance_count: 0, max_instance_count: 1 }], containers: [{
        name: 'controller', image: manifest.controller_image_digest, ports: [{ container_port: 8080 }], env: [{ name: 'GITHUB_READ_TOKEN',
          value_source: [{ secret_key_ref: [{ secret: 'orgmaster-prod-release-controller-github-token', version: '1' }] }] }],
        resources: [{ limits: { cpu: '1', memory: '256Mi' }, cpu_idle: true }] }] }] }
  const request = h.input.transport.request
  const controllerRevision = { name: controller.latestReadyRevision, containers: structuredClone(controller.template.containers),
    serviceAccount: profile.identities.controller, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  if (oci) controllerRevision.containers[0].image = childImage
  h.input.transport.readControllerImageResolution = createOwnerTransport({ token: 'synthetic-registry-token', fetchImpl: async (url) => {
    const digest = url.split('/manifests/')[1]
    const bytes = digest === 'sha256:' + sha256(parentBytes) ? parentBytes : digest === 'sha256:' + sha256(childBytes) ? childBytes : null
    assert.ok(bytes, 'Registry read must use exact own immutable parent/child')
    return new Response(bytes, { headers: { 'content-type': bytes === parentBytes ? indexDocument.mediaType : childDocument.mediaType,
      'docker-content-digest': digest } })
  } }).readControllerImageResolution
  h.input.transport.request = async (url) => {
    if (url === 'https://run.googleapis.com/v2/' + jobName) { h.requests.push(url); return job }
    if (url === 'https://run.googleapis.com/v2/' + controllerName) { h.requests.push(url); return controller }
    if (url === 'https://run.googleapis.com/v2/' + controllerRevision.name) { h.requests.push(url); return controllerRevision }
    return request(url)
  }
  const stateMeta = { lineage: 'a1234567-0123-4567-89ab-0123456789ab', serial: 6 }
  h.update({ rotation: { stateJsonSha256: sha256(canonicalize(state)), outputManifestSha256: sha256(canonicalize(manifest)) } })
  const rotationRef = structuredClone(h.input.intent.infraReceiptRef)
  const original = Buffer.from(h.objects.get(rotationRef.uri).bytes)
  const sourceIdentityBytes = Buffer.from('own synthetic frozen source identity')
  const git = { sourceRevision, sourceTree: 'd'.repeat(40), branch: 'master', remoteRevision: sourceRevision, clean: true }
  const sourceLock = buildSourceFreeze({ profile, releaseId, observedAt: '2026-10-05T00:00:00Z', git,
    sourceIdentityBytes, migrationBundle: buildBundle(sourceRevision) })
  const sourceLockRef = h.put('gs://' + bucket + '/receipts/releases/' + releaseId + '/source-lock.json', sourceLock)
  const baselineRead = h.objects.get(h.input.intent.baselineIntentRef.uri)
  const baseline = { intent: baselineRead.value, activeRevision: h.input.intent.previousRevision }
  const failedIntent = { ...h.input.intent, releaseId: 'SMOKE-ABORT-FIXTURE', sourceLockRef: h.input.intent.sourceLockRef,
    sourceRevision: newSource, infraReceiptRef: rotationRef }
  const attemptRef = h.put('gs://' + bucket + '/receipts/releases/' + failedIntent.releaseId + '/release-intent.json', failedIntent)
  const failedPaths = releasePaths(profile, failedIntent, attemptRef.sha256)
  const facts = { result: 'PRE_ACTIVATION_ABORTED', previousRevision: failedIntent.previousRevision,
    databaseDisposition: 'NOT_APPLIED', entrypointRecovery: { changed: false, result: 'NOT_REQUIRED' } }
  const rollbackRef = h.put(failedPaths.rollback, stageReceipt({ profile, intent: failedIntent, stage: 'rollback',
    facts: { ...facts, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'] }, observedAt: '2026-10-04T00:00:00Z' }))
  h.put(failedPaths.terminal, stageReceipt({ profile, intent: failedIntent, stage: 'terminal', previousReceiptRef: rollbackRef,
    facts, observedAt: '2026-10-04T00:00:00Z' }))
  const controlCore = { schemaVersion: 'jenfu.dev012.owner-control-head.v1',
    inputFingerprint: sha256(canonicalize({ ownerApplicationId: 'orgmaster', releaseId: failedIntent.releaseId,
      sourceRevision: newSource, releaseIntentSha256: attemptRef.sha256 })), ownerApplicationId: 'orgmaster',
    service: profile.target.serviceName, controlBucket: bucket, releaseId: failedIntent.releaseId, sourceRevision: newSource,
    sourceLockSha256: failedIntent.sourceLockRef.sha256, candidateRevision: null, previousRevision: failedIntent.previousRevision,
    ownerRunRef: 'https://api.github.com/repos/' + profile.application.repository + '/actions/runs/12345',
    leaseExpiresAt: '2026-10-04T00:00:00Z', deadlineAt: failedIntent.deadlineAt, state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED' }
  const controlUri = 'gs://' + bucket + '/control/active.json'
  const setControl = (changes = {}) => {
    const core = { ...controlCore, ...changes }
    h.put(controlUri, { ...core, controlSha256: sha256(canonicalize(core)) })
    h.objects.get(controlUri).metadata = { generation: '17' }
  }
  setControl()
  const terraformReader = (_root, args) => {
    if (args.join(' ') === 'show -json') return state
    if (args.join(' ') === 'state pull') return stateMeta
    if (args.join(' ') === 'output -json app_release_infra_manifest') return manifest
    assert.fail('Unapproved terraform command')
  }
  const readInfrastructureTree = () => Buffer.from('own complete source-frozen infra tree')
  h.input.intent.sourceRevision = sourceRevision
  h.input.intent.sourceSha256 = sourceLock.sourceSha256
  h.input.intent.migrationManifestSha256 = sourceLock.migrationManifestSha256
  h.input.buildMigrationBundle = async () => buildBundle(sourceRevision)
  h.input.values.sourceLock = { ...sourceLock, releaseId: h.input.intent.releaseId }
  h.input.values.authorization.sourceRevision = sourceRevision
  h.input.values.readiness.sourceRevision = sourceRevision
  h.input.readInfrastructureTree = readInfrastructureTree
  h.input.terraformReader = terraformReader
  const constructorInput = { ...h.input, releaseId, sourceLock, sourceLockRef, baselineIntentRef: h.input.intent.baselineIntentRef,
    baseline, rotationRef, observedAt: '2026-10-05T00:00:00Z', terraformReader, readInfrastructureTree }
  const reuse = await buildSmokeInfraReuseReceipt(constructorInput)
  const reuseUri = 'gs://' + bucket + '/receipts/releases/' + releaseId + '/app-infra-reuse.json'
  const select = (value = reuse, reseal = false) => {
    if (reseal) { const { receiptSha256: _seal, ...core } = value; value = { ...core, receiptSha256: sha256(canonicalize(core)) } }
    const ref = h.put(reuseUri, value)
    h.options = parseDeployProductionArgs(['--check', '--infra-reuse-ref=' + ref.uri + '#sha256=' + ref.sha256])
    h.input.intent.infraReceiptRef = selectDeployInfrastructureRef(h.options, baseline)
    h.input.values.infra = value
  }
  select()
  h.requests.length = 0
  return Object.assign(h, { reuse, select, state, stateMeta, manifest, constructorInput, rotationRef, job, controller, controllerRevision,
    original, sourceIdentityBytes, git, sourceLock, sourceLockRef, setControl, controlUri, failedPaths })
}

test('source-only infra reuse keeps the original rotation and expired-now credential immutable, then passes CLI and native prepare', async () => {
  const h = await smokeReuseHarness()
  const rows = h.state.values.root_module.resources
  assert.equal(rows.filter((row) => row.mode === 'managed').length, 69)
  assert.deepEqual(rows.filter((row) => row.mode === 'data').map((row) => row.address), [
    'data.google_cloud_run_v2_service.application', 'data.google_project.current',
    'data.google_secret_manager_secret.controller_github_token', 'data.google_service_account.migrator',
    'data.google_service_account.runtime', 'data.google_storage_project_service_account.gcs',
  ])
  const result = await verifyDeployProductionRelease({ options: h.options, ...h.input })
  assert.equal(result.smokeRotationContinuation.evidenceScope, 'OWNER_SEALED_APPLIED_ROTATION_REUSE')
  assert.equal(result.smokeRotationContinuation.reusedSourceRevision, newSource)
  assert.equal(result.smokeRotationContinuation.sourceRevision, 'c'.repeat(40))
  assert.equal(result.smokeRotationContinuation.newVersion, '8')
  assert.equal(result.operatorInfraReuseStateReadback.terraformAddressCount, 75)
  assert.deepEqual(h.objects.get(h.rotationRef.uri).bytes, h.original)
  h.input.transport.request = () => assert.fail('native prepare must not read Job/controller/Workflow/Secret metadata')
  h.input.terraformReader = () => assert.fail('native prepare must not execute Terraform')
  assert.equal((await verifyRoutineRelease(h.input)).pendingMigrationCount, 0)
})

test('native infra-reuse producer verifies exact clean remote source twice and writes only a new own receipt', async () => {
  const h = await smokeReuseHarness()
  const writes = []
  h.input.transport.putJson = async (uri, value, options) => { writes.push({ uri, options }); return { ref: h.put(uri, value), value } }
  let gitReads = 0
  const run = (gitReader = () => { gitReads++; return h.git }) => executePrerequisiteProducer({ ...h.constructorInput,
    stage: 'infra-reuse', input: { schemaVersion: 'jenfu.dev012.app-infra-reuse-input.v1', sourceLockRef: h.sourceLockRef,
      baselineIntentRef: h.input.intent.baselineIntentRef, existingInfraReceiptRef: h.rotationRef },
    createSourceIdentity: async () => h.sourceIdentityBytes, gitReader })
  const result = await run()
  assert.equal(gitReads, 2)
  assert.equal(result.value.sourceRevision, h.git.sourceRevision)
  assert.equal(writes.length, 1)
  assert.match(writes[0].uri, /\/SMOKE-REUSE-FIXTURE\/app-infra-reuse\.json$/u)
  assert.deepEqual(h.objects.get(h.rotationRef.uri).bytes, h.original)
  await assert.rejects(() => run(() => ({ ...h.git, sourceRevision: oldSource })), /SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE/u)
  for (const changed of [{ clean: false }, { branch: 'feature' }, { remoteRevision: oldSource }])
    await assert.rejects(() => run(() => ({ ...h.git, ...changed })), /SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE/u)
  let count = 0
  await assert.rejects(() => run(() => ({ ...h.git, sourceTree: count++ ? oldSource : h.git.sourceTree })), /SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE/u)
  assert.equal(writes.length, 1)
})

test('real owner prepare consumes source-bound reuse through the existing routine verifier and seals only current prerequisites', async () => {
  const h = await smokeReuseHarness()
  const common = { projectId: profile.target.projectId, ownerApplicationId: 'orgmaster', status: 'PASS',
    releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND' }
  Object.assign(h.input.values.authorization, common, { environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00Z' })
  Object.assign(h.input.values.readiness, common, { environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00Z' })
  h.input.values.foundation = h.objects.get(h.input.intent.foundationReceiptRef.uri).value
  h.input.values.runtimeConfig = { ...common, runtimeConfig: h.input.values.runtimeConfig.runtimeConfig }
  for (const [name, field] of Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', runtimeConfig: 'runtimeConfigRef' }))
    h.input.intent[field] = h.put('gs://' + bucket + '/receipts/releases/ROUTINE-NEXT/' + name + '.json', h.input.values[name])
  h.input.intent.deadlineAt = '2999-01-01T00:00:00Z'
  const intentRef = h.put('gs://' + bucket + '/receipts/releases/ROUTINE-NEXT/release-intent.json', h.input.intent)
  const readBytes = h.input.transport.readBytes.bind(h.input.transport)
  h.input.transport.readBytes = async (uri) => { try { return await readBytes(uri) } catch (error) { error.code = 'MISSING'; throw error } }
  h.input.transport.putJson = async (uri, value) => ({ ref: h.put(uri, value), value })
  h.input.transport.getService = async () => h.input.service
  h.input.transport.now = () => '2026-10-05T00:00:00Z'
  h.input.transport.entrypointSnapshot = () => ({ serviceEtag: 'synthetic', generation: '1' })
  h.input.transport.request = () => assert.fail('prepare must not read Job/controller/Workflow/Secret metadata')
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: profile.application.repository,
    GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: h.git.sourceRevision,
    GITHUB_WORKFLOW_SHA: h.git.sourceRevision, GITHUB_WORKFLOW_REF: profile.application.repository + '/' + profile.workflow.path + '@refs/heads/master',
    GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://synthetic.invalid',
    GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-in-memory-token', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
  const result = await executeOwnerStage({ stage: 'prepare', capsuleRef: intentRef.uri, capsuleSha256: intentRef.sha256,
    profile, transport: h.input.transport, environment, validateIntent: () => {},
    verifyRoutineRelease: async ({ intent, values, service }) => verifyRoutineRelease({ ...h.input, intent, values, service }) })
  assert.equal(result.value.facts.routine.smokeRotationContinuation.evidenceScope, 'OWNER_SEALED_APPLIED_ROTATION_REUSE')
  assert.deepEqual(result.value.facts.prerequisiteRefs.infra, h.input.intent.infraReceiptRef)
  h.objects.get(h.controlUri).metadata.generation = '18'
  await assert.rejects(() => executeOwnerStage({ stage: 'prepare', capsuleRef: intentRef.uri, capsuleSha256: intentRef.sha256,
    profile, transport: h.input.transport, environment, validateIntent: () => {},
    verifyRoutineRelease: async ({ intent, values, service }) => verifyRoutineRelease({ ...h.input, intent, values, service }) }), /SMOKE_REUSE_RECEIPT_INVALID/u)
})

async function advanceSmokeReuseHarness(h, sourceRevision, ordinal) {
  const priorReuseRef = h.input.intent.infraReceiptRef
  const releasedIntent = { ...h.input.intent, releaseId: 'SMOKE-REUSE-RELEASE-' + ordinal,
    sourceLockRef: h.put('gs://' + bucket + '/receipts/releases/SMOKE-REUSE-RELEASE-' + ordinal + '/source-lock.json',
      { ...h.sourceLock, releaseId: 'SMOKE-REUSE-RELEASE-' + ordinal }), sourceSha256: h.sourceLock.sourceSha256,
    deadlineAt: '2026-10-04T00:00:00Z' }
  const releasedBundle = buildBundle(releasedIntent.sourceRevision)
  releasedIntent.migrationManifestSha256 = releasedBundle.bundle.manifestSha256
  const baselineIntentRef = h.put('gs://' + bucket + '/receipts/releases/' + releasedIntent.releaseId + '/release-intent.json', releasedIntent)
  const paths = releasePaths(profile, releasedIntent, baselineIntentRef.sha256)
  const artifactDigest = profile.artifact.uri + '@sha256:' + (ordinal % 16).toString(16).repeat(64)
  const activeRevision = 'orgmaster-prod-reuse-' + ordinal
  const bundleRef = h.put('gs://' + bucket + '/source/migration-bundles/reuse-' + ordinal + '.json', releasedBundle.bundle)
  const deploymentRef = h.put(paths.deployment, { sourceRevision: releasedIntent.sourceRevision,
    releaseIntentRef: baselineIntentRef, migrationBundleRef: bundleRef, artifactDigest })
  const migrationRef = h.put(paths.migrate, stageReceipt({ profile, intent: releasedIntent, stage: 'migrate',
    facts: { disposition: 'UNCHANGED_VERIFIED', manifestSha256: releasedBundle.bundle.manifestSha256 }, observedAt: '2026-10-04T00:00:00Z' }))
  h.put(paths.candidate, stageReceipt({ profile, intent: releasedIntent, stage: 'candidate',
    facts: { deploymentCapsuleRef: deploymentRef, migrationReceiptRef: migrationRef, candidateRevision: activeRevision }, observedAt: '2026-10-04T00:00:00Z' }))
  h.put(paths.terminal, stageReceipt({ profile, intent: releasedIntent, stage: 'terminal',
    facts: { result: 'RELEASED', remainingHumanAction: 0, candidateRevision: activeRevision, artifactDigest }, observedAt: '2026-10-04T00:00:00Z' }))
  h.revision.containers[0].image = artifactDigest
  h.input.service = { traffic: [{ revision: activeRevision, percent: 100 }], trafficStatuses: [{ revision: activeRevision, percent: 100 }] }
  h.input.transport.effectiveRevision = () => activeRevision
  const controlCore = { schemaVersion: 'jenfu.dev012.owner-control-head.v1',
    inputFingerprint: sha256(canonicalize({ ownerApplicationId: 'orgmaster', releaseId: releasedIntent.releaseId,
      sourceRevision: releasedIntent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 })),
    ownerApplicationId: 'orgmaster', service: profile.target.serviceName, controlBucket: bucket,
    releaseId: releasedIntent.releaseId, sourceRevision: releasedIntent.sourceRevision,
    sourceLockSha256: releasedIntent.sourceLockRef.sha256, candidateRevision: activeRevision,
    previousRevision: releasedIntent.previousRevision, ownerRunRef: 'https://api.github.com/repos/' + profile.application.repository + '/actions/runs/12345',
    leaseExpiresAt: '2026-10-04T00:00:00Z', deadlineAt: releasedIntent.deadlineAt, state: 'FINALIZED', result: 'RELEASED' }
  h.setControl = (changes = {}) => { const core = { ...controlCore, ...changes }
    h.put(h.controlUri, { ...core, controlSha256: sha256(canonicalize(core)) })
    h.objects.get(h.controlUri).metadata = { generation: String(17 + ordinal) } }
  h.setControl()
  const releaseId = 'SMOKE-REUSE-CHAIN-' + ordinal
  h.git = { ...h.git, sourceRevision, remoteRevision: sourceRevision }
  h.sourceIdentityBytes = Buffer.from('own synthetic source identity ' + sourceRevision)
  const currentBundle = buildBundle(sourceRevision)
  h.sourceLock = buildSourceFreeze({ profile, releaseId, observedAt: '2026-10-05T00:00:00Z', git: h.git,
    sourceIdentityBytes: h.sourceIdentityBytes, migrationBundle: currentBundle })
  h.sourceLockRef = h.put('gs://' + bucket + '/receipts/releases/' + releaseId + '/source-lock.json', h.sourceLock)
  const baseline = { intent: releasedIntent, activeRevision }
  h.constructorInput = { ...h.constructorInput, releaseId, sourceLock: h.sourceLock, sourceLockRef: h.sourceLockRef, baselineIntentRef, baseline }
  h.reuse = await buildSmokeInfraReuseReceipt(h.constructorInput)
  const uri = 'gs://' + bucket + '/receipts/releases/' + releaseId + '/app-infra-reuse.json'
  h.select = (value = h.reuse, reseal = false) => {
    if (reseal) { const { receiptSha256: _seal, ...core } = value; value = { ...core, receiptSha256: sha256(canonicalize(core)) } }
    const ref = h.put(uri, value)
    h.options = parseDeployProductionArgs(['--check', '--infra-reuse-ref=' + ref.uri + '#sha256=' + ref.sha256])
    h.input.intent.infraReceiptRef = ref; h.input.values.infra = value
  }
  h.input.intent = { ...h.input.intent, releaseId: 'SMOKE-REUSE-NEXT-' + ordinal,
    sourceRevision, sourceSha256: h.sourceLock.sourceSha256, sourceLockRef: h.sourceLockRef,
    baselineIntentRef, previousRevision: activeRevision, migrationManifestSha256: currentBundle.bundle.manifestSha256 }
  for (const name of ['authorization', 'readiness']) Object.assign(h.input.values[name], {
    sourceRevision, releaseId: h.input.intent.releaseId, baselineIntentRef })
  h.input.values.sourceLock = { ...h.sourceLock, releaseId: h.input.intent.releaseId }
  h.input.buildMigrationBundle = async () => currentBundle
  h.select()
  h.requests.length = 0
  return { priorReuseRef, baselineIntentRef, releasedIntent, paths }
}

async function executeReusePrepareHarness(h) {
  const common = { projectId: profile.target.projectId, ownerApplicationId: 'orgmaster', status: 'PASS',
    releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND' }
  for (const name of ['authorization', 'readiness']) Object.assign(h.input.values[name], common,
    { environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00Z' })
  h.input.values.foundation = h.objects.get(h.input.intent.foundationReceiptRef.uri).value
  h.input.values.runtimeConfig = { ...common, runtimeConfig: h.input.values.runtimeConfig.runtimeConfig }
  for (const [name, field] of Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', runtimeConfig: 'runtimeConfigRef' }))
    h.input.intent[field] = h.put('gs://' + bucket + '/receipts/releases/' + h.input.intent.releaseId + '/' + name + '.json', h.input.values[name])
  h.input.intent.deadlineAt = '2999-01-01T00:00:00Z'
  const intentRef = h.put('gs://' + bucket + '/receipts/releases/' + h.input.intent.releaseId + '/release-intent.json', h.input.intent)
  const readBytes = h.input.transport.readBytes.bind(h.input.transport)
  h.input.transport.readBytes = async (uri) => { try { return await readBytes(uri) } catch (error) { error.code = 'MISSING'; throw error } }
  h.input.transport.putJson = async (uri, value) => ({ ref: h.put(uri, value), value })
  h.input.transport.getService = async () => h.input.service
  h.input.transport.now = () => '2026-10-05T00:00:00Z'
  h.input.transport.entrypointSnapshot = () => ({ serviceEtag: 'synthetic', generation: '1' })
  h.input.transport.request = () => assert.fail('prepare must not add provider metadata GET')
  h.input.transport.readControllerImageResolution = () => assert.fail('prepare must not add registry GET')
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: profile.application.repository,
    GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: h.git.sourceRevision,
    GITHUB_WORKFLOW_SHA: h.git.sourceRevision, GITHUB_WORKFLOW_REF: profile.application.repository + '/' + profile.workflow.path + '@refs/heads/master',
    GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://synthetic.invalid',
    GOOGLE_OAUTH_ACCESS_TOKEN: 'synthetic-in-memory-token', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
  return executeOwnerStage({ stage: 'prepare', capsuleRef: intentRef.uri, capsuleSha256: intentRef.sha256,
    profile, transport: h.input.transport, environment, validateIntent: () => {},
    verifyRoutineRelease: async ({ intent, values, service }) => verifyRoutineRelease({ ...h.input, intent, values, service }) })
}

test('consecutive source-only reuse passes the second real owner prepare without replacing its released baseline', async () => {
  const h = await smokeReuseHarness()
  const next = await advanceSmokeReuseHarness(h, 'd'.repeat(40), 1)
  assert.deepEqual(h.reuse.priorInfraReceiptRef, next.priorReuseRef)
  const result = await executeReusePrepareHarness(h)
  assert.deepEqual(result.value.facts.routine.baselineIntentRef, next.baselineIntentRef)
  assert.equal(result.value.facts.routine.previousRevision, 'orgmaster-prod-reuse-1')
  assert.deepEqual(result.value.facts.prerequisiteRefs.infra, h.input.intent.infraReceiptRef)
  assert.deepEqual(h.objects.get(h.rotationRef.uri).bytes, h.original)
})

test('consecutive source-only reuse passes the third real owner prepare and preserves every original sealed receipt', async () => {
  const h = await smokeReuseHarness()
  await advanceSmokeReuseHarness(h, 'd'.repeat(40), 1)
  const snapshots = new Map([...h.objects].filter(([uri]) => uri !== h.controlUri).map(([uri,row]) => [uri, Buffer.from(row.bytes)]))
  const next = await advanceSmokeReuseHarness(h, 'e'.repeat(40), 2)
  const result = await executeReusePrepareHarness(h)
  assert.deepEqual(h.reuse.priorInfraReceiptRef, next.priorReuseRef)
  assert.deepEqual(result.value.facts.routine.baselineIntentRef, next.baselineIntentRef)
  assert.equal(result.value.facts.routine.previousRevision, 'orgmaster-prod-reuse-2')
  for (const [uri,bytes] of snapshots) assert.deepEqual(h.objects.get(uri).bytes, bytes, uri)
  assert.equal(result.value.facts.routine.smokeRotationContinuation.newVersion, '8')
})

test('consecutive reuse rejects resealed historical owner, source, rotation, state, credential and input drift', async () => {
  const cases = [
    { ownerApplicationId: 'ai-pdm' }, { status: 'PLANNED' }, { sourceRevision: 'f'.repeat(40) },
    { sourceSha256: '0'.repeat(64) }, { sourceTree: 'f'.repeat(40) }, { reusedSourceRevision: 'f'.repeat(40) },
    { candidateSmokeRefreshTokenSecretVersion: '9' }, { stateSerial: 7 }, { stateLineage: 'wrong-lineage' },
    { stateJsonSha256: '0'.repeat(64) }, { outputManifestSha256: '0'.repeat(64) },
    { foundationManifestSha256: '0'.repeat(64) }, { terraformAddressCount: 69 }, { terraformAddressesSha256: '0'.repeat(64) },
    { migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'f'.repeat(64) },
    { controllerImageDigest: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:' + 'f'.repeat(64) },
    { executableInputCount: 1 }, { executableInputsSha256: '0'.repeat(64) }, { infrastructureInputsSha256: '0'.repeat(64) },
    { appliedObservedAt: '2026-10-05T00:00:00Z' },
    { credentialEvidenceRef: { uri: 'gs://' + bucket + '/receipts/credential-reauth/other.json', sha256: '0'.repeat(64) } },
    { reusedInfraReceiptRef: { uri: 'gs://' + bucket + '/receipts/releases/OTHER-ROTATION/app-infra.json', sha256: '0'.repeat(64) } },
  ]
  for (const change of cases) {
    const h = await smokeReuseHarness(); h.select({ ...h.reuse, ...change }, true)
    await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1), undefined, Object.keys(change).join(','))
    assert.equal(h.requests.length, 0)
  }
  const h = await smokeReuseHarness(); h.select({ ...h.reuse, receiptSha256: '0'.repeat(64) })
  await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1), /SMOKE_REUSE_RECEIPT_INVALID/u)
})

test('consecutive reuse joins both package and published source locks to their own immutable source and release', async () => {
  for (const change of [{ ownerApplicationId: 'ai-pdm' }, { clean: false }, { branch: 'feature' },
    { remoteRevision: 'f'.repeat(40) }, { releaseId: 'OTHER-RELEASE' }, { sourceSha256: '0'.repeat(64) },
    { migrationManifestSha256: '0'.repeat(64) }]) {
    const h = await smokeReuseHarness(), put = h.put
    h.put = (uri, value) => put(uri, uri.endsWith('/SMOKE-REUSE-RELEASE-1/source-lock.json') ? { ...value, ...change } : value)
    await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1), /SMOKE_REUSE_SOURCE_INVALID|SMOKE_REUSE_CHAIN_SOURCE_INVALID/u)
    assert.equal(h.requests.length, 0)
  }
  const h = await smokeReuseHarness()
  h.sourceLockRef = h.put(h.sourceLockRef.uri, { ...h.sourceLock, releaseId: 'OTHER-PACKAGE' })
  h.select({ ...h.reuse, sourceLockRef: h.sourceLockRef }, true)
  await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1), /SMOKE_REUSE_CHAIN_SOURCE_INVALID/u)
})

test('consecutive reuse requires each source-bound sealed terminal to be the corresponding released revision', async () => {
  for (const change of [{ ownerApplicationId: 'ai-pdm' }, { sourceRevision: 'f'.repeat(40) }, { releaseId: 'OTHER-RELEASE' },
    { status: 'FAIL' }, { stage: 'decision' }, { receiptSha256: '0'.repeat(64) },
    { facts: { result: 'PRE_ACTIVATION_ABORTED', remainingHumanAction: 0, candidateRevision: 'orgmaster-prod-reuse-1' } },
    { facts: { result: 'RELEASED', remainingHumanAction: 1, candidateRevision: 'orgmaster-prod-reuse-1' } },
    { facts: { result: 'RELEASED', remainingHumanAction: 0, candidateRevision: 'orgmaster-prod-stale' } }]) {
    const h = await smokeReuseHarness(), put = h.put
    h.put = (uri, value) => {
      if (uri.includes('/SMOKE-REUSE-RELEASE-1/') && value.stage === 'terminal') {
        const { receiptSha256: _seal, ...core } = { ...value, ...change }
        value = { ...core, receiptSha256: change.receiptSha256 ?? sha256(canonicalize(core)) }
      }
      return put(uri, value)
    }
    await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1), /SMOKE_REUSE_CHAIN_RELEASE_INVALID/u)
    assert.equal(h.requests.length, 0)
  }
  const h = await smokeReuseHarness(); await advanceSmokeReuseHarness(h, 'd'.repeat(40), 1)
  const parent = h.objects.get(h.reuse.baselineIntentRef.uri).value
  const old = h.objects.get(parent.infraReceiptRef.uri).value
  const anchor = h.objects.get(old.baselineIntentRef.uri)
  const terminalUri = releasePaths(profile, anchor.value, anchor.ref.sha256).terminal
  const row = h.objects.get(terminalUri), { receiptSha256: _seal, ...core } = row.value
  h.put(terminalUri, { ...core, facts: { ...core.facts, result: 'PRE_ACTIVATION_ABORTED' },
    receiptSha256: sha256(canonicalize({ ...core, facts: { ...core.facts, result: 'PRE_ACTIVATION_ABORTED' } })) })
  await assert.rejects(() => advanceSmokeReuseHarness(h, 'e'.repeat(40), 2))
})

test('consecutive reuse verifies raw bytes, same own refs and the exact terminal URI', async () => {
  for (const defect of ['bytes', 'ref', 'terminal-uri', 'prior-ref']) {
    const h = await smokeReuseHarness()
    if (defect === 'prior-ref') h.select({ ...h.reuse,
      priorInfraReceiptRef: { ...h.reuse.priorInfraReceiptRef, sha256: '0'.repeat(64) } }, true)
    else {
      const readJson = h.input.transport.readJson.bind(h.input.transport), readBytes = h.input.transport.readBytes.bind(h.input.transport)
      h.input.transport.readJson = async (ref) => {
        const row = await readJson(ref)
        if (ref.uri.endsWith('/SMOKE-REUSE-FIXTURE/app-infra-reuse.json')) return defect === 'bytes'
          ? { ...row, bytes: Buffer.from('forged') }
          : defect === 'ref' ? { ...row, ref: { ...row.ref, uri: row.ref.uri.replace('orgmaster-release', 'aipdm-release') } } : row
        return row
      }
      h.input.transport.readBytes = async (uri) => { const row = await readBytes(uri)
        return defect === 'terminal-uri' && uri.includes('/SMOKE-REUSE-RELEASE-1/') && row.value.stage === 'terminal'
          ? { ...row, ref: { ...row.ref, uri: uri.replace('SMOKE-REUSE-RELEASE-1', 'OTHER-RELEASE') } } : row }
    }
    await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1))
    assert.equal(h.requests.length, 0)
  }
})

test('third reuse reads ancestor executable, profile and full infrastructure bytes instead of trusting their stored hashes', async () => {
  for (const defect of ['executable', 'profile', 'tree', 'original-tree']) {
    const h = await smokeReuseHarness(); await advanceSmokeReuseHarness(h, 'd'.repeat(40), 1)
    if (defect === 'executable') h.sourceEdits.set('c'.repeat(40) + ':scripts/lib/dev012-production-migration-runner.mjs', Buffer.from('changed ancestor'))
    if (defect === 'profile') {
      const file = 'config/release/dev040-production-release-infra-plan.json'
      const plan = JSON.parse(fs.readFileSync(file)); plan.stageA.pop()
      h.sourceEdits.set('c'.repeat(40) + ':' + file, Buffer.from(JSON.stringify(plan)))
    }
    if (defect === 'tree' || defect === 'original-tree') h.constructorInput.readInfrastructureTree = (_root, revision) =>
      Buffer.from(revision === (defect === 'tree' ? 'c'.repeat(40) : oldSource) ? 'changed ancestor tree' : 'own complete source-frozen infra tree')
    await assert.rejects(() => advanceSmokeReuseHarness(h, 'e'.repeat(40), 2), /SMOKE_REUSE_CHAIN_INPUT_DRIFT/u)
    assert.equal(h.requests.length, 0)
  }
})

test('second real prepare rejects current control generation, source and own baseline tampering without new provider GET', async () => {
  for (const defect of ['generation', 'control-source', 'baseline', 'source']) {
    const h = await smokeReuseHarness(); await advanceSmokeReuseHarness(h, 'd'.repeat(40), 1)
    if (defect === 'generation') h.objects.get(h.controlUri).metadata.generation = '999'
    if (defect === 'control-source') h.setControl({ sourceRevision: 'f'.repeat(40) })
    if (defect === 'baseline') h.input.intent.baselineIntentRef = h.reuse.baselineIntentRef = { uri: 'gs://' + bucket + '/receipts/fixture/intent.json', sha256: '0'.repeat(64) }
    if (defect === 'source') h.input.values.sourceLock.sourceRevision = 'f'.repeat(40)
    await assert.rejects(() => executeReusePrepareHarness(h))
  }
})

test('consecutive reuse rejects a sealed cyclic prior pointer before following it', async () => {
  const h = await smokeReuseHarness()
  h.select({ ...h.reuse, priorInfraReceiptRef: structuredClone(h.input.intent.infraReceiptRef) }, true)
  await assert.rejects(() => advanceSmokeReuseHarness(h, 'd'.repeat(40), 1), /SMOKE_REUSE_CHAIN_CYCLE/u)
  assert.equal(h.requests.length, 0)
})

test('consecutive reuse accepts exactly 32 sealed reuse ancestors and fails closed at the next layer', async () => {
  assert.equal(MAX_SMOKE_REUSE_CHAIN_DEPTH, 32)
  const h = await smokeReuseHarness()
  for (let ordinal = 1; ordinal <= MAX_SMOKE_REUSE_CHAIN_DEPTH; ordinal++)
    await advanceSmokeReuseHarness(h, (ordinal + 16).toString(16).padStart(40, '0'), ordinal)
  await executeReusePrepareHarness(h)
  await assert.rejects(() => advanceSmokeReuseHarness(h, 'f'.repeat(40), MAX_SMOKE_REUSE_CHAIN_DEPTH + 1), /SMOKE_REUSE_CHAIN_DEPTH_EXCEEDED/u)
})

test('reuse CLI takes only exact own refs, permits bounded Principal recovery and excludes mutation modes', async () => {
  const h = await smokeReuseHarness()
  const arg = '--infra-reuse-ref=' + h.input.intent.infraReceiptRef.uri + '#sha256=' + h.input.intent.infraReceiptRef.sha256
  const proof = '--principal-only-recovery-ref=gs://' + bucket + '/receipts/releases/DEV057-PRINCIPAL-ONLY-RECOVERY/' + newSource + '.json#sha256=' + '1'.repeat(64)
  assert.ok(parseDeployProductionArgs([arg, proof]).principalOnlyRecoveryRef)
  assert.equal(parsePrerequisiteProducerArgs(['--stage', 'infra-reuse', '--release-id', 'REUSE-001', '--input', 'output/dev-012/inputs/reuse.json']).stage, 'infra-reuse')
  for (const args of [[arg, arg], [arg, '--dev014-activate'], [arg, '--smoke-rotation-ref=' + h.rotationRef.uri + '#sha256=' + h.rotationRef.sha256],
    [arg.replace('orgmaster-release', 'aipdm-release')], [arg.replace('app-infra-reuse.json', 'app-infra.json')]]) assert.throws(() => parseDeployProductionArgs(args))
  await assert.rejects(() => verifyDeployProductionRelease({ options: parseDeployProductionArgs(['--check']), ...h.input }), /SMOKE_REUSE_REF_REQUIRED/u)
})

test('reuse fails closed for wrong source, owner, seal, original receipt, numeric, baseline and protected source lock', async () => {
  for (const change of [{ ownerApplicationId: 'ai-pdm' }, { sourceRevision: newSource }, { sourceSha256: '0'.repeat(64) },
    { reusedSourceRevision: 'f'.repeat(40) }, { mutationProfile: 'APP_INFRA_SMOKE_CREDENTIAL_ROTATION' },
    { candidateSmokeRefreshTokenSecretVersion: '9' }, { stateSerial: 7 }, { appliedObservedAt: '2026-10-05T00:00:00Z' },
    { migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'f'.repeat(64) },
    { baselineIntentRef: { uri: 'gs://' + bucket + '/receipts/wrong.json', sha256: '1'.repeat(64) } }]) {
    const h = await smokeReuseHarness(); h.select({ ...h.reuse, ...change }, true)
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }))
    assert.equal(h.requests.length, 0)
  }
  const forged = await smokeReuseHarness(); forged.select({ ...forged.reuse, receiptSha256: '0'.repeat(64) })
  await assert.rejects(() => verifyRoutineRelease(forged.input), /SMOKE_REUSE_RECEIPT_INVALID/u)
  const dirty = await smokeReuseHarness(); dirty.input.values.sourceLock.clean = false
  await assert.rejects(() => verifyRoutineRelease(dirty.input), /SMOKE_REUSE_SOURCE_INVALID/u)
  for (const defect of ['missing', 'uid', 'templateHash', 'servingImage']) {
    const h = await smokeReuseHarness(); const value = structuredClone(h.reuse)
    if (defect === 'missing') delete value.liveTemplates
    if (defect === 'uid') delete value.liveTemplates.migrationJob.expectedUid
    if (defect === 'templateHash') value.liveTemplates.abortController.expectedTemplateSha256 = '0'.repeat(64)
    if (defect === 'servingImage') value.liveTemplates.abortController.servingImageDigest = value.migrationRunnerDigest
    h.select(value, true)
    h.input.transport.request = () => assert.fail('prepare proof validation must not use ungranted provider metadata')
    await assert.rejects(() => verifyRoutineRelease(h.input), /SMOKE_REUSE_RECEIPT_INVALID|CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
  }
})

test('reuse construction rejects full-address/state/output drift and changed copied executable or infrastructure', async () => {
  for (const defect of ['missing', 'duplicate', 'extra', 'missingData', 'duplicateData', 'extraData', 'serial', 'lineage', 'manifest', 'workflow', 'executable', 'tree']) {
    const h = await smokeReuseHarness()
    if (defect === 'missing') h.state.values.root_module.resources.pop()
    if (defect === 'duplicate') h.state.values.root_module.resources.push(h.state.values.root_module.resources[0])
    if (defect === 'extra') h.state.values.root_module.resources.push({ mode: 'managed', address: 'google_secret_manager_secret.sibling' })
    if (defect === 'missingData') h.state.values.root_module.resources = h.state.values.root_module.resources.filter((row) => row.address !== 'data.google_project.current')
    if (defect === 'duplicateData') h.state.values.root_module.resources.push(h.state.values.root_module.resources.find((row) => row.address === 'data.google_project.current'))
    if (defect === 'extraData') h.state.values.root_module.resources.push({ mode: 'data', address: 'data.google_project.sibling', values: {} })
    if (defect === 'serial') h.stateMeta.serial++
    if (defect === 'lineage') h.stateMeta.lineage = 'other'
    if (defect === 'manifest') h.manifest.controller_image_digest = 'sibling'
    if (defect === 'workflow') h.state.values.root_module.resources.find((row) => row.address === 'google_workflows_workflow.candidate_smoke[0]').values.source_contents += '\n'
    if (defect === 'executable') h.sourceEdits.set(h.git.sourceRevision + ':scripts/lib/dev012-production-migration-runner.mjs', Buffer.from('changed'))
    if (defect === 'tree') h.constructorInput.readInfrastructureTree = (_root, revision) => Buffer.from(revision)
    await assert.rejects(() => buildSmokeInfraReuseReceipt(h.constructorInput))
  }
})

test('reuse refuses aborted control/terminal/rollback joins and control or provider CAS drift', async () => {
  for (const defect of ['control', 'terminal', 'rollback', 'generation', 'workflowRevision', 'secret']) {
    const h = await smokeReuseHarness()
    if (defect === 'control') h.setControl({ previousRevision: 'wrong-revision' })
    if (defect === 'terminal' || defect === 'rollback') {
      const uri = h.failedPaths[defect], value = structuredClone(h.objects.get(uri).value)
      value.facts.previousRevision = 'wrong-revision'
      const { receiptSha256: _seal, ...core } = value
      h.put(uri, { ...core, receiptSha256: sha256(canonicalize(core)) })
    }
    if (defect === 'generation') {
      const read = h.input.transport.readBytes.bind(h.input.transport); let count = 0
      h.input.transport.readBytes = async (uri) => { const row = await read(uri); return uri === h.controlUri ? { ...row, metadata: { generation: String(17 + count++) } } : row }
    }
    if (defect === 'workflowRevision') {
      const request = h.input.transport.request; let count = 0
      h.input.transport.request = async (url) => { const value = await request(url); return url.includes('workflows.googleapis.com') ? { ...value, revisionId: String(count++) } : value }
    }
    if (defect === 'secret') h.secret.state = 'DISABLED'
    await assert.rejects(() => buildSmokeInfraReuseReceipt({ ...h.constructorInput, transport: h.input.transport }))
  }
  const h = await smokeReuseHarness(); h.objects.get(h.controlUri).metadata.generation = '18'
  await assert.rejects(() => verifyRoutineRelease(h.input), /SMOKE_REUSE_RECEIPT_INVALID/u)
})

test('reuse operator rechecks provider state and exact Workflow revision after immutable-chain validation', async () => {
  const state = await smokeReuseHarness(); state.stateMeta.serial++
  await assert.rejects(() => verifyDeployProductionRelease({ options: state.options, ...state.input }), /SMOKE_REUSE_STATE_DRIFT/u)
  const workflow = await smokeReuseHarness(); workflow.workflow.revisionId = 'new-provider-revision'
  await assert.rejects(() => verifyDeployProductionRelease({ options: workflow.options, ...workflow.input }), /SMOKE_REUSE_PROVIDER_CAS_CHANGED/u)
  assert.ok(workflow.requests.every((url) => !url.includes(':access')))
})

test('operator native reuse verifies every live Job/controller template field, including command, SQL, environment, Secret and unexpected fields', async () => {
  for (const defect of ['image', 'identity', 'command', 'args', 'sql', 'env', 'secret', 'timeout', 'scaling', 'unknown', 'etag', 'uid', 'generation']) {
    const h = await smokeReuseHarness()
    if (defect === 'image') h.job.template.template.containers[0].image = manifestDigest('f')
    if (defect === 'identity') h.job.template.template.serviceAccount = profile.target.runtimeServiceAccount
    if (defect === 'command') h.job.template.template.containers[0].command = ['sh']
    if (defect === 'args') h.job.template.template.containers[0].args = ['--dangerous']
    if (defect === 'sql') h.job.template.template.volumes[0].cloudSqlInstance.instances = ['sibling:region:instance']
    if (defect === 'env') h.job.template.template.containers[0].env.push({ name: 'NODE_OPTIONS', value: '--require=malicious' })
    if (defect === 'secret') h.controller.template.containers[0].env[0].valueSource.secretKeyRef.version = '2'
    if (defect === 'timeout') h.controller.template.timeout = '61s'
    if (defect === 'scaling') h.controller.template.scaling.maxInstanceCount = 2
    if (defect === 'unknown') h.controller.template.injectedSecurityConfiguration = 'unexpected'
    if (defect === 'etag') h.job.etag = 'job-e2'
    if (defect === 'uid') h.controller.uid = 'replacement-uid'
    if (defect === 'generation') { h.job.generation = '3'; h.job.observedGeneration = '3' }
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }), /SMOKE_REUSE_(LIVE_TEMPLATE_DRIFT|PROVIDER_CAS_CHANGED)/u)
  }
  function manifestDigest(char) { return profile.artifact.migrationRunnerUri + '@sha256:' + char.repeat(64) }
  const h = await smokeReuseHarness()
  assert.throws(() => smokeInfraTemplateProjection({ secret: 'projects/other/secrets/own' }, profile), /SMOKE_REUSE_TEMPLATE_INVALID/u)
  assert.throws(() => smokeInfraTemplateProjection({ env: [{ name: 'DUP' }, { name: 'DUP' }] }, profile), /SMOKE_REUSE_TEMPLATE_INVALID/u)
})

test('reuse refuses an old or unready controller serving revision/image and incomplete traffic despite a matching latest template', async () => {
  for (const defect of ['traffic', 'status', 'tag', 'created', 'image', 'ready']) {
    const h = await smokeReuseHarness()
    if (defect === 'traffic') h.controller.traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', percent: 100, revision: 'old-controller' }]
    if (defect === 'status') h.controller.trafficStatuses = []
    if (defect === 'tag') h.controller.trafficStatuses[0].tag = 'unreviewed'
    if (defect === 'created') h.controller.latestCreatedRevision = h.controller.name + '/revisions/new-unready-controller'
    if (defect === 'image') h.controllerRevision.containers[0].image = h.job.template.template.containers[0].image
    if (defect === 'ready') h.controllerRevision.conditions[0].state = 'CONDITION_FAILED'
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }), /SMOKE_REUSE_CONTROLLER_SERVING_INVALID|CONTROLLER_IMAGE_RESOLUTION_INVALID|CONTROLLER_MANIFEST_READ_FAILED/u)
  }
})

test('OCI controller index resolves only its proven amd64 child and native prepare revalidates raw manifests offline', async () => {
  const h = await smokeReuseHarness({ oci: true })
  const controller = h.reuse.liveTemplates.abortController
  assert.notEqual(controller.servingImageDigest, h.reuse.controllerImageDigest)
  assert.equal(controller.servingImageResolution.mode, 'OCI_INDEX_LINUX_AMD64')
  assert.equal((await verifyDeployProductionRelease({ options: h.options, ...h.input })).migrationDisposition, 'UNCHANGED_VERIFIED')
  h.input.transport.request = () => assert.fail('prepare cannot add provider GET')
  h.input.transport.readControllerImageResolution = () => assert.fail('prepare cannot add registry GET')
  assert.equal((await verifyRoutineRelease(h.input)).smokeRotationContinuation.evidenceScope, 'OWNER_SEALED_APPLIED_ROTATION_REUSE')
  const corrupted = structuredClone(h.reuse)
  corrupted.liveTemplates.abortController.servingImageResolution.childManifest.rawBytesBase64 = Buffer.from('wrong child').toString('base64')
  h.select(corrupted, true)
  await assert.rejects(() => verifyRoutineRelease(h.input), /CONTROLLER_IMAGE_RESOLUTION_INVALID/u)
})

test('ordinary CLI without an option preserves the original baseline and does not read smoke metadata', async () => {
  const h = harness()
  const options = parseDeployProductionArgs(['--check'])
  assert.equal(selectDeployInfrastructureRef(options, { intent: h.input.intent }), h.input.intent.infraReceiptRef)
  h.input.transport.request = () => assert.fail('ordinary no-option must not add provider metadata requests')
  const result = await verifyDeployProductionRelease({ options, ...h.input })
  assert.equal(result.releaseMode, 'ROUTINE_UNCHANGED_RUNTIME')
  assert.equal(result.smokeRotationContinuation, undefined)
})

test('actual ordinary CLI selection through routine decision accepts an own completed rotation and live exact numeric metadata', async () => {
  const h = smokeContinuationHarness()
  const result = await verifyDeployProductionRelease({ options: h.options, ...h.input })
  assert.equal(result.releaseMode, 'ROUTINE_UNCHANGED_RUNTIME')
  assert.equal(result.migrationDisposition, 'UNCHANGED_VERIFIED')
  assert.equal(result.pendingMigrationCount, 0)
  assert.equal(result.liveLedgerRead, false)
  assert.equal(result.smokeRotationContinuation.newVersion, '8')
  // The native v2 readback CLI adds one explicitly packaged helper to the
  // complete executable-input closure; it must not reuse the old image.
  assert.equal(result.smokeRotationContinuation.executableInputCount, 18)
  assert.equal(result.smokeRotationContinuation.terraformAddressCount, h.addresses.length)
  assert.equal(result.smokeRotationContinuation.providerCurrentReadback, false)
  assert.equal(result.operatorSmokeRotationReadback.evidenceScope, 'OPERATOR_PROVIDER_CURRENT_METADATA')
  assert.equal(result.operatorSmokeRotationReadback.exactNumericVersion, '8')
  assert.equal(h.requests.length, 3)
  assert.ok(h.requests.every((url) => !url.includes(':access')))
})

test('native prepare routine rechecks immutable rotation and Principal proof without operator metadata IAM', async () => {
  const h = smokeContinuationHarness()
  h.input.transport.request = () => assert.fail('prepare must not read Secret/Workflow provider metadata')
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.smokeRotationContinuation.assuranceLevel, 'aal1')
  assert.equal(result.smokeRotationContinuation.principalId, 'principal-synthetic-001')
  assert.equal(result.operatorSmokeRotationReadback, undefined)
})

test('ordinary rotation CLI rejects absolute/sibling/mutable/noncanonical refs and mixing historical modes', () => {
  const h = smokeContinuationHarness()
  const own = '--smoke-rotation-ref=' + h.input.intent.infraReceiptRef.uri + '#sha256=' + h.input.intent.infraReceiptRef.sha256
  for (const ref of ['C:/tmp/input.json', own.slice(21).replace('orgmaster-release', 'aipdm-release'),
    own.slice(21).replace('/SMOKE-ROTATION-FIXTURE/', '/../'), own.slice(21).replace('app-infra.json', 'other.json'),
    own.slice(21).replace('#sha256=', '#sha256=FF')]) assert.throws(() => parseDeployProductionArgs(['--smoke-rotation-ref=' + ref]))
  assert.throws(() => parseDeployProductionArgs([own, '--dev014-activate']))
  assert.throws(() => parseDeployProductionArgs([own, '--check', own]))
  const historical = parseDeployProductionArgs(['--check', '--dev057-principal-grants-v4-remediation',
    '--dev057-infra-ref=' + h.input.intent.infraReceiptRef.uri + '#sha256=' + h.input.intent.infraReceiptRef.sha256])
  assert.equal(historical.dev057PrincipalGrantsV4Remediation, true)
  assert.equal(historical.smokeRotationRef, null)
})

test('rotation continuation rejects wrong owner/source/mutation, forged seal and infrastructure drift before provider reads', async () => {
  for (const rotation of [{ ownerApplicationId: 'ai-pdm' }, { sourceRevision: oldSource }, { mutationProfile: 'APP_INFRA_IMAGE_ROTATION' },
    { projectId: 'other-project' }, { region: 'asia-northeast1' }, { foundationManifestSha256: 'f'.repeat(64) },
    { migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'f'.repeat(64) },
    { controllerImageDigest: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:' + 'f'.repeat(64) },
    { terraformAddressCount: 1 }, { terraformAddressesSha256: 'f'.repeat(64) }, { stateLineage: 'b1234567-0123-4567-89ab-0123456789ab' },
    { stateSerial: 5 }, { candidateSmokeRefreshTokenSecretVersion: '9' }]) {
    const h = smokeContinuationHarness(); h.update({ rotation })
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }))
    assert.equal(h.requests.length, 0)
  }
  const forged = smokeContinuationHarness(); forged.update({ reseal: false })
  await assert.rejects(() => verifyDeployProductionRelease({ options: forged.options, ...forged.input }), /SMOKE_ROTATION_INFRA_INVALID/u)
})

test('rotation continuation rejects wrong Principal/AAL, partial outcome, sibling credential and stale-at-apply proof', async () => {
  for (const proof of [{ assuranceLevel: 'aal2' }, { principalId: '' }, { status: 'PARTIAL' }, { sourceRevision: oldSource },
    { passwordAuthenticated: false }, { credentialMaterialPresent: true }, { authTime: Math.floor(Date.parse('2026-09-23T07:50:00Z') / 1000) }]) {
    const h = smokeContinuationHarness(); h.update({ proof })
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }))
    assert.equal(h.requests.length, 0)
  }
  const expired = smokeContinuationHarness(); expired.update({ rotation: { observedAt: '2026-09-23T08:06:00Z' } })
  await assert.rejects(() => verifyDeployProductionRelease({ options: expired.options, ...expired.input }), /REAUTH_RECEIPT_FRESHNESS_INVALID/u)
  const sibling = smokeContinuationHarness(); sibling.update({ rotation: { credentialEvidenceRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/credential-reauth/x.json', sha256: '1'.repeat(64) } } })
  await assert.rejects(() => verifyDeployProductionRelease({ options: sibling.options, ...sibling.input }))
})

test('rotation continuation rejects changed copied executable, complete profile, runtime, migration and traffic', async () => {
  for (const defect of ['executable', 'profile', 'runtime', 'migration', 'traffic']) {
    const h = smokeContinuationHarness()
    if (defect === 'executable') h.sourceEdits.set(newSource + ':scripts/lib/dev012-production-migration-runner.mjs', Buffer.from('changed executable'))
    if (defect === 'profile') { const file = 'config/release/dev040-production-release-infra-plan.json'; const value = JSON.parse(fs.readFileSync(file)); value.stageA.pop(); h.sourceEdits.set(newSource + ':' + file, Buffer.from(JSON.stringify(value))) }
    if (defect === 'runtime') h.input.values.runtimeConfig.runtimeConfig.secretVersions.ORGMASTER_POSTGRES_URL = '2'
    if (defect === 'migration') h.input.buildMigrationBundle = async () => ({ bundle: { ...newBundle.bundle, manifestSha256: '9'.repeat(64) } })
    if (defect === 'traffic') h.input.intent.previousRevision = 'orgmaster-prod-other'
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }))
    assert.equal(h.requests.length, 0)
  }
})

test('operator live metadata rejects wrong Workflow source/account/state and noncurrent or disabled own Secret', async () => {
  for (const defect of ['source', 'account', 'state', 'version', 'disabled']) {
    const h = smokeContinuationHarness()
    if (defect === 'source') h.workflow.sourceContents = h.workflow.sourceContents.replace('version: "8"', 'version: "7"')
    if (defect === 'account') h.workflow.serviceAccount = 'projects/jenfu-platform-prod/serviceAccounts/other'
    if (defect === 'state') h.workflow.state = 'UNAVAILABLE'
    if (defect === 'version') h.secret.name = h.secret.name.replace('/8', '/9')
    if (defect === 'disabled') h.secret.state = 'DISABLED'
    await assert.rejects(() => verifyDeployProductionRelease({ options: h.options, ...h.input }), /SMOKE_ROTATION_(WORKFLOW_DRIFT|PROVIDER_VERSION_INVALID)/u)
  }
})

test('immutable-ref corruption or provider transport fault fails closed and never grants continuation', async () => {
  const corrupt = smokeContinuationHarness()
  corrupt.input.intent.infraReceiptRef = { ...corrupt.input.intent.infraReceiptRef, sha256: '0'.repeat(64) }
  await assert.rejects(() => verifyDeployProductionRelease({ options: corrupt.options, ...corrupt.input }))
  const offline = smokeContinuationHarness(); offline.input.transport.request = async () => { throw Error('provider unavailable') }
  await assert.rejects(() => verifyDeployProductionRelease({ options: offline.options, ...offline.input }))
})

test('Workflow source renderer reproduces the sealed existing Org numeric-7 source bytes', () => {
  const value = expectedSmokeWorkflowSource({ root: '.', sourceRevision: newSource, profile, version: '7', readSourceFile: (_root, _revision, file) => fs.readFileSync(file) })
  assert.equal(sha256(value), '9ba919ee180f6b5d7a7cc068dc1b402271c9dfeff61a7a3e5d9b9f048e15a559')
})


// A second credential rotation follows a real released source-reuse baseline.
// Neither the latest baseline nor its historical rotation is rewritten.
async function freshRotationAfterReuseHarness() {
  const h = await smokeReuseHarness()
  await advanceSmokeReuseHarness(h, 'd'.repeat(40), 1)
  const historical = new Map([...h.objects].map(([uri,row]) => [uri, Buffer.from(row.bytes)]))
  const published = h.objects.get(h.rotationRef.uri).value
  const credential = buildReauthReceipt({ sourceRevision: h.git.sourceRevision,
    expected: { issuer: EXPECTED.issuer, subject: 'synthetic-provider-subject-001' },
    authTime: Math.floor(Date.parse('2026-10-05T00:00:00Z') / 1000),
    authenticatedAt: '2026-10-05T00:00:01Z', observedAt: '2026-10-05T00:00:02Z',
    principal: { principalId: 'principal-synthetic-001', employeeId: 'employee-synthetic-001' },
    previousVersion: '8', newVersion: '9' })
  h.workflow.sourceContents = expectedSmokeWorkflowSource({ ...h.input, sourceRevision: h.git.sourceRevision, version:'9' })
  h.workflow.revisionId = '000009-synthetic'
  h.secret.name = 'projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/9'
  h.state.values.root_module.resources.find(row => row.address === 'google_workflows_workflow.candidate_smoke[0]').values.source_contents = h.workflow.sourceContents
  h.manifest.source_revision = h.git.sourceRevision
  h.stateMeta.serial = published.stateSerial + 1
  const request = h.input.transport.request
  h.input.transport.request = async url => {
    if (url === 'https://secretmanager.googleapis.com/v1/projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/9') {
      h.requests.push(url); return h.secret
    }
    return request(url)
  }
  const seal = value => { const {receiptSha256:_old,...core}=value; return {...core,receiptSha256:sha256(canonicalize(core))} }
  const rotationUri = 'gs://' + bucket + '/receipts/releases/FRESH-ROTATION-9/app-infra.json'
  const selectFresh = ({rotation={},proof={}}={}) => {
    const proofRef=h.put('gs://' + bucket + '/receipts/credential-reauth/fresh-9.json',seal({...credential,...proof}))
    const fresh=seal({...published,sourceRevision:h.git.sourceRevision,stateSerial:h.stateMeta.serial,
      stateJsonSha256:sha256(canonicalize(h.state)),outputManifestSha256:sha256(canonicalize(h.manifest)),
      candidateSmokeRefreshTokenSecretVersion:'9',credentialEvidenceRef:proofRef,observedAt:'2026-10-05T00:00:03Z',...rotation})
    h.freshRef=h.put(rotationUri,fresh)
    h.input.intent.infraReceiptRef=h.freshRef;h.input.values.infra=fresh
    h.options=parseDeployProductionArgs(['--check','--smoke-rotation-ref='+h.freshRef.uri+'#sha256='+h.freshRef.sha256])
  }
  selectFresh()
  h.requests.length=0
  return Object.assign(h,{historical,selectFresh})
}

test('fresh smoke rotation after released reuse passes CLI and native prepare with the latest baseline', async () => {
  const h=await freshRotationAfterReuseHarness()
  const baselineRef=structuredClone(h.input.intent.baselineIntentRef)
  const verification=await verifyDeployProductionRelease({options:h.options,...h.input})
  assert.equal(verification.smokeRotationContinuation.previousVersion,'8')
  assert.equal(verification.smokeRotationContinuation.newVersion,'9')
  const result=await executeReusePrepareHarness(h)
  assert.deepEqual(result.value.facts.routine.baselineIntentRef,baselineRef)
  assert.equal(result.value.facts.routine.previousRevision,'orgmaster-prod-reuse-1')
  for(const [uri,bytes] of h.historical) assert.deepEqual(h.objects.get(uri).bytes,bytes,uri)
})

async function sourceReuseAfterFreshRotationHarness() {
  const h=await freshRotationAfterReuseHarness()
  const releaseId='FRESH-ROTATION-9-REUSE',sourceRevision='e'.repeat(40)
  h.git={...h.git,sourceRevision,sourceTree:sourceRevision,remoteRevision:sourceRevision}
  h.sourceIdentityBytes=Buffer.from('fresh own source identity '+sourceRevision)
  h.sourceLock=buildSourceFreeze({profile,releaseId,observedAt:'2026-10-05T00:00:04Z',git:h.git,
    sourceIdentityBytes:h.sourceIdentityBytes,migrationBundle:buildBundle(sourceRevision)})
  h.sourceLockRef=h.put('gs://'+bucket+'/receipts/releases/'+releaseId+'/source-lock.json',h.sourceLock)
  h.constructorInput={...h.constructorInput,releaseId,sourceLock:h.sourceLock,sourceLockRef:h.sourceLockRef,rotationRef:h.freshRef,observedAt:'2026-10-05T00:00:04Z'}
  const reuse=await buildSmokeInfraReuseReceipt(h.constructorInput)
  const reuseRef=h.put('gs://'+bucket+'/receipts/releases/'+releaseId+'/app-infra-reuse.json',reuse)
  h.input.intent={...h.input.intent,sourceRevision,sourceSha256:h.sourceLock.sourceSha256,migrationManifestSha256:h.sourceLock.migrationManifestSha256,infraReceiptRef:reuseRef}
  for(const name of ['authorization','readiness'])h.input.values[name].sourceRevision=sourceRevision
  h.input.values.sourceLock={...h.sourceLock,releaseId:h.input.intent.releaseId};h.input.values.infra=reuse
  h.input.buildMigrationBundle=async()=>buildBundle(sourceRevision)
  h.options=parseDeployProductionArgs(['--check','--infra-reuse-ref='+reuseRef.uri+'#sha256='+reuseRef.sha256])
  h.reuse=reuse
  return h
}

test('fresh smoke rotation supports a subsequent source-only reuse without rewriting history', async () => {
  const h=await sourceReuseAfterFreshRotationHarness()
  const verification=await verifyDeployProductionRelease({options:h.options,...h.input})
  assert.equal(verification.smokeRotationContinuation.newVersion,'9')
  const result=await executeReusePrepareHarness(h)
  assert.equal(result.value.facts.routine.previousRevision,'orgmaster-prod-reuse-1')
  for(const [uri,bytes] of h.historical)assert.deepEqual(h.objects.get(uri).bytes,bytes,uri)
})

test('published fresh-rotation reuse supports the next release across both rotation histories', async () => {
  const h=await sourceReuseAfterFreshRotationHarness()
  const next=await advanceSmokeReuseHarness(h,'f'.repeat(40),2)
  const snapshots=new Map([...h.objects].filter(([uri])=>uri!==h.controlUri).map(([uri,row])=>[uri,Buffer.from(row.bytes)]))
  const verification=await verifyDeployProductionRelease({options:h.options,...h.input})
  assert.equal(verification.smokeRotationContinuation.newVersion,'9')
  assert.deepEqual(verification.baselineIntentRef,next.baselineIntentRef)
  const result=await executeReusePrepareHarness(h)
  assert.equal(result.value.facts.routine.previousRevision,'orgmaster-prod-reuse-2')
  for(const [uri,bytes] of snapshots)assert.deepEqual(h.objects.get(uri).bytes,bytes,uri)
})

test('a third adjacent rotation validates both earlier released histories before the next owner prepare', async () => {
  const h = await sourceReuseAfterFreshRotationHarness()
  await advanceSmokeReuseHarness(h, 'f'.repeat(40), 2)
  const historical = new Map([...h.objects].filter(([uri]) => uri !== h.controlUri)
    .map(([uri, row]) => [uri, Buffer.from(row.bytes)]))
  const prior = h.objects.get(h.freshRef.uri).value
  const credential = buildReauthReceipt({ sourceRevision: h.git.sourceRevision,
    expected: { issuer: EXPECTED.issuer, subject: 'synthetic-provider-subject-001' },
    authTime: Math.floor(Date.parse('2026-10-05T00:00:00Z') / 1000),
    authenticatedAt: '2026-10-05T00:00:01Z', observedAt: '2026-10-05T00:00:02Z',
    principal: { principalId: 'principal-synthetic-001', employeeId: 'employee-synthetic-001' },
    previousVersion: '9', newVersion: '10' })
  const credentialRef = h.put('gs://' + bucket + '/receipts/credential-reauth/fresh-10.json', credential)
  h.workflow.sourceContents = expectedSmokeWorkflowSource({ ...h.input, sourceRevision: h.git.sourceRevision, version: '10' })
  h.workflow.revisionId = '000010-synthetic'
  h.secret.name = 'projects/9536592944/secrets/orgmaster-prod-smoke-firebase-refresh-token/versions/10'
  h.state.values.root_module.resources.find(row => row.address === 'google_workflows_workflow.candidate_smoke[0]')
    .values.source_contents = h.workflow.sourceContents
  h.manifest.source_revision = h.git.sourceRevision
  h.stateMeta.serial = prior.stateSerial + 1
  const request = h.input.transport.request
  h.input.transport.request = async url => {
    if (url === 'https://secretmanager.googleapis.com/v1/' + h.secret.name) {
      h.requests.push(url); return h.secret
    }
    return request(url)
  }
  const { receiptSha256: _seal, ...priorCore } = prior
  const core = { ...priorCore, sourceRevision: h.git.sourceRevision, stateSerial: h.stateMeta.serial,
    stateJsonSha256: sha256(canonicalize(h.state)), outputManifestSha256: sha256(canonicalize(h.manifest)),
    candidateSmokeRefreshTokenSecretVersion: '10', credentialEvidenceRef: credentialRef, observedAt: '2026-10-05T00:00:03Z' }
  const rotation = { ...core, receiptSha256: sha256(canonicalize(core)) }
  const ref = h.put('gs://' + bucket + '/receipts/releases/FRESH-ROTATION-10/app-infra.json', rotation)
  h.input.intent.infraReceiptRef = ref; h.input.values.infra = rotation
  h.options = parseDeployProductionArgs(['--check', '--smoke-rotation-ref=' + ref.uri + '#sha256=' + ref.sha256])
  const verification = await verifyDeployProductionRelease({ options: h.options, ...h.input })
  assert.equal(verification.smokeRotationContinuation.previousVersion, '9')
  assert.equal(verification.smokeRotationContinuation.newVersion, '10')
  const result = await executeReusePrepareHarness(h)
  assert.equal(result.value.facts.routine.previousRevision, 'orgmaster-prod-reuse-2')
  for (const [uri, bytes] of historical) assert.deepEqual(h.objects.get(uri).bytes, bytes, uri)
})

test('fresh smoke rotation rejects stale state, wrong version, owner, executable and unverified credentials before provider reads', async () => {
  for(const defect of [
    {rotation:{stateSerial:6}}, {rotation:{stateLineage:'wrong-lineage'}},
    {rotation:{ownerApplicationId:'ai-pdm'}}, {rotation:{terraformAddressCount:74}},
    {rotation:{controllerImageDigest:'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:'+'f'.repeat(64)}},
    {proof:{secret:{id:EXPECTED.secretId,previousVersion:'7',newVersion:'9',state:'ENABLED'}}},
    {proof:{emailVerified:false}}, {proof:{sourceRevision:'f'.repeat(40)}},
  ]){
    const h=await freshRotationAfterReuseHarness();h.selectFresh(defect)
    await assert.rejects(()=>verifyDeployProductionRelease({options:h.options,...h.input}))
    assert.equal(h.requests.length,0)
    for(const [uri,bytes] of h.historical)assert.deepEqual(h.objects.get(uri).bytes,bytes,uri)
  }
})

test('fresh smoke rotation rejects tampered historical rotation references without selecting an older baseline', async () => {
  const h=await freshRotationAfterReuseHarness()
  const prior=h.objects.get(h.rotationRef.uri).value
  const {receiptSha256:_old,...core}=prior
  const forged={...core,stateSerial:999}
  h.put(h.rotationRef.uri,{...forged,receiptSha256:sha256(canonicalize(forged))})
  // The fixture transport rejects a changed immutable byte hash before the verifier.
  await assert.rejects(()=>verifyDeployProductionRelease({options:h.options,...h.input}))
  assert.equal(h.requests.length,0)
})


test('fresh smoke rotation reuse rejects malformed numeric versions even with a matching provider projection', async () => {
  for(const version of ['0','09','-1','NaN','9007199254740992']){
    const h=await smokeReuseHarness()
    h.select({...h.reuse,candidateSmokeRefreshTokenSecretVersion:version,
      providerReadback:{...h.reuse.providerReadback,exactNumericVersion:version}},true)
    await assert.rejects(()=>verifyDeployProductionRelease({options:h.options,...h.input}),/SMOKE_REUSE_RECEIPT_INVALID/u)
    assert.equal(h.requests.length,0)
  }
})

test('DEV-014 lifecycle v2 adds only a default-off guard to the released runtime', async () => {
  const beforeProfile = structuredClone(profile)
  const field = 'ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED'
  beforeProfile.environment.requiredPlainEnvironmentNames = beforeProfile.environment.requiredPlainEnvironmentNames.filter(name => name !== field)
  delete beforeProfile.environment.controlledValues[field]
  const beforePlain = { ...runtime.plainEnvironment }; delete beforePlain[field]
  const beforeRuntime = buildRuntimeConfig(beforeProfile, { plainEnvironment: beforePlain, secretVersions: runtime.secretVersions })
  assert.equal(assertDev014PrincipalLifecycleRuntimeGuard(profile, beforeRuntime, runtime), runtime)
  const enabled = buildRuntimeConfig(profile, { plainEnvironment: resolvePlainEnvironment(profile, runtime.plainEnvironment, { [field]: 'true' }), secretVersions: runtime.secretVersions })
  assert.throws(() => assertDev014PrincipalLifecycleRuntimeGuard(profile, beforeRuntime, enabled), /DEV014_PRINCIPAL_LIFECYCLE_RUNTIME_GUARD_INVALID/)
  assert.throws(() => assertDev014PrincipalLifecycleRuntimeGuard(profile, enabled, runtime), /DEV014_PRINCIPAL_LIFECYCLE_RUNTIME_GUARD_INVALID/)
  assert.throws(() => assertDev014PrincipalLifecycleRuntimeGuard(profile, beforeRuntime, { ...runtime, secretVersions: { ...runtime.secretVersions, ORGMASTER_SESSION_HASH_PEPPER: '2' } }), /DEV014_PRINCIPAL_LIFECYCLE_RUNTIME_GUARD_INVALID/)
  assert.throws(() => assertDev014PrincipalLifecycleRuntimeGuard(profile, beforeRuntime, { ...runtime, plainEnvironment: { ...runtime.plainEnvironment, ORGMASTER_POSTGRES_POOL_MAX: '7' } }), /DEV014_PRINCIPAL_LIFECYCLE_RUNTIME_GUARD_INVALID/)
  const h = harness({ baselineRuntime: beforeRuntime, baselineBundle: prefixBundle(oldBundle.bundle, 30), currentBundle: newBundle })
  const authority = { schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-PRINCIPAL-LIFECYCLE-V2', remediation: DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION }
  h.input.values.authorization = { ...h.input.values.authorization, ...authority }
  h.input.values.readiness = { ...h.input.values.readiness, ...authority, schemaVersion: 'orgmaster.routine-release-readiness.v1' }
  attachForwardInfra(h)
  assert.equal((await verifyRoutineRelease(h.input)).releaseMode, 'DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION')
})

test('DEV-014 lifecycle v2 admits only 030-to-031 with an immutable prefix and fresh source-matched runner', async () => {
  const baselineBundle = prefixBundle(oldBundle.bundle, 30)
  const currentBundle = { bundle: newBundle.bundle }
  const h = harness({ baselineBundle, currentBundle })
  const remediation = DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION
  h.input.values.authorization = { ...h.input.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', devId: 'DEV-014', slice: '014-PRINCIPAL-LIFECYCLE-V2', remediation }
  h.input.values.readiness = { ...h.input.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', devId: 'DEV-014', slice: '014-PRINCIPAL-LIFECYCLE-V2', remediation }
  attachForwardInfra(h)
  const result = await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode, 'DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION')
  assert.equal(result.pendingMigrationCount, 1)
  assert.equal(result.databaseVerification, 'OWNER_MIGRATION_JOB_REQUIRED_BEFORE_CANDIDATE')
  for (const field of ['order', 'version', 'path', 'sourceSha256', 'appliedSha256']) {
    const drift = structuredClone(currentBundle.bundle); drift.entries[30][field] = 'wrong'
    assert.throws(() => assertDev014PrincipalLifecycleV2Append(baselineBundle, drift), /DEV014_PRINCIPAL_LIFECYCLE_V2_APPEND_INVALID/)
  }
  const prefix = structuredClone(currentBundle.bundle); prefix.entries[29].sqlBase64 = 'drift'
  assert.throws(() => assertDev014PrincipalLifecycleV2Append(baselineBundle, prefix), /DEV014_PRINCIPAL_LIFECYCLE_V2_APPEND_INVALID/)
  assert.throws(() => assertDev014PrincipalLifecycleV2Append(prefixBundle(baselineBundle, 29), currentBundle.bundle), /DEV014_PRINCIPAL_LIFECYCLE_V2_APPEND_INVALID/)
  const extra = structuredClone(currentBundle.bundle); extra.entries.push(extra.entries[30])
  assert.throws(() => assertDev014PrincipalLifecycleV2Append(baselineBundle, extra), /DEV014_PRINCIPAL_LIFECYCLE_V2_APPEND_INVALID/)
  const wrong = structuredClone(h.input.values.readiness); wrong.remediation = { ...remediation, triggerDisposition: 'ENABLED' }
  assert.throws(() => assertDev014PrincipalLifecycleV2Remediation(wrong, h.input.values.authorization), /DEV014_PRINCIPAL_LIFECYCLE_V2_AUTHORITY_INVALID/)
  h.input.values.infra.sourceRevision = oldSource
  await assert.rejects(() => verifyRoutineRelease(h.input), /DEV013_MIGRATION_INFRA_RECEIPT_INVALID/)
})

test('DEV-014 lifecycle v2 CLI cannot combine historical remediation or use another owner infra receipt', () => {
  const ref = `gs://${bucket}/receipts/releases/DEV014-LIFECYCLE-V2/app-infra.json#sha256=${'a'.repeat(64)}`
  assert.equal(parseDeployProductionArgs(['--prepare-only', '--dev014-principal-lifecycle-v2-remediation', `--dev014-infra-ref=${ref}`]).dev014PrincipalLifecycleV2Remediation, true)
  for (const args of [[], [`--dev057-infra-ref=${ref}`], ['--dev014-contract-remediation', `--dev014-infra-ref=${ref}`]]) {
    assert.throws(() => parseDeployProductionArgs(['--prepare-only', '--dev014-principal-lifecycle-v2-remediation', ...args]), /DEV014_CONTROLLED_TRANSITION_INPUT_/)
  }
})


function lifecycleReplayHarness() {
  const infraProfile=JSON.parse(fs.readFileSync('config/release/dev040-production-release-infra-plan.json'))
  const addresses=[...infraProfile.stageA,...infraProfile.stageBAdditional].sort()
  const seal=core=>({...core,receiptSha256:sha256(canonicalize(core))})
  const previous=seal({schemaVersion:'jenfu.dev012.app-infra-receipt.v1',ownerApplicationId:'orgmaster',projectId:'jenfu-platform-prod',region:'asia-east1',sourceRevision:oldSource,
    foundationManifestSha256:'1'.repeat(64),migrationRunnerDigest:profile.artifact.migrationRunnerUri+'@sha256:'+'2'.repeat(64),controllerImageDigest:'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:'+'3'.repeat(64),terraformAddressCount:addresses.length,terraformAddressesSha256:sha256(canonicalize(addresses)),binaryPlanSha256:'4'.repeat(64),planJsonSha256:'5'.repeat(64),stateLineage:'11111111-2222-4333-8444-555555555555',stateSerial:10,stateJsonSha256:'6'.repeat(64),outputManifestSha256:'7'.repeat(64),status:'APPLIED',releaseAuthority:true,evidenceScope:'PRODUCTION_PROVIDER',observedAt:'2026-10-05T00:00:00Z'})
  const {receiptSha256:_before,...core}=previous
  const runner = profile.artifact.migrationRunnerUri+'@sha256:'+'8'.repeat(64)
  const template = image => ({name:profile.migrations.jobName,project:'jenfu-platform-prod',location:'asia-east1',template:[{template:[{service_account:profile.migrations.serviceAccount,containers:[{name:'migration',image,args:['--bundle-ref-required']}]}]}]})
  const imageRotation={schemaVersion:'jenfu.dev012.image-rotation-proof.v1',sourceRevision:newSource,planJsonSha256:core.planJsonSha256,
    addressActions:addresses.map(address=>[address,address==='google_cloud_run_v2_job.migration[0]'?'update':address.startsWith('data.')?'read':'no-op']),
    updates:[{address:'google_cloud_run_v2_job.migration[0]',before:template(previous.migrationRunnerDigest),after:template(runner)}]}
  const next=seal({...core,sourceRevision:newSource,migrationRunnerDigest:runner,stateSerial:11,observedAt:'2026-10-06T00:00:00Z',mutationProfile:'APP_INFRA_IMAGE_ROTATION',imageRotation})
  const h=harness({baselineInfra:previous})
  const authority={schemaVersion:'orgmaster.routine-release-authorization.v1',authorizationBasis:'OPERATOR_INVOKED_DEPLOY_PRODUCTION',devId:'DEV-014',slice:'014-PRINCIPAL-LIFECYCLE-V2',remediation:DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION}
  h.input.values.authorization={...h.input.values.authorization,...authority}
  h.input.values.readiness={...h.input.values.readiness,...authority,schemaVersion:'orgmaster.routine-release-readiness.v1'}
  h.input.values.infra=next;h.input.intent.infraReceiptRef=h.put('gs://'+bucket+'/receipts/fixture/replay-infra.json',next)
  h.input.readSourceFile=()=>Buffer.from(JSON.stringify(infraProfile))
  return {h,previous,next,infraProfile,seal}
}

test('DEV-014 installed 031 uses a fresh native checksum replay rather than smoke reuse or a skipped Job', async()=>{
  const {h}=lifecycleReplayHarness()
  const result=await verifyRoutineRelease(h.input)
  assert.equal(result.releaseMode,'DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION')
  assert.equal(result.migrationDisposition,'FORWARD_APPLY')
  assert.equal(result.pendingMigrationCount,0);assert.equal(result.replayOnly,true)
  assert.equal(result.databaseVerification,'OWNER_MIGRATION_JOB_REQUIRED_BEFORE_CANDIDATE')
  assert.equal(h.input.values.runtimeConfig.runtimeConfig.plainEnvironment.ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED,'false')
})

test('DEV-014 checksum replay rejects stale, sibling, incomplete or non-image infrastructure evidence',()=>{
  const f=lifecycleReplayHarness(),base={profile,intent:f.h.input.intent,baselineIntent:{sourceRevision:oldSource},infra:f.next,previousInfra:f.previous,infraProfile:f.infraProfile}
  assert.equal(assertDev014LifecycleReplayInfra(base).migrationRunnerDigest,f.next.migrationRunnerDigest)
  for(const change of [{sourceRevision:oldSource},{ownerApplicationId:'ai-pdm'},{evidenceScope:'LOCAL_SYNTHETIC'},
    {controllerImageDigest:f.previous.migrationRunnerDigest},{stateSerial:10},{stateLineage:'99999999-2222-4333-8444-555555555555'},
    {terraformAddressCount:f.next.terraformAddressCount-1},{terraformAddressesSha256:'0'.repeat(64)},
    {migrationRunnerDigest:f.previous.migrationRunnerDigest},{mutationProfile:'APP_INFRA_SMOKE_CREDENTIAL_ROTATION'},{binaryPlanSha256:'bad'}]){
    const {receiptSha256:_hash,...core}=f.next
    assert.throws(()=>assertDev014LifecycleReplayInfra({...base,infra:f.seal({...core,...change})}))
  }
  assert.throws(()=>assertDev014LifecycleReplayInfra({...base,infra:{...f.next,receiptSha256:'0'.repeat(64)}}))
})

test('DEV-014 replay requires an actual sealed applied-zero receipt and rejects DDL or synthetic skip',async()=>{
  const {h}=lifecycleReplayHarness(),plan=await verifyRoutineRelease(h.input)
  const seal=core=>({...core,receiptSha256:sha256(canonicalize(core))})
  const native=seal({schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'orgmaster',sourceRevision:newSource,manifestSha256:newBundle.bundle.manifestSha256,database:'jenfu_prod',ledger:'orgmaster_core.schema_migrations',status:'PASS',boundaryStatus:'PASS',baselineCount:10,minimumLedgerCount:10,ledgerCount:31,applied:0,replayed:31,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}]})
  assertMigrationReceipt(native,profile,h.input.intent,{allowForward:true,forwardPlan:plan})
  const {receiptSha256:_hash,...core}=native
  for (const change of [{database:'jenfu_stg'}, {ledger:'platform_core.schema_migrations'}, {crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_dev',denied:true}]}]) {
    assert.throws(()=>assertMigrationReceipt(seal({...core,...change}),profile,h.input.intent,{allowForward:true,forwardPlan:plan}),/MIGRATION_RECEIPT_INVALID/u)
  }
  assert.throws(()=>assertMigrationReceipt(seal({...core,applied:1,replayed:30}),profile,h.input.intent,{allowForward:true,forwardPlan:plan}),/MIGRATION_RECEIPT_INVALID/u)
  assert.throws(()=>assertMigrationReceipt({schemaVersion:'jenfu.dev012.stage-receipt.v1'},profile,h.input.intent,{allowForward:true,forwardPlan:plan}),/MIGRATION_RECEIPT_INVALID/u)
  h.input.values.runtimeConfig.runtimeConfig.plainEnvironment.ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED='true'
  await assert.rejects(()=>verifyRoutineRelease(h.input),/DEV014_PRINCIPAL_LIFECYCLE_RUNTIME_GUARD_INVALID/u)
})

test('DEV-014 replay requires the complete native image-only proof, not a digest difference',()=>{
  const f=lifecycleReplayHarness(),input={profile,intent:f.h.input.intent,baselineIntent:{sourceRevision:oldSource},infra:f.next,previousInfra:f.previous,infraProfile:f.infraProfile}
  const {receiptSha256:_hash,...core}=f.next
  for (const mutate of [x=>{delete x.imageRotation},x=>{delete x.mutationProfile},x=>{x.imageRotation.sourceRevision=oldSource},
    x=>{x.imageRotation.planJsonSha256='0'.repeat(64)},x=>{x.imageRotation.addressActions.pop()},
    x=>{x.imageRotation.addressActions[0]=x.imageRotation.addressActions[1]},
    x=>{x.imageRotation.addressActions[0][1]='create'},x=>{x.imageRotation.updates[0].after.template[0].template[0].containers[0].args=['unsafe']},
    x=>{x.imageRotation.updates[0].after.name='sibling-job'},x=>{x.imageRotation.updates[0].before.template[0].template[0].containers[0].image=f.next.migrationRunnerDigest},
    x=>{x.imageRotation.updates[0].after.client='unknown-client'}]){
    const changed=structuredClone(core);mutate(changed)
    assert.throws(()=>assertDev014LifecycleReplayInfra({...input,infra:f.seal(changed)}),/DEV014_LIFECYCLE_REPLAY_INFRA_INVALID/u)
  }
})

test('DEV-014 replay preserves only the existing sealed applied-rotation recovery shape',()=>{
  const f=lifecycleReplayHarness(),input={profile,intent:f.h.input.intent,baselineIntent:{sourceRevision:oldSource},previousInfra:f.previous,infraProfile:f.infraProfile}
  const {receiptSha256:_hash,...core}=f.next
  const recoveryEvidence={mode:'FINALIZE_APPLIED_IMAGE_ROTATION_NO_MUTATION',freshPlanJsonSha256:'a'.repeat(64),providerImagesSha256:'b'.repeat(64),runnerProvenanceSha256:'c'.repeat(64),providerBuildSha256:'d'.repeat(64),artifactRegistrySha256:'e'.repeat(64)}
  assertDev014LifecycleReplayInfra({...input,infra:f.seal({...core,recoveryEvidence})})
  for(const change of [{mode:'UNCONTROLLED_APPLY'},{providerBuildSha256:'bad'},{unexpected:'value'}]){
    assert.throws(()=>assertDev014LifecycleReplayInfra({...input,infra:f.seal({...core,recoveryEvidence:{...recoveryEvidence,...change}})}),/DEV014_LIFECYCLE_REPLAY_INFRA_INVALID/u)
  }
})


function lifecycleAbortedInfraHarness({cycles=1}={}) {
 const f=lifecycleReplayHarness(),h=f.h,baseline=structuredClone(h.objects.get(h.input.intent.baselineIntentRef.uri).value)
 const missing=h.input.transport.readBytes.bind(h.input.transport)
 h.input.transport.readBytes=async(...args)=>{try{return await missing(...args)}catch(error){if(error.message==='MISSING')error.code='MISSING';throw error}}
 let before=f.previous,anchor=null,last
 for(let index=0;index<cycles;index++){
  const source=(index+3).toString(16).repeat(40),releaseId='ABORTED-REPLAY-'+index
  const core=structuredClone(f.next);delete core.receiptSha256;core.sourceRevision=source;core.stateSerial=11+index
  core.imageRotation.sourceRevision=source;core.migrationRunnerDigest=profile.artifact.migrationRunnerUri+'@sha256:'+(index+4).toString(16).repeat(64)
  core.imageRotation.updates[0].before.template[0].template[0].containers[0].image=before.migrationRunnerDigest
  core.imageRotation.updates[0].after.template[0].template[0].containers[0].image=core.migrationRunnerDigest
  const infra=f.seal(core),infraRef=h.put('gs://'+bucket+'/receipts/fixture/aborted-infra-'+index+'.json',infra)
  const authority={...h.input.values.authorization,sourceRevision:source,releaseId,...(anchor?{appliedAbortInfraBaseline:anchor}:{})}
  const readiness={...authority,schemaVersion:'orgmaster.routine-release-readiness.v1'}
  const attempt={...h.input.intent,sourceRevision:source,releaseId,infraReceiptRef:infraRef,authorizationPolicyRef:h.put('gs://'+bucket+'/receipts/fixture/abort-auth-'+index+'.json',authority),readinessReceiptRef:h.put('gs://'+bucket+'/receipts/fixture/abort-ready-'+index+'.json',readiness)}
  const attemptRef=h.put('gs://'+bucket+'/receipts/fixture/abort-intent-'+index+'.json',attempt),paths=releasePaths(profile,attempt,attemptRef.sha256)
  const prepare=stageReceipt({profile,intent:attempt,stage:'prepare',observedAt:'2026-10-06T01:00:00Z',facts:{migrationRunnerDigest:infra.migrationRunnerDigest,prerequisiteRefs:{infra:infraRef,readiness:attempt.readinessReceiptRef,authorization:attempt.authorizationPolicyRef,sourceLock:attempt.sourceLockRef,foundation:attempt.foundationReceiptRef,runtimeConfig:attempt.runtimeConfigRef},routine:{releaseMode:'DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION',migrationDisposition:'FORWARD_APPLY',replayOnly:true,pendingMigrationCount:0,migrationInputsSha256:sha256(canonicalize((({sourceRevision,manifestSha256,...inputs})=>inputs)(oldBundle.bundle))),previousRevision:attempt.previousRevision,baselineIntentRef:attempt.baselineIntentRef}}})
  h.put(paths.prepare,prepare)
  const terminal=stageReceipt({profile,intent:attempt,stage:'terminal',observedAt:'2026-10-06T01:01:00Z',facts:{result:'PRE_ACTIVATION_ABORTED',previousRevision:attempt.previousRevision,entrypointRecovery:{changed:false},databaseDisposition:'UNKNOWN_REQUIRES_LEDGER_READBACK'}})
  h.put(paths.terminal,terminal)
  const controlCore={schemaVersion:'jenfu.dev012.owner-control-head.v1',state:'FINALIZED',result:'PRE_ACTIVATION_ABORTED',ownerApplicationId:'orgmaster',service:profile.target.serviceName,controlBucket:bucket,sourceRevision:source,releaseId,sourceLockSha256:attempt.sourceLockRef.sha256,candidateRevision:null,previousRevision:attempt.previousRevision}
  anchor={attemptIntentRef:attemptRef,infraReceiptRef:infraRef,controlSnapshot:{...controlCore,controlSha256:sha256(canonicalize(controlCore))}}
  before=infra;last={attempt,attemptRef,paths,prepare,terminal,infra,infraRef}
 }
 const next=structuredClone(f.next);delete next.receiptSha256;next.stateSerial=before.stateSerial+1
 next.imageRotation.updates[0].before.template[0].template[0].containers[0].image=before.migrationRunnerDigest
 h.input.values.infra=f.seal(next);h.input.intent.infraReceiptRef=h.put('gs://'+bucket+'/receipts/fixture/replay-infra.json',h.input.values.infra)
 for(const name of ['authorization','readiness'])h.input.values[name].appliedAbortInfraBaseline=structuredClone(anchor)
 return {...f,anchor,last,baseline}
}

test('DEV-014 build-abort continuation separates the applied runner from the successful service and ledger',async()=>{
 const {h,last}=lifecycleAbortedInfraHarness()
 const result=await verifyRoutineRelease(h.input)
 assert.equal(result.previousRevision,'orgmaster-prod-aaaaaaaaaaaa')
 assert.deepEqual(result.baselineIntentRef,h.input.intent.baselineIntentRef)
 assert.deepEqual(result.appliedAbortInfraBaseline.infraReceiptRef,last.infraRef)
 assert.equal(result.migrationDisposition,'FORWARD_APPLY');assert.equal(result.replayOnly,true)
 assert.equal(result.pendingMigrationCount,0);assert.equal(result.liveLedgerRead,false)
 assert.equal(result.databaseVerification,'OWNER_MIGRATION_JOB_REQUIRED_BEFORE_CANDIDATE')
})

test('DEV-014 repeated build aborts validate every immutable image-only predecessor',async()=>{
 const {h,last}=lifecycleAbortedInfraHarness({cycles:2}),result=await verifyRoutineRelease(h.input)
 assert.deepEqual(result.appliedAbortInfraBaseline.infraReceiptRef,last.infraRef)
 assert.equal(result.previousRevision,'orgmaster-prod-aaaaaaaaaaaa')
 await assert.rejects(()=>verifyRoutineRelease(lifecycleAbortedInfraHarness({cycles:9}).h.input),/DEV014_ABORT_INFRA_BASELINE_INVALID/)
})

test('DEV-014 abort continuation rejects invalid control, aliases, migrated state and unsealed joins',async()=>{
 for(const [index,mutate] of [
  f=>{f.h.input.values.authorization.appliedAbortInfraBaseline.infraReceiptRef.sha256='0'.repeat(64)},
  f=>{f.h.input.values.readiness.appliedAbortInfraBaseline.controlSnapshot.result='RELEASED'},
  f=>{f.h.input.values.readiness.appliedAbortInfraBaseline.controlSnapshot.sourceRevision=oldSource},
  f=>{f.h.input.values.readiness.appliedAbortInfraBaseline.controlSnapshot.candidateRevision='unexpected'},
  f=>{f.h.input.values.readiness.appliedAbortInfraBaseline.unexpected=true},
  f=>{f.h.put(f.last.paths.migrate,{unexpected:true})},
  f=>{f.h.put(f.last.paths.candidate,{unexpected:true})},
  f=>{f.h.put(f.last.paths.deployment,{unexpected:true})},
  f=>{f.h.objects.delete(f.last.paths.prepare)},
  f=>{f.h.put(f.last.paths.terminal,{...f.last.terminal,receiptSha256:'0'.repeat(64)})},
  f=>{f.h.put(f.last.paths.prepare,stageReceipt({profile,intent:f.last.attempt,stage:'prepare',observedAt:'2026-10-06T01:00:00Z',facts:{...f.last.prepare.facts,routine:{...f.last.prepare.facts.routine,pendingMigrationCount:1}}}))},
  f=>{f.h.put(f.last.paths.prepare,stageReceipt({profile,intent:f.last.attempt,stage:'prepare',observedAt:'2026-10-06T01:00:00Z',facts:{...f.last.prepare.facts,migrationRunnerDigest:'bad'}}))}
 ].entries()){const f=lifecycleAbortedInfraHarness();mutate(f);if(index>0){const {controlSha256:_hash,...core}=f.h.input.values.readiness.appliedAbortInfraBaseline.controlSnapshot;f.h.input.values.readiness.appliedAbortInfraBaseline.controlSnapshot={...core,controlSha256:sha256(canonicalize(core))};f.h.input.values.authorization.appliedAbortInfraBaseline=structuredClone(f.h.input.values.readiness.appliedAbortInfraBaseline)}await assert.rejects(()=>verifyRoutineRelease(f.h.input))}
})

test('DEV-014 abort continuation preserves complete-set image proof and has no normal-release bypass',async()=>{
 for(const mutate of [
  f=>{f.h.input.values.infra.imageRotation.updates[0].before.template[0].template[0].containers[0].image=f.previous.migrationRunnerDigest},
  f=>{f.h.input.values.infra.imageRotation.updates[0].after.template[0].template[0].containers[0].args=['unsafe']},
  f=>{f.h.input.values.infra.imageRotation.addressActions.pop()},
  f=>{f.h.input.values.infra.controllerImageDigest=f.h.input.values.infra.migrationRunnerDigest},
  f=>{f.h.input.values.infra.stateSerial=f.last.infra.stateSerial},
  f=>{f.h.input.values.infra.imageRotation.sourceRevision=oldSource},
  f=>{f.h.input.values.readiness.slice='014-PRINCIPAL-LIFECYCLE-ENABLE';f.h.input.values.authorization.slice='014-PRINCIPAL-LIFECYCLE-ENABLE'}
 ]){const f=lifecycleAbortedInfraHarness();mutate(f);const {receiptSha256:_seal,...core}=f.h.input.values.infra;f.h.input.values.infra=f.seal(core);await assert.rejects(()=>verifyRoutineRelease(f.h.input))}
})
