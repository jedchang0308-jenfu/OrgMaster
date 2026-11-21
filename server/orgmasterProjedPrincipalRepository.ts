import type { OrgmasterDatabase } from './orgmasterDatabase'
import { ProjedPrincipalServiceError, type ProjedPrincipalPublication, type ProjedPrincipalRepository } from './orgmasterProjedPrincipalService'

const CONFLICTS = new Set([
  'PROJED_PRINCIPAL_CONFLICT', 'PROJED_PRINCIPAL_INACTIVE',
  'PROJED_PUBLICATION_REPLAY_CONFLICT', 'PRINCIPAL_OWNERSHIP_CONFLICT',
])

export function createProjedPrincipalRepository(database: Pick<OrgmasterDatabase, 'query'>): ProjedPrincipalRepository {
  return {
    async enroll(input) {
      try {
        // One statement owns publication, reservations, replay and audit in the
        // same transaction. The verified token itself never reaches the DB.
        const result = await database.query<{ publication: ProjedPrincipalPublication }>(`
          SELECT orgmaster_core.enroll_projed_principal_v1($1::uuid,$2,$3,$4,$5::timestamptz) AS publication
        `, [input.requestId, input.issuer, input.subject, input.googleSubject, input.authenticatedAt])
        if (result.rows.length !== 1) throw new Error('publication_missing')
        return result.rows[0].publication
      } catch (error) {
        if (error instanceof Error && CONFLICTS.has(error.message)) {
          throw new ProjedPrincipalServiceError(409, 'principal_mapping_conflict')
        }
        throw new ProjedPrincipalServiceError(503, 'principal_enrollment_unavailable')
      }
    },
  }
}
