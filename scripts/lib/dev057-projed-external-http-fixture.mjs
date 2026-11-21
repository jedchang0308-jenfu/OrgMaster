// Test-only owner fixture. Import from Vitest so its existing TS pipeline loads
// the real repositories; this helper is excluded from the runtime bundle.
import { randomBytes, createHash } from 'node:crypto'
import pg from 'pg'
import { prepareAdministrationInitializationFixture, drainAdministrationFixtureEvents, createAdministrativeHumanFixture } from './dev070-administration-postgres-fixture.mjs'
import { createOrgmasterSessionRepository } from '../../server/orgmasterSessionRepository.ts'
import { createPrincipalAdmissionRepository } from '../../server/orgmasterPrincipalAdmissionRepository.ts'
import { createAuthEpochRepository } from '../../server/orgmasterAuthEpochRepository.ts'
import { createProjedExternalService } from '../../server/orgmasterProjedExternal.ts'

export async function createProjedExternalHttpFixture({ admin, runtime, platform, binding }) {
  if (binding.host !== '127.0.0.1' || !/^dev014_[a-f0-9]{20}$/u.test(binding.databaseName)) throw new Error('PROJED_EXTERNAL_FIXTURE_TARGET_INVALID')
  const target = (await admin.query('SELECT current_database() database,SESSION_USER::text login,host(inet_server_addr()) host,inet_server_port() port')).rows[0]
  if (target.database !== binding.databaseName || target.login !== 'postgres' || target.host !== binding.host || target.port !== binding.port) throw new Error('PROJED_EXTERNAL_FIXTURE_TARGET_INVALID')
  const clients = []
  const connect = async user => {
    const client = new pg.Client({ host: binding.host, port: binding.port, database: binding.databaseName, user, ssl: false })
    await client.connect(); clients.push(client); return client
  }
  const fixture = { admin, connect, handle: { databaseName: binding.databaseName } }
  let human
  try {
    const initialization = await prepareAdministrationInitializationFixture(fixture)
    await initialization.initialize()
    await drainAdministrationFixtureEvents(fixture, async ({ eventId, snapshotHash, deliveryPrincipalId }) => {
      const result = (await platform.query('SELECT * FROM platform_core.consume_principal_lifecycle_v2($1,$2,$3)', [eventId, snapshotHash, deliveryPrincipalId])).rows[0]
      if (!result?.receipt_id) throw new Error('PROJED_EXTERNAL_FIXTURE_RECEIPT_REQUIRED')
      return { receiptId: result.receipt_id }
    })
    await platform.query("SELECT * FROM platform_core.initialize_principal_security_state_v1('principal-legacy')")
    human = await createAdministrativeHumanFixture(fixture)
  } finally { await Promise.allSettled(clients.map(client => client.end())) }
  const pepper = 'dev057-external-http-isolated-fixture-pepper'
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(pepper).update('\0').update(token).digest('hex')
  const sessionRow = (await admin.query('SELECT * FROM orgmaster_core.app_sessions WHERE id=$1', [human.sessionId])).rows[0]
  await createOrgmasterSessionRepository(runtime).create({
    sessionIdHash: hash, identityIssuer: sessionRow.identity_issuer, identitySubject: sessionRow.identity_subject,
    principalId: sessionRow.principal_id, employeeId: sessionRow.employee_id, authEpoch: Number(sessionRow.auth_epoch),
    issuedAt: new Date(sessionRow.issued_at).toISOString(), authenticatedAt: new Date(sessionRow.authenticated_at).toISOString(),
    expiresAt: new Date(sessionRow.expires_at).toISOString(), assuranceLevel: sessionRow.assurance_level,
    sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: Number(sessionRow.principal_auth_epoch),
  })
  const authRuntime = {
    configResult: { configured: true, config: {
      publicBaseUrl: new URL('https://orgmaster.example.test'), postgresUrl: 'isolated-test-ports-only', sessionHashPepper: pepper,
      firebaseProjectId: 'external-http-isolated', identityIssuer: 'https://securetoken.google.com/external-http-isolated', identityAudience: 'external-http-isolated',
      firebasePublicConfig: { apiKey: 'isolated', authDomain: 'isolated.invalid', projectId: 'external-http-isolated', appId: 'isolated' }, secureCookie: true,
    } },
    firebase: { async verifyIdToken() { throw new Error('PROJED_EXTERNAL_FIXTURE_DOES_NOT_VERIFY_PROVIDER_TOKENS') } },
    sessions: createOrgmasterSessionRepository(runtime), principals: createPrincipalAdmissionRepository(runtime), epochs: createAuthEpochRepository(runtime),
    projedExternal: createProjedExternalService(runtime),
    projedExternalCallerVerifier: { async verify(value) {
      if (value !== 'LOCAL_SIMULATION.projed-external-caller') throw new Error('LOCAL_SIMULATION_CALLER_PROOF_INVALID')
      return { email: 'projed-fixture@example.invalid', subject: 'projed-external-caller-fixture' }
    } },
  }
  return { authRuntime, adminCookie: `orgmaster_session=${token}`, adminPrincipalId: human.principalId }
}
