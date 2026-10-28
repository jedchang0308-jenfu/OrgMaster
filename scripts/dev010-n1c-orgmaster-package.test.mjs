import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertN1cOrgmasterTarget,
  buildOrgmasterPackage,
  deriveOrgmasterMigration,
  loadN1cOrgmasterConfig,
} from './dev010-n1c-orgmaster-package.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadN1cOrgmasterConfig()
const environment = {
  ORGMASTER_DEPLOYMENT_ENV: 'staging',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-nonprod',
  GOOGLE_CLOUD_REGION: 'asia-east1',
  ORGMASTER_CLOUD_SQL_INSTANCE: 'jenfu-platform-nonprod-pg',
  ORGMASTER_CLOUD_SQL_CONNECTION_NAME: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
  ORGMASTER_POSTGRES_DATABASE: 'jenfu_stg',
  ORGMASTER_POSTGRES_IAM_LOGIN: 'dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam',
}

test('N1C-ORG-01 target guard accepts only exact staging identity', () => {
  assert.equal(assertN1cOrgmasterTarget(environment).status, 'PASS')
  assert.throws(() => assertN1cOrgmasterTarget({ ...environment, ORGMASTER_POSTGRES_DATABASE: 'jenfu_dev' }), /DEV010_N1C_ORGMASTER_WRONG_TARGET/u)
  assert.throws(() => assertN1cOrgmasterTarget({ ...environment, GOOGLE_CLOUD_PROJECT: 'jenfu-ai-pdm-prod' }), /DEV010_N1C_ORGMASTER_WRONG_TARGET/u)
})

test('N1C-ORG-02 package fixes 001 through 010 order and hashes every source/output pair', () => {
  const value = buildOrgmasterPackage(config)
  assert.equal(value.entries.length, 10)
  assert.deepEqual(value.entries.map((entry) => entry.sourcePath), config.migration.order)
  for (const entry of value.entries) {
    assert.match(entry.sourceSha256, /^[0-9a-f]{64}$/u)
    assert.match(entry.outputSha256, /^[0-9a-f]{64}$/u)
    assert.doesNotMatch(entry.sql, /^BEGIN;|\nCOMMIT;\s*$/u)
  }
})

test('N1C-ORG-03 historical Platform ownership is rebound only in derived 001 through 009 output', () => {
  const value = buildOrgmasterPackage(config)
  for (const entry of value.entries.slice(0, 9)) assert.doesNotMatch(entry.sql, /jenfu_platform_migrator/u)
  assert.match(value.entries[9].sql, /jenfu_platform_migrator/u)
  const source = fs.readFileSync(path.join(root, ...config.migration.order[0].split('/')), 'utf8')
  assert.match(source, /jenfu_platform_migrator/u)
})

test('N1C-ORG-04 malformed transaction envelopes fail closed', () => {
  assert.throws(() => deriveOrgmasterMigration('db/migrations/001_bad.sql', 'SELECT 1;'), /DEV010_N1C_ORGMASTER_TRANSACTION_SHAPE_MISMATCH/u)
  assert.throws(() => deriveOrgmasterMigration('db/migrations/001_bad.sql', 'BEGIN;\nCOMMIT;\nCOMMIT;'), /DEV010_N1C_ORGMASTER_TRANSACTION_SHAPE_MISMATCH/u)
})

test('N1C-ORG-05 fixture is synthetic and contains no production rows or credentials', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'dev-010', 'n1c', 'fixtures', 'orgmaster-staging-v1.json'), 'utf8'))
  assert.equal(fixture.tenantId, 'company-staging-smoke')
  assert.equal(fixture.productionTenantId, 'company-jenfu')
  assert.equal(fixture.productionRows, 0)
  assert.equal(fixture.credentials, 0)
  assert.equal(fixture.externalDeliveries, 0)
})

test('N1C-ORG-06 package binds the frozen AI-PDM catalog dependency', () => {
  assert.deepEqual(config.migration.requiredDependency, {
    contractId: 'ai-pdm.role-catalog',
    contractVersion: 'ai-pdm.role-catalog.2026-09-03.v3',
    signatureSha256: '1317eec6191028b9ea9d327687343a000dbb37577e660fd7ad71f179286ced16',
    payloadSha256: '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8',
  })
  const source = fs.readFileSync(path.join(root, 'scripts', 'dev010-n1c-orgmaster-package.mjs'), 'utf8')
  assert.match(source, /ai_pdm_contract\.v_contract_manifest_v1/u)
  assert.match(source, /DEV010_N1C_ORGMASTER_DEPENDENCY_MISMATCH/u)
})

test('N1C-ORG-07 foundation-owned legacy schemas are not recreated by app migrations', () => {
  const value = buildOrgmasterPackage()
  for (const entry of value.entries) assert.doesNotMatch(entry.sql, /CREATE EXTENSION IF NOT EXISTS pgcrypto|CREATE SCHEMA IF NOT EXISTS (?:orgmaster|organization|access_governance)|ALTER SCHEMA (?:orgmaster|organization|access_governance) OWNER/u)
})

test('N1C-ORG-08 alias-history and command contracts retain their explicit Platform definer grants', () => {
  const relativePath = 'db/migrations/024_dev057_principal_identity_invariants.sql'
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/gu, '\n')
  const derived = deriveOrgmasterMigration(relativePath, source)
  for (const statement of [
    'GRANT SELECT ON orgmaster_contract.v_principal_alias_history_v1\n  TO jenfu_platform_runtime, jenfu_platform_migrator, jenfu_orgmaster_runtime;',
    'GRANT EXECUTE ON FUNCTION orgmaster_contract.read_employee_authority_operation_v1(text,text,text)\n  TO jenfu_orgmaster_runtime, jenfu_platform_migrator;',
    'GRANT EXECUTE ON FUNCTION orgmaster_contract.switch_employee_entitlement_authority_v2(text,text,text,bigint,text,text,text,text,text,text,text,text)\n  TO jenfu_orgmaster_runtime, jenfu_platform_migrator;',
  ]) {
    assert.ok(source.includes(statement))
    assert.ok(derived.includes(statement), statement)
  }
})

test('N1C-ORG-09 only historical ownership contexts are rebound; ACL recipients and SQL text are preserved', () => {
  const source = `BEGIN;
SET LOCAL ROLE jenfu_platform_migrator;
ALTER VIEW organization.v_fixture OWNER TO jenfu_platform_migrator;
ALTER FUNCTION orgmaster.fixture()
  OWNER TO jenfu_platform_migrator;
GRANT SELECT ON organization.v_fixture TO jenfu_platform_migrator;
REVOKE ALL ON organization.v_fixture FROM jenfu_platform_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE jenfu_platform_migrator IN SCHEMA orgmaster
  GRANT SELECT ON TABLES TO jenfu_platform_migrator;
COMMENT ON VIEW organization.v_fixture IS 'OWNER TO jenfu_platform_migrator';
DO $fixture$
BEGIN
  RAISE NOTICE 'SET ROLE jenfu_platform_migrator';
END;
$fixture$;
-- OWNER TO jenfu_platform_migrator
COMMIT;
`
  const derived = deriveOrgmasterMigration('db/migrations/009_fixture.sql', source)
  assert.match(derived, /SET LOCAL ROLE jenfu_orgmaster_migrator;/u)
  assert.match(derived, /ALTER VIEW organization\.v_fixture OWNER TO jenfu_orgmaster_migrator;/u)
  assert.match(derived, /ALTER FUNCTION orgmaster\.fixture\(\)\n  OWNER TO jenfu_orgmaster_migrator;/u)
  assert.match(derived, /ALTER DEFAULT PRIVILEGES FOR ROLE jenfu_orgmaster_migrator IN SCHEMA orgmaster\n  GRANT SELECT ON TABLES TO jenfu_platform_migrator;/u)
  assert.match(derived, /GRANT SELECT ON organization\.v_fixture TO jenfu_platform_migrator;/u)
  assert.match(derived, /REVOKE ALL ON organization\.v_fixture FROM jenfu_platform_migrator;/u)
  assert.match(derived, /IS 'OWNER TO jenfu_platform_migrator';/u)
  assert.match(derived, /RAISE NOTICE 'SET ROLE jenfu_platform_migrator';/u)
  assert.match(derived, /-- OWNER TO jenfu_platform_migrator/u)
})

test('N1C-ORG-10 every post-boundary migration keeps its source body unchanged', () => {
  for (const name of fs.readdirSync(path.join(root, 'db/migrations')).filter(name => /^\d{3}_.+\.sql$/u.test(name) && Number(name.slice(0, 3)) >= 10)) {
    const source = fs.readFileSync(path.join(root, 'db/migrations', name), 'utf8').replace(/\r\n/gu, '\n')
    const expected = source.replace(/^BEGIN;\s*\n/mu, '').replace(/\nCOMMIT;\s*$/u, '\n')
    assert.equal(deriveOrgmasterMigration(`db/migrations/${name}`, source), expected, name)
  }
})
