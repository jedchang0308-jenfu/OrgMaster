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
