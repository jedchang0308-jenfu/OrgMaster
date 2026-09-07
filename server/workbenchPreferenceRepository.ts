import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const WORKBENCH_PREFERENCE_MODULES = ['employees', 'positions', 'departments', 'levels', 'duties', 'processes', 'management-methods', 'role-risks'] as const
export type WorkbenchPreferenceModuleId = typeof WORKBENCH_PREFERENCE_MODULES[number]
export interface WorkbenchListWidthProjection { preferredPx: number; updatedAt: string }
export interface WorkbenchPreferenceDocument { version: 1; listWidths: Partial<Record<WorkbenchPreferenceModuleId, WorkbenchListWidthProjection>> }

const moduleSet = new Set<string>(WORKBENCH_PREFERENCE_MODULES)
const MIN_WIDTH = 160
const MAX_WIDTH = 800

export function isWorkbenchPreferenceModuleId(value: string): value is WorkbenchPreferenceModuleId { return moduleSet.has(value) }
export function isValidWorkbenchListWidth(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= MIN_WIDTH && (value as number) <= MAX_WIDTH }
export function workbenchPreferenceFilePath(root: string, principalId: string) {
  const digest = createHash('sha256').update(principalId).digest('hex')
  return resolve(root, 'data', 'user-preferences', 'workbench-list-widths', `${digest}.v1.json`)
}

function emptyDocument(): WorkbenchPreferenceDocument { return { version: 1, listWidths: {} } }
function sanitize(value: unknown): WorkbenchPreferenceDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyDocument()
  const candidate = value as { version?: unknown; listWidths?: unknown }
  const listWidths: WorkbenchPreferenceDocument['listWidths'] = {}
  if (candidate.listWidths && typeof candidate.listWidths === 'object' && !Array.isArray(candidate.listWidths)) {
    for (const moduleId of WORKBENCH_PREFERENCE_MODULES) {
      const item = (candidate.listWidths as Record<string, unknown>)[moduleId]
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const preferredPx = (item as Record<string, unknown>).preferredPx
      const updatedAt = (item as Record<string, unknown>).updatedAt
      if (isValidWorkbenchListWidth(preferredPx) && typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt))) listWidths[moduleId] = { preferredPx, updatedAt }
    }
  }
  return { version: 1, listWidths }
}

export interface WorkbenchPreferenceRepository {
  read(principalId: string): Promise<WorkbenchPreferenceDocument>
  upsert(principalId: string, moduleId: WorkbenchPreferenceModuleId, listWidthPx: number): Promise<WorkbenchListWidthProjection>
}

export function createWorkbenchPreferenceRepository(root: string): WorkbenchPreferenceRepository {
  const queues = new Map<string, Promise<unknown>>()
  const enqueue = <T>(path: string, operation: () => Promise<T>) => {
    const previous = queues.get(path) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    queues.set(path, next)
    return next.finally(() => { if (queues.get(path) === next) queues.delete(path) })
  }
  async function read(principalId: string) {
    const path = workbenchPreferenceFilePath(root, principalId)
    try { return sanitize(JSON.parse(await readFile(path, 'utf8'))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument()
      throw error
    }
  }
  async function upsert(principalId: string, moduleId: WorkbenchPreferenceModuleId, listWidthPx: number) {
    const path = workbenchPreferenceFilePath(root, principalId)
    return enqueue(path, async () => {
      const current = await read(principalId)
      const projection = { preferredPx: listWidthPx, updatedAt: new Date().toISOString() }
      const next: WorkbenchPreferenceDocument = { version: 1, listWidths: { ...current.listWidths, [moduleId]: projection } }
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, path)
      return projection
    })
  }
  return { read, upsert }
}

export const WORKBENCH_PREFERENCE_WIDTH_RANGE = { min: MIN_WIDTH, max: MAX_WIDTH } as const
