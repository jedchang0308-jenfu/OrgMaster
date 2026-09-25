import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseArgs, summarizeGovernance } from './dev057-production-v4-catalog-readback-runner.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const current = JSON.parse(fs.readFileSync(path.join(root,
  'config/catalogs/ai-pdm-role-catalog.v4.json'), 'utf8'))
const historical = JSON.parse(fs.readFileSync(path.join(root,
  'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'), 'utf8'))
const row = (version) => ({ applicationId: 'ai-pdm', roleId: 'role-rd',
  roleCodeSnapshot: 'rd', roleNameSnapshot: '研發人員', catalogVersion: version,
  scope: { kind: 'workspace', value: 'current' } })
const document = (assignments) => ({ activePolicyVersionId: 'published-1',
  publishedVersions: [{ id: 'published-1', kind: 'assignment-governance-v3',
    policy: { roleAssignments: assignments } }],
  draft: { roleAssignments: assignments } })

test('readback accepts only exact target and source-bound output', () => {
  const args = ['--source-revision', 'a'.repeat(40), '--output-ref',
    'gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-V4-CONSUMER-READBACK/one.json']
  assert.equal(parseArgs(args).sourceRevision, 'a'.repeat(40))
  assert.throws(() => parseArgs([...args.slice(0, 3),
    'gs://other/receipts/releases/DEV057-V4-CONSUMER-READBACK/one.json']))
  assert.throws(() => parseArgs([...args, '--extra', '1']))
})

test('historical v3 assignments remain valid against the active v4 role semantics', () => {
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
    'scripts/dev040-production-migration-runner.mjs',
    'scripts/dev057-production-v4-catalog-readback-runner.mjs',
    'server/aiPdmRoleCatalogRepository.ts',
    'config/catalogs/ai-pdm-role-catalog.v4.json',
    'contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json']) {
    assert.match(dockerfile, new RegExp(`COPY ${source.replaceAll('.', '\\.')} `))
  }
  assert.match(dockerfile, /USER node/u)
  assert.match(dockerfile, /SOURCE_REVISION=\$\{SOURCE_REVISION\}/u)
})
