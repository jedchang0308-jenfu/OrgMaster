# DEV-037：外部角色目錄與角色指派治理契約

文件成熟度：`RD Implementation Complete / QA-QC Passed / Human Confirmed / Intentional Replacement / Local Release Gate Pending / OrgMaster Only`
狀態：已完成 OrgMaster Current Phase；未授權修改 AI-PDM、deploy 或 release
節點類型：開發點
優先級：P0
風險等級：High
日期：2026-08-27
來源 ID：`USER-2026-08-27-EXTERNAL-ROLE-CATALOG-ASSIGNMENT-BOUNDARY`
父交付點：DEV-027
架構決策：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md`、`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`

## 2026-08-30 Compatibility Amendment

`DEV-037` 的完成狀態與 fresh evidence 只證明 2026-08-27 的 OrgMaster local-only V2 delivery，不證明 Jenfu Platform live integration。使用者後續確認 `4A / 5A / 6B`：Phase 1 改由 versioned read-only access view 發布有效指派；AI-PDM 既有 Firebase principal 納入 active employee migration；外部角色由授權角色管理者直接生效，不另設 high-risk maker-checker。新目標由 `DEV-040` 與 ADR-007 amendment 追蹤。

本修訂不回寫既有 V1／V2 bytes、published snapshot、audit、程式或 QA 結果。下文的 `local-only`、`not-synchronized`、`publish-as-approval` 與 high-risk 檢查仍是 DEV-037 當時驗收語意；RD 不得只修改這些歷史敘述後宣稱 live integration 已完成。

## 1. Outcome

OrgMaster 成為外部 Application Role 的集中指派治理端，但不成為外部 Permission 設計器：

- 外部系統定義角色代表什麼、具備哪些 Permission、如何執行領域審核及最終 enforcement。
- OrgMaster 以具來源與版本的唯讀角色目錄，治理「哪位員工在何種 scope、何段期間取得哪個角色，以及誰發布／撤銷這項指派」。
- Current Phase 只在 OrgMaster 建立可驗證的 local assignment governance；AI-PDM 不修改，任何結果都不得宣稱已在 AI-PDM 生效。
- DEV-027／035 的 local V1 role／permission／grant／approval policy 與發布歷史保持可讀，作為 migration baseline，不被重寫或刪除。

本文件已固定 RD 可直接開始修改程式所需的 repo／file allowlist、V2 schema、catalog manifest、command／API signatures、migration／recovery、UI 欄位矩陣、S1～S4 gate、測試命令與 evidence path。它仍不是 Release Ready，不包含 merge、PR、deploy、production rollback 或 production smoke artifact。

## 2. Human Decision Brief

- `Human Confirmed / 2026-08-27`：每個外部系統自行擁有 Application Role、Permission、Role-Permission mapping 與領域審核政策。
- `Human Confirmed`：OrgMaster 擁有 principal mapping、employee-to-role assignment、scope、有效期間、撤銷／重新啟用、角色代理、指派發布與 governance-change audit。
- `Human Confirmed / 2A retained`：正式身分使用共用 IAM 的不可變 `issuer + subject UID`；OrgMaster 不保存密碼或 MFA secret。
- `Human Confirmed`：目前只修改 OrgMaster；`C:\VIBE CODING\AI_PDM` 保持不變。
- `Intentional Replacement`：ADR-007 已取代 ADR-004／DEV-027 對「OrgMaster 可編輯外部 role／permission／領域 approval policy」的目標權威；歷史 local V1 delivery 不回寫。

## 3. Spec Impact Preflight

判定：`No unresolved conflict / Implementation contract maturation`。

- 本契約落實 ADR-007 已接受的權責，不新增相反產品方向。
- DEV-027／035 的 completed local V1 程式與證據只保留歷史語意；不得被本文件重新標示為 DEV-037 完成證據。
- ADR-005 的獨立 governance store、CAS／idempotency 與 immutable published snapshot 原則繼續有效。
- AI-PDM approval transaction、domain apply、transaction audit 與 authorization enforcement 仍由 AI-PDM 擁有。
- 若後續要求 OrgMaster 編輯外部 Permission 或 AI-PDM 領域 Approval Policy，屬架構權責變更，必須停止並回到 Human Decision Gate／ADR。

## 4. Responsibility Contract

| 治理事實 | 權威系統 | OrgMaster Current Phase 行為 |
|---|---|---|
| 外部 Application Role 定義、狀態、可指派性 | 外部應用 | 唯讀顯示具版本 catalog snapshot |
| 外部 Permission 與 Role-Permission mapping | 外部應用 | 不新增、不編輯、不提供 Permission Matrix |
| 外部領域審核政策、工作項、核駁與 domain apply | 外部應用 | 不持久化、不解析、不執行 |
| principal 與 employee mapping | OrgMaster | 可治理並保留不可變 IAM subject reference |
| employee-to-external-role assignment | OrgMaster | 可建立、發布、撤銷、重新啟用並稽核 |
| assignment scope、有效期間與角色代理 | OrgMaster | 可治理；受角色 catalog 宣告的 scope 能力限制 |
| 角色指派發布與 governance-change audit | OrgMaster | 可治理；Current Phase 以受權限控管的 publish 作核准事實 |
| 外部敏感操作的最終 authorization | 外部應用 | 不宣稱、不模擬為正式結果 |
| `orgmaster` 自有 role／permission 與 enforcement | OrgMaster | 保留既有自我治理能力；不屬外部 catalog mutation 禁令 |

`OrgMaster 組織職務` 與 `Application Role` 必須分開：職務描述人員在組織中的責任與匯報關係；Application Role 描述人員在某個應用中的授權身分。兩者不得使用相同 ID、同一可寫欄位或名稱比對自動互轉。

## 5. Current Architecture Impact

現行治理中心已具備獨立 local store、draft／publish、immutable versions、audit、CAS／idempotency、identity links、role assignment 與安全發布能力；但仍承載舊 1B 權威：

- AI-PDM role／permission／grant fixture 被納入可編輯 policy draft。
- API command union 仍允許外部 role、permission、grant 與 approval policy mutation。
- delegation 以 `permissionIds` 表示，與新目標「角色代理」不相容。
- permission evaluator、reviewer resolver 與 UI 的「審核規則／測試器」仍呈現舊目標語意。
- published V1 policy 保存完整 role／permission／grant／approval policy，不可直接當成新 assignment governance version。

因此 DEV-037 實作會影響 domain model、draft／publish validation、API mutation boundary、版本相容讀取、治理中心資訊架構、audit 與 targeted tests。實際檔案、signatures 與切片順序固定於第 19～26 節。

## 6. Current Phase Scope

### 6.1 In scope

- 將 AI-PDM 等外部 Application Role 轉為具來源、版本與完整性資訊的唯讀 catalog snapshot。
- 在治理中心顯示外部角色目錄，清楚標示來源、catalog version、狀態、可指派性、風險與目前只在 OrgMaster 生效的範圍。
- 建立／撤銷／重新啟用 employee-to-external-role assignment，並保存 scope、有效期間與 catalog reference。
- 將代理語意從外部 permission delegation 收斂為角色 assignment delegation。
- 透過既有 draft → validate → publish 流程核准角色指派治理變更；發布者、理由與版本進入 audit。
- 對 unknown、inactive、unassignable、invalid、missing 或 stale catalog reference fail closed。
- 保留 legacy V1 published version／audit 的唯讀可見性，並區分 legacy policy 與新 assignment governance 語意。
- 保持 OrgMaster 自有治理權限、管理者存續保護、CAS／idempotency、桌面 mutation gate 與 mobile read-only gate。

### 6.2 Out of scope

- 修改 AI-PDM 程式、schema、設定、資料或文件。
- 建立 live catalog API、push／pull／token claim adapter，或使 assignment 在 AI-PDM 生效。
- 在 OrgMaster 建立或編輯外部 role、Permission、Role-Permission mapping 或領域 Approval Policy。
- 在 OrgMaster 執行 AI-PDM permission evaluation、reviewer resolution、work item、approve／reject 或 domain apply。
- 直接刪除、就地改寫或重新簽章 legacy V1 published snapshot／audit。
- production IAM、durable database、service credential、遠端 migration、deploy、release 或 production smoke。
- 獨立的多階段／雙人角色指派審核工作流；Current Phase 的核准事實是受權限控管的 publish。若要求 maker-checker separation，須重新進入 Human Decision Gate。

## 7. Logical Data Contract

以下是必須成立的 logical contract，不是最終 TypeScript 或 persistence schema。

### 7.1 ExternalRoleCatalogSnapshot

每份外部角色目錄至少包含：

- `applicationId`：外部應用的穩定 ID。
- `catalogVersion`：可比較且不可變的目錄版本。
- `sourceKind`：Current Phase 固定為明確標示的 `bundled-fixture`；live adapter 是 Future Phase。
- `sourceRef` 與 `sourceHash`：可追溯來源及完整性摘要。
- `verifiedAt`：OrgMaster 驗證此 payload 的時間，不得解讀成已向 AI-PDM 即時確認。
- `validationState`：`valid | stale | invalid | unavailable`。
- `roles[]`：至少包含 `stableRoleId`、`code`、`displayName`、`status`、`assignable`、`riskLevel`、`allowedScopeKinds`。

Current Phase 不把外部 Permission 或 Role-Permission mapping 納入可寫 catalog contract。若 fixture 為 legacy migration 仍含 permission 資料，該資料只能作歷史相容輸入，不得顯示為可管理權限或參與 DEV-037 的正式驗收。

### 7.2 ExternalRoleAssignment

每筆指派至少能追溯：

- assignment ID；
- employee ID 與不可變 principal reference；
- application ID；
- external stable role ID 及發佈時的 role code／display snapshot；
- catalog version；
- scope kind 與 scope value；
- `validFrom`／`validTo`；
- `active | revoked` 狀態及撤銷／重新啟用事實；
- Current Phase 的 effect marker：`orgmaster-only / not-synchronized`。

assignment 必須引用同一 application 的 active、assignable role，且 scope kind 必須在 catalog 的 `allowedScopeKinds` 內。缺少必要 scope、身分衝突、期間反轉或 role reference 無法驗證時拒絕保存或發布。

### 7.3 RoleAssignmentDelegation

角色代理至少能追溯來源 assignment／role、原持有人、代理人、scope、有效期間、狀態與理由。外部角色代理不得再以外部 `permissionIds` 作權威表示；實作使用新的 `UPSERT_ROLE_DELEGATION`／`REVOKE_ROLE_DELEGATION` command，舊 `UPSERT_DELEGATION`／`REVOKE_DELEGATION` 不進 V2 mutation allowlist。

### 7.4 AssignmentGovernanceVersion

每個 immutable published version 至少能重建：

- 基準 organization version／snapshot；
- 使用的外部 catalog version／hash；
- 發布時有效與撤銷的 assignments／delegations；
- publisher、publishedAt、reason、revision／version ID；
- local-only effect marker；
- 版本類型：`legacy-policy-v1` 或 `assignment-governance`。

catalog 後續更新、組織草稿變更或員工資料修改不得靜默改寫既有 published result。

## 8. Behavior and State Contract

### 8.1 Catalog validation

- `valid`：fixture schema、stable ID、版本及 hash 完整，可建立 local-only assignment。
- `stale`：來源明確標示已被新版本取代，或同步層未來回報版本過期；既有歷史資料可讀，但不得建立、重新啟用或發布受影響 assignment。
- `invalid`：schema、hash、duplicate ID／code 或 application ownership 不一致；目錄不可用並顯示修復提示。
- `unavailable`：目錄無法載入；不可退回手動輸入 role code。

使用 bundled fixture 時，UI 必須同時顯示「本機唯讀 fixture」與「未與目標系統同步」；`valid` 只表示 OrgMaster 本機契約有效，不表示 AI-PDM 已確認或採用。

### 8.2 Assignment lifecycle

1. 管理者從 valid catalog 選擇 role，不得自由輸入外部 role ID／code。
2. 管理者選擇 employee、合法 scope 與有效期間，在治理 draft 建立 assignment。
3. draft 變更不影響 active published version。
4. publish 前重新驗證 identity、role、catalog version、scope、期間、管理權限、發布權限與管理者存續。
5. publish 成功產生 immutable assignment governance version；Current Phase 成功訊息固定為「已發布至 OrgMaster，尚未同步至目標系統」。
6. 撤銷／重新啟用都是新 draft 變更，必須再次 publish，不得直接改寫舊版本。

### 8.3 Approval semantics

Current Phase 不建立獨立 approval work item。受權限控管的 publish 是角色指派治理的核准事實：publisher、reason、catalog version 與 before／after assignment 都必須進 audit。高風險角色必須在發布摘要中顯著標示並要求非空理由，但不自行推定雙人覆核規則。

### 8.4 Fail-closed and recovery

| 失敗狀態 | 系統行為 | 使用者恢復方式 |
|---|---|---|
| role unknown／inactive／unassignable | 阻擋建立或發布 | 重新載入 catalog，改選 active／assignable role |
| catalog stale／invalid／unavailable | 阻擋新增、重新啟用與發布 | 修復或換用可驗證 snapshot；歷史資料保持可讀 |
| catalog revision changed | 保留 draft、拒絕舊版 publish | 重新整理、檢視角色差異並重新確認 |
| scope 不被角色允許 | 欄位就地錯誤，不自動放大為 global | 選擇允許的 scope kind／value |
| identity conflict／inactive employee | default deny | 回到身分連結或人員資料修復 |
| revision conflict | 不覆蓋較新 draft | 重新載入、比較並重做本次變更 |
| legacy V1 reactivation | target mode 下拒絕冒充新版本 | 檢視歷史內容後，以新 catalog 建立 assignment governance version |

## 9. Logical API and Command Contract

實際 route、request type 與檔案位置固定於第 23 節；RD 實作不得偏離以下行為：

- 提供唯讀 catalog snapshot 查詢，回傳來源、版本、validation state 與 roles。
- assignment mutation 只接受 catalog 中的 role reference，不接受 client 自帶外部 role／permission 定義。
- 現有 assignment upsert／revoke 能力可作 compatibility input，但 publish 必須補做 catalog version 與 scope 驗證。
- 針對外部 application 的 role create／update／delete／status change、permission mutation、grant mutation與 domain approval policy mutation，一律拒絕並回傳穩定錯誤語意 `EXTERNAL_CATALOG_READ_ONLY`。
- 對 `orgmaster` application 的自有治理 mutation 不受上述外部禁令影響，但 DEV-037 不新增自有 Permission Matrix UI。
- 既有 permission evaluator／reviewer resolver API 只保留 source-level legacy compatibility；公開 `/evaluate/permission` 與 `/evaluate/reviewers` route 改回 `410 LEGACY_GOVERNANCE_EVALUATOR_RETIRED`，DEV-037 新 UI 不得呼叫。OrgMaster server 內部仍可使用只接受 `applicationId = orgmaster` 的 permission evaluator 保護自身管理功能。
- publish 必須遵守既有 CAS／idempotency、manage＋publish 權限、管理者存續與 immutable snapshot 原則。
- 所有 mutation／publish／reject 都要產生可追溯 audit；不得把 sensitive credential 或 AI-PDM domain payload 寫入 audit。

## 10. Authorization and Security Contract

- 沿用 OrgMaster 自有 governance permission 作 UI 與 server mutation gate；只隱藏按鈕不能視為授權控制。
- 外部 catalog mutation 禁令是 ownership invariant，即使 actor 是 OrgMaster administrator 也不能繞過。
- employee email、姓名、職稱、部門或同名 role code 不得代替不可變 principal／stable role ID。
- 未授權、身分不明、catalog 不可驗證、scope 不足或版本衝突一律 default deny。
- 桌面 viewport 才允許 Current Phase mutation；767px 以下維持 read-only，server authorization 仍必須獨立成立。
- Current Phase local fixture 與 local-only published version 不得產生可被誤認為正式 AI-PDM authorization 的 token、claim 或同步回執。

## 11. UI/UX Contract

### 11.1 Actor and entry

- 主要 actor：具治理管理權限的桌面管理者。
- 入口：沿用 OrgMaster 工具列的治理入口；目標 heading／accessible name 使用「角色指派治理」，避免誤認為可設計外部 Permission 或 AI-PDM 領域審核。
- mobile／narrow viewport：可讀、不可 mutation，並顯示清楚原因。

### 11.2 Target information architecture

Current Phase 的主要導覽固定為：

1. 身分連結
2. 應用角色目錄
3. 角色指派
4. 角色代理
5. 發布版本
6. 稽核
7. 指派檢查

舊「審核規則」與 permission／reviewer「測試器」不得留在 normal DEV-037 delivery path。指派檢查只驗證 identity、catalog reference、scope、期間、delegation 與版本，不模擬外部 Permission 或 AI-PDM reviewer。

### 11.3 Application role catalog

- 外部 role 以唯讀清單／卡片顯示 application、名稱、code、狀態、assignable、risk、allowed scope、catalog version、來源及已指派數。
- 不出現新增、刪除、編輯、複製外部 role、Permission CRUD 或 Permission Matrix 入口。
- `orgmaster` 自有系統角色須與外部 catalog 分組並標示不同 owner；DEV-037 不新增其 CRUD。
- catalog loading、empty、stale、invalid、unavailable 與 local fixture 狀態都有非純色彩提示及可恢復說明。

### 11.4 Assignment and publish

- assignment 表單包含 employee、application／role、scope kind／value、valid from／to；外部 role 必須由 catalog 選取。
- catalog 僅允許 global scope 時，不顯示無效 scope 選項；不得把無效或缺漏 scope 靜默改為 global。
- 發布摘要顯示新增／撤銷／重新啟用數、high-risk role、organization version、catalog version、local-only effect 與 blockers。
- 發布必填 reason；成功訊息不得只顯示「權限已生效」，必須明示「已發布至 OrgMaster，尚未同步至目標系統」。

## 12. Legacy Compatibility and Migration Contract

- 既有 `legacy-policy-v1` published versions、audit 及 organization snapshot 永久保持可讀、不可就地改寫。
- 現有 AI-PDM role templates 可依 application＋stable role ID／code 轉成唯讀 catalog migration input；若無法唯一映射，標記 unresolved 並 fail closed，不以名稱猜測。
- 現有 assignments 只有在 employee、application、role 與 catalog version 全部可驗證時，才可帶入新 draft；帶入不是自動發布。
- legacy permission、grant、approval policy 保留歷史語意，但不得進入新 assignment governance authority 或被新 UI 編輯。
- legacy permission-based delegation 不得無條件轉成 role delegation；缺少唯一來源 assignment／role 時標記 unresolved，保留只讀。
- target mode 不允許把 legacy V1 version 直接 re-activate 為新 active assignment governance version。
- migration 必須可中止並保留原資料；不得用 destructive cleanup 當成 Current Phase 的成功條件。

最終 storage version、migration entrypoint、local backup／restore 與 recovery procedure 已固定於第 21～22 節；production rollback 仍屬 release gate，不在本 DEV 產生。

## 13. Acceptance Contract

DEV-037 只有在新 delivery path 取得 fresh evidence 時才能完成；DEV-027／035 evidence 不得代替。

1. 治理入口與文件清楚區分外部角色目錄 authority、OrgMaster assignment authority 與 AI-PDM domain authority。
2. 外部 role catalog 在 UI 唯讀，且 server 拒絕所有外部 role／permission／grant／domain approval policy mutation。
3. 管理者可從 valid catalog 選 role，為有效 employee 建立具合法 scope／期間的 assignment，發布後重新載入仍可追溯 employee、role、catalog version、publisher 與 reason。
4. 發布成功及版本畫面明示 `OrgMaster only / not synchronized`；不得暗示 AI-PDM 已授權。
5. unknown、inactive、unassignable、missing、invalid 或 stale catalog 均 fail closed，且 draft／歷史資料不遺失。
6. 撤銷／重新啟用透過新 draft 與 publish 完成，舊 published version 不變。
7. role delegation 不再以外部 permission IDs 作 target authority，且 expired／revoked delegation 不生效。
8. legacy V1 published version／audit 可讀，但不能直接 re-activate 冒充新 assignment governance version。
9. `orgmaster` 自有 governance authorization、管理者存續、CAS／idempotency 與 unauthorized default-deny 保持有效。
10. 767px 以下沒有 mutation；桌面、平板閱讀與手機閱讀均無水平溢出，狀態不只靠顏色表達。
11. source scan 與 API negative tests 證明 normal DEV-037 path 不含外部 Permission Matrix／Approval Policy mutation，也不寫入 AI-PDM。

## 14. QA/QC Evidence Contract

下列案例已由 `ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md` 轉成 executable matrix、實際命令與 evidence path；DEV-037 完成時必須使用 fresh evidence。

| Case | Delivery path | 必要證據 |
|---|---|---|
| UI-01 正常指派 | 工具列 → 角色指派治理 → 應用角色目錄 → 角色指派 → 發布 → 重載 | 操作紀錄、三個桌面／平板 viewport 截圖、published version／audit |
| UI-02 catalog failure | 同一入口載入 stale／invalid／unavailable catalog | 阻擋訊息、恢復方式、draft preserved 證據 |
| UI-03 local-only | 指派與發布成功訊息、版本詳情 | 明確未同步文案，不含外部生效宣稱 |
| API-01 ownership negative | 嘗試外部 role／permission／grant／approval mutation | server deny 與穩定錯誤語意 |
| API-02 assignment validation | unknown／inactive／unassignable role、非法 scope、過期期間 | default-deny 與 field／domain error |
| MIG-01 legacy read | 開啟既有 DEV-027／035 published version／audit | 可讀、不可 target reactivation、無資料重寫 |
| SEC-01 governance gate | 未授權、缺 manage／publish、管理者存續失敗、revision conflict | server-side deny、audit 與 recovery |
| RWD-01 narrow viewport | 390px 閱讀治理資料 | 無 mutation、無水平 overflow、鍵盤／accessible name 基本證據 |
| REG-01 existing product | governance targeted、full regression、typecheck／build | fresh command output 與失敗歸因 |
| SCAN-01 forbidden mutation | target UI、API、domain command 與 AI-PDM path 掃描 | 無 normal-path external mutation／AI-PDM write evidence |

temporary app server、test server、browser worker 或 QA runtime 必須依專案 `AGENTS.md` 記錄 owner／port／cleanup condition，完成後只清理本任務 process tree 並確認 port 釋放。

## 15. Delivery Slices and Gates

這是估工切片，不是實作授權：

| Slice | 目的 | 進入條件 | 完成 gate |
|---|---|---|---|
| S1 Domain／migration foundation | V2 schema、catalog snapshot、assignment／delegation、V1→V2 non-destructive migration | 本文件 `RD Implementation Ready` | catalog／migration／validation targeted tests fresh passed |
| S2 Server boundary | V2 store、read-only catalog、external mutation deny、assignment check／publish | S1 gate passed | command／API／store／audit targeted tests fresh passed |
| S3 Governance UI | 新資訊架構、唯讀 catalog、assignment／delegation／publish／recovery | S2 gate passed | presentation tests、build 與 normal delivery path desktop QC passed |
| S4 Compatibility and regression | legacy read-only、forbidden mutation scan、RWD、full regression | S1～S3 gates passed | QA/QC manifest 完整、temporary runtime cleaned、無 P0／P1 drift |

任何 slice 都不得修改 AI-PDM。若 S1 發現 legacy assignment無法以 stable role ID／catalog version 唯一映射，依第 22 節寫入 unresolved read-only recovery並阻擋發布；若失敗型態超出已固定 reason／recovery contract，停止該 slice並重開 RD Contract，不得由 RD 猜測映射。

## 16. Dependencies, Stop Conditions, and Re-entry

### Required dependencies

- ADR-007 Accepted。
- ADR-005 immutable governance snapshot 原則。
- DEV-027／035 historical local V1 store、API、UI 與 QA evidence 作 compatibility baseline。
- 現行 AI-PDM catalog fixture 僅作唯讀來源分析，不授權修改 AI-PDM。

### Stop conditions

- catalog 無 stable role ID、catalog version、assignable 或 allowed scope metadata，且無可驗證 mapping。
- 實作需要刪除／改寫 immutable published history 或 audit。
- 需求擴大為 OrgMaster 編輯外部 Permission、Role-Permission mapping、AI-PDM 領域 Approval Policy 或執行外部 authorization。
- 需要 AI-PDM live sync／effect、跨 repo write 或 production credential。
- 產品要求獨立 maker-checker、多階段 assignment approval 或自動依職務授權；須先完成人類決策與相應 ADR／contract 修訂。

### RD execution entry

- RD 由 S1 開始，不能跳到 UI 或直接刪除 legacy schema。
- 每個 slice 只能在上一個 targeted gate 通過後前進；第一個 migration、authorization、catalog integrity 或 visible-error 失敗即停止並回送 RD。
- working tree 目前包含多個既有 DEV 的未提交修改；RD 必須使用第 19 節 allowlist、先逐檔檢視現況，再作外科手術式修改，不得 reset、checkout、格式化或覆寫 unrelated changes。
- 本文件已無 P0／P1 readiness blocker；AI-PDM live integration、production target 與 maker-checker 仍是明確 deferred gate，不阻塞 OrgMaster Current Phase。

## 17. Future Phase Capsule

Future integration 的目的，是讓外部應用提供權威 catalog，並消費 OrgMaster immutable published assignments；不是把外部 Permission 搬回 OrgMaster。

只有使用者另行授權修改 AI-PDM，並建立跨 repo integration ADR 後，才能決定：catalog delivery、push／pull／token claim、service authentication、revocation latency、stale handling、compatibility window、分批 cutover、rollback 與 AI-PDM server enforcement evidence。正式 IAM／DB／deploy／release 另走 release gate。

## 18. RD Implementation Readiness Conclusion

- Outcome、actor、權責、Current Phase、Out of Scope、V2 data／API、UI entry、migration／recovery、fail-closed、legacy compatibility、acceptance、QA/QC evidence 與 stop conditions已固定。
- Human Decision 已足以支援 Current Phase；工程缺口已由本次 RD Readiness Review決定，沒有 P0／P1 open question。
- DEV-037 已完成 S1→S4，升級為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending`；Current Phase 只修改 OrgMaster。
- AI-PDM、production IAM／DB、deploy、release 與雙人／多階段審核仍未授權；命中時必須停止並重新進入相應 gate。

## 19. Repository and File Boundary

Canonical repo：`C:\VIBE CODING\OrgMaster`
Git branch：`master`
Baseline：以 RD 開始當下的 working tree 為 source of truth；目前不是 clean baseline，多個既有 DEV 共享 `App.tsx`、governance server／UI 與文件。

### 19.1 Product allowlist

| Slice | 可修改檔案 | 固定責任 |
|---|---|---|
| S1 | `src/governance/types.ts` | 保留 V1 compatibility types；新增 V2 document、catalog、assignment、role delegation、version union、migration metadata 與 command types |
| S1 | `src/governance/aiPdmCatalog.ts` | 保留 legacy V1 fixture；新增不可變 AI-PDM role-only catalog manifest、payload hash 與 catalog validator |
| S1 | `src/governance/migrateGovernanceV1ToV2.ts`（new） | 純函式 V1→V2 migration、legacy version discriminator、unresolved import report |
| S1 | `src/governance/validation.ts` | 拆分 V1 legacy validation 與 V2 structural／catalog reference／scope／delegation validation |
| S1 | `src/governance/commands.ts` | V2 command apply、internal/external owner guard、reason／idempotency hash；不連線 AI-PDM |
| S2 | `server/orgmasterGovernanceStore.ts` | V2 path、atomic non-destructive migration、V2 publish／reactivate、catalog snapshot、audit、data-dir isolation |
| S2 | `server/orgmasterGovernanceApi.ts` | V2 route contract、catalog response、command allowlist、assignment validation、410 legacy evaluator boundary |
| S2 | `src/governance/apiClient.ts` | V2 snapshot／catalog／assignment validation client；移除新 UI 對 permission／reviewer evaluator 的呼叫 |
| S2 | `src/governance/evaluatePermission.ts` | 只保留 `orgmaster` 自有 authorization；外部 application 固定 deny |
| S2 | `src/governance/governancePresentation.ts` | V2 failure mapping、publish blockers、role／scope／version presentation helpers |
| S3 | `src/components/GovernanceCenter.tsx` | 新 nav、唯讀 catalog、assignment／role delegation、version／audit、local-only 成功語意 |
| S3 | `src/components/GovernanceAssignmentCheck.tsx`（new） | 只驗證 assignment candidate，不模擬 Permission／reviewer |
| S3 | `src/components/GovernanceCenter.css` | 新 catalog／scope／risk／status／RWD style；沿用現有 UI language |
| S3 | `src/components/Toolbar.tsx` | icon button accessible name／title 改為「角色指派治理」 |
| S3 | `src/App.tsx` | 只新增 `departments` prop 傳入 GovernanceCenter；不得重構 App |

### 19.2 Test allowlist

- `src/governance/aiPdmCatalog.test.ts`（new）
- `src/governance/migrateGovernanceV1ToV2.test.ts`（new）
- `src/governance/commands.test.ts`
- `src/governance/validation.test.ts`
- `src/governance/evaluatePermission.test.ts`
- `src/governance/governancePresentation.test.ts`
- `server/orgmasterGovernanceStore.test.ts`
- `server/orgmasterGovernanceApi.test.ts`

`src/governance/resolveReviewers.ts`、`resolveReviewers.test.ts` 與 `src/components/GovernanceSimulator.tsx` 保留為 unreferenced legacy source，不在 Current Phase normal UI／API path；本 DEV 不為清理 dead code 擴大變更。若 TypeScript 因 V2 type alias 必須調整，只允許最小 compatibility edit，不得恢復外部 reviewer authority。

### 19.3 Explicit denylist

- `C:\VIBE CODING\AI_PDM\**`：只讀 source reference；不得修改、格式化、產生 migration 或測試資料。
- organization V5／workspace、duty、management-method product files：除 `App.tsx` 傳 prop 外不得修改。
- `vite.config.ts`、`package.json`、lockfile、hosting／infra／credential：本 DEV 不需要變更。
- `data/orgmaster-governance.v1*.json`：runtime migration 只能讀取；不得由 RD 手工編輯或提交。
- unrelated dirty files：不得 reset、checkout、restore、format 或納入 DEV-037 evidence。

### 19.4 Documentation and evidence boundary

- 權威 spec：本文件。
- QA plan：`ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md`。
- 任務／索引：`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`。
- Evidence root：`output/playwright/dev037/`；測試實際完成前不得預建 pass report。

## 20. Final Bundled Catalog Contract

Current Phase 的唯一外部 catalog export 為 `AI_PDM_ROLE_CATALOG_V1`，不得從 V1 `permissions`／`rolePermissionGrants` 反推角色能力。

```ts
type ExternalRoleCatalogState = 'valid' | 'stale' | 'invalid' | 'unavailable'
type ExternalRoleCatalogSourceKind = 'bundled-fixture'

interface ExternalRoleCatalogRoleV1 {
  stableRoleId: string
  code: string
  displayName: string
  status: 'active' | 'inactive'
  assignable: boolean
  riskLevel: 'normal' | 'high'
  allowedScopeKinds: GovernanceScopeV1['kind'][]
  unassignableReason?: 'INTEGRATION_METADATA_REQUIRED'
}

interface ExternalRoleCatalogSnapshotV1 {
  applicationId: 'ai-pdm'
  catalogVersion: 'ai-pdm-role-fixture-2026-08-27-v1'
  sourceKind: 'bundled-fixture'
  sourceRefs: Array<{ path: string; range: string; sha256: string }>
  capturedAt: '2026-08-27T00:00:00+08:00'
  payloadHash: '215030442AC3DD53B11A1DA4FCBC13FBF12DA5A27505499B18517A7C7C7B6A28'
  validationState: ExternalRoleCatalogState
  effectState: 'not-synchronized'
  roles: ExternalRoleCatalogRoleV1[]
}
```

Source refs 固定為唯讀證據：

- `AI_PDM/db/schema.sql:2222-2232`，SHA-256 `B89925107C6ADC10D085E581EBB9E5FBAC42505155CB0774F1AB46B7F261FCD8`。
- `AI_PDM/src/lib/repositories/numbering-repository.ts:4744-4759`，SHA-256 `69E21966C1DA2A8146144CC83251FA606572A5042437342FBEF475C7D771289A`。
- `AI_PDM/src/lib/repositories/numbering-repository.ts:4785-4791`，SHA-256 `388291CD51446AA88D5A1B935D109FEB9FC6663FDEE8B1545A2F5B67C448005C`。

上述 range hash以 1-based inclusive lines擷取 UTF-8文字，將換行正規化為 LF，並在最後一行補一個 LF後計算；不代表整個 AI-PDM file或 worktree clean。RD／QC只比較相同 range算法與 before／after 狀態。

`payloadHash` 的輸入固定為 UTF-8 `canonicalJson({ applicationId, catalogVersion, sourceKind, sourceRefs, capturedAt, roles })`；`canonicalJson` 沿用治理模組現行 `JSON.stringify` 契約，因此 object key與array順序必須完全依上述 interface／constructor及本節角色表，不含 `payloadHash`、`validationState` 或 `effectState`。RD 不得排序 key、加入 runtime 狀態或使用 V1 permission資料重算此值。

catalog payload 的角色順序與 Current Phase adapter metadata 固定如下：

| stableRoleId | code | 顯示名 | assignable | risk | allowed scope |
|---|---|---|---|---|---|
| `role-rd` | `rd` | RD | yes | normal | department |
| `role-rd-manager` | `rd_manager` | RD 主管 | yes | high | department |
| `role-pdm-admin` | `pdm_admin` | PDM 管理員 | yes | high | global |
| `role-document-admin` | `document_admin` | 文件管理員 | yes | high | department |
| `role-qa` | `qa` | QA / 品保 | yes | normal | workspace |
| `role-manufacturing` | `manufacturing` | 製造 | yes | normal | workspace |
| `role-procurement` | `procurement` | 採購 | yes | normal | workspace |
| `role-external-specialist` | `external_specialist` | 外部專員 | no | high | project |
| `role-system-admin` | `system_admin` | 系統管理員 | yes | high | global |

`external_specialist` 因 AI-PDM 要求 named scope、sponsor 與 review due metadata，而 Current Phase 尚無 integration mapping，固定 `assignable = false`。不得以 UI 手動輸入繞過。scope mapping 是 local fixture adapter metadata：`workspace` 的唯一 Current Phase value 為 `current`；`department` value 必須是目前 organization 中存在的 department ID；`global` 沒有 value。

`validateExternalRoleCatalog` 必須驗證 payload hash、source refs、catalog version、unique stable ID／code、role status、scope kind 與 external application ownership。QA 可透過 development-only `ORGMASTER_DEV_EXTERNAL_CATALOG_STATE=stale|invalid|unavailable` 觸發 visible fail-seeking；server 只有在 local development loopback identity 啟用 override，preview／非 development 一律忽略。

## 21. Final Governance V2 Data Contract

V1 interfaces 保留供 read／migration；Current Phase persistence 與 API view 使用 V2。

```ts
type GovernanceVersionKind = 'legacy-policy-v1' | 'assignment-governance-v2'
type AssignmentEffectState = 'orgmaster-enforced' | 'not-synchronized'

interface GovernanceRoleAssignmentV2 {
  id: string
  employeeId: string
  applicationId: 'orgmaster' | 'ai-pdm'
  roleId: string
  roleCodeSnapshot: string
  roleNameSnapshot: string
  catalogVersion: string | null
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
  effectState: AssignmentEffectState
}

interface GovernanceRoleDelegationV2 {
  id: string
  sourceAssignmentId: string
  fromEmployeeId: string
  toEmployeeId: string
  applicationId: 'ai-pdm'
  roleId: string
  catalogVersion: string
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string
  reason: string
  effectState: 'not-synchronized'
}

interface GovernancePolicyDataV2 {
  applications: GovernanceApplicationV1[]
  identityLinks: GovernanceIdentityLinkV1[]
  applicationRoles: GovernanceApplicationRoleV1[]
  permissions: GovernancePermissionV1[]
  rolePermissionGrants: GovernanceRolePermissionGrantV1[]
  roleAssignments: GovernanceRoleAssignmentV2[]
  roleDelegations: GovernanceRoleDelegationV2[]
}

interface GovernanceAssignmentVersionV2 {
  kind: 'assignment-governance-v2'
  id: string
  versionNumber: number
  publishedAt: string
  publishedByPrincipalId: string
  publishReason: string
  snapshotHash: string
  effectState: 'not-synchronized'
  policy: GovernancePolicyDataV2
  externalRoleCatalogs: ExternalRoleCatalogSnapshotV1[]
  organizationSnapshot: GovernanceOrganizationSnapshotV1
}

type GovernancePublishedVersionV2 =
  | (GovernancePolicyVersionV1 & { kind: 'legacy-policy-v1' })
  | GovernanceAssignmentVersionV2

interface GovernanceMigrationStateV2 {
  sourceSchemaVersion: 1 | null
  sourceRevision: string | null
  migratedAt: string | null
  legacyDraftHash: string | null
  removedExternalDraftCounts: { roles: number; permissions: number; grants: number; approvalPolicies: number }
  unresolvedAssignments: Array<{ value: GovernanceRoleAssignmentV1; reason: string }>
  unresolvedDelegations: Array<{ value: GovernanceDelegationV1; reason: 'PERMISSION_DELEGATION_NOT_MIGRATABLE' }>
}

interface GovernanceDocumentV2 {
  app: 'OrgMaster'
  schemaVersion: 2
  draft: GovernancePolicyDataV2 & { basePolicyVersionId: string | null; updatedAt: string }
  activePolicyVersionId: string | null
  publishedVersions: GovernancePublishedVersionV2[]
  auditEvents: GovernanceAuditEventV1[]
  migration: GovernanceMigrationStateV2
}
```

V2 invariants：

- `applicationRoles`、`permissions`、`rolePermissionGrants` 只能包含 `orgmaster` owned data；任何 external item 都是 `EXTERNAL_CATALOG_READ_ONLY`。
- external assignment 必須 `applicationId = ai-pdm`、`catalogVersion = current catalog version`、snapshot code/name 完全等於 catalog、`effectState = not-synchronized`。
- internal assignment 必須 `applicationId = orgmaster`、`catalogVersion = null`、`effectState = orgmaster-enforced`，並引用 V2 internal role。
- 同 employee＋application＋role＋scope 同時只允許一筆 active assignment；revoked record 可由同 ID 重新啟用。
- `validFrom < validTo`；`validTo = null` 只允許 assignment，不允許 delegation。
- role delegation 只允許 active external assignment，from／application／role／catalog／scope 必須與 source assignment完全相等，且期間不得超出 source assignment。
- V2 external assignment／delegation 不參與 OrgMaster internal permission evaluator。

## 22. V1 → V2 Migration and Local Recovery

### 22.1 Paths

`getGovernancePaths(root)` 改回：

```ts
{
  current:  '<data>/orgmaster-governance.v2.json',
  previous: '<data>/orgmaster-governance.v2.previous.json',
  legacyV1: '<data>/orgmaster-governance.v1.json',
  legacyV1Previous: '<data>/orgmaster-governance.v1.previous.json'
}
```

`<data>` 預設為 `<repo>/data`；local QA 若設定 `ORGMASTER_GOVERNANCE_DATA_DIR`，只替換 governance data directory，不改 organization workspace source。此變數是 local/test isolation 能力，不得成為 production provider contract。

### 22.2 Deterministic entry algorithm

1. 若 V2 current 存在，只讀 V2；schema、audit chain 或 document validation失敗即 fail closed，不退回 V1 掩蓋損壞。
2. 若 V2 不存在且 V1 current 存在，先讀原始 bytes、驗證 schema V1、audit chain 與 legacy document；任何失敗不建立 V2。
3. 呼叫純函式 `migrateGovernanceV1ToV2(v1Document, sourceRevision, catalogs, migratedAt)`。
4. V1 published version以原 `policy`、organization snapshot 與 snapshot hash 複製並只在 V2 wrapper 加 `kind = legacy-policy-v1`；V1 檔案及 V1 previous 永不寫入。
5. V1 draft 只遷移 OrgMaster roles／permissions／grants、identity links，以及可唯一映射的 role assignments；external permission／grant／approval policy 只計數並留在 V1 source。
6. external assignment 必須以 application＋stable role ID 對應 valid catalog，且原 scope 在 allowed scope 內才進 V2 draft；否則進 `migration.unresolvedAssignments`，不猜名稱、不自動發布。
7. permission-based delegation 全部進 `unresolvedDelegations`；Current Phase 不推測其 role。
8. 保留原 active legacy version ID 只作 OrgMaster internal authorization continuity；UI 標示 legacy，API 禁止重新啟用其他 legacy version。
9. 在既有 audit chain 末端追加 deterministic command ID `system-migrate-v1-to-v2-<sourceRevision[0..15]>` 的 `GOVERNANCE_MIGRATED_V1_TO_V2` event。
10. 使用 atomic temp＋readback＋rename 寫 V2 current；成功後再次讀取驗證。若寫入失敗，刪除該次 temp，V1 保持原樣，下次可重試。
11. 若 V1／V2 都不存在，建立乾淨 V2 seed：OrgMaster internal catalog、empty identity／assignments／delegations、empty versions、migration source null。

2026-08-27 盤點到 canonical V1 為 schema 1、0 published version、0 assignment、0 delegation、0 approval policy；這只是 baseline fact，migration tests仍必須覆蓋非空及 unresolved fixture。

### 22.3 Recovery contract

- 每次 V2 mutation 前把已驗證的 current raw 寫入 V2 previous，再 atomic write current。
- current 損壞時 UI／API 顯示 `GOVERNANCE_READ_FAILED`，不得自動 restore；QC 必須保留 current／previous bytes與 error evidence。
- local manual recovery 只允許在 runtime 停止後，以已驗證的 V2 previous取代 V2 current，再重啟及重驗 audit／revision；不得碰 V1 source。
- migration 若產生 unresolved item，治理中心仍可讀；發布被 `LEGACY_MIGRATION_UNRESOLVED` 阻擋，管理者從歷史詳情確認後重新建立可驗證 assignment。Current Phase 不提供「一鍵忽略」。

## 23. Final Command and API Contract

### 23.1 V2 command union

保留的 command：

- `UPSERT_IDENTITY_LINK`、`SET_IDENTITY_LINK_STATUS`
- `UPSERT_APPLICATION_ROLE`、`SET_APPLICATION_ROLE_STATUS`（server 僅允許 `orgmaster`）
- `UPSERT_PERMISSION`、`SET_PERMISSION_STATUS`（server 僅允許 `orgmaster`）
- `SET_ROLE_PERMISSION_GRANT`、`REMOVE_ROLE_PERMISSION_GRANT`（role／permission 均須 `orgmaster`）
- `UPSERT_ROLE_ASSIGNMENT`、`REVOKE_ROLE_ASSIGNMENT`
- `UPSERT_ROLE_DELEGATION`、`REVOKE_ROLE_DELEGATION`

`UPSERT_ROLE_ASSIGNMENT.value` 使用完整 `GovernanceRoleAssignmentV2`；server 重新比對 employee、internal role 或 current catalog，不信任 client snapshot。`UPSERT_ROLE_DELEGATION.value` 使用完整 `GovernanceRoleDelegationV2`；server 重新由 `sourceAssignmentId` 驗證所有 snapshot 欄位。

任何 command 的 `commandId` 必須非空；`reason.trim()` 必須 1～240 字。相同 command ID＋相同 canonical payload replay；相同 ID＋不同 payload 回 `COMMAND_ID_REUSED`。

舊 `UPSERT_DELEGATION`、`REVOKE_DELEGATION`、`UPSERT_APPROVAL_POLICY`、`SET_APPROVAL_POLICY_STATUS` 一律不進 V2 union，API 若收到回 `EXTERNAL_CATALOG_READ_ONLY`，不能降級成 generic JSON error。

### 23.2 Routes

| Method／route | Request | Success | Guard／failure |
|---|---|---|---|
| `GET /api/orgmaster/governance/session` | none | actor、runtime mode、manage／publish／simulate | loopback development identity；preview 503 |
| `GET /api/orgmaster/governance/` | none | sanitized V2 document、catalogs、revision、active ID、version summaries | identity required；subject 不回傳 |
| `GET /api/orgmaster/governance/versions/:id` | none | sanitized union version detail | unknown 404；legacy可讀 |
| `GET /api/orgmaster/governance/audit` | limit／cursor query | reverse chronological page | identity required |
| `PATCH /api/orgmaster/governance/draft` | expectedRevision＋V2 command | status、sanitized document、revision | manage、CAS、owner／catalog／scope validation |
| `POST /api/orgmaster/governance/validate/assignment` | assignment candidate without ID | status、issues、catalogVersion、payloadHash、effectState、checkedAt | simulate；不寫 store／audit |
| `POST /api/orgmaster/governance/versions` | expectedRevision、commandId、reason、organizationVersionId | V2 version summary、revision | manage＋publish、identity、CAS、catalog、migration、continuity |
| `POST /api/orgmaster/governance/active-version` | expectedRevision、commandId、reason、versionId/null | active version ID、revision | manage＋publish；legacy target 409；stale catalog 409 |
| `POST /evaluate/permission`、`POST /evaluate/reviewers` | any | none | `410 LEGACY_GOVERNANCE_EVALUATOR_RETIRED` |

Root response version summary固定帶 `kind`、`effectState`、organization version 與 catalog versions，讓 UI 不需讀 full version 判斷 legacy／local-only。

### 23.3 Stable error mapping

| Code | HTTP | UI recovery |
|---|---:|---|
| `EXTERNAL_CATALOG_READ_ONLY` | 409 | 回到唯讀角色目錄；不提供解鎖或手動輸入 |
| `EXTERNAL_CATALOG_VERSION_CONFLICT` | 409 | 重新載入、檢視新 catalog、重新確認 draft |
| `EXTERNAL_CATALOG_STALE` | 409 | 保留 draft；換用 valid catalog 前不發布 |
| `EXTERNAL_CATALOG_INVALID` | 422 | 顯示 catalog source/hash 錯誤並停止 mutation |
| `EXTERNAL_CATALOG_UNAVAILABLE` | 503 | 重新載入；歷史資料仍可讀 |
| `EXTERNAL_ROLE_UNKNOWN` | 422 | 改選 catalog role |
| `EXTERNAL_ROLE_INACTIVE` | 422 | 改選 active role |
| `EXTERNAL_ROLE_UNASSIGNABLE` | 422 | 顯示不可指派原因；無 override |
| `EXTERNAL_SCOPE_UNSUPPORTED` | 422 | 就地修正 scope；不得自動升 global |
| `ROLE_DELEGATION_INVALID` | 422 | 保留輸入，修正來源／代理人／期間 |
| `LEGACY_MIGRATION_UNRESOLVED` | 409 | 檢視 migration detail 並重建 assignment |
| `LEGACY_POLICY_REACTIVATION_FORBIDDEN` | 409 | 檢視歷史後發布新 V2 version |
| `LEGACY_GOVERNANCE_EVALUATOR_RETIRED` | 410 | 使用指派檢查或外部系統 enforcement |

既有 401／403／404／409／413／422／500 mapping 保留；`describeGovernanceFailure` 必須提供上述繁中人類訊息與 reload flag，UI 不顯示 raw code。

## 24. UI Implementation Contract

### 24.1 Entry and information architecture

- `Toolbar` ShieldCheck icon 的 `aria-label`／`title` 固定「角色指派治理」。
- Dialog heading 固定「角色指派治理」，small label「本機治理沙盒」。
- Header 只保留一個高影響狀態訊號：「尚未同步至外部系統」；draft timestamp可留低對比，不疊加多個 local-only badge。
- Navigation：身分連結、應用角色目錄、角色指派、角色代理、發布版本、稽核、指派檢查。
- 不渲染舊「審核規則」與 permission／reviewer「測試器」。

### 24.2 Props and field matrix

`GovernanceCenter` 新增 `departments: Department[]`；`App.tsx` 只傳現有 `departments`。

| Surface | 欄位／主物件 | Primary action | 固定限制／狀態 |
|---|---|---|---|
| 身分連結 | principal、employee、issuer、status | 建立或切換狀態 | desktop manage；subject masked；重複 identity fail closed |
| 應用角色目錄 | owner、role name/code、scope、status、risk、catalog version | 無 mutation；role name 開 detail | 外部 role 唯讀；internal／external 分組；不顯示 Permission |
| 角色指派 | employee、role、scope kind/value、validFrom、validTo | 加入／重新啟用 draft | role default blank；scope由 catalog限制；高風險就地單一訊號 |
| 角色代理 | source external assignment、delegate、validFrom、validTo、reason | 加入／重新啟用 draft | validTo必填；scope繼承且不可放大；不能代理 internal admin |
| 發布版本 | change counts、high-risk count、org version、catalog version、effect | 發布 | reason必填；legacy不可重新啟用；成功明示 OrgMaster only |
| 稽核 | time、action、actor、reason | reload | row detail按需；migration／catalog／publish events可追溯 |
| 指派檢查 | employee、role、scope、period | 檢查 | 不保存、不發 audit、不輸入 Permission／action／reviewer |

role scope control：

- `global`：顯示唯讀「全域」，payload `{ kind: 'global' }`。
- `workspace`：顯示唯讀「目前工作區」，payload `{ kind: 'workspace', value: 'current' }`。
- `department`：顯示 department select，value 必須存在。
- `project`／`product`：type仍可讀 legacy，但 Current Phase catalog沒有可指派 role使用；不渲染自由文字 fallback。

日期 UI 使用 `datetime-local`，送出前轉 ISO；`validFrom` default now，assignment `validTo` optional，delegation `validTo` required。role／employee／scope／日期錯誤靠近欄位且保留輸入。

### 24.3 Normal delivery path

1. 管理者從正常 Toolbar 入口開啟角色指派治理。
2. 應用角色目錄顯示 AI-PDM 9 roles、catalog version／source state；沒有 Permission Matrix或 role mutation。
3. 管理者到角色指派選 employee、assignable role、合法 scope與期間，加入 draft。
4. 列表立即呈現 `草稿／尚未同步`，reload 後仍存在；尚未 publish 不改 active version。
5. 發布版本顯示 assignment change、high-risk、organization／catalog version、local-only effect；輸入 reason後 publish。
6. 成功訊息固定「角色指派版本 vN 已發布至 OrgMaster，尚未同步至目標系統」。
7. reload 後 active V2 version、assignment、catalog reference、publisher／reason與 audit可讀。

### 24.4 Visible states and UX gates

- loading：只在受影響 main surface 顯示，不用整頁重複 spinner。
- empty：一個短事實；有 manage權限時最多一個可執行動作。
- stale／invalid／unavailable：catalog section就地 alert；assignment／publish controls disabled或不渲染，既有輸入／history保留。
- revision conflict：顯示一個 reload action；reload後回到同 section，未成功內容不得顯示成功訊息。
- legacy version：單一「歷史 V1」標記與唯讀 detail；沒有 reactivate CTA。
- high-risk：只在 selected role、publish summary與版本 detail中出現必要訊號，不在每層重複紅框／badge／文字。
- mobile 390px：保留閱讀 nav／tables／details；mutation form、row actions與 publish action均不在 DOM；body無水平 overflow，table內部可按需 scroll。
- keyboard：Toolbar→dialog focus、nav、forms、drawer／modal trap、Escape層級、返回 Toolbar focus均需 fresh evidence。

## 25. Authorization, Publication, and Concurrency

- `evaluatePermission` 對 `applicationId !== orgmaster` 固定 denied／`EXTERNAL_PERMISSION_EVALUATION_UNSUPPORTED`；server只用它保護 OrgMaster自身 manage／publish／simulate。
- bootstrap 只在沒有 active version時可建立第一組 identity＋internal admin assignment；external assignment永不授予 OrgMaster治理權限。
- publish 必須同時通過 current identity唯一有效、publisher employee存在、draft internal manage＋publish、organization version相符、catalog valid且版本相符、無 unresolved migration、所有 assignment／delegation有效、管理者存續。
- publish snapshot hash必須涵蓋 `kind + policy + externalRoleCatalogs + organizationSnapshot + effectState`。
- reactivation只允許 `assignment-governance-v2`；catalog version、roles與管理者存續需以 current source重新驗證。legacy／stale V2 version均拒絕。
- CAS 以 V2 raw SHA-256 revision；所有 mutation／publish／activation必須帶 expected revision。
- idempotency延用 command ID＋canonical command hash；API retry不得建立第二份 assignment、delegation、version或 audit event。
- audit event沿用 append-only hash chain；migration、assignment、delegation、publish、deactivate／reactivate都記 actor、reason、before／after hash，不寫 principal subject、credential或 AI-PDM domain payload。

## 26. Executable RD／QA／QC Gate

### S1 gate

```powershell
npm test -- src/governance/aiPdmCatalog.test.ts src/governance/migrateGovernanceV1ToV2.test.ts src/governance/commands.test.ts src/governance/validation.test.ts
```

必須證明 catalog payload／source metadata、9 roles、external specialist unassignable、V1 bytes保留、V2 idempotent migration、legacy union、unresolved fail closed、assignment／delegation invariants。

### S2 gate

```powershell
npm test -- src/governance/evaluatePermission.test.ts src/governance/governancePresentation.test.ts server/orgmasterGovernanceStore.test.ts server/orgmasterGovernanceApi.test.ts
```

必須證明 internal authorization continuity、external evaluation deny、API owner guard、410 legacy evaluator、CAS／idempotency、V2 publish snapshot、catalog stale／unknown／scope fail closed、legacy reactivation deny與 audit chain。

### S3 gate

```powershell
npm run build
```

接著依 QA plan 在 task-owned isolated governance data與 temporary browser runtime走 normal Toolbar delivery path；build不能代替 UI evidence。

### S4 gate

```powershell
npm test -- --run --reporter=dot
npm run build
```

再完成 forbidden mutation scan、AI-PDM before／after status comparison、1440×900／1024×768／390×844 UI QC、visible error sweep、legacy read-only、stale recovery與 runtime cleanup。Evidence固定寫入 `output/playwright/dev037/manifest.md` 與同目錄 screenshots。

本次 fresh evidence 已完成：122 test files／553 tests、`npm run build`、normal Toolbar delivery path、V2 publish／audit、stale catalog fail-closed、legacy V1 non-destructive migration unit／store gate、410 retired evaluator routes、390px mutation controls absent／zero horizontal overflow、AI-PDM status before／after hash identical、canonical V1 unchanged；完整結果見 `output/playwright/dev037/manifest.md`。

QC 依 `ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md` 凍結的 acceptance執行；QC不修改產品。任一 P0／P1、visible alert、catalog count不合理、外部 mutation可達、canonical governance V1被寫入、AI-PDM diff變更、mobile mutation control或 port未清理，結論一律 Fail／Not verified，不得標完成。

## 27. Git Boundary and Release Feasibility Note

- 本次 Implementation Ready文件不 stage、commit、push或建立 branch；RD開始時需再次記錄 `git status --short`，把 allowlist內既有 dirty內容視為受保護 baseline。
- per-slice只修改第 19 節 allowlist；發現同檔無法區分的其他任務變更時停止該檔並回報，不用 reset解決。
- AI-PDM 在 RD前後各記錄 `git -C "C:\VIBE CODING\AI_PDM" status --short` 與兩個 source ref diff；before／after必須完全相同。本文件的 source hash只證明 2026-08-27唯讀盤點，不授權同步。
- 變更觸及 local runtime與 local V2 data migration，但不新增 dependency、hosting、provider或 production env。QA isolation env只在 development生效。
- `RD Implementation Ready` 不等於 Release Ready。若後續要 deploy／release、正式 IAM／DB或 AI-PDM integration，必須進 release／integration gate；本文件不提供 production backup、rollback或 smoke命令。

使用思考習慣：#權責劃分、#限制條件、#可驗證性

## 28. Change Log

- 2026-08-27：依使用者要求從 `Brief Ready` 升級為 `RD Contract Ready`；固定 bundled read-only catalog、assignment／role delegation、publish-as-approval、local-only effect、legacy V1 compatibility、UI／API ownership boundary、QA/QC evidence 與 stop conditions。未修改 OrgMaster 產品程式或 AI-PDM。
- 2026-08-27：完成 RD Readiness Review，升級為 `RD Implementation Ready / RD Not Started`；固定 V2 file／schema、AI-PDM 9-role readonly manifest與 source hashes、V1 non-destructive migration、command／route／error signatures、UI field matrix、S1～S4 gates、isolated QC runtime與 evidence path。未修改產品程式或 AI-PDM。
- 2026-08-27：完成 DEV-037 RD implementation 與 QA/QC；S1～S4 fresh gates 通過（122 files／553 tests、build、normal Toolbar UI、1440×900／1024×768／390×844、stale catalog、legacy migration、API negative、forbidden scan、AI-PDM before／after unchanged、runtime cleanup），升級為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending / OrgMaster Only`。未修改 AI-PDM，未 deploy／release。
