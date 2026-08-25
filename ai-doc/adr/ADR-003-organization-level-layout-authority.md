# ADR-003：報告關係與垂直層帶採雙軸分工

狀態：Accepted  
日期：2026-08-17  
決策來源：`USER-2026-08-17-ORGANIZATION-LEVEL-BANDS`  
適用範圍：DEV-025 及後續組織層級、組織圖排版與職務評價功能

## Context

ADR-001 已確立 `Position.parentPositionId` 是唯一主要上下級關係來源，`OrgMember` 只保存畫布呈現偏好。既有版面以報告關係深度推導 Y 軸；在小型組織中，基層職務可能直接向部門經理報告，因此「報告鏈少一層」不等於「職務責任層級較高」。若仍以報告深度決定 Y 軸，基層職務可能和組級主管位於同一高度，視覺上誤傳職務階層。

本需求另希望層級資料未來可作為薪資制度的參考維度，但本期不建立薪等、職等、薪資帶或金額計算。層級必須能在不同組織版本中獨立維護，且不改變既有上下級、主職、直屬主管或部門語意。

## Options considered

1. 繼續由 `parentPositionId` 的深度決定 Y 軸：資料最少，但無法表達小型組織的跨層直報，會延續使用者指出的視覺錯誤。
2. 讓職務層級同時取代 `parentPositionId`：排版直接，但同一層無法推導誰向誰報告，且會違反 ADR-001、破壞既有管理路徑。
3. 報告關係與垂直層帶分工：`parentPositionId` 決定邊與主管路徑，`organizationLevelId` 決定 Y 軸層帶；資訊正確且可保留跨層直報，但需新增一致性驗證。
4. 立即導入完整 Job Architecture／Job Grade／Pay Grade：長期完整，但超出目前排版問題與本期開發邊界。

## Decision

採 Option 3。

- `Position.parentPositionId` 維持唯一主要上下級關係權威，決定組織圖連線、拖曳重排、直屬主管與分支操作。
- `Position.organizationLevelId` 只決定層級排版的垂直層帶，不推導、不覆寫也不替代 `parentPositionId`。
- 同一組織版本保存一份可排序的 `OrganizationLevel[]` 主檔，以及可逆的 `organizationLayout.mode`（`tree`／`levels`）與 `showLevelGuides` 偏好。
- `levels` 模式下，所有使用中的較低層級職位必須完整位於較高層級層帶下方；同層職位可依 X 軸與碰撞狀況緊密排列。
- 任一父子職位若都已設定層級，父職位的層級順序必須嚴格高於子職位；同層或反向關係拒絕套用。
- 只有全部使用中職位均有合法層級時才可明確啟用 `levels` 模式；設定未完成時維持既有 `tree` 排版。
- `tree` 與 `levels` 可來回切換，兩種資料均保留；切換排版不得改寫上下級或職務層級。
- 組織文件 schema 升為 V5。V1–V4 升級到 V5 時依主要報告深度建立正式層級指派，但維持 `tree` 模式，須由使用者明確啟用層級排版。
- 若既有組織深度超過四層，migration 會補建必要的後續層級，避免將相鄰父子壓到同一最末層而違反嚴格順序。
- V4→V5 自動指派是正式資料，不標記為建議或待確認。使用者已接受它可能保留「跨層直報被按深度歸類」的語意風險，後續可逐職位人工修正。

## Consequences

- 組織圖的邊與 Y 軸不再由同一資料推導；任何版面程式都必須明確讀取 layout mode，不得誤把層級當成第二個 parent。
- 層級排序會影響所有已指派職位的垂直位置，因此採草稿預覽後一次套用；非法父子順序不得部分寫入。
- 新增子職位預設帶入父職位的下一層；父職位位於最低層時阻擋新增子職位。複製職位保留原層級。
- 刪除仍被職位使用的層級時拒絕，不自動搬移職位；重新命名不改 ID 或既有指派。
- 版本比較需呈現層級主檔、職位層級指派與 layout mode 變更；版本複製必須完整複製這些資料並保持隔離。
- 未來薪資模組可引用 `organizationLevelId` 作為輸入，但不得將它直接等同薪等或薪資金額；另案定義職等、薪等與例外治理。

## Migration / compatibility impact

- V5 parser 必須接受並正規化 V1–V4，來源版本資訊擴充為 `1 | 2 | 3 | 4 | 5`。
- V5 localStorage key、recovery key 與 server canonical 檔名升版；既有 V4 bytes、workspace version ID 與 `workspaceVersion: 1` 不改寫、不刪除。
- 每份 workspace 版本在讀取時各自升級成 V5；版本工作區 metadata 不承載層級資料。
- ADR-001 仍有效；本 ADR 只取代 DEV-017 中「報告樹深度永遠是 Y 軸唯一權威」的版面假設，不取代其領域關係決策。

