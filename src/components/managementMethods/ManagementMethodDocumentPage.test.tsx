/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screenshotOrganizationState } from '../../screenshotData'
import type { EditorDocumentV1, ManagementMethodSessionV1, ManagementMethodV1 } from '../../managementMethods/types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type GuardResult = { kind: 'allow' } | { kind: 'keep-open'; focusTarget?: string }
type CloseGuard = () => Promise<GuardResult>

const api = vi.hoisted(() => ({
  session: vi.fn(),
  get: vi.fn(),
  saveDraft: vi.fn(),
  updateMetadata: vi.fn(),
  provide: vi.fn(),
  stopReadable: vi.fn(),
  restore: vi.fn(),
  uploadMedia: vi.fn(),
}))

vi.mock('../../managementMethods/apiClient', () => ({
  managementMethodApi: api,
  ManagementMethodApiError: class ManagementMethodApiError extends Error { failure = { code: 'TEST_ERROR' } },
}))
vi.mock('../../managementMethods/clientCapability', () => ({
  canMutateManagementMethods: () => true,
  observeManagementMethodCapability: (listener: (allowed: boolean) => void) => { listener(true); return () => undefined },
}))
vi.mock('./ManagementMethodEditor', () => ({
  ManagementMethodEditor: ({ onChange }: { onChange: (body: EditorDocumentV1) => void }) => <button type="button" onClick={() => onChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '已修改' }] }] })}>模擬修改內容</button>,
}))

import { ManagementMethodDocumentPage } from './ManagementMethodDocumentPage'
import { PanelOverlayHost, WorkspaceOverlayProvider, WorkspacePanelOverlayScope } from '../workspace/WorkspaceOverlayHosts'

const method: ManagementMethodV1 = {
  id: 'method-1', code: 'MP-0001', creationRequestId: 'request-1', creationInputHash: 'hash-1', title: '測試管理辦法', ownerEmployeeId: 'employee-1', methodRevision: 'method-revision-1',
  workingDraft: { bodyFormat: 'editor-json-v1', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原內容' }] }] }, bodyHash: 'body-hash-1', revision: 'draft-revision-1', mediaIds: [], updatedByPrincipalId: 'principal-1', updatedAt: '2026-08-28T00:00:00.000Z' },
  readableSnapshot: null,
  generationMeta: { provider: 'fake', model: 'fake', promptVersion: 'management-method-draft-v1', providerRequestId: null, durationMs: 0, inputTokens: null, outputTokens: null, generatedAt: '2026-08-28T00:00:00.000Z' },
  createdByPrincipalId: 'principal-1', createdAt: '2026-08-28T00:00:00.000Z', updatedByPrincipalId: 'principal-1', updatedAt: '2026-08-28T00:00:00.000Z',
}

const session: ManagementMethodSessionV1 = {
  actor: { principalId: 'principal-1', subjectHint: '測試人員' },
  capabilities: { create: true, readReadable: true, readDraft: true, editDraft: true, manageReadable: true, manageMetadata: true },
  draftGeneration: 'configured',
  runtimeMode: 'local-development',
}

describe('ManagementMethodDocumentPage close guard', () => {
  beforeEach(() => {
    api.session.mockResolvedValue(session)
    api.get.mockResolvedValue({ method, view: 'draft' })
    api.saveDraft.mockResolvedValue({ method: { ...method, workingDraft: { ...method.workingDraft, revision: 'draft-revision-2' } } })
  })

  it('offers continue, discard, and save choices before a dirty workspace panel closes', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let guard: CloseGuard | null = null
    await act(async () => {
      root.render(<WorkspaceOverlayProvider><WorkspacePanelOverlayScope moduleId="management-methods"><PanelOverlayHost /><ManagementMethodDocumentPage methodId="method-1" initialView="draft" state={screenshotOrganizationState} onClose={() => undefined} visibility="active" requestCloseGuardRegistration={(next) => { guard = next }} /></WorkspacePanelOverlayScope></WorkspaceOverlayProvider>)
      await Promise.resolve()
      await Promise.resolve()
    })
    const click = async (label: string) => {
      const button = Array.from(host.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label))
      expect(button).not.toBeUndefined()
      await act(async () => button?.click())
    }
    await click('編輯文件')
    await click('模擬修改內容')
    expect(guard).not.toBeNull()

    let firstResult: GuardResult | undefined
    let firstPromise: Promise<GuardResult> | undefined
    await act(async () => {
      firstPromise = guard?.()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('尚有未保存的文件內容')
    await click('繼續編輯')
    firstResult = await firstPromise
    expect(firstResult).toEqual({ kind: 'keep-open', focusTarget: 'workspace-panel-management-methods' })

    let secondResult: GuardResult | undefined
    let secondPromise: Promise<GuardResult> | undefined
    await act(async () => {
      secondPromise = guard?.()
      await Promise.resolve()
    })
    await click('捨棄修改')
    secondResult = await secondPromise
    expect(secondResult).toEqual({ kind: 'allow' })
    expect(host.textContent).not.toContain('尚有未保存的文件內容')
    root.unmount()
    host.remove()
  })

  it('intersects API capabilities with the workspace read-only gate', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<WorkspaceOverlayProvider><WorkspacePanelOverlayScope moduleId="management-methods"><PanelOverlayHost /><ManagementMethodDocumentPage methodId="method-1" initialView="draft" state={screenshotOrganizationState} onClose={() => undefined} visibility="active" workspaceMutationAllowed={false} /></WorkspacePanelOverlayScope></WorkspaceOverlayProvider>)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('測試管理辦法')
    expect(host.textContent).not.toContain('編輯文件')
    root.unmount()
    host.remove()
  })
})
