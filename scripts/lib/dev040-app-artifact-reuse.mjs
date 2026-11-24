import { spawnSync } from 'node:child_process'
import { assertImmutableRef, canonicalize, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertRuntimeConfig, buildRuntimeConfig } from './dev012-owner-release-runtime.mjs'
import { assertMigrationBundle } from './dev012-production-migration-runner.mjs'
import { DEV057_EXTERNAL_RELEASE_MODE, assertDev057ExternalAppend, assertDev057ExternalReleaseAuthority } from './dev057-projed-external-migration.mjs'
import { dev057PreCallerRuntimeProfile, isDev057CallerEnvironmentAppend } from './dev057-projed-caller-profile.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const SCHEMA = 'orgmaster.release-executor-only-app-artifact-reuse.v1'

// These files execute only the protected release and its tests. None is copied
// from the builder into the application runtime image, and package/build inputs
// remain byte-identical to the original artifact source.
export const RELEASE_EXECUTOR_ONLY_PATHS = Object.freeze([
  'AGENTS.md',
  'ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md',
  'ai-doc/specs/DEV-057-identity-and-grant-contract-boundary.md',
  'scripts/dev012-owner-stage-executor.test.mjs',
  'scripts/dev040-deploy-production.mjs',
  'scripts/dev040-orgmaster-independent-release.mjs',
  'scripts/dev040-routine-release.test.mjs',
  'scripts/dev040-tool-image-rotation.test.mjs',
  'scripts/qc-dev-040-r2-independent-release.mjs',
  'scripts/dev057-smoke-credential-rotation.mjs',
  'scripts/dev057-smoke-credential-reauth.test.mjs',
  'scripts/lib/dev040-app-artifact-reuse.mjs',
  'scripts/lib/dev040-routine-release.mjs',
  'scripts/lib/dev040-tool-image-rotation.mjs',
  'scripts/lib/dev040-tool-terraform.mjs',
  'scripts/lib/dev040-tool-terraform.test.mjs',
  'scripts/lib/dev012-owner-stage-executor.mjs',
  'scripts/lib/dev057-smoke-rotation-continuation.mjs',
  'scripts/lib/dev057-shared-smoke-credential-evidence.mjs',
  'scripts/dev040-routine-release.test.mjs',
].sort())

function fail(code) { throw Object.assign(new Error(code), { code }) }
const same = (left, right) => canonicalize(left) === canonicalize(right)

function git(root, args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: root, encoding, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  if (result.error || result.status !== 0) fail('APP_ARTIFACT_REUSE_GIT_INVALID')
  return result.stdout
}

function blob(root, revision, file) {
  const value = String(git(root, ['rev-parse', `${revision}:${file}`])).trim()
  if (!H40.test(value)) fail('APP_ARTIFACT_REUSE_BLOB_INVALID')
  return value
}

export function appArtifactSourceEquivalence(root, artifactSourceRevision, releaseSourceRevision) {
  if (![artifactSourceRevision, releaseSourceRevision].every(value => H40.test(value ?? '')) || artifactSourceRevision === releaseSourceRevision) {
    fail('APP_ARTIFACT_REUSE_SOURCE_INVALID')
  }
  if (spawnSync('git', ['merge-base', '--is-ancestor', artifactSourceRevision, releaseSourceRevision], { cwd: root, windowsHide: true }).status !== 0) {
    fail('APP_ARTIFACT_REUSE_SOURCE_INVALID')
  }
  const raw = git(root, ['diff', '--name-status', '-z', '--no-renames', artifactSourceRevision, releaseSourceRevision], null)
  if (!Buffer.isBuffer(raw)) fail('APP_ARTIFACT_REUSE_DIFF_INVALID')
  const parts = raw.toString('utf8').split('\0').filter(Boolean)
  if (parts.length % 2 !== 0 || parts.length === 0) fail('APP_ARTIFACT_REUSE_DIFF_INVALID')
  const allowed = new Set(RELEASE_EXECUTOR_ONLY_PATHS)
  const changedPaths = []
  for (let index = 0; index < parts.length; index += 2) {
    const status = parts[index]
    const file = parts[index + 1].replaceAll('\\', '/')
    if (!['A', 'M'].includes(status) || !allowed.has(file)) fail('APP_ARTIFACT_REUSE_RUNTIME_INPUT_CHANGED')
    changedPaths.push({ status, path: file, beforeBlob: status === 'A' ? null : blob(root, artifactSourceRevision, file), afterBlob: blob(root, releaseSourceRevision, file) })
  }
  changedPaths.sort((left, right) => left.path.localeCompare(right.path))
  for (const required of ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vite.server.config.ts']) {
    if (blob(root, artifactSourceRevision, required) !== blob(root, releaseSourceRevision, required)) fail('APP_ARTIFACT_REUSE_RUNTIME_INPUT_CHANGED')
  }
  const core = { artifactSourceRevision, releaseSourceRevision, allowedPathsSha256: sha256(canonicalize(RELEASE_EXECUTOR_ONLY_PATHS)), changedPaths }
  return { ...core, equivalenceSha256: sha256(canonicalize(core)) }
}

async function readExact(transport, profile, ref, prefixes = ['receipts']) {
  assertImmutableRef(ref, profile.artifact.releaseBucket, prefixes)
  const result = await transport.readJson(ref, profile.artifact.releaseBucket, prefixes)
  if (!same(result.ref, ref) || !Buffer.isBuffer(result.bytes) || sha256(result.bytes) !== ref.sha256 || !same(JSON.parse(result.bytes.toString('utf8')), result.value)) {
    fail('APP_ARTIFACT_REUSE_REF_INVALID')
  }
  return result
}

function assertStageReceipt(value, profile, intent, stage) {
  const { receiptSha256, ...core } = value ?? {}
  if (value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== profile.application.id ||
      value.releaseId !== intent.releaseId || value.sourceRevision !== intent.sourceRevision || value.stage !== stage ||
      value.status !== 'PASS' || receiptSha256 !== sha256(canonicalize(core))) fail('APP_ARTIFACT_REUSE_STAGE_INVALID')
}

function assertAbortRecovery(value, attemptedIntent) {
  const facts = value?.facts
  const recovery = facts?.entrypointRecovery
  const recoveryShapeValid = recovery && typeof recovery.changed === 'boolean' &&
    ['NOT_REQUIRED', 'BASELINE_ALREADY_ACTIVE', 'BASELINE_RESTORED'].includes(recovery.result) &&
    (recovery.result === 'BASELINE_RESTORED' ? recovery.changed === true : recovery.changed === false)
  if (facts?.result !== 'PRE_ACTIVATION_ABORTED' || facts.previousRevision !== attemptedIntent?.previousRevision ||
      !recoveryShapeValid ||
      (facts.remainingHumanAction != null && facts.remainingHumanAction !== 0)) fail('APP_ARTIFACT_REUSE_EVIDENCE_INVALID')
  return facts
}

export function assertReusableAbortedTerminal(value, attemptedIntent) {
  const facts = assertAbortRecovery(value, attemptedIntent)
  if (!['NOT_APPLIED', 'UNCHANGED_VERIFIED'].includes(facts.databaseDisposition)) fail('APP_ARTIFACT_REUSE_EVIDENCE_INVALID')
  return facts
}

// A completed DEV-057 schema append is historical schema evidence, not RELEASED.
// Keep the runtime baseline and validate the entire sealed 60 -> 64 -> 65 chain.
async function readAppliedSchemaAbort({ root, profile, transport, attemptedIntent: attempt, attemptedIntentRef, deployment, build, terminal, readSourceIdentity }) {
  const facts = assertAbortRecovery(terminal.value, attempt)
  if (facts.databaseDisposition !== 'FORWARD_APPLIED' || profile.application.id !== 'orgmaster'
    || profile.target.projectId !== 'jenfu-platform-prod' || attempt.productionDataRef || attempt.firstPrincipalBootstrapRef) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  const { readRoutineBaseline, readDev057ExternalSchemaPredecessor, readSchemaPredecessorGitIdentity } = await import('./dev040-routine-release.mjs')
  const { assertMigrationReceipt } = await import('./dev012-owner-stage-executor.mjs')
  const baseline = await readRoutineBaseline({ profile, transport, baselineIntentRef: attempt.baselineIntentRef })
  if (baseline.activeRevision !== attempt.previousRevision || baseline.bundle.value.entries.length !== 60
    || !same(attempt.foundationReceiptRef, baseline.intent.foundationReceiptRef)) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  const paths = releasePaths(profile, attempt, attemptedIntentRef.sha256)
  const named = async uri => readExact(transport, profile, (await transport.readBytes(uri, { prefixes: ['receipts'] })).ref)
  const [prepare, migration, bundle, target] = await Promise.all([
    named(paths.prepare), named(paths.migrate), readExact(transport, profile, deployment.value.migrationBundleRef, [profile.artifact.migrationBundlePrefix]),
    readExact(transport, profile, attempt.runtimeConfigRef),
  ])
  assertStageReceipt(prepare.value, profile, attempt, 'prepare')
  const names = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef',
    foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
  const values = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([name, field]) =>
    [name, (await readExact(transport, profile, attempt[field])).value])))
  const authority = assertDev057ExternalReleaseAuthority(values.readiness, values.authorization, attempt)
  const routine = prepare.value.facts.routine
  if (prepare.value.previousReceiptRef !== null || !same(build.value.previousReceiptRef, prepare.ref)
    || deployment.value.schemaVersion !== profile.schemas.deploymentCapsule || deployment.value.ownerApplicationId !== 'orgmaster'
    || deployment.value.releaseIntentSha256 !== attemptedIntentRef.sha256 || deployment.value.deadlineAt !== attempt.deadlineAt
    || !same(deployment.value.buildReceiptRef, build.ref) || deployment.value.productionDataRef || deployment.value.firstPrincipalBootstrapRef
    || !same(prepare.value.facts.prerequisiteRefs, Object.fromEntries(Object.entries(names).map(([name, field]) => [name, attempt[field]])))
    || authority.releaseMode !== DEV057_EXTERNAL_RELEASE_MODE || !authority.schemaPredecessorRef
    || !same(routine?.controlledTransition, authority) || routine.migrationDisposition !== 'FORWARD_APPLY'
    || routine.releaseMode !== DEV057_EXTERNAL_RELEASE_MODE || routine.pendingMigrationCount !== 1
    || routine.previousRevision !== baseline.activeRevision || !same(routine.baselineIntentRef, attempt.baselineIntentRef)
    || values.infra.migrationRunnerDigest !== deployment.value.migrationRunnerDigest
    || prepare.value.facts.migrationRunnerDigest !== deployment.value.migrationRunnerDigest
    || prepare.value.facts.previousRevision !== baseline.activeRevision || prepare.value.facts.runtimeServiceAccount !== profile.target.runtimeServiceAccount
    || !deployment.value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  for (const field of ['artifactDigest', 'sourceObject', 'migrationBundleRef', 'provenanceReceiptRef', 'sbomReceiptRef', 'scanReceiptRef']) {
    if (!same(build.value.facts[field], deployment.value[field])) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  }
  const source = values.sourceLock
  const identity = (readSourceIdentity ?? readSchemaPredecessorGitIdentity)(root, attempt.sourceRevision)
  if (source.ownerApplicationId !== 'orgmaster' || source.repository !== profile.application.repository || source.branch !== profile.application.branch
    || source.remoteRef !== `refs/heads/${profile.application.branch}` || source.remoteRevision !== attempt.sourceRevision
    || source.releaseId !== attempt.releaseId || source.sourceRevision !== attempt.sourceRevision || source.sourceTree !== identity.tree || !H40.test(source.sourceTree ?? '')
    || source.sourceSha256 !== attempt.sourceSha256 || source.sourceSha256 !== sha256(identity.bytes)
    || source.migrationManifestSha256 !== attempt.migrationManifestSha256 || source.status !== 'SOURCE_FROZEN'
    || source.clean !== true || source.releaseAuthority !== true || source.evidenceScope !== 'PRODUCTION_BOUND') fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  const times = [source.observedAt, prepare.value.observedAt, build.value.observedAt, migration.value.startedAt, migration.value.completedAt, terminal.value.observedAt].map(Date.parse)
  const deadline = Date.parse(attempt.deadlineAt)
  if (!Number.isFinite(deadline) || times.some((time, index) => !Number.isFinite(time) || time > deadline || index > 0 && time < times[index - 1])) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  for (const row of [values.authorization, values.readiness]) {
    if (row.environment !== 'production' || row.projectId !== profile.target.projectId || row.releaseAuthority !== true
      || row.evidenceScope !== 'PRODUCTION_BOUND' || row.status !== 'PASS' || row.remainingHumanAction !== 0
      || !Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) < times[4]) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  }
  assertMigrationBundle(bundle.value, { target: { ownerApplicationId: 'orgmaster', ledger: profile.migrations.ledger, baselineCount: 10 },
    sourceRevision: attempt.sourceRevision, bytes: bundle.bytes, bundleSha256: bundle.ref.sha256 })
  if (bundle.value.manifestSha256 !== attempt.migrationManifestSha256) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  const predecessor = await readDev057ExternalSchemaPredecessor({ root, profile, transport, ref: authority.schemaPredecessorRef,
    intent: attempt, baseline, readSourceIdentity })
  const append = assertDev057ExternalAppend(predecessor.bundle.value, bundle.value)
  if (routine.migrationInputsSha256 !== append.migrationInputsSha256 || !same(routine.schemaPredecessor?.migrationReceiptRef, predecessor.migrationReceiptRef)) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  assertMigrationReceipt(migration.value, profile, attempt, { allowForward: true, forwardPlan: routine })
  const priorRuntime = baseline.runtime.value.runtimeConfig ?? baseline.runtime.value
  const candidateRuntime = target.value.runtimeConfig ?? target.value
  if (target.value.schemaVersion !== 'jenfu.dev012.owner-runtime-config-receipt.v1' || target.value.ownerApplicationId !== 'orgmaster'
    || target.value.projectId !== profile.target.projectId || target.value.sourceRevision !== attempt.sourceRevision
    || target.value.releaseId !== attempt.releaseId || target.value.status !== 'PASS' || target.value.releaseAuthority !== true
    || target.value.evidenceScope !== 'PRODUCTION_BOUND') fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  assertRuntimeConfig(dev057PreCallerRuntimeProfile(profile), priorRuntime)
  assertRuntimeConfig(profile, candidateRuntime)
  if (!isDev057CallerEnvironmentAppend(profile, priorRuntime.plainEnvironment, candidateRuntime.plainEnvironment)
    || !same(buildRuntimeConfig(profile, { plainEnvironment: candidateRuntime.plainEnvironment, secretVersions: priorRuntime.secretVersions }), candidateRuntime)) fail('APP_ARTIFACT_REUSE_SCHEMA_INVALID')
  return { prepareRef: prepare.ref, migrationReceiptRef: migration.ref, migrationBundleRef: bundle.ref,
    runtimeConfigRef: target.ref, sourceRevision: attempt.sourceRevision, manifestSha256: attempt.migrationManifestSha256,
    migrationInputsSha256: append.migrationInputsSha256, ledgerCount: migration.value.ledgerCount, applicationReleased: false }
}

export async function buildAbortedAppArtifactReuse({ root, profile, transport, releaseSourceRevision,
  attemptedIntent, attemptedIntentRef, sourceProof, readSourceIdentity }) {
  const intentRead = await readExact(transport, profile, attemptedIntentRef)
  if (!same(intentRead.value, attemptedIntent) || !attemptedIntent.baselineIntentRef || attemptedIntent.sourceRevision === releaseSourceRevision) {
    fail('APP_ARTIFACT_REUSE_ATTEMPT_INVALID')
  }
  const paths = releasePaths(profile, attemptedIntent, attemptedIntentRef.sha256)
  const [deployment, build, provenance, sbom, scan, terminal] = await Promise.all([
    readExact(transport, profile, { uri: paths.deployment, sha256: (await transport.readBytes(paths.deployment, { prefixes: ['receipts'] })).ref.sha256 }),
    readExact(transport, profile, { uri: paths.build, sha256: (await transport.readBytes(paths.build, { prefixes: ['receipts'] })).ref.sha256 }),
    readExact(transport, profile, { uri: paths.provenance, sha256: (await transport.readBytes(paths.provenance, { prefixes: ['receipts'] })).ref.sha256 }),
    readExact(transport, profile, { uri: paths.sbom, sha256: (await transport.readBytes(paths.sbom, { prefixes: ['receipts'] })).ref.sha256 }),
    readExact(transport, profile, { uri: paths.scan, sha256: (await transport.readBytes(paths.scan, { prefixes: ['receipts'] })).ref.sha256 }),
    readExact(transport, profile, { uri: paths.terminal, sha256: (await transport.readBytes(paths.terminal, { prefixes: ['receipts'] })).ref.sha256 }),
  ])
  assertStageReceipt(build.value, profile, attemptedIntent, 'build')
  assertStageReceipt(terminal.value, profile, attemptedIntent, 'terminal')
  const appliedSchema = terminal.value.facts?.databaseDisposition === 'FORWARD_APPLIED'
    ? await readAppliedSchemaAbort({ root, profile, transport, attemptedIntent, attemptedIntentRef, deployment, build, terminal, readSourceIdentity })
    : (assertReusableAbortedTerminal(terminal.value, attemptedIntent), null)
  const artifactDigest = deployment.value.artifactDigest
  const sourceObject = deployment.value.sourceObject
  if (deployment.value.sourceRevision !== attemptedIntent.sourceRevision || !same(deployment.value.releaseIntentRef, attemptedIntentRef) ||
      !artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`) || build.value.facts?.artifactDigest !== artifactDigest ||
      provenance.value.schemaVersion !== 'jenfu.dev012.build-provenance-receipt.v1' || provenance.value.status !== 'PASS' ||
      provenance.value.sourceRevision !== attemptedIntent.sourceRevision || provenance.value.artifactDigest !== artifactDigest ||
      provenance.value.cloudBuild?.status !== 'SUCCESS' || provenance.value.cloudBuild?.id == null ||
      provenance.value.buildDisposition !== 'BUILT' || provenance.value.artifactSourceRevision !== attemptedIntent.sourceRevision ||
      !same(provenance.value.sourceObject, sourceObject) || provenance.value.sourceArchiveSha256 !== sourceObject.sha256 ||
      sbom.value.status !== 'PASS' || sbom.value.artifactDigest !== artifactDigest || scan.value.status !== 'PASS' ||
      scan.value.artifactDigest !== artifactDigest || scan.value.blockingVulnerabilityCount !== 0 ||
      !H64.test(provenance.value.buildInputSha256 ?? '')) fail('APP_ARTIFACT_REUSE_EVIDENCE_INVALID')
  const sourceEquivalence = appArtifactSourceEquivalence(root, attemptedIntent.sourceRevision, releaseSourceRevision)
  if (sourceProof?.sourceRevision !== releaseSourceRevision || sourceProof.repository !== profile.application.repository ||
      sourceProof.branch !== profile.application.branch || sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED' ||
      sourceProof.branchProtected !== true || sourceProof.requiredSourceQc !== 'SUCCESS') fail('APP_ARTIFACT_REUSE_SOURCE_PROOF_INVALID')
  return {
    schemaVersion: SCHEMA, ownerApplicationId: profile.application.id, projectId: profile.target.projectId,
    releaseSourceRevision, artifactSourceRevision: attemptedIntent.sourceRevision, attemptedIntentRef,
    baselineIntentRef: attemptedIntent.baselineIntentRef, previousRevision: attemptedIntent.previousRevision,
    artifactDigest, artifactSourceObject: sourceObject, buildInputSha256: provenance.value.buildInputSha256,
    cloudBuildId: provenance.value.cloudBuild.id, sourceEquivalence, sourceProof,
    deploymentRef: deployment.ref, buildReceiptRef: build.ref, provenanceReceiptRef: provenance.ref,
    sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref, terminalRef: terminal.ref,
    ...(appliedSchema ? { appliedSchema } : {}),
    status: 'PASS', releaseAuthority: false, evidenceScope: 'PROVIDER_PROVEN_RELEASE_EXECUTOR_ONLY_REUSE',
  }
}

export async function assertAppArtifactReuse({ root, profile, transport, intent, association, readSourceIdentity }) {
  if (association?.schemaVersion !== SCHEMA || association.ownerApplicationId !== profile.application.id ||
      association.projectId !== profile.target.projectId || association.releaseSourceRevision !== intent.sourceRevision ||
      association.status !== 'PASS' || association.releaseAuthority !== false ||
      association.evidenceScope !== 'PROVIDER_PROVEN_RELEASE_EXECUTOR_ONLY_REUSE' ||
      !same(association.baselineIntentRef, intent.baselineIntentRef) || association.previousRevision !== intent.previousRevision ||
      !association.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`) || !H64.test(association.buildInputSha256 ?? '')) {
    fail('APP_ARTIFACT_REUSE_INVALID')
  }
  const expectedEquivalence = appArtifactSourceEquivalence(root, association.artifactSourceRevision, intent.sourceRevision)
  if (!same(expectedEquivalence, association.sourceEquivalence)) fail('APP_ARTIFACT_REUSE_SOURCE_DRIFT')
  const [attempt, deployment, build, provenance, sbom, scan, terminal] = await Promise.all([
    readExact(transport, profile, association.attemptedIntentRef), readExact(transport, profile, association.deploymentRef),
    readExact(transport, profile, association.buildReceiptRef), readExact(transport, profile, association.provenanceReceiptRef),
    readExact(transport, profile, association.sbomReceiptRef), readExact(transport, profile, association.scanReceiptRef),
    readExact(transport, profile, association.terminalRef),
  ])
  assertStageReceipt(build.value, profile, attempt.value, 'build')
  assertStageReceipt(terminal.value, profile, attempt.value, 'terminal')
  const appliedSchema = terminal.value.facts?.databaseDisposition === 'FORWARD_APPLIED'
    ? await readAppliedSchemaAbort({ root, profile, transport, attemptedIntent: attempt.value, attemptedIntentRef: attempt.ref,
      deployment, build, terminal, readSourceIdentity })
    : (assertReusableAbortedTerminal(terminal.value, attempt.value), null)
  if (!same(appliedSchema, association.appliedSchema ?? null)) fail('APP_ARTIFACT_REUSE_SCHEMA_DRIFT')
  if (attempt.value.sourceRevision !== association.artifactSourceRevision || !same(attempt.value.baselineIntentRef, association.baselineIntentRef) ||
      attempt.value.previousRevision !== association.previousRevision || deployment.value.artifactDigest !== association.artifactDigest ||
      !same(deployment.value.sourceObject, association.artifactSourceObject) || build.value.facts?.artifactDigest !== association.artifactDigest ||
      provenance.value.artifactDigest !== association.artifactDigest || provenance.value.cloudBuild?.id !== association.cloudBuildId ||
      provenance.value.buildInputSha256 !== association.buildInputSha256 || provenance.value.sourceRevision !== association.artifactSourceRevision ||
      sbom.value.artifactDigest !== association.artifactDigest || sbom.value.status !== 'PASS' ||
      scan.value.artifactDigest !== association.artifactDigest || scan.value.status !== 'PASS' || scan.value.blockingVulnerabilityCount !== 0 ||
      terminal.value.facts?.result !== 'PRE_ACTIVATION_ABORTED') fail('APP_ARTIFACT_REUSE_EVIDENCE_DRIFT')
  return association
}

export async function reuseAppArtifactBuild({ profile, transport, intent, association }) {
  const attempt = await readExact(transport, profile, association.attemptedIntentRef)
  const sourceObject = await transport.readBytes(association.artifactSourceObject.uri, { prefixes: ['source'],
    expectedSha256: association.artifactSourceObject.sha256 })
  if (String(sourceObject.metadata?.generation) !== String(association.artifactSourceObject.generation) ||
      sourceObject.metadata?.crc32c !== association.artifactSourceObject.crc32c || !same(sourceObject.ref, {
        uri: association.artifactSourceObject.uri, sha256: association.artifactSourceObject.sha256 })) fail('APP_ARTIFACT_REUSE_SOURCE_OBJECT_DRIFT')
  const build = await transport.createBuild({ profile, intent: attempt.value, sourceObject, deadlineAt: intent.deadlineAt, reuseOnly: true })
  if (build.artifactDigest !== association.artifactDigest || build.buildInputSha256 !== association.buildInputSha256 ||
      build.build?.id !== association.cloudBuildId || build.reused !== true) fail('APP_ARTIFACT_REUSE_PROVIDER_MISMATCH')
  return { ...build, disposition: 'REUSED_CROSS_SOURCE_RELEASE_EXECUTOR_ONLY', artifactSourceRevision: association.artifactSourceRevision,
    artifactSourceObject: association.artifactSourceObject, association }
}
