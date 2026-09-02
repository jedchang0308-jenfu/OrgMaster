import type { OrgmasterDatabase } from './orgmasterDatabase'

export type ActivePrincipal = {
  principalId: string
  employeeId: string
  mappingVersion: number
  publishedAt: string
}

type ActivePrincipalRow = {
  contract_version: string
  principal_issuer: string
  principal_subject: string
  principal_id: string
  employee_id: string
  employee_status: string
  mapping_version: string | number
  published_at: Date | string
}

export class PrincipalAdmissionError extends Error {
  constructor(public readonly code: 'principal_not_active' | 'principal_ambiguous' | 'auth_contract_mismatch' | 'principal_directory_unavailable') {
    super(code)
  }
}

export type PrincipalAdmissionRepository = {
  resolveActivePrincipal(issuer: string, subject: string): Promise<ActivePrincipal>
}

export function createPrincipalAdmissionRepository(database: OrgmasterDatabase): PrincipalAdmissionRepository {
  return {
    async resolveActivePrincipal(issuer, subject) {
      let rows: ActivePrincipalRow[]
      try {
        const result = await database.query<ActivePrincipalRow>(`
          SELECT contract_version, principal_issuer, principal_subject, principal_id,
                 employee_id, employee_status, mapping_version, published_at
          FROM organization.v_active_principal_mappings_v1
          WHERE principal_issuer = $1 AND principal_subject = $2
          ORDER BY mapping_version DESC
          FETCH FIRST 2 ROWS ONLY
        `, [issuer, subject])
        rows = result.rows
      } catch {
        throw new PrincipalAdmissionError('principal_directory_unavailable')
      }
      if (rows.length === 0) throw new PrincipalAdmissionError('principal_not_active')
      if (rows.length > 1) throw new PrincipalAdmissionError('principal_ambiguous')
      const row = rows[0]
      const mappingVersion = Number(row.mapping_version)
      if (row.contract_version !== 'organization.active-principal.v1'
        || row.principal_issuer !== issuer
        || row.principal_subject !== subject
        || row.employee_status !== 'active'
        || !row.principal_id || !row.employee_id
        || !Number.isSafeInteger(mappingVersion) || mappingVersion < 1) {
        throw new PrincipalAdmissionError('auth_contract_mismatch')
      }
      return {
        principalId: row.principal_id,
        employeeId: row.employee_id,
        mappingVersion,
        publishedAt: new Date(row.published_at).toISOString(),
      }
    },
  }
}
