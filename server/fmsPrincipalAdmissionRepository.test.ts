import { describe, expect, it, vi } from 'vitest'
import { createFmsPrincipalAdmissionRepository } from './fmsPrincipalAdmissionRepository'

const row = {
  contract_version: 'jenfu.orgmaster.fms-authority.v1', identity_issuer: 'https://issuer.example', identity_subject: 'subject-1',
  principal_id: 'principal-1', employee_id: 'employee-1', account_type: 'human_personal', active: true,
  mapping_version: '42', typed_account_version: '42', security_binding_stamp: null,
  read_at: '2026-10-26T01:00:00.000Z', workspace_revision: 'a'.repeat(64),
}

describe('FMS principal admission projection repository', () => {
  it('reads strict issuer/subject parameters and emits the typed admission wire', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] })
    const admission = await createFmsPrincipalAdmissionRepository({ query }).readAdmission(row.identity_issuer, row.identity_subject)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('v_fms_principal_admissions_v1'), [row.identity_issuer, row.identity_subject])
    expect(admission).toEqual([expect.objectContaining({ identityIssuer: row.identity_issuer, identitySubject: row.identity_subject, principalId: row.principal_id, employeeId: row.employee_id, mappingVersion: '42', typedAccountVersion: '42', securityBindingStamp: null, workspaceRevision: 'a'.repeat(64) })])
  })

  it('rejects a fabricated security binding or mismatched typed version', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...row, typed_account_version: '43' }] })
    await expect(createFmsPrincipalAdmissionRepository({ query }).readAdmission(row.identity_issuer, row.identity_subject)).rejects.toMatchObject({ code: 'principal_admission_contract_mismatch' })
  })
})

