# DEV-032 implementation evidence

Date: 2026-08-25
Scope: local RD implementation only; synthetic local data and explicit fake-AI development header. No production credential, company data upload, deployment or release.

## Automated verification

- `npm test -- --run` — 50 test files / 226 tests passed.
- `npm run build` — TypeScript check and Vite production build passed.
- Build emitted existing extensionless-import and bundle-size warnings only; no TypeScript or bundling error.

## Browser QC

Runtime: `npm run dev:local`, localhost port 5000, task-owned runtime. The runtime is stopped after handoff.

| Surface | Viewport | Result |
|---|---:|---|
| Management method list | 1440×900 | No console error/warning; MP-0001 listed; desktop create entry visible. |
| Management method list | 1024×768 | No console error/warning; create entry remains available at the minimum desktop mutation boundary; no horizontal overflow. |
| Create dialog | 1440×900 | Single input surface for title, goal, facts, target rules and existing content; no interview or pending-confirmation controls. |
| Draft document | 1440×900 | Single `編輯文件` entry; Tiptap editor, metadata, autosave/save/provide controls only after entering edit mode. |
| Readable document | 1440×900 | Clean article reader; status `可供公司閱讀`; no editor controls in readable projection. |
| Duty drawer | 1440×900 | Read-only existing Duty/Position rows; no Duty mutation or AI conclusion. |
| Management method list | 390×844 | No create/mutation entry; no horizontal overflow; console clean. |
| Readable document | 390×844 | Status `唯讀`; no `編輯文件`, `保存草稿` or `提供公司閱讀`; no horizontal overflow; console clean. |

The browser checks used fresh in-app browser state and DOM snapshots plus viewport measurements. The synthetic MP-0001 fixture is local-only and is not a migration of the historical prototype.

## Implementation coverage

- Independent `ManagementMethodStoreV1` with permanent `MP-xxxx`, root lock, atomic current/previous files, CAS revisions, command receipt replay/conflict, working draft and one readable snapshot.
- Tiptap 3 OSS editor JSON allowlist, canonical body hash, bounded Google Docs-style paste sanitizer, table rendering and OrgMaster media ingest/read path with MIME magic-byte checks.
- Provider-neutral AI boundary with explicit fake generator for local development/tests and OpenAI Responses structured-output adapter behind server-only credentials.
- DEV-027 compatible six-permission catalog sync, server-side capability checks and module-scoped desktop mutation gate (`min-width: 1024px` + hover + fine pointer); mobile remains read-only.
- New management-method routes are wired ahead of the historical prototype route; the prototype remains historical compatibility code and is not the formal DEV-032 schema.

## Release boundary

This evidence is RD/QA-QC evidence for the local implementation. Durable production backend, identity provider, backups, media storage, OpenAI retention/financial controls, secret injection, deployment and production smoke remain a separate release gate.
