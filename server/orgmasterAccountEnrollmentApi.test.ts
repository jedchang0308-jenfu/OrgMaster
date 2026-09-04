import { describe, expect, it } from 'vitest'
import { createOrgmasterAccountEnrollmentRuntime, orgmasterAccountEnrollmentApiPlugin } from './orgmasterAccountEnrollmentApi'

describe('account enrollment api composition', () => {
  it('creates one runtime with startup readiness and plugin registration', async () => { const runtime = createOrgmasterAccountEnrollmentRuntime({ root: process.cwd(), devEnabled: false }); await expect(runtime.startupRecovery).resolves.toMatchObject({ status: 'ready' }); expect(typeof runtime.middleware).toBe('function'); expect(orgmasterAccountEnrollmentApiPlugin({ runtime }).name).toBe('orgmaster-account-enrollment-api') })
})
