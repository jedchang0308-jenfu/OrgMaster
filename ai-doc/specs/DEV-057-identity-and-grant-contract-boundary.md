# DEV-057：Principal 身分與角色發布（現行契約）

<a id="pdm-session-revocation"></a>

## PDM 有效權限異動先撤銷再發布

整合主控為 Jenfu-Platform 專案的 session，依 `JENFU/DEV-015#pdm-session-revocation` 定義跨系統順序與驗收。PDM 接收由 `AIPDM/DEV-121#pdm-session-revocation` 負責。[主控契約](../../../Jenfu-Platform/ai-doc/specs/DEV-015-authentication-authorization-boundary-refactor.md#pdm-session-revocation)

- 沿用政策發布、active version 切換、有效指派與 lifecycle 事件／回執模式。既有行政異動派送可作參考，不能視為一般角色發布已接通 PDM。盤點並涵蓋影響 PDM 的任用新增、變更、撤銷、公司／專案範圍、委派、行政任用、身分停用及政策切換／回復。從變更前後的有效權限確定受影響 Principal，不依 email 或只依角色名稱。
- 凍結基線及預期發布版本，保存待發布事件與精確影響範圍，再通知 Platform。草稿、預覽及無有效差異的提交不觸發。加上對生效中或將來會改變快照的有效期資訊，供 PDM 登入選定上限。
- 對須消除撤權空窗的異動，依主控契約等待 PDM 的持久化撤銷回執，再在發布交易比對基線與影響範圍。若基線漂移，停止原操作的生效並重新準備；未能確定原操作結果時先按原 ID 讀回。發布成功後送出正式版本證據，供 PDM 安全恢復登入。跨服務傳送不持有長資料庫交易。
- 隔離驗收以正常產品入口走過新增／撤銷、共用政策切換、舊版本回復、無差異、到期、同範圍競爭和通知故障。證明缺 PDM 回執時待變更不生效、事件重送不再發布第二版、確認取消不留下無主登入阻擋。DEV-070 正式行政任用若影響 PDM，作為本切片的呼叫端納入，沿原 owner 契約。


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

## DEV-057 completed smoke credential continuation — 2026-10-11

Native owner remains ORGMASTER/DEV-057; source obligation is AI-PDM/DEV-121 RD publication. A successful adjacent Secret update can precede a blocked Terraform Workflow rotation. The completed credential proof then expires after 300 seconds, while creating another adjacent Secret version would no longer match the Workflow's actual previous version. This is a producer continuation gap, not authority to weaken the consumer or extend freshness.

The existing own reauth CLI adds optional `--resume-receipt <own immutable URI#sha256=hash>`, together with `--commit --previous-version N --new-version N+1`. It accepts only an original own sealed PASS, validates its exact schema/self-hash and original authentication timeline, and requires its source to be an ancestor of the current clean official master source. The native producer checks clean checkout, official remote and exact remote HEAD; the operator must independently read back protected-source review/required CI before execution, and the existing owner release gate proves it again before publication. The original Secret pair stays exact and unchanged; latest must already equal the enabled new version. Reading that immutable numeric version must verify the same signed Firebase password identity and enabled/verified account. Under the 2026-11-09 cross-owner contract below, fresh human password/Google authentication occurs once through Platform; OrgMaster consumes the resulting Platform immutable multi-owner identity/readback receipt and does not prompt for a second password in its loopback CLI. The receipt must bind the same exact Principal/Employee identity readbacks, current AAL1 assurance and authentication time for this owner. The persisted refresh credential must separately create/reload/logout a normal Platform session, so current Firebase revocation and Principal/authEpoch checks cannot be replaced by signature/pair validity.

The continuation never calls Secret addVersion. It synchronizes only the persisted numeric-version bytes to this owner's existing GitHub production environment secret once, retaining pre/post latest-version checks and metadata-update readback. GitHub does not permit reading its Secret bytes back; the OrgMaster owner receipt proves the submitted own payload and metadata state, not a byte readback from GitHub. The legacy own-loopback producer may still append an exact-shape PASS and a private immutable continuation link for compatibility. The preferred cross-owner path instead consumes the Platform credential receipt together with the matching shared identity/readback receipt: exact Principal/Employee, AAL1, password authentication, identity pair, adjacent Platform version, all three numeric Secret versions, all three GitHub Secret metadata readbacks and both self-hashes must agree. OrgMaster then issues only its ordinary smoke-rotation owner receipt; it does not mint a duplicate credential receipt or ask the person to authenticate again. It preserves all prior receipts and stops on drift or unknown write outcome without resubmission.

Focused synthetic acceptance: original-time PASS versus stale current-time proof; wrong owner/ref/hash/version/identity/future proof rejection; Platform receipt owner/hash/Principal/Employee/AAL1/time mismatch rejection; disabled/unverified/Firebase identity and logout rejection; latest numeric-version drift and persisted credential mismatch; exactly one same-owner GitHub environment-secret sync and zero addVersion calls in continuation; partial/unknown outcome and buffer cleanup. The historical local owner Node suite passed 364/364, including 35/35 reauth cases with zero skips. Those results cover the 2026-10-11 producer behavior and do not establish the Platform-issued multi-owner receipt flow. Required protected-source CI, real continuation/rotation, compatible OrgMaster deployment and AI-PDM RD acceptance remain unverified at this source checkpoint. No SQL, role assignment, IAM, Terraform profile or application runtime is changed by this producer correction.

<a id="platform-only-human-proof-and-own-secret-synchronization-2026-11-09"></a>

### Platform-only human proof and own Secret synchronization — 2026-11-09

For each cross-owner smoke credential issuance or continuation, Platform alone performs the human AAL1 password/Google verification and issues the immutable multi-owner identity/readback receipt. OrgMaster verifies and consumes that receipt; a person does not repeat password entry in an OrgMaster loopback. OrgMaster remains responsible for its own numeric Secret, its GitHub production environment secret, its Terraform Workflow version binding and its own immutable owner receipt. The receipt carries identity/readback evidence, not password or credential bytes, and does not grant Secret access across owners. Owner identity, current numeric-version binding, the existing 300-second freshness gate and provider readback on an unknown write outcome remain required. This contract adds no IAM and creates no role assignment; it does not grant financial business permissions, and the Chinese name remains unchanged.

The native consumer accepts only the paired immutable refs produced by that single Platform operation: `receipts/identity/shared-sync-*.json` in the OrgMaster release bucket and the exact Platform `receipts/credential-reauth/*.json`. It validates the original authentication timeline once, derives OrgMaster's adjacent version from the shared readback, and binds both refs into prepared, plan, apply and final owner proofs. Legacy OrgMaster-only credential receipts remain compatible, but are not required for this shared path. No second protected-source check, second credential copy or second human confirmation is added.

Current shared readbacks bind the exact Platform receipt self-hash and the signed Firebase `auth_time` through `platformCredentialBinding`. OrgMaster checks both fields against the original receipt and verifies the shared receipt hash before deriving the adjacent version. Historical shared receipts without the binding retain their 180-second pairing window. Platform can re-attest an already-synchronized version by checking the existing credentials and provider metadata, then writing a new immutable receipt.

OrgMaster uses the same Platform password-provider session exchange for candidate and canonical smoke. The candidate uses the owner Workflow and the canonical check uses the released `run.app` entry. Google sign-in retains its managed intent flow. Credential rotation alone advances the numeric Secret version. The narrowly scoped [candidate Workflow recovery](DEV-040-release-recovery-reference.md#候選-smoke-來源回復) corrects the deployed recipe at the already-proven version. A reviewed successor can reuse that applied receipt when the released baseline, full infrastructure and copied executable inputs match, and the deployed Workflow and exact numeric Secret still pass readback. The ordinary release retains the candidate and canonical allow/deny observations and automatic rollback.

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

## Historical applied-image predecessor source — 2026-10-11

A historical raw `APP_INFRA_IMAGE_ROTATION` receipt may precede a later RELEASED application source. Its immutable source identifies the image/infrastructure apply; it does not replace the current published application source. When those source revisions differ, the native predecessor resolver requires the same own hash-verified raw receipt, exact published intent and source-lock joins, the corresponding sealed RELEASED terminal and active revision, and byte-identical complete infrastructure trees across the raw, published and current sources. Every ancestor layer retains the same checks. A different raw mutation profile, incomplete or changed bytes, a forged lock/terminal or a wrong current rotation source remains denied. This does not rewrite historical evidence, select an older production baseline, bypass current control/provider CAS, or permit a new resource, Secret, migration or data scope. Existing copied executable, full address set, foundation/image/state lineage/serial and apply-time credential checks still run.

The current same-task restore and numeric rotation remain separate sealed owner operations; this source correction cannot substitute for their provider receipts. No runner/controller COPY input changes are included. The original helper rejects the valid synthetic historical-source case with SMOKE_REUSE_CHAIN_SOURCE_INVALID (RED); the correction passes all six new cases. Local owner Node is 370/370; QC selection is 354/354, abort is 6/6, app regression is 895 PASS with four existing skips, and type/build/database-boundary checks pass. Native QC removed its synthetic data; no local result grants release authority. A separate Luna read-only diff review found no source/receipt guard gap. Protected-source CI and actual owner publication remain pending.
