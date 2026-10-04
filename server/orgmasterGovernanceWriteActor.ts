import type { OrgmasterDatabase } from './orgmasterDatabase'
import type { GovernanceActorContext } from '../src/governance/types'
import { createPrincipalAdmissionRepository, PrincipalAdmissionError } from './orgmasterPrincipalAdmissionRepository'
import { createAuthEpochRepository } from './orgmasterAuthEpochRepository'

export class GovernanceWriteActorError extends Error {
  constructor(public readonly code: 'IDENTITY_CONTEXT_REQUIRED' | 'IDENTITY_AUTHORITY_UNAVAILABLE') { super(code) }
}

/** Uses the existing own session ACL and versioned identity/epoch contracts only. */
export async function assertCurrentGovernanceWriteActor(
  database: Pick<OrgmasterDatabase, 'query'>,
  actor: GovernanceActorContext,
  lockSession: boolean,
) {
  if (actor.bootstrap || !actor.principalId || !actor.employeeId || !actor.issuer || !actor.subject
    || !actor.sessionId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(actor.sessionId)
    || !Number.isSafeInteger(actor.principalAuthEpoch) || Number(actor.principalAuthEpoch) < 0
    || !actor.authenticatedAt || !Number.isFinite(Date.parse(actor.authenticatedAt))) {
    throw new GovernanceWriteActorError('IDENTITY_CONTEXT_REQUIRED')
  }
  try {
    // The writer's admission -> persistence locks are acquired before this FOR SHARE.
    // Revocation commits first and is rejected, or waits until this write commits.
    const result = await database.query<{
      principal_id: string; employee_id: string; identity_issuer: string; identity_subject: string;
      session_schema_version: number; epoch_kind: string; principal_auth_epoch: string | number;
      authenticated_at: Date | string; expires_at: Date | string; assurance_level: string; current_session: boolean;
    }>(
      `SELECT principal_id, employee_id, identity_issuer, identity_subject,
              session_schema_version, epoch_kind, principal_auth_epoch, authenticated_at, expires_at,
              assurance_level, (revoked_at IS NULL AND expires_at > clock_timestamp()) AS current_session
       FROM orgmaster_core.app_sessions WHERE id=$1::uuid AND app_id='orgmaster'
       ${lockSession ? 'FOR SHARE' : ''}`, [actor.sessionId])
    const row = result.rows[0]
    if (result.rows.length !== 1 || !row.current_session
      || row.principal_id !== actor.principalId || row.employee_id !== actor.employeeId
      || row.identity_issuer !== actor.issuer || row.identity_subject !== actor.subject
      || row.session_schema_version !== 2 || row.epoch_kind !== 'principal'
      || Number(row.principal_auth_epoch) !== actor.principalAuthEpoch
      || new Date(row.authenticated_at).toISOString() !== new Date(actor.authenticatedAt).toISOString()
      || row.assurance_level !== actor.assuranceLevel) {
      throw new GovernanceWriteActorError('IDENTITY_CONTEXT_REQUIRED')
    }
    const principal = await createPrincipalAdmissionRepository(database).resolveActivePrincipal(actor.issuer, actor.subject)
    if (principal.principalId !== actor.principalId || principal.employeeId !== actor.employeeId) {
      throw new GovernanceWriteActorError('IDENTITY_CONTEXT_REQUIRED')
    }
    // Cross-owner epoch authority is read through its existing contract. This read
    // linearizes authentication; it does not lock or cancel a later Platform revoke.
    const state = await createAuthEpochRepository(database).readPrincipalState(actor.principalId)
    if (!Number.isFinite(new Date(row.expires_at).getTime()) || new Date(row.expires_at).getTime() <= Date.now()
      || state.authEpoch !== actor.principalAuthEpoch
      || (state.revokedBefore !== null && Date.parse(actor.authenticatedAt) <= Date.parse(state.revokedBefore))) {
      throw new GovernanceWriteActorError('IDENTITY_CONTEXT_REQUIRED')
    }
  } catch (error) {
    if (error instanceof GovernanceWriteActorError) throw error
    if (error instanceof PrincipalAdmissionError && error.code === 'principal_not_active') {
      throw new GovernanceWriteActorError('IDENTITY_CONTEXT_REQUIRED')
    }
    throw new GovernanceWriteActorError('IDENTITY_AUTHORITY_UNAVAILABLE')
  }
}
