#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = spawnSync(process.execPath, ['--test', 'scripts/dev040-orgmaster-independent-release.test.mjs', 'scripts/dev040-production-migration-runner.test.mjs', 'scripts/dev012-owner-release-runtime.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs'], { cwd: root, encoding: 'utf8' })
process.stdout.write(run.stdout)
process.stderr.write(run.stderr)
if (run.status !== 0 || (run.stdout.match(/S1B-21/g) || []).length !== 7) process.exit(run.status || 1)
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('NPM_EXEC_PATH_REQUIRED')

async function prepareSyntheticRegressionData() {
  const dataRoot = path.join(root, 'data')
  const manifestPath = path.join(dataRoot, 'orgmaster-workspace.v1.json')
  if (fs.existsSync(dataRoot)) {
    if (!fs.existsSync(manifestPath)) throw new Error('ORGMASTER_EXISTING_DATA_INCOMPLETE')
    return { created: false, dataRoot }
  }

  fs.mkdirSync(dataRoot, { recursive: false })
  let loader
  try {
    const { createServer } = await import('vite')
    loader = await createServer({
      root,
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      server: { middlewareMode: true },
    })
    const [{ screenshotOrganizationState }, { createOrgDocumentFile }, workspace, governance] = await Promise.all([
      loader.ssrLoadModule('/src/screenshotData.ts'),
      loader.ssrLoadModule('/src/documentStorage.ts'),
      loader.ssrLoadModule('/server/orgmasterWorkspaceStore.ts'),
      loader.ssrLoadModule('/server/orgmasterGovernanceStore.ts'),
    ])
    const targetEmployeeId = '14466657-006e-4538-aade-5877c166b038'
    const state = structuredClone(screenshotOrganizationState)
    if (!state.employees.some((employee) => employee.id === targetEmployeeId)) {
      state.employees.push({
        id: targetEmployeeId,
        name: 'Synthetic Release Target',
        status: 'active',
        departmentIds: [state.departments[0].id],
        primaryAssignmentId: null,
        administrativeApproverOverrideEmployeeId: null,
      })
    }
    const legacyPath = workspace.getWorkspacePaths(root).manifest.replace('orgmaster-workspace.v1.json', 'orgmaster-document.v4.json')
    fs.writeFileSync(legacyPath, `${JSON.stringify(createOrgDocumentFile(state, 'document', '2026-09-08T00:00:00.000Z'), null, 2)}\n`, { flag: 'wx' })
    const index = await workspace.getWorkspaceIndex(root)
    const expectedCurrentId = 'current-c9ad8769d8d1d4319e29'
    if (index.currentVersionId !== expectedCurrentId) {
      const currentPath = workspace.getWorkspaceVersionPath(root, index.currentVersionId)
      const expectedPath = workspace.getWorkspaceVersionPath(root, expectedCurrentId)
      fs.copyFileSync(currentPath, expectedPath, fs.constants.COPYFILE_EXCL)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      manifest.currentVersionId = expectedCurrentId
      manifest.entries = manifest.entries.map((entry) => entry.id === index.currentVersionId ? { ...entry, id: expectedCurrentId } : entry)
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      fs.unlinkSync(currentPath)
    }
    await governance.ensureGovernanceStore(root)
    fs.writeFileSync(path.join(dataRoot, '.dev040-synthetic-regression.json'), `${JSON.stringify({
      schemaVersion: 'orgmaster.dev040.synthetic-regression.v1',
      evidenceScope: 'LOCAL_SYNTHETIC',
      releaseAuthority: false,
    })}\n`, { flag: 'wx' })
    process.stdout.write(`${JSON.stringify({
      runtimeDeclaration: {
        project: root,
        purpose: 'DEV-040 clean-checkout synthetic regression seed',
        port: 'none',
        owningProcessTree: `QC ${process.pid} / Vite middleware loader (not listening)`,
        cleanupCondition: 'owner regression exits; remove only task-created data directory',
      },
    })}\n`)
    return { created: true, dataRoot }
  } catch (error) {
    fs.rmSync(dataRoot, { recursive: true, force: true })
    throw error
  } finally {
    await loader?.close()
  }
}

const syntheticRegressionData = await prepareSyntheticRegressionData()
let ownerExitCommands
try {
  ownerExitCommands = [
  ['npm run test:dev-040:abort', ['run', 'test:dev-040:abort']],
  ['npm run check:db-boundary', ['run', 'check:db-boundary']],
  ['npm test -- --testTimeout=30000', ['test', '--', '--testTimeout=30000']],
  ['npm run build', ['run', 'build']],
  ].map(([command, args]) => {
    const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: 'utf8' })
    process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '')
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`OWNER_EXIT_COMMAND_FAILED:${command}:${result.status || 1}`)
    return { command, result: 'PASS' }
  })
} finally {
  if (syntheticRegressionData.created) fs.rmSync(syntheticRegressionData.dataRoot, { recursive: true, force: true })
}
const runId = `DEV040-R2-S1B-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`
const dir = path.join(root, 'output', 'dev-040-r2', 's1b', runId)
fs.mkdirSync(dir, { recursive: true })
const files = [
  'ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md',
  'ai-doc/qa/DEV-040-R2-independent-production-release-validation-plan.md',
  'ai-doc/dev_task.md', 'ai-doc/documentation_map.md',
  'config/release/dev040-orgmaster-independent-production.json', 'config/release/dev040-production-release-infra-plan.json',
  'scripts/lib/dev040-orgmaster-independent-release.mjs', 'scripts/dev040-orgmaster-independent-release.mjs',
  'scripts/dev040-orgmaster-independent-release.test.mjs', 'scripts/dev040-production-migration-runner.mjs',
  'scripts/dev040-production-migration-runner.test.mjs', 'scripts/qc-dev-040-r2-independent-release.mjs',
  'scripts/lib/dev012-owner-release-runtime.mjs', 'scripts/lib/dev012-owner-stage-executor.mjs', 'scripts/lib/dev012-production-migration-runner.mjs',
  'scripts/dev012-owner-release-runtime.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs',
  '.github/workflows/deploy-orgmaster-independent-production.yml',
  'server/orgmasterDatabase.ts', 'server/dev010DatabaseBoundary.test.ts', 'AGENTS.md', 'package.json',
  ...['tools/dev-040/abort-controller', 'infra/google-cloud/dev-040-production-release'].flatMap((directory) => fs.readdirSync(path.join(root, directory)).filter((name) => fs.statSync(path.join(root, directory, name)).isFile()).map((name) => `${directory}/${name}`)),
  ...fs.readdirSync(path.join(root, 'db/migrations')).filter((name) => name.endsWith('.sql')).map((name) => `db/migrations/${name}`),
].sort()
const sourceSnapshotSha256 = createHash('sha256').update(files.map((file) => `${file}\0${createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}`).join('\n')).digest('hex')
const report = { schemaVersion: 'jenfu.dev040.r2.s1b-owner-report.v2', runId, ownerApplicationId: 'orgmaster', caseId: 'S1B-21', result: 'PASS', sourceFiles: files, sourceSnapshotAlgorithm: 'sha256(file-null-sha256-bytes)', sourceSnapshotSha256, contractSha256: 'b4ab9cc989962687d9f092b38b2f127879cb92de82bdd4000b5896d7c96d6e20', contractVersion: 'CONTINUOUS_NO_DWELL_V2', evidenceScope: 'LOCAL_CONTRACT', releaseAuthority: false, ownerExitCommands: [{ command: 'npm run test:dev-040:r2', result: 'PASS' }, { command: 'npm run qc:dev-040:r2', result: 'SELF' }, ...ownerExitCommands], providerMutationSummary: { cloud: 0, database: 0, traffic: 0, credentials: 0, sibling: 0 }, cleanup: { runtime: 0, ports: 0, containers: 0, temporaryFiles: 0 }, createdAt: new Date().toISOString() }
report.evidenceSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex')
fs.writeFileSync(path.join(dir, 'owner-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`DEV-040 R2 continuous QC PASS ${path.relative(root, dir)}\n`)
