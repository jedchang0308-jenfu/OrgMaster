import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contractDigest, LOCAL_FIXTURE_VERSION, LOCAL_IDENTITY_ISSUER } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { readAiPdmRoleCatalogV7 } from './localPrincipalSandboxFixture.mjs'
import { AI_PDM_ROLE_CATALOG_V7_SHA256, AI_PDM_ROLE_CATALOG_V7_VERSION, LOCAL_PRINCIPAL_FIXTURE_VERSION } from './localPrincipalSandboxFixture.mjs'
import { createOrgmasterLocalPrincipalSandbox, verifyOrgmasterLocalIntrospection } from './orgmasterLocalPrincipalSandbox'

const localTokenProof = vi.hoisted(() => vi.fn(async (_input: { expected: Record<string, unknown> }) => {
  throw new Error('stop-after-token-expectation')
}))
vi.mock('../contracts/local-principal-sandbox/v1/client.mjs', () => ({
  createLocalSandboxClient: () => ({
    token: vi.fn(), tokenProof: localTokenProof, register: vi.fn(), introspect: vi.fn(), revoke: vi.fn(),
  }),
}))

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function testProfile(assurancePolicy?: { allowSyntheticAal2: true; assurancePolicyHash: string }) {
  const catalog = readAiPdmRoleCatalogV7().catalog
  const payload = {
    contractVersion: LOCAL_FIXTURE_VERSION,
    fixtureVersion: LOCAL_PRINCIPAL_FIXTURE_VERSION,
    scenarios: [{ scenarioId: 'active-test', label: 'active test scenario', principalId: 'local-test-admin',
      employeeId: 'employee-local-test-admin', identityIssuer: LOCAL_IDENTITY_ISSUER, identitySubject: 'local-test-admin',
      accountType: 'human_privileged', principalStatus: 'active', employeeStatus: 'active',
      accountLifecycleVersion: 1, profileVersion: 1, grants: [] }],
  }
  return {
    profileVersion: 'orgmaster.local-principal-runtime.v1', applicationId: 'orgmaster', sandboxId: 'orgmaster-test',
    generation: '65d57913-024b-449f-a6b9-62166404447b', key: 'b'.repeat(64),
    nativeSessionContractVersion: 'jenfu.orgmaster-session.v2',
    catalogBinding: { applicationId: 'ai-pdm', sourcePath: 'postgres:ai_pdm_contract.v_application_role_catalog_v2',
      catalogVersion: AI_PDM_ROLE_CATALOG_V7_VERSION, catalogSha256: AI_PDM_ROLE_CATALOG_V7_SHA256,
      roles: catalog.roles.map(({ stableRoleId, roleDefinitionHash }) => ({ stableRoleId, roleDefinitionHash })) },
    fixture: { ...payload, fixtureHash: contractDigest(payload) },
    ...assurancePolicy,
  }
}

async function sandboxRoot(profile = testProfile()) {
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-local-runtime-'))
  roots.push(root)
  await mkdir(join(root, 'control'))
  await writeFile(join(root, 'control', 'orgmaster-runtime.json'), JSON.stringify(profile), { mode: 0o600 })
  return root
}

function callbackRequest() {
  const state = 'a'.repeat(32)
  const verifier = 'v'.repeat(43)
  const transaction = Buffer.from(JSON.stringify({ state, verifier, returnTo: '/' })).toString('base64url')
  const params = new URLSearchParams({ code: 'c'.repeat(32), state, iss: 'http://127.0.0.1:8000/api/local-sandbox' })
  return {
    url: `/api/auth/local-sandbox/callback?${params.toString()}`,
    method: 'GET',
    headers: { host: '127.0.0.1:5173', cookie: `orgmaster_local_tx_orgmaster-test=${transaction}` },
  } as never
}

async function captureTokenExpectation(profile: ReturnType<typeof testProfile>) {
  const root = await sandboxRoot(profile)
  const query = vi.fn(async () => ({ rows: [{
    database_name: 'jenfu_local_orgmaster_test', login_role: 'jenfu_orgmaster_runtime', active_role: 'jenfu_orgmaster_runtime',
    server_address: '127.0.0.1', server_port: 53761, role_superuser: false, role_login: true, role_replication: false,
    role_create_role: false, role_create_database: false, role_bypass_rls: false, database_create_allowed: false,
    runtime_owns_database: false, runtime_owns_schema: false, runtime_can_create_schema_object: false,
    runtime_member_of_migrator: false,
  }], rowCount: 1 }))
  const release = vi.fn()
  const pool = { connect: vi.fn(async () => ({ query, release })), end: vi.fn(async () => undefined) }
  const sandbox = createOrgmasterLocalPrincipalSandbox({
    environment: testEnvironment(root), listenerVerifier: vi.fn(async () => '127.0.0.1'), poolFactory: vi.fn(() => pool) as never,
  })
  localTokenProof.mockReset()
  localTokenProof.mockRejectedValueOnce(new Error('stop-after-token-expectation'))
  try {
    await expect(sandbox.callback(callbackRequest())).rejects.toMatchObject({ code: 'local_sandbox_unavailable' })
    expect(localTokenProof).toHaveBeenCalledTimes(1)
    return localTokenProof.mock.calls[0][0].expected as Record<string, unknown>
  } finally {
    await sandbox.close()
  }
}

function testEnvironment(root: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1', JENFU_LOCAL_SANDBOX_ID: 'orgmaster-test',
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://127.0.0.1:5173', JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://127.0.0.1:8000',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: 'postgres://jenfu_orgmaster_runtime:synthetic@127.0.0.1:53761/jenfu_local_orgmaster_test',
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'jenfu_orgmaster_runtime', JENFU_LOCAL_SANDBOX_ROOT: root,
  } as NodeJS.ProcessEnv
}

describe('OrgMaster local principal sandbox runtime gates', () => {
  it('accepts signed trace metadata and a longer parent lifetime while preserving the native bound', () => {
    const binding = { registration_id: 'registration', portal_session_id: 'parent', join_digest: 'b'.repeat(64), generation: 'generation' }
    const session = { principalAuthEpoch: 7, expiresAt: '2026-10-30T00:00:00.000Z' }
    const value = { active: true, registrationId: binding.registration_id, portalSessionId: binding.portal_session_id,
      joinDigest: binding.join_digest, generation: binding.generation, authEpoch: 7, expiresAt: '2026-10-30T01:00:00.000Z',
      correlationId: 'f126bca6-aa76-4a1f-83cb-ae219eb16250' }
    expect(() => verifyOrgmasterLocalIntrospection(value, binding, session)).not.toThrow()
    for (const changed of [{ authEpoch: 8 }, { generation: 'old-generation' }, { active: false },
      { expiresAt: '2026-10-29T23:59:59.999Z' }, { expiresAt: 'invalid' }, { joinDigest: 'wrong' }]) {
      expect(() => verifyOrgmasterLocalIntrospection({ ...value, ...changed }, binding, session)).toThrow('local_session_invalid')
    }
    expect(() => verifyOrgmasterLocalIntrospection({ ...value, capabilities: { admin: true } }, binding, session)).toThrow()
    expect(() => verifyOrgmasterLocalIntrospection({ ...value, correlationId: 'untrusted-trace' }, binding, session)).toThrow()
  })
  it('does not inspect profile, listener, or database when NODE_ENV is not development', async () => {
    const listenerVerifier = vi.fn(async () => '127.0.0.1')
    const poolFactory = vi.fn()
    const sandbox = createOrgmasterLocalPrincipalSandbox({
      environment: { NODE_ENV: 'production', JENFU_LOCAL_SANDBOX_ENABLED: '1' } as NodeJS.ProcessEnv,
      listenerVerifier,
      poolFactory: poolFactory as never,
    })
    await expect(sandbox.mode('correlation')).rejects.toThrow('local_sandbox_unavailable')
    expect(listenerVerifier).not.toHaveBeenCalled()
    expect(poolFactory).not.toHaveBeenCalled()
  })

  it('proves the actual database target after the OS listener and private profile gates', async () => {
    const root = await sandboxRoot()
    const listenerVerifier = vi.fn(async () => '127.0.0.1')
    const query = vi.fn(async (_sql: string) => ({
      rows: [{ database_name: 'jenfu_local_wrong', login_role: 'jenfu_orgmaster_runtime', active_role: 'jenfu_orgmaster_runtime',
        server_address: '127.0.0.1', server_port: 53761, role_superuser: false, role_login: true, role_replication: false, role_create_role: false,
        role_create_database: false, role_bypass_rls: false, database_create_allowed: false,
        runtime_owns_database: false, runtime_owns_schema: false, runtime_can_create_schema_object: false,
        runtime_member_of_migrator: false }], rowCount: 1,
    }))
    const release = vi.fn()
    const pool = { connect: vi.fn(async () => ({ query, release })), end: vi.fn(async () => undefined) }
    const poolFactory = vi.fn(() => pool)
    const sandbox = createOrgmasterLocalPrincipalSandbox({
      environment: testEnvironment(root), listenerVerifier, poolFactory: poolFactory as never,
    })
    await expect(sandbox.mode('correlation')).rejects.toThrow('local_sandbox_unavailable')
    expect(listenerVerifier).toHaveBeenCalledTimes(1)
    expect(poolFactory).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toContain('inet_server_port()')
    expect(release).toHaveBeenCalledTimes(1)
    await sandbox.close()
  })

  it('starts with standard OAuth parameters and keeps the PKCE verifier in the HttpOnly transaction cookie', async () => {
    const root = await sandboxRoot()
    const query = vi.fn(async (_sql: string) => ({ rows: [{
      database_name: 'jenfu_local_orgmaster_test', login_role: 'jenfu_orgmaster_runtime', active_role: 'jenfu_orgmaster_runtime',
      server_address: '127.0.0.1', server_port: 53761, role_superuser: false, role_login: true, role_replication: false,
      role_create_role: false, role_create_database: false, role_bypass_rls: false, database_create_allowed: false,
      runtime_owns_database: false, runtime_owns_schema: false, runtime_can_create_schema_object: false,
      runtime_member_of_migrator: false,
    }], rowCount: 1 }))
    const release = vi.fn()
    const pool = { connect: vi.fn(async () => ({ query, release })), end: vi.fn(async () => undefined) }
    const sandbox = createOrgmasterLocalPrincipalSandbox({
      environment: testEnvironment(root), listenerVerifier: vi.fn(async () => '127.0.0.1'), poolFactory: vi.fn(() => pool) as never,
    })
    try {
      const result = await sandbox.start({
        url: '/api/auth/local-sandbox/start?returnTo=%2Femployees%3Ftab%3Dorg',
        method: 'GET',
        headers: { host: '127.0.0.1:5173' },
      } as never)
      const authorize = new URL(result.location)
      expect(authorize.origin).toBe('http://127.0.0.1:8000')
      expect(authorize.pathname).toBe('/api/local-sandbox/authorize')
      expect([...authorize.searchParams.keys()].sort()).toEqual([
        'client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'response_type', 'state',
      ])
      expect(authorize.searchParams.has('clientId')).toBe(false)
      expect(authorize.searchParams.has('redirectUri')).toBe(false)
      expect(authorize.searchParams.has('codeChallenge')).toBe(false)
      expect(authorize.searchParams.get('response_type')).toBe('code')
      expect(authorize.searchParams.get('client_id')).toBe('orgmaster')
      expect(authorize.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/api/auth/local-sandbox/callback')
      expect(new URL(authorize.searchParams.get('redirect_uri')!).origin).toBe('http://127.0.0.1:5173')
      expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
      expect(authorize.searchParams.has('code_verifier')).toBe(false)

      const cookieParts = result.cookie.split('; ')
      const [cookiePair] = cookieParts
      expect(cookiePair.startsWith('orgmaster_local_tx_orgmaster-test=')).toBe(true)
      expect(cookieParts).toContain('Path=/api/auth/local-sandbox/callback')
      expect(cookieParts).toContain('HttpOnly')
      expect(cookieParts).toContain('SameSite=Lax')
      expect(cookieParts).toContain('Max-Age=120')
      const transaction = JSON.parse(Buffer.from(decodeURIComponent(cookiePair.split('=', 2)[1]), 'base64url').toString('utf8'))
      expect(Object.keys(transaction).sort()).toEqual(['returnTo', 'state', 'verifier'])
      expect(transaction.returnTo).toBe('/employees?tab=org')
      expect(transaction.state).toBe(authorize.searchParams.get('state'))
      expect(transaction.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u)
      const expectedChallenge = createHash('sha256').update(transaction.verifier, 'ascii').digest('base64url')
      expect(authorize.searchParams.get('code_challenge')).toBe(expectedChallenge)
      expect(result.location).not.toContain(transaction.verifier)
      expect(result.cookie).not.toContain(transaction.verifier)
      expect(query).toHaveBeenCalledTimes(1)
      expect(query.mock.calls[0][0]).toContain('inet_server_port()')
      expect(release).toHaveBeenCalledTimes(1)
    } finally {
      await sandbox.close()
    }
  })

  it('passes synthetic AAL2 policy only from an explicitly configured runtime profile', async () => {
    const aal1Expectation = await captureTokenExpectation(testProfile())
    expect(aal1Expectation).not.toHaveProperty('allowSyntheticAal2')
    expect(aal1Expectation).not.toHaveProperty('assurancePolicyHash')

    const assurancePolicyHash = 'd'.repeat(64)
    const aal2Expectation = await captureTokenExpectation(testProfile({ allowSyntheticAal2: true, assurancePolicyHash }))
    expect(aal2Expectation).toMatchObject({ allowSyntheticAal2: true, assurancePolicyHash })
  })
})
