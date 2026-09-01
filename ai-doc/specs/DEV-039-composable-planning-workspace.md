# DEV-039：可組合規劃桌面與跨面板關聯配置

狀態：`S0～S6 Historical Complete / S7 Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Committed / Merge Release Pending`

文件成熟度：`RD Implementation Ready / Implementation Complete / QA-QC Passed / Candidate Freeze Committed / Merge Release Pending`

> **2026-09-01 Candidate freeze commit override（現行）**：已取得使用者對 `DEV-039 candidate freeze 並 commit（僅納入 DEV-039 allowlist）` 的明確授權，並在 `codex/dev-039-composable-workspace` 以 selective staging 完成 commit `86510f4`（`feat: complete DEV-039 composable planning workspace`）。本 commit 僅含 DEV-039 exact allowlist 的 74 個檔案；DEV-037／038／040、auth／DB／package／環境設定、無法判定的混合變更及 `output/playwright/dev039/**` 均未納入。此 override 優先於下方較早的 E4 pending 描述；merge、deploy、release 仍需另行授權。

> **2026-09-01 Formal QA-QC 最新覆寫**：E1四個 minimum directions、E2五案`historyEvidence`與E3兩案已由同一份 evidence manifest正式覆核；targeted component `3 files／19 tests`、full regression `160 files／664 tests（1 skipped）`、`npx tsc --noEmit --pretty false`、`npm run build`、文件一致性、fixture archive與task-owned runtime cleanup均通過。E4只剩使用者／PM明確授權，未取得授權前不執行commit、merge、deploy或release。此段優先於下方較早的QA-QC Reopened／E1 Partial快照。

> **2026-09-01 E2 evidence 最新覆寫（優先於下方舊快照）**：以隔離 B16 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 使用既有 `output/playwright/dev039/e2-admission.pw.ts` 重跑五案 E2、`E3-LIFECYCLE` 與 `E3-WARNING`，結果 `7 passed`。五案 E2 均輸出 `historyEvidence.strategy=behavioral-undo-round-trip`，完成「一次合法 mutation → 恰好一次 `Control+Z` → 完整 canonical relation IDs 回 baseline」；E2 `validMutationObserved=true`、`undoRestoredBaseline=true`，並保留 zero-mutation、revision、dirty、autosave、focus、listener、re-entry 與 409 recovery 欄位。E3為`pass`，E1四向strict native亦已通過；E4只剩候選凍結授權。fixture archive manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`，5080已停止並釋放，5000 user-owned runtime未觸碰。依第2.3／26.14節，E2 aggregate現為 `Pass（evidence）`；正式 QA-QC已覆核本筆 record、artifact、cleanup與四方文件同版；E4只剩候選凍結授權。

> **2026-09-01 歷史 evidence 覆寫（現行結果見第26.21.19節）**：同一 B16 fixture 曾取得五個 E2 failure-path browser record並合併完成 E3 lifecycle／native DevTools listener probe；當時尚未完成 `historyEvidence` 重跑，因此 E2 曾暫列 `Partial／Open`。其餘 geometry、observer／rAF、raw-console與CDP listener內容仍作 provenance；現行 E2 aggregate以第26.21.19節的最新 fixture與`7 passed`結果為準。

> **2026-09-01 E1 ProcessNode→Duty native CUA observation（歷史 provenance）**：在 task-owned `http://127.0.0.1:5080`、隔離 B16 fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc`、canonical `/`、`1280×720` 的 In-app Browser CUA session 中，從 `process-node-dev039-b16-open` 的 relation source handle 拖到 `duty-dev039-b16-new` registered target。畫面由「加入既有職掌」變為「職掌連結 1 項」，API readback 為 `200`，revision 由 `65f0b6970f54c0598b227238ea39b8fc3315a0adb7c6fd80e4f446d681e05d4c` 變為 `743e6a6a63497d9281ede117b4dfa493ee01690af8b64476c530444be5af213d`，新增 canonical link `process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`，既有 `process-link-dev039-b16-linked-primary` 保持不變；瀏覽器 warning／error log 為空。CUA 未提供可稽核的嚴格 `DataTransfer.types`、`dragstart→dragover→drop` event trace，因此只記為 `E1-PROC-DUT-NATIVE=Partial／Open`，不是 strict native pass；paired `E1-DUT-PROC-NATIVE` 仍 `not-run`，E1 aggregate與E4不變。此筆已由後續 strict native record取代，現行四向判定見第26.21.25節；fixture archive manifest revision為`005fda19cd0655480ee0a4d71cdaf3a8ac0140bf783e6045e536d9dc6f372c56`，5080已停止並釋放，5000 user-owned runtime未觸碰。完整欄位見第26.21.18節。

> **2026-09-01 E1 ProcessNode→Duty strict native evidence（單向歷史紀錄）**：產品窄修正（`ProcessNodeCard` source handle 的 pointer／mouse capture 與 App deferred placement begin）後，以全新隔離 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673`、task-owned `http://127.0.0.1:5080`、canonical `/`、`1280×720`、Chromium `149.0.0.0`及 loopback dev identity執行一次性 evidence-only native pointer runner。由 `process-node-dev039-b16-open` 拖至 `duty-dev039-b16-new` 取得 `dragstart → dragenter／dragover → drop → dragend`；strict `application/x-orgmaster-entity` 在 target dragenter／dragover／drop 與 source dragend 可讀，無 `defaultPrevented`。畫面顯示「已建立跨面板關係」，明確 `Control+S` 後 API status=`200`，revision 由`4c3ce4dc01c2b0a921163af7a695e6e1bc0f6738800cb84406a7bd333634baec`變為`0425c154f4d0089b15e1399e83000737ffb1756a7c3270095a802a764bfc6156`，canonical link `process-duty-2` 存在且只一筆；artifact=`output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json`。本筆只保留 `E1-PROC-DUT-NATIVE=pass` 的單向證據；paired `E1-DUT-PROC-NATIVE` 已由第26.21.25節補齊並通過，四向 E1 aggregate與正式 QA-QC均以最新 paired record為準；E4只剩候選凍結授權。fixture最後 recoverably archive，archive manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`，5080已釋放，5000 user-owned runtime未觸碰；完整欄位見第26.21.23～26.21.24節。

> **2026-09-01 E1 Duty→ProcessNode paired native runner boundary（superseded provenance）**：以全新隔離 B16 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`、task-owned `http://127.0.0.1:5080`、canonical `/`、`1280×720`、Chromium `149.0.0.0`及 loopback dev identity，從既有已連結職掌 `duty-dev039-b16-primary` 的 `primary-execute` lane 拖至 `process-node-dev039-b16-open`。可觀察 source `dragstart`、target `dragenter／dragover` 與 strict `application/x-orgmaster-entity`（另於 source `dragend`讀到），但真實滑鼠路徑未產生 terminal `drop`，UI未出現建立關係結果；API readback status=`200`，revision維持`c018fc0de0f1a80af43d6663f3a8099ef8fa35541f925f289afec366e3cb6c3a`，既有 `process-link-dev039-b16-linked-primary`不變且未新增canonical link。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`。因此 `E1-DUT-PROC-NATIVE=blocked／not-run`，不是 resolver／API 失敗，也未使用 synthetic event、API直寫或第二輸入路徑；E1 aggregate、正式QA-QC與E4不變。fixture已recoverably archive，archive manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`，5080已釋放，5000 user-owned runtime未觸碰；完整欄位見第26.21.24節。

> **2026-09-01 E1 Duty→ProcessNode paired native strict pass 最新覆寫（優先於第26.21.24節）**：產品只做一項關係輸入契約窄修正：`ProcessDutyBridge` 的 Duty responsibility lane source 將 HTML5 `effectAllowed` 由 `copy` 對齊既有 ProcessNode／target 的 `link`，未新增 MIME、resolver、Command、API、state、listener或第二輸入路徑。以全新隔離 B16 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396`、task-owned `http://127.0.0.1:5080`、canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`、`1280×720`、Chromium `149.0.0.0`及 loopback dev identity，從 `duty-dev039-b16-primary / primary-execute` 拖至 `process-node-dev039-b16-open`，取得真實 `dragstart → dragenter／dragover → drop → dragend`、strict `application/x-orgmaster-entity`（target dragenter／dragover／drop與source dragend可讀）、`effectAllowed=link`／`dropEffect=link`與無 `defaultPrevented`。畫面顯示「已建立跨面板關係」，API status=`200`，revision `baebb74bee27faf94294cc3b93e72551358d6575e563f1334e999e076c10bdf9`→`cd8de58e1607e5c374b0293711e5e59d98f131c5b0b68a7754bb34378c8f515d`，canonical `process-duty-2`新增且既有 `process-link-dev039-b16-linked-primary`保留；artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`。fixture archive manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`，5080已停止並釋放，5000 user-owned runtime未觸碰。故 `E1-DUT-PROC-NATIVE=pass`，四個 E1 minimum directions 均已有 strict evidence，E1 aggregate為 `Pass（evidence）`；正式 QA-QC已完成，E4僅等待使用者／PM明確授權，不能因此宣稱已完成immutable commit、merge、deploy或release。

> **2026-09-01 E3 listener exploratory supplement**：同一既有 runner 先以隔離 fixture `draft-373f011e-0b0d-4636-a344-89145edd552d` 完成 full `EventTarget` listener／`isConnected` snapshot，結果 `1 passed (18.9s)`；該 probe因持有 DOM target只作線索。其後在全新 fixture `draft-5ab9ff12-e5f0-4bfc-8141-eddc1fb4e078` 以同一 runner 合併重跑 `E3-LIFECYCLE` 與不注入 monkey-patch 的原生 CDP listener probe，兩案均通過，raw diagnostics為`[]`，reload後 window／document／React Flow portal listener回到`40／8／139` mount baseline，Process canvas close後為`0`、reveal／flow／reload為`1`；因此本輪將 `E3-WARNING` aggregate提升為`pass`。完整數據、cleanup與禁止擴張邊界見第26.21.15～26.21.17節。

日期：`2026-09-01`

風險等級：`Medium`（替換全站主要 UI shell、入口、路由與跨面板互動；不改 OrganizationDocument V7、既有 module domain、權限或保存權威）

權威範圍：DEV-039 Current Phase 的 composable workspace shell、module surfaces、Drawer promotion、panel lifecycle、layout、URL、shared selection、pin、typed relation placement、capability、recovery、相容與 deletion gate。

直接依賴：

- `ai-doc/specs/DEV-039-feature-parity-manifest.md`：現行功能、正常入口、狀態、keyboard、authority與證據的逐項零遺失權威。
- `ai-doc/adr/ADR-009-composable-workspace-shell-boundary.md`：可組合UI shell與domain authority的長期邊界。
- `ai-doc/adr/ADR-008-process-planning-organization-version-authority.md`：Process、Duty、Position共用OrganizationDocument V7的資料權威。
- DEV-020／ADR-002：版本工作區、CAS、failed version與recovery contract。
- DEV-032、DEV-034、DEV-036、DEV-037、DEV-038 active contracts：各模組內部行為與權限權威。

本文件不取代各模組domain spec；發生衝突時，DEV-039只擁有新版正常入口、workspace composition及adapter行為，各模組資料、Command、API、權限與transaction仍由原active spec擁有。

## 1. 目的與Current Phase結果

總經理與主管不再被迫進入一套預先固定的左／中／右視角。使用者從同一個完整工作台按需開啟組織圖、主資料、流程、職掌、管理辦法、兼任風險或治理面板，將需要比對的內容並排或放入同區頁籤，再以shared selection及已登錄typed relation連動。

Current Phase完成時必須同時成立：

1. 所有`DEV-039-feature-parity-manifest`的`P`與`R`能力都由新版正常入口可達。
2. 使用者第一次進入只看見組織架構圖；之後可自行組合面板，不預開全部功能。
3. 面板自由度受控：可開啟、關閉、分割、換位、調整大小及同區切換，但不重疊、不浮動、不建立多份同類panel。
4. UI layout、panel focus與視覺狀態不進OrganizationDocument、不觸發domain dirty/history/autosave。
5. 所有資料mutation繼續走既有Command、API、permission、validation、Undo／Redo與CAS。
6. 新版完成fresh parity evidence前，舊UI不移除；移除後正式runtime不存在第二套hidden mode或只能direct URL到達的舊功能。

## 2. Execution Boundary

S0～S6 replacement、panel boundary產品實作與既有evidence維持歷史有效。2026-08-31試用回饋證明Employee→Position原生跨面板delivery path仍不可用，而`F039-REL-01`現有實機證據主要只覆蓋keyboard placement，因此只重新開啟受影響的typed relation acceptance，不回溯否定S0～S6其他證據。2026-09-01 的一次性 CUA observation 顯示 ProcessNode→Duty 可造成實際 link mutation，後續在 source handle pointer／mouse capture、App deferred begin與Duty source effect contract窄修正後，已以全新fixture取得 ProcessNode→Duty strict native 單方向及 paired Duty→ProcessNode strict native `pass`；較早 CUA／blocked runner僅作 provenance，不改變最新 E1 aggregate判定。最新 E2 五案已完成行為性 Undo evidence，E3 lifecycle／warning亦已完成並通過正式 QA-QC；現行剩餘工作只收斂為 E4 candidate freeze 的明確授權。

S7在`codex/dev-039-composable-workspace`分支已完成產品接線，現行狀態為`Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Committed / Merge Release Pending`。已落地`relationPlacement.ts` pure session reducer、typed effect／capability解析、`App`單一協調器與commit boundary，以及Employee／Duty／Process source handle與registered target接線；舊Employee／Duty平行state、legacy MIME fallback、未使用的`DutyMatrixView`與Process內部resolver fallback已移除，並補上`ProcessPlanningWorkbench`同組件跨來源／目標測試、source-policy regression及可回復的B16 fixture CLI／pure transformer測試。relation／component／fixture targeted、typecheck、full regression（160 files／664 tests、1 skipped）與build已通過；Process canvas 幾何窄修正後 split／reload／flow source handles 均位於 owner canvas 內且無 overflow，產品 console `0／0`，artifact為`F039-S7-E3-process-geometry-after-fix.png`。同一 B16 fixture 最新七案（五案 E2＋`E3-LIFECYCLE`＋`E3-WARNING` native CDP）均通過（`7 passed`），五案 E2均含`historyEvidence`行為性 Undo round-trip，E3-LIFECYCLE／E3-WARNING個案現為`pass`；E2 aggregate依第2.3節為`Pass（evidence）`。最新 ProcessNode→Duty及 paired Duty→ProcessNode strict native evidence均已通過（詳第2.5.2／26.21.25節），四個 E1 minimum directions 已具備逐案 strict record，E1 aggregate為`Pass（evidence）`。正式 QA-QC已覆核 E1～E3 與四方文件；E4 candidate freeze 已由 commit `86510f4` 完成；merge、deploy、release 仍待另行授權。

> **2026-09-01 Formal QA-QC／E4 gate override（現行）**：四個 E1 minimum directions、五案 E2 `historyEvidence`、兩案 E3及四方文件已完成正式 QA-QC。`targeted component=3 files／19 tests passed`、`full regression=160 files／664 tests passed／1 skipped`、typecheck、build、source scan、fixture archive與task-owned runtime cleanup均通過。E4現為`Candidate Freeze Ready / Authorization Pending`，只有使用者／PM明確授權後才可immutable commit／merge／deploy／release；下方較早的`QA-QC Reopened`與`Partial／Open`只作歷史 provenance。

### 2.1 S7 continuation gate（2026-09-01）

本輪最新 B16 browser evidence 已補上五個 E2 failure-path case：`E2-INVALID`、`E2-COMMIT-REJECT`、`E2-CAPABILITY-LOSS`、`E2-409-RECOVERY`、`E2-UNLOAD`，並以同一 runner 合併完成 `E3-LIFECYCLE` 與原生 CDP listener probe；七案結果為 `7 passed`（五案 E2＋兩案 E3，fresh fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c`，archive manifest revision `562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`）。E2 五案均輸出 `historyEvidence` 行為性 Undo round-trip（合法 mutation＋恰好一次 `Control+Z`＋完整 canonical relation IDs 回 baseline），並保留 assignment／relation zero-mutation、dirty／autosave、document keydown listener cleanup、重新進入 editable 與 409/recovery；capability-loss re-entry 以 persisted process-link readback 作穩定准入，toast僅作觀察。E3 已以 geometry／observer／rAF／strict raw-console與不注入`EventTarget` monkey-patch的CDP `DOMDebugger.getEventListeners`覆蓋mount、close、reveal、mindmap→flow與reload；raw diagnostics為`[]`，Process canvas close後為`0`、reveal／flow／reload為`1`，window／document／React Flow portal listener回到`40／8／139` mount baseline。依第2.3節，E2 aggregate現為 `Pass（evidence）`；E3-LIFECYCLE與E3-WARNING均為 `pass`，且正式 QA-QC已覆核本段 record、artifact、cleanup與四方文件。

本節是下一輪接續 DEV-039 的冷啟動入口，將「可直接繼續的工作」與「尚未具備證據而不得擴張的工作」分開。它不新增產品功能、DEV、資料模型或證據格式；詳細契約仍由第26.13～26.21.26節擁有。

| Closure | 現行狀態 | 下一個可執行動作 | 不可宣稱／不可擴張 |
| --- | --- | --- | --- |
| `E1-NATIVE` | `Pass（evidence）`；Employee→Position、Duty→Position、ProcessNode→Duty及 paired Duty→ProcessNode 均有 strict native record，四個 minimum directions 已閉合 | 正式 QA-QC已覆核四筆逐案 record、artifact、cleanup、targeted／typecheck／build與四方文件同版；不需重做已通過的 paired runner | 不得新增synthetic input、API直寫、第二resolver或替代DnD路徑 |
| `E2-FAILURE` | `Pass（evidence）`；五案同一 B16 runner record均含 behavioral Undo round-trip與完整 canonical relation IDs，正式 QA-QC已簽核 | 不需重跑已通過的五筆 record；維持唯一 history／Undo authority | 不得新增產品 history API／第二 history store |
| `E3-WARNING` | `pass`；同一 fixture 合併 `E3-LIFECYCLE` 與原生 CDP listener probe，raw diagnostics為`[]`，geometry／observer／rAF不累積，close後Process canvas為`0`、reveal／flow／reload為`1`，window／document／React Flow portal listener回到`40／8／139` mount baseline | 正式 QA-QC已覆核本筆 record、artifact與cleanup | 不得新增global suppress、portal或第二lifecycle owner |
| `E4-FREEZE` | `Candidate Freeze Ready / Authorization Pending` | 等待使用者／PM以明確文字授權後執行immutable candidate freeze | 未取得授權前不進commit、merge、deploy或release；授權範例：`授權 DEV-039 candidate freeze 並 commit` |

接續演算法固定為：`讀取第26.13～26.21.26節 → 跑既有 targeted／typecheck／build gate → 讀取四筆 E1 strict record → 覆核 QA-QC 四方文件與 cleanup → 依使用者授權執行 E4 candidate freeze`。本輪 paired Duty→ProcessNode已由第26.21.25節記錄，桌面 viewport extension見第26.21.26節；較早 blocked runner只作 provenance，不取代最新 strict pass。若需要新增DnD dependency、MIME、resolver、mutation owner、schema／API／permission、global listener、feature flag或第二份文件清冊，立即回PM，不以文件改寫成完成。

#### 2.4.1 E4 candidate scope preflight（2026-09-01）

本次只做 commit 前安全盤點：`codex/dev-039-composable-workspace` 目前 HEAD 為 `ab5fe02`，`git status --short` 顯示 `97` 筆狀態項目；以 `--untracked-files=all` 展開未追蹤目錄後為 `168` 個檔案，且同時包含 DEV-037、DEV-038、DEV-040 及 DEV-039 變更。故 E4 即使取得授權，也只能依第22.6、25.6節的 DEV-039 exact file／symbol allowlist 做 selective staging；不得以「目前 branch」或整個 working tree 作為 candidate。未完成 selective scope review 前，E4 保持 `Candidate Freeze Ready / Authorization Pending`，不執行 commit、merge、deploy 或 release，也不修改其他 DEV 的檔案來湊出乾淨工作樹。

E4 scope review 必須留下：`git status --short` 快照、納入／排除 path 清單、allowlist 對照、source revision 與測試／build結果；任何無法判定歸屬的檔案先回 PM，不得自動納入。這個 preflight 不改產品資料、API、resolver、mutation owner 或 evidence schema。

證據與候選版本的 Git 邊界亦固定：repo 的 `.gitignore` 目前以 `output/*` 忽略 `output/playwright/dev039/**`，因此這些 JSON／PNG／manifest 是本機驗證 provenance，不得在 E4 以 `git add -f` 整批塞入產品候選。E4 candidate 只可納入 DEV-039 allowlist 內的程式與開發文件（包含明確列出的 untracked source）；若未來需要可攜式證據包，另走 release artifact gate，不在本輪改寫忽略規則或建立第二份清冊。

只讀 scope 分類快照（2026-09-01，重新授權前的 preliminary preflight；不是最終 staged manifest）：在 `--untracked-files=all` 的 168 個 path 中，`62` 個 path 命中 DEV-039 專屬檔案／allowlist，可在授權後整檔候選；`16` 個 path 同時承載其他 DEV 或共享變更，只能逐 hunk／symbol review；`90` 個 path 暫無 DEV-039 歸屬證據，本輪不納入，若需納入必須回 PM 補證據。這三個數字只描述當時快照，授權後必須在同一 source revision 重新執行 status、allowlist與mixed hunk review；任何數字變化以最新快照為準。

### 2.5 E1 strict-runner admission probe（2026-09-01，前置能力探測 provenance）

本節記錄 source handle窄修正前的 runner能力探測，不是目前 ProcessNode→Duty結果的權威判定；不修改產品程式或增加第二輸入路徑。沿用同一 B16 fixture、canonical `/`、頂部「功能」入口及既有 ProcessNode→Duty registered source／target；先將 Duty target 滾動至不被 session bar 遮蔽的位置，再以 Chromium CDP／Playwright 原生滑鼠路徑嘗試拖曳。最新可採用單方向結果見第2.5.2節。

| Checkpoint | 結果 | 判定 |
| --- | --- | --- |
| owner geometry | source／target 均由產品 DOM 提供，`elementFromPoint` 命中正確 source button／Duty target button | runner 前置條件 `pass` |
| native transport | 本次 probe 只觀察到 pointer／mouse event；沒有可採用的 `dragstart → dragover → drop` 與 strict `application/x-orgmaster-entity` `DataTransfer.types` record | `E1-PROC-DUT-NATIVE=blocked／not-run` |
| domain mutation | 沒有 API 直寫、synthetic DragEvent 或產品 domain mutation；fixture只做 recoverable archive | zero-mutation boundary `pass` |
| cleanup | fixture `draft-22e0c2bc-29e2-4460-a222-86664fc4cdde` archive response=`200`，final `manifestRevision=51e3a8f1834595939f00337f2854e3e5c5042af95f45dce0acd2f45038bef5bf`；task-owned `5080`已釋放，user-owned `5000`（PID `23840`）未觸碰 | cleanup `pass` |

本筆只縮小 blocker：目前阻塞來自 runner 未提供可稽核的 HTML5 `DataTransfer` transport，不是產品 resolver／Command／target wiring 已被證明失效。依第26.18節停止同類 runner 重試；下一個可執行條件仍是取得能輸出真實 `dragstart／dragover／drop` 與 `DataTransfer.types` 的瀏覽器 harness，然後補 ProcessNode→Duty 及 paired Duty→ProcessNode 兩方向。不得以此 probe、CUA partial、`dragTo` 或 synthetic event 升級 E1。

### 2.5.1 同日第二次 runner capability probe（2026-09-01，前置能力探測 provenance）

為確認前一筆 blocker 不是單一 fixture 或幾何誤判，本輪以全新隔離 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b`、同一 canonical `/`、同一 registered ProcessNode／Duty source-target 及既有 strict MIME 重跑。source／target 在捲動後均可由產品 DOM 命中；但 Chromium CDP `Input.setInterceptDrags`、原生滑鼠路徑與最小 HTML5 probe 均未提供可採用的產品 `dragstart → dragover → drop`／`DataTransfer.types` 序列。未執行 synthetic event、`page.evaluate` API 直寫或產品 domain mutation；fixture僅做 inspect 後 recoverable archive。本節為窄修正前的runner provenance，最新單方向 strict evidence見第2.5.2節。

| Checkpoint | 結果 | 判定 |
| --- | --- | --- |
| owner geometry | Process source button與Duty target button均可取得 bounding box，`elementFromPoint`命中產品元素 | 前置條件 `pass` |
| native transport | 未取得產品 `dragstart`、`dragover`、`drop` 或 strict `application/x-orgmaster-entity` `DataTransfer.types` | `E1-PROC-DUT-NATIVE=blocked／not-run` |
| mutation boundary | API前後未新增Process link／Duty relation，無 synthetic或直接寫入 | zero-mutation `pass` |
| cleanup | archive response=`200`，final `manifestRevision=99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`；task-owned 5080未遺留，user-owned 5000（PID `23840`）未觸碰 | cleanup `pass` |

這筆 probe 只增加 runner provenance，不改 E1／E2／E3／E4 判定，也不授權建立第二輸入路徑。因兩次同類 runner 均在 owner geometry 可命中後仍缺 strict transport，後續除非取得可輸出真實 HTML5 `DataTransfer` 的新 harness，否則停止同類重試；一旦具備新 harness，仍須依第26.18節以同一四個 E1 case ID 補 ProcessNode→Duty 與 paired Duty→ProcessNode。

### 2.5.2 E1 ProcessNode→Duty strict native single-direction pass（2026-09-01，歷史單向證據）

在完成 ProcessNode source handle 的 pointer／mouse capture 與 App deferred placement begin 窄修正後，以全新 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673` 重跑一次性 evidence-only native pointer runner。source／target 均由產品 DOM 提供，且 `elementFromPoint` 命中正確元素；事件可觀察為 `dragstart → dragenter／dragover → drop → dragend`，strict `application/x-orgmaster-entity` 在 target dragenter／dragover／drop 與 source dragend 可讀，事件沒有 `defaultPrevented`。

| Checkpoint | 結果 | 判定 |
| --- | --- | --- |
| visible result | `process-node-dev039-b16-open` 拖至 `duty-dev039-b16-new` 後顯示「已建立跨面板關係」 | pass |
| persistence | 明確 `Control+S` 後 API status=`200`；revision `4c3ce4dc...` → `0425c154...`；canonical link `process-duty-2` 存在且只一筆 | pass |
| transport | source `dragstart`、target `dragenter／dragover／drop`、source `dragend` 完整；strict MIME於target／dragend可讀 | pass（單方向） |
| artifact／cleanup | `output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json`；fixture archive status=`archived`、manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`；5080釋放、5000未觸碰 | pass |

本筆只將 `E1-PROC-DUT-NATIVE` 標為 `pass`；當時 paired `E1-DUT-PROC-NATIVE` 尚未執行，因此該時點 E1 aggregate 維持 `Partial／Open`。後續 paired strict record 已於第26.21.25節補齊，現行四向 aggregate與正式 QA-QC以最新 record為準；一次性診斷 runner 在證據生成後移除，產品仍只有單一 `RelationPlacementSession`、resolver與mutation owner；不得以本筆新增第二 runner、MIME、fallback、API直寫或第二份清冊。

E2 現行補充：五案已有 browser record 與共同的 dirty／autosave／document listener evidence，並已覆蓋重新 editable 與 409/recovery；第26.21.19節已以同一B16 fixture完成`historyEvidence`序列化與重跑，五案均以「一次合法mutation→恰好一次Undo→完整canonical relation IDs回baseline」通過。後續只需正式QA-QC覆核，不新增產品 debug state或第二 history store，也不重做不相容 pair、listener cleanup 或 409 recovery。

2026-09-01 authority audit補充：`useOrgHistory` 的 `past／present／future` 僅由 App 內部持有，產品未暴露 `historyLength`；runner 的 `0→1→0` 支持行為性 Undo round-trip，並依第2.3節成為 E2 必要 evidence。`ProcessPlanningCanvas`／`WorkspaceLayout` source search無直接 `console.warn`，Vite extension advisory與React Flow warning須分開判定。E2最新五案已完成`historyEvidence`重跑並標`Pass（evidence）`；本輪 E3-WARNING另以不注入 `EventTarget` monkey-patch 的原生 CDP `DOMDebugger.getEventListeners` 在同一 fixture 覆蓋 mount／close／reveal／mindmap→flow／reload，raw diagnostics為`[]`、listener baseline回復且geometry／observer／rAF證據完整，故 E3-WARNING 可標`pass`。全量 listener probe因其 Map 會持有 DOM target，仍只作 exploratory，不用來判定產品 leak；另見第26.21.18節的 ProcessNode→Duty CUA partial observation。細節與判定邊界見第26.21.15～26.21.21節。

### 2.2 Current readiness audit（2026-09-01）

本節是本文件的單一「現在可以做什麼」判讀，不取代第26節逐案 evidence，也不把 `RD Implementation Ready` 誤解為 `QA-QC Passed`：

| 層級 | 現行判定 | 可直接採用的事實 | 尚未閉合的最小缺口 |
| --- | --- | --- | --- |
| RD implementation | `Ready` | single App owner、pure relation session、既有 resolver／Command／save path、module target wiring與 legacy path removal均已固定；P0／P1 readiness gap=`0` | 不再新增架構或第二輸入路徑 |
| E1 native delivery | `Pass（evidence）` | Employee→Position、Duty→Position、ProcessNode→Duty及 paired Duty→ProcessNode均有strict native record；paired最新record見第26.21.25節，桌面 viewport extension見第26.21.26節 | 正式QA-QC已覆核四筆逐案record、artifact、cleanup與文件同版 |
| E2 failure paths | `Pass（evidence）` | 五案新 record 均有 behavioral Undo round-trip、zero-mutation、dirty／autosave、focus、listener、re-entry與409 evidence | 正式 QA-QC已覆核；不新增產品 history API |
| E3 lifecycle／warning | `Pass` | 同一fixture的geometry、observer／rAF、strict raw-console與原生CDP listener均通過 | 正式QA-QC已覆核既有record，不重做同類probe |
| E4 candidate freeze | `Candidate Freeze Ready / Authorization Pending` | 文件、record與cleanup已一致覆核 | 等待使用者／PM明確授權後才可immutable commit／merge／release |

本審查把「工程可開始」與「交付可宣稱」分開：四個 E1 minimum directions、E2五案與E3均已由 strict evidence及正式QA-QC閉合；E4仍只到候選凍結，未取得明確授權不得宣稱immutable交付、commit、merge、deploy或release。不得建立新的native fallback、改寫資料模型或新增產品 debug surface。

### 2.3 E2 evidence contract decision（2026-09-01）

本輪採用「可觀測行為優先」修正 E2 evidence，而不是為了測試新增產品 debug API 或第二份 history store。E2 真正要保證的是：拒絕／取消的關聯操作不改變 domain、保存狀態或 Undo 邊界；這個不變量可由「一次已知合法 mutation → 恰好一次 `Control+Z` → 回到同一 canonical relation snapshot」直接觀察。`useOrgHistory.past` 的長度是 App 內部實作細節，不是使用者契約，也不應為了暴露它而增加 runtime surface。

因此第 26.14 節的唯一 record schema 做以下向後相容調整：

- `before.historyLength`／`after.historyLength` 改為 optional diagnostic；有值可記錄，沒有值不得猜測。
- E2 record 必須新增 `historyEvidence`，策略固定為 `behavioral-undo-round-trip`，包含合法 mutation 是否真的觀察到，以及單次 Undo 是否將完整 canonical relation IDs 還原至 baseline。
- 五個 E2 browser case 已以新欄位重新產生 record；最新七案 runner 證明每案 `historyEvidence.validMutationObserved` 與 `undoRestoredBaseline` 均為 `true`，因此 E2 aggregate 為 `Pass（evidence）`。正式 QA-QC已覆核 record、artifact、cleanup與四方文件同版；現有 numeric `0→1→0` 或舊 record只作 provenance。

這不是降低驗收門檻：它把不可從正常產品入口讀取的內部數字，替換成可由 domain API readback、既有 Undo command 與使用者可見操作重演的行為證據；仍保留 zero-mutation、revision、dirty、autosave、focus/session cleanup 等原有 required assertions。若未來產品本來就提供正式、穩定且受權限保護的 history diagnostic，再以 optional field 補充，不改變行為 gate。

本文件未授權：

- deploy、release、正式資料或遠端環境操作。
- 新增第二套Organization／Process／Duty store、API、revision、autosave或permission。
- 先刪舊UI再以「之後補回」處理parity。
- 建立任意plugin runtime、浮動Windows桌面或同類panel多實例。

### 2.4 RD handoff packet（2026-09-01，現行）

本節把下一輪工作收斂成可直接接手的最小封包；E1～E3與正式 QA-QC已完成，本節只保留 E4 候選凍結授權，不新增產品功能、資料模型或證據格式。

| 工作包 | 目前輸入 | 完成條件 | 失敗時處置 |
| --- | --- | --- | --- |
| `E1-STRICT-NATIVE` | 四個最低 case ID均已有 strict record（最新 paired見第26.21.25節；viewport extension見第26.21.26節） | 已完成；維持四筆record與cleanup，不重做已通過方向 | 不新增synthetic path／第二 MIME／替代DnD路徑 |
| `QA-QC-REVIEW` | 主spec第26.14～26.21.26節、Parity第16.15.19～16.15.22節、manifest最新 record | 已完成；E1四筆、E2五案、E3兩案及四方文件均已覆核 | 只在後續變更影響既有契約時重新開啟，不改產品契約 |
| `E4-CANDIDATE-FREEZE` | E1～E3 required pass、fixture archive、runtime cleanup、source scan與build結果 | `Relation Placement Implemented / QA-QC Passed / Candidate Freeze Ready`；PM另行取得使用者授權後才可進immutable commit／merge／release | 未取得授權前禁止 commit／merge／deploy／release |

RD實作只允許在既有`entityDrag.ts`、`relationPlacement.ts`、App coordinator、registered target wrapper與Process canvas lifecycle窄接線內修正。若需要新增 DnD dependency、第二 resolver／mutation owner、schema／API／permission、global listener、feature flag或第二份 evidence manifest，立即停止並回 PM。

## 3. UX Intent

- 使用者／任務：總經理及部門主管在同一畫面比較組織、流程、職掌與制度資料，先看全貌，再建立合法關係。
- 成功結果：使用者只開當下需要的面板；可辨識目前選取、focus、pin與唯讀狀態；完成配置後所有投影立即一致且可Undo。
- 主物件／主焦點：workspace中目前focused panel的業務物件；Drawer只是快速找資料，不與panel競爭主焦點。
- 預設刪除：頁面目的說明、常駐操作教學、重複頁首、每panel摘要卡、成功Modal、空白工具列、同一狀態的多重badge／文字／色塊。
- 保留舉證：頂部launcher用來恢復零panel工作台；panel tab/header用來辨識、拖動、pin與關閉；局部error與recovery action用來避免資料誤判或不可恢復。
- 非語言修復：以位置、tab active state、focus outline、drop zone、selection與短暫highlight表達；一般成功只更新內容並提供既有Undo，不顯示常駐說明。
- 風險與驗證：必驗keyboard、focus return、screen reader name、reduced motion、1024／1023邊界、390 mobile readonly、panel／data drag區分、visible error與data sanity。

## 4. UI Entry Contract

### 4.1 正常起點

- Target actor：有OrgMaster讀取權的總經理、主管或管理者；mutation另依workspace mode、module capability與server validation。
- Canonical route：`/`。它同時是新版完整工作台，不新增第二個`/workspace`產品入口。
- 第一次進入、無有效local layout或執行「恢復預設配置」：只開`organization` panel。
- 頂部全域chrome保持可見：VersionSwitcher、版本工作區、DocumentMenu、儲存狀態、全域搜尋、workspace mode／唯讀狀態及「功能」launcher。

### 4.2 頂部功能launcher

單一具名控制`功能`開啟Popover。固定順序：

1. 組織架構圖
2. 員工
3. 職位
4. 部門
5. 層級
6. 工作職掌
7. 流程規劃
8. 管理辦法
9. 兼任風險
10. 角色治理

Popover使用平面清單，不顯示功能介紹、helper或disabled future item。已開啟panel只用一個低噪音state標記；圖示不是唯一辨識。選擇直接型模組後關閉Popover並加入／聚焦panel；選擇Drawer型模組後關閉Popover並開啟唯一Drawer。

版本、文件、儲存、搜尋與mode不列入launcher，因其作用範圍是整個workspace，不是module panel。

### 4.3 Drawer第一層

- Desktop compose capability成立時，Drawer從左側推移workspace，不使用backdrop、不覆蓋panel；寬度沿用密集Directory肌肉記憶，固定`242px`，不可在Current Phase調整寬度。
- 同時間最多一個Drawer；從launcher改選另一Drawer型模組時直接替換內容，不疊第二層Drawer。
- Drawer只含模組名稱、搜尋／既有必要篩選、密集清單、row selection／最小inline摘要及一個`在工作台開啟`主動作。
- Row name承擔選取／明細入口，不另加重複「明細」按鈕。展開控制只負責展開／收合，再點一次可收起。
- `在工作台開啟`即使未選row也可開啟該module panel，並攜帶目前query／filters；有selected object時再攜帶stable ID。
- Promotion成功後Drawer關閉；Escape或關閉鈕取消Drawer並把focus送回`功能`launcher。
- `<1024px`或compose capability不成立時，Drawer改成global chrome下方的單一全寬閱讀surface；不得以242px欄壓縮主內容，也不得提供mutation。

### 4.4 Panel第二層

- Panel是同一workspace內的layout region，不是第三層頁面。
- 每個module type最多一份，`panelId === moduleId`；不產生UUID instance。
- 每個region是一個tab stack；每個panel由tab辨識。tab同時是panel layout drag handle，並提供pin及close控制；panel內容不得重複同名大頁首。
- Panel內既有Inspector、dialog、popover、章節Drawer及長文件editor仍屬panel-local情境操作，不算第三層module navigation。
- 關閉panel只改UI state，不刪domain資料、不清history、不autosave；關閉最後一個panel後保留空workspace與launcher。
- 直接型panel（目前包含兼任風險）必須在自己的region內採正常文件流並填滿分配到的寬高；單獨開啟時可成為完整工作台頁面，與其他panel並排時則只由workspace split決定尺寸。不得再套用舊版右側固定overlay、`420px`上限或浮動陰影，避免面板看似無法獨立開啟。

### 4.5 Panel內清單與明細排列契約

- 具備「清單＋明細」的同一panel，固定採由左至右的相鄰排列：`清單 → 明細`；清單從panel內容區左緣開始，明細緊接其右，不保留與清單內容無關的中間空白區。
- Current Phase的共用主資料適配器（員工、職位、部門）清單欄固定沿用Directory密集寬度：桌面／窄桌面`242px`，`690px`以下`190px`；明細欄使用剩餘寬度。層級沒有第二明細欄，維持單欄清單。
- 明細Inspector在adapter內採正常文件流（`position: relative`）；不得以全域固定／絕對定位覆蓋清單，也不得因既有窄版Inspector規則把明細移到整個workspace右側。
- 此規則是panel內投影，不改變workspace外層panel的split／tab順序；Process的「流程清單→圖形→職掌橋接」三欄是不同語意，不套用兩欄清單／明細固定寬度，但仍須由左至右且不得插入無意義空白欄。
- 任何後續新增相同資料形狀的adapter，必須標示`data-layout="adjacent-list-detail"`並重用相同幾何契約；不得各自發明另一套清單／明細排列。

### 4.6 工作台結構分隔線契約

- 工作台的頁面結構分隔線使用共用藍色 token：一般分隔線為`--workspace-divider-color`（目前`#b8c9f4`），可操作的split separator使用`--workspace-divider-strong-color`（目前`#8da8ec`）。
- 套用範圍固定為工作台外框、Drawer／工作區邊界、清單／明細邊界、region tab邊界、管理辦法panel action列及split separator；active tab仍以既有主藍色表示目前焦點。
- 內文卡片、表格列、表單控制項與正文段落的分隔線維持各模組既有中性色，不因辨識需求全面改成藍色，避免資訊噪音與錯誤層級暗示。
- 此為共用CSS projection，不新增資料、Command、權限或保存狀態；後續相同工作台surface必須重用 token，不得自行散落新的結構線顏色。

### 4.7 Panel persistent surface與Overlay所有權契約（S6）

`WorkspacePanelFrame[data-module]`是該module唯一persistent render boundary。任何會持續顯示、捲動、編輯或承載selection的清單、圖面、文件、設定、明細及editor都必須是owner panel的DOM子孫；外層split／move／tab、窄panel或shared selection不得改變其owner。

| Surface level | 適用內容 | Render／position規則 | 禁止事項 |
| --- | --- | --- | --- |
| Persistent module surface | list、canvas、document、settings、detail、editor | owner adapter內正常文件流或panel內grid／flex；由panel container決定可見排列 | `position:fixed`、viewport定位、portal到body、由其他module或workspace root掛載 |
| Panel-scoped transient | popover、短Drawer、chapter navigation、局部menu、只阻斷目前module的dialog | 透過`PanelOverlayHost`；定位、focus return及Escape都限制在owner panel | 遮住其他region、第二捲動主畫面、缺host時fallback到body |
| Global transient | 全域recovery、跨workspace blocking modal、不可逆確認、toast、drag preview | 透過`GlobalOverlayHost`及具名allowlist | 一般detail、搜尋清單或長文件使用global overlay |

第一版surface shape只保留四種語意，不建立萬用desktop component：

- Canvas：Organization／Process的圖形主物件，detail按需出現在同panel。
- ListDetail：Employee／Position／Department／Duty等左清單右明細；Level為list-only例外。
- Document：Management Method長文件、章節與editor。
- Single：Role Risk、Governance及其他單一設定／治理surface。

Current Phase只在有第二個consumer或可驗證邊界時抽共用component；否則adapter可直接實作該shape，但仍必須符合相同DOM、state、overlay與container契約。不得為了未來可能使用而建立plugin API、generic event bus、service locator或multi-instance context。

Shared selection只攜帶stable `EntityRef`、source及revision。Panel-local detail selection及open state由該module context／session擁有；接收shared selection的module可以highlight、reveal或更新自己既有的local selection，但不能直接渲染source module的detail。`App`可注入canonical state與handlers，不得把同一persistent detail ReactNode同時傳給organization及master-data／Duty等多個adapter。

Panel內responsive使用container size處理欄位排列與detail可讀性；desktop/mobile mutation capability仍只由第11節的workspace environment判定。桌面split造成panel變窄時，不得被feature media rule誤判為手機、套用viewport-fixed Inspector或改變permission。

## 5. Module Surface Registry

```ts
interface WorkspaceModuleContextMap {
  organization: Record<string, never>
  employees: { employeeId: string | null; query: string }
  positions: { positionId: string | null; query: string }
  departments: { departmentId: string | null }
  levels: { levelId: string | null }
  duties: {
    dutyId: string | null
    lane: DutyConfigurationExactLane | null
    view: 'configuration' | DutyPlanningView
    query: string
    statusFilters: DutyPlanningStatusFilter[]
    focusPositionId: string | null
    sourceRelationId: string | null
    attentionOnly: boolean
  }
  processes: {
    processId: string | null
    processNodeId: string | null
    dutyId: string | null
    view: ProcessPlanningView
  }
  'management-methods': {
    methodId: string | null
    view: 'list' | 'draft' | 'readable'
    query: string
    chapter: string | null
  }
  'role-risks': { ruleId: string | null; employeeId: string | null }
  governance: {
    section: 'identity' | 'catalog' | 'assignments' | 'delegation' | 'versions' | 'audit' | 'check'
  }
}

type WorkspaceModuleId = keyof WorkspaceModuleContextMap
type DrawerWorkspaceModuleId = Exclude<
  WorkspaceModuleId,
  'organization' | 'role-risks' | 'governance'
>

type EntityRef =
  | { kind: 'employee'; id: string }
  | { kind: 'position'; id: string }
  | { kind: 'department'; id: string }
  | { kind: 'level'; id: string }
  | { kind: 'duty'; id: string }
  | { kind: 'process'; id: string }
  | { kind: 'process-node'; id: string }
  | { kind: 'management-method'; id: string }
  | { kind: 'role-risk-rule'; id: string }

interface ModuleSurfaceDescriptor<K extends WorkspaceModuleId> {
  id: K
  label: string
  surface: 'direct-panel' | 'drawer-panel'
  minWidth: number
  minHeight: number
  supportedSelectionKinds: EntityRef['kind'][]
  readRouteContext(params: URLSearchParams): WorkspaceModuleContextMap[K]
  writeRouteContext(context: WorkspaceModuleContextMap[K], params: URLSearchParams): void
  sanitizeContext(
    context: WorkspaceModuleContextMap[K],
    state: OrgDirectoryState,
  ): WorkspaceModuleContextMap[K]
}

type WorkspaceModuleDescriptorMap = {
  [K in WorkspaceModuleId]: ModuleSurfaceDescriptor<K>
}
```

`WorkspaceModuleContextMap`是module ID、route context、session context與promotion intent的唯一型別來源。`types.ts`以type-only import重用現有`DutyConfigurationExactLane`、`DutyPlanningView`、`DutyPlanningStatusFilter`及`ProcessPlanningView`；不得在workspace另造近似字串union。Registry只保存metadata與context parser／sanitizer，不import React、不判斷module domain permission，也不擁有render callback。

Registry固定表：

| Module | Surface | Default minimum | Context核心 | Domain owner |
| --- | --- | --- | --- | --- |
| `organization` | direct panel | 480×320 | 無；Position走shared selection，viewport走local visual state | Organization projection／Commands |
| `employees` | Drawer＋panel | 360×280 | Employee、query | employee directory owner／assignment helpers |
| `positions` | Drawer＋panel | 360×280 | Position、query | Position Commands |
| `departments` | Drawer＋panel | 360×280 | Department | department owner／`DELETE_DEPARTMENT` |
| `levels` | Drawer＋panel | 360×280 | Level | level Commands |
| `duties` | Drawer＋panel | 420×320 | Duty、lane、audit/distribution、query/status | Duty relation Commands |
| `processes` | Drawer＋panel | 480×320 | Process、ProcessNode、mindmap/flow | Process Commands／ADR-008 |
| `management-methods` | Drawer＋panel | 560×400 | method、draft/readable、query、chapter | Management Method API |
| `role-risks` | direct panel | 420×320 | risk rule／employee risk | risk helpers＋organization state |
| `governance` | direct panel | 560×400 | governance section／selected record | Governance API／commands |

Module-specific`if/else`只能存在`WorkspaceModuleSurfaces`的typed adapter composition內；registry、launcher、promotion、focus、close、pin、layout與route reconciliation不得render UI或分派domain command。`WorkspaceModuleSurfaces`是唯一render owner，registry是純metadata/context authority，兩者不可互相引用形成cycle。

## 6. Workspace Layout Contract

### 6.1 Layout model

```ts
type WorkspaceLayoutNodeV1 =
  | { kind: 'stack'; tabs: WorkspaceModuleId[]; activeTab: WorkspaceModuleId }
  | {
      kind: 'split'
      axis: 'horizontal' | 'vertical'
      ratio: number
      first: WorkspaceLayoutNodeV1
      second: WorkspaceLayoutNodeV1
    }

interface WorkspaceLayoutV1 {
  version: 1
  root: WorkspaceLayoutNodeV1 | null
  visualState: Partial<Record<WorkspaceModuleId, {
    scrollTop?: number
    canvasViewport?: { x: number; y: number; zoom: number }
    localView?: string
  }>>
}
```

- `tabs`不得重複module；整棵tree每個module最多出現一次。
- `ratio`由child minimum size clamp，不只用固定百分比。
- UI layout不保存Entity title、document內容、Employee／Position／Duty／Process truth、permission、dirty、revision或任何domain mutation。
- `pin`與shared selection只屬目前browser session，不寫入layout localStorage；reload後panel恢復unpin，URL context可決定初始selection。

### 6.2 Persistence

- key固定為`orgmaster.composable-workspace.layout.v1`；目前產品只有一個local OrgMaster workspace，Current Phase不虛構workspaceId。
- open panel set、split tree、ratio、tab active及visual-only state可保存；250ms trailing debounce，`pagehide` best-effort flush。
- layout寫入失敗只顯示一次低噪音非阻斷回饋；不影響Organization dirty/save。
- schema invalid、duplicate panel、unknown module、非法ratio或無法滿足minimum時，忽略該layout並回到只開organization的預設；不得影響OrganizationDocument。
- 使用者明確「恢復預設配置」只清除此layout key與workspace URL context，不清domain資料。

### 6.3 Region與placement演算法

1. 零panel加入新panel：建立單一stack。
2. 只有一個可見region，且現有panel與新panel的minimum width在Drawer關閉後可水平並排：右側建立50/50 split。
3. 其他情況：新panel加入focused stack並成為active tab；不自動把既有layout重新排版。
4. 已存在同類panel：只focus／reveal並短暫highlight；不新增、不換位、不縮放。
5. 使用者可拖tab到既有stack中央加入頁籤，或拖到edge drop zone建立split；不允許浮動／重疊drop。
6. 若edge split會違反任一child minimum，該edge zone不顯示為合法target；release為no-op且不寫layout。
7. 鍵盤使用者透過tab action menu執行「移到前一／下一區域」與合法的「向左／右／上／下分割」；不新增會與OrgNode快捷鍵衝突的global key。

## 7. Drawer Promotion與Panel Lifecycle

```ts
type PanelLifecycle = 'absent' | 'open-unpinned' | 'open-pinned'

type PromotionSource =
  | 'launcher'
  | 'drawer'
  | 'legacy-route'
  | 'global-search'
  | 'cross-panel'

type PromotionIntent = {
  [K in WorkspaceModuleId]: {
    moduleId: K
    context: WorkspaceModuleContextMap[K]
    source: PromotionSource
  }
}[WorkspaceModuleId]

type PanelCloseGuardResult =
  | { kind: 'allow' }
  | { kind: 'keep-open'; focusTarget?: string }

type PanelCloseGuard = () => Promise<PanelCloseGuardResult>

type RequestPanelClose = (
  moduleId: WorkspaceModuleId,
) => Promise<PanelCloseGuardResult>
```

`openOrFocusPanel(intent)`固定演算法：

1. descriptor不存在：fail closed，顯示launcher就地錯誤，不建立unknown panel。
2. panel absent：sanitize context，依第6.3節加入，focus，更新URL與local layout。
3. panel open-unpinned：focus並套用sanitize後context，保持layout位置與尺寸。
4. panel open-pinned：只focus與highlight，不覆寫panel-local context；不建立第二份。
5. 若來源是Drawer且1～4成功：關閉Drawer；若失敗，Drawer保留使用者query／selection與error。

Panel close固定行為：

- 關閉panel-local modal/dialog前不得直接關panel；Escape依第13節dismiss priority一次只關一層。
- `WorkspacePanelFrame`只能呼叫controller的`requestWorkspacePanelClose(moduleId)`；module無close guard時視為`allow`，有未保存buffer時由原module guard顯示既有保存／捨棄／取消流程。
- guard pending期間close control disabled且panel frame標示`aria-busy=true`；結果為`keep-open`時layout、URL、focus與buffer全部不變，並將focus送到`focusTarget`或原close control。
- 只有guard回傳`allow`後，controller才可dispatch`COMMIT_CLOSE_PANEL`。UI component、adapter及module不得直接dispatch commit action。
- close移除layout leaf／tab與對應URL panel/context keys；空stack被移除，單child split收斂。
- focused panel關閉後，focus移到同stack相鄰tab、相鄰region或最後回`功能`launcher。
- close不執行domain command；若panel內有其自有未保存buffer，例如管理辦法editor，先沿用該module既有保存／離開保護，不由workspace丟棄。
- browser Back／Forward若會移除受guard保護的panel，controller先對所有待移除panel依目前focus優先、再按layout順序完成preflight；任一拒絕即不dispatch route reconciliation，以`replaceState`恢復目前canonical URL並live announce「尚有未完成編輯」。

## 8. URL與Browser History Contract

### 8.1 Canonical query

- `/`無workspace query：有valid local layout則恢復；沒有則只開organization。
- `panels=organization,duties,processes`：明確指定open set，順序只代表reconciliation input，pixel layout仍由local state決定。
- `panels=none`：明確零panel；不能省略成無query，避免被預設organization覆蓋。
- `focus=<moduleId>`：指定focused panel；不存在於`panels`時忽略。
- `select=<kind>:<encoded-id>`：shared EntityRef；invalid kind／id忽略並移除，不建立幽靈資料。

Module context使用registry allowlist，不接收任意JSON：

| Module | Query keys |
| --- | --- |
| Employees | `employee`、`employeeQ` |
| Positions | `position`、`positionQ` |
| Departments | `department` |
| Levels | `level` |
| Duties | `duty`、`dutyLane`、`dutyView`、`dutyQ`、重複`dutyStatus` |
| Processes | `process`、`node`、`processView` |
| Management methods | `method`、`methodView`、`methodQ`、hash chapter anchor |
| Role risk | `riskRule` |
| Governance | `governanceSection` |

```ts
type WorkspaceRouteContexts = Partial<{
  [K in WorkspaceModuleId]: WorkspaceModuleContextMap[K]
}>

interface WorkspaceRouteState {
  openPanels: WorkspaceModuleId[]
  focusedPanel: WorkspaceModuleId | null
  selection: EntityRef | null
  contexts: WorkspaceRouteContexts
}
```

Route parser先依`WorkspaceModuleId`判別discriminant，再交給相同ID的descriptor解析、sanitize並放入keyed context；不得先解析成`unknown`後由render端cast。Serializer只輸出目前open panel的allowlisted context，closed panel的session buffer不進URL。

### 8.2 Ownership與history

- URL擁有可分享的open set、focus、shared selection及module semantic context／query／filters。
- localStorage擁有split geometry、tab ordering、active tab與visual-only state。
- Domain document擁有business truth；三者不得互相複製權威。
- Launcher open／panel add／close／Drawer promotion使用`history.pushState`，讓browser Back可恢復前一workspace composition。
- row selection、filter、panel focus與view tab使用`replaceState`，避免每次點擊污染history。
- resize、panel move、scroll、zoom與pin不寫URL。
- `popstate`先parse＋sanitize URL，再reconcile local geometry；不執行domain command。

### 8.3 Legacy route alias

下列route在替換期與移除後都可作compatibility alias，但不得render第二套舊composition：

- `/?mode=duty-config...`
- `/duty-planning`及其matrix／anomalies aliases
- `/process-planning...`
- `/management-methods`與`/management-methods/:id...`

Alias解析成`PromotionIntent`後使用`replaceState`收斂到canonical `/` query。Direct URL證據只證明alias recovery；正式parity仍須由頂部launcher或既有正常導航進入。

## 9. Shared Selection與Pin Contract

```ts
interface SharedSelection {
  ref: EntityRef | null
  sourcePanelId: WorkspaceModuleId | 'global-search' | 'route'
  revision: number
}

interface PanelSessionState<Context> {
  pinned: boolean
  context: Context
  localSelection: EntityRef | null
}

type WorkspacePanelSessionMap = Partial<{
  [K in WorkspaceModuleId]: PanelSessionState<WorkspaceModuleContextMap[K]>
}>

type WorkspaceDragSession =
  | { kind: 'panel-layout'; moduleId: WorkspaceModuleId }
  | {
      kind: 'domain-entity'
      sourceModuleId: WorkspaceModuleId
      entityKind: EntityRef['kind']
    }

interface WorkspaceSessionState {
  drawer: DrawerWorkspaceModuleId | null
  focusedPanel: WorkspaceModuleId | null
  sharedSelection: SharedSelection
  panels: WorkspacePanelSessionMap
  dragSession: WorkspaceDragSession | null
}
```

- 同一時間只有一個shared EntityRef；不建立跨種類多選selection store。
- 未pin panel選取支援的Entity時更新shared selection；其他未pin且支援該kind的panel只更新highlight／reveal，不自動改domain資料。
- 不支援該kind的panel保持原視圖，不顯示空錯誤。
- pin時把目前context與selection變成panel-local；之後global selection與Drawer promotion不覆寫。
- pinned panel仍可搜尋、瀏覽、編輯及作typed drag source；其local row selection不覆寫shared selection。
- unpin後立即sanitize並跟隨目前shared selection；若目前kind不支援，保持module default context。
- pin是session-only UI狀態，不進URL、localStorage、domain或browser history。reload後所有panel unpin，以URL semantic context恢復。
- version切換後所有EntityRef以新OrganizationDocument重新resolve；不存在者清除並回module default，不以title或index猜測替代ID。

## 10. Panel Layout Drag與Typed Relation Placement

Panel layout drag與domain relation placement必須有不同source handle、payload、drop zone與state machine：

| Drag kind | Source | Payload | Target | 寫入 |
| --- | --- | --- | --- | --- |
| panel layout | panel tab | `application/x-orgmaster-panel-layout` | stack center／合法edge | browser-local layout only |
| domain entity | module既有專用handle | `application/x-orgmaster-entity` | registry合法Position／ProcessNode等target | existing domain Command/API |

Typed payload只保存kind、stable ID、必要intent（例如Duty lane）及source panel；title、employee name與完整domain object不進dataTransfer。Release時以latest canonical state重新resolve及validate，不信任dragstart snapshot。

Current registry：

- Employee→Position：建立／移轉assignment；放到organization unassign zone解除任職。
- Duty＋`primary-execute|collaborate|review|countersign`→Position：配置或移轉responsibility relation。
- Duty→ProcessNode：建立ProcessNodeDutyLink；ProcessNode與Duty的方向只是UI來源不同，不建立第二relation。

所有domain relation placement遵守：

- valid drop只執行一個canonical command／transaction，形成一個history commit。
- duplicate／noop／invalid／cancel為零domain change、零dirty、零history、零autosave。
- success以受影響projection更新及既有Undo呈現，不開success Modal。
- native pointer與keyboard alternative必須呼叫同一resolver／command；不能只驗滑鼠。
- panel tab不是entity drag handle，entity handle也不得觸發panel移動。

### 10.1 S7 Relation Placement Session Current Phase Implementation Contract

#### 真正需求與狀態模型

跨面板UI的穩定能力是「配置已登錄關係」，不是「拖動DOM」。Native drag與keyboard只是同一任務的輸入方式：

```text
來源物件 → 關係語意 → 合法目標 → 結果預覽 → canonical mutation → Undo
```

S7以一套狹義、typed、不可持久化的`RelationPlacementSession`取代各模組平行drag state。以下模型由第22.6節固定到實際repo、export、owner與reducer action：

```ts
type RelationPlacementSession =
  | { phase: 'idle' }
  | {
      phase: 'placing'
      inputMode: 'native-drag' | 'keyboard'
      payload: WorkspaceEntityDragPayloadV1
      candidate: RegisteredDropTarget | null
    }
  | {
      phase: 'committing'
      payload: WorkspaceEntityDragPayloadV1
      target: RegisteredDropTarget
    }
```

唯一生命週期為`beginPlacement`、`previewTarget`、`commitTarget`與`cancelPlacement`。Native `dataTransfer`仍使用strict `application/x-orgmaster-entity`作transport；hover preview可讀active session，但drop必須重新parse MIME、比對typed payload，並以latest canonical state及最新capability重新呼叫`resolveRegisteredDrop`。Session與focus return ref均是短生命週期UI狀態，不進URL、browser-local layout、OrganizationDocument、history、dirty、autosave或CAS。

#### UI Entry Contract

- Target actor：具organization mutation capability的總經理或主管；workspace位於`draft-edit`或`current-maintenance`，且裝置為至少1024px、hover＋fine pointer的editable desktop。
- 正常起點：由canonical `/`頂部`功能`入口開啟Organization，再開Employee、Duty或Process Drawer／panel；direct URL、測試專用頁或舊route不能取代入口可發現性。
- Source control：來源名稱維持選取／開明細；只有列尾共用配置把手可開始native或keyboard placement。唯讀、mobile、recovery、來源module不可寫或source不存在時不render把手。
- Target availability：只使用目前可見panel內由resolver判定的registered target；placement不自動開啟、切換、移動或分割panel。使用者若要跨panel配置，先自行把來源與目標開到同一工作台。
- Normal delivery path：開始Placement → 可見合法target → hover／focus取得結果語意 → drop或Enter／Space → latest-state重驗 → 單一canonical mutation → projection就地更新 → Undo可恢復。一般成功不開Modal。
- Narrow／readonly：1023×768與390×844只保留閱讀與導覽，沒有來源把手、暫時解除區、drop affordance或hidden mutation；1440 current-view同樣零mutation control。

#### State Transition Contract

| From | Event | Guard／resolution | To | Domain effect |
| --- | --- | --- | --- | --- |
| `idle` | `beginPlacement` | source存在、payload可parse、latest capability可寫 | `placing` | 無 |
| `idle` | `beginPlacement` | readonly／mobile／recovery／invalid source | `idle` | 無；不開始假session |
| `placing` | `previewTarget` | 同一`resolveRegisteredDrop`回`intent／noop／rejected` | `placing`＋candidate result | 無 |
| `placing` | drop／Enter／Space | 重新parse MIME，latest state／capability仍回`intent` | `committing` | 尚無；先鎖定單次commit |
| `committing` | canonical owner applied | assignment helper或Command成功 | `idle` | 一次history／dirty／autosave；可Undo |
| `committing` | noop／rejected／owner failure | duplicate、same、stale、readonly、invalid或Command拒絕 | `idle` | 零change；顯示最短原因／恢復動作 |
| `placing` | Escape／dragend without drop／source或target unmount／capability loss | 無 | `idle` | 零change；keyboard focus回來源 |

`committing`期間同一session的第二個drop、Enter或Space一律忽略，不得形成重複Command。Native `dragend`只做cleanup，不以`dropEffect`推定domain已成功；成功與否只以canonical owner的applied／noop／rejected結果決定。

#### 單一規則與mutation boundary

- `resolveRegisteredDrop`同時產生preview與commit前的`intent／noop／rejected`；禁止另建target highlight validator或在各panel複製規則。
- `RelationPlacementSession`不得執行domain mutation；App composition root只把`DomainMutationIntent`分派到既有`assignEmployeeWithResponsibilities／unassignEmployeeWithResponsibilities`或`runOrganizationCommand`。
- 有效placement只形成一個canonical commit；權限喪失、來源／目標卸載、invalid、same target、duplicate、cancel與Escape全部零domain change。
- Source／target adapter只建立typed payload、呈現resolver結果與回送target；panel不得直接改另一panel state。

#### Registered relation語意

| Relation | Source語意 | Target／結果 |
| --- | --- | --- |
| Employee list／panel→Position | `sourcePositionId=null`；建立任職 | 無regular assignment時建立第一筆並修復主職；已有任職時新增兼任；相同target no-op；若target不允許多人且已有他人，candidate先標示「取代現有人員」，再由既有helper原子處理 |
| Organization Employee→Position | `sourcePositionId=exact PositionId`；移轉該筆任職 | 移到另一Position；同一Position no-op |
| Organization Employee→unassign zone | 只有exact source assignment可解除 | placing期間在Organization owner內顯示明確、暫時的解除區；一般畫布空白與Employee list來源放空白都只取消 |
| Duty＋exact lane→Position | 保留Duty ID、lane、source relation ID | 沿用Duty resolver與primary atomic transfer／duplicate規則；主執行移轉先顯示「移轉主執行」語意 |
| Duty↔ProcessNode | UI可雙向選取來源，但只建立單一ProcessNodeDutyLink | 沿用`LINK_PROCESS_NODE_DUTY`及duplicate/noop規則 |

#### UX Intent

- 任務／結果：總經理或主管在editable desktop從Employee、Duty或Process來源建立正確關係，不需離開目前並排工作台。
- 主物件／主焦點：來源列及目前合法target；面板布局不因關係配置改變。
- 預設刪除：整列drag與click混用、常駐教學、逐次確認Modal、多套成功通知、唯讀假handle及每模組專用配置狀態。
- 保留舉證：editable來源列尾的最小drag handle避免click／drag誤觸；candidate輪廓與最小結果語意避免把新增兼任、移轉、解除或取代混淆；Undo處理可恢復風險。
- 非語言修復：合法target輪廓、hover candidate、drag preview、projection就地更新與focus return；必要文字只保留取代／不可用原因及恢復動作。
- 風險與驗證：current-view、mobile、recovery及capability loss必須default-deny；native、keyboard、reduced motion、viewport、cancel、Undo、autosave及reload均需fresh evidence。

#### 可見結果與回饋契約

| Resolution／結果 | Target呈現 | Commit後回饋 |
| --- | --- | --- |
| 新增第一任職／兼任／Duty relation／Process link | 合法輪廓；hover／focus只顯示最短結果動詞 | projection立即更新＋單一live result；不開成功Modal |
| exact移轉／解除／主執行移轉／取代現有人員 | 與一般新增不同的形狀或圖示＋短結果文字，不只靠顏色 | 顯示受影響來源與目標；既有Undo可恢復 |
| `noop` | 不顯示為主要合法落點；focus／hover時可顯示「已存在」 | 零dirty／history／autosave；不顯示成功 |
| `rejected` | 不顯示合法輪廓；實際嘗試才就地顯示最短原因 | 零change；focus回來源或保持目前target |
| cancel／Escape／非target空白 | 移除candidate及暫時解除區 | 零change；keyboard回來源，native不額外宣告成功 |

同一事實只使用一套主要訊號；不得同時疊加全域toast、常駐說明、badge、紅框與Modal。Live region只在active placement與結果時存在，完成或取消後清除。

#### Current Scope與Out of Scope

Current Scope依序遷移Employee→Position、Duty＋lane→Position與Duty↔ProcessNode，再刪除被取代的`employeeDrag`、`employeeKeyboardDrag`、`dutyDragState`或等效平行正常路徑。開發中可短暫共存以分slice驗證，但candidate freeze前必須完成唯一owner及source scan。

Out of Scope：任意物件互拖、generic event bus、plugin registry、service locator、多實例、批次配置、手機／touch編輯、新DnD dependency、後端drag API、schema／OrganizationDocument版本、permission語意或第二save path。

#### Data／API／Permission／Dependency Impact

- Domain data：OrganizationDocument V7、EmployeeAssignment、DutyPositionRelation與ProcessNodeDutyLink schema均不變；不新增relation type、欄位、revision或migration。
- API／persistence：不新增endpoint或backend drag API；有效結果仍進既有`commitState`、history、autosave、CAS與workspace save。Session、candidate、source focus與drag preview永不持久化。
- Mutation authority：Employee只經`assignEmployeeWithResponsibilities／unassignEmployeeWithResponsibilities`；Duty／Process只經`runOrganizationCommand`及既有Command transaction。`resolveRegisteredDrop`只產生intent，不commit。
- Permission：沿用module domain capability，再與workspace mode、server ready、recovery及mobile readonly取交集；begin、preview與commit都不得自行放寬，commit必須重驗latest capability。
- Existing dependency：重用HTML Drag and Drop、現有React 19、workspace typed payload／resolver、Organization projection與keyboard focus模型；Current Phase不新增DnD套件或改lockfile。
- Compatibility：舊專用MIME與舊state只允許在分slice遷移期間短暫存在；candidate freeze後正常入口只能走strict workspace MIME與單一Placement owner。歷史route parser可保留，但不能render第二套關聯配置UI。

#### Failure Recovery Contract

- Payload無效、unsupported pair、來源／目標不存在、source assignment已被改動或target失效：fail closed、零domain change；就地顯示最短原因並清除session。
- 拖曳途中版本切換、workspace轉唯讀、server／recovery gate啟動或panel卸載：立即取消preview；若drop仍到達，commit前latest-state resolver再次拒絕。
- Command回`noop／rejected`：不把畫面投影成成功；保留canonical state，清除session，使用既有錯誤／notice owner顯示原因。
- Command applied但後續autosave／CAS失敗：Placement本身不得另做補償或第二保存；沿用workspace既有dirty、retry、409與recovery契約，Undo仍對本地canonical history有效。
- 原生drag離開視窗、drop到未登錄區域或瀏覽器未送drop：`dragend`清除session與preview；一般空白不等同解除任職。
- Module error只隔離該panel；global recovery才阻斷全部Placement。任何visible error、意外全零資料或來源／目標projection不同步都重新開啟QA-QC。

#### Execution Boundary與依賴

S7目前為`Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Ready`；前置依賴為S0～S6歷史完成、OrganizationDocument V7可載入的editable draft、`WorkspaceEntityDragPayloadV1`、`resolveRegisteredDrop`、現有assignment helpers／Organization Commands及可操作的Organization／Employee／Duty／Process panels。`relationPlacement.ts`、App唯一協調器、source／target wiring、舊state刪除、Process composition harness與B16 pure fixture已落地並通過targeted／typecheck／full regression／build；E1四個minimum directions、E2五案`historyEvidence`與E3 lifecycle／warning均已有逐案 evidence並完成正式 QA-QC。此段只保留既有契約與重開條件；若後續變更影響關聯、生命週期或資料邊界，才依同一 gate 重新開啟，不回頭重做S0～S6或擴張Future Phase。

#### Final Acceptance Direction

- canonical `/`正常入口、editable draft、1440×900及1024×768實際完成Employee新增任職、兼任、exact移轉與解除；可辨識合法／非法target及結果語意。
- Native與keyboard共用同一Placement生命週期、resolver及mutation owner；取消、noop、invalid與capability loss均不dirty。
- 有效placement的Undo／Redo、autosave、CAS及reload維持同一結果；移動或解除不得遺留dangling primary assignment。
- current-view、1023×768與390×844零relation mutation control；拖曳途中權限變更時drop以latest capability拒絕。
- QA／QC以實際native `dataTransfer`、keyboard、source focus return、console／visible error、保存與reload建立fresh evidence；現有keyboard screenshot、unit resolver test、build或資料直寫不可單獨關閉S7。

## 11. Capability與Readonly Contract

能力只能由global environment、workspace/session及module active spec計算；不得使用panel自身縮小後的client width假裝進入mobile readonly。

```ts
interface WorkspaceEnvironment {
  viewportWidth: number
  hoverCapable: boolean
  finePointer: boolean
  mobileReadOnly: boolean
  serverReady: boolean
  recoveryState: 'none' | 'blocked'
  workspaceMode: 'current-view' | 'current-maintenance' | 'draft-edit'
}

interface WorkspaceCompositionCapability {
  canCompose: boolean
  mobileReadOnly: boolean
  reason?: string
}

interface ModuleCapability {
  canRead: boolean
  canMutate: boolean
  reason?: string
}
```

- Desktop composition：`viewportWidth >= 1024`且hover＋fine pointer；可在唯讀版本調整layout，因layout不是domain mutation。
- 不符合composition capability：同時間顯示單一全寬module surface；launcher作module導航，無split／resize／layout drag／pin。
- 手機最高原則：所有module mutation為false；只保留閱讀、搜尋、篩選、view切換及關聯導覽。不得只靠CSS隱藏，server/domain仍fail closed。
- Duty／Process desktop mutation沿用各自`canMutate...`；Management Method沿用細粒度session capabilities；Governance沿用manage、catalog freshness與publish blocker；Risk沿用organization editing。
- 每個adapter先呼叫既有module capability resolver取得domain capability，再由`resolveModuleCapability(moduleId, environment, domainCapability)`與recovery、mobile readonly及workspace mode取交集；workspace不得複製或放寬module權限演算法。
- Shell只使用`WorkspaceCompositionCapability`決定split／resize／panel layout是否可用，並使用adapter回傳的`ModuleCapability`控制該surface；registry不得執行capability判斷。
- Global read-only indicator只顯示一次；panel內只有在某動作需要解釋拒絕時才顯示最短reason，不重複鋪滿唯讀badge。

## 12. Data、API、History與Persistence Impact

### 12.1 明確不變

- OrganizationDocument維持V7；不新增workspace panel、layout、URL、selection、pin、drawer或visual state欄位。
- Workspace manifest維持V1；organization version、revision、CAS及500ms domain autosave不變。
- Process、Duty、Position、EmployeeAssignment、Management Method與Governance各自既有資料權威不變。
- 不新增layout API、server table、帳號同步、event bus、queue或跨panel persistence service。

### 12.2 UI-only stores

- `WorkspaceLayoutV1`：localStorage、可丟棄、不可影響domain。
- `WorkspaceRouteState`：URL、可分享、parse/sanitize後使用。
- `WorkspaceSessionState`：Drawer、focus、pin、shared selection、drag session；reload可重建或清除。

### 12.3 Mutation owner例外

Employee CRUD與部分Department CRUD目前由`commitState`／directory helper擁有，尚未全部納入`OrganizationCommand` union。DEV-039 adapter必須重用現行guarded owner；不得在UI搬移時順手建立第二套Command或假裝authority已統一。若未來要統一，另案定義transaction與回歸。

### 12.4 S6 selection與detail state authority

- URL只保存可分享的semantic module context與stable ID；不保存detail DOM owner、overlay座標或focus trap。
- `WorkspaceSessionState.panels[moduleId]`保存panel-local selection／pin／可恢復context；feature可保留自己既有的draft或editor buffer，但不得複製domain truth。
- `SharedSelection`是通知，不是render owner。更新shared selection不得直接切換另一module的`inspectorOpen`或掛載其detail。
- Organization Inspector只屬organization panel；Employee／Position／Department detail只屬各自`MasterDataModuleAdapter`；Duty configuration／audit／distribution detail只屬Duty panel；Management Method章節及Duty對照只屬Management Method panel。
- S6不改OrganizationDocument V7、server API、schema、revision、CAS、autosave、permission或domain transaction；沒有資料migration。若實作需要其中任一項，立即停止回PM另定scope。

## 13. Focus、Keyboard與Dismissal Contract

Focus順序：global chrome → launcher／Drawer → region tabs → focused panel content → panel-local surface。workspace不得把focus送到隱藏tab內容。

Escape priority一次只處理一層：

1. Recovery gate：不允許Escape略過。
2. Panel-local blocking dialog／editor confirmation。
3. Panel-local menu／popover／detail Drawer。
4. Active domain drag cancel。
5. Panel layout drag cancel。
6. Quick Drawer close。
7. Focused panel的既有dismissable Inspector。
8. 不以Escape直接關閉整個panel，避免誤關長文件；panel close使用具名控制。

Global save、save-copy、undo、redo、fit與search快捷鍵依parity manifest保留。Dock/tab keyboard不得攔截Organization的Enter／Tab／F2／Alt reorder或editor標準輸入；event owner必須先判斷焦點scope。

所有icon-only控制具有accessible name；active tab、pin、drop validity、selection與error不只靠顏色。短暫panel reveal highlight在`prefers-reduced-motion`下改為靜態outline，且不是唯一focus訊號。

## 14. Workspace Hydration與Recovery Gate

`recoveryOpen`不得再硬編碼`false`。Current Phase固定bootstrap狀態：

```ts
type WorkspaceHydrationState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'index-unavailable'; message: string }
  | { kind: 'workspace-invalid'; message: string }
  | { kind: 'version-invalid'; versionId: string; message: string; isCurrent: boolean }
  | { kind: 'conflict'; versionId: string; message: string }
```

行為：

- `loading`：global chrome可顯示骨架，module panels不以fixture假裝ready。
- network/index unavailable：阻斷domain mutation，顯示單一Retry；不得`setServerReady(true)`後讓使用者編輯未連線的fixture state。
- manifest invalid：全域recovery gate，不讀legacy、不autosave、不render可編輯panel；只提供Retry及既有server recovery資訊。
- current version missing／invalid：全域recovery gate，不載入其他草稿冒充current；可開版本工作區選擇另一個合法version作明確查看／編輯，current pointer不被偷偷改寫。
- 單一非current draft invalid：版本列顯示failed；選到它時進version-invalid gate，其他合法version仍可明確選擇。
- 409／revision conflict：保留記憶體中的未保存內容並進`conflict` gate，停止後續mutation與autosave；提供先下載目前副本，再明確重新載入該version的恢復路徑，不可背景重試覆寫較新版本。
- 若client確實持有legacy raw payload，才顯示「下載原始備份」；server failed version不為了UI把raw bytes傳到一般可見response。
- 舊`DocumentRecoveryDialog`的「建立新的空白文件」不得直接接到workspace流程；DEV-020禁止以空白／fixture或其他草稿假裝current。若未來要重建current，另走版本恢復產品決策。
- recovery gate開啟時所有global keyboard mutation、autosave、panel domain mutation及typed entity drop均為no-op；layout閱讀與診斷也不得遮住recovery主焦點。
- 恢復成功後重新取得index與version、parse成功、更新revision/signature，再進`ready`；不能只把dialog關掉。

## 15. Loading、Empty、Error與Feedback

- Module loading/error只阻斷該panel，不用整頁backdrop；workspace與其他不相依panel可操作。
- Organization/index recovery屬全域依賴，才允許全域阻斷。
- 空白panel只顯示短事實與一個合法主要動作；無capability時不留disabled空工具列。
- 錯誤靠近來源、保留query/input/context，顯示最短原因與Retry／recovery action。
- 任一可見`.inline-error`、`[role=alert]`、HTTP 4xx/5xx文字、Not Found、Internal Server Error或非預期全零關鍵資料在QC視為fail/reopen；build、unit或API成功不能抵銷。
- Autosave／CAS conflict繼續由global owner顯示；module panel不得另顯第二份「已儲存」狀態。

## 16. Compatibility、Intentional Replacement與Removal

### 16.1 保留

- 全部parity manifest的`P`與`R`。
- DEV-038 Process domain、canvas projection、Dagre／React Flow、selection resolver、tests、fixtures及ADR-008。
- DEV-034 Duty relation、native／keyboard resolver、Undo、autosave、CAS與pending recovery。
- DEV-032正式Management Method list/document/editor/API。
- DEV-037 current GovernanceCenter及assignment check。

### 16.2 不復活

- 版本比較UI。
- 未接線standalone `GovernanceSimulator`。
- 被正式管理辦法route遮蔽的`ManagementMethodPrototype`。
- DEV-034歷史大型picker、底部Dock與「其他執行」入口。
- DEV-038固定左／中／右composition。

### 16.3 Removal allowlist格式

每一批移除必須先在DEV-039 change log或implementation handoff列出：

```text
legacy file/symbol/route/CSS/test
  → parity manifest feature IDs
  → new module/surface
  → F039 evidence IDs
  → source search result
```

無fresh evidence、仍由正常入口引用、仍承擔error recovery或只知道「看起來舊」者不得移除。

## 17. Acceptance Criteria

S0～S6核取項目由本地RD、automated regression與QA／QC歷史證據支持，權威證據位於`output/playwright/dev039/manifest.md`。S7只重新開啟relation placement相關項目；未核取項目不得以歷史keyboard、unit、build或資料直寫證據替代。任何證據均不代表commit、merge、deploy或release。

### 17.1 Entry與composition

- [x] `/`正常入口第一次進入只開organization；launcher可發現十個Current modules。
- [x] Drawer型模組先開唯一242px左側Drawer；promotion關閉Drawer並加入／聚焦panel，不清其他layout。
- [x] 直接型模組不建立空Drawer；同類panel再開只focus/highlight。
- [x] 使用者可同時操作organization及至少兩種其他module；空間不足時進focused stack tab，不縮成不可用小格。
- [x] 可關閉最後panel取得零panel工作台；launcher仍可恢復內容。
- [x] split、resize、move、tab、close及reset在reload後依local layout恢復；corrupt layout只重設UI。
- [x] 未保存的管理辦法或其他module buffer關閉時走request／guard／commit；取消關閉及Back拒絕均保留panel、URL、context、buffer與focus，不得先移除後補回。
- [x] 十模組可由正常入口依序開啟；尚未首次開啟的重型module不mount、不fetch，inactive surface不持續fit、poll或觀察layout，close後會釋放task-owned listener／timer／observer。
- [x] `LAYOUT-ADJ-01`：員工、職位、部門panel由左側清單開始，明細緊接右側；清單右緣與明細左緣相同（允許1px border），不得因欄位比例產生空白緩衝區；層級維持單欄。
- [x] `LAYOUT-SEP-01`：工作台外框、Drawer／工作區、清單／明細、region tab與split separator等結構分隔線使用共用藍色token；內文卡片與表格分隔線維持中性色；1440×900及390×844無水平溢出。
- [x] `LAYOUT-DIRECT-01`：兼任風險直接型panel在單獨route或同region tab中，內容從region左緣開始並填滿分配區域；不得以舊版`position:absolute`右側overlay覆蓋工作台；977×698實機檢查panel為`position:relative`且無水平溢出。
- [x] `LAYOUT-RESIZE-01`：桌面split separator以primary pointer按下後取得pointer capture，連續pointer move即使觸發React rerender仍以目前父split幾何更新ratio；pointer up／cancel釋放capture。1280×800實機由50%連續拖至59%，separator由`x=637.5`移至`x=757.09`。
- [x] `LAYOUT-OWNERSHIP-01`：工作職掌明細由`DutyModuleAdapter`擁有，必須與工作職掌清單同在其panel並相鄰排列；外層split／move／tab後不得掛載到組織架構或其他module。1900×960三panel實機中明細位於工作職掌區域`y=553`且不是組織圖子節點。
- [x] `LAYOUT-OWNERSHIP-02`：十個module的所有persistent detail／editor以`closest('[data-module]')`解析時只能得到自己的module；在左上、右上、左下、右下及同region tab位置開啟detail後，bounding rectangle均不得超出owner panel或出現在其他module DOM。
- [x] `OVERLAY-SCOPE-01`：panel-scoped popover／Drawer／dialog只進`PanelOverlayHost`，global recovery／blocking modal／toast／drag preview只進`GlobalOverlayHost`；feature source不得直接portal到`document.body`，persistent surface不得使用`position:fixed`或viewport定位。具名allowlist以外source scan為0 matches。
- [x] `STATE-OWNERSHIP-01`：移除可被兩個module同時掛載的共享detail ReactNode及跨module全域`inspectorOpen`控制；shared selection只傳遞stable ref／revision。選取Employee、Position、Department或Duty時，同一detail最多存在一份且owner正確，其他panel只highlight／reveal。
- [x] `CONTAINER-RESPONSIVE-01`：feature以panel container決定清單／明細排列；1440桌面將panel縮至其minimum附近時仍保持desktop capability，不套手機fixed Inspector、不出現雙重捲動、遮擋或水平溢出。

### 17.2 Context與navigation

- [x] Drawer selected object、query、filters在promotion後由未pin panel接收；pinned panel只focus不覆寫。
- [x] shared selection只用stable EntityRef；支援panel同步highlight/reveal，不支援者不變。
- [x] version switch清除invalid IDs，不以title/index猜測。
- [x] URL可恢復open set、focus、semantic context；Back/Forward不執行domain mutation。
- [x] legacy routes收斂到canonical `/`且不render第二套composition。

### 17.3 Mutation與authority

- [x] layout／focus／pin／selection不改domain dirty、history、revision或autosave。
- [x] `REL-PLACEMENT-01`：Employee→Position、Duty＋lane→Position與Duty↔ProcessNode的native及keyboard路徑共用單一Placement Session、`resolveRegisteredDrop`及既有authority；candidate freeze前沒有平行正常drag state。
- [x] `REL-PLACEMENT-02`：valid placement只形成一個canonical transaction；invalid／duplicate／noop／cancel／capability loss零change、零history、零autosave。
- [x] `REL-PLACEMENT-ENTRY-01`：canonical `/`由頂部功能入口開啟來源及Organization；只有editable desktop來源把手可開始，點名稱仍只選取／開明細，direct URL不取代可發現性。
- [x] `REL-EMP-POS-NATIVE-01`：Employee list／panel native drop可建立第一任職或兼任；Organization exact assignment native drop可移轉或解除，且primary assignment pointer維持有效。
- [x] `REL-PLACEMENT-UX-01`：唯讀不顯示handle；editable source的名稱click與drag handle分離；合法target與新增兼任／移轉／解除／取代／noop語意可辨識且不依賴逐次Modal。
- [x] `REL-PLACEMENT-RESULT-01`：一般空白只取消；exact Employee assignment的暫時解除區可辨識。取代現有人員、主執行移轉與解除不只靠顏色，成功只用projection＋單一live result並可Undo。
- [x] `REL-PLACEMENT-FAILURE-01`：drop以latest payload／state／capability重驗；stale source、invalid target、panel unmount、version／mode切換、command rejection與autosave／409各依既有owner fail closed或恢復，不產生第二保存。
- [x] `REL-PLACEMENT-A11Y-01`：同一把手以Enter／Space開始keyboard placement，Tab／Shift+Tab只循環可見registered targets，Enter／Space提交，Escape取消，live status可讀且focus回來源。
- [x] read-only、capability loss、stale governance catalog及mobile均fail closed。

### 17.4 Recovery與failure

- [x] index unavailable、manifest invalid、current invalid、single draft invalid及409各有不同可見結果與恢復路徑。
- [x] recovery gate期間所有mutation與autosave停止；成功後必須重新hydrate才離開。
- [x] module error不阻斷無關panel；global dependency error才全域阻斷。
- [x] UI沒有visible error、意外全零關鍵資料、遮擋、雙重捲動或不可達主要動作。

### 17.5 Accessibility與viewport

- [x] 1440×900與1024×768可由正常入口完成launcher、Drawer、三module、split/tab、pin、native relation placement及keyboard alternative。
- [x] 1023×768退化為單一全寬surface，不顯示composition mutation。
- [x] 390×844完整唯讀，可閱讀／搜尋／篩選／導覽，無新增、編輯、drag、發布或水平溢出。
- [x] focus順序、focus return、accessible name、live result與reduced motion通過。

## 18. RD Slice與Phase Gate

S0～S5屬原replacement Current Phase並已完成；S6由panel owner失敗訊號重新開啟並已通過。S7由原生跨面板relation delivery-path失敗訊號重新開啟，現行為`Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Ready`；S7-0～S7-4 relation core、舊路徑刪除、composition harness與B16 pure fixture已實作並通過targeted、full regression、typecheck與build，fresh QA已補keyboard relation、duplicate/no-op、Escape、reload、readonly及viewport／overflow；E1四個minimum directions、E2五案行為性 Undo evidence與E3 lifecycle／warning均已完成並通過正式 QA-QC。後續只保留 E4 候選凍結授權，不因歷史 runner 再次重試而擴張架構。

| Slice | 主要輸出 | Entry condition | Gate |
| --- | --- | --- | --- |
| `S0 Contract fixtures` | keyed module context、純metadata registry、route parser、layout tree/reconcile、selection/pin、drag-kind純型別與tests | 本spec accepted | exact十module ID、context discriminant、duplicate、corrupt、URL precedence、invalid target；不改產品入口 |
| `S1 Shell` | canonical `/`、global chrome、launcher、Drawer shell、stack/split、organization panel、request／commit close、surface lifecycle、hydration/recovery | S0 pass | default org、zero panel、guarded close／Back、lazy mount、hidden suspension、release、keyboard/focus、recovery browser evidence |
| `S2 Master data` | Employee、Position、Department、Level Drawer/panel adapters | S1 pass | CRUD、search、detail、assignment、readonly、errors與parity IDs fresh evidence |
| `S3 Duty/Process` | Duty與Process adapters、audit/distribution、三條typed relation | S2 pass | keyboard／command／Undo／reload／invalid-noop／three-way selection／409歷史基線已完成；native與單一session另由S7重開 |
| `S4 Documents/Governance` | Management Method、Role Risk、Governance adapters | S3 pass | module capabilities、未保存editor close guard、long document、image、hidden API lifecycle、risk overlay、stale governance、mobile evidence |
| `S5 Replacement` | 完整F039 manifest、removal allowlist、舊composition移除 | S1～S4 pass | typecheck、targeted、full regression、build、browser matrix、source search全部通過 |
| `S6 Panel Boundary Hardening` | Panel／Global Overlay hosts、persistent surface ownership、selection state isolation、source policy與全module geometry matrix | S0～S5歷史基線可重用；本spec／ADR amendment accepted | `LAYOUT-OWNERSHIP-02`、`OVERLAY-SCOPE-01`、`STATE-OWNERSHIP-01`、`CONTAINER-RESPONSIVE-01`、targeted／full／build／B14～B15 re-QC通過；QA-QC Passed |
| `S7 Relation Placement Session` | 單一typed Placement生命週期、三條registered relation遷移、舊drag state刪除、native與keyboard fresh evidence | S7 Implementation Ready與ADR amendment accepted；第22.6、25.6、26.8節P0／P1 readiness缺口為0 | `relationPlacement.ts`、App coordinator、Employee／Duty／Process source handle與target wiring、舊state刪除、full regression、composition harness與B16 pure fixture已完成；fresh QA已補keyboard relation、duplicate/no-op、Escape、reload、readonly及viewport／overflow；E3-WARNING native CDP／strict raw-console已`pass`，E2最新五案`historyEvidence`為`Pass（evidence）`，E1四向strict native record均為`pass`（paired最新見第26.21.25節，桌面viewport extension見第26.21.26節）；目前Relation Placement Implemented |

若任何slice需要改OrganizationDocument、建立第二save path、改既有module permission語意、加入多實例或無法提供正常入口，停止回PM；不得以scope creep直接實作。

## 19. QA／QC Contract

### 19.1 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
| --- | --- | --- | --- | --- | --- |
| 正常入口找不到模組，direct URL可開 | launcher registry漏項 | 功能實際遺失 | 從`/`逐項開啟十模組 | P0 | normal-entry parity case；direct URL不得代替 |
| 開多panel後全部過窄 | 只split不使用tab/minimum | 無法閱讀或操作 | 1024開三種module | P1 | minimum resolver與stack fallback |
| panel drag誤觸domain drag | 共用handle／MIME | 意外改資料 | tab與entity handle交叉拖曳 | P0 | 分離payload/state machine；invalid零history |
| pinned panel被Drawer覆寫 | promotion忽略pin | 失去比較基準 | pin A後從Drawer promotion B context | P1 | lifecycle branch測試 |
| 未保存editor被panel close或Back移除 | shell直接dispatch close／先reconcile route | 內容永久遺失 | 管理辦法dirty後close、Back並選取消 | P0 | request／guard／commit；拒絕時URL、layout、buffer不變 |
| hidden重型panel持續poll／fit／observer | inactive只加CSS hidden，adapter未感知visibility | CPU／network耗用、畫布抖動 | 依序開十模組後觀察network、rAF與observer | P1 | lazy first mount、hidden suspension、close release lifecycle test |
| version switch留下失效ID | 未sanitize | 顯示幽靈／錯誤資料 | 切到不含該ID版本 | P1 | stable ID resolver清除 |
| panel縮窄導致誤判mobile | capability讀panel width | 桌面功能被錯誤停用 | 1440把panel縮到窄 | P1 | capability只讀window/device |
| recovery仍可編輯fixture | `serverReady`錯誤設true | 覆寫或製造假資料 | workspace API失敗／invalid current | P0 | hydration state與mutation hard gate |
| mobile仍可mutation | 只隱藏CSS或route漏guard | 違反最高原則 | 390 direct alias＋API negative | P0 | UI＋command＋server fail closed |
| 舊UI過早刪除 | 以build成功代替parity | 隱性功能遺失 | manifest/evidence/source diff | P0 | S5 deletion gate |
| 畫面有error但tests通過 | QC未看目前頁面 | false pass | visible error sweep／data sanity | P0 | hard fail/reopen |
| persistent detail出現在錯誤panel | detail由`App`或其他surface固定掛載 | 使用者誤認資料所屬並在錯誤上下文操作 | `closest([data-module])`、四象限geometry及negative DOM assertion | P0 | owner adapter唯一mount；`LAYOUT-OWNERSHIP-02` |
| Drawer跨越region或遮住全域chrome | feature沿用`position:fixed`／`100vw`／body portal | 多面板無法比較、焦點及Escape順序錯亂 | computed position、bounding box、overlay host與source allowlist | P1 | panel/global host分級；`OVERLAY-SCOPE-01` |
| 同一detail瞬間重複掛載 | shared ReactNode與全域Inspector state同時被兩個module消費 | flicker、重複ID、焦點跳動、錯誤提交上下文 | React component test、DOM count及rapid selection browser case | P0 | panel-local detail state；`STATE-OWNERSHIP-01` |
| 桌面窄panel被當成手機 | feature用viewport media rule或panel width改permission | 合法桌面操作消失，或mobile限制被誤套／繞過 | 1440桌面縮panel與1023 device capability成對驗證 | P1 | container只決定排版，workspace environment才決定capability |
| Native relation不能跨panel完成，但keyboard／unit被記為通過 | evidence layer混用或來源／目標只接到舊composition | 使用者看得到兩個panel卻無法建立關係 | canonical正常入口實際`dataTransfer`拖放、保存及reload | P0 | 重新開啟`F039-REL-01`；B16不得以keyboard／unit替代 |
| Native與keyboard各自保存配置狀態 | `employeeDrag`、keyboard state與Duty state平行演進 | 合法target、取消、權限及焦點行為分歧 | source scan、state transition tests、成對browser case | P0 | 單一`RelationPlacementSession`；candidate freeze前刪舊owner |
| 所有typed MIME都亮起Position | target只檢查MIME、不經registered resolver preview | 使用者被誘導到最後必定失敗的落點 | ProcessNode→Position、Employee→Duty等unsupported pair fail-seeking | P1 | hover與drop共用`resolveRegisteredDrop`，rejected target不顯示可放置 |
| 拖曳途中資料或權限改變仍沿用dragstart結果 | commit信任session snapshot | 非法或過期關係被寫入 | dragstart後切唯讀／關閉來源／修改assignment再drop | P0 | drop重新parse payload並用latest state／capability resolve |

### 19.2 Evidence layers

- Unit：layout validation/reconcile、route parse/serialize、promotion/pin、selection resolver、drag type discrimination、capability、recovery state。
- Component：launcher、Drawer、tab stack、panel header、focus return、module adapter states。
- Domain regression：既有Organization、Duty、Process、Management Method、Risk、Governance commands/API tests。
- Integration/API：autosave、reload、409、invalid document、failed version、stale catalog、mobile mutation rejection。
- Browser：只能從正常入口操作，記錄source revision、URL、viewport、mode、version、fixture、步驟、screenshot、console、page error、failed network與data sanity。

Fresh artifacts統一進`output/playwright/dev039/manifest.md`，並以parity ID、acceptance ID或FMEA case索引。舊DEV證據只作baseline comparison。

### 19.3 Browser matrix

| Case | Environment | 必驗 |
| --- | --- | --- |
| `B1` | 1440×900 editable draft | 十模組正常入口依序開啟、initial org-only network、Drawer promotion、三panel、split/tab/pin、inactive lifecycle、close release、三typed relation |
| `B2` | 1024×768 editable draft | minimum、Drawer推移、focus、menu/dialog、long content |
| `B3` | 1023×768 readonly fallback | 單一surface、無composition/mutation |
| `B4` | 390×844 mobile readonly | 閱讀、搜尋、篩選、導覽、無overflow與mutation |
| `B5` | 1440×900 current read-only | layout可調，domain mutation全部拒絕且只顯示一份mode狀態 |
| `B6` | 1440×900 recovery/conflict | unavailable、invalid current、failed draft、409、Retry／switch |
| `B7` | 1440×900 reduced motion＋keyboard | launcher、promotion、tab、close、pin、typed placement、focus return |
| `B8` | reload／Back／Forward | URL semantic state、local geometry、invalid layout、version switch sanitize |
| `B14` | 1900×960 editable draft、四region＋tab | 逐module開啟persistent detail／editor；owner `data-module`、DOM唯一性、bounding containment、move／split／tab後所有權不變 |
| `B15` | 1440×900 editable draft＋1023×768 readonly | panel/global overlay分類、Escape／focus return、無跨region遮擋；桌面窄panel維持desktop capability，1023 device仍default-deny mutation |
| `B16` | 1440×900、1024×768 editable draft＋1440 current-view＋1023／390 readonly | 正常入口開Employee與Organization；native建立第一任職／兼任、exact移轉／解除、unsupported target、same／duplicate／cancel、拖曳中capability loss、Undo／Redo、autosave／reload；keyboard使用同一session並focus return；唯讀零handle／零mutation |

## 20. Stop Conditions

立即停止實作並回PM／RD的條件：

- 任一parity`P/R`沒有新surface或只能由hidden/direct URL使用。
- 要求新增OrganizationDocument layout欄位、第二domain store、第二save path或跨panel直接改state。
- 需要改變已確認的單一panel、Drawer→promotion、pin、預設organization、zero panel或mobile readonly語意。
- recovery會載入fixture、空白文件或其他草稿冒充current。
- UI、adapter或module繞過close guard直接dispatch`COMMIT_CLOSE_PANEL`，或route reconcile先移除dirty panel再補救。
- hidden／未首次開啟surface仍因workspace visibility持續fetch、poll、fit、ResizeObserver或其他重型工作，且無法在close後釋放。
- S7實作若出現必須新增DnD dependency才可完成的事實，立即停止回PM；Current Implementation Contract固定不新增dependency。
- 任一P0 FMEA失敗、visible error、意外全零資料、history/autosave污染、invalid drop產生mutation或舊UI刪除後無fresh evidence。
- S6 persistent detail必須依賴`position:fixed`、body portal或workspace root mount才能運作；不得以CSS specificity例外繼續。
- 同一feature需要由兩個module共同擁有detail state，或panel scope缺失時只能靜默fallback到global overlay；停止並重新界定owner，不建立共享mutable store。
- 為完成S6需要新增generic event bus、service locator、plugin runtime、multi-instance、第二domain state、schema/API或permission語意；另開scope，不混入panel hardening。
- S7實作若偏離第22.6節single owner、25.6節slice／deletion allowlist或26.8節targeted／B16契約，立即停止回RD；不得以先保留舊owner、稍後再清理作候選版。
- S7若需要新增後端drag API、schema、OrganizationDocument版本、permission語意、任意relation plugin或第二business store，停止並回PM，不以「跨面板」擴張權限。
- Candidate freeze仍存在`employeeDrag`、`employeeKeyboardDrag`、`dutyDragState`與新Placement owner的平行正常路徑，或native／keyboard使用不同resolver／mutation owner，即判定技術債Gate失敗。

## 21. Workspace Engine工程決策

### 21.1 Readiness spike結論

採用現有`React 19.2.8`＋CSS Grid／Flex實作本契約限定的controlled split-tree＋tab stack；不新增dock dependency，也不修改`package.json`或`package-lock.json`。

| Readiness requirement | Repo事實 | 固定實作 |
| --- | --- | --- |
| controlled serialization | 本契約已有`WorkspaceLayoutV1`，現行無dock schema | 純函式只讀寫V1 tree；DOM不得成為state authority |
| split minimum | module registry已有minWidth／minHeight | `ResizeObserver`取得workspace container；resolver先clamp ratio，非法edge target不顯示 |
| tab stack | 每種module最多一份 | stack array＋activeTab；首次open才lazy mount，已開inactive tab保持module session state並依第25.2節進入`hidden`生命週期，避免editor buffer遺失與背景工作失控 |
| pointer resize | 現行已有pointer／native drag模式 | separator使用Pointer Events＋pointer capture；更新browser-local state，不進domain history |
| keyboard | 現行已有大量global／canvas shortcut | separator用`role="separator"`；方向鍵2%步進、Shift＋方向鍵10%，clamp後live回報；panel move使用tab action menu |
| nested XYFlow | root已有`ReactFlowProvider`，Process canvas已有各自nested provider | organization沿用root provider；Process子canvas保留isolated provider；inactive tab reveal後呼叫既有fit／viewport restore |
| reduced motion | 現行可用CSS media query | focus/reveal以靜態outline為必要訊號，動畫只作補充 |
| bundle與維護 | 新增通用dock會帶入未使用的floating／multi-instance能力 | 限定十module、最多九層split、無floating／portal window／plugin API |

此決策不是建立通用桌面框架。`src/workspace/layout.ts`只可輸出第6節已核准的操作；新增浮動、最大化、多實例、server layout或plugin hook必須重新進入Future Phase，不得在S0預留公開API。

### 21.2 Custom engine DOM contract

- split node：CSS Grid；horizontal使用`minmax(0, first) 6px minmax(0, second)`，vertical使用rows；ratio只由state產生。
- separator：`role="separator"`、`aria-orientation`、`aria-valuemin/max/now`、具名accessible label；pointer move以`requestAnimationFrame`節流，pointerup才寫一次localStorage debounce queue。
- stack：`role="tablist"`＋`role="tab"`＋`role="tabpanel"`；只有active tab進一般tab order，hidden panel不得接受focus。
- layout drag：只從tab handle啟動，使用`application/x-orgmaster-panel-layout`；drop zone只在drag期間出現。
- domain drag：只從業務物件專用handle啟動，使用`application/x-orgmaster-entity`；不得由separator、tab、panel空白區啟動。
- container小於minimum時不靠overflow硬塞；resolver回到focused stack。`1023px`以下不mount split controls。

## 22. Repo、Module、File與Symbol Impact

### 22.1 新增workspace core（S0）

| File | 必須export的symbol／責任 | 禁止事項 |
| --- | --- | --- |
| `src/workspace/types.ts` | `WorkspaceModuleContextMap`、`WorkspaceModuleId`、`DrawerWorkspaceModuleId`、`WorkspaceModuleDescriptorMap`、`EntityRef`、`WorkspaceLayoutNodeV1`、`WorkspaceLayoutV1`、`WorkspaceRouteContexts`、`WorkspaceRouteState`、`WorkspacePanelSessionMap`、`WorkspaceSessionState`、`PromotionIntent`、`PanelCloseGuard`、`RequestPanelClose`、`WorkspaceSurfaceVisibility`、`WorkspaceEnvironment`、`WorkspaceCompositionCapability`、`ModuleCapability`、`WorkspaceHydrationState` | 只可type-import既有Duty／Process route literal；不import React component、renderer或domain mutation owner |
| `src/workspace/moduleRegistry.ts` | `WORKSPACE_MODULE_ORDER`、`WORKSPACE_MODULES: WorkspaceModuleDescriptorMap`、`getWorkspaceModule`；固定十module、label、surface、minimum、selection kinds、typed context parser／sanitizer及query allowlist | 不render UI、不保存context、不判斷module permission、不呼叫Command |
| `src/workspace/layout.ts` | `parseWorkspaceLayout`、`defaultWorkspaceLayout`、`collectLayoutModules`、`insertWorkspacePanel`、`removeWorkspacePanel`、`moveWorkspacePanel`、`resizeWorkspaceSplit`、`setWorkspaceActiveTab`、`reconcileWorkspaceLayout` | 不讀window/localStorage、不接受unknown module、不產生domain change |
| `src/workspace/layoutStorage.ts` | `WORKSPACE_LAYOUT_KEY`、`loadWorkspaceLayout`、`scheduleWorkspaceLayoutSave`、`flushWorkspaceLayoutSave`、`clearWorkspaceLayout`；250ms trailing debounce＋pagehide flush | failure不得throw到App或顯示多次notice |
| `src/workspace/route.ts` | `readWorkspaceRoute`、`writeWorkspaceRoute`、`readLegacyPromotionIntent`、`reconcileRouteWithLayout`；集中push／replace規則 | 不散落呼叫`history.*State`，不接受任意JSON context |
| `src/workspace/state.ts` | `WorkspaceAction`、`createWorkspaceSessionState`、`reduceWorkspaceState`、`openOrFocusPanel`、`commitCloseWorkspacePanel`、`pinWorkspacePanel`、`setSharedSelection` | reducer不得碰guard、Storage、History、API或domain state；UI不得直接dispatch close commit |
| `src/workspace/capability.ts` | `observeWorkspaceEnvironment`、`resolveWorkspaceCompositionCapability`、`resolveModuleCapability(moduleId, environment, domainCapability)` | 不以panel width判定mobile／readonly，不複製module permission resolver |
| `src/workspace/hydration.ts` | `classifyIndexFailure`、`classifyVersionFailure`、`isWorkspaceMutationBlocked`、`reconcileSelectionAfterVersionSwitch` | 不用fixture／title／array index補缺資料 |
| `src/workspace/entityDrag.ts` | `WorkspaceEntityDragPayloadV1`、`readWorkspaceEntityDrag`、`writeWorkspaceEntityDrag`、`resolveRegisteredDrop`、`DomainMutationIntent` | payload不含完整domain object；resolver不直接commit |

每個純函式檔建立同名`.test.ts`；S0不得修改`App`正常入口或CSS。

### 22.2 新增workspace UI shell（S1）

| File | Symbol／責任 |
| --- | --- |
| `src/workspace/useWorkspaceController.ts` | `useWorkspaceController`、`requestWorkspacePanelClose`、`registerWorkspacePanelCloseGuard`：以`useReducer`持有純workspace state、依第23.2節完成bootstrap／popstate preflight並集中執行route／layout-save／focus／announce effects；guard allow後才commit close，不讀寫domain truth |
| `src/components/workspace/WorkspaceShell.tsx` | global chrome下的唯一composition owner；接收layout/session及`renderPanel`／`renderDrawer` callbacks |
| `src/components/workspace/WorkspaceLauncher.tsx` | 頂部`功能`Popover、十module正常入口、opened state與focus return |
| `src/components/workspace/WorkspaceQuickDrawer.tsx` | 唯一242px push Drawer及窄版full-width surface；promotion成功才關閉 |
| `src/components/workspace/WorkspaceLayout.tsx` | recursive split renderer、container measurement、legal drop-zone projection，以及只供本layout owner使用的private `PanelRegion`；tab stack、active／hidden panel、pin／request close及keyboard move都由此唯一composition owner負責 |
| `src/components/workspace/WorkspacePanelFrame.tsx` | panel boundary、`visibility`、close pending、focus/reveal outline、panel-local error boundary；不重複大頁首 |
| `src/components/workspace/WorkspaceRecoveryGate.tsx` | loading、index unavailable、workspace invalid、version invalid及conflict的唯一global gate |
| `src/components/workspace/OrganizationPanel.tsx` | 從`App`抽取現行organization React Flow composition；所有command／history仍由App注入 |
| `src/components/workspace/WorkspaceModuleSurfaces.tsx` | `WORKSPACE_MODULE_ADAPTERS`、`renderWorkspacePanel`、`renderWorkspaceDrawer`；唯一typed module render switch／adapter composition，傳遞visibility及close guard registration |
| `src/components/workspace/workspace.css` | 新shell、split、tab、Drawer、drop-zone、recovery及breakpoint樣式；不把新規則繼續堆進既有5313行`index.css` |

`PanelRegion`目前只被`WorkspaceLayout`使用，因此保留為同檔private component，避免為檔案分層而製造沒有重用價值的公開抽象；只有出現第二個render owner或必須獨立載入時才允許抽成`WorkspaceRegion.tsx`。`WorkspaceModuleSurfaces`不得保存第二份domain state、不得建立generic service locator／event bus，也不得反向import registry造成render cycle。建立`src/workspace/useWorkspaceController.test.tsx`、`WorkspaceShell.test.tsx`、`WorkspaceLayout.test.tsx`、`WorkspaceModuleSurfaces.test.tsx`、`WorkspaceRecoveryGate.test.tsx`與`WorkspaceLauncher.test.tsx`component harness。沿用現有Vitest＋jsdom＋`createRoot`慣例，不新增Testing Library依賴。

### 22.3 既有authoritative files與精確修改點

| Existing file | Symbol／區段 | S0～S5變更 |
| --- | --- | --- |
| `src/App.tsx` | `App`、`useOrgHistory`、workspace bootstrap、route early returns、Toolbar wiring、organization React Flow JSX、directory／dialog／risk wiring | 保持domain/controller owner；S1接`useWorkspaceController`、抽OrganizationPanel、改單一shell render；S2～S4傳入既有handlers；S5移除舊early-return composition，不複製history/save owner |
| `src/components/Toolbar.tsx` | `ToolbarProps`及四個現行module icon buttons | 改為單一`WorkspaceLauncher`入口；VersionSwitcher、DocumentMenu、搜尋及mode原位保留 |
| `src/components/DirectoryDock.tsx` | `DirectoryDock`、`DirectoryKind`、`DirectoryPanel`、`DutyDirectoryRow` | 以`presentation='surface'`重用同一Directory list／row／context menu；Drawer與panel由App注入相同selector與CRUD owner，不另建第二份主資料surface |
| `src/components/DirectoryDetailPanel.tsx`、`DirectoryDialogs.tsx` | 現有detail及CRUD dialogs | 改由master-data panel adapter掛載；dialog仍是panel-local blocking layer |
| `src/components/DutyCenter.tsx`、`DutyPlanningWorkbench.tsx`、`DutyDetailDrawer.tsx`、`DutyDialogs.tsx` | Duty audit／distribution／detail／edit | `DutyCenter`已收斂為panel-only內容surface；`DutyModuleAdapter`提供workspace lifecycle，四lane、filters、authority與detail維持原owner |
| `src/components/ProcessPlanningWorkbench.tsx` | `ProcessPlanningWorkbench`流程內容 | 已收斂為panel-only流程清單、mindmap／flow及Duty bridge；workspace organization panel負責Position視角，專屬`ProcessOrganizationCanvas`已移除 |
| `src/components/ProcessPlanningCanvas.tsx`、`ProcessDutyBridge.tsx` | canvas／Duty link | 原樣重用；仍由nested`ReactFlowProvider`隔離 |
| `src/components/managementMethods/ManagementMethodListPage.tsx`、`ManagementMethodDocumentPage.tsx` | 正式list／document surfaces | 已收斂為panel-only surface；`ManagementMethodModuleAdapter`承接workspace lifecycle，API、editor、image、chapter Drawer及離開保護不變 |
| `src/components/RoleCombinationRiskPanel.tsx` | `RoleCombinationRiskPanel` | 已收斂為panel-only surface；rule commands與derived overlay authority不變，readonly mode不render mutation controls |
| `src/components/GovernanceCenter.tsx`、`GovernanceCenter.css` | `GovernanceCenter`內容surface | 已收斂為panel-only surface；`GovernanceModuleAdapter`承接workspace lifecycle，API、capability、dialogs與audit不變 |
| `src/panelDismissal.ts` | `WorkspacePanelId`、`EscapeDismissContext`、`resolveEscapeDismissAction` | 改用module ID＋第13節priority；Escape永不直接close panel |
| `src/versionWorkspace.ts` | `OrgWorkspaceIndex`、`OrgWorkspaceVersionSummary` | 新增client envelope validators，拒絕current缺失、duplicate、invalid summary與錯誤loadStatus |
| `src/serverWorkspaceStorage.ts` | `loadWorkspaceIndex`、`loadWorkspaceVersion`、`saveWorkspaceDocument` | 使用validators並保留server code/status；不得把400／422／network都壓成同一訊息 |
| `src/components/workspace/WorkspaceRecoveryGate.tsx`、`src/workspace/hydration.ts` | typed hydration與全域阻斷 | 已取代並刪除`DocumentRecoveryDialog`；index／workspace／version／conflict失敗不可render可操作workspace |
| `src/dutyConfigurationRoute.ts`、`dutyPlanningRoute.ts`、`processPlanningRoute.ts`、`managementMethods/route.ts` | 現行parser／builder | 作legacy alias input保留；render authority移到workspace route，不能在S5刪parser |
| `src/index.css` | legacy directory／workbench／page／modal composition CSS | S1只加必要import/compatibility；S5依allowlist刪舊composition selectors，不做無關全檔格式化 |

`src/main.tsx`的root`ReactFlowProvider`保持不變。S1若發現OrganizationPanel extraction無法在同一provider正確呼叫`useReactFlow`，立即停止，不得以第二Organization store或第二App root解決。

### 22.4 Module adapter切片

| Slice | 新adapter | Reuse owner | 完成後才可停用的legacy rendering |
| --- | --- | --- | --- |
| S2 | `MasterDataModuleAdapter.tsx` | DirectoryDock surface、DirectoryDetailPanel、DirectoryDialogs、App handlers | `/`左側固定Directory rail；不是domain helpers |
| S3 | `DutyModuleAdapter.tsx`、`ProcessModuleAdapter.tsx` | DutyCenter、ProcessPlanningWorkbench、organizationCommands、existing route parsers | duty-config／duty-planning／process-planning舊composition已移除；aliases只保留canonical translator |
| S4 | `ManagementMethodModuleAdapter.tsx`、`RoleRiskModuleAdapter.tsx`、`GovernanceModuleAdapter.tsx` | 正式managementMethods components、RoleCombinationRiskPanel、GovernanceCenter | full-page／backdrop shell；API與inner dialogs保留 |

adapter檔位於`src/components/workspace/adapters/`。每個adapter只做context mapping、capability與render props；不得新增CRUD reducer、fetch cache、autosave或permission判斷副本。

### 22.5 S6 Panel Boundary Hardening檔案契約

S6在現有engine上強化邊界，不重寫layout／route／domain，也不新增dependency。Implementation Readiness Review已固定以下最小修改面、public symbols及owner；RD不得另創第二套overlay manager、detail store或surface framework。只有同檔private helper可依實作需要調整命名，表中export與責任不可改變。

| File／symbol | S6責任 | 禁止事項 |
| --- | --- | --- |
| `src/components/workspace/WorkspacePanelFrame.tsx` | 維持`data-module`唯一root；在root內固定建立`data-workspace-panel-content`與`PanelOverlayHost`，並以`WorkspacePanelOverlayScope`提供目前`moduleId`及host；既有error boundary仍是module失敗隔離owner | 不保存business state、不判permission、不自行portal到body |
| `src/components/workspace/WorkspaceOverlayHosts.tsx` | export `WorkspaceOverlayProvider`、`WorkspacePanelOverlayScope`、`PanelOverlayHost`、`GlobalOverlayHost`、`WorkspacePortal`、`resolvePanelAnchoredPosition`及`WorkspaceOverlayScopeError`；只有本檔可import `createPortal` | 不成為modal manager、service locator或任意feature registry；host missing不得fallback到body |
| `src/components/workspace/WorkspaceShell.tsx`、`src/App.tsx` | `App`以`WorkspaceOverlayProvider`包住shell與既有global transients；`WorkspaceShell`在唯一位置掛載`GlobalOverlayHost`。全域recovery維持最高阻斷層，App global dialogs只透過`WorkspacePortal scope="global"`進host | 不掛persistent module detail；不得在provider外留下viewport overlay sibling |
| `src/components/workspace/WorkspaceSurfacePrimitives.tsx` | export `WorkspaceListDetailSurface`、`WorkspaceListOnlySurface`及其Props；統一正常文件流、`data-workspace-surface`、`data-workspace-slot`、scroll與container contract | 不建立未使用的Canvas／Document／Single class hierarchy，不包含domain props |
| `src/components/workspace/adapters/MasterDataModuleAdapter.tsx` | 重用`WorkspaceListDetailSurface`／`WorkspaceListOnlySurface`；每個module只組成自己的list／detail；empty detail由adapter注入 | 不接收organization Inspector或可被其他module重用的detail ReactNode |
| `src/components/workspace/adapters/DutyModuleAdapter.tsx`、`src/components/DutyCenter.tsx`、`src/components/DutyDetailDrawer.tsx` | configuration／audit／distribution均由Duty owner組成list＋detail；`DutyDetailDrawer.displayMode`固定擴充為`'drawer' \| 'inspector' \| 'panel'`，`panel`使用正常流且不啟動viewport定位；`DutyCenter`只把local `selectedDutyId`交給同panel detail slot | 不讓`DutyCenter`建立global Drawer，不改Duty relation authority |
| `src/App.tsx` | 移除可重用的`selectedMasterDataDetail` ReactNode；固定拆成`renderOrganizationInspector()`與`renderMasterDataDetail(moduleId)`兩個owner factory。Organization的`selectedId／inspectorOpen`只由organization操作更新；Employee／Position／Department detail ID只讀各自panel context，shared selection只highlight／reveal | 不把owner修正成第二份detail store、generic renderer registry或跨module boolean |
| `src/components/managementMethods/ManagementMethodDutyDrawer.tsx`、`ManagementMethodChapterDrawer.tsx`、`ManagementMethodDocumentPage.tsx` | Duty對照、章節導覽及dirty-close guard透過`WorkspacePortal scope="panel"`進Management Method panel host；Drawer／backdrop使用host-local absolute inset，focus return與Escape維持原契約 | 不使用viewport-fixed Drawer遮住其他panel，不改document API／editor lifecycle |
| `src/components/DutyAnomalyDragPreview.tsx`、`DutyCardDragPreview.tsx` | drag preview改用GlobalOverlayHost | 不接收domain mutation責任 |
| `src/components/DutyMoveCopyPopover.tsx`、`DutyRelationPlacementMenu.tsx` | 以`WorkspacePortal scope="panel"`取代raw portal；座標由`resolvePanelAnchoredPosition(anchorRect, hostRect, overlaySize)`轉為host-local並在四邊保留8px，keyboard／focus return不變 | 不raw portal到body，不自行讀workspace layout tree |
| `src/components/workspace/workspace.css`、`src/index.css`受影響selector | `.workspace-panel-frame`固定`position:relative`；panel host absolute inset且裁切於owner，global host fixed inset；surface content使用named container；同批刪除`.duty-drawer` panel mode、`.management-method-duty-drawer`、chapter backdrop及兩個Duty anchored menu被取代的fixed／viewport規則 | 不以更高specificity覆蓋舊fixed規則作最終修法；container不得決定mutation capability |

新增測試固定為`WorkspacePanelFrame.test.tsx`、`WorkspaceOverlayHosts.test.tsx`、`WorkspaceSurfacePrimitives.test.tsx`、`WorkspaceArchitecturePolicy.test.ts`及`DutyCenter.test.tsx`；既有adapter與Management Method測試就地補強。Source-policy test採具名allowlist；不為單一規則導入ESLint或新dependency。

Exact component contract：

```ts
type WorkspaceOverlayScope = 'panel' | 'global'

interface WorkspacePortalProps {
  scope: WorkspaceOverlayScope
  children: React.ReactNode
}

interface WorkspaceListDetailSurfaceProps {
  className?: string
  listLabel: string
  detailLabel: string
  list: React.ReactNode
  detail: React.ReactNode | null
  emptyDetail: React.ReactNode
}

interface WorkspaceListOnlySurfaceProps {
  className?: string
  label: string
  children: React.ReactNode
}
```

- `WorkspacePortal`是feature唯一portal入口；`scope='panel'`解析最近`WorkspacePanelOverlayScope`，`scope='global'`解析`WorkspaceOverlayProvider`。Provider不存在立即throw `WorkspaceOverlayScopeError`；provider存在但host尚未完成ref registration時暫不render，host註冊後同一state重新render。任何分支都不使用`document.body` fallback。
- `PanelOverlayHost` DOM固定為owner `WorkspacePanelFrame[data-module]`子孫，帶`data-workspace-overlay-host="panel"`及`data-module`；`GlobalOverlayHost`固定一份，帶`data-workspace-overlay-host="global"`。Panel host以`overflow:hidden`限制幾何，host本身`pointer-events:none`，實際overlay root恢復`pointer-events:auto`。
- `resolvePanelAnchoredPosition`只接受已量測的anchor、host及overlay矩形，輸出panel-local `{ left, top }`並在host四邊保留8px；ResizeObserver／scroll造成host或anchor變動時由consumer重新量測，不保存到URL、layout或domain。
- Source-policy的GlobalOverlay allowlist在S6只允許：workspace recovery／version workspace、App層canonical mutation blocking dialog、layout notice／toast及Duty drag preview；每列必須記component、reason及B15 case。Position／Directory menu、Management Method章節／Duty對照與一般detail不得列入global allowlist。

### 22.6 S7 Relation Placement exact repo／symbol contract

S7不新增context provider、event bus、service locator或跨module business store。唯一session owner固定在`App` composition root；狀態轉移與resolver保持pure、可單測，domain mutation仍回到既有owner。

| File | 新增／修改的exact symbol與責任 | 禁止事項 |
| --- | --- | --- |
| `src/workspace/relationPlacement.ts`（新增） | export `RelationPlacementInputMode`、`RelationPlacementCandidateCode`、`RelationPlacementCandidate`、`RelationPlacementSession`、`RelationPlacementAction`、`RelationPlacementCapabilitySet`、`createRelationPlacementSession()`、`reduceRelationPlacementSession()`、`sameRelationPlacementPayload()`、`resolveRelationPlacementCapability()`、`getRelationPlacementAutoPanDelta()`；只處理`idle／placing／committing`、candidate snapshot與pure capability selection | 不import React component，不讀DOM，不執行Command／helper，不保存domain object或可提交intent |
| `src/workspace/entityDrag.ts` | strict MIME parser／writer與`resolveRegisteredDrop()`維持唯一registered rule；新增`RegisteredDropEffect`與`describeRegisteredDropEffect(state,payload,target,resolution)`，只把resolver結果轉成`assign／assign-additional／move／unassign／replace／configure／transfer-primary／link／noop／rejected` enum | 不commit、不顯示toast、不接受title/name/full object、不以preview snapshot提交 |
| `src/workspace/types.ts`、`src/workspace/state.ts`、`src/workspace/state.test.ts` | 刪除從未承擔runtime owner的`WorkspaceDragSession`與`WorkspaceSessionState.dragSession`欄位及初始化／route reconcile殘留；panel layout drag繼續由`WorkspaceLayout` local state擁有 | 不把Relation Placement塞入URL、layout reducer、localStorage或`WorkspaceState`形成第二owner |
| `src/App.tsx` | 以單一`useReducer(reduceRelationPlacementSession, createRelationPlacementSession())`、`relationPlacementSourceFocusRef`及同步`relationPlacementCommitLockRef`取代Employee／Duty平行state；新增`beginRelationPlacement`、`previewRelationPlacementTarget`、`commitRelationPlacementTarget`、`cancelRelationPlacement`、`commitDomainMutationIntent` | 不保留舊handler作正常入口，不從component直接commit另一module，不以React state更新時序充當duplicate lock |
| `src/components/DirectoryDock.tsx` | Employee名稱只選取／開明細；列尾`.relation-placement-handle`獨立承擔native與Enter／Space。Duty目前active lane把手改寫strict payload並呼叫同一begin；Duty card以registered target callback接收ProcessNode | 不讓整個Employee article draggable，不寫legacy Employee／Duty MIME，不保留Duty專用live-session props |
| `src/components/OrgNode.tsx` | Position article成為`position` registered target；Employee名稱按鈕與列尾relation handle分離；只依`RelationPlacementCandidate`呈現target狀態並回送target | 不自行判斷MIME kind即亮起、不呼叫assignment helper／Command、不以整個Employee名稱作drag source |
| `src/components/ProcessPlanningCanvas.tsx` | ProcessNode選取控制與列尾relation handle分離；node仍是`process-node` target，source只寫strict ProcessNode payload | 不讓整張node card同時承擔select與drag，不在canvas內commit link |
| `src/components/ProcessPlanningWorkbench.tsx` | 移除內部`handleWorkspaceEntityDropToProcessNode`的resolver／commit owner；改收App注入的session、begin／preview／commit／cancel窄介面，仍保留Process編輯與selection local state | 不建立Process專用placement state或第二drop notice truth |
| `src/components/ProcessDutyBridge.tsx` | 四lane各自保留明確配置把手，strict Duty payload進單一begin；移除`DUTY_CONFIGURATION_DRAG_MIME` fallback；一般link／unlink CTA仍沿用現有Command | 不把lane click與keyboard grab混成同一控制，不自行保存drag payload |
| `src/components/workspace/OrganizationPanel.tsx`、`src/components/workspace/workspace.css`、`src/index.css` | exact Employee assignment placing時在Organization owner內render暫時`employee-unassign` target；共用`data-relation-placement-*`呈現source／available／noop／rejected／destructive狀態與live result；沿用現有global drag preview host | 不把畫布空白當解除、不新增常駐教學面板、不只靠顏色表達移轉／解除／取代 |
| `src/workspace/relationPlacement.test.ts`（新增）、`src/workspace/entityDrag.test.ts` | 覆蓋pure transition、payload equality、capability source matrix、effect／resolver、re-entry與zero-effect | 不mock掉registered resolver、不只測happy path |
| `src/components/ProcessPlanningWorkbench.test.tsx`、`src/components/ProcessDutyBridge.test.tsx`、三個workspace adapter tests | 以既有Process workbench composition harness成對驗證source handle、registered target、native DOM drop／keyboard grab的共同callback、focus與readonly；不另建平行integration harness，避免重複掛載App owner | 不以直接呼叫domain helper取代DOM input path，不複製App placement owner |
| `src/components/workspace/WorkspaceArchitecturePolicy.test.ts` | 新增S7 source-policy：舊state、舊MIME、legacy handler、平行resolver／commit及整列Employee draggable為0 matches；`resolveRegisteredDrop`與`commitDomainMutationIntent`各只有權威位置 | 不用寬鬆directory allowlist掩蓋殘留 |
| `scripts/dev039-s7-fixture.mjs`、`scripts/dev039-s7-fixture.test.ts`（新增） | 經既有workspace HTTP API準備／檢查／封存task-owned B16 draft；pure transformer輸出deterministic stable IDs與provenance | 不直接寫`data/`、current、manifest或正式版本，不自動吞409／collision |

Exact session contract：

```ts
type RelationPlacementCandidateCode =
  | Extract<RegisteredDropResolution, { status: 'noop' | 'rejected' }>['code']
  | null

type RelationPlacementCandidate = {
  target: RegisteredDropTarget
  status: 'intent' | 'noop' | 'rejected'
  effect: RegisteredDropEffect
  code: RelationPlacementCandidateCode
}

type RelationPlacementCapabilitySet = {
  organizationAssignment: ModuleCapability
  dutyConfiguration: ModuleCapability
  processPlanning: ModuleCapability
}

type RelationPlacementSession =
  | { phase: 'idle' }
  | {
      phase: 'placing'
      inputMode: 'native-drag' | 'keyboard'
      payload: WorkspaceEntityDragPayloadV1
      candidate: RelationPlacementCandidate | null
    }
  | {
      phase: 'committing'
      inputMode: 'native-drag' | 'keyboard'
      payload: WorkspaceEntityDragPayloadV1
      target: RegisteredDropTarget
    }

type RelationPlacementAction =
  | { type: 'BEGIN'; inputMode: RelationPlacementInputMode; payload: WorkspaceEntityDragPayloadV1 }
  | { type: 'PREVIEW'; candidate: RelationPlacementCandidate | null }
  | { type: 'BEGIN_COMMIT'; target: RegisteredDropTarget }
  | { type: 'CANCEL' }
  | { type: 'FINISH' }
```

`RelationPlacementCandidate`只保存顯示用snapshot；`commitRelationPlacementTarget`永遠忽略candidate中的舊結果，native先以`readWorkspaceEntityDrag(dataTransfer)`重新parse並用`sameRelationPlacementPayload()`比對active payload，keyboard直接取active payload，兩者再以`currentStateRef.current`與`resolveRelationPlacementCapability(payload,target)`重新呼叫`resolveRegisteredDrop()`。只有最新結果為`intent`且`relationPlacementCommitLockRef.current=false`時才進`committing`並呼叫一次`commitDomainMutationIntent`；`finally`清lock、session、candidate與drag preview，keyboard以`requestAnimationFrame`回來源focus。

`commitDomainMutationIntent`是App內唯一placement dispatcher。它先保存`base = currentStateRef.current`：`employee-assignment.targetPositionId !== null`時必須從`base`取得active target，並呼叫`assignEmployeeWithResponsibilities(base, employeeId, targetPositionId, sourcePositionId, { asOf: TODAY, allowMultipleAssignees: target.allowMultipleAssignees })`；`targetPositionId === null`時要求`sourcePositionId !== null`並呼叫`unassignEmployeeWithResponsibilities(base, sourcePositionId, employeeId, TODAY)`；`organization-command`呼叫`executeOrganizationCommand(base, command)`並只接受`applied`結果。只有`next !== base`／command applied才統一交`commitState(next)`一次，rejected／noop不呼叫`commitState`。既有非placement表單或CTA可保留原handler，但不得再由native／keyboard target直接呼叫`changeAssignment`、`removeAssignment`或`runOrganizationCommand`。

Capability以relation語意及來源模組取交集，不依panel寬度。App先用既有`resolveModuleCapability()`產生`RelationPlacementCapabilitySet`三個已含workspace mode、server ready、global recovery、`>=1024px`、hover＋fine pointer的能力，再由pure `resolveRelationPlacementCapability(payload,target,set)`選擇：Employee→Position／unassign使用`organizationAssignment`；Duty＋lane→Position若`sourceModuleId==='duties'`使用`dutyConfiguration`，若`sourceModuleId==='processes'`使用`processPlanning`，其他來源fail closed；Duty↔ProcessNode使用`processPlanning`。`begin`與commit均重算；capability由true轉false時App effect立即`CANCEL`，晚到的drop仍會被latest resolver拒絕。來源模組只決定可否開始／提交，不改變registered relation、domain command或permission authority。

資料／API／migration：OrganizationDocument V7、Workspace layout V1、workspace API、relation schema與permission不變，故沒有domain、backend或localStorage migration。唯一migration是runtime source replacement：新session接通後同slice刪舊state／MIME／handlers／CSS；舊頁面reload只得到`idle`，不需恢復進行中的placement。

## 23. S0 Pure Contract與State Transition

### 23.1 Reducer輸入

```ts
type WorkspaceAction =
  | { type: 'OPEN_OR_FOCUS'; intent: PromotionIntent }
  | { type: 'COMMIT_CLOSE_PANEL'; moduleId: WorkspaceModuleId }
  | { type: 'SET_ACTIVE_TAB'; stackPath: number[]; moduleId: WorkspaceModuleId }
  | { type: 'MOVE_PANEL'; moduleId: WorkspaceModuleId; target: LayoutDropTarget }
  | { type: 'RESIZE_SPLIT'; splitPath: number[]; ratio: number }
  | { type: 'SET_PINNED'; moduleId: WorkspaceModuleId; pinned: boolean }
  | { type: 'SET_SHARED_SELECTION'; selection: SharedSelection }
  | { type: 'OPEN_DRAWER'; moduleId: DrawerWorkspaceModuleId }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'RESTORE_DEFAULT' }
  | { type: 'RECONCILE_ROUTE'; route: WorkspaceRouteState }
  | { type: 'RECONCILE_VERSION'; state: OrgDirectoryState }
```

reducer回傳`{ state, effects }`；effects只宣告`push-route`、`replace-route`、`schedule-layout-save`、`focus-element`、`announce`。React glue執行effect，純reducer本身不得碰browser API。所有module context先經同ID registry sanitizer；unknown module、context discriminant不符、duplicate panel、invalid selection及illegal split為no-op或安全fallback。

`COMMIT_CLOSE_PANEL`不是公開UI intent，只接受controller在close guard全部`allow`後分派。`RECONCILE_ROUTE`同樣只接受controller已完成待移除panel preflight的route；純reducer不await、不顯示confirm，也不自行重新開啟已刪panel。這個request／commit分層是避免未保存buffer遺失的硬性邊界。

### 23.2 URL／local／session bootstrap precedence

1. 先讀legacy alias；若命中，產生PromotionIntent並`replaceState`為canonical query。
2. canonical URL有`panels`：URL open set優先，local tree只提供仍相容的geometry；缺／多panel由reconcile加入或移除。
3. canonical URL無`panels`：使用valid local layout；local不存在或invalid才只開organization。
4. `panels=none`永遠是明確零panel，不被default覆寫。
5. URL selection／module context經目前version stable ID sanitize；local visual state不得補造semantic ID。
6. session pin、Drawer與drag永不從reload恢復。

### 23.3 Layout invariants

- tree最大depth為9（十module單一instance的理論上限）；超過、cycle、empty stack、unknown/duplicate tab或activeTab不在tabs均視為invalid。
- close後empty stack移除、single-child split收斂；零panel為`root:null`。
- move先從原位置移除再插入；若target非法，回傳原layout，不可遺失panel。
- ratio儲存為`0.0001`精度；實際顯示再依container與child minimum clamp。
- layout reducer的任何action前後，`collectLayoutModules`不得有duplicate；測試以invariant helper硬性檢查。

## 24. Workspace Hydration、Recovery與Conflict Wiring

### 24.1 App bootstrap替換點

`App`移除`const [recoveryOpen] = useState(false)`與index failure時的`setServerReady(true)`。改為：

```ts
const [hydration, setHydration] = useState<WorkspaceHydrationState>({ kind: 'loading' })
const serverReady = hydration.kind === 'ready'
const recoveryOpen = isWorkspaceMutationBlocked(hydration)
```

`initialState = screenshotOrganizationState`只可作React state的不可見placeholder；`loading`或blocked gate期間不得render成可操作／可誤認的公司資料。所有`editingEnabled`、autosave、global shortcuts、domain drag、directory CRUD與module capability都必須包含`!recoveryOpen`。

### 24.2 Classification matrix

| Input | Hydration state | UI／recovery action |
| --- | --- | --- |
| index network／5xx／unparseable envelope | `index-unavailable` | 單一Retry；保留既有記憶體內容但不允許mutation |
| 400 `WORKSPACE_*` manifest validation | `workspace-invalid` | Retry＋版本工作區診斷入口；不使用legacy／fixture |
| index loaded且current summary `loadStatus=failed` | `version-invalid`、`isCurrent=true` | Retry；可開VersionWorkspacePanel明確選其他ready version |
| selected non-current summary failed／GET 422 | `version-invalid`、`isCurrent=false` | 保留index；可回ready version，不改current pointer |
| version document parse／kind mismatch | `version-invalid` | 同上；不`replaceState`半成品 |
| save/autosave 409 | `conflict` | 停止mutation/autosave；提供下載目前副本及明確Reload |
| index＋selected version validation成功 | `ready` | 原子更新state、versionId、revision、signature、mode後解除gate |

Retry必須重新跑`loadWorkspaceIndex → validate index → choose explicit/current version → load/parse version`完整鏈；只`setHydration({kind:'ready'})`為測試必敗。切版進入`loading`前若有dirty資料，沿用現有`persistDraft`；409則轉conflict，不得丟棄。

### 24.3 API、data與migration

- server route、OrganizationDocument V7、Workspace manifest V1與version file格式全部不變；本DEV沒有server schema／data migration。
- `server/orgmasterWorkspaceStore.ts`已能在index標示單一failed version，invalid manifest會fail closed；S1只補必要API regression test，不改raw file exposure。
- client local layout是可丟棄V1 cache；沒有舊layout migration。解析失敗清`orgmaster.composable-workspace.layout.v1`並回default organization。
- server failed version raw bytes不進一般response；`hasRaw=false`。只有未來真的持有client raw payload時才可另案顯示下載raw。
- conflict下載使用現有`createOrgDocumentFile`／download copy能力保存目前記憶體內容；Reload前若dirty必須有明確確認，不能由background poll自動覆蓋。

## 25. Module Surface Migration Contract

### 25.1 Shell與App boundary

`App`繼續擁有：`useOrgHistory`、`currentState`、organization command execution、Employee／Department helper mutations、workspace version、domain dirty/autosave/CAS及global shortcut owner。`WorkspaceShell`只擁有layout、route、Drawer、focus、pin、shared selection與drag session。

`WorkspaceModuleSurfaces`以callbacks從App取得canonical state與handlers；禁止把`currentState`複製進每個adapter的`useState`。module內允許既有form draft、query、editor buffer與API loading state，但提交仍回原owner。

### 25.2 React Flow、lazy mount與inactive lifecycle

```ts
type WorkspaceSurfaceVisibility = 'active' | 'hidden'

interface WorkspaceSurfaceLifecycleProps {
  visibility: WorkspaceSurfaceVisibility
  requestCloseGuardRegistration: (
    guard: PanelCloseGuard | null,
  ) => void
}
```

- OrganizationPanel使用root provider；ProcessPlanningCanvas各自使用現有nested provider。不得讓兩個可見ReactFlow共用同一個未隔離store。
- 預設只開organization時，不mount或發出Management Method、Governance、Risk、Duty、Process及master-data panel專屬API／effect。surface只在首次open後lazy mount；預先import bundle可以，但不得預先執行component effect。
- desktop composition中，已首次開啟的inactive tab保留component與module-local editor/query state，tabpanel加`hidden`、`aria-hidden=true`且其子項不可focus；adapter收到`visibility='hidden'`後必須停止只為可見畫面服務的`requestAnimationFrame`、fit、ResizeObserver、IntersectionObserver、polling、refetch及event listener。既有dirty autosave若本來就屬module authority可繼續，不得由workspace另造autosave。
- reveal時adapter改收`visibility='active'`，恢復必要observer／polling；React Flow只執行一次viewport restore／fit，不得因任何無關panel render反覆fit。
- `COMMIT_CLOSE_PANEL`後surface unmount，adapter在effect cleanup釋放listener、timer、observer、in-flight visibility-only request及close guard registration。domain request若不能取消，回應不得寫入已close的local component state。
- `<1024px`只render focused module的interactive subtree；其他open panel保留經核准的route/session context及module-owned draft buffer，但不mount可互動DOM。切回時依context重建；不能為保留畫面而違反單一全寬surface或mobile readonly。
- Organization viewport存入`visualState.organization.canvasViewport`；Process view與selection是semantic URL context，不能塞進XYFlow internal store作唯一權威。

### 25.3 Registered domain mutation intents

```ts
type DomainMutationIntent =
  | { kind: 'employee-assignment'; employeeId: string; sourcePositionId: string | null; targetPositionId: string | null }
  | { kind: 'organization-command'; command: OrganizationCommand }
```

`resolveRegisteredDrop`只依latest`OrgDirectoryState`與capability產生intent或typed rejection。App分派intent到現有`changeAssignment`／`removeAssignment`或`runOrganizationCommand`。成功只commit一次；rejection、duplicate、noop、cancel與panel-layout drag不得呼叫commit。Duty舊MIME在legacy composition保留到S5；新workspace只寫`application/x-orgmaster-entity`，不得在同一drop同時執行兩種payload。

### 25.4 Legacy coexistence與S5切換

S0～S4允許replacement branch內保留舊render branch作fresh parity比較，但正常release gate仍關閉。S5一次完成：

1. legacy route parser改只產生workspace PromotionIntent並`replaceState`canonical URL。
2. 移除App的management method／process／duty full-page early returns與舊fixed shell rendering。
3. 依第16.3節逐symbol allowlist移除無引用component／CSS／test；route parser、domain、Command、API、fixtures及可重用inner surface不得誤刪。
4. `rg`確認不存在hidden legacy mode、永久feature flag、第二save path或direct-only正常功能。

### 25.5 S6 migration與failure recovery

S6採「先建立邊界與失敗測試，再逐owner遷移，同批刪舊規則」；禁止先包一層新host但保留舊fixed／雙mount作永久相容。RD固定依下列slice順序執行，前一slice targeted gate未通過不得進下一slice：

1. `S6-0 Guard fixtures`：新增`WorkspaceArchitecturePolicy.test.ts`及owner negative fixtures；先證明目前raw body portal、Duty audit fixed detail、master-data dual-owner factory及Management Method fixed Drawer會被測試抓到。此slice只新增測試，不改runtime。
2. `S6-1 Boundary primitives`：新增`WorkspaceOverlayHosts.tsx`、`WorkspaceSurfacePrimitives.tsx`，由`WorkspacePanelFrame`掛panel host、`WorkspaceShell`掛global host、`App`掛provider；完成host missing、nested panel、hidden tab及error-boundary tests。
3. `S6-2 Persistent owners`：先把Master Data改為owner factory與共用ListDetail，再把Duty configuration／audit／distribution三view改為同panel list＋detail。此slice完成後刪除`selectedMasterDataDetail` symbol及Duty panel mode的fixed projection；不先處理其他overlay。
4. `S6-3 Typed overlays`：Management Method chapter／Duty對照／dirty-close及Duty anchored menu進panel host；兩個Duty drag preview進global host。`createPortal` import收斂到`WorkspaceOverlayHosts.tsx`一處。
5. `S6-4 CSS／policy closure`：把panel content設為named container；刪除已被取代的fixed／viewport selectors，建立具名GlobalOverlay allowlist並通過source policy。不得保留「稍後移除」註解或高specificity compatibility override。
6. `S6-5 Candidate freeze＋QA/QC`：先跑S6 targeted，再跑full regression／build，記錄dirty boundary後freeze candidate，一次執行B14～B15 final browser QC；失敗回RD，只重驗受影響case及aggregate visible-error／data-sanity sweep。

Host missing、owner mismatch或illegal global request必須fail closed：不得fallback到`document.body`、不得把persistent detail移到workspace root、不得吞掉錯誤後繼續mutation。Panel scope錯誤throw `WorkspaceOverlayScopeError`並由`WorkspacePanelFrame`現有error boundary隔離；尚未註冊host只短暫不render，不視為可重試mutation。Panel-local overlay失敗保留component state、輸入及selection；關閉或重新開啟owner panel後可重建。Global provider／host錯誤阻斷global overlay action，recovery仍依第14節全域阻斷。S6沒有schema、API、OrganizationDocument、Workspace layout envelope或localStorage migration；開舊layout只經現有reconcile。回復只可撤回尚未通過的S6產品slice，不得把已知越界的舊CSS或雙mount恢復成release candidate。

### 25.6 S7 implementation sequence、migration與failure recovery

S7採「先固定純狀態與唯一commit，再逐relation換source／target，最後硬刪舊owner」；每個slice都要保持可建置且前一Gate通過後才能進下一slice：

1. `S7-0 Contract guards`：先新增`src/workspace/relationPlacement.test.ts`及S7 source-policy failing fixtures；測出parallel state、legacy MIME、unsupported target誤亮、stored preview intent被拿來commit及double-submit。只新增／調整測試，不改正常入口。
2. `S7-1 Single session＋commit boundary`：新增pure reducer／effect classifier，App建立唯一session、focus ref、commit lock與`commitDomainMutationIntent`；同步移除未使用的`WorkspaceSessionState.dragSession` placeholder。此時component尚未全面切換，舊路徑只允許編譯期共存，不得形成候選版。
3. `S7-2 Employee→Position`：Directory與OrgNode先完成來源名稱／handle分離、Position registered target、第一任職／兼任／exact移轉及Organization owner內暫時解除區；刪除Employee native／keyboard舊handler及畫布空白解除語意。完成後Employee placement只能走新session。
4. `S7-3 Duty＋lane→Position`：Directory Duty與ProcessDutyBridge來源改用strict payload，OrgNode Position target只讀新candidate；刪除Duty專用state、payload ref、legacy MIME、專用keyboard/live state與重複resolver。`getDutyConfigurationAutoPanDelta`改名搬入新pure module後刪除`dutyConfigurationDrag.ts`及其舊state tests。
5. `S7-4 Duty↔ProcessNode`：Process node來源把手、Process node target與Duty target接入App session；`ProcessPlanningWorkbench`移除直接resolve／commit，Process selection／編輯不變。完成same／duplicate／unsupported／capability-loss與focus return。
6. `S7-5 Candidate freeze`：執行targeted、full regression、build、diff check與source scan；本輪aggregate／source-policy部分已通過。取得可用runtime後，凍結candidate並只跑一次B16 final visual／delivery Gate。任一B16失敗回RD修正，重新freeze後只重驗受影響case加aggregate visible-error／data-sanity sweep。

Candidate freeze deletion allowlist：

| Legacy source | 必須刪除／替換 | 保留項 |
| --- | --- | --- |
| `src/App.tsx` | `employeeDrag`、`employeeKeyboardDrag`、`employeeKeyboardSourceRef`、`dutyDragState`、`dutyDragPayloadRef`、`dutyDragSourceFocusRef`、`dutyDragPointerRef`、`startEmployeeDrag`、`finishEmployeeDrag`、`startEmployeeKeyboardPlacement`、`cancelEmployeeKeyboardPlacement`、`dropEmployeeOnPosition`、`dropWorkspaceEntityOnPosition`、`dropWorkspaceEntityOnDuty`、`startDutyConfigurationDrag`、`cancelDutyConfigurationDrag`、`updateDutyDropCandidate`、`commitDutyDrop`及其舊effect／props wiring | `changeAssignment`／`removeAssignment`若仍有非placement caller可留，但placement source／target不得引用；`runOrganizationCommand`保留一般Command入口 |
| `src/dutyConfigurationDrag.ts`、`src/dutyConfigurationDrag.test.ts` | 全檔刪除；auto-pan算法與有效測試改名移至`relationPlacement.ts／.test.ts` | `dutyConfiguration.ts` resolver、`dutyConfigurationCapability.ts`、Duty domain tests保留 |
| `src/components/DirectoryDock.tsx`、`OrgNode.tsx`、`ProcessDutyBridge.tsx`、`ProcessPlanningWorkbench.tsx` | `DutyConfigurationDragState／Payload／DropCandidate` props、legacy MIME fallback、whole-row Employee／Process drag、component-local resolver／commit | 明確source handle、registered target、現有select/detail與非placement CTA保留 |
| `src/index.css` | `.duty-directory-live-status`、`.is-duty-keyboard-grabbed`、`.duty-drop-*`、`.is-employee-drop-target`、`.is-employee-keyboard-grabbed`、`.is-employee-drop-hover`、`.canvas-wrap.is-employee-drop-zone`等舊state selector | 改由共用`[data-relation-placement-*]`；既有一般drag preview樣式可保留 |
| `src/workspace/types.ts`、`state.ts` | unused `WorkspaceDragSession`、`session.dragSession`及初始化／reconcile | `WorkspaceLayout`自己的`draggingModuleId`與panel MIME保留，因它只改browser-local layout |

移除Gate不接受「目前沒有被點到」：`rg`必須對上述exact symbol／MIME／selector為0 matches，且panel MIME `application/x-orgmaster-panel-layout`與entity MIME `application/x-orgmaster-entity`交叉negative仍通過。若舊symbol仍有真實非placement caller，RD須在同slice改名縮小語意並把caller列入policy allowlist；不得以原名稱保留模糊雙owner。

Failure／recovery實作固定如下：

- Native drop MIME缺失、parse失敗或與active payload不一致：`rejected/PAYLOAD_INVALID`，零commit，清session；不回退legacy MIME。
- `preview`可持續隨latest state重算；target unmount、tab hidden、panel close、version switch、workspace mode／capability改變時candidate立即清除並取消session。
- Command／helper rejected或throw：不投影成功；`finally`釋放commit lock與session，保留canonical state，以既有notice／error owner顯示最短原因。若例外發生在`commitState`前，零history；已由既有owner applied並進history後的autosave／409依版本workspace契約恢復，不做第二次補償。
- Native `dragend`在drop後也會到達，但只能做idempotent cleanup；`commitLockRef`防止同一tick的drop／keyboard重入，domain duplicate guard處理跨session重試。
- Keyboard target registry固定查詢目前可見、未hidden且`data-relation-drop-available="true"`的元素；Tab／Shift+Tab循環，Enter／Space commit，Escape cancel。沒有合法target時保持來源focus並以單一live status說明，不把focus移到hidden tab。

## 26. Exact Test、QA與Command Matrix

### 26.1 S0 pure contract

```powershell
npm test -- src/workspace/layout.test.ts src/workspace/layoutStorage.test.ts src/workspace/route.test.ts src/workspace/state.test.ts src/workspace/capability.test.ts src/workspace/hydration.test.ts src/workspace/entityDrag.test.ts src/versionWorkspace.test.ts src/serverWorkspaceStorage.test.ts
```

必含：exact十module ID、keyed context round-trip／錯誤discriminant fail closed、corrupt／duplicate／depth、minimum split fallback、zero panel、URL/local precedence、legacy alias、pin promotion、version ID sanitize、panel/entity MIME discrimination、invalid/noop零effect、index/version failure classification。

### 26.2 S1 shell＋recovery

```powershell
npm test -- src/workspace/useWorkspaceController.test.tsx src/components/workspace/WorkspaceShell.test.tsx src/components/workspace/WorkspaceLayout.test.tsx src/components/workspace/WorkspaceModuleSurfaces.test.tsx src/components/workspace/WorkspaceLauncher.test.tsx src/components/workspace/WorkspaceRecoveryGate.test.tsx src/panelDismissal.test.ts src/serverWorkspaceStorage.test.ts server/orgmasterWorkspaceStore.test.ts server/orgmasterApi.test.ts
```

必含component harness：default organization且無其他module API/effect、zero panel、Drawer promotion、same panel focus、guard allow／reject／pending、Back拒絕URL恢復、hidden tab focus isolation及背景工作暫停、close cleanup、reveal單次fit、separator keyboard、1024／1023 capability、index unavailable、invalid current、failed draft、409 dirty preservation及Retry完整rehydrate。

### 26.3 S2 master data

```powershell
npm test -- src/components/workspace/adapters/MasterDataModuleAdapter.test.tsx src/directories.test.ts src/assignments.test.ts src/employeeResponsibilities.test.ts src/positions.test.ts src/organizationCommands.test.ts src/organizationHierarchy.test.ts src/organizationLevels.test.ts
```

若`src/organizationLevels.test.ts`在實作開始時仍不存在，RD建立該檔覆蓋add／rename／reorder／delete-used rejection；不得從command matrix刪除層級回歸。

### 26.4 S3 Duty／Process／typed relation

```powershell
npm test -- src/components/workspace/adapters/DutyModuleAdapter.test.tsx src/components/workspace/adapters/ProcessModuleAdapter.test.tsx src/components/ProcessPlanningWorkbench.test.tsx src/components/ProcessDutyBridge.test.tsx src/workspace/relationPlacement.test.ts src/dutyConfiguration.test.ts src/dutyConfigurationCapability.test.ts src/dutyConfigurationRoute.test.ts src/dutyPlacement.test.ts src/dutyPlanning.test.ts src/dutyPlanningRoute.test.ts src/processPlanning.test.ts src/processPlanningCapability.test.ts src/processPlanningLayout.test.ts src/processPlanningRoute.test.ts src/organizationCommands.duty.test.ts src/organizationCommands.process.test.ts
```

必含native＋keyboard三relation、Undo、reload、duplicate/noop/invalid、pending reassignment、三向selection、legacy alias與panel drag交叉negative。

### 26.5 S4 documents／risk／governance

```powershell
npm test -- src/components/workspace/adapters/ManagementMethodModuleAdapter.test.tsx src/components/workspace/adapters/RoleRiskModuleAdapter.test.tsx src/components/workspace/adapters/GovernanceModuleAdapter.test.tsx src/components/managementMethods/ManagementMethodReader.test.tsx src/managementMethods/apiClient.test.ts src/managementMethods/clientCapability.test.ts src/managementMethods/route.test.ts src/roleCombinationRisks.test.ts src/governance/commands.test.ts src/governance/evaluatePermission.test.ts src/governance/governancePresentation.test.ts src/governance/validation.test.ts server/managementMethodApi.test.ts server/orgmasterGovernanceApi.test.ts
```

必含長文件tab切換不丟draft、dirty editor關閉／Back取消不丟buffer、image loading/error、章節定位、hidden Management Method／Governance不重複fetch或poll、close後cleanup、stale catalog fail closed、risk rule CRUD/overlay及390px mutation absence。

### 26.6 S5 aggregate gate

```powershell
npm test
npm run build
git diff --check
```

Browser QC使用既有固定入口`npm run dev:local`（localhost:5000）。啟動前記錄DEV-039用途與process tree；若重用既有匹配runtime，不停止非task-owned process。依B1～B9建立`output/playwright/dev039/manifest.md`；每個case記branch、HEAD、fixture、route、viewport、mode、stable IDs、console/page/network、data sanity與screenshots。UI任務沒有正常入口操作、實際viewport與可見錯誤掃描只能判`未充分驗證`。

### 26.7 S6 Panel Boundary Hardening gate

Targeted component／policy gate：

```powershell
npm test -- src/components/workspace/WorkspacePanelFrame.test.tsx src/components/workspace/WorkspaceOverlayHosts.test.tsx src/components/workspace/WorkspaceSurfacePrimitives.test.tsx src/components/workspace/WorkspaceArchitecturePolicy.test.ts src/components/workspace/adapters/MasterDataModuleAdapter.test.tsx src/components/workspace/adapters/DutyModuleAdapter.test.tsx src/components/DutyCenter.test.tsx src/components/managementMethods/ManagementMethodDocumentPage.test.tsx
```

必含：owner `data-module`、detail DOM count、audit／distribution／configuration三view、rapid selection、shared selection＋pin、panel host/global host分類、host missing fail closed、Escape／focus return、hidden tab不接focus、container窄化不改capability，以及以下source policy：

- `WorkspacePanelFrame.test.tsx`：每個frame只有一個`data-module` root、一個content root及一個panel host；module error只替換該frame，另一frame仍存在。
- `WorkspaceOverlayHosts.test.tsx`：panel portal落在最近owner、nested frames不串host、global portal只有一個global host、host missing throw／pending registration不fallback、unmount清除portal DOM。
- `WorkspaceSurfacePrimitives.test.tsx`：DOM固定`list → detail`，list-only不產生空detail；slot沒有fixed／portal語意，empty detail可聚焦但不搶focus。
- `DutyCenter.test.tsx`與Duty adapter tests：configuration／audit／distribution各選一筆Duty後detail最近owner皆為`duties`、DOM count為1；close後為0，切view或rapid selection不殘留舊detail。
- Master Data adapter／policy tests：`selectedMasterDataDetail` symbol不存在；organization及employee／position／department使用不同owner factory，接收shared selection不自動掛載另一module detail。
- Management Method test：chapter、Duty對照及dirty-close在management panel host；Escape只關目前最上層、focus回trigger，hidden tab無focusable overlay。
- feature persistent selector不得`position:fixed`、`100vw`或`100vh`；panel host子孫使用absolute／normal flow，只有global host可fixed inset viewport。
- `createPortal` import只允許`WorkspaceOverlayHosts.tsx`；`ViewportPortal`屬React Flow canvas內投影，另以exact import allowlist保留。Feature只能render`WorkspacePortal`。
- `App`不得存在`selectedMasterDataDetail`，也不得把同一detail variable傳給organization及master-data／Duty surface。
- allowlist必須列selector／component、overlay level、保留理由與對應B15 case；空泛path、directory或`*.tsx`allowlist不通過。

Aggregate gate：

```powershell
npm test
npm run build
git diff --check
```

Browser B14固定使用現有V7代表性fixture與editable draft，依十module逐一開啟其可用persistent detail／editor；至少把Organization、Duty、Position、Management Method放入四region，Employee與Department放入既有stack tab。每次記錄owner panel與detail bounding rectangle、DOM count、computed position、URL、viewport、mode、fixture及screenshot；move／split／tab後重驗一次。B15先在1440×900依序開Management Method章節／Duty對照、Duty anchored menu與drag preview，驗證panel／global host、Escape及focus return；再把Duty或Master Data panel縮至minimum附近，確認仍是desktop capability，最後以1023×768正常入口確認單一surface及mutation absence。任一detail出現在錯誤module、超出owner panel、重複掛載、raw visible error、非預期全零資料或水平／雙重捲動即Fail；build／unit成功不得抵銷。

### 26.8 S7 Relation Placement executable gate（2026-08-31，歷史 gate baseline）

本節保存 2026-08-31 的 executable gate 與操作契約；當時 S7 為`Relation Placement Implemented / QA-QC Reopened`，E1 native paired evidence與正式 QA-QC尚未閉合。後續 E1 四個 minimum directions、E2 五案、E3 兩案均已通過並完成正式 QA-QC；現行狀態與可執行下一步以第26.13節及第26.16節為準，不得用本節舊快照覆寫現行判定。新增測試檔為`src/workspace/relationPlacement.test.ts`與`scripts/dev039-s7-fixture.test.ts`；跨來源／目標composition harness沿用既有`src/components/ProcessPlanningWorkbench.test.tsx`，不另建平行integration harness。

Pure／state／domain contract：

```powershell
npm test -- src/workspace/relationPlacement.test.ts src/workspace/entityDrag.test.ts src/workspace/state.test.ts src/dutyConfiguration.test.ts src/employeeResponsibilities.test.ts src/organizationCommands.duty.test.ts src/organizationCommands.process.test.ts scripts/dev039-s7-fixture.test.ts
```

必含：exact action transition、BEGIN guard、PREVIEW零effect、candidate不含可提交intent、native payload equality、unsupported pair、same／duplicate、source stale、target stale、capability false、來源模組capability matrix、effect enum、Employee第一任職／兼任／移轉／解除／取代、Duty primary transfer及Process link；`BEGIN_COMMIT`重入只允許一次，CANCEL／FINISH回idle。

Component／composition contract：

```powershell
npm test -- src/components/ProcessDutyBridge.test.tsx src/components/ProcessPlanningWorkbench.test.tsx src/components/workspace/WorkspaceArchitecturePolicy.test.ts src/components/workspace/adapters/MasterDataModuleAdapter.test.tsx src/components/workspace/adapters/DutyModuleAdapter.test.tsx src/components/workspace/adapters/ProcessModuleAdapter.test.tsx
```

`ProcessPlanningWorkbench.test.tsx`以既有workbench composition harness驗證ProcessNode source／target的native DOM callback與keyboard handle callback使用同一窄介面；不mock resolver結果、不複製App owner。Component tests另固定：Employee／Process名稱click不開始drag、只有列尾handle可drag／keyboard grab、Duty四lane strict MIME、只有registered target標示available、hidden tab不進target registry、readonly/mobile零handle。App層的same-resolver、single-commit、focus return、capability-loss與native dataTransfer成對證據仍由B16 browser gate負責。

Source replacement gate：

```powershell
rg -n --glob '!**/*.test.*' "employeeDrag|employeeKeyboardDrag|dutyDragState|dutyDragPayloadRef|DUTY_CONFIGURATION_DRAG_MIME|application/x-orgmaster-employee|dropEmployeeOnPosition|dropWorkspaceEntityOnPosition|dropWorkspaceEntityOnDuty|startDutyConfigurationDrag|cancelDutyConfigurationDrag" src
rg -n --glob '!**/*.test.*' "is-duty-keyboard-grabbed|duty-drop-(command|noop|invalid)|is-employee-drop-target|is-employee-keyboard-grabbed|is-employee-drop-hover|is-employee-drop-zone" src
```

兩個命令在candidate freeze必須0 matches；`WorkspaceArchitecturePolicy.test.ts`把相同規則變成持續回歸。另以source review確認`resolveRegisteredDrop(`除`src/workspace/entityDrag.ts`權威實作及`App.tsx` preview／commit boundary外，runtime source不得呼叫；正常target component不得直接呼叫。`commitDomainMutationIntent`在runtime source只定義於`App.tsx`一次。

Aggregate gate：

```powershell
npm test
npm run build
git diff --check
```

#### B16 executable fixture與操作

RD在`scripts/dev039-s7-fixture.mjs`新增task-owned fixture CLI，唯一允許的動作為：透過現有workspace API從current建立一份名為`DEV-039-S7-B16-<timestamp>`的draft、讀取該draft、加入／正規化下列stable-ID前置資料後以現有CAS PUT保存，最後輸出JSON manifest；cleanup只透過既有PATCH把該draft封存。不得直接覆寫current、manifest或正式資料檔，失敗時保留draft並輸出versionId供人工恢復。

CLI介面固定為：

```powershell
node scripts/dev039-s7-fixture.mjs prepare --origin http://localhost:5000
node scripts/dev039-s7-fixture.mjs inspect --origin http://localhost:5000 --version-id <versionId>
node scripts/dev039-s7-fixture.mjs cleanup --origin http://localhost:5000 --version-id <versionId>
npm test -- scripts/dev039-s7-fixture.test.ts
```

`prepare`先GET workspace index並取得current ID與manifest revision，再POST clone、GET created draft、以pure `buildDev039S7Fixture(document)`建立資料、PUT時帶created version revision；任何409不自動重試或改用last-write-wins。`inspect`必須重新GET並驗證所有stable ID與before relation；`cleanup`先GET最新manifest revision後PATCH archive，再GET index確認entry為archived。HTTP非2xx、V7 parse／validation失敗、stable ID已存在但shape不相容或cleanup readback不符都以非0退出。

| Fixture object | Stable ID／前置狀態 |
| --- | --- |
| 無任職Employee | `employee-dev039-b16-unassigned`；`primaryAssignmentId=null` |
| 單一任職Employee | `employee-dev039-b16-single`→`position-dev039-b16-source` |
| 多任職Employee | `employee-dev039-b16-multi`→source＋`position-dev039-b16-multi` |
| Fixture occupants | `employee-dev039-b16-shared-occupant`→shared；`employee-dev039-b16-exclusive-occupant`→exclusive |
| 空Position | `position-dev039-b16-empty`；active、允許多人 |
| 已有人且允許多人 | `position-dev039-b16-shared`；保留一名非測試來源人員 |
| 已有人且不允許多人 | `position-dev039-b16-exclusive`；保留一名非測試來源人員 |
| 無relation／已有primary Duty | `duty-dev039-b16-new`／`duty-dev039-b16-primary`；primary位於source Position |
| 未連結／已連結ProcessNode | `process-node-dev039-b16-open`／`process-node-dev039-b16-linked`；後者只預建與primary Duty的baseline link |

支援物件同樣固定：建立`department-dev039-b16`、`role-dev039-b16`、`level-dev039-b16`及`process-dev039-b16`；level `order`取現有最大值加1，process `order`亦取現有最大值加1。`position-dev039-b16-source`是該fixture department唯一root，其他fixture Position皆為其直接子職位，且每個Position都有同ID的`members` layout record（同層依ID排序配置`order`、`childrenAxis='horizontal'`），避免破壞單一部門單一連續職位子樹。兩個ProcessNode均屬fixture process，`parentNodeId=null`，`order`固定0／1；baseline link固定`process-link-dev039-b16-linked-primary`。Duty primary relation固定`duty-relation-dev039-b16-primary-source`。Assignment ID固定以`assignment-dev039-b16-<employee suffix>-<position suffix>`組成，日期固定`2026-08-31`、`validTo=null`、`assignmentType='regular'`；pure transformer對相同完整shape idempotent，對同ID不同shape fail closed。

Fixture只建立前置條件；不得預建案例要驗證的Employee→target assignment、new Duty relation或open ProcessNode link。CLI輸出`versionId`、version／manifest revisions、fixture IDs、before relation IDs與完整cleanup command。Fixture unit test固定為`scripts/dev039-s7-fixture.test.ts`並直接import CLI檔export的pure `buildDev039S7Fixture`；測試至少覆蓋deterministic output、idempotent same-shape、collision fail closed、current input不變、invalid V7 fail、hierarchy／primary pointer／relation validation及manifest／version revision原樣回傳。不得改用另一條fixture寫入路徑。

B16在`npm run dev:local`正常入口執行；啟動／重用runtime須遵守task-owned PID／port紀錄與cleanup。由canonical `/`頂部`功能`依序開Organization、Employee、Duty、Process，使用fixture draft：

1. 1440×900 native：無任職→empty、single→shared形成兼任、single exact assignment→另一Position移轉、exact assignment→暫時解除區、unassigned→exclusive取代；各case記before／candidate effect／after／history／dirty，空白drop、same、duplicate、ProcessNode→Position及Employee→Duty必須零change。
2. 1440×900 native Duty／Process：new Duty四lane至少抽測一個新增與primary transfer；Duty→open ProcessNode及ProcessNode→Duty各完成一次，linked duplicate no-op；panel tab與entity handle交叉拖曳不互相觸發。
3. 1440×900 keyboard＋reduced motion：同一handle Enter／Space開始，Tab／Shift+Tab只循環可見合法target，Enter／Space提交，Escape取消且focus回exact source；native與keyboard記錄相同effect與mutation owner。
4. placing途中切到current-view或觸發recovery／關閉target panel，再送drop／Enter；latest capability／target重驗拒絕且零dirty。之後回editable重新開始可成功，不沿用舊candidate。
5. 對valid結果執行Undo／Redo、等待autosave、hard reload，確認exact relation與primary pointer；另注入一次409沿用既有recovery，不由Placement重送第二save。
6. 1024×768 editable重跑Employee native＋keyboard各一條並檢查無遮擋／overflow；1440 current-view、1023×768及390×844確認零handle、零temporary unassign、零drop affordance與零mutation。

Fresh artifacts加入既有`output/playwright/dev039/manifest.md`，ID固定為`F039-S7-B16-*`；至少包含source／target並排、candidate effect、解除區、成功projection、keyboard focus return、capability-loss拒絕、readonly absence及reload結果。每項記branch／HEAD＋dirty boundary、fixture CLI輸出、route、viewport、mode、browser exact version、操作、before／after IDs、console／page／network、visible alert與data sanity。舊`F039-REL-01`～`03`只作baseline，不能替代B16。

B16本次已完成fixture `cleanup`並確認draft狀態為archived；task-owned runtime亦已停止且8080 port已釋放。若後續重跑B16，仍須在結束時完成相同清理。若B16任一visible error、非預期全零資料、double commit、舊state source match、native／keyboard owner不同或cleanup／provenance缺失，S7維持`QA-QC Reopened`，不得標完成。

### 26.9 S7 execution checkpoint（2026-08-31，歷史摘要）

- 靜態與自動化 Gate 已完成：本次窄接線 targeted `2 files／9 tests`（前置relation／component／fixture aggregate `6 files／28 tests`亦保留）、full regression `159 files／656 tests`、`npx tsc --noEmit --pretty false`、`npm run build`、legacy source scan及`git diff --check`均通過。
- B16 loopback runtime已可用：task-owned Vite `127.0.0.1:8080`、Playwright `dev039-s7`、Chromium `HeadlessChrome/151.0.0.0`、viewport `1280×720`，以loopback dev identity（`urn:orgmaster:dev`／`local-admin`）執行；這不等同正式登入或production auth。
- Fixture `draft-ae49e198-ff78-4ace-96af-6cab7cf080e5`（`DEV-039-S7-B16-1788156467803`）已依`scripts/dev039-s7-fixture.mjs`建立、讀回並recoverably archive；archive manifest revision為`108fd7d058d44db20e50b477d7cd1260dd21f95bf60af1ecd9299a7d7a583cb5`，本次操作前後version revision與link readback詳見`output/playwright/dev039/manifest.md`。
- 早期 loopback 紀錄曾以 ProcessNode→Duty `process-duty-2`、Duty→ProcessNode `process-duty-4`標記 native 嘗試；最新 fresh CUA run 未觀察到可驗證的 HTML5 `dataTransfer` drop／mutation，故 native 僅列 partial／未證明。ProcessNode keyboard `process-duty-2`／`process-duty-3`、同target duplicate noop、Employee／Duty native partial、Escape cancel、current readonly無source handle及draft reload persistence仍有API／UI readback；逐案證據詳見`output/playwright/dev039/manifest.md`。
- 恢復條件：依本節B16流程完成fresh QA-QC與適用viewport matrix，重驗invalid／target卸載／capability loss／focus return；不需修改schema、API或新增dependency。

### 26.10 S7 closure checkpoint（2026-08-31，歷史摘要）

本節記錄已完成的最小產品接線與尚未完成的證據收斂；不新增產品決策，也不改變`S7-0～S7-5`、relation registry或domain authority。下一步只重跑`S7-PROC-02`與`S7-EVIDENCE-03`，不再擴張架構。

| 工作包 | 精確修改邊界 | 完成判定 | 不得做的事 |
| --- | --- | --- | --- |
| `S7-PROC-01` ProcessNode→Duty target delivery | 已完成：`ProcessDutyBridge.tsx`接收`onRelationPreview`／`onRelationCommit`窄Props，`ProcessPlanningWorkbench.tsx`原樣傳入App callback；linked／available Duty row註冊`data-relation-placement-target="duty"`、`data-duty-id`、`tabIndex=0`，只接受`WORKSPACE_ENTITY_DRAG_MIME`並回呼既有preview／commit。 | keyboard target可聚焦同一row並建立同一`LINK_PROCESS_NODE_DUTY` intent；native HTML5 `dataTransfer`尚未由本次瀏覽器控制介面觸發，故不能宣稱B16 native通過。 | 不在`ProcessDutyBridge`建立resolver、commit、local placement state；不新增MIME、API、schema、event bus或另一個Duty link command。 |
| `S7-PROC-02` native／keyboard parity pair | keyboard雙向路徑已完成：沿用`relationPlacement.ts`與`resolveRegisteredDrop`，以B16 fixture重跑ProcessNode→Duty及Duty→ProcessNode；已記錄link／noop及API readback。 | keyboard兩個方向對同一關係產生canonical `link／noop`語意；duplicate不重複提交，reload後relation仍存在。native dataTransfer、invalid／target卸載／capability loss／focus return仍待收斂。 | 不以既有keyboard／CTA baseline代替native；若新證據失敗只回到此窄接線，不擴張架構。 |
| `S7-EVIDENCE-03` fresh QA／QC | 本次已補keyboard relation、duplicate/no-op、Escape、reload、readonly及1440／1024／390 viewport／overflow的`F039-S7-QA-*` artifacts，並完成fixture／runtime cleanup；native HTML5 `dataTransfer`、invalid／target卸載／capability loss／visible-error與console warning仍待收斂。正式auth不可用時，明確標註loopback dev identity限制。 | 現有artifact含操作前後ID、API readback、viewport、browser版本、fixture provenance與cleanup；native尚不能由本次瀏覽器控制介面重演，須取得可重演證據後再補齊Gate。 | 不直接寫data／current；不重用舊截圖、unit test或API直寫宣稱fresh QA／QC通過。 |
| `S7-CLOSE-04` candidate freeze與狀態收斂 | 自動化與source gate已完成；待native、failure／warning evidence及文件狀態一致後執行candidate freeze。 | 只有在native dataTransfer、invalid／target卸載 failure、console warning、fresh QA／QC與適用viewport matrix全部通過後，才可將`Relation Placement Implemented / QA-QC Reopened`改為下一個正式狀態；否則保留現狀並記錄 blocker。 | 不因測試數增加、build通過或fixture archive成功而自動升級S7；不在本工作包內commit、merge、deploy或release。 |

S7-PROC-01的target wrapper已完成，且`entityDrag.ts`、App resolver與mutation boundary均維持單一權威。若後續fresh QA失敗，先檢查target是否掛載於可見的`processes` panel、`tabIndex`是否可被keyboard registry找到，以及`dataTransfer`是否在drop事件仍含strict MIME；不得以失敗為由新增event bus、schema、API或dependency。

### 26.11 S7 fresh QA／QC supplement（2026-08-31，歷史摘要）

本節是當時覆寫26.9與closure supplement的歷史觀察；目前逐案結果已由第26.15節取代。當時不把工具無法產生的native `dataTransfer`操作誤報為通過；證據來源為同一working tree與task-owned runtime，fixture完成後已封存，不保留測試資料。現行狀態與優先序依第26.13～26.21節。

| QA case | 實測結果 | 判定 |
| --- | --- | --- |
| 正常入口／功能完整性 | 以`/`→頂部`功能`開啟並提升`員工`、`工作職掌`、`流程規劃`；功能選單同時保留組織架構圖、職位、部門、層級、兼任風險、管理辦法與角色治理。面板分割為組織左側、職掌右上、流程右下，未產生重複module。 | Pass |
| ProcessNode→Duty keyboard | `B16 未連結節點`以Enter抓取，於ProcessDutyBridge的`B16 新工作職掌` target以Enter提交；新增canonical `process-duty-2`，API readback一致。 | Pass |
| Duty→ProcessNode keyboard | `B16 既有主執行職掌`的主執行lane以Enter抓取，於`B16 未連結節點` target以Enter提交；新增canonical `process-duty-3`，API readback一致。 | Pass |
| duplicate／no-op | 同一ProcessNode→同一Duty target再次以keyboard提交；version revision不變，顯示「關係已存在，未重複建立」。 | Pass |
| Escape／focus return | keyboard placement後按Escape；revision不變，焦點回到原Process source handle。 | Pass |
| draft reload persistence | draft重整後，Process／Duty links仍為`process-duty-2`、`process-duty-3`及fixture既有link；版本仍為同一draft。 | Pass |
| native HTML5 cross-panel drag | 早期in-app browser CUA對ProcessNode→Duty、Employee→Position及Duty→ProcessNode未觸發可觀察的`dataTransfer`；後續task-created Chrome CUA觀察到Employee→Position native DOM mutation與same-target noop，但未獨立讀取`dataTransfer.types`、drop event或同操作API／revision。這些結果不能單獨證明完整native path已通過。 | **Partial／Gate open** |
| invalid／target capability failure | Process source→不相容target與切換current readonly均未造成資料變更；後續Duty→Process invalid＋Escape觀察到連結數不變、顯示`放置，Escape 取消`並回idle，但拖曳中target卸載、capability loss與revision/API zero-mutation仍未取得完整可重演證據。 | Partial／Gate open |
| viewport／overflow | 1440×900 editable、1024×768 editable、1440×900 readonly、1024×768 readonly、390×844 readonly皆`scrollWidth === viewport width`且無visible alert；source handles在readonly/mobile為0。 | Pass |
| console／visible error | `role=alert`為0；fresh session保留一次React Flow「parent container needs a width and a height」console warning（切換／重整期間）。 | Partial／Gate open |

Fresh artifacts：`output/playwright/dev039/F039-S7-QA-composed-1440x900.png`、`F039-S7-QA-editable-1440x900.png`、`F039-S7-QA-editable-1024x768.png`、`F039-S7-QA-readonly-1440x900.png`、`F039-S7-QA-readonly-1024x768.png`、`F039-S7-QA-readonly-390x844.png`。Fresh B16 fixture為`DEV-039-S7-B16-1788159259336`／version `draft-84ff0ba0-4ff7-48f4-889a-d66693d4c46b`；最終active測試revision為`7b2afb7f6dd8be0fe9014c7c4966d00fffa3686f4f2bc7c5e61b5a54e8d088ef`，封存後manifest revision為`983ce82161fc29ccafe3ed3edbeee723090ef745b74861bb1932b0ded43bd20d`。task-owned Vite `127.0.0.1:8080`已停止且port釋放；使用者owned `localhost:5000`（PID `23840`）未停止。

結論：S7的relation core與keyboard parity可交付；Chrome CUA已補一筆Employee→Position native DOM mutation與一筆invalid＋Escape observation，但strict native dataTransfer、API／revision、unload／capability-loss failure evidence及React Flow transient warning仍是實作／QA收斂項目，狀態維持`Relation Placement Implemented / QA-QC Reopened`。在補齊可重演native evidence並釐清warning前，不得進入candidate freeze、commit、merge、deploy或release。

### 26.11.1 S7 automated regression re-run（2026-08-31 16:05）

- `npm test -- --run --pool=forks --maxWorkers=1`：`159 test files passed／656 tests passed`。
- 另以相同低併發策略重跑前次平行啟動受影響的 5 個檔案：`5 files／13 tests passed`。前次平行執行的 5 個 worker timeout 視為驗證環境噪音；不得把它寫成產品測試失敗，也不得用它掩蓋新失敗。
- 本次只調整執行併發，未改產品程式、dependency、測試設定或資料；Vite native-config extension advisory仍為既有建置提示。
- 判讀：aggregate regression gate已重新取得可重演的PASS，但不關閉native `dataTransfer`、invalid／target unload／capability-loss failure及React Flow parent-size warning等S7 closure gate。

### 26.12 S7 evidence closure playbook（2026-08-31，歷史摘要）

本節把目前未閉合項目收斂成一次可重演的證據工作包；不新增產品功能、資料模型或輸入路徑。`in-app browser` 的 CUA 拖曳未觸發 `dataTransfer` 只能標示為工具限制，不能直接當成產品通過或產品缺陷。

| Closure step | 執行方式 | 必須留下的證據 | 不得藉此擴張 |
| --- | --- | --- | --- |
| `E1 Native delivery` | 使用能產生真實 HTML5 `DragEvent`／`DataTransfer` 的瀏覽器 harness，從 Employee、Duty、Process source 逐一拖到合法 target；drop event 需讀到 strict `application/x-orgmaster-entity`，並以 API readback 確認 canonical relation。 | 操作前後 stable IDs、`dataTransfer.types`、drop／Command 結果、version revision、screenshot、browser／viewport／identity／fixture provenance。 | 不新增 DnD 套件、Pointer fallback、第二 MIME、第二 resolver 或第二 mutation owner。 |
| `E2 Failure paths` | 同一 B16 fixture 依序測試不相容 target、target 在 placing 中卸載、capability／mode 在 drop 前喪失；均由 latest resolver fail closed。 | visible failure／status、focus return、操作前後 revision／dirty／history／autosave 均不變；unload 不得留下 session。 | 不用靜默取消取代可理解錯誤；不直接寫 current／data 來製造結果。 |
| `E3 React Flow warning` | 捕捉第一次 mount、panel split／close、reload 的 console 時序；確認 warning 是否只在零尺寸的短暫 mount 出現，並與可見錯誤、overflow、重複 listener 分開判定。 | 原始 console sequence、DOM／container geometry、mount／unmount 次數；若需修正只限 `ProcessPlanningCanvas`／既有 lifecycle。 | 不因單次 transient warning 重寫 workspace core、引入全域 suppress 或改動 domain。 |
| `E4 Candidate freeze` | E1～E3與既有 keyboard／no-op／cancel／reload／readonly／viewport matrix全通過後，同步更新主spec、parity、dev_task及manifest狀態。 | 每個 closure row 有 pass／partial、artifact path、source revision與cleanup readback。 | 未全通過時維持`Relation Placement Implemented / QA-QC Reopened`，不得進入commit、merge、deploy或release。 |

執行順序固定為 `E1 → E2 → E3 → E4`；若任一步失敗，只回到既有 target／lifecycle 窄接線修正並按受影響範圍回歸，不建立新的抽象層。這是目前 S7 唯一後續工作包。

### 26.13 RD execution packet（current closure，2026-09-01）

本節把 S7 現行收尾整理成最小包。它不是新的產品需求，也不授權擴張資料模型；E1～E3 evidence 與正式 QA-QC 已完成，下一步只需由 PM／使用者決定是否進入 E4 candidate freeze。若尚未取得授權，不應再重跑已通過的 evidence，也不應修改產品路徑。

> 文件索引規則：第26.9～26.12節保留為前次執行／證據歷史；第26.13～26.21節共同構成目前 S7 的 active 派工、record、同步、狀態判定、Process canvas 幾何窄修正、native runner admission與E2 failure-path來源。較早段落中的「未觀察到」不覆寫後續逐案紀錄，但也不得被單案結果上推為 aggregate pass。

| 工作包 | 預設 owner／允許範圍 | 交付物 | 完成條件 |
| --- | --- | --- | --- |
| `E1-NATIVE` | 已完成；除非契約變更，不再派工 | 四個 minimum directions 的 strict record與API readback | 維持 single relation owner；若後續修改輸入契約，只重開受影響方向 |
| `E2-FAILURE` | 已完成；沿用既有 resolver、capability與recovery | 五案 failure matrix、historyEvidence、cleanup與re-entry／409 record | 不新增產品 history API、第二 store或fallback input |
| `E3-WARNING` | 已完成；若未來 lifecycle 契約變更才重開 | mount、split／close、reveal、flow、reload 的 console／geometry／listener record | 不新增 global suppress、portal或第二 lifecycle owner |
| `E4-FREEZE` | PM／使用者；僅同步文件與狀態 | 主spec、parity manifest、`dev_task`、documentation map、evidence manifest 的同版 revision | E1～E3與既有矩陣均已通過；取得明確文字授權後才可建立 immutable candidate freeze |

#### 執行順序與命令

1. 先確認 working tree、branch、fixture provenance 與 task-owned runtime；不可使用 production 或使用者資料作 fixture。
2. 先跑 targeted relation／component／fixture tests，再跑 `npm test -- --run --pool=forks --maxWorkers=1`、`npx tsc --noEmit --pretty false`、`npm run build` 及 `git diff --check`。
3. 若後續契約變更而重開某一 closure，只有自動化 Gate 綠燈後才執行受影響的 E1～E3；瀏覽器必須由 canonical `/` 的頂部 `功能` 入口進入，並記錄 browser exact version、viewport、mode、version、identity、fixture、URL 與 source revision。
4. 重開案例仍在 `output/playwright/dev039/manifest.md` 留下 `before／action／after／historyEvidence／API readback／console／page error／network／cleanup`；不得以 unit test、API 直寫、舊截圖或 CUA 無 `dataTransfer` 的結果代替 E1。現行四筆 E1、五案 E2與兩案 E3已具備正式 QA-QC evidence，不需重跑。
5. 若後續重開的 E1～E3 任一失敗，只能回到既有 target wrapper／lifecycle 的窄修正並重跑受影響矩陣；不得新增 DnD dependency、第二 MIME、第二 resolver、第二 mutation owner、schema／API／permission 或長期 feature flag。

#### 26.13.1 剩餘 failure／lifecycle case matrix（最小可執行版）

以下矩陣把 E2／E3 拆成可直接派工的單案；它沿用第26.14節既有 record schema，不新增狀態或輸入路徑。每案使用同一 B16 fixture，完成後立即記錄 `before／action／after`，不跨案共用未確認的 candidate。

| Case ID | 觸發 | 預期 session 結果 | 零變更 assertion | 允許修正邊界 |
| --- | --- | --- | --- | --- |
| `E2-INVALID` | Employee／Duty／Process source 拖到不相容 target | `placing → idle`；顯示可理解拒絕或取消 | relation IDs、version revision、dirty、autosave 前後相同；後續一次合法 mutation＋單次 Undo 還原 baseline relation IDs | `entityDrag.ts` registered resolver、既有 target wrapper |
| `E2-UNLOAD` | `placing` 中關閉／切換 target panel 或 target unmount | `placing → idle`；source focus 或 owner panel focus 可回復 | 不得留下 candidate、drop preview、listener 或 mutation；後續一次合法 mutation＋單次 Undo 還原 baseline relation IDs | `App.tsx` cleanup、既有 panel lifecycle；不得加 global listener |
| `E2-CAPABILITY-LOSS` | drop／Enter 前切 current-readonly、改 version 或進 recovery | latest capability 直接拒絕並回 idle | 不得寫入 relation、revision、dirty、autosave；重新 editable 後一次合法 mutation＋單次 Undo 還原 baseline relation IDs | `resolveRelationPlacementCapability`、App commit boundary |
| `E2-COMMIT-REJECT` | 合法 intent 送出後既有 Command/API 拒絕或409 | `committing → idle`；保留可理解錯誤，commit lock釋放 | 不得自動重送第二次 mutation；既有 recovery 接手 | 既有 domain command／workspace recovery；不得新增補償 store |
| `E3-MOUNT` | Process panel 首次 mount，container 暫為零尺寸 | zero-size 時不呼叫 fitView；非零且可見後最多一次 | 穩定畫面無 parent-size warning；observer／rAF 可清理 | `ProcessPlanningCanvas.tsx` lifecycle |
| `E3-SPLIT-REVEAL` | Process panel split、換位、由 launcher 聚焦後重新可見 | 非零 geometry 收斂後只做一次必要 fitView | source handles 留在 owner canvas；無 overflow／重複 observer | `ProcessPlanningCanvas.tsx`、既有 workspace CSS |
| `E3-CLOSE-RELOAD` | 關閉 Process panel、重整 canonical `/`、切換 mindmap／flow | close/unmount 清除 observer／rAF；reload 後重新建立單一生命週期 | 無 listener leak、relation／revision 不被 layout 改變 | `ProcessPlanningCanvas.tsx` lifecycle test；不得改 URL／domain |

每個 case 的 `status` 只有在必要欄位齊全後才能標 `pass`；工具無法提供真實 native `DataTransfer` 時，E1 case 標 `blocked／not-run`，不得改寫成 E2 failure，也不得用 synthetic event、API 直寫或 CSS 補位繞過。若未來契約變更導致 E1～E3 任一 case 重新開啟，E4 才退回 `Blocked`；目前四個 E1 minimum directions、五案 E2與兩案 E3均為正式 QA-QC通過。

##### 自動化覆蓋與瀏覽器 evidence 邊界

本輪新增的自動化只證明 fail-closed 邏輯存在，不等於完整瀏覽器 case 已通過。RD／QA 依下表讀取，避免把 reducer cleanup 或 resolver result 誤當成 visible failure、focus return 或 zero-mutation 的完整證據：

| Case | 已有自動化覆蓋 | 仍必須由同一 B16 瀏覽器 record 補齊 | 目前可採用判定 |
| --- | --- | --- | --- |
| `E2-INVALID` | registered resolver 拒絕不相容 pair；ProcessDutyBridge 拒絕非 registered MIME | Employee→ProcessNode visible fail-closed、source focus、hydrated-baseline zero-mutation、dirty／autosave、document listener與合法 mutation＋一次 Undo回 baseline均已記錄 | pass（fresh evidence） |
| `E2-UNLOAD` | owner cleanup 以 `CANCEL` 清除 placing session，idle 後 preview 不再生效 | 關閉 Process owner後 session／notice清除、組織頁 focus回復、relation zero-mutation；重新合法 mutation＋一次 Undo回 baseline | pass（fresh evidence） |
| `E2-CAPABILITY-LOSS` | capability revoked 時 resolver 回 `READ_ONLY` 且不產生 effect | `390×844` mobile readonly清除placing；回桌面重新進入 ProcessNode→Duty，process-link readback成立後一次 Undo回 baseline | pass（fresh evidence） |
| `E2-COMMIT-REJECT` | 合法 intent 送出後既有 Command/API 拒絕或409 | 已存在 ProcessNode→Duty 顯示 visible duplicate no-op、relation／revision不變；後續合法 mutation＋一次 Undo回 baseline | pass（optional case） |
| `E2-409-RECOVERY` | timestamp-only server revision bump 後送出 stale PUT | 真實`409`、保留未保存內容並明確reload；recovery後合法 mutation＋一次 Undo回 baseline | pass（optional recovery case） |

因此，五案均已有同一 B16 瀏覽器 record與 dirty／autosave／document listener evidence，且重新 editable與409/recovery已由 `E2-CAPABILITY-LOSS`／`E2-409-RECOVERY` 補齊；最新 runner 已輸出五筆 `historyEvidence.strategy=behavioral-undo-round-trip`，不暴露內部 history length。`E2-COMMIT-REJECT`與`E2-409-RECOVERY`仍是 optional case，不改 E2 最低三案 gate；這個表不新增產品 case、狀態或輸入路徑。

#### 歷史自動化基線（2026-08-31；現行基線以本文件第2.2、26.21.26節及正式 QA-QC 覆核為準）

- targeted pure／fixture matrix：`11 files／57 tests passed`；component／composition matrix：`6 files／24 tests passed`；本輪新增 E2 fail-closed tests 不改產品契約。
- aggregate regression：`160 test files／663 tests passed`，命令為 `npm test -- --run --pool=forks --maxWorkers=1`；另以同一低併發策略重跑曾受worker timeout影響的5 files／13 tests，均通過。`656`、`657`、`661` 僅保留在前次幾何／測試修正前的歷史段落，不作現行基線。
- `npx tsc --noEmit --pretty false`、`npm run build`及`git diff --check`通過；這些只證明自動化／靜態Gate，不關閉E1～E3，也不代表commit、merge、deploy或release。

#### 最新 Chrome CUA 觀察（2026-08-31 16:50，補充證據，不關閉 Gate）

- 使用 task-created Chrome extension tab `ctab4`，由 `http://localhost:5000/` 頂部 `功能` 入口開啟 Employee／Organization；B16 draft fixture `DEV-039-S7-B16-1788159259336` 維持可編輯。使用者 owned Vite `localhost:5000` 未停止。
- Employee→Position：來源為 `指派B16 無任職員工至組織職位`，target 為 `B16 空職位`。Chrome CUA `drag` 後，Organization DOM 由 `B16 空職位` 變為 `B16 空職位，B16 無任職員工`，並出現 `B16 無任職員工，主職`；`role=alert` 為 `0`。這證明產品在該環境觀察到可用的 native 交付結果，但本次未能獨立讀取 `dataTransfer.types`，亦未取得同一操作的 API／revision readback，故 `E1-NATIVE` 仍為 `Partial／Open`。
- Employee→Position same-target noop：再次由同一來源拖到已存在的 `B16 空職位`，target DOM 與主職結果不變，`role=alert` 為 `0`；未取得 revision/API readback，僅作 UI no-op 觀察，不能取代正式 `B16-EMP-NOOP` 證據。
- Duty→Process invalid target：`B16 新工作職掌／主執行` 拖至 `B16 未連結節點` 後，流程連結數未增加；畫面保留 `放置，Escape 取消`，按 `Escape` 後 session／抽屜回到 idle，`role=alert` 為 `0`。這補強 `E2-FAILURE` 的 invalid＋cancel 路徑，但 target unload、capability loss 與 zero-mutation revision/API readback 仍未完整取得。
- `ctab4.dev.logs()` 同時含瀏覽器擴充套件的「message channel closed」錯誤；它不是頁面 `console.error` 的產品判定，不得當成產品零錯誤證據。React Flow parent-size warning 的 lifecycle 時序仍依 `E3-WARNING` 重跑。

上述觀察已寫入 `output/playwright/dev039/manifest.md`；不改變執行順序 `E1 → E2 → E3 → E4`，也不引入第二 resolver、MIME、mutation owner 或資料模型。

#### RD handoff checklist

- [x] `E1-NATIVE` 的每個 relation 都有真實 `dataTransfer.types` 與 canonical API readback。
- [x] `E2-FAILURE` 每案有 visible status、focus／session cleanup 與零 mutation 證據。
- [x] `E3-WARNING` 已由同一 fixture 的原生 CDP listener、strict raw-console、geometry與lifecycle record 關閉；未使用全域 console suppress。
- [x] fixture 已 recoverably archive、task-owned runtime 已停止、port 已釋放，使用者 owned runtime 未被停止。
- [ ] 文件四方同步後，仍需由使用者／PM 明確授權 candidate freeze；授權前維持 `E4 Candidate Freeze Ready / Authorization Pending`。

### 26.14 S7 evidence record schema與判定演算法（2026-08-31）

本節固定每個 closure case 的最小紀錄格式與判定順序，避免 RD、QA、QC 各自建立第二套清冊。它只描述驗證資料，不新增產品資料模型；紀錄可為 JSON、Markdown table 或測試輸出，但欄位名稱與語意必須一致。

#### 26.14.1 單一 case record

```ts
type S7EvidenceStatus = 'not-run' | 'observed' | 'pass' | 'partial' | 'fail' | 'blocked'

interface S7EvidenceRecord {
  caseId: string
  closureId: 'E1-NATIVE' | 'E2-FAILURE' | 'E3-WARNING'
  relation?: 'employee-position' | 'duty-position' | 'process-duty'
  inputMode?: 'native-drag' | 'keyboard'
  fixtureVersionId: string
  route: string
  viewport: `${number}x${number}`
  workspaceMode: 'current-view' | 'current-maintenance' | 'draft-edit'
  browser: string
  identity: string
  before: { relationIds: string[]; revision: string; dirty: boolean; historyLength?: number; autosaveState: string }
  action: { sourceRef: string; targetRef: string; dataTransferTypes?: string[]; steps: string[] }
  after: { relationIds: string[]; revision: string; dirty: boolean; historyLength?: number; autosaveState: string; focusRef?: string }
  historyEvidence?: {
    strategy: 'behavioral-undo-round-trip'
    validMutationObserved: boolean
    undoRestoredBaseline: boolean
    baselineRelationIds: string[]
    mutationRelationIds: string[]
    postUndoRelationIds: string[]
  }
  visibleResult: string
  console: { errors: string[]; warnings: string[] }
  apiReadback: { attempted: boolean; status?: number; revision?: string; relationIds?: string[] }
  cleanup: { fixtureArchived: boolean; runtimeStopped: boolean; portReleased: boolean }
  status: S7EvidenceStatus
  notes?: string
}
```

- `before`／`after` 必須來自同一個 fixture version；不得以另一份資料或直接寫入 API 製造 after。
- `historyLength` 僅是 optional diagnostic；不得因產品沒有暴露此內部數字而新增 debug API、第二 history store 或直接讀取 React state。
- E2 record 必須提供 `historyEvidence`。其 `strategy` 固定為 `behavioral-undo-round-trip`：先觀察一次已知合法 mutation，再執行恰好一次既有 `Control+Z`，並以完整 canonical relation IDs 證明 `postUndoRelationIds` 回到 `baselineRelationIds`。`validMutationObserved` 與 `undoRestoredBaseline` 均須為 `true`，否則 E2 case 不得標 `pass`。
- `dataTransferTypes` 只在 native case 填寫；至少包含且僅由產品 drop event 讀到 `application/x-orgmaster-entity` 才算 strict MIME evidence。CUA 工具無法讀取時留空並標 `partial`，不能猜測。
- `apiReadback.attempted=false` 或 readback 缺 revision／relation IDs 時，成功畫面最多只能標 `observed`，不可標 `pass`。
- `console` 要區分頁面 product console 與瀏覽器擴充套件／工具雜訊；後者寫入 `notes`，不得覆蓋產品判定。
- `cleanup` 是 case 完成欄位，不是可選備註；任一 cleanup false 時，`E4-FREEZE` 不得通過。

#### 26.14.2 狀態判定順序

每個 case 依下列順序判定，後者不得把前者的未知值當成通過：

1. `blocked`：工具或環境無法取得必要欄位（例如無法產生真實 `DataTransfer`）；不改寫成產品 pass，也不擴張產品輸入路徑。
2. `fail`：觀察到 visible error、錯誤資料、double commit、invalid mutation、權限繞過或 cleanup 破壞；立即回 RD 窄修正。
3. `partial`：畫面有部分結果，但缺 strict MIME、API／revision、focus、zero-mutation 或 lifecycle 任一必要欄位；不得升級為 pass。
4. `pass`：該 closure 的所有 required 欄位均可由同一 case record 重演，且 before／after、console、cleanup 與對應 acceptance 全部一致。
5. `observed`：只作探索性紀錄，沒有足夠欄位支援 pass／partial 的完整判定；不能被 E4 採用。
6. `not-run`：尚未執行，不得出現在 candidate freeze 的完成清單。

#### 26.14.3 Closure-level gate

- `E1-NATIVE` 必須至少有 Employee→Position、Duty→Position、ProcessNode↔Duty 三組 native record；每組另有 keyboard 對照 record，且 `status=pass`、API readback revision 與 canonical relation IDs 一致。
- `E2-FAILURE` 必須至少有 invalid pair、target unload、capability／mode loss 三案；每案 `status=pass`，且 relation IDs、revision、dirty、autosave 前後完全相同，`historyEvidence.undoRestoredBaseline=true`，session 清除並回 source focus 或有可理解取消結果。若 `historyLength` 未提供，不得因此新增產品診斷介面；以行為性 Undo round-trip 作為唯一必要 history evidence。
- `E3-WARNING` 必須記錄首次 mount、split／close、reload 三個 lifecycle；穩定畫面無 parent-size warning。若判 transient accepted，三個 lifecycle 均須有 geometry／時序、無 visible error、無 overflow、無 listener leak，並附明確接受理由。
- `E4-FREEZE` 只讀取本節 records 與既有 manifest；不得從聊天敘述、舊截圖、unit test 或 API 直寫推論 pass。所有 required record、fixture archive、runtime cleanup及四份文件同版更新後，才可提出 candidate freeze；目前這些條件已滿足，剩餘僅是使用者／PM明確授權。

最低 case ID 固定如下；若同一操作同時涵蓋兩個 ID，仍須在 record 中分別列出兩個 closure assertion，不得只留一個模糊描述：

| Case ID | 來源→目標 | Required assertion |
| --- | --- | --- |
| `E1-EMP-POS-NATIVE` | Employee→Position | strict MIME、第一任職／兼任或移轉 intent、API relation／revision一致 |
| `E1-DUT-POS-NATIVE` | Duty＋lane→Position | lane語意、主執行／協作／審核／會簽結果及API relation／revision一致 |
| `E1-PROC-DUT-NATIVE` | ProcessNode→Duty | canonical `LINK_PROCESS_NODE_DUTY` link、API relation／revision一致 |
| `E1-DUT-PROC-NATIVE` | Duty→ProcessNode | 同一 canonical link集合、duplicate再試為noop |
| `E2-INVALID` | 任一不相容 pair | visible rejection或可理解取消、零 mutation |
| `E2-UNLOAD` | placing中卸載 target／關閉 panel | session清除、focus回source或明確取消、零 mutation |
| `E2-CAPABILITY-LOSS` | drop前切唯讀／version／recovery | latest capability拒絕、零 mutation、重新editable可重試 |
| `E3-LIFECYCLE` | Process canvas mount／split-close／reload | console時序與geometry可對照，穩定畫面無warning或有transient accepted理由 |

#### 26.14.4 最小 runner 邊界

若需要新增驗證 runner，檔案只能放在 `scripts/` 或既有測試目錄，且必須使用產品正常入口與既有 API readback；runner 不得被打包進 production、不得注入第二個 resolver／mutation owner，也不得使用 `page.evaluate` 直接呼叫產品 commit。瀏覽器 harness 的責任只限產生真實事件、收集 record 及清理 fixture；產品行為仍由 `RelationPlacementSession`、`resolveRegisteredDrop` 與既有 domain authority 決定。

此 schema 是 S7 的唯一 evidence contract。若未來需要新增欄位，先在本節以向後相容 optional field 說明，再同步 parity、dev_task 與 evidence manifest；不得在單一測試檔內另造未註冊欄位或第二份判定演算法。

### 26.15 S7 fresh native evidence records（2026-08-31）

本節只補記本次由 canonical `/` 頂部「功能」入口、同一 B16 draft fixture 與 Playwright Chromium 151 重演的兩筆 native record；欄位語意完全沿用第26.14節，不建立第二種 evidence 格式。Browser session 為 task-owned `dev039-e1`，viewport 為 `1280x720`，identity 為 loopback dev `urn:orgmaster:dev / local-admin`；這不等同正式登入或 production auth。

| Case ID | before | action／strict MIME | after／API readback | visible／console／cleanup | status |
| --- | --- | --- | --- | --- | --- |
| `E1-EMP-POS-NATIVE` | fixture `draft-508a1fcd-e705-4bd1-98bf-72a140e607eb`；target `position-dev039-b16-empty` 尚無 `assignment-employee-dev039-b16-unassigned-position-dev039-b16-empty-2026-08-31-42`；request expected revision `2fac5f92517edffca66a01c70d4451fef58190d25f151dff17cbdcdb69db0929` | 正常入口 `功能→員工`；source `指派B16 無任職員工至組織職位` → target `B16 空職位`；產品 `dragover`／`drop` 事件實際讀到 `["application/x-orgmaster-entity"]` | PUT request `#608` 回 `200`，response revision `e56d7c2e1848452d9fa88b1d3137c88942bbd2258409b7329a7198ecca39bee7`；after assignment id `assignment-employee-dev039-b16-unassigned-position-dev039-b16-empty-2026-08-31-42` 並同步 employee primary pointer | `F039-S7-B16-native-employee-position.png`；target 可見為 `B16 空職位，B16 無任職員工`；產品 console errors／warnings `0/0`；fixture 最終 recoverably archived，manifest revision `ed564d23949663c7084938261fa97a4d0e0cb5ffb29a8da7fdb9f5866b9f9522`，8080 未啟用且使用者 owned 5000 未停止 | `pass`（單案） |
| `E1-DUT-POS-NATIVE` | 同一 fixture；`duty-dev039-b16-new` 尚未對 `position-dev039-b16-multi` 建立 `rel-duty-7`；request expected revision `e56d7c2e1848452d9fa88b1d3137c88942bbd2258409b7329a7198ecca39bee7` | 正常入口 `功能→工作職掌`；展開 `B16 新工作職掌`、選 `主執行`，source `拖曳B16 新工作職掌至組織圖，責任類型主執行` → target `B16 多任職職位`；產品 `dragover`／`drop` 事件實際讀到 `["application/x-orgmaster-entity"]` | PUT request `#738` 回 `200`，response revision `fb3c227b06ebad9e2fa06b044d8b86de9a9e8098a72953a15a1b0471e4342748`；新增 `rel-duty-7`，`relationType=execute`、`isPrimaryExecutor=true`、`positionId=position-dev039-b16-multi` | `F039-S7-B16-native-duty-position.png`；canonical duty relation 可由 response readback 讀到；產品 console errors／warnings `0/0`；同一 fixture 已於本輪結束後 recoverably archived | `pass`（單案） |

兩筆 record 均滿足第26.14.3節的 strict MIME、同 fixture、API revision、canonical relation、visible result、產品 console 與 cleanup 欄位，因此可把這兩個「單案」標為 `pass`。它們只關閉 Employee→Position 與 Duty→Position 的個別 native delivery 證據，不自動關閉 `E1-NATIVE`：ProcessNode→Duty、Duty→ProcessNode 的 native 成對 record、E2 三種 failure case 及 E3 lifecycle warning 仍未全部具備，整體 S7 維持 `Relation Placement Implemented / QA-QC Reopened`。

本輪曾嘗試由 ProcessNode source native 拖至 Duty target；因 duty drawer 展開後 React Flow canvas 的 source 位於不可見 transformed viewport，Playwright 在正常 pointer path 無法完成操作，未產生可採用的 drop record。此結果只記為 `not-run`／工具與版面條件觀察，不得用 `page.evaluate`、直接改 style 或 API 直寫補造成功結果；後續仍依 `E1-PROC-DUT-NATIVE` 與 `E1-DUT-PROC-NATIVE` 的 required assertion 重跑。

#### 26.15.1 S7 native admission fresh attempt（2026-08-31）

本次以 task-owned Vite `127.0.0.1:5080`、Playwright Chromium `149.0.7827.55`、`1280x720`、loopback dev identity（`urn:orgmaster:dev / local-admin`）及同一 B16 fixture `draft-9c560fd0-3505-4e29-ad11-7914bcb6acd3`，從 canonical `/` 依正常 `功能→流程規劃→在工作台開啟` 進入。Process canvas source／Duty target 均在可見 owner panel，且 DOM 上存在 strict `application/x-orgmaster-entity` source／target wiring。

| Case ID | before | action／事件觀察 | after／API readback | cleanup／status |
| --- | --- | --- | --- | --- |
| `E1-PROC-DUT-NATIVE` | fixture document `savedAt=2026-08-31T14:40:50.811Z`；relation IDs=`process-link-dev039-b16-linked-primary`,`duty-relation-dev039-b16-primary-source`；未有新的 ProcessNode↔Duty link | 真實來源 `process-node-dev039-b16-open` relation handle → `duty-dev039-b16-new` registered target；Playwright `locator.drag_to` 與正常 pointer path 各重演一次；產品事件捕捉結果均為 `[]`，未觀察 `dragstart／dragover／drop`，故沒有可填的 `dataTransferTypes` | cleanup 前後未觀察 domain mutation；同 fixture archive 後以 API `GET /api/orgmaster/workspace/versions/{id}` 回 `200`，relation IDs仍為上述兩筆，沒有新增 `processNodeDutyLinks`；archive 導致 version revision 由 `a1e0f0d788a2091bcfbd1fd5d5aab2dc600d8e8daa5ef03e37d547340292f9f2` 變為 `2c55ea0ac63e8debf6b2c875c6b99911ffab8084808ab974fb54e8cea5e8edb8` | fixture 已 recoverably archive；task-owned 5080 runtime 已停止且 port 已釋放；`blocked`（runner 未產生可驗證 native DataTransfer） |
| `E1-DUT-PROC-NATIVE` | 同一 fixture與同一 canonical relation IDs；`duty-dev039-b16-new`未與 `process-node-dev039-b16-open`連結 | 依同一 runner admission前置條件保留為 paired case；因第一個方向已無 `dragstart／dragover／drop` 與 strict MIME，未再以第二條工具路徑猜測成功 | API readback仍顯示 `processNodeDutyLinks`只有 `process-link-dev039-b16-linked-primary`；沒有產品 mutation | 與上案共用 cleanup；`not-run`（依 admission stop condition停止，不把工具限制改寫成產品失敗） |

這筆 fresh attempt 的用途是關閉「目前 runner／版面條件是否已可 admission」的疑問，而不是宣稱跨面板功能失敗。由於真實 `DataTransfer` 未被產品事件鏈觀察到，E1 aggregate 仍為 `Partial／Open`；不得以空事件清單、API unchanged、keyboard 或元件測試推導 native pass。後續只有更換為能讀取真實 HTML5 `DataTransfer` 的 runner 才可重跑；不得再新增 synthetic event、第二 resolver／MIME／mutation owner、API 直寫或產品 fallback。

本次畫面附件為 `output/playwright/dev039/F039-S7-E1-canonical-entry.png`、`F039-S7-process-workbench.png`、`F039-S7-process-node-selected.png`、`F039-S7-process-duty-native-attempt.png`及`F039-S7-process-duty-manual-attempt.png`；它們只作可見 owner／source／target與未產生事件的 provenance，不取代 record required assertion。

### 26.16 S7 現行證據優先序與文件同步規則（2026-08-31）

本節只處理文件治理，避免歷史執行紀錄與目前派工狀態混讀；不新增產品能力、資料模型、resolver、runner 或驗證狀態機。

#### 26.16.1 唯一讀取順序

下一輪 RD／QA／QC 依下列順序讀取，較後者不得覆寫前者的現行狀態：

1. **現行派工與驗收**：本文件第26.13節（`E1-NATIVE → E2-FAILURE → E3-WARNING → E4-FREEZE`）。
2. **欄位與判定契約**：本文件第26.14節；任何缺欄位都維持 `partial`／`blocked`，不得以推論補值。
3. **最新逐案結果**：本文件第26.15節及第26.21節；目前四個 E1 minimum directions 均為`pass`（paired reverse見第26.21.25節），第26.21.19節的五案 E2為`Pass（evidence）`，E3-LIFECYCLE與E3-WARNING均為`pass`。
4. **交叉索引與操作附件**：`ai-doc/specs/DEV-039-feature-parity-manifest.md` 第16.6～16.15.22節及 `output/playwright/dev039/manifest.md` 最新 supplement。
5. **現行版面／生命週期補充**：本文件第26.17節；它只約束 Process canvas 的幾何與 mount 時序，不另造 resolver、state 或 evidence schema。
6. **歷史紀錄**：第26.9～26.12節及 evidence manifest 內較早的 loopback／CUA 段落，只能作 provenance，不得用來升級目前 gate。

#### 26.16.2 Current status snapshot

| Closure | 現行判定 | RD 可直接做的事 | 不可宣稱 |
| --- | --- | --- | --- |
| `E1-NATIVE` | `Pass（evidence）`；Employee→Position、Duty→Position、ProcessNode→Duty及 paired Duty→ProcessNode 均有 strict record | 維持四筆 record與single relation owner；後續契約變更才重開 | 不得新增synthetic input、API直寫、第二resolver或替代DnD路徑 |
| `E2-FAILURE` | `Pass（evidence）`；五案均有同一 B16 browser record、zero-mutation、persistence／focus／listener、re-entry／409與 `historyEvidence` 行為性 Undo round-trip | 維持既有唯一 history／Undo authority；後續契約變更才重開 | 不得新增 production debug API、第二 history store，或把單案證據上推為 E1／E4 完成 |
| `E3-WARNING` | `pass`；同一隔離 fixture 合併執行 E3-LIFECYCLE 與不注入 `EventTarget` monkey-patch 的原生 CDP listener snapshot，raw diagnostics為`[]`，geometry／observer／rAF不累積，close後Process canvas為`0`、reveal／flow／reload為`1`，window／document／React Flow portal listener回到`40／8／139` mount baseline | QA-QC 只需覆核第26.21.17節 record、artifact與cleanup，不需重做已通過 lifecycle probe | 不得以本筆 pass 推論 E1 native、E2 history-length或E4；不得新增global suppress、portal或第二lifecycle owner |
| `E4-FREEZE` | `Candidate Freeze Ready / Authorization Pending` | 等待使用者／PM明確文字授權後同步 immutable candidate freeze | 未取得授權前不得進入 commit、merge、deploy、release；授權範例：`授權 DEV-039 candidate freeze 並 commit` |

#### 26.16.3 文件同步觸發

- 新增或修正任何 E1～E3 record 時：先追加本文件第26.15節的逐案結果，再同步 parity 第16.8節與 evidence manifest；`dev_task.md`、`documentation_map.md`及ADR只更新摘要／狀態，不複製第二份欄位表。
- 若只有命令、環境或 artifact 路徑變動，更新 evidence manifest及直接索引即可；不得藉此改寫產品契約或完成狀態。
- 只有 E1～E3 全部通過且 fixture／runtime cleanup可讀回時，才由 PM 提出 E4 candidate freeze；目前條件已成立，文件固定使用 `S7 Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Ready / Authorization Pending`，直到取得明確授權。

本節的目的，是讓「證據增加」與「產品完成」保持可分辨；任何未列於26.13～26.18的結果，均不得被後續自動化或聊天摘要當成新的完成依據。E3-WARNING的現行通過紀錄由第26.21.17節補充，E2行為性 Undo的現行通過紀錄由第26.21.19節補充，E1 paired strict pass由第26.21.25節補充，桌面 viewport extension由第26.21.26節補充；E1～E3現行均已通過，E4只依本節等待授權。

### 26.17 S7 Process canvas 幾何／生命週期窄修正契約（2026-08-31）

本節是目前 E1 ProcessNode↔Duty `not-run` 與 E3 warning 的工程補充。它記錄已量測的版面事實與最小修正邊界，不把工具無法拖曳誤判成 domain 缺陷，也不建立第二套拖曳路徑。

#### 26.17.1 已觀察的幾何事實

在 canonical `/`、同一 B16 draft、`1280×720`、`organization + duties + processes` 分割版面中，經正常頂部「功能」入口開啟並選取流程圖後，量測到：

- `process-planning-page--panel` 約 `637.5×287px`；其內 `process-planning-graph-panel` 約 `360×206px`，下緣約在 `y=704`。
- `process-planning-canvas` 約 `358×390px`，使用 `flex: 0 0 390px`，下緣延伸至約 `y=999`；因此 canvas 高度大於 graph panel 可見高度。
- React Flow root 約 `637.5×617px`，source handle 位置約為 `y=724.8` 與 `y=861.2`，均落在 graph panel 可見下緣之外；正常 pointer hit-test 可能命中鄰近 panel 或空白，而不是 ProcessNode source。
- 這些數值說明目前是「panel container／canvas lifecycle 幾何不同步」的可重現條件；它不是 `resolveRegisteredDrop`、`LINK_PROCESS_NODE_DUTY` 或 API relation schema 的證據。
- 對應快照：`output/playwright/dev039/F039-S7-E3-process-geometry-blocker.png`；僅作幾何 provenance，不代表 relation 或 QA-QC pass。

#### 26.17.2 最小修正邊界

RD 只可在既有 Process surface 與 lifecycle 內收斂，優先順序固定如下：

1. `process-planning-graph-panel`、`process-planning-canvas`與React Flow root使用`min-width: 0`、`min-height: 0`及`height: 100%`的正常文件流；移除會使 canvas 超出 parent 的固定 `flex-basis`，由外層 region 決定實際高度。
2. 以既有 `ResizeObserver` 或等效 container measurement 在寬高皆大於零、surface 可見且 panel split／reveal 完成後，排程一次 `fitView`；零尺寸、hidden、unmount 時不得呼叫或保留 observer／rAF。
3. `ReactFlow` 的 source／target DOM 必須留在 owner `processes` panel 內；不得以 `position: fixed`、body portal、跨 panel absolute offset、全域 `window.resize` listener 或手動注入 style 補位。
4. 修正只能影響 canvas 幾何與可見生命週期；不得修改 `WorkspaceLayoutV1`、URL、OrganizationDocument、relation resolver、MIME、Command、API、權限或 mutation owner。

#### 26.17.3 可驗收的窄測試

新增或調整測試只需覆蓋既有 component／lifecycle；每案由同一 fixture 讀回，不得直接寫資料：

| Case | 操作 | 必須成立 |
| --- | --- | --- |
| `E3-GEO-STANDALONE` | 只開 Process panel、選流程圖、首次 mount | canvas 與 graph panel 同寬同高範圍內；source handle 可見且可取得 pointer hit-test |
| `E3-GEO-SPLIT` | 組織＋職掌＋流程分割、上下／左右換位、調整分隔線 | 每次非零尺寸後只做一次必要 re-fit；source 不落到鄰近 panel；無水平／垂直溢出 |
| `E3-GEO-REVEAL` | 關閉再由「功能」聚焦流程、切換 mindmap／flow、focus duties 後返回 | hidden 不執行可見性 effect；reveal 後 geometry 收斂，無重複 observer／listener |
| `E3-GEO-RELOAD` | canonical URL 重整及 draft／current 切換 | 穩定畫面無 parent-size warning；relation／revision 不因 fitView 改變 |
| `E1-PROC-DUT-NATIVE`／`E1-DUT-PROC-NATIVE` | 幾何通過後，以 strict MIME native 重跑雙向 relation | drop event 讀到 `application/x-orgmaster-entity`，API／revision／canonical link readback完整；否則仍標`partial`／`not-run` |

`E3-GEO-*`通過只代表 Process canvas lifecycle 可用，不自動關閉 E1；E1 仍須依第26.14節取得 strict MIME 與 API readback。若窄修正仍無法在上述檔案與 owner 邊界內完成，停止並回 PM，不得以新增 DnD dependency、第二 resolver、global suppress 或另一份 layout state 迴避。

#### 26.17.4 窄修正實作與瀏覽器重驗（2026-08-31）

本輪已在既有 `ProcessPlanningCanvas` 與 workspace CSS 邊界內完成窄修正：Process canvas／React Flow root 改採 `min-width:0`、`min-height:0`、`height:100%` 的正常文件流，移除固定 `flex-basis:390px`；shared organization grid 的中欄允許收縮；`ResizeObserver` 在可見且非零量測後以兩個 animation frame 等待 React Flow custom node measurement，再執行一次 lifecycle-owned `fitView`，unmount／hidden 時清理 observer 與 rAF。未新增 dependency、resolver、MIME、Command、API、permission、layout state 或 mutation owner。

同一 B16 draft、canonical `/`、`1280×720`、`organization + duties + processes` 分割版面重驗結果如下：

| 量測項目 | 修正後結果 | 判定 |
| --- | --- | --- |
| `process-planning-graph-panel` | `276.1875×536px`，owner panel 可見範圍完整 | pass |
| `process-planning-canvas`（mindmap） | `274.1875×224px`，與 graph panel 同欄且正常流 | pass |
| Process source handles（2） | `x=1033.65／y=322.42、454.31`，均在 canvas 與 graph panel 內 | pass |
| overflow | canvas／React Flow `scrollWidth=clientWidth=274`、`scrollHeight=clientHeight=224` | pass |
| reload／切換 flow | flow canvas `274.1875×139px`，handles 仍在 canvas 內；產品 console `errors=0／warnings=0` | pass（本輪 lifecycle observation） |

對應 artifact：`output/playwright/dev039/F039-S7-E3-process-geometry-after-fix.png`；原始 blocker 快照 `F039-S7-E3-process-geometry-blocker.png` 保留作 before provenance。上述結果只關閉 `E3-GEO-SPLIT` 與本輪 reload／flow 的幾何觀察，不取代 `E3-LIFECYCLE` 所需的 standalone／reveal／listener cleanup record，也不改變 `E1-PROC-DUT-NATIVE`／`E1-DUT-PROC-NATIVE` 仍需 strict MIME＋API readback 的條件。Playwright `dragTo`／mouse path 本輪未產生可採用的 native `dataTransfer` 事件，故 ProcessNode↔Duty native 仍標 `not-run`，不得以幾何 pass 推論 relation pass。最新程式 gate：targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯與lifecycle合併重跑 `4 files／20 tests`）、full `160 files／663 tests`、`npx tsc --noEmit --pretty false`、`npm run build`、`git diff --check` 均通過；本輪新增E2 fail-closed與Process canvas lifecycle tests不改產品契約。Vite native-config extension advisory 與既有 chunk-size advisory 仍屬非阻擋環境提示。

#### 26.17.5 短面板 editor saturation follow-up（2026-08-31）

幾何窄修正後另以同一 B16 fixture 在短高度 split panel 重驗，確認 editor 區塊變多時不會再把 Process canvas 壓成零高度。此補充只記錄既有 surface 的最小 CSS floor，不改 layout model、resolver、MIME、Command、API 或 mutation owner：

| 量測項目 | 實測結果 | 判定 |
| --- | --- | --- |
| `process-planning-graph-panel` | `x=974.5375,y=501.3,width=342.7625,height=212.3` | owner panel 可見 |
| `process-planning-canvas` | `x=975.3375,y=611.5,width=325.9625,height=180` | `min-height:180px; flex:1 1 180px`，非零且未超出 parent |
| Process relation handles | 兩個 handle 約 `17.303×17.303px`；`elementFromPoint` 命中產品 `BUTTON` | source 可見且可 hit-test |
| editor saturation | node／inline／edge editor 仍在同一 graph panel 正常文件流；canvas 不被 editor 擠成 `0px` | pass（幾何 observation） |

對應 artifact：`output/playwright/dev039/F039-S7-E3-process-canvas-min-height.png`。這個 floor 是既有 canvas lifecycle 的局部保護，與 `WorkspaceLayout`、React Flow provider、typed relation session 無耦合；未新增 fixed／portal、全域 listener、dependency 或第二套 layout state。此補充可關閉「短面板 canvas 零高度」的幾何風險，但不等於 `E3-LIFECYCLE` 已通過，也不把 ProcessNode↔Duty native `not-run` 升級為 E1 pass；standalone／reveal／listener cleanup、E2 browser failure與E4 freeze仍依第26.13～26.21節開放。

### 26.18 S7 E1 native runner admission與環境邊界（2026-08-31）

本節把「工具不能產生可驗證 native `DataTransfer`」與「產品接線失敗」分開，避免 RD 反覆用不同工具重試而引入第二套輸入路徑。它只增加驗證前置條件，不新增產品功能、resolver、MIME、mutation owner或evidence schema。

#### 26.18.1 Runner admission preflight

任何新的 E1 runner 在建立或修改 B16 fixture 前，必須依序證明：

1. 使用 canonical `/`、同一 B16 fixture、桌面 editable viewport與正常頂部「功能」入口；不能用 API 直寫或 hidden route 取代正常 delivery path。
2. 來源 handle 為產品實際 `draggable` 元件，合法目標為目前可見 owner panel 內、具 registered target marker 的 DOM；ProcessNode↔Duty 需同時確認 source／target 不在 hidden、transformed 或 panel 外。
3. Runner 能捕捉產品事件鏈 `dragstart → dragover → drop`，並在 `drop` 當下讀到且只讀到 `application/x-orgmaster-entity`；若無法取得真實 `DataTransfer`，立即標 `blocked`／`not-run`，不以 synthetic `DragEvent`、`page.evaluate`、直接 API mutation或改 style補造成功。
4. 每次合法 drop 都要同一筆 record 讀回 canonical relation、API status／revision、visible result、產品 console與cleanup；缺任一欄位最高只能標 `partial`。

#### 26.18.2 Case admission與停止條件

| Preflight結果 | 可執行事項 | 不得做的事 |
| --- | --- | --- |
| `admitted` | 依 `E1-EMP-POS-NATIVE`、`E1-DUT-POS-NATIVE`、`E1-PROC-DUT-NATIVE`、`E1-DUT-PROC-NATIVE`順序重跑；每案保存before／after revision與relation IDs | 不新增第二 runner、resolver、MIME或產品fallback |
| `blocked` | 保存環境、瀏覽器、viewport、事件缺口與cleanup結果；可繼續獨立執行E2／E3 | 不把blocked改成產品fail/pass，不修改fixture資料製造事件 |
| `target-not-visible` | 只用使用者可見的開啟／聚焦／分割操作恢復 owner geometry，恢復後重新做preflight | 不以`position:fixed`、portal、跨panel style或DOM移動補位 |

目前 Playwright `dragTo`／mouse／CDP path未產生可採用的native drop，因此 ProcessNode↔Duty兩案依本節記為`not-run`；Employee→Position與Duty→Position各一筆單案pass仍只代表個案，不得上推為E1 aggregate。此環境判定不改變產品契約，下一輪若無可用native runner，應保留blocker並停止重複嘗試。

### 26.19 S7 native runner availability decision（2026-08-31）

本節是本輪 runner admission 的結案紀錄，目的在於把「產品未通過」與「驗證工具未提供可採用事件」分開。它不新增產品路徑，也不把環境限制改寫成產品缺陷。

| 觀察 | 結果 | 對 Gate 的影響 |
| --- | --- | --- |
| task-owned Playwright `dev039-e2`、Chromium 151、canonical `/`、B16 draft、desktop editable | source／target DOM 皆屬 owner panel，strict MIME 元件存在 | 通過 admission 的入口與幾何前置 |
| `dragTo`、mouse pointer path、In-app Browser CUA、Chrome extension CUA與文件 capture listener | 均未產生可採用的 `dragstart → dragover → drop`／`DataTransfer.types`；無產品 mutation | `E1-PROC-DUT-NATIVE`、`E1-DUT-PROC-NATIVE` 維持 `not-run`，不得推論 pass |
| Chrome browser-client availability check | 目前無可連線的 Chrome tab（`tabs.list()=[]`） | 不再重複相同 CUA 嘗試；等待具備真實 HTML5 DataTransfer 的 runner |
| console／資料安全 | 本輪沒有產品 console error、API直寫或 fixture 污染 | 不新增 failure；fixture／runtime 仍依既有 cleanup 規則處理 |

決策：目前環境標記為 `runner-blocked`，E1 aggregate 維持 `Partial／Open`；E2 failure與E3 lifecycle仍依既定 case獨立收斂。另以同一 In-app Browser session 走 keyboard placement 後切換現行版，確認 capability-loss 會離開 placing 狀態且不出現關聯目標；這只能作 failure observation，仍缺 API／revision／zero-mutation 的完整 browser record。再以 Chrome extension 的新分頁重跑同一 B16 source／target CUA path，結果仍沒有可採用 native 事件；此結果只增加環境阻塞證據，不改產品契約。下一次具備可用 native runner 時，必須沿用同一 B16 fixture、canonical 入口、四個最低 case ID與第26.14節 record schema；若仍無法讀到真實 `DataTransfer`，直接保留 `blocked／not-run`。禁止為了配合工具新增 synthetic drag API、第二 resolver／mutation owner、global portal、資料直寫或另一套產品 fallback。

### 26.20 S7 E3 lifecycle fresh observation（2026-08-31）

以 task-owned In-app Browser 分頁、canonical `/`、B16 draft及桌面 viewport完成一次完整的 Process lifecycle walkthrough：standalone mount → close/unmount → `功能→流程規劃` Drawer promotion → mindmap／flow切換 → 開啟工作職掌並返回 Process → reload。這是 E3 的瀏覽器 observation，不取代 listener cleanup 的直接 instrumentation record。

| Lifecycle case | 實測結果 | 判定 |
| --- | --- | --- |
| `E3-GEO-STANDALONE` | graph panel `600.0125×537.6`；canvas `598.4125×379.4`；source handle可見且canvas無overflow | pass（幾何 observation） |
| `E3-GEO-REVEAL` | 關閉後 DOM 不再有 Process surface；由 launcher promotion 後重新出現；切換 duties 再返回仍為單一 graph／canvas／2 nodes | pass（reveal／owner observation） |
| `E3-GEO-RELOAD` | canonical reload後 Process與Duty panel依local layout恢復；Process surface可見，graph／canvas各一份 | pass（reload observation） |
| console／listener | 產品 console無 error／warning；DOM數量未重複，但本工具未提供 listener inventory | partial（cleanup欄位未完整） |

Artifact：`output/playwright/dev039/F039-S7-E3-lifecycle-iab.png`。本輪可把 standalone／reveal／reload 的幾何與 owner observation 納入 evidence，但 `E3-LIFECYCLE` aggregate仍維持 `Partial／Open`，直到能以受控測試或瀏覽器 instrumentation證明 observer／rAF／listener cleanup；不得以 DOM數量或無console warning單獨推論 cleanup pass。

本輪新增 `src/components/ProcessPlanningCanvas.lifecycle.test.tsx`，以受控 jsdom lifecycle test 證明：可見 canvas 在兩個 animation frame settle 後只執行一次 `fitView`，unmount 會呼叫 `ResizeObserver.disconnect`，隱藏 surface unmount 會取消 pending `requestAnimationFrame` 且不執行 fit。這補上 Process canvas 自身的 observer／rAF cleanup automation coverage，但不等同真實瀏覽器 listener inventory；因此只把 E3 的自動化子項標為 `covered`，不改變 `E3-LIFECYCLE=Partial／Open` 或 E1／E2／E4 狀態。

### 26.21 S7 E2 failure-path fresh browser observation（2026-08-31）

> **Current evidence override**：本節下方的 `26.21.1`～`26.21.4` 為逐案歷史／中間補強；E2 現行 aggregate 以 `26.21.19` 的 `historyEvidence` record 為準，判定為 `Pass（evidence）`。只有正式 QA-QC 覆核仍可改變交付狀態，不得以較早的 `Partial／Open` 文字覆寫最新結果。

本節記錄同一 B16 fixture 的四個可重演 failure-path 案例。入口固定為 canonical `/` → 頂部「功能」→「流程規劃」→「在工作台開啟」；runtime 為 task-owned `http://127.0.0.1:5080`、Chromium `149.0.7827.55`、desktop `1280×720`，並以 loopback dev identity 執行。每案先以 API readback 建立 `hydrated` baseline，再比較 after；app hydration 可能在 pre-boot 與 hydrated 間更新 manifest revision，因此不把啟動 autosave 誤算為操作 mutation。

| Case ID | 實測操作與可見結果 | API／零變更結果 | 瀏覽器證據 | 判定 |
| --- | --- | --- | --- | --- |
| `E2-INVALID` | 開啟員工抽屜，以 `B16 無任職員工` source 送至 `B16 未連結節點` ProcessNode 不相容 target；顯示「目前為唯讀，無法建立關係」，placing notice 清除，焦點回原員工 source | status `200`；hydrated→after 的 duty／process relation IDs與revision完全相同；產品 diagnostics `[]`；history `0→0`，隨後有效配置 `0→1`、單次 Undo 回 `0`；操作前後 dirty／autosave不變；document capture listener回 baseline | `output/playwright/dev039/F039-S7-E2-invalid-pair.png` | partial（failure／history／persistence／listener欄位齊全；重新 editable／409 recovery未取得） |
| `E2-COMMIT-REJECT` | 選取已存在 ProcessNode→Duty 關係，以 keyboard placement 再次送至同一 Duty；顯示「關係已存在，未重複建立」，兩個 relation source 仍可見，焦點在原 ProcessNode source handle | status `200`；hydrated→after 的 `dutyRelationIds`、`processLinkIds` 完全相同；hydrated／after revision相同；dirty／autosave不變；document capture listener回 baseline；產品 diagnostics `[]` | `output/playwright/dev039/F039-S7-E2-invalid.png`（檔名沿用歷史命名，本案語意為 COMMIT-REJECT） | pass（optional single case） |
| `E2-CAPABILITY-LOSS` | keyboard placement 後將 viewport 改為 `390×844`；流程 source handle 消失、畫面回到 mobile read-only，placement notice不再存在 | status `200`；hydrated→after 的 relation／link IDs完全相同；hydrated／after revision相同；dirty／autosave不變；document capture listener回 baseline；產品 diagnostics `[]` | `output/playwright/dev039/F039-S7-E2-capability-loss.png` | partial（failure／zero-mutation／persistence／listener欄位齊全；重新切回editable欄位未取得） |
| `E2-UNLOAD` | keyboard placement中關閉 Process owner panel；Process DOM與placement notice清除，焦點回 `workspace-tab-organization` | status `200`；hydrated→after 的 relation／link IDs完全相同；hydrated／after revision相同；dirty／autosave不變；document capture listener由`1`回 baseline `0`；產品 diagnostics `[]` | `output/playwright/dev039/F039-S7-E2-unload.png` | partial（owner卸載、focus／zero-mutation／listener／persistence欄位齊全；重新開啟後editable欄位未取得） |

本輪只加強可觀測性與 lifecycle focus recovery：`App.tsx` 保存 typed source payload，在 `CANCEL` 後以兩個 animation frame 依 Employee／Duty／Process 的穩定 data attributes 尋回來源焦點；未新增 resolver、MIME、mutation owner、補償 store 或第二輸入路徑。`E2-INVALID` 已補同一 B16 瀏覽器 record（Employee→ProcessNode，不相容 pair；visible fail-closed、source focus與zero-mutation），但 dirty／history／autosave 欄位仍未齊。E2 aggregate 維持 `Partial／Open`，E1 ProcessNode↔Duty native 維持 `blocked／not-run`，E3 listener cleanup 維持 `Partial／Open`，因此 E4 仍為 `Blocked`。

可重跑 script：`output/playwright/dev039/e2-admission.pw.ts`；本機需使用與helper相同的 Playwright `1.62.1` CLI（目前可用 `node C:\Users\user\AppData\Local\npm-cache\_npx\420ff84f11983ee5\node_modules\playwright\cli.js test --config playwright.config.mjs`），避免`npx`另載一份測試runtime造成雙module。四案均在同一 fixture 完成後以既有 workspace PATCH `archive`，本輪 archive response `200`、fixture final status `archived`、manifest revision `3e34c7b96ea677430ebc2ae28f2cb80e0f3abb6606f7c5925014c85fa0e6c009`；task-owned 5080 runtime 已停止且 port 已釋放。這些是瀏覽器觀察與 zero-mutation evidence，不代表 E2 aggregate、QA-QC、commit、merge、deploy 或 release 完成。

環境備註：改名後的三案 serial replay 曾有一次 `console.error: Failed to load resource: net::ERR_NO_BUFFER_SPACE`，沒有 `pageerror`、domain mutation 或 API 變更；同一 COMMIT-REJECT 案隨後以 isolated replay 取得 diagnostics `[]`。該訊息屬 runner／資源層暫態，未被當作產品零錯誤證據；E2 仍依欄位完整度保守標示 `partial`。

本輪程式回歸補充：`npm test -- --run src/workspace/relationPlacement.test.ts src/components/ProcessDutyBridge.test.tsx src/components/ProcessPlanningWorkbench.test.tsx src/components/ProcessPlanningCanvas.lifecycle.test.tsx --pool=forks --maxWorkers=1` 為 `4 files／20 tests passed`；其後 canonical `npm test -- --run --pool=forks --maxWorkers=1` 為 `160 files／663 tests passed／1 skipped`。這些結果只確認 focus recovery 與既有 relation／lifecycle 不回歸，不提升 E1～E4 aggregate。

#### 26.21.1 E2-INVALID fresh browser record（2026-09-01，歷史／中間補強）

以同一 task-owned `127.0.0.1:5080`、Chromium `149.0.7827.55`、`1280×720`、canonical `/` 頂部「功能」入口與 B16 fixture `draft-fb8c6023-63c6-4f69-ab52-d05c893accba` 重演。先開啟流程規劃完整工作台，再開啟員工抽屜；以 `B16 無任職員工` 的員工來源把手進入 keyboard placing，將其送至 `B16 未連結節點` ProcessNode target。這是註冊表未允許的 Employee→ProcessNode pair，產品以既有 fail-closed capability 回覆「目前為唯讀，無法建立關係」，並在兩個 animation frame 後把焦點回復至原員工來源把手。

| 欄位 | 實測結果 |
| --- | --- |
| hydrated baseline | API `200`；duty relation IDs 為 `duty-relation-dev039-b16-primary-source`、`rel-3247697c-48ed-4840-be21-72cf70560b84`、`rel-ae03b9fa-d322-4a87-a07c-e50118585c36`、`rel-duty-5820d98c-2207-40b5-8dad-b954bdabd921`、`rel-duty-c2a5e7df-f9ff-40e1-873b-2188beb2b8b8`、`rel-f72210d5-5cee-4311-b23f-3e0af750b77b`；process link ID 為 `process-link-dev039-b16-linked-primary`；hydrated revision `0b31e26c4c58ca758b40e7f4475ca631d523c286c9b795674bc189892c3d5d64` |
| action | Employee source → ProcessNode target；keyboard `Enter`；未使用 API 直寫、synthetic event 或第二 resolver |
| visible result | 顯示「目前為唯讀，無法建立關係」；placing notice 消失；焦點回 `指派B16 無任職員工至組織職位` |
| after／zero mutation | API `200`；after revision 與 hydrated 相同；relation IDs 與 hydrated 完全相同；未建立任何新 relation／link |
| diagnostics／cleanup | 產品 diagnostics `[]`；artifact `output/playwright/dev039/F039-S7-E2-invalid-pair.png`；fixture archive response `200`、final manifest revision `3e34c7b96ea677430ebc2ae28f2cb80e0f3abb6606f7c5925014c85fa0e6c009`；5080 runtime 已停止且 port 已釋放 |
| status | `partial`：visible rejection、focus 與 zero-mutation 欄位齊全，但本 runner 未輸出 dirty／history／autosave 欄位，故不能單案標 `pass`，亦不關閉 E2 aggregate |

本案證明不相容 pair 會在既有 capability gate fail closed，不代表應將所有拒絕訊息細分成新的錯誤型別；若未來改善文案，仍應只修改既有 `commitRelationPlacementTarget` 的顯示映射，不新增 resolver、MIME、mutation owner 或資料模型。與此案同批執行的另外三案仍沿用本節前表格；四案均為同一 runner script 的獨立 test case。

#### 26.21.2 E2 persistence／history probe rerun（2026-09-01，歷史／中間補強）

本輪以新的隔離 fixture `draft-67c6e1cc-6e2d-4f7e-be9b-bfd32840e41f` 重跑 `output/playwright/dev039/e2-admission.pw.ts`（`DEV039_E2_VERSION_ID` 可覆寫 fixture，避免把已封存 ID 寫死在測試契約）。四案仍由同一 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity 執行，並在測試結束以既有 workspace archive；archive response `200`、final manifest revision 為 `434adf105d33a8acc9486ab20507a85af047a6195b9d510075426ad6e05ffd2c`，5080 runtime 已停止且 port 已釋放。

| Probe | 實測結果 | 可支持的判定 |
| --- | --- | --- |
| E2-INVALID rejected drop | assignment／duty relation／process link 與 hydrated baseline 相同；產品 diagnostics `[]`；visible rejection 後 focus 仍回 `指派B16 無任職員工至組織職位`（`BUTTON`，`employee-dev039-b16-unassigned`） | 不相容 pair 零 mutation；拒絕不消耗 assignment 變更 |
| E2-INVALID valid placement＋Undo | 先完成一次 Employee→Position 有效配置，assignment IDs 改變；單次 `Control+Z` 後以 API polling 還原 hydrated assignment IDs | rejected drop 未佔用 Undo slot；既有 canonical history／Undo path 可還原 |
| Persistence snapshot | 四案在操作前後讀取既有「儲存與備份」狀態；均為「已自動保存到電腦」，trigger title 無「未儲存變更」 | 可見 dirty／autosave 未因 failure path 殘留；不宣稱 listener cleanup 或 409 recovery 已完成 |
| Assignment API readback | 四案皆 status `200`，assignment／duty relation／process link IDs 與 hydrated baseline 相同（E2-INVALID 的有效配置只在 Undo probe 中短暫存在） | 補強 zero-mutation evidence；E2 aggregate 仍依完整 schema 保守維持 `Partial／Open` |

本輪測試結果為 `4 passed (19.1s)`；測試只觀察既有 DocumentMenu、assignment helper、history 與 autosave，不新增 debug state、API、resolver、MIME、mutation owner 或第二保存路徑。由於 runner 尚未輸出 history length、listener inventory、重新切回 editable 與 409/recovery 全欄位，四案仍不得單案升為 `pass`，E3／E4 狀態不變。可重跑命令如下：

```powershell
$env:DEV039_E2_VERSION_ID='draft-<fresh-fixture-id>'
node C:\Users\user\AppData\Local\npm-cache\_npx\420ff84f11983ee5\node_modules\playwright\cli.js test --config playwright.config.mjs
```

#### 26.21.3 E2 listener lifecycle／owner cleanup rerun（2026-09-01，歷史／中間補強）

本輪以新的隔離 fixture `draft-e85b3c44-0c70-4cb1-baf2-16f2bbdf9fae` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，四案結果為 `4 passed (22.6s)`。測試在 browser init 以既有 EventTarget API 做最小 listener inventory，讀取 document capture `keydown` 與 window `keydown`；不新增產品 debug state、event bus 或第二套生命週期。四案均在同一 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity 下完成，結束後以既有 workspace PATCH archive；archive response `200`、final manifest revision 為 `4ab018e15bbcc319f8cbc13139147670eaaaaa5a8375b8bb27ecf6fe6164a5c2`，task-owned `5080` runtime 已停止且 port 已釋放。

| Case | Listener／可見結果 | 可支持的判定 |
| --- | --- | --- |
| `E2-INVALID` | document capture `keydown` `0 → 1 → 0`（placing → rejected）；拒絕後 placing 清除、focus 回 Employee source；有效 Employee→Position 後 Undo 還原 | 不相容 pair 零 mutation、拒絕不殘留 document listener；history／Undo 與 persistence snapshot 均可讀回 |
| `E2-COMMIT-REJECT` | document capture `0 → 1 → 0`；duplicate relation visible no-op，source focus 保持 | no-op 不改 relation／revision／dirty，listener 回 baseline |
| `E2-CAPABILITY-LOSS` | document capture `0 → 1 → 0`；切至 `390×844` read-only 後 placement notice／source 清除 | capability loss fail-closed 且 listener 回 baseline；未產生 mutation |
| `E2-UNLOAD` | document capture `0 → 1 → 0`；關閉 Process owner 後 Process DOM／notice 清除，focus 回 `workspace-tab-organization` | owner 卸載確實終止 session；listener 不再殘留，未產生 mutation |

根因修正落在既有 `App.tsx` lifecycle：placing session 依 source／target 所屬 surface 計算 owner；任一必要 surface 或 drawer 關閉時直接呼叫既有 `cancelRelationPlacement()`。這是 owner-driven cleanup，沒有新增 listener、resolver、MIME、mutation owner、store、schema 或第二輸入路徑。修正後 `E2-UNLOAD` 的 document capture listener 由 placing 的 `1` 回到 baseline `0`；E2 aggregate 仍保守維持 `Partial／Open`，因重新進入 editable 與 409/recovery 欄位尚未完整。E1 ProcessNode↔Duty native 仍為 `blocked／not-run`，E3 standalone／reveal lifecycle 仍為 `Partial／Open`，E4 維持 `Blocked`。

#### 26.21.4 E2 editable re-entry／409 recovery admission rerun（2026-09-01，歷史／中間補強）

本輪以新的隔離 fixture `draft-1e4eaddc-43cd-487c-836e-8ec35dd1a6a0` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，五案結果為 `5 passed (25.9s)`。測試維持 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity，並以同一 fixture 的 hydrated API snapshot 作 baseline；fixture cleanup 後 archive response `200`，final manifest revision 為 `9b0ec78e6fbf8135978910517db8724722acd4bd4344786bda6569f862854cbd`，task-owned `5080` runtime 已停止且 port 已釋放。

| Case | 可觀測結果 | 可支持的判定 |
| --- | --- | --- |
| `E2-INVALID` | 不相容 Employee→ProcessNode 拒絕、placing 清除、focus 回 source；有效 Employee→Position 後一次 `Control+Z` 還原 baseline | failure zero-mutation、focus／history／Undo、dirty／autosave與 listener 回 baseline |
| `E2-COMMIT-REJECT` | 已存在 ProcessNode→Duty 關係再次送出，顯示 visible no-op；source focus 保持 | duplicate 不改 relation／revision／dirty，placing listener 回 baseline |
| `E2-CAPABILITY-LOSS` | placing 中切到 `390×844` mobile read-only 後 source／notice 清除；切回桌面後可重新進入，完成 ProcessNode→Duty 並以 Undo 還原 | capability loss fail-closed；重新 editable 後仍沿用同一 relation／Command／Undo authority，沒有第二輸入路徑 |
| `E2-409-RECOVERY` | 以 fixture helper 做 timestamp-only server revision bump；stale writer PUT 真實收到 `409`，畫面保留未儲存內容、提供複製與明確重新載入；reload 後回到 server baseline，assignment IDs 不變 | CAS recovery、download-copy、explicit reload 與 no-overwrite 行為可重演；唯一預期的 409 transport console line 已自測試 diagnostics 排除，產品 diagnostics 為空 |
| `E2-UNLOAD` | placing 中關閉 Process owner；Process DOM／notice 清除，focus 回 `workspace-tab-organization`，document capture listener `1→0` | owner-driven cleanup 完整，未殘留 listener 或 domain mutation |

五案共同完成既有 persistence menu snapshot，操作前後均為「已自動保存到電腦」且沒有「未儲存變更」；API relation／assignment／link IDs均與各自 hydrated baseline一致（E2-INVALID 的有效配置僅在 Undo probe 中短暫存在）。本輪只補 evidence helper 的 re-entry／409 route與既有 `App.tsx` owner lifecycle 行為，沒有新增 debug state、resolver、MIME、mutation owner、store、schema、API或第二保存路徑。E2 的 re-entry／409 欄位已閉合；aggregate 仍維持 `Partial／Open`，因嚴格 schema 尚未直接暴露 history length，並等待 QA-QC 對五案整體判定。E1 ProcessNode↔Duty native 仍 `blocked／not-run`，E3 standalone／reveal lifecycle仍 `Partial／Open`，E4維持 `Blocked`。

可重跑命令：

```powershell
$env:DEV039_E2_VERSION_ID='draft-<fresh-fixture-id>'
node C:\Users\user\AppData\Local\npm-cache\_npx\420ff84f11983ee5\node_modules\playwright\cli.js test --config playwright.config.mjs e2-admission.pw.ts
```

#### 26.21.5 E3 lifecycle browser probe／combined admission rerun（2026-09-01，歷史摘要）

本輪以新的隔離 fixture `draft-3983041c-deb2-4e9e-badf-5e1aa5ecbee0`，重跑同一 `output/playwright/dev039/e2-admission.pw.ts`；五個 E2 failure-path 與一個 E3 lifecycle case 合併結果為 `6 passed (31.5s)`。環境維持 canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity；fixture cleanup 後 archive response `200`，final manifest revision 為 `28390b5c0322c842d28ddc0b31f7fa0db9074810e37e5a890db38495ce322beb`，task-owned `127.0.0.1:5080` runtime 已停止且 port 已釋放。

| Case／probe | 可觀測結果 | 判定 |
| --- | --- | --- |
| `E2-INVALID`、`E2-COMMIT-REJECT`、`E2-CAPABILITY-LOSS`、`E2-409-RECOVERY`、`E2-UNLOAD` | 五案沿用第26.21.4節的 zero-mutation、history／Undo、dirty／autosave、document keydown listener、re-entry與409 recovery欄位 | 五案 runner assertions pass；E2 aggregate仍`Partial／Open`，只因嚴格 history-length schema尚未直接暴露 |
| `E3-LIFECYCLE` mount | 開啟 Process canvas 後，實際觀察到 active canvas observer `>0` 且 pending animation frame 為`0` | pass（canvas owner建立） |
| `E3-LIFECYCLE` close／unmount | 關閉 Process owner 後 Process DOM與placing notice消失；active canvas observer回`0`，disconnect計數增加，pending animation frame為`0` | pass（owner cleanup） |
| `E3-LIFECYCLE` reveal／mindmap→flow | 由 launcher／Drawer重新揭露與切換流程圖後，active canvas observer均為`1`，pending animation frame為`0` | pass（無重複 observer） |
| `E3-LIFECYCLE` reload | reload後若 Process canvas可見，active canvas observer不超過`1`；pending animation frame為`0` | pass（reload bounded ownership） |
| diagnostics／資料 | `productDiagnostics=[]`；probe只在browser init包裝既有`ResizeObserver.observe/disconnect`與`requestAnimationFrame/cancelAnimationFrame`，未寫入產品資料 | pass（evidence-only instrumentation） |

本 probe 只計數實際觀察 `.process-planning-canvas` 的 ResizeObserver，避免將 React Flow 其他合法 observer誤算成洩漏；也只驗證 pending animation frame在每個穩定等待點歸零。它不新增產品 debug state、listener、resolver、MIME、mutation owner、store、schema、API或第二輸入路徑。`E3-LIFECYCLE` 個案可標 `pass`；`E3-WARNING` aggregate 仍為 `Partial／Open`，因 React Flow warning 的時序接受理由、standalone／reveal完整QA-QC與正式listener inventory仍需獨立判定。E1 ProcessNode↔Duty native仍`blocked／not-run`，E2 aggregate與E4狀態不變。

#### 26.21.6 E2／E3 fresh rerun after evidence serializer correction（2026-09-01，歷史摘要）

本輪以新的隔離 fixture `draft-17e1204c-7d3f-47c2-bd50-c692823be999` 重跑同一 `output/playwright/dev039/e2-admission.pw.ts`，五個 E2 failure-path 加一個 `E3-LIFECYCLE` 共 `6 passed (32.5s)`。環境為 task-owned `http://127.0.0.1:5080`、canonical `/`、`1280×720`、Chromium `149.0.7827.55`、loopback dev identity；fixture cleanup後 archive response `200`，final manifest revision為`d7f7eb9cf31a58f693801d0d46f27866d03659bc8441483f5004131526cbffd9`，5080 runtime與port已釋放。

本輪只修正 runner evidence serializer：`E2-COMMIT-REJECT` 的 history `after` 改為數值 baseline，`E2-409-RECOVERY`補上數值 history baseline／recovery欄位；產品未新增 debug state、history API、resolver、MIME、mutation owner或第二保存路徑。五案仍以 hydrated API baseline比較 assignment／relation／link zero-mutation、dirty／autosave與listener cleanup；`E3-LIFECYCLE`仍觀察 Process canvas mount／close／reveal／mindmap→flow／reload 的 bounded observer／rAF，產品 diagnostics為空。

| Case／probe | 本輪可讀結果 | 判定邊界 |
| --- | --- | --- |
| E2 五案 | runner `6 passed`；E2各案記錄 fresh-mount history baseline `0`，有效配置＋Undo行為 `0→1→0`，拒絕／duplicate／capability loss／owner unload／409 recovery均無額外domain mutation | E2 aggregate仍`Partial／Open`；history baseline是runner行為記錄，不等同產品暴露的嚴格 history-length schema |
| E3-LIFECYCLE | mount／close／reveal／mindmap→flow／reload中 active Process canvas observer不累積，pending rAF為`0`，產品 diagnostics為`[]` | 個案`pass`；E3-WARNING aggregate仍待React Flow warning、standalone／reveal正式QA-QC與listener inventory判定 |

本節與第26.21.5節均保留作可重演 provenance；若日後再重跑，必須沿用相同 runner、fresh fixture、numeric history evidence欄位與cleanup規則。此節不提升E1 ProcessNode↔Duty native（仍`blocked／not-run`）、不改E4（仍`Blocked`），也不授權commit、merge、deploy或release。

#### 26.21.7 E2／E3 final stability rerun after transient-notice hardening（2026-09-01，歷史摘要）

以新的隔離 fixture `draft-dbdd513f-a15b-4297-a4f5-819a4f08d80c` 重跑同一 `output/playwright/dev039/e2-admission.pw.ts`，五個 E2 failure-path 加 `E3-LIFECYCLE` 共 `6 passed (34.4s)`。fixture cleanup archive response `200`，final manifest revision 為 `e647287fd737dbf35e185ce081a1351b92bced7352ea10e06e370867cbf03e76`；task-owned `127.0.0.1:5080` runtime 隨後停止並釋放 port。

本輪只調整測試證據穩定性：capability-loss 重新進入 editable 後，以 persisted `processLinkIds` readback 作為跨面板關係成立的穩定准入條件，並保留當輪 notice（若存在）作為觀察資料；不再把短暫 toast 的可見時序當成唯一驗收條件。所有 E2 案仍維持既有 assignment／relation／link zero-mutation、history／Undo、dirty／autosave、focus、document keydown listener與409 recovery界線；E3仍觀察 mount／close／reveal／mindmap→flow／reload 的 bounded observer／rAF，產品 diagnostics為空。

本節更新可重演 evidence provenance，不改產品契約或資料模型。E2 aggregate仍`Partial／Open`（嚴格 history-length未由產品暴露），E3-LIFECYCLE個案為`pass`但E3-WARNING aggregate仍待QA-QC；E1 ProcessNode↔Duty native仍`blocked／not-run`，E4仍`Blocked`。

#### 26.21.8 E1 CDP native transport capability probe（2026-09-01）

為確認「具備真實 HTML5 `DataTransfer` 的 runner」是否已可用，本輪只新增一個一次性的 evidence-only CDP probe：以 task-owned `127.0.0.1:5080`、Chromium `149.0.0.0`、`1280×720`、canonical `/`、loopback dev identity及全新 B16 fixture `draft-011e0e3a-d7ca-4b00-9b35-a481d9bf8c5c`，由 `功能→流程規劃→在工作台開啟` 進入，確認 ProcessNode source `process-node-dev039-b16-open`與 Duty target `duty-dev039-b16-new`均在可見 owner surface，再以真實 pointer sequence加 Chrome DevTools Protocol `Input.setInterceptDrags`／`Input.dispatchDragEvent`探測瀏覽器傳輸。

| Probe field | 可觀測結果 | 判定 |
| --- | --- | --- |
| owner geometry | source handle與Duty target均可見；target經 owner scroll 後命中註冊 `BUTTON` | runner preflight pass |
| protocol transport | CDP可送出帶 strict `application/x-orgmaster-entity` 的 `dragenter／dragover`，事件命中 Duty target；但 Chromium未建立可採用的 source `dragstart`，未產生產品 `drop` | `blocked`（transport不完整） |
| domain result | 前後 API status `200`、revision相同，只保留既有 `process-link-dev039-b16-linked-primary`；沒有新 link、沒有 dirty／domain mutation | zero-mutation；不代表產品 failure |
| diagnostics／cleanup | probe未寫入產品 debug state；fixture cleanup archive response `200`、final manifest revision `8dbcc25d675cbf42bce7862918e8160233cfa5b3d89ded4772df1dba541d8101`；task-owned 5080 runtime停止，listen port釋放；user-owned 5000（PID 23840）未停止 | evidence／環境清理 pass |

本輪不把 CDP 注入的 drag data 視為產品原生成功；只有同一操作同時觀察到真實 source `dragstart`、target `dragover`／`drop`、strict MIME、visible result、API／revision／canonical readback及cleanup，才可將 E1 case 標為 `pass`。因本 probe沒有真實 `dragstart`／`drop`，`E1-PROC-DUT-NATIVE`維持`blocked／not-run`、paired `E1-DUT-PROC-NATIVE`維持`not-run`，E1 aggregate仍`Partial／Open`。不新增 DnD dependency、第二 MIME／resolver／mutation owner、synthetic product path、schema、API、global listener或fallback；依第26.19節停止同類 runner 重試，等待能建立並讀回完整 HTML5 drag session 的環境。

#### 26.21.9 E2 history authority audit與不擴張邊界（2026-09-01）

> 本節是 evidence amendment 前的 authority audit；`historyLength` 的 required 判定已由第26.21.19節向後相容地改為 optional diagnostic，E2現行判定以該節的 `historyEvidence` 行為性 Undo round-trip為準。以下保留作為「不新增產品 debug API」的決策 provenance。

本輪完成既有 Undo／Redo authority 的 source audit，目的在於確認 E2 的 `historyLength` 缺口是否能由現有產品表面補足；結論是「不能，且不應為了證據新增產品 debug API」。盤點範圍只包含 `src/App.tsx` 的既有 `useOrgHistory` 與其唯一使用者，不修改產品程式或資料契約。

| Audit 項目 | 現有事實 | 對 E2 的意義 |
| --- | --- | --- |
| history owner | `useOrgHistory` 內部持有 `past／present／future`；`past` 最多保留最近 80 份；`commitState` 以 canonical state 相等判定 no-op | history 是 App 內部狀態，不屬 OrganizationDocument、API 或 workspace layout |
| mutation／Undo | 有效 `commitState` 只產生一個 snapshot；相同 state 不產生 snapshot；`undo`／`redo` 只由既有 callback 改變 history；`replaceState` 會重設三段 history | 可由行為驗證「有效配置＋Undo 還原」及 rejected／noop 不應改 domain；不能從 API 直接讀出 stack 長度 |
| product surface | `ProtectedApp` 只注入 `commit／commitState／undo／redo／replaceState`；Toolbar 沒有 history length、debug panel 或 read-only diagnostics API；全域 keydown 僅處理既有 `Ctrl／Cmd+Z／Y` | 沒有可採用的產品可觀測 `before.historyLength／after.historyLength` |
| current runner | `e2-admission.pw.ts` 的數值 `0→1→0` 是 runner 對一次有效 mutation／Undo round-trip 的行為紀錄，不是產品 stack introspection | 可支持 round-trip 與 zero-mutation，但不得填充第26.14節要求的嚴格 stack length |

**邊界決策（歷史）：**不把 `past／future` 暴露到 production DOM、URL、API、window debug state或新的 Toolbar；不新增第二份 history store、測試專用產品 endpoint或只為通過 E2 的 instrumentation。第26.14節現由第26.21.19節 amendment 將 `historyLength` 降為 optional diagnostic，現有行為性 Undo 證據可在五案欄位完整時標示 `Pass（evidence）`。

**可恢復條件（歷史）：**前述「需 QA-QC 接受替代證據後才重判」的條件已由第2.3／26.14節完成 amendment；現行五案以第26.21.19節的 `historyEvidence` 行為性 Undo round-trip 判定。若未來要改用正式、非 debug 的 history 可觀測介面，仍須沿既有產品契約與文件 gate另行提出，不得為本 DEV 臨時新增。

#### 26.21.10 E3 warning source audit與正式判定邊界（2026-09-01，歷史／中間補強）

本輪以 source search＋既有 lifecycle test 結果盤查 warning 來源，避免為可能是工具／框架訊息的文字建立全域 suppress。盤查命令與結果：

```powershell
rg -n "console\\.(warn|error)|parent container needs|ResizeObserver loop completed" src server scripts --glob '!**/*.test.*'
npm test -- --run src/components/ProcessPlanningCanvas.lifecycle.test.tsx src/workspace/relationPlacement.test.ts
```

- `ProcessPlanningCanvas`、`WorkspaceLayout`沒有直接呼叫 `console.warn`；兩者只擁有既有 `ResizeObserver`／`requestAnimationFrame` lifecycle。`WorkspacePanelFrame` 的 `console.error` 是 panel error boundary，`dev039-s7-fixture.mjs` 的 `console.error` 是 CLI 失敗出口，不是穩定畫面 warning。
- lifecycle／relation targeted run 結果為 `2 files／10 tests passed`；Vite `configLoader: native` 的 extension advisory 是 test／build tooling 警告，不得當成產品 React Flow warning，也不應寫入產品 warning allowlist。
- 本輪文件／靜態 gate：`git diff --check`、`npx tsc --noEmit --pretty false`、`npm run build` 均通過；build 僅輸出既有 Vite extension advisory 與 chunk-size advisory，兩者均歸類為 tooling，不改判產品 warning。
- 現有 browser runner 對 `ResizeObserver loop completed` 的排除只是一個窄的 diagnostics filter；它不能單獨證明該訊息是可接受的 transient warning。未取得未過濾的 raw console 時序、standalone／reveal geometry與 listener inventory前，`E3-WARNING` 維持 `Partial／Open`。

**不擴張規則：**不加入 global `console` suppress、第二套 layout state、portal、window resize listener或把框架 warning 靜默吞掉。若 QA-QC 重新執行未過濾 browser record，必須把訊息分成「產品 error／產品 warning／框架 transient／工具 advisory」四類；只有穩定畫面無產品 error、geometry 已收斂、observer／rAF／listener 無洩漏，並附同一 case 的時序與接受理由，才可關閉 E3 aggregate。這是 QA 判定，不是本輪產品程式修改。

#### 26.21.11 使用者 5000 runtime 的 E1 CDP probe 補充（2026-09-01）

為確認前一輪 `5080` runner 結論不是 task-owned runtime 差異，本輪在使用者既有 `http://localhost:5000`（PID `23840`，不屬於本任務）上，以全新隔離 B16 fixture `draft-3778d6ea-b4cb-4ce0-b93f-5a8b3afc8b3a` 重跑一次性 CDP probe。fixture prepare revision 為 `30fb...`，canonical `/`、`1280×720`、HeadlessChrome `149.0.0.0`；probe 結束後以既有 fixture cleanup archive，final manifest revision 為 `b6e50360dd1aeeb7880918e0d3439189ccf79cbb07df031dca07778b6ef1b538`。

| Probe field | 可觀測結果 | 判定 |
| --- | --- | --- |
| source／target geometry | ProcessNode source box 約 `x=1033.65,y=322.42`；Duty target box 約 `x=1119,y=434.875`；兩者均在可見 owner surface | preflight pass |
| native transport | `Input.setInterceptDrags` 未回傳可採用 interception；事件陣列與 strict event 陣列均為空，未取得 `dragstart`、`dragover`、`drop` 或 `DataTransfer.types` | `blocked`（runner transport未建立完整HTML5 drag session） |
| domain readback | API before／after 均 `200`，revision同為 `7f09bc...`，只保留既有 process link；沒有新增 relation、assignment、dirty或其他 domain mutation | zero-mutation；不代表產品 failure |
| cleanup／runtime | fixture archive已完成且manifest revision可讀；本輪只使用既有5000，未停止或重啟使用者PID `23840`，沒有留下task-owned listen port | evidence／環境邊界 pass |

本補充只確認「換到既有 5000 runtime 仍重現 runner transport 缺口」，不把空事件或 protocol preflight當成產品native pass；E1 `ProcessNode↔Duty`仍為`blocked／not-run`、paired direction仍為`not-run`，E1 aggregate維持`Partial／Open`。不新增 DnD dependency、第二 MIME／resolver／mutation owner、synthetic product path、schema、API、global listener或fallback；後續僅在能讀取真實 `dragstart→dragover→drop` 的 runner 出現時重新進入 paired native case。

#### 26.21.12 Execution-hygiene audit（2026-09-01）

本輪另準備一個新的 B16 fixture `draft-2357c0ad-871c-4876-b3d2-935242dad73f` 以確認現行 5000 runtime 可重新建立隔離草稿；因尚未進入可採用的瀏覽器拖曳操作，沒有產生任何 E1／E2／E3 evidence。依 fixture CLI 的既有 cleanup contract 已以 archive PATCH 完成清理，回讀 `manifestRevision=e1db06f6c35dfa96c1af3ead409c8c50ed73528ac175a2966a766cdf29273a28`；此筆只作 cleanup provenance，不得列入 pass、partial 或 not-run 的產品案例數量。

同一輪重新執行 `npx tsc --noEmit --pretty false`、`npm run build` 與 `git diff --check` 均通過；build 的 Vite extension／chunk-size advisory 仍屬 tooling。使用者既有 `localhost:5000`（PID `23840`）保持運作，task-owned `5080` 沒有重新啟動或遺留。DEV-039 的 E1／E2／E3／E4 判定完全不變：E1 ProcessNode↔Duty `blocked／not-run`、E2 `Partial／Open`、E3-WARNING `Partial／Open`、E4 `Blocked`。

#### 26.21.13 E3-LIFECYCLE task-owned raw-console／lifecycle rerun（2026-09-01）

為再補一個尚未閉合的 E3 子案例，本輪只在 task-owned `http://127.0.0.1:5080` 執行既有 `output/playwright/dev039/e2-admission.pw.ts` 的 `E3-LIFECYCLE`（Playwright `1.62.1`、canonical `/`、`1280×720`、loopback dev identity），未重跑已完成的 E2 failure-path，也未修改產品程式。先以 fixture CLI 建立隔離 B16 fixture `draft-fd5238aa-6bf9-4d90-949a-9e22706a8fe2`，測試完成後依既有 cleanup contract archive，final `manifestRevision=2d40124a3851b98cb41e8b46745fcc997a4f9b118950790d48c87c6cb0848e1d`。

| Checkpoint | Browser observation | 判定邊界 |
| --- | --- | --- |
| mount | `activeCanvasObservers=1`、`pendingRaf=0`；Process canvas可見且未累積 | 個案 pass |
| close／unmount | `activeCanvasObservers=0`、`canvasObserversDisconnected`增加、`pendingRaf=0` | 個案 pass |
| reveal／mindmap→flow | reveal及flow各維持`activeCanvasObservers=1`、`pendingRaf=0` | 個案 pass |
| reload | `activeCanvasObservers≤1`、`pendingRaf=0`；`productDiagnostics=[]` | 個案 pass；僅代表本runner觀察到的產品診斷為空 |
| runner result | `1 passed (11.5s)`；raw `diagnostics=[]`，既有 runner 只排除 `ResizeObserver loop completed` 的非產品訊息；artifact=`output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png` | 不得上推為 E3-WARNING aggregate pass |
| cleanup／runtime | fixture archive成功；task-owned `5080`完成後停止並釋放，user-owned `5000`未觸碰 | evidence／環境邊界 pass |

本筆只把 `E3-LIFECYCLE` 的 task-owned raw-console／observer／rAF 個案補成可重演 record；`E3-WARNING` aggregate仍須 QA-QC 對 React Flow warning 時序接受理由、standalone／reveal正式判定及完整 listener inventory做 closure。E1 native、E2嚴格 history-length與E4判定不變；不新增產品 debug state、resolver、MIME、mutation owner、schema、API、global listener、fallback或第二套輸入路徑。

#### 26.21.14 E3 geometry／listener record hardening（2026-09-01）

為避免 lifecycle 個案只依 observer 計數，本輪在既有 runner 的同一 `E3-LIFECYCLE` 增加驗證層欄位：於 mount、close、reveal、mindmap→flow及reload讀取 `.process-planning-canvas` 的可見幾何（canvas 不得大於其 parent）以及 document／window keydown listener inventory。這是 test-only instrumentation，不寫入產品 state，也不新增產品 debug API、global listener或第二套 lifecycle owner。

隔離 fixture 為 `draft-2adac105-5202-4554-a7d0-6233cbdf32ac`，task-owned `http://127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720`；runner結果為 `1 passed (10.2s)`，archive final `manifestRevision=848e8b7bf861957022fa8fcb0b505b80439b60fea616eedfd77bccc9c42ee10c`，artifact仍為 `output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png`。

| Observation | Result | 判定邊界 |
| --- | --- | --- |
| mount／reveal／flow／reload geometry | 可見 canvas `width≤parentWidth+1`、`height≤parentHeight+1`；visible count為`1` | geometry 個案 pass |
| close／unmount geometry | close後 visible canvas count為`0` | owner cleanup 個案 pass |
| listener inventory | document capture `keydown`於mount／close／reveal／flow／reload均回到 baseline `0`；window keydown隨owner mount／close恢復 `7→4→7` | scoped listener個案 pass；不等同全量 listener inventory |
| raw console／lifecycle | observer最多`1`、穩定點 pending rAF=`0`、raw與product diagnostics為空；runner仍排除既有`ResizeObserver loop completed`訊息 | `E3-LIFECYCLE=pass`；`E3-WARNING=Partial／Open` |

本節只強化證據，不改變 E3-WARNING aggregate 的 closure 條件：仍需 QA-QC 對未過濾 warning 時序、standalone／reveal 正式接受理由及完整 listener inventory做獨立判定。E1 native、E2 history-length與E4不變；fixture／runtime已清理，5000 user-owned runtime未觸碰。

#### 26.21.15 E3 full listener inventory exploratory observation（2026-09-01）

為確認 scoped listener record 是否掩蓋 owner remount 的事件註冊變化，本輪只在既有 `e2-admission.pw.ts` 的驗證層加入全量 `EventTarget.addEventListener／removeEventListener` 計數與 DOM `isConnected` 分類；這是 test-only instrumentation，會保留被觀察的 target 參考，不能直接等同瀏覽器 heap 或產品 listener leak。未修改產品 state、API、lifecycle owner、global listener或關聯契約。

環境為 task-owned `http://127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720`；fixture `draft-373f011e-0b0d-4636-a344-89145edd552d`，runner結果為 `1 passed (18.9s)`，cleanup archive final `manifestRevision=f99a52978576269240a7f3f25069e61d1240cba26ddc456f910c44aca16dd29d`，artifact=`output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png`。

| Checkpoint | 全量 listener snapshot | 判定邊界 |
| --- | --- | --- |
| mount | `total=522`、`connected=377`、`disconnected=145`；`document capture keydown=0`、`window keydown=7` | 觀察記錄，不作 leak pass／fail |
| close／reveal | close `646／351／295`、reveal `817／377／440`；document仍`0`、window回`4→7` | scoped owner cleanup仍符合；全量數字上升需 QA-QC 判定 |
| mindmap→flow | `819／379／440`；`react-flow__viewport-portal` target計數由`276`增至`552` | React Flow portal listener retention 疑點；不可直接歸因產品 leak |
| reload | `379／379／0`；`react-flow__viewport-portal=138`、document仍`0`、window`7` | reload 後 instrumentation 基線乾淨；支持「重整會釋放／重建」的觀察 |
| reclosed／rerevealed | reclosed `503／351／152`；rerevealed `674／377／297` | 反覆 remount 仍有 disconnected target 計數；aggregate 保持 open |

此結果與既有 geometry、observer／rAF 及 document keydown scoped evidence 不矛盾，但不能把 `disconnected` 數字直接當成產品技術債：probe 本身以 `Map<EventTarget,…>` 持有 DOM target，且 React Flow 可能在 portal root 上註冊一組瀏覽器事件。`E3-LIFECYCLE` 個案仍為 `pass`；`E3-WARNING` aggregate 維持 `Partial／Open`，必須由 QA-QC 以未注入 monkey-patch 的 DevTools listener／heap 或可重演的 production-like remount profile 判定是否需要修正。不得以 global console suppress、portal搬移、第二套 lifecycle owner或新增 debug API「解決」此觀察。E1 native、E2 history-length與E4不變；fixture archive成功、5080已釋放、5000 user-owned runtime未觸碰。

#### 26.21.16 E3 raw-console assertion hardening（2026-09-01）

為避免 E3 的通過只依賴 compatibility filter，本輪在既有 `e2-admission.pw.ts` 的 `E3-LIFECYCLE` test layer 加入嚴格 `expect(diagnostics).toEqual([])`；`productDiagnostics` 仍保留作歷史相容欄位，但不再是唯一判定。這是 test-only assertion，不修改產品 state、API、lifecycle owner、listener、resolver、MIME、schema或輸入路徑。

環境為 task-owned `http://127.0.0.1:5080`、Playwright `1.62.1`、canonical `/`、`1280×720`、loopback dev identity；隔離 fixture 為 `draft-ee9cb1d2-b8f8-45e9-8f47-491adc7375b9`，結果 `1 passed (11.0s)`，cleanup archive final `manifestRevision=d5445aad498c8cb3ff140905e762ba33a1f93f62108f6c02f74082cb6b03ed9c`，artifact=`output/playwright/dev039/F039-S7-E3-lifecycle-after-fix.png`。

| Check | Result | 判定邊界 |
| --- | --- | --- |
| raw console | `diagnostics=[]`、`productDiagnostics=[]` | strict raw-console 個案 pass |
| lifecycle | 沿用第26.21.15節 geometry、observer／rAF與listener exploratory observation | `E3-LIFECYCLE=pass`；不提升 `E3-WARNING` aggregate |
| cleanup／runtime | fixture archive成功；5080停止並釋放；5000 user-owned runtime未觸碰 | execution boundary pass |

本節只收緊 runner 的 raw-console 證據，不把單案 pass 上推為 E3-WARNING closure；React Flow warning 時序、standalone／reveal正式 QA-QC與完整 listener inventory仍需獨立判定。E1 native、E2 history-length與E4不變。

#### 26.21.17 E3 native DevTools listener／warning closure（2026-09-01）

本輪在同一個隔離 B16 fixture 合併重跑既有 `E3-LIFECYCLE` 與新增的 E3-WARNING native listener case。新增 case 不注入 `EventTarget.addEventListener／removeEventListener` monkey-patch，也不持有 DOM target；只透過 Chromium CDP `DOMDebugger.getEventListeners` 讀取 `window`、`document`、React Flow root與第一個 viewport portal 的原生 listener snapshot。這是驗證層觀察，不改產品 state、API、lifecycle owner、resolver、MIME、layout或輸入路徑。

環境為 task-owned `http://127.0.0.1:5080`、Playwright `1.62.1`、Chromium `149.0.7827.55`、canonical `/`、`1280×720`、loopback dev identity；fixture 為 `draft-5ab9ff12-e5f0-4bfc-8141-eddc1fb4e078`。同一 runner 先執行 E3-LIFECYCLE（geometry／observer／rAF／strict raw-console）再執行 E3-WARNING（native CDP），結果 `2 passed (15.7s)`；與同 fixture 的既有五案 E2 合併記錄合計為 `7 passed`。fixture cleanup 後 archive final `manifestRevision=2903c3813ccd0cd38de638c10d6646a8c5b4ab02da5b6055b5e96a300179eee6`，artifact=`output/playwright/dev039/F039-S7-E3-warning-cdp-listeners.png`。

| Checkpoint | 原生 CDP／lifecycle observation | 判定 |
| --- | --- | --- |
| mount | `processCanvasCount=1`、`portalCount=2`；`window=40`、`document=8`、React Flow viewport portal=`139`；raw diagnostics=`[]` | pass |
| close／unmount | `processCanvasCount=0`、`portalCount=1`；`window=23`、`document=4`；無 visible error或 mutation | pass（owner cleanup） |
| reveal／mindmap→flow | Process canvas重新為`1`，window／document／portal回到`40／8／139`；既有 E3-LIFECYCLE geometry／observer／rAF同步通過 | pass |
| reload | Process canvas=`1`、portal=`2`；window／document／portal再次為`40／8／139` mount baseline，raw diagnostics=`[]` | pass（reload baseline） |

本筆符合第26.14.3節的 E3-WARNING required lifecycle：首次 mount、split／close、reveal、流程圖切換與 reload 均有同一 fixture record；穩定畫面無 parent-size warning、無可見錯誤、無 overflow，Process canvas observer／rAF bounded，且未注入 monkey-patch 的原生 listener snapshot 在 reload／reveal回到 mount baseline。先前第26.21.15節的 full listener exploratory record 因 probe 持有 DOM target，仍只保留為歷史線索，不與本筆混用。

因此 `E3-WARNING=pass`，不需再為 React Flow warning 建立第二套 lifecycle owner或全域 suppress。這只關閉 E3-WARNING closure，不提升 E1 native或 E4；E1 仍因真實 HTML5 `DataTransfer` runner缺口維持 `blocked／not-run`，E2的現行判定已由第26.21.19節提升為`Pass（evidence）`（本段較早的 `Partial／Open` 只作歷史 provenance），E4仍為 `Blocked`。task-owned fixture／5080 runtime均已清理，使用者既有 `localhost:5000` PID `23840`未觸碰。

#### 26.21.18 E1 ProcessNode→Duty native CUA observation（2026-09-01）

本筆是一次性 In-app Browser CUA 的真實 UI 操作觀察，不是 strict runner admission，也不改寫第26.18節的 `DataTransfer` required evidence。環境為 task-owned `http://127.0.0.1:5080`、Chromium `149.0.0.0`、canonical `/`、`1280×720`、loopback dev identity與隔離 B16 fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc`。先由頂部 `功能 → 流程規劃 → 在工作台開啟` 開啟 Process panel，再開啟 `功能 → 工作職掌` Drawer；Process node `process-node-dev039-b16-open` 的來源把手與 Duty `duty-dev039-b16-new` 的 registered target同時位於可互動 surface。

| Checkpoint | Observation | 判定 |
| --- | --- | --- |
| source／target | source selector=`button[aria-label="拖曳流程節點B16 未連結節點至其他面板"]`；target selector=`button[aria-label="職掌B16 新工作職掌，可放置流程節點"]`；兩者均由產品DOM提供，未使用API或`page.evaluate` mutation | geometry／入口 pass |
| CUA interaction | 單次 CUA path 由 source center約`(1053,367)`移至 target center約`(1148,265)`；未注入 synthetic DOM event，瀏覽器無 warn／error log | native DOM interaction observed |
| visible result | target從「加入既有職掌」移至「職掌連結 1 項」，並顯示解除目前流程節點連結的控制；ProcessNode與Duty兩面板內容同步更新 | product mutation observed |
| API readback | before revision=`65f0b6970f54c0598b227238ea39b8fc3315a0adb7c6fd80e4f446d681e05d4c`；after status=`200`、revision=`743e6a6a63497d9281ede117b4dfa493ee01690af8b64476c530444be5af213d`；新增`process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`，既有`process-link-dev039-b16-linked-primary`保持不變 | canonical domain readback pass |
| strict transport | CUA工具未暴露可稽核的 `DataTransfer.types`、`dragstart→dragover→drop` 完整event trace或每一event payload；未取得paired Duty→ProcessNode操作 | `E1-PROC-DUT-NATIVE=Partial／Open`；不得升為strict native pass |
| cleanup | fixture archive response=`200`、final `manifestRevision=005fda19cd0655480ee0a4d71cdaf3a8ac0140bf783e6045e536d9dc6f372c56`；task-owned 5080 listener port已停止／釋放；user-owned 5000（PID `23840`）未觸碰 | evidence／runtime boundary pass |

本筆證明現有 registered target與唯一 mutation owner在真實 CUA 下可以完成 ProcessNode→Duty 關聯；它不證明 strict HTML5 transport、paired direction、history／Undo、409、target卸載或正式 QA-QC。E1 aggregate仍為`Partial／Open`，`E1-DUT-PROC-NATIVE`維持`not-run`；後續只有取得可讀取真實 `DataTransfer` 的 runner，才可沿用同一 relation registry補 strict MIME／event sequence與 paired direction。不得因本筆新增第二 MIME、synthetic fallback、resolver、mutation owner、API直寫或第二份 evidence清冊。

#### 26.21.19 E2 behavioral Undo evidence fresh rerun（2026-09-01）

本輪依第2.3／26.14節以隔離 B16 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 重跑 `output/playwright/dev039/e2-admission.pw.ts`，並使用固定 Playwright `1.62.1` CLI、Chromium `149.0.7827.55`、task-owned `http://127.0.0.1:5080`、canonical `/`、`1280×720`與 loopback dev identity。runner 先明確切換「流程圖」視角，避免 React Flow target 在新工作台 session 中落於不可見視窗；合法 mutation 後等待既有 autosave response settle，再執行恰好一次 `Control+Z`，避免兩次 CAS save 競速。五案 E2 加兩案 E3 共 `7 passed`，產品程式、domain schema、API、permission與正常輸入路徑均未新增。

| Case | 新 evidence | 判定 |
| --- | --- | --- |
| `E2-INVALID` | Employee→ProcessNode visible reject、source focus回復、failure zero-mutation；後續 Employee→Position 合法 mutation 與一次 Undo 使完整 canonical relation IDs 回 hydrated baseline | pass |
| `E2-COMMIT-REJECT` | 已存在 ProcessNode→Duty duplicate 顯示 visible no-op、relation／revision不變；後續 Employee→Position mutation 與一次 Undo回 baseline | pass（optional case） |
| `E2-CAPABILITY-LOSS` | `390×844` mobile readonly 清除 placing；回 `1280×900` 後重新 ProcessNode→Duty mutation，等待 process-link readback，再一次 Undo 回 baseline | pass |
| `E2-409-RECOVERY` | timestamp-only server revision bump 後 stale PUT 取得真實 `409`、保留未保存內容並明確 reload；recovery後 Employee→Position mutation＋一次 Undo回 baseline | pass（optional recovery case） |
| `E2-UNLOAD` | placing中關閉 Process owner，session／notice清除、focus回 organization tab、relation zero-mutation；重新 Employee→Position mutation＋一次 Undo回 baseline | pass |

五案每筆 console／page diagnostics均為空，既有 persistence snapshot 沒有「未儲存變更」殘留，document capture `keydown` listener在 placing 後回到基線；`historyEvidence` 的 `baselineRelationIds`、`mutationRelationIds`、`postUndoRelationIds` 均由 API canonical readback產生，且兩個必要布林值皆為 `true`。這正式滿足 E2 closure 的行為性 history evidence，不再要求產品暴露 `historyLength`。

| Execution boundary | Result |
| --- | --- |
| Fixture cleanup | archive response=`200`；final manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c` |
| Runtime cleanup | task-owned `5080`已停止並釋放；user-owned `5000`（PID `23840`）未觸碰 |
| Artifact | `F039-S7-E2-invalid-pair.png`、`F039-S7-E2-invalid.png`、`F039-S7-E2-capability-loss.png`、`F039-S7-E2-409-recovery.png`、`F039-S7-E2-unload.png`；E3 artifact維持既有 `F039-S7-E3-warning-cdp-listeners.png` |

因此 E2 aggregate 現行判定為 `Pass（evidence）`，待 QA-QC 覆核五筆 record與四方文件同版後才可移除 E2 blocker。E1 strict HTML5 `DataTransfer`／paired Duty→ProcessNode仍未閉合，E4仍為 `Blocked`；本輪不宣稱 DEV-039 整體完成、candidate freeze、commit、merge、deploy或release。

#### 26.21.20 E1 strict-runner second capability probe（2026-09-01）

本輪為排除單一 fixture／幾何因素，改用全新隔離 B16 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b`，沿用 canonical `/`、既有 ProcessNode／Duty registered source-target 與 strict `application/x-orgmaster-entity`。source／target 在正常捲動後均可取得 bounding box，`elementFromPoint` 命中產品 DOM；但 Chromium CDP `Input.setInterceptDrags`、原生滑鼠路徑與最小 HTML5 probe仍未產生可採用的產品 `dragstart → dragover → drop` 或 `DataTransfer.types`。

沒有執行 synthetic event、`page.evaluate` API直寫或產品 domain mutation；API前後未新增 Process link／Duty relation，fixture只完成 inspect後的 recoverable archive。archive response=`200`、final `manifestRevision=99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`，task-owned `5080`已清理，user-owned `5000`（PID `23840`）未觸碰。

依第26.14節保守判定，`E1-PROC-DUT-NATIVE=blocked／not-run`、paired `E1-DUT-PROC-NATIVE=not-run`，E1 aggregate仍`Partial／Open`。這筆只保存 runner capability provenance，不代表產品 resolver／Command／target wiring失效；兩次同類 runner均在 geometry可命中後缺 strict transport，除非取得能輸出真實 HTML5 `DataTransfer` 的新 harness，否則停止同類重試，不新增第二輸入路徑、resolver、mutation owner或證據清冊。

#### 26.21.21 ProcessNode source handle pan-arbitration narrow fix（2026-09-01）

本輪依 E1 事件路徑盤查發現，ProcessNode relation source handle 位於 React Flow 的 `.react-flow__pane` 內；父層 d3 pan 的 `mousedown` 可能在 HTML5 drag promotion 前呼叫 `nodrag`，造成 source handle 的原生拖曳被吃掉。修正僅落在既有 `ProcessNodeCard` source handle：加入 `onMouseDownCapture={(event) => event.stopPropagation()}`，保留既有 `onPointerDown`、strict `application/x-orgmaster-entity` 與同一 `onDragStart`／`onDrop` resolver path；沒有新增 state、listener、MIME、resolver、Command、API 或第二輸入路徑。

自動化 regression：`npm exec -- vitest run src/components/ProcessPlanningWorkbench.test.tsx --pool=forks --maxWorkers=1 --reporter=dot`，結果 `1 file／5 tests passed`。新增 assertion 直接把 source handle 的 `mousedown` 送入 React Flow pane，確認 pane 不再收到該事件；同一測試仍覆核 keyboard source、strict MIME dragover／drop callback 與 Duty target wiring。`npx tsc --noEmit --pretty false` 與 `npm run build` 同樣通過。

修正後以 task-owned B16 fixture `draft-2b8105a0-5eb8-4682-959b-66e50af666f3` 重跑 browser diagnostics：source／target geometry 與 `elementFromPoint` 均可命中；Playwright native path 可觀察到 source `dragstart`／`dragend`，`dragend` 帶有 `application/x-orgmaster-entity`，但本 runner 仍未提供可採用的 `dragover`／`drop` 完整序列，故 E1 不升級為 strict pass。API readback未新增 Process link／Duty relation；fixture最後以既有 archive path 清理，archive response=`200`、final `manifestRevision=dcb35be8674ab8a31fa5b905ccf939528fe6ab7c57b0cbcab0739b44cca7ac03`。

判定：`E1-PROC-DUT-NATIVE=blocked／not-run`、paired `E1-DUT-PROC-NATIVE=not-run`、E1 aggregate與 E4 不變。此修正只解除已證明的 React Flow pan arbitration 產品缺口；strict HTML5 transport 仍需新的可讀取真實 `DataTransfer` harness，未因此授權 synthetic event、API 直寫或第二 resolver。

#### 26.21.22 Headful native runner capability probe（2026-09-01）

為排除 headless／CDP runner 本身的限制，本輪建立一次性 `scripts/dev039-headful-native-probe.mjs`，改用 Playwright `headless:false` 與實際滑鼠路徑；仍沿用 canonical `/`、`application/x-orgmaster-entity`、既有 registered source／target、同一 API readback 與 fixture cleanup 規則，沒有新增產品事件通道、resolver、Command、MIME、API或資料模型。

本次使用隔離 B16 fixture `draft-cdd24b6d-d8de-404a-ac9a-1ee9a257b899`、task-owned `http://127.0.0.1:5080`、`1280×720`及 loopback dev identity。第一次執行在流程面板未先選取 ProcessNode，故 Duty target 未進入可見狀態；修正 harness 加入節點選取後重新執行，headful Chrome 在原生拖曳期間超過 75 秒沒有輸出可採用 record，遂停止該次任務專用 probe。兩次均未取得可稽核的 `dragstart→dragover→drop`、strict `DataTransfer.types`、API mutation或paired Duty→ProcessNode證據；沒有以 `page.evaluate`、synthetic event、API直寫或改style補造結果。

判定維持：`E1-PROC-DUT-NATIVE=blocked／not-run`、paired `E1-DUT-PROC-NATIVE=not-run`、E1 aggregate `Partial／Open`、E4不變。此節只記錄「不同 runner 仍未完成 admission」的 provenance；headful probe不代表產品失敗，也不授權新增第二 runner、fallback、resolver、mutation owner或證據清冊。fixture已完成 recoverable archive，cleanup CLI exit=`0`、final `manifestRevision=49bf03ff348e27e5dc66b0d428119e6ef759e9b99eb6e504de5bfff61bad728b`；task-owned `5080`已停止並釋放，user-owned `5000`未被觸碰。

#### 26.21.23 E1 ProcessNode→Duty strict native single-direction pass（2026-09-01）

本節是本日最新的單方向 strict native evidence，覆寫同日較早的 runner／CUA partial provenance，但不覆寫 paired direction 或 aggregate gate。產品先完成兩項窄修正：`ProcessNodeCard` source handle 以 pointer／mouse capture 阻止 React Flow pane pan arbitration，`App` 將 placement begin 與 notice 延後一個 task，避免同步 React rerender在瀏覽器完成 HTML5 drag promotion前觸發 `dragend`；既有 payload、resolver、Command、API與single owner均未改變。

以全新隔離 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673`、task-owned `http://127.0.0.1:5080`、canonical `/`、`1280×720`、Chromium `149.0.0.0`及 loopback dev identity，透過一次性 evidence-only native pointer runner 由 `process-node-dev039-b16-open` 拖至 `duty-dev039-b16-new`。runner使用source／target bounding box與`elementFromPoint`前置檢查，未使用synthetic event、`page.evaluate` mutation或API直寫。

| Required field | Result | 判定 |
| --- | --- | --- |
| event sequence | `dragstart → dragenter／dragover → drop → dragend`；source DOM在drag session期間仍connected | pass |
| strict transport | `application/x-orgmaster-entity`於target `dragenter／dragover／drop`及source `dragend`可讀；事件無`defaultPrevented` | pass |
| visible result | UI顯示「已建立跨面板關係」，Duty target顯示「職掌連結 1 項」 | pass |
| persistence | 明確 `Control+S` 後 API status=`200`；revision `4c3ce4dc01c2b0a921163af7a695e6e1bc0f6738800cb84406a7bd333634baec` → `0425c154f4d0089b15e1399e83000737ffb1756a7c3270095a802a764bfc6156`；canonical link `process-duty-2`存在且只一筆 | pass |
| artifact | `output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json` | pass |
| cleanup | fixture archive status=`archived`、manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`；task-owned `5080`釋放、user-owned `5000`未觸碰 | pass |

本筆判定為 `E1-PROC-DUT-NATIVE=pass`（單方向）；`E1-DUT-PROC-NATIVE`最新 reverse runner已於第26.21.24節記為`blocked／not-run`，E1 aggregate維持`Partial／Open`，E2／E3與E4不變。一次性 runner已在生成 JSON artifact後移除，不形成第二 evidence manifest；產品仍只保留單一 `RelationPlacementSession`、registered resolver與既有mutation owner。後續只有在取得能讀取真實 HTML5 `DataTransfer`的新能力時才可重做 paired Duty→ProcessNode strict native case，並交正式 QA-QC覆核；不得重做同類 runner或新增fallback、MIME、API、resolver、mutation owner或資料模型。

#### 26.21.24 E1 Duty→ProcessNode paired native runner boundary（2026-09-01）

本節記錄目前唯一一次反向 paired native runner 嘗試，並覆寫「尚未開始」的工作敘述；它沒有把未完成的 terminal `drop`誤報為產品通過，也不改寫 ProcessNode→Duty 單方向 pass。測試沿用既有 typed relation contract、registered resolver、`LINK_PROCESS_NODE_DUTY` mutation authority與同一個 `RelationPlacementSession`，沒有建立新的事件通道、MIME、resolver、Command、API或 evidence manifest。

| Required field | Result | 判定 |
| --- | --- | --- |
| fixture／entry | `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`；canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`；`duty-dev039-b16-primary / primary-execute` → `process-node-dev039-b16-open` | pass（前置條件） |
| owner geometry | source bounding box `1119,622.546875,49×28`；target `858.6439819335938,293,190.33709716796875×46.719085693359375`；source／target均在可見 owner surface | pass（前置條件） |
| strict transport | `dragstart → dragenter → dragover → dragend`；`application/x-orgmaster-entity`於target `dragenter／dragover`及source `dragend`可讀；沒有 terminal `drop`，未觀察到 `defaultPrevented` | blocked |
| visible result | 僅顯示拖曳提示／placing notice，未出現「已建立跨面板關係」 | blocked |
| persistence／zero-mutation | API status=`200`；revision `c018fc0de0f1a80af43d6663f3a8099ef8fa35541f925f289afec366e3cb6c3a`前後不變；既有 `process-link-dev039-b16-linked-primary`保留，`createdLinkId=null` | pass（zero-mutation） |
| artifact | `output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json` | pass（provenance） |
| cleanup | fixture archive=`archived`、manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`；task-owned `5080`釋放、user-owned `5000`未觸碰 | pass |

本筆正式判定為 `E1-DUT-PROC-NATIVE=blocked／not-run`：strict transport只到 `dragover`，缺少 paired case 必要的 terminal `drop`、可見成功結果與 mutation readback。這是 runner／原生拖曳能力的可稽核邊界，不是 domain resolver、API或產品資料失敗；不得以 keyboard、CUA partial、synthetic event、API直寫或新增 fallback 取代。本輪已刪除一次性 probe並釋放 task-owned runtime；除非取得能讀取真實 HTML5 `DataTransfer`且可完成 terminal `drop`的新能力，否則停止同類重試。E1 aggregate維持`Partial／Open`，正式 QA-QC與E4不變。

#### 26.21.25 E1 Duty→ProcessNode paired native strict pass（2026-09-01）

本節是第26.21.24節 boundary後的最新權威 reverse evidence，保留前一筆 blocked provenance，不把 runner限制誤寫成產品失敗。產品修正只有 `ProcessDutyBridge` responsibility lane source 的 HTML5 `effectAllowed` 由 `copy` 對齊既有 ProcessNode／target 的 `link`；既有 `application/x-orgmaster-entity`、`RelationPlacementSession`、registered resolver、`LINK_PROCESS_NODE_DUTY` Command與API mutation owner均未改變，也沒有新增 fallback、MIME、resolver、state或第二輸入路徑。

以全新隔離 B16 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396`、task-owned `http://127.0.0.1:5080`、canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`、`1280×720`、Chromium `149.0.0.0`及 loopback dev identity，從既有 linked Duty `duty-dev039-b16-primary / primary-execute` 拖至未連結 ProcessNode `process-node-dev039-b16-open`。責任區只做 owner 內捲動讓 lane button 避開固定開發身份浮層，未改產品資料或 layout state。

| Required field | Result | 判定 |
| --- | --- | --- |
| event sequence | 真實 `dragstart → dragenter／dragover → drop → dragend`；source／target在操作期間仍connected | pass |
| strict transport | strict `application/x-orgmaster-entity` 於target `dragenter／dragover／drop`及source `dragend`可讀；`effectAllowed=link`、`dropEffect=link`；無`defaultPrevented` | pass |
| visible result | UI顯示「已建立跨面板關係」 | pass |
| persistence | API status=`200`；revision `baebb74bee27faf94294cc3b93e72551358d6575e563f1334e999e076c10bdf9`→`cd8de58e1607e5c374b0293711e5e59d98f131c5b0b68a7754bb34378c8f515d`；新增canonical `process-duty-2`，既有 `process-link-dev039-b16-linked-primary`保留且 duplicate count=`1` | pass |
| artifact | `output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json` | pass |
| cleanup | fixture archive=`archived`、archive manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`；task-owned `5080`釋放、user-owned `5000`未觸碰 | pass |

本筆正式判定 `E1-DUT-PROC-NATIVE=pass`。連同既有 Employee→Position、Duty→Position及 ProcessNode→Duty strict records，四個 E1 minimum directions 均已具備可稽核 evidence，E1 aggregate為 `Pass（evidence）`。正式 QA-QC已覆核四方文件、artifact、cleanup、targeted／build gate與工作樹差異；E4仍須由PM另行取得使用者授權後才可進入candidate freeze。一次性 probe已移除，不形成第二份 evidence manifest；產品仍維持 single owner／resolver／mutation authority。

#### 26.21.26 E1 desktop viewport extension evidence（2026-09-01）

本節補足第17.5項的兩個桌面 viewport 交付路徑。兩案沿用既有 `功能 → 流程規劃 → 在工作台開啟 → 流程圖` 正常入口、同一 `RelationPlacementSession`、registered resolver、strict `application/x-orgmaster-entity` 與既有 `LINK_PROCESS_NODE_DUTY` authority；只以 evidence-only runner 參數切換 viewport，沒有新增產品輸入路徑、MIME、resolver、Command、API、state 或 layout store。每案均以真實滑鼠路徑取得完整 `dragstart → dragenter／dragover → drop → dragend`，`effectAllowed=link`／`dropEffect=link`，`diagnosticsCount=0`，UI顯示「已建立跨面板關係」，API revision變化且既有 link 保留。

| Viewport | Fixture／revision | Strict transport／result | Cleanup／artifact |
| --- | --- | --- | --- |
| `1440×900` | `draft-430665c2-a669-454d-a592-e50766a8aa96`；`30d75f95530fe1a94fa447a7ba2f60419176b6aae19a050a0a70bbcbd84b2d88` → `5e7a9c82ebc7c18b37448d4f83c53f519d435bb0246420874e86a53256bf50c2` | `dragstart→dragenter→dragover→drop→dragend`；strict MIME於source／target必要事件可讀；新增 `process-duty-2`，保留 `process-link-dev039-b16-linked-primary` | archive=`archived`、manifest revision=`6aef350334038315535e4e9b436ae5a803f9e1c725a8a2239ba2ee551a1fab34`；[JSON](../../output/playwright/dev039/F039-S7-E1-process-duty-native-1440x900.json)、[PNG](../../output/playwright/dev039/F039-S7-E1-cdp-process-duty-1440x900.png) |
| `1024×768` | `draft-71867b51-ba53-41eb-a86f-9ead100e5cf8`；`78387b891f1a7fdadb60d50059a965e3497a4666113f2747504fd3a791ea7ed2` → `ccb242db183f90c5e1578e8c522900d04e5a0d9bb124d098f9e198255aecaccd` | `dragstart→dragenter→dragover→drop→dragend`；strict MIME於source／target必要事件可讀；新增 `process-duty-2`，保留 `process-link-dev039-b16-linked-primary` | archive=`archived`、task-owned 5080已釋放、5000未觸碰；archive manifest revision未由compact runner輸出，未推測；[JSON](../../output/playwright/dev039/F039-S7-E1-process-duty-native-1024x768.json)、[PNG](../../output/playwright/dev039/F039-S7-E1-cdp-process-duty-1024x768.png) |

兩個 viewport record 都只作第17.5項的 viewport extension，不另造 E1 aggregate 或 evidence manifest；正式判定仍由四筆 E1 strict direction record、E2／E3及正式 QA-QC共同決定。`1024×768` 的 archive status 已為 `archived`，但因 compact output 沒有 manifest revision，文件刻意保留 `null`，不得把未知值當成已知。E4 仍為 `Candidate Freeze Ready / Authorization Pending`，本節不授權 commit、merge、deploy 或 release。

## 27. RD Handoff、Execution Order與Gate

- S0～S5與其QA-QC evidence維持歷史基線；S6已針對persistent surface、overlay及selection ownership完成補強，並以新的source policy、owner geometry與browser smoke證據覆核。S7只重新開啟typed relation placement交付，不推翻其他歷史證據。
- 本輪execution boundary已完成S6-0～S6-5：新增typed overlay host與surface primitive、收斂owner factory、移除跨module detail與viewport-fixed feature surface、完成 targeted／full／build／diff gate及B14～B15相關重點複核。
- 「已有元件／已有接線」仍不等於slice完成；本次完成判定來自normal-entry、capability、keyboard、failure、lifecycle、browser與regression合併證據。工作樹尚未形成immutable commit，故仍不得宣稱merge／deploy／release完成。
- 每個slice結束做Spec Drift Check，只更新本spec、manifest及直接受影響active spec；不得以產品實作偏差反改Human-confirmed rule。
- 第一次出現P0/P1 failure、domain dirty被layout污染、recovery顯示fixture、正常入口漏module、mobile可mutation或需要新domain/API時立即停止回PM。
- S6四項acceptance、targeted gate、aggregate regression、build與browser re-QC均已完成；S7目前已完成relation pure session、App coordinator、typed effect／capability path、Employee／Duty／Process source／target接線、舊平行state移除、Process composition harness與B16 pure fixture transformer，並通過relation／component／fixture targeted gate、最新 full regression（160 files／664 tests）、build／typecheck與source scan；本輪新增E2 fail-closed與Process canvas lifecycle自動化測試不改產品契約。Process canvas 幾何窄修正後 split／reload／flow source handles 均在 owner canvas 內、無 overflow且產品 console `0／0`。fresh QA已通過keyboard relation、duplicate/no-op、Escape、reload、readonly與1440／1024／390 viewport／overflow；第26.21.26節再補上1440×900與1024×768的strict native viewport extension，兩案均有完整事件鏈、API revision變化、canonical readback、diagnosticsCount=0與cleanup。E1四向、E2五案`historyEvidence`、E3兩案均已正式 QA-QC覆核，整體狀態為`S0～S6 Historical Complete / S7 Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Ready / Authorization Pending`。尚未commit、merge、deploy或release。
- 2026-08-31 fresh native evidence delta：同一 B16 fixture 的 Employee→Position 與 Duty→Position 已各取得一筆 strict `application/x-orgmaster-entity`、200 PUT、response revision、canonical readback、visible result與cleanup完整的單案 `pass`；ProcessNode↔Duty native 本輪因 duty drawer／transformed viewport 為`not-run`，E1 aggregate、E2 failure、E3 warning仍未閉合。此更新只提升逐案證據，不改變 S7 aggregate 狀態或既有架構邊界；完整欄位見第26.15節，索引見 parity 第16.8節。
- 2026-09-01 E1 CUA supplement：上一筆所稱 ProcessNode↔Duty `not-run` 僅指 strict HTML5 `DataTransfer` runner admission；本輪另在隔離 B16 fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc` 以 In-app Browser CUA 觀察到 ProcessNode→Duty 實際 DOM／API link mutation（`Partial／Open`，API=`200`，新增`process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`）。CUA未提供strict `DataTransfer.types`與完整event trace，paired Duty→ProcessNode仍`not-run`；E1 aggregate、E2與E4不變。完整欄位見第26.21.18節，索引見 parity第16.15.16節；不得將此 observation改寫為strict native pass。
- 2026-09-01 E1 strict native single-direction supplement：在 ProcessNode source handle 的 pointer／mouse capture與App deferred placement begin窄修正後，以全新 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673`取得可稽核 `dragstart→dragenter／dragover→drop→dragend`、strict `application/x-orgmaster-entity`、UI「已建立跨面板關係」、明確 `Control+S`後API `200`／revision前後變化與canonical `process-duty-2` readback；artifact=`F039-S7-E1-process-duty-native-strict.json`，archive manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`。僅將 `E1-PROC-DUT-NATIVE`標為`pass`，paired `E1-DUT-PROC-NATIVE`仍`not-run`，E1 aggregate與E4不變；一次性runner已移除，不新增第二輸入路徑或證據清冊。完整欄位見第26.21.23節，Parity索引見第16.15.19節。
- 2026-09-01 E1 paired Duty→ProcessNode native boundary：全新 B16 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`以既有 canonical入口與正常真實滑鼠路徑，從`duty-dev039-b16-primary / primary-execute`拖至`process-node-dev039-b16-open`；可觀察`dragstart／dragenter／dragover／dragend`及strict MIME，但未取得terminal `drop`、UI成功結果或domain mutation，API status=`200`且revision／既有link IDs不變。artifact=`F039-S7-E1-duty-process-native-blocked.json`，fixture archive manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`；5080已釋放、5000未觸碰。正式判定`E1-DUT-PROC-NATIVE=blocked／not-run`，E1 aggregate、正式QA-QC與E4不變；不新增runner、fallback、MIME、resolver、mutation owner或第二證據清冊。完整欄位見第26.21.24節，Parity索引見第16.15.20節。
- 2026-08-31 E2 browser failure-path delta：同一 B16 fixture 以 task-owned Playwright 補得 `E2-COMMIT-REJECT`（既有關係重送為 no-op、可見拒絕、來源焦點恢復）、`E2-CAPABILITY-LOSS`（切 `390×844` mobile read-only 後 source／placing 清除）與 `E2-UNLOAD`（關閉 Process owner 後 session 清除、焦點回組織 tab）；三案 API status `200`，hydrated→after relation／link IDs與revision不變，產品 console/page error diagnostics為空。這三筆不取代 `E2-INVALID`，也因 dirty／history／autosave／listener inventory欄位未齊而不提升 E2 aggregate；詳見第26.21節與 parity 第16.15節。
- 2026-09-01 E3 lifecycle combined admission：以隔離 fixture `draft-3983041c-deb2-4e9e-badf-5e1aa5ecbee0` 重跑同一 runner，五個 E2 failure-path 加 `E3-LIFECYCLE` 共 `6 passed (31.5s)`。E3 probe在 mount／close／reveal／mindmap→flow／reload觀察到 Process canvas active observer 不累積（可見時為`1`、close後為`0`）、pending animation frame為`0`，產品 diagnostics為空；archive final manifest revision為`28390b5c0322c842d28ddc0b31f7fa0db9074810e37e5a890db38495ce322beb`，5080 runtime／port已cleanup。此筆只關閉`E3-LIFECYCLE`個案，不關閉React Flow warning／standalone／reveal aggregate、E1 native、E2 aggregate或E4；未新增產品debug state、listener、resolver、MIME、mutation owner、schema、API或第二輸入路徑。
- 2026-09-01 E2 editable re-entry／409 recovery delta：同一 B16 fixture 以 task-owned Playwright 補得五案 `5 passed (25.9s)`，含 mobile readonly後切回桌面重新進入、Undo還原及 timestamp-only revision bump 的 stale PUT `409` recovery；E2 aggregate仍因嚴格 history-length schema維持`Partial／Open`，詳見第26.21.4節與 parity 第16.15.3節。
- 2026-09-01 E2 behavioral Undo evidence latest override：以隔離 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c`、固定 Playwright／Chromium與同一 runner 重跑五案 E2 加兩案 E3，共 `7 passed`；五案均有 `historyEvidence`（合法 mutation、恰好一次 `Control+Z`、完整 canonical relation IDs回 baseline），並補齊 autosave settle、流程圖視角可見性、re-entry與409 recovery。E2 aggregate現為`Pass（evidence）`，正式 QA-QC覆核、E1 strict native／paired direction與E4仍未閉合；archive final manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`。本條優先於前述 E2 `Partial／Open` 歷史摘要。
- 本文件不授權merge、PR、deploy、production、正式資料變更或release；那些只在後續release指令進入release gate。

### 27.1 RD主管架構審查與實作檢查點（2026-08-28，歷史摘要）

架構結論：S0～S5 replacement方向與domain boundary仍有效，但S6盤查證明typed adapter尚未全面強制persistent surface、overlay及selection owner，故`QA-QC Reopened / S6 RD Implementation Ready / RD Not Started`。workspace core仍只擁有layout、route、session、selection及surface lifecycle，既有Organization、Duty、Process、Management Method、Risk與Governance各自保有唯一domain／Command／API權威；S6只強化render與state邊界，不另建通用桌面框架或重寫domain。

為維持架構優雅，後續實作必須遵守五條收斂規則：

1. `src/workspace/*`不得import React module surface或執行domain mutation；effect只由controller集中處理。
2. `WorkspaceModuleSurfaces`只做typed adapter composition，不保存第二份business state；module內互動回到既有owner。
3. `App`只負責注入既有state／handlers與全域dialog，不再同時保留另一套route early-return composition。
4. 一個module只有一個panel instance；不建立service locator、plugin API、跨panelevent bus或通用桌面抽象。
5. 舊surface只能在對應parity ID已有fresh evidence且進入removal allowlist後刪除；不得以build通過代替任務parity。

| Slice／領域 | 審查狀態 | 已有事實 | 後續保留事項 |
| --- | --- | --- | --- |
| S0 workspace core | `Complete / QA-QC Passed` | types、十模組registry、layout／local persistence、route、pure state、capability、hydration與typed entity resolver均已建立 | 不再改domain boundary；後續變更需比例回歸 |
| S1 shell primitives | `Complete / QA-QC Passed` | canonical `/`只render單一`WorkspaceShell`；十模組正常入口、initial organization-only、split/tab/pin、零panel、reload、damaged layout、legacy alias、close unmount與focus均有`F039`及QA-QC evidence | 進Git／release前只做來源一致性檢查 |
| S2 master data | `Complete for replacement / QA-QC Passed` | Organization、Employee、Position、Department、Level皆由新正常入口進入；Drawer promotion、stable selection、桌面／窄版capability及Employee→Position keyboard path通過 | 各domain既有CRUD/error由149-file full suite承接 |
| S3 Duty／Process | `Complete / QA-QC Passed` | Duty／Process panel、四責任lane與三條registered relation共用既有Command；browser keyboard/focus、exact relation ID、Undo restore及full regression通過 | 無待辦；新修改才重驗 |
| S4 Documents／Risk／Governance | `Complete for replacement / QA-QC Passed` | 三模組由正常入口進panel；management document lifecycle、role-risk desktop/mobile capability與governance surface均沿用既有authority；1023/390 mutation／composition absence已重驗 | 無待辦；新修改才重驗 |
| S5 replacement | `Complete / QA-QC Passed` | `F039`已建立；retired prototype／simulator／duplicate canvas／page-modal shell及backdrop已依allowlist移除；source scan 0 matches；149 files／614 tests與build通過 | Commit、merge、deploy、release均需使用者另行授權 |
| S6 panel boundary hardening | `Implementation Complete / QA-QC Passed` | 已完成同類缺口盤查、ADR amendment、typed overlay host、owner factory、S6-0～S6-5遷移、failure recovery、source policy與B14～B15 re-QC | 後續只保留比例回歸；commit、merge、deploy、release另需使用者授權 |
| S7 relation placement session | `Relation Placement Implemented / QA-QC Reopened` | `relationPlacement.ts`、single App owner、pure reducer、typed effect／capability path、Employee／Duty／Process source／target wiring、legacy state removal、composition harness與task-owned fixture transformer已完成；relation／component／fixture targeted、full regression、typecheck、build與source scan已通過；Chrome CUA已觀察Employee→Position native DOM mutation、same-target noop及Duty→Process invalid＋Escape cancel，但 strict `dataTransfer.types`、API／revision readback、target unload／capability-loss與React Flow warning仍未關閉 | 依第26.13節完成E1～E4；若失敗只回既有target／lifecycle窄接線修正，不擴張架構 |

本機S0～S6 RD與QA-QC證據已整理於`output/playwright/dev039/manifest.md`：包含十模組正常入口、七個Drawer promotion、initial organization-only、split/tab、close unmount、canonical reload、損壞layout、legacy alias、desktop current readonly、editable draft、1024／1023邊界、390 mobile readonly、reduced motion、全域recovery gate、typed relation keyboard baseline，以及S6 owner／overlay／container re-QC。Final QA-QC另以桌面三面板、1023單一surface、390手機唯讀、launcher Escape focus、console／network／overflow做獨立角色抽測；S6追加確認Duty detail只在duties owner、Management Method文件留在management-methods panel、Role Risk獨立面板為relative、global host單一且feature source scan無raw portal。S7另記錄B16 loopback runtime、ProcessNode↔Duty雙向native、Employee／Duty native、keyboard Employee、noop／cancel／readonly／reload與fixture archive；Process canvas after-fix artifact為`F039-S7-E3-process-geometry-after-fix.png`，最新 pure／fixture targeted matrix為`11 files／57 tests`、component／composition matrix為`6 files／24 tests`（關聯與lifecycle合併重跑`4 files／20 tests`），full regression為`160 files／663 tests`，`tsc --noEmit`、`vite build`與`git diff --check`均已通過。本輪新增E2 fail-closed與Process canvas lifecycle自動化測試不改產品契約。fresh QA已補keyboard relation、duplicate/no-op、Escape、reload、readonly與1440／1024／390 viewport／overflow；native HTML5 `dataTransfer`、invalid／target卸載 failure evidence、standalone／reveal lifecycle與React Flow parent-size warning仍開放。這些證據來自`ab5fe02`加目前DEV-039未提交worktree diff，尚非不可變commit artifact；不宣稱S7／QA-QC、commit、deploy或release完成。

S0～S5的P0／P1 implementation closure已由`F039`、targeted tests、full regression、build及source removal scan完成。B6以隔離HTTP 500證明index unavailable時全域阻斷mutation；invalid current、failed draft、409、dirty close與domain invalid path繼續由DEV-020／032／037／038既有API及automated regression承接。S6的產品缺口已由typed host、owner factory、source policy、targeted／aggregate gate及browser re-QC關閉。S7的P0／P1 readiness缺口已收斂為0；relation pure session、App唯一owner、Employee／Duty／Process wiring、legacy state removal、composition harness與B16 pure fixture transformer已完成並通過relation／component／fixture targeted、full regression、build／typecheck與source scan。fresh QA已補keyboard relation、duplicate/no-op、Escape、reload、readonly與1440／1024／390 viewport／overflow；native HTML5 `dataTransfer`、invalid／target卸載 failure evidence與React Flow parent-size warning仍開放，狀態維持`Relation Placement Implemented / QA-QC Reopened`。

> 歷史驗證基線（2026-08-31，幾何窄修正前）：S7 targeted relation／component／fixture `7 files／34 tests`、aggregate `159 test files／656 tests`、typecheck、build與diff check均通過；Chrome CUA另觀察到一筆 Employee→Position native DOM mutation及一筆 invalid＋Escape cancel，但 strict MIME、API／revision、target unload／capability-loss與E3 warning closure仍未完成。現行數字與判定以本spec第26.15～26.18節為準。

### 27.2 RD主管架構收斂判定（2026-08-28，歷史摘要）

本次審查不新增層級或抽象；以「依賴方向可被source search驗證」判斷架構是否維持優雅：

```text
Workspace pure core
  → shell/controller effects
    → typed module adapters
      → existing domain selectors / Commands / APIs
```

反向依賴一律禁止：domain不得知道panel／layout；`src/workspace/*`不得import任何業務surface；module不得直接寫另一module的local state；跨panel資料行為不得繞過registered resolver與既有Command。`App`可以作composition root，但不得同時保留可正常到達的第二套legacy composition。

| Closure ID | 必須成立的事實 | 驗證方法 | 未通過時處理 |
| --- | --- | --- | --- |
| `AR-01` Pure core | `src/workspace/*`只有pure state／metadata／resolver或明確controller effect，不import業務React surface | source search＋workspace unit tests | 移回typed adapter，不新增例外 |
| `AR-02` Single render owner | module metadata registry不render；每個module只有一個typed surface owner | registry／surface source review | 合併重複renderer，不保留兩套entry |
| `AR-03` Single mutation owner | panel與drop只呼叫既有guarded owner；不建立workspace business store | command spy、history／dirty／autosave test | 停止slice，移除第二寫入路徑 |
| `AR-04` Single canonical composition | 正常`/`只render`WorkspaceShell`；legacy route只轉譯intent | browser route matrix＋source search | 不得進S5，先消除雙composition |
| `AR-05` Bounded extensibility | 只支援十module、單實例、split／tab與已登錄relation | public type／UI source review | 移除plugin、multi-instance、generic bus預留 |
| `AR-06` Observable lifecycle | unopened不mount／fetch、hidden停止可見性effect、close釋放資源 | network、observer、timer與unmount tests | 視為P1 performance／correctness缺口 |
| `AR-07` Safe replacement | 每個legacy removal均有feature IDs、fresh evidence與source allowlist | parity manifest＋git diff | 未列證據者不得刪除 |
| `AR-08` Persistent owner | 每個list／canvas／document／settings／detail／editor只存在於owner `data-module`，且DOM最多一份 | component owner assertion＋B14 geometry | 移回owner adapter；不得用fixed／portal補位 |
| `AR-09` Overlay scope | panel transient與global transient分別只進typed host；feature無raw body portal | source-policy allowlist＋B15 focus／geometry | 移除例外或重新分類；不得fallback body |
| `AR-10` State isolation | panel-local detail state不由其他module或全域Inspector boolean共同擁有；shared selection只傳stable ref | rapid selection／pin／DOM count tests | 拆分owner state；不得建立shared mutable detail store |
| `AR-11` Container／capability separation | panel container只決定排版，workspace environment才決定desktop／mobile mutation能力 | desktop窄panel＋1023成對browser case | 移除feature viewport hack；不得由panel width升降權限 |
| `AR-12` Single placement owner | native drag與keyboard只共用一份短生命週期`RelationPlacementSession`；candidate freeze後無`employeeDrag`、`employeeKeyboardDrag`、`dutyDragState`或等效平行正常路徑 | state transition tests＋source scan＋native／keyboard browser pair | 停止candidate，先移除第二owner；不得以同步兩份state補救 |
| `AR-13` Same resolver across input | native與keyboard對同一payload／target產生相同`intent／noop／rejected`，commit前都以latest state與capability重驗 | resolver contract matrix＋mutation spy＋capability-loss browser case | 收斂到registered resolver與既有domain authority，不新增panel validator或第二mutation path |

S0～S5依賴與domain架構仍判定有效；AR-08～AR-11已取得實作、source policy、targeted/full regression與browser re-QC證據。AR-12～AR-13的實作、source-policy與自動化Gate已通過，fresh QA已補keyboard relation、duplicate/no-op、Escape、reload、readonly與viewport／overflow；native HTML5 `dataTransfer`、invalid／target卸載 failure evidence與React Flow parent-size warning仍是candidate freeze及QA-QC關閉條件。可擴張性仍來自typed registry／adapter與穩定domain authority，不是增加抽象；S7不得擴張成generic event bus或第二domain store。後續若修改owner／overlay／container／placement邊界，必須依相同acceptance做比例回歸；目前不得將未授權的QA-QC、commit／merge／release誤報為完成。

## 28. Future Phase Capsule

狀態：`Future Phase Captured / Not Requested`。

- 目的：支援具名layout template、跨裝置／使用者同步、同類panel多實例、多人共編、更多分析panel或浮動多螢幕。
- 邊界：不得讓Current Phase預建plugin SDK、multi-instance context、server layout schema或hidden UI。
- 依賴：Current Phase完整parity、真實使用資料、穩定panel registry及獨立權限／資料治理決策。
- 驗收方向：新增自由度不能產生第二domain truth、權限繞過或不可恢復layout。
- Re-entry：真實規劃會議證明單一panel、browser-local layout或受控split/tab不足，且使用者明確要求下一階段。

## 29. Spec Governance與Readiness

- Spec Impact Preflight：`Intentional replacement`。DEV-039替換DEV-038固定composition、現行Directory shell及各full-page route rendering；S7再以單一Relation Placement Session取代分散的native／keyboard關聯配置state，但保留各active module的domain、Command、API、permission與S0～S6 evidence baseline。
- ADR：ADR-009維持Accepted，既有Panel Surface Ownership amendment不變，並新增Relation Placement amendment；原因是跨輸入方式的單一session／resolver／mutation boundary會成為所有跨panel關聯的治理基準。ADR-008、ADR-002及ADR-006資料權威不變。
- Cross-spec：parity manifest逐項決定保留／恢復／排除；舊route只能作canonical alias，不得形成雙UI。DEV-033手機全系統能力仍未完成，但DEV-039採更保守的module/default-deny規則，不宣稱取代DEV-033。
- Deferred Scope Audit：multi-instance、server layout、浮動視窗與plugin runtime已進第28節Future Capsule，不限制Current Phase正確性。
- RD Contract Gate：S0～S6既有contract與完成證據不變；S7問題、UI Entry、核心state transition、registered relation與結果語意、data／API／permission不變、dependency、failure recovery、final acceptance、FMEA、stop conditions、fixture及evidence layer均已固定，沒有待人類產品決策。
- Implementation Readiness／Completion：S6已完成Readiness Review與實作；第22.5節、第25.5節與第26.7節的S6契約仍有效。S7第22.6節已固定single App owner、pure reducer、exact repo／symbols與capability；目前已實作`relationPlacement.ts`、App coordinator、effect／capability path、三類source handle／target wiring、legacy state removal、composition harness與B16 pure fixture transformer，並通過targeted、full regression、build／typecheck與source scan。第25.6節仍是S7-0～S7-5的收斂契約，第26.8節已補B16 loopback與fresh keyboard／readonly／reload／viewport evidence；E2五案`historyEvidence`與E3 lifecycle／warning證據已通過，現行只剩E1 strict native／paired direction、正式QA-QC與E4 freeze。第2.2～2.4節另將RD可開始與交付可宣稱分離：P0／P1 readiness缺口維持0，但E1／E4產品完成缺口尚未關閉，整體狀態為`S0～S6 Historical Complete / S7 Relation Placement Implemented / QA-QC Reopened`。
- Data/API/migration：OrganizationDocument V7、Workspace manifest V1、server API與正式資料不變；只有可丟棄local layout V1，invalid即重設，不需要資料migration。
- ADR：ADR-009仍為Accepted並已amend；不新增重複ADR。
- Release：Out of scope；未建立merge、deploy、rollback或production artifacts。

## 30. 變更紀錄

- 2026-09-01：headful native runner capability probe與最後一次 targeted rerun均未形成可採用的新增產品證據。headful probe詳見第26.21.22節；`ProcessPlanningWorkbench.test.tsx`本次重跑超過60秒無輸出後安全停止，保留既有 `1 file／5 tests passed`成功紀錄，不以未完成重跑覆蓋基線。fixture `draft-cdd24b6d-d8de-404a-ac9a-1ee9a257b899`已recoverably archive，cleanup CLI exit=`0`、final `manifestRevision=49bf03ff348e27e5dc66b0d428119e6ef759e9b99eb6e504de5bfff61bad728b`；task-owned `5080`已釋放，5000未被觸碰。E1／E4判定不變，未commit、merge、deploy或release。

- 2026-09-01：新增第26.21.21節 ProcessNode source handle pan-arbitration 窄修正。於既有 `ProcessNodeCard` source handle 加入 `onMouseDownCapture` stopPropagation，避免 React Flow pane 的 d3 pan 在 HTML5 drag promotion 前攔截 mousedown；保留同一 strict MIME／resolver／Command／API path，並補 `ProcessPlanningWorkbench` regression（`1 file／5 tests passed`）。`npx tsc --noEmit --pretty false`、`npm run build`均通過；修正後 runner只觀察到 strict MIME 的 `dragstart／dragend`，仍未取得可採用`dragover／drop`，E1／E4判定不變，無 domain mutation、synthetic event或第二輸入路徑。
- 2026-09-01：全量 `npm test -- --run --pool=forks --maxWorkers=1` 重跑在超過四分鐘後仍無測試結果輸出，已安全停止本次 task-owned Vitest process；不覆蓋既有成功的 `160 files／663 tests` 基線，也不宣稱本次全量通過。既有 targeted `1 file／5 tests`、typecheck與build仍為本輪可採用 gate；Vite native-config／chunk-size 僅為既有 tooling advisory。

- 2026-09-01：完成一次 E1 strict-runner admission probe。沿用 B16 fixture `draft-22e0c2bc-29e2-4460-a222-86664fc4cdde`、canonical `/`與既有 ProcessNode／Duty source-target，先以正常瀏覽器操作將目標移出 session bar 遮蔽區，再以 Chromium CDP／Playwright 原生滑鼠路徑探測；source／target geometry與命中前置條件通過，但未取得可採用的 `dragstart → dragover → drop`／strict `DataTransfer.types`，沒有 API 直寫或產品 domain mutation。fixture archive response=`200`、final manifest revision=`51e3a8f1834595939f00337f2854e3e5c5042af95f45dce0acd2f45038bef5bf`，task-owned `5080`已釋放，user-owned `5000`未觸碰。E1維持`blocked／not-run`；此筆只縮小 runner blocker，不新增 synthetic fallback、MIME、resolver、mutation owner、schema或API。

- 2026-09-01：完成 E2 behavioral Undo evidence fresh rerun。隔離 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 以固定 Playwright `1.62.1`、Chromium `149.0.7827.55`執行五案 E2＋E3-LIFECYCLE＋E3-WARNING，共`7 passed`；五案均輸出`historyEvidence`且合法 mutation後恰好一次`Control+Z`回到完整 canonical relation baseline。runner補上流程圖視角可見性前置與autosave settle等待，避免測試假陰性；archive final manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`，5080已停止／釋放、5000未觸碰。E2 aggregate提升為`Pass（evidence）`，正式 QA-QC、E1 strict native／paired direction與E4仍未閉合；不新增產品debug API、第二history store、resolver、mutation owner、schema或輸入路徑。

- 2026-09-01：新增第2.4節 `RD handoff packet`，把下一輪收斂為 `E1-STRICT-NATIVE`、`QA-QC-REVIEW`、`E4-CANDIDATE-FREEZE` 三個最小工作包；同步 parity 第0.2節、`dev_task.md`、`documentation_map.md`、ADR-009與evidence manifest。handoff固定沿用既有 fixture／resolver／mutation authority與唯一record schema，runner能力不足時只保存`blocked／not-run` provenance並停止同類重試；未進commit、merge、deploy或release。

- 2026-09-01：新增第2.2節 `Current readiness audit`，將RD Implementation、E1 native、E2 failure、E3 lifecycle／warning與E4 candidate freeze的現行狀態、可採用事實、最小缺口及禁止擴張邊界集中成單一快照；同步明確P0／P1 readiness gap=`0`不等於QA-QC或產品完成。未新增產品程式、schema、API、permission、dependency、runtime或release artifact。

- 2026-09-01：新增第26.21.18節 E1 ProcessNode→Duty native CUA observation。以隔離 B16 fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc`、task-owned `127.0.0.1:5080`、In-app Browser CUA、canonical `/`、`1280×720`完成一次 source handle→Duty registered target操作；Duty target由「加入既有職掌」變為「職掌連結 1 項」，API status=`200`、revision由`65f0b697...`變為`743e6a6a...`，新增canonical link `process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`，browser warn／error為空。因CUA未提供strict `DataTransfer.types`與完整`dragstart→drop` trace，ProcessNode→Duty標`Partial／Open`、paired direction仍`not-run`，E1 aggregate與E4不變；fixture archive final manifest revision=`005fda19cd0655480ee0a4d71cdaf3a8ac0140bf783e6045e536d9dc6f372c56`，5080已釋放、5000未觸碰。未新增產品架構、第二MIME、fallback或第二份清冊。

- 2026-09-01：完成 DEV-039 現行 runner／文件計數一致性修正。`output/playwright/dev039/e2-admission.pw.ts`目前宣告七個 test case（五案 E2＋`E3-LIFECYCLE`＋`E3-WARNING`），因此現行摘要與交叉索引統一為`7 passed`；較早的`8 passed`只保留於必要的歷史文字時，必須視為舊 runner provenance，不得覆寫現行判定。本次只改文件，不修改產品契約、測試、資料、dependency、runtime、commit、merge、deploy或release。

- 2026-09-01：新增第26.21.16節 E3 raw-console assertion hardening。既有 `e2-admission.pw.ts` 的 E3-LIFECYCLE 改以 `expect(diagnostics).toEqual([])` 嚴格要求原始 console 為空，保留 compatibility filter 僅作歷史欄位；隔離 fixture `draft-ee9cb1d2-b8f8-45e9-8f47-491adc7375b9` 結果 `1 passed (11.0s)`，raw／product diagnostics 均為`[]`，archive final manifest revision=`d5445aad498c8cb3ff140905e762ba33a1f93f62108f6c02f74082cb6b03ed9c`，5080已停止並釋放、5000 user-owned未觸碰。此筆只強化 E3-LIFECYCLE evidence，不關閉 E3-WARNING aggregate、E1 native、E2 history-length或E4，未新增產品架構或第二輸入路徑。

- 2026-09-01：新增第26.21.15節 E3 full listener inventory exploratory observation。隔離 fixture `draft-373f011e-0b0d-4636-a344-89145edd552d` 重跑既有 E3-LIFECYCLE，結果 `1 passed (18.9s)`；加入 test-only 全量 listener 與 `isConnected` 分類後，close／reveal／flow 的 React Flow portal target 計數增加，但 reload 後回到 `disconnected=0` 的乾淨基線。因 probe 會持有 DOM target，不能直接將 disconnected count 判為產品 leak；`E3-LIFECYCLE`維持個案`pass`、`E3-WARNING` aggregate維持`Partial／Open`，待 QA-QC 以未注入 instrumentation 的 listener／heap 或 production-like remount profile 判定。archive final manifest revision=`f99a52978576269240a7f3f25069e61d1240cba26ddc456f910c44aca16dd29d`，5080已停止釋放、5000 user-owned未觸碰；不新增產品架構、debug API或第二輸入路徑。

- 2026-09-01：新增第26.21.12節 execution-hygiene audit。記錄 B16 fixture `draft-2357c0ad-871c-4876-b3d2-935242dad73f` 僅完成 prepare／cleanup、未產生可採用拖曳 evidence，archive manifest revision=`e1db06f6c35dfa96c1af3ead409c8c50ed73528ac175a2966a766cdf29273a28`；同步確認 typecheck、build與diff check通過、5000 user-owned PID `23840`保留且5080未遺留。此筆不改E1／E2／E3／E4判定，也不計入案例數量。

- 2026-09-01：新增第26.21.13節 E3-LIFECYCLE task-owned raw-console／lifecycle rerun。隔離 fixture `draft-fd5238aa-6bf9-4d90-949a-9e22706a8fe2` 只執行既有 runner 的 E3-LIFECYCLE，結果 `1 passed (11.5s)`；mount／close／reveal／mindmap→flow／reload均觀察到active Process canvas observer最多`1`、pending rAF=`0`，raw與product diagnostics均為空，artifact=`F039-S7-E3-lifecycle-after-fix.png`。archive final manifest revision=`2d40124a3851b98cb41e8b46745fcc997a4f9b118950790d48c87c6cb0848e1d`，task-owned 5080已停止並釋放、5000 user-owned未觸碰。此筆只補E3-LIFECYCLE個案，不關閉E3-WARNING aggregate、E1 native、E2 aggregate或E4；不新增產品架構或第二輸入路徑。

- 2026-09-01：新增第26.21.11節使用者5000 runtime E1 CDP probe補充。以全新 B16 fixture `draft-3778d6ea-b4cb-4ce0-b93f-5a8b3afc8b3a`在既有`localhost:5000`、`1280×720`、HeadlessChrome `149.0.0.0`確認source／target geometry可達，但CDP `intercepted=null`且未取得`dragstart／dragover／drop`或`DataTransfer.types`；API前後`200`、revision與既有process link不變，archive final manifest revision為`b6e50360dd1aeeb7880918e0d3439189ccf79cbb07df031dca07778b6ef1b538`。使用者owned 5000未停止；E1維持`blocked／not-run`與aggregate`Partial／Open`，不新增synthetic path、第二resolver／mutation owner或fallback。

- 2026-09-01：完成第26.21.9～26.21.10節 E2 history authority／E3 warning source audit。確認 `useOrgHistory` 的 history stack 僅存在 App 內部，runner `0→1→0` 僅為行為性 Undo round-trip，不能填充嚴格 `historyLength`；Process canvas／WorkspaceLayout無直接 `console.warn`，Vite tooling advisory、React Flow transient warning與產品 error boundary分開治理。新增 targeted `2 files／10 tests passed` provenance；E2／E3維持`Partial／Open`，不新增產品debug state、history API、第二 history／layout store、global suppress、portal或其他技術債。
- 2026-09-01：補記本輪文件／靜態 gate：`git diff --check`、`npx tsc --noEmit --pretty false`、`npm run build` 均通過；Vite extension／chunk-size advisory 維持 tooling 分類，不改產品契約或 E3 判定。

- 2026-09-01：補上第26.21.8節 E1 CDP native transport capability probe。以全新 B16 fixture `draft-011e0e3a-d7ca-4b00-9b35-a481d9bf8c5c`、canonical `/`、`1280×720`、Chromium `149.0.0.0`及 task-owned `127.0.0.1:5080`，確認 ProcessNode source／Duty target owner geometry與strict MIME target可命中；CDP只能觀察到注入資料的 `dragenter／dragover`，未建立可採用的真實 source `dragstart`／product `drop`，API前後 revision與既有 process link不變。fixture archive response `200`、final manifest revision `8dbcc25d675cbf42bce7862918e8160233cfa5b3d89ded4772df1dba541d8101`，5080 runtime／listen port已cleanup（user-owned 5000 PID 23840保留）。依保守判定，E1 ProcessNode↔Duty仍`blocked／not-run`、E1 aggregate仍`Partial／Open`；本輪只新增 evidence provenance，不新增dependency、synthetic product path、MIME／resolver／mutation owner、schema、API、global listener或fallback。
- 2026-09-01：補上第26.21.20節第二次 E1 strict-runner capability probe。以全新 B16 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b`重演 owner geometry；Process source／Duty target可由產品 DOM 命中，但 Chromium CDP `Input.setInterceptDrags`、原生滑鼠路徑與最小 HTML5 probe仍未取得可採用的`dragstart→dragover→drop`／strict `DataTransfer.types`。沒有 synthetic event、API直寫或domain mutation；fixture archive response=`200`、final manifest revision=`99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`，5080已清理、5000（PID 23840）未觸碰。E1 ProcessNode→Duty維持`blocked／not-run`、paired Duty→ProcessNode維持`not-run`，後續停止同類runner重試，除非取得新的可讀取真實`DataTransfer` harness；不新增第二輸入路徑、resolver、mutation owner或證據清冊。

- 2026-09-01：完成第26.21.7節 E2／E3 final stability rerun。以隔離 fixture `draft-dbdd513f-a15b-4297-a4f5-819a4f08d80c` 重跑五案 E2 加 `E3-LIFECYCLE`，結果 `6 passed (34.4s)`；archive final manifest revision `e647287fd737dbf35e185ce081a1351b92bced7352ea10e06e370867cbf03e76`，5080 runtime與port已cleanup。capability-loss re-entry 的 runner准入改以 persisted `processLinkIds` readback，toast僅保留為觀察資料，避免短暫通知時序造成假陰性；產品契約、資料模型、resolver、MIME、mutation owner、schema與第二輸入路徑不變。E2 aggregate仍`Partial／Open`、E3-LIFECYCLE個案`pass`、E3-WARNING／E1 native／E4仍開放。

- 2026-09-01：完成 DEV-039 現行文件一致性稽核。修正第26.13.1、26.16節及四方索引中仍把 E2 re-entry／409 或 E3 standalone／reveal 寫成「待補」的舊摘要；現行判定統一為 E2 五案 browser record 已補齊（僅嚴格 history-length 未直接暴露）、E3-LIFECYCLE 個案 `pass`（E3 warning／正式 QA-QC仍 open），E1 ProcessNode↔Duty native `blocked／not-run`、E4 `Blocked`。本次只做文件來源與狀態收斂，不修改產品契約、資料、測試、dependency、runtime、commit、merge、deploy或release。

- 2026-09-01：補上第26.21.3節 E2 listener lifecycle／owner cleanup rerun。以隔離 fixture `draft-e85b3c44-0c70-4cb1-baf2-16f2bbdf9fae` 重跑四案，結果 `4 passed (22.6s)`；新增最小 browser listener probe，確認四案 document capture `keydown` 均由 placing 的 `1` 回到 baseline `0`，並保留 assignment／relation zero-mutation、history／Undo、dirty／autosave、focus與fixture cleanup evidence。修正 `App.tsx` owner-driven lifecycle effect：source／target 所屬 surface 或 drawer 關閉即呼叫既有 `cancelRelationPlacement()`，不新增 listener、resolver、MIME、mutation owner、store、schema或第二輸入路徑。archive final manifest revision為`4ab018e15bbcc319f8cbc13139147670eaaaaa5a8375b8bb27ecf6fe6164a5c2`，5080 runtime與port已cleanup；E2仍因重新editable與409/recovery欄位未完整維持`Partial／Open`，E1／E3／E4判定不變。

- 2026-09-01：補上第26.21.1節 `E2-INVALID` fresh browser record，並同步 parity第16.15節、evidence manifest、dev_task與documentation_map。以同一 B16 fixture 執行 Employee→ProcessNode 不相容 pair，取得既有 capability gate 的 visible fail-closed、source focus recovery、API `200`、hydrated→after relation／process-link IDs與revision zero-mutation、產品 diagnostics `[]`；因runner未輸出 dirty／history／autosave欄位，單案標`partial`，E2 aggregate與E4不提升。另修正 `scripts/dev039-s7-fixture.mjs` 的dev identity headers與Windows CLI entrypoint判斷，讓fixture prepare／cleanup可重演；未新增resolver、MIME、mutation owner、輸入路徑、schema或資料模型。

- 2026-09-01：補上第26.21.2節 persistence／history probe rerun。以隔離 fixture `draft-67c6e1cc-6e2d-4f7e-be9b-bfd32840e41f` 重跑 `e2-admission.pw.ts`，四案結果 `4 passed (20.0s)`；assignment／duty relation／process link均與hydrated baseline相同，四案操作前後既有「儲存與備份」均為「已自動保存到電腦」，E2-INVALID另完成有效 Employee→Position配置後單次`Control+Z`還原，並在開啟 persistence menu 前取得拒絕後焦點（`BUTTON`／`指派B16 無任職員工至組織職位`／`employee-dev039-b16-unassigned`）。fixture archive response `200`、final manifest revision為`434adf105d33a8acc9486ab20507a85af047a6195b9d510075426ad6e05ffd2c`，5080 runtime與port已cleanup；完整history／listener／重新editable／409 recovery欄位仍開放，E2 aggregate維持`Partial／Open`，不改E1／E3／E4判定。

- 2026-08-31：補上第26.21節 E2 failure-path fresh browser observation，並同步 Parity 第16.15節、evidence manifest、dev_task與documentation_map。以同一 B16 fixture取得 `E2-COMMIT-REJECT`、`E2-CAPABILITY-LOSS`、`E2-UNLOAD` 的 visible result、focus／session cleanup與 hydrated-baseline zero-mutation；新增 typed source payload focus recovery 只屬既有 App lifecycle 窄修正。`E2-INVALID`、完整 dirty／history／autosave／listener inventory與 E1 ProcessNode↔Duty native仍開放，E2 aggregate與E4狀態不變；未新增 resolver、MIME、mutation owner、補償 store、schema或第二輸入路徑。

- 2026-08-31：校正S7 continuation gate的冷啟動指令：native runner admission已完成並記為`blocked／not-run`，後續不得重複同類工具嘗試；下一個可執行優先序改為補`E2-INVALID`與完整failure schema、再補E3 listener cleanup，只有取得可讀取真實`DataTransfer`的runner才重開E1 ProcessNode↔Duty。同步2.1節、dev_task、documentation_map與evidence manifest；不新增產品契約、輸入路徑或證據格式。

- 2026-08-31：修正E2 Playwright evidence helper的截圖輸出路徑，改由`import.meta.url`解析至`output/playwright/dev039`，避免runner工作目錄造成巢狀output；既有三張截圖已移回canonical位置，未修改產品程式、測試契約或判定結果。

- 2026-08-31：完成S7 Playwright runner admission fresh attempt。以task-owned `127.0.0.1:5080`、Chromium `149.0.7827.55`、`1280x720`、canonical `功能→流程規劃→在工作台開啟`及B16 fixture重演ProcessNode source→Duty target；source／target皆在可見owner panel，但`locator.drag_to`與pointer path未產生`dragstart／dragover／drop`或strict `DataTransfer`。API `200` readback確認未新增Process link，fixture已recoverably archive，runtime／port已清理；依第26.15.1節判定`E1-PROC-DUT-NATIVE=blocked`、paired `E1-DUT-PROC-NATIVE=not-run`，不把runner限制改寫成產品故障或native pass。同步Parity、dev_task、documentation_map與evidence manifest；未修改產品契約、schema、dependency、resolver、mutation owner、commit、merge、deploy或release。

- 2026-08-31：新增第2.1節 S7 continuation gate，固定E1～E4目前狀態、下一個可執行動作、runner blocked處置與無技術債擴張守則，讓後續RD／QA／QC可由單一入口接續；不新增產品契約、資料模型、resolver、mutation owner或證據格式。

- 2026-08-31：補上第26.13.1節的「自動化覆蓋與瀏覽器 evidence 邊界」表，將E2-INVALID／UNLOAD／CAPABILITY-LOSS的測試覆蓋與完整瀏覽器必要欄位分開；E2-COMMIT-REJECT明確標為條件式補充，不增加產品狀態、資料模型或輸入路徑。

- 2026-08-31：文件現行摘要收斂：將幾何窄修正前的 `656 tests` 明確標為歷史基線，現行數字與判定統一以第26.15～26.18節為準；不改寫歷史證據、不改產品契約。

- 2026-08-31：補上E1 native runner admission與環境邊界（第26.18節），固定canonical入口、可見owner geometry、strict MIME事件鏈及blocked／not-run判定；工具能力不足時不得以synthetic event、API直寫、style補位或第二輸入路徑取代產品證據。

- 2026-08-31：依最新 `localhost:5000` B16 分割版面量測補上第26.17節 Process canvas 幾何／生命週期窄修正契約。記錄 graph panel 約 `360×206px`、canvas 約 `358×390px`、React Flow root 約 `637.5×617px`及 source handle 超出可見範圍；新增 `E3-GEO-STANDALONE／SPLIT／REVEAL／RELOAD` 窄測試與 Process native 重跑條件。同步 parity 第16.10節、dev_task、documentation_map、ADR-009及 evidence manifest；不新增 resolver、MIME、mutation owner、layout state或第二套 evidence schema，E1／E2／E3仍維持open。

- 2026-08-31：完成 Process canvas 幾何／lifecycle 窄修正實作與瀏覽器重驗。`min-width／min-height:0`、正常文件流、兩個 animation frame 後單次 `fitView` 及 observer／rAF cleanup 已落在既有 Process surface；同一 B16 split fixture 量得 graph panel `276.1875×536px`、mindmap canvas `274.1875×224px`、兩個 source handle 均在 canvas／panel 內、canvas／React Flow 無 overflow，reload／flow console `0/0`。新增 artifact `F039-S7-E3-process-geometry-after-fix.png`；本輪只關閉 `E3-GEO-SPLIT` 與 reload／flow 幾何觀察，standalone／reveal／listener cleanup、Process native strict MIME／API、E2 failure仍開放，S7維持`QA-QC Reopened`。

- 2026-08-31：補記短高度 split panel 的 editor saturation follow-up。以既有 `process-planning-canvas` `min-height:180px; flex:1 1 180px` 保護 canvas 不被 node／inline／edge editor 壓成零高度；B16 live geometry 量得 graph panel `342.7625×212.3`、canvas `325.9625×180`，relation handles 約 `17.303×17.303` 且 `elementFromPoint` 命中產品 button。artifact為`F039-S7-E3-process-canvas-min-height.png`；只關閉短面板零高度的幾何 observation，不改 layout／relation契約，E3完整lifecycle、E1 Process native、E2 failure與E4 freeze仍開放。

- 2026-08-31：完成S7 native runner availability decision。task-owned Playwright `dev039-e2`、In-app Browser CUA與Chrome extension CUA在canonical B16 split中均確認source／target owner geometry與strict MIME元件存在，但未產生可採用`dragstart → dragover → drop`／`DataTransfer.types`；Chrome browser-client先回傳無可連線tab，後建立隔離分頁重跑仍無native事件；本輪無產品mutation／console error。另觀察keyboard placing後切換現行版會離開placing狀態，但缺API／revision／zero-mutation完整record。依第26.18～26.19節將ProcessNode↔Duty native維持`not-run`、E1 aggregate維持`Partial／Open`，停止重複同類工具嘗試，不新增synthetic path、第二resolver、API直寫或產品fallback；本輪只更新文件與證據邊界，未commit、merge、deploy或release。

- 2026-08-31：新增 `ProcessPlanningCanvas.lifecycle.test.tsx` 的受控 lifecycle coverage。測試固定可見 surface 兩 frame 後單次 `fitView`、unmount `ResizeObserver.disconnect`、隱藏 surface pending rAF cancellation 與不執行 fit；與 `F039-S7-E3-lifecycle-iab.png` 的 standalone／reveal／reload 瀏覽器 observation 合併記錄。此更新只補 E3 自動化子項，不把工具缺少 listener inventory 誤升級為 E3 aggregate pass，狀態維持 `E3-LIFECYCLE=Partial／Open`。

- 2026-08-31：補上第26.16節「現行證據優先序與文件同步規則」，將第26.13～26.15節定義為S7目前的派工、record契約與最新逐案來源；歷史26.9～26.12及較早manifest僅作provenance。同步固定E1～E4現行狀態快照與新增證據的單向更新順序，避免單案pass或工具限制被誤升級為aggregate完成；本輪只修改開發文件與evidence索引，未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：繼續升級DEV-039 S7開發文件，新增第26.14節 evidence record schema、保守狀態判定順序與E1～E4 closure-level gate；固定before／after revision、dirty／history／autosave、strict MIME、API readback、console與cleanup欄位，並限制新增runner只能位於scripts／測試目錄，不得形成第二resolver或mutation owner。本輪只修改文件與evidence contract，未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：補記 Chrome CUA fresh observation：Employee→Position native DOM mutation、same-target noop及Duty→Process invalid＋Escape cancel均可在B16 draft觀察；因本次仍未獨立取得strict `dataTransfer.types`、同操作API／revision readback、target unload／capability-loss及E3 warning時序，S7維持`Relation Placement Implemented / QA-QC Reopened`。瀏覽器擴充套件message-channel錯誤與產品console判定分離；本輪只更新文件與evidence manifest。

- 2026-08-31：校正現行文件索引，將S7 closure的活動引用統一至第26.13節／parity第16.6節，並補記最新targeted `7 files／34 tests`與aggregate `159 files／656 tests`自動化基線；歷史節不改寫，native／failure／warning仍維持開放。

- 2026-08-31：將S7剩餘收斂整理為第26.13節 `E1-NATIVE → E2-FAILURE → E3-WARNING → E4-FREEZE` RD execution packet，固定owner、允許修改範圍、命令、artifact欄位、cleanup與stop conditions；不改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：以`npm test -- --run --pool=forks --maxWorkers=1`重跑DEV-039全量回歸，`159 test files／656 tests`通過；前次平行worker timeout於低併發重跑後不再重現。同步26.11.1與evidence manifest，保留native／failure／warning closure未完成狀態；本輪未修改產品程式或測試設定。

- 2026-08-31：依最新fresh CUA結果完成S7文件收斂。將早期B16 native嘗試與目前可關閉證據分層，明確標示CUA未觸發`dataTransfer`為`Not proven`而非產品pass；新增第26.12節`E1 Native delivery → E2 Failure paths → E3 React Flow warning → E4 Candidate freeze`，固定browser harness、failure／focus／zero-mutation、warning時序與candidate freeze條件。同步要求後續只沿用既有`RelationPlacementSession`／resolver／target adapter，不新增DnD dependency、第二mutation path或第二證據清冊；本輪只修改開發文件，未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：完成S7-PROC-01窄接線與B16 ProcessNode↔Duty雙向native驗證。`ProcessDutyBridge`新增strict MIME Duty targets與App preview／commit props；B16以`process-duty-2`（ProcessNode→Duty）及`process-duty-4`（Duty→ProcessNode）建立canonical link，duplicate為noop，並補1024×768 editable與390×844 readonly spot-check。targeted `2 files／9 tests`、full regression `159 files／656 tests`、typecheck、build、source scan與diff check通過；fresh QA-QC、完整viewport matrix與正式auth仍待收斂，狀態更新為`Relation Placement Implemented / QA-QC Reopened`，未commit、merge、deploy或release。

- 2026-08-31：依B16 loopback結果繼續升級S7開發文件。新增第26.10節`S7 Remaining implementation package`，把唯一未閉合的ProcessNode→Duty native缺口定位為`ProcessDutyBridge`的Duty target wrapper與preview／commit窄Props接線，並固定S7-PROC-01～S7-CLOSE-04的派工、驗收、證據與停止條件；同步要求沿用既有resolver／command，不新增架構。狀態維持`Relation Placement Partial Evidence / QA-QC Reopened`，本輪只修改文件，未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：完成S7實作與文件一致性稽核。確認S7-5 aggregate／source-policy、targeted `6 files／28 tests`、full regression `159 files／655 tests`、typecheck、build、source scan與diff check已通過；修正文件將AR-12／AR-13標示為「實作與自動化Gate完成、B16 native／keyboard fresh evidence待驗證」。補記runtime preflight：frontend 5000可達、workspace index API 503，auth-configured backend未能在8080 listen，未建立fixture或寫入資料；恢復條件與B16操作邊界維持不變。

- 2026-08-31：依目前DEV-039實作進度同步文件狀態為`S7 RD In Progress（relation core＋B16 fixture harness） / QA-QC Reopened`。已完成`relationPlacement.ts` pure session reducer、typed effect／capability解析、`App`唯一協調器與single commit boundary、Employee／Duty／Process source handle與registered target接線、舊Employee／Duty平行state與legacy MIME／未使用檔案移除、Process workbench composition harness、source-policy regression及task-owned B16 fixture CLI／pure transformer。relation／component／fixture targeted `6 files／28 tests`、full regression `159 files／655 tests`、build／typecheck與source scan通過；B16實機、fresh native browser evidence與QA／QC仍待完成，因此不宣稱S7或DEV-039完成；本輪未commit、merge、deploy或release。

- 2026-08-31：依使用者要求繼續升級S7開發文件，完成Implementation Readiness Review。選定`App`為唯一Relation Placement owner、`relationPlacement.ts`為pure reducer，固定exact file／symbol、capability與single commit dispatcher；建立S7-0～S7-5遷移順序、舊Employee／Duty state與MIME／CSS deletion allowlist、targeted／aggregate命令、source-policy及task-owned B16 fixture／cleanup／browser evidence。P0／P1 readiness缺口為0，狀態升為`S7 RD Implementation Ready / RD Not Started / QA-QC Reopened`；本輪只修改開發文件，未修改產品程式、測試、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：繼續將S7由Brief升級為`RD Contract Ready / RD Not Started`。補齊canonical UI Entry、source handle／visible target／明確解除區、state transition與single-commit、Employee取代／Duty主執行移轉等結果語意、Data／API／Permission／Dependency不變、failure recovery、Execution Boundary、四項新增acceptance及representative fixture／evidence layers。沒有待人類產品決策；exact repo／symbol migration、test命令與B16 executable fixture留待使用者要求開發後的Implementation Readiness Review。本輪只修改開發文件。

- 2026-08-31：依使用者要求以第一性原理重新界定跨panel拖曳：真正能力是「Relation Placement」，native drag與keyboard只是兩種輸入。新增S7 Brief、`RelationPlacementSession`唯一生命週期、same resolver／same mutation authority、Employee／Duty／Process registered語意、AR-12～AR-13、native evidence boundary與candidate freeze刪除平行state條件；既有`F039-REL-01`降為keyboard baseline，整體狀態更新為`S0～S6 Historical Complete / S7 Brief Ready / Implementation Not Requested / QA-QC Reopened`。本輪只修改開發文件，未修改產品程式、測試、dependency、資料、API、commit、deploy或release。

- 2026-08-30：依使用者「升級至RD可開發」完成S6 Implementation Readiness Review。固定`WorkspaceOverlayHosts` exact exports、`WorkspacePortal` fail-closed語意、ListDetail／ListOnly Props、App的Organization／Master Data owner factories、Duty三view panel mode、Management Method與Duty overlay分類、host-local anchored positioning、CSS container／source allowlist、S6-0～S6-5遷移、failure recovery及B14～B15 exact fixture／Fail條件。P0／P1 readiness缺口為0，狀態升級為`S6 RD Implementation Ready / RD Not Started / QA-QC Reopened`；本紀錄保留為規格建立歷史。
- 2026-08-30：完成S6 Panel Boundary Hardening實作與複核。新增typed overlay hosts與surface primitives，將Organization／Master Data／Duty／Management Method／Risk的persistent surface與transient overlay收斂至明確owner；移除feature viewport-fixed selectors、App共享master-data detail與raw portal；新增8 files／21 tests targeted、154 files／631 tests full regression、build與diff policy gate，並以現有draft browser smoke複核Duty／Management Method／Role Risk owner與overflow。狀態更新為`S0～S6 Implementation Complete / QA-QC Passed / Local Release Gate Pending / No Release Requested`；未commit、merge、deploy或release。

- 2026-08-30：依RD主管架構盤查重新開啟S6 Panel Boundary Hardening。既有`LAYOUT-OWNERSHIP-01`只證明Duty configuration單一路徑；盤查另發現Duty audit／distribution仍使用viewport-fixed persistent detail、master-data共享detail存在跨module雙mount風險、Management Method Duty對照仍是viewport-fixed Drawer。新增第4.7、12.4、22.5、25.5、26.7節、`LAYOUT-OWNERSHIP-02`、`OVERLAY-SCOPE-01`、`STATE-OWNERSHIP-01`、`CONTAINER-RESPONSIVE-01`、B14～B15及AR-08～AR-11；ADR-009同步amend。狀態改為`S0～S5 Implementation Complete / S6 RD Contract Ready / RD Not Started / QA-QC Reopened`。本輪只修改開發文件，未修改產品程式、測試、dependency、資料、API、commit、deploy或release。

- 2026-08-30：修正工作職掌移到左下region後，明細仍錯誤顯示於左上組織架構region的跨panel所有權缺口。根因是`DutyDetailDrawer`固定掛載於`organizationSurface`；改由`DutyModuleAdapter`在configuration mode內組成清單＋明細，並以`adjacent-list-detail`保持正常文件流。新增`LAYOUT-OWNERSHIP-01`與adapter ownership regression；targeted `1 file／3 tests`、full `149 files／617 tests`、build及1900×960三panel browser geometry通過，明細`detailInsideDuty=true`、`detailInsideOrganization=false`，證據為`F039-QC-12-duty-detail-panel-ownership.png`。未commit、merge、deploy或release。

- 2026-08-30：修正split separator顯示resize游標但無法連續調整的缺口。根因是recursive render每次建立新的container ref；第一次pointer move更新layout後舊ref被清空，原native listener後續無法取得幾何。改由separator的React Pointer Events與pointer capture直接讀取目前父split，並於pointer up／cancel釋放；補`touch-action:none`、hover／active回饋與rerender regression。新增`LAYOUT-RESIZE-01`；targeted `1 file／5 tests`、full `149 files／615 tests`、build及1280×800實機連續拖曳通過，ratio由50%變為59%，證據為`F039-QC-11-split-resize.png`。未commit、merge、deploy或release。

- 2026-08-30：修正兼任風險直接型panel被舊版`.role-risk-panel`固定右側overlay規則覆蓋的缺口。以較高範圍選擇器將`role-risk-panel--workspace`鎖定為workspace內正常文件流，單獨開啟時填滿region，並保留外層split／tab負責並排尺寸。新增`LAYOUT-DIRECT-01`；977×698 route `?panels=role-risks&focus=role-risks`實機計算為`x=0`、`width=977`、`position:relative`、`regions=1`、無水平溢出，證據為`F039-QC-10-role-risk-standalone-page.png`。未commit、merge、deploy或release。

- 2026-08-30：依試用回饋提升工作台結構辨識。新增`--workspace-divider-color`與`--workspace-divider-strong-color`共用token，套用至chrome、Drawer、清單／明細、region tab、管理辦法panel action列及split separator；內文卡片、表格與表單控制項維持中性分隔線。新增`LAYOUT-SEP-01`；1440×900與390×844 browser visual／computed-style／overflow QC通過，證據為`F039-QC-07-blue-structural-dividers.png`及`F039-QC-08-blue-dividers-narrow.png`。未commit、merge、deploy或release。

- 2026-08-30：依實際試用修正共用主資料panel的幾何契約。原`34%`清單欄與Directory固定`242px`內容寬度不一致，造成清單右側空白、明細被推遠；改為固定Directory欄寬（桌面／窄桌面`242px`、`690px`以下`190px`），並以adapter高優先級覆寫窄版Inspector的絕對定位，確保清單與明細由左至右相鄰。員工、職位、部門套用`data-layout="adjacent-list-detail"`相鄰規則；層級使用同adapter但明確標示`list-only`並維持單欄。新增component order regression。targeted `4 files／12 tests`、full `149 files／614 tests`、`npm run build`、1440×900／1024×768及390×844 browser geometry／visual QC均通過；證據為`F039-QC-05-master-data-list-detail-adjacent.png`、`F039-QC-05-master-data-1024-adjacent.png`、`F039-QC-05-positions-list-detail-adjacent.png`、`F039-QC-05-departments-list-detail-adjacent.png`、`F039-QC-06-master-data-narrow-adjacent.png`。未commit、merge、deploy或release。

- 2026-08-28：完成DEV-039 final QA-QC。依第19、26節先做fail-seeking browser QC，發現`1023px`單一surface仍顯示pin／drag-grip，以及`390px`頂欄裁切`功能`入口；退回RD修正、補兩個component regression後重新驗證。Final targeted matrix `84 files／366 tests`、full regression `149 files／614 tests`、build、console 0 error／0 warning、desktop／1023／390 overflow與mutation absence均通過；證據為`F039-QC-01`～`04`及`output/playwright/dev039/manifest.md`。狀態升級為`RD Implementation Complete / QA-QC Passed / Local Release Gate Pending / No Release Requested`；未commit、merge、deploy或release。

- 2026-08-28：完成DEV-039 Current Phase RD實作收斂。建立`output/playwright/dev039/manifest.md`，以正常入口走過十模組與七個Drawer promotion，完成B1～B8、三條typed relation、1024／1023 responsive focus一致、390 mobile唯讀、current唯讀、reduced motion、recovery gate、damaged layout與legacy alias證據；修復Role Risk窄版仍顯示mutation及窄版focus未同步desktop active tab。移除prototype／simulator／duplicate canvas／legacy page-modal composition，source scan 0 matches；full regression `149 files／612 tests`與build通過。狀態改為`RD Implementation Complete / Local RD Gates Passed / Independent QA-QC Pending`；未commit、merge、deploy或release。

- 2026-08-28：依最新RD實作與browser walkthrough修改開發文件。狀態調整為`S1 Core Gates Browser-Proven / S2～S4 Partial Parity Evidence / F039 Consolidation Pending / S5 Not Started`；記錄十模組正常入口、initial organization-only network、hidden lifecycle、三region layout、pin、零panel、canonical reload／Back／Forward、layout／route修復、current／mobile唯讀、editable draft、Management Method dirty guard／focus與部分typed keyboard路徑等已觀察事實。同步把完成前工作收斂為持久化`F039`、完整relation／error矩陣、full regression及S5 allowlist／legacy removal；未宣稱QA／QC、merge、deploy或release完成。

- 2026-08-28：依RD主管架構審查同步實作事實。確認S1單一`WorkspaceShell`正常入口及S2～S4 typed adapters／部分relation wiring已存在，但所有slice仍缺逐項fresh parity closure，故狀態改為`S1～S4 Product Wiring Present / Parity Closure Pending / S5 Not Started`。新增`AR-01`～`AR-07`依賴方向、單一render／mutation／composition、bounded extensibility、lifecycle及safe replacement檢查；最新targeted `20 files／45 tests`通過，未宣稱full regression、browser QA／QC、legacy removal、deploy或release完成。

- 2026-08-28：依RD主管實作期審查更新真實狀態為`RD Implementation In Progress（S0 Complete / S1 Integration In Progress）`。確認workspace targeted `13 files／28 tests`與build通過；記錄S0完成、S1 primitives完成但App/canonical/recovery整合未完成、S2～S5待執行，並固定P0／P1 closure。將只被layout owner使用的`PanelRegion`收斂為`WorkspaceLayout.tsx` private component，避免無重用價值的公開抽象。未宣稱normal-entry、browser、QA／QC、removal、deploy或release完成。

- 2026-08-28：依RD主管架構審視完成契約收斂。以`WorkspaceModuleContextMap`統一十module exact ID、route／session context與discriminated promotion intent；registry改為純metadata/context authority，render只由typed adapter composition擁有，module capability仍沿用既有resolver。Panel close改為request／guard／`COMMIT_CLOSE_PANEL`兩階段並涵蓋Back／Forward；surface新增lazy first mount、hidden suspension、reveal及close cleanup契約。同步補上P0未保存buffer、P1 hidden background work的FMEA、acceptance、S0／S1／S4 tests及stop conditions。只修改開發文件，未改產品程式、測試、dependency、資料、deploy或release。

- 2026-08-28：完成Implementation Readiness Review並升級為`RD Implementation Ready / RD Not Started`。選定React＋CSS Grid/Flex有限自製split-tree/tab engine，不新增dependency；固定S0 workspace core、S1 shell/recovery、S2～S4 adapters、S5 legacy removal的實際檔案與symbol，補上client envelope validation、hydration／invalid current／failed draft／409 conflict wiring、pure reducer/effect boundary、React Flow provider isolation、exact targeted/full/build/browser command matrix及runtime cleanup。無待人類產品決策；本輪只修改開發文件，未改產品程式、測試、dependency、資料、deploy或release。

- 2026-08-28：由已確認Brief及feature parity manifest建立Current Phase RD Contract。固定canonical `/`、十模組registry、242px推移式Drawer、split-tree＋tab stack、minimum placement、URL／local／session三權威、promotion/pin、typed drag、global capability、workspace hydration/recovery、legacy alias、S0～S5與Medium-risk QA/QC。文件升級為`RD Contract Ready / RD Not Started`；未修改產品程式、測試、dependency、資料、deploy或release。
- 2026-09-01：完成 DEV-039 E1 paired Duty→ProcessNode strict native pass及正式 QA-QC。`ProcessDutyBridge` 只將 source `effectAllowed` 由`copy`對齊既有 target `link`；全新 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396`完成完整native event chain、strict MIME、UI成功結果、API `200`／revision變化／canonical readback與cleanup。E1四個 minimum directions、E2五案`historyEvidence`與E3兩案均完成正式 QA-QC；targeted component `3 files／19 tests`、full regression `160 files／664 tests passed／1 skipped`、typecheck、build、source scan與文件一致性均通過。狀態更新為`QA-QC Passed / E4 Candidate Freeze Ready / Authorization Pending`；未取得使用者／PM明確授權前，不commit、merge、deploy或release。
