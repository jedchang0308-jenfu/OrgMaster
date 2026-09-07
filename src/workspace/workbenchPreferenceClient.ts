import type { WorkbenchPreferenceModuleId, WorkbenchPreferenceDocument, WorkbenchListWidthProjection } from '../../server/workbenchPreferenceRepository'

export type WorkbenchPreferenceClient = Pick<typeof fetch, never>
export async function loadWorkbenchPreferences(fetcher: typeof fetch = fetch): Promise<WorkbenchPreferenceDocument> {
  const response = await fetcher('/api/orgmaster/preferences/workbench', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`PREFERENCE_READ_FAILED:${response.status}`)
  return await response.json() as WorkbenchPreferenceDocument
}
export async function saveWorkbenchListWidth(moduleId: WorkbenchPreferenceModuleId, listWidthPx: number, fetcher: typeof fetch = fetch): Promise<WorkbenchListWidthProjection> {
  const response = await fetcher(`/api/orgmaster/preferences/workbench/${encodeURIComponent(moduleId)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, listWidthPx }) })
  if (!response.ok) throw new Error(`PREFERENCE_WRITE_FAILED:${response.status}`)
  const body = await response.json() as { listWidth: WorkbenchListWidthProjection }
  return body.listWidth
}
