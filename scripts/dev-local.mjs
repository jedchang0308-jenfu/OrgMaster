import { spawn, spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DEFAULT_PORT = 1010
const HEALTH_TIMEOUT_MS = 1_500
const STARTUP_TIMEOUT_MS = 45_000
const STARTUP_POLL_MS = 250

export function parseArgs(args) {
  const options = { port: DEFAULT_PORT, noBrowser: false, checkOnly: false, status: false, help: false }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--no-browser') options.noBrowser = true
    else if (argument === '--check-only') options.checkOnly = true
    else if (argument === '--status') options.status = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--port') {
      const value = args[index + 1]
      if (!value) throw new Error('--port requires a number from 1 to 65535')
      options.port = parsePort(value)
      index += 1
    } else if (argument.startsWith('--port=')) options.port = parsePort(argument.slice('--port='.length))
    else throw new Error(`Unknown dev:local option: ${argument}`)
  }
  if (options.checkOnly && options.status) throw new Error('--check-only and --status cannot be combined')
  return options
}

function parsePort(value) {
  if (!/^\d+$/u.test(String(value))) throw new Error('--port requires a number from 1 to 65535')
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('--port requires a number from 1 to 65535')
  return port
}

export function resolveNpmCliPath({ env = process.env, execPath = process.execPath, exists = existsSync } = {}) {
  const candidates = [
    env.npm_execpath,
    path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (path.basename(candidate).toLowerCase() === 'npm-cli.js' && exists(candidate)) return path.resolve(candidate)
  }
  throw new Error('Could not locate npm-cli.js; run this entrypoint through npm or install Node.js with npm.')
}

export function buildNpmInvocation({ execPath = process.execPath, npmCliPath, projectRoot, port }) {
  return {
    command: execPath,
    args: [
      npmCliPath,
      '--prefix', projectRoot,
      'run', 'dev', '--',
      projectRoot,
      '--host', '127.0.0.1',
      '--port', String(parsePort(port)),
      '--strictPort',
      '--configLoader', 'runner',
    ],
    options: { cwd: projectRoot, shell: false, stdio: 'inherit', windowsHide: false },
  }
}

export function probeLoopbackPort(port) {
  const checkedPort = parsePort(port)
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    })
    server.listen({ host: '127.0.0.1', port: checkedPort, exclusive: true }, () => {
      server.close((error) => error ? reject(error) : resolve(true))
    })
  })
}

export async function checkLoopbackHealth(port, { timeoutMs = HEALTH_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`http://127.0.0.1:${parsePort(port)}/`, {
      signal: controller.signal,
      redirect: 'manual',
    })
    return { ok: response.status >= 200 && response.status < 300, status: response.status }
  } catch {
    return { ok: false, status: null }
  } finally {
    clearTimeout(timeout)
  }
}

function listPortOwnersWindows(port) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$portNumber = ${parsePort(port)}`,
    '$ownerPids = @(Get-NetTCPConnection -State Listen -LocalPort $portNumber -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)',
    '$rows = foreach ($ownerPid in $ownerPids) { $processInfo = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId = " + [int]$ownerPid); if ($processInfo) { [PSCustomObject]@{ pid = [int]$processInfo.ProcessId; name = [string]$processInfo.Name; commandLine = [string]$processInfo.CommandLine } } }',
    "if ($null -eq $rows) { '[]' } else { ConvertTo-Json -InputObject @($rows) -Compress }",
  ].join('; ')
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Could not query the Windows listener PID.')
  const output = result.stdout.trim()
  if (!output) return []
  const decoded = JSON.parse(output)
  return (Array.isArray(decoded) ? decoded : [decoded]).map((owner) => ({
    pid: Number(owner.pid),
    name: String(owner.name ?? 'unknown process'),
    commandLine: String(owner.commandLine ?? ''),
  }))
}

function listPortOwners(port, platform = process.platform) {
  if (platform === 'win32') return listPortOwnersWindows(port)
  throw new Error('PID ownership lookup is currently supported on Windows only.')
}

function normalizedPath(value) {
  return path.resolve(value).replace(/[\\/]+/gu, '\\').toLowerCase()
}

export function isViteOwnedByWorktree(owner, projectRoot) {
  const commandLine = String(owner?.commandLine ?? '')
  if (!commandLine) return false
  const normalizedCommandLine = commandLine.replace(/[\\/]+/gu, '\\').toLowerCase()
  const normalizedRoot = normalizedPath(projectRoot)
  const escapedRoot = normalizedRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const mentionsRoot = new RegExp(`(?:^|[\\s"'=])${escapedRoot}(?=$|[\\s"'])`, 'u').test(normalizedCommandLine)
  const mentionsVite = /(?:^|[\\/])vite(?:\.js)?(?:[\\/\s]|$)/iu.test(commandLine)
  return mentionsRoot && mentionsVite
}

export async function inspectPortOwnership({
  port,
  projectRoot,
  probe = probeLoopbackPort,
  listOwners = listPortOwners,
  health = checkLoopbackHealth,
}) {
  const checkedPort = parsePort(port)
  if (await probe(checkedPort)) return { state: 'available', port: checkedPort, owners: [] }

  let owners
  try {
    owners = await listOwners(checkedPort)
  } catch (error) {
    return { state: 'blocked', port: checkedPort, owners: [], reason: 'owner_lookup_failed', error }
  }
  if (!owners.length) return { state: 'blocked', port: checkedPort, owners: [], reason: 'owner_not_found' }

  if (owners.length === 1 && isViteOwnedByWorktree(owners[0], projectRoot)) {
    const result = await health(checkedPort)
    return result.ok
      ? { state: 'running', port: checkedPort, owner: owners[0], health: result }
      : { state: 'unhealthy', port: checkedPort, owner: owners[0], health: result }
  }
  return { state: 'blocked', port: checkedPort, owners, reason: 'worktree_ownership_unverified' }
}

export function formatStatus(result, projectRoot) {
  const address = `127.0.0.1:${result.port}`
  if (result.state === 'available') return `AVAILABLE: ${address} is free; no process owns the port.`
  if (result.state === 'running') {
    return `RUNNING: ${address}, PID ${result.owner.pid} (${result.owner.name}); worktree verified: ${projectRoot}; HTTP ${result.health.status}.`
  }
  if (result.state === 'unhealthy') {
    return `BLOCKED: ${address}, PID ${result.owner.pid} (${result.owner.name}) matches this worktree, but HTTP health failed; no process was stopped.`
  }
  const pids = result.owners?.map((owner) => `PID ${owner.pid} (${owner.name})`).join(', ')
  const ownerSummary = pids ? ` Listener: ${pids}.` : ''
  return `BLOCKED: ${address} is occupied, but worktree ownership could not be verified.${ownerSummary} No process was stopped.`
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForStartup(port, hasExited) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (hasExited()) return { ok: false, reason: 'process_exited' }
    const result = await checkLoopbackHealth(port)
    if (result.ok) return result
    await wait(STARTUP_POLL_MS)
  }
  return { ok: false, reason: 'timeout' }
}

function openBrowser(port, platform = process.platform) {
  const url = `http://localhost:${port}`
  const command = platform === 'win32' ? 'cmd.exe' : platform === 'darwin' ? 'open' : 'xdg-open'
  const args = platform === 'win32' ? ['/d', '/c', 'start', '', url] : [url]
  const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
  browser.on('error', () => {})
  browser.unref()
}

function printUsage() {
  console.log('Usage: npm run dev:local -- [--port 1010] [--no-browser] [--check-only | --status]')
}

export async function run(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args)
  if (options.help) {
    printUsage()
    return 0
  }
  const scriptPath = fileURLToPath(import.meta.url)
  const projectRoot = realpathSync(path.resolve(path.dirname(scriptPath), '..'))
  const inspect = dependencies.inspectPortOwnership ?? inspectPortOwnership
  let report = await inspect({ port: options.port, projectRoot })
  if (options.status) {
    console.log(formatStatus(report, projectRoot))
    return 0
  }
  if (options.checkOnly) {
    console.log(formatStatus(report, projectRoot))
    return report.state === 'available' || report.state === 'running' ? 0 : 1
  }

  if (report.state === 'running') {
    console.log(formatStatus(report, projectRoot))
  } else if (report.state !== 'available') {
    console.error(formatStatus(report, projectRoot))
    return 1
  }

  if (report.state === 'available') {
    let npmCliPath
    try {
      npmCliPath = resolveNpmCliPath()
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Could not locate npm-cli.js.')
      return 1
    }
    const invocation = buildNpmInvocation({ npmCliPath, projectRoot, port: options.port })
    console.log(`Starting the existing Vite API-plugin server on 127.0.0.1:${options.port}...`)
    const child = (dependencies.spawn ?? spawn)(invocation.command, invocation.args, invocation.options)
    let exitResult
    const exitPromise = new Promise((resolve) => {
      child.once('error', (error) => resolve({ error }))
      child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }))
    }).then((result) => {
      exitResult = result
      return result
    })
    const forwardSignal = (signal) => {
      if (child.exitCode === null) child.kill(signal)
    }
    const onInterrupt = () => forwardSignal('SIGINT')
    const onTerminate = () => forwardSignal('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)

    try {
      const ready = await waitForStartup(options.port, () => exitResult !== undefined)
      if (!ready.ok) {
        console.error(`Local health check failed (${ready.reason}); stopping the child started by this launcher.`)
        if (child.exitCode === null) child.kill('SIGINT')
        await Promise.race([exitPromise, wait(2_000)])
        return 1
      }
      const started = await inspect({ port: options.port, projectRoot })
      if (started.state !== 'running') {
        console.error(`The listener became reachable but its worktree ownership could not be verified. ${formatStatus(started, projectRoot)}`)
        if (child.exitCode === null) child.kill('SIGINT')
        await Promise.race([exitPromise, wait(2_000)])
        return 1
      }
      report = started
      console.log(`Local URL: http://localhost:${options.port}`)
      console.log(formatStatus(report, projectRoot))
      if (!options.noBrowser) openBrowser(options.port)
      const result = await exitPromise
      if (result.error) {
        console.error(result.error.message)
        return 1
      }
      return result.code
    } finally {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
    }
  }

  console.log(`Local URL: http://localhost:${options.port}`)
  if (!options.noBrowser) openBrowser(options.port)
  return 0
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().then((exitCode) => { process.exitCode = exitCode }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
