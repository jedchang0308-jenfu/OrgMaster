import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createProjedUsersService, parseProjedUserCommand } from './orgmasterProjedUsers'
import { createProjedExternalMiddleware, PROJED_USERS_MANAGEMENT_PATH } from './orgmasterProjedExternalApi'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { createOrgmasterAuthRuntime } from './orgmasterAuthApi'
import * as databases from './orgmasterDatabase'
import { requireOrgmasterLocalSandboxDatabase, withOrgmasterLocalSandboxPersistenceTarget } from './orgmasterPersistenceRepository'
const command = { commandId: '11111111-1111-4111-8111-111111111111', googleSubject: 'verified-subject', expectedRevision: '2:7', action: 'disable' }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('ProJED users in verified local sandbox request scope', () => {
  const actor = { principalId: 'trusted-principal', sessionId: 'trusted-session', principalAuthEpoch: 4, authenticatedAt: new Date().toISOString(), assuranceLevel: 'aal1' } as never
  const localUrl = 'postgres://sandbox_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_test'
  const environment = { NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1' }

  it('includes the sandbox service but rejects requests outside verified scope without consulting formal or environment databases', async () => {
    vi.stubEnv('ORGMASTER_POSTGRES_URL', 'postgres://unused.invalid/formal')
    const formal = vi.spyOn(databases, 'createOrgmasterDatabase')
    const local = vi.spyOn(databases, 'createOrgmasterLocalSandboxDatabase')
    const runtime = createOrgmasterAuthRuntime(environment)
    try {
      expect(runtime.localSandbox?.enabledCandidate).toBe(true)
      expect(runtime.projedUsers).toBeDefined()
      expect(runtime.sessions).toBeUndefined()
      expect(() => requireOrgmasterLocalSandboxDatabase()).toThrow('PERSISTENCE_NOT_CONFIGURED')
      await expect(runtime.projedUsers!.manage(actor)).rejects.toMatchObject({ status: 503, code: 'PROJED_USER_DIRECTORY_UNAVAILABLE' })
      expect(formal).not.toHaveBeenCalled()
      expect(local).not.toHaveBeenCalled()
    } finally { await runtime.localSandbox?.close() }
  })

  it('resolves the verified local target for each request and uses the same identity-bound management SQL', async () => {
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    const value = { contractVersion: 'orgmaster.projed-users.v1', users: [] }
    const query = vi.fn().mockResolvedValue({ rows: [{ result: value }] })
    const local = vi.spyOn(databases, 'createOrgmasterLocalSandboxDatabase').mockReturnValue({ query, end: vi.fn() })
    const formal = vi.spyOn(databases, 'createOrgmasterDatabase')
    const runtime = createOrgmasterAuthRuntime(environment)
    try {
      expect(await withOrgmasterLocalSandboxPersistenceTarget(localUrl, () => runtime.projedUsers!.manage(actor, command))).toEqual(value)
      const secondUrl = localUrl.replace('53761', '53762')
      expect(await withOrgmasterLocalSandboxPersistenceTarget(secondUrl, () => runtime.projedUsers!.manage(actor))).toEqual(value)
      expect(local.mock.calls.map(args => args[0])).toEqual([localUrl, secondUrl])
      expect(formal).not.toHaveBeenCalled()
      expect(query.mock.calls.map(args => args[0])).toEqual(Array(2).fill('SELECT orgmaster_core.manage_projed_user_v1($1::jsonb,$2::jsonb) AS result'))
      expect(JSON.parse(query.mock.calls[0][1][0])).toMatchObject({ kind: 'principal', principalId: 'trusted-principal', sessionId: 'trusted-session', principalAuthEpoch: 4, assuranceLevel: 'aal1' })
      expect(JSON.parse(query.mock.calls[0][1][1])).toEqual(command)
      expect(query.mock.calls[1][1][1]).toBeNull()
      await expect(runtime.projedUsers!.manage(actor)).rejects.toMatchObject({ status: 503 })
      expect(query).toHaveBeenCalledTimes(2)
    } finally { await runtime.localSandbox?.close() }
  })

  it('preserves the same SQL administrator denial inside a verified local scope', async () => {
    vi.stubEnv('ORGMASTER_POSTGRES_URL', '')
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', '')
    const query = vi.fn().mockRejectedValue(new Error('PROJED_USER_ADMIN_REQUIRED'))
    vi.spyOn(databases, 'createOrgmasterLocalSandboxDatabase').mockReturnValue({ query, end: vi.fn() })
    const runtime = createOrgmasterAuthRuntime(environment)
    try {
      await expect(withOrgmasterLocalSandboxPersistenceTarget(localUrl, () => runtime.projedUsers!.manage(actor, command)))
        .rejects.toMatchObject({ status: 403, code: 'PROJED_USER_ADMIN_REQUIRED' })
      expect(query).toHaveBeenCalledOnce()
    } finally { await runtime.localSandbox?.close() }
  })
})

describe('ProJED account directory owner boundary', () => {
  it('requires an exact identity-bound CAS command, never an email or actor supplied by the browser', () => {
    expect(parseProjedUserCommand(command)).toEqual(command)
    for (const row of [{ ...command, email: 'somebody@example.invalid' }, { ...command, principalId: 'forged' }, { ...command, expectedRevision: '2' }, { ...command, googleSubject: '' }, { ...command, action: 'approve' }]) {
      expect(() => parseProjedUserCommand(row)).toThrow('PROJED_USER_REQUEST_INVALID')
    }
  })
  it('calls only the metadata management function with verified human context', async () => {
    const value = { contractVersion: 'orgmaster.projed-users.v1', users: [] }
    const query = vi.fn().mockResolvedValue({ rows: [{ result: value }] })
    const before = vi.fn()
    const service = createProjedUsersService({ query }, before)
    const actor = { kind: 'principal', principalId: 'trusted-principal', sessionId: 'trusted-session', principalAuthEpoch: 4, authenticatedAt: new Date().toISOString() } as never
    expect(await service.manage(actor, command)).toEqual(value)
    expect(before).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][0]).toBe('SELECT orgmaster_core.manage_projed_user_v1($1::jsonb,$2::jsonb) AS result')
    expect(JSON.parse(query.mock.calls[0][1][0])).toMatchObject({ principalId: 'trusted-principal' })
  })
  it.each([['PROJED_USER_CONFLICT',409],['PROJED_USER_ADMIN_REQUIRED',403],['IDENTITY_CONTEXT_REQUIRED',401],['secret database detail',503]])('returns only the closed error vocabulary: %s', async (message,status) => {
    const service = createProjedUsersService({ query: vi.fn().mockRejectedValue({ message }) })
    await expect(service.manage({ principalId: 'trusted' } as never)).rejects.toMatchObject({ status, code: status === 503 ? 'PROJED_USER_DIRECTORY_UNAVAILABLE' : message })
  })
})

describe('ProJED account management HTTP boundary', () => {
 const servers: ReturnType<typeof createServer>[] = []
 afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())) } })
 async function start(authenticated = true) {
  const value={contractVersion:'orgmaster.projed-users.v1',users:[]}
  const manage=vi.fn().mockResolvedValue(value)
  const middleware=createProjedExternalMiddleware({manage},undefined,'users')
  const server=createServer((request,response)=>{
   if(authenticated)setVerifiedRequestIdentity(request,{id:'11111111-1111-4111-8111-111111111111',principalId:'server-principal',identityIssuer:'verified-issuer',identitySubject:'verified-subject',employeeId:'employee',principalAuthEpoch:3,assuranceLevel:'aal1',authenticatedAt:new Date().toISOString()} as never)
   middleware(request,response,()=>{response.statusCode=404;response.end()})
  });servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening')
  const origin='http://127.0.0.1:'+(server.address() as {port:number}).port
  return {origin,url:origin+PROJED_USERS_MANAGEMENT_PATH,manage}
 }
 it('does not accept browser-supplied actor headers as an authenticated session',async()=>{
  const test=await start(false);const response=await fetch(test.url,{headers:{'x-principal-id':'server-principal'}})
  expect(response.status).toBe(401);expect(test.manage).not.toHaveBeenCalled()
 })
 it('returns private no-store metadata through verified server identity',async()=>{
  const test=await start();const response=await fetch(test.url)
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(test.manage.mock.calls[0][0]).toMatchObject({principalId:'server-principal',sessionId:'11111111-1111-4111-8111-111111111111'})
 })
 it('rejects cross-origin status writes before invoking the owner service',async()=>{
  const test=await start();const response=await fetch(test.url,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:JSON.stringify(command)})
  expect(response.status).toBe(403);expect(test.manage).not.toHaveBeenCalled()
 })
 it('passes the same-origin command without accepting any new browser actor',async()=>{
  const test=await start();const response=await fetch(test.url,{method:'POST',headers:{Origin:test.origin,'Content-Type':'application/json'},body:JSON.stringify(command)})
  expect(response.status).toBe(200);expect(test.manage).toHaveBeenCalledWith(expect.objectContaining({principalId:'server-principal'}),command)
 })
})
