import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDisposablePostgresManager } from './dev014-disposable-postgres.mjs'
import { buildSyntheticCapacityPopulation } from './dev014-lifecycle-postgres-fixture.mjs'

test('synthetic capacity population has complete, unique Principal and Directory identities', () => {
  const identities = buildSyntheticCapacityPopulation()
  assert.equal(identities.length, 500)
  assert.equal(Object.isFrozen(identities), true)
  assert.ok(identities.every(Object.isFrozen))
  for (const [index, identity] of identities.entries()) {
    const ordinal = String(index + 1).padStart(4, '0')
    assert.match(identity.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u)
    assert.equal(identity.principal, 'principal-managed:' + identity.id)
    assert.equal(identity.employeeId, 'employee-capacity-' + ordinal)
    assert.equal(identity.email, 'capacity-' + ordinal + '@example.test')
    assert.equal(identity.directoryCustomerId, 'capacity-customer-synthetic')
    assert.equal(identity.directoryUserId, 'capacity-user-' + ordinal)
  }
  for (const key of ['id', 'principal', 'employeeId', 'email', 'directoryUserId']) {
    assert.equal(new Set(identities.map((identity) => identity[key])).size, 500, key + ' must be unique')
  }
})

function fixture({ binaryVersion = '17.6', serverVersion = '17.6', escapeTaskRoot = false, badTaskRoot = false, ports = [43017, 43018] } = {}) {
  const tempRoot = path.resolve(os.tmpdir())
  const directories = new Set([tempRoot])
  const dataRoots = new Set()
  const taskRoots = []
  const removedRoots = []
  const calls = []
  const clients = []
  const activePorts = new Set()
  const portByDataRoot = new Map()
  const pidByDataRoot = new Map()
  const bytesByDataRoot = new Map()
  let portIndex = 0
  let pid = 84000
  let escapeRootNow = escapeTaskRoot

  const dependencies = {
    environment: {},
    tempDir: () => tempRoot,
    resolvePostgresBin: () => ({ ok: true, bin: path.resolve('C:\\Program Files\\PostgreSQL\\17\\bin') }),
    supportsServerVersion: (version) => [17, 18].includes(Number.parseInt(String(version), 10)),
    spawnSync(binary, args, options) {
      calls.push({ binary, args: [...args], options })
      if (args[0] === '--version') return { status: 0, stdout: `pg_ctl (PostgreSQL) ${binaryVersion}\n`, stderr: '' }
      if (path.basename(binary).toLowerCase() === 'initdb.exe') {
        const dataRoot = path.resolve(args[args.indexOf('-D') + 1])
        directories.add(dataRoot)
        dataRoots.add(dataRoot)
      }
      if (path.basename(binary).toLowerCase() === 'pg_ctl.exe' && args.at(-1) === 'start') {
        const dataRoot = path.resolve(args[args.indexOf('-D') + 1])
        const launchOptions = args[args.indexOf('-o') + 1]
        const selectedPort = Number(launchOptions.match(/-p\s+(\d+)/u)?.[1])
        activePorts.add(selectedPort)
        portByDataRoot.set(dataRoot, selectedPort)
        pidByDataRoot.set(dataRoot, ++pid)
      }
      if (path.basename(binary).toLowerCase() === 'pg_ctl.exe' && args.at(-1) === 'stop') {
        const dataRoot = path.resolve(args[args.indexOf('-D') + 1])
        activePorts.delete(portByDataRoot.get(dataRoot))
      }
      return { status: 0, stdout: '', stderr: '' }
    },
    mkdtempSync(prefix) {
      const root = badTaskRoot
        ? path.resolve(prefix, '..', 'not-task-owned')
        : `${prefix}fixture-${taskRoots.length + 1}`
      taskRoots.push(root)
      if (!badTaskRoot) directories.add(path.resolve(root))
      return root
    },
    existsSync(value) { return directories.has(path.resolve(value)) },
    realpathSync(value) {
      const absolute = path.resolve(value)
      const root = taskRoots.find((candidate) => path.resolve(candidate) === absolute)
      if (root && escapeRootNow) return path.resolve(tempRoot, '..', 'escaped-task-root')
      if (directories.has(absolute)) return absolute
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    removeTaskRoot(root) {
      removedRoots.push(root)
      const absolute = path.resolve(root)
      directories.delete(absolute)
      for (const value of [...directories]) if (value.startsWith(`${absolute}${path.sep}`)) directories.delete(value)
    },
    allocatePort: async () => ports[portIndex++],
    isPortReleased: async (port) => !activePorts.has(port),
    readPostmasterPid(dataRoot) { return pidByDataRoot.get(path.resolve(dataRoot)) ?? null },
    measureDataRootBytes(dataRoot) { return bytesByDataRoot.get(path.resolve(dataRoot)) ?? 0 },
    createClient({ host, port, database, user, application_name }) {
      const client = {
        host,
        port,
        database,
        user,
        connectionString: `postgresql://${user}@${host}:${port}/${database}`,
        application_name,
        connected: false,
        ended: false,
        queries: [],
        async connect() { this.connected = true },
        async query(sql) { this.queries.push(sql); return { rows: [{ server_version: serverVersion }] } },
        async end() { this.ended = true },
      }
      clients.push(client)
      return client
    },
    processId: () => 9100,
    sleep: async () => {},
  }
  return {
    dependencies, tempRoot, directories, calls, clients, removedRoots, taskRoots, dataRoots,
    setEscapeTaskRoot: (value) => { escapeRootNow = value },
    setPostmasterPid: (dataRoot, value) => pidByDataRoot.set(path.resolve(dataRoot), value),
    setDataRootBytes: (dataRoot, value) => bytesByDataRoot.set(path.resolve(dataRoot), value),
  }
}

test('module import and manager construction do not start PostgreSQL', async () => {
  const f = fixture()
  createDisposablePostgresManager(f.dependencies)
  assert.equal(f.calls.length, 0)
  assert.equal(f.taskRoots.length, 0)

  const previous = process.env.DEV047_POSTGRES_BIN
  process.env.DEV047_POSTGRES_BIN = path.join(f.tempRoot, 'missing-native-postgres-binaries')
  try {
    const freshModule = new URL(`./dev014-disposable-postgres.mjs?import-side-effect=${Date.now()}`, import.meta.url)
    const imported = await import(freshModule.href)
    assert.equal(typeof imported.startDisposablePostgres, 'function')
    assert.equal(typeof imported.stopDisposablePostgres, 'function')
  } finally {
    if (previous === undefined) delete process.env.DEV047_POSTGRES_BIN
    else process.env.DEV047_POSTGRES_BIN = previous
  }
})

test('rejects external database and non-task-owned targets before creating a temp root', async () => {
  const f = fixture()
  const manager = createDisposablePostgresManager(f.dependencies)
  await assert.rejects(manager.startDisposablePostgres({ connectionString: 'postgresql://remote/prod' }), { code: 'DISPOSABLE_POSTGRES_EXTERNAL_TARGET_REJECTED' })
  await assert.rejects(manager.startDisposablePostgres({ databaseName: 'production' }), { code: 'DISPOSABLE_POSTGRES_EXTERNAL_TARGET_REJECTED' })
  await assert.rejects(manager.startDisposablePostgres({ targetClass: 'managed-production' }), { code: 'DISPOSABLE_POSTGRES_EXTERNAL_TARGET_REJECTED' })
  assert.equal(f.taskRoots.length, 0)
  assert.equal(f.calls.length, 0)
})

test('rejects non-17/18 native PostgreSQL binaries before initializing data', async () => {
  const f = fixture({ binaryVersion: '16.9' })
  const manager = createDisposablePostgresManager(f.dependencies)
  await assert.rejects(manager.startDisposablePostgres(), { code: 'POSTGRES_VERSION_UNSUPPORTED' })
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0].args, ['--version'])
  assert.equal(f.taskRoots.length, 0)
  assert.equal(f.clients.length, 0)
})

test('starts independent localhost PG17/18 fixtures and cleans only their task roots', async () => {
  const f = fixture()
  const manager = createDisposablePostgresManager(f.dependencies)
  const first = await manager.startDisposablePostgres({ purpose: 'synthetic contract fixture' })
  const second = await manager.startDisposablePostgres()
  f.setDataRootBytes(first.dataRoot, 4321)
  f.setDataRootBytes(second.dataRoot, 8765)

  assert.equal(first.serverVersion, '17.6')
  assert.equal(first.targetClass, 'task-owned-local')
  assert.equal(first.host, '127.0.0.1')
  assert.match(first.databaseName, /^dev014_[a-f0-9]{20}$/u)
  assert.notEqual(first.databaseName, second.databaseName)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.process), true)
  assert.equal(first.client.host, first.host)
  assert.equal(first.client.port, first.port)
  assert.equal(first.client.database, first.databaseName)
  assert.equal(first.client.user, 'postgres')
  assert.equal(first.process.pid !== second.process.pid, true)
  assert.notEqual(first.dataRoot, second.dataRoot)
  assert.notEqual(first.port, second.port)
  assert.notEqual(first.client, second.client)
  assert.notEqual(first.cleanup, second.cleanup)
  assert.equal(new URL(first.client.connectionString).hostname, '127.0.0.1')
  assert.equal(Number(new URL(first.client.connectionString).port), first.port)
  assert.deepEqual(first.client.queries, ['SHOW server_version'])
  assert.equal(first.measureDataRootBytes(), 4321)
  assert.equal(second.measureDataRootBytes(), 8765)
  assert.equal(f.calls.some((call) => call.args.some((arg) => /migrations?/iu.test(arg))), false)
  const startOptions = f.calls.find((call) => call.args.at(-1) === 'start').args[f.calls.find((call) => call.args.at(-1) === 'start').args.indexOf('-o') + 1]
  for (const fixedSetting of ['-h 127.0.0.1', '-c max_connections=8', '-c shared_buffers=16MB', '-c max_wal_size=64MB', '-c min_wal_size=32MB', '-c wal_keep_size=0']) {
    assert.ok(startOptions.includes(fixedSetting), `expected startup options to include ${fixedSetting}`)
  }

  const firstCleanup = await first.cleanup()
  const secondCleanup = await manager.stopDisposablePostgres(second)
  for (const cleanup of [firstCleanup, secondCleanup]) {
    assert.equal(cleanup.clientClosed, true)
    assert.equal(cleanup.clusterStopped, true)
    assert.equal(cleanup.portReleased, true)
    assert.equal(cleanup.tempRemoved, true)
    assert.equal(cleanup.pathConfined, true)
    assert.equal(cleanup.dataRootMeasured, true)
  }
  assert.equal(firstCleanup.dataRootBytes, 4321)
  assert.equal(secondCleanup.dataRootBytes, 8765)
  assert.deepEqual(new Set(f.removedRoots), new Set([first.taskRoot, second.taskRoot]))
  assert.equal(f.clients.every((client) => client.ended), true)
})

test('ignores stdio only for the long-running pg_ctl start command', async () => {
  const f = fixture()
  const manager = createDisposablePostgresManager(f.dependencies)
  const handle = await manager.startDisposablePostgres()

  const startCall = f.calls.find((call) => path.basename(call.binary).toLowerCase() === 'pg_ctl.exe' && call.args.at(-1) === 'start')
  assert.ok(startCall)
  assert.equal(startCall.options.stdio, 'ignore')
  assert.ok(f.calls.filter((call) => call !== startCall).every((call) => call.options.stdio === undefined))

  await handle.cleanup()
  const stopCall = f.calls.find((call) => path.basename(call.binary).toLowerCase() === 'pg_ctl.exe' && call.args.at(-1) === 'stop')
  assert.ok(stopCall)
  assert.equal(stopCall.options.stdio, undefined)
})

test('calls optional synthetic bootstrap only after local server version verification', async () => {
  const f = fixture({ binaryVersion: '18.3', serverVersion: '18.3' })
  const manager = createDisposablePostgresManager(f.dependencies)
  const seen = []
  const handle = await manager.startDisposablePostgres({
    bootstrap: async (context) => seen.push(context),
  })
  assert.equal(handle.serverVersion, '18.3')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].client, handle.client)
  assert.equal(seen[0].serverVersion, '18.3')
  assert.equal(seen[0].targetClass, 'task-owned-local')
  assert.equal(seen[0].host, '127.0.0.1')
  assert.equal(seen[0].databaseName, handle.databaseName)
  assert.equal(seen[0].purpose, 'DEV-014 disposable PostgreSQL fixture')
  await handle.cleanup()
})

test('refuses an escaped temp root and never stops or removes it', async () => {
  const f = fixture({ badTaskRoot: true })
  const manager = createDisposablePostgresManager(f.dependencies)
  await assert.rejects(manager.startDisposablePostgres(), { code: 'DISPOSABLE_POSTGRES_PATH_NOT_TASK_OWNED' })
  assert.equal(f.calls.some((call) => call.args.at(-1) === 'start' || call.args.at(-1) === 'stop'), false)
  assert.deepEqual(f.removedRoots, [])
})

test('cleanup checks real path confinement before stopping or recursively deleting data', async () => {
  const f = fixture()
  const manager = createDisposablePostgresManager(f.dependencies)
  const handle = await manager.startDisposablePostgres()
  const beforeStopCount = f.calls.filter((call) => call.args.at(-1) === 'stop').length
  f.setEscapeTaskRoot(true)
  assert.throws(() => handle.measureDataRootBytes(), { code: 'DISPOSABLE_POSTGRES_PATH_NOT_TASK_OWNED' })
  const cleanup = await handle.cleanup()
  assert.equal(cleanup.pathConfined, false)
  assert.equal(cleanup.tempRemoved, false)
  assert.equal(cleanup.dataRootMeasured, false)
  assert.equal(f.calls.filter((call) => call.args.at(-1) === 'stop').length, beforeStopCount)
  assert.deepEqual(f.removedRoots, [])
})

test('cleanup keeps task data when the postmaster PID no longer matches', async () => {
  const f = fixture()
  const manager = createDisposablePostgresManager(f.dependencies)
  const handle = await manager.startDisposablePostgres()
  const stopCount = f.calls.filter((call) => call.args.at(-1) === 'stop').length
  f.setPostmasterPid(handle.dataRoot, handle.process.pid + 1)

  const cleanup = await handle.cleanup()
  assert.equal(cleanup.pathConfined, true)
  assert.equal(cleanup.clusterStopped, false)
  assert.equal(cleanup.tempRemoved, false)
  assert.equal(cleanup.dataRootMeasured, false)
  assert.equal(f.calls.filter((call) => call.args.at(-1) === 'stop').length, stopCount)
  assert.deepEqual(f.removedRoots, [])
})

test('rejects a server whose reported version does not match supported native binaries and cleans up', async () => {
  const f = fixture({ binaryVersion: '17.6', serverVersion: '16.9' })
  const manager = createDisposablePostgresManager(f.dependencies)
  await assert.rejects(manager.startDisposablePostgres(), { code: 'POSTGRES_VERSION_UNSUPPORTED' })
  assert.equal(f.clients[0].ended, true)
  assert.equal(f.calls.some((call) => call.args.at(-1) === 'stop'), true)
  assert.equal(f.removedRoots.length, 1)
})

test('measures logical bytes only below the task-owned data root', async () => {
  const taskTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'orgmaster-dev014-measure-test-'))
  const activePorts = new Set()
  const port = 48123
  let pid = 92731
  const manager = createDisposablePostgresManager({
    environment: {},
    tempDir: () => taskTemp,
    resolvePostgresBin: () => ({ ok: true, bin: path.resolve('C:\\fake-postgres\\bin') }),
    allocatePort: async () => port,
    isPortReleased: async (candidate) => !activePorts.has(candidate),
    readPostmasterPid(dataRoot) { return Number.parseInt(fs.readFileSync(path.join(dataRoot, 'postmaster.pid'), 'utf8'), 10) },
    spawnSync(binary, args) {
      if (args[0] === '--version') return { status: 0, stdout: 'pg_ctl (PostgreSQL) 17.6', stderr: '' }
      if (path.basename(binary).toLowerCase() === 'initdb.exe') fs.mkdirSync(args[args.indexOf('-D') + 1], { recursive: true })
      if (path.basename(binary).toLowerCase() === 'pg_ctl.exe' && args.at(-1) === 'start') {
        const dataRoot = args[args.indexOf('-D') + 1]
        fs.writeFileSync(path.join(dataRoot, 'postmaster.pid'), `${pid}\n`)
        activePorts.add(port)
      }
      if (path.basename(binary).toLowerCase() === 'pg_ctl.exe' && args.at(-1) === 'stop') activePorts.delete(port)
      return { status: 0, stdout: '', stderr: '' }
    },
    createClient(config) {
      return {
        ...config,
        async connect() {},
        async query() { return { rows: [{ server_version: '17.6' }] } },
        async end() {},
      }
    },
    processId: () => 9101,
  })
  try {
    const handle = await manager.startDisposablePostgres()
    fs.writeFileSync(path.join(handle.dataRoot, 'top.bin'), Buffer.from([1, 2, 3]))
    fs.mkdirSync(path.join(handle.dataRoot, 'base', 'nested'), { recursive: true })
    fs.writeFileSync(path.join(handle.dataRoot, 'base', 'nested', 'fixture.bin'), Buffer.from([4, 5, 6, 7]))
    const expectedBytes = 3 + 4 + Buffer.byteLength(`${pid}\n`)
    assert.equal(handle.measureDataRootBytes(), expectedBytes)

    const cleanup = await handle.cleanup()
    assert.equal(cleanup.dataRootBytes, expectedBytes)
    assert.equal(cleanup.dataRootMeasured, true)
    assert.equal(cleanup.tempRemoved, true)
  } finally {
    fs.rmSync(taskTemp, { recursive: true, force: true })
  }
})
