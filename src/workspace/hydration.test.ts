import { describe, expect, it } from 'vitest'
import { screenshotOrganizationState } from '../screenshotData'
import type { OrgWorkspaceIndex } from '../versionWorkspace'
import { classifyIndexFailure, classifyVersionFailure, isWorkspaceMutationBlocked, reconcileSelectionAfterVersionSwitch } from './hydration'

const index: OrgWorkspaceIndex = {
  app: 'OrgMaster', workspaceVersion: 1, currentVersionId: 'current-1', manifestRevision: 'rev-1',
  versions: [{ id: 'current-1', name: '現行版', kind: 'current', status: 'active', basedOnVersionId: null, createdAt: '2026-08-01T00:00:00Z', archivedAt: null, updatedAt: '2026-08-01T00:00:00Z', revision: 'rev-1', loadStatus: 'ready' }],
}

describe('workspace hydration', () => {
  it('distinguishes index transport, invalid index and failed current version', () => {
    expect(classifyIndexFailure({ status: 'failed', message: 'offline' })).toEqual({ kind: 'index-unavailable', message: 'offline' })
    expect(classifyIndexFailure({ status: 'loaded', value: { ...index, versions: [] } })).toMatchObject({ kind: 'workspace-invalid' })
    expect(classifyIndexFailure({ status: 'loaded', value: { ...index, versions: [{ ...index.versions[0], loadStatus: 'failed', failureCode: 'VERSION_INVALID' }] } })).toEqual({ kind: 'version-invalid', versionId: 'current-1', isCurrent: true, message: 'VERSION_INVALID' })
  })

  it('blocks every non-ready state and does not guess missing selections', () => {
    const conflict = classifyVersionFailure({ status: 'failed', message: 'stale', statusCode: 409 }, 'draft-1', false)
    expect(conflict).toEqual({ kind: 'conflict', message: 'stale' })
    expect(isWorkspaceMutationBlocked(conflict)).toBe(true)
    expect(isWorkspaceMutationBlocked({ kind: 'ready' })).toBe(false)
    expect(reconcileSelectionAfterVersionSwitch({ kind: 'employee', id: 'missing' }, screenshotOrganizationState)).toBeNull()
  })
})
