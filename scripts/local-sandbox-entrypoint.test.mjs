import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

test('linked checkout forwards its source and user arguments to the common Platform controller', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'orgmaster-owner-entry-'))
  try {
    const primary = path.join(fixture, 'OrgMaster')
    const checkout = path.join(fixture, 'linked OrgMaster')
    mkdirSync(primary)
    execFileSync('git', ['init', '--quiet', primary])
    const config = ['-c', 'core.hooksPath=' + fixture, '-c', 'user.name=Fixture',
      '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false']
    execFileSync('git', ['-C', primary, ...config, 'commit', '--allow-empty', '--quiet', '-m', 'fixture'])
    execFileSync('git', ['-C', primary, ...config, 'worktree', 'add', '--quiet', '--detach', checkout, 'HEAD'])
    const platform = path.join(fixture, 'Jenfu-Platform')
    mkdirSync(path.join(platform, 'scripts'), { recursive: true })
    writeFileSync(path.join(platform, 'scripts/dev-local-daily.mjs'),
      'export function runDailyLocal(args, root, owner) { console.log(JSON.stringify({args, root, owner})); }')
    mkdirSync(path.join(checkout, 'scripts'))
    const client = path.join(checkout, 'scripts/local-sandbox-client.mjs')
    copyFileSync(path.join(root, 'scripts/local-sandbox-client.mjs'), client)
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts['dev:local'], 'node scripts/local-sandbox-client.mjs')
    assert.equal(pkg.scripts['dev:local:window'], undefined)
    for (const args of [[], ['--no-browser'], ['--status'], ['--stop']]) {
      const result = JSON.parse(execFileSync(process.execPath, [client, ...args], {
        cwd: fixture, encoding: 'utf8', windowsHide: true,
      }))
      assert.deepEqual(result, { args, root: platform, owner: { ownerWorktree: checkout, app: 'orgmaster' } })
    }
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('server preflight binds mode and checks dependencies in the executing checkout', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'orgmaster-owner-preflight-'))
  try {
    const script = path.join('scripts', 'local-sandbox-server.mjs')
    mkdirSync(path.join(fixture, 'scripts'))
    copyFileSync(path.join(root, script), path.join(fixture, script))
    for (const [mode, port] of [['integrated', 1010], ['standalone', 1011]]) {
      const env = { ...process.env, JENFU_LOCAL_SANDBOX_ENABLED: '1', JENFU_LOCAL_SANDBOX_MODE: mode,
        JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1', JENFU_LOCAL_SANDBOX_ORIGIN: `http://localhost:${port}` }
      const check = (cwd, environment = env) => spawnSync(process.execPath, [script, '--check'], {
        cwd, env: environment, encoding: 'utf8', windowsHide: true,
      })
      assert.equal(check(root).status, 0)
      const missing = check(fixture)
      assert.equal(missing.status, 1)
      assert.match(missing.stderr, /ENOENT/u)
      assert.ok(missing.stderr.includes(path.join(fixture, 'node_modules', 'vite', 'bin', 'vite.js')))
      const mismatch = check(root, { ...env, JENFU_LOCAL_SANDBOX_ORIGIN: `http://localhost:${port + 1}` })
      assert.equal(mismatch.status, 1)
      assert.match(mismatch.stderr, /Expected a bound/u)
    }
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})
