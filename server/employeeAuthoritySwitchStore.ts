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
    'authority_transaction_mode_invalid',
    'legacy_receipt_unbound',
    'ENTITLEMENT_AUTHORITY_TARGET_IDENTITY_INVALID',
    'ENTITLEMENT_AUTHORITY_ASSIGNMENT_INVALID',
    'ENTITLEMENT_AUTHORITY_SOURCE_UNCHANGED',
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

type AuthorityTarget = { principalId: string; issuer: string; subject: string; assignmentVersionId: string }

async function resolveAuthorityTarget(database: OrgmasterDatabase, request: EmployeeAuthoritySwitchRequest, activeVersionId: string): Promise<AuthorityTarget> {
  const prior = await database.query<{ receipt: Record<string, unknown> | null }>(
    'SELECT receipt FROM orgmaster_contract.read_employee_authority_operation_v1($1,$2,$3)',
    [request.applicationId, request.employeeId, request.operationId],
  )
  if (prior.rows.length > 1) throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_OPERATION_REUSED')
  if (prior.rows.length === 1) {
    const receipt = prior.rows[0].receipt
    if (receipt?.requestContractVersion !== 'orgmaster.employee-authority-switch.v2') {
      throw new EmployeeAuthoritySwitchError('legacy_receipt_unbound')
    }
    const target = {
      principalId: String(receipt.targetPrincipalId ?? ''),
      issuer: String(receipt.targetIdentityIssuer ?? ''),
      subject: String(receipt.targetIdentitySubject ?? ''),
      assignmentVersionId: String(receipt.assignmentVersionId ?? ''),
    }
    if (!target.principalId || !target.issuer || !target.subject || !target.assignmentVersionId) {
      throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_OPERATION_REUSED')
    }
    return target
  }

  const result = await database.query<{
    employee_id: string
    principal_id: string
    principal_issuer: string
    principal_subject: string
    account_type: string
  }>(`SELECT employee_id, principal_id, principal_issuer, principal_subject, account_type
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE employee_id = $1 AND account_type = 'human_personal'
      ORDER BY principal_id, principal_issuer, principal_subject`, [request.employeeId])
  const rows = result.rows
  const pairs = new Set(rows.map((row) => JSON.stringify([row.principal_issuer, row.principal_subject])))
  const principals = new Set(rows.map((row) => row.principal_id))
  if (rows.length === 0 || pairs.size !== rows.length || principals.size !== 1
    || rows.some((row) => row.employee_id !== request.employeeId || row.account_type !== 'human_personal'
      || !row.principal_id || !row.principal_issuer || !row.principal_subject)) {
    throw new EmployeeAuthoritySwitchError('ENTITLEMENT_AUTHORITY_TARGET_IDENTITY_INVALID')
  }
  return {
    principalId: rows[0].principal_id,
    issuer: rows[0].principal_issuer,
    subject: rows[0].principal_subject,
    assignmentVersionId: activeVersionId,
  }
}

export async function switchEmployeeEntitlementAuthority(root: string, actor: GovernanceActorContext, request: EmployeeAuthoritySwitchRequest, dependencies: Dependencies = {}): Promise<EmployeeAuthoritySwitchReceipt> {
  assertRequest(request, actor)
  const current = await (dependencies.readStore ?? readGovernanceStore)(root)
  const assignmentVersionId = assertEmployeeAuthoritySwitchAccess(current.document, actor, dependencies.now)
  const database = dependencies.database ?? createOrgmasterDatabase(process.env.ORGMASTER_POSTGRES_URL ?? '')
  try {
    const target = await resolveAuthorityTarget(database, request, assignmentVersionId)
    const result = await database.query<{
      receipt_id: string
      authority_version: string | number
      outbox_event_id: string
      session_refresh_state: string
      replayed: boolean
    }>(`SELECT receipt_id, authority_version, outbox_event_id, session_refresh_state, replayed
          FROM orgmaster_contract.switch_employee_entitlement_authority_v2(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          )`, [
      request.applicationId,
      request.employeeId,
      request.toAuthoritySource,
      request.expectedAuthorityVersion,
      request.operationId,
      request.batchId,
      target.assignmentVersionId,
      actor.principalId,
      request.reason.trim(),
      target.principalId,
      target.issuer,
      target.subject,
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
      assignmentVersionId: target.assignmentVersionId,
      outboxEventId: row.outbox_event_id,
      sessionRefreshState: row.session_refresh_state,
      replayed: Boolean(row.replayed),
    }
  } catch (error) {
    if (error instanceof EmployeeAuthoritySwitchError) throw error
    throw mappedDatabaseError(error)
  }
}
