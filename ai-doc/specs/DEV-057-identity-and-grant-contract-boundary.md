# DEV-057：Principal 身分與角色發布（現行契約）

<a id="architecture-final"></a>

## 唯一施工入口

Lifecycle v2 唯一續點：[R7 target/startup 與未封存候選清理](../qa/DEV-057-lifecycle-enabled-startup-correction-2026-10-06.md)。owner profile 必須注入七個 source-owned、validator 精確核對的 production target 欄位，保留實際 runtime target guard。既有 false-state corrective slice 只可補上缺漏的固定欄位及維持 false；若 predecessor 已有不同值即拒絕。enablement 仍為已準備 runtime 的單一 false→true，Scheduler 維持 PAUSED 至 owner RELEASED。未封存 candidate 必須從 configured traffic 判定並完成 etag CAS 清理；即使未出現在 status projection，也不得直接封存成功收束。server/SQL/Principal protocol 與已套用 migration 不變。後接 checksum replay→enable→resume→固定 fixture event/receipt/epoch/recovery L4；先前 R3/R4/R6 未發布或失敗 checkpoints 僅為歷史。

### Release and evidence boundary

The first pending owner action is a protected-source, runner-only false-state release using --dev014-principal-lifecycle-v2-remediation, a fresh source-bound --dev014-infra-ref, and proof-bound Principal-only recovery. The runner executable changed, so use only the existing APP_INFRA_IMAGE_ROTATION gate: require its complete resource-address set, permit only the exact migration-runner image field, and prove every other address and non-image field unchanged. The validated rotation receipt must be bound to the frozen source before the owner Job; do not substitute smoke credential reuse, an infra-reuse receipt, or plan inputs for rotation provenance. Validate the complete 31-row checksum replay before candidate creation. This stage keeps ORGMASTER_PRINCIPAL_LIFECYCLE_ENABLED=false and the product Scheduler PAUSED.

After the false-state owner release is finalized, the existing protected-source operator may run the separate --dev014-principal-lifecycle-enable mode only when its existing prerequisites are satisfied: current finalized OrgMaster/Platform controls and native 031/011 receipt chains, exact runtime templates, and the PAUSED product Scheduler. This mode changes only the runtime flag false→true, requires UNCHANGED_VERIFIED and zero DDL, and must not be combined with the runner image rotation. Do not change the enablement gate. Scheduler resume remains a later exact-job operation after the enablement release is RELEASED and current owner readbacks pass. Neither release proves positive lifecycle L4 by itself.

Current evidence is indexed in the [DEV-014 remaining-delivery ledger](../../../Jenfu-Platform/ai-doc/qa/evidence/DEV014-REMAINING-DELIVERY-20261005/index.json). R6 synthetic capacity, R7 disposable PostgreSQL guards, and R9 local Node/caller QC retain their original evidence levels. The 2026-10-06 Platform R38 receipt at ../../../Jenfu-Platform/output/dev-012/inputs/dev014-platform-published-lifecycle-false-chain-r38-20261006.json proves source 2c864651bba305479ceab884712fc5b7e4b322a6 is RELEASED at 100% revision jenfu-platform-prod-918ba7cde2d7 and migration 011 is a full checksum replay (applied=0/replayed=11); it does not prove the OrgMaster runner rotation or positive event/L4. OrgMaster still serves the earlier false-state release with 031 installed. The R3 runner image built from source 8de46ca22483b8b56fc91dd8db0c9656a34e6881 is not rotated or published.

The OrgMaster protected-source CI, fresh runner image rotation, false-state owner release and full 31-row replay are still pending. Once that owner release is finalized, retain the existing runtime-only enablement gate; then resume the exact PAUSED Scheduler after the enablement release and current owner readbacks. Collect v2 preflight and event evidence at their actual stage through the existing read-only CLI and normal verified Principal workflow. Positive event delivery, Platform receipt, auth epoch, replay/recovery, and Production lifecycle L4 remain unverified. Platform migration 011 is already released and replay-verified by R38, but that consumer receipt is not positive lifecycle evidence. Keep the flag false and Scheduler PAUSED until the existing source-bound release/provider-readback path authorizes the next step; this section adds no DEV or manual approval gate.

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
