import assert from 'node:assert/strict'
import net from 'node:net'
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
} from './dev-local.mjs'

const worktree = path.resolve('C:/VIBE CODING/.worktrees/OrgMaster/dev060-app-permission-provider-20261028')

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

test('reads the real Windows PID for a temporary loopback listener and leaves it running', async () => {
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
