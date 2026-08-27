# DEV-034 組織圖內嵌工作事項責任配置模式 — R2 RD Implementation Contract 與 R1 Historical Contract

狀態：R2 `RD Implementation Complete / Human Confirmed Direction / QA-QC Pending Browser Gate / Local Release Gate Pending`；R2.1 複選式規劃狀態視角為 `Brief Ready / Human Confirmed / Implementation Not Requested`；R1 `RD Implementation Complete / QA-QC Passed` 只保留為歷史基線
日期：2026-08-26
來源：`USER-2026-08-25-DEV034-ORG-CHART-INLINE-DUTY-CONFIGURATION`、`USER-2026-08-25-DEV034-UPGRADE-RD-CONTRACT`、`USER-2026-08-25-DEV034-UPGRADE-IMPLEMENTATION-READY`、`USER-2026-08-25-DEV034-DIRECTORY-DUTY-DRAG-REVISION`、`USER-2026-08-26-DEV034-DUTY-PLANNING-STATUS-FILTER`
父交付點：DEV-031、DEV-032、DEV-033
優先級：P1
風險等級：Medium
權威範圍：R2 的左側主資料職掌入口、責任設定、由左向右拖曳配置、正常 delivery path、R2.1 複選式規劃狀態視角 Brief 與 R1 歷史證據邊界；R1 仍保存已完成的舊實作、Duty domain 寫入、route、保存／失敗恢復及 QA／QC 證據

## 0. R2 Active RD Implementation Contract：左側主資料職掌清單與拖曳配置

### 0.1 Intentional Replacement

R2 是使用者明確確認的產品方向，取代 R1 的主要入口與互動：

- Duty／職掌不再由頁首按鈕進入特殊 duty-config picker，而是成為既有左側主資料 rail 的第五種清單。
- R2 沿用員工、職位、部門與層級的 DirectoryDock shell、現行約 `242px` panel 寬度、標題／數量、搜尋、單一列選取、收合、鍵盤焦點與按需 Inspector；「職掌」置於現有四個入口之後，不移動既有入口位置。
- 選取職掌後，在該選取列就地選擇主執行、協作、審核或會簽；協作與主執行同屬「執行」群組，選定精確責任後才呈現可用 drag source。
- 規劃者由左向右拖曳「職掌＋精確責任」到組織圖 Position。普通點擊 Position 只執行既有選取／閱讀，不新增、移除或移轉 relation。
- R2 移除頁首「工作執掌規劃」主要入口、`280～320px` 特殊 picker、底部 DutyConfigurationDock、選定後最小任務列及 click-to-toggle mutation。
- 左側職掌清單不使用文字型「明細」按鈕；職掌名稱本身是明細入口，點擊後開啟既有 Duty Inspector／Drawer。責任設定的展開／收起改由同列右側獨立 chevron 按鈕控制，兩個動作不得互相觸發；開始 drag 時可收合 Inspector，以保留有效 drop 範圍。
- 組織圖 Position 仍是唯一配置目標；不新增第二份職位清單、責任配置專用職位搜尋、部門篩選或另一張組織圖。

R1 的 source、tests、screenshots及 `output/playwright/dev034/manifest.md` 只證明被取代的特殊 picker／底部 Dock／點擊配置流程。除第 0.3 節列出的不變量外，以下 R1 UI、route 與 acceptance 不得作為 R2 實作授權或完成證據。

### 0.2 UX Intent 與主要流程

- 任務／結果：制度規劃者從固定左側主資料入口選職掌、設定精確責任，再拖到正確 Position；成功後保留目前職掌與責任，以支援連續配置。
- 主物件／主焦點：組織圖及其 Position drop targets；左側職掌清單只是來源。
- 預設刪除：重複頁首入口、特殊模式說明、獨立 picker、底部 Dock、常駐步驟文字、成功彈窗、逐列待處理 badge、空白說明及點擊 Position mutation。
- 保留舉證：固定「職掌」rail 入口與既有 panel 骨架提供肌肉記憶；目前職掌、精確責任、drag ghost與有效／無效 drop state 防止錯配。
- 非語言修復：使用一致的選取背景、pressed state、drag handle、ghost、target 輪廓、Position 就地變化與 Undo；不用常駐 helper 補救流程。

```text
一般組織圖
  → 左側 rail「職掌」
  → 使用與其他主資料相同的搜尋／清單選定職掌
  → 選取列就地設定一種精確責任
  → 由左向右拖曳「職掌＋責任」到 Position
  → 有效 drop 才提交既有 OrganizationCommand
  → Position 就地更新，沿用 Undo／autosave／version CAS
```

### 0.3 Reused Invariants

R2 不改下列已完成且可重用的 R1／DEV-028～031 不變量：

- organization V6 的 `Duty`、`DutyPositionRelation` 與四種 UI 精確責任 identity；舊 `collaborate` relation 只作讀取／載入相容值，載入後 canonicalize 為 `execute + isPrimaryExecutor=false`。
- 既有 validator、atomic primary transfer、pending same-relation-ID recovery、history、Undo／Redo、500ms autosave、Ctrl+S與 revision CAS。
- 人類負責判斷職掌適配；不以 AI 推薦、推論或自動配置職位。
- Position 卡片不顯示職掌長文字；完整內容按需閱讀。
- 手機只讀，且 capability、workspace mode、version status、permission與 domain validation仍共同約束 mutation。
- 不新增 schema、API、server、permission model、management-method 智能引用或第二套保存路徑。

### 0.4 R2 Drop Contract Direction

- Drop 到尚未具有目前 exact relation 的 active Position：新增 relation。
- Drop 到已具有相同 exact relation 的 Position：no-op，不能以 toggle 語意移除。
- 主執行 drop 到另一 Position：沿用既有 atomic transfer；錯誤可由 Undo 恢復。
- 協作、審核與會簽：可將同一職掌連續配置到多個 Position；協作在 backend 以 non-primary execute 保存。
- 切換職掌時清除精確責任 ready state；收合職掌 panel 或切換其他 Directory 時取消進行中的 drag，不提交 mutation。
- 移除 relation 只由 Inspector／明確 relation action 執行；pending-reassignment 的 R2 操作入口與 drag 細節在升級 RD Contract 時固定。

### 0.5 Current Scope、Out of Scope 與 Readiness

Current Scope：

- 將 duties 納入既有 DirectoryDock／DirectoryKind 的第一級主資料資訊架構。
- 在選取列呈現四種精確責任與 drag source，讓組織圖 Position 承擔 drop target。
- 保留正常 root 組織圖作 canonical UI entry；`?mode=duty-config` 與 `/duty-planning*` 只保留相容需求，不能作可發現性證據。
- 重用既有 domain、command、保存、Undo、CAS、permission與手機唯讀邊界。

Out of Scope：

- AI 判位、管理辦法正文智能引用、新兼任風險演算法。
- 手機／觸控窄版 mutation、第二份職位清單、新 schema／API／server／permission、正式資料 migration、deploy 或 release。
- 以 click、double-click、再次 drop 或含糊 toggle 移除 relation。

Readiness：

- R2 已完成產品程式、純語意規則、左側 DirectoryDock、App／OrgNode wiring、Inspector 顯示模式、R1 入口移除，以及後端保存邊界的協作 canonicalization；本地 `npm test -- --testTimeout=30000`（59 files／262 tests）及 `npm run build` 已通過。
- R2 的真實瀏覽器 B1～B9 尚未完成：本輪已在可連線的 in-app browser 完成左側職掌 rail、文字不進 Position 卡片、Inspector 不遮圖、keyboard grabbed／Tab／Enter／Escape 與 fresh-load console smoke；但固定 viewport 尚未覆蓋 1440／1024／854／390 全矩陣，且 in-app CUA 無法提供可驗證的原生 HTML5 `dataTransfer`，因此不得把 partial smoke 升格為 `QA-QC Passed`。完整 B1～B9 仍需在具備原生 drag 與 viewport 控制的本機瀏覽器重跑。
- ADR 目前不需要；若後續工程盤點發現主資料身份、route lifecycle或跨模組 ownership 需要難回復決策，再重新判斷。

### 0.6 R2 Acceptance Criteria

- [ ] 從一般組織圖可發現第五個左側 rail「職掌」；員工、職位、部門與層級順序不變，Toolbar 及 Position Inspector 沒有第二個配置主入口。
- [ ] 職掌沿用同一 `DirectoryDock`／`DirectoryPanel`、`52px` rail、展開總寬 `242px`、標題、數量、搜尋、選取、收合與單一 list scroll owner；不渲染特殊 picker 或底部 Dock。
- [ ] 職掌名稱按鈕開啟既有明細 Inspector／Drawer，且不展開該列；若另一列已展開，僅為維持單一編輯焦點而收起舊列。名稱旁的獨立 chevron 按鈕才負責展開／收起，並以 `aria-expanded` 表達狀態。不得渲染文字型「明細」按鈕。展開時四個 exact lane 以兩列緊湊控制呈現，執行群組內為`主執行｜協作`，未選 lane 時沒有可用 drag source。
- [ ] 桌面可從專用 handle 將「duty＋exact lane」由左向右拖到 active Position；ghost、hover target及完成狀態同時可辨識 duty 與 lane，且不只靠顏色。
- [ ] 普通 click、double-click、Position title click、員工按鈕及分支收合都不建立、移除、降級或移轉 Duty relation；普通 Position click 回到既有選取／閱讀。
- [ ] 相同 exact relation drop 是 no-op；協作 drop 到目前主執行不得隱性降級或建立第二筆 execute。所有移除只由既有明確 relation action 完成，不以職掌列點擊或拖曳取代。
- [ ] 主執行 drop 使用既有 `TRANSFER_PRIMARY_DUTY_EXECUTOR` atomic command；其他 lane 可配置多個 Position；pending-reassignment 以相同 relation ID、相同 exact lane 完成重新配置。
- [ ] 每次 release 都用 `currentStateRef.current` 重算；invalid／noop／rejected 不增加 history、不觸發 autosave、不顯示假成功，applied 只產生一個 Undo entry。
- [ ] 鍵盤由 drag handle 的 Enter／Space 明確進入 grabbed 狀態，Tab 到 Position 後 Enter／Space drop，Escape cancel並回復來源焦點；未 grabbed 時 Position keyboard 行為仍是閱讀。
- [ ] 1440×900、1024×768、854×698 不遮擋組織圖、不出現雙重捲動或固定表面；390×844 及 capability 不成立時保留閱讀但零 lane／drag／relation mutation 控制。
- [ ] R2 從同一正常入口、同一 organization state完成實際 native drag、keyboard flow、Undo／Redo、reload、409、visible error sweep及資料合理性檢查；R1 screenshot、direct URL、unit-only、API 或 state 直寫不得替代。

### 0.7 Engineering Preflight 與 ownership

現況盤點已確認下列實際邊界：

- `src/components/DirectoryDock.tsx` 的 `DirectoryKind` 現為四種，rail options、panel shell及所有清單都由同一元件擁有；R2 在此加入 `duties`，不得建立平行 sidebar。
- `src/App.tsx` 現以 `dutyConfigurationLocation.active` 隱藏 DirectoryDock／Inspector、render `DutyConfigurationDock`，並由 `handleDutyPositionClick` 與 document capture listener執行 toggle。R2 必須刪除這條 UI mutation path，但保留 root query parser及既有 command／history ownership。
- `src/dutyConfiguration.ts` 的 `resolveDutyConfigurationCommand` 是 R1 toggle resolver，只保留歷史相容；R2 使用 assign-only resolver。R2 不再接受 `other-execute`，協作映射為 non-primary execute，禁止以 drop 隱性降級或移除。
- `src/components/OrgNode.tsx` 已有 employee native-drop handlers；Duty drop 必須使用獨立 MIME／session判定，不得讓 employee drag與 Duty drag共用 payload或互相觸發。
- `src/components/DutyDetailDrawer.tsx` 已有 `organization-chart` variant及明確 relation移除；R2將其改成可嵌入右側 Inspector 的同一內容，而不是另做永久第三欄或第二份 Position selector。
- 現有 `dutyDragAutoScroll.ts`只治理 DEV-031 垂直 scroll owner；R2 的 React Flow canvas需要二維 `panBy`，不得把 workspace scroll或 DOM layout位移當成 canvas pan。

責任分配：

- `App.tsx`：route／Directory切換、drag session、React Flow hit target、command execution、history、focus及錯誤狀態的唯一 composition owner。
- `DirectoryDock.tsx`：第五個 master-data入口、搜尋／列選取、lane controls與 drag source；不執行 command。
- `OrgNode.tsx`：呈現 candidate／assigned狀態及 keyboard drop target；不解析 payload、不修改 state。
- `dutyConfiguration.ts`：latest-state assign-only semantic resolution；不執行 command、不存取 DOM。
- `dutyConfigurationDrag.ts`：payload、純 drag state及二維 auto-pan數學；不讀 organization state、不呼叫 React Flow。

### 0.8 Route、Directory 與 UI state contract

R2 繼續使用 `DutyConfigurationLocation` 作 refresh／deep-link context，但不再把它表現成特殊全頁模式：

1. 點第五個 rail「職掌」時，`App.changeActiveDirectory('duties')` 使用 `pushState` 進入 `/?mode=duty-config`，保持一般 Toolbar、DirectoryDock、組織圖及按需 Inspector composition。
2. direct／legacy deep link 解析為 active context後，`App` 將 `activeDirectory`設為`duties`；不存在的 duty／lane／position／sourceRelation仍由 `normalizeDutyConfigurationLocation`以`replaceState`清理，零 mutation。
3. 選取 duty 使用 `replaceState` 設 `duty=<id>` 並明確清除 `lane／sourceRelation`；不得預設 `primary-execute`。
4. 選 lane 使用 `replaceState`；同一 duty／lane在成功 drop後保持，支援連續配置。
5. 收合 duties、切換到其他 Directory、切換 version或離開 root page時，取消 drag、清除 lane／sourceRelation並退出 duty-config route；不得留下隱藏的 armed state。
6. `position`只作 deep-link定位；普通 Position selection由既有 `selectedId／Inspector`管理，不成為 relation command。
7. `/duty-planning`與`/duty-planning/matrix`相容至`/?mode=duty-config`；`/duty-planning/anomalies`相容至`attention=1`。它們不是 R2可發現性或主要入口證據。

`selectedDutyId／selectedLane`以 route為權威，不綁在`DirectorySelection`；責任設定的 `expandedDutyId` 是 App 內的 UI state，不作為明細開啟的副作用：

- 點擊職掌名稱只設定明細 duty route並開啟既有 Duty Inspector／Drawer；不會展開該列。若另一職掌已展開，僅收合原展開列以維持單一編輯焦點，不自動展開新列。
- 名稱旁的獨立 chevron 按鈕才切換責任設定展開／收起；收起時清除 `duty／lane／sourceRelation`，展開時才設定 route duty。兩個入口各自只有一種語意，且不互相觸發。
- 普通 Position click可把 Inspector selection換成 Position，但不清除目前 duty／lane；開始 drag時只關閉 Inspector表面以擴大drop區，不清除 route context。

### 0.9 DirectoryDock UI contract

`DirectoryKind`擴充為`employees | positions | departments | levels | duties`，`directoryOptions`只在末端新增`{ kind: 'duties', label: '職掌' }`。職掌 panel固定如下：

- header：`職掌清單`、`n 項`、在`dutyConfigurationWritable=true`時才呈現既有樣式的「新增」；手機／唯讀不得留下 disabled mutation按鈕。
- search：沿用`DirectoryPanel`的同一 search field，只比對 title與非空 description；`attention=1`只篩既有`deriveDutyAnomalies` duty IDs，不新增逐列badge。
- unselected row：左側為可點擊明細的 title button；description存在時才顯示最多一行，不顯示「尚無說明」；右側固定顯示獨立展開 chevron button。
- selected row：title明細 button、收合 chevron、lane grid及 drag handle。lane grid固定第一列`主執行｜協作`、第二列`審核｜會簽`；使用button＋`aria-pressed`，不得以 hover menu或 select隱藏精確語意。
- drag handle：只有選定 exact lane且 writable時呈現，visible label為`拖曳配置：<lane>`，accessible name含完整 duty title與lane；handle本身是唯一 native draggable，row與title不是 draggable。
- pending source：由 Inspector選定後，selected row顯示單一短行`重新配置：<原職位>／<lane>`，lane鎖定為原 relation exact lane，handle payload攜帶`sourceRelationId`；不得再開 Position select。
- error／notice：panel只保留一個短`role=alert`錯誤及一個`aria-live=polite`狀態；沒有成功 modal、常駐步驟說明、摘要卡、第二層卡片或逐列待處理訊號。

`DirectoryPanel`新增`showAdd?: boolean`，default為`true`以維持四種既有清單；duties傳入`dutyConfigurationWritable`。既有員工、職位、部門、層級 props、排序、context menu與 keyboard shortcuts不得回歸。

### 0.10 Native drag、keyboard drag 與 auto-pan

新增`src/dutyConfigurationDrag.ts`，exact exports：

- `DUTY_CONFIGURATION_DRAG_MIME = 'application/x-orgmaster-duty-configuration+json'`。
- `DutyConfigurationDragPayload`：`version: 1`、`dutyId`、`lane`、`sourceRelationId: string | null`、`newRelationId`。
- `serializeDutyConfigurationDragPayload(payload)`／`parseDutyConfigurationDragPayload(raw)`：strict allowlist，未知version、空ID、非法lane或多餘型別皆回`null`。
- `DutyConfigurationDragState`：`idle | native-dragging | keyboard-grabbed | committing`，dragging states含payload、`candidatePositionId`與`candidateKind: command | noop | invalid | null`。
- `startDutyConfigurationDrag`、`updateDutyConfigurationDragCandidate`、`beginDutyConfigurationDrop`、`cancelDutyConfigurationDrag`：純transition，非法phase回原state。
- `getDutyConfigurationAutoPanDelta(point, rect, { threshold = 48, maxStep = 14 })`：回傳bounded `{ x, y }`，中央為`0,0`，四邊與角落可同時pan。

Native path：

1. drag start用`crypto.randomUUID()`建立只屬本次gesture的`newRelationId`，設定專用MIME及`effectAllowed='copyMove'`；custom drag image或來源handle的drag image必須同時顯示 duty＋lane。
2. `canvas-wrap`的 dragOver只在 App session與MIME都合法時處理；以`event.target.closest('[data-position-id]')`取得 Position，並用 latest state resolver分類`command／noop／invalid`。
3. hover classification只改UI；不得預先寫state。React Flow邊緣以單一rAF loop呼叫`panBy`，dragend、drop、blur、Escape、Directory切換與unmount都必須停止自己建立的frame。
4. release再次以`currentStateRef.current`及同一payload resolve；只有`status=command`才可執行。drop在背景、失效node、已卸載source或MIME不符時cancel且零 mutation。

Keyboard path：

1. focus drag handle後按 Enter／Space建立`keyboard-grabbed`；動態live message說明`使用 Tab 移至職位，Enter 放置，Escape 取消`，不是常駐教學。
2. grabbed期間 active Position主article取得`tabIndex=0`及含 duty／lane的drop accessible name；焦點進入只更新candidate，不 mutation。
3. Position article上的 Enter／Space執行與native release相同的 latest-state resolver；子button事件仍依現有行為，不洩漏drop。
4. applied／noop／invalid／Escape後都結束keyboard session並把焦點回原drag handle；來源已不存在時回`[data-directory-rail-kind='duties']`。

Current Phase不實作touch drag或450ms long-press fallback；mutation capability已限定desktop hover＋fine pointer，keyboard是必要的非拖曳等價路徑。

### 0.11 Assign-only drop resolver

`src/dutyConfiguration.ts`保留R1 `resolveDutyConfigurationCommand`供歷史相容，但R2 App不得呼叫它。新增：

- `DutyConfigurationDropIntent`：`dutyId`、`positionId`、`lane`、`sourceRelationId`、`newRelationId`。
- `DutyConfigurationDropResolution`：`{ status: 'command'; command } | { status: 'noop'; code } | { status: 'invalid'; code }`。
- `resolveDutyConfigurationDropCommand(state, intent)`：pure、input immutable、只建立既有`OrganizationCommand`。
- `dutyConfigurationDropMessage(resolution)`：將 noop／invalid code轉成最短UI文字。

固定決策表：

| Intent／latest state | Resolution |
|---|---|
| 非 execute exact relation不存在 | `UPSERT_DUTY_RELATION` new ID |
| 相同非 execute exact relation已存在 | `noop: EXACT_RELATION_EXISTS` |
| `collaborate`且目標無 execute | `UPSERT_DUTY_RELATION`，保存為 non-primary `execute` |
| `collaborate`且目標已有 non-primary execute | `noop: EXACT_RELATION_EXISTS` |
| `collaborate`且目標是 primary | `noop: DUPLICATE_ASSIGNMENT`；不得降級 |
| `primary-execute`且目標已是primary | `noop: EXACT_RELATION_EXISTS` |
| `primary-execute`且目標有協作、全Duty無其他primary | `UPSERT_DUTY_RELATION`同一target relation ID升級 |
| `primary-execute`且另一Position已有primary | `TRANSFER_PRIMARY_DUTY_EXECUTOR`，目標execute存在則重用其ID，否則用payload new ID |
| 合法pending source、lane與原relation完全相同、目標無duplicate | `UPSERT_DUTY_RELATION`保留source relation ID、更新target |
| pending source不存在／非pending／duty或lane不符 | `invalid: SOURCE_RELATION_INVALID | SOURCE_LANE_MISMATCH` |
| pending目標已有相同relationType或pending primary遇到active primary | `invalid: TARGET_RELATION_CONFLICT | PRIMARY_CONFLICT`；由Inspector明確處理後重試 |
| duty不存在、Position不存在／inactive、new ID碰撞 | `invalid`；零command |

R2 drop永遠不回`REMOVE_DUTY_RELATION`，也不以drop完成primary→協作降級。要改成協作時，使用者先在明細明確移除primary，再重新拖曳；這項多一步是避免不可逆語意被隱性手勢觸發的刻意安全邊界。

### 0.12 App、OrgNode、Inspector 與入口 wiring

`src/App.tsx`：

- 移除`dutyConfigurationPickerOpen`、`handleDutyPositionClick`、document capture toggle listener、`dutyConfigurationLabelsByPositionId`文字投影、`DutyConfigurationDock` render及特殊mode隱藏Directory／Inspector composition。
- 新增`dutyConfigurationDragRef／state`、source focus ref、candidate Position、auto-pan frame及唯一`commitDutyConfigurationDrop(payload, positionId)`。
- `organizationEditingEnabled`在duties配置route active時仍為false，避免Position drag與組織mutation競爭；`dutyConfigurationWritable`獨立傳給Duty清單／Inspector。離開duties後恢復既有組織編輯。
- React Flow `onNodeClick`永遠走既有selection；Duty native drop由canvas wrapper處理，keyboard drop由OrgNode明確callback處理。
- applied只呼叫一次`commitState(result.state)`；noop顯示短notice，invalid／rejected顯示短error。autosave error／409沿用DocumentMenu／recovery狀態，不能被drop notice覆蓋。

`src/components/OrgNode.tsx`：

- 移除以`dutyConfigurationLabel`攔截普通click的邏輯；不得渲染Duty title或lane文字。
- 改收`dutyDropCandidate?: 'command' | 'noop' | 'invalid'`、`dutyAssignedToSelectedLane?: boolean`、`dutyKeyboardGrabbed?: boolean`及`onDutyKeyboardDrop(positionId)`。
- candidate與assigned只改outline／focus ring，不改card geometry；三種candidate有非顏色accessible state。employee drag handlers仍只在`employeeDragging`時運作。

`src/components/DutyDetailDrawer.tsx`：

- 新增`displayMode?: 'drawer' | 'inspector'`；`inspector`使用既有右側`inspector`骨架、scroll及dismiss/focus contract，不做fixed overlay。
- 保留名稱／說明、relation groups、明確移除、pending「在組織圖重新配置」及刪除確認；R2永遠使用`placementMode='organization-chart'`，DOM不得出現關係Position select或永久移轉select。
- read-only只呈現閱讀及導覽；手機不渲染edit／remove／pending mutation／delete。

`Toolbar.tsx`移除`onOpenDutyCenter`按鈕；duty route active不再隱藏搜尋、治理或管理辦法。`PositionDutySection.tsx`移除底部「在組織圖配置工作事項」CTA；既有relation card只可深連到同一左側duties清單及按需Duty明細，不建立第二入口或直接mutation。

### 0.13 Storage、capability 與 failure recovery

- 不新增 schema／API route／server provider／permission model 或正式 migration；後端保存邊界仍必須執行既有 V6 parser／workspace save validation。`documentStorage.ts` 在載入與 `createOrgDocumentFile` 前將舊 `collaborate` 正規化為 `execute + isPrimaryExecutor=false` 並去重，`organizationCommands.ts` 在 command 套用前再次正規化，確保前端合併責任群組後不會被舊資料格式拆回去。其餘重用 organization V6、`executeOrganizationCommand`、history、500ms autosave、Ctrl+S、pagehide、version CAS及validator。
- `dutyConfigurationWritable = route.active && canMutateDutyConfiguration(...)`；`canMutateDutyConfiguration`仍要求editingEnabled、serverReady、`!recoveryOpen`、`!mobileReadOnly`、至少1024px、hover及fine pointer。DOM query、URL或殘留handler不能繞過。
- drag開始後若capability、workspace mode、version、serverReady或recovery狀態改變，立即cancel session；release再檢查一次writable，否則零command。
- applied relation先進本機history；autosave失敗或409時保留本機state、dirty及Undo，持續顯示未保存，不得回滾假裝未配置、覆寫較新server或顯示已保存。

| Failure | Required recovery |
|---|---|
| route duty／lane／source失效 | normalize query；清除ready／drag；保留可讀組織圖；零mutation |
| source row被篩掉、Duty刪除、Directory收合／切換 | drag cancel、frame cleanup、焦點回duties rail；不得保留hidden payload |
| drop背景、inactive Position、MIME錯誤 | cancel；state signature／history／request count不變 |
| same relation／primary target收到other | noop notice；不移除、不降級、不增加Undo |
| stale release／domain rejection | error保留目前duty／lane供重試；重新project latest state |
| pending duplicate／primary conflict | error導向Duty Inspector明確relation action；保留pending source ID |
| blur／Escape／lost dragend | cancel native／keyboard session、停止auto-pan、清candidate、回復焦點 |
| autosave／409 | 保留local state與Undo，顯示未保存，沿用既有recovery／CAS流程 |

### 0.14 R2 Repo file boundary

Required new files：

- `src/dutyConfigurationDrag.ts`
- `src/dutyConfigurationDrag.test.ts`
- `src/components/DirectoryDock.test.tsx`
- `src/components/OrgNode.test.tsx`
- `src/components/DutyDetailDrawer.test.tsx`

Required modified files：

- `src/App.tsx`
- `src/components/DirectoryDock.tsx`
- `src/components/Toolbar.tsx`
- `src/components/OrgNode.tsx`
- `src/components/Inspector.tsx`
- `src/components/PositionDutySection.tsx`
- `src/components/DutyDetailDrawer.tsx`
- `src/dutyConfiguration.ts`、`src/dutyConfiguration.test.ts`
- `src/dutyConfigurationRoute.ts`、`src/dutyConfigurationRoute.test.ts`
- `src/dutyConfigurationCapability.ts`、`src/dutyConfigurationCapability.test.ts`
- `src/index.css`

Required R1 artifact removal：

- 移除`src/components/DutyConfigurationDock.tsx`及`DutyConfigurationDock.test.tsx`，並移除所有imports／render／`.duty-config-dock*`、特殊picker寬度及底部安全區CSS。
- 移除App的click-to-toggle handlers與特殊mode Toolbar／workspace branches；不得留下不可見但可觸發的mutation listener。

Preserve／forbidden：

- 保留但不作R2 active UI：DEV-031 `DutyCenter`、`DutyPlanningWorkbench`、`DutyPlanningView`、`DutyCardDragSurface`、`dutyPlacement*`及其歷史測試；相容route仍需compile及通過regression。
- 不修改`src/types.ts`、`src/organizationCommands.ts`、`src/duties.ts`、storage／workspace／version modules、`server/**`、`src/governance/**`、`src/managementMethods/**`、`package.json`、lockfile或Vite設定。
- 目前dirty tree中的`src/components/managementMethods/ManagementMethodImageNodeView.tsx`及所有非DEV-034變更屬使用者受保護內容；不得reset、checkout、覆寫或計入R2交付。`App.tsx`、`index.css`及R1 files為重疊整合點，RD必須從開工時最新內容做additive／intentional replacement，不得整檔還原。
- R1 `output/playwright/dev034/**`保留不改；R2 evidence使用全新`output/playwright/dev034-r2/**`。

若突破forbidden boundary才可完成，立即停止回PM，不得以順手refactor擴張。

### 0.15 S0→S5 implementation slices

| Slice | Scope | Gate |
|---|---|---|
| S0 Boundary／baseline | 保存`git status --short`、R1 uncommitted artifacts及受保護diff inventory；確認正常root入口與現行test/build baseline | 不改產品；第一個未知owner overlap先回PM |
| S1 Pure semantics | 新增drag payload／state／auto-pan；新增assign-only resolver及route／capability regression | targeted pure tests全通過；input state signature不變 |
| S2 Fifth Directory | 擴充DirectoryKind／panel／search／selected row／lane／handle／readonly；移除Toolbar主入口與R1 Dock artifacts | DirectoryDock／Toolbar／route tests＋build；四種既有Directory無regression |
| S3 Canvas integration | App native／keyboard session、latest-state drop、React Flow pan；OrgNode candidate／assigned；normal Position click復原 | resolver／OrgNode／employee drag／Position click targeted tests＋build |
| S4 Inspector／failure | Inspector display mode、explicit remove、pending same-ID、focus、capability change、invalid／noop／409 | complete tests＋build；negative paths state/history/request不變 |
| S5 Browser QC／handoff | 正常入口native＋keyboard、primary、pending、Undo／reload／409、四viewport、visible error／console／network／overflow sweep | 新R2 manifest完整；Spec Drift=`In sync`才可交接 |

每個slice只修改第0.14節allowlist；第一個P0／P1 semantic、scope、test、build或data-signature失敗即停止，不跨slice宣稱完成。S5前狀態最多為`RD Implementation In Progress`，不得沿用R1 passed標記。

### 0.16 QA／QC、Verification Integrity 與 FMEA

Targeted automated contract：

- `dutyConfigurationDrag.test.ts`：strict payload、四lane、非法version／ID、state transitions、double-drop guard、四邊／角落auto-pan、cancel cleanup。
- `dutyConfiguration.test.ts`：四lane create、all same-relation no-op、primary target 協作 no-downgrade、primary upgrade／atomic transfer、pending same-ID／same-lane、duplicate／primary conflict、inactive Position、ID collision及input immutability。
- `DirectoryDock.test.tsx`：第五入口順序、242px shell contract的DOM classes、搜尋、selected-only expansion、lane reset、drag handle gate、readonly零mutation、無空說明／逐列attention。
- `OrgNode.test.tsx`：normal click zero Duty callback、employee／collapse isolation、candidate classes、keyboard grabbed/drop、Duty文字不進card。
- `DutyDetailDrawer.test.tsx`：Inspector display、read／edit、explicit remove、pending、零Position select、mobile readonly mutation inventory。
- route／capability／organization command regression及完整`npm test -- --testTimeout=30000`、`npm run build`。

Verification Integrity Matrix：

| ID | Delivery path／fixture | 必要事實與證據 | Forbidden shortcut |
|---|---|---|---|
| R2-B1 | `/`→第五rail→duty→lane→native drag | entry順序、ghost、candidate、applied state、單一Undo、左欄不遮圖 | direct duty URL或state injection |
| R2-B2 | 同一payload連續配置／重複drop | 協作／審核／會簽多Position；same exact及協作→primary皆no-op，signature／history不變 | 只看DOM class |
| R2-B3 | existing primary與target有／無協作 | atomic transfer、relation identity、舊target、Undo／Redo完全一致 | 手改relation array |
| R2-B4 | 真實pending relation→Inspector→drag | source ID相同、lane鎖定、conflict可恢復、無Position select | 建新relation替代pending |
| R2-B5 | drag handle keyboard grabbed→Position | live instruction、Tab、Enter drop、Escape／focus recovery | mouse代替keyboard |
| R2-B6 | Position／員工／collapse普通操作 | zero Duty mutation；既有選取、員工drag、branch行為通過 | 只測resolver |
| R2-B7 | invalid route／inactive node／blur／capability loss | cancel、frame清理、error可見、state/history/request不變 | unit-only |
| R2-B8 | autosave／reload／雙視窗409 | V6還原；conflict保留local dirty／Undo，不假稱saved | mock applied不查storage |
| R2-B9 | 1440×900、1024×768、854×698、390×844 | 1024 editable；854／390 readonly零mutation；無overlay、雙scroll、overflow、console/network error | R1 screenshots |

Fail-seeking／FMEA：

| Failure mode | Effect | Detection／injection | Control |
|---|---|---|---|
| R1 toggle resolver殘留 | 重複drop刪除或primary被降級 | 對相同target重複native drop；搜尋active App symbol | R2 App只import assign-only resolver；forbid REMOVE output |
| Directory selection綁Inspector | 窄桌面一點Duty就關來源欄 | 854×698選Duty再檢activeDirectory | route duty selection與Inspector selection分離 |
| stale hover直接commit | drop到已刪／停用Position | hover後fixture停用Position再release | release以currentStateRef重算 |
| native／employee payload混線 | Duty drop移動員工或反之 | 交錯拖曳兩種MIME | 專用MIME＋session kind＋negative tests |
| auto-pan frame漏掉 | drop後畫布持續移動 | drop／blur／Escape後等待兩frame | 單owner cleanup＋frame ref assertion |
| hidden readonly handler | 手機／409/recovery仍寫入 | direct URL＋觸發DOM／keyboard事件並監看request | capability recheck at start and release |
| R1 evidence誤算R2 | 文件宣稱完成但正常入口不存在 | manifest檢查source path／timestamp／screenshots | 新`dev034-r2` manifest與delivery-path matrix |

R2 evidence manifest固定為`output/playwright/dev034-r2/manifest.md`，只在QC實際執行後建立，至少記錄source HEAD、dirty boundary、runtime provenance／cleanup、命令與通過數、R2-B1～B9 before／after state signature、relation IDs、history／request count、viewport、console／network／overflow、screenshots及Spec Drift。若重用既有localhost:5000，須記錄它不是本任務啟動；若任務啟動runtime，依AGENTS.md只停止自己擁有的process tree並確認port釋放。

### 0.17 Stop Conditions、governance 與 R2 readiness conclusion

Stop Conditions：需要改organization schema／API／permission／server／storage authority；需要第二份Position清單或第二個active mutation surface；無法以單一既有command完成primary transfer；pending必須換ID；drag與普通click無法分離；touch mutation成為必要；或targeted/full tests、build、normal-entry browser、mobile readonly、409／data-signature任一gate失敗。

Spec governance：

- `Intentional replacement`：R2取代R1特殊picker、底部Dock、Toolbar／Inspector主入口及click-to-toggle UI；R1 domain、route parser、command/history/storage及完成證據只作歷史與regression。
- `Compatible reuse`：DEV-028～031的Duty identity、既有 relation identity、validator、primary atomic transfer、pending snapshot、V6、Undo／autosave／CAS不變；R2 UI lane 收斂為四種，舊 `collaborate` 只作載入相容 alias。
- `No conflict`：DEV-032自由管理辦法與唯讀Duty對照、DEV-033手機唯讀最高原則不變。
- ADR：不需要；沒有schema、API、permission、persistence authority或跨domain ownership變更。命中Stop Condition才重判。

R2 readiness結論：repo modules、exact symbols、UI entry、state transitions、assign-only semantics、failure recovery、required／forbidden files、slices、QA／QC、Verification Integrity及FMEA均已固定；本輪已完成產品程式實作與 automated gate，但 browser B1～B9 尚未能在可連線的 in-app browser 執行。因此狀態為`RD Implementation Complete / QA-QC Pending Browser Gate / Local Release Gate Pending`，不得宣稱 `QA-QC Passed` 或 `Release Ready`。

### 0.18 R2 implementation execution record（2026-08-26）

- S0：保留既有 dirty tree 與 management-method chapter 變更，不做 reset／checkout；確認 R1 evidence 不作 R2 證據。
- S1：新增 `src/dutyConfigurationDrag.ts` 與測試；新增 `resolveDutyConfigurationAssignmentCommand`，R2 App 不再呼叫 R1 toggle resolver。重複 exact relation、primary→協作 與 invalid／pending lane 均採 no-op／invalid，不產生 remove／downgrade。
- S2：`DirectoryDock` 擴充第五個 `duties` rail、title／description 搜尋、selected row、兩列四 lane（執行：主執行／協作；審核：審核／會簽）、專用 drag handle；移除 R1 `DutyConfigurationDock` 及其測試、Toolbar 工作執掌入口。
- S3：`App` 接上 native／keyboard drag session、專用 MIME、latest-state release resolver、React Flow 二維 viewport pan；`OrgNode` 只呈現 drop candidate，普通 Position click 恢復既有閱讀選取，節點不顯示職掌文字。
- S4：`DutyDetailDrawer` 支援既有 Inspector 視覺模式與 explicit relation remove；保留既有 command／history／autosave／CAS／capability guard。第五 rail 可由 `/?mode=duty-config` deep link 恢復，並提供「返回」退出配置模式。
- Automated gate：`npm test -- --testTimeout=30000` → `59 test files / 262 tests passed`；`npm run build` → passed。既有 Vite extensionless import 與 bundle-size warning 屬既存 warning，未作 scope 外修正。
- Browser gate：本輪 in-app browser 已可連線並完成 partial smoke，但未建立 `output/playwright/dev034-r2/manifest.md`；原因是尚未完成四 viewport、native `dataTransfer`、reload／409、pending／capability與全量 B1～B9。下一步仍需在具備原生 drag 與 viewport 控制的本機 browser 依 B1～B9 重跑，不能以 partial smoke、R1 manifest 或 unit／build 代替。
- Browser partial smoke：左側第五 rail 的 duty 名稱與搜尋列可讀；Position card 不呈現職掌文字；Inspector 以第三 grid column 併排且不覆蓋 canvas；keyboard handle 可進入 grabbed、live status 會提示 Tab／Enter／Escape、Enter 可配置並回復來源 focus、Escape 可取消並回復來源 focus；fresh-load console 未發現本輪新增 error。CUA native drag 未判定為通過，因工具無法提供 HTML5 `dataTransfer`。

### 0.19 R2.1 Future Phase Capsule：複選式規劃狀態視角（2026-08-26）

狀態：`Brief Ready / Human Confirmed / Implementation Not Requested`。本節記錄下一個可規劃的使用者可見增量，不修改第 0.18 節的 R2 實作與 browser gate 事實；在使用者明確要求開始實作前，不得把本節勾選為完成或併入 R2 現有自動化／瀏覽器證據。

#### 0.19.1 問題、目的與 UX 邊界

- 真正問題不是再次搜尋職掌名稱，而是讓制度規劃者快速看出目前哪一類責任缺口需要處理，同時保留完整組織圖作判斷背景。
- 在 `工作執掌` 標題列加入一個與現有 header actions 同骨架的 icon-only 篩選按鈕，位置在「新增」之前；按鈕須有 `篩選工作執掌` accessible name、可見 focus、`aria-expanded` 與 popover 關聯。唯讀狀態仍可使用篩選，不因沒有 mutation capability 而隱藏。
- 點擊後開啟錨定於按鈕下方、寬度受左側 panel 約束的非 modal popover；不得建立新頁面、Drawer、永久第三欄、第二個清單 scroll owner或常駐教學。Escape、外部點擊及再次點擊按鈕皆可關閉，關閉後焦點回篩選按鈕。
- 篩選只縮小左側職掌來源清單；組織圖 Position、部門、階層與連線不得被刪除、重排或因狀態篩選而隱藏。責任 lane 仍是明確配置動作，不得讓「觀看篩選」隱性改變目前拖曳責任。

#### 0.19.2 Human-confirmed atomic filter contract

`規劃狀態`只提供三個可複選的既有 anomaly 原子條件：

- `無執行職位` → `no-executor`。
- `缺少主執行` → `missing-primary-executor`。
- `待重新分配` → `pending-reassignment`。

固定運算規則：

1. 未勾選任何狀態時不套用狀態限制，顯示全部職掌；不得解讀為零結果。
2. 同一群組勾選多項時採 OR，以 Duty ID 去重；`pending-reassignment` 同一職掌有多筆 relation 時仍只顯示一列。
3. 搜尋文字與狀態篩選採 AND；搜尋仍只比對 title 與非空 description。
4. 三項全選的結果等同「所有既有待處理職掌」，但 popover 不新增「待處理」第四個選項，也不新增第二套聚合判定。系統可在 accessible name 或按需摘要中將三項全選稱為「全部待處理」，不得再建立可選條件。
5. `no-executor` 與 `missing-primary-executor` 沿用 `deriveDutyAnomalies` 現有互斥判定；`pending-reassignment` 可與前兩類任一類並存。不得由 UI 重算另一套 anomaly 語意。
6. 現有 `/duty-planning/anomalies`／`attention=1` 相容入口進入時初始化為三項全選；Current Phase 不新增 shareable filter query。使用者在同一頁調整的部分勾選只屬 session UI state，重新載入回到無篩選，legacy `attention=1` 除外。
7. 篩選後若目前展開／armed 的 Duty 不再可見，必須取消進行中的 drag、清除 `duty／lane／sourceRelation` 與展開狀態，不得留下隱藏的 mutation context；若仍可見則維持目前選取與 lane。

#### 0.19.3 Current Scope、Out of Scope 與後續進入條件

Current Scope：篩選按鈕、三個 checkbox、清除條件、active／focus／pressed 狀態、搜尋交集、零結果與隱藏 armed state 清理；資料只讀既有 `Duty`、`DutyPositionRelation` 與 `deriveDutyAnomalies` 結果。預設不顯示每類數量、常駐 filter chip row或「全選」控制；只有真實任務觀察證明三次勾選形成可重現阻礙時，才恢復最小的群組全選動作。

Out of Scope：責任視角篩選、部門／層級／員工聚焦、Duty owner／流程／ISO／內控分類、「配置完整」判定、新 anomaly、AI 建議、後端、schema、API、permission、保存格式、organization command、relation mutation、deploy 與 release。完整 URL 工作台的責任盤點／責任分布由 `DEV-036` 的 `ai-doc/specs/DEV-036-duty-dual-perspective-workbench.md` 管理，不併入本左側快速清單；本清單未來若加入責任視角，只能改變閱讀強調，不得成為 lane mutation。部門聚焦須先有明確「涉及部門」語意，不能把未配置 Duty 錯誤歸屬或隱藏。

驗收方向：正常組織圖 → 左側 `職掌` → header 篩選按鈕 → 複選狀態 → 左側清單立即依 OR／AND 規則更新；組織圖保持完整且可操作。需覆蓋無勾選、單選、多選、三項全選、搜尋交集、零結果、目前 Duty 被排除、legacy `attention=1`、唯讀、鍵盤、外部點擊／Escape、1440×900、1024×768、854×698及390×844。不得以 direct URL、unit test或 `deriveDutyAnomalies` 輸出取代正常入口與 popover 實際互動證據。

Re-entry trigger：使用者要求開始實作或補至 `RD Contract Ready`／`RD Implementation Ready` 時，先以當時最新 `DirectoryDock.tsx`、`App.tsx`、route tests與 CSS 盤點固定 state owner、popover pattern、required files、targeted tests及 browser evidence；若仍不改 schema／API／permission／persistence authority，ADR 不需要。

## R1 Historical Contract（已被 R2 主要入口與互動取代）

## 1. Outcome 與執行邊界

Current Phase 把工作事項責任配置移入既有組織架構頁。制度規劃者選定一項既有工作事項與精確責任類型後，直接點選組織圖中的 Position 加入、移除或移轉責任；組織圖維持唯一主焦點，不建立另一個責任配置頁、永久第三欄或第二份全職位清單。

責任適配仍由人類判斷。系統只保存人類明確選擇，不用 AI 推薦、推論或自動套用職位，也不從管理辦法正文建立 Work Item 智能引用。

本文件是 R1 歷史基線；R1 當時的 RD 實作與本機 QA／QC、S1～S5 及 B1～B9 證據只適用於被 R2 取代的流程，不得回算為 R2 證據。不得擴張 schema、API、server、permission、management-method domain、deploy 或 release；本地完成不等於 production release，DEV-031 的正式退場仍須另行 cutover 決策。

## 2. 現行架構盤點

### 2.1 組織圖工作面

- `src/App.tsx` 的 root composition 是既有組織架構頁，使用 React Flow 顯示 Position、組織線、部門框、Inspector、Directory Dock 與 Toolbar。
- `src/components/OrgNode.tsx` 的職位標題是可鍵盤聚焦的 button；Position 卡片同時含員工與分支收合等子控制，子控制已有事件隔離。
- 現有 DEV-032 歷史原型已在 root query 中實作 session-only responsibility mode、最小責任列、Position 點選、文字責任標記、Escape 完成及暫停組織 mutation。該原型可作互動證據，但其 Method Step／Prototype Work Item／in-memory assignment 不得成為正式 domain 或 persistence。

### 2.2 Duty 權威資料與 command

- `OrgDirectoryState.duties` 與 `OrgDirectoryState.dutyPositionRelations` 已是 organization document V6 的正式權威，跟隨 organization workspace version 保存。
- `DutyPositionRelation` 使用 `relationType: execute | review | collaborate | countersign`；主執行以 `relationType=execute + isPrimaryExecutor=true` 表示，因此 UI 的五種精確責任不需要新 schema。
- `executeOrganizationCommand` 已提供 `CREATE_DUTY`、`PATCH_DUTY`、`DELETE_DUTY`、`UPSERT_DUTY_RELATION`、`REMOVE_DUTY_RELATION`、`TRANSFER_PRIMARY_DUTY_EXECUTOR` 與 validator。
- domain 已阻擋失效 Position、重複 relation、第二個主執行及不合法 primary；刪除 Position 會把既有 relation 凍結為 pending-reassignment snapshot。
- 所有成功 command 進入同一 organization history，沿用 Undo／Redo、500ms autosave、Ctrl+S、workspace version revision CAS 與 V6 文件驗證。

### 2.3 現行責任工作台與 route

- `/duty-planning`、`/duty-planning/matrix`、`/duty-planning/anomalies` 現在都由 `DutyCenter`／`DutyPlanningWorkbench` 提供第二個完整工作面；anomalies surface 也承擔 no-executor、missing-primary 及 pending-reassignment 修復。
- Toolbar 與 Position Inspector 目前都導向 `/duty-planning*`；`?position=<id>` 可攜帶來源 Position。
- `DutyDetailDrawer` 已提供工作事項名稱／說明編輯、relation 摘要、移除、主執行移轉與刪除確認；其中職位下拉選單會形成第二份全職位清單，DEV-034 配置模式不得沿用該部分。

## 3. Human-confirmed Product Contract

- 不新增責任配置頁；在既有組織架構頁增加暫時的「工作事項配置模式」。
- 工作事項資料與責任關係維持兩層，但規劃者在同一表面完成選擇。
- 選定工作事項後，工作事項清單收合成最小任務列；組織圖仍是唯一主焦點。
- 人類先選責任語意，再直接點 Position；同一 Position 可承擔同一工作事項的多種不同責任。
- 既有 Inspector／drawer 只按需閱讀或編輯完整工作事項，不常駐佔據圖面。
- Current Phase 不新增責任配置專用職位搜尋、部門篩選、永久職位 rail、第二份職位清單或另一張組織圖。
- Current Phase 不新增工作事項層級的職責重疊演算法；只沿用既有「兼任風險設定」、Duty validator 與 anomaly 規則。
- 手機只讀；桌面／筆電 mutation 仍須同時符合裝置能力、workspace mode、version status 與既有治理條件。

## 4. UX 與互動契約

### 4.1 模式狀態

模式只有三個可觀察狀態：

1. `inactive`：一般組織架構頁；Position 點擊依既有行為開啟明細。
2. `select-duty`：進入配置模式但尚未選定工作事項；顯示單一工作事項選擇表面。
3. `configure-duty`：已有 `dutyId + exactLane`；選擇表面收合為最小任務列，Position 成為關係配置目標。

模式狀態是 route／UI context，不寫入 organization document。重新整理可由 URL 恢復合法 context；不存在或失效的 duty／lane／position 必須降級為安全狀態，不得猜測或寫入。

### 4.2 工作事項選擇表面

- 由 Toolbar 的既有「工作執掌規劃」入口及 Position Inspector 的既有工作職掌入口進入；不再導向第二個主要頁面。建立新工作事項成功後，直接選定該項並以 `primary-execute` 作初始 lane；建立失敗保留對話框與輸入。
- 平板寬度以上的初始表面使用左側 `280～320px` 推移式選擇器，組織圖 workspace 從面板右緣開始並使用剩餘畫布，不得以底部浮層或 overlay 覆蓋 Position。`720px` 以下因無法同時提供可讀組織圖，選擇器改為同 route 的全寬暫時表面；選定後仍返回同一組織圖，且依手機唯讀 boundary 不呈現 mutation。
- 初始表面只包含工作事項搜尋、既有工作事項清單與具備寫入能力時的「新增工作事項」。具有現行 `deriveDutyAnomalies` 結果的 Duty 集中在單一「待處理（n）」群組，其他 Duty 放入「其他」；不得在每列重複「待處理」、顏色、badge 或異常摘要。
- 每列只固定顯示工作事項名稱；說明存在時才顯示一行摘要，空值不得產生「尚無說明」占位。清單採扁平分隔列，不以大卡片撐高選擇器。
- 搜尋只比對工作事項名稱與說明；不建立職位搜尋或部門篩選。
- 由舊 anomalies route 進入時，只以同一清單的 attention view 顯示具有現行 Duty anomaly 的工作事項；它不是新的 dashboard、頁籤或另一套規則。
- 選定工作事項後立即收合；不保留空工具列、統計卡、常駐教學或異常 dashboard。
- 最小任務列以一個 icon-only 返回控制（accessible name 為「更換工作事項」）回到清單；唯讀與可寫狀態都保留此 route-context 操作，因為更換閱讀中的 Duty 不是 mutation。工作事項名稱是另一個獨立 button，按需開啟工作事項 drawer。drawer 可編輯名稱／說明、閱讀所有 relation、移除 relation、選定一筆 pending-reassignment 進入「重新配置」及執行既有刪除確認，但不得顯示「選擇職位」下拉選單或另一套新增／移轉關係表單。

### 4.3 最小任務列

`configure-duty` 可寫狀態常態只保留：

- icon-only「更換工作事項」與可開啟 drawer 的工作事項名稱。
- 三個可見群組：執行、協作、審核。
- 執行群組的按需次選項：主執行、其他執行。
- 審核群組的按需次選項：審核、會簽。
- 一個主要「完成」動作。

唯讀狀態只保留「更換工作事項」、工作事項名稱、按需 Drawer 的責任內容與「返回組織圖」；組織圖 Position 卡片不渲染職掌文字，不顯示 lane selector、pending 重配、建立／修改／刪除或「完成配置」。窄版唯讀任務列維持單列緊湊高度，不得沿用可寫版三列安全區造成大面積空白。

若從 drawer 選定 pending-reassignment，任務列另外保留一個最小來源文字，例如「重新配置：原生產主管／主執行」；完成重新配置、移除該 relation、切換工作事項或退出模式後即清除，不形成永久欄位。

不增加「取消並回復全部」動作。每次 Position 點選都立即進入 organization history，並由既有 Undo／Redo 回復；「完成」與 Escape 只退出配置模式，不撤回已完成的關係變更。UI 不得使用「取消」造成交易式 rollback 的錯誤期待。

### 4.4 五種精確責任映射

| 可見群組 | 精確責任 | Domain mapping |
|---|---|---|
| 執行 | 主執行 | `relationType=execute`, `isPrimaryExecutor=true` |
| 執行 | 其他執行 | `relationType=execute`, `isPrimaryExecutor=false` |
| 協作 | 協作 | `relationType=collaborate`, `isPrimaryExecutor=false` |
| 審核 | 審核 | `relationType=review`, `isPrimaryExecutor=false` |
| 審核 | 會簽 | `relationType=countersign`, `isPrimaryExecutor=false` |

三個可見群組只降低第一層認知負荷；domain、validator、排序與保存始終使用五種精確責任，不合併資料語意。

### 4.5 Position 點選語意

- 配置模式下，Position 卡片主表面與職位標題 button 都代表「切換目前工作事項的目前精確責任」。
- 員工、分支收合及其他子控制不觸發責任配置；其既有 click／keyboard 行為不得洩漏成 relation mutation。
- 若 Position 尚無目前 exact lane，建立 relation；若已有，移除 relation。
- 設定主執行時，若另一 Position 已是主執行，直接使用既有 atomic transfer command 移轉，不額外開 confirmation dialog；既有 Undo 提供立即恢復。
- 若目標 Position 已有其他執行，設定主執行會把同一 execute relation 升為主執行並移轉舊主執行；不得建立重複 execute relation。
- 將目前主執行切換為其他執行時，更新同一 relation 的 `isPrimaryExecutor=false`；允許暫時沒有主執行，並沿用既有 missing-primary anomaly。
- 點擊目前主執行可移除該 relation；允許暫時沒有執行職位，並沿用既有 no-executor anomaly。
- 審核與會簽是兩種不同 relation，可同時存在；同一 duty／position／relationType 不得重複。
- drawer 選定 pending-reassignment 後，下一次 Position 點選以相同 relation ID 更新 target，不建立新 relation；exact lane 預設並固定沿用原 relation，唯一允許的重配語意變更是 pending primary 可先切換為其他執行並同時把 `isPrimaryExecutor` 降為 false。其他跨 relationType 轉換須先按原 lane 重配，再以一般 lane 操作調整；若 pending primary 仍選主執行而目前已有 active primary，沿用 validator 拒絕，使用者須先移除／降級目前 primary 或改選其他執行。

### 4.6 Position 狀態與按需細節

- Position 卡片不渲染工作事項／職掌文字，避免長文字撐開組織圖格子；已配置狀態只以節點輪廓／selected state 表達，完整 exact relations 由 Dock 或按需 Drawer 閱讀。
- 目前 exact lane 的 assigned 狀態以單一輪廓／pressed state 表達，並以文字或 accessible name 提供非顏色辨識；不得疊加重複 badge、背景、icon 與說明。
- 配置成功由 Position 就地狀態改變及 Undo 可用性表達，不顯示成功 modal 或常駐成功訊息。
- 工作事項完整內容由任務列按需開啟 drawer；Position node 在配置模式內不另開 Position Inspector，避免「配置」與「閱讀明細」共用同一主點擊語意。

### 4.7 模式隔離與焦點

- 進入配置模式時關閉已開啟的 Directory detail、Position Inspector、context menu 及組織 mutation dialog；Directory Dock 在模式期間不渲染，避免形成第二份 Position 導覽／選位表面，退出後恢復。
- 配置模式期間暫停 Position drag、add／edit／delete Position、Department／Employee mutation、organization level mutation及會競爭相同 pointer／keyboard gesture 的控制。
- Toolbar 在配置模式只保留版本／文件狀態；隱藏職位搜尋、兼任風險、治理、重複的工作事項入口與管理辦法入口。`/` 快捷鍵不再聚焦已隱藏的職位搜尋。
- pan、zoom、MiniMap、分支展開／收合及純閱讀導覽仍可用。
- 完成／Escape 後回到一般組織模式，焦點回到原 Toolbar／Inspector 入口；若入口不存在，回到 canvas fallback。
- 切換 organization workspace version 前沿用既有 dirty-save gate，切換完成後退出配置模式；不得把舊 version 的 duty context 套到新 version。

## 5. Route 與返回契約

### 5.1 Canonical route

組織圖配置模式使用 root page 的 query state，不建立新 page route：

```text
/?mode=duty-config
/?mode=duty-config&attention=1
/?mode=duty-config&duty=<dutyId>&lane=<exactLane>
/?mode=duty-config&duty=<dutyId>&lane=<exactLane>&position=<positionId>
/?mode=duty-config&duty=<dutyId>&lane=<exactLane>&sourceRelation=<pendingRelationId>
```

`exactLane` 只接受：`primary-execute | other-execute | collaborate | review | countersign`。

- Toolbar／Inspector 正常進入使用 `history.pushState`，因此瀏覽器返回可退出配置模式。
- 工作事項與 lane 切換使用 `replaceState`，不把每次選擇塞入瀏覽器歷史。
- 「完成」使用 `replaceState` 返回 `/`；它不觸發資料 rollback。
- `position` 只作初始定位與視覺聚焦，不代表自動建立 relation。
- `attention=1` 只套用既有 `deriveDutyAnomalies` 作工作事項清單篩選；不得產生新 anomaly 定義。
- `sourceRelation` 只接受屬於目前 duty 且 target 為 pending-reassignment 的 relation；它只表示下一次 Position 點選要更新哪一筆既有 relation。
- URL 缺少 duty 或 lane 時進入 `select-duty`；無效或不存在的 duty／lane／position／sourceRelation 以 `replaceState` 清理為最接近的安全狀態，且不觸發 command。

### 5.2 `/duty-planning*` 相容入口

DEV-034 local implementation 完成後（正式部署仍受 release gate）：

| 舊入口 | 相容結果 |
|---|---|
| `/duty-planning` | `replaceState` 至 `/?mode=duty-config` |
| `/duty-planning/matrix` | `replaceState` 至 `/?mode=duty-config` |
| `/duty-planning/anomalies` | `replaceState` 至 `/?mode=duty-config&attention=1` |
| 任一舊入口 `?position=<id>` | 保留為 canonical route 的 `position`，只定位、不自動配置 |

不得維持第二個 active responsibility mutation surface。bare `/matrix` 與 `/anomalies` 從未是現行 route，Current Phase 不新增這兩個別名。舊 routes 的 browser test、歷史 screenshot 與 DEV-031 完成證據繼續保留；本輪保留但不再由 `App` render DEV-031 full-page components，以降低一次性刪除風險。

## 6. Domain、Command、Storage 與 Permission Contract

### 6.1 資料與 migration

- 重用 organization document V6 的 `Duty`、`DutyPositionRelation`；Current Phase 不升版、不建立 migration、不複製 master data。
- 配置模式、選定 duty、exact lane、搜尋字串與 focus position 都是 UI／route context，不持久化進 V6。
- DEV-032 management-method store、snapshot、media 與 permissions 完全不受影響。

### 6.2 Command adapter

Position click 必須根據最新的 `currentState` 建立一個既有 OrganizationCommand，並透過 `executeOrganizationCommand` 執行；不得直接修改 relation array，也不得建立第二條保存路徑。

| 使用者意圖 | Command boundary |
|---|---|
| 新增一般 exact lane | `UPSERT_DUTY_RELATION` |
| 移除已存在 exact lane | `REMOVE_DUTY_RELATION` |
| 無其他 primary 時新增／升級 primary | `UPSERT_DUTY_RELATION`，必要時重用既有 execute relation ID |
| 已有其他 primary 時改派 | `TRANSFER_PRIMARY_DUTY_EXECUTOR` |
| primary 降為 other-execute | `UPSERT_DUTY_RELATION` 更新同一 relation |
| pending-reassignment 指向新 Position | `UPSERT_DUTY_RELATION` 更新相同 relation ID、target 與必要 primary flag |
| 新增／修改／刪除工作事項 | 既有 `CREATE_DUTY`／`PATCH_DUTY`／`DELETE_DUTY` 與既有刪除確認 |

- 新 relation ID 必須由 client 產生穩定且不碰撞的 ID；command 仍負責 duplicate 與 domain validation。
- command 回傳 `noop` 時只維持原畫面，不假稱新增或移除成功。
- rejection 的 UI target 必須可定位至配置 dock／Position，不得誤導到 parent 或 department error surface。

### 6.3 History、保存與 CAS

- 每個成功配置 click 是一個 organization history entry；主執行移轉必須保持單一 atomic entry。
- 沿用現有最多 80 筆 history、Undo／Redo、500ms autosave、Ctrl+S、pagehide flush 與 workspace version CAS。
- 「完成」不是保存命令；正常 autosave／Ctrl+S 的狀態仍由既有 DocumentMenu 或靠近 dock 的最小失敗訊號表達，不建立第二個保存按鈕。
- revision `409` 時保留本機 current state、history、選定 duty 與 lane；標示尚未保存並停止任何假成功宣告。不得自動覆蓋較新 server state或清空使用者變更。

### 6.4 Capability 與 permission

- Current Phase 不新增 Duty 專用 permission；寫入仍以既有 `draft-edit | current-maintenance` 為必要條件，server workspace save 持續驗證 mode、revision 與完整 V6 文件。
- 若 DEV-033 已提供共用 deterministic capability，DEV-034 必須重用；若尚未完成，DEV-034 採不寬於 DEV-032 的 scoped default-deny gate：至少 1024px、hover 與 fine pointer 同時成立才呈現 mutation。
- 裝置能力只是 UX boundary，不是 security credential；唯讀裝置、唯讀 workspace、無效 version 或 recovery gate 均不得從 query、快捷鍵、node click、drawer 或殘留 handler 觸發 command。
- DEV-032 的 management-method permissions 不得被解讀為 Duty mutation 權限。

## 7. Read-only 與手機契約

- 手機與不具 mutation capability 的裝置仍可進入相同 canonical route，選擇一項工作事項並閱讀 Position 上的責任標記。
- 唯讀狀態不呈現 relation selector、新增／修改／刪除、完成配置或其他 mutation controls；node click 不得建立 dirty state、history、autosave 或 API mutation。
- 唯讀 deep link 含合法 duty／lane 時只作責任檢視；無效 context 安全降級為工作事項選擇或一般組織圖。
- 不以整頁錯誤阻擋閱讀，也不把桌面多欄等比例壓縮到手機；不得有固定 dock 遮擋內容或水平 overflow。

## 8. Failure Recovery Contract

| 失敗情境 | 必要行為 |
|---|---|
| duty／lane／position／sourceRelation route 無效 | 清理無效 query、回到安全狀態、零 mutation |
| duty 在模式中被刪除或切換 version 後不存在 | 退出 `configure-duty` 回到選擇狀態，保留可閱讀組織圖 |
| Position 失效或 command 判定 target invalid | 不改 state；就地顯示最短錯誤並保留 duty／lane |
| duplicate／primary conflict／domain rejection | 不改 state；重新由最新 state 投影 node 標記，不自行繞過 validator |
| autosave／Ctrl+S revision `409` | 保留本機變更與 Undo，顯示未保存；不得覆寫 server 或標示已保存 |
| 進入 recovery gate | 停止配置、保存、Undo／Redo 及退出捷徑的 mutation 副作用，沿用現有 recovery 行為 |
| Escape／完成 | 只退出模式並恢復焦點，不 rollback 已成功的 history entries |

## 9. Current Phase Scope

- root 組織架構頁的 duty configuration route context 與 mode composition。
- 工作事項選擇表面、最小任務列、三群組／五 exact lane 控制。
- Position node toggle、assigned 輪廓、keyboard／accessible state。
- 工作事項 drawer 的內容編輯、relation 摘要／移除及既有刪除確認；移除第二份 Position selector。
- 既有 no-executor／missing-primary 的單一文字狀態、attention view，以及 pending-reassignment 的 drawer 選定與 Position 重新配置。
- 既有 Duty commands、validator、history、autosave、CAS 與 workspace mode 的單一路徑整合。
- Toolbar／Inspector entry、`/duty-planning*` compatibility、browser back／refresh／focus recovery。
- 桌面 mutation、唯讀／手機閱讀、targeted QA／QC 與 DEV-031 regression gate。

## 10. Out of Scope

- 管理辦法正文的 Stage／Step／Work Item 智能引用或從管理辦法直接寫入 Duty。
- AI 自動推薦、判定或套用責任職位。
- 新的職責重疊風險演算法、替代控制或額外警示；只保留現行兼任風險與 Duty anomaly。
- 責任配置專用的職位搜尋、部門篩選、永久職位 rail、第二張組織圖或批次選位。
- 手機／窄版 mutation、觸控拖放或離線稍後同步。
- 新 Duty schema、organization document V7、獨立 Duty store、跨 domain reference、migration 或新 permission catalog。
- 管理辦法核准／發布／ISO／內控符合性結論、執行證據鏈、production deploy 或 release。

## 11. Acceptance Criteria

### 11.1 主要流程

- [ ] Toolbar 與 Position Inspector 均在既有組織架構頁進入配置模式，不呈現第二個完整責任頁。
- [x] 尚未選定工作事項時，只顯示最小選擇表面；選定後收合為任務列，組織圖仍是首屏唯一主焦點。
- [x] 同一表面可選擇執行／協作／審核三群組及五種 exact lane，domain mapping 與 table 完全一致。
- [x] 點擊／鍵盤啟用 Position 可新增或移除目前 exact lane；員工、分支收合及其他子控制不洩漏 mutation。
- [x] Position 卡片不顯示職掌文字，避免格子被長文撐開；assigned／focus 以輪廓與 Dock／Drawer 內容理解，不只靠顏色。
- [x] 主執行新增、升級、降級、移轉與移除遵守單一 primary validator，且每次操作只有一個 Undo entry。
- [x] no-executor、missing-primary 與 pending-reassignment 仍可在同一模式辨識及修復；pending relation 重新配置保留原 relation ID，不建立第二份 Position selector。
- [x] 完成與 Escape 只退出模式；Undo／Redo 在退出前後都可回復已成功配置。

### 11.2 單一路徑與相容性

- [x] mutation 全部經既有 OrganizationCommand 與 organization history；不存在直接 relation array write、第二 autosave 或第二 persistence。
- [x] `/duty-planning`、`/duty-planning/matrix`、`/duty-planning/anomalies` 與 `?position=` 均導入 canonical root mode，沒有第二個 active responsibility mutation surface或 browser back loop。
- [x] organization V6、現有 Duty／relation identity、pending-reassignment、validator、workspace version 及歷史 evidence 不需 migration 且無資料漂移。
- [x] DEV-032 management-method list、document、Duty read-only drawer、store、snapshot、media 與 permissions 不受影響。

### 11.3 失敗、唯讀與可存取性

- [x] invalid／stale route、inactive Position、duplicate、primary conflict、domain rejection 與 `409` 均符合第 8 節，沒有假成功或資料遺失。
- [x] 配置模式期間所有衝突的 organization mutation 都不可達；pan／zoom／分支閱讀仍可用，退出後原能力恢復。
- [x] 唯讀 workspace、手機及不符合 capability 的 deep link 可閱讀責任結果，但無 relation selector、dirty state、history、autosave 或 mutation request。
- [x] 1440×900、1024×768、854×698 及 390×844 沒有遮擋、雙重捲動或水平 overflow；選擇階段由左側推移面板保留組織圖畫布，選定後由 workspace 預留最小任務列安全區，手機選擇階段使用全寬表面。
- [x] 焦點順序、accessible name、pressed／assigned state、Escape、screen reader live feedback 與 reduced motion 可完成或理解主要流程。
- [x] 正常畫面沒有常駐操作教學、重複狀態訊號、成功 modal、框中框或無獨立權利的容器。

## 12. QA／QC 與 Evidence Required

風險 lane：Medium。實作後須完成 targeted QA 與真實 browser QC；概念原型及 DEV-031 證據可重用為比較基線，但不得代替正式 Duty persistence 驗證。

### 12.1 Targeted tests

- route parser／builder：canonical query、`attention`、`sourceRelation`、invalid context、`position` focus、三個 legacy aliases、browser history 不循環。
- exact lane adapter：五種 mapping、create／remove、primary create／upgrade／downgrade／transfer、duplicate no-op／reject。
- organization command regression：Duty CRUD、pending-reassignment 同 ID 重配、pending primary conflict／降級、dense order、single primary、Undo entry 與 rejection state unchanged。
- capability：editable desktop、readonly workspace、scoped device gate、deep link、快捷鍵及 node child controls negative paths。
- component flow：工作事項選擇→收合任務列→Position 配置→drawer→完成／Escape→焦點恢復。
- persistence：500ms autosave、Ctrl+S、reload restore、pagehide、revision `409` 保留本機變更與未保存狀態。

### 12.2 Aggregate gates

- `npm test -- --testTimeout=30000`
- `npm run build`
- Chromium 1440×900 與 1024×768：完整可編輯流程、主執行移轉、其他 relation、多責任文字標記、Undo／Redo、legacy alias、console sweep。
- Chromium 390×844：完整閱讀、合法／無效 deep link、零 mutation control、零 editable field、零 dirty／request、無 overflow。
- DEV-031 regression evidence：舊資料可載入、Duty／relation count 與 identity 不變；legacy route 相容而非 404。
- 證據輸出於 `output/playwright/dev034/manifest.md`；未到實作／QC 階段前不得建立空 manifest 或宣稱通過。

## 13. Stop Conditions

遇到下列任一情況停止實作並回 PM：

- 必須建立 organization V7、Duty migration、獨立 store、跨 domain reference 或新 permission 才能完成 Current Phase。
- 無法用單一既有 OrganizationCommand atomic 完成主執行移轉，或需要直接修改 relation array。
- 必須保留兩個 active responsibility mutation surfaces 才能滿足功能。
- 無法在同一配置模式辨識／修復 no-executor、missing-primary 或 pending-reassignment，或必須恢復第二份 Position selector 才能修復。
- legacy route 轉換會遺失現有資料、Duty／relation identity、Position focus 或造成 browser back loop。
- DEV-033 裝置能力與 DEV-034 scoped gate 互斥，導致手機或不合格裝置可 mutation。
- 需要恢復管理辦法智能引用、AI 判斷職掌、額外風險規則、職位搜尋／篩選或 production 操作。
- `npm test -- --testTimeout=30000`、build、targeted persistence、legacy route、desktop flow、mobile read-only 或 console gate 任一未通過。

## 14. Cross-Spec、ADR 與 Deferred Scope

- `Intentional replacement (local)`：本 DEV 已取代 DEV-031 的責任配置主要資訊架構；DEV-031 route、domain、command、保存、測試與證據保留為相容及 regression baseline。
- `Compatible extension`：重用 DEV-028／029／031 的 Duty identity、五 exact lanes、validator、organization V6、Undo／Redo、autosave 與 CAS。
- `No conflict`：DEV-032 維持自由管理辦法、無智能引用與 Duty 唯讀對照；DEV-034 不修改其 domain、API、permissions 或完成證據。
- `No conflict`：遵守 DEV-033 手機唯讀最高原則；若共用 capability 尚未實作，使用更保守 scoped gate。
- ADR 判定：目前不建立 ADR。Current Phase 不改 schema、API、permission、persistence authority 或跨 domain data flow；root query mode 與 legacy route compatibility 可由本 feature contract 完整治理。若後續命中 Stop Condition，再重新判斷 ADR。

`Future Phase Captured / Not Requested`：若未來重新核准管理辦法正文的穩定 Work Item reference，可由管理辦法攜帶 `methodId／anchor／dutyId` 進入本模式並精確返回。重新進入條件是 DEV-032 另案接受跨 domain reference identity、刪除阻擋與 migration；在此之前不得由文字比對、AI 推論或段落順序自動建立 reference。

## 15. RD Implementation Contract

### 15.1 Pure route module

新增 `src/dutyConfigurationRoute.ts`，只治理 URL 與 state normalization，不直接操作 React 或 history。必須輸出以下 symbols：

- `DutyConfigurationExactLane`：`primary-execute | other-execute | collaborate | review | countersign`。
- `DutyConfigurationLocation`：`active`、`attentionOnly`、`dutyId`、`lane`、`focusPositionId`、`sourceRelationId`、`legacySurface`。
- `readDutyConfigurationLocation(location)`：解析 root canonical query 及三個既有 legacy paths；不讀取或修改資料。
- `normalizeDutyConfigurationLocation(parsed, state)`：以最新 organization state 移除不存在的 duty、失效 Position、錯誤 lane 及不屬於目前 duty 的 pending source，回傳安全 context 與必要的 canonical `replaceUrl`。
- `buildDutyConfigurationUrl(context)`：只輸出本契約允許的 query keys，順序固定為 `mode → attention → duty → lane → position → sourceRelation`。

Normalization 規則：

1. 非 root 且非三個 legacy paths 時 `active=false`，不得改寫 URL。
2. legacy path 立即產生 canonical `replaceUrl`；`anomalies` 對應 `attention=1`，合法 `position` 保留。
3. `duty` 不存在時同時清除 `duty／lane／sourceRelation`；`lane` 缺少或無效時進入 `select-duty`，不得自動猜測。
4. `position` 只接受 active Position；失效即清除，不得建立 relation。
5. `sourceRelation` 只接受目前 duty 的 pending-reassignment relation；失效即清除，其他合法 context 保留。
6. canonicalization 全部使用 `replaceState`，不得形成 `popstate → replace → popstate` loop。

### 15.2 Pure command／projection module

新增 `src/dutyConfiguration.ts`。它可以建立既有 `OrganizationCommand`，但不得執行 command、直接修改 state 或存取 DOM。必須輸出：

- `DUTY_CONFIGURATION_LANE_LABELS` 與 lane-to-domain mapping。
- `resolveDutyConfigurationCommand(state, intent, nextRelationId)`。
- `projectDutyConfigurationByPosition(state, dutyId, lane)`。
- `getDutyAttentionLabel(anomaliesForDuty)`。
- `getDutyConfigurationIssueMessage(code)`。

`resolveDutyConfigurationCommand` 回傳 `{ status: 'command'; command }` 或 `{ status: 'invalid'; code }`；ID 由呼叫端注入，pure tests 不依賴 `crypto`。一般 Position click 的 exact resolution 固定如下：

| Lane／現況 | Command |
|---|---|
| 非 execute lane 尚不存在 | `UPSERT_DUTY_RELATION`，new `rel-${crypto.randomUUID()}` |
| 非 execute lane 已存在 | `REMOVE_DUTY_RELATION` |
| primary；目標無 execute、全 duty 無 primary | `UPSERT_DUTY_RELATION` new primary |
| primary；目標已有 non-primary execute、全 duty 無 primary | `UPSERT_DUTY_RELATION` 更新同一 relation ID 為 primary |
| primary；其他 Position 已有 primary | `TRANSFER_PRIMARY_DUTY_EXECUTOR`；`targetRelationId` 重用目標 execute ID，否則使用新 ID |
| primary；目標已是 primary | `REMOVE_DUTY_RELATION` |
| other-execute；目標無 execute | `UPSERT_DUTY_RELATION` new non-primary |
| other-execute；目標已有 non-primary execute | `REMOVE_DUTY_RELATION` |
| other-execute；目標目前是 primary | `UPSERT_DUTY_RELATION` 更新同一 ID 並降為 non-primary |
| pending source 合法 | `UPSERT_DUTY_RELATION` 保留原 relation ID 與 order，更新 target；只允許原 exact lane或 primary→other-execute |

所有 command 在執行前都以 `currentStateRef.current` 重新 resolve；route render 時的 state 只供 projection，不得作 release-time authority。新 relation 的 `order=0`，由既有 `normalizeDutyRelationOrders` 決定正式排序。

Projection 固定以 `主執行 → 其他執行 → 協作 → 審核 → 會簽` 排序；每個 Position 的 `labels`／`assignedToCurrentLane` 僅供 Dock、Drawer、command 與 accessible action 使用，禁止直接渲染到組織圖卡片。anomaly 只重用 `deriveDutyAnomalies`，同一 duty 最多輸出一個短文字，優先順序為待重新配置、尚無執行、缺主執行；不得產生新的風險評分。

### 15.3 Capability module

DEV-033 尚未完成，因此本 DEV 新增 scoped `src/dutyConfigurationCapability.ts`：

- `canMutateDutyConfiguration(environment)`：三項條件必須同時成立：`(min-width: 1024px)`、`(hover: hover)`、`(pointer: fine)`。
- `observeDutyConfigurationCapability(onChange, environment)`：監聽三個 MediaQueryList；任一改變即重新計算，cleanup 只移除自己註冊的 listeners。

此 module 只決定 mutation UI，不能取代 workspace permission。`App` 的唯一寫入判定固定為：

```text
dutyConfigurationWriteEnabled =
  route.active
  && deviceCapability
  && editingEnabled
  && serverReady
  && !recoveryOpen
```

query、DOM attribute、viewport override 或殘留 callback 均不能繞過此判定。DEV-033 未來提供共用 capability 時，才以 compatible refactor 取代 scoped module。

### 15.4 App composition 與 history ownership

`src/App.tsx` 是唯一 composition owner：

1. 以 `dutyConfigurationLocation` 取代 `dutyPlanningLocation` page render branch；三個 legacy paths 在首個 route sync 以 `replaceState` canonicalize，絕不短暫 render `DutyCenter`。
2. `openDutyConfiguration(focusPositionId?)` 保存 `document.activeElement`、關閉 inspector／directory／context menu／dialogs，並以 `pushState` 進入 root mode。
3. duty／lane／attention／sourceRelation 變更只用 `replaceState`；「完成」與 readonly「返回組織圖」用 `replaceState('/')`；瀏覽器返回由同一 `popstate` sync 處理。
4. mode 退出後焦點回原入口；入口不存在時回 `[data-workspace-focus-fallback]`。direct／legacy deep link 沒有 entry ref 時也使用 fallback。
5. `focusPositionId` 合法時只 center 並 focus 對應 `.org-node__title`；不建立 relation。第一次實際 Position action 後從 URL 清除 `position`。
6. version 切換沿用既有 dirty-save gate；active version 改變後退出 mode 並清除 duty／lane／source context。
7. command handler 使用 `resolveDutyConfigurationCommand(currentStateRef.current, ...)`，再交 `executeOrganizationCommand`；`applied` 才 `commitState(result.state)`，`noop／invalid／rejected` 都不得增加 history。
8. command error 保存於單一 `dutyConfigurationError`，顯示在 dock 或受影響 Position 附近；下一次成功、切換 duty 或退出時清除。`autoSaveError` 另以持續的「尚未保存」狀態呈現，直到既有保存路徑成功。
9. 每個 applied command 只呼叫一次 `commitState`；不得在 component callback 先 optimistic 寫 relation array。
10. 移除 `App` 對 session-only prototype responsibility mode 的 imports、state、bar、Position labels 與 root mutation handler；歷史 prototype modules／tests／evidence 保留，但不再是 active surface。

### 15.5 UI component contract

新增 `src/components/DutyConfigurationDock.tsx`，不建立第二個 page component：

- `select-duty`：一個左側推移式工作事項搜尋、同一個可捲動 duty list、適用時一個「新增工作事項」、一個「返回組織圖」。搜尋只比對 title／description；`attentionOnly` 只篩現行 anomalies。列表只顯示非空說明，anomaly 只由單一群組標題表達，不逐列重複狀態。
- `configure-duty` writable：icon-only 更換、duty title、執行／協作／審核三個 group buttons、當 group 需要時才顯示兩個 exact lane sub-buttons，以及唯一主要「完成」。
- `configure-duty` readonly：更換 Duty、duty title、按需 Drawer 的責任內容與「返回組織圖」；Position 卡片不顯示職掌文字，零 lane、pending 或 Duty mutation controls；窄版任務列採兩欄單列，不保留可寫版高度。
- group 與 sub-lane 使用 button／`aria-pressed`，不是 hover-only menu；焦點順序依畫面由左至右。動態錯誤用單一短 `role=alert`，一般成功不用 live message。
- picker 擁有唯一必要的 list scroll boundary；dock 不得再包摘要卡、統計、教學、badge 或第二層 card container。

`src/components/Toolbar.tsx` 新增 `dutyConfigurationActive` 與語意改名後的 `onOpenDutyConfiguration`。mode active 時只保留 brand、VersionSwitcher 與 DocumentMenu，其他搜尋／治理／風險／管理辦法／重複 duty entry 不渲染。

`src/components/OrgNode.tsx` 以正式欄位取代 `prototypeResponsibilityLabel`：

- `dutyConfigurationLabel?: string`
- `dutyConfigurationAssigned?: boolean`

node 只負責職位／員工基本文字、assigned outline／pressed state 與 accessible action name，不渲染 duty text；正式 mutation callback仍是 App 傳入的 `onSelectPosition`。員工與分支 controls 必須維持 `stopPropagation`，不得觸發 relation command。配置模式下 React Flow 使用 `nodesDraggable=false`、不開 context menu、不執行 double-click edit，且 node selected state 不得與 assigned state混為同一訊號。

`src/components/Inspector.tsx`／`PositionDutySection.tsx` 將 callback 語意改為 `onOpenDutyConfiguration`，可從目前 Position 帶入 focus；所有「中央職掌規劃」文字改為「在組織圖配置工作事項」。

### 15.6 Drawer、Duty CRUD 與 pending recovery

`src/components/DutyDetailDrawer.tsx` 新增 `placementMode?: 'legacy-list' | 'organization-chart'`，default 保持 `legacy-list` 供未 render 的 DEV-031 historical component compile。root mode 必須傳 `organization-chart`：

- 不渲染 Position select、新增關係 form 或永久移轉 select。
- 保留 title／description、relation summary、移除、pending「在組織圖重新配置」及刪除。
- `onSelectPendingRelation(relationId)` 只對 pending relation 顯示；成功設定 route source 後關閉 drawer並把焦點回 dock。
- 移除目前 `sourceRelation`、刪除 duty 或 duty 不存在時，同步清理 route；command reject 時保留 drawer／dialog 與使用者輸入。

新增與刪除繼續重用 `DutyEditDialog`／`DutyDeleteDialog`。建立成功後選定新 duty＋`primary-execute`；刪除成功後回 `select-duty`。Current Phase 不加入 Duty title uniqueness、版本生命週期或新確認流程。

### 15.7 Mode isolation

- mode active 時不渲染 `DirectoryDock`，並將 `organizationEditingEnabled=false` 傳給仍可能按需開啟的 read surfaces。
- 關閉 Role Risk、Governance、Position Inspector、Directory detail、Position context menu 與所有 organization dialogs；其開啟 callbacks 在 mode active 時也必須 fail closed。
- 保留 pan、zoom、Controls、MiniMap、branch collapse 與員工純閱讀；branch collapse 不寫 organization document。
- `/`、Enter／Tab／F2／Space／Alt+Arrow、Delete／Backspace 等 organization edit shortcuts 在 mode active 時不得落入原 handlers；Ctrl/Cmd+S 與 Undo／Redo只在既有 editable／recovery gates 允許時保留。
- readonly mode 的 Position 主點擊只做一般選取／閱讀，不 resolve command；合法 lane query 也不能使 callback變成 writable。

## 16. Repo File Boundary

### 16.1 Required new files

- `src/dutyConfiguration.ts`
- `src/dutyConfiguration.test.ts`
- `src/dutyConfigurationRoute.ts`
- `src/dutyConfigurationRoute.test.ts`
- `src/dutyConfigurationCapability.ts`
- `src/dutyConfigurationCapability.test.ts`
- `src/components/DutyConfigurationDock.tsx`

### 16.2 Required modified product files

- `src/App.tsx`
- `src/components/Toolbar.tsx`
- `src/components/OrgNode.tsx`
- `src/components/Inspector.tsx`
- `src/components/PositionDutySection.tsx`
- `src/components/DutyDetailDrawer.tsx`
- `src/index.css`

### 16.3 Required handoff documents／evidence

- `ai-doc/specs/DEV-034-org-chart-inline-duty-configuration.md`
- `ai-doc/dev_task.md`
- `ai-doc/documentation_map.md`
- `ai-doc/specs/DEV-031-duty-master-detail-editor.md` 與 `ai-doc/specs/DEV-032-management-method-system.md`：只在 final drift check 更新 successor 狀態。
- `output/playwright/dev034/manifest.md` 與實際 screenshots：只在 QC 執行後建立，不得預建空檔。

### 16.4 Preserve／forbidden boundary

Current Phase 保留但不得修改或刪除：

- `src/components/DutyCenter.tsx`、`DutyPlanningWorkbench.tsx`、`DutyPlanningView.tsx`、`DutyMatrixView.tsx`、`DutyAnomalyPanel.tsx` 及其他 DEV-031 workbench／drag components。
- `src/dutyPlanningRoute.ts` 與既有 route tests；新 canonical module可讀取其 constants／parser。
- `src/managementMethodPrototype*`、`src/components/ManagementMethodPrototype.tsx` 及歷史 prototype tests／evidence；只移除 `App` active wiring。

不得修改：

- `src/types.ts`、`src/organizationCommands.ts`、`src/duties.ts`、`src/documentStorage.ts`、`src/serverWorkspaceStorage.ts`、`src/versionWorkspace.ts`。
- `server/**`、`src/governance/**`、`src/managementMethods/**`。
- `package.json`、lockfile、`vite.config.ts`；本 DEV 不新增 dependency 或 test framework。
- `output/playwright/dev031*/**`、`output/playwright/dev032/**` 及其他既有完成證據。

若 RD 必須突破 forbidden boundary，立即命中 Stop Condition 回 PM，不得以順手 refactor 擴張 scope。

### 16.5 Protected concurrent working-tree boundary

本契約補齊期間，工作樹另有一組非 DEV-034、由其他工作產生的「管理辦法章節抽屜／章節定位」變更；它們是使用者所有的受保護內容，不得 reset、checkout、覆寫或誤算為 DEV-034：

- overlap files：`src/App.tsx`、`src/index.css`。S3 必須從當時最新內容做 additive integration；保留 `initialChapter` 傳遞及 management-method chapter styles。
- forbidden-but-dirty files：`src/components/managementMethods/ManagementMethodDocumentPage.tsx`、`ManagementMethodReader.tsx`、`ManagementMethodChapterDrawer.tsx`、`ManagementMethodReader.test.tsx`、`src/managementMethods/headings.ts`、`headings.test.ts`。DEV-034 不得修改。

S0 先保存 `git status --short` 與上述檔案 diff inventory；若這組變更在 RD 開始前已由其 owner commit、移除或繼續演進，重新讀取最新檔案即可，不視為產品決策缺口。只有同一 hunk 無法同時保留 chapter navigation 與 duty-config contract 時才停止回 PM。

## 17. S0→S5 Implementation Slices

| Slice | 實作內容 | Slice gate |
|---|---|---|
| S0 Baseline／lock | 確認 active contract、Git boundary、required／forbidden files；保存第 16.5 節 protected diff inventory，禁止覆寫使用者變更 | current dirty tree `52 test files／229 tests`、`npm run build` passed；HEAD `ad5f62b`；既存 bundle-size warning不屬本 DEV blocker |
| S1 Pure contracts | 新增 route、command／projection、capability modules 與三個 tests | `npm test -- --run src/dutyConfigurationRoute.test.ts src/dutyConfiguration.test.ts src/dutyConfigurationCapability.test.ts src/organizationCommands.duty.test.ts src/duties.test.ts` |
| S2 Minimal UI | 新增 Dock；完成 Drawer organization-chart variant、pending selector 與 CSS，尚不切 legacy routes | S1 gate＋`npm run build`；DOM inventory確認零第二份 Position select |
| S3 Root integration／cutover | App route/history/current-state adapter、Toolbar mode、OrgNode projection、Inspector entry、mode isolation；移除 App prototype root wiring與 DutyCenter render branch | S1 targeted tests＋`src/dutyPlanningRoute.test.ts`、`src/managementMethodPrototypeRoute.test.ts`、`src/managementMethods/route.test.ts`、build |
| S4 Failure／persistence | invalid normalization、readonly guards、pending conflict、command error、autosave error、409、focus／version cleanup；補 unit tests缺口 | 完整 `npm test -- --testTimeout=30000`＋build；所有 negative path state signature不變 |
| S5 Browser QC／handoff | 三 viewport真實流程、legacy alias、Undo／reload／409、console／network／overflow、spec drift與 manifest | B1～B9 已通過，保留 local release gate |

規則：每個 slice 只修改其 required files；第一個 targeted test、build、scope 或 state-signature failure 即停止，不跨 slice。S3 完成前 DEV-031 full-page route仍是實際基線；S3 cutover 後不得同時保留兩個可達 mutation surfaces。

## 18. QA／QC Execution Contract

### 18.1 Targeted automated assertions

`src/dutyConfigurationRoute.test.ts` 至少覆蓋：五 lane、canonical key order、select/configure state、attention、三 legacy paths、合法／失效 position、duty、sourceRelation、unknown query cleanup及 stable replace result。

`src/dutyConfiguration.test.ts` 至少覆蓋：

- 五 lane create／remove 與 projection排序。
- primary create、existing execute升級、atomic transfer、self remove、降為 other-execute。
- pending same-ID reassign、pending primary→other、非法跨 type、active primary conflict、duplicate target及 inactive Position。
- resolver不修改輸入 state；`invalid／rejected／noop` state signature不變。
- anomaly 單一文字優先順序，不新增風險判斷。

`src/dutyConfigurationCapability.test.ts` 至少覆蓋 8 種 width／hover／pointer組合、listener change及 cleanup。不得把 1024px 單獨當成 mutation authority。

### 18.2 Browser scenario script

Runtime 使用 `npm run dev:local` 的固定 `localhost:5000`。啟動前依 workspace `AGENTS.md` 記錄 project、purpose、port、owning process tree、cleanup condition；若安全的 matching runtime 已存在則重用。若本 DEV 啟動 runtime，交付前只停止該 verified tree並確認 port 5000 釋放。

| ID | Viewport／state | 必做操作與判定 |
|---|---|---|
| B1 | 1440×900 editable | Toolbar進入→選 duty→三群組／五 lane→兩個 Position create/remove→節點 assigned 輪廓／Dock 狀態→Undo／Redo→完成；組織圖是主焦點，console error 0 |
| B2 | 1440×900 editable | existing primary移轉至已有／沒有 execute 的 Position；每次只有一個 Undo，舊 primary結果符合 command contract |
| B3 | 1440×900 editable | drawer編輯、移除、pending同 ID重配、刪除確認；DOM中無「關係職位」或「永久移轉目標職位」select |
| B4 | 1024×768 editable＋854×698 readonly | picker 在左側推移且不覆蓋 workspace；選定後收合、readonly 可再次更換 Duty、dock 不遮圖；鍵盤完成 duty／lane／Position／Escape／focus restore；無水平 overflow／雙 scroll |
| B5 | 390×844＋readonly | direct duty/lane deep link可閱讀；零 lane、create/edit/delete/pending／完成配置 controls，node click零 dirty／history／save request |
| B6 | legacy URLs | 三個 `/duty-planning*` routes含合法／失效 `position` 都 replace到 canonical root；browser back不循環，舊 full-page workbench不出現 |
| B7 | invalid／stale | 無效 duty、lane、position、sourceRelation被清理；duplicate／inactive／primary conflict保留context、顯示最短錯誤、state signature不變 |
| B8 | persistence／409 | 成功操作經500ms autosave與reload還原；雙視窗製造revision conflict時保留本機state／Undo並持續顯示未保存，不覆寫較新server state |
| B9 | isolation／historical | mode期間無DirectoryDock、職位搜尋、組織edit shortcuts、context menu或double-click edit；舊 `mode=responsibility` 不再render prototype bar或產生formal／in-memory responsibility mutation |

Browser fixture 操作前後都記錄 organization state signature、Duty／relation count與既有 relation IDs；測試新增的關係必須用 Undo 或既有 command復原。不能可靠恢復時停止 QC，不得把測試資料留在共用 workspace。

### 18.3 Evidence manifest

完成後建立 `output/playwright/dev034/manifest.md`，至少記錄：

- source HEAD、dirty boundary、runtime provenance與cleanup結果。
- automated commands、通過數、既存 warnings與第一個失敗（若有）。
- B1～B9 的 route、viewport、workspace mode、fixture、操作、預期／實際、before／after signature、console／network、overflow及判定。
- screenshots：`editable-1440x900.png`、`editable-1024x768.png`、`readonly-390x844.png`、`pending-reassignment.png`、`legacy-alias.png`、`conflict-409.png`、`duty-card-compact-763x698.png`、`duty-picker-sidebar-1440x900.png`、`duty-picker-sidebar-854x698.png`、`duty-picker-fullscreen-390x844.png`。
- `Spec Drift: In sync` 或明確回 RD；不得用更新 spec掩蓋 implementation deviation。

## 19. R1 Historical Readiness Conclusion

- R1 當時已達 `RD Implementation Complete / QA-QC Passed`：S0～S5、required／forbidden file boundary、exact symbols、command boundary、failure recovery、測試與 browser evidence 均已完成；它仍不等於 `Release Ready`，也不得用來宣稱 R2 已實作。
- P0／P1 readiness缺口：無。
- 人類產品決策：已完整；剩餘均為本契約固定的工程實作。
- Schema／API／migration／permission／server：不變，沒有 migration或外部依賴。
- ADR：不需要；若命中第 13 節 Stop Conditions再重判。
- RD 可依本契約維護或進行後續 release gate；不得跳過 S0 boundary 或建立未授權 release artifacts。
- Local release gate 仍需另行確認正式權限、部署、資料備份及 production smoke；本 DEV 不宣稱已上線。

## 20. 變更紀錄

- 2026-08-25：依使用者要求完成現有組織圖、Duty commands、organization V6、Undo／autosave／CAS 與 `/duty-planning*` 盤點；建立 `RD Contract Ready` 權威契約。確認正式方案重用現有 Duty domain，不恢復管理辦法智能引用、AI 職掌判斷、新 schema 或第二套保存路徑；本輪未修改產品程式或測試。
- 2026-08-25：依使用者要求補至 RD 可直接開發。固定 pure route／command／capability modules、App composition、Dock／OrgNode／Drawer contract、required／forbidden file boundary、S0→S5、failure injection、B1～B9 browser scenarios與 evidence manifest；發現並保護另一工作新增的 management-method chapter navigation dirty files，current dirty tree baseline `52 test files／229 tests` 及 build通過。文件升級為 `RD Implementation Ready / RD Not Started`，本輪仍未修改產品程式或正式資料。
- 2026-08-25：依 `dev-pm` 完成 S1～S5：新增 route／command／capability 純模組、最小 Dock、Drawer organization-chart variant，整合 root query mode、legacy alias、Toolbar／OrgNode／Inspector 與既有 V6 commands／history／autosave；並修正配置模式 canvas 空欄位及 Dock 覆蓋畫布下緣的安全區缺口。`npm test -- --testTimeout=30000` 通過 `58 test files／251 tests`，build、diff check 與 B1～B9 browser QC 通過；狀態升級為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending`。
- 2026-08-25：依瀏覽器實測回饋移除組織圖 Position 卡片內的工作事項／職掌文字與 aria 長文字；配置結果改以節點輪廓表示，完整責任內容集中於 Dock／按需 Drawer，避免長文字撐開格子。763×698 與 1440×900 smoke、58／251 tests、build 通過。
- 2026-08-25：依使用者實測回饋將 `select-duty` 的底部大型浮層替換為左側 `280～320px` 推移式選擇器；workspace 使用剩餘畫布，`720px` 以下才改同 route 全寬表面。Duty 清單改為扁平列與單一「待處理（n）」群組，移除逐列「待處理」及空白「尚無說明」；唯讀任務列保留更換 Duty 並壓縮為單列。854×698／1440×900／390×844 實際畫面與元件測試補驗通過，未改 Duty domain、route、command 或保存契約。
- 2026-08-25：依使用者明確決策建立 R2 Active Brief：把職掌改為既有左側主資料 rail 的第五種清單，沿用其他清單的固定位置、panel shell、搜尋、選取與收合；選取職掌後就地設定精確責任，再由左向右拖到 Position。R2 取代頁首入口、特殊 picker、底部 Dock 與點擊 Position mutation；R1 實作、tests與 `output/playwright/dev034/manifest.md` 降為歷史證據。文件狀態改為 `R2 Brief Ready / RD Not Started`，本輪未修改產品程式、測試或資料。
- 2026-08-25：依使用者要求將 R2 補至 `RD Implementation Ready / RD Not Started`。完成實際 `DirectoryDock`、App、OrgNode、R1 toggle resolver、Duty Inspector、native employee drag及React Flow邊界盤點；固定第五主資料入口、route與Inspector分離狀態、assign-only drop resolver、native／keyboard drag、二維auto-pan、pending same-ID、檔案allowlist／R1 artifact removal、S0～S5、R2-B1～B9、FMEA及全新`output/playwright/dev034-r2/manifest.md`證據邊界。本輪仍只修改開發文件，未修改產品程式、測試或資料。
- 2026-08-25：依實作與瀏覽器回饋完成 R2 UI 收斂：修正 duty rail generic card CSS 覆蓋造成的名稱截斷；Position card 不顯示職掌文字；補上 keyboard grabbed 的 live status、Tab 目標循環、Enter／Space drop、Escape／blur cleanup 與來源 focus recovery；Inspector 改為既有 workspace 的第三 grid column，窄版才使用按需 overlay；native drag 加入 copyMove effect與短暫 ghost。自動化 `tsc`、59 files／258 tests與build均通過；in-app browser partial smoke通過上述可觀察項目，但四 viewport、native dataTransfer、reload／409、pending／capability與全量 B1～B9尚未完成，R2仍維持 `QA-QC Pending Browser Gate`。
- 2026-08-26：依使用者回饋移除「其他執行」，將「協作」併入「執行」群組；R2 UI 收斂為四個 lane（主執行／協作／審核／會簽）。後端 canonical contract 將協作保存為 `relationType=execute + isPrimaryExecutor=false`；舊 V6 `collaborate` 讀入時遷移並去重，舊 `other-execute` route／drag payload 僅映射為協作相容 alias，不再產生新資料。同步更新 document parser、workspace save validation、organization command normalization、Duty matrix／Inspector／Position projection 與 targeted tests；本次屬 `Intentional replacement`，不新增 schema version，尚未執行正式資料 migration。
- 2026-08-26：依使用者介面回饋將職掌列的兩個動作明確分離：點擊職掌名稱開啟既有明細 Inspector／Drawer；名稱旁獨立 chevron 按鈕負責展開／收起責任 lane，兩者不互相觸發。同步更新 `expandedDutyId` UI state、ARIA、CSS／prop wiring與 route contract；in-app browser smoke已確認名稱開明細時責任 lane不展開、chevron可展開／收起且不產生 relation mutation。
- 2026-08-26：依使用者確認新增 R2.1 複選式規劃狀態視角 Brief。篩選只包含 `no-executor`、`missing-primary-executor`、`pending-reassignment` 三個既有 anomaly 原子條件；空集合代表全部、同群組採 OR、與搜尋採 AND，三項全選只可摘要為「全部待處理」，不得另設「待處理」選項或第二套聚合演算法。R2.1 尚未要求實作，不改 R2 既有完成與 browser gate 狀態。
