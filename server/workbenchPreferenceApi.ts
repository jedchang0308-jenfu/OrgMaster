import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { readVerifiedRequestIdentity } from './orgmasterRequestIdentity'
import { createWorkbenchPreferenceRepository, isValidWorkbenchListWidth, isWorkbenchPreferenceModuleId, WORKBENCH_PREFERENCE_MODULES, type WorkbenchPreferenceRepository } from './workbenchPreferenceRepository'

export const WORKBENCH_PREFERENCE_API_PATH = '/api/orgmaster/preferences/workbench'
const MAX_BODY_BYTES = 4 * 1024

class WorkbenchPreferenceApiError extends Error { constructor(public status: number, public code: string) { super(code) } }
function sendJson(response: ServerResponse, status: number, payload: unknown) { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(payload)) }
async function readJsonBody(request: IncomingMessage) {
  const contentLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new WorkbenchPreferenceApiError(413, 'PREFERENCE_REQUEST_TOO_LARGE')
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0
    request.on('data', (part: Buffer | string) => { const chunk = Buffer.from(part); size += chunk.byteLength; if (size <= MAX_BODY_BYTES) chunks.push(chunk) })
    request.on('end', () => { if (size > MAX_BODY_BYTES) return reject(new WorkbenchPreferenceApiError(413, 'PREFERENCE_REQUEST_TOO_LARGE')); try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid'); resolve(parsed as Record<string, unknown>) } catch { reject(new WorkbenchPreferenceApiError(400, 'PREFERENCE_BODY_INVALID')) } })
    request.on('error', reject)
  })
}

async function handle(request: IncomingMessage, response: ServerResponse, repository: WorkbenchPreferenceRepository) {
  const url = new URL(request.url ?? '/', 'http://orgmaster.local')
  const base = WORKBENCH_PREFERENCE_API_PATH
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false
  const identity = readVerifiedRequestIdentity(request)
  if (!identity) { sendJson(response, 401, { error: 'IDENTITY_CONTEXT_REQUIRED' }); return true }
  try {
    if (url.pathname === base && request.method === 'GET') {
      const document = await repository.read(identity.principalId)
      sendJson(response, 200, document)
      return true
    }
    const moduleId = url.pathname.slice(`${base}/`.length)
    if (!isWorkbenchPreferenceModuleId(moduleId)) throw new WorkbenchPreferenceApiError(404, 'PREFERENCE_MODULE_NOT_FOUND')
    if (request.method !== 'PUT') { sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' }); return true }
    const body = await readJsonBody(request)
    if (body.version !== 1 || !isValidWorkbenchListWidth(body.listWidthPx)) throw new WorkbenchPreferenceApiError(400, 'PREFERENCE_VALUE_INVALID')
    const projection = await repository.upsert(identity.principalId, moduleId, body.listWidthPx)
    sendJson(response, 200, { version: 1, moduleId, listWidth: projection })
    return true
  } catch (error) {
    if (error instanceof WorkbenchPreferenceApiError) { sendJson(response, error.status, { error: error.code }); return true }
    const status = request.method === 'GET' ? 503 : 503
    sendJson(response, status, { error: request.method === 'GET' ? 'PREFERENCE_READ_FAILED' : 'PREFERENCE_WRITE_FAILED' })
    return true
  }
}

export function createWorkbenchPreferenceMiddleware(root = process.cwd(), repository = createWorkbenchPreferenceRepository(root)): Connect.NextHandleFunction {
  return (request, response, next) => { void handle(request, response, repository).then((handled) => { if (!handled) next() }).catch(() => { if (!response.writableEnded) sendJson(response, 503, { error: 'PREFERENCE_READ_FAILED' }) }) }
}

export function workbenchPreferenceApiPlugin(): Plugin {
  return { name: 'orgmaster-workbench-preference-api', configureServer(server: ViteDevServer) { server.middlewares.use(createWorkbenchPreferenceMiddleware(server.config.root)) }, configurePreviewServer(server: PreviewServer) { server.middlewares.use(createWorkbenchPreferenceMiddleware(process.cwd())) } }
}

export { WORKBENCH_PREFERENCE_MODULES }
