import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import {
  evaluateManagedLifecycleBoundPlan,
  evaluateManagedLifecyclePlanShape,
} from './dev014-managed-lifecycle-plan-gate.mjs'
import { lifecycleSchedulerSnapshot,LIFECYCLE_SCHEDULER_NAME } from './dev014-lifecycle-activation-prerequisites.mjs'

const profile = JSON.parse(readFileSync(new URL('../../config/release/dev014-managed-lifecycle-production-plan.json', import.meta.url), 'utf8'))
const jobAddress = 'google_cloud_scheduler_job.managed_identity_lifecycle'
const configAddresses = [
  'data.google_project.current',
  'data.google_service_account.runtime',
  jobAddress,
]
const sourceRevision = 'a'.repeat(40)
const foundationManifestSha256 = 'b'.repeat(64)
const canonicalOrigin = 'https://orgmaster-prod-9536592944.asia-east1.run.app'
const runtimeServiceAccount = 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'

// This fixed fixture preserves the sanitized Terraform 1.2/provider-7.45
// plan shape from the 2026-10-06 structured preview. Source variables and the
// output binding below are test-only inputs; the captured preview itself had
// neither, so it must remain rejected as unbound.
function planFixture(revision = sourceRevision, manifestSha256 = foundationManifestSha256) {
  const job = {
    app_engine_http_target: [],
    attempt_deadline: '60s',
    deletion_policy: 'DELETE',
    description: 'DEV-014 managed identity lifecycle worker trigger',
    http_target: [{
      body: null,
      headers: null,
      http_method: 'POST',
      oauth_token: [],
      oidc_token: [{ audience: canonicalOrigin, service_account_email: runtimeServiceAccount }],
      uri: canonicalOrigin + '/api/internal/managed-identity-lifecycle/v2',
    }],
    name: 'orgmaster-prod-managed-identity-lifecycle',
    paused: true,
    project: 'jenfu-platform-prod',
    pubsub_target: [],
    region: 'asia-east1',
    retry_config: [],
    schedule: '* * * * *',
    time_zone: 'Asia/Taipei',
    timeouts: null,
  }
  const resource = { address: jobAddress, mode: 'managed', type: 'google_cloud_scheduler_job', values: job }
  return {
    applyable: true,
    complete: true,
    errored: false,
    variables: {
      source_revision: { value: revision },
      foundation_manifest_sha256: { value: manifestSha256 },
    },
    configuration: {
      provider_config: {
        google: { full_name: 'registry.terraform.io/hashicorp/google', version_constraint: '7.45.0' },
      },
      root_module: {
        resources: [
          { address: jobAddress, mode: 'managed', type: 'google_cloud_scheduler_job', provider_config_key: 'google' },
          { address: 'data.google_project.current', mode: 'data', type: 'google_project', provider_config_key: 'google' },
          { address: 'data.google_service_account.runtime', mode: 'data', type: 'google_service_account', provider_config_key: 'google' },
        ],
      },
    },
    prior_state: {
      values: {
        root_module: {
          resources: [
            { address: 'data.google_project.current', mode: 'data', type: 'google_project', values: {
              project_id: 'jenfu-platform-prod', number: '9536592944',
            } },
            { address: 'data.google_service_account.runtime', mode: 'data', type: 'google_service_account', values: {
              project: 'jenfu-platform-prod', account_id: 'orgmaster-prod-runtime',
              email: runtimeServiceAccount,
              name: 'projects/jenfu-platform-prod/serviceAccounts/' + runtimeServiceAccount,
              unique_id: '109928765105400231333', disabled: false,
            } },
          ],
        },
      },
    },
    resource_changes: [{
      address: jobAddress,
      mode: 'managed',
      type: 'google_cloud_scheduler_job',
      change: {
        actions: ['create'],
        before: null,
        after: structuredClone(job),
        after_unknown: {
          app_engine_http_target: [],
          http_target: [{ oauth_token: [], oidc_token: [{}] }],
          id: true,
          pubsub_target: [],
          retry_config: [],
          state: true,
        },
        after_sensitive: {
          app_engine_http_target: [],
          http_target: [{ oauth_token: [], oidc_token: [{}] }],
          pubsub_target: [],
          retry_config: [],
        },
      },
    }],
    planned_values: { root_module: { resources: [resource] } },
    output_changes: { release_binding: { after: {
      source_revision: revision,
      foundation_manifest_sha256: manifestSha256,
      project_id: 'jenfu-platform-prod',
      project_number: '9536592944',
      region: 'asia-east1',
    } } },
  }
}

function rejectShape(change, expected) {
  const plan = planFixture()
  const testedProfile = structuredClone(profile)
  change(plan, testedProfile)
  assert.throws(() => evaluateManagedLifecyclePlanShape({
    plan, profile: testedProfile, sourceRevision, foundationManifestSha256,
  }), expected)
}

function readback(uri, value, generation = '7') {
  const bytes = Buffer.from(canonicalize(value) + '\n', 'utf8')
  return { bytes, ref: { uri, sha256: sha256(bytes) }, metadata: { generation }, value: structuredClone(value) }
}

function boundFixture() {
  const source = {
    schemaVersion: 'jenfu.dev012.owner-source-lock.v1',
    ownerApplicationId: 'orgmaster',
    repository: 'jedchang0308-jenfu/OrgMaster',
    branch: 'master',
    sourceRevision,
    sourceTree: 'c'.repeat(40),
    sourceSha256: 'd'.repeat(64),
    remoteRevision: sourceRevision,
    remoteRef: 'refs/heads/master',
    clean: true,
    status: 'SOURCE_FROZEN',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
  }
  const foundationManifest = { schemaVersion: 'jenfu.dev012.foundation-manifest.v1', entries: [] }
  const manifestSha256 = sha256(canonicalize(foundationManifest))
  const foundationCore = {
    schemaVersion: 'jenfu.dev012.foundation-receipt.v1',
    projectId: 'jenfu-platform-prod',
    region: 'asia-east1',
    status: 'APPLIED',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_PROVIDER',
    foundationManifest,
    foundationManifestSha256: manifestSha256,
  }
  const foundation = { ...foundationCore, receiptSha256: sha256(canonicalize(foundationCore)) }
  return {
    plan: planFixture(sourceRevision, manifestSha256),
    profile: structuredClone(profile),
    sourceReadback: readback('gs://jenfu-platform-prod-orgmaster-release/receipts/releases/REL-SAMPLE/source-lock.json', source),
    foundationReadback: readback('gs://jenfu-platform-prod-orgmaster-release/receipts/foundation/provider-readback.json', foundation),
    sourceProof: {
      sourceRevision,
      sourceTree: source.sourceTree,
      repository: source.repository,
      branch: source.branch,
      branchProtected: true,
      status: 'OFFICIAL_MERGED_PR_VERIFIED',
      rulesetId: 24077876,
      reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED',
      requiredChecks: ['Production Source QC'],
    },
  }
}

function resealReadback(record, value) {
  const next = readback(record.ref.uri, value, record.metadata.generation)
  return next
}

function rejectBound(change, expected) {
  const fixture = boundFixture()
  change(fixture)
  assert.throws(() => evaluateManagedLifecycleBoundPlan(fixture), expected)
}

test('accepts the exact paused, bodyless OIDC create and its unchanged no-op', () => {
  const create = evaluateManagedLifecyclePlanShape({
    plan: planFixture(), profile: structuredClone(profile), sourceRevision, foundationManifestSha256,
  })
  assert.equal(create.status, 'PLAN_SHAPE_VERIFIED')
  assert.deepEqual(create.configuredAddresses, configAddresses)
  assert.deepEqual(create.changeAddresses, [jobAddress])
  assert.deepEqual(create.resolvedDataAddresses, configAddresses.slice(0, 2))
  assert.equal(create.initialPaused, true)
  assert.equal(create.releaseAuthority, false)

  const noOp = planFixture()
  noOp.resource_changes[0].change.after.state = 'PAUSED'
  noOp.planned_values.root_module.resources[0].values.state = 'PAUSED'
  noOp.resource_changes[0].change.actions = ['no-op']
  noOp.resource_changes[0].change.before = structuredClone(noOp.resource_changes[0].change.after)
  assert.equal(evaluateManagedLifecyclePlanShape({
    plan: noOp, profile: structuredClone(profile), sourceRevision, foundationManifestSha256,
  }).status, 'PLAN_SHAPE_VERIFIED')
})

test('rejects update, delete, replacement, create-before drift, missing, duplicate and extra addresses', () => {
  for (const actions of [['update'], ['delete'], ['delete', 'create'], ['create', 'delete']]) {
    rejectShape(plan => { plan.resource_changes[0].change.actions = actions }, /ACTION_INVALID/u)
  }
  rejectShape(plan => { plan.resource_changes[0].change.before = {} }, /ACTION_INVALID/u)
  rejectShape(plan => { plan.resource_changes = [] }, /CHANGE_SET_INVALID/u)
  rejectShape(plan => { plan.resource_changes.push(structuredClone(plan.resource_changes[0])) }, /CHANGE_SET_INVALID/u)
  rejectShape(plan => { plan.resource_changes.push({ address: 'google_cloud_scheduler_job.other', change: { actions: ['create'] } }) }, /CHANGE_SET_INVALID/u)
  rejectShape(plan => { plan.configuration.root_module.resources.pop() }, /CONFIGURATION_SET_INVALID/u)
  rejectShape(plan => { plan.configuration.root_module.resources.push(structuredClone(plan.configuration.root_module.resources[0])) }, /CONFIGURATION_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources.pop() }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources.push(structuredClone(plan.prior_state.values.root_module.resources[0])) }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources.push({ address: 'data.google_project.sibling', mode: 'data', type: 'google_project', values: {} }) }, /DATA_READBACK_INVALID/u)

  const driftedNoOp = planFixture()
  driftedNoOp.resource_changes[0].change.after.state = 'PAUSED'
  driftedNoOp.planned_values.root_module.resources[0].values.state = 'PAUSED'
  driftedNoOp.resource_changes[0].change.actions = ['no-op']
  driftedNoOp.resource_changes[0].change.before = structuredClone(driftedNoOp.resource_changes[0].change.after)
  driftedNoOp.resource_changes[0].change.before.schedule = '*/5 * * * *'
  assert.throws(() => evaluateManagedLifecyclePlanShape({
    plan: driftedNoOp, profile: structuredClone(profile), sourceRevision, foundationManifestSha256,
  }), /ACTION_INVALID/u)
})

test('rejects extra request paths, payloads, headers, credentials, changed schedule or unknown OIDC fields', () => {
  const changes = [
    [plan => { plan.resource_changes[0].change.after.http_target[0].body = '{}' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.http_target[0].headers = { Authorization: 'Bearer test' } }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.http_target[0].oauth_token.push({}) }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.http_target[0].oidc_token = [] }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.http_target[0].uri += '?query=1' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.http_target[0].oidc_token[0].audience = 'https://wrong.example' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.http_target[0].oidc_token[0].service_account_email = 'other@example.com' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.pubsub_target = [{}] }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.paused = false }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.schedule = '*/5 * * * *' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.time_zone = 'UTC' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after.attempt_deadline = '120s' }, /JOB_INVALID/u],
    [plan => { plan.resource_changes[0].change.after_unknown.http_target[0].oidc_token[0].audience = true }, /UNKNOWN_OR_SENSITIVE_INPUT/u],
    [plan => { plan.resource_changes[0].change.after_sensitive.http_target[0].oidc_token[0].service_account_email = true }, /UNKNOWN_OR_SENSITIVE_INPUT/u],
  ]
  for (const [change, expected] of changes) rejectShape(change, expected)
})

test('rejects wrong production project or runtime identity in profile and provider data readback', () => {
  rejectShape((_plan, p) => { p.target.projectId = 'jenfu-platform-nonprod' }, /PROFILE_INVALID/u)
  rejectShape((_plan, p) => { p.target.runtimeServiceAccountUniqueId = '1'.repeat(21) }, /PROFILE_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources[0].values.project_id = 'wrong-project' }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources[0].values.number = '1' }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources[1].values.unique_id = '1'.repeat(21) }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources[1].values.disabled = true }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.prior_state.values.root_module.resources[1].values.email = 'wrong@example.com' }, /DATA_READBACK_INVALID/u)
  rejectShape(plan => { plan.resource_changes[0].change.after.project = 'jenfu-platform-nonprod' }, /JOB_INVALID/u)
})

test('rejects provider, plan variable, output, and pre-source-freeze preview mismatches', () => {
  rejectShape(plan => { plan.configuration.provider_config.google.version_constraint = '7.44.0' }, /PROVIDER_INVALID/u)
  rejectShape(plan => { plan.configuration.root_module.module_calls = { sibling: {} } }, /PROVIDER_INVALID/u)
  rejectShape(plan => { plan.variables.source_revision.value = 'f'.repeat(40) }, /SOURCE_BINDING_INVALID/u)
  rejectShape(plan => { plan.variables.unbound_input = { value: 'extra' } }, /SOURCE_BINDING_INVALID/u)
  rejectShape(plan => { plan.output_changes.release_binding.after.project_number = '1' }, /OUTPUT_BINDING_INVALID/u)

  const unfrozenPreview = planFixture()
  delete unfrozenPreview.variables
  delete unfrozenPreview.output_changes
  assert.throws(() => evaluateManagedLifecyclePlanShape({
    plan: unfrozenPreview, profile: structuredClone(profile), sourceRevision, foundationManifestSha256,
  }))
})

test('accepts only source and foundation readbacks whose bytes, seals, remote proof and plan bindings agree', () => {
  const fixture = boundFixture()
  const result = evaluateManagedLifecycleBoundPlan(fixture)
  assert.equal(result.status, 'SOURCE_BOUND_PLAN_VERIFIED_NOT_APPLIED')
  assert.equal(result.sourceLockRef.sha256, fixture.sourceReadback.ref.sha256)
  assert.equal(result.foundationReceiptRef.sha256, fixture.foundationReadback.ref.sha256)
  assert.deepEqual(result.configuredAddresses, configAddresses)
  assert.equal(result.releaseAuthority, false)

  rejectBound(h => { h.sourceReadback.bytes = Buffer.concat([h.sourceReadback.bytes, Buffer.from('x')]) }, /ARTIFACT_READBACK_INVALID/u)
  rejectBound(h => { h.sourceReadback.value.sourceRevision = 'f'.repeat(40) }, /ARTIFACT_READBACK_INVALID/u)
  rejectBound(h => { h.sourceReadback.metadata.generation = '0' }, /ARTIFACT_READBACK_INVALID/u)
  rejectBound(h => {
    const source = { ...h.sourceReadback.value, remoteRevision: 'f'.repeat(40) }
    h.sourceReadback = resealReadback(h.sourceReadback, source)
  }, /SOURCE_PROVENANCE_INVALID/u)
  rejectBound(h => {
    const source = { ...h.sourceReadback.value, remoteRef: 'refs/heads/feature' }
    h.sourceReadback = resealReadback(h.sourceReadback, source)
  }, /SOURCE_PROVENANCE_INVALID/u)
  rejectBound(h => { h.sourceProof.sourceRevision = 'f'.repeat(40) }, /SOURCE_PROVENANCE_INVALID/u)
  rejectBound(h => { h.sourceProof.branchProtected = false }, /SOURCE_PROVENANCE_INVALID/u)
  rejectBound(h => { h.sourceProof.requiredChecks = [] }, /SOURCE_PROVENANCE_INVALID/u)
  rejectBound(h => { h.sourceReadback.ref.uri = 'gs://another-project/receipts/source-lock.json' }, /SOURCE_PROVENANCE_INVALID/u)
  rejectBound(h => { h.foundationReadback.bytes = Buffer.concat([h.foundationReadback.bytes, Buffer.from('x')]) }, /ARTIFACT_READBACK_INVALID/u)
  rejectBound(h => {
    const foundation = { ...h.foundationReadback.value, receiptSha256: '0'.repeat(64) }
    h.foundationReadback = resealReadback(h.foundationReadback, foundation)
  }, /FOUNDATION_PROVENANCE_INVALID/u)
  rejectBound(h => {
    const foundation = { ...h.foundationReadback.value, projectId: 'jenfu-platform-nonprod' }
    h.foundationReadback = resealReadback(h.foundationReadback, foundation)
  }, /FOUNDATION_PROVENANCE_INVALID/u)
  rejectBound(h => { h.plan.variables.source_revision.value = 'f'.repeat(40) }, /SOURCE_BINDING_INVALID/u)
  rejectBound(h => { h.plan.variables.foundation_manifest_sha256.value = 'f'.repeat(64) }, /SOURCE_BINDING_INVALID/u)
  rejectBound(h => { h.plan.output_changes.release_binding.after.region = 'us-central1' }, /OUTPUT_BINDING_INVALID/u)
})

test('enabled no-op joins current-source immutable transition, live exact job, and both current owner chains',()=>{
  const h=boundFixture(),change=h.plan.resource_changes[0].change
  change.actions=['no-op'];change.after.paused=false;change.after.state='ENABLED'
  change.before=structuredClone(change.after)
  h.plan.planned_values.root_module.resources[0].values=structuredClone(change.after)
  const scheduler={name:LIFECYCLE_SCHEDULER_NAME,state:'ENABLED',description:'DEV-014 managed identity lifecycle worker trigger',
    schedule:'* * * * *',timeZone:'Asia/Taipei',attemptDeadline:'60s',
    httpTarget:{httpMethod:'POST',uri:canonicalOrigin+'/api/internal/managed-identity-lifecycle/v2',
      oidcToken:{serviceAccountEmail:runtimeServiceAccount,audience:canonicalOrigin}}}
  h.schedulerReadback=scheduler
  h.ownerReadbacks=['orgmaster','platform'].map(owner=>({owner,
    current:{record:{ref:{uri:`gs://jenfu-platform-prod-${owner}-release/receipts/releases/REL-000001/release-intent.json`,sha256:'e'.repeat(64)}}},
    nativeMigrationRef:{uri:`gs://jenfu-platform-prod-${owner}-release/receipts/releases/REL-000001/migrate.json`,sha256:'f'.repeat(64)}}))
  const core={schemaVersion:'orgmaster.managed-lifecycle-scheduler-transition.v1',projectId:'jenfu-platform-prod',region:'asia-east1',ownerApplicationId:'orgmaster',
    sourceRevision,sourceProof:h.sourceProof,job:LIFECYCLE_SCHEDULER_NAME,status:'ENABLED_PROVIDER_READ_BACK',action:'resume',
    after:lifecycleSchedulerSnapshot(scheduler),ownerIntentRefs:h.ownerReadbacks.map(row=>row.current.record.ref),nativeMigrationRefs:h.ownerReadbacks.map(row=>row.nativeMigrationRef)}
  const receipt={...core,receiptSha256:sha256(canonicalize(core))}
  h.transitionReadback=readback(`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV014-LIFECYCLE-SCHEDULER/${sourceRevision}/${sha256(canonicalize(receipt))}.json`,receipt)
  assert.equal(evaluateManagedLifecycleBoundPlan(h).jobPaused,false)
  for (const kind of ['missing','state','owner','source','seal']) {
    const x={...h,schedulerReadback:structuredClone(h.schedulerReadback),ownerReadbacks:structuredClone(h.ownerReadbacks),
      transitionReadback:readback(h.transitionReadback.ref.uri,h.transitionReadback.value)}
    if(kind==='missing')delete x.transitionReadback
    if(kind==='state')x.schedulerReadback.state='PAUSED'
    if(kind==='owner')x.ownerReadbacks[1].nativeMigrationRef.sha256='0'.repeat(64)
    if(kind==='source')x.sourceProof={...h.sourceProof,sourceRevision:'9'.repeat(40)}
    if(kind==='seal') {const receipt={...h.transitionReadback.value,receiptSha256:'0'.repeat(64)};x.transitionReadback=readback(h.transitionReadback.ref.uri,receipt)}
    assert.throws(()=>evaluateManagedLifecycleBoundPlan(x))
  }
})

test('initial create cannot enable; paused no-op still requires actual provider state; Terraform leaves only pause state to operator',()=>{
  const h=boundFixture(),change=h.plan.resource_changes[0].change
  change.actions=['no-op'];change.after.state='PAUSED';change.before=structuredClone(change.after)
  h.plan.planned_values.root_module.resources[0].values=structuredClone(change.after)
  assert.throws(()=>evaluateManagedLifecycleBoundPlan(h),/SCHEDULER_READBACK_INVALID/)
  const terraform=readFileSync(new URL('../../infra/google-cloud/dev014-managed-lifecycle/main.tf',import.meta.url),'utf8')
  assert.match(terraform,/paused\s*=\s*true/u)
  assert.match(terraform,/ignore_changes\s*=\s*\[paused\]/u)
  assert.match(terraform,/prevent_destroy\s*=\s*true/u)
})
