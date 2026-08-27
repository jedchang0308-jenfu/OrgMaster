# DEV-031：同頁待處理來源欄與全職位展開式職掌編輯器 RD Implementation Contract

狀態：`RD Implementation Complete / QA-QC Passed`  
日期：2026-08-21  
來源：`USER-2026-08-21-DUTY-MASTER-DETAIL-LONG-TEXT-DRAG-UX`、`USER-2026-08-21-DUTY-ONE-PAGE-LEFT-TO-RIGHT-EXPANDED-EDITOR`、`USER-2026-08-21-DUTY-CATEGORY-NO-POSITION-COUNTS`  
父任務：DEV-029、DEV-030  
優先級：P1  
風險等級：Medium（替換職掌規劃主要資訊架構、路由呈現、異常分類與桌面拖放放置目標；不改 Duty domain、organization document、API、保存或權限）  
權威範圍：DEV-031 Current Phase 的單頁工作流、待處理分類、全職位展開、長文呈現、跨職位 relation placement、RWD、檔案邊界、QA／QC 與 RD stop conditions

## 2026-08-23 Project Highest Principle Supersession

來源：`USER-2026-08-23-MOBILE-READ-ONLY-HIGHEST-PRINCIPLE`；權威入口：DEV-033 與 `ai-doc/documentation_map.md#專案最高產品原則`。

手機只提供唯讀閱讀與導覽。本文「390×844 不得改為唯讀」、手機／觸控完整配置及其他 mobile mutation 條款，均由 DEV-033 的專案最高產品原則 `Intentional replacement`；既有完成狀態、桌面契約、三 viewport 測試與截圖仍為歷史證據。現行產品程式尚未因本文件修訂而改變，後續實作與驗證只由 DEV-033 推進。

## 2026-08-26 Future Dual-Perspective Workbench Direction

來源：`USER-2026-08-26-DUTY-DUAL-PERSPECTIVE-WORKBENCH`；權威摘要：`ai-doc/dev_task.md#dev-036雙視角責任規劃完整工作台`；工程契約：`ai-doc/specs/DEV-036-duty-dual-perspective-workbench.md`。

使用者已明確改變本文「不採獨立工作台頁籤／矩陣視角」的 future 方向。DEV-036 第一版將 canonical `/duty-planning` 規劃為正式雙視角完整工作台，從第一版即提供「責任盤點」與「責任分布」兩個可切換頁籤；前者以 Duty 為主物件盤點既有責任與 anomaly，後者以 Position 為主物件審視主執行／協作／審核／會簽分布。未來視角只有完成後才加入，不先顯示 disabled tab。

此決策是 future `Intentional replacement`，不回寫 DEV-031 的歷史完成狀態、既有程式事實或 QA／QC 證據。DEV-036 已完成 `RD Implementation Complete / QA-QC Passed`；其最小雙視角工作台已取代 `/duty-planning*` 的舊 composition，進階視角與 mutation 仍不在本輪範圍。

DEV-034 繼續承擔組織圖上的快速責任配置，Duty Drawer 繼續承擔單筆明細。DEV-036 Current Phase 已固定為最小唯讀工作台：Audit 提供搜尋、三 anomaly 複選、列表與 Drawer；Distribution 只提供 Position／department 文字搜尋及四類 count，所有異動導回 DEV-034。三者共用現行 organization state、Duty／relation identity、commands、Undo／Redo、autosave 與 CAS；不得恢復第二套 planning store／保存，或把責任數量誤稱為工作量。工程契約：`ai-doc/specs/DEV-036-duty-dual-perspective-workbench.md`。

## 2026-08-24 Future Information Architecture Supersession Notice

> 2026-08-25 successor update：組織圖內嵌責任配置的唯一 active successor contract 已移交 `DEV-034`，目前為 `RD Implementation Ready / RD Not Started`。本節保留歷史決策脈絡，但其中由 DEV-032 Method Step／Work Item 智能引用進入配置的敘述已被 DEV-032 精簡 Current Phase取代；未來不得直接引用本節實作。DEV-034完成實作與 QA／QC前，DEV-031的現行 route、domain、保存、測試與證據仍維持權威。

來源：`USER-2026-08-24-ORG-CHART-INLINE-DUTY-ASSIGNMENT-MODE`、`USER-2026-08-24-DEV032-DRAFT-FIRST-PHASE`、`USER-2026-08-24-DEV032-UX-DESIGN-DETAILS`、`USER-2026-08-24-DEV032-BRIEF-DETAIL-CONTINUATION`；future 權威入口：`ai-doc/dev_task.md#dev-034組織圖內嵌工作事項責任配置模式`。

使用者已確認未來責任配置沿用既有組織架構頁，不新增責任配置頁、永久第三欄或第二份全職位清單。目標流程為選定工作事項後收合成最小任務列，選擇責任類型，再以既有組織圖 Position 節點直接加入／移除關係；既有 Inspector 按需顯示配置摘要。本階段不新增責任配置專用的職位搜尋、部門篩選、職位清單或鍵盤選位，也不新增工作事項層級的職責重疊風險規則，只沿用既有兼任風險設定。實作時，`/duty-planning*` 應成為回到組織架構頁並恢復配置上下文的相容入口，不再承載第二套主要工作流。

「責任配置不新增頁面」不適用於 DEV-032 的管理辦法主體；管理辦法已確認需要完整編輯頁，以承載 `MP` 建置中草稿的長篇章節、流程步驟、控制／證據要求、永久代碼與草稿標示，不得塞入組織圖 Inspector。DEV-032 Current Phase 不建立文件 revision、organization snapshot、核准／發布／生效或正式合規治理；這不影響本 DEV 對組織架構頁責任配置模式的 future replacement。

DEV-032 的管理辦法完整編輯頁會以 Method Step＋Work Item context 進入既有組織圖責任配置模式；最小任務列保留返回 `MP-xxxx／步驟` 的來源，完成、取消或瀏覽器返回後須恢復原步驟、捲動與焦點。這個 return context 只延伸未來的相容導覽契約，不改變本 DEV 現行 `/duty-planning*` route 或完成證據。

本 DEV 現行 `DELETE_DUTY` 可刪除 Duty 並連帶移除 DutyPositionRelation；DEV-032 建立 Method Step → Work Item reference 後，該行為必須加入跨 domain 刪除前驗證：只要任何 Method Step 仍引用該 Work Item 就阻擋刪除並顯示引用位置，不得 cascade 刪除或留下 missing reference。這是 DEV-032 future `Intentional replacement`，在 DEV-032 實作前不改寫本 DEV 的現行程式、測試或完成狀態。

這是 DEV-032 的 future `Intentional replacement`，不是本 DEV 的程式完成或失效宣告。DEV-031 的現行 route composition、元件、測試、QA／QC 結果與歷史證據在 DEV-032 實作完成前仍有效；後續不得只依本文件通知移除現行程式。未來取代時仍須保留 Duty／relation identity、五個 exact lanes、deterministic validator、organization state、Undo／Redo、500ms autosave、version CAS、唯讀 gate 及可恢復失敗語意；此處 `version CAS` 只指既有 organization state 的並行保存，不代表 DEV-032 Current Phase 具有管理辦法文件版次。

## 1. Outcome 與執行邊界

本期把職掌規劃收斂成一個由左到右的可編輯工作面：

```text
待處理職掌（分類來源）  →  全部 active 職位（全展開）  →  放置後就地更新
```

桌面版左側常駐「待處理職掌」，右側一次攤開所有符合職位／部門篩選的職位與其執掌。使用者不必先進入另一頁、不必選取職位，也不必在「執行／審核／協作」三個橫向欄位之間閱讀長文；來源與目標在同一個 viewport 工作區內完成拖拉配置。

程式已改為單一 `DutyPlanningWorkbench`：`/duty-planning`、`/duty-planning/matrix`、`/duty-planning/anomalies` 均呈現左側分類來源與右側全 active 職位展開；舊 master-detail 元件與 dead CSS 已移除。舊測試及截圖保留為歷史證據，不支撐本版 done 判定。

本版已完成 S0→S4 本機實作、targeted QA、production build 與真實 Chromium 三 viewport QC；未授權 deploy 或 release。完成證據：`output/playwright/dev031-revision/manifest.md`。

## 2. Human-confirmed 決策

1. 「待處理職掌」移到最左側，支援由左到右的工作順序。
2. 刪除「選取職位的統一執掌區」及其 selected-position state、職位切換器與分類 filter。
3. 右側直接展開所有職位及其執掌，整個畫面可一起閱讀與編輯。
4. 不再顯示 `執 n｜審 n｜協 n`、責任總數或分類數量摘要；數量不支援本畫面的核心判斷，屬常駐噪音。
5. 「無執行職位」、「缺少主執行」、「待重新分配」改為待處理欄的分類標題；每筆 Duty 不重複顯示同一異常文字或 Badge。
6. 執行、審核、協作仍為職位內的縱向群組，不各占一個完整橫向欄位；空群組不呈現。
7. 長文必須自然換行、可完整閱讀；拖拉、鍵盤／觸控替代配置與 Undo 必須保留。

### Rejected directions

- 不採獨立 `/duty-planning/matrix` 才能編輯的另一層頁面；它切斷待處理來源到職位目標的拖拉。
- 不採「職位主清單→選取一職位→單一明細」；它要求反覆切換並隱藏其他職位內容。
- 不採職位列上的執／審／協數字，也不採每筆待處理項目重複異常標籤。
- 不恢復四欄矩陣、三個責任 tab 或三個並排責任 pane。

## 3. 效用取捨

Current Phase 權重：長文閱讀 30%、拖拉配置 30%、全局掃描 20%、分類辨識 10%、RWD 10%。

| 方案 | 預估效用 | 判定 |
| --- | ---: | --- |
| 四欄責任矩陣 | 3.0／5 | 長文與窄版成本過高 |
| 獨立 master-detail 頁 | 3.7／5 | 文字寬，但待處理來源與目標被拆開 |
| 同頁左來源＋單一選取職位 | 4.0／5 | 拖拉直接，但跨職位閱讀仍需切換 |
| 同頁左分類來源＋右全職位展開 | 4.6／5 | Current Phase 採用；以垂直捲動換取長文、全局與拖拉效用 |

接受的成本是右側頁面較長；用固定職位排序、右側獨立捲動、sticky 職位標題、搜尋／部門篩選及拖曳 edge auto-scroll 控制成本。不得用數字摘要、tab 或 selected detail 把已確認的全展開再次折回。

## 4. Spec Impact 與相容契約

### 4.1 Intentional replacement

- 取代 DEV-029 `/duty-planning` 的「緊湊矩陣＋右側異常」左右順序及四欄內容呈現。
- 取代舊 DEV-031 `/duty-planning/matrix` 的 `DutyMasterDetailEditor`、職位 rail、selected position、責任 counts 與 group filter。
- 取代 DEV-030 在本單頁待處理來源的「每 Duty 卡片重複異常 Badge」呈現；異常 domain、anomaly identity、明細開啟及 placement validator 不變。
- `/duty-planning/matrix`、`/duty-planning/anomalies` 降為相容 alias，呈現同一個統一工作面；產品 UI 不再提供前往這兩個獨立 surface 的導覽入口。
- 不回寫或否定 DEV-029、DEV-030 及舊 DEV-031 的歷史完成證據。

### 4.2 Compatible contract

- 精確 lane 仍為 `primary-execute`、`other-execute`、`review`、`collaborate`、`countersign`。
- operation unit 仍是一筆 relation 或一筆 anomaly repair source，不是整個 Duty。
- `evaluateDutyDrop`、`createDutyDropIntent`、主執行固定 move、非主執行明確 move／copy、duplicate／inactive／same-position rejection 全部沿用。
- organization `currentState`、Undo／Redo、500ms autosave、Ctrl+S、DocumentMenu 與 version CAS 不變。
- 點擊或 Enter 開啟既有 `DutyDetailDrawer`；配置工作不建立第二套 Duty 編輯表單。

### 4.3 ADR

不新增 ADR。資料權威、schema、API、保存與 transaction boundary 不變；本期是 presentation 與 interaction 的 intentional replacement。若 RD 必須改 relation ordering contract、V6 schema、API、權限或保存 authority，立即停止並回 PM。

## 5. Current Scope／Out of Scope

### 5.1 Current Phase

- `/duty-planning`、`/duty-planning/matrix`、`/duty-planning/anomalies` 均 render 同一個 unified workbench；`/duty-planning` 是 canonical URL。
- 桌面版左側常駐待處理分類來源欄，右側為全部 active 職位展開編輯區。
- 待處理項目依 anomaly type 分成「無執行職位」、「缺少主執行」、「待重新分配」；分類為標題，不逐卡重複。
- 右側每個職位是扁平 section；職位標題下只渲染非空的執行、審核、協作群組及 relation rows。
- 完全沒有 relation 的職位保留一個安靜的可放置區，確保它仍可接收左側來源。
- 支援長文自然換行、桌面原生 HTML drag（與既有 Pointer fallback 共用 validator）、edge auto-scroll、有效目標回饋、move／copy chooser、取消、失敗恢復、focus return 及 Undo。
- 每個待處理 source 與既有 relation row 都提供鍵盤／觸控配置入口，與 Pointer 使用同一 validator。
- 保留頁首的 Duty 搜尋、職位搜尋、部門篩選、新增 Duty、文件與編輯狀態控制。

### 5.2 Out of Scope

- 不新增執／審／協數字、職位責任總數、負荷 KPI、圖表或 heatmap。
- 不提供 selected position、職位 tab、分類 tab、群組 filter、accordion 式逐職位隱藏或另一層編輯頁。
- 不做同 lane 人工排序、上移／下移、插入線或跨 Duty order migration。
- 不允許拖到另一責任群組就改 relation type；不自動轉換主責／共同、審核／會簽。
- 不搬移整個 Duty 的全部 relations，不新增多選、批次配置、AI 建議或負荷平衡。
- 不改 Duty／DutyPositionRelation／organization schema、server、API route、保存、權限或異常推導規則。
- 不新增送審、通知、登入 principal、版本 ACL、跨裝置、deploy 或 release。

## 6. Route、元件與狀態 Ownership

### 6.1 Route composition

| URL | Render owner | Current Phase 結果 |
| --- | --- | --- |
| `/duty-planning` | `DutyCenter → DutyPlanningWorkbench` | canonical unified workbench |
| `/duty-planning/matrix` | 同上 | 相容 alias；同一 DOM composition，不 render master-detail |
| `/duty-planning/anomalies` | 同上 | 相容 alias；同一 DOM composition，不 render獨立表格 |

`dutyPlanningRoute.ts` 保留既有 deep-link parsing；不新增 route。`DutyCenter` 不再依 `surface` 分流到 `DutyPlanningView` 或 master-detail。UI 內移除「開啟完整職掌矩陣」及「待處理職掌」route link，避免使用者離開同頁拖拉情境。

`?position=<id>` 改為右側 section 的一次性 scroll target 與短暫 highlight；它不是 selected state。無效、inactive 或被職位／部門 filter 排除時不 throw、不切換為其他 selected position。

### 6.2 Component responsibilities

- `DutyPlanningWorkbench`：唯一 composition、drag session、hit-test、edge auto-scroll、release revalidation、move／copy chooser、drop status 與 route-independent lifecycle。
- `DutyAnomalyPanel`：左側分類與分類內來源列；不再以 Duty 為外卡再逐筆重複 Badge。
- `DutyPendingSourceRow`（新增）：單一 anomaly source 的 Duty title、必要差異文字、明細入口、desktop drag handle 與鍵盤／觸控配置入口。
- `DutyExpandedPositionEditor`（新增，取代 `DutyMasterDetailEditor`）：所有職位 sections、非空責任群組、位置 section target、focus scroll 與 relation placement menu ownership。
- `DutyRelationEditorRow`：完整 Duty title、exact-lane Badge、明細入口、desktop drag handle 與配置入口；不判定合法目標。
- `DutyRelationPlacementMenu`：列出所有可評估 active target positions；送出 source＋target，不複製 move／copy domain 規則。
- `DutyMoveCopyPopover`：只在 validator 回傳 `choose-move-copy` 後取得操作主權。
- `dutyPlanningPresentation.ts`：全部純排序、搜尋、分類與 section projection；React view 不自行建立第二份規則。

### 6.3 Local UI state

只允許以下 ephemeral state：

- `dragSession`
- `dragCandidatePositionId`
- `chooser`
- `placementMenu`
- `placementStatus`
- `dropHighlightPositionId`
- `focusScrollCompleted`

不得保留 `selectedPositionId`、`responsibilityFilter`、職位 counts 或 anomaly count UI state。route change、component unmount、來源消失或 editability 轉為 false 時，關閉 placement menu／chooser、停止 auto-scroll 並清除 drag session。

## 7. Pure Presentation Contract

`src/dutyPlanningPresentation.ts` 以以下 exports 取代 master-detail summary／selection authority：

```ts
interface DutyExpandedPositionSection {
  position: Position
  department: Department | null
  groups: DutyPositionResponsibilityGroup[]
  hasAnyRelation: boolean
  hasVisibleRelation: boolean
}

interface DutyAnomalyCategoryItem {
  duty: Duty
  anomaly: DutyAnomaly
  context: string | null
}

interface DutyAnomalyCategory {
  id: DutyAnomalyType
  label: '無執行職位' | '缺少主執行' | '待重新分配'
  items: DutyAnomalyCategoryItem[]
}

function buildDutyExpandedPositionSections(
  state: OrgDirectoryState,
  sortedPositions: Position[],
  filters: { dutyQuery: string; positionQuery: string; departmentId: string },
): DutyExpandedPositionSection[]

function buildDutyAnomalyCategories(state: OrgDirectoryState): DutyAnomalyCategory[]
```

Required behavior：

1. 先以既有 `sortDutyMatrixPositions` 取得 active position 順序，再套用 position query 與 department filter。
2. Duty query 同時搜尋 title 與 description，只過濾各職位的 relation rows；符合職位／部門條件的 position section 仍保留為 drop target。
3. 每個 section 固定以執行→審核→協作投影；rows 保留五個 exact lane；空 groups 從 `groups` 移除。
4. `hasAnyRelation` 依未套用 Duty query 的 active position relations 計算；`hasVisibleRelation` 依搜尋後 rows 計算，兩者只控制空狀態，不渲染數字。
5. anomaly categories 固定依「無執行職位→缺少主執行→待重新分配」排列；空 category 不回傳。
6. category item 依 Duty title 排序；同 Duty 同分類有多筆 pending relation 時，以 former position title 再 relation id 穩定排序。
7. `context` 只在理解操作單位所必需時存在：`pending-reassignment` 顯示原職位；另兩類為 null。分類 label 不進入 item Badge 或第二行。
8. 同一 Duty 若有不同 anomaly operation units，可出現在不同分類；不得為了視覺去重而遺失可修復來源。
9. 移除或停止使用 `DutyPositionSummary.counts`、`total`、`DutyResponsibilityFilter` 與 `resolveDutyMasterPositionId`。

## 8. Desktop Information Architecture

### 8.1 Layout 與 scroll ownership

- workbench 為兩欄 grid：左 `clamp(260px, 22vw, 320px)`，右 `minmax(0, 1fr)`。
- 左右只用一條主分隔線；layout wrappers 視覺透明，不建立兩張大卡、框中框或陰影層級。
- 左 rail 與右 editor 是兩個明確垂直 scroll owners，均填滿內容區高度；document body 不成為第三個桌面主捲動區。
- 不得產生 document 水平 overflow；right editor、position section、group與row均使用 `min-width: 0`。

### 8.2 左側待處理分類

```text
待處理職掌

無執行職位
  ⠿ 年度產能規劃
  ⠿ 客訴原因追蹤

缺少主執行
  ⠿ 設備保養制度

待重新分配
  ⠿ 月度庫存盤點
     原職位：倉儲專員
```

- 「無執行職位／缺少主執行／待重新分配」只在分類 heading 顯示一次。
- 每個 item 預設只顯示 Duty title；pending relation 才附原職位 context。不得逐 item 重複異常 Badge、severity 文案或數量。
- 預設顯示全部非空分類，不使用 tabs。若所有分類皆空，只顯示一次「目前沒有待處理職掌」。
- editable desktop 顯示專用 drag handle，使用原生 HTML `draggable` 事件完成滑鼠拖放；Pointer fallback、Duty title 點擊／Enter 開明細及配置 menu 仍保留，配置 menu 是鍵盤／觸控替代，不建立獨立操作欄。

### 8.3 右側全職位展開 editor

```text
總經理｜管理部
  執行
    ⠿ [主責] 制定年度經營策略與資源配置……
  審核
    ⠿ [審核] 核定重大資本支出與政策……

生產部經理｜生產部
  執行
    ⠿ [主責] 建立年度生產計畫並依訂單與產能……
    ⠿ [共同] 追蹤製程瓶頸並協調改善……
  協作
    ⠿ 與業務及採購協調交期與物料……

設備技師｜工程部
  尚無職掌
```

- 所有符合 position／department filter 的 active positions 一次展開；沒有 selected row、selector、tabs 或 disclosure。
- position header 只顯示職位名稱與有值時的部門；不得顯示執／審／協數量、責任總數或「已選取」。
- position sections 以留白和單一 divider 分隔，不做 card。header 可在右側 scroll owner 內 sticky，且不得遮住上一 section 的最後一列。
- 只顯示非空的執行／審核／協作 group；group heading 不顯示 count。
- 執行 rows 以「主責／共同」、審核 rows 以「審核／會簽」保留 exact lane；協作可省略重複 Badge。
- Duty title 使用自然列高、`white-space: normal`、`overflow-wrap: anywhere`；不得 ellipsis 或固定 row height。
- 完全沒有 relation 的職位平時顯示一列安靜的「尚無職掌」；拖曳時改為「放置到此職位」。Duty query 造成零 match 時顯示「沒有符合搜尋的職掌」，但 position section 仍是 target。
- 桌面右側使用 `duty-expanded-position-editor--compact` 密集呈現：position header、group、relation row 與空狀態的垂直留白約減半，目標是同一 viewport 可掃描約 2 倍職位 section；長 Duty title 仍自然換行、不 ellipsis，relation handle 維持可拖曳與 focus target。
- 緊湊規則只作用於 `>=1024px`；390／觸控版保留原有列高與操作目標，不以壓縮換取可操作性。

## 9. Drag、Drop 與配置契約

### 9.1 來源與目標

- 左側 source：單一 `DutyAnomaly`；右側 source：單一 position relation。
- 右側每個 position section 是一個大範圍 target，section root 使用 `data-duty-drop-position="true"` 與 `data-position-id`。header、群組留白、row 周圍與空狀態都可命中同一職位。
- target 只代表職位，不代表責任類型。來源 exact lane 由 `dutyResponsibilityColumnForSource(currentState, source)` 決定。
- `no-executor`、`missing-primary-executor` 由既有 anomaly source 規則配置為主執行；`pending-reassignment` 保留原 relation exact lane。

### 9.2 Desktop drag flow

1. editable desktop 的 source handle 設為 `draggable`；`dragstart` 在 workbench root 建立 native drag session，寫入不承載權威資料的 `text/plain` 識別值，並設定 `effectAllowed=move`。
2. `dragover` 以目前游標座標命中 position section，使用同一 `evaluateDutyDrop` 驗證；只有有效 target `preventDefault` 並顯示 drop feedback，`drop` 再以 current state 重驗後 commit。
3. `dragend`、blur、readonly、unmount 或無 target 均清除 candidate／auto-scroll／preview；原生 drag 不建立第二套 command 或資料模型。
4. 瀏覽器或裝置不提供原生 drag 時，仍可使用下列 Pointer flow；兩條路徑共用 source、target、validator、move／copy chooser 與 Undo。

### 9.3 Pointer fallback flow

1. editable desktop 在 handle `pointerdown` 後立即建立 pointer drag session並 `setPointerCapture`；title click不啟動 drag。
2. pointermove 由單一 rAF hit-test 執行 `elementFromPoint(...).closest('[data-duty-drop-position="true"]')`。
3. preview 只對 `evaluateDutyDrop(currentState, [], source, target)` 非 reject 的 section 顯示；不得只靠顏色，需 outline／背景與 `aria` 狀態。
4. pointerup 必須重新讀 `stateRef.current`、重新 hit-test、重新 evaluate；preview 結果不能直接 commit。
5. `stage` 直接 commit；`choose-move-copy` 開啟唯一 chooser；reject、pointercancel、Escape、blur 或無 target 均零變更。
6. 成功後不導頁、不切換 selected position；target section短暫 highlight，來源／異常分類依新 state 就地更新，並以低干擾 `role="status"` 回饋。

### 9.4 Edge auto-scroll

- 新增 pure helper `getDutyDragAutoScrollDelta(pointerY, rect, options)`；預設 threshold 48px、最大 14px／frame，距邊緣越近速度越高。
- Pointer drag 位於右 editor 上方／下方 threshold 時，只捲動右 editor；位於左 rail 時只捲動左 rail。不得同 frame 同時捲動兩個 owner。
- owner 到達 scroll boundary、pointer 離開 threshold、drop、cancel、blur、readonly 或 unmount 時立即停止 rAF loop。
- auto-scroll 每 frame 後重新 hit-test，確保新進 viewport 的 position 可成為 candidate。

### 9.5 鍵盤／觸控替代

- 每個 anomaly source row 與 relation row 提供「配置職位」控制；desktop 可在 hover／focus 顯示，touch／narrow 必須常駐可達。
- placement menu 搜尋並列出全部 active positions，不受目前右側 position／department filter 限制；每個 candidate仍即時呼叫同一 `evaluateDutyDrop`。
- invalid candidates 隱藏；沒有可用 target 時顯示安靜原因與取消，不執行 command。
- 選 target 後沿用 `stage`／`choose-move-copy` 分流。Escape／outside click／readonly／source removed 均取消；關閉後回來源，來源因 move 消失時回分類 heading或target position heading。

## 10. Responsive Contract

| Viewport | Layout | Editing path |
| --- | --- | --- |
| `>= 1280` | 左 260–320px 常駐 rail＋右全職位 editor；兩個垂直 scroll owners | handle drag＋placement menu |
| `1024–1279` | 左 `clamp(240px, 26vw, 280px)`＋右 editor；仍同頁 | handle drag＋placement menu |
| `< 1024` | 單欄文件流：待處理分類在上、全部職位在下；單一 document scroll owner | placement menu為主要路徑；Pointer drag可保留但非驗收必要 |

- 390×844 不得改為唯讀，不得出現水平 overflow、文字裁切、控制重疊或要求 touch drag 才能完成配置。
- mobile 的所有 position sections仍展開；不得用 selected-position selector取代。
- 窄版 placement menu 可使用既有 popover／sheet pattern，但只讓最上層 surface取得 pointer、keyboard與輔助科技操作主權。

## 11. Action Ownership、Focus 與 Accessibility

- Page owner：搜尋／篩選、新增 Duty、文件與返回。
- Row owner：開啟 Duty 明細、啟動 drag或配置 menu。
- Placement menu owner：選 target或取消；開啟時底層 row controls不可 Tab。
- Move／copy chooser owner：選 move、copy或取消；不得與 placement menu同時存在。
- DutyDetailDrawer owner：Duty edit與relation維護；開啟時底層工作台不可操作。
- position section使用語意 heading，分類使用 heading＋list；drag handle與menu均有包含 Duty title的accessible name。
- 焦點順序固定左分類來源→右側依 position sort order／group／row；focus ring、drop target與成功 highlight不造成 layout shift。
- 顏色不是唯一狀態訊號；合法 target有 outline／背景，失敗有文字 status，exact lane有文字 Badge。

## 12. Empty、Search 與 Failure Recovery

| 情境 | 行為 |
| --- | --- |
| 全部 anomaly category為空 | 左 rail只顯示一次「目前沒有待處理職掌」 |
| category為空 | 不渲染該分類 heading |
| position完全無 relation | 顯示單一安靜 drop row；不渲染三個空 group |
| position有 relation但Duty query零match | 顯示「沒有符合搜尋的職掌」且保留position target |
| position／department filter零結果 | 右 editor顯示「沒有符合條件的職位」；不建立假target |
| query更新時正在drag | cancel drag、auto-scroll與candidate；零變更 |
| source或target在操作中消失 | 關閉menu／chooser，顯示「資料或目標已變更，請重新操作」 |
| command rejected／stale | 清除ephemeral state、保留目前資料、可重新操作 |
| readonly | 隱藏handle與寫入入口；Duty明細仍可開啟 |
| alias route direct load | render同一unified workbench，無第二套頁面或導覽link |

主畫面不得顯示 issue code、raw status、API route、stack或 DEV ID。

## 13. Data／API／Permission／Migration

- Schema：無變更。
- API／server／storage：無變更。
- Migration：不需要。
- Permission：沿用 `editingEnabled`；readonly 不建立 drag／menu／chooser commit path。
- Transaction：每次成功仍只送出一個 `COMMIT_DUTY_PLANNING_CHANGE`；move／copy 的原子性、duplicate prevention與Undo由既有 command處理。
- Failure recovery：只清 ephemeral UI state；不得在 presentation層自行 patch organization state。

## 14. RD File Boundary

### 14.1 Required new／replacement files

| File | Contract |
| --- | --- |
| `src/components/DutyExpandedPositionEditor.tsx` | 全職位sections、group／row composition、section drop target、focus scroll、placement menu |
| `src/components/DutyPendingSourceRow.tsx` | 分類內anomaly source、必要context、明細、handle與placement menu |
| `src/dutyDragAutoScroll.ts` | pure edge auto-scroll delta／owner decision helper |

### 14.2 Required modified files

| File | Change |
| --- | --- |
| `src/components/DutyPlanningWorkbench.tsx` | unified composition、左→右排列、position-section hit-test、auto-scroll、release revalidation、success highlight |
| `src/components/DutyAnomalyPanel.tsx` | 由Duty外卡改為anomaly type分類；移除逐item重複label／count |
| `src/components/DutyAnomalyCard.tsx` | 移除unified surface依賴；若無其他caller則刪除，否則限legacy reuse |
| `src/components/DutyRelationEditorRow.tsx` | 接入全展開sections與responsive placement入口 |
| `src/components/DutyRelationPlacementMenu.tsx` | 支援anomaly與relation source、全部active positions搜尋、同validator |
| `src/components/DutyCenter.tsx` | 三route同一workbench；移除surface-specific view分流，保留header controls |
| `src/dutyPlanningPresentation.ts` | expanded sections＋anomaly categories；移除counts／selection projection |
| `src/dutyPlanningPresentation.test.ts` | sections、empty-group omission、query、category order／label去重projection |
| `src/dutyPlanningRoute.test.ts` | 三route仍可direct load且契約為同一surface alias |
| `src/index.css` | 左rail／右editor、扁平sections、長文、sticky heading、drop states與三viewport |

### 14.3 Required removal／retirement

- 刪除 `src/components/DutyMasterDetailEditor.tsx` 或停止所有 import並於同一 DEV 清理；不得留下另一套可達 selected-position editor。
- `DutyPlanningView` 可保留未使用的歷史 component，但三個route不得render；若刪除不會擴大回歸可一併移除。
- 移除 `.duty-master-detail-editor*`、position counts、filters、selected row與matrix/anomaly route link的死CSS。

### 14.4 Forbidden unless PM re-entry

- `src/types.ts` 的 Duty／relation schema。
- `src/duties.ts` anomaly推導及validation semantics。
- `src/organizationCommands.ts`、server API／store、document storage、version CAS。
- 任何會改責任類型、ordering authority、permission或autosave transaction的修改。

## 15. Delivery Slices

### S0 — Baseline 與 source guard

- 記錄舊 DEV-031 tests／build baseline及既有warning。
- 確認第14節file boundary與現有drag validator／command contract。
- Gate：若必須改domain／schema／API／保存，停止回PM。

### S1 — Pure projections

- 建立expanded position sections與anomaly categories；移除counts／selection projection的active use。
- 建立auto-scroll pure helper與boundary tests。
- Gate：targeted unit tests通過；空group不回傳、分類label不重複進item資料。

### S2 — Unified static surface

- `/duty-planning`組成左分類來源＋右全職位sections；兩個alias render相同composition。
- 移除selected position、filters、route links與舊master-detail active import。
- Gate：1440／1024／390都能看見同頁來源與全職位流程；position header與group無counts，長文無ellipsis／overflow。

### S3 — Placement interactions

- 接入兩類source handles、section target、release revalidation、auto-scroll、move／copy、menu、focus recovery與success highlight。
- Gate：pointer、keyboard／touch alternative、cancel／invalid／stale與Undo通過；drop不導頁。

### S4 — Regression、QC 與 convergence

- 執行targeted、full tests與build。
- 真實Chromium驗證三route、三viewport、editable／readonly、long text、category、empty、search、auto-scroll與placement flows。
- Spec Drift判定必須為`In sync`才可把DEV-031恢復為完成。

## 16. Automated Test Contract

### 16.1 Pure projection

- 所有active positions依既有department／hierarchy order回傳，不因沒有relation而消失。
- position／department filter只移除不符合position；Duty query只過濾rows並保留section target。
- empty group省略；exact lane與row順序保留；projection沒有counts／total／selection。
- anomaly categories順序固定、空分類省略、item不含重複category label、pending context正確。
- 同Duty不同anomaly operation units不被誤去重。

### 16.2 Auto-scroll

- pointer離邊緣回0；進入上／下threshold方向正確；速度不超過14px／frame。
- owner到boundary回0；同一frame只選一個owner；cancel後不再排rAF。

### 16.3 Placement regression

- anomaly→position、primary relation move、non-primary move／copy、same-position／inactive／duplicate rejection。
- release使用current state重驗；cancel／invalid／stale零資料與Undo變更。
- route、organization command、Duty detail、autosave與DEV-030 press helper既有tests不得回歸。

Required commands：

```text
npm test -- --run src/dutyPlanningPresentation.test.ts src/dutyPlacement.test.ts src/dutyAnomalyPressInteraction.test.ts src/organizationCommands.duty.test.ts src/dutyPlanningRoute.test.ts src/dutyDragAutoScroll.test.ts
npm test -- --run
npm run build
```

## 17. Browser QC 與 Evidence Contract

### 17.1 Runtime lifecycle

Browser QC前先偵測matching OrgMaster runtime；可安全重用既有`localhost:5000`。若本DEV另啟runtime，必須記錄project、purpose、port、process tree與cleanup condition，交付前只停止該verified tree並確認port釋放。不得停止unrelated runtime。

### 17.2 Required routes／viewports

- `/duty-planning`
- `/duty-planning/matrix` direct load alias
- `/duty-planning/anomalies` direct load alias
- 1440×900、1024×768、390×844

### 17.3 Required scenarios

1. 左側是待處理分類，右側是全部符合條件的職位sections；沒有selected-position editor或四欄matrix。
2. DOM／畫面不存在`執 n`、`審 n`、`協 n`、責任總數與group count。
3. 「無執行職位／缺少主執行／待重新分配」各只在分類heading顯示；item不重複label／Badge。
4. 120字以上Duty在三viewport自然換行、完整可讀，handle／Badge／menu不重疊。
5. 空group不顯示；完全空position仍是可見target；Duty query零match不移除position target。
6. 從左側各類 anomaly以原生 desktop drag（Pointer fallback）拖到右側遠端position，edge auto-scroll可到達viewport外目標，drop後不導頁。
7. existing primary relation固定move；non-primary relation的move、copy、cancel皆正確。
8. invalid／same-position／inactive／duplicate／pointercancel／Escape／blur／stale release零變更。
9. keyboard／touch placement menu可搜尋全部active positions並使用同validator；focus可恢復。
10. Undo可還原最近一次成功placement；autosave、DocumentMenu、readonly與DutyDetailDrawer無回歸。
11. 三個route呈現相同unified composition；UI沒有route link使來源與目標分頁。
12. 1440／1024的scroll owner清楚；390為單一文件流且無水平overflow。

### 17.4 Hard QC gate

以下任一項為fail：

- selected position、職位selector、責任filter、四欄matrix或三個並排責任pane仍可見。
- position／group出現被禁止的數量摘要，或每筆待處理item重複category label。
- 長文ellipsis、固定高度裁切、document水平overflow、控制重疊或sticky heading遮住內容。
- drop需要換route、遠端position無法透過auto-scroll到達、成功後導頁或candidate與commit lane不一致。
- placement menu可繞過validator、readonly仍可寫入、cancel／invalid／stale產生資料變更。
- 可見error／alert、raw stack／API route、主要流程console error、page error或failed request。

Evidence存放於`output/playwright/dev031-revision/manifest.md`、`output/playwright/dev031-drag-recovery/manifest.md`及其screenshots。manifest需記route、viewport、fixture、操作、預期／實際、scroll／overflow、console／network與判定。舊`output/playwright/dev031/`只標為superseded historical evidence。

## 18. Acceptance Trace

| AC | 可觀察結果 | Evidence |
| --- | --- | --- |
| AC-01 | 同頁左分類來源→右全職位目標；三route同composition | DOM＋三route截圖 |
| AC-02 | 所有符合條件active positions展開，無selected state | section count對state＋截圖 |
| AC-03 | position／group無counts；anomaly label只在分類顯示 | DOM text inventory |
| AC-04 | 長文完整、空group省略、空position可drop | fixture＋三viewport |
| AC-05 | anomaly與relation pointer placement保留exact lane | command／state before-after |
| AC-06 | edge auto-scroll可到達viewport外position | 錄影或連續截圖＋scrollTop |
| AC-07 | keyboard／touch menu與pointer同validator | interaction＋negative case |
| AC-08 | cancel／invalid／stale零變更；成功可Undo | state signature＋Undo |
| AC-09 | readonly、autosave、drawer、routes無回歸 | regression smoke |
| AC-10 | 1440／1024／390無overflow、遮擋或console error | geometry＋console evidence |

## 19. Stop Conditions

- 必須改schema、anomaly semantics、placement validator、organization command、API、保存、權限或version CAS。
- 無法在同一workbench同時保留待處理source與全部position targets，必須回到selected-position或另一route。
- edge auto-scroll無法鎖定單一scroll owner，造成document與pane競爭捲動。
- position section target無法保留source exact lane，或需要依group位置猜測relation type。
- 390px沒有不依賴touch drag的完整配置路徑。
- 既有資料有多個不可區分的anomaly sources，projection會遺失operation unit。

## 20. RD Readiness Gate

- 產品方向：已由本輪Human-confirmed decisions固定。
- 主要UI flow：第1、5、8–10節已固定。
- Route／component／file impact：第6、14節已固定。
- Projection／I/O：第7節已固定；schema／API／migration皆不變。
- Failure recovery／permission：第11–13節已固定。
- QA／QC／evidence：第15–18節已固定。
- P0／P1 human decision gap：無。

判定：`RD Implementation Complete / QA-QC Passed`。S0–S4 已完成，`npm test -- --run`、`npm run build`、三 viewport Chromium QC、原生 desktop drag／Pointer fallback smoke、placement menu、三 route convergence 與 console error sweep 均有證據；未部署或 release。

## 21. Future Phase Capsules

### 21.1 跨 Duty 同 lane 人工排序

狀態：`Future Phase Captured / Not Requested`

- 目的：在同職位、同exact lane內手動排列不同Duties。
- 依賴：order authority、stable key、normalization、migration、move／copy插入位置與conflict語意。
- Re-entry trigger：使用者明確要求上移／下移、插入或自訂排序。

### 21.2 跨責任類型轉換

狀態：`Future Phase Captured / Not Requested`

- 目的：把relation轉到另一exact lane。
- 依賴：主責／共同、審核／會簽選擇、唯一主執行、duplicate、Undo與audit契約。
- Re-entry trigger：使用者明確要求跨group drop、點label改類型或批次轉換。

## 22. Historical Evidence 與變更紀錄

- 2026-08-21：舊版master-detail完成35 files／200 tests、build與1440／1024／390 browser QC；證據位於`output/playwright/dev031/`。因後續Human-confirmed方向已取代其主要UI flow，該證據標為superseded historical evidence。
- 2026-08-21：使用者拒絕獨立頁與selected-position editor，確認待處理來源在最左、右側全職位全展開、同頁編輯；Spec Impact分類為`Intentional replacement`，實作收斂判定為`Implementation Needs Correction`。
- 2026-08-21：依後續註記移除所有position／group責任counts；待處理項目改以anomaly type分類，分類label只顯示一次，不逐item重複。文件升級並維持`RD Implementation Ready`；本輪未修改產品程式、資料、runtime、deploy或release。
- 2026-08-22：完成S0–S4實作與QC：統一`DutyPlanningWorkbench`、三route同composition、左側分類來源、右側全active positions、position target、edge auto-scroll、keyboard／touch menu及舊master-detail清理。36 files／205 tests、build、1440／1024／390 Chromium、drag smoke（含復原）與console error sweep通過；證據位於`output/playwright/dev031-revision/manifest.md`，未deploy／release。
- 2026-08-22：依使用者回報「拖曳功能遺失」補回 editable desktop source handle 的原生 HTML `draggable` lifecycle，並讓既有 Pointer fallback 與 native session 共存、共用 hit-test／validator／move-copy／Undo；readonly boundary不變。Chromium `dragTo` 兩次 smoke 均成功，測試關係已由既有 drawer 移除；36 files／205 tests、build、console error 0通過。證據位於`output/playwright/dev031-drag-recovery/manifest.md`，未deploy／release。
- 2026-08-22：依使用者要求收斂右側 editor 垂直密度：新增 `duty-expanded-position-editor--compact`，桌面 header／group／row／empty-state 留白約減半，長文仍自然換行；390px 觸控版維持原列高。三 viewport 截圖、compact native drag smoke、36 files／205 tests、build與console error 0通過；證據位於`output/playwright/dev031-compact-right/manifest.md`，未deploy／release。
