export const ADMINISTRATION_POLICY_CONTRACT = 'orgmaster.administration-policy.v1' as const
export const ADMINISTRATION_COMMAND_CONTRACT = 'orgmaster.administration-command.v1' as const
export const ADMINISTRATION_BATCH_COMMAND_CONTRACT = 'orgmaster.administration-batch-command.v2' as const
export const ADMINISTRATIVE_APPLICATION_IDS = ['orgmaster', 'ai-pdm', 'financial-management-system'] as const
export const ADMINISTRATIVE_ROLE_IDS = {
  orgmaster: 'role-orgmaster-admin',
  'ai-pdm': 'role-application-system-admin',
  'financial-management-system': 'fms-full-catalog-administration',
} as const
