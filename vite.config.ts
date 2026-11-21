import { projedExternalApiPlugin } from './server/orgmasterProjedExternalApi'
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
import { orgmasterProjedPrincipalApiPlugin } from './server/orgmasterProjedPrincipalApi'

let managedLoginRuntime: ReturnType<typeof createOrgmasterAuthRuntime> | undefined
const runtime=()=>managedLoginRuntime??=createOrgmasterAuthRuntime()

const sandboxCache = process.env.JENFU_LOCAL_SANDBOX_ENABLED === '1'
  ? process.env.ORGMASTER_VITE_CACHE_DIR : undefined
if (sandboxCache !== undefined && !/^\.codex-tmp\/vite-[a-z0-9-]+-(?:integrated|standalone)$/u.test(sandboxCache)) {
  throw new Error('Expected a local Vite cache under .codex-tmp for the selected sandbox mode.')
}

export default defineConfig({
  cacheDir: sandboxCache ?? '.codex-tmp/vite',
  plugins: [orgmasterManagedLoginApiPlugin(() => {
    const value=runtime();return { service:value.managedLoginOwner,verifier:value.managedLoginCallerVerifier }
  }), orgmasterProjedPrincipalApiPlugin(() => {
    const value=runtime();return {service:value.projedPrincipalOwner,verifier:value.managedLoginCallerVerifier}
  }), projedExternalApiPlugin('internal', runtime), orgmasterAuthApiPlugin(runtime), projedExternalApiPlugin('management', runtime), orgmasterManagedIdentityApiPlugin(() => runtime().managedIdentity), workbenchPreferenceApiPlugin(), orgmasterAccountEnrollmentApiPlugin(), react(), orgmasterApiPlugin(), orgmasterGovernanceApiPlugin({ accountEnrollmentEnabled: true,runtime }), orgmasterManagementMethodApiPlugin()],
})
