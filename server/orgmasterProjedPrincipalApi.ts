import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { ManagedLoginCallerVerifier } from './orgmasterManagedLoginApi'

export const ORGMASTER_PROJED_PRINCIPAL_API_PATH = '/api/internal/projed-principals/v1'
export const ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION = 'orgmaster.projed-principal.v1'

const MAX_BODY_BYTES = 32 * 1024
const MAX_BEARER_BYTES = 16 * 1024
const MAX_ID_TOKEN_BYTES = 16 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface OrgmasterProjedPrincipalApiService {
  enroll(input: { requestId: string; idToken: string }): Promise<unknown>
}

type ApiErrorCode = 'request_invalid' | 'caller_or_token_invalid' | 'principal_identity_invalid' | 'principal_mapping_conflict' | 'principal_enrollment_unavailable'

const SERVICE_ERROR_STATUS: Partial<Record<ApiErrorCode, number>> = {
  principal_identity_invalid: 401,
  principal_mapping_conflict: 409,
  principal_enrollment_unavailable: 503,
}

class ApiError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode) {
    super(code)
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

function errorResponse(response: ServerResponse, error: ApiError, requestId: string) {
  sendJson(response, error.status, { contractVersion: ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION, requestId, code: error.code })
}

function callerBearer(request: IncomingMessage): string {
  const header = request.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new ApiError(401, 'caller_or_token_invalid')
  const token = header.slice(7)
  if (!token || Buffer.byteLength(token, 'utf8') > MAX_BEARER_BYTES) throw new ApiError(401, 'caller_or_token_invalid')
  return token
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new ApiError(400, 'request_invalid')
  const declaredSize = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) throw new ApiError(400, 'request_invalid')

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    request.on('data', (value: Buffer | string) => {
      const chunk = Buffer.from(value)
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) tooLarge = true
      else chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) return reject(new ApiError(400, 'request_invalid'))
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new ApiError(400, 'request_invalid')) }
    })
    request.on('error', () => reject(new ApiError(400, 'request_invalid')))
  })
}

function parseRequest(value: unknown): { requestId: string; idToken: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'request_invalid')
  const body = value as Record<string, unknown>
  const keys = Object.keys(body).sort()
  if (keys.length !== 3 || keys[0] !== 'contractVersion' || keys[1] !== 'idToken' || keys[2] !== 'requestId') throw new ApiError(400, 'request_invalid')
  if (body.contractVersion !== ORGMASTER_PROJED_PRINCIPAL_CONTRACT_VERSION) throw new ApiError(400, 'request_invalid')
  if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) throw new ApiError(400, 'request_invalid')
  if (typeof body.idToken !== 'string' || body.idToken.length === 0 || Buffer.byteLength(body.idToken, 'utf8') > MAX_ID_TOKEN_BYTES) throw new ApiError(400, 'request_invalid')
  return { requestId: body.requestId, idToken: body.idToken }
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error !== null && typeof error === 'object') {
    const candidate = error as { status?: unknown; code?: unknown }
    if (typeof candidate.code === 'string' && candidate.code in SERVICE_ERROR_STATUS && candidate.status === SERVICE_ERROR_STATUS[candidate.code as ApiErrorCode]) {
      return new ApiError(candidate.status as number, candidate.code as ApiErrorCode)
    }
  }
  return new ApiError(503, 'principal_enrollment_unavailable')
}

export function createOrgmasterProjedPrincipalMiddleware(
  service?: OrgmasterProjedPrincipalApiService,
  verifier?: ManagedLoginCallerVerifier,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://orgmaster.local').pathname
    if (pathname !== ORGMASTER_PROJED_PRINCIPAL_API_PATH) return next()

    let responseRequestId: string = randomUUID()
    const handle = async () => {
      if (request.method !== 'POST') throw new ApiError(400, 'request_invalid')
      if (!service || !verifier) throw new ApiError(503, 'principal_enrollment_unavailable')
      const token = callerBearer(request)
      await verifier.verify(token).catch(() => { throw new ApiError(401, 'caller_or_token_invalid') })
      const parsed = parseRequest(await readJsonBody(request))
      responseRequestId = parsed.requestId
      const publication = await service.enroll(parsed)
      sendJson(response, 200, publication)
    }
    void handle().catch((error) => errorResponse(response, asApiError(error), responseRequestId))
  }
}

export function orgmasterProjedPrincipalApiPlugin(runtime: () => {
  service?: OrgmasterProjedPrincipalApiService
  verifier?: ManagedLoginCallerVerifier
}): Plugin {
  const use = (server: ViteDevServer | PreviewServer) => {
    const value = runtime()
    server.middlewares.use(createOrgmasterProjedPrincipalMiddleware(value.service, value.verifier))
  }
  return { name: 'orgmaster-projed-principal-owner-api', configureServer: use, configurePreviewServer: use }
}
