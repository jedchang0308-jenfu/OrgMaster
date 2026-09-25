# DEV-055：DEV-014 current projection contract correction

> **2026-09-24 ownership／command 修訂引用**：authority資料、唯一CAS命令及receipt／outbox由本owner擁有，typed身分事實供其他投影重用；Platform只做invalidation，取消Platform v3，舊入口ACL cleanup後置。 以 [現行native契約](DEV-057-identity-and-grant-contract-boundary.md#principal-owner-command-amendment)為B目標；本文件下方保留歷史行為、驗收分母與evidence，不代表B已上線。

> **2026-09-24 B 實作定案對齊（Documents Only）**：workspace／governance版本分離的修正保留；managed principal readback使用OrgMaster兩個active contract，historical compatibility projection不作typed identity權威；owner依本輪更正為OrgMaster。目前架構與精確實作依 [principal-first契約](DEV-057-identity-and-grant-contract-boundary.md#principal-implementation-contract)，成熟度 `Architecture Finalized / RD Implementation Ready`；下方evidence原樣保留，不表示已發布B。

狀態：`Architecture Finalized / RD Implementation Complete / Local QA-QC Passed / Production Release In Progress`

來源：`Jenfu-Platform / DEV-014 / zero-paid-seat fixture projection correction`。

## 問題與根因

兩筆 DEV-014 fixture 啟用後，current workspace artifact 在相同 version key 下產生新的 canonical SHA。正式治理版本與既有 `employee-shijie` 指派仍完整，`orgmaster_contract.v_active_principal_mappings_v1` 與 `v_orgmaster_session_principals_v1` 也仍可讀；但歷史 `access_governance` projection 以治理發布時凍結的 workspace SHA 重新 join current artifact，因此 AI-PDM authority、effective roles 與 Portal visibility 變成空集合。

workspace lifecycle 與 governance lifecycle 是兩個版本軸。Employee 狀態或 managed identity 更新不得要求重發未變更的角色治理版本，也不得讓既有有效授權暫時消失。

## 架構決策

Forward-only migration `020_dev014_current_projection_contract.sql` 只在 `orgmaster_contract` 內 `CREATE OR REPLACE` 三個既有 read-only views：

- `v_ai_pdm_entitlement_authority_v1`：以 current active principal mappings 產生 per-Employee authority。
- `v_ai_pdm_effective_role_assignments_v1`：治理版本仍提供角色指派；current workspace manifest 提供 position-adoption 的現況驗證；managed daily identity 固定為 `human_personal`，legacy privileged principal 仍以 active governance admission 判斷。
- `v_portal_app_visibility_v1`：直接組合 current principal mappings、OrgMaster governance assignment 與修正後 AI-PDM effective roles。

歷史 `access_governance` compatibility views 不修改。三個 contract view 的名稱、欄位順序、型別、owner、consumer grants 與 contract manifest signature 不變；不修改 authority rows、assignment、Employee、IAM、Secret、service 或 traffic。

## 驗收

- 治理凍結 SHA 與 current workspace canonical SHA 不同時，既有 active Employee 的 OrgMaster／AI-PDM visibility 與 AI-PDM role projection維持不變。
- `orgmaster_authority` override仍以既有 authority version輸出；不得建立或重寫 override。
- pending-auth managed identity不得出現在 authority、effective role或Portal visibility。
- 完整保留migration 010既有consumer ACL：Platform runtime可讀Portal及既有entitlement contracts，AI-PDM與OrgMaster runtime保留既有entitlement contract SELECT；不新增角色、membership或DML。
- Migration receipt固定`ledgerCount=20`、`applied=0..1`、`replayed=20-applied`，並證明dev／staging cross-database denial。

## Release順序

Local contract／PostgreSQL／owner gates → review／merge → source-bound immutable migration runner rotation → owner 19→20 apply＋replay → candidate／canonical traffic驗證 → Production contract readback → 既有 session refresh → 續行兩筆 fixture role assignment與DEV-014 L4 matrix。

## Local QA／QC evidence

- `qc:dev-055:contract`、`check:db-boundary`、既有 owner-release 89 tests 與 production build PASS。
- PostgreSQL 18.4 的 D55-01～D55-05 全數 PASS；client、cluster、port 與 temporary root 均已清理。
- Evidence：`dev-055/postgres/manifest.json`。
