# DEV-038：流程－職掌－責任聯動規劃工作台 RD Implementation Contract

狀態：`RD Implementation Ready / MVP Implementation In Progress / QA-QC Pending / Local Release Gate Pending`

日期：2026-08-27

文件角色：DEV-038 Current Phase 的產品、技術與實作交接權威。本文已固定資料權威、exact TypeScript symbols、repo/file allowlist、route、transaction、V6→V7 migration、Dagre dependency gate、S0→S6 實作順序、權限／能力、失敗恢復及可執行 QA／QC evidence contract。現有 worktree 已有 MVP 候選實作，但仍以本文件的契約與 QA gate 為準；不得擴張至 Future Phase、deploy 或 release。

來源：`USER-2026-08-27-PROCESS-DUTY-RESPONSIBILITY-WORKBENCH`、`USER-2026-08-27-MINDMAP-FLOWCHART-OSS-DESIGN`

父交付點：DEV-034、DEV-036

優先級：P1

風險等級：High（OrganizationDocument V6→V7、四個新領域集合、Duty delete referential guard、同頁雙畫布 selection／drag，以及跨 DEV-034／036 的同 revision 驗證）

架構決策：`ai-doc/adr/ADR-008-process-planning-organization-version-authority.md`

## 0. RD Implementation Readiness 結論

DEV-038 的目標不是把組織圖、心智圖與流程圖堆在同一頁，而是讓總經理與各主管使用同一份公司事實，依下列順序完成規劃：

```text
先拆解公司要完成的工作
  → 再排出工作如何流動
    → 將流程節點連結到穩定的工作職掌
      → 選擇主執行／協作／審核／會簽
        → 最後配置到組織圖 Position
```

核心資料鏈固定為：

```text
ProcessNode ↔ Duty ↔ DutyPositionRelation ↔ Position ↔ EmployeeAssignment
```

- `ProcessNode` 表示一個流程情境中的工作發生點。
- `Duty` 表示公司可重複使用、相對穩定的工作責任主檔。
- `DutyPositionRelation` 表示某個 Position 對 Duty 承擔的責任種類。
- `Position` 承擔責任；`Employee` 透過任職關係進入 Position，不直接成為 Duty 的永久責任權威。
- 心智圖、流程圖與組織圖是同一組領域資料的不同投影；畫布座標、縮放與展開狀態不得成為領域關係權威。

本文件已達 `RD Implementation Ready`：Current Phase 的產品語意、資料權威、V7 migration、route、使用者入口、兩個 React Flow store、狀態 owner、exact command／validator、dependency、repo/file、S0→S6、失敗恢復、驗收及 evidence layer 均已固定，沒有待 RD 自行決策的 P0／P1 工程缺口。現有 MVP 候選已可供本機 smoke，但尚未取得 QA／QC 完成或 release 授權；若需越出 allowlist 或改變 ADR-008，立即停止並回 PM。

Current Phase 只保留最小聯動規劃能力；BPMN、AI 自動設計、流程執行引擎、工作量判斷、process-scoped responsibility 及即時多人共編均延後。

## 1. 真正問題與使用者價值

現行 DEV-034 很適合已經知道「哪一項職掌要由哪個職位負責」時做快速配置；DEV-036 很適合在配置完成後盤點缺口與觀察分布。但兩者都沒有回答規劃前最關鍵的問題：

1. 公司為了達成某個成果，實際需要哪些工作？
2. 這些工作應按什麼順序、經過哪些交接？
3. 哪些工作只是流程節點，哪些應沉澱為可重用的職掌？
4. 職掌應由哪種責任承擔，最後才由哪個 Position 接手？

如果先看現有人員再切工作，制度容易變成「照著現在的人寫職掌」；人員異動後，流程與責任便一起失真。DEV-038 要讓規劃者先從成果與最佳流程出發，再把責任配置到組織，降低因人設事及跨部門斷點。

成功結果是：總經理與主管在同一工作台選取任何流程節點、Duty 或 Position 時，都能立即看見其相鄰關係；完成調整後，DEV-034 快速配置與 DEV-036 盤點／分布會讀到同一份責任事實，而不是產生第三套職掌或責任資料。

## 2. Human-confirmed 產品原則

1. 規劃順序以「流程優先、職掌穩定化、職位最後配置」為主，不先把工作綁給既有人員。
2. 人類負責判斷流程、職掌及責任是否合理；AI 只能作後續輔助，不自動建立永久關聯或指定適任職位。
3. 心智圖用來拆解工作範圍，流程圖用來表達順序與交接，組織圖用來配置責任；三種視角不得混成一張同時顯示所有 edge 的圖。
4. 同一個 ProcessNode 可連結零到多個 Duty，同一個 Duty 也可被多個 ProcessNode 重用；草稿可暫存未連結節點，但須在盤點中明確呈現。
5. Current Phase 的 Duty→Position 責任是全域事實；不因 Duty 被不同 ProcessNode 使用而建立不同責任人。若真實試用證明同一 Duty 在不同流程情境必須由不同 Position 負責，才另案設計 process-scoped override。
6. Position 才是責任配置單位；Employee 只透過任職關係取得當下工作，不把永久職掌直接綁在人名。
7. 桌面／筆電提供規劃與拖放；手機遵守專案最高原則，只提供唯讀導覽與關聯查看。
8. 第一階段以一人操作、多人共同討論為主；不做即時多人游標、衝突合併或線上白板功能。

## 3. 與既有 DEV 的權責邊界

| 表面 | 主要任務 | Current authority | DEV-038 的關係 |
| --- | --- | --- | --- |
| DEV-034 左側職掌清單＋組織圖 | 已知 Duty 與 lane 後快速配置到 Position | Duty relation mutation、Undo／Redo、autosave、CAS | 重用，不另造第二套 Duty→Position command |
| DEV-036 `/duty-planning` | 配置後的責任盤點與責任分布 | 唯讀投影、URL state、正常入口與 Drawer | 保留為結果／驗證層，不改成 DEV-038 編輯畫布 |
| DEV-038 聯動工作台 | 從流程設計開始建立 ProcessNode→Duty→責任→Position 鏈 | 新增的流程與節點關聯規劃 | 只在必要步驟呼叫既有責任配置權威 |

Spec impact 分類：

- `Compatible extension`：DEV-034 的 Duty identity、四種責任 lane、assign-only relation command、Position drop target、Undo／Redo、autosave 與 CAS 繼續有效。
- `Compatible extension`：DEV-036 繼續是只讀責任盤點／分布工作台；DEV-038 完成的責任異動應由同一 organization state 立即反映到 DEV-036。
- `New authority / Accepted ADR-008`：Process、ProcessNode、ProcessEdge、ProcessNodeDutyLink 進入 OrganizationDocument V7，與既有 Duty／Position 共用 organization version、revision、Undo／Redo、dirty、autosave 與 CAS；不建立獨立 Process store。
- `No replacement`：本 Contract 不改寫 DEV-034 R2 的待 browser gate 狀態，也不改寫 DEV-036 已完成證據。

## 4. 工作台資訊架構

### 4.1 頁面骨架

桌面採一個完整 URL 工作台，主要操作由左向右：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 流程與職掌規劃  [心智圖｜流程圖]    版本／唯讀狀態    儲存／返回            │
├──────────────────────────────┬──────────────────┬────────────────────────────┤
│                              │ 選定節點的職掌橋 │                            │
│  心智圖或流程圖主畫布        │                  │  組織責任投影清單            │
│                              │ Duty A            │                            │
│  一次只顯示一種 edge 語意    │ [主執行][協作]    │  Position 為 drop target   │
│                              │ [審核][會簽]      │  （既有組織圖仍是權威）      │
│                              │ ＋連結既有職掌    │                            │
└──────────────────────────────┴──────────────────┴────────────────────────────┘
```

- 左側主畫布顯示同一 Process 的兩種投影，使用 `心智圖／流程圖` 切換；不在同一畫布同時顯示 parent-child 與 next-step edge。
- 中央 Duty 橋接欄只在已選 ProcessNode 時展開，預設 `320px`、可在 `300～360px` 內調整；未選節點時收合成窄提示，不永久壓縮兩側畫布。
- MVP 右側以既有組織資料投影成密集的部門／Position 清單，Position 是 drop target；既有組織圖仍是 Position 與 reporting line 的權威，不建立第二份資料。完整組織 React Flow 同頁嵌入列為下一個 UI slice，避免第一版為了畫面重用而重構 `App.tsx`。
- `viewport >= 1280px`：同時顯示流程畫布、Duty 橋接欄與組織圖；左右畫布分配剩餘寬度，分隔線可調整但不得讓任一畫布小於 `360px`。
- `1024px <= viewport < 1280px` 且具 hover＋fine pointer：保留 Duty 橋接欄，主畫布以同頁 segmented control 切換 `流程規劃／組織配置`；切換不清除 ProcessNode、Duty、lane 或 Position selection，也不建立 overlay modal。
- `viewport < 1024px` 或不具 hover＋fine pointer：整個 DEV-038 為唯讀，以 `流程／職掌／組織` 分段切換保留關聯導覽；不顯示 drag、save 或其他 mutation。

### 4.2 單一選取上下文

工作台只允許一組主要 planning context：

```text
selectedProcessId
selectedProcessNodeId?
selectedDutyId?
selectedResponsibilityLane?
selectedPositionId?
```

選取任何主要物件時：

- 相鄰物件高亮。
- 非相鄰物件降噪但保留，避免失去全貌。
- 不自動執行 mutation。
- URL 保存 `view`、`process`、可選的 `node` 與可選的 linked `duty`；lane、Position、hover、drag、viewport、zoom 與 panel width 只屬 session／presentation state，不進 URL。正規化、history 與 back／forward 規則見第 7.5 節。

### 4.3 不使用常駐全關聯線

全貌不等於把所有關係同時畫出來。Current Phase 採選取式揭露：

- 心智圖模式只畫 parent-child。
- 流程圖模式只畫 next-step。
- 組織圖只畫既有 reporting line。
- ProcessNode→Duty 與 Duty→Position 透過中央橋接欄、選取高亮與短暫引導線呈現。
- 未選取時不畫跨畫布線，避免視覺蜘蛛網及錯誤暗示。

## 5. 核心操作流程

### 5.1 從流程節點配置責任

```text
選擇或新增 Process
  → 在心智圖拆出 ProcessNode
  → 切到流程圖安排 next-step
  → 選定 ProcessNode
  → 中央欄連結既有 Duty（或建立新 Duty 後連結）
  → 選定 Duty 的主執行／協作／審核／會簽
  → 拖曳到右側 Position
  → 由既有 DEV-034 relation command 驗證並提交
  → 兩側投影與 DEV-036 讀取同一結果
```

### 5.2 反向盤點

- 點選 Duty：高亮所有使用此 Duty 的 ProcessNode，以及所有承擔該 Duty 的 Position。
- 點選 Position：高亮其承擔的 Duty，再高亮這些 Duty 出現在哪些 ProcessNode。
- 點選 ProcessNode：中央欄只列其已連結 Duty，右側只強調相關 Position；不隱藏其餘組織。
- 點空白：清除局部焦點，恢復全貌。

### 5.3 建立與連結 Duty

Current Phase 應優先連結既有 Duty，避免重複主檔。若找不到合適 Duty，可從中央欄呼叫既有 Duty 建立流程；成功時由 `CREATE_DUTY_AND_LINK_PROCESS_NODE` 在同一 history commit 建立 Duty 與 ProcessNodeDutyLink，取消或失敗時保留原節點與選取，不建立半成品 Duty 或 link。

DEV-038 不承擔第二套完整 Duty 編輯器。點擊 Duty 名稱開啟既有 Duty 明細／編輯表面；關閉或保存後回復原 route 與 ProcessNode selection。中央橋接欄只承擔搜尋、連結、解除連結、快速建立最小必要欄位與責任 lane 選取。

## 6. 圖形編輯規則

### 6.1 心智圖

用途：從成果往下拆解「為了完成這件事，公司還需要做什麼？」

Current Phase 採左到右的結構化樹，不做自由白板：

```text
Process root
  ├─ ProcessNode
  │   ├─ ProcessNode
  │   └─ ProcessNode
  └─ ProcessNode
```

領域至少需要穩定語意：`processId`、`nodeId`、`parentNodeId`、`sortOrder`、`title`。`x/y` 只為畫布投影；移動節點若只是調整閱讀位置，不得改變 parent-child 語意。折疊狀態可作使用者介面偏好，不得決定節點是否存在。

### 6.2 流程圖

用途：回答「哪一步先做、交給哪一步、在哪裡發生交接？」

Current Phase 只提供最小 directed graph：

- ProcessNode 為節點。
- ProcessEdge 只保存 `fromNodeId → toNodeId`。
- 支援新增／刪除 edge 及基本起點、終點與斷線辨識。
- 不在第一階段加入 BPMN gateway、條件 expression、timer、事件、subprocess、泳道執行引擎或自動化規則。

同一 ProcessNode 在心智圖與流程圖共用 identity；改名只改一次。parent-child 與 next-step 是兩種獨立 edge，不可互相推導或因畫面拖動而隱性改寫。

### 6.3 組織圖

- 組織資料、Position identity、department group 與 reporting line 沿用既有 organization state；MVP 以同頁右側的密集 Position 投影清單完成責任 drop，避免複製資料或重構既有 React Flow store。
- 完整既有 React Flow 組織圖的同頁嵌入與 cross-canvas selection 保留為後續 UI slice；在此之前，右側清單的 Position selection 仍以 stable ID 回寫同一 planning context。
- Position 卡片不常駐顯示長職掌清單；只在目前選取 context 顯示非文字輪廓、責任標記或高亮。
- 責任配置仍以「Duty＋exact lane」拖到 Position；普通點擊 Position 只閱讀／選取。
- 相同 relation、primary transfer、pending reassignment、remove、Undo／Redo 與失敗恢復沿用 DEV-034，不在本 Contract 另創語意。

## 7. Architecture Memory Capsule

### 7.1 Current Phase 領域物件

ADR-008 已決定四個 Process 集合進入 OrganizationDocument V7。以下名稱、欄位與型別就是 Current Phase 的 exact `src/types.ts` contract；RD 不得自行改名、合併或增加持久欄位：

```ts
interface ProcessDefinition {
  id: string
  title: string
  description: string | null
  order: number
}

interface ProcessNode {
  id: string
  processId: string
  title: string
  parentNodeId: string | null
  order: number
}

interface ProcessEdge {
  id: string
  processId: string
  fromNodeId: string
  toNodeId: string
}

interface ProcessNodeDutyLink {
  id: string
  processNodeId: string
  dutyId: string
  order: number
}

interface OrgDirectoryState {
  processes: ProcessDefinition[]
  processNodes: ProcessNode[]
  processEdges: ProcessEdge[]
  processNodeDutyLinks: ProcessNodeDutyLink[]
}
```

不變量：

1. ProcessNode 不複製 Duty title、責任人或 Position；只保存 stable link。
2. ProcessNodeDutyLink 不保存責任 lane；lane 屬於 DutyPositionRelation 的全域責任事實。
3. 只有 leaf ProcessNode 可刪；刪除不得連帶刪除 Duty 或 DutyPositionRelation，只移除該節點及其 ProcessEdge／ProcessNodeDutyLink。
4. Duty 被任何 ProcessNodeDutyLink 引用時，Duty delete fail closed；錯誤回傳引用的 Process／ProcessNode，使用者先解除 link 再重試。
5. 不存在的 Duty／Position reference 必須 fail-soft 顯示並列為資料完整性問題，不能 render crash 或靜默建立替代物件。
6. 圖形位置、viewport、zoom、selection 與展開狀態是 presentation state，不是 domain truth。
7. Process 是心智圖的概念根；top-level ProcessNode 使用 `parentNodeId=null`，同一 Process 可有多個 top-level node。
8. `order` 只在同一 parent／同一 ProcessNode 的 link 集合內排序；成功 command 後正規化為連續、唯一的非負整數。
9. ProcessNode parent 必須存在於同一 Process，且 parent-child 不得形成 cycle。
10. ProcessEdge 兩端必須存在於同一 Process、不得 self-loop、不得重複同一 `from→to`；一般 next-step cycle 可成立並由投影辨識為 feedback edge，不新增持久 `edgeKind`。
11. 同一 ProcessNode＋Duty pair 最多一個 link；同一 Duty 可連到多個 ProcessNode。
12. Current Phase 不保存 Process lifecycle status；Process 只能在完全沒有 ProcessNode 時刪除，避免新增 archive／restore 狀態機。

欄位限制：

- 每種實體 ID 在自己的集合內唯一、不可變且不可由 title 推導；不同集合不要求共用 global namespace，所有 reference 依欄位型別解析。
- title trim／壓縮連續空白後長度 `1～120`；Process description 為 `null` 或 trim 後最多 `500` 字。
- array、reference、duplicate、order、cycle 與文字限制由 canonical parser／validator 同時檢查；UI 隱藏控制不能取代 domain validation。

### 7.2 持久化與版本權威

ADR-008 採 OrganizationDocument V7 單一文件權威：

- V7 與既有 Employee、Position、Duty、DutyPositionRelation 共用 organization version ID 與 opaque version revision。
- Process、Duty link 與責任配置共用同一 `OrgDirectoryState`、Undo／Redo、dirty、500ms autosave、Ctrl+S、workspace mode 與 CAS。
- 不新增 ProcessPlanningDocument、Process API、Process autosave、第二 revision 或跨文件 journal。
- 建立 organization draft 時完整複製四個 Process 集合；之後各 version 獨立。
- V6→V7 只加入四個空陣列，不以 AI、標題、Duty、管理辦法或畫面推測流程；原 V6 bytes 保留到成功保存 V7。
- Workspace manifest 維持 V1；download／backup／copy 包含 V7 Process；Current Phase version compare 明確忽略 Process 集合。
- Governance snapshot 繼續 explicit field selection；Process 不進入 governance policy snapshot。
- 管理辦法 store／snapshot／editor 不因 V7 改變，也不建立 Process reference。

### 7.3 React state 與圖形引擎邊界

- Domain selection／Process data／Duty data／organization state 由兩個圖形投影上方的共同 owner 管理。
- 心智／流程主畫布與組織圖若同時使用 React Flow，必須使用獨立 `ReactFlowProvider`，避免 viewport、store、fitView 與 keyboard state 互相污染。
- 每個 canvas 只擁有自己的 viewport、zoom、暫態 hover／drag 與 projected node positions。
- 跨畫布 drag payload 必須包含 stable `dutyId` 與 exact lane，不得靠可見文字或 DOM 座標推定領域身分。
- 所有 release 都以 latest domain state 重新驗證；invalid、noop、rejected 不得產生 revision、Undo entry 或假成功。

### 7.4 Command 與 transaction contract

Current Phase 以 `executeOrganizationCommand` 為唯一 mutation 入口。下列 union discriminant 與 payload 是 exact `OrganizationCommand` contract；ID 由 UI 在送出 command 前建立，以維持 deterministic replay，不得把一個行為拆成多次非原子 state write：

| 行為 | Contract | 成功結果 | Rejected／No-op |
| --- | --- | --- | --- |
| 建立 Process | `CREATE_PROCESS` | 新增唯一 ID、正規化 title、放在 processes 末端 | duplicate ID／非法 title rejected |
| 更新 Process | `UPDATE_PROCESS` | title／description 同一 history commit 更新 | 無實質變更 no-op |
| 刪除 Process | `DELETE_EMPTY_PROCESS` | 只刪完全無 node 的 Process | 有 node 時 rejected，不能 cascade |
| 建立節點 | `CREATE_PROCESS_NODE` | 在指定 parent 下新增並正規化 sibling order | parent 不存在／跨 Process／循環 rejected |
| 更新節點 | `UPDATE_PROCESS_NODE` | inline rename 同一 history commit | 無實質變更 no-op |
| 移動節點 | `MOVE_PROCESS_NODE` | 改 parent／order，來源與目標 siblings 同步正規化 | 將節點移到自己／後代、跨 Process rejected |
| 刪除節點 | `DELETE_PROCESS_LEAF_NODE` | 同時刪 leaf、相關 edges 與 links | 有 child 時 rejected；不刪 Duty／relation |
| 建立流程 edge | `CREATE_PROCESS_EDGE` | 新增唯一 directed edge | self／duplicate／跨 Process rejected |
| 刪除流程 edge | `DELETE_PROCESS_EDGE` | 移除一個 existing edge | 不存在為 no-op |
| 連結 Duty | `LINK_PROCESS_NODE_DUTY` | 新增 stable link 並正規化 order | duplicate pair no-op；missing reference rejected |
| 解除 Duty | `UNLINK_PROCESS_NODE_DUTY` | 只移除 link | 不刪 Duty／relation；不存在為 no-op |
| 建 Duty 並連結 | `CREATE_DUTY_AND_LINK_PROCESS_NODE` | Duty＋link 原子建立 | 任一 validation 失敗時兩者皆不建立 |

Duty＋exact lane 拖到 Position 仍呼叫 DEV-034 assign-only resolver 與既有 relation command；不把 ProcessNode ID 寫進 DutyPositionRelation。每個 applied command只產生一個 Undo entry，保存仍由 organization autosave 處理。

Exact union additions：

```ts
| { type: 'CREATE_PROCESS'; process: ProcessDefinition }
| { type: 'UPDATE_PROCESS'; processId: string; title?: string; description?: string | null }
| { type: 'DELETE_EMPTY_PROCESS'; processId: string }
| { type: 'CREATE_PROCESS_NODE'; node: ProcessNode }
| { type: 'UPDATE_PROCESS_NODE'; nodeId: string; title: string }
| { type: 'MOVE_PROCESS_NODE'; nodeId: string; parentNodeId: string | null; insertIndex: number }
| { type: 'DELETE_PROCESS_LEAF_NODE'; nodeId: string }
| { type: 'CREATE_PROCESS_EDGE'; edge: ProcessEdge }
| { type: 'DELETE_PROCESS_EDGE'; edgeId: string }
| { type: 'LINK_PROCESS_NODE_DUTY'; link: ProcessNodeDutyLink }
| { type: 'UNLINK_PROCESS_NODE_DUTY'; linkId: string }
| {
    type: 'CREATE_DUTY_AND_LINK_PROCESS_NODE'
    duty: Duty
    link: ProcessNodeDutyLink
  }
```

`OrganizationCommandResult.rejected.issue` 擴充為下列固定 shape；既有 caller 可繼續只讀原欄位：

```ts
{
  code: OrganizationCommandIssueCode
  positionIds: string[]
  departmentIds: string[]
  dutyIds: string[]
  processIds: string[]
  processNodeIds: string[]
}
```

`ProcessPlanningValidationCode` 與 `OrganizationCommandIssueCode` 必須包含：

```text
PROCESS_ID_DUPLICATE
PROCESS_NOT_FOUND
PROCESS_TITLE_INVALID
PROCESS_DESCRIPTION_INVALID
PROCESS_NOT_EMPTY
PROCESS_NODE_ID_DUPLICATE
PROCESS_NODE_NOT_FOUND
PROCESS_NODE_TITLE_INVALID
PROCESS_NODE_PARENT_INVALID
PROCESS_NODE_CYCLE
PROCESS_NODE_HAS_CHILDREN
PROCESS_NODE_ORDER_INVALID
PROCESS_EDGE_ID_DUPLICATE
PROCESS_EDGE_NOT_FOUND
PROCESS_EDGE_ENDPOINT_INVALID
PROCESS_EDGE_SELF_LOOP
PROCESS_EDGE_DUPLICATE
PROCESS_DUTY_LINK_ID_DUPLICATE
PROCESS_DUTY_LINK_NOT_FOUND
PROCESS_DUTY_LINK_REFERENCE_INVALID
PROCESS_DUTY_LINK_DUPLICATE
PROCESS_DUTY_LINK_ORDER_INVALID
DUTY_PROCESS_LINK_IN_USE
```

`DELETE_DUTY` 必須先檢查 `processNodeDutyLinks`；仍被引用時回 `DUTY_PROCESS_LINK_IN_USE` 並填入 `dutyIds/processIds/processNodeIds`，Duty、links 與 relations 全部不變。`validateApplied` 的固定順序為 `normalizeProcessPlanningState` → 既有員工／Duty normalizers → `validateOrganizationState` → `validateDutyState` → `validateProcessPlanningState`；任一失敗回 original state。

`App.tsx` 的 `organizationIssueMessage` 至少要將 `PROCESS_NOT_EMPTY`、`PROCESS_NODE_HAS_CHILDREN`、`PROCESS_NODE_CYCLE`、`PROCESS_EDGE_*`、`PROCESS_DUTY_LINK_REFERENCE_INVALID` 與 `DUTY_PROCESS_LINK_IN_USE` 映射成可採取動作的繁體中文；不得落入泛用「無法完成」作為正常可預期結果。Process 相關 command 的 issue target 固定由新工作台就地顯示，不打開 organization Inspector。

### 7.5 Route 與 URL state contract

Canonical page：`/process-planning`。

Exact module contract 為 `src/processPlanningRoute.ts`：

```ts
export const PROCESS_PLANNING_PATH = '/process-planning'
export type ProcessPlanningView = 'mindmap' | 'flow'
export interface ProcessPlanningLocation {
  active: boolean
  view: ProcessPlanningView
  processId: string | null
  processNodeId: string | null
  dutyId: string | null
}
export function readProcessPlanningLocation(location: Pick<Location, 'pathname' | 'search'>): ProcessPlanningLocation
export function normalizeProcessPlanningLocation(location: ProcessPlanningLocation, state: OrgDirectoryState): ProcessPlanningLocation
export function buildProcessPlanningUrl(location: Omit<ProcessPlanningLocation, 'active'>): string
export function canonicalProcessPlanningUrl(location: ProcessPlanningLocation, state: OrgDirectoryState): string | null
```

Canonical query 固定為：

```text
view=mindmap|flow
process=<processId>
node=<processNodeId>       optional
duty=<dutyId>             optional，必須與 selected node 有 link
```

序列化順序固定為 `view`、`process`、`node`、`duty`；空值不輸出。責任 lane、Position selection、drag state、canvas viewport、panel width 及 collapsed nodes 不進 URL，避免 reload／分享連結後自動 armed mutation。

正規化規則：

1. `/process-planning` 預設 `view=mindmap`；有 Process 時選 `order→id` 第一筆，無 Process 顯示空白狀態。
2. 未知 view 正規化為 mindmap；不存在的 process 清除其 node／duty，並改用第一筆合法 Process。
3. node 必須屬於 selected Process；duty 必須與 node 有 stable link，否則依序清除無效下游 query。
4. parser 不因資料異常建立、刪除或修補 domain；canonical URL 只用 `replaceState` 修正。
5. 人類切 view／Process／node／Duty 使用 `pushState`；連續文字輸入不進 URL。
6. browser back／forward 以 URL 為 selected context 權威，不能被 stale component effect 覆寫。
7. 切 Process、organization version、workspace mode、node、Duty 或失去 mutation capability 時，一律清除 lane／drag／hover／pending action。

### 7.6 UI Entry Contract

- Target actor：總經理、部門主管、人資／制度規劃者；一般閱讀者與手機使用者只讀。
- 正常起點：一般組織架構頁左側 `工作執掌` 清單，進入既有 `/duty-planning` 完整責任工作台。
- 可辨識入口：DEV-036 頁首增加一個次要文字動作 `流程規劃`；不在左側 242px 主資料欄增加第二個競爭工作台 icon，也不以 direct URL 或 hidden gesture 作唯一入口。
- Destination：`/process-planning?view=mindmap...`，沿用目前 organization version、workspace mode 與 read-only status。
- 返回：頁首單一 `返回責任工作台` 回到原 DEV-036 view／filters；由瀏覽器返回也須恢復。組織圖仍可由 DEV-036 原入口返回，不在 DEV-038 頁首放兩個同權重返回 CTA。
- 空資料：沒有 Process 時主畫布只顯示「尚無流程」與一個 `新增流程`；唯讀時只顯示事實，不顯示 disabled 建立控制。
- 載入／錯誤：局部顯示在受影響 canvas／bridge；不能用整頁遮罩阻擋仍可閱讀的另一側資料。

`DutyCenterProps` 增加 `onOpenProcessPlanning: () => void`；頁首 actions 順序固定為 `DocumentMenu → 唯讀工作台 → 流程規劃 → 返回組織圖`。`App.tsx` 的 `openProcessPlanningPage` 以 `history.pushState({ returnTo }, '', url)` 保存原 canonical Duty URL；`closeProcessPlanningPage` 只接受同源且以 `/duty-planning` 開頭的 `returnTo`，非法或缺少時回 `/duty-planning?view=audit`。

### 7.7 Selection 與 presentation state

| State | Owner | Persistence | 清除條件 |
| --- | --- | --- | --- |
| active view／Process／node／Duty | Route owner | URL/history | route normalization／version switch |
| Process domain data＋Duty／relation／Position | organization state | V7 workspace version | 由 organization command 更新 |
| selected lane／drag session | page composition owner | memory only | Process／node／Duty／version／capability change、Escape、drop end |
| selected Position | organization canvas owner | memory only | Process／version change、clear selection |
| mindmap／flow viewport | 各自 React Flow provider | session memory only | page unmount／version switch |
| panel width／collapsed nodes | presentation owner | session memory only | page unmount；Current Phase 不寫 V7 |

跨投影規則：

- 選 ProcessNode：高亮其 Duty links；組織圖只高亮這些 Duty 的 active relation targets。
- 選 Duty：高亮同 Process 中使用該 Duty 的所有 nodes，以及全域承擔該 Duty 的 Positions。
- 選 Position：高亮該 Position 的 Duties，再高亮 selected Process 中使用這些 Duties 的 nodes。
- unrelated nodes／Positions 降低對比但保留可選；不得 `display:none` 破壞全貌。
- 點 canvas 空白只清局部 selection，不改 domain／dirty／revision。
- 切心智圖／流程圖維持 selected Process／node／Duty，但清除 lane 與進行中的 drag。

### 7.8 圖形行為契約

心智圖：

- Process 本身作視覺 root，不另存 root ProcessNode。
- 節點由 `parentNodeId＋order` 以左到右 structured tree 排版；Current Phase 不允許自由位置保存。
- 新增 child／sibling、inline rename、drag reparent／reorder均轉為 organization command；拖動節點只改 projected position的行為不得被誤認成 domain update。
- non-leaf delete fail closed；鍵盤替代提供等價的移動 parent／order 選擇，不要求鍵盤使用者模擬 pointer drag。

流程圖：

- 使用同一 ProcessNodes，edge 只來自 ProcessEdge；parent-child edge 不顯示。
- 建立連線前檢查 same Process、self、duplicate；一般 directed cycle 允許，cycle-closing edge 以可辨識 feedback routing／marker 呈現但不新增 domain kind。
- Current Phase 不提供 edge label、condition、gateway、泳道或執行狀態。

組織圖：

- 沿用既有 Position node、reporting edge、department group、pan／zoom、drop hit target 與 DEV-034 relation resolver。
- Position node 不顯示 Duty 長文字或 ProcessNode 清單；只有 selected context 的輪廓／marker，且不能只靠顏色。
- 普通 Position click只選取／反查；只有已選 Duty＋lane 的專用 drag release 才可能 mutation。

### 7.9 API、server 與 migration impact

Current Phase 不新增 Process 專用 API。既有 workspace API 繼續 whole-document load／save：

```text
GET /api/orgmaster/workspace
GET /api/orgmaster/workspace/versions/:versionId
PUT /api/orgmaster/workspace/versions/:versionId
```

- PUT envelope、workspace mode 與 expected version revision 沿用現行契約；document 由 V7 parser／validator 驗證。
- Server 不接受 Process partial PATCH、逐 node endpoint 或 last-write-wins。
- V6 reader 以非破壞 migration 產生 memory V7；第一次成功保存才寫 V7。
- V7 invalid reference、duplicate、parent cycle、illegal order 或非法文字回傳可識別 validation code，HTTP status／client mapping沿用 workspace API 的 400／409／422 分層，不以 raw stack或泛用 500 顯示給使用者。
- 409 保留本機未存 state與 route context；提供現行既有 reload／download copy recovery，不自動 merge。
- Current Phase 沒有 production migration、DB、queue、worker 或外部 provider 依賴。

### 7.10 Permission 與 capability impact

- 不新增 governance permission。Process mutation 與其他 organization mutation 一樣，只在 `draft-edit` 或 `current-maintenance`、server ready、recovery closed 且專案手機唯讀 gate允許時出現／接受。
- Current Phase 編輯 capability 不寬於 DEV-034：至少 `1024px`、hover＋fine pointer 才提供 pointer drag；不符合時整個 DEV-038 為唯讀，不用隱藏 CSS 冒充 server authorization。
- Server 仍驗證 workspace entry active、kind／mode、V7 document與expected revision；client writable state不能取代 server／domain validation。
- Current Phase 不宣稱可信登入 principal、版本 ACL 或多人 ownership。若未來加入細粒度 Process 權限，須另案更新 governance catalog、role mapping、server enforcement 與 evidence，不得只在 UI 加 flag。

### 7.11 Failure recovery contract

| Failure | 可見結果 | 資料結果 | Recovery |
| --- | --- | --- | --- |
| 建立／改名 validation 失敗 | 就地標示 node／Process 輸入 | 零 state／history／save change | 保留輸入與焦點，修正後重試 |
| reparent 形成 cycle／跨 Process | 原節點回原位，目標顯示 rejected | 零 command commit | 重新選合法 parent |
| edge self／duplicate | 不建立 edge，來源／目標仍選定 | 零 revision | 取消或選其他目標 |
| 新 Duty＋link 任一步失敗 | 建立表面保留；不得顯示成功 Duty | Duty 與 link 都不存在 | 修正後重試／取消回原 node |
| Duty 仍被 ProcessNode 引用而刪除 | 顯示被哪些 Process／node 使用 | Duty／links／relations不變 | 逐一解除 link 後再刪 |
| capability 在 drag 中消失 | 立即取消 ghost／target／armed lane | 零 mutation | 進入合法可編輯環境再操作 |
| autosave 409 | 保留本機圖與未存標示，不顯示已儲存 | server 新 revision不被覆寫 | reload 或下載副本；不自動 merge |
| V7 load invalid | 阻擋該 version 編輯並顯示 recovery | 不 fallback／不自動清資料 | 下載／修復來源或切換合法 version |
| layout 計算失敗 | 顯示可恢復錯誤或安全 list fallback | domain data不變 | 重試 layout；不得重寫座標資料 |

## 8. 開源元件方向

Current Phase 優先沿用一套圖形引擎，降低事件、座標、縮放及可及性模型分裂：

| 用途 | 第一選擇 | 決策理由 |
| --- | --- | --- |
| 心智圖、流程圖、組織圖 | repo 現有 `@xyflow/react ^12.11.2` | 專案已使用；支援自訂 node／edge、拖放、viewport、selection，且可讓三種投影共享互動語言 |
| 第一階段自動排版 | exact `@dagrejs/dagre 3.1.1` | MIT、內建 TypeScript declarations；React Flow 官方 layout guide將 Dagre列為簡單 directed graph／tree 的低複雜度方向；Current Phase不需要ELK完整 edge routing |
| 複雜 directed layout | ELK.js（Future） | 多 port、複雜 edge routing 或大型 graph 真正需要時再導入 |
| 完整 BPMN | bpmn-js（Future） | 只有公司確定需要 BPMN 語意、匯入匯出及專業流程建模時才導入 |

不建議第一階段同時加入 Mind Elixir：它會形成第二套圖形引擎、事件模型、選取狀態與序列化格式，與現有 React Flow 組織圖增加整合成本。若 React Flow 的結構化心智圖經原型證明無法滿足人類規劃效率，再以具體差距重新評估。

參考：

- React Flow mind map tutorial：https://reactflow.dev/learn/tutorials/mind-map-app-with-react-flow
- React Flow multiple flows / provider：https://reactflow.dev/api-reference/react-flow-provider
- Dagre：https://github.com/dagrejs/dagre
- ELK：https://eclipse.dev/elk/
- bpmn-js：https://bpmn.io/toolkit/bpmn-js/

Dependency contract 已固定為在 S2 以 exact version（不使用 `^`／`~`）加入 `package.json` 與 `package-lock.json`：`"@dagrejs/dagre": "3.1.1"`；不安裝 `@types/dagre`。2026-08-27 盤點 metadata 為 MIT、內建 `./dist/types/index.d.ts`、unpacked size 約 1.41 MB，transitive dependency 為 `@dagrejs/graphlib 4.0.5`。實作前後以 Vite build report 記錄 gzip JS delta，Current Phase gate 為 `<= 100 KiB gzip`；250 nodes／400 edges、20 次 layout benchmark 的 p95 gate 為 `<= 150ms`。任一 metadata、typecheck、bundle 或 benchmark gate 不通過時，不升級 ELK、不留下半安裝 dependency；改用 `src/processPlanningLayout.ts` 內的 deterministic rank／tree fallback，仍須滿足相同 layout tests。

來源於 2026-08-27 重新查證的 React Flow 官方文件：React Flow 本身不內建 layout，官方列出 Dagre／D3／ELK 並將 Dagre描述為適合 tree 的簡單方案；ELK 功能較多但複雜度較高。這只支持 layout 技術選擇，不證明 OrgMaster UX 已通過。

## 9. Current Phase：Minimum Viable Slice

Execution Boundary：本 phase 已授權 RD 依第 14 節 allowlist 與 S0→S6 做本機產品修改、測試及 localhost browser QC；未授權 Future Phase、真實公司資料破壞、production migration、deploy 或 release。當前 dirty worktree 的 `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、DEV-038 spec 與 ADR-008 是 PM 文件邊界，RD 不得覆寫或回復。

第一階段只做能驗證規劃模型是否成立的最小能力：

- 一個正式 URL 的流程－職掌－責任聯動工作台與正常 UI 入口。
- Process 清單及單一 Process 編輯 context；支援建立、更新與刪除空 Process，不建立 archive／publish lifecycle。
- 同一組 ProcessNode 的心智圖／流程圖切換。
- 心智圖：結構化 parent-child 投影與節點新增；改名、reparent、排序、session 折疊及 leaf delete 先以 domain command 固定，完整編輯控制項列為下一個 UI slice。
- 流程圖：同節點的簡單 next-step edge 投影；edge 新增／刪除 command 已固定，視覺化編輯控制項列為下一個 UI slice。
- ProcessNode 與既有 Duty 的多對多連結，以及從原節點建立新 Duty 後回填連結。
- 中央橋接欄顯示所選節點的 Duty 與四種責任 lane。
- 選定 Duty＋lane 後，中央 lane button 產生既有 `DutyConfigurationDragPayload`，可原生拖到右側密集 Position 投影清單；點擊 Position 後仍可用 lane button 完成後備配置，並提交同一 relation command。
- ProcessNode／Duty／Position 使用同一 planning context；MVP 提供選取與 drop 結果提示，完整三向畫布高亮列為下一個 UI slice。
- 桌面編輯、手機唯讀；一人操作、多人討論。
- 最小資料完整性提示：未連 Duty 的節點、無執行職位、缺主執行、待重新分配；不新增健康分數。

## 10. Out of Scope

- AI 自動拆流程、AI 自動連 Duty、AI 推薦或指定 Position。
- BPMN gateway／event／timer／condition／subprocess、泳道執行引擎、表單流轉或流程自動化。
- 同一 Duty 在不同 ProcessNode 的 process-scoped 責任 override。
- 工作量、產能、績效、健康分數、風險排名、人力需求或適任判斷。
- 即時多人共編、游標、留言、投票、版本合併或會議白板。
- 永久顯示全部跨畫布 edge、3D 視圖或自動縮成全圖。
- 手機／觸控窄版 mutation。
- 管理辦法正文智能引用；DEV-032 仍維持自由多媒體文件及人類語意編輯。
- 正式 ISO 文件核准、流程發布、簽核、教育訓練、流程執行紀錄或稽核生命週期。
- deploy、release 或 production migration。

## 11. 驗收方向

1. 使用者可從正常 UI 進入工作台；只知道 direct URL 不算通過。
2. 同一 ProcessNode 在心智圖與流程圖使用相同 identity；任一視角改名後另一視角立即一致，且 parent-child 與 next-step 不互相改寫。
3. 選取 ProcessNode 後，中央欄只顯示該節點已連結 Duty；可連結既有 Duty，取消或失敗不留下半成品 link。
4. 選定 Duty＋exact lane 後才能拖到 Position；相同 relation、primary transfer、pending、Undo／Redo、409／CAS 及 rejected recovery 遵守 DEV-034，不建立第二套 mutation 語意。
5. 點 ProcessNode、Duty 或 Position 能交叉高亮相鄰物件；未相關物件降噪但仍可看見，清除選取可恢復全貌。
6. 未選 ProcessNode 時中央欄收合；三區不以永久大型 modal、drawer 或遮罩蓋住主要畫布。
7. Position node 不常駐塞入完整 Duty 文字；流程 edge、組織 reporting edge 與跨領域 link 不會同時形成不可讀蜘蛛網。
8. 只有 leaf ProcessNode 可刪；成功時只影響自身 edge／ProcessNodeDutyLink，不刪除共用 Duty、DutyPositionRelation、Position 或 Employee。被 Process link 引用的 Duty 必須阻擋刪除並提供解除路徑。
9. 手機可唯讀切換流程、職掌與組織關聯，且零 drag、save、create、edit、delete 或 relation mutation 控制。
10. 正常、空 Process、未連 Duty、無 Position、invalid reference、保存衝突、reload、browser back／forward 及窄 viewport 都有可恢復狀態，沒有白屏、資料靜默遺失、假成功或 visible 4xx／5xx。

## 12. 驗證完整性方向

| Acceptance / risk | Normal delivery path | 允許 fixture | 禁止捷徑 | 後續必要證據 |
| --- | --- | --- | --- | --- |
| 正常入口可發現 | 組織圖→工作執掌→責任工作台→流程規劃 | 可使用已有 Duty 的 V7 draft | 只貼 direct URL | 起始畫面、兩次導航、destination URL 與 viewport |
| 流程→Duty→Position 完整鏈 | 正常入口→建節點→連 Duty→選 lane→原生拖到 Position | 可建立父 Process／Duty／Position 前置資料 | 直接寫預期 relation、只測 pure helper | 操作紀錄、前後 V7 state、browser screenshot |
| 雙投影一致 | 心智圖改名／reparent→流程圖建 edge→reload | 可 seed 已知 ProcessNodes | 只比較 component props | 同一 node id 的兩視角、URL、reload 與 V7 document |
| 不複製 Duty | 節點連結既有 Duty→由 Duty 反查多節點 | 可 seed 重複使用情境 | 以 title 字串比對冒充 stable link | stable IDs、引用與畫面交叉高亮 |
| 共用 relation authority | DEV-038 drop→DEV-036 盤點／分布查看 | 可用既有 DEV-034 relation fixture | 另建 mock planning relation store | 同 revision 的 DEV-038／034／036 對照 |
| V6→V7 migration | 正常載入 V6 workspace→記憶體升級→第一次合法保存→reload | 可用 immutable V6 bytes fixture | 直接建立 V7、覆寫 V6來源 | source hash、空四集合、V7 save/reload、其他 V6資料不變 |
| referential delete guard | 從正常 Duty 明細刪除仍被 link 的 Duty | 可 seed 一個 ProcessNodeDutyLink | 只呼叫 validator | 可見引用原因、零 state／revision、解除 link 後成功路徑 |
| fail-seeking recovery | parent cycle、duplicate edge、atomic Duty＋link failure、409、capability mid-drag loss | 可注入可還原測試資料 | 只測 happy path或修改 QC 資料取得通過 | 可見錯誤、資料未變、焦點／context 恢復 |
| Keyboard／accessibility | 正常入口→node選取／新增／reparent替代→Duty／lane→Position drop替代 | 可使用同一 editable fixture | 只檢查 aria source | focus順序、accessible name、live state、reduced motion與結果 |
| RWD／手機唯讀 | 1440×900 及 1280／1279、1024／1023 相鄰邊界、390×844 正常入口 | 同一 read-only fixture | 只看 CSS source或桌面縮圖 | 三欄／單畫布切換／唯讀模式 screenshots、mutation absence、selection continuity、overflow／雙捲動／遮擋 sweep |

Evidence provenance 至少記錄：source revision／artifact、organization version ID與revision、V6或V7 fixture、workspace mode、角色／能力狀態、route、viewport、browser、操作步驟、預期／實際結果與 screenshot／state artifact。Build、unit、API、direct URL與 UI evidence 各自只支持其實際層級；任一可見 `.inline-error`、`role=alert` failure、HTTP 4xx／5xx、預期非空資料卻全零或 console error 都是 QC fail／reopen。

## 13. 主要風險與停止條件

- 若 RD 必須複製 Duty、Position 或 DutyPositionRelation 才能完成畫面，停止並回 PM。
- 若 RD 提議建立 Process 專用 store、revision、autosave、API 或雙寫，視為偏離 ADR-008，停止並回 PM。
- 若同一頁兩個 React Flow store 互相污染 viewport、selection 或 keyboard，停止並修正 provider／state owner 邊界。
- 若使用者必須同時看三種 edge 才能完成任務，先用真實任務原型驗證；不得直接增加永久跨畫布連線。
- 若 process-scoped responsibility 成為第一階段必要條件，視為新資料語意與 transaction boundary，須另行決策，不得偷塞欄位。
- 若拖放、建立 Duty 或節點刪除不能提供鍵盤替代與明確失敗恢復，該 slice 不得完成或進入 browser QC。
- 若實作要求修改 DEV-036 成為第二套 relation editor，停止做 interaction／transaction impact review。

## 14. RD Implementation Handoff

### 14.1 Readiness 結果與 repo baseline

結論：`Ready`，P0／P1 readiness blocker 為 `0`。2026-08-27 盤點 baseline 為 React 19、TypeScript 7、Vite 8、Vitest 4、Zod 4、`@xyflow/react ^12.11.2`；root `src/main.tsx` 已有一個 organization `ReactFlowProvider`，`App.tsx` 已擁有 `runOrganizationCommand`、history、autosave、workspace mode、route owner 與既有 organization canvas。RD 不抽離或重寫組織圖；DEV-038 只在現有 composition 中新增流程工作區。

Readiness baseline 已實際執行：`npx tsc --noEmit` pass；目前 targeted DEV-038／相關測試為 `12 files／40 tests` pass；全量 `npm test -- --testTimeout=30000` 為 `128 test files／565 tests` pass；`npm run build` pass，現行 client JS 為 `1,222.07 kB／368.67 kB gzip`。既有 Vite native config extension warning 及 `>500 kB` chunk warning 列為 baseline warning，不是 DEV-038 failure；Dagre bundle delta 與 benchmark gate 仍須在正式 QA 證據中保存。MVP 已在本機 worktree 可 smoke，尚未 release。

本文件變更時 worktree 已有以下 PM 文件異動，全部視為 user／PM-owned boundary：`ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、本 spec、ADR-008。RD 實作不得 reset、checkout、覆寫或混入無關格式化。開始 S0 前及每個 slice 完成時保存 `git status --short`；若出現 allowlist 外 production file，立即停止。

### 14.2 Required production file allowlist

| 類別 | Exact file | 允許變更 |
| --- | --- | --- |
| dependency | `package.json`、`package-lock.json` | S2 只加入 exact Dagre 3.1.1；fallback 時兩檔不得留下 Dagre |
| domain | `src/types.ts` | 新增四型別及 `OrgDirectoryState` 四個 required arrays |
| domain | `src/processPlanning.ts`（new） | factory、normalizer、validator、selectors、highlights |
| domain | `src/organizationCommands.ts` | union、issue shape、commands、delete guard、validation chaining |
| persistence | `src/documentStorage.ts` | V7 schema、keys、V1～V7 parser、V6→V7 migration／recovery |
| seed | `src/screenshotData.ts` | 四個空集合；不假造正式 Process |
| route/capability | `src/processPlanningRoute.ts`、`src/processPlanningCapability.ts`（new） | canonical URL、module-scoped default-deny capability |
| layout | `src/processPlanningLayout.ts`（new） | mindmap／flow deterministic projection；Dagre 或 contractual fallback |
| UI | `src/components/ProcessPlanningWorkbench.tsx`、`src/components/ProcessPlanningCanvas.tsx`、`src/components/ProcessDutyBridge.tsx`（new） | 新工作區、nested provider、canvas、bridge、keyboard alternative |
| UI integration | `src/App.tsx` | route／selection owner、left-middle composition、existing organization canvas reuse、command wiring |
| UI entry | `src/components/DutyCenter.tsx` | `onOpenProcessPlanning` prop 與次要文字入口 |
| UI projection | `src/components/OrgNode.tsx` | process related／dimmed marker；不顯示 Duty 長文字 |
| style | `src/index.css` | DEV-038 scoped classes、1280／1024／mobile boundaries、print 無關 |
| workspace client | `src/serverWorkspaceStorage.ts` | 422 `reason` 轉為可識別 recovery message；其他 API contract 不變 |
| local legacy API | `server/orgmasterApi.ts` | `v7` path、V7-first／V6 fallback、成功保存只寫 V7 |
| workspace server | `server/orgmasterWorkspaceStore.ts`、`server/orgmasterApi.ts` | 僅 whole-document V7 validation／422 mapping；不得新增 Process route |

Required new test files（正式完成前仍須補齊 UI component harness）：

```text
src/processPlanning.test.ts
src/processPlanningRoute.test.ts
src/processPlanningCapability.test.ts
src/processPlanningLayout.test.ts
src/organizationCommands.process.test.ts
src/serverWorkspaceStorage.test.ts
src/components/ProcessPlanningWorkbench.test.tsx
```

Allowed existing behavioral tests：`src/documentStorage.test.ts`、`src/organizationCommands.test.ts`、`src/organizationCommands.duty.test.ts`、`src/dutyConfiguration.test.ts`、`src/dutyConfigurationDrag.test.ts`、`src/dutyPlanningRoute.test.ts`、`server/orgmasterApi.test.ts`、`server/orgmasterWorkspaceStore.test.ts`。因 `OrgDirectoryState` 新增 required arrays，其他 `src/**/*.test.ts`／`server/**/*.test.ts` 只允許補四個空 fixture 欄位或改用共同 fixture factory，不得順手改變既有斷言語意。

### 14.3 Forbidden production boundary

- 禁止修改 `src/main.tsx`；root provider 繼續只服務既有 organization canvas，流程 canvas 在新 component 內自帶 nested provider。
- 禁止修改 `src/dutyConfigurationDrag.ts`、`src/dutyConfiguration.ts`、`src/dutyPlanning.ts` 的責任配置語意；DEV-038 直接重用 `DutyConfigurationDragPayload`、MIME、state machine 與 assign-only resolver。
- 禁止改寫 `DirectoryDock`、DEV-036 audit／distribution table、Management Method、governance schema／snapshot、workspace manifest V1、外部 AI-PDM 或管理辦法 store。
- 禁止新增 Process REST endpoint、Process store、Process revision、第二 autosave、DB／worker／queue、ELK、bpmn-js、Mind Elixir 或即時多人套件。
- 禁止把 ProcessNode ID、流程名稱或員工姓名寫進 `DutyPositionRelation`，禁止保存 node `x/y`、viewport、selection、lane 或 panel width。
- 禁止修改或刪除現有 `data/orgmaster-document.v6.json`；只有使用者在產品中完成第一次合法保存時，server 才產生 V7 檔。
- 禁止 deploy、release、production migration、真實公司檔案批次轉換或建立未經使用者確認的預設 Process。

### 14.4 Exact domain/module symbols

`src/processPlanning.ts` 必須導出：

```ts
export type ProcessPlanningCollections = Pick<OrgDirectoryState,
  'processes' | 'processNodes' | 'processEdges' | 'processNodeDutyLinks'>
export type ProcessPlanningValidationCode = /* 第 7.4 節固定 codes */
export type ProcessPlanningValidationResult =
  | { ok: true }
  | { ok: false; issue: {
      code: ProcessPlanningValidationCode
      processIds: string[]
      processNodeIds: string[]
      dutyIds: string[]
    } }
export interface ProcessPlanningSelection {
  processId: string | null
  processNodeId: string | null
  dutyId: string | null
  positionId: string | null
}
export interface ProcessPlanningHighlights {
  processNodeIds: Set<string>
  dutyIds: Set<string>
  positionIds: Set<string>
}
export function createEmptyProcessPlanningCollections(): ProcessPlanningCollections
export function normalizeProcessPlanningState(state: OrgDirectoryState): OrgDirectoryState
export function validateProcessPlanningState(state: OrgDirectoryState): ProcessPlanningValidationResult
export function resolveProcessPlanningHighlights(state: OrgDirectoryState, selection: ProcessPlanningSelection): ProcessPlanningHighlights
```

Normalizer 對 title／description 使用 trim 並把連續 whitespace 壓成單一空白，空 description 轉 `null`；再以 `order → id` 排序並依 scope 重編連續 `0..n-1`：Process 全域、ProcessNode 的 `(processId,parentNodeId)` siblings、ProcessNodeDutyLink 的 `processNodeId` links。Normalizer 不刪 orphan、不修 cycle、不猜 reference；這些由 validator fail closed。flow cycle 合法，parent cycle 非法。

`src/processPlanningCapability.ts` 必須導出與 DEV-034 相同 default-deny inputs 的 `ProcessPlanningCapabilityEnvironment`、`canMutateProcessPlanning`、`announceProcessPlanningCapability`。writable 必須同時滿足 editing、serverReady、recovery closed、非 mobileReadOnly、`viewportWidth >= 1024`、hover、fine pointer；任一由 true→false 時 `App` 清 lane／drag／pending action。

`src/processPlanningLayout.ts` 必須導出 `ProcessPlanningLayoutMode = 'mindmap' | 'flow'`、`ProcessPlanningLayoutNode`、`ProcessPlanningLayoutEdge` 與 `layoutProcessPlanningGraph(input)`。同一 input 必須產生相同 node positions／edge order；mindmap 只用 parent，flow 只用 ProcessEdge。失敗回 typed error／safe list projection，不得 mutate domain。

### 14.5 Exact component/state wiring

```text
src/main.tsx ReactFlowProvider                  ← 不修改，既有組織圖 store
└─ App                                         ← route/domain/common selection owner
   └─ main.workspace.is-process-planning
      ├─ ProcessPlanningWorkbench
      │  ├─ ReactFlowProvider                  ← 新增，只服務 mindmap／flow canvas
      │  │  └─ ProcessPlanningCanvas
      │  └─ ProcessDutyBridge
      └─ div.canvas-wrap                       ← 原 App organization ReactFlow 原封重用
```

`ProcessPlanningWorkbenchProps` 目前接收 `state`、normalized `location`、`editingEnabled`、`serverReady`、`recoveryOpen`、`mobileReadOnly`、`onNavigate`、`onCommand`、`onClose`；由 `canMutateProcessPlanning` 在元件內計算 `writable`，不接第二份 Position truth。`ProcessPlanningCanvasProps` 只接 Process 投影與 selection callback。`ProcessDutyBridgeProps` 從 `state`＋selected node selector 讀 linked Duties；lane button 可點擊配置，也必須建立既有 `DutyConfigurationDragPayload version:1` 供右側 Position drop。

`App.tsx` 新增 `processPlanningLocation`、`selectedProcessLane`、`selectedProcessPositionId` 與既有 `dutyDragState` 的協調；`runOrganizationCommand` 仍是 commit owner。當 route active：

1. route active 時由 `App.tsx` 提供 `ProcessPlanningWorkbench`，以完整 URL page 呈現，不使用 overlay。
2. MVP 主畫布使用新 nested `ReactFlowProvider` 的 Process canvas；右側以部門／Position 密集投影清單作 drop target，既有 `.canvas-wrap` 仍是組織資料與 reporting line 權威，不複製 relation truth。
3. `viewport >= 1024` 且 capability 通過時可編輯；`<1024` 或 capability 不足時工作台唯讀並隱藏 mutation controls。完整 1024～1279 segmented canvas 切換待下一個 UI slice。
4. Position click 只更新 workbench 的 `selectedPositionId`；drop 成功則依 payload 選取 Duty 與 Position，不打開一般 Inspector。
5. MVP 不修改 `OrgNodeData`，Position 投影以文字與責任筆數呈現；長 Duty 文字不塞入組織節點。完整 cross-canvas highlighting 待下一個 UI slice。
6. view 切換保留 Process／node／Duty；drop notice 在下一次操作時更新，route／version 離開後由 workbench unmount 清除本地 selection。

Keyboard alternative 不模擬 pointer：橋接欄的 Duty lane 按鈕以 Space／Enter 進入 `keyboard-grabbed`，organization canvas 以既有 Position focus traversal 選 target，Enter commit、Escape cancel；建立 child／sibling、reparent／reorder、edge create／delete均有按鈕或 menu 等價路徑。

### 14.6 V6→V7 exact migration/recovery

- `ORG_DOCUMENT_VERSION = 7`；local keys 改為 `.v7`，原 `.v6` constants 以 `LEGACY_V6_*` 名稱只讀保留。
- `ParseOrgDocumentResult.sourceVersion` exact union 擴為 `1 | 2 | 3 | 4 | 5 | 6 | 7`。
- `DocumentFailureCode` union 加入 `ProcessPlanningValidationCode`；`ParseOrgDocumentResult` failure 與 `LocalDocumentLoadResult.failed` 除既有 `positionIds/departmentIds` 外，增加 `dutyIds/processIds/processNodeIds`。legacy／storage I/O failure 填空陣列，Process validator failure填 exact references。
- `OrgDirectoryStateV6 = Omit<OrgDirectoryState, 'processes' | 'processNodes' | 'processEdges' | 'processNodeDutyLinks'>`；V6 parser 成功後呼叫 `addEmptyProcessPlanning`，只加四個全新空陣列。
- `createOrgDocumentFile` 依序 canonicalize legacy parent、Duty、Process，再輸出 V7；V7 round-trip 不得更改 stable ID、parent、edge 或 link。
- localStorage／recovery 讀取順序為 V7 → V6 → 既有更早版本；讀到 V6 不覆寫來源 key，只有成功保存才寫 V7 key。
- `getOrgMasterDocumentPaths` 增加 `v7: data/orgmaster-document.v7.json`；`readStoredDocument` V7-first 再 fallback V6→V2，`writeStoredDocument` 只寫 V7。
- workspace manifest 維持 V1；workspace version document parser 自然接受 V1～V7，PUT invalid Process 回既有 `VERSION_INVALID`／HTTP 422，revision mismatch 保持 409。
- `WorkspaceStoreError` 不新增另一套 error class；`readVersion` 維持 `code='VERSION_INVALID'` 並以 parser code 作 `message`。`workspaceError` 對 422 固定回 `{ error: 'VERSION_INVALID', reason: <DocumentFailureCode> }`，其他 status payload 不變，前端不得顯示 raw stack。
- DEV-020 目前已移除版本比較 UI，故 Current Phase 無 comparator source change；未來恢復比較前，Process 集合明確不進 compare projection。
- governance snapshot builder 已 explicit 選 Employee／Department／Role／Position／Assignment；不得因 `OrgDirectoryState` 新欄位改為 whole-state spread，Process 不進治理 snapshot。

Required fixtures：合法 V6、合法 V7、V7 orphan Duty link、parent cycle、cross-Process parent／edge、duplicate edge、duplicate node＋Duty pair、illegal order、V6 local key recovery、V7 local key precedence、V6 server file fallback、V7 save／reload、workspace 409。每個 invalid fixture 都要證明來源 bytes／server revision／client state沒有被靜默改寫。

### 14.7 S0→S6 implementation slices

| Slice | Entry | 內容 | Exit gate |
| --- | --- | --- | --- |
| S0 Baseline | 已通過 | fresh typecheck、full tests、build 與 dirty boundary 已記錄 | 結果可重現；目前無新增 baseline failure |
| S1 Domain＋V7 | 已通過 | types、processPlanning validator／normalizer、commands、delete guard、V7 local／workspace migration | targeted domain/storage/server pass；V6 bytes preservation、V7 round-trip、409 pass |
| S2 Layout dependency | 已通過（MVP） | Dagre 3.1.1、deterministic layout 與保守 fallback 已落地；正式 bundle／benchmark evidence 待補 | layout unit pass；正式 gzip delta／250 node benchmark 仍是 QA gate |
| S3 Route＋read-only composition | 已通過（MVP） | canonical route、正常入口、nested provider、empty／read-only composition 已落地 | route／capability tests pass；browser route smoke pass |
| S4 Process editing | 進行中 | Process／node 基本建立 UI 已有；改名、reparent、排序、edge 與 keyboard controls 待補 | command＋component tests；no-op/reject 零 history／dirty，mindmap／flow identity pass |
| S5 Duty bridge＋organization linkage | 進行中 | link／atomic create、四 lane、native drag 到 Position projection、click fallback 已有；完整 organization canvas reuse、keyboard placement、三向高亮待補 | DEV-034 regression＋native drag＋keyboard placement；latest-state release revalidation pass |
| S6 Full QA/QC handoff | 尚未開始 | full regression、build、API negative、六 viewport browser QC、evidence／cleanup | 第 14.8 全 gate pass；才可標 Implementation Complete，不代表 release |

禁止平行跳片：S1 未通過不可開始 UI；S3 未證明兩個 provider 不互相污染不可開始 cross-canvas mutation；S5 未過 native drag 與 keyboard alternative 不可結案。

### 14.8 Executable QA／QC matrix

Automated commands（PowerShell，repo root）：

```powershell
npx tsc --noEmit
npm test -- --testTimeout=30000 src/processPlanning.test.ts src/processPlanningRoute.test.ts src/processPlanningCapability.test.ts src/processPlanningLayout.test.ts src/organizationCommands.process.test.ts src/documentStorage.test.ts src/organizationCommands.duty.test.ts src/dutyConfiguration.test.ts src/dutyConfigurationDrag.test.ts src/dutyPlanningRoute.test.ts src/serverWorkspaceStorage.test.ts server/orgmasterWorkspaceStore.test.ts server/orgmasterApi.test.ts
npm test -- --testTimeout=30000 src/components/ProcessPlanningWorkbench.test.tsx
npm test -- --testTimeout=30000
npm run build
$env:ORGMASTER_LAYOUT_BENCHMARK='1'
try { npm test -- --testTimeout=30000 src/processPlanningLayout.test.ts }
finally { Remove-Item Env:ORGMASTER_LAYOUT_BENCHMARK -ErrorAction SilentlyContinue }
```

S2 還須保存 Dagre 前後 `npm run build` 的 JS gzip bytes、`npm ls @dagrejs/dagre @dagrejs/graphlib`、license／type metadata 與 benchmark結果；fallback 時保存拒絕理由並證明 package／lockfile 無殘留。

Browser normal delivery path：`/` → 左側工作執掌 → DEV-036 → `流程規劃`；direct URL 只作 route recovery 測試，不可取代可發現性。最少測試 `1440×900`、`1280×800`、`1279×800`、`1024×768`、`1023×768`、`390×844`，覆蓋：

1. 新增 Process／child／sibling、改名、reparent／reorder、leaf／non-leaf delete及 Undo／Redo。
2. mindmap／flow 切換 identity、edge create／delete、feedback edge、selection persistence。
3. 連既有 Duty、原子建立 Duty＋link、取消／invalid、不重複主檔、link delete不刪 Duty。
4. actual HTML5 `dataTransfer` Duty＋exact lane drop、noop／invalid／primary transfer／pending recovery，以及 capability mid-drag loss。
5. keyboard grabbed → Position traversal → Enter／Escape；focus visible、accessible name、live result、reduced motion。
6. ProcessNode／Duty／Position 三向高亮；Position 不出現長 Duty 文，未相關資料保留。
7. V6 load→memory V7→首次 save V7→reload、workspace 409、invalid V7 recovery、browser back／forward。
8. 兩 canvas 分別 pan／zoom／fitView，不互改 viewport；1280／1279 composition 切換不清 selection。
9. 手機及 1023 boundary 零 mutation control、零 draggable、零 save action；所有 viewport 無水平 overflow、雙 scroll owner、遮擋、白屏或不可回復焦點。

若啟動 `npm run dev:local`，依專案 AGENTS 規則先記錄 project、purpose、port 5000、owning process tree 與 cleanup condition；QC 結束只停止該 task-owned tree，並確認 port 5000 已釋放。若已有可安全重用的同 project runtime，記錄 owner 並不另開。證據根目錄固定為 `output/playwright/dev038/`，`manifest.md` 必須列 source commit／dirty boundary、organization version／revision、fixture version、route、viewport、browser、步驟、預期／實際、console、HTTP、screenshot、state artifact及 runtime cleanup。

Hard fail：任何 `.inline-error`／`role=alert`、非預期 HTTP 4xx／5xx、console error、預期非空卻全零、資料被靜默正規化、invalid/noop 產生 history／dirty、未釋放 task-owned runtime，均不得標 QA／QC Passed。

### 14.9 RD 停止／回 PM 條件

以下不是待決問題，而是偏離契約時的 stop conditions：需要 allowlist 外 production file、改 ADR-008、Process partial API／第二 revision、process-scoped responsibility、BPMN／AI 自動配置、持久座標、複製 Duty／Position、修改治理 snapshot authority、Dagre gate 失敗卻想升級 ELK，或無法提供 keyboard equivalent。沒有觸發時 RD 不需再詢問工程選項，直接依 S0→S6 執行。

## 15. Future Phase Capsule

狀態：`Future Phase Captured / Not Requested`。

- 依真實試用加入流程群組、跨部門泳道、節點風險／輸入輸出、RACI 延伸或流程版本比較。
- Process-scoped Duty responsibility override，僅在同一 Duty 的全域責任確實無法表達真實情境時啟動。
- AI 輔助找遺漏節點、重複 Duty、斷線、可能交接風險或草擬流程；所有永久變更仍需人類確認。
- ELK.js 大型流程排版或 bpmn-js 專業 BPMN；需有真實 graph／交換格式需求，不因預留架構先加入。
- 即時多人共編、討論、決策紀錄與流程核准；需另行定義 identity、lease、merge、audit 與 notification。
- 管理辦法連到 Process／Duty 的穩定語意 reference；只有 DEV-032 另案重新核准正文智能引用與刪除規則後才可進入。

## 16. 變更紀錄

- 2026-08-27：補入 MVP 實作收斂紀錄。已落地 V7 domain／migration、Dagre layout、`/process-planning` 正常入口、雙視角切換、Process 清單／節點建立、Duty link、四 lane click／native drag、Position drop projection、422 `reason` recovery message；`npx tsc --noEmit`、targeted `12 files／40 tests` 與全量 `128 files／565 tests` pass，`npm run build` pass（`1,222.07 kB／368.67 kB gzip`）。狀態仍為 `RD Implementation Ready / MVP Implementation In Progress / QA-QC Pending`：完整 Process 編輯控制項、既有組織 React Flow 同頁重用、keyboard placement、三向高亮、六 viewport evidence 與 component harness 尚未完成；未 deploy／release。
- 2026-08-27：依使用者要求完成 RD Readiness Review，升級為 `RD Implementation Ready / RD Not Started`。以現況 repo 固定 exact V7 types／commands／validation codes、V6→V7 local／workspace migration、route／props／雙 React Flow provider wiring、required／forbidden files、Dagre 3.1.1 license／type／bundle／benchmark gate與 deterministic fallback、S0→S6、automated／API／native drag／keyboard／六 viewport evidence及 runtime cleanup。Readiness baseline 為 typecheck、`122 test files／553 tests`、build pass，JS `345.34 kB gzip`；P0／P1 blocker 為 0。本輪只修改開發文件，未修改產品程式、測試、資料、dependency、deploy 或 release。
- 2026-08-27：升級為 `RD Contract Ready`。以 ADR-008 固定 OrganizationDocument V7 單一資料權威與 V6→V7 migration，不建立獨立 Process store／API／revision；補齊 command／transaction、route／URL、正常入口、selection owner、viewport、capability、失敗恢復、刪除參照保護與 High-risk evidence contract。仍未固定 repo file allowlist、exact symbols、implementation slices、dependency lockfile 或 executable test commands，因此尚非 `RD Implementation Ready`；本輪未修改產品程式、測試、資料、dependency、deploy 或 release。
- 2026-08-27：依使用者確認的「心智圖＋流程圖＋組織架構圖」上帝視角方向建立 DEV-038 `Brief Ready`。固定 ProcessNode↔Duty↔DutyPositionRelation↔Position 資料鏈、同節點雙投影、中央 Duty 橋接欄、由左向右配置、React Flow＋Dagre 優先方向、DEV-034／036 相容邊界、Minimum Viable Slice、驗收與 future capsule；本輪未修改產品程式、測試、資料、dependency、deploy 或 release。
