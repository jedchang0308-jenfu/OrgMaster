import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { orgmasterApiPlugin } from './server/orgmasterApi'
import { orgmasterGovernanceApiPlugin } from './server/orgmasterGovernanceApi'
import { orgmasterManagementMethodApiPlugin } from './server/managementMethodApi'
import { createOrgmasterAuthRuntime, orgmasterAuthApiPlugin } from './server/orgmasterAuthApi'
import { orgmasterAccountEnrollmentApiPlugin } from './server/orgmasterAccountEnrollmentApi'
import { orgmasterManagedIdentityApiPlugin } from './server/orgmasterManagedIdentityApi'
import { workbenchPreferenceApiPlugin } from './server/workbenchPreferenceApi'
import { orgmasterManagedLoginApiPlugin } from './server/orgmasterManagedLoginApi'

let managedLoginRuntime: ReturnType<typeof createOrgmasterAuthRuntime> | undefined

export default defineConfig({
  plugins: [orgmasterManagedLoginApiPlugin(() => {
    managedLoginRuntime ??= createOrgmasterAuthRuntime()
    return { service: managedLoginRuntime.managedLoginOwner, verifier: managedLoginRuntime.managedLoginCallerVerifier }
  }), orgmasterAuthApiPlugin(), orgmasterManagedIdentityApiPlugin(), workbenchPreferenceApiPlugin(), orgmasterAccountEnrollmentApiPlugin(), react(), orgmasterApiPlugin(), orgmasterGovernanceApiPlugin({ accountEnrollmentEnabled: true }), orgmasterManagementMethodApiPlugin()],
})
