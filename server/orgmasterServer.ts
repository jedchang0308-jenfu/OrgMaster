import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Connect } from 'vite'
import { createOrgmasterApiMiddleware } from './orgmasterApi'
import { createOrgmasterAuthMiddleware, createOrgmasterAuthRuntime, type OrgmasterAuthRuntime } from './orgmasterAuthApi'
import { createOrgmasterGovernanceMiddleware } from './orgmasterGovernanceApi'
import { createOrgmasterManagementMethodMiddleware } from './managementMethodApi'
import { createOrgmasterMigrationGateMiddleware } from './orgmasterMigrationGate'
import { createOrgmasterAccountEnrollmentRuntime, type AccountEnrollmentHttpRuntimeV1 } from './orgmasterAccountEnrollmentApi'
import { createWorkbenchPreferenceMiddleware } from './workbenchPreferenceApi'

type Middleware = Connect.NextHandleFunction

export type OrgmasterServerOptions = {
  root?: string
  authRuntime?: OrgmasterAuthRuntime
  devIdentityEnabled?: boolean
  accountEnrollmentEnabled?: boolean
  accountEnrollmentRuntime?: AccountEnrollmentHttpRuntimeV1
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp',
}

function runMiddlewares(middlewares: Middleware[], request: IncomingMessage, response: ServerResponse, done: () => void) {
  let index = 0
  const next: Connect.NextFunction = (error?: unknown) => {
    if (error) {
      if (!response.writableEnded) {
        response.statusCode = 500
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ error: 'INTERNAL_SERVER_ERROR' }))
      }
      return
    }
    const middleware = middlewares[index++]
    if (!middleware) return done()
    middleware(request, response, next)
  }
  next()
}

async function sendStatic(root: string, request: IncomingMessage, response: ServerResponse) {
  let pathname: string
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://orgmaster.local').pathname) }
  catch {
    response.statusCode = 400
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end('Invalid request path.')
    return
  }
  if (pathname.startsWith('/api/')) {
    response.statusCode = 404
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ error: 'API_ROUTE_NOT_FOUND' }))
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET, HEAD')
    response.end()
    return
  }
  const dist = resolve(root, 'dist')
  const candidate = resolve(dist, `.${pathname}`)
  const safeCandidate = candidate === dist || candidate.startsWith(`${dist}${sep}`) ? candidate : resolve(dist, 'index.html')
  let file = safeCandidate
  try {
    const metadata = await stat(file)
    if (!metadata.isFile()) file = resolve(dist, 'index.html')
  } catch {
    file = resolve(dist, 'index.html')
  }
  try {
    const body = await readFile(file)
    response.statusCode = 200
    response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.statusCode = 503
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end('OrgMaster client build is unavailable.')
  }
}

export function createOrgmasterServer(options: OrgmasterServerOptions = {}) {
  const root = options.root ?? process.cwd()
  const runtime = options.authRuntime ?? createOrgmasterAuthRuntime()
  const devIdentityEnabled = options.devIdentityEnabled ?? false
  const accountEnrollmentEnabled = options.accountEnrollmentEnabled ?? false
  const accountRuntime = accountEnrollmentEnabled ? (options.accountEnrollmentRuntime ?? createOrgmasterAccountEnrollmentRuntime({ root, devEnabled: devIdentityEnabled })) : null
  const middlewares: Middleware[] = [
    createOrgmasterMigrationGateMiddleware(root),
    createOrgmasterAuthMiddleware(() => runtime, devIdentityEnabled),
    createWorkbenchPreferenceMiddleware(root),
    ...(accountRuntime ? [accountRuntime.middleware] : []),
    createOrgmasterApiMiddleware(),
    createOrgmasterGovernanceMiddleware(root, devIdentityEnabled, accountEnrollmentEnabled),
    createOrgmasterManagementMethodMiddleware(root, devIdentityEnabled),
  ]
  return createServer((request, response) => runMiddlewares(middlewares, request, response, () => { void sendStatic(root, request, response) }))
}

export function startOrgmasterServer(environment: NodeJS.ProcessEnv = process.env) {
  const runtime = createOrgmasterAuthRuntime(environment)
  if (!runtime.configResult.configured) {
    const detail = runtime.configResult.missing.length ? ` Missing: ${runtime.configResult.missing.join(', ')}` : ''
    throw new Error(`OrgMaster auth preflight failed: ${runtime.configResult.reason}${detail}`)
  }
  const port = Number(environment.PORT ?? 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.')
  const host = environment.ORGMASTER_HOST?.trim() || '0.0.0.0'
  const server = createOrgmasterServer({ authRuntime: runtime })
  server.listen(port, host, () => process.stdout.write(`OrgMaster listening on ${host}:${port}\n`))
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startOrgmasterServer()
