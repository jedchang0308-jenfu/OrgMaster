import { describe, expect, it } from 'vitest'
import {
  archiveDraftEntry,
  createDraftEntry,
  createWorkspaceManifest,
  renameDraftEntry,
  restoreDraftEntry,
  validateWorkspaceManifest,
} from './versionWorkspace'

const manifest = createWorkspaceManifest('current-1', '2026-08-16T00:00:00.000Z')

describe('version workspace domain', () => {
  it('creates an isolated named draft from an active source', () => {
    const result = createDraftEntry(manifest, 'current-1', '方案 A', 'draft-a', '2026-08-16T00:01:00.000Z')
    expect(result).toEqual({
      ok: true,
      value: {
        id: 'draft-a',
        name: '方案 A',
        kind: 'draft',
        status: 'active',
        basedOnVersionId: 'current-1',
        createdAt: '2026-08-16T00:01:00.000Z',
        archivedAt: null,
      },
    })
  })

  it('enforces active draft name uniqueness and reversible archive', () => {
    const created = createDraftEntry(manifest, 'current-1', '方案 A', 'draft-a', '2026-08-16T00:01:00.000Z')
    if (!created.ok) throw new Error('fixture failed')
    const withDraft = { ...manifest, entries: [...manifest.entries, created.value] }
    expect(createDraftEntry(withDraft, 'current-1', '  方案 A  ', 'draft-b', '2026-08-16T00:02:00.000Z')).toEqual({ ok: false, code: 'WORKSPACE_NAME_DUPLICATE' })
    const archived = archiveDraftEntry(withDraft, 'draft-a', '2026-08-16T00:03:00.000Z')
    expect(archived.ok).toBe(true)
    if (!archived.ok) return
    expect(archived.value.entries.find((entry) => entry.id === 'draft-a')?.status).toBe('archived')
    const restored = restoreDraftEntry(archived.value, 'draft-a')
    expect(restored.ok).toBe(true)
    expect(archiveDraftEntry(withDraft, 'current-1', '2026-08-16T00:03:00.000Z')).toEqual({ ok: false, code: 'WORKSPACE_ARCHIVE_CURRENT' })
  })

  it('renames drafts and rejects invalid or cyclic manifests', () => {
    const created = createDraftEntry(manifest, 'current-1', '方案 A', 'draft-a', '2026-08-16T00:01:00.000Z')
    if (!created.ok) throw new Error('fixture failed')
    const withDraft = { ...manifest, entries: [...manifest.entries, created.value] }
    const renamed = renameDraftEntry(withDraft, 'draft-a', '方案 B')
    expect(renamed.ok).toBe(true)
    expect(validateWorkspaceManifest({ ...withDraft, currentVersionId: 'draft-a' })).toEqual({ ok: false, code: 'WORKSPACE_CURRENT_INVALID' })
    expect(validateWorkspaceManifest({ ...withDraft, entries: withDraft.entries.map((entry) => entry.id === 'draft-a' ? { ...entry, basedOnVersionId: 'draft-a' } : entry) })).toEqual({ ok: false, code: 'WORKSPACE_SOURCE_INVALID' })
  })
})
