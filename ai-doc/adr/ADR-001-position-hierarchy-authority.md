# ADR-001：主要職位上下級的權威欄位

狀態：Accepted  
日期：2026-08-12  
決策來源：`USER-2026-08-12-POSITION-TREE-DEPARTMENT-GROUPS`  
適用範圍：DEV-017 及後續正式組織圖功能

## Context

現行 `OrgMember.parentId` 原本只代表畫布配置關係，`Position` 沒有正式的上級職位欄位。DEV-017 將畫布職位樹提升為 V1 正式組織圖的主要上下級結構；若繼續讓 `OrgMember.parentId` 同時承擔排版與領域關係，或在 `Position` 再保存一份相同父節點，會形成兩個可能互相漂移的來源。

V1 同時確認：`Position.departmentId` 與主要職位上下級必須保持獨立，修改其中一個欄位不得靜默改寫另一個欄位；複雜匯報、矩陣與多上級留待未來獨立模型。

## Options considered

1. 保留 `OrgMember.parentId` 為唯一來源：改動較少，但正式領域關係仍被綁在畫布配置物件，難以供清單、匯出與未來服務層共用。
2. `Position.parentPositionId` 與 `OrgMember.parentId` 同時持久化：可漸進改造，但產生雙寫、同步與衝突處理成本。
3. 由 `Position.parentPositionId` 成為唯一權威來源，畫布需要的 `parentId` 由 adapter 衍生：資料語意清楚，需一次處理既有文件與畫布模組遷移。
4. 立即建立 `ReportingLine` 實體：可支援多種關係，但超出 V1「先畫出正式組織圖」的產品邊界。

## Decision

採 Option 3。

- `Position.parentPositionId: string | null` 是 V1 主要職位上下級的唯一權威來源。
- `Position.departmentId: string | null` 仍是職位所屬部門的唯一權威來源；兩欄位分開寫入並以資料不變量驗證結果。
- V2 文件中的 `OrgMember` 只保存排版狀態：`id`、`order`、`childrenAxis`、`collapsed`；不再持久化 `parentId`。
- `layout`、`drag` 與既有需要 `parentId` 的純函式，透過由 `Position.parentPositionId` 與 `OrgMember` 組成的衍生 hierarchy adapter 使用，不得把衍生資料回寫成第二份權威關係。
- `Department.parentId` 保持部門主檔階層語意，不由職位樹推算或同步；部門分組框只表示職位的 `departmentId`，不宣稱框的幾何巢狀等同部門主檔上下層。
- 未來若需要矩陣、次要、代理或多上級，另建 `ReportingLine` 或等價模型；不得重載 `departmentId` 或新增第二個 V1 主要上級來源。

## Consequences

- DEV-008 中「`OrgMember.parentId` 僅為畫布配置」的現行契約，於 DEV-017 完成後由本 ADR 有意取代；DEV-017 完成前既有實作仍依原契約運作。
- 本機文件需升版並提供 V1→V2 migration；所有新增、拖曳、編輯、複製、刪除與上移子職位流程都必須改走同一個 hierarchy transaction boundary。
- 職位清單、右側編輯器、組織圖與匯出可直接共享 `Position.parentPositionId`，不需同步畫布副本。
- sibling `order` 仍是排版資料；當 `parentPositionId` 改變時，必須在同一原子操作中正規化來源與目的 sibling order。
- `Department.parentId` 與職位主要上下級回答不同問題；V1 不把兩者不一致視為自動搬移或自動修正的理由。

## Migration / compatibility impact

- V1 文件以相同 `id` 對應 `OrgMember` 與 `Position`，將 `OrgMember.parentId` 複製到 `Position.parentPositionId`，再移除 V2 layout state 的 `parentId`。
- 只有通過結構與部門連續性驗證的 V1 文件可自動升版；不合法文件必須保留原始 payload 並進入明確復原流程，不得靜默重排、改部門或以範例資料覆蓋。
- 詳細 migration、失敗模式與驗收以 `ai-doc/specs/DEV-017-position-tree-department-groups.md` 為準。

