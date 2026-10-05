import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { resolvePostgresBin, supportsServerVersion } from './dev047-postgres-qc-contract.mjs'

const TASK_ROOT_PREFIX = 'orgmaster-dev014-disposable-pg-'
const ALLOWED_TARGET_CLASS = 'task-owned-local'
const LOCALHOST = '127.0.0.1'
const PG_COMMAND_TIMEOUT_MS = 120_000
const PORT_RELEASE_ATTEMPTS = 20
const PORT_RELEASE_DELAY_MS = 50

function codedError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = code
  return error
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function normalizeVersion(output) {
  const match = String(output ?? '').match(/PostgreSQL\)\s*(\d+(?:\.\d+)?)/iu)
  return match?.[1] ?? null
}

function postgresEnvironment(source, tempRoot) {
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext'])
  const env = {}
  for (const [key, value] of Object.entries(source ?? {})) {
    if (allowed.has(key.toLowerCase()) && typeof value === 'string') env[key] = value
  }
  env.TEMP = tempRoot
  env.TMP = tempRoot
  return env
}

function assertTaskRoot(taskRoot, tempRoot, deps) {
  if (typeof taskRoot !== 'string' || typeof tempRoot !== 'string') return false
  const absoluteRoot = path.resolve(taskRoot)
  const absoluteTemp = path.resolve(tempRoot)
  if (!samePath(path.dirname(absoluteRoot), absoluteTemp) ||
      !new RegExp(`^${TASK_ROOT_PREFIX}[a-z0-9_-]{1,80}$`, 'iu').test(path.basename(absoluteRoot))) return false
  try {
    if (!deps.existsSync(absoluteRoot)) return false
    const realTemp = deps.realpathSync(absoluteTemp)
    const realRoot = deps.realpathSync(absoluteRoot)
    if (!samePath(path.dirname(realRoot), realTemp) || !samePath(path.basename(realRoot), path.basename(absoluteRoot))) return false
    const cluster = path.join(absoluteRoot, 'cluster')
    if (deps.existsSync(cluster)) {
      const realCluster = deps.realpathSync(cluster)
      if (!samePath(path.dirname(realCluster), realRoot) || !samePath(path.basename(realCluster), 'cluster')) return false
    }
    return true
  } catch {
    return false
  }
}

async function reserveLocalPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, LOCALHOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function isLocalPortReleased(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: LOCALHOST, port })
    socket.setTimeout(500)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

function readPostmasterPid(dataRoot) {
  const firstLine = fs.readFileSync(path.join(dataRoot, 'postmaster.pid'), 'utf8').split(/\r?\n/u)[0]
  const pid = Number.parseInt(firstLine, 10)
  if (!Number.isSafeInteger(pid) || pid <= 0) throw codedError('DISPOSABLE_POSTGRES_PID_INVALID', 'The task-owned PostgreSQL PID file is invalid.')
  return pid
}

function measureDirectoryBytes(dataRoot) {
  const root = path.resolve(dataRoot)
  const rootStat = fs.lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw codedError('DISPOSABLE_POSTGRES_DATA_ROOT_INVALID', 'The owned PostgreSQL data root is not a real directory.')
  }
  const pending = [root]
  let total = 0
  while (pending.length) {
    const directory = pending.pop()
    for (const name of fs.readdirSync(directory)) {
      const entryPath = path.join(directory, name)
      const entryStat = fs.lstatSync(entryPath)
      if (entryStat.isDirectory() && !entryStat.isSymbolicLink()) {
        pending.push(entryPath)
      } else if (entryStat.isFile() || entryStat.isSymbolicLink()) {
        total += entryStat.size
        if (!Number.isSafeInteger(total)) {
          throw codedError('DISPOSABLE_POSTGRES_DATA_ROOT_SIZE_INVALID', 'The owned PostgreSQL data root size exceeds the safe integer range.')
        }
      } else {
        throw codedError('DISPOSABLE_POSTGRES_DATA_ROOT_ENTRY_UNSUPPORTED', 'The owned PostgreSQL data root contains an unsupported filesystem entry.')
      }
    }
  }
  return total
}

function validateStartOptions(options, environment) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw codedError('DISPOSABLE_POSTGRES_OPTIONS_INVALID', 'Expected a task-owned disposable PostgreSQL options object.')
  }
  const externalTargetKeys = new Set(['connectionString', 'databaseUrl', 'databaseURL', 'databaseName', 'database', 'url', 'host', 'port', 'user', 'password', 'ssl', 'client', 'dataRoot', 'taskRoot', 'target'])
  const unsupported = Object.keys(options).filter((key) => !['targetClass', 'purpose', 'bootstrap'].includes(key))
  if (unsupported.some((key) => externalTargetKeys.has(key))) {
    throw codedError('DISPOSABLE_POSTGRES_EXTERNAL_TARGET_REJECTED', 'External database and caller-selected target fields are not accepted.')
  }
  if (unsupported.length) throw codedError('DISPOSABLE_POSTGRES_OPTIONS_INVALID', `Unsupported options: ${unsupported.join(', ')}`)
  const targetClass = options.targetClass ?? environment?.DEV014_DISPOSABLE_POSTGRES_TARGET_CLASS ?? ALLOWED_TARGET_CLASS
  if (targetClass !== ALLOWED_TARGET_CLASS) {
    throw codedError('DISPOSABLE_POSTGRES_EXTERNAL_TARGET_REJECTED', 'Only task-owned-local PostgreSQL targets are accepted.')
  }
  const purpose = options.purpose ?? 'DEV-014 disposable PostgreSQL fixture'
  if (typeof purpose !== 'string' || !purpose.trim() || purpose.length > 160) {
    throw codedError('DISPOSABLE_POSTGRES_OPTIONS_INVALID', 'Purpose must be a non-empty short label.')
  }
  if (options.bootstrap !== undefined && typeof options.bootstrap !== 'function') {
    throw codedError('DISPOSABLE_POSTGRES_OPTIONS_INVALID', 'Optional bootstrap must be a caller function.')
  }
  return { purpose: purpose.trim(), bootstrap: options.bootstrap }
}

export function createDisposablePostgresManager(overrides = {}) {
  const deps = {
    environment: overrides.environment ?? process.env,
    tempDir: overrides.tempDir ?? (() => os.tmpdir()),
    mkdtempSync: overrides.mkdtempSync ?? fs.mkdtempSync,
    existsSync: overrides.existsSync ?? fs.existsSync,
    realpathSync: overrides.realpathSync ?? fs.realpathSync,
    removeTaskRoot: overrides.removeTaskRoot ?? ((root) => fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 })),
    spawnSync: overrides.spawnSync ?? spawnSync,
    resolvePostgresBin: overrides.resolvePostgresBin ?? ((environment) => resolvePostgresBin(environment)),
    supportsServerVersion: overrides.supportsServerVersion ?? supportsServerVersion,
    allocatePort: overrides.allocatePort ?? reserveLocalPort,
    isPortReleased: overrides.isPortReleased ?? isLocalPortReleased,
    readPostmasterPid: overrides.readPostmasterPid ?? readPostmasterPid,
    measureDataRootBytes: overrides.measureDataRootBytes ?? measureDirectoryBytes,
    createClient: overrides.createClient ?? ((config) => new pg.Client(config)),
    processId: overrides.processId ?? (() => process.pid),
    sleep: overrides.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  }
  const ownedHandles = new WeakMap()

  function command(state, binary, args, { stdio } = {}) {
    const result = deps.spawnSync(binary, args, {
      cwd: state.taskRoot ?? state.tempRoot,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout: PG_COMMAND_TIMEOUT_MS,
      env: postgresEnvironment(deps.environment, state.taskRoot ?? state.tempRoot),
      maxBuffer: 4 * 1024 * 1024,
      ...(stdio === undefined ? {} : { stdio }),
    })
    if (result?.error) throw codedError('DISPOSABLE_POSTGRES_COMMAND_FAILED', `${path.basename(binary)} could not run.`, result.error)
    if (result?.status !== 0) {
      const detail = String(result?.stderr || result?.stdout || result?.signal || 'unknown failure').trim()
      throw codedError('DISPOSABLE_POSTGRES_COMMAND_FAILED', `${path.basename(binary)} failed: ${detail}`)
    }
    return result
  }

  function pathConfined(state) {
    if (!state.taskRoot) return true
    if (!assertTaskRoot(state.taskRoot, state.tempRoot, deps)) return false
    return samePath(state.dataRoot, path.join(state.taskRoot, 'cluster'))
  }

  async function waitUntilPortReleased(port) {
    for (let attempt = 0; attempt < PORT_RELEASE_ATTEMPTS; attempt++) {
      if (await deps.isPortReleased(port)) return true
      if (attempt + 1 < PORT_RELEASE_ATTEMPTS) await deps.sleep(PORT_RELEASE_DELAY_MS)
    }
    return false
  }

  async function cleanupState(state) {
    const cleanup = {
      clientClosed: !state.client || state.clientClosed,
      clusterStopped: !state.startAttempted,
      portReleased: state.port === null || state.port === undefined,
      tempRemoved: !state.taskRoot,
      pathConfined: true,
      dataRootBytes: null,
      dataRootMeasured: false,
    }
    if (state.client && !state.clientClosed) {
      try { await state.client.end(); state.clientClosed = true } catch { state.clientClosed = false }
      cleanup.clientClosed = state.clientClosed
    }
    if (!pathConfined(state)) {
      cleanup.pathConfined = false
      cleanup.clusterStopped = !state.startAttempted
      cleanup.portReleased = state.port === null || state.port === undefined
      cleanup.tempRemoved = !state.taskRoot
      cleanup.dataRootBytes = state.finalDataRootBytes ?? null
      cleanup.dataRootMeasured = state.dataRootMeasuredAfterStop
      return cleanup
    }
    if (state.startAttempted) {
      let pidMatches = true
      if (state.serverPid !== null) {
        try {
          const currentPid = deps.readPostmasterPid(state.dataRoot)
          if (currentPid !== null && currentPid !== undefined && currentPid !== state.serverPid) pidMatches = false
        } catch { /* A missing PID file is safe to verify through the private port and exact PGDATA. */ }
      }
      let stopSucceeded = false
      if (pidMatches) {
        try {
          const result = command(state, path.join(state.postgresBin, 'pg_ctl.exe'), ['-D', state.dataRoot, '-m', 'fast', '-w', 'stop'])
          stopSucceeded = result.status === 0
        } catch { stopSucceeded = false }
      }
      cleanup.portReleased = state.port === null || state.port === undefined
        ? true
        : await waitUntilPortReleased(state.port)
      cleanup.clusterStopped = stopSucceeded || (pidMatches && cleanup.portReleased)
    } else {
      cleanup.clusterStopped = true
      cleanup.portReleased = state.port === null || state.port === undefined
        ? true
        : await waitUntilPortReleased(state.port)
    }
    if (cleanup.pathConfined && cleanup.clusterStopped && cleanup.portReleased) {
      try {
        state.finalDataRootBytes = state.dataRoot && deps.existsSync(state.dataRoot)
          ? deps.measureDataRootBytes(state.dataRoot)
          : 0
        if (!Number.isSafeInteger(state.finalDataRootBytes) || state.finalDataRootBytes < 0) {
          throw codedError('DISPOSABLE_POSTGRES_DATA_ROOT_SIZE_INVALID', 'The owned PostgreSQL data root byte measurement is invalid.')
        }
        state.dataRootMeasuredAfterStop = true
      } catch {
        state.finalDataRootBytes = null
        state.dataRootMeasuredAfterStop = false
      }
    }
    cleanup.dataRootBytes = state.dataRootMeasuredAfterStop ? state.finalDataRootBytes : null
    cleanup.dataRootMeasured = state.dataRootMeasuredAfterStop
    if (cleanup.pathConfined && cleanup.clientClosed && cleanup.clusterStopped && cleanup.portReleased && cleanup.dataRootMeasured && state.taskRoot) {
      try {
        deps.removeTaskRoot(state.taskRoot)
        cleanup.tempRemoved = !deps.existsSync(state.taskRoot)
      } catch { cleanup.tempRemoved = false }
    }
    if (cleanup.pathConfined && cleanup.clientClosed && cleanup.clusterStopped && cleanup.portReleased && cleanup.dataRootMeasured && !state.taskRoot) {
      cleanup.tempRemoved = true
    }
    state.lastCleanup = cleanup
    return cleanup
  }

  /**
   * `bootstrap` is opt-in and receives only this task-owned client. Callers may
   * create synthetic owner/runtime/migrator schemas and versioned contract
   * fixtures there. This helper never discovers or applies repository migrations.
   */
  async function startDisposablePostgres(options = {}) {
    const { purpose, bootstrap } = validateStartOptions(options, deps.environment)
    const state = {
      purpose,
      tempRoot: null,
      taskRoot: null,
      dataRoot: null,
      postgresBin: null,
      port: null,
      client: null,
      clientClosed: false,
      processId: null,
      serverPid: null,
      serverVersion: null,
      targetClass: ALLOWED_TARGET_CLASS,
      host: LOCALHOST,
      databaseName: null,
      finalDataRootBytes: null,
      dataRootMeasuredAfterStop: false,
      startAttempted: false,
      lastCleanup: null,
    }
    try {
      const runtime = deps.resolvePostgresBin(deps.environment)
      if (!runtime?.ok || typeof runtime.bin !== 'string' || !path.isAbsolute(runtime.bin)) {
        throw codedError(runtime?.reasonCode ?? 'POSTGRES_RUNTIME_MISSING', runtime?.detail ?? 'Native PostgreSQL 17/18 binaries were not found.')
      }
      state.postgresBin = path.resolve(runtime.bin)
      state.tempRoot = path.resolve(deps.tempDir())
      const binaryVersionOutput = command(state, path.join(state.postgresBin, 'pg_ctl.exe'), ['--version'])
      const binaryVersion = normalizeVersion(binaryVersionOutput.stdout)
      if (!binaryVersion || !deps.supportsServerVersion(binaryVersion)) {
        throw codedError('POSTGRES_VERSION_UNSUPPORTED', `PostgreSQL 17 or 18 is required; got ${binaryVersion ?? 'unknown'}.`)
      }
      state.taskRoot = deps.mkdtempSync(path.join(state.tempRoot, TASK_ROOT_PREFIX))
      if (!assertTaskRoot(state.taskRoot, state.tempRoot, deps)) {
        throw codedError('DISPOSABLE_POSTGRES_PATH_NOT_TASK_OWNED', 'Temporary data root escaped the OS task temp directory.')
      }
      state.dataRoot = path.join(state.taskRoot, 'cluster')
      state.port = await deps.allocatePort()
      if (!Number.isSafeInteger(state.port) || state.port < 1024 || state.port > 65535) {
        throw codedError('DISPOSABLE_POSTGRES_PORT_INVALID', 'The local port allocator returned an invalid port.')
      }
      const logPath = path.join(state.taskRoot, 'postgres.log')
      command(state, path.join(state.postgresBin, 'initdb.exe'), ['-D', state.dataRoot, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
      state.startAttempted = true
      const serverOptions = [
        `-p ${state.port}`,
        '-h 127.0.0.1',
        '-c max_connections=8',
        '-c shared_buffers=16MB',
        '-c max_wal_size=64MB',
        '-c min_wal_size=32MB',
        '-c wal_keep_size=0',
      ].join(' ')
      command(state, path.join(state.postgresBin, 'pg_ctl.exe'), ['-D', state.dataRoot, '-l', logPath, '-o', serverOptions, '-w', 'start'], { stdio: 'ignore' })
      state.serverPid = deps.readPostmasterPid(state.dataRoot)
      if (!Number.isSafeInteger(state.serverPid) || state.serverPid <= 0) {
        throw codedError('DISPOSABLE_POSTGRES_PID_INVALID', 'The task-owned PostgreSQL process PID could not be verified.')
      }
      state.databaseName = `dev014_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
      command(state, path.join(state.postgresBin, 'createdb.exe'), ['-h', LOCALHOST, '-p', String(state.port), '-U', 'postgres', state.databaseName])
      state.client = deps.createClient({ host: state.host, port: state.port, database: state.databaseName, user: 'postgres', application_name: 'orgmaster-dev014-disposable-pg' })
      await state.client.connect()
      const serverVersion = String((await state.client.query('SHOW server_version')).rows?.[0]?.server_version ?? '')
      if (!deps.supportsServerVersion(serverVersion) || Number.parseInt(serverVersion, 10) !== Number.parseInt(binaryVersion, 10)) {
        throw codedError('POSTGRES_VERSION_UNSUPPORTED', `PostgreSQL 17 or 18 is required and must match its binaries; got ${serverVersion || 'unknown'}.`)
      }
      state.serverVersion = serverVersion
      if (bootstrap) {
        await bootstrap(Object.freeze({ client: state.client, purpose, serverVersion, targetClass: state.targetClass, host: state.host, databaseName: state.databaseName, port: state.port, dataRoot: state.dataRoot }))
      }
      const handle = Object.freeze({
        process: Object.freeze({ pid: state.serverPid, command: path.join(state.postgresBin, 'postgres.exe'), ownerProcessId: deps.processId() }),
        targetClass: state.targetClass,
        host: state.host,
        taskRoot: state.taskRoot,
        dataRoot: state.dataRoot,
        port: state.port,
        databaseName: state.databaseName,
        client: state.client,
        serverVersion: state.serverVersion,
        measureDataRootBytes: () => measureOwnedDataRootBytes(handle),
        cleanup: () => stopDisposablePostgres(handle),
      })
      ownedHandles.set(handle, state)
      return handle
    } catch (error) {
      const cleanup = await cleanupState(state)
      if (error && typeof error === 'object') error.cleanup = cleanup
      throw error
    }
  }

  async function stopDisposablePostgres(handle) {
    const state = ownedStateForHandle(handle, 'stopped')
    if (state.lastCleanup && state.lastCleanup.clientClosed && state.lastCleanup.clusterStopped && state.lastCleanup.portReleased && state.lastCleanup.tempRemoved) {
      return state.lastCleanup
    }
    return await cleanupState(state)
  }

  function measureOwnedDataRootBytes(handle) {
    const state = ownedStateForHandle(handle, 'measured')
    if (state.dataRootMeasuredAfterStop) return state.finalDataRootBytes
    if (!state.dataRoot || !pathConfined(state)) {
      throw codedError('DISPOSABLE_POSTGRES_PATH_NOT_TASK_OWNED', 'The owned PostgreSQL data root is unavailable or escaped its task temp directory.')
    }
    try {
      if (!deps.existsSync(state.dataRoot)) return 0
      const bytes = deps.measureDataRootBytes(state.dataRoot)
      if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw codedError('DISPOSABLE_POSTGRES_DATA_ROOT_SIZE_INVALID', 'The owned PostgreSQL data root byte measurement is invalid.')
      }
      return bytes
    } catch (error) {
      if (error?.code?.startsWith('DISPOSABLE_POSTGRES_')) throw error
      throw codedError('DISPOSABLE_POSTGRES_DATA_ROOT_MEASURE_FAILED', 'The owned PostgreSQL data root could not be measured.', error)
    }
  }

  function ownedStateForHandle(handle, action) {
    const state = handle && typeof handle === 'object' ? ownedHandles.get(handle) : null
    if (!state) throw codedError('DISPOSABLE_POSTGRES_HANDLE_NOT_OWNED', `Only the exact task-owned handle returned by this manager can be ${action}.`)
    const validDatabaseName = typeof handle.databaseName === 'string' && /^dev014_[a-f0-9]{20}$/u.test(handle.databaseName)
    if (handle.targetClass !== ALLOWED_TARGET_CLASS || handle.targetClass !== state.targetClass ||
        handle.host !== LOCALHOST || handle.host !== state.host ||
        handle.databaseName !== state.databaseName || !validDatabaseName ||
        handle.port !== state.port || handle.taskRoot !== state.taskRoot || handle.dataRoot !== state.dataRoot ||
        handle.client !== state.client || handle.process?.pid !== state.serverPid) {
      throw codedError('DISPOSABLE_POSTGRES_HANDLE_TARGET_REJECTED', 'The disposable PostgreSQL handle target metadata does not match its task-owned instance.')
    }
    return state
  }

  return Object.freeze({ startDisposablePostgres, stopDisposablePostgres })
}

const defaultManager = createDisposablePostgresManager()
export const startDisposablePostgres = (...args) => defaultManager.startDisposablePostgres(...args)
export const stopDisposablePostgres = (...args) => defaultManager.stopDisposablePostgres(...args)
