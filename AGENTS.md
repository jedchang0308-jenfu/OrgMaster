# OrgMaster 工作指引

- 任務與契約由 [dev_task](ai-doc/dev_task.md)／[文件地圖](ai-doc/documentation_map.md) 進入；沿原隔離分支，保留既有修改與資料。
- 人決定任用與例外，系統提醒；授權與資料完整性仍須系統把關。只補受影響驗證、重用有效證據，結果集中原 QA；新 SHA／回合／文件不觸發整包重跑，一般修正不另建任務、簽核或證據格式。

## 資料與授權 — DEV010_DB_RULESET_V1

- 只擁有 `orgmaster_core`／`orgmaster_contract`。DDL 走 `db/migrations` forward-only；已套用檔案不改刪，不手改共享正式 DB、不在 `public` 建物件。改 SQL／DB boundary 才跑 `npm run check:db-boundary`。
- 跨系統只讀 versioned `*_contract`，禁止 sibling `*_core`；breaking contract 另版並留相容窗口。runtime 無 owner／DDL／migrator 權限。
- 人類寫入沿 verified Principal、v2 identity-fenced writer，保留 session／epoch、scope／期限／撤權、CAS、防重送與同交易 audit。業務權限依 Employee 明示任用；`system_admin` 只認 exact-Principal direct global grant，不繼承或繞過資格。
- workload 依實際 PostgreSQL `SESSION_USER` 的 typed owner／purpose／provider，禁 actor label、UID／email fallback 或 v1 worker；lifecycle 凍結 Principal／provider-pair，Scheduler 沿 owner 命令。完整身份與回復限制見 [DEV-057](ai-doc/specs/DEV-057-identity-and-grant-contract-boundary.md)。

## 正式發布與回復 — DEV040_R2_RELEASE_V3_DIRECT_RUN_APP

- 須有人類對正式環境與動作的既有授權；本文件不授權正式 migration、部署、資料、IAM／Secret 或跨專案操作。
- 只限 `orgmaster-prod` 自有 schema／release 資源；DB=`jenfu-platform-prod / asia-east1 / jenfu-platform-prod-pg / jenfu_prod`，runtime／migrator 分離，不碰 sibling／共享 foundation。入口用 provider 驗證的 `run.app`，保留未用 edge 資產。
- 唯一普通入口 `npm run deploy:production`（`-- --check` 只讀）；保留 clean exact `master` PR merge、review／QC、required `Production Source QC` 與 provider branch protection（admin enforced、零 bypass、禁 force-push／刪除）。沿 immutable capsule、concurrency 與先前 RELEASED baseline；普通發布 `UNCHANGED_VERIFIED`，零 DDL／import／bootstrap。
- 未知寫入先 readback；回復限自身 traffic → candidate tag → entry baseline，維持 Principal-only，不 down migration／改寫正式資料。特殊 migration／工具 rotation／復原沿 [DEV-040](ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md)、[profile](config/release/dev040-orgmaster-independent-production-v3.json) 與 [回復參考](ai-doc/specs/DEV-040-release-recovery-reference.md)，不略過既有執行器。只改 release executor 才補其受影響測試，不加第二人核准或等待。
