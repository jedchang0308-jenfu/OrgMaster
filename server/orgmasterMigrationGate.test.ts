import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assertMigrationWritesAllowed, createOrgmasterMigrationGateMiddleware, EMPLOYEE_REKEY_IN_PROGRESS, migrationSentinelPath } from './orgmasterMigrationGate'

describe('DEV-040 migration gate', () => {
  it('rejects writes while sentinel exists and allows them after cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-gate-'))
    try {
      await mkdir(join(root, 'data'), { recursive: true })
      await writeFile(migrationSentinelPath(root), '{}')
      await expect(assertMigrationWritesAllowed(root)).rejects.toMatchObject({ code: EMPLOYEE_REKEY_IN_PROGRESS })
      await rm(migrationSentinelPath(root))
      await expect(assertMigrationWritesAllowed(root)).resolves.toBeUndefined()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('returns 503 only for business API requests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-gate-http-'))
    try {
      await mkdir(join(root, 'data'), { recursive: true }); await writeFile(migrationSentinelPath(root), '{}')
      const middleware = createOrgmasterMigrationGateMiddleware(root)
      const response = { statusCode: 200, setHeader: () => undefined, end: () => undefined } as any
      const request = { url: '/api/workspace', method: 'GET' } as any
      let nextCalled = false
      middleware(request, response, () => { nextCalled = true })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(response.statusCode).toBe(503); expect(nextCalled).toBe(false)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
