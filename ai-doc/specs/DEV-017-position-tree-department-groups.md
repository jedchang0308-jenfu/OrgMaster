# DEV-017：正式組織圖—職位樹與部門分組整合

狀態：已實作（RD Implementation Complete；待 QA/QC）  
文件成熟度：`RD Implementation Ready`（已落地）  
風險等級：Medium（跨資料模型、local migration、主要 UI flow）  
權威來源：本文件  
架構決策：`ai-doc/adr/ADR-001-position-hierarchy-authority.md`  
父交付點：DEV-001、DEV-008、DEV-009、DEV-012  
來源 ID：`USER-2026-08-12-POSITION-TREE-DEPARTMENT-GROUPS`

## 1. Outcome

V1 提供一個主要工作面：職位節點與連線表達正式主要上下級，低干擾部門範圍表達職位歸屬。使用者選取一個職位後，在同一個右側編輯器分別維護「所屬部門」與「上級職位」，不需在部門樹、職位樹與匯報頁重複輸入。

V1 的核心限制為「單一部門＝單一連續職位子樹」。同一個非空部門在目前組織圖中只能有一個連通職位區域與一個主要部門標示；任何會把它切成多個區塊的操作都在寫入前阻擋。

## 2. Scope

- 以 `Position.parentPositionId` 建立正式主要職位樹；保留多個根職位的既有 forest 能力。
- 由目前可見的職位位置與 `Position.departmentId` 衍生部門範圍、部門名稱及必要的降級標示。
- 右側職位編輯器同時提供職位名稱、所屬部門、上級職位與目前任職者；名稱與任職沿用既有行為。
- 所有可能改變 hierarchy 或 department connectivity 的 command 共用原子驗證與寫入邊界。
- 部門清單資料列使用固定欄位配置；階層深度只影響名稱內容區，不推移整列外框或右側 `⋯`。
- 保留員工任職、多人任職、職位複製、刪除／上移子職位、collapse、橫／縱排、Undo/redo、本機儲存、存副本與備份下載。
- 本機文件升為 V2，支援合法 V1 文件遷移與不合法 V1 文件的 fail-safe 復原邊界。

## 3. Out of scope

- 矩陣、次要、代理、虛線、跨部門例外匯報、多上級與匯報有效期間。
- `ReportingLine` 實體、主管權限、簽核、成本中心、預算、績效與其他治理功能。
- 由 `parentPositionId` 自動改寫 `departmentId`，或由 `departmentId` 自動改寫 `parentPositionId`。
- 由職位樹推算、搬移或覆寫 `Department.parentId`。
- 同一部門多個不連續框、以多個同名標籤掩蓋不合法資料，或以自動搬動整個分支修復失敗操作。
- 後端、登入、多人協作、雲端同步、正式資料庫、部署與 release。

## 4. Authoritative data contract

### 4.1 Domain and presentation state

```ts
interface Position {
  id: string
  roleId: string
  departmentId: string | null
  parentPositionId: string | null
  title: string
  status: 'active' | 'inactive'
  allowMultipleAssignees: boolean
}

interface OrgMember {
  id: string
  order: number
  childrenAxis: ChildrenAxis
  collapsed?: boolean
}
```

- `Position.parentPositionId`：V1 主要職位上下級的唯一權威來源。
- `Position.departmentId`：職位歸屬部門的唯一權威來源。
- `OrgMember`：只保存畫布排版偏好；V2 不得再保存 hierarchy parent。
- `PositionView` 可同時包含兩類資料，但只能由 `Position` 與 `OrgMember` join 產生，不得成為可獨立寫入的 store。
- layout/drag 若仍需要 `{ id, parentId, order, ... }` 介面，必須由 adapter 將 `parentId = Position.parentPositionId` 即時計算；adapter output 是唯讀衍生值。
- `Department.parentId` 繼續供部門主檔路徑與循環驗證使用，不參與職位連續子樹演算法，也不由畫布操作更新。
- `departmentId = null` 表示「未設定部門」，不是實體部門；不套用單一連續子樹限制，也不產生一個可能跨越全圖的部門框。

### 4.2 Active hierarchy invariants

驗證範圍是目前畫布上的 active positions；inactive position 的歷史值不參與 layout 與連續性計算。

1. 每個 active position ID 唯一，並恰有一筆同 ID 的 layout state。
2. `parentPositionId` 必須為 `null` 或指向另一個存在的 active position。
3. 不得自指，不得形成 cycle；V1 允許多個 `parentPositionId = null` 的根職位。
4. 同一 parent 下的 `order` 在 commit 後必須正規化為不重複的連續整數；order 不具領域語意。
5. 對每個實體部門 `d`，令 `S(d)` 為所有 active 且 `departmentId = d` 的職位。`|S(d)| <= 1` 時合法；其他情況必須符合 induced connectivity：把 parent-child edge 視為無向邊，但只走訪兩端都屬於 `d` 的邊，從 `S(d)` 任一節點出發必須走訪到 `S(d)` 全部節點。
6. 上述條件等價於同一部門在 forest 中只有一個連續區域；路徑一旦離開該部門，不得在更下層重新回到同一部門。
7. `Department.parentId` 與部門框幾何不屬於此 invariant；框只陳述 membership，不陳述部門主檔隸屬。

### 4.3 Validation algorithm contract

完整驗證器輸入 proposed snapshot，輸出 discriminated result：

```ts
type OrganizationValidationResult =
  | { ok: true }
  | {
      ok: false
      code:
        | 'DUPLICATE_POSITION_ID'
        | 'DUPLICATE_LAYOUT_ID'
        | 'MISSING_LAYOUT'
        | 'ORPHAN_LAYOUT'
        | 'UNKNOWN_DEPARTMENT'
        | 'MISSING_PARENT'
        | 'SELF_PARENT'
        | 'HIERARCHY_CYCLE'
        | 'DEPARTMENT_DISCONNECTED'
      positionIds: string[]
      departmentIds: string[]
    }
```

- cycle 與 parent existence：DFS color set 或等價線性演算法。
- department connectivity：先建 parent-child adjacency，再按 `departmentId` 分組，以受限 BFS／DFS 驗證；總目標複雜度 `O(V + E)`，不得對每次節點逐一重跑全圖 traversal 形成 `O(V²)` 常態路徑。
- UI 文案由 `code` 與目前主檔名稱映射，不讓 domain validator 依賴可見中文文案。
- RD 可加入只驗證受影響部門的 fast path，但 commit 前結果必須與完整驗證器等價；測試以完整驗證器作 oracle。

## 5. Command and transaction contract

所有 command 都採 `current state → proposed state → validate → single commit`。驗證失敗時不得產生 partial write、history entry、儲存狀態變更或衍生統計變更。

| Command | 允許寫入 | 明確不得寫入 | 失敗恢復 |
| --- | --- | --- | --- |
| 變更上級／拖曳到新父節點 | `Position.parentPositionId`、來源／目的 sibling `order`；必要時展開目標的 `collapsed` | `departmentId`、`Department.parentId` | drag 回到原位；欄位保留原值；指出受影響部門 |
| 變更所屬部門 | 該職位的 `Position.departmentId` | `parentPositionId`、`Department.parentId` | select 回復原值；指出來源或目標部門無法保持連續 |
| 同階排序 | sibling `order` | 所有領域欄位 | 無合法 drop candidate 時不 commit |
| 新增子職位 | 新 `Position`、新 layout state；預設繼承父職位部門 | 既有職位部門與上級 | candidate 不合法時不建立半成品 |
| 新增根／同階／複製 | 新 `Position`、新 layout state | 為通過驗證而靜默改既有資料 | 預設值若會分裂部門，先要求合法部門／上級或阻擋，不得先寫後修 |
| 刪除整個分支 | 分支 position 改 inactive、移除其 layout state、關閉任職、正規化 order | 分支外的 `departmentId` | proposed snapshot 不合法時整筆不執行 |
| 只刪職位、子職位上移 | selected 改 inactive、子職位改接 selected 原 parent、layout/order、關閉 selected 任職 | 子職位的 `departmentId` | 上移會切斷部門時阻擋，原分支保留 |
| 刪除部門並轉移／未設定 | 沿用 DEV-016 的明確 replacement 或 `null` 寫入 | 任何 position parent | 明確 replacement 可讓目標部門形成多區塊；仍阻擋 ID、cycle、missing parent 與 layout 錯誤 |

補充規則：

- 上級職位 selector 不列出自己；descendant 與會造成部門分裂的候選應 disabled 或在提交時明確阻擋，不得看似成功後回跳且沒有原因。
- 以快捷鍵新增時，若系統無法從相鄰節點推得合法預設，必須停在可完成選擇的編輯狀態，不能建立無法 Undo 的幽靈節點。
- 一次成功 command 只新增一筆 Undo history；Undo/redo 必須同時還原 hierarchy、department、layout、assignment closure 與衍生畫面。
- 所有寫入入口包含畫布拖曳、Inspector、對話框、快捷鍵、右鍵選單與部門刪除流程；不得有 bypass validator 的舊路徑。

## 6. UI / UX behavior contract

### 6.1 Information hierarchy

- 第一視覺層：職位卡與主要上下級線。
- 第二視覺層：目前選取、drop preview、阻擋狀態。
- 第三視覺層：部門名稱與低干擾範圍；不得比職位卡更高對比，也不得遮住 edge、handle、focus ring 或文字。
- 部門名稱在同一連續區域只出現一次。框／背景同時用邊界或文字補足，不能只靠顏色。
- 框依「目前可見的同部門職位」衍生；collapse 只改可見範圍，不改資料。若矩形範圍會造成錯誤包含、遮擋或嚴重重疊，允許降級為部門標題帶或局部背景，但仍只能有一個主要部門標示。
- `未設定部門` 不畫跨圖大框；以節點附近的短標示或中性樣式表達。

### 6.2 Single editor

右側 `Inspector` 是職位的唯一主要編輯入口，依序呈現：

1. 職位名稱。
2. 所屬部門。
3. 上級職位。
4. 目前任職者與既有多人任職設定。
5. 排版偏好與低頻 metadata。

「所屬部門」與「上級職位」必須是兩個可分辨欄位；任一欄位阻擋時，在欄位附近說明人類影響與原值仍保留。不得新增三套 tab、逐卡「下一步」CTA 或常駐演算法說明。

### 6.3 Department directory alignment

- 每列外框、左側類型標記、名稱內容區與右側 `⋯` 使用共同 grid/flex 欄位。
- 深度提示只能置於名稱內容區內，例如 disclosure、短路徑或局部 padding；不得對整列套用 depth margin。
- 所有列的右側操作入口具有相同 hit area 與 x-axis；鍵盤 focus 與 menu 行為沿用 DEV-009。
- 空部門保留在清單並顯示零職位；畫布不偽造空白框。

### 6.4 Interaction feedback

- 成功：直接更新圖、清單、統計與 Inspector，可使用低干擾 toast；不增加確認 modal。
- 不合法 parent/dept change：不寫入；受影響欄位或 drop target 顯示錯誤，內容至少包含部門名稱及「會分裂成多個區塊」的結果。
- drag：無效 candidate 不得顯示為可提交狀態；若在 drop 時才確認無效，節點動畫回原位並保留選取。
- delete/promote：沿用既有影響摘要與確認；若連續性驗證阻擋，dialog 保留讓使用者改選「刪除分支」或取消。

## 7. Department group derivation

輸入是 visible position nodes、其 geometry 與 `departmentId`；輸出是唯讀 group descriptors：

```ts
interface DepartmentGroupView {
  departmentId: string
  label: string
  visiblePositionIds: string[]
  anchorPositionId: string
  bounds: { x: number; y: number; width: number; height: number }
  paletteIndex: number
}
```

- `anchorPositionId` 是該部門連續區域中最靠近 forest root 的可見職位；資料合法時結果唯一。
- `bounds` 以目前可見同部門 nodes 的 union 加固定 design-token padding 計算，禁止寫回 state。
- descriptor 排序必須穩定，避免無資料變更時 frame 閃動。
- 所有非空部門只輸出完整 frame，不得依幾何狀態切換成 band、badge 或第二套視覺語言。
- `layoutOrganization` 必須為跨部門層級與兄弟節點預留 frame padding，並以 branch translation 解決剩餘碰撞；任兩 frame 至少保留 12px 安全距離。
- frame 置於 nodes/edges 後方且 `pointer-events: none`；互動仍落在職位卡、控制項與畫布。
- frame 不使用 `Department.parentId` 決定 membership 或自動 nesting。

## 8. Local document V2 and migration

### 8.1 V2 format

- `ORG_DOCUMENT_VERSION = 2`，V2 新寫入不得包含 `OrgMember.parentId`。
- local storage 使用 V2 key；loader 先讀 V2，沒有 V2 才探測既有 V1 key。
- 備份與副本一律輸出 V2；parser 能辨識 V1 與 V2，但應回傳 normalized V2 或具體 migration failure，不再只以無原因 `null` 表示所有錯誤。

### 8.2 V1 → V2 migration

1. 驗證 V1 基本結構與 `members`／active `positions` ID 對應。
2. 對每個 active position 設定 `parentPositionId = matchingMember.parentId`。
3. 將 `members` 正規化為 V2 layout state，移除 persisted parent。
4. 正規化 sibling order，執行完整 hierarchy 與 department connectivity 驗證。
5. 通過才建立 V2 document；首次成功寫入 V2 前不得刪除或覆寫 V1 key。

### 8.3 Migration failure

- 結構缺漏、cycle、missing parent 或部門不連續時 fail closed，不得靜默改上級、改部門、自動搬分支或載入範例資料後顯示為成功。
- 原始 V1 payload 保留；畫面顯示無法升級的原因摘要、受影響部門／職位，以及下載原始備份的可發現入口。
- 使用者明確選擇建立新文件前，儲存動作不得覆蓋原 V1 key。
- 自動修復舊文件不在 DEV-017 scope；若實際測試發現大量合法使用情境會被阻擋，RD 必須停止 migration slice，回 PM 擴充獨立 repair flow，而非放寬 invariant 或加入靜默修正。

## 9. Current architecture impact

| 區域 | 目前狀態 | DEV-017 contract |
| --- | --- | --- |
| `src/types.ts` | `OrgMember.parentId` 是 hierarchy；`Position` 無 parent | 新增 `Position.parentPositionId`；V2 `OrgMember` 移除 parent |
| `src/organization.ts` | join 與 department path，無正式 hierarchy validator | 建立 hierarchy adapter、完整 validator 與 command helpers |
| `src/layout.ts` / `src/drag.ts` | 直接依 `OrgMember.parentId` | 改吃衍生 hierarchy nodes；不得自行寫 domain state |
| `src/App.tsx` | hierarchy mutation 分散在 move/add/delete/duplicate | 所有 mutation 改走 proposed-state transaction；成功才 commit history |
| `src/components/Inspector.tsx` | 可改部門，無上級 selector | 加上級欄位與就地阻擋回饋；保留單一編輯器 |
| `src/components/DirectoryDock.tsx` | depth margin 造成 row/menu x-axis 漂移 | 改共同 row columns，depth 僅在名稱內容區 |
| 組織圖 render | 無部門範圍 | 新增 derived group layer，置於 node/edge 後方 |
| `src/documentStorage.ts` | 只接受 version 1，錯誤回 `null` | V2 writer、V1 migration、typed failure、保留原始資料 |
| 測試 | layout/drag/storage 依舊 parent contract | 新增 validator/transaction/group/migration 測試並更新舊測試 |

### 9.1 Repo / runtime baseline

- Canonical workspace：`C:\VIBE CODING\OrgMaster`；目前不是 Git repository，本 DEV 以明確檔案範圍保護，不建立 commit／branch／PR 邊界。
- Runtime：React 19、TypeScript 7、Vite 8、Vitest 4、`@xyflow/react` 12；畫面使用 local state，透過 Vite 本機 middleware API 將共用 V2 文件寫入 `data/orgmaster-document.v2.json`，沒有外部 API、Auth、database、環境變數或 provider migration。
- `@xyflow/react` 本機型別已確認匯出 `ViewportPortal`，部門 group layer 不需新增套件。
- 改前基線（2026-08-12）：`npm test` 為 7 files / 31 tests passed；`npm run build` 成功。
- Package contract：DEV-017 不新增 production dependency；若 RD 判定必須新增套件，先停在 Slice 3 回 PM，說明既有 React Flow primitive 無法完成的證據。

### 9.2 File-level implementation map

| File | Action | Required implementation |
| --- | --- | --- |
| `src/types.ts` | 修改 | `Position.parentPositionId`；V2 `OrgMember` 移除 parent；新增 `HierarchyNode`；`PositionView` 帶 `parentPositionId` |
| `src/data.ts` | 修改 | 將 `initialMembers[].parentId` 搬到 matching `initialPositions[].parentPositionId`；layout fixture 只留排版欄位 |
| `src/organizationHierarchy.ts` | 新增 | hierarchy adapter、完整 validator、branch/depth helpers；純函式、無 React／storage 依賴 |
| `src/organizationCommands.ts` | 新增 | 所有會影響 hierarchy／department connectivity 的 proposed-state command 與單一 validation boundary |
| `src/organization.ts` | 修改 | `buildPositionViews` join 新欄位；`addPositionToState` 移交 commands；既有 department path helpers 保留 |
| `src/positions.ts` | 修改 | duplicate proposed-state helper 改讀 `Position.parentPositionId` 與 layout order；只能由 command module 呼叫 |
| `src/directories.ts` | 修改 | 移除可繞過 command boundary 的 `updatePositionInDirectory`；department replacement helper 由 command 包覆後才可 commit |
| `src/layout.ts` | 修改 | `layoutOrganization`、`isDescendant`、`getDepth` 改吃 `HierarchyNode[]`；移除持久化 parent 的假設 |
| `src/drag.ts` | 修改 | drop geometry 改吃 `HierarchyNode[]`；仍只找幾何 candidate，不自行 commit 或改欄位 |
| `src/departmentGroups.ts` | 新增 | 由 visible hierarchy/layout/node heights 建立穩定 `DepartmentGroupView[]` |
| `src/components/DepartmentGroupLayer.tsx` | 新增 | 純 render component；只輸出完整 frame、label、data attributes，無事件與 state |
| `src/documentStorage.ts` | 修改 | V2 I/O、V1 migration、typed load failure、failed payload archive／download helper |
| `src/components/DocumentRecoveryDialog.tsx` | 新增 | migration/parse failure 的阻擋畫面、原始備份與明確建立新文件流程 |
| `src/App.tsx` | 修改 | 衍生 hierarchy、統一 `runOrganizationCommand`、drag validation preview、migration recovery、group portal、issue routing |
| `src/components/Inspector.tsx` | 修改 | 新增上級職位 selector；部門／上級錯誤就地回饋；維持唯一主要編輯入口 |
| `src/components/DirectoryDock.tsx` | 修改 | 移除 department row inline margin；depth guide 移入名稱內容區；編輯職位導向 Inspector |
| `src/components/DirectoryDialogs.tsx` | 修改 | 移除 active `EditPositionDialog` 路徑；員工／部門 dialogs 不受影響 |
| `src/index.css` | 修改 | group layer、單一 frame palette、Inspector error、recovery dialog、department depth guide 與 viewport rules |
| `src/*.test.ts` | 修改 | fixture/type migration；layout/drag/position/directory/document regression |
| `src/organizationHierarchy.test.ts` | 新增 | invariant 與 adapter table tests |
| `src/organizationCommands.test.ts` | 新增 | 每種 command 的 apply/reject/noop、欄位隔離與 state reference tests |
| `src/departmentGroups.test.ts` | 新增 | anchor、bounds、palette、frame 零碰撞、collapsed、`null` exclusion |

### 9.3 Exact target types

`src/types.ts` 需形成下列公開邊界；不得用 optional `parentPositionId?` 過渡，避免新文件漏寫：

```ts
export interface Position {
  id: string
  roleId: string
  departmentId: string | null
  parentPositionId: string | null
  title: string
  status: 'active' | 'inactive'
  allowMultipleAssignees: boolean
}

export interface OrgMember {
  id: string
  order: number
  childrenAxis: ChildrenAxis
  collapsed?: boolean
}

export interface HierarchyNode extends OrgMember {
  parentId: string | null
}

export interface PositionView extends OrgMember {
  parentPositionId: string | null
  title: string
  roleId: string
  departmentId: string | null
  allowMultipleAssignees: boolean
  activeAssignments: Assignment[]
}
```

- `HierarchyNode.parentId` 只為相容既有 layout/drag 純函式的衍生 alias；不得出現在 `OrgDirectoryState` 或 V2 JSON。
- inactive position 保留其最後 `parentPositionId` 作本機歷史資料，但沒有 layout state，且不進 active hierarchy；未來 reactivation 不在本 DEV。
- V2 `OrgDirectoryState` keys 維持 `employees/departments/roles/positions/assignments/members`，避免無必要改動 top-level 文件結構。

### 9.4 `organizationHierarchy.ts` contract

```ts
export type OrganizationValidationCode =
  | 'DUPLICATE_POSITION_ID'
  | 'DUPLICATE_LAYOUT_ID'
  | 'MISSING_LAYOUT'
  | 'ORPHAN_LAYOUT'
  | 'UNKNOWN_DEPARTMENT'
  | 'MISSING_PARENT'
  | 'SELF_PARENT'
  | 'HIERARCHY_CYCLE'
  | 'DEPARTMENT_DISCONNECTED'

export type OrganizationValidationResult =
  | { ok: true }
  | {
      ok: false
      code: OrganizationValidationCode
      positionIds: string[]
      departmentIds: string[]
    }

export function buildHierarchyNodes(state: OrgDirectoryState): HierarchyNode[]
export function validateOrganizationState(state: OrgDirectoryState): OrganizationValidationResult
export function collectActiveBranchIds(state: OrgDirectoryState, rootId: string): Set<string>
export function getHierarchyDepth(nodes: HierarchyNode[], id: string): number
```

Implementation rules：

1. `buildHierarchyNodes` 只 join active positions 與 matching layout state，順序依 `members`；它不容錯修正資料。進入正常 workspace 前 state 必須已通過 validator。
2. validator error priority 固定為：duplicate position → duplicate layout → missing/orphan layout → unknown department → self/missing parent → cycle → department disconnected。相同 code 合併所有命中 ID 並依輸入順序穩定輸出。
3. `ORPHAN_LAYOUT` 指 layout ID 沒有 matching active position；inactive position 不得保留 layout。
4. `UNKNOWN_DEPARTMENT` 只檢查非 `null` department；`null` 合法。
5. cycle traversal、undirected adjacency 與 department group traversal在一次 validator 呼叫內共用 maps/sets，總複雜度維持 `O(V + E)`。
6. 此模組不 import `App`、React、components、document storage 或可見中文文案。

### 9.5 `organizationCommands.ts` contract

```ts
export type OrganizationCommand =
  | {
      type: 'ADD_POSITION'
      position: Pick<Position, 'id' | 'roleId' | 'title' | 'departmentId' | 'parentPositionId'>
      order: number
    }
  | { type: 'MOVE_POSITION'; positionId: string; parentPositionId: string | null; insertIndex: number }
  | { type: 'REORDER_POSITION'; positionId: string; delta: -1 | 1 }
  | { type: 'CHANGE_POSITION_DEPARTMENT'; positionId: string; departmentId: string | null }
  | { type: 'DUPLICATE_POSITION'; sourcePositionId: string; newPositionId: string }
  | { type: 'DELETE_POSITION'; positionId: string; mode: 'branch' | 'promote'; asOf: string }
  | { type: 'DELETE_DEPARTMENT'; departmentId: string; replacementDepartmentId?: string }

export type OrganizationCommandIssueCode =
  | OrganizationValidationCode
  | 'POSITION_NOT_FOUND'
  | 'DEPARTMENT_NOT_FOUND'
  | 'DUPLICATE_ID'
  | 'INVALID_INSERT_INDEX'

export type OrganizationCommandResult =
  | { status: 'applied'; state: OrgDirectoryState; changedPositionIds: string[] }
  | { status: 'noop'; state: OrgDirectoryState }
  | {
      status: 'rejected'
      state: OrgDirectoryState
      issue: {
        code: OrganizationCommandIssueCode
        positionIds: string[]
        departmentIds: string[]
      }
    }

export function executeOrganizationCommand(
  state: OrgDirectoryState,
  command: OrganizationCommand,
): OrganizationCommandResult
```

Implementation rules：

- Command 先驗證 target/id/insert index，再以 immutable array mapping 建 proposed state，正規化受影響 sibling orders，最後呼叫完整 validator；只有通過才回 `applied`。
- `rejected.state` 與輸入必須是同一 object reference；不得回傳部分 proposed state。`noop.state` 同樣保留 reference。
- `MOVE_POSITION` 同時處理 parent change 與 sibling placement；`parentPositionId` 只寫 `Position`，`order/collapsed` 只寫 layout。
- `CHANGE_POSITION_DEPARTMENT` 只寫 selected position 的 `departmentId`。
- `DELETE_POSITION/branch`：分支 positions 改 inactive、layout 移除、active assignments 依 `asOf` 關閉；inactive positions 的 parent 值可保留。
- `DELETE_POSITION/promote`：直接子職位的 `parentPositionId` 改為被刪職位原 parent；selected 改 inactive並移除 layout；再正規化 order與驗證。
- `DELETE_DEPARTMENT`：重用既有 department/employee/position replacement semantics；明確 replacement 不受 department connectivity warning 阻擋，但仍須通過 ID、hierarchy 與 layout 驗證；position parent 永遠不變。
- 同一成功 command 只回一份完整 state，App 只呼叫一次 `commitState`，確保一筆 Undo。
- 不建立 async、retry 或 lock；目前 local single-writer。重複 ID、重複刪除與不存在 target 以 `rejected/noop` 決定，不得產生 duplicate record。

Command defaults 由 `App.tsx` 明確提供：

- 新增子職位：`parentPositionId = selected.id`，`departmentId = selected.departmentId`，append 到 children 尾端；selected layout 同次展開。
- 新增第一個根職位：若沒有任何 active position，可使用第一個部門；既有圖再新增根職位時預設 `departmentId = null`。
- 新增同階與複製：繼承 selected 的 parent 與 department、插在 selected 後；若 selected 是跨部門邊界的 department anchor 而造成分裂，command 明確拒絕，不改成其他部門。
- Inspector 換上級：append 到新 parent children 尾端；選「最高層（無上級）」則 append 到 roots 尾端。
- `REORDER_POSITION` 到達 sibling 邊界時回 `noop`。

### 9.6 `App.tsx` wiring contract

1. 用 `buildHierarchyNodes(currentState)` 取代所有直接把 `members` 當 hierarchy 的位置：layout、drag、edges、child count、ancestor reveal、depth、root fallback、MiniMap root color。
2. 保留 presentation-only `commitState` 給 collapse、children axis、title、assignment；移除可改 parent 的 `MemberUpdater/commit` 路徑。
3. 建立唯一 command wrapper：

```ts
const runOrganizationCommand = useCallback((command: OrganizationCommand) => {
  const result = executeOrganizationCommand(currentState, command)
  if (result.status === 'applied') {
    commitState(result.state)
    setOrganizationIssue(null)
  } else if (result.status === 'rejected') {
    setOrganizationIssue(mapOrganizationIssue(result.issue, departments, positions))
  }
  return result
}, [commitState, currentState, departments, positions])
```

4. `mapOrganizationIssue` 位於 App 或 UI helper，只產生人類可讀的部門／職位名稱；domain error code 可作 `data-*` 測試值，不直接顯示。
5. drag preview：`findDropCandidate` 找幾何 candidate後，以 `MOVE_POSITION` 執行純預演。`applied` 才設定 `dragPreview`／confirmed candidate；`rejected` 設 invalid candidate issue、清除 confirmed candidate。drop 時只 commit 已再次由 current state 執行成功的 command；失敗時使用既有 layout 將 node snap back。
6. `previewMembers` 改為從 preview command state 衍生 hierarchy nodes；frames 同步使用 preview state/layout，避免拖曳時節點移動但部門框停留。
7. title 與 allow-multiple patch 必須透過 `PATCH_POSITION` command；department patch 必須拆出走 `CHANGE_POSITION_DEPARTMENT`，不得再由通用 helper 直接寫入。
8. DirectoryDock 的「編輯職位」改為 select position + focus Inspector title；移除 `DirectoryDialogState.edit-position` 與 active `EditPositionDialog`，避免第二份表單。
9. command 被拒絕時不得關閉 delete dialog、不得改 selected ID、不得顯示成功 notice；成功後才執行這些 UI side effects。
10. 所有快捷鍵在 input/select/modal/recovery dialog focus 時沿用 `isTextEditor`／modal gate，不得觸發背景 hierarchy command。

### 9.7 Inspector and directory component contract

`Inspector` props 增加：

```ts
interface PositionParentOption {
  id: string | null
  label: string
}

interface OrganizationUiIssue {
  target: 'department' | 'parent' | 'drag' | 'delete' | 'document'
  code: string
  message: string
}

positions: PositionView[]
parentOptions: PositionParentOption[]
issue: OrganizationUiIssue | null
onParentChange: (parentPositionId: string | null) => void
```

- parent selector 第一個 option 為 `最高層（無上級）`；其他 label 格式為 `職位名稱 · 部門名稱`，依 hierarchy preorder、同階 order 排序。
- 自己與 descendants 不出現在 parent options；其他候選提交時由 command validator 作最終判定，避免在 render 中對每個 option 重跑全圖形成 `O(V²)`。
- controlled select value 永遠來自 `member.parentPositionId`；拒絕時自然維持原值。欄位以 `aria-invalid`、`aria-describedby` 與鄰近短訊息表達，不新增 modal。
- department 與 parent issue 只顯示在對應欄位；drag/delete 共用低干擾 notice 或既有 dialog 區域，成功後清除。
- `DirectoryDock` department article 不得有 `style.marginLeft`。新增 `.directory-card__depth-guide` 置於 `.directory-card__copy` 內，寬度為 `min(depth * 8px, 32px)`；avatar、外框與 menu x-axis 固定。
- 空部門的零職位狀態留在既有 details/summary，不在每列增加重複說明。

### 9.8 Department group algorithm and render contract

`src/departmentGroups.ts`：

```ts
export const DEPARTMENT_GROUP_PADDING = {
  top: 22,
  right: 12,
  bottom: 12,
  left: 12,
} as const

export function buildDepartmentGroups(input: {
  departments: Department[]
  positionViews: PositionView[]
  hierarchyNodes: HierarchyNode[]
  nodePositions: Record<string, Point>
  nodeHeights: Record<string, number>
  visibleIds: Set<string>
}): DepartmentGroupView[]
```

Algorithm：

1. 只收集 `visibleIds` 中、`departmentId !== null` 且有 geometry 的 active views；按 department ID 分組。
2. anchor 為同組可見 nodes 中 hierarchy depth 最小者；同 depth 以 preorder/order、最後以 ID 決勝，結果穩定。
3. candidate frame 是同組 node rectangles union 加固定 padding；寬高至少容納 label，所有非空部門一律輸出完整 frame。
4. `layoutOrganization` 對跨部門 parent/child 與 sibling 預留 frame padding；若 derived frames 仍碰撞，固定較早的 anchor，將較晚 anchor 的完整可見 branch 向右或向下平移到至少 12px 間距，不改 hierarchy 或 department 資料。
5. branch translation 只處理 presentation geometry；不得以 frame 鬆散或碰撞推論資料錯誤、改寫 `departmentId` 或 `parentPositionId`。資料合理性仍只由 connected-subtree validator 判斷。
6. `paletteIndex = stableStringHash(departmentId) % 6`；顏色只輔助辨識，label 與完整邊界永遠存在。
7. groups 依 anchor preorder/order、再 department ID 排序；相同輸入必須 deep-equal。

Render：

- `App.tsx` 在 `ReactFlow` 內用本機已存在的 `ViewportPortal` render `<DepartmentGroupLayer groups={groups} />`。
- 每組 DOM：`data-department-group-id`、`data-palette-index`；style 只放 derived `transform/width/height`，沒有 click/drag handler，也沒有 rendering variant。
- `.department-group-layer`、`.department-group` 與 label 均 `pointer-events: none`；z-order 必須低於 edges/nodes，框背景 alpha 不得降低 edge/label 對比。
- frame：1px 邊界、低 alpha 背景、圓角。exact color 由既有 CSS variables 延伸 6 組，但 WCAG/辨識仍依文字與形狀。
- `prefers-reduced-motion` 下禁止 frame 位移 transition；一般狀態也不得因 hover/selected 改變 bounds。

### 9.9 Exact V2 I/O and recovery contract

`src/documentStorage.ts` public boundary：

```ts
export const ORG_DOCUMENT_VERSION = 2 as const
export const ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v2'
export const LEGACY_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.v1'
export const RECOVERY_ORG_DOCUMENT_STORAGE_KEY = 'orgmaster.local-document.recovery.v2'

export type DocumentFailureCode =
  | 'INVALID_JSON'
  | 'INVALID_APP'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_DOCUMENT_SHAPE'
  | 'MIGRATION_ID_MISMATCH'
  | OrganizationValidationCode
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'

export type ParseOrgDocumentResult =
  | { ok: true; document: OrgDocumentFile; sourceVersion: 1 | 2 }
  | { ok: false; code: DocumentFailureCode; positionIds: string[]; departmentIds: string[] }

export type LocalDocumentLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; document: OrgDocumentFile; sourceVersion: 1 | 2 }
  | {
      status: 'failed'
      code: DocumentFailureCode
      sourceKey: string
      raw: string
      positionIds: string[]
      departmentIds: string[]
    }

export function parseOrgDocument(input: unknown): ParseOrgDocumentResult
export function loadLocalDocument(storage?: Storage | null): LocalDocumentLoadResult
export function archiveFailedLocalDocument(result: Extract<LocalDocumentLoadResult, { status: 'failed' }>, storage?: Storage | null): boolean
export function downloadRawDocument(raw: string, filename: string): boolean
```

Implementation rules：

- Loader 優先 V2；沒有 V2 才讀 V1。合法 V1 migration 後寫 V2 key，保留 V1 key；寫 V2 失敗則回 `STORAGE_WRITE_FAILED`，不得假裝已載入並可安全儲存。
- V1 active positions 必須一對一 matching member；inactive position 設 `parentPositionId = null` 且沒有 member。先依 V1 parent group 正規化 order，再 strip parent。
- V2 parser 除 shape 外必須跑完整 organization validator；JSON 中任一 `members[].parentId` 視為 V2 shape failure，避免雙來源復活。
- load failure 時 App 可用 initial fixture 建 memory state，但 recovery dialog 必須阻擋 workspace 與 save。使用者可先下載 raw，再選「建立新文件」。
- `archiveFailedLocalDocument`：V1 failure 因 source key 不會被 V2 save 覆蓋，可直接回 true；V2 failure 必須先把 raw 寫入 recovery key，成功後才允許建立新文件。archive 失敗時仍停在 recovery dialog，下載 raw 是可用替代。
- recovery dialog 不顯示 raw JSON 或 internal ID；顯示原因摘要與受影響部門／職位名稱。主要動作為下載原始備份，建立新文件為明確次要動作；取消不會改 storage。

### 9.10 Explicit non-impact boundary

- `Employee.departmentIds`、`Assignment` 有效期間與多人任職、Role、Department CRUD identity、快捷鍵集合及 React Flow edge routing 不改契約。
- 不新增 API、database schema、Auth、permission、environment variable、background job、external storage 或 network call。
- 不改 `Department.parentId` 的 path/cycle/write contract；只移除 department row 整列縮排與 position edit 重複入口。
- build/runtime feasibility：既有 toolchain 足夠；沒有 deploy/hosting 變更，因此不建立 release artifact 或 rollback 指令。

## 10. Dependencies and execution boundary

### Dependencies

- DEV-001：畫布 layout、drag、快捷鍵、collapse 與 Undo/redo。
- DEV-008：`Position`、`Department`、`OrgMember` 與主資料邊界；本 DEV 只 intentional replacement 其 hierarchy parent authority。
- DEV-009：清單列、`⋯`、focus 與 viewport 行為。
- DEV-012：既有職位換部門入口與資料保留。
- DEV-015：V1 local document 與下載格式。
- DEV-016：部門刪除 replacement / `null` 行為。

### Execution boundary

- 本文件授權 RD 進行 schema/type、local migration、domain validation、現有前端 command、畫布 group layer、Inspector 與 DirectoryDock 的本機實作及測試。
- 不授權後端、外部資料寫入、部署、release、權限模型或 future `ReportingLine`。
- 不得以 DEV-017 為由重做無關視覺風格、任職模型或部門主檔 CRUD。
- 若實作需要改變本文件的 authoritative fields、migration failure policy、單一部門 invariant 或 Out of scope，先回 PM 做 spec/ADR convergence，不得由 RD 自行放寬。

## 11. RD slices and phase gates

### Slice 1：權威欄位、validator 與文件 migration

1. 先改 `types.ts`／`data.ts`，再新增 `organizationHierarchy.ts`；更新 `layout.ts`／`drag.ts`／`organization.ts` 到可 build。
2. 實作 validator 與 adapter tests，再改 `documentStorage.ts` 的 V2 parser/writer、V1 migration 與 recovery result。
3. 接上 App bootstrap recovery，但尚不改 hierarchy command 與部門 frame。
- Gate：第 12.5 節 `H-*`、`M-*` 全過；現有 layout/drag/organization/document tests 完成 fixture migration；`npm test` 與 `npm run build` 通過。任何舊資料會被覆寫即停止。

### Slice 2：原子 command 與單一 Inspector

1. 實作 `organizationCommands.ts` 與 `C-*` tests；先不接 UI。
2. 依 9.6 列表逐一替換 App 的 add/move/reorder/duplicate/delete/promote/department change；搜尋確認沒有 `member.parentId =` 或通用 department patch bypass。
3. Inspector 新增上級欄位與 issue routing；DirectoryDock edit position 改導向 Inspector，移除 active edit-position dialog。
- Gate：第 12.5 節 `C-*` 全過；每個拒絕結果保留相同 state reference/signature，App 只對 `applied` 呼叫一次 `commitState`；`npm test` 與 `npm run build` 通過。

### Slice 3：部門 group layer 與清單對齊

1. 實作 `departmentGroups.ts` 與 `G-*` tests，再建立 `DepartmentGroupLayer.tsx` 與 `ViewportPortal` wiring。
2. frames 使用 preview state/layout；補 CSS palette、z-order、pointer-events、單一 frame 零碰撞排版與 reduced-motion。
3. DirectoryDock 移除 inline row margin，加入 name-area depth guide；不改 menu/focus/context-menu contract。
- Gate：第 12.5 節 `G-*` 全過；真實瀏覽器 DOM 證明同部門一個主要標示、group layer `pointer-events: none`、menu x-axis 各深度誤差 ≤ 1px；三 viewport 無遮擋或 overflow。

### Slice 4：整合與回歸

1. 執行第 12.6 的 browser flow、Visible Error Sweep、Information Noise Sweep、5 秒理解與回歸矩陣。
2. `npm test`、`npm run build` 全過；記錄最終測試數、route、viewport、截圖與 console 結果。
3. 對照本 spec／ADR／DEV 做 Spec Drift / Convergence Check；只有 `In sync` 才把 DEV 送 QA/QC，不在本 slice deploy。
- Gate：所有 final acceptance 有 auto 或 manual evidence；任何必要 viewport、migration failure、原子拒絕、Undo/redo 或既有 assignment flow 未驗證即為 `未充分驗證`。

## 12. Acceptance and evidence contract

### 12.1 Functional acceptance

- [ ] 畫布 hierarchy 只由 `Position.parentPositionId` 決定；V2 state 沒有第二份 persisted parent。
- [ ] 改上級不改部門；改部門不改上級；成功寫入後畫布、清單、統計與 Inspector 同步。
- [ ] 每個非空實體部門恰為一個 connected region；單職位部門合法，`null` 部門不套用 frame invariant。
- [ ] 會造成 cycle、missing parent 或部門分裂的 add/move/edit/duplicate/delete/promote 操作原子阻擋；明確 department-delete replacement 的部門分裂為可持久化警示狀態，原資料與 Undo stack 仍維持原子提交。
- [ ] 合法 V1 文件可升為 V2；不合法 V1 文件不被覆寫並能下載原始 payload。
- [ ] `Department.parentId` 的新增、編輯、路徑與循環防呆不因 position hierarchy 被靜默改寫。
- [ ] 空部門仍存在主檔與清單，畫布不建立空框。

### 12.2 UX acceptance

- [ ] 5 秒內可辨識：職位是主要物件、實線是主要上下級、低干擾範圍是部門歸屬。
- [ ] 同一職位只需在一個 Inspector 編輯；「所屬部門」與「上級職位」可區分且不重複。
- [ ] 阻擋狀態在受影響欄位／節點附近可發現，包含人類影響與恢復方式；不依 console 或 raw ID 才能理解。
- [ ] 正常狀態無逐卡說明、逐卡 CTA、重複部門名稱或高對比大框干擾掃描。
- [ ] 部門清單各深度的外框、名稱欄與 `⋯` 對齊，階層仍能由 disclosure／路徑／局部縮排辨識。
- [ ] frame 不以顏色作唯一訊號，不遮擋內容或攔截 pointer/focus。
- [ ] 所有非空部門皆為完整 frame；任兩 frame 交集面積為 0 且至少保留 12px 安全距離，不存在 band/badge variant。

### 12.3 Required automated evidence

- validator table tests：合法 forest、cycle、自指、missing parent、連續／分裂部門、單節點、空部門、`null` 部門。
- command tests：上級、部門、add、duplicate、drag、delete branch、promote children、department replacement 的成功與拒絕 state signature。
- migration tests：V1 valid → V2、V1 invalid preserved、V2 round-trip、unsupported version typed failure。
- layout/drag tests：adapter-derived parent 與既有 drop/reorder 行為。
- group derivation/layout tests：唯一 anchor、穩定 bounds/order、dense mixed tree 零 frame overlap、collapsed visible set、`null` exclusion。
- `npm test` 全數通過；`npm run build` 成功。

### 12.4 Required manual/QC evidence

- 真實瀏覽器走查：正常圖、選取職位、合法換上級、非法換上級、合法換部門、非法換部門、刪除／上移被阻擋、空部門、未設定部門、migration failure。
- viewport：1440×900、1024×768、390×844；每個尺寸檢查主要操作可達、dialog/drawer 可用、無非預期水平 overflow。
- 截圖：正常全圖、完整部門 frames、Inspector 兩欄位、部門清單不同深度對齊、至少一個阻擋狀態。
- console：0 error；受影響 flow 無未處理 rejection；DOM/樣式檢查 frame layer `pointer-events: none`。
- 人工 5 秒理解檢查與紅筆刪除檢查，結果記入 QC evidence。

### 12.5 Executable unit test matrix

| ID | Test file | Fixture / action | Expected |
| --- | --- | --- | --- |
| H-001 | `organizationHierarchy.test.ts` | 兩個 roots、合法 parent forest | validator `ok`；adapter parent 來自 Position |
| H-002 | 同上 | self parent；A→B→A | 分別 `SELF_PARENT`、`HIERARCHY_CYCLE` |
| H-003 | 同上 | active position 無 layout；layout 無 active position | `MISSING_LAYOUT`、`ORPHAN_LAYOUT` |
| H-004 | 同上 | duplicated position/layout ID | 對應 duplicate code，ID 穩定 |
| H-005 | 同上 | non-null unknown department；`null` department | unknown 被拒；`null` 合法 |
| H-006 | 同上 | A(dept X)→B(dept X)→C(dept Y) | dept X connected，合法 |
| H-007 | 同上 | A(X)→B(Y)→C(X) | `DEPARTMENT_DISCONNECTED`，回 X 與 A/C |
| H-008 | 同上 | A(Y) 下兩個 X siblings | X disconnected，被拒 |
| H-009 | 同上 | empty/single-position department、初始 fixture | 全部合法 |
| C-001 | `organizationCommands.test.ts` | 合法 MOVE 到新 parent/index | 只改 parent、來源/目的 order與必要 collapsed；department不變 |
| C-002 | 同上 | MOVE 造成 cycle 或 department split | rejected；state reference/signature不變 |
| C-003 | 同上 | 合法／非法 CHANGE_DEPARTMENT | 合法只改 department；非法保留 parent/state |
| C-004 | 同上 | ADD child | parent/dept default正確，parent展開，一次 proposed state |
| C-005 | 同上 | ADD sibling於 department anchor | 分裂時 rejected，無新 position/layout |
| C-006 | 同上 | DUPLICATE normal／anchor | normal 插入且不複製 assignments/children；anchor分裂時 rejected |
| C-007 | 同上 | REORDER 中間／邊界 | 中間 applied且 order連續；邊界 noop |
| C-008 | 同上 | DELETE branch | branch inactive、layout移除、assignments關閉、剩餘 order連續 |
| C-009 | 同上 | DELETE promote legal／disconnecting | legal children接原 parent；illegal原子 rejected |
| C-010 | 同上 | DELETE_DEPARTMENT replacement/null | position parent不變；明確 remap applied 並可形成多區塊；非法 ID／hierarchy remap rejected |
| C-011 | 同上 | missing target、duplicate new ID、bad insert index | typed issue，state reference不變 |
| M-001 | `documentStorage.test.ts` | valid V1 initial document | V2 normalized；position parent copied；member parent absent |
| M-002 | 同上 | V1 ID mismatch/cycle/disconnected dept | typed failure；V1 key仍存在，V2未寫 |
| M-003 | 同上 | valid V2 round trip | deep-equal state、version 2、無 persisted member parent |
| M-004 | 同上 | V2與V1同時存在 | 優先 V2，不重跑 V1 migration |
| M-005 | 同上 | invalid JSON/app/version/shape | 各自 typed failure，不回無原因 null |
| M-006 | 同上 | failed V2 archive success/failure | success才可進新文件；failure保留 recovery gate |
| G-001 | `departmentGroups.test.ts` | 連續同部門 3 nodes | 一個 group、唯一 anchor、union+padding bounds |
| G-002 | 同上 | `null`、empty dept、single dept | null/empty無 group；single有一個 frame |
| G-003 | 同上 | dense mixed-department tree | 每個非空部門一個完整 frame；任兩 frame 至少相隔 12px |
| G-004 | 同上 | collapsed visible set | 只依 visible nodes重算，不改 domain state |
| G-005 | 同上 | 相同輸入重跑 | groups deep-equal、palette/order穩定 |
| R-001 | 既有 tests | migrated fixture執行 layout/drag/position/directory/assignment | 原功能除契約明示改動外全部通過 |

### 12.6 Browser/QC flow matrix

| ID | Flow | Required observation |
| --- | --- | --- |
| UI-001 | 初始載入＋fit view | 5 秒內辨識職位、上下級線、部門；同部門一個 label |
| UI-002 | Inspector 合法換上級 | 線與位置更新，department值不變；Undo/redo各一次完整還原 |
| UI-003 | Inspector 非法換上級 | controlled select保留原值，就地說明部門會分裂，無成功 toast/history |
| UI-004 | Inspector 合法／非法換部門 | parent保持；合法 frame/統計同步，非法值回復且可理解 |
| UI-005 | drag合法／非法 candidate | 合法 preview含 frame同步；非法不顯示可提交 preview，drop snap back |
| UI-006 | add child/sibling/root/duplicate | defaults符合 9.5；被阻擋時沒有幽靈節點或錯誤 selection |
| UI-007 | delete branch/promote | preview與確認保留；非法 promote dialog不關閉，改選branch可完成 |
| UI-008 | delete department replacement/null | 明確 replacement 完成同步；其他非法 replacement 在同一對話框顯示原因且無假成功訊息 |
| UI-009 | valid V1 bootstrap | 自動載入同一組織資料、saved狀態正確、V1保留、V2存在 |
| UI-010 | invalid V1/V2 bootstrap | recovery dialog阻擋 workspace/save；raw可下載；新文件前 archive規則成立 |
| UI-011 | Directory departments depth 0–4 | row外框/avatar/menu x-axis一致；名稱區仍可辨識深度 |
| UI-012 | assignment/collapse/axis/search/context menu | 既有行為無回歸；group layer不攔截任何 pointer/focus |
| UI-013 | 1440×900 / 1024×768 / 390×844 | Inspector/recovery/dialog可操作；所有部門 frame 零重疊，無裁切、非預期水平 overflow |
| UI-014 | Visible Error / Noise Sweep | console 0 error；無未處理 runtime error、raw code、DEV ID、重複說明或逐項 CTA |

## 13. Failure modes and recovery

| Failure | Required behavior | Forbidden behavior |
| --- | --- | --- |
| hierarchy cycle / missing parent | command 原子拒絕，保留原值並顯示原因 | 自動改成 root 或其他 parent |
| department disconnected | 指出部門與分裂結果，drag snap back／select 回原值 | 自動換部門、搬分支或畫多個同名框 |
| delete/promote breaks invariant | 保留 dialog 與原分支，讓使用者改選或取消 | 先刪後用另一筆 command 補救 |
| V1 migration invalid | 保留 raw V1，停用覆寫並提供備份入口 | 載入範例資料並顯示儲存成功 |
| group geometry collision | 平移較晚 anchor 的完整可見 branch，重新計算 frames，維持至少 12px 間距 | 切換第二種 rendering、增加遮擋、重複 label 或改寫組織資料 |
| validator/runtime exception | 不 commit、保留 state、顯示一般可恢復錯誤並記錄診斷 | partial write 或清空畫布 |

## 14. Stop conditions

任一條件成立即停止該 slice，回 PM／QA 收斂，不得宣告 ready：

- 仍存在可繞過 transaction validator 的 hierarchy 或 department write path。
- V2 同時持久化 `Position.parentPositionId` 與另一份 hierarchy parent。
- V1 migration 可能覆寫原始 payload，或 migration failure 只能以靜默 fallback 處理。
- 為讓操作通過而必須自動改另一個權威欄位。
- 部門 frame 只能靠多個同名碎片、遮擋主要內容或可點擊 overlay 才能呈現。
- 任兩個非空部門 frame 仍有交集，或必須切換第二種 rendering 才能避免交集。
- 既有刪除、部門 replacement、Undo/redo、assignment 或文件操作無法在單一原子 state boundary 保持一致。
- 主要 viewport 出現不可操作、裁切或非預期水平 overflow。
- `npm test`、`npm run build`、必要人工 flow 或 Spec Drift / Convergence Check 未通過。

## 15. Deferred scope audit

`Future Phase Capsule / Not Requested`：未來複雜匯報以獨立 `ReportingLine` 或等價模型保存 relationship type、effective period 與多上級；不能重載 `departmentId` 或 V1 primary parent。Re-entry trigger 為使用者明確需要跨部門例外直線、矩陣、次要、代理、多上級或主管權限範圍。此 deferred scope 已由本文件的 Out of scope、ADR 與資料欄位邊界覆蓋，不阻擋 V1 RD。

## 16. Current phase RD handoff contract

- Readiness：`RD Implementation Complete / QA-QC Handoff`。Slice 1–3 與單一 frame 視覺修正已完成實作；後續 QA 不需再決定 authoritative parent、檔案位置、公開函式、command type、連續子樹、frame rendering、失敗回復或 V1/V2 migration 原則。
- Entry baseline：本輪已重跑 `npm test`（11 files／68 tests passed）與 `npm run build`；後續 QA 若 baseline 失敗，先記錄第一個有效錯誤並停止 DEV-017 變更。
- 實作順序固定為 Slice 1→2→3→4；上一 slice gate 未通過不得跨到下一 slice，也不得先用 UI workaround 掩蓋 data/migration 缺口。
- RD 已以 `rg "parentId|departmentId|removeDepartmentFromDirectory|duplicatePosition|moveMember|confirmDelete" src` 建立 mutation inventory；active hierarchy writes 均由 `executeOrganizationCommand` 進入 validator，position directory bypass 已移除。
- QA 依每個 slice gate 驗證，不要求 Slice 1 提前完成 frame 視覺；QC 只在有真實 UI 的 Slice 3/4 執行 viewport 與 5 秒理解檢查。
- 自動證據記錄實際 test file/test count與 build結果；UI 證據至少保留 route、timestamp、viewport與截圖路徑，最終摘要寫回 `ai-doc/dev_task.md#dev-017正式組織圖職位樹與部門分組整合`。
- Playwright smoke evidence：`output/playwright/orgmaster-department-frames-1440.png`、`output/playwright/orgmaster-department-frames-1024.png`、`output/playwright/orgmaster-department-frames-390.png`；三尺寸 frame overlap 0、水平 overflow 0、console error 0。既有 Inspector、invalid V2 recovery／archive 證據仍有效。
- 第一個 failed gate、資料覆寫風險、scope drift或新增 dependency需求即停止，不繼續累積未驗證變更。
- 完成本 DEV 不等於授權部署或 release；release 需另行指示。

## 17. Governance conclusion

- RD Readiness Review：`Pass`；RD Implementation Review：`Pass`。repo/module/file、I/O、migration、transaction、failure recovery、UI component、test/evidence與 stop conditions均已指定並落地，無 P0/P1 implementation gap。
- Spec Impact Preflight：2026-08-13 使用者明確要求以完整 frame 作為唯一部門視覺，取代原有 frame/band fallback，判定 `Intentional replacement`；本文件亦持續取代 DEV-008 對主要 hierarchy parent 的暫時語意，其餘 Employee／Department／Role／Assignment 契約不變。
- Cross-spec consistency：`No unresolved conflict`。DEV-001/009/012/015/016 的能力保留，受影響寫入與文件格式在本 contract 明確收斂。
- ADR：已建立 `ADR-001`，因本決策跨資料模型、畫布、文件 migration 且有長期效力。
- Deferred Scope Audit：複雜匯報維持第 15 節 `Future Phase Captured / Not Requested`；不需新 DEV，不阻擋目前實作。
- Blocker：無。Slice 1–3 已完成；Slice 4 targeted smoke 已完成，完整 QA/QC 與 release 仍在本 DEV 邊界之外。
- Release boundary：不在本 DEV。
