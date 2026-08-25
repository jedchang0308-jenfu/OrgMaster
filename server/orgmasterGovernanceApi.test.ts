import { describe, expect, it } from 'vitest'
import { orgmasterGovernanceApiPlugin } from './orgmasterGovernanceApi'
import { DEV_ISSUER, DEV_SUBJECT, resolveDevelopmentIdentity } from './orgmasterGovernanceIdentity'
describe('governance API boundary', () => { it('registers the plugin and accepts only the fixed loopback dev identity', () => { expect(orgmasterGovernanceApiPlugin().name).toBe('orgmaster-local-governance-api'); const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-orgmaster-dev-issuer': DEV_ISSUER, 'x-orgmaster-dev-subject': DEV_SUBJECT } } as any; expect(resolveDevelopmentIdentity(request, true)?.principalId).toBe('dev-principal-local-admin'); expect(resolveDevelopmentIdentity(request, false)).toBeNull() }) })
