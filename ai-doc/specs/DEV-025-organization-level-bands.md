# DEV-025：組織層級與垂直層帶排版

狀態：RD Implementation Complete / QA-QC Passed  
日期：2026-08-17  
來源 ID：`USER-2026-08-17-ORGANIZATION-LEVEL-BANDS`  
父任務：DEV-004、DEV-008、DEV-017、DEV-020、DEV-021、DEV-022  
架構決策：`ai-doc/adr/ADR-003-organization-level-layout-authority.md`

## 1. Problem statement

既有組織圖的 Y 軸由主要報告關係深度決定。小型公司常讓基層職務直接向部門經理報告，因此報告深度較淺不代表職務階層較高；目前可能把基層職務與組級主管排在同一高度，無法辨識職務責任層級。

本期先建立組織層級主檔、逐職位層級指派與可逆垂直層帶排版。薪資只保留未來引用可能，本期不建立任何職等、薪等、薪資帶或金額規則。

## 2. Confirmed product decisions

| 編號 | 決策 |
| --- | --- |
| 1B | 預設四層，可新增、刪除、改名、排序。 |
| 2B | 同層在同一層帶內緊密排列；較低層整體必須在較高層下方。 |
| 3 | 在職位明細逐一設定層級。 |
| 4C | 全部使用中職位完成設定前維持舊排版；完成後仍須明確啟用。 |
| 5B | 新增子職位預設下一層且可改；父職位在最低層時阻擋；複製保留層級。 |
| 6A | 父子同層或反向層級直接阻擋。 |
| 7B+C | 左側新增「層級」主資料頁；職位明細提供開啟同一頁的捷徑。 |
| 8B | 層級標籤與淡引導線預設顯示；顯示設定不提供獨立切換入口。 |
| 9B | 排序先在草稿預覽，合法才一次套用；改名直接保存；使用中層級不可刪除；不自動搬移職位。 |
| 10B | 無層級排版與層級排版可逆切換，資料均保留。 |
| 11A | 主檔、指派、排版模式與引導線偏好均屬於各組織版本，複製後隔離。 |
| 12B | V4→V5 依主要報告深度自動指派。 |
| 13B | 遷移指派直接視為正式資料；仍不自動啟用層級排版。 |
| 14A | 無層級排版允許職位卡沿 Y 軸調整並固定；靠近鄰近卡片時以磁吸方式對齊，純屬呈現座標，不改上下級關係。 |

## 3. Spec Impact Preflight

- 結論：`Compatible exception / Intentional layout extension`。
- ADR-001：完全保留。`parentPositionId` 仍是唯一主要上下級權威；層級不得形成第二條報告線。
- DEV-017：只替換「Y 軸必然由樹深度決定」的版面假設。部門歸屬、部門框與上下級編輯仍相容。
- DEV-020／ADR-002：相容。V5 完整狀態保存於每份版本文件；`workspaceVersion: 1` 與版本 ID 不變。
- DEV-021：相容。主職、兼任與直屬主管仍只讀 `parentPositionId`。
- 薪資參考、Job Grade、Pay Grade、ReportingLine、多重匯報、發布與部署均為 deferred scope。
- 工作目錄不是 Git repository；本期以明確檔案清單與測試證據管理邊界，不宣稱 branch／commit／PR。

## 4. Domain contract

```ts
type OrganizationLayoutMode = 'tree' | 'levels'

interface OrganizationLevel {
  id: string
  name: string
  order: number
}

interface OrganizationLayoutSettings {
  mode: OrganizationLayoutMode
  showLevelGuides: boolean
  positionYOverrides?: Record<string, number>
}

interface Position {
  organizationLevelId: string | null
}

interface OrgDirectoryState {
  organizationLevels: OrganizationLevel[]
  organizationLayout: OrganizationLayoutSettings
}
```

預設四層與穩定 ID：`level-executive` 經營決策層、`level-department` 部門主管層、`level-team` 單位／組級主管層、`level-execution` 執行／專業層。

`order` 必須是從 0 開始的連續整數。名稱 trim 後不得為空或重複；ID 與 order 不得重複。至少保留一層。

## 5. Invariants and validation

- 每個非 null `organizationLevelId` 必須存在於主檔。
- 任一 active 父子若都已指派層級，`parent.order < child.order`；同層或反向均拒絕。
- `organizationLayout.mode === 'levels'` 時，每個 active position 必須有層級，且全部父子關係合法。
- `tree` 模式允許 active position 暫時為 null，供逐一建置；已指派的父子仍必須遵守嚴格順序。
- inactive position 可保留歷史層級，也可為 null；不影響啟用 gate。
- 使用中層級不可刪除；刪除不自動改派職位。
- 層級排序必須以完整 proposed state 驗證，失敗時原狀態完全不變。
- `positionYOverrides` 只接受 finite、非負的 Y 座標；只影響 tree／無層級排版，不得改寫 `parentPositionId`、`organizationLevelId` 或任職資料。

預期新增 validation code：`DUPLICATE_LEVEL_ID`、`DUPLICATE_LEVEL_ORDER`、`DUPLICATE_LEVEL_NAME`、`INVALID_LEVEL_ORDER`、`EMPTY_LEVEL_CATALOG`、`UNKNOWN_ORGANIZATION_LEVEL`、`INVALID_PARENT_LEVEL_ORDER`、`INCOMPLETE_LEVEL_ASSIGNMENT`。

## 6. Command contract

- `ADD_POSITION.position` 包含 `organizationLevelId`；`PATCH_POSITION` 支援 `organizationLevelId`。
- `ADD_ORGANIZATION_LEVEL` 新層級附加到最末；`RENAME_ORGANIZATION_LEVEL` 保留 ID／order，trim 後直接保存。
- `DELETE_ORGANIZATION_LEVEL` 使用中拒絕；成功後重排 order。
- `REORDER_ORGANIZATION_LEVELS` 接收完整 ID 順序；在 proposed state 驗證全部父子後原子套用。
- `SET_ORGANIZATION_LAYOUT` 設定 mode 或 guide 偏好；啟用 levels 必須通過完整 gate。
- `SET_POSITION_Y_OVERRIDE` 設定或清除指定 active position 的固定 Y 座標；不改變任何組織關係資料。
- `DUPLICATE_POSITION` 保留 `organizationLevelId`，不複製任職與子職位。
- 新增根職位預設第一層；新增同階預設來源層級；新增子職位預設父層下一層。父層已是最低層時，UI 不送 command 並提供可見原因。

## 7. V5 migration and storage

- `ORG_DOCUMENT_VERSION = 5`；current／draft／recovery localStorage keys 升為 v5，V4 keys保留為 fallback。
- V5 shape 必須包含 `organizationLevels`、`organizationLayout`，每個 Position 必須包含 `organizationLevelId`（可為 null）。
- V4→V5：先依既有規則正規化；以 `parentPositionId` 計算 active position 深度；建立至少四層，超過四層時補建 `第 N 層`；active position 依深度正式指派；inactive 設 null；layout 預設 `{ mode: 'tree', showLevelGuides: true, positionYOverrides: {} }`；最後經 V5 validator fail closed。
- V1–V3 先走既有正規化再進同一 V5 migration，不建立多套推導。
- workspace index 仍為 v1；每份版本文件獨立升級、複製與保存層級資料。

## 8. Layout algorithm

- 先執行既有 tree layout 取得穩定 X 軸、分支區域的原始 Y 相對位置、可見節點與 collapsed 行為。
- levels 模式再依 `organizationLevelId` 分組，按 level order 建立垂直層帶；每層 guide line 是該層職位卡片的共同上緣基準。
- 同層職位保留 tree layout 的 X 軸分支位置；沒有水平範圍重疊時，卡片都從該層 `bandY` 開始，不再因原始 tree Y 差異而被刻意錯開。
- X 範圍重疊的節點才以固定 `ORGANIZATION_LEVEL_NODE_GAP = 10px` 向下避讓；此距離是卡片底部到下一張卡片頂部的固定最小間距，較原 20px 縮小 50%。
- 下一層帶起點必須大於前一層帶內最高節點底部加固定 `ORGANIZATION_LEVEL_BAND_GAP = 30px`，較原 20px 加大 50%。
- layout result 回傳 derived `levelBands`（id、name、order、y、height）；層級帶座標不得持久化；tree／無層級排版可另外套用版本內 `positionYOverrides` 作為固定呈現 Y 座標。
- 部門框與風險關係由最後 positions 推導；層級線位於節點與部門框後方，不阻擋 pointer event。
- 橫向排列的 reporting edge 以父職位為 routing authority：由最近的可見直接下屬一次計算共用 branch offset，同一父職位的所有直接下屬必須共用同一 `bendY`。個別職位升降階只能改變末端垂直段，不得重新計算另一條水平幹線。
- tree／無層級排版沿用現行樹狀關係與 X 軸結果；卡片拖曳未形成上下級候選時，只調整 Y 軸，靠近其他卡片上緣 `14px` 內即磁吸到相同 Y，放開後保存固定座標。

## 9. UI contract

### 左側層級主檔

- directory rail 新增「層級」頁，沿用同一主資料面板，不另開重複 modal。
- 左側「層級」面板只負責層級主檔與排序；header 顯示層級資料數量與前往顯示設定的提示。
- 頂部欄新增「顯示設定」入口，面板集中顯示完成進度 `已設定 X / Y 個使用中職位`、目前排版與切換入口；未完成時啟用 disabled 並顯示原因。
- 編輯／維護模式下保存排版模式；既有 guide 狀態仍沿用版本資料渲染，但顯示設定不提供獨立切換入口。現行版唯讀模式可調整排版模式，但只建立本次檢視覆寫，不寫回版本、不標記 dirty；比較模式不套用主畫布設定。
- 每列顯示 `L1…Ln`、名稱、被使用職位數；名稱在 blur／Enter 後直接保存。
- 排序以可鍵盤操作的上／下按鈕建立本地 draft；畫布預覽 draft，按「套用排序」才送原子 command，另有「取消」。
- 刪除使用中層級 disabled 並有說明；新增層級是單一主 CTA。

### 職位明細

- 在「上級職位」附近新增「組織層級」select，可為「尚未設定」。
- 新增「管理層級」文字捷徑，開啟左側同一個 levels directory panel。
- validation error 顯示在欄位下方，不得只用 toast。
- meta 顯示實際層級名稱；未設定顯示「尚未設定」，不再把報告深度標成組織層級。

### 畫布與版本比較

- levels mode 且 guide 開啟時顯示淡色水平線與 `Lx 層級名稱`；隱藏 guide 不改排版。
- 無層級排版的編輯模式可拖曳職位卡調整 Y 軸；垂直拖曳意圖優先維持 Y 軸操作，不被上下級候選預覽中途接管；水平位移超過意圖門檻才進入既有上下級拖曳流程。拖曳靠近鄰近卡片時顯示磁吸目標與共同 Y 軸對齊線，放開後固定 Y 軸位置；唯讀模式保留檢視，不可寫入版本。
- 跨層直報邊允許跨過中間層帶，保留真實 parent relation。
- 比較引擎新增 `organization-level`；比較層級主檔與 layout settings，position assignment 納入 position diff。
- 管理層級摘要使用 active positions 實際使用的 distinct level 數；比較圖各自使用該版本設定。

## 10. Error communication

- `INVALID_PARENT_LEVEL_ORDER`：`上級職位必須位於更高的組織層級`。
- `INCOMPLETE_LEVEL_ASSIGNMENT`：`尚有使用中職位未設定層級`。
- 使用中層級刪除：`此層級仍有 N 個職位使用，請先逐一改派`。
- 最低層新增子職位：`此職位已在最低層；請先新增較低層級或調整層級`。
- 排序失敗時保留 draft 與原正式順序，指出受影響父子職位，不部分套用。

## 11. RD file boundary

預計修改 domain、storage、layout、commands、App、DirectoryDock、Inspector、comparison、CSS、tests 與文件；必要時新增 level guide 元件與層級純函式模組。

不得修改：ReportingLine、多重匯報、薪資金額、Auth、production deployment、protected ProJED runtime `127.0.0.1:4173`。

## 12. QA verification design

- level catalog：預設、增、改名、未使用刪除、使用中刪除拒絕、排序成功、排序父子衝突拒絕。
- position：逐一指派、unknown ID、同層父子、反向父子、下一層預設、最低層阻擋、duplicate 保留。
- layout：tree regression；無層級固定 Y 與磁吸；levels 層帶不重疊；同層卡片從共同 guide baseline 開始；同 X 卡片固定間距；低層 y 大於高層底部；collapsed；跨層直報；同父不同層直接下屬共用 `bendY`。
- V5：round trip；V4 深度 migration；超過四深度補層；tree／guides default；V1–V3 regression；malformed fail closed。
- version：clone isolation、level diff、position assignment diff、mode diff、summary distinct used levels。
- commands：rejected state 與 original deep-equal，Undo 每次成功操作只形成一個 snapshot。
- Browser QC：使用固定 `npm run dev:local` 5000；若已有同專案 matching runtime 則重用；1440×900、1024×768、390×844；檢查 panel arbitration、overflow、visible error、console、focus，並建立基層跨層直報案例。

## 13. Acceptance criteria

- [x] 使用者能從左側維護層級主檔，並從職位明細開啟同一面板。
- [x] 使用者能逐職位指派層級；同層／反向父子無法保存。
- [x] 全部 active position 完成前不能啟用 levels mode；完成後也不自動啟用。
- [x] levels mode 中低層層帶完整位於高層下方，解決跨層直報造成的同 Y 軸誤讀。
- [x] guide label／line 既有狀態持續渲染，顯示設定不提供獨立切換入口。
- [x] 新增子職位預設下一層；最低層阻擋；duplicate 保留層級。
- [x] 主檔排序先預覽且原子套用；使用中層級不可刪除。
- [x] tree／levels 可逆切換且不改 parent、department、assignment 或 level data。
- [x] V1–V4 皆可 fail-closed 升到 V5；V4 depth assignment 為正式資料、mode 仍為 tree。
- [x] 每份組織版本完整、隔離地保存層級資料與偏好；比較能看出相關差異。
- [x] 無層級排版可調整並固定職位卡 Y 軸位置，鄰近卡片可磁吸對齊，磁吸期間顯示共同 Y 軸對齊線，且不改變組織關係。
- [x] targeted tests、完整 `npm test -- --run`、`npm run build` 與三 viewport browser QC 通過。

## 14. Implementation evidence

- Automated：`npm test -- --run` 通過（21 files／156 tests）；`npm run build` 通過。
- Desktop QC：1440×900 實際畫面顯示層級引導線；同層卡片從共同 guide baseline 開始、層間留白縮至 20px、重疊時保留固定間距、無卡片重疊。生產部經理的製造組主管、工務組主管與降至 L5 的倉儲物流作業員三條 reporting edge 實測共用 `bendY = 177.4`。畫面證據：`output/playwright/orgmaster-shared-parent-trunk-fit-1440x900.png`。
- Compact／mobile QC：1024×768 與 390×844 均無 document overflow；390px 的層級面板可捲動、mode／層級操作可見。畫面證據：`output/playwright/orgmaster-levels-compact-390x844.png`。
- Safety：本輪 browser QC 未執行任何資料 mutation；QC session 已關閉，且清理後 `127.0.0.1:4173` 與 `localhost:5000` 均回應 200。

## 15. Stop conditions

- 任何實作新增第二個 parent／reporting authority。
- layout mode 切換會改寫 parent、層級或任職資料。
- V4 migration 讓合法既有文件無法載入，或非法文件被默默修補後覆寫原檔。
- level reorder 部分套用、使用中刪除自動改派、父子同層仍可保存。
- browser QC 發現層級線遮擋操作、panel 無法退出、390px 水平溢出、console error。
- 需要停止、重啟或占用 protected `127.0.0.1:4173`；必須停止並回 PM／使用者。
