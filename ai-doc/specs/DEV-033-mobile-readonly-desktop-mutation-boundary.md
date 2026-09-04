# DEV-033 手機唯讀與桌面編輯能力邊界

狀態：`RD Implementation Complete / Automated Gate Passed / Browser QA-QC Passed / Local Release Gate Pending`

節點類型：交付點　優先級：P0

權威來源：`USER-2026-08-23-MOBILE-READ-ONLY-HIGHEST-PRINCIPLE`

## 1. 目標與不變量

OrgMaster 的手機與觸控窄版只提供完整閱讀、搜尋、篩選、版本切換、明細與關聯導覽；不得呈現或觸發任何資料 mutation。桌面／筆電仍由 workspace mode、version status、server/recovery、治理權限與既有 domain validation 共同決定是否可寫入。裝置能力是 UX boundary，不是 Auth、role 或 permission 的替代品。

所有實際寫入仍必須通過既有 server／domain authorization。任何隱藏入口、deep link、快捷鍵、殘留 handler、拖放或 submit path 都不得繞過能力判定。

## 2. Deterministic capability contract

`isDesktopMutationEnvironment(environment)` 為所有產品寫入 surface 的物理／runtime gate。只有下列條件同時成立才可能顯示或執行 mutation：

- `serverReady === true`
- `recoveryState !== 'blocked'`
- `viewportWidth >= 1024`
- `hoverCapable === true`
- `finePointer === true`
- `mobileReadOnly === false`

因此 390×844 手機、觸控窄版及 1023px 以下 viewport 一律唯讀；1024px 以上且具 hover＋fine pointer 的桌面保留既有編輯能力。平板採此保守 default-deny 邊界，不另建立第二套判定。

`resolveModuleCapability()` 仍另外檢查 workspace mode 與 domain capability；current-view、無權限、無效版本或 recovery 狀態不能因寬度足夠而寫入。

## 3. Surface 與 mutation owner

- 全域 chrome：版本切換、版本工作區、文件選單、搜尋與 workspace mode；手機可切換／閱讀／備份，但不顯示儲存、另存、建立、維護、重新命名、封存或還原。
- Organization：Inspector、Directory、OrgNode、職位／部門／員工 CRUD、任職與責任配置、排列、拖放、快捷鍵及 context menu 均共用 workspace mutation gate。
- Duty、Process、Management Method、Governance 與 Role Risk：由 App 傳入同一 capability；各 surface 不得自行以 CSS 或 viewport 判定可寫入。
- 版本工作區：建立草稿、現行版維護、重新命名、封存與還原只在 desktop mutation environment 顯示。
- 手機明細：保留完整職位、員工、部門、層級、職掌與關聯內容，改用文字值與清楚的「裝置唯讀」狀態，不以大量 disabled control 充當資訊架構。

## 4. 驗收契約

1. 390×844 正常入口與可編輯 deep link 均可閱讀，沒有水平溢出、遮擋、裁切或空白錯誤頁。
2. 手機不存在可見的新增、編輯、刪除、排序、拖曳、配置、移轉、核准、發布、儲存或版本管理 mutation control；搜尋、篩選、切換與明細導覽不改 dirty、history、autosave、revision、API 或 canonical data。
3. 桌面 1024×768 與 1440×900 在 `draft-edit` 仍顯示既有 editor、結構配置與儲存能力；寬度不單獨授權，仍受 workspace／domain gate 約束。
4. 唯讀狀態以文字／ARIA 可理解，不依賴顏色；drag source、collapse、pin、arrange、split、keyboard mutation 與 submit handler 均 fail closed 或不 render。
5. 任何 capability 在操作途中失效時，latest-state resolver 拒絕提交並保留未儲存內容，不產生假成功。

## 5. Implementation handoff 與 evidence

核心檔案：`src/workspace/capability.ts`、`src/App.tsx`、`src/components/Toolbar.tsx`、`src/components/VersionSwitcher.tsx`、`src/components/DocumentMenu.tsx`、`src/components/VersionWorkspacePanel.tsx`、`src/components/Inspector.tsx`、`src/components/DirectoryDock.tsx`、`src/components/OrgNode.tsx`、`src/components/PositionDutySection.tsx`。

自動化驗證：

- `npm test`：181 test files，749 passed，1 skipped（750 tests）。
- `npm run build`：client 與 server build 通過。
- `src/workspace/capability.test.ts`：desktop／1023／hover／fine pointer／mobile／recovery boundary 通過。
- 真實 Chromium 正常入口：`output/playwright/dev033/dev033-mobile-390x844.png`、`output/playwright/dev033/dev033-desktop-1440x900.png`；390×844 實測 mode=`current-view`、editor field／layout action／collapse 均不可見且 document width 等於 viewport，1440×900 實測 mode=`draft-edit` 且職位 editor 可見；fresh console error sweep 為 0。

## 6. Cross-spec 與 release boundary

本契約 supersede DEV-028、DEV-029、DEV-031 中允許手機／窄 viewport 編輯的歷史條款；不改寫那些 DEV 的 domain、保存、Undo、CAS 或歷史 evidence。DEV-039／041／042 既有局部唯讀規則改由本 deterministic gate 統一收斂。

本 DEV 只完成 local product implementation 與 evidence，不執行 production data、Auth、role、permission、migration、deploy 或 release。production 相關動作仍須另行進入 release gate。
