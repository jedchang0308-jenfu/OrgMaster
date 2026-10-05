import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { assertLifecycleSchedulerReadback, lifecycleSchedulerSnapshot, LIFECYCLE_SCHEDULER_NAME } from './dev014-lifecycle-activation-prerequisites.mjs'

const JOB = 'google_cloud_scheduler_job.managed_identity_lifecycle'
const DATA = ['data.google_project.current', 'data.google_service_account.runtime']
const ALL = [...DATA, JOB].sort()
function fail(code) { throw new Error(`DEV014_LIFECYCLE_PLAN_${code}`) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
function unique(rows, code) {
  if (!Array.isArray(rows)) fail(code)
  const map = new Map(rows.map(row => [row.address, row]))
  if (map.size !== rows.length || [...map.keys()].some(key => typeof key !== 'string')) fail(code)
  return map
}
function noTrue(value) {
  return value !== true && (!(value && typeof value === 'object') || Object.values(value).every(noTrue))
}

export function evaluateManagedLifecyclePlanShape({ plan, profile, sourceRevision, foundationManifestSha256 }) {
  if (!/^[a-f0-9]{40}$/u.test(sourceRevision ?? '') || !/^[a-f0-9]{64}$/u.test(foundationManifestSha256 ?? '')) fail('BINDING_INVALID')
  if (profile?.profileId !== 'DEV014_MANAGED_LIFECYCLE_PRODUCTION'
    || profile.schemaVersion !== 'jenfu.dev014.managed-lifecycle-production-plan-profile.v1'
    || profile.terraformRoot !== 'infra/google-cloud/dev014-managed-lifecycle'
    || profile.state?.bucket !== 'tfstate-jenfu-platform-prod'
    || profile.state?.prefix !== 'dev-014/managed-lifecycle/production'
    || profile.target?.projectId !== 'jenfu-platform-prod' || profile.target.projectNumber !== '9536592944'
    || profile.target.region !== 'asia-east1'
    || profile.target.runtimeServiceAccount !== 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'
    || profile.target.runtimeServiceAccountUniqueId !== '109928765105400231333'
    || !same(Object.keys(profile.requiredConfigurationAddresses).sort(), ALL)
    || !same(Object.keys(profile.requiredChangeAddresses), [JOB])
    || !same(profile.requiredChangeAddresses[JOB], ['create', 'no-op'])
    || !same(profile.resolvedDataAddresses, DATA)
    || profile.resumeAuthority !== 'protected-source-exact-job-operator'
    || !same(profile.operationalStateOwner, { terraformCreatePaused: true, terraformIgnoreChanges: ['paused'],
      operator: 'scripts/dev014-lifecycle-scheduler.mjs', actions: ['pause','resume'],
      existingJobPlanRequiresLiveReadback: true, enabledNoOpRequiresCurrentSourceTransitionReceipt: true })) fail('PROFILE_INVALID')
  if (plan?.errored === true || plan?.complete !== true || plan?.applyable !== true
    || plan.variables?.source_revision?.value !== sourceRevision
    || plan.variables?.foundation_manifest_sha256?.value !== foundationManifestSha256
    || !same(Object.keys(plan.variables).sort(), ['foundation_manifest_sha256','source_revision'])) fail('SOURCE_BINDING_INVALID')
  const providers = plan.configuration?.provider_config
  if (!same(Object.keys(providers ?? {}), ['google'])
    || providers.google.full_name !== 'registry.terraform.io/hashicorp/google'
    || providers.google.version_constraint !== '7.45.0'
    || plan.configuration?.root_module?.module_calls) fail('PROVIDER_INVALID')
  const configuration = unique(plan.configuration.root_module.resources, 'CONFIGURATION_INVALID')
  if (!same([...configuration.keys()].sort(), ALL)) fail('CONFIGURATION_SET_INVALID')
  for (const [address, row] of configuration) {
    const expected = profile.requiredConfigurationAddresses[address]
    if (row.mode !== expected.mode || row.type !== expected.type || row.provider_config_key !== 'google') fail('CONFIGURATION_INVALID')
  }
  const prior = plan.prior_state?.values?.root_module
  if (prior?.child_modules?.length) fail('DATA_READBACK_INVALID')
  const data = unique(prior?.resources ?? [], 'DATA_READBACK_INVALID')
  if ([...data.keys()].some(address => !ALL.includes(address))) fail('DATA_READBACK_INVALID')
  const project = data.get(DATA[0])
  const runtime = data.get(DATA[1])
  if (project?.mode !== 'data' || project.type !== 'google_project'
    || project.values?.project_id !== profile.target.projectId || String(project.values.number) !== profile.target.projectNumber
    || runtime?.mode !== 'data' || runtime.type !== 'google_service_account'
    || runtime.values?.project !== profile.target.projectId || runtime.values.account_id !== 'orgmaster-prod-runtime'
    || runtime.values.email !== profile.target.runtimeServiceAccount
    || runtime.values.name !== `projects/${profile.target.projectId}/serviceAccounts/${profile.target.runtimeServiceAccount}`
    || runtime.values.unique_id !== profile.target.runtimeServiceAccountUniqueId || runtime.values.disabled !== false) fail('DATA_READBACK_INVALID')
  const changes = unique(plan.resource_changes, 'CHANGE_SET_INVALID')
  if (!same([...changes.keys()], [JOB])) fail('CHANGE_SET_INVALID')
  const row = changes.get(JOB)
  const change = row.change
  if (row.mode !== 'managed' || row.type !== 'google_cloud_scheduler_job'
    || change?.actions?.length !== 1 || !['create','no-op'].includes(change.actions[0])
    || (change.actions[0] === 'create' && change.before !== null)
    || (change.actions[0] === 'no-op' && !same(change.before, change.after))) fail('ACTION_INVALID')
  const after = change.after
  const target = after?.http_target?.[0]
  const oidc = target?.oidc_token?.[0]
  if (after?.project !== profile.target.projectId || after.region !== profile.target.region
    || after.name !== 'orgmaster-prod-managed-identity-lifecycle'
    || typeof after.paused !== 'boolean' || (change.actions[0] === 'create' && after.paused !== true)
    || (change.actions[0] === 'no-op' && after.state !== (after.paused ? 'PAUSED' : 'ENABLED'))
    || after.schedule !== '* * * * *' || after.time_zone !== 'Asia/Taipei' || after.attempt_deadline !== '60s'
    || after.description !== 'DEV-014 managed identity lifecycle worker trigger' || after.deletion_policy !== 'DELETE'
    || after.http_target?.length !== 1 || target.http_method !== 'POST'
    || target.uri !== 'https://orgmaster-prod-9536592944.asia-east1.run.app/api/internal/managed-identity-lifecycle/v2'
    || !(target.body == null || target.body === '') || Object.keys(target.headers ?? {}).length
    || target.oidc_token?.length !== 1 || target.oauth_token?.length
    || oidc.service_account_email !== profile.target.runtimeServiceAccount
    || oidc.audience !== 'https://orgmaster-prod-9536592944.asia-east1.run.app'
    || after.pubsub_target?.length || after.app_engine_http_target?.length || after.retry_config?.length
    || (after.timeouts != null && Object.keys(after.timeouts).length)) fail('JOB_INVALID')
  const { id, state, ...unknown } = change.after_unknown ?? {}
  if (!noTrue(unknown) || !noTrue(change.after_sensitive)) fail('UNKNOWN_OR_SENSITIVE_INPUT')
  const planned = plan.planned_values?.root_module
  if (planned?.child_modules?.length) fail('PLANNED_SET_INVALID')
  const plannedRows = unique(planned?.resources ?? [], 'PLANNED_SET_INVALID')
  if (!same([...plannedRows.keys()], [JOB]) || !same(plannedRows.get(JOB).values, after)) fail('PLANNED_SET_INVALID')
  if (!same(plan.output_changes?.release_binding?.after, {
    source_revision: sourceRevision, foundation_manifest_sha256: foundationManifestSha256,
    project_id: profile.target.projectId, project_number: profile.target.projectNumber, region: profile.target.region,
  })) fail('OUTPUT_BINDING_INVALID')
  return { status: 'PLAN_SHAPE_VERIFIED', sourceRevision, foundationManifestSha256,
    configuredAddresses: ALL, changeAddresses: [JOB], resolvedDataAddresses: DATA,
    action: change.actions[0], jobPaused: after.paused,
    initialPaused: true, releaseAuthority: false }
}

// SHA strings by themselves are test inputs. A production caller must provide
// both immutable readback objects and the existing official-source proof.
export function evaluateManagedLifecycleBoundPlan({ plan, profile, sourceReadback, foundationReadback, sourceProof,
  schedulerReadback, transitionReadback, ownerReadbacks }) {
  const source = sourceReadback?.value
  const foundation = foundationReadback?.value
  for (const record of [sourceReadback, foundationReadback]) {
    if (!Buffer.isBuffer(record?.bytes) || sha256(record.bytes) !== record.ref?.sha256
      || !/^[1-9][0-9]*$/u.test(String(record.metadata?.generation ?? ''))
      || !same(JSON.parse(record.bytes.toString('utf8')), record.value)) fail('ARTIFACT_READBACK_INVALID')
  }
  if (!sourceReadback.ref.uri.startsWith('gs://jenfu-platform-prod-orgmaster-release/receipts/')
    || source?.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' || source.ownerApplicationId !== 'orgmaster'
    || source.repository !== 'jedchang0308-jenfu/OrgMaster' || source.branch !== 'master'
    || source.clean !== true || source.status !== 'SOURCE_FROZEN' || source.releaseAuthority !== true
    || source.evidenceScope !== 'PRODUCTION_BOUND' || source.remoteRevision !== source.sourceRevision
    || source.remoteRef !== 'refs/heads/master' || !/^[a-f0-9]{64}$/u.test(source.sourceSha256 ?? '')
    || sourceProof?.sourceRevision !== source.sourceRevision || sourceProof.sourceTree !== source.sourceTree
    || sourceProof.repository !== source.repository || sourceProof.branch !== source.branch
    || sourceProof.branchProtected !== true || sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED'
    || sourceProof.rulesetId !== 24077876 || sourceProof.reviewMode !== 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED'
    || !sourceProof.requiredChecks?.includes('Production Source QC')) fail('SOURCE_PROVENANCE_INVALID')
  const { receiptSha256, ...core } = foundation ?? {}
  if (!/^gs:\/\/jenfu-platform-prod-(?:platform|orgmaster|aipdm)-release\/receipts\//u.test(foundationReadback.ref.uri)
    || foundation.schemaVersion !== 'jenfu.dev012.foundation-receipt.v1' || foundation.projectId !== profile.target.projectId
    || foundation.region !== profile.target.region || foundation.status !== 'APPLIED'
    || foundation.releaseAuthority !== true || foundation.evidenceScope !== 'PRODUCTION_PROVIDER'
    || receiptSha256 !== sha256(canonicalize(core))
    || foundation.foundationManifestSha256 !== sha256(canonicalize(foundation.foundationManifest))) fail('FOUNDATION_PROVENANCE_INVALID')
  const shape = evaluateManagedLifecyclePlanShape({ plan, profile, sourceRevision: source.sourceRevision,
    foundationManifestSha256: foundation.foundationManifestSha256 })
  if (shape.action === 'no-op') {
    const expectedState = shape.jobPaused ? 'PAUSED' : 'ENABLED'
    assertLifecycleSchedulerReadback(schedulerReadback, [expectedState])
    if (!shape.jobPaused) {
      const record = transitionReadback
      if (!Buffer.isBuffer(record?.bytes) || sha256(record.bytes) !== record.ref?.sha256
        || !/^[1-9][0-9]*$/u.test(String(record.metadata?.generation ?? ''))
        || !same(JSON.parse(record.bytes.toString('utf8')), record.value)) fail('TRANSITION_READBACK_INVALID')
      const receipt = record.value
      const { receiptSha256: hash, ...transition } = receipt
      if (record.ref.uri !== `gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV014-LIFECYCLE-SCHEDULER/${source.sourceRevision}/${sha256(canonicalize(receipt))}.json`
        || hash !== sha256(canonicalize(transition))
        || receipt.schemaVersion !== 'orgmaster.managed-lifecycle-scheduler-transition.v1'
        || receipt.projectId !== profile.target.projectId || receipt.region !== profile.target.region
        || receipt.ownerApplicationId !== 'orgmaster' || receipt.job !== LIFECYCLE_SCHEDULER_NAME
        || receipt.status !== 'ENABLED_PROVIDER_READ_BACK' || receipt.action !== 'resume'
        || receipt.sourceRevision !== source.sourceRevision || !same(receipt.sourceProof, sourceProof)
        || !same(receipt.after, lifecycleSchedulerSnapshot(schedulerReadback))
        || !Array.isArray(ownerReadbacks) || ownerReadbacks.length !== 2
        || !same(ownerReadbacks.map(row => row.owner), ['orgmaster','platform'])
        || !same(receipt.ownerIntentRefs, ownerReadbacks.map(row => row.current.record.ref))
        || !same(receipt.nativeMigrationRefs, ownerReadbacks.map(row => row.nativeMigrationRef))) fail('TRANSITION_PROVENANCE_INVALID')
    }
  }
  return { ...shape,
    status: 'SOURCE_BOUND_PLAN_VERIFIED_NOT_APPLIED', sourceLockRef: sourceReadback.ref, foundationReceiptRef: foundationReadback.ref }
}
