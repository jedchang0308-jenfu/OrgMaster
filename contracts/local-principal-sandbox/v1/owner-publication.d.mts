import type { ApplicationId, LocalGrant, LocalScenario } from './protocol.mjs'
export const LOCAL_OWNER_PUBLICATION_VERSION: 'orgmaster.local-principal-publication.v1'
export type LocalOwnerPublication = { contract_version: typeof LOCAL_OWNER_PUBLICATION_VERSION; principal_issuer: string;
  principal_subject: string; principal_id: string; employee_id: string; account_type: string; employee_status: string;
  mapping_version: string | number; published_at: Date | string; published_version: Record<string, unknown>;
  pdm_grants: Record<string, unknown>[]; pdm_catalog: Record<string, unknown>[]; fms_authority: Record<string, unknown> | null }
export function validateLocalOwnerPublication(value: unknown, scenario: LocalScenario): LocalOwnerPublication
export function localOrgmasterRoleCatalog(version: Record<string, unknown>): {
  applicationId: 'orgmaster'; contractVersion: 'orgmaster.local-role-catalog.v1'; catalogVersion: string; catalogSha256: string; sourceSha256: string;
  roles: { stableRoleId: string; roleDefinitionHash: string; subjectKind: 'employee'; assignable: true; allowedScopeKinds: ['global'] }[]
}
export function localGrantsFromOwnerPublication(value: unknown, scenario: LocalScenario, applicationId: ApplicationId, nowMs?: number): LocalGrant[]
export function ownerGrantsMatchFixture(value: unknown, scenario: LocalScenario, applicationId: ApplicationId, grants: LocalGrant[], nowMs?: number): boolean
