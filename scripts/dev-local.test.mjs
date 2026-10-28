import assert from 'node:assert/strict'
import net from 'node:net'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import test from 'node:test'
import path from 'node:path'
import {
  DEFAULT_PORT,
  buildNpmInvocation,
  formatStatus,
  inspectPortOwnership,
  isViteOwnedByWorktree,
  parseArgs,
  resolveNpmCliPath,
  probeLoopbackPort,
  run,
} from './dev-local.mjs'
import { createProcessGuard, extendOwnedTree, snapshotWindowsTree, stopWindowsProcesses } from './dev-local-processes.mjs'

const worktree = path.resolve('C:/VIBE CODING/.worktrees/OrgMaster/dev060-app-permission-provider-20261028')

test('blocks an IPv6-only unknown owner without starting or stopping any process', async t => {
  const server = net.createServer()
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '::1', port: 0, ipv6Only: true }, resolve) })
  } catch (error) { if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) { t.skip('IPv6 loopback is unavailable'); return }; throw error }
  try {
    const result = await inspectPortOwnership({ port: server.address().port, projectRoot: worktree })
    assert.equal(result.state, 'blocked')
    assert.equal(server.listening, true)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('ownership failure cleans the fingerprint-bound spawned tree instead of only npm', async () => {
  const server = createServer((_request, response) => response.end('fixture'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const child = new EventEmitter()
  child.pid = 999999; child.exitCode = null
  let descendantAlive = true, inspections = 0
  child.kill = () => { child.exitCode = 1; child.emit('exit', 1); return true }
  try {
    const code = await run(['--port', String(server.address().port), '--no-browser'], {
      inspectPortOwnership: async ({ port }) => ++inspections === 1 ? { state: 'available', port } : { state: 'blocked', port, owners: [{ pid: process.pid, name: 'test fixture' }] },
      spawn: () => child,
      createProcessGuard: () => ({ captureRoot: async () => {}, stop: async () => { descendantAlive = false; child.kill(); return { remaining: [], portReleased: false } } }),
    })
    assert.equal(code, 1)
    assert.equal(descendantAlive, false)
    assert.equal(server.listening, true, 'unknown owner must stay running')
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('process-tree admission rejects recycled ancestors, old children, and unrelated processes', () => {
  const root = { pid: 10, parentPid: 1, startToken: '100', executable: 'node.exe' }
  const child = { pid: 11, parentPid: 10, startToken: '101', executable: 'cmd.exe' }
  const grandchild = { pid: 12, parentPid: 11, startToken: '102', executable: 'node.exe' }
  const oldChild = { pid: 13, parentPid: 10, startToken: '99', executable: 'node.exe' }
  const unrelated = { pid: 14, parentPid: 99, startToken: '102', executable: 'node.exe' }
  assert.deepEqual([...extendOwnedTree(new Map([[10, root]]), [grandchild, root, child, oldChild, unrelated]).keys()], [10, 11, 12])
  assert.deepEqual([...extendOwnedTree(new Map([[10, root]]), [{ ...root, startToken: '200' }, child, grandchild]).keys()], [10])
})

for (const failure of ['timeout', 'SIGINT', 'SIGTERM']) {
  test(`Windows native cleanup removes npm -> cmd -> Node listener after ${failure}`, { skip: process.platform !== 'win32', timeout: 30_000 }, async () => {
    const temporaryParent = await realpath(os.tmpdir())
    const fixtureRoot = await mkdtemp(path.join(temporaryParent, 'orgmaster-launcher-'))
    assert.equal(path.dirname(fixtureRoot), temporaryParent)
    assert.ok(path.basename(fixtureRoot).startsWith('orgmaster-launcher-'))
    const reservation = net.createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    let child, guard, cleanupResult, listenerPid, readyTimer
    const snapshots = []
    const signals = new EventEmitter()
    let resolveReady, rejectReady
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    // Attach immediately: a fixture launch error must never be unhandled.
    void ready.catch(() => {})
    try {
      await writeFile(path.join(fixtureRoot, 'package.json'), JSON.stringify({ private: true, scripts: { dev: 'node worker.cjs' } }))
      await writeFile(path.join(fixtureRoot, 'worker.cjs'), "require('node:http').createServer((q,r)=>r.end('fixture')).listen(Number(process.argv[2]),'127.0.0.1',()=>console.log('FIXTURE_READY '+process.pid));")
      const code = await run(['--port', String(port), '--no-browser'], {
        inspectPortOwnership: async () => ({ state: 'available', port }),
        signals,
        spawn: () => {
          child = spawn(process.execPath, [resolveNpmCliPath(), '--prefix', fixtureRoot, 'run', 'dev', '--', String(port)], { cwd: fixtureRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
          let output = ''
          child.stdout.on('data', bytes => { output += bytes; const match = /FIXTURE_READY (\d+)/u.exec(output); if (match) { listenerPid = Number(match[1]); resolveReady() } })
          child.on('error', rejectReady)
          readyTimer = setTimeout(() => rejectReady(new Error('Short npm fixture did not become ready.')), 8_000)
          return child
        },
        createProcessGuard: inputs => {
          guard = createProcessGuard({ ...inputs, snapshot: pids => { const rows = snapshotWindowsTree(pids); snapshots.push(...rows); return rows } })
          return { ...guard, stop: async () => { cleanupResult = await guard.stop(); return cleanupResult } }
        },
        waitForStartup: async (_port, _hasExited, refresh) => {
          await ready; clearTimeout(readyTimer)
          await refresh()
          if (failure !== 'timeout') signals.emit(failure)
          return { ok: false, reason: failure }
        },
      })
      assert.equal(code, 1)
      assert.ok(snapshots.some(row => row.pid === child.pid))
      assert.ok(snapshots.some(row => /cmd\.exe$/iu.test(row.executable)), 'real npm shell descendant was captured')
      assert.ok(snapshots.some(row => row.pid === listenerPid), 'real listener fingerprint was captured')
      assert.deepEqual(cleanupResult.remaining, [])
      assert.deepEqual(cleanupResult.errors, [])
      assert.equal(cleanupResult.portReleased, true)
      assert.equal(await probeLoopbackPort(port), true)
      assert.equal(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM'), 0)
    } finally {
      clearTimeout(readyTimer)
      if (guard && !cleanupResult?.portReleased) await guard.stop()
      // This exact mkdtemp result was verified inside the native temporary directory.
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })
}

test('native stop leaves a mismatched process fingerprint untouched', { skip: process.platform !== 'win32' }, () => {
  assert.deepEqual(stopWindowsProcesses([{ pid: process.pid, startToken: '0', executable: process.execPath }]), [])
  assert.equal(process.kill(process.pid, 0), true)
})

test('defaults to port 1010 and accepts the session override with check-only flags', () => {
  assert.equal(parseArgs([]).port, DEFAULT_PORT)
  assert.deepEqual(parseArgs(['--port', '12010', '--no-browser', '--check-only']), {
    port: 12010, noBrowser: true, checkOnly: true, status: false, help: false,
  })
})

test('rejects invalid ports, unknown options, and conflicting report modes', () => {
  assert.throws(() => parseArgs(['--port', '0']), /1 to 65535/u)
  assert.throws(() => parseArgs(['--port', '70000']), /1 to 65535/u)
  assert.throws(() => parseArgs(['--typo']), /Unknown dev:local option/u)
  assert.throws(() => parseArgs(['--status', '--check-only']), /cannot be combined/u)
})

test('spawns npm-cli.js using process.execPath and passes the exact root and loopback port to Vite', () => {
  const invocation = buildNpmInvocation({
    execPath: 'C:/Program Files/nodejs/node.exe',
    npmCliPath: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
    projectRoot: worktree,
    port: 12010,
  })
  assert.equal(invocation.command, 'C:/Program Files/nodejs/node.exe')
  assert.equal(invocation.options.shell, false)
  assert.equal(invocation.options.cwd, worktree)
  assert.deepEqual(invocation.args.slice(1, 6), ['--prefix', worktree, 'run', 'dev', '--'])
  assert.deepEqual(invocation.args.slice(6), [worktree, '--host', '127.0.0.1', '--port', '12010', '--strictPort', '--configLoader', 'runner'])
})

test('uses npm_execpath as the npm-cli.js source and validates its file name', () => {
  const npmCliPath = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'
  assert.equal(resolveNpmCliPath({ env: { npm_execpath: npmCliPath }, execPath: 'C:/node.exe', exists: (candidate) => candidate === npmCliPath }), path.resolve(npmCliPath))
  assert.throws(() => resolveNpmCliPath({ env: { npm_execpath: 'C:/node/npm.cmd' }, execPath: 'C:/node.exe', exists: () => false }), /Could not locate npm-cli\.js/u)
})

test('recognizes only a Vite listener whose command line includes this exact worktree', () => {
  const own = { commandLine: `node.exe node_modules\\vite\\bin\\vite.js --root "${worktree}" --host 127.0.0.1` }
  const other = { commandLine: 'node.exe node_modules\\vite\\bin\\vite.js --root C:\\other\\OrgMaster' }
  const notVite = { commandLine: `node.exe scripts\\other-server.mjs --root "${worktree}"` }
  assert.equal(isViteOwnedByWorktree(own, worktree), true)
  assert.equal(isViteOwnedByWorktree(other, worktree), false)
  assert.equal(isViteOwnedByWorktree(notVite, worktree), false)
  assert.equal(isViteOwnedByWorktree({ commandLine: `node.exe node_modules\\vite\\bin\\vite.js "${worktree}-other"` }, worktree), false)
  assert.equal(isViteOwnedByWorktree({ commandLine: `node.exe "${worktree}\\node_modules\\vite\\bin\\vite.js" C:\\other` }, worktree), false)
})

test('check-only ownership reports an available port without querying or stopping any PID', async () => {
  let ownerLookupCalled = false
  const result = await inspectPortOwnership({
    port: 1010,
    projectRoot: worktree,
    probe: async () => true,
    listOwners: async () => { ownerLookupCalled = true; return [] },
  })
  assert.equal(result.state, 'available')
  assert.equal(ownerLookupCalled, false)
  assert.match(formatStatus(result, worktree), /no process owns/u)
})

test('reuses an already healthy Vite listener only when its PID command line proves worktree ownership', async () => {
  const result = await inspectPortOwnership({
    port: 1010,
    projectRoot: worktree,
    probe: async () => false,
    listOwners: async () => [{ pid: 4312, name: 'node.exe', commandLine: `node.exe node_modules\\vite\\bin\\vite.js --root "${worktree}"` }],
    health: async () => ({ ok: true, status: 200 }),
  })
  assert.equal(result.state, 'running')
  assert.match(formatStatus(result, worktree), /PID 4312.*worktree verified/u)
})

test('blocks occupied ports with unverified owners and does not probe their HTTP endpoint', async () => {
  let healthCalled = false
  const result = await inspectPortOwnership({
    port: 12010,
    projectRoot: worktree,
    probe: async () => false,
    listOwners: async () => [{ pid: 815, name: 'node.exe', commandLine: 'node.exe C:\\other\\server.js' }],
    health: async () => { healthCalled = true; return { ok: true, status: 200 } },
  })
  assert.equal(result.state, 'blocked')
  assert.equal(healthCalled, false)
  assert.match(formatStatus(result, worktree), /PID 815.*No process was stopped/u)
})

test('reports an unhealthy current-worktree listener as blocked', async () => {
  const result = await inspectPortOwnership({
    port: 1010,
    projectRoot: worktree,
    probe: async () => false,
    listOwners: async () => [{ pid: 4312, name: 'node.exe', commandLine: `node.exe node_modules\\vite\\bin\\vite.js --root "${worktree}"` }],
    health: async () => ({ ok: false, status: null }),
  })
  assert.equal(result.state, 'unhealthy')
  assert.match(formatStatus(result, worktree), /HTTP health failed/u)
})

test('reads the real Windows PID for a temporary loopback listener and leaves it running', { skip: process.platform !== 'win32' }, async () => {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve)
  })
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await inspectPortOwnership({ port: address.port, projectRoot: worktree })
    assert.equal(result.state, 'blocked')
    assert.equal(result.owners.some((owner) => owner.pid === process.pid), true, JSON.stringify({ ...result, error: result.error?.message }))
    assert.equal(server.listening, true)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
