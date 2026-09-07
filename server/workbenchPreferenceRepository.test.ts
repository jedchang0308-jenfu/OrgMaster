import { mkdtemp, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorkbenchPreferenceRepository, workbenchPreferenceFilePath } from './workbenchPreferenceRepository'

describe('workbench preference repository', () => {
  it('stores an opaque principal-hashed local projection and round trips it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-workbench-'))
    try {
      const principalId = 'principal/private@example.test'
      const repository = createWorkbenchPreferenceRepository(root)
      await repository.upsert(principalId, 'employees', 286)
      const path = workbenchPreferenceFilePath(root, principalId)
      expect(path).not.toContain(principalId)
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, listWidths: { employees: { preferredPx: 286 } } })
      expect((await repository.read(principalId)).listWidths.employees?.preferredPx).toBe(286)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('serializes same-principal writes and does not create a file for read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orgmaster-workbench-'))
    try {
      const principalId = 'principal-2'
      const repository = createWorkbenchPreferenceRepository(root)
      expect((await repository.read(principalId)).listWidths).toEqual({})
      await expect(stat(workbenchPreferenceFilePath(root, principalId))).rejects.toMatchObject({ code: 'ENOENT' })
      await Promise.all([repository.upsert(principalId, 'employees', 220), repository.upsert(principalId, 'employees', 320)])
      expect((await repository.read(principalId)).listWidths.employees?.preferredPx).toBe(320)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
