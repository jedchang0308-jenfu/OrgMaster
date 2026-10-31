# DEV-060：OrgMaster 地端 SSO 與應用內單一前端權限投影

- 現行切片（2026-10-30）：§13的local Principal sandbox仍在進行；主責回報真 PostgreSQL forward batch `5425902e-efca-4e9f-b8ec-f3a8d1364963` 已 audit-bound、舊批次保留 retired、fixture hash 不變，session GET 200。Chrome 組織圖／員工／職位各一筆 projection request 均 200。此證據限於已跑案例，不代表 lifecycle、完整 allow/deny、PR／CI 或 release 完成；§12的既有成果維持前階段範圍。

- 文件成熟度（§12 前階段）：Source / Local Acceptance Complete；原契約驗收範圍保持不變。
- 執行狀態（§12 前階段）：RD Self-check Passed / Local Acceptance Passed / PR Review Pending；真實 non-production activation DEFERRED。
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

<a id="local-synthetic-fixtures"></a>

## 13. 現行切片：版本化虛構身分與生命週期fixture（2026-10-29）

Native=`ORGMASTER/DEV-060#local-synthetic-fixtures`；跨專案來源=`JENFU/DEV-021#local-principal-sandbox`。共用契約與A～J任務鏈唯一維護於Platform `ai-doc/specs/DEV-021-platform-app-permission-projection-contract.md` §14，本文只定義OrgMaster責任。參與者是Platform DEV-021、PDM DEV-126與FMS DEV-069；DEV-057不重開，DEV-059保留既有正式FMS producer來源。

### 13.1 Fixture owner與版本join

OrgMaster提供版本化synthetic Principal／Employee／company／role assignment／scope／grant及其lifecycle資料，供Platform local issuer與App server透過typed contracts消費。OrgMaster不簽發共用session；App capability由各App定義。正式canonical人員資料與原writer保護維持既有責任，日常fixture不讀取或複製正式任用、provider session、密碼或credential。

fixture manifest至少含common contract version、fixtureVersion／既有規則下的內容hash、sandboxId／generation、catalog version／catalogSha256／roleDefinitionHash、來源定義版本；每個scenario含虛構Principal／Employee、identityIssuer／subject、company、有效scope／role／grant、期限、authEpoch、accountLifecycleVersion／profileVersion及預期狀態。case可有意配置invalid／expired／revoked，但不得把缺失資料自動補成active。

PDM定義沿`ai-pdm.role-catalog.2026-10-10.v7`九角色；owner檔為`config/catalogs/ai-pdm-role-catalog.v7.json`，reader在`server/aiPdmRoleCatalogRepository.ts`。FMS沿自己的版本catalog／protected grants。只同步定義與已審查版本，不同步正式人員任用，也不藉管理職位自動配權。檔案raw SHA與catalogSha256是不同欄位，沿現有validator驗證，不能拿其中一個覆蓋另一個。

fixture importer／bootstrap僅寫task-owned OrgMaster資料，維持typed Principal、scope／期限、CAS、audit及runtime非owner限制；透過版本contract供其他App讀取，不能直接寫PDM／FMS core。需要schema時用`db/migrations`新forward-only migration；若純fixture可沿現有factory完成，不為文件新增DDL。

### 13.2 交付切片與驗收

| 待辦 | 依賴與交付 | 完成證據 |
|---|---|---|
| O60-A 來源／定義收斂 | Platform共用profile；核對專屬writer、現有v7及FMS版本、typed readers／fixture factory | 記錄來源與版本join；未混入既有dirty server差異 |
| O60-B 虛構fixture | active／無grant／wrong company／wrong scope／expired／revoked／disabled scenarios，正反資料完整 | parser／owner factory測試及隔離PG typed readback |
| O60-C lifecycle | lifecycle變更傳回Platform權威更新epoch／撤銷，App下次protected request失效；reset與generation一致 | 停用／撤權／期限、CAS、舊session拒絕；故障不產生半套active grant |
| O60-D OrgMaster consumer | 自身AuthGate／App session adapter接common profile，保留唯一OrgMasterPermissionProvider與resource projections | 正常OrgMaster三視圖、換帳號／late response、401／denied／unavailable分流 |
| O60-E PR／CI／地端交付 | 合併本owner切片；可與其他repo獨立交付 | focused tests、typecheck／受影響build、SQL變更時DB boundary；provider required CI與protected master merge；1010／12010交付 |
| O60-F 真實鏈／發布準備 | 若正式producer／consumer受本次影響，驗證真實非正式owner publication及相容性 | 真實身分／授權／撤權獨立證據；local fixture PASS不代填 |
| O60-G 發布／結案 | 自有正式範圍沿DEV-040及`npm run deploy:production`；common任務鏈H～J | 自有source／artifact／native receipt與served version；正式拒絕sandbox、正常OrgMaster權限及受影響FMS contract readback；回復與資源交接 |

現行（2026-10-30）：O60-A已建立獨立writer並核對官方基線。O60-B／D仍為`IN_PROGRESS`：native materializer已加入可驗hash-chain的publication audit event；主責回報真 PostgreSQL forward batch=`5425902e-efca-4e9f-b8ec-f3a8d1364963`、source revision=`99682eed…35a458`、fixture hash不變、舊批次保留為retired、`audit_bound=true`。`/api/orgmaster/governance/session` 回應200；Chrome組織圖、員工、職位各僅發出一次permission projection request且均回應200、無permission error。OrgMaster source範圍50項focused tests與strict TypeScript通過；另一child的7項fake-SQL測試屬合成證據，與主責真PG證據分開。

本輪補充的隔離合成profile lifecycle證據見[Platform DEV-021 R1 JSON](<C:/VIBE CODING/.worktrees/Jenfu-Platform/dev021-local-principal-sandbox-20261029/ai-doc/qa/evidence/DEV021-LOCAL-PROFILE-LIFECYCLE-20261030-R1.json>)：`profile_changed` event=`5f7a9290-7ae1-42ea-8a62-ed6d594e5d75`，lifecycle version 1→2，central auth epoch=3；錯 generation／fixture hash、stale／future version及foreign Principal投影均被拒絕，完全相同的native projection／event重播未再次變更或增加epoch。四個舊App session均401；首輪fresh PDM login的401失敗保留，修復後四個App readback均200。這只證明該isolated synthetic profile、source及runtime；不證明reset／generation完整一致、真實managed Principal、production、IAM或Secret。O60-C lifecycle因此仍為部分進行中；reset與generation案例待驗，真實managed-identity lifecycle撤權沿§12既有決定維持`DEFERRED / NOT_RUN`。

External-specialist來源修正採新增`orgmaster.local-principal-fixtures.2026-10-30.v2`，common envelope仍是`jenfu.local-principal-fixtures.v1`。V2 factory以同一個`createdAt`產生90天project grant；native materializer將有效的內部active sponsor寫入`sponsorEmployeeId`，並設`reviewDueAt = validUntil - 30 days`，同時保留external Employee無department／position／assignment anchor。原v1 builder與既有hash `a4d2ab8fa27246339d8bed2a7a5bc5cd5b27fcb8fc4f4007248f55d87905505f`固定不變；本輪未改寫immutable envelope、既有manifest或generated data。未來若需更新sandbox，應以單一新`createdAt`呼叫`buildLocalPrincipalSandboxFixtureV2({ createdAt })`，將同一時間交給native materializer，並建立新的sandboxId、generation及profile；只發布新的versioned fixture/hash，不覆寫舊生成物。Fixture／native／profile及OrgMaster callback focused tests共27項通過；callback測試使用mock client／pool，只證明v2 fixtureVersion/hash傳入token-proof API，不是live API或DB驗證。本輪未執行build、DB、runtime／cloud或production操作。

O60-C reset／generation、完整allow/deny、PR／required CI及release仍未完成；上述source與隔離lifecycle證據不代填未跑案例，也不結案。共用cluster狀態見Platform DEV-021 §14.14。

### 13.3 Conformance與交付條件

common／fixture／catalog版本hash不符、Principal或Employee停用、grant過期／撤銷、company／scope不符應明確拒絕。fixture endpoint、bootstrap、lifecycle及reset控制面同時要求development＋loopback＋explicit flag；正式／非loopback不可啟用，不能用dev cookie／headers覆寫正式Principal。中央session authority不可用時回unavailable，不自動採用固定角色。

隔離PG需證明typed owner資料實際持久化、contract view／runtime ACL正確、peer core不可讀、lifecycle與audit一致；Chrome證據另證明正常使用入口及單一投影。日常sandbox、真PG、真實Google／owner publication、production各按原證據層記錄。

正式發布輸入不帶fixture資料或local key；需要發布的owner先維持新舊contract相容，consumer就緒才啟用。自有發布失敗依DEV-040既定traffic→tag→entry recovery，不能回退資料或跨改其他App。未受影響正式artifact只需有效相容證據，無需為參與整合重部署。

DEV-060新增切片只有在O60-A～G適用工作完成且主責收到可追溯結果時結案；若已部署但必要功能／撤權未驗，標`DEPLOYED / ACCEPTANCE_PENDING`。正式target或外部身分條件缺少只阻塞相依階段，source／隔離驗證可繼續。現行source／隔離runtime進度沿§13.2及Platform DEV-021 §14.14記錄，正式操作尚未執行。

## 14. FMS 人員任用的 owner workspace

FMS `/admin/users` 由正常 Platform OrgMaster launch 進入 `/fms/role-assignments`。治理操作在 OrgMaster 自有已驗證 session 內完成；不轉貼 FMS actor、不沿用本地 users 或開發身分 headers。普通 FMS 判權仍讀原 Tier-0 投影。

- `GET /api/orgmaster/governance/applications/financial-management-system/employees` 是 `orgmaster.fms-employee-directory.v1`：沿現有 FMS workspace owner role 加 exact-Principal `role_assignment.manage`；只回 employeeId、displayName、未具名權威提供時為null的employeeNumber、active／assignable，以及 directoryRevision、governanceRevision、readAt／cursor。搜尋 q 最多80字，預設20／上限50；cursor綁搜尋與版本。不得回整份組織資料、聯絡或財務個資。
- 既有 role-assignments workspace 回傳目前任用、canonical可指派roles及原preview／publish權限決策。新增任用需在職Employee且角色可指派；撤銷使用既有assignmentId與其Employee／scope／role，停用Employee仍可撤銷既有任用，不藉此開啟新任用。目標與角色均需明確選擇，不預選owner角色。
- preview／publish／commands收據沿原OrgMaster API與CAS、目錄綁定、原子audit及Principal v2 session／epoch fence。收據讀取要求既有FMS任用管理權限，且只解析此App任用namespace；重播仍驗當下publish權限。
- 結果未知時，原commandId／requestHash／previewHash按Principal存於分頁sessionStorage；不存憑證或任用輸入。重新載入後仍先查原收據，not_found不冒稱拒絕或清除；`COMMAND_NOT_OBSERVED`等不確定結果不得改發新命令。資料版本衝突提供重新載入／預覽，不能靠使用者反覆F5。
- 工作區返回入口 `/api/orgmaster/governance/applications/financial-management-system/return` 只使用已設定SSO broker（或明確local sandbox平台origin）組固定Platform FMS launch；不接受request提供目的地。回到FMS後由其原權限provider明確刷新一次。

此接法重用OrgMaster的人類session與寫入權威，不新增delegated-human-session、IAM或Secret。來源、隔離Chrome、真實SSO與正式發布分開驗證，進度只回填原DEV-060／JF-FMS DEV-069與DEV-068。

隔離native initializer可由顯式`fixtureSource.fmsManagement={scenarioId,capabilities}`建立管理測試資料，預設不建立。OrgMaster只接受既有active `human_personal`虛構身分，原fixture的公司只接受固定FMS業務ID `jenfu-machinery`／共同隔離ID `company-jenfu`，原fixture與native policy均須有company-jenfu workspace有效`role-owner`；capabilities只限原FMS任用兩項及十項protected operations，逐項明列、不得重複。grant綁其exact Principal／Employee及原任用期限，納入同一policy publication／audit與artifact source hash；不由HTTP／runtime呼叫，不更新既有publication，不授予PDM override或system_admin。非owner、錯公司／scope、停用或不支援capability拒絕。一般財務身分的403案例保留，新增管理fixture只供允許案例。

Platform地端runtime的fixture readiness與bootstrap精確驗證分開：bootstrap仍以原publication／grantVersion逐欄比對；runtime可接受較新native publication中語意完全相同的任用。只將grantVersion對齊已驗證的現行出版版本；OrgMaster自身虛擬catalog的id／整份policy hash可隨新版更新，角色definition hash仍須相同。外部App catalog／角色definition、公司／scope、status與有效期、Principal／Employee、lifecycle／epoch檢查不變；任用撤銷、新增／改角色等差異不能藉publication升版取得fixture准入。不得重寫fixture、已套用publication或舊收據以消除差異。

OrgMaster的auth mode只驗runtime target／listener／私有profile與既定catalog配置，不逐一讀全部scenario的任用資格；單一Principal無任用或已停用不使其他人登入入口關閉。每次session仍驗native Principal／Employee／epoch、immutable fixture identity與lifecycle/session binding、有效owner publication及中央introspection。業務權限由原生current owner projection／每次操作writer判定，不能以初始fixture grant等同登入服務配置。中央明確401／403拒絕映射為該session失效；真正authority／target不可用仍503。bootstrap精確內容驗證保留。
