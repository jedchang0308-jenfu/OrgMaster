import { captureOrgMasterPermissionInvalidation } from '../auth/permissionInvalidation'
import type { FinancialCatalogActivationInput, FinancialCatalogActivationPublishInput } from '../../server/financialCatalogActivationStore'
import type { FmsCatalogReleaseInput } from '../../server/financialCatalogReleaseStore'
import type { GovernanceCommandReceiptV2 } from './types'
import type { CatalogActivationExpected } from '../../server/financialCatalogIntent'

const API_PATH = '/api/orgmaster/governance'
const FMS_PATH = '/applications/financial-management-system'
const APPLICATION_ID = 'financial-management-system'
const SHA256 = /^[a-f0-9]{64}$/u
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u

export type FmsCatalogActivationWorkspace = {
  fmsOrigin: string | null
  applicationId: typeof APPLICATION_ID
  governanceRevision: string
  organizationRevision: string
  assignmentVersion: string
  activeCatalog: FmsCatalogBinding
  allowedOperations: { preview: boolean; activate: boolean }
}

export type FmsCatalogBinding = {
  applicationId: typeof APPLICATION_ID
  catalogVersion: string
  contentSha256: string
  artifactSha256: string | null
}

export type FmsCatalogActivationPreview = {
  applicationId: typeof APPLICATION_ID
  requestHash: string
  previewHash: string
  before: FmsCatalogBinding
  after: FmsCatalogBinding
  assignmentVersion: string
  expected: CatalogActivationExpected
  addedRoles: Array<{ stableRoleId: string; displayName: string }>
  removedRoles: Array<{ stableRoleId: string; displayName: string }>
  changedRoles: Array<{
    stableRoleId: string
    displayName: string
    addedCapabilities: string[]
    removedCapabilities: string[]
    renamed: boolean
    assignmentPolicyChanged: boolean
  }>
  affectedAssignmentCount: number
  preservedAssignmentIds: string[]
  removedAssignedRoleIds: string[]
  compatible: boolean
  alreadyActive: boolean
  organizationRevision: string
  allowedOperations: { activate: boolean }
}

export type FmsCatalogActivationPreviewRequest = FinancialCatalogActivationInput & {
  release: FmsCatalogReleaseInput
}

export type FmsCatalogActivationRequest = FinancialCatalogActivationPublishInput & {
  release: FmsCatalogReleaseInput
}

export type FmsCatalogActivationResult = GovernanceCommandReceiptV2 & {
  authorizationEffect: 'committed' | 'replayed'
}

export class FmsCatalogActivationApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
    this.name = 'FmsCatalogActivationApiError'
  }
}

export class FmsCatalogActivationCommandUnknownError extends FmsCatalogActivationApiError {
  constructor(
    readonly commandId: string,
    readonly state: 'outcome_unknown' | 'not_observed',
    status: number,
  ) {
    super(state === 'not_observed' ? 'COMMAND_NOT_OBSERVED' : 'COMMAND_OUTCOME_UNKNOWN', status)
    this.name = 'FmsCatalogActivationCommandUnknownError'
  }
}

type Fetcher = typeof fetch
type Guard<T> = (value: unknown) => value is T

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableText(value: unknown): value is string | null {
  return value === null || nonEmptyString(value)
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value)
}

function textArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString)
}

function validInstant(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value))
}

function nullableInstant(value: unknown): value is string | null {
  return value === null || validInstant(value)
}

function isBinding(value: unknown): value is FmsCatalogBinding {
  const body = record(value)
  return body?.applicationId === APPLICATION_ID
    && nonEmptyString(body.catalogVersion)
    && sha256(body.contentSha256)
    && (body.artifactSha256 === null || sha256(body.artifactSha256))
}

function isRoleSummary(value: unknown): value is { stableRoleId: string; displayName: string } {
  const body = record(value)
  return nonEmptyString(body?.stableRoleId) && nonEmptyString(body?.displayName)
}

function isChangedRole(value: unknown): value is FmsCatalogActivationPreview['changedRoles'][number] {
  const body = record(value)
  return nonEmptyString(body?.stableRoleId) && nonEmptyString(body?.displayName)
    && textArray(body?.addedCapabilities) && textArray(body?.removedCapabilities)
    && typeof body?.renamed === 'boolean' && typeof body?.assignmentPolicyChanged === 'boolean'
}

function isWorkspace(value: unknown): value is FmsCatalogActivationWorkspace {
  const body = record(value)
  const operations = record(body?.allowedOperations)
  return body?.applicationId === APPLICATION_ID
    && (body.fmsOrigin === null || nonEmptyString(body.fmsOrigin) && (() => { try { const url = new URL(body.fmsOrigin); return url.origin === body.fmsOrigin && ['http:', 'https:'].includes(url.protocol) } catch { return false } })())
    && nonEmptyString(body.governanceRevision)
    && nonEmptyString(body.organizationRevision)
    && nonEmptyString(body.assignmentVersion)
    && isBinding(body.activeCatalog)
    && operations?.preview === true
    && typeof operations.activate === 'boolean'
}

function isPreview(value: unknown): value is FmsCatalogActivationPreview {
  const body = record(value)
  const operations = record(body?.allowedOperations)
  const expected = record(body?.expected)
  return body?.applicationId === APPLICATION_ID
    && sha256(body.requestHash) && sha256(body.previewHash)
    && isBinding(body.before) && isBinding(body.after)
    && nonEmptyString(body.assignmentVersion)
    && nonEmptyString(expected?.governanceRevision) && expected?.assignmentVersion === body.assignmentVersion
    && expected?.catalogBindingRevision === record(body.before)?.contentSha256 && nonEmptyString(expected?.grantRevision)
    && Array.isArray(body.addedRoles) && body.addedRoles.every(isRoleSummary)
    && Array.isArray(body.removedRoles) && body.removedRoles.every(isRoleSummary)
    && Array.isArray(body.changedRoles) && body.changedRoles.every(isChangedRole)
    && Number.isSafeInteger(body.affectedAssignmentCount) && Number(body.affectedAssignmentCount) >= 0
    && textArray(body.preservedAssignmentIds) && textArray(body.removedAssignedRoleIds)
    && typeof body.compatible === 'boolean'
    && body.compatible === (body.removedAssignedRoleIds.length === 0)
    && typeof body.alreadyActive === 'boolean'
    && nonEmptyString(body.organizationRevision)
    && typeof operations?.activate === 'boolean'
    && (!operations.activate || (body.compatible && !body.alreadyActive))
}

function isActivationRecord(value: unknown): value is NonNullable<GovernanceCommandReceiptV2['financialCatalogActivation']> {
  const body = record(value)
  return body?.contractVersion === 'orgmaster.fms-catalog-activation-record.v1'
    && nonEmptyString(body.principalId)
    && nonEmptyString(body.employeeId)
    && nonEmptyString(body.catalogVersion)
    && sha256(body.contentSha256)
    && sha256(body.artifactSha256)
    && nonEmptyString(body.governanceRevisionBefore)
    && nonEmptyString(body.organizationRevision)
    && nonEmptyString(body.assignmentVersionBefore)
    && nonEmptyString(body.catalogBindingRevisionBefore)
    && nonEmptyString(body.grantRevisionBefore)
    && nonEmptyString(body.assignmentVersionAfter)
    && sha256(body.publishedSnapshotHash)
    && textArray(body.grantIds)
    && Number.isSafeInteger(body.authEpoch) && Number(body.authEpoch) >= 0
    && validInstant(body.authenticatedAt)
    && validInstant(body.authorityReadAt)
}

function isReceipt(value: unknown): value is GovernanceCommandReceiptV2 {
  const body = record(value)
  if (body?.contractVersion !== 'orgmaster.governance-command-receipt.v2'
    || !nonEmptyString(body.commandId)
    || !['processing', 'applied', 'rejected', 'not_found'].includes(String(body.receiptStatus))
    || !nullableInstant(body.acceptedAt)
    || !nullableInstant(body.terminalAt)
    || !nullableText(body.decisionCode)
    || !nullableText(body.auditReference)
    || !nullableText(body.securityAlertReference)
    || !['completed', 'pending'].includes(String(body.sessionRefresh))
    || !nonEmptyString(body.governanceRevision)
    || typeof body.replayed !== 'boolean'
    || !Number.isSafeInteger(body.attempt) || Number(body.attempt) < 0) return false

  if (body.receiptStatus === 'not_found') {
    return body.requestHash === '' && body.previewHash === ''
      && body.acceptedAt === null && body.terminalAt === null
      && body.decisionCode === 'COMMAND_NOT_FOUND'
      && body.auditReference === null && body.securityAlertReference === null
      && body.sessionRefresh === 'pending' && body.attempt === 0
      && body.financialCatalogActivation === undefined
  }

  if (!sha256(body.requestHash) || !sha256(body.previewHash)) return false
  if (body.receiptStatus === 'applied') {
    return validInstant(body.acceptedAt) && validInstant(body.terminalAt)
      && nonEmptyString(body.decisionCode) && nonEmptyString(body.auditReference)
      && Number(body.attempt) >= 1 && isActivationRecord(body.financialCatalogActivation)
  }
  if (body.financialCatalogActivation !== undefined) return false
  if (body.receiptStatus === 'processing') {
    return validInstant(body.acceptedAt) && body.terminalAt === null && body.auditReference === null
  }
  return validInstant(body.acceptedAt) && validInstant(body.terminalAt) && nonEmptyString(body.decisionCode)
}

function isActivationResult(value: unknown): value is FmsCatalogActivationResult {
  const body = record(value)
  return isReceipt(value) && body?.receiptStatus === 'applied'
    && (body.authorizationEffect === 'committed' || body.authorizationEffect === 'replayed')
    && body.authorizationEffect === (body.replayed ? 'replayed' : 'committed')
}

function isRelease(value: unknown): value is FmsCatalogReleaseInput {
  const body = record(value)
  const createdBy = record(body?.createdBy)
  return body?.applicationId === APPLICATION_ID
    && nonEmptyString(body.version)
    && sha256(body.contentSha256) && sha256(body.artifactSha256)
    && typeof body.artifactUtf8 === 'string'
    && nonEmptyString(body.sourceDraftId)
    && Number.isSafeInteger(body.sourceDraftRevision) && Number(body.sourceDraftRevision) >= 0
    && nonEmptyString(createdBy?.principalId) && nonEmptyString(createdBy?.employeeId)
    && validInstant(body.createdAt)
}

function isActivationInput(value: FmsCatalogActivationRequest): boolean {
  return isRelease(value.release)
    && nonEmptyString(value.reason)
    && nonEmptyString(value.expectedGovernanceRevision)
    && nonEmptyString(value.expectedOrganizationRevision)
    && nonEmptyString(value.commandId)
    && sha256(value.requestHash)
    && sha256(value.previewHash)
}

function isPreviewInput(value: FmsCatalogActivationPreviewRequest): boolean {
  return isRelease(value.release)
    && nonEmptyString(value.reason)
    && nonEmptyString(value.expectedGovernanceRevision)
    && nonEmptyString(value.expectedOrganizationRevision)
}

function safeErrorCode(payload: unknown): string {
  const code = record(payload)?.code
  return typeof code === 'string' && SAFE_ERROR_CODE.test(code) ? code : 'GOVERNANCE_REQUEST_FAILED'
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  isPayload: Guard<T>,
  fetchImpl: Fetcher,
  commandId?: string,
  notObservedOn404 = false,
): Promise<T> {
  const invalidate = captureOrgMasterPermissionInvalidation()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetchImpl(`${API_PATH}${path}`, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    })
  } catch {
    if (commandId) throw new FmsCatalogActivationCommandUnknownError(commandId, 'outcome_unknown', 0)
    throw new FmsCatalogActivationApiError('GOVERNANCE_REQUEST_FAILED', 0)
  }

  const payload: unknown = await response.json().catch(() => null)
  if (response.status === 401) invalidate('unauthenticated')
  else if (response.status === 403) invalidate('forbidden')

  if (commandId && response.status === 404) {
    throw new FmsCatalogActivationCommandUnknownError(
      commandId,
      notObservedOn404 ? 'not_observed' : 'outcome_unknown',
      response.status,
    )
  }
  if (commandId && response.status >= 500) {
    throw new FmsCatalogActivationCommandUnknownError(commandId, 'outcome_unknown', response.status)
  }
  if (!response.ok) {
    throw new FmsCatalogActivationApiError(safeErrorCode(payload), response.status)
  }
  if (!isPayload(payload)) {
    if (commandId) throw new FmsCatalogActivationCommandUnknownError(commandId, 'outcome_unknown', response.status)
    throw new FmsCatalogActivationApiError('INVALID_API_RESPONSE', response.status)
  }
  return payload
}

function validatePreviewTuple(
  preview: FmsCatalogActivationPreview,
  request: FmsCatalogActivationPreviewRequest,
): boolean {
  return preview.after.catalogVersion === request.release.version
    && preview.after.contentSha256 === request.release.contentSha256
    && preview.after.artifactSha256 === request.release.artifactSha256
    && preview.organizationRevision === request.expectedOrganizationRevision
}

function validateActivationTuple(
  result: FmsCatalogActivationResult,
  request: FmsCatalogActivationRequest,
): boolean {
  const proof = result.financialCatalogActivation
  return result.commandId === request.commandId
    && result.requestHash === request.requestHash
    && result.previewHash === request.previewHash
    && proof?.catalogVersion === request.release.version
    && proof.contentSha256 === request.release.contentSha256
    && proof.artifactSha256 === request.release.artifactSha256
    && proof.governanceRevisionBefore === request.expectedGovernanceRevision
    && proof.organizationRevision === request.expectedOrganizationRevision
}

export function loadFmsCatalogActivationWorkspace(fetchImpl: Fetcher = fetch) {
  return requestJson<FmsCatalogActivationWorkspace>(
    `${FMS_PATH}/catalog/activation`,
    { method: 'GET' },
    isWorkspace,
    fetchImpl,
  )
}

export function previewFmsCatalogActivation(
  input: FmsCatalogActivationPreviewRequest,
  fetchImpl: Fetcher = fetch,
) {
  if (!isPreviewInput(input)) throw new FmsCatalogActivationApiError('INVALID_COMMAND', 0)
  return requestJson<FmsCatalogActivationPreview>(
    `${FMS_PATH}/catalog/activation/preview`,
    { method: 'POST', body: JSON.stringify(input) },
    (payload): payload is FmsCatalogActivationPreview =>
      isPreview(payload) && validatePreviewTuple(payload, input),
    fetchImpl,
  )
}

export function activateFmsCatalog(
  input: FmsCatalogActivationRequest,
  fetchImpl: Fetcher = fetch,
) {
  if (!isActivationInput(input)) throw new FmsCatalogActivationApiError('INVALID_COMMAND', 0)
  return requestJson<FmsCatalogActivationResult>(
    `${FMS_PATH}/catalog/activation/activate`,
    { method: 'POST', body: JSON.stringify(input) },
    (payload): payload is FmsCatalogActivationResult =>
      isActivationResult(payload) && validateActivationTuple(payload, input),
    fetchImpl,
    input.commandId,
  )
}

export async function loadFmsCatalogActivationReceipt(
  commandId: string,
  fetchImpl: Fetcher = fetch,
): Promise<GovernanceCommandReceiptV2> {
  if (!nonEmptyString(commandId)) throw new FmsCatalogActivationApiError('INVALID_COMMAND', 0)
  const receipt = await requestJson<GovernanceCommandReceiptV2>(
    `${FMS_PATH}/catalog/activation/commands/${encodeURIComponent(commandId)}`,
    { method: 'GET' },
    isReceipt,
    fetchImpl,
    commandId,
    true,
  )
  if (receipt.commandId !== commandId || receipt.receiptStatus === 'not_found') {
    throw new FmsCatalogActivationCommandUnknownError(commandId, 'not_observed', 404)
  }
  return receipt
}
