import { createOrgmasterDatabase, type OrgmasterDatabase } from './orgmasterDatabase'
import { readGovernanceStore } from './orgmasterGovernanceStore'
import { assertFreshPrivilegedSession, hasCrossAppOverride } from '../src/governance/privilegedAssignments'
import { isActiveAt } from '../src/governance/validation'
import type { GovernanceActorContext, GovernanceDocumentV3 } from '../src/governance/types'

export type EmployeeAuthoritySource = 'legacy_authority' | 'orgmaster_authority'

export type EmployeeAuthoritySwitchRequest = {
  applicationId: 'ai-pdm'
  employeeId: string
  toAuthoritySource: EmployeeAuthoritySource
  expectedAuthorityVersion: number
  operationId: string
  batchId: string
  reason: string
}

export type EmployeeAuthoritySwitchReceipt = {
  contractVersion: 'orgmaster.employee-authority-switch-receipt.v1'
  operationId: string
  receiptId: string
  applicationId: 'ai-pdm'
  employeeId: string
  toAuthoritySource: EmployeeAuthoritySource
  authorityVersion: number
  assignmentVersionId: string
  outboxEventId: string
  sessionRefreshState: string
  replayed: boolean
}

type StoreRead = Awaited<ReturnType<typeof readGovernanceStore>>
type Dependencies = {
  database?: OrgmasterDatabase
  readStore?: (root: string) => Promise<StoreRead>
  now?: string
}

const SAFE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u
const SAFE_BATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u

export class EmployeeAuthoritySwitchError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'EmployeeAuthoritySwitchError'
  }
}

function activePolicyDocument(document: GovernanceDocumentV3) {
  const active = document.publishedVersions.find((version) => version.id === document.activePolicyVersionId)
  if (!active || active.kind !== 'assignment-governance-v3') throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_ACTIVE_VERSION_REQUIRED')
  return {
    active,
    document: {
      ...document,
      draft: {
        ...active.policy,
        basePolicyVersionId: active.id,
        updatedAt: active.publishedAt,
      },
    } satisfies GovernanceDocumentV3,
  }
}

function assertRequest(request: EmployeeAuthoritySwitchRequest, actor: GovernanceActorContext) {
  if (request.applicationId !== 'ai-pdm'
    || request.employeeId !== actor.employeeId
    || !request.employeeId.trim()
    || !Number.isSafeInteger(request.expectedAuthorityVersion)
    || request.expectedAuthorityVersion < 1
    || !SAFE_OPERATION_ID.test(request.operationId)
    || !SAFE_BATCH_ID.test(request.batchId)
    || !request.reason.trim()
    || request.reason.trim().length > 240
    || !['legacy_authority', 'orgmaster_authority'].includes(request.toAuthoritySource)) {
    throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_SWITCH_INPUT_INVALID')
  }
}

export function assertEmployeeAuthoritySwitchAccess(document: GovernanceDocumentV3, actor: GovernanceActorContext, now = new Date().toISOString()) {
  const current = activePolicyDocument(document)
  if (!hasCrossAppOverride(current.document, actor, now)) throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_SWITCH_FORBIDDEN')
  try {
    assertFreshPrivilegedSession(actor, {
      sessionId: actor.sessionId ?? '',
      principalId: actor.principalId,
      assuranceLevel: actor.assuranceLevel ?? 'aal1',
      authenticatedAt: actor.authenticatedAt ?? null,
    }, new Date(now))
  } catch {
    throw new EmployeeAuthoritySwitchError('STEP_UP_REQUIRED')
  }
  const systemAdmin = current.active.policy.roleAssignments.some((assignment) => assignment.applicationId === 'ai-pdm'
    && assignment.roleId === 'role-system-admin'
    && assignment.roleCodeSnapshot === 'system_admin'
    && assignment.subjectKind === 'principal'
    && assignment.targetPrincipalId === actor.principalId
    && assignment.employeeId === actor.employeeId
    && assignment.scope.kind === 'global'
    && isActiveAt(assignment.status, assignment.validFrom, assignment.validTo, now))
  if (!systemAdmin) throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_SYSTEM_ADMIN_REQUIRED')
  return current.active.id
}

function mappedDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  for (const code of [
    'ENTITLEMENT_AUTHORITY_VERSION_CONFLICT',
    'ENTITLEMENT_AUTHORITY_OPERATION_REUSED',
    'ENTITLEMENT_AUTHORITY_EMPLOYEE_INACTIVE',
    'ENTITLEMENT_AUTHORITY_STATE_NOT_FOUND',
    'ENTITLEMENT_AUTHORITY_SWITCH_INPUT_INVALID',
  ]) {
    if (message.includes(code)) return new EmployeeAuthoritySwitchError(code)
  }
  return new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_SWITCH_FAILED')
}

export async function switchEmployeeEntitlementAuthority(root: string, actor: GovernanceActorContext, request: EmployeeAuthoritySwitchRequest, dependencies: Dependencies = {}): Promise<EmployeeAuthoritySwitchReceipt> {
  assertRequest(request, actor)
  const current = await (dependencies.readStore ?? readGovernanceStore)(root)
  const assignmentVersionId = assertEmployeeAuthoritySwitchAccess(current.document, actor, dependencies.now)
  const database = dependencies.database ?? createOrgmasterDatabase(process.env.ORGMASTER_POSTGRES_URL ?? '')
  try {
    const result = await database.query<{
      receipt_id: string
      authority_version: string | number
      outbox_event_id: string
      session_refresh_state: string
      replayed: boolean
    }>(`SELECT receipt_id, authority_version, outbox_event_id, session_refresh_state, replayed
          FROM access_governance.switch_employee_entitlement_authority_v1(
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )`, [
      request.applicationId,
      request.employeeId,
      request.toAuthoritySource,
      request.expectedAuthorityVersion,
      request.operationId,
      request.batchId,
      assignmentVersionId,
      actor.principalId,
      request.reason.trim(),
    ])
    if (result.rowCount !== 1) throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_SWITCH_FAILED')
    const row = result.rows[0]
    return {
      contractVersion: 'orgmaster.employee-authority-switch-receipt.v1',
      operationId: request.operationId,
      receiptId: row.receipt_id,
      applicationId: 'ai-pdm',
      employeeId: request.employeeId,
      toAuthoritySource: request.toAuthoritySource,
      authorityVersion: Number(row.authority_version),
      assignmentVersionId,
      outboxEventId: row.outbox_event_id,
      sessionRefreshState: row.session_refresh_state,
      replayed: Boolean(row.replayed),
    }
  } catch (error) {
    if (error instanceof EmployeeAuthoritySwitchError) throw error
    throw mappedDatabaseError(error)
  }
}
