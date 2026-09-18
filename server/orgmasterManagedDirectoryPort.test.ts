import { describe, expect, it, vi } from 'vitest'
import { createGoogleDirectoryReadOnlyPort, createLocalDeterministicDirectoryPort } from './orgmasterManagedDirectoryPort'

const auth = { getRequestHeaders: vi.fn(async () => ({ Authorization: 'Bearer test' })) }

function transport(body: Record<string, unknown>) {
  return vi.fn(async () => ({ status: 200, headers: new Headers(), json: async () => body }))
}

describe('Google Directory read-only adapter', () => {
  it('does not send an unsupported customer query and rejects a response without customerId', async () => {
    const request = transport({ id: 'user-1', primaryEmail: 'person@jenfu.com.tw', suspended: false, archived: false })
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: request })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, code: 'DIRECTORY_RESPONSE_INVALID' })
    expect(request.mock.calls[0]?.[0]).not.toContain('customer=')
  })

  it('rejects a suspended candidate', async () => {
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: transport({ id: 'user-1', customerId: 'customer-1', primaryEmail: 'person@jenfu.com.tw', suspended: true, archived: false }) })
    await expect(port.findExactCandidate('person@jenfu.com.tw')).resolves.toMatchObject({ ok: false, kind: 'candidate_miss', code: 'DIRECTORY_USER_INELIGIBLE' })
  })

  it('rejects a stable-key response whose user id changed', async () => {
    const port = createGoogleDirectoryReadOnlyPort({ customerId: 'customer-1', domain: 'jenfu.com.tw', auth, transport: transport({ id: 'other-user', customerId: 'customer-1', primaryEmail: 'person@jenfu.com.tw', suspended: false, archived: false }) })
    await expect(port.readByDirectoryKey('customer-1', 'user-1')).resolves.toMatchObject({ ok: false, kind: 'candidate_miss', code: 'DIRECTORY_CANDIDATE_MISMATCH' })
  })
})

describe('local deterministic Directory adapter', () => {
  it('preserves the fixture key as primary email during stable-key readback', async () => {
    const port = createLocalDeterministicDirectoryPort({
      customerId: 'customer-1',
      domain: 'jenfu.com.tw',
      users: { 'person@jenfu.com.tw': { userId: 'user-1', directoryState: 'present', sourceEtag: 'etag-1' } },
    })
    await expect(port.readByDirectoryKey('customer-1', 'user-1')).resolves.toMatchObject({
      ok: true,
      user: { customerId: 'customer-1', userId: 'user-1', primaryEmail: 'person@jenfu.com.tw', directoryState: 'present', sourceEtag: 'etag-1' },
    })
  })
})
