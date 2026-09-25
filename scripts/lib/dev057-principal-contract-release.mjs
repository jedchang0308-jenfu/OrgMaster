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
