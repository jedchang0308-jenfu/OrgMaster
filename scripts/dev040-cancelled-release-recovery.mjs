#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertDev040ReleaseIntent, assertDev040V3Profile } from './lib/dev040-orgmaster-independent-release.mjs'
import { canonicalize, createOwnerTransport, sha256 } from './lib/dev012-owner-release-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = path.join(root, 'config/release/dev040-orgmaster-independent-production-v3.json')
const n1cPath = path.join(root, 'config/dev-010/n1c-orgmaster.json')
const H64 = /^[a-f0-9]{64}$/u
const PRE_ACTIVATION_STATES = new Set(['CANDIDATE_CREATED', 'ENTRYPOINT_CONFIGURED', 'CANDIDATE_VERIFIED'])
const CONTROL_KEYS = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256'].sort()

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function assertCancelledRecoveryPreflight({ profile, intent, control, run, ownerRunId, nowMs = Date.now(), final = false }) {
  const expectedRunRef = `https://api.github.com/repos/${profile.application.repository}/actions/runs/${ownerRunId}`
  if (Object.keys(control ?? {}).sort().join('\n') !== CONTROL_KEYS.join('\n')) fail('RECOVERY_CONTROL_INVALID')
  const { controlSha256, ...core } = control ?? {}
  if (control?.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.ownerApplicationId !== profile.application.id ||
      control.service !== profile.target.serviceName || control.controlBucket !== profile.artifact.releaseBucket ||
      !H64.test(controlSha256 ?? '') || sha256(canonicalize(core)) !== controlSha256) fail('RECOVERY_CONTROL_INVALID')
  if (control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision ||
      control.ownerRunRef !== expectedRunRef || String(run?.id ?? '') !== ownerRunId || run.headSha !== intent.sourceRevision ||
      run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'cancelled') fail('RECOVERY_OWNER_RUN_INVALID')
  if (final) {
    if (control.state !== 'FINALIZED' || !['PRE_ACTIVATION_ABORTED', 'ROLLED_BACK'].includes(control.result)) fail('RECOVERY_NOT_FINALIZED')
  } else {
    if (!PRE_ACTIVATION_STATES.has(control.state) || control.result !== null || !control.candidateRevision || !Number.isFinite(Date.parse(control.leaseExpiresAt)) ||
        nowMs <= Date.parse(control.leaseExpiresAt)) fail('RECOVERY_NOT_ELIGIBLE')
  }
  return { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, state: control.state, result: control.result }
}

function parseArgs(argv) {
  const result = { final: false }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--verify-final') result.final = true
    else if (argv[index] === '--capsule-ref') result.capsuleRef = argv[++index]
    else if (argv[index] === '--owner-run-id') result.ownerRunId = argv[++index]
    else fail('RECOVERY_ARGUMENT_INVALID')
  }
  const match = /^(gs:\/\/[^#]+\.json)#sha256=([a-f0-9]{64})$/u.exec(result.capsuleRef ?? '')
  if (!match || !/^[1-9][0-9]*$/u.test(result.ownerRunId ?? '')) fail('RECOVERY_ARGUMENT_INVALID')
  return { ...result, capsuleUri: match[1], capsuleSha256: match[2] }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [profile, n1c] = await Promise.all([profilePath, n1cPath].map((file) => fs.readFile(file, 'utf8').then(JSON.parse)))
  assertDev040V3Profile(profile, n1c)
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const [capsule, controlRead] = await Promise.all([
    transport.readJson({ uri: args.capsuleUri, sha256: args.capsuleSha256 }, profile.artifact.releaseBucket, ['receipts']),
    transport.readBytes(`gs://${profile.artifact.releaseBucket}/control/active.json`, { prefixes: ['control'] }),
  ])
  let control
  try { control = JSON.parse(controlRead.bytes.toString('utf8')) } catch { fail('RECOVERY_CONTROL_INVALID') }
  const intent = assertDev040ReleaseIntent(capsule.value, profile)
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  const result = assertCancelledRecoveryPreflight({ profile, intent, control, run, ownerRunId: args.ownerRunId, final: args.final })
  process.stdout.write(`${JSON.stringify({ status: 'PASS', mode: args.final ? 'final' : 'preflight', ...result })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
}
