import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWorkspacePaths, getWorkspaceIndex, getWorkspaceVersion, createWorkspaceDraft, saveWorkspaceVersion, saveWorkspaceVersionUnlocked, updateWorkspaceEntry, WorkspaceStoreError } from './orgmasterWorkspaceStore'
import * as persistenceRepository from './orgmasterPersistenceRepository'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'

const roots: string[] = []
async function root() {
  const path = await mkdtemp(join(tmpdir(), 'orgmaster-dev020-'))
  roots.push(path)
  return path
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

async function withCloudSqlMode<T>(run: () => Promise<T>) {
  const previous = process.env.ORGMASTER_PERSISTENCE_MODE
  process.env.ORGMASTER_PERSISTENCE_MODE = 'cloud-sql'
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.ORGMASTER_PERSISTENCE_MODE
    else process.env.ORGMASTER_PERSISTENCE_MODE = previous
  }
}

describe('workspace disk store', () => {
  it('migrates the current document once and preserves the legacy source', async () => {
    const path = await root()
    const legacyPath = getWorkspacePaths(path).manifest.replace('orgmaster-workspace.v1.json', 'orgmaster-document.v4.json')
    const raw = `${JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document', '2026-08-16T00:00:00.000Z'), null, 2)}\n`
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(legacyPath, raw, 'utf8')
    const index = await getWorkspaceIndex(path)
    expect(index.versions[0]).toMatchObject({ kind: 'current', name: '現行版', loadStatus: 'ready' })
    expect(await readFile(legacyPath, 'utf8')).toBe(raw)
    const current = await getWorkspaceVersion(path, index.currentVersionId)
    expect(current.document.version).toBe(7)
  })

  it('keeps drafts isolated and rejects stale version writes', async () => {
    const path = await root()
    const legacyPath = getWorkspacePaths(path).manifest.replace('orgmaster-workspace.v1.json', 'orgmaster-document.v4.json')
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(legacyPath, `${JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document'), null, 2)}\n`, 'utf8')
    const index = await getWorkspaceIndex(path)
    const created = await createWorkspaceDraft(path, index.currentVersionId, '方案 A', index.manifestRevision)
    const draftIndex = created.workspace
    const draftId = created.createdVersionId
    const draft = await getWorkspaceVersion(path, draftId)
    const changed = createOrgDocumentFile({
      ...draft.document.state,
      departments: [...draft.document.state.departments, { id: 'extra', name: '新部門', parentId: null }],
      organizationLevels: draft.document.state.organizationLevels.map((level) => level.id === 'level-team' ? { ...level, name: '草稿專用組級層' } : level),
      organizationLayout: { ...draft.document.state.organizationLayout, mode: 'levels' },
    }, 'draft')
    const saved = await saveWorkspaceVersion(path, draftId, changed, draft.version.revision, 'draft-edit')
    expect(saved.document.state.departments.some((department) => department.id === 'extra')).toBe(true)
    expect(saved.document.state.organizationLevels.some((level) => level.name === '草稿專用組級層')).toBe(true)
    await expect(saveWorkspaceVersion(path, draftId, changed, draft.version.revision, 'draft-edit')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    const current = await getWorkspaceVersion(path, draftIndex.currentVersionId)
    expect(current.document.state.departments.some((department) => department.id === 'extra')).toBe(false)
    expect(current.document.state.organizationLevels.some((level) => level.name === '草稿專用組級層')).toBe(false)
    expect(current.document.state.organizationLayout.mode).toBe('tree')
  })

  it('canonicalizes legacy collaboration relations at the workspace save boundary', async () => {
    const path = await root()
    const legacyPath = getWorkspacePaths(path).manifest.replace('orgmaster-workspace.v1.json', 'orgmaster-document.v4.json')
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(legacyPath, `${JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document'), null, 2)}\n`, 'utf8')
    const index = await getWorkspaceIndex(path)
    const created = await createWorkspaceDraft(path, index.currentVersionId, '協作 canonicalization', index.manifestRevision)
    const draft = await getWorkspaceVersion(path, created.createdVersionId)
    const changed = {
      ...draft.document,
      state: {
        ...draft.document.state,
        duties: [{ id: 'duty-backend-collaboration', title: '後端協作', description: null }],
        dutyPositionRelations: [{
          id: 'relation-legacy-collaboration',
          dutyId: 'duty-backend-collaboration',
          relationType: 'collaborate' as const,
          target: { kind: 'position' as const, positionId: 'position-general-manager' },
          isPrimaryExecutor: false,
          order: 0,
        }],
      },
    }

    const saved = await saveWorkspaceVersion(path, created.createdVersionId, changed, draft.version.revision, 'draft-edit')
    expect(saved.document.state.dutyPositionRelations).toMatchObject([{
      id: 'relation-legacy-collaboration',
      relationType: 'execute',
      isPrimaryExecutor: false,
    }])
  })

  it('fails closed when the manifest is invalid', async () => {
    const path = await root()
    const paths = getWorkspacePaths(path)
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(paths.manifest, JSON.stringify({ app: 'OrgMaster', workspaceVersion: 1, currentVersionId: 'missing', entries: [] }), 'utf8')
    await expect(getWorkspaceIndex(path)).rejects.toBeInstanceOf(WorkspaceStoreError)
  })

  it('requires a Principal actor for cloud-SQL workspace writers before reading state', async () => {
    await withCloudSqlMode(async () => {
      const missingRoot = join(tmpdir(), 'orgmaster-missing-actor')
      const document = createOrgDocumentFile(screenshotOrganizationState, 'draft')
      await expect(createWorkspaceDraft(missingRoot, 'source', 'Draft', 'manifest')).rejects.toMatchObject({ code: 'WORKSPACE_ACTOR_REQUIRED' })
      await expect(saveWorkspaceVersion(missingRoot, 'draft-1', document, 'version', 'draft-edit')).rejects.toMatchObject({ code: 'WORKSPACE_ACTOR_REQUIRED' })
      await expect(saveWorkspaceVersionUnlocked(missingRoot, 'draft-1', document, 'version', 'draft-edit')).rejects.toMatchObject({ code: 'WORKSPACE_ACTOR_REQUIRED' })
      await expect(updateWorkspaceEntry(missingRoot, 'draft-1', 'archive', undefined, 'manifest')).rejects.toMatchObject({ code: 'WORKSPACE_ACTOR_REQUIRED' })
    })
  })

  it('passes the supplied Principal actor through create, save, rename, archive, and restore writes', async () => {
    const path = await root()
    const writer = vi.spyOn(persistenceRepository, 'writePersistenceArtifacts')
    const legacyPath = getWorkspacePaths(path).manifest.replace('orgmaster-workspace.v1.json', 'orgmaster-document.v4.json')
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(legacyPath, `${JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document'), null, 2)}\n`, 'utf8')

    const index = await getWorkspaceIndex(path)
    const created = await createWorkspaceDraft(path, index.currentVersionId, 'Actor draft', index.manifestRevision, 'principal-actor')
    const draft = await getWorkspaceVersion(path, created.createdVersionId)
    const saved = await saveWorkspaceVersion(path, created.createdVersionId, draft.document, draft.version.revision, 'draft-edit', 'principal-actor')
    const afterSave = await getWorkspaceIndex(path)
    const renamed = await updateWorkspaceEntry(path, created.createdVersionId, 'rename', 'Renamed draft', afterSave.manifestRevision, 'principal-actor')
    const archived = await updateWorkspaceEntry(path, created.createdVersionId, 'archive', undefined, renamed.manifestRevision, 'principal-actor')
    await updateWorkspaceEntry(path, created.createdVersionId, 'restore', undefined, archived.manifestRevision, 'principal-actor')

    expect(writer.mock.calls.map(([, input]) => input?.updatedBy)).toEqual(Array(5).fill('principal-actor'))
  })

  it('keeps actorless standalone local-JSON metadata actions compatible', async () => {
    const path = await root()
    const legacyPath = getWorkspacePaths(path).manifest.replace('orgmaster-workspace.v1.json', 'orgmaster-document.v4.json')
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(legacyPath, `${JSON.stringify(createOrgDocumentFile(screenshotOrganizationState, 'document'), null, 2)}\n`, 'utf8')

    const index = await getWorkspaceIndex(path)
    const created = await createWorkspaceDraft(path, index.currentVersionId, 'Standalone draft', index.manifestRevision)
    const renamed = await updateWorkspaceEntry(path, created.createdVersionId, 'rename', 'Standalone renamed', created.workspace.manifestRevision)
    const archived = await updateWorkspaceEntry(path, created.createdVersionId, 'archive', undefined, renamed.manifestRevision)
    const restored = await updateWorkspaceEntry(path, created.createdVersionId, 'restore', undefined, archived.manifestRevision)

    expect(restored.versions.find((version) => version.id === created.createdVersionId)).toMatchObject({ name: 'Standalone renamed', status: 'active' })
  })
})
