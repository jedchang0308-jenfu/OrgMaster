# DEV-046：統一清單明細工作台與可擴充關係拖曳框架

文件成熟度：`RD Implementation Complete`

狀態：`RD Implementation Complete / Automated Gate Passed / Browser QA-QC Passed / RD Tech Lead Review Passed after Contract Optimization / Local Release Gate Pending`

風險等級：`High`。本交付會改變八個既有功能的主要畫面、選取／明細狀態、鍵盤操作與版面偏好保存，並新增帳號層級偏好 API 與 forward-only migration；不得用局部元件測試取代完整正常入口及視覺 QC。

決策來源：

- `USER-2026-09-04-COMMON-LIST-DETAIL-WORKBENCH`
- `USER-2026-09-04-LEVEL-DETAIL-FRAME-FUTURE-CONTENT`
- `USER-2026-09-04-DETAIL-CLICK-ARROW-ESC-BEHAVIOR`
- `USER-2026-09-04-ACCOUNT-SCOPED-LIST-WIDTH`
- `USER-2026-09-04-UNIFIED-RELATION-DRAG-EXTENSIBILITY`
- `USER-2026-09-04-DEV046-RD-IMPLEMENTATION-READY-TECH-LEAD-REVIEW`
- `USER-2026-09-04-DEV046-EMPLOYEE-VISUAL-BASELINE`

父契約與取代關係：

- [DEV-039](DEV-039-composable-planning-workspace.md)：保留可組合 workspace、panel owner、URL／session／browser-layout authority 與 domain mutation boundary。
- [DEV-041](DEV-041-relation-drag-interaction-contract.md)：保留單一 `RelationPlacementSession`、strict MIME、registered resolver、共用 source／target binding 與 App mutation owner。
- [DEV-042](DEV-042-single-layer-workspace-contract.md)：保留頂部 launcher、單實例 open-or-focus、panel-local composition 及既有完成證據；本 DEV 有意取代其 list-only module、固定清單寬度、detail 關閉後移除右欄及 Process 專用外框例外。
- [ADR-009](../adr/ADR-009-composable-workspace-shell-boundary.md)：新增 DEV-046 amendment；不建立第二份 shell ADR。
- [DEV-033](DEV-033-mobile-readonly-desktop-mutation-boundary.md)：手機／窄 viewport 維持完整唯讀；本 DEV 不以拖曳或寬度調整旁路 mutation boundary。

Spec Impact Preflight：`Intentional replacement`。使用者已明確要求所有本次列入的功能統一為左清單＋右明細、層級先建立空明細框、清單可調寬並保存於帳號、拖曳共用且可逐步擴充，且細部風格與排版以現行「員工」工作台為視覺基準；因此不重複要求產品決策。DEV-042 的歷史完成狀態與證據保持有效，只由 DEV-046 接管上述新行為。

## 1. 真正需求與完成定義

表面問題是各功能都「看起來像清單＋明細」，但開發仍需分別處理 layout、detail 開關、選取、焦點、鍵盤、寬度與拖曳。因果鏈為：

~~~text
各模組自行組合相似畫面
  -> 同一互動在 adapter、domain component 與 App 重複實作
  -> 行為與狀態權威逐步分歧
  -> 每次新增功能必須多處修正與回歸
  -> 共用率低、維護成本與回歸風險上升
~~~

完成後，八個 Current Phase 功能都使用同一個外層框架與同一套選取／明細／寬度／焦點行為；各功能只提供清單內容與明細內容。關係拖曳只保留一套既有 transport、session、resolver 與 mutation authority，新關係可以用明確的 typed extension path 增加，不複製 drag handlers。

成功不以「建立一個共用元件」判定，而以以下事實判定：

1. 八個功能從正常入口呈現一致的左清單＋右明細框，清單標頭、搜尋、列密度、選取、分隔線與明細標頭沿用「員工」版面的共同視覺語言。
2. 同一列 click、另一列 click、上下鍵與 Escape 的結果跨功能一致。
3. 桌面清單寬度可調、無偏好時 content-fit、有偏好時由目前登入帳號恢復。
4. domain detail、permission、dirty guard、autosave、Undo／Redo 與 mutation authority沒有被搬進共用框架。
5. 所有可拖曳關係來源／目標使用 DEV-041 的共用 binding；新增 pair 不需建立第二套事件生命週期。

使用思考習慣：`#問對問題`、`#拆解問題`、`#目的`、`#限制條件`、`#多層次分析`、`#系統描繪`

## 2. Human-confirmed產品契約

1. Current Phase 的共用 consumers 固定為：員工、職位、部門、層級、工作職掌、流程規劃、管理辦法、兼任風險。
2. 桌面與可組合 panel 模式一律是「左側清單＋可調整分隔線＋右側明細框」。右側明細框永遠存在；沒有內容或使用者關閉明細時只清空內容，不拆除右欄。
3. 層級第一版也建立右側明細框；沒有 domain detail 不構成 blocker，detail slot 可以是無可見文案的空狀態。
4. 點未選取列：選取該列並開啟／切換明細。點目前已選取且明細開啟的同一列：關閉明細內容，但保留選取與右欄框架。再次點同一列則重新開啟。
5. 清單列取得焦點時，`ArrowUp`／`ArrowDown`依目前篩選後可見順序切換項目並開啟明細；到邊界不循環。
6. `Escape`在沒有更高優先互動時關閉明細內容並把焦點還給選取列。Modal、popover、inline editor、relation placement 與 dirty-close guard 先取得 Escape。
7. 清單寬度可由使用者調整；無帳號偏好時初始值只量測一次並剛好容納當下已載入內容，再受 list／detail minimum 約束。
8. 調整後的 preferred width 依「登入 principal＋module」保存到帳號偏好；不寫入 OrganizationDocument、workspace version、URL 或 browser-local layout。
9. 拖曳使用一套共用 headless source／target binding、typed payload、session 與 resolver。新關係可以逐項新增，但未登錄 pair 必須 fail closed；方向不自動對稱。
10. 細部風格與排版以現行 Employee list-detail surface 為基準。各功能必須共用同一批 presentation primitives 與 scoped tokens；只允許清單資料欄位、領域動作及右側 domain body 內容不同，不得各自複製一套近似 CSS。

## 3. Current Phase scope

### 3.1 必要規格（本 DEV 可執行範圍）

- 擴充既有 `WorkspaceListDetailSurface`，成為唯一 list-detail frame；不得另建與現有 `WorkspaceShell` 名稱或責任重疊的 `WorkbenchShell`。
- 建立共用 list-detail interaction controller，統一 row click、ArrowUp／ArrowDown、Escape、focus restore 與 drag-click arbitration。
- 從現行 Employee surface 抽出共用 `WorkbenchListFrame`、`WorkbenchListRow`、`WorkbenchDetailFrame` presentation primitives，固定第 11 節的版面 anatomy、密度與視覺 tokens；不得用 schema-driven renderer 泛化 domain 內容。
- 八個 module adapter 全部投影為相同 frame；Process、Duty audit／distribution、Role Risk 只重組 slots，不把其 domain UI 泛化。
- 桌面 resize separator、content-fit 初值、container clamp、帳號讀寫、失敗回復與 accessibility。
- 沿用並強制所有 relation consumers 使用 `createRelationDragSourceProps()`／`createRelationDropTargetProps()`；以 contract test 防止新平行 drag path。
- 更新 module descriptor、route projection、CSS、targeted tests、完整回歸與三 viewport browser evidence。
- 新增 `011` forward migration、偏好 repository 與 authenticated API；執行 `npm run check:db-boundary`。

### 3.2 建議規格（Future Phase Captured / Not Requested）

- 分隔線雙擊或情境選單「恢復自動寬度」。Current Phase 可以保留 repository reset method，但沒有可見入口也不阻塞驗收。
- 同帳號多分頁即時同步偏好。Current Phase 重新載入後一致即可，不建立 BroadcastChannel 或 WebSocket。
- 依真實效能證據為超過 500 個可見項目的清單加入 virtualization；沒有量測不得預先引入 dependency。
- 手機／touch 的關係配置替代流程。DEV-033 目前禁止窄版 mutation，未重新決策前不得以 touch DnD 擴張本 DEV。
- 新的 relation pairs 或雙向關係。每個 pair 形成獨立可驗收 DEV，沿用第 12 節 extension contract。

建議項目不計入本 DEV 完成，也不得為它們預建 plugin SDK、event bus、generic schema 或第三方 DnD runtime。

## 4. Out of scope

- Organization canvas 與 Governance center 改為 list-detail。兩者未包含在使用者本次確認的功能清單，仍使用現行 owner surface。
- 改變 Employee、Position、Department、Level、Duty、Process、Management Method、Role Risk 的 domain schema、Command、permission、autosave、history 或 validation。
- 移除 Process canvas、ProcessDutyBridge、Duty lanes、文件 editor、Role Risk dirty guard，或把它們轉成 schema-driven generic renderer。
- 多實例 panel、server-side workspace split layout、第三方 plugin、service locator、generic event bus 或新 DnD dependency。
- production migration apply、deploy、release、traffic switch 或正式 rollback 操作。

## 5. Architecture contract

### 5.1 單一外框，不建立巨型功能元件

~~~text
WorkspaceShell / WorkspacePanelFrame          existing composition owner
  -> module adapter                           domain-to-slot projection
       -> WorkspaceListDetailSurface          shared frame/layout/resize/a11y
            -> list slot                      domain list/search/filter
            -> separator                      shared presentation control
            -> detail slot                    domain detail/editor/canvas

useListDetailWorkbenchInteraction             shared selection/focus events
workbenchPreferenceClient                     account preference I/O only

RelationPlacementSession                      existing shared placement state
  -> relationPlacementBindings                existing source/target UI adapter
  -> resolveRegisteredDrop                    only pair/domain-intent authority
  -> App.commitDomainMutationIntent           only mutation dispatcher
~~~

共用層只擁有：slot layout、detail content visibility、list width projection、separator、DOM focus、row navigation intent 與 presentation error。它不得查詢 domain store、判斷 permission、執行 mutation、保存 selection 副本或決定 detail 內文。

### 5.2 Exact component and module contract

| File／symbol | Current Phase責任 |
|---|---|
| `src/components/workspace/WorkspaceSurfacePrimitives.tsx#WorkspaceListDetailSurface` | 唯一共用 frame；永遠 render list、separator及detail slots，接收 effective width 與 a11y metadata |
| `src/workspace/listDetailWorkbench.ts`（new） | 純狀態轉換、visible order navigation、Escape precedence input、content-fit clamp helpers |
| `src/components/workspace/useListDetailWorkbenchInteraction.ts`（new） | 將純 contract 綁到 row props、focus registry與detail visibility callback；不保存 domain selection |
| `src/components/workspace/WorkbenchListSeparator.tsx`（new） | Pointer／keyboard resize、ARIA separator；不自行呼叫 API |
| `src/components/workspace/WorkbenchPresentationPrimitives.tsx`（new） | 從 Employee 抽出的 `WorkbenchListFrame`、`WorkbenchListRow`、`WorkbenchDetailFrame`；只擁有共同 anatomy、slots、visual states 與合法 DOM，不讀 domain store |
| `src/workspace/workbenchPreferenceClient.ts`（new） | typed GET／PUT、parse與request coalescing |
| `src/workspace/state.ts#contextHasDetail` | 移除「必須有selected ID才可open」的admission語意；`openDetails`只依module支援與panel存在判斷，detail node是否為空由adapter投影 |
| `src/workspace/route.ts#routeContextHasDetail／parseDetails` | explicit `details=<module>`只驗證open panel＋module support；缺少`details`時才保留DEV-042的valid-selection legacy inference |
| `src/workspace/useWorkspaceController.ts#requestWorkspaceDetailTransition`（new） | 所有close／replace detail共用的async guard入口；allow後原子dispatch context＋visibility並恢復focus，keep-open維持原狀 |
| `server/workbenchPreferenceRepository.ts`（new） | local-json／cloud-sql account-scoped persistence；不讀寫OrganizationDocument |
| `server/workbenchPreferenceApi.ts`（new） | verified principal、allowlist、body limit、HTTP mapping；同時export Vite plugin與standalone middleware |
| `db/migrations/011_dev046_workbench_list_width_preferences.sql`（new） | `orgmaster_core` private preference table與runtime grants |
| module adapters | 只選擇 list／detail ReactNode、labels、ordered IDs及domain callbacks |

`WorkspaceListOnlySurface`可暫留給非 Current Phase consumer，但八個本 DEV consumers的 production render path不得再使用它。

## 6. Shared frame I/O contract

`WorkspaceListDetailSurface`擴充後至少接受：

```ts
type WorkspaceListDetailSurfaceProps = {
  moduleId: ListDetailWorkbenchModuleId
  listLabel: string
  detailLabel: string
  list: ReactNode
  detail: ReactNode | null
  detailOpen: boolean
  effectiveListWidthPx: number
  onResizeIntent: (nextPreferredPx: number, phase: 'preview' | 'commit') => void
  onRequestDetailClose: () => Promise<'closed' | 'kept-open'>
  preferenceState: 'loading' | 'ready' | 'save-error'
  emptyDetail?: ReactNode
}
```

DOM不變量：

- root：`data-workspace-surface="list-detail"`、`data-module`。
- list：`data-workspace-slot="list"`，內含唯一 `WorkbenchListFrame`；其中只有 list body 是 list scroll owner，標頭與搜尋不隨列捲動。
- separator：`data-workbench-separator`，只在雙欄投影顯示。
- detail：`data-workspace-slot="detail"`，永遠存在；內含唯一 `WorkbenchDetailFrame`，並標記 `data-detail-state="open|closed|empty"`。
- detailOpen=false 時不得 unmount detail slot，只 unmount／hide domain detail content。空 slot具 accessible label及 focus fallback，但不強制可見教學文字。
- detailOpen=true 時由 `WorkbenchDetailFrame` 提供 Employee 同款的唯一 header、title與close control；accessible name固定為`關閉{detailLabel}`並呼叫guarded transition。Domain只提供 title、必要 action slot與body，不得再render第二個同義title／header／close。
- list 與 detail 各自可捲動；root與panel不得再形成第三個同方向 scroll owner。

## 7. Selection and detail state machine

每個 module 只使用現有 module context 的 selected ID 與 session `openDetails`；不得在 frame 或 adapter建立第二份 selected ID。兩者是正交狀態：detail可因create／edit intent在沒有selected ID時開啟，也可在selected ID仍存在時關閉。現有`contextHasDetail()`不得再用「已選ID存在」作`openDetails` admission；應改為檢查panel存在及module支援frame，adapter再依domain context投影detail node或empty slot。

初次由launcher開啟且URL沒有selection時，預設selectedId=null、detailOpen=false，右frame顯示closed empty slot；不得在render時用`items[0]`建立未寫回context的隱性selection。有效direct URL selection依`details`投影開啟或關閉；`details=none`保留selection但關閉內容。為相容DEV-042，URL完全未帶`details`時仍可由valid selected context推論開啟；顯式`details=<supported module>`則不要求selected ID，才能恢復empty／create detail。Role Risk等create intent可使detailOpen=true、selectedId=null並由domain-owned draft提供detail node，reload後未保存draft不恢復。

| Event | Precondition | Result |
|---|---|---|
| `CLICK_ROW(id)` | `id != selectedId` | 若現有detail會被替換則先guard；allow後原子設`selectedId=id`、detailOpen=true並保留 row focus |
| `CLICK_ROW(id)` | `id == selectedId && detailOpen=true` | 先guard；allow後selectedId不變、detailOpen=false、focus留在 row |
| `CLICK_ROW(id)` | `id == selectedId && detailOpen=false` | detailOpen=true |
| `ARROW_DOWN` | row focus、非placing | guard allow後選目前 filtered order下一筆；無選取時選第一筆；detailOpen=true |
| `ARROW_UP` | row focus、非placing | guard allow後選上一筆；無選取時選最後一筆；detailOpen=true |
| Arrow at boundary | 已在第一／最後 | selection不變、不循環 |
| `ESCAPE` | detailOpen且無高優先 owner | 呼叫`requestWorkspaceDetailTransition({kind:'close'})`；allow後detailOpen=false、selectedId不變、focus回 row／無selection時回list owner |
| selected entity disappears | filter以外的canonical deletion／invalid route | selectedId=null、detailOpen=false、focus回 list owner |
| filter hides selected row | entity仍存在 | selection保留；Arrow從目前 visible boundary重新進入，detail可保持 |

Escape precedence固定為：global／panel modal → popover／menu → active inline editor cancellation → `RelationPlacementSession.cancel` → `requestWorkspaceDetailTransition()`所執行的domain dirty-close guard → detail close → no-op。任一較高層已 `preventDefault()` 或完成處理後，frame不得再關閉 detail。Row same-click、另一列click、Arrow切換、detail close button與single-surface back都必須呼叫同一request function；禁止直接呼叫`setDetailVisibility(false)`或先改context再補guard。

`requestWorkspaceDetailTransition(moduleId, intent)`只在目前open detail會被關閉或替換時執行既有module guard；allow後用單一reducer action提交`nextContext + nextDetailOpen`，keep-open／throw則零state change並依guard focusTarget復原。Guard pending期間忽略重複row／Arrow intent，避免較晚Promise覆寫較新選取；pending state可沿用`closePendingModuleId`，不得再建立第二套busy owner。

Arrow handlers只在 row root或其非互動內容生效；`input`、`textarea`、`select`、`button`、`a`、`contenteditable`及 editor root不得被攔截。Arrow切換後以 `focus({preventScroll:true})`對齊新 row，再以最小必要 `scrollIntoView({block:'nearest'})`確保可見。

## 8. Drag and click arbitration

- Pointer origin在 row的非互動區域且原生 `dragstart` 成功後，該 gesture不得再觸發 row click、detail toggle或selection切換。
- Nested control依 DEV-041 維持不可提升為 drag source；其 click／keyboard語意不變。
- relation placement期間 ArrowUp／ArrowDown不切換 detail；Escape先取消 placement並恢復 source focus。
- drag preview、drop result與candidate state不得寫入 list-detail state或 preference。
- 選取列與可拖曳狀態使用不同且不重複的視覺訊號；不得只靠顏色。

## 9. List width algorithm

### 9.1 Initial preferred width

1. 等待 list data ready、`document.fonts.ready`（不可得時略過）與兩個 animation frames。
2. 若帳號已有該 module preference，直接以 stored preferred width 計算 effective width，不執行 content-fit。
3. 無 preference 時，frame先計算`autoMax=min(480px, containerWidth - 320px - 8px)`，再以CSS intrinsic track呈現：`fit-content(var(--workbench-list-auto-max)) 8px minmax(320px, 1fr)`；list slot另設`min-width:220px; max-width:autoMax`。不得clone DOM或把內容強制`white-space:nowrap`來量測。
4. 穩定後只讀一次list track的`getBoundingClientRect().width`，依第9.2節clamp並凍結成本次mount的memory preferred；空清單使用`220px`。這次初始化不得送PUT。
5. Content、filter、selection或detail後續變化不得重新量測或自動改寬，避免操作中跳動。

### 9.2 Clamp

```text
LIST_MIN = 220px
LIST_MAX = 480px
DETAIL_MIN = 320px
SEPARATOR = 8px
containerMax = containerWidth - DETAIL_MIN - SEPARATOR
effective = clamp(preferred, LIST_MIN, min(LIST_MAX, containerMax))
```

當 containerMax < LIST_MIN 或 container寬度小於 `640px`，改用第 10 節 single-surface 投影；此時不顯示 separator、不覆寫帳號 preferred width。Container放大後重新套用原 preferred width與當下 clamp。

### 9.3 Resize and persistence

- Pointer drag每 frame最多更新一次 preview；只在 `pointerup`／`pointercancel`後送 commit。`pointercancel`回最後 committed effective width。
- Separator keyboard：Left／Right=`16px`；Shift+Left／Right=`48px`；Home=minimum；End=當下maximum。
- Keyboard連續操作以 `300ms` debounce合併一次 PUT；pointer resize只在結束時 PUT。不得每個 move寫 API。
- UI保存 preferred width，不保存 viewport clamp後的 effective width。
- GET／PUT失敗不阻塞清單與明細；保留本次記憶體寬度，在 separator附近以單一 `aria-live="polite"` 狀態提示「版面偏好尚未儲存」。下一次 commit重試。
- 禁止降級寫入 `localStorage` 冒充帳號偏好。

## 10. Responsive and accessibility contract

- `containerWidth >= 640px`：同時顯示 list、separator、detail frame。
- `containerWidth < 640px`：一次只呈現 list或detail content；detailOpen時顯示detail，關閉後回list。右欄的邏輯 owner仍在同一 frame，不建立 Drawer／Modal或第二 route。
- DEV-033判定為mobile／coarse／readonly時，不提供 domain drag；清單導覽、選取、明細閱讀與返回仍可用。
- Separator使用 `role="separator"`、`aria-orientation="vertical"`、`aria-valuemin/max/now`、可見 focus ring及至少 24px hit target；視覺線可維持 1px。
- Row使用適合現有 DOM 的 `button`或 `role="option"`＋single-select list semantics；不得混用兩套選取語意。`aria-selected`與可見 selected state一致。
- Detail open／close不以動畫作唯一訊號；遵守 reduced motion。
- 無內容的層級 detail frame不顯示常駐教學卡，但保留 `aria-label="層級明細"`與 focus fallback。

## 11. Employee visual baseline and module mapping

### 11.1 Baseline authority

「依據員工版面」指現行 workspace 內的 Employee list-detail surface，不是舊版 Organization canvas 左 rail／右 inspector。RD以以下既有 source 為抽取依據：

- 清單 anatomy：`src/components/DirectoryDock.tsx#DirectoryPanel`與 Employee row。
- 明細 anatomy：`src/components/DirectoryDetailPanel.tsx#DetailHeader`及 `inspector__section`。
- 現行 style：`src/index.css` 的 `directory-*`／`inspector-*`與`src/components/workspace/workspace.css`的 surface overrides。
- 參考畫面：`output/playwright/dev039/F039-QC-05-master-data-list-detail-adjacent.png`（1440×900）與`F039-QC-05-master-data-1024-adjacent.png`（1024×768）。兩張圖只協助辨識設計意圖，不可重用為 DEV-046 candidate pass；最終判定必須以 S6 frozen candidate 重新取證。

若上述舊 CSS 有 cascade衝突，以本節 frozen token contract 為準；若 domain 畫面與 Employee 基準衝突，先修正 domain projection，不得修改全域 Employee 基準去遷就單一功能。

### 11.2 Shared anatomy

~~~text
WorkspaceListDetailSurface                         flat white surface
├─ WorkbenchListFrame                              left, fixed header/search
│  ├─ header: title | count | one primary action   no list-close button
│  ├─ search (only when a real filter exists)      omitted without reserved gap
│  └─ list scroller
│     └─ WorkbenchListRow × n                      primary trigger + optional slots
├─ WorkbenchListSeparator                          1px visual / 24px hit target
└─ WorkbenchDetailFrame                            right, permanent owner
   ├─ header: title | domain actions | close        one header and one close only
   └─ body: standard sections OR edge-to-edge       one detail scroll owner
~~~

共用 primitive 合約：

- `WorkbenchListFrame`固定 header → optional search → list body 的順序；接受 `title`、`count`、`primaryAction`、`search`與`children` slots。沒有真正搜尋能力時整個 search slot不render，不能放 disabled／空輸入框。
- `WorkbenchListRow`固定選取、hover、focus、disabled、dragging與drop-candidate states，並接受 primary／secondary copy、leading、trailing、actions及indent slots。DOM固定為list內的`li`，其第一個互動子項為primary trigger `button`，actions為siblings；不得出現button-in-button。Arrow roving focus只落在 `data-workbench-row-trigger`。
- Row primary trigger以 `aria-current="true"`表達目前選取，並以`aria-controls={detailId}`／`aria-expanded`表達該選取的detail是否開啟；視覺 selected state套在同一 row root。Relation drag props套在row root且只允許從primary／非action區域啟動；actions不得觸發select或drag。
- `WorkbenchDetailFrame`接受 `title`、optional `actions`、`onClose`、`bodyMode: 'standard' | 'edge-to-edge'`與body。`standard`供 Employee／一般表單與分段明細；`edge-to-edge`只供 Process canvas、Management Method document等本身已有必要捲動／編輯邊界的內容。Frame root永遠存在，但只有`state='open'`時render可見header／body；`closed`與無domain內容的`empty`維持安靜白底與accessible label。
- `standard` body可使用共用 section heading／section spacing；`edge-to-edge`不得再包卡片或18px全域padding。兩種 body mode共用同一 header、close、detail state與外框，不得衍生 module-specific frame variant。

最小 props 契約：

```ts
type WorkbenchListFrameProps = {
  title: string
  count?: string
  primaryAction?: ReactNode
  search?: { value: string; label: string; onChange: (value: string) => void }
  listLabel: string
  children: ReactNode
}

type WorkbenchListRowProps = {
  id: string
  detailId: string
  selected: boolean
  detailOpen: boolean
  disabled?: boolean
  primary: ReactNode
  secondary?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  actions?: ReactNode
  expandedContent?: ReactNode
  indentPx?: number
  onActivate: () => void
}

type WorkbenchDetailFrameProps = {
  id: string
  label: string
  title?: string
  state: 'open' | 'closed' | 'empty'
  bodyMode: 'standard' | 'edge-to-edge'
  actions?: ReactNode
  onClose: () => Promise<'closed' | 'kept-open'>
  children?: ReactNode
}
```

拖曳、row refs與keyboard handlers由第5～8節既有 hooks／bindings注入，不在 props 另造第二份 payload、selection或event authority。

### 11.3 Frozen Employee-derived visual tokens

下列為 Current Phase 必須一致的預設值；應集中在 `.workspace-list-detail-surface` scope，以 CSS custom properties供 primitives使用。Module CSS可以排 domain body，不能覆寫這些 shared tokens。

| Area／token | Required value／rule | Employee basis |
|---|---|---|
| Surface | `background:#fff`；無外框、圓角、陰影或額外page padding | `directory-dock.is-surface`／workspace surface |
| Structural divider | list-detail separator保留8px操作熱區，但只呈現1px idle `#d0d5dd`灰線；hover／active `#98a2b3`；focus `#667085`＋inset focus ring；不得使用多功能workspace split的藍色5px視覺 | Employee surface quiet divider；與多功能分隔線明確區隔 |
| List header | `min-height:32px`; `padding:2px 10px 2px 12px`; title `10px/1.2`, weight `750`, color `#687487`, letter-spacing `.08em` | Employee surface header override |
| Header meta／primary action | count `10px #8a94a2`; controls `28×28px`, radius `7px`; primary action `#3159d9` on `#edf2ff`; gap `4px` | `directory-panel__meta` |
| Search | height `34px`; margin `0 10px 9px`; horizontal padding `9px`; gap `7px`; border `#e0e4e9`; radius `8px`; bg `#f7f8fa`; input `11px` | `directory-search` |
| Search focus | border `#9bb3ff`; bg `#fff`; ring `0 0 0 3px rgba(63,109,246,.09)` | Employee search focus |
| List scroller | `padding:0 8px 12px`; `overflow-y:auto`; `overscroll-behavior:contain` | `directory-list` |
| Standard row | margin-bottom `2px`; padding `2px 6px 2px 7px`; transparent 1px border; radius `9px`; primary text `11px`; optional secondary text `9px #7e8ba0` | current master-data Employee row density |
| Row hover／focus | border `#dce3ec`; bg `#f7f9fc`; visible keyboard ring不得被`outline:0`移除且無替代 | Employee hover，加上 a11y correction |
| Row selected | border `#aabfff`; bg `#eef3ff`; inset left indicator `3px #3f6df6`;不得再疊加selected badge／check icon | Employee selected row |
| Detail header | title-only `min-height:40px`; padding `4px 12px`; gap `8px`; title `16px/1.15`, weight `700`; close `30×30px` | Employee `directory-detail-panel` header |
| Detail contextual title | 只有必要時可加 eyebrow `9px/1`與 title `12px/1.1`; 不可重複module名或「明細」 | existing department detail variant |
| Standard detail section | padding `18px`; gap `9px`; bottom divider `#edf0f3`; heading `11px/700 #5f6b7b`; count `10px #929ba8` | Employee inspector sections |
| Typography／base colors | Inter／Noto Sans TC／Microsoft JhengHei fallback；ink `#1d2735`; muted `#6c7787`; panel `#fff` | root Employee theme |

除 shared header primary action外，一個作用範圍只保留一個同權重主要動作。正常狀態不顯示目的介紹、helper card、成功面板、重複badge或裝飾性空容器。可互動群組只有在具有展開、選取、提交、風險或獨立捲動邊界時才可有邊框；其餘用間距與細分隔線表達。

### 11.4 Responsive presentation

- `>=640px`沿用本節雙欄 anatomy。Account preferred width只改 list track，不改 header、row或detail tokens。
- `<640px`沿用同一 primitives改為單一 surface；list或detail佔滿可用寬高，不縮成窄雙欄。Detail header成為返回層，仍只有一個close／back control。
- `<640px`或 coarse pointer時，row trigger、header primary action與detail close的最小hit target為`44×44px`；視覺字級、顏色與selected語言不變。Readonly mobile不顯示新增、編輯、刪除、拖曳handle或空 action gap。
- 長標題與次要文字單行ellipsis；完整名稱必須透過accessible name取得。不得讓長字串撐破 list preferred width、detail header或產生document水平捲動。

### 11.5 Allowed adaptation vs prohibited divergence

| Must remain Employee-consistent | May vary by domain |
|---|---|
| surface背景、header/search/list順序、shared padding、row density、selected／hover／focus、separator、detail header／close、scroll ownership、empty／closed quietness | list title／count、是否有真實搜尋、primary／secondary row fields、leading icon／indent、domain action、detail title、standard section內容、edge-to-edge canvas／document內容 |

禁止：module root另加page card、第二頁首、第二搜尋框、第二close、不同selected色系、以固定像素複製Employee當時寬度、用module CSS覆寫shared token、或將 Process canvas／document editor塞進標準18px section。需要第三種 body mode或新 shared visual state時，先回本 spec／Tech Lead；不得由 consumer 私下新增。

### 11.6 Module mapping

| Module | 左側 list slot | 右側 detail slot | Current Phase adaptation |
|---|---|---|---|
| `employees` | 現有Employee directory與搜尋 | `DirectoryDetailPanel`／員工帳號等既有detail | 第一個遷移與visual control specimen；抽出primitives後外觀及能力不得回歸 |
| `positions` | 現有Position directory | 現有Inspector／Position detail | domain編輯與assignment保持原owner |
| `departments` | 現有Department hierarchy list | 現有Department detail | hierarchy presentation不泛化 |
| `levels` | 現有Level order list | 空detail slot（V1） | 支援相同selection／open／close；不虛構domain欄位 |
| `duties` | configuration duty list；audit／distribution結果list | duty configuration或所選盤點／分布detail | `DutyCenter`／`DutyPlanningWorkbench`拆為slots；lane／anomaly rule留在domain component |
| `processes` | 現有Process list | Canvas、node editor與`ProcessDutyBridge`共同位於detail | 移除最外層三欄例外；detail內可保留必要domain分區 |
| `management-methods` | `ManagementMethodListPage` | `ManagementMethodDocumentPage` | editor、chapter、dirty guard不進frame |
| `role-risks` | risk rule list | create／edit form與selected rule detail | `RoleCombinationRiskPanel`拆為list/detail slots；guard保持domain owner |

Organization、Governance不在本表，維持Canvas／Single surface。

Process migration必須移除`activeProcess = selected ?? processes[0]`的render-only fallback；沒有valid `processId`時只顯示list與空detail frame，點列後才寫入context並開detail。Duty audit／distribution目前component-local的selected Duty也必須提升到既有`duties` module context `dutyId`，否則Arrow、URL與detail會有第二selection。Role Risk create／edit draft仍由domain component擁有，frame只控制其detail slot是否顯示。

## 12. Relation extension contract

Current Phase不新增 relation pair，而是讓後續擴充只有一條路：

1. 在 `WorkspaceEntityDragPayloadV1`／`RegisteredDropTarget`增加必要且最小的 discriminated union member；不得放顯示名稱或不可信 snapshot作權威。
2. `parseWorkspaceEntityDragPayload()`與strict `application/x-orgmaster-entity` round-trip同時更新。
3. 只在 `resolveRegisteredDrop()`增加該方向的 canonical resolver case；preview與commit都呼叫同一 resolver，禁止第二 pair matrix。
4. 在 `resolveRelationPlacementCapability()`指定既有 capability owner；無owner即不得註冊。
5. Source／target只使用 `createRelationDragSourceProps()`／`createRelationDropTargetProps()`；canvas auto-pan仍由各owner adapter處理。
6. 指定 `effectAllowed`／`dropEffect`、noop、duplicate、invalid、readonly、capability loss與terminal event預期。
7. 增加 pure resolver、binding、consumer與真實正常入口 browser pair evidence；合法操作恰好一次 mutation，拒絕／取消零 mutation。

一個 pair若需要新 schema、API、permission或domain Command，另立交付 DEV；不得把domain能力藏進共用拖曳元件。A→B與B→A分開登錄及驗證。

## 13. Account preference data and API contract

### 13.1 API

| Method／route | Contract |
|---|---|
| `GET /api/orgmaster/preferences/workbench` | 由verified session principal讀取八個module的preferred list widths |
| `PUT /api/orgmaster/preferences/workbench/:moduleId` | body=`{ "version": 1, "listWidthPx": integer }`；只更新目前principal＋exact module |

GET response：

```json
{
  "version": 1,
  "listWidths": {
    "employees": { "preferredPx": 286, "updatedAt": "2026-09-04T00:00:00.000Z" }
  }
}
```

PUT成功回同一 module projection。規則：

- 身分只來自 `readVerifiedRequestIdentity(request)`；Browser不得提交 principal或employee ID。
- `vite.config.ts`把preference plugin放在`orgmasterAuthApiPlugin()`之後；`createOrgmasterServer()`同樣把preference middleware放在auth middleware之後。兩條delivery path都必須由auth middleware先設定verified request identity，API handler不得自行解析cookie／development header。
- module allowlist固定為第 11 節八個 ID；其他值 `404 PREFERENCE_MODULE_NOT_FOUND`。
- body上限 4 KiB；`listWidthPx`只接受 `160..800` integer，否則 `400 PREFERENCE_VALUE_INVALID`。較寬值可保存為preferred，但畫面仍依第 9 節 clamp。
- 未驗證身分 `401 IDENTITY_CONTEXT_REQUIRED`；讀失敗 `503 PREFERENCE_READ_FAILED`；寫失敗 `503 PREFERENCE_WRITE_FAILED`。
- PUT為每個principal＋module的last-write-wins idempotent upsert。偏好不影響domain correctness，不加入CAS、command ledger或global revision。
- response `Cache-Control: no-store`；一般log不得輸出完整principal ID或整份偏好payload。

### 13.2 Persistence

Cloud SQL migration `011_dev046_workbench_list_width_preferences.sql`：

```sql
CREATE TABLE orgmaster_core.workbench_list_width_preferences (
  principal_id text NOT NULL,
  module_id text NOT NULL,
  list_width_px integer NOT NULL CHECK (list_width_px BETWEEN 160 AND 800),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (principal_id, module_id),
  CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  CHECK (module_id IN ('employees','positions','departments','levels','duties','processes','management-methods','role-risks'))
);
```

- Migration使用 `-- DB-CHANGE` header、owner=`orgmaster`、schemas=`orgmaster_core`、contract-impact=`none`、backward-compatible；只授予 `jenfu_orgmaster_runtime` SELECT／INSERT／UPDATE／DELETE，沒有跨app contract view。
- 011明確依賴010 neutral schema boundary已套用；不得回改001～010，也不得在legacy `orgmaster`或`public`建立新物件。
- Local-json mode使用 `data/user-preferences/workbench-list-widths/<sha256(principalId)>.v1.json`與 verified atomic write；檔名不得包含raw principal。單一runtime內以per-file queue序列化PUT。
- 兩種 persistence mode投影完全相同；local file不是OrganizationDocument或workspace artifact。
- 011只建立與測試 migration；production apply、authority switch與release另進release gate。

## 14. Failure recovery and consistency

| Failure | Required behavior |
|---|---|
| Preference GET timeout／503 | content-fit繼續；separator可用；顯示一次非阻斷狀態 |
| PUT timeout／503 | 畫面保留記憶體preferred；標記unsaved；下一次commit重試，不循環自動重送 |
| Stored value invalid | server拒絕／client忽略該module，回content-fit；其他module仍載入 |
| Container shrinks | 只re-clamp effective或切single-surface；不覆寫preferred |
| Detail dirty guard拒絕close／switch | selectedId、context、detailOpen及focus不變；顯示domain既有guard UI |
| Selected entity deleted | sanitize context後關閉detail，focus回list；不保留dangling ID |
| Relation target unmount／capability loss | DEV-041 fail closed、session cleanup、zero mutation；不影響detail／width |
| API回其他principal資料 | security failure，停止完成判定並回RD；不得在client過濾後視為修復 |

## 15. File impact and allowlist

Production allowlist：

- `src/App.tsx`
- `src/workspace/{moduleRegistry,types,state,route,useWorkspaceController,listDetailWorkbench,workbenchPreferenceClient}.ts{,x}`
- `src/components/workspace/{WorkspaceSurfacePrimitives,WorkbenchListSeparator,useListDetailWorkbenchInteraction}.tsx`
- `src/components/workspace/WorkbenchPresentationPrimitives.tsx`
- `src/components/workspace/adapters/{MasterDataModuleAdapter,DutyModuleAdapter,ProcessModuleAdapter,ManagementMethodModuleAdapter,RoleRiskModuleAdapter}.tsx`
- `src/components/{DirectoryDock,DutyCenter,DutyPlanningWorkbench,ProcessPlanningWorkbench,RoleCombinationRiskPanel}.tsx`
- `src/components/managementMethods/{ManagementMethodListPage,ManagementMethodDocumentPage}.tsx`，只有slot／owner接線需要時可改。
- `src/components/workspace/workspace.css`及上述既有domain component直接使用的局部CSS；不得新增global overlay或viewport-fixed detail規則。
- `server/{orgmasterServer,workbenchPreferenceApi,workbenchPreferenceRepository}.ts`
- `vite.config.ts`，只允許新增preference plugin且固定置於auth plugin之後。
- `db/migrations/011_dev046_workbench_list_width_preferences.sql`

Test allowlist為上述檔案的同名 `*.test.ts(x)`、`server/orgmasterServer.test.ts`、`server/dev010DatabaseBoundary.test.ts`、`src/components/workspace/WorkspaceSingleLayerContract.test.tsx`及既有relation tests。唯一browser runner固定為`qa/dev-046/browser/normal-entry.mjs`，唯一結果索引固定為`output/playwright/dev046/manifest.md`；fixture helper若超過runner內可維護範圍才可建立`qa/dev-046/fixtures/workbench.mjs`。若需修改domain schema、Command、permission、其他 API、Organization／Governance production component、新 dependency或migration 001～010，立即停止回 PM／RD Technical Lead。

## 16. RD execution slices

### S0 — Contract guard

- 先新增 pure state／clamp tests、八module descriptor contract、Escape precedence、Employee-derived token／anatomy contract與source policy scan。
- 鎖定 DEV-041 MIME／resolver／mutation owner數量，避免重構期間建立第二路徑。

### S1 — Shared frame and interaction

- 擴充 `WorkspaceListDetailSurface`、新增separator、interaction controller及Employee-derived presentation primitives／scoped tokens。
- 新增`requestWorkspaceDetailTransition()`並讓same-click、另一列、Arrow、close control、Escape與single-surface back共用同一guard path；allow後原子更新context＋visibility，pending intent不得競賽；調整`openDetails` admission，使empty／create detail不依賴selected ID。
- 先用 isolated fixtures完成click／arrow／Escape／dirty keep-open／focus／empty／create detail／single-surface。

### S2 — Account preference vertical slice

- 建立011 migration、repository、API、client與local-json／cloud-sql tests。
- 接入Vite與standalone server兩條auth後置middleware；驗證cross-principal isolation、invalid module/value、GET failure與PUT recovery，並執行DB boundary check。

### S3 — Master data and Duty migration

- 先遷移employees並凍結為visual control specimen；通過shared anatomy／computed-style contract後，再遷移positions／departments／levels與Duty configuration／audit／distribution。
- 刪除這些consumer的list-only與module-specific width正常路徑；domain controls保持原owner。

### S4 — Process, Management Method and Role Risk migration

- Process list投左slot；canvas／node editor／bridge投右slot。
- Management Method與Role Risk只拆composition，保留editor／dirty guard。

### S5 — Relation convergence and cleanup

- 盤查所有production `draggable`／`onDragStart`／`onDrop`；已登錄relation consumer只能經shared bindings。
- 驗證row click與drag arbitration；不得改DEV-041 resolver或domain authority，除非contract test揭露既有偏差。

### S6 — Candidate verification

- targeted → full regression → typecheck／client＋server build → DB boundary → task-owned browser QA／QC；以同一candidate、同一viewport先拍Employee control，再逐module做anatomy／computed-style／quietness比對。
- Browser修正收斂後凍結一次candidate再取最終visual evidence；不得以舊DEV-042截圖宣稱新框架通過。

S0→S6依序進行；S3／S4可在S0～S2通過後分小批遷移，但production不得永久保留新舊兩套frame或interaction controller。

## 17. Acceptance criteria

### A. Shared behavior

- [x] A1 八module皆由正常頂部launcher進入同一list-detail frame，雙欄時DOM順序固定list→separator→detail。
- [x] A2 levels即使沒有domain detail也保留右框；無教學卡、無假資料、無runtime error。
- [x] A3 點另一列切detail；點同一已選列關閉內容；再點重開；selected highlight始終一致。
- [x] A4 ArrowUp／ArrowDown依filtered visible order切換且不循環；輸入欄與editor內按鍵不被攔截。
- [x] A5 Same-row close、另一列／Arrow switch、Escape與single-surface back皆經同一async dirty guard；keep-open零state change，closed detail時Escape不關閉panel。
- [x] A6 right detail slot在open／closed／empty都維持同一owner；不存在module-specific Drawer或第二detail mount。
- [x] A7 `openDetails`與selected ID正交；Level empty及Role Risk create可開啟，Process沒有render-only首筆fallback，Duty audit／distribution沒有component-local第二selection。
- [x] A8 open detail只有frame的一個可見／可存取close control；domain detail不重複標題或close，所有close仍經guarded transition。

### B. Width and account preference

- [x] B1 無偏好時八module各自只執行一次content-fit並依clamp呈現，filter／selection不造成寬度跳動。
- [x] B2 Pointer與keyboard separator均可調整；ARIA value、focus與hit target正確。
- [x] B3 reload、登出後同帳號重新登入可恢復每module preferred width；A帳號不得讀到B帳號資料。
- [x] B4 窄container忽略但不刪除preferred；恢復寬度後套用原值。
- [x] B5 GET／PUT失敗不阻斷工作，且不寫localStorage冒充成功。
- [x] B6 local-json與cloud-sql repository contract parity；011通過DB boundary與migration isolation tests。
- [x] B7 Vite dev與standalone server皆由正常Auth session存取偏好；無session、偽造principal及錯誤middleware順序fail closed。

### C. Module parity

- [x] C1 Employee／Position／Department既有選取、編輯、帳號入口與assignment能力不回歸。
- [x] C2 Level reorder／rename／apply仍可用，空detail frame不搶焦點。
- [x] C3 Duty三模式、lanes、anomaly filter與relation placement不回歸。
- [x] C4 Process mindmap／flow、node／edge editor、ProcessDutyBridge、canvas geometry與auto-pan不回歸。
- [x] C5 Management Method list／draft／readable、chapter、dirty-close與permission不回歸。
- [x] C6 Role Risk list／create／edit／enable／delete與dirty-close不回歸。

### D. Drag extensibility and safety

- [x] D1 所有既有Employee→Position、Duty→Position、ProcessNode↔Duty方向沿用strict MIME、single session、single resolver與single mutation owner。
- [x] D2 Row drag不觸發click/detail toggle；nested controls不啟動drag。
- [x] D3 unsupported／duplicate／same target／readonly／cancel／target unmount全部zero mutation並清理session。
- [x] D4 source policy scan未發現relation consumer自行實作第二套`onDragStart／onDrop`。

### E. UX and viewport

- [x] E1 `1440×900`、`1024×768`雙欄可讀，沒有非預期document overflow、第三scroll owner或被遮擋control。
- [x] E2 `390×844`完整唯讀且single-surface導覽可完成，沒有drag mutation入口。
- [x] E3 keyboard-only可由launcher→list→rows→detail→separator→返回完成主要流程；focus可見且順序與畫面一致。
- [x] E4 正常畫面沒有重複標題、helper card、成功面板或框中框；detail domain內容仍是唯一主焦點。
- [x] E5 八module都使用 `WorkbenchListFrame`、`WorkbenchListRow`及`WorkbenchDetailFrame`適用部分；source scan沒有consumer複製同義frame／header／selected CSS。
- [x] E6 `1440×900`與`1024×768`時，八module的surface、list header、search、row、separator及detail header computed styles符合第11.3節；寬度可不同，但共同token不得不同。
- [x] E7 Employee在primitives抽取前後的清單標頭、搜尋、列密度、選取、明細標頭與section spacing無可見回歸；Employee是candidate control，不以舊截圖直接宣稱通過。
- [x] E8 `390×844`單surface保留同一視覺語言，所有可見row／back／close target至少44px，readonly mutation controls與其保留空間均不存在。
- [x] E9 `standard` detail沒有無權利的框中框；Process canvas與Management Method document使用`edge-to-edge`且沒有18px wrapper造成geometry、可讀寬度或雙重捲動回歸。

## 18. QA／QC evidence contract

Risk lane=`High`，QA先凍結上述A～E；QC不得修改產品。

必要 automated gate：

```powershell
npx vitest run src/workspace/listDetailWorkbench.test.ts src/workspace/state.test.ts src/workspace/route.test.ts src/workspace/workbenchPreferenceClient.test.ts src/workspace/entityDrag.test.ts src/workspace/relationPlacement.test.ts
npx vitest run src/components/workspace/WorkspaceSurfacePrimitives.test.tsx src/components/workspace/WorkbenchListSeparator.test.tsx src/components/workspace/useListDetailWorkbenchInteraction.test.tsx src/components/workspace/WorkspaceSingleLayerContract.test.tsx src/components/workspace/relationPlacementBindings.test.tsx
npx vitest run src/components/workspace/adapters/MasterDataModuleAdapter.test.tsx src/components/workspace/adapters/DutyModuleAdapter.test.tsx src/components/workspace/adapters/ProcessModuleAdapter.test.tsx src/components/workspace/adapters/ManagementMethodModuleAdapter.test.tsx src/components/workspace/adapters/RoleRiskModuleAdapter.test.tsx
npx vitest run src/components/DirectoryDock.employee-drag.test.tsx src/components/DutyCenter.test.tsx src/components/ProcessPlanningWorkbench.test.tsx src/components/RoleCombinationRiskPanel.test.tsx src/components/managementMethods/ManagementMethodDocumentPage.test.tsx
npx vitest run server/workbenchPreferenceRepository.test.ts server/workbenchPreferenceApi.test.ts server/orgmasterServer.test.ts server/dev010DatabaseBoundary.test.ts
npx tsc --noEmit --pretty false
npm run build
npm run check:db-boundary
npm test
node qa/dev-046/browser/normal-entry.mjs
git diff --check
```

Browser normal-entry matrix至少包含：

| Case | Actor／fixture | Steps | Pass evidence |
|---|---|---|---|
| F046-01 | desktop editable，八module有代表資料 | 頂部launcher逐一開啟 | frame／slot／可見內容／console 0 error |
| F046-02 | filtered list | click另一列、同列close／reopen、Arrow boundaries、Escape | selection、detail state、focus trace與screenshots |
| F046-03 | account A／B | A調整三module後reload；切B；再回A | API readback、DOM effective width與cross-account isolation |
| F046-04 | 1024與container resize | pointer＋keyboard調寬、縮窄再放大 | preferred/effective分離、無overflow |
| F046-05 | levels empty detail | select／close／reopen | frame穩定、無假內容、focus正確 |
| F046-06 | Process＋Duty＋Role Risk | 完成各自主要domain流程 | domain parity、dirty guard、canvas geometry |
| F046-07 | existing relation fixture | 四個既有minimum directions＋cancel／duplicate／readonly | strict event、UI、revision／zero mutation、cleanup |
| F046-08 | 390×844 readonly | 八module閱讀與返回 | 無mutation controls、無遮擋／水平overflow |
| F046-09 | 同一frozen candidate，Employee control＋其餘七module | 於1440×900、1024×768量測shared selectors並取代表截圖；390×844量測touch targets／single-surface | token／anatomy parity、Employee visual non-regression、standard／edge body正確、quietness audit Pass |

Evidence provenance至少記錄：source revision與dirty boundary、task-owned runtime PID／port／purpose／cleanup、actor、fixture、persistence mode、route、browser exact version、viewport、操作、API／DB readback、screenshots及console/pageerror。若啟動暫時runtime，結束前只停止該task-owned process tree並確認port釋放。

## 19. Fail-seeking／FMEA

| Failure mode | Effect | Prevention／test | Stop condition |
|---|---|---|---|
| Frame與adapter各存一份selection | detail與highlight分歧 | source scan＋state transition test | 發現第二selected state即停止 |
| Same-row click與drag同時成立 | 拖曳時明細意外關閉 | pointer-origin arbitration＋native browser case | 任一drag觸發toggle即Fail |
| Content-fit持續監聽內容 | filter時畫面跳動 | once-per-mount contract | 寬度因list內容變更自動漂移即Fail |
| Clamp值被寫回帳號 | 小視窗永久縮小使用者偏好 | preferred/effective separation test | resize container造成PUT即Fail |
| Preference信任client principal | cross-account data leak | server identity＋A/B isolation | 任一跨principal讀寫立即阻擋 |
| Process detail被generic frame裁切 | canvas hit-test／drag失效 | geometry＋native relation QC | source／target出owner bounds即Fail |
| 新relation建立第二resolver | preview與commit不一致 | resolver/source policy scan | 第二pair matrix／mutation owner即停止 |
| close／switch略過dirty guard或async競賽 | 未儲存資料遺失／選取錯位 | precedence、keep-open、rapid intent case | context先變、detail直接關閉或late Promise覆寫即Fail |
| Consumer複製Employee CSS形成近似版 | 日後調整仍需八處維護且視覺漂移 | shared primitive／token source scan＋computed-style matrix | 發現module自建frame／header／selected token即停止 |
| 強迫所有detail套標準padding／卡片 | canvas hit-test、文件可讀寬度或雙重捲動退化 | `standard|edge-to-edge` contract＋geometry／scroll QC | Process／document出現無權利wrapper或第三scroll owner即Fail |

## 20. Release impact note

本 DEV 觸及新 migration、server API、server build與使用者主要UI；實作完成不等於production migration或release。進入release gate前至少需要：011 migration在目標環境的apply／rollback compatibility評估、runtime grant確認、偏好API同源與Auth設定、frozen candidate及本節Browser evidence。Current Phase不產生production commands或release report。

## 21. RD Technical Lead review

結論：`通過（Pass after Contract Optimization）`。現行P0／P1 readiness gap=`0`，RD可依S0→S6開始。

核心原因：真正的重複位於 frame state、interaction、width persistence與drag binding，不在domain detail本身；因此共用這四層即可提升維護效率，把domain UI做成generic renderer反而會建立高耦合mega component。

已完成的最小修正：

1. 沿用 `WorkspaceListDetailSurface`，取消第二個 `WorkbenchShell`，避免與外層 `WorkspaceShell`產生雙shell authority。
2. 將八個consumer與Organization／Governance邊界寫死，避免「所有畫面都清單明細化」的scope膨脹。
3. 拖曳擴充固定沿用DEV-041 typed resolver，不新增plugin registry、event bus或第二pair matrix。
4. 帳號偏好以窄API＋private table／local repository實作，與OrganizationDocument、workspace layout及URL完全隔離。
5. 將preferred width與effective clamp分離，並補cross-account、dirty guard、drag-click、Process geometry及single-surface fail-seeking evidence。
6. 將「依據員工版面」收斂為一份scoped token與三個slot-based presentation primitives；只共用穩定 anatomy／state，不共用domain renderer，避免八份近似CSS與巨型元件兩種極端。

技術債：`DirectoryDock.tsx`與`App.tsx`仍是大型composition hotspot。本 DEV只允許為slot migration抽出直接需要的list presentation；若重構無法由本 DEV acceptance獨立驗證，另立開發點，不在本輪順手全面拆檔。

ADR判定：`不新增ADR`。本次是ADR-009既有panel owner／surface primitive決策的明確後繼 amendment；同步ADR-009與DEV-042 successor note即可保持唯一權威。

## 22. Execution boundary

- 可執行：S0～S6的local／isolated產品程式、011 migration file、repository／API、automated tests與task-owned browser QA／QC。
- 不可執行：production migration apply、正式環境設定、deploy、release、第三方plugin／DnD dependency、新relation pair或domain schema／permission擴張。
- 重新進入PM／Tech Lead：allowlist外變更、無法維持單一selection／resolver／mutation owner、需要改DEV-033 mobile boundary、或帳號偏好無法由verified principal隔離。

## 23. Change log

- 2026-09-04：完成local／isolated implementation與驗證。八個consumer均接入永久list／separator／detail frame；統一同列click關閉／重開、另一列click、ArrowUp／Down、Escape focus restore、pointer／keyboard resize及verified-principal account preference；011 migration／repository／API、Employee visual baseline、typed relation extension path與pointercancel cleanup已落地。八個正常入口確認frame結構，Employee完成1440×900／1024×768／390×844及互動證據；`npm test` 196 files／797 tests／1 skipped、typecheck、client／server build、DEV-010 N2 16／16、DB boundary與diff check通過。RD Technical Lead結論維持`Pass after Contract Optimization`；production migration、deploy與release仍待local release gate。
- 2026-09-04：依使用者追加決策，將現行Employee workspace surface固定為八module的細部風格與排版基準；新增baseline authority、shared anatomy、三個presentation primitives、frozen tokens、responsive規則、允許／禁止差異、E5～E9、F046-09及兩個visual FMEA。RD Technical Lead重新覆核後維持`Pass after Contract Optimization`：這是ADR-009與既有DEV-046架構內的compatible refinement，不新增ADR、domain schema、runtime或產品程式變更。
- 2026-09-04：依使用者確認建立DEV-046並直接補至`RD Implementation Ready`；固定八module共用frame、click／Arrow／Escape state machine、永遠存在的右detail frame、account-scoped resizable list width、DEV-041 relation extension path、011 migration／API／repository、S0～S6、A1～E4、F046-01～08與FMEA。RD Technical Lead完成根因、最小架構、技術債與證據審查，結論為`Pass after Contract Optimization`；本輪未修改產品程式、資料、runtime或release狀態。
