import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
import { readVerifiedRequestIdentity, verifiedGovernanceActor } from './orgmasterRequestIdentity'
import { AccountProvisioningError, createLocalAccountProvisioningAdapter, type AccountProvisioningPort } from './orgmasterAccountProvisioningPort'
import { AccountEnrollmentServiceError, createAccountEnrollmentService, type AccountEnrollmentRecoveryReportV1, type AccountEnrollmentServiceV1 } from './orgmasterAccountEnrollmentService'
import type { AccountEnrollmentErrorBodyV1, ExistingCandidateRequestV1, InviteAccountRequestV1, LinkExistingAccountRequestV1, ManageInvitationRequestV1, SetIdentityLinkStatusRequestV1 } from '../src/accountEnrollment/types'
import { AccountEnrollmentStoreError } from './orgmasterAccountEnrollmentStore'

export const ACCOUNT_ENROLLMENT_API_PATH = '/api/orgmaster/account-enrollments'
const MAX_BODY = 64 * 1024

function sendJson(response: ServerResponse, status: number, payload: unknown) { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(payload)) }
function statusFor(code: string) {
  if (code === 'IDENTITY_CONTEXT_REQUIRED') return 401
  if (['IDENTITY_VIEW_REQUIRED', 'IDENTITY_INVITE_REQUIRED', 'IDENTITY_LINK_REQUIRED', 'IDENTITY_INVITATION_MANAGE_REQUIRED', 'GOVERNANCE_ADMIN_REQUIRED'].includes(code)) return 403
  if (code === 'IDENTITY_ORIGIN_INVALID') return 403
  if (['EMPLOYEE_NOT_FOUND', 'ACCOUNT_ENROLLMENT_NOT_FOUND', 'IDENTITY_LINK_NOT_FOUND', 'ACCOUNT_CANDIDATE_NOT_FOUND'].includes(code)) return 404
  if (code === 'PAYLOAD_TOO_LARGE') return 413
  if (['REVISION_CONFLICT', 'ACCOUNT_ENROLLMENT_REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'INVITATION_ALREADY_PENDING', 'ACCOUNT_ALREADY_EXISTS', 'IDENTITY_LINK_CONFLICT'].includes(code)) return 409
  if (['WORK_EMAIL_INVALID', 'WORK_EMAIL_DOMAIN_NOT_ALLOWED', 'EMPLOYEE_NOT_ACTIVE', 'ACCOUNT_NOT_ELIGIBLE', 'CANDIDATE_TOKEN_INVALID', 'CANDIDATE_TOKEN_EXPIRED', 'SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN', 'IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN', 'INVITATION_STATE_INVALID', 'INVALID_REQUEST'].includes(code)) return 422
  if (['IDENTITY_PROVISIONING_UNAVAILABLE', 'PROVIDER_OUTCOME_UNKNOWN', 'GOVERNANCE_READ_FAILED', 'ACCOUNT_ENROLLMENT_STORE_INVALID', 'ACCOUNT_ENROLLMENT_WRITE_FAILED'].includes(code)) return 503
  if (code === 'METHOD_NOT_ALLOWED') return 405
  if (code === 'ROUTE_NOT_FOUND') return 404
  return 500
}
function errorBody(error: unknown): { status: number; body: AccountEnrollmentErrorBodyV1 } {
  const code = error instanceof AccountEnrollmentServiceError ? error.code : error instanceof AccountEnrollmentStoreError ? error.code : error instanceof AccountProvisioningError ? error.code : 'GOVERNANCE_READ_FAILED'
  const details = error instanceof AccountEnrollmentServiceError ? error.details : undefined
  const body: AccountEnrollmentErrorBodyV1 = { error: code as AccountEnrollmentErrorBodyV1['error'] }
  if (details?.field && ['WORK_EMAIL_INVALID', 'WORK_EMAIL_DOMAIN_NOT_ALLOWED'].includes(code)) body.field = details.field
  if (details?.conflictingEmployee && code === 'IDENTITY_LINK_CONFLICT') body.conflictingEmployee = details.conflictingEmployee
  if (details?.retryable && ['IDENTITY_PROVISIONING_UNAVAILABLE', 'REVISION_CONFLICT', 'ACCOUNT_ENROLLMENT_REVISION_CONFLICT', 'GOVERNANCE_READ_FAILED'].includes(code)) body.retryable = true
  return { status: statusFor(code), body }
}
function readBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0
    request.on('data', (chunk: Buffer | string) => { const value = Buffer.from(chunk); size += value.length; if (size > MAX_BODY) { reject(new AccountEnrollmentServiceError('PAYLOAD_TOO_LARGE')); request.destroy(); return } chunks.push(value) })
    request.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); if (!raw) return reject(new AccountEnrollmentServiceError('INVALID_JSON')); try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); resolve(value as Record<string, unknown>) } catch { reject(new AccountEnrollmentServiceError('INVALID_JSON')) } })
    request.on('error', reject)
  })
}
function parsePath(request: IncomingMessage) { try { return new URL(request.url ?? '/', 'http://orgmaster.local').pathname } catch { throw new AccountEnrollmentServiceError('INVALID_REQUEST') } }
function assertOrigin(request: IncomingMessage, devEnabled: boolean) {
  const origin = request.headers.origin; const host = request.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') throw new AccountEnrollmentServiceError('IDENTITY_ORIGIN_INVALID')
  try { const value = new URL(origin); if (!['http:', 'https:'].includes(value.protocol) || value.host !== host) throw new Error(); if (devEnabled && !['localhost', '127.0.0.1', '::1'].includes(value.hostname) && !value.hostname.startsWith('127.')) throw new Error() } catch { throw new AccountEnrollmentServiceError('IDENTITY_ORIGIN_INVALID') }
}
function actorFor(request: IncomingMessage, devEnabled: boolean) { const actor = verifiedGovernanceActor(request) ?? resolveDevelopmentIdentity(request, devEnabled); if (!actor) throw new AccountEnrollmentServiceError('IDENTITY_CONTEXT_REQUIRED'); return actor }
function actorBinding(request: IncomingMessage, actor: { principalId: string }) { return readVerifiedRequestIdentity(request)?.id ?? `dev:${actor.principalId}` }

async function handle(request: IncomingMessage, response: ServerResponse, runtime: AccountEnrollmentHttpRuntimeV1, devEnabled: boolean) {
  const readiness = await runtime.startupRecovery
  if (readiness.status === 'failed') { sendJson(response, 503, { error: readiness.code }); return }
  const actor = actorFor(request, devEnabled); const path = parsePath(request)
  if (request.method !== 'GET') assertOrigin(request, devEnabled)
  try {
    if (request.method === 'GET') {
      const prefix = `${ACCOUNT_ENROLLMENT_API_PATH}/employees/`; const raw = path.startsWith(prefix) ? path.slice(prefix.length) : ''
      if (!raw || raw.includes('/')) throw new AccountEnrollmentServiceError('ROUTE_NOT_FOUND')
      let employeeId: string; try { employeeId = decodeURIComponent(raw) } catch { throw new AccountEnrollmentServiceError('INVALID_REQUEST') }
      sendJson(response, 200, await runtime.service.readEmployeeAccess(actor, employeeId)); return
    }
    if (request.method !== 'POST') throw new AccountEnrollmentServiceError('METHOD_NOT_ALLOWED')
    const body = await readBody(request)
    if (path === `${ACCOUNT_ENROLLMENT_API_PATH}/invitations` && request.method === 'POST') { const result = await runtime.service.invite(actor, { commandId: String(body.commandId ?? ''), employeeId: String(body.employeeId ?? ''), email: String(body.email ?? '') } as InviteAccountRequestV1); sendJson(response, result.disposition === 'created' ? 201 : 200, result.view); return }
    if (path === `${ACCOUNT_ENROLLMENT_API_PATH}/existing-candidates` && request.method === 'POST') { const result = await runtime.service.findExisting(actor, { employeeId: String(body.employeeId ?? ''), email: String(body.email ?? '') } as ExistingCandidateRequestV1, actorBinding(request, actor)); sendJson(response, 200, result); return }
    if (path === `${ACCOUNT_ENROLLMENT_API_PATH}/existing-links` && request.method === 'POST') { const result = await runtime.service.linkExisting(actor, { commandId: String(body.commandId ?? ''), employeeId: String(body.employeeId ?? ''), candidateToken: String(body.candidateToken ?? ''), expectedGovernanceRevision: String(body.expectedGovernanceRevision ?? '') } as LinkExistingAccountRequestV1, actorBinding(request, actor)); sendJson(response, 200, result); return }
    const resend = path.match(new RegExp(`^${ACCOUNT_ENROLLMENT_API_PATH}/invitations/([^/]+)/resend$`)); if (resend && request.method === 'POST') { const result = await runtime.service.resend(actor, { commandId: String(body.commandId ?? ''), enrollmentId: decodeURIComponent(resend[1]), expectedEnrollmentRevision: Number(body.expectedEnrollmentRevision) } as ManageInvitationRequestV1); sendJson(response, 200, result); return }
    const cancel = path.match(new RegExp(`^${ACCOUNT_ENROLLMENT_API_PATH}/invitations/([^/]+)/cancel$`)); if (cancel && request.method === 'POST') { const result = await runtime.service.cancel(actor, { commandId: String(body.commandId ?? ''), enrollmentId: decodeURIComponent(cancel[1]), expectedEnrollmentRevision: Number(body.expectedEnrollmentRevision) } as ManageInvitationRequestV1); sendJson(response, 200, result); return }
    const status = path.match(new RegExp(`^${ACCOUNT_ENROLLMENT_API_PATH}/identity-links/([^/]+)/status$`)); if (status && request.method === 'POST') { const result = await runtime.service.setIdentityLinkStatus(actor, { commandId: String(body.commandId ?? ''), employeeId: String(body.employeeId ?? ''), identityLinkId: decodeURIComponent(status[1]), status: body.status === 'inactive' ? 'inactive' : 'active', expectedGovernanceRevision: String(body.expectedGovernanceRevision ?? '') } as SetIdentityLinkStatusRequestV1); sendJson(response, 200, result); return }
    throw new AccountEnrollmentServiceError('ROUTE_NOT_FOUND')
  } catch (error) { const result = errorBody(error); sendJson(response, result.status, result.body) }
}

export type AccountEnrollmentRuntimeReadinessV1 = { status: 'ready'; report: AccountEnrollmentRecoveryReportV1 } | { status: 'failed'; code: 'ACCOUNT_ENROLLMENT_STORE_INVALID' }
export interface AccountEnrollmentHttpRuntimeV1 { service: AccountEnrollmentServiceV1; middleware: Connect.NextHandleFunction; startupRecovery: Promise<AccountEnrollmentRuntimeReadinessV1> }
export function createOrgmasterAccountEnrollmentRuntime(input: { root: string; devEnabled: boolean; provider?: AccountProvisioningPort | null; now?: () => Date; token?: () => string }): AccountEnrollmentHttpRuntimeV1 {
  const provider = input.devEnabled ? (input.provider === undefined ? createLocalAccountProvisioningAdapter({ now: input.now }) : input.provider) : null
  const service = createAccountEnrollmentService({ ...input, provider })
  const startupRecovery = service.recoverIncompleteEnrollments().then((report) => ({ status: 'ready' as const, report })).catch((error) => { if ((error instanceof AccountEnrollmentStoreError && error.code === 'ACCOUNT_ENROLLMENT_STORE_INVALID') || (error instanceof AccountEnrollmentServiceError && error.code === 'ACCOUNT_ENROLLMENT_STORE_INVALID')) return { status: 'failed' as const, code: 'ACCOUNT_ENROLLMENT_STORE_INVALID' as const }; return { status: 'ready' as const, report: { inspected: 0, advanced: 0, remaining: 0 } } })
  const middleware: Connect.NextHandleFunction = (request, response, next) => { if (!request.url?.startsWith(ACCOUNT_ENROLLMENT_API_PATH)) return next(); void handle(request, response, runtime, input.devEnabled) }
  const runtime = { service, middleware, startupRecovery } as AccountEnrollmentHttpRuntimeV1
  return runtime
}
export function orgmasterAccountEnrollmentApiPlugin(options: { runtime?: AccountEnrollmentHttpRuntimeV1 } = {}): Plugin {
  let runtime = options.runtime
  return { name: 'orgmaster-account-enrollment-api', configureServer(server: ViteDevServer) { runtime ??= createOrgmasterAccountEnrollmentRuntime({ root: server.config.root, devEnabled: server.config.command === 'serve' && server.config.mode === 'development' }); server.middlewares.use(runtime.middleware) }, configurePreviewServer(server: PreviewServer) { runtime ??= createOrgmasterAccountEnrollmentRuntime({ root: process.cwd(), devEnabled: false }); server.middlewares.use(runtime.middleware) } }
}
