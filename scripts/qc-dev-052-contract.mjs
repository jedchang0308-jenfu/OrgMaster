#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = 'db/migrations/016_dev014_managed_identity_lifecycle_contract.sql'
const migration = fs.readFileSync(path.join(root, migrationPath), 'utf8')
const profile = JSON.parse(fs.readFileSync(path.join(root, 'config/release/dev040-orgmaster-independent-production-v3.json'), 'utf8'))
const entry = profile.migrations.entries.at(-1)

assert.match(migration, /CREATE VIEW orgmaster_contract\.v_managed_identity_lifecycle_events_v1/u)
assert.match(migration, /CREATE VIEW orgmaster_contract\.v_managed_identity_lifecycle_event_principals_v1/u)
assert.match(migration, /FROM orgmaster_core\.managed_identity_lifecycle_outbox/u)
assert.match(migration, /JOIN orgmaster_core\.principal_identity_reservations/u)
assert.match(migration, /WHERE outbox\.application_id = 'platform'/u)
assert.match(migration, /'orgmaster\.identity-lifecycle'/u)
assert.match(migration, /'jenfu\.orgmaster-contract\.managed-identity-lifecycle\.v1'/u)
assert.match(migration, /TO jenfu_platform_migrator/u)
assert.doesNotMatch(migration, /(?:platform|ai_pdm)_core/u)

assert.deepEqual(entry, {
  order: 16,
  version: 'dev014-orgmaster-016',
  path: migrationPath,
  sourceSha256: sourceSha256(migration),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(migration)),
})

process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-052', migration: migrationPath, sourceSha256: entry.sourceSha256, appliedSha256: entry.appliedSha256, productionWrites: false })}\n`)
