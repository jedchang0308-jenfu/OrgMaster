import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import pg from 'pg'
import { createLocalSandboxClient, type LocalSandboxClient } from '../contracts/local-principal-sandbox/v1/client.mjs'
import {
  LOCAL_IDENTITY_ISSUER,
  assertLocalSandboxRequest,
  contractDigest,
  isLoopbackHost,
  readLocalSandboxConfig,
  type LocalAssertion,
  type LocalSandboxConfig,
  type LocalScenario,
  type LocalAssertionExpectation,
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { ownerGrantsMatchFixture, validateLocalOwnerPublication, type LocalOwnerPublication } from '../contracts/local-principal-sandbox/v1/owner-publication.mjs'
import { readPublishedAiPdmRoleCatalogFromDatabase, type PublishedAiPdmRoleCatalog } from './aiPdmRoleCatalogRepository'
import { createAuthEpochRepository, AuthEpochUnavailableError } from './orgmasterAuthEpochRepository'
import { createOrgmasterSessionRepository, type OrgmasterSession } from './orgmasterSessionRepository'
import { createPrincipalAdmissionRepository, PrincipalAdmissionError } from './orgmasterPrincipalAdmissionRepository'
import { closeOrgmasterLocalSandboxDatabase } from './orgmasterDatabase'
import { hashSessionToken } from './orgmasterAuthCookies'
import { ORGMASTER_SESSION_MAX_AGE_SECONDS } from './orgmasterAuthConfig'
import { readOrgmasterLocalRuntimeProfile, type OrgmasterLocalRuntimeProfile } from './orgmasterLocalSandboxProfile'
import { createOrgmasterLocalListenerVerifier } from './orgmasterLocalSandboxListener.mjs'
import {
  localPrincipalLifecycleLockKey,
  readCurrentLocalPrincipalLifecycleState,
  type LocalPrincipalLifecycleState,
} from './localPrincipalSandboxLifecycle.mjs'

const CALLBACK_PATH = '/api/auth/local-sandbox/callback'
const LOCAL_SESSION_CONTRACT_VERSION = 'jenfu.orgmaster-session.v2'
const BINDING_TABLE = 'orgmaster_core.local_sandbox_session_bindings'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const HASH = /^[a-f0-9]{64}$/u
const RETURN_TO_MAX = 2048

export type LocalSandboxPublicMode = { authMode: 'local_principal_sandbox'; localSandboxEnabled: true; correlationId: string }

export type LocalSandboxSessionResult = {
  session: OrgmasterSession
  profile: OrgmasterLocalRuntimeProfile
  persistenceTargetUrl: string
}

type QueryResultLike<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null }
type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<QueryResultLike<T>> }
type LocalTargetRow = {
  database_name: string
  login_role: string
  active_role: string
  server_address: string | null
  server_port: number | string | null
  database_comment: string | null
  role_superuser: boolean
  role_login: boolean
  role_replication: boolean
  role_create_role: boolean
  role_create_database: boolean
  role_bypass_rls: boolean
  database_create_allowed: boolean
  runtime_owns_database: boolean
  runtime_owns_schema: boolean
  runtime_can_create_schema_object: boolean
  runtime_member_of_migrator: boolean
}

export class OrgmasterLocalPrincipalSandboxError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly clearCookie = false) {
    super(code)
  }
}

type LocalSandboxAuthStage =
  | 'runtime_context'
  | 'session_lookup'
  | 'session_binding_lookup'
  | 'principal_auth_state'
  | 'fixture_owner_readiness'
  | 'lifecycle_binding_lookup'
  | 'native_auth_introspection'
  | 'lifecycle_recheck'

const diagnosticErrorNames = new Set([
  'AggregateError', 'AuthEpochUnavailableError', 'DatabaseError', 'Error', 'OrgmasterLocalPrincipalSandboxError',
  'PrincipalAdmissionError', 'RangeError', 'TypeError',
])
const diagnosticNodeCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'ETIMEDOUT'])
const diagnosticSandboxCodes = new Set(['auth_contract_mismatch', 'auth_epoch_unavailable', 'auth_origin_invalid', 'auth_request_invalid', 'local_sandbox_unavailable', 'local_session_invalid'])

function emitLocalSandboxAuthDiagnostic(
  request: IncomingMessage,
  correlationId: string | undefined,
  stage: LocalSandboxAuthStage,
  error: unknown,
) {
  const remoteAddress = request.socket.remoteAddress ?? ''
  const loopback = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
  if (!loopback || !['development', 'test'].includes(String(process.env.NODE_ENV ?? ''))) return
  try {
    const candidateName = error instanceof Error ? error.constructor.name : ''
    const errorName = diagnosticErrorNames.has(candidateName) ? candidateName : 'UnknownError'
    let errorCode = 'unclassified_error'
    if (error instanceof OrgmasterLocalPrincipalSandboxError) {
      errorCode = diagnosticSandboxCodes.has(error.code) ? error.code : 'local_sandbox_error'
    } else if (error instanceof PrincipalAdmissionError) {
      errorCode = error.code
    } else if (error instanceof AuthEpochUnavailableError) {
      errorCode = 'auth_epoch_unavailable'
    } else if (error && typeof error === 'object' && 'code' in error) {
      const candidate = (error as { code?: unknown }).code
      if (typeof candidate === 'string' && (/^[0-9A-Z]{5}$/u.test(candidate) || diagnosticNodeCodes.has(candidate))) errorCode = candidate
    }
    const stackFrames: string[] = []
    if (error instanceof Error && typeof error.stack === 'string') {
      for (const line of error.stack.split('\n').slice(1)) {
        const match = line.match(/^\s*at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/u)
        if (!match) continue
        const functionName = (match[1] ?? 'anonymous').trim().replace(/^async\s+/u, '')
        const safeFunction = /^[A-Za-z0-9_$.:<>-]{1,80}$/u.test(functionName) ? functionName : 'anonymous'
        const sourceName = (match[2].split(/[\\/]/u).pop() ?? '').replace(/[^A-Za-z0-9_.-]/gu, '').slice(-64) || 'source'
        stackFrames.push(`${safeFunction}@${sourceName}:${match[3]}`)
        if (stackFrames.length === 3) break
      }
    }
    console.error('ORGMASTER_AUTH_DIAGNOSTIC', JSON.stringify({
      event: 'orgmaster_auth_failure',
      correlationId: correlationId && /^[A-Za-z0-9_-]{8,64}$/u.test(correlationId) ? correlationId : 'unavailable',
      stage,
      errorName,
      errorCode,
      stackFrames,
    }))
  } catch {
    // Diagnostics must never change the authentication decision.
  }
}

function unavailable(): never { throw new OrgmasterLocalPrincipalSandboxError(503, 'local_sandbox_unavailable') }
function authInvalid(clearCookie = false): never { throw new OrgmasterLocalPrincipalSandboxError(401, 'local_session_invalid', clearCookie) }
function exactKeys(value: unknown, keys: string[]) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))) unavailable()
}
function exactResponseKeys(value: Record<string, unknown>, keys: string[]) {
  exactKeys(value, [...keys, ...(Object.hasOwn(value, 'correlationId') ? ['correlationId'] : [])])
  if (value.correlationId !== undefined && (typeof value.correlationId !== 'string' || !UUID.test(value.correlationId))) unavailable()
}
function statusOf(error: unknown) {
  return error && typeof error === 'object' && 'status' in error ? Number((error as { status?: unknown }).status) : 0
}

function localSessionCookieName(sandboxId: string) { return `orgmaster_local_session_${sandboxId}` }
function transactionCookieName(sandboxId: string) { return `orgmaster_local_tx_${sandboxId}` }
function cookieHeader(request: IncomingMessage, name: string) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try { return decodeURIComponent(part.slice(separator + 1).trim()) } catch { return null }
  }
  return null
}
function secureCookie(config: LocalSandboxConfig) { return new URL(config.origin).protocol === 'https:' }
function setCookie(name: string, value: string, config: LocalSandboxConfig, maxAge: number, path = '/') {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${path}; HttpOnly; SameSite=Lax${secureCookie(config) ? '; Secure' : ''}`
}
function clearCookie(name: string, config: LocalSandboxConfig, path = '/') {
  return `${name}=; Max-Age=0; Path=${path}; HttpOnly; SameSite=Lax${secureCookie(config) ? '; Secure' : ''}`
}
function sha256(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex') }
function sameHash(left: string, right: string) {
  if (!HASH.test(left) || !HASH.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}
function safeReturnTo(value: string | null) {
  if (!value) return '/'
  if (value.length > RETURN_TO_MAX || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/u.test(value)) {
    throw new OrgmasterLocalPrincipalSandboxError(400, 'auth_request_invalid')
  }
  const parsed = new URL(value, 'http://orgmaster.local')
  if (parsed.origin !== 'http://orgmaster.local') throw new OrgmasterLocalPrincipalSandboxError(400, 'auth_request_invalid')
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
function originCheckedRequest(request: IncomingMessage, config: LocalSandboxConfig) {
  const path = request.url ?? '/'
  if (!path.startsWith('/') || path.startsWith('//')) throw new OrgmasterLocalPrincipalSandboxError(403, 'auth_origin_invalid')
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value)
    else if (Array.isArray(value)) headers.set(name, value.join(', '))
  }
  return new Request(new URL(path, config.origin), { method: request.method ?? 'GET', headers })
}

function assertPersistenceTarget(environment: NodeJS.ProcessEnv, config: LocalSandboxConfig) {
  if ((environment.ORGMASTER_PERSISTENCE_MODE && environment.ORGMASTER_PERSISTENCE_MODE !== 'cloud-sql') ||
    (environment.ORGMASTER_POSTGRES_URL?.trim() && environment.ORGMASTER_POSTGRES_URL.trim() !== config.databaseUrl)) unavailable()
}

async function assertLocalDatabaseTarget(database: Queryable, config: LocalSandboxConfig, profile: OrgmasterLocalRuntimeProfile) {
  let result: QueryResultLike<LocalTargetRow>
  try {
    result = await database.query<LocalTargetRow>(`
      SELECT current_database() AS database_name,
             session_user AS login_role,
             current_user AS active_role,
             host(inet_server_addr()) AS server_address,
             inet_server_port() AS server_port,
             (SELECT pg_catalog.shobj_description(oid, 'pg_database')
                FROM pg_catalog.pg_database WHERE datname = current_database()) AS database_comment,
             runtime_role.rolsuper AS role_superuser,
             runtime_role.rolcanlogin AS role_login,
             runtime_role.rolreplication AS role_replication,
             runtime_role.rolcreaterole AS role_create_role,
             runtime_role.rolcreatedb AS role_create_database,
             runtime_role.rolbypassrls AS role_bypass_rls,
             has_database_privilege(runtime_role.rolname, current_database(), 'CREATE') AS database_create_allowed,
             target_database.datdba = runtime_role.oid AS runtime_owns_database,
             EXISTS (SELECT 1 FROM pg_namespace target_schema
                      WHERE target_schema.nspowner = runtime_role.oid
                        AND target_schema.nspname NOT LIKE 'pg_temp_%'
                        AND target_schema.nspname NOT LIKE 'pg_toast_temp_%') AS runtime_owns_schema,
             EXISTS (SELECT 1 FROM pg_namespace target_schema
                      WHERE target_schema.nspname NOT LIKE 'pg_temp_%'
                        AND target_schema.nspname NOT LIKE 'pg_toast_temp_%'
                        AND has_schema_privilege(runtime_role.rolname, target_schema.oid, 'CREATE')) AS runtime_can_create_schema_object,
             EXISTS (SELECT 1 FROM pg_roles elevated_role
                      WHERE right(elevated_role.rolname, 9) = '_migrator'
                        AND pg_has_role(runtime_role.rolname, elevated_role.oid, 'MEMBER')) AS runtime_member_of_migrator
        FROM pg_roles runtime_role
        JOIN pg_database target_database ON target_database.datname = current_database()
       WHERE runtime_role.rolname = session_user
    `)
  } catch { return unavailable() }
  const row = result.rows[0]
  let databaseUrl: URL
  let expectedPort: number
  let databaseUser: string
  try {
    databaseUrl = new URL(config.databaseUrl)
    expectedPort = databaseUrl.port ? Number(databaseUrl.port) : 5432
    databaseUser = decodeURIComponent(databaseUrl.username)
  } catch { return unavailable() }
  const expectedMarker = `jenfu.local-principal-bootstrap.v1:${profile.sandboxId}:${profile.generation}`
  if (result.rows.length !== 1 || !row || row.database_name !== config.databaseName ||
    row.login_role !== config.runtimeRole || row.active_role !== config.runtimeRole ||
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !isLoopbackHost(databaseUrl.hostname) ||
    !isLoopbackHost(config.bindHost) || databaseUrl.pathname !== `/${config.databaseName}` || databaseUser !== config.runtimeRole ||
    !Number.isSafeInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535 ||
    !isLoopbackHost(row.server_address) || Number(row.server_port) !== expectedPort || row.database_comment !== expectedMarker ||
    row.role_superuser || !row.role_login || row.role_replication ||
    row.role_create_role || row.role_create_database || row.role_bypass_rls || row.database_create_allowed ||
    row.runtime_owns_database || row.runtime_owns_schema || row.runtime_can_create_schema_object || row.runtime_member_of_migrator) unavailable()
}

async function readOwnerPublication(database: Queryable, scenario: LocalScenario): Promise<LocalOwnerPublication> {
  let rows: Record<string, unknown>[]
  try {
    const result = await database.query(`
      SELECT contract_version, principal_issuer, principal_subject, principal_id, employee_id,
             account_type, employee_status, mapping_version, published_at, published_version,
             pdm_grants, pdm_catalog, fms_authority
        FROM orgmaster_contract.v_local_principal_publications_v1
       WHERE principal_issuer = $1 AND principal_subject = $2
       ORDER BY mapping_version DESC
       FETCH FIRST 2 ROWS ONLY
    `, [scenario.identityIssuer, scenario.identitySubject])
    rows = result.rows
  } catch { return unavailable() }
  if (rows.length !== 1) unavailable()
  return validateLocalOwnerPublication(rows[0], scenario)
}

function comparePdmBinding(profile: OrgmasterLocalRuntimeProfile, catalog: PublishedAiPdmRoleCatalog) {
  const binding = profile.catalogBinding
  if (catalog.applicationId !== binding.applicationId || catalog.sourcePath !== binding.sourcePath ||
    catalog.catalogVersion !== binding.catalogVersion || catalog.catalogSha256 !== binding.catalogSha256 ||
    catalog.roles.length !== binding.roles.length) unavailable()
  const observed = new Map(catalog.roles.map((role) => [role.stableRoleId, role.roleDefinitionHash]))
  if (binding.roles.some((role) => observed.get(role.stableRoleId) !== role.roleDefinitionHash)) unavailable()
}

function compareOwnerPdmCatalog(row: LocalOwnerPublication, profile: OrgmasterLocalRuntimeProfile) {
  const roles = new Map(profile.catalogBinding.roles.map((role) => [role.stableRoleId, role.roleDefinitionHash]))
  const observed = new Set<string>()
  if (row.pdm_catalog.length !== 9 || row.pdm_catalog.some((entry) => {
    if (typeof entry.stable_role_id !== 'string' || observed.has(entry.stable_role_id)) return true
    observed.add(entry.stable_role_id)
    return entry.contract_version !== 'jenfu.platform-entitlement.v1' || entry.application_id !== 'ai-pdm' ||
      entry.catalog_version !== profile.catalogBinding.catalogVersion || entry.catalog_sha256 !== profile.catalogBinding.catalogSha256 ||
      roles.get(entry.stable_role_id) !== entry.role_definition_hash
  }) || observed.size !== roles.size) unavailable()
}

async function validateNativeOwnerBindings(database: Queryable, profile: OrgmasterLocalRuntimeProfile, scenario: LocalScenario, nowMs = Date.now()) {
  const row = await readOwnerPublication(database, scenario)
  compareOwnerPdmCatalog(row, profile)
  const active = (applicationId: LocalScenario['grants'][number]['applicationId']) => scenario.grants.filter((grant) =>
    grant.applicationId === applicationId && grant.status === 'active' && Date.parse(grant.validFrom) <= nowMs &&
    (grant.validUntil === null || Date.parse(grant.validUntil) > nowMs))
  const pdmFixtureGrants = active('ai-pdm')
  const orgmasterFixtureGrants = active('orgmaster')
  if (!ownerGrantsMatchFixture(row, scenario, 'ai-pdm', pdmFixtureGrants, nowMs) ||
    !ownerGrantsMatchFixture(row, scenario, 'orgmaster', orgmasterFixtureGrants, nowMs)) unavailable()
  return { row, orgmasterFixtureGrants }
}

type CurrentLifecycle = Awaited<ReturnType<typeof readCurrentLocalPrincipalLifecycleState>>

function activeOrgmasterLifecycleGrants(state: LocalPrincipalLifecycleState, nowMs = Date.now()) {
  return state.grants.filter((grant) => grant.applicationId === 'orgmaster' && grant.status === 'active' &&
    Date.parse(grant.validFrom) <= nowMs && (grant.validUntil === null || Date.parse(grant.validUntil) > nowMs))
}

function lifecycleAllowsOrgmaster(state: LocalPrincipalLifecycleState, nowMs = Date.now()) {
  return state.principalStatus === 'active' && state.employeeStatus === 'active' &&
    activeOrgmasterLifecycleGrants(state, nowMs).length > 0
}

async function readCurrentLifecycle(database: Queryable, profile: OrgmasterLocalRuntimeProfile, scenario: LocalScenario) {
  try {
    return await readCurrentLocalPrincipalLifecycleState(database, {
      sandboxId: profile.sandboxId, generation: profile.generation, principalId: scenario.principalId,
    }, scenario, profile)
  } catch { return unavailable() }
}

export function verifyOrgmasterLocalLifecycleAssertion(assertion: LocalAssertion, profile: OrgmasterLocalRuntimeProfile,
  current: CurrentLifecycle, expectedOrgGrants: LocalScenario['grants']) {
  if (assertion.applicationId !== 'orgmaster' || assertion.sandboxId !== profile.sandboxId ||
    assertion.generation !== profile.generation || assertion.fixtureVersion !== profile.fixture.fixtureVersion ||
    assertion.fixtureHash !== profile.fixture.fixtureHash ||
    assertion.nativeSessionContractVersion !== LOCAL_SESSION_CONTRACT_VERSION ||
    assertion.identityIssuer !== LOCAL_IDENTITY_ISSUER || assertion.accountType === undefined ||
    assertion.principalId === '' || assertion.employeeId === '' ||
    contractDigest([...assertion.grants].map((grant) => contractDigest(grant)).sort()) !==
      contractDigest(expectedOrgGrants.map((grant) => contractDigest(grant)).sort())) unavailable()
  if (assertion.accountLifecycleVersion !== current.state.accountLifecycleVersion ||
    assertion.profileVersion !== current.state.profileVersion) authInvalid(true)
}

export function verifyOrgmasterLocalLifecycleSessionBinding(binding: {
  sandbox_id: string; generation: string; principal_id: string; fixture_version: string; fixture_hash: string;
  account_lifecycle_version: number; profile_version: number; state_hash: string
}, profile: OrgmasterLocalRuntimeProfile, current: CurrentLifecycle, scenario: LocalScenario, nowMs = Date.now()) {
  if (binding.sandbox_id !== profile.sandboxId || binding.generation !== profile.generation ||
    binding.principal_id !== scenario.principalId || binding.fixture_version !== profile.fixture.fixtureVersion ||
    binding.fixture_hash !== profile.fixture.fixtureHash ||
    binding.account_lifecycle_version !== current.state.accountLifecycleVersion ||
    binding.profile_version !== current.state.profileVersion || !sameHash(binding.state_hash, current.stateHash) ||
    !lifecycleAllowsOrgmaster(current.state, nowMs)) authInvalid(true)
}

export function verifyOrgmasterLocalIntrospection(value: Record<string, unknown>,
  binding: Pick<BindingRow, 'registration_id' | 'portal_session_id' | 'join_digest' | 'generation'>,
  session: Pick<OrgmasterSession, 'principalAuthEpoch' | 'expiresAt'>) {
  exactResponseKeys(value, ['active', 'registrationId', 'portalSessionId', 'joinDigest', 'generation', 'authEpoch', 'expiresAt'])
  if (value.active !== true || value.registrationId !== binding.registration_id ||
    value.portalSessionId !== binding.portal_session_id || value.joinDigest !== binding.join_digest ||
    value.generation !== binding.generation || Number(value.authEpoch) !== session.principalAuthEpoch ||
    typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) < Date.parse(session.expiresAt)) authInvalid(true)
}

type BindingRow = {
  session_id: string
  sandbox_id: string
  generation: string
  registration_id: string
  portal_session_id: string
  scenario_id: string
  fixture_version: string
  fixture_hash: string
  native_session_contract_version: string
  native_session_id_hash: string
  join_digest: string
  idempotency_key: string
  status: 'pending' | 'active' | 'revoked'
}

export type OrgmasterLocalPrincipalSandbox = ReturnType<typeof createOrgmasterLocalPrincipalSandbox>

export function createOrgmasterLocalPrincipalSandbox({
  environment = process.env,
  listenerVerifier = createOrgmasterLocalListenerVerifier(),
  poolFactory = (connectionString: string) => new pg.Pool({
    connectionString,
    application_name: 'orgmaster-local-principal-sandbox',
    connectionTimeoutMillis: 2500,
    idleTimeoutMillis: 30_000,
    query_timeout: 5000,
    statement_timeout: 5000,
    max: 4,
  }),
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  let pool: pg.Pool | null = null
  let poolUrl = ''

  async function context(request?: IncomingMessage, browserMutation = false) {
    let config: LocalSandboxConfig
    try { config = readLocalSandboxConfig(environment, 'orgmaster') } catch { return unavailable() }
    assertPersistenceTarget(environment, config)
    let profile: OrgmasterLocalRuntimeProfile
    try { profile = await readOrgmasterLocalRuntimeProfile(environment.JENFU_LOCAL_SANDBOX_ROOT, config.sandboxId) } catch { return unavailable() }
    let listenAddress: string
    try { listenAddress = await listenerVerifier(config) } catch { return unavailable() }
    if (request) {
      try { assertLocalSandboxRequest(originCheckedRequest(request, config), config, { browserMutation, listenAddress }) }
      catch { throw new OrgmasterLocalPrincipalSandboxError(browserMutation ? 403 : 403, 'auth_origin_invalid') }
    }
    if (pool && poolUrl !== config.databaseUrl) return unavailable()
    pool ??= poolFactory(config.databaseUrl)
    poolUrl ||= config.databaseUrl
    const client = await pool.connect()
    try {
      await assertLocalDatabaseTarget(client, config, profile)
      return { config, profile, listenAddress, client, pool: pool!, localClient: createLocalSandboxClient({
        config, clientId: 'orgmaster', key: profile.key, fetch: fetchImpl,
      }) }
    } catch (error) {
      client.release()
      throw error
    }
  }

  async function endContext(value: Awaited<ReturnType<typeof context>>) {
    value.client.release()
  }

  async function readPdmCatalog(database: Queryable, profile: OrgmasterLocalRuntimeProfile) {
    let catalog: PublishedAiPdmRoleCatalog
    try { catalog = await readPublishedAiPdmRoleCatalogFromDatabase(database, profile.catalogBinding.catalogSha256) }
    catch { return unavailable() }
    comparePdmBinding(profile, catalog)
    return catalog
  }

  async function verifyNativePrincipal(database: Queryable, session: OrgmasterSession, binding: BindingRow, profile: OrgmasterLocalRuntimeProfile) {
    if (binding.status !== 'active' || binding.sandbox_id !== profile.sandboxId || binding.generation !== profile.generation ||
      binding.session_id !== session.id || binding.fixture_version !== profile.fixture.fixtureVersion ||
      binding.fixture_hash !== profile.fixture.fixtureHash || binding.native_session_contract_version !== profile.nativeSessionContractVersion ||
      session.identityIssuer !== LOCAL_IDENTITY_ISSUER || session.sessionSchemaVersion !== 2 || session.epochKind !== 'principal' ||
      session.principalAuthEpoch === null || !session.authenticatedAt) authInvalid(true)
    const scenario = profile.fixture.scenarios.find((candidate) => candidate.scenarioId === binding.scenario_id)
    if (!scenario || scenario.principalId !== session.principalId || scenario.employeeId !== session.employeeId ||
      scenario.identitySubject !== session.identitySubject || scenario.identityIssuer !== session.identityIssuer) authInvalid(true)
    const principals = createPrincipalAdmissionRepository(database as never)
    const epochs = createAuthEpochRepository(database as never)
    const [principal, state] = await Promise.all([
      principals.resolveActivePrincipal(session.identityIssuer, session.identitySubject),
      epochs.readPrincipalState(session.principalId),
    ])
    if (principal.principalId !== session.principalId || principal.employeeId !== session.employeeId) authInvalid(true)
    if (state.authEpoch !== session.principalAuthEpoch ||
      state.revokedBefore && Date.parse(session.authenticatedAt) <= Date.parse(state.revokedBefore)) authInvalid(true)
    return scenario
  }

  async function introspect(localClient: LocalSandboxClient, binding: BindingRow, session: OrgmasterSession) {
    let result: Record<string, unknown>
    try { result = await localClient.introspect({ nativeSessionIdHash: binding.native_session_id_hash, expectedJoinDigest: binding.join_digest }) }
    catch (error) {
      if (statusOf(error) === 401) authInvalid(true)
      unavailable()
    }
    verifyOrgmasterLocalIntrospection(result!, binding, session)
  }

  async function validateFixtureAndOwner(database: Queryable, profile: OrgmasterLocalRuntimeProfile, scenario: LocalScenario) {
    await readPdmCatalog(database, profile)
    const native = await validateNativeOwnerBindings(database, profile, scenario)
    const currentLifecycle = await readCurrentLifecycle(database, profile, scenario)
    if (!lifecycleAllowsOrgmaster(currentLifecycle.state)) authInvalid(true)
    return { ...native, currentLifecycle,
      orgmasterLifecycleGrants: activeOrgmasterLifecycleGrants(currentLifecycle.state) }
  }

  return {
    get enabledCandidate() { return environment.JENFU_LOCAL_SANDBOX_ENABLED === '1' },

    async clearSessionCookie() {
      const config = readLocalSandboxConfig(environment, 'orgmaster')
      return [clearCookie(localSessionCookieName(config.sandboxId), config),
        clearCookie(transactionCookieName(config.sandboxId), config, CALLBACK_PATH)]
    },

    async mode(correlationId: string) {
      const value = await context()
      try {
        const nowMs = Date.now()
        const baselineEligible = value.profile.fixture.scenarios.filter((scenario) => scenario.principalStatus === 'active' &&
          scenario.employeeStatus === 'active' && scenario.grants.some((grant) => grant.applicationId === 'orgmaster' &&
            grant.status === 'active' && Date.parse(grant.validFrom) <= nowMs &&
            (grant.validUntil === null || Date.parse(grant.validUntil) > nowMs)))
        await readPdmCatalog(value.client, value.profile)
        const eligible: LocalScenario[] = []
        for (const scenario of baselineEligible) {
          await validateNativeOwnerBindings(value.client, value.profile, scenario, nowMs)
          const currentLifecycle = await readCurrentLifecycle(value.client, value.profile, scenario)
          if (lifecycleAllowsOrgmaster(currentLifecycle.state, nowMs)) eligible.push(scenario)
        }
        if (!eligible.length) unavailable()
        return { authMode: 'local_principal_sandbox' as const, localSandboxEnabled: true as const, correlationId }
      } finally { await endContext(value) }
    },

    async start(request: IncomingMessage) {
      const value = await context(request)
      try {
        const returnTo = safeReturnTo(new URL(request.url ?? '/', value.config.origin).searchParams.get('returnTo'))
        const state = randomBytes(24).toString('base64url')
        const verifier = randomBytes(32).toString('base64url')
        const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url')
        const callbackUri = `${value.config.origin}${CALLBACK_PATH}`
        const authorize = new URL('/api/local-sandbox/authorize', value.config.platformOrigin)
        authorize.search = new URLSearchParams({ response_type: 'code', client_id: 'orgmaster',
          redirect_uri: callbackUri, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
        const tx = Buffer.from(JSON.stringify({ state, verifier, returnTo })).toString('base64url')
        return { location: authorize.href, cookie: setCookie(transactionCookieName(value.config.sandboxId), tx, value.config, 120, CALLBACK_PATH) }
      } finally { await endContext(value) }
    },

    async callback(request: IncomingMessage) {
      const value = await context(request)
      try {
        const url = new URL(request.url ?? '/', value.config.origin)
        const expectedIssuer = `${value.config.platformOrigin}/api/local-sandbox`
        const txValue = cookieHeader(request, transactionCookieName(value.config.sandboxId))
        let tx: { state: string; verifier: string; returnTo: string } | null = null
        try {
          const parsed = JSON.parse(Buffer.from(txValue ?? '', 'base64url').toString('utf8'))
          exactKeys(parsed, ['state', 'verifier', 'returnTo'])
          if (typeof parsed.state === 'string' && typeof parsed.verifier === 'string' && typeof parsed.returnTo === 'string') tx = parsed
        } catch { /* handled as an invalid local handoff below */ }
        const code = url.searchParams.get('code')
        const queryKeys = [...url.searchParams.keys()].sort()
        if (queryKeys.length !== 3 || queryKeys.join(',') !== 'code,iss,state' ||
          !tx || !/^[A-Za-z0-9_-]{43}$/u.test(tx.verifier) || tx.state !== url.searchParams.get('state') ||
          url.searchParams.get('iss') !== expectedIssuer || !code || !/^[A-Za-z0-9_-]{32}$/u.test(tx.state)) authInvalid(true)

        const expectation: LocalAssertionExpectation = {
          applicationId: 'orgmaster' as const,
          sandboxId: value.profile.sandboxId,
          generation: value.profile.generation,
          fixtureVersion: value.profile.fixture.fixtureVersion,
          fixtureHash: value.profile.fixture.fixtureHash,
          nativeSessionContractVersion: value.profile.nativeSessionContractVersion,
          ...(value.profile.allowSyntheticAal2 === true ? {
            allowSyntheticAal2: true as const,
            assurancePolicyHash: value.profile.assurancePolicyHash,
          } : {}),
        }
        const proof = await value.localClient.tokenProof({ code, redirectUri: `${value.config.origin}${CALLBACK_PATH}`, codeVerifier: tx.verifier, expected: expectation })
        const assertion = proof.assertion
        const scenario = value.profile.fixture.scenarios.find((candidate) => candidate.scenarioId === assertion.scenarioId)
        if (!scenario || assertion.principalId !== scenario.principalId || assertion.employeeId !== scenario.employeeId ||
          assertion.identityIssuer !== scenario.identityIssuer || assertion.identitySubject !== scenario.identitySubject ||
          assertion.accountType !== scenario.accountType) authInvalid(true)
        const { row, currentLifecycle, orgmasterLifecycleGrants } = await validateFixtureAndOwner(value.client, value.profile, scenario)
        if (row.principal_id !== assertion.principalId || row.employee_id !== assertion.employeeId || row.account_type !== assertion.accountType) authInvalid(true)
        verifyOrgmasterLocalLifecycleAssertion(assertion, value.profile, currentLifecycle, orgmasterLifecycleGrants)
        const principals = createPrincipalAdmissionRepository(value.client as never)
        const epochs = createAuthEpochRepository(value.client as never)
        const [principal, state] = await Promise.all([
          principals.resolveActivePrincipal(assertion.identityIssuer, assertion.identitySubject),
          epochs.readPrincipalState(assertion.principalId),
        ])
        if (principal.principalId !== assertion.principalId || principal.employeeId !== assertion.employeeId ||
          state.authEpoch !== assertion.authEpoch ||
          state.revokedBefore && Date.parse(assertion.authenticatedAt) <= Date.parse(state.revokedBefore)) authInvalid(true)

        const rawToken = randomBytes(32).toString('base64url')
        const sessionHash = hashSessionToken(value.profile.key, rawToken)
        const nativeSessionIdHash = sha256(rawToken)
        const idempotencyKey = randomBytes(32).toString('base64url')
        const issuedAt = new Date(assertion.authenticatedAt).toISOString()
        const expiresAt = new Date(assertion.sourceSessionExpiresAt).toISOString()
        if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now() ||
          Date.parse(expiresAt) - Date.now() > ORGMASTER_SESSION_MAX_AGE_SECONDS * 1000 + 60_000) unavailable()

        await value.client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
        let session: OrgmasterSession
        try {
          await assertLocalDatabaseTarget(value.client, value.config, value.profile)
          await value.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [localPrincipalLifecycleLockKey({
            sandboxId: value.profile.sandboxId, generation: value.profile.generation, principalId: scenario.principalId,
          })])
          const lockedLifecycle = await readCurrentLifecycle(value.client, value.profile, scenario)
          if (lockedLifecycle.stateHash !== currentLifecycle.stateHash || !lifecycleAllowsOrgmaster(lockedLifecycle.state)) authInvalid(true)
          const lockedOrgmasterGrants = activeOrgmasterLifecycleGrants(lockedLifecycle.state)
          verifyOrgmasterLocalLifecycleAssertion(assertion, value.profile, lockedLifecycle, lockedOrgmasterGrants)
          const sessions = createOrgmasterSessionRepository(value.client as never)
          session = await sessions.create({
            sessionIdHash: sessionHash,
            identityIssuer: assertion.identityIssuer,
            identitySubject: assertion.identitySubject,
            principalId: assertion.principalId,
            employeeId: assertion.employeeId,
            authEpoch: assertion.authEpoch,
            principalAuthEpoch: assertion.authEpoch,
            sessionSchemaVersion: 2,
            epochKind: 'principal',
            issuedAt,
            authenticatedAt: issuedAt,
            expiresAt,
            assuranceLevel: assertion.assuranceLevel,
          })
          await value.client.query(`
            INSERT INTO ${BINDING_TABLE} (
              session_id, sandbox_id, generation, registration_id, portal_session_id, scenario_id,
              fixture_version, fixture_hash, native_session_contract_version, native_session_id_hash,
              join_digest, idempotency_key, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [session.id, value.profile.sandboxId, value.profile.generation, assertion.registrationId,
            assertion.portalSessionId, assertion.scenarioId, value.profile.fixture.fixtureVersion,
            value.profile.fixture.fixtureHash, value.profile.nativeSessionContractVersion,
            nativeSessionIdHash, assertion.joinDigest, idempotencyKey])
          await value.client.query(`
            INSERT INTO orgmaster_core.local_principal_lifecycle_session_bindings (
              session_id, sandbox_id, generation, principal_id, fixture_version, fixture_hash,
              account_lifecycle_version, profile_version, state_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [session.id, value.profile.sandboxId, value.profile.generation, scenario.principalId,
            value.profile.fixture.fixtureVersion, value.profile.fixture.fixtureHash,
            lockedLifecycle.state.accountLifecycleVersion, lockedLifecycle.state.profileVersion, lockedLifecycle.stateHash])
          await value.client.query('COMMIT')
        } catch (error) {
          await value.client.query('ROLLBACK').catch(() => undefined)
          throw error
        }

        const registrationInput = { registrationId: assertion.registrationId, nativeSessionIdHash,
          joinDigest: assertion.joinDigest, idempotencyKey }
        let registered = false
        try {
          try {
            const result = await value.localClient.register(registrationInput)
            exactResponseKeys(result, ['active', 'registrationId', 'joinDigest'])
            if (result.active !== true || result.registrationId !== assertion.registrationId || result.joinDigest !== assertion.joinDigest) unavailable()
            registered = true
          } catch (error) {
            // The result may have been lost after Platform committed. Read the provider first;
            // only the identical registration and idempotency key may be retried.
            try {
              const observed = await value.localClient.introspect({ nativeSessionIdHash, expectedJoinDigest: assertion.joinDigest })
              if (observed.active === true && observed.registrationId === assertion.registrationId && observed.joinDigest === assertion.joinDigest) registered = true
            } catch (readbackError) {
              if (!(readbackError instanceof Error && 'status' in readbackError && Number((readbackError as { status?: unknown }).status) === 401)) throw error
            }
            if (!registered) {
              const retry = await value.localClient.register(registrationInput)
              exactKeys(retry, ['active', 'registrationId', 'joinDigest'])
              if (retry.active !== true || retry.registrationId !== assertion.registrationId || retry.joinDigest !== assertion.joinDigest) unavailable()
              registered = true
            }
          }
        } catch (error) {
          await value.localClient.revoke({ nativeSessionIdHash, reason: 'orgmaster_registration_failed' }).catch(() => undefined)
          await value.client.query(`UPDATE ${BINDING_TABLE} SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [session.id]).catch(() => undefined)
          await value.client.query("UPDATE orgmaster_core.app_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), revoke_reason = COALESCE(revoke_reason, 'local_registration_failed'), updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND app_id = 'orgmaster'", [session.id]).catch(() => undefined)
          throw error
        }
        if (!registered) unavailable()
        const pendingBinding: BindingRow = {
          session_id: session.id,
          sandbox_id: value.profile.sandboxId,
          generation: value.profile.generation,
          registration_id: assertion.registrationId,
          portal_session_id: assertion.portalSessionId,
          scenario_id: assertion.scenarioId,
          fixture_version: value.profile.fixture.fixtureVersion,
          fixture_hash: value.profile.fixture.fixtureHash,
          native_session_contract_version: value.profile.nativeSessionContractVersion,
          native_session_id_hash: nativeSessionIdHash,
          join_digest: assertion.joinDigest,
          idempotency_key: idempotencyKey,
          status: 'pending',
        }
        try {
          const active = await value.localClient.introspect({ nativeSessionIdHash, expectedJoinDigest: assertion.joinDigest })
          verifyOrgmasterLocalIntrospection(active, pendingBinding, session)
          await value.client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
          await assertLocalDatabaseTarget(value.client, value.config, value.profile)
          const activated = await value.client.query(`
            UPDATE ${BINDING_TABLE}
               SET status = 'active', updated_at = CURRENT_TIMESTAMP
             WHERE session_id = $1 AND sandbox_id = $2 AND generation = $3 AND registration_id = $4
               AND native_session_id_hash = $5 AND join_digest = $6 AND status = 'pending'
          `, [session.id, value.profile.sandboxId, value.profile.generation, assertion.registrationId, nativeSessionIdHash, assertion.joinDigest])
          if (activated.rowCount !== 1) unavailable()
          await value.client.query('COMMIT')
        } catch (error) {
          await value.client.query('ROLLBACK').catch(() => undefined)
          await value.localClient.revoke({ nativeSessionIdHash, reason: 'orgmaster_registration_failed' }).catch(() => undefined)
          await value.client.query(`UPDATE ${BINDING_TABLE} SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [session.id]).catch(() => undefined)
          await value.client.query("UPDATE orgmaster_core.app_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), revoke_reason = COALESCE(revoke_reason, 'local_registration_failed'), updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND app_id = 'orgmaster'", [session.id]).catch(() => undefined)
          throw error
        }
        return {
          location: safeReturnTo(tx.returnTo),
          token: rawToken,
          session,
          profile: value.profile,
          cookie: setCookie(localSessionCookieName(value.profile.sandboxId), rawToken, value.config, ORGMASTER_SESSION_MAX_AGE_SECONDS),
          clearTransactionCookie: clearCookie(transactionCookieName(value.profile.sandboxId), value.config, CALLBACK_PATH),
        }
      } catch (error) {
        console.warn('[orgmaster-local-sandbox] callback dependency failure', {
          errorType: error instanceof Error ? error.name : 'unknown',
          code: error && typeof error === 'object' && 'code' in error && /^[A-Za-z0-9_]{1,100}$/.test(String(error.code)) ? error.code : 'unclassified',
          frames: error instanceof Error && typeof error.stack === 'string' ? error.stack.split('\n').slice(1).filter(line => /^\s+at /.test(line)).slice(0, 4) : [],
        })
        if (error instanceof OrgmasterLocalPrincipalSandboxError) throw error
        if (error instanceof PrincipalAdmissionError && error.code === 'principal_not_active') authInvalid(true)
        if (error instanceof AuthEpochUnavailableError) unavailable()
        return unavailable()
      } finally { await endContext(value) }
    },

    async verify(request: IncomingMessage, correlationId?: string): Promise<LocalSandboxSessionResult> {
      let value: Awaited<ReturnType<typeof context>>
      try {
        value = await context(request)
      } catch (error) {
        emitLocalSandboxAuthDiagnostic(request, correlationId, 'runtime_context', error)
        throw error
      }
      let diagnosticStage: LocalSandboxAuthStage = 'session_lookup'
      try {
        const token = cookieHeader(request, localSessionCookieName(value.profile.sandboxId))
        if (!token || token.length > 256) authInvalid(true)
        const hash = hashSessionToken(value.profile.key, token)
        const sessions = createOrgmasterSessionRepository(value.client as never)
        const session = await sessions.findByHash(hash)
        if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now() ||
          session.sessionSchemaVersion !== 2 || session.epochKind !== 'principal' || session.principalAuthEpoch === null || !session.authenticatedAt) authInvalid(true)
        diagnosticStage = 'session_binding_lookup'
        const bindingResult = await value.client.query<BindingRow>(`
          SELECT session_id, sandbox_id, generation, registration_id, portal_session_id, scenario_id,
                 fixture_version, fixture_hash, native_session_contract_version, native_session_id_hash,
                 join_digest, idempotency_key, status
            FROM ${BINDING_TABLE}
           WHERE session_id = $1 AND sandbox_id = $2
           FETCH FIRST 2 ROWS ONLY
        `, [session.id, value.profile.sandboxId])
        if (bindingResult.rows.length !== 1) authInvalid(true)
        const binding = bindingResult.rows[0]
        if (!sameHash(binding.native_session_id_hash, sha256(token))) authInvalid(true)
        diagnosticStage = 'principal_auth_state'
        const scenario = await verifyNativePrincipal(value.client, session, binding, value.profile)
        diagnosticStage = 'fixture_owner_readiness'
        const { currentLifecycle } = await validateFixtureAndOwner(value.client, value.profile, scenario)
        diagnosticStage = 'lifecycle_binding_lookup'
        const lifecycleBindingResult = await value.client.query<{
          sandbox_id: string; generation: string; principal_id: string; fixture_version: string; fixture_hash: string;
          account_lifecycle_version: number; profile_version: number; state_hash: string
        }>(`
          SELECT sandbox_id, generation, principal_id, fixture_version, fixture_hash,
                 account_lifecycle_version, profile_version, state_hash
            FROM orgmaster_core.local_principal_lifecycle_session_bindings
           WHERE session_id = $1 AND sandbox_id = $2
           FETCH FIRST 2 ROWS ONLY
        `, [session.id, value.profile.sandboxId])
        if (lifecycleBindingResult.rows.length !== 1) authInvalid(true)
        const lifecycleBinding = lifecycleBindingResult.rows[0]
        verifyOrgmasterLocalLifecycleSessionBinding(lifecycleBinding, value.profile, currentLifecycle, scenario)
        diagnosticStage = 'native_auth_introspection'
        await introspect(value.localClient, binding, session)
        diagnosticStage = 'lifecycle_recheck'
        const lifecycleAfterIntrospection = await readCurrentLifecycle(value.client, value.profile, scenario)
        verifyOrgmasterLocalLifecycleSessionBinding(lifecycleBinding, value.profile, lifecycleAfterIntrospection, scenario)
        return { session, profile: value.profile, persistenceTargetUrl: value.config.databaseUrl }
      } catch (error) {
        if (!(error instanceof OrgmasterLocalPrincipalSandboxError) || error.status >= 500) {
          emitLocalSandboxAuthDiagnostic(request, correlationId, diagnosticStage, error)
        }
        if (error instanceof OrgmasterLocalPrincipalSandboxError) throw error
        if (error instanceof PrincipalAdmissionError) {
          if (error.code === 'principal_directory_unavailable') unavailable()
          authInvalid(true)
        }
        if (error instanceof AuthEpochUnavailableError) unavailable()
        return unavailable()
      } finally { await endContext(value) }
    },

    async logout(request: IncomingMessage) {
      const value = await context(request, true)
      try {
        const token = cookieHeader(request, localSessionCookieName(value.profile.sandboxId))
        if (token) {
          const hash = hashSessionToken(value.profile.key, token)
          const sessions = createOrgmasterSessionRepository(value.client as never)
          const session = await sessions.findByHash(hash)
          if (session) {
            const binding = await value.client.query<BindingRow>(`SELECT session_id, sandbox_id, generation, registration_id,
              portal_session_id, scenario_id, fixture_version, fixture_hash, native_session_contract_version,
              native_session_id_hash, join_digest, idempotency_key, status FROM ${BINDING_TABLE} WHERE session_id = $1`, [session.id])
            if (binding.rows[0]) {
              const activeBinding = binding.rows[0]
              let remoteRevocationConfirmed = false
              try {
                await value.localClient.revoke({ nativeSessionIdHash: activeBinding.native_session_id_hash, reason: 'orgmaster_local_logout' })
                remoteRevocationConfirmed = true
              } catch {
                // Revoke may have committed before its reply was lost. Read Platform first;
                // repeat only while the same native registration is still active.
                try {
                  const observed = await value.localClient.introspect({ nativeSessionIdHash: activeBinding.native_session_id_hash, expectedJoinDigest: activeBinding.join_digest })
                  if (observed.active === true && observed.registrationId === activeBinding.registration_id && observed.joinDigest === activeBinding.join_digest) {
                    await value.localClient.revoke({ nativeSessionIdHash: activeBinding.native_session_id_hash, reason: 'orgmaster_local_logout' })
                    remoteRevocationConfirmed = true
                  }
                } catch (readbackError) {
                  if (statusOf(readbackError) === 401) remoteRevocationConfirmed = true
                }
              }
              await value.client.query(`UPDATE ${BINDING_TABLE} SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [session.id])
              await sessions.revokeByHash(hash, 'local_logout')
              if (!remoteRevocationConfirmed) throw new OrgmasterLocalPrincipalSandboxError(503, 'local_sandbox_unavailable', true)
            } else {
              await sessions.revokeByHash(hash, 'local_logout')
            }
          }
        }
        return { cookies: [clearCookie(localSessionCookieName(value.profile.sandboxId), value.config), clearCookie(transactionCookieName(value.profile.sandboxId), value.config, CALLBACK_PATH)] }
      } finally { await endContext(value) }
    },

    async close() {
      const current = pool
      pool = null
      poolUrl = ''
      if (current) await current.end()
      await closeOrgmasterLocalSandboxDatabase()
    },
  }
}
