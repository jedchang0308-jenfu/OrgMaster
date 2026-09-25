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

process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-057', migrations: [path, grantPath],
  principalGrantManifestSha256: sourceSha256(grantManifestBytes), productionWrites: false })}\n`)
