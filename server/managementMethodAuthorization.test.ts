import { describe, expect, it } from 'vitest'
import { managementMethodPermissionCodes } from './managementMethodAuthorization'

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
})
