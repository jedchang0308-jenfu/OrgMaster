# DEV-013 OrgMaster managed staging IaC

This root owns only the OrgMaster non-production state prefix, Artifact Registry repository, evidence bucket, exact IAM members, and `orgmaster-stg` Cloud Run service.

The source-frozen package uses two plans in the same state:

1. `OWNER_INFRA_A` sets `runtime_enabled=false` and creates only the repository/evidence boundary.
2. Build the exact committed tree with the source-freeze receipt's root `Dockerfile` SHA and exact `SOURCE_REVISION`, `SOURCE_TREE`, `SOURCE_CREATED_AT`, `SOURCE_VERSION`, and `SOURCE_STATE` arguments; push to the new repository and record the provider digest.
3. `OWNER_RUNTIME_B` sets `runtime_enabled=true` and requires that immutable digest plus the numeric existing Secret version.

Both saved plans must pass `npm run verify:dev-013:l3:plan`. Apply, image build/push, deploy, migration, and traffic changes are intentionally not performed by the local package checks.

`ORGMASTER_PUBLIC_BASE_URL` and `ORGMASTER_JENFU_SSO_BROKER_ORIGIN` use the Cloud Run v2 project-number URL template from the frozen Platform manifest. The post-apply owner receipt must hard-join both values to provider service URI readback before L3 browser work.
