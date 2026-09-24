import { describe, expect, it, vi } from 'vitest'
import { createPrincipalAdmissionRepository, PrincipalAdmissionError } from './orgmasterPrincipalAdmissionRepository'

describe('OrgMaster session principal admission', () => {
  it('reads the app-scoped view and requires its contract version', async () => {
    const query = vi.fn(async () => ({ rows: [{ contract_version: 'orgmaster.session-principal.v2', principal_issuer: 'issuer', principal_subject: 'subject', principal_id: 'principal', employee_id: 'employee', employee_status: 'active', mapping_version: '42', published_at: '2026-09-17T00:00:00.000Z' }] }))
    const result = await createPrincipalAdmissionRepository({ query, end: vi.fn() }).resolveActivePrincipal('issuer', 'subject')
    expect(query.mock.calls[0][0]).toContain('v_orgmaster_session_principals_v2')
    expect(result).toMatchObject({ principalId: 'principal', employeeId: 'employee', mappingVersion: 42 })
  })

  it('rejects the shared or malformed contract instead of falling back', async () => {
    const query = vi.fn(async () => ({ rows: [{ contract_version: 'orgmaster.session-principal.v1', principal_issuer: 'issuer', principal_subject: 'subject', principal_id: 'principal', employee_id: 'employee', employee_status: 'active', mapping_version: '42', published_at: '2026-09-17T00:00:00.000Z' }] }))
    await expect(createPrincipalAdmissionRepository({ query, end: vi.fn() }).resolveActivePrincipal('issuer', 'subject')).rejects.toMatchObject({ code: 'auth_contract_mismatch' } satisfies Partial<PrincipalAdmissionError>)
  })
})
