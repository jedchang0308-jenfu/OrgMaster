import { describe, expect, it } from 'vitest'
import { managementMethodPermissionCodes, actorFromRequest } from './managementMethodAuthorization'
import { DEV_ISSUER, DEV_SUBJECT } from './orgmasterGovernanceIdentity'

describe('management method authorization mapping', () => {
  it('uses the six DEV-027 orgmaster permissions', () => {
    expect(Object.values(managementMethodPermissionCodes)).toEqual(expect.arrayContaining([
      'orgmaster.management_method.create',
      'orgmaster.management_method.read_readable',
      'orgmaster.management_method.read_draft',
      'orgmaster.management_method.edit_draft',
      'orgmaster.management_method.manage_read_availability',
      'orgmaster.management_method.manage_metadata',
    ]))
    expect(Object.keys(managementMethodPermissionCodes)).toHaveLength(6)
  })

  it('keeps the loopback development identity as the bootstrap actor', () => {
    const request = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-orgmaster-dev-issuer': DEV_ISSUER, 'x-orgmaster-dev-subject': DEV_SUBJECT },
    } as any
    expect(actorFromRequest(request, true)).toMatchObject({ principalId: 'dev-principal-local-admin', bootstrap: true })
  })
})
