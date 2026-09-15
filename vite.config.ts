import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { orgmasterApiPlugin } from './server/orgmasterApi'
import { orgmasterGovernanceApiPlugin } from './server/orgmasterGovernanceApi'
import { orgmasterManagementMethodApiPlugin } from './server/managementMethodApi'
import { orgmasterAuthApiPlugin } from './server/orgmasterAuthApi'
import { orgmasterAccountEnrollmentApiPlugin } from './server/orgmasterAccountEnrollmentApi'
import { orgmasterManagedIdentityApiPlugin } from './server/orgmasterManagedIdentityApi'
import { workbenchPreferenceApiPlugin } from './server/workbenchPreferenceApi'

export default defineConfig({
  plugins: [orgmasterAuthApiPlugin(), orgmasterManagedIdentityApiPlugin(), workbenchPreferenceApiPlugin(), orgmasterAccountEnrollmentApiPlugin(), react(), orgmasterApiPlugin(), orgmasterGovernanceApiPlugin({ accountEnrollmentEnabled: true }), orgmasterManagementMethodApiPlugin()],
})
