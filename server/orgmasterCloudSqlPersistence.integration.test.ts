import { describe, expect, it } from 'vitest'
import { getWorkspaceIndex, getWorkspaceVersion, saveWorkspaceVersion } from './orgmasterWorkspaceStore'
import { readManagementMethodStore, withStoreMutation } from './managementMethodStore'
import {
  closeOrgmasterPersistencePool,
  readPersistenceMedia,
  removePersistenceMedia,
  resolveOrgmasterPersistenceMode,
  writePersistenceMedia,
} from './orgmasterPersistenceRepository'

const enabled = process.env.ORGMASTER_DEV006_RUNTIME_INTEGRATION === '1'

describe.skipIf(!enabled)('DEV-006 Cloud SQL product repository integration', () => {
  it('reads and CAS-writes workspace and management artifacts without touching local JSON', async () => {
    expect(resolveOrgmasterPersistenceMode()).toBe('cloud-sql')
    const root = process.cwd()
    const workspace = await getWorkspaceIndex(root)
    const current = await getWorkspaceVersion(root, workspace.currentVersionId)
    const nextDocument = { ...current.document, savedAt: new Date(Date.parse(current.document.savedAt) + 1_000).toISOString() }
    const saved = await saveWorkspaceVersion(root, workspace.currentVersionId, nextDocument, current.version.revision, 'current-maintenance')
    expect(saved.version.revision).not.toBe(current.version.revision)
    await expect(saveWorkspaceVersion(root, workspace.currentVersionId, nextDocument, current.version.revision, 'current-maintenance'))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' })

    const methods = await readManagementMethodStore(root)
    const mutation = await withStoreMutation(root, async ({ store }) => ({ store, result: store.methods.length }))
    expect(mutation.result).toBe(methods.store.methods.length)

    const imported = await readPersistenceMedia({ mediaKey: 'orgmaster-management-method-media/fixture.png' })
    expect(imported.bytes.byteLength).toBeGreaterThan(0)
    const probeKey = 'orgmaster-management-method-media/runtime-integration.png'
    const probeBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    await writePersistenceMedia({ mediaKey: probeKey, bytes: probeBytes, mimeType: 'image/png' })
    expect((await readPersistenceMedia({ mediaKey: probeKey })).bytes).toEqual(probeBytes)
    await removePersistenceMedia({ mediaKey: probeKey })
    await expect(readPersistenceMedia({ mediaKey: probeKey })).rejects.toMatchObject({ code: 'PERSISTENCE_MEDIA_NOT_FOUND' })
    await closeOrgmasterPersistencePool()
  })
})
