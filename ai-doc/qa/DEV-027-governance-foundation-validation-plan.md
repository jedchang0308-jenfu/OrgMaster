# DEV-027 QA／QC：OrgMaster local governance MVP

狀態：`QA-QC Passed / DEV-027 Complete / DEV-035 Recovery Passed`
風險：High  
日期：2026-08-18  
權威規格：`ai-doc/specs/DEV-027-orgmaster-access-approval-governance.md`  
架構決策：ADR-004（歷史／已取代）、ADR-005、ADR-007（目前目標權威）

## 1. Scope and evidence boundary

驗證對象只包含 `C:\VIBE CODING\OrgMaster` 的 local governance MVP：V1 store、local development identity adapter、management API、permission evaluator、reviewer resolver、governance UI與existing OrgMaster regression。

本計畫不能證明：

- AI-PDM 已串接或已停止使用自身permission／approval rules；
- shared IAM production validation、service-to-service authentication或production security；
- remote／durable database、HA、backup／restore、正式migration或release readiness。
- ADR-007 的外部角色目錄唯讀、禁止外部 Permission mutation、catalog version／stale recovery 或角色指派在 AI-PDM 實際生效。

QC只驗證與收證，不修改產品。任一失敗回送RD；QA只有在QC通過後才能更新DEV完成狀態。

## 2. Risk-based phase gates

| Gate | Required before | Must pass |
| --- | --- | --- |
| G0 Baseline | 任一產品修改 | 既有full tests、build；非Git file allowlist已記錄 |
| G1 Foundation | 開始evaluator／resolver UI | schema／validation／command／store／API targeted tests；V1 init、CAS、idempotency、audit、recovery通過 |
| G2 Policy engine | Browser QC | permission／reviewer targeted tests；explicit deny、scope、delegation、self-approval、quorum通過 |
| G3 Final QA | QC handoff | full tests、build、source-boundary scan、runtime API smoke |
| G4 QC | DEV完成判定 | 三viewport真實操作、visible-error sweep、security／data sanity、evidence完整 |

第一個gate失敗即停止後續gate；不得用後面的build或fresh browser掩蓋前面失敗。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者／系統影響 | 偵測方式 | 優先級 | 對策／必要測試 |
| --- | --- | --- | --- | --- | --- |
| UID映射到錯誤員工 | 重複／改email時重綁 | 越權或錯誤審核人 | identity uniqueness tests、publish validation | P0 | case-sensitive issuer＋subject唯一；衝突fail closed |
| 組織職務直接等於應用角色 | schema或UI偷做隱含推導 | 組織異動造成擴權 | type／command tests、UI walk-through | P0 | 分離資料表與明確assignment |
| Draft影響正式結果 | evaluator讀draft | 未發布權限立即生效 | draft vs active tests | P0 | evaluator只接受active immutable snapshot |
| Current organization被維護後改寫歷史解析 | policy只存version ID | receipt不可重現 | snapshot immutability test | P0 | published version嵌最小organization snapshot |
| Explicit deny被allow覆蓋 | precedence錯誤 | 高風險權限誤開 | evaluator matrix | P0 | deny first invariant |
| Delegation遞迴或過期仍生效 | resolver展開無界／time bug | 代理越權 | delegation negative tests | P0 | 單層、exact scope、有效期間、revoked拒絕 |
| 自審或quorum不足仍resolved | filter順序錯誤 | 不合法核准 | reviewer tests | P0 | self移除後才算quorum，insufficient unresolved |
| 重送command重複寫入 | retry無idempotency | 重複grant／audit | replay／payload mismatch tests | P0 | commandId persisted in audit |
| Concurrent write遺失更新 | 無CAS或lock | policy被覆寫 | revision／concurrency tests | P0 | lock內重讀＋CAS＋atomic write |
| Audit被竄改仍可寫 | 無chain validation | 無法追溯 | corrupt hash tests | P0 | load驗證chain，失敗鎖寫與deny |
| Local dev header在非local環境可用 | adapter條件過寬 | 偽造管理者 | non-loopback／preview／mode tests | P0 | development serve＋loopback雙gate |
| Governance store保存AI-PDM交易 | domain boundary漂移 | 雙寫、兩套稽核 | source／serialized fixture scan | P0 | 禁止request／workItem／decision types |
| Publish覆蓋有效policy但管理者沒看懂 | confirmation資訊不足 | 大範圍權限變動 | UI publish flow | P1 | 影響摘要、reason、blocker、二次確認 |
| Revision conflict自動覆蓋 | client retry／last-write-wins | 他人變更遺失 | API＋UI conflict flow | P1 | 保留表單、reload、不得自動retry |
| Error顯示raw HTTP／API route | error mapping不足 | 管理者無法恢復 | visible-error sweep | P1 | 人類訊息＋就近恢復，不顯示route |
| Mobile drawer／modal破版 | scroll owner／fixed overlay錯誤 | 無法完成管理 | 390x844 interaction QC | P1 | full-width detail、focus／scroll驗證 |
| Catalog fixture與AI-PDM漂移 | 手動snapshot過期 | future adapter不相容 | source hash comparison | P1 | Phase 3 contract drift gate，不自動同步 |
| JSON store被誤當production ready | 文件／UI邊界不清 | 錯誤上線決策 | label／docs／release gate review | P1 | 一次性local sandbox標示與release stop |

## 4. Automatic test matrix

### 4.1 Data, validation and commands

- GV-DATA-001：empty root建立safe V1 seed；AI-PDM role templates沒有預設外部grant。
- GV-DATA-002：相同issuer＋subject active重複拒絕；相同issuer＋employee active重複拒絕；不同issuer可並存。
- GV-DATA-003：email／name不參與UID比較；subject case-sensitive。
- GV-DATA-004：role／permission code建立後不可改；inactive reference不可新增assignment／grant。
- GV-DATA-005：scope global／exact合法；缺value、空value、未知kind拒絕。
- GV-DATA-006：assignment／delegation時間、from=to、revoked reuse拒絕。
- GV-DATA-007：active approval policy有效期間重疊拒絕；quorum 0／10、unknown sequence/self behavior拒絕。
- GV-DATA-008：所有missing／dangling reference與unknown command原子拒絕。

### 4.2 Store, audit and recovery

- GV-STORE-001：repeat init不重建、不新增audit、不改revision。
- GV-STORE-002：相同expected revision成功；stale revision回conflict且bytes不變。
- GV-STORE-003：相同commandId＋相同commandHash回replayed且不重複effect／audit；不同payload hash conflict。
- GV-STORE-004：parallel mutation serialization，只有一筆可用同一revision成功。
- GV-STORE-005：temp write讀回驗證、current→previous、rename後revision一致；成功後無本次temp殘留。
- GV-STORE-006：write／rename failure保留current；不誤刪未知tmp或organization data。
- GV-STORE-007：audit chain正常；修改event body／hash／order後read與write fail closed。
- GV-STORE-008：unsupported schema與invalid JSON不自動reset；current／previous bytes保留。
- GV-STORE-009：published policy／organization snapshot不可由draft command in-place修改。

### 4.3 Permission evaluator

- GV-PERM-001：無active policy、unknown／inactive／expired identity全部deny。
- GV-PERM-002：matching role＋allow＋global／exact scope允許並回完整receipt。
- GV-PERM-003：matching explicit deny優先於任意allow。
- GV-PERM-004：scope kind／value mismatch、expired／revoked assignment deny。
- GV-PERM-005：valid single-level delegation allow；expired、revoked、wrong permission／scope與recursive delegate deny。
- GV-PERM-006：draft改動不影響active結果；新publish後才改變。
- GV-PERM-007：historical reactivate恢復該snapshot結果；revoke後全部deny。
- GV-PERM-008：API預設server time；只有development loopback simulator接受asOf並標示local-simulator。

### 4.4 Reviewer resolver

- GV-REV-001：application role、organization role、explicit employee與unique direct supervisor各自解析。
- GV-REV-002：主職缺失、root、vacant、multiple assignees與self-only回對應unresolved。
- GV-REV-003：candidate沒有active identity link被移除。
- GV-REV-004：valid delegation加入delegate並保留來源；去重後計算quorum。
- GV-REV-005：requestor移除後再算quorum；不足回`INSUFFICIENT_REVIEWERS`。
- GV-REV-006：exact scope優先於global；同specificity policy conflict unresolved。
- GV-REV-007：serialized governance document不出現approval request／work item／decision／apply state。
- GV-REV-008：reviewer只解析requestor同issuer的active link；不同issuer不猜測mapping。

### 4.5 API and identity adapter

- GV-API-001：session／GET／PATCH／publish／version／active／audit／evaluation routes與method allowlist。
- GV-API-002：malformed JSON、1 MiB limit、strict payload、unknown route、revision header／body一致。
- GV-API-003：401／403／404／409／413／422／500／503 mapping；domain deny仍200。
- GV-API-004：Cache-Control no-store；response與log不包含token、password、MFA secret或完整subject。
- GV-API-004A：management identity view只回subjectHint／fingerprint；create command不echo完整subject。
- GV-API-005：development serve＋loopback接受dev identity；preview／production mode或non-loopback拒絕。
- GV-API-006：無active policy時bootstrap可編輯draft／進入recovery；沒有linked publish role不可首次publish，reactivate target snapshot也必須含actor publish permission。

## 5. Browser and user-flow cases

| ID | 前置 | 操作 | 預期 | Evidence |
| --- | --- | --- | --- | --- |
| GV-UI-001 | fresh V1 | Toolbar開治理中心 | 5秒內可辨識主表、active/draft與publish；一次性本機沙盒標示 | 三viewport screenshot、focus |
| GV-UI-002 | empty identity | 建local-admin identity＋admin assignment | 欄位驗證就近；成功只更新相關列與revision | interaction log／screenshot |
| GV-UI-003 | role catalog | 設allow／deny與scope | 三態清楚，high-risk非僅顏色；無隱含組織角色grant | role matrix screenshot |
| GV-UI-004 | valid draft | publish | modal顯示organization version、counts、blockers、reason；成功active version更新 | confirm＋result screenshot |
| GV-UI-005 | invalid draft | publish | CTA disabled；blocker定位到record；無partial write | alert text、API bytes evidence |
| GV-UI-006 | stale revision | 保存command | 不覆蓋；保留表單；可reload | conflict screenshot |
| GV-UI-007 | active policy | permission simulator allow／deny | receipt版本可見於details；明示不建立工作項 | result screenshot |
| GV-UI-008 | reviewer policies | resolved、自審only、quorum不足 | candidates或人類可理解unresolved原因 | results screenshot |
| GV-UI-009 | active policy | revoke，再reactivate | 二次確認＋reason；revoke後deny，reactivate恢復 | before／after evidence |
| GV-UI-010 | audit/history | 開drawer、切row、Escape | main context保留，drawer scroll／focus正確 | keyboard／viewport evidence |
| GV-UI-011 | provider/store error fixture | hard reload | locked/error就近顯示恢復，無raw HTTP／route | visible-error sweep |

## 6. QC viewport and visible-error gate

必測：

- `http://localhost:5000`，1440x900、1024x768、390x844。
- Center loading／normal／empty／validation error／conflict／publish confirm／simulator result／revoke後no-active。
- 無document/body非預期水平overflow、重疊、裁切、斷裂、浮層超界、按鈕被擠壓或不明scroll chaining。
- Toolbar button、section navigation、row、drawer、forms、confirm modal與simulator全部可用keyboard操作；focus trap／restore與Escape priority正確。
- 正常流程DOM不存在可見`.inline-error`、`[role=alert]`、HTTP 4xx／5xx、Not Found、Internal Server Error或`/api/`字串；error fixture的alert只呈現可理解影響與恢復。
- 主畫面無DEV ID、raw hash、fixture、ledger、sourceId、API route或逐列固定「下一步」；audit技術資訊只在advanced details。

Screenshot paths：

- `output/playwright/dev-027/governance-1440x900.png`
- `output/playwright/dev-027/governance-1024x768.png`
- `output/playwright/dev-027/governance-390x844.png`
- `output/playwright/dev-027/governance-publish-confirm.png`
- `output/playwright/dev-027/governance-simulator-results.png`

## 7. Commands

```powershell
npm test -- --run
npm run build
npx vitest run src/governance/validation.test.ts src/governance/commands.test.ts server/orgmasterGovernanceStore.test.ts server/orgmasterGovernanceApi.test.ts
npx vitest run src/governance/evaluatePermission.test.ts src/governance/resolveReviewers.test.ts src/panelDismissal.test.ts
```

Browser QC臨時runtime若由本任務啟動，完成前只停止該verified process tree並確認其port釋放；不得停止／重啟protected `127.0.0.1:4173`，清理後還要確認4173仍可達。

## 8. Pass, fail and evidence

- `通過`：G0–G4全部通過；automated output、build、API／store artifacts、三viewport screenshots、visible-error／information-noise sweep與security boundary共同支持契約。
- `未通過`：任一P0、targeted/full test、build、publish／revoke、fail-closed、audit chain、data boundary或主要viewport失敗。
- `未充分驗證`：缺真實browser、必要error／recovery state、viewport、screenshot、runtime來源或security negative evidence。
- `阻塞`：baseline既有失敗、無法啟動local runtime、canonical data已corrupt、需要AI-PDM／production IAM／remote DB修改或需要使用者改變ADR-007／2A。

失敗 evidence至少記錄：case ID、環境／artifact、前置資料、重現步驟、expected、actual、第一個有效error、response／hash／screenshot path與回送RD範圍。

## 9. Completed evidence (2026-08-18)

- G0：baseline `npm test -- --run` 158 tests passed；`npm run build` passed。
- G1/G2：governance targeted gate 6 files／9 tests passed；涵蓋 V1 seed、audit chain、identity／role grant、active policy fail-closed、permission evaluator、reviewer resolver 與 loopback identity adapter。
- G3：full regression `npm test -- --run` 167 tests passed；build 再次通過。API smoke verified session、no-header 401、draft CAS mutation、publish、permission allow、revoke／reactivate、audit chain and sanitized subject response。
- G4：real browser QC 使用 temporary OrgMaster runtime `localhost:5001`（既有 `localhost:5000` runtime 保留）；1440×900、1024×768、390×844 通過，console errors 0，mobile horizontal overflow false，治理入口／測試器／發布確認與 Escape 關閉通過。
- Artifacts：`output/playwright/dev-027/governance-1440x900.png`、`governance-1024x768.png`、`governance-390x844.png`、`governance-publish-confirm.png`、`governance-simulator-results.png`。
- Boundary：未修改 `C:\VIBE CODING\AI_PDM`；production IAM／DB、cross-repo adapter、deploy 與 release 仍是 Phase 3／4 gate。Temporary runtime port 5001 已釋放；protected 4173 未操作。

## 10. Recovery evidence (2026-08-26 / DEV-035)

- 觸發原因：normal governance UI 顯示 raw `GOVERNANCE_VALIDATION_FAILED` 且與舊 success 並存，角色指派與安全發布流程不可由 UI 完成；因此 DEV-027 QC 被重新開啟。
- Automated：`npx tsc --noEmit` passed；governance targeted 7 files／18 tests passed；full regression 60 files／271 tests passed；`npm run build` passed。
- Server negative：publish／historical reactivation 都要求目前 actor 同時保留 manage＋publish；explicit deny precedence、missing permission 與 non-500 status mapping 有測試。
- Browser：正常 toolbar delivery path 完成 identity、global role assignment、reload、revoke／reactivate、publish blockers、mandatory reason 與 Policy v1；two-session stale operation 顯示人類 conflict 與 reload recovery，無 raw code／假成功。
- Responsive／overlay：1440×900、1024×768、390×844 無 body 水平 overflow；手機 mutation action count 0；Escape 依序關 modal、drawer、center；normal flow console 0 error／0 warning。
- Evidence：`output/playwright/dev035/manifest.md` 與五張 screenshots。隔離 runtime port 5002 已釋放；canonical port 5000 保留且 HTTP 200。
- Boundary：只修改 OrgMaster；AI-PDM、production IAM／DB、deploy 與 release 均未修改或執行。

## 11. Evidence reuse boundary after ADR-007（2026-08-27）

- DEV-027／035 的 automated、API 與 browser evidence 只證明原 local V1 的角色／Permission／reviewer sandbox 與安全發布流程。
- 新目標屬權限 ownership、UI 能力與跨系統契約變更，風險等級為 High；DEV-037 已達 `RD Implementation Ready / RD Not Started`，並由 `ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md` 固定 executable matrix 與 evidence path。不能用本計畫的舊 permission evaluator、Permission Matrix domain command 或 reviewer resolver evidence 直接判定通過。
- DEV-037 至少需驗證：外部 catalog 唯讀、外部 role／permission mutation 不可達、stable role ID assignment、unknown／inactive／unassignable／stale catalog fail closed、未串接時顯示未生效，以及既有 published V1 歷史資料仍可讀。
- AI-PDM live effect 只有在 Phase 3 integration 具備正常 delivery path、目標角色、來源 catalog version、assignment receipt 與 AI-PDM enforcement evidence 後才能驗收。
