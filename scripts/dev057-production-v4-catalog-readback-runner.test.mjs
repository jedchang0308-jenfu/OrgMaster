import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  AI_PDM_ROLE_CATALOG_V6_VERSION,
  AI_PDM_ROLE_CATALOG_V7_VERSION,
  AI_PDM_ROLE_CATALOG_VERSION,
  readPublishedAiPdmRoleCatalog,
  readPublishedAiPdmRoleCatalogFromDatabase,
} from '../server/aiPdmRoleCatalogRepository.ts'
import { TARGET } from './lib/orgmaster-production-database.mjs'
import { parseArgs, runMain, summarizeGovernance } from './dev057-production-v4-catalog-readback-runner.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const current = JSON.parse(fs.readFileSync(path.join(root,
  'config/catalogs/ai-pdm-role-catalog.v5.json'), 'utf8'))
const historical = JSON.parse(fs.readFileSync(path.join(root,
  'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'), 'utf8'))
const row = (version) => ({ applicationId: 'ai-pdm', roleId: 'role-rd',
  roleCodeSnapshot: 'rd', roleNameSnapshot: '研發人員', catalogVersion: version,
  scope: { kind: 'workspace', value: 'current' } })
const document = (assignments) => ({ activePolicyVersionId: 'published-1',
  publishedVersions: [{ id: 'published-1', kind: 'assignment-governance-v3',
    policy: { roleAssignments: assignments } }],
  draft: { roleAssignments: assignments } })
const catalogVersions = [AI_PDM_ROLE_CATALOG_VERSION,
  AI_PDM_ROLE_CATALOG_V6_VERSION, AI_PDM_ROLE_CATALOG_V7_VERSION]

function databaseRows(catalog) {
  return catalog.roles.map((role, displayOrder) => ({
    contract_version: catalog.contractVersion,
    application_id: catalog.applicationId,
    catalog_version: catalog.catalogVersion,
    published_at: catalog.publishedAt,
    catalog_sha256: catalog.catalogSha256,
    display_order: displayOrder,
    stable_role_id: role.stableRoleId,
    role_code: role.roleCode,
    display_name: role.displayName,
    assignable: role.assignable,
    risk: role.risk,
    subject_kind: role.subjectKind,
    recommendation_allowed: role.recommendationAllowed,
    delegation_allowed: role.delegationAllowed,
    allowed_scope_kinds: role.allowedScopeKinds,
    assignment_tier: role.assignmentTier,
    permissions: role.permissions,
    metadata: role.metadata ?? null,
    role_definition_hash: role.roleDefinitionHash,
  }))
}

test('readback accepts only exact target and source-bound output', () => {
  const args = ['--source-revision', 'a'.repeat(40), '--output-ref',
    'gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-V4-CONSUMER-READBACK/one.json']
  assert.equal(parseArgs(args).sourceRevision, 'a'.repeat(40))
  assert.throws(() => parseArgs([...args.slice(0, 3),
    'gs://other/receipts/releases/DEV057-V4-CONSUMER-READBACK/one.json']))
  assert.throws(() => parseArgs([...args, '--extra', '1']))
})

test('readback rejects a mismatched production database before requesting credentials or opening a client', async () => {
  const sourceRevision = 'b'.repeat(40)
  const argv = ['--source-revision', sourceRevision, '--output-ref',
    `gs://${TARGET.releaseBucket}/receipts/releases/DEV057-V4-CONSUMER-READBACK/target-check.json`]
  const environment = {
    SOURCE_REVISION: sourceRevision,
    OWNER_APPLICATION_ID: TARGET.ownerApplicationId,
    RELEASE_BUCKET: TARGET.releaseBucket,
    GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
    GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    POSTGRES_DATABASE: 'jenfu_stg',
    POSTGRES_IAM_LOGIN: TARGET.login,
    POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    CLOUD_RUN_JOB: 'orgmaster-prod-dev057-v4-catalog-readback',
  }
  let fetchCalls = 0
  let clientConstructions = 0
  class Client {
    constructor() { clientConstructions += 1 }
  }

  await assert.rejects(runMain({
    argv,
    environment,
    fetchImpl: async () => { fetchCalls += 1; throw new Error('network must not be reached') },
    Client,
  }), /MIGRATION_PRODUCTION_TARGET_MISMATCH/u)
  assert.equal(fetchCalls, 0)
  assert.equal(clientConstructions, 0)
})

test('historical v3 assignments remain valid against the active v5 role semantics', () => {
  const result = summarizeGovernance(document([row(historical.catalogVersion)]), current, historical)
  assert.deepEqual(result, { active: { historicalV3: 1, currentV4: 0 },
    draft: { historicalV3: 1, currentV4: 0 } })
  assert.deepEqual(summarizeGovernance(document([row(current.catalogVersion)]), current, historical).active,
    { historicalV3: 0, currentV4: 1 })
  assert.throws(() => summarizeGovernance(document([{
    ...row(historical.catalogVersion), scope: { kind: 'global' } }]), current, historical))
  assert.throws(() => summarizeGovernance(document([{
    ...row(historical.catalogVersion), roleNameSnapshot: '猜測角色' }]), current, historical))
})

test('operator package uses locked runtime and includes every imported source', () => {
  const dockerfile = fs.readFileSync(path.join(root,
    'infra/google-cloud/dev-040-production-release/dev057-v4-catalog-readback.Dockerfile'), 'utf8')
  for (const source of ['scripts/lib/dev012-production-migration-runner.mjs',
    'scripts/lib/orgmaster-production-database.mjs',
    'scripts/dev057-production-v4-catalog-readback-runner.mjs',
    'server/aiPdmRoleCatalogRepository.ts',
    'config/catalogs/ai-pdm-role-catalog.v5.json',
    'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json']) {
    assert.match(dockerfile, new RegExp(`COPY ${source.replaceAll('.', '\\.')} `))
  }
  assert.match(dockerfile, /USER node/u)
  assert.match(dockerfile, /SOURCE_REVISION=\$\{SOURCE_REVISION\}/u)
})

test('application and readback images package every catalog selected by the approved v5/v6/v7 reader', async () => {
  for (const recipe of ['Dockerfile', 'infra/google-cloud/dev-040-production-release/dev057-v4-catalog-readback.Dockerfile']) {
    const dockerfile = fs.readFileSync(path.join(root, recipe), 'utf8')
    const copies = dockerfile.split(/\r?\n/u).filter((line) => line.startsWith('COPY '))
    for (const catalogVersion of catalogVersions) {
      const catalog = await readPublishedAiPdmRoleCatalog(root, catalogVersion)
      const catalogPath = path.relative(root, catalog.sourcePath).split(path.sep).join('/')
      assert.ok(fs.existsSync(path.join(root, catalogPath)))
      assert.ok(copies.some((line) => {
        const parts = line.trim().split(/\s+/u)
        const source = parts.at(-2)?.replaceAll('\\', '/')
        const destination = parts.at(-1)?.replace(/^\.\//u, '').replaceAll('\\', '/')
        return parts.length >= 3 && (source === catalogPath || source?.endsWith(`/${catalogPath}`)) &&
          (destination === catalogPath || destination?.endsWith(`/${catalogPath}`))
      }), `${recipe} must package the reader-selected ${catalogVersion} at ${catalogPath}`)
    }
  }
})

test('database readback validates actual v5/v6/v7 projections against the selected approved reader snapshot', async () => {
  for (const catalogVersion of catalogVersions) {
    const expected = await readPublishedAiPdmRoleCatalog(root, catalogVersion)
    let statement = ''
    const actual = await readPublishedAiPdmRoleCatalogFromDatabase({
      query: async (sql) => {
        statement = sql
        return { rows: databaseRows(expected) }
      },
    }, expected.catalogSha256)

    assert.match(statement, /FROM ai_pdm_contract\.v_application_role_catalog_v1/u)
    assert.equal(actual.catalogVersion, catalogVersion)
    assert.equal(actual.catalogSha256, expected.catalogSha256)
    assert.deepEqual(actual.roles, expected.roles)
    assert.equal(actual.sourcePath, 'postgres:ai_pdm_contract.v_application_role_catalog_v1')
    const readbackRole = actual.roles.find((role) => role.stableRoleId === 'role-rd')
    assert.ok(readbackRole)
    assert.deepEqual(summarizeGovernance(document([{
      applicationId: 'ai-pdm',
      roleId: readbackRole.stableRoleId,
      roleCodeSnapshot: readbackRole.roleCode,
      roleNameSnapshot: readbackRole.displayName,
      catalogVersion,
      scope: { kind: readbackRole.allowedScopeKinds[0], value: 'current' },
    }]), actual, historical), {
      active: { historicalV3: 0, currentV4: 1 },
      draft: { historicalV3: 0, currentV4: 1 },
    })
  }
})
