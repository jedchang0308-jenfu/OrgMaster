import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const manifestPath = `${root}/contracts/ai-pdm-role-policy-consumer-compatibility/v2/contract-manifest.json`
const migrationPath = `${root}/db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql`

describe('DEV-058 AI-PDM compatibility v2 contract', () => {
  it('publishes the fixed fourteen-column contract and exact manifest signature', async () => {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as { columns: Array<{ name: string; type: string }>; initialReadiness: string }
    expect(manifest.columns.map(column => column.name)).toEqual([
      'application_id', 'consumer_id', 'contract_version', 'compatibility_revision',
      'supported_publication_format', 'supported_canonicalization_version',
      'supported_role_schema_id', 'supported_role_profile_schema_id', 'accepted_registry_hash',
      'accepted_baseline_role_identity_hash', 'accepted_protected_policy_hash',
      'consumer_source_revision', 'enablement_ref', 'readiness',
    ])
    expect(manifest.initialReadiness).toBe('NOT_READY')
    const signature = createHash('sha256').update(raw, 'utf8').digest('hex')
    const migration = await readFile(migrationPath, 'utf8')
    expect(migration).toContain(`'${signature}'`)
  })

  it('starts NOT_READY and grants runtimes only contract-view SELECT', async () => {
    const migration = await readFile(migrationPath, 'utf8')
    expect(migration).toContain("'NOT_READY'")
    expect(migration).toContain('GRANT SELECT ON orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2')
    expect(migration).toContain('TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime')
    expect(migration).toContain('REVOKE ALL ON TABLE orgmaster_core.ai_pdm_role_policy_compatibility')
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*jenfu_(?:orgmaster|ai_pdm)_runtime/iu)
  })
})
