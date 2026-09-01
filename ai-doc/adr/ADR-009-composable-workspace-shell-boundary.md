# ADR-009：可組合工作台UI Shell與領域權威邊界

狀態：Accepted / S0～S6 Amendments Implemented / S7 Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Committed / Merge Release Pending（2026-09-01）

> **2026-09-01 Candidate freeze commit override（現行）**：DEV-039 已依使用者授權完成 selective candidate freeze，commit=`86510f4`，僅含 DEV-039 exact allowlist 的 74 個檔案。其他 DEV、auth／DB／package／環境設定、混合未判定變更及 ignored evidence 均未納入；merge、deploy、release 仍需另行授權。本段優先於下方較早的 E4 pending 描述。

> **2026-09-01 E1 paired strict native／QA-QC amendment（現行）**：`ProcessDutyBridge` responsibility lane source 的 HTML5 `effectAllowed` 由 `copy` 對齊既有 target 的 `link`；不新增 MIME、resolver、Command、API、state、listener或第二輸入路徑。全新隔離 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396` 以 canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`及真實滑鼠路徑完成 Duty→ProcessNode，取得完整 `dragstart→dragenter／dragover→drop→dragend`、strict `application/x-orgmaster-entity`、`effectAllowed=link`／`dropEffect=link`、UI成功結果、API `200`／revision變化與canonical `process-duty-2` readback，既有 link保留；artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`，archive manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`，task-owned 5080已釋放、5000未觸碰。連同 Employee→Position、Duty→Position、ProcessNode→Duty三筆既有strict record，四個 E1 minimum directions均為`pass`；E2五案`historyEvidence`與E3兩案亦已覆核，正式 QA-QC通過。E4僅因尚未取得使用者／PM明確授權而維持`Candidate Freeze Ready / Authorization Pending`，不代表commit／merge／deploy／release。權威細節見主spec第26.21.25節、Parity第16.15.21節與evidence manifest QA-QC段落。

> **2026-09-01 desktop viewport extension（現行補充）**：同一 shell／single placement owner與既有 relation contract 以 evidence-only runner 補驗 `1440×900`、`1024×768`；兩案均通過正常入口、完整 native event chain、strict MIME、UI／API readback、`diagnosticsCount=0`與 cleanup。這只補足 viewport acceptance，不增加 shell、resolver、Command、MIME、state或第二 evidence manifest；record與截圖索引見主spec第26.21.26節。`1024×768` archive manifest revision因compact output未輸出而保留`null`，不作推測；E4仍為 `Candidate Freeze Ready / Authorization Pending`。

> **2026-09-01 evidence amendment（歷史中間快照）**：S7 E2 五案已以 `historyEvidence` 行為性 Undo round-trip 完成 `7 passed` 合併 runner（含兩案 E3），當時 E2／E3 evidence可標為 `Pass（evidence）`／`pass`，E1 paired direction、正式 QA-QC與E4 freeze仍開放。後續 E1 paired strict record與正式 QA-QC已由最上方現行 amendment補齊；本段只保留證據判讀演進，不改 single App owner、既有 resolver／Command、資料模型或保存 authority。

> **2026-09-01 E1 strict native 單方向 amendment（歷史中間快照）**：在 ProcessNode source handle 的 pointer／mouse capture與 App deferred placement begin 窄修正後，全新 B16 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673` 已取得 ProcessNode→Duty 的完整 native event chain、strict `application/x-orgmaster-entity`、明確儲存後API `200`／revision變化與canonical `process-duty-2` readback；artifact=`output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json`。此 amendment 只將 `E1-PROC-DUT-NATIVE` 標為單方向 `pass`，當時 paired Duty→ProcessNode仍`not-run`；後續 paired strict record與四向 aggregate見最上方現行 amendment。一次性runner已移除，不改 single App owner、resolver、Command、資料模型或保存 authority。

> **2026-09-01 E1 paired reverse boundary amendment（歷史中間快照）**：全新 B16 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`沿用 canonical 入口與既有 `RelationPlacementSession`，從`duty-dev039-b16-primary / primary-execute`拖至`process-node-dev039-b16-open`；source／target geometry成立，觀察到`dragstart／dragenter／dragover／dragend`與 strict `application/x-orgmaster-entity`，但 Chromium 原生滑鼠路徑未產生 terminal `drop`，UI未成功建關係，API status=`200`且revision／既有link IDs不變。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`，fixture archive manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`，5080已釋放、5000未觸碰。此 amendment 將 `E1-DUT-PROC-NATIVE`於當時記為`blocked／not-run`；後續 strict pass與四向 aggregate見最上方現行 amendment。除非未來契約再次變更，停止同類重試，不新增 synthetic fallback、第二 MIME／resolver／mutation owner或第二證據清冊。

日期：2026-08-28

決策來源：`USER-2026-08-28-COMPOSABLE-PLANNING-DESKTOP`、DEV-039 Human Decision Round 1～4、`USER-2026-08-28-DEV039-ALL-CURRENT-FUNCTION-PARITY`、`USER-2026-08-30-STABLE-PANEL-OWNERSHIP-ARCHITECTURE`、`USER-2026-08-30-DEV039-S6-IMPLEMENTATION-READY`、`USER-2026-08-31-NATIVE-CROSS-PANEL-RELATION-PLACEMENT`、`USER-2026-08-31-FIRST-PRINCIPLES-RELATION-PLACEMENT-ARCHITECTURE`

適用範圍：OrgMaster新版頂部module入口、Drawer promotion、panel composition、layout persistence、URL context、shared selection、pin與跨panel typed relation placement。

關聯決策：ADR-002（版本工作區）、ADR-006（Duty relation authority）、ADR-008（Process與OrganizationDocument V7單一權威）。

## Context

OrgMaster已累積組織圖、五種Directory、Duty配置、責任盤點／分布、Process雙視角、Management Method、Role Combination Risk與Governance等功能。持續為每種管理問題新增固定完整頁面或固定左／中／右composition，會讓相同資料出現多套入口、selection、filter與關聯操作；另一方面，完整Windows式浮動桌面對目前小公司使用情境又過度複雜。

使用者已確認希望從頂部按需開啟功能、Drawer快速找資料、promotion到同一完整工作台，自行選擇要比較的面板；第一版每種panel只有一份、預設只開organization、允許零panel、layout只存在目前瀏覽器、pin隔離panel context，typed drop只建立已登錄關係。最新決策要求Current Phase保留全部現有功能，不得以新版面為理由遺失兼任風險、治理或其他既有能力。

本決策的核心不是選一個dock套件，而是固定UI組合權威與domain authority的分界，避免新版workspace成為第二套資料或保存系統。

2026-08-30後續盤查證明「panel已存在」不等於「panel邊界已被強制執行」：Duty audit／distribution仍可透過viewport-fixed `DutyDetailDrawer`越過region，Employee／Position／Department的共享detail ReactNode存在被organization與master-data兩個surface同時掛載的瞬間風險，Management Method的Duty對照仍是viewport-fixed Drawer。逐一增加高specificity CSS只能修正目前畫面，無法阻止下一個feature再次越界。因此本ADR新增Panel Surface Ownership amendment，將panel從視覺外框升級為persistent surface、state與overlay的工程所有權邊界。

2026-08-31試用與證據盤查再顯示「已有typed MIME、resolver及keyboard path」不等於原生跨panel關聯配置已可使用。現況分散存在employee native drag、employee keyboard drag與Duty drag等短生命週期state，若只在外層再加一個drag coordinator，會形成同步責任與第二套判斷。第一性原理下，真正的產品能力是把typed source放置到合法target並形成既有domain relation；native drag與keyboard只是輸入方式。因此本ADR新增Relation Placement amendment，以單一session、單一resolver與單一mutation authority治理所有已登錄關係。

## Options considered

### Option 1：保留各模組固定頁面，持續新增預設視角

實作風險最低，現有頁面可分別演進；但跨模組規劃仍要來回切頁，selection與relation entry持續重複，新增每個管理視角都會擴大route與composition數量。

### Option 2：完整Windows式浮動桌面

面板可任意重疊、最小化、最大化及多實例，彈性最高；但視窗遮擋、z-index、focus、RWD、keyboard與保存複雜度遠高於目前需要，也會誘使產品先做通用桌面而不是管理任務。

### Option 3：受控split-tree＋tab stack的可組合工作台

每個module一份panel，使用者可分割、調整大小、換位或放入同區tab；空間不足時不再切出不可用小格。頂部launcher與Drawer promotion提供一致入口。layout／focus／pin與domain完全分離，跨panel relation只呼叫既有Command。

### Option 4：先建立plugin SDK／任意第三方面板runtime

長期擴張性最高；但Current modules、capability、selection與relation registry尚未經真實使用穩定，先做plugin contract會固定錯誤抽象並放大權限及資料旁路風險。

## Decision

採Option 3：OrgMaster以單一canonical `/`作可組合工作台，使用受控split-tree＋tab stack；不採任意浮動、同類多實例或plugin runtime。

### UI shell authority

- 頂部單一launcher擁有module發現與開啟入口。
- Organization、Role Risk、Governance直接加入／聚焦panel；Employee、Position、Department、Level、Duty、Process、Management Method先進快速Drawer，再promotion到panel。
- 每種module只有一個panel，`panelId`等於`moduleId`；同類再次開啟只focus／reveal。
- Region使用tab stack；空間足夠時可split，minimum不足則加入focused stack，不自動壓縮成不可用格子。
- Panel可全部關閉；零panel時shell與launcher仍存在。第一次進入或恢復預設只開organization。
- Panel內若同時有清單與明細，採共用`adjacent-list-detail`投影，由左至右固定為`清單 → 明細`；清單欄沿用Directory密集寬度（桌面／窄桌面`242px`、`690px`以下`190px`），明細緊接其右，不受全域窄版Inspector絕對定位規則影響。此為panel內CSS projection，不新增workspace split node，也不改變Process三欄語意。
- 直接型panel（包含兼任風險）在workspace region內採正常文件流並填滿分配區域；單獨開啟時可成為完整工作台頁面，並排時只由外層split／tab決定尺寸，不得沿用舊版固定右側overlay。
- 工作台結構分隔線由共用CSS token辨識：一般結構線使用`--workspace-divider-color`，可操作split separator使用`--workspace-divider-strong-color`；只套用於chrome、Drawer／工作區、清單／明細、region tab與panel action邊界，內文卡片與表格仍維持模組中性色。

### Panel Surface Ownership amendment（2026-08-30）

每個`WorkspacePanelFrame[data-module]`是該module的唯一persistent render、selection context與panel-scoped overlay邊界。可見surface只分三層：

1. `Persistent module surface`：清單、圖面、文件、設定、明細與editor，必須是owner panel的DOM子孫，以正常文件流或panel內grid／flex排列；禁止`position:fixed`、viewport單位定位或portal到`document.body`。
2. `Panel-scoped transient surface`：popover、短Drawer、章節導覽、局部menu與非全域blocking dialog，必須透過owner panel的`PanelOverlayHost`定位；不得越過panel、遮蔽其他region或形成第二個主畫面。
3. `Global transient surface`：只有跨workspace阻斷Modal、不可逆確認、toast、drag preview與全域recovery可進`GlobalOverlayHost`。Feature不得直接portal到`document.body`；global分類必須有明確理由與allowlist。

Panel內容只採有限surface primitives：圖形主物件使用Canvas surface、清單／明細使用ListDetail surface、長文件使用Document surface、單一設定或治理內容使用Single surface。這些primitive只擁有layout、scroll、focus與overlay slot，不包含domain query、mutation、permission或autosave。

`App`仍是dependency composition root，但不得同時掛載同一persistent detail到兩個module，也不得用全域`inspectorOpen`決定不同module的明細所有權。Panel-local selection及detail open state屬各module context／session；shared selection只傳遞stable `EntityRef`與revision，接收module可以highlight／reveal，但不能藉此把detail掛到source module或workspace root。

第一版仍維持`panelId === moduleId`單實例。未來multi-instance使用versioned `WorkspaceLayoutV2`另案處理；不得為本amendment加入UUID panel、service locator、generic event bus、plugin runtime或第二套business state。

### 三種UI state authority

- URL：open panel set、focus、shared selection及module semantic context，負責share／reload／Back／Forward。
- Browser local layout：split tree、ratio、tab ordering、active tab與visual-only state；不跨裝置，不進organization version。
- Session：Drawer、pin、單一Relation Placement Session及暫時focus；reload可清除或重建。

以上都不得保存或複製domain truth。

### Domain authority

- OrganizationDocument V7、Management Method store與Governance store/API維持各自active spec的唯一權威。
- Panel adapter只讀selector/projection並呼叫既有guarded Command、helper或API；panel之間不得直接修改彼此state。
- Layout drag只改browser-local UI state；Employee→Position、Duty＋lane→Position、Duty↔ProcessNode等typed relation placement只走registered resolver與existing authority。
- Layout／focus／pin／selection不產生domain history、dirty、autosave或CAS。

### Relation Placement amendment（2026-08-31）

- 核心能力固定為`typed source → legal target → DomainMutationIntent`；不得以pointer事件或HTML Drag and Drop API作domain contract。
- Native drag與keyboard共用一份短生命週期`RelationPlacementSession`，只允許`idle`、`placing(inputMode, payload, candidate)`與`committing(payload, target)`；生命週期統一為`beginPlacement`、`previewTarget`、`commitTarget`、`cancelPlacement`。
- Native `dataTransfer`只作strict `application/x-orgmaster-entity` transport；drop必須重新parse payload，並以latest canonical state與latest capability呼叫同一`resolveRegisteredDrop`。Hover、keyboard focus與commit不得各自建立validator。
- Session不保存domain truth、不執行mutation、不進URL、browser-local layout、OrganizationDocument、history、dirty、autosave或CAS。App composition root只把resolver產生的intent分派到既有assignment helpers或Organization Command。
- Current Scope只包含Employee list／panel→Position新增任職、Organization Employee→Position exact移轉、exact assignment解除、Duty＋lane→Position及Duty↔ProcessNode。Unsupported pair、same target、duplicate、invalid、cancel與capability loss全部fail closed且零domain change。
- Source名稱click仍負責選取／明細，只有列尾一致把手開始Placement；placing不自動開啟、切換、移動或分割panel。合法target只來自目前可見panel及registered resolver。
- 一般Organization畫布空白只取消；exact Employee assignment placing期間，只有owner panel內明確、暫時的解除區可產生`employee-unassign` target。取代現有人員、exact移轉、解除與Duty主執行移轉須在commit前顯示不同結果語意，不以逐次Modal打斷。
- Candidate freeze前必須刪除`employeeDrag`、`employeeKeyboardDrag`、`dutyDragState`或等效平行正常路徑；不得保留新舊owner長期同步。開發中只允許為分slice驗證而短暫共存。
- Current Phase不引入generic event bus、plugin registry、service locator、新DnD dependency、後端drag API、schema版本、permission語意、手機／touch編輯或第二save path。

### Compatibility

- 現行Duty、Duty Planning、Process Planning及Management Method routes可解析為workspace promotion intent，再收斂到canonical `/`。
- Compatibility alias不得render第二套legacy composition；正常入口parity通過前舊UI暫留於replacement branch，通過後依allowlist移除。
- 版本比較、standalone GovernanceSimulator、Management Method舊prototype、DEV-034歷史picker與DEV-038固定composition不復活；其仍有效的domain、check、projection與tests保留。

## Consequences

### Positive

- 使用者能依會議問題組合視角，不必等待產品為每種比較建立新頁面。
- 每個module仍只有一套domain與mutation owner，避免多面板造成雙寫或資料不同步。
- split與tab兼顧全貌與可讀性；小空間不會把所有panel等比例縮小。
- URL、local layout與session分工明確，分享語意不包含個人像素配置，organization version也不被UI偏好污染。
- 全部現有功能有單一parity/deletion gate，不會因intentional replacement靜默遺失。
- Relation Placement把native與keyboard收斂到相同規則與domain authority，避免每個模組各自修補drag判斷與狀態。

### Negative

- App shell、route、focus、keyboard與provider composition需要跨模組重整；完整回歸風險高於局部頁面調整。
- 同類panel不能同時比較兩個不同context；Current Phase以pin解決跨類比較，真正同類多實例延後。
- Browser-local layout不能跨裝置或使用者共享；URL只分享semantic composition，不分享精確ratio與scroll。
- Recovery、mobile readonly與legacy alias必須在shell層統一，否則任一漏接會造成全域false pass。
- S6需遷移既有viewport-fixed Drawer／raw portal並拆除雙重detail mount；短期修改面較逐一補CSS大，但完成後可用source policy與geometry gate阻止同類回歸。
- S7遷移期間需分批替換既有employee／Duty輸入state；若沒有candidate freeze與source scan，短期共存可能演變成永久雙owner。

## Implementation constraints

- Layout engine可使用符合契約的OSS dependency或現有React＋CSS自製；不得讓library schema成為產品/domain contract。
- 任一dependency必須支援React 19、controlled serialization、minimum sizes、tab/split、keyboard、reduced motion及nested XYFlow；不符合就改用有限自製engine。
- `DEV-039-feature-parity-manifest.md`每列取得fresh normal-entry evidence前，不得移除其舊surface。
- 正式runtime不保留feature flag雙模式、第二save path或hidden legacy editor。
- Persistent feature surface不得使用`position:fixed`、`100vw`／`100vh`或raw `createPortal(..., document.body)`。Panel-scoped及global transient surface只能分別透過受控host；host缺失時不得靜默fallback到`document.body`。
- Feature內部窄版行為以panel container為判斷邊界；workspace device／mobile mutation capability仍只由window／device環境決定。不得因桌面split把panel縮窄就誤判為mobile或升降權限。
- S6加入source-policy、DOM ownership及browser geometry gate；例外只允許列名、具理由的GlobalOverlay allowlist，不接受以selector specificity作永久豁免。
- S7目前為`Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Ready / Authorization Pending`；DEV-039第22.6、25.6、26.8節及第26.13.1節仍固定single App owner、pure reducer、exact repo／symbol、capability、runtime migration、舊state removal allowlist、S7-0～S7-5、targeted／aggregate test、B16 executable fixture與最小 failure／lifecycle case matrix。E1四個 minimum directions、E2五案`historyEvidence`與E3兩案均已由正式QA-QC覆核；full regression現為`160 files／664 tests（1 skipped）`，typecheck、build、source scan與runtime cleanup通過。E4不因QA-QC通過而自動執行，仍須使用者／PM明確授權。
- S7 evidence current override（2026-09-01）：第26.21.19節的五案 E2 與第26.21.17節的 E3-WARNING均已有可採用 evidence；第26.21.23節與第26.21.25節分別記錄 ProcessNode→Duty及paired Duty→ProcessNode strict native pass，E1 aggregate為`Pass（evidence）`；第26.21.26節另補`1440×900`與`1024×768` viewport extension evidence。本ADR的正式QA-QC已通過；E4仍為`Candidate Freeze Ready / Authorization Pending`，下方較早的`blocked／not-run`只作reverse runner provenance。
- S7 candidate freeze必須同時證明single placement owner、native／keyboard same resolver、latest capability revalidation及舊平行state source scan為零；不得以新coordinator包住舊state作最終架構。
- S7 RD handoff（2026-09-01）：E1-STRICT-NATIVE已由四個 minimum direction records完成，QA-QC-REVIEW已通過；下一個且唯一的工作包是`E4-CANDIDATE-FREEZE`，細節由主spec第2.4～2.5.2節擁有。E4只在使用者／PM明確授權後執行immutable commit／merge／release gate；若需新增DnD dependency、第二MIME／resolver／mutation owner、schema／API／permission、global listener或第二份evidence manifest，必須停止回PM。
- E4 scope preflight（2026-09-01）：`codex/dev-039-composable-workspace`目前HEAD為`ab5fe02`，`git status --short`有97筆狀態項目（`--untracked-files=all`展開為168檔），混合DEV-037／038／040／039；即使取得授權，也只能依主spec第2.4.1、22.6與25.6節 exact allowlist selective staging。不得整樹commit、不得為了清理候選版修改其他DEV檔案；無法判定歸屬的path先回PM。repo `.gitignore` 的 `output/*` 使 `output/playwright/dev039/**`維持本機證據，不得`git add -f`整批納入候選；若需可攜式證據另走release artifact gate。此邊界不改single App owner、resolver、Command、API或資料模型。
- 2026-09-01 second strict-runner provenance：全新 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b` 在 source／target geometry命中後仍未取得產品原生事件序列或 strict `DataTransfer.types`；API前後無 domain mutation，archive final manifest revision=`99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`。此結果只確認 runner capability blocker，維持 E1 aggregate `Partial／Open`、paired Duty→ProcessNode `not-run`，不授權新增第二輸入路徑或 fallback；主spec第26.21.20節擁有完整 record。

- 現行 aggregate regression 已由後續幾何窄修正、E2 fail-closed與Process canvas lifecycle test增補重跑為 `160 files／664 tests（1 skipped）`；上一行的 `656`、較早的`657`、`661`、`663`僅作前次 baseline。幾何 artifact、desktop viewport extension 與 E1～E4 現行判定以本ADR第3～5行及主spec第2.2～2.5.2、26.13.1、26.15～26.21.26節為準。

- Latest validation delta（2026-08-31，歷史摘要）：Process canvas 幾何窄修正後 split／reload／flow source handles 均位於 owner canvas 內且無 overflow，產品 console `0／0`；targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯三檔合併重跑 `3 files／18 tests`）、aggregate `160 files／663 tests`、typecheck、build與diff check通過。本輪新增E2 fail-closed與Process canvas lifecycle tests不改產品契約；E2／E3後續現行判定以第137行及主spec第2.2～2.4、26.21.17～26.21.21節為準。
- E2 coverage boundary（2026-08-31）：主spec第26.13.1節已明確分開自動化邏輯覆蓋與瀏覽器採用 evidence；pure／component pass不得替代visible failure、focus return、zero-mutation或真實target unload／capability-loss record。`E2-COMMIT-REJECT`僅為既有拒絕路徑可重演時的條件式補充，不改本ADR的mutation owner或recovery邊界。

- E1 runner admission沿用主spec第26.18節：先在canonical `/`與可見owner panel證明真實`dragstart → dragover → drop`及strict`application/x-orgmaster-entity`，缺少`DataTransfer`時記為`blocked／not-run`；不得用synthetic event、API直寫、style補位或第二輸入路徑取代產品證據。

- E1 latest evidence（2026-09-01）：ProcessNode→Duty與paired Duty→ProcessNode均已取得 strict native pass（完整 event chain、strict MIME、UI結果、API readback與cleanup），artifact分別為`F039-S7-E1-process-duty-native-strict.json`與`F039-S7-E1-duty-process-native-strict.json`；Employee→Position與Duty→Position既有strict單案record亦完成覆核。E1 aggregate為`Pass（evidence）`，完整欄位由主spec第26.21.23～26.21.25節擁有；desktop viewport extension records見第26.21.26節；一次性runner已移除，不形成第二輸入路徑或證據清冊。

### Panel ownership implementation amendment（2026-08-30）

S6 Implementation Readiness Review固定以下工程實現；本次已完成並以targeted／full regression、source policy與browser re-QC驗證，這是本ADR owner boundary的唯一Current Phase投影：

- `App`掛一個`WorkspaceOverlayProvider`，`WorkspaceShell`掛一個`GlobalOverlayHost`，每個`WorkspacePanelFrame[data-module]`掛一個`PanelOverlayHost`。`WorkspacePortal`是feature唯一portal入口，只有`WorkspaceOverlayHosts.tsx`可以import React DOM `createPortal`。
- `WorkspacePortal scope="panel"`解析最近panel scope；`scope="global"`解析唯一global host。Scope不存在時throw typed error，由既有panel error boundary或global recovery處理；host ref尚未註冊時暫不render。任何情況都不得fallback到`document.body`。
- ListDetail與ListOnly只抽成兩個共用surface primitive；Canvas、Document、Single仍由現有adapter直接投影，待第二個需要相同可驗證行為的consumer出現再抽象。Primitive只有layout、slot、scroll與container，沒有domain state或permission。
- Organization Inspector與Employee／Position／Department detail使用不同owner factory；移除可跨module重用的`selectedMasterDataDetail` ReactNode。Organization local selection不再被Master Data row handler直接開啟；shared selection只highlight／reveal。
- Duty configuration／audit／distribution共用Duty owner的ListDetail語意；`DutyDetailDrawer`增加panel正常流mode。Management Method章節、Duty對照與dirty-close進panel host；Duty anchored menu進panel host，兩個Duty drag preview進global host。
- Panel anchored overlay位置以anchor與host的`getBoundingClientRect()`換算成host-local座標並在四邊保留8px；不得讀寫workspace layout tree或把座標保存到URL／local layout／domain。
- Panel content建立named CSS container，但container query只調整欄位排列與可讀性。Mutation capability仍由`WorkspaceEnvironment`判定，沒有schema、API、layout envelope、localStorage、permission或dependency migration。
- GlobalOverlay allowlist只接受具名的workspace recovery／version workspace、App canonical mutation blocking dialog、layout notice／toast及drag preview；Position／Directory menu、Management Method章節／Duty對照及persistent detail不得列入。

實作順序固定為guard fixtures → hosts／surface primitives → persistent owners → typed overlays → CSS／source policy → candidate freeze與B14～B15。任一slice需要第二business state、generic event bus、plugin、multi-instance或domain/API變更時停止回PM，不以新增抽象通過Gate。

### Relation Placement implementation amendment（2026-08-31）

S7 Implementation Readiness Review把Relation Placement收斂為同一條可替換、可驗證的runtime路徑：

- `App`是唯一placement session與commit owner；只保留一個pure reducer、一個source focus ref及一個同步commit lock。Workspace layout／URL／local storage與OrganizationDocument不得保存placement session。
- `src/workspace/relationPlacement.ts`只處理`idle／placing／committing`、candidate snapshot、payload equality與auto-pan；`resolveRegisteredDrop()`仍是native／keyboard preview及commit的唯一registered rule，commit必須用latest canonical state與capability重算。
- `commitDomainMutationIntent`只分派至既有Employee assignment helper或Organization Command；relation schema、OrganizationDocument V7、API、permission、save／Undo／autosave authority均不變。
- Duty→Position的capability依來源模組判定：Duty module使用Duty configuration capability，Process module使用Process planning capability；Duty↔ProcessNode一律使用Process planning capability。來源模組不改變relation或domain authority。
- 新路徑依S7-0～S7-5逐條接通後，在同slice刪除舊Employee／Duty state、legacy Duty MIME／handler／CSS及未使用的workspace drag placeholder；不得以coordinator包住舊state形成永久雙owner。
- Candidate freeze必須通過pure／component／source-policy、typecheck、full regression、build，以及task-owned B16 native＋keyboard normal-entry fixture；fixture透過既有workspace API建立、檢查並recoverably archive，保留provenance與cleanup證據。fresh QA已補keyboard relation、no-op、cancel、reload、readonly及viewport／overflow；native HTML5 `dataTransfer`可重演證據、invalid／target卸載 failure evidence與console warning仍是必要條件。

若任一slice需要新DnD dependency、schema／API／permission、第二business state、generic event bus、plugin或未登錄relation，停止回PM；不得為通過S7擴張本ADR。

### Implementation amendment（2026-08-28）

Implementation Readiness Review決定Current Phase採現有React 19＋CSS Grid／Flex建立有限自製split-tree＋tab stack engine，不新增dock dependency，也不修改`package.json`或`package-lock.json`。理由如下：

- 產品只需要單一module panel、受控split、tab stack、ratio調整、minimum fallback與browser-local serialization；不需要浮動視窗、multi-instance、plugin SDK或server layout。
- 現有repo已使用React 19、nested React Flow及自有focus／capability規則；引入通用dock library會擴大provider、keyboard、schema migration與bundle驗證面，卻不增加Current Phase必要效用。
- `WorkspaceLayout`、`WorkspaceRegion`及其versioned local envelope維持OrgMaster自有型別；DOM與CSS只是projection，日後若真實需求觸發re-entry，可替換render engine而不改URL、domain或layout persistence contract。
- `PanelRegion`若只由`WorkspaceLayout`使用，應保留為同檔private component；不為形式分層建立沒有第二個consumer的公開檔案或抽象。只有出現獨立render owner、lazy boundary或可驗證重用需求時才抽出，且不得因此產生第二份layout state。
- 分隔線必須使用可鍵盤操作的`role="separator"`；tab stack使用標準tab semantics；1024px以下不render可變更split。詳細檔案、reducer、hydration與測試契約由DEV-039主規格第21～27節擁有。
- 十個module ID、route context、session context與promotion intent由同一個keyed context map約束。Module registry只擁有metadata與context parser／sanitizer；`WorkspaceModuleSurfaces` adapter composition是唯一render owner，既有module resolver仍是domain permission owner。不得讓registry同時render或重算權限。
- Panel close採兩階段：shell先request module close guard，只有所有guard允許後才commit layout／URL移除。Close、Escape後續離開及Back／Forward都不得繞過未保存內容保護，也不得先移除panel再嘗試補回。
- Surface採lazy first mount、active／hidden、committed close lifecycle。Hidden surface保留核准的module-local buffer，但停止只為可見畫面服務的poll、fit、observer與listener；committed close必須unmount並釋放資源。預設organization不得預先觸發其他module API或effect。

此amendment是工程選型，不擴張本ADR的產品能力；若RD發現有限自製engine無法在既定檔案與驗證邊界內滿足minimum、keyboard、reduced motion或nested XYFlow，必須停止回PM，不得臨時加入未評估dependency或把library schema升成產品權威。

### Implementation checkpoint（2026-08-28；S6 closure 2026-08-30；S7 reopened 2026-08-31）

目前branch已建立有限自製engine、單一`WorkspaceShell`正常入口、typed surface adapters及registered relation wiring；S6再完成persistent owner、typed overlay host、selection isolation與container policy，並通過targeted／full regression、build與browser re-QC。這些事實支持Option 3可行，不需要改選浮動桌面或引入dock dependency。S7盤查後完成`relationPlacement.ts` pure session、App唯一協調器、typed effect／capability path、Employee／Duty／Process source／target接線、舊平行state移除、Process composition harness與B16 pure fixture，並通過relation／component／fixture targeted、full regression（前次 baseline `159 files／656 tests`；現行 `160 files／663 tests`見本ADR第137行）、typecheck與build；新增E2 fail-closed與Process canvas lifecycle tests不改產品契約；fresh QA已補keyboard、no-op、cancel、reload、readonly及viewport／overflow，但native HTML5 `dataTransfer`、invalid／target卸載 failure evidence與React Flow warning仍待收斂；此缺口以Relation Placement amendment局部重開，不回退S0～S6完成狀態。

S7 execution checkpoint（2026-08-31，歷史紀錄）：以task-owned Vite `127.0.0.1:8080`、Playwright `dev039-s7`、Chromium `HeadlessChrome/151.0.0.0`、viewport `1280×720`及loopback dev identity（`urn:orgmaster:dev`／`local-admin`）執行B16。Fixture version `draft-ae49e198-ff78-4ace-96af-6cab7cf080e5`（`DEV-039-S7-B16-1788156467803`）由`scripts/dev039-s7-fixture.mjs`建立、讀回並recoverably archive；fresh QA已補ProcessNode↔Duty keyboard、duplicate/no-op、Escape、reload、readonly及viewport／overflow，但本次瀏覽器控制介面未觸發可觀察native HTML5 `dataTransfer`，invalid／target卸載 failure evidence與React Flow warning仍開放；loopback dev identity不等同正式登入或production auth，逐案證據見`output/playwright/dev039/manifest.md`。現行狀態不由本段推導，依主spec第26.13～26.18節為準。

### S7 closure amendment（2026-08-31）

本次B16結果不需要新增架構層；ProcessNode↔Duty native已透過`ProcessDutyBridge`的linked／available Duty row `RegisteredDropTarget(kind='duty')`與`ProcessPlanningWorkbench`的`onRelationPreview`／`onRelationCommit`窄接線完成。沿用既有`application/x-orgmaster-entity`、`resolveRegisteredDrop`、App唯一session與`LINK_PROCESS_NODE_DUTY` command，後續只做fresh QA／QC與viewport evidence收斂。

此amendment的邊界：

- target wrapper必須位於可見`processes` panel，具`data-relation-placement-target="duty"`、stable `data-duty-id`、`tabIndex=0`及accessible name；Duty名稱click與解除按鈕的既有語意不變。
- native與keyboard仍由同一`RelationPlacementSession`及resolver處理；component不得持有resolver、commit、第二state、第二MIME或API。
- （歷史執行摘要）完成後必須以B16重跑ProcessNode→Duty／Duty→ProcessNode pair、duplicate／invalid／cancel／capability loss／reload與fresh viewport evidence；當時native CUA未觸發可觀察`dataTransfer`，故暫列QA-QC Reopened。現行四向strict native、E2、E3與正式 QA-QC已依主spec第2.2～2.4節覆核，ADR目前為QA-QC Passed／E4 Candidate Freeze Ready。
- 若窄接線仍無法在既有boundary內收斂，先回PM決定明確排除或修復，不得以新增event bus、plugin、schema、API或dependency繞過缺口。

後續source review以以下單向依賴為hard boundary：

```text
workspace pure core
  → shell/controller effects
    → typed module adapters
      → existing domain selectors / Commands / APIs
```

- `src/workspace/*`不得import業務React surface或執行domain mutation。
- registry不得成為renderer、service locator或capability owner。
- adapter不得保存第二份business state；跨panel關聯只可經registered resolver呼叫既有owner。
- `App`作composition root，但S5完成時不得保留可由正常入口到達的第二套legacy composition。
- 可擴張性只來自新增具型別module context／adapter／relation registration；不以generic event bus、plugin hook、multi-instance或domain synchronization預留換取假彈性。

詳細`AR-01`～`AR-13`closure與證據Gate由DEV-039主契約第27.2節、S6契約及S7 Current Phase Implementation Contract擁有；目前AR-08～AR-13的runtime/source readiness已通過，fresh QA已補keyboard relation、no-op、cancel、reload、readonly與viewport／overflow，但native HTML5 `dataTransfer`尚未被本次瀏覽器控制介面證明，invalid／target卸載 failure evidence與React Flow warning仍開放。S7 QA-QC已重新開啟；任何歷史QA-QC通過也不等於已授權實作、commit、merge、deploy或release。

### S7 fresh QA／QC amendment（2026-08-31，歷史摘要）

本次task-owned runtime fresh run確認：

- 以同一`RelationPlacementSession`完成ProcessNode→Duty與Duty→ProcessNode keyboard link；duplicate為no-op、Escape回source focus、draft reload保留canonical links。
- 1440×900、1024×768 editable及1440×900、1024×768、390×844 readonly均無document overflow；readonly/mobile沒有relation source handle。
- 以in-app browser CUA執行ProcessNode→Duty、Employee→Position及Duty→ProcessNode native drag時，未觀察到HTML5`dataTransfer`drop／mutation。這是「native尚未被fresh證據證明」，不是新增第二owner或改採另一套事件通道的理由。
- fresh session保留一次React Flow parent-size console warning；invalid target、target卸載與可見錯誤訊息仍須補可重演證據。

因此ADR決策不變：不新增event bus、plugin、schema、API或dependency；維持`App`唯一coordinator、`entityDrag.ts` strict MIME、`resolveRegisteredDrop`與既有domain Command。後續 fresh B16已補齊四個 E1 minimum directions、五案 E2與兩案 E3；Process canvas 幾何／listener／raw-console均已由正式 QA-QC覆核。現行狀態依主spec第2.2～2.4節為`Relation Placement Implemented / QA-QC Passed / E4 Candidate Freeze Ready`。

S7 evidence 不在 ADR 另建格式；每筆 E1～E3 case 的欄位與保守判定固定引用 DEV-039 主spec第26.14節，主spec第26.15節保存本輪兩筆單案 native record，主spec第26.16節定義現行證據優先序，第26.17節定義 Process canvas 幾何／生命週期窄修正，第26.20節記錄 E3 lifecycle observation，parity第16.7～16.14節只作索引。缺 strict MIME、API／revision、zero-mutation、focus 或 cleanup 任一必要欄位時，仍不得把觀察升級為 pass；較早的loopback／CUA段落只作provenance。

### S7 Process canvas geometry amendment（2026-08-31）

before 最新 `localhost:5000` B16 分割量測顯示，`process-planning-graph-panel` 約 `360×206px`，其內 `process-planning-canvas` 約 `358×390px`，React Flow root 與 source handle 延伸到 owner panel 可見範圍之外；這是 E1 Process native `not-run` 與 E3 warning 的具體幾何 blocker。after-fix 已在同一 fixture 量得 graph panel `276.1875×536px`、mindmap canvas `274.1875×224px`，source handles 均在 canvas／panel 內，canvas／React Flow 無 overflow，reload／flow console `0/0`；artifact為`F039-S7-E3-process-geometry-after-fix.png`。此 ADR 只接受在既有 Process surface 內以 `min-width／min-height:0`、正常文件流、兩個 animation frame 後單次 `fitView`及observer／rAF cleanup修正；不得以 fixed／portal／global listener／全域 suppress、第二 layout state、resolver、MIME或mutation owner繞過。主spec第26.17節擁有 exact acceptance；parity第16.10節只作索引。上述幾何 observation 不自動關閉 E1 native 或完整 E3 lifecycle。

2026-08-31 follow-up：在 editor 區塊佔滿的短高度 split panel，再以既有 canvas `min-height:180px; flex:1 1 180px` 保留非零 hit-test 區。B16 live geometry 為 graph panel `342.7625×212.3`、canvas `325.9625×180`，relation handles 約`17.303×17.303`且命中產品`BUTTON`；artifact為`F039-S7-E3-process-canvas-min-height.png`。這是既有 surface 的局部 CSS floor，不改 workspace layout、relation resolver、MIME、Command、API或mutation owner；只關閉短面板零高度 observation，不提升 E1 Process native 或 E3 aggregate。exact acceptance 仍由主spec第26.17.5節擁有。

2026-08-31 runner availability decision：task-owned Playwright `dev039-e2`、In-app Browser CUA與Chrome extension CUA在canonical B16 split中確認source／target owner geometry與strict MIME元件存在，但均未產生可採用`dragstart → dragover → drop`／`DataTransfer.types`；Chrome browser-client先無可連線tab，後建立隔離分頁重跑仍無native事件，且本輪無產品mutation／console error。另觀察keyboard placing後切換現行版會離開placing狀態，但缺API／revision／zero-mutation完整record。依主spec第26.19節，ProcessNode↔Duty native維持`not-run`、E1 aggregate維持`Partial／Open`，停止重複同類工具嘗試。此環境結論不授權新增synthetic path、第二resolver／mutation owner、API直寫或產品fallback；後續只有在具備真實HTML5 DataTransfer的runner時，依同一fixture／入口／record schema重跑。

2026-08-31 E3 lifecycle fresh observation：以 task-owned In-app Browser 完成 Process standalone mount、close/unmount、launcher promotion、mindmap／flow切換、Duty往返與reload；幾何、owner surface與產品console無error／warning可標局部pass，artifact為`F039-S7-E3-lifecycle-iab.png`。因工具未提供listener inventory，`E3-LIFECYCLE`仍維持`Partial／Open`；此觀察不授權第二layout state、global listener或portal。

2026-08-31 lifecycle automation coverage：`src/components/ProcessPlanningCanvas.lifecycle.test.tsx` 以受控 jsdom 證明可見 surface 兩 frame settle 後單次 `fitView`、unmount observer disconnect，以及 hidden surface pending rAF cancellation。此為既有 Process surface 的局部 cleanup 證據，不取代瀏覽器 listener inventory，也不提升 `E3-LIFECYCLE` aggregate；ADR 的 single owner、no portal／global listener邊界不變。

2026-09-01 ProcessNode drag arbitration amendment（pan-arbitration）：source relation handle 位於 React Flow pane 內，父層 d3 pan 可能在 HTML5 drag promotion 前攔截 `mousedown`。既有 `ProcessNodeCard` handle 現加入 `onMouseDownCapture` stopPropagation，保留原有 `onPointerDown`、strict MIME、registered resolver與既有 Command／API authority；不新增 state、global listener、dependency、第二 resolver／mutation owner或輸入路徑。`ProcessPlanningWorkbench` regression `1 file／5 tests passed`，typecheck與build通過。修正後 runner可觀察 strict MIME `dragstart／dragend`但仍缺可採用`dragover／drop`，故 E1 aggregate與E4不變；完整細節由DEV-039主spec第26.21.21節擁有。

2026-09-01 headful runner capability probe：為排除 headless／CDP runner限制，建立一次性 `scripts/dev039-headful-native-probe.mjs`，以 Playwright `headless:false`及實際滑鼠路徑重演隔離 B16 fixture `draft-cdd24b6d-d8de-404a-ac9a-1ee9a257b899`。首跑未先選取 ProcessNode而無可見 Duty target；修正 harness後第二次在原生拖曳期間超時中止，未取得可採用的 strict `dragstart→dragover→drop`／`DataTransfer.types`、API mutation或paired Duty→ProcessNode record。兩次均未使用 synthetic event、API直寫或style補位。此結果只記錄 runner capability provenance，不改 single App owner、resolver、Command、MIME、資料邊界或 E1／E4判定；詳細欄位見DEV-039主spec第26.21.22節。

## Compatibility impact

- ADR-002不變：版本workspace、manifest、per-version file與CAS仍是organization保存權威。
- ADR-006不變：DutyPositionRelation與其transaction不因panel化重寫。
- ADR-008不變：Process與Duty／Position仍共用OrganizationDocument V7；React Flow viewport與panel layout都不是domain資料。
- DEV-033仍擁有全系統mobile/tablet最終能力邊界；DEV-039只採不寬鬆於最高原則的default-deny退化。

## Re-entry trigger

只有在Current Phase完成fresh parity並取得真實使用證據後，出現下列需求才重新評估本ADR：

- 同一module必須同時顯示兩個或更多獨立context。
- layout必須跨裝置、跨使用者或公司共用並受權限治理。
- 真實任務必須使用浮動／多螢幕，受控split/tab無法完成。
- 第三方面板或外部系統需要正式plugin/runtime contract。
- Organization/Process domain authority本身改由外部系統或不同版本生命週期擁有。

在re-entry前不得預建multi-instance、server layout、plugin SDK或domain synchronization layer。
