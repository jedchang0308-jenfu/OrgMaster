# DEV-037 矩陣／推薦與 DEV-040 executor 修正：Production release 證據

日期：2026-10-08（Asia/Taipei）
專案：OrgMaster  來源：OrgMaster/DEV-037 角色指派治理 UI slice、DEV-040 release-executor reliability slice
正式環境：`jenfu-platform-prod / asia-east1 / orgmaster-prod`

## 發布結果

- PR [#126](https://github.com/jedchang0308-jenfu/OrgMaster/pull/126) 由受保護 `master` 合併；source／merge commit：`d134e3e3046cf44b91507d9a9399d2f11286b40d`。Required `Production Source QC` workflow [37709232027](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/37709232027) 為 success。
- 正式 owner workflow [37709765666](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/37709765666)，run #89，head SHA 與上述 merge commit 相同，結論 `success`。十階段 `prepare → build → migrate → candidate → entrypoint → verify → decision → activate → canonical → finalize` 全部成功，`failure` job skipped。
- Release：`ORGMASTER-REL-20261008004906354-D134E3E`；capsule `gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20261008004906354-D134E3E/release-intent.json`，SHA-256 `6b2668e0421191e5042c2352f211aee4e114c30aa5d20ea88dc87ab39eea0750`。
- Final terminal receipt：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20261008004906354-D134E3E/6b2668e0421191e5042c2352f211aee4e114c30aa5d20ea88dc87ab39eea0750/terminal.json`，SHA-256 `44e3ccc1e0345038697c068309cb7f2f4c095d37b8808ae5f1005bc12e4ad121`。Terminal：`RELEASED`，`remainingHumanAction=0`。
- Published image：`asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:c9bc99aba53c74bd7999afea83f4fdfacc2d9669a31a21152abcdd341400cb8e`。

## 切流與服務讀回

Workflow finalize、canonical receipts 成功後，以唯讀 Cloud Run provider describe 再讀一次服務：

| 欄位 | Provider readback |
|---|---|
| Service | `orgmaster-prod` |
| Canonical default URL | `https://orgmaster-prod-56gnizku7q-de.a.run.app` |
| Latest ready revision | `orgmaster-prod-ceacdac90393` |
| Traffic | 100% → `orgmaster-prod-ceacdac90393` |
| Temporary candidate tags | 0（finalize receipt） |

Post-release 官方唯讀 preflight 為 `READY`，sourceRevision `d134e3e3046cf44b91507d9a9399d2f11286b40d`，baseline terminal SHA 與上方 final receipt 相同。

## 資料庫與變更範圍

Migration receipt 與 terminal 顯示 `UNCHANGED_VERIFIED`、`migrationsExecuted=0`、`dataImportsExecuted=0`、`pendingMigrationCount=0`。資料庫驗證範圍是 `PRIOR_RELEASE_EVIDENCE_PLUS_CURRENT_RUNTIME_SMOKE`，`liveLedgerRead=false`；本次沒有執行 DDL 或資料 import。

部署內容涵蓋角色 × 系統矩陣、交叉格新增／撤銷、狀態標籤與詳細資料彈窗、員工推薦 API/UI，以及 DEV-040 owner build input identity、provider build reuse、unknown submission fence/readback 與 checkpoint 保留。沒有建立或修改正式員工指派、發布治理版本、外部應用權限、IAM、Secret、Terraform 或其他應用服務。

## 自動化驗證

- 本地 `npm run test:dev-040:r2`：356/356 PASS。
- 本地 `npm run qc:dev-040:r2`：PASS；selected owner suite 340/340、abort suite 6/6、DB boundary PASS、Vitest 224 files（1,145 passed／4 skipped）、production client/server build PASS。
- Protected `Production Source QC`：success，包含 workflow 內 owner、abort、full Vitest、build、catalog repository test、DB boundary 與 `qc:dev-040:r2`。
- 正式 owner workflow：所有十階段成功，finalize receipt `PASS`；正式服務 provider traffic readback 如上。

## 驗證界線

本次證明指定 source 已部署並切到 100% canonical production traffic。未執行正式瀏覽器中的矩陣／推薦互動驗收，也未呼叫真實 OpenAI provider；不得以 release smoke 代替這兩項證據。推薦結果仍是管理員參考，選取候選才填入草稿表單；OrgMaster 沒有因此同步或直接修改 AI-PDM 權限。
