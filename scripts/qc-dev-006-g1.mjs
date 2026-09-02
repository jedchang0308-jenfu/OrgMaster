import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { inventorySource } from './dev006-orgmaster-migrate.mjs'

const scriptRoot = dirname(fileURLToPath(import.meta.url))
const orgRoot = resolve(scriptRoot, '..')
const workspaceRoot = resolve(orgRoot, '..')
const platformRoot = join(workspaceRoot, 'Jenfu-Management-system')
const startedAt = new Date()
const runId = `DEV006-G1-${startedAt.toISOString().replace(/[-:.]/gu, '')}-${randomUUID().slice(0, 8)}`
const evidenceRoot = join(platformRoot, 'output', 'dev-006', runId)
const fixtureRoot = join(evidenceRoot, 'fixture-source')
const brokenRoot = join(evidenceRoot, 'fixture-broken')
const composeFile = join(orgRoot, 'qa', 'dev-006', 'docker-compose.yml')
const composeProject = `dev006g1-${randomUUID().slice(0, 8)}`
const migrationScript = join(orgRoot, 'scripts', 'dev006-orgmaster-migrate.mjs')
const bootstrapRoles = join(platformRoot, 'qa', 'dev-004', 'postgres', '000_bootstrap_roles.sql')
const platformMigration = join(platformRoot, 'db', 'migrations', '001_platform_auth_epoch_and_portal_sessions.sql')
const orgAuthMigration = join(orgRoot, 'db', 'migrations', '001_dev004_orgmaster_app_sessions.sql')
const persistenceMigration = join(orgRoot, 'db', 'migrations', '002_dev006_orgmaster_persistence.sql')
const runtimeRepositoryMigration = join(orgRoot, 'db', 'migrations', '003_dev006_orgmaster_runtime_repository.sql')
const activePrincipalMigration = join(orgRoot, 'db', 'migrations', '004_dev040_active_principal_view.sql')
const currentSourceRoot = process.env.DEV006_CURRENT_SOURCE_ROOT ? resolve(process.env.DEV006_CURRENT_SOURCE_ROOT) : orgRoot
const cases = []
let port = null
let containerId = null
let fatalError = null
let started = false

function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8') }
function sha256(value) { return createHash('sha256').update(value).digest('hex') }

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? orgRoot,
    encoding: 'utf8',
    input: options.input,
    env: options.env ?? process.env,
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
  })
}

async function canBind(portNumber) {
  return new Promise((done) => {
    const server = createServer()
    server.unref()
    server.once('error', () => done(false))
    server.listen({ host: '127.0.0.1', port: portNumber, exclusive: true }, () => server.close(() => done(true)))
  })
}

async function choosePort() {
  for (let candidate = 55425; candidate <= 55445; candidate += 1) if (await canBind(candidate)) return candidate
  throw new Error('NO_DEV006_FIXTURE_PORT')
}

async function waitForRelease(portNumber) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await canBind(portNumber)) return true
    await new Promise((done) => setTimeout(done, 250))
  }
  return false
}

function record(id, passed, detail = {}) {
  cases.push({ id, status: passed ? 'PASS' : 'FAIL', checkedAt: new Date().toISOString(), ...detail })
  if (!passed) throw new Error(`${id}_FAILED`)
}

function createFixture(root) {
  const data = join(root, 'data')
  const versions = join(data, 'orgmaster-versions')
  const media = join(data, 'orgmaster-management-method-media')
  mkdirSync(versions, { recursive: true })
  mkdirSync(media, { recursive: true })
  const currentId = 'current-fixture-v1'
  const draftId = 'draft-fixture-v1'
  const at = '2026-08-31T00:00:00.000Z'
  const manifest = {
    app: 'OrgMaster', workspaceVersion: 1, currentVersionId: currentId,
    entries: [
      { id: currentId, name: '現行版', kind: 'current', status: 'active', basedOnVersionId: null, createdAt: at, archivedAt: null },
      { id: draftId, name: 'Draft', kind: 'draft', status: 'active', basedOnVersionId: currentId, createdAt: at, archivedAt: null },
    ],
  }
  const liveManifest = JSON.parse(readFileSync(join(currentSourceRoot, 'data', 'orgmaster-workspace.v1.json'), 'utf8'))
  const liveCurrent = JSON.parse(readFileSync(join(currentSourceRoot, 'data', 'orgmaster-versions', `${liveManifest.currentVersionId}.json`), 'utf8'))
  const current = { ...liveCurrent, kind: 'document' }
  const draft = { ...liveCurrent, kind: 'draft' }
  const governance = { app: 'OrgMaster', schemaVersion: 2, draft: {}, activePolicyVersionId: null, publishedVersions: [], auditEvents: [], migration: { unresolvedAssignments: [], unresolvedDelegations: [] } }
  const methods = { app: 'OrgMasterManagementMethods', schemaVersion: 1, nextMethodNumber: 1, methods: [], mediaAssets: [], commandReceipts: [] }
  writeJson(join(data, 'orgmaster-workspace.v1.json'), manifest)
  writeJson(join(versions, `${currentId}.json`), current)
  writeJson(join(versions, `${draftId}.json`), draft)
  writeJson(join(data, 'orgmaster-governance.v2.json'), governance)
  writeJson(join(data, 'orgmaster-management-methods.v1.json'), methods)
  writeFileSync(join(media, 'fixture.png'), Buffer.from('DEV006_LOCAL_FIXTURE_MEDIA'))
}

function safeInventory(value) {
  return {
    contractVersion: value.contractVersion,
    sourceRevision: value.sourceRevision,
    artifactCount: value.artifactCount,
    mediaCount: value.mediaCount,
    sourceBytes: value.sourceBytes,
    legacy: value.legacy,
    artifacts: value.safeManifest.artifacts,
  }
}

function canonicalSourceSnapshot(sourceRoot) {
  const dataRoot = join(sourceRoot, 'data')
  const manifestPath = join(dataRoot, 'orgmaster-workspace.v1.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const paths = [
    manifestPath,
    join(dataRoot, 'orgmaster-governance.v2.json'),
    join(dataRoot, 'orgmaster-management-methods.v1.json'),
    ...manifest.entries.map((entry) => join(dataRoot, 'orgmaster-versions', `${entry.id}.json`)),
  ]
  const mediaRoot = join(dataRoot, 'orgmaster-management-method-media')
  if (existsSync(mediaRoot)) {
    for (const entry of readdirSync(mediaRoot, { withFileTypes: true })) if (entry.isFile()) paths.push(join(mediaRoot, entry.name))
  }
  return paths.sort().map((path) => {
    const stats = statSync(path)
    return {
      key: relative(sourceRoot, path).replaceAll('\\', '/'),
      bytes: stats.size,
      mtimeMs: stats.mtimeMs,
      sha256: sha256(readFileSync(path)),
    }
  })
}

function parseJsonOutput(result) {
  const line = result.stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1)
  if (!line) return null
  try { return JSON.parse(line) } catch { return null }
}

function compose(args, environment) { return run('docker', ['compose', '-p', composeProject, '-f', composeFile, ...args], { env: environment }) }

function runMigration(mode, sourceRoot, databaseUrl, extra = []) {
  const args = [migrationScript, '--mode', mode]
  if (sourceRoot) args.push('--source-root', sourceRoot)
  args.push(...extra)
  const result = run(process.execPath, args, { env: { ...process.env, ORGMASTER_DEV006_DATABASE_URL: databaseUrl } })
  return { process: result, payload: parseJsonOutput(result) }
}

function denied(result) { return result.status !== 0 && /permission denied|must be owner/iu.test(`${result.stdout}\n${result.stderr}`) }

async function main() {
  mkdirSync(evidenceRoot, { recursive: true })
  createFixture(fixtureRoot)
  port = await choosePort()
  const databaseUrl = `postgresql://postgres:dev006-local-fixture-only@127.0.0.1:${port}/jenfu_dev006`
  const composeEnvironment = { ...process.env, DEV006_POSTGRES_PORT: String(port) }
  const runtimePlan = {
    runId,
    project: composeProject,
    purpose: 'DEV-006 G1 local-isolated migration, idempotency, restart, grant and redaction QC',
    port: { host: port, container: 5432, hostAddress: '127.0.0.1' },
    owner: { task: 'DEV-006/G1', hostInvokerProcessId: process.pid, composeProject, composeService: 'postgres', image: 'postgres:17-alpine', containerId: null },
    cleanupCondition: 'Stop only this compose project with down -v --remove-orphans, remove generated fixture roots, and prove the host port is released.',
    recordedBeforeStartAt: new Date().toISOString(),
  }
  writeJson(join(evidenceRoot, 'runtime-plan.json'), runtimePlan)

  try {
    const fixtureFirst = await inventorySource(fixtureRoot)
    const fixtureSecond = await inventorySource(fixtureRoot)
    record('G1-INV-01', fixtureFirst.sourceRevision === fixtureSecond.sourceRevision && fixtureFirst.artifactCount === 5 && fixtureFirst.mediaCount === 1, { sourceRevision: fixtureFirst.sourceRevision, artifactCount: fixtureFirst.artifactCount, mediaCount: fixtureFirst.mediaCount })

    const actualFileStateBefore = canonicalSourceSnapshot(currentSourceRoot)
    const actualBefore = await inventorySource(currentSourceRoot)
    const actualAfter = await inventorySource(currentSourceRoot)
    const actualFileStateAfter = canonicalSourceSnapshot(currentSourceRoot)
    const fileStateUnchanged = JSON.stringify(actualFileStateBefore) === JSON.stringify(actualFileStateAfter)
    record('G1-INV-02', actualBefore.sourceRevision === actualAfter.sourceRevision && fileStateUnchanged, { sourceRevision: actualBefore.sourceRevision, artifactCount: actualBefore.artifactCount, mediaCount: actualBefore.mediaCount, legacy: actualBefore.legacy, checkedFileCount: actualFileStateBefore.length, bytesAndMtimeUnchanged: fileStateUnchanged, sourceMutationObserved: !fileStateUnchanged })
    writeJson(join(evidenceRoot, 'source-inventory.json'), { runId, status: 'PASS', fixture: safeInventory(fixtureFirst), currentSourceReadOnly: safeInventory(actualBefore) })

    const up = compose(['up', '-d', '--wait'], composeEnvironment)
    if (up.status !== 0) throw new Error('G1_RUNTIME_START_FAILED')
    started = true
    containerId = compose(['ps', '-q', 'postgres'], composeEnvironment).stdout.trim() || null
    runtimePlan.owner.containerId = containerId
    runtimePlan.startedAt = new Date().toISOString()
    writeJson(join(evidenceRoot, 'runtime-plan.json'), runtimePlan)

    for (const file of [bootstrapRoles, platformMigration, orgAuthMigration, persistenceMigration, runtimeRepositoryMigration, activePrincipalMigration, persistenceMigration, runtimeRepositoryMigration, activePrincipalMigration]) {
      const result = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: readFileSync(file, 'utf8') })
      if (result.status !== 0) throw new Error('G1_SCHEMA_APPLY_FAILED')
    }
    const runtimeLogin = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: "CREATE ROLE dev006_runtime_login LOGIN PASSWORD 'dev006-runtime-local-only' IN ROLE jenfu_orgmaster_runtime;" })
    if (runtimeLogin.status !== 0) throw new Error('G1_RUNTIME_LOGIN_SETUP_FAILED')

    const dryRun = runMigration('dry-run', fixtureRoot, databaseUrl)
    const authorityBefore = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: "SELECT count(*) FROM orgmaster.persistence_batches; SELECT count(*) FROM orgmaster.persistence_authority WHERE active_batch_id IS NOT NULL;" })
    record('G1-DRY-01', dryRun.process.status === 0 && dryRun.payload?.status === 'PASS' && dryRun.payload?.writes === 0 && authorityBefore.stdout.trim().split(/\r?\n/u).filter(Boolean).join(',') === '0,0', { writes: dryRun.payload?.writes ?? null, activeAuthority: false })

    const imported = runMigration('shadow-import', fixtureRoot, databaseUrl)
    record('G1-IMP-01', imported.process.status === 0 && imported.payload?.status === 'PASS' && imported.payload?.replayed === false && imported.payload?.batchStatus === 'shadow', { batchId: imported.payload?.batchId ?? null, sourceRevision: imported.payload?.sourceRevision ?? null, activeAuthority: false })

    const replayed = runMigration('shadow-import', fixtureRoot, databaseUrl)
    const batchCount = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: 'SELECT count(*) FROM orgmaster.persistence_batches;' })
    record('G1-IDEM-01', replayed.process.status === 0 && replayed.payload?.replayed === true && replayed.payload?.batchId === imported.payload?.batchId && batchCount.stdout.trim() === '1', { batchId: replayed.payload?.batchId ?? null, replayed: true, batchCount: 1 })

    cpSync(fixtureRoot, brokenRoot, { recursive: true })
    const brokenManifest = JSON.parse(readFileSync(join(brokenRoot, 'data', 'orgmaster-workspace.v1.json'), 'utf8'))
    brokenManifest.entries.push({ id: 'draft-missing', name: 'Missing', kind: 'draft', status: 'active', createdAt: '2026-08-31T00:00:00.000Z', archivedAt: null })
    writeJson(join(brokenRoot, 'data', 'orgmaster-workspace.v1.json'), brokenManifest)
    const failed = runMigration('shadow-import', brokenRoot, databaseUrl)
    const afterFailure = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: 'SELECT count(*) FROM orgmaster.persistence_batches; SELECT count(*) FROM orgmaster.persistence_authority WHERE active_batch_id IS NOT NULL;' })
    record('G1-FAIL-01', failed.process.status !== 0 && failed.payload?.status === 'FAIL' && afterFailure.stdout.trim().split(/\r?\n/u).filter(Boolean).join(',') === '1,0', { expectedFailure: true, code: failed.payload?.code ?? null, batchCount: 1, activeAuthority: false })

    const activated = runMigration('activate-isolated', null, databaseUrl, ['--source-revision', fixtureFirst.sourceRevision, '--target-class', 'local-isolated', '--allow-isolated-activation'])
    const activeRead = runMigration('read-active', null, databaseUrl)
    const runtimeIntegration = run(process.execPath, [join(orgRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'server/orgmasterCloudSqlPersistence.integration.test.ts'], { env: {
      ...process.env,
      ORGMASTER_DEV006_RUNTIME_INTEGRATION: '1',
      ORGMASTER_PERSISTENCE_MODE: 'cloud-sql',
      ORGMASTER_POSTGRES_URL: `postgresql://dev006_runtime_login:dev006-runtime-local-only@127.0.0.1:${port}/jenfu_dev006`,
    } })
    if (runtimeIntegration.status !== 0) process.stderr.write(`${runtimeIntegration.stdout ?? ''}\n${runtimeIntegration.stderr ?? ''}\n${runtimeIntegration.error?.message ?? ''}`)
    record('G1-ACT-01', activated.process.status === 0 && activeRead.process.status === 0 && activeRead.payload?.sourceRevision === fixtureFirst.sourceRevision && activeRead.payload?.canonicalSha256 === fixtureFirst.artifacts.find((item) => item.artifactKey === 'orgmaster-workspace.v1.json')?.canonicalSha256 && runtimeIntegration.status === 0, { batchId: activated.payload?.batchId ?? null, authorityVersion: activated.payload?.authorityVersion ?? null, sourceRevision: activeRead.payload?.sourceRevision ?? null, productRepositoryIntegration: runtimeIntegration.status === 0 ? 'PASS' : 'FAIL' })
    const postIntegrationRead = runMigration('read-active', null, databaseUrl)

    const restart = compose(['restart', 'postgres'], composeEnvironment)
    const ready = restart.status === 0 ? compose(['up', '-d', '--wait'], composeEnvironment) : restart
    const afterRestart = runMigration('read-active', null, databaseUrl)
    record('G1-RST-01', ready.status === 0 && postIntegrationRead.process.status === 0 && afterRestart.process.status === 0 && afterRestart.payload?.sourceRevision === postIntegrationRead.payload?.sourceRevision && afterRestart.payload?.canonicalSha256 === postIntegrationRead.payload?.canonicalSha256, { persisted: true, sourceRevision: afterRestart.payload?.sourceRevision ?? null })

    const runtimeFunction = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: "BEGIN; SET LOCAL ROLE jenfu_orgmaster_runtime; SELECT count(*) FROM orgmaster.read_active_persistence_artifact_v1('orgmaster-workspace.v1.json'); ROLLBACK;" })
    const runtimeWrite = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: `BEGIN;
      SET LOCAL ROLE jenfu_orgmaster_runtime;
      WITH current_artifact AS (
        SELECT * FROM orgmaster.read_active_persistence_artifact_v1('orgmaster-workspace.v1.json')
      )
      SELECT authority_version FROM current_artifact,
        LATERAL orgmaster.write_active_persistence_artifacts_v1(
          jsonb_build_array(jsonb_build_object(
            'artifactKey', current_artifact.artifact_key,
            'artifactKind', current_artifact.artifact_kind,
            'payload', current_artifact.payload,
            'expectedCanonicalSha256', current_artifact.canonical_sha256,
            'nextCanonicalSha256', current_artifact.canonical_sha256,
            'sourceSha256', current_artifact.source_sha256,
            'sourceBytes', current_artifact.source_bytes
          )),
          repeat('a', 64), 'dev006-g1-runtime', 'runtime_write_rollback_probe'
        );
      SELECT orgmaster.write_persistence_media_v1('orgmaster-management-method-media/g1-runtime.png', decode('89504e470d0a1a0a', 'hex'), 'image/png', repeat('b', 64));
      SELECT count(*) FROM orgmaster.read_persistence_media_v1('orgmaster-management-method-media/g1-runtime.png');
      SELECT orgmaster.delete_persistence_media_v1('orgmaster-management-method-media/g1-runtime.png');
      ROLLBACK;` })
    const directSelect = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: 'BEGIN; SET LOCAL ROLE jenfu_orgmaster_runtime; SELECT count(*) FROM orgmaster.persistence_artifacts; ROLLBACK;' })
    const directDml = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: "BEGIN; SET LOCAL ROLE jenfu_orgmaster_runtime; UPDATE orgmaster.persistence_authority SET reason_code='forbidden' WHERE singleton=true; ROLLBACK;" })
    const runtimeWriteLines = runtimeWrite.stdout.trim().split(/\r?\n/u).filter(Boolean)
    const runtimeAuthorityVersion = runtimeWriteLines.map(Number).find((value) => Number.isInteger(value) && value > 1)
    record('G1-GRANT-01', runtimeFunction.status === 0 && runtimeFunction.stdout.trim() === '1' && runtimeWrite.status === 0 && Boolean(runtimeAuthorityVersion) && runtimeWriteLines.includes('1') && denied(directSelect) && denied(directDml), { runtimeFunctionRows: 1, runtimeCasWriteRollbackProbe: true, runtimeMediaWriteReadDeleteRollbackProbe: true, directTableSelectDenied: true, directDmlDenied: true })

    const platformRead = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: "BEGIN; SET LOCAL ROLE jenfu_platform_runtime; SELECT * FROM orgmaster.read_active_persistence_artifact_v1('orgmaster-workspace.v1.json'); ROLLBACK;" })
    const aiPdmRead = run('docker', ['compose', '-p', composeProject, '-f', composeFile, 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'jenfu_dev006'], { env: composeEnvironment, input: "BEGIN; SET LOCAL ROLE jenfu_ai_pdm_runtime; SELECT * FROM orgmaster.read_active_persistence_artifact_v1('orgmaster-workspace.v1.json'); ROLLBACK;" })
    record('G1-GRANT-02', denied(platformRead) && denied(aiPdmRead), { platformRuntimeDenied: true, aiPdmRuntimeDenied: true })

    writeJson(join(evidenceRoot, 'postgres-results.json'), { runId, status: 'PASS', environment: 'local-isolated', contractVersion: 'jenfu.orgmaster-persistence.v1', cases: cases.filter((item) => !['G1-RED-01', 'G1-CLN-01'].includes(item.id)), p0Count: 0, p1Count: 0 })

  } catch (error) {
    fatalError = error instanceof Error ? error.message : 'UNKNOWN_FAILURE'
  } finally {
    const composeEnvironment = { ...process.env, ...(port ? { DEV006_POSTGRES_PORT: String(port) } : {}) }
    let downExitCode = null
    if (started) downExitCode = compose(['down', '-v', '--remove-orphans'], composeEnvironment).status
    const portReleased = port ? await waitForRelease(port) : true
    const containerRemaining = started ? compose(['ps', '-q'], composeEnvironment).stdout.trim() : ''
    const cleanupPass = downExitCode === 0 && portReleased && !containerRemaining
    try { record('G1-CLN-01', cleanupPass, { stoppedOnlyOwnedProject: true, downExitCode, portReleased, remainingContainerIds: containerRemaining ? containerRemaining.split(/\r?\n/u) : [], fixtureVolumeRemoved: downExitCode === 0 }) } catch (error) { fatalError ??= error instanceof Error ? error.message : 'G1_CLEANUP_FAILED' }
    rmSync(fixtureRoot, { recursive: true, force: true })
    rmSync(brokenRoot, { recursive: true, force: true })
    writeJson(join(evidenceRoot, 'cleanup.json'), { runId, status: cleanupPass ? 'PASS' : 'FAIL', composeProject, stoppedOnlyOwnedProject: true, downExitCode, remainingContainerIds: containerRemaining ? containerRemaining.split(/\r?\n/u) : [], fixtureVolumeRemoved: downExitCode === 0, hostPort: port, portReleased, generatedFixtureRootsRemoved: !existsSync(fixtureRoot) && !existsSync(brokenRoot), finishedAt: new Date().toISOString() })
  }

  const redactionFiles = ['runtime-plan.json', 'source-inventory.json', 'postgres-results.json', 'cleanup.json'].filter((file) => existsSync(join(evidenceRoot, file)))
  const forbidden = [/@/u, /postgres(?:ql)?:\/\//iu, /eyJ[A-Za-z0-9_-]{8,}/u, /cookie\s*[:=]/iu, /token\s*[:=]/iu]
  const failures = redactionFiles.filter((file) => forbidden.some((pattern) => pattern.test(readFileSync(join(evidenceRoot, file), 'utf8'))))
  try { record('G1-RED-01', redactionFiles.length === 4 && failures.length === 0, { checkedFiles: redactionFiles, failedFiles: failures }) } catch (error) { fatalError ??= error instanceof Error ? error.message : 'G1_REDACTION_FAILED' }
  writeJson(join(evidenceRoot, 'redaction-results.json'), { runId, status: redactionFiles.length === 4 && failures.length === 0 ? 'PASS' : 'FAIL', checkedFiles: redactionFiles, failedFiles: failures, categories: ['connection-string', 'email', 'provider-token', 'cookie-value'] })

  const status = fatalError === null && cases.length === 12 && cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL'
  writeJson(join(evidenceRoot, 'manifest.json'), { runId, devId: 'DEV-006', gate: 'G1', environment: 'local-isolated', status, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), contractVersion: 'jenfu.orgmaster-persistence.v1', fixedDenominator: 12, passed: cases.filter((item) => item.status === 'PASS').length, failed: cases.filter((item) => item.status === 'FAIL').length, p0Count: status === 'PASS' ? 0 : 1, p1Count: 0, failure: fatalError, evidenceFiles: ['runtime-plan.json', 'source-inventory.json', 'postgres-results.json', 'redaction-results.json', 'cleanup.json'], boundaries: { currentSourceReadOnly: true, productionCloudSqlTouched: false, firebaseTouched: false, deploymentOrReleaseTouched: false } })
  process.stdout.write(`${JSON.stringify({ status, runId, evidenceRoot, passed: cases.filter((item) => item.status === 'PASS').length, denominator: 12, failure: fatalError })}\n`)
  if (status !== 'PASS') process.exitCode = 1
}

await main()
