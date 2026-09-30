import { describe, expect, it, vi } from 'vitest'
import { createOrgmasterSessionRepository } from './orgmasterSessionRepository'

describe('OrgMaster Principal session authenticatedAt persistence', () => {
  it('writes and reads provider-authenticated time independently from issuedAt', async () => {
    const authenticatedAt = '2026-09-02T11:55:00.000Z'
    const issuedAt = '2026-09-02T12:00:00.000Z'
    const query = vi.fn(async (sql: string, values: unknown[]) => ({
      rowCount: 1,
      rows: [{
        id: 'session-1', identity_issuer: 'issuer', identity_subject: 'subject', principal_id: 'principal-1', employee_id: 'employee-1',
        auth_epoch: 0, session_schema_version: 2, epoch_kind: 'principal', principal_auth_epoch: 7,
        authenticated_at: authenticatedAt, issued_at: issuedAt, expires_at: '2026-09-02T20:00:00.000Z',
        revoked_at: null, assurance_level: 'aal2',
      }],
      sql,
      values,
    }))
    const repository = createOrgmasterSessionRepository({ query, end: vi.fn() } as any)
    const session = await repository.create({
      sessionIdHash: 'a'.repeat(64), identityIssuer: 'issuer', identitySubject: 'subject', principalId: 'principal-1', employeeId: 'employee-1',
      authEpoch: 0, sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 7, authenticatedAt, issuedAt, expiresAt: '2026-09-02T20:00:00.000Z', assuranceLevel: 'aal2',
    })
    expect(session.sessionSchemaVersion).toBe(2)
    expect(session.principalAuthEpoch).toBe(7)
    expect(session.authenticatedAt).toBe(authenticatedAt)
    expect(session.issuedAt).toBe(issuedAt)
    expect(query.mock.calls[0][0]).toContain('authenticated_at')
    expect(query.mock.calls[0][1]).toContain(authenticatedAt)
  })

  it('rejects a provider-pair session insert before touching the database', async () => {
    const query = vi.fn()
    const repository = createOrgmasterSessionRepository({ query, end: vi.fn() } as any)
    await expect(repository.create({
      sessionIdHash: 'a'.repeat(64), identityIssuer: 'issuer', identitySubject: 'subject',
      principalId: 'principal-1', employeeId: 'employee-1', authEpoch: 0,
      sessionSchemaVersion: 1, epochKind: 'provider_pair', principalAuthEpoch: null,
      authenticatedAt: '2026-09-02T11:55:00.000Z', issuedAt: '2026-09-02T12:00:00.000Z',
      expiresAt: '2026-09-02T20:00:00.000Z', assuranceLevel: 'aal1',
    } as never)).rejects.toThrow('invalid principal session epoch binding')
    expect(query).not.toHaveBeenCalled()
  })
})
