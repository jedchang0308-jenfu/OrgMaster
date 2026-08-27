# DEV-035：治理角色指派與安全發布閉環

文件成熟度：`RD Implementation Complete / QA-QC Passed / Historical Local V1 / Target Boundary Superseded by ADR-007`
狀態：完成（OrgMaster-only safe management loop；新目標由 DEV-037 追蹤）
節點類型：開發點
父交付點：DEV-027
優先級：P0
風險等級：High（local authorization／visible state）
日期：2026-08-26
來源 ID：`USER-2026-08-26-GOVERNANCE-NEXT-STEP-DESIGN-THINKING`

## 1. 問題與使用者價值

治理管理者完成身分連結後，現行 UI 仍無法建立角色指派；再次選到相同員工時，API 正確拒絕重複身分，但畫面同時保留「已更新草稿」與 `GOVERNANCE_VALIDATION_FAILED`，且錯誤跨區段常駐。發布入口亦未先顯示缺少管理／發布權限的阻擋原因。

本 DEV 先完成最短可用治理流程：

`身分連結 → 全域 Application Role 指派 → 發布前檢查 → immutable policy 發布 → simulator 驗證`

成功時，使用者不必操作 API 或理解錯誤碼，且伺服器會拒絕可能使目前治理管理者失去管理能力的 policy。

使用思考習慣：`#設計思考`、`#限制條件`、`#可驗證性`

## 2. Spec impact preflight

分類：`Compatible exception`

- 當時延續 DEV-027 的 1B／2A、OrgMaster-only、local governance V1、immutable policy version 與 AI-PDM 未修改邊界；外部 policy authority 其後由 ADR-007 取代。
- 不改 `GovernanceDocumentV1`、command union、JSON file path、organization V6 或 workspace API。
- 補齊 DEV-027 第 19.1、19.3 節既有「錯誤可恢復、角色指派、publish blockers、mandatory reason」契約。
- DEV-027 既有完成判定因 2026-08-26 使用者可見錯誤而 QC reopen；本 DEV 通過相同 delivery path 後才可恢復完成。
- ADR-004／ADR-005 仍為權威；沒有新架構決策，不新增 ADR。

## 3. UX intent

- 使用者／任務：桌面本機治理管理者要把目前登入身分連到員工、指派應用角色並安全發布。
- 成功結果：可由 UI 完成一筆全域角色指派；發布前能看出阻擋原因；失敗不會出現假成功或 raw code。
- 主物件／主焦點：各區段的治理紀錄；角色指派區只有一個「指派角色」主要動作，發布版本區只有一個「發布」主要動作。
- 預設刪除：常駐成功面板、raw JSON 錯誤碼、跨區段錯誤、重複身分建立控制、額外教學卡。
- 保留舉證：發布 blocker 與手機唯讀訊號若移除，會造成無法恢復的權限誤判；因此保留最短原因與目標區段。
- 非語言修復：使用 disabled、就地 action、表格狀態、modal summary 與欄位鄰近回饋；文字只說明錯誤原因與恢復動作。

## 4. Current Phase scope

### 4.1 In scope

- 將 API `issues` 與已知錯誤碼轉為可恢復的人類訊息。
- 每次新動作先清除舊成功／失敗；成功訊息短暫顯示；區段切換不保留不相關錯誤。
- 已有目前 active identity link 時，不再呈現重複建立入口；identity 可在 draft 停用／重新啟用。
- 角色指派 UI 支援建立、重新啟用與撤銷全域 role assignment；同 employee＋role＋global 的 active assignment 不重複建立。
- 發布 modal 顯示 organization version、治理資料 counts、publish blockers 與必填 reason。
- client readiness 與 server enforcement 都要求目前 actor 的 draft policy 同時保留 `orgmaster.governance.manage` 與 `orgmaster.governance.publish`；explicit deny 優先於 allow。
- reactivation historical policy 前執行相同管理連續性檢查。
- 手機 `max-width: 767px` 沿用專案最高原則，只提供閱讀，不呈現或觸發本 DEV mutation。
- 修正 modal／drawer／center 的 Escape 優先序與最上層 focus scope。

### 4.2 Out of scope

- 修改 `C:\VIBE CODING\AI_PDM`、AI-PDM adapter、approval work item、decision 或 apply state。
- 正式 IAM、database、remote migration、credential、deploy 或 release。
- 新增／刪除 Application Role、permission matrix、delegation editor 或 approval policy editor。
- 非 global scope 的角色指派 UI；domain／API 仍保留既有 scope 能力。
- 全專案 DEV-033 平板判定；本 DEV 只對新增治理 mutation 採手機 default-deny。

## 5. Implementation contract

### 5.1 Client presentation

- `GovernanceApiError.issues` 必須保留給 presentation mapper；畫面不得只顯示 `GOVERNANCE_VALIDATION_FAILED`。
- `IDENTITY_CONFLICT` 合併為單一訊息：「目前登入身分或該員工已建立有效連結；請先停用既有連結。」
- `REVISION_CONFLICT` 顯示重新載入動作；不得自動覆蓋遠端 revision。
- failure 發生時清除 previous success；success 發生時清除 previous failure，並在短時間後移除。
- API sanitized identity view 明確使用 view type，不再把缺少 `subject` 的 response 偽裝成 server domain type。

### 5.2 Role assignment

- 建立 command：`UPSERT_ROLE_ASSIGNMENT`，新 id 為 `role-assignment-${crypto.randomUUID()}`。
- 本 slice 固定 `scope: { kind: 'global' }`、`status: 'active'`、`validFrom: server-compatible ISO now`、`validTo: null`。
- 同 employee／role／global 已 active 時 client 阻擋；已 revoked 時重用原 id 重新啟用，避免同一語意持續累積 id。
- 撤銷 command：`REVOKE_ROLE_ASSIGNMENT`；屬 draft 可逆動作，不額外建立 modal。

### 5.3 Publish continuity

- client blocker 只作操作指引；server 是唯一安全裁決。
- server 對 draft permission 使用 active identity、active orgmaster role、active global assignment、有效期間、permission status 與 deny precedence。
- publish actor 缺 `publish` 回既有 `GOVERNANCE_PUBLISH_REQUIRED`；有 publish 但缺 manage 回 `GOVERNANCE_ADMIN_CONTINUITY_REQUIRED`。
- reactivation target version 缺目前 actor 的 manage／publish 任一能力時，回 `GOVERNANCE_ADMIN_CONTINUITY_REQUIRED`。
- 新錯誤與 `PUBLISHER_NOT_LINKED`、`ORGANIZATION_VERSION_INVALID` 均不得落成 500；以 409／422 表達可恢復 client condition。
- 不修改既有 JSON；沒有 migration。現有 draft、published version 與 audit event 原樣相容。

### 5.4 UI entry contract

- Target actor：local development governance administrator。
- 正常入口：OrgMaster toolbar「權限與審核治理」。
- Happy path：開治理中心 → 身分連結 → 角色指派 → 選員工與角色 → 指派角色 → 發布版本 → 輸入原因 → 發布 → simulator。
- Visible fail：任何 `[role=alert]`、raw API code、成功／失敗並存、角色指派無入口、blocker 不可定位、手機出現 mutation、modal Escape 關掉整個 center，均為 QC fail。
- 390×844：治理資料可閱讀，但新增、撤銷、發布、重新啟用控制不存在。

## 6. Verification Integrity Matrix

| Acceptance / risk | Normal delivery path | Fixture boundary | Forbidden shortcut | Fail condition | Required evidence |
| --- | --- | --- | --- | --- | --- |
| 重複身分／stale operation 可恢復 | toolbar → 身分連結；two-session toolbar → 角色指派 | 案例開始前可 seed 一筆 link | 只測 API 422／409 | active link 仍可重複建立、raw code、假成功、無恢復方法 | UI prevention＋two-session error screenshot＋API issue test |
| 建立角色指派 | toolbar → 角色指派 → 表單提交 | 可 seed employee、role、identity | API 直接建立 postcondition | UI 無入口、reload 後消失 | UI 操作＋reload＋store/API evidence |
| 安全發布 | toolbar → 發布版本 → modal | 可 seed draft prerequisite | 直接呼叫 publish API 取代 UI | blocker 不顯示、reason 非必填、缺 manage 仍發布 | modal screenshot＋server negative test＋成功流程 |
| 手機唯讀 | 正常 toolbar 入口 | 使用相同治理資料 | 只靠 CSS source inspection | 任一 mutation control 可見／可觸發 | 390×844 screenshot＋DOM action count |
| overlay 鍵盤 | 正常入口開 center／drawer／modal | 無 | 只跑 unit test | Escape 關錯層、Tab 離開 top overlay | keyboard interaction evidence |

## 7. File boundary

允許修改：

- `src/governance/apiClient.ts`
- `src/governance/governancePresentation.ts`（新增）
- `src/governance/governancePresentation.test.ts`（新增）
- `src/components/GovernanceCenter.tsx`
- `src/components/GovernanceDialogs.tsx`
- `src/components/GovernanceCenter.css`（新增；避免碰觸其他 DEV 已修改的 `src/index.css`）
- `server/orgmasterGovernanceStore.ts`
- `server/orgmasterGovernanceStore.test.ts`
- `server/orgmasterGovernanceApi.ts`
- `server/orgmasterGovernanceApi.test.ts`
- 本 DEV spec、`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、DEV-027 spec／QA 的 cross-spec completion status
- `output/playwright/dev035/` evidence

明確禁止：`src/App.tsx`、`src/components/Toolbar.tsx`、`src/index.css`、organization schema／store、AI-PDM repo，以及其他 dirty worktree 檔案。

## 8. Acceptance and evidence

- [x] active identity 存在時無重複建立入口；server 的 identity conflict mapper／422 fail-closed 有測試，stale session 顯示單一可恢復訊息且無假成功。
- [x] 桌面可從 UI 建立、撤銷、重新啟用 global role assignment，reload 後一致。
- [x] 發布 modal 顯示 counts／blockers／organization version，reason 空白不可確認。
- [x] 缺 manage／publish 或存在 deny 時，server 拒絕 publish／reactivate；成功 policy 不會使 actor 失去管理能力。
- [x] 手機只讀，沒有本 DEV mutation controls；desktop／laptop／mobile 無水平 overflow。
- [x] Escape 優先關 modal，再關 drawer，再關 center；Tab 留在最上層 overlay。
- [x] targeted tests、full regression、`npm run build` 通過。
- [x] 實際 browser 覆蓋 happy path、重複建立預防、two-session stale fail-seeking、publish blocker、reason、reload、visible-error sweep、desktop 1440×900、laptop 1024×768、mobile 390×844。

## 9. Stop conditions

- 需要修改 AI-PDM、production IAM／DB／credential、遠端資料或 deploy。
- 需要改 governance V1 schema／migration 或 organization persistence。
- 無法在不碰觸 DEV-034 dirty files 的情況下完成。
- 實際 browser 仍出現 visible error、假成功、mobile mutation 或 self-lockout path。

## 10. Baseline

- 2026-08-26：重現 duplicate identity request，API 回 422，issues 為兩筆 `IDENTITY_CONFLICT`；現行 UI 只顯示 generic code 並保留舊 success。
- 2026-08-26：governance targeted tests 6 files／9 tests passed。
- 2026-08-26：`npm run build` passed；既有 Vite native-config extension 與 bundle-size warning 非本 DEV regression。

## 11. Future capsule

本段原規劃的外部 Application Role／Permission Matrix／Approval Policy CRUD 已由 2026-08-27 ADR-007 取代。後續 OrgMaster-only slice 改由 DEV-037 處理「具來源版本的外部角色目錄唯讀＋角色指派／scope／有效期間／代理／指派審核」；OrgMaster 不新增或編輯 AI-PDM 角色、Permission 或領域審核政策。AI-PDM integration 仍依 DEV-027 Phase 3 gate，需使用者另行授權與 integration ADR。

## 12. Completion evidence

- 2026-08-26：`npx tsc --noEmit` passed；governance targeted 7 files／18 tests passed；full regression 60 files／271 tests passed；`npm run build` passed。
- 2026-08-26：隔離 runtime `127.0.0.1:5002` 完成 toolbar normal delivery path。建立 identity 與 global OrgMaster 管理者角色、reload persistence、撤銷／重新啟用、缺角色 publish blocker、reason-required publish 與 active Policy v1 均通過。
- 2026-08-26：two-session stale revision 顯示人類訊息與「重新載入」，無 raw code 或假成功；normal happy path browser console 0 error／0 warning。
- 2026-08-26：1440×900、1024×768、390×844 通過；手機 DOM mutation action count 0，desktop／laptop／mobile body 均無水平 overflow。
- 2026-08-26：證據位於 `output/playwright/dev035/manifest.md` 與五張 screenshots；temporary port 5002 已釋放，canonical port 5000 保留且 HTTP 200。
- 2026-08-26：AI-PDM 未修改；未 deploy、未 release、未接 production IAM／DB。
- 2026-08-27：Post-completion authority amendment：ADR-007 取代外部角色／權限集中治理方向；本 DEV 的 local V1 完成證據保留為歷史基線，不代表新目標已實作，產品差距轉由 DEV-037 追蹤。
