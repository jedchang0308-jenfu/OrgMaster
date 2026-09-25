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
