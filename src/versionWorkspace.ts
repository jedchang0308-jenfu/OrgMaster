import type { OrgDocumentFile } from './documentStorage'

export const ORG_WORKSPACE_VERSION = 1 as const

export type OrgWorkspaceEntryKind = 'current' | 'draft'
export type OrgWorkspaceEntryStatus = 'active' | 'archived'

export interface OrgWorkspaceEntry {
  id: string
  name: string
  kind: OrgWorkspaceEntryKind
  status: OrgWorkspaceEntryStatus
  basedOnVersionId: string | null
  createdAt: string
  archivedAt: string | null
}

export interface OrgWorkspaceManifest {
  app: 'OrgMaster'
  workspaceVersion: typeof ORG_WORKSPACE_VERSION
  currentVersionId: string
  entries: OrgWorkspaceEntry[]
}

export interface OrgWorkspaceVersionSummary extends OrgWorkspaceEntry {
  updatedAt: string
  revision: string
  loadStatus?: 'ready' | 'failed'
  failureCode?: string
}

export interface OrgWorkspaceIndex {
  app: 'OrgMaster'
  workspaceVersion: typeof ORG_WORKSPACE_VERSION
  currentVersionId: string
  manifestRevision: string
  versions: OrgWorkspaceVersionSummary[]
}

export type WorkspaceValidationCode =
  | 'WORKSPACE_INVALID'
  | 'WORKSPACE_DUPLICATE_ID'
  | 'WORKSPACE_CURRENT_INVALID'
  | 'WORKSPACE_ENTRY_INVALID'
  | 'WORKSPACE_SOURCE_INVALID'
  | 'WORKSPACE_NAME_INVALID'
  | 'WORKSPACE_NAME_DUPLICATE'
  | 'WORKSPACE_ARCHIVE_CURRENT'
  | 'WORKSPACE_ENTRY_NOT_FOUND'
  | 'WORKSPACE_ENTRY_NOT_ACTIVE'

export type WorkspaceMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: WorkspaceValidationCode }

export function normalizeWorkspaceName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function isValidWorkspaceId(id: string) {
  return /^[A-Za-z0-9-]{1,80}$/.test(id)
}

function isIsoDate(value: string) {
  return Number.isFinite(Date.parse(value))
}

export function validateWorkspaceManifest(manifest: unknown): WorkspaceMutationResult<OrgWorkspaceManifest> {
  if (!manifest || typeof manifest !== 'object') return { ok: false, code: 'WORKSPACE_INVALID' }
  const value = manifest as Partial<OrgWorkspaceManifest>
  if (value.app !== 'OrgMaster' || value.workspaceVersion !== ORG_WORKSPACE_VERSION || !Array.isArray(value.entries)) {
    return { ok: false, code: 'WORKSPACE_INVALID' }
  }
  if (typeof value.currentVersionId !== 'string' || !isValidWorkspaceId(value.currentVersionId)) {
    return { ok: false, code: 'WORKSPACE_CURRENT_INVALID' }
  }

  const ids = new Set<string>()
  let currentCount = 0
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object') return { ok: false, code: 'WORKSPACE_ENTRY_INVALID' }
    const candidate = entry as Partial<OrgWorkspaceEntry>
    if (
      typeof candidate.id !== 'string'
      || !isValidWorkspaceId(candidate.id)
      || ids.has(candidate.id)
      || typeof candidate.name !== 'string'
      || typeof candidate.kind !== 'string'
      || typeof candidate.status !== 'string'
      || (candidate.kind !== 'current' && candidate.kind !== 'draft')
      || (candidate.status !== 'active' && candidate.status !== 'archived')
      || (candidate.basedOnVersionId !== null && typeof candidate.basedOnVersionId !== 'string')
      || typeof candidate.createdAt !== 'string'
      || !isIsoDate(candidate.createdAt)
      || (candidate.archivedAt !== null && (typeof candidate.archivedAt !== 'string' || !isIsoDate(candidate.archivedAt)))
    ) return { ok: false, code: 'WORKSPACE_ENTRY_INVALID' }
    if (candidate.kind === 'current') {
      currentCount += 1
      if (candidate.status !== 'active' || candidate.archivedAt !== null || candidate.name !== '現行版') {
        return { ok: false, code: 'WORKSPACE_CURRENT_INVALID' }
      }
    }
    if (candidate.kind === 'draft') {
      const normalizedName = normalizeWorkspaceName(candidate.name)
      if (normalizedName.length < 1 || normalizedName.length > 60 || normalizedName !== candidate.name) {
        return { ok: false, code: 'WORKSPACE_NAME_INVALID' }
      }
      if ((candidate.status === 'active') !== (candidate.archivedAt === null)) {
        return { ok: false, code: 'WORKSPACE_ENTRY_INVALID' }
      }
    }
    ids.add(candidate.id)
  }

  const current = value.entries.find((entry) => entry.kind === 'current')
  if (currentCount !== 1 || !current || current.id !== value.currentVersionId) return { ok: false, code: 'WORKSPACE_CURRENT_INVALID' }
  for (const entry of value.entries) {
    if (entry.basedOnVersionId !== null && (!ids.has(entry.basedOnVersionId) || entry.basedOnVersionId === entry.id)) {
      return { ok: false, code: 'WORKSPACE_SOURCE_INVALID' }
    }
  }

  const activeDraftNames = new Set<string>()
  for (const entry of value.entries.filter((item) => item.kind === 'draft' && item.status === 'active')) {
    const key = entry.name.toLocaleLowerCase('zh-Hant')
    if (activeDraftNames.has(key)) return { ok: false, code: 'WORKSPACE_NAME_DUPLICATE' }
    activeDraftNames.add(key)
  }

  return { ok: true, value: value as OrgWorkspaceManifest }
}

export function createWorkspaceManifest(currentVersionId: string, createdAt: string): OrgWorkspaceManifest {
  return {
    app: 'OrgMaster',
    workspaceVersion: ORG_WORKSPACE_VERSION,
    currentVersionId,
    entries: [{
      id: currentVersionId,
      name: '現行版',
      kind: 'current',
      status: 'active',
      basedOnVersionId: null,
      createdAt,
      archivedAt: null,
    }],
  }
}

/** Build the one-entry canonical manifest used by the DEV-040 clean V8 baseline. */
export function createCleanV8WorkspaceManifest(currentVersionId: string, createdAt: string): OrgWorkspaceManifest {
  return createWorkspaceManifest(currentVersionId, createdAt)
}

export function createDraftEntry(
  manifest: OrgWorkspaceManifest,
  sourceVersionId: string,
  name: string,
  id: string,
  createdAt: string,
): WorkspaceMutationResult<OrgWorkspaceEntry> {
  const source = manifest.entries.find((entry) => entry.id === sourceVersionId)
  if (!source) return { ok: false, code: 'WORKSPACE_SOURCE_INVALID' }
  if (source.status !== 'active') return { ok: false, code: 'WORKSPACE_ENTRY_NOT_ACTIVE' }
  if (!isValidWorkspaceId(id)) return { ok: false, code: 'WORKSPACE_ENTRY_INVALID' }
  const normalizedName = normalizeWorkspaceName(name)
  if (normalizedName.length < 1 || normalizedName.length > 60) return { ok: false, code: 'WORKSPACE_NAME_INVALID' }
  if (manifest.entries.some((entry) => entry.id === id)) return { ok: false, code: 'WORKSPACE_DUPLICATE_ID' }
  const key = normalizedName.toLocaleLowerCase('zh-Hant')
  if (manifest.entries.some((entry) => entry.kind === 'draft' && entry.status === 'active' && entry.name.toLocaleLowerCase('zh-Hant') === key)) {
    return { ok: false, code: 'WORKSPACE_NAME_DUPLICATE' }
  }
  return {
    ok: true,
    value: {
      id,
      name: normalizedName,
      kind: 'draft',
      status: 'active',
      basedOnVersionId: sourceVersionId,
      createdAt,
      archivedAt: null,
    },
  }
}

export function renameDraftEntry(manifest: OrgWorkspaceManifest, versionId: string, name: string): WorkspaceMutationResult<OrgWorkspaceManifest> {
  const entry = manifest.entries.find((candidate) => candidate.id === versionId)
  if (!entry) return { ok: false, code: 'WORKSPACE_ENTRY_NOT_FOUND' }
  if (entry.kind !== 'draft') return { ok: false, code: 'WORKSPACE_CURRENT_INVALID' }
  const normalizedName = normalizeWorkspaceName(name)
  if (normalizedName.length < 1 || normalizedName.length > 60) return { ok: false, code: 'WORKSPACE_NAME_INVALID' }
  const duplicate = manifest.entries.some((candidate) => (
    candidate.id !== versionId
    && candidate.kind === 'draft'
    && candidate.status === 'active'
    && candidate.name.toLocaleLowerCase('zh-Hant') === normalizedName.toLocaleLowerCase('zh-Hant')
  ))
  if (duplicate) return { ok: false, code: 'WORKSPACE_NAME_DUPLICATE' }
  return { ok: true, value: { ...manifest, entries: manifest.entries.map((candidate) => candidate.id === versionId ? { ...candidate, name: normalizedName } : candidate) } }
}

export function archiveDraftEntry(manifest: OrgWorkspaceManifest, versionId: string, archivedAt: string): WorkspaceMutationResult<OrgWorkspaceManifest> {
  const entry = manifest.entries.find((candidate) => candidate.id === versionId)
  if (!entry) return { ok: false, code: 'WORKSPACE_ENTRY_NOT_FOUND' }
  if (entry.kind === 'current') return { ok: false, code: 'WORKSPACE_ARCHIVE_CURRENT' }
  if (entry.status === 'archived') return { ok: true, value: manifest }
  return { ok: true, value: { ...manifest, entries: manifest.entries.map((candidate) => candidate.id === versionId ? { ...candidate, status: 'archived', archivedAt } : candidate) } }
}

export function restoreDraftEntry(manifest: OrgWorkspaceManifest, versionId: string): WorkspaceMutationResult<OrgWorkspaceManifest> {
  const entry = manifest.entries.find((candidate) => candidate.id === versionId)
  if (!entry) return { ok: false, code: 'WORKSPACE_ENTRY_NOT_FOUND' }
  if (entry.kind === 'current') return { ok: false, code: 'WORKSPACE_CURRENT_INVALID' }
  if (entry.status === 'active') return { ok: true, value: manifest }
  const duplicate = manifest.entries.some((candidate) => (
    candidate.id !== versionId
    && candidate.kind === 'draft'
    && candidate.status === 'active'
    && candidate.name.toLocaleLowerCase('zh-Hant') === entry.name.toLocaleLowerCase('zh-Hant')
  ))
  if (duplicate) return { ok: false, code: 'WORKSPACE_NAME_DUPLICATE' }
  return { ok: true, value: { ...manifest, entries: manifest.entries.map((candidate) => candidate.id === versionId ? { ...candidate, status: 'active', archivedAt: null } : candidate) } }
}

export function sortWorkspaceEntries(entries: OrgWorkspaceVersionSummary[]) {
  return [...entries].sort((first, second) => {
    if (first.kind !== second.kind) return first.kind === 'current' ? -1 : 1
    if (first.status !== second.status) return first.status === 'active' ? -1 : 1
    return Date.parse(second.updatedAt) - Date.parse(first.updatedAt) || first.name.localeCompare(second.name, 'zh-Hant') || first.id.localeCompare(second.id)
  })
}

export function isEditableWorkspaceMode(mode: 'current-view' | 'current-maintenance' | 'draft-edit') {
  return mode === 'current-maintenance' || mode === 'draft-edit'
}

export type WorkspaceMode = 'current-view' | 'current-maintenance' | 'draft-edit'

export interface WorkspaceDocumentResult {
  version: OrgWorkspaceVersionSummary
  document: OrgDocumentFile
}

export type WorkspaceIndexValidationResult =
  | { ok: true; value: OrgWorkspaceIndex }
  | { ok: false; code: 'WORKSPACE_INVALID' | 'WORKSPACE_DUPLICATE_ID' | 'WORKSPACE_CURRENT_INVALID' | 'WORKSPACE_ENTRY_INVALID' }

function parseWorkspaceVersionSummary(value: unknown): OrgWorkspaceVersionSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Partial<OrgWorkspaceVersionSummary>
  if (
    typeof item.id !== 'string'
    || !isValidWorkspaceId(item.id)
    || typeof item.name !== 'string'
    || (item.kind !== 'current' && item.kind !== 'draft')
    || (item.status !== 'active' && item.status !== 'archived')
    || (item.basedOnVersionId !== null && typeof item.basedOnVersionId !== 'string')
    || typeof item.createdAt !== 'string'
    || !isIsoDate(item.createdAt)
    || (item.archivedAt !== null && (typeof item.archivedAt !== 'string' || !isIsoDate(item.archivedAt)))
    || typeof item.updatedAt !== 'string'
    || !isIsoDate(item.updatedAt)
    || typeof item.revision !== 'string'
    || item.revision.length < 1
    || (item.loadStatus !== undefined && item.loadStatus !== 'ready' && item.loadStatus !== 'failed')
    || (item.failureCode !== undefined && typeof item.failureCode !== 'string')
  ) return null
  if (item.loadStatus === 'failed' && (!item.failureCode || item.failureCode.trim().length === 0)) return null
  if (item.kind === 'current' && (item.status !== 'active' || item.archivedAt !== null || item.name !== '現行版')) return null
  if (item.kind === 'draft' && normalizeWorkspaceName(item.name) !== item.name) return null
  return item as OrgWorkspaceVersionSummary
}

export function validateWorkspaceVersionSummary(value: unknown) {
  const summary = parseWorkspaceVersionSummary(value)
  return summary
    ? { ok: true as const, value: summary }
    : { ok: false as const, code: 'WORKSPACE_ENTRY_INVALID' as const }
}

export function validateWorkspaceIndex(value: unknown): WorkspaceIndexValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'WORKSPACE_INVALID' }
  const source = value as Partial<OrgWorkspaceIndex>
  if (
    source.app !== 'OrgMaster'
    || source.workspaceVersion !== ORG_WORKSPACE_VERSION
    || typeof source.currentVersionId !== 'string'
    || !isValidWorkspaceId(source.currentVersionId)
    || typeof source.manifestRevision !== 'string'
    || source.manifestRevision.length < 1
    || !Array.isArray(source.versions)
  ) return { ok: false, code: 'WORKSPACE_INVALID' }
  const versions: OrgWorkspaceVersionSummary[] = []
  const ids = new Set<string>()
  for (const raw of source.versions) {
    const version = parseWorkspaceVersionSummary(raw)
    if (!version) return { ok: false, code: 'WORKSPACE_ENTRY_INVALID' }
    if (ids.has(version.id)) return { ok: false, code: 'WORKSPACE_DUPLICATE_ID' }
    ids.add(version.id)
    versions.push(version)
  }
  const current = versions.filter((version) => version.kind === 'current')
  if (current.length !== 1 || current[0].id !== source.currentVersionId) return { ok: false, code: 'WORKSPACE_CURRENT_INVALID' }
  for (const version of versions) {
    if (version.basedOnVersionId !== null && (!ids.has(version.basedOnVersionId) || version.basedOnVersionId === version.id)) {
      return { ok: false, code: 'WORKSPACE_ENTRY_INVALID' }
    }
  }
  return { ok: true, value: { ...source, versions } as OrgWorkspaceIndex }
}
