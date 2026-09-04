# DEV-042：單層功能工作台與可收合清單明細實作契約

狀態：`RD Implementation Complete / Browser QA-QC Passed / Merged to master`

> **2026-09-04 DEV-046 intentional successor（現行產品方向）**：DEV-042 的完成狀態、single-layer launcher、panel owner、route／session authority與歷史證據保持有效；但 list-only module、固定 `242px／190px` 清單寬度、detail 關閉即移除右欄，以及 Process 保留專用最外層三區例外，已由 [DEV-046](DEV-046-unified-list-detail-workbench-framework.md) 明確取代。現行待實作契約是八個指定功能共用左清單＋永遠存在的右detail frame、click／Arrow／Escape互動、帳號層級可調清單寬度及DEV-041 typed relation extension path。本文件後續相反敘述只作DEV-042歷史provenance，不得覆寫DEV-046。

> **2026-09-02 repository integration override（現行）**：DEV-042 single-layer workspace與DEV-041 relation baseline已由final integration commit `4e3b2ce`收斂，並經merge commit `c8cc16f`進入`master`。因此本文件舊段落中的candidate freeze、commit、merge authorization pending只作整合前provenance；現行無獨立開發或Git尾項。deploy／release未被本文件授權，僅在使用者另行提出release型指令時進入共用gate。

來源：`USER-2026-09-02-SINGLE-LAYER-WORKSPACE-INTENTIONAL-REPLACEMENT`、`USER-2026-09-02-DEV042-RD-IMPLEMENTATION-READY`、`USER-2026-09-02-DEV042-RD-TECH-LEAD-REVIEW`

父交付點：DEV-039；必要回歸基線：DEV-041

架構決策：`ai-doc/adr/ADR-009-composable-workspace-shell-boundary.md` 的 DEV-042 amendment

## 0. 現行判定

- 本文件已把產品決策、現況 symbol、目標 state／route、模組差異、檔案 allowlist、分片、失敗復原與 QA／QC 證據契約固定到 RD 可直接派工。
- `P0 readiness gap=0`；`P1 readiness gap=0`。RD 可依 S0→S7 實作，不需再發明入口、第二 state store、第二 router 或替代 DnD 架構。
- DEV-042 production implementation 已完成；targeted automated gate、typecheck、build 與 source scan 通過。完整回歸 `174 files／716 passed／1 skipped`；先前四個 DEV-040 governance／catalog 契約漂移已修正。Fresh browser QA／QC 已完成 E1～E9，並以唯一 manifest 固化證據；final integration=`4e3b2ce`、merge=`c8cc16f`。本DEV已完成且納入`master`，只保留未被要求的deploy／release邊界。
- 本文件不授權 candidate freeze、commit、merge、deploy 或 release。

### 0.1 RD Technical Lead Review（2026-09-02）

結論：`Pass after contract optimization`。

核心因果鏈：同一module具有drawer與panel兩條入口／context → 開啟、選取與render ownership需雙向同步 → 使用者多一步且跨region明細容易串位 → 移除完整drawer控制流並保留唯一panel owner，才是根因修正。只刪按鈕或再包一層facade不通過。

| 發現 | 原契約風險 | 已採最小修正 |
|---|---|---|
| detail雙重權威 | `PanelSessionState.detailOpen`與獨立route state可能漂移 | 只保留`WorkspaceSessionState.openDetails`為runtime authority；`WorkspaceRouteState.openDetails`與URL是既有`routeFromState／reconcileRoute`投影 |
| open intent重複語意 | optional context再加`contextMode`可形成矛盾組合 | 未帶context＝preserve；帶context＝sanitize＋replace；source只作provenance |
| registry過度分類 | `none／collapsible／embedded`三態沒有三種共用runtime行為 | 只保留`supportsCollapsibleDetail:boolean`；其他composition由adapter擁有 |
| allowlist／scan過寬 | 可修改未需變更的領域page，且source scan會誤掃prohibition tests | production allowlist縮至必要shell／adapter；process與document page只跑regression；scan排除tests |

現有`App.tsx`仍是較大的composition root，但本DEV不另外抽出workspace service／coordinator：新增服務不會減少目前state owner，反而增加一次轉送。只允許在App內建立pure context／EntityRef helper；若同一映射未來被三個以上非App consumer使用，或integration test無法在不掛完整App的情況驗證，才另立重構DEV。這是明確re-entry trigger，不是隱藏技術債。

### 0.2 Implementation evidence（2026-09-02）

- 已依 S0→S6 實作 single-layer replacement：移除正式 drawer／promotion runtime，十個模組由頂部 launcher 統一 open-or-focus；清單型 panel 採相鄰 list-detail，明細由 session-owned `openDetails` 控制，URL 以 `details` 投影；窄 panel 以 container query 轉為同一 surface 的 list 或 detail。
- DEV-042 targeted gate：第一組 `8 files／34 tests passed`；第二組 `6 files／16 tests passed`。覆蓋 launcher、state／route、shell、surface primitives、三個 adapter、single-layer integration，以及 Process／Management Method required regression。
- `npx tsc --noEmit --pretty false` 通過；`npm run build`（client＋server）通過；production source prohibition scan 無輸出；`git diff --check` allowlist 通過。
- `npm test -- --run --pool=forks --maxWorkers=1` 結果為 `174 files／716 passed／1 skipped`（測試檔）；四個先前 DEV-040 governance／catalog migration／validation failures 已修正為符合目前 workspace-scoped catalog contract，完整回歸不再阻擋本 DEV。
- 已在既有使用者 localhost:5000 工作台完成探索性 smoke（非正式 S7 evidence）：頂部功能選單十個項目均可直接 open-or-focus；員工 panel 可由清單開啟相鄰明細、關閉後保留清單並恢復來源列 focus；未出現 `WorkspaceQuickDrawer`。此 smoke 未建立 fresh fixture、未使用 task-owned runtime，故不取代正式 Browser S7。
- Browser S7 已以 fresh B16 fixture／task-owned `127.0.0.1:5080` 完成 E1～E9；管理辦法 E5 的 local-development authorization、E7 layout split／resize／pin／close／zero-panel、DEV-041 四向 aggregate、auto-pan 與 diagnostics 均有可採用證據。唯一 manifest 為 `output/playwright/dev042/manifest.md`；fixture 已封存，task-owned 5080 runtime 已停止且 port 已確認釋放，狀態維持 `Browser QA-QC Passed`。

## 1. 問題、目標與非目標

### 1.1 真正問題

同一模組的原實作同時有 `DrawerWorkspaceModuleId`、drawer session、drawer renderer、promotion intent 與 panel context。使用者要先理解「快速清單」和「完整工作台」兩種容器；RD 也必須同步兩條開啟與選取路徑。這是入口與 state owner 重複，不是按鈕文案問題；DEV-042 的目標是移除這組重複控制流。

### 1.2 目標

1. 頂部「功能」是所有十個模組的唯一正式入口；點擊後只執行 open-or-focus。
2. 每種 module type 仍最多一份 panel；已開啟時保留其 context、layout、scroll 與 canvas viewport。
3. 有獨立明細的清單型模組，在同一 panel 內提供清單與可收合明細；關閉明細不關閉 panel、不清除已選項目與清單脈絡。
4. 畫布、設定中心及已自帶完整清單／畫布編排的 workbench 保持其領域結構，不製造空白欄。
5. 完整保留 DEV-039 panel composition 與 DEV-041 relation placement。

### 1.3 非目標

- 不新增 domain entity、schema、migration、API、permission、Command、resolver、MIME、第三方 DnD／dock 套件或第二 layout store。
- 不允許同類 panel 多實例，不重寫 `WorkspaceLayoutV1`，不改 DEV-041 effect policy、auto-pan 或 mutation owner。
- 不把各領域 list／detail 寫成 mega component；共用只限 layout、detail visibility、focus 與容器語意。
- 不新增手機 mutation；手機繼續依專案最高原則唯讀。

## 2. 規格影響與權威邊界

### 2.1 Intentional Replacement

DEV-042 只取代 DEV-039／ADR-009 中以下內容：

- `DrawerWorkspaceModuleId` 與 `WORKSPACE_DRAWER_MODULES`。
- descriptor 的 `surface: 'direct-panel' | 'drawer-panel'` 分流。
- `WorkspaceSessionState.drawer`、`OPEN_DRAWER`、`CLOSE_DRAWER`。
- `PromotionSource`／`PromotionIntent` 中 drawer-to-panel promotion 語意。
- `WorkspaceQuickDrawer`、`renderWorkspaceDrawer`、`drawerRenderers` 與「在工作台開啟」。
- launcher 先開 drawer 再 promotion 的行為。

以下仍由既有權威擁有，不在本 DEV 重建：

- DEV-039：`WorkspaceLayoutV1`、tab／split、resize、pin、close guard、overlay hosts、layout persistence、canonical workspace route 與每類一份 panel。
- DEV-041：`entityDrag.ts`、`relationPlacement.ts`、shared relation bindings、owner-canvas auto-pan、strict MIME、resolver、Command／save、zero-mutation 與 Chromium rejected-drop 決策。
- 各領域 adapter／page：資料取得、欄位、validation、mutation、permission、dirty guard 與錯誤訊息。

### 2.2 ADR 策略

本案是 ADR-009 同一個 UI shell 邊界的簡化，不建立新 ADR。ADR-009 新增 DEV-042 amendment，歷史 drawer 決策保留為 provenance，但 amendment 對目標 runtime 優先。

### 2.3 規格衝突分類

- `Intentional Replacement`：drawer／promotion UI 與其 session／controller 路徑。
- `Compatible Refinement`：panel-local selection、可收合 detail、responsive 投影及 launcher preserve-context。
- `No Change`：domain、API、permission、資料格式、relation placement、layout engine。

## 3. 現況 symbol 盤點

| 層 | 現行 symbol | DEV-042 處置 |
|---|---|---|
| Types | `DrawerWorkspaceModuleId`、`ModuleSurfaceDescriptor.surface`、`WorkspaceSessionState.drawer`、`PromotionSource／Intent` | 移除 drawer 型別／欄位；以單一 `WorkspaceOpenIntent` 取代 promotion 語意 |
| Registry | `WORKSPACE_DRAWER_MODULES`、`isDrawerWorkspaceModuleId()` | 刪除；十個 module 只保留一份 registry |
| Reducer | `OPEN_DRAWER`、`CLOSE_DRAWER`、`openOrFocusPanel()` 內 drawer cleanup | 刪除 drawer actions；open-or-focus 成為唯一入口 |
| Controller | `openDrawer()`、`closeDrawer()`、`promote()` | 刪除；只保留 `openOrFocus()` |
| Route | `readLegacyPromotionIntent()`、`routeFromPromotion()` | 改名並收斂為 legacy-to-workspace open intent；不 render 舊 UI |
| Shell | `WorkspaceQuickDrawer`、`renderDrawer`、`drawerPromotionIntent` | 刪除元件、props、CSS 與 DOM |
| Launcher | drawer／direct branch | 十個 module 一律呼叫同一 `onOpenModule()` |
| App | `drawerRenderers`、`currentDrawer`、多個 `openDrawer／promote` call site | 移除；所有入口改接 open-or-focus |
| Surface | `WorkspaceListDetailSurface` 永遠保留空 detail slot | detail 關閉時不 render detail slot；清單取得完整 panel 空間 |
| Selection | master-data detail 部分依賴 App global `directorySelection` | detail visibility 與內容改由該 panel context／session 擁有；shared selection 只供跨 panel highlight／reveal |

## 4. 目標型別與單一 state authority

### 4.1 Module registry

`ModuleSurfaceDescriptor.surface` 移除，因所有module都是panel。runtime真正需要判斷的只有「shell是否擁有可收合detail」，因此只新增一個boolean，不建立`none／collapsible／embedded`三態框架：

```ts
interface ModuleSurfaceDescriptor<K extends WorkspaceModuleId> {
  id: K
  label: string
  supportsCollapsibleDetail: boolean
  // 既有 minWidth/minHeight/selection/query/context functions 保留
}
```

- `true`只用於employees、positions、departments、duties與management-methods。
- `false`代表shell不建立外部detail；organization／role-risks／governance是完整surface，levels維持既有list-only，processes維持領域內建workbench。這些差異由adapter與第5節矩陣描述，不進一步編碼成通用runtime taxonomy。

### 4.2 Open intent

以單一開啟 intent 取代 promotion：

```ts
type WorkspaceOpenSource = 'launcher' | 'legacy-route' | 'global-search' | 'cross-panel'

type WorkspaceOpenIntent = {
  [K in WorkspaceModuleId]: {
    moduleId: K
    source: WorkspaceOpenSource
    context?: WorkspaceModuleContextMap[K]
  }
}[WorkspaceModuleId]
```

行為固定：

1. 新 panel：使用 intent context，未提供則使用 registry default context。
2. 既有panel且intent未帶`context`：只聚焦、展開與reveal，不覆寫context。
3. 既有panel且intent明確帶`context`：以registry sanitizer驗證後替換context；pinned panel保持既有DEV-039隔離語意，不被shared selection被動覆寫。
4. 頂部launcher永遠不帶context；legacy route與明確cross-panel deep link帶完整context。`source`只作provenance／測試識別，不控制state transition。
5. 同 module 不建立第二 panel，不重排既有 layout。

### 4.3 Detail visibility

不在`PanelSessionState`新增逐panel detail副本。依現有workspace architecture，`WorkspaceSessionState.openDetails`是唯一runtime semantic authority；`WorkspaceRouteState.openDetails`由`routeFromState()`產生，並只在hydration／Back／Forward時經`reconcileRoute()`回填session。browser URL是route snapshot的序列化投影；canonical query以`details=<module-id,...>`或`details=none`表達。只有registry `supportsCollapsibleDetail=true`且context內有合法selected entity時才接受open detail。

```ts
interface WorkspaceSessionState {
  // 既有欄位
  openDetails: WorkspaceModuleId[]
}

interface WorkspaceRouteState {
  // 既有欄位
  openDetails: WorkspaceModuleId[]
}
```

規則：

- 點清單項目：以同一reducer transition更新該panel context／localSelection，並將module ID加入`session.openDetails`；`routeFromState()`在同一transition產生route effect。
- 關閉明細：只從`session.openDetails`移除module ID；不得清除context ID、localSelection、query、filter、list DOM或scroll。
- 再點已選項目：將module ID重新加入`session.openDetails`。
- 關閉 panel：沿用既有 close guard，才移除 panel session／layout／route context。
- invalid／deleted entity：sanitizer清除ID／localSelection並從`session.openDetails`移除module；顯示既有list empty/error，不render空白detail。
- module context內的entity ID是detail內容authority；既有`localSelection`只作同panel highlight／focus projection，`sharedSelection`只作跨panel highlight／reveal，兩者都不得成為detail visibility authority。
- collapsible module若context entity與`localSelection`不一致，reducer以sanitized context entity為準並修復／清除highlight projection；不得讓adapter自行選另一筆detail。session `openDetails`、context及localSelection的原子transition需有pure regression test。

### 4.4 Route 與 history

- canonical route 仍為 `/`，保留 `panels`、`focus`、`select` 及既有 module query keys，新增單一 `details` key；不新增 router。
- `writeWorkspaceRoute()`只序列化已開啟且合法的detail module；順序固定依`WORKSPACE_MODULE_ORDER`，避免等價URL抖動。沒有任何detail開啟時必須寫`details=none`。
- `readWorkspaceRoute()`對`details`固定採：`none→[]`；缺少key→legacy inference；其他值以逗號拆分、去重、依`WORKSPACE_MODULE_ORDER`排序，再與open panels、`supportsCollapsibleDetail`及合法entity context取交集。unknown／unsupported token忽略並以`replaceState`正規化，不可造成空白panel或error page。
- detail open／close、panel open／close、focus、module selection 使用既有 route write authority；連續 typing／filter 仍依既有 replace 策略，不為本 DEV 新增 history policy。
- `readLegacyPromotionIntent()` 改名 `readLegacyWorkspaceIntent()`；`routeFromPromotion()` 改名 `routeFromWorkspaceIntent()`。既有 duty／duty-planning／process-planning／management-method routes只做一次 normalization後 replace 到 canonical `/`，不得 render drawer 或 legacy composition。
- drawer 本來是 session-only，沒有可分享 drawer URL；文件與測試不得虛構 drawer query migration。
- 舊canonical URL完全沒有`details` key時：合法entity context預設open並立刻replace-normalize成顯式`details=<module>`；若沒有合法entity則normalize為`details=none`。新URL的`details=none`明確代表全部收合，不能再用缺少key同時表示legacy與closed。

## 5. Module surface matrix

| Module | `supportsCollapsibleDetail` | Composition／開啟契約 | 必須保留 |
|---|---|---|---|
| organization | `false` | 直接render組織畫布 | viewport／zoom、inspector、registered drop target、auto-pan |
| employees | `true` | 員工清單＋員工明細；close後只留原清單 | 搜尋、新增、關係、整列拖曳、權限 |
| positions | `true` | 職位清單＋職位明細 | 部門／層級／上級／員工指派、子職位排列 |
| departments | `true` | 部門清單＋部門明細 | 部門、所屬職位與人員脈絡 |
| levels | `false` | 現有層級list-only／內嵌操作；不製造空detail | 現有層級能力；未來有獨立detail再另立DEV |
| duties | `true` | `configuration`為清單＋detail；`audit／distribution`保持完整workbench | 責任lane、盤點／分布、Employee／Position／Process關係拖曳 |
| processes | `false` | 保留`ProcessPlanningWorkbench`內建流程清單＋graph＋bridge | 新增流程、心智圖／流程圖、ProcessNode↔Duty DnD |
| management-methods | `true` | list持續mounted；method document為detail；close dirty detail必走既有guard | 新增、搜尋、閱讀／編輯、多媒體、章節、職掌對照 |
| role-risks | `false` | 直接完整設定surface | 10組規則、等級、啟用與現有判定 |
| governance | `false` | 直接治理surface | identity／catalog／assignment／delegation／versions／audit／check |

流程模組已內建左側流程清單，將其外包給另一個 generic list-detail 只會形成雙層清單；本 DEV 明確禁止。層級目前沒有獨立 detail owner，故維持 embedded/list-only，而不是顯示空白明細。

## 6. List-detail UI 契約

### 6.1 寬面板

- 以 panel container query 判斷，不以 window width 判斷。
- panel content inline-size `>=640px`且module存在於`session.openDetails`：左側list固定`clamp(190px, 32cqw, 242px)`，右側detail使用剩餘空間；兩者緊鄰，由既有藍色divider分隔。
- detail收合：detail DOM不存在；list維持密集欄寬並靠左，剩餘區域只是owner panel背景，不得render有邊框／ARIA label／控制項的假detail或說明pane。panel inline-size `<640px`時list才填滿可用寬度。

### 6.2 窄面板

- panel content inline-size `<640px`：一次只顯示 list 或 detail。選項後 detail 取代 list；detail close 返回同一 mounted list state，scroll／query／filter 不變。
- 不壓縮成不可操作雙欄，不產生 panel 內水平 overflow；domain document 自身必要 overflow 依既有元件處理。

### 6.3 Focus 與 accessibility

- 清單 row 必須是可鍵盤操作的 button／既有 interactive row，使用 `aria-current` 或 `aria-selected` 表達選取。
- 開啟 detail 後，焦點移至 detail heading 或第一個主要控制；關閉後回到同一 row。若 row 已刪除，回 list heading。
- detail close 必須有可辨識 label；不得用只靠圖示且無 accessible name 的控制。
- Escape 不新增全域 listener。只有領域 surface 已有 scope-local Escape 且無 modal／dirty dialog 時才可收合 detail；必要驗收入口仍是可見 close control。
- 管理辦法 dirty detail 關閉必須沿用 `ManagementMethodDocumentPage` 的 save／discard／keep-open guard；不得先改 route 再詢問。

### 6.4 UI Entry Contract

正常入口固定為：`頂部工具列「功能」button → 可見module menuitem → 對應workspace panel tab／surface`。選單項目沿用registry label：`組織架構圖、員工、職位、部門、層級、工作職掌、流程規劃、管理辦法、兼任風險、角色治理`。點擊後：

1. menu關閉，panel不存在則加入focused stack，存在則只focus／reveal。
2. panel tab的可見label與registry label一致；不得先顯示同名drawer、full-workbench CTA或promotion loading state。
3. launcher操作本身不改變version、workspace mode、capability或domain data。
4. 直接導向legacy standalone route時，第一次讀取即轉為同一panel與canonical `/`；browser Back不得重新顯示legacy composition。

## 7. App wiring 與 ownership

### 7.1 唯一入口

- `WorkspaceLauncher`只接受`onOpenModule(moduleId)`；十個項目全部呼叫`controller.openOrFocus({ moduleId, source: 'launcher' })`，不帶context即代表保留既有context。
- Toolbar、global search、legacy route、organization duty-config、module row deep link都轉成 `WorkspaceOpenIntent`；不得直接寫 layout 或建立第二 entry switch。
- `openDutyConfiguration`同時確保organization與duties panel存在；duties intent明確帶入合法context，故由單一open reducer sanitize後替換，保留雙panel關係配置，不再開drawer。

### 7.2 Panel-local selection

- master-data panel的list highlight與detail entity由該module context推導；detail visibility只由`session.openDetails`推導。
- App global `directorySelection` 僅可服務 organization canvas inspector／shared selection transition；不得決定 employees／positions／departments panel 的 detail render。
- 建立薄 helper（可留在 `App.tsx` 或 workspace helper）完成 `context ↔ EntityRef` 映射；不得建立第二 selection store。
- panel detail close只dispatch`SET_DETAIL_VISIBILITY(moduleId,false)`更新session authority，再由既有route projection產生replace effect；不得呼叫organization inspector close或清除另一panel context。

### 7.3 Surface adapters

- `WorkspaceListDetailSurface`只接收layout slots、由`WorkspaceSessionState.openDetails`推導的`detailVisible`、close/focus hook與可存取label；不讀route／URL、不讀OrganizationDocument、不執行Command、不判斷permission。
- `MasterDataModuleAdapter`、`DutyModuleAdapter`、`ManagementMethodModuleAdapter` 保持 domain composition owner。
- `ProcessModuleAdapter` 直接承載 `ProcessPlanningWorkbench`；`RoleRiskModuleAdapter`、`GovernanceModuleAdapter` 與 organization renderer保持直接 surface。
- 管理辦法detail的close control必須委派既有`ManagementMethodDocumentPage.onClose`；只有該page完成dirty guard並回呼allow後，App才dispatch detail close。generic surface不得先收合或再建立第二個dirty dialog。

## 8. Data、API、permission 與 migration

| 項目 | 決定 |
|---|---|
| OrganizationDocument／management method data | 不變 |
| Schema／DB migration | 無 |
| API／HTTP contract | 無 |
| Permission／capability | 不變；adapter沿用既有 default-deny與mobile read-only intersection |
| Command／resolver／autosave／Undo | 不變 |
| package／lockfile | 不變；若實作需要 dependency，停止並回 PM |
| persisted workspace layout | `WorkspaceLayoutV1` 不變，不 bump version |
| URL | canonical route向後相容新增 `details`；legacy standalone routes只做 normalization |

## 9. 實作 slices 與 gate

### S0 — Contract guard

- 先更新／新增 unit tests，使 launcher單路徑、drawer symbol prohibition、detail state與route round-trip在舊程式上失敗。
- Gate：測試失敗原因只能是 DEV-042 差距；不得先刪功能讓測試變綠。

### S1 — Core state／registry／route

- 移除 drawer types、registry、actions與controller methods。
- 加入`supportsCollapsibleDetail`、optional-context `WorkspaceOpenIntent`及session-owned／route-projected `openDetails／details`；不新增逐panel detail副本。
- 實作 legacy normalization與 invalid detail fail-closed。
- Gate：pure state／route／controller targeted tests pass；同 module open不重置既有 context。

### S2 — Shell／launcher removal

- 刪除 `WorkspaceQuickDrawer.tsx`、drawer renderer、shell props、CSS與「在工作台開啟」。
- launcher十個 module全部直達 panel。
- Gate：architecture source scan無正式 drawer／promotion symbol；十個 launcher case pass。

### S3 — Master data list-detail ownership

- employees／positions／departments切到panel-local context＋session-owned detail visibility；levels維持既有list-only。
- 修正 `WorkspaceListDetailSurface` container behavior與focus restore。
- Gate：三個 panel可同時有不同選取，不互相搬移 detail；close detail保留query／scroll／selection。

### S4 — Duty／Process／Management Method convergence

- duty configuration使用共用list-detail；audit／distribution不變。
- process保留既有workbench，不新增外層list；production source預期不需修改，只跑既有regression。
- management list持續mounted，document detail close使用既有dirty guard。
- Gate：流程新增入口存在；管理辦法dirty三分支；Duty關係來源／落點仍registered。

### S5 — App entry convergence

- 移除 `drawerRenderers`、`currentDrawer`與所有 `openDrawer／promote` call site。
- toolbar、global search、duty config及legacy入口全部接單一open intent。
- Gate：所有十個正常入口＋refresh／back／forward pass，無duplicate panel。

### S6 — Automated regression

- targeted、typecheck、build、full regression、source scan及diff check全數通過。
- 任一資料／API／permission／relation placement非預期變更即停止，不進browser gate。

### S7 — Browser QA／QC

- 使用fresh isolated fixture與正常頂部入口完成 module parity、layout、responsive、route、dirty guard與DEV-041四向回歸。
- 產生單一 evidence manifest；本輪已產生 `output/playwright/dev042/manifest.md` 並完成 fixture archive。task-owned runtime／port cleanup 已完成並在 manifest 記錄；manifest 中標為 `blocked`／`not-run` 的項目不得解讀為 pass。

## 10. Exact implementation allowlist

### 10.1 Production source

允許修改：

- `src/App.tsx`
- `src/workspace/types.ts`
- `src/workspace/moduleRegistry.ts`
- `src/workspace/state.ts`
- `src/workspace/useWorkspaceController.ts`
- `src/workspace/route.ts`
- `src/components/workspace/WorkspaceLauncher.tsx`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/components/workspace/WorkspaceModuleSurfaces.tsx`
- `src/components/workspace/WorkspaceSurfacePrimitives.tsx`
- `src/components/workspace/adapters/MasterDataModuleAdapter.tsx`
- `src/components/workspace/adapters/DutyModuleAdapter.tsx`
- `src/components/workspace/adapters/ManagementMethodModuleAdapter.tsx`
- `src/components/workspace/workspace.css`

允許刪除：

- `src/components/workspace/WorkspaceQuickDrawer.tsx`

### 10.2 Test source

允許修改對應既有 tests，並只在現有資料夾新增 DEV-042 contract tests：

- `src/workspace/{state,route,useWorkspaceController}.test.*`
- `src/components/workspace/{WorkspaceLauncher,WorkspaceShell,WorkspaceModuleSurfaces,WorkspaceSurfacePrimitives,WorkspaceArchitecturePolicy}.test.*`
- `src/components/workspace/WorkspaceLayout.test.tsx`（僅補齊 `openDetails` route fixture 型別；既有 tab drag 測試 provenance 不屬 DEV-042）
- `src/components/workspace/adapters/{MasterDataModuleAdapter,DutyModuleAdapter,ManagementMethodModuleAdapter}.test.*`
- `src/components/workspace/WorkspaceSingleLayerContract.test.tsx`（唯一允許新增的integration contract test）

`src/components/ProcessPlanningWorkbench.test.tsx`與`src/components/managementMethods/ManagementMethodDocumentPage.test.tsx`列入required regression command，但預期不修改；若既有測試因真實契約改變必須調整，先證明不是放寬assertion，再回PM擴充allowlist。

### 10.3 Documents

- `ai-doc/dev_task.md`
- `ai-doc/documentation_map.md`
- `ai-doc/specs/DEV-042-single-layer-workspace-contract.md`
- `ai-doc/adr/ADR-009-composable-workspace-shell-boundary.md`

### 10.4 Explicit denylist／stop condition

未列 production path一律不改。尤其禁止修改 domain Commands、API server、schema／migration、auth／permission、`entityDrag.ts`、`relationPlacement*.ts`、auto-pan owner、package／lockfile與環境設定。若必要改動超出 allowlist，先停止、記錄因果與最小差異，回 PM 更新契約後才可繼續。

## 11. Automated verification contract

RD 至少執行：

```powershell
npx vitest run src/workspace/state.test.ts src/workspace/route.test.ts src/workspace/useWorkspaceController.test.tsx src/components/workspace/WorkspaceLauncher.test.tsx src/components/workspace/WorkspaceShell.test.tsx src/components/workspace/WorkspaceModuleSurfaces.test.tsx src/components/workspace/WorkspaceSurfacePrimitives.test.tsx src/components/workspace/WorkspaceArchitecturePolicy.test.ts
npx vitest run src/components/workspace/adapters/MasterDataModuleAdapter.test.tsx src/components/workspace/adapters/DutyModuleAdapter.test.tsx src/components/workspace/adapters/ManagementMethodModuleAdapter.test.tsx src/components/workspace/WorkspaceSingleLayerContract.test.tsx src/components/ProcessPlanningWorkbench.test.tsx src/components/managementMethods/ManagementMethodDocumentPage.test.tsx
npx tsc --noEmit --pretty false
npm run build
npm test -- --run --pool=forks --maxWorkers=1
```

Source policy 必須證明 production `src/**` 不再含以下正式 symbol／文字：

```powershell
rg -n "WorkspaceQuickDrawer|DrawerWorkspaceModuleId|WORKSPACE_DRAWER_MODULES|isDrawerWorkspaceModuleId|OPEN_DRAWER|CLOSE_DRAWER|PromotionIntent|PromotionSource|renderWorkspaceDrawer|openDrawer\(|closeDrawer\(|\.promote\(|workspace-quick-drawer|在工作台開啟" src -g "!*.test.*"
```

預期：無輸出，ripgrep exit code=`1`。legacy函式須使用`WorkspaceIntent`命名；測試可引用舊名稱作prohibition assertion，因此source scan明確排除`*.test.*`，不再要求互相矛盾的全`src`零字串。

必測 pure cases：

1. launcher重點同一 module只聚焦，不覆寫context、不新增panel。
2. 明確帶context的intent經sanitizer更新context；未帶context只聚焦；invalid entity fail-closed。
3. detail close保留ID／selection/query，route `details`正確移除；reopen可還原。
4. route read／write順序穩定；舊canonical與四種legacy route正規化一次。
5. pinned／close guard／layout persisted behavior不回歸。
6. 三個master data panel同時選不同entity，不產生cross-region detail ownership。
7. management dirty detail：save-and-close、discard-and-close、keep-open。
8. mobile capability不出現mutation control。

## 12. Browser QA／QC evidence contract

### 12.1 環境與 provenance

- 使用可回收 fresh fixture，記錄 source revision、branch、fixture ID、API base、browser、viewport、workspace mode、version status與capability。
- 建議 task-owned runtime `127.0.0.1:5080`；啟動前記錄project／purpose／port／PID tree，完成後只停止該tree並確認port釋放。不得停止user-owned `localhost:5000`。
- evidence root：`output/playwright/dev042/`；唯一總表：`output/playwright/dev042/manifest.md`。

### 12.2 Normal delivery path

以頂部「功能」入口逐一開啟：organization、employees、positions、departments、levels、duties、processes、management-methods、role-risks、governance。每案記錄：

- 沒有drawer或promotion中間態。
- 首次open、重複focus、close後reopen。
- panel label、唯一instance、context preserve、URL與reload結果。
- 功能核心控制仍存在；不得以只看到空panel判定pass。

### 12.3 Viewports

- `1440×900`：多panel、寬list-detail並排、tab拖曳split與divider resize。
- `1024×768`：窄panel單surface切換、無水平overflow、focus restore。
- `390×844`：唯讀閱讀與導覽；所有mutation controls不可用／不可觸發。

### 12.4 Required scenarios

| ID | Scenario | Pass |
|---|---|---|
| F042-E1 | 十模組launcher | 全部直接open-or-focus，0 drawer／0 duplicate |
| F042-E2 | employees／positions／departments list-detail | close後同row、query、scroll保留；三panel互不串位 |
| F042-E3 | duties | configuration收合、audit／distribution保留；Duty DnD source／target存在 |
| F042-E4 | processes | 流程清單新增入口可見，mindmap／flow與bridge存在，無雙清單 |
| F042-E5 | management methods | list持續mounted；dirty三分支正確，內容／圖片／章節可讀 |
| F042-E6 | route | refresh、back、forward、share URL與legacy normalization正確 |
| F042-E7 | layout | tab drag、split、resize、pin、close、reload與zero-panel不回歸 |
| F042-E8 | DEV-041 | Employee→Position、Duty→Position、ProcessNode↔Duty四向合法drag皆mutation一次；rejected zero-mutation；兩owner canvas auto-pan |
| F042-E9 | diagnostics | visible error surface=0、HTTP unexpected error=0、console.error=0、pageerror=0 |

### 12.5 Evidence integrity

- screenshots只證明可見結果；route、revision、domain relation與zero-mutation須以API／state readback佐證。
- 每案記錄 setup、action、expected、actual、artifact、cleanup 與 disposition；`blocked／not-run`不得標pass。
- 使用 `data-*` 或role locator鎖定正常產品元素；不得用API直寫、synthetic relation drop或隱藏debug入口替代使用者操作。
- 每個fresh fixture結束必須archive並readback status；未cleanup不得標候選完成。

### 12.6 QA／QC 分工

- QA在實作前把第11、12節required cases映射到test／browser case ID，確認fixture資料覆蓋十模組與四向DnD，不以RD自行補測代替驗證計畫。
- RD產生targeted、typecheck、build、full regression與browser records，但不得自行把`blocked／not-run`改標pass。
- QC獨立覆核正常入口、artifact、API／revision readback、source scan、fixture cleanup、runtime cleanup與Git allowlist；只有QC結論與records一致才可提升`Browser QA-QC Passed`。

## 13. Failure recovery／FMEA

| 失敗模式 | 早期偵測 | 恢復／停止 |
|---|---|---|
| 只CSS隱藏drawer | source scan仍有drawer state／controller | S2 fail；刪除正式路徑與dead code後重跑，不接受feature flag長期並存 |
| launcher重置context | 重複點擊後query／selection／viewport改變 | S1 fail；launcher intent不得帶context，不得在App補暫存副本 |
| detail跨panel串位 | A panel選取後B panel detail變更 | S3 fail；回到panel context owner，禁止增加global selection if/else |
| detail收合丟scroll | close/reopen回list top | 保持list mounted與DOM scroll；若必須unmount，使用既有visualState，不新增store |
| management dirty內容遺失 | close detail未出guard或route先變 | rollback該slice；guard allow後才dispatch close |
| process出現雙清單 | generic surface包住既有workbench | 移除外層list-detail，回embedded adapter |
| invalid URL出空白detail | deleted／bad ID經route reconciliation仍進入session `openDetails` | sanitizer同時清ID並移除module，回合法list |
| DnD source／target消失 | DEV-041四向任一not-run／fail | S7 blocker；修復adapter接線，不改resolver／MIME／effect policy |
| mobile可mutation | 390 viewport可見或可觸發寫入 | P0 stop；修正capability intersection後重跑 |
| 需要schema／API／dependency | implementation超出allowlist | 立即停止回PM，不以臨時facade或duplicate store繞過 |

## 14. Git boundary

- 文件升級前快照：branch=`codex/dev-039-composable-workspace`，HEAD=`4cde5c9`，working tree status項目=`124`；建立本spec後為`125`。此工作樹包含多DEV與未追蹤變更；RD開始前必須重新取得最新快照。
- 實作只能以第10節 exact allowlist及逐hunk provenance判定歸屬；不得`git add -A`、不得整branch視為DEV-042候選。
- 驗收需執行 `git diff --check -- <DEV-042 allowlist>`，並記錄納入／排除paths。混合檔案逐hunk review；無法判定即回PM。
- 沒有使用者／PM另行授權，不執行candidate freeze、commit、merge、deploy或release。

## 15. RD readiness checklist

- [x] 產品決策與成功條件已確認。
- [x] Current symbols、state owner、route owner與intentional replacement已盤點。
- [x] 十模組surface差異、responsive與accessibility已固定。
- [x] 資料／API／permission／migration影響為none並有停止條件。
- [x] exact production／test／document allowlist已固定。
- [x] S0→S7分片、每片gate、FMEA與failure recovery已固定。
- [x] normal delivery path、fresh fixture、viewport、DEV-041與console evidence已固定。
- [x] dirty worktree與candidate authority邊界已固定。
- [x] P0／P1 readiness gap為0。

## 16. 交付宣稱門檻

- `RD Implementation Complete`：S0～S6通過（包含 `174 files／716 passed／1 skipped` full regression）、source scan 0 match、無 DEV-042 allowlist 外產品變更；本案已達此 gate。
- `Browser QA-QC Passed`：S7全部 required scenario 有可採用 evidence、diagnostics 為 0、fresh fixture 已 archive；task-owned `5080` runtime 停止並確認 port 釋放後，本案已達此 gate。
- `Repository Integrated`：前兩者完成、文件與evidence同版，並由`4e3b2ce`／`c8cc16f`進入`master`；本案已達此gate。
- deploy／release仍須使用者明確提出並依共用release gate處理；不得從repository integration推論已發布。

## 17. Future Phase Capsule：工作職掌 anomaly 複選篩選

狀態：`Captured / Not Requested`。本capsule由DEV-034 R2.1整併而來，只保留「在現行Duty configuration清單中，以單一popover複選三個既有anomaly原子條件」的產品意圖；不新增「待處理」狀態、責任類型、部門聚焦、資料模型、API或後端契約。

- 目的：讓規劃者在不離開DEV-042單層Duty panel的情況下，組合既有「無執行職位／缺少主執行／待重新分配」條件縮小清單。
- 依賴：沿用既有anomaly selector、Duty panel query／filter state及mobile read-only；不得復活DEV-034固定DirectoryDock或專用配置模式。
- 驗收方向：三條件可獨立或複選、結果為OR集合、清除後恢復完整清單、URL／session行為需與現行panel context一致，且不改domain state。
- Re-entry trigger：只有使用者明確要求實作此篩選時另開DEV；不得因本capsule存在重開DEV-034或DEV-042完成狀態。

## 18. 變更紀錄

- 2026-09-02：依使用者要求直RD修復並完成驗證。修正四個 DEV-040 governance／catalog 測試契約漂移（改用 workspace scope／current catalog version），修正 management-method local-development actor precedence 使隔離草稿 API／UI 可用；新增 loopback auth regression。fresh fixture `draft-03043049-90bd-4918-add0-ca044905eddf` 上 E5、E7（split／resize／pin／close／zero-panel）與 console sweep 通過；DEV-041 最新 aggregate 已覆核四向 DnD、zero-mutation、auto-pan、console/pageerror。全回歸 `174 files／716 passed／1 skipped`，typecheck、client／server build 通過；證據總表為 `output/playwright/dev042/manifest.md`。本輪尚未執行 candidate freeze、commit、merge、deploy 或 release。

- 2026-09-02：既有使用者 localhost:5000 完成探索性 browser smoke，確認十個頂部功能入口均可直接加入／聚焦，員工清單與相鄰明細可開關，關閉後來源列 focus restore且舊 `WorkspaceQuickDrawer` 未掛載；未使用 fresh fixture／task-owned runtime，正式 S7 仍維持 pending。
- 2026-09-02：依本契約完成 DEV-042 production implementation。移除 `WorkspaceQuickDrawer`／promotion control flow，launcher十模組統一open-or-focus；新增 session-owned `openDetails`、`details` route與無效明細fail-closed，master-data／Duty／Management Method切換相鄰list-detail，窄panel改為單surface明細投影，並補明細關閉後來源row focus restore。targeted `8 files／34 tests`＋`6 files／16 tests`、typecheck、client／server build、production source scan與allowlist diff check通過；full regression `170 files／711 passed／4 failed／1 skipped`，四個失敗均為既有 DEV-040 governance／catalog tests，Browser S7尚未執行。狀態為`Implementation Code Complete / Targeted Automated Gate Passed / Full Regression Blocked by Pre-existing DEV-040 Failures / Browser QA-QC Pending`；未執行candidate freeze、commit、merge、deploy或release。
- 2026-09-02：task-owned `127.0.0.1:5080` 以 fresh B16 fixture 完成 Browser S7 targeted slice；E1 十模組入口、E2 三主資料 list/detail 隔離、E3 Duty、E4 Process、E6 route／invalid detail 均取得 targeted pass，並完成 fixture archive；E5 管理辦法因既有 `FORBIDDEN`、E7 layout、E8 DEV-041四向與E9 console/pageerror collector仍未完成，唯一 manifest `output/playwright/dev042/manifest.md` 標示 partial／blocked／not-run。不得把本紀錄升格為 `Browser QA-QC Passed` 或 `RD Implementation Complete`。
- 2026-09-02：依RD技術主管審查優化DEV-042契約，結論`Pass after contract optimization`。移除逐panel detail副本、`contextMode`及三態runtime taxonomy，固定session-owned唯一`openDetails`＋route projection、optional-context open intent與`supportsCollapsibleDetail:boolean`；補上`details=none`相容歧義修正、context／localSelection原子不變量、窄化production allowlist及排除test的source scan。P0／P1 readiness gap維持0；未修改產品程式或執行測試／commit／deploy。
- 2026-09-02：升級至`RD Implementation Ready`。建立權威spec並完成現況symbol、single open intent、session-owned detail state與route／URL projection、`details` route、十模組surface matrix、container responsive、accessibility、exact allowlist、S0～S7、targeted／browser evidence、FMEA、failure recovery及dirty-worktree Git boundary；ADR-009新增DEV-042 amendment。P0／P1 readiness gap=0；未修改產品程式、測試、commit、deploy或release。
- 2026-09-02：依使用者確認建立 DEV-042；固定單層功能工作台、頂部直接 open-or-focus、清單＋可收合明細、全模組 feature parity及 DEV-039／041 保留邊界。文件成熟度為 `Brief Ready`，未進入產品實作。
