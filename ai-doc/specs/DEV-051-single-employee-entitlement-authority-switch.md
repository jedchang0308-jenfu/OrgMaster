# DEV-051：AI-PDM 單一員工權限來源切換控制面

文件成熟度：`RD Implementation Complete / Architecture Finalized 2026-09-20`
交付狀態：`Local QA-QC Passed / Production One-Time Operator Job Gated`
風險：`High`（Production 授權來源、特權 principal、session refresh）
來源任務：`Jenfu-Platform / DEV-013 / P_BOTH`

本文件是 OrgMaster 對 Platform DEV-013 `P_BOTH` 的原生實作任務。目標是在不新增 schema、migration、IAM、Secret 或資料庫直改的前提下，讓已核准的特權操作者透過 OrgMaster 正常產品入口，把**自己的** AI-PDM entitlement authority 以既有受控 PostgreSQL 函式從 `legacy_authority` 切到 `orgmaster_authority`，或在驗證失敗時以新 CAS version 回切。

2026-09-20 人類授權的 Production data operation 只涵蓋 `jenfu-platform-prod / jenfu-platform-prod-pg / jenfu_prod / ai-pdm / employee-shijie`。該授權允許 receipt、outbox／session refresh、回切及 Platform／AI-PDM L4 browser；明文禁止 service 與 traffic 變更。2026-09-21查證又確認Production identity是password-only AAL1，DEV-012明文要求高權限mutation維持fail closed，因此不得為了這次切換降低產品入口的fresh AAL2條件。首次Production cutover改採第4節的具名release operator路徑；產品UI保留給未來具AAL2 provider session的日常操作。

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

### 4.1 兩條執行路徑

日常產品路徑仍是第1～3節的self-only UI／API，必須fresh AAL2；AAL1不得視為step-up。首次Production cutover不部署該入口，而是由具名`jedchang0308@jenfu.com.tw` Google Cloud operator建立一次性Cloud Run Job `orgmaster-prod-dev013-p-both-employee-shijie`。Cloud Audit Log保存job create／execute／delete操作者；job使用既有`orgmaster-prod-migrator`、private Cloud SQL attachment與既有CAS function，不新增或修改IAM／Secret，不改Cloud Run service、revision、traffic或entry policy。

Operator runner與image必須綁定exact committed source，並具下列fail-closed條件：

- operation manifest位於owner bucket的`source/production-data/dev013/p-both/employee-shijie/`，以SHA-256、source revision與八小時內deadline綁定；
- target常數固定project／region／instance／database／application／Employee／job／service account，任何override都拒絕；
- preflight只讀驗證`legacy_authority:1`、active V3 version、同Employee唯一active principal-scoped`system_admin`、human-privileged admission及cross-app override，輸出零mutation receipt；
- switch manifest再綁preflight取得的exact active assignment version與排序後role codes，固定`legacy_authority:1→orgmaster_authority:2`；
- transaction內使用advisory lock＋既有CAS function，僅允許一筆employee override、一筆immutable switch receipt與一筆outbox；commit前後重新核對governance payload hash、assignment version與role set皆未變；
- 同operation exact replay回原DB receipt與outbox，payload reuse或CAS／policy漂移fail closed；
- rollback使用另一份manifest，固定`orgmaster_authority:2→legacy_authority:3`，不得直接UPDATE或down migration；
- 觀察完成後刪除exact task-owned job；immutable image digest、operation、receipt與Cloud Audit Log保留作重播／rollback證據。

資料操作順序固定為：

1. 由exact operator image執行只讀preflight，確認active published `system_admin`、human-privileged principal、management grant、active assignment version／role set與目前authority version。
2. 以preflight receipt產生source-bound switch manifest，使用`employee-shijie / ai-pdm / expected version 1 / target orgmaster_authority`執行exact task-owned job。
3. 保存 replayable receipt，確認 new version=2、唯一 authority=`orgmaster_authority`、outbox已建立。
4. fresh Platform session 顯示 AI-PDM launcher；完成 Platform→AI-PDM、direct entry、clean callback、三 viewport、global logout及至少300秒觀察。
5. 若 protected request 出現錯誤 allow／deny、authority ambiguity 或 P0／P1，使用同一operator image與rollback manifest，以expected version 2回切`legacy_authority`；保存回切receipt並重驗deny／舊路徑。不得刪服務、down migration或人工改表。

Production operation 不得發布目前草稿中的`pdm_admin`、`rd_manager`，不得修改其他Employee／application、service、traffic、schema、migration、IAM或Secret。建立／執行／刪除一次性Cloud Run Job及build immutable operator image是目前資料切換授權以外的新cloud resource範圍，仍須另行明確授權；不需要也不得以OrgMaster service release替代。

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
npm run test:dev-013:authority
# 6/6 PASS；manifest／target／Employee／role-set綁定、evidence-derived switch／rollback、one-time job／image boundary、zero-mutation preflight、CAS＋receipt＋outbox、byte-stable exact replay與missing-system_admin fail-closed
```

Targeted tests證明 self-only、fresh AAL2、active published system_admin＋cross-app override、parameterized function arguments、CAS error mapping、receipt projection、UI preview與 replayable operation ID。DEV-040 owner report=`output/dev-040-r2/s1b/DEV040-R2-S1B-20260920T155300846Z-FADD04E7/owner-report.json`；它是 local contract evidence，`releaseAuthority=false`。這些 local evidence 不等於 Production service release、authority switch或 L4 PASS。

## 6. 完成條件

- OrgMaster exact source合併；operator image綁定該revision，task-owned job create／execute／delete與Cloud Audit readback一致，Cloud Run service／traffic／IAM／Secret mutation皆為0。
- `employee-shijie / ai-pdm` authority switch receipt與 provider／DB readback一致。
- Platform／AI-PDM Production L4 browser固定 cases、global logout與觀察窗通過。
- Platform DEV-013 completion receipt hard-join exact OrgMaster source、authority receipt與browser evidence。
- 任一失敗都留下可重播或回切的明確狀態；未確認事項不得標完成。
