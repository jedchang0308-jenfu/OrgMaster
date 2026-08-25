import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureGovernanceStore, getGovernancePaths, readGovernanceStore, GovernanceStoreError } from './orgmasterGovernanceStore'
describe('governance store', () => {
  it('seeds once and preserves revision on repeat read', async () => { const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev027-')); const first = await ensureGovernanceStore(root); const second = await readGovernanceStore(root); expect(first.revision).toBe(second.revision); expect(second.document.auditEvents[0].action).toBe('GOVERNANCE_INITIALIZED') })
  it('fails closed when audit chain is tampered', async () => { const root = await mkdtemp(join(tmpdir(), 'orgmaster-dev027-')); await ensureGovernanceStore(root); const path = getGovernancePaths(root).current; const value = JSON.parse(await readFile(path, 'utf8')); value.auditEvents[0].reason = 'tampered'; await writeFile(path, JSON.stringify(value)); await expect(readGovernanceStore(root)).rejects.toMatchObject<GovernanceStoreError>({ code: 'AUDIT_CHAIN_INVALID' }) })
})
