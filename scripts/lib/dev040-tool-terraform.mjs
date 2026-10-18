import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const MODULE_RELATIVE_PATH = path.join('infra', 'google-cloud', 'dev-040-production-release')
const BACKEND_BUCKET = 'tfstate-jenfu-platform-prod'
const BACKEND_PREFIX = 'dev-040-r2/production-release/default.tfstate'
const PROJECT_ID = 'jenfu-platform-prod'
const REGION = 'asia-east1'
const SERVICE_NAME = 'orgmaster-prod'
const RELEASE_REPOSITORY = 'orgmaster-release'
const RELEASE_BUCKET = 'jenfu-platform-prod-orgmaster-release'
const WORKLOAD_IDENTITY_POOL = 'jenfu-prod-release'
const GITHUB_REPOSITORY_ID = '1359840708'
const GITHUB_OWNER_ID = '257207597'
const RUNTIME_SERVICE_ACCOUNT_ID = 'orgmaster-prod-runtime'
const MIGRATION_SERVICE_ACCOUNT_ID = 'orgmaster-prod-migrator'
const CLOUD_SQL_CONNECTION = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
const CONTROLLER_SECRET_ID = 'orgmaster-prod-controller-github-read-token'
const CANDIDATE_SECRET_ID = 'orgmaster-prod-smoke-firebase-refresh-token'
const MIGRATION_RUNNER_URI = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-migration-runner'
const RELEASE_REPOSITORY_RESOURCE = 'projects/jenfu-platform-prod/locations/asia-east1/repositories/orgmaster-release'
const MIGRATION_JOB_RESOURCE = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/orgmaster-prod-migration-runner'
const MIGRATION_JOB_NAME = 'orgmaster-prod-migration-runner'
const CANDIDATE_WORKFLOW_RESOURCE = 'projects/jenfu-platform-prod/locations/asia-east1/workflows/orgmaster-prod-candidate-smoke'
const EXPECTED_STATE_INSTANCE_COUNT = 75
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const CONTROLLER_IMAGE = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/orgmaster-release\/orgmaster-abort-controller@sha256:[a-f0-9]{64}$/u

function fail(code) {
  const error = new Error(`TOOL_TERRAFORM_${code}`)
  error.code = `TOOL_TERRAFORM_${code}`
  throw error
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

function profileParts(profile) {
  if (!isRecord(profile)) fail('PROFILE_INVALID')
  const release = profile.releaseProfile ?? profile.ownerProfile ?? profile.profile ?? profile
  const infraPlan = profile.infraPlanProfile ?? profile.infrastructurePlan ?? profile.infraPlan
    ?? profile.terraform?.infraPlan ?? null
  return { release, infraPlan }
}

function assertProfile(profile) {
  const { release } = profileParts(profile)
  const target = release.target
  if (release.application?.id !== 'orgmaster' || target?.projectId !== PROJECT_ID || target.region !== REGION
    || target.serviceName !== SERVICE_NAME || target.runtimeServiceAccount !== `${RUNTIME_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com`
    || target.databaseInstance !== 'jenfu-platform-prod-pg' || target.database !== 'jenfu_prod'
    || release.artifact?.repository !== RELEASE_REPOSITORY || release.artifact.releaseBucket !== RELEASE_BUCKET
    || release.artifact.migrationRunnerImage !== 'orgmaster-migration-runner'
    || release.artifact.migrationRunnerUri !== MIGRATION_RUNNER_URI
    || release.state?.backendKey !== BACKEND_PREFIX
    || release.runtime?.cloudSqlConnectionName !== CLOUD_SQL_CONNECTION
    || release.incidentRuntime?.githubReadTokenSecretId !== CONTROLLER_SECRET_ID
    || release.verification?.candidateWorkflowName !== 'orgmaster-prod-candidate-smoke'
    || release.verification?.candidateRefreshTokenSecretId !== CANDIDATE_SECRET_ID) fail('PROFILE_OWNER_INVALID')
  return release
}

function addressFor(resource, instance) {
  const prefix = resource.mode === 'data' ? 'data.' : ''
  let address = `${prefix}${resource.type}.${resource.name}`
  if (instance.index_key !== undefined) {
    address += `[${typeof instance.index_key === 'number' ? instance.index_key : JSON.stringify(instance.index_key)}]`
  }
  return address
}

function rawStateInstances(state) {
  if (!isRecord(state) || !Array.isArray(state.resources)) fail('STATE_INVALID')
  const entries = []
  const addresses = new Set()
  for (const resource of state.resources) {
    if (!isRecord(resource) || resource.module || !['managed', 'data'].includes(resource.mode)
      || typeof resource.type !== 'string' || !/^google_[a-z0-9_]+$/u.test(resource.type)
      || typeof resource.name !== 'string' || !Array.isArray(resource.instances)) fail('STATE_RESOURCE_INVALID')
    for (const instance of resource.instances) {
      if (!isRecord(instance) || !isRecord(instance.attributes)) fail('STATE_INSTANCE_INVALID')
      const address = addressFor(resource, instance)
      if (addresses.has(address)) fail('STATE_ADDRESS_DUPLICATE')
      addresses.add(address)
      entries.push({ address, mode: resource.mode, type: resource.type, name: resource.name, attributes: instance.attributes })
    }
  }
  if (entries.length !== EXPECTED_STATE_INSTANCE_COUNT) fail('STATE_INSTANCE_COUNT_INVALID')
  return entries
}

function stateJsonAddresses(stateJson) {
  const root = stateJson?.values?.root_module
  if (!isRecord(root) || !Array.isArray(root.resources) || (root.child_modules?.length ?? 0) !== 0) fail('STATE_SHOW_INVALID')
  const addresses = root.resources.map(resource => resource?.address)
  if (addresses.some(address => typeof address !== 'string') || new Set(addresses).size !== addresses.length) {
    fail('STATE_SHOW_ADDRESS_INVALID')
  }
  return addresses.sort()
}

function expectedAddresses(infraPlan) {
  if (infraPlan == null) return null
  if (infraPlan.ownerApplicationId !== 'orgmaster' || infraPlan.projectId !== PROJECT_ID || infraPlan.region !== REGION
    || infraPlan.backendKey !== BACKEND_PREFIX || !Array.isArray(infraPlan.stageA) || !Array.isArray(infraPlan.stageBAdditional)) {
    fail('INFRA_PROFILE_INVALID')
  }
  const addresses = [...infraPlan.stageA, ...infraPlan.stageBAdditional]
  if (addresses.length !== EXPECTED_STATE_INSTANCE_COUNT || new Set(addresses).size !== addresses.length) fail('INFRA_ADDRESS_SET_INVALID')
  return addresses.sort()
}

function oneResource(entries, type, name) {
  const matches = entries.filter(entry => entry.type === type && entry.name === name && entry.mode === 'managed')
  if (matches.length !== 1) fail('BOUND_RESOURCE_MISSING')
  return matches[0].attributes
}

function assertManifest(manifest, profile) {
  const { target, artifact } = profile
  if (!isRecord(manifest) || manifest.project_id !== PROJECT_ID || manifest.region !== REGION
    || manifest.application_service !== SERVICE_NAME || manifest.runtime_identity !== target.runtimeServiceAccount
    || manifest.release_bucket !== RELEASE_BUCKET || manifest.release_repository !== RELEASE_REPOSITORY_RESOURCE
    || manifest.incident_runtime !== true || manifest.abort_controller_name !== 'orgmaster-prod-abort-controller'
    || ![MIGRATION_JOB_NAME, MIGRATION_JOB_RESOURCE].includes(manifest.migration_job_name)
    || manifest.candidate_smoke !== CANDIDATE_WORKFLOW_RESOURCE
    || manifest.candidate_smoke_secret !== CANDIDATE_SECRET_ID
    || !CONTROLLER_IMAGE.test(manifest.controller_image_digest ?? '')
    || !new RegExp(`^${artifact.migrationRunnerUri.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}@sha256:[a-f0-9]{64}$`, 'u').test(manifest.migration_runner_digest ?? '')
    || !H40.test(manifest.source_revision ?? '') || !H64.test(manifest.foundation_manifest_sha256 ?? '')) fail('MANIFEST_OWNER_INVALID')
}

function controllerSecretVersion(attributes) {
  const template = first(attributes.template)
  const containers = template?.containers ?? first(template?.template)?.containers
  if (!Array.isArray(containers)) fail('CONTROLLER_TEMPLATE_INVALID')
  const matches = containers.flatMap(container => container.env ?? []).filter(env => env.name === 'GITHUB_READ_TOKEN')
  if (matches.length !== 1) fail('CONTROLLER_SECRET_REF_INVALID')
  const valueSource = first(matches[0].value_source ?? matches[0].valueSource)
  const secretRef = first(valueSource?.secret_key_ref ?? valueSource?.secretKeyRef)
  const secretName = secretRef?.secret ?? secretRef?.secret_id ?? secretRef?.secretId
  const version = String(secretRef?.version ?? '')
  if (!(secretName === CONTROLLER_SECRET_ID || secretName === `projects/${PROJECT_ID}/secrets/${CONTROLLER_SECRET_ID}`)
    || !/^[1-9][0-9]*$/u.test(version)) fail('CONTROLLER_SECRET_REF_INVALID')
  return version
}

function candidateSecretVersion(sourceContents) {
  if (typeof sourceContents !== 'string') fail('CANDIDATE_SOURCE_INVALID')
  const secretAt = sourceContents.indexOf(CANDIDATE_SECRET_ID)
  if (secretAt < 0) fail('CANDIDATE_SECRET_REF_INVALID')
  const before = sourceContents.slice(Math.max(0, secretAt - 100), secretAt)
  if (!/secret_id\s*:\s*["']?$/mu.test(before)) fail('CANDIDATE_SECRET_REF_INVALID')
  const following = sourceContents.slice(secretAt, secretAt + 240)
  const versionMatch = /\bversion\s*:\s*["']([1-9][0-9]*)["']/u.exec(following)
  if (!versionMatch) fail('CANDIDATE_SECRET_VERSION_INVALID')
  return versionMatch[1]
}

function notificationEmail(attributes) {
  const email = attributes.labels?.email_address ?? attributes.labels?.emailAddress
  if (typeof email !== 'string' || email.length <= 3) fail('NOTIFICATION_DESTINATION_MISSING')
  return email
}

/** Purely rebuilds the owner module's inputs from the exact raw Terraform state. */
export function terraformVariablesFromState({ state, profile, sourceRevision, nextImage = null, candidateSmokeRefreshTokenSecretVersion = null }) {
  const release = assertProfile(profile)
  if (!H40.test(sourceRevision ?? '')) fail('SOURCE_REVISION_INVALID')
  nextImage ??= state?.outputs?.app_release_infra_manifest?.value?.migration_runner_digest ?? null
  const expectedRunner = new RegExp(`^${release.artifact.migrationRunnerUri.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}@sha256:[a-f0-9]{64}$`, 'u')
  if (!expectedRunner.test(nextImage ?? '')) fail('NEXT_IMAGE_INVALID')

  const entries = rawStateInstances(state)
  const { infraPlan } = profileParts(profile)
  const addresses = expectedAddresses(infraPlan)
  if (addresses && !same(entries.map(entry => entry.address).sort(), addresses)) fail('STATE_ADDRESS_SET_INVALID')

  const manifest = state.outputs?.app_release_infra_manifest?.value
  assertManifest(manifest, release)

  const job = oneResource(entries, 'google_cloud_run_v2_job', 'migration')
  const jobTemplate = first(job.template)
  const jobContainer = first(first(jobTemplate?.template)?.containers)
  if (job.project !== PROJECT_ID || job.location !== REGION || job.name !== 'orgmaster-prod-migration-runner'
    || jobContainer?.image !== manifest.migration_runner_digest) fail('MIGRATION_JOB_BINDING_INVALID')

  const controller = oneResource(entries, 'google_cloud_run_v2_service', 'abort_controller')
  const controllerContainer = first(first(controller.template)?.containers)
  if (controller.project !== PROJECT_ID || controller.location !== REGION || controller.name !== 'orgmaster-prod-abort-controller'
    || controllerContainer?.image !== manifest.controller_image_digest) fail('CONTROLLER_BINDING_INVALID')
  const githubReadTokenSecretVersion = controllerSecretVersion(controller)

  const workflow = oneResource(entries, 'google_workflows_workflow', 'candidate_smoke')
  if (workflow.project !== PROJECT_ID || workflow.region !== REGION || workflow.name !== release.verification.candidateWorkflowName) {
    fail('CANDIDATE_WORKFLOW_BINDING_INVALID')
  }
  const currentCandidateSmokeRefreshTokenSecretVersion = candidateSecretVersion(workflow.source_contents)
  const selectedCandidateSmokeRefreshTokenSecretVersion = candidateSmokeRefreshTokenSecretVersion ?? currentCandidateSmokeRefreshTokenSecretVersion
  if (!/^[1-9][0-9]*$/u.test(selectedCandidateSmokeRefreshTokenSecretVersion) ||
      !Number.isSafeInteger(Number(selectedCandidateSmokeRefreshTokenSecretVersion))) fail('CANDIDATE_SECRET_VERSION_INVALID')

  const notification = oneResource(entries, 'google_monitoring_notification_channel', 'incident')
  if (notification.project !== PROJECT_ID || notification.type !== 'email') fail('NOTIFICATION_CHANNEL_BINDING_INVALID')
  const approvedNotificationEmail = notificationEmail(notification)

  return {
    project_id: PROJECT_ID,
    region: REGION,
    application_service_name: SERVICE_NAME,
    runtime_service_account_id: RUNTIME_SERVICE_ACCOUNT_ID,
    release_repository_id: RELEASE_REPOSITORY,
    release_bucket_name: RELEASE_BUCKET,
    workload_identity_pool_id: WORKLOAD_IDENTITY_POOL,
    github_repository_id: GITHUB_REPOSITORY_ID,
    github_repository_owner_id: GITHUB_OWNER_ID,
    controller_image_digest: manifest.controller_image_digest,
    incident_runtime_enabled: true,
    github_read_token_secret_version: githubReadTokenSecretVersion,
    migration_service_account_id: MIGRATION_SERVICE_ACCOUNT_ID,
    cloud_sql_connection_name: CLOUD_SQL_CONNECTION,
    migration_runner_image_digest: nextImage,
    approved_notification_email: approvedNotificationEmail,
    candidate_smoke_refresh_token_secret_version: selectedCandidateSmokeRefreshTokenSecretVersion,
    source_revision: sourceRevision,
    foundation_manifest_sha256: manifest.foundation_manifest_sha256,
  }
}

function parseJson(stdout, code) {
  try {
    return JSON.parse(Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout ?? ''))
  } catch {
    fail(code)
  }
}

function runNative(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks = []
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)))
    child.once('error', () => reject(new Error('TOOL_TERRAFORM_COMMAND_FAILED')))
    child.once('close', code => {
      if (code !== 0) reject(new Error('TOOL_TERRAFORM_COMMAND_FAILED'))
      else resolve({ stdout: Buffer.concat(chunks), exitCode: 0 })
    })
  })
}

function stdoutOf(result) {
  if (Buffer.isBuffer(result) || typeof result === 'string') return result
  if (!isRecord(result)) fail('COMMAND_FAILED')
  if (result.error) fail('COMMAND_FAILED')
  const exitCode = result.exitCode ?? result.status
  if (exitCode !== undefined && exitCode !== 0) fail('COMMAND_FAILED')
  if (result.stdout === undefined || result.stdout === null) return ''
  return result.stdout
}

function safeFilename(base, runId) {
  const privateMarker = base.indexOf('.private')
  return privateMarker >= 0
    ? `${base.slice(0, privateMarker)}-${runId}${base.slice(privateMarker)}`
    : `${base}-${runId}`
}

async function writePrivateFile(filePath, bytes) {
  try {
    const existing = await fs.lstat(filePath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (existing?.isSymbolicLink() || (existing && !existing.isFile())) fail('OUTPUT_PATH_INVALID')
    await fs.writeFile(filePath, bytes, { mode: 0o600 })
  } catch (error) {
    if (error?.code?.startsWith?.('TOOL_TERRAFORM_')) throw error
    fail('OUTPUT_WRITE_FAILED')
  }
}

async function assertBackendMetadata(dataDirectory) {
  const backendPath = path.join(dataDirectory, 'terraform.tfstate')
  let metadata
  try {
    const info = await fs.lstat(backendPath)
    if (!info.isFile() || info.isSymbolicLink()) fail('BACKEND_METADATA_INVALID')
    metadata = JSON.parse(await fs.readFile(backendPath, 'utf8'))
  } catch (error) {
    if (error?.code?.startsWith?.('TOOL_TERRAFORM_')) throw error
    fail('BACKEND_METADATA_INVALID')
  }
  if (metadata?.backend?.type !== 'gcs' || metadata.backend.config?.bucket !== BACKEND_BUCKET
    || metadata.backend.config?.prefix !== BACKEND_PREFIX) fail('BACKEND_BINDING_INVALID')
}

function childEnvironment(environment, dataDirectory) {
  const result = {}
  for (const [key, value] of Object.entries(environment)) {
    if (/^TF_WORKSPACE$/iu.test(key) || /^TF_CLI_ARGS/iu.test(key) || /^TF_PLUGIN_CACHE_DIR$/iu.test(key)) continue
    result[key] = value
  }
  result.TF_DATA_DIR = dataDirectory
  result.TF_IN_AUTOMATION = '1'
  return result
}

/**
 * Creates an isolated adapter for the repository-owned DEV-040 Terraform module.
 * `run(command, args, { cwd, env })` is injectable; production callers use the
 * native Terraform process, while tests provide a synthetic runner.
 */
export function createToolTerraform({ root, outputDirectory, environment = process.env, run = runNative }) {
  if (typeof root !== 'string' || typeof outputDirectory !== 'string' || typeof run !== 'function') fail('CONFIG_INVALID')
  const repositoryRoot = path.resolve(root)
  const moduleDirectory = path.resolve(repositoryRoot, MODULE_RELATIVE_PATH)
  const outputRoot = path.resolve(outputDirectory)
  if (outputRoot === repositoryRoot || outputRoot === moduleDirectory || !isRecord(environment)) fail('OUTPUT_DIRECTORY_INVALID')

  const runId = randomUUID()
  const dataDirectory = path.join(outputRoot, 'terraform-data')
  const variablesPath = path.join(outputRoot, safeFilename('tool-terraform-variables.private.json', runId))
  const generatedPlanPath = path.join(outputRoot, safeFilename('tool-terraform-plan.private', runId))
  const stateSnapshotPath = path.join(outputRoot, safeFilename('terraform-state.private.json', runId))
  const terraformEnvironment = childEnvironment(environment, dataDirectory)
  const executable = environment.TERRAFORM_BIN || 'terraform'
  const pluginDirectory = typeof environment.TERRAFORM_PLUGIN_DIR === 'string' && environment.TERRAFORM_PLUGIN_DIR.length > 0
    ? path.resolve(repositoryRoot, environment.TERRAFORM_PLUGIN_DIR)
    : null
  let initialized = false
  let latestPlan = null

  async function ensureDirectoriesAndModule() {
    try {
      await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 })
      await fs.mkdir(dataDirectory, { recursive: true, mode: 0o700 })
      const files = await fs.readdir(moduleDirectory, { withFileTypes: true })
      if (!files.some(file => file.isFile() && file.name === 'versions.tf')
        || !files.some(file => file.isFile() && file.name === 'variables.tf')) fail('MODULE_PATH_INVALID')
      for (const file of files.filter(item => item.isFile() && item.name.endsWith('.tf'))) {
        const source = await fs.readFile(path.join(moduleDirectory, file.name), 'utf8')
        if (/^\s*module\s+"[^"]+"\s*\{/mu.test(source)) fail('CHILD_MODULE_DENIED')
      }
    } catch (error) {
      if (error?.code?.startsWith?.('TOOL_TERRAFORM_')) throw error
      fail('MODULE_OR_OUTPUT_DIRECTORY_INVALID')
    }
  }

  async function invoke(args, code = 'COMMAND_FAILED') {
    try {
      return stdoutOf(await run(executable, args, {
        cwd: moduleDirectory,
        env: terraformEnvironment,
        windowsHide: true,
      }))
    } catch {
      fail(code)
    }
  }

  return {
    async initialize() {
      if (initialized) {
        await assertBackendMetadata(dataDirectory)
        return { initialized: true, dataDirectory }
      }
      await ensureDirectoriesAndModule()
      const initArgs = [
        'init', '-input=false', '-lockfile=readonly', '-reconfigure',
        `-backend-config=bucket=${BACKEND_BUCKET}`,
        `-backend-config=prefix=${BACKEND_PREFIX}`,
      ]
      if (pluginDirectory) initArgs.push(`-plugin-dir=${pluginDirectory}`)
      await invoke(initArgs)
      await assertBackendMetadata(dataDirectory)
      initialized = true
      return { initialized: true, dataDirectory }
    },

    async read() {
      if (!initialized) fail('NOT_INITIALIZED')
      let snapshotCreated = false
      try {
        const stateRaw = await invoke(['state', 'pull'])
        const stateMeta = parseJson(stateRaw, 'STATE_OUTPUT_INVALID')
        await writePrivateFile(stateSnapshotPath, Buffer.isBuffer(stateRaw) ? stateRaw : Buffer.from(String(stateRaw), 'utf8'))
        snapshotCreated = true
        const stateJson = parseJson(await invoke(['show', '-json', stateSnapshotPath]), 'STATE_SHOW_INVALID')
        const stateAddresses = rawStateInstances(stateMeta).map(entry => entry.address).sort()
        if (!same(stateAddresses, stateJsonAddresses(stateJson))) fail('STATE_SNAPSHOT_MISMATCH')
        const manifestOutput = parseJson(await invoke(['output', '-json', 'app_release_infra_manifest']), 'MANIFEST_OUTPUT_INVALID')
        const manifest = manifestOutput?.value ?? manifestOutput
        const stateManifest = stateMeta?.outputs?.app_release_infra_manifest?.value
        if (!isRecord(manifest) || !same(manifest, stateManifest)) fail('STATE_MANIFEST_MISMATCH')
        return { stateMeta, stateJson, manifest }
      } finally {
        if (snapshotCreated) await fs.rm(stateSnapshotPath, { force: true }).catch(() => {})
      }
    },

    async plan({ variables }) {
      if (!initialized) fail('NOT_INITIALIZED')
      if (!isRecord(variables)) fail('VARIABLES_INVALID')
      latestPlan = null
      const capturedVariables = JSON.parse(JSON.stringify(variables))
      await writePrivateFile(variablesPath, `${JSON.stringify(capturedVariables, null, 2)}\n`)
      await invoke([
        'plan', '-input=false', '-lock-timeout=60s',
        `-var-file=${variablesPath}`,
        `-out=${generatedPlanPath}`,
      ])
      const plan = parseJson(await invoke(['show', '-json', generatedPlanPath]), 'PLAN_SHOW_INVALID')
      let binaryPlan
      try {
        const info = await fs.lstat(generatedPlanPath)
        if (!info.isFile() || info.isSymbolicLink()) fail('PLAN_FILE_INVALID')
        binaryPlan = await fs.readFile(generatedPlanPath)
      } catch (error) {
        if (error?.code?.startsWith?.('TOOL_TERRAFORM_')) throw error
        fail('PLAN_FILE_MISSING')
      }
      const binaryPlanSha256 = createHash('sha256').update(binaryPlan).digest('hex')
      latestPlan = { path: generatedPlanPath, sha256: binaryPlanSha256 }
      return { plan, binaryPlan: Buffer.from(binaryPlan), binaryPlanPath: generatedPlanPath, variables: capturedVariables }
    },

    async apply({ binaryPlan, binaryPlanSha256 }) {
      if (!initialized) fail('NOT_INITIALIZED')
      const plan = latestPlan
      latestPlan = null
      if (!Buffer.isBuffer(binaryPlan) || !H64.test(binaryPlanSha256 ?? '')) fail('PLAN_BINDING_INVALID')
      const suppliedSha256 = createHash('sha256').update(binaryPlan).digest('hex')
      if (suppliedSha256 !== binaryPlanSha256 || (plan && plan.sha256 !== suppliedSha256)) fail('PLAN_HASH_INVALID')
      let bytes
      try {
        await writePrivateFile(generatedPlanPath, binaryPlan)
        const info = await fs.lstat(generatedPlanPath)
        if (!info.isFile() || info.isSymbolicLink() || path.resolve(generatedPlanPath) !== generatedPlanPath) fail('PLAN_FILE_INVALID')
        bytes = await fs.readFile(generatedPlanPath)
      } catch (error) {
        if (error?.code?.startsWith?.('TOOL_TERRAFORM_')) throw error
        fail('PLAN_FILE_INVALID')
      }
      const actualSha256 = createHash('sha256').update(bytes).digest('hex')
      if (actualSha256 !== suppliedSha256 || actualSha256 !== binaryPlanSha256) fail('PLAN_HASH_INVALID')
      await invoke(['apply', '-input=false', '-auto-approve', generatedPlanPath])
      return { applied: true, binaryPlanPath: generatedPlanPath, binaryPlanSha256: actualSha256 }
    },
  }
}
