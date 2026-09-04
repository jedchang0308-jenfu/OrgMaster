import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { canonicalize, loadPackageConfig, sha256 } from './lib/dev010-n2-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadPackageConfig(path.join(root, 'config', 'dev-010', 'n2', 'orgmaster-package.json'))
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'dev-010', 'n2', 'fixtures', 'orgmaster-state.json'), 'utf8'))
const migration = fs.readFileSync(path.join(root, 'db', 'migrations', '010_dev010_neutral_schema_boundary.sql'), 'utf8')
const databaseSource = fs.readFileSync(path.join(root, 'server', 'orgmasterDatabase.ts'), 'utf8')
const persistenceSource = fs.readFileSync(path.join(root, 'server', 'orgmasterPersistenceRepository.ts'), 'utf8')
const browserSource = fs.readFileSync(path.join(root, 'qa', 'dev-010', 'n2', 'browser', 'normal-entry.mjs'), 'utf8')

const expected = {
  org_principal: '1c431017194a06dfc61c36849ff93c42ab14291871f12f1a04d762823a3e2ced',
  org_entitlement: '739db9d6457aca3e3de3d7e9ea01c3b5adc294f783b887226e7ae35eb48a54a5',
  org_artifacts: '3464e9ead88775069580788946bc38b232d73ac7083a2a7385ef953296548b5b',
  org_outbox: '007f35aa30f766f09b2e64871b2ed8129a729c29106535a550ad31618329f850',
  org_media: '39aed03b5511b37cc313db97c7037db0295ed6cdb433470f4b5a475ae9e49d07',
}

test('N2-ORG-01 fixture groups have the frozen canonical hashes', () => {
  for (const [group, expectedHash] of Object.entries(expected)) assert.equal(sha256(canonicalize(fixture.groups[group])), expectedHash)
})

test('N2-ORG-02 neutral migration moves base relations and leaves compatibility views', () => {
  assert.match(migration, /ALTER TABLE %I\.%I SET SCHEMA orgmaster_core/u)
  assert.match(migration, /CREATE VIEW %I\.%I WITH \(security_barrier=true\)/u)
  assert.match(migration, /REVOKE ALL ON TABLE orgmaster_core\.schema_migrations/u)
})

test('N2-ORG-03 producer contracts use exact signatures and payload hashes', () => {
  assert.match(migration, /e400a51351fc1b5fab083ed94bcf0c62efdd0606d4316f354b2893f9bf82cf15/u)
  assert.match(migration, /13a74783a6da2ac210090a6ba56937cb7b2f6d7d06e97a89844d4d6aaaca8306/u)
  assert.match(migration, /orgmaster_contract\.v_ai_pdm_effective_role_assignments_v1/u)
})

test('N2-ORG-04 auth, persistence, and general access share one bounded pool', () => {
  assert.match(databaseSource, /ORGMASTER_POSTGRES_POOL_MAX/u)
  assert.match(databaseSource, /max: positiveInteger\([^\n]+, 6,/u)
  assert.match(persistenceSource, /createOrgmasterDatabase\(url, environment\)/u)
  assert.doesNotMatch(persistenceSource, /new pg\.Pool/u)
})

test('N2-ORG-05 manifest declares one pool with exact timeout ordering', () => {
  assert.equal(config.connectionBudget.poolMax, 6)
  assert.equal(config.connectionBudget.poolsPerInstance, 1)
  assert.ok(config.connectionBudget.queryTimeoutMs > config.connectionBudget.statementTimeoutMs)
})

test('N2-ORG-06 browser rehearsal builds synthetic governance state without local business data', () => {
  assert.match(browserSource, /createSyntheticGovernanceFixture/u)
  assert.doesNotMatch(browserSource, /path\.join\(orgRoot, 'data', 'orgmaster-(?:governance|workspace)/u)
})
