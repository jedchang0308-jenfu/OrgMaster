import type { ExternalRoleCatalogRoleV1, ExternalRoleCatalogSnapshotV1, GovernanceApplicationRoleV1, GovernanceApplicationV1, GovernancePermissionV1 } from './types'
import aiPdmCatalogFixture from '../../config/catalogs/ai-pdm-role-catalog.v5.json'
import aiPdmCatalogV6Fixture from '../../config/catalogs/ai-pdm-role-catalog.v6.json'
import aiPdmCatalogV7Fixture from '../../config/catalogs/ai-pdm-role-catalog.v7.json'
import historicalAiPdmCatalogFixture from '../../contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'
import { aiPdmRoleProfiles } from './aiPdmRoleSchema'

export const AI_PDM_CATALOG_SOURCE_HASHES = {
  permissionCodes: '0560A929FDA8D9123B65CDB51577F89C65E2EBA7CCD327454F403D9E1E647362',
  approvalOwnerRoute: 'E0ADDE9998F7737324CB67D73EB60E93E0BC05EFD95EA3A84767C754E1C58986',
} as const

export const AI_PDM_PAGE_PERMISSION_CODES = [
  'numbering.request', 'numbering.search', 'numbering.drawings.view', 'numbering.approvals',
  'numbering.impact', 'numbering.tasks', 'numbering.reports', 'settings.admin_matrix',
] as const
export const AI_PDM_ACTION_PERMISSION_CODES = [
  'numbering.workspace.view', 'numbering.workspace.create', 'numbering.workspace.update', 'numbering.workspace.cancel',
  'numbering.candidate.acquire', 'numbering.candidate.recycle', 'numbering.candidate.review.submit', 'numbering.candidate.review.withdraw',
  'numbering.candidate.review.decide', 'numbering.publish', 'transfer.package.view', 'transfer.package.create', 'transfer.package.update',
  'transfer.package.review.submit', 'transfer.package.review.withdraw', 'transfer.package.review.decide', 'transfer.package.publish',
  'handoff.published.view', 'numbering.create', 'numbering.draft.update', 'numbering.draft.obsolete', 'numbering.draft.admin_confirm',
  'numbering.duplicate_check', 'numbering.link_variant', 'numbering.approval.request', 'numbering.approval.batch.create',
  'numbering.approval.batch.decide', 'numbering.approval.batch.resubmit', 'numbering.impact.analyze', 'numbering.impact.apply',
  'numbering.export.create', 'numbering.audit_report.generate', 'numbering.task.update', 'numbering.notification.update',
  'numbering.attachments.manage', 'numbering.recognition.run', 'numbering.recognition.review', 'numbering.recognition.formalize',
  'pdm.comment.create', 'pdm.advice.create', 'settings.admin_matrix', 'update_name', 'update_spec', 'obsolete_part_number',
  'obsolete_ma_drawing', 'obsolete_part_root', 'merge_part_number', 'release_missing_ma_confirm', 'release', 'post_release_change',
  'same_drawing_variant_after_release', 'main_drawing_restore',
] as const
export const AI_PDM_APPROVAL_ACTION_CODES = [
  'numbering.candidate_bundle_review', 'numbering.candidate_publication_review', 'numbering.drawing_revision_lifecycle_review',
  'numbering.drawing_revision_impact_review', 'numbering.same_drawing_variant_after_release', 'numbering.main_drawing_restore',
  'numbering.obsolete_part_number', 'numbering.obsolete_ma_drawing', 'numbering.obsolete_part_root', 'numbering.release',
  'numbering.release_missing_ma_confirm', 'drawing_package.supplement_review',
] as const

export const GOVERNANCE_APPLICATIONS: GovernanceApplicationV1[] = [
  { id: 'orgmaster', name: 'OrgMaster', status: 'active' },
  { id: 'ai-pdm', name: 'AI-PDM', status: 'active' },
  { id: 'financial-management-system', name: 'Financial Management System', status: 'active' },
]
export const ORGMASTER_PERMISSIONS: GovernancePermissionV1[] = [
  { id: 'permission-orgmaster-governance-manage', applicationId: 'orgmaster', kind: 'system', code: 'orgmaster.governance.manage', name: '管理治理設定', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-governance-publish', applicationId: 'orgmaster', kind: 'system', code: 'orgmaster.governance.publish', name: '發布治理政策', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-governance-simulate', applicationId: 'orgmaster', kind: 'system', code: 'orgmaster.governance.simulate', name: '執行治理測試器', risk: 'normal', status: 'active' },
  { id: 'permission-orgmaster-identity-view', applicationId: 'orgmaster', kind: 'page', code: 'orgmaster.identity.view', name: '查看員工登入帳號', risk: 'normal', status: 'active' },
  { id: 'permission-orgmaster-identity-refresh', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.identity.refresh', name: '刷新公司登入身分狀態', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-employee-number-manage', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.employee-number.manage', name: '管理 JFS 員工編號', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-identity-invite', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.identity.invite', name: '邀請員工登入帳號', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-identity-link', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.identity.link', name: '連結既有登入帳號', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-identity-invitation-manage', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.identity.invitation.manage', name: '管理登入帳號邀請', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-management-method-create', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.management_method.create', name: '建立管理辦法', risk: 'normal', status: 'active' },
  { id: 'permission-orgmaster-management-method-read-readable', applicationId: 'orgmaster', kind: 'page', code: 'orgmaster.management_method.read_readable', name: '閱讀管理辦法', risk: 'normal', status: 'active' },
  { id: 'permission-orgmaster-management-method-read-draft', applicationId: 'orgmaster', kind: 'page', code: 'orgmaster.management_method.read_draft', name: '閱讀管理辦法草稿', risk: 'normal', status: 'active' },
  { id: 'permission-orgmaster-management-method-edit-draft', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.management_method.edit_draft', name: '編輯管理辦法草稿', risk: 'normal', status: 'active' },
  { id: 'permission-orgmaster-management-method-manage-readable', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.management_method.manage_read_availability', name: '管理管理辦法閱讀狀態', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-management-method-manage-metadata', applicationId: 'orgmaster', kind: 'action', code: 'orgmaster.management_method.manage_metadata', name: '管理管理辦法 metadata', risk: 'normal', status: 'active' },
]
export const GOVERNANCE_ROLE_TEMPLATES: GovernanceApplicationRoleV1[] = [
  { id: 'role-orgmaster-admin', applicationId: 'orgmaster', code: 'orgmaster_admin', name: 'OrgMaster 管理者', status: 'active', systemDefined: true },
  { id: 'role-pdm-admin', applicationId: 'ai-pdm', code: 'pdm_admin', name: 'PDM 管理者範本', status: 'active', systemDefined: true },
  { id: 'role-rd-manager', applicationId: 'ai-pdm', code: 'rd_manager', name: '研發主管範本', status: 'active', systemDefined: true },
  { id: 'role-rd', applicationId: 'ai-pdm', code: 'rd', name: '研發人員範本', status: 'active', systemDefined: true },
]
export const AI_PDM_PERMISSIONS: GovernancePermissionV1[] = [
  ...AI_PDM_PAGE_PERMISSION_CODES.map((code, index) => ({ id: `permission-ai-pdm-page-${index + 1}`, applicationId: 'ai-pdm' as const, kind: 'page' as const, code, name: code, risk: 'normal' as const, status: 'active' as const })),
  ...AI_PDM_ACTION_PERMISSION_CODES.map((code, index) => ({ id: `permission-ai-pdm-action-${index + 1}`, applicationId: 'ai-pdm' as const, kind: 'action' as const, code, name: code, risk: ['release', 'numbering.publish', 'numbering.approval.batch.decide', 'numbering.candidate.review.decide'].includes(code) ? 'high' as const : 'normal' as const, status: 'active' as const })),
]
export const ALL_SEED_PERMISSIONS = [...ORGMASTER_PERMISSIONS, ...AI_PDM_PERMISSIONS]

export const AI_PDM_ROLE_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-28.v5' as const
export const AI_PDM_ROLE_CATALOG_SHA256 = '4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197' as const
export const AI_PDM_HISTORICAL_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-03.v3' as const
const AI_PDM_HISTORICAL_CATALOG_SHA256 = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8' as const
const AI_PDM_ROLE_CATALOG_IDS = [
  'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
  'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin',
] as const
if (aiPdmCatalogFixture.contractVersion !== 'jenfu.platform-entitlement.v1' || aiPdmCatalogFixture.applicationId !== 'ai-pdm' || aiPdmCatalogFixture.catalogVersion !== AI_PDM_ROLE_CATALOG_VERSION || aiPdmCatalogFixture.catalogSha256.toLowerCase() !== AI_PDM_ROLE_CATALOG_SHA256 || JSON.stringify(aiPdmCatalogFixture.roles.map((role) => role.stableRoleId)) !== JSON.stringify(AI_PDM_ROLE_CATALOG_IDS)) {
  throw new Error('EXTERNAL_CATALOG_INVALID')
}
if (historicalAiPdmCatalogFixture.catalogVersion !== AI_PDM_HISTORICAL_CATALOG_VERSION ||
  historicalAiPdmCatalogFixture.catalogSha256.toLowerCase() !== AI_PDM_HISTORICAL_CATALOG_SHA256 ||
  JSON.stringify(historicalAiPdmCatalogFixture.roles.map((role) => role.stableRoleId)) !== JSON.stringify(AI_PDM_ROLE_CATALOG_IDS)) {
  throw new Error('HISTORICAL_CATALOG_INVALID')
}

/** A pinned old catalog proves only an existing assignment's recorded role identity. */
export function historicalAiPdmRoleSnapshotMatches(value: {
  catalogVersion: string | null; roleId: string; roleCodeSnapshot: string;
  roleNameSnapshot: string; scope: { kind: string }
}, currentRole: ExternalRoleCatalogRoleV1 | undefined, trustedHistory: ExternalRoleCatalogSnapshotV1[] = []) {
  if (!currentRole) return false
  const provenance = value.catalogVersion === AI_PDM_HISTORICAL_CATALOG_VERSION ? historicalAiPdmCatalogFixture
    : value.catalogVersion === AI_PDM_ROLE_CATALOG_VERSION ? aiPdmCatalogFixture
    : value.catalogVersion === aiPdmCatalogV6Fixture.catalogVersion ? aiPdmCatalogV6Fixture
    : value.catalogVersion === aiPdmCatalogV7Fixture.catalogVersion ? aiPdmCatalogV7Fixture : null
  if (!provenance) {
    const snapshot = trustedHistory.find(entry => entry.applicationId === 'ai-pdm' && entry.catalogVersion === value.catalogVersion)
    if (!snapshot || validateExternalRoleCatalog(snapshot).length) return false
    const role = snapshot.roles.find(entry => entry.stableRoleId === value.roleId)
    return !!role && role.code === value.roleCodeSnapshot && role.displayName === value.roleNameSnapshot &&
      role.code === currentRole.code && role.subjectKind === currentRole.subjectKind &&
      role.assignmentTier === currentRole.assignmentTier && role.allowedScopeKinds.includes(value.scope.kind as 'workspace' | 'project' | 'global') &&
      currentRole.allowedScopeKinds.includes(value.scope.kind as 'workspace' | 'project' | 'global')
  }
  const historical = provenance.roles.find((role) => role.stableRoleId === value.roleId)
  return !!historical && historical.roleCode === value.roleCodeSnapshot &&
    historical.displayName === value.roleNameSnapshot &&
    historical.roleCode === currentRole.code &&
    historical.displayName === currentRole.displayName &&
    historical.subjectKind === currentRole.subjectKind &&
    historical.assignable === currentRole.assignable &&
    historical.assignmentTier === currentRole.assignmentTier &&
    historical.allowedScopeKinds.includes(value.scope.kind as 'workspace' | 'project' | 'global') &&
    currentRole.allowedScopeKinds.includes(value.scope.kind as 'workspace' | 'project' | 'global')
}
export const AI_PDM_ROLE_CATALOG_SOURCE_REFS = [
  { path: 'AI_PDM/config/access-control/jenfu-role-catalog.v5.json', range: 'canonical artifact', sha256: 'F4B00CA994EE53236CD33C484397C2CA97CB3EA2B63326E3943D268ED8B25981' },
  { path: 'AI_PDM/db/postgres/012_number_state_flow_phase1a.sql', range: 'applied migration', sha256: 'E9E5645FA73AD0E930E13858A9E284D5ECB5E7E8BBC3ECF09A6325709F4DFCD2' },
  { path: 'AI_PDM/db/postgres/016_number_state_flow_phase1c.sql', range: 'applied migration', sha256: '6BBEB3A283171C1E99C0F2AE50661F6F1ABC0EBC23C6281DD8F6128063E0E6F5' },
] as const

type CatalogRoleMetadata = { stableRoleId: string; roleCode: string; displayName: string; assignable: boolean; risk: string; allowedScopeKinds: string[]; subjectKind: string; recommendationAllowed: boolean; delegationAllowed: boolean; assignmentTier: string; roleStatus?: 'active'|'inactive' }
type CatalogMetadataArtifact = { catalogVersion: string; catalogSha256: string; publishedAt: string; roles: CatalogRoleMetadata[] } & Partial<Pick<ExternalRoleCatalogSnapshotV1,
  'publicationFormat'|'canonicalizationVersion'|'roleSchemaId'|'roleProfileSchemaId'|'baselineRoleIdentityHash'|'roleIdentityHash'|'protectedPolicyHash'|'registryHash'|'roleProfileHash'>>
function metadataRoles(artifact: CatalogMetadataArtifact): ExternalRoleCatalogRoleV1[] { return artifact.roles.map((role) => ({
  stableRoleId: role.stableRoleId,
  code: role.roleCode,
  displayName: role.displayName,
  status: 'active',
  assignable: role.assignable,
  riskLevel: role.risk as ExternalRoleCatalogRoleV1['riskLevel'],
  allowedScopeKinds: [...role.allowedScopeKinds] as ExternalRoleCatalogRoleV1['allowedScopeKinds'],
  subjectKind: role.subjectKind as ExternalRoleCatalogRoleV1['subjectKind'],
  recommendationAllowed: role.recommendationAllowed,
  delegationAllowed: role.delegationAllowed,
  assignmentTier: role.assignmentTier as ExternalRoleCatalogRoleV1['assignmentTier'],
})) }
export const AI_PDM_ROLE_CATALOG_ROLES: readonly ExternalRoleCatalogRoleV1[] = metadataRoles(aiPdmCatalogFixture)

export function createAiPdmRoleCatalog(validationState: ExternalRoleCatalogSnapshotV1['validationState'] = 'valid', capturedAt = aiPdmCatalogFixture.publishedAt, artifact: CatalogMetadataArtifact = aiPdmCatalogFixture): ExternalRoleCatalogSnapshotV1 {
  const dynamic=artifact.publicationFormat==='dynamic-policy-v1'
  const compatiblePublication = ![aiPdmCatalogFixture.catalogVersion, aiPdmCatalogV6Fixture.catalogVersion, aiPdmCatalogV7Fixture.catalogVersion].includes(artifact.catalogVersion)
  const base = {
    applicationId: 'ai-pdm' as const,
    catalogVersion: artifact.catalogVersion,
    sourceKind: compatiblePublication ? 'application-contract' as const : 'bundled-fixture' as const,
    sourceRefs: compatiblePublication
      ? [{ path: dynamic?'ai_pdm_contract.v_application_role_catalog_v2':'ai_pdm_contract.v_application_role_catalog_v1', range: 'verified active publication', sha256: artifact.catalogSha256 }]
      : artifact.catalogVersion === aiPdmCatalogV7Fixture.catalogVersion
      ? [{ path: 'AI_PDM/config/access-control/jenfu-role-catalog.v7.json', range: 'canonical artifact', sha256: '121ca7cd424b9d919cb9217516c0c5f6dcec3879ee389b0d676b9dd62cb0d94d' }, ...AI_PDM_ROLE_CATALOG_SOURCE_REFS.slice(1)]
      : artifact.catalogVersion === aiPdmCatalogV6Fixture.catalogVersion
      ? [{ path: 'AI_PDM/config/access-control/jenfu-role-catalog.v6.json', range: 'canonical artifact', sha256: '237e1a92814aa8fec87e878a8ffaac7f74bc9c5ce4fb6766c266970c9d509b8a' }, ...AI_PDM_ROLE_CATALOG_SOURCE_REFS.slice(1)]
      : [...AI_PDM_ROLE_CATALOG_SOURCE_REFS],
    capturedAt,
    roles: dynamic ? metadataRoles(artifact).map((role,index)=>({...role,status:artifact.roles[index].roleStatus!,...aiPdmRoleProfiles(artifact.roles)[index]})) : metadataRoles(artifact),
    ...(dynamic?{publicationFormat:artifact.publicationFormat,canonicalizationVersion:artifact.canonicalizationVersion,roleSchemaId:artifact.roleSchemaId,
      roleProfileSchemaId:artifact.roleProfileSchemaId,baselineRoleIdentityHash:artifact.baselineRoleIdentityHash,
      roleIdentityHash:artifact.roleIdentityHash,protectedPolicyHash:artifact.protectedPolicyHash,registryHash:artifact.registryHash,roleProfileHash:artifact.roleProfileHash}:{}),
  }
  return { ...base, payloadHash: artifact.catalogSha256, ...(compatiblePublication ? { catalogSha256: artifact.catalogSha256 } : {}), validationState, effectState: 'not-synchronized' }
}

export type ExternalRoleCatalogValidationIssue = { code: string; path: string; message: string }
export function validateExternalRoleCatalog(snapshot: ExternalRoleCatalogSnapshotV1): ExternalRoleCatalogValidationIssue[] {
  const artifact = snapshot.catalogVersion === aiPdmCatalogFixture.catalogVersion ? aiPdmCatalogFixture
    : snapshot.catalogVersion === aiPdmCatalogV6Fixture.catalogVersion ? aiPdmCatalogV6Fixture
    : snapshot.catalogVersion === aiPdmCatalogV7Fixture.catalogVersion ? aiPdmCatalogV7Fixture : null
  const issues: ExternalRoleCatalogValidationIssue[] = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  if(snapshot.publicationFormat==='dynamic-policy-v1'){
    if(snapshot.applicationId!=='ai-pdm'||snapshot.sourceKind!=='application-contract'||snapshot.validationState!=='valid'||snapshot.effectState!=='not-synchronized'||
      !/^ai-pdm\.role-policy\.[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(snapshot.catalogVersion)||
      snapshot.canonicalizationVersion!=='jenfu.canonical-json.v1'||snapshot.roleSchemaId!=='ai-pdm.role-schema.flexible.v2'||snapshot.roleProfileSchemaId!=='ai-pdm.role-profile-schema.v1'||
      snapshot.catalogSha256!==snapshot.payloadHash||[snapshot.payloadHash,snapshot.baselineRoleIdentityHash,snapshot.roleIdentityHash,snapshot.protectedPolicyHash,snapshot.registryHash,snapshot.roleProfileHash].some(value=>!value||!/^[a-f0-9]{64}$/u.test(value))||
      !Array.isArray(snapshot.sourceRefs)||snapshot.sourceRefs.length!==1||snapshot.sourceRefs[0].path!=='ai_pdm_contract.v_application_role_catalog_v2'||snapshot.sourceRefs[0].sha256!==snapshot.payloadHash)
      add('EXTERNAL_CATALOG_INVALID','publicationFormat','動態目錄必須經過完整 producer preimage 驗證')
    if(!Array.isArray(snapshot.roles)||snapshot.roles.length<9||snapshot.roles.length>64){add('EXTERNAL_CATALOG_INVALID','roles','角色數量超出契約');return issues}
    try{
      const profiles=aiPdmRoleProfiles(snapshot.roles),fixed=metadataRoles(aiPdmCatalogV7Fixture),ids=new Set<string>(),codes=new Set<string>()
      snapshot.roles.forEach((role,index)=>{
        const {permissionRoleId,presentationName,presentationOrder,assignmentDisposition,status,...metadata}=role
        const profile=profiles[index]
        if(ids.has(role.stableRoleId)||codes.has(role.code)||!['active','inactive'].includes(status)||permissionRoleId!==profile.permissionRoleId||presentationName!==profile.presentationName||presentationOrder!==profile.presentationOrder||assignmentDisposition!==profile.assignmentDisposition)throw new Error('invalid role')
        ids.add(role.stableRoleId);codes.add(role.code)
        if(index<9){const {status:_status,...expected}=fixed[index];if(Object.keys(metadata).length!==Object.keys(expected).length||Object.entries(expected).some(([key,value])=>JSON.stringify(metadata[key as keyof typeof metadata])!==JSON.stringify(value)))throw new Error('identity drift')}
        else if(!/^role-custom-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(role.stableRoleId)||role.code!=='custom_'+role.stableRoleId.slice(12).replaceAll('-','')||
          role.displayName!==role.displayName.normalize('NFC').trim()||Array.from(role.displayName).length<1||Array.from(role.displayName).length>80||
          role.subjectKind!=='employee'||!role.assignable||role.riskLevel!=='normal'||role.assignmentTier!=='app_admin'||!role.recommendationAllowed||!role.delegationAllowed||JSON.stringify(role.allowedScopeKinds)!=='["workspace"]')throw new Error('invalid custom')
      })
      if(snapshot.roles[8].status!=='active'||snapshot.roles[4].status!==snapshot.roles[5].status)throw new Error('protected lifecycle')
    }catch{add('EXTERNAL_CATALOG_INVALID','roles','動態角色身份或呈現契約不符')}
    return issues
  }
  const compatiblePublication = !artifact && snapshot.sourceKind === 'application-contract' &&
    /^ai-pdm\.role-catalog\.\d{4}-\d{2}-\d{2}\.v[1-9]\d*$/.test(snapshot.catalogVersion) &&
    snapshot.catalogSha256 === snapshot.payloadHash && Array.isArray(snapshot.sourceRefs) && snapshot.sourceRefs.length === 1 &&
    snapshot.sourceRefs[0].path === 'ai_pdm_contract.v_application_role_catalog_v1' &&
    snapshot.sourceRefs[0].sha256 === snapshot.payloadHash
  if (snapshot.applicationId !== 'ai-pdm') add('EXTERNAL_CATALOG_OWNER_INVALID', 'applicationId', 'catalog owner 必須為 ai-pdm')
  if (snapshot.sourceKind !== 'bundled-fixture' && !compatiblePublication) add('EXTERNAL_CATALOG_SOURCE_INVALID', 'sourceKind', 'catalog 必須有受驗來源')
  if (!artifact && !compatiblePublication) add('EXTERNAL_CATALOG_VERSION_CONFLICT', 'catalogVersion', 'catalog version 不符合目前契約')
  if (snapshot.effectState !== 'not-synchronized') add('EXTERNAL_CATALOG_EFFECT_INVALID', 'effectState', 'Current Phase 不得宣稱已同步')
  if (!/^[a-f0-9]{64}$/u.test(snapshot.payloadHash) || (!compatiblePublication && snapshot.payloadHash.toLowerCase() !== artifact?.catalogSha256)) add('EXTERNAL_CATALOG_INVALID', 'payloadHash', 'catalog payload hash 不一致')
  if (!Array.isArray(snapshot.roles)) { add('EXTERNAL_CATALOG_INVALID', 'roles', 'roles 必須為陣列'); return issues }
  const stableIds = new Set<string>(); const codes = new Set<string>()
  snapshot.roles.forEach((role, index) => {
    if (stableIds.has(role.stableRoleId)) add('EXTERNAL_CATALOG_DUPLICATE_ID', `roles[${index}].stableRoleId`, 'stable role ID 必須唯一')
    if (codes.has(role.code)) add('EXTERNAL_CATALOG_DUPLICATE_CODE', `roles[${index}].code`, 'role code 必須唯一')
    stableIds.add(role.stableRoleId); codes.add(role.code)
    if (!role.displayName.trim() || !role.code.trim()) add('EXTERNAL_CATALOG_ROLE_INVALID', `roles[${index}]`, 'role code／名稱不可為空')
    if (!role.assignable && !role.unassignableReason) add('EXTERNAL_CATALOG_ROLE_INVALID', `roles[${index}]`, '不可指派角色必須提供原因')
  })
  const expectedRoles = artifact ? metadataRoles(artifact) : compatiblePublication ? metadataRoles(aiPdmCatalogV7Fixture) : []
  // jsonb may reorder object keys; keep role order, exact fields and values fixed.
  if (snapshot.roles.length !== expectedRoles.length || snapshot.roles.some((role, index) => {
    const expected = expectedRoles[index]
    return !expected || Object.keys(role).length !== Object.keys(expected).length ||
      Object.entries(expected).some(([key, value]) => JSON.stringify(role[key as keyof typeof role]) !== JSON.stringify(value))
  })) add('EXTERNAL_CATALOG_INVALID', 'roles', 'catalog role semantics 不符合 AI-PDM publication')
  return issues
}

export function readAiPdmRoleCatalog(validationState?: ExternalRoleCatalogSnapshotV1['validationState']) {
  const envState = typeof process !== 'undefined' ? process.env.ORGMASTER_DEV_EXTERNAL_CATALOG_STATE as ExternalRoleCatalogSnapshotV1['validationState'] | undefined : undefined
  const state = validationState ?? envState ?? 'valid'
  const snapshot = createAiPdmRoleCatalog(state)
  const issues = validateExternalRoleCatalog(snapshot)
  return issues.length && state === 'valid' ? { ...snapshot, validationState: 'invalid' as const } : snapshot
}
