# DEV-057：Principal 身分與角色發布（現行契約）

<a id="architecture-final"></a>

## 唯一施工入口

Lifecycle v2 的 current owner-exit evidence 與本 slice 唯一續接：[R7 lifecycle owner exit](../qa/DEV-057-lifecycle-enabled-startup-correction-2026-10-06.md)；機器可讀安全投影：[owner-exit receipt/hash projection](../qa/evidence/DEV014-ORGMASTER-OWNER-LIFECYCLE-EXIT-20261006.json)。沿既有 ORGMASTER/DEV-057 與 JENFU/DEV-014#lifecycle-v2，不建立新 DEV。

### Release and evidence boundary

Protected-source PR 121 required CI run 37425080699 passed and merged exact source commit c41e3918f50257429b7eedff5ee7a2e451cc9ae4. The completed default-off owner release ORGMASTER-REL-20261006065142642-C41E391 used --dev014-principal-lifecycle-v2-remediation, a fresh source-bound --dev014-infra-ref, and proof-bound Principal-only recovery. Because the runner executable inputs changed, it used the existing APP_INFRA_IMAGE_ROTATION gate with the complete resource-address set and only the exact migration-runner image field changed; every other address and non-image field remained identical. Smoke-credential reuse, an infra-reuse receipt and plan inputs were not used as rotation provenance. The owner Job checksum-verified all 31 rows before candidate creation, with applied=0 / replayed=31 and cross-database denials for jenfu_dev and jenfu_stg. Its ten production stages completed at 100% revision orgmaster-prod-9d3be61df2d5, while the worker flag stayed false and the exact product Scheduler stayed PAUSED.

After that release was finalized and the existing OrgMaster/Platform controls, native 031/011 receipt chains, exact runtime templates and PAUSED Scheduler were read back, the separate --dev014-principal-lifecycle-enable mode ran as ORGMASTER-REL-20261006070633549-C41E391. This existing gate changed only ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED from false to true, required UNCHANGED_VERIFIED and zero DDL/import, and was not combined with runner rotation. It completed ten production stages at 100% revision orgmaster-prod-a3dcae277231. The exact product Scheduler was resumed only after this release was RELEASED and current owner readbacks passed; its fixed * * * * * / Asia/Taipei configuration and ENABLED provider readback are bound by the sealed receipt hash in the projection. The enablement gate was not changed.

The normal verified Principal fixture path now has native readbacks for the inactive event, completed-event readback retaining the same receipt and epoch 1, and restoration at epoch 2. The native read-only worker readback records distinct executor and delivery actors, zero database writes and zero service mutations; the fixture state returned to its prior SHA-256. The prior session remains rejected with HTTP 401 auth_epoch_stale after restoration, while a fresh normal Google AAL1 session returns HTTP 200 on the Platform fixture path. These records close the OrgMaster lifecycle-worker owner slice. Existing local coverage includes 23 PostgreSQL cases and 8 runtime/source dependency files for lost-response replay, idempotency and lease handling; these cases are protocol coverage, not live Production fault-injection evidence. The owner Node suite (354/354), actual-profile startup (17/17), DB-boundary check and protected required CI retain their recorded scopes.

The owner receipts explicitly retain productionL4=false and fullDev014Complete=false. They do not close full JENFU DEV-014 or DEV-015: DEV-015 closure remains complete. JFS9014 PDM normal-entry denial is expected missing-profile behavior, not an epoch defect; JENFU DEV-014 final document/CI/merge delivery is tracked separately. Do not infer a whole-task or historical all-cases PASS from this OrgMaster owner exit. The earlier R3/R4/R6/R7 failed, aborted and pre-release checkpoints remain immutable history; the current exact status and machine bindings are in the owner-exit projection. Future authorized corrections retain the same protected-source, runner rotation, complete 31-row replay, separate runtime-only enablement, and exact Scheduler readback gates; no applied migration or historical receipt is rewritten.

## AI-PDM RD catalog v7 compatible reader — 2026-10-11

Native owner: `ORGMASTER/DEV-057#catalog-v7`; source obligation: `AI-PDM/DEV-121#rd-capabilities`. The human continuation explicitly includes this compatible reader and its own protected Production release. The immutable producer artifact is `ai-pdm.role-catalog.2026-10-10.v7`, canonical hash `4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9`, raw file hash `121ca7cd424b9d919cb9217516c0c5f6dcec3879ee389b0d676b9dd62cb0d94d`. Only RD's `page:numbering.drawings.view` is added; approval-decision authority and all other role definitions stay unchanged.

OrgMaster accepts v7 alongside exact v5/v6 snapshots. The live active contract publication remains the authority; complete metadata, publication order, digest and source-snapshot equality checks still fail closed. Vendoring a snapshot never changes assignments or provides a fallback for an unavailable/invalid database publication. Runtime packaging includes all three approved artifacts. The downstream governance validator pins the same v7 metadata and matching source reference. Existing exact v6 assignment identities retain their provenance through the existing full role metadata/scope comparison; unknown versions, identity conflicts and scope drift remain rejected. There is no OrgMaster migration, grant rewrite or additional account opening. The historical v5/v6 pair diagnostic is not used as v7 readback evidence. Publish the compatible OrgMaster reader before AI-PDM activates v7 through its own governed migration/release. Local synthetic readback and required CI are separate from active v7 Production readback and RD user acceptance.

Local reproduction rejected the exact valid v7 with `EXTERNAL_CATALOG_STALE`. After correction, seven focused reader/registry/governance/capability files passed 50 cases and TypeScript passed. Read-only peer source QC found the initial downstream validator blocker; the corrected active reader-to-governance path has no remaining blocking finding. Peer inspection covers file content and artifact equality, not independent Git provenance or execution. Required protected CI, own owner release and active v7 Production readback remain pending at this source checkpoint. Reuse unchanged 31-entry ledger and infrastructure evidence through the native ordinary owner path; do not rebuild unchanged tool images or edit historical receipts.

## 歷史引用入口（非施工指令）

<a id="production-r3-release"></a>

歷史段落：[production-r3-release](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#production-r3-release)；查明舊決策或證據時才讀取。

<a id="production-r2-correction"></a>

歷史段落：[production-r2-correction](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#production-r2-correction)；查明舊決策或證據時才讀取。

<a id="principal-producer-impact"></a>

歷史段落：[principal-producer-impact](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#principal-producer-impact)；查明舊決策或證據時才讀取。

<a id="principal-review-20260924"></a>

歷史段落：[principal-review-20260924](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#principal-review-20260924)；查明舊決策或證據時才讀取。

<a id="principal-owner-command-amendment"></a>

歷史段落：[principal-owner-command-amendment](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#principal-owner-command-amendment)；查明舊決策或證據時才讀取。
