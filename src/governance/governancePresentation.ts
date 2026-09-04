import type {
  GovernanceDocumentV1,
  GovernanceDocumentV2,
  GovernanceDraftV1,
  GovernanceIdentityLinkV1,
  GovernancePolicyDataV1,
  GovernancePolicyVersionV1,
} from './types'

type GovernancePolicyDataViewV2 = Omit<GovernanceDocumentV2['draft'], 'identityLinks'> & { identityLinks: GovernanceIdentityLinkViewV1[] }
export type GovernanceDocumentViewV2 = Omit<GovernanceDocumentV2, 'draft' | 'publishedVersions'> & { draft: GovernancePolicyDataViewV2; publishedVersions: Array<Omit<GovernanceDocumentV2['publishedVersions'][number], 'policy'> & { policy: GovernancePolicyDataViewV2 }> }

export type GovernanceIdentityLinkViewV1 = Omit<GovernanceIdentityLinkV1, 'subject'> & {
  subjectHint: string
  subjectFingerprint: string
}

export type GovernancePolicyDataViewV1 = Omit<GovernancePolicyDataV1, 'identityLinks'> & {
  identityLinks: GovernanceIdentityLinkViewV1[]
}

export type GovernanceDraftViewV1 = Omit<GovernanceDraftV1, 'identityLinks'> & {
  identityLinks: GovernanceIdentityLinkViewV1[]
}

export type GovernancePolicyVersionViewV1 = Omit<GovernancePolicyVersionV1, 'policy'> & {
  policy: GovernancePolicyDataViewV1
}

export type GovernanceDocumentViewV1 = Omit<GovernanceDocumentV1, 'draft' | 'publishedVersions'> & {
  draft: GovernanceDraftViewV1
  publishedVersions: GovernancePolicyVersionViewV1[]
}

export type GovernanceFailureView = {
  code: string
  message: string
  canReload: boolean
}

export type GovernancePublishBlocker = {
  code: string
  message: string
  section: 'identity' | 'assignments' | 'versions'
}

type ApiFailureLike = {
  code?: unknown
  issues?: unknown
}

type ValidationIssueLike = {
  code?: unknown
  message?: unknown
}

const FAILURE_MESSAGES: Record<string, string> = {
  COMMAND_ID_REUSED: '這次操作識別碼已被其他內容使用，請重新操作。',
  GOVERNANCE_ADMIN_CONTINUITY_REQUIRED: '目標政策不會保留目前管理者的治理權限；請先補齊管理與發布角色。',
  GOVERNANCE_ADMIN_REQUIRED: '目前身分沒有管理治理設定的權限。',
  GOVERNANCE_PUBLISH_REQUIRED: '請先將目前登入員工指派可發布治理政策的應用角色。',
  GOVERNANCE_READ_FAILED: '治理資料目前無法讀取，請重新載入。',
  GOVERNANCE_VALIDATION_FAILED: '治理資料未通過驗證，請檢查目前區段後再試。',
  GOVERNANCE_WRITE_FAILED: '治理資料未保存，請重新操作。',
  ORGMASTER_UNAVAILABLE: 'OrgMaster 暫時無法使用；請稍後重新載入。',
  IDENTITY_CONTEXT_REQUIRED: '找不到目前登入身分，請重新開啟治理中心。',
  IDENTITY_PROVIDER_NOT_CONFIGURED: '目前環境未設定可用的身分提供者。',
  IDENTITY_LINK_CONFLICT: '目前登入身分已連結其他員工，不能在此改綁。',
  EMPLOYEE_NOT_ACTIVE: '停用員工不能連結登入身分。',
  SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN: '不能停用目前登入身分；請由另一位治理管理者處理。',
  ORGANIZATION_VERSION_INVALID: '現行組織版本已變更，請重新載入後再發布。',
  PAYLOAD_TOO_LARGE: '送出的治理資料超過大小限制。',
  POLICY_VERSION_NOT_FOUND: '找不到指定的治理政策版本。',
  PUBLISHER_NOT_LINKED: '請先把目前登入身分連結到員工。',
  REVISION_CONFLICT: '治理資料已在其他操作中更新，請重新載入後再試。',
  EXTERNAL_CATALOG_READ_ONLY: '外部角色與權限由目標系統管理，OrgMaster 只提供唯讀目錄。',
  EXTERNAL_CATALOG_VERSION_CONFLICT: '外部角色目錄已更新，請重新載入並確認草稿。',
  EXTERNAL_CATALOG_STALE: '外部角色目錄已過期，請重新載入有效目錄後再發布。',
  EXTERNAL_CATALOG_INVALID: '外部角色目錄驗證失敗，請重新載入。',
  EXTERNAL_CATALOG_UNAVAILABLE: '外部角色目錄暫時無法取得；歷史資料仍可閱讀。',
  EXTERNAL_ROLE_UNKNOWN: '找不到指定外部角色，請改選目前目錄中的角色。',
  EXTERNAL_ROLE_INACTIVE: '指定外部角色已停用，請改選有效角色。',
  EXTERNAL_ROLE_UNASSIGNABLE: '指定外部角色目前不可指派，沒有手動覆寫。',
  EXTERNAL_SCOPE_UNSUPPORTED: '此角色不允許目前作用範圍，請修正範圍。',
  ROLE_DELEGATION_INVALID: '角色代理來源、範圍或期間無效，請修正後再試。',
  LEGACY_MIGRATION_UNRESOLVED: '歷史資料仍有未解析項目，請檢視 migration 詳情後重建指派。',
  LEGACY_POLICY_REACTIVATION_FORBIDDEN: '歷史 V1 版本只能閱讀，請建立新的 V2 版本。',
  LEGACY_GOVERNANCE_EVALUATOR_RETIRED: '舊權限／審核模擬器已停用，請使用角色指派檢查。',
  EXTERNAL_PERMISSION_EVALUATION_UNSUPPORTED: '外部權限由目標系統自行執行，OrgMaster 不模擬。',
  PRIVILEGED_VIEW_REQUIRED: '目前身分沒有檢視特權設定的權限。',
  PRIVILEGED_MUTATION_REQUIRED: '特權設定需要既有的 cross-app override 授權。',
  STEP_UP_REQUIRED: '特權設定需要五分鐘內完成的二次驗證，請重新驗證後再試。',
  PRIVILEGED_SELF_ASSIGNMENT_DENIED: '不可將特權身分授予目前登入身分。',
  PRINCIPAL_ADMISSION_INELIGIBLE: '選取的特權身分已失效，請重新載入。',
  PRIVILEGED_ASSIGNMENT_NOT_FOUND: '找不到這筆特權指派，請重新載入。',
  CATALOG_ROLE_CONTRACT_MISMATCH: 'system_admin 角色契約已漂移；目前只提供唯讀檢視。',
  CATALOG_VERSION_CONFLICT: '角色目錄已更新，請重新載入後再試。',
  CATALOG_PAYLOAD_HASH_MISMATCH: '角色目錄內容驗證失敗，請重新載入。',
  REQUEST_HASH_MISMATCH: '操作內容已變更，請重新產生預覽。',
  PREVIEW_HASH_MISMATCH: '預覽已過期，請重新產生預覽。',
  NO_ELIGIBLE_PRINCIPAL: '目前沒有可授予的 human_privileged 身分。',
  SYSTEM_ADMIN_PRINCIPAL_REQUIRED: '特權指派缺少有效身分資料，請重新載入。',
  COMMAND_NOT_OBSERVED: '操作收據尚未建立，請重新查詢。',
}

const ISSUE_MESSAGES: Record<string, string> = {
  CODE_IMMUTABLE: '代碼建立後不可修改。',
  DELEGATION_SELF: '代理人不可與來源人員相同。',
  EFFECTIVE_PERIOD_INVALID: '有效期間設定不正確。',
  EMPLOYEE_NOT_FOUND: '選取的員工已不存在，請重新選擇。',
  IDENTITY_CONFLICT: '目前登入身分或該員工已建立有效連結；請先停用既有連結。',
  REFERENCE_NOT_FOUND: '引用的角色或權限已不存在，請重新選擇。',
  SCOPE_INVALID: '作用範圍設定不正確。',
  INTERNAL_ASSIGNMENT_INVALID: 'OrgMaster 角色指派資料不完整。',
  EXTERNAL_ASSIGNMENT_SNAPSHOT_INVALID: '外部角色目錄版本與指派快照不一致。',
  DUPLICATE_ACTIVE_ASSIGNMENT: '同一員工已存在相同作用範圍的有效角色指派。',
  ROLE_DELEGATION_INVALID: '角色代理設定不符合來源指派。',
  EXTERNAL_CATALOG_STALE: '外部角色目錄已過期。',
  EXTERNAL_CATALOG_INVALID: '外部角色目錄驗證失敗。',
  EXTERNAL_CATALOG_UNAVAILABLE: '外部角色目錄暫時無法取得。',
}

function validationIssues(value: unknown): ValidationIssueLike[] {
  return Array.isArray(value) ? value.filter((issue): issue is ValidationIssueLike => Boolean(issue) && typeof issue === 'object') : []
}

export function describeGovernanceFailure(error: unknown): GovernanceFailureView {
  const candidate = error && typeof error === 'object' ? error as ApiFailureLike : {}
  const code = typeof candidate.code === 'string'
    ? candidate.code
    : error instanceof Error && error.message in FAILURE_MESSAGES
      ? error.message
      : 'GOVERNANCE_REQUEST_FAILED'
  const messages = validationIssues(candidate.issues).map((issue) => {
    const issueCode = typeof issue.code === 'string' ? issue.code : ''
    if (ISSUE_MESSAGES[issueCode]) return ISSUE_MESSAGES[issueCode]
    return typeof issue.message === 'string' && issue.message.trim() ? issue.message.trim() : null
  }).filter((message): message is string => Boolean(message))
  const uniqueMessages = [...new Set(messages)]
  return {
    code,
    message: uniqueMessages.length ? uniqueMessages.join('；') : FAILURE_MESSAGES[code] ?? '治理操作未完成，請重新操作。',
    canReload: ['REVISION_CONFLICT', 'ORGANIZATION_VERSION_INVALID', 'GOVERNANCE_READ_FAILED', 'ORGMASTER_UNAVAILABLE', 'EXTERNAL_CATALOG_VERSION_CONFLICT', 'EXTERNAL_CATALOG_STALE', 'EXTERNAL_CATALOG_UNAVAILABLE'].includes(code),
  }
}

function activeAt(status: string, validFrom: string, validTo: string | null, at: string) {
  return status === 'active'
    && Number.isFinite(Date.parse(validFrom))
    && Date.parse(validFrom) <= Date.parse(at)
    && (validTo === null || Date.parse(at) < Date.parse(validTo))
}

export function currentPrincipalIdentityLinks(draft: GovernancePolicyDataViewV1, principalId: string, at = new Date().toISOString()) {
  return draft.identityLinks.filter((link) => link.principalId === principalId && activeAt(link.status, link.validFrom, link.validTo, at))
}

function actorHasDraftPermission(draft: GovernancePolicyDataViewV1, employeeId: string, permissionCode: string, at: string) {
  const permission = draft.permissions.find((item) => item.applicationId === 'orgmaster' && item.code === permissionCode && item.status === 'active')
  if (!permission) return false
  const activeRoleIds = new Set(draft.applicationRoles.filter((role) => role.applicationId === 'orgmaster' && role.status === 'active').map((role) => role.id))
  const assignedRoleIds = new Set(draft.roleAssignments.filter((assignment) => assignment.employeeId === employeeId
    && assignment.scope.kind === 'global'
    && activeRoleIds.has(assignment.roleId)
    && activeAt(assignment.status, assignment.validFrom, assignment.validTo, at)).map((assignment) => assignment.roleId))
  const grants = draft.rolePermissionGrants.filter((grant) => assignedRoleIds.has(grant.roleId) && grant.permissionId === permission.id)
  if (grants.some((grant) => grant.effect === 'deny')) return false
  return grants.some((grant) => grant.effect === 'allow')
}

export function governancePublishBlockers(
  draft: GovernancePolicyDataViewV1,
  principalId: string,
  organizationVersionId: string | null,
  at = new Date().toISOString(),
): GovernancePublishBlocker[] {
  const blockers: GovernancePublishBlocker[] = []
  if (!organizationVersionId) blockers.push({ code: 'ORGANIZATION_VERSION_REQUIRED', message: '找不到現行組織版本，請重新載入工作區。', section: 'versions' })
  const links = currentPrincipalIdentityLinks(draft, principalId, at)
  if (links.length !== 1) {
    blockers.push({
      code: links.length ? 'IDENTITY_LINK_CONFLICT' : 'IDENTITY_LINK_REQUIRED',
      message: links.length ? '目前登入身分有多筆有效連結，請先停用重複紀錄。' : '請先把目前登入身分連結到員工。',
      section: 'identity',
    })
    return blockers
  }
  const employeeId = links[0].employeeId
  if (!actorHasDraftPermission(draft, employeeId, 'orgmaster.governance.manage', at)) blockers.push({ code: 'GOVERNANCE_MANAGE_REQUIRED', message: '請先指派具備治理管理權限的全域角色。', section: 'assignments' })
  if (!actorHasDraftPermission(draft, employeeId, 'orgmaster.governance.publish', at)) blockers.push({ code: 'GOVERNANCE_PUBLISH_REQUIRED', message: '請先指派具備政策發布權限的全域角色。', section: 'assignments' })
  return blockers
}

export function sameGlobalRoleAssignment(assignment: GovernanceDraftViewV1['roleAssignments'][number], employeeId: string, roleId: string) {
  return assignment.employeeId === employeeId && assignment.roleId === roleId && assignment.scope.kind === 'global'
}

export function governancePublishBlockersV2(draft: GovernanceDocumentViewV2['draft'], principalId: string, organizationVersionId: string | null, at = new Date().toISOString()): GovernancePublishBlocker[] {
  const blockers: GovernancePublishBlocker[] = []
  if (!organizationVersionId) blockers.push({ code: 'ORGANIZATION_VERSION_REQUIRED', message: '找不到現行組織版本，請重新載入工作區。', section: 'versions' })
  const links = draft.identityLinks.filter((link) => link.principalId === principalId && activeAt(link.status, link.validFrom, link.validTo, at))
  if (links.length !== 1) { blockers.push({ code: links.length ? 'IDENTITY_LINK_CONFLICT' : 'IDENTITY_LINK_REQUIRED', message: links.length ? '目前登入身分有多筆有效連結，請先停用重複紀錄。' : '請先把目前登入身分連結到員工。', section: 'identity' }); return blockers }
  const employeeId = links[0].employeeId; const activeInternalRoles = new Set(draft.applicationRoles.filter((role) => role.applicationId === 'orgmaster' && role.status === 'active').map((role) => role.id)); const assigned = draft.roleAssignments.filter((assignment) => assignment.applicationId === 'orgmaster' && assignment.employeeId === employeeId && assignment.scope.kind === 'global' && activeInternalRoles.has(assignment.roleId) && activeAt(assignment.status, assignment.validFrom, assignment.validTo, at)); const has = (code: string) => { const permission = draft.permissions.find((item) => item.applicationId === 'orgmaster' && item.code === code && item.status === 'active'); if (!permission) return false; const roleIds = new Set(assigned.map((entry) => entry.roleId)); const grants = draft.rolePermissionGrants.filter((grant) => roleIds.has(grant.roleId) && grant.permissionId === permission.id); return !grants.some((grant) => grant.effect === 'deny') && grants.some((grant) => grant.effect === 'allow') }
  if (!has('orgmaster.governance.manage')) blockers.push({ code: 'GOVERNANCE_MANAGE_REQUIRED', message: '請先指派具備治理管理權限的全域 OrgMaster 角色。', section: 'assignments' })
  if (!has('orgmaster.governance.publish')) blockers.push({ code: 'GOVERNANCE_PUBLISH_REQUIRED', message: '請先指派具備發布權限的全域 OrgMaster 角色。', section: 'assignments' })
  if (draft.roleAssignments.some((assignment) => assignment.applicationId === 'ai-pdm' && assignment.status === 'active' && assignment.effectState !== 'not-synchronized')) blockers.push({ code: 'EXTERNAL_EFFECT_INVALID', message: '外部指派 effect state 無效。', section: 'assignments' })
  return blockers
}
