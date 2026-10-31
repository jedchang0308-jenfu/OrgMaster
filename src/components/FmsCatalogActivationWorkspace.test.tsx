/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FmsCatalogActivationWorkspace } from './FmsCatalogActivationWorkspace'

const mocks = vi.hoisted(() => ({
  principalId: 'principal-a',
  loadWorkspace: vi.fn(),
  preview: vi.fn(),
  activate: vi.fn(),
  receipt: vi.fn(),
}))

vi.mock('../auth/AuthGate', () => ({
  useAuthSession: () => ({ session: { user: { principalId: mocks.principalId } } }),
}))
vi.mock('../governance/fmsCatalogActivationApiClient', () => ({
  loadFmsCatalogActivationWorkspace: mocks.loadWorkspace,
  previewFmsCatalogActivation: mocks.preview,
  activateFmsCatalog: mocks.activate,
  loadFmsCatalogActivationReceipt: mocks.receipt,
}))

const FMS_ORIGIN = 'https://fms.example.test'
const PROTOCOL = 'jenfu.fms-catalog-handoff.v1'
const NONCE = '01234567-89ab-cdef-0123-456789abcdef'
const COMMAND_ID = 'activation-command-human-click'
const REQUEST_HASH = 'a'.repeat(64)
const PREVIEW_HASH = 'b'.repeat(64)
const BINDING_HASH = 'c'.repeat(64)
const ARTIFACT = '{"roles":[{"stableRoleId":"finance-auditor"}]}'
const release = {
  applicationId: 'financial-management-system' as const,
  version: 'fms-v8',
  contentSha256: BINDING_HASH,
  artifactSha256: 'd'.repeat(64),
  artifactUtf8: ARTIFACT,
  sourceDraftId: 'draft-8',
  sourceDraftRevision: 8,
  createdBy: { principalId: 'publisher-principal', employeeId: 'publisher-employee' },
  createdAt: '2026-11-01T00:00:00.000Z',
}
const workspace = {
  fmsOrigin: FMS_ORIGIN,
  applicationId: 'financial-management-system' as const,
  governanceRevision: 'gov-r1',
  organizationRevision: 'org-r1',
  assignmentVersion: 'assignment-v7',
  activeCatalog: {
    applicationId: 'financial-management-system' as const,
    catalogVersion: 'fms-v7',
    contentSha256: 'e'.repeat(64),
    artifactSha256: 'f'.repeat(64),
  },
  allowedOperations: { preview: true, activate: true },
}
const refreshedWorkspace = { ...workspace, governanceRevision: 'gov-r2', organizationRevision: 'org-r2' }
const expected = {
  governanceRevision: 'gov-r2',
  assignmentVersion: 'assignment-v7',
  catalogBindingRevision: 'e'.repeat(64),
  grantRevision: 'gov-r2',
}
const previewResult = {
  applicationId: 'financial-management-system' as const,
  requestHash: REQUEST_HASH,
  previewHash: PREVIEW_HASH,
  before: workspace.activeCatalog,
  after: {
    applicationId: 'financial-management-system' as const,
    catalogVersion: release.version,
    contentSha256: release.contentSha256,
    artifactSha256: release.artifactSha256,
  },
  assignmentVersion: 'assignment-v7',
  expected,
  addedRoles: [{ stableRoleId: 'finance-auditor', displayName: '財務稽核' }],
  removedRoles: [],
  changedRoles: [],
  affectedAssignmentCount: 2,
  preservedAssignmentIds: ['assignment-1'],
  removedAssignedRoleIds: [],
  compatible: true,
  alreadyActive: false,
  organizationRevision: 'org-r2',
  allowedOperations: { activate: true },
}
const checkpoint = { operationId: COMMAND_ID, checkpointId: 'fms-checkpoint-1' }

let host: HTMLDivElement
let root: Root
const opener = { postMessage: vi.fn() }
const otherWindow = {}

function emitMessage(
  data: unknown,
  options: { origin?: string; source?: object } = {},
) {
  window.dispatchEvent(new MessageEvent('message', {
    data,
    origin: options.origin ?? FMS_ORIGIN,
    source: (options.source ?? opener) as unknown as MessageEventSource,
  }))
}

async function sendMessage(
  data: unknown,
  options: { origin?: string; source?: object } = {},
) {
  await act(async () => {
    emitMessage(data, options)
    await Promise.resolve()
  })
}

async function mount() {
  await act(async () => {
    root.render(<FmsCatalogActivationWorkspace />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)
  if (!button) throw new Error(`button not found: ${label}`)
  await act(async () => button.click())
}

async function initialize() {
  await sendMessage({ protocol: PROTOCOL, type: 'init', nonce: NONCE, release })
}

async function preparePreview() {
  await initialize()
  await click('預覽影響')
  await settle()
}

function messagesOfType(type: string) {
  return opener.postMessage.mock.calls
    .map(([data]) => data as Record<string, unknown>)
    .filter((data) => data?.type === type)
}

function appliedReceipt(requestHash = REQUEST_HASH, previewHash = PREVIEW_HASH) {
  return {
    commandId: COMMAND_ID,
    requestHash,
    previewHash,
    receiptStatus: 'applied',
    replayed: false,
  }
}

function spyOnStorageWrites() {
  return vi.spyOn(Storage.prototype, 'setItem')
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.principalId = 'principal-a'
  mocks.loadWorkspace.mockResolvedValue(workspace)
  mocks.preview.mockResolvedValue(previewResult)
  mocks.activate.mockResolvedValue({ replayed: false })
  opener.postMessage.mockReset()
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal('opener', opener)
  vi.stubGlobal('crypto', { randomUUID: () => COMMAND_ID })
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  sessionStorage.clear()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('FMS catalog activation workspace', () => {
  it('does not preview or activate without a valid FMS init message', async () => {
    const storageWrites = spyOnStorageWrites()
    await mount()

    await sendMessage({
      protocol: PROTOCOL,
      type: 'issued',
      nonce: NONCE,
      operationId: COMMAND_ID,
      checkpoint,
    })

    expect(host.textContent).toContain('請從 FMS 的角色設定開啟此頁。')
    expect(host.querySelector('button')).toBeNull()
    expect(mocks.loadWorkspace).toHaveBeenCalledTimes(1)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(storageWrites).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('rejects init messages from the wrong origin or source and malformed nonces', async () => {
    await mount()
    const init = { protocol: PROTOCOL, type: 'init', nonce: NONCE, release }

    await sendMessage(init, { origin: 'https://attacker.example.test' })
    await sendMessage(init, { source: otherWindow })
    await sendMessage({ ...init, nonce: 'not-a-uuid' })

    expect(host.querySelector('button')).toBeNull()
    expect(host.textContent).toContain('請從 FMS 的角色設定開啟此頁。')
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('uses the current revisions in preview and waits for the user before issuing activation', async () => {
    const storageWrites = spyOnStorageWrites()
    mocks.loadWorkspace.mockResolvedValueOnce(workspace).mockResolvedValueOnce(refreshedWorkspace)
    await mount()
    await preparePreview()

    expect(mocks.preview).toHaveBeenCalledWith({
      release,
      reason: '啟用 FMS 角色目錄',
      expectedGovernanceRevision: 'gov-r2',
      expectedOrganizationRevision: 'org-r2',
    })
    expect(host.textContent).toContain('財務稽核')
    expect(host.textContent).toContain('影響 2 筆任用')
    expect(messagesOfType('issue')).toHaveLength(0)
    expect(mocks.activate).not.toHaveBeenCalled()

    await click('啟用此版本')

    expect(messagesOfType('issue')).toEqual([{
      protocol: PROTOCOL,
      nonce: NONCE,
      type: 'issue',
      selection: {
        operationId: COMMAND_ID,
        version: release.version,
        previewHash: PREVIEW_HASH,
        expected,
      },
    }])
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(JSON.stringify(messagesOfType('issue'))).not.toContain(ARTIFACT)
    expect(storageWrites).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it.each([true, false])('activates once and checks the original receipt when unknown (opener=%s)', async hasOpener => {
    if (!hasOpener) vi.stubGlobal('opener', null)
    const storageWrites = spyOnStorageWrites()
    mocks.activate.mockRejectedValue(new TypeError('response unavailable'))
    mocks.receipt
      .mockResolvedValueOnce(appliedReceipt('f'.repeat(64), PREVIEW_HASH))
      .mockResolvedValueOnce(appliedReceipt())
    await mount()
    await preparePreview()
    await click('啟用此版本')

    const issued = { protocol: PROTOCOL, type: 'issued', nonce: NONCE, operationId: COMMAND_ID, checkpoint }
    await sendMessage(issued, { origin: 'https://attacker.example.test' })
    await sendMessage(issued, { source: otherWindow })
    await sendMessage({ ...issued, nonce: 'ffffffff-ffff-ffff-ffff-ffffffffffff' })
    expect(mocks.activate).not.toHaveBeenCalled()

    await act(async () => {
      emitMessage(issued)
      emitMessage(issued)
      await Promise.resolve()
    })
    await settle()

    expect(mocks.activate).toHaveBeenCalledTimes(1)
    expect(mocks.activate).toHaveBeenCalledWith({
      release,
      reason: '啟用 FMS 角色目錄',
      expectedGovernanceRevision: 'gov-r1',
      expectedOrganizationRevision: 'org-r1',
      commandId: COMMAND_ID,
      requestHash: REQUEST_HASH,
      previewHash: PREVIEW_HASH,
      fmsCheckpoint: checkpoint,
    })
    expect(host.textContent).toContain('啟用結果尚待確認')
    expect(mocks.receipt).not.toHaveBeenCalled()
    expect(messagesOfType('issue')).toHaveLength(1)

    await sendMessage(issued)
    expect(mocks.activate).toHaveBeenCalledTimes(1)

    await click('查詢原操作')
    expect(mocks.receipt).toHaveBeenNthCalledWith(1, COMMAND_ID)
    expect(host.textContent).toContain('尚未查到已完成的啟用紀錄')
    expect(host.textContent).not.toContain('角色目錄已啟用。')

    await click('查詢原操作')
    expect(mocks.receipt).toHaveBeenNthCalledWith(2, COMMAND_ID)
    expect(mocks.receipt.mock.calls).toEqual([[COMMAND_ID], [COMMAND_ID]])
    expect(host.textContent).toContain('角色目錄已啟用。')
    expect(mocks.activate).toHaveBeenCalledTimes(1)
    expect(messagesOfType('issue')).toHaveLength(1)
    expect(storageWrites).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('drops old issued messages and late activation replies after the Principal changes', async () => {
    const activation = deferred<{ replayed: boolean }>()
    const activationPrincipals: string[] = []
    mocks.activate.mockImplementation(() => {
      activationPrincipals.push(mocks.principalId)
      return activation.promise
    })
    await mount()
    await preparePreview()
    await click('啟用此版本')
    const issued = { protocol: PROTOCOL, type: 'issued', nonce: NONCE, operationId: COMMAND_ID, checkpoint }
    await sendMessage(issued)

    expect(activationPrincipals).toEqual(['principal-a'])

    await act(async () => {
      mocks.principalId = 'principal-b'
      root.render(<FmsCatalogActivationWorkspace />)
      await Promise.resolve()
    })
    await settle()
    await sendMessage(issued)

    expect(mocks.loadWorkspace).toHaveBeenCalledTimes(3)
    expect(mocks.activate).toHaveBeenCalledTimes(1)

    await act(async () => {
      activation.resolve({ replayed: false })
      await activation.promise
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.activate).toHaveBeenCalledTimes(1)
    expect(messagesOfType('observe')).toHaveLength(0)
    expect(host.textContent).not.toContain('角色目錄已啟用。')
  })
})
