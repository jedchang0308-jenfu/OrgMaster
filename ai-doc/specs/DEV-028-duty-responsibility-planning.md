# DEV-028：工作執掌責任關係與永久移轉 RD Handoff Contract

狀態：`RD Implementation Complete / QA-QC Passed / Human Confirmed`  
日期：2026-08-18  
來源：`USER-2026-08-18-POSITION-DUTY-RELATION-PERMANENT-TRANSFER`、DEV-028 Human Decision Brief `1A–56A／自訂`  
風險等級：Medium（版本化主資料、職位刪除保留、本機持久草稿、CAS 與跨檔原子批次；不含登入、版本 ACL 或跨裝置協作）  
權威範圍：DEV-028 第一階段的行為、資料、命令、本機草稿、併發、API 邊界、相容性與 QA／QC 契約  
架構決策：`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`

## 2026-08-23 Project Highest Principle Supersession

來源：`USER-2026-08-23-MOBILE-READ-ONLY-HIGHEST-PRINCIPLE`；權威入口：DEV-033 與 `ai-doc/documentation_map.md#專案最高產品原則`。

手機只提供唯讀閱讀與導覽。本文任何允許手機或窄 viewport 寫入的條款，均由 DEV-033 的專案最高產品原則 `Intentional replacement`；既有完成狀態、桌面契約、測試與截圖仍為歷史證據。現行產品程式尚未因本文件修訂而改變，後續實作與驗證只由 DEV-033 推進。

## 2026-08-21 Current Contract Replacement（最高優先）

來源：`USER-2026-08-21-UNIFIED-SAVE-FLOW`

本節以 `Intentional replacement` 取代本文所有 Current Phase 的獨立 batch plan、600ms autosave、plan store／API／revision、preview／apply／discard、窄 viewport 唯讀與跨檔 journal 契約；既有章節僅保留歷史完成證據。

- Duty CRUD、責任關係拖放與異常修復直接修改目前 organization state。
- 樹狀圖與執掌規劃台共用一套 `isDirty → 500ms autosave／Ctrl+S → organization version` 流程，以及同一 Undo／Redo history。
- 每次完成的配置或修復操作是一個 organization command；失敗不改 state，成功後立即反映，無「待套用」中間狀態。
- 移除 plan toolbar、預覽／確認套用、捨棄草案、plan client hook／queue、plan API／store runtime；既有 plan data file 不刪除且不再讀寫。
- 所有 viewport 依相同 workspace mode 提供編輯能力；窄螢幕不再被額外限制為唯讀。
- 正式 Duty／relation 的 V6 schema、版本獨立性、workspace mode、version CAS、登入／ACL Future Phase 邊界不變。

後續契約：`ai-doc/specs/DEV-029-duty-allocation-workbench.md` 已達 `RD Implementation Ready / RD Not Started`，規劃以合併工作台及 route-based 明細層取代本文件第15／23節的兩頁籤 surface，並以plan V2擴充relation placement；DEV-029尚未實作，因此本文件仍描述目前已完成產品，既有完成證據不因後續契約而改寫。

## 1. Outcome 與執行邊界

本契約已依 S1→S5 完成本地產品實作與驗證；本輪未修改 production data、deploy 或 release 設定。

Current phase 成功結果：

- 每個組織版本保存自己的工作執掌與職位責任關係；同一版本內一項職掌只有一份共用文字。
- 關係固定為執行、審核、協作、會簽；系統不依主管、階層、部門、職稱或目前任職人員自動帶入。
- 可直接永久移轉有效的主執行，也可在中央異常規劃頁以本機 batch plan 混合修復三種異常。
- 職位失效不會讓關係靜默消失；異常持續可見但不阻擋版本保存、編輯或使用。
- 整批修復先預覽後原子套用，全部成功或全部失敗，並成為一次 Undo／redo。
- 本機 batch plan 以組織版本歸屬，跨同機頁面重新整理保存；多分頁／視窗以 plan revision CAS 防止靜默覆寫，不提供 lease 或接手。

本文件曾於前一階段以 `RD Implementation Ready` 固定 repo 落點、symbol、migration、API、recovery、切片與 evidence gate；本輪已依該契約完成產品程式實作與驗證，現行狀態以文件頂端的 `RD Implementation Complete / QA-QC Passed` 為準。可信登入 principal、版本 ACL、每人私有草稿、跨裝置及 lease／接手均為 Future Phase，不阻擋第一階段。

## 2. Current Architecture Impact

### 2.1 已確認現況

- Runtime 是 React 19、TypeScript 7、Vite 8、Vitest 4；本機入口為 `npm run dev:local`、`localhost:5000`。
- `OrgDirectoryState` 目前由 V5 `OrgDocumentFile` 保存於 `data/orgmaster-versions/<versionId>.json`；workspace manifest 與每版本文件各有 SHA-256 revision。
- 組織版本寫入經 server process lock、expected revision CAS 與同目錄 temporary-file rename；current 只在 `current-maintenance`、draft 只在 `draft-edit` 可寫。
- `useOrgHistory` 保存最多 80 個 in-memory state snapshots；一個 `commitState` 對應一個 Undo／redo 單位，版本切換會清空 history。
- `DELETE_POSITION` 不是刪除 record，而是把目標職位（或 branch）設為 `inactive`、移除畫布 member 並關閉任職；因此 DEV-028 可在同一 command 內把受影響職掌關係轉為待重新分配。
- DEV-020 第一版沒有永久刪除組織版本的 endpoint；只有草稿封存與還原。
- DEV-027 已有 provider-neutral principal／permission policy 與本機固定 development identity，但一般 workspace API 目前沒有 authentication 或版本存取授權；`current-maintenance` 是 intent gate，不是安全權限。依 `56A`，第一階段不宣稱或驗收帳號隔離與版本 ACL。
- DEV-027 governance snapshot只複製 evaluator 所需的既有人員／職位／任職結構，沒有把整份 `OrgDirectoryState` 當政策資料。

### 2.2 受影響面

- 組織文件 schema 需由 V5 升至 V6，加入版本內工作執掌與責任關係。
- 組織 command 與 validator需涵蓋職掌 CRUD、關係、排序、永久移轉、職位失效保留及批次修復。
- 中央職掌矩陣、中央異常規劃頁及職位細節必須讀寫同一份 active version state。
- 本機 batch plan、preview receipt 與 autosave revision 需使用獨立 workspace-side store；不得進入 V6 組織文件、browser localStorage、workspace manifest 或 governance policy store。
- 批次 apply 必須協調組織版本 CAS 與本機草稿 cleanup；不可沿用逐列 PUT 或 client-only last-write-wins。
- 一般 workspace mode／version status 仍須在 server mutation 邊界重驗；它們只限制目前工作模式，不等於 authentication 或版本 ACL。

### 2.3 刻意不改

- `Position.parentPositionId` 仍只表示組織匯報；不推導審核、會簽或執行職位。
- 組織職務 `Role`、人員 `Employee`、任職 `Assignment` 與工作執掌關係分離；關係只連到 Position。
- DEV-027 仍是應用權限與 approval policy authority；工作執掌的「審核／會簽」不是 permission grant 或 approval decision。
- DEV-020 的職掌版本比較保持排除；既有組織比較仍可運作，但不得顯示或計算職掌差異。
- Governance published snapshot 不增加職掌資料，除非 future policy 明確要求且重新進入 DEV-027／ADR gate。

## 3. Scope 與 Out of Scope

### 3.1 Current phase scope

- 一行職掌名稱、選填說明、四種職位關係及五個顯示群組（主執行、其他執行、審核、協作、會簽）。
- 以職位為列的全公司職掌矩陣，以及職位細節中的職掌入口。
- 有效主執行的永久移轉。
- 職位失效時保留關係快照；中央異常規劃以每項職掌一列集中修復。
- 三種非阻擋異常、雙口徑統計、排序、篩選、projected state 與相依異常處理。
- 本機單一工作區持久草稿、autosave、stale-base reconciliation、多視窗 CAS、preview、原子 apply、discard 與 Undo／redo 邊界。
- Desktop／laptop 完整規劃；窄 viewport 唯讀。

### 3.2 Out of scope

- 暫時代理、有效期間、到期復原、請假代理或協作支援型移轉。
- 送審、待辦、approve／reject、通知、SLA、審核／會簽順序、法定人數或通過條件。
- 依工作執掌關係直接授予系統權限或外部審核資格。
- AI-PDM、ERP 或其他外部系統讀寫、雙寫與交易 audit。
- SOP、附件、表單、證據、執行進度、員工待辦、績效或薪酬計算。
- 職掌版本比較、差異摘要、比較篩選或視覺 diff。
- 獨立永久移轉紀錄、移轉理由、操作者、移轉日期或 audit panel。
- 職掌專屬或主管轄區細粒度權限。
- 登入 principal、版本 ACL、每人私有草稿、登出／登入續接、真正跨裝置同步或多人共同編輯。
- Active editor lease、heartbeat、接手與舊工作階段強制失效。

## 4. Architecture Decision

- 權威 ADR：`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`。
- 正式職掌與關係屬於組織版本的一部分，進入 V6 `OrgDirectoryState`；本機 batch plan 使用版本外的獨立 workspace-side store。
- 原因：正式資料必須跟著版本複製、切換及 Undo；未套用草稿須獨立 autosave、discard 與 apply，不能提前改寫正式版本。第一階段以 organization version ID 歸屬，不建立 principal ownership。
- 此 ADR 同時保留 DEV-020 的 manifest＋per-version file 與 DEV-027 的獨立 governance store，不建立第三個政策權威。

## 5. V6 Domain Data Contract

以下為邏輯契約；RD 可調整局部型別名稱，但不得改變識別、生命週期、唯一性、快照與版本歸屬。

```ts
type DutyRelationType = 'execute' | 'review' | 'collaborate' | 'countersign'

interface Duty {
  id: string
  title: string
  description: string | null
}

type DutyRelationTarget =
  | { kind: 'position'; positionId: string }
  | {
      kind: 'pending-reassignment'
      formerPositionId: string
      formerPositionTitle: string
      formerDepartmentId: string | null
      formerDepartmentName: string | null
    }

interface DutyPositionRelation {
  id: string
  dutyId: string
  relationType: DutyRelationType
  target: DutyRelationTarget
  isPrimaryExecutor: boolean
  order: number
}

interface OrgDirectoryStateV6 extends OrgDirectoryStateV5 {
  duties: Duty[]
  dutyPositionRelations: DutyPositionRelation[]
}
```

### 5.1 Identity and text rules

- Duty／relation ID 在同一版本各自唯一，符合既有 safe ID pattern `^[A-Za-z0-9-]{1,80}$`；跨版本複製時保留 ID，讓不同版本可指向同一來源 identity，但內容彼此獨立。
- `title` trim 後 1–120 字，不允許 CR／LF；`description` trim 後空字串正規化為 null，最多 2,000 字，可換行。
- 職掌名稱不要求唯一；所有 duty-level 統計、plan、anomaly 與 command 都使用 Duty ID，不以文字去重。
- 同一 version 的任一入口只編輯同一 Duty record；不得在 Position 上保存職掌文字副本。

### 5.2 Relation invariants

- Active relation 的 target position 必須存在且 `status === 'active'`；inactive／missing position 不能作新目標。
- 同一 duty、active position、relation type 最多一筆 relation。
- `isPrimaryExecutor === true` 只允許 `relationType === 'execute'` 且 active target；pending relation可保留它在失效前是否為主執行。
- 同一 duty 的 active primary executor 上限為一；零個允許保存，兩個以上為 blocking validation error且整個 command 不寫入。
- `review`、`collaborate`、`countersign` 各允許零至多筆；同一 position 可同時擁有不同 relation type。
- 同一 position 在同一 duty 具有多種 relation 是衍生的非阻擋提醒，不進入三種中央異常計數，也不要求理由。
- `order` 是每個 active position＋顯示群組內的 0-based dense order；主執行群組最多一筆且 order 正規化為 0。重新指派至新群組時放在尾端；若命中既有同關係，保留既有 relation 與 order。
- Pending relation 不再屬於任何 active position 群組；其 `order` 保留失效前值供診斷，修復後依目標群組重新正規化。

### 5.3 Pending-reassignment snapshot

- Position 失效 command 必須在同一 proposed state 內，把每筆 active target relation 改成 `pending-reassignment`，保留原 relation ID、duty ID、relation type、primary flag與失效前 order。
- 快照使用失效當下 `Position.title`、`Position.departmentId` 與當時 department name；未設定部門以 null 保存，UI 再顯示「未設定部門」。
- 不保存 Employee ID、姓名或任職資訊。
- 後續職位／部門改名、移除或資料修復不得改寫既有快照。
- Position delete 的 `branch` mode 必須對 branch 中每個失效 position 分別轉換關係；不得只處理起點。
- Undo position delete 由既有 history 還原完整 previous state，因此 active relation與原快照前狀態一併恢復；redo 再產生相同 projected result。

## 6. Derived Anomaly Contract

異常不得另存一份會漂移的狀態；每次由目前 V6 state 與尚未套用 plan 的 projected state 純函式計算。

| Type | Stable identity | Derivation | Severity | Resolution |
| --- | --- | --- | --- | --- |
| `pending-reassignment` | `relation:<relationId>` | relation target 為 pending | 提醒 | 指定 active target或「不再指派」 |
| `missing-primary-executor` | `duty:<dutyId>:missing-primary` | active execute > 0 且 active primary = 0 | 中 | 提升既有其他執行，或新增 active position為執行＋主執行 |
| `no-executor` | `duty:<dutyId>:no-executor` | active execute = 0 | 高 | 新增 active position為執行＋唯一主執行 |

規則：

- Pending 的主執行 relation 不算 active executor，因此同一 duty 可同時出現 pending 與 missing-primary／no-executor；兩者 identity、計數、嚴重程度與解除條件分開。
- 一個 duty 在中央表永遠一列；列級 severity 取目前全部異常的最高值，不另存欄位。
- 預設排序為高→中→提醒，同級依 normalized duty title，再以 duty ID 穩定 tie-break。
- Filter 使用 any-match 決定 row inclusion；被納入的 row 仍顯示全部異常。命中項用文字／icon／形狀標記，不只變色。
- 全體與篩選結果各顯示 anomaly count及 distinct duty count；distinct key只使用 Duty ID。
- Projected plan若會解除同列另一異常，該異常保持可見並標示 `resolved-by-related-plan`，其衝突輸入 disabled；撤回上游 plan 後立即重算。
- Projector 先把完整 intent set canonical sort，再一次計算 next state；不得依表格排序、點選先後或迴圈寫入順序決定結果。

## 7. Organization Command Contract

所有正式異動都使用 pure command 產生完整 proposed state，通過 V6 validation 後才 `commitState`。本節定義產品行為；第 21–26 節進一步固定 Implementation Ready 的檔案、symbol、交易、切片與驗證 allowlist。

### 7.1 General duty operations

- Create duty：可在沒有 relation或沒有主執行時保存；立即衍生 `no-executor`。
- Edit duty：只更新共用 title／description，不改 relation identity、order或 plan。
- Delete duty：只刪目前 active version內該 Duty及其全部 relation；不跨版本刪除。本機 plan 中引用該 duty 的 item 在下次 reconcile標為 stale conflict，不靜默改派。
- Upsert／remove relation：遵守 dedupe 與 primary上限；移除唯一 active primary 後允許保存並衍生對應缺口異常。
- Reorder：只改指定 position＋group 的 dense order，不改其他 group、relation type或 duty文字。
- Duplicate position：維持既有空職位語意，不複製來源職位的 duty relations。

### 7.2 Permanent primary-executor transfer

- 前置：來源 relation是該 duty目前唯一 active primary execute；目標 position active且不同於來源。
- 若目標沒有 execute relation：建立／轉成一筆 execute relation並標為 primary。
- 若目標已有 other execute relation：重用既有 relation並升為 primary，不新增 duplicate。
- 來源 execute relation移除；來源對同 duty 的 review／collaborate／countersign及其他 position關係不變。
- 命令完成後恰有一個 active primary；任何前置漂移、inactive target或第二主執行都整筆 reject，不留下中間狀態。
- 此單一有效關係移轉不建立獨立移轉 record，也不進入異常 batch plan；它仍是一次正式 Undo／redo command。

### 7.3 Position invalidation

- 既有 `DELETE_POSITION` 必須在同一 command 內同時處理 position status、member、assignment、employee responsibility及 duty relation target轉換。
- Duty relation 轉換失敗時整個 position delete reject；不得先失效 position再遺失關係。
- 關係異常非阻擋指的是「完整且合法的 pending snapshot可保存」，不是允許 dangling position ID 或半套快照。

### 7.4 Batch repair apply

- 一個 batch command可包含跨 duty、跨 relation type、跨三種 anomaly 的 intent。
- Pending relation：可 assign target或 drop；assign保留 relation type，target已具有同 duty＋type時去重。若 pending relation原為 primary execute，assign後目標成為唯一 primary。
- Missing-primary／no-executor：只接受 active target；可提升既有 execute或新增 execute並設成唯一 primary，不能用 drop消除。
- Apply在完整 current snapshot上一次產生 final state；任一 intent incomplete、stale、conflict或invalid，整批零寫入。
- 成功後 client把 server確認的 before→after當成單一 history commit；一次 Undo完整復原，一次 redo完整重做。Reload／版本切換後不承諾保留 in-memory history。

## 8. Local Workspace Batch Plan Contract

### 8.1 Logical data

```ts
type DutyRepairIntent =
  | {
      anomalyId: `relation:${string}`
      kind: 'pending-reassignment'
      dutyId: string
      relationId: string
      resolution: null | { kind: 'assign'; targetPositionId: string } | { kind: 'drop' }
    }
  | {
      anomalyId: `duty:${string}:missing-primary` | `duty:${string}:no-executor`
      kind: 'missing-primary-executor' | 'no-executor'
      dutyId: string
      resolution: null | {
        kind: 'set-primary'
        targetPositionId: string
        newRelationId: string
      }
    }

interface DutyBatchPlanDraftV1 {
  schemaVersion: 1
  organizationVersionId: string
  baseOrganizationRevision: string
  intents: DutyRepairIntent[]
  lastSavedAt: string
}
```

- Unique key 為 `organizationVersionId`；同一本機 workspace 的每個組織版本最多一份 active plan。
- 空白頁面不立即建立 workspace record；第一個 plan change 才 lazy-create。成功 apply 或確認 discard 後 record 不存在，不建立 history／tombstone 給 UI 查詢。
- Plan只保存修復意圖及必要基準，不保存完整 organization copy、Employee姓名、credential、approval work item或核駁資料。
- `newRelationId` 由 client 在使用者首次選擇責任缺口目標時以 `crypto.randomUUID()` 產生並隨 intent 保存；若目標已有同Duty的execute relation，projector重用既有relation並忽略該ID，否則以此ID建立新relation。ID格式或碰撞不合法時整批為conflict，不得由套用順序或server臨時亂數改變結果。
- Plan無時間型 TTL；只有 apply成功、確認 discard或 future organization version permanent delete才移除。
- 第一階段不保存 principal、owner、lease、裝置或工作階段欄位，也不宣稱不同作業系統帳號／登入者之間具有隱私隔離。

### 8.2 Draft revision and autosave

- 每份plan有workspace server產生的opaque revision；所有save要求expected plan revision。
- `lastSavedAt`由server在成功create／save時以UTC ISO-8601產生；client request不得指定或保留舊時間冒充成功保存。
- UI change後 600ms debounce autosave；新輸入發生時取消尚未送出的timer，不取消已送出的request。
- I/O failure保留 memory input並以 1s、2s、4s、8s、最多15s加 jitter重試；revision conflict不自動重送 mutation。
- Toolbar只顯示一次 `儲存中／已儲存／儲存失敗`；只有 workspace server成功 response可更新 `已儲存`與同機可恢復時間。
- 離開頁面時若 memory hash不等於最後成功 revision，使用 browser可用的離開警告；不得聲稱未保存內容或已保存plan可跨登入者／裝置恢復。

### 8.3 Stale-base reconciliation

- Load、version revision變更、preview與 apply前都以 current organization revision重算。
- Intent仍指向同一 active anomaly且target仍active、語意未改時保留。
- Anomaly已不存在、relation/duty identity不存在、target失效、relation type或primary語意改變時，該 intent標為 conflict/stale並要求使用者清除或重新選擇；不得靜默刪除、改派或當成成功。
- Reconcile後須保存新的 plan revision與 base organization revision；任何 conflict存在、reconcile尚未保存或 preview已過期時apply disabled。
- 同機其他分頁／視窗或其他合法 organization write 不被 plan lock 阻擋；以組織版本 CAS＋plan CAS＋reconcile 處理。

## 9. Multi-window CAS Contract

- 第一階段不選舉 active editor、不發 lease token、不做 heartbeat，也沒有「在此接手」。
- 同機多分頁／視窗各自以最後成功讀到的 plan revision 送出 save、preview、apply 或 discard；server 在 lock 內比較 expected revision。
- 第一個成功 mutation 產生新 revision。帶舊 revision 的工作階段收到 `PLAN_REVISION_CONFLICT`，保留目前 memory input，停止自動 mutation，並提供 reload／reconcile；不得 last-write-wins。
- Reload 後，以 stable anomaly identity 保留仍安全的 intent，將已失效或衝突項目標示為 stale；完成處理並成功保存前不得 apply。
- 這個 CAS 只防止同一本機 workspace 的靜默覆寫，不構成使用者識別、私人資料隔離或跨裝置同步。

## 10. Preview and Apply Gate

- Plan至少包含一個非空 intent即可開啟整批preview，即使仍有 incomplete item、unsaved input或其他blocker。
- Preview是pure operation，不修改 organization version或draft；逐項顯示before、planned result、dedupe、將解除／新增關係與相依異常，並彙總 duty數、position影響、relation type與change數。
- Preview input可包含目前memory plan供使用者看見完整缺口；只有input hash等於最後成功保存draft revision且其他gate通過時，server才簽發opaque apply receipt。
- Apply receipt至少綁定 organization version ID／revision、plan revision與canonical intent hash；任何一項改變即失效。
- Apply eligibility必須同時滿足：全部selected intent完整、plan最新保存成功、stale conflict為0、organization version的mode／status可編輯、apply receipt仍有效。
- 不得略過不合格item做partial apply；未被選入plan的其他異常可繼續存在。

## 11. HTTP API Contract

新增 `orgmasterDutyPlanApiPlugin`，並在 `vite.config.ts` 中排在既有 `orgmasterApiPlugin` 之前。固定 base path 為 `/api/orgmaster/duty-plans/:versionId`：

| Method／route | Request body | Required guards | Success |
| --- | --- | --- | --- |
| `GET /:versionId` | none | version exists | `200 { plan: DutyBatchPlanRecordV1 | null }`；沒有plan不是404 |
| `PUT /:versionId` | `{ expectedPlanRevision: string | null, baseOrganizationRevision, intents, mode }` | editable mode／status＋plan CAS | `200 { plan }`；首次建立只接受expected `null` |
| `DELETE /:versionId` | `{ expectedPlanRevision, mode }` | editable mode／status＋plan CAS | `204`；既有plan不存在回404 |
| `POST /:versionId/preview` | `{ plan, expectedPlanRevision, expectedVersionRevision, mode }` | version exists；receipt另需editable、saved plan exact match與zero blocker | `200 { preview, receipt?: string }` |
| `POST /:versionId/apply` | `{ commandId, receipt, expectedPlanRevision, expectedVersionRevision, mode }` | editable mode／status＋雙CAS＋current receipt | `200 { document, versionRevision, commandId, alreadyApplied, appliedVersionRevision }`；plan absent |

API boundary：

- `src/dutyPlanApi.ts` 提供對應typed client functions；所有回應使用`Cache-Control: no-store`，plan response帶`X-OrgMaster-Duty-Plan-Revision`，apply另帶既有`X-OrgMaster-Revision`。Revision只由server產生，client不得自行偽造新revision。
- `404`：organization version不存在，或DELETE時plan不存在。GET沒有plan固定回`200 { plan:null }`。
- `409`：version／plan revision conflict、stale／unknown receipt、mode／status已不可寫、plan與最後保存內容不符，或同command ID被不同payload重用。
- `422`：request shape／ID不合法、plan incomplete、stale/conflicted intent或projected domain validation失敗。
- `500／503`：plan store／journal不合法、workspace I/O失敗或transaction recovery不可用；保留原bytes並fail closed。
- Preview可在唯讀mode產生結果，但只有version目前可編輯、input等於最後保存plan、雙revision current且blocker為零時才簽發receipt。
- Receipt只保存在server process memory，以不可預測UUID為key，綁定version ID／revision、plan revision、canonical intent hash、mode與version status；10分鐘後失效。Server restart、該version的plan save／discard／apply或任何綁定值改變都使receipt失效，使用者重新preview即可，不另持久化receipt。
- UI只顯示人類影響與恢復方式，不顯示raw route、HTTP碼、revision或stack。
- 一般 duty CRUD與有效主執行移轉仍保存完整 V6 organization document並走版本 CAS；batch apply必須走專用server transaction，不能以多次一般 PUT取代。

## 12. Current-phase Access Boundary

### 12.1 Mode and version-status gate

DEV-028 第一階段不建立 authentication、版本 ACL 或職掌專屬權限。workspace server 只沿用 DEV-020 的既有模式／狀態語意：

- `current-view`、`compare`與archived version不可寫。
- `current-maintenance`與active `draft-edit`可在既有server mode／status檢查通過時寫入。
- Save、preview receipt、apply與discard每次request都重新檢查mode／status及revision，不把頁面初始狀態當永久決策。
- Mode／status變為唯讀時，plan可查看但mutation與apply disabled；恢復可編輯後先reconcile。
- 這些檢查是工作區資料完整性與操作意圖gate，不是安全授權。第一階段不得以「有mode gate」宣稱已實作登入、使用者權限或資料隱私。

### 12.2 Future shared-identity re-entry

- 現有 workspace API沒有authenticated principal或version ACL，因此第一階段明確定義為「本機單一工作區草稿」，不驗收43A的每人私人／跨裝置、48A的使用者存取撤銷或49A的lease／接手。
- Future Phase 要重新進入時，必須先固定可信identity來源、workspace與plan endpoints共用的version authorization、ownership key、既有local plan migration，以及跨裝置一致性／lease模型。
- 在上述契約完成前，不得把本機plan改稱私人plan，不得宣稱登出／登入或跨裝置續接，也不得用client-supplied owner模擬安全隔離。

## 13. Transaction, Idempotency and Recovery

### 13.1 Normal organization writes

- 新增 `server/orgmasterFileStore.ts`，把既有process root lock與verified atomic writer抽成workspace／plan共用基礎。`orgmasterWorkspaceStore`的public read／write都走同一root lock；只允許transaction內部呼叫明確命名的unlocked helper，避免巢狀lock。
- V6整份version save沿用DEV-020：共用root lock、lock內重讀、expected version revision、記憶體parse／validate、unique temp、read-back、atomic rename。
- Regular duty command先在client history產生proposed state，server仍以完整V6 validator作最後gate；409時保留client未保存state並要求reload/reconcile，不覆寫較新bytes。

### 13.2 Batch apply transaction

- Apply使用caller產生且每次確認不可重複利用的command ID與apply receipt。Server先以command ID查idempotency record：同ID＋同payload hash重送回`alreadyApplied: true`，不得二次套用；同ID不同payload回`COMMAND_ID_REUSED`。此檢查先於「plan不存在」，使成功response遺失後仍能安全retry。Replay在lock內讀取目前version：若revision仍等於recorded applied revision，回原apply後document；若後續合法寫入已推進revision，回目前document並保留`appliedVersionRevision`供client辨識，不回寫舊bytes。
- Server在單一共用root lock內重新驗證workspace mode／version status、兩個revision、receipt與完整projected state；不採兩把鎖，也沒有lock order競態。
- Organization update是單一V6 document replacement，不按intent逐筆寫檔。
- Local plan cleanup與organization write使用 `data/orgmaster-duty-apply-journal.v1.json` 收斂。Prepared journal保存command metadata、version file與plan store的before／after raw bytes及各自SHA-256；寫入順序固定為：atomic journal→atomic version after-image→atomic plan-store after-image（移除active plan並新增completed command）→讀回驗證兩份hash→刪除journal。
- API只有在organization bytes讀回驗證、plan已不可再次apply且transaction record完成後回success。

### 13.3 Failure recovery

| Failure | Required behavior | Data guarantee |
| --- | --- | --- |
| Plan autosave I/O fail | 保留memory input、顯示失敗、bounded retry | 不把失敗內容標為已保存 |
| Plan CAS conflict | 停止自動mutation，reload plan後reconcile | 不覆寫其他分頁／視窗最後成功save |
| Organization revision changed | receipt失效、重算projected state | 不覆寫新organization state |
| Apply domain validation fail | 422＋逐項blocker，version與plan不變 | zero partial write |
| Crash during local multi-file commit | request/startup recovery驗證prepared journal後固定roll-forward兩份after-image | 不可重複apply、不留下半套version |
| Invalid V6／plan store | fail closed，保留原bytes與exact temp診斷 | 不自動reset或猜測migration |

Recovery barrier在`orgmasterDutyPlanApiPlugin`註冊時建立，workspace與duty-plan routes處理request前都必須await完成。同process apply途中出錯時，在釋放root lock前先執行相同roll-forward recovery。Journal shape、path、before／after hash任一無法驗證時回503並保留原檔，不自動reset、rollback猜測或刪除journal；有效journal重播完成並驗證後才刪除。

## 14. Migration and Compatibility

- `OrgDocumentFile.version` 升為6；current local/recovery storage keys由v5升v6並保留legacy v5 key。V5→V6只新增 `duties: []`、`dutyPositionRelations: []`，不得由Position title、Role、Department、Assignment、主管關係或既有文字猜測職掌。
- V1–V4先依既有migration正規化為V5語意，再加入空職掌集合形成V6；所有legacy來源bytes保持不覆寫、不刪除。
- `documentStorage.ts` 必須先定義不含duties的explicit `OrgDirectoryStateV5`，再讓sourceVersion union擴為1–6；不得讓新增的required V6欄位透過現有`Omit<OrgDirectoryState,...>`反向污染legacy型別。
- Workspace manifest version不因inner document升V6而改變；每個version file獨立lazy-read／save。載入舊V5後可回傳normalized V6，但只有合法save才寫回該版本檔。
- V6 parser同時驗證organization、employee responsibilities、risk rules與duty invariants；任一blocking invariant失敗，該version fail closed。
- DEV-020 comparison只處理既有entity types；V6 duty fields明確忽略，並以regression test證明相同既有結構、不同duties不產生職掌diff。
- DEV-027 governance organization snapshot builder繼續只挑選既有必要欄位；V6 duties不得意外進入policy hash／snapshot或改變permission evaluation。
- Local plan store不存在時，GET視為空store且不寫檔；第一次成功save才lazy-create V1 store。不得從localStorage、organization draft或governance store匯入。
- DEV-020目前沒有永久version delete。未來新增該endpoint時，刪除transaction必須先定位並刪除該version local plan／in-flight journals，否則不得完成version delete；本DEV不自行新增version delete UI。

## 15. UX and Responsive Contract

### 15.1 Surface distinction

- 「全公司職掌矩陣」以Position為row，顯示全部職位及五個責任群組，是一般瀏覽／編輯全貌。
- 「中央異常規劃頁」只納入受異常影響的Duty，以Duty為row；不得把兩者混成同一row identity或讓使用者誤認計數口徑。
- Position detail中的條列與兩個中央入口都讀同一V6 state；修改共用Duty後同步反映。

### 15.2 Central planning page

- 工作執掌規劃由固定 `/duty-planning` 完整 URL 頁面承載；直接開啟或重新整理後仍載入同一版本的矩陣與規劃資料，瀏覽器上一頁可返回組織圖，頁面不得以 modal、遮罩或背景畫布承載主要工作流。
- Table是第一視覺；sticky toolbar只放全體／篩選雙統計、filter、共用save／conflict狀態、secondary menu與唯一primary「預覽並套用」。不用大型KPI卡。
- 一列至少有Duty、全部異常短標籤、目前有效承擔摘要及plan摘要；原職位／部門快照、完整關係與修復controls降層到右側fixed overlay drawer。
- Drawer不推擠table，可直接點另一row切換；body與drawer各有明確scroll owner，drawer body自行垂直捲動並阻止非預期scroll chaining。
- 關閉／切換drawer、改filter或排序只改view state，不清除plan或提交。
- Preview modal顯示完整影響與所有blocked reasons；Apply disabled時原因可focus／可讀。Discard位於secondary menu，確認顯示distinct duty count與plan change count，不要求typed confirmation。
- 正常恢復草稿只在toolbar低干擾顯示一次「已恢復草稿」與last saved time；conflict、save fail、read-only才提高權重並提供恢復方式。

### 15.3 Keyboard and accessibility

- Row可keyboard focus；ArrowUp／Down移動、Enter開drawer、Escape依最上層modal→drawer順序關閉。Focus在input、select、textarea或modal時不攔截table navigation。
- Icon button有aria-label／title；filter命中、severity、save、conflict、disabled與error不只靠顏色。
- Error使用`role=alert`，低干擾save／restore status使用`role=status`；modal focus trap、關閉後focus return。
- Apply／discard不配置全域高風險快捷鍵；既有Ctrl+Z／Ctrl+Y只在editable organization context操作正式history，不復原local plan lifecycle。

### 15.4 Viewport boundary

- Web無法可靠辨識實體「平板」或「筆電」，因此第一階段以可驗證viewport class固定：`>=1024 CSS px`為完整規劃基準，`<1024 CSS px`為響應式唯讀；不得依可偽造user-agent決定授權。
- 1440×900與1024×768必須能完成matrix、drawer、preview、apply與discard；768×1024與390×844只提供可讀table/card、全寬detail及plan狀態，不render duty mutation、plan discard或apply controls，client mutation handlers在narrow layout亦直接拒絕執行。
- Server無法可靠判定實體viewport，因此窄畫面唯讀是UX capability boundary，不是安全授權；server仍對所有實際收到的mutation執行mode／status、CAS及validation gate。

## 16. Acceptance Contract

### 16.1 Data and commands

- V5合法文件可無猜測升V6；所有舊版組織資料與來源bytes保持，V6 round-trip維持Duty ID、文字、relations、snapshot與order。
- 相同Duty跨多個Position顯示時，任一入口改名／說明後全部入口一致，沒有position-local copy。
- 零primary可save並正確分成missing-primary或no-executor；第二個active primary被reject且原state不變。
- Relation type可重疊且只提醒；相同duty＋position＋type去重。
- Position promote／branch delete後所有受影響relation轉pending並保留凍結快照；Duty與relation count不靜默減少。
- 有效主執行永久移轉只改source／target execute語意；所有其他relations、organization hierarchy與assignments不變，Undo／redo一次完成。

### 16.2 Anomaly planning

- Central row以Duty去重；一Duty多異常只一row，但anomaly count完整。最高severity排序、filter any-match、全部標籤保留及雙統計符合第6節。
- 三種異常可混合plan；各target預設空，pending可drop，兩種execution gap不可drop。
- Projected state能標示由相關plan解除的異常，撤回後恢復；相同intent set在不同點選／排序順序產生完全相同preview與final state。
- Target已有相同relation時只保留一筆；修復no-executor不留下中間missing-primary。
- Preview有一項change即可開；apply只在完整、saved、zero conflict、version mode／status editable、receipt current時enabled。
- Apply任一項失敗zero write；成功整批只一次Undo／redo，local plan被清除且Undo不重建。

### 16.3 Local persistence, concurrency and recovery

- 同一organization version在本機workspace只有一份active plan；重新整理後恢復最後一次成功saved內容，不以登入者或裝置區分。
- 分頁B先成功save後，持舊revision的分頁A mutation與apply失敗並進入reload／reconcile；不得覆寫B或自動猜測合併。
- Autosave fail保留input、重試並警告離開；未成功內容不標已保存。Stale organization保留safe inputs、標示conflict且禁止舊receipt apply。
- Version mode／status唯讀時local plan只讀；future permanent version delete會cascade該version plan。
- Crash／retry不會造成partial batch、duplicate apply或已apply version加上可再次apply active plan。

### 16.4 UX and boundary

- 五秒內可分辨目前是Position matrix或Duty anomaly planner、row主體、異常、plan摘要與唯一commit入口。
- Main table沒有逐列apply CTA；drawer沒有第二個commit入口；共用save／conflict狀態只顯示一次。
- 1440×900、1024×768完整流程可操作；768×1024、390×844唯讀且無overflow、重疊、裁切、可見寫入控制或可觸發的client寫入handler。
- Review／countersign畫面沒有送審、核准、駁回、待辦、通過或外部permission含義。

## 17. QA／QC and Evidence Gate

### 17.1 Required automated evidence

- V1–V5→V6migration、legacy byte preservation、V6round-trip、invalid shape／reference／duplicate／two-primary fail closed。
- Anomaly derivation、severity、identity、stats、sort、filter與projector order-independence golden tests。
- Duty CRUD、relation dedupe／reorder、permanent transfer、position promote／branch delete、batch apply與single-history-unit tests。
- Local plan key、lazy create、CAS、autosave retry classification、reconcile、receipt invalidation、discard／apply cleanup。
- 同機多分頁／視窗concurrent save serialization、stale writer rejection與reload／reconcile。
- API mode／version-status denial、body validation、status/error mapping與no-store headers。
- Apply idempotency、journal crash points、startup recovery、zero partial write及duplicate prevention。
- DEV-020 comparison明確忽略duties，DEV-027 snapshot／policy hash不意外納入duties。
- Full existing regression與TypeScript/Vite build。

### 17.2 Browser QC

- Viewports：1440×900、1024×768、768×1024、390×844。
- Full flow：matrix建立／編輯Duty與relations→primary transfer→delete related position→central planner雙統計／filter／drawer→mixed plan→autosave→reload restore→第二分頁造成plan CAS conflict→reload／reconcile→stale-base conflict→preview blockers→atomic apply→Undo／redo→new empty plan。
- Negative flow：second primary、inactive target、save fail、plan/version CAS conflict、mode／status轉唯讀、mobile write attempt、apply crash recovery。
- Accessibility：focus trap／return、Escape priority、keyboard row/detail、labels、status／alert、color-independent severity/filter、drawer scroll owner。
- Visible Error Sweep：正常flow沒有可見raw `/api/`、HTTP 4xx／5xx、revision或Internal Server Error；刻意error顯示人類影響與恢復方式。

### 17.3 QC stop rule

本DEV為Medium lane。實作後若migration、two-primary negative、position-delete preservation、local plan CAS conflict、stale receipt、atomic apply recovery、full regression、build、主要viewport或visible-error sweep任一未通過，回送RD，不標完成或進release gate。

## 18. Dependencies and Stop Conditions

### 18.1 Dependencies

- DEV-020／ADR-002：workspace version、revision、mode、CAS與per-version file。
- DEV-021／ADR-001：Position hierarchy及行政核准語意分離；不把主管當預設審核者。
- DEV-025：current document baseline為V5，DEV-028 migration source由此升V6。
- DEV-027／ADR-004／ADR-005：policy boundary及governance snapshot exclusion；不把Duty關係誤作權限或核准資料。

### 18.2 Implementation stop conditions

任一成立即停止 `RD Implementation Ready`、done或release宣告：

- 第一階段宣稱已具每人私有、登出／登入續接、跨裝置、版本ACL或lease／接手能力，卻沒有另行完成Future Phase契約。
- Duty資料另存成不隨organization version複製／切換的第二權威，或local plan進入V6文件。
- 兩個active primary可save，或零primary被誤作blocking而迫使自動指派。
- Position失效後relation被cascade delete、保留dangling active target或缺少必要snapshot。
- Batch以逐列write、partial success或last-write-wins完成；crash後可duplicate apply。
- Stale plan／receipt可覆寫較新organization或plan revision。
- Current-view、compare或archived狀態仍有成功write path；或`<1024px` UI仍render／觸發DEV-028寫入控制。
- Review／countersign開始產生approval transaction、permission grant或AI-PDM副作用。
- V5／legacy bytes被覆寫、DEV-020 compare誤納duties、DEV-027 policy snapshot意外擴張。

## 19. Deferred Scope Audit

- `Future Phase Captured / Not Requested`：職掌版本比較。目的為比較不同organization versions的Duty／relation差異；re-entry時需先固定cross-version identity、diff taxonomy及DEV-020 UI整合，不能由V6自動出現。
- `Future Phase Captured / Not Requested`：暫時代理與有效期間。目的為保留正式主執行並在期間內指定代理；re-entry時需新增time semantics、expiry recovery、conflict及顯示契約。
- `Future Phase Captured / Not Requested`：讓review／countersign成為正式審核資格或外部流程輸入。必須重新進入DEV-027／ADR-004與future integration gate，不能在DEV-028直接擴權。
- `Future Phase Captured / Not Requested`：可信登入principal、版本read／edit authorization、每人私有plan、登出／登入續接與真正跨裝置同步。Re-entry時須先固定identity provider、server authorization、ownership migration與privacy驗收。
- `Future Phase Captured / Not Requested`：active editor lease、heartbeat與明確接手。只有shared identity phase需要此能力；不得在第一階段加入半套lock UI。
- `Future integration constraint`：organization version permanent delete目前不存在；未來新增時必須transactionally cascade local plan／journal cleanup，第14節已保存hook，現階段不新增DELETE route。

## 20. Spec Governance Result

- Cross-spec compatibility：`Compatible exception`。DEV-028擴充V5→V6與Position delete command，但維持ADR-001 hierarchy authority、ADR-002 per-version storage、ADR-004 approval ownership及ADR-005 governance-store分離。
- `Intentional replacement`：除36自訂（Duty-row取代anomaly-row）外，`56A`將42B／43A／48A／49A／50A／52A中依賴登入身分、版本ACL、跨裝置與lease的部分移至Future Phase；本機autosave、reload restore、stale reconciliation、CAS、preview／atomic apply、discard及Undo邊界保留。
- ADR updated：ADR-006改為版本化正式資料與本機workspace plan分離；future private／shared plan需另行supersede。
- Readiness：目前達`RD Implementation Complete / QA-QC Passed / Human Confirmed`；第21–26節的repo級symbols、檔案allowlist、migration、recovery、切片及verification commands均已實作並驗證，沒有待確認產品決策或identity／version-access P0依賴。
- Repo boundary：`C:\VIBE CODING\OrgMaster`目前不是Git repository；本輪修改限於DEV-028 allowlist及實際載入的`vite.config.js`，未修改production data、deploy或release。

## 21. RD Symbol and Domain Implementation Contract

### 21.1 State and validation

- `src/types.ts` 新增並export第5節的 `DutyRelationType`、`Duty`、`DutyRelationTarget`、`DutyPositionRelation`；`OrgDirectoryState`新增required `duties`與`dutyPositionRelations`兩個array。不得新增Position內嵌文字或第二份Duty authority。
- 新增 `src/duties.ts`，唯一export surface為：`normalizeDutyState`、`validateDutyState`、`deriveDutyAnomalies`、`summarizeDutyAnomalies`、`filterAndSortDutyRows`、`findDutyRelationOverlapWarnings`、`normalizeDutyRelationOrders`、`invalidateDutyRelationsForPositions`。所有resolver都是pure function，不讀React、DOM、clock或filesystem。
- `DutyValidationCode`固定包含：`DUTY_ID_INVALID`、`DUTY_ID_DUPLICATE`、`DUTY_TITLE_REQUIRED`、`DUTY_TITLE_TOO_LONG`、`DUTY_TITLE_MULTILINE`、`DUTY_DESCRIPTION_TOO_LONG`、`DUTY_RELATION_ID_INVALID`、`DUTY_RELATION_ID_DUPLICATE`、`DUTY_RELATION_DUTY_MISSING`、`DUTY_RELATION_TARGET_INVALID`、`DUTY_RELATION_TARGET_INACTIVE`、`DUTY_RELATION_DUPLICATE`、`DUTY_RELATION_PRIMARY_INVALID`、`DUTY_PRIMARY_EXECUTOR_DUPLICATE`、`DUTY_RELATION_ORDER_INVALID`、`DUTY_RELATION_PENDING_SNAPSHOT_INVALID`。兩個以上active primary是error；第6節三種anomaly與relation overlap不是validation error。
- `normalizeDutyState`只做文字trim／空description→null及dense order正規化，不猜測relation、primary、主管或替代position；任何identity／reference／snapshot錯誤都交由validator fail closed。
- `invalidateDutyRelationsForPositions(state, invalidatedPositionIds)`只轉換仍指向指定active positions的relation，使用command proposed state失效前的position／department資料建立snapshot；已pending relation原樣保留。

### 21.2 Pure plan projector

- 新增 `src/dutyPlanning.ts`，export `reconcileDutyPlan`、`projectDutyPlan`、`buildDutyPlanPreview`與其typed result。Canonical intent order固定以`anomalyId`、`kind`、`dutyId`、`relationId ?? ''`排序，不讀UI row order。
- Projector採兩階段：先套用所有完整pending-reassignment intent並正規化；再由該projected state重算gap anomalies。已被前段或同批其他安全規劃解除的gap標為`resolved-by-related-plan` no-op；仍存在的gap才套用set-primary。最後只做一次完整V6 validation。
- Pending assign保留原relation ID與relation type；目標已存在同Duty＋type時移除pending relation並重用active relation。若pending原為primary execute，而目標套用後會與另一active primary並存，回blocker，不得靜默降級未選relation。
- Gap set-primary若目標已有execute則重用；否則使用intent的`newRelationId`新增execute。ID碰撞、target inactive或anomaly已發生非相依語意漂移都回conflict。相同初始state＋canonical intent set必須得到byte-equivalent normalized domain result。

### 21.3 Organization commands

- `src/organizationCommands.ts` 的command union新增：`CREATE_DUTY`、`PATCH_DUTY`、`DELETE_DUTY`、`UPSERT_DUTY_RELATION`、`REMOVE_DUTY_RELATION`、`REORDER_DUTY_RELATION`、`TRANSFER_PRIMARY_DUTY_EXECUTOR`、`APPLY_DUTY_PLAN_BATCH`。
- `validateApplied`在既有organization與employee responsibility validation後呼叫`validateDutyState`；`OrganizationCommandIssue.code`納入`DutyValidationCode`，不得以字串cast繞過。
- `DELETE_POSITION`在同一proposed state內完成branch position失效、member移除、assignment關閉、employee responsibility reconcile及`invalidateDutyRelationsForPositions`，最後只驗證與commit一次。`DUPLICATE_POSITION`不得複製Duty relation。
- App一般Duty CRUD／transfer沿用`runOrganizationCommand`→`commitState`；batch server成功結果必須呼叫`commitStateHistory(afterState)`形成一個Undo單位，禁止`replaceState`清掉history。

## 22. RD Storage, API and Recovery Implementation Contract

### 22.1 V6 document migration

- `src/documentStorage.ts`設定`ORG_DOCUMENT_VERSION = 6`，current local／recovery keys改為v6並保留v5 legacy constants；`OrgDocumentFile.version`與parse source union擴為1–6。
- 實作explicit V5 legacy state及V5→V6 adapter；V1–V4沿現有鏈先到V5語意，再只加兩個空array。`normalizeV6State`在既有validator後執行Duty validator。Download copy與workspace version save都輸出V6。
- `server/orgmasterApi.ts` 的document path增加v6並以v6→v5→v4→v3→v2順序讀取；若較新的既有檔案不合法，立即fail closed，不得越過它讀更舊檔。Workspace manifest／version directory命名不升版。
- `src/screenshotData.ts`與直接建立`OrgDirectoryState`的測試fixture明確加入空arrays。`src/versionComparison.ts`與`src/governance/validation.ts`production code不改；只補regression證明Duty差異不進comparison／published snapshot hash。

### 22.2 Local plan store

新增 `server/orgmasterDutyPlanStore.ts`，固定檔案為 `data/orgmaster-duty-plans.v1.json`，shape如下：

```ts
interface DutyBatchPlanRecordV1 extends DutyBatchPlanDraftV1 {
  planRevision: string
}

interface DutyAppliedCommandV1 {
  commandId: string
  payloadHash: string
  organizationVersionId: string
  appliedVersionRevision: string
  completedAt: string
}

interface DutyPlanStoreV1 {
  app: 'OrgMaster'
  version: 1
  plans: DutyBatchPlanRecordV1[]
  appliedCommands: DutyAppliedCommandV1[]
}
```

- Store以organization version ID唯一；每次成功create／save以Node `crypto.randomUUID()`產生新的opaque plan revision，client只能回傳expected值。`appliedCommands`只是apply retry idempotency metadata，不含plan intents、完整organization copy、principal或可供UI瀏覽的草稿歷史；按`completedAt`保留最近256筆，裁切舊record不會讓已移除plan重新出現或被重套用。
- Store file不存在視為empty且GET不建立檔；第一次PUT才建立。存在但JSON／shape／duplicate key不合法時fail closed並保留bytes。成功discard與apply移除plan record；不建立tombstone或TTL。
- 新增`server/orgmasterFileStore.ts`的共用`withOrgMasterRootLock`與`writeVerifiedAtomicFile`；workspace及plan store不得各自保有互不相知的process lock。

### 22.3 API adapter and transaction

- 新增 `server/orgmasterDutyPlanApi.ts` 實作第11節routes、receipt registry、recovery barrier與error mapping；`src/dutyPlanApi.ts`只處理typed fetch、headers及domain error mapping，不保存draft。
- Apply payload hash固定由canonical JSON的`commandId`以外欄位、receipt binding與projected result hash組成；same command ID／same hash回recorded result，different hash回409。Idempotency record只有在plan-store after-image內與plan removal同時成為目標狀態。
- Journal固定為`data/orgmaster-duty-apply-journal.v1.json`。任何apply開始前若journal存在先recover；prepared後不允許啟動第二筆apply。Recovery只接受已知version path與plan-store path、合法before／after hash，固定roll-forward after-images，不依目前只寫完哪一檔猜測rollback。
- `server/orgmasterWorkspaceStore.ts`提供lock內使用的read／save helper給transaction adapter；public API仍自行取得共用lock。不得從duty-plan module以HTTP呼叫workspace route完成transaction。

## 23. RD Client and UI Wiring Contract

### 23.1 App and plan lifecycle

- 新增 `src/useDutyPlan.ts`，由`App.tsx`在中央dialog之外持有，使matrix／planner tab切換或drawer關閉不會卸載草稿。State固定有`loading | clean | saving | saved | retrying | conflict | read-only | applying | error`，並分開追蹤memory hash、last saved plan revision、base organization revision及receipt。
- Debounce為600ms；只對I/O／5xx採1／2／4／8／15秒上限＋jitter重試。409停止自動mutation、保留memory intents並暴露reload／reconcile；beforeunload只在memory hash不同於最後成功保存內容時註冊。
- 切換organization version前先flush目前plan；flush失敗時阻止切換並保留畫面。由matrix切planner或開preview前，先flush既有whole-document autosave；失敗則留在原surface並顯示恢復方式。
- 偵測server version revision變更時執行`reconcileDutyPlan`並保存新base revision；一般organization save仍dirty／pending時planner apply disabled。Batch apply pending期間暫停既有1.5秒cross-window poll。
- 首次Apply成功，或idempotent replay時目前revision仍等於`appliedVersionRevision`，App以response document呼叫`commitStateHistory`，同步更新server revision與saved signature後才恢復autosave／poll，避免成功結果再被當成一般dirty save。若replay時version已被後續合法寫入推進，改以`replaceState`載入server current document並告知「批次已套用，但版本後續已更新」；此時不偽造可安全Undo的舊history。Undo／redo只操作正式state，不建立、刪除或恢復plan。

### 23.2 Components

- `Toolbar.tsx`新增有文字label／aria-label／title的職掌入口；導向固定 URL `/duty-planning` 的完整工作執掌頁面，不再以 modal 承載主要工作流。頁面保留兩tab：`DutyMatrixView.tsx`與`DutyPlanningView.tsx`，提供可辨識的「返回組織圖」入口。
- `/duty-planning` 可由瀏覽器直接開啟、重新整理、分享及使用上一頁返回；從個別職位入口可附帶 `?position=<positionId>` 聚焦來源職位。路由只改變 UI surface，不新增資料模型、API 或保存路徑。
- Matrix以active Position為row，沿既有department＋organization level分組／排序，五欄固定為主執行、其他執行、審核、協作、會簽；一般建立／編輯Duty、relation與transfer由`DutyDetailDrawer.tsx`及`DutyDialogs.tsx`完成，沒有主管預設值。
- `Inspector.tsx`加入`PositionDutySection.tsx`，依五群組顯示條列與數量；唯一管理按鈕開啟同一DutyCenter並聚焦／篩選目前Position，不建立第二份資料或不同save path。
- Planner以Duty一列，toolbar／drawer／filter／統計／single apply入口依第15節；`DutyDetailDrawer`為fixed overlay。Review／countersign只顯示關係文字，禁止送審、approve／reject或permission UI。
- Duty delete確認顯示Duty名稱與relation count，不要求typed confirmation；primary transfer確認顯示source／target，只改主執行。所有正式mutation仍受`editingEnabled`及command validation雙gate。
- `>=1024px`render完整editor；`<1024px`render唯讀card／table／detail與plan status，不rendercreate/edit/delete/reorder/transfer、plan discard或apply control，event handlers亦先檢查viewport capability。CSS只新增於`src/index.css`，不引入UI或runtime dependency。

## 24. File Change Allowlist

RD只可在下列檔案實作DEV-028；需要超出時先回到PM做spec impact review，不得順手擴scope。

新增檔案：

- `src/duties.ts`、`src/duties.test.ts`
- `src/dutyPlanning.ts`、`src/dutyPlanning.test.ts`
- `src/dutyPlanApi.ts`、`src/dutyPlanApi.test.ts`
- `src/useDutyPlan.ts`
- `src/dutyPlanMutationQueue.ts`、`src/dutyPlanMutationQueue.test.ts`
- `src/dutyPlanningRoute.ts`、`src/dutyPlanningRoute.test.ts`
- `server/orgmasterFileStore.ts`
- `server/orgmasterDutyPlanStore.ts`、`server/orgmasterDutyPlanStore.test.ts`
- `server/orgmasterDutyPlanApi.ts`、`server/orgmasterDutyPlanApi.test.ts`
- `src/components/DutyCenter.tsx`
- `src/components/DutyMatrixView.tsx`
- `src/components/DutyPlanningView.tsx`
- `src/components/DutyDetailDrawer.tsx`
- `src/components/DutyDialogs.tsx`
- `src/components/PositionDutySection.tsx`

既有檔案：

- `src/types.ts`
- `src/documentStorage.ts`、`src/documentStorage.test.ts`
- `src/organizationCommands.ts`、`src/organizationCommands.test.ts`
- `src/screenshotData.ts`
- `src/versionComparison.test.ts`
- `src/governance/validation.test.ts`
- `src/directories.test.ts`
- `src/employeeResponsibilities.test.ts`
- `src/layout.test.ts`
- `src/organizationHierarchy.test.ts`
- `src/drag.test.ts`
- `server/orgmasterWorkspaceStore.ts`、`server/orgmasterWorkspaceStore.test.ts`
- `server/orgmasterApi.ts`、`server/orgmasterApi.test.ts`
- `src/components/Toolbar.tsx`
- `src/components/Inspector.tsx`
- `src/App.tsx`
- `src/index.css`
- `vite.config.ts`
- `vite.config.js`（本機 Vite 實際載入的 runtime config，同步 Duty plan API plugin）

禁止修改`package.json`／lockfile、`src/versionComparison.ts`、`src/governance/validation.ts` production logic、任何`data/*.json`來源資料、deploy／release設定或其他repo。測試與QC產生的暫存／evidence只能放既有test temp或`output/playwright/dev-028/`。

## 25. Implementation Slices and Executable Gates

Entry baseline已於2026-08-18執行`npm test -- --run`：28 files／167 tests通過；完成後`npm test -- --run`為33 files／183 tests通過；Vite native config loader的extension warnings與bundle chunk size warning為既有／非阻擋訊息，不列入DEV-028修復範圍。

| Slice | RD deliverable | Exit gate |
| --- | --- | --- |
| S1 Domain＋V6 | types、duties pure helpers、V1–V5→V6、fixture empty arrays | Duty validation與migration targeted tests全綠；legacy與invalid-newer fail closed |
| S2 Commands＋projector | 8 commands、position invalidation、anomaly／stats／filter、two-pass projector | command與planning tests全綠；two-primary、snapshot、order-independent negative tests通過 |
| S3 Store＋API＋recovery | shared root lock、plan store、routes、receipt、journal、client adapter | store／API／workspace tests全綠；雙CAS、idempotency與3個crash injection points通過 |
| S4 Hook＋UI | App wiring、autosave/reconcile、matrix、planner、drawer、dialogs、position section、responsive | build通過；desktop完整、narrow唯讀與accessibility browser flow通過 |
| S5 QA／QC convergence | full regression、browser negative flow、evidence、spec drift check | 第17節全部通過才可標Implementation Complete |

每個slice完成targeted gate後才進下一slice；不得先做UI再補transaction。S3 crash injection至少覆蓋`after-journal`、`after-version-write`、`after-plan-store-write`，每點recovery後都驗證兩份after hash、plan absent、command retry不重複套用及journal absent。

Targeted command：

```powershell
npx vitest run src/duties.test.ts src/dutyPlanning.test.ts src/dutyPlanApi.test.ts src/useDutyPlan.test.ts src/documentStorage.test.ts src/organizationCommands.test.ts src/versionComparison.test.ts src/governance/validation.test.ts server/orgmasterWorkspaceStore.test.ts server/orgmasterDutyPlanStore.test.ts server/orgmasterDutyPlanApi.test.ts server/orgmasterApi.test.ts
```

Final automated gate：

```powershell
npm test -- --run
npm run build
```

Browser QC固定1440×900、1024×768、768×1024、390×844，證據輸出`output/playwright/dev-028/`。QC不得手動改寫正式`data/*.json`；使用測試store或先做byte-for-byte backup並於結束前驗證restore。若啟動`localhost:5000`，先記錄project／purpose／port／process tree，結束時只停止該task-owned tree、確認5000釋放，並再次確認受保護的ProJED `127.0.0.1:4173`仍可達。

## 26. Readiness, Recovery and Handoff Gate

- Spec Impact Preflight：`No conflict / maturity upgrade`。本輪不改56A產品決策；只是把同一權威spec由Contract Ready補到Implementation Ready。既有`Intentional replacement`與`Compatible exception`記錄仍有效。
- Post-change convergence：`In sync`。Authoritative spec、ADR-006、`dev_task.md`索引／handoff與`documentation_map.md`的狀態、下一步及Future Phase邊界一致；S1–S5 implementation、tests、build與browser evidence均已納入交付記錄。
- ADR gate：不新增ADR；正式Duty與local plan的authority、transaction及future identity re-entry仍由既有ADR-006完整涵蓋，本輪只把選定的shared-lock／journal recovery細節寫回同一ADR。
- P0／P1 gap：none。登入principal、版本ACL、每人私有、跨裝置、lease／接手皆為第19節Future Phase，不得在RD實作時重新帶回，也不阻擋S1。
- Recovery plan：任一slice失敗只回復該slice程式變更與test fixture；禁止刪改使用者`data/`。S3若留下有效journal，先用已實作recovery完成roll-forward並驗證，再移除task-owned test artifacts；無法驗證的journal保留並停止。
- Stop and escalate：baseline出現非既知失敗、legacy migration無法無損、兩primary可save、position delete遺失relation／snapshot、apply partial或duplicate、stale CAS成功、plan進V6／localStorage、Duty進DEV-020 comparison／DEV-027 snapshot、narrow UI可寫、需要新增dependency／auth／手改data，或任一required test／build／browser gate失敗。
- Handoff：S1–S5已完成。`npm test -- --run`（35 files／187 tests）、`npm run build`、server duty-plan API lazy GET/PUT/CAS、preview／atomic apply／plan removal、V5→V6 migration、`/duty-planning` direct-load／reload／browser-back／`?position=`、1440×900與390×844 browser QC均有證據；本地 task-owned 5000 runtime已清理，受保護的4173仍在監聽。未執行deploy或release。

## 27. Change Log

- 2026-08-19：登錄DEV-029後續契約。其合併工作台與plan V2屬planned successor；在DEV-029實作完成前，DEV-028的現行UI與完成證據維持不變。
- 2026-08-19：徹查持續出現的 `PLAN_REVISION_CONFLICT`，以隔離 5001 runtime 及延遲 PUT 證實單一頁面切換 matrix／planner 時，`DutyPlanningView` 會卸載 `useDutyPlan`，但舊 PUT 繼續完成；新 hook 先讀到舊 CAS token，下一筆保存即 409。修正為 `App.tsx` 在中央 dialog 外持有 plan，並新增依 organization version 共用、可跨 hook instance 等待的 mutation queue；server-authoritative plan revision 不再被 React render 的舊 state 回寫，409 改顯示可理解的恢復訊息。相同延遲案例由 PUT 200→409 改為 PUT 200→200，最終顯示「已保存」；`npm test -- --run` 為 34 files／185 tests，`tsc --noEmit`、`npm run build` 及 browser regression 通過。
- 2026-08-19：修正 Duty 本機草稿的同頁 autosave 競賽與過期 organization base revision 重算後未自動保存：PUT／DELETE 改為同一序列執行，reload 等待既有寫入完成，reconcile 後自動保存無衝突結果；另修正 governance unchanged-status command 不應因 `updatedAt` 變更而誤判為 applied。`npm test -- --run`、`tsc --noEmit`、`npm run build` 與 browser smoke 通過。
- 2026-08-18：依使用者要求將同一DEV-028補至`RD Implementation Ready`；固定repo/file allowlist、V6 explicit legacy migration、domain symbols、8個commands、two-pass deterministic projector、plan store與HTTP routes、shared root lock、receipt、journal roll-forward、idempotency、App／UI wiring、S1–S5與可執行test／browser／recovery gate。Baseline `npm test -- --run`為28 files／167 tests通過；本輪未修改產品程式、runtime data、deploy或release。
- 2026-08-18：依使用者`56A`進行`Intentional replacement`：第一階段收斂為本機單一工作區草稿，以organization version歸屬並保留autosave、reload restore、plan／version CAS、reconcile、preview與原子apply；登入principal、版本ACL、每人私有、登出／登入、跨裝置及lease／接手移至Future Phase。移除identity P0，風險由High降為Medium；本輪未實作。
- 2026-08-18：完成DEV-028 S1–S5本地實作：V6 Duty domain／migration、8個organization commands、two-pass projector、shared lock／plan store／API／journal recovery、App hook與中央矩陣／規劃／drawer／Inspector UI；33 files／183 tests、build、API apply與1440×900／390×844 browser QC通過。同步實際載入的`vite.config.js`以啟用Duty plan API；未修改production data、deploy或release。
- 2026-08-18：依使用者`55A`沿用同一DEV由Brief升級至`RD Contract Ready`；當時固定V6正式職掌、獨立私人plan store、anomaly identity、command、lease、preview/apply、CAS、recovery、migration、UX、QA／QC與identity/version-access stop condition；Current Phase草稿／lease部分後由`56A`取代。本輪未實作。
