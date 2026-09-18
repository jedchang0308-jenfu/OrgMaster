import { describe, expect, it, vi } from 'vitest'
import { createPostgresManagedIdentityRepository } from './orgmasterManagedIdentityRepository'

function identityRow(overrides: Record<string, unknown> = {}) {
  return {
    employee_id: 'employee-1', principal_id: 'principal-1', employee_number: 'JFS0001',
    directory_customer_id: 'customer-1', directory_user_id: 'google-1', identity_record_id: '00000000-0000-4000-8000-000000000001',
    identity_revision: '1', registry_revision: '2', link_state: 'directory_linked_pending_auth', auth_issuer: null, auth_subject: null,
    snapshot_primary_email: 'person@jenfu.com.tw', employee_status: 'active', admission_enabled: true,
    ...overrides,
  }
}

describe('PostgreSQL managed login snapshot', () => {
  it('uses one SQL statement and keeps the stored Email beside the identity DTO', async () => {
    const query = vi.fn(async () => ({ rows: [identityRow()] }))
    const repository = createPostgresManagedIdentityRepository({ query, end: vi.fn() })
    const snapshot = await repository.readManagedLoginSnapshot('customer-1', 'google-1')
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toContain('WITH login AS MATERIALIZED')
    expect(query.mock.calls[0][0]).toContain('read_employee_managed_identity_v1')
    expect(snapshot).toMatchObject({ primaryEmail: 'person@jenfu.com.tw', identity: { employeeId: 'employee-1', identityRecordId: '00000000-0000-4000-8000-000000000001' } })
  })

  it('fails closed when the joined employee snapshot is ambiguous or malformed', async () => {
    const query = vi.fn(async () => ({ rows: [identityRow(), identityRow({ identity_record_id: '00000000-0000-4000-8000-000000000002' })] }))
    const repository = createPostgresManagedIdentityRepository({ query, end: vi.fn() })
    await expect(repository.readManagedLoginSnapshot('customer-1', 'google-1')).rejects.toThrow('MANAGED_LOGIN_READ_FAILED')
  })
})
