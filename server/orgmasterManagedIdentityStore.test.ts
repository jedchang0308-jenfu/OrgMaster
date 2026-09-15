import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createManagedIdentityStore } from './orgmasterManagedIdentityStore'

describe('managed identity local registry', () => {
  it('persists a number, returns a revision, and keeps a tombstone on correction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true })
    const first = await store.appendAssignment('employee-1', 'JFS0001', 'admin', null)
    const second = await store.appendAssignment('employee-1', 'JFS0002', 'admin', first.revision)
    expect(second.disposition).toBe('applied')
    expect(second.document.registry.assignments[0]?.employeeNumber).toBe('JFS0002')
    expect(second.document.registry.tombstones[0]?.employeeNumber).toBe('JFS0001')
    await expect(store.appendAssignment('employee-2', 'JFS0001', 'admin', second.revision)).rejects.toThrow('EMPLOYEE_NUMBER_RETIRED')
  })

  it('rejects a stale revision instead of overwriting another writer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true })
    const first = await store.appendAssignment('employee-1', 'JFS0001', 'admin', null)
    await expect(store.appendAssignment('employee-2', 'JFS0002', 'admin', null)).rejects.toThrow('MANAGED_IDENTITY_REVISION_CONFLICT')
    expect((await store.readExisting()).revision).toBe(first.revision)
  })
})
