import { spawnSync } from 'node:child_process'
import { assertImmutableRef, assertRuntimeConfig, canonicalize, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertMigrationBundle } from './dev012-production-migration-runner.mjs'
import { assertDev040ReleaseIntent } from './dev040-orgmaster-independent-release.mjs'

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)

// Only infrastructure/configuration inputs are reusable, not the application build or smoke results.
export function routineInfrastructureFingerprint(root, revision) {
  if (!/^[a-f0-9]{40}$/u.test(revision)) fail('ROUTINE_SOURCE_INVALID')
  const result = spawnSync('git', ['ls-tree', '-r', '-z', revision, '--',
    'infra/google-cloud/dev-040-production-release', 'config/release/dev040-orgmaster-independent-production-v3.json', 'config/dev-010/n1c-orgmaster.json',
  ], { cwd: root, encoding: null, windowsHide: true })
  if (result.status !== 0 || !result.stdout?.length) fail('ROUTINE_BASELINE_SOURCE_MISSING')
  return sha256(result.stdout)
}

function assertSealedStage(value, profile, intent, stage) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== profile.application.id || value.releaseId !== intent.releaseId || value.sourceRevision !== intent.sourceRevision || value.stage !== stage || value.status !== 'PASS' || receiptSha256 !== sha256(canonicalize(core))) fail('ROUTINE_BASELINE_RECEIPT_INVALID')
}

export function assertRoutineMigrationUnchanged(before, after) {
  const stable = ({ sourceRevision, manifestSha256, ...inputs }) => inputs
  if (!same(stable(before), stable(after))) fail('ROUTINE_MIGRATION_CHANGED')
  return sha256(canonicalize(stable(after)))
}

export function assertRoutineRuntimeReadback(profile, runtimeConfig, revision) {
  const expected = assertRuntimeConfig(profile, runtimeConfig)
  const observed = revision.containers?.find((row) => row.name === profile.runtime.containerName)
  const expectedApp = expected.containers.find((row) => row.name === profile.runtime.containerName)
  const env = (observed?.env ?? []).filter((row) => row.name !== profile.environment.candidateOriginEnvironmentName)
  const sort = (rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name))
  if (revision.serviceAccount !== expected.serviceAccount || !same(sort(env), sort(expectedApp.env))) fail('ROUTINE_RUNTIME_DRIFT')
  // The same immutable revision supplies the rest of the provider configuration; a
  // changed service template cannot silently become this routine release's baseline.
  return true
}

export async function readRoutineBaseline({ profile, transport, baselineIntentRef }) {
  const bucket = profile.artifact.releaseBucket
  assertImmutableRef(baselineIntentRef, bucket)
  const baseline = await transport.readJson(baselineIntentRef, bucket, ['receipts'])
  const intent = assertDev040ReleaseIntent(baseline.value, profile)
  const paths = releasePaths(profile, intent, baselineIntentRef.sha256)
  const read = async (uri) => {
    const result = await transport.readBytes(uri, { prefixes: ['receipts'] })
    return { ...result, value: JSON.parse(result.bytes.toString('utf8')) }
  }
  const [terminal, deployment, migration, candidate] = await Promise.all([read(paths.terminal), read(paths.deployment), read(paths.migrate), read(paths.candidate)])
  assertSealedStage(terminal.value, profile, intent, 'terminal')
  assertSealedStage(candidate.value, profile, intent, 'candidate')
  if (terminal.value.facts.result !== 'RELEASED' || terminal.value.facts.remainingHumanAction !== 0 || !same(candidate.value.facts.deploymentCapsuleRef, deployment.ref) || !same(candidate.value.facts.migrationReceiptRef, migration.ref) || !same(deployment.value.releaseIntentRef, baselineIntentRef) || deployment.value.sourceRevision !== intent.sourceRevision || terminal.value.facts.artifactDigest !== deployment.value.artifactDigest || terminal.value.facts.candidateRevision !== candidate.value.facts.candidateRevision) fail('ROUTINE_BASELINE_NOT_RELEASED')
  if (intent.baselineIntentRef) {
    assertSealedStage(migration.value, profile, intent, 'migrate')
    if (migration.value.facts.disposition !== 'UNCHANGED_VERIFIED' || migration.value.facts.manifestSha256 !== intent.migrationManifestSha256) fail('ROUTINE_BASELINE_MIGRATION_INVALID')
  } else if (migration.value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || migration.value.ownerApplicationId !== profile.application.id || migration.value.sourceRevision !== intent.sourceRevision || migration.value.manifestSha256 !== intent.migrationManifestSha256 || migration.value.status !== 'PASS' || migration.value.boundaryStatus !== 'PASS') fail('ROUTINE_BASELINE_MIGRATION_INVALID')
  const bundle = await transport.readJson(deployment.value.migrationBundleRef, bucket, [profile.artifact.migrationBundlePrefix])
  assertMigrationBundle(bundle.value, { target: { ownerApplicationId: profile.application.id, ledger: profile.migrations.ledger, baselineCount: profile.migrations.baselineCount }, sourceRevision: intent.sourceRevision, bytes: bundle.bytes, bundleSha256: bundle.ref.sha256 })
  if (bundle.value.manifestSha256 !== intent.migrationManifestSha256) fail('ROUTINE_BASELINE_MIGRATION_INVALID')
  const runtime = await transport.readJson(intent.runtimeConfigRef, bucket, ['receipts'])
  return { intent, terminal, deployment, migration, candidate, bundle, runtime }
}

export async function verifyRoutineRelease({ root, profile, transport, intent, values, service, buildMigrationBundle, fingerprint = routineInfrastructureFingerprint }) {
  const baseline = await readRoutineBaseline({ profile, transport, baselineIntentRef: intent.baselineIntentRef })
  if (baseline.terminal.value.facts.candidateRevision !== intent.previousRevision || transport.effectiveRevision(service) !== intent.previousRevision) fail('ROUTINE_BASELINE_NOT_ACTIVE')
  transport.assertServiceSettled(service)
  transport.assertCanonicalEntrypoint(profile, service)
  if ([...(service.traffic ?? []), ...(service.trafficStatuses ?? [])].some((row) => row.tag)) fail('ROUTINE_BASELINE_TAGGED')
  if (!same(intent.foundationReceiptRef, baseline.intent.foundationReceiptRef) || !same(intent.infraReceiptRef, baseline.intent.infraReceiptRef)) fail('ROUTINE_INFRA_REF_CHANGED')
  const infrastructureSha256 = fingerprint(root, intent.sourceRevision)
  if (infrastructureSha256 !== fingerprint(root, baseline.intent.sourceRevision)) fail('ROUTINE_INFRA_CHANGED')
  const runtimeConfig = values.runtimeConfig.runtimeConfig ?? values.runtimeConfig
  if (!same(runtimeConfig, baseline.runtime.value.runtimeConfig ?? baseline.runtime.value)) fail('ROUTINE_RUNTIME_CHANGED')
  const revision = await transport.getRevision(profile, intent.previousRevision)
  transport.assertRevisionReady(profile, revision, baseline.deployment.value.artifactDigest, baseline.candidate.value.facts.cloudSqlProxyResolvedImage)
  assertRoutineRuntimeReadback(profile, runtimeConfig, revision)
  const current = await buildMigrationBundle(intent.sourceRevision)
  if (current.bundle.manifestSha256 !== intent.migrationManifestSha256) fail('MIGRATION_MANIFEST_MISMATCH')
  const migrationInputsSha256 = assertRoutineMigrationUnchanged(baseline.bundle.value, current.bundle)
  for (const name of ['authorization', 'readiness']) {
    const value = values[name]
    if (value.ownerApplicationId !== profile.application.id || value.sourceRevision !== intent.sourceRevision || value.releaseId !== intent.releaseId || value.releaseMode !== 'APPLICATION_ONLY' || !same(value.baselineIntentRef, intent.baselineIntentRef)) fail('ROUTINE_AUTHORITY_MISMATCH')
  }
  return { baselineIntentRef: intent.baselineIntentRef, baselineTerminalRef: baseline.terminal.ref, baselineMigrationRef: baseline.migration.ref, infrastructureSha256, migrationInputsSha256, previousRevision: intent.previousRevision, databaseVerification: 'PRIOR_RELEASE_EVIDENCE_PLUS_CURRENT_RUNTIME_SMOKE', liveLedgerRead: false }
}
