#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'

const migrationPath = 'db/migrations/018_dev014_employee_activation_contract.sql'
const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json', 'utf8'))
const source = fs.readFileSync(migrationPath)
const sql = source.toString('utf8')
const entry = profile.migrations.entries.at(-1)

assert.deepEqual(entry, {
  order: 18,
  version: 'dev014-orgmaster-018',
  path: migrationPath,
  sourceSha256: sourceSha256(source),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(source)),
})
for (const marker of [
  'orgmaster_core.assert_employee_activation_v1',
  'orgmaster_core.employee_number_assignments',
  'orgmaster_core.employee_number_legacy_exemptions',
  'e.resolved_at IS NULL',
  'TO jenfu_orgmaster_runtime',
]) assert.ok(sql.includes(marker), marker)
assert.doesNotMatch(sql, /managed_identity_invalidation_applications/u)
assert.match(sql, /REVOKE ALL ON FUNCTION orgmaster_core\.assert_employee_activation_v1\(text, text\)[\s\S]*FROM PUBLIC, jenfu_platform_runtime, jenfu_ai_pdm_runtime/u)

process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-054', migration: migrationPath, sourceSha256: entry.sourceSha256, appliedSha256: entry.appliedSha256, productionWrites: false })}\n`)
