# DEV-057 / JENFU DEV-014：native lifecycle readback 路徑矯正

本項沿既有 Principal lifecycle v2 子任務。這是發布前唯讀工具缺陷，不是新的授權架構或 PostgreSQL schema 缺陷；031 尚未套用，未變更 Employee、principal、角色或服務流量。

## 原始失敗與共同原因

官方來源 `bdc746a492baef16b709f1b6bcec2b3b1950a64e` 的 immutable runner 已包含 readback 程式。既有 native Job `orgmaster-prod-migration-runner` 使用真實 migrator identity，以受控 command override 啟動；沒有覆寫 `CLOUD_RUN_JOB` 或 SQL login。

- execution `orgmaster-prod-migration-runner-f7kpq`：FAILED，僅留下通用錯誤。不得認列 ledger 或 queue readback。
- 同一固定程式外加不含 SQL／資料列的階段診斷，execution `orgmaster-prod-migration-runner-gjkkt`：FAILED；`READBACK_STOPPED / queryOrdinal=0 / MIGRATION_GCS_REF_INVALID`，證明失敗發生在 metadata credential 取得與資料庫連線之前。
- 兩次 operation 均已終止；Job 原 template SHA `d5807ca7170a4b8c4546bc11739e79b0bd4b7f8bafda45c9784636302cddb396` 均完整還原。沒有 service／traffic／DDL／資料寫入。

根因是 `OUTPUT_PREFIX` 帶尾端 `/`，共用 `parseGsUri` 的 startsWith guard 比對又將 `/` 組入 expected prefix，使文件指定的正常 `.../DEV014-LIFECYCLE-READBACK/<attempt>.json` 被拒絕。原測試覆蓋拒絕與 SQL snapshot，缺少 runner entry logic → 正常 prefix → immutable publication 的成功路徑。不得以建立雙斜線物件、放寬 bucket/prefix 或替代身分迴避。

## 修正及驗證層級

移除 caller prefix 的尾端 separator，保留共用 GCS target fence、create-if-absent、CRC32C 及 exact bytes readback。CLI 失敗只保留明列的 guard、upstream／SQLSTATE／network code；未知 code 統一隱去，不記錄 arbitrary message、SQL、token 或身分資料。

聚焦 `scripts/dev014-production-lifecycle-readback.test.mjs` 17/17 PASS，包含 documented runner entry logic 的完整合成成功路徑、read-only SQL、metadata token、一次 immutable GCS publication、CRC/readback 與安全錯誤碼。此測例沒有啟動 CLI subprocess。`npm run check:db-boundary` PASS。這是 LOCAL_REGRESSION，不是 Production ledger 或 L4 PASS。

下一步沿 protected source／required CI，重建及核對 immutable runner，使用新 source-bound image-only rotation，再執行 native readback。031 前必須獨立核對精確 001–030 checksum prefix，以及舊 lifecycle queue 的 open count／provenance；有未完成歷史事件時先釐清，不原樣重試 migration。正常 owner release、Platform 011、product Scheduler 與 Production L4 尚待完成；人類已於本輪接受 Scheduler／runtime 用量費用及建立／啟用，沿既有 PAUSED → owner enablement → resume/readback 流程續行。

原始私人 evidence：JENFU `output/dev-012/inputs/dev014-orgmaster-lifecycle-native-readback-20261006.json`、`dev014-orgmaster-lifecycle-readback-failure-20261006.json`、`dev014-orgmaster-lifecycle-native-readback-diagnostic-20261006.json`、`dev014-orgmaster-lifecycle-readback-diagnostic-cause-20261006.json`。保留原 FAIL 與其取代關係，不改寫為 PASS。
