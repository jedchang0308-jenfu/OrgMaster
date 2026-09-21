#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'

const migrationPath = 'db/migrations/017_dev014_invalidation_application_registration.sql'
const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json', 'utf8'))
const source = fs.readFileSync(migrationPath)
const sql = source.toString('utf8')
const entry = profile.migrations.entries.at(-1)

assert.deepEqual(entry, {
  order: 17,
  version: 'dev014-orgmaster-017',
  path: migrationPath,
  sourceSha256: sourceSha256(source),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(source)),
})
for (const marker of [
  "COALESCE(NULLIF(btrim(app.value->>'applicationId'), ''), NULLIF(btrim(app.value->>'id'), ''))",
  "SELECT 'orgmaster'",
  "SELECT 'platform'",
  'INVALIDATION_APPLICATION_SET_CHANGE_REQUIRES_ADMISSION_OFF',
  'synchronize_managed_identity_invalidation_applications_v1',
]) assert.ok(sql.includes(marker), marker)
assert.match(sql, /REVOKE ALL ON FUNCTION orgmaster_core\.synchronize_managed_identity_invalidation_applications_v1\(text\)[\s\S]*jenfu_orgmaster_runtime/u)
assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION orgmaster_core\.synchronize_managed_identity_invalidation_applications_v1/u)

process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-053', migration: migrationPath, sourceSha256: entry.sourceSha256, appliedSha256: entry.appliedSha256, productionWrites: false })}\n`)
