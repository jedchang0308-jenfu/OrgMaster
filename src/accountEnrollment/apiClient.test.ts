import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_ENROLLMENT_API_PATH, AccountEnrollmentApiError, findExistingAccount, inviteEmployeeAccount, loadEmployeeAccountAccess } from './apiClient'

afterEach(() => vi.unstubAllGlobals())
describe('account enrollment api client', () => {
  it('encodes opaque employee ids as one path segment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ employee: { id: 'legacy/id', status: 'active' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await loadEmployeeAccountAccess('legacy/id')
    expect(fetchMock.mock.calls[0][0]).toBe(`${ACCOUNT_ENROLLMENT_API_PATH}/employees/legacy%2Fid`)
  })
  it('sends email only in JSON POST body and exposes typed errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'WORK_EMAIL_INVALID', field: 'email' }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(inviteEmployeeAccount({ commandId: 'cmd', employeeId: 'employee-1', email: 'x@orgmaster.test' })).rejects.toBeInstanceOf(AccountEnrollmentApiError)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${ACCOUNT_ENROLLMENT_API_PATH}/invitations`)
    expect(JSON.parse(init.body as string).email).toBe('x@orgmaster.test')
  })
  it('uses same-origin credentials for candidate lookup', async () => { const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidateToken: 'token' }), { status: 200 })); vi.stubGlobal('fetch', fetchMock); await findExistingAccount({ employeeId: 'employee-1', email: 'x@orgmaster.test' }); expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', method: 'POST' }) })
})
