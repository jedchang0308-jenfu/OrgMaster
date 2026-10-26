import type { OrgmasterDatabase } from './orgmasterDatabase'

export const FMS_PRINCIPAL_ADMISSION_VIEW = 'orgmaster_contract.v_fms_principal_admissions_v1' as const

export type FmsPrincipalAdmissionProjectionRow = {
  contract_version: string
  identity_issuer: string
  identity_subject: string
  principal_id: string
  employee_id: string
  account_type: string
  active: boolean
  mapping_version: string | number
  typed_account_version: string
  security_binding_stamp: string | null
  read_at: Date | string
  workspace_revision: string
}

export type FmsPrincipalAdmission = {
  identityIssuer: string
  identitySubject: string
  principalId: string
  employeeId: string
  accountType: string
  active: true
  mappingVersion: string
  typedAccountVersion: string
  securityBindingStamp: string | null
  readAt: string
  workspaceRevision: string
}

export class FmsPrincipalAdmissionError extends Error {
  constructor(readonly code: 'principal_admission_unavailable' | 'principal_admission_contract_mismatch') {
    super(code)
    this.name = 'FmsPrincipalAdmissionError'
  }
}

function iso(value: Date | string) { return new Date(value).toISOString() }

function normalize(row: FmsPrincipalAdmissionProjectionRow): FmsPrincipalAdmission {
  if (row.contract_version !== 'jenfu.orgmaster.fms-authority.v1' || !row.identity_issuer || !row.identity_subject || !row.principal_id || !row.employee_id || !['human_personal', 'human_privileged'].includes(row.account_type) || row.active !== true || row.mapping_version === null || row.mapping_version === undefined || !row.typed_account_version || row.security_binding_stamp !== null || !/^[a-f0-9]{64}$/u.test(row.workspace_revision)) throw new FmsPrincipalAdmissionError('principal_admission_contract_mismatch')
  const mappingVersion = String(row.mapping_version)
  if (!mappingVersion.trim() || mappingVersion !== row.typed_account_version) throw new FmsPrincipalAdmissionError('principal_admission_contract_mismatch')
  return {
    identityIssuer: row.identity_issuer,
    identitySubject: row.identity_subject,
    principalId: row.principal_id,
    employeeId: row.employee_id,
    accountType: row.account_type,
    active: true,
    mappingVersion,
    typedAccountVersion: row.typed_account_version,
    securityBindingStamp: null,
    readAt: iso(row.read_at),
    workspaceRevision: row.workspace_revision,
  }
}

export function createFmsPrincipalAdmissionRepository(database: Pick<OrgmasterDatabase, 'query'>) {
  return {
    async readAdmission(identityIssuer: string, identitySubject: string): Promise<FmsPrincipalAdmission[]> {
      try {
        const result = await database.query<FmsPrincipalAdmissionProjectionRow>(`SELECT contract_version, identity_issuer, identity_subject, principal_id, employee_id, account_type, active, mapping_version, typed_account_version, security_binding_stamp, read_at, workspace_revision FROM ${FMS_PRINCIPAL_ADMISSION_VIEW} WHERE identity_issuer = $1 AND identity_subject = $2 ORDER BY principal_id, employee_id`, [identityIssuer, identitySubject])
        return result.rows.map(normalize)
      } catch (error) {
        if (error instanceof FmsPrincipalAdmissionError) throw error
        throw new FmsPrincipalAdmissionError('principal_admission_unavailable')
      }
    },
  }
}

