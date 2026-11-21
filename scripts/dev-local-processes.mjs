import { spawnSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const HEALTH_TIMEOUT_MS = 1_500

export function parsePort(value) {
  if (!/^\d+$/u.test(String(value))) throw new Error('--port requires a number from 1 to 65535')
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('--port requires a number from 1 to 65535')
  return port
}

export async function probeLoopbackPort(port) {
  const checkedPort = parsePort(port)
  const probe = host => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false)
      else if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) resolve(true)
      else reject(error)
    })
    server.listen({ host, port: checkedPort, exclusive: true, ipv6Only: host === '::1' }, () => {
      server.close((error) => error ? reject(error) : resolve(true))
    })
  })
  const results = await Promise.all([probe('127.0.0.1'), probe('::1')])
  return results.every(Boolean)
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

export function listPortOwners(port, platform = process.platform) {
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

// PID alone is not an ownership proof. Hold a native Process handle while
// reading its creation time/path, and compare the same fields before killing.
function powershellJson(script, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', [
    "$ErrorActionPreference = 'Stop'",
    `$inputData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json`,
    script,
  ].join('\n')], { encoding: 'utf8', windowsHide: true, timeout: 15_000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Native process inspection failed: ${result.stderr.trim()}`)
  return JSON.parse(result.stdout.trim() || '[]')
}

const readFingerprint = `
function Read-Fingerprint($row) {
  $native = $null
  try {
    $native = Get-Process -Id ([int]$row.ProcessId) -ErrorAction Stop
    $null = $native.Handle
    if ($native.HasExited) { return }
    $startToken = $native.StartTime.ToUniversalTime().ToFileTimeUtc()
    # CIM truncates to microseconds; reject a PID recycled since the snapshot.
    $cimToken = $row.CreationDate.ToUniversalTime().ToFileTimeUtc()
    if ($startToken -lt $cimToken -or $startToken - $cimToken -ge 10) { return }
    [PSCustomObject]@{ pid = [int]$row.ProcessId; parentPid = [int]$row.ParentProcessId; startToken = $startToken.ToString(); executable = [string]$native.Path }
  } catch { } finally { if ($native) { $native.Dispose() } }
}
`

export function snapshotWindowsTree(anchorPids) {
  return powershellJson(`${readFingerprint}
$rows = @(Get-CimInstance -ClassName Win32_Process)
$selected = @{}
foreach ($anchor in $inputData) { $selected[[int]$anchor] = $true }
do {
  $changed = $false
  foreach ($row in $rows) {
    if ($selected.ContainsKey([int]$row.ParentProcessId) -and -not $selected.ContainsKey([int]$row.ProcessId)) {
      $selected[[int]$row.ProcessId] = $true; $changed = $true
    }
  }
} while ($changed)
$result = @($rows | Where-Object { $selected.ContainsKey([int]$_.ProcessId) } | ForEach-Object { Read-Fingerprint $_ })
ConvertTo-Json -InputObject $result -Compress`, anchorPids)
}

export function stopWindowsProcesses(fingerprints) {
  return powershellJson(`
$remaining = @()
foreach ($expected in $inputData) {
  $native = $null
  try {
    $native = Get-Process -Id ([int]$expected.pid) -ErrorAction SilentlyContinue
    if (-not $native) { continue }
    $null = $native.Handle
    if ($native.HasExited) { continue }
    if ($native.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -cne [string]$expected.startToken -or $native.Path -ine [string]$expected.executable) { continue }
    $native.Kill()
    if (-not $native.WaitForExit(2000)) { $remaining += [int]$expected.pid }
  } catch { $remaining += [int]$expected.pid } finally { if ($native) { $native.Dispose() } }
}
ConvertTo-Json -InputObject @($remaining) -Compress`, fingerprints)
}

const sameProcess = (left, right) => left?.pid === right?.pid && left.startToken === right.startToken
  && left.executable.toLowerCase() === right.executable.toLowerCase()

// Admit descendants only through a still-live, fingerprint-matched ancestor.
// Creation order prevents a recycled ancestor PID from adopting an old process.
export function extendOwnedTree(owned, rows) {
  const live = new Map(rows.map(row => [row.pid, row]))
  const admitted = new Set([...owned.values()].filter(row => sameProcess(row, live.get(row.pid))).map(row => row.pid))
  let changed
  do {
    changed = false
    for (const row of rows) {
      if (owned.has(row.pid) || !admitted.has(row.parentPid)) continue
      const parent = live.get(row.parentPid)
      if (BigInt(row.startToken) < BigInt(parent.startToken)) continue
      owned.set(row.pid, row); admitted.add(row.pid); changed = true
    }
  } while (changed)
  return owned
}

export function createProcessGuard({ child, port, probe, platform = process.platform,
  snapshot = snapshotWindowsTree, stopProcesses = stopWindowsProcesses, spawnedAt = Date.now() }) {
  const owned = new Map()
  let captured = false
  async function refresh() {
    if (platform !== 'win32') return
    const rows = snapshot([child.pid, ...owned.keys()])
    if (!captured) {
      const root = rows.find(row => row.pid === child.pid)
      if (!root) {
        if (child.exitCode !== null) return
        throw new Error(`Cannot capture native ownership of spawned PID ${child.pid}.`)
      }
      const minimumToken = BigInt(spawnedAt - 1_000) * 10_000n + 116444736000000000n
      if (root.parentPid !== process.pid || root.startToken === undefined || BigInt(root.startToken) < minimumToken
        || root.executable.toLowerCase() !== process.execPath.toLowerCase()) {
        throw new Error(`Native ownership mismatch for spawned PID ${child.pid}; no process was stopped.`)
      }
      owned.set(root.pid, root); captured = true
    }
    extendOwnedTree(owned, rows)
  }
  return {
    captureRoot: refresh,
    refresh,
    async stop() {
      const errors = []
      try { await refresh() } catch (error) { errors.push(error.message) }
      let remaining = []
      if (platform === 'win32') {
        try { remaining = stopProcesses([...owned.values()]) } catch (error) { errors.push(error.message); remaining = [...owned.keys()] }
        if (!captured && child.exitCode === null) remaining.push(child.pid)
      } else {
        // The launcher creates its own process group on POSIX.
        try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') { errors.push(error.message); remaining.push(child.pid) } }
      }
      const portReleased = await probe(port)
      return { remaining: [...new Set(remaining)], portReleased, errors }
    },
  }
}
