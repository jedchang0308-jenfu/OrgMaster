# 文件地圖

## 專案最高產品原則

- `Human Confirmed / 2026-08-23`：OrgMaster 手機版只提供完整唯讀閱讀、搜尋、篩選與關聯導覽，不提供或觸發建立、修改、刪除、排序、拖放、配置、移轉、核准、發布或其他 mutation。桌面／筆電仍依 workspace mode、version status、治理權限與 validation 決定能否編輯；手機唯讀不取代 server／domain 安全驗證。
- 本原則優先於 DEV-028／029／031 及其他既有文件中允許手機或窄 viewport 編輯的條款；既有截圖與測試只代表當時完成狀態。現行程式尚未依新原則收斂，由 `DEV-033` 追蹤，禁止把文件完成誤報為產品完成。
- 平板能力與全系統 deterministic mobile boundary 尚待 DEV-033 升級 `RD Contract Ready` 前確認；未確認事項不得解讀為手機可編輯。DEV-032 已採 module-scoped default-deny gate：至少 1024px、hover＋fine pointer 才開放管理辦法 mutation，其餘唯讀；不替代 DEV-033。

## Cold start

- 最新專案級待規劃交付：`DEV-033` 手機唯讀與桌面編輯的產品能力邊界，狀態為 `Brief Ready / Human Confirmed Principle / Implementation Pending`。權威 Brief：`ai-doc/dev_task.md#dev-033手機唯讀與桌面編輯的產品能力邊界`。下一步先確認平板能力及手機模式判定，再補跨模組 UI／command guard／QA-QC 契約；目前不得直接派 RD 實作。
- 最新完成交付：`DEV-032` 精簡自由管理辦法系統，狀態為 `RD Implementation Complete / QA-QC Passed / Human Confirmed Minimal Reading-First Current Phase / Two Concept Prototypes Accepted / Third Prototype Cancelled / Local Release Gate Pending`。
  - 第一版 AI 只在人類一次提供目標、事實或既有內容後產生自由多媒體初稿；一般文件頁不顯示 `待確認`、AI 訪談、AI 編修、差異提案或接受／拒絕。桌面只保留單一人工「編輯文件」入口，手機完全唯讀。
  - 產品只保留管理辦法清單與完整文件兩個主要表面；未編號建立輸入成功提交後才配置不可修改／重用的 `MP-xxxx`。資料不足不阻擋初稿，AI 不得反問或補造事實；原則型不強迫流程化，正文不建立智能引用或 Stage／Step，職掌只作按需同頁唯讀對照。
  - Current Phase 以 working draft＋零或一份 readable snapshot 推導三種閱讀狀態，並以五項概念能力區分閱讀、草稿、編輯、提供閱讀與 metadata；能力只套用整份 Management Method／snapshot，不做段落級權限、同篇多讀者版本或動態遮罩。混合敏感度內容須整份限制，或先移除機密內容再提供閱讀。
  - Google Docs 只允許單向貼上；表格、圖片與連結受保護，圖片須轉成持久 media asset 或明確失敗，敏感內容不可只靠 CSS 遮罩。手機再移除所有 mutation；這不是正式 ISO revision／approval lifecycle。
- DEV-032 PM Brief：`ai-doc/dev_task.md#dev-032精簡自由管理辦法系統`
- DEV-032 RD Implementation Contract：`ai-doc/specs/DEV-032-management-method-system.md`。正式方案固定 Tiptap 3 OSS、OpenAI Responses adapter、獨立 Management Method V1 store、自由 editor JSON、永久 `MP-xxxx`、working draft＋單一 readable snapshot、media、固定 API/CAS、DEV-027 catalog sync、scoped desktop capability、Duty read adapter 與 S0–S7；現有 `managementMethodPrototype.ts` 的固定 14 章／Stage／Step 不得作正式 schema。
- DEV-032 第一份真實原型：`output/dev032-ai-native-prototype/people-expansion-v1/manifest.md`。《人員增補管理程序》已轉為 `MP-0001` 自由長文件，保留權責表格與圖片；精簡版已移除全部 `待確認`、文件內 AI 編修及 AI 整理說明，只保留桌面「編輯文件」、章節導覽、按需職掌閱讀及手機唯讀。1440×900／390×844 技術重驗通過，使用者已確認概念方向。
- DEV-032 第二份真實原型：`output/dev032-ai-native-prototype/ai-mentor-principles-v1/manifest.md`。《鉦富 AI 導師使用指導書》已轉為 `MP-0002` 原則型長文件，保留原則、Prompt、策略方向與維護語意，不建立流程階段；來源機密細節未進入原型。精簡版已移除全部 `待確認` 與文件內 AI 編修，1440×900／390×844 技術重驗通過，使用者已確認概念方向。
- 第三份概念原型已取消；不同表格／圖片情境改為正式 QA fixture。S0→S7 本機實作、50 files／226 tests、build 與 1440×900／1024×768／390×844 browser QC 已完成，證據位於 `output/playwright/dev032/manifest.md`；真實公司資料送往 OpenAI、credential／額度、durable backend、deploy 與 release 仍須 release gate。舊 `output/playwright/dev032-prototype/manifest.md` 仍只證明被取代範圍。

- 歷史保存流程修訂（2026-08-21）：DEV-028／DEV-029 與 ADR-006 已以 `Intentional replacement` 統一為 organization version 單一路徑。樹狀圖、Duty CRUD、矩陣拖放與異常修復共用 `currentState`、Undo／Redo、500ms autosave、Ctrl+S 與 version CAS；plan toolbar／preview／apply／discard、600ms plan autosave、plan API／store runtime 已移除。當時「viewport 不額外限制編輯」的產品條款已於 2026-08-23 被 DEV-033 取代；保存契約與既有證據不變，手機唯讀的產品實作尚待 DEV-033。
- 最新介面收斂（2026-08-21）：移除顯示設定面板、快捷鍵說明入口與版本比較功能；版本工作區保留版本切換、建立草稿、維護、重新命名、封存與還原。
- 最新完成交付：`DEV-031` 同頁待處理來源欄與全職位展開式職掌編輯器，狀態為 `RD Implementation Complete / QA-QC Passed`。canonical `/duty-planning` 採最左側待處理分類來源＋右側全部 active 職位全展開；移除 selected-position editor、獨立矩陣／異常頁、責任 counts與逐item異常label，保留五個精確lane、原生桌面 draggable（Pointer fallback）、桌面密集右側 editor、跨職位 move／copy、edge auto-scroll、Undo與鍵盤／觸控替代操作。`/matrix`與`/anomalies`只作同composition alias；舊master-detail測試與`output/playwright/dev031/`為歷史證據；完成證據位於`output/playwright/dev031-revision/manifest.md`，本輪密集版面證據位於`output/playwright/dev031-compact-right/manifest.md`（36 files／205 tests、build、三 viewport Chromium與drag smoke），未部署或release。簡化後的 DEV-032 不再取代此工作檯；未來若要把責任配置移入組織圖，必須另立 DEV／phase contract。
- DEV-031 PM 摘要：`ai-doc/dev_task.md#dev-031同頁待處理來源欄與全職位展開式職掌編輯器`
- DEV-031 RD Implementation Contract：`ai-doc/specs/DEV-031-duty-master-detail-editor.md`

- 最新完成交付：`DEV-030` 異常職掌卡片精簡與點擊／長按互動，狀態為 `RD Implementation Complete / QA-QC Passed`
- DEV-030 PM 摘要：`ai-doc/dev_task.md#dev-030異常職掌卡片精簡與點擊長按互動`
- DEV-030 RD Implementation Contract：`ai-doc/specs/DEV-030-duty-anomaly-card-press-interaction.md`
- DEV-030 完成證據：已完成S1–S5與共用DutyCard後續修訂；固定450ms／6px Pointer state、click suppression、rAF hit-test、release revalidation、工作執掌明細入口；已移除卡片級配置入口、目標職位選擇與其 Popover，保留拖曳後必要的 move／copy 決策 Popover、檔案allowlist與五viewport gate。待處理職掌、矩陣、完整明細頁及職位側欄共用同一Duty identity surface，容器只注入placement／drag行為；工作台再以單一主分欄線與水平列線取代外框、圓角容器及常態卡片底色。完整39 files／209 tests、build與localhost:5000 browser QC通過；證據位於`output/playwright/dev-030/`，未部署或release。
- 最新完成交付：`DEV-029` 工作執掌責任配置工作台，狀態為 `RD Implementation Complete / QA-QC Passed / Human Confirmed`
- DEV-029 PM 摘要：`ai-doc/dev_task.md#dev-029工作執掌責任配置工作台`
- DEV-029 RD Implementation Contract：`ai-doc/specs/DEV-029-duty-allocation-workbench.md`
- DEV-029 Architecture Decision：沿用並以DEV-029 amendment修訂`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`
- DEV-029 執行邊界：`1C 2A 3A 4B 5A 6B 7C 8A 9B 10A`及後續「補到 RD 可實作」已完成；2026-08-20再依使用者要求把矩陣統整為三個可見責任欄、五個精確責任lane，既有資料與拖放語意不變。未部署或release。
- 前一完成交付：`DEV-028` 工作執掌責任關係與永久移轉，狀態為 `RD Implementation Complete / QA-QC Passed / Human Confirmed`
- DEV-028 PM 摘要：`ai-doc/dev_task.md#dev-028工作執掌責任關係與永久移轉`
- DEV-028 RD Handoff Contract：`ai-doc/specs/DEV-028-duty-responsibility-planning.md`
- DEV-028 Architecture Decision：`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`
- DEV-028 完成證據：S1→S5本地實作完成；`npm test -- --run`（35 files／187 tests）、`npm run build`、V5→V6／Duty／commands／projector／store／API測試、preview／atomic apply／plan removal與`/duty-planning`完整URL頁面之browser QC；證據位於`output/playwright/dev-028/`。可信登入principal、版本ACL、每人私有草稿、跨裝置及lease／接手依`56A`仍為Future Phase
- 最新完成交付：`DEV-027` OrgMaster 權限與審核治理中心，狀態為 `RD Implementation Complete / QA-QC Passed / OrgMaster Only`
- DEV-027 PM 摘要：`ai-doc/dev_task.md#dev-027orgmaster-權限與審核治理中心`
- DEV-027 RD Implementation Contract：`ai-doc/specs/DEV-027-orgmaster-access-approval-governance.md`
- DEV-027／DEV-032 相容修訂：DEV-032 已在既有 `orgmaster` catalog 新增六項管理辦法 permissions，並以 draft-only audited catalog sync 支援現有 V1 store；active published policy 不自動改變。此修訂已完成本機實作與治理測試，正式發布仍依 release gate，權威細節見 DEV-032 contract 第 10、18、19 節。
- DEV-027 Architecture Decisions：`ai-doc/adr/ADR-004-authorization-approval-policy-boundary.md`、`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`
- DEV-027 QA／QC Plan：`ai-doc/qa/DEV-027-governance-foundation-validation-plan.md`
- DEV-027 完成證據：`npm test -- --run`、`npm run build`、governance targeted 9/9、localhost API smoke、三 viewport browser QC 與 `output/playwright/dev-027/` 五項 artifacts；Phase 3 仍需另行授權與 integration ADR
- DEV-026 RD Implementation Contract：`ai-doc/specs/DEV-026-position-drag-interaction-stability.md`
- 最新完成交付：`ai-doc/dev_task.md#dev-026職位拖曳命中磁吸退出與渲染穩定性`
- DEV-026 完成證據：`output/playwright/dev-026/position-drag-1440x900.png`、`output/playwright/dev-026/position-drag-1024x768.png`、`output/playwright/dev-026/position-drag-390x844.png`
- DEV-025 RD Implementation Contract：`ai-doc/specs/DEV-025-organization-level-bands.md`
- DEV-025 Architecture Decision：`ai-doc/adr/ADR-003-organization-level-layout-authority.md`
- 前一已完成交付：`ai-doc/dev_task.md#dev-024右上角版本模式狀態顯示`
- DEV-021 RD Implementation Contract／完成證據：`ai-doc/specs/DEV-021-primary-role-administrative-approval-route.md`
- 最新完成 UI 交付：`ai-doc/dev_task.md#dev-024右上角版本模式狀態顯示`
- DEV-022 RD Implementation Contract：`ai-doc/specs/DEV-022-panel-dismissal-shortcut-consistency.md`
- DEV-020 完成證據：`ai-doc/dev_task.md#dev-020組織架構多草稿與版本比較`
- DEV-020 RD Implementation Contract：`ai-doc/specs/DEV-020-organization-version-workspace.md`
- DEV-020 Architecture Decision：`ai-doc/adr/ADR-002-version-workspace-storage-boundary.md`
- 最新完成交付：`ai-doc/dev_task.md#dev-019職務兼任風險視覺監控`
- DEV-019 RD Implementation Contract：`ai-doc/specs/DEV-019-dual-role-risk-visual-monitoring.md`
- DEV-017 RD Contract：`ai-doc/specs/DEV-017-position-tree-department-groups.md`
- DEV-017 Architecture Decision：`ai-doc/adr/ADR-001-position-hierarchy-authority.md`
- 本機啟動方式：`npm run dev:local`

## Active

- `DEV-033`（`Brief Ready / Human Confirmed Principle / Implementation Pending`）：專案最高原則固定手機只讀、桌面／筆電依既有治理條件編輯。手機保留完整資料閱讀、搜尋、篩選與關聯導覽，不呈現或觸發任何 mutation；deep link 進入編輯 route 仍須唯讀。此原則取代 DEV-028／029／031 的手機可編輯／窄版不唯讀條款，但不改寫其歷史完成證據。現行程式可能仍符合舊契約；平板與 deterministic mobile boundary 確認後才可升級 RD Contract，現階段未實作。權威 Brief：`ai-doc/dev_task.md#dev-033手機唯讀與桌面編輯的產品能力邊界`。

- `DEV-032`（`RD Implementation Complete / QA-QC Passed / Human Confirmed Minimal Reading-First Current Phase / Two Concept Prototypes Accepted / Third Prototype Cancelled / Local Release Gate Pending`）：
  - 第一版不是 AI-only；AI 只在人類一次提供目標、事實或既有內容後產生自由多媒體初稿。文件頁沒有 `待確認`、訪談、AI 編修、修改提案或差異，桌面只保留單一人工「編輯文件」入口；人類確認事實、制度選擇及是否提供公司閱讀。
  - Current Phase 只保留清單與完整文件表面；建立確認時配置永久 `MP-xxxx`，提供代碼／標題搜尋。文件不做智能引用、Stage／Step、固定14章、無範圍全文重寫或 AI 自動修改職掌；按需職掌對照以人類判斷為主。
  - working draft＋單一 readable snapshot 保護一般閱讀者；五項概念能力只套用整份文件／snapshot，不提供段落級權限或同篇多版本。混合一般與機密內容時，人類須整份限制、先移除機密內容，或維持建置中；手機一律移除 mutation。
  - 《人員增補管理程序》與《鉦富 AI 導師使用指導書》原型均已依閱讀優先決策移除全部 `待確認` 與文件內 AI 編修；桌面單一人工編輯、完成後零可編輯節點、手機零 mutation／零可編輯節點、無水平溢出及 console 0 error／0 warning 均通過，且兩份概念方向已獲使用者確認。
  - 第三份概念原型已取消；不同表格／圖片情境已改為正式 QA fixture。RD Implementation Contract 已完成 Tiptap 3 OSS、OpenAI Responses adapter、store/editor/media/API、DEV-027 permission sync、snapshot、Duty adapter、scoped mobile gate、repo files、migration/recovery 與 S0–S7；50 files／226 tests、build 及 browser QC 證據見 `output/playwright/dev032/manifest.md`。DEV-031 繼續作為現行職掌基線；正式資料外送與 production 仍須 release gate。權威 Brief：`ai-doc/dev_task.md#dev-032精簡自由管理辦法系統`，契約：`ai-doc/specs/DEV-032-management-method-system.md`。

- `DEV-031`（`RD Implementation Complete / QA-QC Passed`）：三個Duty planning routes呈現同一工作面；桌面由最左側待處理分類來源向右以原生 draggable（必要時 Pointer fallback）拖到任一全展開position section，成功後就地更新、不導頁。待處理依「無執行職位／缺少主執行／待重新分配」分組，分類文字只顯示一次；position與group不得顯示`執／審／協`或其他counts。右側所有符合條件active positions一次展開，空group省略、空position仍可drop；長文自然換行，桌面密集右側 editor、edge auto-scroll契約、exact lane、主執行固定move、其他relation move／copy、current-state release revalidation、Undo與keyboard／touch placement menu均保留。Current Phase不改domain、API、保存或權限；人工排序與跨類型轉換仍為Future Phase。完成證據：`output/playwright/dev031-revision/manifest.md`、`output/playwright/dev031-compact-right/manifest.md`；權威契約：`ai-doc/specs/DEV-031-duty-master-detail-editor.md`。DEV-032 已撤回 future replacement，故本項維持現行產品基線；任何組織圖責任配置改版須另立 DEV／phase contract。

- `DEV-030`（`RD Implementation Complete / QA-QC Passed`）：把右側異常職掌收斂為低噪音單一卡片表面；職掌名稱與異常Badge同列，刪除左側色條、drag handle、可見設定CTA、卡片配置按鈕、目標職位欄位與空白操作框。單擊開啟與職掌矩陣一致的工作執掌明細；異常卡與矩陣可編輯關係卡共用`DutyCardDragSurface`，兩者均使用滑鼠左鍵長按450ms；待套用主執行卡可替換同一來源intent。keyboard以Enter／Space開同一明細。只保留拖曳後必要的 move／copy 決策 Popover；頁首不再顯示頁面切換導覽列或多餘佔位區，但兩個完整 URL 明細頁仍可直接進入；矩陣搜尋／部門篩選移至頁首，矩陣區移除標題工具列與黃色唯讀提示；編輯模式「新增工作執掌」由頁首工具列承載；工作台外框、圓角容器與常態卡片底色已改為單一主分欄線及水平列線，保留Badge與互動暫態回饋；session union、ghost、rAF hit-test、release revalidation、failure recovery、required／forbidden files、S0–S5與五viewport gate均完成；39 files／209 tests、build與browser QC通過，未部署或release。

- `DEV-029`（`RD Implementation Complete / QA-QC Passed / Human Confirmed`）：`/duty-planning`為左右合併工作台，矩陣與異常頁為完整URL明細層。矩陣現為執行／審核／協作三個可見責任cell，底層仍保留五個精確lane；職位列依部門catalog分組，再依`parentPositionId`做主管在前的前序排列，平行職位沿用member order。拖放、移動／複製與異常修復直接更新目前organization state，並與樹狀圖共用Undo／Redo、500ms autosave、Ctrl+S、DocumentMenu與version CAS；plan V2、preview／apply、獨立plan API／store與窄版唯讀已由2026-08-21契約取代。未部署或release。

- `DEV-028`（`RD Implementation Complete / QA-QC Passed / Human Confirmed`）：協助總經理與主管規劃全員職掌；同一職掌為版本內共用資料，以職位為列依五種責任群組顯示及排序。職掌可在零個主執行時保存；無執行職位為高、缺少主執行為中、待重新分配為提醒，三者皆非阻擋，兩個以上主執行不得成立。中央表每項職掌永遠只占一列，異常欄顯示全部短標籤；詳細快照與修復控制移至不推擠主表的右側overlay drawer。2026-08-21起所有職掌編輯直接進入目前organization state，與樹狀圖共用Undo／Redo、單一dirty狀態、500ms autosave、Ctrl+S與version CAS；獨立草案、600ms autosave、preview／apply、plan API／store與窄版唯讀均已移除。既有plan資料檔只保留為歷史資料且不再讀寫。現階段仍不做職掌比較、獨立移轉紀錄、細粒度職掌權限、可信登入principal、版本ACL、真正跨裝置或lease／接手；未部署或release。

- `DEV-027`（`RD Implementation Complete / QA-QC Passed / OrgMaster Only`）：使用者已確認`1B 2A`；OrgMaster local governance Phase 1 Foundation→Phase 2 Policy MVP 已完成。治理資料獨立於organization V5，publish保存immutable organization snapshot；AI-PDM、production IAM／DB、cross-repo integration、deploy與release仍未授權。

- `DEV-026`（`RD Implementation Complete / QA-QC Passed`）：依使用者要求移除專用 position handle，改由卡片 pointer gesture／`nodeDragThreshold=6` 判定拖曳啟動；保留 candidate state、preview／exit／空白取消、drag-start geometry snapshot＋release strict revalidation、跨部門同 parent sibling regression，以及 node data／employees reference stability。21 files／148 tests、build 與 1440×900／1024×768／390×844 localhost:5000 browser QC 通過；未授權 deploy 或 release。

- `DEV-025`（`RD Implementation Complete / QA-QC Passed`）：已建立每組織版本獨立的層級主檔、逐職位指派、V5 migration 與可逆垂直層帶排版；`parentPositionId` 仍是唯一報告關係權威，`organizationLevelId` 只決定 Y 軸；同層卡片以層級線為共同起始基準，層間留白固定 20px，僅在水平範圍重疊時避讓。同一父職位的橫向 reporting edges 共用由父職位決定的 branch offset，個別下屬升降階不再改變幹線起點。21 files／151 tests、build 與 1440×900／1024×768／390×844 browser QC 通過；未授權 deploy 或 release。

- `DEV-024`（`RD Implementation Complete / QA-QC Passed`）：在右上角版本切換器旁顯示 `唯讀`、`可編輯`、`維護中` 與 `比較唯讀` 狀態；使用文字、色點、`role=status`、ARIA label、title 與手機響應式樣式傳達是否會寫入資料。19 files／126 tests、build 與 localhost:5000 三尺寸 browser QC 通過，未授權 deploy 或 release。

- `DEV-023`（`RD Implementation Complete / QA-QC Passed`）：取消組織圖選取職位後的 `Delete`／`Backspace` 直接刪除行為；保留右鍵選單與右側職位屬性的明確刪除入口。19 files／126 tests、build 與 localhost:5000 真實畫布操作驗證通過，未授權 deploy 或 release。

- `DEV-021`（`已調整完成／行政核准暫緩`）：每位員工保存最多一個主職，其他任職呈現為兼任／代理；依主職上級職位顯示唯讀直屬主管路徑。行政核准人、例外覆寫、請假申請、簽核交易、通知、Auth 與完整 `ReportingLine` 均暫不開發；既有 V4 欄位僅保留相容讀取。使用者已確認 `1B 2A 3A`，並於 2026-08-17 要求本輪撤下行政核准 UI；測試 20 files／129 tests、build 與 browser QC 已通過。
- `DEV-022`（`RD Implementation Complete / QA-QC Passed`）：統一左側主資料欄、右側屬性／細節欄與兼任風險欄的 dismiss button、`Escape` 逐層優先序、editor-first 保護、焦點回復與 primary panel responsive arbitration；新增共用元件與 pure resolver，不修改資料、Undo、儲存或 API。19 files／126 tests、targeted resolver 7／7、build 與 1440×900／1024×768／390×844 browser QC 通過，未授權 deploy 或 release。
- `DEV-020`（`RD Implementation Complete / QA-QC Passed`）：已把單一組織文件擴充為版本工作區，提供多草稿、獨立自動儲存、版本切換、現行版保護、多方案摘要與兩版本視覺差異；完成 S1–S4、workspace API／CAS、V4 migration 與 browser flow，19 files／126 tests、build 通過，未授權 deploy 或 release。
- `DEV-019`（`RD Implementation Complete / QA-QC Passed`）：規則採無方向 Role pair；系統比對同一員工目前有效任職，並在組織圖以非文字、非阻擋且不改變幾何的視覺效果標示相關職位。風險分為低／中／高三級，設定清單可保存每組規則的選填原因；V3 保存規則並由 V1／V2 fail-closed migration。鉦富機械現階段依 14 人規模採 10 條重大職務不相容規則（高 8／中 2），排除一般主管跨職能、跨部門協調與無最終放行權的自檢；未授權 deploy 或 release。
- `DEV-017`（`RD Implementation Complete / QA-QC Handoff`）：V1 正式組織圖以職位樹為主，每個非空部門只使用一個完整且不重疊的分組框；部門歸屬與職位上下級分開編輯，不建立複雜匯報模型。已完成 department-aware layout、V2 migration/recovery、原子 command、Inspector、group/render 與 68 項自動測試；未授權部署或 release。
- `DEV-018`（`完成`）：部門明確轉移後可執行刪除，保留職位上下級；部門刪除拒絕原因會在對話框顯示，且轉移後狀態可儲存與重新載入。
- `DEV-001`：組織架構圖畫布 MVP，包含混合方向自動排版、節點編輯、拖曳重排與快捷鍵。
- `DEV-002`：員工清單與多職指派，包含獨立員工資料、拖入／移動／解除指派與一人多職。
- `DEV-003`：職位右鍵選單與複製，包含常用動作、單一職位安全複製與選單 viewport 行為。
- `DEV-004`：三類主資料清單與獨立收合，包含員工／職位／部門清單、搜尋、摘要與清單列切換。
- `DEV-005`：三類主資料新增與安全刪除，包含關係防呆、可選轉移、未設定部門與 Undo/redo 原子操作。
- `DEV-006`：三類主資料編輯，包含預填表單、關聯改名與 Undo/redo。
- `DEV-007`：三清單新增、指派／定位、編輯與刪除入口收進右鍵選單。
- `DEV-013`：樹狀圖節點寬度縮至目前基準約 60%。
- `DEV-014`：移除樹狀圖節點內縱向／橫向下層關係圖示。
- `DEV-015`：組織圖本機文件操作，包含自動草稿、正式儲存、復原／重做、存副本與備份下載。
- `DEV-016`：部門刪除改為警示可執行；無替代部門時改為未設定部門，並可從編輯入口重新指定。
- `DEV-008`：員工、職位、部門資料模型收斂，包含部門階層、角色／職位拆分、員工多部門歸屬與任職有效期間；主管／直線匯報關係暫不建立。
- `DEV-009`：三清單 UI/UX 互動一致性，包含固定新增、可見 `⋯` 操作、共同選取狀態與鍵盤替代路徑。
- `DEV-010`：三清單唯一主檔與關聯細節層，主清單不重複展示跨主檔資料，關聯資訊移至右側細節。
- `DEV-011`：同一職位多人任職與任職細節層，採不限人數多人模式與 `activeAssignments` 完整任職展示。
- `DEV-012`：既有職位手動改部門，右側屬性與職位編輯對話框共用部門更新驗證，並保留原有任職資料。
