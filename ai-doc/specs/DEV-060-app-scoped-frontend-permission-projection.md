# DEV-060：OrgMaster 地端 SSO 與應用內單一前端權限投影

- 文件成熟度：Source / Local Acceptance Complete；原契約驗收範圍保持不變。
- 執行狀態：RD Self-check Passed / Local Acceptance Passed / PR Review Pending；真實 non-production activation DEFERRED。
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

2026-10-28 RD 自查；工作樹 `C:\VIBE CODING\.worktrees\OrgMaster\dev060-app-permission-provider-20261028`、branch `codex/dev060-app-permission-provider`。原 source checkpoint `da5ee08f2e7b90e8cb1619619bbc97c315447343`，文件修正 HEAD `d1919a70d29ed78dd58deefb057386a62c14ae7e`；其後 browser 發現提示推動工作區高度，已以單一 positioned feedback 修正，並在兩埠驗證 app top=0、無 document-height overflow。最後產品修改僅 provider feedback／CSS；之後的 test、runner 與文件不改產品行為。

已實作 canonical versioned projection、唯一 authenticated-shell provider、global consumers、publish／active-version 與 resource API 401／403 invalidation；保留 `management.crossAppOverride`、AuthGate actor、resource response 及 server 當下授權，沒有新增產品 fake login。

| 檢查 | 實際結果與限制 |
|---|---|
| 最後 source typecheck + client/server build | PASS；`tsc --noEmit`、Vite client build、Vite SSR build，兩個 Vite 階段使用 `--configLoader runner` 避免共享依賴 cache。UI 修正後重驗，見 `tmp/dev060-post-browser-build.log`；既有 chunk-size warning 保留。 |
| 最後 provider／治理／module focused checks | 3 files、24 tests PASS；含 publish 後 revision-2、activation 後 revision-3 的 state readback。 |
| 恢復後 focused contract／provider／治理 checks | 10 files、110 tests PASS；其後受影響部分由上一列重驗。 |
| SSO negatives／server projection／module entry | 3 files、56 tests PASS；與其他 focused suite 重疊，不相加。 |
| 全 app suite | 188 files PASS、2 skipped；1090 tests PASS、5 skipped。此證據早於最後局部修改，只重用未受影響範圍；跳過案例未列 PASS。 |
| Auth suite／launcher | auth 5 files、35 tests PASS；launcher 10/10 PASS。後續未改 auth handler 或 launcher。 |
| 1010 default／12010 override | 兩個 task-owned runner 實際啟動，HTTP 200 與 exact-worktree listener PID 查證通過；結束後兩埠皆 AVAILABLE。 |
| 1010 local browser | **10/10 PASS**；1440×900、Chromium 153.0.8010.12，manifest `output/playwright/dev060/1010/2026-10-28T12-36-30-967Z/manifest.json`。 |
| 12010 local browser | **10/10 PASS**；同 viewport／browser，manifest `output/playwright/dev060/12010/2026-10-28T12-38-10-054Z/manifest.json`。 |
| PR／required CI | [Draft PR #186](https://github.com/jedchang0308-jenfu/OrgMaster/pull/186)。`d1919a7` 的 Production Source QC PASS；後續最新 HEAD 狀態以 PR 為準，本機 RD 自查不宣稱獨立 QC。 |
| 真實 non-production IAM／ADC／外部 Chrome SSO | 依原決策 **DEFERRED / NOT_RUN**；沒有正式環境操作。 |

### 10.1 原第 9.1 節驗收對照

| 原案例 | 本次實際證據 |
|---|---|
| 1：injected identity／handoff／App-local session | 1010／12010 deterministic HTTP A/B callback、HttpOnly local session、broker-independent session read、logout PASS；不冒充外部 SSO browser journey。 |
| 2：三畫面共用一次 global projection | 兩埠治理、員工、管理辦法切換後，首次 shell projection request count=1。 |
| 3：navigation／actions 一致 | typed selector、治理 action／module focused checks，加上 browser ready-denied 停用同 scope 入口；workspace／resource 自身限制仍保留。 |
| 4：resource capability 不被 global 誤放行 | 兩埠管理辦法 create=false 與 employee identity resource actions=false 的 UI 測試 PASS，global admin allow 仍無法產生資源 action。 |
| 5：200 false／401／403／503／timeout 分開 | 兩埠 ready-denied 無 retry error、401 清 shell 並提供登入恢復、503／timeout 顯示 retry、403 顯示撤權提示；各有 screenshot／status 紀錄。 |
| 6：publish／active-version invalidation | 兩埠各操作只增加一個 projection request；focused state readback 使用新 revision。 |
| 7：stale projection 下 403 | 兩埠真實 client 對 injected 403 的命令只送一次，provider 失效、入口停用並顯示提示，未重送命令。 |
| 8：A→B／late response | 兩埠既有 development profile A logout／B login 後無 A 的治理入口；principal switch／unmount／A late response 由 provider focused tests 查證。 |
| 9：SSO negative contracts | state、audience、PKCE、service proof、account conflict HTTP／contract tests fail-closed PASS；真實非正式 IAM journey 仍在第 9.2 節 deferred。 |
| 10：組織主資料不自動授權 | verified published grant 撤銷後，即使加入 Position、department、任職與組織圖來源，server projection 仍全 denied。 |

Browser evidence 為 **LOCAL_SIMULATED**：既有 administrator／employee development profiles；permission status／revision、no-op publish／activation 與 rejected mutation response fixtures；resource-denied fixtures；為顯示既有員工身分 UI 而在測試頁面注入 employee-number feature discovery。未新增產品 fake-login／authority bypass，沒有 token／cookie／ADC／驗證碼紀錄；sample data 僅在此工作樹的 `data/`，有 `.dev060-disposable.json` marker，保留未刪除。Browser runner 已收斂為 `scripts/dev060-permission-browser.mjs`，拒絕未知 data 或非 exact-worktree runtime；需由 Host 供應既有 Governor session／script binding 後執行。

### 10.2 首敗、來源與資源收尾

- 首輪 unit 68 PASS／27 FAIL（舊 session owner fixtures）與一項 5s timeout 的後續獨立失敗均留在 `tmp/`；改接 provider、沿專案 30s timeout 重驗後通過。
- Windows PID 查詢 5s timeout 的兩次失敗由 readback 證實；改為有界 15s 後真實 listener 測試通過。
- 第一個 browser failure 保留於 `output/playwright/dev060/1010/manifest.json`、`failure.png`：fresh workspace 首次並行初始化先 500 後 200，permission session 200、無 pageerror。先以單次 API bootstrap 完成 fixture，再顯式等待 workspace ready；沒有放寬授權或省略案例。早期 8-case、9-case 與最終 10-case 各自保留 timestamped evidence，未覆寫首敗。
- 依賴沿 exact-lock 現成 release-worktree junction 重用，450 個實際 package manifest 無版本差異、44 個 optional package 缺省；未安裝套件。初次共享 Vite cache 留存未刪，後續使用 task cacheDir／runner loader。
- 原 build／integration 預檢 BLOCKED 不是產品失敗。人類其後明確接受本次容量風險，原 session `a5bea155-2945-48dc-83e9-f9eaaedce5f8` 取得 HUMAN_RISK_ACCEPTED。
- build lease `a63ad416-95f5-4eb3-83eb-1b4a3868c8fe` 與既有 10 GiB browser lease `2cf54726-5b41-4d1a-bd1f-96531cbb6685` **均 RELEASED / completed**；主控已明確將 UI 修正後 build refresh 納入同一 10 GiB integration 範圍，未建立第二個 concurrent reservation。
- 自有 listener PID／Chromium 皆停止並解除 fingerprint 登錄，1010／12010 已釋放；其他 session／專案未被停止。原 `tmp/dev060-main-handoff.md` 留存 exact SHA、PR／CI、manifest、lease receipt 與保留資料責任；`tmp/` 未加入 PR。

本次 source／deterministic／local UI 範圍已完成；PR review／最新 required CI 沿既有流程，不 merge／release。真實 non-production activation 維持第 9.2 節 **DEFERRED / NOT_RUN**，未縮減原驗收分母。

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

## 12. P5 續授權 checkpoint（2026-10-28）

使用者已指示續做真實 non-production SSO 及三 repo protected merge，並完成 ADC 授權；前文 P5 deferred 是先前階段快照，現行整鏈狀態以 Platform DEV-021 §12 為準。沒有 production release／資料／IAM／Secret 授權。

本輪修正 owner transform，限制 001–009 歷史 owner rebind 並保留 ACL recipients，010 之後只 unwrap；既有 001–010 package hashes 不變。46 項相關 source／runner tests 與 DB boundary 通過，獨立唯讀 cross-review 無阻擋。主控按原始來源順序在 task-owned 15432 cluster 修復 23 項受影響 Platform-role ACL（包含 REVOKE），未重播 migration 或改舊收據。

真實 SSO 後 `/api/auth/me` 已確認 Principal A、沒有 developmentProfile；SSO 模式的 profiles endpoint 404。AuthGate 先驗證真實 session，server 及下游 resolver 不再讓 dev cookie／headers 覆蓋真實 Principal，logout 使用正常撤銷路徑；純 local 角色模式保留。113 項相關測試與型別檢查通過。正常 workspace／permission projection 200，Platform 全域登出後 OrgMaster `/me` 及 projection 401。

隔離 workspace fixture 曾缺合法 manifest entry 與預設層級，已使用 owner factory 修補，不改產品 guard 或角色。三視圖切換只有一次 projection request；既有 session 直接進入 App 與 Portal SSO 的 permission map 相同。錯誤 callback 400，原 Principal 不變；SSO 模式 dev profiles 404。兩個真實 service-identity／audience 負測均在 broker 回 401。

使用者已明確決定 Principal 撤權案例待補：目前 Firebase A／B 不具有 managed-identity lifecycle 資料，現行 owner API 禁止直接停用 active admission；未用登出、app-grant withdrawal 或偽造 AAL2 代替。其餘本輪 P5 項目已完成；Cloud SQL IAM、Google Workspace 端登入及完整業務流程不在本次通過聲明內。

本任務 Chrome、三個 App 與 PG15432 已按指紋停止，12000／12010／12020／15432 釋放；12 個尚待釋放的 runtime registry records 已核銷，capacity lease 釋放、session ended。資料／私密設定與 ignored 證據保留供後續，未入 Git。最新 required CI／merge 狀態以 PR #186 provider 為準，沒有 production 變更。
