import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateFmsCatalog,
  FmsCatalogActivationApiError,
  loadFmsCatalogActivationReceipt,
  loadFmsCatalogActivationWorkspace,
  previewFmsCatalogActivation,
  type FmsCatalogActivationPreviewRequest,
  type FmsCatalogActivationRequest,
} from './fmsCatalogActivationApiClient'

const state = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('../auth/permissionInvalidation', () => ({
  captureOrgMasterPermissionInvalidation: () => state.invalidate,
}))

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)
const release = {
  applicationId: 'financial-management-system' as const,
  version: 'fms-v8',
  contentSha256: hashB,
  artifactSha256: hashC,
  artifactUtf8: '{}\n',
  sourceDraftId: 'draft-8',
  sourceDraftRevision: 8,
  createdBy: { principalId: 'principal-1', employeeId: 'employee-1' },
  createdAt: '2026-11-01T00:00:00.000Z',
}
const previewInput: FmsCatalogActivationPreviewRequest = {
  release,
  reason: '年度目錄更新',
  expectedGovernanceRevision: 'gov-r1',
  expectedOrganizationRevision: 'org-r1',
}
const activationInput: FmsCatalogActivationRequest = {
  ...previewInput,
  commandId: 'activation-command-01',
  requestHash: hashA,
  previewHash: hashC,
}
const binding = (catalogVersion: string, contentSha256: string, artifactSha256: string | null) => ({
  applicationId: 'financial-management-system' as const,
  catalogVersion,
  contentSha256,
  artifactSha256,
})
const workspace = {
  fmsOrigin: null,
  applicationId: 'financial-management-system' as const,
  governanceRevision: 'gov-r1',
  organizationRevision: 'org-r1',
  assignmentVersion: 'assignment-v7',
  activeCatalog: binding('fms-v7', hashA, hashA),
  allowedOperations: { preview: true, activate: true },
}
const preview = {
  applicationId: 'financial-management-system' as const,
  requestHash: hashA,
  previewHash: hashC,
  before: binding('fms-v7', hashA, hashA),
  after: binding(release.version, release.contentSha256, release.artifactSha256),
  assignmentVersion: 'assignment-v7',
  expected: { governanceRevision: 'gov-r1', assignmentVersion: 'assignment-v7', catalogBindingRevision: hashA, grantRevision: 'gov-r1' },
  addedRoles: [{ stableRoleId: 'finance-auditor', displayName: '財務稽核' }],
  removedRoles: [],
  changedRoles: [{
    stableRoleId: 'finance-lead',
    displayName: '財務主管',
    addedCapabilities: ['catalog.read'],
    removedCapabilities: [],
    renamed: false,
    assignmentPolicyChanged: false,
  }],
  affectedAssignmentCount: 1,
  preservedAssignmentIds: ['assignment-1'],
  removedAssignedRoleIds: [],
  compatible: true,
  alreadyActive: false,
  organizationRevision: 'org-r1',
  allowedOperations: { activate: true },
}
const activationProof = {
  contractVersion: 'orgmaster.fms-catalog-activation-record.v1',
  principalId: 'principal-1',
  employeeId: 'employee-1',
  catalogVersion: release.version,
  contentSha256: release.contentSha256,
  artifactSha256: release.artifactSha256,
  governanceRevisionBefore: 'gov-r1',
  organizationRevision: 'org-r1',
  assignmentVersionBefore: 'assignment-v7',
  catalogBindingRevisionBefore: hashA,
  grantRevisionBefore: 'gov-r1',
  assignmentVersionAfter: 'assignment-v8',
  publishedSnapshotHash: hashA,
  grantIds: ['grant-fms-catalog'],
  authEpoch: 2,
  authenticatedAt: '2026-11-01T01:00:00.000Z',
  authorityReadAt: '2026-11-01T01:00:00.000Z',
}
const activationResult = {
  contractVersion: 'orgmaster.governance-command-receipt.v2',
  commandId: activationInput.commandId,
  requestHash: activationInput.requestHash,
  previewHash: activationInput.previewHash,
  receiptStatus: 'applied',
  acceptedAt: '2026-11-01T01:00:00.000Z',
  terminalAt: '2026-11-01T01:00:01.000Z',
  decisionCode: 'COMMAND_APPLIED',
  auditReference: 'audit-activation-1',
  securityAlertReference: null,
  sessionRefresh: 'pending',
  governanceRevision: 'assignment-v8',
  replayed: false,
  attempt: 1,
  financialCatalogActivation: activationProof,
  authorizationEffect: 'committed',
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function fetcher(...responses: Response[]) {
  const mock = vi.fn<typeof fetch>()
  for (const result of responses) mock.mockResolvedValueOnce(result)
  return mock
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => vi.restoreAllMocks())

describe('FMS catalog activation API client', () => {
  it('parses workspace, preview, and committed receipt DTOs using the verified same-origin session', async () => {
    const requestFetch = fetcher(response(workspace), response(preview), response(activationResult))
    await expect(loadFmsCatalogActivationWorkspace(requestFetch)).resolves.toEqual(workspace)
    await expect(previewFmsCatalogActivation(previewInput, requestFetch)).resolves.toEqual(preview)
    await expect(activateFmsCatalog(activationInput, requestFetch)).resolves.toEqual(activationResult)

    expect(requestFetch).toHaveBeenNthCalledWith(1, '/api/orgmaster/governance/applications/financial-management-system/catalog/activation', expect.objectContaining({
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
    }))
    expect(requestFetch).toHaveBeenNthCalledWith(2, '/api/orgmaster/governance/applications/financial-management-system/catalog/activation/preview', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
    }))
    expect(requestFetch).toHaveBeenNthCalledWith(3, '/api/orgmaster/governance/applications/financial-management-system/catalog/activation/activate', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
    }))
    const headers = new Headers(requestFetch.mock.calls[0][1]?.headers)
    expect([...headers.keys()].sort()).toEqual(['accept'])
    expect(requestFetch.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'POST', 'POST'])
    expect(requestFetch.mock.calls[2][1]?.body).toBe(JSON.stringify(activationInput))
  })

  it('rejects a workspace for another application', async () => {
    const requestFetch = fetcher(response({ ...workspace, applicationId: 'ai-pdm' }))
    await expect(loadFmsCatalogActivationWorkspace(requestFetch)).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      status: 200,
    })
  })

  it('rejects malformed hashes and broken preview tuple shapes', async () => {
    const badHash = { ...preview, requestHash: 'not-a-sha256' }
    const badTuple = { ...preview, removedAssignedRoleIds: ['role-in-use'] }
    const requestFetch = fetcher(response(badHash), response(badTuple))

    await expect(previewFmsCatalogActivation(previewInput, requestFetch)).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      status: 200,
    })
    await expect(previewFmsCatalogActivation(previewInput, requestFetch)).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      status: 200,
    })
  })

  it('rejects an activation receipt whose proof does not match the original release or revision tuple', async () => {
    const invalidResult = {
      ...activationResult,
      financialCatalogActivation: { ...activationProof, organizationRevision: 'org-r2' },
    }
    await expect(activateFmsCatalog(activationInput, fetcher(response(invalidResult))))
      .rejects.toMatchObject({ code: 'COMMAND_OUTCOME_UNKNOWN', status: 200 })
  })

  it('keeps the caller command id and hashes unchanged and never retries activation', async () => {
    const requestFetch = fetcher(response(activationResult))
    await expect(activateFmsCatalog(activationInput, requestFetch)).resolves.toMatchObject({
      commandId: activationInput.commandId,
      requestHash: activationInput.requestHash,
      previewHash: activationInput.previewHash,
    })
    expect(requestFetch).toHaveBeenCalledTimes(1)
    expect(requestFetch.mock.calls[0][0]).toBe('/api/orgmaster/governance/applications/financial-management-system/catalog/activation/activate')
    expect(JSON.parse(String(requestFetch.mock.calls[0][1]?.body))).toMatchObject({
      commandId: activationInput.commandId,
      requestHash: activationInput.requestHash,
      previewHash: activationInput.previewHash,
    })
  })

  it('reports a 404 command readback as not observed, not as rejection or success', async () => {
    const commandId = activationInput.commandId
    const requestFetch = fetcher(response({
      contractVersion: 'orgmaster.governance-command-receipt.v2',
      commandId,
      requestHash: '',
      previewHash: '',
      receiptStatus: 'not_found',
      acceptedAt: null,
      terminalAt: null,
      decisionCode: 'COMMAND_NOT_FOUND',
      auditReference: null,
      securityAlertReference: null,
      sessionRefresh: 'pending',
      governanceRevision: 'gov-r1',
      replayed: false,
      attempt: 0,
    }, 404))

    await expect(loadFmsCatalogActivationReceipt(commandId, requestFetch)).rejects.toMatchObject({
      name: 'FmsCatalogActivationCommandUnknownError',
      code: 'COMMAND_NOT_OBSERVED',
      state: 'not_observed',
      commandId,
      status: 404,
    })
    expect(requestFetch).toHaveBeenCalledTimes(1)
    expect(requestFetch.mock.calls[0][0]).toBe('/api/orgmaster/governance/applications/financial-management-system/catalog/activation/commands/activation-command-01')
    expect(requestFetch.mock.calls[0][1]?.method).toBe('GET')
    expect(requestFetch).toHaveBeenCalledTimes(1)
  })

  it('sanitizes arbitrary remote error text while preserving a safe machine code', async () => {
    const requestFetch = fetcher(response({ code: 'CATALOG_INCOMPATIBLE', error: 'sensitive remote detail' }, 409))
    await expect(loadFmsCatalogActivationWorkspace(requestFetch)).rejects.toMatchObject({
      code: 'CATALOG_INCOMPATIBLE',
      status: 409,
      message: 'CATALOG_INCOMPATIBLE',
    })

    const malformedCodeFetch = fetcher(response({ code: '<script>remote text</script>', error: 'do not display' }, 500))
    await expect(loadFmsCatalogActivationWorkspace(malformedCodeFetch)).rejects.toMatchObject({
      code: 'GOVERNANCE_REQUEST_FAILED',
      message: 'GOVERNANCE_REQUEST_FAILED',
    })
  })

  it('marks a lost activation response as unknown and does not resend its command', async () => {
    const requestFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('private transport detail'))
    await expect(activateFmsCatalog(activationInput, requestFetch)).rejects.toMatchObject({
      code: 'COMMAND_OUTCOME_UNKNOWN',
      commandId: activationInput.commandId,
      state: 'outcome_unknown',
    })
    expect(requestFetch).toHaveBeenCalledTimes(1)
  })
})
