import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { orgmasterApiPlugin } from './server/orgmasterApi'
import { orgmasterGovernanceApiPlugin } from './server/orgmasterGovernanceApi'
import { orgmasterManagementMethodApiPlugin } from './server/managementMethodApi'
import { orgmasterAuthApiPlugin } from './server/orgmasterAuthApi'

export default defineConfig({
  plugins: [orgmasterAuthApiPlugin(), react(), orgmasterApiPlugin(), orgmasterGovernanceApiPlugin(), orgmasterManagementMethodApiPlugin()],
})
