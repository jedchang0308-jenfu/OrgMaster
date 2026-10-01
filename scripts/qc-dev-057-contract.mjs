#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'

const path = 'db/migrations/021_dev057_identity_grant_writer_fence.sql'
const sql = fs.readFileSync(path, 'utf8')
const normalizedSql = sql.replace(/\r\n/gu, '\n')
const statements = normalizedSql.replace(/^--.*$/gmu, '')
const hash = crypto.createHash('sha256').update(normalizedSql).digest('hex')
const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json', 'utf8'))
const entry = profile.migrations.entries.find(({ version }) => version === 'dev057-orgmaster-021')

assert.match(normalizedSql, /^-- DB-CHANGE\n-- owner: orgmaster\n-- schemas: orgmaster_core, orgmaster_contract\n/u)
assert.match(normalizedSql, /SELECT admission_enabled[\s\S]*?managed_identity_admission_authority[\s\S]*?FOR UPDATE[\s\S]*?SELECT authority_version[\s\S]*?persistence_authority[\s\S]*?FOR UPDATE/u)
assert.match(normalizedSql, /CREATE OR REPLACE FUNCTION orgmaster_core\.write_active_persistence_artifacts_with_identity_fence_v1/u)
assert.match(normalizedSql, /principal_identity_reservations/u)
assert.match(normalizedSql, /PRINCIPAL_IDENTITY_RESERVATION_CONFLICT/u)
assert.match(normalizedSql, /ACTIVE_PRINCIPAL_MAPPING_AMBIGUOUS/u)
assert.match(normalizedSql, /CREATE OR REPLACE VIEW orgmaster_contract\.v_active_principal_mappings_v1/u)
assert.match(normalizedSql, /CREATE OR REPLACE VIEW orgmaster_contract\.v_portal_app_visibility_v1/u)
assert.deepEqual(entry, { order: 21, version: 'dev057-orgmaster-021', path, sourceSha256: hash, appliedSha256: 'c8d9b2aa02988a6b0094795b392532548f3bb7e7b51112e752355fd616334a22' })
assert.doesNotMatch(statements, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|SEQUENCE)\b/iu)
assert.doesNotMatch(statements, /\bDROP\s+(?:FUNCTION|VIEW)\b/iu)
assert.doesNotMatch(statements, /^\s*(?:GRANT|REVOKE)\b/imu)

const grantPath = 'db/migrations/025_dev057_ai_pdm_principal_effective_grants_v2.sql'
const grantBytes = fs.readFileSync(grantPath)
const grantSql = grantBytes.toString('utf8').replace(/\r\n/gu, '\n')
const grantManifestBytes = fs.readFileSync('contracts/orgmaster-ai-pdm-principal-effective-grants/v2/contract-manifest.json')
const grantManifest = JSON.parse(grantManifestBytes.toString('utf8'))
const grantEntry = profile.migrations.entries.find(({ version }) => version === 'dev057-orgmaster-025')
assert.match(grantSql, /CREATE VIEW orgmaster_contract\.v_ai_pdm_principal_effective_grants_v2\s+WITH \(security_barrier = true\)/u)
assert.doesNotMatch(grantSql, /FROM orgmaster_contract\.v_ai_pdm_effective_role_assignments_v1/u)
assert.match(grantSql, /GRANT SELECT ON orgmaster_contract\.v_ai_pdm_principal_effective_grants_v2\s+TO jenfu_ai_pdm_runtime/u)
assert.equal(grantManifest.subject, 'principal_id')
assert.ok(!grantManifest.columns.some((column) => /issuer|subject$/u.test(column) && column !== 'subject_kind'))
assert.ok(grantSql.includes(sourceSha256(grantManifestBytes)))
assert.deepEqual(grantEntry, { order: 25, version: 'dev057-orgmaster-025', path: grantPath,
  sourceSha256: sourceSha256(grantBytes),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(grantBytes)) })

const grantV3Path = 'db/migrations/028_dev057_ai_pdm_principal_effective_grants_v3.sql'
const grantV3Bytes = fs.readFileSync(grantV3Path)
const grantV3Sql = grantV3Bytes.toString('utf8').replace(/\r\n/gu, '\n')
const grantV3ManifestBytes = fs.readFileSync('contracts/orgmaster-ai-pdm-principal-effective-grants/v3/contract-manifest.json')
const grantV3Manifest = JSON.parse(grantV3ManifestBytes.toString('utf8'))
const grantV3Entry = profile.migrations.entries.find(({ version }) => version === 'dev057-orgmaster-028')
assert.match(grantV3Sql, /CREATE VIEW orgmaster_contract\.v_ai_pdm_principal_effective_grants_v3\s+WITH \(security_barrier = true\)/u)
assert.doesNotMatch(grantV3Sql, /FROM orgmaster_contract\.v_ai_pdm_principal_effective_grants_v2/u)
assert.match(grantV3Sql, /GRANT SELECT ON orgmaster_contract\.v_ai_pdm_principal_effective_grants_v3\s+TO jenfu_ai_pdm_runtime/u)
assert.equal(grantV3Manifest.subject, 'principal_id')
assert.equal(grantV3Manifest.view, 'orgmaster_contract.v_ai_pdm_principal_effective_grants_v3')
assert.ok(!grantV3Manifest.columns.some((column) => /issuer|subject$/u.test(column) && column !== 'subject_kind'))
assert.ok(grantV3Sql.includes(sourceSha256(grantV3ManifestBytes)))
assert.deepEqual(grantV3Entry, { order: 28, version: 'dev057-orgmaster-028', path: grantV3Path,
  sourceSha256: sourceSha256(grantV3Bytes),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(grantV3Bytes)) })

const grantV4Path='db/migrations/029_dev057_human_business_principal_grants_v4.sql';
const grantV4Bytes=fs.readFileSync(grantV4Path);
const grantV4Sql=grantV4Bytes.toString('utf8');
const grantV4ManifestBytes=fs.readFileSync('contracts/orgmaster-ai-pdm-principal-effective-grants/v4/contract-manifest.json');
const grantV4Manifest=JSON.parse(grantV4ManifestBytes);
assert.equal(grantV4Manifest.subject,'principal_id');
assert.equal(grantV4Manifest.view,'orgmaster_contract.v_ai_pdm_principal_effective_grants_v4');
assert.deepEqual(grantV4Manifest.humanEmployeeRoleAccountTypes,['human_personal','human_privileged']);
assert.equal(grantV4Manifest.privilegedRolePolicy,'exact_principal_direct_global_only');
assert.ok(grantV4Sql.includes(sourceSha256(grantV4ManifestBytes)));
assert.match(grantV4Sql,/CREATE VIEW orgmaster_contract\.v_ai_pdm_principal_effective_grants_v4\s+WITH \(security_barrier = true\)/u);
assert.match(grantV4Sql,/GRANT SELECT ON orgmaster_contract\.v_ai_pdm_principal_effective_grants_v4\s+TO jenfu_ai_pdm_runtime/u);
assert.equal((grantV4Sql.match(/principal\.account_type IN \('human_personal', 'human_privileged'\)/gu)||[]).length,2);
assert.ok(grantV4Sql.includes("catalog_valid.assignment_payload->>'targetPrincipalId' = principal.principal_id"));
assert.ok(grantV4Sql.includes("principal.account_type = 'human_privileged'"));
assert.deepEqual(profile.migrations.entries.at(-1),{order:29,version:'dev057-orgmaster-029',path:grantV4Path,sourceSha256:sourceSha256(grantV4Bytes),appliedSha256:sourceSha256(unwrapMigrationTransaction(grantV4Bytes))});
process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-057', migrations: [path, grantPath, grantV3Path, grantV4Path],
  principalGrantManifestSha256: sourceSha256(grantV4ManifestBytes), productionWrites: false })}\n`)
