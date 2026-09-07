import { describe, expect, it, vi } from 'vitest'
import { loadWorkbenchPreferences, saveWorkbenchListWidth } from './workbenchPreferenceClient'

describe('workbench preference client', () => {
  it('uses the verified-session preference endpoints without identity payloads', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, listWidths: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, moduleId: 'employees', listWidth: { preferredPx: 286, updatedAt: '2026-09-04T00:00:00.000Z' } }), { status: 200 }))
    await expect(loadWorkbenchPreferences(fetcher)).resolves.toMatchObject({ version: 1 })
    await expect(saveWorkbenchListWidth('employees', 286, fetcher)).resolves.toMatchObject({ preferredPx: 286 })
    expect(fetcher.mock.calls[1][0]).toBe('/api/orgmaster/preferences/workbench/employees')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ version: 1, listWidthPx: 286 })
  })
})
