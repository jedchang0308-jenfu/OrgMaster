/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readAiPdmRoleCatalog } from '../governance/aiPdmCatalog'
import { aiPdmRoleProfiles } from '../governance/aiPdmRoleSchema'
import type { GovernanceApiSnapshot } from '../governance/apiClient'
import { createSeedDocumentV2 } from '../governance/migrateGovernanceV1ToV2'
import type { GovernanceCommandV2, GovernanceRoleAssignmentV2 } from '../governance/types'
import type { Employee } from '../types'
import { GovernanceCenter } from './GovernanceCenter'

const mocks = vi.hoisted(() => ({ loadGovernance: vi.fn(), loadGovernanceSession: vi.fn(), patchGovernanceDraft: vi.fn() }))
vi.mock('../governance/apiClient', async original => ({ ...await original<typeof import('../governance/apiClient')>(), ...mocks }))

const employees: Employee[] = [
  { id: 'employee-source', name: '來源人員', status: 'active', departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-recipient', name: '代理人員', status: 'active', departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
  { id: 'employee-inactive', name: '停用人員', status: 'inactive', departmentIds: [], primaryAssignmentId: null, administrativeApproverOverrideEmployeeId: null },
]

function fixture(): GovernanceApiSnapshot {
  const catalog = structuredClone(readAiPdmRoleCatalog())
  const profiles = aiPdmRoleProfiles(catalog.roles)
  catalog.roles = catalog.roles.map((role, index) => ({ ...role, ...profiles[index] }))
  const rd = catalog.roles.find(role => role.stableRoleId === 'role-rd')!
  catalog.roles.push({ ...rd, stableRoleId: 'role-custom-inactive', code: 'custom_inactive', displayName: '停用自訂角色', status: 'inactive',
    permissionRoleId: 'role-custom-inactive', presentationName: '停用自訂角色', presentationOrder: 7, assignmentDisposition: 'selectable' })
  const document = createSeedDocumentV2('2026-10-25T00:00:00.000Z')
  const assignment = (id: string, roleId: string, overrides: Partial<GovernanceRoleAssignmentV2> = {}): GovernanceRoleAssignmentV2 => {
    const role = catalog.roles.find(candidate => candidate.stableRoleId === roleId)!
    return {
      id, applicationId: 'ai-pdm', employeeId: 'employee-source', roleId,
      roleCodeSnapshot: role.code, roleNameSnapshot: role.displayName,
      catalogVersion: catalog.catalogVersion, scope: { kind: 'workspace', value: 'current' },
      status: 'active', validFrom: '2020-01-01T00:00:00.000Z', validTo: '2099-01-01T00:00:00.000Z',
      effectState: 'not-synchronized', ...overrides,
    }
  }
  document.draft.roleAssignments = [
    assignment('source-valid', 'role-rd'),
    assignment('source-no-delegation', 'role-external-specialist', { scope: { kind: 'project', value: 'P1' } }),
    assignment('source-legacy-only', 'role-production-planning'),
    assignment('source-protected', 'role-system-admin', { scope: { kind: 'global' } }),
    assignment('source-inactive-role', 'role-custom-inactive'),
    assignment('source-expired', 'role-rd', { validFrom: '2000-01-01T00:00:00.000Z', validTo: '2001-01-01T00:00:00.000Z' }),
    assignment('source-inactive-employee', 'role-rd', { employeeId: 'employee-inactive' }),
  ]
  return { document: { ...document, draft: { ...document.draft, identityLinks: [] }, publishedVersions: [] }, catalogs: [catalog], revision: 'r1', activeVersionId: null, versions: [] }
}

let host: HTMLDivElement
let root: Root

async function render(snapshot = fixture()) {
  mocks.loadGovernance.mockResolvedValue({ payload: snapshot, revision: snapshot.revision })
  mocks.loadGovernanceSession.mockResolvedValue({ payload: { runtimeMode: 'verified-session', actor: { principalId: 'principal-operator', employeeId: 'employee-recipient' }, capabilities: { manage: true, publish: true, simulate: true } } })
  mocks.patchGovernanceDraft.mockImplementation(async (_revision: string, command: GovernanceCommandV2) => {
    const document = structuredClone(snapshot.document)
    if (command.type === 'UPSERT_ROLE_DELEGATION') document.draft.roleDelegations.push(command.value)
    return { revision: 'r2', payload: { document, revision: 'r2', status: 'applied' } }
  })
  await act(async () => root.render(<GovernanceCenter employees={employees} departments={[]} roles={[]} currentOrganizationVersionId="org-current" initialSection="delegation" />))
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set
  setter?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

it('offers only a current active delegable role assignment from an active employee', async () => {
  await render()
  const [source, recipient] = host.querySelectorAll('select')
  expect([...source.options].map(option => option.value)).toEqual(['', 'source-valid'])
  expect(recipient.disabled).toBe(true)

  await act(async () => change(source, 'source-valid'))
  expect(recipient.disabled).toBe(false)
  expect([...recipient.options].map(option => option.value)).toEqual(['', 'employee-recipient'])
})

it('submits and reads back the complete eligible delegation without widening its source', async () => {
  const snapshot = fixture()
  await render(snapshot)
  const source = host.querySelectorAll('select')[0]
  await act(async () => change(source, 'source-valid'))
  const recipient = host.querySelectorAll('select')[1]
  const inputs = host.querySelectorAll('input')
  await act(async () => change(recipient, 'employee-recipient'))
  await act(async () => change(inputs[0], '2098-01-01T00:00'))
  await act(async () => change(inputs[1], '代理研發工作'))
  expect(source.value).toBe('source-valid')
  expect(recipient.value).toBe('employee-recipient')
  expect(inputs[0].value).toBe('2098-01-01T00:00')
  expect(inputs[1].value).toBe('代理研發工作')
  const submit = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '建立代理')!
  await act(async () => submit.click())
  expect(host.querySelector('[role="alert"]')?.textContent).toBeUndefined()

  const command = mocks.patchGovernanceDraft.mock.calls[0][1] as GovernanceCommandV2
  expect(command).toMatchObject({
    type: 'UPSERT_ROLE_DELEGATION',
    value: {
      sourceAssignmentId: 'source-valid', fromEmployeeId: 'employee-source', toEmployeeId: 'employee-recipient',
      applicationId: 'ai-pdm', roleId: 'role-rd', catalogVersion: snapshot.catalogs[0].catalogVersion,
      scope: { kind: 'workspace', value: 'current' }, validFrom: '2020-01-01T00:00:00.000Z',
      reason: '代理研發工作', effectState: 'not-synchronized',
    },
  })
  if (command.type !== 'UPSERT_ROLE_DELEGATION') throw new Error('unexpected command')
  expect(command.value.validTo).toBe(new Date('2098-01-01T00:00').toISOString())
  expect(host.textContent).toContain('來源人員 → 代理人員')
  expect(host.textContent).toContain('RD · workspace：current')
})
