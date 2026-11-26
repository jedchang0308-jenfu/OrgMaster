import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { createDutyMapSeed } from '../src/dutyMapSeed'
import { screenshotOrganizationState } from '../src/screenshotData'
import { createWorkspaceManifest } from '../src/versionWorkspace'
import { createOrgmasterServer } from './orgmasterServer'
import type { OrgmasterAuthRuntime } from './orgmasterAuthApi'

const servers: Server[] = []
const roots: string[] = []
const runtime: OrgmasterAuthRuntime = { configResult: { configured: false, missing: ['ORGMASTER_POSTGRES_URL'], reason: 'isolated RD fixture' } }
async function listen(server: Server) {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing loopback address')
  return `http://127.0.0.1:${address.port}`
}
async function login(base: string, profileId: string) {
  const response = await fetch(base + '/api/auth/development/session', {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ profileId }),
  })
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Missing trusted development profile cookie')
  return cookie
}
async function setup() {
  vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json')
  vi.stubEnv('ORGMASTER_JENFU_SSO_HANDOFF_MODE', 'off')
  const root = await mkdtemp(join(tmpdir(), 'orgmaster-duty-map-server-rd-'))
  roots.push(root)
  let sequence = 0
  const state = createDutyMapSeed({ ...structuredClone(screenshotOrganizationState), departments: [], duties: [], dutyMap: undefined,
    employees: [], positions: [], members: [], assignments: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
  }, () => `node-${++sequence}`)
  const savedAt = '2026-11-25T00:00:00.000Z'
  const document = createOrgDocumentFile(state, 'document', savedAt)
  const raw = JSON.stringify(document)
  await mkdir(join(root, 'data', 'orgmaster-versions'), { recursive: true })
  await writeFile(join(root, 'data', 'orgmaster-versions', 'current-1.json'), raw)
  await writeFile(join(root, 'data', 'orgmaster-workspace.v1.json'), JSON.stringify(createWorkspaceManifest('current-1', savedAt)))
  const base = await listen(createOrgmasterServer({ root, authRuntime: runtime, devIdentityEnabled: true }))
  return { root, raw, state, base }
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    expect(server.listening).toBe(false)
  }
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('orgmaster-duty-map-server-rd-')) throw new Error('Unexpected cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})

describe('DEV-071 actual server and SDK wire RD self-check', () => {
  it('uses the declared administrator permission through the trusted adapter and real SDK loopback provider', async () => {
    const f = await setup()
    const providerRequests: any[] = []
    const provider = await listen(createServer(async (request, response) => {
      expect(request.url).toBe('/v1/responses')
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      providerRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        id: 'resp_rd_fixture', object: 'response', status: 'completed', created_at: 1, model: 'local-rd-model',
        output: [{ id: 'msg_rd', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ findings: [{
          kind: 'handoff-gap', nodeRefs: [{ kind: 'duty', id: f.state.duties[0].id }, { kind: 'duty', id: f.state.duties.at(-1)!.id }],
          chapterIds: ['04'], relationshipIds: [], summary: 'RD 交接案例', observed: '已登錄職掌', suggestion: '核對承接', reason: '缺少執行資料',
        }] }), annotations: [] }] }],
      }))
    }))
    vi.stubEnv('OPENAI_BASE_URL', provider + '/v1')
    vi.stubEnv('OPENAI_API_KEY', 'loopback-rd-only-key')
    vi.stubEnv('ORGMASTER_DUTY_MAP_MODEL', 'local-rd-model')
    const cookie = await login(f.base, 'administrator')
    const response = await fetch(f.base + '/api/orgmaster/duty-map?versionId=current-1', { headers: { cookie } })
    expect(response.status).toBe(200)
    const graph = await response.json() as any
    expect(graph.canReview).toBe(true)
    expect(providerRequests).toHaveLength(0)
    const reviewResponse = await fetch(f.base + '/api/orgmaster/duty-map/reviews', {
      method: 'POST', headers: { cookie, origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify({
        requestId: 'wire-request', versionId: graph.versionId, expectedVersionRevision: graph.revision, chapterCatalogVersion: graph.chapterCatalogVersion,
      }),
    })
    expect(reviewResponse.status).toBe(200)
    expect(reviewResponse.headers.get('cache-control')).toBe('no-store')
    const result = await reviewResponse.json() as any
    expect(result).toMatchObject({ requestId: 'wire-request', versionId: 'current-1', versionKind: 'current', revision: graph.revision })
    expect(result.findings).toHaveLength(1)
    expect(providerRequests).toHaveLength(1)
    const company = JSON.parse(providerRequests[0].input[1].content[0].text)
    expect(company.departments).toHaveLength(6)
    expect(company.groups).toHaveLength(33)
    expect(company.duties).toHaveLength(116)
    expect(company.chapters).toHaveLength(12)
    expect(company).not.toHaveProperty('employees')
    expect(providerRequests[0]).toMatchObject({ model: 'local-rd-model', store: false, text: { format: { type: 'json_schema', strict: true } } })
    expect(JSON.stringify(result)).not.toContain('loopback-rd-only-key')
    expect(await readFile(join(f.root, 'data', 'orgmaster-versions', 'current-1.json'), 'utf8')).toBe(f.raw)
  })

  it.each(['employee', 'governance-manager', 'method-manager'])('lets trusted %s read the graph but denies review without its dedicated permission', async profileId => {
    const f = await setup()
    const cookie = await login(f.base, profileId)
    const graphResponse = await fetch(f.base + '/api/orgmaster/duty-map?versionId=current-1', { headers: { cookie } })
    expect(graphResponse.status).toBe(200)
    const graph = await graphResponse.json() as any
    expect(graph.canReview).toBe(false)
    const review = await fetch(f.base + '/api/orgmaster/duty-map/reviews', {
      method: 'POST', headers: { cookie, origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify({
        requestId: 'reader-request', versionId: 'current-1', expectedVersionRevision: graph.revision, chapterCatalogVersion: graph.chapterCatalogVersion,
      }),
    })
    expect(review.status).toBe(403)
    expect(await review.json()).toEqual({ error: 'DUTY_MAP_REVIEW_FORBIDDEN' })
  })

  it('does not accept development cookies or raw actor headers with the production adapter disabled', async () => {
    const f = await setup()
    const base = await listen(createOrgmasterServer({ root: f.root, authRuntime: runtime, devIdentityEnabled: false }))
    const attempted = await fetch(base + '/api/orgmaster/duty-map?versionId=current-1', { headers: {
      cookie: 'orgmaster_dev_profile=administrator', 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin',
    } })
    expect(attempted.status).toBe(503)
    const hidden = await fetch(base + '/api/auth/development/session', {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'administrator' }),
    })
    expect(hidden.status).toBe(404)
  })
})
