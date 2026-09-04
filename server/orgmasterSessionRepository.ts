import { randomUUID } from 'node:crypto'
import type { OrgmasterDatabase } from './orgmasterDatabase'

export type OrgmasterSession = {
  id: string
  identityIssuer: string
  identitySubject: string
  principalId: string
  employeeId: string
  authEpoch: number
  issuedAt: string
  authenticatedAt: string | null
  expiresAt: string
  revokedAt: string | null
  assuranceLevel: 'aal1' | 'aal2'
}

type SessionRow = {
  id: string
  identity_issuer: string
  identity_subject: string
  principal_id: string
  employee_id: string
  auth_epoch: string | number
  issued_at: Date | string
  authenticated_at: Date | string | null
  expires_at: Date | string
  revoked_at: Date | string | null
  assurance_level: 'aal1' | 'aal2'
}

export type OrgmasterSessionRepository = {
  create(input: Omit<OrgmasterSession, 'id' | 'revokedAt'> & { sessionIdHash: string }): Promise<OrgmasterSession>
  findByHash(sessionIdHash: string): Promise<OrgmasterSession | null>
  revokeByHash(sessionIdHash: string, reason: string): Promise<void>
}

function mapSession(row: SessionRow): OrgmasterSession {
  return {
    id: row.id,
    identityIssuer: row.identity_issuer,
    identitySubject: row.identity_subject,
    principalId: row.principal_id,
    employeeId: row.employee_id,
    authEpoch: Number(row.auth_epoch),
    issuedAt: new Date(row.issued_at).toISOString(),
    authenticatedAt: row.authenticated_at ? new Date(row.authenticated_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    assuranceLevel: row.assurance_level,
  }
}

export function createOrgmasterSessionRepository(database: OrgmasterDatabase): OrgmasterSessionRepository {
  const selection = 'id, identity_issuer, identity_subject, principal_id, employee_id, auth_epoch, issued_at, authenticated_at, expires_at, revoked_at, assurance_level'
  return {
    async create(input) {
      const now = new Date().toISOString()
      const result = await database.query<SessionRow>(`
        INSERT INTO orgmaster_core.app_sessions (
          id, session_id_hash, identity_issuer, identity_subject, principal_id, employee_id,
          app_id, auth_epoch, issued_at, authenticated_at, expires_at, last_seen_at, revoked_at, revoke_reason,
          assurance_level, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'orgmaster', $7, $8, $9, $10, $8, NULL, NULL, $11, $12, $12)
        RETURNING ${selection}
      `, [randomUUID(), input.sessionIdHash, input.identityIssuer, input.identitySubject, input.principalId, input.employeeId, input.authEpoch, input.issuedAt, input.authenticatedAt, input.expiresAt, input.assuranceLevel, now])
      return mapSession(result.rows[0])
    },
    async findByHash(sessionIdHash) {
      const result = await database.query<SessionRow>(`
        UPDATE orgmaster_core.app_sessions
        SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE session_id_hash = $1 AND app_id = 'orgmaster'
        RETURNING ${selection}
      `, [sessionIdHash])
      return result.rows[0] ? mapSession(result.rows[0]) : null
    },
    async revokeByHash(sessionIdHash, reason) {
      await database.query(`
        UPDATE orgmaster_core.app_sessions
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
            revoke_reason = COALESCE(revoke_reason, $2), updated_at = CURRENT_TIMESTAMP
        WHERE session_id_hash = $1 AND app_id = 'orgmaster'
      `, [sessionIdHash, reason])
    },
  }
}
