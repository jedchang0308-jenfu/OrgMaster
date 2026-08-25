# DEV-026：職位拖曳命中、磁吸退出與渲染穩定性

文件成熟度：`RD Implementation Complete / QA-QC Passed`  
狀態：完成（RD Implementation Complete / QA-QC Passed；Intentional replacement 已完成）  
節點類型：開發點  
優先級：P0  
風險等級：Medium  
日期：2026-08-17  
來源 ID：`USER-2026-08-17-POSITION-DRAG-INTERACTION-HEALTH`  
父任務：DEV-001、DEV-017、DEV-020、DEV-025  
架構決策：沿用 ADR-001、ADR-002、ADR-003；本 DEV 不新增 ADR

受控相依文件：

- `ai-doc/specs/DEV-017-position-tree-department-groups.md`
- `ai-doc/specs/DEV-020-organization-version-workspace.md`
- `ai-doc/specs/DEV-025-organization-level-bands.md`
- `ai-doc/adr/ADR-001-position-hierarchy-authority.md`
- `ai-doc/adr/ADR-002-version-workspace-storage-boundary.md`
- `ai-doc/adr/ADR-003-organization-level-layout-authority.md`

## 1. 問題與目標

目前職位卡可以拖曳，但有兩個直接影響完成任務的問題：

1. 拖曳時非目標節點也反覆更新，畫面有不順與抖動感。
2. 卡片內多數可見區域分別承擔職位明細、員工拖曳與分支收合，使用者不容易一次命中職位拖曳；跨部門但同一上級的平行職位雖有合法 sibling candidate 與 command，實際操作仍常無法完成。

本 DEV 的目標是讓使用者以職位卡的自然 pointer 手勢啟動拖曳：按住卡片可拖曳區並移動超過門檻才進入職位拖曳，短按仍保留選取語意；系統能穩定預覽、退出、取消或提交合法候選，同時避免每個 pointer move 重建全部 React Flow node data。完成後，跨部門同階排序仍只改 sibling order，跨上級移動仍只改 `parentPositionId` 與相關 order，不改部門、組織層級或其他領域資料。

## 2. 健檢基線與已確認根因

### 2.1 基線證據

- `npm test -- --run`：20 files／142 tests 通過。
- `npm run build`：通過；既有 Vite extension warning 與 chunk size warning 不阻擋本 DEV。
- localhost:5000 真實 UI 於 1440×900、1024×768、390×844 無 document/body 水平溢出、無可見錯誤、console error／warning 為 0。
- 目前 fixture 以 `findDropCandidate` 對跨部門、同一上級的平行職位可得到 sibling candidate；`MOVE_POSITION`／`REORDER_POSITION` 可 `applied`，`Alt+ArrowDown` 與 Undo 也可正確往返。因此主要問題不在 command 或資料模型全面禁止，而在拖曳入口、互動狀態與 render path。

### 2.2 P0 根因

1. `src/App.tsx` 的 `samePosition` 在兩個參數都為 `undefined` 時回傳 `false`，使未帶 `dragOffset` 的節點被誤判為資料變更。
2. 同一個 node mapping path 在每次 effect 執行時重建 `employees` 陣列；即使員工與任職未變，`previous.data.employees !== employees` 仍成立。只修 `samePosition` 不足以保證非拖曳節點穩定。
3. `onNodeDrag` 找不到 candidate 時只清除 pending ref，沒有同步清除已顯示的 preview／confirmed candidate；放開滑鼠可能沿用過期候選。
4. 職位名稱、員工列與收合按鈕都有 `nodrag`／pointer propagation guard；原本再疊加專用把手後，可拖區被壓縮且跨部門平行位置難以命中。需要改為由 React Flow 的 node pointer movement threshold 區分短按與拖曳，保留內容控制互斥。

### 2.3 P1 觀察點

`findDropCandidate` 目前每次呼叫重建 drop zones。P0 修正完成後先量測；只有仍未達第 14 節的效能 gate，才在本 DEV 內加入 requestAnimationFrame 節流或 drag-start 預建 drop zones。不得在沒有量測證據時同時改動全部演算法。

## 3. Scope

### 3.1 本期必做

- 修正 optional point 與 node data 的穩定比較，讓非拖曳節點在 pointer move 中保持 reference identity。
- 移除專用職位拖曳把手與 `dragHandle` 限制；由職位卡可拖曳區的按住＋移動門檻判斷是否啟動職位拖曳。
- 建立明確狀態：`idle → dragging → candidate-pending → previewed → commit/cancel`。
- 補齊 candidate 進入、切換、退出、無效、放開與取消語意，杜絕 stale candidate commit。
- 保持跨部門 sibling slot 可被幾何搜尋；部門不得成為預先過濾條件，合法性由既有 command validator 決定。
- 保持職位名稱、員工拖曳、收合、右鍵與鍵盤排序互不誤觸。
- 補 pure tests、command regression、build 與三 viewport 真實 browser QC。

### 3.2 明確不做

- 不新增或修改 domain schema、migration、workspace API、儲存格式、CAS 或權限模式。
- 不修改 `departmentId`、`organizationLevelId` 的權威語意，不建立 ReportingLine、多上級或矩陣組織。
- 不讓 title、employee、collapse 等內容控制成為職位拖曳入口；其餘職位卡區域可由 pointer movement threshold 進入職位拖曳。
- 不移除員工拖曳、職位明細、收合、右鍵或 `Alt+Arrow` 鍵盤替代路徑。
- 不 deploy、release、publish；不處理與本問題無關的 Vite warning 或 bundle 拆分。

## 4. Spec Impact Preflight

結論：`Intentional replacement`。

- DEV-017／ADR-001：完全保留。`Position.parentPositionId` 仍是唯一主要上下級權威；同階排序只寫 sibling `order`，跨上級移動原子寫入 parent 與來源／目的 order；`departmentId` 不因拖曳靜默改變。
- DEV-020／ADR-002：完全保留。只有 `draft-edit`、`current-maintenance` 可拖曳；`current-view`、`compare` 必須在 UI 與 mutation callback 兩層阻擋。
- DEV-025／ADR-003：完全保留。`organizationLevelId` 只決定垂直層帶，拖曳不得自動改層級；MOVE 提案仍須通過既有父子層級順序驗證。
- DEV-017 第 9.6 節的 preview 契約繼續有效：只有 pure command 預演 `applied` 才可成為 previewed／committable candidate，drop 時必須對 current state 再執行一次。
- 本輪依使用者明確決策，將「專用把手唯一入口」替換為「卡片 pointer gesture threshold」；移除原把手 UI、CSS 與 `dragHandle` wiring，不改 domain、command 或權限邊界，因此不新增 ADR。

## 5. 不可破壞的領域與交易契約

| 情境 | 允許寫入 | 不得寫入 | 失敗結果 |
| --- | --- | --- | --- |
| 同一上級內跨部門平行排序 | sibling `order` | `parentPositionId`、`departmentId`、`organizationLevelId` | 不 commit，回原位 |
| 移到另一上級的 sibling slot／child target | `parentPositionId`、來源／目的 sibling `order` | `departmentId`、`organizationLevelId` | validator rejected，不 commit，回原位並顯示原因 |
| 離開候選後在空白處放開 | 無 | 全部領域與 layout state | cancel，回原位 |
| 唯讀／比較模式拖曳 | 無 | 全部狀態與 Undo history | 不開始拖曳 |

每次成功 drop 只能形成一筆 Undo history；Undo 必須同時恢復原 parent 與來源／目的 sibling order。rejected／noop／cancel 不得增加 history、dirty、autosave 或 success notice。

## 6. 互動責任矩陣

| 操作區 | Pointer 行為 | Keyboard／click 行為 | 是否可開始職位拖曳 |
| --- | --- | --- | --- |
| 職位卡可操作空白區 | 按住並移動超過 React Flow `nodeDragThreshold` 後拖曳職位 | 短按保留 React Flow 選取／右鍵語意 | 是 |
| `.org-node__title` | 不拖曳 | 開啟／聚焦職位明細 | 否 |
| `.org-node__employee` | HTML5 drag 移動任職 | 開啟員工明細 | 否 |
| `.org-node__collapse` | 不拖曳 | 展開／收合分支 | 否 |
| 卡片其餘空白 | 按住並移動超過門檻後拖曳職位 | 短按保留 React Flow 選取／右鍵語意 | 是 |

職位卡可拖曳區使用 `grab`／`grabbing` cursor；React Flow `nodeDragThreshold` 明確區分短按與拖曳，避免 click 誤啟動。職位名稱、員工列、collapse 以 `nodrag` 與 pointer propagation guard 排除；唯讀模式仍由 `nodesDraggable=false` 與 mutation gate 雙重阻擋。

## 7. Drag state machine

建議由單一 state/ref model 表達，不得讓 `dragPreview`、`dropCandidateRef`、`confirmedDropCandidateRef` 各自成為不同真相來源：

```ts
type PositionDragInteraction =
  | { phase: 'idle' }
  | {
      phase: 'dragging'
      movingId: string
      origin: Point
      grabOffset: Point
      latestPointer: Point
    }
  | {
      phase: 'candidate-pending'
      movingId: string
      origin: Point
      grabOffset: Point
      latestPointer: Point
      candidate: DropCandidate
      stableSince: number
    }
  | {
      phase: 'previewed'
      movingId: string
      origin: Point
      grabOffset: Point
      latestPointer: Point
      candidate: DropCandidate
      previewState: OrgDirectoryState
    }
```

允許使用等價結構，但以下 transition 必須可由 pure test 驗證。

### 7.1 Start

- 只有 `editingEnabled` 且 pointer 位於職位卡可拖曳區、移動超過 `nodeDragThreshold` 時，`idle → dragging`。
- 清除前一次 issue、preview 與 candidate；記錄 origin、grab offset、moving ID、latest pointer。
- 短按不觸發 `onNodeDragStart`；title、employee、collapse 等 `nodrag` 控制不得觸發職位拖曳。

### 7.2 Move without candidate

- 每次 pointer move 都更新 latest pointer／free-drag offset，即使畫面正在顯示 preview；退出 preview 時要能回到目前 pointer 位置，不得跳回舊 offset。
- 沒有候選且不是 previewed 時維持 `dragging`。

### 7.3 Enter and preview

- `findDropCandidate` 依既有 `MAGNET_RADIUS = 34` 找到候選後進入 `candidate-pending`。
- 同一候選穩定滿 `PREVIEW_STABLE_MS = 120` 後，先對 current state 執行 pure `MOVE_POSITION` 預演。
- 只有 `applied` 可進入 `previewed` 並保存該次 `previewState`；`rejected` 清除 committable candidate、維持 free drag 並顯示既有可理解 issue。
- 目標切換沿用 `CANDIDATE_SWITCH_MARGIN = 10`，避免兩個相鄰 slot 抖動。

### 7.4 Exit

- active candidate 的 exit radius 採 `MAGNET_RADIUS + 12 = 46`；34–46 px 是只用於避免 preview 邊界閃爍的 hysteresis，不可讓空白 release 直接 commit。
- pointer 與 active candidate 的距離超過 46 px、candidate zone 消失或 target 已不可見時，立即清除 preview 與 committable candidate，回到 `dragging`，並以 latest pointer 顯示 free-drag placeholder。
- 找不到新 match 時不得只清 pending ref 而保留舊 confirmed candidate。

### 7.5 Stop / commit / cancel

放開時不可直接信任先前 ref。必須使用 release pointer、current nodes 與 current hierarchy 再做一次 strict `findDropCandidate`，並同時滿足：

1. phase 是 `previewed`。
2. release candidate 與 previewed candidate 相同。
3. 對 current state 再執行 command 的結果為 `applied`。

三條都成立才 `commitState` 一次；其餘一律 cancel、保留選取並以既有 layout 回原位。結束後無論成功或失敗都回到 `idle`，清除 drag refs、visual offset、preview 與 hover／pending issue；command rejected 的可理解錯誤則保留到下一次操作或使用者關閉。

## 8. Candidate 與跨部門平行位置契約

- sibling groups 只依 `parentPositionId` 與 `order` 建立，不能依 `departmentId` 分桶或排除跨部門相鄰 slot。
- 部門框、層級 guide 與風險視覺不得攔截 pointer events，也不得成為 drop target。
- 同一上級下，職位 A 與職位 B 即使 `departmentId` 不同，A 前後的 sibling slot 仍必須可被 `findDropCandidate` 命中。
- 跨上級候選可被幾何層找到，但能否 preview／commit 以完整 `MOVE_POSITION` validation 為準；不得為了成功而自動改部門或層級。
- `levels` mode 使用最後 render geometry 搜尋 candidate；拖曳只改 hierarchy／order，不以 Y 軸所在層帶推導第二條 parent relation。
- collapsed／descendant／self exclusion 沿用既有規則；不得允許移入自己或 descendant。

## 9. Render stability contract

### 9.1 Optional point equality

```ts
function sameOptionalPoint(first: Point | undefined, second: Point | undefined) {
  if (first === second) return true
  if (!first || !second) return false
  return first.x === second.x && first.y === second.y
}
```

兩者都 `undefined` 必須視為相同；一有一無為不同；座標相同為相同。

### 9.2 Stable node data

- drag pointer move 未改員工／任職時，重用既有 `employees` array；可使用 memoized `employeesByPositionId`，或以員工 ID 加 object identity 比較後回用 previous array。
- 未變更的 `member`、callbacks、risk state、selection、child count、editing state 與 optional drag props 必須沿用既有 reference/value。
- `setNodes` 在沒有任何實際變更時回傳原 `current` array。
- free drag 中允許 dragged node 的 `dragOffset`／placeholder 改變；非 dragged nodes 的 node object 與 `data` reference 必須保持相同。
- preview topology 真正變更時可更新受影響節點與 edges；不得以「效能最佳化」跳過必要的部門框、層級帶、風險或 selection 更新。

`OrgNode` 已由 `memo` 包裝；本 DEV 要修的是傳入 props/data 的穩定性，不再疊加無證據的 custom comparator 來隱藏錯誤資料。

## 10. 預計檔案邊界

| 檔案 | 預計變更 |
| --- | --- |
| `src/App.tsx` | 單一 drag state/refs、release revalidation、optional point 比較、stable employee/node data、React Flow `nodeDragThreshold` wiring |
| `src/components/OrgNode.tsx` | 移除專用 position drag handle；保留內容控制互斥與職位卡 drag affordance |
| `src/drag.ts` | export／集中 magnet 與 exit 判定；如採 pure transition helper，放置幾何相關部分 |
| `src/positionDragInteraction.ts`（可新增） | 若 App 內 transition 無法直接測試，承載最小 pure state transition；不得複製 domain validator |
| `src/index.css` | 卡片 grab/grabbing affordance、內容控制互斥與窄 viewport 樣式 |
| `src/drag.test.ts` | mixed-department sibling candidate、self／descendant regression、exit radius |
| `src/positionDragInteraction.test.ts`（視實作新增） | pending／preview／exit／release cancel 與 optional point/node identity |
| `src/organizationCommands.test.ts` | 跨部門同 parent reorder、跨 parent move、欄位不變與 rejected 原子性 |

若 RD 選擇不新增 `positionDragInteraction.ts`，仍必須提供等價 pure tests；不可只靠人工拖曳驗證狀態機。

## 11. 建議實作順序

1. 先加入會失敗的 equality、mixed-department candidate、exit/cancel 與 command regression tests。
2. 修正 optional point 與 stable employee/node data，確認 free drag 不更新無關節點。
3. 移除專用把手與 `dragHandle` 限制，改以 `nodeDragThreshold` 及 `nodrag` 完成控制互斥。
4. 收斂 drag state、candidate preview、exit 與 release revalidation。
5. 執行完整 tests/build，再做 1440／1024／390 真實操作與 console sweep。
6. 量測 P0 後結果；只有不符效能 gate 才啟用第 12 節 P1。

## 12. 條件式 P1 效能改善

下列項目不是預設 P0 實作，必須在 P0 後以 trace 證明需要：

- 將 pointer move 的 React state update 合併到每 animation frame 一次；latest pointer 留在 ref，unmount／drag stop 時取消 pending frame。
- drag start 時依當下 visible nodes／hierarchy 預建 drop zones；只有 topology、layout mode、collapse 或 node geometry 改變時重建。
- 把 candidate distance 查詢改成讀取預建 zones，避免每個 move 重跑完整建置。

若採用 P1，drop stop 仍必須以 current state 做 domain command revalidation；快取只能優化幾何，不得成為 commit 權威。

## 13. 自動驗證計畫

### 13.1 Pure／unit tests

- `sameOptionalPoint(undefined, undefined) === true`；一有一無為 false；同座標為 true。
- drag move 僅改 dragged node 時，其他 node/data/employees references 不變。
- 跨部門、同 parent 的前／中／後 sibling slot 都能回傳正確 `parentId`／`insertIndex`。
- pending 未滿 120ms 不 preview；滿 120ms 且 command applied 才 preview。
- active candidate 34–46px 內保持穩定；超過 46px 清 preview；空白 release cancel。
- rejected candidate 永遠不成為 committable candidate。
- release candidate 與 preview candidate 不同時 cancel。

### 13.2 Command regression

- 同 parent 跨部門排序只改 order，`departmentId`、`organizationLevelId`、assignments 不變。
- 跨 parent MOVE 同步正規化來源／目的 order，且不改部門／層級。
- hierarchy、department connectivity 或 level order 不合法時回 rejected，state reference／內容不變。
- 成功動作可由一個 Undo 恢復 parent 與 order；cancel／rejected 不增加 history。

### 13.3 Full gate

```powershell
npm test -- --run
npm run build
```

不得只跑 targeted tests 後交付。

## 14. Browser QA/QC 與效能 gate

### 14.1 必測 viewport

- 1440×900：完整畫布、跨部門平行排序、跨 parent 合法與非法 drop。
- 1024×768：面板存在時卡片 gesture 仍可命中，不被 Inspector／DirectoryDock 遮住。
- 390×844：頁面無水平溢出；卡片 gesture、title、employee、collapse 不誤觸。若產品在此尺寸主要以 pan/zoom 使用，也必須能完成一次 position drag。

### 14.2 必測流程

1. 從卡片可拖曳區按住並移動超過門檻後開始拖曳；短按、title、employee、collapse 不誤觸。
2. 將某職位移到同一上級、不同部門職位的前後，放開後順序正確且 reload 後保留。
3. 進入 preview 後移到空白，preview 消失；空白放開不產生 state、Undo 或 autosave 變更。
4. 合法跨 parent drop 成功；不合法 hierarchy／department／level drop 回原位並顯示可理解原因。
5. 成功移動後 `Ctrl+Z` 一次恢復 parent 與 sibling order。
6. `current-view`、`compare` 完全不能開始或提交拖曳；`draft-edit`、`current-maintenance` 可用。
7. `Alt+方向鍵` 鍵盤排序維持可用。

### 14.3 效能與穩定性 gate

- 拖曳 3 秒無肉眼可見的全圖抖動、節點閃爍或 pointer 明顯落後。
- console error／warning 為 0；無可見 `[role=alert]`、`.inline-error`、4xx／5xx（預期的 invalid-drop UI issue 除外）。
- React Profiler 或可重現 instrumentation 證明 free drag 時非 dragged node 不因 `dragOffset`／employees reference 被重新 render。
- 以 26-node baseline fixture 量測；若 P0 後仍反覆出現 >50ms long task、pointer 明顯落後或非 dragged nodes 持續 render，才啟用第 12 節 P1，完成後重測。

建議證據路徑：

```text
output/playwright/dev-026/position-drag-1440x900.png
output/playwright/dev-026/position-drag-1024x768.png
output/playwright/dev-026/position-drag-390x844.png
output/playwright/dev-026/position-drag-invalid-snapback.png
output/playwright/dev-026/position-drag-profile.json
```

## 15. 驗收條件

- [x] 職位拖曳由卡片 pointer gesture threshold 判定；短按不移動，title、employee、collapse 不誤觸。
- [x] 跨部門、同 parent 的平行職位可排到正確 sibling slot；current state 的 MOVE commit 與三尺寸畫面驗證通過。
- [x] preview 離開 exit radius 後清除；空白 release 為 no-op，不會提交 stale candidate。
- [x] invalid candidate 不顯示成可提交；drop rejected 時回原位、保留選取並提供可理解原因。
- [x] 成功 MOVE／REORDER 不改 `departmentId`、`organizationLevelId` 或 assignments；command pure regression 與單一候選 commit 驗證通過。
- [x] free drag 中非 dragged node 的 object/data/employees references 穩定，不再因 optional offset 或新陣列全量更新。
- [x] current-view／compare 不能 mutation；draft-edit／current-maintenance 行為正確。
- [x] 1440×900、1024×768、390×844 真實 browser flow、console sweep、完整 tests 與 build 全部通過。

## 15.1 完成證據

- `npm test -- --run`：21 files／148 tests passed。
- `npm run build`：TypeScript check 與 Vite production build passed；保留既有 Vite extension warning／bundle size warning，未擴張處理。
- Real browser：localhost:5000 draft-edit 驗證卡片空白區移動超過 6px 會進入拖曳、3×3px 短按不啟動、title／employee／collapse 不啟動、跨部門同 parent sibling reorder 可 commit 並以 Undo 還原；1440×900、1024×768、390×844 均無 document/body 水平溢出、可見 alert、console error 或 warning。
- Screenshots：`output/playwright/dev-026/position-drag-1440x900.png`、`output/playwright/dev-026/position-drag-1024x768.png`、`output/playwright/dev-026/position-drag-390x844.png`。
- Runtime：沿用既有 localhost:5000；未停止或重啟 protected ProJED 127.0.0.1:4173；未 deploy／release。

## 16. Stop conditions

發生以下任一情況，RD 停止擴張範圍並回報 PM／QA：

- 為了讓 drop 成功必須自動修改部門或組織層級。
- React Flow node gesture threshold 與員工 HTML5 drag 無法可靠互斥，且需要改寫員工任職流程。
- release event 無法取得可信 pointer，導致無法做 final strict candidate check；需提出等價、可測的防 stale 方案。
- P0 後效能仍不合格且需要超出 rAF／drop-zone cache 的架構重寫。
- 任一既有 command、version read-only、level layout、employee drag 或 Undo regression。
- tests／build 不通過，或三 viewport 出現遮擋、溢出與不可操作。

## 17. RD handoff

- Readiness：本輪 replacement 已完成 RD、QA/QC 與 evidence 回填；P1 仍只在 profiling gate 失敗時另立或啟動。
- 下一責任人：若後續量測未達第 14.3 節 gate，另立 P1 rAF／drop-zone cache；不在本 DEV 追加未授權範圍。
- 首要修正順序：後續若有變更，先更新 gesture contract，再同步實作、regression 與三 viewport QC。
- P1 不是自由加做項目；只有第 14.3 節量測 gate 失敗才啟動。
- 工作目錄不是 Git repository；以本規格檔案邊界、測試結果與 browser evidence 管制變更，不宣稱 branch／commit／PR。
- 若需啟動本機環境，沿用 `npm run dev:local` 與既有 localhost:5000；任何本任務建立的暫時 runtime 必須在交接前清理。不得停止、重啟或清除受保護的 ProJED 127.0.0.1:4173。
- 未授權 deploy／release。
- Deferred Scope Audit：ReportingLine、多上級、部門自動搬移、層級自動改派與 bundle 拆分均不影響本 DEV 正確性；rAF／drop-zone cache 已保存為具明確啟動條件的 P1，不另建 current DEV。

## 18. 變更紀錄

- 2026-08-17：依職位拖曳系統健檢與 RD 主管審查建立 `RD Implementation Ready` 契約；確認 command／candidate 基礎可用，P0 收斂為完整 candidate state、release revalidation、node data reference stability 與 gesture threshold，P1 以量測 gate 控制。
- 2026-08-17：完成 DEV-026 P0 實作；新增 `src/positionDragInteraction.ts` pure state helpers、drag-start geometry snapshot、preview stability／exit hysteresis、strict release validation 與 memoized employee references；補 5 個 drag interaction／geometry regression tests。
- 2026-08-17：依使用者明確要求執行 `Intentional replacement`：移除專用拖曳把手，改由職位卡 pointer gesture 與 `nodeDragThreshold=6` 判定拖曳啟動；完成 21 files／148 tests、production build 與三 viewport browser QC，未 deploy／release。
