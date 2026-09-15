import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignManagedEmployeeNumber, loadManagedIdentity, MANAGED_IDENTITY_API_PATH, ManagedIdentityApiError } from './apiClient'

afterEach(() => vi.unstubAllGlobals())

describe('managed identity api client', () => {
  it('encodes the Employee ID as one opaque path segment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ employee: { id: 'employee-1' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await loadManagedIdentity('employee/one')
    expect(fetchMock.mock.calls[0][0]).toBe(`${MANAGED_IDENTITY_API_PATH}/employee%2Fone/managed-identity`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' })
  })

  it('sends expected revision and normalised number in the JSON mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ employeeNumber: { value: 'JFS0001' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await assignManagedEmployeeNumber('employee-1', { commandId: 'cmd-1', expectedRegistryRevision: null, employeeNumber: 'JFS0001' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${MANAGED_IDENTITY_API_PATH}/employee-1/employee-number`)
    expect(init).toMatchObject({ method: 'PUT', credentials: 'same-origin' })
    expect(JSON.parse(init.body as string)).toMatchObject({ commandId: 'cmd-1', expectedRegistryRevision: null, employeeNumber: 'JFS0001' })
  })

  it('maps non-2xx responses to a typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'REVISION_CONFLICT' }), { status: 409 })))
    await expect(loadManagedIdentity('employee-1')).rejects.toBeInstanceOf(ManagedIdentityApiError)
  })
})
