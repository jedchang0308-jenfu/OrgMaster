import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildOrgmasterPackage } from './dev010-n1c-orgmaster-package.mjs'
import { assertDev040V3Profile, buildDev040MigrationBundle, sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'
import { assertDev059FmsAuthorityAppend, assertDev059MigrationEntries, DEV059_FMS_AUTHORITY_MIGRATIONS } from './lib/dev059-fms-authority-migration.mjs'
import { TARGET } from './dev040-production-migration-runner.mjs'

const SQL_PATH = 'db/migrations/041_dev060_fms_catalog_activation_receipts_v1.sql'
const MANIFEST_PATH = 'config/contracts/orgmaster-fms-catalog-activation.v1.json'
const VERSION = 'orgmaster.fms-catalog-activation.v1'
const RECEIPT_VIEW = 'orgmaster_contract.v_fms_catalog_activation_receipts_v1'
const BINDING_VIEW = 'orgmaster_contract.v_fms_catalog_binding_v1'
const RECEIPT_FIELDS = ['contract_version', 'manifest_hash', 'source', 'principal_id', 'operation_id', 'intent_id', 'input_hash', 'org_command_id', 'org_request_hash', 'preview_hash', 'proof', 'audit_after_hash', 'assignment_version_after', 'published_snapshot_hash', 'published_by_principal_id', 'published_at', 'accepted_at', 'terminal_at', 'governance_revision_after']
const BINDING_FIELDS = ['contract_version', 'manifest_hash', 'application_id', 'company_id', 'catalog_version', 'content_sha256', 'artifact_sha256', 'catalog_binding_revision', 'assignment_version', 'governance_revision']
const bytes = file => readFileSync(new URL('../' + file, import.meta.url))
const json = file => JSON.parse(bytes(file).toString('utf8'))
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sql = () => bytes(SQL_PATH).toString('utf8')
const compact = value => value.replace(/--[^\n]*/gu, '').replace(/\s+/gu, ' ').trim()
function viewSource(name) {
  const value = sql().split('CREATE VIEW ' + name)[1]
  assert.ok(value, 'missing view ' + name)
  return value.split('ALTER VIEW ')[0]
}
function columns(name) {
  const match = /^\s*\(([\s\S]*?)\)\s*WITH/u.exec(viewSource(name))
  assert.ok(match, 'explicit view columns are required')
  return match[1].split(',').map(value => value.trim())
}
function projectedColumns(name) {
  const projection = /\nSELECT ([\s\S]*?)\n  FROM /u.exec(viewSource(name))?.[1]
  assert.ok(projection, 'missing final view projection')
  return [...projection.matchAll(/\bAS ([a-z0-9_]+)(?:,|$)/gmu)].map(match => match[1])
}
function bundle() {
  const profile = json('config/release/dev040-orgmaster-independent-production-v3.json')
  const n1c = json('config/dev-010/n1c-orgmaster.json')
  const files = new Map(profile.migrations.entries.map(entry => [entry.path, bytes(entry.path)]))
  assertDev040V3Profile(profile, n1c)
  return buildDev040MigrationBundle(profile, buildOrgmasterPackage(n1c), files, 'a'.repeat(40)).bundle
}

test('manifest bytes pin both views and the owner manifest row', () => {
  const manifestBytes = bytes(MANIFEST_PATH)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const hash = sha256(manifestBytes)
  assert.equal(manifest.contractVersion, VERSION)
  assert.equal(manifest.manifestHashScope, 'whole-file-utf8-bytes')
  assert.equal(manifest.receiptView, RECEIPT_VIEW)
  assert.equal(manifest.bindingView, BINDING_VIEW)
  assert.deepEqual(manifest.receiptColumns, RECEIPT_FIELDS)
  assert.deepEqual(manifest.bindingColumns, BINDING_FIELDS)
  assert.equal((sql().match(new RegExp(hash, 'gu')) ?? []).length, 3)
  assert.ok(compact(sql()).includes("VALUES ('orgmaster.fms-catalog-activation-v1', '" + VERSION + "', '" + hash + "', NULL)"))
})

test('views expose exactly the agreed fields with a complete JSON proof', () => {
  assert.deepEqual(columns(RECEIPT_VIEW), RECEIPT_FIELDS)
  assert.deepEqual(columns(BINDING_VIEW), BINDING_FIELDS)
  assert.deepEqual(projectedColumns(RECEIPT_VIEW), RECEIPT_FIELDS)
  assert.deepEqual(projectedColumns(BINDING_VIEW), BINDING_FIELDS)
  assert.match(viewSource(RECEIPT_VIEW), /proof AS proof/u)
  assert.match(viewSource(RECEIPT_VIEW), /checkpoint->>'source' AS source/u)
  assert.match(viewSource(RECEIPT_VIEW), /intent->>'operationId' AS operation_id/u)
  assert.match(viewSource(RECEIPT_VIEW), /intent->>'inputHash' AS input_hash/u)
  assert.match(viewSource(RECEIPT_VIEW), /receipt->>'requestHash' AS org_request_hash/u)
})

test('receipt source requires the existing checkpoint and exact original actor/operation', () => {
  const source = compact(viewSource(RECEIPT_VIEW))
  for (const required of [
    "batch.id = authority.active_batch_id", "batch.status = 'active'", "artifact.artifact_key = 'orgmaster-governance.v3.json'",
    "receipt->>'receiptStatus' = 'applied'", "receipt->>'contractVersion' = 'orgmaster.governance-command-receipt.v2'",
    "proof->>'contractVersion' = 'orgmaster.fms-catalog-activation-record.v1'",
    "checkpoint->>'schemaVersion' = 'fms.governance-checkpoint.v1'", "checkpoint->'receipt' = 'null'::jsonb",
    "checkpoint->>'source' IN ('formal', 'local_test')", "checkpoint->>'employeeId' = proof->>'employeeId'",
    "intent->>'schemaVersion' = 'fms.governance-intent.v1'", "intent->>'applicationId' = 'financial-management-system'",
    "intent->>'companyId' = 'jenfu-machinery'", "intent->>'operationId' = receipt->>'commandId'",
    "intent->>'principalId' = proof->>'principalId'", "intent->>'catalogVersion' = proof->>'catalogVersion'",
    "intent->>'contentSha256' = proof->>'contentSha256'", "intent->>'artifactSha256' = proof->>'artifactSha256'",
    "intent->>'previewHash' = receipt->>'previewHash'", "intent->>'expectedGovernanceRevision' = proof->>'governanceRevisionBefore'",
    "intent->>'expectedAssignmentVersion' = proof->>'assignmentVersionBefore'",
    "intent->>'expectedCatalogBindingRevision' = proof->>'catalogBindingRevisionBefore'",
    "intent->>'expectedGrantRevision' = proof->>'grantRevisionBefore'", "NULLIF(proof->>'authorityReadAt', '') IS NOT NULL",
  ]) assert.ok(source.includes(required), required)
  assert.doesNotMatch(source, /COALESCE\([^)]*(?:intentId|operationId|fmsCheckpoint)/u)
})

test('receipt joins audit and its historical publication without requiring that publication to stay active', () => {
  const source = compact(viewSource(RECEIPT_VIEW))
  for (const required of [
    "event->>'id' = receipt->>'auditReference'", "event->>'commandId' = receipt->>'commandId'",
    "event->>'action' = 'financial_catalog_activate'", "event->>'entityType' = 'financialCatalogRelease'",
    "event->>'actorPrincipalId' = proof->>'principalId'", "event->>'entityId' = proof->>'catalogVersion'",
    "publication->>'kind' = 'assignment-governance-v3'", "publication->>'id' = proof->>'assignmentVersionAfter'",
    "publication->>'snapshotHash' = proof->>'publishedSnapshotHash'", "publication->>'publishedByPrincipalId' = proof->>'principalId'",
    "receipt->>'governanceRevision' = publication->>'id'", "receipt->>'acceptedAt' = publication->>'publishedAt'",
    "receipt->>'terminalAt' = publication->>'publishedAt'", "catalog.value->>'catalogVersion' = proof->>'catalogVersion'",
    "catalog.value->>'contentSha256' = proof->>'contentSha256'", "catalog.value->>'artifactSha256' = proof->>'artifactSha256'",
  ]) assert.ok(source.includes(required), required)
  assert.doesNotMatch(source, /activePolicyVersionId/u)
})

test('current binding returns only the active FMS catalog and canonical artifact revision', () => {
  const source = compact(viewSource(BINDING_VIEW))
  for (const required of [
    "version.value->>'id' = governance.payload->>'activePolicyVersionId'", "version.value->>'kind' = 'assignment-governance-v3'",
    "catalog.value->>'applicationId' = 'financial-management-system'", "catalog.value->>'sourceKind' = 'application-contract'",
    "catalog.value->>'validationState' = 'valid'", "catalog.value->>'contentSha256' AS catalog_binding_revision",
    "active_version.governance_revision AS governance_revision", "trim(artifact.canonical_sha256) AS governance_revision",
  ]) assert.ok(source.includes(required), required)
  assert.doesNotMatch(source, /AS source\b|AS policy\b|AS publication\b/u)
})

test('migration grants only FMS SELECT and adds no SQL hash helper or business writes', () => {
  const source = compact(sql())
  const grants = [...source.matchAll(/GRANT SELECT ON ([\w.]+) TO (\w+)/gu)]
  assert.deepEqual(grants.map(match => [match[1], match[2]]), [[RECEIPT_VIEW, 'fms_runtime'], [BINDING_VIEW, 'fms_runtime']])
  assert.equal((source.match(/WITH \(security_barrier = true\)/gu) ?? []).length, 2)
  assert.doesNotMatch(source, /CREATE (?:OR REPLACE )?FUNCTION|\bdigest\s*\(|\b(?:UPDATE|DELETE|TRUNCATE)\b/u)
  assert.deepEqual([...source.matchAll(/INSERT INTO ([\w.]+)/gu)].map(match => match[1]), ['orgmaster_core.contract_manifest'])
  assert.doesNotMatch(source, /(?:platform|ai_pdm|fms)_core\./u)
})

test('release profile and exact append gate pin the new SQL source and unwrapped bytes', () => {
  const value = bundle()
  assert.equal(value.entries.length, 39)
  const entry = value.entries.at(-1)
  assert.equal(entry.path, SQL_PATH)
  assert.equal(entry.version, 'dev060-orgmaster-041')
  assert.equal(entry.order, 39)
  assert.equal(entry.sourceSha256, sourceSha256(bytes(SQL_PATH)))
  assert.equal(entry.appliedSha256, sourceSha256(unwrapMigrationTransaction(bytes(SQL_PATH))))
  assertDev059MigrationEntries(value.entries)
  assert.equal(DEV059_FMS_AUTHORITY_MIGRATIONS.at(-1).path, SQL_PATH)
  const { manifestSha256: omitted, ...core } = value; void omitted
  const prior = { ...core, entries: value.entries.slice(0, 38) }
  assert.equal(assertDev059FmsAuthorityAppend(prior, value).pendingMigrationCount, 1)
  for (const field of ['path', 'sourceSha256', 'appliedSha256', 'name', 'version']) {
    const changed = structuredClone(value)
    changed.entries.at(-1)[field] = 'unapproved'
    assert.throws(() => assertDev059MigrationEntries(changed.entries), /DEV059_MIGRATION_(?:APPEND|NAME)_INVALID/u)
  }
})

test('native runner accepts a verified 038 prefix and exact 039 replay without broadening lower prefixes', () => {
  assert.equal(TARGET.entryCount, 39)
  assert.deepEqual(TARGET.allowedExistingLedgerCounts, [31, 32, 33, 34, 35, 36, 37, 38, 39])
})

test('new contract files use UTF-8 without BOM and have no trailing whitespace', () => {
  for (const path of [SQL_PATH, MANIFEST_PATH]) {
    const value = bytes(path)
    assert.notEqual(value.subarray(0, 3).toString('hex'), 'efbbbf')
    assert.doesNotMatch(value.toString('utf8'), /[\t ]+\r?$/mu)
    assert.equal(value.at(-1), 10)
  }
})
