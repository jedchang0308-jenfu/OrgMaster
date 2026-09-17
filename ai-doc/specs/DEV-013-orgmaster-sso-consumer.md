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

## 013-S4-L3-ORGMASTER-ENV owner package

Local tracking ID: `DEV-048`（the repository-native `DEV-013` is an older UI task; this alias prevents identifier collision without changing the Platform task ID）.

Status: `READY_FOR_NONPROD_APPLY / releaseAuthority=false`. No Terraform apply, Cloud Run deploy, migration, candidate creation, activation, rollback, or traffic mutation has been run by this slice. This status does not mean L3, production, or DEV-013 is complete.

The applyable profile is `config/dev-013/l3-orgmaster-staging.json`; the Terraform root is `infra/google-cloud/dev-013-l3-orgmaster`. Both lock the Platform machine-readable manifest SHA-256 `7538ab12e02566eb9de107c592d6cbb43045f4a00bc94a969a84eae8a424d96c` and canonical contract aggregate SHA-256 `e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483`. Any drift is a hard stop.

The package uses one app-owned state prefix, `dev-013/orgmaster-staging`, and two exact same-state stages:

1. `OWNER_INFRA_A` creates only the OrgMaster Artifact Registry repository, evidence bucket, and their exact owner/QC IAM bindings.
2. After the frozen source is built and provider-read back as an immutable digest, `OWNER_RUNTIME_B` adds the existing runtime identity readbacks, Firebase viewer binding, and `orgmaster-stg` Cloud Run service.

The runtime target is exactly `jenfu-platform-nonprod / asia-east1 / orgmaster-stg / jenfu_stg`, attached to `dev010-stg-orgmaster-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com`. It has `min_instance_count=0`, deletion protection, a pinned Cloud SQL Auth Proxy sidecar on the exact private connection, IAM database authentication, and no owner／DDL／migrator identity or migration job. `ORGMASTER_JENFU_SSO_HANDOFF_MODE=off`; the broker origin and public base URL are derived from provider readback inputs and are rejected if they are placeholders, custom domains, legacy origins, or not the exact `run.app` authorities allowed by the Platform manifest.

Candidate／activate／rollback planning is owner-native and read-only by default. Every plan is constrained to the OrgMaster service, revision, runtime environment, and traffic. Activation retains auth-state v2 and the original-auth-time guard; rollback cannot target an image below the first DEV-013 security-floor digest.

Owner commands:

- `npm run freeze:dev-013:l3 -- --stage OWNER_INFRA_A|OWNER_RUNTIME_B ...`
- `npm run verify:dev-013:l3:plan -- --stage OWNER_INFRA_A|OWNER_RUNTIME_B ...`
- `npm run receipt:dev-013:l3:owner -- ...`
- `npm run release:dev-013:l3 -- --operation candidate|activate|rollback ...`（read-only plan unless a future separately authorized run passes `--execute`）
- `npm run test:dev-013:l3`

Required Secret Manager object: `dev010-stg-orgmaster-runtime-config`, consumed only through a numeric version as `ORGMASTER_SESSION_HASH_PEPPER`; no secret value belongs in source, Terraform variables, plans, receipts, or logs.
