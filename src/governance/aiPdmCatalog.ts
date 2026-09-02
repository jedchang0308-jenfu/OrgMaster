import type { ExternalRoleCatalogRoleV1, ExternalRoleCatalogSnapshotV1, GovernanceApplicationRoleV1, GovernanceApplicationV1, GovernancePermissionV1 } from './types'
import aiPdmCatalogFixture from '../../contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json'

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
]
export const ORGMASTER_PERMISSIONS: GovernancePermissionV1[] = [
  { id: 'permission-orgmaster-governance-manage', applicationId: 'orgmaster', kind: 'system', code: 'orgmaster.governance.manage', name: '管理治理設定', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-governance-publish', applicationId: 'orgmaster', kind: 'system', code: 'orgmaster.governance.publish', name: '發布治理政策', risk: 'high', status: 'active' },
  { id: 'permission-orgmaster-governance-simulate', applicationId: 'orgmaster', kind: 'system', code: 'orgmaster.governance.simulate', name: '執行治理測試器', risk: 'normal', status: 'active' },
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

export const AI_PDM_ROLE_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-02.v2' as const
export const AI_PDM_ROLE_CATALOG_SHA256 = 'ebdaa2960960e0683b480c721d2c27df59031b4af23b124f2ac7e882309f6b6e' as const
const AI_PDM_ROLE_CATALOG_IDS = [
  'role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning',
  'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin',
] as const
if (aiPdmCatalogFixture.contractVersion !== 'jenfu.platform-entitlement.v1' || aiPdmCatalogFixture.applicationId !== 'ai-pdm' || aiPdmCatalogFixture.catalogVersion !== AI_PDM_ROLE_CATALOG_VERSION || aiPdmCatalogFixture.catalogSha256.toLowerCase() !== AI_PDM_ROLE_CATALOG_SHA256 || JSON.stringify(aiPdmCatalogFixture.roles.map((role) => role.stableRoleId)) !== JSON.stringify(AI_PDM_ROLE_CATALOG_IDS)) {
  throw new Error('EXTERNAL_CATALOG_INVALID')
}
export const AI_PDM_ROLE_CATALOG_SOURCE_REFS = [
  { path: 'AI_PDM/db/schema.sql', range: '2222-2232', sha256: 'B89925107C6ADC10D085E581EBB9E5FBAC42505155CB0774F1AB46B7F261FCD8' },
  { path: 'AI_PDM/src/lib/repositories/numbering-repository.ts', range: '4744-4759', sha256: '69E21966C1DA2A8146144CC83251FA606572A5042437342FBEF475C7D771289A' },
  { path: 'AI_PDM/src/lib/repositories/numbering-repository.ts', range: '4785-4791', sha256: '388291CD51446AA88D5A1B935D109FEB9FC6663FDEE8B1545A2F5B67C448005C' },
] as const

export const AI_PDM_ROLE_CATALOG_ROLES: readonly ExternalRoleCatalogRoleV1[] = aiPdmCatalogFixture.roles.map((role) => ({
  stableRoleId: role.stableRoleId,
  code: role.roleCode,
  displayName: role.displayName,
  status: 'active',
  assignable: role.assignable,
  riskLevel: role.risk as ExternalRoleCatalogRoleV1['riskLevel'],
  allowedScopeKinds: [...role.allowedScopeKinds] as ExternalRoleCatalogRoleV1['allowedScopeKinds'],
}))

export function createAiPdmRoleCatalog(validationState: ExternalRoleCatalogSnapshotV1['validationState'] = 'valid', capturedAt = aiPdmCatalogFixture.publishedAt): ExternalRoleCatalogSnapshotV1 {
  const base = {
    applicationId: 'ai-pdm' as const,
    catalogVersion: AI_PDM_ROLE_CATALOG_VERSION,
    sourceKind: 'bundled-fixture' as const,
    sourceRefs: AI_PDM_ROLE_CATALOG_SOURCE_REFS.map((ref) => ({ ...ref })),
    capturedAt,
    roles: AI_PDM_ROLE_CATALOG_ROLES.map((role) => ({ ...role, allowedScopeKinds: [...role.allowedScopeKinds] })),
  }
  return { ...base, payloadHash: AI_PDM_ROLE_CATALOG_SHA256, validationState, effectState: 'not-synchronized' }
}

export type ExternalRoleCatalogValidationIssue = { code: string; path: string; message: string }
export function validateExternalRoleCatalog(snapshot: ExternalRoleCatalogSnapshotV1): ExternalRoleCatalogValidationIssue[] {
  const issues: ExternalRoleCatalogValidationIssue[] = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  if (snapshot.applicationId !== 'ai-pdm') add('EXTERNAL_CATALOG_OWNER_INVALID', 'applicationId', 'catalog owner 必須為 ai-pdm')
  if (snapshot.sourceKind !== 'bundled-fixture') add('EXTERNAL_CATALOG_SOURCE_INVALID', 'sourceKind', 'Current Phase 僅允許 bundled fixture')
  if (snapshot.catalogVersion !== AI_PDM_ROLE_CATALOG_VERSION) add('EXTERNAL_CATALOG_VERSION_CONFLICT', 'catalogVersion', 'catalog version 不符合目前契約')
  if (snapshot.effectState !== 'not-synchronized') add('EXTERNAL_CATALOG_EFFECT_INVALID', 'effectState', 'Current Phase 不得宣稱已同步')
  if (!/^[a-f0-9]{64}$/u.test(snapshot.payloadHash) || snapshot.payloadHash.toLowerCase() !== AI_PDM_ROLE_CATALOG_SHA256) add('EXTERNAL_CATALOG_INVALID', 'payloadHash', 'catalog payload hash 不一致')
  if (!Array.isArray(snapshot.roles)) { add('EXTERNAL_CATALOG_INVALID', 'roles', 'roles 必須為陣列'); return issues }
  const stableIds = new Set<string>(); const codes = new Set<string>()
  snapshot.roles.forEach((role, index) => {
    if (stableIds.has(role.stableRoleId)) add('EXTERNAL_CATALOG_DUPLICATE_ID', `roles[${index}].stableRoleId`, 'stable role ID 必須唯一')
    if (codes.has(role.code)) add('EXTERNAL_CATALOG_DUPLICATE_CODE', `roles[${index}].code`, 'role code 必須唯一')
    stableIds.add(role.stableRoleId); codes.add(role.code)
    if (!role.displayName.trim() || !role.code.trim()) add('EXTERNAL_CATALOG_ROLE_INVALID', `roles[${index}]`, 'role code／名稱不可為空')
    if (!role.assignable && !role.unassignableReason) add('EXTERNAL_CATALOG_ROLE_INVALID', `roles[${index}]`, '不可指派角色必須提供原因')
  })
  if (JSON.stringify(snapshot.roles) !== JSON.stringify(AI_PDM_ROLE_CATALOG_ROLES)) add('EXTERNAL_CATALOG_INVALID', 'roles', 'catalog role semantics 不符合 AI-PDM publication')
  return issues
}

export function readAiPdmRoleCatalog(validationState?: ExternalRoleCatalogSnapshotV1['validationState']) {
  const envState = typeof process !== 'undefined' ? process.env.ORGMASTER_DEV_EXTERNAL_CATALOG_STATE as ExternalRoleCatalogSnapshotV1['validationState'] | undefined : undefined
  const state = validationState ?? envState ?? 'valid'
  const snapshot = createAiPdmRoleCatalog(state)
  const issues = validateExternalRoleCatalog(snapshot)
  return issues.length && state === 'valid' ? { ...snapshot, validationState: 'invalid' as const } : snapshot
}
