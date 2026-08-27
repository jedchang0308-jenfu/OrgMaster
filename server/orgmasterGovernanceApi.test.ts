import { describe, expect, it } from 'vitest'
import { governanceErrorStatus, orgmasterGovernanceApiPlugin } from './orgmasterGovernanceApi'
import { DEV_ISSUER, DEV_SUBJECT, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
describe('governance API boundary', () => { it('registers the plugin and accepts only the fixed loopback dev identity', () => { expect(orgmasterGovernanceApiPlugin().name).toBe('orgmaster-local-governance-api'); const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-orgmaster-dev-issuer': DEV_ISSUER, 'x-orgmaster-dev-subject': DEV_SUBJECT } } as any; expect(resolveDevelopmentIdentity(request, true)?.principalId).toBe('dev-principal-local-admin'); expect(resolveDevelopmentIdentity(request, false)).toBeNull() }) })

describe('governance API failure mapping', () => {
  it.each([
    ['PUBLISHER_NOT_LINKED', 422],
    ['GOVERNANCE_ADMIN_CONTINUITY_REQUIRED', 422],
    ['ORGANIZATION_VERSION_INVALID', 409],
    ['GOVERNANCE_PUBLISH_REQUIRED', 403],
  ])('maps %s to a recoverable HTTP status', (code, status) => expect(governanceErrorStatus(code)).toBe(status))
})
