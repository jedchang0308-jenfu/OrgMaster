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
