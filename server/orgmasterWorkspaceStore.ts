import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createOrgDocumentFile,
  parseOrgDocument,
  type OrgDocumentFile,
} from '../src/documentStorage'
import {
  archiveDraftEntry,
  createDraftEntry,
  createWorkspaceManifest,
  renameDraftEntry,
  restoreDraftEntry,
  sortWorkspaceEntries,
  validateWorkspaceManifest,
  type OrgWorkspaceEntry,
  type OrgWorkspaceIndex,
  type OrgWorkspaceManifest,
  type OrgWorkspaceVersionSummary,
  type WorkspaceDocumentResult,
  type WorkspaceValidationCode,
} from '../src/versionWorkspace'
import { readStoredDocument } from './orgmasterApi'
import { hashFileContent, withOrgMasterRootLock, writeVerifiedAtomicFile } from './orgmasterFileStore'

export class WorkspaceStoreError extends Error {
  constructor(public readonly code: WorkspaceValidationCode | 'VERSION_CONFLICT' | 'VERSION_INVALID' | 'MANIFEST_CONFLICT' | 'WORKSPACE_NOT_FOUND' | string, message = code) {
    super(message)
    this.name = 'WorkspaceStoreError'
  }
}

export function getWorkspacePaths(rootDirectory = process.cwd()) {
  return {
    manifest: resolve(rootDirectory, 'data', 'orgmaster-workspace.v1.json'),
    versions: resolve(rootDirectory, 'data', 'orgmaster-versions'),
  }
}

const hashBytes = hashFileContent

export function getWorkspaceVersionPath(rootDirectory: string, versionId: string) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(versionId)) throw new WorkspaceStoreError('WORKSPACE_ENTRY_INVALID')
  return resolve(getWorkspacePaths(rootDirectory).versions, `${versionId}.json`)
}

const versionPath = getWorkspaceVersionPath

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readManifest(rootDirectory: string) {
  const path = getWorkspacePaths(rootDirectory).manifest
  const raw = await readFile(path, 'utf8')
  const parsed = validateWorkspaceManifest(JSON.parse(raw))
  if (!parsed.ok) throw new WorkspaceStoreError(parsed.code)
  return { manifest: parsed.value, raw, revision: hashBytes(raw) }
}

const writeAtomic = writeVerifiedAtomicFile

async function readVersion(rootDirectory: string, entry: OrgWorkspaceEntry): Promise<WorkspaceDocumentResult> {
  const path = versionPath(rootDirectory, entry.id)
  const raw = await readFile(path, 'utf8')
  const parsed = parseOrgDocument(JSON.parse(raw))
  if (!parsed.ok) throw new WorkspaceStoreError('VERSION_INVALID', parsed.code)
  if ((entry.kind === 'current' && parsed.document.kind !== 'document') || (entry.kind === 'draft' && parsed.document.kind !== 'draft')) {
    throw new WorkspaceStoreError('VERSION_INVALID')
  }
  const metadata = await stat(path)
  return {
    version: {
      ...entry,
      updatedAt: parsed.document.savedAt,
      revision: hashBytes(raw),
      loadStatus: 'ready',
    },
    document: parsed.document,
  }
}

function entryFailure(entry: OrgWorkspaceEntry, code: string): OrgWorkspaceVersionSummary {
  return {
    ...entry,
    updatedAt: entry.createdAt,
    revision: '',
    loadStatus: 'failed',
    failureCode: code,
  }
}

async function migrateWorkspace(rootDirectory: string) {
  const paths = getWorkspacePaths(rootDirectory)
  const legacy = await readStoredDocument(rootDirectory)
  const normalized = createOrgDocumentFile(legacy.document.state, 'document', legacy.document.savedAt)
  const signature = hashBytes(JSON.stringify(normalized.state)).slice(0, 20)
  const currentVersionId = `current-${signature}`
  const manifest = createWorkspaceManifest(currentVersionId, normalized.savedAt)
  await writeAtomic(versionPath(rootDirectory, currentVersionId), `${JSON.stringify(normalized, null, 2)}\n`)
  await writeAtomic(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

async function ensureManifest(rootDirectory: string) {
  const paths = getWorkspacePaths(rootDirectory)
  if (!(await exists(paths.manifest))) return migrateWorkspace(rootDirectory)
  return (await readManifest(rootDirectory)).manifest
}

export async function getWorkspaceIndex(rootDirectory = process.cwd()): Promise<OrgWorkspaceIndex> {
  await ensureManifest(rootDirectory)
  const manifestRead = await readManifest(rootDirectory)
  const manifest = manifestRead.manifest
  const summaries = await Promise.all(manifest.entries.map(async (entry) => {
    try {
      return (await readVersion(rootDirectory, entry)).version
    } catch (error) {
      return entryFailure(entry, error instanceof WorkspaceStoreError ? error.code : 'VERSION_INVALID')
    }
  }))
  return {
    app: 'OrgMaster',
    workspaceVersion: 1,
    currentVersionId: manifest.currentVersionId,
    manifestRevision: manifestRead.revision,
    versions: sortWorkspaceEntries(summaries),
  }
}

export async function getWorkspaceVersion(rootDirectory: string, versionId: string): Promise<WorkspaceDocumentResult> {
  return getWorkspaceVersionUnlocked(rootDirectory, versionId)
}

export async function getWorkspaceVersionUnlocked(rootDirectory: string, versionId: string): Promise<WorkspaceDocumentResult> {
  const manifest = await ensureManifest(rootDirectory)
  const entry = manifest.entries.find((candidate) => candidate.id === versionId)
  if (!entry) throw new WorkspaceStoreError('WORKSPACE_ENTRY_NOT_FOUND')
  return readVersion(rootDirectory, entry)
}

export async function createWorkspaceDraft(
  rootDirectory: string,
  sourceVersionId: string,
  name: string,
  expectedManifestRevision: string,
) {
  return withOrgMasterRootLock(rootDirectory, async () => {
    const current = await readManifest(rootDirectory)
    if (current.revision !== expectedManifestRevision) throw new WorkspaceStoreError('MANIFEST_CONFLICT')
    const source = await getWorkspaceVersion(rootDirectory, sourceVersionId)
    const id = `draft-${randomUUID()}`
    const entryResult = createDraftEntry(current.manifest, sourceVersionId, name, id, new Date().toISOString())
    if (!entryResult.ok) throw new WorkspaceStoreError(entryResult.code)
    const document = createOrgDocumentFile(source.document.state, 'draft')
    await writeAtomic(versionPath(rootDirectory, id), `${JSON.stringify(document, null, 2)}\n`)
    await writeAtomic(getWorkspacePaths(rootDirectory).manifest, `${JSON.stringify({ ...current.manifest, entries: [...current.manifest.entries, entryResult.value] }, null, 2)}\n`)
    return { workspace: await getWorkspaceIndex(rootDirectory), createdVersionId: id }
  })
}

export async function saveWorkspaceVersion(
  rootDirectory: string,
  versionId: string,
  document: OrgDocumentFile,
  expectedVersionRevision: string,
  mode: 'draft-edit' | 'current-maintenance',
) {
  return withOrgMasterRootLock(rootDirectory, () => saveWorkspaceVersionUnlocked(rootDirectory, versionId, document, expectedVersionRevision, mode))
}

export async function saveWorkspaceVersionUnlocked(
  rootDirectory: string,
  versionId: string,
  document: OrgDocumentFile,
  expectedVersionRevision: string,
  mode: 'draft-edit' | 'current-maintenance',
) {
    const manifest = await readManifest(rootDirectory)
    const entry = manifest.manifest.entries.find((candidate) => candidate.id === versionId)
    if (!entry) throw new WorkspaceStoreError('WORKSPACE_ENTRY_NOT_FOUND')
    if (entry.status !== 'active') throw new WorkspaceStoreError('WORKSPACE_ENTRY_NOT_ACTIVE')
    if ((entry.kind === 'current' && mode !== 'current-maintenance') || (entry.kind === 'draft' && mode !== 'draft-edit')) throw new WorkspaceStoreError('VERSION_INVALID')
    const current = await readVersion(rootDirectory, entry)
    if (current.version.revision !== expectedVersionRevision) throw new WorkspaceStoreError('VERSION_CONFLICT')
    const parsed = parseOrgDocument(document)
    if (!parsed.ok || parsed.document.kind !== (entry.kind === 'current' ? 'document' : 'draft')) throw new WorkspaceStoreError('VERSION_INVALID')
    await writeAtomic(versionPath(rootDirectory, versionId), `${JSON.stringify(parsed.document, null, 2)}\n`)
    return readVersion(rootDirectory, entry)
}

export async function updateWorkspaceEntry(
  rootDirectory: string,
  versionId: string,
  action: 'rename' | 'archive' | 'restore',
  value: string | undefined,
  expectedManifestRevision: string,
) {
  return withOrgMasterRootLock(rootDirectory, async () => {
    const current = await readManifest(rootDirectory)
    if (current.revision !== expectedManifestRevision) throw new WorkspaceStoreError('MANIFEST_CONFLICT')
    const result = action === 'rename'
      ? renameDraftEntry(current.manifest, versionId, value ?? '')
      : action === 'archive'
        ? archiveDraftEntry(current.manifest, versionId, new Date().toISOString())
        : restoreDraftEntry(current.manifest, versionId)
    if (!result.ok) throw new WorkspaceStoreError(result.code)
    await writeAtomic(getWorkspacePaths(rootDirectory).manifest, `${JSON.stringify(result.value, null, 2)}\n`)
    return getWorkspaceIndex(rootDirectory)
  })
}
