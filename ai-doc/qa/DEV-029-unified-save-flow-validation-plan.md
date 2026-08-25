# DEV-029 統一保存流程驗證計畫

狀態：QA Plan Ready  
日期：2026-08-21  
來源：`USER-2026-08-21-UNIFIED-SAVE-FLOW`

## 驗證目標

確認樹狀圖與執掌規劃台只剩一套 organization version 保存流程，且移除 plan lifecycle 後不破壞既有編輯、Undo／Redo、唯讀模式與響應式操作。

## 最小測試矩陣

| ID | 情境 | 預期結果 | 證據 |
| --- | --- | --- | --- |
| Q1 | 執掌拖放／異常修復完成一個操作 | 直接產生一個 organization state commit；無待套用狀態 | organization command unit test、browser DOM |
| Q2 | 執掌頁開啟儲存選單 | 與樹狀圖共用 `DocumentMenu`，顯示相同保存狀態、儲存與 Ctrl+S | browser DOM／screenshot |
| Q3 | 搜尋舊流程 UI 與 runtime route | 無預覽、確認套用、捨棄草案、待套用、已規劃；plan API 不掛載 | source scan、HTTP smoke |
| Q4 | current-view／compare | 保持唯讀且不出現新增或修復寫入入口 | browser DOM |
| Q5 | current-maintenance／draft-edit | 可編輯；新增、拖放、異常修復入口可用 | browser DOM／control enabled check |
| Q6 | 1440×900、1024×768、390×844 | 儲存入口可見、無頁面水平溢出；390 寬度仍可開啟新增表單 | screenshots、layout metrics |
| Q7 | 回歸與產物 | 全套 Vitest、TypeScript 與 production build 通過 | command output |
| Q8 | 可見錯誤巡檢 | 無 console error、page error 或失敗資源請求 | browser dev logs |

## 風險與停止條件

- 若任何 Duty 操作仍呼叫 `/api/orgmaster/duty-plans`、寫入 plan data file 或顯示第二套保存狀態，停止交付並回到 RD 修正。
- 若窄 viewport 的控制項存在但被 CSS `pointer-events` 或 disabled 阻擋，視為失敗。
- 若直接 commit 無法由既有 Undo 回復，視為保存流程尚未統一。
- 驗證不得刪除既有 `data/orgmaster-duty-plans.v1.json`；其內容只作保留資料，不納入 runtime。
