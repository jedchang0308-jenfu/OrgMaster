# DEV-039 Feature Parity Manifest

狀態：`Baseline Inventory Complete / S0～S6 Evidence Retained / S7 Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Committed / Merge Release Pending`

> **DEV-041 follow-on parity note（2026-09-01）**：DEV-041已達`RD Implementation Complete / Automated Gate Passed / Browser Native Evidence Pending`；S0～S7已把registered relation的mouse source由列尾把手intentional replacement為整個來源物件／卡片的非互動區域，並共用三態target與owner-canvas auto-pan。exact contract固定三個薄層、逐檔impact、failure recovery、targeted commands、fresh normal-entry evidence及dirty-worktree allowlist。此變更不得遺失DEV-039現有關係、readonly、Undo／Redo、autosave、CAS或keyboard相容能力；本清冊與DEV-039 evidence仍是回歸基線，不得取代DEV-041尚待QA／QC完成的native fresh pass。DEV-041 gate與狀態以主spec §0.1／§20為唯一來源。新契約見`ai-doc/specs/DEV-041-relation-drag-interaction-contract.md`。

> **2026-09-01 Candidate freeze commit override（現行）**：已依使用者授權 `DEV-039 candidate freeze 並 commit（僅納入 DEV-039 allowlist）` 完成 selective staging 與 commit `86510f4`（74 個 DEV-039 allowlist 檔案）。DEV-037／038／040、auth／DB／package／環境設定、混合未判定變更及 `output/playwright/dev039/**` 均排除；merge、deploy、release 不在本次授權範圍。

> **2026-09-01 Formal QA-QC 最新覆寫**：E1四個 minimum directions、E2五案`historyEvidence`與E3兩案已完成正式 QA-QC；targeted component `3 files／19 tests`、full regression `160 files／664 tests（1 skipped）`、typecheck、build、source scan、文件一致性與fixture／runtime cleanup均通過。E4僅等待使用者／PM明確授權，不代表commit、merge、deploy或release；下方較早的`QA-QC Reopened`／`Partial／Open`只作歷史 provenance。

適用 DEV：`DEV-039 可組合規劃桌面與跨面板關聯配置`

主工程契約：`ai-doc/specs/DEV-039-composable-planning-workspace.md`

架構決策：`ai-doc/adr/ADR-009-composable-workspace-shell-boundary.md`

盤點日期：`2026-09-01`

盤點分支／基準：`codex/dev-039-composable-workspace` / `86510f4`（candidate freeze commit）

文件成熟度影響（歷史摘要；現行狀態以第0.1～0.2節覆寫為準）：本清冊已完成DEV-039零遺失mapping、fresh `F039`整合證據及S5 removal allowlist closure，S0～S6證據維持歷史有效。S7已落地`relationPlacement.ts` pure session、App唯一協調器、typed effect／capability path、Employee／Duty／Process source／registered target接線、舊平行state移除、Process composition harness與B16 pure fixture transformer，並通過targeted tests、typecheck、full regression（160 files／664 tests，1 skipped）與build。E1四個 minimum directions、E2五案`historyEvidence`與E3兩案均具可採用 evidence並完成正式 QA-QC覆核；E4僅待使用者／PM明確授權，不代表immutable commit、正式auth、deploy或release已通過。

> **2026-09-01 E2 evidence 最新覆寫**：隔離 B16 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 以既有 runner 完成五案 E2＋兩案 E3，共 `7 passed`；五案均含 `historyEvidence` 行為性 Undo round-trip，E2 aggregate現為 `Pass（evidence）`。archive manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`；E1 paired strict native與正式 QA-QC已由後續 current override補齊，E4僅等待授權，不改 P／R／X disposition。

> **2026-09-01 E1 ProcessNode→Duty strict native 最新覆寫（單向歷史摘要）**：以全新隔離 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673`、task-owned `127.0.0.1:5080`、canonical `/`、`1280×720`、Chromium `149.0.0.0`執行一次性 evidence-only native pointer runner。`process-node-dev039-b16-open` → `duty-dev039-b16-new` 取得 `dragstart→dragenter／dragover→drop→dragend`，strict `application/x-orgmaster-entity` 在target dragenter／dragover／drop與source dragend可讀；UI顯示「已建立跨面板關係」，明確 `Control+S` 後API `200`、revision `4c3ce4dc...`→`0425c154...`、canonical link `process-duty-2`只一筆。artifact=`output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json`，archive manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`。僅將 `E1-PROC-DUT-NATIVE`標為`pass`；paired方向已由後續 current override補齊，四向 E1 aggregate與正式 QA-QC以最新 record為準；一次性runner已移除，不新增第二輸入路徑、resolver、MIME或第二證據清冊。reverse boundary完整欄位見第16.15.20～16.15.21節。

> **2026-09-01 E1 Duty→ProcessNode paired native runner boundary（歷史 provenance）**：全新隔離 B16 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`以既有 canonical入口與正常真實滑鼠路徑，從既有已連結職掌 `duty-dev039-b16-primary / primary-execute` 拖至 `process-node-dev039-b16-open`。可觀察 `dragstart／dragenter／dragover／dragend`及 strict `application/x-orgmaster-entity`，但未取得 terminal `drop`；UI未出現建立關係結果，API status=`200`且 revision／既有 link IDs 不變、未新增 canonical link。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`，archive manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`，5080已釋放、5000未觸碰。當時判定 `E1-DUT-PROC-NATIVE=blocked／not-run`；後續 strict pass與四向 aggregate見第16.15.21節，並已完成正式 QA-QC。完整欄位見第16.15.20節。

> **2026-09-01 E1 Duty→ProcessNode paired native strict pass 最新覆寫（優先於第16.15.20節）**：產品只將 `ProcessDutyBridge` responsibility lane source 的 HTML5 `effectAllowed` 由 `copy` 對齊既有 ProcessNode／target 的 `link`，未新增 MIME、resolver、Command、API、state、listener或第二輸入路徑。全新隔離 B16 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396`、task-owned `127.0.0.1:5080`、canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`、`1280×720`、Chromium `149.0.0.0`及 loopback dev identity，由 `duty-dev039-b16-primary / primary-execute` 拖至 `process-node-dev039-b16-open`，取得完整 `dragstart→dragenter／dragover→drop→dragend`、strict `application/x-orgmaster-entity`、`effectAllowed=link`／`dropEffect=link`、UI「已建立跨面板關係」、API status=`200`／revision變化與canonical `process-duty-2` readback；既有 `process-link-dev039-b16-linked-primary`保留。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`，archive manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`，5080已釋放、5000未觸碰。正式判定 `E1-DUT-PROC-NATIVE=pass`，四個 E1 minimum directions 均具備 strict evidence，E1 aggregate為`Pass（evidence）`；正式 QA-QC已覆核，E4僅等待使用者／PM明確授權，不宣稱已完成immutable commit。完整欄位見第16.15.21節。

## 0.1 Current closure snapshot（2026-09-01）

本清冊只用來索引 parity；交付判定以主spec第2.2節為準。現行結果如下：

| Closure | 狀態 | 清冊處置 |
| --- | --- | --- |
| RD implementation | `Ready`；P0／P1 readiness gap=`0` | 維持既有 single owner／resolver／Command／save path，不新增架構 |
| E1 native delivery | `Pass（evidence）` | 四個 minimum directions（Employee→Position、Duty→Position、ProcessNode→Duty、paired Duty→ProcessNode）均保留 strict native record；paired最新record見第16.15.21節。正式 QA-QC已覆核四筆逐案 record、artifact、cleanup與文件同版。 |
| E2 failure paths | `Pass（evidence）` | 五案新 browser record 均含 `historyEvidence` 行為性 Undo round-trip、zero-mutation與persistence／focus／listener欄位；正式 QA-QC已覆核，不新增debug API／第二history store。 |
| E3 lifecycle／warning | `Pass` | 正式 QA-QC已覆核既有record與artifact |
| E4 candidate freeze | `Candidate Freeze Committed` | commit=`86510f4`；74 個 allowlist 檔案已完成 selective staging；merge／deploy／release 另待授權 |
| E4 scope preflight | `Frozen` | commit 前已完成 `git status` 快照、allowlist 對照與 staged diff check；DEV-037／038／040、混合未判定變更及 `.gitignore` 的 `output/*` 證據均未納入 |

本 snapshot 不改任何 parity row 的 `P／R／X` disposition；不授權刪除舊功能、merge、deploy或release。E1四向與E2／E3均已具備可採用 evidence並完成正式 QA-QC；E4 candidate freeze 已由 commit `86510f4` 完成。

### 0.2 RD handoff index（2026-09-01）

下一輪只沿用主spec第2.4～2.4.1節的 `E4-CANDIDATE-FREEZE` 後續工作包；`QA-QC-REVIEW`與candidate commit已完成。E1 paired reverse已由第16.15.21節取得 strict pass，不需重做；第16.15.20節只作 blocked provenance。下一個 gate 是另行授權的 merge／release；`output/playwright/dev039/**` 受 `output/*` 忽略規則保護，不 force-add，portable evidence另走release artifact gate。

同日第二次 capability probe（窄修正前歷史 provenance）改用全新 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b`，在 source／target geometry可命中後，仍未取得產品原生事件序列或 strict MIME；API前後無 domain mutation，archive final manifest revision=`99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`。此筆只作 runner provenance；窄修正後的 ProcessNode→Duty 單方向 strict pass見第16.15.19節，paired strict pass見第16.15.21節，不再重試同類工具。

本輪另完成兩項產品窄修正：`ProcessNodeCard` relation source handle 加入`onMouseDownCapture`與`onPointerDownCapture` stopPropagation，避免 React Flow pane 的 d3 pan 先攔截 HTML5 drag promotion；App 將 placement begin／notice 延後一個 task，避免同步 React rerender提前觸發`dragend`。既有 strict MIME、registered resolver、Command與API boundary均不變。`ProcessPlanningWorkbench` targeted regression為`1 file／5 tests passed`，`tsc`與build通過；修正後以全新 B16 fixture取得 ProcessNode→Duty strict單方向 pass，paired方向已由第16.15.21節後續 record補齊。詳細由主spec第26.21.21～26.21.25節擁有。

本輪全量 `npm test -- --run --pool=forks --maxWorkers=1` 超過四分鐘無結果輸出後安全停止 task-owned Vitest process（歷史執行紀錄）；不覆蓋既有成功 `160 files／663 tests` 基線。現行正式回歸已完成為 `160 files／664 tests（1 skipped）`，詳見上方 current closure snapshot與evidence manifest。

Parity 只索引能力，不重複建立 record schema、resolver、mutation owner或第二份證據清冊；任何新增 dependency、MIME、API、schema、permission或fallback均先停回 PM。ProcessNode→Duty strict單方向 artifact見第16.15.19節；paired strict artifact見第16.15.21節；E1 aggregate現為`Pass（evidence）`，E4仍等待授權。

> **細部證據閱讀邊界（現行）**：第1節以下帶日期的 runner／QA／QC 段落，除非明確標示 current closure，均只保存歷史 provenance；其中較早的 `E1／E2／E3 Partial／Open` 或 `E4 Blocked` 不得覆寫第0.1～0.2節的現行判定。Parity row 的能力與 P／R／X disposition仍有效，但 E4 只等待使用者／PM明確授權，不因文件更新自動 commit、merge、deploy 或 release。

## 1. 目的與使用規則

現行 S7 E2 browser evidence 已包含五個 failure-path：`E2-INVALID`、`E2-COMMIT-REJECT`、`E2-CAPABILITY-LOSS`、`E2-409-RECOVERY`、`E2-UNLOAD`；五案已補 dirty／autosave、document keydown listener inventory、重新 editable、409/recovery與`historyEvidence`。最新七案 runner已證明每案以一次合法 mutation＋恰好一次Undo round-trip回到完整 canonical relation baseline，依主spec第2.3節 E2 aggregate為`Pass（evidence）`，並已完成正式 QA-QC覆核，不新增debug API／第二history store。

現行 E3 另有 full listener inventory exploratory record（主spec第26.21.15節、清冊第16.15.13節）：close／reveal／flow 的 React Flow portal target 計數增加，但 reload 後回到 `disconnected=0`；由於 test probe 會持有 DOM target，這筆只能作 provenance，不能直接宣稱產品 listener leak 或 closure。後續第16.15.14節的 strict raw-console assertion與第16.15.15節未注入 monkey-patch 的原生CDP listener record均已完成，現行 `E3-WARNING=pass`；E2 `historyEvidence`與E1四向 strict native亦已通過正式 QA-QC，第16.15.16節的 ProcessNode→Duty CUA observation僅為`Partial／Open`，不取代strict transport evidence。

本文件是 DEV-039 的「零功能遺失」替換清冊。它回答四件事：

1. 使用者目前從正常入口能做什麼。
2. 每項能力由哪一份資料、Command 或 API 擁有寫入權威。
3. 搬到可組合工作台後應出現在全域 chrome、Drawer、panel 或 panel-local surface 的哪一層。
4. 刪除舊 UI 前，必須補出什麼 DEV-039 新證據。

適用規則：

- `src/App.tsx` 的正常 route／entry wiring、目前可見 UI、active spec 及較新的 intentional replacement 決策共同決定基線；單獨存在但未接線的 component 不自動算現行功能。
- 舊 screenshot 或舊 DEV manifest 只證明歷史基線，不等同 DEV-039 新版已通過。
- 未列入本清冊、但由正常入口可達的既有功能，仍自動視為 `P`；文件遺漏不能作刪除理由。
- DEV-039 實作完成後，每一列都必須補上 `F039` fresh evidence，才能從 deletion gate 移除對應舊 surface。
- 本清冊只做 UI shell／entry／projection 的 parity；OrganizationDocument、Command、API、revision、autosave、permission 與 validation 不因換版重寫。

## 2. 標記與證據索引

### 2.1 Parity disposition

| 標記 | 意義 | 處理原則 |
| --- | --- | --- |
| `P` Preserve | 正常入口可達的現行能力 | 新版必須有等價可達 surface 與 fresh evidence |
| `R` Restore | active contract 要求、但目前正常入口接線不足 | 新版必須恢復並補針對性證據；不得藉換版刪除 |
| `X` Excluded | 已被較新決策明確退役、或只有未接線／被遮蔽的歷史原型 | 可進 removal allowlist，但需先證明無正常入口依賴 |

### 2.2 Baseline evidence

| 代碼 | 來源 | 判讀 |
| --- | --- | --- |
| `B-CODE` | 現行 source、tests、active spec | 可作能力與 authority 盤點，不代表 browser parity |
| `B032` | `output/playwright/dev032/manifest.md` | 正式管理辦法 list／document／edit／readable 基線，QA/QC complete |
| `B034` | `output/playwright/dev034/manifest.md` | 舊版與部分職掌配置證據；目前 R2 左側工作執掌入口仍需 fresh consolidation |
| `B036` | `output/playwright/dev036/manifest.md` | 責任盤點／責任分布，QA/QC passed |
| `B037` | `output/playwright/dev037/manifest.md` | 角色指派治理，QA/QC passed |
| `B038` | `output/playwright/dev038/manifest.md` | 流程規劃 MVP 與六 viewport；formal QA/QC pending |
| `B019` | `output/playwright/dev-019/` | 兼任風險 screenshots／tests，尚無統一 manifest |
| `B020` | `output/playwright/dev-020/` | 版本工作區歷史證據；版本比較已被後續決策退役 |
| `B-SAVE` | `output/playwright/unified-save-flow/manifest.md` | 統一儲存流程基線 |
| `F039` | `output/playwright/dev039/manifest.md` | DEV-039 S0～S6 normal-entry evidence與S7 relation／lifecycle evidence；B1～B9、三條typed relation的keyboard／command baseline、responsive/mobile、recovery、source removal、full regression及build索引均已建立；S7四向strict native、五案failure與兩案lifecycle／warning另由最新record及正式 QA-QC覆核 |

## 3. 正常入口、route 與目標 surface

| ID | 現行正常入口／route | 現行任務 | DEV-039 目標 | Disposition |
| --- | --- | --- | --- | --- |
| `S-GLOBAL` | `/` 頂部 Toolbar | 版本、文件、儲存、搜尋、mode、唯讀狀態 | 全域 chrome；不得塞入 module panel | `P` |
| `S-ORG` | `/` 預設 shell | 組織圖瀏覽、編輯、Inspector、assignment | 頂部直接加入／聚焦 `organization` panel；預設唯一開啟 | `P` |
| `S-EMP` | `/` 左側 `員工` | 員工清單、明細、CRUD、任職 | `employees` Drawer＋單一 panel | `P` |
| `S-POS` | `/` 左側 `職位` | 職位清單、明細、CRUD、階層 | `positions` Drawer＋單一 panel | `P` |
| `S-DEP` | `/` 左側 `部門` | 部門清單、明細、CRUD、轉移刪除 | `departments` Drawer＋單一 panel | `P` |
| `S-LVL` | `/` 左側 `層級` | 層級新增、改名、排序、刪除 | `levels` Drawer＋單一 panel | `P` |
| `S-DUT` | `/` 左側 `職掌`；`/?mode=duty-config&...` | Duty 清單、明細、責任 lane、組織圖配置 | `duties` Drawer＋單一 panel；不可保留 hidden-only config route | `P` |
| `S-DWB` | `/duty-planning?view=audit\|distribution` | 責任盤點、責任分布 | `duties` panel 內兩個既有 view；route 可作 recovery alias | `P` |
| `S-PROC` | `/process-planning?view=mindmap\|flow&...` | 流程清單、心智圖、流程圖、Duty bridge | `processes` Drawer＋單一 panel | `P` |
| `S-MM` | `/management-methods`；`/management-methods/:id?view=...` | 管理辦法清單、文件閱讀／編輯 | `management-methods` Drawer＋單一完整編輯／閱讀 panel | `P` |
| `S-RISK` | `/` 頂部盾牌入口 | 兼任風險規則與組織圖 overlay | 頂部直接加入／聚焦 `role-risks` panel | `P` |
| `S-GOV` | `/` 頂部治理入口 | 角色、指派、代理、版本、稽核、檢查 | 頂部直接加入／聚焦 `governance` panel | `P` |
| `S-VERSION` | `/` VersionSwitcher／VersionWorkspacePanel | 版本切換與維護 | 全域 chrome＋全域 workspace Drawer | `P` |
| `S-RECOVERY` | active version/document contract | 無效／缺少 current document 的復原 gate | 全域阻斷式 recovery surface | `R` |

### 3.1 Repo source anchors

| 能力群 | 目前主要source | DEV-039重用／adapter原則 |
| --- | --- | --- |
| App shell／route／keyboard／save owner | `src/App.tsx` | 拆出workspace shell時不可建立第二份current state、history或save owner |
| Global chrome | `src/components/Toolbar.tsx`、`VersionSwitcher.tsx`、`VersionWorkspacePanel.tsx`、`DocumentMenu.tsx` | 保持全域，不為了panel一致性轉成module instance |
| Directory／details／dialogs／menus | `DirectoryDock.tsx`、`DirectoryDetailPanel.tsx`、`DirectoryDialogs.tsx`、`DirectoryContextMenu.tsx` | 把目前kind-specific projection包成Drawer/panel adapter；不得複製CRUD |
| Organization canvas | `OrgNode.tsx`及`App.tsx`內React Flow composition | 保留canonical nodes／edges projection、assignment drag與Inspector owner |
| Organization domain | `organizationCommands.ts`、`assignments.ts` | panel只呼叫現有Command/helper；invalid/noop語意不改 |
| Duty | `DutyCenter.tsx`、`DutyPlanningWorkbench.tsx`、`DutyPlanningView.tsx`、`organizationCommands.ts` | 清單、四lane、唯讀雙視角共用Duty與relation authority |
| Process | `ProcessPlanningWorkbench.tsx`、`ProcessPlanningCanvas.tsx`、`organizationCommands.ts` | 固定composition已由workspace取代；canvas、selector、Command與V7資料保留 |
| Management methods | `components/managementMethods/*` | 正式list/document/editor/API保留；不以`ManagementMethodPrototype`當新panel基底 |
| Role combination risk | `RoleCombinationRiskPanel.tsx`及既有risk helpers | 規則CRUD與derived overlay共用同一canonical rule資料 |
| Governance | `GovernanceCenter.tsx`、`governance/commands.ts`、governance API | 保留current center能力與server authority；不復活未接線standalone Simulator |
| Document recovery | `WorkspaceRecoveryGate.tsx`、`workspace/hydration.ts`、`App.tsx` bootstrap | 已由單一全域阻斷式gate接管；index／workspace／version／conflict依typed hydration state fail closed，舊`DocumentRecoveryDialog`已移除 |

### 3.2 Capability registry

| Capability ID | 現行判定 | 可讀／可寫語意 | DEV-039 adapter要求 |
| --- | --- | --- | --- |
| `CAP-ORG` | workspace editing mode、server ready、非recovery及domain validation | 組織圖與主資料可讀；合法狀態才可寫 | 所有organization panels共用單一判定，不各自猜測editable |
| `CAP-DUTY` | `canMutateDutyConfiguration`：editing、server ready、非recovery、非mobile、`>=1024px`、hover＋fine pointer | 不符合時Duty仍可讀，但不能配置 | Drawer與panel顯示相同read-only原因；server仍驗證 |
| `CAP-DUTY-WB` | Duty Planning Workbench目前唯讀 | Audit／Distribution永不直接mutation | 配置動作聚焦Duty＋organization panel，不在表格旁路寫入 |
| `CAP-PROCESS` | `canMutateProcessPlanning`：與Duty桌面gate同類 | 心智圖／流程圖可讀；合法桌面才可寫 | panel化不可因viewport位於dock內而錯判成mobile；使用window/device capability |
| `CAP-MM` | session capabilities分別控制create、readDraft、editDraft、manageMetadata、manageReadable，另有desktop device gate | 每個動作可獨立允許／拒絕 | 不可用單一`editable`布林覆蓋細粒度權限 |
| `CAP-RISK` | `organizationEditingEnabled`；唯讀仍可看規則與overlay | rule mutation需組織編輯權 | risk panel只接canonical mode，不自行切換工作區 |
| `CAP-GOV` | `session.manage && !mobileReadOnly && externalCatalogValid`，發布另有blocker | catalog/check可讀；assignment/delegation/version依權限寫 | stale catalog必須fail closed，不能因panel已載入就放行 |
| `CAP-MOBILE` | 專案最高原則：手機全部mutation default deny | 僅閱讀、搜尋、篩選、關聯導覽 | UI隱藏與server/domain拒絕都要有；不可只靠CSS |

Employee CRUD、部分Department CRUD目前仍由`commitState`／directory helper擁有，不全部經`OrganizationCommand` union；DEV-039只可重用其現行owner，不得假裝已統一或另建第二條mutation。若要把這些寫入正式Command，必須另列重構範圍、migration與regression，不可混入UI搬移而無證據。

### 3.3 共用清單／明細排列證據

| ID | 適用surface | 幾何契約 | 目前狀態 |
| --- | --- | --- | --- |
| `LAYOUT-ADJ-01` | `MasterDataModuleAdapter`（員工、職位、部門；層級為單欄例外） | 清單從panel左緣開始；桌面／窄桌面清單欄`242px`、`690px`以下`190px`；明細以正常文件流緊接右側，不因全域Inspector窄版定位規則覆蓋清單 | `RD Implemented / Browser QC Passed`（`F039-QC-05`、`F039-QC-06`） |
| `LAYOUT-SEP-01` | 共用workspace shell與panel structure | chrome、Drawer／工作區、清單／明細、region tab與split separator使用共用藍色token；卡片、表格與表單內部分隔維持中性 | `RD Implemented / Browser QC Passed`（`F039-QC-07`、`F039-QC-08`） |
| `LAYOUT-DIRECT-01` | 直接型`role-risks` panel | 單獨開啟或作為同region tab時，panel以正常文件流填滿region；不可被舊版固定右側overlay、寬度上限或陰影覆蓋 | `RD Implemented / Browser QC Passed`（`F039-QC-10`） |
| `LAYOUT-RESIZE-01` | 桌面workspace split separator | primary pointer取得capture；React rerender後仍以目前父split幾何連續更新ratio；up／cancel釋放，鍵盤方向鍵契約不變 | `RD Implemented / Browser QC Passed`（`F039-QC-11`） |
| `LAYOUT-OWNERSHIP-01` | `DutyModuleAdapter` configuration surface | 工作職掌明細與清單必須由同一panel擁有並相鄰；外層移動、分割或tab切換不得把明細掛入組織架構或其他module | `RD Implemented / Browser QC Passed`（`F039-QC-12`） |
| `LAYOUT-OWNERSHIP-02` | 十module persistent list／canvas／document／settings／detail／editor | 每個persistent surface的最近`data-module`只能是owner；四region與tab中DOM唯一且bounding box不越界 | `S6 Implemented / QA-QC Passed`（owner geometry、Duty／Management Method／Role Risk browser re-QC） |
| `OVERLAY-SCOPE-01` | Duty、Management Method及共用workspace transient surfaces | panel transient只進`PanelOverlayHost`；global blocking／toast／drag preview只進`GlobalOverlayHost`；feature無raw body portal或persistent fixed定位 | `S6 Implemented / QA-QC Passed`（typed host、source policy、B15 focus／geometry baseline） |
| `STATE-OWNERSHIP-01` | Organization／master data／Duty selection與detail | panel-local detail state只有一個owner；shared selection只傳stable ref／revision，不控制跨module Inspector mount | `S6 Implemented / QA-QC Passed`（owner factory、DOM count、Duty view regression） |
| `CONTAINER-RESPONSIVE-01` | 全module panel內排版與workspace capability | container只控制排版；桌面窄panel不誤判mobile，1023／390仍由workspace environment default-deny mutation | `S6 Implemented / QA-QC Passed`（CSS policy、1024／1023／390 baseline） |

此規則只約束同一panel內的兩欄資料投影；workspace外層仍由split／tab engine管理。Process的三欄流程清單、圖形與Duty bridge不屬此兩欄形狀，但同樣必須維持由左至右且不得插入無意義空白欄。

## 4. 全域 chrome 與工作區生命週期

| ID | 現行可見操作／結果 | Keyboard／focus | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `G-01` | 切換組織版本；開啟版本工作區 | 原生 select；關閉後回入口 | failed version不可選作可編輯來源 | workspace/version API | 保留頂部 VersionSwitcher | `P / B020 → F039` |
| `G-02` | 建立 active version 的草稿、選版、維護 current、草稿改名、封存、還原 | Drawer focus order／Escape | 權限、版本狀態、唯讀 | VersionWorkspacePanel＋workspace API | 保留全域版本 Drawer，不做 module panel | `P / B020+B-CODE → F039` |
| `G-03` | `儲存`、`另存`、`備份`與 dirty／autosave feedback | `Ctrl/Cmd+S`、`Ctrl/Cmd+Shift+S` | server ready、editing、recovery、CAS | DocumentMenu＋workspace API | 保留頂部文件選單與既有 failure feedback | `P / B-SAVE → F039` |
| `G-04` | 全域搜尋職位或姓名、分組結果、選取後定位 | `/` 聚焦；Enter首項；Escape關閉／blur | 最多顯示現行結果數；唯讀仍可搜尋 | OrganizationDocument selector | 保留頂部全域搜尋；panel selection吃 stable ID | `P / B-CODE → F039` |
| `G-05` | 現行版／編修中／唯讀 mode 顯示與切換 | focus return | draft/current status、權限、mobile read-only | workspace mode authority | 保留全域 mode pill；panel不得自行升權 | `P / B-CODE → F039` |
| `G-06` | Undo／redo 所有已納入 history 的組織命令 | `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl/Cmd+Y` | 只在 editing；invalid command不入history | canonical history | 保留全域快捷鍵；panel mutation共用 | `P / B-CODE → F039` |
| `G-07` | Fit organization view | `Ctrl/Cmd+0` | 組織圖panel存在時作用 | React Flow projection | 聚焦／fit 已開啟 organization panel，不新增instance | `P / B-CODE → F039` |
| `G-08` | 分層 Escape 關閉治理、menu、dialog、風險、Inspector、Directory | `Escape` priority | 不得越級關閉或漏掉未保存 surface | App focus/dismiss owner | 建立 workspace-wide dismiss priority並保留focus return | `P / B-CODE → F039` |
| `G-09` | autosave、reload、跨視窗 revision同步、409/CAS回饋 | 無 | editing、server ready、revision conflict | workspace API＋canonical document | panel layout不可進domain save；domain保存原樣保留 | `P / B-SAVE+B038 → F039` |
| `G-10` | current document無效或缺失時阻止mutation並引導復原 | 全域阻斷 | `WorkspaceRecoveryGate`與hydration capability intersection已接線；legacy `recoveryOpen=false`假狀態已移除；409與document failure由既有DEV-020 regression承接 | workspace bootstrap/recovery API | index unavailable fresh browser證明零workspace／零mutation與Retry；invalid current／failed draft／409保留既有API negative及automated evidence | `R / F039-B6 + full regression` |
| `G-11` | 手機完整唯讀閱讀、搜尋、篩選與導覽；無mutation | touch／screen reader | mobile 永遠唯讀 | capability gate＋server validation | workspace可退化成唯讀單panel／module route，不顯示排版拖曳 | `P / 各模組mobile baseline → F039` |

## 5. 組織圖與主資料 Directory

### 5.1 組織架構圖

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `ORG-01` | React Flow 組織圖、部門群組、層級線、pan／zoom／fit；節點多時顯示 MiniMap | mouse/touchpad；`Ctrl/Cmd+0` | loading／empty／read-only | OrganizationDocument projection | organization panel完整重用投影；依主契約第25.2節隔離React Flow provider並由active panel接收canvas focus | `P / B-CODE → F039` |
| `ORG-02` | 點選 Position、開 Inspector、雙擊可編輯、畫布清除選取 | Enter／Space／double click | writable才可編輯 | Position selector＋Command | shared selection與panel-local selection都使用 Position ID | `P / B-CODE → F039` |
| `ORG-03` | 新增下屬、新增同階、複製、編輯、刪除 | `Tab`、`Enter`、`F2/Space`；context menu | delete需明確menu／Inspector，畫布 Delete/Backspace不得刪 | Position Commands | panel內保留全部入口與安全刪除 | `P / B-CODE → F039` |
| `ORG-04` | 職位上下排序與子節點水平／垂直 layout | `Alt+↑/↓`、`Alt+V/H` | editing＋validation | `REORDER_POSITION`、`SET_ORGANIZATION_LAYOUT` | 保留，且不得與panel layout drag混淆 | `P / B-CODE → F039` |
| `ORG-05` | Position Inspector 編輯 title、role、department、parent、level、多任職、child axis | keyboard form | writable；invalid relation fail closed | `PATCH_POSITION`等 | panel-local Inspector，非第三層module navigation | `P / B-CODE → F039` |
| `ORG-06` | Position卡顯示員工、主／兼職記號、Duty/Risk必要投影；可展開／收合子樹 | click／keyboard | 唯讀可看 | canonical projection | 保留低噪音節點；其他panel shared highlight不能塞爆卡片 | `P / B-CODE+B019 → F039` |
| `ORG-07` | 空組織圖建立根職位；部門群組可開部門明細 | button／click | writable才建立 | Position/Department authority | 空panel狀態與現行結果等價 | `P / B-CODE → F039` |

### 5.2 員工

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `EMP-01` | 搜尋姓名、部門及未設定部門；清單／空白結果 | 輸入；Enter/Space選取 | read-only仍可查 | selector | Drawer與panel共用query mapper | `P / B-CODE → F039` |
| `EMP-02` | 新增、編輯、刪除員工與安全確認 | `F2`、`Delete`、context menu | writable；刪除解除任職 | employee directory mutation owner | panel完整CRUD；Drawer只快速選取／摘要 | `P / B-CODE → F039` |
| `EMP-03` | 員工明細顯示部門、任職，設定主職、導向職位／部門 | keyboard form/navigation | read/write依動作 | assignment helpers | panel-local detail；promotion攜帶 Employee ID | `P / B-CODE → F039` |
| `EMP-04` | 員工從Directory拖到Position建立任職 | native drag＋keyboard替代須保留 | assignment validation、唯讀拒絕 | assignment helper/history | typed registry `employee→position` | `P / B-CODE → F039 baseline；S7 B16 native／keyboard partial` |
| `EMP-05` | 員工從OrgNode拖到另一Position移轉；放到畫布解除任職 | native drag；cancel | primary/multiple assignment rules | assignment helper/history | 同一typed session處理 assign/move/unassign | `P / B-CODE → F039 baseline；S7 B16 noop／cancel／reload partial，移轉／解除 native pending` |

### 5.3 職位

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `POS-01` | 搜尋職稱、員工、部門；依部門／層級分組 | 輸入；Enter/Space選取 | read-only可查 | selector | Drawer＋panel共用query與stable selection | `P / B-CODE → F039` |
| `POS-02` | 新增、複製、編輯、刪除；選取後定位組織圖 | `Enter`、`Tab`、`F2`、context menu | writable；branch delete確認 | Position Commands | panel完整操作；Drawer最小快速入口 | `P / B-CODE → F039` |
| `POS-03` | Position明細顯示部門、層級、上級、任職與Duty關係 | keyboard navigation | 唯讀可看 | selectors | shared selection定位 organization/duty panels | `P / B-CODE → F039` |
| `POS-04` | 接收Employee與Duty typed drop並顯示合法／非法目標 | native＋keyboard | capability、duplicate/noop、validation | registered command owners | Position target adapter只呼叫既有authority | `P / B-CODE+B034 → F039 baseline；S7 B16 Employee／Duty native partial` |

### 5.4 部門

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `DEP-01` | 密集部門清單與階層；目前刻意不顯示搜尋框 | Enter/Space選取 | read-only可看 | selector | Drawer沿用無搜尋設計；不得擅自復活已刪UI | `P / B-CODE → F039` |
| `DEP-02` | 新增、編輯、刪除部門 | `F2`、`Delete`、context menu | writable；名稱驗證 | department mutation＋`DELETE_DEPARTMENT` | panel完整CRUD | `P / B-CODE → F039` |
| `DEP-03` | 刪除前顯示員工／職位影響，可選替代部門；無替代可進未設定 | dialog keyboard | 明確確認；fail closed並顯示原因 | `DELETE_DEPARTMENT` | panel內保留安全dialog與error feedback | `P / B-CODE → F039` |
| `DEP-04` | 部門明細連結員工與職位 | keyboard navigation | 唯讀可看 | selectors | shared Department ID＋跨panel reveal | `P / B-CODE → F039` |

### 5.5 組織層級

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `LVL-01` | 新增層級、inline改名 | Enter儲存、Escape取消、blur儲存 | writable；名稱驗證 | level Commands | panel完整編輯；Drawer只選取 | `P / B-CODE → F039` |
| `LVL-02` | 預覽上移／下移、取消／套用排序 | menu＋button | writable；非法排序拒絕 | `REORDER_ORGANIZATION_LEVELS` | panel內保留preview transaction | `P / B-CODE → F039` |
| `LVL-03` | 刪除未使用層級；使用中拒絕並回饋 | context menu／dialog | relationship validation | `DELETE_ORGANIZATION_LEVEL` | 保留 fail-closed 回饋 | `P / B-CODE → F039` |

## 6. 工作職掌與責任視角

### 6.1 Duty 清單、明細與配置

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `DUT-01` | 密集Duty清單、搜尋、新增、展開／收合單一Duty | Enter/Space；chevron | read-only可查；create需writable | `CREATE_DUTY` | Duty Drawer保留清單；點名稱開最小明細，按鈕控制展開 | `P / B-CODE+B034(partial) → F039` |
| `DUT-02` | 明細編輯名稱／說明、刪除Duty | form；明確delete | writable；關聯完整性驗證 | `PATCH_DUTY`、`DELETE_DUTY` | Duty panel完整編輯，Drawer不承擔長內容 | `P / B-CODE → F039` |
| `DUT-03` | 四責任語意：主執行、協作、審核、會簽；協作沿用非主執行relation | lane selection | 不再顯示「其他執行」獨立入口 | Duty relation model | 保持四個使用者語意，不新增第二層「其他執行」 | `P / B-CODE → F039` |
| `DUT-04` | 選Duty→選責任lane→拖到Position配置 | native drag | desktop fine pointer、editing、server ready | `UPSERT_DUTY_RELATION`等 | typed registry `duty+lane→position` | `P / B034(partial)+B038 → F039 baseline；S7 B16 native主執行 partial` |
| `DUT-05` | keyboard grab後Tab循環Position、Enter/Space drop、Escape取消，live status | keyboard | 與native同validation | same command owner | 新workspace不得只保留滑鼠拖曳 | `P / B-CODE+B038 → F039 baseline；S7 B16 keyboard／Escape partial` |
| `DUT-06` | Position明細顯示四類Duty relation，可移除、排序、移轉主執行 | keyboard/button | writable＋duplicate/noop/primary rules | relation Commands | Duty與Position panel雙向投影同一relation | `P / B-CODE → F039` |
| `DUT-07` | 被刪Position的relation保留「待重新分配」快照並可重新配置 | button／drag | invalid target拒絕；不自動猜人 | `COMMIT_DUTY_PLANNING_CHANGE`等 | Duty panel集中呈現且可導向組織圖 | `P / B034 → F039` |
| `DUT-08` | Duty詳細Drawer可從矩陣、流程、管理辦法等投影開啟 | Enter/click；Escape | 唯讀可看 | Duty selector | 統一為panel-local detail contract，避免多套內容 | `P / B032+B036+B038 → F039` |

### 6.2 責任盤點與責任分布

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `DWB-01` | `責任盤點`表：搜尋Duty；複選無執行職位、缺少主執行、待重新分配，status OR＋search AND | form controls | 唯讀；empty/no-match states | selectors | Duty panel保留tab與URL-restorable local filters | `P / B036 → F039` |
| `DWB-02` | Duty名稱開唯讀明細；可回組織圖進配置 | click/Enter | 無mutation | route/shared selection | 改成聚焦Duty＋organization panels，不隱藏完整配置入口 | `P / B036 → F039` |
| `DWB-03` | `責任分布`表：搜尋Position／Department，顯示四責任數量且零值可見 | form controls | 唯讀；empty/no-match | selectors | Duty panel第二tab；保留全量掃描能力 | `P / B036 → F039` |

## 7. 流程規劃

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `PRC-01` | 流程清單、選取、建立、空白狀態建立入口、改名、刪除空流程 | keyboard/click | create/edit需capability | Process Commands | Process Drawer清單＋panel完整編輯 | `P / B038 → F039` |
| `PRC-02` | 心智圖 view：root／child／sibling建立、改名、排序、reparent、leaf刪除 | pointer＋keyboard | leaf delete、graph validation | Process node Commands | Process panel `mindmap` view原樣保留 | `P / B038 → F039` |
| `PRC-03` | 流程圖 view：建立／刪除edge，節點選取與定位 | pointer＋keyboard | cycle／invalid edge拒絕 | Process edge Commands | Process panel `flow` view原樣保留 | `P / B038 → F039` |
| `PRC-04` | ProcessNode連結既有Duty、解除Duty | click/select | duplicate/noop拒絕 | `LINK/UNLINK_PROCESS_NODE_DUTY` | typed relation projection共用stable IDs | `P / B038 → F039` |
| `PRC-05` | 在ProcessNode建立新Duty並立即連結 | form/button | transaction validation | `CREATE_DUTY_AND_LINK_PROCESS_NODE` | 保持單一transaction，不建立panel-local Duty | `P / B038 → F039` |
| `PRC-06` | Duty＋lane拖到Position；native與keyboard配置 | drag/keyboard | same Duty capability | existing Duty relation Commands | 與Duty panel共用typed registry | `P / B038 → F039 baseline；S7 minimum native directions與keyboard對照已由最新 evidence／QA-QC覆核` |
| `PRC-07` | 流程、Duty、Position三向shared highlight；寬版組織投影、窄版Position fallback | click/keyboard | narrow/mobile read-only | selectors | shared selection取代專屬composition耦合 | `P / B038 → F039` |
| `PRC-08` | route保存view/process/node/duty context與reload persistence | browser history | invalid ID安全回復 | route adapter＋V7 autosave | 依主契約第8、23節由legacy parser產生promotion intent，再正規化為canonical workspace URL | `P / B038 → F039` |

## 8. 管理辦法

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `MM-01` | 管理辦法清單、依代碼／標題搜尋、loading／empty／error＋retry | form/keyboard | session capability | management-method API | Drawer快速清單＋panel清單／文件 | `P / B032 → F039` |
| `MM-02` | 依title／goal／facts／rules／existing content建立AI初稿 | dialog keyboard | create capability、busy/error | create API | panel內建立流程；不復活AI訪談 | `P / B032 → F039` |
| `MM-03` | 草稿與閱讀版切換、章節定位、drawer、hash定位 | keyboard/click | readDraft capability | document API/route | 單一management-method panel內完整閱讀 | `P / B032 → F039` |
| `MM-04` | Tiptap自由語意編輯與metadata title／owner；bold、italic、bullet、quote | editor keyboard | editDraft capability | saveDraft/updateMetadata API | 保留完整創作空間，不把正文過度結構化 | `P / B032 → F039` |
| `MM-05` | 插入／上傳圖片，顯示loading/error | file/pointer | upload capability、size/type/error | media API | panel內保留多媒體文件 | `P / B032 → F039` |
| `MM-06` | 800ms autosave、明確儲存、錯誤notice/retry | save shortcut按頁面contract | edit capability、conflict/error | document API | 與global Organization save區分label與dirty owner | `P / B032 → F039` |
| `MM-07` | 提供閱讀、還原為草稿、停止閱讀 | explicit buttons | manageReadable capability | provide/restore/stop API | panel內保留狀態轉換與confirmation | `P / B032 → F039` |
| `MM-08` | 文件內開唯讀Duty對照Drawer | click/Enter/Escape | read-only | Duty selector/API | 轉成跨panel shared Duty context或panel-local detail；不做智能段落引用 | `P / B032 → F039` |

## 9. 兼任風險

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `RISK-01` | 風險規則清單與空白狀態 | keyboard/click | 唯讀可看 | role risk selector | 直接role-risk panel | `P / B019+B-CODE → F039` |
| `RISK-02` | 新增／編輯 role A、role B、low/medium/high、reason、enabled | form | writable；self-pair、unknown role、duplicate驗證 | `upsertRoleCombinationRiskRule` | panel完整表單 | `P / B019+B-CODE → F039` |
| `RISK-03` | 啟用／停用規則 | toggle | writable | `setRoleCombinationRiskRuleEnabled` | 保留即時結果 | `P / B019+B-CODE → F039` |
| `RISK-04` | 刪除規則 | explicit action | writable | `removeRoleCombinationRiskRule` | 保留明確刪除與focus return | `P / B019+B-CODE → F039` |
| `RISK-05` | 由員工多職推導風險，顯示於組織節點／關係overlay | click/reveal | derived only、不寫回風險事件 | canonical derived selector | organization＋risk panels shared highlight | `P / B019 → F039` |

## 10. 角色指派治理

| ID | 現行能力 | Keyboard／pointer | Gate／狀態 | Authority | DEV-039 目標 | 證據 |
| --- | --- | --- | --- | --- | --- | --- |
| `GOV-01` | 身分連結建立、停用、重新啟用 | form | `session.manage`、desktop、catalog valid | governance API command | 直接governance panel | `P / B037 → F039` |
| `GOV-02` | 查看external/internal role catalog與stale/error reload | keyboard/click | 外部catalog唯讀 | governance API | 保留catalog freshness gate | `P / B037 → F039` |
| `GOV-03` | role assignment設定app、employee、role、scope/value、department、有效期間 | form | validate後upsert | `UPSERT_ROLE_ASSIGNMENT` | panel內完整assignment editor | `P / B037 → F039` |
| `GOV-04` | revoke assignment | explicit action | manage capability | `REVOKE_ROLE_ASSIGNMENT` | 保留明確revoke與結果 | `P / B037 → F039` |
| `GOV-05` | delegation source／target／to／reason建立 | form | manage capability＋validation | `UPSERT_ROLE_DELEGATION` | panel內保留 | `P / B037 → F039` |
| `GOV-06` | draft發布、blocker、reason、版本重啟 | form | publish validation | governance version API | 保留版本與阻擋回饋 | `P / B037 → F039` |
| `GOV-07` | audit reload與紀錄查看 | button/list | loading/error/empty | audit API | panel內保留 | `P / B037 → F039` |
| `GOV-08` | assignment check／模擬檢查，不寫資料 | form | read-only可檢查 | governance check API | 保留目前GovernanceCenter check；不復活退役Simulator component | `P / B037 → F039` |
| `GOV-09` | mobile governance唯讀與mutation隱藏／拒絕 | touch/read | mobile read-only | capability＋server | 新workspace mobile同等退化 | `P / B037 → F039` |

## 11. Typed relation registry

面板重排 drag 與資料 drag 必須使用不同session type、handle、預覽與取消行為。資料 drag只可使用下表登錄的payload／target／command；不得讓來源panel直接修改目標panel state。

| Relation ID | Payload | 合法 target | 寫入結果／authority | Duplicate／invalid／cancel | Keyboard alternative | Fresh evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `REL-PLACEMENT-SESSION` | strict typed entity payload＋input mode | registered target | 只產生`intent／noop／rejected`，App再交既有domain owner | latest state／capability重驗；cancel零domain change；single session owner | native與keyboard共用`begin／preview／commit／cancel`；candidate freeze刪除平行state | `S7 implementation/source gates passed；B16 partial evidence` |
| `REL-EMP-POS` | `EmployeeId`＋assignment intent | `PositionId`或組織畫布unassign zone | 建立／移轉／解除EmployeeAssignment；assignment helper＋history | invalid target與cancel不dirty；multiple/primary規則fail closed | list新增任職、既有exact移轉／解除；native與keyboard走同一Placement Session | `S7 fresh B16 native新增 E1-EMP-POS-NATIVE=pass＋keyboard兼任；移轉／解除 fresh pending` |
| `REL-DUT-POS` | `DutyId`＋`primary-execute\|collaborate\|review\|countersign` | `PositionId` | `UPSERT_DUTY_RELATION`／primary transfer／planning transaction | duplicate/noop不建立第二relation；invalid不dirty | native與grab→Tab→Enter/Space→Escape共用Placement Session及resolver | `S7 fresh B16 主執行 E1-DUT-POS-NATIVE=pass；其他lane與failure pending` |
| `REL-DUT-PROC` | `DutyId` | `ProcessNodeId` | `LINK_PROCESS_NODE_DUTY` | duplicate/noop/invalid不dirty | UI可由任一端啟動，但native／keyboard／明確Link CTA只建立同一canonical link | `F039-REL-03 keyboard／CTA baseline；E1-PROC-DUT-NATIVE與paired E1-DUT-PROC-NATIVE均strict pass（16.15.19、16.15.21）` |
| `REL-PANEL-LAYOUT` | `WorkspaceModuleId`（亦為唯一panel ID） | stack center／合法split edge | 只改browser-local layout state | 不得呼叫domain command、domain history或autosave | tab action menu移區／合法分割＋separator keyboard resize | `F039-LAYOUT-01` |

`ProcessNode→Duty`在領域上與`Duty→ProcessNode`是同一link；UI可以從任一支援surface啟動，但只保留一個canonical command與一筆relation，不建立方向相反的第二資料型別。

## 12. 共通狀態、錯誤與 capability matrix

| 狀態 ID | 必須可觀察的行為 | DEV-039 要求 | Fresh evidence |
| --- | --- | --- | --- |
| `ST-01 Loading` | module資料或API載入中不顯示假空白 | panel-local loading；不阻塞無關panel | screenshot＋DOM state |
| `ST-02 Empty` | 無員工／職位／Duty／流程／辦法／治理資料有正確空狀態與合法建立入口 | 建立入口只在有capability時顯示 | 各可建立module至少一例 |
| `ST-03 No match` | 搜尋／篩選無結果與資料真的為空可區分 | 清除filter後恢復 | Duty/Directory/MM至少一例 |
| `ST-04 Read-only` | current唯讀、mobile唯讀或session capability不足時可讀但無mutation | panel不得自行顯示假編輯或繞過server | desktop readonly＋390×844 |
| `ST-05 Invalid command` | validation錯誤就地顯示，不改資料、不入history、不autosave | drop、delete、assignment、process edge均適用 | targeted tests＋browser |
| `ST-06 Conflict` | 409/CAS時停止覆寫並提供可理解恢復路徑 | workspace shell不可吞錯 | API negative＋browser feedback |
| `ST-07 Invalid route/ID` | 不存在的stable ID／舊alias安全回到可用context | 不留白屏、不建立幽靈資料 | route tests＋browser |
| `ST-08 Layout damage` | browser-local layout JSON損壞時只重設layout | OrganizationDocument不得受影響 | unit＋reload browser |
| `ST-09 Zero panel` | 可關閉最後一個panel，launcher仍可達 | 不自動重開組織圖；恢復預設才只開組織圖 | normal-entry browser |
| `ST-10 Recovery gate` | current document缺失／無效時阻止mutation並提供復原 | P1 restore；完成前不得宣稱replacement ready | targeted bootstrap＋browser |
| `ST-11 Focus` | Drawer promotion、panel focus、dialog/menu close後焦點回到可預期入口 | 不能落到document body或隱藏node | keyboard walkthrough |
| `ST-12 Reduced motion` | reveal／focus highlight與dock動畫尊重reduced-motion | 不依動畫傳達唯一狀態 | emulation＋screenshot/DOM |
| `ST-13 Guarded close` | dirty module由close、Escape dismissal後續動作或Back離開時先執行module guard | 取消時panel、URL、context、buffer與focus不變；allow後才commit close | component＋browser Back/Forward |
| `ST-14 Surface lifecycle` | surface首次open才mount；hidden暫停可見性工作；close釋放資源 | initial organization不觸發其他module API，inactive無重複poll／fit／observer | component instrumentation＋network trace |
| `ST-15 Relation placement` | `idle／placing／committing`只有單一session；panel空白取消，exact解除區才解除；成功後回idle | readonly不開始、preview無domain effect、commit只一次、stale／capability loss fail closed、focus回來源 | state contract＋component＋B16 native／keyboard pair |

## 13. Keyboard registry

| Scope | 現行必保留能力 | DEV-039 workspace要求 |
| --- | --- | --- |
| Global | save、save-copy、undo、redo、fit、global search、Escape priority | panel focus traversal不得攔截既有global shortcut |
| Directory row | Enter／Space選取、F2編輯、Delete安全刪除、Shift+F10／ContextMenu | Drawer與panel使用同一語意；唯讀時不得留下假操作 |
| Position canvas | Enter同階、Tab下屬、F2／Space編輯、Alt+↑/↓排序、Alt+V/H layout | nested dock鍵盤操作須避開這些組合 |
| Context menu | Arrow、Home／End、Enter、Escape與focus return | 所有panel menu共用規則 |
| Duty drag | grab、Tab／Shift+Tab target、Enter／Space drop、Escape cancel、live status | target list只含目前可見／合法Position，或明確提供跨panel定位 |
| Process | node/edge選取、命名、建立、reparent、Duty配置替代路徑 | canvas與workspace panel traversal優先序 |
| Management method | editor標準快捷鍵、章節導覽、drawer/dialog Escape | global save與document save的owner及提示必須清楚 |
| Governance/Risk | form navigation、Escape先關draft/child surface再關panel | panel關閉後回頂部launcher或前一焦點 |

## 14. 基線差距與刻意排除

### 14.1 RD／QA-QC closure

| Gap | 優先級 | 判定 | DEV-039處理 |
| --- | --- | --- | --- |
| recovery gate、capability intersection與legacy `recoveryOpen=false`移除 | RD closed / QA-QC passed | B6證明index unavailable時全域阻斷；DEV-020 automated suite承接invalid current／failed draft／409 | final QC重驗正常恢復入口與default-deny，無新增缺口 |
| Native跨panel relation placement與單一session owner | S7 product wiring implemented / QA-QC reopened | `relationPlacement.ts`、App唯一協調器、typed effect／capability path、Employee／Duty／Process source／target接線、舊state刪除、composition harness與B16 pure fixture已完成；fresh QA已證明ProcessNode↔Duty keyboard、duplicate/no-op、Escape、reload、readonly及viewport／overflow；Employee→Position、Duty→Position與 ProcessNode→Duty 各有一筆 strict native 單案 pass（同一 resolver／Command／API boundary），paired Duty→ProcessNode仍未執行 | 只補 paired strict native、正式QA-QC與E4；不新增schema、API或第二mutation owner |
| Duty新正常入口與四lane／keyboard配置 | Historical RD closed / S7 native reopened | `F039-B1`、`F039-REL-02`、route/full regression已固化keyboard與domain baseline | S7只重驗native／keyboard同session、resolver及mutation owner，不重寫Duty relation authority |
| 兼任風險統一manifest | RD closed / QA-QC passed after fix | desktop current、1024 editable、1023／390 mutation absence與component regression已固化 | QA抓出窄版pin／drag-grip後退回RD修正並重驗 |
| Organization／Employee／Position／Department／Level整合基線 | Historical RD closed / S7 Employee native partial | 五模組launcher＋Drawer promotion、Employee keyboard、full regression已固化 | domain CRUD證據維持；Employee→Position move／unassign native另由S7補fresh evidence |
| Process DEV-039 panel replacement | RD closed / QA-QC passed | normal entry、legacy alias、ProcessNode↔Duty exact relation/focus/Undo及full regression已固化 | final QC確認三面板composition／focus與no-error基線 |
| Duty audit／distribution persistent detail越過panel | P0 product gap / readiness closed | `DutyCenter`仍可render viewport-fixed `DutyDetailDrawer`，既有`LAYOUT-OWNERSHIP-01`只覆蓋configuration | S6-2依`LAYOUT-OWNERSHIP-02`改用Duty panel mode與ListDetail，B14驗證三view；RD不需再選方案 |
| Master-data detail共享mount owner不唯一 | P0 product gap / readiness closed | `selectedMasterDataDetail`與全域Inspector state可由organization及module adapter共同消費 | S6-2刪除共享symbol，拆成Organization／Master Data owner factory，rapid selection時DOM最多一份 |
| Management Method／Duty transient surface未分級 | P1 product gap / readiness closed | viewport-fixed Drawer與feature raw portal可能遮住其他region或錯置focus | S6-1／S6-3建立typed hosts及`WorkspacePortal`後遷移，B15驗證；唯一raw portal owner已固定 |
| Feature viewport與container責任混合 | P1 preventive gap / readiness closed | 桌面split窄panel可能誤套mobile／Inspector定位規則 | S6-4使用named container只管排版；B15成對驗證desktop narrow panel與1023 readonly |

### 14.2 不應復活的歷史能力

| Exclusion ID | 項目 | 排除理由 | Removal前檢查 |
| --- | --- | --- | --- |
| `X-01` | Version comparison UI | 後續DEV已明確移除；`dev-020` screenshot只保留歷史 | 確認無正常entry、active route或使用者文件仍宣稱可用 |
| `X-02` | `GovernanceSimulator` standalone component | DEV-037已退役／未接線；現行assignment check在GovernanceCenter內 | 已完成source removal；現行check parity由GovernanceCenter與F039承接 |
| `X-03` | `ManagementMethodPrototype`舊責任條／直連prototype state | 正式管理辦法list／document／editor已成唯一surface | 已完成prototype source／route／test removal；正式list/document、Duty對照及返回路徑由F039承接 |
| `X-04` | DEV-034歷史大型picker、底部dock、獨立「其他執行」 | 已被目前左側密集清單與四責任語意取代 | 不把歷史screenshot外觀當新版parity |
| `X-05` | DEV-038固定左／中／右composition | DEV-039 intentional replacement只替換UI shell | 固定composition與duplicate organization canvas已移除；Process domain、canvas projection、Command、fixtures與非版面tests繼續保留 |

## 15. Deletion allowlist與fresh evidence Gate

舊檔案、CSS、route或state只能在下列流程後加入 removal allowlist：

1. 指向本清冊一個或多個feature ID。
2. 列出替代的module/panel/global surface與正常入口。
3. 新surface已有`F039` evidence，且可完成相同成功、唯讀、錯誤與keyboard任務。
4. source search證明沒有其他正常entry、dialog、popover、test fixture或error recovery依賴。
5. removal change後通過typecheck、targeted tests、full regression、build與browser QC；是否commit仍須使用者另行授權。

已建立的`output/playwright/dev039/manifest.md`依下列欄位保存本地RD證據：

- source revision、branch、fixture與資料版本。
- normal entry path；direct URL只能補route recovery，不能取代可發現性。
- route、query、panel set、viewport、workspace mode、version status與session capability。
- 操作前後的stable IDs、Command/result、dirty/history/autosave/reload結果。
- console error、page error、failed network與可見error feedback。
- screenshot檔名及對應本清冊feature/state/relation ID。

最小browser matrix：

| Matrix | Viewport／mode | 必驗內容 |
| --- | --- | --- |
| `M1` | 1440×900 editable | 十模組依序由正常入口開啟、initial org-only network、三panel並排、Drawer promotion、inactive lifecycle、guarded close、CRUD；S7另補native／keyboard relation placement等價 |
| `M2` | 1024×768 editable | panel最小尺寸、focus、menu/dialog、Process/Duty capability boundary |
| `M3` | 1023×768 readonly fallback | 不顯示桌面mutation、不產生hidden command |
| `M4` | 390×844 mobile readonly | 閱讀／搜尋／導覽可用，無新增／修改／拖曳／發布 |
| `M5` | 1440×900 current read-only | 所有panel可讀，全域mode一致，mutation拒絕可理解 |
| `M6` | 1440×900 conflict/recovery | 409、invalid command、invalid route與document recovery |

## 16. 清冊完成判定與下一步

本版已完成：

- 14個正常入口／route surface的Current Phase分類。
- 70項以上現行可見能力、keyboard、gate、authority與新版surface mapping。
- 1條Relation Placement Session、3條領域relation與1條純UI layout registry。
- 15類共通狀態、全域keyboard registry、S7重新開啟缺口與5項刻意排除。
- 已完成DEV-039 S0～S6正常入口實機walkthrough與`F039`：十模組入口、七個Drawer promotion、initial organization-only、split/tab/pin、零panel、canonical reload、損壞layout、invalid ID、legacy alias、current／mobile唯讀、editable draft、reduced motion、recovery、close unmount及三relation keyboard/focus均有持久化證據。

本版仍未完成、也不得宣稱完成的是：S7 QA-QC收斂、native HTML5 `dataTransfer`可重演證據、invalid／target卸載 failure evidence、console warning處理，以及commit、merge、deploy與release。S7 Implementation Readiness、relation core、舊平行state移除、composition harness、B16 pure fixture與keyboard／readonly／reload／viewport evidence已完成；S6產品實作及B14～B15重點browser re-QC亦已完成。`F039`與S0～S5 final QA-QC、S6 evidence及S7 B16 evidence均是base HEAD加未提交worktree diff，尚未成為immutable revision artifact。

本清冊已連結`ai-doc/specs/DEV-039-composable-planning-workspace.md`與`output/playwright/dev039/manifest.md`。S0～S6的normal-entry、keyboard baseline、capability、recovery、lifecycle、removal allowlist、owner／overlay／container boundary及QA-QC均已完成；S7 relation placement目前為`Relation Placement Implemented / QA-QC Reopened`。`relationPlacement.ts`、App coordinator、typed effect／capability path、Employee／Duty／Process source／target接線、舊state刪除、composition harness與B16 pure fixture已完成並通過targeted／full regression、typecheck、build與source scan；fresh QA已補keyboard relation、duplicate/no-op、Escape、reload、readonly及viewport／overflow，native HTML5 `dataTransfer`仍未被本次瀏覽器控制介面證明，invalid／target卸載 failure evidence尚不完整，且保留一次React Flow parent-size console warning；未經授權不得commit、merge、deploy或release。

### 16.1 S7 execution checkpoint（2026-08-31）

> 本節的 `native` 結果是較早的 loopback／外部 harness 歷史紀錄；最新 in-app CUA 未能觀察到可驗證的 HTML5 `dataTransfer`，因此本節不得單獨作為目前 native pass，現況以16.3及16.4為準。

- Aggregate與source-policy已完成：本次窄接線 targeted `2 files／9 tests`（前置relation／component／fixture aggregate `6 files／28 tests`亦保留）、full regression `159 files／656 tests`、typecheck、build、legacy source scan與`git diff --check`均通過。
- B16 loopback runtime已可用：task-owned Vite `127.0.0.1:8080`、Playwright `dev039-s7`、Chromium `HeadlessChrome/151.0.0.0`、viewport `1280×720`，以loopback dev identity（`urn:orgmaster:dev`／`local-admin`）執行；這不等同正式登入或production auth。
- Fixture `draft-ae49e198-ff78-4ace-96af-6cab7cf080e5`（`DEV-039-S7-B16-1788156467803`）已依`scripts/dev039-s7-fixture.mjs`建立、讀回並recoverably archive；archive manifest revision為`108fd7d058d44db20e50b477d7cd1260dd21f95bf60af1ecd9299a7d7a583cb5`。
- 已驗證：ProcessNode→Duty native建立`process-duty-2`、同target duplicate為noop；Duty→ProcessNode native建立`process-duty-4`；另有ProcessNode keyboard建立`process-duty-3`、Employee／Duty native、Escape cancel、current readonly無source handle及draft reload persistence；截圖與API readback詳見`output/playwright/dev039/manifest.md`。
- 恢復條件：依主spec第26.8節完成fresh QA-QC與適用viewport matrix，重驗invalid／target卸載／capability loss／focus return；不需修改schema、API或新增dependency。

### 16.2 S7 closure checkpoint

S7的唯一產品程式缺口已以窄接線完成，不另建立新的視角或資料模型：`ProcessDutyBridge`已把Duty row註冊為`process-node → duty`的native／keyboard target，`ProcessPlanningWorkbench`只傳遞App既有callback。下一個slice只補證據收斂，不重寫關聯權威。

| 順序 | RD動作 | 必須觀察的結果 | Gate／停止條件 |
| --- | --- | --- | --- |
| 1 | 已完成`ProcessDutyBridge.tsx`窄Props與linked／available Duty target wrapper；`ProcessPlanningWorkbench.tsx`原樣傳入App callback。 | ProcessNode handle以strict MIME拖到Duty row可抵達App；Duty名稱仍只選取、解除按鈕仍只解除。 | 不在component建立resolver、commit、local placement state、MIME或API。 |
| 2 | 已以B16 fixture執行ProcessNode→Duty、Duty→ProcessNode native pair，並記錄duplicate noop、keyboard link與API readback。 | valid產生canonical link；duplicate為noop；兩個方向共用同一effect與resolver。invalid、target卸載、capability loss、focus return仍列入fresh QA。 | 不以既有keyboard／CTA baseline代替native；fresh QA未完成前維持Reopened。 |
| 3 | 本次已產出並回填`F039-S7-B16-*` artifacts，完成fixture cleanup與runtime cleanup；仍待重演1440×900、1440 current、1023 readonly及invalid／target卸載／capability loss／focus return、console／visible-error／overflow矩陣。 | 第三方可依manifest重演既有Process native結果；正式auth不可用時已標註loopback dev identity限制，fresh QA完成後再補齊剩餘矩陣。 | 不直接寫current／data；provenance、cleanup或viewport缺失即不得關閉QA-QC。 |
| 4 | 自動化與source gate已完成；待fresh QA／QC與文件狀態一致後執行candidate freeze。 | 只有Process native、fresh QA／QC與viewport matrix全通過後，才可將`Relation Placement Implemented / QA-QC Reopened`改為下一個正式狀態。 | 不因測試數增加、build通過或fixture archive成功而自動升級S7；不在本工作包內commit、merge、deploy或release。 |

### 16.3 S7 fresh QA／QC supplement（2026-08-31）

本節是16.2之後的最新證據索引。Keyboard與資料一致性已重驗；native、invalid／unload及console warning仍未形成可關閉QA-QC的證據，因此不得將本清冊標為完成。

| 範圍 | 最新結果 | 清冊處置 |
| --- | --- | --- |
| 正常入口與十模組 | 頂部`功能`可開啟組織架構圖、職位、員工、部門、層級、工作職掌、流程規劃、管理辦法、兼任風險與角色治理；面板單例、分割與tab成立。 | `P`保留；fresh artifacts已補 |
| ProcessNode↔Duty keyboard | ProcessNode→Duty與Duty→ProcessNode均以同一Placement Session提交，新增`process-duty-2`／`process-duty-3`並由API讀回。 | `REL-DUT-PROC` keyboard pass |
| duplicate／Escape／reload | duplicate revision不變；Escape焦點回source；draft reload保留links。 | pass |
| native cross-panel | ProcessNode→Duty、Employee→Position、Duty→ProcessNode以CUA實際拖曳未產生可觀察`dataTransfer` drop或mutation。 | `REL-PLACEMENT-SESSION`維持QA-QC Reopened，不以工具失敗宣稱產品pass |
| viewport／唯讀 | 1440×900與1024×768 editable、1440×900與1024×768 readonly、390×844 readonly均無document overflow；readonly/mobile source handles為0。 | viewport pass |
| invalid／capability／console | 不相容target未造成資料變更；target卸載及invalid visible message尚未取得完整可重演證據；保留一次React Flow parent-size warning。 | partial，列為S7 closure blocker |

Fresh artifacts與fixture provenance詳見`output/playwright/dev039/manifest.md`的`S7 fresh QA／QC supplement`；task-owned runtime與fixture已清理，正式auth、immutable commit、merge、deploy與release仍不在本次範圍。

### 16.4 S7 文件升級後的證據收斂規則（2026-08-31）

本清冊與主spec第26.13節採同一個關閉順序：`E1 Native delivery → E2 Failure paths → E3 React Flow warning → E4 Candidate freeze`。CUA 未觸發 `dataTransfer` 時，清冊只記為 `Not proven`，不得改寫成 native pass，也不得僅因工具限制新增第二套輸入路徑。

- `E1` 必須由可產生真實 HTML5 `DragEvent`／`DataTransfer` 的 browser harness 完成 Employee、Duty、Process 三類代表路徑，並有 strict MIME、drop event、canonical API readback 與 before／after revision。
- `E2` 必須以同一 B16 fixture 觀察 invalid target、target 卸載與 capability loss 的 visible failure、focus return、zero mutation；並以既有合法 mutation＋單次 Undo 還原 baseline relation IDs 產出 `historyEvidence`。不得用直接寫入資料、內部 historyLength 猜測或產品 debug API 代替交付路徑。
- `E3` 只允許針對既有 `ProcessPlanningCanvas`／lifecycle 做窄幅時序釐清；若 warning 為短暫零尺寸 mount 且無 alert／overflow／listener leak，記錄為 accepted observation，不改 workspace core。
- `E4` 只有全部 closure row、既有 keyboard／no-op／cancel／reload／readonly／viewport matrix及cleanup provenance均為 pass，才可更新本清冊狀態；否則維持`Relation Placement Implemented / QA-QC Reopened`。

上述規則是 evidence governance，不新增 schema、API、permission、DnD dependency、MIME、resolver、business state、event bus或另一份清冊。

### 16.5 S7 automated regression re-run（2026-08-31 16:05，歷史基線）

- `npm test -- --run --pool=forks --maxWorkers=1` 已取得 `159 test files／656 tests` 全數通過；前次平行執行的 5 個 worker timeout 以單一 fork worker 重跑後不再重現。
- 這是幾何窄修正前的歷史 aggregate regression evidence；現行 working tree 的 `160／663` after-fix／lifecycle-test 結果見第16.10節，不修改產品程式、dependency或測試設定，也不將執行併發調整誤當成產品功能。
- 自動化 gate通過不會關閉S7 native `dataTransfer`、invalid／target卸載／capability-loss failure與React Flow warning；仍須依主spec第26.13節完成E1～E4。

### 16.6 S7 RD execution packet index（2026-08-31）

主spec第26.13節（含第26.13.1節的最小 failure／lifecycle case matrix）是 S7 剩餘 closure 的唯一派工契約：`E1-NATIVE → E2-FAILURE → E3-WARNING → E4-FREEZE`。本清冊只追蹤 artifact 與判定，不在此另造測試命令、resolver 或狀態機；目前四項分別為 `Partial／Open`、`Pass（evidence）`、`pass`、`Blocked`。

目前自動化基線為 targeted pure／fixture `11 files／57 tests passed`、component／composition `6 files／24 tests passed`（關聯與lifecycle合併重跑 `4 files／20 tests passed`）、aggregate `160 test files／663 tests passed`、typecheck、build及diff check通過；本輪新增E2 fail-closed與Process canvas lifecycle tests不改產品契約。Process canvas after-fix split／reload／flow geometry observation亦已記錄於第16.10節；這些基線不取代E1～E3的fresh browser evidence。

本輪測試增量補 `E2-INVALID`、`E2-UNLOAD`、`E2-CAPABILITY-LOSS` 的 pure／component fail-closed coverage；第16.15節及後續16.15.3～16.15.17已取得同一B16 fixture的五筆 E2 browser observation、`historyEvidence`、E3-LIFECYCLE與原生CDP listener probe，E2 aggregate已標為`Pass（evidence）`、E3-WARNING aggregate已標為`pass`。最小 case matrix 以主spec第26.13.1節為唯一來源。

主spec第26.13.1節新增的「自動化覆蓋與瀏覽器 evidence 邊界」是目前唯一的覆蓋解讀：自動化只證明 fail-closed 邏輯；本輪第16.15.17節已用五筆 browser observation與行為性 Undo evidence完成 E2 aggregate，E3另有一筆 lifecycle／warning probe；仍須正式 QA-QC覆核，`E2-COMMIT-REJECT`與`E2-409-RECOVERY`維持條件式補充，不擴張目前最低三案。

本節的派工索引取代前節對第26.12節的舊引用；後續執行與文件同步一律以主spec第26.13節為準。

最新 Chrome CUA 補充觀察（同一 B16 draft、2026-08-31）：Employee→Position 與 Duty→Position 已各取得一筆 strict MIME、200 PUT、API revision及canonical readback的單案 `pass`；ProcessNode↔Duty native因duty drawer／transformed viewport本輪`not-run`。同target noop 維持原結果；Duty→Process invalid target 未增加連結，按 Escape 可回到 idle。單案結果不等於E1 aggregate，E2卸載／capability-loss、E3 warning仍開放。

| Closure ID | 代表清冊列 | 最小證據 | 目前判定 |
| --- | --- | --- | --- |
| `E1-NATIVE` | `REL-EMP-POS`、`REL-DUT-POS`、`REL-DUT-PROC` | 真實 `dataTransfer.types`、drop event、canonical API readback、before／after revision | Partial／Open；Employee→Position與Duty→Position各有一筆單案pass，ProcessNode↔Duty native尚未取得可採用record |
| `E2-FAILURE` | `REL-PLACEMENT-SESSION`、`STATE-*` | invalid／卸載／capability loss 的 visible fail-closed、focus return、零 mutation與`historyEvidence`行為性Undo round-trip | Partial／Open；五案已有同一B16 browser observation、assignment／relation zero-mutation、dirty／autosave與document listener inventory，且重新editable／409 recovery已補齊；待新 schema record重跑 |
| `E3-WARNING` | `AR-06`、`B16` | Process canvas mount／split／reload console 時序與 container geometry | pass；第16.15.15節以同一 fixture原生 CDP listener、strict raw-console、geometry與lifecycle record完成 |

#### 16.6.1 E2 evidence amendment（2026-09-01）

`historyLength` 是 `App` 內部 `useOrgHistory` 的實作細節，Parity 不要求為它新增產品診斷欄位。E2 的 required history evidence 改由主spec第2.3／26.14節定義的 `historyEvidence` 提供：同一 fixture 先完成一次已知合法 mutation，再執行一次既有 `Control+Z`，以完整 canonical relation IDs 證明回到 baseline。這個 amendment 不改任一 `P／R／X` 功能列，也不改 domain、API、保存或權限 authority；本段末句的 `Partial／Open` 僅代表 amendment 當下尚未重跑的歷史狀態，現行五案結果以第16.15.17節為準並為`Pass（evidence）`。
| `E4-FREEZE` | 全部 P／R rows | 文件四方同步、fixture archive、runtime／port cleanup、source revision | Blocked by E1～E3 |

只要任一 closure 未通過，清冊狀態維持 `Relation Placement Implemented / QA-QC Reopened`；不得以歷史 F039、unit／API 直寫、build 或工具未產生 `dataTransfer` 的結果關閉該列。

### 16.7 S7 evidence record contract index（2026-08-31）

主spec第26.14節定義 S7 唯一的 evidence record schema 與判定演算法；本清冊只保留索引，不另造欄位或狀態機。每個 E1～E3 case 必須記錄：

- case／closure／relation／input mode、同一 fixture version、canonical route、viewport、workspace mode、browser 與 identity。
- `before`／`after` 的 relation IDs、version revision、dirty、history length、autosave state；不得以另一份資料或 API 直寫製造 after。
- native 才填 `dataTransferTypes`；strict `application/x-orgmaster-entity`、drop event 與 canonical API readback 缺一即不可標 `pass`。
- action source／target、visible result、產品 console errors／warnings、API readback、fixture／runtime／port cleanup，以及 `not-run／observed／pass／partial／fail／blocked` 狀態。

判定固定為 `blocked → fail → partial → pass → observed → not-run` 的保守順序；任何必要欄位未知只能保持 partial／blocked。E4 只能讀取 records、既有 acceptance 與本清冊，不得從聊天、舊截圖、unit 或 API 直寫推論通過。新增 runner 僅能存在 `scripts/`／測試目錄，不得進 production bundle或建立第二 resolver／mutation owner。

最低 case ID 沿用主spec第26.14.3節：`E1-EMP-POS-NATIVE`、`E1-DUT-POS-NATIVE`、`E1-PROC-DUT-NATIVE`、`E1-DUT-PROC-NATIVE`、`E2-INVALID`、`E2-UNLOAD`、`E2-CAPABILITY-LOSS`及`E3-LIFECYCLE`。同一操作可重用artifact，但每個ID都必須有獨立 assertion與status。

此索引只補強可稽核性，目前狀態為：`E1-NATIVE=Partial／Open`、`E2-FAILURE=Partial／Open`、`E3-WARNING=pass`、`E4-FREEZE=Blocked`。

### 16.8 S7 fresh native record index（2026-08-31，歷史快照）

主spec第26.15節已記錄同一 B16 draft fixture 的兩筆 fresh native record；本節只做逐案索引，所有欄位、判定與 cleanup 仍以主spec第26.14節為準。

| Case ID | Fresh result | Artifact／API evidence | Scope boundary |
| --- | --- | --- | --- |
| `E1-EMP-POS-NATIVE` | `pass` | `F039-S7-B16-native-employee-position.png`；產品 dragover／drop 讀到 strict `application/x-orgmaster-entity`；PUT `#608`=`200`；after assignment `assignment-employee-dev039-b16-unassigned-position-dev039-b16-empty-2026-08-31-42`；response revision `e56d7c2e1848452d9fa88b1d3137c88942bbd2258409b7329a7198ecca39bee7` | 只關閉 Employee→Position 新增任職單案；移轉／解除與 E1 aggregate 尚未全閉合 |
| `E1-DUT-POS-NATIVE` | `pass` | `F039-S7-B16-native-duty-position.png`；產品 dragover／drop 讀到 strict `application/x-orgmaster-entity`；PUT `#738`=`200`；after `rel-duty-7`（execute／primary）及 response revision `fb3c227b06ebad9e2fa06b044d8b86de9a9e8098a72953a15a1b0471e4342748` | 只關閉 Duty→Position 主執行單案；ProcessNode↔Duty、其他lane與 E1 aggregate 尚未全閉合 |

本輪 fixture `draft-508a1fcd-e705-4bd1-98bf-72a140e607eb` 已 recoverably archive（manifest revision `ed564d23949663c7084938261fa97a4d0e0cb5ffb29a8da7fdb9f5866b9f9522`）；task-owned browser session 已關閉，8080 未啟用，使用者 owned 5000 未停止。ProcessNode↔Duty native 因 duty drawer 展開後 source 位於不可見 transformed viewport，正常 pointer path 本輪 `not-run`，不得以直接 style／API 寫入補造證據。當時整體狀態為 `E1-NATIVE=Partial／Open`、`E2-FAILURE=Partial／Open`、`E3-WARNING=pass`、`E4-FREEZE=Blocked`；現行判定以本清冊第0.1～0.2節為準。

### 16.9 S7 現行證據優先序索引（2026-08-31）

為避免歷史段落被誤當成目前 Gate，本清冊採用主spec第26.16～26.17節的單一讀取順序：

1. 派工與驗收以主spec第26.13節為準。
2. 欄位、保守判定及runner邊界以主spec第26.14節為準。
3. 最新逐案結果以主spec第26.15節及第26.21.17節為準；目前 Employee→Position 與 Duty→Position 各一筆單案 `pass`，E2五案為`Pass（evidence）`，E3-LIFECYCLE與E3-WARNING均為`pass`。
4. Process canvas 幾何／生命週期窄修正以主spec第26.17節為準；它只約束既有 Process surface，不另造 resolver、state或record schema。
5. 本清冊第16.6～16.15.17節及 `output/playwright/dev039/manifest.md` 只作交叉索引與artifact provenance。
6. 更早的第16.1～16.5節、26.9～26.12節及舊 loopback／CUA紀錄只保留歷史來源，不得升級目前 closure。

現行摘要固定為：`E1-NATIVE=Partial／Open`、`E2-FAILURE=Pass（evidence）`、`E3-WARNING=pass`、`E4-FREEZE=Blocked`。新增證據時先追加主spec第26.15節或第26.21節，再同步本清冊與evidence manifest；`dev_task.md`、`documentation_map.md`與ADR只更新狀態摘要，不複製第二套record schema或判定演算法。

### 16.10 S7 Process canvas 幾何／生命週期窄修正索引（2026-08-31）

主spec第26.17節記錄 before／after 與窄修正契約。before 條件是在 `organization + duties + processes` 分割後，`process-planning-canvas` 約 `358×390px`，但 `process-planning-graph-panel` 約 `360×206px`，React Flow source 延伸到 owner panel 外；快照 `output/playwright/dev039/F039-S7-E3-process-geometry-blocker.png` 只作 blocker provenance。修正後已移除固定 `flex-basis:390px`，以 `min-width／min-height:0`、正常文件流及兩個 animation frame 後單次 `fitView` 收斂；同一 B16 split fixture 量得 graph panel `276.1875×536px`、mindmap canvas `274.1875×224px`、兩個 source handle 均在 canvas／panel 內，canvas／React Flow 無 overflow，artifact 為 `output/playwright/dev039/F039-S7-E3-process-geometry-after-fix.png`。

本輪 reload／flow 切換產品 console 為 `errors=0／warnings=0`，因此 `E3-GEO-SPLIT` 與 reload／flow 幾何觀察可標 pass；第16.15.15節已補同一 fixture 的原生 CDP listener與strict raw-console `E3-WARNING` record，故 `E3-WARNING=pass`。`E1-PROC-DUT-NATIVE`／`E1-DUT-PROC-NATIVE` 仍須依主spec第26.14節補 strict MIME、API／revision、visible result與cleanup；本輪 Playwright `dragTo`／mouse 未產生可採用 native `dataTransfer`，不得由幾何 pass 推論 relation pass。RD邊界不變：不得新增 DnD dependency、第二 resolver／MIME／mutation owner、global CSS／portal或 layout state。最新程式 gate 同步為 targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯與lifecycle合併重跑 `4 files／20 tests`）、full `160 files／663 tests`、typecheck、build、diff check 全數通過；本輪新增E2 fail-closed與Process canvas lifecycle tests不改產品契約。

### 16.10.1 短面板 editor saturation follow-up（2026-08-31）

主spec第26.17.5節的補充量測證明：在 editor 區塊佔滿短高度 split panel 時，既有 Process canvas 以 `min-height:180px; flex:1 1 180px` 保留非零操作面積。B16 live geometry 為 graph panel `342.7625×212.3`、canvas `325.9625×180`；兩個 relation handle 約 `17.303×17.303` 且 `elementFromPoint` 命中產品 `BUTTON`，artifact為`output/playwright/dev039/F039-S7-E3-process-canvas-min-height.png`。這只關閉短面板 canvas 零高度的幾何 observation，不改 workspace layout、relation resolver、MIME、Command、API或mutation owner；第16.15.15節已補同一 fixture 的原生 CDP listener與strict raw-console closure，E3 warning aggregate現為`pass`，ProcessNode↔Duty native仍`not-run`。

### 16.11 S7 E1 native runner admission index（2026-08-31）

主spec第26.18節是 E1 runner 的唯一環境前置條件。本清冊只做索引：runner 必須由 canonical `/`、同一 B16 fixture與正常可見 source／target 開始，先證明 `dragstart → dragover → drop` 事件鏈及 strict `application/x-orgmaster-entity`，再執行四個 E1 case；缺少真實 `DataTransfer` 時記為 `blocked／not-run`，不得用 synthetic event、`page.evaluate`、API直寫或改style補造成功。ProcessNode↔Duty若 source／target 不在可見 owner panel，也只能先恢復可見幾何後重做 admission，不能推論為 domain failure。現況仍為 `E1-NATIVE=Partial／Open`（兩筆 Position 單案 pass；ProcessNode↔Duty not-run），不新增第二 runner、resolver、MIME、mutation owner或產品fallback。

### 16.12 S7 native runner availability decision（2026-08-31）

本輪 task-owned `dev039-e2`、In-app Browser CUA與Chrome extension CUA均已確認 canonical B16 split 的 source／target owner geometry與strict MIME元件存在，但未產生可採用的`dragstart → dragover → drop`／`DataTransfer.types`，Chrome browser-client先無可連線tab，後建立隔離分頁重跑仍無native事件；沒有產品mutation或console error。另觀察keyboard placing後切換現行版會離開placing狀態，但仍缺API／revision／zero-mutation完整browser record。依主spec第26.19節停止重複同類工具嘗試，`E1-PROC-DUT-NATIVE`與`E1-DUT-PROC-NATIVE`維持`not-run`，E1 aggregate維持`Partial／Open`。後續只在具備真實HTML5 DataTransfer的runner時，沿用同一fixture／入口／record schema重跑；不得新增synthetic path、第二resolver／mutation owner、API直寫或產品fallback。

### 16.12.1 S7 Playwright admission fresh attempt（2026-08-31）

主spec第26.15.1節的 fresh record 以 task-owned `127.0.0.1:5080`、Chromium `149.0.7827.55`、`1280x720`及同一 B16 fixture重演。source `process-node-dev039-b16-open`與Duty target `duty-dev039-b16-new`皆在可見 owner panel，Playwright `drag_to`及pointer path均未觀察任何`dragstart／dragover／drop`，沒有strict `dataTransferTypes`；API archive後readback為`200`且只保留原有`process-link-dev039-b16-linked-primary`，未發生domain mutation。依 admission stop condition，`E1-PROC-DUT-NATIVE=blocked`、paired `E1-DUT-PROC-NATIVE=not-run`，fixture、runtime與5080 port均已cleanup；此結果不改產品契約，也不把工具限制寫成產品故障或native pass。

### 16.13 S7 E3 lifecycle fresh observation index（2026-08-31）

主spec第26.20節記錄 Process standalone mount、close/unmount、launcher promotion、mindmap／flow切換、Duty focus往返及reload。Artifact為`output/playwright/dev039/F039-S7-E3-lifecycle-iab.png`；本段是早期局部 observation，後續第16.15.4節的 browser-init probe與第16.15.15節的原生CDP listener record已將`E3-LIFECYCLE`與`E3-WARNING`個案標為`pass`。

自動化補充：`src/components/ProcessPlanningCanvas.lifecycle.test.tsx` 以受控 jsdom 證明可見 surface 兩個 animation frame settle 後只呼叫一次 `fitView`，unmount 會 `ResizeObserver.disconnect`，隱藏 surface unmount 會取消 pending `requestAnimationFrame` 且不執行 fit。第16.15.15節再以不注入 monkey-patch 的原生 CDP listener snapshot補上 warning closure；E3-WARNING aggregate現為`pass`。

### 16.14 S7 continuation gate index（2026-08-31）

主spec第2.1節是下一輪接續 DEV-039 的冷啟動入口；本節只保留索引，不另造狀態機或判定演算法：

- `E1-NATIVE=Partial／Open`：第26.18節 runner admission已完成；目前ProcessNode↔Duty native為`blocked／not-run`，不再重複同類工具嘗試。待具備可讀取真實`DataTransfer`的runner後，沿用同一 B16 fixture與四個最低case ID補 strict `application/x-orgmaster-entity`、drop event、API／revision／canonical readback。
- `E2-FAILURE=Partial／Open`：同一fixture已補五案visible result、focus／session cleanup、assignment／relation zero-mutation、persistence snapshot、document keydown listener與重新 editable／409 recovery；唯一未閉合欄位是嚴格 history length，pure／component pass不得取代瀏覽器record。
- `E3-WARNING=pass`：第16.15.15節同一 fixture 合併 runner 覆蓋 mount／close／reveal／mindmap→flow／reload，並以原生 CDP listener、strict raw-console、geometry與observer／rAF record完成 closure；不需重做已通過的 lifecycle probe。
- `E4-FREEZE=Blocked`：只有E1～E3 required record、fixture archive、runtime cleanup與文件同版同步後才可解除；未通過前維持`Relation Placement Implemented / QA-QC Reopened`。

接續順序固定為：`主spec第26.13～26.21節 → 自動化基線 → 讀取既有runner admission判定 → 優先補可採用的E2／E3 record → runner重新admitted後才補E1 → 本清冊與evidence manifest同步`。不得新增DnD dependency、第二MIME／resolver／mutation owner、schema／API／permission、global listener或第二份清冊；runner blocked時保存環境證據後停止同類嘗試。

### 16.15 S7 E2 failure-path fresh browser observation index（2026-08-31）

對應主spec第26.21節。本段保留 2026-08-31 初始四案 failure-path record；目前五案合併結果與 re-entry／409 recovery 以第16.15.3節及第16.15.4節為準。初始 record 以 task-owned `127.0.0.1:5080`、Chromium `149.0.7827.55`、`1280×720`、canonical `功能→流程規劃→在工作台開啟` 及同一 B16 fixture 執行；每案以 app hydration 後的 API snapshot 作 baseline，避免把啟動 manifest revision 誤判為操作 mutation。

| Case ID | 新鮮瀏覽器結果 | API／diagnostics | Artifact／判定 |
| --- | --- | --- | --- |
| `E2-INVALID` | 開啟員工抽屜，以 `B16 無任職員工` source 送至 `B16 未連結節點` ProcessNode 不相容 target；顯示「目前為唯讀，無法建立關係」，placing notice 清除，焦點回原員工 source | status `200`；hydrated→after relation／link IDs與revision不變；產品 diagnostics `[]`；history `0→0`，隨後有效配置 `0→1`、單次 Undo 回 `0`；dirty／autosave不變；document capture listener回 baseline | `F039-S7-E2-invalid-pair.png`；partial（failure／history／persistence／listener欄位齊全；重新 editable／409 recovery未取得） |
| `E2-COMMIT-REJECT` | 已連結 ProcessNode→Duty 再次以 keyboard placement 送出；顯示「關係已存在，未重複建立」，來源 focus 回復 | status `200`；hydrated→after relation／link IDs、revision不變；產品 diagnostics `[]` | `F039-S7-E2-invalid.png`（檔名沿用但語意為此案）；pass（optional single case） |
| `E2-CAPABILITY-LOSS` | placement 中切換至 `390×844` mobile read-only；source 與 placement notice 清除 | status `200`；hydrated→after relation／link IDs、revision不變；產品 diagnostics `[]`；dirty／autosave不變；document capture listener回 baseline | `F039-S7-E2-capability-loss.png`；partial（failure／zero-mutation／persistence／listener欄位齊全；重新 editable未齊） |
| `E2-UNLOAD` | placement 中關閉 Process owner；Process DOM／notice清除，focus回 `workspace-tab-organization` | status `200`；hydrated→after relation／link IDs、revision不變；產品 diagnostics `[]`；dirty／autosave不變；document capture listener由`1`回 baseline `0` | `F039-S7-E2-unload.png`；partial（owner卸載、focus／zero-mutation／listener／persistence欄位齊全；重新 editable未齊） |

`E2-INVALID` 的不相容 pair browser record已取得；本段四案初始 record 的 dirty／history／autosave與document listener evidence已由後續第16.15.3節五案 rerun補齊，重新 editable與409/recovery亦已閉合。現行 E2 aggregate 仍維持 `Partial／Open` 的唯一原因是嚴格 history-length schema 尚未直接暴露；E1 ProcessNode↔Duty native維持 `blocked／not-run`，E3 warning aggregate維持 `Partial／Open`，E4仍為`Blocked`。實作只在既有 `App.tsx` lifecycle 以 owner-driven effect於必要 source／target surface或drawer關閉時呼叫既有 `cancelRelationPlacement()`，不新增 resolver、MIME、mutation owner、補償 store或第二輸入路徑。可重跑 script為 `output/playwright/dev039/e2-admission.pw.ts`；本機需使用與helper相同的 Playwright `1.62.1` CLI，避免`npx`另載一份測試runtime造成雙module。初始四案使用同一fixture，較新五案與 archive final manifest revision見第16.15.3節。

環境備註：改名後的一次 serial replay 曾回報 `console.error: Failed to load resource: net::ERR_NO_BUFFER_SPACE`；它沒有伴隨 `pageerror`、domain mutation或API變更，且 COMMIT-REJECT isolated replay隨後為 diagnostics `[]`。因此此訊息列為 runner／資源暫態，不改寫產品判定；E2 aggregate仍依完整 record schema保守維持 `Partial／Open`。

### 16.15.1 E2 persistence／history probe rerun（2026-09-01）

以新的隔離 fixture `draft-67c6e1cc-6e2d-4f7e-be9b-bfd32840e41f` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，測試可透過 `DEV039_E2_VERSION_ID` 指定 fixture，避免將已封存版本寫死。四案均以 status `200`、hydrated baseline 與 assignment／relation／link IDs比對，產品 diagnostics 均為 `[]`；archive response `200`、final manifest revision `434adf105d33a8acc9486ab20507a85af047a6195b9d510075426ad6e05ffd2c`，task-owned 5080 runtime 已停止且 port 已釋放。

| Probe | 實測結果 | 判定邊界 |
| --- | --- | --- |
| E2-INVALID zero-mutation | 不相容 Employee→ProcessNode 拒絕後，assignment／duty relation／process link 與 hydrated baseline 相同；visible rejection 後 focus 回原 Employee source（`BUTTON`，`employee-dev039-b16-unassigned`） | 失敗路徑不改資料；不推論 listener cleanup |
| E2-INVALID history | 先完成一次有效 Employee→Position 配置，再執行單次 `Control+Z`；assignment IDs 以 API polling 還原 hydrated baseline | rejected drop 未消耗 Undo slot；沿用既有 canonical history／Undo |
| 四案 persistence | 操作前後開啟既有「儲存與備份」狀態；均為「已自動保存到電腦」，trigger title 無「未儲存變更」 | 目前可支持 failure 不殘留 dirty／autosave；history length、listener inventory與409 recovery仍缺 |

測試結果為 `4 passed (19.1s)`。這是 evidence helper 的可觀測性補強，不新增產品 debug state、API、resolver、MIME、mutation owner或第二保存路徑；四案仍維持 `partial`，E2 aggregate不提升。

### 16.15.2 E2 listener lifecycle／owner cleanup rerun（2026-09-01）

以隔離 fixture `draft-e85b3c44-0c70-4cb1-baf2-16f2bbdf9fae` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，結果為 `4 passed (22.6s)`。browser init 只以 EventTarget API 觀察 document capture `keydown` 與 window `keydown`，不新增產品 debug state、event bus或第二生命週期。四案均在相同 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity下執行；fixture archive response `200`，final manifest revision `4ab018e15bbcc319f8cbc13139147670eaaaaa5a8375b8bb27ecf6fe6164a5c2`，task-owned `5080` runtime與port已cleanup。

| Case | Listener／可見結果 | 判定邊界 |
| --- | --- | --- |
| `E2-INVALID` | document capture `keydown` `0→1→0`；不相容 pair visible rejection、placing清除、focus回Employee source；有效 Employee→Position＋Undo還原 | failure zero-mutation、history／Undo、dirty／autosave與listener回baseline；重新 editable／409 recovery仍缺 |
| `E2-COMMIT-REJECT` | document capture `0→1→0`；duplicate relation visible no-op、source focus保持 | no-op不改relation／revision／dirty，listener回baseline |
| `E2-CAPABILITY-LOSS` | document capture `0→1→0`；切至`390×844`後read-only，source／placing notice清除 | capability fail-closed且listener回baseline；未產生mutation |
| `E2-UNLOAD` | document capture `0→1→0`；關閉Process owner後DOM／notice清除，focus回`workspace-tab-organization` | owner卸載確實終止session，listener不殘留且未產生mutation |

根因修正為既有 `App.tsx` owner-driven lifecycle effect：placing session依source／target所屬surface計算owner，任一必要surface或drawer關閉即呼叫既有 `cancelRelationPlacement()`。未新增listener、resolver、MIME、mutation owner、store、schema或第二輸入路徑。後續五案 rerun 已補 re-entry／409 recovery；E2 aggregate仍為`Partial／Open`，只因嚴格 history-length 未直接暴露；E1／E3／E4判定不變。

### 16.15.3 E2 editable re-entry／409 recovery rerun（2026-09-01）

本輪以新的隔離 fixture `draft-1e4eaddc-43cd-487c-836e-8ec35dd1a6a0` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，五案結果為 `5 passed (25.9s)`。環境維持 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity；五案均以 hydrated API snapshot 作 baseline。fixture cleanup 後 archive response `200`，final manifest revision 為 `9b0ec78e6fbf8135978910517db8724722acd4bd4344786bda6569f862854cbd`，task-owned `5080` runtime 已停止且 port 已釋放。

| Case ID | 新鮮瀏覽器結果 | API／diagnostics | Artifact／判定 |
| --- | --- | --- | --- |
| `E2-INVALID` | 不相容 Employee→ProcessNode visible reject、placing清除、focus回source；有效 Employee→Position後單次`Control+Z`還原 | relation／assignment／link IDs與hydrated baseline相同；dirty／autosave與document listener回baseline | `F039-S7-E2-invalid-pair.png`；failure、focus、history／Undo、persistence與listener欄位齊全 |
| `E2-COMMIT-REJECT` | 已存在 ProcessNode→Duty 關係再次送出，visible no-op且source focus保持 | status `200`；relation／link IDs、revision與dirty不變；產品diagnostics `[]` | `F039-S7-E2-invalid.png`（既有檔名沿用）；duplicate no-op與listener cleanup可支持 |
| `E2-CAPABILITY-LOSS` | placing中切`390×844` mobile readonly後source／notice清除；切回桌面可重新進入，完成ProcessNode→Duty後Undo還原 | relation／link IDs與baseline相同；document listener `1→0`；產品diagnostics `[]` | `F039-S7-E2-capability-loss.png`；capability fail-closed與re-entry沿用同一Command／Undo authority |
| `E2-409-RECOVERY` | fixture helper做timestamp-only server revision bump；stale PUT真實收到`409`；畫面保留未儲存內容並提供複製與明確重新載入，reload後回server baseline | assignment IDs未改；唯一預期409 transport console line由helper diagnostics filter排除，產品diagnostics為空 | `F039-S7-E2-409-recovery.png`；CAS、download-copy、explicit reload與no-overwrite可重演 |
| `E2-UNLOAD` | placing中關閉Process owner；DOM／notice清除，focus回組織tab | relation／link IDs與baseline相同；document listener `1→0`；產品diagnostics `[]` | `F039-S7-E2-unload.png`；owner-driven cleanup與zero-mutation欄位齊全 |

五案共同讀取既有「儲存與備份」狀態，操作前後均為「已自動保存到電腦」且沒有「未儲存變更」。本輪只補 runner 的 re-entry／409 route與既有 `App.tsx` owner lifecycle evidence，沒有新增 debug state、resolver、MIME、mutation owner、store、schema、API或第二保存路徑。E2 的 re-entry／409 欄位已閉合；aggregate 仍維持 `Partial／Open`，因嚴格 evidence schema 尚未直接暴露 history length，並等待 QA-QC 對五案整體判定。E1 ProcessNode↔Duty native仍`blocked／not-run`，E3 standalone／reveal lifecycle仍`Partial／Open`，E4維持`Blocked`。

### 16.15.4 E3 lifecycle browser probe／combined admission rerun（2026-09-01）

以新的隔離 fixture `draft-3983041c-deb2-4e9e-badf-5e1aa5ecbee0` 重跑同一 `output/playwright/dev039/e2-admission.pw.ts`，五個 E2 failure-path 加一個 `E3-LIFECYCLE` 共 `6 passed (31.5s)`。環境為 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity；fixture cleanup後 archive response `200`，final manifest revision為`28390b5c0322c842d28ddc0b31f7fa0db9074810e37e5a890db38495ce322beb`，task-owned `127.0.0.1:5080` runtime與port已cleanup。

| E3 probe | browser observation | 判定邊界 |
| --- | --- | --- |
| mount | Process canvas可見時 active canvas observer `>0`，pending animation frame `0` | canvas owner建立，`pass` |
| close／unmount | 關閉 Process owner後Process DOM／placing notice清除；active canvas observer回`0`且disconnect計數增加；pending animation frame `0` | owner cleanup，`pass` |
| reveal／mindmap→flow | launcher／Drawer重新揭露與切換流程圖後 active canvas observer均為`1`；pending animation frame `0` | 不累積重複observer，`pass` |
| reload | reload後若Process canvas可見，active canvas observer不超過`1`；pending animation frame `0` | bounded reload ownership，`pass` |
| diagnostics／資料 | `productDiagnostics=[]`；probe只包裝既有`ResizeObserver`與`requestAnimationFrame`生命週期，不寫入產品資料 | evidence-only instrumentation，`pass` |

本 probe只計數真正觀察`.process-planning-canvas`的 ResizeObserver，並在穩定等待點檢查 pending animation frame；不把React Flow其他合法observer誤算洩漏。`E3-LIFECYCLE`個案標為`pass`，但`E3-WARNING` aggregate仍為`Partial／Open`，因React Flow warning時序接受理由、standalone／reveal正式 QA-QC與完整 listener inventory仍待獨立判定；不需重做已通過的 mount／close／reveal／reload probe。E1 native、E2 aggregate與E4狀態不變；未新增產品debug state、listener、resolver、MIME、mutation owner、store、schema、API或第二輸入路徑。

### 16.15.5 E2／E3 fresh rerun after evidence serializer correction（2026-09-01）

以隔離 fixture `draft-17e1204c-7d3f-47c2-bd50-c692823be999` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，五案 E2 加 `E3-LIFECYCLE` 共 `6 passed (32.5s)`；環境為 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity，fixture archive response `200`，final manifest revision `d7f7eb9cf31a58f693801d0d46f27866d03659bc8441483f5004131526cbffd9`，task-owned `5080` runtime／port已cleanup。

本輪只修正 runner evidence serializer：`E2-COMMIT-REJECT`及`E2-409-RECOVERY`的 history 欄位改為數值 baseline／recovery欄位，避免把整個 API snapshot 誤寫入 history。五案仍以 hydrated baseline記錄 relation／assignment／link zero-mutation、dirty／autosave、document keydown listener、重新 editable與409 recovery；`E3-LIFECYCLE`仍記錄 Process canvas observer／rAF bounded結果。這些是 evidence-only 變更，不新增產品 debug state、history API、resolver、MIME、mutation owner、schema或第二保存路徑。

| 項目 | 本輪結果 | 判定 |
| --- | --- | --- |
| E2 五案 | runner `6 passed`；fresh-mount history baseline維持`0`，有效配置＋Undo呈`0→1→0`，拒絕／duplicate／capability loss／owner unload／409 recovery均零額外domain mutation | E2 aggregate仍`Partial／Open`；runner欄位已正規化，但產品仍未暴露嚴格 history-length，不能直接升級 aggregate |
| E3-LIFECYCLE | mount／close／reveal／mindmap→flow／reload的 active Process canvas observer不累積、pending rAF `0`、product diagnostics `[]` | 個案`pass`；E3-WARNING aggregate仍待QA-QC warning／standalone／reveal判定 |

本節只更新可重演證據索引；E1 ProcessNode↔Duty native仍`blocked／not-run`，E4仍`Blocked`，不得以本輪 runner pass 宣稱DEV-039整體完成。

### 16.15.6 E2／E3 final stability rerun after transient-notice hardening（2026-09-01）

以隔離 fixture `draft-dbdd513f-a15b-4297-a4f5-819a4f08d80c` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，五案 E2 加 `E3-LIFECYCLE` 共 `6 passed (34.4s)`；fixture cleanup archive response `200`，final manifest revision `e647287fd737dbf35e185ce081a1351b92bced7352ea10e06e370867cbf03e76`，task-owned `5080` runtime／port已cleanup。

capability-loss re-entry 以 persisted `processLinkIds` readback 作為穩定准入，當輪 toast 僅作觀察欄位；此為 runner evidence hardening，不是產品行為變更。E2仍記錄 assignment／relation／link zero-mutation、history／Undo、dirty／autosave、focus、document keydown listener與409 recovery；E3仍記錄 Process canvas bounded observer／rAF。E2 aggregate維持`Partial／Open`、E3-LIFECYCLE個案`pass`、E3-WARNING／E1 native／E4仍開放。

### 16.15.7 E1 CDP native transport capability probe（2026-09-01）

對應主spec第26.21.8節。本輪以全新 B16 fixture `draft-011e0e3a-d7ca-4b00-9b35-a481d9bf8c5c`、canonical `/`、`1280×720`、Chromium `149.0.0.0`與 task-owned `127.0.0.1:5080`，由 `功能→流程規劃→在工作台開啟` 確認 ProcessNode source與Duty target位於可見 owner surface，再以真實 pointer sequence加 CDP `Input.setInterceptDrags`／`Input.dispatchDragEvent`探測 native transport。source與target geometry可命中；CDP事件僅觀察到帶 strict `application/x-orgmaster-entity` 的 `dragenter／dragover`，未建立可採用 source `dragstart`／product `drop`，API前後 revision及既有 process link均不變。

| Case | 結果 | 判定邊界 |
| --- | --- | --- |
| `E1-PROC-DUT-NATIVE` | owner geometry與Duty registered target preflight pass；CDP protocol dragenter／dragover命中 target，但沒有真實 dragstart／drop或新 link | `blocked／not-run`；不可由注入資料推論產品native pass |
| `E1-DUT-PROC-NATIVE` | 本輪未重跑 paired direction | `not-run`；等待同一 runner真正建立HTML5 drag session後成對重跑 |
| cleanup | API status `200`、revision不變、只保留既有 link；fixture archive response `200`、final manifest revision `8dbcc25d675cbf42bce7862918e8160233cfa5b3d89ded4772df1dba541d8101`；5080 runtime／listen port已cleanup，5000 user-owned runtime保留 | evidence／環境清理 pass |

本輪只新增一次性的 runner evidence script `output/playwright/dev039/e1-cdp-probe.mjs`，不改產品契約、資料模型、MIME、resolver、mutation owner、schema、API、global listener或fallback。依主spec第26.19節停止同類工具重試，E1 aggregate仍`Partial／Open`；只有具備可讀取完整 `dragstart→dragover→drop` 與 strict MIME／API readback的 runner，才可重新進入 paired native case。

### 16.15.8 E2 history authority／E3 warning source audit（2026-09-01）

對應主spec第26.21.9～26.21.10節。本輪盤點既有 `useOrgHistory`、App Undo／Redo wiring、Process canvas lifecycle與warning來源；結果確認 history stack只存在 App 內部，產品沒有可讀取 `historyLength` 的正式表面，且 `ProcessPlanningCanvas`／`WorkspaceLayout`沒有直接 `console.warn`。runner 的 `0→1→0` 是有效 mutation＋Undo round-trip 行為紀錄，不是產品 history stack introspection；`ResizeObserver loop completed` 排除亦只是窄 diagnostics filter，不能自動視為可接受的框架訊息。

| Closure | 新增 evidence | 現行判定 | 不得做的事 |
| --- | --- | --- | --- |
| `E2-FAILURE` | source audit確認既有 `past／present／future`、單次commit／Undo／Redo與 no-op 行為；targeted `2 files／10 tests passed` | `Partial／Open`；第26.14節要求的嚴格 `before／after.historyLength` 仍無正式可觀測來源 | 不新增 production debug state、history API、Toolbar欄位或第二 history store |
| `E3-WARNING` | source search區分產品 error boundary、CLI error與Vite tooling advisory；Process lifecycle測試仍為10/10 | `Partial／Open`；需未過濾 raw browser console、standalone／reveal geometry與正式 QA-QC 接受判定 | 不使用 global console suppress、portal、第二 layout state或把 tooling advisory寫成產品 pass |

本輪只補治理與證據邊界，不修改產品契約、資料、dependency、resolver、MIME、mutation owner、schema、API或輸入路徑。只有 QA-QC 明確接受既有 history 行為性 round-trip 作為替代證據，並先 amendment 第26.14節，E2 才可重新判定；否則保留 `Partial／Open`。同理，E3 只有在 raw console 時序、geometry、observer／rAF／listener cleanup與可見錯誤均可稽核後才可關閉。

### 16.15.9 使用者 5000 runtime 的 E1 CDP probe 補充（2026-09-01）

為排除 task-owned `5080` runtime 差異，本輪在使用者既有 `http://localhost:5000`（PID `23840`，不屬於本任務）以全新 B16 fixture `draft-3778d6ea-b4cb-4ce0-b93f-5a8b3afc8b3a` 重跑一次性 CDP probe。環境為 canonical `/`、`1280×720`、HeadlessChrome `149.0.0.0`；prepare revision為`30fb...`，cleanup archive final manifest revision為`b6e50360dd1aeeb7880918e0d3439189ccf79cbb07df031dca07778b6ef1b538`。

| Field | Result | 判定邊界 |
| --- | --- | --- |
| geometry | Process source約`1033.65,322.42`；Duty target約`1119,434.875`，均在owner surface | preflight pass |
| protocol／events | `intercepted=null`、事件與 strict事件均為空，未取得`dragstart／dragover／drop`或`DataTransfer.types` | `blocked`；不得推論native pass |
| API／domain | before／after均`200`，revision均為`7f09bc...`，只保留既有process link，無新增relation／assignment／dirty | zero-mutation；不代表產品失敗 |
| cleanup | fixture archive完成、final manifest可讀；未停止或重啟使用者owned 5000 | evidence／runtime boundary pass |

此筆只增加 runner capability provenance；`E1-PROC-DUT-NATIVE=blocked／not-run`、`E1-DUT-PROC-NATIVE=not-run`、E1 aggregate仍`Partial／Open`。不新增第二輸入路徑、synthetic event、resolver、mutation owner、schema／API或fallback。

本輪文件／靜態 gate：`git diff --check`、`npx tsc --noEmit --pretty false`、`npm run build` 均通過；Vite extension／chunk-size advisory 只屬 tooling，不列為產品 warning。

### 16.15.10 Execution-hygiene provenance（2026-09-01）

對應主spec第26.21.12節。本輪準備的 B16 fixture `draft-2357c0ad-871c-4876-b3d2-935242dad73f` 僅完成 prepare／cleanup，未進入可採用的瀏覽器拖曳操作，故不建立任何 E1／E2／E3案例，也不計入 pass／partial／not-run數量。依既有 fixture CLI cleanup contract archive成功，final `manifestRevision=e1db06f6c35dfa96c1af3ead409c8c50ed73528ac175a2966a766cdf29273a28`，沒有留下active fixture。

同一輪 `npx tsc --noEmit --pretty false`、`npm run build`與`git diff --check`均通過；使用者owned `localhost:5000`維持運作，task-owned `5080`未啟動或遺留。此筆只作執行衛生與清理 provenance，不改變E1 `blocked／not-run`、E2 `Partial／Open`、E3-WARNING `Partial／Open`或E4 `Blocked`。

### 16.15.11 E3-LIFECYCLE task-owned raw-console／lifecycle rerun（2026-09-01）

只執行既有 `e2-admission.pw.ts` 的 `E3-LIFECYCLE`，不重跑已完成的 E2 cases。環境為 task-owned `http://127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720`與 loopback dev identity；隔離 B16 fixture為`draft-fd5238aa-6bf9-4d90-949a-9e22706a8fe2`，archive final manifest revision為`2d40124a3851b98cb41e8b46745fcc997a4f9b118950790d48c87c6cb0848e1d`。結果為`1 passed (11.5s)`。

| Checkpoint | Observation | 判定 |
| --- | --- | --- |
| mount／close | `activeCanvasObservers`由`1`降至`0`，disconnect增加，兩處`pendingRaf=0` | 個案 pass |
| reveal／mindmap→flow | reveal與flow各為`activeCanvasObservers=1`，`pendingRaf=0` | 個案 pass |
| reload | `activeCanvasObservers≤1`、`pendingRaf=0`、`productDiagnostics=[]` | 個案 pass |
| console／runner | raw `diagnostics=[]`；runner維持既有對`ResizeObserver loop completed`非產品訊息的排除；artifact=`output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png` | 不得提升`E3-WARNING` aggregate |
| cleanup／runtime | fixture archive成功，task-owned `5080`停止並釋放；user-owned `5000`未觸碰 | evidence／runtime boundary pass |

此筆僅補 `E3-LIFECYCLE` 可重演證據，不改變`E3-WARNING=Partial／Open`；React Flow warning時序接受理由、standalone／reveal正式 QA-QC與listener inventory仍待獨立 closure。E1 native、E2嚴格 history-length與E4狀態不變；不新增產品debug state、resolver、MIME、mutation owner、schema、API、global listener或第二輸入路徑。

### 16.15.12 E3 geometry／listener record hardening（2026-09-01）

同一既有 `E3-LIFECYCLE` runner 增加 test-only geometry與scoped listener欄位，不修改產品 state／API或 lifecycle owner。環境為 task-owned `127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720`；fixture `draft-2adac105-5202-4554-a7d0-6233cbdf32ac`，結果 `1 passed (10.2s)`，archive final manifest revision `848e8b7bf861957022fa8fcb0b505b80439b60fea616eedfd77bccc9c42ee10c`，artifact=`output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png`。

| Field | Observation | 判定 |
| --- | --- | --- |
| geometry | mount／reveal／flow／reload visible canvas count=`1`；每個可見 canvas皆`width≤parentWidth+1`、`height≤parentHeight+1`；close後 count=`0` | 個案 pass |
| scoped listeners | document capture `keydown`全時序回 baseline `0`；window keydown於owner close／reveal恢復`7→4→7` | scoped cleanup pass；不等同全量 listener inventory |
| lifecycle／console | observer最多`1`、pending rAF=`0`、raw與product diagnostics為空；runner仍排除`ResizeObserver loop completed` | `E3-LIFECYCLE=pass`；`E3-WARNING=Partial／Open` |

此筆只強化 E3 record；未過濾 warning 時序、standalone／reveal 正式接受理由及完整 listener inventory仍需 QA-QC 獨立 closure。E1 native、E2嚴格 history-length與E4不變，fixture與5080 runtime均已清理，5000 user-owned runtime未觸碰。

### 16.15.13 E3 full listener inventory exploratory observation（2026-09-01）

既有 `E3-LIFECYCLE` runner 增加 test-only `EventTarget` listener add／remove與DOM `isConnected` 分類，沒有改產品 state／API／lifecycle owner；probe 會持有 target 參考，故 disconnected count 只能作線索。fixture `draft-373f011e-0b0d-4636-a344-89145edd552d`、task-owned `127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720`，結果 `1 passed (18.9s)`，archive final `manifestRevision=f99a52978576269240a7f3f25069e61d1240cba26ddc456f910c44aca16dd29d`，artifact=`output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png`。

| Checkpoint | Observation | 判定 |
| --- | --- | --- |
| mount／close／reveal／flow | total／connected／disconnected 為 `522/377/145`、`646/351/295`、`817/377/440`、`819/379/440`；document capture `keydown=0`、window keydown `7→4→7`；`react-flow__viewport-portal` 由`276`增至`552` | exploratory observation；不可直接判 leak |
| reload | `379/379/0`，portal target回`138`，document `keydown=0`、window `7` | instrumentation baseline pass |
| reclosed／rerevealed | `503/351/152`、`674/377/297` | aggregate仍 open |

`E3-LIFECYCLE`個案維持`pass`；`E3-WARNING=Partial／Open`，待 QA-QC 以未注入 monkey-patch 的 DevTools listener／heap或production-like remount profile 判定 React Flow portal target 是否為產品問題。不得用 global suppress、第二 lifecycle owner或debug API繞過。fixture／5080已清理，5000 user-owned未觸碰；E1、E2與E4不變。

### 16.15.14 E3 raw-console assertion hardening（2026-09-01）

既有 `E3-LIFECYCLE` runner 新增嚴格 `expect(diagnostics).toEqual([])`；`productDiagnostics` 僅保留作歷史相容欄位，不能再以 compatibility filter 單獨取得通過。這是 test-only assertion，不修改產品 state、API、lifecycle owner、listener、resolver、MIME、schema或輸入路徑。

隔離 fixture `draft-ee9cb1d2-b8f8-45e9-8f47-491adc7375b9` 於 task-owned `127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720` 執行，結果 `1 passed (11.0s)`，raw／product diagnostics 均為`[]`；archive final manifest revision=`d5445aad498c8cb3ff140905e762ba33a1f93f62108f6c02f74082cb6b03ed9c`。

本筆只把 `E3-LIFECYCLE` raw-console 個案證據收緊為 `pass`，不提升 `E3-WARNING` aggregate；React Flow warning 時序、standalone／reveal 正式 QA-QC與完整 listener inventory仍需獨立判定。5080已停止並釋放，5000 user-owned runtime未觸碰；E1、E2與E4不變。

### 16.15.15 E3 native DevTools listener／warning closure（2026-09-01）

同一隔離 B16 fixture `draft-5ab9ff12-e5f0-4bfc-8141-eddc1fb4e078` 以既有 `e2-admission.pw.ts` 合併重跑 `E3-LIFECYCLE` 與 E3-WARNING native listener case，結果 `2 passed (15.7s)`；與同 fixture 的五案 E2 合計為 `7 passed`。E3-WARNING 不注入 `EventTarget` monkey-patch，也不持有 DOM target，只透過 Chromium CDP `DOMDebugger.getEventListeners` 讀取 `window`、`document`、React Flow root與 viewport portal原生 listener。

| Checkpoint | Result | 判定 |
| --- | --- | --- |
| mount | Process canvas=`1`、portal=`2`；window／document／viewport portal listener=`40／8／139`；raw diagnostics=`[]` | pass |
| close／unmount | Process canvas=`0`、portal=`1`；window／document=`23／4`；無 visible error或 mutation | pass |
| reveal／mindmap→flow | Process canvas回`1`；window／document／portal回`40／8／139`；既有 geometry／observer／rAF同步通過 | pass |
| reload | Process canvas=`1`、portal=`2`；listener再次回`40／8／139` mount baseline；raw diagnostics=`[]` | pass |

本筆滿足主spec第26.14.3節的 E3-WARNING lifecycle required record：首次 mount、split／close、reveal、流程圖切換與 reload 均在同一 fixture 完成；穩定畫面無 parent-size warning、無 overflow、無可見錯誤，且原生 CDP listener在 reload／reveal回到 mount baseline。先前第16.15.13節 full listener probe因持有 DOM target仍只作歷史 exploratory provenance，不與本筆混用。

因此 `E3-WARNING=pass`；不需建立第二套 lifecycle owner、global console suppress、portal搬移或產品 debug API。E1 native仍因真實 HTML5 `DataTransfer` runner缺口維持`blocked／not-run`，E2因嚴格 history-length schema維持`Partial／Open`，E4仍為`Blocked`。archive final manifest revision=`2903c3813ccd0cd38de638c10d6646a8c5b4ab02da5b6055b5e96a300179eee6`，artifact=`output/playwright/dev039/F039-S7-E3-warning-cdp-listeners.png`；5080已停止並釋放，5000 user-owned runtime未觸碰。

### 16.15.16 E1 ProcessNode→Duty native CUA observation（2026-09-01）

對應主spec第26.21.18節。本筆以 task-owned `http://127.0.0.1:5080`、隔離 B16 fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc`、canonical `/`、`1280×720`、Chromium `149.0.0.0`與 In-app Browser CUA 完成一次實際跨面板操作；先由 `功能→流程規劃→在工作台開啟` 與 `功能→工作職掌` 開啟 Process panel／Duty Drawer，再將 `process-node-dev039-b16-open` relation source handle拖至 `duty-dev039-b16-new` registered target。

| Field | Result | 判定邊界 |
| --- | --- | --- |
| visible delivery | Duty target由「加入既有職掌」變為「職掌連結 1 項」，並出現解除連結控制；Process／Duty兩面板同步更新 | product DOM mutation observed |
| API readback | status=`200`；revision由`65f0b6970f54c0598b227238ea39b8fc3315a0adb7c6fd80e4f446d681e05d4c`變為`743e6a6a63497d9281ede117b4dfa493ee01690af8b64476c530444be5af213d`；新增`process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`，既有`process-link-dev039-b16-linked-primary`不變 | canonical readback pass |
| transport evidence | CUA未提供可稽核 strict `DataTransfer.types`、`dragstart→dragover→drop`完整序列或每一事件payload；未執行 paired Duty→ProcessNode | `E1-PROC-DUT-NATIVE=Partial／Open`；`E1-DUT-PROC-NATIVE=not-run` |
| diagnostics／cleanup | browser warn／error log為空；fixture archive=`200`、final manifest revision=`005fda19cd0655480ee0a4d71cdaf3a8ac0140bf783e6045e536d9dc6f372c56`；5080已停止／釋放，5000 user-owned未觸碰 | evidence boundary pass |

本筆只把 ProcessNode→Duty 從 `blocked／not-run` 補成一次性 `Partial／Open` CUA observation，不提升 E1 aggregate，也不取代第16.15.7節 strict runner admission。後續需有能讀取真實 HTML5 `DataTransfer` 的 runner，才可補 strict MIME／event sequence與paired direction；不得新增第二 MIME、synthetic fallback、resolver、mutation owner、API直寫或第二份清冊。

### 16.15.17 E2 behavioral Undo evidence fresh rerun（2026-09-01）

對應主spec第26.21.19節。本輪以隔離 B16 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 使用固定 Playwright `1.62.1`、Chromium `149.0.7827.55`、task-owned `127.0.0.1:5080`、canonical `/`、`1280×720`與 loopback dev identity重跑既有 `e2-admission.pw.ts`；五案 E2 加 `E3-LIFECYCLE`、`E3-WARNING` 共 `7 passed`。runner 明確切換流程圖視角以確保 target 可見，合法 mutation 後等待既有 autosave settle，再執行恰好一次 `Control+Z`。

| Case | `historyEvidence`／可見結果 | 判定 |
| --- | --- | --- |
| `E2-INVALID` | 不相容 Employee→ProcessNode visible reject、focus回source、zero mutation；後續 Employee→Position mutation＋Undo回baseline | pass |
| `E2-COMMIT-REJECT` | duplicate ProcessNode→Duty visible no-op、relation／revision不變；後續 Employee→Position mutation＋Undo回baseline | pass（optional） |
| `E2-CAPABILITY-LOSS` | mobile readonly清除placing；桌面重新 ProcessNode→Duty mutation，persisted link readback後Undo回baseline | pass |
| `E2-409-RECOVERY` | stale PUT真實409、保留內容並明確reload；recovery後 Employee→Position mutation＋Undo回baseline | pass（optional） |
| `E2-UNLOAD` | 關閉 Process owner 清除session／focus回organization；重新 Employee→Position mutation＋Undo回baseline | pass |

五案 `validMutationObserved=true`、`undoRestoredBaseline=true`，baseline／mutation／post-Undo canonical relation IDs完整可比對；既有 dirty／autosave、document keydown listener、API status／revision與產品 diagnostics亦符合 schema。fixture archive final `manifestRevision=562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`，5080已停止／釋放，5000 user-owned未觸碰。E2 aggregate現為`Pass（evidence）`，正式 QA-QC仍待覆核；E1 strict native／paired direction與E4不變。

### 16.15.18 E1 headful native runner capability probe（2026-09-01）

對應主spec第26.21.22節。本輪建立一次性 `scripts/dev039-headful-native-probe.mjs`，以 Playwright `headless:false`、實際滑鼠路徑排除既有 headless／CDP runner限制；沿用 canonical `/`、B16 registered source／target、strict `application/x-orgmaster-entity`與既有 cleanup規則，未新增產品事件通道、resolver、Command、MIME或資料模型。

| Field | Result | 判定 |
| --- | --- | --- |
| fixture／runtime | `draft-cdd24b6d-d8de-404a-ac9a-1ee9a257b899`；task-owned `127.0.0.1:5080`；`1280×720`；loopback dev identity | 可重演入口已固定 |
| first attempt | 流程面板未先選取 ProcessNode，Duty target未進入可見狀態；harness隨後補上節點選取 | 不產生 E1 record |
| second attempt | headful Chrome在原生拖曳期間超過75秒無輸出，任務專用 probe已中止；未取得`dragstart→dragover→drop`、strict `DataTransfer.types`、API mutation或paired direction | `E1-PROC-DUT-NATIVE=blocked／not-run`；`E1-DUT-PROC-NATIVE=not-run` |
| mutation／cleanup | 未使用 `page.evaluate` mutation、synthetic event、API直寫或style補位；fixture已由既有 cleanup command recoverably archive，CLI exit=`0`、final `manifestRevision=49bf03ff348e27e5dc66b0d428119e6ef759e9b99eb6e504de5bfff61bad728b`；task-owned runtime已釋放、5000未被觸碰 | 不改E1 aggregate／E4；不新增第二runner或fallback |

本筆只保存「不同 headful runner仍未完成 strict admission」的 provenance，不代表產品 resolver／Command／target wiring失效。除非出現能讀取真實 HTML5 `DataTransfer` 的新能力，否則停止同類 runner重試；不得新增第二MIME、synthetic fallback、resolver、mutation owner或第二份清冊。

### 16.15.19 E1 ProcessNode→Duty strict native single-direction pass（2026-09-01）

對應主spec第2.5.2／26.21.23節。本筆以全新隔離 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673`、task-owned `127.0.0.1:5080`、canonical `/`、`1280×720`、Chromium `149.0.0.0`及loopback dev identity，從 `process-node-dev039-b16-open` source handle拖至 `duty-dev039-b16-new` registered target。

| Field | Result | 判定 |
| --- | --- | --- |
| transport | `dragstart→dragenter／dragover→drop→dragend`；strict `application/x-orgmaster-entity`於target dragenter／dragover／drop與source dragend可讀；無`defaultPrevented` | pass（單方向） |
| visible result | UI顯示「已建立跨面板關係」，Duty顯示「職掌連結 1 項」 | pass |
| persistence | 明確 `Control+S` 後API status=`200`；revision `4c3ce4dc...`→`0425c154...`；canonical link `process-duty-2`只一筆 | pass |
| artifact | `output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json` | pass |
| cleanup | fixture archive=`archived`、manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`；5080釋放、5000未觸碰 | pass |

此筆僅將 `E1-PROC-DUT-NATIVE`標為`pass`；paired `E1-DUT-PROC-NATIVE`的最新 reverse boundary另見第16.15.20節，正式為`blocked／not-run`，E1 aggregate、正式 QA-QC與E4不變。一次性runner已移除，不形成第二證據清冊；產品仍只使用單一 `RelationPlacementSession`、registered resolver與既有mutation owner。

### 16.15.20 E1 Duty→ProcessNode paired native runner boundary（2026-09-01）

對應主spec第26.21.24節。本筆只記錄反向 paired native runner 的可稽核邊界，不把未完成的 terminal `drop`誤報為 pass，也不覆寫第16.15.19節的 ProcessNode→Duty 單方向 pass。

| Field | Result | 判定 |
| --- | --- | --- |
| fixture／entry | `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`；canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`；`duty-dev039-b16-primary / primary-execute` → `process-node-dev039-b16-open` | pass（前置條件） |
| owner geometry | source `1119,622.546875,49×28`；target `858.6439819335938,293,190.33709716796875×46.719085693359375`；均在可見 owner surface | pass（前置條件） |
| transport | `dragstart → dragenter → dragover → dragend`；strict `application/x-orgmaster-entity`於target `dragenter／dragover`與source `dragend`可讀；terminal `drop`未出現 | blocked |
| visible result | 僅有拖曳提示／placing notice，未建立關係 | blocked |
| persistence／zero-mutation | API status=`200`；revision前後均為`c018fc0de0f1a80af43d6663f3a8099ef8fa35541f925f289afec366e3cb6c3a`；既有 `process-link-dev039-b16-linked-primary`保留，`createdLinkId=null` | pass（zero-mutation） |
| artifact／cleanup | `output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`；archive manifest=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`；5080釋放、5000未觸碰 | pass（provenance） |

正式判定：`E1-DUT-PROC-NATIVE=blocked／not-run`。本筆不改 E1 aggregate、E2／E3／E4或產品契約；除非取得能讀取真實 HTML5 `DataTransfer`並完成 terminal `drop`的新能力，否則停止同類 runner重試，不新增 synthetic fallback、第二 MIME／resolver／mutation owner、API直寫或第二份證據清冊。

### 16.15.21 E1 Duty→ProcessNode paired native strict pass（2026-09-01）

對應主spec第26.21.25節。本筆覆寫第16.15.20節的 runner boundary，但保留該筆作為歷史 provenance；產品僅將 Duty responsibility lane source 的 `effectAllowed` 由 `copy` 對齊既有 ProcessNode／target 的 `link`，其餘 relation contract與mutation authority不變。

| Field | Result | 判定 |
| --- | --- | --- |
| fixture／entry | `draft-4af67fa3-4e33-4644-8768-cb65d4642396`；canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`；`duty-dev039-b16-primary / primary-execute` → `process-node-dev039-b16-open` | pass（前置條件） |
| transport | 真實 `dragstart→dragenter／dragover→drop→dragend`；strict `application/x-orgmaster-entity`於target dragenter／dragover／drop與source dragend可讀；`effectAllowed=link`、`dropEffect=link`；無`defaultPrevented` | pass |
| visible result | UI顯示「已建立跨面板關係」 | pass |
| persistence | API status=`200`；revision `baebb74bee27faf94294cc3b93e72551358d6575e563f1334e999e076c10bdf9`→`cd8de58e1607e5c374b0293711e5e59d98f131c5b0b68a7754bb34378c8f515d`；新增canonical `process-duty-2`，既有 `process-link-dev039-b16-linked-primary`保留，duplicate count=`1` | pass |
| artifact／cleanup | `output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`；fixture archive=`archived`、manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`；5080釋放、5000未觸碰 | pass |

正式判定：`E1-DUT-PROC-NATIVE=pass`；連同既有三筆 strict direction record，E1 aggregate為`Pass（evidence）`。正式 QA-QC已覆核四筆 E1、E2／E3 records、artifact、cleanup與四方文件同版；Parity不因此授權 commit、merge、deploy、release或刪除舊功能，E4仍為`Candidate Freeze Ready / Authorization Pending`。

### 16.15.22 E1 desktop viewport extension evidence（2026-09-01）

對應主spec第26.21.26節。本節只補足 `1440×900` 與 `1024×768` 的 viewport acceptance，不變更任何 P／R／X disposition。兩案沿用同一正常入口、single `RelationPlacementSession`、registered resolver、strict `application/x-orgmaster-entity` 與既有 `LINK_PROCESS_NODE_DUTY` authority；只以 evidence-only runner 參數切換 viewport，未新增產品輸入路徑、MIME、resolver、Command、API、state 或 layout store。兩案均以真實滑鼠路徑取得完整 `dragstart→dragenter／dragover→drop→dragend`、`effectAllowed=link`／`dropEffect=link`、strict MIME、UI成功結果、API revision變化、canonical `process-duty-2` readback、`diagnosticsCount=0`與cleanup。

| Viewport | Case／fixture | API revision | 結果 | Cleanup／artifact |
| --- | --- | --- | --- | --- |
| `1440×900` | `E1-CDP-PROC-DUT-NATIVE-1440x900`／`draft-430665c2-a669-454d-a592-e50766a8aa96` | `30d75f95530fe1a94fa447a7ba2f60419176b6aae19a050a0a70bbcbd84b2d88` → `5e7a9c82ebc7c18b37448d4f83c53f519d435bb0246420874e86a53256bf50c2` | 新增`process-duty-2`、保留`process-link-dev039-b16-linked-primary`；UI「已建立跨面板關係」 | archive=`archived`、manifest=`6aef350334038315535e4e9b436ae5a803f9e1c725a8a2239ba2ee551a1fab34`；[record](../../output/playwright/dev039/F039-S7-E1-process-duty-native-1440x900.json)、[screenshot](../../output/playwright/dev039/F039-S7-E1-cdp-process-duty-1440x900.png) |
| `1024×768` | `E1-CDP-PROC-DUT-NATIVE-1024x768`／`draft-71867b51-ba53-41eb-a86f-9ead100e5cf8` | `78387b891f1a7fdadb60d50059a965e3497a4666113f2747504fd3a791ea7ed2` → `ccb242db183f90c5e1578e8c522900d04e5a0d9bb124d098f9e198255aecaccd` | 新增`process-duty-2`、保留`process-link-dev039-b16-linked-primary`；UI「已建立跨面板關係」 | archive=`archived`、manifest revision未由compact runner輸出，record保留`null`；[record](../../output/playwright/dev039/F039-S7-E1-process-duty-native-1024x768.json)、[screenshot](../../output/playwright/dev039/F039-S7-E1-cdp-process-duty-1024x768.png) |

`1024×768` 的 archive manifest revision 只因 runner 輸出缺欄位而未知，文件明確保留`null`，不得補猜。此節不新增 E1 aggregate、runner contract或第二證據清冊；正式 E1 aggregate與 QA-QC狀態仍由第0.1節、四筆 strict direction records及本 manifest 共同擁有。

## 17. 變更紀錄

- 2026-09-01：新增第16.15.22節桌面 viewport extension evidence。以同一既有 native relation contract、正常入口與 evidence-only runner 補驗`1440×900`、`1024×768`；兩案均完成完整native event chain、strict MIME、UI／API readback、diagnosticsCount=`0`與cleanup，record／screenshot已索引。`1024×768` archive manifest revision未由compact runner輸出，刻意保留`null`；不新增產品輸入路徑、resolver、Command、API、state或第二清冊，E4授權邊界不變。

- 2026-09-01：新增第16.15.21節 E1 Duty→ProcessNode paired native strict pass。產品只將`ProcessDutyBridge` Duty lane source 的`effectAllowed`由`copy`對齊既有`link`，未新增MIME、resolver、Command、API、state、listener或第二輸入路徑。全新 B16 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396`以真實滑鼠路徑取得完整native event chain、strict MIME、UI成功結果、API `200`／revision變化／canonical `process-duty-2` readback與cleanup，artifact=`F039-S7-E1-duty-process-native-strict.json`，archive manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`。E1四個minimum directions均有strict evidence，aggregate為`Pass（evidence）`；本輪正式 QA-QC已覆核 E1～E3 records、artifact、cleanup與四方文件同版，E4僅待使用者／PM明確授權，不代表commit／merge／deploy／release。

- 2026-09-01：新增第16.15.20節 E1 Duty→ProcessNode paired native runner boundary。全新 B16 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`由既有已連結職掌 lane拖至 ProcessNode，觀察到`dragstart／dragenter／dragover／dragend`與strict MIME，但沒有 terminal `drop`、UI成功結果或domain mutation；API status=`200`、revision／既有link IDs不變，artifact=`F039-S7-E1-duty-process-native-blocked.json`，fixture archive manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`。正式判定`E1-DUT-PROC-NATIVE=blocked／not-run`，E1 aggregate、正式 QA-QC與E4不變；不新增runner、fallback、MIME、resolver、mutation owner或第二證據清冊。

- 2026-09-01：新增第16.15.19節 E1 ProcessNode→Duty strict native 單方向 pass。全新 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673` 在既有 pointer／mouse capture與App deferred placement begin窄修正後，取得完整 `dragstart→dragenter／dragover→drop→dragend`、strict MIME、UI結果、明確儲存後API `200`／revision變化與canonical `process-duty-2` readback；artifact=`F039-S7-E1-process-duty-native-strict.json`，archive manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`。僅將`E1-PROC-DUT-NATIVE`標為`pass`，paired方向仍`not-run`，E1 aggregate與E4不變；一次性runner已移除，不新增第二輸入路徑或清冊。

- 2026-09-01：補記最後一次 `ProcessPlanningWorkbench.test.tsx` targeted rerun 超過60秒無輸出後已安全停止；保留既有 `1 file／5 tests passed`成功紀錄，不以未完成重跑覆蓋基線。此筆不改 E1／E4、產品契約或 Parity 判定。

- 2026-09-01：同步 ProcessNode source handle pan-arbitration 窄修正。Parity記錄既有 handle 的 `onMouseDownCapture` stopPropagation、targeted `1 file／5 tests passed`、typecheck／build通過及修正後仍缺 strict `dragover／drop` 的 runner邊界；不改 E1／E4 判定、不新增輸入路徑或 evidence schema。

- 2026-09-01：新增第0.2節 `RD handoff index`，將後續工作收斂為 E1 strict native、QA／QC review與E4 candidate freeze三包；Parity維持只做能力索引，不新增record schema、resolver、mutation owner或第二份證據清冊。

- 2026-09-01：新增第16.15.17節 E2 behavioral Undo evidence fresh rerun。隔離 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 以固定 runner 完成五案 E2＋兩案 E3，共`7 passed`；五案均輸出`historyEvidence`，一次合法 mutation後恰好一次`Control+Z`回到完整 canonical relation baseline，E2 aggregate提升為`Pass（evidence）`，正式 QA-QC仍待覆核。fixture archive final manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`；E1 strict native／paired direction與E4不變，未新增產品 debug API、第二 history store或第二輸入路徑。

- 2026-09-01：新增第16.15.15節 E3 native DevTools listener／warning closure。以同一隔離 fixture `draft-5ab9ff12-e5f0-4bfc-8141-eddc1fb4e078` 合併重跑 E3-LIFECYCLE 與原生 CDP listener case，結果 `2 passed (15.7s)`，與五案 E2 合計 `7 passed`；raw diagnostics為`[]`，Process canvas在close後為`0`、reveal／flow／reload為`1`，window／document／viewport portal listener回到`40／8／139` mount baseline。artifact=`F039-S7-E3-warning-cdp-listeners.png`，archive final manifest revision=`2903c3813ccd0cd38de638c10d6646a8c5b4ab02da5b6055b5e96a300179eee6`。E3-WARNING aggregate提升為`pass`；E1 native、E2 history-length與E4不變，未新增產品架構或第二輸入路徑。

- 2026-09-01：新增第16.15.16節 E1 ProcessNode→Duty native CUA observation。隔離 B16 fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc`、task-owned `127.0.0.1:5080`、canonical `/`、`1280×720`以 In-app Browser CUA 完成一次source handle→Duty registered target操作；Duty target顯示「職掌連結 1 項」，API status=`200`、revision由`65f0b697...`變為`743e6a6a...`，新增canonical link `process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`，browser warn／error為空。因CUA未提供strict `DataTransfer.types`與完整`dragstart→drop` trace，ProcessNode→Duty標`Partial／Open`、paired direction仍`not-run`，E1 aggregate與E4不變；fixture archive final manifest revision=`005fda19cd0655480ee0a4d71cdaf3a8ac0140bf783e6045e536d9dc6f372c56`，5080已釋放、5000未觸碰。未新增產品架構、第二MIME、fallback或第二份清冊。

- 2026-09-01：新增第16.15.14節 E3 raw-console assertion hardening。既有 E3-LIFECYCLE runner 以嚴格 `expect(diagnostics).toEqual([])` 驗證原始 console，隔離 fixture `draft-ee9cb1d2-b8f8-45e9-8f47-491adc7375b9` 結果 `1 passed (11.0s)`，raw／product diagnostics均為`[]`，archive final manifest revision=`d5445aad498c8cb3ff140905e762ba33a1f93f62108f6c02f74082cb6b03ed9c`；此筆只強化 evidence，不關閉 E3-WARNING aggregate、E1 native、E2 history-length或E4，未新增產品架構或第二輸入路徑。

- 2026-09-01：新增第16.15.8節 E2 history authority／E3 warning source audit。確認 `useOrgHistory` 的 `past／present／future` 未暴露為產品 API，runner 的 `0→1→0` 僅為行為性 Undo round-trip；Process canvas／WorkspaceLayout無直接 `console.warn`，Vite extension advisory與React Flow warning分開治理。E2／E3維持`Partial／Open`，不新增產品debug state、history API、global suppress、第二layout／history store或其他技術債。

- 2026-09-01：新增第16.15.10節 execution-hygiene provenance。B16 fixture `draft-2357c0ad-871c-4876-b3d2-935242dad73f` 只完成 prepare／cleanup，未進行可採用拖曳操作，archive manifest revision為`e1db06f6c35dfa96c1af3ead409c8c50ed73528ac175a2966a766cdf29273a28`；不得把此筆列入E1／E2／E3案例或pass／partial／not-run數量。同步確認`npx tsc --noEmit --pretty false`、`npm run build`與`git diff --check`通過，5000 user-owned runtime保留、5080未遺留；E1／E2／E3／E4判定不變。

- 2026-09-01：新增第16.15.11節 E3-LIFECYCLE task-owned raw-console／lifecycle rerun。以隔離 fixture `draft-fd5238aa-6bf9-4d90-949a-9e22706a8fe2` 只執行既有 runner 的 E3-LIFECYCLE，結果 `1 passed (11.5s)`；mount／close／reveal／mindmap→flow／reload均維持bounded Process canvas observer／rAF（`activeCanvasObservers`最多1、`pendingRaf=0`），raw diagnostics與product diagnostics均為空，archive final manifest revision `2d40124a3851b98cb41e8b46745fcc997a4f9b118950790d48c87c6cb0848e1d`，task-owned 5080已停止並釋放、5000 user-owned未觸碰。此筆只補E3-LIFECYCLE個案，不關閉E3-WARNING aggregate、E1 native、E2 aggregate或E4；不新增產品架構或第二輸入路徑。

- 2026-09-01：新增第16.15.12節 E3 geometry／listener record hardening。既有 runner 以隔離 fixture `draft-2adac105-5202-4554-a7d0-6233cbdf32ac` 增加可見 canvas geometry與document／window keydown scoped inventory，結果 `1 passed (10.2s)`；canvas在穩定點不超過parent、close後visible count為`0`、document listener回baseline `0`、observer最多`1`且pending rAF=`0`，archive final manifest revision `848e8b7bf861957022fa8fcb0b505b80439b60fea616eedfd77bccc9c42ee10c`。此筆只強化E3-LIFECYCLE evidence，不提升E3-WARNING aggregate，未新增產品架構或第二套輸入路徑。

- 2026-09-01：新增第16.15.13節 E3 full listener inventory exploratory observation。隔離 fixture `draft-373f011e-0b0d-4636-a344-89145edd552d` 重跑既有 E3-LIFECYCLE，結果 `1 passed (18.9s)`；全量 listener／`isConnected` 顯示 close／reveal／flow 的 React Flow portal target 計數增加，但 reload 後回到 `disconnected=0`。因 probe 會持有 DOM target，這是待 QA-QC 判讀的線索，不等同產品 leak；E3-LIFECYCLE個案為`pass`、E3-WARNING aggregate維持`Partial／Open`，archive final manifest revision=`f99a52978576269240a7f3f25069e61d1240cba26ddc456f910c44aca16dd29d`，5080已釋放、5000未觸碰。

- 2026-09-01：補上第16.15.7節 E1 CDP native transport capability probe。以全新 B16 fixture `draft-011e0e3a-d7ca-4b00-9b35-a481d9bf8c5c`、canonical `/`、`1280×720`、Chromium `149.0.0.0`與 task-owned `127.0.0.1:5080`確認 source／target geometry；CDP僅觀察到注入 strict MIME的 `dragenter／dragover`，未建立可採用真實 `dragstart／drop`，API前後revision與既有process link不變。fixture archive response `200`、final manifest revision `8dbcc25d675cbf42bce7862918e8160233cfa5b3d89ded4772df1dba541d8101`，5080 runtime／listen port已cleanup，5000 user-owned runtime保留。依保守判定E1 ProcessNode↔Duty仍`blocked／not-run`、paired direction仍`not-run`、E1 aggregate`Partial／Open`；只新增 evidence provenance，不新增產品架構或fallback。

- 2026-09-01：補上第16.15.6節 E2／E3 final stability rerun。隔離 fixture `draft-dbdd513f-a15b-4297-a4f5-819a4f08d80c` 以同一 runner 重跑五案 E2 加 `E3-LIFECYCLE`，結果 `6 passed (34.4s)`，archive final manifest revision `e647287fd737dbf35e185ce081a1351b92bced7352ea10e06e370867cbf03e76`；5080 runtime／port已cleanup。capability-loss re-entry 的驗收改以 persisted process-link readback，toast僅作觀察，避免短暫通知造成假陰性；不新增產品debug state、history API、resolver、MIME、mutation owner、schema或第二保存路徑。E2 aggregate仍`Partial／Open`，E3-LIFECYCLE個案`pass`，E3-WARNING／E1 native／E4仍開放。

- 2026-09-01：補上第16.15.5節 E2／E3 fresh rerun 與 evidence serializer correction。以隔離 fixture `draft-17e1204c-7d3f-47c2-bd50-c692823be999` 重跑五案 E2 加 `E3-LIFECYCLE`，結果 `6 passed (32.5s)`，archive final manifest revision `d7f7eb9cf31a58f693801d0d46f27866d03659bc8441483f5004131526cbffd9`。runner將 E2 duplicate／409 recovery 的 history evidence 改為數值 baseline／recovery欄位，避免誤寫 API snapshot；產品未新增 debug state、history API、resolver、MIME、mutation owner、schema或第二保存路徑。E2 aggregate仍因嚴格 history-length schema未直接暴露維持`Partial／Open`；E3-LIFECYCLE個案`pass`、E3-WARNING aggregate、E1 native與E4仍開放。

- 2026-09-01：完成 DEV-039 現行索引一致性稽核。將第16.6、16.14、16.15等較早摘要明確對齊最新五案 E2 browser record與16.15.4 E3-LIFECYCLE probe；重新 editable／409 recovery不再列為待補，E2 aggregate只因嚴格 history-length 未直接暴露維持`Partial／Open`，E3 warning／正式 QA-QC仍 open，E1 ProcessNode↔Duty native仍`blocked／not-run`，E4仍`Blocked`。本次只修正清冊指向與判定文字，不修改產品契約、資料、測試、dependency、runtime、commit、merge、deploy或release。

- 2026-09-01：補上第16.15.4節 E3 lifecycle browser probe／combined admission。以隔離 fixture `draft-3983041c-deb2-4e9e-badf-5e1aa5ecbee0` 重跑五個E2 failure-path與`E3-LIFECYCLE`，共 `6 passed (31.5s)`；mount／close／reveal／mindmap→flow／reload均觀察到Process canvas active observer不累積、pending animation frame為`0`，產品 diagnostics為空。archive final manifest revision為`28390b5c0322c842d28ddc0b31f7fa0db9074810e37e5a890db38495ce322beb`，5080 runtime與port已cleanup。`E3-LIFECYCLE`個案標`pass`，`E3-WARNING` aggregate仍`Partial／Open`；不新增產品debug state、listener、resolver、MIME、mutation owner、schema、API或第二輸入路徑。
- 2026-09-01：補上第16.15.3節 E2 editable re-entry／409 recovery rerun。以隔離 fixture `draft-1e4eaddc-43cd-487c-836e-8ec35dd1a6a0` 重跑五案，結果 `5 passed (25.9s)`；E2-CAPABILITY-LOSS 完成切回桌面後重新進入並以 Undo 還原，E2-409-RECOVERY 以 timestamp-only server revision bump 重演 stale PUT `409`、複製未保存內容與明確重新載入，五案同步 assignment／relation／link zero-mutation、dirty／autosave、document keydown listener與fixture cleanup。archive final manifest revision為`9b0ec78e6fbf8135978910517db8724722acd4bd4344786bda6569f862854cbd`，5080 runtime與port已cleanup；E2 aggregate仍因嚴格 history-length schema與E1／E3未閉合維持`Partial／Open`，不改產品資料模型、API、resolver、MIME或第二輸入路徑。

- 2026-09-01：補上第16.15.2節 E2 listener lifecycle／owner cleanup rerun。以隔離 fixture `draft-e85b3c44-0c70-4cb1-baf2-16f2bbdf9fae` 重跑四案，結果 `4 passed (22.6s)`；document capture `keydown` 均由 placing 的`1`回 baseline `0`，並同步 assignment／relation zero-mutation、history／Undo、dirty／autosave、focus與fixture cleanup。`App.tsx`新增owner-driven cleanup effect，必要source／target surface或drawer關閉即沿用`cancelRelationPlacement()`，不新增listener、resolver、MIME、mutation owner、store、schema或第二輸入路徑。archive final manifest revision為`4ab018e15bbcc319f8cbc13139147670eaaaaa5a8375b8bb27ecf6fe6164a5c2`，5080 runtime與port已cleanup；E2仍維持`Partial／Open`，E1／E3／E4不變。

- 2026-09-01：補上第16.15節 `E2-INVALID` fresh browser record，並同步主spec第26.21.1節、evidence manifest、dev_task與documentation_map。以同一 B16 fixture 執行 Employee→ProcessNode 不相容 pair，取得 visible fail-closed、source focus recovery、API `200`、hydrated→after relation／revision zero-mutation與產品 diagnostics `[]`；因runner未輸出 dirty／history／autosave欄位，單案標`partial`，E2 aggregate與E4不提升。另修正 `scripts/dev039-s7-fixture.mjs` 的dev identity headers與Windows CLI entrypoint判斷，讓fixture prepare／cleanup可重演；未新增resolver、MIME、mutation owner、輸入路徑或資料模型。

- 2026-09-01：補上第16.15.1節 persistence／history probe rerun；`e2-admission.pw.ts` 以隔離 fixture `draft-67c6e1cc-6e2d-4f7e-be9b-bfd32840e41f` 重跑四案，確認 assignment／relation／link zero-mutation、E2-INVALID 有效配置＋Undo 還原、四案 persistence snapshot 均無「未儲存變更」，並在開啟 persistence menu 前取得拒絕後焦點，結果 `4 passed (20.0s)`。測試新增可覆寫 `DEV039_E2_VERSION_ID` 的 helper 邊界並改以 trigger click 關閉文件選單；不改產品契約，完整 history／listener／409 recovery 欄位仍開放，E2 aggregate維持`Partial／Open`；fixture archive final manifest revision為`434adf105d33a8acc9486ab20507a85af047a6195b9d510075426ad6e05ffd2c`，5080 runtime與port已cleanup。

- 2026-08-31：新增第16.15節 E2 failure-path fresh browser observation index。以同一 B16 fixture 與 task-owned `127.0.0.1:5080` Playwright 補得 `E2-COMMIT-REJECT`、`E2-CAPABILITY-LOSS`、`E2-UNLOAD`；三案 status `200`、hydrated→after relation／link IDs與revision不變、產品 diagnostics `[]`，並記錄兩個 animation frame 的 typed source focus recovery。`E2-INVALID`、完整 dirty／history／autosave／listener inventory仍開放，E2 aggregate不提升，不新增 resolver、MIME、mutation owner或第二輸入路徑；fixture／runtime已cleanup。

- 2026-08-31：校正第16.6節續接索引，明確 native runner admission已完成並記為`blocked／not-run`，不再重複同類工具嘗試；後續優先補`E2-INVALID`與完整failure schema、E3 listener cleanup，只有取得可讀取真實`DataTransfer`的runner才重開ProcessNode↔Duty native。同步主spec第2.1節、dev_task、documentation_map與evidence manifest；不新增產品契約、輸入路徑或證據格式。

- 2026-08-31：修正E2 Playwright evidence helper的截圖輸出路徑，改由`import.meta.url`解析至canonical `output/playwright/dev039`，並將既有三張artifact移回指定位置；不改變任何產品契約、relation判定或closure狀態。

- 2026-08-31：新增第16.12.1節 Playwright admission fresh attempt索引。task-owned `127.0.0.1:5080`、Chromium `149.0.7827.55`與B16 fixture在可見Process source／Duty target上重演仍無`dragstart／dragover／drop`或strict `DataTransfer`；API readback為`200`且未新增Process link，fixture／runtime／port均已cleanup。依主spec第26.15.1節判定ProcessNode→Duty為`blocked`、paired Duty→ProcessNode為`not-run`，E1 aggregate維持`Partial／Open`，不把runner限制寫成產品故障。

- 2026-08-31：新增第16.14節 S7 continuation gate index，對齊主spec第2.1節的目前狀態、接續順序與無技術債擴張守則；不新增產品契約、資料模型、resolver、mutation owner或證據格式。

- 2026-08-31：同步主spec第26.13.1節的最小 failure／lifecycle case matrix 與自動化增量。新增 `E2-UNLOAD`、`E2-INVALID`、`E2-CAPABILITY-LOSS` pure／component fail-closed coverage；最新 targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯三檔合併重跑 `3 files／18 tests`）、aggregate `159 files／661 tests`，typecheck、build與diff check通過。瀏覽器 unload／capability-loss record仍開放，E1～E4狀態不變。

- 2026-08-31：新增S7 E1 native runner admission索引（第16.11節），對齊主spec第26.18節的canonical入口、可見owner geometry、strict MIME事件鏈及blocked／not-run判定；不新增runner、resolver、MIME、mutation owner或產品fallback，E1～E4狀態維持open。

- 2026-08-31：同步 Process canvas 幾何／生命週期窄修正的 after-fix evidence 與最終程式 gate。split／reload／flow source handles 均在 owner canvas 內、無 overflow、產品 console `0／0`；targeted `3 files／17 tests`、full regression `159 files／657 tests`、typecheck、build與diff check通過。僅標記 `E3-GEO-SPLIT` 與 reload／flow geometry observation pass，standalone／reveal／listener cleanup、Process native strict MIME／API、E2 failure與E4 freeze仍開放；未新增 resolver、MIME、mutation owner、layout state或dependency。

- 2026-08-31：新增S7 fresh native record index（第16.8節），補記同一B16 fixture的Employee→Position與Duty→Position strict MIME、200 PUT、API revision及canonical relation；兩個單案標`pass`，但ProcessNode↔Duty、E2、E3仍未全閉合，整體S7維持`QA-QC Reopened`。

- 2026-08-31：新增S7現行證據優先序索引（第16.9節），將主spec第26.13～26.15節定義為派工、record schema與最新逐案結果的唯一來源；歷史段落只作provenance，新增證據先寫主spec再同步索引，避免形成第二套判定或狀態。
- 2026-08-31：新增S7 Process canvas 幾何／生命週期窄修正索引（第16.10節），對應主spec第26.17節的可重現幾何 blocker與最小修正邊界；不新增 resolver、MIME、mutation owner、layout state或第二套 evidence schema，E1／E2／E3仍維持open。

- 2026-08-31：補記第16.10.1節短面板 editor saturation follow-up；既有 canvas 以`min-height:180px; flex:1 1 180px`避免被編輯器壓成零高度，並保存B16 live geometry與hit-test artifact。只關閉幾何 observation，不提升E1／E3 aggregate或改動資料／關聯契約。

- 2026-08-31：新增第16.12節 S7 native runner availability decision。B16 split已確認owner geometry與strict MIME元件存在，但Playwright未產生可採用native事件、Chrome browser-client亦無可連線tab；依主spec第26.19節將ProcessNode↔Duty維持`not-run`、E1 aggregate維持`Partial／Open`並停止重複同類工具嘗試，不新增輸入路徑、resolver、API直寫或產品fallback。
- 2026-08-31：補充In-app Browser CUA與keyboard capability-loss observation。CUA仍未產生可採用native事件；keyboard placing切換現行版會離開placing狀態，但缺API／revision／zero-mutation完整record，故不提升E2或E1 aggregate；維持既有single resolver／mutation owner與runner-blocked邊界。
- 2026-08-31：補充Chrome extension CUA重試結果。隔離Chrome分頁沿用同一B16 source／target與canonical入口，仍未產生可採用native事件；不提升E1，維持runner-blocked與single resolver／mutation owner邊界。
- 2026-08-31：新增第16.13節 E3 lifecycle fresh observation index。同步 standalone／close／reveal／視角切換／Duty往返／reload的局部幾何證據與`F039-S7-E3-lifecycle-iab.png`；listener inventory未取得，E3 aggregate維持`Partial／Open`。

- 2026-08-31：補上 `ProcessPlanningCanvas.lifecycle.test.tsx` 的受控 lifecycle automation coverage，固定兩 frame 單次 fit、observer disconnect與hidden pending rAF cancellation；與第16.13節瀏覽器 observation 分開記錄，不提升 E3 aggregate 或改變 E1／E2／E4 判定。

- 2026-08-31：新增S7 evidence record contract index（第16.7節），對齊主spec第26.14節的單一case欄位、保守判定順序與runner邊界；不新增清冊狀態機，E1～E3仍為Partial／Open、E4為Blocked。

- 2026-08-31：補記同一B16 draft的Chrome CUA fresh observation：Employee→Position native DOM mutation、same-target noop及Duty→Process invalid＋Escape cancel；E1／E2改以`Partial／Open`描述部分觀察，strict MIME、API／revision、target unload／capability-loss及E3 warning仍開放。本輪只同步文件與evidence manifest。

- 2026-08-31：同步現行S7索引至主spec第26.13節，補記targeted `7 files／34 tests`與aggregate `159 files／656 tests`自動化基線；不改寫歷史證據，E1～E3仍維持open。

- 2026-08-31：同步主spec第26.13節的S7 RD execution packet index，固定`E1-NATIVE`、`E2-FAILURE`、`E3-WARNING`、`E4-FREEZE`的artifact與目前判定；前三項未全通過前維持`Relation Placement Implemented / QA-QC Reopened`，本輪只修改文件。

- 2026-08-31：以單一fork worker重跑DEV-039全量回歸，`159 test files／656 tests`通過；前次5個平行worker timeout未重現。同步最新aggregate evidence，但不關閉native `dataTransfer`、invalid／target卸載／capability-loss failure與React Flow warning closure；本輪未修改產品程式、dependency或測試設定。

- 2026-08-31：完成S7-PROC-01窄接線與B16 ProcessNode↔Duty雙向native驗證。`ProcessDutyBridge`新增strict MIME Duty targets與App preview／commit props；B16以`process-duty-2`（ProcessNode→Duty）及`process-duty-4`（Duty→ProcessNode）建立canonical link，duplicate為noop，並補1024×768 editable及390×844 readonly spot-check。targeted `2 files／9 tests`、full regression `159 files／656 tests`、typecheck、build、source scan與diff check通過；fresh QA-QC、完整viewport matrix與cleanup仍待收斂，狀態更新為`Relation Placement Implemented / QA-QC Reopened`，未commit、merge、deploy或release。

- 2026-08-31：依B16 loopback結果補充S7 Remaining closure package。將ProcessNode→Duty native缺口定位為`ProcessDutyBridge` Duty target wrapper與`ProcessPlanningWorkbench` preview／commit窄Props接線，固定S7-PROC-01～S7-CLOSE-04的最小派工、fresh evidence、cleanup與停止條件；沿用既有resolver／command，不新增架構。狀態維持`Relation Placement Partial Evidence / QA-QC Reopened`，本輪未修改產品程式、commit、merge、deploy或release。

- 2026-08-31：完成S7實作、B16 loopback smoke與清冊一致性稽核。relation／component／fixture targeted `6 files／28 tests`、full regression `159 files／655 tests`、typecheck、build、source scan與diff check已通過；B16 fixture已建立、讀回並封存，Employee／Duty native、keyboard Employee、noop／cancel／readonly／reload結果及兩張native截圖已記錄。ProcessNode↔Duty native未建立link，fresh QA-QC與完整viewport matrix仍待完成；狀態維持`Relation Placement Partial Evidence / QA-QC Reopened`。

- 2026-08-31：依S7 relation core實作結果同步清冊狀態為`S7 RD In Progress（relation core＋B16 fixture harness） / QA-QC Reopened`。新增`relationPlacement.ts`純session測試，App唯一協調器與Employee／Duty／Process source／target接線已通過relation／component gate與build；舊平行state與legacy MIME已移除，Process composition harness、source-policy regression及B16 pure fixture CLI／test已加入；full regression `159 files／655 tests`、typecheck、build與source scan通過；B16實機、fresh native evidence仍未完成，不宣稱S7或DEV-039完成。

- 2026-08-31：完成S7 Implementation Readiness Review。`REL-PLACEMENT-SESSION`與ST-15同步single App owner、pure reducer、exact file／symbol、來源模組capability、S7-0～S7-5、deletion allowlist、targeted／aggregate Gate及task-owned B16 fixture／cleanup；P0／P1 readiness缺口為0。狀態升為`S7 RD Implementation Ready / RD Not Started / QA-QC Reopened`，產品與fresh evidence仍未執行。

- 2026-08-31：同步S7 Current Phase RD Contract。`REL-PLACEMENT-SESSION`升為RD Contract baseline，新增`ST-15`，並固定canonical UI Entry、一般空白取消／明確解除區、single commit、取代／移轉結果語意、Data／API／Permission不變、failure recovery及B16 fixture/evidence boundary。狀態升為`S7 RD Contract Ready / RD Not Started / QA-QC Reopened`；產品與驗證仍未執行。

- 2026-08-31：依native跨panel操作缺口與第一性原理審查新增`REL-PLACEMENT-SESSION`，把native drag與keyboard定義為同一Relation Placement能力的不同輸入；`REL-EMP-POS`、`REL-DUT-POS`、`REL-DUT-PROC`保留既有domain authority，但fresh native evidence重新開啟。新增single owner、same resolver、latest capability與舊平行state source scan條件；狀態改為`S0～S6 Evidence Retained / S7 Brief Ready / Implementation Not Requested / QA-QC Reopened`。本輪只修改開發文件。

- 2026-08-30：完成S6 Implementation Readiness Review。四項S6 ID狀態升級為`RD Implementation Ready / RD Pending`；open gaps明確區分「產品缺陷仍開啟」與「readiness決策已關閉」，並連結exact hosts、owner factory、Duty三view、named container、S6-0～S6-5及B14～B15。P0／P1 readiness缺口為0；未修改產品程式或驗證S6。

- 2026-08-30：依同類缺口盤查新增S6 Panel Boundary Hardening清冊。加入`LAYOUT-OWNERSHIP-02`、`OVERLAY-SCOPE-01`、`STATE-OWNERSHIP-01`與`CONTAINER-RESPONSIVE-01`，並把Duty audit／distribution fixed detail、master-data dual mount、Management Method／Duty overlay分級及container／capability分離列為open gaps。S0～S5既有證據保留，但整體狀態改為`S6 RD Contract Ready / RD Not Started / QA-QC Reopened`；本輪未修改產品程式或驗證S6。
- 2026-08-30：完成S6 Panel Boundary Hardening實作與複核。新增typed overlay hosts與surface primitives，將各module persistent surface與transient overlay收斂至owner；移除feature viewport-fixed selectors、App共享master-data detail與raw portal；新增8 files／21 tests targeted、154 files／631 tests full regression、build與source policy gate，並以現有draft browser smoke複核Duty／Management Method／Role Risk owner與overflow。四項S6 acceptance狀態升級為`Implementation Complete / QA-QC Passed`；未commit、merge、deploy或release。

- 2026-08-30：完成清單／明細相鄰排列修正的QA-QC。`MasterDataModuleAdapter`以`data-layout="adjacent-list-detail"`固定子節點順序，員工、職位、部門於1440×900／1024×704皆由左側`242px`清單開始，明細緊接右側；390×844改用`190px`清單且明細仍在正常文件流，文件與body無水平溢出；層級維持單欄清單。targeted `4 files／12 tests`、full `149 files／614 tests`、build通過；證據為`F039-QC-05-master-data-list-detail-adjacent.png`、`F039-QC-05-positions-list-detail-adjacent.png`、`F039-QC-05-departments-list-detail-adjacent.png`、`F039-QC-06-master-data-narrow-adjacent.png`。狀態維持`QA-QC Passed / Local Release Gate Pending`，未commit、merge、deploy或release。

- 2026-08-28：完成final QA-QC。desktop十模組／三面板、1023單一surface、390手機唯讀、launcher Escape焦點、console／network／overflow均重新抽測；QA先發現窄版pin／drag-grip及手機頂欄裁切`功能`入口，RD修正並新增component regression後重驗通過。Final targeted matrix `84 files／366 tests`、full regression `149 files／614 tests`與build通過；狀態升級為`QA-QC Passed / Local Release Gate Pending`，未commit、merge、deploy或release。

- 2026-08-28：完成`F039`與S5 removal closure。十模組正常入口、七Drawer promotion、B1～B8、三typed relation、Role Risk 1024／1023／390 capability、reduced motion、recovery、layout damage與legacy alias已固化；retired source scan 0 matches，full regression `149 files／612 tests`與build通過。清冊狀態改為`F039 Consolidated / S0～S5 Complete / Independent QA-QC Pending`；未commit、merge、deploy或release。

- 2026-08-28：同步最新實作與正常入口walkthrough。`recoveryOpen=false`舊假狀態已移除；十模組入口、initial organization-only network、hidden lifecycle、三region layout、pin、零panel、canonical reload／Back／Forward、損壞layout／invalid ID、current／mobile唯讀、editable draft及部分Management Method／typed keyboard行為已有實機結果。狀態更新為`S1 Core Gates Browser-Proven / S2～S4 Partial Parity Evidence / F039 Consolidation Pending / S5 Not Started`；manifest、完整relation／failure矩陣、full regression與legacy removal仍未完成。

- 2026-08-28：依RD主管架構審查同步實作事實。S1正常入口與recovery、S2 master data、S3 Duty／Process及S4 Management Method／Risk／Governance均已有產品接線，但尚未逐列取得`F039` closure；清冊狀態改為`S1～S4 Product Wiring Present / Parity Closure Pending / S5 Not Started`。最新targeted `20 files／45 tests`通過；full regression、B1～B8、removal allowlist與QA／QC仍待完成。

- 2026-08-28：同步RD實作期審查。S0 workspace core已在branch完成，S1 shell primitives已有targeted automated evidence，但App唯一composition、global recovery／409與normal-entry仍在整合；清冊狀態改為`S1 Integration In Progress / Fresh DEV-039 Evidence Pending`。`F039`、removal allowlist、browser matrix及QA／QC仍全部待完成。

- 2026-08-28：依RD主管審視收斂target module ID為主契約固定plural IDs，新增`ST-13` guarded close與`ST-14` surface lifecycle，並把initial org-only network、inactive suspension及close release納入`M1` fresh evidence。只更新文件契約，產品實作與證據仍待S0～S5。

- 2026-08-28：主工程契約完成Implementation Readiness Review並升級為`RD Implementation Ready / RD Not Started`；本清冊同步連結有限自製engine、實際repo／symbol、recovery wiring與exact test matrix。產品實作、`F039`、removal allowlist、QA／QC、deploy與release仍未完成。

- 2026-08-28：連結DEV-039主工程契約與ADR-009。清冊由Brief輸入升為RD Contract的零遺失驗收權威；feature rows、`F039` fresh evidence及deletion gate不變。

- 2026-08-28：建立第一版逐項feature parity manifest。依目前repo正常入口盤點全部現有模組與全域能力；兼任風險、治理、流程、管理辦法及三條typed relation均納入Current Phase。將current document recovery標為P1 Restore；將版本比較、standalone GovernanceSimulator、管理辦法舊原型、DEV-034歷史picker與DEV-038固定composition列為經驗證後可移除的歷史項目。本輪只修改開發文件，未修改產品程式、測試、資料、dependency、deploy或release。
- 2026-09-01：補記第二次 E1 strict-runner capability probe。全新 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b` 在 source／target geometry可命中後，仍未取得產品`dragstart→dragover→drop`／strict `DataTransfer.types`；無 domain mutation，archive final manifest revision=`99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`。E1 ProcessNode→Duty維持`blocked／not-run`、paired Duty→ProcessNode維持`not-run`；此筆僅保存 runner provenance，不新增第二輸入路徑、resolver、mutation owner或 evidence manifest。
