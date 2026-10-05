import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createOrgmasterAuthMiddleware, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { hashSessionToken } from './orgmasterAuthCookies'
import { withPersistencePrincipal, writePersistenceArtifacts } from './orgmasterPersistenceRepository'

const writerSql = 'write_active_persistence_artifacts_with_identity_fence_v2'

function fakeDatabase() {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('read_active_persistence_authority_v1')) {
      return { rowCount: 1, rows: [{ source_revision: 'source-before' }] }
    }
    if (sql.includes(writerSql)) {
      return { rowCount: 1, rows: [{ authority_version: 7, source_revision: 'source-after', outbox_count: 1 }] }
    }
    throw new Error('unexpected fake query')
  })
  return { query }
}

function change(artifactKey = 'orgmaster-governance.v3.json') {
  const payload = { schemaVersion: 3, artifactKey }
  return [{
    artifactKey,
    artifactKind: 'governance' as const,
    localPath: `unused/${artifactKey}`,
    payload,
    raw: JSON.stringify(payload),
    expectedRevision: 'expected-revision',
  }]
}

function write(database: ReturnType<typeof fakeDatabase>, options: { updatedBy?: string; operationId?: string } = {}) {
  return writePersistenceArtifacts(change(options.operationId ?? 'normal-api-write'), {
    database: database as never,
    reasonCode: 'test-persistence-write',
    ...options,
  })
}

describe('verified persistence principal propagation', () => {
  it('carries the principal from a verified normal session through Auth middleware into the v2 writer', async () => {
    const database = fakeDatabase()
    const pepper = 'synthetic-session-pepper'
    const token = 'synthetic-session-token-with-sufficient-length-123456'
    const verifiedPrincipalId = 'principal-managed:00000000-0000-4000-8000-000000000001'
    const session = {
      id: 'session-synthetic-1', identityIssuer: 'https://securetoken.google.com/synthetic', identitySubject: 'firebase-uid-distinct-from-principal',
      principalId: verifiedPrincipalId, employeeId: 'employee-synthetic-1', authEpoch: 0, sessionSchemaVersion: 2 as const,
      epochKind: 'principal' as const, principalAuthEpoch: 4, issuedAt: new Date().toISOString(),
      authenticatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1' as const,
    }
    const runtime = {
      configResult: { configured: true, config: { publicBaseUrl: new URL('https://orgmaster.example.test'), sessionHashPepper: pepper, secureCookie: true } },
      firebase: { verifyIdToken: vi.fn() },
      principals: { resolveActivePrincipal: vi.fn(async () => ({ principalId: verifiedPrincipalId, employeeId: session.employeeId, mappingVersion: 1, publishedAt: session.issuedAt })) },
      epochs: { readPrincipalState: vi.fn(async () => ({ authEpoch: session.principalAuthEpoch, revokedBefore: null })) },
      sessions: { findByHash: vi.fn(async (hash: string) => hash === hashSessionToken(pepper, token) ? session : null), revokeByHash: vi.fn() },
    } as unknown as OrgmasterAuthRuntime
    const request = { url: '/api/protected', method: 'GET', headers: { cookie: `orgmaster_session=${token}` } } as IncomingMessage
    const responseState = { writableEnded: false, statusCode: 0 }
    let resolveWrite!: (value: Awaited<ReturnType<typeof writePersistenceArtifacts>>) => void
    let rejectWrite!: (reason: unknown) => void
    let nextStarted = false
    const writeResult = new Promise<Awaited<ReturnType<typeof writePersistenceArtifacts>>>((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject })
    const response = {
      get writableEnded() { return responseState.writableEnded },
      set statusCode(value: number) { responseState.statusCode = value },
      get statusCode() { return responseState.statusCode },
      setHeader: vi.fn(),
      end: vi.fn(() => {
        responseState.writableEnded = true
        if (!nextStarted) rejectWrite(new Error(`Auth rejected before next: ${responseState.statusCode}`))
      }),
    } as unknown as ServerResponse

    createOrgmasterAuthMiddleware(() => runtime)(request, response, () => {
      nextStarted = true
      void writePersistenceArtifacts(change(), { database: database as never, reasonCode: 'verified-normal-api-write' }).then(resolveWrite, rejectWrite)
    })
    await writeResult

    const writer = database.query.mock.calls.find(([sql]) => sql.includes(writerSql))
    expect(runtime.principals!.resolveActivePrincipal).toHaveBeenCalledWith(session.identityIssuer, session.identitySubject)
    expect(runtime.epochs!.readPrincipalState).toHaveBeenCalledWith(verifiedPrincipalId)
    expect(writer?.[1]?.[2]).toBe(verifiedPrincipalId)
    expect(writer?.[1]?.[2]).not.toBe(session.identitySubject)
    expect(writer?.[1]?.[2]).not.toBe(session.employeeId)
  })

  it('writes the verified Principal through the v2 identity-fenced writer', async () => {
    const database = fakeDatabase()
    const verifiedPrincipalId = 'principal-managed:00000000-0000-4000-8000-000000000001'
    const result = await withPersistencePrincipal(verifiedPrincipalId, () => write(database))
    const writer = database.query.mock.calls.find(([sql]) => sql.includes(writerSql))

    expect(writer).toBeDefined()
    expect(writer?.[0]).toContain(writerSql)
    expect(writer?.[0]).not.toContain('write_active_persistence_artifacts_with_identity_fence_v1(')
    expect(writer?.[1]?.[2]).toBe(verifiedPrincipalId)
    expect(result.authorityVersion).toBe(7)
  })

  it('rejects a write with no trusted actor and does not fall back to orgmaster-runtime', async () => {
    const database = fakeDatabase()

    await expect(write(database)).rejects.toMatchObject({ code: 'PERSISTENCE_WRITE_FAILED' })

    expect(database.query.mock.calls.some(([sql]) => sql.includes(writerSql))).toBe(false)
    expect(database.query.mock.calls).toHaveLength(1)
  })

  it.each(['firebase-uid-123', 'person@example.test'])('rejects explicit %s when it conflicts with the verified Principal', async (untrustedActor) => {
    const database = fakeDatabase()
    const verifiedPrincipalId = 'principal-managed:00000000-0000-4000-8000-000000000001'

    await expect(withPersistencePrincipal(verifiedPrincipalId, () => write(database, { updatedBy: untrustedActor })))
      .rejects.toMatchObject({ code: 'PERSISTENCE_WRITE_FAILED' })

    expect(database.query.mock.calls.some(([sql]) => sql.includes(writerSql))).toBe(false)
  })

  it('keeps two overlapping asynchronous request Principals isolated', async () => {
    const database = fakeDatabase()
    let arrived = 0
    let release!: () => void
    const bothReady = new Promise<void>((resolve) => { release = resolve })
    const barrier = async () => {
      arrived += 1
      if (arrived === 2) release()
      await bothReady
      await Promise.resolve()
    }
    const principalA = 'principal-managed:00000000-0000-4000-8000-00000000000a'
    const principalB = 'principal-managed:00000000-0000-4000-8000-00000000000b'

    await Promise.all([
      withPersistencePrincipal(principalA, async () => { await barrier(); return write(database, { operationId: 'parallel-a' }) }),
      withPersistencePrincipal(principalB, async () => { await barrier(); return write(database, { operationId: 'parallel-b' }) }),
    ])

    const writes = database.query.mock.calls.filter(([sql]) => sql.includes(writerSql))
    const actorsByOperation = new Map(writes.map(([, values]) => [String(values?.[4]), String(values?.[2])]))
    expect(arrived).toBe(2)
    expect(actorsByOperation).toEqual(new Map([['parallel-a', principalA], ['parallel-b', principalB]]))
  })
})
