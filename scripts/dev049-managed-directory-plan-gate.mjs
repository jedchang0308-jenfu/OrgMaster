#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = path.join(root, 'config', 'release', 'dev049-managed-directory-production-plan.json')
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

function fail(code, detail = '') { throw new Error(detail ? `${code}:${detail}` : code) }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

export function evaluateDev049ManagedDirectoryPlan({ plan, profile, sourceRevision, foundationManifestSha256 }) {
  if (!H40.test(sourceRevision ?? '') || !H64.test(foundationManifestSha256 ?? '')) fail('DEV049_PLAN_BINDING_INVALID')
  if (profile?.schemaVersion !== 'jenfu.dev049.managed-directory-plan-profile.v1'
    || profile.profileId !== 'DEV049_MANAGED_DIRECTORY_PRODUCTION'
    || profile.terraformRoot !== 'infra/google-cloud/dev-049-managed-directory'
    || profile.state?.bucket !== 'tfstate-jenfu-platform-prod'
    || profile.state?.prefix !== 'dev-049/managed-directory/default.tfstate') fail('DEV049_PLAN_PROFILE_INVALID')
  const expectedVariables = {
    project_id: profile.target.projectId,
    project_number: profile.target.projectNumber,
    region: profile.target.region,
    runtime_service_account_id: profile.target.runtimeServiceAccountId,
    dwd_service_account_id: profile.target.dwdServiceAccountId,
    source_revision: sourceRevision,
    foundation_manifest_sha256: foundationManifestSha256,
    operator_email: profile.target.operatorEmail,
  }
  for (const [name, expected] of Object.entries(expectedVariables)) {
    if (plan?.variables?.[name]?.value !== expected) fail('DEV049_PLAN_VARIABLE_INVALID', name)
  }
  const changes = new Map((plan?.resource_changes ?? []).map((row) => [row.address, row]))
  const required = Object.keys(profile.requiredAddresses).sort()
  if (!same([...changes.keys()].sort(), required)) fail('DEV049_PLAN_ADDRESS_SET_INVALID')
  for (const address of required) {
    const actions = changes.get(address)?.change?.actions
    const allowed = profile.requiredAddresses[address]
    if (!Array.isArray(actions) || actions.length !== 1 || !allowed.includes(actions[0])) fail('DEV049_PLAN_ACTION_INVALID', address)
  }
  const provenance = changes.get('terraform_data.provenance')?.change?.after?.input
  const expectedProvenance = {
    project_id: profile.target.projectId,
    project_number: profile.target.projectNumber,
    region: profile.target.region,
    source_revision: sourceRevision,
    foundation_manifest_sha256: foundationManifestSha256,
    operator_email: profile.target.operatorEmail,
    signer_email: `${profile.target.dwdServiceAccountId}@${profile.target.projectId}.iam.gserviceaccount.com`,
    delegated_scope: profile.target.delegatedScope,
  }
  if (!same(provenance, expectedProvenance)) fail('DEV049_PLAN_PROVENANCE_INVALID')
  return {
    schemaVersion: 'jenfu.dev049.managed-directory-plan-gate.v1',
    status: 'PASS',
    profileId: profile.profileId,
    sourceRevision,
    foundationManifestSha256,
    resourceAddresses: required,
  }
}

function parseArgs(argv) {
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!['--plan-json', '--source-revision', '--foundation-manifest-sha256'].includes(key) || !argv[index + 1]) fail('DEV049_PLAN_ARGUMENT_INVALID')
    value[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1]
  }
  if (Object.keys(value).length !== 3) fail('DEV049_PLAN_ARGUMENT_INVALID')
  return value
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  const dirty = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  if (head !== args.sourceRevision || dirty !== '') fail('DEV049_SOURCE_NOT_FROZEN')
  const planBytes = fs.readFileSync(path.resolve(args.planJson))
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  const result = evaluateDev049ManagedDirectoryPlan({ plan: JSON.parse(planBytes.toString('utf8')), profile, sourceRevision: args.sourceRevision, foundationManifestSha256: args.foundationManifestSha256 })
  process.stdout.write(`${JSON.stringify({ ...result, planJsonSha256: createHash('sha256').update(planBytes).digest('hex') })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
