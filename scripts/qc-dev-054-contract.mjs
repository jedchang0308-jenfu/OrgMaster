#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'

const activationMigrationPath = 'db/migrations/018_dev014_employee_activation_contract.sql'
const revisionMigrationPath = 'db/migrations/019_dev014_workspace_revision_contract.sql'
const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json', 'utf8'))
const activationSource = fs.readFileSync(activationMigrationPath)
const revisionSource = fs.readFileSync(revisionMigrationPath)
const activationSql = activationSource.toString('utf8')
const revisionSql = revisionSource.toString('utf8')
const entry = profile.migrations.entries.at(-1)

assert.deepEqual(entry, {
  order: 19,
  version: 'dev014-orgmaster-019',
  path: revisionMigrationPath,
  sourceSha256: sourceSha256(revisionSource),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(revisionSource)),
})
for (const marker of [
  'orgmaster_core.assert_employee_activation_v1',
  'orgmaster_core.employee_number_assignments',
  'orgmaster_core.employee_number_legacy_exemptions',
  'e.resolved_at IS NULL',
  'TO jenfu_orgmaster_runtime',
]) assert.ok(activationSql.includes(marker), marker)
assert.doesNotMatch(activationSql, /managed_identity_invalidation_applications/u)
assert.match(activationSql, /REVOKE ALL ON FUNCTION orgmaster_core\.assert_employee_activation_v1\(text, text\)[\s\S]*FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime/u)
for (const marker of [
  'CREATE OR REPLACE VIEW orgmaster_core.v_current_workspace_employees_v1',
  'trim(p.canonical_sha256) AS workspace_revision',
  'p.batch_id = m.batch_id',
  "trim(p.canonical_sha256) ~ '^[a-f0-9]{64}$'",
]) assert.ok(revisionSql.includes(marker), marker)
assert.doesNotMatch(revisionSql, /b\.source_revision\s+AS\s+workspace_revision/iu)

process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-054', migrations: [activationMigrationPath, revisionMigrationPath], sourceSha256: entry.sourceSha256, appliedSha256: entry.appliedSha256, productionWrites: false })}\n`)
