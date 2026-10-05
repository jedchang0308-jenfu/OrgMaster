#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { readGitBlob, createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { sha256 } from './lib/dev012-production-migration-runner.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { evaluateManagedLifecycleBoundPlan } from './lib/dev014-managed-lifecycle-plan-gate.mjs'
import { LIFECYCLE_SCHEDULER_NAME, readPublishedLifecycleOwner } from './lib/dev014-lifecycle-activation-prerequisites.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function ref(value) {
  const match = /^(?<uri>gs:\/\/jenfu-platform-prod-(?:platform|orgmaster|aipdm)-release\/receipts\/[A-Za-z0-9._/-]+\.json)#sha256=(?<sha256>[a-f0-9]{64})$/u.exec(value ?? '')
  if (!match || match.groups.uri.includes('..')) throw new Error('DEV014_LIFECYCLE_PLAN_REF_INVALID')
  return { ...match.groups }
}
async function main() {
  const [planPath, sourceLockRef, foundationRef, transitionRef, ...extra] = process.argv.slice(2)
  if (!planPath || !sourceLockRef || !foundationRef || extra.length) throw new Error('DEV014_LIFECYCLE_PLAN_ARGUMENTS_INVALID')
  const ownerProfile = JSON.parse(readGitBlob(root, 'config/release/dev040-orgmaster-independent-production-v3.json'))
  const profile = JSON.parse(readGitBlob(root, 'config/release/dev014-managed-lifecycle-production-plan.json'))
  const git = readGitAuthority(root, ownerProfile)
  const cli = (name, args) => execFileSync(name, args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || (process.platform === 'win32'
    ? cli('pwsh', ['-NoProfile', '-Command', 'gcloud auth print-access-token']) : cli('gcloud', ['auth', 'print-access-token']))
  const sourceProof = await verifyOfficialMergedSource({ repository: ownerProfile.application.repository,
    branch: ownerProfile.application.branch, revision: git.sourceRevision, sourceTree: git.sourceTree,
    token: process.env.GITHUB_TOKEN || cli('gh', ['auth', 'token']), rulesetId: 24077876 })
  const transport = createOwnerTransport({ token })
  const sourceBinding = ref(sourceLockRef)
  const foundationBinding = ref(foundationRef)
  const bucket = value => value.uri.split('/')[2]
  const [sourceReadback, foundationReadback, bytes] = await Promise.all([
    transport.readJson(sourceBinding, bucket(sourceBinding), ['receipts']),
    transport.readJson(foundationBinding, bucket(foundationBinding), ['receipts']),
    fs.readFile(path.resolve(planPath)),
  ])
  if (sourceReadback.value.sourceSha256 !== sha256(createGitSourceIdentity(root, git.sourceRevision))) {
    throw new Error('DEV014_LIFECYCLE_PLAN_SOURCE_IDENTITY_INVALID')
  }
  const plan = JSON.parse(bytes)
  const existing = plan.resource_changes?.find(row => row.address === 'google_cloud_scheduler_job.managed_identity_lifecycle')?.change
  let schedulerReadback, transitionReadback, ownerReadbacks
  if (existing?.actions?.[0] === 'no-op') {
    schedulerReadback = await transport.request(`https://cloudscheduler.googleapis.com/v1/${LIFECYCLE_SCHEDULER_NAME}`)
    if (existing.after?.paused === false) {
      const binding = ref(transitionRef)
      ;[transitionReadback,...ownerReadbacks] = await Promise.all([
        transport.readJson(binding, ownerProfile.artifact.releaseBucket, ['receipts']),
        readPublishedLifecycleOwner({owner:'orgmaster',transport,lifecycleEnabled:true}),
        readPublishedLifecycleOwner({owner:'platform',transport}),
      ])
    } else if (transitionRef) throw new Error('DEV014_LIFECYCLE_PLAN_ARGUMENTS_INVALID')
  } else if (transitionRef) throw new Error('DEV014_LIFECYCLE_PLAN_ARGUMENTS_INVALID')
  const result = evaluateManagedLifecycleBoundPlan({ plan, profile,
    sourceReadback, foundationReadback, sourceProof, schedulerReadback, transitionReadback, ownerReadbacks })
  process.stdout.write(`${JSON.stringify({ ...result, structuredPlanSha256: sha256(bytes),
    costDecisionRequired: profile.applyAuthorized !== true, productionMutations: 0 })}\n`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
}
