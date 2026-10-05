import { mkdtemp, rm } from 'node:fs/promises'
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

describe('employee number command receipt', () => {
  async function fixture(run: (store: ReturnType<typeof createManagedIdentityStore>) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-number-command-'))
    try { await run(createManagedIdentityStore({ root, devEnabled: true })) }
    finally { if (!root.startsWith(join(tmpdir(), 'orgmaster-number-command-'))) throw new Error('Unsafe task cleanup target'); await rm(root, { recursive: true, force: true }) }
  }
  const request = { commandId: 'number-command-1', employeeId: 'employee-1', employeeNumber: 'JFS0001', actor: 'principal-admin', expectedRegistryRevision: '0', expectedWorkspaceRevision: 'workspace-1' }
  it('replays the committed result before the original revision CAS without another audit', async () => fixture(async store => {
    const first = await store.assignNumberCommand(request)
    const second = await store.assignNumberCommand({ ...request, employeeNumber: ' jfs0001 ' })
    expect(first.disposition).toBe('applied')
    expect(second).toMatchObject({ disposition: 'replayed', assignment: first.assignment, revision: first.revision })
    const state = await store.readExisting()
    expect(state.document.commandReceipts).toHaveLength(1)
    expect(state.document.auditEvents).toHaveLength(1)
    expect(state.document.auditEvents[0]).toMatchObject({ commandId: request.commandId, actor: request.actor })
  }))
  it('converges simultaneous exact retries and rejects a changed payload or Principal', async () => fixture(async store => {
    await Promise.all([store.assignNumberCommand(request), store.assignNumberCommand(request)])
    for (const changed of [{ employeeNumber: 'JFS0002' }, { actor: 'another-principal' }, { employeeId: 'employee-2' }]) {
      await expect(store.assignNumberCommand({ ...request, ...changed })).rejects.toThrow('MANAGED_IDENTITY_IDEMPOTENCY_CONFLICT')
    }
    expect((await store.readExisting()).document.auditEvents).toHaveLength(1)
  }))
  it('retains CAS and non-reusable retired numbers for new commands', async () => fixture(async store => {
    await store.assignNumberCommand(request)
    await expect(store.assignNumberCommand({ ...request, commandId: 'stale', employeeNumber: 'JFS0002' })).rejects.toThrow('MANAGED_IDENTITY_REVISION_CONFLICT')
    await store.assignNumberCommand({ ...request, commandId: 'correct', employeeNumber: 'JFS0002', expectedRegistryRevision: '1' })
    await expect(store.assignNumberCommand({ ...request, commandId: 'reuse', employeeId: 'employee-2' })).rejects.toThrow('EMPLOYEE_NUMBER_RETIRED')
    expect((await store.readExisting()).document.commandReceipts).toHaveLength(2)
  }))
  it('treats null workspace revision as omitted CAS but still enforces current employee membership', async () => fixture(async store => {
    const initial = await store.readExisting()
    await store.commit(initial.revision, document => ({
      ...document,
      currentWorkspaceAuthority: { workspaceVersionId: 'workspace-current', workspaceRevision: 'workspace-current-revision', employeeIds: ['employee-1'] },
    }))

    const applied = await store.assignNumberCommand({ ...request, commandId: 'number-command-null-workspace', expectedWorkspaceRevision: null })
    expect(applied.disposition).toBe('applied')
    await expect(store.assignNumberCommand({
      ...request, commandId: 'number-command-null-workspace-non-member', employeeId: 'employee-2', employeeNumber: 'JFS0002', expectedWorkspaceRevision: null,
    })).rejects.toThrow('MANAGED_IDENTITY_REVISION_CONFLICT')
  }))
})
