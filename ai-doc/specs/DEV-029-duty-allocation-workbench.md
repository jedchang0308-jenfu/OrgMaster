# DEV-029：工作執掌責任配置工作台 RD Handoff Contract

狀態：`RD Implementation Complete / QA-QC Passed / Human Confirmed`  
日期：2026-08-20  
來源：`USER-2026-08-19-DUTY-ALLOCATION-WORKBENCH-DRAG-DROP`、`USER-2026-08-19-DEV-029-RD-IMPLEMENTATION-READY`、`USER-2026-08-20-DUTY-MATRIX-COLUMN-CONSOLIDATION`、Human Decision Brief `1C 2A 3A 4B 5A 6B 7C 8A 9B 10A`  
父任務：DEV-028  
風險等級：Medium（主要 UI 流程、可持久草案 union、投影器與批次套用擴充；不含正式 schema、權限或部署變更）  
權威範圍：DEV-029 Current Phase 的頁面層級、拖放語意、草案資料、投影／套用、相容性與驗收契約  
沿用架構決策：`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`

## 2026-08-23 Project Highest Principle Supersession

來源：`USER-2026-08-23-MOBILE-READ-ONLY-HIGHEST-PRINCIPLE`；權威入口：DEV-033 與 `ai-doc/documentation_map.md#專案最高產品原則`。

手機只提供唯讀閱讀與導覽。本文任何允許手機或窄 viewport 寫入的條款，均由 DEV-033 的專案最高產品原則 `Intentional replacement`；既有完成狀態、桌面契約、測試與截圖仍為歷史證據。現行產品程式尚未因本文件修訂而改變，後續實作與驗證只由 DEV-033 推進。

## 2026-08-21 Current Contract Replacement（最高優先）

來源：`USER-2026-08-21-UNIFIED-SAVE-FLOW`

本節以 `Intentional replacement` 取代本文所有 Current Phase 的草案投影、待處理／已規劃分區、preview／apply／discard、plan V2、600ms plan autosave、plan API／revision／receipt／journal，以及「放下不直接寫入」與窄 viewport 唯讀契約；後續章節只保留歷史設計與完成證據。

目前權威流程：

```text
樹狀圖編輯 ──────────────┐
Duty CRUD ────────────────┤
矩陣拖放／移動／複製 ─────┤→ currentState → isDirty → 500ms autosave／Ctrl+S → Organization Version
異常修復 ─────────────────┘                 ↕
                                          Undo／Redo
```

- 拖放完成並完成必要的 move／copy 選擇後，直接提交一個 organization command；異常頁選擇目標或「不再指派」亦同。
- UI 不顯示「預覽並套用」「確認套用」「捨棄規劃草案」「待套用」「已規劃」；執掌頁直接重用全系統 `DocumentMenu` 顯示相同保存狀態與手動儲存入口。
- `/duty-planning` 右側只顯示目前仍存在的異常；成功修復後該異常立即消失，反悔使用 Undo。
- `/duty-planning`、`/matrix`、`/anomalies` 共用目前 organization state 與 save path，不建立第二份 lifecycle。
- `<1024 CSS px` 不再因 viewport 被設為唯讀；是否可寫只由 current-view、current-maintenance、draft-edit 與 version status 決定。
- 既有純 projector 可作為單次 command 的 deterministic validation helper，但不得保存 pending intents 或形成第二套資料生命週期。
- 2026-08-21 UI 收斂：移除顯示設定面板、快捷鍵說明入口、版本比較選取／比較檢視與 compare workspace mode；版本工作區只保留版本切換、建立草稿、維護、重新命名、封存與還原。

後續契約：`ai-doc/specs/DEV-030-duty-anomaly-card-press-interaction.md` 已達 `RD Implementation Ready / RD Not Started`；它只以Intentional replacement取代右側異常來源的可見handle／設定CTA與native drag啟動方式，DEV-029的操作單位、validator、plan V2、transaction及既有完成證據仍維持有效。

## 1. Outcome 與執行邊界

Current Phase 成功結果：

- `/duty-planning` 成為責任配置工作台，左側顯示「職位／執行／審核／協作」四個可見欄，右側顯示待處理與已規劃異常。
- `/duty-planning/matrix` 與 `/duty-planning/anomalies` 保留為完整 URL 明細層，三個頁面共用同一 organization version 與同一份本機草案。
- 規劃者可把右側個別異常拖到左側有效責任儲存格，也可把左側單一責任關係移到另一職位；主執行固定移動，其他關係放下後選擇移動或複製。
- 拖放只建立可復原的暫存草案；最後沿用 DEV-028 的預覽、version CAS、plan CAS、receipt、原子套用與失敗恢復。
- `1024–1279 CSS px` 維持可收合 split pane，`<1024 CSS px` 仍依 workspace mode 決定是否可寫；拖曳不是唯一操作方式。

本文件所定義的 DEV-029 已完成 RD 實作與 QA／QC 驗證：產品程式、plan V2 相容讀寫、路由／工作台、拖曳與鍵盤配置、預覽／捨棄流程均已落地；未執行正式部署或 release。登入 principal、版本 ACL 與送審審核仍依 `56A` 保留於 Future Phase。

## 2. Spec Impact 與治理結果

### 2.1 與 DEV-028 的關係

- `Intentional replacement`：DEV-028 的 `/duty-planning` 兩頁籤主流程，於 DEV-029 Current Phase 改為合併工作台；原矩陣與異常規劃不是刪除，而是移到 route-based 明細層。
- `Compatible extension`：V6 `Duty`、`DutyPositionRelation`、三種 anomaly、獨立 plan store、autosave、reconcile、CAS、preview、receipt、atomic apply、journal recovery 與權限邊界全部沿用。
- `Compatible extension`：plan 從只含異常修復意圖擴充為「異常修復＋既有責任關係配置」意圖，不把未套用資料寫入 V6。
- `Implementation needs correction`：現行 `TRANSFER_PRIMARY_DUTY_EXECUTOR` 會把來源主執行降為其他執行；DEV-028 權威契約、既有 Human Decision `12A` 與 DEV-029 `HD-029-01` 均要求來源移出執行。後續 RD 必須修正實作與回歸測試，不得用文件改寫掩蓋偏差。
- `Intentional replacement`（2026-08-20）：矩陣由五個可見責任欄統整為三個可見責任欄。`主執行＋其他執行` 合併顯示為「執行」，`審核＋會簽` 合併顯示為「審核」，「協作」維持獨立；精確的五種責任 lane、relation type、primary flag、validator 與儲存資料不變。

### 2.2 ADR 判定

不新增 ADR。正式 Duty／relation 仍在 organization V6，本機 plan 仍在版本外 workspace-side store，權威位置、transaction、CAS 與 future identity 邊界未改變；本輪只擴充同一 plan 的合法意圖。ADR-006 以 DEV-029 amendment 補記此相容擴充。

### 2.3 刻意不改

- 不修改 `OrgDirectoryState`、`Duty`、`DutyPositionRelation` 或 organization document V6 schema。
- 不讓主管、部門、階層、職稱或任職人員自動成為執行、審核、協作或會簽職位。
- 不把審核／會簽關係轉為送審、approve／reject、permission grant 或外部 workflow。
- 不改 DEV-020 職掌比較排除、DEV-027 governance snapshot／policy boundary 或登入／版本 ACL 現況。
- 不加入跨裝置、每人私有 plan、lease、takeover、多人即時協作或 production provider。

## 3. Current Architecture Impact

目前相關邊界：

- `App` 以輕量 history routing 判定是否顯示完整 `/duty-planning` 頁，`useDutyPlan` 在頁面外持有 plan lifecycle，避免 surface 切換造成 autosave 競賽。
- `DutyCenter` 目前以 local tab 在 `DutyMatrixView` 與 `DutyPlanningView` 間切換；route parser 只辨識 `/duty-planning`。
- `DutyMatrixView` 讀正式 state；`DutyPlanningView` 讀正式 state 與 plan；兩者尚未形成同畫面 projected state。
- `DutyRepairIntent` 與 plan store V1 只接受 anomaly repair；pure projector、preview 與 apply 均依 `intents` 計算。
- plan API 已有 GET／PUT／DELETE／preview／apply、600ms autosave、序列 mutation queue、version＋plan CAS、10 分鐘 receipt、idempotency 與 journal roll-forward。

DEV-029 受影響的是 route／surface composition、四個可見欄的矩陣渲染、drag／keyboard action layer、plan intent union、projector、plan parser／migration、preview summary 及對應 UI／API／storage tests。正式 Duty 主資料與外部系統均不受影響。

## 4. Scope 與 Out of Scope

### 4.1 Current Phase scope

- 合併工作台與兩個 route-based 明細頁。
- 精簡為「職位／執行／審核／協作」四個可見欄；卡片以「主責／共同」及「審核／會簽」短標籤保留精確語意。
- 右側每項 Duty 一個緊湊項目，項目內分別顯示多個 anomaly 與嚴重程度。
- 右側 anomaly→左側有效責任儲存格拖放。
- 左側單一 active relation→另一 active position 的同責任欄拖放。
- 主執行固定 move；非主執行在目標旁選擇 move／copy。
- 暫存投影、逐項復原、捨棄全部、預覽與整批套用。
- 待處理／已規劃分區、正確數量與展開狀態。
- 鍵盤／選單等價操作、focus recovery、可見錯誤與 viewport 邊界。
- V1 plan 向 V2 plan 的相容讀取與延遲升級。

### 4.2 Out of scope

- 跨責任欄拖曳或以拖曳改變 relation type。
- 放下即直接寫入正式 organization version，或離頁自動套用。
- 一次拖動整個 Duty 並隱含搬移其全部 relations。
- 同一 base relation 在同一份 plan 內連鎖多次 move／copy；第一階段每筆 relation 最多一項 placement intent，須先復原才可重新配置。
- 同一拖曳進行多選、批次派發、AI 建議、負荷平衡或自動最佳化。
- 窄版／手機的觸控編輯與拖曳。
- 送審、通知、審核順序、audit record、獨立移轉紀錄、職掌比較或細粒度職掌權限。
- 登入 principal、版本 ACL、跨裝置、每人私有 plan、lease／接手、production migration、deploy 或 release。

## 5. Route 與資訊架構契約

| URL | 層級 | 主要內容 | 可編輯時的用途 |
| --- | --- | --- | --- |
| `/duty-planning` | 主層 | 左矩陣＋右異常佇列＋單一全域草案工具列 | 看全貌、拖放配置、預覽套用 |
| `/duty-planning/matrix` | 明細層 | 完整寬度矩陣、搜尋職掌／職位、部門篩選／職位聚焦、Duty 明細 | 詳查與相同 relation placement 操作 |
| `/duty-planning/anomalies` | 明細層 | 完整異常表、篩選、既有目標選擇控制 | 詳查與非拖曳修復 |

- 三個 URL 均支援 direct load、reload、browser back／forward 與可分享的 `?position=<positionId>`；不在目前版本的 position 只忽略聚焦，不得造成 Not Found 或 runtime error。
- 主層的矩陣與異常標題各提供一個明確的「查看完整…」連結；頁籤不再作為主導航。
- 明細層提供返回工作台的 link，不能以關閉 modal 的語意呈現。
- 三個 surface 必須共用同一 `useDutyPlan` lifecycle、正式 state、projected state、plan revision、保存狀態與 apply receipt；不得建立第二份 local plan 或不同 save path。
- 矩陣明細層可沿用相同 placement 操作；異常明細層因沒有矩陣 drop target，保留明確的目標選擇控制，作為同一修復命令的非拖曳入口。
- Duty title／description 與一般 relation CRUD 的既有明確表單仍是正式 organization command；drag／placement menu 一律只建立 plan。正式 command 發生後，現有 plan 必須依新 version revision reconcile。

## 6. UX Intent、版面與捲動契約

### 6.1 UX Intent

- 使用者與情境：總經理或主管在同一組織版本中配置全公司職掌。
- 主要任務：比較現況與異常、把明確的 anomaly／relation 配置到目標職位、檢查整體影響後一次套用。
- 主要工作物件：左側 relation chip 與右側個別 anomaly item；不是整個 Duty record。
- 唯一 primary CTA：「預覽並套用」。新增 Duty、查看明細、收合與逐項復原均不是頁面 primary CTA。
- 最可能誤解：把拖放當成已正式保存、把 copy 當成 move、把 relation 當成整個 Duty、把 review／countersign 當成真正送審。
- 安全預設：drop 只進 plan、無效 target 不接受、非主執行必須明選 move／copy、取消零變更、apply 維持完整 gate。

### 6.2 精簡矩陣欄位

矩陣只顯示三個責任欄，但每張卡仍保留完整 relation 語意：

| 可見欄 | Relation predicate | 卡片短標籤 |
| --- | --- | --- |
| 執行 | `relationType === 'execute'` | `isPrimaryExecutor === true` 顯示「主責」，否則顯示「共同」 |
| 審核 | `relationType === 'review' || relationType === 'countersign'` | 依原 relation type 顯示「審核」或「會簽」 |
| 協作 | `relationType === 'collaborate'` | 不重複顯示欄名 |

- 每個可見欄是獨立 drop zone；拖曳來源決定其精確責任 lane，合併欄只承接相同 lane，不得藉由放入同一可見欄把主責改為共同、把審核改為會簽或反向轉換。
- 職位列先依既有部門清單的階層／顯示順序分組；各部門內以`Position.parentPositionId`做主管在前的前序排列，直屬與更下層職位緊接其主管。同一主管下的平行職位沿用`OrgMember.order`，再以組織層級、職稱及ID做deterministic fallback；跨部門上級視為該部門的局部根節點，未設定部門排最後。這是純呈現排序，不改寫部門、上下級或member order。
- Chip 主體維持可開啟 Duty 明細；可編輯時另有可辨識 drag handle，避免點擊明細時誤啟動拖曳。
- 拖曳期間有效 cell 使用形狀／外框／短標籤與輔助科技語意，不只改顏色；無效 cell 保持不可放置並可提供簡短原因。
- Projected move 的來源顯示「將移出」，copy 的來源不變；目標顯示「待套用」。正常 relation 保持安靜。

### 6.3 右側異常佇列

- 同一 Duty 永遠只有一個緊湊項目；多個 anomaly 在項目內分別顯示，不因群組或篩選重複 Duty。
- `待處理`：至少一項 current anomaly 尚未有完整修復 intent，且未被另一完整 intent 的 projected result 安全解除。
- `已規劃`：該 Duty 的全部 current anomalies 都有完整 intent，或明確標為 `resolved-by-related-plan`，且沒有 stale／conflict。
- 一項 anomaly 完成規劃但同 Duty 尚有另一項待處理時，整個 Duty 留在待處理區；已完成項仍顯示「已規劃」。
- 已規劃區預設收合並顯示 distinct Duty count，可手動展開；apply 前仍能檢查全部內容。

### 6.4 Viewport 與 scroll owner

- `>=1280 CSS px`：左右 split pane 同時可見；左矩陣是主視覺，右側維持足以閱讀 anomaly title、badge 與狀態的固定比例。
- `1024–1279 CSS px`：仍為 split pane，右側可收合。首次使用預設展開；之後以同一瀏覽器的 presentation preference 記住最後狀態。
- preference 只保存一個 feature-scoped boolean，不含 Duty、relation、plan、version、principal 或內容資料。local storage 不可用、值損毀或被清除時 fail-safe 為展開。
- `<1024 CSS px`：不因寬度改為唯讀。主工作台採垂直順序呈現矩陣摘要／可水平捲動矩陣與異常清單；可編輯版本仍 render 對應的 drag handle、placement menu、捨棄與 apply control，唯讀版本則依 workspace mode 隱藏並阻擋寫入。
- Workbench shell 不使用 document body 作第二個垂直 scroll owner。左矩陣區擁有矩陣軸向捲動，右異常區擁有自己的垂直捲動；指標位於哪一區，滾輪作用在哪一區，並避免 scroll chaining。
- Popover 必須限制在 viewport 內，不得遮住來源與目標到無法辨識，也不得造成 layout shift 或新的 document overflow。

## 7. Drag／Placement 行為契約

### 7.1 Source／target matrix

| Source | Valid target | Drop result |
| --- | --- | --- |
| `no-executor` anomaly | active position 的執行欄 | 建立／提升唯一 primary execute repair intent |
| `missing-primary-executor` anomaly | active position 的執行欄 | 建立／提升唯一 primary execute repair intent |
| pending primary execute | active position 的執行欄 | 依原 relation 修復並維持 primary |
| pending other execute | active position 的執行欄 | 依原 relation 修復為 non-primary execute |
| pending review／countersign | active position 的審核欄 | 依原 relation type 修復，不互轉 |
| pending collaborate | active position 的協作欄 | 依原 relation type 修復 |
| active primary execute relation | 另一 active position 的執行欄 | 立即 stage move；維持 primary，不提供 copy |
| active non-primary relation | 另一 active position 的相同可見責任欄 | 依原精確 lane 開啟目標旁 move／copy chooser；確認後 stage |

共同規則：

- 不同可見責任欄、合併欄內不同精確責任 lane、同一來源 position、inactive／missing position、已存在相同 non-primary relation 的 target、stale source 或本 plan 已有 placement intent 的 source 均不是有效 target。
- Primary move 若 target 已有同 Duty 的 other execute relation，允許重用並提升 target relation；不得建立 duplicate execute relation。
- Non-primary move／copy 若 target 已有相同 Duty＋relation type，拒絕 drop，不把 move 偷換成「只移除來源」。
- Drag start 只建立暫時 UI state；drop 到空白、無效 cell、按 `Escape` 或 pointer cancel 都是零 plan 變更。
- 主執行及 anomaly 的有效 drop 可直接 stage；非主執行 drop 先進 `choosing`，選 move／copy 才 stage。Popover 取消後回復來源 focus。
- 一筆 base relation 在同一 plan 最多一個 placement intent；已 stage 的 source 顯示狀態並停止再次拖曳，必須先逐項復原才可重新配置。

### 7.2 Move／copy effects

- Primary move：來源不再保有execute relation。若target已有other execute，刪除來源relation並把target relation提升為primary；否則刪除來源relation，使用plan預先保存的`newRelationId`在target建立primary execute。最後恰有一個active primary。
- Non-primary move：保留 relation ID、duty ID、relation type與 primary=false，只把 target position改為新 position；來源 group與目標 group重新 dense normalize。
- Non-primary copy：保留來源，使用 plan 內預先產生且持久保存的 `newRelationId` 在 target建立同 duty＋type、primary=false的新 relation。
- 所有 move／copy 只在相同精確責任 lane 內發生；target group的新項目排在尾端。不得變更 Duty文字、primary flag或其他 relation。

### 7.3 Keyboard／menu alternative

- 每個可拖 relation chip與 anomaly item都有可聚焦的操作入口；使用者可選擇「移動／複製／重新分配」、以 active position selector指定 target，再建立與 drag完全相同的 plan intent。
- Primary不顯示 copy；跨欄與 duplicate target不出現在可選清單，或以 disabled＋原因呈現。
- `Escape` 關閉 chooser／menu並回復觸發元素 focus。Focus在input、select、popover或dialog時不得攔截全域快捷鍵。
- 不要求實作鍵盤模擬拖曳；等價、可驗證且共用 validator 的 action flow即符合第一階段可及性契約。

## 8. Plan V2 Logical Data Contract

DEV-028 的 `DutyRepairIntent` 保持原語意；DEV-029 以 additive union 加入 active relation placement。下列名稱與欄位是 Current Phase 的實作契約，不得在 RD 階段自行改名或改變序列化語意。

```ts
export type DutyPlanIntent = DutyRepairIntent | DutyRelationPlacementIntent

export interface DutyRelationPlacementIntent {
  planItemId: string
  kind: 'place-relation'
  dutyId: string
  sourceRelationId: string
  sourcePositionId: string
  relationType: DutyRelationType
  sourceIsPrimaryExecutor: boolean
  resolution:
    | { mode: 'move'; targetPositionId: string; newRelationId: string | null }
    | { mode: 'copy'; targetPositionId: string; newRelationId: string }
}

interface DutyBatchPlanRecordV2 {
  schemaVersion: 2
  organizationVersionId: string
  baseOrganizationRevision: string
  intents: DutyPlanIntent[]
  planRevision: string
  lastSavedAt: string
}
```

- `planItemId` 在同一 plan 唯一，client 固定以 `plan-${crypto.randomUUID()}` 產生並符合 `/^[A-Za-z0-9-]{8,128}$/`；repair intent仍以 stable anomaly ID識別，placement不得假裝成 anomaly。
- Placement source snapshot必須與 current base relation完全一致：relation存在、duty、source position、relation type與primary flag均相同；否則 stale。
- `mode=copy`只允許non-primary relation，且`newRelationId`於使用者確認copy時由client以`rel-${crypto.randomUUID()}`產生並隨plan保存。Primary move的`newRelationId`必須是字串，供target沒有既有execute relation時建立新primary；若target已有other execute則重用既有relation並忽略該ID。Non-primary move的`newRelationId`固定為`null`。Invalid／duplicate ID使該項conflict，不由server臨時重產。
- 一個 `sourceRelationId` 最多一筆 placement intent。`planItemId`、source relation與new relation ID不得跨intent碰撞。
- 空 chooser不建立intent；repair intent仍可保留resolution=null以支援既有異常明細輸入，但incomplete項會阻擋apply。
- Plan仍以organization version ID為唯一active key，不新增principal、owner、lease、full state copy或approval資料。

## 9. Projector、Reconcile 與 Invariants

### 9.1 Deterministic projection

Projector使用immutable base state與canonical intent set，不以畫面排序或操作先後決定結果。邏輯階段：

1. 驗證所有source／target snapshot、ID、unique key與互斥touch set。
2. 套用pending-reassignment repair／drop。
3. 套用active relation placement；copy先建立新relation，move再retarget／dedupe primary。
4. 套用missing-primary／no-executor repair。
5. 重新dense normalize全部受影響group，執行完整Duty validation，再衍生anomaly與summary。

若兩個intent觸及同一source relation、同一new relation ID、互斥的Duty primary slot，或一項會使另一項source snapshot失效，必須在stage／preview標為conflict，不得依canonical order偷偷選winner。

### 9.2 Invariants

- 一個Duty最多一個active primary；零個仍可保存為既有非阻擋異常。
- 同一duty＋active position＋relation type最多一筆relation。
- 新target必須active；source及target相同無效。
- Primary relation只允許move，不允許copy或降成其他執行。
- Non-primary relation type與primary flag在move／copy前後不變。
- Target order為尾端，所有受影響group的order為0-based dense sequence。
- 一筆intent invalid時整個preview可顯示，但apply為disabled；整批套用仍全部成功或全部失敗。

### 9.3 Reconcile

- Organization revision變更後，repair intent沿用DEV-028 stable anomaly規則；placement source snapshot仍相同且target仍active、無duplicate時保留。
- Source消失／失效、語意改變、target失效、target新增duplicate或primary slot漂移時，placement標為stale／conflict；不得靜默刪除、改成copy／move或換target。
- Reconcile後須成功保存新的base revision與plan revision才可重新preview／apply。
- 逐項復原只移除指定plan item並重算projected state；不執行正式Undo。捨棄全部沿用DEV-028 CAS與確認邊界。

## 10. UI State 與分組投影

每次互動的最小狀態：

```text
idle → dragging → [choosing] → staged → saving → saved
          └──────── cancel／invalid ────────→ idle
saved → previewed → applying → applied
任一保存／preview／apply → conflict／error → reload／reconcile／retry
```

- `choosing`只用於non-primary relation；popover開啟期間不得讓第二個drag修改同一source。
- `staged／saving／saved`改變的是plan，不是正式organization state；可見文字不得只寫「已儲存」而未指出是規劃草案的語境。
- 右側分組依base anomalies與完整projected result計算。Explicit complete intent或`resolved-by-related-plan`皆可使單一anomaly成為已規劃；stale、conflict或incomplete不得算已規劃。
- 若逐項復原讓Duty重新出現待處理anomaly，Duty item立即由已規劃區回到待處理區，不重複、不遺失focus。
- Plan status只在全域工具列顯示一次；個別chip／anomaly只顯示會改變判斷的短狀態。

## 11. Storage、API 與 Compatibility Impact

### 11.1 Organization data

- OrgDocument仍為V6；不新增正式欄位、不執行V6→V7 migration。
- 正式apply結果仍只修改`dutyPositionRelations`，並以完整document CAS保存。

### 11.2 Plan store migration

- Store reader必須同時接受合法的plan record schema V1與V2。V1 repair intents在memory中lossless normalize為V2 union；不得刪除或改寫使用者尚未套用選擇。
- 第一次成功save／reconcile後寫回schemaVersion 2；單純GET不得為了migration建立或覆寫檔案。
- Outer plan-store authority、one-plan-per-version、opaque revision、applied command records與journal path沿用ADR-006；外層`DutyPlanStoreV1.version`固定維持`1`，其`plans`改為`Array<DutyBatchPlanRecordV1 | DutyBatchPlanRecordV2>`。Parser保留每筆raw schema，只有API讀取目標plan時正規化成V2；save只替換目標version的plan為V2，不能順帶升級其他version的V1 plan。
- Invalid newer schema fail closed並顯示可恢復錯誤；不得當空plan覆寫。

### 11.3 API contract

既有route維持：

- `GET／PUT／DELETE /api/orgmaster/duty-plans/:versionId`
- `POST /api/orgmaster/duty-plans/:versionId/preview`
- `POST /api/orgmaster/duty-plans/:versionId/apply`

PUT與preview的`intents`擴充為V2 union；response、plan／version revision headers、receipt與apply response保持相容。Apply在server lock內重新讀取、重投影、重驗CAS與receipt，不信任client projected state。

新增／細分的domain issue至少可表達：

- `SOURCE_STALE`
- `TARGET_INVALID`
- `TARGET_DUPLICATE`
- `RELATION_TYPE_MISMATCH`
- `PLACEMENT_CONFLICT`
- `PRIMARY_CONFLICT`
- `DOMAIN_INVALID`

Domain issue使preview回傳可理解的逐項問題且不發receipt，或使apply以422拒絕；plan／version revision及receipt stale仍是409。UI不得直接把raw code或API route當主要錯誤文字。

### 11.4 Transaction and recovery

- Autosave仍為600ms debounce與同version mutation queue；I/O重試、409停止自動mutation、beforeunload與version switch flush沿用DEV-028。
- Apply仍使用shared root lock、version＋plan CAS、current receipt、idempotent command ID、prepared journal與roll-forward；不得改為逐relation PUT。
- 成功apply後刪除整份active plan，正式before→after仍是一個history commit；Undo／redo不重建plan。

## 12. Access 與安全邊界

- Write capability仍由`editingEnabled`、workspace mode、version kind／status及server mutation gate共同決定；這是current-phase intent gate，不是登入或安全ACL。
- `current-maintenance`與`draft-edit`可stage／save／preview／apply；`current-view`、`compare`、archived／inactive version唯讀。Viewport寬度只影響版面排列與收合，不再決定寫入權限。
- Read-only surface可查看formal與projected／saved plan狀態，但不render有效drag handle、placement action、discard或apply control。Viewport不是client write gate，也不是server可驗證的安全屬性；server仍以workspace mode、version status、intent validation與CAS拒絕不合法mutation，不得宣稱server能辨識呼叫端寬度。
- 不新增principal、角色、permission或審核者推導。Review／countersign仍只是文字關係。

## 13. Acceptance Contract

### 13.1 Navigation and composition

- `/duty-planning` direct load、reload與browser back顯示合併工作台；`/matrix`、`/anomalies`顯示相應明細且可返回工作台。
- 主頁不再以兩個tabs互斥顯示；桌面可同時看到左矩陣與右異常區。
- 三個surface切換不卸載、複製或重置plan；相同version看到相同intents、revision與projected result。

### 13.2 Matrix and placement

- 每列具有「執行／審核／協作」三個實際責任 cell；執行卡可辨識主責／共同，審核欄可辨識審核／會簽。
- 全部部門與單一部門篩選結果都依「部門→主管→直屬／下層」排列；職位搜尋只比對職位名稱，且與職掌搜尋獨立；inactive職位不顯示，跨部門parent不會把職位移出自己的部門群組。
- 右側每個Duty只顯示一次，多個anomaly仍可逐項辨識與拖曳。
- Drag期間只有第7節合法target可放置；invalid drop、cancel或Escape零plan變更。
- Primary move後projected source不再具有該execute relation；target成為唯一primary。若實作只把source降為other execute，驗收失敗。
- Non-primary drop在target旁顯示move／copy chooser；cancel零變更，move移除source並加入target，copy保留source並新增target。
- Cross-column、duplicate non-primary target、inactive target及同source第二個placement intent被拒絕並提供可理解原因。
- Keyboard／menu flow與drag產生相同intent及projection。

### 13.3 Anomaly grouping and plan lifecycle

- Duty仍有任一未完成／stale／conflict anomaly時留在待處理區；全部explicitly planned或related-resolved後才移到已規劃區。
- 已規劃區預設收合並顯示正確distinct Duty count；展開不重複Duty。
- Drop只改plan。Reload能恢復最後成功保存的V2 plan；V1 plan可無損載入並在下一次成功save升級。
- Preview彙總affected duties、plan items、move／copy及各relation type；只有完整、最新保存、無conflict、mode可寫且receipt current時apply可用。
- 任一intent失敗時整批零正式寫入、plan保留；成功後plan移除且正式結果可一次Undo／redo。

### 13.4 Responsive, accessibility and visible errors

- `>=1280`兩區同時可用；`1024–1279`右側可收合，首次展開、後續同瀏覽器記憶；preference失效時安全回到展開。
- `<1024`仍依workspace mode提供可編輯操作；版面改採窄版排列，不因寬度自動隱藏stage、discard或apply；無非預期document overflow、重疊、裁切或不明雙重捲動。
- Drag handle、target、chooser、group disclosure與action menu具有accessible name、focus state、Escape／focus recovery；顏色不是唯一訊號。
- 任一in-scope surface不得出現可見HTTP／API route／raw error code、Not Found、Internal Server Error或未提供恢復方式的alert。

## 14. QA／QC and Evidence Gate

### 14.1 Automated evidence required

- Route parser／builder：三個route、query preservation、direct-load與unknown position。
- 矩陣selector：五個精確責任 lane 正確投影到三個可見責任欄；職位依部門catalog及`parentPositionId`前序排序，平行職位沿用member order，且卡片標籤與active position filter正確。
- Pure placement projector：primary move、non-primary move／copy、duplicate／cross-column／inactive target、source stale、one-intent-per-source、order normalize及operation order independence。
- Mixed plan：repair＋placement同批、related anomaly resolution、conflict touch set、preview summary與atomic rejection。
- Plan store：V1→V2 lossless read／lazy write、invalid newer fail closed、plan CAS與mutation queue。
- API：V2 PUT／preview／apply、version／plan CAS、receipt、idempotent replay及journal recovery回歸。
- UI component：待處理／已規劃單一Duty分組、chooser cancel、panel preference fallback及read-only control absence。
- Full regression與production build。

### 14.2 Browser QC

固定驗證至少：`1440×900`、`1279×800`、`1024×768`、`1023×768`、`390×844`。

必跑流程：

- Direct load／reload／back及三route plan continuity。
- 右anomaly→左matrix有效與無效drag。
- 左primary move、左non-primary move／copy與chooser cancel。
- 待處理→已規劃→逐項復原回待處理。
- 中型panel首次展開、收合、reload記憶與壞preference fallback。
- Keyboard／menu等價操作、Escape與focus recovery。
- Autosave、保存失敗、plan conflict、version conflict、preview disabled及apply success／failure。
- 每個viewport visible-error sweep、scroll owner、overflow、popover clipping與資料合理性。

Evidence預定放在`output/playwright/dev-029/`；建立實際證據屬後續RD／QC，不在本輪文件交付內。

## 15. Dependencies、Stop Conditions 與 Remaining Readiness

### 15.1 Dependencies

- DEV-028 V6 Duty domain、plan lifecycle、API、CAS、receipt、journal與full-page route baseline保持可用。
- 現行plan store V1可讀且沒有無法辨識的newer schema。
- 既有workspace mode／version status gate與organization full-document save可重用。

### 15.2 Stop conditions

後續補Implementation Ready或實作時，命中任一項立即停止並回PM：

- 無法讓primary move符合「來源移出execute、target唯一primary」，或需要改變已確認`HD-029-01`。
- V1 active plan無法無損轉為V2，或migration會把invalid store當空plan覆寫。
- 必須把未套用plan放入V6、browser localStorage或第二個權威store。
- 需要登入／版本ACL、跨裝置、lease、外部workflow、production data／provider或release操作才能完成Current Phase。
- 必須允許跨責任欄、drag-only操作、窄版寫入、partial apply或last-write-wins。
- 需要新增runtime dependency、超出第16節file allowlist或改變DEV-020／DEV-027權威契約但尚未做impact review。
- Baseline test／build失敗、可見runtime error、CAS／atomicity regression或主要viewport不可操作。

### 15.3 Readiness statement

- P0／P1產品決策：none outstanding。
- 工程決策：workspace file allowlist、module／symbol mapping、parser與migration落點、slice順序、測試命令、browser evidence及rollback均已固定。
- 狀態：`RD Implementation Complete / QA-QC Passed / Human Confirmed`。S1–S5、full test、build、五viewport browser QC及file-boundary audit均已通過；若後續擴張跨欄、多選、多人或權限，須另開spec impact review。

## 16. RD Implementation File Boundary

目前workspace沒有`.git` metadata；本次以檔案allowlist作為change boundary。RD開始前須再次確認下列檔案存在，且不得把既有無關修改當成DEV-029清理。Current Phase不新增runtime dependency。

### 16.1 必要修改檔案

| 檔案 | 固定責任 |
| --- | --- |
| `src/dutyPlanning.ts` | 加入`DutyPlanIntent`／`DutyRelationPlacementIntent`、strict validators、item identity、placement projector、touch conflict、reconcile及preview summary |
| `src/dutyPlanning.test.ts` | repair＋placement混合投影、primary move、non-primary move／copy、conflict、reconcile、order independence |
| `src/useDutyPlan.ts` | 全面改用`DutyPlanIntent[]`；以`useMemo`暴露`projection`；維持單一autosave／CAS lifecycle |
| `src/dutyPlanApi.ts` | client record固定為schema V2，PUT／preview改收`DutyPlanIntent[]`，preview issue／summary型別化 |
| `src/dutyPlanningRoute.ts` | 三surface route parser／object-style URL builder |
| `src/dutyPlanningRoute.test.ts` | direct path、query、unknown nested path及三surface round trip |
| `src/organizationCommands.ts` | 修正primary transfer為來源移除；將internal batch command更名為`APPLY_DUTY_PLAN_BATCH`並接受union |
| `src/organizationCommands.duty.test.ts` | 來源移除、既有target executor提升、其他relation不變及batch union回歸 |
| `src/components/DutyCenter.tsx` | 移除local tabs；依route surface組合workbench／matrix／anomalies，統一drawer／dialog及plan toolbar |
| `src/components/DutyMatrixView.tsx` | 真正五cell、base＋projection chip model、native drag events、keyboard action與drop revalidation |
| `src/components/DutyPlanningView.tsx` | 作為完整anomalies明細；保留非拖曳repair selector，移除重複global plan controls |
| `src/App.tsx` | 解析surface、surface navigation、傳入同一`useDutyPlan`，維持route切換不重建plan |
| `src/index.css` | split pane、兩個scroll owner、五欄、drag states、popover、responsive與focus樣式 |
| `server/orgmasterDutyPlanStore.ts` | raw V1／V2 record parser、target-plan normalize、V2 save、fail-closed與CAS |
| `server/orgmasterDutyPlanStore.test.ts` | V1 lossless GET、GET零寫入、target-only lazy upgrade、newer invalid fail closed與CAS |
| `server/orgmasterDutyPlanApi.ts` | 取消`as never[]`、使用strict union；apply lock內normalize再投影，route不變 |
| `server/orgmasterDutyPlanApi.test.ts` | V2 PUT／GET／preview／apply、mixed plan、422／409、idempotent replay與plan removal |

### 16.2 允許新增檔案

| 檔案 | Export／責任 |
| --- | --- |
| `src/dutyPlacement.ts` | `DutyResponsibilityColumn`、`DutyPlacementSource`、`DutyPlacementTarget`、`evaluateDutyDrop`、`createDutyDropIntent` |
| `src/dutyPlacement.test.ts` | source／target matrix、同欄、duplicate、inactive、one-intent-per-source及ID規則 |
| `src/dutyPlanningPresentation.ts` | `buildDutyMatrixProjectionRows`、`groupDutyPlanningItems`、`getDutyPlanningViewportMode`、preview summary presentation model |
| `src/dutyPlanningPresentation.test.ts` | 五欄分流、一Duty一卡、待處理／已規劃與viewport boundary |
| `src/dutyPlanningPreferences.ts` | key `orgmaster.dutyPlanning.anomalyPanelCollapsed.v1`及safe read／write helper |
| `src/dutyPlanningPreferences.test.ts` | 首次／invalid／storage exception回傳expanded，合法boolean round trip |
| `src/vite-env.d.ts` | Vite client／CSS module型別宣告，確保現行CSS import可通過TypeScript build |
| `src/components/DutyPlanningWorkbench.tsx` | 主層split-pane composition、drag session owner與panel disclosure |
| `src/components/DutyAnomalyPanel.tsx` | 右側一Duty一卡、個別anomaly drag/action、待處理／已規劃分區 |
| `src/components/DutyMoveCopyPopover.tsx` | 拖曳後 move／copy portal chooser、viewport clamp、Escape／focus recovery；卡片級目標職位配置已由 DEV-030 移除 |
| `src/components/DutyPlanToolbar.tsx` | 唯一plan status、discard、preview dialog與confirm apply |

### 16.3 條件式測試檔

- 若V2 plan journal round-trip需要新增既有recovery覆蓋，可修改`server/orgmasterWorkspaceStore.test.ts`；不得改workspace production logic。
- 若`DutyPlanIntent[]`型別擴充觸發queue regression，可修改`src/dutyPlanMutationQueue.test.ts`；不得改600ms或per-version serialization語意。

### 16.4 禁止修改

- `src/types.ts`、organization document migration、V6 schema、DEV-020 comparison及DEV-027 governance domain。
- `package.json`、`package-lock.json`、Vite設定、任何`data/**`、production provider、deploy／release設定。
- `DutyDetailDrawer`／`DutyDialogs`的一般Duty CRUD語意、外部workflow、登入、ACL、lease或跨裝置功能。
- 若實作確實需要allowlist外檔案，先停在可編譯前的安全狀態並回PM做spec impact review。

## 17. Concrete Symbol and Algorithm Contract

### 17.1 Domain symbols

`src/dutyPlanning.ts`固定新增／修改下列public symbols：

```ts
export type DutyPlanIntent = DutyRepairIntent | DutyRelationPlacementIntent
export type DutyPlanIssueCode =
  | 'INCOMPLETE' | 'STALE' | 'SOURCE_STALE' | 'TARGET_INVALID'
  | 'TARGET_DUPLICATE' | 'RELATION_TYPE_MISMATCH' | 'PLACEMENT_CONFLICT'
  | 'PRIMARY_CONFLICT' | 'DOMAIN_INVALID' | 'COMMAND_ID_INVALID'

export interface DutyPlanIssue {
  itemId: string
  dutyId: string | null
  kind: 'repair' | 'placement' | 'domain'
  code: DutyPlanIssueCode
  message: string
}

export function isDutyRepairIntent(value: unknown): value is DutyRepairIntent
export function isDutyRelationPlacementIntent(value: unknown): value is DutyRelationPlacementIntent
export function isDutyPlanIntent(value: unknown): value is DutyPlanIntent
export function getDutyPlanIntentId(intent: DutyPlanIntent): string
export function upsertDutyPlanIntent(intents: DutyPlanIntent[], next: DutyPlanIntent): DutyPlanIntent[]
export function removeDutyPlanIntent(intents: DutyPlanIntent[], itemId: string): DutyPlanIntent[]
export function projectDutyPlan(state: OrgDirectoryState, intents: DutyPlanIntent[]): DutyPlanProjection
export function reconcileDutyPlan(state: OrgDirectoryState, intents: DutyPlanIntent[]): DutyPlanReconciliation
export function buildDutyPlanPreview(state: OrgDirectoryState, intents: DutyPlanIntent[]): DutyPlanPreview
```

- Repair的`itemId`為`anomalyId`；placement為`planItemId`；domain-level issue使用`domain`。不得再要求所有issue都有`anomalyId`。
- Validators要完整驗證nested discriminator、safe ID、required／null欄位及多餘語意組合；server不得只檢查`resolution`是object。
- Canonical key固定為`kind → dutyId → getDutyPlanIntentId()`；先建立touch set並回報全部衝突，再依第9.1節階段投影。排序只提供determinism，不可用來解決衝突。
- `reconcileDutyPlan`對已消失repair anomaly沿用既有移除＋issue；placement source／target漂移則保留intent並回issue，直到使用者逐項復原。存在issue時不自動更新base revision或覆寫server plan。

### 17.2 Placement helpers

`src/dutyPlacement.ts`固定責任欄為：

```ts
export type DutyResponsibilityColumn =
  | 'primary-execute' | 'other-execute' | 'review' | 'collaborate' | 'countersign'

export type DutyMatrixColumn = 'execute' | 'review' | 'collaborate'

export type DutyPlacementSource =
  | { kind: 'relation'; relationId: string }
  | { kind: 'anomaly'; anomalyId: string }

export interface DutyPlacementTarget {
  positionId: string
  column: DutyResponsibilityColumn
}
```

- `evaluateDutyDrop(baseState, intents, source, target)`是drag與keyboard menu的共同validator，回傳`stage`、`choose-move-copy`或帶domain code的`reject`；不得在component各寫一份規則。
- `DutyMatrixColumn` 只控制可見分組；`DutyPlacementTarget.column` 仍使用 `DutyResponsibilityColumn`。Pointer hit-test 必須以拖曳 source 還原精確 lane，再交給共同 validator，不得以可見欄名覆寫 relation 語意。
- `createDutyDropIntent(...)`只在validator成功後建立一筆repair或placement intent；由caller提供`planItemId`／`newRelationId`，pure helper不呼叫`crypto`。
- Matrix view model同時讀base與projection：base source move顯示`將移出`ghost，projected target顯示`待套用`；plan新產生的chip不是第二次可拖source。

### 17.3 Store and API mapping

- `DutyBatchPlanRecordV1`保持schema 1＋`DutyRepairIntent[]`；新增`DutyBatchPlanRecordV2`與`DutyBatchPlanRecord = V1 | V2`。`DutyPlanStoreV1`外層名稱、`version: 1`、檔名`data/orgmaster-duty-plans.v1.json`與journal路徑均不改。
- `parseStore(raw)`保留各record原schema；`normalizeDutyBatchPlanRecord(record)`回傳memory V2 copy。`getDutyPlanUnlocked`回傳normalized V2但不寫檔；`saveDutyPlan`只寫目標V2並保留其他raw record schema。
- API client的`DutyPlanRecord.schemaVersion`固定為`2`，因GET response在server boundary已normalize。PUT只接受V2 union；若收到invalid V2或newer schema回`PLAN_INPUT_INVALID／PLAN_STORE_INVALID`，不得視為空plan。
- `server/orgmasterDutyPlanApi.ts`的PUT／preview／apply移除`as never[]`；apply在root lock內取得raw store、normalize目標record、重投影並驗證hash／CAS／receipt。Hash仍使用`baseOrganizationRevision＋intents` canonical payload。
- `DutyPlanPreview.summary`至少包含`planItemCount`、`affectedDutyCount`、`relationChangeCount`、`repairCount`、`moveCount`、`copyCount`及五責任欄count；toolbar預覽先顯示summary，使用者再確認套用。

### 17.4 Route and component wiring

`src/dutyPlanningRoute.ts`固定：

```ts
export type DutyPlanningSurface = 'workbench' | 'matrix' | 'anomalies'
export interface DutyPlanningLocation {
  isDutyPlanningPage: boolean
  surface: DutyPlanningSurface | null
  focusPositionId: string | null
}
export function buildDutyPlanningUrl(input?: {
  surface?: DutyPlanningSurface
  focusPositionId?: string | null
}): string
```

- Exact path mapping為workbench→`/duty-planning`、matrix→`/duty-planning/matrix`、anomalies→`/duty-planning/anomalies`。其他nested path不是Duty頁。
- `App`只建立一個`useDutyPlan`。History route改變只換`DutyCenter.surface`，不得在三surface內各呼叫hook。
- `DutyCenter`移除`tab` state及tabs nav，新增`surface`與`onNavigateSurface(surface)`；工作台用文字link進明細，明細用link回工作台。
- `DutyPlanToolbar`由`DutyCenter`按需render；頁首compact toolbar不顯示規劃狀態與待套用數量，只保留可用的捨棄／預覽套用動作；錯誤仍以既有alert顯示。`預覽並套用`先呼叫`previewPlan()`並顯示summary／issue，只有再次確認才呼叫`apply()`。
- `DutyPlanningView`是anomalies detail；`DutyAnomalyPanel`是compact panel，兩者共用`groupDutyPlanningItems`與repair intent builder，不能各自判斷已規劃。

### 17.5 Drag, viewport and focus implementation

- Current Phase不加drag library。Relation handle與anomaly item使用native HTML Drag and Drop；typed source保存在`DutyPlanningWorkbench` React state，`dataTransfer`只放顯示文字以啟用browser drag，不把serialized payload當權威。
- `dragstart`檢查source可用；`dragover`只對current validator成功的cell呼叫`preventDefault`；`drop`以最新base state、intents與viewport重新驗證。`drop`、`dragend`、`Escape`及unmount均清除drag state。
- Non-primary有效drop只開`DutyMoveCopyPopover`，popover以`createPortal(document.body)`和`position: fixed`靠近target rect並clamp於viewport；選擇前不改plan。取消／Escape回復來源卡片 focus。卡片級目標職位設定入口不屬於現行流程，已由 DEV-030 移除。
- `getDutyPlanningViewportMode(width)`固定回`wide`（>=1280）、`medium`（1024–1279）、`narrow`（<1024）。Workbench以`matchMedia`／resize subscription同步，不可只在render讀一次`window.innerWidth`；viewport mode只描述版面，不描述權限。
- Narrow mode仍設定可用的`draggable`、write handler、placement menu、discard與apply；不可用狀態只由workspace mode、version status、intent validation與CAS決定。
- Medium panel preference只在medium讀寫；wide強制展開、narrow依直向順序顯示。Storage exception、缺值或非法值皆回`collapsed=false`。

## 18. Ordered Implementation Slices and Gates

| Slice | 實作內容 | Gate；未通過不得進下一slice |
| --- | --- | --- |
| S0 Baseline | 確認allowlist、現有tests、build與無Git metadata；不得啟動server | `npm test`通過；記錄baseline，不改產品檔 |
| S1 Domain | intent union、validators、touch set、projector、reconcile、preview summary；修正primary transfer及batch command名 | `npm test -- src/dutyPlanning.test.ts src/dutyPlacement.test.ts src/dutyPlanningPresentation.test.ts src/organizationCommands.duty.test.ts` |
| S2 Persistence | raw V1／V2 parser、target-only normalize／lazy upgrade、client types、API strict union、apply revalidation | `npm test -- server/orgmasterDutyPlanStore.test.ts server/orgmasterDutyPlanApi.test.ts server/orgmasterWorkspaceStore.test.ts src/dutyPlanMutationQueue.test.ts` |
| S3 Routing／shell | 三route、App surface wiring、DutyCenter tabs replacement、單一toolbar／preview confirm | `npm test -- src/dutyPlanningRoute.test.ts src/dutyPlanningPreferences.test.ts`及`npm run build` |
| S4 Workbench | 三個可見責任欄／五個精確lane projection、split pane、anomaly groups、drag／chooser／keyboard、responsive與focus | 全部targeted tests＋browser smoke；不可用假資料取代version state |
| S5 Regression／QC | full suite、build、五viewport、conflict／failure／recovery及visible-error sweep | 第19節全部evidence完成後才可標`RD Implementation Complete` |

每個slice只修改第16節allowlist。任一slice若發現需要改V6、API route、dependency或已確認產品語意，保留已通過slice、不製造替代規格，依第15.2節回PM。

最終驗證（2026-08-19）：`npm test -- --run`為38 files／201 tests通過；`npm run build`（含`tsc --noEmit`與Vite production build）通過。Vite仍顯示既有native config loader副檔名相容性warning及chunk size warning，均未造成failure，且未擴張runtime dependency。

## 19. Executable Verification, Evidence and Recovery

### 19.1 Automated commands

在workspace root `C:\VIBE CODING\OrgMaster` 執行：

```powershell
npm test -- src/dutyPlanning.test.ts src/dutyPlacement.test.ts src/dutyPlanningPresentation.test.ts src/organizationCommands.duty.test.ts
npm test -- server/orgmasterDutyPlanStore.test.ts server/orgmasterDutyPlanApi.test.ts server/orgmasterWorkspaceStore.test.ts src/dutyPlanMutationQueue.test.ts
npm test -- src/dutyPlanningRoute.test.ts src/dutyPlanningPreferences.test.ts
npm test
npm run build
```

Test matrix至少覆蓋：

- primary move的來源relation消失；target既有other execute時重用並提升；target空時使用plan保存ID；不可copy。
- non-primary move保留ID、copy使用新ID；duplicate／cross-column／same-position／inactive／stale／第二筆source intent拒絕。
- repair＋placement混批的canonical order結果一致；touch conflict不選winner；apply任一issue整批零寫入。
- V1 GET回V2 memory representation但file bytes不變；只保存version A時version B的V1 record仍是V1；newer／invalid fail closed。
- 三route direct load、back／forward、query round trip；三個可見責任欄及五個精確lane對應正確；同Duty一張卡；panel preference fail-safe；narrow write controls 與 workspace mode 同步。
- version CAS、plan CAS、receipt stale、idempotent replay、journal roll-forward與成功後plan removal維持DEV-028行為。

### 19.2 Browser QC and artifacts

- Evidence root固定為`output/playwright/dev-029/`，已保存`manifest.md`與五個viewport主畫面；primary move、non-primary chooser、planned grouping、conflict recovery及console／network摘要均記錄於manifest與本輪瀏覽器 session。
- Viewport固定為`1440×900`、`1279×800`、`1024×768`、`1023×768`、`390×844`；每一尺寸檢查route、overflow、scroll owner、popover、focus ring及visible error。
- Browser runtime若需`npm run dev:local`，開始前記錄project、port 5000與process tree；結束後只停止該次DEV-029 runtime並確認5000釋放。不得停止、重啟或清除受保護的`C:\VIBE CODING\ProJED\ProJED`／`127.0.0.1:4173`；清理後確認4173仍可達。
- QC fail條件：raw code／HTTP／route字串可見、drop寫入正式state、source降級而非移除、Duty重複卡、窄版可寫、popover裁切、焦點遺失、console uncaught error、API 5xx或任何CAS／atomicity regression。

### 19.3 Rollback and data recovery

- Current Phase不修改V6，已成功apply的relation結果可由既有organization history一次Undo／redo；Undo不重建plan。
- V2 plan含placement時不能無損降為V1。若RD需回退程式，先備份`data/orgmaster-duty-plans.v1.json`，不得用舊reader開啟後當空plan覆寫；恢復方式是重新使用支援V2的程式，或由使用者明確確認後捨棄該version plan。
- Parser／migration測試必須在temp directory執行；不得以workspace真實`data/`作fixture或手動改寫。
- Apply journal沿用roll-forward；任何failure後驗證organization version與plan store均為完整before或完整after，不接受partial state。

### 19.4 Completion rule

S1–S5、full test、build與browser evidence已全部通過，且產品與測試變更均落在第16節allowlist內，因此 DEV-029 狀態為`RD Implementation Complete / QA-QC Passed / Human Confirmed`。本階段未部署或 release。

## 20. Future Phase Capsule

狀態：`Future Phase Captured / Not Requested`

- 目的：允許跨責任欄轉換、多筆連鎖配置、多選／批次、AI建議或窄版觸控編輯。
- 邊界：Current Phase只處理同欄單relation placement與明確anomaly repair；future功能不得改變目前V2 migration或apply安全性。
- 依賴：跨欄須先固定relation-type conversion、primary transition與audit語意；多人／跨裝置仍須可信principal、version authorization、plan ownership與conflict model。
- 驗收方向：新增能力仍使用明確意圖、可預覽與原子套用，不得靠系統猜測責任類型或靜默覆寫。
- Re-entry trigger：使用者要求跨欄、多筆連鎖、多選、AI建議、手機編輯或多人協作時另行建立／升級契約。

## 21. Change Log

- 2026-08-20：矩陣職位排序改為部門分組＋主從前序。新增純函式`sortDutyMatrixPositions`，依部門階層／清單順序、`parentPositionId`與`OrgMember.order`排序，跨部門parent作局部根、未設定部門置底；不修改正式組織資料。完整39 files／213 tests、production build及localhost:5000全體／部門篩選真實頁面QC通過；未部署或release。
- 2026-08-20：依使用者要求將矩陣可見欄統整為「職位／執行／審核／協作」。以`DutyMatrixColumn`新增純呈現分組，保留`DutyResponsibilityColumn`五個精確lane、正式relation資料、primary flag與move／copy validator；執行卡顯示主責／共同，審核欄卡片顯示審核／會簽。完整39 files／211 tests、production build與localhost:5000主頁／矩陣明細真實頁面QC通過；未部署或release。
- 2026-08-20：依使用者要求在頁首新增「搜尋職位」；只過濾矩陣職位名稱，與「搜尋工作執掌」分離，並在1024–1279px將頁首篩選工具列堆疊以避免新增欄位造成水平溢出。未改資料、API、拖曳或套用流程。
- 2026-08-19：使用者選擇`10A`；依`1C 2A 3A 4B 5A 6B 7C 8A 9B`將DEV-029由Brief升級為`RD Contract Ready`。固定route、五欄矩陣、drag／keyboard語意、plan V2 additive union、V1相容、projector、CAS／atomic apply沿用、responsive、QA／QC與stop conditions；本輪未實作。
- 2026-08-19：使用者要求「補到 RD 可實作」；沿用同一spec升級為`RD Implementation Ready / RD Not Started`。固定workspace file allowlist、exact symbols、outer V1＋record V1／V2 parser、target-only lazy migration、現行API route、native drag＋keyboard共用validator、route／component wiring、S0–S5、可執行測試、browser evidence、runtime cleanup與V2 rollback邊界；同時校正先前文件中的API path。本輪仍未修改產品程式、runtime data、deploy或release。
- 2026-08-19：完成DEV-029 RD實作與QA／QC：plan V2 union及V1 target-only lazy migration、五欄矩陣、左右合併工作台、明細URL、native drag＋keyboard共用validator、move／copy chooser、預覽／捨棄、responsive唯讀邊界與API strict validation均已落地；`npm test -- --run` 38 files／201 tests、`npm run build`及五viewport browser evidence通過。正式部署／release與登入／ACL／送審流程仍未執行。
