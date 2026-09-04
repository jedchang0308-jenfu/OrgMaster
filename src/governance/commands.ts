import { createHash } from 'node:crypto'
import type { GovernanceCommand, GovernanceCommandV2, GovernanceCommandV3, GovernanceDocumentV1, GovernanceDocumentV2, GovernanceDocumentV3, GovernancePolicyDataV1, GovernancePolicyDataV2, GovernancePolicyDataV3, GovernanceRoleAssignmentV2, GovernanceRoleAssignmentV3 } from './types'
import { genericV2AssignmentSurfaceIssue } from './assignmentSurface'
import { assertValidDocument, GovernanceValidationError, validatePolicyData, validatePolicyDataV2, validatePolicyDataV3 } from './validation'

export function canonicalJson(value: unknown) { return JSON.stringify(value) }
export function sha256(value: string) { return createHash('sha256').update(value).digest('hex') }
export function commandHash(command: unknown) { return sha256(canonicalJson(command)) }
export type CommandApplyResult = { status: 'applied' | 'noop'; document: GovernanceDocumentV1; entityType: string; entityId: string | null; beforeHash: string | null; afterHash: string | null }

function replaceById<T extends { id: string }>(items: T[], value: T) { const index = items.findIndex((item) => item.id === value.id); if (index < 0) return [...items, value]; const next = [...items]; next[index] = value; return next }
function removeGrant(data: GovernancePolicyDataV1, roleId: string, permissionId: string) { return data.rolePermissionGrants.filter((grant) => !(grant.roleId === roleId && grant.permissionId === permissionId)) }
function entityInfo(command: GovernanceCommand) {
  const value = command as any
  if (command.type.includes('IDENTITY_LINK')) return ['identityLink', value.id ?? value.value?.id]
  if (command.type.includes('APPLICATION_ROLE')) return ['applicationRole', value.id ?? value.value?.id]
  if (command.type.includes('PERMISSION')) return ['permission', value.id ?? value.value?.id]
  if (command.type === 'REMOVE_ROLE_PERMISSION_GRANT') return ['rolePermissionGrant', `${value.roleId}:${value.permissionId}`]
  if (command.type === 'SET_ROLE_PERMISSION_GRANT') return ['rolePermissionGrant', value.value.id]
  if (command.type.includes('ROLE_ASSIGNMENT')) return ['roleAssignment', value.id ?? value.value?.id]
  if (command.type.includes('PRINCIPAL_ADMISSION')) return ['principalAdmission', value.id ?? value.value?.id]
  if (command.type.includes('DELEGATION')) return ['delegation', value.id ?? value.value?.id]
  return ['approvalPolicy', value.id ?? value.value?.id]
}
export function applyGovernanceCommand(document: GovernanceDocumentV1, command: GovernanceCommand): CommandApplyResult {
  const before = canonicalJson(document.draft)
  const incoming = (command as any).value
  if (command.type === 'UPSERT_APPLICATION_ROLE' && document.draft.applicationRoles.some((value) => value.id === incoming.id && value.code !== incoming.code)) throw new GovernanceValidationError([{ code: 'CODE_IMMUTABLE', path: 'applicationRoles.code', message: 'application role code 建立後不可修改' }])
  if (command.type === 'UPSERT_PERMISSION' && document.draft.permissions.some((value) => value.id === incoming.id && (value.code !== incoming.code || value.applicationId !== incoming.applicationId || value.kind !== incoming.kind))) throw new GovernanceValidationError([{ code: 'CODE_IMMUTABLE', path: 'permissions.code', message: 'permission code 建立後不可修改' }])
  let data = document.draft as GovernancePolicyDataV1
  switch (command.type) {
    case 'UPSERT_IDENTITY_LINK': data = { ...data, identityLinks: replaceById(data.identityLinks, command.value) }; break
    case 'SET_IDENTITY_LINK_STATUS': data = { ...data, identityLinks: data.identityLinks.map((v) => v.id === command.id ? { ...v, status: command.status } : v) }; break
    case 'UPSERT_APPLICATION_ROLE': data = { ...data, applicationRoles: replaceById(data.applicationRoles, command.value) }; break
    case 'SET_APPLICATION_ROLE_STATUS': data = { ...data, applicationRoles: data.applicationRoles.map((v) => v.id === command.id ? { ...v, status: command.status } : v) }; break
    case 'UPSERT_PERMISSION': data = { ...data, permissions: replaceById(data.permissions, command.value) }; break
    case 'SET_PERMISSION_STATUS': data = { ...data, permissions: data.permissions.map((v) => v.id === command.id ? { ...v, status: command.status } : v) }; break
    case 'SET_ROLE_PERMISSION_GRANT': data = { ...data, rolePermissionGrants: replaceById(data.rolePermissionGrants, command.value) }; break
    case 'REMOVE_ROLE_PERMISSION_GRANT': data = { ...data, rolePermissionGrants: removeGrant(data, command.roleId, command.permissionId) }; break
    case 'UPSERT_ROLE_ASSIGNMENT': data = { ...data, roleAssignments: replaceById(data.roleAssignments, command.value) }; break
    case 'REVOKE_ROLE_ASSIGNMENT': data = { ...data, roleAssignments: data.roleAssignments.map((v) => v.id === command.id ? { ...v, status: 'revoked' } : v) }; break
    case 'UPSERT_DELEGATION': data = { ...data, delegations: replaceById(data.delegations, command.value) }; break
    case 'REVOKE_DELEGATION': data = { ...data, delegations: data.delegations.map((v) => v.id === command.id ? { ...v, status: 'revoked' } : v) }; break
    case 'UPSERT_APPROVAL_POLICY': data = { ...data, approvalPolicies: replaceById(data.approvalPolicies, command.value) }; break
    case 'SET_APPROVAL_POLICY_STATUS': data = { ...data, approvalPolicies: data.approvalPolicies.map((v) => v.id === command.id ? { ...v, status: command.status } : v) }; break
  }
  const nextDraftBase = { ...data, basePolicyVersionId: document.draft.basePolicyVersionId }
  const stripTimestamp = (draft: GovernancePolicyDataV1 & { basePolicyVersionId?: string | null; updatedAt?: string }) => {
    const { updatedAt: _updatedAt, ...comparable } = draft
    return comparable
  }
  if (canonicalJson(stripTimestamp(document.draft)) === canonicalJson(stripTimestamp(nextDraftBase))) return { status: 'noop', document, entityType: entityInfo(command)[0], entityId: entityInfo(command)[1], beforeHash: sha256(before), afterHash: sha256(before) }
  const nextDraft = { ...nextDraftBase, updatedAt: new Date().toISOString() }
  const after = canonicalJson(nextDraft)
  const issues = validatePolicyData(nextDraft)
  if (issues.length) throw new GovernanceValidationError(issues)
  return { status: 'applied', document: { ...document, draft: nextDraft }, entityType: entityInfo(command)[0], entityId: entityInfo(command)[1], beforeHash: sha256(before), afterHash: sha256(after) }
}
export function ensureCommandShape(value: unknown): value is GovernanceCommand {
  return !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string' && typeof (value as { commandId?: unknown }).commandId === 'string' && typeof (value as { reason?: unknown }).reason === 'string'
}
export { assertValidDocument }

export type CommandApplyResultV2 = { status: 'applied' | 'noop'; document: GovernanceDocumentV2; entityType: string; entityId: string | null; beforeHash: string | null; afterHash: string | null }
function entityInfoV2(command: GovernanceCommandV2) {
  const value = command as any
  if (command.type.includes('IDENTITY_LINK')) return ['identityLink', value.id ?? value.value?.id]
  if (command.type.includes('APPLICATION_ROLE')) return ['applicationRole', value.id ?? value.value?.id]
  if (command.type.includes('PERMISSION')) return ['permission', value.id ?? value.value?.id]
  if (command.type === 'REMOVE_ROLE_PERMISSION_GRANT') return ['rolePermissionGrant', `${value.roleId}:${value.permissionId}`]
  if (command.type === 'SET_ROLE_PERMISSION_GRANT') return ['rolePermissionGrant', value.value.id]
  if (command.type.includes('ROLE_ASSIGNMENT')) return ['roleAssignment', value.id ?? value.value?.id]
  if (command.type.includes('PRINCIPAL_ADMISSION')) return ['principalAdmission', value.id ?? value.value?.id]
  return ['roleDelegation', value.id ?? value.value?.id]
}
function replaceByIdV2<T extends { id: string }>(items: T[], value: T) { const index = items.findIndex((item) => item.id === value.id); if (index < 0) return [...items, value]; const next = [...items]; next[index] = value; return next }
function removeGrantV2(data: GovernancePolicyDataV2, roleId: string, permissionId: string) { return data.rolePermissionGrants.filter((grant) => !(grant.roleId === roleId && grant.permissionId === permissionId)) }

export function governanceV2CommandSurfaceIssue(document: GovernanceDocumentV2, command: GovernanceCommandV2, catalogs: Parameters<typeof validatePolicyDataV2>[2] = []) {
  let assignment: GovernanceDocumentV2['draft']['roleAssignments'][number] | undefined
  let delegation: GovernanceDocumentV2['draft']['roleDelegations'][number] | undefined
  if (command.type === 'UPSERT_ROLE_ASSIGNMENT') assignment = command.value
  if (command.type === 'REVOKE_ROLE_ASSIGNMENT') assignment = document.draft.roleAssignments.find((value) => value.id === command.id)
  if (command.type === 'UPSERT_ROLE_DELEGATION') delegation = command.value
  if (command.type === 'REVOKE_ROLE_DELEGATION') delegation = document.draft.roleDelegations.find((value) => value.id === command.id)
  const applicationId = assignment?.applicationId ?? delegation?.applicationId
  const roleId = assignment?.roleId ?? delegation?.roleId
  if (!applicationId || !roleId) return null
  const catalogRole = applicationId === 'ai-pdm' ? catalogs.find((catalog) => catalog.applicationId === 'ai-pdm')?.roles.find((role) => role.stableRoleId === roleId) : undefined
  return genericV2AssignmentSurfaceIssue(applicationId, { stableRoleId: roleId, code: assignment?.roleCodeSnapshot ?? catalogRole?.code ?? '' }, catalogRole)
}

export function applyGovernanceCommandV2(document: GovernanceDocumentV2, command: GovernanceCommandV2, source?: Parameters<typeof validatePolicyDataV2>[1], catalogs: Parameters<typeof validatePolicyDataV2>[2] = []): CommandApplyResultV2 {
  if (['UPSERT_APPLICATION_ROLE', 'SET_APPLICATION_ROLE_STATUS', 'UPSERT_PERMISSION', 'SET_PERMISSION_STATUS', 'SET_ROLE_PERMISSION_GRANT', 'REMOVE_ROLE_PERMISSION_GRANT'].includes(command.type)) {
    const value = (command as any).value; const targetRole = value?.applicationId ? value : document.draft.applicationRoles.find((role) => role.id === (command as any).id); const targetPermission = value?.applicationId ? value : document.draft.permissions.find((permission) => permission.id === (command as any).id)
    if ((targetRole?.applicationId && targetRole.applicationId !== 'orgmaster') || (targetPermission?.applicationId && targetPermission.applicationId !== 'orgmaster')) throw new GovernanceValidationError([{ code: 'EXTERNAL_CATALOG_READ_ONLY', path: '', message: '外部角色／權限只能由外部系統管理' }])
  }
  const surfaceIssue = governanceV2CommandSurfaceIssue(document, command, catalogs)
  if (surfaceIssue) throw new GovernanceValidationError([{ code: surfaceIssue, path: command.type.includes('DELEGATION') ? 'roleDelegations' : 'roleAssignments', message: surfaceIssue === 'PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED' ? '特權角色必須使用專用治理介面' : 'catalog role policy 不完整或矛盾' }])
  const before = canonicalJson(document.draft); let data = document.draft
  switch (command.type) {
    case 'UPSERT_IDENTITY_LINK': data = { ...data, identityLinks: replaceByIdV2(data.identityLinks, command.value) }; break
    case 'SET_IDENTITY_LINK_STATUS': data = { ...data, identityLinks: data.identityLinks.map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
    case 'UPSERT_APPLICATION_ROLE': data = { ...data, applicationRoles: replaceByIdV2(data.applicationRoles, command.value) }; break
    case 'SET_APPLICATION_ROLE_STATUS': data = { ...data, applicationRoles: data.applicationRoles.map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
    case 'UPSERT_PERMISSION': data = { ...data, permissions: replaceByIdV2(data.permissions, command.value) }; break
    case 'SET_PERMISSION_STATUS': data = { ...data, permissions: data.permissions.map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
    case 'SET_ROLE_PERMISSION_GRANT': data = { ...data, rolePermissionGrants: replaceByIdV2(data.rolePermissionGrants, command.value) }; break
    case 'REMOVE_ROLE_PERMISSION_GRANT': data = { ...data, rolePermissionGrants: removeGrantV2(data, command.roleId, command.permissionId) }; break
    case 'UPSERT_ROLE_ASSIGNMENT': data = { ...data, roleAssignments: replaceByIdV2(data.roleAssignments, command.value) }; break
    case 'REVOKE_ROLE_ASSIGNMENT': data = { ...data, roleAssignments: data.roleAssignments.map((value) => value.id === command.id ? { ...value, status: 'revoked' as const } : value) }; break
    case 'UPSERT_ROLE_DELEGATION': data = { ...data, roleDelegations: replaceByIdV2(data.roleDelegations, command.value) }; break
    case 'REVOKE_ROLE_DELEGATION': data = { ...data, roleDelegations: data.roleDelegations.map((value) => value.id === command.id ? { ...value, status: 'revoked' as const } : value) }; break
    case 'UPSERT_PRINCIPAL_ADMISSION': data = { ...data, principalAdmissions: replaceByIdV2(data.principalAdmissions ?? [], command.value) }; break
    case 'SET_PRINCIPAL_ADMISSION_STATUS': data = { ...data, principalAdmissions: (data.principalAdmissions ?? []).map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
  }
  const nextDraftBase = { ...data, basePolicyVersionId: document.draft.basePolicyVersionId }
  const stripTimestamp = (draft: GovernancePolicyDataV2 & { basePolicyVersionId?: string | null; updatedAt?: string }) => { const { updatedAt: _updatedAt, ...comparable } = draft; return comparable }
  if (canonicalJson(stripTimestamp(document.draft)) === canonicalJson(stripTimestamp(nextDraftBase))) return { status: 'noop', document, entityType: entityInfoV2(command)[0], entityId: entityInfoV2(command)[1], beforeHash: sha256(before), afterHash: sha256(before) }
  const nextDraft = { ...nextDraftBase, updatedAt: new Date().toISOString() }; const issues = validatePolicyDataV2(nextDraft, source, catalogs); if (issues.length) throw new GovernanceValidationError(issues)
  return { status: 'applied', document: { ...document, draft: nextDraft }, entityType: entityInfoV2(command)[0], entityId: entityInfoV2(command)[1], beforeHash: sha256(before), afterHash: sha256(canonicalJson(nextDraft)) }
}

export type CommandApplyResultV3 = { status: 'applied' | 'noop'; document: GovernanceDocumentV3; entityType: string; entityId: string | null; beforeHash: string | null; afterHash: string | null }

function normalizeV3Assignment(value: GovernanceRoleAssignmentV2 | GovernanceRoleAssignmentV3, reason: string): GovernanceRoleAssignmentV3 {
  if ('basis' in value) return value
  return {
    ...value,
    basis: 'manual',
    subjectKind: 'employee',
    targetPrincipalId: null,
    sources: [],
    metadata: { sponsorEmployeeId: null, reviewDueAt: null },
    createdByPrincipalId: 'system:generic-v2-adapter',
    createdReason: reason,
  }
}

function v3EntityInfo(command: GovernanceCommandV2 | GovernanceCommandV3) {
  return entityInfoV2(command as GovernanceCommandV2)
}

export function applyGovernanceCommandV3(
  document: GovernanceDocumentV3,
  command: GovernanceCommandV2 | GovernanceCommandV3,
  source?: Parameters<typeof validatePolicyDataV3>[1],
  catalogs: Parameters<typeof validatePolicyDataV3>[2] = [],
): CommandApplyResultV3 {
  if (['UPSERT_APPLICATION_ROLE', 'SET_APPLICATION_ROLE_STATUS', 'UPSERT_PERMISSION', 'SET_PERMISSION_STATUS', 'SET_ROLE_PERMISSION_GRANT', 'REMOVE_ROLE_PERMISSION_GRANT'].includes(command.type)) {
    const value = (command as any).value
    const targetRole = value?.applicationId ? value : document.draft.applicationRoles.find((role) => role.id === (command as any).id)
    const targetPermission = value?.applicationId ? value : document.draft.permissions.find((permission) => permission.id === (command as any).id)
    if ((targetRole?.applicationId && targetRole.applicationId !== 'orgmaster') || (targetPermission?.applicationId && targetPermission.applicationId !== 'orgmaster')) {
      throw new GovernanceValidationError([{ code: 'EXTERNAL_CATALOG_READ_ONLY', path: '', message: '外部角色／權限只能由外部系統管理' }])
    }
  }

  const catalog = catalogs.find((value) => value.applicationId === 'ai-pdm')
  const assignment = command.type === 'UPSERT_ROLE_ASSIGNMENT' ? command.value : command.type === 'REVOKE_ROLE_ASSIGNMENT' ? document.draft.roleAssignments.find((value) => value.id === command.id) : undefined
  const delegation = command.type === 'UPSERT_ROLE_DELEGATION' ? command.value : command.type === 'REVOKE_ROLE_DELEGATION' ? document.draft.roleDelegations.find((value) => value.id === command.id) : undefined
  const roleId = assignment?.roleId ?? delegation?.roleId
  const applicationId = assignment?.applicationId ?? delegation?.applicationId
  if (roleId && applicationId) {
    const catalogRole = applicationId === 'ai-pdm' ? catalog?.roles.find((role) => role.stableRoleId === roleId) : undefined
    const surfaceIssue = genericV2AssignmentSurfaceIssue(applicationId, { stableRoleId: roleId, code: assignment?.roleCodeSnapshot ?? catalogRole?.code ?? '' }, catalogRole)
    if (surfaceIssue) throw new GovernanceValidationError([{ code: surfaceIssue, path: delegation ? 'roleDelegations' : 'roleAssignments', message: surfaceIssue === 'PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED' ? '特權角色必須使用專用治理介面' : 'catalog role policy不完整或矛盾' }])
  }

  const before = canonicalJson(document.draft)
  let data: GovernancePolicyDataV3 = document.draft
  switch (command.type) {
    case 'UPSERT_IDENTITY_LINK': data = { ...data, identityLinks: replaceByIdV2(data.identityLinks, command.value) }; break
    case 'SET_IDENTITY_LINK_STATUS': data = { ...data, identityLinks: data.identityLinks.map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
    case 'UPSERT_APPLICATION_ROLE': data = { ...data, applicationRoles: replaceByIdV2(data.applicationRoles, command.value) }; break
    case 'SET_APPLICATION_ROLE_STATUS': data = { ...data, applicationRoles: data.applicationRoles.map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
    case 'UPSERT_PERMISSION': data = { ...data, permissions: replaceByIdV2(data.permissions, command.value) }; break
    case 'SET_PERMISSION_STATUS': data = { ...data, permissions: data.permissions.map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
    case 'SET_ROLE_PERMISSION_GRANT': data = { ...data, rolePermissionGrants: replaceByIdV2(data.rolePermissionGrants, command.value) }; break
    case 'REMOVE_ROLE_PERMISSION_GRANT': data = { ...data, rolePermissionGrants: removeGrantV2(data, command.roleId, command.permissionId) }; break
    case 'UPSERT_ROLE_ASSIGNMENT': data = { ...data, roleAssignments: replaceByIdV2(data.roleAssignments, normalizeV3Assignment(command.value, command.reason)) }; break
    case 'REVOKE_ROLE_ASSIGNMENT': data = { ...data, roleAssignments: data.roleAssignments.map((value) => value.id === command.id ? { ...value, status: 'revoked' as const } : value) }; break
    case 'UPSERT_ROLE_DELEGATION': data = { ...data, roleDelegations: replaceByIdV2(data.roleDelegations, command.value) }; break
    case 'REVOKE_ROLE_DELEGATION': data = { ...data, roleDelegations: data.roleDelegations.map((value) => value.id === command.id ? { ...value, status: 'revoked' as const } : value) }; break
    case 'UPSERT_PRINCIPAL_ADMISSION': data = { ...data, principalAdmissions: replaceByIdV2(data.principalAdmissions ?? [], command.value) }; break
    case 'SET_PRINCIPAL_ADMISSION_STATUS': data = { ...data, principalAdmissions: (data.principalAdmissions ?? []).map((value) => value.id === command.id ? { ...value, status: command.status } : value) }; break
  }
  const nextDraftBase = { ...data, basePolicyVersionId: document.draft.basePolicyVersionId }
  const stripTimestamp = (draft: GovernancePolicyDataV3 & { basePolicyVersionId?: string | null; updatedAt?: string }) => { const { updatedAt: _updatedAt, ...comparable } = draft; return comparable }
  const [entityType, entityId] = v3EntityInfo(command)
  if (canonicalJson(stripTimestamp(document.draft)) === canonicalJson(stripTimestamp(nextDraftBase))) return { status: 'noop', document, entityType, entityId, beforeHash: sha256(before), afterHash: sha256(before) }
  const nextDraft = { ...nextDraftBase, updatedAt: new Date().toISOString() }
  const issues = validatePolicyDataV3(nextDraft, source, catalogs)
  if (issues.length) throw new GovernanceValidationError(issues)
  return { status: 'applied', document: { ...document, draft: nextDraft }, entityType, entityId, beforeHash: sha256(before), afterHash: sha256(canonicalJson(nextDraft)) }
}
