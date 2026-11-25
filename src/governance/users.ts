import type { ProjedUserRecord } from './projedUsers'
export const USERS_VERSION = 'orgmaster.users.v1' as const
export const USER_SYSTEMS = [
  { id: 'orgmaster', name: 'OrgMaster' }, { id: 'ai-pdm', name: 'AI-PDM' },
  { id: 'financial-management-system', name: 'JF-FMS' }, { id: 'projed', name: 'ProJED' },
] as const
export type UserSystemId = typeof USER_SYSTEMS[number]['id']
export type UserSystem = { applicationId: UserSystemId; status: 'ELIGIBLE' | 'INELIGIBLE' | 'DISABLED'; projed?: ProjedUserRecord }
export type DirectoryUser = { id: string; principalId: string | null; displayName: string | null; email: string | null; kind: 'employee' | 'nonemployee'; systems: UserSystem[] }
export type UsersSnapshot = { contractVersion: typeof USERS_VERSION; systems: Array<{ applicationId: UserSystemId; state: 'READY' | 'UNAVAILABLE' }>; users: DirectoryUser[] }
export const userSystemName = (id: UserSystemId) => USER_SYSTEMS.find(row => row.id === id)!.name
export const directoryUserLabel = (row: DirectoryUser) => row.displayName || row.email || row.principalId || row.id
export const userStatusLabel = (value: UserSystem['status']) => value === 'ELIGIBLE' ? '具登入資格' : value === 'DISABLED' ? '已停用' : '不具登入資格'
