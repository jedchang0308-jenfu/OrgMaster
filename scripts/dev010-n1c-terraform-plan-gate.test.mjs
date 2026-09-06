import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertExpectedPlanInputs, assertPlanAllowlist, assertPlanProfile, loadPlanAllowlist, normalizePlanChanges } from './lib/dev010-n1c-terraform-plan-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contract = loadPlanAllowlist(path.join(root, 'config', 'dev-010', 'n1c-orgmaster-plan-allowlist.json'))
const allow = contract.profiles['migration-job'].addresses
const expectedInputs = {
  source_revision: 'a'.repeat(40),
  foundation_manifest_sha256: 'b'.repeat(64),
  migration_image: `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev010-n1c/orgmaster-migration@sha256:${'c'.repeat(64)}`,
}
const plan = (profileName, addresses = contract.profiles[profileName].addresses) => ({
  variables: Object.fromEntries(Object.entries({ ...contract.requiredVariables, ...contract.profiles[profileName].variables, ...expectedInputs }).map(([name, value]) => [name, { value }])),
  resource_changes: addresses.map((address) => ({ address, change: { actions: ['create'] } })),
})

test('N1C-ORG-PLAN-01 exact reviewed Terraform address is create-only', () => {
  assert.deepEqual(allow, ['google_cloud_run_v2_job.migration[0]'])
  assert.equal(assertPlanProfile(plan('migration-job'), contract, 'migration-job').status, 'PASS')
  assert.equal(assertPlanProfile(plan('default-off'), contract, 'default-off').changeCount, 0)
})

test('N1C-ORG-PLAN-02 native Terraform JSON is normalized', () => {
  assert.deepEqual(normalizePlanChanges({ resource_changes: [{ address: allow[0], change: { actions: ['create'] } }] }), [{ address: allow[0], actions: ['create'] }])
})

test('N1C-ORG-PLAN-03 source, foundation manifest, and migration digest are exact-bound', () => {
  const required = Object.keys(expectedInputs)
  assert.deepEqual(assertExpectedPlanInputs(plan('migration-job'), expectedInputs, required).boundInputs, required)
  assert.throws(() => assertExpectedPlanInputs(plan('migration-job'), { ...expectedInputs, source_revision: 'd'.repeat(40) }, required), /DEV010_N1C_PLAN_INPUT_MISMATCH/u)
})

test('N1C-ORG-PLAN-04 unknown, update, delete, replace, and duplicate allowlist fail closed', () => {
  assert.throws(() => assertPlanAllowlist([{ address: 'google_cloud_run_v2_service.unreviewed[0]', actions: ['create'] }], allow), /DEV010_N1C_UNKNOWN_RESOURCE/u)
  assert.throws(() => assertPlanAllowlist([{ address: allow[0], actions: ['update'] }], allow), /DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN/u)
  assert.throws(() => assertPlanAllowlist([{ address: allow[0], actions: ['delete'] }], allow), /DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN/u)
  assert.throws(() => assertPlanAllowlist([{ address: allow[0], actions: ['delete', 'create'] }], allow), /DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN/u)
  assert.throws(() => assertPlanAllowlist([], [allow[0], allow[0]]), /DEV010_N1C_INVALID_PLAN_ALLOWLIST/u)
  assert.throws(() => assertPlanProfile(plan('migration-job', []), contract, 'migration-job'), /DEV010_N1C_PLAN_PROFILE_MISMATCH/u)
  const wrongTarget = plan('migration-job')
  wrongTarget.variables.project_id.value = 'jenfu-ai-pdm-prod'
  assert.throws(() => assertPlanProfile(wrongTarget, contract, 'migration-job'), /DEV010_N1C_PLAN_VARIABLE_MISMATCH/u)
})

test('N1C-ORG-PLAN-05 migration job reaches private Cloud SQL through a pinned proxy and shared Unix socket', () => {
  const terraform = fs.readFileSync(path.join(root, 'infra', 'google-cloud', 'dev-010-n1c', 'migration-runner.tf'), 'utf8')
  const variables = fs.readFileSync(path.join(root, 'infra', 'google-cloud', 'dev-010-n1c', 'variables.tf'), 'utf8')
  assert.match(terraform, /execution_environment\s*=\s*"EXECUTION_ENVIRONMENT_GEN2"/u)
  assert.match(terraform, /vpc_access[\s\S]+egress\s*=\s*"ALL_TRAFFIC"[\s\S]+foundation_network_name[\s\S]+foundation_subnetwork_name/u)
  assert.match(terraform, /name\s*=\s*"orgmaster-migration"[\s\S]+depends_on\s*=\s*\["cloud-sql-proxy"\]/u)
  assert.match(terraform, /name\s*=\s*"cloud-sql-proxy"[\s\S]+--unix-socket=\/cloudsql[\s\S]+--private-ip[\s\S]+--auto-iam-authn/u)
  assert.match(terraform, /--health-check[\s\S]+path\s*=\s*"\/startup"/u)
  assert.match(terraform, /empty_dir[\s\S]+medium\s*=\s*"MEMORY"/u)
  assert.doesNotMatch(terraform, /cloud_sql_instance\s*\{/u)
  assert.match(variables, /cloud-sql-proxy:2\.22\.0@sha256:[0-9a-f]{64}/u)
})
