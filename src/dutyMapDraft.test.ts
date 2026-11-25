import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeDutyMapDraft } from './dutyMapDraft'
import { createDutyMapSeed } from './dutyMapSeed'
import { createOrgDocumentFile } from './documentStorage'
import { screenshotOrganizationState } from './screenshotData'
import type { OrgWorkspaceIndex, WorkspaceDocumentResult } from './versionWorkspace'
import { createWorkspaceDraft, loadWorkspaceIndex, loadWorkspaceVersion, saveWorkspaceDocument } from './serverWorkspaceStorage'

vi.mock('./serverWorkspaceStorage', () => ({
  createWorkspaceDraft: vi.fn(), loadWorkspaceIndex: vi.fn(),
  loadWorkspaceVersion: vi.fn(), saveWorkspaceDocument: vi.fn(),
}))
afterEach(() => vi.resetAllMocks())

function version(id: string, kind: 'current' | 'draft', seeded = false): WorkspaceDocumentResult {
  return {
    version: {
      id, kind, name: kind === 'draft' ? '部門職掌規劃' : '現行版', status: 'active',
      basedOnVersionId: kind === 'draft' ? 'current-one' : null, createdAt: '2026-11-25T00:00:00Z',
      archivedAt: null, updatedAt: '2026-11-25T00:00:00Z', revision: id + '-revision', loadStatus: 'ready',
    },
    document: createOrgDocumentFile(seeded ? createDutyMapSeed(screenshotOrganizationState) : screenshotOrganizationState, kind === 'draft' ? 'draft' : 'document'),
  }
}
function arrange(existingDraft: WorkspaceDocumentResult) {
  const current = version('current-one', 'current')
  const index: OrgWorkspaceIndex = {
    app: 'OrgMaster', workspaceVersion: 1, currentVersionId: current.version.id, manifestRevision: 'manifest-one',
    versions: [current.version, existingDraft.version],
  }
  vi.mocked(loadWorkspaceIndex).mockResolvedValue({ status: 'loaded', value: index })
  vi.mocked(loadWorkspaceVersion).mockResolvedValueOnce({ status: 'loaded', value: current })
    .mockResolvedValueOnce({ status: 'loaded', value: existingDraft })
  return { current, index }
}

describe('initial duty planning draft through the existing workspace APIs', () => {
  it('resumes an already populated planning draft without another create or save', async () => {
    const draft = version('draft-one', 'draft', true)
    arrange(draft)
    expect(await initializeDutyMapDraft('current-one')).toEqual(draft)
    expect(createWorkspaceDraft).not.toHaveBeenCalled()
    expect(saveWorkspaceDocument).not.toHaveBeenCalled()
  })

  it('reads back a lost save response and accepts the already saved exact content', async () => {
    const draft = version('draft-one', 'draft')
    arrange(draft)
    vi.mocked(saveWorkspaceDocument).mockImplementation(async (_id, document) => {
      vi.mocked(loadWorkspaceVersion).mockResolvedValueOnce({ status: 'loaded', value: { ...draft, document } })
      return { status: 'failed', message: '連線中斷' }
    })
    const result = await initializeDutyMapDraft('current-one')
    expect(result.document.state.dutyMap?.memberships).toHaveLength(116)
    expect(saveWorkspaceDocument).toHaveBeenCalledTimes(1)
    expect(createWorkspaceDraft).not.toHaveBeenCalled()
  })

  it('keeps a concurrent change and exposes the save conflict without retrying the write', async () => {
    const draft = version('draft-one', 'draft')
    arrange(draft)
    vi.mocked(saveWorkspaceDocument).mockResolvedValue({ status: 'failed', statusCode: 409, message: '版本已變更' })
    vi.mocked(loadWorkspaceVersion).mockResolvedValueOnce({ status: 'loaded', value: draft })
    await expect(initializeDutyMapDraft('current-one')).rejects.toThrow('版本已變更')
    expect(saveWorkspaceDocument).toHaveBeenCalledTimes(1)
    expect(draft.document.state.dutyMap).toBeUndefined()
  })
})
