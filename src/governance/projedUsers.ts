export const PROJED_USERS_VERSION = 'orgmaster.projed-users.v1' as const

export type ProjedUserRecord = {
  googleSubject: string
  accountId: string | null
  principalId: string | null
  email: string | null
  displayName: string | null
  kind: 'personal' | 'external'
  enabled: boolean
  revision: string
  identityStatus: 'UNREGISTERED' | 'ACTIVE' | 'INACTIVE'
  loginEligible: boolean
  externalStatus: 'NONE' | 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED' | 'WITHDRAWN'
}

export type ProjedUsersSnapshot = {
  contractVersion: typeof PROJED_USERS_VERSION
  users: ProjedUserRecord[]
}

export type ProjedUserCommand = {
  commandId: string
  googleSubject: string
  expectedRevision: string
  action: 'disable' | 'restore'
}
