# DEV-019：職務兼任風險視覺監控 RD Implementation Contract

狀態：`RD Implementation Complete / QA-QC Passed`  
日期：2026-08-15  
來源：`USER-2026-08-15-DUAL-ROLE-RISK-VISUAL`  
風險等級：Medium  
權威範圍：DEV-019 的產品、資料、UI、相容性與驗收契約  
執行邊界：S1→S4 本機 RD／QA／QC 已完成；未授權 deploy 或 release

## 1. 目的與成功結果

OrgMaster 已支援同一員工身兼多職，但目前沒有可設定、可自動偵測的職務組合風險。DEV-019 新增一個輕量監控層：管理者設定具有兼任風險的職務組合，系統依同一員工目前有效的任職自動比對，並只在組織圖的相關職位節點渲染非文字視覺效果。

成功結果：

- 管理者可建立、修改、停用及刪除職務組合規則。
- 同一員工同時具有命中規則的有效任職時，相關職位節點立即出現一致的視覺效果。
- 風險提示不顯示可見文字，不中斷、不阻擋、不要求確認任何組織或任職設定。
- 規則與組織文件一同保存、同步、下載及恢復，不因升版遺失既有 V1／V2 資料。

## 2. 已確認產品邊界

### 2.1 必須成立

- 組織圖上的風險提示只使用 UI 效果；不顯示可見風險文案、badge、tooltip、popover、drawer、banner 或數量 KPI。
- 偵測結果只能影響衍生視覺狀態，不能影響 assignment、position、hierarchy、department、儲存、Undo／redo 或 command validity。
- 不建立風險狀態、負責人、期限、例外、接受理由、改善流程、通知、核准或處理歷程。
- 風險附著於職位節點及職位關係，不把員工頭像、姓名或個人主檔渲染成負面狀態。
- 風險分為「低風險」、「中風險」與「高風險」三級，視覺語法由產品統一，不開放規則自訂色彩或動畫。

### 2.2 第一版選定方案

- 規則主體採 `Role` 配對，不採職稱字串或個別 `Position` 配對。
- `Role` 是可重用的職務定義；`Position` 是實際被偵測及渲染的職位席位。
- 規則 A＋B 與 B＋A 是同一個無方向組合；同一組合最多存在一條規則。
- 所有目前有效的 `Assignment` 類型均參與比對，包括 `primary`、`secondary` 與 `acting`。
- 多條規則命中同一職位時，常態只呈現最高風險等級；互動聚焦時才呈現可見的對應職位關係。

### 2.3 明確拒絕的替代方案

- 不以 `Position.title` 字串比對，避免改名、同名或語系差異造成漂移。
- 不以個別 `Position` ID 作為第一版規則主體，避免同類職務在不同部門重複設定。
- 不使用紅色員工姓名、人物警告 icon 或公開風險排行。
- 不因命中規則而 disabled、拒絕或回滾任職異動。
- 不為每條規則開放獨立 UI 樣式，避免相同嚴重度出現不一致語法。

## 3. 現況架構影響

### 3.1 已確認現況

- Runtime：React 19、TypeScript 7、Vite 8、Vitest 4、`@xyflow/react` 12。
- `OrgDirectoryState` 是員工、部門、Role、Position、Assignment 與畫布 layout 的共同狀態，透過 `commitState` 納入 Undo／redo。
- `Position.roleId` 指向 `Role.id`；`Assignment` 以 employeeId＋positionId 表達任職，並以有效期間判斷目前狀態。
- `buildPositionViews` 產生組織圖使用的 active assignment view；`OrgNode` 是 React Flow 職位節點。
- 本機 API `/api/orgmaster/document` 保存完整版本化文件；DEV-019 實作前基線為 V2，本交付已升為 V3 並保留 V2 fallback。
- 部門 frame 由獨立 viewport layer 渲染；節點尺寸由有效任職人數決定。
- Role pairing 維持以 `Role.id` 為唯一規則主體；新增職位會重用同名 Role 或原子建立新 Role，職位改名時同樣重用／建立對應 Role，避免使用第一個 Role 作為錯誤預設。

### 3.2 受影響面

- 領域資料：`OrgDirectoryState` 新增職務組合風險規則集合。
- Role 映射：職位屬性面板可明確切換 Role；職位建立／改名會安全維護 `Position.roleId` 與 Role 主檔，風險規則仍只讀 Role pair。
- 衍生資料：新增純函式比對結果，供節點與關係視覺使用；比對結果不持久化。
- 文件相容性：文件 envelope 升至 V3，V1／V2 載入時補入空規則集合。
- UI：Toolbar 增加設定入口；新增固定 overlay 設定面板；OrgNode 增加非文字視覺狀態；hover、focus 或選取風險節點時增加暫時關係層。
- 驗證：新增規則 invariant、偵測、聚合、文件 migration、rule CRUD、視覺與 viewport 證據。

### 3.3 刻意不改

- `Employee`、`Role`、`Position`、`Assignment`、`OrgMember` 既有欄位語意不變。
- `Position.parentPositionId` 仍是主要職位上下級唯一權威來源；ADR-001 不受影響。
- `Position.departmentId`、部門 frame、assignment 寫入與 hierarchy command 不因風險規則增加驗證條件。
- API route、Auth、permission、外部服務、環境變數與 production target 不變。

## 4. 領域與資料契約

### 4.1 新增資料型別

```ts
type RoleCombinationRiskLevel = 'low' | 'medium' | 'high'

interface RoleCombinationRiskRule {
  id: string
  roleAId: string
  roleBId: string
  level: RoleCombinationRiskLevel
  reason: string
  enabled: boolean
}

interface OrgDirectoryState {
  // existing fields unchanged
  roleCombinationRiskRules: RoleCombinationRiskRule[]
}
```

欄位限制：

- `id` 在文件內唯一且修改規則時保持不變。
- `roleAId` 與 `roleBId` 必須不同，且都能解析至現有 `Role.id`。
- `level` 只能是 `low`、`medium` 或 `high`。
- `reason` 為這組職務組合的風險依據，屬選填文字；有填寫時去除前後空白並在設定清單顯示，留白時仍可保存，組織圖不顯示原因文字。
- `enabled` 只代表規則是否參與比對，不是風險處理狀態。

### 4.2 無方向唯一鍵

規則唯一性使用排序後 Role ID 形成 canonical pair key：

```text
pairKey = sort(roleAId, roleBId).join("::")
```

- A＋B 與 B＋A 必須得到相同 key。
- 新增或編輯不得產生第二條相同 pair key。
- 相同 pair 不以「一般＋高風險」共存；修改等級應更新原規則。
- duplicate prevention 必須位於 domain command／pure helper，不得只靠 UI disabled。

### 4.3 規則 CRUD transaction

- 新增、編輯、啟用、停用與刪除各自透過一次 `commitState` 完成，形成一筆 Undo history。
- 無效 Role、自我配對、重複配對或未知 level 不得 commit 部分狀態；原因留白不影響保存。
- 刪除規則不要求確認；既有 Undo 可恢復。
- 規則異動與 assignment 異動彼此獨立；任何規則錯誤都不能回滾已完成的任職操作。

### 4.4 鉦富機械現階段規則基準

目前基準依鉦富機械 14 人、功能型組織、核心主管必須跨職能，以及 2027–2030 才逐步導入 ISO 9001／COSO／ERP 的條件制定。規則目的不是追求大企業式完全職務分離，而是只找出同一人可單獨完成高影響交易或最終放行的情況。

- 高風險：同一人同時掌握核准、付款／保管、記帳／核對或薪資主檔維護中的兩個關鍵環節。
- 中風險：同一人可建立交易並記錄，或同時承擔產出目標與最終品質放行，但仍可用一次獨立覆核降低風險。
- 不建立規則：僅屬工作量、跨部門協調、主管兼任功能職，或執行者自檢但不具有最終核准／放行權的組合。
- 重新檢視時點：人數接近 30 人、正式導入 ERP／ISO 9001、付款權限改變，或新增供應商主檔、薪資主檔、最終放行權限時。

目前啟用基準：

| 等級 | 職務組合 | 判斷核心 |
|---|---|---|
| 高 | 財務部經理＋出納專員 | 核准與付款執行集中 |
| 高 | 出納專員＋會計專員 | 資金保管與帳務記錄集中 |
| 高 | 採購專員＋出納專員 | 採購建立與付款執行集中 |
| 高 | 人資專員＋出納專員 | 薪資主檔維護與發薪執行集中 |
| 高 | 採購專員＋倉儲物流作業員 | 下單、收貨與實體保管集中 |
| 高 | 財務部經理＋會計專員 | 財務報表編製與最終覆核集中 |
| 中 | 採購專員＋會計專員 | 採購交易建立與入帳集中 |
| 高 | 倉儲物流作業員＋會計專員 | 實體存貨保管與帳面記錄集中 |
| 高 | 業務專員＋出納專員 | 銷售、折讓與收款資金集中 |
| 中 | 生產部經理＋品保工程師 | 生產績效與最終品質放行集中 |

## 5. 偵測與衍生狀態契約

### 5.1 輸入

- 已啟用的 `RoleCombinationRiskRule[]`。
- `status === 'active'` 且 Role 參照有效的 Position。
- 以既有有效期間語意判定的 active Assignment：`validFrom <= asOf` 且 `validTo === null || asOf < validTo`。
- `asOf` 沿用組織 view 的同一日期基準，避免畫面人員與風險使用不同時間點。

### 5.2 比對行為

1. 依 employeeId 分組目前有效任職。
2. 將每筆任職解析為 active Position 與其 roleId；不存在或 inactive 的 Position 不參與。
3. 對同一員工的不同 Role 建立無方向 pair key。
4. pair key 命中啟用規則時，產生 employeeId、ruleId 與兩個 positionId 的衍生 match。
5. 同一 position pair＋rule＋employee 的重複輸入必須去重。
6. 依 positionId 聚合節點視覺：`high` 高於 `medium`，`medium` 高於 `low`，並保留可互動的 counterpart position IDs。

所有 assignmentType 均參與；風險判斷依「同時任職」而非任職名稱是否為兼任。

### 5.3 衍生輸出

```ts
interface RoleCombinationRiskMatch {
  ruleId: string
  employeeId: string
  positionIds: readonly [string, string]
  level: RoleCombinationRiskLevel
}

interface PositionRiskVisualState {
  positionId: string
  level: RoleCombinationRiskLevel
  counterpartPositionIds: string[]
}
```

- match 與 visual state 都是 derived state，不寫入 OrgDirectoryState、文件、Undo history 或 API payload。
- 輸出順序必須穩定，以 position ID／rule ID 排序，避免 React Flow 無意義重建或閃動。
- 預覽拖曳中的 position hierarchy 不改變 assignment，因此風險只依 committed assignments；員工 drop commit 後立即重算。

## 6. UI 與互動契約

### 6.1 設定平台

- Toolbar 提供一個可見且可鍵盤操作的「兼任風險設定」入口。
- 入口開啟右側 fixed overlay 設定面板；面板覆蓋既有 Inspector 區域但不推擠或縮放組織圖畫布。
- Desktop／laptop 使用緊湊表格；mobile 使用單欄堆疊列與全寬面板。
- 清單欄位只保留職務 A、職務 B、等級、選填原因、啟用與列動作，不顯示負責人、日期、狀態、歷程或統計。
- 新增與編輯使用同一面板內的表單，不開第二層 modal；必要欄位為兩個 Role selector 與等級。
- 儲存規則時才 commit；取消不改 state。`Escape` 先取消編輯，再次按下才關閉面板。
- 啟用切換直接形成一筆可 Undo 的 commit；刪除直接執行並可 Undo，不要求確認。
- 表單可顯示規則資料完整性的就地驗證文字；這不屬於組織圖風險提示，也不得轉成任職阻擋。

### 6.2 組織圖常態視覺

- 正常節點保持現有樣式，不增加常駐圖示或文字。
- 低風險：藍灰色點線外框或等價點線 overlay。
- 中風險：橘色虛線外框或等價虛線 overlay。
- 高風險：紅色雙層外框或等價雙層 overlay。
- 顏色不得是唯一訊號；虛線與雙層結構在灰階、高對比與 root node 背景上仍須可區分。
- overlay 使用 pseudo-element、SVG 或等價不參與 layout 的方式，不改變 `getOrgNodeHeight`、節點 width、部門 frame bounds 或 edge routing。
- selected、root、employee drop target、drag ghost 與風險狀態必須可組合；風險樣式不得覆蓋拖放與選取回饋。
- 風險效果不套用在員工姓名、員工列或人員主檔。

### 6.3 關係聚焦

- 常態不繪製跨圖風險連線，避免多條交叉線干擾職位樹。
- 使用者 hover、keyboard focus 或選取具有風險的職位節點時，所有目前可見的 counterpart 節點同步提高外框權重。
- 互動期間可在部門 frame 之上、職位節點之下繪製 pointer-events none 的暫時關係線；離開互動後立即移除。
- counterpart 因 collapsed branch 不可見時不畫連線，也不把風險轉移到祖先節點；仍可見的命中節點維持自身風險外框。
- 同一節點同時命中多個 pair 時，只聚焦與目前節點直接相關的可見 counterpart，不顯示規則名稱或人員文字。

### 6.4 Accessibility 與動態效果

- OrgNode 的可及名稱可附加不可見的「一般兼任風險」或「高兼任風險」語意；畫面不得渲染該文字。
- 視覺狀態必須支援 keyboard focus／React Flow selection，不能只有 mouse hover。
- 不使用持續閃爍、循環縮放或長時間脈衝。
- 規則或任職剛命中時可有一次不超過 800ms 的非閃爍強調；`prefers-reduced-motion` 下停用。

## 7. 文件版本與相容性契約

### 7.1 V3 envelope

- `ORG_DOCUMENT_VERSION` 升為 3；V3 的 `OrgDirectoryState` 必須包含 `roleCombinationRiskRules` 陣列。
- 新建、正式儲存、自動儲存、副本與備份都輸出 V3，並包含完整規則。
- `/api/orgmaster/document` route 與 request／response envelope 形狀不變，只接受及回傳正規化後的目前版本文件。

### 7.2 V1／V2 migration

- V2 → V3：保留所有既有資料並加入 `roleCombinationRiskRules: []`。
- V1 → V3：先依既有 V1 hierarchy migration 產生 V2 語意，再加入空規則集合。
- migration 不自動推測或建立任何風險規則。
- malformed V3 規則、自我配對、重複 pair、未知 Role 或未知 level 必須 fail closed，保留原始 payload，不得靜默丟棄規則後繼續儲存。

### 7.3 本機檔案安全

- 主要資料檔升為 `data/orgmaster-document.v3.json`。
- GET 優先讀 V3；不存在時讀既有 `data/orgmaster-document.v2.json` 並在記憶體遷移。
- 首次成功儲存後寫入 V3；不得覆寫或刪除 V2 原檔。
- localStorage 相容 helper 採相同優先序：目前版本 key → V2 → V1；成功遷移只寫目前版本 key，保留舊來源供復原。
- 既有 recovery、copy 與 backup 的 fail-closed 原則維持不變。

## 8. API、權限與外部依賴

- 不新增 API route；本機 GET／PUT 整份文件流程不變。
- 不新增 database、Auth、角色權限、網路服務、背景工作、通知或第三方套件。
- 目前任何可編輯組織的人皆可編輯規則；本 DEV 不引入新的 permission model。
- 同電腦多視窗仍以完整文件 revision 同步；規則變更與其他 state 一樣遵守「本視窗有未儲存變更時不被遠端視窗覆蓋」的既有行為。

## 9. RD Implementation Contract

### Scope

- Role pair 規則資料、invariant、CRUD 與 Undo／redo。
- active assignment 風險偵測、去重、最高等級聚合與穩定排序。
- 設定 overlay、responsive 清單／表單與 Toolbar 入口。
- OrgNode 非文字視覺、互動 counterpart 聚焦及暫時關係層。
- V3 文件、V1／V2 migration、本機 v3 檔案 fallback 與既有文件保護。
- 與既有 assignment、hierarchy、department frame、save、sync、copy、backup 的回歸驗證。

### Out of scope

- 風險責任、期限、狀態、理由、核准、改善、通知、歷程、audit 與 KPI。
- 以 Position、department、permission、報告關係、任職類型或日期條件建立規則。
- 自訂視覺樣式、第三級嚴重度、風險搜尋／篩選、風險報表或匯出。
- 後端資料庫、多人權限、production migration、deploy 與 release。

### Dependencies

- DEV-002：同一員工多職及 assignment 寫入語意。
- DEV-008：Role、Position、Assignment 與 OrgDirectoryState 邊界。
- DEV-011：activeAssignments、多人職位與任職有效期間。
- DEV-015：文件儲存、Undo／redo、副本與備份。
- DEV-017／ADR-001：Position hierarchy、React Flow、部門 frame 與 V2 migration 基礎。

### 9.1 Repo 與變更邊界

- 工作區：`C:\VIBE CODING\OrgMaster`。此目錄目前不是 Git repository，因此 RD 以本節的明確檔案清單控制修改範圍，不能以 git status 作為唯一邊界證據。
- 不新增 npm dependency；沿用 React、Vitest、React Flow 與 lucide-react。
- V2 fallback 與 V3 主文件的既有職位 Role 映射需保持一致；本次修復同步修正 `設計專員`、`行政總務` 的錯誤總經理 Role 參照。
- 不修改 protected runtime `C:\VIBE CODING\ProJED\ProJED`，也不占用、停止或清理 `127.0.0.1:4173`。

| 類型 | 檔案 | 具體責任 |
|---|---|---|
| Modify | `src/types.ts` | 新增 rule、match、visual relation 型別及 `OrgDirectoryState.roleCombinationRiskRules` |
| Add | `src/roleCombinationRisks.ts` | canonical pair、規則驗證／mutation、active assignment 偵測、最高等級聚合、可見關係選取 |
| Add | `src/roleCombinationRisks.test.ts` | 領域 invariant、偵測、去重、聚合與穩定排序測試 |
| Modify | `src/App.tsx` | 納入完整 state/history/save、建立 derived state、接線設定 CRUD、節點狀態與關係層；相同內容的遠端 revision 不置換 history |
| Add | `src/rolePositionMapping.ts` | 依職位名稱重用或建立 Role，供新增／改名流程維持 Role pairing |
| Add | `src/rolePositionMapping.test.ts` | 驗證同名 Role 重用、新 Role 建立與空白名稱正規化 |
| Modify | `src/organizationCommands.ts` | 新增／修改職位時原子寫入 Role 與 `Position.roleId` |
| Modify | `src/components/Inspector.tsx` | 提供職位 Role 明確選擇器 |
| Modify | `src/components/Toolbar.tsx` | 增加設定入口、開啟狀態及關閉後 focus restore |
| Add | `src/components/RoleCombinationRiskPanel.tsx` | 右側 overlay 的規則清單、單層新增／編輯表單、啟用與刪除操作 |
| Modify | `src/components/OrgNode.tsx` | 非文字風險 class、不可見可及名稱、hover／focus interaction callback |
| Add | `src/components/RoleRiskRelationLayer.tsx` | 依 preview layout 繪製 pointer-events none 暫時關係線 |
| Modify | `src/index.css` | low／medium／high overlay、counterpart、relation layer、responsive 與 reduced-motion 樣式 |
| Modify | `src/documentStorage.ts` | V3 envelope、V1／V2→V3 migration、規則 fail-closed validation、localStorage key 優先序 |
| Modify | `server/orgmasterApi.ts` | V3 優先／V2 fallback read、只寫 V3、可注入 root 的檔案 helper |
| Add | `server/orgmasterApi.test.ts` | 暫存目錄驗證 V2 fallback、V3 write、V2 preservation 與 malformed V3 fail-closed |
| Modify | `src/documentStorage.test.ts` | V3 round trip、V1／V2 migration、invalid rule、legacy key preservation |
| Modify | `src/screenshotData.ts` | 初始 state 明確加入空規則集合；不預設任何風險規則 |
| Modify | `src/directories.test.ts`、`src/organizationCommands.test.ts`、`src/organizationHierarchy.test.ts`、`src/drag.test.ts`、`src/layout.test.ts` | 既有 typed fixture 加入空規則集合，確認 command、drag 與 layout 不受風險規則影響 |
| Modify | `README.md` | 主要資料檔更新為 V3，註明 V2 fallback 與保留規則 |
| Runtime generated | `data/orgmaster-document.v3.json` | 第一次成功 PUT 後建立；保存兩條 QA/QC 規則，既有 V2 原檔保留 |

### 9.2 Domain API 與錯誤契約

`src/roleCombinationRisks.ts` 必須輸出下列介面；函式皆為 pure function，不讀 React state、不產生 ID、不寫 storage：

```ts
type RoleCombinationRiskRuleValidationCode =
  | 'INVALID_RISK_RULE_SHAPE'
  | 'DUPLICATE_RISK_RULE_ID'
  | 'RISK_RULE_SELF_PAIR'
  | 'RISK_RULE_DUPLICATE_PAIR'
  | 'RISK_RULE_UNKNOWN_ROLE'
  | 'RISK_RULE_INVALID_LEVEL'

type RoleCombinationRiskRuleValidationResult =
  | { ok: true }
  | { ok: false; code: RoleCombinationRiskRuleValidationCode; ruleIds: string[] }

type RoleCombinationRiskRuleMutationResult =
  | { ok: true; rules: RoleCombinationRiskRule[] }
  | { ok: false; code: RoleCombinationRiskRuleValidationCode; ruleIds: string[] }

interface RoleCombinationRiskInput {
  rules: RoleCombinationRiskRule[]
  roles: Role[]
  positions: Position[]
  assignments: Assignment[]
  asOf: string
}

interface RoleRiskVisualRelation {
  id: string
  positionIds: readonly [string, string]
  level: RoleCombinationRiskLevel
}

canonicalRolePairKey(roleAId: string, roleBId: string): string
validateRoleCombinationRiskRules(rules: unknown, roles: Role[]): RoleCombinationRiskRuleValidationResult
upsertRoleCombinationRiskRule(
  rules: RoleCombinationRiskRule[],
  roles: Role[],
  candidate: RoleCombinationRiskRule,
): RoleCombinationRiskRuleMutationResult
removeRoleCombinationRiskRule(rules: RoleCombinationRiskRule[], ruleId: string): RoleCombinationRiskRule[]
setRoleCombinationRiskRuleEnabled(
  rules: RoleCombinationRiskRule[],
  ruleId: string,
  enabled: boolean,
): RoleCombinationRiskRule[]
deriveRoleCombinationRiskMatches(input: RoleCombinationRiskInput): RoleCombinationRiskMatch[]
buildPositionRiskVisualStates(matches: RoleCombinationRiskMatch[]): PositionRiskVisualState[]
selectVisibleRoleRiskRelations(
  matches: RoleCombinationRiskMatch[],
  focusedPositionId: string | null,
  visiblePositionIds: ReadonlySet<string>,
): RoleRiskVisualRelation[]
```

具體行為：

- `upsert` 以 candidate.id 判斷新增或編輯；編輯保留原 ID，原因有填寫時去除前後空白，成功回傳全新陣列，失敗回傳 code 且不得改原陣列。
- 新增 ID 只由 `App.tsx` 呼叫 `crypto.randomUUID()` 產生；domain 不得依賴 browser API。
- `remove`／`setEnabled` 遇未知 ID 回傳原陣列；`commitState` 因內容相同不建立空 Undo。
- 兩個 Role ID、rule ID、position pair 與輸出皆使用確定性排序；不得依 Map insertion order 決定畫面結果。
- 同一員工若在同一 Role 有多個 Position，必須對每個實際命中的 Position pair 產生 match；只去除完全相同的 employee＋rule＋position pair。
- `DocumentFailureCode` 直接納入上述六個 validation code；載入失敗沿用既有 `positionIds`／`departmentIds` 空陣列，不另建風險 recovery schema。

### 9.3 App 與 UI 接線

- `useOrgHistory` 的 present 仍是完整 `OrgDirectoryState`；`currentState` 必須包含 `roleCombinationRiskRules`，規則每次成功新增、編輯、切換或刪除只呼叫一次 `commitState`。
- `riskMatches` 由 committed `positions`、`assignments`、`roleCombinationRiskRules` 與 `TODAY` 建立；hierarchy drag preview 只改座標，不改 match。
- `positionRiskById` 由 `buildPositionRiskVisualStates` 建立。互動主節點優先序為 `hover／focus position ID`，其次為目前 `selectedId`；非風險 selected node 不啟用關係層。
- `OrgNodeData` 新增 `riskLevel?: RoleCombinationRiskLevel`、`riskRelated: boolean` 與 `onRiskInteraction(positionId: string | null)`。class 固定使用 `has-role-risk`、`role-risk--low`、`role-risk--medium`、`role-risk--high`、`is-role-risk-related`。
- `OrgNode` 透過 pointer enter／leave 與 focus capture／blur capture回報互動；child button 間移動 focus 時不得先清除。可及名稱附加風險等級，但 DOM 內不得新增可見風險文字節點。
- `RoleRiskRelationLayer` 接受 relations、`previewLayout.positions` 與 `previewNodeHeights`，以兩節點中心點畫 SVG line/path；先過濾 `previewLayout.visibleIds`。Department layer z-index 調為 `-2`，relation layer 使用 `-1`，React Flow edge／node 保持既有層級。
- `RoleCombinationRiskPanel` 由 Toolbar icon button 開啟，掛在 `.workspace` 最後並以 absolute overlay 覆蓋右側；桌機寬 420px 上限，`<=690px` 佔工作區全寬。面板 open 不得改 `.workspace` grid class 或 React Flow width。
- 面板 props 僅包含 `roles`、`rules`、`onUpsert`、`onSetEnabled`、`onDelete`、`onClose`；不讀寫 assignment。規則 validation 文字只出現在設定表單。
- 關閉面板後 focus 回到 Toolbar 入口；`Escape` 有編輯時只取消表單，無編輯時關閉。面板開啟時不強制清除既有職位選取。
- low 使用藍灰色點線 pseudo-element；medium 使用橘色虛線 pseudo-element；high 使用紅色雙層 pseudo-element。related 只提高既有 overlay 權重；selected、drop hover、drag ghost 仍由既有實體 border／shadow 表達並維持操作優先。

### 9.4 V3 migration 與本機檔案演算法

`src/documentStorage.ts` 實作順序固定如下：

1. envelope 先驗證 app、kind、savedAt 與 version `1 | 2 | 3`，再依版本驗證 state key；V1／V2 只要求既有六個陣列，V3 額外要求 `roleCombinationRiskRules`。
2. V1 沿用既有 parent migration 與 employee department normalization，V2 沿用既有 normalization；兩者最後加入 `roleCombinationRiskRules: []`。
3. V3 沿用既有 hierarchy normalization；舊 V3 規則若沒有原因，正規化為空字串，再以 `validateRoleCombinationRiskRules` 驗證 shape、ID、pair、Role 與 level；任一實際規則錯誤直接 fail closed。
4. 所有成功 parse 都以 `createOrgDocumentFile` 回傳 V3；`sourceVersion` 保留實際來源 `1 | 2 | 3`。
5. localStorage current key／draft／recovery key 升為 V3；新增明確 V2 legacy key，讀取順序為 V3 draft／document，再 V2，再 V1。來源 migration 成功可寫 V3 current key，但不得刪除 V2／V1 key。

`server/orgmasterApi.ts` 必須將檔案 I/O 拆成可測 helper，接受可選 `rootDirectory = process.cwd()`：

```ts
getOrgMasterDocumentPaths(rootDirectory?: string): { v3: string; v2: string }
readStoredDocument(rootDirectory?: string): Promise<{ document: OrgDocumentFile; revision: string }>
writeStoredDocument(
  document: OrgDocumentFile,
  rootDirectory?: string,
): Promise<{ document: OrgDocumentFile; revision: string }>
```

- read：若 V3 存在，只讀並驗證 V3；V3 malformed 時直接失敗，不得退回 V2。只有 V3 不存在時才讀 V2。
- write：只寫 V3，完成後重讀 V3 取得 revision；不得 touch、rename 或 delete V2。
- API route、HTTP status 與 client contract 不新增欄位；GET 由 V2 fallback 取得資料時仍回正規化 V3 envelope。
- 測試使用 OS temp directory，不得讀寫工作區 `data/`。

### 9.5 Slice、RD gate 與 handoff

| Slice | 交付內容 | Slice gate |
|---|---|---|
| S1 Domain＋V3 | types、pure domain、V3 parser／migration、server fallback、fixtures | Domain 與 storage targeted tests 全綠；V2 temp fixture 保留；`npm run build` |
| S2 設定平台 | Toolbar、overlay、CRUD／toggle／delete、Undo 接線、responsive 基礎 | 真實新增／編輯／停用／刪除與逐步 Undo；duplicate/self/unknown 不 commit；無第二層 modal |
| S3 偵測＋視覺 | derived match、OrgNode overlay、counterpart、relation layer、collapsed handling | low／medium／high／multi-match／selected／root／drag matrix；geometry diff 為 0；assignment 操作不阻擋 |
| S4 回歸＋QC | V1／V2 recovery、save/sync/copy/backup、三 viewport、error scan、README | 完整 `npm test`、`npm run build`、三 viewport 截圖、console／network／visible error 皆為 0 |

- 必須依 S1→S2→S3→S4；不得先以 UI hard-code 模擬規則，再回補 state／migration。
- RD 完成定義是 S1–S4 程式、測試與證據皆完成；只完成文件或畫面不計入 implementation completion。
- QA 依第 10 節矩陣建立 verification plan；QC 必須在真實渲染畫面獨立執行，不接受只讀程式碼或只看 unit test 代替 UI evidence。
- 未授權 deploy／release。未來若要 release，必須另走 deployment release gate，並重新確認 build artifact、V3 migration evidence 與目標環境資料備份。

### 9.6 QA／QC runtime boundary

- 實作可先執行不啟動伺服器的 `npm test`、`npm run build`。
- 真實 UI QC 才使用 `npm run dev:local` 的 5000 port；開始前記錄用途、port 與 owning process tree，完成 S2／S3／S4 當輪 QC 後只停止該任務所啟動的 process tree，並確認 5000 已釋放。
- 不得停止全部 `node.exe`、不得清除未知 port。完成清理後再次確認 protected 4173 仍 listening 且 ProJED 頁面可達。
- 若 5000 已有同專案且可安全復用的 runtime，可直接復用但不得把其他 task-owned runtime 納入本 DEV 清理範圍。

## 10. Executable test matrix

### 10.1 Automated

| ID | Test level／檔案 | Setup／action | Expected evidence |
|---|---|---|---|
| RISK-D-001 | Unit／`roleCombinationRisks.test.ts` | 計算 A＋B、B＋A | canonical key 完全相同 |
| RISK-D-002 | Unit | 新增有效 rule，再編輯 level | immutable 新陣列、ID 保留、原陣列不變 |
| RISK-D-003 | Unit | self pair、反向 duplicate、duplicate ID、unknown Role、unknown level | 各自回指定 code，rules 不變 |
| RISK-D-004 | Unit | enabled rule 與 disabled rule 使用相同 assignments | 只有 enabled rule 產生 match |
| RISK-D-005 | Unit | primary／secondary／acting 各一個 active pair | 三類均命中 |
| RISK-D-006 | Unit | validFrom 未到、validTo 等於 asOf、已過期 | 均不命中；沿用 validTo exclusive 語意 |
| RISK-D-007 | Unit | Role 分散在不同 employee、inactive position、orphan assignment | 均不命中且不 throw |
| RISK-D-008 | Unit | 同員工同 Role 多 Position、重複 assignment 輸入 | 每個實際 Position pair 一筆；完全重複輸入去重 |
| RISK-D-009 | Unit | 同 position 同時命中 low／medium／high | visual state 取 high，counterpart 去重且排序穩定 |
| RISK-D-010 | Unit | focused node 部分 counterpart hidden | relation 只含兩端可見、直接相關且穩定排序的 pair |
| RISK-S-001 | Unit／`documentStorage.test.ts` | create／parse／save／load 含 rules V3 | version 3 round trip 完整一致 |
| RISK-S-002 | Unit | 載入既有 V2 fixture | sourceVersion 2、輸出 V3、rules 為空、六類資料不變 |
| RISK-S-003 | Unit | 載入既有 V1 hierarchy fixture | sourceVersion 1、既有 migration 正確、rules 為空 |
| RISK-S-004 | Unit | malformed shape、self、duplicate pair／ID、unknown Role／level 的 V3 | fail closed 並回對應 code |
| RISK-S-005 | Unit | V3／V2／V1 localStorage keys 組合 | V3 優先；legacy migration 不刪原 key；invalid current 不 fallback |
| RISK-S-006 | Unit／`server/orgmasterApi.test.ts` | temp dir 只有 V2，read 後 write V3 | GET helper 回 V3、V3 新檔存在、V2 bytes 不變 |
| RISK-S-007 | Unit | temp dir 同時有 malformed V3 與 valid V2 | read reject，不 fallback V2 |
| RISK-R-001 | Regression | 執行既有 assignments、commands、hierarchy、layout、department、document tests | 既有 suite 0 failure |

### 10.2 Browser／QC

| ID | Viewport／action | Expected evidence |
|---|---|---|
| RISK-U-001 | 1440×900 開面板，新增低／中／高規則、編輯、停用、Undo、刪除、Undo | 一次操作對應一次 Undo；面板不推擠畫布；規則正確恢復 |
| RISK-U-002 | 建立 self／reverse duplicate | 表單內顯示錯誤，state/save 未變，任職與組織操作仍可用 |
| RISK-U-003 | 建立 low／medium／high 命中 | 節點只有點線／虛線／雙層視覺，無可見風險文字、badge、tooltip 或 KPI |
| RISK-U-004 | hover、Tab focus、選取命中節點 | 可見 counterpart 強調與暫時線同步；離開／取消選取後線消失 |
| RISK-U-005 | 收合其中一個 counterpart branch | hidden 端不畫線、不上移至祖先；可見命中節點保留自身外框 |
| RISK-U-006 | 命中期間拖入、移動、解除、Undo／redo assignment | 操作均不被阻擋；commit 後視覺立即重算 |
| RISK-U-007 | 比較開／關 rule 前的 node rect、department frame rect、hierarchy edge path | node width／height、frame bounds、edge path 均相同；relation layer pointer-events none |
| RISK-U-008 | root、selected、employee drop hover、drag ghost 與 high risk 疊加 | 每一個既有操作 cue 仍可辨識，drop 行為成功 |
| RISK-U-009 | 1024×768 | 面板可捲動、無裁切／重疊／非預期水平 overflow，畫布尺寸不因 open 改變 |
| RISK-U-010 | 390×844 | 全寬單欄規則列與表單可完整鍵盤／觸控操作，關閉後 focus 回入口 |
| RISK-U-011 | 開啟 reduced motion | 無循環／閃爍，若有一次性 emphasis 立即完成或停用 |
| RISK-U-012 | S4 全流程 | console error 0、失敗 HTTP／API 0、畫面可見 runtime／HTTP／API error 0 |

### 10.3 QA FMEA

評分採 Severity／Occurrence／Detection 各 1–10，RPN＝S×O×D；本表為實作前風險與完成後控制證據的對照。

| Failure mode | Effect | Cause | S／O／D／RPN | Prevention／detection control | 完成結果 |
|---|---|---|---:|---|---|
| 反向或重複 Role pair 進入 state | 同一職務組合出現衝突等級 | 只在 UI 防重、未 canonicalize | 7／3／3／63 | Domain canonical key＋RISK-D-001／003＋RISK-U-002 | Passed；反向 duplicate 就地拒絕，未 commit |
| inactive／orphan 任職被誤判 | 錯誤標示無效職位 | 未共用 active assignment 與 Position validation | 6／3／2／36 | RISK-D-005～008 | Passed；Unit 覆蓋有效期間、類型、inactive 與 orphan |
| malformed V3 靜默 fallback V2 | 掩蓋資料損壞並遺失規則 | 讀取順序未 fail closed | 9／2／2／36 | RISK-S-004／007 | Passed；V3 存在但損壞時直接失敗 |
| V3 寫入覆蓋 V2 | 失去 migration 回復來源 | server write 共用舊檔路徑 | 9／2／2／36 | temp-dir byte preservation RISK-S-006 | Passed；write 只建立 V3，V2 保留 |
| 風險 overlay 改變 layout | 節點、部門框或原連線漂移 | border 參與盒模型或關係層層級錯誤 | 8／3／3／72 | pseudo/SVG overlay＋RISK-U-007 geometry diff | Passed；22 節點、部門框、edge path 開關前後完全一致 |
| 命中風險後阻擋任職 | 使用者無法維護真實組織 | 把偵測結果接入 command validity | 9／2／3／54 | derived-only contract＋RISK-U-006／008 | Passed；拖入、解除、Undo 均成功且視覺立即重算 |
| 相同內容的多視窗 revision 清空 Undo | 規則異動無法穩定復原 | polling 對相同 state 仍 `replaceState` | 6／4／4／96 | state signature 相同時只更新 revision；延遲 2.2 秒後重做 RISK-U-001 | Found／fixed／retested；Undo 保留 |
| 取消內嵌表單後焦點遺失 | 第二次 Escape 無法關閉面板 | focused select 隨表單卸載 | 4／4／3／48 | 取消後 focus 回 panel；RISK-U-010 連續 Escape | Found／fixed／retested；第二次 Escape 關閉並回入口 |

## 11. Failure modes and recovery

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| 自我 Role 配對或重複 pair | 設定表單就地顯示資料錯誤，不 commit | 建立第二條規則或影響任職 |
| 規則參照不存在 Role | 新建／編輯拒絕 commit；載入文件 fail closed | 靜默刪除規則後繼續儲存 |
| V1／V2 migration 失敗 | 保留舊檔與 raw payload，進既有 recovery | 覆寫 V2、回範例資料或猜測規則 |
| 規則比對遇到 orphan assignment | 不產生 match；文件 validator／測試揭露資料問題 | 對未知 Position 畫風險或拋出 runtime error |
| counterpart 被收合 | 保留可見節點自身外框，不畫不存在的連線 | 將風險錯標到祖先節點 |
| 視覺與 selected／drag 狀態衝突 | 保留操作狀態優先，風險以獨立 overlay 疊加 | 改 node geometry 或讓 drop cue 不可見 |
| 規則面板儲存失敗 | 保留表單輸入並顯示設定表單錯誤 | 關閉面板、產生部分規則或阻擋組織編輯 |

## 12. Final acceptance contract

### 12.1 功能與資料

- [x] 可新增、編輯、啟用、停用及刪除 Role pair 規則；每次成功異動是一筆 Undo history。
- [x] A＋B 與 B＋A 視為同一 pair；自我 pair、duplicate、未知 Role 與未知 level 不得進入 state。
- [x] 規則可保存選填原因；有填寫時設定清單可查看，留白仍可新增／編輯，組織圖不呈現原因文字。
- [x] 同一員工同時具有命中 pair 的 active assignments 時產生 match；不同員工、已結束任職、inactive Position 不產生 match。
- [x] primary、secondary、acting 均依相同有效期間語意參與比對。
- [x] 多條規則命中同一節點時採最高等級；衍生結果順序穩定且不持久化。
- [x] V3 round trip 保留規則；V1／V2 migration 完整保留既有組織資料並加入空規則集合。
- [x] 首次 V3 儲存不覆寫或刪除 `data/orgmaster-document.v2.json`。

### 12.2 非阻擋與回歸

- [x] 命中規則後，新增、拖曳、取代、移動、解除任職及 Undo／redo 均維持既有結果。
- [x] 風險規則不參與 `executeOrganizationCommand` validity，不改 parentPositionId、departmentId、assignmentType 或有效期間。
- [x] 規則異動可觸發既有 dirty、自動儲存、正式儲存、多視窗同步、副本與備份流程。
- [x] 任何風險都不產生 disabled、確認對話框、拒絕訊息或儲存限制。

### 12.3 UI／UX

- [x] 組織圖無可見風險文字、badge、tooltip、drawer、banner 或 KPI；不可見 accessibility 語意允許存在。
- [x] 一般與高風險可由虛線／雙層等非色彩訊號辨識，root、selected 與一般節點皆清楚。
- [x] 選取、focus 或 hover 風險節點時，可辨識所有目前可見的 counterpart；離開後不保留跨圖連線。
- [x] 風險效果不套用在員工姓名或員工列，不改變節點高度／寬度、edge route 或部門 frame bounds。
- [x] 設定面板以清單為主，不出現責任、期限、狀態、歷程或大型說明卡；桌機不推擠畫布，手機可完整操作。
- [x] 無持續閃爍；reduced-motion 下沒有非必要動畫。
- [x] 1440×900、1024×768、390×844 無重疊、裁切、非預期水平 overflow 或可見 runtime error。

## 13. Required evidence

### Automated

- pair canonicalization、self pair、duplicate、unknown Role、level validation tests；原因選填與前後空白正規化由 round-trip／CRUD tests 覆蓋。
- active period、assignmentType、different employee、inactive Position、multiple matches、highest level、stable order tests。
- rule CRUD immutable update tests；單次 history boundary 與 Undo／redo 由 RISK-U-001／006 真實操作證據驗證。
- V3 create／parse／round trip、V2→V3、V1→V3、optional reason migration、invalid V3 fail-closed、V2 file preservation tests。
- 既有 assignment、organization command、layout、department group、document storage tests 全部通過。
- `npm test` 與 `npm run build`。

### Manual／QC

- 真實設定流程：開啟面板、新增低／中／高規則、編輯等級、停用、Undo、刪除、Undo。
- 真實任職流程：建立命中兼任、移動其中一筆、解除、Undo／redo；每一步操作不中斷且視覺同步。
- 節點狀態矩陣：normal、root、selected、drag target、low、medium、high、multi-match、counterpart collapsed。
- 截圖：三個 viewport 的設定面板、低／中／高風險、counterpart 聚焦；畫面文字掃描確認無風險提示文案。
- DOM／geometry：風險前後 node width／height、department frame bounds 與 edge route 不變；relation layer `pointer-events: none`。
- console error 0；所有 in-scope surface 無可見 HTTP／API／runtime error。

### Completion evidence（2026-08-16）

- Automated：完整 `npm test` 為 14 files／105 tests passed；`npm run build` 成功；新增 Role mapping、三級 level validation 與舊 `warning` → `medium`、選填 reason 的 V3 migration test。
- Rule／Undo：設定面板實際顯示低／中／高三個選項與選填原因欄位；鉦富機械現階段基準收斂為 6 組啟用規則，分布為高 4／中 2／低 0。
- Detection／relation：目前任職安排沒有命中新基準，避免把必要的主管跨職能、工程兼品保或跨部門協調標成異常；低／中／高視覺與關係層仍由自動測試及既有 QC 證據覆蓋，組織圖節點不出現可見風險文字，relation layer 維持 `pointer-events: none`。
- Non-blocking：風險只改變 derived visual state；未接入 assignment、position、hierarchy 或保存阻擋條件。
- Geometry：開關全部規則前後，22 個可見 node rect、department frame rect 與 hierarchy edge path 全部逐值相同。
- Collapse／accessibility：收合總經理分支後只保留 1 個可見 high 節點且 relation line 為 0；連續 Escape 先取消表單、再關閉面板並把焦點還給 Toolbar；reduced-motion 為 0.01ms／1 iteration。
- Responsive／error sweep：1440×900、1024×768、390×844 均無水平 overflow、可見錯誤或 server error 文案；browser console Errors 0／Warnings 0，in-scope GET／PUT 均為 HTTP 200。
- Persistence：實際 `data/orgmaster-document.v3.json` 為 version 3，保存鉦富機械 6 條啟用規則（high 4、medium 2、low 0）及各自原因；重新整理與等待自動保存後規則與原因仍保留，空白原因也可保存；初次載入自動保存競態已修正；`data/orgmaster-document.v2.json` 仍存在。
- Role mapping：V3／V2 的 `設計專員`、`行政總務` 已各自指向獨立 Role；職位 Role selector、同名 Role 重用與新 Role 原子建立均有程式與測試證據。
- Screenshots：`output/playwright/dev-019/dev019-settings-rules-1440x900.png`、`dev019-risks-1440x900.png`、`dev019-risk-relation-1440x900.png`、`dev019-settings-1024x768.png`、`dev019-settings-390x844.png`。
- Runtime：本輪 5000 runtime 用於真實頁面 QC；交付前依 runtime boundary 清理 task-owned process，並確認 protected 4173 仍 listening。
- Spec Drift／Convergence：`In sync`；無高影響 deferred scope，未執行 deploy 或 release。

### Configuration update evidence（2026-08-18）

- Data：現行版 `data/orgmaster-versions/current-c9ad8769d8d1d4319e29.json` 保存 10 組啟用規則，分布為 high 8／medium 2／low 0；Role 參照、無方向 pair 唯一性、自我配對、等級與 160 字原因限制皆通過檢查。
- Detection：以 2026-08-18 為基準檢查 12 個有效員工任職群組，風險命中數為 0；未將現行必要主管跨職能、工程兼品保或跨部門協作誤標為異常。
- Version isolation：兩份既有草稿的規則數均維持 0；本次未修改草稿、職務、任職、階層或產品程式。
- Automated／API：完整 `npm test -- --run` 為 22 files／158 tests passed；`npm run build` 成功；現行版 workspace API GET 為 HTTP 200、`loadStatus: ready` 且回傳 10 組規則。
- UI QC：localhost:5000 的 1440×900、1024×768、390×844 實際設定面板均顯示 10 列、8 個高風險、2 個中風險與 10 個已啟用開關；無水平 overflow、可見錯誤、console error／warning 或失敗 API，內部清單可捲至最後一列。
- Screenshots：`output/playwright/dev-019/dev019-10-rules-1440x900.png`、`dev019-10-rules-1024x768.png`、`dev019-10-rules-390x844-top-final.png`、`dev019-10-rules-390x844-bottom.png`。
- Runtime：重用既有 localhost:5000 進行 QC，未停止或重啟該環境；task-owned Playwright session 已關閉。protected 4173 仍 listening 且 HTTP 200。
- Spec Drift／Convergence：`In sync`；本次為使用者明確核准的基準規則 intentional replacement，未變更資料介面、偵測語意或非阻擋 UI 契約，未執行 deploy／release。

## 14. Stop conditions

以下任一項成立時，不得宣稱 DEV-019 可進入完成或 QA/QC handoff：

- 任一風險命中會阻擋、拒絕、disabled 或回滾組織／任職設定。
- 組織圖必須顯示風險文字才能理解常態視覺，或只靠顏色區分等級。
- 規則被存成 Position.title、個人標記或第二份 assignment 狀態。
- V1／V2 migration 可能覆寫原始文件，或 V3 儲存會刪除既有 V2 檔案。
- 風險 overlay 改變節點幾何、部門 frame、edge routing，或遮擋 drag／selected 回饋。
- duplicate pair、未知 Role 或 malformed rule 可進入 persisted state。
- 必要自動測試、三 viewport、可見錯誤掃描或非阻擋任職回歸缺少證據。

## 15. Governance conclusion

- 文件成熟度：`RD Implementation Complete / QA-QC Passed`；S1–S4 程式、migration、測試、三 viewport 與真實互動證據均已完成。
- Spec Impact Preflight：`No conflict`。本 DEV 新增獨立規則與衍生視覺，不改 DEV-002／008／011 的 assignment 語意，也不改 DEV-017／ADR-001 的 hierarchy authority。
- Authoritative source：本文件是 DEV-019 的產品、資料、UI、相容性與驗收權威來源；`dev_task.md` 只保留任務摘要與執行邊界。
- ADR：不建立。Role pair 決策目前只治理 DEV-019、無外部契約且仍可在實作前安全調整；若未來加入 Position／department／permission 複合規則，再重新評估 ADR。
- Deferred Scope Audit：沒有未處理的高影響 deferred scope；責任、期限、核准、歷程與阻擋流程是已拒絕範圍，不是 future phase。
- Blocker：無。DEV-019 本機交付完成；本輪未授權部署或 release。
