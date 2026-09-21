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
function sameRecord(observed, expected) {
  return observed && same(Object.keys(observed).sort(), Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => observed[key] === value)
}

export function evaluateDev049ManagedDirectoryPlan({ plan, profile, sourceRevision, foundationManifestSha256 }) {
  if (!H40.test(sourceRevision ?? '') || !H64.test(foundationManifestSha256 ?? '')) fail('DEV049_PLAN_BINDING_INVALID')
  if (profile?.schemaVersion !== 'jenfu.dev049.managed-directory-plan-profile.v3'
    || profile.profileId !== 'DEV049_MANAGED_DIRECTORY_PRODUCTION'
    || profile.terraformRoot !== 'infra/google-cloud/dev-049-managed-directory'
    || profile.state?.bucket !== 'tfstate-jenfu-platform-prod'
    || profile.state?.prefix !== 'dev-049/managed-directory/default.tfstate'
    || profile.target?.requiredService !== 'admin.googleapis.com') fail('DEV049_PLAN_PROFILE_INVALID')
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
  const configured = new Map((plan?.configuration?.root_module?.resources ?? []).map((row) => [row.address, row]))
  const requiredConfiguration = Object.keys(profile.requiredConfigurationAddresses).sort()
  if (!same([...configured.keys()].sort(), requiredConfiguration)) fail('DEV049_PLAN_CONFIGURATION_SET_INVALID')
  for (const address of requiredConfiguration) {
    const expected = profile.requiredConfigurationAddresses[address]
    const observed = configured.get(address)
    if (observed?.mode !== expected.mode || observed?.type !== expected.type) fail('DEV049_PLAN_CONFIGURATION_INVALID', address)
  }
  const runtime = (plan?.prior_state?.values?.root_module?.resources ?? []).find((row) => row.address === profile.runtimeReadbackAddress)
  const runtimeEmail = `${profile.target.runtimeServiceAccountId}@${profile.target.projectId}.iam.gserviceaccount.com`
  if (runtime?.mode !== 'data' || runtime?.type !== 'google_service_account'
    || runtime.values?.account_id !== profile.target.runtimeServiceAccountId
    || runtime.values?.project !== profile.target.projectId
    || runtime.values?.email !== runtimeEmail
    || runtime.values?.name !== `projects/${profile.target.projectId}/serviceAccounts/${runtimeEmail}`
    || runtime.values?.disabled !== false) fail('DEV049_PLAN_RUNTIME_READBACK_INVALID')
  const changes = new Map((plan?.resource_changes ?? []).map((row) => [row.address, row]))
  const required = Object.keys(profile.requiredChangeAddresses).sort()
  if (!same([...changes.keys()].sort(), required)) fail('DEV049_PLAN_ADDRESS_SET_INVALID')
  for (const address of required) {
    const actions = changes.get(address)?.change?.actions
    const allowed = profile.requiredChangeAddresses[address]
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
    required_service: profile.target.requiredService,
  }
  if (!sameRecord(provenance, expectedProvenance)) fail('DEV049_PLAN_PROVENANCE_INVALID')
  const provenanceChange = changes.get('terraform_data.provenance')?.change
  if (provenanceChange?.actions?.[0] === 'update') {
    const legacy = provenanceChange.before?.input
    const {
      required_service: _requiredService,
      source_revision: _sourceRevision,
      foundation_manifest_sha256: _foundationManifestSha256,
      ...stable
    } = expectedProvenance
    if (!H40.test(legacy?.source_revision ?? '') || !H64.test(legacy?.foundation_manifest_sha256 ?? '')
      || !sameRecord(legacy, {
        ...stable,
        source_revision: legacy.source_revision,
        foundation_manifest_sha256: legacy.foundation_manifest_sha256,
      })) {
      fail('DEV049_PLAN_PROVENANCE_UPDATE_INVALID')
    }
  }
  const adminService = changes.get('google_project_service.admin_directory')?.change?.after
  if (adminService?.project !== profile.target.projectId || adminService?.service !== profile.target.requiredService
    || adminService?.disable_on_destroy !== false || adminService?.deletion_policy !== 'ABANDON') {
    fail('DEV049_PLAN_ADMIN_SERVICE_INVALID')
  }
  return {
    schemaVersion: 'jenfu.dev049.managed-directory-plan-gate.v1',
    status: 'PASS',
    profileId: profile.profileId,
    sourceRevision,
    foundationManifestSha256,
    configuredAddresses: requiredConfiguration,
    changeAddresses: required,
    runtimeReadbackAddress: profile.runtimeReadbackAddress,
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
