# DEV-053：Managed identity invalidation application registration 補正

狀態：`RD Implementation Complete / Architecture Finalized / Local QA-QC Passed / Production Migration Gated`

來源：`Jenfu-Platform / DEV-014 / 014-APPLICATION-REGISTRATION`。本地 DEV-053 只承接 OrgMaster owner 的 invalidation consumer registry，不把 Platform 的 DEV ID 宣稱為 OrgMaster native task。

## 問題與生產證據

2026-09-21 已核准的 Production admission operation 在 transaction 內、任何 attestation 或 admission mutation 前，以 `DEV049_ACTIVE_CONSUMER_SET_MISMATCH` 安全停止並回滾。正式 active governance policy 的 application 物件使用 `id`，migration 012 seed 只讀 `applicationId`；因此 AI-PDM 沒有被註冊為 active consumer，OrgMaster 保留 inactive seed，而 mandatory Platform consumer 尚不存在。Operation 依正式 policy 與基礎 consumer 算出的 required set 是 `ai-pdm / orgmaster / platform`，DB registry 與之不一致。

## 架構決策

唯一 fix-forward 是 `db/migrations/017_dev014_invalidation_application_registration.sql`，不修改已套用的 migration 001–016。

- 正規 application key 為 `COALESCE(applicationId, id)`；兩欄同時存在但不同、空值或不符合穩定 key 格式時 fail closed。
- 目前 active governance policy 的 active application，加上 mandatory `orgmaster`、`platform`，構成唯一 desired consumer set。
- 新 consumer 以 `support_state=pending / support_revision=1` 建立；既有 row 的 support revision 與 evidence 原樣保留。
- Admission 關閉時可同步 active/inactive set；admission 開啟時只有集合不變的 governance write 可繼續，集合改變會使同一 transaction 回滾。
- 同步 routine 僅 migrator owner 可直接執行；OrgMaster runtime 只能透過既有 SECURITY DEFINER identity-fenced writer 間接觸發，Platform／AI-PDM runtime 與 Platform migrator皆不得直接呼叫。

## Release contract

受控模式固定 `DEV-014 / 014-APPLICATION-REGISTRATION`，只接受 exact 001–016 → 017 append、runtime unchanged、source-matched immutable migration runner 與 `APP_INFRA_IMAGE_ROTATION` receipt。Migration receipt 必須是 `ledgerCount=17`、`applied=0..1`、`replayed=17-applied`、boundary PASS 與兩個 cross-database denial PASS。完成後普通 release 的 migration bundle 固定為 001–017 且零 DDL。

本文件不構成 Production DDL 授權。實際 apply 必須綁定 fresh merged source、runner digest、saved plan SHA、既有 `orgmaster-prod-migration-runner`、`jenfu_prod` 與 migration 017；禁止人工 SQL、down migration、其他 schema／資料、IAM、Secret、service、traffic 或 sibling application 變更。

## 驗收

- D53-01：使用 production-shaped `id` fixture 套用 001–017，registry 必須精確為 `ai-pdm / orgmaster / platform`，三者 active、pending、revision 1。
- D53-02：三方 attestation 後啟用 admission，consumer set 不變的 governance write 必須成功。
- D53-03：admission 開啟時移除 application 必須整筆回滾；關閉後相同 write 才可成功，mandatory consumers 仍 active。
- Contract QC 驗證 profile hash、transaction unwrap hash、mandatory consumers、雙欄正規化與 ACL。
- Release tests驗證 exact 16→17 suffix、17-row receipt、runner/profile entry count一致及其他模式拒絕。

Production 完成條件：migration 017 APPLIED＋REPLAY、三份 owner conformance attestation、OrgMaster admission APPLIED＋REPLAY、Platform admission APPLIED＋REPLAY、Production L4、global logout／session refresh、觀察及 task-owned surface／runtime cleanup。

Local validation（2026-09-21）：contract PASS；PostgreSQL 18.4 D53-01～03 PASS且task-owned runtime完整清理；release 77／77、abort 6／6、full regression 875 PASS／1 skipped、client／server build與DB boundary PASS。所有local evidence均為productionWrites=false。
