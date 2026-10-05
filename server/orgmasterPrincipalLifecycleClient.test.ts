import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LifecycleClaimV2, LifecycleCycleControl } from './orgmasterManagedIdentitySync'
import { createOrgmasterPrincipalLifecycleClient, PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN, PrincipalLifecycleClientError } from './orgmasterPrincipalLifecycleClient'

const claim: LifecycleClaimV2 = {
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  operationId: '123e4567-e89b-42d3-a456-426614174002',
  sourceRevision: 'f'.repeat(40), snapshotHash: 'a'.repeat(64), leaseGeneration: 3,
}
const receipt = {
  contractVersion: 'platform.principal-lifecycle-receipt.v2',
  receiptId: '123e4567-e89b-42d3-a456-426614174001',
  eventId: claim.eventId, operationId: claim.operationId, sourceRevision: claim.sourceRevision, snapshotHash: claim.snapshotHash,
  deliveryPrincipalId: 'principal-workload:orgmaster-managed-identity-lifecycle',
  executorPrincipalId: 'principal-workload:platform-principal-lifecycle-invalidation', consumerOwner: 'platform', principalOnly: true,
}
const endpoint = `${PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN}/api/internal/principal-lifecycle/v2`

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function control(signal = new AbortController().signal, deadlineAt = performance.now() + 20_000): LifecycleCycleControl {
  return { signal, deadlineAt }
}
function jsonResponse(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }) }
function client(fetchImpl: typeof fetch, tokenProvider: (audience: string) => Promise<string> = vi.fn(async (_audience: string) => 'opaque-test-id-token'), now?: () => number) {
  return createOrgmasterPrincipalLifecycleClient({ tokenProvider, fetch: fetchImpl, ...(now ? { now } : {}) })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

 describe('OrgMaster principal lifecycle Platform client', () => {
  it('posts the fixed endpoint and exact minimal command using an ID token for the exact origin', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(receipt))
    const tokenProvider = vi.fn(async (_audience: string) => 'opaque-test-id-token')
    const result = await client(fetchImpl, tokenProvider).dispatch(claim, control())
    expect(tokenProvider).toHaveBeenCalledExactlyOnceWith(PLATFORM_PRINCIPAL_LIFECYCLE_ORIGIN)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(endpoint)
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('error')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer opaque-test-id-token')
    expect(JSON.parse(String(init?.body))).toEqual({ contractVersion: 'orgmaster.principal-lifecycle.v2', eventId: claim.eventId, snapshotHash: claim.snapshotHash })
    expect(result).toEqual({ eventId: receipt.eventId, operationId: receipt.operationId, sourceRevision: receipt.sourceRevision, snapshotHash: receipt.snapshotHash, receiptId: receipt.receiptId, deliveryPrincipalId: receipt.deliveryPrincipalId, executorPrincipalId: receipt.executorPrincipalId, consumerOwner: 'platform', principalOnly: true })
  })

  it.each([
    ['event UUID', { ...claim, eventId: 'not-a-uuid' }],
    ['operation id', { ...claim, operationId: '' }],
    ['snapshot hash', { ...claim, snapshotHash: 'A'.repeat(64) }],
    ['lease generation', { ...claim, leaseGeneration: 0 }],
  ])('rejects malformed %s before obtaining a token or dispatching', async (_label, invalidClaim) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(receipt))
    const tokenProvider = vi.fn(async () => 'token')
    await expect(client(fetchImpl, tokenProvider).dispatch(invalidClaim as LifecycleClaimV2, control())).rejects.toMatchObject({ code: 'claim_invalid' })
    expect(tokenProvider).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an expired caller deadline before token acquisition', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(receipt))
    const tokenProvider = vi.fn(async () => 'token')
    await expect(client(fetchImpl, tokenProvider).dispatch(claim, control(new AbortController().signal, performance.now() - 1))).rejects.toMatchObject({ code: 'dispatch_deadline' })
    expect(tokenProvider).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves the owner text operation identifier as supplied', async () => {
    const textOperationClaim = { ...claim, operationId: 'employee-state-transition:source-hash:42' }
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ...receipt, operationId: textOperationClaim.operationId }))
    const result = await client(fetchImpl).dispatch(textOperationClaim, control())
    expect(result.operationId).toBe(textOperationClaim.operationId)
  })

  it('fails closed for every malformed or mismatched receipt field', async () => {
    const invalidReceipts = [
      { ...receipt, contractVersion: 'platform.principal-lifecycle-receipt.v1' },
      { ...receipt, receiptId: 'not-a-uuid' },
      { ...receipt, eventId: '123e4567-e89b-42d3-a456-426614174099' },
      { ...receipt, operationId: 'other-operation' },
      { ...receipt, sourceRevision: 'other-source' },
      { ...receipt, snapshotHash: 'b'.repeat(64) },
      { ...receipt, deliveryPrincipalId: '' },
      { ...receipt, executorPrincipalId: '' },
      { ...receipt, consumerOwner: 'orgmaster' },
      { ...receipt, principalOnly: false },
      { ...receipt, extra: 'unexpected' },
    ]
    for (const invalid of invalidReceipts) {
      await expect(client(vi.fn<typeof fetch>(async () => jsonResponse(invalid))).dispatch(claim, control())).rejects.toMatchObject({ code: 'receipt_invalid' })
    }
  })

  it('rejects oversized declared and streamed response bodies', async () => {
    const tooLargeHeader = vi.fn<typeof fetch>(async () => new Response('x', { headers: { 'content-length': '4097' } }))
    await expect(client(tooLargeHeader).dispatch(claim, control())).rejects.toMatchObject({ code: 'receipt_invalid' })
    const tooLargeBody = vi.fn<typeof fetch>(async () => new Response('x'.repeat(4097)))
    await expect(client(tooLargeBody).dispatch(claim, control())).rejects.toMatchObject({ code: 'receipt_invalid' })
  })

  it('does not expose upstream error bodies or redirect responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('private-token-and-email', { status: 302, headers: { location: 'https://attacker.invalid' } }))
    await expect(client(fetchImpl).dispatch(claim, control())).rejects.toMatchObject({ code: 'dispatch_unavailable' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe(endpoint)
    await expect(client(vi.fn<typeof fetch>(async () => new Response('secret upstream detail', { status: 503 }))).dispatch(claim, control())).rejects.toThrow('PRINCIPAL_LIFECYCLE_DISPATCH_UNAVAILABLE')
  })

  it('aborts a hung token request and prevents late token completion from dispatching', async () => {
    const token = deferred<string>()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(receipt))
    const controller = new AbortController()
    const pending = client(fetchImpl, () => token.promise).dispatch(claim, control(controller.signal))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'dispatch_aborted' })
    token.resolve('opaque-test-id-token')
    await Promise.resolve()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('enforces the five second whole-dispatch deadline, aborts fetch, and rejects late response completion', async () => {
    vi.useFakeTimers()
    const response = deferred<Response>()
    let requestSignal: AbortSignal | undefined
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => { requestSignal = init?.signal as AbortSignal; return response.promise })
    const pending = client(fetchImpl, undefined, () => 0).dispatch(claim, control(new AbortController().signal, 20_000))
    const rejected = expect(pending).rejects.toMatchObject({ code: 'dispatch_deadline' })
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5_000)
    await rejected
    expect(requestSignal?.aborted).toBe(true)
    response.resolve(jsonResponse(receipt))
    await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('uses the earlier caller deadline and forwards cancellation to fetch', async () => {
    vi.useFakeTimers()
    const response = deferred<Response>()
    let requestSignal: AbortSignal | undefined
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => { requestSignal = init?.signal as AbortSignal; return response.promise })
    const pending = client(fetchImpl, undefined, () => 0).dispatch(claim, control(new AbortController().signal, 300))
    const rejected = expect(pending).rejects.toMatchObject({ code: 'dispatch_deadline' })
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    await rejected
    expect(requestSignal?.aborted).toBe(true)
    response.resolve(jsonResponse(receipt))
    await Promise.resolve()
  })

  it('rejects invalid token material without logging or dispatching', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(receipt))
    const log = vi.spyOn(console, 'error')
    await expect(client(fetchImpl, async () => 'bearer secret email@example.invalid').dispatch(claim, control())).rejects.toMatchObject({ code: 'dispatch_unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })
})
