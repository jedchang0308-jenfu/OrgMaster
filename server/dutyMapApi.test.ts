import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { DUTY_CHAPTER_CATALOG_VERSION } from '../src/dutyMap'
import { createDutyMapSeed } from '../src/dutyMapSeed'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { ORGMASTER_BUSINESS_PERMISSIONS } from '../src/governance/aiPdmCatalog'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceAssignmentVersionV3, GovernanceDocumentV3 } from '../src/governance/types'
import type { ManagementMethodV1 } from '../src/managementMethods/types'
import { screenshotOrganizationState } from '../src/screenshotData'
import type { WorkspaceDocumentResult } from '../src/versionWorkspace'
import { createOrgmasterDutyMapMiddleware, mapDutyMapError, type DutyMapApiDependencies, type AuthorizeDutyMapWorkspace } from './dutyMapApi'
import * as governance from './orgmasterGovernanceStore'
import { setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { createWorkspaceManifest } from '../src/versionWorkspace'

const timestamp = '2026-01-01T00:00:00.000Z'
function version(id = 'draft-1', kind: 'current' | 'draft' = 'draft'): WorkspaceDocumentResult {
  let sequence = 0
  const state = createDutyMapSeed({ ...structuredClone(screenshotOrganizationState), departments: [], duties: [], dutyMap: undefined,
    employees: [], positions: [], members: [], assignments: [], dutyPositionRelations: [],
    processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
  }, () => `node-${++sequence}`)
  state.dutyMap!.methodLinks = [
    { id: 'common-link', methodId: 'readable', target: { kind: 'group', id: state.dutyMap!.groups[0].id } },
    { id: 'special-link', methodId: 'readable', target: { kind: 'duty', id: state.duties.at(-1)!.id } },
    { id: 'stopped-link', methodId: 'stopped', target: { kind: 'duty', id: state.duties[0].id } },
    { id: 'restricted-link', methodId: 'restricted', target: { kind: 'duty', id: state.duties[0].id } },
  ]
  return {
    document: createOrgDocumentFile(state, kind === 'draft' ? 'draft' : 'document', timestamp),
    version: { id, name: kind === 'draft' ? '規劃草稿' : '現行版', kind, revision: `revision-${id}`, status: 'active', basedOnVersionId: null, createdAt: timestamp, archivedAt: null, updatedAt: timestamp, loadStatus: 'ready' },
  }
}
function method(id: string): ManagementMethodV1 {
  const draft = { bodyFormat: 'editor-json-v1' as const, body: { type: 'doc' as const, content: [] }, bodyHash: 'hash', revision: 'draft-revision', mediaIds: [], updatedByPrincipalId: 'writer', updatedAt: timestamp }
  return {
    id, code: id === 'readable' ? 'MP-0001' : id === 'restricted' ? 'MP-0002' : 'MP-0003',
    title: '未提供的機密草稿標題', ownerEmployeeId: null, creationRequestId: id, creationInputHash: 'hash', methodRevision: 'revision', workingDraft: draft,
    readableSnapshot: id === 'stopped' ? null : { title: '公司閱讀版-' + id, ownerEmployeeId: 'owner', bodyFormat: draft.bodyFormat, body: draft.body, bodyHash: 'hash', sourceDraftRevision: 'revision', mediaIds: [], providedByPrincipalId: 'writer', providedAt: timestamp },
    generationMeta: { provider: 'openai', model: 'model', promptVersion: 'management-method-draft-v1', providerRequestId: null, durationMs: 0, inputTokens: null, outputTokens: null, generatedAt: timestamp },
    createdByPrincipalId: 'writer', updatedByPrincipalId: 'writer', createdAt: timestamp, updatedAt: timestamp,
  }
}
function publishedGovernance() {
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(timestamp), 'seed')
  const policy = structuredClone(document.draft)
  policy.permissions.push({ ...ORGMASTER_BUSINESS_PERMISSIONS[0] })
  policy.applicationRoles.push({ id: 'reviewer', applicationId: 'orgmaster', code: 'duty_reviewer', name: '具資格主管', status: 'active', systemDefined: false })
  policy.rolePermissionGrants.push({ id: 'allow-review', roleId: 'reviewer', permissionId: 'permission-orgmaster-duty-map-review', effect: 'allow' })
  policy.roleAssignments.push({ id: 'review-appointment', applicationId: 'orgmaster', employeeId: 'employee-1', roleId: 'reviewer', roleCodeSnapshot: 'duty_reviewer', roleNameSnapshot: '具資格主管', catalogVersion: null, scope: { kind: 'global' }, status: 'active', validFrom: timestamp, validTo: null, effectState: 'not-synchronized', basis: 'manual', subjectKind: 'principal', targetPrincipalId: 'principal-1', sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null }, createdByPrincipalId: 'publisher', createdReason: 'RD fixture' })
  document.activePolicyVersionId = 'published'
  document.publishedVersions = [{ kind: 'assignment-governance-v3', id: 'published', versionNumber: 1, publishedAt: timestamp, publishedByPrincipalId: 'publisher', publishReason: 'RD fixture', snapshotHash: 'hash', effectState: 'not-synchronized', policy, externalRoleCatalogs: [], organizationSnapshot: { workspaceVersionId: 'current-1', workspaceRevision: 'revision', capturedAt: timestamp, employees: [], departments: [], organizationRoles: [], positions: [], assignments: [] } }]
  return document
}
function mockGovernance(document: GovernanceDocumentV3) {
  vi.spyOn(governance, 'readStoredGovernanceDocument').mockResolvedValue({ document, revision: 'governance-revision', raw: '{}', payload: document as unknown as Record<string, unknown>, artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance', sourceRevision: null })
}

type Reply = { status: number; headers: Map<string, string>; body: any }
function invoke(dependencies: DutyMapApiDependencies, input: { root?: string; path?: string; method?: string; body?: unknown; identity?: boolean; headers?: Record<string, string> } = {},
  authorizeWorkspace: AuthorizeDutyMapWorkspace = async () => 'principal-1') {
  const request = Readable.from(input.body === undefined ? [] : [Buffer.from(typeof input.body === 'string' ? input.body : JSON.stringify(input.body))]) as IncomingMessage
  request.url = input.path ?? '/api/orgmaster/duty-map?versionId=draft-1'
  request.method = input.method ?? 'GET'
  request.headers = { 'content-type': 'application/json', ...input.headers }
  if (input.identity !== false) setVerifiedRequestIdentity(request, {
    id: 'session', principalId: 'principal-1', employeeId: 'employee-1', identityIssuer: 'https://verified.example', identitySubject: 'subject', authEpoch: 1,
    sessionSchemaVersion: 2, epochKind: 'principal', principalAuthEpoch: 1, issuedAt: timestamp, authenticatedAt: timestamp, expiresAt: '2027-01-01T00:00:00Z', revokedAt: null, assuranceLevel: 'aal1',
  })
  const headers = new Map<string, string>()
  const response = new EventEmitter() as ServerResponse
  let complete!: (reply: Reply) => void
  const finished = new Promise<Reply>(resolve => { complete = resolve })
  response.setHeader = ((key: string, value: string) => { headers.set(key, value); return response }) as ServerResponse['setHeader']
  response.end = ((raw: string) => { complete({ status: response.statusCode, headers, body: JSON.parse(raw) }); return response }) as ServerResponse['end']
  createOrgmasterDutyMapMiddleware(input.root ?? '/rd/api', authorizeWorkspace, dependencies)(request, response, () => complete({ status: 0, headers, body: null }))
  return { request, response, finished }
}
function setup() {
  const selected = version()
  const readVersion = vi.fn(async () => structuredClone(selected))
  const generate = vi.fn(async () => ({ findings: [] }))
  const dependencies: DutyMapApiDependencies = {
    readVersion, readMethods: async () => [method('readable'), method('stopped'), method('restricted')], canReview: async () => true,
    canReadMethod: async (_root, _actor, value) => value.id !== 'restricted', review: { generate },
  }
  const body = { versionId: 'draft-1', expectedVersionRevision: selected.version.revision, chapterCatalogVersion: DUTY_CHAPTER_CATALOG_VERSION, requestId: 'request-1' }
  return { selected, readVersion, generate, dependencies, body }
}
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    // Delete only directories created by this test within the OS temporary root.
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('orgmaster-duty-map-rd-')) throw new Error('Unexpected fixture cleanup target')
    await rm(root, { recursive: true, force: true })
  }
})

describe('DEV-071 duty map API RD self-check', () => {
  it('uses verified workspace read authorization and exposes only explicitly linked company-readable methods', async () => {
    const f = setup()
    const authorize = vi.fn(async () => 'principal-1')
    const result = await invoke(f.dependencies, {}, authorize).finished
    expect(result.status).toBe(200)
    expect(authorize).toHaveBeenCalledWith(expect.anything(), false)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(result.body).toMatchObject({ versionId: 'draft-1', revision: 'revision-draft-1', versionKind: 'draft', canReview: true })
    expect(result.body.departments).toHaveLength(6)
    expect(result.body.map.groups).toHaveLength(33)
    expect(result.body.duties).toHaveLength(116)
    expect(result.body.methods).toEqual([{ id: 'readable', code: 'MP-0001', title: '公司閱讀版-readable' }])
    expect(result.body.map.methodLinks).toHaveLength(2)
    expect(JSON.stringify(result.body)).not.toContain('restricted')
    expect(JSON.stringify(result.body)).not.toContain('未提供的機密草稿標題')
    expect(result.body).not.toHaveProperty('employees')
    expect(result.body).not.toHaveProperty('positions')
    expect(f.generate).not.toHaveBeenCalled()
  })

  it('reverse-links the same zero-position group and detail exactly once with department paths', async () => {
    const f = setup()
    f.selected.document.state.dutyPositionRelations = []
    const reply = await invoke(f.dependencies, { path: '/api/orgmaster/duty-map/method-links?versionId=draft-1&methodId=readable' }).finished
    expect(reply.status).toBe(200)
    expect(reply.body.links).toHaveLength(2)
    expect(reply.body.links.map((link: any) => link.target.kind)).toEqual(['group', 'duty'])
    expect(new Set(reply.body.links.map((link: any) => link.departmentId)).size).toBe(2)
    expect(reply.body.links.every((link: any) => link.departmentName && link.groupTitle && link.title)).toBe(true)
    f.selected.document.state.dutyMap!.methodLinks.shift()
    expect((await invoke(f.dependencies, { path: '/api/orgmaster/duty-map/method-links?versionId=draft-1&methodId=readable' }).finished).body.links).toHaveLength(1)
    const updatedMap = (await invoke(f.dependencies).finished).body
    expect(updatedMap.map.methodLinks).toHaveLength(1)
    expect(updatedMap.map.methodLinks[0].id).toBe('special-link')
  })

  it.each(['stopped', 'restricted', 'unknown'])('protects unavailable method %s using the existing unreadable response', async methodId => {
    const f = setup()
    const reply = await invoke(f.dependencies, { path: `/api/orgmaster/duty-map/method-links?versionId=draft-1&methodId=${methodId}` }).finished
    expect(reply.status).toBe(404)
    expect(reply.body).toEqual({ error: 'METHOD_NOT_FOUND' })
  })

  it('rechecks a stopped company-reading snapshot when following an old link', async () => {
    const f = setup()
    const readable = method('readable')
    f.dependencies.readMethods = async () => [readable]
    expect((await invoke(f.dependencies).finished).body.methods).toHaveLength(1)
    readable.readableSnapshot = null
    expect((await invoke(f.dependencies, { path: '/api/orgmaster/duty-map/method-links?versionId=draft-1&methodId=readable' }).finished).status).toBe(404)
  })

  it('rejects forged dev headers without an identity attached by the existing enabled adapter', async () => {
    const f = setup()
    const reply = await invoke(f.dependencies, { identity: false, method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body,
      headers: { 'x-orgmaster-dev-issuer': 'urn:orgmaster:dev', 'x-orgmaster-dev-subject': 'local-admin', cookie: 'orgmaster_dev_profile=administrator' } }).finished
    expect(reply.status).toBe(401)
    expect(f.readVersion).not.toHaveBeenCalled()
    expect(f.generate).not.toHaveBeenCalled()
  })

  it.each([401, 403, 503])('keeps workspace authorization failure %s and never calls the model', async status => {
    const f = setup()
    const reply = await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }, async () => { throw { status, code: 'WORKSPACE_ACCESS_FORBIDDEN' } }).finished
    expect(reply.status).toBe(status)
    expect(f.readVersion).not.toHaveBeenCalled()
    expect(f.generate).not.toHaveBeenCalled()
    expect(reply.headers.get('Cache-Control')).toBe('no-store')
  })

  it('does not grant review to a generic reader or a department-only appointment', async () => {
    const f = setup()
    f.dependencies.canReview = undefined
    const document = publishedGovernance()
    const policy = document.publishedVersions[0].policy
    const assignment = policy.roleAssignments[0]
    mockGovernance(document)
    assignment.scope = { kind: 'department', value: f.selected.document.state.departments[0].id }
    expect((await invoke(f.dependencies).finished).body.canReview).toBe(false)
    const denied = await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished
    expect(denied.status).toBe(403)
    policy.roleAssignments = []
    expect((await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished).status).toBe(403)
    expect(f.generate).not.toHaveBeenCalled()
  })

  it('uses the exact verified Principal and active global review grant, then rechecks revocation after AI', async () => {
    const f = setup()
    f.dependencies.canReview = undefined
    const document = publishedGovernance()
    mockGovernance(document)
    expect((await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished).status).toBe(200)
    const assignment = (document.publishedVersions[0] as GovernanceAssignmentVersionV3).policy.roleAssignments[0]
    assignment.targetPrincipalId = 'another-principal'
    expect((await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished).status).toBe(403)
    assignment.targetPrincipalId = 'principal-1'
    f.generate.mockImplementation(async () => { assignment.status = 'revoked'; return { findings: [] } })
    expect((await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished).status).toBe(403)
  })

  it('analyzes procurement in each selected version without mixing department ownership', async () => {
    const f = setup()
    const current = version('current-1', 'current')
    const purchase = current.document.state.duties.find(duty => duty.title === '採購訂單與交期管理')!
    const administration = current.document.state.departments.find(department => department.name === '管理部')!
    const adminGroup = current.document.state.dutyMap!.groups.find(group => group.departmentId === administration.id)!
    current.document.state.dutyMap!.memberships.find(member => member.dutyId === purchase.id)!.groupId = adminGroup.id
    purchase.description = '現行版由管理部承接'
    f.selected.document.state.duties.find(duty => duty.id === purchase.id)!.description = '草稿轉由生產部承接'
    f.dependencies.readVersion = async (_root, id) => structuredClone(id === 'current-1' ? current : f.selected)
    const draft = await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished
    const present = await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: { ...f.body, versionId: 'current-1', expectedVersionRevision: current.version.revision, requestId: 'request-2' } }).finished
    expect(draft.body).toMatchObject({ versionId: 'draft-1', versionName: '規劃草稿', versionKind: 'draft', requestId: 'request-1' })
    expect(present.body).toMatchObject({ versionId: 'current-1', versionKind: 'current', requestId: 'request-2' })
    const [draftInput, currentInput] = f.generate.mock.calls.map(call => (call as unknown[])[0] as any)
    const departmentFor = (input: any) => {
      const membership = input.memberships.find((member: any) => member.dutyId === purchase.id)
      const group = input.groups.find((value: any) => value.id === membership.groupId)
      return input.departments.find((department: any) => department.id === group.departmentId).name
    }
    expect(departmentFor(draftInput)).toBe('生產部')
    expect(departmentFor(currentInput)).toBe('管理部')
    expect(draftInput.duties.find((duty: any) => duty.id === purchase.id).description).toBe('草稿轉由生產部承接')
    expect(currentInput.duties.find((duty: any) => duty.id === purchase.id).description).toBe('現行版由管理部承接')
    expect(f.generate).toHaveBeenCalledTimes(2)
  })

  it('returns 409 for both initial and late revision conflicts', async () => {
    const f = setup()
    const stale = await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: { ...f.body, expectedVersionRevision: 'stale' } }).finished
    expect(stale.status).toBe(409)
    expect(f.generate).not.toHaveBeenCalled()
    f.generate.mockImplementation(async () => { f.selected.version.revision = 'changed'; return { findings: [] } })
    expect((await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }).finished).status).toBe(409)
  })

  it('rechecks workspace read permission after AI instead of releasing unauthorized results', async () => {
    const f = setup()
    let allowed = true
    const authorize = async () => { if (!allowed) throw { status: 403, code: 'WORKSPACE_ACCESS_FORBIDDEN' }; return 'principal-1' }
    f.generate.mockImplementation(async () => { allowed = false; return { findings: [] } })
    const reply = await invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body }, authorize).finished
    expect(reply).toMatchObject({ status: 403, body: { error: 'WORKSPACE_ACCESS_FORBIDDEN' } })
  })

  it.each([
    { path: '/api/orgmaster/duty-map?versionId=../bad' },
    { path: '/api/orgmaster/duty-map?versionId=draft-1&versionId=current-1' },
    { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: '{invalid' },
    { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: {} },
  ])('rejects malformed input before contacting a model: %j', async input => {
    const f = setup()
    const reply = await invoke(f.dependencies, input).finished
    expect(reply.status).toBe(400)
    expect(f.generate).not.toHaveBeenCalled()
  })

  it('passes unrelated routes and returns safe sanitized errors', async () => {
    expect((await invoke({}, { path: '/api/orgmaster/duty-map-unrelated', identity: false }).finished).status).toBe(0)
    expect(mapDutyMapError(new Error('secret-provider-key'))).toEqual({ status: 503, code: 'DUTY_MAP_UNAVAILABLE' })
  })

  it('uses actual isolated workspace reads and never persists AI results or changes the draft or current version', async () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json')
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-duty-map-rd-'))
    roots.push(root)
    const draft = version()
    const current = version('current-1', 'current')
    const manifest = createWorkspaceManifest(current.version.id, timestamp)
    manifest.entries.push(draft.version)
    const data = join(root, 'data')
    await mkdir(join(data, 'orgmaster-versions'), { recursive: true })
    const stored = [
      ['orgmaster-workspace.v1.json', JSON.stringify(manifest)],
      ['orgmaster-versions/draft-1.json', JSON.stringify(draft.document)],
      ['orgmaster-versions/current-1.json', JSON.stringify(current.document)],
    ]
    for (const [file, raw] of stored) await writeFile(join(data, file), raw)
    const before = (await readdir(data, { recursive: true })).sort()
    const dependencies: DutyMapApiDependencies = { canReview: async () => true, readMethods: async () => [], review: { generate: async () => ({ findings: [] }) } }
    const graph = await invoke(dependencies, { root }).finished
    expect(graph.status).toBe(200)
    const reply = await invoke(dependencies, { root, method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: {
      versionId: 'draft-1', expectedVersionRevision: graph.body.revision, chapterCatalogVersion: graph.body.chapterCatalogVersion, requestId: 'isolated-request',
    } }).finished
    expect(reply).toMatchObject({ status: 200, body: { versionId: 'draft-1', findings: [] } })
    for (const [file, raw] of stored) expect(await readFile(join(data, file), 'utf8')).toBe(raw)
    expect((await readdir(data, { recursive: true })).sort()).toEqual(before)
  })

  it('reads and reviews an authorized archived draft without changing status, while denying missing access and nonexistent versions', async () => {
    vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'local-json')
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-duty-map-rd-'))
    roots.push(root)
    const draft = version()
    draft.version.status = 'archived'
    draft.version.archivedAt = timestamp
    const current = version('current-1', 'current')
    const manifest = createWorkspaceManifest(current.version.id, timestamp)
    manifest.entries.push(draft.version)
    const data = join(root, 'data')
    await mkdir(join(data, 'orgmaster-versions'), { recursive: true })
    const stored = [
      ['orgmaster-workspace.v1.json', JSON.stringify(manifest)],
      ['orgmaster-versions/draft-1.json', JSON.stringify(draft.document)],
      ['orgmaster-versions/current-1.json', JSON.stringify(current.document)],
    ]
    for (const [file, raw] of stored) await writeFile(join(data, file), raw)
    const generate = vi.fn(async () => ({ findings: [] }))
    const dependencies: DutyMapApiDependencies = { canReview: async () => true, readMethods: async () => [method('readable')],
      canReadMethod: async () => true, review: { generate } }
    const graph = await invoke(dependencies, { root }).finished
    expect(graph.status).toBe(200)
    const inputs = (id: string) => [
      { root, path: '/api/orgmaster/duty-map?versionId=' + id },
      { root, path: '/api/orgmaster/duty-map/method-links?versionId=' + id + '&methodId=readable' },
      { root, method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: {
        versionId: id, expectedVersionRevision: graph.body.revision, chapterCatalogVersion: graph.body.chapterCatalogVersion, requestId: 'archived-request',
      } },
    ]
    const authorize = vi.fn(async () => 'principal-1')
    for (const input of inputs('draft-1')) {
      const reply = await invoke(dependencies, input, authorize).finished
      expect(reply.status).toBe(200)
      expect(reply.body).toMatchObject({ versionId: 'draft-1', revision: graph.body.revision })
      expect(reply.headers.get('Cache-Control')).toBe('no-store')
      if (input.method === 'POST') expect(reply.body).toMatchObject({ versionKind: 'draft', versionName: draft.version.name, findings: [] })
      if (input.path.includes('method-links')) expect(reply.body.links).toHaveLength(2)
      const denied = await invoke(dependencies, input, async () => { throw { status: 403, code: 'WORKSPACE_ACCESS_FORBIDDEN' } }).finished
      expect(denied).toMatchObject({ status: 403, body: { error: 'WORKSPACE_ACCESS_FORBIDDEN' } })
    }
    for (const input of inputs('nonexistent-version')) {
      expect(await invoke(dependencies, input).finished).toMatchObject({ status: 404, body: { error: 'WORKSPACE_ENTRY_NOT_FOUND' } })
    }
    expect(generate).toHaveBeenCalledTimes(1)
    expect(authorize.mock.calls.every(call => (call as unknown[])[1] === false)).toBe(true)
    for (const [file, raw] of stored) expect(await readFile(join(data, file), 'utf8')).toBe(raw)
    const readback = JSON.parse(await readFile(join(data, 'orgmaster-workspace.v1.json'), 'utf8'))
    expect(readback.entries.find((entry: any) => entry.id === 'draft-1')).toMatchObject({ status: 'archived', archivedAt: timestamp })
  })

  it('does not bootstrap a missing workspace during an advisory read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-duty-map-rd-'))
    roots.push(root)
    const reply = await invoke({ canReview: async () => true }, { root }).finished
    expect(reply.status).toBe(503)
    expect(await readdir(root)).toEqual([])
  })

  it('propagates a disconnected response to the provider AbortSignal', async () => {
    const f = setup()
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    let providerSignal: AbortSignal | undefined
    f.dependencies.review = { generate: async (_company, signal) => {
      providerSignal = signal; started()
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    } }
    const pending = invoke(f.dependencies, { method: 'POST', path: '/api/orgmaster/duty-map/reviews', body: f.body })
    await entered
    pending.response.emit('close')
    expect((await pending.finished).status).toBe(499)
    expect(providerSignal?.aborted).toBe(true)
  })
})
