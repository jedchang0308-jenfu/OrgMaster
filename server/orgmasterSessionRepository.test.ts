import { describe, expect, it, vi } from 'vitest'
import { createOrgmasterSessionRepository } from './orgmasterSessionRepository'

describe('OrgMaster session authenticatedAt persistence', () => {
  it('writes and reads provider-authenticated time independently from issuedAt', async () => {
    const authenticatedAt = '2026-09-02T11:55:00.000Z'
    const issuedAt = '2026-09-02T12:00:00.000Z'
    const query = vi.fn(async (sql: string, values: unknown[]) => ({
      rowCount: 1,
      rows: [{
        id: 'session-1', identity_issuer: 'issuer', identity_subject: 'subject', principal_id: 'principal-1', employee_id: 'employee-1',
        auth_epoch: 0, authenticated_at: authenticatedAt, issued_at: issuedAt, expires_at: '2026-09-02T20:00:00.000Z',
        revoked_at: null, assurance_level: 'aal2',
      }],
      sql,
      values,
    }))
    const repository = createOrgmasterSessionRepository({ query, end: vi.fn() } as any)
    const session = await repository.create({
      sessionIdHash: 'a'.repeat(64), identityIssuer: 'issuer', identitySubject: 'subject', principalId: 'principal-1', employeeId: 'employee-1',
      authEpoch: 0, authenticatedAt, issuedAt, expiresAt: '2026-09-02T20:00:00.000Z', assuranceLevel: 'aal2',
    })
    expect(session.authenticatedAt).toBe(authenticatedAt)
    expect(session.issuedAt).toBe(issuedAt)
    expect(query.mock.calls[0][0]).toContain('authenticated_at')
    expect(query.mock.calls[0][1]).toContain(authenticatedAt)
  })
})
