# DEV-036：雙視角責任規劃完整工作台

狀態：`RD Implementation Complete / QA-QC Passed / Human Confirmed Minimum Viable Dual-Perspective Scope / Local Release Gate Pending`

文件角色：DEV-036 Current Phase 的 RD／QA／QC 權威工程契約。產品目的與決策摘要仍由 `ai-doc/dev_task.md#dev-036雙視角責任規劃完整工作台` 管理；本文固定可直接派工的 route、state、projection、component、file boundary、failure recovery 與 verification contract。

來源：`USER-2026-08-26-DUTY-DUAL-PERSPECTIVE-WORKBENCH`

父任務：DEV-029、DEV-031、DEV-034

取代範圍：本文只 intentional replace DEV-031 對 future `/duty-planning*` composition 的舊方向；不回寫 DEV-031 歷史完成事實，也不取代 DEV-034 的組織圖快速配置與 relation mutation 權威。

## 0. Readiness 結論

本文件已達 `RD Implementation Complete`。Current Phase 的產品選擇、正常入口、route schema、URL canonicalization、state owner、projection invariants、元件責任、repo file boundary、分片順序、失敗恢復、驗證矩陣與停止條件均已實作並完成驗證。

Current Phase 唯一可實作的產品形態如下：

1. canonical `/duty-planning` 是一個唯讀分析工作台，第一版同時提供 `責任盤點`、`責任分布` 兩個正式視角。
2. 第一輪採 Minimum Viable Slice：責任盤點只做 Duty 搜尋、三種既有 anomaly 複選、列表與單筆 Drawer；責任分布只做 Position／部門文字搜尋及四類責任數量表。
3. 需要配置時，使用者由工作台導回 `/?mode=duty-config&duty=<dutyId>`，並在 DEV-034 現有組織圖流程完成異動。
4. 工作台與 DEV-034 只讀取同一份 organization state；不得增加第二套 store、draft、autosave、CAS、API 或 server persistence。
5. 責任數量只表示 relation 分布，不代表工作量、績效、風險或人力負荷。

本文件的 Current Phase 實作與 QA／QC browser gate 已完成；尚未授權 deploy／release。進階 Future Phase 仍不得視為已實作。

## 1. 現行程式事實與差距

### 1.1 可沿用事實

| 區域 | 現行事實 | Current Phase 用法 |
| --- | --- | --- |
| `src/duties.ts` | 已有 `no-executor`、`missing-primary-executor`、`pending-reassignment` 三種 anomaly，且 legacy collaborate 會 canonicalize | 直接投影，不新增 anomaly |
| `src/dutyPlacement.ts` | 已能把 relation 映射為 `primary-execute`、`collaborate`、`review`、`countersign` | 作為兩視角唯一 lane 分類規則 |
| `src/dutyConfiguration.ts` | DEV-034 已有正式 lane labels 與 assign-only mutation resolver | 工作台只沿用 label；不得呼叫 resolver |
| `src/dutyPlanningRoute.ts` | 已辨識 `/duty-planning`、`/matrix`、`/anomalies` 與 `focusPositionId` | 升級為 canonical view／filter parser，保留 legacy alias |
| `src/dutyPlanningPresentation.ts` | 已有 position 排序與舊 matrix／anomaly projection helpers | 在同檔新增兩個純投影，不另建資料權威 |
| `src/components/DirectoryDock.tsx` | `DirectoryPanel` header 已支援 `headerAction` | 加入正常、可見的 `工作台` 入口 |
| `src/components/DutyDetailDrawer.tsx` | 已有 Duty metadata／relation 閱讀與編輯表面 | 以 read-only 模式沿用，footer 增加導回配置 action |
| `src/components/DutyCenter.tsx` | 已是 duty planning page shell | 收斂為 URL-controlled 雙視角 shell |

### 1.2 必須修正的差距

1. `src/App.tsx` 現行 effect 會把所有 `/duty-planning*` 立即 `replaceState` 到 duty configuration；若不移除，完整工作台永遠無法成為正式頁面。
2. 現行 `openDutyPlanningPage(...)` 沒有可由使用者在正常 UI 發現的入口；direct URL 不算完成。
3. `DutyPlanningWorkbench` 仍是舊版 drag／mutation composition，且沒有真正依 `surface` 呈現兩個獨立視角；Current Phase 必須改為唯讀 view composition。
4. `DutyMatrixView` 只有 execute／review 兩個聚合欄且包含拖曳，無法直接滿足主執行／協作／審核／會簽四欄責任分布。
5. `DutyCenter` 仍保留 create、global matrix filters 與舊 local state ownership；必須移除完整工作台的 mutation controls，將 active view／有效篩選交給 route state。
6. 現行 route tests 只覆蓋基本 path／focus；尚未固定 alias、非法 query、dedupe、canonical ordering 與 browser history。

以上是 implementation gap，不是新產品 blocker。

## 2. Current Phase 產品與行動邊界

### 2.1 三層表面分工

| 表面 | 核心任務 | 允許行動 | 禁止行動 |
| --- | --- | --- | --- |
| DEV-034 左側工作執掌清單＋組織圖 | 單一 Duty 快速配置 | 選 Duty、選 lane、拖到 Position、明確移除 relation | 全局分析塞入 242px panel |
| Duty Drawer／Inspector | 單一 Duty 明細閱讀 | 在 DEV-034 可依既有 capability 編修；在 DEV-036 只讀 | 在 DEV-036 直接 mutation |
| DEV-036 `/duty-planning` | 跨 Duty／Position 盤點與比較 | 搜尋、篩選、展開、Drawer、導回配置 | create／edit／delete／assign／transfer／remove relation |

### 2.2 Current Scope：Minimum Viable Slice

- 正常入口、canonical route、兩個正式視角與 URL state。
- 責任盤點的 Duty-centric 表格、三種既有 anomaly 複選與 Duty Drawer。
- 責任分布的 active Position-centric 四 lane 數量表，以及一個同時搜尋 Position／部門名稱的文字搜尋。
- 工作台唯讀與導回 DEV-034 配置。
- desktop、窄桌面及 mobile read-only layout；手機不提供任何 mutation。
- route／projection／component tests、typecheck、full tests、build 與真實瀏覽器證據。

### 2.3 Out of Scope

- 第二套 relation editor、批次配置、工作台 drag-and-drop、inline mutation、create／delete Duty。
- 新 anomaly、`配置完整` 狀態、職責分離判斷、兼任風險擴充、AI 推薦或自動配置。
- 責任分布的 department 下拉、lane 篩選、cell 展開、Duty 清單及 Duty Drawer；待第一輪實際試用後再決定是否加入。
- 各視角篩選偏好記憶、分享完整篩選組合、Position focus 與進階 drilldown。
- 工作量、工時、績效、健康度、heatmap、風險分數或人力容量推論。
- schema、API、server、permission、organization command、document/workspace store、autosave、CAS、migration、environment、deploy 或 release 修改。
- owner／流程／ISO／內控／制度對照等 future 視角；不得先顯示 disabled tab。

## 3. 正常入口與導航契約

### 3.1 入口

1. 正常起點是組織架構頁左側 `工作執掌` DirectoryPanel。
2. `DirectoryDock` 新增 optional `onOpenDutyPlanning` prop；存在時在既有 `headerAction` 位置顯示緊湊文字按鈕 `工作台`。
3. 按鈕須有 `aria-label="開啟責任規劃工作台"` 與同義 `title`，不得只顯示無文字 icon。
4. 入口執行 `history.pushState` 到 `/duty-planning?view=audit`；不得由 direct URL、隱藏手勢或靜態標題代替。
5. 入口在唯讀及 mobile 情境仍可見，因其只進入唯讀分析；是否顯示不得綁定 organization mutation capability。

### 3.2 工作台內導航

- 視角切換使用可導覽 link semantics，視覺呈現為兩個同層頁籤；active link 使用 `aria-current="page"`，不得只靠顏色區分。
- `返回組織圖` 回到既有組織架構頁，不修改 organization state。
- 點擊 Duty 名稱開啟同一個 read-only Drawer；關閉後保留 URL、active view、scroll context 與目前結果。
- Drawer 的唯一修改入口為 `到組織圖配置`。它導航到 `/?mode=duty-config&duty=<dutyId>`，不得自動指定 lane、armed drag 或輸出 command。
- 從配置頁使用 browser Back 時，工作台 URL 與篩選必須恢復。

## 4. Route 與 URL contract

### 4.1 型別

`src/dutyPlanningRoute.ts` 新增並輸出：

```ts
export type DutyPlanningView = 'audit' | 'distribution'

export type DutyPlanningStatusFilter =
  | 'no-executor'
  | 'missing-primary-executor'
  | 'pending-reassignment'

export interface DutyPlanningLocation {
  isDutyPlanningPage: boolean
  view: DutyPlanningView | null
  query: string
  anomalyTypes: DutyPlanningStatusFilter[]
}
```

`DutyPlanningSurface = 'workbench' | 'matrix' | 'anomalies'` 可暫時保留並標示 deprecated，僅供 `dutyConfigurationRoute.ts` 的 legacy compatibility 使用；不得再作 DEV-036 active UI state。

### 4.2 Canonical path 與 query key

| 語意 | Canonical 表達 |
| --- | --- |
| page | `/duty-planning` |
| active view | `view=audit|distribution`，builder 永遠明示 |
| 當前視角搜尋 | `q=<trimmed text>`；Audit 搜 Duty，Distribution 搜 Position／部門 |
| Audit anomaly 複選 | `status=no-executor,missing-primary-executor,pending-reassignment` |

Canonical key ordering 固定為：`view`、`q`、`status`。空字串與空陣列不序列化；複選值去重後依本文列出的 domain order 排序。

### 4.3 Parser／builder 規則

1. `/duty-planning` 正規化為 `/duty-planning?view=audit`。
2. `/duty-planning/anomalies` 解析為 audit；`/duty-planning/matrix` 解析為 distribution。legacy path 優先於衝突的 `view` query。
3. 未知 `view` 安全回 audit；未知 status 直接丟棄，不白屏、不保留為 UI chip。
4. query text trim；重複 filter dedupe；合法值按 canonical order serialize。
5. distribution view 忽略並清除 `status`；`q` 在 audit 搜尋 Duty title，在 distribution 搜尋 Position／department title。
6. builder 只輸出 canonical `/duty-planning`，不得繼續產生 legacy path。
7. 解析後若 URL 非 canonical，App 以 `replaceState` 正規化；使用者切頁籤、勾選 filter 或選 department 以 `pushState`；連續搜尋輸入以 `replaceState`，避免每個字元污染 history。
8. browser popstate 是 route state 的權威輸入；不得在 effect 中用 stale component state 把 URL 覆寫回去。

### 4.4 最小正規化

Route 正規化只處理 view、q、status 與 legacy alias；不得因 Duty／Position 清單為空而切換 view。第一輪沒有 department／lane／Position focus query，因此不建立相關 resolver 或資料存在性同步 effect。正規化不得寫 organization state、標 dirty或增加 revision。

## 5. State ownership 與資料流

```text
window.location / popstate
  → App: DutyPlanningLocation + canonical history
    → DutyCenter: selectedDutyId
      → DutyPlanningWorkbench: controlled view composition
        ├─ DutyAuditView: controlled audit filters + pure audit rows
        └─ DutyDistributionView: controlled distribution filters + pure distribution rows

organization state
  → presentation helpers
    → read-only rows / counts / labels
      → Drawer or navigation only
```

| State | Owner | Persistence | 禁止事項 |
| --- | --- | --- | --- |
| active view＋active view filters | `App`／URL | browser URL/history | 不得只存 component memory |
| selected Duty Drawer | `DutyCenter` | memory only | 不建立另一條 Duty route |
| Duty／relation／Position | existing organization state | existing authority | 不複製成 planning store |

第一輪不記住非 active 視角的上次 filters。切換視角時只保留共同 `q`；由 audit 切到 distribution 時清除 `status`。reload 只恢復目前 URL 的 active view與有效 filters。

## 6. Presentation projection contract

所有 projection 都是 pure function，建議放在 `src/dutyPlanningPresentation.ts`，不得在 component 內重做 lane／anomaly domain 判斷。

### 6.1 共通 invariants

1. lane 一律透過 `dutyColumnForRelation(...)` 分類；不得再以 raw role 自建第二套 switch。
2. lane 固定順序：主執行、協作、審核、會簽。
3. anomaly 固定順序：無執行職位、缺少主執行、待重新分配。
4. Duty title 以 `zh-Hant` localeCompare 排序，相同 title 再以 stable id 排序。
5. Position／department 次序沿用現行 organization chart／`sortDutyMatrixPositions` 的 deterministic order。
6. 關聯到不存在物件的 invalid relation 不得造成 render crash；畫面 fail-soft，但此資料情形是 QC data-sanity fail，必須記錄。

### 6.2 責任盤點投影

新增等價型別與 helper：

```ts
type DutyPlanningLane =
  | 'primary-execute'
  | 'collaborate'
  | 'review'
  | 'countersign'

interface DutyAuditRow {
  dutyId: string
  dutyTitle: string
  assignments: Record<DutyPlanningLane, DutyAssignmentLabel[]>
  anomalyTypes: DutyPlanningStatusFilter[]
}

buildDutyAuditRows(state): DutyAuditRow[]
filterDutyAuditRows(rows, { dutyQuery, anomalyTypes }): DutyAuditRow[]
```

規則：

- 一個 Duty 永遠只產生一列，即使同時有多個 anomaly 或 pending relation。
- 同 lane 多個 Position 依 organization order 顯示；active relation 顯示現職稱。
- pending reassignment 可使用既有 former position snapshot 顯示原職稱，並在狀態欄標示待重新分配；不得把 pending relation算入責任分布。
- anomaly 複選：空集合＝全部；同群組 OR；與 Duty 搜尋 AND。
- 不新增 `待處理`、`全部異常`、`配置完整` 等第二層條件或 domain status。

### 6.3 責任分布投影

新增等價型別與 helper：

```ts
interface DutyDistributionRow {
  positionId: string
  positionTitle: string
  departmentId: string | null
  departmentTitle: string
  counts: Record<DutyPlanningLane, number>
}

buildDutyDistributionRows(state): DutyDistributionRow[]
filterDutyDistributionRows(rows, query): DutyDistributionRow[]
```

規則：

- 一個 active Position 一列；即使四欄皆為 0 仍保留，除非 Position／department 文字不符合 `q`。
- pending reassignment 不計入任何 active Position cell。
- `q` 同時比對 Position title 與 department title；只保留符合的 Position row。
- 四個 lane 欄固定全顯示，第一輪沒有 lane filter。
- cell 顯示明確整數 count；count 為 0 仍顯示 `0`。第一輪 count 是純文字，不提供展開、Duty 清單或 Drawer。
- UI 文案只使用 `責任數` 或 lane 名稱，不使用工作量、負荷、忙碌、健康度、紅黃綠等推論語彙。

## 7. UI 元件契約

### 7.1 `DutyCenter`

- 只承擔 page shell、兩視角導航、route callbacks、selected Duty Drawer 與導回配置。
- 移除 Current Phase page 的新增 Duty 按鈕、舊 global matrix controls 與 relation mutation callbacks。
- 頁首保持安靜：title、必要 version／mode context、返回組織圖；不得加入 summary card 或未來功能說明卡。
- active view 下方只渲染該視角自己的 toolbar 與內容。

### 7.2 `DutyPlanningWorkbench`

- 改為 controlled composition；依 `view` 只 render `DutyAuditView` 或 `DutyDistributionView`。
- 不持有 organization draft，不呼叫 organization command，不處理 drag/drop。
- 舊 drag components 可暫留編譯但不得從 Current Phase path 被 render；若移除會擴大 dirty overlap，可留待後續 cleanup DEV。

### 7.3 `DutyAuditView`

- 新檔 `src/components/DutyAuditView.tsx`。
- toolbar：Duty 搜尋、三個可複選 anomaly 原子條件、條件存在時才顯示清除。
- desktop 使用語意 table：`工作執掌`、`主執行`、`協作`、`審核`、`會簽`、`規劃狀態`。
- Duty 名稱是 button/link，可開 Drawer；不能以整列隱性 click 取代。
- 多 anomaly 以簡潔文字／chip 並列；不得滿表紅框或把零 anomaly 宣告完整。

### 7.4 `DutyDistributionView`

- 新檔 `src/components/DutyDistributionView.tsx`。
- toolbar：一個同時搜尋 Position／部門名稱的文字搜尋；條件存在時顯示清除。
- table：`職位`、`部門`、`主執行`、`協作`、`審核`、`會簽`；每個 lane cell 顯示 count。
- count 是唯讀文字，不可點擊；第一輪不做 `aria-expanded`、inline detail row、Duty 鑽取或另一個 Drawer 入口。

### 7.5 `DutyDetailDrawer`

- 支援 read-only consumer：mutation callbacks 改 optional 或提供明確 read-only props，render 時不得依賴 no-op mutation 來假裝唯讀。
- 新增 optional `onOpenConfiguration` 與 `configurationActionLabel`；DEV-036 使用 `到組織圖配置`。
- `editingEnabled={false}` 時不顯示 metadata edit、remove relation、create、transfer、delete 等控制，但保留完整閱讀資訊與配置導航。
- 既有 DEV-034 caller 行為不得受影響。

### 7.6 Empty／error／responsive

| 情境 | 顯示契約 |
| --- | --- |
| 無 Duty | 責任盤點顯示尚未建立工作執掌；提供返回組織圖，不在工作台新增 |
| 無 active Position | 責任分布顯示尚無可盤點職位；提供返回組織圖 |
| 篩選零結果 | 顯示沒有符合條件；只有存在 filter 時提供清除 |
| invalid query | URL replace 為 canonical，有效頁面繼續顯示 |
| stale selected Duty | 自動關閉 Drawer，不保留幽靈內容 |

- desktop 與窄桌面保留 table；不足寬度時由內容區局部 horizontal scroll，不把每格 cardification。
- 390×844 mobile 仍能切換視角、篩選、水平閱讀表格與開 Drawer；不得出現 mutation control。
- sticky 或 overlay 不得遮住頁籤、第一列、表頭或 browser back 操作。
- 必要資訊不可只存在 hover；keyboard focus ring 清楚可見。

## 8. Repo file boundary

### 8.1 Required／allowed

| 檔案 | 預期修改 |
| --- | --- |
| `src/dutyPlanningRoute.ts` | 新 view／filter parser、builder、canonicalizer；保留必要 legacy compatibility |
| `src/dutyPlanningRoute.test.ts` | route、alias、invalid query、dedupe、ordering、history input cases |
| `src/dutyPlanningPresentation.ts` | audit／distribution pure projection 與 filter helpers |
| `src/dutyPlanningPresentation.test.ts` | row、lane、sort、pending、filter invariants |
| `src/App.tsx` | 移除 planning→config redirect；route normalization；normal entry／navigate callbacks |
| `src/components/DirectoryDock.tsx` | Duty header `工作台` action prop／control |
| `src/components/DutyCenter.tsx` | 雙視角 page shell、URL-controlled filters、read-only Drawer |
| `src/components/DutyPlanningWorkbench.tsx` | 唯讀 controlled composition |
| `src/components/DutyAuditView.tsx` | 新增 Audit view |
| `src/components/DutyDistributionView.tsx` | 新增 Distribution view |
| `src/components/DutyDetailDrawer.tsx` | read-only consumer 與配置 navigation action |
| `src/components/DutyPlanningWorkbench.test.tsx` | 可選；若不新增 component test，須由既有 route／projection tests 與 browser gate 覆蓋 composition／read-only render |
| `src/index.css` | 檔尾新增 DEV-036 scoped styles／breakpoints，避免依賴舊 selector specificity |
| `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、本文 | 實作與驗證後更新狀態／證據 |

RD 開始前必須重新閱讀上述檔案的最新 dirty state，採局部 patch；不得覆蓋使用者既有修改。

### 8.2 Forbidden unless stop-and-review

- `server/**`
- `src/types.ts`
- `src/duties.ts`
- `src/dutyPlacement.ts`
- `src/dutyConfiguration.ts`
- `src/dutyConfigurationRoute.ts`
- `src/organizationCommands.ts`
- document／workspace stores、management methods、schema、API、permission、migration 或 build environment

若 implementation 證明必須修改 forbidden file，先停止、說明不可避免原因與影響，再由 PM 判定是否擴 scope；不得以順手重構名義越界。

## 9. RD implementation slices

| Slice | 內容 | 完成條件 |
| --- | --- | --- |
| S0 Contract tests first | 先補 route／projection failing tests | 測試能明確證明舊 redirect／舊 projection 不符合新契約 |
| S1 Route＋normal entry | route parser／builder／canonicalization、移除 App redirect、Directory header `工作台` | 正常入口進 `/duty-planning?view=audit`；alias／invalid query安全正規化 |
| S2 Page shell | DutyCenter 雙 view link、state ownership、read-only Drawer、導回 DEV-034 | 切換／back／reload一致；純瀏覽不 mutation |
| S3 責任盤點 | pure projection、filter、table、empty states | 一 Duty 一列；三 anomaly OR＋搜尋 AND；Drawer 可用 |
| S4 責任分布 | active Position 四欄 count、單一文字搜尋、RWD／a11y | 0 值可見；四欄正確；mobile 唯讀 |
| S5 Integration gate | targeted／full tests、build、browser QC、evidence manifest、文件回寫 | 全部 required evidence 完整才可標 QA／QC Passed |

每個 slice 都應維持可編譯；不得先大規模刪除舊 components 再嘗試恢復。

## 10. Failure recovery 與 concurrency

| Failure／edge | 必要恢復 |
| --- | --- |
| legacy 或 invalid route | replace 到 canonical URL，頁面保持可用 |
| selected Duty 在外部更新後消失 | 關閉 Drawer；不得 crash |
| 工作台純閱讀 | dirty flag、organization revision、autosave queue 與 relation 必須完全不變 |
| 從工作台導回配置 | 只 push navigation；不得輸出 organization command |
| 其他 session 更新 organization | 沿用現行 revalidation／state refresh；工作台重新投影，不建立自己的衝突保存 |

本 DEV 無新 transaction boundary，故不新增 CAS 或 conflict protocol；既有 organization persistence authority 維持原樣。

## 11. Verification contract

風險分級：`Medium`。理由是新完整頁面與 URL/history 會影響正常導航和多 viewport UI，但 Current Phase 不改 server、schema、permission、transaction 或 persistence authority。

### 11.1 必跑自動驗證

```powershell
npx tsc --noEmit
npm test -- --run src/dutyPlanningRoute.test.ts src/dutyPlanningPresentation.test.ts src/components/DutyPlanningWorkbench.test.tsx
npm test -- --testTimeout=30000
npm run build
```

若 view tests 採不同檔名，targeted command 可等價調整，但 route、兩種 projection、唯讀 composition 都必須被直接覆蓋。

### 11.2 Targeted cases

#### Route

- canonical default／兩 view、legacy alias、conflicting alias＋view。
- unknown view、unknown status、duplicate status、unordered status、whitespace query。
- active view 移除另一視角 query。
- builder/parser round trip 與 deterministic query ordering。

#### Audit projection

- 一 Duty 多 relation／多 anomaly仍只有一列。
- no executor、missing primary、pending 各自與複合情境。
- 空 anomaly filter＝全部；多選 OR；與 q AND。
- legacy collaborate canonical relation 顯示在協作欄。
- pending snapshot 可讀但不誤算 active assignment。

#### Distribution projection

- active Position一列，四 lane 正確，零 relation Position 保留。
- pending 不進 active cell；inactive Position 不成列。
- q 依 Position／department title 篩列，不改變 row 內四欄 counts。
- deterministic department／Position ordering。

#### Component／a11y

- 兩 view links 與 `aria-current`。
- Current Phase 沒有 create／delete／remove／drag mutation controls。
- Drawer 唯讀且具有 `到組織圖配置`。
- distribution count 不可互動；empty states正確。

### 11.3 真實瀏覽器 hard gate

必須從正常入口開始，不得只以 direct URL 或 component mount 代替：

```text
組織架構 → 左側工作執掌 → 工作台
  → 責任盤點：搜尋／多選 anomaly／Duty Drawer
  → 責任分布：Position／部門文字搜尋／四類 count
  → 到組織圖配置 → browser Back
  → reload／back／forward／legacy alias
```

固定 viewport：`1440×900`、`1024×768`、`854×698`、`390×844`。

每個 viewport 至少驗證：

- header、兩視角入口、active state、toolbar、table header／first row 可見。
- 無遮擋、重疊、截斷、整頁非預期水平溢出；表格局部 scroll 可操作。
- keyboard tab、Enter／Space、Escape、focus ring與 Drawer close。
- mobile 完全沒有 relation／Duty mutation controls。
- console／network／visible error sweep 無未處理錯誤、4xx／5xx、raw exception、成功／失敗並存。
- 純瀏覽前後 organization revision、dirty、relation 沒有變化。

browser 證據清單建立於 `output/playwright/dev036/manifest.md`，至少記錄：build／revision、資料前置、正常入口、viewport、操作步驟、預期／實際、artifact path、失敗與重測。manifest 未建立或缺正常入口、mobile、history、read-only mutation check 任一項，不得標示 QA／QC Passed。

### 11.4 驗證矩陣

| Acceptance／risk | Normal delivery path | Fixture boundary | Forbidden shortcut | Fail condition | Required evidence |
| --- | --- | --- | --- | --- | --- |
| 入口可發現 | 組織架構→工作執掌→工作台 | 可使用既有 Duty version | 只貼 direct URL | header 無入口或 destination 錯誤 | 入口前後截圖＋URL |
| URL/history | 入口→切 view→filter→reload/back/forward | 可 seed 合法 query | 只測 parser | tab、URL、結果不同步 | route tests＋browser trace |
| Audit 正確 | 搜尋＋anomaly 多選＋Drawer | 可 seed anomaly 組合 | 只驗 `deriveDutyAnomalies` | 一 Duty 多列、OR/AND錯誤 | projection tests＋畫面對照 |
| Distribution 正確 | 搜尋→檢查四類 count | 可 seed relation 分布 | 只查 store count | 四 lane／count錯誤 | projection tests＋畫面對照 |
| 無隱性 mutation | 兩視角全流程＋配置導航前 | editable draft可作前置 | 只在唯讀 version測 | dirty/revision/relation變動 | 前後 state＋UI evidence |
| Mobile 唯讀 | 390×844正常入口至 Drawer | 同一 organization fixture | 只看 CSS source | mutation可見／可觸發或遮擋 | 實際 viewport 截圖＋操作 |

## 12. FMEA 與停止條件

| Failure mode | Effect | Control／detection | Gate |
| --- | --- | --- | --- |
| planning route仍被 App redirect | 工作台不可使用 | S0／S1 route integration＋正常入口 browser | Hard fail |
| 兩視角各自複製資料 | counts／Drawer不同步 | 只收 organization state＋pure projection | Stop |
| 工作台出現第二套 mutation | ownership混亂、CAS風險 | component tests＋browser visible controls sweep | Hard fail |
| q/filter history每字一筆 | Back unusable | search replace、discrete control push | Hard fail |
| pending被算進 active distribution | 責任分布失真 | projection unit fixtures | Hard fail |
| count被文案解讀為工作量 | 管理判斷誤導 | copy review＋browser QC | Hard fail |
| narrow viewport card化或整頁 overflow | 比較能力喪失 | 局部 table scroll＋四 viewport QC | Hard fail |
| dirty worktree覆蓋既有改動 | 使用者資料受損 | implement 前重讀、局部 patch、diff review | Stop |

遇到下列任一情況，RD 必須停止並回 PM，不得自行擴 scope：

- 需要修改 schema、API、server、permission、persistence、CAS 或 organization command 才能完成。
- 需要在工作台直接 mutation 或建立第二套 relation editor。
- 必須新增工作量、風險、績效或「完整性」商業判斷才能呈現責任分布。
- route 與 management method／其他 active feature 發生不可局部解決的 collision。
- 無法保留 DEV-034 左側快速配置與既有 Drawer 行為。
- required dirty files 存在無法隔離、無法理解或可能被覆寫的使用者修改。
- 正常 UI 入口只能靠 direct URL 才能成立。

## 13. ADR、migration、release 與 future capsule

- ADR：不需要。Current Phase 只恢復／重組 presentation route 與唯讀 projection，資料權威、transaction boundary、schema、API、permission 均不變。
- Migration／backfill：無。
- Backend／API／permission contract：無變更。
- Release：本 DEV 只授權本機實作與驗證，不授權 deploy／release。
- Future capsule：第一輪試用後，優先依真實阻礙評估責任分布的 department／lane filter、cell 展開與 Duty 鑽取，再逐一評估關鍵依賴、制度對照、變更影響或職責分離。每一功能都須先有明確任務與驗收契約；不得先建立空頁、disabled tab 或通用 plugin framework。

## 14. 變更紀錄

- 2026-08-26：依使用者「先做最少功能、試用後再修」收斂 Minimum Viable Slice。保留兩個正式視角；責任盤點只做搜尋、三 anomaly 複選、列表與 Drawer，責任分布只做 Position／部門文字搜尋與四欄 count；department／lane filter、cell 展開、分布 Duty 鑽取及跨視角偏好記憶延後。
- 2026-08-26：由 DEV-036 Brief 升級至 `RD Implementation Ready`。依現行程式固定 planning redirect 差距、正常入口、canonical route/query、state ownership、read-only action boundary、audit／distribution projections、component/file boundaries、分片、failure recovery、FMEA、targeted tests及 browser evidence；本輪未修改產品程式、測試或 runtime。
- 2026-08-27：完成 DEV-036 最小功能實作。新增 canonical 雙視角工作台、正常入口、URL／history state、Audit／Distribution pure projections、唯讀 Drawer 導回 DEV-034、四 viewport browser evidence；修正 planning 入口離開 duty configuration stale state，以及 Audit 清除條件的 q／status 同步問題。`npx tsc --noEmit`、targeted 4 files／20 tests、full 120 files／544 tests、`npm run build`與 browser gate 通過；證據：`output/playwright/dev036/manifest.md`。未修改 schema、API、server、permission、persistence 或 release。
