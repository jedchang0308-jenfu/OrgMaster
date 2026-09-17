import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createManagedIdentityStore } from './orgmasterManagedIdentityStore'

describe('managed identity local registry', () => {
  it('persists a number, returns a revision, and keeps a tombstone on correction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true })
    const first = await store.appendAssignment('employee-1', 'JFS0001', 'admin', '0')
    const second = await store.appendAssignment('employee-1', 'JFS0002', 'admin', first.revision)
    const state = await store.readExisting()
    expect(second.disposition).toBe('applied')
    expect(state.document.registry.assignments[0]?.employeeNumber).toBe('JFS0002')
    expect(state.document.registry.tombstones[0]?.employeeNumber).toBe('JFS0001')
    await expect(store.appendAssignment('employee-2', 'JFS0001', 'admin', '0')).rejects.toThrow('EMPLOYEE_NUMBER_RETIRED')
  })

  it('rejects a stale revision instead of overwriting another writer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true })
    await store.appendAssignment('employee-1', 'JFS0001', 'admin', '0')
    await expect(store.appendAssignment('employee-1', 'JFS0002', 'admin', '0')).rejects.toThrow('MANAGED_IDENTITY_REVISION_CONFLICT')
  })

  it('keeps the employee assignment revision stable across candidate writes and replays one confirm receipt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true, now: () => new Date('2026-09-17T01:00:00.000Z') })
    const assigned = await store.appendAssignment('employee-1', 'JFS0001', 'admin', '0')
    expect(assigned.revision).toBe('1')
    const candidate = await store.createCandidate({
      employeeId: 'employee-1', employeeNumber: 'JFS0001', expectedPrimaryEmail: 'person@orgmaster.test',
      directoryCustomerId: 'customer-1', directoryUserId: 'user-1', primaryEmail: 'person@orgmaster.test', sourceEtag: 'etag-1',
      workspaceRevision: 'test-revision', registryRevision: '1', actor: 'principal-admin',
    })
    expect(candidate.registryRevision).toBe('1')
    const request = { commandId: 'command-1', employeeId: 'employee-1', candidateToken: candidate.token, expectedWorkspaceRevision: 'test-revision', expectedRegistryRevision: '1', actor: 'principal-admin' }
    const preflight = await store.readCandidateForConfirmation(request)
    expect(preflight).toMatchObject({ kind: 'candidate', snapshot: { employeeNumber: 'JFS0001', primaryEmail: 'person@orgmaster.test' } })
    const first = await store.confirmCandidate(request)
    const replay = await store.readCandidateForConfirmation(request)
    const second = await store.confirmCandidate(request)
    expect(replay).toEqual({ kind: 'replayed', identityRecordId: first.identityRecordId })
    expect(second).toEqual(first)
    const state = await store.readExisting()
    expect(state.document.managedDailyIdentities).toHaveLength(1)
    expect(state.document.commandReceipts).toHaveLength(1)
    expect(state.document.auditEvents.filter((event) => event.action === 'managed_identity_link_confirmed')).toHaveLength(1)
    expect(state.document.registry.assignments[0]?.revision).toBe(1)
  })

  it('converges concurrent retries with the same command to one identity and one receipt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true, now: () => new Date('2026-09-17T01:00:00.000Z') })
    await store.appendAssignment('employee-1', 'JFS0001', 'admin', '0')
    const candidate = await store.createCandidate({ employeeId: 'employee-1', employeeNumber: 'JFS0001', expectedPrimaryEmail: 'person@orgmaster.test', directoryCustomerId: 'customer-1', directoryUserId: 'user-1', primaryEmail: 'person@orgmaster.test', sourceEtag: 'etag-1', workspaceRevision: 'test-revision', registryRevision: '1', actor: 'principal-admin' })
    const request = { commandId: 'command-concurrent', employeeId: 'employee-1', candidateToken: candidate.token, expectedWorkspaceRevision: 'test-revision', expectedRegistryRevision: '1', actor: 'principal-admin' }
    const [first, second] = await Promise.all([store.confirmCandidate(request), store.confirmCandidate(request)])
    expect(second).toEqual(first)
    const state = await store.readExisting()
    expect(state.document.managedDailyIdentities).toHaveLength(1)
    expect(state.document.commandReceipts).toHaveLength(1)
    expect(state.document.auditEvents.filter((event) => event.action === 'managed_identity_link_confirmed')).toHaveLength(1)
  })

  it('binds only a present pending identity and treats the same auth pair as a no-op', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-managed-identity-'))
    const store = createManagedIdentityStore({ root, devEnabled: true, now: () => new Date('2026-09-17T01:00:00.000Z') })
    await store.appendAssignment('employee-1', 'JFS0001', 'admin', '0')
    const candidate = await store.createCandidate({ employeeId: 'employee-1', employeeNumber: 'JFS0001', expectedPrimaryEmail: 'person@orgmaster.test', directoryCustomerId: 'customer-1', directoryUserId: 'user-1', primaryEmail: 'person@orgmaster.test', sourceEtag: 'etag-1', workspaceRevision: 'test-revision', registryRevision: '1', actor: 'principal-admin' })
    await store.confirmCandidate({ commandId: 'command-1', employeeId: 'employee-1', candidateToken: candidate.token, expectedWorkspaceRevision: 'test-revision', expectedRegistryRevision: '1', actor: 'principal-admin' })
    const current = await store.readExisting()
    await store.setAdmission(true, current.document.admissionAuthority!.revision, 'admin', 'test')
    const first = await store.bindAuth({ employeeId: 'employee-1', issuer: 'issuer', subject: 'subject', email: 'person@orgmaster.test', commandId: 'bind-1' })
    const second = await store.bindAuth({ employeeId: 'employee-1', issuer: 'issuer', subject: 'subject', email: 'person@orgmaster.test', commandId: 'bind-2' })
    expect(second).toEqual(first)
    const state = await store.readExisting()
    expect(state.document.auditEvents.filter((event) => event.action === 'managed_identity_auth_bound')).toHaveLength(1)
  })
})
