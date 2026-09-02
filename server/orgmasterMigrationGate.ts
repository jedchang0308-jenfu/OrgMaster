import { access, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Connect } from 'vite'

export const EMPLOYEE_REKEY_IN_PROGRESS = 'EMPLOYEE_REKEY_IN_PROGRESS'
export function migrationSentinelPath(root: string) { return resolve(root, 'data', '.dev040-id1-migration-in-progress.json') }
export class OrgmasterMigrationGateError extends Error {
  readonly code = EMPLOYEE_REKEY_IN_PROGRESS
  constructor() { super(EMPLOYEE_REKEY_IN_PROGRESS); this.name = 'OrgmasterMigrationGateError' }
}
export async function isEmployeeRekeyInProgress(root = process.cwd()) {
  try { await access(migrationSentinelPath(root)); return true } catch { return false }
}
export async function assertMigrationWritesAllowed(root = process.cwd()) {
  if (await isEmployeeRekeyInProgress(root)) throw new OrgmasterMigrationGateError()
}
export function createOrgmasterMigrationGateMiddleware(root: string): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (!request.url?.startsWith('/api/')) return next()
    if (existsSync(migrationSentinelPath(root))) {
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: EMPLOYEE_REKEY_IN_PROGRESS }))
      return
    }
    void isEmployeeRekeyInProgress(root).then((blocked) => {
      if (!blocked) return next()
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: EMPLOYEE_REKEY_IN_PROGRESS }))
    }).catch(() => next())
  }
}
export async function readMigrationSentinel(root = process.cwd()): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await readFile(migrationSentinelPath(root), 'utf8')) as Record<string, unknown> } catch { return null }
}
