# DEV-037：外部角色目錄與角色指派治理 QA／QC 計畫

狀態：`QA-QC Passed / Fresh Evidence Captured / OrgMaster Only`
風險等級：High
日期：2026-08-27
權威 spec：`ai-doc/specs/DEV-037-external-role-catalog-assignment-governance.md`
執行邊界：OrgMaster local Current Phase；不修改 AI-PDM、不 deploy、不 release

## 1. Verification Objective

證明 DEV-037 從正常 Toolbar 入口到 V2 store 的同一 delivery path確實做到：

- AI-PDM 角色以具來源／版本的唯讀 catalog 呈現，OrgMaster沒有外部 Permission／Role-Permission／領域 Approval Policy mutation。
- 管理者可建立具 scope／期間的 external role assignment與 role delegation，透過 draft→publish產生 immutable local-only version。
- unknown、inactive、unassignable、stale、invalid、unavailable、scope mismatch、identity／revision conflict與 legacy reactivation均 fail closed且可恢復。
- V1 source／published history／audit保持可讀且不被原地改寫；V2 migration可重試、可追溯。
- OrgMaster internal manage／publish authorization、CAS、idempotency、audit chain、desktop mutation與 mobile read-only未回歸。
- 任一 UI成功訊息都不宣稱 AI-PDM 已生效。

本計畫的舊 DEV-027／035 evidence只能作 baseline，不能判 DEV-037通過。

## 2. Evidence Boundary and Provenance

QC manifest 必須記錄：

- canonical repo：`C:\VIBE CODING\OrgMaster`；branch、HEAD與 `git status --short`。
- source state：HEAD加當次 DEV-037 dirty changes；列出 allowlist內實際修改檔。
- AI-PDM before／after `git status --short`與兩個 source file diff comparison。
- Node／npm版本、test／build command、exit code、passed files／tests與 warnings。
- browser runtime project、purpose、port、PID／process tree、governance data path、start／cleanup time。
- actor：local development principal；route：正常 Toolbar入口，不以 direct URL取代入口可發現性。
- fixture：organization source版本、employee／department IDs只記必要識別；不得輸出 principal subject或credential。
- screenshot：case ID、viewport、操作步驟、預期／實際與 source revision。

本次 fresh execution 使用 Node `v24.12.0`、npm `11.6.2`；full regression 為 `122 test files／553 tests passed`，`npm run build` 通過（僅既有 Vite extensionless import／chunk size warnings）。AI-PDM before／after status hash 均為 `2A0AF7824F57F43B9190B9247F97D297D4758E341A78B55D62FA733CF33A196E`，canonical V1 bytes unchanged；完整 provenance 與 runtime cleanup 記於 `output/playwright/dev037/manifest.md`。

Evidence root固定 `output/playwright/dev037/`；完成前建立 `manifest.md`，只記實際執行結果。

## 3. Fixture Boundary

### 3.1 Unit／store fixtures

- 使用 test內 in-memory V1／V2 documents與 `mkdtemp` data root。
- V1 fixture至少含：一個 legacy published version、一個 active internal admin assignment、一個可映射 external assignment、一個無法映射 external assignment、一個 permission-based delegation、一個 approval policy。
- catalog fixtures：valid、stale、invalid payload hash、unavailable、unknown role、inactive role、unassignable external specialist、scope mismatch。
- unit／store tests不得讀寫 canonical `data/` 或 AI-PDM。

### 3.2 Browser fixture

- organization parent data可讀 canonical current workspace，但 governance writes必須指定 task-owned `ORGMASTER_GOVERNANCE_DATA_DIR=<repo>/output/playwright/dev037/runtime-data`。
- runtime-data開始前必須不存在或是本次 QC已驗證的空目錄；不得複用 canonical `data/orgmaster-governance.v1.json`作 mutation target。
- catalog正常案例使用 bundled valid state；failure案例另啟動相同 source revision的 temporary runtime，設定 `ORGMASTER_DEV_EXTERNAL_CATALOG_STATE=stale`。invalid／unavailable可由 automated tests覆蓋，若 UI可安全觸發則補 evidence，不取代 stale必測案例。
- UI建立的 identity／assignment／delegation／published version必須由 UI normal path產生；不得先以 API或直接改 JSON建立該案例的成功結果。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| 外部角色／Permission仍可編輯 | V1 command／UI殘留 | 雙重權威、錯誤擴權 | API negative＋normal UI scan | P0 | API-OWN-01、UI-CAT-01 |
| catalog payload或版本未驗證 | fixture漂移／hash未比對 | 指派引用錯誤角色 | catalog unit＋publish negative | P0 | CAT-01～04 |
| V1 migration覆寫或遺失資料 | in-place write／錯誤 filter | 歷史不可追溯 | byte comparison＋migration tests | P0 | MIG-01～05 |
| legacy version可重新啟用 | version kind未檢查 | 舊外部 policy再次冒充權威 | API／UI reactivation test | P0 | LEG-02 |
| external assignment授予OrgMaster管理權 | evaluator未分 application | privilege escalation | internal auth tests | P0 | SEC-01～03 |
| scope被靜默放大為global | client fallback／server缺驗證 | 過度授權 | scope negative＋UI field test | P0 | ASN-03、UI-ASN-02 |
| delegation超出來源assignment | 欄位不一致／期間放大 | 非預期代理 | validator／store tests | P0 | DEL-01～04 |
| stale catalog仍可publish | publish只驗draft | 過期角色發布 | stale runtime＋store test | P0 | PUB-03、UI-ERR-01 |
| publish顯示AI-PDM已生效 | 舊成功文案 | 管理者誤判 | screenshot＋text assertion | P1 | UI-PUB-02 |
| migration unresolved被忽略 | 自動丟棄／未設blocker | 指派遺漏 | migration report＋publish blocker | P0 | MIG-04、PUB-04 |
| CAS／idempotency回歸 | V2 path未沿用revision | 重複版本／覆蓋他人 | two-session＋store tests | P0 | CON-01～03 |
| catalog UI資訊過密或框中框 | 直接呈現所有metadata | 難以辨識主要任務 | quietness audit | P1 | UI-UX-01 |
| 重要風險被極簡化隱藏 | 移除local-only／high risk狀態 | 錯誤發布 | publish summary review | P0 | UI-PUB-01～02 |
| mobile仍有mutation control | 只用CSS隱藏／server誤判 | 未授權窄版操作 | DOM count＋server auth | P0 | RWD-01 |
| 畫面有visible error卻用build判通過 | evidence層級不符 | false pass | visible error sweep | P0 | VIS-01 |
| temporary runtime未清理 | PID／port未追蹤 | 污染其他任務 | process tree＋port recheck | P1 | ENV-01 |

## 5. Automated Test Matrix

### 5.1 Catalog and domain

| ID | 前置／操作 | 預期 |
|---|---|---|
| CAT-01 | validate bundled catalog | 9 roles、version／payload hash／3 source refs正確、state valid |
| CAT-02 | duplicate stable ID／code或tampered payload | invalid；assignment／publish不可用 |
| CAT-03 | external specialist candidate | `EXTERNAL_ROLE_UNASSIGNABLE`，沒有 override |
| CAT-04 | stale／unavailable catalog | history可讀；external create／reactivate／publish fail closed |
| ASN-01 | valid employee＋role＋allowed scope＋period | V2 assignment accepted、snapshot與catalog完全一致 |
| ASN-02 | same employee／app／role／scope active duplicate | no duplicate；same command replay或semantic conflict |
| ASN-03 | role scope不允許、department不存在、period反轉 | 422 validation issue；不自動 global |
| ASN-04 | internal orgmaster assignment | catalog null、effect orgmaster-enforced、internal role required |
| DEL-01 | valid external source assignment＋different delegate＋bounded period | accepted、snapshots match source |
| DEL-02 | source internal assignment或revoked source | rejected |
| DEL-03 | self delegation／scope mismatch／period超出source | `ROLE_DELEGATION_INVALID` |
| DEL-04 | legacy permission delegation migration | unresolved read-only；不自動轉role delegation |

### 5.2 Migration and store

| ID | 前置／操作 | 預期 |
|---|---|---|
| MIG-01 | V2 missing、valid V1 exists | V2 atomic create；V1 current／previous bytes unchanged |
| MIG-02 | repeat ensure after V2 create | revision／audit count unchanged，無重複 migration |
| MIG-03 | V1 published history＋active ID | kind legacy；snapshot hash／policy／org snapshot preserved；internal auth continuity |
| MIG-04 | unmapped assignment＋legacy delegation | migration report保留；publish blocker `LEGACY_MIGRATION_UNRESOLVED` |
| MIG-05 | invalid V1／audit tamper／invalid V2 | fail closed；不建立新V2或fallback V1 |
| STO-01 | V2 mutation | previous保存已驗證raw、current atomic write/readback |
| STO-02 | identical command replay | single state change／audit；不同payload同ID拒絕 |
| PUB-01 | valid draft publish | kind V2、catalog snapshot、organization snapshot、local-only、snapshot hash與audit正確 |
| PUB-02 | missing identity／manage／publish或admin continuity | fail closed |
| PUB-03 | catalog version changed／stale | publish與reactivate 409；draft preserved |
| PUB-04 | unresolved migration | publish 409；history可讀 |
| LEG-01 | read legacy version detail | sanitized、可讀、標示legacy |
| LEG-02 | reactivate legacy version | `LEGACY_POLICY_REACTIVATION_FORBIDDEN` |

### 5.3 API, authorization, and presentation

| ID | 前置／操作 | 預期 |
|---|---|---|
| API-OWN-01 | external role／permission／grant／approval／legacy delegation mutation | 409 `EXTERNAL_CATALOG_READ_ONLY` |
| API-VAL-01 | POST validate assignment | no store revision／audit change；result含catalog hash、effect與issues |
| API-LEG-01 | POST old evaluate routes | 410 `LEGACY_GOVERNANCE_EVALUATOR_RETIRED` |
| SEC-01 | evaluate internal OrgMaster permission on V2 | active internal role＋grant可用，deny precedence保留 |
| SEC-02 | evaluate AI-PDM permission | denied `EXTERNAL_PERMISSION_EVALUATION_UNSUPPORTED` |
| SEC-03 | external high-risk assignment only | 不產生manage／publish capability |
| CON-01 | stale expected revision | 409，較新document不覆寫 |
| CON-02 | publish retry same command ID | 不產生第二version／audit |
| CON-03 | two command payloads share ID | `COMMAND_ID_REUSED` |
| PRE-01 | every stable error code | 繁中訊息、reload flag正確、無raw code UI fallback |

## 6. Automated Commands

S1：

```powershell
npm test -- src/governance/aiPdmCatalog.test.ts src/governance/migrateGovernanceV1ToV2.test.ts src/governance/commands.test.ts src/governance/validation.test.ts
```

S2：

```powershell
npm test -- src/governance/evaluatePermission.test.ts src/governance/governancePresentation.test.ts server/orgmasterGovernanceStore.test.ts server/orgmasterGovernanceApi.test.ts
```

S3 type／build：

```powershell
npm run build
```

S4 full regression：

```powershell
npm test -- --run --reporter=dot
npm run build
```

所有 command要記 exit code與摘要。Targeted gate未過不可進下一slice；full regression失敗必須先歸因，不能以「unrelated」口頭略過。

## 7. Browser Delivery Cases

### UI-ENTRY-01：正常入口與catalog唯讀

前置：valid bundled catalog；manage actor；1440×900。

步驟：

1. 從 OrgMaster正常畫面點 Toolbar「角色指派治理」。
2. 確認 focus進dialog、heading與close accessible name。
3. 開「應用角色目錄」。
4. 確認 AI-PDM 9 roles、version、source state、risk／scope；OrgMaster internal role分組。
5. 搜尋 DOM／畫面：無新增、編輯、刪除外部role，無Permission／Matrix／審核規則入口。

通過：catalog count／metadata合理；角色名稱可開按需 detail；沒有外部mutation CTA；console無非預期error。

### UI-ASN-01：assignment draft→publish→reload

前置：UI建立current identity與OrgMaster admin assignment，發布前 blockers可觀察；再建立 external assignment。

步驟：

1. 選員工與 `rd_manager`；scope顯示department select。
2. 選有效department、設定validFrom／validTo，加入draft。
3. 確認row顯示role、scope、期間、草稿／尚未同步；reload後仍在。
4. 到發布版本，檢查organization version、catalog version、assignment change、high-risk、effect與reason gate。
5. 輸入reason發布，reload。

通過：active V2 version、assignment、catalog reference、publisher／reason與audit可讀；success固定「已發布至 OrgMaster，尚未同步至目標系統」。

### UI-DEL-01：role delegation

前置：active external assignment存在。

步驟：選source assignment、different delegate、bounded valid period與reason，加入draft並publish。

通過：scope繼承不可編輯放大；validTo必填；reload後可追溯source／from／to／role／catalog／period；internal assignment不在source選單。

### UI-ERR-01：stale catalog visible recovery

前置：相同source revision、isolated runtime以development override `stale`啟動。

步驟：正常入口開catalog／assignment／publish；嘗試建立或發布；reload。

通過：catalog就地顯示stale與恢復方式；assignment／publish fail closed；history／draft可讀；無假成功、無raw code、沒有manual role input fallback。

### UI-LEG-01：legacy read-only

前置：V1 migration／store fixture含legacy V1 published version；本次 canonical browser fixture沒有已發布的V1版本，因此 browser UI 不建立虛構 legacy success state，改由 automated migration／store gate作為 authoritative evidence。

步驟：開發布版本與detail。

通過：automated gate 證明標示歷史V1、內容可讀且不允許 legacy reactivation；外部permission只保留歷史 compatibility，不進 normal catalog／assignment UI。

### RWD-01：1024×768與390×844

- 1024：正常catalog／assignment table可讀；dialog、drawer、publish modal不重疊，body無水平overflow。
- 390：顯示read-only狀態；mutation form、row actions、publish buttons DOM count = 0；nav可操作、table可在自身容器閱讀，body無水平overflow。

### A11Y-01：keyboard／focus／state

- Toolbar開啟後focus在dialog內；Tab順序符合visual flow。
- drawer／confirm modal各自trap focus；Escape依 modal→drawer→center關閉；最後focus回Toolbar按鈕。
- status／error不只靠顏色；dynamic status可被live region取得。
- icon-only controls有accessible name；200% zoom及reduced motion不阻斷主要任務。

### UI-UX-01：quietness audit

- 首屏只有role catalog／assignment current task與一個primary action。
- 沒有卡片包卡片、重複標題、常駐教學、成功面板或同一local-only事實多重badge。
- high-risk／stale／local-only等保留元素各有可觀察誤操作風險；其餘helper／summary刪除。

### VIS-01：visible error and data sanity hard gate

- 任一 unexpected `[role=alert]`、load failed、HTTP 4xx/5xx raw text、Not Found、Internal Server Error立即Fail／reopen。
- fail-seeking案例的預期error只在該步成立；切回valid runtime後必須fresh reload並重驗正常流程。
- catalog預期9 external roles；0或不合理count、missing source version、空assignment row於已建立後出現都Fail。
- build／API success不能覆蓋visible failure。

## 8. Forbidden Mutation and Cross-Repo Checks

RD完成後執行並將實際結果記manifest：

```powershell
rg -n "GovernanceSimulator|evaluateGovernancePermission|resolveGovernanceReviewers|approvalPolicies|Permission Matrix|審核規則" src/components/GovernanceCenter.tsx src/governance/apiClient.ts
rg -n "AI_PDM_PERMISSIONS|AI_PDM_PAGE_PERMISSION_CODES|AI_PDM_ACTION_PERMISSION_CODES" server/orgmasterGovernanceStore.ts src/components/GovernanceCenter.tsx
git -C "C:\VIBE CODING\AI_PDM" status --short
git -C "C:\VIBE CODING\AI_PDM" diff -- db/schema.sql src/lib/repositories/numbering-repository.ts
```

前兩個 scan在normal V2 UI／store path預期 no match；legacy source可保留但不得被import。AI-PDM status／diff必須與RD前baseline完全相同；不是要求AI-PDM clean，而是要求本 DEV未新增差異。

## 9. Temporary Runtime Lifecycle

啟動前：

1. 記錄 project、purpose、candidate port、data path、owner與cleanup condition。
2. 檢查既有 runtime；只有與本source revision／fixture／data path完全相符才可reuse。
3. 預設candidate port `5003`；若被占用，不得清除未知port，改選已驗證free port並記manifest。
4. 建立 task-owned `output/playwright/dev037/runtime-data`，確認不指向 canonical `data`。

啟動命令模板：

```powershell
$dev037Port = 5003
$env:ORGMASTER_GOVERNANCE_DATA_DIR = (Resolve-Path 'output/playwright/dev037/runtime-data').Path
npm run dev -- --host 127.0.0.1 --port $dev037Port --strictPort
```

stale case另使用同樣process紀錄並設定：

```powershell
$env:ORGMASTER_DEV_EXTERNAL_CATALOG_STATE = 'stale'
```

QC結束只停止已驗證task-owned PID／children；確認該port listener為0。不得停止所有 `node.exe`、不得碰其他task runtime。清除env只影響本process／shell；runtime-data與screenshots保留為evidence，是否後續清理由使用者決定。

## 10. Required Artifacts

- `output/playwright/dev037/manifest.md`
- `catalog-final-1440x900.png`
- `assignment-final-1440x900.png`
- `delegation-final-1440x900.png`
- `assignment-check-final-1440x900.png`
- `publish-final-1440x900.png`
- `desktop-1024x768.png`
- `mobile-check-final-390x844.png`
- `stale-catalog-recovery-final-1440x900.png`
- `stale-assignment-blocked-1440x900.png`
- automated legacy evidence：`src/governance/migrateGovernanceV1ToV2.test.ts`、`server/orgmasterGovernanceStore.test.ts`

Manifest必須連結每張 artifact、case ID、viewport、source revision、data source與結果。UI-LEG-01因 canonical fixture 沒有 legacy published version，依前置條件由 automated migration／store evidence覆蓋，不以虛構 screenshot 取代。

## 11. Pass／Fail and RD Feedback

- Pass：S1～S4 automated gates、normal UI delivery、stale fail-seeking、legacy、RWD、a11y基本、visible-error、AI-PDM unchanged與runtime cleanup全部有fresh evidence，無P0／P1 defect。
- Fail：任何必要case失敗、外部mutation可達、V1／AI-PDM被寫入、authorization／migration／catalog／scope fail-open、visible error、假成功、mobile mutation或process未清理。
- Not verified：缺target viewport、角色、fixture、route、source provenance、screenshot、AI-PDM comparison或無法觸發必要state。
- Blocked：環境／data／runtime無法取得且不能安全替代；記恢復條件，不改acceptance。

### Fresh execution result（2026-08-27）

- S1～S4 automated、normal Toolbar entry、V2 assignment／delegation／publish／audit、stale catalog fail-closed、legacy non-destructive migration、API negative、forbidden scan、1440×900／1024×768／390×844 RWD 與 visible-error sweep 均通過。
- 390px fresh evaluation：`hasCreate=false`、`hasPublish=false`、`hasRevoke=false`、`scrollWidth=clientWidth=390`、console errors `0`。
- runtime `5003`（valid）與 `5004`（stale／legacy fixture）均以 task-owned process 啟動並於 QC 結束釋放 port；runtime data 與 screenshots 保留作 evidence。
- 結論：`QA-QC Passed`；未 deploy／release，未修改 AI-PDM。

QC只回報事實、不修改產品；失敗回送RD，RD只修受影響allowlist，接著重跑受影響targeted gate與必要delivery path。只有QC通過後，PM才能把DEV-037標為 Implementation Complete／QA-QC Passed。

使用思考習慣：#可驗證性、#證據品質、#使用者視角
