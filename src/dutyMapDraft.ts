import { createOrgDocumentFile, orgStateSignature } from './documentStorage'
import { createDutyMapSeed } from './dutyMapSeed'
import { createWorkspaceDraft, loadWorkspaceIndex, loadWorkspaceVersion, saveWorkspaceDocument, type WorkspaceClientResult } from './serverWorkspaceStorage'

function loaded<T>(result: WorkspaceClientResult<T>): T {
  if (result.status !== 'loaded') throw new Error(result.message)
  return result.value
}

/** Uses the ordinary verified workspace APIs and resumes an existing planning draft. */
export async function initializeDutyMapDraft(sourceVersionId: string) {
  const index = loaded(await loadWorkspaceIndex())
  const source = loaded(await loadWorkspaceVersion(sourceVersionId))
  // Resolve ambiguous source data before creating a new version.
  createDutyMapSeed(source.document.state)
  const name = '部門職掌規劃'
  const existing = index.versions.find(version => version.kind === 'draft' && version.status === 'active'
    && version.name === name && (version.basedOnVersionId === sourceVersionId || version.id === sourceVersionId))
  let targetVersionId = existing?.id
  if (!targetVersionId) {
    const created = loaded(await createWorkspaceDraft(sourceVersionId, name, index.manifestRevision))
    targetVersionId = created.createdVersionId
  }
  const target = loaded(await loadWorkspaceVersion(targetVersionId))
  const state = createDutyMapSeed(target.document.state)
  const document = createOrgDocumentFile(state, 'draft')
  if (orgStateSignature(document.state) === orgStateSignature(target.document.state)) return target
  const saved = await saveWorkspaceDocument(targetVersionId, document, target.version.revision, 'draft-edit')
  if (saved.status === 'loaded') return saved.value
  // A lost response is read back before deciding whether another save is needed.
  const readback = await loadWorkspaceVersion(targetVersionId)
  if (readback.status === 'loaded' && orgStateSignature(readback.value.document.state) === orgStateSignature(document.state)) return readback.value
  throw new Error(saved.message)
}
