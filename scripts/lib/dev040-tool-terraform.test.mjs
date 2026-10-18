import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createToolTerraform, terraformVariablesFromState } from './dev040-tool-terraform.mjs'

const REPOSITORY_ROOT = process.cwd()
const RELEASE_PROFILE = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'config/release/dev040-orgmaster-independent-production-v3.json'), 'utf8'))
const INFRA_PLAN = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'config/release/dev040-production-release-infra-plan.json'), 'utf8'))
const PROFILE = { ...RELEASE_PROFILE, infraPlanProfile: INFRA_PLAN }
const SOURCE_REVISION = 'a'.repeat(40)
const PREVIOUS_IMAGE = `${RELEASE_PROFILE.artifact.migrationRunnerUri}@sha256:${'b'.repeat(64)}`
const NEXT_IMAGE = `${RELEASE_PROFILE.artifact.migrationRunnerUri}@sha256:${'c'.repeat(64)}`
const CONTROLLER_IMAGE = `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:${'d'.repeat(64)}`
const TEST_EMAIL = 'synthetic-owner@example.invalid'

function resourceFromAddress(address) {
  const data = address.startsWith('data.')
  const normalized = data ? address.slice('data.'.length) : address
  const match = /^([^.]+)\.([^[]+?)(?:\[(.+)\])?$/u.exec(normalized)
  assert.ok(match, `unexpected fixture address ${address}`)
  let indexKey
  if (match[3] !== undefined) indexKey = match[3].startsWith('"') ? JSON.parse(match[3]) : Number(match[3])
  return {
    mode: data ? 'data' : 'managed',
    type: match[1],
    name: match[2],
    indexKey,
  }
}

function syntheticState() {
  const resources = [...INFRA_PLAN.stageA, ...INFRA_PLAN.stageBAdditional].map(address => {
    const resource = resourceFromAddress(address)
    const attributes = { project: 'jenfu-platform-prod', name: resource.name }
    if (resource.type === 'google_cloud_run_v2_job' && resource.name === 'migration') {
      Object.assign(attributes, {
        location: 'asia-east1',
        name: 'orgmaster-prod-migration-runner',
        template: [{ template: [{ containers: [{ image: PREVIOUS_IMAGE }] }] }],
      })
    }
    if (resource.type === 'google_cloud_run_v2_service' && resource.name === 'abort_controller') {
      Object.assign(attributes, {
        location: 'asia-east1',
        name: 'orgmaster-prod-abort-controller',
        template: [{ containers: [{
          image: CONTROLLER_IMAGE,
          env: [{
            name: 'GITHUB_READ_TOKEN',
            value_source: [{ secret_key_ref: [{ secret: 'orgmaster-prod-controller-github-read-token', version: '7' }] }],
          }],
        }] }],
      })
    }
    if (resource.type === 'google_workflows_workflow' && resource.name === 'candidate_smoke') {
      Object.assign(attributes, {
        region: 'asia-east1',
        name: 'orgmaster-prod-candidate-smoke',
        source_contents: [
          'main:',
          '  steps:',
          '    - read_refresh_token:',
          '        args:',
          '          secret_id: "orgmaster-prod-smoke-firebase-refresh-token"',
          '          version: "9"',
        ].join('\n'),
      })
    }
    if (resource.type === 'google_monitoring_notification_channel' && resource.name === 'incident') {
      Object.assign(attributes, { type: 'email', labels: { email_address: TEST_EMAIL } })
    }
    const { indexKey, ...resourceState } = resource
    return {
      ...resourceState,
      provider: 'provider["registry.terraform.io/hashicorp/google"]',
      instances: [{ ...(indexKey === undefined ? {} : { index_key: indexKey }), attributes }],
    }
  })

  const manifest = {
    project_id: 'jenfu-platform-prod',
    region: 'asia-east1',
    source_revision: 'e'.repeat(40),
    foundation_manifest_sha256: 'f'.repeat(64),
    application_service: 'orgmaster-prod',
    runtime_identity: 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',
    release_repository: 'projects/jenfu-platform-prod/locations/asia-east1/repositories/orgmaster-release',
    release_bucket: 'jenfu-platform-prod-orgmaster-release',
    wif_provider: 'projects/9536592944/locations/global/workloadIdentityPools/jenfu-prod-release/providers/github',
    incident_runtime: true,
    abort_controller_name: 'orgmaster-prod-abort-controller',
    migration_job_name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/orgmaster-prod-migration-runner',
    candidate_smoke: 'projects/jenfu-platform-prod/locations/asia-east1/workflows/orgmaster-prod-candidate-smoke',
    candidate_smoke_secret: 'orgmaster-prod-smoke-firebase-refresh-token',
    controller_image_digest: CONTROLLER_IMAGE,
    migration_runner_digest: PREVIOUS_IMAGE,
  }
  return {
    state: {
      version: 4,
      terraform_version: '1.15.0',
      serial: 12,
      lineage: 'synthetic-state-lineage',
      outputs: { app_release_infra_manifest: { value: manifest, type: ['object', {}], sensitive: false } },
      resources,
    },
    manifest,
  }
}

function syntheticShowState(state) {
  const resources = state.resources.flatMap(resource => resource.instances.map(instance => {
    let address = `${resource.mode === 'data' ? 'data.' : ''}${resource.type}.${resource.name}`
    if (instance.index_key !== undefined) {
      address += `[${typeof instance.index_key === 'number' ? instance.index_key : JSON.stringify(instance.index_key)}]`
    }
    return {
      address,
      mode: resource.mode,
      type: resource.type,
      name: resource.name,
      ...(instance.index_key === undefined ? {} : { index: instance.index_key }),
      values: instance.attributes,
    }
  }))
  return { format_version: '1.2', values: { root_module: { resources, child_modules: [] } } }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function writeBackendMetadata(dataDirectory, { bucket = 'tfstate-jenfu-platform-prod', prefix = 'dev-040-r2/production-release/default.tfstate' } = {}) {
  await fs.promises.mkdir(dataDirectory, { recursive: true })
  await fs.promises.writeFile(path.join(dataDirectory, 'terraform.tfstate'), JSON.stringify({
    version: 3,
    backend: { type: 'gcs', config: { bucket, prefix } },
  }))
}

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(REPOSITORY_ROOT, '.dev040-tool-terraform-'))
}

function removeTemporaryDirectory(directory) {
  const expectedPrefix = `${path.resolve(REPOSITORY_ROOT)}${path.sep}.dev040-tool-terraform-`
  assert.ok(path.resolve(directory).startsWith(expectedPrefix))
  fs.rmSync(directory, { recursive: true, force: true })
}

test('rebuilds the full bounded variable set from synthetic raw state', () => {
  const { state } = syntheticState()
  const variables = terraformVariablesFromState({ state, profile: PROFILE, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE })

  assert.deepEqual(variables, {
    project_id: 'jenfu-platform-prod',
    region: 'asia-east1',
    application_service_name: 'orgmaster-prod',
    runtime_service_account_id: 'orgmaster-prod-runtime',
    release_repository_id: 'orgmaster-release',
    release_bucket_name: 'jenfu-platform-prod-orgmaster-release',
    workload_identity_pool_id: 'jenfu-prod-release',
    github_repository_id: '1359840708',
    github_repository_owner_id: '257207597',
    controller_image_digest: CONTROLLER_IMAGE,
    incident_runtime_enabled: true,
    github_read_token_secret_version: '7',
    migration_service_account_id: 'orgmaster-prod-migrator',
    cloud_sql_connection_name: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    migration_runner_image_digest: NEXT_IMAGE,
    approved_notification_email: TEST_EMAIL,
    candidate_smoke_refresh_token_secret_version: '9',
    source_revision: SOURCE_REVISION,
    foundation_manifest_sha256: 'f'.repeat(64),
  })
  assert.equal(Object.hasOwn(variables, 'github_read_token'), false)
})

test('accepts the exact short migration job name emitted by the own Terraform output', () => {
  const { state } = syntheticState()
  state.outputs.app_release_infra_manifest.value.migration_job_name = 'orgmaster-prod-migration-runner'
  const variables = terraformVariablesFromState({ state, profile: PROFILE, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE })
  assert.equal(variables.migration_runner_image_digest, NEXT_IMAGE)
})

test('rejects state outside the exact owner address set and target bindings', () => {
  const { state } = syntheticState()
  const extraState = structuredClone(state)
  extraState.resources.pop()
  assert.throws(
    () => terraformVariablesFromState({ state: extraState, profile: PROFILE, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE }),
    error => error.code === 'TOOL_TERRAFORM_STATE_INSTANCE_COUNT_INVALID',
  )

  const wrongProfile = { ...PROFILE, target: { ...PROFILE.target, projectId: 'sibling-project' } }
  assert.throws(
    () => terraformVariablesFromState({ state, profile: wrongProfile, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE }),
    error => error.code === 'TOOL_TERRAFORM_PROFILE_OWNER_INVALID',
  )

  const wrongRunner = { ...PROFILE, artifact: { ...PROFILE.artifact, migrationRunnerUri: 'asia-east1-docker.pkg.dev/sibling-project/release/runner' } }
  assert.throws(
    () => terraformVariablesFromState({ state, profile: wrongRunner, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE }),
    error => error.code === 'TOOL_TERRAFORM_PROFILE_OWNER_INVALID',
  )

  const badJob = structuredClone(state)
  const job = badJob.resources.find(resource => resource.type === 'google_cloud_run_v2_job' && resource.name === 'migration')
  job.instances[0].attributes.project = 'sibling-project'
  assert.throws(
    () => terraformVariablesFromState({ state: badJob, profile: PROFILE, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE }),
    error => error.code === 'TOOL_TERRAFORM_MIGRATION_JOB_BINDING_INVALID',
  )
})

test('rejects invented or unbound image, secret versions, workflow source, and notification destination', () => {
  const { state } = syntheticState()
  for (const [badSourceRevision, badImage] of [['not-a-revision', NEXT_IMAGE], [SOURCE_REVISION, 'latest']]) {
    assert.throws(
      () => terraformVariablesFromState({ state, profile: PROFILE, sourceRevision: badSourceRevision, nextImage: badImage }),
      error => ['TOOL_TERRAFORM_SOURCE_REVISION_INVALID', 'TOOL_TERRAFORM_NEXT_IMAGE_INVALID'].includes(error.code),
    )
  }

  const mutations = [
    candidate => {
      const resource = candidate.resources.find(item => item.type === 'google_cloud_run_v2_service' && item.name === 'abort_controller')
      resource.instances[0].attributes.template[0].containers[0].env[0].value_source[0].secret_key_ref[0].version = 'latest'
    },
    candidate => {
      const resource = candidate.resources.find(item => item.type === 'google_cloud_run_v2_service' && item.name === 'abort_controller')
      resource.instances[0].attributes.template[0].containers[0].env[0].value_source[0].secret_key_ref[0].secret = 'projects/sibling-project/secrets/orgmaster-prod-controller-github-read-token'
    },
    candidate => {
      const resource = candidate.resources.find(item => item.type === 'google_workflows_workflow' && item.name === 'candidate_smoke')
      resource.instances[0].attributes.source_contents = 'secret_id: "orgmaster-prod-smoke-firebase-refresh-token"\nversion: "latest"'
    },
    candidate => {
      const resource = candidate.resources.find(item => item.type === 'google_monitoring_notification_channel' && item.name === 'incident')
      delete resource.instances[0].attributes.labels.email_address
    },
    candidate => {
      candidate.outputs.app_release_infra_manifest.value.migration_job_name = 'projects/sibling-project/locations/asia-east1/jobs/orgmaster-prod-migration-runner'
    },
  ]
  for (const mutate of mutations) {
    const candidate = structuredClone(state)
    mutate(candidate)
    assert.throws(
      () => terraformVariablesFromState({ state: candidate, profile: PROFILE, sourceRevision: SOURCE_REVISION, nextImage: NEXT_IMAGE }),
      error => error.code.startsWith('TOOL_TERRAFORM_'),
    )
  }
})

test('uses only the injected runner and binds init, state read, plan, private files, and apply', async () => {
  const directory = temporaryDirectory()
  const outputDirectory = path.join(directory, 'private-output')
  const fixture = syntheticState()
  const stateJson = syntheticShowState(fixture.state)
  const planJson = { format_version: '1.2', resource_changes: [] }
  const planBytes = Buffer.from([0, 1, 2, 3, 254, 255])
  const calls = []
  const pluginDirectory = path.join(REPOSITORY_ROOT, 'synthetic-provider-cache')
  const environment = {
    TF_LOG: 'OFF',
    SYNTHETIC_ENV_MARKER: 'not-a-credential',
    TF_WORKSPACE: 'sibling-workspace',
    tf_workspace: 'another-sibling-workspace',
    TF_CLI_ARGS: '-chdir=C:\\outside',
    TF_CLI_ARGS_plan: '-target=google_project.x',
    tf_cli_argsapply: '-destroy',
    TF_PLUGIN_CACHE_DIR: path.join(REPOSITORY_ROOT, 'canonical-cache-must-not-be-used'),
    TERRAFORM_PLUGIN_DIR: pluginDirectory,
  }
  try {
    const adapter = createToolTerraform({
      root: REPOSITORY_ROOT,
      outputDirectory,
      environment,
      run: async (command, args, options) => {
        calls.push({ command, args: [...args], cwd: options.cwd, dataDirectory: options.env.TF_DATA_DIR, env: { ...options.env } })
        if (args[0] === 'init') await writeBackendMetadata(options.env.TF_DATA_DIR)
        if (args[0] === 'state' && args[1] === 'pull') return { stdout: JSON.stringify(fixture.state), exitCode: 0 }
        if (args[0] === 'show' && args[1] === '-json') {
          if (args[2].endsWith('.private.json')) return { stdout: JSON.stringify(stateJson), exitCode: 0 }
          if (args[2].endsWith('.private')) return { stdout: JSON.stringify(planJson), exitCode: 0 }
        }
        if (args[0] === 'output') return { stdout: JSON.stringify(fixture.manifest), exitCode: 0 }
        if (args[0] === 'plan') {
          const output = args.find(value => value.startsWith('-out='))?.slice('-out='.length)
          assert.ok(output)
          await fs.promises.writeFile(output, planBytes)
          return { stdout: '', exitCode: 0 }
        }
        if (args[0] === 'apply') return { stdout: '', exitCode: 0 }
        return { stdout: '', exitCode: 0 }
      },
    })

    const initialized = await adapter.initialize()
    const initializedAgain = await adapter.initialize()
    assert.equal(initialized.initialized, true)
    assert.equal(initializedAgain.dataDirectory, initialized.dataDirectory)
    assert.equal(calls.filter(call => call.args[0] === 'init').length, 1)
    const current = await adapter.read()
    assert.deepEqual(current.stateMeta, fixture.state)
    assert.deepEqual(current.stateJson, stateJson)
    assert.equal(current.stateJson.values.root_module.resources.length, 75)
    assert.deepEqual(current.manifest, fixture.manifest)

    const variables = { source_revision: SOURCE_REVISION, approved_notification_email: TEST_EMAIL }
    const planned = await adapter.plan({ variables })
    assert.deepEqual(planned.plan, planJson)
    assert.deepEqual(planned.binaryPlan, planBytes)
    assert.deepEqual(planned.variables, variables)
    const planCommand = calls.find(call => call.args[0] === 'plan')
    assert.ok(planCommand.args.includes('-input=false'))
    assert.ok(planCommand.args.includes('-lock-timeout=60s'))
    assert.equal(planCommand.args.some(value => value === '-target' || value.startsWith('-target=')), false)
    const variablePath = planCommand.args.find(value => value.startsWith('-var-file='))?.slice('-var-file='.length)
    assert.equal(await fs.promises.readFile(variablePath, 'utf8'), `${JSON.stringify(variables, null, 2)}\n`)

    const result = await adapter.apply({ binaryPlan: planned.binaryPlan, binaryPlanSha256: sha256(planBytes) })
    assert.equal(result.applied, true)
    assert.equal(result.binaryPlanSha256, sha256(planBytes))
    const applyCommand = calls.find(call => call.args[0] === 'apply')
    assert.deepEqual(applyCommand.args, ['apply', '-input=false', '-auto-approve', planned.binaryPlanPath])

    const initCommand = calls.find(call => call.args[0] === 'init')
    assert.ok(initCommand.args.includes('-input=false'))
    assert.ok(initCommand.args.includes('-lockfile=readonly'))
    assert.ok(initCommand.args.includes(`-plugin-dir=${path.resolve(pluginDirectory)}`))
    assert.ok(initCommand.args.includes('-backend-config=bucket=tfstate-jenfu-platform-prod'))
    assert.ok(initCommand.args.includes('-backend-config=prefix=dev-040-r2/production-release/default.tfstate'))
    assert.equal(path.resolve(initCommand.cwd), path.resolve(REPOSITORY_ROOT, 'infra/google-cloud/dev-040-production-release'))
    assert.equal(path.resolve(initCommand.dataDirectory), path.resolve(outputDirectory, 'terraform-data'))
    assert.ok(path.resolve(initCommand.dataDirectory).startsWith(path.resolve(outputDirectory) + path.sep))
    assert.equal(Object.keys(initCommand.env).some(key => /^TF_WORKSPACE$/iu.test(key) || /^TF_CLI_ARGS/iu.test(key)), false)
    assert.equal(Object.keys(initCommand.env).some(key => /^TF_PLUGIN_CACHE_DIR$/iu.test(key)), false)
    assert.equal(initCommand.env.TERRAFORM_PLUGIN_DIR, pluginDirectory)
    assert.equal(environment.TF_WORKSPACE, 'sibling-workspace')
    assert.equal(environment.TF_CLI_ARGS_plan, '-target=google_project.x')
    const stateShow = calls.find(call => call.args[0] === 'show' && call.args[2].endsWith('.private.json'))
    assert.ok(path.resolve(stateShow.args[2]).startsWith(path.resolve(outputDirectory) + path.sep))
    await assert.rejects(fs.promises.access(stateShow.args[2]), { code: 'ENOENT' })
    assert.equal(calls.every(call => call.command === 'terraform'), true)
  } finally {
    removeTemporaryDirectory(directory)
  }
})

test('applies only verified downloaded bytes at its own private path without regenerating a plan', async () => {
  const directory = temporaryDirectory()
  const outputDirectory = path.join(directory, 'private-output')
  const planBytes = Buffer.from('synthetic-plan')
  let applyCalls = 0
  let planCalls = 0
  const calls = []
  try {
    const adapter = createToolTerraform({
      root: REPOSITORY_ROOT,
      outputDirectory,
      environment: {},
      run: async (_command, args, options) => {
        calls.push([...args])
        if (args[0] === 'init') await writeBackendMetadata(options.env.TF_DATA_DIR)
        if (args[0] === 'plan') {
          planCalls++
          const output = args.find(value => value.startsWith('-out='))?.slice('-out='.length)
          await fs.promises.writeFile(output, planBytes)
        }
        if (args[0] === 'apply') applyCalls++
        if (args[0] === 'show') return { stdout: '{"resource_changes":[]}', exitCode: 0 }
        return { stdout: '', exitCode: 0 }
      },
    })
    await adapter.initialize()
    const firstPlan = await adapter.plan({ variables: { source_revision: SOURCE_REVISION } })
    await assert.rejects(
      adapter.apply({ binaryPlan: Buffer.from('substituted-plan'), binaryPlanSha256: sha256(planBytes) }),
      error => error.code === 'TOOL_TERRAFORM_PLAN_HASH_INVALID',
    )
    assert.equal(applyCalls, 0)

    const secondPlan = await adapter.plan({ variables: { source_revision: SOURCE_REVISION } })
    await fs.promises.writeFile(secondPlan.binaryPlanPath, Buffer.from('changed-plan'))
    const result = await adapter.apply({ binaryPlan: secondPlan.binaryPlan, binaryPlanSha256: sha256(planBytes) })
    assert.equal(result.applied, true)
    assert.equal(result.binaryPlanPath, secondPlan.binaryPlanPath)
    assert.deepEqual(await fs.promises.readFile(result.binaryPlanPath), planBytes)
    assert.equal(applyCalls, 1)
    assert.equal(planCalls, 2)
    assert.equal(calls.filter(args => args[0] === 'plan').length, 2)
    assert.deepEqual(calls.find(args => args[0] === 'apply'), ['apply', '-input=false', '-auto-approve', secondPlan.binaryPlanPath])
    assert.notEqual(firstPlan.binaryPlanPath, path.join(outputDirectory, 'substituted.plan'))

    const downloadedOutput = path.join(directory, 'downloaded-output')
    const downloadedCalls = []
    const resumedAdapter = createToolTerraform({
      root: REPOSITORY_ROOT,
      outputDirectory: downloadedOutput,
      environment: {},
      run: async (_command, args, options) => {
        downloadedCalls.push([...args])
        if (args[0] === 'init') await writeBackendMetadata(options.env.TF_DATA_DIR)
        return { stdout: '', exitCode: 0 }
      },
    })
    await resumedAdapter.initialize()
    await resumedAdapter.apply({ binaryPlan: planBytes, binaryPlanSha256: sha256(planBytes) })
    const resumedApply = downloadedCalls.find(args => args[0] === 'apply')
    assert.ok(resumedApply)
    assert.equal(downloadedCalls.some(args => args[0] === 'plan'), false)
    assert.ok(path.resolve(resumedApply.at(-1)).startsWith(path.resolve(downloadedOutput) + path.sep))
    assert.deepEqual(await fs.promises.readFile(resumedApply.at(-1)), planBytes)
  } finally {
    removeTemporaryDirectory(directory)
  }
})

test('fails closed when init reports a different backend bucket or prefix', async () => {
  const directory = temporaryDirectory()
  try {
    const adapter = createToolTerraform({
      root: REPOSITORY_ROOT,
      outputDirectory: path.join(directory, 'private-output'),
      environment: {},
      run: async (_command, args, options) => {
        if (args[0] === 'init') await writeBackendMetadata(options.env.TF_DATA_DIR, { prefix: 'sibling/default.tfstate' })
        return { stdout: '', exitCode: 0 }
      },
    })
    await assert.rejects(adapter.initialize(), error => error.code === 'TOOL_TERRAFORM_BACKEND_BINDING_INVALID')
  } finally {
    removeTemporaryDirectory(directory)
  }
})

test('sanitizes injected command errors without returning stderr or sensitive text', async () => {
  const directory = temporaryDirectory()
  try {
    const adapter = createToolTerraform({
      root: REPOSITORY_ROOT,
      outputDirectory: path.join(directory, 'private-output'),
      environment: {},
      run: async () => { throw new Error('SYNTHETIC_PRIVATE_VALUE should never escape') },
    })
    await assert.rejects(adapter.initialize(), error => {
      assert.equal(error.code, 'TOOL_TERRAFORM_COMMAND_FAILED')
      assert.equal(error.message.includes('SYNTHETIC_PRIVATE_VALUE'), false)
      return true
    })
  } finally {
    removeTemporaryDirectory(directory)
  }
})
