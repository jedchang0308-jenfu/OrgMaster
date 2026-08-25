# DEV-022：左右側欄關閉與快捷鍵一致性

文件成熟度：`RD Implementation Complete / QA-QC Passed`  
狀態：完成  
節點類型：交付點  
優先級：P1  
風險等級：Medium  
執行邊界：已完成本機 RD 實作、targeted QA 與 UI QC；未授權 deploy／release  
Authoritative source：本文件是 DEV-022 的 UI、互動、焦點、responsive 與驗收權威來源

## 1. Human decision brief

- 決策來源：使用者於 2026-08-16 要求統一左右欄的關閉按鈕、快捷鍵邏輯與 UI，並要求整理到 RD 可直接實作。
- 採用方向：建立共用側欄關閉元件、單一 `Escape` 優先序、逐層關閉與焦點回復。
- 保留方向語意：左右欄使用同一視覺家族與互動狀態，但圖示依收合方向鏡像；一致不代表左右圖示必須完全相同。
- 不採用「一次 Escape 關閉全部」：每次只處理一個最上層 surface，避免失去工作脈絡或靜默丟失草稿。
- 不新增左右欄直接切換快捷鍵：第一版只統一安全、通用的 `Escape`；若未來有明確高頻需求，再另行評估 `Alt+[`／`Alt+]` 或其他組合。

## 2. 問題與基準證據

目前相同目的的側欄關閉操作存在三套視覺與鍵盤規則：

| Surface | 現況 | 差距 |
|---|---|---|
| 左側 `DirectoryPanel` | 28×28、透明背景、`PanelLeftClose`，狀態由 `DirectoryDock` 內部持有 | 外觀與右欄不同，`App` 無法統一處理全域關閉 |
| 右側 `Inspector`／`DirectoryDetailPanel` | 30×30、固定灰底、文字 `×` | 圖示、尺寸、背景與左欄不一致，`Escape` 不會關閉 |
| 右側 `RoleCombinationRiskPanel` | 30×30、Lucide `X`；面板內已有兩階段 `Escape` | 行為較完整，但視覺仍是第三套 |
| 快捷鍵說明 | 未列 `Escape` | 使用者無法從產品內確認面板關閉規則 |

2026-08-16 真實畫面與 DOM 基準：

- 左右欄同時開啟時，在選取的畫布節點按 `Escape`，兩欄均保持開啟。
- 點擊左欄或右欄關閉按鈕後，`document.activeElement` 均落到 `body`。
- 左欄關閉按鈕為 28×28；右欄關閉按鈕為 30×30。
- `1440×900` 可同時容納左右欄；`1024×768` 以下右欄改為 overlay；`390×844` 右欄 overlay 仍保留左側 rail。

## 3. UX intent

- 使用者與情境：主管、人資與幕僚在畫布、主資料清單、職位屬性、關聯細節及兼任風險設定間反覆切換。
- 主要任務與成功結果：不需記住各面板特例，即可用同一視覺線索與 `Escape` 安全退出目前工作層，且知道焦點回到哪裡。
- 熟悉 pattern：側欄標題列右上角關閉控制；`Escape` 逐層關閉暫時 surface。
- 主要工作物件：組織圖畫布、左側主資料清單、右側屬性／細節、右側兼任風險設定。
- 操作方向暗示：關閉圖示依左／右收合方向鏡像；hover、focus-visible 與 tooltip 使用相同語法。
- 最可能誤解點：把 `Escape` 認為會一次清掉全部、在輸入中按 `Escape` 卻直接關欄、關閉後焦點消失。
- 安全預設：一個按鍵只解除一層；未提交編輯先取消／退出控制項，不直接卸載面板。
- 不能發生：側欄開關進入 Undo history、關閉造成資料 commit、草稿靜默遺失、焦點落到 `body`、覆蓋瀏覽器原生快捷鍵。
- 驗證方式：`1440×900`、`1024×768`、`390×844` 真實頁面、鍵盤互動、焦點與 visible-error evidence。

## 4. Current architecture impact

本 DEV 只修改前端暫時 UI state、鍵盤事件與側欄 header 控制，不修改：

- `OrgDirectoryState`、Position、Employee、Department、Assignment 或 Role risk rule 資料。
- `data/orgmaster-document.v3.json`、localStorage document key、server API 或 migration。
- Undo／redo history、dirty state、自動儲存、正式儲存、副本或備份契約。
- 權限、登入、外部服務、build/runtime 或部署設定。

因此不需要 schema、API、migration、permission 或 release feasibility 變更。

## 5. Scope

### 5.1 In scope

- 左側 `DirectoryPanel`、右側 `Inspector`、`DirectoryDetailPanel`、`RoleCombinationRiskPanel` 的關閉按鈕共用視覺與 accessibility 契約。
- `Escape` 逐層關閉優先序、編輯保護、左右欄判斷與最後互動面板 fallback。
- 左側 `activeDirectory` 提升為 `App` 可控制的 UI state，使全域快捷鍵可安全關閉左欄。
- 關閉後焦點回到可見且語意正確的觸發物件；失效或已卸載時使用指定 fallback。
- 快捷鍵說明與 README 增加 `Escape` 面板關閉規則。
- `<=1100px` 的 primary 左／右內容欄只顯示一個；兼任風險設定維持較高層 overlay 與既有草稿保護。
- 三個指定 viewport 的 target size、overflow、scroll owner、focus-visible 與可見錯誤驗證。

### 5.2 Out of scope

- 新增 `Alt+[`、`Alt+]`、`Ctrl+B` 或其他直接開關左右欄的快捷鍵。
- 改變畫布節點新增、編輯、刪除、排序、搜尋、Undo／redo 或文件快捷鍵。
- 統一所有 modal、toast、dropdown 或右鍵選單的視覺設計；本 DEV 只要求它們在 `Escape` 優先序中先於側欄。
- 改變點擊畫布空白處的既有 deselect 行為，或新增所有面板共用的 outside-click 關閉。
- 改變面板內容、資料欄位、清單摘要、風險規則或組織圖幾何。
- 保存使用者的面板開關偏好、面板寬度或跨瀏覽器 session layout。
- deploy、release、production smoke、PR 或 merge artifact。

## 6. UI component contract

### 6.1 新增 `PanelDismissButton`

新增 `src/components/PanelDismissButton.tsx`：

```ts
export interface PanelDismissButtonProps {
  edge: 'left' | 'right'
  label: string
  onDismiss: () => void
  className?: string
}
```

固定契約：

- 使用 `<button type="button">`，不得以文字 `×`、可點擊 `div` 或純 SVG 取代。
- `edge="left"` 使用 `PanelLeftClose`；`edge="right"` 使用 `PanelRightClose`；icon size 18px 且 `aria-hidden="true"`。
- `aria-label={label}`、`aria-keyshortcuts="Escape"`、`title={`${label}（Esc）`}`。
- class 基底固定為 `.panel-dismiss-button`；`className` 只用於 surface 定位，不複製尺寸、背景或 focus 樣式。
- Desktop／laptop target 為 32×32 CSS px；`<=690px` 為 44×44 CSS px。
- 預設透明背景、既有 neutral text color；hover 使用同一 neutral hover background；focus-visible 使用既有藍色 2px ring 與 2px offset。
- 關閉控制固定在各面板 header 右上區，不能因標題或計數長度被壓縮、裁切或移出 viewport。
- `<=690px` 若左欄 190px 內容寬度不足，先隱藏「新增」按鈕的可見文字、保留 `Plus` 與完整 accessible name；不得縮小關閉 target。

### 6.2 替換範圍

| 現有元件 | 替換要求 |
|---|---|
| `DirectoryPanel` | 移除 header 內直接使用的 `PanelLeftClose` button，改用共用元件 `edge="left"` |
| `Inspector` | 移除文字 `×`，改用共用元件 `edge="right"` |
| `DirectoryDetailPanel.DetailHeader` | 移除文字 `×`，改用共用元件 `edge="right"` |
| `RoleCombinationRiskPanel` | 移除自行定義的 `X` close button，改用共用元件 `edge="right"` |

所有 surface 可保留各自精準 label，例如「關閉員工清單」、「關閉職位屬性」、「關閉員工細節」、「關閉兼任風險設定」。產品 UI 不顯示 DEV ID 或規則說明卡。

## 7. UI state and ownership contract

### 7.1 `App` 擁有的 state

```ts
type WorkspacePanelId = 'directory' | 'inspector' | 'role-risk'

activeDirectory: DirectoryKind | null
inspectorOpen: boolean
roleRiskSettingsOpen: boolean
lastInteractedPanelRef: WorkspacePanelId | null
```

- 將 `activeDirectory` 從 `DirectoryDock` 內部提升到 `App`；初始值仍為 `'employees'`。
- `DirectoryDock` 改為 controlled component，接收 `activeDirectory` 與 `onActiveDirectoryChange`；三份搜尋 query 仍留在 `DirectoryDock`，收起／重開不得清除 query。
- `lastInteractedPanelRef` 只記錄 pointer／focus 最近進入的已開啟 panel，不觸發 render、不持久化、不進 Undo。
- panel root 增加 `data-workspace-panel="directory|inspector|role-risk"`；`Inspector` 與 `DirectoryDetailPanel` 共用 `inspector` owner。
- 打開 inspector 或 role-risk 時同步更新 last-interacted；使用者在任一 panel `pointerdown` 或 `focusin` 時更新該 panel。
- 關閉 inspector 仍沿用既有語意：`inspectorOpen=false`，並清除 `selectedId` 與 `directorySelection`；不得更動組織資料。

### 7.2 Responsive state rule

- `>1100px`：primary 左欄與 inspector/detail 可同時開啟，並各自維持既有 scroll owner。
- `<=1100px`：primary 左欄完整內容與 inspector/detail 一次只顯示一個：
  - 從左欄資料列開啟 inspector/detail 時，將 `activeDirectory` 設為 `null`，但保留該清單的 query。
  - 從 rail 開啟任一 directory 時，關閉 inspector/detail 並清除其 selection；不得更動資料。
  - 關閉 inspector/detail 後若原資料列已因左欄收起而卸載，焦點 fallback 到對應 directory rail button。
- `RoleCombinationRiskPanel` 是 higher-order overlay，不計入 primary 左／右欄互斥；開啟時 `Escape` 必須優先處理它，底層 primary panel state 保留。
- 不以 `window.innerWidth` 寫入持久資料；resize 只改目前 render 行為與必要的 primary panel 可見性。

## 8. Escape dismissal contract

### 8.1 一次一層

任何一次 `Escape` 最多只能執行一個 dismiss／cancel action。成功處理後必須 `preventDefault()`；由元件本身處理的 surface 必須 `stopPropagation()`，全域 handler 必須先檢查 `event.defaultPrevented`。

優先序固定如下：

| Priority | State | Required action |
|---:|---|---|
| 0 | `recoveryOpen` | 不關閉 recovery gate，也不執行其他快捷鍵 |
| 1 | delete／shortcut／directory dialog | 只關閉最上層已開啟 dialog，不同時清除其他 flags |
| 2 | position／directory context menu、search popover 或其他暫時浮層 | 由該元件先關閉並回復自身 trigger focus |
| 3 | 內嵌 edit、input、textarea、select、contenteditable 或 role-risk draft | 第一次只取消草稿或退出控制項；焦點移到所屬 panel root／header，不關 panel |
| 4 | `RoleCombinationRiskPanel` 無 draft | 關閉設定面板並回焦 Toolbar 盾牌入口 |
| 5 | focus 位於 primary 左／右 panel | 關閉 focus 所在 panel |
| 6 | focus 不在 panel 且 primary 兩欄皆開 | 關閉 `lastInteractedPanelRef` 指向的 primary panel |
| 7 | 只剩一個 primary panel | 關閉該 panel |
| 8 | 無可 dismiss surface | 不做任何事，也不得觸發其他編輯快捷鍵 |

### 8.2 Editor boundary

- `Inspector` 職位名稱：第一次 `Escape` 還原 `member.title`、停止編輯並將焦點移到 inspector root／header；第二次才關 inspector。
- `Inspector` 的 native `select`：第一次 `Escape` 只離開 select 並將焦點移到 inspector root／header；已立即 commit 的選擇不回滾；第二次才關 inspector。
- `DirectoryPanel` 搜尋 input：第一次 `Escape` 只 blur 並回到 directory panel root／header，保留 query；第二次關左欄。
- `RoleCombinationRiskPanel`：維持 DEV-019 的既有契約；有 draft 時第一次取消 draft 並 focus panel，無 draft 的下一次才關 panel。
- 若 child handler 已 `preventDefault()`，window handler 不得再次關閉任何 surface。

### 8.3 Resolver boundary

新增 `src/panelDismissal.ts`，將全域優先序抽成 pure resolver，使 App 只負責收集狀態與執行 action：

```ts
export type EscapeDismissAction =
  | 'none'
  | 'close-delete-dialog'
  | 'close-shortcuts-dialog'
  | 'close-directory-dialog'
  | 'dismiss-role-risk'
  | 'close-inspector'
  | 'close-directory'

export interface EscapeDismissContext {
  recoveryOpen: boolean
  deleteOpen: boolean
  shortcutsOpen: boolean
  directoryDialogOpen: boolean
  roleRiskOpen: boolean
  editorBoundaryActive: boolean
  focusedPanel: WorkspacePanelId | null
  lastInteractedPanel: WorkspacePanelId | null
  inspectorOpen: boolean
  directoryOpen: boolean
}

export function resolveEscapeDismissAction(
  context: EscapeDismissContext,
): EscapeDismissAction
```

- context menu／popover 已由 child component 處理，不需重複進 resolver；App 在呼叫 resolver 前先檢查 `defaultPrevented` 與既有 menu owner。
- `dismiss-role-risk` 必須呼叫 panel 自己的 dismiss boundary；有 draft 時取消、有空 draft 時關閉。可使用 `forwardRef` imperative handle 或等價的明確 callback，不得從 App 直接猜測／清空 panel local draft。
- resolver 不得讀 DOM、不得呼叫 React setter，所有分支須以 Vitest 單元測試覆蓋。

## 9. Focus restoration contract

每個關閉路徑在 state 更新前取得 return target，並在 DOM 更新後以 `requestAnimationFrame` 或等價 React effect 回焦。目標失效時不得 throw。

| Closed surface | Primary return target | Fallback order |
|---|---|---|
| DirectoryPanel | 對應 employee／position／department rail button | 第一個可用 directory rail button → 組織圖 application |
| Position Inspector | 原職位清單列或 React Flow node | 同 ID React Flow node → 組織圖 application |
| Employee／Department detail | 原主資料列 | 對應 directory rail button → 組織圖 application |
| Role risk panel | Toolbar 盾牌按鈕 | Toolbar → 組織圖 application |
| Shortcut dialog | Toolbar 問號按鈕 | Toolbar → 組織圖 application |

固定要求：

- 不得在關閉完成後讓 `document.activeElement` 為 `body`。
- return target 必須可見且仍連接 DOM；不可見／卸載／disabled 時依 fallback 順序處理。
- 回焦本身不得重新打開剛關閉的 panel。
- mouse close 與 keyboard close 使用同一個 `closeDirectoryPanel`／`closeInspectorPanel`／`closeRoleRiskPanel` action，不得各寫一套清理邏輯。
- panel root 設 `tabIndex={-1}`，只作程式化焦點與第二次 `Escape` boundary，不加入一般 Tab sequence。

## 10. Shortcut communication contract

更新 Toolbar 的快捷鍵說明 dialog：

- 新增「介面操作」分組或等價視覺群組。
- 新增唯一一列：`關閉目前選單／面板` → `Esc`。
- 既有 Enter、Tab、Space/F2、Delete、Alt、Undo／redo、搜尋與顯示全部內容及順序不得回歸。
- 不在每個 panel body 常駐顯示 `Esc` badge 或教學句；按鈕 tooltip 與快捷鍵 dialog 已足夠。
- Toolbar 問號按鈕增加 ref，dialog 關閉後回到該按鈕。

README 的核心操作同步補充：

- `Escape` 一次關閉／取消最上層選單、編輯或側欄。
- 編輯或草稿中第一次 `Escape` 先取消／退出控制項，下一次才關閉側欄。

## 11. File-level implementation plan

| Change | File | RD contract |
|---|---|---|
| Add | `src/components/PanelDismissButton.tsx` | 共用左右方向關閉 button、ARIA、tooltip 與 icon |
| Add | `src/panelDismissal.ts` | pure Escape priority resolver 與型別 |
| Add | `src/panelDismissal.test.ts` | resolver 優先序、單層關閉與 fallback unit tests |
| Modify | `src/App.tsx` | 提升 `activeDirectory`、集中 close actions、last-interacted、global Escape 與 responsive primary panel arbitration |
| Modify | `src/components/DirectoryDock.tsx` | controlled directory state、panel metadata、editor-first Escape、rail focus restore、共用 close button |
| Modify | `src/components/Inspector.tsx` | panel metadata／ref、editor-first Escape、共用 close button |
| Modify | `src/components/DirectoryDetailPanel.tsx` | panel metadata 與共用 close button |
| Modify | `src/components/RoleCombinationRiskPanel.tsx` | 共用 close button；保留 draft-first Escape；提供 App 可呼叫的 dismiss boundary |
| Modify | `src/components/Toolbar.tsx` | shortcut dialog opener focus restore 所需 ref／callback |
| Modify | `src/index.css` | 共用 dismiss style、移除重複 close styles、44px mobile target 與窄 header 防溢出 |
| Modify | `src/App.tsx` shortcut dialog | 新增介面操作／Esc 說明列，不改既有快捷鍵 |
| Modify | `README.md` | 同步面板關閉與兩階段 Escape 規則 |
| Add evidence | `output/playwright/dev-022/` | browser script、三 viewport 截圖與 DOM／focus evidence |

禁止建立第二份 panel content state、把 panel state 寫入 `OrgDirectoryState`，或新增套件只為處理本 DEV。

## 12. RD slices and gates

| Slice | 內容 | Gate |
|---|---|---|
| S1 State／resolver | 提升 `activeDirectory`、pure resolver、集中 close actions、單元測試 | resolver matrix 全綠；左欄切換／query 保留；`npm run build` |
| S2 Shared UI／focus | `PanelDismissButton`、四類 panel 替換、editor boundary、focus restore | mouse／keyboard 關閉均不落 `body`；role-risk 連續 Escape 不回歸 |
| S3 Responsive／communication | `<=1100` primary panel arbitration、44px mobile target、快捷鍵 dialog、README | 三 viewport 無裁切／重疊／水平 overflow；快捷鍵說明與實際一致 |
| S4 Regression／QC | 全套測試、build、主要互動、visible error／console sweep | 第 13 節所有必要證據完成後才可進 `QA-QC Passed` |

必須依 S1→S2→S3→S4；任一 slice 發現資料 commit、焦點遺失、草稿丟失或快捷鍵回歸時停止後續 slice 並回送 RD。

## 13. QA acceptance and QC evidence

### 13.1 Automated

| ID | Setup／action | Expected |
|---|---|---|
| PANEL-A-001 | recovery gate open | resolver 回 `none`，不關其他 surface |
| PANEL-A-002 | delete、shortcut、directory dialog 任一開啟 | 只回傳該 dialog action；一次不清多個 flag |
| PANEL-A-003 | role-risk open | 優先於 primary 左／右欄 |
| PANEL-A-004 | editor boundary active | resolver 回 `none`；由 local handler 先處理 |
| PANEL-A-005 | focus 在 directory，左右皆開 | 只回 `close-directory` |
| PANEL-A-006 | focus 在 inspector，左右皆開 | 只回 `close-inspector` |
| PANEL-A-007 | focus 在 canvas，左右皆開 | 依 last-interacted 回一個 action |
| PANEL-A-008 | 只剩一個 primary panel／全部關閉 | 關唯一 panel／回 `none` |
| PANEL-A-009 | 既有 project tests | `npm test` 0 failure |
| PANEL-A-010 | TypeScript＋Vite production build | `npm run build` 成功 |

### 13.2 Browser interaction matrix

| ID | Viewport／action | Expected evidence |
|---|---|---|
| PANEL-U-001 | 1440×900，左欄開啟，focus 搜尋框，連按兩次 Escape | 第一次只 blur 且 query 保留；第二次關左欄；focus 回對應 rail |
| PANEL-U-002 | 1440×900，左右皆開，focus 右欄後 Escape | 只關右欄；左欄保留；focus 回原列／節點 |
| PANEL-U-003 | 1440×900，左右皆開，focus 左欄後 Escape | 只關左欄；右欄保留；focus 回 rail |
| PANEL-U-004 | 1440×900，focus 畫布且左右皆開 | 先關最後互動 panel；第二次才關另一 panel |
| PANEL-U-005 | Inspector 職位名稱輸入中連按兩次 Escape | 第一次還原／退出編輯；第二次關 Inspector；無意外保存 |
| PANEL-U-006 | Inspector native select focus 中連按兩次 Escape | 第一次退出控制項、不關 panel；第二次關 panel |
| PANEL-U-007 | Role-risk 建立／編輯 draft 中連按兩次 Escape | 第一次取消 draft 並 focus panel；第二次關 panel並回盾牌入口 |
| PANEL-U-008 | shortcut dialog 以按鈕與 Escape 關閉 | 皆回問號入口；說明列可見且為 `Esc` |
| PANEL-U-009 | 1024×768 從左欄開啟 detail／inspector | primary 左欄完整內容收起，右欄完整可操作；關閉後 focus 回 rail fallback |
| PANEL-U-010 | 390×844 開啟各 panel | dismiss target 44×44；標題／新增／close 不重疊、裁切或超出 viewport |
| PANEL-U-011 | mouse click 各 dismiss button | 行為與 keyboard close 共用同一 state cleanup；focus 不落 `body` |
| PANEL-U-012 | 既有快捷鍵 smoke | Enter、Tab、Space/F2、Delete、Alt+方向、Alt+V/H、Ctrl+Z/Y、`/`、Ctrl+0 維持既有結果 |

### 13.3 Visible／accessibility evidence

- Route：本輪使用 OrgMaster temporary QC runtime `http://localhost:5010/`；既有 `localhost:5000` 與 protected `127.0.0.1:4173` 均未停止或清除。
- 必測 viewport：`1440×900`、`1024×768`、`390×844`。
- 每個 viewport 至少保留關閉按鈕、左右 panel 狀態與 shortcut dialog 截圖。
- DOM evidence：button rect、`aria-label`、`aria-keyshortcuts`、`title`、panel open count、active element、horizontal overflow。
- Focus evidence：每個關閉路徑記錄關閉前 trigger 與關閉後 `document.activeElement`；任何 `body` 結果為 fail。
- Visible Error Sweep：`.inline-error`、`[role=alert]`、HTTP 4xx/5xx、`Not Found`、`Internal Server Error`、可見 `/api/` route error 均為 0。
- Console／network：console error 0；in-scope GET／PUT 無新增失敗。
- Information Noise Sweep：不得新增常駐 Esc 教學卡、重複 shortcut badge、DEV ID 或 raw engineering text。
- Scroll owner：Directory list、Inspector body、Role-risk body 各自捲動，不得讓 body 誤捲或產生水平 overflow。

建議 evidence path：

- `output/playwright/dev-022/qa-panel-dismissal.js`
- `output/playwright/dev-022/dev022-panels-1440x900.png`
- `output/playwright/dev-022/dev022-panels-1024x768.png`
- `output/playwright/dev-022/dev022-panels-390x844.png`
- `output/playwright/dev-022/dev022-shortcuts-1440x900.png`

## 14. Failure modes and recovery

| Failure | Required recovery | Forbidden behavior |
|---|---|---|
| return target 已卸載／隱藏 | 依第 9 節 fallback 找下一個可見目標 | throw、焦點落 `body`、重新打開 panel |
| title input／search／select 仍在編輯 | 第一次 Escape 退出控制項或還原 draft | 直接關 panel 或 commit 非預期內容 |
| role-risk 有未提交 draft | 第一次取消 draft 並 focus panel | App 直接卸載 panel、靜默丟稿 |
| 一次有多個 flags 為 open | 依優先序只清一個 | 同一次 Escape 清除全部 dialog／panel |
| mobile header 空間不足 | 隱藏 add 可見文字、保留 icon 與 accessible name | 縮小 close target、裁切 title 或出現水平 overflow |
| resize 穿越 1100px | 套用 primary panel arbitration，資料與 query 保留 | 寫入文件、清空 query、進入 Undo |
| child 已處理 Escape | App 檢查 `defaultPrevented` 後停止 | 重複 dismiss 下一層 surface |

## 15. Stop conditions

以下任一成立時，不得宣告 DEV-022 RD 完成或 QA/QC 通過：

- 任一次 `Escape` 關閉或清除兩個以上 surface。
- 編輯中第一次 `Escape` 直接卸載 panel，或 role-risk draft 靜默遺失。
- mouse 與 keyboard 關閉使用不同 cleanup，造成 selection／query／focus 結果分歧。
- 任一主要關閉路徑完成後 active element 為 `body`，或焦點回到不可見／disabled 元件。
- panel state、last-interacted 或 focus target 進入 `OrgDirectoryState`、Undo、儲存或同步 payload。
- 既有快捷鍵、Directory 三清單切換、Inspector 編輯、context menu、role-risk 連續 Escape 發生回歸。
- 任一必測 viewport 有 close button 裁切、header 重疊、非預期水平 overflow、scroll owner 混淆或可見 runtime error。
- QC 缺少真實 rendered surface、三 viewport、focus evidence 或 visible-error sweep。
- 為驗證本 DEV 停止、重啟或清除 protected `127.0.0.1:4173` ProJED runtime。

## 16. Runtime boundary

- 自動測試與 build 不需啟動新 runtime。
- 真實 UI QC 優先重用已存在且確認屬於 OrgMaster 的 `localhost:5000` runtime；若必須啟動，先記錄 project、purpose、port、owning process tree 與 cleanup condition。
- 只停止本 DEV 明確啟動的 process tree；不得停止全部 `node.exe` 或清除未知 port。
- 交付前清理本 DEV 啟動的 temporary runtime，確認其 port 已釋放，並再次確認 protected `127.0.0.1:4173` 仍 listening 且 ProJED 頁面可達。

## 17. Governance conclusion

- 文件成熟度：`RD Implementation Complete / QA-QC Passed`；目前 phase 的 UI、state、dismiss priority、editor boundary、focus、responsive、檔案與 evidence 契約均已落地，無 P0/P1 交付缺口。
- Spec Impact Preflight：`Compatible exception`。DEV-022 延伸 DEV-001 快捷鍵、DEV-004 左欄收合、DEV-009 清單鍵盤一致性、DEV-010 右側細節與 DEV-019 role-risk Escape；不改它們的資料或主要產品語意。
- ADR：不建立。此決策只治理本機前端 UI、可逆、無資料/API/權限／外部契約，且替代方案差異不足以形成長期架構基準。
- Deferred Scope Audit：直接左右欄 toggle shortcut、持久化 panel layout 與全產品 overlay manager 均為一般 out-of-scope idea，不影響目前正確性；未形成新的高影響 deferred scope。
- Blocker：無。S1→S4 已完成；本輪完成產品程式、targeted test、build 與三 viewport browser QC，未執行 deploy 或 release。

## 18. 變更紀錄

- 2026-08-16：依使用者的差距分析、溝通設計與設計思考要求建立 `RD Implementation Ready`；完成現況證據、相容性判斷、UI／state／Escape／focus／responsive 契約、file impact、QA/QC matrix 與 runtime boundary。
- 2026-08-16：完成 DEV-022 S1→S4；新增 `PanelDismissButton` 與 `resolveEscapeDismissAction`，完成 controlled directory state、editor-first Escape、focus restoration、primary panel responsive arbitration 與快捷鍵說明。`npm test` 19 files／126 tests、`npm run build`、resolver targeted 7／7 通過；1440×900／1024×768／390×844 真實瀏覽器驗證 target size、逐層 Escape、焦點回復、無水平溢出與 fresh console 0 error／0 warning。證據：`output/playwright/dev-022/dev022-panels-1440x900.png`、`dev022-panels-1024x768.png`、`dev022-panels-390x844.png`；temporary port 5010 已於交付前清理，protected 4173 保持可用。
