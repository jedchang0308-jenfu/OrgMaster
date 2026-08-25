import type { GovernanceApplicationRoleV1, GovernanceApplicationV1, GovernancePermissionV1 } from './types'

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
