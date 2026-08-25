# ADR-002：版本工作區採清單與每版本獨立文件

狀態：Accepted  
日期：2026-08-16  
決策來源：`USER-2026-08-16-ORG-VERSION-WORKSPACE`、`USER-2026-08-16-RD-IMPLEMENTABLE`  
適用範圍：DEV-020 及後續組織版本、發布與回復功能

## Context

DEV-015／DEV-019 目前只保存一份 `data/orgmaster-document.v3.json`，App 的正式儲存與約 500ms 自動儲存都寫入同一來源；已排在 DEV-020 前的 DEV-021 會先把 canonical document 升為 V4。DEV-020 要讓現行版與多份草稿同時存在、各自自動儲存、可跨視窗同步並互相比較；若仍共用單一文件，任何寫入錯誤、損壞或競態都可能影響全部版本。

版本工作區還必須與 `OrgDocumentFile.version` 的資料格式版本分離。前者回答「這是哪一個組織方案」，後者回答「這份組織資料採哪個 schema」，不得用同一欄位或升版規則承擔兩種語意。DEV-020 不自行升降內層 document schema；它包覆實作開始時已由前置交付建立的 current schema，依目前排程預期為 DEV-021 的 V4。

## Options considered

1. 將現行版與全部草稿內嵌在單一大型 workspace JSON：讀寫簡單，但任一草稿更新都需覆寫整包資料；同時編輯不同草稿仍會互相衝突，單點損壞也會阻擋全部版本。
2. 以一份工作區清單保存版本關係，每個版本各自保存一份 current-schema 完整文件：版本隔離、個別 revision 與失敗範圍最清楚，但建立／封存版本需要處理清單與文件兩種寫入。
3. 只沿用瀏覽器 localStorage 或下載副本：改動較少，但不同瀏覽器視窗、備份、檔案追蹤與比較來源不可靠，也無法形成單一工作區。
4. 立即導入資料庫與後端服務：可支援交易與多人協作，但超出目前本機單使用者、無帳號與無部署的產品邊界。

## Decision

採 Option 2。

- 工作區清單固定保存於 `data/orgmaster-workspace.v1.json`，只保存版本 metadata、現行版指標與來源關係。
- 每個現行版或草稿各自保存於 `data/orgmaster-versions/<versionId>.json`，內容沿用實作當下的完整 `OrgDocumentFile` 與 current parser／validation；依執行前置條件預期為 V4。
- `OrgDirectoryState` 不新增 current、draft、name、revision、archive 或 comparison 欄位；版本生命週期維持在領域狀態外層。
- 工作區格式使用 `workspaceVersion: 1`；組織文件沿用 current `version`（預期為 4），兩者不得互相代替。未來 document schema 升版不得連帶改變使用者可見版本 ID 或 `workspaceVersion`。
- 工作區清單與版本文件使用內容 hash 形成 opaque revision。所有寫入在 server process 內序列化，並以 expected revision 做 compare-and-swap；revision 不符回傳 conflict，不得覆寫較新內容。
- 不同版本的文件 revision 相互獨立；草稿 A 的成功自動儲存不得改變現行版或草稿 B。
- 現行版在一般規劃模式唯讀；只有明確進入 `current-maintenance` 模式的寫入請求可更新現行版。
- 草稿第一版只提供可恢復封存／還原，不提供永久刪除，也不刪除版本文件。
- DEV-020 實作只可在 DEV-021 完成、V4 canonical reader／migration 已成為基準後進入 S1；工作區首次建立時呼叫該 current canonical reader，預期依 V4→V3→V2 順序正規化複製為現行版本；原始 V4／V3／V2 bytes 不覆寫、不刪除。
- 工作區清單存在但不合法時 fail closed，不得偷偷退回舊單文件；單一版本文件不合法時只阻擋該版本，清單、現行版與其他合法草稿仍可使用。

## Consequences

- DEV-020 必須新增 workspace domain、manifest parser、disk store、API client、版本選取與比較模組；重用前置交付完成後的 current document parser，且不由 DEV-020 再次升版。
- 版本建立採「先寫版本文件、驗證成功後再更新清單」；若清單更新失敗，未被引用的 orphan file 不得出現在 UI，也不得影響既有工作區。
- 版本切換必須先完成或明確阻擋目前版本的 pending save，再載入目標文件並清空只屬於舊版本的 Undo／redo history。
- 同一版本在兩個視窗同時編輯時，第二個以舊 revision 寫入者會收到 conflict；系統保留其本機畫面並提供重新載入或下載副本，不自動合併。
- 比較引擎直接讀取兩至五份合法 current-schema 狀態，差異依穩定 ID 計算，不以 React Flow 座標、畫面像素或 savedAt 判定。
- Future 發布可在不改變個別版本文件內容的前提下，新增現行版指標轉換與舊現行版封存；不得重新把所有版本合回單一文件。

## Migration / compatibility impact

- 新工作區不存在時，server 必須重用 DEV-021 完成後的 canonical reader；預期讀取順序為 V4，只有 V4 不存在才依既有規則 fallback V3／V2，較新來源存在但不合法時維持 fail closed。若 DEV-021 尚未完成，不得開始 DEV-020 S1 或先建立 V3 workspace。
- 遷移產生的現行版本 ID 由正規化文件內容 hash 決定，使中斷後重試不會持續製造不同的現行 ID。
- 工作區與版本文件全部成功寫入並重新讀回驗證後，才算遷移完成；任何失敗都保留原始 V4／V3／V2 與已寫入的可診斷檔案。
- `/api/orgmaster/document` 在工作區建立後只可讀取工作區現行文件供相容檢視；舊 PUT 回傳 conflict，避免舊視窗繼續覆寫 legacy canonical file 造成雙重權威來源。
- localStorage 的 V1／V2／V3／V4 相容與 recovery keys 不刪除；DEV-020 的 server workspace 不把它們靜默匯入為額外草稿。
- 詳細資料、API、失敗恢復與驗收以 `ai-doc/specs/DEV-020-organization-version-workspace.md` 為準。
