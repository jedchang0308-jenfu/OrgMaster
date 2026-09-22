# DEV-056：OrgMaster system permission catalog compatible sync

狀態：`Architecture Finalized / RD Implementation Complete / Local QA-QC Passed / Release In Progress`

來源：`Jenfu-Platform / DEV-014 / zero-paid-seat Production login fixtures`。本文件是 OrgMaster 原生修復任務，不把來源專案 DEV ID 宣稱為本專案任務。

## 問題與根因

Production 治理文件早於 managed identity 功能建立。既有草稿保有 `orgmaster.governance.manage` 與 `orgmaster.governance.publish`，因此管理者可以新增角色指派並發布版本；但草稿缺少後來加入的 OrgMaster identity／employee-number system permissions 及 `orgmaster_admin` allow grants。新發布版本只複製既有草稿，managed identity API 因而持續以 `IDENTITY_VIEW_REQUIRED` 拒絕。

## 架構決策

- 讀取現行 V3 governance store 時，對 `ORGMASTER_PERMISSIONS` 執行相容、可重播的 draft-only catalog sync。
- 只補上缺少的穩定 permission 與 `role-orgmaster-admin` allow grant；既有 active published snapshots、Employee assignments、identity links 及 application role assignments 均不改寫。
- 若相同 ID 或 application/code 已存在但內容不同，回傳 `ORGMASTER_SYSTEM_CATALOG_CONFLICT` 並停止，不猜測或覆寫。
- 有新增時透過既有 CAS／persistence path 寫入並追加 `ORGMASTER_SYSTEM_CATALOG_SYNCED` audit event；第二次重播保留原 revision，不再寫入。
- UI 正確標示 `assignment-governance-v3`，且只允許伺服器目前接受的 V3 版本重新啟用。

此修正不新增 schema、migration、IAM、Secret、service、資料重寫或人工 SQL。Production 生效仍沿用 DEV-040 owner-native release；服務發布後由一般 governance read 完成 draft sync，再以既有管理者流程發布新的 immutable governance version。

## 驗收

- 缺少 system permission／grant 時只補草稿，既有 published versions byte-equivalent。
- 完整 catalog 再讀為 no-op，revision 不變。
- stable ID／code／grant 衝突 fail closed。
- TypeScript、client build、server build與治理 store targeted tests通過。
- Production 發布後，管理者可讀 exact fixture Employee managed identity，並只綁定 DEV-014 兩個已核准的 Cloud Identity Free 帳號。

本地證據：governance store targeted `8/8`、owner release `89/89`、release QC `89/89`、abort `6/6`、產品回歸 `609 PASS / 1 skipped`、DB boundary、TypeScript及client／server production build全部PASS。

## Release 與回復

沿用既有 `prepare → build → migrate(unchanged readback) → candidate → entrypoint → verify → decision → activate → canonical → finalize`。應用程式回復使用 owner release 既有 previous revision；governance sync 為 additive draft update，尚未發布時不影響 active policy，發布後若驗證失敗則依既有 immutable version reactivation 流程回復前一 V3 版本。
