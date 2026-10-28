/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedDocumentV2 } from '../governance/migrateGovernanceV1ToV2'
import { readAiPdmRoleCatalog } from '../governance/aiPdmCatalog'
import type { GovernanceApiSnapshot, GovernanceVersionSummary } from '../governance/apiClient'
import { GovernanceCenter } from './GovernanceCenter'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ loadGovernance: vi.fn(), allows: vi.fn(), setActiveGovernanceVersion: vi.fn() }))
vi.mock('../auth/OrgMasterPermissionProvider', () => ({ useOrgMasterPermissions: () => ({ state: { kind: 'ready', projection: { management: { crossAppOverride: false } } }, allows: mocks.allows }) }))
vi.mock('../auth/AuthGate', () => ({ useAuthSession: () => ({ session: { user: { principalId: 'principal-operator', employeeId: 'employee-operator' } } }) }))
vi.mock('../governance/apiClient', async (importOriginal) => ({ ...await importOriginal<typeof import('../governance/apiClient')>(), ...mocks }))

function version(number: number, kind: GovernanceVersionSummary['kind'] = 'assignment-governance-v3'): GovernanceVersionSummary {
  return { id: 'version-' + number, kind, versionNumber: number, publishedAt: '2026-10-04T23:06:30.062Z', publishedByPrincipalId: 'principal-operator', publishReason: '第' + number + '次角色調整', snapshotHash: 'hash-' + number, organizationVersionId: 'current-unreadable-machine-id', effectState: 'not-synchronized' }
}
function fixture(activeId: string | null = 'version-7'): GovernanceApiSnapshot {
  const document = createSeedDocumentV2('2026-10-06T08:05:02.615Z')
  document.activePolicyVersionId = activeId
  document.draft.roleAssignments.push({ id: 'operator-admin', applicationId: 'orgmaster', employeeId: 'employee-operator', roleId: 'role-orgmaster-admin', roleCodeSnapshot: 'orgmaster_admin', roleNameSnapshot: '管理者', catalogVersion: null, scope: { kind: 'global' }, status: 'active', validFrom: '2026-01-01T00:00:00.000Z', validTo: null, effectState: 'orgmaster-enforced' })
  return { document: { ...document, draft: { ...document.draft, identityLinks: [] }, publishedVersions: [] }, catalogs: [readAiPdmRoleCatalog()], revision: 'governance-revision', activeVersionId: activeId, versions: [version(6, 'assignment-governance-v2'), version(7), version(9), version(8)] }
}
const mounted: Array<{ host: HTMLElement; root: ReturnType<typeof createRoot> }> = []

async function render(snapshot: GovernanceApiSnapshot, canPublish = false, _runtimeMode = 'verified-session') {
  mocks.loadGovernance.mockResolvedValue({ payload: snapshot, revision: snapshot.revision })
  mocks.allows.mockReturnValue(canPublish)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => { root.render(<GovernanceCenter employees={[]} departments={[]} roles={[]} currentOrganizationVersionId="organization-current" initialSection="versions" />) })
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
})
afterEach(() => { for (const { root, host } of mounted.splice(0)) { act(() => root.unmount()); host.remove() } })

describe('governance version presentation', () => {
  it('does not hide withdrawal publication merely because the external catalog is unavailable', async () => {
    const snapshot = fixture()
    snapshot.catalogs[0].validationState = 'unavailable'
    const host = await render(snapshot, true)
    expect([...host.querySelectorAll('button')].some(node => node.textContent === '發布新版本')).toBe(true)
    expect([...host.querySelectorAll('button')].some(node => /改用第/.test(node.textContent ?? ''))).toBe(false)
  })
  it('shows the exact selected older version first, meaningful reasons and Taipei dates without mutating history', async () => {
    const snapshot = fixture()
    const host = await render(snapshot)
    expect(host.querySelector('[aria-label="OrgMaster 目前使用的版本"]')?.textContent).toContain('第7版')
    expect([...host.querySelectorAll('.governance-version-record h4')].map((node) => node.textContent)).toEqual(['第7版', '第9版', '第8版', '第6版'])
    expect(snapshot.versions.map((entry) => entry.versionNumber)).toEqual([6, 7, 9, 8])
    expect(host.textContent).toContain('第7次角色調整')
    expect(host.textContent).toContain('2026/10/05 07:06')
    expect(host.textContent).not.toContain('草稿更新 2026/10/06 16:05')
    for (const text of ['current-unreadable-machine-id', 'V3 指派治理', '尚未同步至外部系統', '本機治理沙盒', '目前生效']) expect(host.textContent).not.toContain(text)
    expect([...host.querySelectorAll('button')].some((node) => /改用|發布新版本/.test(node.textContent ?? ''))).toBe(false)
    expect(host.querySelector('.governance-publish-readiness')).toBeNull()
  })

  it('does not guess a current version when its record is missing and offers reload', async () => {
    const host = await render(fixture('missing-current'))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('目前使用的版本資料未載入')
    expect(host.querySelector('.governance-version-current')).toBeNull()
    const reload = [...host.querySelectorAll('button')].find((node) => node.textContent === '重新載入')!
    await act(async () => reload.click())
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
  })

  it('keeps unselected history and an empty history distinct', async () => {
    const snapshot = fixture(null)
    const host = await render(snapshot)
    expect(host.textContent).toContain('尚未選用發布版本')
    expect(host.querySelector('.governance-version-current')).toBeNull()
    const empty = await render({ ...snapshot, versions: [] })
    expect(empty.textContent).toContain('尚無發布紀錄')
    expect(empty.querySelector('.governance-version-history')).toBeNull()
  })

  it('keeps existing publish gates and exact-version reactivation with no action on older schemas', async () => {
    mocks.setActiveGovernanceVersion.mockResolvedValue({ payload: { activePolicyVersionId: 'version-8' } })
    const host = await render(fixture(), true)
    const publish = [...host.querySelectorAll('button')].find((node) => node.textContent === '發布新版本')!
    expect(publish.disabled).toBe(true)
    expect([...host.querySelectorAll('button')].some((node) => node.textContent === '改用第6版')).toBe(false)
    const switchVersion = [...host.querySelectorAll('button')].find((node) => node.textContent === '改用第8版')!
    await act(async () => switchVersion.click())
    expect(mocks.setActiveGovernanceVersion).toHaveBeenCalledWith('governance-revision', expect.any(String), '重新啟用角色指派版本', 'version-8', undefined, undefined)
  })

  it('omits the removed governance heading in a local development session', async () => {
    const host = await render(fixture(), false, 'local-development')
    expect(host.textContent).not.toContain('本機治理沙盒')
  })

  it('shows a visible initial network failure without an assignment matrix, then reloads on refresh', async () => {
    const networkFailure = new TypeError('Failed to fetch')
    mocks.loadGovernance.mockRejectedValueOnce(networkFailure).mockResolvedValueOnce({ payload: fixture('version-7'), revision: 'governance-revision' })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    mounted.push({ host, root })

    await act(async () => { root.render(<GovernanceCenter employees={[]} departments={[]} roles={[]} currentOrganizationVersionId="organization-current" initialSection="assignments" refreshToken={0} />) })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('治理操作未完成')
    expect(host.querySelector('.governance-matrix')).toBeNull()
    expect(host.textContent).not.toContain('系統 × 角色指派矩陣')

    await act(async () => { root.render(<GovernanceCenter employees={[]} departments={[]} roles={[]} currentOrganizationVersionId="organization-current" initialSection="assignments" refreshToken={1} />) })
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.querySelector('.governance-matrix')).not.toBeNull()
    expect(mocks.loadGovernance).toHaveBeenCalledTimes(2)
  })
})
