/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GovernanceCenter } from './GovernanceCenter'
import { createSeedDocumentV2 } from '../governance/migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from '../governance/aiPdmCatalog'
import type { GovernanceApiSnapshot, GovernanceSession, GovernanceVersionSummary } from '../governance/apiClient'
import type { GovernanceCommandQueryResultV1, GovernanceRoleAssignmentV2 } from '../governance/types'

const mocks = vi.hoisted(() => ({
  loadGovernance: vi.fn(),
  loadGovernanceSession: vi.fn(),
  patchGovernanceDraft: vi.fn(),
  publishGovernancePolicy: vi.fn(),
  setActiveGovernanceVersion: vi.fn(),
  loadGovernanceCommandResult: vi.fn(),
}))
vi.mock('../governance/apiClient', async (importOriginal) => ({ ...await importOriginal<typeof import('../governance/apiClient')>(), ...mocks }))

const employee = { id: 'employee-1', name: '王小明', status: 'active' as const, departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null }
let host: HTMLDivElement
let root: Root

function session(principalId = 'principal-a'): GovernanceSession {
  return {
    runtimeMode: 'verified-session',
    actor: { principalId, employeeId: employee.id, subjectHint: '••••' },
    capabilities: { manage: true, publish: true, simulate: true },
  }
}

function assignment(status: GovernanceRoleAssignmentV2['status'] = 'revoked'): GovernanceRoleAssignmentV2 {
  return {
    id: 'assignment-0', employeeId: employee.id, applicationId: 'orgmaster', roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: 'OrgMaster 管理者', catalogVersion: null,
    scope: { kind: 'global' }, status, validFrom: '2026-01-01T00:00:00Z', validTo: null, effectState: 'orgmaster-enforced',
  }
}

function snapshot(status: GovernanceRoleAssignmentV2['status'] = 'revoked', revision = 'r1'): GovernanceApiSnapshot {
  const document = createSeedDocumentV2('2026-10-06T08:05:02.615Z')
  document.draft.roleAssignments = [assignment(status)]
  return { document: { ...document, draft: { ...document.draft, identityLinks: [] }, publishedVersions: [] }, catalogs: [readAiPdmRoleCatalog()], revision, activeVersionId: null, versions: [] }
}

function version(number: number): GovernanceVersionSummary {
  return { id: `version-${number}`, kind: 'assignment-governance-v3', versionNumber: number, publishedAt: '2026-10-04T23:06:30.062Z', publishedByPrincipalId: 'principal-a', publishReason: `第${number}次角色調整`, snapshotHash: `hash-${number}`, organizationVersionId: 'organization-current', effectState: 'not-synchronized' }
}

function versionSnapshot(revision = 'r1', activeVersionId = 'version-7'): GovernanceApiSnapshot {
  const document = createSeedDocumentV2('2026-10-06T08:05:02.615Z')
  document.activePolicyVersionId = activeVersionId
  document.draft.identityLinks = [{ id: 'identity-operator', principalId: 'principal-a', issuer: 'urn:orgmaster:dev', subject: 'local-admin', subjectHint: '••••', subjectFingerprint: 'fingerprint', employeeId: employee.id, status: 'active', validFrom: '2026-01-01T00:00:00Z', validTo: null } as typeof document.draft.identityLinks[number]]
  document.draft.roleAssignments.push({ ...assignment('active'), id: 'operator-admin', employeeId: employee.id })
  return { document: { ...document, publishedVersions: [] } as unknown as GovernanceApiSnapshot['document'], catalogs: [readAiPdmRoleCatalog()], revision, activeVersionId, versions: [version(7), version(8)] }
}

function commandResult(commandId: string, operation: string, status: GovernanceCommandQueryResultV1['status'] = 'committed'): GovernanceCommandQueryResultV1 {
  return {
    status, commandId, commandHash: null, auditReference: status === 'committed' ? 'audit-1' : null,
    entityType: status === 'committed' ? 'roleAssignment' : null, entityId: status === 'committed' ? 'assignment-0' : null,
    occurredAt: status === 'committed' ? '2026-10-23T00:00:00.000Z' : null,
    result: status === 'committed' ? { operation, outcome: operation === 'PUBLISH_ASSIGNMENTS' ? 'published' : operation === 'ACTIVATE_ASSIGNMENT_VERSION' ? 'activated' : 'applied', entityType: 'roleAssignment', entityId: 'assignment-0' } : null,
  }
}

function commandResponse(commandId: string, operation: string, status: GovernanceCommandQueryResultV1['status'] = 'committed') {
  return { payload: commandResult(commandId, operation, status) }
}

function queueLoad(value: GovernanceApiSnapshot, principalId = 'principal-a') {
  mocks.loadGovernance.mockResolvedValueOnce({ payload: value, revision: value.revision })
  mocks.loadGovernanceSession.mockResolvedValueOnce({ payload: session(principalId), revision: value.revision })
}

async function mount(initialSection: 'assignments' | 'versions' = 'assignments', refreshToken = 0) {
  await act(async () => root.render(<GovernanceCenter employees={[employee]} departments={[]} roles={[]} currentOrganizationVersionId="organization-current" initialSection={initialSection} refreshToken={refreshToken} />))
}

async function clickButton(label: string) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === label)
  if (!button) throw new Error(`button not found: ${label}`)
  await act(async () => button.click())
}

async function startRestore() {
  await clickButton('啟用')
}

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('governance command recovery', () => {
  it('queries a committed lost PATCH once, then reloads fresh server state without a second write', async () => {
    const initial = snapshot('revoked', 'r1')
    const fresh = snapshot('active', 'r2')
    queueLoad(initial)
    queueLoad(fresh)
    mocks.patchGovernanceDraft.mockRejectedValueOnce(new TypeError('response lost after commit'))
    mocks.loadGovernanceCommandResult.mockImplementation(async (commandId: string) => commandResponse(commandId, 'RESTORE_ROLE_ASSIGNMENT'))

    await mount()
    await startRestore()

    const commandId = mocks.patchGovernanceDraft.mock.calls[0][1].commandId as string
    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledWith(commandId)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
    expect(mocks.loadGovernanceSession).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('已查明原操作完成')
    expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('有效')
  })

  it('keeps not_observed pending and manual committed lookup recovers without creating a new command', async () => {
    const initial = snapshot('revoked', 'r1')
    const fresh = snapshot('active', 'r2')
    queueLoad(initial)
    queueLoad(fresh)
    mocks.patchGovernanceDraft.mockRejectedValueOnce(new TypeError('response lost'))
    mocks.loadGovernanceCommandResult
      .mockImplementationOnce(async (commandId: string) => commandResponse(commandId, 'RESTORE_ROLE_ASSIGNMENT', 'not_observed'))
      .mockImplementationOnce(async (commandId: string) => commandResponse(commandId, 'RESTORE_ROLE_ASSIGNMENT'))

    await mount()
    await startRestore()

    const commandId = mocks.patchGovernanceDraft.mock.calls[0][1].commandId as string
    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('上一筆操作結果尚未確認，暫停新的變更。')

    await clickButton('查詢操作結果')

    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(2)
    expect(mocks.loadGovernanceCommandResult.mock.calls[1][0]).toBe(commandId)
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('已查明原操作完成')
  })

  it('keeps pending after a failed or 503 command lookup until a later lookup truly commits', async () => {
    const initial = snapshot('revoked', 'r1')
    const fresh = snapshot('active', 'r2')
    queueLoad(initial)
    queueLoad(fresh)
    mocks.patchGovernanceDraft.mockRejectedValueOnce(new TypeError('response lost'))
    mocks.loadGovernanceCommandResult
      .mockRejectedValueOnce(Object.assign(new Error('command query unavailable'), { status: 503 }))
      .mockImplementationOnce(async (commandId: string) => commandResponse(commandId, 'RESTORE_ROLE_ASSIGNMENT'))

    await mount()
    await startRestore()

    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('上一筆操作結果尚未確認，暫停新的變更。')
    expect(host.textContent).toContain('目前無法查明操作結果')
    expect(host.textContent).not.toContain('重送原操作')

    await clickButton('查詢操作結果')

    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('已查明原操作完成')
  })

  it('resends the original not-observed PATCH with the identical bound request, then confirms and refreshes', async () => {
    const initial = snapshot('revoked', 'r1')
    const fresh = snapshot('active', 'r2')
    queueLoad(initial)
    queueLoad(fresh)
    mocks.patchGovernanceDraft
      .mockRejectedValueOnce(new TypeError('request never reached server'))
      .mockResolvedValueOnce({ revision: fresh.revision, payload: { document: fresh.document, revision: fresh.revision, status: 'applied' } })
    mocks.loadGovernanceCommandResult
      .mockImplementationOnce(async (commandId: string) => commandResponse(commandId, 'RESTORE_ROLE_ASSIGNMENT', 'not_observed'))
      .mockImplementationOnce(async (commandId: string) => commandResponse(commandId, 'RESTORE_ROLE_ASSIGNMENT'))

    await mount()
    await startRestore()

    const originalCall = mocks.patchGovernanceDraft.mock.calls[0]
    const commandId = originalCall[1].commandId as string
    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('重送原操作')

    await clickButton('重送原操作')

    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(2)
    expect(mocks.patchGovernanceDraft.mock.calls[1]).toEqual(originalCall)
    expect(mocks.patchGovernanceDraft.mock.calls.map((call) => call[1].commandId)).toEqual([commandId, commandId])
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(2)
    expect(mocks.loadGovernanceCommandResult.mock.calls.map((call) => call[0])).toEqual([commandId, commandId])
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('已查明原操作完成')
    expect(host.textContent).not.toContain('上一筆操作結果尚未確認')
    expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('有效')
  })

  it('keeps a known 409 on the existing retry path without entering unknown recovery', async () => {
    const initial = snapshot('revoked', 'r1')
    const fresh = snapshot('active', 'r2')
    queueLoad(initial)
    mocks.patchGovernanceDraft
      .mockRejectedValueOnce({ status: 409, code: 'REVISION_CONFLICT' })
      .mockResolvedValueOnce({ revision: fresh.revision, payload: { document: fresh.document, revision: fresh.revision, status: 'applied' } })

    await mount()
    await clickButton('啟用')

    expect(mocks.loadGovernanceCommandResult).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('上一筆操作結果尚未確認')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('治理資料已在其他操作中更新')

    await clickButton('啟用')

    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(2)
    expect(mocks.patchGovernanceDraft.mock.calls[0][1].commandId).not.toBe(mocks.patchGovernanceDraft.mock.calls[1][1].commandId)
    expect(mocks.loadGovernanceCommandResult).not.toHaveBeenCalled()
    expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('有效')
  })

  it('does not apply a late query result after the actor changes', async () => {
    const initial = snapshot('revoked', 'r1')
    const afterActorChange = snapshot('revoked', 'r2')
    const staleCommittedState = snapshot('active', 'r3')
    queueLoad(initial, 'principal-a')
    queueLoad(afterActorChange, 'principal-b')
    mocks.loadGovernance.mockResolvedValueOnce({ payload: staleCommittedState, revision: staleCommittedState.revision })
    mocks.loadGovernanceSession.mockResolvedValue({ payload: session('principal-b'), revision: staleCommittedState.revision })
    mocks.patchGovernanceDraft.mockRejectedValueOnce(new TypeError('response lost'))
    let resolveQuery!: (value: GovernanceCommandQueryResultV1) => void
    mocks.loadGovernanceCommandResult.mockImplementation(() => new Promise<GovernanceCommandQueryResultV1>((resolve) => { resolveQuery = resolve }))
    const onChanged = vi.fn()

    await act(async () => root.render(<GovernanceCenter employees={[employee]} departments={[]} roles={[]} currentOrganizationVersionId="organization-current" initialSection="assignments" refreshToken={0} onChanged={onChanged} />))
    await clickButton('啟用')
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)

    await mount('assignments', 1)
    await act(async () => resolveQuery(commandResponse(mocks.patchGovernanceDraft.mock.calls[0][1].commandId, 'RESTORE_ROLE_ASSIGNMENT').payload))

    expect(mocks.patchGovernanceDraft).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
    expect(onChanged).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('已查明原操作完成')
    expect(host.textContent).not.toContain('重送原操作')
    expect(host.querySelector('.governance-matrix__person-statuses')?.textContent).toBe('已撤銷')
  })

  it('matches the publish operation when a lost POST is confirmed by command lookup', async () => {
    const initial = versionSnapshot('r1', 'version-7')
    const fresh = versionSnapshot('r2', 'version-7')
    queueLoad(initial)
    queueLoad(fresh)
    mocks.publishGovernancePolicy.mockRejectedValueOnce(new TypeError('response lost after publish'))
    mocks.loadGovernanceCommandResult.mockImplementation(async (commandId: string) => commandResponse(commandId, 'PUBLISH_ASSIGNMENTS'))

    await mount('versions')
    const reason = host.querySelector<HTMLInputElement>('input[placeholder="說明這次角色指派變更"]')!
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(reason, '測試發布')
      reason.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(( [...host.querySelectorAll('button')].find((node) => node.textContent === '發布新版本') as HTMLButtonElement).disabled).toBe(false)
    await clickButton('發布新版本')

    const commandId = mocks.publishGovernancePolicy.mock.calls[0][1] as string
    expect(mocks.publishGovernancePolicy).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledWith(commandId)
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('已查明原操作完成')
  })

  it('matches the reactivate operation when a lost POST is confirmed by command lookup', async () => {
    const initial = versionSnapshot('r1', 'version-7')
    const fresh = versionSnapshot('r2', 'version-8')
    queueLoad(initial)
    queueLoad(fresh)
    mocks.setActiveGovernanceVersion.mockRejectedValueOnce(new TypeError('response lost after reactivation'))
    mocks.loadGovernanceCommandResult.mockImplementation(async (commandId: string) => commandResponse(commandId, 'ACTIVATE_ASSIGNMENT_VERSION'))

    await mount('versions')
    await clickButton('改用第8版')

    const commandId = mocks.setActiveGovernanceVersion.mock.calls[0][1] as string
    expect(mocks.setActiveGovernanceVersion).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledWith(commandId)
    expect(mocks.loadGovernanceCommandResult).toHaveBeenCalledTimes(1)
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('已查明原操作完成')
  })
})
