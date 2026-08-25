# DEV-020：組織架構多草稿與版本比較 RD Implementation Contract

狀態：`RD Implementation Complete / QA-QC Passed`  
日期：2026-08-16  
來源：`USER-2026-08-16-ORG-VERSION-WORKSPACE`、`USER-2026-08-16-RD-IMPLEMENTABLE`  
風險等級：Medium  
權威範圍：DEV-020 的產品、版本生命週期、資料、API、UI、相容性、RD、QA 與 QC 契約  
執行邊界：DEV-021 已完成並建立 V4 canonical baseline；S1→S4 已在本機完成驗證。未授權 deploy、release 或 production 操作

## 1. 目的與成功結果

OrgMaster 現況已由 DEV-021 升為 V4 canonical document；版本工作區將 `data/orgmaster-document.v4.json`（並保留 V3／V2 migration sources）包覆為一份受保護的現行版與多份相互隔離的具名草稿。「存副本」仍可下載 JSON，但工作區現在可建立、切換與比較方案。

成功結果：

- 同一現行版可衍生至少三份具名草稿；各草稿獨立自動儲存、重新載入及跨視窗同步。
- 草稿寫入、Undo／redo、切換或保存失敗不得改變現行版或其他草稿。
- 現行版在一般規劃模式唯讀；需要直接維護時，使用者必須明確進入隔離的現行版維護模式。
- 使用者可選擇二至五個版本查看結構摘要，再選兩版查看組織圖視覺差異與可篩選的變更清單。
- DEV-021 完成後的 V4 組織資料與既有 V3／V2 migration sources、備份下載、副本下載、部門分組、主／兼／代任職、行政核准責任、兼任風險與 hierarchy authority 均不遺失。

## 2. 已確認產品決策

### 2.1 Current phase 必須成立

- 「現行版／草稿」是業務版本；`OrgDocumentFile.version` 是資料格式版本，兩者使用不同型別、欄位與檔案。DEV-020 沿用實作開始時的 current schema，依前置條件預期為 V4。
- 一份工作區只有一個現行版；現行版不能封存、刪除、重新命名或在草稿編輯流程中被寫入。
- 草稿可從現行版或另一份未封存草稿建立；建立時完整複製來源 current-schema state，之後互不連動。
- 草稿名稱去除前後空白後長度為 1–60，未封存草稿間採 `zh-Hant` 不分大小寫唯一；封存草稿恢復時重新檢查名稱。
- 草稿第一版提供建立、重新命名、切換、封存與還原；封存可逆，沒有永久刪除 endpoint 或 UI。
- 一般選取現行版只讀；「維護現行版」為明確模式切換，需一次影響提示與人工確認，但不使用 typed confirmation。
- 自動儲存不是使用者可見版本，不在版本清單製造 checkpoint；版本清單只顯示現行版與具名草稿。
- 比較模式只讀，不改變目前編輯版本，也不提供發布、合併、覆寫、採用或升為現行版。

### 2.2 Readiness resolution

Brief 階段的兩個待決策依使用者「補上 RD 可實作」指令，以最安全且可逆的方案收斂：

- 現行版日常維護：保留獨立 `current-maintenance` 模式，避免本交付尚未提供發布時無法修正現行資料。
- 草稿移除：只提供封存與還原，不提供永久刪除，避免把資料破壞決策混入版本比較交付。

### 2.3 明確排除

- 草稿發布為現行版、舊現行版封存、rollback、版本合併及逐欄位套用差異。
- 決策理由、評論、核准、簽核、通知、責任人與完整 audit log。
- 多人帳號、角色權限、雲端同步、資料庫、外部服務或 production migration。
- AI 差異摘要、方案評分、推薦、成本模擬或自動組織設計。
- 備份匯入／還原 UI 與永久刪除草稿。

### 2.4 執行前置條件

- DEV-021 已完成 RD／QA／QC，且 `OrgDocumentFile` V4、V1–V3→V4 migration、canonical `data/orgmaster-document.v4.json` 與其 round-trip tests 已成為 repo 基準。
- DEV-020 的 readiness 與實作 gate 均已完成；workspace 每版本文件沿用 V4 parser／validator，未建立 V3 workspace 或平行修改 canonical document schema。
- DEV-021 完成後若實際 schema、parser export、route 或檔名與其權威 spec 不同，PM 必須先做 drift check 並只更新 DEV-020 的 current-schema 接點；不得猜測或維持本文件的過期假設。

## 3. 現況架構與影響

### 3.1 已確認現況

- Runtime：React 19、TypeScript 7、Vite 8、Vitest 4、`@xyflow/react` 12。
- 固定本機入口為 `npm run dev:local`，使用 `localhost:5000` 及 Vite local API plugin。
- `OrgDirectoryState` 保存 employees、departments、roles、positions、assignments、members 與 roleCombinationRiskRules。
- `useOrgHistory` 在 `App.tsx` 保存單一 present、最多 80 筆 past 與 future；`replaceState` 會清空歷史。
- `App.tsx` 以約 500ms debounce 將 active version 寫入 workspace API；正式儲存與自動儲存均 scoped 到 active version。
- `server/orgmasterApi.ts` 保留 legacy current API 相容與 V4 canonical reader；workspace API 另以 manifest revision、每版本 revision 與 CAS 管理寫入。
- 同一視窗 dirty 時不接受另一視窗更新，但現有 PUT 沒有 compare-and-swap，仍可能以舊狀態覆寫新檔。
- `Position.parentPositionId` 是主要職位上下級唯一權威來源；`OrgMember` 只保存排序與畫布 presentation。

### 3.2 受影響面

- 新增工作區 manifest、版本 metadata、每版本獨立 current-schema 文件、server disk store 與 workspace API。
- App 從「單一 document hydration」改成「載入 workspace index → 決定 active version → 載入 active document」。
- Undo／redo、自動儲存、dirty、revision 與跨視窗同步改為 active version scoped。
- 主畫面增加版本切換、工作區 drawer、現行版維護模式及比較 mode。
- 新增摘要指標、穩定 ID 差異引擎、兩版本唯讀組織圖與差異清單。
- 既有編輯元件增加 `readOnly`／`editingEnabled` 邊界，避免現行基準或比較模式誤寫。

### 3.3 刻意不改

- `OrgDirectoryState` 及 Employee、Department、Role、Position、Assignment、OrgMember、RoleCombinationRiskRule 欄位不增加版本 metadata。
- DEV-020 不修改 `OrgDocumentFile.version` 或領域 schema；沿用 DEV-021 完成後的 current parser／validator（預期 V4）作為每版本文件 gate。
- ADR-001 的 `Position.parentPositionId` hierarchy authority 不變。
- 組織 command、部門 frame、layout、任職有效期間與風險 match 本身的領域語意不變。
- 不新增 Auth、permission、環境變數、第三方套件或 provider。

## 4. Architecture Decision

- 權威 ADR：`ai-doc/adr/ADR-002-version-workspace-storage-boundary.md`。
- 工作區採「manifest＋每版本獨立 current-schema 文件」，不採單一大型 workspace JSON。
- 原因：不同草稿需要獨立 revision、獨立寫入與獨立損壞範圍；未來發布也需要穩定版本 ID 與來源關係。

## 5. 執行分期與 Gate

| Slice | Execution boundary | Document status | Scope | Entry condition | Exit acceptance | Evidence |
|---|---|---|---|---|---|---|
| S1 | Current phase | RD Implementation Complete | workspace domain、manifest／version store、migration、API、CAS | 本契約與 ADR-002 已存在；DEV-021 V4 canonical baseline 通過 | storage／API 測試通過，舊 V4／V3／V2 bytes 保留 | Vitest 19 files／126 tests、temp directory round-trip、conflict tests |
| S2 | Current phase | RD Implementation Complete | App hydration、版本切換、獨立 autosave、現行保護、封存／還原 | S1 通過 | 草稿隔離、switch flush、current-maintenance gate、跨視窗 revision conflict | browser flow、DOM read-only evidence |
| S3 | Current phase | RD Implementation Complete | 摘要指標、差異引擎、版本比較 UI、responsive／a11y | S2 通過 | 2–5 版摘要與兩版視覺／清單差異正確且只讀 | pure tests、1440 compare screenshot、1024／390 workspace screenshots、DOM evidence |
| S4 | Current phase validation | QA／QC Passed | regression、build、API/data consistency、visible error、runtime cleanup | S1–S3 完成 | 全部 acceptance 有證據且無 stop condition | `npm test -- --run`、`npm run build`、API round-trip、browser QC |

不得跳過 S1 直接修改 App，也不得在 S2 未通過前把比較 UI 接到不穩定的版本來源。第一個 slice failure、資料來源漂移或 scope 升級時停止本批。

## 6. 工作區資料契約

### 6.1 Manifest

```ts
export const ORG_WORKSPACE_VERSION = 1 as const

export type OrgWorkspaceEntryKind = 'current' | 'draft'
export type OrgWorkspaceEntryStatus = 'active' | 'archived'

export interface OrgWorkspaceEntry {
  id: string
  name: string
  kind: OrgWorkspaceEntryKind
  status: OrgWorkspaceEntryStatus
  basedOnVersionId: string | null
  createdAt: string
  archivedAt: string | null
}

export interface OrgWorkspaceManifest {
  app: 'OrgMaster'
  workspaceVersion: typeof ORG_WORKSPACE_VERSION
  currentVersionId: string
  entries: OrgWorkspaceEntry[]
}
```

Manifest invariant：

- `id` 必須符合 `^[A-Za-z0-9-]{1,80}$`，在 manifest 唯一，且只能經安全 path resolver 轉成版本檔案路徑。
- 恰好一個 entry 的 `kind === 'current'`；它必須 `status === 'active'`、`archivedAt === null` 且 ID 等於 `currentVersionId`。
- `draft` 可為 active 或 archived；active 時 `archivedAt === null`，archived 時為合法 ISO timestamp。
- `basedOnVersionId` 為 null 或指向 manifest 內另一個 entry；不得指向自己，來源圖不得形成循環。
- `createdAt` 與非 null `archivedAt` 都必須是合法 ISO timestamp。
- current name 固定為「現行版」；draft name 經 trim 後 1–60 字，active draft 使用 normalized name 唯一。
- parser 遇到 duplicate ID、invalid current、missing base、cycle 或非法 status 時 fail closed，不做靜默修正。

### 6.2 Workspace index response

```ts
export interface OrgWorkspaceVersionSummary extends OrgWorkspaceEntry {
  updatedAt: string
  revision: string
}

export interface OrgWorkspaceIndex {
  app: 'OrgMaster'
  workspaceVersion: 1
  currentVersionId: string
  manifestRevision: string
  versions: OrgWorkspaceVersionSummary[]
}
```

- `manifestRevision` 是 manifest 原始 bytes 的 SHA-256 opaque hash。
- 每個 `revision` 是該版本文件原始 bytes 的 SHA-256 opaque hash；client 不解析或自行產生。
- `updatedAt` 取合法 current document 的 `savedAt`；單一文件讀取失敗時，index 仍回傳該 entry，但附 server-normalized `loadStatus: 'failed'` 與不含 raw payload 的 failure code。實作型別可用 discriminated union 表達，不能用 `revision: ''` 假裝成功。
- active versions 排在 archived 前；current 永遠第一，draft 再依 updatedAt 新到舊排序。UI 可重新排序，但 server response 必須 deterministic。

### 6.3 版本文件

- 路徑：`data/orgmaster-versions/<versionId>.json`；業務版本檔名不編入 document schema 版本。
- 內容：完整 `OrgDocumentFile`；current 的 `kind` 必須是 `document`，draft 的 `kind` 必須是 `draft`。
- 保存前必須通過既有 `parseOrgDocument`、organization validation 與 role risk validation。
- current 與每個 draft 都是完整 state，不使用 patch chain；`basedOnVersionId` 只表達來源，不參與讀取合併。
- 比較與編輯不得直接改動載入 object；沿用 `cloneOrgState`／normalized document 建立獨立 copy。

### 6.4 Browser-local UI state

- 最後選取版本使用 sessionStorage key `orgmaster.workspace.active-version.v1`，只保存 version ID，不寫入 manifest 或 Undo history。
- 同一 tab reload 可回到最後版本；新 tab 找不到 session selection 時預設現行版唯讀。
- key 無效、版本封存或版本不存在時清除 key並回到 current；不得因此修改 workspace。
- compare selection、drawer open、filters、pan／zoom、selected node 與 current-maintenance confirmation 都是 UI state，不持久化到版本文件。

## 7. Disk Store 與交易邊界

### 7.1 固定路徑

```text
data/orgmaster-workspace.v1.json
data/orgmaster-versions/<versionId>.json
data/orgmaster-document.v4.json          # DEV-021 canonical migration source，保留
data/orgmaster-document.v3.json          # legacy migration source，保留
data/orgmaster-document.v2.json          # legacy fallback，保留
```

- server store 必須以 workspace root resolve 固定路徑；禁止 caller 傳入任意相對路徑或直接串接 URL segment。
- 測試使用明確 temporary root；production／remote path 不在 DEV-020 範圍。

### 7.2 Write serialization

- 所有 workspace mutation 經 module-level promise queue／mutex 序列化。
- 進入 lock 後重新讀取實際 manifest／version revision，再比較 request 的 expected revision；不得在 lock 外先檢查後直接寫入。
- revision 不符回傳 409，server 不寫任何檔案。
- 不同版本也可先使用同一 write queue；第一版優先正確性，不為平行 autosave 加複雜 lock partition。

### 7.3 Safe write

- 新 payload 先在記憶體 parse／validate，再寫同目錄 temporary file。
- temporary file 寫完後重新讀取並 parse；成功才 replace 目標檔。
- 建立草稿順序固定為：驗證來源 → 寫新版本文件 → 驗證新文件 → compare-and-swap 更新 manifest。
- manifest 更新失敗時，新版本檔為 orphan，不得出現在 index；後續維護可清理，但 DEV-020 不自動刪除未知檔案。
- 封存／還原／重新命名只改 manifest，不刪除或重寫版本文件。
- version save 只改該版本文件，不重寫 manifest、current 或其他 draft。

## 8. API 契約

所有 route 仍由 localhost Vite plugin 提供，沒有 Auth。`current-maintenance` 是防止 App 誤寫的 intent gate，不是安全授權機制。

### 8.1 讀取工作區

`GET /api/orgmaster/workspace`

- workspace 不存在時執行第 10 節 migration。
- 成功回傳 200 `OrgWorkspaceIndex`。
- manifest 不合法回傳 500 `{ error: 'WORKSPACE_INVALID', code }`；不得退回 legacy document。
- 單一 version file 不合法不使整個 index 失敗；該 summary 回傳 failed load status，其他版本仍可操作。

### 8.2 讀取版本

`GET /api/orgmaster/workspace/versions/:versionId`

成功回傳：

```ts
interface OrgWorkspaceVersionResponse {
  version: OrgWorkspaceVersionSummary
  document: OrgDocumentFile
}
```

- 不存在回傳 404 `VERSION_NOT_FOUND`。
- archived 版本可被讀取供復原檢查，但 App 不把它直接載入編輯或比較；一般 client request 可由 query／request mode 明確限制。
- 文件不合法回傳 422 `VERSION_DOCUMENT_INVALID` 與 parser code；原始 bytes 保留，不傳進可見 UI。

### 8.3 建立草稿

`POST /api/orgmaster/workspace/versions`

```ts
interface CreateDraftRequest {
  sourceVersionId: string
  name: string
  expectedManifestRevision: string
}
```

- source 必須存在、active 且文件合法。
- server 產生 `crypto.randomUUID()` version ID、createdAt 與 draft document savedAt。
- name invalid／duplicate 回傳 400；manifest revision conflict 回傳 409。
- 成功回傳 201 `{ workspace: OrgWorkspaceIndex, createdVersionId: string }`。
- retry 不得靠相同 request 默認建立第二份草稿；client 收不到 response 時先 reload index，只有確認名稱／來源不存在才可重送。第一版不增加 idempotency key。

### 8.4 保存版本

`PUT /api/orgmaster/workspace/versions/:versionId`

```ts
interface SaveWorkspaceVersionRequest {
  document: OrgDocumentFile
  expectedVersionRevision: string
  mode: 'draft-edit' | 'current-maintenance'
}
```

- current 只接受 `mode: 'current-maintenance'` 及 `document.kind === 'document'`。
- draft 只接受 `mode: 'draft-edit'`、active status 及 `document.kind === 'draft'`。
- ID、kind、status 或 revision 不符時 fail closed；不得把 current payload 存到 draft，反之亦然。
- 成功回傳 200 `OrgWorkspaceVersionResponse`；revision conflict 回傳 409 `VERSION_REVISION_CONFLICT` 與 current revision，不回傳或覆寫 current file contents。

### 8.5 版本 metadata action

`PATCH /api/orgmaster/workspace/versions/:versionId`

```ts
type WorkspaceVersionActionRequest =
  | { action: 'rename'; name: string; expectedManifestRevision: string }
  | { action: 'archive'; expectedManifestRevision: string }
  | { action: 'restore'; expectedManifestRevision: string }
```

- current 的 rename、archive、restore 全部回傳 409 `CURRENT_VERSION_PROTECTED`。
- archive 只接受 active draft；restore 只接受 archived draft。
- restore 遇到 active duplicate name 回傳 409 `DRAFT_NAME_CONFLICT`，UI 提示先修改封存版本名稱或處理現有同名草稿；第一版可在 restore dialog 同時輸入新名稱，RD 需用單一 PATCH transaction 寫入。
- 成功回傳 200 更新後的 `OrgWorkspaceIndex`。
- 沒有 DELETE route。

### 8.6 Legacy document route

- 工作區尚未建立時，`/api/orgmaster/document` 維持 DEV-015 行為。
- 工作區建立後，legacy GET 回傳 workspace current document，讓舊檢視端不讀到過期 legacy canonical file。
- 工作區建立後，legacy PUT 回傳 409 `WORKSPACE_MANAGED_DOCUMENT`；不得產生第二個 current source。
- 新 App 不再以 legacy route hydration 或 autosave；`serverDocumentStorage.ts` 保留為相容 helper，沒有 call site 後可在另一次明確重構移除。

## 9. App 版本狀態機

### 9.1 Mode matrix

| Mode | Source | Write target | 可編輯 | Autosave | 主要可見訊號 | 離開條件 |
|---|---|---|---|---|---|---|
| `current-view` | current document | 無 | 否 | 否 | 「現行版」＋唯讀狀態，編輯控制 disabled／hidden | 選草稿、進比較或確認維護現行版 |
| `current-maintenance` | current document | 同一 current ID | 是 | 是 | 「現行版・維護中」，保存狀態只顯示一次 | pending save 成功後退出或切換 |
| `draft-edit` | active draft document | 同一 draft ID | 是 | 是 | 草稿名稱＋「草稿」badge＋保存狀態 | pending save 成功後切換／比較 |
| `compare` | 2–5 個合法 active version | 無 | 否 | 否 | 比較來源與 asOf；無保存／Undo CTA | 返回原編輯 context |
| `archived` | archived metadata | 無 | 否 | 否 | 只在封存區顯示 | 還原後才可編輯／比較 |

### 9.2 Hydration

1. GET workspace index。
2. 從 sessionStorage 取 selection；不存在、archived、failed 或未知時選 current。
3. GET selected version document。
4. `replaceState(document.state)`，同時設定 activeVersionId、mode、savedSignature、savedAt、versionRevision。
5. current 預設 `current-view`；active draft 預設 `draft-edit`。
6. 只有 active document 成功 hydrate 後才啟動 autosave／polling；hydration pending 時不得把 fixture state 寫入任何版本。

### 9.3 Switching

- 若 active mode 可寫且 `currentSignature !== savedSignature` 或 autoSavePending，先呼叫 `flushActiveVersion()` 並等待結果。
- flush success 才載入 target；failure／conflict 保留原畫面、active ID 與 Undo history，阻擋切換並顯示可恢復訊息。
- target 載入成功才更新 session selection 並 `replaceState`；切換會清空舊版本 Undo／redo，不能把 history 帶到新版本。
- 切換到 current 時一律回 `current-view`；不得沿用先前 maintenance mode。
- 封存目前 active draft 前也先 flush；封存成功後切到 current-view。

### 9.4 Autosave 與 dirty

- dirty、savedSignature、savedAt、versionRevision 全部屬於 active version context。
- 只有 `draft-edit` 與 `current-maintenance` 在 state change 後約 500ms autosave。
- 每次 autosave帶目前 version revision；conflict 時停止重試，維持 dirty，顯示「另一個視窗已更新這個版本」與重新載入／下載副本選項。
- 一般 I/O failure 可由使用者重試；版本切換在尚未成功保存時持續 disabled／blocked。
- `pagehide`／visibility hidden 只做 best-effort flush；不得將未確認成功的 request 標為 saved。
- Compare 與 current-view 不執行 autosave，也不攔截瀏覽器 `Ctrl+S`。

### 9.5 Cross-window sync

- 每 1500ms reload workspace index；比較 manifestRevision 與每版本 revision。
- active version revision 改變且本機 clean：重新載入該 version，replace state 並清空 history。
- active version revision 改變且本機 dirty：不覆寫，顯示 conflict recovery。
- 其他版本 revision 改變：只更新版本清單的 updatedAt／revision，不影響 active editor。
- current-maintenance 與 draft-edit 使用相同 CAS；不同版本可連續保存，同一版本的 stale write 必須 409。

## 10. 舊資料遷移與相容性

### 10.1 Migration trigger

- `data/orgmaster-workspace.v1.json` 不存在時，由首次 GET workspace 進入 migration。
- 只可重用 DEV-021 完成後的 canonical document reader；預期來源順序為 V4，只有 V4 不存在時才依 current parser 的既有規則 fallback V3／V2。
- 較新來源存在但 JSON／schema／organization／responsibility／risk rules 不合法時 fail closed，不讀較舊來源、不載入 fixture。
- 若 DEV-021 尚未完成或 current reader 尚未提供 V4 round-trip／V1–V3 migration gate，GET workspace 回傳明確的開發期 prerequisite error；不得先建立 V3 workspace。

### 10.2 Migration algorithm

1. 呼叫 current canonical reader 讀取 legacy／canonical source，正規化為 current `OrgDocumentFile`（依前置條件預期為 V4）。
2. 由 `sha256(orgStateSignature(normalizedState))` 前 20 hex 建立 `current-<hash>`，使重試 deterministic。
3. 建立 current entry：name「現行版」、kind current、active、base null；createdAt 使用合法 savedAt，否則使用來源檔 mtime 的 ISO。
4. 將 normalized document clone 為 kind document，寫入對應版本檔並重新讀回驗證。
5. 建立 manifest temporary file並重新讀回驗證。
6. 成功 replace manifest 後重新 GET index；此時工作區成為唯一權威來源。
7. canonical／legacy V4／V3／V2、localStorage compatibility／recovery keys 全部保留，不覆寫、不刪除。

### 10.3 Interrupted migration

- version file 已建立但 manifest 尚未建立：下次 migration 使用相同 deterministic ID；若內容相同可重用，若內容不同 fail closed。
- manifest 已存在但 invalid：不得重新 migrate 或 fallback；回傳 workspace recovery error。
- manifest 合法但 current file 缺少／invalid：index 顯示 failed current，App 開啟 recovery gate，不載入其他草稿為假 current。
- legacy bytes 在任何測試與實際遷移後必須 byte-for-byte 相同。

## 11. 比較領域契約

### 11.1 Summary metrics

`buildVersionSummary(state, asOf)` 必須是 pure function並回傳：

```ts
interface VersionSummaryMetrics {
  departmentCount: number
  activePositionCount: number
  employeeCount: number
  managementLevelCount: number
  vacantPositionCount: number
  riskMatchCount: number
}
```

- departmentCount：全部 Department 數。
- activePositionCount：`status === 'active'` 的 Position 數。
- employeeCount：全部 Employee 數。
- managementLevelCount：active position tree 最大 depth＋1；無 active position 時為 0。
- vacantPositionCount：asOf 沒有任何有效 Assignment 的 active position 數。
- riskMatchCount：沿用 `deriveRoleCombinationRiskMatches` 的去重 match 數，不是啟用規則數。
- 一次比較共用同一個 `asOf`，在開啟比較時固定，並在比較頁只顯示一次。

### 11.2 Detailed diff

```ts
type VersionDiffEntity =
  | 'department'
  | 'position'
  | 'employee'
  | 'assignment'
  | 'role'
  | 'risk-rule'
  | 'layout'
  | 'risk-match'

type VersionDiffKind =
  | 'added'
  | 'removed'
  | 'renamed'
  | 'moved'
  | 'changed'
  | 'reordered'
  | 'risk-added'
  | 'risk-removed'

interface VersionDiffItem {
  id: string
  entity: VersionDiffEntity
  entityId: string
  kind: VersionDiffKind
  beforeLabel: string | null
  afterLabel: string | null
  beforeRefs: string[]
  afterRefs: string[]
}
```

差異規則：

- Department 依 id 比對新增／移除、name renamed、parentId moved。
- Position 依 id 比對新增／移除、title renamed、departmentId／parentPositionId moved，以及 roleId、status、allowMultipleAssignees changed。
- Employee 依 id 比對新增／移除、name renamed、排序後 departmentIds changed。
- Assignment 依 id 比對新增／移除與 employeeId、positionId、assignmentType、validFrom、validTo changed；positionId 改變在 UI 標為任職移動。
- Role 與 risk rule 依 id 比對可持久化欄位；risk pair 須使用 canonical pair，避免 A/B 交換產生假差異。
- OrgMember 的 order 與 childrenAxis 歸類 layout；`collapsed` 是瀏覽狀態，不列入差異，compare diagram 一律展開合法 hierarchy。
- risk match 以 `ruleId + employeeId + sorted(positionIds)` 形成 stable key，比較 asOf 下新增／消失。
- 忽略 workspace metadata、document kind、savedAt、revision、React Flow x/y、viewport、selection 與 UI filter。
- 輸出以 entity order、顯示 label、entity ID、diff kind deterministic sort；相同輸入必須 byte-stable。

### 11.3 Selection limits

- Summary 最少 2、最多 5 個 active、合法版本；超過 5 時第六個選取 disabled 並在 compare toolbar 顯示一次短提示。
- Detailed compare 恆為 A、B 兩版；A 與 B 不得相同。
- archived／failed 版本不能加入 compare；必須先 restore 或修復。
- 比較期間載入任一版本失敗，保留其餘已載入資料但停止產生完整比較，指出受影響版本並可返回工作區。

## 12. UI 與互動契約

### 12.1 Version switcher

- Toolbar 的版本入口顯示目前版本名稱與「現行版／草稿／維護中」短 badge；保存狀態只在同一區域顯示一次。
- 入口使用可辨識 button，支援 focus、Enter／Space、`aria-expanded`；不要把版本 metadata 做成大型卡片。
- 版本名稱過長需截斷但保留 accessible name／title；不能擠壓搜尋、風險設定與檔案入口。

### 12.2 Workspace drawer

- Desktop／laptop 使用右側 fixed drawer，不推擠組織畫布；390px 使用全寬 drawer／sheet。
- 清單是第一視覺：current 第一列、active drafts 依 updatedAt、archived drafts 收在可展開區。
- 每列只顯示名稱、類型／必要狀態、更新時間與 row menu；basedOn、ID、revision、完整歷程降層，不在主清單常駐。
- 點列切換版本；row menu 提供從此建立草稿、重新命名、封存或還原。current 只提供建立草稿與維護現行版。
- 建立／重新命名使用短 form／dialog，就地顯示 name validation。archive 可立即執行並以 toast 提供還原；沒有永久刪除確認。
- `Escape` 關閉暫時 drawer／form；drawer 自己承擔垂直捲動，不讓 body 與 drawer 形成不明雙 scrollbar。

### 12.3 Current protection

- current-view 的 DirectoryDock 新增／編輯／刪除、OrgNode 拖放／移除員工、Inspector patch／delete、risk settings mutation、畫布拖曳與 mutation keyboard shortcuts 全部 disabled 或不渲染。
- 搜尋、選取、展開／收合、pan／zoom、查看 Inspector／detail 與下載副本／備份仍可使用。
- 「維護現行版」顯示一次確認，說明會直接寫入現行版、草稿不受影響；確認後才切到 current-maintenance。
- current-maintenance 在 Toolbar 保留持續可見 badge，不用顏色作唯一訊號；退出前執行 flush。
- read-only／compare 時不得攔截瀏覽器 `Ctrl+S`；editable mode 的 Ctrl+S 只保存 active version。

### 12.4 Summary compare

- 版本 drawer 以 checkbox／compare tray 選 2–5 版；只有集合有效時才顯示單一 primary「比較」動作。
- Summary 使用 table／compact rows，不使用六張 KPI card 乘以版本數。
- 1440px 可用版本為欄、指標為列；1024px 與 390px 可切換每次查看一至兩個版本或使用受控 table container，但 document body 不得水平溢出。
- current 與 active draft 由短 badge、欄位位置及 accessible label 共同辨識。

### 12.5 Detailed visual compare

- >=1180px 顯示 A、B 兩個 read-only diagram pane；每 pane 有版本名稱與相同 asOf，不重複說明文字。
- <1180px 使用 A／B segmented control 切換單一 diagram，保留同一 change list；不把兩張圖硬塞進窄 viewport。
- Comparison diagram 使用獨立 ReactFlowProvider 與 read-only node，`nodesDraggable=false`、`nodesConnectable=false`，沒有 DirectoryDock／Inspector mutation。
- added 使用 `+`／形狀，removed 使用 `−`／形狀，changed 使用 `≠`，moved 使用箭頭；色彩只能輔助。
- 點選 change list item 時，對應 pane 聚焦相關 node；只有一側存在的 added／removed 只聚焦存在的一側。
- Removed node 只在 A pane 顯示 removed marker；added node 只在 B pane 顯示 added marker。第一版不建立 union ghost hierarchy。
- diff list 支援 entity 與 kind filter；empty 表示兩版無命中差異，正常狀態保持安靜。
- compare mode 有明確返回動作，返回後恢復原 active version／mode；不得把 compare pan／zoom 或 selection寫回版本。

## 13. Component 與 mutation gate

- `App.tsx` 建立單一 `editingEnabled = mode === 'draft-edit' || mode === 'current-maintenance'`。
- 所有 domain mutation callbacks 在入口再次檢查 editingEnabled；不能只靠 disabled CSS。
- `useOrgHistory` 的 `commitState`／`commit` 必須接受 edit guard 或由外層只暴露 guarded wrapper；read-only mode 的程式性呼叫也不得 commit。
- `DirectoryDock`、`Inspector`、`OrgNode`、`RoleCombinationRiskPanel` 接受明確 readOnly／editingEnabled prop；正常瀏覽 action 與 mutation action 分開。
- ReactFlow 的 `nodesDraggable`、drop handlers、context menu、double-click edit、Delete／Enter／Tab／F2／Alt reorder／axis shortcut 在 read-only mode 停用。
- current maintenance confirmation、draft rename form與 restore name conflict error 都要有 focus return；modal／drawer 關閉不遺失原 active version。

## 14. Failure Recovery

| Failure | Server behavior | Client behavior | Data guarantee |
|---|---|---|---|
| Manifest invalid | 500 fail closed，不讀 legacy | workspace recovery gate；不啟動 autosave | 原 manifest、legacy files保留 |
| Current file missing／invalid | index 標記 failed，current GET 422 | 阻擋編輯與比較；顯示復原／備份資訊 | 不以草稿冒充 current |
| 單一 draft invalid | 該 draft GET 422，其他 index 正常 | draft 列顯示不可載入，可切其他版本 | 其他版本不受影響，raw file不覆寫 |
| Autosave I/O fail | 非 2xx，不更新 revision | 保留 dirty state，允許重試／下載副本，阻擋 switch | 不宣稱已保存 |
| Same-version conflict | 409，零寫入 | 保留本機 state；選擇重新載入或下載副本 | 較新 server state 不覆寫 |
| Manifest action conflict | 409，零寫入 | reload version list並重新執行 action | 不建立 duplicate／lost update |
| Target version archived during switch | 409／404 | 回 current-view，保留原版本直到 flush成功 | 不載入未知或 archived state |
| Create draft partial failure | manifest 不引用未完成檔 | 顯示建立失敗，可重試 | 既有 workspace不變 |
| Compare load failure | 不產生 partial diff | 標示受影響版本並可返回 | 不修改 active editor |

可見錯誤只說明人類影響與恢復方式；raw route、stack、internal ID、HTTP code 與 parser code 降層到診斷證據。

## 15. Repo／File Impact

### 15.1 新增

| File | Responsibility |
|---|---|
| `src/versionWorkspace.ts` | manifest／entry types、validation、name normalization、state transitions、selection helper |
| `src/versionWorkspace.test.ts` | invariant、create／rename／archive／restore、cycle／duplicate／current protection |
| `src/versionComparison.ts` | summary metrics、detailed diff、stable sorting、asOf contract |
| `src/versionComparison.test.ts` | metrics、entity diffs、ignored fields、risk matches、determinism |
| `src/serverWorkspaceStorage.ts` | workspace index／version HTTP client、response parser、conflict results |
| `server/orgmasterWorkspaceStore.ts` | fixed paths、migration、hash revision、write lock、safe manifest／version disk I/O |
| `server/orgmasterWorkspaceStore.test.ts` | temp-root migration、byte preservation、isolation、CAS、partial failure／invalid file |
| `src/components/VersionSwitcher.tsx` | current version identity、mode、save state、drawer trigger |
| `src/components/VersionWorkspacePanel.tsx` | active／archived list、create／rename／archive／restore、compare selection |
| `src/components/VersionCompareView.tsx` | summary table、pair selection、filters、responsive compare shell |
| `src/components/ComparisonDiagram.tsx` | read-only ReactFlow diagram、focus by diff item、A／B pane |
| `src/components/ComparisonOrgNode.tsx` | accessible added／removed／changed／moved node rendering |

### 15.2 修改

| File | Required change |
|---|---|
| `src/App.tsx` | workspace hydration、active context、mode state machine、switch flush、scoped autosave／poll、read-only guards、compare mode |
| `src/components/Toolbar.tsx` | version switcher／compare context、current maintenance cue、save availability |
| `src/components/DocumentMenu.tsx` | active-version save／download語意；read-only時不提供寫入 save |
| `src/components/DirectoryDock.tsx` | editingEnabled；read-only只保留查閱／定位 |
| `src/components/Inspector.tsx` | editingEnabled；read-only欄位與 mutation action gate |
| `src/components/OrgNode.tsx` | editingEnabled；停用 employee drag／drop／unassign，保留查閱與 collapse |
| `src/components/RoleCombinationRiskPanel.tsx` | readOnly view；停用 rule CRUD／toggle |
| `src/index.css` | version drawer、mode badge、summary table、compare panes／nodes、responsive與focus styles |
| `server/orgmasterApi.ts` | mount workspace routes、legacy GET current compatibility、legacy PUT protection |
| `server/orgmasterApi.test.ts` | route／compatibility／error envelope tests |
| `README.md` | workspace source of truth、legacy preservation、version workflow與本機啟動說明 |
| `ai-doc/dev_task.md` | DEV-020 status、權威文件、execution／evidence boundary |
| `ai-doc/documentation_map.md` | Cold start、Active、spec／ADR links |

### 15.3 刻意不修改

- DEV-021 完成後 `src/documentStorage.ts` 的 current schema與 legacy parser語意；只有新 store重用 exports，不由 DEV-020 改 document schema。
- `data/orgmaster-document.v2.json`、`data/orgmaster-document.v3.json`、`data/orgmaster-document.v4.json` 的既有 bytes。
- deployment、hosting、environment variable 或 production config。

## 16. RD 實作順序

### S1：Domain／Store／API

1. 先寫 workspace manifest validator與 transition tests。
2. 寫 comparison-independent disk store：safe ID path、hash revision、read／write lock與legacy migration。
3. 用 temp root測試 current V4→workspace、V3／V2 fallback、invalid newer source fail closed、interrupted migration與legacy byte preservation。
4. 建 workspace API與client parser；完成 create、read、save、rename、archive、restore、CAS與legacy PUT protection。
5. S1 全部 tests通過後才接 App。

### S2：App version orchestration

1. 將 hydration改為 index＋active version document，加入 mode／revision／selection context。
2. 將 autosave與polling scope到 active version；實作 switch flush、same-version conflict與different-version isolation。
3. 加 VersionSwitcher／WorkspacePanel與 current-maintenance confirmation。
4. 逐一加 editingEnabled gate；先以 automated／DOM checks確認 read-only callback無法 commit，再做 browser smoke。
5. 驗證三份草稿、reload、archive／restore、current maintenance與兩視窗 conflict。

### S3：Comparison

1. 先寫 summary／diff pure tests，固定 asOf、stable ID與ignore rules。
2. 接 2–5 version loader與summary table；版本載入可平行，但任一失敗不產生假完整結果。
3. 建 two-version read-only diagram與change list focus；不重用editor mutation callbacks。
4. 完成 >=1180 split view、1024／390 A-B toggle、filter、a11y與visible error states。

### S4：QA／QC

1. 執行全部自動測試與build。
2. 依第 18 節建立資料 fixtures與實際API round-trip。
3. 啟動 task-owned 5000 runtime做三 viewport UI／multi-window QC；完成後停止該 process tree並確認port釋放。
4. 清理後確認 protected `127.0.0.1:4173` 仍 listening且ProJED頁面／health reachable；不得停止、重啟或清除4173。
5. 若QC失敗，回送RD修正並只重跑受影響與必要regression gate。

## 17. QA FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| 草稿save寫到current | active ID／mode接線錯誤 | 現行組織被草稿覆蓋 | before／after signatures與檔案hash | P0 | server kind＋mode gate；三版本isolation test |
| switch時遺失dirty state | 未await flush | 草稿變更消失 | 延遲／失敗save後立即switch | P0 | switch blocker與failure flow |
| stale window覆寫新資料 | 無CAS或lock外檢查 | 同版本較新變更消失 | 兩client同revision連續PUT | P0 | lock內expected revision；第二次409 |
| migration改寫legacy | path／write target錯誤 | 無法回復現況 | byte-for-byte snapshot | P0 | temp-root preservation test |
| invalid draft阻擋全部workspace | manifest內嵌state或index全fail | 其他方案無法使用 | 破壞一個draft再GET index/current | P0 | per-version file與partial index status |
| current未確認即可編輯 | UI guard不完整 | 誤改現行版 | mutation controls／keyboard／API negative | P0 | current-view editingEnabled=false＋server mode gate |
| diff依座標產生假差異 | 使用ReactFlow position比較 | 相同組織被判成不同 | 改zoom／collapsed／savedAt | P1 | pure ID diff與ignored-field tests |
| hierarchy／assignment diff漏報 | entity mapping不完整 | 錯誤決策 | golden before／after fixture | P1 | per-entity diff matrix |
| color-only差異 | 只加CSS色彩 | 無障礙／灰階不可辨 | DOM label＋灰階目視 | P1 | +／−／≠／arrow＋aria |
| compare UI在1024／390溢出 | 強制雙pane／寬表 | 無法操作比較 | 三viewport screenshot／scrollWidth | P1 | breakpoint toggle與受控container |
| archive current或永久刪除 | action gate漏失 | 權威版本消失 | API／UI negative | P0 | current action rejection；無DELETE route |
| autosave fail仍顯示成功 | optimistic state錯誤 | 使用者誤以為已保存 | 模擬500／network fail | P1 | 只以server response更新savedSignature |
| hydration fixture被自動寫入 | autosave早於server load | 真實資料被範例覆蓋 | 延遲GET並觀察PUT | P0 | hydration pending gate |

## 18. Acceptance、QA 與 QC Evidence Matrix

| ID | Acceptance criteria | Automated evidence | Manual／QC evidence |
|---|---|---|---|
| DATA-001 | current canonical source（預期V4）遷移為current；缺少時依current reader fallback V3／V2，全部來源bytes不變 | store migration tests | data paths／hash紀錄 |
| DATA-002 | manifest與version invalid皆fail closed，單一draft invalid不阻擋其他版本 | parser／store tests | error與切換流程 |
| DATA-003 | current＋三draft各自round-trip，A save不改current／B hash | isolation tests | reload各版本內容 |
| DATA-004 | same-version stale write 409且零寫入；different draft可各自成功 | CAS integration tests | two-window smoke |
| FLOW-001 | current-view無mutation，明確確認後才current-maintenance | callback／API negative | keyboard、drag、menu、Inspector走查 |
| FLOW-002 | dirty／pending save失敗會阻擋switch；成功後switch清空舊history | orchestration tests | network failure／recovery操作 |
| FLOW-003 | create、rename、archive、restore符合name／status invariant，無DELETE | domain／API tests | drawer row action walkthrough |
| FLOW-004 | reload回到合法session version；unknown／archived selection回current | selection tests | reload／archive active draft |
| COMP-001 | 2–5版summary六指標符合golden fixture與同一asOf | comparison tests | summary table values |
| COMP-002 | 詳細diff涵蓋department／position／employee／assignment／role／risk／layout，忽略savedAt／collapsed／座標 | diff tests | change list抽查 |
| COMP-003 | A／B diagram只讀，added／removed／changed／moved不只靠色彩 | DOM／type checks | 1440 split、1024／390 toggle screenshots |
| UX-001 | 五秒內辨識目前版本、類型、是否可編輯與保存狀態 | role／label inventory | 5秒理解檢查 |
| UX-002 | 版本清單使用list，summary使用table；無逐列下一步CTA或重複狀態 | DOM/text inventory | information-noise sweep |
| UX-003 | drawer／compare scroll owner清楚，三viewport無重疊、裁切或document overflow | dimension assertions | viewport screenshots |
| ERR-001 | autosave／load／conflict顯示人類影響與恢復方式，無raw API／HTTP文字 | error mapping tests | visible error sweep |
| REG-001 | 既有organization、assignment、hierarchy、layout、department、document與risk tests全過 | `npm test` | 無 |
| REG-002 | TypeScript與Vite production build成功 | `npm run build` | 無 |

QC 必須記錄 route／mode、activeVersionId對應的可見名稱、viewport、操作、資料fixture、timestamp、screenshot與console／network結果。內部ID可進QC報告，但不得常駐產品主畫面。

建議證據路徑：

```text
output/playwright/dev-020/version-workspace-1440x900.png
output/playwright/dev-020/version-workspace-1024x768.png
output/playwright/dev-020/version-workspace-390x844.png
output/playwright/dev-020/version-compare-split-1440x900.png
```

## 19. Stop Conditions

任一成立即停止宣告 DEV-020 完成並回送 RD：

- canonical／legacy V4／V3／V2 被刪除、覆寫或 bytes 改變。
- DEV-021 尚未完成或 V4 baseline 漂移時仍開始建立 workspace／修改 App。
- workspace current 不唯一、current可被封存／刪除，或草稿save改變其他版本。
- hydration尚未完成即把fixture寫入workspace。
- stale revision仍可PUT成功，或conflict後server內容被本機舊狀態覆寫。
- manifest invalid時偷偷fallback legacy；單一draft invalid使所有合法版本不可用。
- current-view／compare任一mouse、keyboard、context menu、drag或程式callback仍可commit。
- diff使用座標／像素／savedAt作權威，或golden fixture出現漏報／假差異。
- 1440×900、1024×768、390×844任一主要流程重疊、裁切、不可操作或document-level overflow。
- 畫面出現可見`.inline-error`未預期失敗、HTTP 4xx／5xx、Not Found、Internal Server Error或raw `/api/...`文字。
- `npm test`、`npm run build`或必要API round-trip失敗。
- DEV-020 task-owned runtime未清理，或protected 4173被停止／重啟／不可達。
- scope漂移到發布、rollback、永久刪除、Auth、雲端或production操作。

## 20. Runtime／Release Feasibility Note

- DEV-020會新增本機檔案與API route，但不新增環境變數、外部服務、hosting或production target。
- 本機QA／QC如需啟動5000，必須記錄project、purpose、port、process tree與cleanup condition；完成後只停止該task-owned process tree。
- `127.0.0.1:4173` 是受保護的ProJED primary environment；DEV-020不得停止、重啟、清port或共用該runtime。
- `RD Implementation Complete / QA-QC Passed` 不代表Release Ready；本文件不包含merge、PR、deploy、production rollback或post-deploy smoke artifact。

## 21. Future Phase Capsule：發布與回復

狀態：`Future Phase Captured / Not Requested`

- 目的：讓選定草稿經影響預覽後成為新現行版，舊現行版封存且可回復。
- 依賴：穩定version ID、basedOn關係、current protection、CAS與DEV-020 comparison結果。
- 邊界：本DEV不增加publish狀態、current pointer轉移、approval、rollback endpoint或UI。
- 驗收方向：發布不覆寫唯一可恢復來源；新舊current可追溯，回復不破壞draft。
- Re-entry trigger：使用者要求採用草稿、回復舊現行版、發布核准或版本合併時另建／升級後續DEV。

## 22. Spec Governance／Readiness

- Spec Impact Preflight：`Compatible exception`。DEV-020擴充DEV-015單文件操作，不改寫前置交付完成後的 current parser、下載或recovery acceptance；workspace建立後legacy PUT受保護是避免雙重權威的必要相容例外。
- ADR-001：不受影響；所有比較仍以`Position.parentPositionId`為主要上下級權威。
- DEV-019：不受影響；risk rules仍保存於每份current-schema state，risk match只作compare derived input。
- DEV-021：`Required predecessor`。DEV-020 包覆 DEV-021 完成後的完整 V4 `OrgDirectoryState`，包含主職、例外核准人與任職語意；不得以 V3 shape 建立 workspace 或讓版本切換遺失 V4 欄位。
- ADR-002：已建立並Accepted；manifest＋per-version file、CAS與legacy preservation為DEV-020權威儲存決策。
- Deferred Scope Audit：發布／回復已保存於第21節future capsule；永久刪除、Auth／多人／cloud與AI推薦不影響current implementation正確性，不建立額外current DEV。
- RD Readiness Gate：資料、API、state、concurrency、migration、failure recovery、file impact、acceptance、QA／QC、stop conditions均已明確；P0／P1 readiness blocker為0。DEV-021 是執行排序 gate，不是文件 readiness blocker。
- Git boundary：`C:\VIBE CODING\OrgMaster`目前不是Git repository；本輪以實際檔案範圍保護，未建立commit／branch／PR。

## 23. 變更紀錄

- 2026-08-16：由Brief Ready升級為`RD Implementation Ready`；採現行版獨立維護模式、草稿可恢復封存、manifest＋每版本current-schema文件、CAS、legacy migration與S1→S4 gate。DEV-021 完成並建立V4 canonical baseline後才可進S1；未修改產品程式。
- 2026-08-16：DEV-021 V4 baseline完成後執行S1–S4；完成workspace domain／store／API／CAS、App版本編排與獨立autosave、current-view／current-maintenance gate、封存／還原、summary／diff與唯讀比較畫面。19 files／126 tests、build、API round-trip與browser QC通過；狀態升為`RD Implementation Complete / QA-QC Passed`。
