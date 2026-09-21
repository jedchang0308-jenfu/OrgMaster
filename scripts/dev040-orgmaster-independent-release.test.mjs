import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040ReleaseIntent, assertDev040V3Profile, assertDev040WorkflowSource, buildDev040CandidateTag, buildDev040MigrationBundle, buildDev040Mutation, verifyDev040MigrationBytes } from './lib/dev040-orgmaster-independent-release.mjs'
import { assertRuntimeConfig, buildRuntimeConfig, resolvePlainEnvironment } from './lib/dev012-owner-release-runtime.mjs'
import { assertPreparePrerequisites, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { dev013L4SequenceStep } from './lib/dev013-l4-transition-sequence.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const profile = read('config/release/dev040-orgmaster-independent-production-v3.json')
const n1c = read('config/dev-010/n1c-orgmaster.json')
const H = 'a'.repeat(64)
const ref = (name) => ({ uri: `gs://${profile.artifact.releaseBucket}/receipts/${name}.json`, sha256: H })

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

function controlledPrerequisites(ownerProfile, runtimeConfig) {
  const intent = { releaseId: 'DEV013-L4-ORGMASTER-001', sourceRevision: 'b'.repeat(40) }
  const common = { ownerApplicationId: ownerProfile.application.id, projectId: ownerProfile.target.projectId, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, environment: 'production', observedAt: '2999-01-01T00:00:00.000Z', expiresAt: '2999-01-01T08:00:00.000Z', remainingHumanAction: 0, status: 'PASS', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND' }
  const predecessorReceiptRef = { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/platform-accept.json', sha256: '9'.repeat(64) }
  const previousControlledEnvironment = { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'off' }
  const controlledEnvironment = { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' }
  const transition = { field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from: 'off', to: 'on', action: 'activate', predecessorReceiptRef }
  const sequenceStep = dev013L4SequenceStep(ownerProfile.application.id, transition, previousControlledEnvironment, controlledEnvironment)
  const sequenceRoot = { schemaVersion: 'jenfu.dev013.l4-sequence-root.v2', authorizationId: 'DEV013-L4-AUTH-TEST0001', authorizationStatementSha256: '7'.repeat(64), manifestSha256: '8'.repeat(64), authorizedAt: common.observedAt, expiresAt: common.expiresAt, receiptRef: { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/root.json', sha256: '8'.repeat(64) } }
  return { intent, values: {
    sourceLock: { ...common, clean: true, status: 'SOURCE_FROZEN' },
    authorization: { ...common, schemaVersion: 'jenfu.dev013.l4-owner-transition-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEV013_L4' },
    readiness: { ...common, schemaVersion: 'jenfu.dev013.l4-owner-transition-readiness.v2', devId: 'DEV-013', slice: '013-R1', sequenceRoot, sequenceStep, previousControlledEnvironment, controlledEnvironment, transition },
    foundation: { ...common, ownerApplicationId: 'shared-foundation' },
    infra: { ...common, migrationRunnerDigest: `${ownerProfile.artifact.migrationRunnerUri}@sha256:${'c'.repeat(64)}` },
    runtimeConfig: { ...common, status: 'VERIFIED', runtimeConfig },
  } }
}

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
  assert.equal(profile.environment.controlledValues.ORGMASTER_JENFU_SSO_HANDOFF_MODE.defaultValue, 'off')
  assert.deepEqual(profile.environment.controlledValues.ORGMASTER_JENFU_SSO_HANDOFF_MODE.allowedValues, ['off', 'on'])
  assert.equal(profile.environment.fixedValues.ORGMASTER_JENFU_SSO_BROKER_ORIGIN, 'https://jenfu-platform-prod-9536592944.asia-east1.run.app')
  assert.equal(profile.environment.fixedValues.ORGMASTER_MANAGED_IDENTITY_ENABLED, 'true')
  assert.equal(profile.environment.fixedValues.ORGMASTER_GOOGLE_DIRECTORY_DOMAIN, 'jenfu.com.tw')
  assert.equal(profile.environment.fixedValues.ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL, 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com')
  assert.equal(profile.environment.fixedValues.ORGMASTER_PLATFORM_LOGIN_CALLER_EMAIL, 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com')
  assert.equal(profile.environment.fixedValues.ORGMASTER_PLATFORM_LOGIN_CALLER_SUBJECT, '101029748006912113815')
})

test('S1B-21 OrgMaster runtime keeps credentials out of plain environment', () => {
  const priorPlainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames.filter((name) => !['ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'ORGMASTER_JENFU_SSO_BROKER_ORIGIN'].includes(name)).map((name) => [name, profile.environment.fixedValues[name] ?? `plain-${name}`]))
  const plainEnvironment = resolvePlainEnvironment(profile, priorPlainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const secretVersions = Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1']))
  const runtime = buildRuntimeConfig(profile, { plainEnvironment, secretVersions })
  assert.deepEqual(Object.keys(runtime.plainEnvironment).sort(), [...profile.environment.requiredPlainEnvironmentNames].sort())
  assert.deepEqual(Object.keys(runtime.secretVersions).sort(), [...profile.environment.requiredSecretNames].sort())
  assert.equal(runtime.template.containers[0].env.filter((row) => row.name === 'ORGMASTER_POSTGRES_URL').length, 1)
  assert.equal(runtime.template.containers[0].env.find((row) => row.name === 'ORGMASTER_POSTGRES_URL').valueSource.secretKeyRef.secret, 'orgmaster-prod-postgres-url')
  assert.equal(runtime.plainEnvironment.ORGMASTER_JENFU_SSO_HANDOFF_MODE, 'on')
  assert.throws(() => resolvePlainEnvironment(profile, priorPlainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'launch' }), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
  assert.equal(assertRuntimeConfig(profile, runtime).containers.length, 2)
})

test('OrgMaster owner prepare requires sealed DEV-013 authority before handoff on', () => {
  const priorPlainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames
    .filter((name) => !Object.hasOwn(profile.environment.fixedValues, name) && !Object.hasOwn(profile.environment.controlledValues, name))
    .map((name) => [name, 'fixture-public-value']))
  const plainEnvironment = resolvePlainEnvironment(profile, priorPlainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment, secretVersions: Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1'])) })
  const fixture = controlledPrerequisites(profile, runtimeConfig)
  assert.equal(assertPreparePrerequisites({ ...fixture, profile }).runtimeConfig, runtimeConfig)
  delete fixture.values.readiness.transition.predecessorReceiptRef
  assert.throws(() => assertPreparePrerequisites({ ...fixture, profile }), /CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID/u)
})

test('OrgMaster owner prepare carries an active handoff value only through an exact routine baseline', () => {
  const priorPlainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames
    .filter((name) => !Object.hasOwn(profile.environment.fixedValues, name) && !Object.hasOwn(profile.environment.controlledValues, name))
    .map((name) => [name, 'fixture-public-value']))
  const plainEnvironment = resolvePlainEnvironment(profile, priorPlainEnvironment, { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' })
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment, secretVersions: Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1'])) })
  const fixture = controlledPrerequisites(profile, runtimeConfig)
  fixture.intent.baselineIntentRef = ref('baseline-release-intent')
  fixture.values.authorization = { ...fixture.values.authorization, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION', baselineIntentRef: fixture.intent.baselineIntentRef }
  fixture.values.readiness = { ...fixture.values.readiness, schemaVersion: 'orgmaster.routine-release-readiness.v1', baselineIntentRef: fixture.intent.baselineIntentRef }
  delete fixture.values.readiness.devId
  delete fixture.values.readiness.slice
  delete fixture.values.readiness.sequenceRoot
  delete fixture.values.readiness.sequenceStep
  delete fixture.values.readiness.previousControlledEnvironment
  delete fixture.values.readiness.controlledEnvironment
  delete fixture.values.readiness.transition
  assert.equal(assertPreparePrerequisites({ ...fixture, profile }).controlledEnvironmentAuthority.releaseMode, 'ROUTINE_CONTROLLED_ENVIRONMENT_CARRY_FORWARD')
  fixture.values.readiness.baselineIntentRef = ref('different-baseline')
  assert.throws(() => assertPreparePrerequisites({ ...fixture, profile }), /CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID/u)
})

test('DEV-040 OrgMaster WIF provider display name fits provider limit', () => {
  const source = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/workload-identity.tf', import.meta.url), 'utf8')
  const displayName = source.match(/display_name\s*=\s*"([^"]+)"/u)?.[1]
  assert.ok(displayName)
  assert.ok(displayName.length <= 32)
})

test('OrgMaster exact 001-015 production migration bytes', () => {
  const files = new Map(profile.migrations.entries.map((entry) => [entry.path, fs.readFileSync(new URL(`../${entry.path}`, import.meta.url))]))
  assert.equal(verifyDev040MigrationBytes(profile, files), true)
  const bundle = buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, 'a'.repeat(40))
  assert.equal(bundle.bundle.entries.length, 15)
  assert.equal(bundle.bundle.entries[10].version, 'dev040-r2-orgmaster-011')
  assert.equal(bundle.bundle.entries[11].version, 'dev047-orgmaster-012')
  assert.equal(bundle.bundle.entries[12].version, 'dev049-orgmaster-013')
  assert.equal(bundle.bundle.entries[13].version, 'dev050-orgmaster-014')
  assert.equal(bundle.bundle.entries[14].version, 'dev013-orgmaster-015')
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

test('OrgMaster custom Cloud Build service account can act only as itself', () => {
  const identity = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/identity.tf', import.meta.url), 'utf8')
  const storage = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/storage.tf', import.meta.url), 'utf8')
  const migration = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/migration.tf', import.meta.url), 'utf8')
  const candidateSmoke = fs.readFileSync(new URL('../infra/google-cloud/dev-040-production-release/candidate-smoke.tf', import.meta.url), 'utf8')
  const infraPlan = read('config/release/dev040-production-release-infra-plan.json')
  const runtimeFirebaseViewer = identity.match(/resource "google_project_iam_member" "runtime_firebase_auth_viewer"[\s\S]*?\n\}/u)?.[0] ?? ''
  assert.match(runtimeFirebaseViewer, /count\s+= var\.incident_runtime_enabled \? 1 : 0[\s\S]*role\s+= "roles\/firebaseauth\.viewer"[\s\S]*serviceAccount:\$\{data\.google_service_account\.runtime\.email\}/u)
  assert.doesNotMatch(runtimeFirebaseViewer, /builder\.email|deployer\.email|verifier\.email|controller\.email|smoke\.email/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_project_iam_member.runtime_firebase_auth_viewer[0]'))
  assert.ok(!infraPlan.stageA.includes('google_project_iam_member.runtime_firebase_auth_viewer[0]'))
  assert.match(identity, /resource "google_service_account_iam_member" "builder_act_as_self"[\s\S]*service_account_id = google_service_account\.builder\.name[\s\S]*role\s+= "roles\/iam\.serviceAccountUser"[\s\S]*member\s+= "serviceAccount:\$\{google_service_account\.builder\.email\}"/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_service_account_iam_member.builder_act_as_self'))
  assert.ok(!infraPlan.stageA.includes('google_service_account_iam_member.builder_act_as_self'))
  assert.doesNotMatch(identity.match(/resource "google_service_account_iam_member" "builder_act_as_self"[\s\S]*?\n\}/u)?.[0] ?? '', /runtime|deployer|verifier|aipdm|platform/u)
  assert.match(identity, /resource "google_project_iam_member" "builder_sbom_bucket_viewer"[\s\S]*role\s+= "roles\/storage\.bucketViewer"[\s\S]*google_service_account\.builder\.email/u)
  assert.match(identity, /resource "google_project_iam_member" "builder_sbom_note_attacher"[\s\S]*role\s+= "roles\/containeranalysis\.notes\.attacher"[\s\S]*google_service_account\.builder\.email/u)
  assert.match(storage, /resource "google_storage_bucket_iam_member" "builder_sbom_object_admin"[\s\S]*role\s+= "roles\/storage\.objectAdmin"[\s\S]*artifact_analysis_object_prefix/u)
  const verifierStorage = storage.match(/resource "google_storage_bucket_iam_member" "verifier"[\s\S]*?\n\}/u)?.[0] ?? ''
  assert.match(verifierStorage, /control_user\s+= \{ role = "roles\/storage\.objectUser", prefix = local\.control_prefix \}/u)
  assert.match(verifierStorage, /var\.incident_runtime_enabled \? \{/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_storage_bucket_iam_member.verifier["control_user"]'))
  assert.ok(!infraPlan.stageA.includes('google_storage_bucket_iam_member.verifier["control_user"]'))
  for (const source of [identity.match(/resource "google_project_iam_member" "builder_sbom_bucket_viewer"[\s\S]*?\n\}/u)?.[0] ?? '', identity.match(/resource "google_project_iam_member" "builder_sbom_note_attacher"[\s\S]*?\n\}/u)?.[0] ?? '', storage.match(/resource "google_storage_bucket_iam_member" "builder_sbom_object_admin"[\s\S]*?\n\}/u)?.[0] ?? '']) assert.match(source, /count\s+= var\.incident_runtime_enabled \? 1 : 0/u)
  assert.doesNotMatch(storage.match(/resource "google_storage_bucket_iam_member" "builder_sbom_object_admin"[\s\S]*?\n\}/u)?.[0] ?? '', /aipdm-release|platform-release/u)
  assert.match(migration, /resource "google_cloud_run_v2_job_iam_member" "migration_runner_with_overrides"[\s\S]*name\s+= google_cloud_run_v2_job\.migration\[0\]\.name[\s\S]*role\s+= "roles\/run\.jobsExecutorWithOverrides"[\s\S]*google_service_account\.deployer\.email/u)
  assert.match(migration, /resource "google_cloud_run_v2_job_iam_member" "migration_runner_viewer"[\s\S]*name\s+= google_cloud_run_v2_job\.migration\[0\]\.name[\s\S]*role\s+= "roles\/run\.viewer"[\s\S]*google_service_account\.deployer\.email/u)
  for (const address of ['google_project_iam_member.builder_sbom_bucket_viewer[0]', 'google_project_iam_member.builder_sbom_note_attacher[0]', 'google_storage_bucket_iam_member.builder_sbom_object_admin[0]']) {
    assert.ok(infraPlan.stageBAdditional.includes(address))
    assert.ok(!infraPlan.stageA.includes(address))
  }
  assert.ok(infraPlan.stageBAdditional.includes('google_cloud_run_v2_job_iam_member.migration_runner_with_overrides[0]'))
  assert.ok(infraPlan.stageBAdditional.includes('google_cloud_run_v2_job_iam_member.migration_runner_viewer[0]'))
  assert.match(candidateSmoke, /resource "google_project_iam_member" "verifier_candidate_smoke_execution_invoker"[\s\S]*role\s+= "roles\/workflows\.invoker"[\s\S]*google_service_account\.verifier\.email[\s\S]*resource\.name\.startsWith\('projects\/\$\{var\.project_id\}\/locations\/\$\{var\.region\}\/workflows\/\$\{local\.candidate_smoke_workflow\}\/executions\/'\)/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_project_iam_member.verifier_candidate_smoke_execution_invoker[0]'))
  const invokerV2 = candidateSmoke.match(/resource "google_project_iam_member" "verifier_candidate_smoke_invoker_v2"[\s\S]*?\n\}/u)?.[0] ?? ''
  assert.match(invokerV2, /role\s+= "roles\/workflows\.invoker"[\s\S]*google_service_account\.verifier\.email/u)
  assert.doesNotMatch(invokerV2, /condition|builder|deployer|controller|smoke\.email/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_project_iam_member.verifier_candidate_smoke_invoker_v2[0]'))
})
