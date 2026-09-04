#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const orgMasterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const financialRoot = path.resolve(orgMasterRoot, '..', 'Financial-Management-System')
const financialArtifactPath = path.join(financialRoot, 'config', 'access-control', 'financial-role-catalog.v1.json')
const vendoredArtifactPath = path.join(orgMasterRoot, 'contracts', 'jenfu-platform-entitlement', 'v2', 'fixtures', 'financial-role-catalog.v1.json')
const manifestPath = path.join(orgMasterRoot, 'contracts', 'jenfu-platform-entitlement', 'v2', 'contract-manifest.json')
const lockPath = path.join(orgMasterRoot, 'contracts', 'jenfu-platform-entitlement', 'v2', 'contract-lock.json')
const migrationPath = path.join(orgMasterRoot, 'db', 'migrations', '009_dev039_application_entitlement_v2.sql')
const aiPdmFixturePath = path.join(orgMasterRoot, 'contracts', 'jenfu-platform-entitlement', 'v1', 'fixtures', 'application-role-catalog.sample.json')
const expectedSha256 = '801c08887bdee6e082823400bc9ad37dd329474887d7774537161655d94332e3'
const expectedVersion = 'financial-management-system.role-catalog.2026-09-03.v1'

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')) }
function requireText(text, value) { assert.ok(text.includes(value), `missing required text: ${value}`) }
function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  throw new TypeError('unsupported JSON value')
}

const sourceBytes = fs.readFileSync(financialArtifactPath)
const vendoredBytes = fs.readFileSync(vendoredArtifactPath)
assert.deepEqual(vendoredBytes, sourceBytes, 'OrgMaster vendored artifact differs from Financial source-of-truth bytes')
assert.equal(sourceBytes.at(-1), 0x0a, 'catalog must have exactly one final LF')
assert.notEqual(sourceBytes.at(-2), 0x0a, 'catalog must have exactly one final LF')

const catalog = readJson(vendoredArtifactPath)
const catalogWithoutHash = { ...catalog }
delete catalogWithoutHash.catalogSha256
assert.equal(catalog.applicationId, 'financial-management-system')
assert.equal(catalog.catalogVersion, expectedVersion)
assert.equal(catalog.catalogSha256, expectedSha256)
assert.equal(sha256(Buffer.from(canonicalJson(catalogWithoutHash), 'utf8')), expectedSha256, 'Financial catalog semantic SHA-256 changed without a new catalog version')
assert.equal(catalog.roles.length, 6)
assert.equal(new Set(catalog.roles.map((role) => role.stableRoleId)).size, catalog.roles.length)

const manifest = readJson(manifestPath)
assert.equal(manifest.contractVersion, 'jenfu.platform-entitlement.v2')
assert.equal(manifest.applicationId, 'financial-management-system')
assert.equal(manifest.catalogVersion, expectedVersion)
assert.equal(manifest.catalogSha256, expectedSha256)
assert.deepEqual(manifest.artifacts, [{ path: 'fixtures/financial-role-catalog.v1.json', sha256: expectedSha256 }])

const lock = readJson(lockPath)
assert.equal(lock.contractVersion, 'jenfu.platform-entitlement.v2')
assert.equal(lock.sourceOfTruth, 'C:/VIBE CODING/Financial-Management-System/config/access-control/financial-role-catalog.v1.json')
assert.deepEqual(lock.lockedArtifacts, [{ applicationId: 'financial-management-system', catalogVersion: expectedVersion, catalogSha256: expectedSha256 }])
assert.equal(lock.mutation, 'new-catalog-version-only')

const migration = fs.readFileSync(migrationPath, 'utf8')
for (const required of [
  'CREATE TABLE IF NOT EXISTS access_governance.application_role_catalog_versions_v2',
  'CREATE TABLE IF NOT EXISTS access_governance.application_role_assignments_v2',
  'CREATE TABLE IF NOT EXISTS access_governance.application_management_grants_v2',
  'application_role_catalog_versions_v2_one_active',
  'application_role_assignments_v2_active_key',
  'application_management_grants_v2_active_key',
  'v_application_entitlement_authority_v2',
  'v_effective_role_assignments_v2',
  "DEFAULT 'local_legacy'",
]) requireText(migration, required)
assert.equal(/\bDROP\s+(TABLE|VIEW)\b/iu.test(migration), false, 'DEV-039 migration must remain additive')

const aiPdmFixture = readJson(aiPdmFixturePath)
assert.equal(aiPdmFixture.applicationId, 'ai-pdm')
assert.equal(aiPdmFixture.catalogVersion, 'ai-pdm.role-catalog.2026-09-03.v3')
assert.equal(JSON.stringify(aiPdmFixture).includes('financial-management-system'), false, 'AI-PDM v1 fixture must not absorb Financial ownership')

console.log(JSON.stringify({
  status: 'PASS',
  contractVersion: manifest.contractVersion,
  catalogVersion: expectedVersion,
  catalogSha256: expectedSha256,
  byteIdentity: 'PASS',
  migration: 'additive-default-off',
  aiPdmV1Untouched: 'PASS',
}))
