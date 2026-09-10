## Shared database boundary — DEV010_DB_RULESET_V1

- DEV-010 shared PostgreSQL DDL must be delivered as a forward-only migration under `db/migrations`; never edit the shared managed database by hand.
- This repository may create or alter only `orgmaster_core` and `orgmaster_contract`. Never reference another application's `*_core` schema.
- Cross-application access must use a versioned `*_contract` object. A breaking contract change requires a new version and a compatibility window.
- Never modify or delete an applied migration. Correct it with a new migration.
- Do not create application-owned objects in `public`.
- Runtime identities must never receive owner, DDL, or migrator privileges.
- Before completing a database change, run `npm run check:db-boundary`.
- If schema ownership or contract impact is unclear, stop and record the decision in the relevant DEV or ADR before changing SQL.

## OrgMaster continuous production release — DEV040_R2_RELEASE_V3_DIRECT_RUN_APP

- OrgMaster owns only `orgmaster-prod`, `orgmaster_core`, `orgmaster_contract`, its app-specific release bucket/repository/state, entry policy, and release identities. It must not deploy or read sibling source, mutate sibling traffic, own shared foundation state, or create Cloud SQL, DNS, Hosting, or sibling Secret resources. Its V3 authority is bound to Platform DEV-012 section 29 and OrgMaster DEV-040 section 30; local S1C passes but it is not deployed.
- Production release uses one immutable `releaseCapsuleRef`, service-wide concurrency `production-release-orgmaster-prod`, and exact ten-stage flow `prepare -> build -> migrate -> candidate -> entrypoint -> verify -> decision -> activate -> canonical -> finalize`. The app-owned `entrypoint` stage may patch only `ingress,defaultUriDisabled,invokerIamDisabled` with fresh etag and zero template/traffic drift. Recovery is own traffic rollback, tag cleanup, then entry-baseline restore. No in-run human acknowledgement or fixed dwell is allowed; local evidence has `releaseAuthority=false`.
- The production canonical entry is the provider-verified `orgmaster-prod` Cloud Run `run.app` default URL. Candidate origin is one exact full origin injected into the revision; wildcard and legacy hash-host matching are forbidden. Do not use `org.jenfu.com.tw`, Firebase Hosting, or the shared Load Balancer as current serving. Existing edge assets are `RETAINED_UNUSED_EDGE`; do not delete or unlink Billing in this DEV.
- The production database target is exactly `jenfu-platform-prod / asia-east1 / jenfu-platform-prod-pg / jenfu_prod`. Runtime and migrator IAM DB logins are distinct. The staging N1C profile remains staging-only and must never be reused as production authority.
- DEV-040 R2 verifies the exact transformed N1C 001–010 ledger before applying only forward migration `011_dev046_workbench_list_width_preferences.sql`; missing or changed historical ledger rows fail closed. Account enrollment and external side effects stay disabled unless a separate production authorization receipt exists.
- Before accepting a release change, run `npm run test:dev-040:r2`, `npm run qc:dev-040:r2`, `npm run test:dev-040:abort`, `npm run check:db-boundary`, `npm test -- --testTimeout=30000`, and `npm run build`.
- Automated SBOM export may list bucket metadata and attach Container Analysis occurrences, but object authority must be conditioned to the encoded `orgmaster-release` prefix in the existing regional Artifact Analysis bucket; never grant project-wide Storage Admin/Object Admin or a sibling prefix. Migration overrides require `roles/run.jobsExecutorWithOverrides` only on `orgmaster-prod-migration-runner` for `orgmaster-prod-deployer`; preserve the older exact-job `roles/run.invoker` as a non-broadening additive compatibility binding so Terraform plans remain create/no-op/read.
