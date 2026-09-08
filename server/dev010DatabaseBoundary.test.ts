import { describe, expect, it, vi } from 'vitest'

import { assertOrgmasterProductionTarget, resolveOrgmasterDatabaseConfig } from './orgmasterDatabase'
import { createAuthEpochRepository } from './orgmasterAuthEpochRepository'
import { createPrincipalAdmissionRepository } from './orgmasterPrincipalAdmissionRepository'
import { dispatchEntitlementInvalidations } from './orgmasterEntitlementInvalidationDispatcher'

describe('DEV-010 N2 OrgMaster database boundary', () => {
  it('uses one six-connection pool and server-first timeout ordering', () => {
    expect(resolveOrgmasterDatabaseConfig({}).max).toBe(6)
    expect(resolveOrgmasterDatabaseConfig({}).queryTimeoutMillis).toBeGreaterThan(resolveOrgmasterDatabaseConfig({}).statementTimeoutMillis)
    expect(() => resolveOrgmasterDatabaseConfig({ ORGMASTER_POSTGRES_POOL_MAX: '0' })).toThrow('DEV010_N2_ORGMASTER_POOL_MAX_INVALID')
  })

  it('fails closed unless the full production runtime target matches', () => {
    const target = {
      ORGMASTER_DEPLOYMENT_ENV: 'production',
      GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
      GOOGLE_CLOUD_REGION: 'asia-east1',
      ORGMASTER_CLOUD_SQL_INSTANCE: 'jenfu-platform-prod-pg',
      ORGMASTER_CLOUD_SQL_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
      ORGMASTER_POSTGRES_DATABASE: 'jenfu_prod',
      ORGMASTER_POSTGRES_IAM_LOGIN: 'orgmaster-prod-runtime@jenfu-platform-prod.iam',
    }
    expect(assertOrgmasterProductionTarget(target)).toMatchObject({ environment: 'production', database: 'jenfu_prod' })
    expect(() => assertOrgmasterProductionTarget({ ...target, ORGMASTER_POSTGRES_DATABASE: 'jenfu_stg' })).toThrow('DEV040_R2_ORGMASTER_WRONG_PRODUCTION_TARGET')
    expect(() => assertOrgmasterProductionTarget({ ...target, ORGMASTER_POSTGRES_IAM_LOGIN: 'orgmaster-prod-migrator@jenfu-platform-prod.iam' })).toThrow('DEV040_R2_ORGMASTER_WRONG_PRODUCTION_TARGET')
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
