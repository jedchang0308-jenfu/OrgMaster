import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrgDocumentFile } from '../src/documentStorage'
import { DUTY_CHAPTER_CATALOG_VERSION } from '../src/dutyMap'
import { createDutyMapSeed } from '../src/dutyMapSeed'
import { ORGMASTER_BUSINESS_PERMISSIONS } from '../src/governance/aiPdmCatalog'
import { createSeedDocumentV2 } from '../src/governance/migrateGovernanceV1ToV2'
import { migrateGovernanceV2ToV3 } from '../src/governance/migrateGovernanceV2ToV3'
import type { GovernanceApplicationRoleV1, GovernanceRoleAssignmentV3, GovernanceScopeV1 } from '../src/governance/types'
import type { ManagementMethodV1 } from '../src/managementMethods/types'
import { screenshotOrganizationState } from '../src/screenshotData'
import type { WorkspaceDocumentResult } from '../src/versionWorkspace'
import * as methodStore from './managementMethodStore'
import { createOrgmasterApiMiddleware } from './orgmasterApi'
import * as governanceStore from './orgmasterGovernanceStore'
import * as persistence from './orgmasterPersistenceRepository'
import { setTrustedRequestIdentityRevalidator, setVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import type { OrgmasterSession } from './orgmasterSessionRepository'
import * as workspaceStore from './orgmasterWorkspaceStore'

// RD integration boundary: real middleware, private authorizeWorkspace callback,
// permission evaluator and projection; mocked persistence and verified identity.
// This is not PostgreSQL, provider, production or browser verification.
const sdk = vi.hoisted(() => ({ constructed: vi.fn(), create: vi.fn() }))
vi.mock('openai', () => ({ default: class {
  constructor() { sdk.constructed() }
  responses = { create: sdk.create }
} }))

const at = '2026-01-01T00:00:00.000Z'
const principalId = 'principal-whole-version-reader'
const employeeId = 'employee-whole-version-reader'
const reader: GovernanceApplicationRoleV1 = { id: 'role-workspace-reader', applicationId: 'orgmaster', code: 'workspace_reader',
  name: '版本工作區讀者', status: 'active', systemDefined: false }
const reviewer: GovernanceApplicationRoleV1 = { id: 'role-duty-reviewer', applicationId: 'orgmaster', code: 'duty_reviewer',
  name: '職掌盤點主管', status: 'active', systemDefined: false }
function appointment(id: string, role: GovernanceApplicationRoleV1, scope: GovernanceScopeV1): GovernanceRoleAssignmentV3 {
  return { id, employeeId, applicationId: 'orgmaster', roleId: role.id, roleCodeSnapshot: role.code, roleNameSnapshot: role.name,
    catalogVersion: null, scope, status: 'active', validFrom: at, validTo: null, effectState: 'orgmaster-enforced', basis: 'manual',
    subjectKind: 'principal', targetPrincipalId: principalId, sources: [], metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: 'fixture-administrator', createdReason: '明示版本閱讀與辦法閱讀資格' }
}
function sharedMethod(): ManagementMethodV1 {
  const body = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [] }] }
  const bodyHash = methodStore.bodyHash(body)
  return { id: 'method-shared', code: 'MP-0001', title: '委外品質交接辦法', ownerEmployeeId: employeeId,
    creationRequestId: 'fixture-create', creationInputHash: 'fixture-hash', methodRevision: 'method-r1',
    workingDraft: { bodyFormat: 'editor-json-v1', body, bodyHash, revision: 'draft-r1', mediaIds: [], updatedByPrincipalId: 'fixture-administrator', updatedAt: at },
    readableSnapshot: { title: '委外品質交接辦法', ownerEmployeeId: employeeId, bodyFormat: 'editor-json-v1', body, bodyHash,
      sourceDraftRevision: 'draft-r1', mediaIds: [], providedByPrincipalId: 'fixture-administrator', providedAt: at },
    generationMeta: { provider: 'openai', model: 'unused-fixture', promptVersion: 'management-method-draft-v1', providerRequestId: null,
      durationMs: 0, inputTokens: null, outputTokens: null, generatedAt: at },
    createdByPrincipalId: 'fixture-administrator', updatedByPrincipalId: 'fixture-administrator', createdAt: at, updatedAt: at }
}
function setup(reviewScope: 'none' | 'department') {
  vi.stubEnv('ORGMASTER_PERSISTENCE_MODE', 'cloud-sql')
  vi.stubEnv('OPENAI_API_KEY', 'unused-isolated-model-key')
  vi.stubEnv('ORGMASTER_DUTY_MAP_MODEL', 'unused-isolated-model')
  sdk.create.mockResolvedValue({ status: 'completed', output_text: '{"findings":[]}' })
  let sequence = 0
  const state = createDutyMapSeed({ ...structuredClone(screenshotOrganizationState), departments: [], duties: [], dutyMap: undefined,
    employees: [], positions: [], members: [], assignments: [], dutyPositionRelations: [], processes: [], processNodes: [], processEdges: [], processNodeDutyLinks: [],
  }, () => `node-${++sequence}`)
  const production = state.departments.find(value => value.name === '生產部')!
  const targets = ['委外加工與外部服務交付管理', '進料與委外品質驗收'].map(title => state.duties.find(value => value.title === title)!)
  state.dutyMap!.methodLinks = targets.map((duty, index) => ({ id: `method-link-${index}`, methodId: 'method-shared', target: { kind: 'duty', id: duty.id } }))
  const version: WorkspaceDocumentResult = { document: createOrgDocumentFile(state, 'draft', at), version: {
    id: 'draft-1', name: '完整版本讀取', kind: 'draft', status: 'active', revision: 'version-r1', basedOnVersionId: null,
    createdAt: at, archivedAt: null, updatedAt: at, loadStatus: 'ready',
  } }
  const document = migrateGovernanceV2ToV3(createSeedDocumentV2(at), 'fixture')
  const policy = structuredClone(document.draft)
  policy.applicationRoles.push(reader, reviewer)
  policy.permissions.push({ ...ORGMASTER_BUSINESS_PERMISSIONS[0] })
  policy.rolePermissionGrants.push(
    { id: 'read-shared-method', roleId: reader.id, permissionId: 'permission-orgmaster-management-method-read-readable', effect: 'allow' },
    { id: 'review-permission', roleId: reviewer.id, permissionId: ORGMASTER_BUSINESS_PERMISSIONS[0].id, effect: 'allow' },
  )
  const globalReader = appointment('global-reader', reader, { kind: 'global' })
  policy.roleAssignments.push(globalReader)
  if (reviewScope === 'department') policy.roleAssignments.push(appointment('department-reviewer', reviewer, { kind: 'department', value: production.id }))
  document.activePolicyVersionId = 'published'
  document.publishedVersions.push({ id: 'published', kind: 'assignment-governance-v3', versionNumber: 1, publishedAt: at,
    publishedByPrincipalId: 'fixture-administrator', publishReason: '明示閱讀與限定部門 review 任用', snapshotHash: 'fixture-hash', policy,
    externalRoleCatalogs: [], effectState: 'not-synchronized', organizationSnapshot: { workspaceVersionId: 'current', workspaceRevision: 'current-r1',
      capturedAt: at, employees: [], departments: [], organizationRoles: [], positions: [], assignments: [] } })
  vi.spyOn(governanceStore, 'readStoredGovernanceDocument').mockImplementation(async () => ({ document: structuredClone(document), raw: JSON.stringify(document),
    revision: 'governance-r1', payload: structuredClone(document) as unknown as Record<string, unknown>, artifactKey: 'orgmaster-governance.v3.json', artifactKind: 'governance', sourceRevision: 'source-r1' }))
  vi.spyOn(governanceStore, 'readGovernanceStore').mockImplementation(async () => ({ document: structuredClone(document), raw: JSON.stringify(document), revision: 'governance-r1' }))
  const exists = vi.spyOn(persistence, 'persistenceArtifactExists').mockResolvedValue(true)
  const readVersion = vi.spyOn(workspaceStore, 'getWorkspaceVersion').mockImplementation(async () => structuredClone(version))
  const method = sharedMethod()
  const store = { app: 'OrgMasterManagementMethods' as const, schemaVersion: 1 as const, nextMethodNumber: 2, methods: [method], mediaAssets: [], commandReceipts: [] }
  const readMethods = vi.spyOn(methodStore, 'readManagementMethodStore').mockResolvedValue({ store, raw: JSON.stringify(store), revision: 'methods-r1' })
  const session: OrgmasterSession = { id: '00000000-0000-4000-8000-000000000071', principalId, employeeId,
    identityIssuer: 'https://verified.fixture.invalid', identitySubject: 'same-native-subject', authEpoch: 0, principalAuthEpoch: 0,
    sessionSchemaVersion: 2, epochKind: 'principal', issuedAt: at, authenticatedAt: at,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null, assuranceLevel: 'aal1' }
  const middleware = createOrgmasterApiMiddleware(process.cwd())
  const revalidate = vi.fn(async () => ({ ...session }))
  const dispatch = (method: string, path: string, body?: unknown) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as IncomingMessage
    request.method = method; request.url = path; request.headers = { 'content-type': 'application/json' }
    setVerifiedRequestIdentity(request, { ...session })
    setTrustedRequestIdentityRevalidator(request, revalidate)
    const headers = new Map<string, string>()
    const response = new EventEmitter() as ServerResponse
    let finish!: (value: { status: number; headers: Map<string, string>; body: any }) => void
    const result = new Promise<{ status: number; headers: Map<string, string>; body: any }>(resolve => { finish = resolve })
    response.setHeader = ((name: string, value: string) => { headers.set(name, value); return response }) as ServerResponse['setHeader']
    response.end = ((raw: string) => { finish({ status: response.statusCode, headers, body: JSON.parse(raw) }); return response }) as ServerResponse['end']
    middleware(request, response, () => { throw new Error('Unexpected middleware continuation') })
    return result
  }
  return { dispatch, globalReader, policy, version, readVersion, readMethods, exists }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); sdk.constructed.mockClear(); sdk.create.mockReset() })

describe('DEV-071 A05/A14 whole-version workspace authorization integration (mocked persistence, not PostgreSQL)', () => {
  it.each(['none', 'department'] as const)('reads the entire version and two method departments but denies AI with %s review scope; withdrawing the global reader rejects all routes before version reads', async reviewScope => {
    const f = setup(reviewScope)
    const before = JSON.stringify(f.version)
    const mapPath = '/api/orgmaster/duty-map?versionId=draft-1'
    const reversePath = '/api/orgmaster/duty-map/method-links?versionId=draft-1&methodId=method-shared'
    const reviewPath = '/api/orgmaster/duty-map/reviews'
    const reviewBody = { versionId: 'draft-1', expectedVersionRevision: 'version-r1', chapterCatalogVersion: DUTY_CHAPTER_CATALOG_VERSION, requestId: 'review-request' }
    const map = await f.dispatch('GET', mapPath)
    expect(map.status).toBe(200)
    expect(map.body.departments).toHaveLength(6)
    expect(map.body.map.groups).toHaveLength(33)
    expect(map.body.duties).toHaveLength(116)
    expect(map.body.canReview).toBe(false)
    expect(map.body.map.methodLinks).toHaveLength(2)
    const reverse = await f.dispatch('GET', reversePath)
    expect(reverse.status).toBe(200)
    expect(reverse.body.links).toHaveLength(2)
    expect(reverse.body.links.map((link: any) => link.departmentName).sort()).toEqual(['生產部', '研發部'].sort())
    expect(reverse.body.links.map((link: any) => link.title).sort()).toEqual(['委外加工與外部服務交付管理', '進料與委外品質驗收'].sort())
    expect(reverse.body.links.every((link: any) => link.target.kind === 'duty')).toBe(true)
    expect(f.version.document.state.dutyPositionRelations).toEqual([])
    expect(await f.dispatch('POST', reviewPath, reviewBody)).toMatchObject({ status: 403, body: { error: 'DUTY_MAP_REVIEW_FORBIDDEN' } })
    expect(sdk.constructed).not.toHaveBeenCalled()
    expect(sdk.create).not.toHaveBeenCalled()
    expect(JSON.stringify(f.version)).toBe(before)
    f.globalReader.status = 'revoked'
    expect(f.policy.roleAssignments.filter(value => value.status === 'active' && value.scope.kind === 'global')).toHaveLength(0)
    f.readVersion.mockClear(); f.readMethods.mockClear(); f.exists.mockClear()
    for (const [method, path, body] of [['GET', mapPath, undefined], ['GET', reversePath, undefined], ['POST', reviewPath, reviewBody]] as const) {
      const response = await f.dispatch(method, path, body)
      expect(response).toMatchObject({ status: 403, body: { error: 'WORKSPACE_ACCESS_FORBIDDEN' } })
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    expect(f.readVersion).not.toHaveBeenCalled()
    expect(f.readMethods).not.toHaveBeenCalled()
    expect(f.exists).not.toHaveBeenCalled()
    expect(sdk.constructed).not.toHaveBeenCalled()
    expect(sdk.create).not.toHaveBeenCalled()
    expect(JSON.stringify(f.version)).toBe(before)
  })
})
