import { describe, expect, it, vi } from 'vitest'
import { fmsRevocationCommand, parseFmsRevocationReceipt } from '../scripts/lib/orgmaster-fms-revocation-wire.mts'
import { createOrgmasterFmsRevocationClient } from './orgmasterFmsRevocationClient'

const origin = 'http://localhost:1000'
const path = '/api/internal/fms-session-revocation/v1'
const operation = { operationId: 'bcafa699-835b-4798-9462-85415bfb1211', prepareEventId: 'da47c265-177b-4da5-ab49-19449884eb66',
  terminalEventId: '5bda1553-a463-457e-95d2-ad7614dd0fe2', baselineVersion: 'a'.repeat(64),
  targetVersion: 'b'.repeat(64), principalIds: ['principal-1'] }
const command = fmsRevocationCommand(operation, 'prepare', null)
const receipt = { contractVersion: 'jf-fms.session-revocation-receipt.v1', receiptId: '57bb43b0-38cc-46af-8584-29a96849d482',
  operationId: operation.operationId, eventId: operation.prepareEventId, phase: 'prepare', digest: command.digest,
  appliedAt: '2026-11-15T00:00:00.000Z' }

describe('OrgMaster FMS revocation client', () => {
  it('recovers the original receipt after a lost dispatch response without another dispatch', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(Response.json(receipt))
    const tokenProvider = vi.fn(async () => 'orgmaster-oidc-fixture')
    const client = createOrgmasterFmsRevocationClient({ local: true, fetch: request, tokenProvider })
    await expect(client.dispatch(command)).resolves.toEqual(receipt)
    expect(request.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      [`${origin}${path}/readback`, 'POST', JSON.stringify(command)],
      [`${origin}${path}`, 'POST', JSON.stringify(command)],
      [`${origin}${path}/readback`, 'POST', JSON.stringify(command)],
    ])
    expect(tokenProvider.mock.calls).toEqual([[origin], [origin], [origin]])
    expect(request.mock.calls[1][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer orgmaster-oidc-fixture' } })
  })

  it('accepts only a receipt that matches the same event, decision and command fingerprint', () => {
    const published = fmsRevocationCommand(operation, 'published', receipt.receiptId)
    const cancelled = fmsRevocationCommand(operation, 'cancelled', receipt.receiptId)
    expect(published.eventId).toBe(operation.terminalEventId)
    expect(published.digest).not.toBe(cancelled.digest)
    expect(published.prepareReceiptId).toBe(receipt.receiptId)
    expect(() => parseFmsRevocationReceipt(receipt, published)).toThrow('FMS_REVOCATION_RECEIPT_INVALID')
    expect(() => parseFmsRevocationReceipt({ ...receipt, digest: 'c'.repeat(64) }, command)).toThrow('FMS_REVOCATION_RECEIPT_INVALID')
    expect(() => fmsRevocationCommand(operation, 'published', null)).toThrow('FMS_REVOCATION_COMMAND_INVALID')
    expect(() => fmsRevocationCommand({ ...operation, principalIds: ['principal-2', 'principal-1'] }, 'prepare', null))
      .toThrow('FMS_REVOCATION_COMMAND_INVALID')
  })
})
