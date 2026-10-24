import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP_KINDS = Object.freeze(new Set(['platform', 'orgmaster', 'ai-pdm']))
const NEXT_KINDS = Object.freeze(new Set(['platform', 'ai-pdm']))
const LOOPBACK_HOSTS = Object.freeze(new Set(['127.0.0.1', 'localhost', '::1', '[::1]']))
const SAFE_ERROR_CODES = Object.freeze(new Set([
  'APP_LAUNCH_FAILED', 'APP_SHUTDOWN_FAILED', 'APP_STOP_TIMEOUT',
  'DEV058_APP_CONFIG_INVALID', 'DEV058_APP_KIND_INVALID', 'DEV058_APP_ORIGIN_INVALID',
  'DEV058_APP_PACKAGE_INVALID', 'DEV058_APP_ROOT_INVALID', 'DEV058_NEXT_DIST_DIR_INVALID',
  'DEV058_NEXT_CONFIG_NOT_APPLIED',
  'DEV058_NEXT_MODULE_INVALID', 'DEV058_TLS_CERT_INVALID', 'DEV058_TLS_KEY_INVALID',
  'DEV058_APP_KIND_REQUIRED', 'DEV058_APP_ORIGIN_REQUIRED', 'DEV058_APP_ROOT_REQUIRED',
  'DEV058_TLS_CERT_PATH_REQUIRED', 'DEV058_TLS_KEY_PATH_REQUIRED',
  'EACCES', 'EADDRINUSE', 'EADDRNOTAVAIL', 'ENOENT', 'ERR_INVALID_URL',
  'ERR_MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM', 'ERR_TLS_CERT_ALTNAME_INVALID',
]))

const outputWrite = process.stdout.write.bind(process.stdout)
const errorWrite = process.stderr.write.bind(process.stderr)

let outputSilenced = false
let runtime = null
let stopReason = null
let stopPromiseResolve
let stopPromise = new Promise((resolve) => { stopPromiseResolve = resolve })
let stopInFlight = null
let exitCode = 0
let phase = 'input'

function emit(event, fields = {}) {
  outputWrite(`${JSON.stringify({ event, ...fields })}\n`)
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  return SAFE_ERROR_CODES.has(code) ? code : 'APP_LAUNCH_FAILED'
}

function fail(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function assertRealDirectory(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw fail(code)
  const requested = path.resolve(value)
  let real
  try {
    real = fs.realpathSync(requested)
    const stat = fs.lstatSync(real)
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(requested, real)) throw fail(code)
  } catch (error) {
    if (error?.code === code) throw error
    throw fail(code)
  }
  return real
}

function assertRegularFile(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw fail(code)
  const requested = path.resolve(value)
  try {
    const stat = fs.lstatSync(requested)
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath(fs.realpathSync(requested), requested)) throw fail(code)
  } catch (error) {
    if (error?.code === code) throw error
    throw fail(code)
  }
  return requested
}

function readRequiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw fail(`${name}_REQUIRED`)
  return value
}

function readOrigin() {
  const value = readRequiredEnvironment('DEV058_APP_ORIGIN')
  let origin
  try {
    origin = new URL(value)
  } catch {
    throw fail('ERR_INVALID_URL')
  }
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      !LOOPBACK_HOSTS.has(origin.hostname) || origin.pathname !== '/' || origin.search || origin.hash ||
      !origin.port) throw fail('DEV058_APP_ORIGIN_INVALID')
  const port = Number(origin.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail('DEV058_APP_ORIGIN_INVALID')
  return Object.freeze({ host: origin.hostname.replace(/^\[|\]$/gu, ''), port })
}

function readLaunchInput() {
  const kind = readRequiredEnvironment('DEV058_APP_KIND')
  if (!APP_KINDS.has(kind)) throw fail('DEV058_APP_KIND_INVALID')
  const root = assertRealDirectory(readRequiredEnvironment('DEV058_APP_ROOT'), 'DEV058_APP_ROOT_INVALID')
  assertRegularFile(path.join(root, 'package.json'), 'DEV058_APP_PACKAGE_INVALID')
  const certPath = assertRegularFile(readRequiredEnvironment('DEV058_TLS_CERT_PATH'), 'DEV058_TLS_CERT_INVALID')
  const keyPath = assertRegularFile(readRequiredEnvironment('DEV058_TLS_KEY_PATH'), 'DEV058_TLS_KEY_INVALID')
  const origin = readOrigin()
  const configFile = kind === 'orgmaster' ? path.join(root, 'vite.config.ts') : null
  if (configFile) assertRegularFile(configFile, 'DEV058_APP_CONFIG_INVALID')
  if (NEXT_KINDS.has(kind)) {
    assertRegularFile(fs.realpathSync(path.join(root, 'node_modules', 'next', 'dist', 'server', 'next.js')), 'DEV058_NEXT_MODULE_INVALID')
  }
  return Object.freeze({ kind, root, certPath, keyPath, ...origin })
}

function suppressUntrustedOutput() {
  if (outputSilenced) return
  outputSilenced = true
  const discard = (_chunk, encoding, callback) => {
    const settled = typeof encoding === 'function' ? encoding : callback
    settled?.()
    return true
  }
  process.stdout.write = discard
  process.stderr.write = discard
}

function restoreOutput() {
  if (!outputSilenced) return
  process.stdout.write = outputWrite
  process.stderr.write = errorWrite
  outputSilenced = false
}

function taskDistDir(root, kind) {
  const configured = kind === 'ai-pdm' ? process.env.PDM_NEXT_DIST_DIR?.trim() : null
  const relative = configured || `.tmp/dev058-${kind}-${process.pid}`
  if (path.isAbsolute(relative)) throw fail('DEV058_NEXT_DIST_DIR_INVALID')
  const resolved = path.resolve(root, relative)
  const tempRoot = path.resolve(root, '.tmp')
  if (!samePath(resolved, tempRoot) && !resolved.toLowerCase().startsWith(`${tempRoot.toLowerCase()}${path.sep}`)) {
    throw fail('DEV058_NEXT_DIST_DIR_INVALID')
  }
  return Object.freeze({ relative: path.relative(root, resolved).replaceAll('\\', '/'), resolved })
}

function taskCleanupPath(root, candidate, existedBefore) {
  const tempRoot = path.resolve(root, '.tmp')
  if (existedBefore || !samePath(candidate, tempRoot) && !candidate.toLowerCase().startsWith(`${tempRoot.toLowerCase()}${path.sep}`)) return null
  return candidate
}

async function listenHttps(server, host, port) {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

async function closeNodeServer(server) {
  if (!server) return
  await new Promise((resolve, reject) => {
    if (!server.listening) return resolve()
    server.close((error) => error ? reject(error) : resolve())
  })
}

export function restoreGeneratedFileIfUnchanged(filePath, beforeBytes, generatedBytes) {
  let currentBytes
  try {
    currentBytes = fs.readFileSync(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
  if (!currentBytes.equals(generatedBytes)) return false
  if (!currentBytes.equals(beforeBytes)) fs.writeFileSync(filePath, beforeBytes)
  return true
}

async function loadNextRuntime(input) {
  phase = 'next-modules'
  const nextRoot = path.join(input.root, 'node_modules', 'next')
  const nextModule = await import(pathToFileURL(path.join(nextRoot, 'dist', 'server', 'next.js')).href)
  const configModule = await import(pathToFileURL(path.join(nextRoot, 'dist', 'server', 'config.js')).href)
  const constantsModule = await import(pathToFileURL(path.join(nextRoot, 'dist', 'shared', 'lib', 'constants.js')).href)
  const dist = taskDistDir(input.root, input.kind)
  const distExisted = fs.existsSync(dist.resolved)
  const nextEnvPath = path.join(input.root, 'next-env.d.ts')
  const nextEnvBefore = fs.readFileSync(nextEnvPath)
  const tsconfigPath = path.join(input.root, 'tsconfig.json')
  const tsconfigBefore = fs.readFileSync(tsconfigPath)
  const loadConfig = configModule.default.default ?? configModule.default
  phase = 'next-config'
  const conf = await loadConfig(constantsModule.PHASE_DEVELOPMENT_SERVER, input.root, { silent: true })
  const configuredLogging = conf.logging && typeof conf.logging === 'object' ? conf.logging : {}
  // Next 16's custom server reuses loadConfig's cached object and ignores the
  // factory `conf` option in development. Set only task cache/logging options
  // on that same config before prepare; authentication and routes are intact.
  Object.assign(conf, {
    distDir: dist.relative,
    logging: {
      ...configuredLogging,
      incomingRequests: false,
      serverFunctions: false,
      browserToTerminal: false,
    },
  })
  const nextApp = nextModule.default({
    dev: true,
    dir: input.root,
    hostname: input.host,
    port: input.port,
    conf,
    webpack: true,
  })
  phase = 'next-handler'
  const requestHandler = nextApp.getRequestHandler()
  phase = 'next-prepare'
  await nextApp.prepare()
  const applied = await loadConfig(constantsModule.PHASE_DEVELOPMENT_SERVER, input.root, { silent: true })
  if (applied.distDir !== dist.relative || applied.logging?.incomingRequests !== false || applied.logging?.browserToTerminal !== false) {
    await nextApp.close()
    throw fail('DEV058_NEXT_CONFIG_NOT_APPLIED')
  }
  const nextEnvGenerated = fs.readFileSync(nextEnvPath)
  const tsconfigGenerated = fs.readFileSync(tsconfigPath)
  const upgradeHandler = nextApp.getUpgradeHandler()
  phase = 'next-https'
  const httpsServer = https.createServer({ cert: fs.readFileSync(input.certPath), key: fs.readFileSync(input.keyPath) }, (request, response) => {
    void requestHandler(request, response).catch(() => {
      if (!response.writableEnded) response.destroy()
    })
  })
  httpsServer.on('upgrade', (request, socket, head) => {
    void upgradeHandler(request, socket, head).catch(() => socket.destroy())
  })
  try {
    await listenHttps(httpsServer, input.host, input.port)
  } catch (error) {
    await nextApp.close().catch(() => undefined)
    throw error
  }
  return Object.freeze({
    server: httpsServer,
    close: async () => {
      await nextApp.close()
      httpsServer.closeAllConnections?.()
      await closeNodeServer(httpsServer)
      restoreGeneratedFileIfUnchanged(nextEnvPath, nextEnvBefore, nextEnvGenerated)
      restoreGeneratedFileIfUnchanged(tsconfigPath, tsconfigBefore, tsconfigGenerated)
      const cleanup = taskCleanupPath(input.root, dist.resolved, distExisted)
      if (cleanup) await fs.promises.rm(cleanup, { recursive: true, force: true })
    },
  })
}

async function loadOrgmasterRuntime(input) {
  phase = 'vite-prepare'
  const viteModule = await import(pathToFileURL(path.join(input.root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  const server = await viteModule.createServer({
    root: input.root,
    configFile: path.join(input.root, 'vite.config.ts'),
    server: {
      https: { cert: fs.readFileSync(input.certPath), key: fs.readFileSync(input.keyPath) },
      host: input.host,
      port: input.port,
      strictPort: true,
    },
  })
  try {
    await server.listen()
  } catch (error) {
    await server.close().catch(() => undefined)
    throw error
  }
  return Object.freeze({ close: () => server.close() })
}

async function stop(reason) {
  if (stopReason) return stopInFlight ?? stopPromise
  stopReason = reason
  emit('stop', { reason })
  stopInFlight = (async () => {
    try {
      await runtime?.close?.()
    } catch (error) {
      exitCode = 1
      emit('error', { code: 'APP_SHUTDOWN_FAILED' })
      void error
    } finally {
      stopPromiseResolve()
    }
  })()
  return stopInFlight
}

function installStopHandlers() {
  process.once('SIGTERM', () => { void stop('SIGTERM') })
  process.once('SIGINT', () => { void stop('SIGINT') })
  if (typeof process.send === 'function') {
    process.on('message', (message) => {
      if (message === 'stop' || message?.type === 'stop') void stop('IPC')
    })
  }
  process.once('uncaughtException', (error) => {
    exitCode = 1
    emit('error', { code: safeErrorCode(error), phase, errorName: /^[A-Za-z]+$/u.test(error?.name ?? '') ? error.name : 'Error',
      frames: String(error?.stack ?? '').split('\n').slice(1).filter(line => /(?:\.m?js|\.ts):\d+:\d+\)?$/u.test(line)).slice(0, 4) })
    void stop('uncaughtException')
  })
  process.once('unhandledRejection', (error) => {
    exitCode = 1
    emit('error', { code: safeErrorCode(error) })
    void stop('unhandledRejection')
  })
}

async function main() {
  let input
  try {
    input = readLaunchInput()
    suppressUntrustedOutput()
    emit('owner', { owner: 'dev058-local-sso-app', appKind: input.kind, pid: process.pid, port: input.port })
    installStopHandlers()
    process.env.NEXT_TELEMETRY_DISABLED = '1'
    runtime = input.kind === 'orgmaster' ? await loadOrgmasterRuntime(input) : await loadNextRuntime(input)
    if (stopReason) await runtime.close()
    else {
      emit('listening', { appKind: input.kind, pid: process.pid, port: input.port })
      await stopPromise
    }
  } catch (error) {
    exitCode = 1
    suppressUntrustedOutput()
    emit('error', { code: safeErrorCode(error), phase, errorName: /^[A-Za-z]+$/u.test(error?.name ?? '') ? error.name : 'Error',
      frames: String(error?.stack ?? '').split('\n').slice(1).filter(line => /(?:\.m?js|\.ts):\d+:\d+\)?$/u.test(line)).slice(0, 4) })
    await stop('startup-failure')
  } finally {
    if (runtime && !stopReason) await stop('shutdown')
    restoreOutput()
    emit('exit', { appKind: input?.kind ?? null, pid: process.pid, code: exitCode })
    if (process.connected) process.disconnect()
  }
  process.exitCode = exitCode
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main()
}
