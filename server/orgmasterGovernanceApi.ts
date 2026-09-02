import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { applyDraftCommand, publishGovernance, readGovernanceAudit, readGovernanceStore, setActivePolicy, validateAssignmentCandidate, GovernanceStoreError } from './orgmasterGovernanceStore'
import { resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { evaluatePermission } from '../src/governance/evaluatePermission'
import { GovernanceValidationError } from '../src/governance/validation'
import { ensureCommandShape } from '../src/governance/commands'
import type { GovernanceActorContext, GovernanceCommandV2 } from '../src/governance/types'
import { createHash } from 'node:crypto'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { verifiedGovernanceActor } from './orgmasterRequestIdentity'
import {
  AiPdmRoleCapabilityStoreError,
  previewAiPdmRoleCapabilityChange,
  publishAiPdmRoleCapabilityChange,
  readAiPdmRoleCapabilityChangeFeed,
  readAiPdmRoleCapabilityProjection,
  readAiPdmRoleCapabilityWorkspace,
  readAiPdmRoleCapabilityReceipt,
  resolveAiPdmRoleCapabilityUnknown,
  type AiPdmRoleCapabilityMutation,
} from './aiPdmRoleCapabilityStore'

export const API_PATH = '/api/orgmaster/governance'
const MAX_BODY = 1024 * 1024
const V2_COMMANDS = ['UPSERT_IDENTITY_LINK', 'SET_IDENTITY_LINK_STATUS', 'UPSERT_APPLICATION_ROLE', 'SET_APPLICATION_ROLE_STATUS', 'UPSERT_PERMISSION', 'SET_PERMISSION_STATUS', 'SET_ROLE_PERMISSION_GRANT', 'REMOVE_ROLE_PERMISSION_GRANT', 'UPSERT_ROLE_ASSIGNMENT', 'REVOKE_ROLE_ASSIGNMENT', 'UPSERT_ROLE_DELEGATION', 'REVOKE_ROLE_DELEGATION'] as const
const LEGACY_EXTERNAL_COMMANDS = ['UPSERT_DELEGATION', 'REVOKE_DELEGATION', 'UPSERT_APPROVAL_POLICY', 'SET_APPROVAL_POLICY_STATUS']
function sendJson(response: ServerResponse, status: number, payload: unknown, revision?: string) { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); if (revision) response.setHeader('X-OrgMaster-Governance-Revision', revision); response.end(JSON.stringify(payload)) }
function readBody(request: IncomingMessage) { return new Promise<string>((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; request.on('data', (chunk: Buffer | string) => { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_BODY) { reject(new GovernanceStoreError('PAYLOAD_TOO_LARGE')); request.destroy(); return } chunks.push(buffer) }); request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); request.on('error', reject) }) }
async function parseBody(request: IncomingMessage) { const contentType = String(request.headers['content-type'] ?? '').toLowerCase(); if (!contentType.startsWith('application/json')) throw new GovernanceStoreError('INVALID_JSON'); const raw = await readBody(request); if (!raw) throw new GovernanceStoreError('INVALID_JSON'); try { return JSON.parse(raw) as Record<string, unknown> } catch { throw new GovernanceStoreError('INVALID_JSON') } }
function sanitizeIdentity(link: any) { const { subject: _subject, ...rest } = link; return { ...rest, subjectHint: typeof link.subject === 'string' && link.subject.length > 4 ? `••••${link.subject.slice(-4)}` : '••••', subjectFingerprint: createHash('sha256').update(`${link.issuer}\0${link.subject}`).digest('hex').slice(0, 12) } }
function sanitizedDocument(document: any) { return { ...document, draft: { ...document.draft, identityLinks: document.draft.identityLinks.map(sanitizeIdentity) }, publishedVersions: document.publishedVersions.map((version: any) => ({ ...version, policy: { ...version.policy, identityLinks: version.policy.identityLinks.map(sanitizeIdentity) } })) } }
export function governanceErrorStatus(code: string) { if (code === 'IDENTITY_CONTEXT_REQUIRED') return 401; if (code === 'IDENTITY_PROVIDER_NOT_CONFIGURED' || code === 'EXTERNAL_CATALOG_UNAVAILABLE' || code === 'ROLE_CAPABILITY_READ_FAILED' || code === 'ORGMASTER_SOURCE_UNAVAILABLE') return 503; if (code === 'GOVERNANCE_ADMIN_REQUIRED' || code === 'GOVERNANCE_PUBLISH_REQUIRED' || code === 'ROLE_POSITION_ADOPTION_FORBIDDEN') return 403; if (code === 'POLICY_VERSION_NOT_FOUND' || code === 'ROLE_NOT_FOUND') return 404; if (code === 'PAYLOAD_TOO_LARGE') return 413; if (['REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'COMMAND_STILL_PROCESSING', 'COMMAND_PROCESSING_LEASE_EXPIRED', 'COMMAND_NOT_OBSERVED', 'REQUEST_HASH_MISMATCH', 'CATALOG_VERSION_CONFLICT', 'CATALOG_PAYLOAD_HASH_MISMATCH', 'ORGANIZATION_VERSION_INVALID', 'EXTERNAL_CATALOG_READ_ONLY', 'EXTERNAL_CATALOG_VERSION_CONFLICT', 'EXTERNAL_CATALOG_STALE', 'LEGACY_MIGRATION_UNRESOLVED', 'LEGACY_POLICY_REACTIVATION_FORBIDDEN'].includes(code)) return 409; if (['GOVERNANCE_VALIDATION_FAILED', 'EXTERNAL_CATALOG_INVALID', 'EXTERNAL_ROLE_UNKNOWN', 'EXTERNAL_ROLE_INACTIVE', 'EXTERNAL_ROLE_UNASSIGNABLE', 'EXTERNAL_SCOPE_UNSUPPORTED', 'ROLE_DELEGATION_INVALID', 'PUBLISHER_NOT_LINKED', 'GOVERNANCE_ADMIN_CONTINUITY_REQUIRED', 'POSITION_NOT_FOUND', 'EMPLOYEE_NOT_FOUND', 'POSITION_NOT_ADOPTED'].includes(code)) return 422; if (['INVALID_JSON', 'INVALID_COMMAND'].includes(code)) return 400; if (code === 'LEGACY_GOVERNANCE_EVALUATOR_RETIRED' || code === 'CHANGE_CURSOR_EXPIRED') return 410; return 500 }
function errorResponse(response: ServerResponse, error: unknown) { const code = error instanceof GovernanceStoreError ? error.code : error instanceof AiPdmRoleCapabilityStoreError ? error.code : error instanceof GovernanceValidationError ? 'GOVERNANCE_VALIDATION_FAILED' : 'GOVERNANCE_READ_FAILED'; sendJson(response, governanceErrorStatus(code), { error: code, ...(error instanceof GovernanceValidationError ? { issues: error.issues } : {}) }) }
function actorOrThrow(request: IncomingMessage, enabled: boolean) { const actor = verifiedGovernanceActor(request) ?? resolveDevelopmentIdentity(request, enabled); if (!actor) throw new GovernanceStoreError(enabled ? 'IDENTITY_CONTEXT_REQUIRED' : 'IDENTITY_PROVIDER_NOT_CONFIGURED'); return actor }
function aiPdmActorOrThrow(request: IncomingMessage, enabled: boolean) { const actor = resolveDevelopmentIdentity(request, enabled) ?? verifiedGovernanceActor(request); if (!actor) throw new GovernanceStoreError(enabled ? 'IDENTITY_CONTEXT_REQUIRED' : 'IDENTITY_PROVIDER_NOT_CONFIGURED'); return actor }
function canManage(document: any, actor: GovernanceActorContext) { if (actor.bootstrap && !document.activePolicyVersionId) return true; return evaluatePermission(document, { applicationId: 'orgmaster', issuer: actor.issuer, subject: actor.subject, permissionCode: 'orgmaster.governance.manage', scope: { kind: 'global' } }).status === 'allowed' }
function canPermission(document: any, actor: GovernanceActorContext, permissionCode: string) { if (actor.bootstrap && !document.activePolicyVersionId) return true; return evaluatePermission(document, { applicationId: 'orgmaster', issuer: actor.issuer, subject: actor.subject, permissionCode, scope: { kind: 'global' } }).status === 'allowed' }
function canManageAiPdmRoleCapability(document: any, actor: GovernanceActorContext) { return actor.bootstrap || canPermission(document, actor, 'orgmaster.governance.manage') }
function aiPdmRoleCapabilityPath(path: string) {
  const match = path.match(/^\/applications\/ai-pdm\/role-capabilities\/([^/]+)(?:\/(preview|publish))?$/)
  return match ? { stableRoleId: decodeURIComponent(match[1]), action: match[2] as 'preview' | 'publish' | undefined } : null
}
function aiPdmCommandPath(path: string) {
  const match = path.match(/^\/applications\/ai-pdm\/commands\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}
function aiPdmResolveCommandPath(path: string) {
  const match = path.match(/^\/applications\/ai-pdm\/commands\/([^/]+)\/resolve-unknown$/)
  return match ? decodeURIComponent(match[1]) : null
}
function aiPdmMutation(body: Record<string, unknown>, stableRoleId: string, action: 'preview' | 'publish'): AiPdmRoleCapabilityMutation {
  const operation = String(body.operation ?? '')
  if (operation !== 'set_position_adoptions' && operation !== 'set_assignment_sources') throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
  const mutation: AiPdmRoleCapabilityMutation = {
    stableRoleId,
    operation,
    baseProjectionCursor: Number(body.baseProjectionCursor ?? body.changeCursor),
    commandId: String(body.commandId ?? (action === 'preview' ? 'preview' : '')),
    reason: String(body.reason ?? ''),
    expectedCatalogVersion: String(body.expectedCatalogVersion ?? ''),
    expectedCatalogPayloadHash: String(body.expectedCatalogPayloadHash ?? ''),
    expectedGovernanceRevision: String(body.expectedGovernanceRevision ?? ''),
    expectedOrganizationRevision: String(body.expectedOrganizationRevision ?? ''),
    requestHash: body.requestHash === undefined ? undefined : String(body.requestHash),
  }
  if (operation === 'set_position_adoptions') {
    if (!Array.isArray(body.adoptedPositionIds)) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    mutation.adoptedPositionIds = body.adoptedPositionIds.map((value) => String(value))
  } else {
    if (!Array.isArray(body.changes)) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    mutation.changes = body.changes.map((value) => {
      if (!value || typeof value !== 'object') throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
      const item = value as Record<string, unknown>
      return { employeeId: String(item.employeeId ?? ''), positionId: String(item.positionId ?? ''), selected: item.selected === true }
    })
  }
  if (!mutation.expectedCatalogVersion || !mutation.expectedCatalogPayloadHash || !mutation.expectedGovernanceRevision || !mutation.expectedOrganizationRevision) throw new AiPdmRoleCapabilityStoreError('REVISION_CONFLICT')
  if (action === 'publish' && !mutation.commandId.trim()) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
  return mutation
}
async function handle(request: IncomingMessage, response: ServerResponse, root: string, devEnabled: boolean) {
  const url = new URL(request.url ?? '/', 'http://orgmaster.local'); const path = url.pathname.slice(API_PATH.length) || '/'; const actor = path.startsWith('/applications/ai-pdm/') ? aiPdmActorOrThrow(request, devEnabled) : actorOrThrow(request, devEnabled); const current = await readGovernanceStore(root); const document = current.document
  if (path === '/session' && request.method === 'GET') { sendJson(response, 200, { runtimeMode: actor.bootstrap ? 'local-development' : 'verified-session', actor: { principalId: actor.principalId, subjectHint: '••••' }, capabilities: { manage: canManage(document, actor), publish: canPermission(document, actor, 'orgmaster.governance.publish'), simulate: canPermission(document, actor, 'orgmaster.governance.simulate') } }, current.revision); return }
  if (path === '/' && request.method === 'GET') { sendJson(response, 200, { document: sanitizedDocument(document), catalogs: [readAiPdmRoleCatalog()], revision: current.revision, activeVersionId: document.activePolicyVersionId, versions: document.publishedVersions.map((version: any) => ({ id: version.id, kind: version.kind ?? 'legacy-policy-v1', versionNumber: version.versionNumber, publishedAt: version.publishedAt, publishedByPrincipalId: version.publishedByPrincipalId, publishReason: version.publishReason, snapshotHash: version.snapshotHash, organizationVersionId: version.organizationSnapshot.workspaceVersionId, effectState: version.effectState ?? 'legacy' })) }, current.revision); return }
  if (path.startsWith('/versions/') && request.method === 'GET') { const id = decodeURIComponent(path.slice('/versions/'.length)); const version = document.publishedVersions.find((entry: any) => entry.id === id); if (!version) throw new GovernanceStoreError('POLICY_VERSION_NOT_FOUND'); sendJson(response, 200, { version: sanitizedDocument({ ...document, draft: document.draft, publishedVersions: [version] }).publishedVersions[0] }, current.revision); return }
  if (path === '/audit' && request.method === 'GET') { const audit = await readGovernanceAudit(root, Number(url.searchParams.get('limit') ?? 50), Number(url.searchParams.get('cursor') ?? 0)); sendJson(response, 200, audit, current.revision); return }
  if (path === '/applications/ai-pdm/role-capabilities' && request.method === 'GET') {
    const workspace = await readAiPdmRoleCapabilityWorkspace(root)
    sendJson(response, 200, workspace, workspace.governanceRevision)
    return
  }
  const receiptCommandId = aiPdmCommandPath(path)
  if (receiptCommandId && request.method === 'GET') { const receipt = await readAiPdmRoleCapabilityReceipt(root, receiptCommandId); sendJson(response, 200, receipt, current.revision); return }
  const resolveCommandId = aiPdmResolveCommandPath(path)
  if (resolveCommandId && request.method === 'POST') {
    if (!canManageAiPdmRoleCapability(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
    const body = await parseBody(request)
    const action = body.action === 'cancel_if_absent_or_expired' ? body.action : null
    if (!action || typeof body.requestHash !== 'string' || !body.requestHash.trim()) throw new AiPdmRoleCapabilityStoreError('INVALID_COMMAND')
    const receipt = await resolveAiPdmRoleCapabilityUnknown(root, resolveCommandId, body.requestHash, action)
    sendJson(response, 200, receipt, current.revision); return
  }
  const roleCapabilityPath = aiPdmRoleCapabilityPath(path)
  if (roleCapabilityPath && roleCapabilityPath.action === undefined && request.method === 'GET') {
    const projection = await readAiPdmRoleCapabilityProjection(root, roleCapabilityPath.stableRoleId)
    sendJson(response, 200, projection, current.revision)
    return
  }
  if (roleCapabilityPath && roleCapabilityPath.action && request.method === 'POST') {
    if (!canManageAiPdmRoleCapability(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
    const body = await parseBody(request)
    const mutation = aiPdmMutation(body, roleCapabilityPath.stableRoleId, roleCapabilityPath.action)
    if (roleCapabilityPath.action === 'preview') {
      const preview = await previewAiPdmRoleCapabilityChange(root, mutation)
      sendJson(response, 200, { ...preview, authorizationEffect: 'not_committed' }, current.revision)
      return
    }
    const published = await publishAiPdmRoleCapabilityChange(root, mutation)
    sendJson(response, 200, { ...published, authorizationEffect: 'committed', sessionRefresh: 'pending' }, current.revision)
    return
  }
  if (path === '/applications/ai-pdm/change-feed' && request.method === 'GET') {
    const after = Math.max(0, Number(url.searchParams.get('after') ?? 0))
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 100)))
    const feed = await readAiPdmRoleCapabilityChangeFeed(root, Number.isFinite(after) ? after : 0, Number.isFinite(limit) ? limit : 100)
    sendJson(response, 200, feed, current.revision)
    return
  }
  if (path === '/draft' && request.method === 'PATCH') { const body = await parseBody(request); if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? ''); if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT'); const candidate = body.command as any; if (!ensureCommandShape(candidate)) throw new GovernanceStoreError('INVALID_JSON'); if (LEGACY_EXTERNAL_COMMANDS.includes(String(candidate.type))) throw new GovernanceStoreError('EXTERNAL_CATALOG_READ_ONLY'); if (!(V2_COMMANDS as readonly string[]).includes(String(candidate.type))) throw new GovernanceStoreError('INVALID_JSON'); const result = await applyDraftCommand(root, current.revision, candidate as GovernanceCommandV2, actor); sendJson(response, 200, { status: result.status, document: sanitizedDocument(result.document), revision: result.revision }, result.revision); return }
  if (path === '/validate/assignment' && request.method === 'POST') { const body = await parseBody(request); if (!canPermission(document, actor, 'orgmaster.governance.simulate')) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const result = await validateAssignmentCandidate(root, body as any); sendJson(response, 200, result, current.revision); return }
  if (path === '/versions' && request.method === 'POST') { const body = await parseBody(request); if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? ''); if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT'); const result = await publishGovernance(root, current.revision, String(body.commandId ?? ''), String(body.reason ?? ''), String(body.organizationVersionId ?? ''), actor); const version: any = result.document.publishedVersions.at(-1); sendJson(response, 201, { versionSummary: { id: version.id, kind: version.kind, versionNumber: version.versionNumber, publishedAt: version.publishedAt, snapshotHash: version.snapshotHash, organizationVersionId: version.organizationSnapshot.workspaceVersionId, effectState: version.effectState }, revision: result.revision }, result.revision); return }
  if (path === '/active-version' && request.method === 'POST') { const body = await parseBody(request); if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? ''); if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT'); const result = await setActivePolicy(root, current.revision, String(body.commandId ?? ''), String(body.reason ?? ''), body.versionId === null ? null : String(body.versionId ?? ''), actor); sendJson(response, 200, { activePolicyVersionId: result.document.activePolicyVersionId, revision: result.revision }, result.revision); return }
  if ((path === '/evaluate/permission' || path === '/evaluate/reviewers') && request.method === 'POST') { sendJson(response, 410, { error: 'LEGACY_GOVERNANCE_EVALUATOR_RETIRED' }); return }
  sendJson(response, 404, { error: 'ROUTE_NOT_FOUND' })
}
function middleware(root: string, devEnabled: boolean) { return (request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) => { if (!request.url?.startsWith(API_PATH)) return next(); void handle(request, response, root, devEnabled).catch((error) => errorResponse(response, error)) } }
export function createOrgmasterGovernanceMiddleware(root = process.cwd(), devEnabled = false): Connect.NextHandleFunction { return middleware(root, devEnabled) }
export function orgmasterGovernanceApiPlugin(): Plugin { return { name: 'orgmaster-local-governance-api', configureServer(server: ViteDevServer) { server.middlewares.use(middleware(server.config.root, server.config.command === 'serve' && server.config.mode === 'development')) }, configurePreviewServer(server: PreviewServer) { server.middlewares.use(middleware(process.cwd(), false)) } } }
