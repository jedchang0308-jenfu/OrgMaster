import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempPrefix = 'orgmaster-production-tool-packaging-'
const recipes = {
  migration: 'infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile',
  diagnostic: 'infra/google-cloud/dev-040-production-release/dev057-principal-pair-diagnostic.Dockerfile',
  catalog: 'infra/google-cloud/dev-040-production-release/dev057-v4-catalog-readback.Dockerfile',
}
const neutral = 'scripts/lib/orgmaster-production-database.mjs'
const catalogSnapshots = [
  'config/catalogs/ai-pdm-role-catalog.v5.json',
  'config/catalogs/ai-pdm-role-catalog.v6.json',
  'config/catalogs/ai-pdm-role-catalog.v7.json',
]
const historicalFixture = 'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'
const migrationEntries = [
  'scripts/dev040-production-migration-runner.mjs',
  'scripts/dev014-production-lifecycle-readback.mjs',
  'scripts/dev049-production-admission-runner.mjs',
  'scripts/dev014-production-managed-link-runner.mjs',
  'scripts/dev014-production-login-fixture-runner.mjs',
  'scripts/dev014-production-login-authority-switch-runner.mjs',
]
const diagnosticEntries = ['scripts/dev057-production-principal-pair-diagnostic-runner.mjs']
const catalogEntries = ['scripts/dev057-production-v4-catalog-readback-runner.mjs']

function inside(parent, target) {
  const relative = path.relative(parent, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function createStage() {
  const tempRoot = path.resolve(os.tmpdir())
  assert.equal(inside(repo, tempRoot), false, 'stage must not resolve through the repository')
  return mkdtemp(path.join(tempRoot, tempPrefix))
}

async function removeStage(root) {
  const resolved = path.resolve(root)
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith(tempPrefix))
  await rm(resolved, { recursive: true, force: true })
}

function copyLines(dockerfile) {
  return dockerfile.split(/\r?\n/u).map(line => line.trim())
    .filter(line => line.startsWith('COPY ')).map(line => {
      const parts = line.slice('COPY '.length).trim().split(/\s+/u)
      assert.ok(parts.length >= 2 && !parts[0].startsWith('--'), `unsupported COPY form: ${line}`)
      return { sources: parts.slice(0, -1), destination: parts.at(-1) }
    })
}

async function projectRecipe(recipe, stage, overrides = new Map()) {
  const dockerfile = await readFile(path.join(repo, recipe), 'utf8')
  const copies = copyLines(dockerfile)
  for (const { sources, destination } of copies) {
    for (const source of sources) {
      const sourcePath = path.resolve(repo, source)
      assert.ok(inside(repo, sourcePath), `COPY source escapes repository: ${source}`)
      const destinationIsDirectory = sources.length > 1 || destination === '.' || destination === './' || destination.endsWith('/')
      const destinationPath = path.resolve(stage, destinationIsDirectory
        ? path.join(destination, path.basename(source))
        : destination)
      assert.ok(inside(stage, destinationPath), `COPY destination escapes stage: ${destination}`)
      await mkdir(path.dirname(destinationPath), { recursive: true })
      if (overrides.has(source)) await writeFile(destinationPath, overrides.get(source))
      else await cp(sourcePath, destinationPath, { recursive: true, force: true })
    }
  }
  return { dockerfile, copies }
}

async function hasFile(root, relative) {
  try { return (await stat(path.join(root, relative))).isFile() } catch { return false }
}

async function stageImages() {
  const stages = {}
  try {
    for (const [name, recipe] of Object.entries(recipes)) {
      const root = await createStage()
      stages[name] = { root }
      Object.assign(stages[name], await projectRecipe(recipe, root))
    }
    return stages
  } catch (error) {
    await Promise.all(Object.values(stages).map(({ root }) => removeStage(root)))
    throw error
  }
}

async function withStages(callback) {
  const stages = await stageImages()
  try { await callback(stages) } finally {
    await Promise.all(Object.values(stages).map(({ root }) => removeStage(root)))
  }
}

function safeEnvironment() {
  const env = {}
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function runNode(stage, source, { transformTypes = false } = {}) {
  const args = [
    ...(transformTypes ? ['--experimental-transform-types'] : []),
    '--input-type=module', '-e', source,
  ]
  const result = spawnSync(process.execPath, args, {
    cwd: stage, env: safeEnvironment(), encoding: 'utf8', windowsHide: true,
  })
  if (result.error) throw result.error
  return result
}

async function listFiles(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.isFile()) files.push(path.relative(root, target).split(path.sep).join('/'))
    }
  }
  await visit(root)
  return files.sort()
}

function discoverLockedPg() {
  const packageDirectory = 'infra/google-cloud/dev-040-production-release/migration-runner'
  const lock = JSON.parse(requireText(path.join(repo, packageDirectory, 'package-lock.json')))
  const candidates = [
    process.env.ORGMASTER_PRODUCTION_TOOL_NODE_MODULES,
    path.join(repo, packageDirectory, 'node_modules'),
    path.join(repo, 'node_modules'),
  ].filter(Boolean)
  for (const nodeModules of candidates) {
    if (!path.isAbsolute(nodeModules)) continue
    let valid = true
    for (const [key, locked] of Object.entries(lock.packages ?? {})) {
      if (!key.startsWith('node_modules/')) continue
      const installed = path.join(nodeModules, ...key.slice('node_modules/'.length).split('/'))
      try {
        const actual = JSON.parse(requireText(path.join(installed, 'package.json')))
        if (actual.version !== locked.version) { valid = false; break }
      } catch {
        if (!locked.optional) { valid = false; break }
      }
    }
    if (valid) return { nodeModules, lock, reason: '' }
  }
  return { nodeModules: '', lock, reason: `No installed pg dependency closure matches lockfile pg ${lock.packages['node_modules/pg']?.version}` }
}

function requireText(file) {
  return readFileSync(file, 'utf8')
}

async function copyLockedPg(stage, installation) {
  const destinationRoot = path.join(stage, 'node_modules')
  for (const [key, locked] of Object.entries(installation.lock.packages ?? {})) {
    if (!key.startsWith('node_modules/')) continue
    const relative = key.slice('node_modules/'.length)
    const source = path.join(installation.nodeModules, ...relative.split('/'))
    const destination = path.join(destinationRoot, ...relative.split('/'))
    try {
      const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
      assert.equal(metadata.version, locked.version, `${key} must match package-lock.json`)
      await mkdir(path.dirname(destination), { recursive: true })
      await cp(source, destination, { recursive: true, force: true })
    } catch (error) {
      if (locked.optional && error?.code === 'ENOENT') continue
      throw error
    }
  }
}

test('production tool stages are the direct projections of all three Docker COPY recipes', async () => {
  await withStages(async stages => {
    for (const name of Object.keys(recipes)) {
      const entrypointLine = stages[name].dockerfile.split(/\r?\n/u).find(line => line.trim().startsWith('ENTRYPOINT '))
      assert.ok(entrypointLine, `${name} recipe has an ENTRYPOINT`)
      const command = JSON.parse(entrypointLine.trim().slice('ENTRYPOINT '.length))
      const entrypoint = command.at(-1)
      assert.equal(await hasFile(stages[name].root, entrypoint), true, `${name} ENTRYPOINT is staged`)
      assert.equal(await hasFile(stages[name].root, neutral), true, `${name} stages the neutral database module`)
    }
    for (const snapshot of catalogSnapshots) assert.equal(await hasFile(stages.catalog.root, snapshot), true, snapshot)
    assert.equal(await hasFile(stages.catalog.root, historicalFixture), true)
    assert.equal(await hasFile(stages.diagnostic.root, 'scripts/dev040-production-migration-runner.mjs'), false,
      'diagnostic image must not contain migration-only policy')
    assert.equal(await hasFile(stages.catalog.root, 'scripts/dev040-production-migration-runner.mjs'), false,
      'catalog image must not contain migration-only policy')

    const diagnosticFiles = await listFiles(stages.diagnostic.root)
    const diagnosticContents = await Promise.all(diagnosticFiles.map(async file => [
      file, (await readFile(path.join(stages.diagnostic.root, file))).toString('base64'),
    ]))
    const mutation = new Map([['scripts/dev040-production-migration-runner.mjs', Buffer.from('migration-only policy mutation')]])
    const mutatedStage = await createStage()
    try {
      await projectRecipe(recipes.diagnostic, mutatedStage, mutation)
      const mutatedFiles = await listFiles(mutatedStage)
      const mutatedContents = await Promise.all(mutatedFiles.map(async file => [
        file, (await readFile(path.join(mutatedStage, file))).toString('base64'),
      ]))
      assert.deepEqual(mutatedContents, diagnosticContents,
        'changing a file absent from the diagnostic COPY recipe cannot change its staged artifact')
    } finally { await removeStage(mutatedStage) }
  })
})

test('catalog database reader validates staged v5/v6/v7 snapshots and fails closed when each is absent', async () => {
  const positive = await createStage()
  try {
    await projectRecipe(recipes.catalog, positive)
    const source = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { readFile } from 'node:fs/promises';
      import { pathToFileURL } from 'node:url';
      const files = ${JSON.stringify(catalogSnapshots)};
      const asRows = catalog => catalog.roles.map((role, display_order) => ({
        contract_version: catalog.contractVersion, application_id: catalog.applicationId,
        catalog_version: catalog.catalogVersion, published_at: catalog.publishedAt,
        catalog_sha256: catalog.catalogSha256, display_order, stable_role_id: role.stableRoleId,
        role_code: role.roleCode, display_name: role.displayName, assignable: role.assignable,
        risk: role.risk, subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
        delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
        assignment_tier: role.assignmentTier, permissions: role.permissions, metadata: role.metadata ?? null,
        role_definition_hash: role.roleDefinitionHash,
      }));
      const { readPublishedAiPdmRoleCatalogFromDatabase } = await import(pathToFileURL(path.join(process.cwd(), 'server/aiPdmRoleCatalogRepository.ts')));
      for (const file of files) {
        const catalog = JSON.parse(await readFile(path.join(process.cwd(), file), 'utf8'));
        const rows = asRows(catalog);
        const actual = await readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) });
        assert.equal(actual.catalogSha256, catalog.catalogSha256);
        assert.equal(actual.catalogVersion, catalog.catalogVersion);
      }
    `
    const result = runNode(positive, source, { transformTypes: true })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  } finally { await removeStage(positive) }

  for (const snapshot of catalogSnapshots) {
    const stage = await createStage()
    try {
      await projectRecipe(recipes.catalog, stage)
      const source = `
        import assert from 'node:assert/strict';
        import path from 'node:path';
        import { readFile, rm } from 'node:fs/promises';
        import { pathToFileURL } from 'node:url';
        const file = ${JSON.stringify(snapshot)};
        const catalog = JSON.parse(await readFile(path.join(process.cwd(), file), 'utf8'));
        const rows = catalog.roles.map((role, display_order) => ({
          contract_version: catalog.contractVersion, application_id: catalog.applicationId,
          catalog_version: catalog.catalogVersion, published_at: catalog.publishedAt,
          catalog_sha256: catalog.catalogSha256, display_order, stable_role_id: role.stableRoleId,
          role_code: role.roleCode, display_name: role.displayName, assignable: role.assignable,
          risk: role.risk, subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
          delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
          assignment_tier: role.assignmentTier, permissions: role.permissions, metadata: role.metadata ?? null,
          role_definition_hash: role.roleDefinitionHash,
        }));
        await rm(path.join(process.cwd(), file));
        const { readPublishedAiPdmRoleCatalogFromDatabase } = await import(pathToFileURL(path.join(process.cwd(), 'server/aiPdmRoleCatalogRepository.ts')));
        await assert.rejects(readPublishedAiPdmRoleCatalogFromDatabase({ query: async () => ({ rows }) }), /EXTERNAL_CATALOG_UNAVAILABLE/u);
      `
      const result = runNode(stage, source, { transformTypes: true })
      assert.equal(result.status, 0, `${snapshot}: ${result.stderr || result.stdout}`)
    } finally { await removeStage(stage) }
  }
})

test('isolated pg imports, entrypoint guards, lifecycle modes, v2 readback, and deferred catalog fixture', async () => {
  const installation = discoverLockedPg()
  if (!installation.nodeModules) assert.fail(installation.reason)

  const stages = await stageImages()
  try {
    for (const stage of Object.values(stages)) await copyLockedPg(stage.root, installation)
    const neutralPath = path.join(stages.diagnostic.root, neutral)
    const neutralBytes = await readFile(neutralPath)
    await rm(neutralPath)
    const missingNeutralImport = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      await assert.rejects(import(pathToFileURL(path.join(process.cwd(), ${JSON.stringify(diagnosticEntries[0])}))), error =>
        error?.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('orgmaster-production-database.mjs'));
    `
    const missingNeutralResult = runNode(stages.diagnostic.root, missingNeutralImport)
    assert.equal(missingNeutralResult.status, 0, missingNeutralResult.stderr || missingNeutralResult.stdout)
    await writeFile(neutralPath, neutralBytes)

    const pgImportSmoke = entries => `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      const pg = await import('pg');
      assert.equal(typeof (pg.default?.Client ?? pg.Client), 'function');
      const entries = ${JSON.stringify(entries)};
      for (const entry of entries) await import(pathToFileURL(path.join(process.cwd(), entry)));
    `
    const migrationReadbackSmoke = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      const lifecycle = await import(pathToFileURL(path.join(process.cwd(), 'scripts/dev014-production-lifecycle-readback.mjs')));
      const v2 = await import(pathToFileURL(path.join(process.cwd(), 'scripts/lib/dev014-lifecycle-v2-readback.mjs')));
      let networkCalls = 0, clientConstructions = 0;
      const blockedFetch = async () => { networkCalls++; throw new Error('NETWORK_FORBIDDEN'); };
      class Client { constructor() { clientConstructions++; throw new Error('DATABASE_FORBIDDEN'); } }
      const guards = [
        ['scripts/dev040-production-migration-runner.mjs', 'MIGRATION_ARGUMENT'],
        ['scripts/dev014-production-lifecycle-readback.mjs', 'DEV014_LIFECYCLE_READBACK_ARG_INVALID'],
        ['scripts/dev049-production-admission-runner.mjs', 'DEV049_ADMISSION_ARGUMENT_INVALID'],
      ];
      for (const [entry, errorText] of guards) {
        const module = await import(pathToFileURL(path.join(process.cwd(), entry)));
        await assert.rejects(module.runMain({ argv: [], environment: {}, fetchImpl: blockedFetch, Client }), new RegExp(errorText));
      }
      assert.equal(networkCalls, 0);
      assert.equal(clientConstructions, 0);

      for (const mode of ['migrator', 'runtime']) {
        const login = mode === 'runtime' ? 'orgmaster-prod-runtime@jenfu-platform-prod.iam' : 'orgmaster-prod-migrator@jenfu-platform-prod.iam';
        const db = { query: async sql => sql.includes('SELECT current_database()')
          ? { rows: [{ database: 'jenfu_prod', session_user: login, effective_user: login, transaction_read_only: 'on' }] }
          : { rows: [] } };
        const snapshot = await lifecycle.readLifecycleSnapshot(db, mode);
        assert.equal(snapshot.mode, mode);
        assert.equal(snapshot.databaseWrites, 0);
      }
      let roleSet = false;
      const v2Db = { query: async sql => {
        if (sql.startsWith('SET LOCAL ROLE')) { roleSet = true; return { rows: [] }; }
        if (sql.includes('SELECT current_database()')) return { rows: [{ database: 'jenfu_prod',
          session_user: 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
          effective_user: roleSet ? 'jenfu_orgmaster_migrator' : 'orgmaster-prod-migrator@jenfu-platform-prod.iam',
          transaction_read_only: 'on' }] };
        return { rows: [] };
      } };
      await assert.rejects(v2.readLifecycleV2EventSnapshot(v2Db, { employeeNumber: 'JFS9014', operationId: 'packaging-smoke' }),
        /DEV014_LIFECYCLE_V2_READBACK_EVENT_NOT_FOUND/u);
    `
    for (const name of ['migration', 'diagnostic', 'catalog']) {
      const entries = name === 'migration' ? migrationEntries : name === 'diagnostic' ? diagnosticEntries : catalogEntries
      const result = runNode(stages[name].root, pgImportSmoke(entries), { transformTypes: name === 'catalog' })
      assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`)
    }
    const migrationResult = runNode(stages.migration.root, migrationReadbackSmoke)
    assert.equal(migrationResult.status, 0, migrationResult.stderr || migrationResult.stdout)

    const catalogGuard = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      const module = await import(pathToFileURL(path.join(process.cwd(), 'scripts/dev057-production-v4-catalog-readback-runner.mjs')));
      await assert.rejects(module.runMain({ argv: [], environment: {}, fetchImpl: async () => { throw new Error('NETWORK_FORBIDDEN'); }, Client: class { constructor() { throw new Error('DATABASE_FORBIDDEN'); } } }), /DEV057_READBACK_ARGUMENT_INVALID/u);
    `
    const catalogGuardResult = runNode(stages.catalog.root, catalogGuard, { transformTypes: true })
    assert.equal(catalogGuardResult.status, 0, catalogGuardResult.stderr || catalogGuardResult.stdout)

    const diagnosticGuard = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';
      const module = await import(pathToFileURL(path.join(process.cwd(), 'scripts/dev057-production-principal-pair-diagnostic-runner.mjs')));
      await assert.rejects(module.runMain({ argv: [], environment: {}, fetchImpl: async () => { throw new Error('NETWORK_FORBIDDEN'); }, Client: class { constructor() { throw new Error('DATABASE_FORBIDDEN'); } } }), /DEV057_PAIR_DIAGNOSTIC_/u);
    `
    const diagnosticGuardResult = runNode(stages.diagnostic.root, diagnosticGuard)
    assert.equal(diagnosticGuardResult.status, 0, diagnosticGuardResult.stderr || diagnosticGuardResult.stdout)

    // The full runner uses fake DB and GCS boundaries; its default readFixture remains untouched.
    const entrypoint = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { readFile } from 'node:fs/promises';
      import { pathToFileURL } from 'node:url';
      import { crc32cBase64 } from './scripts/lib/dev012-production-migration-runner.mjs';
      const catalog = JSON.parse(await readFile(path.join(process.cwd(), ${JSON.stringify(catalogSnapshots[0])}), 'utf8'));
      const rows = catalog.roles.map((role, display_order) => ({
        contract_version: catalog.contractVersion, application_id: catalog.applicationId,
        catalog_version: catalog.catalogVersion, published_at: catalog.publishedAt,
        catalog_sha256: catalog.catalogSha256, display_order, stable_role_id: role.stableRoleId,
        role_code: role.roleCode, display_name: role.displayName, assignable: role.assignable,
        risk: role.risk, subject_kind: role.subjectKind, recommendation_allowed: role.recommendationAllowed,
        delegation_allowed: role.delegationAllowed, allowed_scope_kinds: role.allowedScopeKinds,
        assignment_tier: role.assignmentTier, permissions: role.permissions, metadata: role.metadata ?? null,
        role_definition_hash: role.roleDefinitionHash,
      }));
      const module = await import(pathToFileURL(path.join(process.cwd(), 'scripts/dev057-production-v4-catalog-readback-runner.mjs')));
      const target = await import(pathToFileURL(path.join(process.cwd(), 'scripts/lib/orgmaster-production-database.mjs')));
      const revision = 'a'.repeat(40);
      const args = ['--source-revision', revision, '--output-ref', 'gs://' + target.TARGET.releaseBucket + '/receipts/releases/DEV057-V4-CONSUMER-READBACK/packaging-smoke.json'];
      const environment = { SOURCE_REVISION: revision, OWNER_APPLICATION_ID: target.TARGET.ownerApplicationId,
        RELEASE_BUCKET: target.TARGET.releaseBucket, GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
        GOOGLE_CLOUD_REGION: 'asia-east1', CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
        POSTGRES_DATABASE: 'jenfu_prod', POSTGRES_IAM_LOGIN: target.TARGET.login,
        POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
        CLOUD_RUN_JOB: 'orgmaster-prod-dev057-v4-catalog-readback' };
      let uploaded = Buffer.alloc(0), queries = 0;
      class FakeClient {
        async connect() {}
        async end() {}
        async query(sql) {
          queries++;
          if (sql.includes('FROM ai_pdm_contract.v_application_role_catalog_v2')) return { rows };
          if (sql.includes('read_active_persistence_artifact_v1')) return { rows: [{
            payload: { publishedVersions: [{ id: 'policy-v1', kind: 'assignment-governance-v3', policy: { roleAssignments: [] } }], activePolicyVersionId: 'policy-v1', draft: { roleAssignments: [] } },
            source_sha256: 'b'.repeat(64) }] };
          return { rows: [] };
        }
      }
      const fetchImpl = async (raw, init = {}) => {
        const url = new URL(raw);
        if (url.hostname === 'metadata.google.internal') return new Response(JSON.stringify({ access_token: 'packaging-smoke-token-123456', expires_in: 3600 }));
        if (init.method === 'POST') { uploaded = Buffer.from(init.body); return new Response(JSON.stringify({ generation: '1' })); }
        if (url.searchParams.get('alt') === 'media') return new Response(uploaded);
        return new Response(JSON.stringify({ generation: '1', crc32c: crc32cBase64(uploaded) }));
      };
      const result = await module.runMain({ argv: args, environment, fetchImpl, Client: FakeClient });
      assert.equal(result.catalogVersion, catalog.catalogVersion);
      assert.ok(queries > 0);
      await (await import('node:fs/promises')).rm(path.join(process.cwd(), ${JSON.stringify(historicalFixture)}));
      await assert.rejects(module.runMain({ argv: args, environment, fetchImpl, Client: FakeClient }), error => error?.code === 'ENOENT');
    `
    const result = runNode(stages.catalog.root, entrypoint, { transformTypes: true })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  } finally {
    await Promise.all(Object.values(stages).map(({ root }) => removeStage(root)))
  }
})
