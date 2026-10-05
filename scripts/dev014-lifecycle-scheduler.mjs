#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { canonicalize, createOwnerTransport, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { transitionLifecycleScheduler } from './lib/dev014-lifecycle-activation-prerequisites.mjs'

export function parseLifecycleSchedulerArgs(argv) {
  const value = { action: null, check: false }
  for (const arg of argv) {
    if (arg === '--check' && !value.check) value.check = true
    else if (['--pause','--resume'].includes(arg) && value.action === null) value.action = arg.slice(2)
    else throw new Error('DEV014_LIFECYCLE_SCHEDULER_ARGUMENTS_INVALID')
  }
  if (!value.action) throw new Error('DEV014_LIFECYCLE_SCHEDULER_ARGUMENTS_INVALID')
  return value
}

export async function runLifecycleSchedulerOperation({ action, check = false, sourceProof, transport }) {
  let result, failure
  try { result = await transitionLifecycleScheduler({action,check,sourceProof,transport}) }
  catch (error) {
    if (!error.transitionResult) throw error
    result = error.transitionResult; failure = error
  }
  if (check) return result
  const publish = async value => {
    const core = { schemaVersion:'orgmaster.managed-lifecycle-scheduler-transition.v1',
      projectId:'jenfu-platform-prod',region:'asia-east1',ownerApplicationId:'orgmaster',
      observedAt:transport.now(),sourceProof,...value }
    const receipt = {...core,receiptSha256:sha256(canonicalize(core))}
    return transport.putJson(`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV014-LIFECYCLE-SCHEDULER/${sourceProof.sourceRevision}/${sha256(canonicalize(receipt))}.json`,
      receipt,{bucket:'jenfu-platform-prod-orgmaster-release',prefix:'receipts',ifGenerationMatch:'0'})
  }
  let published
  try { published = await publish(result) }
  catch {
    // A successfully enabled job without a durable receipt is not deliverable.
    // Pause it rather than leaving undocumented active infrastructure behind.
    if (action === 'resume' && !failure) {
      try {
        const paused = await transitionLifecycleScheduler({action:'pause',sourceProof,transport})
        result = {...result,status:'RECOVERED_PAUSED',recoveryReadback:paused.after,
          errorCodes:['DEV014_LIFECYCLE_SCHEDULER_RECEIPT_PUBLISH_FAILED']}
      } catch (error) {
        result = {...result,status:'MANUAL_READBACK_REQUIRED',
          ...(error.transitionResult?.recoveryReadback ? {recoveryReadback:error.transitionResult.recoveryReadback} : {}),
          errorCodes:['DEV014_LIFECYCLE_SCHEDULER_RECEIPT_PUBLISH_FAILED']}
      }
      try { published = await publish(result) } catch { /* reported as unsealed below */ }
    }
    failure = Object.assign(new Error('DEV014_LIFECYCLE_SCHEDULER_RECEIPT_PUBLISH_FAILED'), {
      code:'DEV014_LIFECYCLE_SCHEDULER_RECEIPT_PUBLISH_FAILED',transitionResult:result })
  }
  const terminal = {...result,receiptPublished:Boolean(published),...(published ? {receiptRef:published.ref} : {})}
  if (failure) throw Object.assign(failure,{transitionResult:terminal})
  return terminal
}

async function main() {
  const options = parseLifecycleSchedulerArgs(process.argv.slice(2))
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const command = (name,args) => {
    const result = spawnSync(name,args,{cwd:root,encoding:'utf8',windowsHide:true})
    if (result.error || result.status !== 0) throw new Error(`DEV014_LIFECYCLE_OPERATOR_COMMAND_FAILED:${name}`)
    return result.stdout.trim()
  }
  const profile = JSON.parse(readGitBlob(root,'config/release/dev040-orgmaster-independent-production-v3.json'))
  const git = readGitAuthority(root,profile)
  const sourceProof = await verifyOfficialMergedSource({ repository:profile.application.repository,
    branch:profile.application.branch,revision:git.sourceRevision,sourceTree:git.sourceTree,
    rulesetId:24077876,token:process.env.GITHUB_TOKEN || command('gh',['auth','token']) })
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || (process.platform === 'win32'
    ? command('pwsh',['-NoProfile','-Command','gcloud auth print-access-token']) : command('gcloud',['auth','print-access-token']))
  const transport = createOwnerTransport({token})
  const result = await runLifecycleSchedulerOperation({...options,sourceProof,transport})
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error=>{
    if (error.transitionResult) process.stdout.write(`${JSON.stringify(error.transitionResult)}\n`)
    process.stderr.write(`${error.code ?? error.message}\n`);process.exitCode=1
  })
}
