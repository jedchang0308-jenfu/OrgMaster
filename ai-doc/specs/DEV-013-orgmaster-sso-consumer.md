# DEV-013 OrgMaster consumer capsule

- Owner: OrgMaster
- Native task: DEV-013-S2
- Contract lock: `contracts/jenfu-sso-handoff/v1/contract-lock.json`
- Status: `Local implementation complete / mode off / release gated`

## Boundary

OrgMaster consumes Platform `jenfu.sso-handoff.v1` for the fixed `orgmaster` audience. It keeps the OrgMaster host-only session cookie, local account and permission checks, central auth epoch read, and local logout authority. It does not read Portal cookies, accept Firebase bearer tokens from another host, create shared session keys, or modify Platform or AI-PDM schemas.

## Implemented surface

- `server/orgmasterSsoHandoff.ts`: signed transaction cookie, exact callback／state／PKCE validation, attached service identity exchange, stale principal／epoch guard, account conflict handling, and local session creation.
- `server/orgmasterAuthApi.ts`／`orgmasterAuthEpochRepository.ts`: `authState v2` on direct Firebase exchange and every protected request; SSO mode discovery remains default-off.
- `src/auth/AuthGate.tsx`／`authApiClient.ts`: when the owner mode is enabled, show only the Platform login entry and preserve local／development modes otherwise.

## Runtime and release inputs

`ORGMASTER_JENFU_SSO_HANDOFF_MODE` is `off` by default. Enabling requires the exact Platform broker origin and provider-readback OrgMaster `run.app` callback in the owner release profile. The attached service account is obtained through Application Default Credentials; no service-account key is accepted. Rollback is `target off` after `launch → accept` drain, retaining the auth-state and original-auth-time guards.

## Verification entrypoints

`npm run test:dev-013`, `npm run check:db-boundary`, and `npm run build` are the owner-local checks. Local PASS does not close QA-013 or authorize managed non-production／production release.
