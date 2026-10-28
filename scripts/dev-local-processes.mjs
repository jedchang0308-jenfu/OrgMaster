import { spawnSync } from 'node:child_process'

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
