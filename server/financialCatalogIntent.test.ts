import { describe, expect, it } from 'vitest'
import { readFinancialCatalogHandoffSource, readFinancialCatalogPeerOrigin } from './financialCatalogIntent'

describe('server-owned catalog peer deployment defaults', () => {
  it('uses the fixed FMS formal peer only in the actual production OrgMaster service', () => {
    const env = { NODE_ENV: 'production', K_SERVICE: 'orgmaster-prod' }
    expect(readFinancialCatalogHandoffSource(env)).toBe('formal')
    expect(readFinancialCatalogPeerOrigin(env)).toBe('https://jf-fms-prod-56gnizku7q-de.a.run.app')
  })
  it.each([{ NODE_ENV: 'development', K_SERVICE: 'orgmaster-prod' }, { NODE_ENV: 'production', K_SERVICE: 'other-app' }, {}])('does not infer a formal target elsewhere: %j', env => {
    expect(readFinancialCatalogHandoffSource(env)).toBeUndefined()
    expect(readFinancialCatalogPeerOrigin(env)).toBeNull()
  })
  it('refuses a local or invalid explicit override instead of falling back in production', () => {
    const env = { NODE_ENV: 'production', K_SERVICE: 'orgmaster-prod' }
    expect(readFinancialCatalogPeerOrigin({ ...env, ORGMASTER_FMS_PUBLIC_ORIGIN: 'http://localhost:1030' })).toBeNull()
    expect(readFinancialCatalogPeerOrigin({ ...env, ORGMASTER_FMS_GOVERNANCE_SOURCE: 'local_test' })).toBeNull()
  })
  it('keeps explicitly configured local sandbox targets in the local realm', () => {
    const env = { NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1', ORGMASTER_FMS_PUBLIC_ORIGIN: 'http://localhost:1030' }
    expect(readFinancialCatalogHandoffSource(env)).toBe('local_test')
    expect(readFinancialCatalogPeerOrigin(env)).toBe('http://localhost:1030')
  })
})
