# DEV-051：AI-PDM 單一員工權限來源切換控制面

文件成熟度：`RD Implementation Complete / Architecture Finalized 2026-09-20`
交付狀態：`Local QA-QC Passed / Production Service Release Gated`
風險：`High`（Production 授權來源、特權 principal、session refresh）
來源任務：`Jenfu-Platform / DEV-013 / P_BOTH`

本文件是 OrgMaster 對 Platform DEV-013 `P_BOTH` 的原生實作任務。目標是在不新增 schema、migration、IAM、Secret 或資料庫直改的前提下，讓已核准的特權操作者透過 OrgMaster 正常產品入口，把**自己的** AI-PDM entitlement authority 以既有受控 PostgreSQL 函式從 `legacy_authority` 切到 `orgmaster_authority`，或在驗證失敗時以新 CAS version 回切。

2026-09-20 人類授權的 Production data operation 只涵蓋 `jenfu-platform-prod / jenfu-platform-prod-pg / jenfu_prod / ai-pdm / employee-shijie`。該授權允許 receipt、outbox／session refresh、回切及 Platform／AI-PDM L4 browser；明文禁止 service 與 traffic 變更。因此目前可以完成本機產品與驗證，但把控制面發布到 `orgmaster-prod` 仍需要一筆另行、精確的 OrgMaster owner-native service release 授權。

## 1. 結果與邊界

產品入口位於「角色治理 → 角色指派 → `system_admin` 特權設定」。只有同時符合下列條件的登入者會看到並可送出切換：

- verified session 解析到唯一 `principalId / employeeId / issuer / subject`；
- session 為五分鐘內重新驗證的 `aal2`，且 session ID、principal 與 actor 完全一致；
- active published governance 中有同一 principal、同一 Employee 的 active `human_privileged` admission；
- 同一 principal 持有 active `orgmaster.cross_app_override` management grant；
- 同一 principal 在 active published governance 中持有 AI-PDM `system_admin`、global、principal-scoped assignment；
- request 固定 `applicationId=ai-pdm`，且 `employeeId` 必須等於登入 session 的 Employee；
- browser mutation 具 OrgMaster canonical 或本次 candidate exact origin。

Browser 不可指定另一位 Employee，也不能提交 actor principal、assignment version 或資料庫函式名稱。Server 由 active published version產生 `assignmentVersionId`，再以 parameterized query 呼叫既有 `access_governance.switch_employee_entitlement_authority_v1`。草稿中尚未發布的角色變更不會影響切換授權，使用者既有 `pdm_admin`、`rd_manager` 草稿指派保持原樣。

本 DEV 不新增 authority table、receipt table、outbox、migration 或 dispatcher。授權正確性在資料庫交易 commit 後即由 single-authority effective view 決定；同交易產生 immutable receipt 與 pending outbox。既有 dispatcher 目前不是 employee-scoped，故本次不從此入口盲目 dispatch 全域 pending queue；L4 以 fresh session／global logout 驗證新權限，outbox ID 與狀態保留給既有受控重試流程。

## 2. API 與交易契約

`POST /api/orgmaster/governance/employee-authority-switch`

Request：

```json
{
  "applicationId": "ai-pdm",
  "employeeId": "employee-shijie",
  "toAuthoritySource": "orgmaster_authority",
  "expectedAuthorityVersion": 1,
  "operationId": "authority-switch-<uuid>",
  "batchId": "single-employee-authority-switch",
  "reason": "DEV-013 Production L4 P_BOTH"
}
```

Response 是 `orgmaster.employee-authority-switch-receipt.v1`，只包含 operation／receipt／outbox ID、application、Employee、target source、new authority version、active assignment version、session refresh state 與 replay flag；不回傳 raw subject、token、credential 或連線資訊。

固定交易語意：

1. Server 驗證 same-origin、verified actor、self-only Employee、active published privileged authority。
2. 資料庫函式以 `expectedAuthorityVersion` 執行 CAS；stale version 回 `409`，不得 blind retry。
3. 同一 `operationId`＋同一 payload 可重播並回原 receipt；不同 payload reuse 回 `409`。
4. 成功交易同時提交 employee override、receipt 與 outbox；HTTP response lost 時沿用相同 operation ID 重試。
5. 回切使用 `toAuthoritySource=legacy_authority` 及成功 receipt 的新 authority version，不做 down migration 或直接 UPDATE。

## 3. UI 與失敗處理

UI 採兩步操作：先輸入目標來源、目前 CAS version 與原因，再產生預覽；確認後才 POST。operation ID 在預覽時建立，網路結果未知時保留同一 ID 重播。Server 是最終授權者，隱藏按鈕不構成安全邊界。

- `400`：輸入、operation／batch ID 或 reason 無效。
- `403`：origin、近期 AAL2、privileged admission、cross-app override 或 active `system_admin` 不成立。
- `404`：目標 authority state 不存在。
- `409`：CAS stale、operation reuse 或 active published version不成立。
- `422`：Employee 已停用。
- `503`：受控資料庫切換失敗；不得假設未 commit，須用同 operation ID 重播。

## 4. Production 執行與回復

Production 執行只接受 owner-native ordinary release 的 exact committed source。Release 必須維持既有 001–015 migration bundle unchanged、DDL=0、import/bootstrap=0、IAM／Secret／entry policy不變，依 DEV-040 十階段流程建立 candidate、驗證、activate、canonical readback與可回復 receipt。

資料操作順序固定為：

1. 只讀確認 active published `system_admin`、human-privileged principal、management grant 與目前 authority version。
2. 使用 `employee-shijie / ai-pdm / expected version 1 / target orgmaster_authority` 預覽並確認。
3. 保存 replayable receipt，確認 new version=2、唯一 authority=`orgmaster_authority`、outbox已建立。
4. fresh Platform session 顯示 AI-PDM launcher；完成 Platform→AI-PDM、direct entry、clean callback、三 viewport、global logout及至少300秒觀察。
5. 若 protected request 出現錯誤 allow／deny、authority ambiguity 或 P0／P1，使用同入口以 expected version 2 回切 `legacy_authority`；保存回切 receipt並重驗 deny／舊路徑。不得刪服務、down migration或人工改表。

Production operation 不得發布目前草稿中的 `pdm_admin`、`rd_manager`，不得修改其他 Employee／application、service、traffic、schema、migration、IAM 或 Secret。Service release 本身只有在另行授權明示 candidate／traffic／rollback 時才能執行；資料切換授權不自動包含 release。

## 5. 驗證證據

本機實作驗證：

```text
npm test -- --run server/employeeAuthoritySwitchStore.test.ts src/components/GovernancePrivilegedAssignments.test.tsx server/orgmasterGovernanceApi.test.ts
# 4 files / 28 tests PASS
npm run build
# client + SSR production build PASS
npm run check:db-boundary
# DEV010_DB_RULESET_V1 PASS
git diff --check
# PASS
npm run test:dev-040:r2
# 63/63 PASS
npm run qc:dev-040:r2
# owner report PASS；abort 6/6、full regression 872 PASS／1 skipped、build與DB boundary均PASS
```

Targeted tests證明 self-only、fresh AAL2、active published system_admin＋cross-app override、parameterized function arguments、CAS error mapping、receipt projection、UI preview與 replayable operation ID。DEV-040 owner report=`output/dev-040-r2/s1b/DEV040-R2-S1B-20260920T155300846Z-FADD04E7/owner-report.json`；它是 local contract evidence，`releaseAuthority=false`。這些 local evidence 不等於 Production service release、authority switch或 L4 PASS。

## 6. 完成條件

- OrgMaster exact source通過 required release gates，owner-native ordinary release完成且無 DDL／IAM／Secret drift。
- `employee-shijie / ai-pdm` authority switch receipt與 provider／DB readback一致。
- Platform／AI-PDM Production L4 browser固定 cases、global logout與觀察窗通過。
- Platform DEV-013 completion receipt hard-join exact OrgMaster source、authority receipt與browser evidence。
- 任一失敗都留下可重播或回切的明確狀態；未確認事項不得標完成。
