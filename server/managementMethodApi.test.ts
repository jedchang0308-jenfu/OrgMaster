import { describe, expect, it } from 'vitest'
import { mapManagementMethodError, MANAGEMENT_METHOD_API_PATH } from './managementMethodApi'
import { ManagementMethodStoreError } from './managementMethodStore'

describe('management method API boundary', () => {
  it('keeps the fixed base path and maps negative responses without leaking stacks', () => {
    expect(MANAGEMENT_METHOD_API_PATH).toBe('/api/orgmaster/management-methods')
    expect(mapManagementMethodError(new ManagementMethodStoreError('DRAFT_REVISION_CONFLICT'))).toEqual({ status: 409, code: 'DRAFT_REVISION_CONFLICT' })
    expect(mapManagementMethodError(new Error('internal'))).toEqual({ status: 500, code: 'MANAGEMENT_METHOD_WRITE_FAILED' })
  })
})
