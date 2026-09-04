import { describe, expect, it, vi } from 'vitest'

import { resolveOrgmasterDatabaseConfig } from './orgmasterDatabase'
import { createAuthEpochRepository } from './orgmasterAuthEpochRepository'
import { createPrincipalAdmissionRepository } from './orgmasterPrincipalAdmissionRepository'
import { dispatchEntitlementInvalidations } from './orgmasterEntitlementInvalidationDispatcher'

describe('DEV-010 N2 OrgMaster database boundary', () => {
  it('uses one six-connection pool and server-first timeout ordering', () => {
    expect(resolveOrgmasterDatabaseConfig({}).max).toBe(6)
    expect(resolveOrgmasterDatabaseConfig({}).queryTimeoutMillis).toBeGreaterThan(resolveOrgmasterDatabaseConfig({}).statementTimeoutMillis)
    expect(() => resolveOrgmasterDatabaseConfig({ ORGMASTER_POSTGRES_POOL_MAX: '0' })).toThrow('DEV010_N2_ORGMASTER_POOL_MAX_INVALID')
  })

  it('routes identity, auth epoch and invalidation through producer contracts', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('read_principal_auth_epoch')) return { rows: [{ auth_epoch: 2 }], rowCount: 1 }
      if (sql.includes('v_active_principal')) return { rows: [{ contract_version: 'organization.active-principal.v1', principal_issuer: 'issuer', principal_subject: 'subject', principal_id: 'principal', employee_id: 'employee', employee_status: 'active', mapping_version: 1, published_at: '2026-09-03T00:00:00.000Z' }], rowCount: 1 }
      if (sql.includes('claim_entitlement')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 0 }
    })
    const database = { query, end: vi.fn() }
    await createAuthEpochRepository(database).read('issuer', 'subject')
    await createPrincipalAdmissionRepository(database).resolveActivePrincipal('issuer', 'subject')
    await dispatchEntitlementInvalidations(database, { workerId: 'worker-1' })
    const sql = query.mock.calls.map(([text]) => text).join('\n')
    expect(sql).toContain('platform_contract.read_principal_auth_epoch_v1')
    expect(sql).toContain('orgmaster_contract.v_active_principal_mappings_v1')
    expect(sql).toContain('orgmaster_contract.claim_entitlement_change_outbox_v1')
  })
})
