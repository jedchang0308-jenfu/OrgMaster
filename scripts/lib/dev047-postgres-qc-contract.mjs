import fs from 'node:fs'
import path from 'node:path'

export const requiredCorrectionCases = Object.freeze(['A17', 'A18', 'A19', 'A20', 'A21', 'A22'])

export function classifyTarget(env = process.env) {
  const externalUrl = String(env.DEV047_POSTGRES_URL ?? '').trim()
  const targetClass = String(env.DEV047_POSTGRES_TARGET_CLASS ?? 'task-owned-local').trim().toLowerCase()
  if (externalUrl) return { ok: false, reasonCode: 'EXTERNAL_TARGET_REJECTED', detail: 'DEV047_POSTGRES_URL is never accepted; the runner creates its own local cluster.' }
  if (targetClass !== 'task-owned-local') return { ok: false, reasonCode: 'TARGET_CLASS_REJECTED', detail: `Target class ${targetClass || '<empty>'} is not task-owned-local.` }
  return { ok: true, targetClass }
}

export function resolvePostgresBin(env = process.env, exists = fs.existsSync) {
  const configured = String(env.DEV047_POSTGRES_BIN ?? '').trim()
  const candidates = configured
    ? [configured]
    : ['C:\\Program Files\\PostgreSQL\\17\\bin', 'C:\\Program Files\\PostgreSQL\\18\\bin']
  for (const candidate of candidates) {
    const absolute = path.resolve(candidate)
    if (['initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'postgres.exe'].every((name) => exists(path.join(absolute, name)))) return { ok: true, bin: absolute }
  }
  return { ok: false, reasonCode: 'POSTGRES_RUNTIME_MISSING', detail: configured ? `Configured PostgreSQL bin is incomplete: ${configured}` : 'PostgreSQL 17 or 18 binaries were not found.' }
}

export function supportsServerVersion(version) {
  const major = Number.parseInt(String(version ?? ''), 10)
  return major === 17 || major === 18
}

export function resultExitCode(manifest) {
  if (manifest?.status !== 'PASS') return 2
  if (!Number.isSafeInteger(manifest.executedCaseCount) || manifest.executedCaseCount <= 0) return 2
  const passed = new Set((manifest.checks ?? []).filter((entry) => entry.status === 'PASS').map((entry) => entry.id))
  if (!requiredCorrectionCases.every((id) => passed.has(id))) return 2
  if (!manifest.runtime?.cleanup || !Object.values(manifest.runtime.cleanup).every(Boolean)) return 2
  return 0
}
