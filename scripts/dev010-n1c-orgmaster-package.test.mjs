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
