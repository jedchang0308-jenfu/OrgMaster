import { assertImmutableRef, canonicalize, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertMigrationBundle } from './dev012-production-migration-runner.mjs'
import { DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION, DEV014_PLATFORM_LIFECYCLE_V2_CONSUMER } from './dev014-principal-lifecycle-release.mjs'
import { LIFECYCLE_SCHEDULER_NAME, assertLifecycleSchedulerReadback, lifecycleSchedulerSnapshot } from './dev014-lifecycle-scheduler-contract.mjs'
export { LIFECYCLE_SCHEDULER_NAME, assertLifecycleSchedulerReadback, lifecycleSchedulerSnapshot } from './dev014-lifecycle-scheduler-contract.mjs'

const PROJECT = 'jenfu-platform-prod'
const REGION = 'asia-east1'
const FIELD = 'ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED'
const H40 = /^[a-f0-9]{40}$/u
const OWNERS = Object.freeze({
  orgmaster: { bucket: 'jenfu-platform-prod-orgmaster-release', service: 'orgmaster-prod',
    image: 'orgmaster-release/orgmaster', container: 'orgmaster', baseline: 10, count: 31,
    intentSchema: 'jenfu.dev040.orgmaster-release-intent.v2',
    deploymentSchema: 'jenfu.dev040.orgmaster-deployment-capsule.v2',
    migration: DEV014_PRINCIPAL_LIFECYCLE_V2_REMEDIATION },
  platform: { bucket: 'jenfu-platform-prod-platform-release', service: 'jenfu-platform-prod',
    image: 'platform-release/platform', container: 'platform', baseline: 5, count: 11,
    intentSchema: 'jenfu.dev011.platform-release-intent.v2',
    deploymentSchema: 'jenfu.dev011.platform-deployment-capsule.v2',
    migration: DEV014_PLATFORM_LIFECYCLE_V2_CONSUMER },
})
const same = (a, b) => canonicalize(a) === canonicalize(b)
function fail(code) { throw new Error(`DEV014_LIFECYCLE_ACTIVATION_${code}`) }
function sealed(value, field) {
  const { [field]: hash, ...core } = value ?? {}
  if (hash !== sha256(canonicalize(core))) fail('RECEIPT_SEAL_INVALID')
}
function stage(value, owner, intent, name) {
  sealed(value, 'receiptSha256')
  if (value.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== owner
    || value.sourceRevision !== intent.sourceRevision || value.releaseId !== intent.releaseId
    || value.stage !== name || value.status !== 'PASS') fail('OWNER_STAGE_JOIN_INVALID')
}
function readback(record) {
  if (!Buffer.isBuffer(record?.bytes) || sha256(record.bytes) !== record.ref?.sha256
    || !/^[1-9][0-9]*$/u.test(String(record.metadata?.generation ?? ''))
    || !same(JSON.parse(record.bytes.toString('utf8')), record.value)) fail('OBJECT_READBACK_INVALID')
  return record
}
function stableBundle({ sourceRevision, manifestSha256, ...core }) { return core }
function validateNativeReceipt(value, owner, config, intent) {
  sealed(value, 'receiptSha256')
  if (value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || value.ownerApplicationId !== owner
    || value.sourceRevision !== intent.sourceRevision || value.manifestSha256 !== intent.migrationManifestSha256
    || value.database !== 'jenfu_prod' || value.ledger !== `${owner}_core.schema_migrations`
    || value.baselineCount !== config.baseline || value.minimumLedgerCount !== config.baseline
    || value.ledgerCount !== config.count || ![0, 1].includes(value.applied)
    || value.replayed !== config.count - value.applied || value.status !== 'PASS' || value.boundaryStatus !== 'PASS'
    || !Array.isArray(value.crossDatabaseDenials) || value.crossDatabaseDenials.length !== 2
    || !same(value.crossDatabaseDenials.map(row => row.database).sort(), ['jenfu_dev','jenfu_stg'])
    || value.crossDatabaseDenials.some(row => row.denied !== true)
    || (owner === 'platform' && !same(value.ledgerBootstrap, { enabled: false, created: false }))) fail('NATIVE_MIGRATION_REQUIRED')
}

/** This reader is for the already-authorized operator, which can read both
 * owners. The OrgMaster CI identity gains no sibling IAM or database privilege.
 * A receipt chain ending in UNCHANGED is insufficient: join to the actual,
 * checksum-identical native ledger receipt through published predecessors. */
export async function readPublishedLifecycleOwner({ owner, transport, lifecycleEnabled = false }) {
  const config = OWNERS[owner]
  if (!config || typeof lifecycleEnabled !== 'boolean') fail('OWNER_INVALID')
  const profile = { application: { id: owner }, artifact: { releaseBucket: config.bucket },
    target: { projectId: PROJECT, region: REGION, serviceName: config.service } }
  const records = []
  const get = async (ref, prefixes = ['receipts']) => {
    assertImmutableRef(ref, config.bucket, prefixes)
    const result = readback(await transport.readJson(ref, config.bucket, prefixes))
    records.push(result); return result
  }
  const named = async (uri, prefixes = ['receipts']) => {
    const raw = await transport.readBytes(uri, { prefixes })
    return get(raw.ref, prefixes)
  }
  const controlUri = `gs://${config.bucket}/control/active.json`
  const control = await named(controlUri, ['control'])
  const head = control.value
  sealed(head, 'controlSha256')
  if (head.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || head.ownerApplicationId !== owner
    || head.service !== config.service || head.controlBucket !== config.bucket
    || head.state !== 'FINALIZED' || head.result !== 'RELEASED'
    || !H40.test(head.sourceRevision ?? '')) fail('OWNER_NOT_RELEASED')
  const published = async (intentRef) => {
    const record = await get(intentRef)
    const intent = record.value
    if (intent.schemaVersion !== config.intentSchema || intent.ownerApplicationId !== owner
      || !H40.test(intent.sourceRevision ?? '')) fail('OWNER_INTENT_INVALID')
    const paths = releasePaths(profile, intent, record.ref.sha256)
    const [terminal, deployment, candidate, migration] = await Promise.all([
      named(paths.terminal), named(paths.deployment), named(paths.candidate), named(paths.migrate),
    ])
    stage(terminal.value, owner, intent, 'terminal'); stage(candidate.value, owner, intent, 'candidate')
    if (terminal.value.facts.result !== 'RELEASED' || terminal.value.facts.remainingHumanAction !== 0
      || !same(deployment.value.releaseIntentRef, record.ref) || deployment.value.sourceRevision !== intent.sourceRevision
      || deployment.value.schemaVersion !== config.deploymentSchema
      || !same(candidate.value.facts.deploymentCapsuleRef, deployment.ref)
      || !same(candidate.value.facts.migrationReceiptRef, migration.ref)
      || terminal.value.facts.candidateRevision !== candidate.value.facts.candidateRevision
      || terminal.value.facts.artifactDigest !== deployment.value.artifactDigest
      || candidate.value.facts.artifactDigest !== deployment.value.artifactDigest
      || !new RegExp(`^${REGION}-docker\\.pkg\\.dev/${PROJECT}/${config.image}@sha256:[a-f0-9]{64}$`, 'u').test(deployment.value.artifactDigest)) fail('PUBLISHED_OWNER_JOIN_INVALID')
    const bundle = await get(deployment.value.migrationBundleRef, ['source/migration-bundles'])
    assertMigrationBundle(bundle.value, { target: { ownerApplicationId: owner,
      ledger: `${owner}_core.schema_migrations`, baselineCount: config.baseline },
      sourceRevision: intent.sourceRevision, bytes: bundle.bytes, bundleSha256: bundle.ref.sha256 })
    const last = bundle.value.entries.at(-1)
    if (bundle.value.manifestSha256 !== intent.migrationManifestSha256 || bundle.value.entries.length !== config.count
      || !same([last.version,last.path,last.sourceSha256,last.appliedSha256],
        [config.migration.migrationVersion,config.migration.migrationPath,config.migration.sourceSha256,config.migration.appliedSha256])) fail('LIFECYCLE_BUNDLE_REQUIRED')
    if (owner === 'platform') {
      const conformance = await get(terminal.value.facts.dev014PrincipalLifecycleConformanceRef)
      const proof = conformance.value
      sealed(proof,'receiptSha256')
      const canonical = await get(proof.canonicalReceiptRef)
      stage(canonical.value,owner,intent,'canonical')
      const probe = canonical.value.facts.smoke?.observations?.find(row => row.id === 'dev014-principal-lifecycle-v2-unauthenticated')
      if (proof.schemaVersion !== 'platform.principal-lifecycle-consumer-conformance.v1'
        || proof.appId !== owner || proof.sourceRevision !== intent.sourceRevision || proof.releaseId !== intent.releaseId
        || proof.artifactDigest !== deployment.value.artifactDigest || canonical.value.facts.artifactDigest !== proof.artifactDigest
        || proof.producerContract !== 'orgmaster.principal-lifecycle.v2' || proof.receiptContract !== 'platform.principal-lifecycle-receipt.v2'
        || proof.endpoint !== '/api/internal/principal-lifecycle/v2' || proof.method !== 'POST'
        || proof.status !== 'PASS' || proof.verificationScope !== 'PRODUCTION_ROUTE_PRESENCE_AND_CALLER_DENIAL'
        || !same(proof.migrationReceiptRef,migration.ref) || !same(proof.entryDenial,probe)
        || probe?.status !== 401 || probe.code !== 'lifecycle_caller_invalid') fail('CONSUMER_CONFORMANCE_REQUIRED')
    }
    return { record, intent, terminal, deployment, candidate, migration, bundle }
  }
  const firstRaw = await transport.readBytes(`gs://${config.bucket}/receipts/releases/${head.releaseId}/release-intent.json`, { prefixes: ['receipts'] })
  const current = await published(firstRaw.ref)
  if (head.sourceRevision !== current.intent.sourceRevision || head.candidateRevision !== current.candidate.value.facts.candidateRevision
    || head.sourceLockSha256 !== current.intent.sourceLockRef.sha256) fail('CONTROL_JOIN_INVALID')
  const seen = new Set()
  let cursor = current
  for (let depth = 0; ; depth++) {
    if (depth >= 16 || seen.has(cursor.record.ref.uri)) fail('MIGRATION_CHAIN_INVALID')
    seen.add(cursor.record.ref.uri)
    if (!same(stableBundle(current.bundle.value), stableBundle(cursor.bundle.value))) fail('MIGRATION_CHAIN_CHANGED')
    if (cursor.migration.value.schemaVersion === 'jenfu.dev012.migration-receipt.v1') {
      validateNativeReceipt(cursor.migration.value, owner, config, cursor.intent); break
    }
    stage(cursor.migration.value, owner, cursor.intent, 'migrate')
    const facts = cursor.migration.value.facts
    if (facts.disposition !== 'UNCHANGED_VERIFIED' || facts.manifestSha256 !== cursor.intent.migrationManifestSha256
      || facts.migrationsExecuted !== 0 || !same(facts.baselineIntentRef, cursor.intent.baselineIntentRef)
      || !facts.baselineMigrationRef) fail('MIGRATION_CHAIN_INVALID')
    const previous = await published(cursor.intent.baselineIntentRef)
    if (!same(facts.baselineMigrationRef, previous.migration.ref)) fail('MIGRATION_CHAIN_INVALID')
    cursor = previous
  }
  const runtime = await get(current.intent.runtimeConfigRef)
  const settings = runtime.value.runtimeConfig ?? runtime.value
  if (owner === 'orgmaster' && settings.plainEnvironment?.[FIELD] !== String(lifecycleEnabled)) fail('RUNTIME_SWITCH_INVALID')
  const service = await transport.getService(profile)
  const traffic = rows => Array.isArray(rows) && rows.length === 1 && rows[0].revision === head.candidateRevision
    && Number(rows[0].percent) === 100 && rows[0].tag == null && rows[0].latestRevision !== true
  if (service.name !== `projects/${PROJECT}/locations/${REGION}/services/${config.service}`
    || !service.uid || !service.etag || service.reconciling === true || service.generation == null
    || String(service.observedGeneration) !== String(service.generation)
    || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    || !traffic(service.traffic) || !traffic(service.trafficStatuses)
    || service.scaling?.scalingMode === 'MANUAL') fail('SERVICE_READBACK_INVALID')
  const revision = await transport.getRevision(profile, head.candidateRevision)
  const container = revision?.containers?.find(row => row.name === config.container)
  const expectedEnv = settings.plainEnvironment ?? {}
  const envRows = container?.env ?? []
  const expectedTemplate = settings.template
  const expectedContainer = expectedTemplate?.containers?.find(row => row.name === config.container)
  const normalizeEnv = rows => (rows ?? []).filter(row => row.name !== (owner === 'platform' ? 'PORTAL_RELEASE_CANDIDATE_ORIGIN' : 'ORGMASTER_RELEASE_CANDIDATE_ORIGIN'))
    .map(row => row.valueSource?.secretKeyRef ? {...row,valueSource:{...row.valueSource,
      secretKeyRef:{...row.valueSource.secretKeyRef,secret:row.valueSource.secretKeyRef.secret.replace(`projects/${PROJECT}/secrets/`,'')}}} : row)
    .sort((a,b)=>a.name.localeCompare(b.name))
  if (revision.name !== `${service.name}/revisions/${head.candidateRevision}`
    || revision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || container?.image !== current.deployment.value.artifactDigest
    || envRows.length !== new Set(envRows.map(row => row.name)).size
    || !expectedTemplate || settings.serviceTemplateSha256 !== sha256(canonicalize(expectedTemplate))
    || settings.runtimeServiceAccount !== `${owner === 'platform' ? 'platform' : 'orgmaster'}-prod-runtime@${PROJECT}.iam.gserviceaccount.com`
    || expectedTemplate.serviceAccount !== settings.runtimeServiceAccount || revision.serviceAccount !== settings.runtimeServiceAccount
    || !expectedContainer || !same(normalizeEnv(envRows),normalizeEnv(expectedContainer.env))
    || Object.entries(expectedEnv).some(([name,value]) => envRows.find(row => row.name === name)?.value !== value)) fail('REVISION_READBACK_INVALID')
  const final = await transport.readBytes(controlUri, { prefixes: ['control'] })
  if (final.ref.sha256 !== control.ref.sha256 || String(final.metadata.generation) !== String(control.metadata.generation)) fail('CONTROL_CHANGED')
  return { owner, current, nativeMigrationRef: cursor.migration.ref, runtime, control, service, revision, records }
}

const errorCode = error => /^DEV014_[A-Z0-9_]+$/u.test(error?.code ?? error?.message ?? '')
  ? (error.code ?? error.message) : 'DEV014_LIFECYCLE_OPERATOR_REQUEST_FAILED'

function assertOfficialOperatorSource(sourceProof) {
  if (sourceProof?.repository !== 'jedchang0308-jenfu/OrgMaster' || sourceProof.branch !== 'master'
    || sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED' || sourceProof.branchProtected !== true
    || !H40.test(sourceProof.sourceRevision ?? '') || !H40.test(sourceProof.sourceTree ?? '') || sourceProof.rulesetId !== 24077876
    || sourceProof.reviewMode !== 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED'
    || !sourceProof.requiredChecks?.includes('Production Source QC')) fail('OFFICIAL_SOURCE_REQUIRED')
}

export async function readLifecycleActivationPrerequisites({sourceProof,transport}) {
  assertOfficialOperatorSource(sourceProof)
  const uri=`https://cloudscheduler.googleapis.com/v1/${LIFECYCLE_SCHEDULER_NAME}`
  const before=lifecycleSchedulerSnapshot(await transport.request(uri))
  if(before.state!=='PAUSED')fail('SCHEDULER_NOT_PAUSED')
  const owners=await Promise.all([
    readPublishedLifecycleOwner({owner:'orgmaster',transport,lifecycleEnabled:false}),
    readPublishedLifecycleOwner({owner:'platform',transport}),
  ])
  const after=lifecycleSchedulerSnapshot(await transport.request(uri))
  if(!same(before,after))fail('SCHEDULER_CHANGED')
  const core={schemaVersion:'orgmaster.principal-lifecycle-activation-prerequisites.v1',
    sourceRevision:sourceProof.sourceRevision,sourceProof,observedAt:transport.now(),
    field:FIELD,from:'false',to:'true',status:'PROVIDER_PREREQUISITES_READ_BACK',scheduler:after,
    owners:owners.map(row=>({owner:row.owner,sourceRevision:row.current.intent.sourceRevision,
      serviceUid:row.service.uid,serviceEtag:row.service.etag,revision:row.current.candidate.value.facts.candidateRevision,
      artifactDigest:row.current.deployment.value.artifactDigest,controlRef:row.control.ref,ownerIntentRef:row.current.record.ref,
      nativeMigrationRef:row.nativeMigrationRef,migrationManifestSha256:row.current.bundle.value.manifestSha256,
      ledgerCount:row.current.bundle.value.entries.length,migrationVersion:OWNERS[row.owner].migration.migrationVersion,
      sourceSha256:OWNERS[row.owner].migration.sourceSha256,appliedSha256:OWNERS[row.owner].migration.appliedSha256}))}
  return {...core,receiptSha256:sha256(canonicalize(core))}
}

/** Only pause/resume the single product job. No create, update, IAM or delete.
 * Resume reads actual published producer/consumer chains and repeats them after
 * the provider mutation. The caller supplies an existing official-source proof;
 * --check performs the same reads without issuing a POST. */
export async function transitionLifecycleScheduler({ action, check = false, sourceProof, transport }) {
  assertOfficialOperatorSource(sourceProof)
  if (!['pause','resume'].includes(action) || typeof check !== 'boolean') fail('OFFICIAL_SOURCE_REQUIRED')
  const uri = `https://cloudscheduler.googleapis.com/v1/${LIFECYCLE_SCHEDULER_NAME}`
  const before = await transport.request(uri)
  const config = assertLifecycleSchedulerReadback(before, ['PAUSED','ENABLED'])
  const desired = action === 'pause' ? 'PAUSED' : 'ENABLED'
  const readOwners = async () => Promise.all([
    readPublishedLifecycleOwner({ owner: 'orgmaster', transport, lifecycleEnabled: true }),
    readPublishedLifecycleOwner({ owner: 'platform', transport }),
  ])
  const owners = action === 'resume' ? await readOwners() : []
  const immediate = await transport.request(uri)
  if (!same(config, assertLifecycleSchedulerReadback(immediate, ['PAUSED','ENABLED'])) || immediate.state !== before.state) fail('SCHEDULER_CHANGED')
  if (check) return { status: 'CHECKED_NOT_MUTATED', action, sourceRevision: sourceProof.sourceRevision, releaseAuthority: false }
  let after
  const result = { action, sourceRevision: sourceProof.sourceRevision,
    job: LIFECYCLE_SCHEDULER_NAME, changed: before.state !== desired,
    before: lifecycleSchedulerSnapshot(before),
    ownerIntentRefs: owners.map(row => row.current.record.ref),
    nativeMigrationRefs: owners.map(row => row.nativeMigrationRef) }
  try {
    if (before.state !== desired) await transport.request(`${uri}:${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    after = await transport.request(uri)
    if (!same(config, assertLifecycleSchedulerReadback(after, [desired]))) fail('SCHEDULER_CHANGED')
    if (action === 'resume') {
      const rechecked = await readOwners()
      if (owners.some((row,index) => row.control.ref.sha256 !== rechecked[index].control.ref.sha256
        || row.service.uid !== rechecked[index].service.uid || row.service.etag !== rechecked[index].service.etag)) fail('OWNER_CHANGED')
    }
  } catch (error) {
    const errors = [errorCode(error)]
    let recovered = false, recoveryReadback
    if (action === 'resume') {
      // A POST timeout may have taken effect. Read back, then contain this exact
      // job even if the GET itself fails. A malformed template is still paused;
      // it must be repaired separately and can never receive a success receipt.
      let current
      try { current = await transport.request(uri) } catch (readError) { errors.push(errorCode(readError)) }
      if (current?.name !== LIFECYCLE_SCHEDULER_NAME || current.state !== 'PAUSED') {
        try { await transport.request(`${uri}:pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) }
        catch (pauseError) { errors.push(errorCode(pauseError)) }
      }
      try {
        const paused = await transport.request(uri)
        recovered = paused?.name === LIFECYCLE_SCHEDULER_NAME && paused.state === 'PAUSED'
        recoveryReadback = { name: paused?.name, state: paused?.state }
        if (recovered) {
          try { recoveryReadback = lifecycleSchedulerSnapshot(paused) }
          catch { recoveryReadback.templateStatus = 'INVALID_REQUIRES_REPAIR' }
        }
      } catch (readError) { errors.push(errorCode(readError)) }
    } else {
      // Do not undo a requested pause. Unknown pause outcome needs readback.
      try { const paused = await transport.request(uri)
        recovered = paused?.name === LIFECYCLE_SCHEDULER_NAME && paused.state === 'PAUSED'
        if (recovered) recoveryReadback = lifecycleSchedulerSnapshot(paused)
      } catch (readError) { errors.push(errorCode(readError)) }
    }
    throw Object.assign(new Error('DEV014_LIFECYCLE_ACTIVATION_TRANSITION_FAILED'), {
      code: 'DEV014_LIFECYCLE_ACTIVATION_TRANSITION_FAILED',
      transitionResult: { ...result, status: recovered ? 'RECOVERED_PAUSED' : 'MANUAL_READBACK_REQUIRED',
        errorCodes: [...new Set(errors)], ...(recoveryReadback ? { recoveryReadback } : {}) },
    })
  }
  return { ...result, status: `${desired}_PROVIDER_READ_BACK`, after: lifecycleSchedulerSnapshot(after) }
}
