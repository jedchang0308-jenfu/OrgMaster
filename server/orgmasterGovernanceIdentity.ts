import type { IncomingMessage } from 'node:http'
import type { GovernanceActorContext } from '../src/governance/types'

export const DEV_ISSUER = 'urn:orgmaster:dev'
export const DEV_SUBJECT = 'local-admin'
export const DEV_PRINCIPAL_ID = 'dev-principal-local-admin'
export const DEVELOPMENT_PROFILE_COOKIE = 'orgmaster_dev_profile'

export type DevelopmentAuthProfile = {
  id: 'administrator' | 'governance-manager' | 'method-manager' | 'employee'
  roleCode: 'orgmaster_admin' | 'orgmaster_governance_manager' | 'orgmaster_method_manager' | 'orgmaster_employee'
  roleName: string
  employeeId: string
  employeeName: string
  description: string
  subject: string
  principalId: string
  bootstrap: boolean
  permissionCodes: readonly string[]
}

export type PublicDevelopmentAuthProfile = Pick<DevelopmentAuthProfile, 'id' | 'roleCode' | 'roleName' | 'employeeId' | 'employeeName' | 'description'>

const MANAGEMENT_METHOD_PERMISSIONS = [
  'orgmaster.management_method.create',
  'orgmaster.management_method.read_readable',
  'orgmaster.management_method.read_draft',
  'orgmaster.management_method.edit_draft',
  'orgmaster.management_method.manage_read_availability',
  'orgmaster.management_method.manage_metadata',
] as const

export const DEVELOPMENT_AUTH_PROFILES: readonly DevelopmentAuthProfile[] = [
  {
    id: 'administrator', roleCode: 'orgmaster_admin', roleName: 'OrgMaster 管理者',
    employeeId: 'employee-shijie', employeeName: '張仕杰', description: '全部治理與管理辦法權限',
    subject: DEV_SUBJECT, principalId: DEV_PRINCIPAL_ID, bootstrap: true,
    permissionCodes: [
      'orgmaster.governance.manage', 'orgmaster.governance.publish', 'orgmaster.governance.simulate',
      'orgmaster.identity.view', 'orgmaster.identity.invite', 'orgmaster.identity.link', 'orgmaster.identity.invitation.manage',
      ...MANAGEMENT_METHOD_PERMISSIONS,
    ],
  },
  {
    id: 'governance-manager', roleCode: 'orgmaster_governance_manager', roleName: '人員治理者',
    employeeId: 'employee-youhao', employeeName: '張祐豪', description: '管理身分與角色；不可發布治理政策',
    subject: 'local-governance-manager', principalId: 'dev-principal-governance-manager', bootstrap: false,
    permissionCodes: ['orgmaster.governance.manage', 'orgmaster.governance.simulate', 'orgmaster.identity.view', 'orgmaster.identity.invite', 'orgmaster.identity.link', 'orgmaster.identity.invitation.manage', 'orgmaster.management_method.read_readable'],
  },
  {
    id: 'method-manager', roleCode: 'orgmaster_method_manager', roleName: '管理辦法維護者',
    employeeId: 'employee-chenghan', employeeName: '張成漢', description: '建立、編輯及提供管理辦法',
    subject: 'local-method-manager', principalId: 'dev-principal-method-manager', bootstrap: false,
    permissionCodes: MANAGEMENT_METHOD_PERMISSIONS,
  },
  {
    id: 'employee', roleCode: 'orgmaster_employee', roleName: '一般員工',
    employeeId: '37e8e57e-a0d1-4280-b815-d209aa629380', employeeName: '游世賢', description: '僅閱讀已提供的管理辦法',
    subject: 'local-employee', principalId: 'dev-principal-employee', bootstrap: false,
    permissionCodes: ['orgmaster.management_method.read_readable'],
  },
]

export function developmentProfileById(id: unknown) {
  return typeof id === 'string' ? DEVELOPMENT_AUTH_PROFILES.find((profile) => profile.id === id) ?? null : null
}

export function publicDevelopmentProfiles(): PublicDevelopmentAuthProfile[] {
  return DEVELOPMENT_AUTH_PROFILES.map(({ id, roleCode, roleName, employeeId, employeeName, description }) => ({ id, roleCode, roleName, employeeId, employeeName, description }))
}

function cookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try { return decodeURIComponent(part.slice(separator + 1).trim()) } catch { return null }
  }
  return null
}

export function developmentProfileCookie(profileId: DevelopmentAuthProfile['id']) {
  return `${DEVELOPMENT_PROFILE_COOKIE}=${encodeURIComponent(profileId)}; Max-Age=28800; Path=/; HttpOnly; SameSite=Strict`
}

export function clearDevelopmentProfileCookie() {
  return `${DEVELOPMENT_PROFILE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`
}

export function isLoopback(request: IncomingMessage) {
  const address = request.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function resolveDevelopmentProfile(request: IncomingMessage, enabled: boolean) {
  if (!enabled || !isLoopback(request)) return null
  return developmentProfileById(cookieValue(request.headers.cookie, DEVELOPMENT_PROFILE_COOKIE))
}

export function resolveDevelopmentIdentity(request: IncomingMessage, enabled: boolean): GovernanceActorContext | null {
  if (!enabled || !isLoopback(request)) return null
  const profile = resolveDevelopmentProfile(request, enabled)
  if (profile) return { principalId: profile.principalId, issuer: DEV_ISSUER, subject: profile.subject, employeeId: profile.employeeId, bootstrap: profile.bootstrap }
  const issuer = request.headers['x-orgmaster-dev-issuer']
  const subject = request.headers['x-orgmaster-dev-subject']
  if (issuer !== DEV_ISSUER || subject !== DEV_SUBJECT) return null
  return { principalId: DEV_PRINCIPAL_ID, issuer: DEV_ISSUER, subject: DEV_SUBJECT, employeeId: null, bootstrap: true }
}

export function developmentPermissionForActor(actor: GovernanceActorContext, permissionCode: string): boolean | null {
  if (actor.issuer !== DEV_ISSUER) return null
  const profile = DEVELOPMENT_AUTH_PROFILES.find((candidate) => candidate.subject === actor.subject && candidate.principalId === actor.principalId)
  return profile ? profile.permissionCodes.includes(permissionCode) : null
}
