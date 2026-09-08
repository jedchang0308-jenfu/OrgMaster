# DEV-040 R2 OrgMaster-owned production release infrastructure

This state owns only OrgMaster release tooling. It reads the existing `orgmaster-prod` service and `orgmaster-prod-runtime` identity. It must not own the application service lifecycle, Cloud SQL, DNS, Hosting, runtime Secrets, sibling applications, or shared-foundation resources.

`APP_INFRA_A` plans exactly the `stageA` addresses in `config/release/dev040-production-release-infra-plan.json` with `incident_runtime_enabled=false`. After the owner builder publishes the immutable controller digest, `APP_INFRA_B` uses the same state and complete address set with `incident_runtime_enabled=true`. Existing A resources must remain read/no-op.

The backend prefix is `dev-040-r2/production-release/default.tfstate`. Backend bucket, numeric GitHub IDs, workflow SHA, notification destination, and controller digest are S2 controlled inputs and must not be committed with live values.
