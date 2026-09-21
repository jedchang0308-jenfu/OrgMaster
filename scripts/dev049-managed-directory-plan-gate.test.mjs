import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { evaluateDev049ManagedDirectoryPlan } from './dev049-managed-directory-plan-gate.mjs'

const sourceRevision = 'a'.repeat(40)
const foundationManifestSha256 = 'b'.repeat(64)
const profile = JSON.parse(fs.readFileSync(new URL('../config/release/dev049-managed-directory-production-plan.json', import.meta.url), 'utf8'))

function plan() {
  const variables = Object.fromEntries(Object.entries({
    project_id: 'jenfu-platform-prod', project_number: '9536592944', region: 'asia-east1',
    runtime_service_account_id: 'orgmaster-prod-runtime', dwd_service_account_id: 'orgmaster-prod-directory-dwd',
    source_revision: sourceRevision, foundation_manifest_sha256: foundationManifestSha256,
    operator_email: 'jedchang0308@jenfu.com.tw',
  }).map(([key, value]) => [key, { value }]))
  const input = {
    delegated_scope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
    signer_email: 'orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com',
    project_id: 'jenfu-platform-prod', project_number: '9536592944', region: 'asia-east1',
    source_revision: sourceRevision, foundation_manifest_sha256: foundationManifestSha256,
    operator_email: 'jedchang0308@jenfu.com.tw',
    required_service: 'admin.googleapis.com',
  }
  const legacyInput = { ...input }; delete legacyInput.required_service; legacyInput.source_revision = 'c'.repeat(40)
  const configuration = { root_module: { resources: [
    { address: 'data.google_service_account.runtime', mode: 'data', type: 'google_service_account' },
    { address: 'google_project_service.admin_directory', mode: 'managed', type: 'google_project_service' },
    { address: 'terraform_data.provenance', mode: 'managed', type: 'terraform_data' },
    { address: 'google_service_account.directory_dwd', mode: 'managed', type: 'google_service_account' },
    { address: 'google_service_account_iam_member.runtime_token_creator', mode: 'managed', type: 'google_service_account_iam_member' },
  ] } }
  const prior_state = { values: { root_module: { resources: [{
    address: 'data.google_service_account.runtime', mode: 'data', type: 'google_service_account', values: {
      account_id: 'orgmaster-prod-runtime', project: 'jenfu-platform-prod', disabled: false,
      email: 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
      name: 'projects/jenfu-platform-prod/serviceAccounts/orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
    },
  }] } } }
  return { variables, configuration, prior_state, resource_changes: [
    { address: 'terraform_data.provenance', change: { actions: ['update'], before: { input: legacyInput }, after: { input } } },
    { address: 'google_project_service.admin_directory', change: { actions: ['create'], after: { project: 'jenfu-platform-prod', service: 'admin.googleapis.com', disable_on_destroy: false } } },
    { address: 'google_service_account.directory_dwd', change: { actions: ['create'] } },
    { address: 'google_service_account_iam_member.runtime_token_creator', change: { actions: ['create'] } },
  ] }
}

test('DEV-049 signer plan gate accepts only the exact source-bound API and signer set', () => {
  const result = evaluateDev049ManagedDirectoryPlan({ plan: plan(), profile, sourceRevision, foundationManifestSha256 })
  assert.equal(result.status, 'PASS')
  const unsafe = plan(); unsafe.resource_changes[2].change.actions = ['delete', 'create']
  assert.throws(() => evaluateDev049ManagedDirectoryPlan({ plan: unsafe, profile, sourceRevision, foundationManifestSha256 }), /DEV049_PLAN_ACTION_INVALID/u)
  const missingRead = plan(); missingRead.configuration.root_module.resources.shift()
  assert.throws(() => evaluateDev049ManagedDirectoryPlan({ plan: missingRead, profile, sourceRevision, foundationManifestSha256 }), /DEV049_PLAN_CONFIGURATION_SET_INVALID/u)
})

test('DEV-049 signer plan gate rejects target and provenance drift', () => {
  const wrongTarget = plan(); wrongTarget.variables.project_id.value = 'jenfu-platform-nonprod'
  assert.throws(() => evaluateDev049ManagedDirectoryPlan({ plan: wrongTarget, profile, sourceRevision, foundationManifestSha256 }), /DEV049_PLAN_VARIABLE_INVALID/u)
  const wrongSource = plan(); wrongSource.resource_changes[0].change.after.input.source_revision = 'c'.repeat(40)
  assert.throws(() => evaluateDev049ManagedDirectoryPlan({ plan: wrongSource, profile, sourceRevision, foundationManifestSha256 }), /DEV049_PLAN_PROVENANCE_INVALID/u)
  const disabledRuntime = plan(); disabledRuntime.prior_state.values.root_module.resources[0].values.disabled = true
  assert.throws(() => evaluateDev049ManagedDirectoryPlan({ plan: disabledRuntime, profile, sourceRevision, foundationManifestSha256 }), /DEV049_PLAN_RUNTIME_READBACK_INVALID/u)
  const wrongService = plan(); wrongService.resource_changes[1].change.after.service = 'admin.googleapis.example'
  assert.throws(() => evaluateDev049ManagedDirectoryPlan({ plan: wrongService, profile, sourceRevision, foundationManifestSha256 }), /DEV049_PLAN_ADMIN_SERVICE_INVALID/u)
})
