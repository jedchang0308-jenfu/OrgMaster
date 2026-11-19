#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { assertImmutableRef, canonicalize, createOwnerTransport, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { readRoutineBaseline } from './lib/dev040-routine-release.mjs'
import {assertReviewedOrgmasterMigrationEntries} from './lib/dev057-projed-principal-migration.mjs'
import { assertLifecycleSchedulerReadback, lifecycleSchedulerSnapshot, LIFECYCLE_SCHEDULER_NAME } from './lib/dev014-lifecycle-scheduler-contract.mjs'
import { assertAcceptance, controlIdentity, fmsPublicationControl, pdmPublicationControl,
  fail, pathsForControl, same, validControlRevision } from './lib/dev057-pdm-publication-control.mjs'

const projectId = 'jenfu-platform-prod'
const region = 'asia-east1'
const origin = service => `https://${service}-9536592944.${region}.run.app`
const schedulerUri = `https://cloudscheduler.googleapis.com/v1/${LIFECYCLE_SCHEDULER_NAME}`

export function parseArgs(argv) {
  const fms = argv[0] === '--fms'
  if (fms) argv = argv.slice(1)
  const [action, revision, acceptance, check] = argv
  const revisionFlag = '--expected-revision='
  const expectedRevision = revision?.slice(revisionFlag.length)
  const ref = /^--acceptance-ref=(gs:\/\/[^#]+)#sha256=([a-f0-9]{64})$/u.exec(acceptance ?? '')
  if (argv.length > 4 || !['enable', 'disable'].includes(action) || !revision?.startsWith(revisionFlag) ||
      !validControlRevision(expectedRevision) || !ref || (check !== undefined && check !== '--check')) fail('ARGUMENT_INVALID')
  return { action, expectedRevision, acceptanceRef: { uri: ref[1], sha256: ref[2] }, check: check === '--check',
    ...(fms ? { control: fmsPublicationControl } : {}) }
}

function revisionFlag(container, name) {
  const rows = (container.env ?? []).filter(row => row.name === name)
  if (rows.length > 1 || rows[0]?.valueSource) fail('OWNER_FEATURE_FLAG_INVALID')
  return rows[0]?.value
}

export async function publishedOwner({ transport, owner, expected, action, control = pdmPublicationControl }) {
  const config = control.owners[owner]
  if (owner === 'jf-fms') return publishedFms({ transport, config, expected })
  const profile = { target: { projectId, region, serviceName: config.service, canonicalOrigin: origin(config.service) } }
  const controlUri = `gs://${config.bucket}/control/active.json`
  const current = await transport.readBytes(controlUri, { prefixes: ['control'] })
  const { controlSha256, ...head } = JSON.parse(current.bytes)
  if (controlSha256 !== sha256(canonicalize(head)) || head.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' ||
      head.ownerApplicationId !== owner || head.controlBucket !== config.bucket || head.service !== config.service ||
      head.result !== 'RELEASED' || head.state !== 'FINALIZED' || head.sourceRevision !== expected.sourceRevision ||
      !/^[A-Z0-9][A-Z0-9-]{5,127}$/u.test(head.releaseId ?? '')) fail('OWNER_NOT_RELEASED')
  const base = `gs://${config.bucket}/receipts/releases/${head.releaseId}`
  const intent = await transport.readBytes(`${base}/release-intent.json`, { prefixes: ['receipts'] })
  const release = JSON.parse(intent.bytes)
  const terminal = await transport.readBytes(`${base}/${intent.ref.sha256}/terminal.json`, { prefixes: ['receipts'] })
  const { receiptSha256, ...proof } = JSON.parse(terminal.bytes)
  if (release.ownerApplicationId !== owner || release.releaseId !== head.releaseId || release.sourceRevision !== head.sourceRevision ||
      release.sourceLockRef?.sha256 !== head.sourceLockSha256 || receiptSha256 !== sha256(canonicalize(proof)) ||
      proof.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || proof.status !== 'PASS' || proof.stage !== 'terminal' ||
      proof.ownerApplicationId !== owner || proof.releaseId !== head.releaseId || proof.sourceRevision !== head.sourceRevision ||
      proof.facts?.result !== 'RELEASED' || proof.facts.remainingHumanAction !== 0 ||
      proof.facts.candidateRevision !== head.candidateRevision || proof.facts.artifactDigest !== expected.artifactDigest) fail('OWNER_RELEASE_EVIDENCE_INVALID')
  const service = transport.assertServiceSettled(await transport.getService(profile))
  const revisionName = transport.effectiveRevision(service)
  if (service.name !== `projects/${projectId}/locations/${region}/services/${config.service}` || !service.uid || !service.etag ||
      !service.urls?.includes(profile.target.canonicalOrigin) || service.defaultUriDisabled === true ||
      service.traffic.length !== 1 || service.trafficStatuses.length !== 1 || service.trafficStatuses[0].tag ||
      revisionName !== head.candidateRevision) fail('OWNER_TRAFFIC_INVALID')
  if (!new RegExp(`^${config.service}-[a-z0-9-]+$`, 'u').test(revisionName)) fail('OWNER_TRAFFIC_INVALID')
  const revision = await transport.getRevision(profile, revisionName)
  const container = revision.containers?.find(row => row.name === config.container)
  if (container?.image !== expected.artifactDigest || revision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED') fail('OWNER_ARTIFACT_INVALID')
  const flag = name => revisionFlag(container, name)
  if (owner === 'orgmaster' && flag('ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED') !== 'true') fail('LIFECYCLE_DISABLED')
  if (control === fmsPublicationControl && owner === 'orgmaster' && flag('ORGMASTER_FMS_SESSION_REVOCATION_ENABLED') !== 'true')
    fail('ORGMASTER_FMS_DELIVERY_NOT_READY')
  if (control === fmsPublicationControl && owner === 'platform' && flag('PORTAL_FMS_REVOCATION_RELAY_ENABLED') !== 'true')
    fail('PLATFORM_FMS_RELAY_NOT_READY')
  if (control === pdmPublicationControl && owner === 'platform' && action === 'enable' &&
      (flag('PORTAL_PDM_REVOCATION_RELAY_ENABLED') !== 'true' || flag('PORTAL_PDM_GLOBAL_LOGOUT_ENABLED') !== 'true')) fail('PLATFORM_PRODUCER_NOT_READY')
  if (control === pdmPublicationControl && owner === 'platform' && action === 'disable' && flag('PORTAL_PDM_REVOCATION_RELAY_ENABLED') !== 'true') fail('PLATFORM_RELAY_REQUIRED_FOR_DRAIN')
  if (owner === 'ai-pdm' && (flag('PDM_SESSION_REVOCATION_ENABLED') !== '1' ||
      ![undefined, '0'].includes(flag('PDM_SESSION_PERMISSION_SNAPSHOTS_ENABLED')) ||
      flag('PDM_SESSION_REVOCATION_AUDIENCE') !== profile.target.canonicalOrigin)) fail('PDM_COMPATIBILITY_MODE_REQUIRED')
  const again = await transport.readBytes(controlUri, { prefixes: ['control'] })
  if (!same(again.ref, current.ref) || String(again.metadata.generation) !== String(current.metadata.generation)) fail('OWNER_CONTROL_CHANGED')
  return { releaseIntentRef: intent.ref, terminalRef: terminal.ref, revision: revisionName, createdAt: revision.createTime,
    sourceLockSha256: head.sourceLockSha256, etag: service.etag, controlRef: current.ref }
}

async function publishedFms({ transport, config, expected }) {
  const prefix = 'formal-releases/dev070'
  const base = `gs://${config.bucket}/${prefix}/${expected.releaseId}`
  const profile = { target: { projectId, region, serviceName: config.service, canonicalOrigin: config.origin } }
  const [planObject, terminalObject, raw] = await Promise.all([
    transport.readBytes(`${base}/plan.json`, { prefixes: [prefix] }),
    transport.readBytes(`${base}/terminal.json`, { prefixes: [prefix] }),
    transport.getService(profile),
  ])
  const { planSha256, ...plan } = JSON.parse(planObject.bytes)
  const { receiptSha256, ...terminal } = JSON.parse(terminalObject.bytes)
  const fmsDigest = value => sha256(JSON.stringify(JSON.parse(canonicalize(value)), null, 2) + '\n')
  if (planSha256 !== fmsDigest(plan) || receiptSha256 !== fmsDigest(terminal) ||
      plan.format !== 'fms.dev070.owner-release-plan.v1' || terminal.format !== 'fms.dev070.owner-release-terminal.v1' ||
      terminal.status !== 'ACTIVATED' || terminal.planSha256 !== planSha256 ||
      plan.releaseId !== expected.releaseId || terminal.releaseId !== plan.releaseId ||
      !same(terminal.target, plan.target) || !same(terminal.source, plan.source) ||
      !same(terminal.candidate, plan.candidate) || plan.source.candidateSource !== expected.sourceRevision ||
      plan.candidate.image !== expected.artifactDigest || plan.target.service !== config.service ||
      plan.target.project !== projectId || plan.target.region !== region || plan.target.canonicalUrl !== config.origin)
    fail('OWNER_RELEASE_EVIDENCE_INVALID')
  const service = transport.assertServiceSettled(raw)
  const revisionName = transport.effectiveRevision(service)
  if (service.name !== `projects/${projectId}/locations/${region}/services/${config.service}` ||
      !service.uid || service.uid !== plan.target.serviceUid || !service.etag || !service.urls?.includes(config.origin) ||
      service.defaultUriDisabled === true || service.traffic.length !== 1 || service.trafficStatuses.length !== 1 ||
      service.trafficStatuses[0].tag || revisionName !== plan.candidate.revision) fail('OWNER_TRAFFIC_INVALID')
  const revision = await transport.getRevision(profile, revisionName)
  const app = revision.containers?.find(row => row.name === config.container)
  if (revision.uid !== plan.candidate.uid || app?.image !== expected.artifactDigest ||
      revision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED') fail('OWNER_ARTIFACT_INVALID')
  if (revisionFlag(app, 'FMS_SESSION_REVOCATION_ENABLED') !== '1' ||
      ![undefined, '0'].includes(revisionFlag(app, 'FMS_SESSION_AUTHORIZATION_ENABLED')) ||
      revisionFlag(app, 'FMS_DATABASE_RELEASE_SHA256') !== expected.databaseReleaseSha256) fail('FMS_COMPATIBILITY_MODE_REQUIRED')
  return { revision: revisionName, etag: service.etag, planRef: planObject.ref, terminalRef: terminalObject.ref }
}

export async function schedulerReady(transport, orgmaster) {
  const job = await transport.request(schedulerUri)
  assertLifecycleSchedulerReadback(job, ['ENABLED'])
  const now = Date.parse(transport.now())
  const notBefore = Math.max(now - 180_000, Date.parse(orgmaster.createdAt))
  if (!Number.isFinite(notBefore)) fail('SCHEDULER_REVISION_TIME_INVALID')
  const query = [
    'resource.type="cloud_run_revision"', 'resource.labels.service_name="orgmaster-prod"',
    'resource.labels.location="asia-east1"', `resource.labels.revision_name="${orgmaster.revision}"`,
    'log_id("run.googleapis.com/requests")', 'httpRequest.requestMethod="POST"', 'httpRequest.status=200',
    'httpRequest.userAgent="Google-Cloud-Scheduler"', `httpRequest.requestUrl="${job.httpTarget.uri}"`,
    `timestamp >= "${new Date(notBefore).toISOString()}"`,
  ].join(' AND ')
  // Logging entries:list is a read-only API despite its HTTP verb.
  const logs = await transport.request('https://logging.googleapis.com/v2/entries:list', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resourceNames: [`projects/${projectId}`], filter: query, orderBy: 'timestamp desc', pageSize: 1 }),
  })
  const lastSuccess = logs.entries?.[0]
  if (!lastSuccess?.insertId || !Number.isFinite(Date.parse(lastSuccess.timestamp)) ||
      Date.parse(lastSuccess.timestamp) < notBefore || Date.parse(lastSuccess.timestamp) > now) fail('SCHEDULER_SUCCESS_NOT_OBSERVED')
  return { ...lifecycleSchedulerSnapshot(job), lastSuccess: { insertId: lastSuccess.insertId, timestamp: lastSuccess.timestamp } }
}

export async function executeOwnerOperation({ profile, transport, sourceRevision, acceptanceRef, action, expectedRevision, check = false,
  control = pdmPublicationControl }) {
  if (!validControlRevision(expectedRevision) || !['enable', 'disable'].includes(action)) fail('ARGUMENT_INVALID')
  const { owners, acceptancePrefix, inputPrefix: controlInputPrefix, receiptPrefix: controlReceiptPrefix } = control
  const bucket = owners.orgmaster.bucket
  assertImmutableRef(acceptanceRef, bucket, [acceptancePrefix])
  const acceptance = (await transport.readJson(acceptanceRef, bucket, [acceptancePrefix])).value
  assertAcceptance(acceptance, action, control)
  if (sourceRevision !== acceptance.sources.orgmaster.sourceRevision) fail('SOURCE_MISMATCH')
  const readOwners = async () => Object.fromEntries(await Promise.all(Object.keys(owners).map(async owner =>
    [owner, await publishedOwner({ transport, owner, expected: acceptance.sources[owner], action, control })])))
  const observed = await readOwners()
  // Disable remains usable during a Scheduler incident when the DB can prove
  // that there is no work left to drain.
  const scheduler = action === 'enable' ? await schedulerReady(transport, observed.orgmaster) : null
  const { releaseIntentRef, terminalRef } = observed.orgmaster
  const baseline = await readRoutineBaseline({ profile, transport, baselineIntentRef: releaseIntentRef })
  if (baseline.repair || baseline.intent.sourceRevision !== sourceRevision || baseline.activeRevision !== observed.orgmaster.revision ||
      baseline.intent.sourceLockRef.sha256 !== observed.orgmaster.sourceLockSha256 ||
      baseline.deployment.value.artifactDigest !== acceptance.sources.orgmaster.artifactDigest ||
      !same(baseline.terminal.ref, terminalRef)) fail('SOURCE_NOT_RELEASED')
  assertReviewedOrgmasterMigrationEntries(baseline.bundle.value.entries)
  const recheck = async () => {
    if (!same(observed, await readOwners())) fail('OWNERS_CHANGED')
    if (!scheduler) return
    const current = await transport.request(schedulerUri)
    assertLifecycleSchedulerReadback(current, ['ENABLED'])
    const { lastSuccess: _success, ...prior } = scheduler
    if (!same(prior, lifecycleSchedulerSnapshot(current))) fail('SCHEDULER_CHANGED')
  }
  await recheck()
  if (check) return { status: 'PROVIDER_PRECHECK_PASS', action, sourceRevision, expectedRevision, scheduler, observed }

  const deadlineAt = new Date(Date.parse(transport.now()) + 120_000).toISOString()
  const operation = { schemaVersion: control.operationSchema, action, sourceRevision, expectedRevision,
    acceptanceRef, releaseIntentRef, terminalRef: baseline.terminal.ref, deadlineAt }
  const identity = controlIdentity(operation)
  const hash = sha256(canonicalize(operation) + '\n')
  const { inputUri, outputUri } = pathsForControl(sourceRevision, identity, hash, control)
  const readReceipt = () => transport.readBytes(outputUri, { prefixes: [controlReceiptPrefix] }).catch(error => {
    if (error.code === 'MISSING' && error.detail === '404') return null
    throw error
  })
  const input = await transport.putJson(inputUri, operation, { bucket, prefix: controlInputPrefix, ifGenerationMatch: '0' })
  await recheck()
  try {
    // Even if a receipt exists, the Job must re-read the live DB CAS so a
    // historical enable receipt cannot masquerade as current after disable.
    const publicationInput = control === fmsPublicationControl ? { fmsPublicationControlRef: input.ref } : { pdmPublicationControlRef: input.ref }
    await transport.runMigrationJob({ profile, deployment: baseline.deployment.value, outputUri, deadlineAt, ...publicationInput })
  } catch (error) {
    const previous = await readReceipt()
    if (previous) error.historicalReceiptRef = previous.ref
    throw error
  }
  const receipt = await readReceipt()
  if (!receipt) fail('RECEIPT_UNAVAILABLE')
  const { receiptSha256, ...result } = JSON.parse(receipt.bytes)
  if (receiptSha256 !== sha256(canonicalize(result)) || result.status !== 'PASS' || result.sourceRevision !== sourceRevision ||
      result.schemaVersion !== control.receiptSchema || result.action !== action ||
      result.operationSha256 !== identity || result.state?.operationSha256 !== identity ||
      result.state?.revision !== (BigInt(expectedRevision) + 1n).toString() || result.state?.enabled !== (action === 'enable') ||
      !same(result.acceptanceRef, acceptanceRef) || !same(result.releaseIntentRef, releaseIntentRef)) fail('RECEIPT_INVALID')
  try { await recheck() } catch (error) {
    throw Object.assign(error, { receiptRef: receipt.ref })
  }
  return { ...result, receiptSha256, receiptRef: receipt.ref, scheduler, observed }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = fileURLToPath(new URL('../', import.meta.url))
  const command = (name, args) => {
    const result = spawnSync(name, args, { cwd: root, encoding: 'utf8', windowsHide: true })
    if (result.error || result.status !== 0) fail('OPERATOR_CREDENTIAL_UNAVAILABLE')
    return result.stdout.trim()
  }
  const profile = JSON.parse(readGitBlob(root, 'config/release/dev040-orgmaster-independent-production-v3.json'))
  const git = readGitAuthority(root, profile)
  await verifyOfficialMergedSource({ repository: profile.application.repository, branch: profile.application.branch,
    revision: git.sourceRevision, sourceTree: git.sourceTree, rulesetId: 24077876, requireSourceQc: true,
    token: process.env.GITHUB_TOKEN || command('gh', ['auth', 'token']) })
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || (process.platform === 'win32'
    ? command('pwsh', ['-NoProfile', '-Command', 'gcloud auth print-access-token']) : command('gcloud', ['auth', 'print-access-token']))
  const result = await executeOwnerOperation({ ...options, profile, sourceRevision: git.sourceRevision, transport: createOwnerTransport({ token }) })
  process.stdout.write(JSON.stringify(result) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    if (error.receiptRef) process.stdout.write(JSON.stringify({ status: 'COMMITTED_PROVIDER_DRIFT', receiptRef: error.receiptRef }) + '\n')
    if (error.historicalReceiptRef) process.stdout.write(JSON.stringify({ status: 'LIVE_CONTROL_UNCONFIRMED', historicalReceiptRef: error.historicalReceiptRef }) + '\n')
    process.stderr.write((error.code ?? error.message) + '\n')
    process.exitCode = 1
  })
}
