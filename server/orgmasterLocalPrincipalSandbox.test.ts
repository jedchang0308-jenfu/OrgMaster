import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contractDigest, LOCAL_FIXTURE_VERSION, LOCAL_IDENTITY_ISSUER } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { buildLocalPrincipalSandboxFixtureV2, readAiPdmRoleCatalogV7 } from './localPrincipalSandboxFixture.mjs'
import { AI_PDM_ROLE_CATALOG_V7_SHA256, AI_PDM_ROLE_CATALOG_V7_VERSION, LOCAL_PRINCIPAL_FIXTURE_VERSION } from './localPrincipalSandboxFixture.mjs'
import {
  createOrgmasterLocalPrincipalSandbox,
  verifyOrgmasterLocalIntrospection,
  verifyOrgmasterLocalLifecycleAssertion,
  verifyOrgmasterLocalLifecycleSessionBinding,
} from './orgmasterLocalPrincipalSandbox'

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
  vi.restoreAllMocks()
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
    server_address: '127.0.0.1', server_port: 53761,
    database_comment: `jenfu.local-principal-bootstrap.v1:orgmaster-test:${profile.generation}`,
    role_superuser: false, role_login: true, role_replication: false,
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

function testEnvironment(root: string, databasePort = '53761'): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1', JENFU_LOCAL_SANDBOX_ID: 'orgmaster-test',
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://127.0.0.1:5173', JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://127.0.0.1:8000',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: `postgres://jenfu_orgmaster_runtime:synthetic@127.0.0.1:${databasePort}/jenfu_local_orgmaster_test`,
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'jenfu_orgmaster_runtime', JENFU_LOCAL_SANDBOX_ROOT: root,
  } as NodeJS.ProcessEnv
}

describe('OrgMaster local principal sandbox runtime gates', () => {
  it('binds the versioned v2 fixture and hash into the local callback token-proof API request', async () => {
    const fixture = buildLocalPrincipalSandboxFixtureV2({ createdAt: '2026-10-30T12:00:00.000Z' })
    const profile = { ...testProfile(), fixture }
    const expected = await captureTokenExpectation(profile)

    expect(expected).toMatchObject({
      applicationId: 'orgmaster',
      sandboxId: profile.sandboxId,
      generation: profile.generation,
      fixtureVersion: fixture.fixtureVersion,
      fixtureHash: fixture.fixtureHash,
    })
  })

  it('accepts only assertions for the current owner lifecycle versions and invalidates older session bindings', () => {
    const profile = testProfile()
    const current = {
      state: { principalStatus: 'active' as const, employeeStatus: 'active' as const,
        accountLifecycleVersion: 2, profileVersion: 2,
        grants: [{ applicationId: 'orgmaster' as const, companyId: 'company-jenfu', stableRoleId: 'role-orgmaster-admin',
          catalogVersion: 'orgmaster.local.v1', catalogSha256: 'a'.repeat(64), roleDefinitionHash: 'b'.repeat(64),
          scopeKind: 'global', scopeRef: null, grantVersion: 1, status: 'active' as const,
          validFrom: '2026-01-01T00:00:00.000Z', validUntil: null }] },
      stateHash: 'c'.repeat(64), lastEventId: '65d57913-024b-449f-a6b9-621664044478',
    }
    const assertion = { applicationId: 'orgmaster', sandboxId: profile.sandboxId, generation: profile.generation,
      fixtureVersion: profile.fixture.fixtureVersion, fixtureHash: profile.fixture.fixtureHash,
      nativeSessionContractVersion: profile.nativeSessionContractVersion, identityIssuer: LOCAL_IDENTITY_ISSUER,
      accountType: 'human_privileged', principalId: 'local-test-admin', employeeId: 'employee-local-test-admin',
      accountLifecycleVersion: 2, profileVersion: 2, grants: current.state.grants }
    expect(() => verifyOrgmasterLocalLifecycleAssertion(assertion as never, profile as never, current, current.state.grants)).not.toThrow()
    expect(() => verifyOrgmasterLocalLifecycleAssertion({ ...assertion, accountLifecycleVersion: 1, profileVersion: 1 } as never,
      profile as never, current, current.state.grants)).toThrow('local_session_invalid')

    const staleBinding = { sandbox_id: profile.sandboxId, generation: profile.generation, principal_id: 'local-test-admin',
      fixture_version: profile.fixture.fixtureVersion, fixture_hash: profile.fixture.fixtureHash,
      account_lifecycle_version: 1, profile_version: 1, state_hash: 'd'.repeat(64) }
    expect(() => verifyOrgmasterLocalLifecycleSessionBinding(staleBinding, profile as never, current,
      profile.fixture.scenarios[0])).toThrow('local_session_invalid')
    expect(() => verifyOrgmasterLocalLifecycleSessionBinding({ ...staleBinding, account_lifecycle_version: 2,
      profile_version: 2, state_hash: current.stateHash }, profile as never, current,
      profile.fixture.scenarios[0])).not.toThrow()
  })

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

  it('emits a sanitized local diagnostic for the exact sandbox session lookup failure stage', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const root = await sandboxRoot()
    const lookupError = Object.assign(new Error('private database detail and opaque session token'), { code: '08006' })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        database_name: 'jenfu_local_orgmaster_test', login_role: 'jenfu_orgmaster_runtime', active_role: 'jenfu_orgmaster_runtime',
        server_address: '127.0.0.1', server_port: 53761,
        database_comment: `jenfu.local-principal-bootstrap.v1:orgmaster-test:${testProfile().generation}`,
        role_superuser: false, role_login: true, role_replication: false,
        role_create_role: false, role_create_database: false, role_bypass_rls: false, database_create_allowed: false,
        runtime_owns_database: false, runtime_owns_schema: false, runtime_can_create_schema_object: false,
        runtime_member_of_migrator: false,
      }], rowCount: 1 })
      .mockRejectedValueOnce(lookupError)
    const client = { query, release: vi.fn() }
    const pool = { connect: vi.fn(async () => client), end: vi.fn(async () => undefined) }
    const sandbox = createOrgmasterLocalPrincipalSandbox({
      environment: testEnvironment(root), listenerVerifier: vi.fn(async () => '127.0.0.1'), poolFactory: vi.fn(() => pool) as never,
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = {
      url: '/api/orgmaster/governance/session', method: 'GET',
      headers: { host: '127.0.0.1:5173', cookie: 'orgmaster_local_session_orgmaster-test=opaque-session-token' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never

    try {
      await expect(sandbox.verify(request, 'local-sandbox-diag-01')).rejects.toMatchObject({ status: 503, code: 'local_sandbox_unavailable' })
      expect(log).toHaveBeenCalledOnce()
      expect(log.mock.calls[0]?.[0]).toBe('ORGMASTER_AUTH_DIAGNOSTIC')
      const diagnostic = JSON.parse(String(log.mock.calls[0]?.[1])) as Record<string, unknown>
      expect(diagnostic).toMatchObject({
        correlationId: 'local-sandbox-diag-01', stage: 'session_lookup', errorName: 'Error', errorCode: '08006',
      })
      expect(JSON.stringify(diagnostic)).not.toContain('private database detail')
      expect(JSON.stringify(diagnostic)).not.toContain('opaque-session-token')
      expect((diagnostic.stackFrames as string[]).length).toBeLessThanOrEqual(3)
    } finally {
      await sandbox.close()
      log.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('proves the actual database target after the OS listener and private profile gates', async () => {
    const root = await sandboxRoot()
    const listenerVerifier = vi.fn(async () => '127.0.0.1')
    const query = vi.fn(async (_sql: string) => ({
      rows: [{ database_name: 'jenfu_local_wrong', login_role: 'jenfu_orgmaster_runtime', active_role: 'jenfu_orgmaster_runtime',
        server_address: '127.0.0.1', server_port: 53761,
        database_comment: 'jenfu.local-principal-bootstrap.v1:orgmaster-test:65d57913-024b-449f-a6b9-62166404447b',
        role_superuser: false, role_login: true, role_replication: false, role_create_role: false,
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
      server_address: '127.0.0.1', server_port: 15439,
      database_comment: 'jenfu.local-principal-bootstrap.v1:orgmaster-test:65d57913-024b-449f-a6b9-62166404447b',
      role_superuser: false, role_login: true, role_replication: false,
      role_create_role: false, role_create_database: false, role_bypass_rls: false, database_create_allowed: false,
      runtime_owns_database: false, runtime_owns_schema: false, runtime_can_create_schema_object: false,
      runtime_member_of_migrator: false,
    }], rowCount: 1 }))
    const release = vi.fn()
    const pool = { connect: vi.fn(async () => ({ query, release })), end: vi.fn(async () => undefined) }
    const sandbox = createOrgmasterLocalPrincipalSandbox({
      environment: testEnvironment(root, '15439'), listenerVerifier: vi.fn(async () => '127.0.0.1'), poolFactory: vi.fn(() => pool) as never,
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
