# DEV-043：員工明細登入身分與帳號治理入口

文件成熟度：`RD Implementation Ready`

狀態：`RD Implementation Complete / RD Technical Lead Passed / Targeted Gates Passed / Browser QA-QC Passed / Full Regression Follow-up Open`

決策來源：

- `USER-2026-09-03-EMPLOYEE-SOURCE-OF-TRUTH`
- `USER-2026-09-03-EMPLOYEE-IDENTITY-UI-PLACEMENT`
- `USER-2026-09-03-DEV043-DOCUMENT-REVIEW-IMPLEMENT`

父契約：

- [DEV-040](DEV-040-jenfu-platform-entitlement-user-integration.md)：Employee、identity link、principal admission 與 IAM 邊界。
- [DEV-042](DEV-042-single-layer-workspace-contract.md)：員工清單與相鄰可收合明細。
- [ADR-007](../adr/ADR-007-external-role-catalog-assignment-boundary.md)：OrgMaster 為 principal mapping 與角色指派治理權威，共同 IAM 為 authentication authority。

## 1. 真正需求

OrgMaster 已是 Employee 唯一真相來源，但目前 Employee 明細只呈現部門、任職與直屬主管；登入身分只能從「角色指派治理 → 身分連結」的全域表格查看與修改。使用者處理「某位員工有哪些登入身分」時，必須離開 Employee 上下文再重新選人，且全域表格容易被誤解為與員工平行的第二份帳號主檔。

Current Phase 必須讓管理者從員工清單選定 Employee 後，直接在相鄰明細查看與管理其 identity links；全域治理入口只保留跨員工檢視、異常定位與進入 Employee 明細的用途。兩個 UI 都只投影同一份 governance document，不建立第二 store、帳號主檔或瀏覽器快取權威。

## 2. Human-confirmed Product Contract

- Employee 清單與 Employee ID 是人員唯一真相來源。
- 主要入口固定為「員工清單 → 員工明細 → 登入身分」。
- 「角色指派治理 → 身分連結」改名為「帳號治理」，作跨員工檢視與異常入口。
- 不在左側／頂部建立與員工平行的獨立「帳號」主資料模組。
- OrgMaster 只保存 Employee ↔ identity 關係、狀態與治理稽核；密碼、MFA、recovery 與 authentication 仍由共同 IAM 擁有。

## 3. Current Phase Scope

風險等級：`Medium`。本任務新增使用者入口與治理 mutation UI，並跨 Employee UI、governance API、permission 與 V3 governance document。

### 3.1 In scope

1. Employee 明細新增「登入身分」區段，列出該 Employee 的 identity links。
2. 每列只顯示完成判斷必要資訊：redacted principal hint、issuer、帳號類型與有效／停用狀態。
3. 具 `orgmaster.governance.manage`、桌面 mutation capability 且目前登入身分尚未連結時，可在選定的 active Employee 明細執行「連結目前登入身分」。
4. Browser 只提交 `employeeId`、`expectedRevision`、`commandId`；server 從 verified actor 取得 `principalId + issuer + subject`，不得接受 browser 提供 raw subject。
5. 未被 active principal admission 使用、且不是目前verified actor本身的 identity link，可在 Employee 明細啟用／停用；已有 active admission 或目前actor自己的 active link在本階段只讀，避免留下downstream不一致或自我鎖定。inactive current link只可走server-derived current identity endpoint重新啟用。
6. 全域治理 section route key 維持 `identity`，可見名稱改為「帳號治理」。Employee 欄位改成可操作名稱，啟動或聚焦員工面板並開啟該 Employee 明細。
7. Employee 明細與治理中心同時開啟時，成功 mutation 後由 App owner 的單一 refresh revision token 讓兩個投影重新讀取 canonical governance state。
8. 正常、載入、空白、錯誤、權限拒絕、active-admission 只讀、窄版與鍵盤流程的 targeted tests 與 browser QC。

### 3.2 Out of scope

- 建立、邀請、刪除、停用或搜尋 Firebase／Google Workspace／Cloud Identity 帳號。
- 讓 browser 輸入或顯示 raw `subject`、完整 fingerprint、token、cookie、密碼或 MFA 資料。
- 任意把一個已連結的 human identity 改綁到另一 Employee。
- 在本 UI 建立／修改 `principalAdmissions`、account taxonomy、shared-account retirement、management grants 或 application role assignments。
- production identity reconciliation、3 human + 1 legacy shared owner gate、Cloud SQL authority switch、deploy 或 release。
- 新增 schema、migration、第二 governance document、client event bus 或帳號主資料 module。

上述正式 IAM provisioning／reconciliation 只有在 provider directory、owner gate 與 production release boundary 可用時，才回到 DEV-040 另補 Current Phase contract；不阻塞 DEV-043 local product completion。

後續銜接（2026-09-04）：使用者已將「由Employee明細發起邀請新帳號／連結既有帳號」升級為DEV-045 `RD Implementation Ready / Documents Only / Local-Isolated Current Phase / Production Provisioning Gated`，權威契約為[DEV-045](DEV-045-employee-account-enrollment.md)。DEV-045是本節Out of scope的compatible future successor，不回開DEV-043完成狀態或當時的B1～B7證據；Current Phase只交付local／isolated enrollment foundation，OrgMaster治理與編排，共同IAM／provider仍是正式帳號、credential、驗證與authentication authority。DEV-045啟用前，「連結目前登入身分」與現有endpoint仍代表DEV-043既有能力；啟用後則由account-enrollment API成為identity link建立／重新啟用／狀態變更的唯一產品HTTP寫入入口，`POST /api/orgmaster/governance/identity-links/current`與generic `UPSERT_IDENTITY_LINK`／`SET_IDENTITY_LINK_STATUS` HTTP mutations固定回409 `IDENTITY_ACCOUNT_FLOW_REQUIRED`且零mutation。Server-internal `applyDraftCommand`仍是canonical governance store boundary，由DEV-045共用policy與service呼叫；這是intentional successor surface replacement，不是第二條store path，也不得被解讀為可替其他Employee建立、搜尋或邀請帳號。

## 4. 不可變資料與權責

```text
Employee (organization workspace authority)
  └─ GovernanceIdentityLinkV1[] (governance authority)
       └─ GovernancePrincipalAdmissionV1? (taxonomy/admission authority)
            └─ role assignment / management grant consumers
```

- Employee 明細以 `employee.id` join `draft.identityLinks[].employeeId`。
- 帳號類型只由 `draft.principalAdmissions[].identityLinkId` 取得；找不到時顯示「未分類」，不得以 issuer、名稱或 Email 猜測。
- 一個 active `issuer + subject` 只能連一名 Employee；同一 Employee 可以有多個 person-specific identities。
- identity link、admission、role assignment 與 grant 的 canonical bytes 仍只在 governance store；UI local state只保存 loading／error／busy 與最近讀取 revision。
- organization current／draft 編輯模式不控制 identity governance；mutation gate 由 verified session capability、DEV-033 desktop boundary 與 server permission共同決定。

## 5. UX Intent

- 任務／結果：管理者由 Employee 找到其登入身分，能安全連結目前身分或管理未被 admission 使用的 link。
- 主物件／主焦點：選定 Employee；明細內「登入身分」是 Employee 關係的一個區段，不是第二個主檔。
- 預設刪除：帳號摘要卡、教學文案、獨立帳號 launcher、raw identity metadata、每列「查看」欄及重複狀態 badge。
- 保留舉證：redacted hint用來區分同一 Employee 的多個 identity；issuer用來辨識來源；account type用來避免把 personal／privileged／unclassified 混用；狀態文字讓資訊不只靠顏色。
- 非語言修復：Employee 名稱作全域表格的 detail 入口；列層級、間距與單一 quiet action表達關係，不加卡片包卡片。
- 風險與驗證：raw identity不得進 DOM；active admission link 不顯示停用控制；mutation失敗就地保留資料並提供重新載入；桌面與窄版皆無水平溢出。

## 6. UI Entry Contract

### 6.1 Employee primary entry

- Target actor：已登入且可閱讀 Employee 的使用者；mutation另要求 governance manage capability 與 DEV-033 desktop capability。
- Normal start：頂部功能選單開啟「員工」→ 點選員工列。
- Destination：既有相鄰 Employee detail，區段順序固定為「部門與任職 → 直屬主管路徑 → 登入身分」。
- Loading：只在「登入身分」區段顯示局部載入狀態，不遮住 Employee 其他資料。
- Empty：顯示「尚未連結登入身分」；可 mutation且current identity未連結時，唯一主要動作為「連結目前登入身分」。
- Normal rows：redacted hint為主要辨識值；issuer與帳號類型為次要值；狀態使用「有效／停用」文字。
- Mutation：未 admission且不是目前actor的 row只提供一個quiet「停用／重新啟用」；active admission與目前actor active row不顯示mutation action。current actor inactive row只顯示「重新啟用目前登入身分」。
- Failure：區段內顯示最短原因與「重新載入」，不得用全頁錯誤取代 Employee detail。
- Mobile／narrow：完整可讀但沒有 mutation controls；row自然換行，不以水平表格壓縮。

### 6.2 Global account-governance entry

- Normal start：頂部功能選單開啟「角色指派治理」→「帳號治理」。
- Route compatibility：`governanceSection=identity` 保留，既有 deep link不失效；只改可見 label。
- Table purpose：跨 Employee 檢視 links 與狀態。Employee 名稱本身是唯一 detail CTA，不另加「查看」欄。
- Selecting Employee：呼叫 App 的 workspace controller，open-or-focus `employees`，寫入 `{ employeeId, query }` context，開啟 detail並保留 governance panel。
- 本階段不在全域頁重複「選 Employee → 連結目前身分」表單；建立入口只在已選定 Employee 的明細，避免第二條人員選擇流程。

### 6.3 Current identity action matrix

| Current verified identity state | Selected Employee | UI result | Server result |
|---|---|---|---|
| 尚無任何 link | active | 顯示「連結目前登入身分」 | 建立 active link |
| 已連同一 Employee、link active | same active Employee | 不顯示重複 CTA，顯示既有 row | idempotent noop |
| 已連同一 Employee、link inactive | same active Employee | 顯示「重新啟用目前登入身分」 | 同 ID 重新啟用 |
| 已連其他 Employee | any | 不顯示可改綁 CTA，顯示衝突說明 | `409 IDENTITY_LINK_CONFLICT` |
| 任一 key 對到不同 links | any | 不提供 mutation捷徑 | `409 IDENTITY_LINK_CONFLICT` |
| 尚無 link | inactive Employee | 無 mutation control | `422 EMPLOYEE_NOT_ACTIVE` |

Client可用sanitized `principalId`判斷action state，但server必須重新以verified actor的`principalId + issuer + subject`判斷；client判斷不能成為授權或唯一性來源。

## 7. API Contract

### 7.1 Read

沿用：

- `GET /api/orgmaster/governance`
- `GET /api/orgmaster/governance/session`

Read response 必須維持 identity subject redaction。`GovernanceApiSnapshot.document.draft.identityLinks` 的 client view只含 `subjectHint`／short fingerprint，不含 raw `subject`。

### 7.2 Link current verified identity

新增：

```http
POST /api/orgmaster/governance/identity-links/current
Content-Type: application/json

{
  "expectedRevision": "<governance revision>",
  "commandId": "<uuid>",
  "employeeId": "<canonical employee uuidv7>"
}
```

Server 固定執行：

1. 取得 verified governance actor；development只允許既有 loopback dev identity fallback。
2. 驗證 actor具 `orgmaster.governance.manage`。
3. 驗證 expected revision與 current governance revision一致。
4. 驗證 target Employee存在且 `status=active`。
5. 以 actor的 exact `issuer + subject` 與 `principalId` 搜尋既有 link：
   - 無既有 link：建立 active link。
   - 同一 Employee 的既有 inactive link：以同一 link ID重新啟用，保留最初 `validFrom`。
   - 同一 Employee 已 active：回 `noop`。
   - 任一 key已屬另一 Employee，或 principal／issuer-subject對到不同 links：回 `409 IDENTITY_LINK_CONFLICT`，零 mutation。
6. 以既有 `UPSERT_IDENTITY_LINK` audit語意保存；response回 sanitized document與新 revision。

Endpoint只負責把verified actor轉成既有`UPSERT_IDENTITY_LINK` command，實際CAS、lock、command idempotency、validation、audit與persistence一律重用`applyDraftCommand`；不得新增第二條store mutation path。

Browser不得傳 `principalId`、issuer、subject或validity；server不得以 email、姓名或 employeeNumber猜測 identity。

### 7.3 Status mutation

未被 active admission引用的 link沿用：

```text
PATCH /api/orgmaster/governance/draft
SET_IDENTITY_LINK_STATUS
```

Client在顯示控制前先以 current draft join admission；server仍以 current state重新驗證。若 state已改變、revision衝突或形成 admission／grant／assignment不一致，必須 fail closed，client重新讀取，不得樂觀留下成功狀態。

### 7.4 Error mapping

| Code | HTTP | UI |
|---|---:|---|
| `GOVERNANCE_ADMIN_REQUIRED` | 403 | 移除 mutation controls；保留唯讀資料 |
| `EMPLOYEE_NOT_FOUND` | 404 | 關閉失效明細或提示重新載入 Employee |
| `EMPLOYEE_NOT_ACTIVE` | 422 | 顯示「停用員工不能連結登入身分」 |
| `IDENTITY_LINK_CONFLICT` | 409 | 顯示「此登入身分已連結其他員工」 |
| `IDENTITY_LINK_NOT_FOUND` | 404 | 重讀Employee明細並移除失效row |
| `IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN` | 422 | 先處理該身分的有效准入，再停用link |
| `SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN` | 422 | 顯示「不能停用目前登入身分」 |
| `REVISION_CONFLICT` | 409 | 重新讀取後保留目前 Employee 上下文 |
| `GOVERNANCE_READ_FAILED` | 500 | 區段內顯示讀取失敗與重新載入 |

## 8. Client State and Synchronization

- 新增 `EmployeeIdentitySection`，只負責 Employee-scoped projection、read／mutation state與就地回饋。
- `DirectoryDetailPanel`只傳 `employeeId`、desktop mutation boundary、refresh token與changed callback，不持有 raw identity或治理 revision。
- `GovernanceCenter`保留既有完整治理 workspace state；identity section可見名稱與 Employee CTA調整，不建立第二 identity store。
- `App`持有單一遞增 `governanceRefreshToken`。Employee identity或GovernanceCenter mutation成功後呼叫同一 callback；兩個讀取元件在token變更時重新讀 canonical API。
- 不使用DOM custom event、BroadcastChannel、global singleton或另一個 client cache。
- `identityMutationAllowed = workspaceMutationAllowed && session.capabilities.manage && employee.status === 'active'`；不得依賴role catalog ready，避免帳號關係被不相干的catalog availability阻塞。

## 9. Permission and Safety Contract

- Client hidden／disabled只是 UX；server `canManage`仍是 mutation authority。
- DEV-033：小於1024px、無hover或非fine pointer時 mutation controls不得呈現，API仍須拒絕未授權actor。
- Employee organization version為唯讀不阻擋獨立 governance mutation；但停用 Employee一律不能建立新 link。
- raw subject、完整 fingerprint、token、cookie不得出現在response、URL、DOM、console、screenshot或test artifact。
- 共用帳號、legacy shared與service admission不進 Employee relationship list，因其`identityLinkId=null`；不得為了顯示而綁Employee。

## 10. File Boundary

### Production

- `src/components/EmployeeIdentitySection.tsx`（新增）
- `src/components/DirectoryDetailPanel.tsx`
- `src/components/GovernanceCenter.tsx`
- `src/components/GovernanceCenter.css`
- `src/index.css`
- `src/App.tsx`
- `src/governance/apiClient.ts`
- `src/governance/validation.ts`
- `server/orgmasterGovernanceApi.ts`
- `server/orgmasterGovernanceStore.ts`

### Tests

- `src/components/EmployeeIdentitySection.test.tsx`（新增）
- `src/components/DirectoryDetailPanel.test.tsx`
- `src/governance/validation.test.ts`
- `server/orgmasterGovernanceApi.test.ts`
- 必要時相鄰 workspace／GovernanceCenter component test；不得建立第二 browser runner。

### Documents

- `ai-doc/specs/DEV-043-employee-identity-link-management.md`
- `ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md`（UI Entry amendment）
- `ai-doc/dev_task.md`
- `ai-doc/documentation_map.md`

不修改 organization schema、governance schema、DB migration、provider config、production data、contracts或跨repository檔案。

## 11. Failure Recovery

- Read失敗：Employee其他明細維持可讀；identity section可局部重試。
- Mutation request失敗或response loss：不得先改local canonical rows；重新 GET governance，以 command ID audit／readback決定結果。
- Revision conflict：重新讀取後維持 Employee selection；使用者重新觸發動作。
- Link conflict：零 mutation，不提供覆寫或改綁捷徑。
- UI component unmount／Employee切換：忽略舊request結果，不能把上一位Employee links畫到新 Employee。
- Server validation發現active admission或其他downstream invariant：status mutation失敗並保留原狀；本任務不做cascade revoke。

## 12. QA／QC Contract

### 12.1 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| Identity顯示在錯誤Employee | request競態或錯誤join | 誤判帳號歸屬 | 快速切換兩員工、延遲first response | P0 | active request guard＋employeeId join |
| 同一identity連到兩Employee | server只信client或缺唯一檢查 | 越權與稽核失真 | existing link conflict integration test | P0 | server-derived actor＋409 zero mutation |
| Raw subject出現在DOM／log | 直接重用server model | 個資與安全暴露 | response／DOM／console forbidden scan | P0 | sanitized view only |
| Active admission link被直接停用 | UI只看link、不看admission | grant／assignment不一致 | admitted fixture | P1 | 不呈現控制＋server fail closed |
| Employee與治理畫面不同步 | 各自保存stale local snapshot | 管理者看到矛盾狀態 | side-by-side mutation case | P1 | App refresh token重讀canonical API |
| 窄版仍可寫入或水平溢出 | mutation boundary／row layout缺漏 | 違反手機唯讀 | 390×844、1024×768、1440×900 | P1 | control absent＋wrap／overflow check |
| 看似成功但API失敗 | optimistic UI | 錯誤判定 | 409／500 injection | P1 | commit後readback；錯誤就地顯示 |

### 12.2 Automated cases

1. Employee detail normal：只顯示選定Employee links、redacted hint、issuer、account type、status。
2. Empty：顯示單一空白事實；有權限且current identity未連結時顯示唯一 link CTA。
3. Permission：manage=false、mobile boundary或inactive Employee都無 mutation control。
4. Admission：active human admission對應link不顯示status control；unclassified link可切換。
5. Link current API：create、same-Employee reactivate、same-Employee noop、other-Employee conflict、inactive Employee deny、revision conflict、permission deny；current actor self-deactivation拒絕。
6. Validation：active issuer+subject與principal ID不可跨Employee重複；同Employee可擁有多個不同 identities。
7. Global navigation：帳號治理 Employee name呼叫open Employee detail；route key仍是`identity`。
8. Synchronization：mutation callback bump token後兩個projection重新載入；Employee切換不套用stale response。

### 12.3 Targeted commands

```powershell
npx vitest run src/components/EmployeeIdentitySection.test.tsx src/components/DirectoryDetailPanel.test.tsx src/governance/validation.test.ts server/orgmasterGovernanceApi.test.ts
npx tsc --noEmit --pretty false
npm run build
```

完成 targeted後執行 full regression：

```powershell
npm test -- --run --pool=forks --maxWorkers=1
```

本輪標準 full regression 已完成 `185 passed / 769 tests passed / 1 skipped`；僅兩個既有 `scripts/dev010-n2-*.test.mjs` 非 Vitest test fixture 被收集後回報 `No test suite found`。排除該兩個 fixture 的功能回歸為 `184 passed / 765 tests passed / 1 skipped`；此 test-discovery cleanup 不屬 DEV-043 產品變更，另立追蹤，不阻塞本任務 local implementation。

### 12.4 Browser QC

以正常頂部功能入口執行，不能只用direct URL：

| Case | Viewport | 操作與證據 |
|---|---|---|
| B1 normal | 1440×900 | 員工 → 選Employee → 登入身分；核對redaction、type、status與無可見error |
| B2 global | 1440×900 | 角色指派治理 → 帳號治理 → Employee name；員工panel open-or-focus且detail開啟 |
| B3 side-by-side | 1440×900 | 兩panel同時可見；同步 callback／重新載入由 automated case 驗證，current actor read-only fixture不強行改綁 |
| B4 compact desktop | 1024×768 | rows可讀、action不擠壓、無水平overflow |
| B5 mobile | 390×844 | identity可讀、mutation controls為0、無水平overflow |
| B6 error | 1440×900 | 注入409或read failure；區段就地error、Employee其他資料可用、retry恢復 |
| B7 keyboard | 1440×900 | 從Employee row以Enter／Space進detail；可操作link存在時Tab可達其action，並可達global Employee CTA，focus可見 |

每案記錄 route、viewport、資料來源、角色、操作、screenshot、console／pageerror與visible `[role=alert]` sweep。任何非預期可見 error、HTTP 4xx／5xx文字、全部關鍵count為0或raw subject洩漏皆為Fail。

## 13. RD Slices and Gates

1. `S0 Contract`：文件、DEV、map與DEV-040 UI Entry amendment一致；P0／P1 readiness gap=0。
2. `S1 API／Invariant`：server-derived current identity endpoint、unique validation與API tests通過。
3. `S2 Employee Surface`：Employee identity component、DirectoryDetailPanel接線、loading／empty／error／permission tests通過。
4. `S3 Global Navigation／Sync`：帳號治理label、Employee CTA與App refresh token通過。
5. `S4 Aggregate QC`：targeted、typecheck、build、B1～B7 browser QC與排除既有非 Vitest fixture 的功能回歸通過；標準 full regression 的兩個 test-discovery failure 已留在獨立 follow-up，task-owned runtime與port完成清理。

第一個P0/P1失敗、raw identity暴露、權限繞過、需要修改schema／provider／production data或越出allowlist時停止，回到RD／PM；不得以縮減驗收或改文件取得Pass。

## 14. RD Readiness Result

- Human product decisions：已由本輪確認，無缺口。
- Data／schema：重用V3 governance document，無migration。
- API：current verified identity link endpoint與錯誤契約已固定。
- Permission：client capability＋server `canManage`＋DEV-033 desktop boundary已固定。
- Failure recovery：read、revision、response loss、conflict與admission dependency已固定。
- UI Entry／evidence：normal entry、global entry、三viewport、visible-error與keyboard gate已固定。
- P0 readiness gap：`0`。
- P1 readiness gap：`0`。
- Release boundary：本任務只做local product implementation與QA/QC；production identity／deploy／release不在執行邊界。

判定：`RD Implementation Complete / RD Technical Lead Passed / Targeted Gates Passed / Browser QA-QC Passed`；標準 full regression 的既有 test-discovery follow-up 不改變 DEV-043 產品結果。

## 15. RD Technical Lead Review（2026-09-03）

- 結論：`Pass after contract optimization`。
- 根因判斷：真正問題不是缺少一個「帳號管理」模組，而是Employee關係缺少就地治理入口；若新增平行帳號主檔，反而產生Employee選擇、狀態同步與資料權威三套重複責任。
- 架構收斂：Employee維持主物件；identity link是Employee relation；全域「帳號治理」只作跨員工索引與異常入口。兩個surface只讀同一governance document，mutation只走既有store command boundary。
- 安全優化：browser不得提交raw identity；新增endpoint只把verified actor轉成既有command。current identity的create／noop／reactivate／conflict狀態矩陣已固定，避免RD自行推測改綁語意。
- 依賴解耦：identity mutation不依賴application role catalog ready；只依賴desktop mutation boundary、manage capability、Employee active與server validation。
- 技術債判定：DEV-043不新增schema、provider adapter、event bus、global cache或第二store；任意IAM帳號搜尋／邀請的local／isolated successor contract由DEV-045承接，正式共同IAM provider、Email與production release仍留在DEV-040 gate，不以本地fixture包裝成正式能力。
- Readiness：P0 gap=`0`；P1 gap=`0`；無需新增ADR，因權威邊界已由ADR-007、DEV-040與DEV-042覆蓋。
