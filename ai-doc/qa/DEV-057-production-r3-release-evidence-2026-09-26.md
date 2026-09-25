# DEV-057 Production R3：OrgMaster producer 發布證據

- 來源：官方受保護 `master` merge commit `48120534cbde4a06d0f3cd6d5de76171ca7e0699`；[PR #55](https://github.com/jedchang0308-jenfu/OrgMaster/pull/55)。
- Owner 執行：[workflow 36146949383](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/36146949383)，十個發布階段均成功；release ID `ORGMASTER-REL-20260925142128074-4812053`。
- Terminal：`RELEASED`、`databaseDisposition=FORWARD_APPLIED`、`remainingHumanAction=0`。精確 receipt：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20260925142128074-4812053/2d0e55f95a93e26787c883be28e0c24b55b6db5aa5d27806d9bbf6b1db1d01d2/terminal.json`，receipt SHA-256 `2b664663464f0cb8b05f05355ec26c4c2c1358f8a64874114d952b8bd12511db`。
- Migration：同 prefix `migrate.json`；`orgmaster_core.schema_migrations` ledger 26，`applied=1`、`replayed=25`、boundary PASS；`jenfu_dev` 與 `jenfu_stg` 均拒絕連線，正式目標 `jenfu_prod`。本輪只新增已審查的 forward-only 026，保留 001–025。
- Provider readback：`orgmaster-prod` 最新 ready revision `orgmaster-prod-c2a14a18803b`，100% traffic；image `asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:95819b6b3cb90bf6ddc1f508df7c8b812f84e7e0c1c37497d147dec15f59ba96`。

本證據只關閉 OrgMaster producer R3 release。跨 owner 的 AI-PDM v2 consumer conformance、完整 managed identity readback、Production L4 allow／deny、跨 TTL、global logout 與 v1／v2 recovery 仍屬 JENFU/DEV-015、AIPDM/DEV-121 的未完成驗收；不可把 owner workflow 的 internal smoke 計為那些案例 PASS。R2 安全中止與其 025 ledger 保留歷史追溯。

## DEV-057 v4 role catalog Production consumer readback（後續獨立證據）

- AI-PDM migration-only workflow `36178981292` 先發布 v4 九角色目錄、完成 065／066／067；本次 OrgMaster operator 不發布目錄、不改指派或權限。
- 唯讀 operator 由 OrgMaster 受保護 `master` 的 [PR #57](https://github.com/jedchang0308-jenfu/OrgMaster/pull/57) 與 [PR #58](https://github.com/jedchang0308-jenfu/OrgMaster/pull/58) 合併來源 `514b08f9c9af22f2ef8b60f0eaa7eaffe31bc94b` 建置；Cloud Build `d1924959-81dd-44b4-85ed-f54cb3c594f4` 成功、Artifact Registry immutable image `sha256:258bab2d1c809110e3ecc6f9b868623078242aeb83e1bd5c14aa267b1949b7e1` 已讀回。
- 首次 execution `orgmaster-prod-dev057-v4-catalog-readback-s9j5h` 以 `EXTERNAL_CATALOG_INVALID` fail closed，原因是 PostgreSQL `jsonb` 改變巢狀物件欄位順序，舊 consumer 對讀回 JSON 重新序列化計算 producer 雜湊。PR #58 改為逐值比對已驗雜湊的 source-frozen v4 artifact，並以 JSON 欄位重排及實際權限竄改測試確認前者接受、後者拒絕；focused repository 4/4、operator 3/3、DEV-040 R2 QC／build／DB boundary PASS。失敗期間未切 service traffic。
- 修正後 execution `orgmaster-prod-dev057-v4-catalog-readback-6rwqg` 成功；provider generation `1790367097432681` 的不可覆寫 receipt：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-V4-CONSUMER-READBACK/20260926-r2.json`。readback 為 `ai-pdm.role-catalog.2026-09-25.v4`、catalog SHA-256 `32f3593d7a0d2a5cad4875181a62b8f5c49a06c9cbba8835cd1b82e9b44ca08a`、九角色；既有有效版六筆及草稿六筆 AI-PDM 指派皆為 v3 provenance，逐筆角色／scope 仍有效，無 v4 新指派。
- 暫時 Job `orgmaster-prod-dev057-v4-catalog-readback` 已刪除並以 describe 404 確認；OrgMaster service 仍維持 R3 revision。這只完成 v4 目錄與現有指派相容的正式讀回，不能替代 principal 帳戶資料、授權切換、Production L4 或 AI-PDM traffic 驗收。
