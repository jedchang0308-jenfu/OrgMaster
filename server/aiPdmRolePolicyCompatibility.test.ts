import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const manifestPath = `${root}/contracts/ai-pdm-role-policy-consumer-compatibility/v2/contract-manifest.json`
const migrationPath = `${root}/db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql`
const retirementPath = `${root}/db/migrations/036_dev058_retire_unused_role_policy_readiness.sql`
const dynamicReaderPaths = [
  `${root}/server/aiPdmDynamicRoleCatalog.ts`,
  `${root}/server/aiPdmRoleCatalogRepository.ts`,
]

describe('DEV-058 AI-PDM compatibility v2 contract', () => {
  it('binds historical migration 034 to the immutable canonical manifest artifact', async () => {
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
    // Migration 034 stores the repository's canonical LF artifact hash. Git
    // may materialize this unchanged historical artifact with CRLF on Windows.
    const canonicalRaw = raw.replace(/\r\n?/gu, '\n')
    const signature = createHash('sha256').update(canonicalRaw, 'utf8').digest('hex')
    expect(signature).toBe('398d6c501c7f69e609750774a40b093be8197129fe73115e51b77ad22c34b94c')
    const migration = await readFile(migrationPath, 'utf8')
    expect(migration).toContain(`'${signature}'`)
  })

  it('keeps readiness checks historical and removes the retired contract from the current reader path', async () => {
    const migration = await readFile(migrationPath, 'utf8')
    expect(migration).toContain("'NOT_READY'")
    expect(migration).toContain('GRANT SELECT ON orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2')
    expect(migration).toContain('TO jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime')
    const correction = await readFile(root + '/db/migrations/035_dev058_ai_pdm_compatibility_definer_read.sql', 'utf8')
    expect(correction).toMatch(/GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;/u)
    expect(correction).toMatch(/GRANT SELECT ON orgmaster_contract\.v_ai_pdm_role_policy_compatibility_v2 TO jenfu_ai_pdm_migrator;/u)
    expect(correction).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON (?:TABLE )?orgmaster_core\./iu)
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON (?:TABLE )?orgmaster_core\./iu)

    expect(migration).toContain('REVOKE ALL ON TABLE orgmaster_core.ai_pdm_role_policy_compatibility')
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*jenfu_(?:orgmaster|ai_pdm)_runtime/iu)

    const retirement = await readFile(retirementPath, 'utf8')
    expect(retirement).toContain('DROP VIEW orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2')
    expect(retirement).toContain('DROP TABLE orgmaster_core.ai_pdm_role_policy_compatibility')
    expect(retirement).toContain("DELETE FROM orgmaster_core.contract_manifest")
    expect(retirement).toContain("readiness = 'NOT_READY'")
    for (const path of dynamicReaderPaths) {
      const source = await readFile(path, 'utf8')
      expect(source).not.toMatch(/\breadiness\b/u)
    }
  })

  it('publishes a narrow post-wait manager contract without changing the existing views', async () => {
    const raw = await readFile(root + '/contracts/ai-pdm-role-policy-manager/v1/contract-manifest.json', 'utf8')
    const correction = await readFile(root + '/db/migrations/035_dev058_ai_pdm_compatibility_definer_read.sql', 'utf8')
    expect(correction).toContain(createHash('sha256').update(raw).digest('hex'))
    expect(correction).toContain("current_setting('transaction_isolation') <> 'read committed'")
    expect(correction.indexOf('managed_identity_admission_authority WHERE singleton FOR SHARE'))
      .toBeLessThan(correction.indexOf('persistence_authority WHERE singleton FOR SHARE'))
    expect(correction).toContain('clock_timestamp() AS at')
    expect(correction).toContain("(link.value->>'validTo')::timestamptz > checked.at")
    expect(correction).toContain('grant_row.valid_until > checked.at')
    expect(correction).not.toContain('CREATE OR REPLACE VIEW')
  })
})
