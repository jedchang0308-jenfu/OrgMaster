import { Buffer } from 'node:buffer'
import type { GovernanceActorContext } from '../src/governance/types'
import { readGovernanceStore, loadOrganizationSource } from './orgmasterGovernanceStore'
import { ApplicationEntitlementError, assertFinancialAuthority, FINANCIAL_APPLICATION_ID,
  FINANCIAL_ROLE_ASSIGNMENT_MANAGE, isActiveEmployee } from './applicationEntitlementCommon'

const MAX_LIMIT = 50
const normalized = (value: string) => value.normalize('NFKC').trim().toLowerCase()
function invalid(): never { throw new ApplicationEntitlementError('INVALID_COMMAND') }

type Cursor = { v: 1; revision: string; query: string; lastId: string }
export type FinancialEmployeeDirectory = {
  contractVersion: 'orgmaster.fms-employee-directory.v1'
  applicationId: typeof FINANCIAL_APPLICATION_ID
  directoryRevision: string
  governanceRevision: string
  readAt: string
  items: Array<{ employeeId: string; displayName: string; employeeNumber: null; active: true; assignable: true }>
  cursor: string | null
}

function parameters(search: URLSearchParams) {
  const keys = [...search.keys()]
  if (keys.some(key => !['q', 'limit', 'cursor'].includes(key)) || new Set(keys).size !== keys.length) invalid()
  const query = normalized(search.get('q') ?? '')
  if (query.length > 80) invalid()
  const rawLimit = search.get('limit')
  if (rawLimit !== null && !/^[1-9][0-9]?$/u.test(rawLimit)) invalid()
  const limit = rawLimit === null ? 20 : Number(rawLimit)
  if (limit > MAX_LIMIT) invalid()
  let cursor: Cursor | null = null
  const rawCursor = search.get('cursor')
  if (rawCursor !== null) {
    if (!rawCursor || rawCursor.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(rawCursor)) invalid()
    try {
      const bytes = Buffer.from(rawCursor, 'base64url')
      if (bytes.toString('base64url') !== rawCursor) invalid()
      const value: unknown = JSON.parse(bytes.toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
      const row = value as Record<string, unknown>
      if (Object.keys(row).sort().join(',') !== 'lastId,query,revision,v' || row.v !== 1
        || typeof row.revision !== 'string' || !row.revision || row.revision.length > 2048
        || row.query !== query || typeof row.lastId !== 'string' || !row.lastId || row.lastId.length > 2048) invalid()
      cursor = row as Cursor
    } catch { invalid() }
  }
  return { query, limit, cursor }
}

/** Canonical directory for the existing FMS assignment administrator; no local users or HR details. */
export async function readFinancialEmployeeDirectory(root: string, actor: GovernanceActorContext,
  search = new URLSearchParams()): Promise<FinancialEmployeeDirectory> {
  const current = await readGovernanceStore(root)
  // Check the same owner role plus exact-Principal grant as the existing assignment workspace.
  assertFinancialAuthority(current.document, actor, FINANCIAL_ROLE_ASSIGNMENT_MANAGE)
  const { query, limit, cursor } = parameters(search)
  const source = await loadOrganizationSource(root)
  if (cursor && cursor.revision !== source.workspaceRevision) {
    throw new ApplicationEntitlementError('ORGANIZATION_REVISION_CONFLICT')
  }
  const employees = source.state.employees
    .filter(employee => isActiveEmployee(source, employee.id)
      && (!query || normalized(employee.id).includes(query) || normalized(employee.name ?? '').includes(query)))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  if (cursor && !employees.some(employee => employee.id === cursor.lastId)) invalid()
  const remaining = employees.filter(employee => !cursor || employee.id > cursor.lastId)
  const selected = remaining.slice(0, limit)
  const next: Cursor | null = remaining.length > limit
    ? { v: 1, revision: source.workspaceRevision, query, lastId: selected.at(-1)!.id }
    : null
  return {
    contractVersion: 'orgmaster.fms-employee-directory.v1', applicationId: FINANCIAL_APPLICATION_ID,
    directoryRevision: source.workspaceRevision, governanceRevision: current.revision, readAt: new Date().toISOString(),
    items: selected.map(employee => ({ employeeId: employee.id, displayName: employee.name?.trim() || employee.id,
      // The canonical Employee document does not carry a verified employee number.
      employeeNumber: null, active: true, assignable: true })),
    cursor: next ? Buffer.from(JSON.stringify(next), 'utf8').toString('base64url') : null,
  }
}
