# DEV-032 第一份真實管理辦法原型證據

## 結論

- 原型主題：`MP-0001 人員增補管理程序`
- 狀態：`Minimal Reading-First Prototype Revised / Technical UI Re-QC Passed / Human Concept Accepted / Third Prototype Not Required`
- 性質：獨立 HTML 概念原型，不是 OrgMaster 正式產品實作；沒有新增 schema、API、持久化、權限或正式提供閱讀流程。
- 產品原則：AI 只在建立文件時依人類一次輸入產生初稿；一般文件頁不提供 `待確認`、AI 訪談、文件內 AI 編修、修改提案或差異。桌面只保留單一人工「編輯文件」入口，手機只讀。
- 原型入口：`index.html`

## 測試輸入與邊界

- 測試輸入：使用者提供的《人員增補管理程序》DOCX。
- 開發用副本 SHA-256：`f8da7c00ff89b0cc5c224af295afd44fbb802539a7dfa4d8a3ee5b6e50d6fa99`
- 結構檢查：69 個本文段落、0 個本文表格、2 個 inline shapes、1 個 section、3 張圖片；頁首另含文件標題、舊代碼與版次表格。
- 原 DOCX 沒有轉成產品內的來源追溯資料。原型只顯示新的 `MP-0001`；舊代碼、舊版次與原始檔名不進入資料模型或閱讀 UI。
- 因本機沒有 LibreOffice，Word COM 備援也未能啟動，本輪沒有完成原 DOCX 逐頁視覺 render；本文結構、頁首結構與三張圖片均已個別檢查。這不影響 HTML 原型 UI QC，但不能宣稱原 DOCX 版面已逐頁比對。

## 內容整理結果

- 保留自由多媒體正文：目的、適用範圍、權責、六階段流程、執行原則、紀錄、使用文件與兩張操作範例圖可在同一長文件閱讀。
- 僅把原文件重複的階段編號整理為連續六階段；未新增原文件沒有的核准、期限、控制或責任規則。
- 表格用於權責閱讀；圖片保留於正文。招募邀請信範例中的姓名與電話只在原型顯示層遮罩，僅驗證視覺概念，不是 production 個資保護。
- 未建立固定 14 章、Method Stage／Step、段落智能引用、自動職掌判斷或缺口生命週期。
- 原文件中的制度歧義沒有被 AI 補造答案；精簡版不再將歧義做成 `待確認` UI，由人類在一般編輯模式自行判斷與修正。

## 本版可操作範圍

| 測試情境 | 預期結果 | 本輪狀態 |
| --- | --- | --- |
| 桌面閱讀完整管理辦法 | 預設是乾淨長文件；沒有 `待確認`、AI 編修、提案、差異或 AI 整理說明 | 通過；`desktop-minimal-reading.png` |
| 從最小清單搜尋並開啟 | 可依代碼或標題找到文件，無結果時有明確空狀態 | 通過回歸 |
| 章節抽屜與圖片閱讀 | 可定位章節，圖片可開燈箱，不打斷正文流 | 通過回歸 |
| 桌面人工編輯 | 單一「編輯文件」進入整頁編輯；41 個正文目標可編輯，完成後可編輯節點回到 0 | 通過；`desktop-human-edit.png` |
| 按需職掌對照 | 只呈現人類可閱讀的來源；無資料時不產生一致／不一致判斷 | 通過空狀態回歸 |
| 390×844 手機閱讀 | 顯示「手機唯讀」，不存在編輯 mutation，`contenteditable` 為 0；水平差值為 -15px | 通過；`mobile-minimal-reading.png` |
| 瀏覽器 console | 0 errors、0 warnings | 通過 |

## 尚未通過的產品驗證

- 使用者已於 2026-08-25 確認精簡閱讀優先概念；正式實作仍須完成逐項計時、錯誤觀察與修正負擔紀錄的任務測試。
- AI 初稿、真正 autosave、working draft／readable snapshot、權限、media ingest、提供閱讀與資料外送仍是概念行為。
- 職掌對照只驗證「沒有資料時不得假判斷」；尚未使用 OrgMaster 真實職掌資料驗證同頁閱讀。
- 招募邀請信範例目前以 CSS 疊層遮罩，原始 prototype asset 仍包含來源內容；正式產品必須產生已遮蔽衍生 asset 或更換圖片。
- 不再製作第三份概念原型；不同表格／圖片情境轉為正式 RD／QA fixture，驗證 paste、media persistence、reload 與 snapshot。

## 瀏覽器條件與清理

- 預定 Chromium 桌面：1440×900
- 預定 Chromium 手機：390×844
- 本輪臨時 QA runtime、session、證據與清理結果記錄於上一層 `minimal-reading-runtime-record.md`。
