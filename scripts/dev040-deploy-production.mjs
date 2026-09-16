#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040ReleaseIntent, assertDev040V3Profile, buildDev040MigrationBundle } from './lib/dev040-orgmaster-independent-release.mjs'
import { buildReleaseIntent, buildRuntimeConfigReceipt, buildSourceFreeze, readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { createGitSourceIdentity, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { canonicalize, createOwnerTransport, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { readRoutineBaseline, resolveRoutineControlBaseline, verifyRoutineRelease } from './lib/dev040-routine-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function command(name, args) {
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) throw new Error(`COMMAND_FAILED:${name}`)
  return result.stdout.trim()
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => !['--check', '--prepare-only'].includes(arg)) || args.length > 1) throw new Error('USAGE:npm run deploy:production [-- --check|--prepare-only]')
  const profile = JSON.parse(readGitBlob(root, 'config/release/dev040-orgmaster-independent-production-v3.json'))
  const n1c = JSON.parse(readGitBlob(root, 'config/dev-010/n1c-orgmaster.json'))
  assertDev040V3Profile(profile, n1c)
  const git = readGitAuthority(root, profile)
  // Capture credentials in memory only. No runtime secrets or refresh tokens are read locally.
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || (process.platform === 'win32'
    ? command('pwsh', ['-NoProfile', '-Command', 'gcloud auth print-access-token'])
    : command('gcloud', ['auth', 'print-access-token']))
  const transport = createOwnerTransport({ token })
  const head = await transport.readBytes(`gs://${profile.artifact.releaseBucket}/control/active.json`, { prefixes: ['control'] })
  const control = JSON.parse(head.bytes)
  const { controlSha256, ...core } = control
  if (controlSha256 !== sha256(canonicalize(core)) || control.state !== 'FINALIZED' || control.ownerApplicationId !== 'orgmaster' || control.service !== profile.target.serviceName || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(control.releaseId)) throw new Error('ROUTINE_CONTROL_NOT_FINALIZED')
  const previousIntent = await transport.readBytes(`gs://${profile.artifact.releaseBucket}/receipts/releases/${control.releaseId}/release-intent.json`, { prefixes: ['receipts'] })
  const baselineIntentRef = await resolveRoutineControlBaseline({ profile, transport, control, attempt: { ...previousIntent, value: JSON.parse(previousIntent.bytes) } })
  const baseline = await readRoutineBaseline({ profile, transport, baselineIntentRef })
  const previousRevision = baseline.terminal.value.facts.candidateRevision
  if (control.result === 'RELEASED' && (baseline.intent.sourceRevision !== control.sourceRevision || previousRevision !== control.candidateRevision)) throw new Error('ROUTINE_CONTROL_JOIN_INVALID')
  if (control.result !== 'RELEASED' && previousRevision !== control.previousRevision) throw new Error('ROUTINE_CONTROL_JOIN_INVALID')
  const service = await transport.getService(profile)
  const buildMigrationBundle = async (revision) => buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), new Map(profile.migrations.entries.map((entry) => [entry.path, readGitBlob(root, entry.path, revision)])), revision)
  const observedAt = new Date().toISOString()
  const releaseId = `ORGMASTER-REL-${observedAt.replace(/[^0-9]/gu, '')}-${git.sourceRevision.slice(0, 7).toUpperCase()}`
  const deadlineAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
  const sourceLock = buildSourceFreeze({ profile, releaseId, observedAt, git, sourceIdentityBytes: createGitSourceIdentity(root, git.sourceRevision), migrationBundle: await buildMigrationBundle(git.sourceRevision) })
  const previousRuntime = baseline.runtime.value.runtimeConfig ?? baseline.runtime.value
  const runtimeConfig = buildRuntimeConfigReceipt({ profile, releaseId, sourceLock, plainEnvironment: previousRuntime.plainEnvironment, secretVersions: previousRuntime.secretVersions, observedAt })
  const authority = { ownerApplicationId: 'orgmaster', projectId: profile.target.projectId, sourceRevision: git.sourceRevision, releaseId, environment: 'production', baselineIntentRef, expiresAt: deadlineAt, observedAt, status: 'PASS', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', remainingHumanAction: 0 }
  const authorization = { ...authority, schemaVersion: 'orgmaster.routine-release-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' }
  const readiness = { ...authority, schemaVersion: 'orgmaster.routine-release-readiness.v1' }
  const values = { sourceLock, runtimeConfig, authorization, readiness,
    foundation: (await transport.readJson(baseline.intent.foundationReceiptRef, profile.artifact.releaseBucket)).value,
    infra: (await transport.readJson(baseline.intent.infraReceiptRef, profile.artifact.releaseBucket)).value }
  const uri = (name) => `gs://${profile.artifact.releaseBucket}/receipts/releases/${releaseId}/${name}.json`
  const ref = (name, value) => ({ uri: uri(name), sha256: sha256(Buffer.from(`${canonicalize(value)}\n`)) })
  const input = { baselineIntentRef, previousRevision, deadlineAt, sourceLockRef: ref('source-lock', sourceLock), runtimeConfigRef: ref('runtime-config', runtimeConfig), authorizationPolicyRef: ref('owner-authorization', authorization), readinessReceiptRef: ref('owner-readiness', readiness), foundationReceiptRef: baseline.intent.foundationReceiptRef, infraReceiptRef: baseline.intent.infraReceiptRef }
  const intent = buildReleaseIntent({ profile, releaseId, input, sourceLock, prerequisiteValues: values, validateIntent: assertDev040ReleaseIntent })
  const verification = await verifyRoutineRelease({ root, profile, transport, intent, values, service, buildMigrationBundle })
  if (args.includes('--check')) {
    process.stdout.write(`${JSON.stringify({ status: 'READY', releaseAuthority: false, sourceRevision: git.sourceRevision, previousRevision: intent.previousRevision, verification })}\n`)
    return
  }
  for (const [name, value] of [['source-lock', sourceLock], ['runtime-config', runtimeConfig], ['owner-authorization', authorization], ['owner-readiness', readiness]]) await transport.putJson(uri(name), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  const result = await transport.putJson(uri('release-intent'), intent, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  const releaseCapsuleRef = `${result.ref.uri}#sha256=${result.ref.sha256}`
  // This is the existing protected ten-stage workflow, not a local deployment bypass.
  if (!args.includes('--prepare-only')) command('gh', ['workflow', 'run', profile.workflow.path, '--repo', profile.application.repository, '--ref', profile.application.branch, '-f', `releaseCapsuleRef=${releaseCapsuleRef}`])
  process.stdout.write(`${JSON.stringify({ status: args.includes('--prepare-only') ? 'PREPARED' : 'DISPATCHED', releaseId, sourceRevision: git.sourceRevision, releaseCapsuleRef, databaseAction: 'VERIFY_UNCHANGED_NO_DDL_NO_IMPORT' })}\n`)
}
main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
