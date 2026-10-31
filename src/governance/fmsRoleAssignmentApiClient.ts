import { captureOrgMasterPermissionInvalidation } from '../auth/permissionInvalidation'
import type { FinancialRoleAssignmentWorkspace } from '../../server/applicationRoleAssignmentStore'
import type { FinancialRoleAssignmentInput } from '../../server/applicationEntitlementCommon'
import type { FinancialEmployeeDirectory } from '../../server/fmsEmployeeDirectory'
import type { GovernanceCommandReceiptV2 } from './types'

const API_PATH = '/api/orgmaster/governance'
const FMS_PATH = '/applications/financial-management-system'

export type FmsRoleAssignment = FinancialRoleAssignmentWorkspace['assignments'][number]
export type FmsAssignableRole = FinancialRoleAssignmentWorkspace['roles'][number]
export type FmsRoleAssignmentPreview = {
  applicationId: 'financial-management-system'
  catalogBinding: FinancialRoleAssignmentWorkspace['catalogBinding']
  beforeAssignments: FmsRoleAssignment[]
  afterAssignments: FmsRoleAssignment[]
  candidateAssignmentVersionId: string | null
  incompatibleAssignmentIds: string[]
  authorizationEffect: 'not_committed'
  organizationRevision: string
  requestHash: string
  previewHash: string
}
export type FmsRoleAssignmentPublishCommand = {
  commandId: string
  requestHash: string
  previewHash: string
}

export class FmsRoleAssignmentApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
    this.name = 'FmsRoleAssignmentApiError'
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function receiptPayload(value: unknown): value is GovernanceCommandReceiptV2 {
  const body = record(value)
  return body?.contractVersion === 'orgmaster.governance-command-receipt.v2'
    && typeof body.commandId === 'string'
    && typeof body.requestHash === 'string'
    && typeof body.previewHash === 'string'
    && ['processing', 'applied', 'rejected', 'not_found'].includes(String(body.receiptStatus))
    && typeof body.governanceRevision === 'string'
}

async function requestJson<T>(path: string, init: RequestInit = {}, allowNotFoundReceipt = false): Promise<T> {
  const invalidate = captureOrgMasterPermissionInvalidation()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_PATH}${path}`, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
  })
  const payload: unknown = await response.json().catch(() => null)
  const notFoundReceipt = allowNotFoundReceipt && response.status === 404
    && receiptPayload(payload) && payload.receiptStatus === 'not_found'
  if (!response.ok && !notFoundReceipt) {
    if (response.status === 401) invalidate('unauthenticated')
    else if (response.status === 403) invalidate('forbidden')
    const body = record(payload)
    throw new FmsRoleAssignmentApiError(
      typeof body?.code === 'string' ? body.code : typeof body?.error === 'string' ? body.error : 'GOVERNANCE_REQUEST_FAILED',
      response.status,
    )
  }
  return payload as T
}

export function loadFmsRoleAssignmentWorkspace() {
  return requestJson<FinancialRoleAssignmentWorkspace>(`${FMS_PATH}/role-assignments`)
}

/** Read one bounded page from the canonical employee directory. */
export function searchFmsEmployeeDirectory(query: string, cursor: string | null = null) {
  const search = new URLSearchParams({ q: query, limit: '50' })
  if (cursor) search.set('cursor', cursor)
  return requestJson<FinancialEmployeeDirectory>(`${FMS_PATH}/employees?${search.toString()}`)
}

export function previewFmsRoleAssignment(input: FinancialRoleAssignmentInput) {
  return requestJson<FmsRoleAssignmentPreview>(`${FMS_PATH}/role-assignments/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function publishFmsRoleAssignment(input: FinancialRoleAssignmentInput, command: FmsRoleAssignmentPublishCommand) {
  return requestJson<GovernanceCommandReceiptV2>(`${FMS_PATH}/role-assignments/publish`, {
    method: 'POST',
    body: JSON.stringify({ ...input, ...command }),
  })
}

export function loadFmsRoleAssignmentReceipt(commandId: string) {
  return requestJson<GovernanceCommandReceiptV2>(
    `${FMS_PATH}/role-assignments/commands/${encodeURIComponent(commandId)}`,
    { method: 'GET' },
    true,
  )
}
