import { describe, expect, it, vi } from 'vitest'
import { parseManagedLoginRequest, type ManagedLoginIdentity } from './orgmasterManagedLoginContract'
import { createManagedLoginOwnerService, ManagedLoginOwnerError, expectedManagedLoginIdentityMatches } from './orgmasterManagedLoginService'
import type { ManagedIdentityRepositoryV1 } from './orgmasterManagedIdentityRepository'
import type { ManagedDirectoryPortV1 } from './orgmasterManagedDirectoryPort'

const pending: ManagedLoginIdentity = {
  employeeId: 'employee-5', principalId: 'principal-5', employeeNumber: 'JFS0005', directoryCustomerId: 'C01', directoryUserId: 'google-5',
  identityRecordId: 'identity-5', identityRevision: '900719925474099312345', registryRevision: '8', linkState: 'directory_linked_pending_auth', pair: null,
}
const active: ManagedLoginIdentity & { linkState: 'active'; pair: { issuer: string; subject: string } } = {
  ...pending, identityRevision: '900719925474099312346', linkState: 'active', pair: { issuer: 'https://securetoken.google.com/jenfu', subject: 'firebase-5' },
}
const caller = { email: 'platform@jenfu.example', subject: 'platform-subject' }
const token = { issuer: active.pair.issuer, subject: active.pair.subject, assuranceLevel: 'aal1' as const, authenticatedAt: '2026-09-17T00:00:00.000Z', signInProvider: 'google.com', email: 'jedchang0308@jenfu.com.tw', emailVerified: true, googleUserId: 'google-5' }

function repository(overrides: Partial<ManagedIdentityRepositoryV1> = {}) {
  return {
    mode: 'local-json',
    reserveDirectoryRead: vi.fn(async () => undefined),
    resolveManagedLoginAlias: vi.fn(async () => pending),
    readManagedLoginIdentity: vi.fn(async () => pending),
    verifyManagedLoginIdentity: vi.fn(async () => ({ identity: active, mappingVersion: '44' })),
    ...overrides,
  } as unknown as ManagedIdentityRepositoryV1
}

function directory(primaryEmail = token.email): ManagedDirectoryPortV1 {
  return {
    mode: 'mocked-google', writeOperations: 0,
    async findExactCandidate() { throw new Error('not used') },
    async readByDirectoryKey(customerId, userId) { return { ok: true, observedAt: '2026-09-17T00:00:01.000Z', user: { customerId, userId, primaryEmail, directoryState: 'present', sourceEtag: 'etag' } } },
  }
}

function service(options: { repository?: ManagedIdentityRepositoryV1; directory?: ManagedDirectoryPortV1 } = {}) {
  return createManagedLoginOwnerService({
    repository: options.repository ?? repository(), directory: options.directory ?? directory(),
    firebase: { verifyIdToken: vi.fn(async () => token) }, directoryCustomerId: 'C01', now: () => new Date('2026-09-17T00:01:00.000Z'),
  })
}

describe('DEV-049 managed login owner contract', () => {
  it('rejects unknown fields and invalid state/pair combinations', () => {
    expect(() => parseManagedLoginRequest({ contractVersion: 'jenfu.managed-login.v1', action: 'resolveAlias', requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', employeeNumber: 'JFS0005', extra: true })).toThrow('request_invalid')
    expect(() => parseManagedLoginRequest({ contractVersion: 'jenfu.managed-login.v1', action: 'verifyIdentity', requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', directoryCustomerId: 'C01', idToken: 'token', expected: { ...pending, linkState: 'active' } })).toThrow('request_invalid')
  })

  it('resolves only normalized employee-number aliases without exposing email', async () => {
    const value = await service().resolveAlias({ requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', employeeNumber: ' jfs0005 ', caller })
    expect(value.match).toEqual(pending)
    expect(JSON.stringify(value)).not.toContain('@jenfu.com.tw')
  })

  it('verifies Firebase and Directory stable keys before one-step pending activation', async () => {
    const repo = repository()
    const value = await service({ repository: repo }).verifyIdentity({ requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', directoryCustomerId: 'C01', idToken: 'firebase-token', expected: pending, caller })
    expect(repo.readManagedLoginIdentity).toHaveBeenCalledWith('C01', 'google-5')
    expect(repo.verifyManagedLoginIdentity).toHaveBeenCalledWith(expect.objectContaining({ current: pending, issuer: active.pair.issuer, subject: active.pair.subject, actor: caller.subject, requestHash: expect.stringMatching(/^[0-9a-f]{64}$/) }))
    expect(value.identity).toEqual(active)
    expect(value.authenticatedAt).toBe(token.authenticatedAt)
  })

  it('denies token email mismatch and stale expected revisions', async () => {
    await expect(service({ directory: directory('other@jenfu.com.tw') }).verifyIdentity({ requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', directoryCustomerId: 'C01', idToken: 'firebase-token', expected: pending, caller })).rejects.toMatchObject<ManagedLoginOwnerError>({ status: 403, code: 'managed_identity_denied' })
    await expect(service().verifyIdentity({ requestId: '82b4d57e-ec70-4dc7-95c3-79c94ca028b8', directoryCustomerId: 'C01', idToken: 'firebase-token', expected: { ...pending, identityRevision: '1' }, caller })).rejects.toMatchObject<ManagedLoginOwnerError>({ status: 409, code: 'identity_changed' })
  })

  it('allows only the exact concurrent pending-to-active transition with unchanged registry revision', () => {
    expect(expectedManagedLoginIdentityMatches(pending, active, active.pair)).toBe(true)
    expect(expectedManagedLoginIdentityMatches(pending, { ...active, identityRevision: '900719925474099312347' }, active.pair)).toBe(false)
    expect(expectedManagedLoginIdentityMatches(pending, { ...active, registryRevision: '9' }, active.pair)).toBe(false)
  })
})
