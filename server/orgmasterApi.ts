import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { parseOrgDocument, type OrgDocumentFile } from '../src/documentStorage'
import {
  createWorkspaceDraft,
  getWorkspaceIndex,
  getWorkspaceVersion,
  saveWorkspaceVersion,
  updateWorkspaceEntry,
  WorkspaceStoreError,
  getWorkspacePaths,
} from './orgmasterWorkspaceStore'

const API_PATH = '/api/orgmaster/document'
const WORKSPACE_PATH = '/api/orgmaster/workspace'

export function getOrgMasterDocumentPaths(rootDirectory = process.cwd()) {
  return {
    v7: resolve(rootDirectory, 'data', 'orgmaster-document.v7.json'),
    v6: resolve(rootDirectory, 'data', 'orgmaster-document.v6.json'),
    v5: resolve(rootDirectory, 'data', 'orgmaster-document.v5.json'),
    v4: resolve(rootDirectory, 'data', 'orgmaster-document.v4.json'),
    v3: resolve(rootDirectory, 'data', 'orgmaster-document.v3.json'),
    v2: resolve(rootDirectory, 'data', 'orgmaster-document.v2.json'),
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown, revision?: string) {
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  if (revision) response.setHeader('X-OrgMaster-Revision', revision)
  response.end(body)
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolveBody, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function readDocumentAtPath(dataFilePath: string) {
  const raw = await readFile(dataFilePath, 'utf8')
  const parsed = parseOrgDocument(JSON.parse(raw))
  if (!parsed.ok) throw new Error(`Invalid local organization document: ${parsed.code}`)
  const metadata = await stat(dataFilePath)
  return { document: parsed.document, revision: `${metadata.mtimeMs}` }
}

function isMissingFile(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function workspaceExists(rootDirectory = process.cwd()) {
  try {
    await access(getWorkspacePaths(rootDirectory).manifest)
    return true
  } catch {
    return false
  }
}

export async function readStoredDocument(rootDirectory = process.cwd()) {
  const paths = getOrgMasterDocumentPaths(rootDirectory)
  try {
    return await readDocumentAtPath(paths.v7)
  } catch (error) {
    if (!isMissingFile(error)) throw error
    try {
      return await readDocumentAtPath(paths.v6)
    } catch (v6Error) {
      if (!isMissingFile(v6Error)) throw v6Error
      try {
        return await readDocumentAtPath(paths.v5)
      } catch (v5Error) {
        if (!isMissingFile(v5Error)) throw v5Error
        try {
          return await readDocumentAtPath(paths.v4)
        } catch (v4Error) {
          if (!isMissingFile(v4Error)) throw v4Error
          try {
            return await readDocumentAtPath(paths.v3)
          } catch (v3Error) {
            if (!isMissingFile(v3Error)) throw v3Error
            return readDocumentAtPath(paths.v2)
          }
        }
      }
    }
  }
}

export async function writeStoredDocument(document: OrgDocumentFile, rootDirectory = process.cwd()) {
  const { v7 } = getOrgMasterDocumentPaths(rootDirectory)
  await mkdir(dirname(v7), { recursive: true })
  await writeFile(v7, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return readStoredDocument(rootDirectory)
}

function handleDocumentRequest(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) {
  if (request.method === 'GET') {
    void readStoredDocument()
      .then(({ document, revision }) => sendJson(response, 200, document, revision))
      .catch(() => sendJson(response, 500, { error: 'LOCAL_DOCUMENT_READ_FAILED' }))
    return
  }
  if (request.method === 'PUT') {
    void readBody(request)
      .then(async (raw) => {
        if (await workspaceExists()) {
          sendJson(response, 409, { error: 'WORKSPACE_MODE_REQUIRED' })
          return
        }
        const parsed = parseOrgDocument(JSON.parse(raw))
        if (!parsed.ok) {
          sendJson(response, 400, { error: parsed.code })
          return
        }
        const stored = await writeStoredDocument(parsed.document)
        sendJson(response, 200, stored.document, stored.revision)
      })
      .catch(() => sendJson(response, 400, { error: 'LOCAL_DOCUMENT_WRITE_FAILED' }))
    return
  }
  response.setHeader('Allow', 'GET, PUT')
  sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' })
}

function handleApiRequest(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) {
  if (request.url?.split('?')[0] !== API_PATH) return next()
  handleDocumentRequest(request, response, next)
}

function handleMountedApiRequest(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) {
  handleDocumentRequest(request, response, next)
}

function workspaceError(response: ServerResponse, error: unknown) {
  if (!(error instanceof WorkspaceStoreError)) {
    sendJson(response, 500, { error: 'WORKSPACE_INTERNAL_ERROR' })
    return
  }
  const status = error.code === 'VERSION_CONFLICT' || error.code === 'MANIFEST_CONFLICT' ? 409
    : error.code === 'WORKSPACE_ENTRY_NOT_FOUND' ? 404
      : error.code === 'VERSION_INVALID' ? 422
        : 400
  sendJson(response, status, {
    error: error.code,
    ...(error.code === 'VERSION_INVALID' ? { reason: error.message || error.code } : {}),
  })
}

async function parseJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(request)
  return JSON.parse(raw) as Record<string, unknown>
}

function workspaceVersionId(url: string) {
  const prefix = `${WORKSPACE_PATH}/versions/`
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length).split('/')[0]) : null
}

function handleWorkspaceRequest(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) {
  const pathname = request.url?.split('?')[0] ?? ''
  if (pathname.startsWith('/api/orgmaster/duty-plans')) {
    sendJson(response, 404, { error: 'DUTY_PLAN_API_REMOVED' })
    return
  }
  if (pathname === WORKSPACE_PATH && request.method === 'GET') {
    void getWorkspaceIndex().then((index) => sendJson(response, 200, index)).catch((error) => workspaceError(response, error))
    return
  }
  if (pathname === `${WORKSPACE_PATH}/versions` && request.method === 'POST') {
    void parseJsonBody(request).then(async (body) => {
      const result = await createWorkspaceDraft(
        process.cwd(),
        String(body.sourceVersionId ?? ''),
        String(body.name ?? ''),
        String(body.expectedManifestRevision ?? request.headers['x-orgmaster-manifest-revision'] ?? ''),
      )
      sendJson(response, 201, result)
    }).catch((error) => workspaceError(response, error))
    return
  }
  const versionId = workspaceVersionId(pathname)
  if (versionId && request.method === 'GET') {
    void getWorkspaceVersion(process.cwd(), versionId).then((result) => sendJson(response, 200, result, result.version.revision)).catch((error) => workspaceError(response, error))
    return
  }
  if (versionId && request.method === 'PUT') {
    void parseJsonBody(request).then(async (body) => {
      const result = await saveWorkspaceVersion(
        process.cwd(),
        versionId,
        body.document as OrgDocumentFile,
        String(body.expectedVersionRevision ?? request.headers['x-orgmaster-revision'] ?? ''),
        body.mode === 'current-maintenance' ? 'current-maintenance' : 'draft-edit',
      )
      sendJson(response, 200, result, result.version.revision)
    }).catch((error) => workspaceError(response, error))
    return
  }
  if (versionId && request.method === 'PATCH') {
    void parseJsonBody(request).then(async (body) => {
      const action = body.action === 'archive' || body.action === 'restore' ? body.action : 'rename'
      const result = await updateWorkspaceEntry(
        process.cwd(),
        versionId,
        action,
        typeof body.name === 'string' ? body.name : undefined,
        String(body.expectedManifestRevision ?? request.headers['x-orgmaster-manifest-revision'] ?? ''),
      )
      sendJson(response, 200, result)
    }).catch((error) => workspaceError(response, error))
    return
  }
  if (pathname.startsWith(`${WORKSPACE_PATH}/`)) {
    sendJson(response, 404, { error: 'WORKSPACE_ROUTE_NOT_FOUND' })
    return
  }
  next()
}

export function orgmasterApiPlugin(): Plugin {
  return {
    name: 'orgmaster-local-document-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handleWorkspaceRequest)
      server.middlewares.use(handleApiRequest)
      server.middlewares.use(API_PATH, handleMountedApiRequest)
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handleWorkspaceRequest)
      server.middlewares.use(handleApiRequest)
      server.middlewares.use(API_PATH, handleMountedApiRequest)
    },
  }
}
