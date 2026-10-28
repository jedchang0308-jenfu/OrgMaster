# OrgMaster shared-database migrations

This directory owns the OrgMaster portion of the DEV-010 shared PostgreSQL database.

## Boundary

- Owned schemas: `orgmaster_core`, `orgmaster_contract`.
- Other applications' `*_core` schemas are private.
- Cross-application access uses versioned `*_contract` objects only.
- Applied migration files are immutable; corrections use a new forward migration.
- Application-owned objects must not be created in `public`.
- Runtime identities never receive owner, DDL, or migrator privileges.

## New migration header

Start every migration after `010` with this searchable header:

```sql
-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core
-- contract-impact: none
-- compatibility: backward-compatible
```

List both owned schemas when needed. For a contract change, replace `none` with the versioned contract identifier and use `additive` or `new-version`. A destructive contract retirement additionally requires `-- governance-review: DEV-NNN` or `ADR-NNN`.

Run the lightweight check before completing the change:

```powershell
npm run check:db-boundary
```

The default check validates future migration files and staged migration changes. CI can compare committed changes with `npm run check:db-boundary -- --base=<base-ref>`.

Migration 020 is the DEV-055 bounded correction for current projections. It may replace only the three existing `orgmaster_contract` read-only views named in the DEV-055 spec; the historical `access_governance` compatibility layer remains immutable.

Migration 024 is the DEV-057 principal-first producer change. It owns the permanent principal/alias history, authority v2 command and readback, and the typed account admission used by effective AI-PDM grants and Portal visibility. Migrations 001–023 remain immutable; owner release packages must use the 024 source and applied hashes from the controlled profile.

Migration 025 publishes `orgmaster_contract.v_ai_pdm_principal_effective_grants_v2` and its source-controlled contract manifest. The new view computes effective grants once per uniquely admitted `principal_id` and does not expose provider issuer or subject. It retains 024's grant policy while v1 consumers migrate; v1 retirement requires a later forward-only cleanup after consumer and recovery readback. The owner release profile binds exact 001–025 source and applied hashes.

Migration 026 corrects the published-policy path used by the v2 OrgMaster session principal view without editing migration 022. Migration 027 publishes the exact principal cutover-source manifest and grants only `jenfu_ai_pdm_migrator` SELECT on the existing versioned manifest view. It does not change identity, assignment, authority, or session data; the controlled owner release accepts only the 026-to-027 append.

Migration 028 is a local DEV-057 candidate for `orgmaster_contract.v_ai_pdm_principal_effective_grants_v3`. It retains the published governance, typed account, ownership, scope, delegation and validity fences of v2 while removing the per-employee `v_ai_pdm_entitlement_authority_v1` join and `authority_version` output. It creates a new versioned manifest row and leaves v2 and all historical authority data intact. Disposable PostgreSQL producer QC passes; the AI-PDM consumer, exact owner release profile and Production readback are still pending, so 028 is not yet an executable Production release package.

Migration 042 is a source-only DEV-057 forward grant for the Platform-owned SECURITY DEFINER ProJED state reader. It grants the existing `jenfu_platform_migrator` SELECT on `orgmaster_contract.v_projed_principal_admissions_v1`; it grants no direct core or runtime access and adds no workload identity, IAM binding, or business permission. It has not been applied to a persistent environment or included in a formal release package.

## DEV-057 ProJED principal append — source candidate only

The protected release profile before this candidate contains 38 entries: migrations 001–031 and 034–040. It intentionally excludes 032／033. Some local full-baseline fixtures do include 032／033; those fixtures are not the formal profile. The candidate keeps the first 38 entries and hashes unchanged, then appends existing SQL migrations 041 and 042 at entries 39 and 40. Neither migration SQL file was changed for this release-preparation source.

The append mode is `DEV057_PROJED_PRINCIPAL_APPEND`, selected with `--dev057-projed-principal-append --dev057-infra-ref=ownImmutableRef`. The ordinary owner path remains `UNCHANGED_VERIFIED`. For the exact 40-entry bundle, an exact 38-row ledger applies only 041／042, 39 rows applies only 042, and 40 rows replays. The runner recognizes only existing counts 38, 39 and 40 and rejects 41, unknown versions, checksum changes and non-prefix ledgers before migration writes. The candidate receipt is owner-DB／source-revision／manifest bound, allows applied=0–2 with two pending migrations, and retains both `jenfu_dev` and `jenfu_stg` connection-denial probes.

The local evidence remains separated by its original runner reports: existing R2 `439/439`; migration-module `4`, profile `22`, runner `11`, owner-stage `26`, and tool-focus `2` are separate result counts and are not added into a new total. The initial `132/134` failure is retained; its two failures were older DEV-059 fixtures using the new 40-entry profile. They now use the historical 38-entry slice, and the focused correction passed `5/5` without rewriting the first result. The existing 18 OrgMaster checks, six ProJED source-flow cases and five legacy Platform login cases remain bound to their original bundle/source hashes because 041／042 SQL did not change.

The source recipe and Docker `COPY` inputs are prepared, but the immutable migration-tool image has not been built. PR187 CI `40746503064` passed for package commit `617eddfec37d81908ae084f0463905d851fcc249`. The later pre-write bound to ledger 38/39/40 has targeted runner/module/profile/owner-stage PASS; its latest CI is still required. No formal tool execution, persistent DDL, Cloud operation, IAM／Secret change or traffic change has occurred. This documentation does not add a required gate or mark the release package deployed.

The current 40-entry runner accepts only ledger counts 38, 39 and 40: two authorized appends, partial-attempt recovery, or exact replay. Counts 31-37 now require their own earlier source-bound release instead of executing extra migrations under this two-append recipe. Unknown/older ledgers fail before DDL; historical source and receipts are not rewritten.
