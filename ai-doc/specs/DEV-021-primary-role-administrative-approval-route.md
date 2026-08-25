# DEV-021：主職、兼任與直屬主管路徑

狀態：已調整完成（直屬主管路徑；行政核准功能暫緩）  
文件成熟度：`RD Implementation Complete / QA-QC Passed`  
風險等級：Medium（任職語意、V4 本機文件 migration、主要員工細節 UI 與跨模組衍生路徑）  
權威來源：本文件  
父交付點：DEV-002、DEV-008、DEV-011、DEV-017、DEV-019  
來源 ID：`USER-2026-08-16-PRIMARY-ROLE-ADMIN-APPROVAL-ROUTE`

## 1. Outcome

OrgMaster 在保留一人多職、多人同職位與代理任職的前提下，明確回答兩個問題：

1. 這位員工目前哪一筆任職是主職，哪些是兼任或代理？
2. 依這位員工的主職，直屬主管是哪一位？

目前版本採「一人最多一個主職、一條直屬主管路徑」：直屬主管由主職的直接上級職位目前任職者推導，只做顯示，不建立行政核准人、例外覆寫、請假申請、簽核交易、通知或稽核歷程。

## 2. Human Decision Brief

決策日期：2026-08-16  
決策來源：使用者在 HCS 引導模式回覆 `1B 2A 3A`

- `Human Confirmed`：目前 phase 完成主職／兼任與直屬主管路徑顯示；不建立請假單或完整行政工作流。
- `Human Confirmed`：直屬主管只依主職的直接上級職位顯示，不增加例外核准人欄位。
- `Human Confirmed`：舊資料若有多個主職候選，不自動猜測；標示「主職待設定」，由管理者選定後才顯示直屬主管路徑。
- Rejected：所有兼任主管共同核准、每次由員工選主管、建立完整多重匯報模型、同一 DEV 實作請假申請與通知。
- Allowed engineering decisions：欄位與函式命名、純函式模組邊界、V4 migration 實作順序、測試 fixture 與 CSS 細節，由 RD 依本契約決定。

2026-08-17 需求修訂：使用者要求暫緩行政核准功能；本輪撤下「行政流程路徑」與「指定例外核准人」的使用者入口，改顯示「直屬主管路徑」。既有 V4 行政核准欄位與相容讀取先保留，不再由目前 UI 寫入或驅動畫面。

使用思考習慣：#問對問題、#限制條件、#可驗證性

## 3. Problem and system constraint

現況已能保存同一員工的多筆 `Assignment`，但拖入職位一律建立 `assignmentType = primary`；`Inspector` 只能顯示「正式／兼任／代理」，沒有可維護且唯一的主職來源。`Position.parentPositionId` 已由 ADR-001 定義為正式主要職位上下級的唯一權威來源，但產品尚未把它轉換為員工層級的行政核准責任。

真正問題不是缺少更多主管欄位，而是「主職、任職性質與職位上下級」尚未用簡單方式呈現。若直接讓每個兼任主管進入行政核准鏈，員工與主管都必須理解複雜矩陣，違反本功能的核心限制：

- 員工端只需要辨識主職、其他任職與一位直屬主管。
- 目前不處理行政核准例外，避免把未確認的流程邏輯轉嫁給員工。
- 一個事實只在一個主要位置維護；不得在職位 Inspector、員工細節與組織圖建立三套可寫來源。

## 4. Current phase scope

### 4.1 主職與其他任職

- 每位員工可有零至多筆目前有效任職，但最多只有一筆 `primaryAssignmentId`。
- `primaryAssignmentId` 指向的任職顯示為「主職」。
- 其他一般任職顯示為「兼任」；代理任職顯示為「代理」。
- 主職只能指向該員工目前未結束的一般任職，不能指向代理任職、其他員工任職或不存在的任職。
- 沒有任何任職的員工可維持無主職；有任職但未選主職者顯示「主職待設定」，不阻擋文件載入與一般組織圖編輯，但直屬主管路徑保持未設定。
- 新增第一筆一般任職且該員工沒有其他未結束的一般任職時，可安全自動設為主職；其他情況不得自動改選主職。

### 4.2 直屬主管與路徑預覽

- 每位已設定主職的員工，依主職的 `Position.parentPositionId` 找直接上級職位。
- 直接上級職位恰有一位其他目前任職者時，顯示該員工為直屬主管。
- 根職位、上級空缺、上級多人任職或只有本人時，顯示未設定原因，不自動挑選其他主管。
- 直屬主管路徑只回答「組織架構上的直接上級是誰」，不代表行政核准、法定假別、預算或品質放行權限。

### 4.3 UI integration

- 員工細節是主職的主要維護入口；直屬主管路徑為唯讀衍生資訊。
- 組織圖職位卡與職位 Inspector 只顯示衍生的「主職／兼任／代理」短標籤，不提供第二套主職編輯入口。
- 員工細節先顯示主職，再顯示其他任職；直屬主管路徑在員工層顯示一次，不在每個任職列重複。
- 正常解析狀態保持安靜；只有主職待設定或直屬主管未設定時，在受影響區塊顯示原因。

## 5. Out of scope

- 請假、加班、出差或其他申請單、送出、撤回、核准、駁回、會簽、知會與代理簽核交易。
- 工作流規則矩陣、假別資格、法規判斷、SLA、通知、郵件、行事曆或 audit log。
- 行政核准人、例外核准人覆寫與行政簽核路徑；此功能暫緩，未由本輪 UI 使用。
- 多重直屬主管、虛線／功能／專案匯報、`ReportingLine` 實體或每個流程各自設定核准鏈。
- 登入、角色權限、跨帳號資料、多人協作、外部資料庫、第三方 HR 系統或正式環境變更。
- 任職比例、FTE、工時容量、績效評分、薪酬或預算權限。
- 代理任職的新增／編輯 UI；既有代理資料只需在 V4 保留並正確顯示。
- 自動把未解析員工分配給總經理，或用職位層級、姓名、建立順序猜測主職／核准人。

## 6. Authoritative data contract

### 6.1 V4 domain types

```ts
export type AssignmentType = 'regular' | 'acting'

export interface Employee {
  id: string
  name: string
  departmentIds: string[]
  primaryAssignmentId: string | null
  administrativeApproverOverrideEmployeeId: string | null
}

export interface Assignment {
  id: string
  employeeId: string
  positionId: string
  assignmentType: AssignmentType
  validFrom: string
  validTo: string | null
}
```

權威規則：

- `Employee.primaryAssignmentId` 是主職的唯一持久化來源；不得從陣列第一筆、職位層級、`departmentIds` 或顯示順序推測主職。
- `Assignment.assignmentType` 只回答一般或代理任職，不再同時承擔主職／兼任語意。
- `Position.parentPositionId` 繼續由 ADR-001 管理主要職位上下級；DEV-021 不新增第二份主要職位 parent。
- `administrativeApproverOverrideEmployeeId` 只保存例外核准人，不是完整 reporting line、權限授權或流程核准紀錄。
- 行政核准欄位目前僅為既有 V4 文件的相容讀取資料；本輪 UI 不顯示、不寫入，也不以它決定直屬主管。
- `Employee.departmentIds` 保持既有多部門歸屬語意，不用來推導主職或核准人。

### 6.2 Responsibility invariants

1. `primaryAssignmentId = null` 合法。
2. 非 `null` 時，必須指向同一員工、`validTo = null`、`assignmentType = regular` 且 position 仍存在且 active 的任職。
3. 每位員工因只有一個 reference，自然最多一個主職；不得另加 `isPrimary` 到每筆 Assignment 形成雙來源。
4. `administrativeApproverOverrideEmployeeId` 必須為 `null` 或指向另一位現存員工；不得自我核准。
5. 刪除員工時，其他員工指向該員工的 override 必須在同一原子操作清為 `null`。
6. 關閉、移動、取代或刪除主職任職時，必須在同一 commit 更新 `primaryAssignmentId`；不得留下 dangling reference。
7. 文件 parser 驗證結構與引用，不使用目前系統時間重新解釋歷史；current mutation 才使用既有 `asOf` 判斷有效任職。

### 6.3 Validation and mutation result

新增 `src/employeeResponsibilities.ts`，提供不依賴 React 的純函式：

```ts
type EmployeeResponsibilityValidationCode =
  | 'PRIMARY_ASSIGNMENT_UNKNOWN'
  | 'PRIMARY_ASSIGNMENT_WRONG_EMPLOYEE'
  | 'PRIMARY_ASSIGNMENT_CLOSED'
  | 'PRIMARY_ASSIGNMENT_ACTING'
  | 'PRIMARY_POSITION_INACTIVE'
  | 'APPROVER_OVERRIDE_UNKNOWN'
  | 'APPROVER_OVERRIDE_SELF'

type EmployeeResponsibilityMutationCode =
  | 'UNKNOWN_EMPLOYEE'
  | 'UNKNOWN_ASSIGNMENT'
  | 'ASSIGNMENT_NOT_OWNED'
  | 'ASSIGNMENT_NOT_CURRENT'
  | 'ACTING_CANNOT_BE_PRIMARY'
  | 'UNKNOWN_APPROVER'
  | 'SELF_APPROVER'
  | 'HIERARCHY_APPROVER_ALREADY_UNIQUE'

type EmployeeResponsibilityMutationResult =
  | { status: 'applied'; state: OrgDirectoryState }
  | { status: 'noop'; state: OrgDirectoryState }
  | { status: 'rejected'; code: EmployeeResponsibilityMutationCode; state: OrgDirectoryState }

function validateEmployeeResponsibilities(state: OrgDirectoryState):
  | { ok: true }
  | { ok: false; code: EmployeeResponsibilityValidationCode; employeeIds: string[]; assignmentIds: string[] }

function setPrimaryAssignment(
  state: OrgDirectoryState,
  employeeId: string,
  assignmentId: string,
  asOf?: string,
): EmployeeResponsibilityMutationResult

function setAdministrativeApproverOverride(
  state: OrgDirectoryState,
  employeeId: string,
  approverEmployeeId: string | null,
  asOf?: string,
): EmployeeResponsibilityMutationResult
```

相同值必須回 `noop`，不得新增 Undo history 或觸發不必要儲存。

## 7. Administrative approval resolver（暫緩，保留相容程式）

`src/administrativeApproval.ts` 與既有測試暫保留，僅供舊 V4 文件與後續 phase 相容；目前 UI 不呼叫、不顯示其結果，也不提供 override mutation 入口。直屬主管顯示由 `src/directSupervisor.ts` 負責。

```ts
type AdministrativeApprovalUnresolvedReason =
  | 'NO_PRIMARY_ASSIGNMENT'
  | 'PRIMARY_ASSIGNMENT_NOT_CURRENT'
  | 'NO_PARENT_POSITION'
  | 'PARENT_POSITION_VACANT'
  | 'PARENT_POSITION_MULTIPLE_ASSIGNEES'
  | 'SELF_APPROVAL_ONLY'
  | 'INVALID_OVERRIDE'

type AdministrativeApprovalResolution =
  | {
      status: 'resolved'
      source: 'position_hierarchy' | 'employee_override'
      employeeId: string
      approverEmployeeId: string
      primaryAssignmentId: string
      primaryPositionId: string
      supervisorPositionId: string | null
    }
  | {
      status: 'unresolved'
      employeeId: string
      reason: AdministrativeApprovalUnresolvedReason
      primaryAssignmentId: string | null
      primaryPositionId: string | null
      supervisorPositionId: string | null
    }

function resolveAdministrativeApprover(
  state: OrgDirectoryState,
  employeeId: string,
  asOf?: string,
): AdministrativeApprovalResolution
```

解析順序固定：

1. 找到員工與合法、目前有效的 `primaryAssignmentId`；沒有主職即停止，不允許 override 掩蓋主職缺口。
2. 若有有效 override，直接回 `employee_override`。
3. 由主職 position 取得 `parentPositionId`；沒有 parent 回 `NO_PARENT_POSITION`。
4. 取得上級職位目前有效任職，依 `employeeId` 去重並排除本人。
5. 去重後恰有一位，回 `position_hierarchy`；零位依原始候選區分空缺或只有本人；兩位以上回多人未解析。

Resolver 不得往更高祖先自動跳級，也不得把總經理、部門經理或第一筆任職當隱含 fallback。

## 8. Assignment and transaction contract

所有受影響操作必須採 `current state → proposed state → responsibility validation → organization/risk validation → single commit`。拒絕時 state signature、Undo stack 與儲存狀態均不得改變。

| Operation | Required behavior | Forbidden behavior |
| --- | --- | --- |
| 新增第一筆一般任職 | 建立 assignment；若員工沒有其他未結束的一般任職且主職為 null，設定新 ID 為主職 | 把代理任職設為主職 |
| 新增第二筆以上一般任職 | 建立 assignment；既有主職保持，無主職者仍待設定 | 以位置、層級或新增順序猜主職 |
| 移動任職 | 若 source 是主職，主職 reference 原子改指新 assignment；目標已存在同員工任職時改指保留的 target assignment | 先關閉 source 後留下 dangling reference |
| 單人職位取代 | 關閉原任職；若被取代員工的主職被關閉，清為 null | 自動替被取代員工挑另一主職 |
| 解除／刪除／關閉主職任職 | 關閉 assignment 並清主職；其他任職保留 | 靜默挑選下一筆任職 |
| 設為主職 | 僅改該員工 `primaryAssignmentId`；原主職自動成為一般兼任顯示 | 改 Assignment ID、職位或有效期間 |
| 行政核准人例外設定 | 暫緩；既有資料保留但目前 UI 不可寫入 | 把行政核准邏輯帶回本輪直屬主管畫面 |
| 刪除核准人員工 | 同一 commit 清除所有引用該員工的 override | 留下 invalid reference 或改指其他人 |
| hierarchy／任職變動 | resolver 即時重算；既有 override 持續優先並明確標示 | 靜默清除或改寫既有 override |

`assignEmployee`／`unassignEmployee` 可保留為低階 assignments helper，但 App 不得在需要同步員工責任欄位的流程只提交其回傳陣列。RD 應在 `employeeResponsibilities.ts` 建立包覆完整 `OrgDirectoryState` 的原子 helper，或擴充既有 organization command；不得由 UI 分兩次 `commitState` 補寫。

## 9. UI / UX behavior contract

### 9.1 UX Intent

- 使用者與情境：總經理、管理主管或幕僚維護人員多職配置，並查詢組織上的直屬主管。
- 主要任務與成功結果：在員工細節辨識唯一主職、其他任職與一位直屬主管；有缺口時能在原位置看懂原因。
- 熟悉 pattern：員工清單選人後在右側細節查看／編輯；不新增獨立「流程中心」。
- 主要工作物件：員工、該員工的任職清單、直屬主管路徑。
- 共用資訊：員工姓名與直屬主管各顯示一次；任職列只顯示職位、部門與主職／兼任／代理差異。
- 操作方向：主職排第一；其他任職依既有職位樹順序；可操作項使用熟悉 button/menu，成功後內容直接更新並支援 Undo。
- 最可能誤解：`Position.parentPositionId` 是職位上下級，不代表畫面上每一位任職者都自動成為行政核准人。
- 安全預設：沒有唯一主職或直屬主管時顯示未設定，不猜測、不自動跳級。
- 可降層資訊：解析來源、職位 ID、assignment ID 與完整規則放在 details／audit 說明，不常駐主畫面。
- 不能發生：同一員工顯示兩個主職、兼任主管被誤顯示成共同核准、員工必須自行選擇每次找誰。

### 9.2 Employee detail panel

沿用 `DirectoryDetailPanel`，員工內容依序：

1. 唯一員工主檔。
2. `主職`：有值時顯示一列；沒有值但有任職時顯示「主職待設定」。
3. `其他任職`：一般任職顯示「兼任」，代理顯示「代理」；沒有其他任職時不建立空白大區塊。
4. `行政報備核准`：只顯示一位人名與來源短標籤，或一個未解析原因與恢復操作。

每筆非代理任職提供單一低干擾動作「設為主職」；目前主職不顯示同名動作。例外核准人的選擇器只在 resolver 未解析時出現；已設定 override 時顯示「例外指定」與「清除例外」，不新增永久說明卡。

### 9.3 Organization chart and position Inspector

- `OrgNode` 中每位任職者旁使用短文字標記 `主`、`兼`、`代`，並有完整 accessible label；顏色不得是唯一訊號。
- `Inspector` 的任職者列使用完整標籤「主職／兼任／代理」，但維持 read-only role classification；點選員工可回員工細節維護。
- 不在員工主清單列重複顯示主職或核准人，維持 DEV-010 唯一主檔與關聯細節原則。
- 不新增每列「下一步」、大型 KPI、流程圖卡或多層 tabs。

### 9.4 Visible states and recovery

| Resolver state | Primary text | Recovery |
| --- | --- | --- |
| hierarchy resolved | 核准人姓名＋「由主職上級推導」 | 無額外 CTA |
| override resolved | 核准人姓名＋「例外指定」 | 清除或變更例外 |
| no primary | 主職待設定 | 在任職列設為主職 |
| root position | 主職沒有上級職位 | 選擇例外核准人 |
| parent vacant | 上級職位尚未任職 | 指派上級職位或選例外核准人 |
| parent multiple | 上級職位有多位任職者 | 選擇一位例外核准人 |
| self only | 上級職位沒有其他可用核准人 | 選擇例外核准人 |

成功設定使用內容更新與低干擾 status／toast；不使用確認 modal。所有變更必須能以既有 Undo/redo 回復。

## 10. Local document V4 and migration

### 10.1 V4 format and paths

- `ORG_DOCUMENT_VERSION = 4`。
- local storage 新 key：`orgmaster.local-document.v4`、`orgmaster.local-draft.v4` 與對應 recovery key。
- server canonical file：`data/orgmaster-document.v4.json`；讀取順序 V4 → V3 → V2，只在較新檔不存在時 fallback。
- V4 檔存在但 JSON／shape／reference 無效時 fail closed，不得回退到 V3 並假裝成功。
- writer、備份與副本一律輸出 V4；成功升級前保留原 V3/V2/V1 payload 與 storage key。
- `/api/orgmaster/document` route 與 revision header 契約不變，只有 document envelope version 與 state shape 改變。

### 10.2 Legacy V3 → V4 normalization

對每位 legacy 員工：

1. 找出該員工 `validTo = null` 且 legacy `assignmentType = primary` 的任職。
2. 恰有一筆時，`primaryAssignmentId` 設為該 ID。
3. 零筆或多筆時，設為 `null`；多筆不得依職位層級、陣列順序或名稱選擇。
4. `administrativeApproverOverrideEmployeeId` 一律設為 `null`。
5. 所有 legacy `primary`／`secondary` assignment 轉成 `regular`；legacy `acting` 轉成 `acting`，保留 ID、employee、position 與有效期間。
6. 保留既有部門、職位樹、layout、role combination risk rules 與 document savedAt。

V1/V2 文件先沿用既有 hierarchy／risk migration 正規化，再進同一 V4 responsibilities normalization；不得為不同來源實作三套主職猜測規則。

### 10.3 V4 parse validation

- `Employee` 必須包含兩個新欄位；V4 不接受缺欄位後靜默補值。
- V4 `Assignment.assignmentType` 只接受 `regular | acting`；legacy enum 只在 V1–V3 migration 邊界接受。
- 完成 organization hierarchy、role risk 與 employee responsibility 三組 validation 才可載入／保存。
- migration 後 `primaryAssignmentId = null` 是合法且可持久化的待設定狀態，不是文件 corruption。

## 11. Current architecture impact

| File / module | Action | Required implementation |
| --- | --- | --- |
| `src/types.ts` | 修改 | V4 Employee 欄位；AssignmentType 改為 `regular | acting`；resolver／mutation shared types 可放對應 domain module |
| `src/employeeResponsibilities.ts` | 新增 | responsibility validator、主職／override mutation、完整 state reconciliation |
| `src/employeeResponsibilities.test.ts` | 新增 | invariant、mutation、replacement／move／delete 原子測試 |
| `src/administrativeApproval.ts` | 新增 | 單一行政核准人 pure resolver |
| `src/employeeResponsibilities.test.ts` | 相容保留 | 舊行政核准 resolver matrix；不屬於目前 UI 入口 |
| `src/assignments.ts` | 修改 | 低階 AssignmentType、ID／close 行為支援；不得單獨承擔 Employee reference 同步 |
| `src/assignments.test.ts` | 修改 | regular／acting 與既有多人／移動／解除行為 |
| `src/data.ts`、`src/screenshotData.ts` | 修改 | fixture 明確指定 primaryAssignmentId；鉦富示範資料主職分別為總經理、生產部經理、管理部經理，其餘一般任職為兼任 |
| `src/organizationCommands.ts` | 修改 | 刪除職位／分支、關閉任職時同步 reconcile Employee 主職與 overrides，維持單一 commit |
| `src/organizationCommands.test.ts` | 修改 | 刪除／promote／replacement 後責任引用不懸空 |
| `src/directories.ts` | 修改 | 刪除員工清除其他員工 override；刪除／轉移仍保留既有部門行為 |
| `src/directories.test.ts` | 修改 | employee delete override cleanup、state atomicity |
| `src/directSupervisor.ts` | 新增 | 依主職直接上級推導直屬主管的唯讀 resolver |
| `src/components/DirectoryDetailPanel.tsx` | 修改 | 主職優先、其他任職與直屬主管唯讀路徑 |
| `src/components/Inspector.tsx` | 修改 | 任職標籤依 Employee.primaryAssignmentId 衍生；不新增第二寫入入口 |
| `src/components/OrgNode.tsx` | 修改 | `主／兼／代` 短標籤與 accessible name |
| `src/App.tsx` | 修改 | 接上主職 mutation 與直屬主管顯示；所有受影響 assignment command 單次 commit |
| `src/documentStorage.ts` | 修改 | V4 parser/writer、V1–V3 migration、keys、typed validation failure 與 recovery |
| `src/documentStorage.test.ts` | 修改 | V4 round-trip、V3 ambiguous migration、source preservation、invalid V4 fail closed |
| `server/orgmasterApi.ts` | 修改 | V4 canonical path，V3/V2 fallback；較新檔無效不 fallback |
| `server/orgmasterApi.test.ts` | 修改 | V3→V4 promotion、V4 priority、malformed V4 fail closed |
| `src/serverDocumentStorage*.ts` | 檢查／必要時修改 | API route 不變；測試預期 document version 4 |
| `src/index.css` | 修改 | 最小標籤、員工細節分層、未解析狀態與窄 viewport 樣式 |
| `data/orgmaster-document.v4.json` | 由實作 migration 產生 | 保存合法 V4；不得覆寫或刪除 V3 原檔 |

不新增 production dependency、環境變數、API route、外部 provider、Auth 或 deployment 設定。

## 12. Dependencies and execution boundary

### Dependencies

- DEV-002／008／011：員工、職位、Assignment 與多人任職基礎。
- DEV-017／ADR-001：`Position.parentPositionId` 為主要職位上下級唯一權威來源。
- DEV-019：兼任風險由同一員工有效任職與 Role pair 衍生；DEV-021 不改風險規則，只更新 assignment fixture／enum 相容。
- DEV-015：本機文件、server document、Undo/redo 與 recovery 邊界。

### Execution boundary

- 本文件允許 RD 修改本機 schema/type、V4 migration、domain resolver/mutations、現有前端 UI、tests 與 canonical local data file。
- 本文件不允許實作申請／簽核交易、通知、Auth、外部服務、production、deploy 或 release。
- DEV-020 若未先實作，DEV-021 直接升級目前單一文件到 V4；未來 DEV-020 草稿工作區必須包覆完整 V4 `OrgDirectoryState`，不得退回 V3 shape。
- 若 RD 發現實作必須新增 `ReportingLine`、流程規則矩陣、權限系統或第三方套件，停止並回 PM；不得以工程便利擴張 scope。

## 13. RD slices and phase gates

### Slice 1：V4 types、validator、resolver 與 migration

1. 修改 types／fixtures，建立 `employeeResponsibilities.ts` 與 `administrativeApproval.ts` 純函式及 tests。
2. 更新 documentStorage V4 parser/writer、V1–V3 normalization、local keys 與 server V4 path。
3. 更新所有 fixture／risk／hierarchy tests 至可 build，但尚不接 UI。

Gate：第 14.3 節 `D-*`、`R-*`、`M-*` 全過；`npm test`、`npm run build` 成功；V3 原始來源未刪除或覆寫。任何 migration 會猜主職即停止。

### Slice 2：原子任職與責任 mutation

1. 包覆 assign／move／replace／unassign／delete，確保 Assignment 與 Employee responsibility 一次 commit。
2. 接上 set-primary、set／clear override 與 Undo/redo。
3. 搜尋所有 assignment closure／employee delete 寫入，移除會留下 dangling reference 的 bypass。

Gate：第 14.3 節 `C-*` 全過；拒絕／noop state signature 不變；每個成功操作只產生一筆 history；既有多人任職、兼任風險與組織 command tests 全過。

### Slice 3：員工細節與衍生顯示

1. 先改 `DirectoryDetailPanel` 為主職、其他任職、直屬主管三層；再接主職 callback。
2. 更新 Inspector 與 OrgNode 的 read-only labels／accessible name。
3. 補正常、無主職、根職位、空缺、多人、self-only 狀態；完成 responsive CSS。

Gate：第 14.4 節 UI flow 通過；5 秒內可辨識一個主職與一位直屬主管；主清單無重複資訊；1440×900、1024×768、390×844 無重疊、裁切或文件層水平 overflow。

### Slice 4：整合、資料 round-trip 與 Spec Drift Check

1. 以既有 V3 canonical document 實測 V4 migration、保存、重載與 server revision conflict。
2. 執行完整 tests、build、三 viewport、keyboard、visible error／console sweep。
3. 對照本 spec、ADR-001、DEV-017／019／020 做 convergence；只有 `In sync` 才交 QA/QC。

Gate：所有 final acceptance 有 auto 或 manual evidence；任何資料覆寫、路徑誤判、Undo 不完整、舊功能回歸或可見 runtime error 立即停止。

## 14. Acceptance and evidence contract

### 14.1 Functional acceptance

- [x] 每位員工在 UI 與 state 最多一個主職；有多筆任職但未選主職時，文件可正常載入並清楚顯示待設定。
- [x] 主職只能指向同一員工未結束的一般任職；代理、closed、unknown 或其他員工任職被拒絕且 state 不變。
- [x] 設為主職只改一個 reference；前主職成為兼任顯示，Assignment ID／職位／期間不變。
- [x] 主職上級職位恰有一位其他任職者時，顯示唯一直屬主管。
- [x] 根職位、空缺、多人與 self-only 不自動跳級或猜測，畫面顯示未設定原因。
- [x] 直屬主管路徑為唯讀衍生資訊；主職異動後會依新的主職重新判定。
- [x] 移動、取代、解除或刪除任職時，primary reference 原子更新，Undo/redo 完整還原。
- [x] V3 恰一筆 open legacy primary 自動設為主職；零筆或多筆保持 null；所有 Assignment／Role／風險規則／職位樹資料無損升級至 V4。
- [x] V4 writer、local storage、server file、副本與備份皆輸出 version 4；V4 失敗不 fallback 到舊檔掩蓋錯誤。
- [x] 既有一人多職、多人同職位、代理顯示、職位樹、部門框、兼任風險、文件 recovery 與 server revision conflict 不回歸。

### 14.2 UX acceptance

- [x] 使用者在員工細節五秒內能指出主職、其他任職與直屬主管；沒有主職或直屬主管時能指出原因。
- [x] 員工細節只有主職可寫；直屬主管由 OrgNode／Inspector 顯示的組織樹衍生。
- [x] 直屬主管只在員工層顯示一次；任職列只呈現職位、部門與主／兼／代差異。
- [x] 正常狀態沒有逐列 CTA、常駐演算法說明、大型流程卡或重複主管資訊。
- [x] `主／兼／代` 不是只靠顏色；鍵盤與輔助科技可辨識完整語意。
- [x] 未設定狀態在受影響區塊提供可理解原因，不暴露 raw ID、API route、DEV ID 或 technical status。
- [x] 1440×900、1024×768、390×844 的員工細節、職位 Inspector、組織圖標籤均可操作，無非預期水平 overflow。

### 14.3 Executable unit test matrix

| ID | Test file | Fixture / action | Expected |
| --- | --- | --- | --- |
| D-001 | `employeeResponsibilities.test.ts` | primary null；合法 regular main | 皆 valid |
| D-002 | 同上 | unknown／wrong employee／closed／acting main | 對應 typed validation failure |
| D-003 | 同上 | unknown／self override | 對應 override validation failure |
| C-001 | 同上 | set non-main regular as primary | applied；只改 Employee reference；舊 main 成兼任衍生 |
| C-002 | 同上 | set same main；invalid main | noop 無 history；invalid rejected、signature 不變 |
| C-003 | 同上 | first regular assignment | 自動成主職；第二筆不改主職 |
| C-004 | 同上 | move main to new position／existing target | primary remap 到實際保留的新／target assignment ID |
| C-005 | 同上 | replace／unassign／delete primary | closed assignment；primary null；其他任職不被挑選 |
| C-006 | `directories.test.ts` | delete employee referenced by overrides | 所有 references 同 commit 清 null；Undo 可還原 |
| C-007 | `organizationCommands.test.ts` | delete branch containing primary assignment | assignment close 與 primary clear 原子；拒絕路徑 signature 不變 |
| R-001 | `employeeResponsibilities.test.ts` | unique parent assignee | resolved `position_hierarchy` |
| R-002 | 同上 | no primary／root／vacant／multiple／self-only | 各自穩定 unresolved reason；不跳祖先 |
| R-003 | 同上 | valid override | resolved `employee_override`，優先於 hierarchy |
| R-004 | 同上 | duplicate assignments of same parent employee | 依 employeeId 去重後仍為唯一 |
| M-001 | `documentStorage.test.ts` | valid V4 round trip | deep-equal、version 4、responsibility validation pass |
| M-002 | 同上 | V3 employee exactly one open primary | selected main；legacy type 轉 regular |
| M-003 | 同上 | V3 employee multiple／zero open primary | primary null；所有 assignments preserved、無猜測 |
| M-004 | 同上 | V3 acting／secondary、risk rules、hierarchy | acting preserved；secondary→regular；其他 state preserved |
| M-005 | 同上 | invalid V4 primary／override／legacy enum | fail closed，不 fallback、不 partial normalize |
| M-006 | `server/orgmasterApi.test.ts` | V4 absent＋valid V3；V4 malformed＋valid V3 | 前者升級／寫 V4 且保留 V3；後者拒絕且不 fallback |
| R-005 | 既有 tests | role risk derive with regular／acting assignments | 有效任職配對結果不因 enum migration 回歸 |

### 14.4 Browser / QC flow matrix

| ID | Flow | Required observation |
| --- | --- | --- |
| UI-001 | 選擇已有主職與兼任的員工 | 主職第一、其他任職分層、直屬主管單一顯示 |
| UI-002 | 將另一一般任職設為主職 | 畫面與 OrgNode／Inspector 同步；舊主職成兼任；Undo/redo 正確 |
| UI-003 | V3 多個 primary migration | 載入成功、顯示主職待設定、沒有任一職位被猜為主職 |
| UI-004 | hierarchy unique | 顯示唯一直屬主管與「由主職上級推導」，無額外 CTA |
| UI-005 | root／vacant／multiple／self-only | 原因可理解；不自動總經理 fallback |
| UI-006 | change primary | 直屬主管依新主職更新；各一步 Undo |
| UI-007 | move／unassign／replace primary | 無 dangling UI；主職待設定與直屬主管狀態立即一致 |
| UI-008 | delete supervisor employee | 路徑轉未設定並顯示原因，無 runtime error |
| UI-009 | organization chart scan | 每位任職者有主／兼／代短標籤且 accessible name 完整，無幾何回歸 |
| UI-010 | V4 save／reload／server conflict | state round-trip；舊 V3 保留；既有 conflict recovery 可用 |
| UI-011 | 1440×900／1024×768／390×844 | 主要操作可達；drawer 可捲動；無裁切、重疊或文件層水平 overflow |
| UI-012 | Visible Error / Noise Sweep | console 0 error；無可見 HTTP/API/raw code、重複資訊、逐列 CTA 或技術狀態 |

必要證據：

- `npm test` 全數通過與實際 file/test count。
- `npm run build` 成功。
- 三 viewport 真實瀏覽器截圖：正常 resolved、主職待設定、多人上級＋override、窄 viewport。
- DOM／keyboard／accessible-name 檢查、visible error sweep、console 0 error。
- V3 原始檔 hash 或內容保存證據、V4 round-trip、server V4 canonical path 與 malformed newer file fail-closed 證據。

## 15. Failure modes and recovery

| Failure | Required behavior | Forbidden behavior |
| --- | --- | --- |
| legacy 多個主職候選 | V4 載入，primary null，顯示待設定 | 依陣列／層級／名稱猜測 |
| invalid primary selection | 原子拒絕，原主職與 UI 保留，就地說明 | partial write 或把 invalid assignment 改 regular |
| hierarchy route ambiguous | 顯示具體原因，允許有效 override | 多人共同核准或自動跳更高主管 |
| override self／unknown | 拒絕，保留原 route | 自我核准或 dangling ID |
| assignment closure | 同 commit 清 primary，route 轉未解析 | 保存後才發現 reference 壞掉 |
| V4 migration／write failure | 保留 V3 raw，進既有 recovery gate，可下載原始資料 | 覆寫 V3、載入 fixture 並顯示成功 |
| UI callback/runtime error | 不 commit，顯示可恢復錯誤；保留目前員工上下文 | 空白 panel、可見 API path 或 silent no-op |

## 16. Stop conditions

任一條件成立即停止該 slice並回 PM／QA，不得宣告 ready：

- 出現第二個持久化主職來源，例如 Assignment `isPrimary` 與 Employee reference 雙寫。
- 必須新增 `ReportingLine`、工作流引擎、Auth、通知或第三方依賴才可完成目前功能。
- V3 migration 會自動挑選多個候選中的任一主職，或會刪除／覆寫 V3 原始資料。
- 任職 move／replace／delete 仍有 UI path 可繞過 responsibility reconciliation。
- route resolver 會跳過空缺／多人上級，自動選祖先或總經理。
- 正常員工細節需要理解多層規則、逐列操作說明或看到多位核准人。
- 既有職位樹、部門框、多人任職、兼任風險、Undo/redo、V4 保存／恢復任一回歸。
- `npm test`、`npm run build`、必要 migration／browser flow、三 viewport 或 Spec Drift Check 未通過。

## 17. Future Phase Capsule：行政申請與簽核交易

狀態：`Future Phase Captured / Not Requested`

- 目的：未來若重新啟動行政流程 phase，才決定請假、加班或出差申請的核准路徑。
- 邊界：DEV-021 只有責任資料與 read-only route preview，不建立 request、status、approval decision、notification 或 audit record。
- 依賴：DEV-021 的主職與直屬主管顯示必須穩定；進入交易功能前另決定核准人、Auth、申請資料所有權、法定假別規則、代理核准、SLA、通知與稽核保存。
- 驗收方向：員工只送出一次；每個決策關卡只有一位最終核准者；未解析責任不得建立看似成功的申請。
- Re-entry trigger：使用者明確要求實作請假／行政申請、核准按鈕、通知、流程狀態或 audit 時，另建 DEV 並升級對應 phase 至 RD Contract／Implementation Ready。

## 18. Governance and RD readiness conclusion

- `RD Readiness Review`：Pass。產品語意、資料欄位、V4 migration、resolver、transaction、UI、failure recovery、測試與 stop conditions 已指定，無 P0/P1 implementation gap。
- `Spec Impact Preflight`：`Intentional replacement`。依 2026-08-17 使用者決策，DEV-021 改以 ADR-001 的 `Position.parentPositionId` 顯示直屬主管；行政核准功能暫緩，不建立 DEV-017 延後的完整 `ReportingLine`。
- `Intentional replacement`：DEV-011／現行程式將 `AssignmentType.primary | secondary` 同時當作任職類型的暫時語意，由 V4 的 `Employee.primaryAssignmentId` 與 `AssignmentType.regular | acting` 分離取代；既有多人任職與代理資料仍保留。
- DEV-019 相容：風險引擎繼續依員工目前有效任職與 Role pair 計算，不以主職作篩選；所有主職與兼任仍參與風險配對。
- DEV-020 相容：未來版本工作區包覆完整 V4 state；DEV-021 不實作或阻塞多草稿功能。
- ADR：不另建。主職／route authority 由本 feature spec 管理；主要職位 parent 已由 ADR-001 覆蓋，且目前沒有第二個跨產品 reporting model。
- Deferred Scope Audit：行政核准、實際行政申請與簽核屬高影響 future phase，已由第 17 節保存目的、依賴、驗收方向與 re-entry trigger；不阻擋本輪直屬主管交付。
- Repo boundary：`C:\VIBE CODING\OrgMaster` 目前不是 Git repository；本輪已依第 11 節檔案範圍完成產品程式、測試與 `ai-doc` 更新，未執行 Git commit。
- Release boundary：不在本 DEV。完成本機 RD／QA／QC 不等於授權 deploy 或 release。

## 19. Change log

- 2026-08-16：依使用者 `1B 2A 3A` 建立 `RD Implementation Ready` 契約；current phase 收斂為主職／兼任與責任路徑預覽，實際申請／簽核保留為 future phase。
- 2026-08-16：完成 ADR-001、DEV-011、DEV-017、DEV-019、DEV-020 cross-spec consistency；採 V4 `Employee.primaryAssignmentId` 避免用 Assignment enum 或陣列順序猜主職。
- 2026-08-16：完成 Slice 1–4 實作：V4 model／migration、責任 validator、原子 mutation、行政核准 resolver、員工細節唯一維護入口、OrgNode／Inspector 衍生標籤與 V4 server canonical path；`npm test -- --run` 通過 19 files／126 tests，`npm run build` 成功。
- 2026-08-16：QA/QC 通過；5001 temporary runtime 以 1440×900、1024×768、390×844 驗證員工細節、主／兼標籤、行政流程路徑與無水平 overflow，console 0 error／0 warning。截圖：`.playwright-cli/page-2026-08-16T03-42-19-986Z.png`、`.playwright-cli/page-2026-08-16T03-42-35-002Z.png`、`.playwright-cli/page-2026-08-16T03-42-52-067Z.png`。未授權 deploy／release。
- 2026-08-17：依使用者要求暫緩行政核准功能，撤下行政流程路徑與例外核准人 UI／互動，改為唯讀「直屬主管路徑」；新增 `directSupervisor.ts` 與測試，`npm test -- --run` 通過 20 files／129 tests，`npm run build` 成功，1440×900 與 390×844 browser QC 無水平 overflow、console 0 error／0 warning。未授權 deploy／release。
