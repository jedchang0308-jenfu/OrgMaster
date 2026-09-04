import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { applyDraftCommand, publishGovernance, readGovernanceAudit, readGovernanceStore, setActivePolicy, validateAssignmentCandidate, GovernanceStoreError } from './orgmasterGovernanceStore'
import { developmentPermissionForActor, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { evaluatePermission } from '../src/governance/evaluatePermission'
import { GovernanceValidationError } from '../src/governance/validation'
import { ensureCommandShape } from '../src/governance/commands'
import type { GovernanceActorContext, GovernanceCommandV2, GovernanceDocumentV3, GovernanceIdentityLinkV1 } from '../src/governance/types'
import { createHash, randomUUID } from 'node:crypto'
import { readAiPdmRoleCatalog } from '../src/governance/aiPdmCatalog'
import { readVerifiedRequestIdentity, verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { PrivilegedAssignmentError, type PrivilegedAssignmentRequest } from '../src/governance/privilegedAssignments'
import { previewPrivilegedAssignment, publishPrivilegedAssignment, readPrivilegedAssignmentReceipt, readPrivilegedAssignmentWorkspace } from './privilegedAssignmentStore'
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
import { ApplicationEntitlementError, type FinancialManagementGrantInput, type FinancialRoleAssignmentInput, type FinancialRoleAssignmentPublishInput, type FinancialManagementGrantPublishInput } from './applicationEntitlementCommon'
import { previewFinancialRoleAssignment, publishFinancialRoleAssignment, readFinancialRoleAssignmentReceipt, readFinancialRoleAssignmentWorkspace } from './applicationRoleAssignmentStore'
import { previewFinancialManagementGrant, publishFinancialManagementGrant, readFinancialManagementGrantReceipt, readFinancialManagementGrantWorkspace } from './applicationManagementGrantStore'
import { resolveIdentityLinkUpsert, assertIdentityLinkStatusMutationAllowed as assertIdentityLinkStatusMutationAllowedPolicy } from './orgmasterIdentityLinkPolicy'

export const API_PATH = '/api/orgmaster/governance'
const MAX_BODY = 1024 * 1024
const V2_COMMANDS = ['UPSERT_IDENTITY_LINK', 'SET_IDENTITY_LINK_STATUS', 'UPSERT_APPLICATION_ROLE', 'SET_APPLICATION_ROLE_STATUS', 'UPSERT_PERMISSION', 'SET_PERMISSION_STATUS', 'SET_ROLE_PERMISSION_GRANT', 'REMOVE_ROLE_PERMISSION_GRANT', 'UPSERT_ROLE_ASSIGNMENT', 'REVOKE_ROLE_ASSIGNMENT', 'UPSERT_ROLE_DELEGATION', 'REVOKE_ROLE_DELEGATION'] as const
const LEGACY_EXTERNAL_COMMANDS = ['UPSERT_DELEGATION', 'REVOKE_DELEGATION', 'UPSERT_APPROVAL_POLICY', 'SET_APPROVAL_POLICY_STATUS']
function sendJson(response: ServerResponse, status: number, payload: unknown, revision?: string) { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); if (revision) response.setHeader('X-OrgMaster-Governance-Revision', revision); response.end(JSON.stringify(payload)) }
function readBody(request: IncomingMessage) { return new Promise<string>((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; request.on('data', (chunk: Buffer | string) => { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_BODY) { reject(new GovernanceStoreError('PAYLOAD_TOO_LARGE')); request.destroy(); return } chunks.push(buffer) }); request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); request.on('error', reject) }) }
async function parseBody(request: IncomingMessage) { const contentType = String(request.headers['content-type'] ?? '').toLowerCase(); if (!contentType.startsWith('application/json')) throw new GovernanceStoreError('INVALID_JSON'); const raw = await readBody(request); if (!raw) throw new GovernanceStoreError('INVALID_JSON'); try { return JSON.parse(raw) as Record<string, unknown> } catch { throw new GovernanceStoreError('INVALID_JSON') } }
function sanitizeIdentity(link: any) { const { subject: _subject, ...rest } = link; return { ...rest, subjectHint: typeof link.subject === 'string' && link.subject.length > 4 ? `••••${link.subject.slice(-4)}` : '••••', subjectFingerprint: createHash('sha256').update(`${link.issuer}\0${link.subject}`).digest('hex').slice(0, 12) } }
function sanitizedDocument(document: any) { return { ...document, draft: { ...document.draft, identityLinks: document.draft.identityLinks.map(sanitizeIdentity) }, publishedVersions: document.publishedVersions.map((version: any) => ({ ...version, policy: { ...version.policy, identityLinks: version.policy.identityLinks.map(sanitizeIdentity) } })) } }
export function governanceErrorStatus(code: string) { if (code === 'IDENTITY_CONTEXT_REQUIRED' || code === 'IDENTITY_REQUIRED') return 401; if (code === 'IDENTITY_PROVIDER_NOT_CONFIGURED' || code === 'EXTERNAL_CATALOG_UNAVAILABLE' || code === 'ROLE_CAPABILITY_READ_FAILED' || code === 'ORGMASTER_SOURCE_UNAVAILABLE' || code === 'SECURITY_ALERT_PERSIST_FAILED' || code === 'FINANCIAL_CATALOG_UNAVAILABLE' || code === 'CATALOG_REGISTRY_UNAVAILABLE') return 503; if (['GOVERNANCE_ADMIN_REQUIRED', 'GOVERNANCE_PUBLISH_REQUIRED', 'ROLE_POSITION_ADOPTION_FORBIDDEN', 'PRIVILEGED_OVERRIDE_REQUIRED', 'PRIVILEGED_VIEW_REQUIRED', 'PRIVILEGED_MUTATION_REQUIRED', 'PRIVILEGED_SELF_ASSIGNMENT_DENIED', 'STEP_UP_REQUIRED', 'APP_MANAGEMENT_GRANT_REQUIRED', 'APP_PUBLISH_GRANT_REQUIRED', 'PRIVILEGED_ADMIN_REQUIRED'].includes(code)) return 403; if (['POLICY_VERSION_NOT_FOUND', 'ROLE_NOT_FOUND', 'PRIVILEGED_ASSIGNMENT_NOT_FOUND', 'EMPLOYEE_NOT_FOUND', 'PRINCIPAL_NOT_FOUND', 'COMMAND_NOT_FOUND', 'ASSIGNMENT_NOT_FOUND', 'IDENTITY_LINK_NOT_FOUND'].includes(code)) return 404; if (code === 'PAYLOAD_TOO_LARGE') return 413; if (['REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'COMMAND_STILL_PROCESSING', 'COMMAND_PROCESSING_LEASE_EXPIRED', 'COMMAND_NOT_OBSERVED', 'COMMAND_ALREADY_TERMINAL', 'REQUEST_HASH_MISMATCH', 'PREVIEW_HASH_MISMATCH', 'CATALOG_VERSION_CONFLICT', 'CATALOG_PAYLOAD_HASH_MISMATCH', 'ORGANIZATION_VERSION_INVALID', 'EXTERNAL_CATALOG_READ_ONLY', 'EXTERNAL_CATALOG_VERSION_CONFLICT', 'EXTERNAL_CATALOG_STALE', 'LEGACY_MIGRATION_UNRESOLVED', 'LEGACY_POLICY_REACTIVATION_FORBIDDEN', 'GOVERNANCE_V3_MIGRATION_REQUIRED', 'GOVERNANCE_REVISION_CONFLICT', 'ORGANIZATION_REVISION_CONFLICT', 'CATALOG_BINDING_CONFLICT', 'PREVIEW_HASH_CONFLICT', 'REQUEST_HASH_CONFLICT', 'COMMAND_ID_CONFLICT', 'IDENTITY_LINK_CONFLICT', 'IDENTITY_ACCOUNT_FLOW_REQUIRED'].includes(code)) return 409; if (['GOVERNANCE_VALIDATION_FAILED', 'EXTERNAL_CATALOG_INVALID', 'EXTERNAL_ROLE_UNKNOWN', 'EXTERNAL_ROLE_INACTIVE', 'EXTERNAL_ROLE_UNASSIGNABLE', 'EXTERNAL_SCOPE_UNSUPPORTED', 'ROLE_DELEGATION_INVALID', 'PUBLISHER_NOT_LINKED', 'GOVERNANCE_ADMIN_CONTINUITY_REQUIRED', 'POSITION_NOT_FOUND', 'POSITION_NOT_ADOPTED', 'PRIVILEGED_PRINCIPAL_REQUIRED', 'CATALOG_ROLE_CONTRACT_MISMATCH', 'UNSUPPORTED_SUBJECT', 'UNSUPPORTED_SCOPE', 'INVALID_VALIDITY', 'CATALOG_INCOMPATIBLE', 'SELF_GRANT_FORBIDDEN', 'GOVERNANCE_CONTINUITY_REQUIRED', 'DUPLICATE_ACTIVE_ASSIGNMENT', 'EMPLOYEE_NOT_ACTIVE', 'SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN', 'IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN'].includes(code)) return 422; if (['INVALID_JSON', 'INVALID_COMMAND'].includes(code)) return 400; if (code === 'LEGACY_GOVERNANCE_EVALUATOR_RETIRED' || code === 'CHANGE_CURSOR_EXPIRED') return 410; return 500 }
function errorResponse(response: ServerResponse, error: unknown) { const applicationError = error instanceof ApplicationEntitlementError; const code = applicationError ? error.code : error instanceof GovernanceStoreError ? error.code : error instanceof AiPdmRoleCapabilityStoreError ? error.code : error instanceof PrivilegedAssignmentError ? error.code : error instanceof GovernanceValidationError ? 'GOVERNANCE_VALIDATION_FAILED' : 'GOVERNANCE_READ_FAILED'; if (applicationError) { const retryable = ['FINANCIAL_CATALOG_UNAVAILABLE', 'CATALOG_REGISTRY_UNAVAILABLE', 'GOVERNANCE_REVISION_CONFLICT', 'ORGANIZATION_REVISION_CONFLICT'].includes(code); sendJson(response, governanceErrorStatus(code), { code, message: '目前無法完成權限治理操作。', correlationId: `corr-${randomUUID()}`, ...(retryable ? { retryable: true } : {}) }); return } sendJson(response, governanceErrorStatus(code), { error: code, ...(error instanceof GovernanceValidationError ? { issues: error.issues } : {}) }) }
function actorOrThrow(request: IncomingMessage, enabled: boolean) { const actor = verifiedGovernanceActor(request) ?? resolveDevelopmentIdentity(request, enabled); if (!actor) throw new GovernanceStoreError(enabled ? 'IDENTITY_CONTEXT_REQUIRED' : 'IDENTITY_PROVIDER_NOT_CONFIGURED'); return actor }
function aiPdmActorOrThrow(request: IncomingMessage, enabled: boolean) { const actor = resolveDevelopmentIdentity(request, enabled) ?? verifiedGovernanceActor(request); if (!actor) throw new GovernanceStoreError(enabled ? 'IDENTITY_CONTEXT_REQUIRED' : 'IDENTITY_PROVIDER_NOT_CONFIGURED'); return actor }
function canManage(document: any, actor: GovernanceActorContext) { return canPermission(document, actor, 'orgmaster.governance.manage') }
function canPermission(document: any, actor: GovernanceActorContext, permissionCode: string) { const development = developmentPermissionForActor(actor, permissionCode); if (development !== null) return development; if (actor.bootstrap && !document.activePolicyVersionId) return true; return evaluatePermission(document, { applicationId: 'orgmaster', issuer: actor.issuer, subject: actor.subject, permissionCode, scope: { kind: 'global' } }).status === 'allowed' }
function canManageAiPdmRoleCapability(document: any, actor: GovernanceActorContext) { return actor.bootstrap || canPermission(document, actor, 'orgmaster.governance.manage') }
export function currentIdentityLinkValue(document: GovernanceDocumentV3, actor: GovernanceActorContext, employeeId: string, at = new Date().toISOString()): GovernanceIdentityLinkV1 {
  try { return resolveIdentityLinkUpsert(document, { employeeId, principalId: actor.principalId, issuer: actor.issuer, subject: actor.subject, newIdentityLinkId: `identity-${randomUUID()}` }, at) }
  catch (error) { if (error instanceof Error && error.message === 'IDENTITY_LINK_CONFLICT') throw new GovernanceStoreError('IDENTITY_LINK_CONFLICT'); throw error }
}
export function assertIdentityLinkStatusMutationAllowed(document: GovernanceDocumentV3, actor: GovernanceActorContext, id: string, status: 'active' | 'inactive') {
  try { assertIdentityLinkStatusMutationAllowedPolicy(document, { identityLinkId: id, employeeId: document.draft.identityLinks.find((link) => link.id === id)?.employeeId ?? '', status, actor }) }
  catch (error) { throw new GovernanceStoreError(error instanceof Error ? error.message : 'IDENTITY_LINK_CONFLICT') }
}
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

function privilegedMutation(body: Record<string, unknown>, phase: 'preview' | 'publish') {
  if (body.contractVersion !== 'orgmaster.privileged-assignment-operation.v1' || body.phase !== phase || body.applicationId !== 'ai-pdm' || body.stableRoleId !== 'role-system-admin') throw new PrivilegedAssignmentError('INVALID_COMMAND')
  const operation = body.operation
  const payload = body.payload
  const expected = body.expected
  if ((operation !== 'grant_system_admin' && operation !== 'revoke_system_admin') || !payload || typeof payload !== 'object' || Array.isArray(payload) || !expected || typeof expected !== 'object' || Array.isArray(expected)) throw new PrivilegedAssignmentError('INVALID_COMMAND')
  const value = payload as Record<string, unknown>
  const versions = expected as Record<string, unknown>
  const base = {
    applicationId: 'ai-pdm' as const,
    stableRoleId: 'role-system-admin' as const,
    expected: {
      catalogVersion: String(versions.catalogVersion ?? ''),
      catalogPayloadHash: String(versions.catalogPayloadHash ?? ''),
      governanceRevision: String(versions.governanceRevision ?? ''),
      organizationRevision: String(versions.organizationRevision ?? ''),
    },
    reason: String(body.reason ?? ''),
  }
  const request: PrivilegedAssignmentRequest = operation === 'grant_system_admin'
    ? { ...base, operation, employeeId: String(value.employeeId ?? ''), principalAdmissionId: String(value.principalAdmissionId ?? '') }
    : { ...base, operation, assignmentId: String(value.assignmentId ?? '') }
  if (phase === 'preview') return { request }
  const preview = body.preview
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) throw new PrivilegedAssignmentError('INVALID_COMMAND')
  return {
    request,
    commandId: String(body.commandId ?? ''),
    requestHash: String(body.requestHash ?? ''),
    previewHash: String((preview as Record<string, unknown>).previewHash ?? ''),
  }
}

function privilegedOperationResponse(request: PrivilegedAssignmentRequest, preview: Awaited<ReturnType<typeof previewPrivilegedAssignment>>) {
  return {
    contractVersion: 'orgmaster.privileged-assignment-operation.v1',
    phase: 'preview',
    operation: request.operation,
    applicationId: request.applicationId,
    stableRoleId: request.stableRoleId,
    payload: request.operation === 'grant_system_admin'
      ? { employeeId: request.employeeId, principalAdmissionId: request.principalAdmissionId }
      : { assignmentId: request.assignmentId },
    expected: request.expected,
    reason: request.reason.trim(),
    requestHash: preview.requestHash,
    preview: {
      previewHash: preview.previewHash,
      beforeHolderCount: preview.beforeHolderCount,
      afterHolderCount: preview.afterHolderCount,
      targetHint: preview.targetHint,
      affectedSessionCount: preview.affectedSessionCount,
      securityAlertRequired: true,
    },
  }
}

function recordBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function financialExpected(body: Record<string, unknown>) {
  const nested = recordBody(body.expected)
  return { ...nested, ...body }
}

function financialRoleAssignmentRequest(body: Record<string, unknown>, phase: 'preview' | 'publish'): FinancialRoleAssignmentInput | FinancialRoleAssignmentPublishInput {
  const expected = financialExpected(body)
  const scope = recordBody(body.scope)
  const request: FinancialRoleAssignmentInput = {
    operation: body.operation === 'revoke' ? 'revoke' : 'upsert',
    employeeId: String(body.employeeId ?? ''),
    stableRoleId: body.stableRoleId === undefined ? undefined : String(body.stableRoleId),
    assignmentId: body.assignmentId === undefined ? undefined : String(body.assignmentId),
    scope: { kind: 'workspace', value: String(scope.value ?? scope.key ?? '') },
    validFrom: String(body.validFrom ?? ''),
    validUntil: body.validUntil === null || body.validUntil === undefined ? null : String(body.validUntil),
    reason: String(body.reason ?? ''),
    expectedCatalogVersion: String(expected.expectedCatalogVersion ?? expected.catalogVersion ?? ''),
    expectedCatalogPayloadHash: String(expected.expectedCatalogPayloadHash ?? expected.expectedCatalogSha256 ?? expected.catalogSha256 ?? ''),
    expectedGovernanceRevision: String(expected.expectedGovernanceRevision ?? expected.governanceRevision ?? ''),
    expectedOrganizationRevision: String(expected.expectedOrganizationRevision ?? expected.organizationRevision ?? ''),
  }
  if (phase === 'publish') return { ...request, commandId: String(body.commandId ?? ''), requestHash: String(body.requestHash ?? ''), previewHash: String(body.previewHash ?? '') }
  return request
}

function financialManagementGrantRequest(body: Record<string, unknown>, phase: 'preview' | 'publish'): FinancialManagementGrantInput | FinancialManagementGrantPublishInput {
  const expected = financialExpected(body)
  const operations = Array.isArray(body.operations) ? body.operations.map((raw) => {
    const operation = recordBody(raw)
    return {
      operation: operation.operation === 'revoke' ? 'revoke' as const : 'upsert' as const,
      principalId: String(operation.principalId ?? ''),
      employeeId: String(operation.employeeId ?? ''),
      capabilities: Array.isArray(operation.capabilities) ? operation.capabilities.map(String) as Array<'financial-management-system.role_assignment.manage' | 'financial-management-system.role_assignment.publish'> : [],
      validFrom: String(operation.validFrom ?? ''),
      validUntil: operation.validUntil === null || operation.validUntil === undefined ? null : String(operation.validUntil),
      reason: String(operation.reason ?? ''),
    }
  }) : []
  const request: FinancialManagementGrantInput = {
    operations,
    expectedGovernanceRevision: String(expected.expectedGovernanceRevision ?? expected.governanceRevision ?? ''),
    expectedOrganizationRevision: String(expected.expectedOrganizationRevision ?? expected.organizationRevision ?? ''),
  }
  if (phase === 'publish') return { ...request, commandId: String(body.commandId ?? ''), requestHash: String(body.requestHash ?? ''), previewHash: String(body.previewHash ?? '') }
  return request
}

async function handle(request: IncomingMessage, response: ServerResponse, root: string, devEnabled: boolean, accountEnrollmentEnabled: boolean) {
  const url = new URL(request.url ?? '/', 'http://orgmaster.local'); const path = url.pathname.slice(API_PATH.length) || '/'; const actor = path.startsWith('/applications/ai-pdm/') ? aiPdmActorOrThrow(request, devEnabled) : actorOrThrow(request, devEnabled); const current = await readGovernanceStore(root); const document = current.document
  if (path === '/session' && request.method === 'GET') { sendJson(response, 200, { runtimeMode: actor.bootstrap ? 'local-development' : 'verified-session', actor: { principalId: actor.principalId, subjectHint: '••••' }, capabilities: { manage: canManage(document, actor), publish: canPermission(document, actor, 'orgmaster.governance.publish'), simulate: canPermission(document, actor, 'orgmaster.governance.simulate') } }, current.revision); return }
  if (path === '/' && request.method === 'GET') { sendJson(response, 200, { document: sanitizedDocument(document), catalogs: [readAiPdmRoleCatalog()], revision: current.revision, activeVersionId: document.activePolicyVersionId, versions: document.publishedVersions.map((version: any) => ({ id: version.id, kind: version.kind ?? 'legacy-policy-v1', versionNumber: version.versionNumber, publishedAt: version.publishedAt, publishedByPrincipalId: version.publishedByPrincipalId, publishReason: version.publishReason, snapshotHash: version.snapshotHash, organizationVersionId: version.organizationSnapshot.workspaceVersionId, effectState: version.effectState ?? 'legacy' })) }, current.revision); return }
  if (path.startsWith('/versions/') && request.method === 'GET') { const id = decodeURIComponent(path.slice('/versions/'.length)); const version = document.publishedVersions.find((entry: any) => entry.id === id); if (!version) throw new GovernanceStoreError('POLICY_VERSION_NOT_FOUND'); sendJson(response, 200, { version: sanitizedDocument({ ...document, draft: document.draft, publishedVersions: [version] }).publishedVersions[0] }, current.revision); return }
  if (path === '/audit' && request.method === 'GET') { const audit = await readGovernanceAudit(root, Number(url.searchParams.get('limit') ?? 50), Number(url.searchParams.get('cursor') ?? 0)); sendJson(response, 200, audit, current.revision); return }
  if (path === '/applications/financial-management-system/role-assignments' && request.method === 'GET') { const workspace = await readFinancialRoleAssignmentWorkspace(root, actor); sendJson(response, 200, workspace, workspace.governanceRevision); return }
  if (path === '/applications/financial-management-system/role-assignments/preview' && request.method === 'POST') { const body = await parseBody(request); const preview = await previewFinancialRoleAssignment(root, actor, financialRoleAssignmentRequest(body, 'preview')); sendJson(response, 200, preview, current.revision); return }
  if (path === '/applications/financial-management-system/role-assignments/publish' && request.method === 'POST') { const body = await parseBody(request); const published = await publishFinancialRoleAssignment(root, actor, financialRoleAssignmentRequest(body, 'publish') as FinancialRoleAssignmentPublishInput); sendJson(response, 200, { ...published, authorizationEffect: 'committed' }, published.governanceRevision); return }
  const financialAssignmentCommand = path.match(/^\/applications\/financial-management-system\/role-assignments\/commands\/([^/]+)$/)
  if (financialAssignmentCommand && request.method === 'GET') { const receipt = await readFinancialRoleAssignmentReceipt(root, decodeURIComponent(financialAssignmentCommand[1])); sendJson(response, receipt.receiptStatus === 'not_found' ? 404 : 200, receipt, receipt.governanceRevision); return }
  if (path === '/applications/financial-management-system/management-grants' && request.method === 'GET') { const workspace = await readFinancialManagementGrantWorkspace(root, actor); sendJson(response, 200, workspace, workspace.governanceRevision); return }
  if (path === '/applications/financial-management-system/management-grants/preview' && request.method === 'POST') { const body = await parseBody(request); const preview = await previewFinancialManagementGrant(root, actor, financialManagementGrantRequest(body, 'preview')); sendJson(response, 200, preview, current.revision); return }
  if (path === '/applications/financial-management-system/management-grants/publish' && request.method === 'POST') { const body = await parseBody(request); const published = await publishFinancialManagementGrant(root, actor, financialManagementGrantRequest(body, 'publish') as FinancialManagementGrantPublishInput); sendJson(response, 200, { ...published, authorizationEffect: 'committed' }, published.governanceRevision); return }
  const financialGrantCommand = path.match(/^\/applications\/financial-management-system\/management-grants\/commands\/([^/]+)$/)
  if (financialGrantCommand && request.method === 'GET') { const receipt = await readFinancialManagementGrantReceipt(root, decodeURIComponent(financialGrantCommand[1])); sendJson(response, receipt.receiptStatus === 'not_found' ? 404 : 200, receipt, receipt.governanceRevision); return }
  if (path === '/privileged-assignments' && request.method === 'GET') {
    if (url.searchParams.get('applicationId') !== 'ai-pdm' || url.searchParams.get('stableRoleId') !== 'role-system-admin') throw new PrivilegedAssignmentError('INVALID_COMMAND')
    const workspace = await readPrivilegedAssignmentWorkspace(root, actor)
    sendJson(response, 200, workspace, workspace.governanceRevision)
    return
  }
  if (path === '/privileged-assignments/preview' && request.method === 'POST') {
    const body = await parseBody(request)
    const parsed = privilegedMutation(body, 'preview')
    const preview = await previewPrivilegedAssignment(root, actor, parsed.request)
    sendJson(response, 200, privilegedOperationResponse(parsed.request, preview), current.revision)
    return
  }
  if (path === '/privileged-assignments/publish' && request.method === 'POST') {
    const body = await parseBody(request)
    const parsed = privilegedMutation(body, 'publish')
    if (!parsed.commandId || !parsed.requestHash || !parsed.previewHash) throw new PrivilegedAssignmentError('INVALID_COMMAND')
    const session = readVerifiedRequestIdentity(request)
    const receipt = await publishPrivilegedAssignment(root, actor, session ? {
      sessionId: session.id,
      principalId: session.principalId,
      assuranceLevel: session.assuranceLevel,
      authenticatedAt: session.authenticatedAt,
    } : {
      sessionId: '', principalId: actor.principalId, assuranceLevel: 'aal1', authenticatedAt: null,
    }, { ...parsed.request, commandId: parsed.commandId, requestHash: parsed.requestHash, previewHash: parsed.previewHash })
    sendJson(response, 200, receipt, receipt.governanceRevision)
    return
  }
  const privilegedReceipt = path.match(/^\/privileged-assignments\/commands\/([^/]+)$/)
  if (privilegedReceipt && request.method === 'GET') {
    const receipt = await readPrivilegedAssignmentReceipt(root, decodeURIComponent(privilegedReceipt[1]))
    sendJson(response, 200, receipt, receipt.governanceRevision)
    return
  }
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
  if (path === '/identity-links/current' && request.method === 'POST') {
    if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
    if (accountEnrollmentEnabled) throw new GovernanceStoreError('IDENTITY_ACCOUNT_FLOW_REQUIRED')
    const body = await parseBody(request)
    const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? '')
    if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT')
    const employeeId = String(body.employeeId ?? '')
    const commandId = String(body.commandId ?? '')
    const value = currentIdentityLinkValue(document, actor, employeeId)
    const command: GovernanceCommandV2 = { type: 'UPSERT_IDENTITY_LINK', commandId, reason: '連結目前登入身分', value }
    const result = await applyDraftCommand(root, current.revision, command, actor, (_locked, source) => {
      const employee = source.state.employees.find((candidate) => candidate.id === employeeId)
      if (!employee) throw new GovernanceStoreError('EMPLOYEE_NOT_FOUND')
      if (employee.status === 'inactive') throw new GovernanceStoreError('EMPLOYEE_NOT_ACTIVE')
    })
    sendJson(response, 200, { status: result.status, document: sanitizedDocument(result.document), revision: result.revision }, result.revision)
    return
  }
  if (path === '/draft' && request.method === 'PATCH') {
    const body = await parseBody(request)
    if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED')
    const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? '')
    if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT')
    const candidate = body.command as any
    if (!ensureCommandShape(candidate)) throw new GovernanceStoreError('INVALID_JSON')
    if (LEGACY_EXTERNAL_COMMANDS.includes(String(candidate.type))) throw new GovernanceStoreError('EXTERNAL_CATALOG_READ_ONLY')
    if (!(V2_COMMANDS as readonly string[]).includes(String(candidate.type))) throw new GovernanceStoreError('INVALID_JSON')
    if (accountEnrollmentEnabled && (candidate.type === 'UPSERT_IDENTITY_LINK' || candidate.type === 'SET_IDENTITY_LINK_STATUS')) throw new GovernanceStoreError('IDENTITY_ACCOUNT_FLOW_REQUIRED')
    if (candidate.type === 'SET_IDENTITY_LINK_STATUS') assertIdentityLinkStatusMutationAllowed(document, actor, String(candidate.id ?? ''), candidate.status === 'inactive' ? 'inactive' : 'active')
    const result = await applyDraftCommand(root, current.revision, candidate as GovernanceCommandV2, actor)
    sendJson(response, 200, { status: result.status, document: sanitizedDocument(result.document), revision: result.revision }, result.revision)
    return
  }
  if (path === '/validate/assignment' && request.method === 'POST') { const body = await parseBody(request); if (!canPermission(document, actor, 'orgmaster.governance.simulate')) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const result = await validateAssignmentCandidate(root, body as any); sendJson(response, 200, result, current.revision); return }
  if (path === '/versions' && request.method === 'POST') { const body = await parseBody(request); if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? ''); if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT'); const result = await publishGovernance(root, current.revision, String(body.commandId ?? ''), String(body.reason ?? ''), String(body.organizationVersionId ?? ''), actor); const version: any = result.document.publishedVersions.at(-1); sendJson(response, 201, { versionSummary: { id: version.id, kind: version.kind, versionNumber: version.versionNumber, publishedAt: version.publishedAt, snapshotHash: version.snapshotHash, organizationVersionId: version.organizationSnapshot.workspaceVersionId, effectState: version.effectState }, revision: result.revision }, result.revision); return }
  if (path === '/active-version' && request.method === 'POST') { const body = await parseBody(request); if (!canManage(document, actor)) throw new GovernanceStoreError('GOVERNANCE_ADMIN_REQUIRED'); const expected = String(body.expectedRevision ?? request.headers['x-orgmaster-governance-revision'] ?? ''); if (expected !== current.revision) throw new GovernanceStoreError('REVISION_CONFLICT'); const result = await setActivePolicy(root, current.revision, String(body.commandId ?? ''), String(body.reason ?? ''), body.versionId === null ? null : String(body.versionId ?? ''), actor); sendJson(response, 200, { activePolicyVersionId: result.document.activePolicyVersionId, revision: result.revision }, result.revision); return }
  if ((path === '/evaluate/permission' || path === '/evaluate/reviewers') && request.method === 'POST') { sendJson(response, 410, { error: 'LEGACY_GOVERNANCE_EVALUATOR_RETIRED' }); return }
  sendJson(response, 404, { error: 'ROUTE_NOT_FOUND' })
}
function middleware(root: string, devEnabled: boolean, accountEnrollmentEnabled = false) { return (request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) => { if (!request.url?.startsWith(API_PATH)) return next(); void handle(request, response, root, devEnabled, accountEnrollmentEnabled).catch((error) => errorResponse(response, error)) } }
export function createOrgmasterGovernanceMiddleware(root = process.cwd(), devEnabled = false, accountEnrollmentEnabled = false): Connect.NextHandleFunction { return middleware(root, devEnabled, accountEnrollmentEnabled) }
export function orgmasterGovernanceApiPlugin(options: { accountEnrollmentEnabled?: boolean } = {}): Plugin { return { name: 'orgmaster-local-governance-api', configureServer(server: ViteDevServer) { server.middlewares.use(middleware(server.config.root, server.config.command === 'serve' && server.config.mode === 'development', options.accountEnrollmentEnabled === true)) }, configurePreviewServer(server: PreviewServer) { server.middlewares.use(middleware(process.cwd(), false, options.accountEnrollmentEnabled === true)) } } }
