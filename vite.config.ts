import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { orgmasterApiPlugin } from './server/orgmasterApi'
import { orgmasterGovernanceApiPlugin } from './server/orgmasterGovernanceApi'
import { orgmasterManagementMethodApiPlugin } from './server/managementMethodApi'

export default defineConfig({
  plugins: [react(), orgmasterApiPlugin(), orgmasterGovernanceApiPlugin(), orgmasterManagementMethodApiPlugin()],
})
