#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sourceSha256, unwrapMigrationTransaction } from './lib/dev040-orgmaster-independent-release.mjs'

const migrationPath = 'db/migrations/020_dev014_current_projection_contract.sql'
const profile = JSON.parse(fs.readFileSync('config/release/dev040-orgmaster-independent-production-v3.json', 'utf8'))
const source = fs.readFileSync(migrationPath)
const sql = source.toString('utf8')
const entry = profile.migrations.entries.find(({ version }) => version === 'dev014-orgmaster-020')

assert.deepEqual(entry, {
  order: 20,
  version: 'dev014-orgmaster-020',
  path: migrationPath,
  sourceSha256: sourceSha256(source),
  appliedSha256: sourceSha256(unwrapMigrationTransaction(source)),
})
for (const marker of [
  'CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_entitlement_authority_v1',
  'CREATE OR REPLACE VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1',
  'CREATE OR REPLACE VIEW orgmaster_contract.v_portal_app_visibility_v1',
  'orgmaster_contract.v_active_principal_mappings_v1',
  "workspace.artifact_key = 'orgmaster-versions/' || (manifest.payload->>'currentVersionId') || '.json'",
  "CASE WHEN managed.identity_record_id IS NOT NULL THEN 'human_personal'::text END",
]) assert.ok(sql.includes(marker), marker)
assert.doesNotMatch(sql, /CREATE OR REPLACE VIEW access_governance\./u)
assert.doesNotMatch(sql, /organizationSnapshot,workspaceRevision/u)
assert.match(sql, /-- schemas: orgmaster_core, orgmaster_contract/u)

process.stdout.write(`${JSON.stringify({ status: 'PASS', contract: 'DEV-055', migration: migrationPath, sourceSha256: entry.sourceSha256, appliedSha256: entry.appliedSha256, productionWrites: false })}\n`)
