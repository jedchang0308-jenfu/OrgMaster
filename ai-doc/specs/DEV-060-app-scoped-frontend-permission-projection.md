# DEV-060：OrgMaster 地端 SSO 與應用內單一前端權限投影

- 文件成熟度：Implemented Source Checkpoint；原契約驗收範圍保持不變。
- 執行狀態：Source Implemented / Deterministic Self-check Passed / Local Acceptance BLOCKED；尚未完成 DEV-060。
- Native task：ORGMASTER/DEV-060#frontend-permission-projection。
- 跨專案主控：JENFU/DEV-021。
- 建立日期：2026-10-28（Asia/Taipei）。

人類已確認：目標採真實 non-production SSO 與 ADC impersonation，不新增永久 fake SSO；server 撤權立即生效，前端於下一次受保護操作收到 403 後失效 projection；non-production IAM 與真實外部 Chrome SSO journey 拆到另一個 session。本次只交付 source、local runner、deterministic SSO contract tests 與 permission projection。

## 1. 交付結果

在 OrgMaster 專用工作樹內同時交付：

1. 預設 http://localhost:1010、可由本 session 暫時覆寫為 http://localhost:12010 的可靠 local entrypoint。
2. 沿用既有 jenfu.sso-handoff.v2 的 Platform SSO callback，建立 OrgMaster 自己的 HttpOnly session。
3. authenticated app shell 只取得一次 OrgMaster global permission projection；導覽、module entry 與同 scope action 透過一個 provider／hook 讀取。
4. employee、management-method document 等 resource-specific capability 繼續由原 endpoint 回傳並由 server 授權，不為追求單一 request 而混成全域權限。

本任務不改 Platform 或 AI-PDM repo，不新增 Position 自動配權，也不把前端 snapshot 當成安全邊界。

## 2. Current-code inventory 與合併判定

實作前基線已查證：

- src/auth/AuthGate.tsx 已在持久 shell 取得目前 session，並區分 local development profile、Platform SSO 與 unavailable。
- src/components/GovernanceCenter.tsx 每次載入／refresh 會同時呼叫 loadGovernance() 與 loadGovernanceSession()；/api/orgmaster/governance/session 回傳 governance manage／publish／simulate 等 global capabilities。
- employee identity／number 管理 endpoint 回傳的是特定 employee 的 capabilities；management-method /session 與 document response 回傳的是該 module／document 的 create、edit、publish-readability 等能力。這些不是與 global projection 完全相同的 scope。
- AuthGate、AccountMenu 與 DirectoryDetailPanel 使用 auth／feature state，但目前沒有可供整個 app shell 共用的 OrgMaster permission projection。

因此第一切片固定為「一份 global app projection + 保留 resource projections」：

- 收斂 GovernanceCenter 的 global session request，並讓導覽／module entry／同 scope action 可共用。
- 不移除 resource endpoint 回傳的 capability；它們可與 global projection 共同決定 UI，但 server response 永遠優先。
- 若實作盤點再發現 consumer 綁定 workspace、department、employee 或 document，標記為 resource scope，不納入 global provider。

## 3. 責任與安全邊界

- OrgMaster 擁有 Principal／Employee、有效 role assignment、scope、期限、撤權與稽核；Platform 只擁有登入與 session handoff。
- Position、部門、組織圖與任職是組織主資料，不因存在某職位就自動產生 App grant。
- Provider 只投影 applicationId=orgmaster 的已發布 permission；不得回傳 AI-PDM、FMS、ProJED 或其他 App 的 capability。
- UI 可用 projection 決定顯示、停用與說明；route／API／mutation 必須重新驗證當下 verified session、scope 與 resource。
- Snapshot 不含 role assignment 明細、Position、subject、token、cookie 或其他 App grant；只傳最小 permission boolean 與追蹤欄位。

## 4. API contract

沿用既有 GET /api/orgmaster/governance/session，升級為 app projection owner，不新增語意重複的第二個 permission endpoint。回傳形狀固定為：

~~~ts
type OrgMasterPermissionCode =
  | 'orgmaster.governance.manage'
  | 'orgmaster.governance.publish'
  | 'orgmaster.governance.simulate'
  | 'orgmaster.identity.view'
  | 'orgmaster.identity.refresh'
  | 'orgmaster.employee-number.manage'
  | 'orgmaster.identity.invite'
  | 'orgmaster.identity.link'
  | 'orgmaster.identity.invitation.manage'
  | 'orgmaster.management_method.create'
  | 'orgmaster.management_method.read_readable'
  | 'orgmaster.management_method.read_draft'
  | 'orgmaster.management_method.edit_draft'
  | 'orgmaster.management_method.manage_read_availability'
  | 'orgmaster.management_method.manage_metadata'

type OrgMasterPermissionProjectionV1 = {
  contractVersion: 'orgmaster.frontend-permission-projection.v1'
  applicationId: 'orgmaster'
  principalId: string
  generatedAt: string
  governanceRevision: string
  permissions: Record<OrgMasterPermissionCode, boolean>
  management: { crossAppOverride: boolean }
}
~~~

契約規則：

- permission code 必須由現行 ORGMASTER_PERMISSIONS canonical catalog 推導，禁止在 route 與 UI 各維護一份手寫清單。上述 union 是本切片預期輸出，實作以 canonical typed source 為準。
- 對 verified principal 使用現行 published governance evaluation；development profile 沿 developmentPermissionForActor，不可另設 bypass。
- 無 session 為 401；verified session 但 permission false 仍回 200 projection；governance／identity authority 無法取得為 503，不回 all false。
- Response Cache-Control: no-store；第一切片只在 React provider 記憶體保存。
- 現有 GovernanceSession 的 manage／publish／simulate consumer 改讀 typed permission code，不保留第二套 boolean alias。
- 實作盤點補正：既有財務初始授權入口使用的 crossAppOverride 仍由 hasCrossAppOverride server guard 計算，以 management.crossAppOverride 回傳；它是 OrgMaster 自己的治理能力，不包含外部 App 的 capability。actor 的 employeeId 沿既有 AuthGate session 取得。

## 5. 前端 provider contract

新增 OrgMasterPermissionProvider 與 useOrgMasterPermissions()，放在 authenticated AuthGate 內、ProtectedApp 外；同一 shell 只存在一個 provider instance。

State：

- loading：初次取得中；保持 module entry／action 版面穩定，不把未知顯示成 denied。
- ready：含 projection 與 typed selector，例如 allows(code)。
- unauthenticated：endpoint 401；交回既有登入恢復流程，清除 snapshot。
- unavailable：503、timeout 或 contract mismatch；提供明確 retry，不產生 ready all-false。

Provider 必須：

- 以 principal ID 綁定 snapshot；principal 改變、logout 或 provider unmount 時立即丟棄。
- 對同一 shell 的 concurrent consumer 做 in-flight dedupe；route／module 切換不重新 fetch。
- 暴露 invalidate(reason) 與顯式 retry()；OrgMaster 完成會改變已發布 permission 的操作後 invalidation 一次。
- mutation 若回 403，先失效 snapshot 並提示權限可能已變更；不得自動重送非冪等命令。
- unmount／principal switch 後，舊 request 的 late response 不得覆寫新 state。
- 不使用 localStorage、sessionStorage、BroadcastChannel、Service Worker 或跨 App store。

## 6. Local SSO 與 runtime profile

下列為下一個 non-production activation session 的固定埠設定；本次只完成 config contract 與 deterministic tests，不建立／修改 service identity 或 IAM：

~~~dotenv
ORGMASTER_PUBLIC_BASE_URL=http://localhost:1010
ORGMASTER_JENFU_SSO_HANDOFF_MODE=on
ORGMASTER_JENFU_SSO_BROKER_ORIGIN=http://localhost:1000
JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT=<orgmaster-nonprod-service-account>
~~~

未來 activation 使用 12010／12000 的 exact origin；一次驗收不得混用 localhost 與 127.0.0.1。Local service token 使用 ADC impersonation，不接受 key file；production／Cloud Run 仍禁止 development impersonation path。本次以 injected token provider／handoff fixture 驗證相同 handler，不以 fixture 宣稱真實 SSO。

npm run dev:local 預設 1010；本 session 入口需支援 node scripts/dev-local.mjs --port 12010 --no-browser 與 check-only。Windows child process 使用 npm.cmd 或等效可執行入口，避免 spawn EINVAL。只停止已驗證屬於本工作樹的 PID。

OrgMaster runtime 只使用 disposable／task-owned data；不得把 production 或 persistent staging database 當 fixture。SSO callback 建立 App-local session 後，permission endpoint 不應依賴 Platform runtime 持續在線。

## 7. 預定程式修改面

| 檔案／模組 | 修改目的 |
|---|---|
| .env.example | 預設 origin 改為 1010，補 local SSO／impersonation 說明但不放真實 identity |
| package.json、scripts/dev-local.mjs、既有 scripts/dev-local.ps1/cmd | daily entrypoint、port override、status／PID ownership；保留單一入口 |
| server/orgmasterGovernanceApi.ts | 將既有 /session 回應升級為 typed app projection；沿現行 actor／published permission evaluator |
| src/governance/apiClient.ts | 定義 v1 contract、runtime shape validation 與錯誤分類 |
| src/auth/OrgMasterPermissionProvider.tsx | provider、selector、dedupe、invalidation、late-response guard |
| src/auth/permissionContract.ts、permissionInvalidation.ts | canonical typed contract、runtime validation、同 App 記憶體內失效通知 |
| src/governance/aiPdmCatalog.ts | 保留 canonical permission code literal type，server／UI 共用 |
| src/App.tsx | 在 authenticated shell 掛載唯一 provider |
| src/components/GovernanceCenter.tsx | 移除 direct loadGovernanceSession；改讀 provider，publish／403 後 invalidation |
| 導覽／module entry 的實際 consumer | 只改接 global permission；resource-specific capability 保持原資料流 |
| src/accountEnrollment/apiClient.ts、src/managedIdentity/apiClient.ts、src/managementMethods/apiClient.ts | 401／403 通知 provider 失效，保留原 resource response 與命令語意 |
| vite.config.ts | 使用 worktree 自有 .codex-tmp/vite cache，local runner 採 runner config loader |
| server/orgmasterGovernanceApi.test.ts | projection allow／deny、401／503、development actor、無 Position 自動授權 |
| src/auth/OrgMasterPermissionProvider.test.tsx | dedupe、principal switch、retry、unmount、late response |
| server/orgmasterSsoHandoff.test.ts、src/auth/AuthGate.test.tsx | 1010／12010 callback、SSO login、logout／account switch 與錯誤語意 |

若最新官方基線已新增同責任 provider 或 endpoint，優先合併到現有 owner，不建立平行檔案。

## 8. 實作順序

1. 先把本文件與 task index 做成文件 commit，fetch 後安全更新 branch；不得從 dirty 主工作樹整包搬移。
2. 完成 1010 default／12010 override entrypoint 與 .env.example，以 check-only 驗證 port ownership。
3. 在 server 建立 typed projection response 與 shape test；先證明 200 denied、401、503 不混淆。
4. 建立 provider／hook，完成 in-flight dedupe、principal binding、invalidate／retry、late-response guard。
5. 改接 GovernanceCenter 與確認屬於 global scope 的 navigation／module consumer；保留 employee／document resource capabilities。
6. 以 deterministic principal A／B、injected service token 與 handoff fixture 驗證 callback、local session、logout／account switch；不得新增產品 fake-login bypass。
7. 跑 focused tests、build 與三畫面 permission-provider browser acceptance；1010 固定埠只驗 runner／UI。本次不執行真實 Platform SSO browser journey。

## 9. 驗收案例

### 9.1 本次 source／simulated acceptance

1. Injected service identity + deterministic handoff 建立 fixture A 的 OrgMaster local session，不連線或變更 Cloud IAM。
2. app shell 首次只呼叫一次 /api/orgmaster/governance/session；切換治理、員工身分、管理辦法三個畫面不因 route／module mount 重取 global projection。
3. Governance navigation 與 manage／publish／simulate action 對同一 permission code 結果一致。
4. management method document／employee resource capabilities 仍由其 server response 決定，不被 global provider 誤放行。
5. 200 + false、401、403 mutation、503／timeout 有不同 UI 與測試結果；503 不得變成 ready all-false。
6. governance publish／active version 變更後只 invalidation 一次；下一次 snapshot 使用新 revision。
7. server 在 stale snapshot 下回 403 時，UI 清除舊 projection、顯示訊息，不自動重送命令。
8. fixture A → B 後，不顯示 A 的 navigation／action；A 的 late response 不能覆寫 B。
9. callback state／PKCE／audience／service identity／account conflict negative cases保持 fail-closed。
10. Position、department 或 org chart 變更本身不產生 permission allow。

### 9.2 下一個 non-production activation session

真實 Firebase principal A／B、OrgMaster service identity 的 ADC impersonation、Platform 1000／12000 → OrgMaster 1010／12010 的外部 Chrome journey、global revoke 與 direct-entry equivalence 本次均為 `DEFERRED / NOT_RUN`。缺少 IAM 時由下一個 session 另行取得 exact project／authority，不回頭擴張本次 source scope。

## 10. RD 驗證與證據

2026-10-28 RD 自查紀錄。工作樹 `C:\VIBE CODING\.worktrees\OrgMaster\dev060-app-permission-provider-20261028`、branch `codex/dev060-app-permission-provider`；基線 `6c8cca6428419549ed44f8fe3dcb78c18ac28e0b`。主控同步確認 `origin/master=4e6744adc28f99590e629f1b35ad62a69fe7cb26` 已為祖先、behind 0，同步未改變本任務 dirty 內容。

已實作 versioned projection、唯一 authenticated-shell provider、GovernanceCenter／治理及管理辦法入口共用 selector、publish／active-version 後單次失效，以及 resource API 401／403 的失效通知。`management.crossAppOverride` 沿原 server guard 保留，employeeId 由 AuthGate 取得。資源 capability、server 當下授權與既有 v2 SSO handler 均維持原責任；未新增產品 fake login。

| 檢查 | 實際結果與限制 |
|---|---|
| 全 app suite `npm test -- --testTimeout=30000` | 188 files PASS、2 skipped；1090 tests PASS、5 skipped。此證據早於最後 notice／launcher／cache 修正；受影響部分另跑下列 focused checks，未把跳過案例列為 PASS。 |
| 恢復後 focused contract／provider／治理 UI unit tests | 10 files、110 tests PASS；含 AuthGate、SSO、projection、provider、治理及 client。`--configLoader runner`，30s test timeout。 |
| 補足的 SSO negatives／server projection／module entry | 3 files、56 tests PASS；涵蓋錯誤 state／audience／service proof、account conflict、Position／department／任職不自動授權，以及 denied module 不可點擊或拖曳。與上一列有重疊，不相加。 |
| `npm run test:dev-004:auth` | 5 files、35 tests PASS；證據可重用，後續未改 AuthGate 或 auth handler。 |
| TypeScript `tsc --noEmit` | 最後 source checkpoint PASS。 |
| `node --test scripts/dev-local.test.mjs` | 10/10 PASS；含真實暫時 listener 的 Windows PID 查證與不干擾未知程序。 |
| 1010／12010 `dev:local --check-only` | 兩埠皆 AVAILABLE；只證明啟動前埠檢查，未啟動 App。 |
| build | 中途 `npm run build` PASS；最後 source／cache 修正後的 final build 因容量預檢 BLOCKED，未執行，不宣稱 exact-current artifact PASS。 |
| 三畫面 local runner／browser acceptance | 全部 `BLOCKED / NOT_RUN`；沒有 UI screenshot、實際 request count 或 runtime evidence，不以 unit tests 取代第 9.1 節 UI 驗收。 |
| required Production Source QC／PR | 未 push／未執行；本 checkpoint 不代表 required CI 或獨立 QC 通過。 |
| 真實 non-production IAM／ADC／外部 Chrome SSO | 依原人類決策 `DEFERRED / NOT_RUN`；正式環境亦未操作。 |

第 9.1 節 10 個案例的 deterministic 層已覆蓋 callback/local-session、同 shell dedupe、typed allow/deny、resource capability 保留、401/403/503/timeout、publish/activation invalidation、403 不重送、A/B late-response isolation、SSO fail-closed 與無 Position 自動授權。三個實際畫面、真正 route 切換 request count、UI 訊息／資源操作及固定埠 runtime 仍是原必要驗收，全部待執行。第 11 節完成條件尚未全數成立。

原始失敗保留在本工作樹 `tmp/`：首輪 68 PASS／27 FAIL（舊 GovernanceSession owner fixtures）；改接 provider 後曾有一項 5s timeout（當時與 build 並行），沿專案 30s 契約重跑通過。Windows PID 查詢的兩次失敗由獨立 readback 確認 `spawnSync powershell.exe ETIMEDOUT`；上限調為 15s 後真實 PID 測試通過。未把原失敗刪除或改記為 PASS。

依賴由 exact-lock 現成 release worktree junction 重用，450 個已安裝 package manifest 比對無版本差異、44 個 optional package 缺省，未安裝套件。初次 Vite cache 曾沿 junction 寫入 `.vite`／`.vite-temp`；共享 cache 留存，後續改用 task cacheDir 及 runner loader，未清除共享內容。

容量限制：Governor session `a5bea155-2945-48dc-83e9-f9eaaedce5f8` 的 `dev060-final-build`（build，25 GiB reservation）與 `dev060-local-browser`（integration_test，10 GiB reservation）均為 BLOCKED。當時 C: free 17,596,735,488 bytes，protected floor 25,534,503,118 bytes；沒有 risk acceptance／lease，沒有執行 blocked operation。這些是資源預留值，不是本任務實際耗用量；下一次需以同範圍有效容量 admission 才能續跑。

後續命令沿原範圍保留，容量限制解除後執行受影響的 final build 與全部 local UI 驗收：

~~~powershell
npx vitest run --configLoader runner --testTimeout=30000 server/orgmasterSsoHandoff.test.ts server/orgmasterGovernanceApi.test.ts src/auth/AuthGate.test.tsx src/auth/OrgMasterPermissionProvider.test.tsx
npm run test:dev-004:auth
npm run build
git diff --check
~~~

本次 Browser evidence 記錄 exact commit、URL、fixture、三個畫面、projection request count、HTTP status 與 sanitized error／correlation ID，只證明 local runner／projection；禁止記錄 cookie、token、ADC 或驗證碼。真實 SSO browser evidence 留待下一個 activation session。

本機測試 log、容量機器結果與接手 checkpoint 位於既有 `tmp/dev060-main-handoff.md`；最終 local UI／CI 未通過前不將本 DEV 標成完成，不建立 production release 主張。

## 11. 完成與停止條件

完成條件：

- 1010 default／12010 override 可由 task-owned entrypoint 啟動且不干擾未知 process。
- SSO callback 與 app-local session 的 deterministic focused tests 通過。
- global provider 只有一個 owner，已知 consumer 不再 direct fetch 同 projection；resource projections未被錯誤合併。
- 401／403／503、fixture switch、invalidation 與 late response 均有 focused test及 local UI 結果。
- 真實 non-production IAM、ADC impersonation 與外部 Chrome SSO 明確為 `DEFERRED / NOT_RUN`，不列入本次 PASS。
- 本 repo diff、測試與 PR 可獨立於 Platform／AI-PDM review。

遇到下列情況只停止受影響動作並記回本 DEV：

- consumer 實際屬於不同 application／workspace／employee／document scope。
- server authorization 缺失，或 projection 需要新增資料庫 schema 才能計算。
- local test 會寫入 production／persistent staging，或需要下載 service-account key。
- 任何 non-production／production IAM、Secret、credential authority、authorized domain 或 production runtime change；本次一律 deferred。
- 工作樹出現未知且與本任務檔案重疊的修改，或 port owner 無法驗證。

資料庫 migration、IAM／Secret、正式資料、production deployment、真實 non-production SSO activation、其他 App provider 及跨 App cache 均不在本任務。

