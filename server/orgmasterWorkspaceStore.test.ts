import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { getWorkspacePaths, getWorkspaceIndex, getWorkspaceVersion, createWorkspaceDraft, saveWorkspaceVersion, WorkspaceStoreError } from './orgmasterWorkspaceStore'
import { createOrgDocumentFile } from '../src/documentStorage'
import { screenshotOrganizationState } from '../src/screenshotData'

const roots: string[] = []
async function root() {
  const path = await mkdtemp(join(tmpdir(), 'orgmaster-dev020-'))
  roots.push(path)
  return path
}
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

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
    expect(current.document.version).toBe(6)
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

  it('fails closed when the manifest is invalid', async () => {
    const path = await root()
    const paths = getWorkspacePaths(path)
    await mkdir(join(path, 'data'), { recursive: true })
    await writeFile(paths.manifest, JSON.stringify({ app: 'OrgMaster', workspaceVersion: 1, currentVersionId: 'missing', entries: [] }), 'utf8')
    await expect(getWorkspaceIndex(path)).rejects.toBeInstanceOf(WorkspaceStoreError)
  })
})
