import { createServer } from 'node:http'
import { once } from 'node:events'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjedExternalService, parseProjedExternalDecision, parseProjedExternalNotification } from './orgmasterProjedExternal'
import { createProjedExternalMiddleware, PROJED_EXTERNAL_NOTIFICATION_PATH as path } from './orgmasterProjedExternalApi'
import { PROJED_EXTERNAL_VERSION } from '../src/governance/projedExternal'
const submit = { contractVersion: PROJED_EXTERNAL_VERSION, action: 'submit', requestId: '11111111-1111-4111-8111-111111111111', invitationId: 'invite-1', inviterPrincipalId: 'principal-owner', boardId: 'board-1', role: 'member', expiresAt: '2027-01-01T00:00:00.000Z', contactEmail: 'external@example.invalid', company: '', note: '' }
const bind = { contractVersion: PROJED_EXTERNAL_VERSION, action: 'bind', requestId: submit.requestId, principalId: 'principal-personal', googleSubject: 'verified-google-subject' }
describe('ProJED external qualification owner', () => {
  it('accepts pending notification without inventing an identity', () => expect(parseProjedExternalNotification(submit)).toEqual(submit))
  it('binds only exact trusted server identity fields', () => {
    expect(parseProjedExternalNotification(bind)).toEqual(bind)
    for (const value of [{ ...bind, email: submit.contactEmail }, { ...bind, googleSubject: '' }, { ...bind, principalId: null }]) expect(() => parseProjedExternalNotification(value)).toThrow('EXTERNAL_REQUEST_INVALID')
  })
  it('rejects unknown or oversized fields and invalid requests', () => {
    for (const value of [{ ...submit, token: 'untrusted' }, { ...submit, requestId: 'not-a-uuid' }, { ...submit, company: null }, { ...submit, note: 'a'.repeat(2001) }, { ...submit, expiresAt: 'invalid' }]) expect(() => parseProjedExternalNotification(value)).toThrow('EXTERNAL_REQUEST_INVALID')
  })
  it('requires a CAS revision and idempotent command identity', () => {
    const command = { commandId: submit.requestId, requestId: submit.requestId, expectedRevision: '1', action: 'approve', note: '' }
    expect(parseProjedExternalDecision(command)).toEqual(command)
    expect(() => parseProjedExternalDecision({ ...command, expectedRevision: '0' })).toThrow()
  })
  it('uses only the owner function and verified session context', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result: { status: 'PENDING' } }] })
    const service = createProjedExternalService({ query })
    await service.notify(submit)
    expect(query.mock.calls[0][0]).toContain('orgmaster_core.notify_projed_external_request_v1')
    await service.manage({ principalId: 'admin', employeeId: 'employee', issuer: 'issuer', subject: 'subject', bootstrap: false, sessionId: 'trusted-session', principalAuthEpoch: 3, authenticatedAt: '2026-11-20T00:00:00Z', assuranceLevel: 'aal1' })
    expect(JSON.parse(query.mock.calls[1][1][0])).toMatchObject({ principalId: 'admin', sessionId: 'trusted-session', principalAuthEpoch: 3 })
  })
  it.each([['EXTERNAL_IDENTITY_CONFLICT', 409], ['EXTERNAL_ADMIN_REQUIRED', 403], ['IDENTITY_CONTEXT_REQUIRED', 401], ['unexpected SQL details', 503]])('sanitizes %s failures', async (message, status) => {
    const service = createProjedExternalService({ query: vi.fn().mockRejectedValue(new Error(message)) })
    await expect(service.notify(submit)).rejects.toMatchObject({ status })
  })
  it.each([['EXTERNAL_CONFLICT', 409], ['EXTERNAL_ADMIN_REQUIRED', 403], ['unexpected SQL details', 503]])('maps trusted database %s from a different adapter realm', async (message, status) => {
    const failure = runInNewContext('new Error(message)', { message })
    expect(failure instanceof Error).toBe(false)
    const service = createProjedExternalService({ query: vi.fn().mockRejectedValue(failure) })
    await expect(service.notify(submit)).rejects.toMatchObject({ status,
      code: status === 503 ? 'EXTERNAL_QUALIFICATION_UNAVAILABLE' : message })
  })
})

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))) })
async function http(service = { notify: vi.fn().mockResolvedValue({ status: 'PENDING' }), manage: vi.fn() }, verify = vi.fn().mockResolvedValue({ email: 'fixture', subject: 'fixture' })) {
  const middleware = createProjedExternalMiddleware(service, { verify }, 'internal')
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error()
  return { url: `http://127.0.0.1:${address.port}${path}`, service, verify }
}
describe('ProJED external workload HTTP boundary', () => {
  it.each([['EXTERNAL_CONFLICT', 409, 409], ['private SQL details', 409, 503], ['EXTERNAL_CONFLICT', 200, 503]])('preserves only exact typed owner errors across compiled service ports: %s/%s', async (code, status, expectedStatus) => {
    const failure = runInNewContext('Object.assign(new Error(code), { code, status })', { code, status })
    const test = await http({ notify: vi.fn().mockRejectedValue(failure), manage: vi.fn() })
    const response = await fetch(test.url, { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(submit) })
    expect(response.status).toBe(expectedStatus)
    expect(await response.json()).toEqual({ code: expectedStatus === 503 ? 'EXTERNAL_QUALIFICATION_UNAVAILABLE' : code })
  })
  it('authenticates the caller before passing exact request', async () => {
    const test = await http()
    const response = await fetch(test.url, { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(submit) })
    expect(response.status).toBe(200); expect(test.verify).toHaveBeenCalledWith('fixture'); expect(test.service.notify).toHaveBeenCalledWith(submit)
  })
  it.each([{ Cookie: 'session=fixture' }, { Origin: 'https://untrusted.invalid' }, {}])('rejects browser or unauthenticated requests', async extra => {
    const test = await http()
    const response = await fetch(test.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(submit) })
    expect([400, 401]).toContain(response.status); expect(test.service.notify).not.toHaveBeenCalled()
  })
  it('rejects an invalid service proof without mutation', async () => {
    const service = { notify: vi.fn(), manage: vi.fn() }
    const test = await http(service, vi.fn().mockRejectedValue(new Error('raw credential details')))
    const response = await fetch(test.url, { method: 'POST', headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(bind) })
    expect(response.status).toBe(401); expect(await response.text()).not.toContain('raw credential'); expect(service.notify).not.toHaveBeenCalled()
  })
})
