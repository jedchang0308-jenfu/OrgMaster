export const DEV057_PRINCIPAL_CONTRACT_REMEDIATION = Object.freeze({
  kind: 'PRINCIPAL_IDENTITY_AND_GRANTS_V2',
  migrationVersions: ['dev014-orgmaster-022', 'dev014-orgmaster-023', 'dev057-orgmaster-024', 'dev057-orgmaster-025', 'dev057-orgmaster-026'],
  contractViews: [
    'orgmaster_contract.v_principal_alias_history_v1',
    'orgmaster_contract.v_ai_pdm_principal_effective_grants_v2',
    'orgmaster_contract.v_orgmaster_session_principals_v2',
  ],
  applicationId: 'ai-pdm',
})

export const DEV057_CUTOVER_SOURCE_REMEDIATION = Object.freeze({
  kind: 'PRINCIPAL_CUTOVER_SOURCE_MANIFEST',
  migrationVersion: 'dev057-orgmaster-027',
  contractIds: [
    'orgmaster.principal-cutover-source',
    'orgmaster.ai-pdm-principal-effective-grants',
  ],
  consumerRole: 'jenfu_ai_pdm_migrator',
  applicationId: 'ai-pdm',
})

export const DEV057_PRINCIPAL_GRANTS_V3_REMEDIATION = Object.freeze({
  kind: 'PRINCIPAL_ONLY_GRANTS_AND_CUTOVER_SOURCE',
  migrationVersion: 'dev057-orgmaster-028',
  contractIds: [
    'orgmaster.ai-pdm-principal-effective-grants-v3',
    'orgmaster.principal-cutover-source-v2',
  ],
  contractView: 'orgmaster_contract.v_ai_pdm_principal_effective_grants_v3',
  applicationId: 'ai-pdm',
})

export const DEV057_PRINCIPAL_GRANTS_V4_REMEDIATION = Object.freeze({
  kind: 'PRINCIPAL_HUMAN_BUSINESS_GRANTS_V4',
  migrationVersion: 'dev057-orgmaster-029',
  contractIds: ['orgmaster.ai-pdm-principal-effective-grants-v4'],
  contractView: 'orgmaster_contract.v_ai_pdm_principal_effective_grants_v4',
  applicationId: 'ai-pdm',
})

export const DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2_REMEDIATION = Object.freeze({
  kind: 'EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2',
  migrationVersion: 'dev057-orgmaster-030',
  migrationPath: 'db/migrations/030_dev057_employee_number_command_receipt.sql',
  sourceSha256: 'bade78acd6221b85c474fe7e7a5aacb8efb3e2b08ca2294e4fe384e545b66bcb',
  appliedSha256: '5501715799f5b695467b6ccc146df5f2c0d147fdb5dcf8ad52777ac50c3acf87',
  functionSignature: 'orgmaster_core.assign_employee_number_v2(text,text,text,text,text,text,timestamptz)',
})
