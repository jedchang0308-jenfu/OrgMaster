# OrgMaster 開發任務

> **2026-09-11 DEV-040 R38 pre-auth closure（current）**：R34 production bootstrap後，OrgMaster exact migration execution `orgmaster-prod-migration-runner-pfnz7`完成`7 applied／4 replayed／ledgerCount=11`，production-data驗證PASS；candidate／entrypoint／traffic皆未執行。先前owner false failure源自Cloud Run v2不存在的`terminalCondition`，current已改驗`conditions[type=Completed]`，並把own migration Job resource-scoped viewer納入IaC complete-set。Current離線證據為owner 29／29、abort 6／6、DB boundary、529案product regression與production builds PASS。R37因AI-PDM後續source drift而整個cohort失效，且未執行OrgMaster app-infra apply；恢復後只接受fresh R38，以forward-only／idempotent方式重驗已套用migration，不得人工rollback或重建被migration移除的legacy schema。

> **2026-09-11 DEV-040 R28 operation／production DB correction（current）**：R28 fresh managed prerequisites與OrgMaster build／provenance／SBOM／0 High-Critical scan均PASS，exact execution `orgmaster-prod-migration-runner-5vzpx`已建立；execution在任何001～011 app DDL、data import或principal CAS前，因正式庫缺DEV-010共用roles／schemas以SQLSTATE `42704`終止，owner後續generic operation GET另回403。Candidate／entrypoint／traffic=0，AI-PDM／Platform未dispatch。Current owner runtime移除operation polling，改以exact Service settled readback及run前後child execution差集＋current args唯一匹配；Platform S2另建立source-bound production DB bootstrap receipt硬閘。Fresh central aggregate `2026-09-10T195308-852Z`（SHA-256 `c883a57f…af2cd`）已含OrgMaster production audit、DB boundary、529-product-test build、owner與Terraform gate PASS，releaseAuthority=false。提交push後須fresh R29或後續cohort，R28不得標DB applied或重用。

> **2026-09-11 DEV-040 R27 migration readback correction（current）**：R27 protected owner run 34506045085 的prepare與immutable build／provenance／SBOM／0 High-Critical scan均PASS，但migrate在任何Cloud Run Job execution建立前因deployer缺run.jobs.get回DENIED；provider executions=0，candidate／entrypoint／traffic與DB mutation皆為0。Current在own exact migration Job新增resource-scoped roles/run.viewer並納入APP_INFRA_B complete-set；failure receipt改由immutable migrate receipt判定NOT_APPLIED或FORWARD_APPLIED。完成QC／commit後必以fresh source／app-infra／cohort重跑，R27不得重用。

> **2026-09-10 DEV-040 R26 staged-IaC correction（current）**：R26 source／foundation PASS後，B因SBOM bindings誤列A而安全停止；A回跑亦因會destroy既有B被拒，兩次均無apply／DB／candidate／traffic。Current將三個SBOM bindings改為`incident_runtime_enabled` APP_INFRA_B additional `[0]`；fresh plan應只有它們與exact-job override四個create。QC／commit後使用新cohort，R26不得重用。

> **2026-09-10 DEV-040 R25 IAM correction（current）**：fresh Billing／quota／cost／capacity及OrgMaster artifact gate均PASS，但migration Job execution前因缺`run.jobs.runWithOverrides`安全停止；自動SBOM亦揭露default Artifact Analysis bucket權限缺口。Current source新增own-prefix SBOM IAM及own exact-job executor-with-overrides，無DB／candidate／traffic mutation。完成QC後提交push並由fresh cohort重建production data與全部receipts；R25不得重用。

> **2026-09-10 DEV-040 R22 artifact-evidence hardening（current）**：R22已證明Cloud Build self-actAs修正成功並產生immutable digest／SLSA Level 3 provenance；其後Artifact Analysis因pre-discovery SBOM request回400，且舊runner scan出3 Critical＋15 High，於任何migration／candidate／entrypoint／traffic前安全停止。Current修正採四kind＋exact resource查詢、discovery完成後僅對HTTP 400 bounded retry SBOM與pinned non-root Node 24 Distroless runner，High／Critical門檻不放寬。Fresh aggregate `2026-09-10T074043-640Z`已S1A 32／32、S1B 24／24、S1C 8／8及全部OrgMaster exit gate PASS。下一步為提交master與fresh cohort；R22不得重用。

> **2026-09-10 DEV-040 R20 custom build identity correction（historical）**：R20已通過canonical source identity、source archive及migration bundle建立，後於Cloud Build create以HTTP 403 `DENIED`安全停止；migrate／candidate／entrypoint／traffic均未執行。Live IAM顯示builder已有build editor/storage/registry/analysis但缺own `iam.serviceAccounts.actAs`。Current source新增self-only `google_service_account_iam_member.builder_act_as_self`、APP_INFRA_B additional complete-set地址與negative regression，stage A不含此build-runtime權限；R21舊分類source lock作廢。修正提交後必以fresh cohort apply/readback並重建全部source-bound receipts，R20／R21不得重用。

> **2026-09-10 DEV-040 R2 V3 architecture-final owner handoff（current）**：official release source固定為`jedchang0308-jenfu/OrgMaster@master`；canonical為provider-verified `https://orgmaster-prod-9536592944.asia-east1.run.app`。DEV-040 §30已固定V3 owner profile、ten-stage workflow、exact candidate origin、entrypoint／rollback與data／principal不變條件；runtime receipt另在provider write前驗Cloud SQL、direct origin與共同Firebase identity `fixedValues`，profile SHA-256=`5233c5f7d425f0ec48413f9d105649429a7b7d292441b51a8634ee9058f2767c`。Custom domain、Hosting與shared LB只保留歷史／`RETAINED_UNUSED_EDGE`，TOTP與DEV-047不在scope。Current=`Architecture Finalized / RD Tech Lead PASS / P0=0 / P1=0 / V3 runtime correction implemented / S2 Paused for Operator Re-auth / Production Migration and Data PASS / Candidate、Entrypoint、Traffic NOT_RUN`；R12 pre-runtime receipts因source drift只保留歷史。

> **2026-09-10 DEV-040 R2 production dependency gate（current）**：fresh production audit發現Tiptap 3.30.3的HIGH advisory，已將全部直接Tiptap套件同步固定為3.31.3，避免混合peer graph。`npm audit --omit=dev`現為`0 HIGH／0 CRITICAL`；owner 25／25、abort 6／6、full regression 529／529（另1 skipped）、DB boundary及client／SSR production build均PASS。修正後須以新master commit重建source lock、capacity與downstream receipts，R13舊revision證據只留歷史。

> **2026-09-10 DEV-040 R2 shared-foundation handoff correction（current）**：R15確認shared foundation須鏡像至OrgMaster own bucket；R16實際mirror後又由`PREREQUISITE_OWNER_MISMATCH`證實shared owner例外漏實作。定案foundation保留`shared-foundation` owner與Platform source provenance，並是唯一不要求等於OrgMaster owner／source的prerequisite；OrgMaster infra/runtime/data仍exact join own owner／source。R15／R16均安全停止，修正提交後須用fresh cohort重建。

> **2026-09-10 DEV-040 R2 cross-OS／cross-Git source identity correction（current）**：R18 gzip與R19 raw-tar identity皆在任何source upload／Cloud Build／migration／candidate／traffic前以`SOURCE_ARCHIVE_HASH_MISMATCH`安全停止。三owner統一改綁`git ls-tree -r -z --full-tree <revision>` canonical tree manifest SHA，驗章後才獨立產tar.gz並另記GCS bytes SHA；fresh source/cohort前R18／R19不得重用。

> **2026-09-08 DEV-040 `040-R2` continuous production release（V2 historical authority）**：已依Platform
> DEV-012 §§25～28完成owner direct-doc sync；contract SHA-256=`73bfd85abf017f858796004f69b740d45838a1bfcd25cafcf845b4fb530f9efa`、
> §25～EOF SHA-256=`29f5af2e7d3e699cbec9f1bdc2e3d9f94ca55658e192cbcdf7ff18d9723a369e`。狀態=
> `Implementation Complete / S1B-21 LOCAL_CONTRACT PASS / DEV-012 S2 Gated`。Production profile、001～011
> manifest、exact-target guard、nine-stage workflow、IaC與abort controller已完成；下一步只做fresh S2 provider
> 前置，不得修改／完成DEV-047、把staging profile改作production或把本機PASS冒充DB／traffic證據。

> **2026-09-05 Platform DEV-010 physical-topology successor（現行）**：OrgMaster local product與DEV-040證據保留；三系統共用資料庫的neutral target、`orgmaster_core/orgmaster_contract` placement、roles與producer／consumer migration dependency contract由Platform [DEV-010 direct spec](../../Jenfu-Management-system/ai-doc/specs/DEV-010-three-system-database-consolidation-contract.md) 接管。N1A=`11 unit＋30 QC PASS`、N1B=`10／10 provider PASS`、三repo N2=`48／48 PASS`；R1E verifier role／owner views／IAM login binding／read-only executor source、R1-04唯讀candidate verifier及R1-04A guarded provider artifact producer source亦已完成。Current target=`db-custom-1-3840 / ZONAL_DEDICATED / USD 100`，不宣稱HA。OrgMaster已以exact commit `e9bf5658712b507c0f366c7206c4f9f21265b832`／tree `7b3f82c828d3123d3d5616ee116bbe18db908a50`建立local OCI `sha256:f80a8b82b8aa40418a20bb6db4e41952f167581c15938f81e341f92b9bfb8d18`；包含`dist-server/server.mjs`、`dist/`、production dependencies與`contracts/`，明確不含local `data/`，nonroot／SBOM／bounded secret scan PASS。第一次pinned npm build攔下lockfile drift後，已用同一builder版本修正lock metadata，沒有放寬成`npm install`。Provider producer unit `6／6`與focused QC PASS，但current 8項foundation blocker使它在provider auth前停止；因此`R1-04A Local Packaging＋Producer Source PASS / Provider Artifact、R1-04F-B NOT_RUN`。Container local writable fallback仍須在provider revision驗證。9項human／target／capacity blockers及R1 15案未完成前，DEV-040 production switch、Cloud build／push／deploy、authorized domain與traffic均不得執行。

> **2026-09-02 RD Technical Lead consolidation override（現行）**：以目前 Git 事實校正開發文件：DEV-039 的 workspace baseline 已由 commit `164a779` 建立，DEV-041／042 與最終整合由 `4e3b2ce` 收斂，並經 merge commit `c8cc16f` 進入 `master`。舊文件所列不可達 commit `86510f4` 與「Candidate Freeze／Authorization Pending」只保留為舊分支 provenance，不再代表現況。DEV-034 的 R2 配置語意與 DEV-038 的 Process／V7 domain baseline已由 DEV-039 保留；其被取代的固定 UI／專用拖曳入口分別由 DEV-039、DEV-041、DEV-042 完成替換與 QA／QC，因此 DEV-034、DEV-038、DEV-039、DEV-041、DEV-042 統一視為已完成並併入目前 `master` 基線，不再各自保留 browser QC、candidate freeze、commit 或 merge 尾項。共用 deploy／release 只在使用者明確提出 release 型指令時走單一 release gate。DEV-034 R2.1 的三個 anomaly 複選意圖移至 DEV-042 Future Phase Capsule，未要求實作。現行 local product implementation 已完成；DEV-040 的 local／isolated slices 已完成，僅保留 production switch／release gate。

> **2026-09-03 DEV-009 S3 consumer closure override（現行）**：AI-PDM contract＋repository＋real Chromium aggregate PASS；browser `7／7 PASS`涵蓋current／stale／unavailable／invalid navigation與1440／1024／390。Frozen aggregate=`../../AI_PDM/output/qa/dev-009/aggregate/DEV009-S3-AGGREGATE-2026-09-02T18-19-00-268Z/report.json`，report SHA=`c93b124b79824bb76271aadb32aa27899527b4b9ddc5a97a77d6b31091951502`，candidate SHA=`4ea4689cd9579f3aa4bf26f77fdba4e21ce01386b3abce163173bc1c7381eb0a`；production authority switch、bootstrap、deploy、release仍由相應gate管制。

> **2026-09-03 DEV-009 S4 cross-repo closure override（現行）**：Platform cross-repo fixed cases與S1～S3 frozen receipt驗章PASS。Frozen report=`../../Jenfu-Management-system/output/qa/dev-009/cross-repo/DEV009-S4-2026-09-02T18-21-31-904Z/report.json`，report SHA=`f8fa0128ba7304efd4cd326cbe4f94952be3095986ad3006b86a61acce213a9b`，candidate SHA=`4ab63077b3425028c9ffc0df7be84126c199cd10856ce82db746b4de106c554f`；下一步為`009-R1 Release Gate Required`，不代表production schema／資料／bootstrap／deploy／release已執行。

> **2026-09-03 DEV-040／JMS-PLATFORM-005 closure override（現行）**：OrgMaster、Jenfu Management System與AI-PDM的`005-S0～S4B` local／isolated implementation與`005-S5` local targeted consumer／cross-repo gate均已完成；本輪 fresh evidence：OrgMaster `test:dev-005`=`5 files／16 tests PASS`、`qc:dev-005:postgres`=`7／7 PASS`、full regression=`180 files／749 passed／1 skipped`、build PASS；Platform `contracts:dev-005:check`與`qc:dev-005:cross-repo` PASS；AI-PDM contract／repository／consumer／authorization／runtime／migration／typecheck／isolated build與`qc:jms-dev-005:postgres`=`7／7 PASS`。所有隔離執行均`productionWrites=false`並完成清理。正式 human identity link、shared-login retirement、Cloud SQL production migration、persistent authority switch、deploy、traffic、production smoke與release仍由DEV-001／DEV-006／DEV-009獨立 gate 控制。

> **2026-09-02 DEV-041 final acceptance override — Chromium native behavior accepted**：使用者正式接受noop／rejected在`dropEffect=none`時Chromium不派送terminal `drop`的原生行為。合法拖放仍要求terminal `drop`、恰好一次mutation與revision change；noop／rejected改以terminal `dragend`、zero mutation、revision unchanged、session cleanup與0 console/pageerror判定。既有aggregate已滿足條件，產品程式與effect policy不變；DEV-041現行狀態為`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`。本段優先於下方gap／Partial歷史文字；未授權freeze、commit、merge、deploy或release。

> **2026-09-02 DEV-042 validation closure override**：依權威spec完成 single-layer workspace replacement：正式移除快速抽屜／promotion control flow，十個模組由頂部 launcher 統一 open-or-focus；employees／positions／departments／duties／management-methods 採相鄰 list-detail，detail 由 session-owned `openDetails` 控制，`details=none` 明確保留清單脈絡，窄 panel 轉為單一 surface。四個 DEV-040 governance／catalog 測試契約漂移已改為 workspace scope／current catalog version，local-development management-method authorization亦已修正並補 regression。完整回歸 `174 files／716 passed／1 skipped`，targeted gate、typecheck、client＋server build與production source scan均通過。Fresh Browser S7 已完成 E1～E9：E5 API／UI不再出現`FORBIDDEN`，E7 split／resize／pin／close／zero-panel通過，DEV-041四向 native、zero-mutation、auto-pan與console/pageerror沿用最新aggregate覆核。唯一 manifest=`output/playwright/dev042/manifest.md`，fixture已archive；task-owned 5080 runtime已停止並確認port釋放。DEV-042 現行狀態為`RD Implementation Complete / Browser QA-QC Passed / Local Release Gate Pending`；未授權candidate freeze、commit、merge、deploy或release。權威契約：`ai-doc/specs/DEV-042-single-layer-workspace-contract.md`。

> **2026-09-02 DEV-041 targeted-count correction**：同一組 7 個 DEV-041 targeted test files 已於本輪重新執行，最新輸出為 `36 tests passed`；current override 若仍列 `37 tests`，僅代表較早計數 provenance，不得覆寫本次結果。

> **2026-09-02 DEV-041 current override — fresh native aggregate completed with one browser-policy gap**：依 RD Technical Lead 審查，`effectAllowed` 已從各 caller 選填收斂至 `relationEffectAllowedFor(payload)`：Employee=`copyMove`、Duty=`all`（涵蓋 Position 的 copy／move 與 ProcessNode 的 link）、ProcessNode=`link`；target 仍依既有 resolver 設定實際 `dropEffect`，且只有 `active && available && onPreview && onCommit` 才宣告可接收。ProcessNode關係來源以`data-relation-drag-handle="true"`明確保留native promotion，非互動區仍維持整列可拖、內層控制項仍排除。latest targeted `7 files／37 tests`、typecheck與build通過。四個獨立 fresh fixture 由正常入口及 system Chrome 完成 `EMP-POS`、`DUT-POS`、`PROC-DUT`、`DUT-PROC`：均有 strict MIME、正確 `effectAllowed／dropEffect`、terminal `drop／dragend`、revision變更與canonical readback；Organization／Process owner canvas 四邊 auto-pan、zoom保留與取消後revision不變亦已驗證，全部 console／pageerror sweep為0。aggregate=`output/playwright/dev041/F041-QA-QC-native-aggregate.json`，所有fixture cleanup均`archived`，5080已釋放、5000未觸碰。`NOOP-EMP-POS`／`REJECT-PROC-POS`確認zero mutation與terminal dragend，但Chromium在`dropEffect=none`不派送terminal drop；此為待決定的effect policy browser gap，故現行狀態為`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Partial / Effect Policy Decision Pending`，不得宣稱QA-QC Passed、candidate freeze或commit。

> **2026-09-01 DEV-039 E1 paired strict pass 最新覆寫**：產品只將 `ProcessDutyBridge` responsibility lane source 的 HTML5 `effectAllowed` 由 `copy` 對齊既有 target 的 `link`；未新增 MIME、resolver、Command、API、state、listener或第二輸入路徑。全新隔離 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396` 以 `功能 → 流程規劃 → 在工作台開啟 → 流程圖`及真實滑鼠路徑，完成 `duty-dev039-b16-primary / primary-execute → process-node-dev039-b16-open` 的完整 `dragstart→dragenter／dragover→drop→dragend`、strict `application/x-orgmaster-entity`、`effectAllowed=link`／`dropEffect=link`、UI成功結果、API `200`／revision變化與canonical `process-duty-2` readback；既有 link保留。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`，archive manifest revision=`f253ca113db5ad40ef32349f56f3778a558370af1e72008da39d5fb802b56e0f`，5080已釋放、5000未觸碰。四個 E1 minimum directions現均有strict evidence，E1 aggregate可標為`Pass（evidence）`；正式 QA-QC已完成覆核，E4為`Candidate Freeze Ready / Authorization Pending`，不代表commit、merge、deploy或release。權威細節見主spec第26.21.25節、Parity第16.15.21節與evidence manifest最新QA-QC段落。這段優先於下方較早的E1／E4快照。

> **2026-09-01 DEV-039 現行覆寫**：E2 五案已依主spec第2.3／26.14節完成 `historyEvidence` 行為性 Undo round-trip 重跑；同一 runner 加兩案 E3 共 `7 passed`，fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c`，archive manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`。E2 aggregate現為 `Pass（evidence）`，正式 QA-QC已覆核；E1四向strict native亦已通過，E4只剩候選凍結授權。這段優先於下方較早的 E2 `Partial／Open` 快照。
> **2026-09-01 DEV-039 E1 runner補充（歷史 runner provenance）**：headful Playwright 一次性 probe 未取得可採用的 strict `dragstart→dragover→drop`／`DataTransfer.types`，第一次因未先選取 ProcessNode無可見 target，修正 harness後第二次超時中止；當時不改 E1 `Partial／Open`、paired `not-run`或E4。後續已由 strict native paired record與正式 QA-QC覆寫，現行判定見主spec第26.21.25節、Parity第16.15.21節，且不得新增第二runner、fallback或第二證據清冊。

> **2026-09-01 DEV-039 E1 strict native 單方向覆寫**：在 ProcessNode source handle 的 pointer／mouse capture與 App deferred placement begin 窄修正後，以全新隔離 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673` 完成 `ProcessNode→Duty` strict native 單案：`dragstart→dragenter／dragover→drop→dragend`、strict `application/x-orgmaster-entity`、UI成功結果、明確 `Control+S`後API `200`／revision變化與canonical `process-duty-2` readback；artifact=`output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json`，archive manifest revision=`9fad8fcae1594dae4e9c7ef72116f6aa2a8aad5ff33fc2abd28198304b10f2dd`。僅將 `E1-PROC-DUT-NATIVE`標為`pass`，paired direction已由後續 record補齊，四向aggregate為`Pass（evidence）`並已完成正式 QA-QC；一次性runner已移除，不新增第二輸入路徑、resolver、MIME或第二 evidence manifest。權威細節見主spec第26.21.23節、Parity第16.15.19節。

> **2026-09-01 DEV-039 E1 paired reverse boundary（historical provenance）**：全新隔離 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`以既有 canonical `功能 → 流程規劃 → 在工作台開啟 → 流程圖`與真實滑鼠路徑，從`duty-dev039-b16-primary / primary-execute`拖至`process-node-dev039-b16-open`；觀察到`dragstart／dragenter／dragover／dragend`及 strict `application/x-orgmaster-entity`，但沒有 terminal `drop`、UI成功結果或domain mutation，API status=`200`且revision／既有link IDs不變。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`，archive manifest revision=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`，5080已釋放、5000未觸碰。正式判定`E1-DUT-PROC-NATIVE=blocked／not-run`，不是resolver／API失敗；E1 aggregate、正式QA-QC與E4不變。除非取得可讀真實`DataTransfer`並完成terminal `drop`的新runner，否則停止同類重試，不新增synthetic fallback、第二MIME／resolver／mutation owner或第二證據清冊。權威細節見主spec第26.21.24節、Parity第16.15.20節。

> **2026-09-01 DEV-041 RD technical lead follow-up**：隔離 5080 system Chrome probe 確認 ProcessNode 位於 React Flow 時，ancestor `mousedown` 會在瀏覽器 `dragstart` 前阻斷 native promotion；以 shared relation source adapter 的 `stopMouseDownPropagation` 窄選項修正，ProcessNode root 啟用，其他 source surface 不改事件流。其後以全新 fixture及正常入口完成一條 `ProcessNode→Duty` native RD probe：strict MIME、完整 terminal event chain、`link` effect、revision變更與 canonical `process-duty-2` readback 均成立，artifact=`output/playwright/dev041/F041-S7-PROC-DUT-native-rd-probe.json`。另將 `onBegin` 收斂為必要callback，缺失時 fail-closed；再將pointer origin移至module-local WeakMap，避免factory重建遺失gesture狀態，並將`onCancel`收斂為required，缺失時不輸出draggable；target若缺`onPreview`／`onCommit`也不宣告可接收，補齊factory重建／terminal cancel／target fail-closed regression tests。targeted `11 files／52 tests`、required regression `170 files／693 tests（1 skipped）`、typecheck與build通過。四向 API／revision、zero-mutation、console、cleanup與auto-pan evidence仍是QA／QC gate，DEV-041維持`RD Implementation Partial / P1 Native Reverse-Direction Open / Automated Gate Passed / Browser Native Evidence Pending`。

> **2026-09-01 DEV-041 RD final document audit**：依 RD Technical Lead review 修正主spec第11.4節的過期測試數字（`52／693`）及第18.3節 fixture cleanup 的實際成功條件（`archived` readback），並統一 task-owned runtime 範例使用 `127.0.0.1:5080`。這些是文件一致性修正，不改產品契約或狀態；四向 fresh native QA／QC evidence仍是唯一開放gate，未宣稱 `QA-QC Passed`、candidate freeze、commit、merge、deploy或release。

> **2026-09-01 DEV-041 RD review／native observation follow-up**：依技術主管檢視，Organization employee row 已與 ProcessNode 一樣接入 shared relation source adapter 的 `stopMouseDownPropagation`（pointer／mouse capture），不新增第二拖曳實作；targeted adapter／OrgNode tests、typecheck通過。fresh fixture 的 Employee directory→Position與Organization keyboard→Position可讀回mutation；Organization native row→Position與Duty lane→Position於本次 Chrome CUA未產生mutation，partial record=`output/playwright/dev041/F041-QA-QC-partial-native-evidence.json`。該 record 所用 B16 fixture 已完成 cleanup `archived` readback（manifestRevision=`2f83ad7d801f9c8644f81531d1326b2c9177e59a9cf8ade0dab69cb371b1b375`），task-owned `5080` runtime已釋放；user-owned `localhost:5000`未觸碰。因此 DEV-041仍為 `RD Implementation Partial / P1 Native Reverse-Direction Open / Automated Gate Passed / Browser Native Evidence Pending`，不可把partial observation或keyboard結果當作四向QA／QC通過。另重跑 full regression 得 `171 files／695 tests passed，1 skipped`；該 broad run包含目前工作樹 supplemental／未追蹤測試，只作回歸觀察，不提升native QA／QC或candidate freeze。

> **2026-09-01 DEV-041 console-noise closure**：補上`OrgNode`員工映射的穩定`key={employee.id}`，不改變拖曳／資料契約；targeted component／adapter rerun `7 files／32 tests`通過，React key warning不再出現。Vite extension／bundle-size advisory與測試環境`act`提示仍列為baseline；native四向QA／QC gate不變。

> **2026-09-02 DEV-041 browser-plugin CUA observation**：以全新 task-owned fixture `draft-4c97fb76-bff9-44a2-b743-de86eeb0501d`確認 ProcessNode source 與合法 Duty target 均可見；跨面板 CUA drag transport call完成，但未觀察到 terminal `drop`／domain mutation，API readback仍只有既有 link。此筆只作 runner capability provenance，判定 `blocked／not-run`，不推論產品失效；完整 cleanup／runtime release與停止同runner重試規則見主spec第11.4節，DEV-041維持 `RD Implementation Partial / P1 Native Reverse-Direction Open / Automated Gate Passed / Browser Native Evidence Pending`。

> **2026-09-02 DEV-041 native reverse-direction P1 observation**：以全新 fixture `draft-5069a060-3786-40f6-874c-4e87434e6ba2`重演職掌抽屜 `duty-dev039-b16-primary／primary-execute` → 尚未連結 `process-node-dev039-b16-open`；source／target均為 shared binding，但真實事件止於 `dragstart→dragenter／dragover→dragleave→dragend`，API未新增link。source `effectAllowed=copyMove` 與 link target 要求的 `dropEffect=link` 不相容，登錄為可重現 implementation blocker；修正 shared multi-target effect capability並取得fresh evidence前，不得標示四向 QA／QC、candidate freeze或commit。

> **2026-09-02 DEV-041 native reverse-direction correction closure**：依 RD Technical Lead review，shared adapter新增`relationEffectAllowedFor(payload)`（Employee=`copyMove`、Duty=`all`、ProcessNode=`link`），移除caller自行指定`effectAllowed`，並補 `6 files／26 tests`、typecheck與build。全新 fixture `draft-2e844948-3bec-4d3e-a2eb-824c26453bdf` 以system Chrome正常入口完成 Duty lane→ProcessNode correction probe：strict MIME、source `effectAllowed=all`、target `dropEffect=link`、target `dragenter／dragover`、terminal `dragend`、API revision變更與canonical `process-duty-2` readback成立；runner trace未單獨列出`drop` listener，故只作RD correction probe，不計入四向QA／QC aggregate。fixture以`archived` readback清理（manifestRevision=`cdb021ae3122fd708fda8aebbaea07ea96db5d910a97d428d928e740437a7a0b`），5080已釋放、5000未觸碰。P1 implementation blocker已關閉；四向native、zero-mutation、auto-pan、console與獨立cleanup gate仍待QA／QC。

## 專案最高產品原則

- `Human Confirmed / 2026-08-23`：OrgMaster 手機版只提供唯讀閱讀與導覽，不提供任何建立、修改、刪除、排序、拖放、配置、移轉、核准、發布或其他資料寫入能力。
- 手機版可閱讀組織架構、工作事項／職掌、責任配置及管理辦法，並使用搜尋、篩選、切換與明細導覽；寫入控制不呈現，直接進入既有編輯 URL 也只能取得唯讀內容。
- 桌面／筆電仍依 organization workspace mode、version status、治理權限及既有 validation 決定能否編輯；手機唯讀是額外的產品能力邊界，不取代安全授權，也不得只靠隱藏 CSS 控制。
- 平板與全系統手機／桌面能力判定已由 DEV-033 收斂為 deterministic default-deny gate：只有至少 1024px、hover＋fine pointer 同時成立才開放 mutation，其餘先唯讀。這不取代正式 Auth、role、permission 或 server validation。
- 本原則優先於 DEV-028、DEV-029、DEV-031 及其他既有文件中允許手機／窄 viewport 編輯的舊契約；既有測試與截圖仍是當時完成狀態的歷史證據。DEV-033 現已將同一 boundary 落實到全系統 mutation entry、command guard 與版本／工作台 UI，不得將局部舊證據反向解讀為手機可編輯。

- 文件成熟度：DEV-046已達`RD Implementation Complete / Automated Gate Passed / Browser QA-QC Passed / Local Release Gate Pending`；八module共用frame、Employee-derived presentation primitives／visual tokens、selection/detail state machine、account-scoped list width、011 migration、relation typed extension、S0～S6及A1～E9均已落地，P0／P1 readiness gap=0。DEV-045已達`RD Implementation Complete / Targeted Gates Passed / Browser QC Passed / Full Regression Follow-up Open / Production Provisioning Gated`；one-to-many projection、append-only command receipts、shared identity-link policy、single-writer fence、production default-disabled activation與runtime failure isolation均已落地，P0／P1 readiness gap=0。DEV-043已達`RD Implementation Complete / RD Technical Lead Passed / Targeted Gates Passed / Browser QA-QC Passed / Full Regression Follow-up Open`，是現行local product implementation；DEV-034／038／039／041／042已整併為目前`master@c8cc16f`的完成基線，DEV-046只接管DEV-042被明確取代的list-detail行為，不回開歷史證據。DEV-033、DEV-040與Platform slices狀態以各自權威段落為準。

## 總任務清單

- ✓ DEV-046 [交付點] [local完成／回歸通過／release gated] [P1] [RD Implementation Complete／Automated Gate Passed／Browser QA-QC Passed／Local Release Gate Pending] 統一清單明細工作台與可擴充關係拖曳框架
  - 摘要：將員工、職位、部門、層級、工作職掌、流程、管理辦法與兼任風險統一為左清單＋永遠存在的右detail frame；細部風格／排版以Employee為基準，共用presentation primitives／visual tokens、選取、鍵盤、調寬、帳號偏好與relation binding。
  - 來源 ID：`USER-2026-09-04-COMMON-LIST-DETAIL-WORKBENCH`、`USER-2026-09-04-DETAIL-CLICK-ARROW-ESC-BEHAVIOR`、`USER-2026-09-04-ACCOUNT-SCOPED-LIST-WIDTH`、`USER-2026-09-04-DEV046-RD-IMPLEMENTATION-READY-TECH-LEAD-REVIEW`、`USER-2026-09-04-DEV046-EMPLOYEE-VISUAL-BASELINE`
  - 父任務：DEV-039；intentional successor：DEV-042 list-detail behavior；relation baseline：DEV-041；ADR-009 amendment
  - 結果：RD依權威spec第16節完成S0→S6；targeted與full regression、typecheck、client／server build、DB boundary、diff check及task-owned browser QA／QC均通過。正式production migration、deploy與release仍受release gate管制。
  - 阻塞 / 恢復條件：現行P0／P1 readiness gap=0；若需改domain schema／Command／permission、DEV-033 mobile mutation boundary、建立第二selection／resolver／mutation owner、allowlist外核心檔或production migration／release，立即停止回PM／Tech Lead。
  - 證據：`ai-doc/specs/DEV-046-unified-list-detail-workbench-framework.md`
  - 計入交付：是

- ✓ DEV-045 [交付點] [local完成／回歸追蹤] [P1] [RD Implementation Complete／Browser QC Passed／Production Provisioning Gated] 員工帳號邀請與登入身分設定
  - 摘要：以Employee為人員唯一真相，讓授權管理者從員工明細發起「邀請新帳號」或「連結既有帳號」；OrgMaster治理與編排關係，共同IAM／provider執行帳號、驗證與邀請。
  - 來源 ID：`USER-2026-09-04-EMPLOYEE-ACCOUNT-PROVISIONING-PLACEMENT`、`USER-2026-09-04-DEV045-DEVELOPMENT-DOCUMENT`、`USER-2026-09-04-DEV045-RD-TECH-LEAD-REMEDIATION`、`USER-2026-09-04-DEV045-ARCHITECTURE-COMPLETION`
  - 父任務：DEV-043、DEV-040；架構權威ADR-007
  - 結果：RD依權威spec第18節完成S0→S4 local／isolated implementation；targeted 16 files／56 tests、build與task-owned browser QC通過。標準full regression只保留兩個既有test-discovery follow-up。
  - 阻塞 / 恢復條件：前次技術審查與本次architecture completion缺口均已關閉，現行P0／P1 readiness gap=0；若需production provider／Email／Cloud SQL、raw identity進Browser或dirty overlap無法隔離，立即停止並回PM／release gate。
  - 證據：`ai-doc/specs/DEV-045-employee-account-enrollment.md`
  - 計入交付：是

- ✓ DEV-044 [開發點] [local完成] [P1] [Local development only] 地端測試角色一鍵登入
  - 摘要：在development＋loopback提供四個server-defined測試角色與一鍵登入／切換，修正未配置正式Auth runtime時的地端登出失敗，並以實際server capability驗證DEV-043權限差異。
  - 來源 ID：`USER-2026-09-04-LOCAL-ROLE-ONE-CLICK-LOGIN`
  - 父任務：DEV-040、DEV-043
  - 結果：四角色一鍵登入／切換、server capability matrix、地端logout修正、三viewport與鍵盤QA-QC均PASS；production authority未變。
  - 證據：`ai-doc/specs/DEV-044-local-test-role-one-click-login.md`
  - 計入交付：否（local development測試能力，不代表production Auth／role交付）

- ✓ DEV-043 [交付點] [local完成／回歸追蹤] [P1] [RD Implementation Complete／Browser QA-QC Passed] 員工明細登入身分與帳號治理入口
  - 摘要：Employee維持人員唯一真相；員工明細新增「登入身分」作主要關係治理入口，全域`identity` section改名「帳號治理」並只作跨Employee檢視、異常定位與進入Employee明細。
  - 來源 ID：`USER-2026-09-03-EMPLOYEE-SOURCE-OF-TRUTH`、`USER-2026-09-03-EMPLOYEE-IDENTITY-UI-PLACEMENT`、`USER-2026-09-03-DEV043-DOCUMENT-REVIEW-IMPLEMENT`
  - 父交付點：DEV-040 identity authority、DEV-042 Employee list-detail、ADR-007。
  - 權威契約：`ai-doc/specs/DEV-043-employee-identity-link-management.md`。
  - 下一步：另立追蹤兩個既有 `dev010-n2` script fixture 的 Vitest test-discovery cleanup；DEV-043產品面不再新增scope，不進production identity、deploy或release。
  - 計入交付：是

- ✓ DEV-042 [交付點] [完成] [P1] [RD Implementation Complete／Browser QA-QC Passed／Merged to master] 單層功能工作台與可收合清單明細
  - 摘要：移除「功能抽屜 → 在工作台開啟」第二層入口；頂部功能選單直接新增或聚焦唯一對應面板。有清單的模組統一採「清單＋緊鄰明細」工作台，明細可收合而保留清單、查詢、篩選與捲動脈絡。
  - 來源 ID：`USER-2026-09-02-SINGLE-LAYER-WORKSPACE-INTENTIONAL-REPLACEMENT`、`USER-2026-09-02-DEV042-RD-IMPLEMENTATION-READY`、`USER-2026-09-02-DEV042-RD-TECH-LEAD-REVIEW`
  - 父交付點：DEV-039；DEV-041 的共用關係拖曳互動列為不得回歸基線
  - 權威契約：`ai-doc/specs/DEV-042-single-layer-workspace-contract.md`；ADR-009 DEV-042 amendment。
  - 進度補充：既有 localhost:5000 smoke與fresh task-owned 5080 Browser S7均已完成；E1～E9通過，manifest為`output/playwright/dev042/manifest.md`，fixture已archive。四個DEV-040 full-regression failures已依目前workspace-scoped catalog contract修正並完成回歸。
  - 下一步：已併入 DEV-039 現行基線，無獨立開發、candidate freeze、commit或merge尾項；deploy／release僅在使用者另行提出release型指令時進入共用gate。
  - 計入交付：是

- ✓ DEV-041 [開發點] [完成] [P1] [RD Implementation Complete／Browser Native QA-QC Passed／Merged to master] 跨面板關係拖曳互動一致化
  - 摘要：以員工清單整列拖曳與組織圖即時定位作為標準互動契約，將所有已登錄關係配置來源的整個物件／卡片設為拖曳表面，並把落點回饋、完成後行為及畫布邊緣平移收斂到共用互動核心。
  - 來源 ID：`USER-2026-09-01-RELATION-DRAG-INTERACTION-TEMPLATE`、`USER-2026-09-01-DEV041-HCS-R1-1A-2B-3A`、`USER-2026-09-01-DEV041-HCS-R2-4A-5A-6A`、`USER-2026-09-01-DEV041-HCS-R3-7A-8A-9C`、`USER-2026-09-01-DEV041-HCS-R4-10A-11A-12A`、`USER-2026-09-01-DEV041-HCS-R5-13A`、`USER-2026-09-01-DEV041-RD-IMPLEMENTATION-READY`
  - 父任務：DEV-039
  - 權威契約：`ai-doc/specs/DEV-041-relation-drag-interaction-contract.md`（現行狀態以主spec §0.1／§20 為唯一來源；本清單只作派工摘要）
  - 下一步：已併入 DEV-039／042 現行基線，無獨立candidate freeze、commit或merge尾項；未來若新增關係方向或改動resolver，再以新DEV重新進入。
  - 計入交付：否（統一 DEV-039 既有關係配置能力，不重複計算產品交付）

- ◐ DEV-040 [開發點] [部分完成] [P0] [040-ID1A／ID1B local implementation＋targeted QA/QC complete；JMS-PLATFORM-005 S0～S4B Local-Isolated PASS／S5 Local Targeted PASS；JMS-PLATFORM-009 S0～S4 Local-Isolated Complete／Targeted QA-QC PASS／009-R1 Release Gate Required；Production Switch Gated] 鉦富平台角色生效與 AI-PDM 既有使用者整合
  - 摘要：保留可歸責的AI-PDM個人身分但重設既有role；3筆human identity連Employee，1筆legacy shared account非破壞退場；一般管理用日常身分＋step-up，高權限用同人專用privileged identity，待生效assignment經pilot後分批切換。
  - 來源 ID：`USER-2026-08-30-JENFU-PLATFORM-HCS-4A-5A-6B`、`USER-2026-08-30-JENFU-PLATFORM-HCS-ROLE-RESET-CUTOVER-ADMIN-SCOPE`、`USER-2026-08-30-JENFU-PLATFORM-HCS-PRESTAGE-PILOT-LEGACY-OBSERVATION`、`USER-2026-08-30-JENFU-PLATFORM-HCS-SUPERADMIN-ZERO-TOLERANCE-OBSERVATION-WINDOW`、`USER-2026-09-01-JENFU-ACCOUNT-TAXONOMY-1B-2A-3D`
  - 父任務：DEV-037；跨 repository 交付為 `Jenfu-Management-system` DEV-001／DEV-004～006
  - 下一步：保留ID1A／ID1B、JMS-PLATFORM-005 `005-S0～S4B`與`005-S5` local／isolated evidence；DEV-009 local cross-repo四案已PASS，下一步為`009-R1` production release gate。之後仍須owner提供3筆human exact link、1筆legacy shared退場與active policy產生production IAR，另經DEV-006 S4B／DEV-001 release gate才可apply migration或切production authority。
  - 阻塞 / 恢復條件：ID1A／ID1B皆無文件blocker；舊`ready=0 / missing_employee=4`只是歷史快照。production仍需owner-approved`human ready=3／3`、`legacy shared=1／login enabled=0`、`unresolved=0`、production issuer aligned與active policy，並另進release gate。
  - 證據：`contracts/jenfu-platform-auth/v1/contract-lock.json`；Platform S0=`output/dev-004/DEV004-S0-20260831T011207701Z-feb3f724/`、S1 fresh=`output/dev-004/DEV004-S1-20260831T044053020Z-b4c799d6/`、S4=`output/playwright/dev004-s4/manifest.md`；AI-PDM S2=`../AI_PDM/output/qa/dev-004/DEV004-S2-20260831T030530606Z/`；OrgMaster S3=`output/playwright/dev004-s3/manifest.md`；S5=`../../Jenfu-Management-system/output/dev-004/DEV004-S5-20260831T054317661Z-75bb1fcc/manifest.json`；DEV-006 activation=`../../Jenfu-Management-system/output/dev-006/releases/DEV006-R1-c617c6cf9e0d/`；JMS-PLATFORM-005 S1=`../../Jenfu-Management-system/ai-doc/qc/qc-dev-005-s1-publication-acl-2026-09-02.md`、S3=`../../Jenfu-Management-system/ai-doc/qc/qc-dev-005-s3-projection-authority-invalidation-2026-09-02.md`、S4B=`../../Jenfu-Management-system/ai-doc/qc/qc-dev-005-s4b-route-boundary-2026-09-02.md`、S5=`../../Jenfu-Management-system/ai-doc/qc/qc-dev-005-s5-change-feed-cross-repo-2026-09-02.md`；JMS-PLATFORM-009 S2 frozen=`output/qa/dev-009/browser-real/DEV009-S2-2026-09-02T18-09-45-579Z/report.json`
  - 規格：`ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md`；跨系統主契約與QA／QC位於`C:\VIBE CODING\Jenfu-Management-system\ai-doc\specs`／`qa`
  - ADR：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md` 2026-08-30 amendment
  - 計入交付：否（跨 repository 交付由 Jenfu Management System DEV-001 計算）

- ✓ DEV-039 [交付點] [完成] [P1] [Implementation Complete／QA-QC Passed／Merged to master／Current workspace baseline] 可組合規劃桌面與跨面板關聯配置
  - 摘要：S0～S6工作台與面板邊界保留；S7以單一 typed Placement Session 統一 native／keyboard，沿用既有 resolver 與 mutation authority。最新 B16 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 合併 E2 五案＋E3-LIFECYCLE＋E3-WARNING native CDP 共 `7 passed`；五案均含 `historyEvidence` 行為性 Undo round-trip，E2 aggregate為 `Pass（evidence）`，E3兩案為`pass`。另以全新隔離 fixture `draft-f002b99c-88a4-417f-8892-a32b64e2b673`完成 ProcessNode→Duty、`draft-4af67fa3-4e33-4644-8768-cb65d4642396`完成 paired Duty→ProcessNode，四個 E1 minimum directions均有strict native pass evidence；正式 QA-QC已覆核，並已由`164a779`、`4e3b2ce`與`c8cc16f`完成repository integration。deploy／release未要求。
  - 來源 ID：`USER-2026-08-28-COMPOSABLE-PLANNING-DESKTOP`、`USER-2026-08-28-BRANCH-LEVEL-UI-REPLACEMENT`、`USER-2026-08-28-DEV039-HCS-ROUND-1`、`USER-2026-08-28-DEV039-HCS-ROUND-2`、`USER-2026-08-28-DEV039-HCS-ROUND-3`、`USER-2026-08-28-DEV039-HCS-ROUND-4`、`USER-2026-08-28-DEV039-MATURE-MODULE-SLICE-1`、`USER-2026-08-28-DEV039-ALL-CURRENT-FUNCTION-PARITY`、`USER-2026-08-30-STABLE-PANEL-OWNERSHIP-ARCHITECTURE`、`USER-2026-08-30-DEV039-S6-IMPLEMENTATION-READY`、`USER-2026-08-31-NATIVE-CROSS-PANEL-RELATION-PLACEMENT`、`USER-2026-08-31-FIRST-PRINCIPLES-RELATION-PLACEMENT-ARCHITECTURE`
  - 父任務：DEV-038
  - 下一步：Current Phase 已經 `4e3b2ce` 整合並由 `c8cc16f` 合併至 `master`；不重跑既有 E1～E3 證據，不再建立獨立candidate freeze／commit／merge任務。deploy／release只在使用者明確提出時進入單一release gate。
  - 阻塞 / 恢復條件：Current Phase無開發 blocker。若未來需要schema／API／permission、第二business state、generic event bus、plugin、未登錄關係或改變ADR-008／009，另開DEV並重新做impact review。
  - 證據：S0～S6歷史證據與S7 B16 evidence位於`output/playwright/dev039/manifest.md`；S7新增`relationPlacement.test.ts`、`entityDrag.test.ts`、`ProcessPlanningWorkbench.test.tsx` composition harness、`ProcessDutyBridge.test.tsx`、`ProcessPlanningCanvas.lifecycle.test.tsx`、workspace architecture／layout regression及`scripts/dev039-s7-fixture.test.ts`，最新 targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯與lifecycle合併重跑 `4 files／20 tests`）、full regression `160 files／664 tests（1 skipped）`、typecheck、build與source scan通過；Process canvas after-fix artifact為`F039-S7-E3-process-geometry-after-fix.png`，同一B16 split／reload／flow量測與產品 console `0／0`已記錄。B16 fixture已建立、讀回並封存；最新 E2／E3 record fixture為`draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c`，archive manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`。Playwright E2 fresh artifacts為`F039-S7-E2-invalid-pair.png`、`F039-S7-E2-invalid.png`（語意為COMMIT-REJECT）、`F039-S7-E2-capability-loss.png`、`F039-S7-E2-409-recovery.png`、`F039-S7-E2-unload.png`，五案 status `200`、hydrated→after assignment／relation／link IDs與revision不變、persistence snapshot無「未儲存變更」、產品 diagnostics為空；五案均含 `historyEvidence` 合法 mutation＋恰好一次 Undo round-trip 回完整 canonical baseline，E2 aggregate為`Pass（evidence）`，E3兩案為`pass`。最新 E1 CUA evidence為主spec第26.21.18節／parity第16.15.16節（fixture `draft-5e4cbfa1-db5c-4c7c-af22-2b3000d0fcbc`、新增link `process-duty-5ca3f40b-7335-4bf0-9679-fde86117c778`、API status `200`、archive manifest revision `005fda19cd0655480ee0a4d71cdaf3a8ac0140bf783e6045e536d9dc6f372c56`）；該筆未驗證 strict `DataTransfer.types`，不計為 E1 pass。可重跑 script為`output/playwright/dev039/e2-admission.pw.ts`（本機需使用與helper相同的 Playwright `1.62.1` CLI，並可用`DEV039_E2_VERSION_ID`指定新fixture，避免`npx`另載一份測試runtime造成雙module）；fixture helper現已補loopback identity headers、Windows CLI entrypoint、timestamp-only 409 revision bump與stale route recovery；新增自動化 E2 fail-closed與Process canvas lifecycle tests 不改產品契約。
  - 歷史分支：`codex/dev-039-composable-workspace`；現行權威為`master@c8cc16f`
  - 計入交付：是

  - 最新 E1 證據：`output/playwright/dev039/F039-S7-E1-process-duty-native-strict.json`與`output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`分別記錄兩個 Process↔Duty strict native方向的完整事件鏈、strict MIME、UI結果、API readback與cleanup；Employee→Position與Duty→Position單案strict record保留於manifest。四個 E1 minimum directions均為`pass`，E1 aggregate為`Pass（evidence）`；舊`F039-S7-E1-duty-process-native-blocked.json`僅作 reverse runner provenance。
  - 正式 QA-QC：E1～E3 evidence、四方文件與cleanup已覆核；`160 test files／664 tests passed／1 skipped`、typecheck、build與diff check通過。後續DEV-041／042 final integration已由`4e3b2ce`完成並以`c8cc16f`併入`master`；無candidate／commit／merge尾項。
  - 桌面 viewport extension（2026-09-01）：同一既有 native relation contract 另以 evidence-only runner 驗證 `1440×900` 與 `1024×768`；兩案均完成正常入口、完整 `dragstart→dragenter／dragover→drop→dragend`、strict MIME、`effectAllowed=link`／`dropEffect=link`、`diagnosticsCount=0`、UI成功結果、API revision變化、canonical `process-duty-2` readback及cleanup。record／screenshot：`output/playwright/dev039/F039-S7-E1-process-duty-native-1440x900.json`、`F039-S7-E1-process-duty-native-1024x768.json`、`F039-S7-E1-cdp-process-duty-1440x900.png`、`F039-S7-E1-cdp-process-duty-1024x768.png`；主spec第26.21.26節為權威說明。`1024×768` archive manifest revision未由compact runner輸出，已以`null`保留，不推測未知值；不新增產品路徑、resolver或清冊。該段原E4邊界只作整合前provenance。

- ✓ DEV-038 [交付點] [完成] [P1] [Domain baseline complete／UI composition superseded／QA-QC consolidated into DEV-039／042] 流程－職掌－責任聯動規劃工作台
  - 摘要：讓總經理與主管先用同一組 ProcessNode 的心智圖拆解工作、再用流程圖安排順序，接著連結既有 Duty、選定主執行／協作／審核／會簽並拖到 Position；ProcessNode↔Duty↔DutyPositionRelation↔Position 為固定資料鏈，DEV-034 繼續負責 relation mutation，DEV-036 繼續負責唯讀責任盤點／分布。S4／S5 已落地，包含 Process 編輯、雙 React Flow 投影、三向高亮、native drag、keyboard placement 與 V7 draft autosave／reload；其固定工作台 UI 編排已由 DEV-039 啟動 intentional replacement，領域、Command、儲存與可重用投影仍是新版基線。
  - 來源 ID：`USER-2026-08-27-PROCESS-DUTY-RESPONSIBILITY-WORKBENCH`、`USER-2026-08-27-MINDMAP-FLOWCHART-OSS-DESIGN`
  - 父任務：DEV-034、DEV-036
  - 下一步：無獨立QA／QC尾項；固定composition已退出runtime，V7、migration、domain validation、Command與transaction不變量繼續由本spec／ADR-008提供給DEV-039現行工作台。未來改動domain時另開DEV，不復活舊composition。
  - 阻塞 / 恢復條件：P0／P1 readiness blocker 為 0。若需越出 allowlist、修改 ADR-008、複製 Duty／Position、建立第二套 Process／relation store、process-scoped responsibility、BPMN、AI 自動配置或即時多人共編，立即停止並回 PM。
  - 規格：`ai-doc/specs/DEV-038-process-duty-responsibility-planning-workbench.md`
  - 架構決策：`ai-doc/adr/ADR-008-process-planning-organization-version-authority.md`
  - 計入交付：是

- ✓ DEV-037 [開發點] [完成] [P0] [RD Implementation Complete／QA-QC Passed／Local Release Gate Pending／OrgMaster Only] 外部角色目錄與角色指派權責重整
  - 摘要：外部系統擁有自己的 Application Role、Permission、Role-Permission mapping 與領域審核政策；OrgMaster 只讀取具版本的角色目錄，集中治理員工角色指派、scope、有效期間、代理、指派審核及 audit。
  - 來源 ID：`USER-2026-08-27-EXTERNAL-ROLE-CATALOG-ASSIGNMENT-BOUNDARY`
  - 父任務：DEV-027、DEV-035
  - 完成內容：已依權威契約完成 S1→S4；V2 domain、bundled read-only catalog、V1→V2 非破壞 migration、server／API ownership guard、assignment／role delegation／publish、UI normal delivery path、stale recovery、legacy compatibility、RWD 與完整 regression 均完成。
  - 阻塞 / 恢復條件：OrgMaster-only 實作目前無文件 blocker；若需修改 AI-PDM、正式 IAM／DB／credential、deploy／release，或超出 file allowlist，立即停止並進入 integration／release gate。
  - 證據：`ai-doc/specs/DEV-037-external-role-catalog-assignment-governance.md`、`ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md`、`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md`、`output/playwright/dev037/manifest.md`；fresh full regression `122 test files／553 tests`、build、API negative、forbidden scan、三 viewport browser QC 與 runtime cleanup 均通過。
  - 下一步：live access view、AI-PDM 既有使用者 migration 與角色直接生效已由 DEV-040 承接；本 DEV 的 local-only evidence 不得作為 DEV-040 完成證據。
  - 計入交付：是（OrgMaster Current Phase 完成；外部 live integration 另計）

- ✓ DEV-036 [交付點] [完成] [P1] [RD Implementation Complete／QA-QC Passed／Local Release Gate Pending] 雙視角責任規劃完整工作台
  - 摘要：建立具有正式 URL 的最小唯讀工作台；第一輪固定提供「責任盤點」與「責任分布」兩個視角，盤點頁只做搜尋、三 anomaly 複選、列表與 Drawer，分布頁只做 Position／部門文字搜尋及四類責任 count。
  - 來源 ID：`USER-2026-08-26-DUTY-DUAL-PERSPECTIVE-WORKBENCH`
  - 父任務：DEV-029、DEV-031、DEV-034
  - 證據：`npx tsc --noEmit`、targeted 4 files／20 tests、`npm test -- --testTimeout=30000`（120 files／544 tests）、`npm run build`、Playwright 真實瀏覽器正常入口／tab／filter／Drawer／配置回跳／history／alias、1440×900／1024×768／854×698／390×844；完整清單與截圖：`output/playwright/dev036/manifest.md`。
  - 阻塞 / 恢復條件：Current Phase 無產品 blocker；尚未授權 deploy／release。若後續需要工作台 mutation、schema／API／server／permission／persistence 修改，或要加入工作量、進階篩選及 drilldown，另開 DEV／回 PM，不得回寫本輪最小範圍。
  - 計入交付：是

- ✓ DEV-035 [開發點] [完成] [P0] [QA-QC Passed／Historical Local V1] 治理角色指派與安全發布閉環
  - 摘要：修復 raw `GOVERNANCE_VALIDATION_FAILED` 與成功／失敗並存，補上 desktop global role assignment 建立／撤銷／重新啟用、publish counts／blockers／必填原因、server manage＋publish continuity、歷史版本重新啟用保護，以及 767px 以下治理 mutation default-deny。
  - 來源 ID：`USER-2026-08-26-GOVERNANCE-NEXT-STEP-DESIGN-THINKING`
  - 父任務：DEV-027
  - 規格：`ai-doc/specs/DEV-035-governance-safe-management-loop.md`
  - 證據：`output/playwright/dev035/manifest.md`；typecheck、governance 7 files／18 tests、full 60 files／271 tests、build、API smoke、three-viewport browser、two-session conflict recovery 與 runtime cleanup 均通過。
  - 下一步：DEV-027 local governance 的最短管理閉環已完成；後續由已達 Implementation Ready 的 DEV-037 實作外部角色目錄唯讀與角色指派治理，不再開發 AI-PDM Application Role／Permission Matrix／領域 Approval Policy CRUD。
  - 阻塞 / 恢復條件：DEV-035 不再擴張；V2 governance schema／migration只依 DEV-037 allowlist執行。若需要修改 AI-PDM、production IAM／DB／credential、deploy 或 release，停止並建立對應 integration ADR／release gate。
  - 計入交付：否（恢復父交付點 DEV-027 的 QC，不重複計數）

- ✓ DEV-034 [交付點] [完成] [P1] [R2 semantics retained／UI and DnD superseded by DEV-039／041／042] 左側主資料職掌清單與組織圖拖曳配置
  - 摘要：將職掌納入既有左側主資料欄，沿用員工／職位／部門／層級的入口、展開、搜尋、選取與收合骨架；規劃者在選取列設定主執行／協作／審核／會簽後，由左向右拖到組織圖 Position。R2 移除「其他執行」、將協作併入執行群組，並把舊 collaborate relation canonicalize 為 non-primary execute；R2.1 另保存三個既有 anomaly 原子條件的複選式規劃狀態視角 Brief，不另設「待處理」選項，且尚未要求實作。
  - 來源 ID：`USER-2026-08-25-DEV034-ORG-CHART-INLINE-DUTY-CONFIGURATION`、`USER-2026-08-25-DEV034-UPGRADE-RD-CONTRACT`、`USER-2026-08-25-DEV034-UPGRADE-IMPLEMENTATION-READY`、`USER-2026-08-25-DEV034-DIRECTORY-DUTY-DRAG-REVISION`、`USER-2026-08-26-DEV034-DUTY-PLANNING-STATUS-FILTER`
  - 父任務：DEV-031、DEV-032、DEV-033
  - 下一步：舊R2專用handle／固定DirectoryDock composition與B1～B9 gate已被現行workspace與shared relation contract取代，不再建立`dev034-r2`獨立manifest。R2.1三個anomaly複選意圖已移至DEV-042 Future Phase Capsule，只有使用者重新要求時才另開實作DEV。
  - 阻塞 / 恢復條件：既有Duty relation、primary transfer、pending same-ID、Undo／autosave／CAS仍是不可回歸domain基線；若要改變其語意，另開DEV並做ADR-008／009 impact review。
  - 契約：`ai-doc/specs/DEV-034-org-chart-inline-duty-configuration.md`
  - 證據：原R2 automated gate `59 files／262 tests`與build保留為domain／migration基線；現行UI、四向native DnD、keyboard、responsive、zero-mutation與diagnostics由`output/playwright/dev039/manifest.md`、`output/playwright/dev041/F041-QA-QC-native-aggregate.json`及`output/playwright/dev042/manifest.md`承接。
  - 計入交付：是

- ✓ DEV-033 [交付點] [完成] [P0] [RD Implementation Complete／Automated Gate Passed／Browser QA-QC Passed／Local Release Gate Pending] 手機唯讀與桌面編輯的產品能力邊界
  - 摘要：以 deterministic capability 將手機／觸控窄版固定為完整唯讀閱讀與導覽；桌面／筆電仍沿用 workspace、version、治理權限與 domain validation。全系統 mutation 入口、command、快捷鍵、拖放、版本工作區與 deep link 均已共用 default-deny gate。
  - 來源 ID：`USER-2026-08-23-MOBILE-READ-ONLY-HIGHEST-PRINCIPLE`
  - 父任務：DEV-020、DEV-027、DEV-028、DEV-029、DEV-031、DEV-032
  - 權威契約：`ai-doc/specs/DEV-033-mobile-readonly-desktop-mutation-boundary.md`
  - 下一步：本地產品實作、automated gate 與 browser QA-QC 已完成；如需 production rollout，依共用 release gate 另行授權。
  - 阻塞 / 恢復條件：本 DEV 無 local implementation blocker；production deploy／release 不在本次授權範圍。
  - 證據：`npm test`（181 files／749 passed／1 skipped）、`npm run build`、`output/playwright/dev033/dev033-mobile-390x844.png`、`output/playwright/dev033/dev033-desktop-1440x900.png`；390×844 mode=`current-view`且 editor／layout／collapse controls 不可見，1024×768與1440×900 draft-edit editor 可見，fresh console error sweep=0。
  - 計入交付：是

- ✓ DEV-032 [交付點] [完成] [P0] [RD Implementation Complete / QA-QC Passed / Local Release Gate Pending] 精簡自由管理辦法系統
  - 摘要：第一版只保留 AI 一次產生初稿、乾淨的自由多媒體文件閱讀、桌面「編輯文件」及按需職掌對照；不提供待確認標記、AI 訪談、文件內 AI 編修或差異提案。
    人類對公司事實、制度取捨與提供公司閱讀負全責。正文仍是自由多媒體
    文件，不建立智能引用或 Stage／Step；提供公司閱讀後保留單一閱讀快照，新修改只進工作草稿；職掌以
    按需唯讀對照為主，由人類自行判讀，不提供 AI 差異建議。
  - 來源 ID：
    - `USER-2026-08-22-INTEGRATED-MANAGEMENT-SYSTEM-BRIEF`
    - `USER-2026-08-23-WORK-ITEM-RESPONSIBILITY-LAYER-DIRECTION`
    - `USER-2026-08-24-ORG-CHART-INLINE-DUTY-ASSIGNMENT-MODE`
    - `USER-2026-08-24-DEV032-SCOPE-CONVERGENCE`
    - `USER-2026-08-24-DEV032-DRAFT-FIRST-PHASE`
    - `USER-2026-08-24-DEV032-UX-DESIGN-DETAILS`
    - `USER-2026-08-24-DEV032-BRIEF-DETAIL-CONTINUATION`
    - `USER-2026-08-24-DEV032-REAL-METHOD-SAMPLE-REFINEMENT`
    - `USER-2026-08-24-DEV032-NO-LEGACY-TRACE`
    - `USER-2026-08-24-DEV032-INTERACTIVE-PROTOTYPE`
    - `USER-2026-08-24-DEV032-FREEFORM-MULTIMEDIA-DOCUMENT`
    - `USER-2026-08-24-DEV032-WORKSPACE-EDITOR-BOUNDARY`
    - `USER-2026-08-24-DEV032-AI-NATIVE-AUTHORING`
    - `USER-2026-08-24-DEV032-CONTROLLED-INTERACTIVE-READING`
    - `USER-2026-08-24-DEV032-SIMPLE-FREEFORM-SEMANTIC-EDITING`
    - `USER-2026-08-24-DEV032-AI-NATIVE-INTERVIEW-HUMAN-ACCOUNTABILITY`
    - `USER-2026-08-24-DEV032-AI-NATIVE-BRIEF-DETAIL-CONTINUATION`
    - `USER-2026-08-25-DEV032-BRIEF-SURFACE-CONTEXT-ACCESS-DETAILS`
    - `USER-2026-08-25-DEV032-FIRST-REAL-METHOD-PROTOTYPE`
    - `USER-2026-08-25-DEV032-FIRST-PROTOTYPE-ACCEPTED-DETAIL-CONTINUATION`
    - `USER-2026-08-25-DEV032-SECOND-PRINCIPLE-METHOD-PROTOTYPE`
    - `USER-2026-08-25-DEV032-ABANDON-AI-INTERVIEW`
    - `USER-2026-08-25-DEV032-MINIMAL-READING-FIRST`
    - `USER-2026-08-25-DEV032-CONCEPT-ACCEPTED-NO-THIRD-PROTOTYPE`
    - `USER-2026-08-25-DEV032-IMPLEMENTATION-READY`
  - 父任務：DEV-008、DEV-020、DEV-027、DEV-028、DEV-031
  - 下一步：本機 S0→S7 已完成，後續只需依 release gate 確認 durable backend、正式身分、media 備份、OpenAI retention／額度與 production smoke；不同表格／圖片情境已作正式 QA fixture，不再製作第三份概念原型。
  - 阻塞 / 恢復條件：本機實作沒有 P0/P1 readiness 缺口；正式 OpenAI credential、真實公司資料外送、額度、durable backend、deploy 與 release 仍須 release gate。DEV-031 現行職掌工作台不由本 DEV 取代。
  - 契約：`ai-doc/specs/DEV-032-management-method-system.md`
  - 證據：概念證據為兩份已確認原型 manifest；正式實作、測試與三 viewport browser QC 見 `output/playwright/dev032/manifest.md`
  - 計入交付：是

- ✓ DEV-031 [交付點] [完成] [P1] [RD Implementation Complete / QA-QC Passed / Mobile Editing Contract Superseded] 同頁待處理來源欄與全職位展開式職掌編輯器
  - 摘要：將待處理職掌置於最左並依異常類型分組，右側一次展開所有 active 職位與非空責任群組；移除 selected-position editor、獨立頁面、責任 counts 及逐項異常標籤，同頁保留原生桌面拖放（Pointer fallback）、右側桌面密集版面、move／copy、edge auto-scroll、Undo 與鍵盤／觸控替代操作。
  - 來源 ID：`USER-2026-08-21-DUTY-ONE-PAGE-LEFT-TO-RIGHT-EXPANDED-EDITOR`
  - 父任務：DEV-029、DEV-030
  - 契約：`ai-doc/specs/DEV-031-duty-master-detail-editor.md`
  - 下一步：既有 S0→S4 實作、targeted QA、build 與三 viewport browser QC 保留為歷史完成證據；手機能力已由 DEV-033 統一收斂。組織圖內嵌責任配置已由 DEV-034 以相容入口承接；DEV-031 程式與證據保留作 regression baseline。
  - 阻塞 / 恢復條件：目前無 P0／P1 readiness 缺口；若必須改 domain／API／schema／保存、無法維持同頁全職位展開、無法保留來源 exact lane 或無法建立單一 scroll owner auto-scroll，立即回 PM。
  - 證據：`npm test -- --run`（36 files／205 tests）、`npm run build`、`output/playwright/dev031-revision/manifest.md`、`output/playwright/dev031-drag-recovery/native-drag-after-drop.png` 與三 viewport screenshots；舊 `output/playwright/dev031/` 為 superseded historical evidence。未部署或 release。
  - 計入交付：是

- ✓ DEV-030 [交付點] [完成] [P1] [RD Implementation Complete / QA-QC Passed] 異常職掌卡片精簡與點擊／長按互動
  - 摘要：將右側異常職掌改為單一、低噪音卡片表面，移除拖曳把手、設定按鈕及重複裝飾，以單擊開啟與職掌矩陣一致的工作執掌明細、長按啟動移動。
  - 來源 ID：`USER-2026-08-19-DUTY-ANOMALY-CARD-CLICK-LONG-PRESS`
  - 父任務：DEV-029
  - 契約：`ai-doc/specs/DEV-030-duty-anomaly-card-press-interaction.md`
  - 下一步：RD 依權威契約 S0→S5 執行本機實作、targeted QA與browser QC。
  - 阻塞 / 恢復條件：若需修改domain／API／server、加入touch寫入、無法release revalidate或破壞矩陣／異常共用長按拖曳，立即回PM。
  - 計入交付：是

- ✓ DEV-029 [交付點] [完成] [P1] [RD Implementation Complete / QA-QC Passed / Human Confirmed] 工作執掌責任配置工作台
  - 摘要：把職掌矩陣與異常規劃降為明細層，新增左右合併的主工作台；2026-08-21 起拖放與異常修復直接進入目前 organization state，與樹狀圖共用 Undo／Redo、500ms autosave、Ctrl+S 與 version CAS，不再使用規劃草案或預覽套用。
  - 來源 ID：`USER-2026-08-19-DUTY-ALLOCATION-WORKBENCH-DRAG-DROP`、`USER-2026-08-19-DEV-029-RD-IMPLEMENTATION-READY`、`USER-2026-08-21-UNIFIED-SAVE-FLOW`
  - 父任務：DEV-028
  - 契約：`ai-doc/specs/DEV-029-duty-allocation-workbench.md`
  - ADR：沿用並修訂 `ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`
  - 證據：`npm test -- --run`（38 files／201 tests）、`npm run build`、localhost:5000 五viewport browser QC與`output/playwright/dev-029/manifest.md`；未部署或release。
  - 阻塞 / 恢復條件：目前無P0／P1未決；若需要改V6、API route、runtime dependency、allowlist外production檔或已確認產品語意，立即回PM做impact review。
  - 計入交付：是

- ✓ DEV-028 [交付點] [完成] [P1] [RD Implementation Complete / QA-QC Passed] 工作執掌責任關係與永久移轉
  - 摘要：讓每項工作執掌以條列呈現，並由治理使用者明確設定及查看執行、審核、協作與會簽職位；不套用主管預設值，第一階段只支援永久移轉，不執行送審。
  - 來源 ID：`USER-2026-08-18-POSITION-DUTY-RELATION-PERMANENT-TRANSFER`
  - 父任務：DEV-008、DEV-020、DEV-021
  - 契約：`ai-doc/specs/DEV-028-duty-responsibility-planning.md`
  - ADR：`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`
  - 下一步：Current Phase 已完成；若要加入登入principal、版本ACL、跨裝置、每人私有草稿或lease／接手，先依Future Phase capsule重新建立契約與DEV。
  - 阻塞 / 恢復條件：none；Current Phase產品決策、repo落點、migration／recovery及驗證gate均已固定。若要加入每人私有、登入續接、跨裝置或lease／接手，須先重新進入Future Phase契約。
  - 計入交付：是

- ✓ DEV-027 [交付點] [完成] [P0] [Historical Local MVP] OrgMaster 權限與審核治理中心
  - 摘要：已完成原 1B 的 OrgMaster local governance MVP 與 DEV-035 recovery；2026-08-27 外部角色／Permission／領域 Approval Policy authority 改由各外部系統擁有，新目標差距由 DEV-037 追蹤，既有證據只作歷史基線。
  - 來源 ID：`USER-2026-08-18-ORGMASTER-AI-PDM-AUTHORIZATION-APPROVAL`
  - 父任務：DEV-008、DEV-017、DEV-019、DEV-020、DEV-021
  - 契約：`ai-doc/specs/DEV-027-orgmaster-access-approval-governance.md`
  - ADR：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md`（目前目標）、`ai-doc/adr/ADR-004-authorization-approval-policy-boundary.md`（歷史）、`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`
  - QA：`ai-doc/qa/DEV-027-governance-foundation-validation-plan.md`
  - 下一步：DEV-037 Current Phase 已完成；後續若進入 AI-PDM live integration，需另開跨 repo ADR／DEV，不再依舊方向開發外部 Permission Matrix。
  - 阻塞 / 恢復條件：DEV-027 歷史 local MVP 無未結 blocker；DEV-037 OrgMaster-only 實作無文件 blocker。需要修改 AI-PDM、正式 IAM／DB／credential／deploy、超出 allowlist 或偏離 ADR-007／2A 時立即停止。
  - 計入交付：是

- ✓ DEV-026 [開發點] [完成] [P0] [Intentional replacement 已完成] 職位拖曳命中、磁吸退出與渲染穩定性
  - 摘要：移除專用職位拖曳把手，改由職位卡 pointer gesture 與 movement threshold 判斷拖曳啟動；保留 candidate state machine、render stability、跨部門平行排序、退出取消與 release revalidation。
  - 來源 ID：`USER-2026-08-17-POSITION-DRAG-INTERACTION-HEALTH`
  - 父任務：DEV-001、DEV-017、DEV-020、DEV-025
  - 規格：`ai-doc/specs/DEV-026-position-drag-interaction-stability.md`
  - ADR：沿用 ADR-001、ADR-002、ADR-003；不新增
  - 計入交付：否

- ✓ DEV-025 [交付點] [完成] [P0] [本輪已完成] 組織層級與垂直層帶排版
  - 摘要：建立可版本化的組織層級主檔與逐職位指派，將報告關係與 Y 軸層帶分工，並以 V5 migration、可逆排版與嚴格父子層級驗證解決跨層直報的視覺誤讀。
  - 來源 ID：`USER-2026-08-17-ORGANIZATION-LEVEL-BANDS`
  - 父任務：DEV-004、DEV-008、DEV-017、DEV-020、DEV-021、DEV-022
  - 規格：`ai-doc/specs/DEV-025-organization-level-bands.md`
  - ADR：`ai-doc/adr/ADR-003-organization-level-layout-authority.md`
  - 計入交付：是

- ✓ DEV-001 [交付點] [完成] [P0] [本輪已完成] 組織架構圖畫布 MVP
  - 摘要：建立可直接操作的組織圖編輯器，支援混合方向階層、自動排版、拖曳重排與 XMind 類快捷鍵。
  - 來源 ID：`USER-2026-08-10-ORG-CANVAS`
  - 證據：`npm test`、`npm run build`、`output/playwright/orgmaster-compact-overview.png`、`output/playwright/orgmaster-stacked-right.png`、`output/playwright/orgmaster-drag-no-flicker.png`
  - 計入交付：是

- ✓ DEV-002 [交付點] [完成] [P0] [本輪已完成] 員工清單與多職指派
  - 摘要：將員工從職位資料中獨立，支援由員工清單拖入職位、拖離職位、移動職位，以及同一員工身兼多職。
  - 來源 ID：`USER-2026-08-10-EMPLOYEE-ASSIGNMENT`
  - 證據：
    - `npm test`、`npm run build`
    - `output/playwright/orgmaster-employee-multi-role.png`
    - `output/playwright/orgmaster-employee-moved.png`
    - `output/playwright/orgmaster-employee-unassigned.png`
    - `output/playwright/orgmaster-employee-list-1024.png`
  - 計入交付：是

- ✓ DEV-003 [交付點] [完成] [P0] [本輪已完成] 職位右鍵選單與複製
  - 摘要：在職位卡加入右鍵操作選單，整合常用動作並支援安全複製單一職位。
  - 來源 ID：`USER-2026-08-10-POSITION-CONTEXT-MENU`
  - 父任務：DEV-001
  - 證據：
    - `npm test`、`npm run build`
    - `output/playwright/orgmaster-position-context-menu-1440.png`
    - `output/playwright/orgmaster-position-context-menu-duplicate-1440.png`
    - `output/playwright/orgmaster-position-context-menu-edge-1024.png`
  - 計入交付：是

- ✓ DEV-004 [交付點] [完成] [P0] [本輪已完成] 三類主資料清單與獨立收合
  - 摘要：新增職位與部門清單，沿用員工清單資訊骨架，並以各自按鈕切換或收起清單。
  - 來源 ID：`USER-2026-08-10-DIRECTORY-LISTS`
  - 父任務：DEV-002
  - 證據：
    - `npm test`、`npm run build`
    - `output/playwright/orgmaster-directory-employees-1440.png`
    - `output/playwright/orgmaster-directory-position-1440.png`
    - `output/playwright/orgmaster-directory-departments-1440.png`
    - `output/playwright/orgmaster-directory-collapsed-1440.png`
    - `output/playwright/orgmaster-directory-employees-1024.png`
    - `output/playwright/orgmaster-directory-collapsed-390.png`
  - 計入交付：是

- ✓ DEV-005 [交付點] [完成] [P0] [本輪已完成] 三類主資料新增與安全刪除
  - 摘要：員工、職位、部門清單皆提供新增與刪除，並在刪除時處理任職與部門引用。
  - 來源 ID：`USER-2026-08-11-DIRECTORY-CRUD`
  - 父任務：DEV-004
  - 證據：
    - `npm test`（17 項）、`npm run build`
    - `output/playwright/orgmaster-directory-crud-1440.png`
    - `output/playwright/orgmaster-directory-crud-1024.png`
    - `output/playwright/orgmaster-directory-crud-390-final.png`
    - `output/playwright/orgmaster-add-employee-dialog-390.png`
  - 計入交付：是

- ✓ DEV-006 [交付點] [完成] [P0] [本輪已完成] 三類主資料編輯
  - 摘要：員工、職位、部門清單皆提供編輯，並保持任職與部門引用一致。
  - 來源 ID：`USER-2026-08-11-DIRECTORY-EDIT`
  - 父任務：DEV-005
  - 證據：
    - `npm test`（20 項）、`npm run build`
    - `output/playwright/qa-directory-edit.js`
    - `output/playwright/orgmaster-directory-edit-1440.png`
    - `output/playwright/orgmaster-directory-edit-1024.png`
    - `output/playwright/orgmaster-directory-edit-390.png`
    - `output/playwright/orgmaster-edit-employee-dialog-390.png`
  - 計入交付：是

- ✓ DEV-007 [交付點] [完成] [P1] [本輪已完成] 三清單操作收進右鍵選單
  - 摘要：建立員工、職位、部門清單共用的右鍵操作選單；後續由 DEV-009 補上可見 `⋯` 入口與一致的鍵盤替代路徑。
  - 來源 ID：`USER-2026-08-11-DIRECTORY-CONTEXT-MENU`
  - 父任務：DEV-006
  - 證據：
    - `npm test`（20 項）、`npm run build`
    - `output/playwright/qa-directory-context.js`
    - `output/playwright/orgmaster-directory-context-1440.png`
    - `output/playwright/orgmaster-directory-context-1024.png`
    - `output/playwright/orgmaster-directory-context-390.png`
    - `output/playwright/orgmaster-directory-context-menu-390.png`
  - 計入交付：是

- ✓ DEV-013 [交付點] [完成] [P2] [本輪已完成] 樹狀圖節點寬度縮至 60%
  - 摘要：樹狀圖格子寬度由目前基準縮小至約 60%，同步排版、拖曳命中區與節點視覺尺寸。
  - 來源 ID：`USER-2026-08-11-ORG-NODE-WIDTH`
  - 父任務：DEV-001
  - 證據：
    - `npm test`（25 項）、`npm run build`
    - `output/playwright/qa-org-node-width.js`
    - `output/playwright/orgmaster-node-width-1440.png`
    - `output/playwright/orgmaster-node-width-1024.png`
    - `output/playwright/orgmaster-node-width-390.png`
  - 計入交付：是

- ✓ DEV-014 [交付點] [完成] [P2] [本輪已完成] 移除節點內下層方向圖示
  - 摘要：移除樹狀圖格子內代表縱向／橫向下層關係的圖示與欄位，釋放節點資訊空間。
  - 來源 ID：`USER-2026-08-11-ORG-NODE-DIRECTION-ICON`
  - 父任務：DEV-013
  - 證據：
    - `npm test`（25 項）、`npm run build`
    - `output/playwright/qa-org-node-no-direction-icons.js`
    - `output/playwright/orgmaster-node-no-direction-icons-1440.png`
    - `output/playwright/orgmaster-node-no-direction-icons-1024.png`
    - `output/playwright/orgmaster-node-no-direction-icons-390.png`
  - 計入交付：是

- ✓ DEV-015 [交付點] [完成] [P1] [本輪已完成] 組織圖本機文件操作
  - 摘要：提供自動草稿、正式儲存、復原／重做、存副本與備份下載；本交付最初使用 V2，現由 DEV-019 升為 `data/orgmaster-document.v3.json` 並保留 V2 fallback，同電腦不同 Chrome 視窗共用，副本與備份輸出為可攜式 JSON。
  - 來源 ID：`USER-2026-08-11-ORG-DOCUMENT-ACTIONS`
  - 父任務：DEV-001
  - 證據：
    - `npm test`（29 項）、`npm run build`
    - `output/playwright/qa-document-actions.js`
    - `output/playwright/orgmaster-document-actions-1440.png`
    - `output/playwright/orgmaster-document-actions-1024.png`
    - `output/playwright/orgmaster-document-actions-390.png`
    - 實際下載 `orgmaster-copy-*.json` 與 `orgmaster-backup-*.json`
  - 計入交付：是

- ✓ DEV-008 [交付點] [完成] [P0] [本輪已完成] 員工、職位、部門資料模型收斂
  - 摘要：建立部門階層、角色與實際職位、帶有效期間的任職配置；主管／直線匯報關係暫不建立。
  - 來源 ID：`USER-2026-08-11-ORG-DATA-MODEL`
  - 父任務：DEV-002、DEV-004、DEV-006
  - 證據：`npm test`（20 項）、`npm run build`、本機瀏覽器三清單與畫布 smoke check
  - 計入交付：是

- ✓ DEV-009 [交付點] [完成] [P1] [本輪已完成] 三清單 UI/UX 互動一致性
  - 摘要：統一員工、職位、部門清單的新增、選取、更多操作與鍵盤操作語法，建立可重複的肌肉記憶。
  - 來源 ID：`USER-2026-08-11-DIRECTORY-UX-CONSISTENCY`
  - 父任務：DEV-004、DEV-006、DEV-007、DEV-008
  - 證據：
    - `npm test`（20 項）、`npm run build`
    - `output/playwright/orgmaster-three-lists-1440.png`
    - `output/playwright/orgmaster-three-lists-390.png`
    - 真實瀏覽器三類清單切換、可見 `⋯` 操作選單、標題列新增、部門階層搜尋 smoke check
  - 計入交付：是

- ✓ DEV-010 [交付點] [完成] [P1] [本輪已完成] 三清單唯一主檔與關聯細節層
  - 摘要：員工、職位、部門清單只呈現各自唯一主檔；跨主檔關聯資料移至點選後的右側細節層，避免主清單重複。
  - 來源 ID：`USER-2026-08-11-DIRECTORY-MASTER-DETAIL`
  - 父任務：DEV-008、DEV-009
  - 證據：
    - `npm test`（20 項）、`npm run build`
    - `output/playwright/orgmaster-unique-master-detail-1440.png`
    - `output/playwright/orgmaster-unique-master-detail-390.png`
    - 真實瀏覽器驗證員工、職位、部門清單唯一主檔與右側關聯細節切換
  - 計入交付：是

- ✓ DEV-011 [交付點] [完成] [P0] [本輪已完成] 同一職位多人任職與任職細節層
  - 摘要：保留單人職位，同時讓指定職位可不限人數加入多人；以 activeAssignments 呈現正式、兼任與代理等目前任職。
  - 來源 ID：`USER-2026-08-11-MULTI-ASSIGNEE-POSITION`
  - 父任務：DEV-002、DEV-008、DEV-010
  - 證據：`npm test`（23 項）、`npm run build`、本機瀏覽器多人切換／新增／逐人解除、1440×900 與 390×844 viewport、console／可見錯誤掃描。
  - 計入交付：是

- ✓ DEV-012 [交付點] [完成] [P1] [本輪已完成] 既有職位手動改部門
  - 摘要：既有職位可從右側職位屬性或職位清單編輯對話框手動切換所屬部門，並保留既有任職資料。
  - 來源 ID：`USER-2026-08-11-POSITION-DEPARTMENT-EDIT`
  - 父任務：DEV-006、DEV-008、DEV-011
  - 證據：`npm test`（25 項）、`npm run build`、本機瀏覽器右側部門切換／職位編輯對話框保存、1280×720 與 390×844 viewport、console／水平溢出掃描。
  - 計入交付：是

- ✓ DEV-016 [交付點] [完成] [P1] [本輪已完成] 部門刪除改為警示可執行
  - 摘要：部門仍有員工或職位時顯示警示但不 disabled 刪除；有替代部門可先轉移，沒有替代部門則改為未設定部門。
  - 來源 ID：`USER-2026-08-12-DEPARTMENT-DELETE-WARNING`
  - 父任務：DEV-005、DEV-012
  - 證據：`npm test`（31 項）、`npm run build`、本機瀏覽器警示／可執行刪除／未設定部門／重新指定驗證、390×844 viewport、console／溢出掃描。
  - 計入交付：是

- ✓ DEV-017 [交付點] [完成] [P0] [本輪已完成 RD] 正式組織圖：職位樹與部門分組整合
  - 摘要：以職位上下級樹作為主要組織圖，每個部門形成單一連續職位子樹與分組框；部門歸屬和職位上下級仍分開保存。
  - 來源 ID：`USER-2026-08-12-POSITION-TREE-DEPARTMENT-GROUPS`
  - 父任務：DEV-001、DEV-008、DEV-009、DEV-012
  - 證據：`npm test`（11 files／68 tests passed）、`npm run build`；新增 hierarchy/command/group/migration/atomicity 與 frame collision tests；Playwright 實測三尺寸皆為完整部門框、任兩框交集 0、無水平溢出或 console error。
  - 交付檔案：`src/organizationHierarchy.ts`、`src/organizationCommands.ts`、`src/departmentGroups.ts`、`src/components/DepartmentGroupLayer.tsx`、`src/components/DocumentRecoveryDialog.tsx`、`src/documentStorage.ts`。
  - QA/QC 邊界：本輪完成 RD 自我驗證與 targeted browser smoke；尚未授權部署或 release，完整三 viewport／回歸矩陣可由 QA/QC 接續。
  - 計入交付：是

- ✓ DEV-018 [交付點] [完成] [P1] [本輪已完成] 部門轉移刪除按鈕可執行與錯誤回饋
  - 摘要：修正部門刪除時明確選擇替代部門卻被區塊連續性規則靜默拒絕的問題；轉移保留職位上下級，其他錯誤顯示在對話框。
  - 來源 ID：`USER-2026-08-12-DEPARTMENT-TRANSFER-DELETE-NOOP`
  - 父任務：DEV-016、DEV-017
  - 證據：`npm test`（64 項）、`npm run build`、本機瀏覽器實際操作後部門數量由 12 變 11、員工與職位轉移提示可見。
  - 計入交付：是

- ✓ DEV-019 [交付點] [完成] [P1] [本輪已完成] 職務兼任風險視覺監控
  - 摘要：設定具有兼任風險的職務組合；系統偵測同一員工的有效任職後，在組織圖以純視覺效果標示，不顯示風險文字且不阻擋任職設定。鉦富機械目前採 10 組精簡基準（高 8／中 2）。
  - 來源 ID：`USER-2026-08-15-DUAL-ROLE-RISK-VISUAL`
  - 父任務：DEV-002、DEV-008、DEV-011、DEV-017
  - 證據：`npm test`（14 files／105 tests）、`npm run build`；V3／V2 preservation、Role mapping 與三級風險 migration tests；1440×900、1024×768、390×844 真實 UI、非阻擋任職、三級視覺、資料持久化與 console 掃描。
  - 基準更新證據：2026-08-18 現行版保存 10 組啟用規則（高 8／中 2），現況命中 0；22 files／158 tests、build、workspace API HTTP 200 與三 viewport 設定面板 QC 通過，兩份草稿維持 0 組。
  - 發行邊界：本機 RD／QA／QC 完成；尚未授權 deploy／release。
  - 計入交付：是

- ✓ DEV-020 [交付點] [完成] [P1] [本輪已完成] 組織架構多草稿與版本比較
  - 摘要：把單一組織文件擴充為版本工作區，提供多草稿、獨立自動儲存、版本切換、現行版保護、多方案摘要與兩版本視覺差異。
  - 來源 ID：`USER-2026-08-16-ORG-VERSION-WORKSPACE`
  - 父任務：DEV-015、DEV-017、DEV-019
  - 證據：`npm test -- --run`（19 files／126 tests）、`npm run build`、workspace API／CAS、版本建立／切換／current-maintenance／比較 browser flow；`ai-doc/specs/DEV-020-organization-version-workspace.md`、`ai-doc/adr/ADR-002-version-workspace-storage-boundary.md`
  - 計入交付：是

- ✓ DEV-021 [交付點] [完成] [P0] [本輪已完成] 主職、兼任與直屬主管路徑（行政核准暫緩）
  - 摘要：為每位員工保存最多一個主職，其他任職顯示為兼任／代理；依主職上級職位顯示唯讀直屬主管路徑，行政核准人與例外指定暫緩。
  - 來源 ID：`USER-2026-08-16-PRIMARY-ROLE-ADMIN-APPROVAL-ROUTE`
  - 父任務：DEV-002、DEV-008、DEV-011、DEV-017、DEV-019
  - 交接：DEV-020 已沿用 DEV-021 的 V4 canonical state 與 migration contract；本 DEV 未擴張請假／簽核交易或行政核准功能。
  - 證據：`npm test -- --run`（20 files／129 tests）、`npm run build`、1440×900／390×844 browser QC（console 0 error／0 warning、無水平 overflow）、`ai-doc/specs/DEV-021-primary-role-administrative-approval-route.md`
  - 計入交付：是

- ✓ DEV-022 [交付點] [完成] [P1] [本輪已完成] 左右側欄關閉與快捷鍵一致性
  - 摘要：統一左側主資料欄、右側屬性／細節欄與兼任風險欄的關閉控制、Escape 逐層關閉、編輯保護、焦點回復及 responsive 行為。
  - 來源 ID：`USER-2026-08-16-PANEL-DISMISSAL-SHORTCUT-CONSISTENCY`
  - 父任務：DEV-001、DEV-004、DEV-009、DEV-010、DEV-019
  - 下一步：無；DEV-022 S1→S4 已完成，後續僅需依 release 流程另行授權部署。
  - 證據：`ai-doc/specs/DEV-022-panel-dismissal-shortcut-consistency.md`、`src/panelDismissal.test.ts`、`output/playwright/dev-022/dev022-panels-1440x900.png`、`output/playwright/dev-022/dev022-panels-1024x768.png`、`output/playwright/dev-022/dev022-panels-390x844.png`
  - 計入交付：是

- ✓ DEV-023 [開發點] [完成] [P1] [本輪已完成] 取消組織圖職位 Delete 快捷鍵
  - 摘要：取消在架構圖選取職位後按 `Delete`／`Backspace` 直接進入刪除流程，降低誤觸刪除風險；右鍵選單與右側屬性仍保留明確刪除入口。
  - 來源 ID：`USER-2026-08-16-CANVAS-DELETE-GUARD`
  - 父任務：DEV-001、DEV-003、DEV-022
  - 證據：`npm test -- --run`（19 files／126 tests）、`npm run build`、localhost:5000 實際畫布操作；選取職位後按 `Delete`／`Backspace` 仍保留 22 個節點且不開啟刪除對話框，右鍵選單刪除入口仍可見。
  - 計入交付：否

- ✓ DEV-024 [開發點] [完成] [P1] [本輪已完成] 右上角版本模式狀態顯示
  - 摘要：在右上角版本切換器旁提供可見的工作模式狀態，明確區分 `唯讀`、`可編輯`、`維護中` 與 `比較唯讀`；以文字、色點、ARIA status 與提示說明同步傳達是否會寫入資料。
  - 來源 ID：`USER-2026-08-16-WORKSPACE-MODE-STATUS`
  - 父任務：DEV-020、DEV-022、DEV-023
  - 證據：`npm test -- --run`（19 files／126 tests）、`npm run build`、localhost:5000 真實瀏覽器 1440×900／1024×768／390×844 UI QC；`output/playwright/orgmaster-mode-status-1440x900.png`、`output/playwright/orgmaster-mode-status-1024x768.png`、`output/playwright/orgmaster-mode-status-390x844.png`；右上角狀態 pill 可見、無重疊／水平溢出，並提供 `role=status`、ARIA label 與 title 說明。
  - 計入交付：否

## DEV-046：統一清單明細工作台與可擴充關係拖曳框架

狀態：local implementation complete；automated gate與task-owned browser QA／QC通過
文件成熟度：`RD Implementation Complete / Automated Gate Passed / Browser QA-QC Passed / Local Release Gate Pending`
節點類型：交付點
優先級：P1
父交付點：DEV-039；intentional successor：DEV-042 list-detail behavior；relation baseline：DEV-041；架構權威ADR-009
是否計入產品交付完成：是
權威規格：`ai-doc/specs/DEV-046-unified-list-detail-workbench-framework.md`
執行邊界：local／isolated S0～S6已完成；未apply production migration、未deploy、未執行release
風險等級：High（八個主要UI、selection／detail state、帳號偏好API／migration與relation回歸）

### Current Phase交付契約

- 八個consumer固定為employees、positions、departments、levels、duties、processes、management-methods、role-risks；Organization與Governance不在本次scope。
- 沿用`WorkspaceListDetailSurface`作唯一frame，桌面永遠render list／separator／detail；Level先保留空detail slot，不為形式一致虛構domain內容。
- 細部風格與排版以現行Employee workspace surface為control specimen；共用`WorkbenchListFrame`／`WorkbenchListRow`／`WorkbenchDetailFrame`與scoped tokens，固定32px list header、34px search、Employee row／selected語言、40px detail header、18px standard section及`standard|edge-to-edge`body boundary。list-detail separator保留操作熱區但只呈現1px灰線，與多功能workspace split的藍色5px分隔線區隔。
- 同列click關閉／重開detail，另一列click與ArrowUp／Down切換，Escape依modal／editor／relation／dirty guard precedence關閉；selection不因detail關閉而清除。
- 無帳號偏好時只做一次content-fit；preferred width依verified principal＋module經GET／PUT保存，effective clamp不回寫。Local-json與Cloud SQL以同一repository contract實作，新增forward-only 011 migration。
- Relation仍只有DEV-041 strict MIME、single `RelationPlacementSession`、`resolveRegisteredDrop()`、shared bindings及App mutation owner；新增pair依typed extension checklist另立可驗收DEV。
- RD依S0 contract／visual guard→S1 frame／interaction／presentation primitives→S2 preference vertical slice→S3 Employee control＋master／Duty→S4 Process／Management Method／Role Risk→S5 relation cleanup→S6 candidate verification執行；A1～E9與F046-01～09為完成Gate。

### RD Technical Lead review

- 結論：`Pass after Contract Optimization`；P0／P1 readiness gap=0。
- 核心原因：應共用的是layout、互動、偏好與drag binding，不是各domain detail。建立generic renderer或第二shell會把差異藏進mega component，無法降低維護成本。
- 最小修正：取消第二`WorkbenchShell`；限制八個consumer；從Employee只抽出list／row／detail三個slot-based presentation primitives與scoped tokens；保留單一typed relation resolver；帳號偏好與OrganizationDocument／workspace layout隔離；preferred與effective width分離。
- 技術債：`DirectoryDock.tsx`與`App.tsx`仍是composition hotspot，只允許抽出本次slot migration直接需要的部分；全面拆檔另立開發點。

### 驗收與下一步

- 驗收：權威spec A1～E9、F046-01～09與FMEA已落地；targeted、full regression（196 files／797 tests／1 skipped）、typecheck、client／server build、DB boundary、diff check及三viewport normal-entry／Employee visual parity evidence齊全。全量回歸中曾出現一次既有 entitlement test 5 秒逾時，單獨重跑及再次全量均通過。
  - 瀏覽器證據：八個 module 的正常入口均確認永久 list／separator／detail slot；Employee 另完成同列關閉／重開、ArrowUp／Down、Escape focus restore、keyboard resize、preference PUT 200、1440×900／1024×768／390×844 截圖；總表：`output/playwright/dev046/manifest.md`。
- 下一步：僅剩 local release gate；production migration、deploy、release及新的 relation pair 需另立授權與驗收。
- 停止條件：需要改domain schema／Command／permission、DEV-033 mobile boundary、第二selection／resolver／mutation owner、allowlist外核心檔或production migration／release時停止回PM／Tech Lead。

### 變更紀錄

- 2026-09-04：依使用者追加決策，將細部風格與排版固定以Employee workspace surface為基準；新增三個presentation primitives、scoped visual tokens、`standard|edge-to-edge`detail body boundary與F046-09 visual parity Gate。Tech Lead重新覆核後維持通過；未修改產品程式或runtime。
- 2026-09-04：完成DEV-046 local／isolated implementation。八個consumer接入永久list／separator／detail frame；統一click／Arrow／Escape、清單寬度pointer／keyboard調整與verified-principal account preference；補上011 forward-only migration、preference repository／API、typed relation extension path及Employee視覺基準。`npm test` 196 files／797 tests／1 skipped、typecheck、client／server build、DEV-010 N2 16／16、DB boundary、diff check及task-owned browser evidence通過；未apply production migration、deploy或release。
- 2026-09-04：依使用者要求建立並補至`RD Implementation Ready`；RD Technical Lead完成根因、最小架構、技術債、FMEA與證據審查後通過。本輪只修改權威spec、ADR amendment與索引，未修改產品程式或執行runtime／測試。

## DEV-045：員工帳號邀請與登入身分設定

狀態：local implementation complete（targeted gates／browser QC通過；full regression follow-up open）
文件成熟度：`RD Implementation Complete / Targeted Gates Passed / Browser QC Passed / Full Regression Follow-up Open / Local-Isolated Current Phase / Production Provisioning Gated`
節點類型：交付點
優先級：P1
父交付點：DEV-043、DEV-040；架構權威ADR-007
是否計入產品交付完成：是
權威規格：`ai-doc/specs/DEV-045-employee-account-enrollment.md`
執行邊界：本輪完成local／isolated RD implementation與驗證；未修改production provider設定、正式資料、部署或release
風險等級：Medium（新增主要互動、帳號狀態、權限與跨UI／BFF／共同IAM資料路徑）

### Current Phase交付契約

- 主要入口固定為「員工 → 員工明細 → 登入帳號」；空白狀態只顯示「尚未設定登入帳號」與唯一主動作「設定登入帳號」，非空狀態完整呈現多個person-specific accounts與相關enrollments，並只保留一個低權重「新增登入帳號」。
- Modal提供互斥的「邀請新帳號」與「連結既有帳號」，邀請為預設；一般empty state不得再顯示目前管理者自身identity的衝突。
- Current Phase固定為`Local／Isolated Employee Account Enrollment Foundation`：交付真實產品UI、server permission、含append-only command receipts的enrollment ledger、每次provider mutation前持久化的request key、冪等／reconciliation、shared identity-link policy、既有identity-link整合及deterministic local provider adapter；Employee ID沿用Organization source的opaque exact ID，GET固定pure read。
- DEV-045啟用後，account-enrollment API是identity link建立／重新啟用／狀態變更的唯一產品HTTP寫入入口；舊current-actor與generic identity HTTP mutations回`IDENTITY_ACCOUNT_FLOW_REQUIRED`且零mutation，internal `applyDraftCommand`仍為唯一canonical store command boundary。
- Vite與production server各自只建立一個account service／provider與一個startup recovery promise；只有account routes等待readiness，ledger故障不得拖垮Employee其他明細、document或非identity governance routes。
- Production server的`accountEnrollmentEnabled`預設false且本階段沒有environment activation；Vite local與QA harness顯式啟用。未來正式切換前必須另過production provider／persistence／release gate，不能因程式存在就先封鎖production DEV-043入口。
- 正式Firebase／共同IAM帳號建立、Email投遞、production persistence、migration、deploy與release不在本階段；local adapter證據不得宣稱正式帳號或邀請信已產生。
- 帳號完成不自動授予Application Role；已屬其他Employee的帳號不得靜默移轉。
- 權限細分為`orgmaster.identity.view`、`orgmaster.identity.invite`、`orgmaster.identity.link`與`orgmaster.identity.invitation.manage`；`orgmaster.governance.manage`不隱含帳號治理權限。
- DEV-044的administrator與governance-manager可執行Current Phase流程；method-manager與employee不得看見mutation control。窄版／手機依DEV-033保持完整唯讀。

### Local implementation completion evidence（2026-09-04）

- `npm run test:dev-045`：16個測試檔／56個測試通過；`npm run build`：client／server build通過。
- `npm run qc:dev-045:browser`：四個development profile、1024／390／1440 viewport、實際送出地端邀請並投影pending、CTA／mutation control可見性、手機唯讀與overflow檢查通過；證據：`qa/dev-045/browser/manifest.json`及同目錄screenshots。
- 排除兩個既知fixture discovery檔後，`npx vitest run --exclude scripts/dev010-n2-orgmaster.test.mjs --exclude scripts/dev010-n2-source-freeze.test.mjs --testTimeout=30000`為192個測試檔／791個測試通過／1 skipped；標準`npm test -- --testTimeout=30000`只另列這兩個既有`No test suite found` discovery failures，未發現DEV-045 regression。
- Production boundary維持：`accountEnrollmentEnabled` server default=false；local provider、Email、Cloud SQL、migration、deploy與release未啟用。

### Readiness與下一步

- Spec Impact Preflight：`Compatible future successor / Compatible security and implementation refinement / Intentional successor surface replacement`；DEV-043完成狀態與既有證據保持有效，只有DEV-045啟用後的舊identity HTTP mutation surface由新流程取代。
- ADR Gate：不新增ADR；OrgMaster治理／編排、共同IAM authentication／credential authority已由ADR-007固定。
- 已固定domain狀態機、one-to-many UI projection、permission matrix、API behavior、provider port、shared identity-link policy、pre-dispatch request-key saga、錯誤恢復、FMEA與A1～A15驗收案例。
- 已固定opaque Employee ID、pure GET、append-only command receipt、create／replay disposition、exact request／provider／audit DTO、same-origin mutation gate、single-writer HTTP fence、runtime singleton／failure isolation、development startup recovery、exact repo／file／symbol、local ledger schema與path、S0→S4、test scripts、browser provenance及runtime cleanup；RD Technical Lead re-review=`PASS`，P0 gap=`0`、P1 gap=`0`。
- local／isolated implementation 已完成；後續只可在新的變更範圍內重用本輪契約與證據。正式provider、Email、Cloud SQL、deploy與release仍未授權。

### 變更紀錄

- 2026-09-04：依使用者要求補齊DEV-045架構：把Employee ↔ identity的一對多不變量落到plural DTO、mixed-state projection與A14；抽出shared identity-link policy；以account API single-writer fence取代啟用後的舊current／generic identity HTTP mutation surface；固定runtime singleton、單一startup readiness與account-only failure isolation；另移除不存在的candidate enrollment狀態，以append-only command receipts及每次resend獨立request key補齊管理操作冪等／crash recovery，並新增純讀`readExistingGovernanceStore()`避免GET觸發seed／migration，新增A15及S0～S4對應Gate。Spec Impact為compatible refinement加intentional successor surface replacement，不新增ADR；文件維持`RD Implementation Ready`，未修改產品程式或runtime。
- 2026-09-04：完成DEV-045 local／isolated implementation：account enrollment types、local provider、append-only ledger／CAS、reconciliation service、HTTP runtime／governance fence、Employee「登入帳號」UI與modal、四角色permission及browser harness落地。Targeted 16 files／56 tests、build與browser QC通過；full regression僅保留兩個既有test-discovery failures，未執行production provider／Email／Cloud SQL／deploy／release。
- 2026-09-04：依RD Technical Lead review關閉1個P0與4個P1：新增provider call前持久化的`providerRequestKey`、同flow／development startup recovery與response-loss reconciliation，改採opaque Employee ID、固定GET pure read、補齊create／replay disposition及request／provider／audit types，並新增same-origin mutation Gate與A13；re-review=`PASS`，文件維持`RD Implementation Ready`，未修改產品程式或runtime。
- 2026-09-04：升級為`RD Implementation Ready / RD Not Started / Documents Only`。固定exact file／symbol allowlist、V1 local ledger、provider port、service／route DTO、Employee UI wiring、現行版與帳號治理解耦、S0→S4、targeted／aggregate／browser Gate及cleanup；P0／P1 gap=0，未修改產品程式或runtime。
- 2026-09-04：升級為`RD Contract Ready / RD Not Started / Documents Only / Production Provisioning Gated`；建立權威spec，固定local／isolated Current Phase、權限、狀態機、API／provider port、冪等與QA／QC契約。未修改產品程式、provider環境或production資料。
- 2026-09-04：依使用者確認建立DEV-045 `Brief Ready`。固定Employee主入口、邀請新帳號／連結既有帳號雙路徑、OrgMaster治理編排／共同IAM執行責任、狀態與驗收方向；未修改產品程式或provider環境。

## DEV-044：地端測試角色一鍵登入

狀態：local implementation complete
文件成熟度：`RD Implementation Complete / Targeted Gates Passed / Browser QA-QC Passed / Full Regression Passed`
節點類型：開發點
優先級：P1
父交付點：DEV-040、DEV-043
是否計入產品交付完成：否
權威文件：`ai-doc/specs/DEV-044-local-test-role-one-click-login.md`
Readiness：`P0 gap=0 / P1 gap=0`

### Current Phase與驗收

- S1：✓ development profile registry、HttpOnly cookie、profiles／session／logout API與production negative gate。
- S2：✓ governance與management-method server capability依profile權限判斷。
- S3：✓ AuthGate四角色一鍵登入、登入狀態顯示姓名／角色與「切換角色」恢復流程。
- S4：✓ targeted 7 files／36 tests、typecheck、client／server build、A1～A8 browser QA／QC及可執行full regression 185 files／776 tests PASS、1 skipped。
- Stop condition：需要production identity／role寫入、跨repo契約、正式credential、deploy或release時停止。

### 變更紀錄

- 2026-09-04：依使用者要求建立DEV-044。Spec Impact Preflight=`Compatible exception`；保留正式Firebase/BFF與自動化exact-header入口，只新增development＋loopback測試角色。四個profile與API／cookie／permission／UI／failure recovery／QA-QC契約已達RD Implementation Ready，開始local implementation。
- 2026-09-04：local implementation完成。修正未配置production dependency時的地端logout與初始401 console噪音；四角色權限、重新整理、切換、HttpOnly cookie、員工登入身分入口、發布／模擬UI gate、三viewport、鍵盤與visible-error sweep均PASS。完整證據見`output/playwright/dev044/manifest.md`；既有localhost:5000 PID 12468保留運行。

## DEV-043：員工明細登入身分與帳號治理入口

狀態：local implementation complete（full regression follow-up open）
文件成熟度：`RD Implementation Complete / RD Technical Lead Passed / Targeted Gates Passed / Browser QA-QC Passed / Full Regression Follow-up Open`
節點類型：交付點
優先級：P1
父交付點：DEV-040、DEV-042；架構權威ADR-007
是否計入產品交付完成：是
權威文件：`ai-doc/specs/DEV-043-employee-identity-link-management.md`
Readiness：`P0 gap=0 / P1 gap=0`

### RD Technical Lead Review（2026-09-03）

- 結論：`Pass after contract optimization`；Employee維持主物件，identity link只作Employee relation，全域帳號治理不得升格為第二份帳號主檔。
- API只把verified actor轉成既有`UPSERT_IDENTITY_LINK` command，CAS、audit、validation與persistence重用現有store boundary；browser不得提交raw identity。
- current identity create／noop／reactivate／conflict、active-admission唯讀、global Employee CTA與App-owned refresh token已固定；identity mutation不依賴不相干的role catalog ready。
- 不新增schema、migration、provider adapter、event bus或client cache；任意IAM帳號搜尋／邀請留在DEV-040 production provider gate。

### Current Phase與驗收

- S1：新增server-derived current identity endpoint，補active principal／issuer-subject唯一性與API／validation tests。
- S2：Employee明細新增局部loading／empty／error／read-only／mutation完整狀態的「登入身分」區段。
- S3：全域section可見名稱改為「帳號治理」，Employee名稱open-or-focus員工明細，雙surface以App refresh token重讀canonical governance state。
- S4：targeted、typecheck、client/server build、B1～B7 browser QA／QC與排除兩個既有非 Vitest fixture的功能回歸通過；標準 full regression為`185 passed／771 tests／1 skipped`，另有兩個既有`No test suite found` discovery failures，已獨立追蹤；task-owned runtime完成清理。
- Stop condition：raw identity暴露、權限繞過、需要改schema／provider／production data或越出spec allowlist時立即回PM；不得另建帳號主檔或第二mutation path。

### 變更紀錄

- 2026-09-03：依使用者確認完成DEV-043 RD文件與RD技術主管審查。將主要入口固定在Employee detail，global identity section改為帳號治理索引；補server-derived actor endpoint、狀態矩陣、唯一性、permission、failure recovery、S1～S4與browser evidence contract。P0／P1 gap=0，開始local implementation。
- 2026-09-03：完成DEV-043 local implementation與B1～B7 browser evidence；targeted `6 files／25 tests`、typecheck、client/server build通過。標準 full regression為`185 passed／771 tests／1 skipped`，僅兩個既有`dev010-n2` script fixture因無 Vitest suite回報失敗；明確排除該兩檔後功能回歸仍為`185 passed／771 tests／1 skipped`。證據見`output/playwright/dev043/manifest.md`；未commit、merge、deploy或release。

## DEV-042：單層功能工作台與可收合清單明細

狀態：完成（production code、完整回歸與 Browser S7 均已關閉）
文件成熟度：`RD Implementation Complete / Browser QA-QC Passed / Merged to master`
節點類型：交付點
父交付點：DEV-039
是否計入產品交付完成：是
原始需求邊界：拆除所有快速抽屜與「在工作台開啟」的第二層轉換；所有功能由頂部入口直接進入工作台。有清單的工作台比照員工工作台，提供清單、緊鄰明細與可收合明細。
來源 ID：`USER-2026-09-02-SINGLE-LAYER-WORKSPACE-INTENTIONAL-REPLACEMENT`、`USER-2026-09-02-DEV042-RD-IMPLEMENTATION-READY`、`USER-2026-09-02-DEV042-RD-TECH-LEAD-REVIEW`
風險等級：Medium（跨全部功能入口、工作台狀態、URL 還原及既有跨面板互動，但預期不變更資料模型、API 或權限）
權威文件：`ai-doc/specs/DEV-042-single-layer-workspace-contract.md`
架構決策：`ai-doc/adr/ADR-009-composable-workspace-shell-boundary.md` DEV-042 amendment
Readiness：`P0 gap=0 / P1 gap=0`

### RD Technical Lead Review（2026-09-02）

- 結論：`Pass after contract optimization`；DEV-042 production implementation、完整回歸與 Browser S7 均已通過，正式交付 gate 已達成，僅保留 release authority boundary。
- 核心因果鏈：drawer／panel雙入口造成context與render owner同步責任，進而增加操作層級並允許跨region明細串位；完整移除drawer控制流、只留panel owner才是根因修正。
- 已移除三個不必要抽象：逐panel detail副本、`contextMode`與`none／collapsible／embedded` runtime taxonomy；改為session-owned唯一`openDetails`＋route projection、optional-context open intent與registry單一boolean。
- production allowlist已縮到必要shell／state／adapter；Process與Management Method領域page維持不變，只列required regression。source scan排除test檔，避免「測試必須引用禁用symbol、scan又要求全src零字串」的矛盾。
- `App.tsx`暫維持composition root，不為本DEV新增workspace service；只有context映射出現三個以上非App consumer或integration test無法隔離時，才另立重構DEV。

### 問題與目標

- 現行「頂部功能 → 快速抽屜 → 在工作台開啟 → 完整面板」讓同一功能同時存在抽屜狀態與面板狀態，使用者必須理解兩種容器及 promotion 行為，也讓 RD 維護兩份開啟、選取與脈絡同步路徑。
- 目標不是單純隱藏底部按鈕，而是把每個功能收斂為一個可組合面板：頂部入口負責開啟或聚焦；面板自己負責清單、選取、明細、編輯及其領域行為。
- 「單層」指只有一種工作空間容器與一條正式進入路徑；不代表把清單與明細混成同一內容，也不取消工作台內必要的資訊階層。
- 成功後，使用者只需記住「從功能入口開面板、在面板內完成工作」；系統只需維護一份 module context，不再同步 drawer context 與 panel context。

### Human Confirmed Product Decision

- 所有現有功能模組均由頂部「功能」入口直接開啟工作台；若該類型面板尚未開啟則新增，已存在則聚焦、展開並帶到可視區，不重複新增同類面板。
- 移除快速抽屜層、底部「在工作台開啟」按鈕，以及以 promotion 將抽屜轉成面板的產品概念。
- 有清單的模組採一致的 master-detail 骨架：清單靠左、明細緊鄰其右；點選清單項目開啟明細，關閉明細後只留下清單。
- 關閉明細不得清空清單搜尋、篩選、排序、選取來源脈絡或捲動位置；再次選取項目可於同一面板重新開啟明細。
- 組織架構圖等本質為畫布／完整 surface 的模組直接顯示其工作台，不被迫套入空的清單或明細欄。

### Intentional Replacement 邊界

- DEV-042取代DEV-039的`WorkspaceQuickDrawer`、drawer module registry／renderer、drawer session state、open／close drawer intent及drawer-to-panel promotion intent；exact symbols、刪除項目與保留邊界已由權威spec第3、10節固定，RD不得擴張allowlist。
- DEV-039 的 composable workspace、單一同類面板、分割／標籤排列、拖曳展開多視窗、可調整分隔線、固定／關閉、URL 還原、版本與 capability 判定仍是基線，不在本輪重建。
- DEV-041 的 Employee→Position、Duty→Position、ProcessNode↔Duty 共用 relation drag source／target、owner-canvas auto-pan、strict MIME、resolver、mutation owner與 zero-mutation guard必須完整保留。
- 現行 DEV-039／041 runtime 的既有能力已在 DEV-042 實作與 QA／QC 中完成回歸；不得將 `Browser QA-QC Passed` 解讀為 candidate freeze、commit、merge、deploy 或 release 已獲授權。
- 採 `Intentional Replacement`，禁止長期並存 `openDrawer → promote` 與 `openOrFocusPanel` 兩條正式路徑；若需要相容舊 URL，只能在入口做一次性 normalization，不能復活舊 UI 與第二份 business state。

### Current Phase Scope

- 將頂部所有已登錄功能統一接到「不存在則開啟、已存在則聚焦」的面板入口。
- 為有清單模組建立薄的共用 `ListDetailSurface` 概念：只擁有版面、明細開關、窄寬度投影、焦點與脈絡保存；清單欄位、明細內容、mutation、validation與權限仍由各領域 adapter 擁有。
- 員工、職位、部門、工作職掌與管理辦法使用共用可收合list-detail骨架；層級維持既有list-only surface，流程維持內建清單＋graph＋bridge的workbench。各模組保留既有完整功能，不以版面統一為由刪除其明細、編輯、風險、規劃或閱讀能力。
- 組織架構圖採直接畫布工作台；兼任風險與治理功能依既有資訊模型直接呈現完整 surface，若本身具有清單再採相同骨架，不為形式一致而製造空白欄。
- 清單與明細由左向右緊鄰排列；有足夠寬度時並排，面板被分割到窄寬度時允許在同一 surface 內切換成單欄明細，關閉明細回到原清單脈絡。
- drawer現況為session-only，沒有可分享drawer URL；既有Duty／Duty Planning／Process Planning／Management Method standalone route做一次性canonical normalization，新產生URL只表達panel、focus、合法module context與detail visibility。

### 模組 Surface 初始對照

| 模組 | DEV-042 預設 surface | 必須保留的核心能力 |
|---|---|---|
| 組織架構圖 | 直接畫布 | 組織圖、節點明細、viewport／zoom、關係落點與 auto-pan |
| 員工 | 清單＋可收合明細 | 搜尋、員工明細、職位／部門關係、整列關係拖曳 |
| 職位 | 清單＋可收合明細 | 搜尋、職位屬性、層級／部門／上級／員工指派 |
| 部門 | 清單＋可收合明細 | 部門資料與其職位／人員脈絡 |
| 層級 | 既有內嵌／清單 surface | 層級資料與所屬職位脈絡；現況沒有獨立detail owner，不製造空白明細 |
| 工作職掌 | 清單＋可收合明細 | 職掌資料、責任配置、責任盤點／分布及 Duty 關係拖曳 |
| 流程 | 既有內嵌 workbench | `ProcessPlanningWorkbench`內建流程清單、心智圖／流程圖與ProcessNode↔Duty關係配置；禁止外包成雙清單 |
| 管理辦法 | 清單＋可收合明細 | 自由創作、多媒體閱讀／編輯、既有治理與唯讀邊界 |
| 兼任風險 | 直接完整 surface；有清單時沿用共用骨架 | 現有兼任風險設定、啟用狀態與既有判定，不新增風險模型 |
| 治理 | 直接完整 surface | 現有治理資訊、版本／權限／唯讀規則與操作入口 |

### 主要操作流程

1. 使用者從頂部「功能」選擇模組。
2. 系統以 module ID 查找已開啟面板：不存在就新增到目前工作台，存在就聚焦既有面板；不得開啟 drawer 或建立重複面板。
3. 清單型面板第一次開啟時顯示清單；若 URL 或既有可還原 context 指定合法項目，可同時顯示該項明細。
4. 使用者點選清單項目，在緊鄰區域開啟同一項目的明細；工作台焦點與其他面板排列保持不變。
5. 使用者關閉明細，回到原清單搜尋、篩選與捲動位置；不關閉整個模組面板。
6. 使用者再次從頂部選同一功能時，只聚焦面板，不重設 query、selection、detail、scroll 或內部 viewport。

### 狀態與 URL 原則

- 每個 module panel 只有一個 context owner；清單 query／filter、selected entity、detail visibility、module view及可還原的 viewport 不得在 drawer 與 panel 間複製。
- URL 是可重新整理、返回／前進與分享的session快照，也是初始載入與Back／Forward時的hydration輸入；互動中的runtime authority仍是`WorkspaceSessionState`。session-only scroll／暫態hover可留在面板visual state，但不得形成第二份業務真相。
- `WorkspaceSessionState.openDetails`是唯一runtime明細開關，`WorkspaceRouteState.openDetails`只由既有`routeFromState／reconcileRoute`投影；canonical URL以`details=<module-id,...>`或`details=none`序列化。不在PanelSession建立逐panel副本。關閉明細只移除module ID並保留context ID、local selection、query、filter及mounted list scroll；關閉panel才移除layout／session／route context。
- detail close必須由可見close control完成並將focus還給來源row；不得新增global Escape listener。管理辦法dirty detail先走既有save／discard／keep-open guard，guard allow後才收合。
- invalid／deleted entity由registry sanitizer清除ID／local selection並移出`openDetails`，回到合法list surface；不得render空白detail。
- `WorkspaceOpenIntent`不帶context時只focus／reveal並保留既有context，明確帶context時才sanitize後替換；不另加`contextMode`造成重複語意。launcher永遠不帶context。
- exact types、route schema、history相容與舊standalone route normalization以權威spec第4節為準；不得發明第二router或第二state store。

### RD Implementation Contract 摘要

- 目標型別移除`DrawerWorkspaceModuleId`、`surface` drawer分流、`WorkspaceSessionState.drawer`與`PromotionIntent`；registry只新增`supportsCollapsibleDetail: boolean`，完整surface／內嵌workbench差異仍由module adapter擁有。
- exact replacement橫跨types、registry、reducer、controller、route、shell、launcher、App wiring、surface primitives與對應tests；`WorkspaceQuickDrawer.tsx`為唯一明確刪除的production檔案。
- 實作分為S0 contract guard、S1 core state／route、S2 shell／launcher removal、S3 master-data ownership、S4 Duty／Process／Management Method、S5 App convergence、S6 automated regression、S7 fresh browser QA／QC。
- production／test／document allowlist、targeted commands、三viewport、十模組normal-entry、DEV-041四向DnD、FMEA、cleanup及Git邊界均由`ai-doc/specs/DEV-042-single-layer-workspace-contract.md`擁有。
- Readiness：`P0 gap=0 / P1 gap=0`；RD可以開始，但`Implementation Complete`、`QA-QC Passed`與candidate authority仍須各自取得事實證據。

### 驗收方向

- 所有現有模組都能由頂部功能入口直接開啟或聚焦完整面板；產品畫面不再出現快速抽屜、底部「在工作台開啟」或 drawer promotion 中間態。
- 重複點擊同一功能不建立第二個同類面板、不重設既有工作脈絡，也不改動其他面板排列。
- 所有清單型模組均能完成「清單 → 開明細 → 關明細 → 回原清單位置」；搜尋、篩選、選取來源與捲動脈絡不遺失。
- 寬面板採左清單、右明細緊鄰；窄面板仍可完整完成清單與明細工作，不出現不可操作的壓縮雙欄、水平溢出或被遮蔽控制。
- 重新整理、瀏覽器返回／前進與可分享URL能還原已開啟panel、focus及合法的選取／detail context；既有standalone routes被一次性正規化且不重新顯示drawer。
- DEV-039 的 panel tab／split、分隔線調整、pin／close、read-only及狀態保護不回歸；DEV-041 四向跨面板關係拖曳、即時定位、auto-pan、zero-mutation及 console cleanliness不回歸。
- 手機延續專案最高原則唯讀；本 DEV 不因統一入口而暴露 mutation control。
- QA／QC 必須從正常頂部入口覆蓋所有模組，並以 source scan 證明舊正式 drawer／promotion 路徑已被移除，而不是只靠 CSS 隱藏。

### Out of Scope

- 不新增領域功能、資料實體、資料表、API、permission、role、Command、resolver、MIME 或第三方 workspace／DnD 套件。
- 不允許同一 module type 同時開啟多份面板，不重做工作台自由排列演算法，也不改寫 DEV-041 關係拖曳狀態機。
- 不把各領域清單與明細內容合併成大型共用元件；共用只限版面、開關、焦點與 context 接口。
- 不在本輪新增行動裝置編輯、多人即時共編、AI 自動選版或新的跨面板關係類型。
- 不因移除抽屜而刪除任何現有模組、兼任風險、管理辦法、流程、職掌或治理能力。

### 風險與控制

| 風險 | 影響 | Contract 控制方向 |
|---|---|---|
| 只隱藏抽屜而保留雙 state | 新舊路徑漂移、持續技術債 | Intentional Replacement＋source scan，正式路徑只留 open-or-focus |
| 共用元件持有領域規則 | mega component、回歸面擴大 | 共用骨架只處理 layout／context；領域 adapter 保持獨立 |
| 窄面板雙欄不可用 | 操作被壓縮、明細遮蔽 | responsive 單 surface 投影，關明細必回原清單脈絡 |
| 移除 drawer 造成能力遺失 | feature parity 回歸 | 以 DEV-039 parity manifest 為基線，逐模組核對所有入口與能力 |
| URL／返回行為失真 | 重新整理或分享後遺失工作狀態 | 依權威spec採唯一module context、`details` query與standalone route一次性normalization |
| 跨面板拖曳 source 消失 | 核心規劃流程中斷 | DEV-041 contract列為 required regression，不另建第二 binding |

### 限制、停止條件與下一步

- 本文件與 production code 已達 `RD Implementation Complete / Browser QA-QC Passed`；full regression 為 `174 files／716 passed／1 skipped`，S7 E1～E9與fixture cleanup均完成。僅 release gate與個別 Git authority 仍待明確授權。
- 若實作需要更動 schema、API、permission、DEV-041 resolver／mutation owner，或無法避免新舊正式路徑長期並存，立即停止並回 PM；不得以 facade、duplicate store或 feature flag 永久包住兩套架構。
- 若某模組無法在單一panel context保留必要脈絡，立即依spec stop condition回PM；不得為追求形式一致犧牲核心任務。Process與Level差異已在surface matrix固定，不再是待確認問題。
- 下一步只執行 local release gate 的核對；未取得使用者／PM明確授權，不執行candidate freeze、commit、merge、deploy或release。
- 本次已執行 DEV-042 production code與測試；未執行candidate freeze、commit、merge、deploy或release。

### 變更紀錄

- 2026-09-02：既有使用者 localhost:5000 完成探索性 browser smoke，確認十個頂部功能入口均可直接加入／聚焦，員工清單與相鄰明細可開關，關閉後來源列 focus restore且舊 `WorkspaceQuickDrawer` 未掛載；未使用 fresh fixture／task-owned runtime，正式 S7 仍維持 pending。
- 2026-09-02：依權威契約完成 DEV-042 production implementation。移除正式 drawer／promotion control flow，十模組統一頂部 open-or-focus；master-data／Duty／Management Method採相鄰list-detail，`openDetails`為session唯一明細權威，URL支援`details=none`與無效明細fail-closed，窄panel採單surface投影，明細關閉後恢復來源row focus。targeted `8 files／34 tests`＋`6 files／16 tests`、typecheck、client／server build、source scan與allowlist diff check通過；full regression `170 files／711 passed／4 failed／1 skipped`，四個失敗均為既有 DEV-040 tests；Browser S7尚未執行。狀態更新為`Implementation Code Complete / Targeted Automated Gate Passed / Full Regression Blocked by Pre-existing DEV-040 Failures / Browser QA-QC Pending`。
- 2026-09-02：依RD技術主管審查優化DEV-042契約，結論`Pass after contract optimization`。移除逐panel detail副本、`contextMode`及三態runtime taxonomy，固定session-owned唯一`openDetails`＋route projection、optional-context open intent與`supportsCollapsibleDetail:boolean`；補上`details=none`相容歧義修正、context／localSelection原子不變量、窄化production allowlist及排除test的source scan。P0／P1 readiness gap維持0；未修改產品程式或執行測試／commit／deploy。
- 2026-09-02：升級至`RD Implementation Ready`。建立權威spec並完成現況symbol、single open intent、session-owned detail state與route／URL projection、`details` route、十模組surface matrix、container responsive、accessibility、exact allowlist、S0～S7、targeted／browser evidence、FMEA、failure recovery及dirty-worktree Git boundary；ADR-009新增DEV-042 amendment。P0／P1 readiness gap=0；未修改產品程式或執行測試／commit／deploy。
- 2026-09-02：依使用者確認建立 DEV-042；固定單層功能工作台、頂部直接 open-or-focus、清單＋可收合明細、全模組 feature parity及 DEV-039／041 保留邊界。文件成熟度為 `Brief Ready`，未進入產品實作。
- 2026-09-02：依使用者要求直RD修復並完成驗證。修正 DEV-040 governance／catalog 測試契約漂移與 management-method local-development actor precedence，fresh Browser S7 E1～E9通過；全回歸 `174 files／716 passed／1 skipped`，typecheck、client／server build通過，fixture已archive。DEV-042狀態升為`RD Implementation Complete / Browser QA-QC Passed / Local Release Gate Pending`；未執行candidate freeze、commit、merge、deploy或release。

## DEV-041：跨面板關係拖曳互動一致化

狀態：完成（RD implementation、automated gate、四向native、owner canvas auto-pan、zero-mutation revision guard、console sweep與fixture cleanup均已通過，並已併入master）
文件成熟度：`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Passed / Merged to master`
節點類型：開發點
父交付點：DEV-039
是否計入產品交付完成：否（統一既有能力，不重複計算 DEV-039）
原始需求邊界：以目前員工清單拖曳的觸發條件與組織圖即時定位作為理想範本，其他相關關係配置拖曳比照辦理，並優先共用程式元件。
來源 ID：`USER-2026-09-01-RELATION-DRAG-INTERACTION-TEMPLATE`、`USER-2026-09-01-DEV041-HCS-R1-1A-2B-3A`、`USER-2026-09-01-DEV041-HCS-R2-4A-5A-6A`、`USER-2026-09-01-DEV041-HCS-R3-7A-8A-9C`、`USER-2026-09-01-DEV041-HCS-R4-10A-11A-12A`、`USER-2026-09-01-DEV041-HCS-R5-13A`、`USER-2026-09-01-DEV041-RD-IMPLEMENTATION-READY`
風險等級：Medium（跨多個使用者可見互動表面、React Flow 畫布與關係配置狀態機）
權威契約：`ai-doc/specs/DEV-041-relation-drag-interaction-contract.md`

### RD Technical Lead Review（2026-09-01）

- 結論：`Pass after contract optimization; P1 implementation correction closed`；共用 source／target binding 與 owner-canvas auto-pan 的邊界足夠薄，未新增第二 resolver、MIME、mutation owner、schema、API 或 drag dependency；原 Duty lane→ProcessNode source effect capability mismatch 已由 shared policy 修正並取得 RD probe。
- 核心因果鏈：分散 raw binding／錯誤 canvas owner → 各面板的 promotion、preview、auto-pan 不一致 → 使用者無法形成可預期的拖曳肌肉記憶，RD 只能持續局部修補。最小修正是共用互動 adapter，保留既有 domain authority。
- 已關閉：pointer origin 改用 module-local `WeakMap`；source `onBegin`／`onCancel` 與 target owner callbacks fail-closed；React Flow source 的 pointer／mouse capture 隔離；factory 重建、terminal cancel 與 target fail-closed regression 均有測試。
- 最終判定：使用者已接受noop／rejected在`dropEffect=none`下Chromium不派送terminal `drop`的原生行為；合法拖放仍要求terminal `drop`與恰好一次mutation，noop／rejected以terminal `dragend`、zero mutation、revision unchanged、session cleanup及0 console/pageerror判定。四向正常入口真實HTML5 native、Organization／Process四邊auto-pan、zero-mutation、console與cleanup aggregate均已取得，故狀態為`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`。

### P1 implementation blocker（2026-09-02；已關閉）

- 真實 system Chrome／Playwright 以全新 fixture `draft-5069a060-3786-40f6-874c-4e87434e6ba2`從職掌抽屜 `duty-dev039-b16-primary／primary-execute` 拖向未連結 `process-node-dev039-b16-open`；source／target皆為 shared binding，但事件止於 `dragstart→dragenter／dragover→dragleave→dragend`，沒有 `drop`，API未新增link。
- 根因候選已由靜態契約對照縮小為 source `effectAllowed=copyMove` 不涵蓋 link target 的 `dropEffect=link`；這不是新增 resolver 的理由。修正方向是由 shared adapter 計算多目標 source 的 effect union，再重跑四向 native evidence；禁止以 synthetic drop、鍵盤、API直寫或第二 binding 繞過。

### P1 implementation correction closure（2026-09-02）

- 根因已修正：`relationPlacementBindings` 不再接受 caller 自行指定 `effectAllowed`，改由 `relationEffectAllowedFor(payload)`集中推導；Employee=`copyMove`、Duty=`all`、ProcessNode=`link`，target仍由既有resolver投影實際`dropEffect`。
- 全新 fixture `draft-2e844948-3bec-4d3e-a2eb-824c26453bdf` 的 system Chrome 正常入口 probe 已觀察 strict MIME、`effectAllowed=all`、target `dropEffect=link`、target `preventDefault`、terminal `dragend`、API revision變更及canonical `process-duty-2` readback；fixture以`archived` readback清理，5080已釋放、5000未觸碰。
- P1 implementation blocker closed；runner未單獨列出`drop` listener，因此本筆不提升四向QA／QC aggregate。剩餘 gate為第11.2節定義的四向native、failure、auto-pan、console與cleanup。

### Fresh browser QA／QC gate（2026-09-02）

- 四向 native aggregate：四個彼此隔離 fixture、正常產品入口、system Chrome及真實 HTML5 `DataTransfer` 完成 `EMP-POS`、`DUT-POS`、`PROC-DUT`、`DUT-PROC`；每案均有 strict MIME、矩陣對應 `effectAllowed／dropEffect`、terminal `drop／dragend`、revision change、canonical relation readback及 0 console/pageerror。證據索引：`output/playwright/dev041/F041-QA-QC-native-aggregate.json`。
- Owner canvas auto-pan：Organization `canvas-wrap`與Process `process-planning-canvas`各自以真實 native drag驗證 left／right／top／bottom 四邊 translation改變、zoom不變、取消後revision不變，且兩案 console/pageerror均為0；同一aggregate的`autoPan.records`保存before／after viewport。
- Zero mutation：`NOOP-EMP-POS`與`REJECT-PROC-POS`均確認revision before／after相同、strict MIME、terminal dragend、session cleanup及0 console/pageerror。Chromium在`dropEffect=none`時不派送terminal `drop`；使用者已接受此原生行為，因此aggregate disposition為`pass`，且不得為補事件而新增第二resolver、synthetic drop或fallback。
- Fixture／runtime cleanup：四向、zero-mutation與auto-pan fixture均以同一 version id取得 `archived` readback；task-owned `5080`已釋放，user-owned `localhost:5000`未觸碰。aggregate保存各 cleanup manifest revision。
- Gate判定：`四向 native=Pass`、`auto-pan=Pass`、`console sweep=Pass`、`zero mutation=Pass`、`Browser native QA/QC=Pass`。DEV-041已達`Candidate Freeze Ready / Authorization Pending`；未授權freeze／commit／merge／deploy／release。

### 問題與使用者價值

目前員工、組織圖內員工、工作職掌、流程節點與流程－職掌橋接雖共用 typed payload、registered drop resolver 與 Relation Placement Session，但各元件仍分別實作 `dragstart`、`dragover`、`drop`、焦點復原及畫布定位。相同行為分散後，員工拖曳改善不會自然套用到其他來源，容易出現可拖範圍、落點回饋、取消行為與自動平移不一致。

本 DEV 的價值是把已獲使用者確認的員工互動轉成可重用契約：使用者不必重新學習不同模組的拖曳方式；RD 只維護一套互動核心；新增關係來源時能沿用同一安全、可及與效能邊界。

### Human Decision Brief

- `Human Confirmed`：員工清單整列可拖曳、拖向組織圖時提供即時落點定位與畫布邊緣平移，作為其他相關關係配置拖曳的理想行為範本。
- `Human Confirmed`：其他已登錄的關係配置拖曳應比照相同觸發、落點回饋、完成後行為、取消、焦點復原與即時定位規則。
- `Human Confirmed`：優先共用元件，避免每個模組複製事件處理。
- `1A / Human Confirmed`：「其他相關拖曳」固定為 DEV-039 已登錄的 Employee→Position、Duty→Position、ProcessNode↔Duty Relation Placement；職位階層重排、工作台面板排列與舊職掌矩陣／異常卡片內部拖曳不在本輪。
- `2B / Human Confirmed / Intentional Replacement`：所有上述來源都以整個來源物件／卡片作為拖曳表面，不使用只有部分區域可拖或永久顯示的專用拖曳把手。此決策取代先前「各領域自行選擇拖曳表面」的 PM refinement；互動控制排除與拖曳啟動門檻依 `4A／5A`。
- `3A / Human Confirmed`：同一 DEV 內先以員工作 reference migration，再依序遷移其餘已登錄來源；每一步可獨立測試，但所有來源完成 parity 後才交付，不發布或長期保留新舊兩套 drag binding。
- `4A / Human Confirmed`：整個來源物件／卡片是主要拖曳表面；其內的按鈕、輸入框、選單、連結及其他互動控制保留原操作，且不得啟動 Relation Placement 拖曳。共用 source binding 必須以一致 interactive-descendant policy 隔離這些事件，不由各卡片自行補例外。
- `5A / Human Confirmed`：沿用員工範本的瀏覽器原生滑鼠移動門檻；主要滑鼠鍵按下後，只有移動超過原生門檻才進入拖曳。短按 click 保留既有選取／開啟行為，不採 pointerdown 立即抓取或 450ms 長按。
- `6A / Human Confirmed`：即時定位只在游標接近目前 owner canvas 四邊時平移該畫布；保留使用者當下 zoom 與 viewport，不自動置中、fit view 或重設縮放。組織圖與流程圖必須各自使用所屬 React Flow instance。
- `7A / Human Confirmed`：所有 registered target 沿用一致三態回饋：藍色表示可放置、黃色表示已存在／不需變更、紅色表示拒絕；每一態同時提供圖示、文字或等價非色彩提示，不得只靠顏色判讀。
- `8A / Human Confirmed`：成功放置後保留目前 canvas viewport 與 zoom，只短暫強調實際落點並顯示非阻斷式成功狀態；不自動開啟明細、不重新置中，也不把使用者帶離目前規劃脈絡。
- `9C / Human Confirmed / Intentional Replacement`：第一版只標準化與驗收滑鼠 Relation Placement，不在本輪新增或重設 Space／Tab／Enter／Escape 鍵盤抓取與落點循環。DEV-039 已存在的鍵盤 placement 保留為相容基線，不得因整卡 source migration 被刪除或降級；新的完整鍵盤 UX 保留為 future capsule。
- `10A / Human Confirmed`：在 noop 或 rejected target 放開時零 mutation、零 modal，來源留在原工作脈絡；系統短暫顯示「關係已存在」或 resolver 提供的具體拒絕原因，不得靜默失敗。
- `11A / Human Confirmed`：拖曳開始後，只有目前 payload 可接受的 registered targets 顯示低強度候選提示；游標實際指向的 target 才升級為明確藍／黃／紅三態及原因。不得把整張畫布預先染成完整警示狀態。
- `12A / Human Confirmed`：成功配置後保留來源選取與清單捲動位置；只要 domain resolver 仍允許，使用者可立即把同一來源拖向其他目標。系統不自動跳到下一來源，也不清除來源選取。

### 主要流程

1. 桌面可編輯狀態下，使用者從來源物件／卡片的非互動區域按住主要滑鼠鍵並移動超過瀏覽器原生門檻後開始拖曳；短按仍執行既有選取／開啟。第一版不新增鍵盤抓取入口或新提示，DEV-039 既有鍵盤路徑維持相容。
2. 系統沿用唯一 typed payload 與 Relation Placement Session；拖曳開始時，以低強度提示目前 payload 可接受的 registered targets，不建立第二套 drag state、MIME 或 resolver。
3. 游標接近目前 owner 畫布四邊時，該畫布即時平移；組織圖與流程圖分別由自己的 React Flow adapter 執行，且不自動置中、fit view 或改變 zoom。
4. 游標指向的 target 以藍色、黃色、紅色及相應非色彩提示，一致呈現可建立、已存在／不需變更及拒絕；放下前仍由 registered resolver 重新判斷。noop／rejected 放置零 mutation、零 modal，並短暫顯示具體原因。
5. 合法放置沿用既有 mutation authority、Undo／Redo、autosave 與版本 CAS；成功後保留 viewport／zoom、來源選取與清單位置，短暫強調落點並顯示非阻斷式狀態，不自動開明細。若 resolver 允許，同一來源可立即繼續配置；取消、能力撤銷或 surface 關閉皆不得 mutation，並恢復來源焦點。

### Current Phase Scope

- 建立薄型共用互動層，責任至少分成 Relation Drag Source、Relation Drop Target 與 Canvas Auto-pan adapter；由各領域傳入 typed payload 與 registered target，來源元件根節點統一掛載整物件 drag binding。
- Relation Drag Source 內建唯一 interactive-descendant policy：`button`、表單控制、連結、選單及等價互動元件不得啟動關係拖曳，也不得破壞其 click、focus、keyboard 或既有命令；各領域不得另建不一致的事件白名單。
- 以員工清單作 reference implementation，在行為不變的前提下先遷移到共用層，再依序遷移組織圖內員工、職掌責任來源、流程節點與流程－職掌橋接；各步可獨立驗證，但交付前必須移除所有被取代的舊 binding。
- 統一第一版 native mouse drag 的 begin／cancel、source identity、焦點復原、strict MIME、effectAllowed／dropEffect 及狀態提示；滑鼠採瀏覽器原生移動門檻，短按不得建立 session，也不新增長按計時器。
- 既有 DEV-039 keyboard placement 若仍能由產品入口觸發，必須維持相同 session／resolver／mutation 結果；本輪不重設計、不擴張，也不得為移除 mouse-only 把手而誤刪其可用能力。
- 統一 valid／noop／rejected 候選回饋為藍／黃／紅三態，並提供圖示、文字或等價非色彩提示；候選相同時不得重複更新狀態。
- 統一提示密度：drag begin 只為目前 payload 可接受的 registered targets 顯示低強度候選提示，hovered target 才顯示完整三態、原因與強調邊界；不得預先高亮全部不相容目標。
- noop／rejected release 只結束本次 drag preview，維持零 mutation、來源選取及畫面脈絡，並以非阻斷式狀態顯示既有關係或具體拒絕原因。
- 統一成功完成回饋：保留 owner canvas viewport／zoom，短暫強調實際落點並發布非阻斷式成功狀態；不得自動開明細或改變工作台焦點。
- 成功後保留來源選取及來源清單 scroll offset；只有 registered resolver 允許時，同一來源才能再次配置到其他目標，不另建批次配置規則。
- 畫布平移必須以 `requestAnimationFrame` 節流，並由實際 owner canvas 的 React Flow instance 執行；不得由組織圖 instance 控制流程圖，也不得自動置中、fit view 或改變使用者 zoom。
- 新增 source／target matrix regression 與 architecture policy，防止 raw drag binding 再散落回各領域元件。

### RD Contract Handoff

- Existing truth：`workspace/entityDrag.ts` 保持唯一 strict MIME／typed resolver；`workspace/relationPlacement.ts` 保持唯一 session；App composition root 保持 latest-state／capability revalidation、mutation、notice與focus owner。
- 共用層固定為三個薄責任：Source Binding只處理整卡native source與interactive-descendant policy；Target Binding只把唯一resolver結果投影為available／valid／noop／rejected；Canvas Auto-pan Adapter只操作自己owner的React Flow instance與`requestAnimationFrame` lifecycle。
- 事件固定為 browser `dragstart`後才begin、`dragenter／dragover`只preview、`drop`重新parse並以latest state重算、valid只commit一次、noop／rejected／stale／capability loss／unmount全數zero mutation並清理candidate及pending frame。
- Source／target矩陣固定為Employee→Position、Duty→Position、ProcessNode→Duty與Duty→ProcessNode；資料、API、permission、version、autosave、CAS與dependency impact皆為`None expected`。
- 正常入口固定由`/`進入，透過頂部「功能」把來源與目標開到工作台；RD實作後必須以真實滑鼠、strict DataTransfer、normal-entry browser evidence驗證，direct URL、synthetic event或API直寫不得單獨宣稱通過。
- 詳細行為、失敗復原、UI狀態、QA／QC、evidence欄位與停止條件以`ai-doc/specs/DEV-041-relation-drag-interaction-contract.md`為唯一Current Phase權威。

### RD Implementation Handoff

- Exact新增邊界固定為`src/workspace/relationDragInteraction.ts`、`src/components/workspace/relationPlacementBindings.ts`、`src/components/workspace/useRelationCanvasAutoPan.ts`及對應測試（含`OrgNode.relation-drag.test.tsx`）；共用層只做純投影、React event接線及owner-canvas rAF，不擁有domain rule。
- Exact遷移邊界固定為`App.tsx`、`DirectoryDock.tsx`、`OrgNode.tsx`、`ProcessPlanningCanvas.tsx`、`ProcessPlanningWorkbench.tsx`、`ProcessDutyBridge.tsx`與shared CSS；`entityDrag.ts`、`relationPlacement.ts`、Commands、API、schema、permission、package及lockfile維持不變。
- RD依`S0 red tests → S1 pure interaction → S2 shared adapters → S3 Employee → S4 Duty→Position → S5 ProcessNode↔Duty → S6 convergence → S7 verification`執行；中間態不得候選交付。
- Organization與Process各自呼叫一次auto-pan hook並操作自己的React Flow instance；App移除organization-specific preview pan，只保留唯一session、latest-state／capability revalidation、commit與約900ms UI-only outcome lifecycle。
- Source adapter的`onBegin`／`onCancel`是required lifecycle callbacks；任一缺失時不輸出native draggable。Target adapter只有在`available`且同時具備owner `onPreview`／`onCommit`時才攔截native dragover／drop，否則fail-closed。
- 永久mouse handles移除；Duty directory與Process node原keyboard action轉為不佔版面的focus-only action，其他既有Space／Enter路徑保留。無法同時達成時停止回PM。
- RD Technical Lead Review固定五個exact source roots；button本身可作source root，但其互動後代須排除。available只消費既有`resolveRelationPlacementCapability()`結果，DEV-041不得另建pair table／switch。
- `preview`必須同步回傳latest-state candidate；registered target的dragover不停止冒泡，讓owner canvas可在空白區及node上持續auto-pan。target leave只清hover，owner leave只清該canvas rAF，terminal cancel才清全部placement。
- 未追蹤`src/components/DirectoryDock.employee-drag.test.tsx`不屬於required gate或allowlist；Employee／Duty正式parity由shared adapter tests、既有Process tests、OrgNode parity test與source policy共同承接。
- Targeted command、FMEA、fresh fixture、browser evidence provenance、dirty overlap及exact Git allowlist均以權威spec第15～20節為準；P0／P1 specification gap=`0`。

### Out of Scope

- 不新增 employee／duty／process-node 以外的新 payload kind、關係類型或未登錄落點。
- 不修改 domain resolver、Command、schema、API、permission、version storage、autosave 或持久化格式。
- 不建立一個同時擁有所有領域版面與商業規則的大型視覺元件；各領域仍保留自己的卡片呈現，但卡片根節點共用同一 drag source binding。
- 不重構職位階層拖曳、工作台面板排列或歷史職掌矩陣／異常修復拖曳。
- 不新增手機／觸控編輯；手機延續專案最高原則唯讀。
- 不為桌面 Relation Placement 新增 450ms 長按、pointerdown 立即抓取、強制置中或自動縮放等第二套互動模式。
- 第一版不新增鍵盤抓取、落點循環或新的等價配置 UI；DEV-039 既有鍵盤相容基線保留，但不以此宣稱 DEV-041 已完成新的鍵盤 UX。
- 不為 noop／rejected 結果開啟 modal，不自動選取下一來源、清空來源選取或重設來源清單位置。

### 驗收方向

- 員工清單整列的標題區、文字區與可用空白區都能啟動同一拖曳；卡片內互動控制除外，普通 click／Enter 仍只選取或開啟既有行為。
- 員工、組織圖內員工、職掌責任與流程節點的整個來源物件／卡片均可啟動相同 begin／preview／commit／cancel 契約；永久拖曳把手與部分區域拖曳入口不存在。
- 卡片內嵌套按鈕、輸入框、選單、連結、明細入口、責任選擇與 React Flow 畫布操作不得誤觸拖曳，且仍可 click、focus 與鍵盤操作；所有來源共用同一 interactive-descendant policy。
- 主要滑鼠鍵短按不得建立 Relation Placement Session；只有移動超過瀏覽器原生門檻才開始 native drag，且不得因計時器、pointerdown 或輕微手抖誤觸。
- 合法落點以藍色、noop 以黃色、拒絕以紅色呈現，三者均有非色彩提示；放下時以最新 state 重新驗證，失敗不 mutation。
- drag begin 後只有目前 payload 可接受的 registered targets 出現低強度候選提示；只有 hovered target 顯示強烈三態與原因，畫布其餘節點不被大量警示色覆蓋。
- noop／rejected release 不產生 Command、history、dirty、autosave 或 version mutation；畫面不開 modal，並能分辨「關係已存在」與具體拒絕原因。
- 組織圖及流程圖在四邊都能即時平移，且不跳動、不跨 canvas 操作、不因高頻 `dragover` 造成明顯重繪抖動；全程保留原 zoom，不自動置中、fit view 或重設 viewport。
- 成功放置後 viewport／zoom 與工作台焦點保持不變；實際落點短暫強調並出現非阻斷式成功狀態，且不自動開啟明細。
- 成功放置後來源仍維持選取，來源清單 scroll offset 不跳動；resolver 允許多重關係時可立即重複拖曳同一來源，否則下一次候選正確顯示 noop／rejected。
- 第一版不新增或宣稱 DEV-041 的 Space／Tab／Enter／Escape 鍵盤 UX；DEV-039 既有可達鍵盤 placement 不得回歸，滑鼠流程仍須維持來源焦點可恢復，新的完整鍵盤等價配置依 future capsule 重新進入。
- 唯讀、手機、來源／目標 surface 關閉、capability loss 及 stale payload 均 fail closed；既有 Undo／Redo、autosave、版本 CAS 與跨面板關係結果不回歸。
- RD 實作後至少以 targeted unit／component tests、architecture source policy、typecheck、build，以及正常產品入口的桌面原生滑鼠拖曳 targeted QC 支持結論；direct URL 或 synthetic event 不得單獨宣稱 UI 交付通過。

### 限制與重新進入條件

- 現有 `workspace/entityDrag.ts` 的 typed payload／registered resolver、`workspace/relationPlacement.ts` 的唯一 session，以及 App composition root 的 mutation ownership 均為既有權威，不得在共用元件內複製商業規則。
- 若遷移必須新增第二 MIME、第二 resolver／mutation owner、global event bus、第三方 DnD dependency、跨畫布單一 React Flow instance，無法避免與職位階層／流程節點 gesture 衝突，或必須刪除DEV-039既有鍵盤能力，停止並回 PM 做架構決策。
- 本輪已完成S0～S7 shared-boundary automated implementation並通過automated gate；`Duty lane→ProcessNode` native effect capability P1 blocker已由shared policy correction關閉，且正常入口的真實 HTML5 `DataTransfer` 四向、zero-mutation revision guard、auto-pan、API／revision、cleanup／console aggregate已取得。唯一開放項為 noop／rejected `dropEffect=none` 的 Chromium terminal drop effect policy；candidate commit、merge、deploy及release仍未授權。

### Future Phase Capsule：鍵盤等價配置

狀態：`Future Phase Captured / Not Requested`

- 目的：在保留DEV-039現有鍵盤相容基線的前提下，讓無法使用滑鼠或偏好鍵盤的使用者，以可發現且可完整完成的方式建立同一 registered relation；不得新增第二 resolver、mutation owner 或商業規則。
- 邊界：未來再統一抓取、目標循環、提交、取消、焦點復原與狀態宣告；Current Phase不新增半套快捷鍵、隱藏入口或只供自動化使用的鍵盤捷徑，也不刪除既有可用能力。
- 依賴：共用 Relation Drag Source／Drop Target 狀態與 registered target matrix 先穩定，且需完成可及性與 React Flow gesture 衝突評估。
- 驗收方向：鍵盤與滑鼠產生相同 resolver／Command 結果、拒絕相同非法關係，並可在正常產品入口完成整段操作。
- 重新進入條件：使用者要求鍵盤／輔助科技支援、產品需達成對應 accessibility conformance，或第一版滑鼠核心完成後進入下一輪互動能力規劃。

### 變更紀錄

- 2026-09-01：依使用者確認的員工拖曳觸發與即時定位範本建立 `DEV-041 Brief Ready`；採共用 headless 互動核心，不擴張 DEV-039 frozen scope。
- 2026-09-01：引導決策 `1A／2B／3A` 寫回；固定已登錄 Relation Placement 範圍、所有來源整物件／整卡拖曳，以及同一 DEV 內分步遷移但全部 parity 後才交付。
- 2026-09-01：引導決策 `4A／5A／6A` 寫回；固定整卡拖曳但排除互動控制、採瀏覽器原生移動門檻區分 click／drag，以及只做 owner canvas 四邊平移且保留 viewport／zoom。
- 2026-09-01：引導決策 `7A／8A／9C` 寫回；固定三態且非僅色彩的落點回饋、成功後保留工作脈絡，以及第一版只交付滑鼠拖曳並將鍵盤等價配置移至 future capsule。
- 2026-09-01：引導決策 `10A／11A／12A` 寫回；固定 noop／rejected 零 mutation 且顯示原因、低強度候選加 hovered 強回饋，以及成功後保留來源選取／清單位置供合法連續配置。主要產品決策完成至 `12A`。
- 2026-09-01：依 `13A` 升級為 `RD Contract Ready`；盤點既有 single MIME／resolver／session／mutation owner，建立intentional replacement、三個共用薄層、狀態事件、來源目標矩陣、資料／API／權限／相容、normal-entry UI、QA／QC evidence與停止條件。未進入產品實作。
- 2026-09-01：依使用者要求升級為`RD Implementation Ready`；補齊exact新增／修改／維持不變檔案、共用adapter API、keyboard相容策略、S0～S7遷移、failure recovery、targeted commands、fresh evidence、FMEA、dirty-worktree provenance及Git allowlist。P0／P1 spec gap=0；未進入產品實作。
- 2026-09-01：完成RD Technical Lead Review並優化DEV-041權威contract；關閉第二pair矩陣、主要文字區被interactive policy排除、非同步preview／事件冒泡未定、target與canvas cleanup混用及未追蹤測試作Gate五項風險。狀態維持`RD Implementation Ready / Implementation Not Started`，review verdict=`Pass after contract optimization`。
- 2026-09-01：依DEV-041 contract完成S0～S6及S7 automated implementation：新增純互動、headless source／target binding與owner auto-pan；完成Employee／Duty／ProcessNode四向surface migration、outcome lifecycle、shared CSS、keyboard compatibility與source policy；新增OrgNode parity test。targeted `11 files／48 tests`、full `170 files／689 tests（1 skipped）`、typecheck與build均通過；browser smoke確認正常入口 selectors及舊handle移除。狀態更新為`RD Implementation Complete / Automated Gate Passed / Browser Native Evidence Pending`；native DataTransfer QA／QC仍開放，未授權candidate freeze或commit。
- 2026-09-01：RD Technical Lead follow-up定位ProcessNode在React Flow內的native promotion阻斷：ancestor `mousedown`會在瀏覽器`dragstart`前攔截。未新增第二拖曳路徑，僅在共用source adapter加入明確的`stopMouseDownPropagation`選項並由ProcessNode root啟用；補shared adapter regression，保留其他surface事件流。其後以全新fixture及system Chrome正常入口完成一條`ProcessNode→Duty` native RD probe，artifact=`output/playwright/dev041/F041-S7-PROC-DUT-native-rd-probe.json`；另將`onBegin`收斂為必要callback，缺失時fail-closed，並將`onCancel`收斂為required，缺失時不輸出draggable；target若缺`onPreview`／`onCommit`亦 fail-closed。targeted `11 files／52 tests`、full `170 files／693 tests（1 skipped）`、typecheck與build通過；另補factory重建後pointer-origin、terminal cancel及target fail-closed regression，四向native、failure cases、console與cleanup仍由QA／QC gate獨立補齊。

- 2026-09-02：完成 DEV-041 fresh browser QA／QC aggregate。四向 `EMP-POS`／`DUT-POS`／`PROC-DUT`／`DUT-PROC` 以四個獨立 fixture、正常產品入口、system Chrome及真實 HTML5 DataTransfer取得 strict MIME、正確 effect negotiation、terminal drop／dragend、revision change、canonical readback與 0 console/pageerror；Organization／Process owner canvas 四邊 auto-pan、zoom保留、取消後revision不變亦通過。`NOOP-EMP-POS`／`REJECT-PROC-POS`確認zero mutation與terminal dragend，但Chromium在 `dropEffect=none` 不派送terminal drop，記為 `pass-with-browser-gap`；aggregate=`output/playwright/dev041/F041-QA-QC-native-aggregate.json`。所有fixture cleanup均`archived`，5080已釋放、5000未觸碰。DEV-041現行狀態更新為`RD Implementation Complete / Automated Gate Passed / Browser Native QA-QC Partial / Effect Policy Decision Pending`，未授權candidate freeze／commit／merge／deploy／release。
- 2026-09-02：使用者接受Chromium在`dropEffect=none`時不派送terminal `drop`的原生行為。驗收契約收斂為：合法拖放要求terminal `drop`與恰好一次mutation；noop／rejected要求terminal `dragend`、zero mutation、revision unchanged、session cleanup及0 console/pageerror。aggregate增加`contractDecision`並將zero-mutation disposition更新為`pass`；產品程式與effect policy不變。DEV-041更新為`Browser Native QA-QC Passed / Candidate Freeze Ready / Authorization Pending`，未授權freeze／commit／merge／deploy／release。

## DEV-040：鉦富平台角色生效與 AI-PDM 既有使用者整合

狀態：部分完成（整體`RD Contract Ready / ID1A-ID1B Local Implementation Complete / Human Decision Gate Complete through 1B／2A／3D`；DEV-004=`004-S0～S5 Local PASS / Live G2 Gated`；DEV-006=`S1～S3 Complete / S4A Consumer Fixture Gate PASS / S4B Release Gate Required`；`040-ID1A／ID1B=Local Implementation Complete / Targeted QA-QC PASS`；`JMS-PLATFORM-005 OrgMaster slice=005-S0～S4B Local-Isolated PASS / 005-S5 Local Targeted PASS / Production Authority Switch Gated`；`JMS-PLATFORM-009=009-S0～S4 Local-Isolated Complete / Targeted QA-QC PASS / 009-R1 Release Gate Required / Production Release Gated`）
文件成熟度：`RD Contract Ready；040-ID1A／ID1B RD Implementation Complete／Targeted QA-QC PASS；JMS-PLATFORM-005 OrgMaster slice RD Implementation Complete / 005-S0～S4B Local-Isolated PASS / S5 Local Targeted PASS；JMS-PLATFORM-009 OrgMaster slice Local Implementation Complete／Targeted QA-QC PASS；DEV-004 Local Implementation Complete；DEV-006 S1～S3 RD Implementation Complete / S4A Consumer Fixture Gate PASS`
節點類型：開發點
父開發點：DEV-037
是否計入產品交付完成：否（跨 repository 交付由 Jenfu Management System DEV-001 計算）
來源 ID：`USER-2026-08-30-JENFU-PLATFORM-HCS-4A-5A-6B`、`USER-2026-08-30-JENFU-PLATFORM-HCS-ROLE-RESET-CUTOVER-ADMIN-SCOPE`、`USER-2026-08-30-JENFU-PLATFORM-HCS-PRESTAGE-PILOT-LEGACY-OBSERVATION`、`USER-2026-08-30-JENFU-PLATFORM-HCS-SUPERADMIN-ZERO-TOLERANCE-OBSERVATION-WINDOW`、`USER-2026-09-01-JENFU-ACCOUNT-TAXONOMY-1B-2A-3D`、`USER-2026-09-01-POSITION-ROLE-UTILITY`、`USER-2026-09-01-DEV040-ONE-TIME-DIRECT-UUIDV7-REKEY-EXCEPTION`
風險等級：High（身分准入、既有帳號 migration、跨 schema entitlement 與直接角色生效）
權威 RD Contract：`ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md`
架構決策：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md` 2026-08-30 amendment

### Human Decision Brief

- `4A / Human Confirmed`：Phase 1 在共同 Cloud SQL logical database 由 OrgMaster 發布 `access_governance.v_effective_role_assignments_v1`，作為 versioned read-only pull adapter；禁止 app 讀 OrgMaster 私有 table 或跨 schema DML。
- `5A / Human Confirmed`：human共同IAM subject必須唯一對應active OrgMaster employee；AI-PDM現有帳號保留Firebase UID、`pdm_user_id`與生命週期納入inventory，再依taxonomy分流human migration／shared retirement。
- `6B / Human Confirmed`：所有外部 app role 由具授權的角色管理者發布後直接生效；Phase 1 不依 high-risk metadata 另設 maker-checker，但 risk 顯示、reason、before / after 與 immutable audit 必須保留。
- `7B / Human Confirmed`：AI-PDM 既有 role 全部重設，不 mapping、不匯入、不發預設 role；切換後只信任 OrgMaster assignment。
- `8A / Human Confirmed`：cutover 採 dry-run、freeze、分批 authority switch、session invalidation、reconciliation 與 rollback point，不採一次切換或長期雙權威。
- `9A / Human Confirmed`：角色直接生效能力採 app-scoped role administrator，只能管理被授權 application。
- `10A / Human Confirmed`：cutover 前先建立待生效 assignment，通過 identity、catalog、scope 與 completeness validation；只在所屬 batch switch 時原子啟用，不得提前授權。
- `11A / Human Confirmed`：先做涵蓋一般使用者、主管與管理員的 cross-role pilot；gate 全數通過後再按部門分批。
- `12A / Human Confirmed`：legacy AI-PDM role 欄位於 cutover 後唯讀觀察，不參與授權；完成 reconciliation 與 rollback window 且通過移除 gate 後才移除。
- `13B / Human Confirmed`：OrgMaster super administrator 永久具跨 app role-management override；這是 `9A` 的唯一例外，每次使用需理由、不可變 audit 與即時告警。
- `14A / Human Confirmed＋Safety Refinement`：P0／P1 mismatch或非預期擴權／失權零容忍；session refresh pending停止下一批並由durable outbox重試，只有錯誤授權才rollback。
- `15A / Human Confirmed`：legacy role 自最後一批通過起唯讀保留 30 日或兩個 production release cycle，取較晚者；雙方 owner 簽核對帳且 rollback dependency 解除後才移除。
- `1B / Human Confirmed`：互動使用者一人一個公司managed identity；需郵件者用Workspace，只需內部系統者可用Cloud Identity Free，個人Gmail只作有期限例外，員工編號只作login alias。
- `2A / Human Confirmed`：移除泛用／共用管理員帳號；一般管理角色直接指派employee。`info@`／`sales@`等共用信箱退出平台登入、principal與role模型。
- `3D / Human Confirmed`：一般app-scoped管理用日常個人identity＋step-up；基礎設施、production switch、OrgMaster super-admin／cross-app override與授予管理能力用同employee下person-specific privileged identity。
- `Position-to-Role / Human Confirmed`：採`User → Position → Application Role → Permission`，不採`Position = Role`；新任職只產生建議，經app-scoped role administrator發布後才授權。`#效用理論`
- `App-local Role UI / Human Confirmed`：AI-PDM一般角色指派改在AI-PDM「角色能力」，採Role→adopted Position→Employee；AI-PDM BFF呼叫OrgMaster governance API，OrgMaster仍是canonical assignment／version／audit authority。
- `System Administrator Privileged Governance / Human Confirmed`：不將`system_admin`移出OrgMaster，而是從一般Position／Employee指派抽離；OrgMaster既有「角色指派」選到該角色時就地顯示「特權設定」，只授予exact active `human_privileged` principal，不新增頁面。AI-PDM只保留Permission mapping、runtime enforcement與redacted導引。OrgMaster離線凍結mutation，不中斷Tier-0 runtime authorization。
- `Intentional Replacement`：修訂 ADR-007 原本只列 API／manifest／event adapter，以及 high-risk 外部角色申請／核准的 future target。
- `Intentional Replacement`：修訂四筆AI-PDM帳號都映射employee與`info@`作管理員帳號的舊假設；歷史reconciliation不回寫。
- `Intentional Replacement / One-time Exception`：`040-ID1`把目前 OrgMaster 非UUIDv7 Employee ID直接改鍵為UUIDv7，既有有效UUIDv7原值保留；同步重寫所有受影響的當前有效reference，只產生一份新V8 baseline。舊Employee ID、舊organization version及舊ID audit不作為保留條件，不建產品級legacy mapping；不改變`info@`非破壞退場及AI-PDM role cutover。
- `Historical Evidence Preserved`：DEV-037 local-only V2、published versions、audit 與 QA/QC 不回寫、不刪除，也不能證明 DEV-040 已實作。

決策來源：2026-08-30使用者完成原角色／cutover引導決策；2026-09-01確認帳號治理`1B、2A、3D`，並對`040-ID1`確認一次性直接 UUIDv7 rekey 豁免。

使用思考習慣：#效用理論、#系統描繪、#當責

### 問題與使用者價值

OrgMaster 已能在本機治理外部角色指派，但 AI-PDM 仍有自己的既有 users、Firebase UID、local role 與 session。若新平台只建立新帳號或以 email 對人，會造成重複帳號、歷史資料失聯與錯誤授權；若 app 直接查 OrgMaster 私有 table，又會破壞資料 ownership。

本 DEV 的價值是以既有 stable identity 做非破壞整合，並把 OrgMaster 指派轉成 app 可安全消費的版本化 read model。管理流程保持單一授權管理者直接生效，但用最小權限、不可變 audit、撤銷與 fail-closed 控制單人誤操作風險。

### Current-state Evidence

- AI-PDM `platform_principal_mappings.external_subject` 已保存 Firebase UID，並以 `pdm_user_id` 唯一連回既有 user。
- AI-PDM Firebase session repository 先依 UID 解析 principal，再檢查既有 account lifecycle；此 bridge 可作 migration source，不需重建帳號。
- AI-PDM `users.role` 只作 legacy inventory／歷史資料；依 `7B` 不自動轉為 OrgMaster assignment，也不得在新權威下單獨授權。
- canonical identity 仍必須固定為 `issuer + subject`；email、姓名與員工編號只能協助候選比對，不能單獨自動合併。
- production-bound歷史classifier盤點4筆帳號為`ready=0 / missing_employee=4`；後續人工情境確認其中3筆是個人身分、1筆`info@`是多人共用行政帳號。歷史證據保留，尚未用新taxonomy重跑，也未修改AI-PDM repository或資料。
- target Employee ID由OrgMaster產生immutable UUIDv7；既有semantic ID以一次性rekey同步改寫當前有效reference，不保留舊ID mapping，未完成前不得寫production human identity link。

### Current Phase Scope

- OrgMaster Cloud SQL persistence 與 `access_governance` publisher contract。
- versioned effective assignment view、app-scoped DB grants 與 `EntitlementRepository` replacement boundary。
- AI-PDM 既有 principal inventory、active employee reconciliation、exception report、冪等 migration 與 counts 對帳。
- `040-ID1A` Employee UUIDv7一次性direct rekey／當前有效reference全量重寫／單一V8 baseline。
- `040-ID1B` account taxonomy、redacted projection、owner-approved baseline與跨repo read-only IAR v2 classifier／receipt。
- 外部角色直接發布的 authorization、reason、before / after、revoke 與 immutable audit。
- AI-PDM role catalog／permission enforcement、session invalidation、cutover／rollback 與 cross-repo QA/QC contract。
- app-scoped role administrator capability 與跨 app deny boundary。
- Position-to-Application-Role recommendation、AI-PDM app-scoped Position adoption、來源provenance、OrgMaster app-scoped projection／cursor change feed、需複核與source Position失效fail-closed contract。
- `system_admin` exact privileged-principal read／preview／publish、V2 generic deny、V2→V3 exception、immutable audit、durable security alert與AI-PDM redacted holder projection。

### Out of Scope

- 本輪不修改 production OrgMaster／AI-PDM資料、Firebase或Cloud SQL；local／isolated程式、schema契約、fixture與targeted QC屬本DEV允許範圍。
- 立即停用／刪除`info@`、改寫歷史actor，或在替代使用者／角色／mail流程未驗證前中止現有使用。
- first-login 自動建立 employee，或以 email／姓名自動合併 identity。
- 由 OrgMaster 編輯 AI-PDM Permission 或 role-permission mapping。
- 將Position視為Application Role、以職位／部門名稱自動授權，或讓新任職／mapping擴權直接生效。
- 將 legacy AI-PDM role 自動 mapping／匯入 OrgMaster，或讓 legacy role 與 OrgMaster assignment 長期雙權威。
- high-risk maker-checker、多階段角色審核、ProJED integration、deploy 或 release。

### 主要流程

1. `040-ID1A`只為非UUIDv7 Employee產生新UUIDv7，既有有效UUIDv7原值保留；依同一exact sensitive execution plan重寫workspace、governance與management-method所有受影響reference，形成單一新V8 baseline，不建立legacy mapping或雙讀resolver。local JSON跨三store以maintenance sentinel＋recovery journal保證最終全成或全退，不宣稱單一原子commit。
2. `040-ID1B`的read-only IAR runner讀取AI-PDM既有`pdm_user_id ↔ Firebase UID`、OrgMaster redacted projection與owner baseline，分類human／privileged／legacy shared／service，再以exact fingerprint對帳；不由DEV-006重算。
3. 三筆human唯一對應者進`human_ready`；無對應、多重對應、inactive或衝突進exception report。`info@`進`legacy_shared`，不得連employee。
4. 正式human migration只建立／更新mapping，不重建Firebase identity、不改`pdm_user_id`、不要求重設密碼。
5. 盤點`info@`實際使用者、補個人managed identities與employee roles、驗證mail／業務替代流程後，才停用shared platform login並標記`retired_legacy_shared`；保留帳號與歷史actor。
6. legacy role全部重設；沒有OrgMaster assignment的使用者在新權威下不取得AI-PDM role。
7. app-scoped role administrator使用日常個人identity＋step-up，可預先建立已驗證但待生效的assignment；切換前不得進effective view或AI-PDM authorization。
7A. AI-PDM管理者在AI-PDM「角色能力」檢視recommended／adopted／assigned三態；建議只在首次adoption draft預填，採用Position後仍須逐人preview／publish。兩種operation共用BFF preview／publish facade；read model只合併OrgMaster app-scoped projection與AI-PDM active catalog。AI-PDM BFF寫入OrgMaster V3；新任職不自動grant，移除Position只撤銷失去最後source者。Position改名不改權限；來源任職失效立即fail closed。
8. OrgMaster super administrator是唯一永久cross-app override；只接受同employee下person-specific privileged principal，每次需強驗證、reason、before／after、immutable audit與即時告警。
8A. `system_admin`只能從OrgMaster既有「角色指派」內的條件式「特權設定」授予exact active `human_privileged` principal；一般V2 submit／API固定拒絕，AI-PDM不提供fallback write。UI／validation／command共用full-policy classifier；privileged publish只接受provider `auth_time`派生的fresh AAL2 OrgMaster session，不另建step-up receipt。holder數以特權principal計數並標示「特權身分 N 個」，不得誤稱自然人數。
9. cutover依dry-run → exception處理 → freeze → cross-role pilot → 按部門分批switch → session invalidation → reconciliation執行；pilot與每批都有pass／rollback gate，不形成長期雙權威。
10. 每批authority switch原子啟用該批待生效assignment、使legacy role退出授權並更新versioned effective view；AI-PDM只讀自己的有效assignment，再做app-owned permission enforcement。
11. P0／P1 mismatch或非預期擴權／失權零容忍；session refresh pending停止該批後續動作並由outbox重試，只有protected request仍錯誤授權才切回reviewed單一legacy authority，不得同時接受兩套權威。
12. legacy role正常狀態只可唯讀供observation／reconciliation使用；自最後一批通過起滿30日或兩個production release cycle（取較晚者），雙方owner簽核且解除rollback dependency後才移除。
13. 撤銷、到期、inactive employee、catalog invalid、scope mismatch或contract version不相容時fail closed；cutover／rollback保留identity、歷史assignment與audit。

### `040-ID1A／040-ID1B` RD Handoff Contract

- `040-ID1A`執行邊界：UUIDv7建立器、一次性Employee rekey planner、當前有效reference全量重寫、單一新V8 baseline與local／isolated rekey QA-QC。
- `040-ID1B`執行邊界：治理account taxonomy、`organization.v_identity_admission_reconciliation_v2` redacted view、owner baseline、Platform-hosted IAR generator與identity-domain QA-QC。
- 直接rekey策略：非UUIDv7 Employee才產生新UUIDv7；既有有效UUIDv7原值保留。old→new mapping與target hashes只存在repo外限制ACL的task-owned execution plan／rollback snapshot，不進產品或一般evidence；遺失plan不得重新產生同一組ID。新baseline不得有semantic Employee ID、legacy alias、雙讀resolver或舊organization version。
- 完整性邊界：workspace assignment／administrative override、governance identity link／role assignment／delegation／current snapshot／current unresolved、management-method owner均使用同一mapping改寫；V3存在時另含assignment sponsor與management grant。Target V3沒有per-employee recommendation decision。local OrgMaster sessions撤銷；production Portal／OrgMaster／AI-PDM sessions及central epoch由release gate全數失效。所有browser無法由server同步清除，V8 client在下次載入時忽略並移除Employee-scoped V1～V7 state。任一unknown reference即整批FAIL，不靜默丟棄。
- 相依順序：actual rekey先於JMS-PLATFORM-005 live management grant、employee authority override／receipt／outbox。這些Employee-scoped runtime state非空即BLOCKED並回release migration，不擴張local runner。
- Taxonomy固定`human_personal|human_privileged|legacy_shared|service`；shared retirement固定`pending_replacement -> replacement_verified -> login_disabled -> retired`。human須連exact active identity link／Employee；shared／service不得連Employee。
- Redacted projection只輸出contract／source／policy version、principal與issuer兩種SHA-256 fingerprint、taxonomy、retirement state、match counts及active／UUIDv7 boolean；不輸出subject-only／Employee UUID hash、raw issuer、subject、principal／Employee ID、email、姓名或員編。
- Identity-admission view固定使用`006_dev040_identity_admission_projection.sql`；ordinal `005`已由JMS-PLATFORM-005 entitlement-governance預留。若V3已存在，V2→V3必須保留並重寫`principalAdmissions`，production bundle依005→006套用。
- Exact files、commands、schema columns、idempotency、failure recovery、QA／QC與stop conditions以權威spec第20節為準；兩個slice的P0／P1 readiness gap皆為`0`。
- ID1A出口：OrgMaster `test／qc:dev-040:id1`；ID1B出口：Platform `test／qc:dev-040:id1b`與contract check。各自build／diff、source non-mutation、redaction與cleanup皆須PASS；只證明local／isolated capability，不證明production 3＋1或activation。
- 2026-09-01 實作 evidence：OrgMaster `npm run test:dev-040:id1`（7 files／16 tests PASS）、`npm run qc:dev-040:id1`（V7 fixture→V8、reference rewrite、clean baseline、runtime-state／unknown-reference／source-drift fail-closed、no-active-policy、apply readback、exact plan second-apply=`NOOP`、crash recovery、fixture session revoke skip與cleanup PASS）、相關回歸（18 files／104 tests PASS）、`npm run build`與`npx tsc --noEmit` PASS；Platform `npm run test:dev-040:id1b`（5 tests PASS，含fingerprint case-sensitivity、taxonomy exception matrix與baseline denominator mismatch reject）、`npm run qc:dev-040:id1b`（redacted 3＋1 fixture、classifiedCount=4、databaseWrites=0 PASS）、`npm run contracts:check:dev-040`與`npm run typecheck` PASS。`apply-local`未執行；正式資料／remote migration、live link、policy publish、deploy或release均未執行。

### 驗收契約摘要

- ready 使用者保留原 Firebase UID 與 `pdm_user_id`，且唯一對應一筆 active OrgMaster employee；例外不被靜默忽略或自動合併。
- Employee canonical ID為immutable UUIDv7；新V8 baseline的當前Employee reference全數為UUIDv7，無semantic ID、legacy mapping或舊id alias，employeeNumber不是PK或credential。
- fresh gate為`human expected=3／ready=3`、`legacy shared=1／login enabled=0`、`unresolved=0`；舊`ready=0／missing_employee=4`仍標為歷史。
- 共用信箱沒有employee mapping、role或新app session；退場前後帳號／歷史actor與mail業務連續性均保留。
- migration dry-run／正式執行／重跑 counts 可對帳，evidence 不輸出 identity subject、email 等個資。
- legacy role 即使仍存在於 AI-PDM 歷史資料，只要沒有 OrgMaster assignment，就不能在新權威下產生權限。
- 授權角色管理者的發布可反映到 view；unauthorized actor、self-elevation、越 app scope 或 invalid role 一律拒絕。
- AI-PDM app-scoped 管理員不能管理 OrgMaster 或其他 app role；一般 OrgMaster admin 不自然擁有 AI-PDM 角色治理 capability。
- OrgMaster super administrator 是唯一跨 app override；每次使用需 reason、before / after、immutable audit 與即時告警。
- 日常identity不能行使super-admin／infra權限；person-specific privileged identity的capability不傳播到同employee其他identity。
- 待生效 assignment 在 batch switch 前不出現在 effective view、session claim、cache 或 AI-PDM allow decision。
- audit 可重建 actor、reason、before / after、employee / principal reference、app、role、scope、validity、catalog / assignment version 與時間。
- AI-PDM runtime DB role只能讀自己的 versioned contract，不能跨 schema 寫入或看其他 app entitlement。
- 無 active employee mapping／有效 assignment、撤銷、到期或 stale session 時，AI-PDM 後端拒絕受保護操作。
- cross-role pilot 涵蓋一般使用者、主管與管理員，且登入、allow / deny、撤銷、session invalidation、audit、reconciliation 與 rollback evidence 全部通過後才能進入部門 batch。
- P0／P1 authorization mismatch或非預期擴權／失權零容忍；session refresh pending停止下一批並重試，只有錯誤授權才rollback。
- legacy role 正常觀察期內唯讀且不參與授權；自最後一批通過起滿 30 日或兩個 production release cycle（取較晚者），雙方 owner 簽核 reconciliation 且解除 rollback dependency 後才可 archive／remove。

### Human Decision Gate Result

13. [x] `13B`：OrgMaster super administrator 永久具跨 app override；不採 time-limited activation 或雙人取用。
14. [x] `14A＋Safety Refinement`：P0／P1授權mismatch零容忍；session refresh pending停止下一批並由outbox重試，只有錯誤授權才rollback。
15. [x] `15A`：legacy role 唯讀保留 30 日或兩個 production release cycle（取較晚者），由雙方 owner 簽核 reconciliation 且解除 rollback dependency 後移除。
16. [x] `1B`：互動使用者採公司managed identity；Workspace／Cloud Identity依mail需求分級，個人Gmail只作有期限例外。
17. [x] `2A`：共用／泛用管理帳號退出平台identity與role model；`info@`採非破壞退場。
18. [x] `3D`：一般管理用日常identity＋step-up，高權限用同employee下獨立person-specific privileged identity。
19. [x] `040-ID1 One-time Exception`：目前非UUIDv7 Employee直接改鍵，既有有效UUIDv7保留，受影響current reference完整重寫；舊ID、舊organization version與舊ID audit不保留，不建立legacy mapping。

Phase 1無剩餘P0／P1人類產品決策。DEV-004 `004-S0～S5`與DEV-006 S1～S3已完成；`040-ID1A／ID1B`已完成local／isolated產品實作與targeted QA／QC；JMS-PLATFORM-005 `005-S0～S4B`與`005-S5` local／isolated implementation及targeted gate已完成，包含catalog publication、V3 projection／authority／invalidation、route enforcement與change-feed consumer。DEV-006 S4A只消費ID1B IAR receipt，不擁有classifier或3＋1 baseline。正式Cloud SQL persistence、repository／authority／traffic切換仍未執行，不得以local evidence冒充production完成。

### 停止條件與下一步

- 若現有 Firebase UID 無法穩定取得、同一 subject 對應多個 AI-PDM user、需要合併／刪除 production account，停止並回 Human Decision Gate。
- 若 access view 無法用 DB grants 隔離 app、需要讀 OrgMaster 私有 table，停止並重新評估 API / event projection。
- 若需要雙權威、一般admin可取得cross-app override、告警無receipt或mobile需開放mutation，停止並回PM／ADR。
- production credential、remote Cloud SQL migration、deploy／release 必須另進 release gate。
- 下一步：ID1A／ID1B、JMS-PLATFORM-005 `005-S0～S4B`／`S5`與Platform DEV-006 S4A receipt consumer local gate已通過；由owner提供production 3＋1 evidence，完成DEV-006 S4B release preflight後，才可依`Platform 002→AI-PDM 055→OrgMaster 005→006`順序進行正式 migration、candidate／repository switch與production authority cutover。不得在目前autosave運行中直接切換。
- DEV-009安全切片`009-S0～009-S4`已完成：S1 PostgreSQL、S2 OrgMaster normal-path browser、S3 AI-PDM aggregate與S4 cross-repo皆有frozen report／candidate SHA。S4 frozen report=`../../Jenfu-Management-system/output/qa/dev-009/cross-repo/DEV009-S4-2026-09-02T18-21-31-904Z/report.json`，report SHA=`f8fa0128ba7304efd4cd326cbe4f94952be3095986ad3006b86a61acce213a9b`，candidate SHA=`4ab63077b3425028c9ffc0df7be84126c199cd10856ce82db746b4de106c554f`。下一步為`009-R1 Release Gate Required`；本slice不授權schema apply、真實principal／role mutation、bootstrap、deploy或release。

### 變更紀錄

- 2026-09-02（DEV-009 S1 local completion，歷史分母）：當時`test:dev-009`=`17 files／68 tests PASS`；目前已擴增並重跑為`19 files／75 tests PASS`，S1 frozen PostgreSQL report=`output/qa/dev-009/postgres/DEV009-S1-2026-09-02T18-10-44-005Z/report.json`。未執行schema apply、真實principal／grant、bootstrap、runtime／deploy／release。
- 2026-09-02（DEV-009 S2 local completion，早期證據已被取代）：當時`18 files／72 tests`與`output/playwright/dev009-s2/manifest.md`使用local mock transport；現行S2證據改為frozen production artifact real Chromium `8／8 PASS`，report=`output/qa/dev-009/browser-real/DEV009-S2-2026-09-02T18-09-45-579Z/report.json`。
- 2026-09-03（DEV-009 S4 cross-repo closure）：Platform cross-repo fixed cases與S1～S3 frozen receipt驗章PASS；報告=`../../Jenfu-Management-system/output/qa/dev-009/cross-repo/DEV009-S4-2026-09-02T18-21-31-904Z/report.json`，report SHA=`f8fa0128ba7304efd4cd326cbe4f94952be3095986ad3006b86a61acce213a9b`；下一步`009-R1 Release Gate Required`。
- 2026-09-02（原始提案，UI入口已由下一筆取代）：將JMS-PLATFORM-009 OrgMaster slice升級為`RD Implementation Ready / Documents Only`，固定exact `human_privileged` principal、專用read／preview／publish、V2 generic deny、legacy V2 exception、alert／audit／invalidation同交易、offline control-plane isolation、projection v2與`009-S0→S4／R1`；當時的獨立「特權管理」入口不再是現行方案。未修改程式、schema、資料、runtime、bootstrap、deploy或release。
- 2026-09-02：依使用者UI簡化決策，取消獨立「特權管理」頁與route，改為既有`assignments`選到AI-PDM `system_admin`時就地顯示「特權設定」。專用read／preview／publish、V2 generic deny、exact principal、step-up、audit／alert／invalidation及offline isolation不變；Documents Only，未修改產品runtime。
- 2026-09-02（前一版，已由下一筆技術主管複審取代）：依Dev PM完成頁內方案的implementation-ready收斂：補ordinary／privileged／unsupported mode matrix、當時的exact五欄catalog discriminator、adapter metadata保留、role切換清draft／忽略late response、`GovernancePrivilegedAssignments`元件邊界與`QA-009-01～16` evidence contract。下一步仍只執行`009-S0`；Documents Only。
- 2026-09-02：依RD技術主管複審修正DEV-009：以shared full-policy classifier取代分散五欄判斷，current bundled／live adapter必須保留完整policy、歷史V1缺欄snapshot只讀；以provider `auth_time`→session `authenticatedAt`的AAL2五分鐘gate取代獨立step-up receipt；補auth／session／live catalog exact files、S0共同ownership及viewport/client interaction boundary。P0／P1=`0`，維持`RD Implementation Ready / Documents Only`。
- 2026-09-01：同步Platform DEV-006 `006-S4A` consumer gate完成：IAR v2 vendor lock、receipt hash／freshness／redaction／count validation、PCR／IAR independent preflight與8-fixture QC均PASS；Platform僅消費DEV-040 receipt，不讀projection、不重算taxonomy、不建立Employee。JMS-PLATFORM-005與production identity／authority仍未切換。
- 2026-09-01：依RD技術主管ownership審查，將原`040-ID1`拆成`040-ID1A` Employee rekey與`040-ID1B` identity admission／IAR。IAR schema、3＋1 owner baseline、classifier與receipt歸DEV-040，Platform repo只託管cross-repo runner；DEV-006 S4A改為receipt consumer。同步移除循環的PCR→IAR source revision、重複classifier與重複fixture，不改產品行為、資料、runtime或release。
- 2026-09-01：依使用者「繼續升級DEV-005」補齊JMS-PLATFORM-005的OrgMaster direct implementation contract。第21節固定Governance V3、V2非破壞轉換、live AI-PDM catalog、recommendation SHA、principal-scoped management grants、app-scoped API、migration 005、current-workspace source invalidation、session refresh、effective／authority views、ACL、UI、commands與rollback。狀態升為`RD Implementation Ready / Not Implemented`；本輪只改文件，未建立contract／migration／程式／測試或改資料、runtime、release。
- 2026-09-01：依使用者授權執行JMS-PLATFORM-005第一波local／isolated implementation：新增`server/aiPdmRoleCatalogRepository.ts` read-only contract catalog adapter、Governance V3 supporting types、Position-to-Role recommendation domain與5項 targeted tests；catalog fixture、system／external role restrictions、scope conflict、recommendation-only與catalog tamper／missing fail-closed語意均通過。另完成Platform task-owned PostgreSQL migration 055 fresh／立即 replay、active view readback、active uniqueness與view read-only boundary probe。Live OrgMaster persistence、API／UI、migration 005、authority switch與production資料仍未執行。
- 2026-09-01：依DEV-005 RD技術主管複審修正OrgMaster direct contract：V3 assignment補`subjectKind／targetPrincipalId`，system admin限exact privileged principal且不可recommendation／delegation，external role改為零組織任職Employee anchor的manual-direct assignment並必填finite hard expiry；catalog version改為provenance、active catalog為policy authority；撤權／切換改成authority mutation＋outbox先commit、session refresh post-commit重試。文件維持`RD Implementation Ready / Not Implemented`，產品與資料均未變更。
- 2026-09-01：依DEV-005角色能力focused technical review同步OrgMaster契約：新增唯一app-scoped role capability projection與cursor change feed；target V3移除未上線per-employee recommendation decision／legacy basis；一般AI-PDM採用能力改為`ai-pdm.position_adoption.manage`並與OrgMaster recommendation governance分權；BFF四route收斂為兩facade。契約層`P0/P1=0`，本輪只改文件，未修改產品、schema、資料、runtime或release。
- 2026-09-01：依RD技術主管審查優化`040-ID1`，關閉五項契約缺口：migration boundary改為maintenance sentinel＋crash-recovery journal，並補齊V3 sponsor／grant／decision與跨app session closure；UUIDv7隨機plan改為exact sensitive execution plan重用；只rekey非UUIDv7並保留有效UUIDv7；`principalAdmissions`移除重複`employeeId`權威；projection移除subject-only／Employee UUID fingerprint。同步Platform DEV-005／006與QA契約後，P0／P1 readiness gap維持0，判定`RD Implementation Ready / Not Implemented`。
- 2026-09-01：依使用者要求補齊DEV-040開發文件，並依一次性豁免取代原擬兩段式bridge。`040-ID1`固定非UUIDv7 Employee直接rekey、有效UUIDv7保留、受影響reference完整重寫、單一V8 baseline、無產品級legacy mapping，以及governance taxonomy schema／commands、redacted V2 view columns、fingerprint公式、Platform IAR v2 consumer boundary、exact OrgMaster file allowlist、failure recovery、QA／QC與future re-entry；另關閉JMS-PLATFORM-005與`040-ID1`同用migration 005的衝突，固定005→006並要求V3保留`principalAdmissions`。P0／P1 readiness gap為0，狀態為`RD Implementation Ready / Not Implemented`。本輪只改文件，未修改產品、schema、資料、帳號、runtime、traffic、deploy或release。
- 2026-09-01（已由本節上方ownership審查取代）：當時規劃由DEV-006 S4A負責IAR classifier／preflight；現行契約已改為DEV-040 `040-ID1B`擁有classifier／receipt，DEV-006只消費receipt。本筆只保存文件演進。
- 2026-09-01：使用者確認帳號治理`1B / 2A / 3D`。DEV-040改採一人一公司managed identity、共用信箱退出平台登入／角色、一般管理日常identity＋step-up、高權限同人專用privileged identity；`info@`採非破壞退場。舊`ready=0 / missing_employee=4`只作當時快照，現行gate改為3筆human ready＋1筆legacy shared login disabled。另固定`Employee.id=UUIDv7` target；Employee舊ID的實際遷移方式已由同日one-time exception取代為直接rekey。本次只修訂文件，未改產品程式、Employee／帳號／角色資料、Firebase、Cloud SQL、runtime、traffic、deploy或release。
- 2026-09-01：完成 DEV-039 paired Duty→ProcessNode strict native admission 的新鮮重演與文件同步。全新 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`於既有 canonical 流程入口，從已連結職掌 lane拖至 ProcessNode；觀察到`dragstart／dragenter／dragover／dragend`與 strict MIME，但沒有 terminal `drop`、UI成功結果或domain mutation，API `200`且revision／既有link IDs不變。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`，fixture archive manifest=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`，5080已釋放、5000未觸碰。正式判定`E1-DUT-PROC-NATIVE=blocked／not-run`，E1 aggregate、正式 QA-QC與E4不變；不新增runner、fallback、resolver、mutation owner或第二證據清冊。

- 2026-09-01：完成 DEV-039 現行 runner／文件計數一致性修正。`output/playwright/dev039/e2-admission.pw.ts`目前宣告七個 test case（五案 E2＋`E3-LIFECYCLE`＋`E3-WARNING`），現行摘要與索引統一為`7 passed`；舊的`8 passed`僅作必要的歷史 provenance，不覆寫現行判定。本次只改文件，不修改產品契約、測試、資料、dependency、runtime、commit、merge、deploy或release。

- 2026-09-01：補齊 DEV-039 `Current readiness audit` 文件索引。主spec第2.2節集中區分 RD Implementation `Ready`（P0／P1 readiness gap=`0`）與交付 gate：E1=`Partial／Open`、E2=`Partial／Open`、E3=`Pass`、E4=`Blocked`；parity第0.1節與evidence manifest頂部同步相同快照。此更新只改善冷啟動判讀與防止歷史段落誤讀，不新增產品架構、debug API、第二history／layout store、synthetic fallback或第二份證據清冊。

- 2026-09-01：完成 DEV-039 E2 history authority／E3 warning source audit。`useOrgHistory` 的 `past／present／future` 僅由 App 內部持有，runner `0→1→0` 只屬行為性 Undo round-trip，不能填充嚴格 `historyLength`；Process canvas／WorkspaceLayout無直接 `console.warn`，Vite tooling advisory、React Flow transient warning與產品 error boundary分開治理。新增 targeted `2 files／10 tests passed` provenance；E2／E3維持`Partial／Open`，不新增產品debug state、history API、第二 history／layout store、global suppress或其他技術債。
- 2026-09-01：使用者5000 runtime E1補充。在既有 `http://localhost:5000`（PID `23840`，非本任務owned）以全新 fixture `draft-3778d6ea-b4cb-4ce0-b93f-5a8b3afc8b3a`重跑一次性 CDP probe；`1280×720`、HeadlessChrome `149.0.0.0`下source／target geometry preflight可通過，但`intercepted=null`、事件與strict事件均為空，未取得可採用`dragstart→dragover→drop`／`DataTransfer.types`。API before／after均`200`、revision均為`7f09bc...`且既有process link不變，fixture archive final manifest revision `b6e50360dd1aeeb7880918e0d3439189ccf79cbb07df031dca07778b6ef1b538`；5000未停止。此筆只確認換runtime仍是runner capability blocked，不提升E1、不新增synthetic path或第二resolver／mutation owner；詳見主spec§26.21.11、Parity§16.15.9。
- 2026-09-01：補記 DEV-039 文件／靜態 gate：`git diff --check`、`npx tsc --noEmit --pretty false`、`npm run build` 均通過；Vite extension／chunk-size advisory 歸類為 tooling，不改產品 warning 或 E2／E3 判定。
- 2026-09-01：補記 DEV-039 execution-hygiene provenance。B16 fixture `draft-2357c0ad-871c-4876-b3d2-935242dad73f` 僅完成 prepare／cleanup，沒有可採用拖曳操作；archive manifest revision=`e1db06f6c35dfa96c1af3ead409c8c50ed73528ac175a2966a766cdf29273a28`，不得計入E1／E2／E3案例。同步確認 typecheck、build、diff check通過；5000 user-owned PID `23840`保留、task-owned 5080未遺留，DEV-039判定與QA-QC狀態不變。
- 2026-09-01：補記 DEV-039 E3-LIFECYCLE task-owned raw-console／lifecycle rerun。隔離 fixture `draft-fd5238aa-6bf9-4d90-949a-9e22706a8fe2` 只執行既有 `e2-admission.pw.ts` 的 E3-LIFECYCLE，結果 `1 passed (11.5s)`；mount／close／reveal／mindmap→flow／reload皆維持active Process canvas observer最多`1`、pending rAF=`0`，raw與product diagnostics均為空，archive final manifest revision=`2d40124a3851b98cb41e8b46745fcc997a4f9b118950790d48c87c6cb0848e1d`。task-owned `5080`已停止並釋放，user-owned `5000`未觸碰；此筆只補E3-LIFECYCLE個案，不關閉E3-WARNING aggregate、E1 native、E2 aggregate或E4，不新增產品架構或第二輸入路徑。
- 2026-09-01：補記 DEV-039 E3 geometry／listener evidence hardening。既有 runner 以隔離 fixture `draft-2adac105-5202-4554-a7d0-6233cbdf32ac` 增加可見 canvas geometry與document／window keydown scoped inventory，結果 `1 passed (10.2s)`；mount／reveal／flow／reload canvas不超過parent，close後visible count=`0`，document capture keydown回baseline `0`，observer最多`1`且pending rAF=`0`，archive final manifest revision=`848e8b7bf861957022fa8fcb0b505b80439b60fea616eedfd77bccc9c42ee10c`。這是驗證層增量，不新增產品debug state、API、global listener或第二套lifecycle owner；E3-LIFECYCLE個案維持`pass`，E3-WARNING aggregate仍開放。
- 2026-09-01：補記 DEV-039 E3 full listener inventory exploratory observation。隔離 fixture `draft-373f011e-0b0d-4636-a344-89145edd552d` 重跑既有 E3-LIFECYCLE，結果 `1 passed (18.9s)`；test-only EventTarget listener與`isConnected`分類觀察到 close／reveal／flow 的 React Flow portal target計數增加，但 reload後回到 `disconnected=0`。probe持有DOM target，故不得把 disconnected count直接判為產品 leak；E3-LIFECYCLE個案維持`pass`、E3-WARNING aggregate仍`Partial／Open`，待QA-QC用未注入instrumentation的DevTools listener／heap或production-like remount profile判定。archive final manifest revision=`f99a52978576269240a7f3f25069e61d1240cba26ddc456f910c44aca16dd29d`，5080已停止釋放、5000 user-owned未觸碰；不新增產品架構、debug API或第二輸入路徑。

- 2026-08-31：同步使用者核准的DEV-006 activation／repository-switch slice。新增default-off Cloud SQL product repository adapter、runtime CAS／media functions與stores整合；targeted 10 files／26 tests、full 159 files／661 tests、typecheck／build、fresh G1 12／12通過。capsule=`DEV006-R1-c617c6cf9e0d`在private-only／zero-traffic candidate完成4 migrations×2、13 artifacts／2 media import／replay、RCN-01～09與transactional active read／CAS write／stale-CAS／media probe，rollback後authority=0/null、batch=1、membership=0。專案缺漏的Google-managed Cloud SQL service agent已補建且只具標準`roles/cloudsql.serviceAgent`。4 jobs、candidate、secret、image、build source、local context/temp全數清理；source metadata與AI-PDM traffic不變，5000 runtime保留。未部署、未持久切authority或改traffic；evidence=`../../Jenfu-Management-system/output/dev-006/releases/DEV006-R1-c617c6cf9e0d/`。
- 2026-08-31：同步Platform DEV-006 production-bound candidate closure。使用者核准exact target與private-only、zero-traffic restore candidate；Cloud SQL rehearsal完成admin bootstrap、低權限shadow import／replay、rollback-only role verifier、RCN-01～08與preflight blockers=0。final G1=`DEV006-G1-20260831T110155230Z-bb41efa2`，capsule=`DEV006-R1-be8d4e071328`，13 artifacts／2 media／784066 bytes。OrgMaster live workspace在驗證期間持續autosave，已列為concurrent drift並排除於immutable capsule，本任務未寫local data。未切產品repository／authority、未deploy／改traffic；candidate、Job、task secrets/images/build sources/local contexts全數刪除。evidence=`../../Jenfu-Management-system/output/dev-006/releases/DEV006-R1-be8d4e071328/`。
- 2026-08-31：同步Platform DEV-006 R1 blocker closure（歷史pre-approval capsule）。建立content-addressed capsule `DEV006-R1-16d70f8da53e`，12項input與4項ordered migration逐檔hash驗證，dirty worktree不進artifact；當時preflight blocker由8項降為3項，已由後續`DEV006-R1-be8d4e071328` supersede。
- 2026-08-31：同步Platform DEV-006 G1與Lane 3 release preflight。OrgMaster新增additive `002_dev006_orgmaster_persistence.sql`、migration CLI與task-owned QC runner；現行local source只讀inventory，fresh runner實測canonical source bytes＋mtime不變及cleanup redaction，generated fixture在隔離PostgreSQL完成12／12、P0／P1=0。evidence=`../../Jenfu-Management-system/output/dev-006/DEV006-G1-20260831T072459383Z-d373abd4/`；前一run已被fresh evidence取代。preflight因release source／target／backup／reconciliation／rollback／candidate缺件而`BLOCKED`。未切換產品runtime預設、未寫現行資料、未碰live Cloud SQL／Firebase、未deploy或release。
- 2026-08-31：同步Platform DEV-004 `004-S5 Local PASS`。三repo cross-contract／regression／build、fresh PostgreSQL 43／43、redaction／cleanup與10張browser evidence全部PASS，OrgMaster部分含focused 14、full 651、client＋server build及actual Node BFF fail-closed畫面；evidence=`../../Jenfu-Management-system/output/dev-004/DEV004-S5-20260831T054317661Z-75bb1fcc/`。本次只同步OrgMaster開發文件，未修改OrgMaster產品行為、schema、資料、production runtime或release。
- 2026-08-31：同步Platform DEV-004 `004-S4 Local Complete`。Platform建立Next.js 16.3 auth shell、Portal opaque session、active-principal／central epoch per-request gate、local／global logout及failure UI；contract與focused 6 files／24 tests、production build、fresh isolated PostgreSQL 43／43＋cleanup、HTTP fail-closed、1440／1024／390 browser、login keyboard與failure focus recovery均PASS，evidence=`../Jenfu-Management-system/output/playwright/dev004-s4/manifest.md`。本次只同步OrgMaster開發文件，未修改OrgMaster產品、schema、資料、runtime或release；下一個共同IAM slice為S5。
- 2026-08-31：依使用者指令完成DEV-004 `004-S3`。OrgMaster新增production Node BFF、Firebase token exchange、opaque app-local session、active-principal／central epoch per-request gate、全business API先驗證、Employee lifecycle adapter及不先render資料的AuthGate；development只允許loopback＋exact headers並維持既有`dev:local`。contract PASS、focused 4 files／14 tests、full 159 files／651 tests、TypeScript、client＋server build、server restart及1440／1024／390三視窗browser均PASS；evidence=`output/playwright/dev004-s3/manifest.md`。未修改AI-PDM、未連live DB／Firebase、未套production migration、未deploy或release。
- 2026-08-31：同步Platform DEV-004 `004-S2 Gate Closure`。AI-PDM只修正兩支QC runner，fresh focused 14／14、AI-PDM DEV-046 16／16、login alias 21／21及targeted engineering checks通過，S2改為`Local Complete`。本次只同步OrgMaster開發文件，未修改OrgMaster產品、schema、資料、runtime或release；OrgMaster下一slice仍為`004-S3`。
- 2026-08-31：同步Platform本輪`14A`／DEV-004 `004-S2`初始狀態。AI-PDM完成default-off、cookie-only、single-mode Jenfu adapter，focused 14／14、isolated auth 12／12、typecheck、lint與isolated build通過，完整legacy基準無新增失敗；當時兩個pre-existing exceptions使S2 exit gate仍open。本次只同步OrgMaster開發文件，未修改OrgMaster產品、schema、資料、runtime或release；OrgMaster下一slice仍為`004-S3`。

- 2026-08-31：使用者選擇平台引導題`12A`；完成DEV-004 `004-S0`。OrgMaster新增byte-identical vendor contract、SHA lock、`contracts:check`／`test:dev-004`／`qc:dev-004`，aggregate SHA=`4d27c1e297b516207f931f57e443ecda99e260c56369132f9a269d11920cda96`且drift self-test PASS。尚未修改OrgMaster auth產品程式、Employee、DB、UI、runtime或release；下一個app slice為`004-S3`。
- 2026-08-31：使用者選擇平台引導題`11B`；DEV-004共同IAM／app-local session補到RD Implementation Ready，DEV-040同步固定OrgMaster production Node BFF、全business API auth gate、active employee lifecycle、opaque local session、central epoch與exact file／test boundary。只開放DEV-004 local／isolated實作，未修改產品程式、schema、資料、環境或release。
- 2026-08-30：依 `4A / 5A / 6B` 建立 Brief Ready；修訂 ADR-007、DEV-037 spec／QA evidence boundary，並連結 Jenfu Management System ADR-003。本輪未修改產品程式、測試、資料、Firebase、Cloud SQL、deploy 或 release。
- 2026-08-30：記錄下一輪 `1B / 2A / 3A`（本 DEV 對應 `7B / 8A / 9A`）；固定 legacy role 全部重設、staged cutover 與 app-scoped role administrator。文件維持 Brief Ready，未進 RD／QA／QC／release。
- 2026-08-30：記錄本輪 `4A / 5A / 6A`（本 DEV 對應 `10A / 11A / 12A`）；固定待生效 assignment、cross-role pilot 後按部門分批，以及 legacy role 唯讀觀察期。文件維持 Brief Ready，未進 RD／QA／QC／release。
- 2026-08-30：記錄本輪 `7B / 8A / 9A`（本 DEV 對應 `13B / 14A / 15A`）；固定 OrgMaster super-admin 永久跨 app override、P0／P1 零容忍 rollback，以及 legacy role 30 日或兩個 production release cycle 的較晚觀察期限。Human Decision Gate 完成；文件仍維持 Brief Ready，未進 RD／QA／QC／release。
- 2026-08-30：使用者選擇平台引導題`10A`；DEV-040補齊published assignment state、role catalog input、permission／super-admin、UI Entry、Cloud SQL persistence migration、batch authority／rollback與QA／QC evidence contract，升為`RD Contract Ready / RD Not Started / Documents Only`。未修改產品程式、schema、資料或環境。

## DEV-039：可組合規劃桌面與跨面板關聯配置

狀態：`Current Phase Complete / QA-QC Passed / Merged to master / Release Not Requested`
文件成熟度：`Implementation Complete / QA-QC Passed / Repository Integrated`
節點類型：交付點
是否計入產品交付完成：是
來源 ID：`USER-2026-08-28-COMPOSABLE-PLANNING-DESKTOP`、`USER-2026-08-28-BRANCH-LEVEL-UI-REPLACEMENT`、`USER-2026-08-28-DEV039-HCS-ROUND-1`、`USER-2026-08-28-DEV039-HCS-ROUND-2`、`USER-2026-08-28-DEV039-HCS-ROUND-3`、`USER-2026-08-28-DEV039-HCS-ROUND-4`、`USER-2026-08-28-DEV039-MATURE-MODULE-SLICE-1`、`USER-2026-08-28-DEV039-ALL-CURRENT-FUNCTION-PARITY`、`USER-2026-08-30-STABLE-PANEL-OWNERSHIP-ARCHITECTURE`、`USER-2026-08-30-DEV039-S6-IMPLEMENTATION-READY`、`USER-2026-08-31-NATIVE-CROSS-PANEL-RELATION-PLACEMENT`、`USER-2026-08-31-FIRST-PRINCIPLES-RELATION-PLACEMENT-ARCHITECTURE`
父任務：DEV-038
風險等級：Medium（主要 UI flow、跨面板互動與舊版移除改變；Current Phase 不改 schema、API、權限或 domain authority）
分支：`codex/dev-039-composable-workspace`
現行判讀優先序：先讀主spec第2.1～2.5.2節、parity第0.1～0.2節及`output/playwright/dev039/manifest.md`頂部Current gate snapshot／RD handoff；本節下方標示日期的runner／QA／QC段落均為provenance，若與上述快照不同，以現行快照為準，不得把歷史`E1 not-run`或`E3 warning open`當成目前狀態。最新 paired strict record見主spec第26.21.25節，桌面 viewport extension見第26.21.26節，歷史 blocked runner見第26.21.24節。
執行邊界：S0～S6產品與證據維持歷史完成；S7已完成Implementation Readiness Review、relation core實作與正式 QA-QC：`relationPlacement.ts` pure reducer、App唯一協調器、typed effect／capability path、Employee／Duty／Process source handle／target wiring、舊平行state清理、Process composition harness與B16 pure fixture harness已完成；targeted component `3 files／19 tests`、full regression `160 files／664 tests（1 skipped）`、typecheck、build與source scan已通過。本輪新增E2 fail-closed與Process canvas lifecycle自動化測試不改產品契約。Process canvas 幾何窄修正後 split／reload／flow source handles、owner canvas與overflow observation已通過，artifact為`F039-S7-E3-process-geometry-after-fix.png`。最新隔離 fixture 七案 B16 合併 browser runner（五個E2 failure-path＋`E3-LIFECYCLE`＋`E3-WARNING`）為`7 passed`；五案 E2 `historyEvidence`與E3兩案 evidence均已完成並覆核。ProcessNode→Duty與paired Duty→ProcessNode均有strict native pass（artifact分別為`F039-S7-E1-process-duty-native-strict.json`與`F039-S7-E1-duty-process-native-strict.json`），四個 E1 minimum directions aggregate為`Pass（evidence）`；E4只剩候選凍結授權。不執行commit、merge、deploy或release。下方單案pass、blocked provenance與舊keyboard baseline不得取代最新aggregate判定。

> **細部紀錄閱讀邊界（現行）**：本節以下帶日期的 runner／QA／QC／browser 段落，除非標示「現行覆寫」或「current closure」，均只保存可追溯 provenance；其中較早的 `E1／E2／E3 Partial／Open`、`blocked／not-run`、`E4 Blocked` 不得覆寫本節現行狀態。下一步只依主spec第2.4節執行 `E4-CANDIDATE-FREEZE`，且仍需使用者／PM明確授權。

2026-09-01 audit補充（歷史 provenance）：已完成 `useOrgHistory`、App Undo／Redo與 Process warning source audit。既有 history stack 未暴露為產品 API，runner 的 `0→1→0` 只代表一次有效配置加 Undo round-trip；`ProcessPlanningCanvas`／`WorkspaceLayout`無直接 `console.warn`，Vite extension advisory與React Flow warning分開判定。這次只更新 evidence boundary，不新增 production debug state、history API、第二 history／layout store或global suppress；E2現行判定以最新 `historyEvidence` record為`Pass（evidence）`，E3-WARNING亦為`pass`。

自動化回歸重驗（2026-08-31 16:05，幾何窄修正前歷史基線）：以`npm test -- --run --pool=forks --maxWorkers=1`取得`159 files／656 tests passed`；前次平行執行的5個worker timeout以低併發重跑後不再重現，視為驗證環境噪音。此結果只更新歷史aggregate regression provenance，不關閉native `dataTransfer`、invalid／target卸載／capability-loss failure或React Flow warning gate；現行`160／663`以主spec第26.13節及第26.17節為準。

最新自動化增量（2026-08-31）：依主spec第26.13.1節新增 `E2-UNLOAD`、`E2-INVALID`、`E2-CAPABILITY-LOSS` pure／component fail-closed coverage，並新增 `ProcessPlanningCanvas.lifecycle.test.tsx` 的兩 frame 單次 fit、observer disconnect與hidden pending rAF cancellation coverage；targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`，關聯與lifecycle合併重跑 `4 files／20 tests`，aggregate `160 files／663 tests`。這只補測試證據，不改產品狀態；瀏覽器 unload／capability-loss與listener inventory record 仍開放。

E3 lifecycle browser admission（2026-09-01）：以隔離 fixture `draft-3983041c-deb2-4e9e-badf-5e1aa5ecbee0` 重跑同一 `output/playwright/dev039/e2-admission.pw.ts`，五個 E2 failure-path 加 `E3-LIFECYCLE` 共 `6 passed (31.5s)`。browser-init probe只包裝既有 `ResizeObserver.observe/disconnect` 與 `requestAnimationFrame/cancelAnimationFrame`，在Process canvas mount／close／reveal／mindmap→flow／reload觀察到可見canvas active observer不累積（為`1`或close後`0`）、pending animation frame為`0`，產品diagnostics為空；archive final manifest revision `28390b5c0322c842d28ddc0b31f7fa0db9074810e37e5a890db38495ce322beb`，5080 runtime／port已cleanup。`E3-LIFECYCLE`個案標`pass`，`E3-WARNING` aggregate仍`Partial／Open`，不新增產品debug state、listener、resolver、MIME、mutation owner、schema、API或第二輸入路徑。

E2／E3 final stability rerun after transient-notice hardening（2026-09-01，歷史 provenance）：以隔離 fixture `draft-dbdd513f-a15b-4297-a4f5-819a4f08d80c` 重跑五案 E2 加 `E3-LIFECYCLE`，結果 `6 passed (34.4s)`；archive manifest revision `e647287fd737dbf35e185ce081a1351b92bced7352ea10e06e370867cbf03e76`，task-owned `5080` runtime／port已cleanup。runner維持 history evidence numeric baseline／recovery，並將 capability-loss re-entry 的穩定准入改為 persisted process-link readback；不新增產品debug state、history API、resolver、MIME、mutation owner、schema或第二保存路徑。現行 E2 aggregate以第S7 latest checkpoint的 `historyEvidence` record為`Pass（evidence）`，E3-LIFECYCLE仍為`pass`。

E3 raw-console assertion hardening（2026-09-01）：既有 `e2-admission.pw.ts` 的 `E3-LIFECYCLE` test layer 新增嚴格 `expect(diagnostics).toEqual([])`；隔離 fixture `draft-ee9cb1d2-b8f8-45e9-8f47-491adc7375b9` 結果 `1 passed (11.0s)`，raw／product diagnostics均為`[]`，archive final manifest revision `d5445aad498c8cb3ff140905e762ba33a1f93f62108f6c02f74082cb6b03ed9c`，5080 runtime／port已cleanup。此為 evidence-only assertion，不提升 E3-WARNING aggregate、不改產品契約或第二輸入路徑；E1 native、E2 history-length與E4不變。

E2／E3 authority audit（2026-09-01，歷史 provenance）：`useOrgHistory` 僅由 App 持有 `past／present／future`，無產品可讀 `historyLength` 表面；E2 runner 的數值 baseline只作行為性證據，不能填充第26.14節舊版嚴格欄位。source search亦確認 Process canvas／WorkspaceLayout沒有直接 `console.warn`；E3-WARNING已以同一 fixture 的原生CDP listener、strict raw-console、geometry與lifecycle record關閉，E2現行改採 `historyEvidence` 並為`Pass（evidence）`。本輪沒有產品程式、API、schema、dependency或輸入路徑變更。

E3 native DevTools listener／warning closure（2026-09-01，歷史 provenance）：同一隔離 fixture `draft-5ab9ff12-e5f0-4bfc-8141-eddc1fb4e078` 以既有 runner 合併重跑 `E3-LIFECYCLE` 與 E3-WARNING native CDP case，結果 `2 passed (15.7s)`，與同 fixture 的五案 E2 合計 `7 passed`；不注入 `EventTarget` monkey-patch，也不持有 DOM target，raw diagnostics為`[]`，Process canvas close後為`0`、reveal／flow／reload為`1`，window／document／viewport portal listener回到`40／8／139` mount baseline。archive final manifest revision=`2903c3813ccd0cd38de638c10d6646a8c5b4ab02da5b6055b5e96a300179eee6`，artifact=`F039-S7-E3-warning-cdp-listeners.png`；5080 task-owned runtime已停止並釋放，5000 user-owned PID `23840`未觸碰。依主spec第26.21.17節，E3-WARNING現為`pass`；E1 native仍`blocked／not-run`、E2現行以第26.21.19節為`Pass（evidence）`、E4仍`Blocked`。

RD 讀取邊界：主spec第26.13.1節的自動化覆蓋表將「邏輯已測」與「瀏覽器可採用 evidence」分開；不得把 pure／component pass 當成 visible failure、focus return、zero-mutation 或真實 target unload／capability-loss 的 pass。`E2-COMMIT-REJECT`只在既有拒絕路徑可重演且不需新增 fallback 時補測。

權威工程契約：`ai-doc/specs/DEV-039-composable-planning-workspace.md`

零功能遺失清冊：`ai-doc/specs/DEV-039-feature-parity-manifest.md`

架構決策：`ai-doc/adr/ADR-009-composable-workspace-shell-boundary.md`

### S6 Panel Boundary Hardening摘要（2026-08-30）

後續同類缺口盤查顯示，既有`LAYOUT-OWNERSHIP-01`只關閉Duty configuration明細錯掛組織圖的單一路徑，尚未形成全系統強制邊界：Duty audit／distribution仍可顯示viewport-fixed persistent detail；master-data共享detail ReactNode存在organization與module adapter雙mount風險；Management Method Duty對照及部分Duty popover／preview尚未經panel／global overlay分級。這些缺口不能再用逐頁CSS specificity修補。

S6固定四項工程契約：

1. Persistent list／canvas／document／settings／detail／editor只能由owner `WorkspacePanelFrame[data-module]`掛載，且DOM最多一份。
2. Panel transient只進`PanelOverlayHost`；global recovery／blocking modal／toast／drag preview只進`GlobalOverlayHost`；feature不得raw portal到body或以fixed persistent surface跨region。
3. Shared selection只傳stable `EntityRef`與revision；panel-local detail selection／open state由各module context／session擁有，`App`不得以共享ReactNode或全域Inspector boolean控制多module明細。
4. Panel container只決定排版，desktop／mobile mutation capability仍由workspace environment決定；桌面窄panel不得被誤判為手機。

文件已同步主spec第4.7、12.4、22.5、25.5、26.7節、parity manifest四項S6 ID及ADR-009 amendment。Current execution boundary是`Implementation Complete / QA-QC Passed / Local Release Gate Pending`；exact exports、owner factories、overlay allowlist、S6-0～S6-5、failure recovery及B14～B15皆已完成。S6沒有schema、API、permission、domain、dependency或資料migration。

### S7 Relation Placement Session Implementation Contract（2026-08-31）

#### 真正問題

試用畫面顯示Employee清單與Organization panel可同時存在，但在目前正常操作下無法完成Employee→Position原生跨面板拖曳；畫面當時為`current-view／唯讀`，程式也只在editable mode啟用來源，然而既有`F039-REL-01`實機證據主要只證明keyboard placement與focus return，不能支持「native跨面板拖曳已交付」的結論。S7因此重新開啟受影響acceptance；S0～S6其他workspace、owner、overlay及keyboard證據不因本缺口失效。

#### 第一性架構方向

核心能力不是「拖曳」，而是`來源物件 → 關係語意 → 合法目標 → 預覽 → 建立關係 → 可復原`。S7採單一、typed、短生命週期的`Relation Placement Session`統一native drag與keyboard placement；`application/x-orgmaster-entity`仍是native transport，`resolveRegisteredDrop`仍是preview與commit的唯一規則來源，drop時以latest canonical state及capability重新解析。Session不得進URL、local layout、OrganizationDocument、domain history或autosave，也不得成為第二business state。

Current Phase依序涵蓋：

1. Employee Drawer／Employee panel→Position新增任職；Employee已無regular assignment時建立第一筆並修復主職指標，已有任職時沿用既有helper新增兼任。
2. Organization既有Employee→另一Position移轉exact source assignment；只有此來源可放到organization unassign zone解除該筆任職，Employee清單放到空白區只取消。
3. Duty＋exact lane→Position，以及Duty↔ProcessNode沿用同一Placement生命週期與各自既有Command／transaction。
4. native與keyboard共用`beginPlacement／previewTarget／commitTarget／cancelPlacement`；source focus另以短生命週期ref保存，不進serializable state。
5. 候選版本前刪除被取代的`employeeDrag`、`employeeKeyboardDrag`、`dutyDragState`或等效平行正常路徑；不得讓新的Placement與舊drag coordinator永久並存。

#### UX與可見狀態

- 唯讀、mobile、recovery或capability loss時不顯示drag handle且不能開始Placement；不得以disabled假控制暗示可寫入。
- Editable desktop在來源列尾使用一致的最小drag handle；點名稱仍只選取／開明細，避免整列drag與click競爭。
- Drag／keyboard placing期間只標示resolver判定的合法target；candidate就地呈現新增兼任、移轉、解除、取代、已存在或不可用語意，不增加教學面板或逐次確認Modal。
- 有效drop只commit一次並以projection更新、最小結果回饋與既有Undo呈現；invalid、same target、duplicate、cancel、Escape及來源／目標卸載均零domain change、零dirty、零history、零autosave。

#### Scope外與停止條件

- 不新增任意物件互拖、generic event bus、plugin registry、service locator、multi-instance、批次配置或手機／touch編輯。
- 不新增DnD dependency、後端drag API、schema、OrganizationDocument版本、permission語意或第二save path。
- 若Implementation Readiness發現不能在既有typed payload、resolver、assignment helper／OrganizationCommand及App composition root內完成，停止回PM，不得先擴張架構。

#### 驗收方向

- 從canonical `/`的正常頂部功能入口，在1440×900與1024×768 editable draft開啟Employee Drawer／panel及Organization，實際以native `dataTransfer`完成新增任職、兼任、移轉與解除，並驗證合法／非法target、結果預覽、cancel、noop、Undo、autosave及reload。
- 1440×900 current read-only、1023×768與390×844不得顯示或啟動mutation；拖曳途中若capability喪失，drop必須以latest state fail closed。
- 鍵盤使用同一Placement session與resolver完成等價關係，Tab／Shift+Tab、Enter／Space、Escape、live status及source focus return均可觀察。
- QA／QC必須建立新的native browser evidence；既有`F039-REL-01` keyboard screenshot、unit resolver test、build或API/data直寫只能作baseline，不能關閉S7。

#### RD Contract補強

- UI Entry：具mutation capability的總經理／主管由canonical `/`頂部功能入口開啟Organization與來源Drawer／panel；名稱click維持選取／明細，只有列尾一致把手開始Placement。系統不在placing期間自動開啟、切換或重排panel。
- Interaction：native與keyboard共用`idle → placing → committing → idle`；preview與commit前都走`resolveRegisteredDrop`，commit再以latest payload／state／capability重驗。一般畫布空白只取消；只有exact Employee assignment在Organization owner內顯示的暫時解除區可以解除任職。
- Result：第一任職、兼任、exact移轉、解除、取代現有人員、Duty主執行移轉與Process link有可辨識結果語意；有效結果只commit一次，成功用projection＋單一live result＋Undo，不開逐次Modal。
- Data／API／Permission：OrganizationDocument V7、relation schema、backend API、permission與save path均不變；Session永不進URL、local layout、domain history或autosave。Employee沿用assignment helpers，Duty／Process沿用Organization Commands。
- Failure：invalid MIME／pair、stale source、target卸載、capability loss、mode／version切換與command rejection全部fail closed；autosave／409沿用既有workspace recovery，不另做第二補償或保存。
- Evidence：代表fixture需包含無／單一／多任職Employee、空／多人／單人Position、無relation／已有primary Duty及重複／非重複Process link；B16以正常入口、實際native及keyboard、Undo、save／reload、readonly viewport與visible error sweep建立fresh evidence。

#### RD Implementation Contract（Ready）

- 唯一owner：`App`以一個`useReducer(reduceRelationPlacementSession, createRelationPlacementSession())`、一個source focus ref及一個同步commit lock擁有整個placement生命週期；`src/workspace/relationPlacement.ts`只提供pure state transition、payload equality與auto-pan，不執行domain mutation。
- 唯一規則／提交：preview與commit都以latest canonical state及capability重跑`resolveRegisteredDrop()`；只有`intent`可由App的`commitDomainMutationIntent`分派至既有Employee assignment helper或Organization Command，noop／rejected不得產生dirty、history或autosave。
- Exact migration：修改`entityDrag.ts`、`App.tsx`、`DirectoryDock.tsx`、`OrgNode.tsx`、Process三個surface及Organization panel／CSS；刪除未使用的`WorkspaceDragSession` placeholder、Employee／Duty平行state、legacy Duty MIME／handler及其CSS。完整file／symbol與禁止事項見主spec第22.6節。
- Slice：S7-0先鎖pure reducer／resolver／source-policy；S7-1接唯一owner與commit dispatcher；S7-2完成Employee新增／兼任／exact移轉／解除；S7-3完成Duty＋lane→Position；S7-4完成Duty↔ProcessNode；S7-5刪舊路徑、跑aggregate與B16 candidate freeze。每一slice都必須在新路徑接通後同slice刪除其舊owner，不允許永久雙軌。
- 可執行Gate：新增`relationPlacement.test.ts`與`scripts/dev039-s7-fixture.test.ts`，以既有`ProcessPlanningWorkbench.test.tsx`作跨來源／目標composition harness，擴充既有resolver／component／architecture policy tests，跑typecheck、targeted、full regression與build；`scripts/dev039-s7-fixture.mjs`經現有workspace API建立、檢查並recoverably archive task-owned fixture，B16產出`F039-S7-B16-*`及provenance。Exact命令、stable fixture IDs與cleanup條件見主spec第26.8節。
- Recovery：任一slice未通過時只回退該slice，保留S0～S6；invalid MIME、stale source、target卸載、capability loss、mode／version切換及command rejection全部fail closed。若需要新schema／API／permission、第二business state、未登錄relation或新dependency，立即停止回PM。

#### S7 execution checkpoint（2026-08-31）

- 靜態與自動化 Gate 已完成：最新 targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯與lifecycle合併重跑 `4 files／20 tests`）、full regression `160 files／663 tests`、`npx tsc --noEmit --pretty false`、`npm run build`、legacy source scan及`git diff --check`均通過；本輪新增E2 fail-closed與Process canvas lifecycle tests不改產品契約，Process canvas after-fix geometry observation另於第26.17節記錄。
- B16 loopback execution：以task-owned Vite `127.0.0.1:8080`、Playwright Chromium `HeadlessChrome/151.0.0.0`、viewport `1280×720`及loopback dev identity（issuer `urn:orgmaster:dev`、subject `local-admin`）經正常頂部 `功能` 入口執行；fixture version `draft-ae49e198-ff78-4ace-96af-6cab7cf080e5`（`DEV-039-S7-B16-1788156467803`）由`scripts/dev039-s7-fixture.mjs`建立、讀回後已archive，archive manifest revision為`108fd7d058d44db20e50b477d7cd1260dd21f95bf60af1ecd9299a7d7a583cb5`，最終version revision與link readback見`output/playwright/dev039/manifest.md`。
- 成功證據：ProcessNode→Duty與Duty→ProcessNode keyboard均由同一Placement Session建立canonical link；同target duplicate為noop；另有Employee／Duty keyboard／native、Escape cancel、current readonly無drag handle及draft reload persistence均已由API readback／UI操作確認；1440／1024／390 viewport與document overflow亦已補測。較早 in-app browser CUA未觀察到HTML5 `dataTransfer` drop／mutation；後續 task-created Chrome CUA則觀察到Employee→Position native DOM mutation、same-target noop及Duty→Process invalid＋Escape cancel，但strict MIME與同操作API／revision仍未讀回，不能宣稱native通過；截圖與逐案結果見`output/playwright/dev039/manifest.md`。
- 恢復／下一步：E3-LIFECYCLE與E3-WARNING已由同一 fixture 的 browser／native CDP record 補得 mount／close／reveal／mindmap→flow／reload bounded evidence，E3兩個個案均為 `pass`；E2五案亦已由最新 runner 輸出 `historyEvidence` 行為性 Undo record並通過，現行下一步只剩可讀取真實 `DataTransfer` 的 E1 native runner、正式 QA-QC／E4 freeze，不需修改產品 schema、API或新增 dependency。loopback dev identity不代表正式登入或production auth。

#### S7 closure checkpoint（2026-08-31）

目前不需要重新定義架構；最小RD產品工作包已完成：`ProcessDutyBridge`將Duty列註冊成可供native／keyboard使用的target，`ProcessPlanningWorkbench`只傳遞App既有preview／commit窄Props。`entityDrag.ts`、resolver及既有`LINK_PROCESS_NODE_DUTY` intent仍是唯一權威；後續只補fresh QA／QC與viewport evidence。

派工邊界固定如下：

1. 已完成`src/components/ProcessDutyBridge.tsx`與`src/components/ProcessPlanningWorkbench.tsx`的Props／target wrapper；linked／available Duty row皆可被解析為`{ kind: 'duty', dutyId }`，名稱click仍是選取、解除按鈕仍是解除。
2. target wrapper保持接受strict `application/x-orgmaster-entity`、具可觀察的`tabIndex=0`及accessible name，並回呼App既有`onRelationPreview`／`onRelationCommit`；不得在component內新增resolver、commit、state、MIME或API。
3. 已執行`ProcessPlanningWorkbench.test.tsx`、`ProcessDutyBridge.test.tsx`及`WorkspaceArchitecturePolicy.test.ts`，並用同一B16 fixture重跑ProcessNode→Duty／Duty→ProcessNode native＋keyboard、duplicate及API readback；invalid／Escape／capability loss／focus return列入fresh QA重驗。
4. Fresh B16 evidence已回填`output/playwright/dev039/manifest.md`，並同步主spec第26.13節、feature parity manifest第16.6節及ADR-009；keyboard relation、no-op、cancel、reload與viewport已閉合。較早 in-app CUA未觸發可觀察`dataTransfer`，後續 Chrome CUA補到Employee→Position native DOM mutation與Duty→Process invalid＋Escape cancel，但strict MIME、API／revision、target卸載／capability-loss failure evidence與React Flow warning仍開放，維持`Relation Placement Implemented / QA-QC Reopened`。後續重跑只補剩餘native／失敗／warning證據，不新增架構或第二份證據清冊。

此工作包不允許新增DnD dependency、schema／API／permission、第二business state、generic event bus、plugin、multi-instance或第二mutation path；也不授權commit、merge、deploy或release。

#### S7 remaining closure execution packet（2026-08-31）

主spec第26.13節及第26.13.1節已將剩餘工作固定成四個可派工 closure ID與最小單案矩陣：`E1-NATIVE`（真實 HTML5 `DataTransfer` 與 API readback）、`E2-FAILURE`（invalid／target卸載／capability loss 的 visible fail-closed）、`E3-WARNING`（React Flow parent-size warning 時序與處置）、`E4-FREEZE`（文件／證據／cleanup同步）。E2五案與E3兩個個案均已取得 browser record與完整行為性 evidence，E2／E3均為現行 `Pass（evidence）`；目前只開放 E1 strict native runner、正式 QA-QC與 `E4`，故 DEV-039 維持 `Relation Placement Implemented / QA-QC Reopened`。

RD 執行順序固定：targeted relation／component／fixture tests → `npm test -- --run --pool=forks --maxWorkers=1` → `npx tsc --noEmit --pretty false` → `npm run build` → `git diff --check` → canonical `/` 頂部`功能`入口的 fresh browser evidence。若不需程式修正，只補 `output/playwright/dev039/manifest.md`；若需修正，只能落在既有 `entityDrag`／`relationPlacement`／App coordinator／target wrapper／Process canvas lifecycle，禁止新增 dependency、MIME、resolver、mutation path、schema／API／permission或全域 console suppress。每案必須記錄 stable IDs、revision、dirty／history／autosave、focus、console、network、viewport、identity、fixture與cleanup；E1 不得以 CUA 未產生 `dataTransfer` 的結果代替。

#### S7 evidence record contract（2026-08-31）

主spec第26.14節是 E1～E3 的唯一 evidence record schema 與保守判定演算法；`output/playwright/dev039/manifest.md`只保存 records，不另造狀態機。每筆 record 必須來自同一 B16 fixture version，包含 case／closure／relation／input mode、canonical route、viewport、mode、browser／identity、before／action／after、visible result、產品 console、API readback 與 cleanup。`before／after`至少要有 relation IDs、version revision、dirty、autosave state；history length若可取得只作 optional diagnostic。E2另必須有 `historyEvidence`，以一次合法 mutation＋恰好一次既有 `Control+Z` 證明完整 canonical relation IDs 回到 baseline；native case另需實際從 drop event 讀到 strict `application/x-orgmaster-entity` 的 `dataTransfer.types`。

判定順序為 `blocked → fail → partial → pass → observed → not-run`：必要欄位缺失不得推論通過；CUA／工具無法取得 `dataTransfer`、API／revision、zero mutation或 E2 `historyEvidence` 時，只能標 partial／blocked。E4 只採用 records、acceptance與清冊內容，不採聊天、舊截圖、unit或API直寫推論。若新增 runner，僅可放 `scripts/`／測試目錄，不得進 production bundle、不得呼叫第二 resolver／mutation owner，也不得用 `page.evaluate` 直接提交產品 mutation。

最低 case ID 固定為 `E1-EMP-POS-NATIVE`、`E1-DUT-POS-NATIVE`、`E1-PROC-DUT-NATIVE`、`E1-DUT-PROC-NATIVE`、`E2-INVALID`、`E2-UNLOAD`、`E2-CAPABILITY-LOSS`、`E3-LIFECYCLE`；`E2-COMMIT-REJECT`與`E2-409-RECOVERY`是已取得的 optional 補充 case，不改最低 gate。同一artifact可被多案引用，但每案仍須有獨立 assertion與status。

#### S7 latest E2 evidence checkpoint（2026-09-01）

依主spec第26.21.19節，隔離 B16 fixture `draft-02d6deb8-9c2b-4653-85a9-a970b9bff50c` 以固定 Playwright `1.62.1`／Chromium `149.0.7827.55`重跑 `e2-admission.pw.ts`，五案 E2 加兩案 E3 共 `7 passed`。五案 E2 均輸出 `historyEvidence`（合法 mutation、恰好一次 `Control+Z`、完整 canonical relation IDs回 baseline），並通過 zero-mutation、dirty／autosave、focus、document listener、re-entry與409 recovery；E2 aggregate現為`Pass（evidence）`，待正式 QA-QC覆核。為降低假陰性，runner明確切換流程圖視角並在合法 mutation後等待既有 autosave settle；沒有新增產品 debug API、第二 history store、resolver、mutation owner或輸入路徑。archive final manifest revision=`562a844e860c2baf9714986f5ce61a93fc92c565f06750c85022b21f517e656c`，5080已停止／釋放，5000未觸碰。E1 strict native／paired direction與E4仍未閉合。

#### S7 RD handoff index（2026-09-01，現行）

下一輪派工只保留三個工作包：

1. `E1-STRICT-NATIVE`：沿用同一 B16 fixture、canonical `/`、既有 strict MIME與 registered resolver；取得真實 `dragstart→dragover→drop`、`DataTransfer.types`、API／revision／canonical readback後，成對完成 ProcessNode↔Duty。
2. `QA-QC-REVIEW`：覆核最新 E2 `historyEvidence`、E3 lifecycle／warning與 E1 records，確認 artifact、cleanup與主spec／Parity／manifest／dev_task四方同版。
3. `E4-CANDIDATE-FREEZE`：只有 E1～E3 required pass且 cleanup／source scan／build均可重演時，才由 PM 另行取得使用者授權進入 candidate freeze。

這三個工作包只讀取既有契約，不新增 DnD dependency、第二 MIME／resolver／mutation owner、schema／API／permission、global listener、feature flag或第二份 evidence manifest；若 strict runner仍不可用，保存 `blocked／not-run` provenance後停止同類重試。

#### S7 fresh native evidence records（2026-08-31）

主spec第26.15節與Parity第16.8節已補兩筆同一 B16 fixture 的 fresh native record：`E1-EMP-POS-NATIVE=pass`（Employee→Position，strict MIME、PUT #608=200、assignment readback、response revision）及 `E1-DUT-POS-NATIVE=pass`（Duty主執行→Position，strict MIME、PUT #738=200、rel-duty-7、response revision）。對應截圖為 `F039-S7-B16-native-employee-position.png` 與 `F039-S7-B16-native-duty-position.png`，fixture `draft-508a1fcd-e705-4bd1-98bf-72a140e607eb` 已 recoverably archive，8080 未啟用，使用者 owned 5000 未停止。

這兩筆只關閉單案，不改變 DEV-039 狀態；ProcessNode↔Duty native 成對案例仍須依第26.14節補齊。Process source→Duty 本輪因 duty drawer 展開後 source 位於不可見 transformed viewport，正常 pointer path `not-run`；不得用 `page.evaluate`、style 注入或 API 直寫補造結果。`E1-NATIVE`仍為 `Partial／Open`，`E2-FAILURE`現為`Pass（evidence）`（最新五案詳見S7 latest E2 checkpoint），`E3-WARNING`已由原生 CDP listener record標為 `pass`，`E4-FREEZE`仍為 `Blocked`。

#### S7 現行證據讀取規則（2026-08-31）

下一輪 RD／QA／QC 不再從歷史段落自行推導狀態，固定依序讀取：主spec第26.13節（派工）→第26.13.1節（最小 failure／lifecycle case matrix）→第26.14節（record schema／判定）→第26.15節（最新逐案結果）→第26.17節（Process canvas 幾何／生命週期窄修正）→第26.18節（native runner admission）→第26.21.17～26.21.21節（E3／E1／E2最新補強與 ProcessNode source handle 窄修正）→Parity第0.1～0.2、16.6～16.15.17節及 `output/playwright/dev039/manifest.md`（索引／artifact）。本節前面的S7 execution／closure checkpoint與manifest較早loopback／CUA紀錄只作provenance，不能把單案 `pass`、unit／build、API直寫或工具限制上推為aggregate pass。

現行狀態快照固定為：`E1-NATIVE=Partial／Open`（Employee→Position、Duty→Position及ProcessNode→Duty各一筆strict單案pass；paired Duty→ProcessNode 最新 reverse runner 僅到 `dragover`，正式記為`blocked／not-run`）、`E2-FAILURE=Pass（evidence）`（五案均有 browser record、dirty／autosave／document listener、重新 editable／409 recovery與 `historyEvidence`）、`E3-WARNING=pass`（native CDP listener、geometry／observer／rAF與strict raw-console均通過）、`E4-FREEZE=Blocked`。新增E1～E3證據時，先追加主spec第26.15節，再同步Parity與evidence manifest；`dev_task.md`及`documentation_map.md`只更新摘要，不建立第二套record欄位或判定演算法。下一輪接續順序、runner blocked處置與禁止擴張項目以主spec第2.1節為單一冷啟動入口。

2026-09-01 fresh strict-runner probe 已在滾動後可見的 Process source／Duty target 重演；`elementFromPoint` 可命中產品 source／target，但未產生可觀察 `dragstart／dragover／drop` 或 strict `DataTransfer`，且沒有 API 直寫或新增Process link。fixture `draft-22e0c2bc-29e2-4460-a222-86664fc4cdde` 已以既有 archive path 清理（final manifest revision=`51e3a8f1834595939f00337f2854e3e5c5042af95f45dce0acd2f45038bef5bf`），task-owned `5080` runtime已釋放。依主spec第26.21.20節，ProcessNode→Duty標為`blocked`、paired Duty→ProcessNode標為`not-run`；此結果只說明runner能力，不改寫成產品故障或native pass。後續不得重複同類 runner，除非取得能讀取真實 `DataTransfer` 的新環境。

2026-09-01 第二次 strict-runner capability probe 改用全新 fixture `draft-dc8cdb58-488c-42ee-9430-e20276fa255b`，在 source／target geometry與`elementFromPoint`均命中產品元素後，Chromium CDP `Input.setInterceptDrags`、原生滑鼠路徑與最小 HTML5 probe仍未取得可採用的產品事件序列或 strict `DataTransfer.types`；沒有 synthetic event、API直寫或 domain mutation。fixture archive response=`200`、final manifest revision=`99cda30acc92c181d0e1ae99769e54dae131515316c7c9e7e20aa7bb724bb584`，5080已清理、5000（PID `23840`）未觸碰。依主spec第2.5.1節，E1 ProcessNode→Duty維持`blocked／not-run`；paired Duty→ProcessNode的最新正式 reverse boundary 另見主spec第26.21.24節，維持`blocked／not-run`；除非取得新的可讀取真實 `DataTransfer` harness，否則停止同類重試，不新增第二輸入路徑、resolver、mutation owner或證據清冊。

2026-09-01 ProcessNode source handle 窄修正：盤查確認 React Flow pane 的 d3 pan 可能在 HTML5 drag promotion 前攔截 source `mousedown`；既有 `ProcessNodeCard` handle 加入 `onMouseDownCapture` stopPropagation，未新增 state／listener／MIME／resolver／Command／API。`ProcessPlanningWorkbench` targeted regression為`1 file／5 tests passed`，`npx tsc --noEmit --pretty false`與`npm run build`通過。修正後 browser diagnostics可觀察 strict MIME `dragstart／dragend`，runner仍缺可採用`dragover／drop`，因此 E1／E4判定不變；詳見主spec第26.21.21節。

本輪另嘗試全量 `npm test -- --run --pool=forks --maxWorkers=1`；超過四分鐘無測試結果輸出後已安全停止 task-owned Vitest process，不覆蓋既有成功基線 `160 files／663 tests`。本輪可採用 gate 仍為 targeted、typecheck、build；不以未完成的全量重跑宣稱通過。

#### S7 continuation gate（2026-08-31）

本小節只作 dev_task 的短索引，詳細契約仍由主spec第2.1節及第26.13～26.21節擁有：

1. 先跑 targeted → aggregate → typecheck → build → diff check；任何失敗先停止，不以文件改寫狀態。
2. 依第26.18節判定 runner。若無法讀取真實 `DataTransfer`，將 E1 記為 `blocked／not-run`，保存環境與cleanup後停止同類嘗試。
3. runner admitted 才補 E1；E2／E3 可獨立補，但每案仍需同一 B16 fixture、visible result、focus／cleanup與zero-mutation或listener evidence。
4. 只在 E1～E3 全部 pass、fixture／runtime cleanup可讀回且四方文件同版後，才進 E4 candidate freeze；未達成前不得 commit、merge、deploy或release。
5. 禁止新增 DnD dependency、第二MIME／resolver／mutation owner、schema／API／permission、global listener、feature flag或第二份 evidence 清冊。

#### S7 Process canvas 幾何 blocker 與窄修正結果（2026-08-31）

- before blocker：`localhost:5000` B16 draft 量測曾顯示 `process-planning-graph-panel` 約 `360×206px`、`process-planning-canvas` 約 `358×390px`（`flex: 0 0 390px`），React Flow root 約 `637.5×617px`，source handle 延伸至 graph panel 可見範圍外；快照 `F039-S7-E3-process-geometry-blocker.png` 保留作 provenance。
- 已完成窄修正：既有 Process canvas／React Flow root 使用 `min-width／min-height:0`、正常文件流，移除固定 `flex-basis:390px`；shared split 中欄可收縮；`ResizeObserver` 在兩個 animation frame 等待 custom node measurement 後執行一次 `fitView`，unmount／hidden 清理 observer／rAF。未新增 DnD dependency、resolver、MIME、mutation owner、global CSS／portal或layout state。
- after-fix browser evidence：同一 B16 split fixture 量得 graph panel `276.1875×536px`、mindmap canvas `274.1875×224px`，兩個 source handle 均落在 canvas／panel 內，canvas／React Flow `scrollWidth／scrollHeight` 與 client 尺寸一致；reload／切換 flow 的產品 console `errors=0／warnings=0`。artifact 為 `F039-S7-E3-process-geometry-after-fix.png`。
- 判定：`E3-GEO-SPLIT` 與 reload／flow geometry observation 可標 pass；standalone／reveal／listener cleanup 尚未形成完整 `E3-LIFECYCLE` record。ProcessNode↔Duty native 本輪仍因 Playwright 未產生可採用的 `dataTransfer` 事件而 `not-run`，不得將幾何 pass 推論為 relation pass；詳細契約與剩餘驗收以主spec第26.17節、Parity第16.10節為準。

- 短面板 editor saturation follow-up：同一 B16 split fixture 在 graph panel 約`342.7625×212.3px`時，既有 canvas 以`min-height:180px; flex:1 1 180px`保留`325.9625×180px`非零操作區；兩個 relation handle 約`17.303×17.303px`，`elementFromPoint`命中產品`BUTTON`。artifact為`F039-S7-E3-process-canvas-min-height.png`。此窄修正只關閉短面板零高度的幾何 observation，不改 layout／relation契約；E3 warning／standalone／reveal正式QA-QC、E1 Process native與E4 freeze仍開放，E2只剩嚴格 history-length gate。

- Native runner availability decision：task-owned Playwright `dev039-e2`、In-app Browser CUA與Chrome extension CUA在canonical B16 split中確認source／target owner geometry與strict MIME元件存在，但均未產生可採用`dragstart → dragover → drop`／`DataTransfer.types`；Chrome browser-client先無可連線tab，後建立隔離分頁重跑仍無native事件，本輪無產品mutation／console error。另觀察keyboard placing後切換現行版會離開placing狀態，但缺API／revision／zero-mutation完整record。依主spec第26.19節，ProcessNode↔Duty native維持`not-run`、E1 aggregate維持`Partial／Open`，停止重複同類工具嘗試；下一次只在具備真實HTML5 DataTransfer的runner重跑，不新增synthetic path、第二resolver／mutation owner、API直寫或產品fallback。

- E3 lifecycle fresh observation：以 task-owned In-app Browser 完成 Process standalone mount、close/unmount、`功能→流程規劃` promotion、mindmap／flow切換、開啟工作職掌再返回及 reload。standalone／reveal／reload 幾何與單一 graph／canvas owner surface 局部通過，產品 console 無 error／warning；artifact為`F039-S7-E3-lifecycle-iab.png`。工具未提供 listener inventory，故只標局部 observation，`E3-LIFECYCLE`仍為`Partial／Open`。

- E3 lifecycle automation coverage：`src/components/ProcessPlanningCanvas.lifecycle.test.tsx` 已補受控 jsdom 測試，證明可見 surface 兩 frame settle 後只 fit 一次、unmount disconnect observer、hidden surface 取消 pending rAF 且不 fit。這只覆蓋 Process canvas 自身 cleanup 子項；瀏覽器 listener inventory仍未取得，故`E3-LIFECYCLE`維持`Partial／Open`，不得把 unit pass 上推為 aggregate pass。

Final code gate（2026-08-31）：本次幾何窄修正、E2 fail-closed test與Process canvas lifecycle test增補後，targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯與lifecycle合併重跑 `4 files／20 tests`）、aggregate `160 files／663 tests`、`npx tsc --noEmit --pretty false`、`npm run build`與`git diff --check`均通過；Vite native-config extension advisory與既有 chunk-size advisory為非阻擋提示。這只證明程式與幾何 observation 基線，不關閉 E1 native strict MIME／API、E2 browser failure、E3 standalone／reveal／listener lifecycle或E4 freeze。

### 真正問題與使用者價值

### 試用修正：清單與明細相鄰排列（2026-08-30）

實際開啟員工panel時發現，`MasterDataModuleAdapter`原以`34%`作清單欄，但共用Directory內容實際固定約`242px`，兩者不一致會在清單右側留下空白，並把明細推離清單；窄版Inspector的絕對定位也可能覆蓋整個panel。Current Phase採最小修正：將同型主資料panel的清單欄固定為Directory寬度（桌面／窄桌面`242px`、`690px`以下`190px`），明細強制回到adapter正常文件流並緊接右側；員工、職位、部門共用此規則，層級維持單欄。此修正不增加頁面、資料、Command或workspace split能力，只修正共用CSS projection，並以`data-layout="adjacent-list-detail"`及子節點順序測試固定契約。

Process的「流程清單→圖形→Duty bridge」是三欄不同語意，不誤套兩欄固定寬度；未來新增相同清單／明細形狀的adapter，必須重用同一相鄰排列契約。

DEV-038 已證明 ProcessNode、Duty、DutyPositionRelation 與 Position 可以用同一份 OrganizationDocument V7 聯動，也已具備心智圖、流程圖、職掌橋接與組織投影。但固定的左／中／右工作台替使用者預先決定了觀看順序與畫面比例；當規劃者只想比較其中兩種資料，或需要同時開啟另一份清單與明細時，固定版面會造成遮擋、縮圖化及持續增加新視角頁面的壓力。

DEV-039 的價值不是再增加一個新視角，而是提供一個受控的可組合規劃桌面：總經理與主管依當下問題，自行開啟需要的資料面板、並排比較、選取聯動，並把具型別的領域物件拖到合法目標以建立關係。系統仍負責資料正確性與可執行 command，使用者只負責選擇工作視角及業務判斷。

### Human-confirmed 方向

1. 新版以「使用者自訂視角」取代系統持續增加固定視角頁面。
2. 使用者可在同一個完整 URL 工作台開啟多個面板並排比較，面板內仍沿用相同的清單、選取與明細肌肉記憶。
3. 面板之間可拖曳資料物件；拖放只建立系統明確登錄的關係，不允許面板自行寫入任意資料。
4. 新版與舊版的替換在專用 branch 內完成；新版核心流程通過後，合併前刪除舊固定工作台，不在正式 runtime 維護永久雙模式或長期 feature flag。
5. 替換的是規劃 UI shell，不是重寫 OrgMaster。DEV-038 的 V7 領域模型、ADR-008、Command、Undo／Redo、autosave、CAS、validation、Dagre／React Flow 投影及 DEV-034 relation mutation原則持續沿用。
6. 手機仍遵守專案最高原則，只提供唯讀閱讀及關聯導覽；第一版可組合編排只服務桌面／筆電。

### Human Decision Brief — Round 1（2026-08-28）

來源：使用者於 `#引導模式` 明確回答 `1A／2A／3A`。

| 決策 | Human Confirmed rule | 拒絕／延後方向 |
| --- | --- | --- |
| `1A` 面板自由度 | 第一版採受控 Dock／Split；面板可開關、並排、換位及調整大小，但不可互相重疊 | 不採完整 Windows 式浮動／最小化／最大化；固定模板不作唯一操作方式 |
| `2A` 拖曳寫入 | 拖曳期間顯示合法目標與結果預覽；放開後立即執行一個既有 Command，顯示成功／失敗結果並提供 Undo | 不在每次 drop 後開確認視窗；不建立批次暫存／統一套用模式 |
| `3A` 版面保存 | 第一版版面只保存在目前瀏覽器，重新整理後恢復；layout 不進 OrganizationDocument、organization version或server account | 跨裝置、跨帳號及公司共用 layout 延後 Future Phase |

AI／RD 可自行決定 dock library 或自製方式、layout storage key／version、preview視覺、結果訊息文案與Undo控制位置；但不得改變上述產品語意。若真實試用證明必須重疊視窗、drop前逐次確認、批次套用或跨裝置同步，重新進入Human Decision，不得由實作自行擴張。

### Human Decision Brief — Round 2（2026-08-28）

來源：使用者於 `#引導模式` 明確回答 `4B（自訂：預設只顯示組織架構圖）／5C／6A`。

| 決策 | Human Confirmed rule | 拒絕／延後方向 |
| --- | --- | --- |
| `4B 自訂` 初始配置 | 第一次進入與恢復預設配置時，只開啟組織架構圖；其他面板由使用者按需開啟 | 不使用空白桌面、模板選擇Modal，也不預設同時開啟心智圖或工作職掌 |
| `5C` 選取聯動 | 所有未釘選面板預設跟隨同一個shared selection；使用者可釘選個別面板，使其暫停跟隨後續全域選取 | 不強制所有面板永遠同步，也不讓全部面板預設完全獨立 |
| `6A` 面板數量 | 第一版每種panel type最多開啟一份；再次開啟相同類型時應定位既有面板，不建立第二份 | 多份相同類型面板及其獨立context延後Future Phase；第一版不要求預建隱藏的multi-instance能力 |

AI／RD 可自行決定預設組織圖的初始縮放、同類型重複開啟時的focus／reveal效果、pin icon與accessible name；但不得預先打開其他面板、建立第二份同類面板或把pin改成複製資料。若真實規劃需要同時比較兩個同類視角，再重新進入多實例產品決策。

### Human Decision Brief — Round 3（2026-08-28）

來源：使用者於 `#引導模式` 明確回答 `7B／8A／9B`，並提出「入口統一在頂部、每個功能最多兩層：現有抽屜與完整工作台」作為待收斂設計原則。

| 決策 | Human Confirmed rule | 拒絕／延後方向 |
| --- | --- | --- |
| `7B` 面板入口 | 面板開啟入口固定於頂部，以單一控制開啟Popover；不常駐左側面板庫 | 不使用左側固定面板清單或畫布右鍵作主要可發現入口 |
| `8A` pin互動 | pin只固定panel context並隔離其panel-local selection；panel仍可正常操作與作drag source，所有mutation仍寫入canonical domain並由其他投影即時反映 | pin不是資料快照、不是唯讀副本，互動也不得自動取消pin |
| `9B` 空工作台 | 組織架構圖與其他panel都可關閉，允許零panel的空工作台；不自動重開組織圖 | 不把組織圖設為不可關閉，也不強制至少保留一個panel |

「每個功能最多兩層操作介面」已於Round 4確認：第一層是該功能的快速Drawer，第二層是單一共用完整URL工作台中的對應panel；panel只是第二層的layout region，不是第三層。組織架構功能是明確例外，只有完整工作台panel，從頂部入口直接加入或聚焦。此限制是UI／導航深度，不限制OrganizationDocument內部資料關係深度。

### Human Decision Brief — Round 4（2026-08-28）

來源：使用者於`#引導模式`明確回答`13A／14A／15A`，並以「聚焦對應面板」參照對話補充加入／聚焦語意；參照對話只作需求背景，不視為額外執行指令。

| 決策 | Human Confirmed rule | 拒絕／延後方向 |
| --- | --- | --- |
| `13A` Drawer脈絡延續 | 點選Drawer清單項目時只在同一Drawer內選取並展開最小摘要；按`在工作台開啟`才進入第二層，並攜帶該模組已登錄的selected object、query與filters | 不因row click直接跳完整工作台；不再開第二個Drawer或第三層明細 |
| `14A` 單一模組panel | 第一版每個module／panel type最多一份；再次開啟時聚焦既有panel並依pin規則處理context，不建立第二份 | multi-instance與`複製面板`延後Future Phase；不得為未來多實例先暴露UI |
| `15A` promotion保留layout | `在工作台開啟`關閉目前Drawer，保留所有既有panel與排列，加入尚未存在的對應panel，或聚焦已存在的對應panel | 不清空其他panel、不切成獨立模組工作台、不開新瀏覽器頁籤 |

`加入／聚焦`只描述系統演算法，不是使用者必須選擇的兩個動作。UI固定顯示`在工作台開啟`：panel不存在時加入；已存在時reveal／focus並提供短暫就地高亮，必要時將收合panel恢復可見，但不得擅自重排、縮放或清除其他panel。

pin優先序固定如下：panel不存在時以Drawer context建立；既有panel未pin時，聚焦並接收Drawer promotion context；既有panel已pin時只聚焦，保留原panel-local context並以既有pin狀態讓使用者辨識，不以Drawer選取覆寫，也不因此建立第二份panel。

目標功能介面目錄固定為：組織架構、兼任風險與角色治理直接使用完整工作台panel；職位、員工、部門、層級、流程、工作職掌與管理辦法提供快速Drawer＋共用工作台panel；版本、文件、儲存、搜尋與mode狀態保留全域chrome。最新零功能遺失決策要求Current Phase一次納入所有現有功能，但仍按需開啟，不預開全部panel。

### Human Decision Brief — Slice 1模組範圍（2026-08-28）

狀態：`Superseded by 全部現有功能零遺失覆寫 / Historical Decision Only`

來源：使用者明確指定「現有成熟的都先啟用組織架構圖、員工、職位、部門、層級」。

第一個最小可開發切片只啟用以下五個module surface：

| 模組 | 頂部入口結果 | Slice 1完整panel邊界 |
| --- | --- | --- |
| 組織架構圖 | 直接加入／聚焦panel | 重用既有組織圖投影與合法操作；不建立Drawer |
| 員工 | 先開員工Drawer | 重用既有員工清單、選取、明細與已存在合法command |
| 職位 | 先開職位Drawer | 重用既有職位清單、選取、明細與已存在合法command |
| 部門 | 先開部門Drawer | 重用既有部門清單、選取、明細與已存在合法command |
| 層級 | 先開層級Drawer | 重用既有層級清單、選取、明細與已存在合法command |

「成熟」在本切片只代表已有canonical OrganizationDocument投影、既有command／validation及現行UI行為可重用；不得藉由panel化新增主資料語意、第二套CRUD、第二套保存或新權限。員工／職位／部門／層級的完整panel是既有能力的workspace projection，不要求第一輪另造大型分析儀表板。

流程、工作職掌、管理辦法、Process心智圖／流程圖及typed relation drag均移入Future Phase Capsule；它們仍屬長期module surface architecture，但不作Slice 1完成條件。DEV-038固定工作台在後續替代能力通過前保留於branch作歷史與回歸基線，Slice 1不得執行舊UI deletion gate。

### Human Decision Brief — 全部現有功能零遺失覆寫（2026-08-28）

來源：使用者明確改變前一輪決策，要求「現有的功能模組都要一起啟用，包含兼任風險等，避免弄丟任何一個功能」。本節是`Intentional replacement`，覆寫前一節只啟用五種成熟主資料surface及把流程／職掌／管理辦法／跨面板資料拖曳延後的Current Phase範圍；前一節只保留決策歷史，不再作實作或驗收依據。

「全部啟用」固定解讀為所有現有功能都能由新版正常入口到達並完成原有任務，不代表第一次載入預開全部panel。第一次進入與恢復預設仍依`4B自訂`只顯示組織架構圖；其他功能從頂部launcher按需開啟。

依目前repo正常UI與route盤點，Current Phase至少包含以下功能面：

| 類別 | 現有功能 | 新架構責任 |
| --- | --- | --- |
| 模組panel | 組織架構圖 | 頂部入口直接加入／聚焦panel；保留canvas、Inspector、context操作、employee assignment及risk overlay |
| Drawer＋panel | 員工、職位、部門、層級 | 頂部先開各自Drawer，再promotion至完整panel；CRUD、排序、定位、指派及既有錯誤／唯讀gate不得遺失 |
| Drawer＋panel | 工作職掌 | 保留Duty清單、明細、建立／編修／刪除、責任lane、組織圖配置、責任盤點／分布及既有篩選 |
| Drawer＋panel | 流程規劃 | 保留流程清單、心智圖／流程圖view、節點／edge編修、Duty link與現有合法command |
| Drawer＋panel | 管理辦法 | 保留清單／搜尋／建立、閱讀／草稿、完整編輯、圖片、章節導覽、提供閱讀／還原／停止閱讀及既有職掌對照 |
| 直接panel | 兼任風險設定 | 保留rule新增／修改／啟停／刪除、風險等級及組織圖relation overlay；不另造無價值的前置Drawer |
| 直接panel | 角色指派治理 | 保留現有治理中心、指派／scope／期間／代理／發布、明細與模擬／檢查等已存在能力；不因搬入workspace改變authority |
| 全域頂部控制 | 版本切換／版本工作區、文件選單、儲存／另存／備份、全域職位／姓名搜尋、workspace mode／唯讀與autosave狀態 | 保持全域chrome，不硬轉成panel；所有現有keyboard、focus return、狀態與failure feedback必須保留 |

上表是高階module catalog；逐項權威清冊已建立於`ai-doc/specs/DEV-039-feature-parity-manifest.md`。該清冊從現行route、Toolbar、DirectoryDock、各full-page workbench、dialog／drawer、keyboard與permission／capability gate盤點正常入口、可見操作、authority、state及新surface mapping。任何漏列但由正常入口可達的現有功能仍自動納入Current Phase，不因文件未寫到就視為可刪。

### Feature Parity Manifest Authority

- 權威文件：`ai-doc/specs/DEV-039-feature-parity-manifest.md`。
- 狀態：`Baseline Inventory Complete / Target Mapping Complete / F039 Consolidated / Layout Amendment Implemented / QA-QC Passed / Local Release Gate Pending`；這是新版替換與驗收權威，原F039證據仍有效，本輪版面修正已補齊layout evidence，不等同commit、deploy或release。
- 清冊已涵蓋14個正常入口／route surface、全域chrome、組織圖與五種Directory、Duty與雙責任視角、Process、管理辦法、兼任風險、角色治理、keyboard、14類共通state及4條drag/session registry。
- P1 Recovery closure：新`WorkspaceRecoveryGate`與hydration capability intersection已接線，legacy `recoveryOpen=false`及`DocumentRecoveryDialog`已移除；B6證明index failure時全域fail closed，既有DEV-020 automated regression承接missing／invalid／failed draft、409、下載副本、回現行版與重載契約。Final QA-QC已依風險抽驗workspace整合，不阻塞replacement。
- Intentional exclusions：版本比較、standalone `GovernanceSimulator`、正式管理辦法頁已取代的舊prototype、DEV-034歷史picker及DEV-038固定composition不要求復活；但其仍適用的domain、Command、投影、tests及現行check能力必須保留。
- 所有列項目標證據已統一回填至`output/playwright/dev039/manifest.md`；F039、final QA-QC、full regression、build與source removal scan均完成，deletion gate已關閉。manifest仍明確標示證據為未提交worktree，不得誤報為immutable commit或release artifact。

功能模組、全域控制與panel內情境操作採三類管理：只有可獨立完成任務的功能進module launcher；版本、文件、儲存、搜尋與唯讀狀態留在頂部全域chrome；Inspector、Dialog、Popover、章節導覽等留在所屬panel內。這是位置重整，不是功能刪減。

### Current Phase主要流程

```text
從頂部統一功能入口選擇模組
  → 有Drawer的模組先開快速清單；直接型模組直接加入／聚焦panel
    → 在Drawer選取物件、搜尋或篩選，再按「在工作台開啟」
      → 保留既有layout，加入或聚焦單一對應panel並關閉Drawer
        → 將需要比較的面板並排、調整寬度或關閉
          → 在任一面板選取 Employee、Position、Department、Level、Duty 或 ProcessNode
            → 其他支援該 stable ID 的面板與組織圖顯示一致選取
              → 使用既有模組command，或將已登錄typed物件拖到合法跨面板目標
                → preview／result／Undo、autosave、reload由同一權威資料重建投影
```

### Current Phase Scope — 全部現有功能零遺失

- 一個桌面版完整 URL 規劃工作台，以及從既有 OrgMaster 正常導航可發現的入口。
- 頂部提供單一功能launcher與Popover，作為各模組第一入口；有Drawer的模組先開快速清單，直接型模組直接加入／聚焦panel。不建立常駐左側panel library或以右鍵作唯一入口。
- 同一時間最多一個快速Drawer；切換頂部功能時替換目前Drawer。Drawer只承擔清單、搜尋、篩選、選取、最小inline摘要與`在工作台開啟`，不得承擔完整編輯、開第二Drawer或形成第三層導航。
- `在工作台開啟`使用模組註冊的promotion mapper，把支援的selected object／query／filters轉成workspace context；不得複製領域資料、建立第二store或把任意Drawer local state寫進OrganizationDocument。
- 受控 dock／split 式面板編排：開啟、關閉、並排、調整尺寸、重排及恢復預設配置；第一版不允許任意重疊、浮動、最小化或最大化視窗。
- 第一次進入或使用「恢復預設配置」時只開啟組織架構圖；其餘面板由使用者從統一面板入口按需開啟，不顯示模板選擇Modal。
- 第一版每種panel type最多一份；相同類型已開啟時，再次要求開啟只reveal／focus既有面板並短暫就地高亮，不建立第二instance、不重排或縮放既有layout。未pin panel接收Drawer promotion context；已pin panel只聚焦並保留原context。
- 所有panel皆可關閉；零panel時保留完整工作台shell及頂部launcher，不自動重開組織架構圖。第一次進入或恢復預設配置仍依`4B自訂`只開組織架構圖。
- Current Phase module catalog至少包含組織架構圖、員工、職位、部門、層級、工作職掌、流程規劃、管理辦法、兼任風險設定與角色指派治理；parity inventory發現的其他現有獨立模組亦自動納入，不得因未列名而刪除。
- 組織架構圖、兼任風險與角色治理可直接加入／聚焦panel；員工、職位、部門、層級、工作職掌、流程與管理辦法使用Drawer＋panel。功能本身沒有快速清單價值時，不為形式一致強制建立空Drawer。
- 單一workspace shared selection context以stable ID聯動Employee、Position、Department、Level、Duty與ProcessNode，以及支援相同物件的投影；未釘選panel跟隨全域選取。pin只固定該panel context並隔離panel-local selection，所有既有mutation仍經canonical Command反映到各投影，不建立snapshot或直接修改其他panel state。
- Current Phase同時保留panel編排拖曳與所有現有資料拖曳；跨panel registry至少納入Employee→Position assignment、Duty＋責任lane→Position責任配置、Duty→ProcessNode link。每條關係沿用現有command、permission、duplicate／noop、keyboard alternative與Undo語意。
- 版本切換／版本工作區、DocumentMenu、save／save-copy／backup、global search、workspace mode、read-only／autosave status及其keyboard／focus／failure feedback保留為全域能力，不塞入module panel。
- 面板編排狀態與 OrganizationDocument V7 分離；第一版只保存在目前瀏覽器並於重新整理後恢復，不進 organization version、server API、帳號或跨使用者同步。確切 local storage／URL 契約已由主工程契約固定。
- 分支內保留舊 UI 作短期對照；新版通過 deletion gate 後，在合併前移除被取代 route composition、shell state、專屬 CSS、專屬 handlers 與只驗證舊 composition 的 tests。

### Out of Scope

- 不建立第二套 Process、Duty、Position、relation store、API、revision、autosave 或權限模型。
- Current Phase不重寫任何既有module domain、business command、permission、version或save authority；只建立Drawer／panel／global-chrome adapter與workspace projection。功能搬移不得改變可用能力或靜默降低權限／錯誤處理。
- 不提供任意重疊視窗、作業系統式桌面、無限制 panel plugin、使用者撰寫 command 或第三方面板執行任意程式。
- 不在第一版提供具名版面模板分享、跨裝置同步、多人即時共編、評論、AI 自動排版、AI 自動建立關係、BPMN 或流程執行引擎。
- 不因 UI 替換修改 ADR-008 的 OrganizationDocument V7 單一資料權威。
- 不 deploy、不 release；正式合併與發布另走 release gate。

### Architecture Memory Capsule

```text
OrganizationDocument V7（唯一領域權威）
  ├─ selectors / projections ──> Panel instances
  ├─ shared selection context ─> 各 panel 高亮與定位
  └─ registered commands <───── Panel adapters

Current typed object drag registry
  └─ registered payload／target／command mapping；只呼叫既有command authority

Workspace layout state（純 UI 偏好）
  └─ panel id / type / order / size / local view state
     不包含 Process、Duty、Position 或 relation truth

Module surface registry（純metadata／context宣告）
  └─ exact module id / label / hasDrawer / minimum / context parser與sanitizer
     Current：組織圖／兼任風險／治理 hasDrawer=false
               員工／職位／部門／層級／職掌／流程／管理辦法 hasDrawer=true

WorkspaceModuleSurfaces（唯一render owner）
  └─ typed adapter map / panel與Drawer renderer / visibility / close guard registration
```

- Workspace shell擁有panel instances、layout、shared selection、panel-layout drag session及registered typed object drag session。
- Module surface registry決定頂部入口要開Drawer或直接加入／聚焦panel；通用演算法不得散落成各頁面的module-specific `if/else`。
- Panel adapter 只宣告可讀投影、可接受的 typed payload 及要呼叫的既有 command；禁止 panel A 直接 import 或修改 panel B 的內部 state。
- 關係 mutation 必須經 `App`／既有 command owner；workspace shell 不新增旁路保存。
- DEV-038 的 `ProcessPlanningWorkbench` 固定 composition 是被替換的 UI shell；主契約第22、25節已固定保留其 canvas projection、layout resolver、selection resolver、domain modules與測試fixture，依S3 adapter抽取後才可把舊composition列入S5 removal allowlist，不以檔名先刪除。
- 跨模組UI composition的長期邊界已由ADR-009固定；ADR-008繼續擁有OrganizationDocument V7資料權威，不因版面替換重寫。

### 舊版移除 Gate（零功能遺失）

舊 UI 不在第一個 commit 刪除；必須同時滿足下列條件後，才於本 branch 內移除：

1. 已建立`ai-doc/specs/DEV-039-feature-parity-manifest.md`作逐項權威；現行每個normal entry、route、visible action、keyboard、read／write gate、空白／錯誤狀態及command都必須維持新surface mapping並取得`F039` fresh evidence，不得以「可能無人使用」省略。清冊建立本身不等於本Gate通過。
2. 所有現有模組可從新頂部入口開啟、排列、關閉或進入其完整工作面；預設仍只開組織圖，按需啟用不等於預開全部。
3. Employee→Position、ProcessNode↔Duty與Duty＋lane↔Position等現有主要配置路徑可由新UI完成，Undo／Redo、autosave、reload與validation通過。
4. 唯讀版本、capability loss、invalid drop、duplicate／noop、keyboard alternative、focus return及窄版唯讀退化均有targeted evidence。
5. 已建立舊route／component／state／CSS／test removal allowlist，確認沒有正常入口、panel、dialog、drawer、popover、shortcut或error recovery仍依賴舊composition。
6. 移除後typecheck、targeted tests、full regression、build及桌面／手機browser QC通過；evidence能追溯source、route、viewport、mode與fixture。
7. 正式runtime不殘留隱藏legacy mode、永久feature flag、第二套save path或只能由direct URL進入的舊功能。

Git history 是舊版可回查來源；不為了保留比較能力而把舊 UI 留在產品 runtime。

### Current Phase驗收方向

- 使用者能從正常入口進入工作台，從頂部launcher看見並開啟全部現有模組；在同一畫面至少同時開啟組織架構圖與另外兩種不同模組panel，重排與調整尺寸後不遮蔽必要操作。
- 第一次進入與恢復預設配置時只顯示組織架構圖；使用者能從統一入口開啟其他面板，同類型已存在時只定位既有面板。
- 有Drawer的模組由頂部入口開啟唯一快速Drawer；row click只在Drawer選取／展開最小摘要，按`在工作台開啟`後Drawer關閉且既有layout保持不變。panel不存在時加入，已存在時只reveal／focus並短暫高亮。
- Drawer promotion會把該模組支援的selected object／query／filters帶到新建或未pin panel；已pin panel不被覆寫，只被聚焦且原context可辨識。任何情況均不得建立第二份同類panel。
- 使用者可關閉最後一個panel並得到零panel工作台；系統不自動重開組織圖，頂部launcher仍可操作且是恢復內容的可發現入口。
- 管理辦法等module有未保存buffer時，close與browser Back必須先走module guard；取消關閉時panel、URL、context、buffer與focus均不變，只有allow後才commit移除。
- 預設只開組織圖時不得mount或fetch其他module；首次開啟才lazy mount，inactive停止可見性poll／fit／observer，close後釋放listener、timer與observer。
- 選取Employee、Position、Department、Level、Duty或ProcessNode時，其他支援該stable ID的已開啟panel與組織圖顯示一致選取；關閉或重開panel不改變領域資料。
- 未釘選面板跟隨shared selection；釘選面板保持context但仍可操作，其panel-local selection不覆寫全域selection；取消pin後重新跟隨目前全域選取。所有mutation仍即時反映canonical state，不建立資料副本。
- 現有Employee assignment、Duty responsibility與ProcessNode↔Duty等合法資料拖曳在新surface仍可完成；panel編排拖曳與資料拖曳必須明確區分，invalid／cancel不產生domain command、dirty、history或autosave。
- reload 後領域資料仍由 OrganizationDocument V7 恢復，第一版 panel layout只由同一瀏覽器local state恢復；layout損壞時安全回到預設配置，不影響organization state，也不向server寫入layout。
- 正常桌面入口、唯讀狀態、空白／載入／錯誤狀態及手機唯讀皆可觀察；direct URL 只證明 route recovery，不取代入口可發現性。
- feature parity manifest全部列項均有normal-entry browser evidence或與風險相稱的功能證據；任一現有功能無對應surface、只能direct URL到達或行為被靜默降級，即判定替換未通過。

### S0～S6既有RD Implementation Ready工程契約

`ai-doc/specs/DEV-039-composable-planning-workspace.md`已固定canonical `/`、十模組keyed context map、純metadata registry、唯一typed adapter render owner、242px推移式Drawer、split-tree＋tab stack、module minimum、單一panel identity、request／guard／commit close、lazy／hidden／close lifecycle、URL／local／session權威、promotion／pin、shared selection、typed drag、capability、legacy alias、recovery與Medium-risk QA/QC。Process心智圖／流程圖仍是同一Process panel內的既有view；不因workspace再拆成不同panel type。

S6 Implementation Readiness Review固定沿用React 19＋現有CSS Grid／Flex，不新增dependency或改動lockfile。主契約第22.5節列出`WorkspaceOverlayProvider`、Panel／Global hosts、`WorkspacePortal`、ListDetail／ListOnly Props、App owner factories、Duty三view panel mode、Management Method與Duty overlay分類及CSS owner；第25.5節固定S6-0～S6-5遷移與fail-closed recovery；第26.7節固定targeted／aggregate命令、source policy、B14～B15 fixture及Fail條件。P0／P1 readiness blocker及四項S6 product acceptance均已關閉；若會改變受控dock、單一panel、同一資料權威、全功能零遺失或deletion gate，才重新進入Human Decision。

S7目前為`Relation Placement Implemented / QA-QC Reopened`。S7-0～S7-4已完成pure reducer、single App owner、typed effect／capability path、source／target wiring、舊平行state刪除、composition harness與B16 pure transformer；最新 targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`、full regression `160 files／663 tests`、typecheck、build與source scan均已通過；本輪新增E2 fail-closed與Process canvas lifecycle tests不改產品契約。Process canvas 幾何窄修正後 split／reload／flow source handles均在owner canvas、無overflow且產品console `0／0`，artifact為`F039-S7-E3-process-geometry-after-fix.png`。fresh QA已補ProcessNode↔Duty keyboard、duplicate/no-op、Escape、readonly、reload與1440／1024／390 viewport／overflow；最新B16又取得Employee→Position與Duty→Position各一筆strict MIME／API／revision單案pass，但ProcessNode↔Duty native本輪`not-run`，E2 failure、E3完整lifecycle及E1 aggregate仍開放，不能以單案、目前 automated tests或S0～S6歷史測試宣稱S7完成。若偏離single App owner、pure reducer、既有domain authority、deletion allowlist或no-new-dependency邊界，立即停止回PM。

### RD主管架構審查與實作檢查點

結論：S0～S5的有限自製split／tab、單一module panel、browser-local layout及單一domain authority方向仍足夠簡潔；S6已完成`WorkspaceModuleSurfaces`的persistent render／overlay／selection owner強制邊界，並通過targeted／full regression、build及browser re-QC。S6只強化panel工程邊界，不加入通用桌面框架、event bus、plugin、multi-instance或第二套資料流，仍符合「現在從簡、未來可擴張」。

| 範圍 | 目前狀態 | 下一個closure |
| --- | --- | --- |
| S0 pure core | 完成／QA-QC通過 | 149-file full regression證明workspace core未建立第二domain truth |
| S1 shell | 完成 | canonical shell、十模組入口、Drawer promotion、split/tab/pin、零panel、reload、responsive focus、recovery及close unmount均有`F039`／automated evidence |
| S2 master data | 完成（replacement範圍） | 五模組正常入口、stable context、desktop／mobile capability與Employee→Position keyboard path通過；既有CRUD authority由full regression承接 |
| S3 Duty／Process | 完成 | 四lane與三條registered relation有exact IDs、keyboard/focus、Undo restore及full regression證據 |
| S4辦法／風險／治理 | 完成（replacement範圍） | 三模組正常入口、document lifecycle、current/mobile readonly與Role Risk 1023/390 mutation absence通過 |
| S5 replacement | 完成／QA-QC通過 | `F039`、removal allowlist、legacy source removal、source scan 0 matches、149 files／614 tests與build通過 |
| S6 panel boundary hardening | 完成／QA-QC通過 | Exact hosts／portal API、persistent owner factory、selection isolation、container／capability、S6-0～S6-5及B14～B15已有產品、測試、source policy與browser re-QC證據 |
| S7 relation placement | Relation Placement Implemented／QA-QC Reopened | `relationPlacement.ts`、single App owner、typed effect／capability path、Employee／Duty／Process source／target wiring、舊state刪除、composition harness與B16 pure fixture已完成；fresh QA已證明ProcessNode↔Duty keyboard、duplicate/no-op、Escape、readonly、reload與viewport；同一 fixture 七案合併 runner 證明 E3-LIFECYCLE／E3-WARNING（native CDP listener inventory、geometry／observer／rAF、raw diagnostics）均為`pass`，listener回到 `40／8／139` baseline；ProcessNode→Duty strict native單案為`pass`、Duty→ProcessNode最新 reverse runner為`blocked／not-run`，E1 aggregate仍`Partial／Open`、E2 aggregate為`Pass（evidence）` |

S0～S6 QA-QC checkpoint：2026-08-30既有`output/playwright/dev039/manifest.md`證明十模組正常入口、七個Drawer promotion、B1～B13、desktop／1024／1023／390 capability、recovery、layout damage、legacy alias、三relation及已修版面案例；同一manifest新增S6 owner／overlay／container re-QC、targeted／full／build與source policy結果。2026-08-31另新增S7 B16 loopback checkpoint；未commit、merge、deploy或release。

架構優雅度的維持條件固定為：依賴方向只能是`workspace core → shell/controller → typed adapter → existing domain owner`；workspace core不得執行domain mutation或import業務surface；App不得保留可正常到達的雙composition或跨module共享persistent detail；adapter不得保存第二份business state；registry不得render或重算domain capability；只被layout owner使用的region component維持private；所有舊surface都必須在fresh parity與allowlist後才刪除。主契約`AR-01`～`AR-07`保留S5結果，`AR-08`～`AR-11`新增persistent owner、overlay scope、state isolation與container／capability Gate。

### Future Phase Capsule

狀態：`Future Phase Captured / Not Requested`。

- 具名版面模板、最近使用版面、跨裝置／跨使用者分享與權限。
- 同一panel type多實例、各實例獨立context及同類視角並排比較。
- 更多唯讀分析面板、工作量／交接／異常視角及管理辦法關聯。
- 依真實使用需求評估浮動視窗、多螢幕、panel plugin SDK 或即時多人共編。
- AI 可建議開啟哪些面板或標示可能缺口，但不得自行建立永久關係。

Re-entry trigger：全部現有功能完成parity manifest並通過正常入口、Drawer promotion、layout reload、selection／pin、typed drag與回歸證據後，若真實規劃會議證明需要新分析panel、具名模板、跨裝置分享或同類多實例，再補Future契約；不得先建立disabled面板或空泛plugin system。

### S7 B16 loopback checkpoint（2026-08-31，歷史摘要）

- Runtime：task-owned Vite `127.0.0.1:8080`、Playwright CLI `dev039-s7`、Chromium `HeadlessChrome/151.0.0.0`、viewport `1280×720`；以loopback dev identity（`urn:orgmaster:dev`／`local-admin`）執行，非正式登入或production auth。
- Fixture：`draft-ae49e198-ff78-4ace-96af-6cab7cf080e5`（`DEV-039-S7-B16-1788156467803`）由`scripts/dev039-s7-fixture.mjs`建立、讀回並封存；最終revision與link readback見`output/playwright/dev039/manifest.md`。
- 結果：早期 loopback 紀錄曾以 `process-duty-2`／`process-duty-4` 標記 ProcessNode↔Duty native 嘗試；該段只作歷史來源。最新 fresh B16另有Employee→Position與Duty→Position各一筆strict MIME／API／revision單案pass，但ProcessNode↔Duty native本輪因transformed viewport／drawer條件為`not-run`。`process-duty-2`／`process-duty-3` 的 keyboard、同target duplicate noop、Escape cancel、current readonly與draft reload persistence仍有 API／UI readback；E2／E3與E1 aggregate仍開放，逐案證據見`output/playwright/dev039/manifest.md`。
- 後續：依主spec第26.13節固定 `E1 Native delivery → E2 Failure paths → E3 React Flow warning → E4 Candidate freeze`；native、invalid／target卸載／capability loss、visible failure與console warning未全通過前，S7維持`Relation Placement Implemented / QA-QC Reopened`。

### S7 文件升級檢核（2026-08-31，歷史摘要）

- 契約狀態：`RD Implementation Ready` 仍代表 RD 可依 exact file／symbol 開始或續接；`QA-QC Reopened` 代表產品完成條件尚未滿足，兩者不可互相取代。
- 證據分層：CUA 未觸發 `dataTransfer` 不得被寫成 native pass；unit／keyboard／API readback只能支持各自覆蓋的層級。每個新 evidence 必須記錄 route、viewport、browser、loopback identity、fixture、前後 revision、console／visible error及cleanup。
- 架構凍結：後續只允許在既有 `RelationPlacementSession`、registered resolver、target adapter與lifecycle中收斂；禁止新增 DnD dependency、第二 MIME／resolver／business state、generic event bus、schema／API／permission或永久雙軌。
- 關閉條件：依主spec第26.13節完成 E1～E4，並同步主spec、parity manifest、`documentation_map.md`與 evidence manifest；未全通過時只保留 active blocker，不新增另一份 QA 清冊。
- 證據契約：E1～E3 每筆 case 依主spec第26.14節與parity第16.7節記錄同一fixture的before／after revision、dirty／history／autosave、strict MIME、API readback、visible result、console與cleanup；判定固定為`blocked → fail → partial → pass → observed → not-run`，必要欄位未知不得推論通過。新增runner僅能在`scripts/`／測試目錄，禁止第二resolver、mutation owner或`page.evaluate`直寫mutation。

#### S7 Chrome CUA evidence note（2026-08-31，歷史摘要）

- 已在 task-created Chrome tab、B16 draft、`localhost:5000` 觀察 Employee→Position native drop 的 DOM 結果：`B16 空職位` 出現 `B16 無任職員工，主職`，`role=alert=0`。同target 再拖曳維持原結果；Duty→Process invalid target 未增加連結，`Escape` 後回到 idle。
- 此筆 evidence 沒有獨立保存 `dataTransfer.types`、API／revision readback；瀏覽器擴充套件的 message-channel error 另列為工具雜訊，不當成產品 console 判定。E1／E2 仍須依主spec第26.13節補齊，E3 warning 亦未關閉。

### 變更紀錄

- 2026-09-02：依實際 946×698 桌面試用修正 DEV-039 工作台 tab 無法拖曳分割的回歸。根因是 Shell 把 `viewportWidth < 1024` 直接當成 mobile single-surface，導致 fine-pointer 桌面的 tab `draggable=false` 且 pin／arrange 消失；改由 `resolveWorkspaceCompositionCapability` 只以 hover＋fine pointer 判斷 layout composition，split 方向仍由 module minimum 動態限制，domain mutation capability 不變。新增 `LAYOUT-TAB-DRAG-01`／B17、capability 與 native MIME drop-zone 回歸；targeted `2 files／8 tests`、typecheck、946×698 真實滑鼠拖曳由 1 個 stack 形成 2 個 region 通過，證據為 `F039-QC-13-narrow-desktop-tab-drag-split.png`。本次修正尚未 commit、merge、deploy 或 release。
- 2026-09-01：DEV-039新增 E1 paired Duty→ProcessNode reverse native boundary。全新 B16 fixture `draft-fac7242d-f6b5-4e48-80f7-2d1424548be0`命中 source／target geometry並讀到 strict `application/x-orgmaster-entity` 至 `dragover`，但未產生 terminal `drop`、UI結果或domain mutation；API `200`且revision不變。artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-blocked.json`，archive manifest=`3294af10da7136c203ca3cac0f3a049e9d69563421cda22f09584d253e3313d0`。正式判定`E1-DUT-PROC-NATIVE=blocked／not-run`，E1 aggregate、正式 QA-QC與E4不變；除非取得可讀真實 HTML5 `DataTransfer`的新runner，否則停止同類重試，不新增synthetic fallback、第二MIME／resolver／mutation owner或第二份證據清冊。

- 2026-09-01：同步 DEV-039 ProcessNode source handle pan-arbitration 窄修正與索引邊界。`onMouseDownCapture` stopPropagation 已於既有 handle 落地並由 `ProcessPlanningWorkbench` `1 file／5 tests` 覆核；typecheck／build通過，strict runner仍缺可採用 `dragover／drop`，E1／E4不變。此為局部事件仲裁修正，不新增 state、listener、MIME、resolver、Command、API或第二輸入路徑。

- 2026-09-01：依 DEV-039 E2 authority audit 將不可由正常產品入口取得的內部 `historyLength` 從 required evidence 改為 optional diagnostic，新增唯一 `historyEvidence` 行為性 Undo round-trip（合法 mutation → 恰好一次 `Control+Z` → 完整 canonical relation IDs 回 baseline）。同步主spec第2.3／26.14節、Parity第16.6.1節、evidence runner與本摘要；不新增產品 debug API、第二 history store、resolver、mutation owner、schema或輸入路徑。E2 五案需以新 record 重跑後才可提升 aggregate；E1 strict native、E4 freeze與正式 QA-QC仍開放。

- 2026-09-01：補齊 DEV-039 E3 native DevTools listener／warning closure。以隔離 fixture `draft-5ab9ff12-e5f0-4bfc-8141-eddc1fb4e078` 使用既有 `output/playwright/dev039/e2-admission.pw.ts` 合併重跑 `E3-LIFECYCLE` 與 E3-WARNING native CDP case，結果 `2 passed (15.7s)`；與同 fixture 五案 E2 合計 `7 passed`。不注入 `EventTarget` monkey-patch、不持有 DOM target，raw diagnostics=`[]`；Process canvas close後為`0`、reveal／flow／reload為`1`，window／document／viewport portal listener回到`40／8／139` mount baseline。artifact=`F039-S7-E3-warning-cdp-listeners.png`，archive final manifest revision=`2903c3813ccd0cd38de638c10d6646a8c5b4ab02da5b6055b5e96a300179eee6`；5080 task-owned runtime已停止並釋放，5000 user-owned未觸碰。依主spec第26.21.17節，E3-WARNING現為`pass`；E1 native仍`blocked／not-run`、E2 history-length仍`Partial／Open`、E4仍`Blocked`，不改產品架構、資料模型或輸入路徑。

- 2026-09-01：補上 DEV-039 E1 CDP native transport capability probe。以全新 B16 fixture `draft-011e0e3a-d7ca-4b00-9b35-a481d9bf8c5c`、canonical `/`、`1280×720`、Chromium `149.0.0.0`與 task-owned `127.0.0.1:5080`確認 ProcessNode source／Duty target geometry；CDP僅觀察到注入 strict MIME的 `dragenter／dragover`，未建立可採用真實 `dragstart／drop`，API前後revision與既有process link不變。fixture archive response `200`、final manifest revision `8dbcc25d675cbf42bce7862918e8160233cfa5b3d89ded4772df1dba541d8101`，5080 runtime／listen port已cleanup，5000 user-owned runtime保留。依保守判定E1 ProcessNode↔Duty仍`blocked／not-run`、paired direction仍`not-run`、E1 aggregate`Partial／Open`；只新增 evidence provenance與一次性 probe，不新增產品架構、synthetic path、MIME／resolver／mutation owner、schema、API或fallback。

- 2026-09-01：補齊 DEV-039 final stability rerun。隔離 fixture `draft-dbdd513f-a15b-4297-a4f5-819a4f08d80c` 重跑五案 E2 加 `E3-LIFECYCLE`，結果 `6 passed (34.4s)`，archive final manifest revision `e647287fd737dbf35e185ce081a1351b92bced7352ea10e06e370867cbf03e76`；capability-loss re-entry 以 persisted process-link readback 取代短暫 toast 作唯一准入，未改產品契約或資料模型。E2 aggregate仍`Partial／Open`，E3-LIFECYCLE個案`pass`，E3-WARNING／E1 native／E4仍開放。

- 2026-09-01：補齊 DEV-039 最新 E2／E3 fresh rerun 與 evidence serializer correction。以隔離 fixture `draft-17e1204c-7d3f-47c2-bd50-c692823be999` 重跑五案 E2 加 `E3-LIFECYCLE`，結果 `6 passed (32.5s)`，archive final manifest revision `d7f7eb9cf31a58f693801d0d46f27866d03659bc8441483f5004131526cbffd9`；5080 runtime與port已cleanup。runner將 E2 duplicate／409 recovery history欄位正規化為數值 baseline／recovery，避免把API snapshot誤寫入history；產品未新增debug state、history API、resolver、MIME、mutation owner、schema或第二保存路徑。E2 aggregate仍因嚴格 history-length 未直接暴露維持`Partial／Open`，E3-LIFECYCLE個案`pass`、E3-WARNING／E1 native／E4仍開放。

- 2026-09-01：完成 DEV-039 現行文件一致性稽核。修正 dev_task 入口與 S7 索引中仍把 E2 re-entry／409 或 E3 standalone／reveal 寫成待補的舊摘要；現行判定統一為 E2 五案 browser record 已補齊（僅嚴格 history-length 未直接暴露）、E3-LIFECYCLE 個案 `pass`（E3 warning／正式 QA-QC仍 open），E1 ProcessNode↔Duty native `blocked／not-run`、E4 `Blocked`。本次只做文件來源與狀態收斂，不修改產品契約、資料、測試、dependency、runtime、commit、merge、deploy或release。
- 2026-09-01：補記 DEV-039 headful native runner capability probe。建立一次性 `scripts/dev039-headful-native-probe.mjs`，以 Playwright `headless:false`與實際滑鼠路徑排除既有 headless／CDP runner限制；隔離 fixture `draft-cdd24b6d-d8de-404a-ac9a-1ee9a257b899`、task-owned `127.0.0.1:5080`、`1280×720`。第一次因未先選取 ProcessNode而無可見 Duty target，修正 harness後第二次在原生拖曳期間超過75秒無輸出並中止；未取得strict `dragstart→dragover→drop`、`DataTransfer.types`、API mutation或paired direction，亦未使用synthetic／API直寫。fixture cleanup CLI exit=`0`、final `manifestRevision=49bf03ff348e27e5dc66b0d428119e6ef759e9b99eb6e504de5bfff61bad728b`。此筆只作runner provenance，E1 ProcessNode→Duty維持`blocked／not-run`、paired `not-run`、E1 aggregate與E4不變；不新增第二runner、fallback、resolver、mutation owner或證據清冊。完整欄位見主spec第26.21.22節、parity第16.15.18節。
- 2026-09-01：補記最後一次 `ProcessPlanningWorkbench.test.tsx` targeted rerun 超過60秒無輸出後已安全停止；保留既有 `1 file／5 tests passed`成功紀錄，不以未完成重跑覆蓋基線。此筆不改產品判定、E1／E4或既有測試基線。

- 2026-09-01：補齊DEV-039 E3 lifecycle browser probe／combined admission。以隔離 fixture `draft-3983041c-deb2-4e9e-badf-5e1aa5ecbee0` 重跑同一 `output/playwright/dev039/e2-admission.pw.ts`，五個E2 failure-path加`E3-LIFECYCLE`共 `6 passed (31.5s)`；mount／close／reveal／mindmap→flow／reload均觀察到Process canvas active observer不累積（可見時為`1`、close後為`0`）、pending animation frame為`0`，產品diagnostics為空。archive final manifest revision為`28390b5c0322c842d28ddc0b31f7fa0db9074810e37e5a890db38495ce322beb`，5080 runtime與port已cleanup。`E3-LIFECYCLE`個案標`pass`，`E3-WARNING` aggregate仍`Partial／Open`；不新增產品debug state、listener、resolver、MIME、mutation owner、schema、API或第二輸入路徑。
- 2026-09-01：補齊DEV-039 E2 editable re-entry／409 recovery browser admission。以隔離 fixture `draft-1e4eaddc-43cd-487c-836e-8ec35dd1a6a0` 重跑五案，結果 `5 passed (25.9s)`；E2-CAPABILITY-LOSS 完成 mobile readonly後切回桌面重新進入並以 Undo 還原，E2-409-RECOVERY 以 timestamp-only server revision bump 重演 stale PUT `409`、複製未保存內容與明確重新載入，五案同步 assignment／relation／link zero-mutation、dirty／autosave、document keydown listener與fixture cleanup。archive final manifest revision為`9b0ec78e6fbf8135978910517db8724722acd4bd4344786bda6569f862854cbd`，5080 runtime與port已cleanup；E2 aggregate仍因嚴格history-length schema與E1／E3未閉合維持`Partial／Open`，不改產品資料模型、API、resolver、MIME或第二輸入路徑。

- 2026-09-01：補上DEV-039 E2 listener lifecycle／owner cleanup rerun。以隔離 fixture `draft-e85b3c44-0c70-4cb1-baf2-16f2bbdf9fae` 重跑四案，結果 `4 passed (22.6s)`；document capture `keydown` 均由 placing 的`1`回 baseline `0`，並同步 assignment／relation zero-mutation、history／Undo、dirty／autosave、focus與fixture cleanup。`App.tsx`新增owner-driven cleanup effect，必要source／target surface或drawer關閉即沿用`cancelRelationPlacement()`，不新增listener、resolver、MIME、mutation owner、store、schema或第二輸入路徑。archive final manifest revision為`4ab018e15bbcc319f8cbc13139147670eaaaaa5a8375b8bb27ecf6fe6164a5c2`，5080 runtime與port已cleanup；E2仍因重新editable與409/recovery欄位未完整維持`Partial／Open`，E1／E3／E4不變。

- 2026-09-01：補齊DEV-039 E2-INVALID fresh browser evidence。以同一 B16 fixture 執行 Employee→ProcessNode 不相容 pair，取得 visible fail-closed、source focus recovery、API `200`、hydrated→after relation／process-link IDs與revision zero-mutation、產品 diagnostics `[]`；因runner未輸出 dirty／history／autosave欄位，單案標`partial`，E2 aggregate與E4不提升。同步主spec第26.21.1節、parity第16.15節、evidence manifest與documentation_map；另修正 `scripts/dev039-s7-fixture.mjs` 的dev identity headers與Windows CLI entrypoint判斷，fixture與5080 runtime已cleanup，未新增產品契約、resolver、MIME、mutation owner、輸入路徑、schema或資料模型。
- 2026-09-01：補上DEV-039 E2 persistence／history probe rerun。以新隔離 fixture `draft-67c6e1cc-6e2d-4f7e-be9b-bfd32840e41f` 重跑四案，結果 `4 passed (20.0s)`；四案 assignment／relation／link zero-mutation、persistence snapshot均無「未儲存變更」，E2-INVALID另完成有效 Employee→Position配置後單次Undo還原，並在開啟 persistence menu 前捕捉到拒絕後焦點。測試 helper改以`DEV039_E2_VERSION_ID`指定fixture並以既有DocumentMenu trigger click收闔，未改產品契約；完整history／listener／409 recovery欄位仍開放，E2 aggregate維持`Partial／Open`。fixture archive final manifest revision為`434adf105d33a8acc9486ab20507a85af047a6195b9d510075426ad6e05ffd2c`，5080 runtime與port已cleanup。

- 2026-08-31：補齊主spec第26.13.1節對應的自動化 fail-closed coverage。新增 `E2-UNLOAD`、`E2-INVALID`、`E2-CAPABILITY-LOSS` pure／component tests；並新增 `ProcessPlanningCanvas.lifecycle.test.tsx` 的兩 frame 單次 fit、observer disconnect與hidden pending rAF cancellation coverage；最新 targeted pure／fixture `11 files／57 tests`、component／composition `6 files／24 tests`（關聯三檔合併重跑 `3 files／18 tests`）、aggregate `160 files／663 tests`，typecheck、build與diff check通過。瀏覽器 unload／capability-loss與listener inventory record仍開放，產品契約與S7狀態不變。

- 2026-08-31：新增DEV-039 E2 failure-path fresh browser evidence。以同一 B16 fixture 的 task-owned Playwright 補得 `E2-COMMIT-REJECT`、`E2-CAPABILITY-LOSS`、`E2-UNLOAD`；三案 status `200`、hydrated→after relation／link IDs與revision不變、產品 diagnostics為空，並補記 typed source payload 的兩個 animation frame focus recovery。`E2-INVALID`、完整 dirty／history／autosave／listener inventory仍開放，E2 aggregate不提升；證據與索引見主spec第26.21節、parity第16.15節、`output/playwright/dev039/manifest.md`。fixture已recoverably archive，5080 runtime已cleanup。

- 2026-08-31：收斂DEV-039文件現行摘要，將幾何窄修正前的 `656 tests` 明確標為歷史基線，現行數字與判定統一回主spec第26.15～26.18節；不改寫歷史證據、不改產品契約。

- 2026-08-31：補上DEV-039 E1 native runner admission邊界，將真實 `DataTransfer`／可見owner geometry preflight固定回主spec第26.18節；工具無法產生native事件時只記 `blocked／not-run`，不新增第二runner、輸入路徑或產品fallback。

- 2026-08-31：補齊DEV-039主spec第26.13.1節的最小 failure／lifecycle case matrix，將E2 invalid／unload／capability／command rejection與E3 mount／split-reveal／close-reload固定成可派工單案；同步更新現行測試基線為`159 files／657 tests`，不新增產品狀態、resolver、evidence schema或輸入路徑。

- 2026-08-31：完成 Process canvas 幾何／生命週期窄修正並更新最終程式 gate。既有 surface 改用 `min-width／min-height:0`、正常文件流、兩個 animation frame 後單次 `fitView`及observer／rAF cleanup；B16 split／reload／flow量得 owner canvas內 source handles、無 overflow、產品 console `0／0`，artifact為`F039-S7-E3-process-geometry-after-fix.png`。targeted `3 files／17 tests`、full regression `159 files／657 tests`、typecheck、build與diff check通過；E1 native、E2 failure、E3完整lifecycle及E4 freeze仍開放，未commit、merge、deploy或release。

- 2026-08-31：補記短高度 split panel 的 editor saturation 幾何 follow-up；以既有 canvas `min-height:180px; flex:1 1 180px`避免 editor 區塊將 canvas 壓成零高度，並保存 `F039-S7-E3-process-canvas-min-height.png` 與 hit-test 量測。只關閉局部幾何 observation，不提升 E1／E3 aggregate 或改動資料／關聯契約；本輪未新增 dependency、resolver、MIME、mutation owner、commit、merge、deploy或release。

- 2026-08-31：依最新 B16 分割版面量測補上 Process canvas 幾何／生命週期 blocker。記錄 graph panel 約 `360×206px`、canvas 約 `358×390px`、React Flow root 約 `637.5×617px`及 source handle 超出可見範圍；新增主spec第26.17節與Parity第16.10節的最小修正／窄測試索引。維持 `E1-NATIVE`、`E2-FAILURE`、`E3-WARNING` Partial／Open、`E4-FREEZE` Blocked；本輪只修改文件，未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：補齊DEV-039現行證據讀取規則。主spec第26.13～26.18節分別作為派工、record契約、最新逐案結果、Process canvas 幾何窄修正、native runner admission與同步優先序；Parity第16.6～16.11節及evidence manifest只作索引／provenance。明確固定E1／E2／E3為Partial／Open、E4為Blocked，避免單案pass或歷史段落被誤判為aggregate完成；本輪只修改開發文件，未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：補記Chrome CUA fresh observation：Employee→Position native DOM mutation、same-target noop與Duty→Process invalid＋Escape cancel；E1／E2仍未因缺strict MIME、API／revision、target unload／capability-loss與E3 warning而關閉。本輪只同步DEV-039文件與evidence manifest。

- 2026-08-31：完成S7 native runner availability decision。task-owned Playwright未產生可採用native事件，Chrome browser-client亦無可連線tab；依主spec第26.19節將ProcessNode↔Duty維持`not-run`、E1 aggregate維持`Partial／Open`，停止重複同類工具嘗試並保留single resolver／mutation owner邊界。本輪只同步開發文件與證據邊界，未修改產品、資料、dependency、commit、merge、deploy或release。
- 2026-08-31：補充In-app Browser CUA與keyboard capability-loss observation。CUA未產生可採用native事件；keyboard placing切換現行版會離開placing狀態，但缺API／revision／zero-mutation完整record，因此E2與E1 aggregate不變；本輪只同步文件與證據邊界。
- 2026-08-31：補充Chrome extension CUA重試結果。隔離Chrome分頁沿用B16 source／target與canonical入口仍未產生可採用native事件；E1 aggregate不變，本輪只同步文件與證據邊界。
- 2026-08-31：新增E3 lifecycle fresh observation。完成Process standalone／close／reveal／視角切換／Duty往返／reload，保存`F039-S7-E3-lifecycle-iab.png`；幾何與owner局部pass，但listener inventory未取得，E3 aggregate維持`Partial／Open`。

- 2026-08-31：校正DEV-039現行closure索引至主spec第26.13節／parity第16.6節，補記targeted `7 files／34 tests`與aggregate `159 files／656 tests`基線；歷史節保留，native／failure／warning仍未關閉。

- 2026-08-31：將DEV-039 S7剩餘收斂整理為主spec第26.13節的`E1-NATIVE → E2-FAILURE → E3-WARNING → E4-FREEZE` RD execution packet，固定owner、允許修改範圍、命令、artifact欄位、cleanup與stop conditions；本輪只同步開發文件，不改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：以單一 fork worker 重跑 DEV-039 全量回歸，`159 test files／656 tests`通過；前次5個平行worker timeout未重現。同步主spec、parity與evidence manifest，保留S7 native／failure／warning開放狀態；本輪未修改產品程式或測試設定。

- 2026-08-31：依最新fresh CUA結果完成DEV-039 S7文件收斂。修正早期B16 native紀錄與目前可關閉證據的分層，明確標示CUA未觸發`dataTransfer`為`Not proven`；新增主spec第26.12節的`E1 Native delivery → E2 Failure paths → E3 React Flow warning → E4 Candidate freeze`收斂順序，並同步 parity、documentation_map與evidence manifest。後續只沿用既有`RelationPlacementSession`／resolver／target adapter；本輪未修改產品程式、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：完成DEV-039 S7 fresh QA／QC補跑與文件同步。以task-owned `127.0.0.1:8080`及B16 fixture `draft-84ff0ba0-4ff7-48f4-889a-d66693d4c46b`重驗正常功能入口、ProcessNode↔Duty keyboard、duplicate/no-op、Escape focus、readonly、draft reload及1440／1024／390 viewport；links `process-duty-2`／`process-duty-3`由API讀回一致，fixture已封存、8080已釋放，5000（PID 23840）未停止。以in-app browser CUA實際執行ProcessNode→Duty、Employee→Position、Duty→ProcessNode native drag均未觀察到HTML5 `dataTransfer` drop／mutation，且fresh session保留一次React Flow parent-size console warning；invalid／target卸載與完整native evidence仍未收斂。狀態維持`Relation Placement Implemented / QA-QC Reopened`，不進candidate freeze、commit、merge、deploy或release。

- 2026-08-31：完成S7-PROC-01窄接線與B16 ProcessNode↔Duty雙向native驗證。`ProcessDutyBridge`新增strict MIME Duty targets與App preview／commit props；B16以`process-duty-2`及`process-duty-4`建立canonical link，duplicate為noop，並補1024×768 editable與390×844 readonly spot-check。targeted `2 files／9 tests`、full regression `159 files／656 tests`、typecheck、build、source scan與diff check通過；fresh QA-QC、完整viewport matrix與正式auth仍待收斂，狀態更新為`Relation Placement Implemented / QA-QC Reopened`，未commit、merge、deploy或release。

- 2026-08-31：依B16 loopback結果繼續升級DEV-039開發文件。新增S7 Remaining implementation package，將ProcessNode→Duty native唯一缺口定位為`ProcessDutyBridge`的Duty target wrapper與`ProcessPlanningWorkbench` preview／commit窄Props接線；固定S7-PROC-01～S7-CLOSE-04的派工順序、驗收、fresh evidence、cleanup與停止條件。沿用既有`RelationPlacementSession`、resolver與`LINK_PROCESS_NODE_DUTY`，不新增架構。狀態維持`Relation Placement Partial Evidence / QA-QC Reopened`，本輪只修改文件，未修改產品程式、資料、dependency、commit、merge、deploy或release。
- 2026-08-31：完成S7 Playwright runner admission fresh attempt。以task-owned `127.0.0.1:5080`、Chromium `149.0.7827.55`、`1280x720`、canonical `功能→流程規劃→在工作台開啟`及B16 fixture執行；ProcessNode source與Duty target皆在可見owner panel，但`locator.drag_to`與pointer path未產生可觀察`dragstart／dragover／drop`或strict `dataTransferTypes`。API `200` readback確認fixture只保留既有Process link、沒有domain mutation；fixture已recoverably archive，5080 runtime已停止且port已釋放。依主spec第26.15.1節判定`E1-PROC-DUT-NATIVE=blocked`、paired `E1-DUT-PROC-NATIVE=not-run`，E1 aggregate仍`Partial／Open`；本輪只補evidence與停止條件，未修改產品契約、dependency、schema、resolver、mutation owner、commit、merge、deploy或release。

- 2026-08-31：依使用者要求繼續升級DEV-039 S7開發文件，完成Implementation Readiness Review。固定`App`唯一Relation Placement owner、`relationPlacement.ts` pure reducer、latest-state resolver、single commit dispatcher、來源模組capability、exact file／symbol與runtime migration；建立S7-0～S7-5、舊Employee／Duty state／MIME／handler／CSS deletion allowlist、failure recovery、targeted／aggregate命令及task-owned B16 fixture／cleanup／evidence。P0／P1 readiness缺口為0，狀態升為`S7 RD Implementation Ready / RD Not Started / QA-QC Reopened`；本輪只修改開發文件，未修改產品程式、測試、資料、dependency、commit、merge、deploy或release。

- 2026-08-31：完成S7 B16 loopback smoke。以task-owned `127.0.0.1:8080`、Playwright `dev039-s7`、Chromium `HeadlessChrome/151.0.0.0`、`1280×720`及loopback dev identity經正常入口建立fixture；Employee native新增任職、Employee keyboard兼任、Duty＋lane native主執行、same-target noop、Escape cancel、current readonly與draft reload通過API／UI readback，ProcessNode↔Duty native未閉合。fixture version `draft-01b4ed05-2b86-48b9-85c3-669a7f258476`已recoverably archive；證據與兩張native截圖見`output/playwright/dev039/manifest.md`。狀態維持`Relation Placement Partial Evidence / QA-QC Reopened`，未commit、merge、deploy或release。

- 2026-08-31：依開始實作的結果同步DEV-039狀態為`Relation Placement Partial Evidence / QA-QC Reopened`。已新增`relationPlacement.ts` pure reducer與effect／capability測試，App已建立唯一session owner與single commit boundary，Employee／Duty／Process source handle及registered target完成接線；舊平行state與legacy MIME／未使用檔案已移除，Process composition harness、source-policy regression及B16 pure fixture CLI／test已加入；relation／component／fixture targeted `6 files／28 tests`、full regression `159 files／655 tests`、typecheck、build與source scan通過。B16 loopback native／keyboard partial evidence已建立並封存fixture；ProcessNode↔Duty native、fresh QA／QC、正式auth與全viewport matrix仍待完成，未宣稱S7／DEV-039完成，未commit、merge、deploy或release。
- 2026-08-31：繼續補齊S7 Current Phase RD Contract。新增canonical UI Entry、來源把手與明確解除區、`idle／placing／committing`轉換、single commit、Employee取代／Duty主執行移轉結果語意、Data／API／Permission／Dependency不變、failure recovery、representative fixture及evidence layer；沒有待人類產品決策，狀態升級為`S0～S6 Historical Complete / S7 RD Contract Ready / RD Not Started / QA-QC Reopened`。Exact repo／symbol migration、test命令與B16 executable fixture仍待Implementation Readiness；本輪只修改開發文件。
- 2026-08-31：依使用者試用回饋與第一性架構審查建立DEV-039 S7 Relation Placement Session Brief。將真正能力從「跨面板拖曳」改定義為「typed關係配置」，固定native與keyboard共用Placement生命週期、`resolveRegisteredDrop`單一preview／commit規則、既有assignment helper／OrganizationCommand mutation authority及候選版本前刪除舊重複drag state。`F039-REL-01`因只有keyboard baseline而重新開啟；S0～S6其他證據保留。狀態改為`S0～S6 Historical Complete / S7 Brief Ready / Implementation Not Requested / QA-QC Reopened`。本輪只修改開發文件，未修改產品程式、測試、dependency、資料、API、commit、deploy或release。

- 2026-08-30：依使用者要求完成S6 Implementation Readiness Review。主spec固定exact exports／Props、App owner factories、Duty三view、overlay allowlist、host-local定位、named container、S6-0～S6-5、failure recovery及targeted／aggregate／B14～B15 Gate；ADR及parity manifest同步。P0／P1 readiness缺口為0，DEV-039改為`可執行 / S6 RD Implementation Ready / RD Not Started / QA-QC Reopened`。本輪只修改開發文件，未修改產品程式或執行測試、commit、deploy、release。

- 2026-08-30：依RD主管「穩定且不累積技術債」要求，把同類缺口盤查轉成DEV-039 S6 Panel Boundary Hardening開發契約。ADR-009新增Panel Surface Ownership amendment；主spec新增persistent／panel transient／global transient三層、selection state authority、container／capability分離、exact file impact、migration、failure recovery、source policy、B14～B15與AR-08～AR-11；parity manifest新增四項S6 ID並登錄Duty fixed detail、master-data dual mount及Management Method／Duty overlay gaps。DEV-039由完成改為`S6 RD Contract Ready / RD Not Started / QA-QC Reopened`。本輪只修改開發文件，未修改產品程式、測試、dependency、資料、API、commit、deploy或release。

- 2026-08-30：修正工作職掌明細錯誤跟隨組織圖panel的所有權缺口。原本`DutyDetailDrawer`固定掛載於`organizationSurface`，因此工作職掌移到左下region後，明細仍出現在左上；改由`DutyModuleAdapter`在configuration mode內統一擁有清單與明細，並以相鄰兩欄正常文件流呈現。新增`LAYOUT-OWNERSHIP-01`與`B13`；targeted `1 file／3 tests`、full `149 files／617 tests`、build及1900×960三panel browser geometry通過，證據為`F039-QC-12-duty-detail-panel-ownership.png`。未commit、merge、deploy或release。

- 2026-08-30：修正DEV-039 split separator只有resize游標、實際無法連續調整的缺口。原因是recursive render產生的新container ref在第一次pointer move觸發layout rerender後取代舊ref；原listener遂失去父容器幾何。改由separator直接透過React Pointer Events與pointer capture讀取目前父split，up／cancel釋放capture，並新增rerender regression及hover／active回饋。新增`LAYOUT-RESIZE-01`與`B12`；targeted `1 file／5 tests`、full `149 files／615 tests`、build、1280×800 browser drag及console 0 error／0 warning通過，ratio由50%連續調至59%，證據為`F039-QC-11-split-resize.png`。未commit、merge、deploy或release。

- 2026-08-30：修正兼任風險無法成為獨立工作台的版面缺口。原因是舊版`.role-risk-panel { position:absolute; right:0; width:min(420px,...) }`在樣式載入順序上覆蓋workspace adapter；新增較高範圍選擇器`.composable-workspace .role-risk-panel--workspace`，使直接型panel回到正常文件流並填滿自身region，外層split／tab仍可控制並排。新增`LAYOUT-DIRECT-01`與`B11`；977×698 standalone route計算為`regions=1`、`x=0`、`width=977`、`position:relative`、無水平溢出，證據為`F039-QC-10-role-risk-standalone-page.png`。未commit、merge、deploy或release。

- 2026-08-30：依試用回饋將DEV-039工作台結構分隔線改為共用藍色token。`workspace.css`新增`--workspace-divider-color`／`--workspace-divider-strong-color`，套用至chrome、Drawer、清單／明細、region tab、管理辦法panel action列及split separator；卡片、表格與表單內部分隔維持中性。新增`LAYOUT-SEP-01`，1440×900／390×844 visual、computed-style與overflow QC通過，證據為`F039-QC-07-blue-structural-dividers.png`及`F039-QC-08-blue-dividers-narrow.png`。未commit、merge、deploy或release。

- 2026-08-30：依試用回饋修正DEV-039共用主資料panel。`MasterDataModuleAdapter`清單欄由比例欄改為Directory固定寬度（桌面／窄桌面`242px`、`690px`以下`190px`），明細Inspector回到adapter正常文件流並與清單緊鄰，避免中間空白與窄版絕對定位覆蓋；員工、職位、部門共用`data-layout="adjacent-list-detail"`相鄰契約，層級使用`list-only`維持單欄。新增`LAYOUT-ADJ-01`及component order regression；targeted `4 files／12 tests`、full `149 files／614 tests`、`npm run build`、1440×900／1024×768及390×844 browser geometry／visual QC通過，證據已回填`output/playwright/dev039/manifest.md`。未commit、merge、deploy或release。

- 2026-08-30：完成DEV-039 S6 Panel Boundary Hardening。以`WorkspaceOverlayProvider`、`PanelOverlayHost`、`GlobalOverlayHost`及`WorkspacePortal`建立typed overlay邊界；各module persistent surface改由owner panel／owner factory掛載，Duty三view、Management Method transient、drag preview與Role Risk standalone均完成分層；移除feature viewport-fixed selectors、App共享master-data detail與raw portal。新增source policy、owner／DOM count／host missing／surface primitive regression；S6 targeted `8 files／21 tests`、full `154 files／631 tests`、`npm run build`與`git diff --check`通過，browser re-QC確認Duty／Management Method／Role Risk owner與overflow。狀態升級為`S0～S6 Implementation Complete / QA-QC Passed / Local Release Gate Pending / No Release Requested`；未commit、merge、deploy或release。

- 2026-08-28：完成DEV-039 final QA-QC。依既定QA計畫重新執行desktop／1023／390 fail-seeking QC，發現並修正窄版仍顯示pin／drag-grip、手機頂欄裁切`功能`入口兩項缺口；新增component regression後重跑targeted `84 files／366 tests`、full `149 files／614 tests`與build，全部通過。狀態升級為`RD Implementation Complete / QA-QC Passed / Local Release Gate Pending / No Release Requested`；未commit、merge、deploy或release。

- 2026-08-28：完成DEV-039 Current Phase RD實作與S5 replacement。建立`output/playwright/dev039/manifest.md`，補齊十模組正常入口、七個Drawer promotion、三typed relation、B1～B8、responsive/mobile、current readonly、reduced motion、recovery、damaged layout及legacy alias證據；修復Role Risk窄版mutation顯示與窄版focus回桌面active tab不一致。retired source scan 0 matches，full regression `149 files／612 tests`與build通過。狀態改為`RD Implementation Complete / Local RD Gates Passed / Independent QA-QC Pending`；未commit、merge、deploy或release。

- 2026-08-28：依最新RD實作與browser walkthrough修改DEV-039開發文件。狀態更新為`S1 Core Gates Browser-Proven / S2～S4 Partial Parity Evidence / F039 Consolidation Pending / S5 Not Started`；`recoveryOpen=false`舊假狀態已移除，並記錄十模組入口、initial organization-only network、hidden lifecycle、三region layout、pin、零panel、canonical history、layout／route修復、桌面／手機唯讀、editable draft、管理辦法dirty/focus與部分typed keyboard結果。剩餘工作固定為`F039`、完整relation／failure矩陣、full regression及S5 allowlist／legacy removal；未授權merge、deploy或release。

- 2026-08-28：依RD主管架構審查修改DEV-039開發文件。把實作狀態由`S1 Integration In Progress`校正為`S1～S4 Product Wiring Present / Parity Closure Pending / S5 Not Started`；補上單向依賴、單一render／mutation／canonical composition、bounded extensibility、surface lifecycle與safe replacement七項closure。最新targeted `20 files／45 tests`通過；full regression、B1～B8、F039、legacy removal、QA／QC、deploy與release仍未完成。

- 2026-08-28：依RD主管實作期審查，把DEV-039由`RD Not Started`校正為`RD Implementation In Progress（S0 Complete / S1 Integration In Progress）`。記錄workspace targeted `13 files／28 tests`與build通過，並區分S0完成、S1 primitives完成／App整合未完、S2～S5待執行；補上P0／P1 closure及架構優雅度守則。未宣稱browser、QA／QC、removal、deploy或release完成。

- 2026-08-28：依RD主管審視修改DEV-039工程契約與摘要。十module改由keyed context map統一exact ID與route/session/promotion型別；registry只保留metadata/context，typed adapter composition成為唯一render owner，capability仍由既有module resolver擁有。Panel close補成request／guard／commit並涵蓋Back；重型surface補上lazy first mount、hidden suspension與close cleanup。同步更新parity state、FMEA、acceptance及S0／S1／S4驗證。本輪只改開發文件，未改產品程式、測試、dependency、資料、deploy或release。

- 2026-08-28：完成Implementation Readiness Review，DEV-039升級為`RD Implementation Ready / RD Not Started`。選定React 19＋CSS Grid／Flex有限自製split-tree／tab engine且不新增dependency；固定S0～S5實際檔案／symbol、pure reducer與effect boundary、App bootstrap／recovery／409 wiring、module adapters、provider isolation及exact targeted／full／build／browser command。P0／P1文件阻塞為0；本輪只修改開發文件，未改產品程式、測試、dependency、資料、deploy或release。

- 2026-08-28：建立`ai-doc/specs/DEV-039-composable-planning-workspace.md`與ADR-009，將DEV-039升級為`RD Contract Ready / RD Not Started`。固定canonical `/`、十模組registry、242px左側推移Drawer、split-tree＋tab stack、minimum placement、URL／local／session三權威、promotion／pin、typed drag、global capability、DEV-020相容recovery、legacy alias、S0～S5及Medium-riskQA/QC。沒有待人類產品決策；dock engine、repo/file/symbol與exact tests留待Implementation Readiness Review。本輪未修改產品程式、測試、dependency、資料、deploy或release。

- 2026-08-28：完成`ai-doc/specs/DEV-039-feature-parity-manifest.md`第一版baseline inventory與target mapping。清冊涵蓋全部現有module、全域chrome、keyboard、state、authority與typed relation，並把current document recovery列為P1 Restore；版本比較、standalone治理模擬器、管理辦法舊prototype及被取代composition列為intentional exclusions。DEV-039仍維持`Brief Ready / Implementation Not Requested`，所有`F039` fresh evidence、Contract決策、removal allowlist、產品實作與QA/QC均未完成。

- 2026-08-28：使用者明確覆寫前一輪最小Slice決策，要求Current Phase一起啟用所有現有功能，包含兼任風險，避免改版遺失任何能力。新增零功能遺失parity manifest與deletion gate，將流程、職掌、管理辦法、角色治理、兼任風險及現有typed drag恢復Current Phase；版本／文件／儲存／搜尋／唯讀狀態列為全域chrome。預設仍只開組織圖。文件維持`Brief Ready`，未修改產品程式。

- 2026-08-28：使用者固定DEV-039第一個最小可開發切片只啟用成熟的組織架構圖、員工、職位、部門、層級。Current Phase改為驗證共用workspace shell、四種Drawer promotion、五種單一panel、shared selection／pin與browser-local layout；流程、職掌、管理辦法、Process心智圖／流程圖及typed relation drag移入Future Phase。Slice 1不得刪DEV-038舊UI，文件維持`Brief Ready`，未修改產品程式。

- 2026-08-28：寫入`#引導模式` Round 4 Human Decision Brief。使用者確認`13A` Drawer內選取／最小摘要並攜帶脈絡、`14A` 第一版單一模組panel、`15A` promotion保留既有layout；固定`在工作台開啟`背後自動加入或聚焦、pin優先及module surface registry。員工／職位／流程／職掌／管理辦法Drawer＋panel與組織圖單層panel記為目標surface architecture，第一個可開發slice啟用集合待下一輪最小scope決策。文件維持`Brief Ready`，未修改產品程式。

- 2026-08-28：寫入 `#引導模式` Round 3 Human Decision Brief。使用者確認 `7B` 面板入口移至頂部單一Popover、`8A` pin隔離panel context但仍可操作、`9B` 所有panel可關閉並允許零panel工作台；另提出「每個功能最多兩層：Drawer＋完整工作台」作為待Round 4收斂的Human Proposed原則。文件維持`Brief Ready`，未修改產品程式或新增spec／ADR。

- 2026-08-28：寫入 `#引導模式` Round 2 Human Decision Brief。使用者確認 `4B自訂` 預設配置只顯示組織架構圖、`5C` 未釘選面板跟隨shared selection且個別面板可pin、`6A` 第一版每種panel type只允許一份；空白桌面、模板Modal、預開心智圖／職掌及同類多實例均不進Current Phase。文件維持`Brief Ready`，未修改產品程式或新增spec／ADR。

- 2026-08-28：寫入 `#引導模式` Round 1 Human Decision Brief。使用者確認 `1A` 受控Dock／Split且不重疊、`2A` drop預覽後立即執行既有Command並提供結果提示＋Undo、`3A` layout只在目前瀏覽器保存並於reload恢復；拒絕完整浮動Windows、逐次確認dialog、批次暫存與第一版跨裝置／帳號同步。文件維持`Brief Ready`，未修改產品程式或新增spec／ADR。

- 2026-08-28：依使用者確認建立 DEV-039 `Brief Ready` 與 branch `codex/dev-039-composable-workspace`。固定可組合規劃桌面、受控 dock、第一版 panel catalog、兩條 typed drag 關係、OrganizationDocument V7／既有 Command 單一權威、分支內先新後刪及合併前無 runtime 雙模式；本輪未修改產品程式、測試、資料、dependency、deploy 或 release。

## DEV-038：流程－職掌－責任聯動規劃工作台

狀態：完成（Process／V7 domain baseline保留；固定UI composition已由DEV-039／042替換，QA／QC併入現行交付證據）
文件成熟度：`Domain Baseline Complete / UI Composition Superseded / Merged to master`
節點類型：交付點
優先級：P1
來源 ID：`USER-2026-08-27-PROCESS-DUTY-RESPONSIBILITY-WORKBENCH`、`USER-2026-08-27-MINDMAP-FLOWCHART-OSS-DESIGN`
父任務：DEV-034、DEV-036
計入交付：是
風險等級：High（OrganizationDocument V6→V7、兩個圖形投影、跨畫布 selection／drag、Duty referential delete guard 與既有 relation transaction 共用）
權威契約：`ai-doc/specs/DEV-038-process-duty-responsibility-planning-workbench.md`
架構決策：`ai-doc/adr/ADR-008-process-planning-organization-version-authority.md`
執行邊界：OrganizationDocument V7、domain、command／transaction、V6→V7 migration、Dagre／React Flow 投影、能力、失敗恢復與非版面 evidence contract 繼續有效。固定左／中／右工作台 composition、route wiring 與其專屬 UI acceptance 自 2026-08-28 起由 DEV-039 intentional replacement；DEV-039 未達 removal gate 前不得先刪舊 UI，也不得將 DEV-038 固定 composition進入 release。

### DEV-039 Intentional Replacement Notice

- 使用者已確認以可組合規劃桌面取代本 DEV 的固定工作台編排，權威 Brief 為 `ai-doc/dev_task.md#dev-039可組合規劃桌面與跨面板關聯配置`。
- 本 DEV 仍是 Process／ProcessNode／ProcessEdge／ProcessNodeDutyLink、OrganizationDocument V7、ADR-008、既有 relation transaction、Undo／Redo、autosave、CAS、validation 與可重用圖形投影的工程基線。
- 本 DEV 第 4 節固定頁面骨架、第 14.5 節固定 component composition 及只驗證該 composition 的 UI gate，均視為 historical replacement baseline，不再限制 DEV-039 的 panel workspace contract。
- 舊 UI 保留到 DEV-039 新工作台通過 deletion gate；之後在同一 replacement branch 內移除，正式 runtime 不保留雙模式。DEV-038 的 Git 歷史與非版面證據繼續可追溯。

### 真正問題與使用者價值

DEV-034 已能在知道 Duty 與責任種類後，把工作由左向右拖到 Position；DEV-036 已能從 Duty／Position 兩個視角盤點既有責任。但總經理與主管在規劃公司時，還缺少「先從成果拆工作、再建立最佳流程、最後才配置責任」的共同工作表面。

若先照現有人員撰寫職掌，制度容易因人設事；若把心智圖、流程圖、組織圖與所有關聯線同時堆疊，又會造成不可閱讀的蜘蛛網。DEV-038 的價值是讓三種圖共用同一組領域身分，以選取式聯動保持全貌，同時讓每個視角只回答一種問題。

### Human-confirmed 方向

核心規劃順序固定為：

```text
心智圖拆解 ProcessNode
  → 流程圖安排 next-step
    → ProcessNode 連結穩定 Duty
      → 選主執行／協作／審核／會簽
        → 拖到組織圖 Position
```

核心資料鏈固定為：

```text
ProcessNode ↔ Duty ↔ DutyPositionRelation ↔ Position ↔ EmployeeAssignment
```

- ProcessNode 是流程情境中的工作發生點；Duty 是可重用、穩定的工作責任主檔。
- Position 承擔 Duty；Employee 只透過任職關係進入 Position，不直接成為永久 Duty authority。
- 心智圖與流程圖共用 ProcessNode identity，但 parent-child 與 next-step 是兩種獨立 edge，不互相推導。
- Current Phase 的 Duty→Position relation 是全域事實，不做 process-scoped responsibility override。
- 人類判斷流程、職掌與適任職位；AI 自動設計／配置不是 Current Phase。
- 桌面可規劃；手機遵守專案最高原則，只讀且零 mutation。

使用思考習慣：#系統描繪、#權責劃分、#可驗證性

### 工作台系統描繪

```text
完整 URL 聯動工作台
├─ 左側：心智圖／流程圖切換
│  ├─ 心智圖只顯示 parent-child
│  └─ 流程圖只顯示 next-step
├─ 中央：所選 ProcessNode 的 Duty 橋接欄
│  ├─ 連結既有 Duty／按需建立新 Duty
│  └─ 選擇主執行／協作／審核／會簽
└─ 右側：組織責任 React Flow 投影（沿用既有 organization state）
   └─ Position 作為 Duty＋exact lane drop target；窄桌面由橋接欄 selector fallback
```

- 中央欄只在已選 ProcessNode 時展開，建議約 `300～340px`；未選時收合，不能永久遮擋兩側畫布。
- 心智圖／流程圖一次只顯示一種 edge 語意；組織圖只顯示既有 reporting line。
- ProcessNode→Duty 與 Duty→Position 以中央欄、交叉高亮及短暫引導呈現，不常駐畫滿跨畫布 edge。
- 選 ProcessNode、Duty 或 Position 會高亮相鄰物件；其餘降噪但不消失，點空白恢復全貌。
- 兩側畫布各自維持 viewport；`>=1280px` 顯示四欄，`1024～1279px` 收合組織投影並以橋接欄 selector 完成配置，`<1024px` 與手機唯讀。空間不足時切換焦點，不把三區縮成不可讀縮圖。

### Current Phase：Minimum Viable Slice

- 正常 UI 入口、正式 URL 與單一 Process editing context。
- Process 清單；同一 ProcessNode 的結構化左到右心智圖與簡單 directed flow 投影。
- 心智圖支援 parent-child、新增、改名、刪除、排序與折疊；流程圖只支援 next-step edge 新增／刪除。
- ProcessNode 與既有 Duty 的多對多 stable link；找不到時可呼叫既有 Duty 建立流程，成功後回填原節點。
- 中央橋接欄顯示所選節點 Duty 與四種 exact lane。
- 選定 Duty＋lane 後，沿用 DEV-034 relation command 拖到 Position，不建立第二套 relation store／command。
- ProcessNode、Duty、Position 三向選取與交叉高亮。
- 最小資料完整性視角：未連 Duty、無執行職位、缺主執行、待重新分配；不新增配置健康分數。
- 桌面一人操作、多人討論；手機唯讀。

### 既有 DEV 相容邊界

| 既有交付 | DEV-038 處理方式 |
| --- | --- |
| DEV-034 | 繼續是 Duty→Position relation mutation、Undo／Redo、autosave、CAS、primary transfer、pending recovery 與 explicit remove 權威 |
| DEV-036 | 繼續是唯讀責任盤點／分布結果層；DEV-038 異動應由同一 organization state 反映，不把 DEV-036 改成第二套 editor |
| DEV-032 | 管理辦法維持自由多媒體文件與人類語意編輯；Current Phase 不恢復正文智能引用 |
| DEV-033 | 手機只讀最高原則完全適用 |

Spec Impact：`Compatible extension + New authority / ADR-008`。ProcessDefinition／ProcessNode／ProcessEdge／ProcessNodeDutyLink 進入 OrganizationDocument V7；既有 Duty、DutyPositionRelation、Position、EmployeeAssignment 不複製、不改名、不轉移 ownership。DEV-034 R2 待 browser gate 與 DEV-036 已完成證據均不因本 Contract 改變。

### Architecture Memory Capsule

Current Phase 權威模型：

```text
Process
  └─ ProcessNode
       ├─ parent-child: parentNodeId + sortOrder
       ├─ next-step: ProcessEdge(fromNodeId, toNodeId)
       └─ Duty link: ProcessNodeDutyLink(processNodeId, dutyId)

Duty
  └─ DutyPositionRelation(dutyId, positionId, role, isPrimaryExecutor, ...)
```

不變量：

1. ProcessNode 不複製 Duty title、Position 或責任人，只保存 stable link。
2. ProcessNodeDutyLink 不保存責任 lane；Current Phase lane 屬於全域 DutyPositionRelation。
3. 只有 leaf ProcessNode 可刪；同一 history commit 移除自身 edge／link，不連帶刪除 Duty、relation、Position 或 Employee。
4. `x/y`、viewport、zoom、selection 與 collapsed 是投影／UI state，不是領域關係權威。
5. Duty 被 ProcessNodeDutyLink 引用時，Duty delete fail closed 並回傳引用位置；invalid persisted reference 不能 render crash、靜默造資料或保存假成功。
6. 兩個 React Flow canvas 使用獨立 `ReactFlowProvider`；共用 domain／selection owner 位於兩畫布之上。
7. 跨畫布 drag 使用 stable `dutyId`＋exact lane，release 以 latest state 重驗；invalid／noop／rejected 不產生 revision、Undo entry 或假成功。

持久化決策：OrganizationDocument 由 V6 升為 V7，新增 `processes`、`processNodes`、`processEdges`、`processNodeDutyLinks` 四個集合；與 Duty／Position 共用 organization version、revision、Undo／Redo、dirty、500ms autosave、Ctrl+S、下載及 CAS。V6 記憶體 migration 只補空集合，第一次合法保存才寫 V7；不新增 ProcessPlanningDocument、Process API、第二 autosave 或跨文件 journal。

route 契約：canonical route 為 `/process-planning`；URL 固定保存 `view`、`process`、可選 `node` 與可選 linked `duty`，lane／Position／drag／viewport 不進 URL。正常入口為組織圖的工作執掌清單→DEV-036 責任工作台→`流程規劃`，頁首只保留一個 `返回責任工作台`。

開源方向：沿用專案既有 `@xyflow/react` 繪製心智圖、流程圖與組織圖；Current Phase layout dependency 固定為 exact `@dagrejs/dagre 3.1.1`（MIT、內建型別），並設 gzip delta／graph benchmark gate，未通過則 clean fallback 至 repo 內 deterministic layout。ELK.js、bpmn-js、Mind Elixir 均不進第一階段；Dagre 已納入 `package.json`／`package-lock.json` 並由 typecheck、build 與 layout tests 驗證。

### Out of Scope

- AI 自動拆流程、連 Duty、推薦／指定 Position。
- BPMN gateway／event／timer／condition、流程執行引擎、表單流轉或自動化。
- process-scoped responsibility override、工作量／產能／績效／健康分數／排名。
- 即時多人共編、留言、投票、版本合併或白板。
- 永久顯示所有跨畫布 edge、第二份職位清單或第二套 Duty editor。
- 手機 mutation、管理辦法正文智能引用、正式流程核准／發布／訓練／稽核生命週期。
- deploy、release、production migration。

### 驗收方向

1. 正常 UI 可發現工作台；direct URL 不算可發現性證據。
2. 心智圖與流程圖共用 ProcessNode identity；改名同步，parent-child 與 next-step 不互相改寫。
3. ProcessNode 可連結既有 Duty，取消／錯誤不留半成品；同一 Duty 可被多節點重用而不複製主檔。
4. 只有 Duty＋exact lane ready 時才可配置 Position，所有 mutation 遵守 DEV-034。
5. ProcessNode／Duty／Position 三向選取及高亮一致，未相關物件仍保留全貌。
6. Position node 不塞長 Duty 文字，三種 edge 不形成永久蜘蛛網。
7. 刪 ProcessNode 不刪共用 Duty／relation／Position／Employee。
8. 手機只讀且零 mutation；桌面、窄桌面與手機無遮擋、白屏、假成功或非預期 overflow。
9. invalid reference、保存衝突、取消、reload、back／forward 均有可恢復狀態。

### RD Implementation Handoff

- Readiness 結果：`Ready`；P0／P1 blocker 為 0，S4／S5 MVP 已實作，S6 QA／QC 尚未簽核。
- S0 readiness baseline 已通過；目前 MVP 已落地：typecheck、DEV-038 targeted `7 files／13 tests`、full `129 test files／566 tests`、build 均通過；client JS `370.97 kB gzip`。既有 Vite native-config extension 與大 chunk warning 已記錄，不是 DEV-038 failure；browser smoke runtime依 AGENTS 規則完成後需停止並確認 port 5000 釋放。
- Repo 已固定為 V7 domain／migration、Process modules、`App.tsx` integration、DutyCenter入口、OrgNode高亮、scoped CSS及 whole-document server validation；`src/main.tsx`、DEV-034 resolver／drag semantics、DEV-036 tables、governance、管理辦法及 workspace manifest禁止修改。
- Exact domain 已固定四型別、十二個 organization commands、完整 validation codes、expanded command issue shape、Duty process-link delete guard、normalization與 failure recovery。
- Exact composition 固定為 App 共用 owner、新 `ProcessPlanningWorkbench` 內的 Process canvas／Duty bridge／`ProcessOrganizationCanvas` 各自使用獨立 provider；既有 organization `.canvas-wrap` 仍是非工作台 route 的投影，不複製 organization state 或第二份 Position truth。
- V6→V7 固定只加四個空集合；local／recovery V7-first、V6 source保留、server V7-first fallback、workspace 422／409、governance explicit snapshot不含 Process。
- Dagre 固定 exact `3.1.1`（MIT、built-in types），gzip JS delta `<=100 KiB`、250 nodes／400 edges p95 `<=150ms`；gate失敗 clean fallback至 repo內 deterministic layout，不升 ELK。
- 實作順序固定 S0 baseline → S1 domain/V7 → S2 layout gate → S3 route/read-only composition → S4 Process editing（已完成）→ S5 Duty bridge/organization linkage（已完成）→ S6 full QA/QC（進行中）。
- 可執行 automated、API、native HTML5 drag、keyboard alternative、1440／1280／1279／1024／1023／390 viewport、visible-error、data-sanity、evidence manifest與 task-owned runtime cleanup均已寫入 spec 第14節。

### 下一步與恢復條件

RD 現可直接依 spec 第 14 節 S0→S6 實作。若需要 allowlist 外 production file、修改 ADR-008、複製 Duty／Position、第二套 Process／relation store、process-scoped responsibility、BPMN、AI 自動配置或即時多人共編，停止並重新確認 scope。

### Future Phase Capsule

狀態：`Future Phase Captured / Not Requested`。真實試用後才考慮流程泳道、節點輸入輸出／風險、RACI 延伸、流程版本比較、process-scoped responsibility、AI 輔助找遺漏／斷線、ELK 大型排版、BPMN、多人共編及管理辦法穩定語意 reference；不得先建立 disabled 功能或空泛 plugin system。

### 變更紀錄

- 2026-08-28：修正流程清單為 0 筆時的入口可發現性。可編輯版本在空狀態直接顯示 `＋ 新增流程`；唯讀版本改顯示切換可編輯草稿提示，不顯示 disabled 建立控制。新增 editable／read-only 空狀態 component harness 驗收；DEV-038 仍維持 `RD Implementation Ready / MVP Implementation In Progress / QA-QC Pending`，未 deploy／release。

- 2026-08-27：依本輪 RD 實作與瀏覽器驗證更新 DEV-038。S4／S5 已完成 MVP：Process／node 編輯與 edge 控制、`ProcessOrganizationCanvas` 組織投影、三向 stable-ID 高亮、native HTML5 drag、keyboard Enter／Escape、V7 draft autosave／reload；typecheck、targeted `7 files／13 tests`、full `129 files／566 tests`、build（`370.97 kB gzip`）與六 viewport screenshot 已保存。S6 仍待 API negative／invalid V7／409／provider isolation／reduced-motion／data-sanity 等正式 QC 證據與 release gate，未 deploy／release。

- 2026-08-27：依使用者要求把 DEV-038 補至 `RD Implementation Ready`，並記錄 MVP implementation in progress。已完成 V7 domain／migration、Dagre layout、`/process-planning` route、雙視角、Process／node 基本建立、Duty link、四 lane click／native drag、Position drop projection 與 workspace 422 reason；typecheck、targeted `12 files／40 tests`、full `128 files／565 tests`、build pass（`368.67 kB gzip`）。完整 Process 編輯控制項、既有組織 React Flow 同頁重用、keyboard placement、三向高亮、component harness 與六 viewport evidence 仍是 QA gate；未 deploy／release。
- 2026-08-27：升級 DEV-038 為 `RD Contract Ready`；以 ADR-008 固定 OrganizationDocument V7 單一權威與 V6→V7 migration，補齊 command／transaction、route／URL、正常入口、selection owner、viewport、capability、failure recovery、referential delete guard 與 High-risk evidence contract。仍缺 repo/file、exact symbols、implementation slices、dependency lockfile與 executable tests，因此尚非 `RD Implementation Ready`；未修改產品程式、測試、資料或 dependency。
- 2026-08-27：建立 DEV-038 `Brief Ready`，記錄流程優先的規劃順序、三種圖形投影、ProcessNode↔Duty↔DutyPositionRelation↔Position 資料鏈、中央橋接欄、由左向右配置、React Flow＋Dagre 優先、DEV-034／036 相容邊界、Minimum Viable Slice、驗收及 Future Phase。未修改產品程式、測試、資料、dependency、deploy 或 release。

## DEV-037：外部角色目錄與角色指派權責重整

狀態：完成（`RD Implementation Complete / QA-QC Passed / Local Release Gate Pending / OrgMaster Only`）
文件成熟度：`RD Implementation Complete`
節點類型：開發點
父交付點：DEV-027
是否計入產品交付完成：是（OrgMaster Current Phase；外部 live integration 另計）
來源 ID：`USER-2026-08-27-EXTERNAL-ROLE-CATALOG-ASSIGNMENT-BOUNDARY`
風險等級：High（權限 ownership、跨系統契約、歷史 policy migration 與使用者可見治理能力）
權威契約：`ai-doc/specs/DEV-037-external-role-catalog-assignment-governance.md`
架構決策：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md`、`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`
QA／QC：`ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md`

### Human Decision Brief

- `Human Confirmed / 2026-08-27`：每個外部系統自行定義 Application Role、Permission、Role-Permission mapping 與領域審核政策；OrgMaster 不維護外部 Permission 細節。
- `Human Confirmed`：OrgMaster 負責員工／principal 到外部 Application Role 的 assignment，以及 scope、有效期間、撤銷／重新啟用、角色代理、角色指派審核與治理 audit。
- `Human Confirmed`：目前仍只修改 OrgMaster；AI-PDM 不修改，未串接前不得宣稱角色已在 AI-PDM 生效。
- `Subsequent Intentional Replacement / 2026-08-30`：`4A / 5A / 6B` 的 live access view、既有使用者 migration 與角色直接生效由 DEV-040 承接；本 DEV 的 local-only、publish-as-approval 與 high-risk evidence 只保留歷史語意。
- `Intentional Replacement`：取代 DEV-027／ADR-004 的外部 Application Role／Permission／Approval Policy 可編輯 authority；共用 IAM `2A`、AI-PDM approval transaction／domain apply authority 與 ADR-005 snapshot 原則保留。
- `Historical Evidence Preserved`：DEV-027／035 local V1 程式、published versions、audit 與 QA/QC 不重寫、不刪除，也不能作為本 DEV 已實作的證據。

使用思考習慣：#權責劃分、#系統描繪、#可驗證性

### 問題與使用者價值

不同應用的 permission code、敏感操作、角色組成與領域審核規則不同。若 OrgMaster 同時設計每個系統的 Permission Matrix，外部系統改版會造成 catalog 漂移、雙重權威與錯誤擴權；但若每個系統自行維護人員指派，離職、調職、代理與跨系統稽核又會重複且分散。

本 DEV 的價值是把兩種責任拆開：外部系統回答「角色代表什麼、能做什麼」，OrgMaster 回答「哪個人於何範圍、何期間取得哪個角色，以及誰核准這次指派」。

### 主要流程

1. 外部系統提供具 application、catalog version、stable role ID／code、名稱、狀態、可指派性與必要風險提示的角色目錄。
2. OrgMaster 以唯讀方式顯示角色目錄；不能新增、刪除或修改外部角色與 Permission mapping。
3. 管理者選員工與外部角色，設定 scope、有效期間及必要代理，送出角色指派治理變更。
4. 高風險角色依 OrgMaster 指派治理規則核准後發布；audit 保存來源 catalog version、assignment 與核准事實。
5. 未完成 live integration 前，UI 明確顯示「只保存在 OrgMaster／尚未於目標系統生效」。AI-PDM 是否採 push、pull 或 token claim 消費 assignment，留待 integration ADR。

### Current Phase scope

- 把外部 Application Role 定義成具來源版本的唯讀 catalog reference。
- 把 role assignment、scope、有效期間、撤銷／重新啟用、角色代理與指派審核定義為 OrgMaster 可寫治理資料。
- OrgMaster 自有 `orgmaster` role／permission 仍由 OrgMaster 定義及 enforcement。
- 保留既有 local V1 schema、commands、published snapshots 與 audit 作 migration input；Implementation Ready 已固定 V2 優先讀取、V1 唯讀保留、原子寫入、previous recovery 與 unresolved fail-closed migration。
- 將 DEV-035 原「外部角色／Permission Matrix／Approval Policy 完整 CRUD」future capsule標為 superseded。

### Out of scope

- 修改 `C:\VIBE CODING\AI_PDM`、建立 live catalog API、讓 assignment 在 AI-PDM 實際生效或切換正式權威。
- 在 OrgMaster 新增／編輯／刪除 AI-PDM 角色、Permission、Role-Permission mapping 或領域 Approval Policy。
- 直接刪除既有 local V1 role／permission／grant／approval policy 欄位、commands、published version 或 audit。
- production IAM／DB／credential、遠端 migration、deploy、release 或 production smoke。

### 驗收方向

- 文件與 UI 明確區分外部角色目錄權威和 OrgMaster 角色指派權威。
- 外部角色目錄在 OrgMaster 唯讀，沒有外部 role／permission mutation 或 Permission Matrix 入口。
- assignment 引用 stable role ID 與 catalog version；unknown、inactive、unassignable、missing 或 stale catalog 一律 fail closed 並提供恢復方式。
- OrgMaster 可追溯哪位員工在何種 scope／期間取得哪個角色、誰核准／撤銷，以及使用哪個 catalog version。
- 未串接 AI-PDM 時，任何成功訊息都不得暗示外部權限已實際生效。
- 既有 DEV-027／035 published snapshot 與 audit 保持可讀；舊 evidence 只作 regression／migration baseline。

### 依賴、停止條件與下一步

- 依賴：ADR-007、DEV-027 historical local V1 contract、ADR-005、既有 governance store／API／UI 與 QA evidence。
- `RD Implementation Complete / QA-QC Passed` 已完成 bundled read-only catalog、V2 schema／command／route signatures、非破壞 migration／recovery、角色指派／代理／發布行為、UI field matrix、file allowlist、S1～S4 executable QA/QC 與 Git boundary；完整 fresh evidence 見 `output/playwright/dev037/manifest.md`。
- 下一步若要讓 AI-PDM 實際消費 assignment、同步 enforcement 或接正式 IAM／DB，必須另開跨 repo integration ADR／DEV 與 release gate；不得把本 DEV 的 local-only 結果宣稱為外部系統已生效。
- 若需求改為 OrgMaster 可編輯 AI-PDM Permission、Role-Permission mapping 或領域 Approval Policy，停止並回到 Human Decision／ADR，不得當成 RD 細節擴權。
- 若要驗證 AI-PDM 實際生效，停止 OrgMaster-only lane，取得修改 AI-PDM 授權並建立 integration ADR。

### Future Phase Capsule

Phase 3 live integration 的目的，是讓 AI-PDM 提供權威角色目錄並消費 OrgMaster 已發布 assignment。執行前需確認跨 repo 修改授權、service authentication、catalog delivery、assignment consumption、stale／revocation、compatibility window 與 rollback；驗收必須從正常角色指派入口一路證明 AI-PDM server enforcement，不以 OrgMaster UI 成功或 API fixture 取代。

### 變更紀錄

- 2026-08-27：建立 `Brief Ready`；新增 ADR-007，修訂 ADR-004／005、DEV-027／035、QA evidence boundary、dev_task 與 documentation map。本輪未修改產品程式或 AI-PDM。
- 2026-08-27：依使用者要求升級為 `RD Contract Ready`；建立權威 spec，固定唯讀 catalog、assignment／role delegation、publish-as-approval、local-only effect、legacy V1 compatibility、UI／API boundary、QA/QC evidence 與 stop conditions。未修改產品程式或 AI-PDM。
- 2026-08-27：完成 RD Readiness Review，升級為 `RD Implementation Ready / RD Not Started`；固定 V2 schema、9-role bundled catalog 與 source hash、V1 非破壞 migration／recovery、command／route／error signatures、UI field matrix、file allowlist、S1～S4 gate 與獨立 High-risk QA／QC 計畫。未修改產品程式或 AI-PDM。

## DEV-036：雙視角責任規劃完整工作台

狀態：完成／待本機 release gate
文件成熟度：`RD Implementation Complete / QA-QC Passed / Human Confirmed Minimum Viable Dual-Perspective Scope / Local Release Gate Pending`
節點類型：交付點
優先級：P1
來源 ID：`USER-2026-08-26-DUTY-DUAL-PERSPECTIVE-WORKBENCH`
父任務：DEV-029、DEV-031、DEV-034
計入交付：是
風險等級：Medium（新增正式 URL 導航、雙視角頁籤及跨職掌／跨職位投影；不改 Duty domain、relation schema、API、權限或保存權威）
執行邊界：工程權威契約為 `ai-doc/specs/DEV-036-duty-dual-perspective-workbench.md`。第一輪只做最小唯讀工作台，不做第二套 mutation、department／lane 進階篩選、distribution cell 展開或工作量推論；實作與 QA／QC 已完成，尚未授權 deploy／release。

### 真正問題與使用者價值

DEV-034 已把單一職掌的責任配置整合進組織圖左側主資料清單，適合「選一項職掌、選一種責任、拖到職位」的快速配置；但 CEO／人資主管進行整體組織設計時，還需要跨多項職掌與多個職位判斷：哪些責任尚未完整、責任集中在哪裡、某個職位承擔哪些類型的責任。

若把這些全局判斷全部塞進 242px 左側清單或組織圖節點，會遮蔽組織圖並造成資訊密度過高；若只保留既有單筆 Drawer，又必須逐筆開關，無法比較。DEV-036 因此新增一層完整 URL 工作台，但不取代快速清單、單筆明細或組織圖配置。

成功結果是：規劃者從既有工作執掌清單進入完整工作台後，可以在同一穩定頁面切換「責任盤點」與「責任分布」，用不同主要物件完成兩種互補判斷；返回組織圖時仍能以 DEV-034 完成精確配置。

### Human-confirmed 產品決策

1. 第一版即提供兩個正式視角頁籤：`責任盤點`、`責任分布`；不等第二個視角完成後才建立頁籤骨架。
2. 未來視角只有完成產品契約、實作與驗證後才加入；第一版不顯示 disabled、鎖定或「敬請期待」頁籤。
3. 完整工作台是第三層工作表面：左側快速清單負責快速選取與配置，Duty Drawer 負責單筆閱讀／編修，完整工作台負責跨職掌與跨職位規劃。
4. 責任是否適合某職位仍由人類判斷；第一版不提供 AI 推薦、自動配置、工作量推論或制度適配結論。
5. 兩個視角共用同一份 organization version、Duty、DutyPositionRelation、Undo／Redo、autosave 與 CAS 權威；不得建立第二套工作台資料或保存路徑。
6. 手機遵守專案最高原則，只提供兩視角唯讀閱讀與導覽；不呈現或觸發新增、拖曳、移轉、刪除或其他 relation mutation。

### Current Phase 工程決策

第一輪不在完整工作台建立第二套 relation editor。關係 mutation 只由 DEV-034 組織圖配置承擔；完整工作台只盤點、比較、閱讀及導向配置。這是 Current Phase 已固定的 action ownership，不是待 RD 猜測的 AI assumption；未來若要改，須另做 interaction／transaction impact review。

### 三層資訊架構邊界

| 層級 | 主要任務 | 主要物件 | 寫入邊界 |
| --- | --- | --- | --- |
| 左側工作執掌清單＋組織圖 | 選一項職掌，選責任，拖到 Position | 單一 Duty＋組織圖 Position | 沿用 DEV-034 assign-only relation command |
| Duty Drawer／Inspector | 閱讀或編修單一職掌及其關係 | 單一 Duty | 沿用既有 Duty／relation commands 與 capability gate |
| `/duty-planning` 完整工作台 | 跨 Duty／Position 盤點、比較、篩選與鑽取 | Duty 集合或 Position 集合 | 第一版不建立第二套批次或直接配置流程；導回 DEV-034 |

左側清單的 R2.1 狀態篩選只縮小當下快速來源，屬 session UI state；完整工作台的視角與篩選屬可重載、可返回、可分享的 URL state。兩者可以使用相同 anomaly 原子狀態，但不得共享隱性 state owner 或彼此改變目前選取。

### 完整工作台共同骨架

```text
工作執掌規劃
├─ [責任盤點] [責任分布]
├─ 當前視角專用篩選工具列
├─ 當前視角主要內容
└─ 按需 Duty Drawer／導向組織圖配置
```

- 頁首只保留返回組織圖、頁面名稱、既有版本／唯讀狀態及必要文件動作；不常駐顯示教學、視角說明卡或未實作功能。
- 頁籤位於頁面標題之下、視角工具列之上；一次只有一個 active view，active 狀態不能只靠顏色。
- 視角切換是 URL 導航，不是只存在 component memory 的顯示開關；需支援重新整理、瀏覽器返回／前進與分享同一視角。
- 每個視角只保留自身任務需要的篩選器；不得把兩個視角全部篩選器放成一列。
- 點擊 Duty 名稱沿用既有 Duty Drawer；需要修改責任時，提供單一「到組織圖配置」路徑並帶回 Duty context，不在工作台另造平行配置器。

### 視角一：責任盤點

核心問題：哪些職掌的責任配置不完整或需要重新確認？

| 契約項目 | 第一版方向 |
| --- | --- |
| 主要物件 | Duty；每列一項工作執掌 |
| 主要判斷 | 該 Duty 是否已有主執行、協作、審核、會簽，以及是否命中既有 anomaly |
| 最小欄位 | 工作執掌、主執行、協作、審核、會簽、規劃狀態 |
| 狀態篩選 | 複選 `no-executor`、`missing-primary-executor`、`pending-reassignment`；空集合代表全部，同群組 OR，與搜尋 AND，不新增「待處理」第二套聚合選項 |
| 鑽取 | 點 Duty 名稱開啟既有 Drawer；從列或 Drawer 進入組織圖配置時保留 Duty context |
| 空白狀態 | 清楚區分「目前沒有 Duty」與「篩選後沒有結果」；不得把零結果顯示成全部正常 |

`配置完整`在第一版不是新的永久狀態或 anomaly。系統只呈現可由既有 relation 與 anomaly 可靠推導的事實；不得因有主執行就宣告管理責任完整，也不得自行要求每項 Duty 必須具備協作、審核或會簽。

### 視角二：責任分布

核心問題：目前責任分散或集中在哪些職位與部門？

| 契約項目 | 第一版方向 |
| --- | --- |
| 主要物件 | Position；每列一個 active 職位 |
| 主要判斷 | 該 Position 在主執行、協作、審核、會簽四類責任中承擔哪些 Duty |
| 最小呈現 | Position × 主執行、協作、審核、會簽四欄；cell 只呈現不可點擊的整數 count，0 也顯示 |
| 最小篩選 | 一個文字搜尋，同時比對 Position 與 department 名稱 |
| 延後 | department 下拉、lane 篩選、cell 展開、Duty 清單與分布頁 Drawer |
| 空白狀態 | 保留 active Position 的零責任事實；只有文字搜尋可隱藏不符合的 Position |

責任數量只代表目前 relation 分布，不是工作量、產能、績效或人力需求。第一版不得以紅黃綠、超載 Badge、健康分數或排名暗示負荷判斷；未來若要判斷負荷，必須先取得頻率、工時、難度或風險等可解釋資料並另建契約。

### Route 與 URL state 方向

第一版固定使用一個 canonical page 與兩個穩定 view 值：

- `/duty-planning`：預設等同責任盤點。
- `/duty-planning?view=audit`：責任盤點。
- `/duty-planning?view=distribution`：責任分布。
- 未知或移除的 `view` 值：安全正規化為 `audit`，不得白屏或保留無效 active tab。
- `/duty-planning/anomalies`：相容導向 `?view=audit`。
- `/duty-planning/matrix`：相容導向 `?view=distribution`。

active view 與當前視角篩選條件寫入 URL；重新整理及 browser back／forward 必須恢復。第一輪不記住非 active 視角的上次 filters；切換視角只保留共同 `q`，由 audit 切到 distribution 時清除 `status`。

固定 query 只有 `view`、`q`、`status`，順序亦固定為此；distribution 忽略 `status`。parser、serialization、legacy alias 與 history replace／push 規則見 DEV-036 權威工程契約。

### 正常 UI 入口與返回方向

- Target actor：總經理、人資主管、制度規劃者；一般閱讀者與手機使用者只能讀取。
- 正常起點：組織架構頁開啟左側 `工作執掌` 清單。
- 工作台入口：清單 header 提供與其他 header controls 同尺寸的明確「開啟責任規劃工作台」控制；不得只靠 direct URL、隱藏手勢或點擊靜態標題。
- Destination：進入 canonical `/duty-planning`，預設 active tab 為 `責任盤點`。
- 返回：頁首「返回組織圖」回到既有組織架構頁；從 Duty 導向配置時，應恢復左側工作執掌清單並選定該 Duty，但不得自動 armed 某個責任 lane 或直接執行 mutation。
- 窄桌面與手機：頁籤及兩個視角仍可被閱讀；手機隱藏所有 mutation controls，版面不得水平溢出或靠 hover 才能取得必要資訊。

### Current Scope

- 建立完整工作台正常入口、canonical route 與兩個第一版頁籤。
- 建立責任盤點的 Duty-centric 投影、既有 anomaly 複選篩選、搜尋、Drawer 鑽取及導向組織圖配置。
- 建立責任分布的 Position-centric 四責任欄 count，以及 Position／department 共用文字搜尋；不展開 cell。
- active view 與當前視角篩選 URL 化，支援 reload、browser history 與分享。
- 沿用現行 organization state、Duty／relation identity、commands、Undo／Redo、autosave、CAS、capability gate 與手機唯讀最高原則。
- 依 `ai-doc/specs/DEV-036-duty-dual-perspective-workbench.md` 的 state owner、required files、S0～S5與 verification contract 實作。

### Out of Scope

- 第三個以上視角、停用頁籤、future 功能預告或自訂儀表板。
- AI 推薦職位、自動配置、相似職掌合併、制度適配或異常原因生成。
- 工作量、產能、績效、超載、關鍵人風險或人力需求結論。
- 新 anomaly、`配置完整`永久狀態、每項 Duty 強制四類責任齊備或新的職責分離規則。
- 批次移動、批次刪除、跨責任類型轉換、第二套 relation editor 或第二套保存工作流。
- Duty／relation schema、API、permission、organization command、version authority、management-method 智能引用、deploy 或 release。
- department 下拉、lane filter、distribution cell 展開、Duty 清單／Drawer及每個視角的篩選偏好記憶。

### 驗收方向

1. 從正常組織架構頁的工作執掌清單可發現並進入工作台；只證明 direct URL 可開啟不算通過。
2. 第一版始終只顯示兩個已實作頁籤；兩者 active 狀態、鍵盤焦點與 URL 一致，無 disabled future tab。
3. `/duty-planning` 預設責任盤點；切換責任分布、reload、browser back／forward 後仍回到正確視角及可序列化篩選。
4. 責任盤點以 Duty 為列，三個 anomaly 原子條件遵守空集合＝全部、同群組 OR、搜尋 AND，不出現第二個「待處理」選項。
5. 責任分布以 active Position 為列，正確區分主執行、協作、審核、會簽；0 保留，count 不可點擊，文字搜尋可比對 Position／department。
6. 從責任盤點點擊 Duty 名稱開啟同一 read-only Duty Drawer；返回後保留原視角與篩選，不重設成另一頁籤。
7. 進入組織圖配置只建立導航與選取 context，不自動選 lane、不自動配置，也不產生 relation mutation。
8. 唯讀或手機情境可使用頁籤、篩選與鑽取，但不存在可觸發 mutation 的控制；桌面、窄桌面與手機均無遮擋、重疊、截斷或非預期水平溢出。
9. 正常、載入、無 Duty、無 Position、篩選零結果、未知 view、無效 query 與保存衝突後重載均有可恢復可見狀態；不得出現成功／失敗並存或 visible 4xx／5xx。

### 驗證完整性方向

| Acceptance / risk | Normal delivery path | Fixture boundary | Forbidden shortcut | Fail condition | Required evidence |
| --- | --- | --- | --- | --- | --- |
| 工作台入口可發現 | 組織架構→工作執掌清單→工作台入口 | 可使用含既有 Duty 的 organization version | 只貼 `/duty-planning` direct URL | 正常清單沒有入口或入口無反應 | 起始畫面、入口與 destination 截圖／操作紀錄 |
| 雙頁籤與 URL 恢復 | 正常入口→切換頁籤→套用篩選→reload／back | 可 seed 多種 relation／anomaly 前置資料 | 只測 parser、component state 或單一路由 mount | active tab、URL、結果任一不同步 | 同一 revision 的 route、操作步驟與切換前後截圖 |
| 責任盤點正確 | 責任盤點→複選狀態→搜尋→開 Duty | 可 seed 已知 anomaly 組合 | 只檢查 `deriveDutyAnomalies` unit output | OR／AND、去重、空集合或零結果錯誤 | 畫面列、篩選狀態與資料合理性對照 |
| 責任分布正確 | 責任分布→文字搜尋→檢查四類 count | 可 seed 已知 Position relation 分布 | 只查 state、API 或 DB counts | cell count、責任類型或零責任 Position錯誤 | 畫面、fixture 對照與至少一個零責任 Position |
| 不產生隱性 mutation | 任一視角瀏覽、篩選、鑽取、返回 | 使用可編輯草稿並記錄初始 revision | 只證明唯讀版本不能寫 | 純瀏覽改變 dirty、revision 或 relation | 前後 state／dirty 證據與 UI 操作紀錄 |
| 手機唯讀 | 手機正常入口→兩頁籤→篩選→Drawer | 可使用相同唯讀 fixture | 只用 CSS source 或桌面縮窗推定 | mutation control 可見／可觸發或版面溢出 | 390×844 實際 viewport 截圖、互動與 visible-error sweep |

### 主要風險與停止條件

- 若兩視角無法使用同一 organization state 投影，或 RD 提議建立第二套 Duty／relation 保存，停止並回 PM。
- 若責任分布必須新增工作量、風險或「完整性」商業判定才能成立，停止並由使用者確認產品語意。
- 若完成工作台需要讓 DEV-034 左側清單失去快速配置能力，或同時存在兩套可編輯 relation workflow，停止做 interaction impact review。
- 若現行 route／component 已被其他尚未收斂的 dirty change 改寫，先保護使用者修改並重新盤點；不得依本 Brief 猜測檔案邊界。
- 找不到正常 UI 入口、只能 direct URL 開啟、頁籤與 URL 不同步、手機仍可 mutation、責任數量被標成工作量，均為後續 QC hard fail。

### Future Phase Capsule

狀態：`Future Phase Captured / Not Requested`。

第一輪試用後，優先依真實阻礙評估 responsibility distribution 的 department／lane filter、cell 展開與 Duty 鑽取，再逐一考慮關鍵依賴、制度對照、變更影響或職責分離。重新進入條件是使用者完成最小版試用並指出下一個具體阻礙；不得只為預留架構建立空頁、disabled tab 或通用 plugin system。

### Spec Impact 與治理結論

- `Intentional replacement`：使用者本輪明確改變 DEV-031「不採獨立工作台頁籤／矩陣視角」的 future 方向；DEV-036 實作完成後，`/duty-planning` 將恢復為正式雙視角完整工作台，而非三個 route 同一 composition。
- `Compatible contract`：DEV-034 繼續是組織圖快速配置權威；DEV-036 不取代其左側清單、拖曳、assign-only resolver、Inspector 或 R2 browser gate。
- `Compatible contract`：DEV-028／029／031 的 Duty identity、relation identity、anomaly 推導、organization state、commands、Undo／Redo、autosave 與 CAS 可沿用；歷史完成證據不因 future Brief 失效。
- ADR：不需要。Current Phase 不改資料權威、schema、API、permission 或 transaction boundary。
- Readiness：`RD Implementation Complete / QA-QC Passed`。正常入口、route serialization、component ownership、projection、failure recovery、repo file boundary、targeted／full tests、build、browser evidence provenance 均已完成；本輪只保留 local release gate，未執行 deploy／release。

### 變更紀錄

- 2026-08-26：依使用者「先做最少功能、之後再修」將第一輪收斂為 Minimum Viable Slice，並升級至 `RD Implementation Ready`。保留兩個正式視角；Audit 只做搜尋、三 anomaly 複選、列表與 read-only Drawer，Distribution 只做 Position／department 文字搜尋與四欄 count。工程契約：`ai-doc/specs/DEV-036-duty-dual-perspective-workbench.md`；本輪未修改產品程式或測試。
- 2026-08-26：依使用者確認建立 DEV-036 `Brief Ready`。第一版固定兩個正式視角「責任盤點／責任分布」，建立三層資訊架構、共同頁面骨架、視角任務邊界、URL／入口方向、Current Scope、Out of Scope、驗收方向與 future re-entry；本輪未修改產品程式或測試。

## DEV-034：組織圖內嵌工作事項責任配置模式

狀態：完成（R2 domain語意保留；固定UI／專用DnD已由DEV-039／041／042取代並驗證；R2.1移至DEV-042 Future Phase Capsule）
文件成熟度：`Completed / Historical UI Contract / Domain Baseline Retained`
節點類型：交付點
優先級：P1
來源 ID：`USER-2026-08-25-DEV034-ORG-CHART-INLINE-DUTY-CONFIGURATION`、`USER-2026-08-25-DEV034-UPGRADE-RD-CONTRACT`、`USER-2026-08-25-DEV034-UPGRADE-IMPLEMENTATION-READY`、`USER-2026-08-25-DEV034-DIRECTORY-DUTY-DRAG-REVISION`、`USER-2026-08-26-DEV034-DUTY-PLANNING-STATUS-FILTER`
父任務：DEV-031、DEV-032、DEV-033
計入交付：是
風險等級：Medium（改變責任配置主要資訊架構與跨 route 上下文，並寫入既有 DutyPositionRelation；不新增管理辦法智能引用、AI 職掌判斷或正式權限模型）
執行邊界：R2 產品程式與 automated gates 已完成；本輪只新增 R2.1 Brief，不修改產品程式、測試、資料、正式 migration、deploy 或 release。後端沿用既有 V6 parser／workspace save validation 與 organization command pipeline，在保存／套用邊界將舊 `collaborate` canonicalize 為 `execute + isPrimaryExecutor=false`，不新增 schema、API route 或第二套保存路徑。R1 S0～S5 與 B1～B9 保留為歷史完成證據，不代表 R2 browser gate 已通過；R2.1 文件完成也不代表篩選功能已實作。
權威契約：`ai-doc/specs/DEV-034-org-chart-inline-duty-configuration.md`

### R2 Active RD Implementation Contract：左側主資料職掌清單與由左向右拖曳配置

#### 真正問題與使用者價值

R1 雖已將工作事項選擇器推到左側，但仍以獨立 duty-config 模式、特殊 picker、底部任務列與「選好責任後點 Position」完成配置。實際操作顯示這套模式與員工／職位／部門／層級清單不同，下一步不易從既有肌肉記憶推得，且點擊 Position 同時可能代表閱讀、選取或 mutation。

R2 把職掌視為第五種主資料，而不是特殊模式。規劃者沿用既有左側欄的固定入口、清單、搜尋、選取、收合與明細規則；唯一新增語意是在選取職掌後設定責任，將該職掌由左向右拖到組織圖 Position。成功結果是使用者不需記憶另一套入口或隱性點擊模式，也能持續看著組織關係作人類判斷。

#### Human-confirmed Product Direction

- 在既有左側主資料 rail 新增第五個「職掌」入口，置於現有四個入口之後，不移動員工、職位、部門及層級的既有位置。
- 「職掌清單」沿用 DirectoryDock 的同一 panel shell、現行約 `242px` 展開寬度、標題／數量、搜尋、單一列選取、收合、鍵盤焦點與按需 Inspector；職掌名稱是明細入口，名稱旁以獨立 chevron 按鈕控制責任展開，不得再建立 `280～320px` 特殊 picker或文字型「明細」按鈕。
- 移除頁首「工作執掌規劃」主要入口、底部 DutyConfigurationDock、選定後最小任務列及點擊 Position 直接增刪 relation 的隱性 mutation。
- 選取一項職掌後，只在該選取列就地展開四種精確責任：主執行、協作、審核、會簽；主執行與協作同屬「執行」群組，切換職掌時責任選擇歸零，避免沿用上一項職掌的責任。
- 選定精確責任後，選取列才顯示可辨識且可存取的拖曳把手／drag source；拖曳 ghost 必須同時顯示職掌名稱與精確責任。
- 使用者由左向右將職掌拖到組織圖 Position；普通點擊 Position 恢復為既有選取／閱讀，不產生 relation mutation。
- 職掌名稱點擊只開啟既有明細 Inspector／Drawer；同列獨立 chevron 才是責任設定的展開／收起入口。明細與展開不得互相觸發；既有 Inspector／明確 relation action contract不因列操作改變。
- 組織圖 Position 仍是唯一配置目標，不新增第二份職位清單、責任配置專用職位搜尋、部門篩選或另一張組織圖。
- 手機維持唯讀：可從左側清單閱讀職掌與責任，但不顯示精確責任選擇、拖曳把手或任何 mutation 控制。

#### UX Intent

- 任務／結果：制度規劃者從固定左側主資料入口選職掌、設定責任並拖到正確 Position，配置後仍保留相同職掌與責任以支援連續配置。
- 主物件／主焦點：組織圖及 Position drop targets；左側職掌清單是來源，不成為第二個主要工作面。
- 預設刪除：特殊配置模式說明、頁首重複入口、獨立 picker、底部 Dock、常駐步驟文字、成功彈窗、逐列待處理 badge、空白說明及點擊 Position mutation。
- 保留舉證：固定「職掌」rail 入口與一致 panel 骨架建立肌肉記憶；選取職掌、二次點擊收起、精確責任與 drag ghost 必須保留，否則使用者可能把錯誤職掌或責任放到 Position。
- 非語言修復：使用一致的選取背景、責任按鈕 pressed state、drag handle、有效／無效 drop 輪廓、ghost、放置後 Position 就地變化與 Undo；不以常駐教學補救結構。
- 風險與驗證：拖曳失敗不得寫入或假成功；相同 relation drop 必須 no-op；主執行移轉必須原子化；鍵盤替代、非顏色狀態、edge auto-pan、854×698／1440×900 與手機唯讀都須在實作後以正常入口驗證。

#### 主要流程

```text
既有組織架構頁
  → 點左側 rail 的「職掌」
  → 使用與其他主資料相同的搜尋／清單選定職掌
  → 選取列就地展開並選擇一種精確責任
  → 從選取列拖曳「職掌＋責任」到組織圖 Position
  → 有效 drop 才提交既有 OrganizationCommand
  → Position 就地顯示結果，沿用 Undo／autosave／version CAS
  → 保留目前職掌與責任供連續配置；切換清單或收合時結束 ready state
```

#### R2 Current Scope

- 把 Duty 納入既有 DirectoryDock／DirectoryKind 的第一級主資料資訊架構，沿用現有清單 shell 與互動骨架。
- 在職掌選取列提供四種精確責任與桌面 drag source，並讓組織圖 Position 成為 drop target。
- Drop 到尚未配置的 Position 時新增 relation；相同 exact relation 已存在時 no-op；主執行 drop 到新 Position 時沿用既有 atomic transfer；協作、審核與會簽可連續配置多個 Position，協作在 backend 保存為 non-primary execute。舊 V6 `collaborate` 載入時 canonicalize 並去重，之後不再產生新 legacy relation。
- Pending reassignment 繼續保留相同 relation ID 的恢復語意，但其 R2 入口與拖放細節留待升級 RD Contract 時固定。
- 重用既有 organization V6、Duty／DutyPositionRelation、validator、history、Undo／Redo、500ms autosave、Ctrl+S、revision CAS、workspace mode 與 permission boundary；不新增 schema 或第二套保存路徑。
- 保留 `?mode=duty-config` 與 `/duty-planning*` 的相容需求，但 canonical 入口必須是正常組織圖左側「職掌」，不能以 direct URL 作可發現性證據。

#### R2 Out of Scope

- AI 自動推薦、判定或配置適合職位。
- 管理辦法正文智能引用、Stage／Step 或從正文直接建立職掌關係。
- 新職責重疊演算法；仍只沿用既有兼任風險與 Duty validator。
- 手機、觸控窄版或不符合 mutation capability 的拖曳配置。
- 以重複 drop、普通 click、double-click 或不明確 toggle 移除 relation。
- 新 schema version、API route、server provider、permission model、正式資料 migration、deploy 或 release；本次只新增現有 V6 parser／workspace save 的 canonicalization，不改 version number。

#### R2 Acceptance Direction

- 從一般組織圖可直接發現左側「職掌」入口；頁首不再有重複主要入口。
- 展開職掌時使用與其他主資料相同的 rail 位置、panel 寬度、標題、搜尋、選取、收合與焦點骨架；點擊名稱開明細，點擊右側 chevron 才展開／收起責任設定，且不遮住組織圖。
- 使用者不需閱讀常駐教學即可完成「選職掌 → 選責任 → 拖到 Position」；選責任前不可啟動有效 relation drop。
- Drag ghost、有效／無效 target 與完成結果都能辨識目前職掌及精確責任；狀態不只靠顏色。
- 普通點擊 Position 不修改 DutyPositionRelation；相同 relation drop no-op，錯誤 drop 不產生 dirty state或假成功。
- 成功 drop 沿用既有 command、Undo／Redo、autosave、CAS 與 validation；主執行移轉保持原子性。
- 鍵盤使用者可透過同一職掌與責任上下文選定 Position 並執行等價配置，不以拖曳作唯一可達路徑。
- 1440×900 與 854×698 桌面 viewport 無遮擋、雙重捲動或主要 drop target 被固定表面覆蓋；手機只讀且零 mutation 控制。
- QC 必須從一般組織圖入口進入並實際拖放；R1 direct URL、舊 screenshot、unit test或API／state直寫不得替代 R2 delivery-path evidence。

#### R2 RD Implementation Handoff

- 已完成`DirectoryDock`、App、OrgNode、R1 toggle resolver、Duty Inspector、employee native drag、React Flow與現有tests盤點；R2沒有P0／P1 readiness缺口。
- `DirectoryKind`新增`duties`且固定排第五；selected duty／lane由route持有，不綁右側`DirectorySelection`。普通Position click永遠是閱讀，Duty mutation只可能由native／keyboard drop進入。
- 新增`src/dutyConfigurationDrag.ts`治理專用MIME、strict payload、native／keyboard drag state與二維auto-pan；`src/dutyConfiguration.ts`新增`resolveDutyConfigurationDropCommand`作assign-only resolver。相同relation與協作→主執行均no-op，drop不會輸出remove／downgrade。
- R2移除`DutyConfigurationDock.tsx`／test、Toolbar主入口、底部Dock／特殊picker CSS與App click-to-toggle listener；Duty detail改嵌既有右側Inspector，relation移除只用明確action。
- pending recovery鎖定原exact lane並沿用同一relation ID；release一律以`currentStateRef.current`重算，applied才進單一history，invalid／noop／rejected零history／autosave。
- required／forbidden files、S0～S5、R2-B1～B9、409／capability／focus recovery、Verification Integrity與FMEA均在權威契約固定。R2 evidence只能寫入`output/playwright/dev034-r2/manifest.md`。
- ADR不新增；R2不改資料權威、schema、API、permission或跨domain flow，僅在既有 storage parser／workspace save validation 邊界加入舊 `collaborate` 的 canonicalization 與去重。命中權威契約Stop Condition才回PM重判。

#### R2.1 Future Phase Capsule：複選式規劃狀態視角

狀態：`Brief Ready / Human Confirmed / Implementation Not Requested`。詳細產品語意與驗收方向以權威契約第 0.19 節為準。

- 在 `工作執掌` 標題列的「新增」之前加入 icon-only 篩選按鈕，開啟同 panel 內可控寬度的非 modal popover；不得新增頁面、Drawer、永久欄位或第二個 list scroll owner。
- `規劃狀態`只提供可複選的 `無執行職位`、`缺少主執行`、`待重新分配`。空集合代表全部，同群組採 OR，與文字搜尋採 AND；三項全選只可摘要為「全部待處理」，不得另設「待處理」選項。
- 異常來源只用既有 `deriveDutyAnomalies`；`attention=1` 相容入口初始化三項全選，不新增 anomaly、backend、schema、API 或保存格式。
- 篩選只影響左側 Duty 清單，組織圖保持完整。被排除的是目前 armed Duty 時，必須取消 drag並清除隱藏的 duty／lane／sourceRelation context。
- 責任視角、部門／層級／員工聚焦、配置完整判定、每類 count與全選控制不在本輪；只有真實任務證據成立後才恢復最小必要能力。
- Re-entry：使用者要求實作或升級 `RD Contract Ready`／`RD Implementation Ready` 時，依當時最新程式固定 state owner、popover pattern、required files、targeted tests與正常入口 browser evidence；在此之前不改 R2 現有完成與 QC 狀態。

### R1 Historical Baseline（已被 R2 主要入口與互動取代）

以下原 DEV-034 內容保存 R1 的「特殊 duty-config 模式、獨立 picker、底部 Dock、選好責任後點 Position」實作契約及 QA／QC 證據。除 organization V6、Duty command、五種 exact lane、Undo／autosave／CAS、手機唯讀與不使用 AI 判位等明確重用不變量外，不得引用以下 R1 UI／route／驗收條款直接實作 R2，也不得用 R1 完成狀態宣稱 R2 已完成。

### 真正問題與使用者價值

現行 DEV-031 以獨立 `/duty-planning*` 工作檯配置責任，規劃者必須在職掌工作面與組織架構之間切換，難以一邊看真實上下層關係、一邊判斷哪個職位適合執行、協作或審核。原先討論過的「組織圖直接選位」曾保存在 DEV-032 的 future 設計，但 DEV-032 後來收斂為自由管理辦法與唯讀職掌對照，因此沒有進入正式實作。

DEV-034 把這個未交付設計獨立成新的可驗收交付點：責任配置仍由人類判斷，組織圖是主要工作物件，系統只提供最小、可恢復的配置工具，不嘗試用 AI 推定適合職位。

### Human-confirmed Product Direction

- 不新增責任配置頁；沿用既有組織架構頁加入「工作事項配置模式」。
- 工作事項資料與責任關係維持兩層，但規劃者在同一編輯面完成選擇，不被迫先到另一頁配置。
- 選定工作事項後，來源清單收合為最小任務列；組織圖維持唯一主焦點。
- 人類選擇責任語意並直接點選 Position；AI 或自動辨識只能是未來輔助，不得成為 Current Phase 的判定者或寫入者。
- 既有 Inspector 只在選取後按需顯示完整職掌／責任內容，不建立永久第三欄。
- 不新增第二份全職位清單、責任配置專用搜尋、部門篩選或另一套選位結果；組織圖 Position 是 Current Phase 的配置目標。
- 手機只讀；桌面／筆電是否可寫仍須同時符合 DEV-033、workspace mode、version status、permission 與既有 validation。

### UX Intent

- 任務／結果：制度規劃者看著組織關係，把一項既有工作事項配置給正確的執行、協作及審核職位，完成後仍留在原組織上下文。
- 主物件／主焦點：組織圖及其 Position 節點；工作事項只是暫時配置上下文。
- 預設刪除：新頁面、永久多欄工作檯、重複職位清單、常駐教學、重複摘要、AI 建議區及成功彈窗。
- 保留舉證：最小任務列必須保留目前工作事項、目前責任類型、完成／離開與可辨識的保存失敗；否則規劃者會把關係配置到錯誤工作事項、無法結束模式或誤以為已保存。
- 非語言修復：以單一選取狀態、Position 節點輪廓、Dock／Drawer 內容、就地更新與 Undo 表達結果；不把職掌長文字塞入組織圖卡片，也不以多組 badge、色塊及說明文字重複同一事實。
- 風險與驗證：配置失敗不得留下假成功；模式切換須保留焦點與合理上下文；鍵盤、非顏色辨識、桌面 viewport 及手機唯讀均須可驗證。

### 主要流程

```text
既有組織架構頁
  → 進入「工作事項配置模式」
  → 從既有工作事項中選定一項
  → 工作事項來源收合成最小任務列
  → 選擇可見責任群組
       ├─ 執行 → 主執行／協作
       └─ 審核 → 審核／會簽
  → 點選一個或多個 Position 加入／移除關係
  → 就地顯示配置結果並沿用 Undo／autosave／version CAS
  → 完成或離開配置模式，回到同一組織圖上下文
```

兩個可見群組只降低規劃者的第一層認知負荷；協作與主執行同屬執行群組，backend 以 non-primary execute 保存；review／countersign 仍保留既有語意。

### Current Phase Scope

- 在既有組織架構頁增加暫時的工作事項配置模式，不新增主要 route 或第二套責任編輯器。
- 重用既有 Work Item／Duty 與 DutyPositionRelation；不建立相同名稱或內容的第二份主檔。
- 提供最小工作事項選擇表面；選定後收合，只保留完成配置所需上下文。
- 以 Position 節點的 pointer 與鍵盤可達操作配置或解除目前 relation，並提供單一清楚的 selected／assigned 狀態。
- 配置 mutation 沿用 organization current state、Undo／Redo、500ms autosave、Ctrl+S、version CAS、validator 與可恢復錯誤語意。
- 配置模式期間暫停會競爭同一 pointer／keyboard gesture 或改變 Position identity 的組織結構 mutation；離開模式後恢復原能力。
- 保留既有 Inspector 作按需細節；不常駐覆蓋組織圖，也不複製完整工作事項編輯器。
- DEV-031 的 `/duty-planning*` 已由本 DEV 提供相容入口，導向 root duty-config mode 並保留可相容的 Position／attention 上下文；正式產品 cutover 仍需另案決策。

### Out of Scope

- 管理辦法正文的 Stage／Step／Work Item 智能引用、段落語意標記或從管理辦法直接寫入職掌。
- AI 自動推薦、判定或套用執行／協作／審核職位。
- 新的職責重疊風險演算法；Current Phase 只沿用既有「兼任風險設定」及資料完整性驗證。
- 責任配置專用的第二份職位搜尋、部門篩選、永久職位 rail 或另一張組織圖。
- 手機、窄版或不具精確指標裝置的責任配置 mutation。
- 管理辦法核准／發布／生效、ISO／內控符合性判斷或執行證據鏈。
- production deploy、正式資料 migration、正式權限發布或 release。

### R1 Historical RD Implementation Decisions

- DEV-034 Current Phase 從組織架構／工作事項 surface 進入，不從管理辦法段落建立永久關聯；這與 DEV-032「自由正文、唯讀職掌對照」相容。
- 正式 relation 重用 organization document V6 與既有 OrganizationCommand；配置模式、選定 duty、exact lane、搜尋及 position focus 都是 route／UI context，不建立 schema、migration 或第二套保存路徑。
- 三個可見群組「執行／協作／審核」映射至主執行、其他執行、協作、審核、會簽五種 exact lane；主執行移轉沿用 atomic command，所有成功 click 都只產生一個 organization history entry。
- 「完成」與 Escape 只退出模式，不 rollback 已成功配置；回復使用既有 Undo／Redo，避免建立 transaction plan 或第二個提交流程。
- `/duty-planning*` 現已改為 root duty-config mode 的相容入口，保留 `?position=` 定位且沒有第二個 active mutation surface；正式部署仍受 release gate 管理。
- `no-executor`／`missing-primary` 以同一工作事項清單中的單一文字狀態呈現；`pending-reassignment` 從 drawer 選定後直接點 Position，以相同 relation ID 重新配置，不恢復第二份 Position selector。
- DEV-034 重用 DEV-033 的全系統 capability boundary：至少 1024px、hover 與 fine pointer 同時成立才呈現 mutation；server／domain 仍驗證 workspace mode、revision 與 V6 文件。
- 完整 route、command、failure recovery、permission、QA／QC 與 stop conditions 以 `ai-doc/specs/DEV-034-org-chart-inline-duty-configuration.md` 為權威。

### R1 歷史實作進度（2026-08-25）

- S1 已完成：`src/dutyConfigurationRoute.ts`、`src/dutyConfiguration.ts`、`src/dutyConfigurationCapability.ts` 與對應測試；路由採 root query，五 exact lane 映射既有 `OrganizationCommand`，primary transfer 使用 atomic command，pending 使用同一 relation ID。
- S2 已完成：`src/components/DutyConfigurationDock.tsx`、`DutyDetailDrawer` 的 `organization-chart` placement variant、OrgNode assigned 輪廓與最小任務列樣式；配置模式不在 Position 卡片渲染職掌文字、不渲染 Directory Dock，也不建立第二份 Position 清單。
- S3 已完成：`App.tsx` root mode、`/duty-planning*` alias、Toolbar／Inspector／PositionDutySection 入口、workspace mode／mobile／hover／fine-pointer capability gate、既有 command／history／autosave 邊界整合。
- S4 已完成：`npm test -- --testTimeout=30000` 通過 `58 test files／251 tests`；`npm run build` 與 `git diff --check` 通過，僅保留既有 Vite bundle size warning；配置模式 canvas 單欄與 Dock 安全區修正後 Position 可見且不被固定 Dock 覆蓋。
- S5 已完成：`output/playwright/dev034/manifest.md` 已記錄 B1～B9；包含 primary transfer／Undo-Redo、pending same relation ID、legacy alias、1440×900／1024×768／390×844、console／network／overflow 及唯讀 controls gate。

### R1 歷史驗收摘要

- 規劃者可在既有組織架構頁進入與退出工作事項配置模式，不需要前往新頁面。
- 選定工作事項後，工作事項選擇表面收合為最小任務列；首屏主焦點仍是組織圖，沒有永久第三欄或重複全職位清單。
- 規劃者可在同一表面選擇三類可見語意及必要的五種精確 relation，並以 Position 節點加入或解除關係。
- 每次成功配置立即反映在相同 Position 與按需 Inspector；失敗保留目前工作事項與選取上下文，不顯示假成功。
- Undo／Redo、autosave、Ctrl+S、version CAS 與 validator 行為不因新模式產生第二套保存路徑或不一致結果。
- 配置模式期間不會因拖動組織節點、開啟衝突編輯或快捷鍵誤觸而改變不相關組織資料；退出後既有組織編輯恢復。
- 鍵盤可完成工作事項選擇、責任類型切換、Position 配置及退出；狀態不只靠顏色表示。
- 手機與不符合 mutation capability 的 deep link 只能閱讀組織與責任結果，不能觸發配置 command 或產生 dirty state。
- `no-executor`、`missing-primary` 與 `pending-reassignment` 仍可辨識及修復；pending 重新配置保留原 relation ID。
- DEV-031 的歷史工作流仍保留作 regression baseline；相容入口已導向 DEV-034，是否正式退場由後續 cutover 決策決定。

### Cross-Spec Consistency

- `Intentional scope transfer`：DEV-031 與 DEV-032 中 2026-08-24 的組織圖責任配置 future 設計，改由 DEV-034 作為唯一 active RD Implementation Contract；歷史段落保留決策脈絡，不再直接授權實作。
- `Intentional replacement (local)`：DEV-034 已取代 DEV-031 的責任配置主要資訊架構；DEV-031 route、domain、command、保存、測試與證據保留為相容及 regression baseline。
- `Compatible extension`：DEV-032 仍維持自由管理辦法、無智能引用及 Duty 唯讀對照；DEV-034 不從管理辦法 domain 寫入 Duty，也不修改 DEV-032 store、snapshot 或 editor contract。
- `No conflict`：DEV-034 遵守 DEV-033 手機只讀最高原則；裝置 capability 不是正式 security credential。
- ADR 判定：目前不建立 ADR；Current Phase 不改 schema、API、permission、persistence authority 或跨 domain data flow。若後續命中權威契約的 Stop Conditions，再重新判斷 ADR。

### Future Phase Capsule：管理辦法來源上下文

`Future Phase Captured / Not Requested`：若未來重新核准管理辦法段落智能引用，可由管理辦法攜帶 `methodId／anchor／workItemId` 進入 DEV-034，完成、取消或瀏覽器返回後恢復原文件位置。重新進入條件是 DEV-032 另案接受穩定的正文關聯身分與跨 domain 刪除規則；在此之前不得由文字比對、AI 推論或段落順序自動建立永久 reference。

### R1 歷史交接

現行盤點已確認：root 組織圖可承載 mode、歷史原型可作互動參考、正式 Duty 已在 organization V6、五種 exact relation 可由既有 commands 表達、Undo／500ms autosave／revision CAS 可重用，且 `/duty-planning*` 已有明確 route parser 與 Position focus。

R1 當時已完成 RD 實作與 QA／QC handoff；pure route／toggle command／capability modules、Dock／OrgNode／Drawer／App composition、S0→S5與 B1～B9均有歷史實作與證據。R2已取代其入口與互動，RD不得把本段當成現行實作指令或沿用其passed狀態。

### 變更紀錄

- 2026-08-25：依使用者明確要求建立 DEV-034；把先前未交付的組織圖責任配置模式從 DEV-032 歷史 future 段落轉為獨立 `Brief Ready` 交付點。Current Phase 不恢復管理辦法智能引用、AI 職掌判斷、額外職位清單或手機編輯；本輪未修改產品程式、測試或資料。
- 2026-08-25：依使用者要求盤點 `App` root composition、OrgNode、DutyCenter、Duty commands、organization V6、Undo／autosave／CAS 與三個 legacy routes，建立 `ai-doc/specs/DEV-034-org-chart-inline-duty-configuration.md` 並升級為 `RD Contract Ready`。本輪仍未修改產品程式、測試或資料。
- 2026-08-25：依使用者要求補至 RD 可開發；固定 required／forbidden repo files、pure module exact symbols、App／Node／Dock／Drawer wiring、S0→S5、failure injection及 B1～B9 evidence contract。盤點期間另有 management-method chapter navigation dirty changes進入工作樹，已列為受保護邊界；current dirty tree baseline為 `52 test files／229 tests`與 build通過。DEV-034升級為 `RD Implementation Ready / RD Not Started`，本輪未修改產品程式或正式資料。
- 2026-08-25：依 `dev-pm` 完成 DEV-034 S5；`npm test -- --testTimeout=30000` 通過 `58 test files／251 tests`，`npm run build` 與 `git diff --check` 通過。完成 B7 primary transfer／Undo-Redo、B8 pending same-relation-ID fixture、B9 三 viewport／console／network／overflow 與 legacy alias；另修正配置 Dock 遮擋畫布下緣，active workspace 依 viewport 預留 Dock 安全區。證據見 `output/playwright/dev034/manifest.md` 與 browser screenshots；未 deploy／release，狀態升級為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending`。
- 2026-08-25：依瀏覽器回饋完成 DEV-034 UX 微調：Position 卡片不再顯示工作事項／職掌長文字，僅保留 assigned 節點輪廓；責任閱讀集中於 Dock／按需 Drawer。763×698／1440×900 smoke、`58 test files／251 tests` 與 build 通過，補充證據為 `duty-card-compact-763x698.png`。
- 2026-08-25：依使用者要求執行工作事項選擇表面優化：底部大型 picker 改為左側 `280～320px` 推移式面板，組織圖使用剩餘畫布；`720px` 以下改同 route 全寬表面。清單改為扁平列、單一「待處理（n）」群組，刪除逐列狀態及空白說明；選定後自動收合，唯讀最小任務列仍可更換 Duty 並壓縮為單列。本輪新增 Dock render regression test，854×698／1440×900／390×844 UI QC、`59 test files／253 tests`、build 與 diff check 證據見既有 DEV-034 manifest／補充 screenshots；未改 domain、API、schema、route、command、保存或 release 邊界。
- 2026-08-25：使用者確認 R2 產品方向：將整個職掌入口納入既有左側主資料 rail，沿用其他清單的固定位置、panel shell、搜尋、選取與收合以建立高度肌肉記憶；選取職掌後就地設定精確責任，再由左向右拖到 Position。R2 明確取代頁首入口、特殊 picker、底部 Dock 與點擊 Position mutation；R1 程式及 `output/playwright/dev034/manifest.md` 只保留歷史證據。本輪將 DEV-034 重新標示為 `R2 Brief Ready / RD Not Started`，未修改產品程式、測試或資料。
- 2026-08-25：依 `dev-pm` 執行 DEV-034 R2：完成第五 `DirectoryDock` 職掌清單、兩列五 lane、native／keyboard drag handle、assign-only latest-state resolver、React Flow 二維 auto-pan、普通 Position click 閱讀隔離、Inspector explicit remove 及 R1 Dock／Toolbar 入口 cutover。新增拖曳契約與 resolver regression；`npm test -- --testTimeout=30000` 通過 `59 test files／258 tests`，`npm run build` 通過。in-app browser 在本輪重啟 localhost 後受 URL policy 阻擋，尚未建立 `output/playwright/dev034-r2/manifest.md`，故狀態為 `RD Implementation Complete / QA-QC Pending Browser Gate / Local Release Gate Pending`，未 deploy／release。
- 2026-08-25：依使用者要求把 R2補至`RD Implementation Ready / RD Not Started`。固定第五Directory、route與Inspector selection分離、assign-only drop resolver、專用MIME、native／keyboard drag、React Flow二維auto-pan、pending same-ID、R1 artifacts移除、repo allowlist、S0～S5、R2-B1～B9、Verification Integrity、FMEA及全新`dev034-r2` evidence邊界；本輪只更新開發文件，未修改產品程式、測試或資料。
- 2026-08-26：依使用者介面回饋將職掌列的兩個動作明確分離：點擊職掌名稱開啟既有明細 Inspector／Drawer；名稱旁獨立 chevron 按鈕負責展開／收起責任 lane，兩者不互相觸發。同步更新 `expandedDutyId` UI state、ARIA、CSS／prop wiring與 route contract；in-app browser smoke已確認名稱開明細時責任 lane不展開、chevron可展開／收起且不產生 relation mutation。

## DEV-033：手機唯讀與桌面編輯的產品能力邊界

狀態：完成（`RD Implementation Complete / Automated Gate Passed / Browser QA-QC Passed / Local Release Gate Pending`）
文件成熟度：`RD Implementation Complete`
節點類型：交付點  
優先級：P0  
來源 ID：`USER-2026-08-23-MOBILE-READ-ONLY-HIGHEST-PRINCIPLE`  
父任務：DEV-020、DEV-027、DEV-028、DEV-029、DEV-031、DEV-032  
計入交付：是  
風險等級：Medium（跨既有與未來所有編輯 surface、responsive layout、command entry 與 browser QC；不改正式權限模型、資料內容或 server authorization）  
執行邊界：已完成 deterministic capability、跨模組 UI、command／submit guard、deep-link／快捷鍵／拖放 fail-closed 及真實 viewport QA；未修改正式資料、schema、API、deploy 或 release。

### 真正問題與使用者價值

OrgMaster 的主要規劃與治理工作需要大範圍比較、拖放、關係配置及變更確認，手機螢幕不適合作為正式編輯環境。若為了跨裝置一致而維持手機寫入，不但增加 RWD、觸控替代及回復流程的複雜度，也提高誤改組織、職掌、管理辦法與治理設定的風險。

手機的主要價值是隨時閱讀與查詢：員工可查看組織關係、職位職掌與管理辦法；主管可搜尋、篩選及打開明細。把手機固定為唯讀，可以讓有限的產品與驗證資源集中在高品質閱讀體驗，所有正式規劃與修改留在桌面／筆電完成。

### Human Decision：專案最高原則

- 手機版只提供唯讀閱讀、搜尋、篩選、切換及明細導覽。
- 手機版不得建立、修改、刪除、排序、拖放、配置、移轉、核准、發布、保存或觸發其他 mutation。
- 手機深連結到任何可編輯 route 時，仍顯示同一內容的唯讀狀態；不得以錯誤頁阻斷正常閱讀，也不得暴露可成功寫入的替代入口。
- 手機正常畫面只需一個清楚的「唯讀」狀態，不以大量 disabled controls、常駐教學或警告取代正確的資訊架構；寫入控制原則上不呈現。
- 桌面／筆電是否可編輯仍由既有 workspace mode、version status、治理權限與 domain validation 決定；桌面寬度本身不等於擁有寫入權。
- 手機唯讀是 UX capability boundary，不是安全授權機制；server 或 domain 仍必須驗證所有實際收到的 mutation，不可信任 viewport 或 user-agent 作為權限證據。

### 專案適用範圍

本原則適用所有既有與未來 OrgMaster surface，包括但不限於：

- 組織架構、職位、部門、員工及任職關係。
- 工作事項／工作職掌、執行／協作／審核責任配置及異常修復。
- organization version、維護模式、治理設定、核准與發布操作。
- DEV-032 的自由管理辦法草稿、正文、表格、圖片、閱讀導覽及 AI 建議差異；未來若恢復智能引用或正式版本生命週期，仍適用同一手機只讀原則。

### 手機唯讀主要流程

```text
開啟 OrgMaster
  → 閱讀／搜尋／篩選
  → 開啟組織、職位、職掌、工作事項或管理辦法明細
  → 沿關聯導覽
  → 不出現可提交資料變更的控制或流程
```

手機閱讀必須保留完整關鍵內容；唯讀不得被實作成刪減資料、只能看摘要或無法追蹤關聯。

### Initial Scope

- 建立一致的 mobile read-only capability 判斷及可見狀態。
- 所有 mobile surface 移除 mutation affordance，並使 client command／submit path 無法因隱藏入口、鍵盤、deep link 或殘留 handler 提交資料變更。
- 保留搜尋、篩選、導覽、明細閱讀、狀態閱讀及必要的 responsive layout。
- 桌面／筆電既有編輯流程在具備 workspace／governance 條件時維持可用。
- 對既有完成 DEV 的手機編輯條文建立 supersession，不改寫其歷史測試結果。

### RD Implementation Contract

- `isDesktopMutationEnvironment()` 是所有 mutation surface 的共同物理／runtime gate：`serverReady`、非 blocked recovery、`viewportWidth >= 1024`、hover、fine pointer 且非 `mobileReadOnly` 必須同時成立。
- `resolveModuleCapability()` 另檢查 workspace mode、version status、domain capability 與治理條件；current-view、無權限、無效版本或 recovery 狀態不可寫入。
- App 的 `commit`、`commitState`、`commitDomainMutationIntent`、`runOrganizationCommand`、`saveDocument`、`persistDraft`、版本工作區 action、快捷鍵、拖放、Directory、Inspector、Duty、Process、Management Method、Governance 與 Role Risk 均由同一 gate 重驗。
- 手機保留完整閱讀、搜尋、篩選、版本切換與明細導覽；VersionSwitcher／DocumentMenu／VersionWorkspacePanel／Inspector／DirectoryDock／OrgNode 不 render mutation affordance。桌面 draft-edit 與 current-maintenance 維持既有編輯流程。
- 平板採 default-deny：`<1024px`、無 hover 或無 fine pointer 均唯讀；這是 UX capability，不是 security credential。

### Out of Scope

- 手機建立、修改或核准任何 OrgMaster 資料。
- 手機離線編輯、稍後同步、草稿暫存、觸控拖放及手機專用快速修改。
- 原生 iOS／Android App、推播通知或手機專屬身分驗證。
- 以手機判定取代正式 Auth、role、permission、workspace mode、version status 或 server validation。
- 正式 production authority、Auth、role、permission、資料 migration、deploy 或 release；這些維持既有 release gate。

### 驗收方向

- 390×844 或後續 RD Contract 定義的手機模式可閱讀全部核心資料，沒有水平溢出、遮擋、文字裁切或被固定區域吃掉的主要內容。
- 手機版不存在可見的新增、編輯、刪除、拖放、配置、移轉、核准、發布或保存入口；直接進入編輯 deep link 仍為唯讀。
- 手機操作搜尋、篩選、切換及關聯導覽不會產生 organization dirty state、Undo history、autosave、API mutation 或資料變更。
- 只靠 CSS 顯示隱藏不足以通過驗收；可達的 command／submit handler 必須遵守 mobile read-only capability。
- 桌面／筆電在既有可編輯 mode 與治理條件下仍可完成相同功能，不因 mobile principle 全域誤鎖。
- 唯讀狀態不用只靠顏色表達，鍵盤、screen reader、直向／橫向手機畫面均能理解目前不可寫入。
- `390×844` fresh Chromium：mode=`current-view`、editor／layout／collapse controls 不可見，document／body `scrollWidth === viewport width`，visible error=0。
- `1024×768` 與 `1440×900` fresh Chromium：draft-edit editor、結構配置與既有桌面 mutation controls 可用，document／body `scrollWidth === viewport width`，console error=0。

### Cross-Spec Consistency

本原則是 `Human-confirmed Intentional replacement`：

- 取代 DEV-028 於 2026-08-21 記錄的「所有 viewport 同等編輯」條款。
- 取代 DEV-029 的 `<1024 CSS px` 不再唯讀條款。
- 取代 DEV-031 的「390×844 不得改為唯讀」及手機／觸控完整配置路徑條款。
- 不取代上述 DEV 的 domain、資料、保存、Undo、桌面拖放或歷史完成證據；現行程式已由 DEV-033 的 deterministic gate 統一收斂，不能只以舊文件或歷史 evidence 推定手機可編輯。

### 驗證與文件

- 權威契約：`ai-doc/specs/DEV-033-mobile-readonly-desktop-mutation-boundary.md`。
- Automated gate：`npm test`（181 files／749 passed／1 skipped）、`npm run build`；`src/workspace/capability.test.ts` 覆蓋 desktop／1023／hover／fine pointer／mobile／recovery boundary。
- Browser evidence：`output/playwright/dev033/dev033-mobile-390x844.png`、`output/playwright/dev033/dev033-desktop-1440x900.png`；fresh console error sweep=0。
- 本 DEV 完成 local implementation 與 QA／QC；不授權 candidate freeze、commit、merge、deploy 或 release。

### 變更紀錄

- 2026-08-23：依使用者明確決策建立專案最高產品原則與 `Brief Ready`；手機固定唯讀、桌面／筆電沿用既有治理條件，平板及 deterministic capability boundary 待後續確認。本輪未修改產品程式。
- 2026-09-03：依 DEV-033 RD contract 完成全系統 deterministic mutation boundary；採 `>=1024px + hover + fine pointer` 的 desktop gate，手機／觸控窄版唯讀；補齊 global chrome、version workspace、Organization／Duty／Process／Management Method／Governance／Role Risk 的 UI 與 handler guards。`npm test`、build、390／1024／1440 fresh Chromium與console sweep通過；production rollout 仍走 release gate。

## DEV-032：精簡自由管理辦法系統

狀態：可執行（`RD Implementation Ready / Human Confirmed Minimal Reading-First Current Phase / Two Concept Prototypes Accepted / Third Prototype Cancelled / Product Implementation Not Started`）  
文件成熟度：`RD Implementation Ready`  
節點類型：交付點  
優先級：P0  
來源 ID：

- `USER-2026-08-22-INTEGRATED-MANAGEMENT-SYSTEM-BRIEF`
- `USER-2026-08-23-WORK-ITEM-RESPONSIBILITY-LAYER-DIRECTION`
- `USER-2026-08-24-ORG-CHART-INLINE-DUTY-ASSIGNMENT-MODE`
- `USER-2026-08-24-DEV032-SCOPE-CONVERGENCE`
- `USER-2026-08-24-DEV032-DRAFT-FIRST-PHASE`
- `USER-2026-08-24-DEV032-UX-DESIGN-DETAILS`
- `USER-2026-08-24-DEV032-BRIEF-DETAIL-CONTINUATION`
- `USER-2026-08-24-DEV032-REAL-METHOD-SAMPLE-REFINEMENT`
- `USER-2026-08-24-DEV032-NO-LEGACY-TRACE`  
- `USER-2026-08-24-DEV032-INTERACTIVE-PROTOTYPE`  
- `USER-2026-08-24-DEV032-FREEFORM-MULTIMEDIA-DOCUMENT`  
- `USER-2026-08-24-DEV032-WORKSPACE-EDITOR-BOUNDARY`  
- `USER-2026-08-24-DEV032-AI-NATIVE-AUTHORING`  
- `USER-2026-08-24-DEV032-CONTROLLED-INTERACTIVE-READING`  
- `USER-2026-08-24-DEV032-SIMPLE-FREEFORM-SEMANTIC-EDITING`  
- `USER-2026-08-24-DEV032-AI-NATIVE-INTERVIEW-HUMAN-ACCOUNTABILITY`  
- `USER-2026-08-24-DEV032-AI-NATIVE-BRIEF-DETAIL-CONTINUATION`  
- `USER-2026-08-25-DEV032-BRIEF-SURFACE-CONTEXT-ACCESS-DETAILS`  
- `USER-2026-08-25-DEV032-FIRST-REAL-METHOD-PROTOTYPE`  
- `USER-2026-08-25-DEV032-FIRST-PROTOTYPE-ACCEPTED-DETAIL-CONTINUATION`  
- `USER-2026-08-25-DEV032-SECOND-PRINCIPLE-METHOD-PROTOTYPE`  
- `USER-2026-08-25-DEV032-ABANDON-AI-INTERVIEW`  
- `USER-2026-08-25-DEV032-MINIMAL-READING-FIRST`  
- `USER-2026-08-25-DEV032-CONCEPT-ACCEPTED-NO-THIRD-PROTOTYPE`  
- `USER-2026-08-25-DEV032-IMPLEMENTATION-READY`  
父任務：DEV-008、DEV-020、DEV-027、DEV-028、DEV-031  
計入交付：是  
風險等級：Medium（AI 只在建立時起草，仍會影響制度事實、內容保存、外部模型資料邊界及人類覆核；最低閱讀狀態涉及後續權限及保存契約，但不新增跨領域寫入、正式文件治理或段落智能關聯）  
執行邊界：使用者於 2026-08-25 確認兩份精簡閱讀優先概念原型、取消第三份概念原型，並要求補到 `RD Implementation Ready`；本輪已依 authoritative contract 完成本機 S0–S7。Current Phase 只保留一次 AI 初稿、乾淨閱讀、桌面人工編輯與按需職掌對照；不同表格／圖片情境列為正式 QA fixture。產品程式、測試、治理相容同步、local store／media 與 browser evidence 已完成；未建立正式 credential、未送出真實公司資料、未 deploy 或 release，且不授權 DEV-031 退場。

Current Phase RD Implementation Contract：`ai-doc/specs/DEV-032-management-method-system.md`

### Current Authoritative Brief：閱讀優先、AI 只產生初稿

決策狀態：`Human Confirmed / Intentional Replacement / Minimal Reading-First / No Pending / No In-Document AI Editing / 2026-08-25`。

本節是 DEV-032 第一版唯一 Current Phase 權威。產品採 `AI-assisted initial draft / Human-edited and accountable`：人類一次提供目標、事實或既有內容，AI 只負責產生第一份自由多媒體初稿；文件建立後回到乾淨閱讀與桌面人工編輯。人類對公司事實、制度取捨、正文內容及提供公司閱讀負全責。第一版不提供待確認標記、AI 訪談、追問式對話、固定問卷、文件內 AI 編輯或 AI 差異提案。

第一版產品承諾固定為：

> 人類提供制度目標、現況或既有內容後，AI 只產生一次自由多媒體初稿；進入文件後，畫面專注閱讀，人類可切換至桌面編輯模式修正正文，並按需對照既有職掌。AI 不得訪談、顯示待確認、在文件內改寫、自行補造公司事實、修改職掌或發布文件。

使用思考習慣：#批判、#設計思考、#當責

#### 真正問題與使用者價值

鉦富機械目前 14 人、主管兼任普遍、流程仍有紙本與隱性經驗。主要瓶頸不是缺少文字編輯工具，而是主管腦中的做法、例外與判斷尚未被穩定轉成可閱讀制度；若 AI 只讀取尚不完整的既有職掌便自行生成，可能把現有缺口包裝成看似完整的錯誤制度。

第一版應讓人類用一次輸入描述目標、貼入現有資料或直接提供既有辦法，再由 AI 產生可閱讀初稿；資料不足時，AI 只使用已提供內容並省略沒有依據的規則，不提問、不補造，也不在正文插入待確認卡片。AI 約 90% 是「初稿寫作與整理工作量」目標，不是後續編輯比例、制度決策比例、正確率或自動核准目標；人類仍承擔 100% 的事實確認、正文修正與提供公司閱讀責任。

#### Current Phase 系統描繪

```text
人類一次提供制度目標／現況／既有內容
  └─ AI 只產生一次自由多媒體初稿
       └─ 乾淨文件閱讀
            ├─ 桌面切換「編輯文件」修正正文
            └─ 按需開啟職掌唯讀對照
                 └─ 人類判斷並自行修改正文或既有職掌
                      └─ 人類提供公司閱讀
                           └─ 產生／取代單一閱讀快照
                                └─ 後續修改留在工作草稿，閱讀者仍看前次快照
```

權威與責任邊界：

- Management Method 是 OrgMaster 內的自由正文權威；正文不建立到 Work Item、Position、Employee、ISO／內控條文或其他物件的智能引用。
- Organization／Duty／Responsibility 維持既有結構化權威；DEV-032 只讀對照，不新增跨 domain 寫入，也不取代 DEV-031。
- AI 只在建立初稿時使用人類本次輸入與明確選取來源；不確定或資料互相衝突時省略無依據規則，不得提問、建立待確認清單或把推測寫成公司事實。
- 文件建立後不顯示 AI 入口。人類可在桌面切換「編輯文件」修改正文；AI 服務失敗、成本受限或未啟用時，不得阻斷人工編輯。
- 一般閱讀者只讀最後一次由指定人類提供的閱讀快照；工作草稿和尚未提供的修改不會直接出現在閱讀面。
- `可供公司閱讀` 只表示指定人類已允許員工依目前快照閱讀，不宣稱已完成 ISO 正式核准、版次、生效或合規判定。指定人類可停止提供閱讀，但 AI 不得執行。
- Google Workspace 只作登入、來源資料、附件與外部討論；第一版只允許單向複製貼上，不建立第二份正文權威、雙向同步或未經定義的「系統備份」承諾。

#### AI 與人類分工

| 工作 | AI | 人類 |
|---|---|---|
| 制度事實輸入 | 整理人類一次提供的內容；資料不足時省略，不追問 | 提供並確認現況、目標、例外與紀錄需求 |
| 初稿與格式 | 只在建立時產生一次自由多媒體初稿 | 判斷是否符合實際工作 |
| 內容修改 | 第一版不參與 | 以桌面「編輯文件」修改正文 |
| 職掌對照 | 第一版不參與 | 主要判斷是否矛盾及要修改哪一邊 |
| 制度取捨 | 可提供選項，不得代替決策 | 最終決定 |
| 提供公司閱讀 | 不得自行執行 | 指定人類確認並執行 |

#### 最小資料概念（產品摘要；I/O 契約見 RD Implementation Contract）

```text
Management Method
  ├─ permanentId
  ├─ MP-xxxx
  ├─ title
  ├─ workingDraftBody（編輯器原生文件內容）
  ├─ readableSnapshot（零或一份 title＋owner＋正文的目前公司閱讀內容）
  ├─ media assets
  ├─ owner
  ├─ draftUpdatedBy／draftUpdatedAt
  └─ readableBy／readableAt
```

- 編輯器可保留技術性節點識別支援選取、Undo／Redo 與未來擴充，但不具有流程、責任或控制點等業務語意。
- `建置中／可供公司閱讀／有未提供更新` 由工作草稿與單一閱讀快照的關係得出，不另存互相矛盾的狀態文字。
- 單一閱讀快照是避免員工看見半成品的 Current Phase 安全邊界；它不保留多個歷史版本，也不擴張成 revision、審核、核准、生效、失效或取代生命週期。
- media asset 只要仍被 working draft 或 readable snapshot 引用就不得刪除；從草稿移除圖片不得破壞一般閱讀者目前看到的 snapshot。

#### 文件身分與編碼

第一版只使用單一管理辦法類別碼 `MP`，人類可讀代碼格式固定為 `MP-0001`、`MP-0002`……；系統內部仍使用不具業務語意的 `permanentId` 作為真正關聯身分。代碼目的是讓人能穩定辨識與搜尋文件，不是把組織分類壓進字串。

固定原則：

- 「新增管理辦法」先開啟未編號的最小建立輸入。使用者明確執行「產生初稿」且文件建立成功時，系統才原子配置 `permanentId` 與下一個 `MP-xxxx`；取消或關閉尚未提交的輸入不消耗代碼。
- `MP-xxxx` 由系統全域依序產生，建立後只讀、永久不變且不得重複使用。標題、負責人、內容或公司閱讀狀態改變都不換號；AI 也不得選擇、編輯或建議代碼。
- 代碼不得放入部門、職位、流程、組織階層、ISO 條文、創櫃板循環、年份、版次、生效日、機密等級或其他可能變動資訊；需要時以獨立資料或正文呈現。
- 代碼配置後，Current Phase 不提供永久刪除、釋放號碼或重新使用號碼。使用者仍可停止提供公司閱讀並保留 working draft；封存、復原及永久刪除政策留待 Future Phase。
- 清單與切換入口至少支援以完整／部分 `MP-xxxx` 或標題搜尋。第一版不建立依部門、流程、階層或合規分類產生的文件樹。

#### 最低閱讀狀態模型

| 畫面狀態 | 資料條件 | 編輯者看到 | 一般閱讀者看到 |
|---|---|---|---|
| 建置中 | 尚無 readable snapshot | 最新 working draft | 不列入可閱讀辦法，deep link 不洩漏草稿 |
| 可供公司閱讀 | snapshot 存在，working draft＋title＋owner 與 snapshot 相同 | 同一內容與閱讀資訊 | readable snapshot 的標題、負責人與正文 |
| 有未提供更新 | snapshot 存在，正文、標題或負責人任一已變更 | 最新草稿＋明確未提供更新狀態 | 仍是前次 readable snapshot，不提前看到新 metadata |

固定轉換：

- 新增辦法固定從 `建置中` 開始；AI 不能自行變更閱讀狀態。
- 指定人類執行「提供公司閱讀」時，以當下 working draft 原子取代唯一 readable snapshot。第一版沒有 `待確認` gate；內容正確性由執行者在確認畫面自行負責。
- 可供閱讀後的第一次正文修改只改 working draft，立即呈現 `有未提供更新`；一般閱讀者不中斷，仍看到前次 snapshot。
- `有未提供更新` 可再次提供公司閱讀，或把 working draft 還原為目前 snapshot；第一版不選取任意歷史版，因為不存在多版本歷史。
- 指定人類可執行「停止提供公司閱讀」；一般閱讀入口立即不可用，working draft 保留並回到 `建置中`。此動作需要確認，但不建立失效版次或失效日。
- 第一版不排程未來生效、不設定有效期限、不會簽，也不保存歷次 readable snapshot；正式生命週期仍是 Future Phase。

#### 概念權限與裝置能力

產品層只固定需要的能力，不建立新的角色名稱或硬編碼組織職位；14 人公司可以讓同一人持有全部能力，未來成長時仍可分離：

| 能力 | 第一版允許的行為 |
|---|---|
| `CreateMethod` | 開啟未編號建立輸入並明確提交一次 AI 初稿；失敗不配置代碼 |
| `ReadReadable` | 只讀目前 readable snapshot；不存在時不可得知或讀取 working draft |
| `ReadDraft` | 讀取 working draft 與其建置／未提供更新狀態 |
| `EditDraft` | 在桌面切換「編輯文件」，直接編輯正文並使用 Undo／Redo |
| `ManageReadAvailability` | 提供、再次提供、從 snapshot 還原草稿或停止提供公司閱讀；不得由 AI 代理執行 |
| `ManageMetadata` | 修改標題與文件負責人；不得修改永久代碼 |

- 一般閱讀入口只依 `ReadReadable` 顯示 snapshot，不顯示「另有草稿」或未提供更新等內部狀態，避免由介面洩漏草稿存在。
- 有 `ReadDraft` 但沒有 `EditDraft` 的使用者可在桌面或手機閱讀草稿，不能藉由快捷鍵、deep link、AI endpoint 或隱藏控制執行 mutation。
- Current Phase 的閱讀能力以整份 Management Method／單一 readable snapshot 為邊界，不提供段落級權限、同篇多個閱讀版本或依讀者動態遮罩。正文中的「受限／機密」提示只是編製提醒，不是已生效的安全控制；若同篇混合一般與機密內容，人類必須選擇整份限制閱讀、先移除機密內容再提供閱讀，或維持建置中。
- DEV-032 只有至少 1024px、hover＋fine pointer 才可呈現 mutation；其餘一律唯讀。即使帳號具有 `EditDraft`、`ManageReadAvailability` 或 `ManageMetadata`，唯讀裝置也不呈現且不可從 UI 呼叫這些 mutation；server 仍逐次驗證 permission，不把裝置條件當安全身分。
- AI 不是使用者、角色或核准者；它只在具有建立能力的人類明確執行「產生初稿」時工作，不能在既有文件內執行編輯，也不能取得 `ManageReadAvailability` 或 `ManageMetadata`。
- 這些能力沿用 DEV-027 的 `orgmaster` application，permission code 與 API negative contract 已固定於 `ai-doc/specs/DEV-032-management-method-system.md`；角色配置仍由 DEV-027 管理，不為 DEV-032 另造身分系統。

使用思考習慣：#風險分析、#可逆性、#簡化

#### AI 初稿建立邊界

建立入口只有兩種使用意圖，不建立不同文件類型：

- `建立新辦法`：同一畫面提供制度標題／目的、目前已知事實、希望建立的規則，以及可選的既有文字或明確選取附件；人類一次提交後，AI 產生初稿。
- `整理既有辦法為新文件`：人類貼上或輸入既有內容，AI 只在建立時產生保留原意的整理初稿；文件建立後不再顯示 AI 入口。

AI 應在產生初稿時區分下列來源語意，避免把現況與目標混寫；它們只供生成處理，不形成正文標記、提示或永久結構化欄位：

| 來源語意 | 來源與處理 |
|---|---|
| 已確認現況 | 人類明確表示目前實際如此，AI 可寫入現況描述 |
| 已確認目標規則 | 人類明確選擇未來應如此，AI 可寫成制度要求 |
| 未提供／來源衝突 | 省略沒有依據的規則，不自行補完，也不在正文插入提醒 |

初稿互動固定規則：

- 不提供 AI 訪談、聊天式澄清、逐題追問、固定問卷、缺口清單或文件內 AI 編輯。
- 人類可以只提供不完整資訊；AI 只完成有依據的正文並省略其餘內容，不得反問、自行補造制度事實或插入「待確認」。
- 執行「產生初稿」前，介面顯示本次會使用的輸入與選定來源範圍；提交是單一、明確且可取消的動作。
- 成功產生後直接形成一份可由人類編輯的 working draft；生成摘要、來源分析與模型推論不常駐文件閱讀頁。
- 文件建立後的修正一律使用桌面「編輯文件」，不提供 AI 重寫、章節提案、差異接受／拒絕或 AI 套用恢復點。

#### AI 可用上下文與來源揭露

AI 預設只取得「建立畫面中人類本次輸入＋此次明確選取的來源」。它不取得建立後的 working draft，也不在背景自行搜尋其他管理辦法、整個 Google Drive、郵件、附件、組織資料或職掌資料。

- 使用者產生初稿前，介面以簡短可讀方式顯示此次將使用的上下文範圍，例如「新辦法輸入＋選定附件」；不必暴露內部 prompt，但不得用模糊的「公司資料」概括。
- 貼上文字、上傳附件或 Workspace 來源只有在使用者明確選入此次任務後才能送給 AI；未選取的來源不得因曾經開啟或曾經貼上而自動加入。
- 「對照職掌」是建立後的人類唯讀比較工具，不把職掌送給 AI。第一版 AI 初稿不讀取 Organization／Duty／Responsibility。
- AI 初稿只可把人類明確提供的現況與目標寫入正文；來源不足或互相衝突時省略相關制度規則，不得以流暢文句掩蓋缺少證據。
- 是否支援 AI 解讀圖片，取決於後續 provider、隱私及成本契約；未被使用者明確選取的圖片不得送出。未確認前，圖片只作正文受保護媒體，AI 可處理其人工說明但不能聲稱理解圖片內容。
- context envelope、prompt／response 不進正文 store、禁止隱性資料來源及 provider-neutral adapter 已固定。Current Phase provider 選為 OpenAI Responses API，model 由 server environment 指定，`store:false`、無 tools／背景模式／圖片理解、90 秒 timeout、單 process concurrency 1、12,000 output-token 上限；正式 credential、額度與真實公司資料外送仍須 release gate，不因文件 ready 視為已取得資料外送授權。

#### 表格、圖片與連結保護

自由創作不等於允許工具把非文字內容當成可丟棄裝飾。第一版以「初稿生成安全、人工編輯完整保存」為統一規則：

- AI 可在初稿產生文字表格；建立後的表格新增、刪除列欄、合併／拆分儲存格及文字修改都由人類在編輯模式執行並使用 Undo／Redo。
- 圖片是原子 media asset。AI 初稿可依明確來源放置選定圖片或圖片說明；建立後的移動、替換、刪除與替代文字均由人類執行。第一版不提供 AI 圖片生成或自動替換。
- 從 Google Docs 複製圖片時，成功的定義是圖片已轉成 OrgMaster 可持久保存的 media asset，重新載入及 readable snapshot 仍可用；若來源無法取得，貼上必須顯示失敗／要求上傳，不得留下短期 blob、登入態網址或假裝已保存的外部圖片。
- 圖片至少可維護說明或替代文字；一般閱讀者可辨識圖片用途，圖片失效時仍看得到可理解占位與說明。
- 連結保留可見文字與目標 URL，僅允許安全協定並清理不安全屬性；無法開啟時顯示可理解狀態。

#### 自由文體與閱讀乾淨度

- 正常閱讀頁只呈現文件身份、標題、正文、必要閱讀狀態，以及按需開啟的章節與職掌對照；不顯示待確認、AI 整理說明、AI 編輯入口、提案、差異或常駐教學。
- 桌面只有一個主要 mutation：「編輯文件」。進入後才顯示必要的儲存狀態與有限格式工具；完成編輯後恢復乾淨閱讀。手機沒有此入口。
- AI 依實際內容選擇表達方式，不要求使用者先選「原則型／程序型」。原則、政策與判斷準則優先保留段落、清單或表格；只有來源清楚表達先後、觸發與結果時才整理成階段或步驟。
- 修正重複編號、標點、章節層級及明顯排版問題屬「編輯整理」；改變責任人、核決權、期限、門檻、例外、紀錄或法令語意屬「制度決策」，沒有人工答案不得自行處理。
- 初稿不插入系統提示、缺口卡片或 AI 說明。若資料不完整，人類在人工審閱時直接補寫或刪改正文；第一版不提供系統化缺口追蹤。

#### 提供公司閱讀的最小 gate

「提供公司閱讀」不是 ISO 核准，但仍是把內容交給員工依循的高影響動作。Current Phase 執行前必須同時成立：

1. 使用者具有 `ManageReadAvailability`。
2. 文件已設定負責人；負責人是日後內容詢問窗口，不代表新增審核／核准流程。
3. working draft 已保存，且沒有 autosave 衝突或內容清理錯誤。
4. 所有圖片已成為可持久讀取的 media asset，所有可見連結已通過安全協定檢查。
5. 使用者在確認畫面看見代碼、標題、負責人、此次快照時間及「內容正確性由本次提供者負責，將以目前草稿取代公司閱讀內容」，再明確確認。

- 任一 gate 失敗時只指出可處理的阻塞項，不產生部分 snapshot，也不把狀態改成可供公司閱讀。
- 停止提供閱讀須顯示「員工將立即無法讀取目前快照，但工作草稿保留」並再次確認；失敗時維持原 snapshot 可讀，不能先隱藏 UI 後宣稱完成。

#### 既有文件轉入與敏感媒體邊界

第一份原型是開發階段對使用者提供 DOCX 的人工內容整理，不代表 Current Phase 已增加 DOCX 匯入或來源追溯能力。正式第一版仍採貼上／輸入／上傳圖片的受控轉入：

- 貼入正文後，使用者先看到內容預覽與無法保真的項目；確認建立時只保存新的 OrgMaster 正文與 media asset，不保存舊代碼、版次、原始檔名、原始章節或來源差異紀錄。
- 原始 DOCX／Google Docs 不因曾被用來整理內容就成為第二份正文權威。系統不承諾修改原檔，也不建立雙向同步。
- 貼入內容若同時包含一般原則與較高敏感度的公司資料，第一版不得用視覺標籤假裝已建立段落級權限。人類須在提供閱讀前選擇整份限制閱讀，或從 working draft 移除／改寫敏感內容後再建立單一 readable snapshot；同篇依讀者切換內容留待 Future Phase。
- 包含姓名、電話或其他敏感資訊的圖片，在提供公司閱讀前必須由人類確認是否可見。只在畫面上疊加遮罩不足以保護原始資產；若不可公開，必須保存已遮蔽的衍生圖片或更換圖片，原始未遮蔽資產不得由 readable snapshot URL 取得。
- Current Phase 不自動辨識或自動遮蔽個資；它只提供可見預覽、圖片替換／刪除及明確 gate。自動偵測、OCR 與遮蔽須待 provider、隱私與錯誤風險另行確認。
- 未明確選入 AI 任務的原始檔、圖片及附件不得送給 AI；只貼入後的文字也不能讓 AI 宣稱理解未選圖片。

#### 主要使用流程

1. 使用者從管理辦法清單選擇「新增管理辦法」，在最小建立輸入中一次提供制度目標、目前已知事實、希望規則及可選的既有內容／附件；此時尚未建立文件，也不預先消耗 `MP-xxxx`。
2. 介面揭露本次會送給 AI 的輸入與選定來源；人類明確執行「產生初稿」，可以在送出前取消。
3. 建立交易成功時配置永久代碼；AI 只依有來源的內容產生含標題、自由正文、清單、表格與選定圖片的初稿。缺少依據的規則直接省略，不插入待確認或 AI 說明。
4. 進入文件後預設為乾淨閱讀。桌面使用者可按唯一主要 mutation「編輯文件」，直接修改文字、日期、數字、標題、表格及圖片；完成後回到閱讀狀態。
5. 使用者按需開啟「對照職掌」；同頁暫時顯示既有職掌／組織唯讀資料，由人類閱讀雙方原文並判斷。
6. 若需修改職掌，前往既有 DEV-031 頁面；返回時恢復原管理辦法與章節位置，不新增第二套職掌編輯器。
7. 指定人類自行確認正文後執行「提供公司閱讀」，以目前 working draft 取代單一 readable snapshot；一般閱讀者只取得該 snapshot、文件負責人及閱讀快照時間。
8. 後續編輯只修改 working draft 並顯示 `有未提供更新`；一般閱讀者繼續看到前次 snapshot，直到人類再次提供公司閱讀或停止提供閱讀。

#### 管理辦法清單與頁面入口

第一版只有兩個主要工作表面：「找一份辦法的清單」與「閱讀／編輯一份完整辦法」，不新增 dashboard、分類維護頁、AI 工作台或文件控制中心。它們可以是同一管理辦法模組內的兩個 route／view state；RD Implementation Contract 依既有導覽慣例固定，不得再擴張頁面數。

- 有 `ReadDraft` 的制度規劃者清單顯示 `MP-xxxx`、標題、衍生狀態、文件負責人、草稿最後修改時間，以及有 snapshot 時的最後提供閱讀時間；不顯示合規分數、完成率、AI 產字量或 KPI 卡片。
- 只有 `ReadReadable` 的一般閱讀者清單僅列出目前有 readable snapshot 的辦法，顯示代碼、標題、負責人及閱讀快照時間；尚未建立的新辦法輸入、建置中草稿及有未提供更新的細節均不可見。
- 清單唯一主要動作是「新增管理辦法」，開啟最小建立輸入；第一版不先要求選原則型／程序型／固定14章模板，也不建立文件類別設定頁。
- 共同搜尋只支援代碼與標題。制度規劃者可按三種衍生狀態做最小篩選；一般閱讀者沒有草稿狀態篩選。第一版不加部門、流程、ISO、內控、負責人多條件篩選或樹狀分類。
- 選取清單列後進入完整文件；返回清單時保留搜尋字、篩選與合理捲動位置。文件間切換不以永久左側文件樹占用正文空間。
- 手機使用同一清單語意但一律唯讀；不顯示新增、編輯、提供／停止提供閱讀或 metadata mutation。使用者沒有可讀項目時，不用空白畫面暗示系統故障。

#### 第一版最小 UX

- 文件畫布是唯一主焦點；閱讀狀態不顯示待確認、AI 操作、AI 說明、格式工具或儲存成功訊號。
- 桌面唯一主要 mutation 是「編輯文件」；進入後才顯示有限格式與必要儲存回饋，完成後全部收起。只保留標題、正文、清單、表格、圖片／說明、連結、有限文字色彩保留與 Undo／Redo，不提供任意字型、字級、浮動排版、自訂 HTML／CSS／JavaScript。
- 文件建立後不顯示 AI 入口、AI chat sidebar、提案、diff、流程建模器、智能引用面板或合規儀表板。
- 「對照職掌」是按需唯讀側欄／分割檢視，不是永久第二欄或新 route；沿用既有 Duty 唯讀元件，同時呈現管理辦法原文與職掌原文，由人類自行比較。
- 頁面只以最小位置呈現 `建置中／可供公司閱讀／有未提供更新`、文件負責人及草稿／閱讀快照修改資訊；一般保存成功不建立通知面板。
- 閱讀模式依 heading 產生章節目錄，圖片可放大；DEV-033 現已統一採至少 1024px、hover＋fine pointer 才可 mutation，其餘只讀。一般閱讀者只看 readable snapshot；原本有草稿權限者可在唯讀裝置閱讀明確標示的 working draft，但不得編輯、提供／停止提供閱讀或執行其他 mutation。

#### 空白、載入、保存與可及性

- 制度規劃者首次進入且沒有文件時，只顯示一句產品用途與「新增管理辦法」；一般閱讀者沒有 readable snapshot 時顯示「目前沒有可閱讀的管理辦法」，不顯示新增入口。
- 搜尋無結果時保留查詢字與狀態篩選，提供清除條件；不得把無結果和無權限混為同一錯誤訊息。
- 文件／清單載入時使用穩定骨架或載入狀態，不先呈現可輸入的假空白文件；載入失敗要保留返回清單與重試入口。
- working draft 使用低干擾自動保存。`儲存中／儲存失敗` 靠近文件狀態顯示；成功後收斂成不搶焦點的「已儲存＋時間」。離開、重新載入或提供閱讀前若仍未保存，必須阻止使用者誤認已完成並給出重試／保留內容路徑。
- 產生初稿的等待狀態只存在建立畫面，可取消且保留輸入；完成後進入文件，文件頁不保留 AI 狀態。職掌對照關閉或返回後，焦點回到原按鈕／章節。
- heading 使用可供輔助科技理解的層級，表格可鍵盤瀏覽，圖片具替代文字／說明；「編輯文件」與「完成編輯」可由鍵盤操作並保有清楚焦點。
- 窄畫面表格可在表格容器內水平捲動，不造成整頁水平溢出；圖片燈箱、目錄與唯讀 deep link 仍須可鍵盤關閉／返回。手機不能透過快捷鍵、外接鍵盤或直接 URL 進入 mutation。
- 正常成功狀態不使用 toast 連發、常駐教學卡或永久狀態面板；只在失敗、未保存、未提供更新或破壞性動作時增加必要提示。

#### 按需職掌對照行為

- 使用者從所在章節開啟「對照職掌」；可明確改為整份文件，不在背景自動掃描。
- 對照面板先顯示既有 Duty／Responsibility 原文與來源職位，支援沿用既有搜尋／部門篩選能力縮小範圍；人類不需先執行 AI 才能閱讀比較。
- 第一版不提供 AI 一致性判斷、建議、過期結果或忽略功能；資料不足時只顯示實際可讀來源，不推導結論。
- 前往既有職掌頁時攜帶管理辦法 ID 與章節 anchor；返回只恢復 UI 上下文，不建立正文到 Duty 的永久智能引用。

#### 失敗與降級原則

| 情境 | 第一版可見結果與恢復 |
|---|---|
| 產生初稿時 AI 不可用、逾時或取消 | 保留建立輸入且不配置代碼；允許重試，不產生空白文件 |
| AI 初稿回傳無法解析或遺漏選定圖片／表格 | 不建立文件或配置代碼；保留輸入與明確失敗狀態 |
| working draft autosave 衝突 | server 以 CAS 回 409；不以舊內容覆蓋新內容，client 保留人工內容並提供複製未保存內容／重新載入路徑，不做自動 merge |
| 職掌／組織對照來源讀取失敗 | 文件仍可編輯；對照面板顯示失敗與重試，不把無資料解讀為一致 |
| 圖片來源失效 | 保留可辨識占位與圖片說明，不自動替換 |
| 停止提供公司閱讀失敗 | 一般閱讀狀態不得假裝已移除；保持原 snapshot 並顯示重試 |

任何工作草稿或保存失敗都不得改變一般閱讀者所見的 readable snapshot。這是 Current Phase 的最高內容安全不變量。

#### Current Phase Scope

- 管理辦法清單、代碼／標題搜尋、制度規劃者的三狀態篩選，以及依能力區分草稿清單與公司可閱讀清單。
- 未編號的最小建立輸入成功提交後才配置永久 `MP-xxxx`；代碼只含文件類別與流水號，建立後不可修改、釋放或重用。
- 人類一次輸入與 AI 一次完整初稿生成；不含訪談、逐題追問、固定問卷、缺口標示或文件內 AI 編輯。
- 原則／程序文體保護；缺少依據的制度規則直接省略，不產生正文外提示或編製佇列。
- 乾淨閱讀與桌面「編輯文件」模式；有限人工編輯、Undo／Redo 及必要儲存回饋。
- 自由正文的有限語意格式：標題、段落、清單、表格、圖片／說明及連結；以成熟嵌入式 editor 實現，不自製完整文書排版引擎。
- Google Docs 單向複製貼上的基本內容保真、不安全內容清理，以及圖片轉為持久 media asset 或明確失敗；OrgMaster 是唯一持續編輯正文。
- `MP-xxxx`、標題、working draft、零或一份 readable snapshot、media、owner、draft／readable 修改資訊及三種衍生畫面狀態的概念邊界。
- 缺少負責人、未保存內容、未持久化 media 或不安全連結阻擋提供公司閱讀的最小 gate；不包含制度正確性自動檢查。
- `CreateMethod／ReadReadable／ReadDraft／EditDraft／ManageReadAvailability／ManageMetadata` 能力、一般閱讀者不知悉草稿存在，以及手機移除所有 mutation 的產品邊界。
- 以整份 Management Method／單一 readable snapshot 套用閱讀能力；混合敏感度內容在提供閱讀前由人類整份限制或移除敏感內容，不把視覺機密標籤當成段落級授權。
- 產生初稿時的明確上下文範圍與來源揭露；AI 不讀取 Organization／Duty／Responsibility。
- 按需職掌唯讀對照及回到既有職掌頁的上下文保存；不提供 AI 語意差異判斷。
- 自動目錄、圖片放大、桌面編輯與手機唯讀。
- 既有內容以貼上／輸入／上傳圖片轉入，敏感圖片在提供閱讀前由人類確認；不可公開時使用已遮蔽衍生資產，不以 CSS 視覺遮罩當作資料保護。

#### Out of Scope

- AI 訪談、逐題追問、聊天式澄清、固定問卷，以及因資料未回答完整而阻擋產生初稿。
- `待確認／已處理` 標記、缺口清單、編製佇列、文件內 AI 編輯、章節改寫、差異提案、接受／拒絕與 AI 套用恢復點。
- 完全取消人類直接編輯，或要求所有小修改必須經 AI。
- 對建立後的文件進行任何 AI 全文／章節改寫、背景自動改寫、定時監控或無人確認套用。
- AI 自動建立／修改職掌、配置職位、決定制度、發布文件、判定一致、判定 ISO／內控符合或把推測當成公司事實。
- 正文段落到 Work Item、Position、Employee、ISO／內控條文、Control Point、Evidence Requirement 或其他物件的智能引用。
- Method Stage／Method Step、固定14章必填模板、流程建模、責任投影、組織圖精確 block 往返及被引用資料刪除阻擋。
- 由 DEV-032 取代 DEV-031、把責任配置移入組織圖模式、修改 Duty domain 或新增第二套職掌編輯器。
- dashboard、KPI／完成率卡片、文件分類維護頁、部門／流程／組織階層文件樹、模板選擇器及合規分類瀏覽器。
- AI 在背景搜尋整個 Google Drive、郵件、其他管理辦法或未選取組織／職掌資料；AI 圖片生成、自動理解未選圖片或自動替換圖片。
- 自動 OCR、個資偵測／遮蔽及 AI 自動判斷圖片可否提供公司閱讀。
- Google Docs／Word 雙向同步、DOCX 匯入／匯出、來源追溯、PDF／列印排版、任意 HTML／CSS／JavaScript 或文件專屬互動程式。
- 多份 readable snapshot 歷史、任意歷史版選取、差異比較、排程生效、有效期限、閱讀簽收、會簽、評論及多人同時協作編輯。
- 配置永久代碼後的硬刪除、代碼釋放／重用、文件封存／還原，以及依部門、流程、年份、版本或合規條文改號。
- 新的權限管理頁、自訂角色設計或另一套登入／身分系統；Current Phase 只定義所需能力，實際映射沿用 DEV-027 並於 RD Implementation Contract 固定。
- 段落級／Content Block 級閱讀權限、同篇多個讀者版本、依讀者動態遮罩或只靠前端收合／隱藏保護機密內容。
- 正式文件 revision、審核／核准、生效／失效／取代、合規維護責任及其他 ISO／內控制度物件。
- production AI provider、正式 credential、遠端資料、部署與 release。

#### 產品驗收摘要（正式 trace 見 RD Implementation Contract）

- 取消或關閉尚未提交的新辦法輸入不產生或消耗代碼；成功產生初稿後才取得唯一 `MP-xxxx`，之後改標題、改負責人、提供／停止公司閱讀均不改號，停止閱讀的號碼也不會被下一份文件重用。
- 制度規劃者能在清單依代碼／標題找到建置中、可供公司閱讀及有未提供更新的文件；一般閱讀者只看得到有 snapshot 的文件，不能由清單、搜尋、無權限訊息或 deep link 推知草稿存在。
- 制度規劃者能一次提供制度目標、事實或既有內容，由 AI 完成原則型、程序型及含表格／圖片三種管理辦法初稿，不必從空白頁逐字撰寫或理解固定14章。
- 資料不足或互相衝突時，AI 仍可完成有依據的初稿，但必須省略沒有依據的制度規則；不得反問、自行創造公司事實，或在正文插入 `待確認`、警告卡與編製佇列。
- 原則型內容不被強迫拆成流程；AI 初稿不得改變使用者已提供的核決權、責任、期限、門檻或例外。需要人類決定的內容由人類在一般「編輯文件」模式自行補寫。
- 產生初稿前，使用者能辨識本次送出的目標、事實、既有內容與明確選取來源；未選取的 Drive、其他管理辦法、職掌、組織或圖片不得被背景加入。
- 第一版一般文件頁不存在 AI 訪談、逐題問答、聊天式澄清、固定問卷、`待確認`、AI 編修、修改提案、接受／拒絕或差異預覽。
- 使用者不依賴 AI 也能直接修正文字、日期、數字、標題、表格與圖片；AI 失敗、逾時或不可用時不會鎖住文件。
- 重新載入、autosave 競合或保存失敗不會丟失已保存原文，且 readable snapshot 不受 working draft 影響；第一版不建立 AI 套用恢復點。
- 使用者能按需在同頁查看相關職掌原文，前往既有職掌頁再返回時保留章節與比較上下文；由人類閱讀雙方資料後判斷是否修改，不產生 AI 一致性結論。
- 新文件沒有 readable snapshot 時，一般閱讀者看不到 working draft；內容是否足以提供公司閱讀由被授權人類負責，系統不以 `待確認` 數量代替制度判斷。
- 首次提供公司閱讀後建立單一 snapshot；後續修改只讓編輯者看到 `有未提供更新`，一般閱讀者仍看到前次 snapshot，直到再次提供公司閱讀。
- working draft 移除或替換圖片後，前次 readable snapshot 的圖片與說明仍能正常閱讀；只有不再被草稿或 snapshot 引用的 media 才可進入後續清理。
- 人類編輯與 Google Docs 貼上不得意外遺失未選表格、圖片與連結；表格、圖片或連結保存失敗時需明確顯示，不得假裝成功。
- 指定人類能把 working draft 還原為目前 snapshot，或停止提供公司閱讀；AI、一般閱讀者與手機不得執行這些動作。
- 提供公司閱讀前會檢查能力、文件負責人、最新草稿已保存、media 已持久化及安全連結；任一失敗不產生部分 snapshot。內容正確性及完整性由執行提供的人類負責，不以 AI 或系統狀態代為背書。
- Google Docs 貼上的標題、清單、表格與圖片仍可閱讀編輯，不插入 script 或不安全 HTML；貼入圖片在重新載入與 snapshot 中仍可用，無法持久化時明確失敗而非留下短期網址。OrgMaster 與 Google Docs 不宣稱同步。
- 既有 DOCX／Google Docs 轉入後只形成新的 OrgMaster 正文，不建立舊檔追溯或第二份權威；若圖片含不可公開個資，readable snapshot 及其 asset URL 只能引用已遮蔽衍生圖片，不能只靠顯示層遮罩原圖。
- 既有內容若混合一般原則與機密文字，介面不把機密標籤、收合或遮罩宣稱為段落級授權；人類可整份限制閱讀、先移除機密文字再提供單一 snapshot，或保留建置中，且 AI 不替人類選擇。
- 桌面／筆電依既有治理條件顯示單一「編輯文件」入口；手機同一 deep link 只讀且不存在編輯、產生初稿、狀態切換或其他 mutation path。一般閱讀者只讀 snapshot；有草稿閱讀權限者可讀但不能修改 working draft。
- 空清單、搜尋無結果、初稿產生等待、autosave 失敗及返回上下文都有可理解且可恢復狀態；主要流程能由鍵盤操作，heading、表格、圖片說明可被輔助科技理解。
- 第一版效用以「輸入到可用初稿時間、重大事實錯誤數、人類修正時間、進入／完成人工編輯成功率及圖文保存失敗數」衡量，不以生成字數或 AI 正確率宣告完成。

#### 已確認概念原型與正式 QA 轉換

決策：`Human Concept Accepted / Two Prototypes Sufficient / Third Prototype Cancelled / 2026-08-25`。

兩份真實原型已涵蓋程序型／含圖片與原則型內容，足以確認「自由文件、閱讀優先、單一人工編輯、手機唯讀、無待確認與文件內 AI 編修」的產品方向。第三份概念原型不再製作，也不再是 RD maturity gate。

不同 Google Docs 表格／圖片情境仍會影響 editor、paste sanitation、media persistence 與 readable snapshot 正確性，因此改為正式 RD／QA 自動化 fixture；它只驗證產品實作，不需要第三次人類概念確認。

正式任務式驗證至少包含：取消未提交建立且不消耗代碼、一次輸入產生初稿、資料不足時不追問也不插入 `待確認`、代碼／標題搜尋、單一「編輯文件」修正內容、Undo／Redo、Google Docs-style 表格／圖片貼上後重新載入、首次／再次提供與停止閱讀、一般閱讀者不可得知草稿、按需職掌唯讀對照，以及手機完全唯讀。紀錄開始到初稿時間、重大事實錯誤、人類修正時間、編輯成功率、圖文破壞、gate 失敗原因及需協助位置；不以生成字數作效益。

第一份真實原型結果（2026-08-25）：

- 入口：`output/dev032-ai-native-prototype/people-expansion-v1/index.html`
- 證據：`output/dev032-ai-native-prototype/people-expansion-v1/manifest.md` 與 `output/playwright/dev032-ai-native-first/`
- AI 依原文件語意整理為自由長文件與六個連續階段，只修正原文件重複的階段編號；沒有新增核准、期限、控制或責任規則，也沒有建立固定 14 章、Stage／Step 資料或段落智能引用。
- 原文件的權責、執行原則、表格化閱讀及兩張操作範例圖均保留；招募訊息範例的姓名與電話在原型顯示層遮罩。該遮罩只證明視覺概念，原始測試 asset 仍含來源內容，不計入 production 個資保護通過。
- 原文件中的制度歧義未被 AI 補造答案；精簡版不再把它們做成 `待確認` 卡片，也不以缺口數量阻擋乾淨閱讀。內容由人類進入一般「編輯文件」模式自行修正。
- 原型已移除 AI 編修、提案、差異、逐項直接修改及 AI 整理說明；1440×900 桌面顯示單一「編輯文件」，進入後 41 個正文目標可編輯，完成後回到 0；390×844 手機沒有編輯入口、可編輯節點為 0、無水平溢出，console 0 error／0 warning。
- 使用者已確認精簡概念原型 OK；此結果仍不等於正式任務式 UX、AI provider、持久化、Google Docs media ingest、權限隔離或 working draft／readable snapshot 已完成。

第二份真實原型結果（2026-08-25）：

- 入口：`output/dev032-ai-native-prototype/ai-mentor-principles-v1/index.html`
- 證據：`output/dev032-ai-native-prototype/ai-mentor-principles-v1/manifest.md` 與 `output/playwright/dev032-ai-native-second/`
- AI 把《鉦富 AI 導師使用指導書》保留為目的、原則、工具、Prompt 與維護說明；近期／中期／長期只作策略時間範圍，沒有新增流程總覽、執行階段、Stage／Step、Work Item 或固定 14 章。
- 來源中的財務數值與已知不符合事項以紅字標示且明示為機密。原型 DOM 不保存實際數值或細節，只顯示受限內容提醒；來源副本與原始結構抽取檔於整理完成後移除。
- 真實案例確認 Current Phase 不應為一篇混合敏感度文件新增段落級權限。第一版只允許整份限制閱讀、先移除機密內容再建立單一 readable snapshot，或保留建置中；視覺標籤、收合或遮罩不構成授權控制。
- 閱讀範圍、外部模型可接收資料、Prompt 固定／個人化邊界及公司背景更新方式仍是人類需判斷的制度內容，但精簡版不把它們呈現為 `待確認` 功能或閱讀卡片。
- 原型已移除 AI 編修、提案、差異與逐項直接修改控制；1440×900 桌面顯示單一「編輯文件」，進入後 25 個正文目標可編輯，完成後回到 0；390×844 手機沒有編輯入口、可編輯節點為 0、無水平溢出，console 0 error／0 warning。
- 此結果目前可標示 `Minimal Reading-First Prototype Revised / Technical UI Re-QC Passed / Human Concept Accepted`；尚未證明正式權限、context redaction、持久化或真人修正負擔。

本機 RD 執行時，任一情況成立即停止並回到 PM／Contract：

- 正常閱讀頁仍顯示 `待確認`、AI 編修、修改提案、差異、接受／拒絕或常駐編製工具，干擾連續閱讀。
- 取消尚未提交的新辦法輸入仍消耗代碼、既有代碼可被修改／重用，或使用者必須先理解部門／流程／階層編碼才能建立文件。
- 任何建立或修改流程仍出現 AI 訪談、逐題問答、聊天式澄清、固定問卷，或因資料未回答完整而不能產生初稿。
- AI 自行補造責任、時限、核准、例外或執行紀錄，或把沒有依據的內容改成 `待確認` 卡片留給閱讀者。
- AI 在沒有明確揭露與選取時讀取其他文件、Drive、職掌、員工或圖片，或使用者無法知道此次送出的資料範圍。
- 修改兩個字、日期、數字、表格或圖片仍被迫經過 AI。
- 人工編輯、保存失敗或重新載入會造成原文／圖片／表格／連結遺失，或 Google Docs 圖片只能靠短期外部網址存活。
- working draft 的未提供修改會出現在一般閱讀畫面，或停止提供閱讀時 UI 宣告成功但快照仍可讀。
- 一般閱讀者能由清單、搜尋、狀態訊息或 deep link 推知／讀取建置中草稿，或手機仍可經隱藏控制、快捷鍵與直接 URL mutation。
- 對照職掌必須跨多頁記憶原文，或畫面以 AI 結論取代人類查看雙方原文。
- 單一「編輯文件」入口無法由鍵盤使用，完成編輯後仍殘留編修狀態，或手機存在任何 mutation path。
- 兩份已確認內容與正式 table／image fixture 中，AI 初稿普遍比人工直接撰寫更費力，且沒有可觀察的初稿時間或修正負擔改善。

#### RD Implementation Contract 與交付狀態

Current Phase 已達 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending`；authoritative contract：`ai-doc/specs/DEV-032-management-method-system.md`。

契約已固定 Tiptap 3 OSS、OpenAI Responses provider adapter、獨立 Management Method store、自由 editor JSON、永久代碼交易、working draft＋單一 readable snapshot、media、固定 API/CAS、DEV-027 catalog sync、Duty read adapter、scoped desktop mutation gate、failure recovery、正式 acceptance 與 evidence。第三份原型已取消。

RD 已依 S0 dependency/schema → S1 governance → S2 store/API → S3 media/editor → S4 AI create → S5 UI/Duty → S6 mobile/security → S7 regression/handoff 完成。每一 slice 的檔案 allowlist、gate、targeted tests、完整 regression、browser runtime lifecycle 與 evidence path 已寫入 spec；本機 handoff 證據見 `output/playwright/dev032/manifest.md`。

本機產品程式、測試與 evidence 已完成；未建立正式 credential、未送出真實公司資料，也不產生 deploy／release artifacts。OpenAI real-data retention／額度、正式 identity、durable backend、media storage、deploy 與 production smoke 由 release gate 處理。

#### Future Phase Capsule

`Future Phase Captured / Not Requested`：文件內 AI 編修、差異提案、`待確認`／缺口追蹤、既有完整文件的受控全文重整、背景一致性監控與大範圍 AI 差異掃描；只有乾淨閱讀與人工編輯已由真人任務證明可用、實際修正或比對成本仍高，且重大事實錯誤率可接受時才重新進入。

`Future Phase Captured / Not Requested`：正文智能引用、stable business block identity、Method Stage／Step、Work Item／Position relation、責任投影及精確往返；只有公司需要可保證的跨視角同步時才重新評估。

`Future Phase Captured / Not Requested`：正式受控文件 revision、審核／核准、生效／失效／取代及 ISO／內控對照治理；首次 ISO 正式文件管制、多人核准或歷史有效版本需求成立時另補 contract。屆時可把當下 readable snapshot 作為新治理的起始內容，但不預設回補 Current Phase 沒有保存的歷史版本。

`Future Phase Captured / Not Requested`：文件封存／還原、永久刪除、類別擴充與多維分類瀏覽；只有文件數量或治理要求使單純代碼／標題搜尋不足時才重新進入，且既有 `MP-xxxx` 不改號、不重用。

#### Spec Governance 結論

- 使用者於 2026-08-25 進一步要求移除全部 `待確認` 與文件內 AI 編修，這是對無訪談 AI 編修版的 `Intentional replacement`。Current Phase 新權威為：AI 只在建立時依人類一次輸入產生初稿；一般文件頁以乾淨閱讀為主，桌面只保留單一人工「編輯文件」，手機唯讀，人類對事實、制度與閱讀狀態當責。
- DEV-031 仍是現行職掌產品基線；按需對照只讀既有資料，不建立第二套職掌編輯器或跨 domain mutation。
- 前一輪 detail continuation 對 AI 輔助編製方向仍屬 `Compatible refinement`，並取代「單一 mutable body 搭配建置中／可供閱讀文字狀態」的模糊假設：Current Phase 固定使用 working draft＋零或一份 readable snapshot，畫面狀態由兩者關係推導。
- 最低 `建置中／可供公司閱讀／有未提供更新`、提供／停止提供閱讀屬 Current Phase 安全邊界；AI 套用前恢復點因第一版沒有文件內 AI 套用而移除，完整 revision／approval lifecycle 仍是 Future Phase。
- surface／context／access continuation 對現行方向仍屬 `Compatible refinement`：保留最小清單、永久代碼配置、初稿來源揭露、表格／圖片／連結保護、概念能力與空白／錯誤／可及性邊界；不恢復已被取代的模板、智能引用、流程資料模型或閱讀頁編製工具。
- 第一份原型確認後仍有效的收斂是自由文體保護、提供閱讀 gate，以及既有文件與敏感媒體邊界；影響優先缺口、`待確認` 處理語意、AI 編修與差異提案均已移出 Current Phase。Current Phase 不增加正式 issue lifecycle、DOCX 匯入、來源追溯、自動個資辨識或核准流程。
- 第二份原則型原型是 `Compatible refinement`：證明不需文件類型選擇器即可依語意保留原則／Prompt 寫法，並把混合敏感度案例收斂為整份文件權限；段落級授權、同篇多 snapshot 或動態遮罩均不回填 Current Phase。
- 使用者確認兩份精簡原型並取消第三份原型，屬 `Intentional replacement`：概念驗證 gate 已完成，不同表格／圖片情境轉為正式 QA fixture，不再要求第三份人類原型確認。
- 舊 `output/playwright/dev032-prototype/manifest.md` 及下方兩段 Superseded 設計只作歷史證據，不能支撐本 Current Phase 驗收。
- `ai-doc/specs/DEV-032-management-method-system.md` 現為 authoritative RD Implementation Contract；Tiptap／OpenAI、獨立 store、自由 editor JSON、代碼、snapshot、media、固定 API、DEV-027 catalog sync、Duty adapter、scoped capability、S0–S7、failure 與 evidence 均已固定，狀態升級為 `RD Implementation Ready`。正式 provider credential／額度與 production backend 只屬 release re-entry，不是本機 RD blocker。
- `ADR not needed`：Current Phase 邊界仍位於單一管理辦法 module，正式 revision lifecycle、跨服務正文權威與外部同步均未進入；若其一成立再建立 ADR。

#### Current Change Record

- 2026-08-25：依 `USER-2026-08-25-DEV032-IMPLEMENTATION-EXECUTED` 完成本機 S0–S7。新增獨立 Management Method V1 domain／store／API／media、Tiptap 3 editor／reader、paste sanitizer、fake＋OpenAI adapter、Duty read adapter、DEV-027 catalog sync、desktop mutation gate 與 50 files／226 tests；`npm run build` 與 1440×900／1024×768／390×844 browser QC 通過，證據見 `output/playwright/dev032/manifest.md`。狀態升級為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending`；正式資料、credential、deploy 與 release 仍未執行。
- 2026-08-25：依 `USER-2026-08-25-DEV032-IMPLEMENTATION-READY` 將同一份 authoritative spec 升級為 `RD Implementation Ready`。固定 Tiptap 3 OSS、OpenAI Responses adapter、structured draft envelope、資料大小／timeout／retention gate、固定 API routes、DEV-027 compatible permission sync、1024px＋hover＋fine-pointer scoped edit gate、repo/file allowlist、V1 store／media migration/recovery、S0–S7、test/build/browser evidence 與 release feasibility。DEV-032 由待排改為可執行；本輪仍只修改文件，未修改產品、正式資料、credential、deploy 或 release。下列紀錄均是當時狀態的歷史證據。
- 2026-08-25：依 `USER-2026-08-25-DEV032-CONCEPT-ACCEPTED-NO-THIRD-PROTOTYPE` 記錄使用者確認兩份精簡閱讀優先概念原型，取消第三份概念原型，並將不同表格／圖片情境轉為正式 QA fixture。建立 `ai-doc/specs/DEV-032-management-method-system.md`，固定獨立 Management Method store、自由 editor JSON、永久代碼交易、working draft＋單一 readable snapshot、provider-neutral AI 初稿、media、API/CAS、DEV-027 permission mapping、Duty read adapter、failure recovery 與 evidence contract；DEV-032 升級為 `RD Contract Ready / Implementation Planning Required`。本輪只修改文件與原型證據狀態，未修改正式產品、schema、資料、credential、deploy 或 release。下列紀錄均是當時狀態的歷史證據，其中的 `Brief Ready`、待人類確認、訪談或 AI 編修不得解讀為現行狀態。
- 2026-08-25：依 `USER-2026-08-25-DEV032-MINIMAL-READING-FIRST`，以 `Intentional replacement` 移除 DEV-032 Current Phase 的全部 `待確認` 標記／清單／處理流程及文件內 AI 編修、提案、差異與接受／拒絕。AI 第一版只在人類一次提交建立資訊後產生初稿；一般文件頁預設乾淨閱讀，桌面僅保留單一人工「編輯文件」入口，職掌只供人類按需對照，手機完全唯讀。兩份 HTML 原型均通過 1440×900／390×844 Chromium 重驗：桌面只顯示單一編輯入口，完成後可編輯節點歸零；手機沒有編輯入口、`contenteditable` 為 0、無水平溢出，console 0 error／0 warning。文件維持 `Brief Ready`，不新增 ADR／spec，未修改正式產品、schema、API、persistence、權限、deploy 或 release；下列較早紀錄只作歷史決策證據，不能作 Current Phase 實作依據。
- 2026-08-25：依 `USER-2026-08-25-DEV032-ABANDON-AI-INTERVIEW`，以 `Intentional replacement` 取消 DEV-032 Current Phase 的 AI 訪談、逐題追問、聊天式澄清與固定問卷。建立新辦法改為人類一次提供目標／事實／既有內容並明確執行「產生初稿」；AI 直接生成自由多媒體草稿與影響排序的 `待確認`，資料不足時不得反問或補造事實。後續保留直接修改與選取內容／目前章節的單次 AI 編修指令。兩份 HTML 原型已移除訪談 UI，並通過 1440×900／390×844 Chromium 重驗：AI 編修提案、直接修改、手機零可見 mutation／零 `contenteditable`、無水平溢出及 console 0 error／0 warning；人類重新確認仍待進行。此變更維持 `Brief Ready`，不新增 ADR／spec，未修改正式產品、schema、API、persistence、權限、deploy 或 release。下列較早的訪談版紀錄只作歷史決策證據，不能作 Current Phase 實作依據。
- 2026-08-25：依 `USER-2026-08-25-DEV032-SECOND-PRINCIPLE-METHOD-PROTOTYPE`，以使用者提供的《鉦富 AI 導師使用指導書》完成第二份真實 HTML 原型。內容保留為目的、使用原則、工具、Prompt、策略時間範圍與維護說明，沒有流程化、Stage／Step 或智能引用；四項待確認聚焦閱讀範圍、外部模型資料、Prompt 個人化邊界與背景更新。來源機密紅字的實際數值／細節未進入原型，並由案例新增「Current Phase 只做整份文件權限，不做段落級權限或同篇多版本」邊界。1440×900／390×844 Chromium、清單搜尋、章節、AI 單題確認、直接微調、職掌空狀態、手機零 mutation、零水平溢出及 console 0 error／0 warning 通過；證據見 `output/dev032-ai-native-prototype/ai-mentor-principles-v1/manifest.md`。狀態為 `Technical UI QC Passed / Human Concept Evaluation Pending`，文件仍維持 `Brief Ready`；未修改正式產品、schema、API、persistence、權限、deploy 或 release。
- 2026-08-25：依 `USER-2026-08-25-DEV032-FIRST-PROTOTYPE-ACCEPTED-DETAIL-CONTINUATION` 記錄使用者確認第一份原型方向 OK，狀態更新為 `Human Concept Accepted / Technical UI QC Passed / Task-based Evaluation Pending`。由原型結果補齊 AI 影響優先單題排序、原則／程序文體保護、`待確認` 的人類處理路徑、提供公司閱讀最小 gate、既有文件受控轉入、敏感圖片不能只靠顯示層遮罩的邊界，以及三份樣本選取／證據矩陣。此為 `Compatible refinement`，文件維持 `Brief Ready`；未建立正式 issue lifecycle、DOCX import、來源追溯、OCR／個資遮蔽、schema、API、spec、ADR 或產品實作。
- 2026-08-25：依 `USER-2026-08-25-DEV032-FIRST-REAL-METHOD-PROTOTYPE`，以使用者提供的《人員增補管理程序》完成 AI-native Current Phase 第一份真實 HTML 原型。原型保留自由正文、權責表格與圖片，將重複階段編號整理為六階段，標出七項待確認而不補造制度事實，並提供清單／搜尋、章節抽屜、AI 單題訪談、最小直接微調、職掌對照空狀態及手機唯讀。1440×900／390×844 Chromium UI QC 與 console 檢查通過，證據見 `output/dev032-ai-native-prototype/people-expansion-v1/manifest.md`；未修改正式產品、schema、API、persistence、權限、deploy 或 release。其後使用者已確認概念方向 OK，完整任務式評估仍待進行。
- 2026-08-25：依 `USER-2026-08-25-DEV032-BRIEF-SURFACE-CONTEXT-ACCESS-DETAILS` 補齊管理辦法清單與建立入口、`MP-xxxx` 配置／不可變／不重用、AI 上下文選取與來源揭露、表格／圖片／連結保護、五項概念能力、手機 capability gate，以及空白／載入／保存／可及性與相應原型停止條件。此次為 `Compatible refinement`；文件仍為 `Brief Ready`，未建立 schema、API、spec、ADR 或修改產品程式。
- 2026-08-24：依 `USER-2026-08-24-DEV032-AI-NATIVE-BRIEF-DETAIL-CONTINUATION` 補齊 AI 訪談的現況／目標／待確認語意、單一待決提案與失效條件、按需職掌對照來源、失敗降級、working draft＋單一 readable snapshot 狀態模型，以及三類代表文件的原型任務與停止條件。此次為 AI-native Current Phase 的 `Compatible refinement`；文件維持 `Brief Ready`，未建立 spec／ADR 或修改產品程式。
- 2026-08-24：依 `USER-2026-08-24-DEV032-AI-NATIVE-INTERVIEW-HUMAN-ACCOUNTABILITY` 將 DEV-032 收斂為 AI 原生制度訪談與編製系統。新增人類對事實、制度與提供公司閱讀的完整當責、最小直接微調、AI 套用前恢復點、建置中／可供公司閱讀及按需職掌對照；移除既有文件無範圍全文重寫作為第一版正常路徑。文件維持 `Brief Ready`，未修改產品程式、schema、API、persistence、測試、deploy 或 release。

### Superseded Previous Current Brief（不可作 Current Phase 實作依據）

以下直到 `### Superseded Design Record` 之前，保留前一版「人類自由編輯為主、AI 按需輔助」Brief 的問題、流程、scope 與驗收。凡與上方 Current Authoritative Brief 衝突者均已被取代，不得作為第一版 scope、驗收、原型 gate 或 RD handoff 依據。

### 簡化自由文件與 AI 語意編輯（歷史）

決策狀態：`Human Confirmed / Intentional Replacement / 2026-08-24`。

本節是 DEV-032 第一版唯一 Current Phase 權威。第一版不再把管理辦法正文拆成可與 Work Item／Position 綁定的智能區塊，也不以固定14章、Method Stage／Method Step、Quality Requirement、Control Point、Evidence Requirement 或 Presentation Configuration 作為產品資料模型。既有組織與職掌仍維持自己的結構化權威；AI 只讀兩邊語意並提出建議，人類負責最後判斷。

#### 真正問題與使用者價值

鉦富機械需要先降低建立與維護管理辦法的門檻，而不是先完成一套複雜的制度知識圖譜。第一版成功條件是制度規劃者能像使用一般文件一樣自由寫作，AI 能有效減少起草、改寫、整理與人工比對時間，而且不會在未經確認時改寫正文、職掌或組織資料。

第一版產品承諾固定為：

> OrgMaster 集中保存管理辦法，AI 協助人類用語意建立、修改並比較管理辦法與現有職掌；系統只提示可能不一致，不保證兩者自動同步。

使用思考習慣：#簡化、#效用理論、#限制條件

#### Current Phase 系統描繪

```text
Management Method（OrgMaster 草稿正文權威）
  ├─ 自由 rich-text／多媒體內容
  ├─ AI 起草／改寫／整理
  ├─ 修改前後差異與人類接受／拒絕／復原
  └─ 自動章節目錄＋圖片放大

Organization／Duty／Responsibility（既有結構化權威）
  └─ 只讀提供 AI 語意比較

AI Semantic Check
  └─ 可能不一致建議 → 修改正文／前往既有職掌頁／忽略
```

權威邊界：

- Management Method 只保存自由正文與最小 metadata，不保存正文段落到 Work Item、Position、Employee、ISO／內控條文或其他物件的關聯。
- 組織、工作事項／職掌及責任配置繼續由既有 organization domain 與現行 DEV-031 產品基線管理；DEV-032 不新增寫入路徑，也不取代 DEV-031。
- AI 可在使用者明確觸發時讀取管理辦法與既有組織／職掌資料做語意比較，但不能自動建立、合併、刪除或修改 Work Item、責任配置、Position 或 Employee。
- 語意比較是機率性建議，不是同步、合規判定、職責分離判定或自動錯誤阻擋；畫面不得使用「已同步」「完全一致」「符合 ISO／內控」等誤導狀態。
- OrgMaster 的建置中草稿正文是系統內內容權威；Google Workspace 用於登入、來源資料、附件、備份及外部討論，不建立 Google Docs 雙向同步或第二份正文權威。

#### 最小資料概念（Brief 層，不是 schema）

```text
Management Method
  ├─ permanentId
  ├─ MP-xxxx
  ├─ title
  ├─ body（編輯器原生文件內容）
  ├─ media assets
  ├─ draft label
  └─ updatedAt
```

- 編輯器內部可使用節點、段落或操作識別支援選取、差異、Undo 與未來擴充，但它們不具有 Work Item／控制點等業務語意，也不形成使用者可見的智能引用。
- 第一版不建立 `MethodStage`、`MethodStep`、`ContentBlock` 業務主檔、`PresentationConfiguration`、`AIChangeSet` 持久化物件或文件 revision／lifecycle。
- AI 修改建議可採 transient proposal；未接受前不得改變正文，接受後仍須能由同一編輯 session Undo。是否保存 AI proposal 歷史留待 RD Contract 依隱私、成本與失敗恢復需求決定。

#### 主要使用流程

1. 使用者新增或開啟 `MP-xxxx` 建置中草稿，在單一完整編輯頁自由輸入或從 Google Docs 複製內容。
2. 使用者直接編輯文字、標題、清單、表格、圖片、圖片說明與連結；不需先選章節模板、流程類型或關聯物件。
3. 使用者可選取文字或整份文件呼叫 AI，提出起草、改寫、縮短、補充、重組、轉清單／表格或校正文意等指令。
4. AI 顯示修改前後差異及簡短原因；使用者接受、拒絕或局部微調。一般成功不產生常駐通知，套用後保留 Undo。
5. 使用者按需觸發「檢查與職掌是否可能不一致」；AI 只讀目前組織／職掌，列出正文說法、比較依據及建議，不自動改任一權威資料。
6. 使用者可選擇修改管理辦法、前往既有職掌頁自行處理或忽略；忽略不是合規例外，也不產生警示債務或阻擋保存。
7. 閱讀模式依實際 heading 自動產生章節目錄，圖片可放大；手機只提供同一份內容的唯讀閱讀。

#### AI 語意編輯行為契約

第一版 AI 能力：

- 依使用者目的產生初稿或補充指定內容。
- 改寫選取文字或整份文件，並保留表格、圖片與基本格式不被非預期刪除。
- 將文字整理為標題、清單或表格，或對既有表格內容提出修改。
- 以既有組織、工作事項、責任配置與職位名稱作唯讀語意比較，提出「可能不一致」及比較依據。
- 顯示 before／after、修改範圍及簡短 reason；人類接受後才套用，拒絕不改正文。

第一版 AI 禁止：

- 背景自動改寫、定時自動同步或在沒有使用者動作時產生永久警示。
- 自動修改組織、職掌、責任配置、ISO／內控參考資料或文件代碼。
- 把推測當成既有公司流程、責任或合規事實。
- 以生成任意 HTML／CSS／JavaScript、iframe 或遠端 script 的方式建立文件功能。
- 隱藏修改、直接覆寫整份正文，或把 AI 工作量90%誤用為正確率／自動核准目標。

#### 第一版最小 UX

- 單一管理辦法完整編輯頁是唯一主焦點；不新增正文智能關聯面板、流程建模器、合規儀表板或永久 AI chat sidebar。
- AI 入口採按需方式：選取文字時顯示最小編輯動作，全文指令由頁面單一 AI 入口啟動；沒有有效選取或指令時不常駐大面板。
- AI 結果靠近受影響內容呈現差異、接受與拒絕；責任、核准、時限、品質／安全／法令／內控文字若被更動，差異必須可見，但第一版不建立自動高風險語意分類器。
- 閱讀增強第一版只保留由 heading 自動產生的章節目錄與圖片燈箱；補充抽屜、自由折疊、名詞 popover、關聯明細及其他互動元件延後。
- Google Docs 複製貼上至少驗證標題、段落、清單、表格與圖片；這是採用能力，不是 DOCX／Google Docs 匯入、追溯或雙向同步。
- 手機依 DEV-033 只讀；不得呈現文字選取 AI 編修、正文 mutation、AI 套用或職掌修改控制。

#### Current Phase Scope

- `MP` 管理辦法的永久 ID、`MP-xxxx`、標題、自由多媒體正文、圖片／附件、建置中草稿標示與最後修改時間。
- 成熟嵌入式 editor 的標題、段落、清單、表格、圖片、圖片說明、連結、Undo／Redo 與自動保存方向；實際套件與輸出格式留待 RD Contract 比較。
- 從 Google Docs 複製貼上的基本內容保真與不安全內容清理。
- 人類直接編輯與 AI 選文／全文起草、改寫、整理、差異、接受／拒絕及 Undo。
- 人工觸發的組織／職掌唯讀語意比較與建議式結果。
- 依實際標題產生的章節目錄、圖片放大、桌面編輯與手機唯讀。
- 現行 organization／Duty／Responsibility 只讀 adapter 邊界；不得新增跨 domain 寫入。

#### Out of Scope

- 正文段落、選取文字或編輯器節點到 Work Item、Position、Employee、ISO／內控條文、Control Point、Evidence Requirement 或 Related Resource 的智能引用。
- Method Stage／Method Step、固定14章必填模板、流程建模、責任投影、管理辦法到組織圖的精確 block 往返，以及被引用區塊／Work Item 的刪除阻擋。
- 由 DEV-032 取代 DEV-031、把責任配置移入組織圖模式、修改 Duty domain 或新增工作事項責任規則。
- 受控 presentation registry、內容抽屜、自由折疊、名詞 popover、關聯明細、角色化閱讀、任意 HTML／CSS／JavaScript 或文件專屬互動程式。
- AI 自動建立／修改職掌、自動配置職位、自動判定一致、自動合規判斷、背景監控、定時檢查或無人確認套用。
- Google Docs／Word 雙向同步、DOCX 匯入／匯出、來源檔追溯、舊代碼／版次／章節對照、PDF與列印排版。
- 文件 revision、審核／核准、生效／失效／取代、正式發布、合規維護責任及 `POL`／`WI`／`FM`／`REC` 物件。
- production AI provider、正式 credential、遠端資料、部署與 release。

#### 驗收方向（Brief 層）

- 制度規劃者能建立空白 `MP` 並自由完成含文字、標題、清單、表格與圖片的管理辦法，不需理解 Stage／Step／Work Item 或固定14章。
- 從代表性 Google Docs 複製標題、清單、表格與圖片後，內容仍可閱讀與編輯，不插入可執行 script 或不安全 HTML。
- 使用者可對選取文字及全文呼叫 AI；任何 AI 修改都先顯示可辨識差異，接受後才改正文，拒絕保持原文，套用後可 Undo。
- AI 重新整理正文時不會靜默刪除圖片、表格、必要段落或其他未在修改範圍內的內容；失敗時保留原輸入與原正文。
- 語意比較結果明確標示為「可能不一致」，並同時顯示正文說法及既有職掌／組織比較依據；不宣稱自動同步或合規結論。
- 使用者從語意比較結果前往既有職掌頁、返回管理辦法或忽略，都不會修改另一邊資料或丟失正文。
- 章節目錄依實際 heading 定位，圖片可以放大；畫面不存在抽屜／折疊／popover 編輯設定或正文智能引用控制。
- 桌面／筆電依既有治理條件編輯；手機同一 deep link 只讀且不存在 AI 編修或其他 mutation path。
- 以原則型、程序型及含表格／圖片三份代表文件測試；沒有真實制度規劃者／主管任務證據前不得宣稱 UX 通過。
- 「AI 約90%」只作長期效用目標；第一版記錄初稿時間、AI 建議接受／修改／拒絕比例、人工編修時間及重大事實錯誤，不以生成字數作完成判定。

#### 升級 RD Contract Ready 前工作

1. 比較 repo 相容的嵌入式 editor，確認表格／圖片、Google Docs paste、內容清理、資料輸出、Undo 與 AI 差異插入能力；不得預先固定 CKEditor 或其他 provider。
2. 確認 AI provider／model、公司資料是否外送、prompt／response 保存範圍、隱私、成本上限、timeout、重試、取消與失敗恢復；未確認前不得派 RD 實作正式 AI 呼叫。
3. 定義 AI 選文／全文編修的輸入輸出邊界、格式保留、diff、accept／reject／Undo、重複提交與 autosave 競合。
4. 定義 organization／Duty／Responsibility 的只讀 AI context adapter，確保 AI 無跨 domain mutation capability，並限制輸入量與敏感資料。
5. 以三份代表性管理辦法完成簡化原型及真人任務評估，驗證貼上、AI 編修、語意比較、保存失敗、手機唯讀與無智能引用的可理解性。

上述完成後才評估升級 `RD Contract Ready`；本輪不建立 spec／ADR。若 AI provider、資料外送或保存選擇形成跨模組且難回復的長期決策，再於 RD Contract 建立或合併 ADR。

#### Future Phase Capsule

`Future Phase Captured / Not Requested`：只有當人工語意比對成本仍高、AI 經常無法精確指出受影響內容，或公司需要可保證的跨視角同步時，才重新評估正文智能引用、stable business block identity、Method Stage／Step、Work Item／Position relation、責任投影及精確往返。未達觸發條件不得預先建立。

`Future Phase Captured / Not Requested`：補充抽屜、自由折疊、名詞 popover、關聯明細、角色化閱讀與其他互動 presentation；只有真實閱讀任務證明自動目錄＋圖片放大不足時才擴充。

`Future Phase Captured / Not Requested`：正式受控文件 revision、審核／核准、生效／失效／取代、合規對照維護責任與其他制度物件；沿用既有正式治理 re-entry trigger，不阻塞簡化 Current Phase。

#### Spec Governance 結論

- 本輪是對既有 DEV-032 Current Phase 的 `Intentional replacement`；簡化範圍優先於後續保存的舊架構、原型、驗收與 Future replacement 文字。
- DEV-031 仍是現行職掌產品基線，DEV-032 不再宣告取代其 route、工作台或責任配置資訊架構。
- 舊 `output/playwright/dev032-prototype/manifest.md` 只保留歷史技術證據，不能證明自由 rich-text、Google Docs paste、AI 語意編輯或新 Current Phase UX 已通過。
- 本輪只達 `Brief Ready`；不存在可直接交 RD 的 provider、資料、API、檔案或測試契約。

#### Current Change Record

- 2026-08-24：依 `USER-2026-08-24-DEV032-SIMPLE-FREEFORM-SEMANTIC-EDITING` 完成 Current Phase 的 `Intentional replacement`：第一版改為自由多媒體管理辦法、AI／人類語意編輯、可見差異與人類接受、只讀職掌語意比較；移除正文智能引用、Stage／Step、固定14章、組織圖責任配置替代、完整互動 presentation 與 AI 自動同步。本輪只更新 Brief 與文件索引，未修改產品程式、schema、API、persistence、測試、deploy 或 release。

### Superseded Design Record（不可作 Current Phase 實作依據）

以下直到 `## DEV-031` 之前的舊 DEV-032 內容，保留用來說明固定14章、Stage／Step、Work Item reference、組織圖責任配置、stable Content Block、Presentation Configuration 與 AI ChangeSet 方向如何演進。凡與上方 `Current Authoritative Brief` 衝突者均已被取代，不得作為第一版 scope、驗收、原型 gate、DEV-031 退場或 RD handoff 依據。

### 真正問題（歷史）

公司目前必須分別維護組織架構、工作職掌與管理辦法，再靠人工比對三份內容是否一致。只要職位、職掌、負責人或流程改變，文件之間就容易出現延遲、矛盾與責任落空；即使把三份文件搬進系統，如果仍各自保存相同文字，問題只會從檔案重複變成資料重複。

本 DEV 的核心不是新增三個文件編輯器，也不是把所有管理辦法強迫拆成流程步驟，而是建立「自由電子正文＋按需結構化關聯」的單一權威。原則型辦法可以只保留章節、文字、表格與圖片；程序型內容需要同步責任時，才以穩定內容區塊或選填流程步驟引用共用工作事項。工作事項透過執行／協作／審核等責任配置連到職位，職位再由任職關係連到目前人員。各職位工作職掌由「工作事項＋責任配置」投影，不另存正文副本。三種視角以電子閱讀為主，不要求轉成可列印文件。

### 使用者價值

- 管理者可從管理辦法直接看見每一步引用哪些工作事項，以及哪些職位執行、審核、協作或會簽及目前由誰任職。
- 部門、職位、任職人員、工作事項或責任配置變更後，所有相關視角從同一權威資料即時反映，不需人工逐份比對。
- 建置者可在同一管理辦法建立 ISO 9001 與創櫃板內控的參考對照，不複製正文；Current Phase 一律標示為待確認，不指定正式維護責任或形成符合性結論。
- 制度建置檢查時，可由職掌、職位或管理辦法任一入口反查內容關聯與客觀資料缺口；正式稽核證據、有效版次與合規判定留待 Future Phase。
- 制度規劃者可像一般文件一樣自由編寫段落、表格與圖片，系統不因管理情境不同而要求填滿固定14章或建立虛假流程步驟。
- 閱讀者可使用章節定位、按需抽屜、折疊補充內容、名詞說明及圖片放大，重要責任與控制要求仍保持正文可見。
- 未來 AI 可依正文、工作事項與組織關係產生可逐項接受的變更草案；人類減少文字整理工時，但保留全部制度決策與套用權。

### 核心系統描繪

```text
管理辦法 Management Method
  ├─ 自由多媒體正文 Document Content
  │    └─ 穩定內容區塊 Content Block（段落／標題／清單／表格／圖片／互動閱讀元件）
  ├─ 選填結構化流程
  │    └─ 流程階段 Method Stage
  │         └─ 原子步驟 Method Step
  ├─ 按需引用工作事項 Work Item（現行 domain 概念 Duty）
  │    └─ 責任配置 Responsibility Assignment（現行 DutyPositionRelation）
  │         ├─ 責任類型：執行（主責／共同）／審核（審核／會簽）／協作
  │         └─ 目標職位 Position → Assignment → Employee
  ├─ 受控互動呈現 Presentation Configuration
  └─ 相關資源 Related Resource（表單／參考文件／範例的輕量連結）

工作事項＋責任配置
  └─ 投影為各職位的「工作職掌」閱讀結果
```

權威邊界：

- 組織架構回答「有哪些部門與職位、上下關係及目前誰任職」。
- 工作事項回答「公司有哪些共用工作責任主題」；工作職掌回答「每個職位對哪些工作事項負何種責任」。
- 管理辦法回答「工作為何做、何時做、依什麼步驟與控制要求做」。
- 管理辦法首先是可自由創作的多媒體文件；固定章節只可作為選填範本或 AI 建議，不能成為每份辦法的必填 schema。
- 流程階段與原子步驟只供程序型內容使用；原則、政策、說明或例外規範可以不建立流程結構。
- 「工作事項」是管理辦法與職位工作職掌之間的橋接主檔；只有需要同步或配置責任的內容區塊／步驟才引用工作事項，不得為了結構化而建立虛假工作事項。
- 執行、主執行、審核、協作與會簽是工作事項和職位之間的責任配置，不是為每種責任各建立一筆獨立工作事項。
- 負責部門由 owner position 的部門歸屬投影，負責人由 active assignment 投影；兩者不是管理辦法中的重複主資料。
- 主管階層不自動等於審核責任。執行、主執行、審核、協作、會簽沿用明確的責任關係。
- Current Phase 的管理辦法是獨立於 organization version 的制度草稿主體；它只引用目前的工作事項與職位關係，不建立生效版 organization snapshot，也不得被視為正式受控文件。
- 相關表單、參考文件與作業範例只以 Related Resource 連結供閱讀；它們不是 Current Phase 的 `WI`、`FM`、`REC` 正式物件，也不保存實際執行紀錄。
- 正文與互動呈現分層保存；AI 或編輯器不得把任意 HTML、CSS、JavaScript 當成正式內容權威，閱讀互動只能由允許清單中的宣告式元件產生。

### Human Decision：自由多媒體正文、AI 原生架構與受控互動閱讀

2026-08-24 已確認管理辦法的第一性定位為「可自由創作的多媒體電子文件」；結構化只服務跨文件共用、責任同步、關聯導覽或檢查，不得反過來限制制度規劃者的表達方式。此決策對先前「固定14章、所有辦法都拆 Method Stage／Method Step」的假設構成 `Intentional replacement`。

```text
Management Method
  ├─ Content：自由正文、表格、圖片、清單與說明
  ├─ Relation：按需連結 Work Item／Position／要求／資源
  └─ Presentation：章節定位、抽屜、折疊、彈出說明、圖片燈箱

Future AI Authoring
  └─ 讀取 Content＋Relation → 產生 ChangeSet → 人類逐項接受／拒絕／微調
```

固定產品原則：

- Current Phase 的建置中草稿正文由 OrgMaster 保存並作為系統內唯一內容權威；Google Workspace 繼續作為登入、來源資料、附件、備份與外部協作環境，不把 Google Docs 設為唯一正文，也不建立雙向同步。此內容權威不代表文件已核准、生效或成為正式受控文件。
- 編輯器使用成熟的可嵌入式 rich-text／document framework；第一階段至少能表達標題、段落、清單、表格、圖片、圖片說明與連結，但實際套件、授權及輸出格式留待 `RD Contract Ready` 比較 repo 相容性後決定。
- 文件內容必須具有可長期識別的 `Content Block` 邊界；工作事項、品質要求、控制點、證據與呈現設定以 stable block identity 關聯，不以可因插入文字而漂移的字元位置作唯一 identity。
- `Method Stage`、`Method Step`、品質／控制／證據條目是按需插入的語意元件，不是每份辦法都必填的章節；一般原則性內容可只保存自由正文。
- 閱讀與編輯共用同一份內容及同一 route／主要工作物件；桌面依權限切換閱讀／編輯，手機依 DEV-033 只呈現閱讀 composition，不建立另一份手機文件。
- 系統只提供受控呈現元件：自動章節目錄／深層連結、補充抽屜、折疊補充內容、點擊／鍵盤可用的彈出說明、圖片燈箱及關聯明細。不得讓 AI 或使用者注入任意 script、style、iframe 或未經清理的 HTML。
- 抽屜、折疊與彈出說明只能承載補充資料、名詞解釋、範例、歷史背景、詳細計算、大型參考表及圖片細節；執行責任、必要動作、核准條件、時限、必留紀錄、品質／安全／法令／內控要求及例外處理必須保留在正文可見層。
- 互動元件不得依賴 hover 才能使用；鍵盤、觸控與手機閱讀均須有等價入口。正常閱讀不常駐多個面板，章節目錄及抽屜只在需要時展開。

AI 目標與責任邊界：

- 長期目標是 AI 承擔約90%的文字產生、改寫、表格整理、關聯建議、前後一致性檢查與閱讀呈現建議；人類約10%的操作集中於提出目的、微調與選擇變更。
- 「90%／10%」是期望的工作量分配，不是正確率或責任分配；人類保留100%的制度目的、例外、責任職位及變更套用決定。
- AI 不直接覆寫正式正文或整份 HTML；每次輸出宣告式 `ChangeSet`，以 stable block identity 表達 add／update／move／delete／presentation change，並保留 before、after、reason、受影響關聯及驗證結果。
- 人類可逐項接受、拒絕或局部編輯；未接受的 ChangeSet 不改變 system of record。刪除被引用區塊、隱藏必要控制或造成斷鏈的提案必須被阻擋或要求先解除關聯。
- Current Phase 只建立不封死上述能力的內容／關聯／呈現邊界；AI 自動草擬、ChangeSet orchestration、模型供應商、提示版本、成本與審查治理列入 Future Phase，不成為目前原型或 RD Contract 升級的功能完成條件。

使用思考習慣：#設計思考、#系統描繪、#限制條件

### Human Decision：工作事項與職位工作職掌

2026-08-23 已確認採用「資料兩層、操作一層」：

```text
第一層：工作事項
  └─ 第二層：責任配置（執行／協作／審核等）→ 職位

工作事項＋責任配置
  └─ 自動投影：職位工作職掌
```

- 使用者只建立一次共用工作事項，再於同一編輯面完成執行、協作、審核等職位配置；畫面不得要求先後進入兩個頁面才能完成一項設定。
- 職位工作職掌不是另一份主檔，而是依職位反向投影「責任類型＋工作事項」的閱讀結果。
- 不採用「執行出貨作業／協作出貨作業／審核出貨作業」各自成為獨立工作事項的模式，避免名稱、內容與管理辦法引用重複。
- 責任角色若需要情境差異，可提供該責任配置的選填補充說明；不得因此複製工作事項身分或共用正文。
- 是否拆成不同工作事項，依觸發條件、輸出、紀錄／證據、控制點及管理辦法步驟是否實質不同判斷，不以責任角色不同作為拆分理由。
- 現行程式內 `Duty` 是否只調整產品顯示名稱，或在後續版本演進為明確 `WorkItem` domain，由 RD Contract 的 domain authority 與 migration impact 決定；本 Brief 不固定技術命名。

建議電子編輯面：

```text
工作事項：出貨作業

責任配置
執行  主責：倉儲物流作業員｜共同：生管專員
協作        業務專員
審核        品管主管
```

規劃者感受到的是一項工作事項的一次性完整編輯；系統底層仍保存可獨立查詢、驗證與投影的責任配置。

### Human Decision：沿用組織架構頁的最小責任配置模式

2026-08-24 已確認責任配置不再以另一個大型工作檯作為目標資訊架構，而是沿用既有組織架構頁，讓組織圖在配置時直接成為職位選擇器：

```text
既有組織架構頁
  └─ 工作事項配置模式（暫時狀態，不是新頁面）
       ├─ 最小任務列：工作事項＋目前責任類型＋完成／復原
       ├─ 組織圖：直接選擇 Position
       └─ 既有 Inspector：按需閱讀／編輯完整責任配置
```

固定產品原則：

- 「不新增頁面」只適用於工作事項責任配置：不新增責任配置頁、永久第三欄或第二份全職位清單，只在既有組織架構頁新增一個明確的「工作事項配置模式」。DEV-032 整體仍會為管理辦法建立完整編輯頁，兩者不得混為同一頁面原則。
- 責任配置沿用既有 Duty／relation 權威，不新增重複責任資料模型；管理辦法、流程步驟及其引用關係仍是 DEV-032 後續需要建立的正式 domain，不得把「配置模式不新增資料模型」誤讀為整個 DEV-032 沒有新 domain。
- 工作事項清單沿用既有左側主資料區或同等既有表面；選定工作事項後收合，畫面只保留最小任務列，不常駐大型工作事項工作檯。
- 最小任務列只保留目前工作事項、責任類型（主執行／共同執行／審核／協作／會簽）、離開配置模式及有可復原變更時的復原入口；不加入教學、統計、摘要卡或第二套文件控制列。
- 使用者先選工作事項，再選責任類型，最後直接點選組織圖的職位節點加入或移除關係；選擇目標是 `Position`，員工姓名只作現任人員參考，不把責任綁到 `Employee`。
- 組織圖只在與目前工作事項有關的節點顯示責任標記；主執行、共同執行、審核、協作與會簽須有文字或形狀辨識，不得只靠顏色。其他工作事項的責任標記保持隱藏，避免圖面失焦。
- 既有右側 Inspector 在配置模式中切換為目前工作事項的完整責任內容與配置摘要；不再另外疊加 Duty Drawer 或永久第三欄。使用者離開模式後，Inspector 恢復既有職位／人員明細語意。
- 配置模式啟用時，暫停職位結構拖曳、員工拖放、雙擊改職位名稱及其他會與「選擇責任職位」衝突的組織 mutation；離開後恢復原操作。
- 一般新增／移除責任沿用 organization state、500ms autosave、Undo／Redo、version CAS 與既有 deterministic validator，成功後就地更新，不建立第二份待套用草稿。「完成」只離開配置模式，不承擔另一個保存或批次套用語意。
- 只沿用現行 command／domain 的資料完整性驗證與既有「兼任風險設定」；本階段不新增工作事項層級的職責重疊風險分級、流程別高低風險、替代控制、例外原因或自動職責分離判斷。系統不推薦最適職位，最終配置由人類判斷。
- 本階段的責任職位只能直接由既有組織圖 Position 節點選取；不新增責任配置專用的職位清單、搜尋、部門篩選、鍵盤選位或其他替代選位表面。既有組織圖本身已存在的一般搜尋、定位或分支操作不因本決策移除，但不列為 DEV-032 新增範圍。
- 手機只呈現同一工作事項在組織圖上的責任關係及可讀明細，不呈現工作事項配置模式、節點選取或其他 mutation 控制。

最小操作流程：

1. 使用者在既有組織架構頁開啟「工作事項」。
2. 從既有左側表面搜尋、新增或選取工作事項；選定後左側表面可收合。
3. 最小任務列保留目前工作事項，使用者選擇要配置的責任類型。
4. 使用者直接點選組織圖職位節點加入或移除責任；節點與 Inspector 立即反映同一權威關係。
5. 系統自動保存並保留 Undo；使用者按「完成」返回一般組織架構操作，畫布 viewport、工作事項及必要焦點上下文保持可預期。

差距與取代邊界：

| 目前已完成基線 | DEV-032 目標方向 | 保留內容 |
|---|---|---|
| `/duty-planning*` 以獨立頁面取代組織圖 | 相容入口回到組織架構頁並進入工作事項配置模式 | deep link 可恢復目前工作事項與配置上下文 |
| `DutyPlanningWorkbench` 再次展開全部 active positions | 既有組織圖 Position nodes 直接成為選擇目標 | Duty／relation identity、exact lane 與 validator |
| 左側待處理來源＋右側全職位工作檯 | 選定工作事項後收合為最小任務列 | 待處理分類仍可由工作事項清單按需取得 |
| Duty 明細與 Position Inspector 為不同表面 | 共用既有 Inspector shell，依模式顯示工作事項或職位內容 | 同一 organization state、Undo／Redo、autosave、CAS |

本決策是對 DEV-031 主要資訊架構的 future `Intentional replacement`，不是完成宣告。DEV-031 現行程式、測試與證據在 DEV-032 實作前仍是產品基線；不得因本 Brief 已更新而移除現行 route、元件或測試。

### Human Decision：管理辦法完整編輯頁與第一階段排除

2026-08-24 已確認頁面邊界：

```text
管理辦法完整編輯頁
  ├─ 基本資料與永久代碼
  ├─ 自由多媒體正文（文字／清單／表格／圖片／說明）
  ├─ 選填語意區塊（流程階段／步驟／品質／控制／證據）
  ├─ 按需工作事項與相關資源引用
  ├─ 受控互動閱讀呈現
  ├─ 待確認參考對照
  └─ 「建置中草稿／非正式受控文件」標示

既有組織架構頁
  └─ 工作事項配置模式
       └─ 直接點選 Position 設定責任
```

- 管理辦法是長內容、自由多媒體且具有獨立閱讀／編輯任務的主要工作物件，因此 Current Phase 必須提供完整編輯頁；不得把整份管理辦法壓入組織圖 Inspector、Drawer 或 modal。
- 固定14章降為可選起始範本；建立新辦法時可選空白、原則型或程序型模板，建立後仍使用同一 document model，不因模板不同形成不同資料權威。
- 管理辦法完整編輯頁可從含 Work Item reference 的內容區塊或流程步驟導向既有組織架構頁配置模式；完成後返回原管理辦法及 stable block context。這是兩個必要工作表面的雙向導覽，不是兩份資料或兩套保存路徑。
- 工作事項責任配置仍不得建立獨立頁；既有 Inspector 只承擔目前工作事項的配置摘要與按需明細，不承擔整份管理辦法編輯。
- 本階段只沿用現有兼任風險設定，不新增工作事項／流程專用風險規則；也不新增組織圖以外的責任職位選擇方式。兩項能力均屬 Future Phase，不能成為 Current Phase 的 RD、驗收或 release 阻塞。

### Human Decision：草稿優先的第一階段治理邊界

2026-08-24 已確認 Current Phase 的產品定位為「制度內容編製與職掌關聯工具」，不是正式受控文件系統：

```text
Current Phase
  └─ MP 管理辦法（單一建置中草稿）
       ├─ 永久內部識別與 MP-xxxx 顯示代碼
       ├─ 章節、流程階段、原子步驟與工作事項引用
       ├─ 組織職位責任投影
       ├─ 表單／參考文件／範例的輕量連結
       └─ ISO／創櫃板待確認參考對照

Future Phase
  └─ 版本／審核／核准／生效／失效／取代／正式合規治理
```

固定邊界：

- 第一階段只支援 `MP` 管理辦法；`SYS`、`POL`、`WI`、`FM`、`REC` 不建立編輯介面、正式資料物件或驗收要求。
- 每份管理辦法仍有獨立且永久的內部識別與 `MP-xxxx` 顯示代碼，代碼建立後不可修改或重用；管理辦法身分不與 organization version 綁定。
- Current Phase 只保存可持續修改的單一建置中草稿，不建立文件版次、organization snapshot、審核／核准流程、生效／失效／取代狀態或正式發布語意。
- 完整編輯頁及所有閱讀入口必須清楚顯示「建置中草稿／非正式受控文件」；不得出現使人誤認已核准、生效、符合 ISO 或符合創櫃板內控的狀態、分數或徽章。
- ISO／創櫃板欄位只作可選的人工參考對照，預設為「待確認」；本階段不指定品質、內控或財會角色的正式維護責任，不留下獨立檢視結果，也不把對照缺漏列為阻擋性異常。
- 管理辦法內容中的「核准權限及職責分離」仍可描述業務流程本身的授權與責任；它不等於系統內的文件簽核工作流。
- 未來正式治理能力必須沿用現有永久識別並以新增 revision／lifecycle 關聯擴充，不得為了加入版次而更換 `MP-xxxx` 或複製工作事項、職位責任資料。

### Human Decision：既有文件只轉入確認後內容，不建立舊文件追溯

2026-08-24 已確認既有 DOCX 只作制度規劃者整理內容時的暫時參考，不成為 OrgMaster 內另一個需要維護的來源物件：

- 建立管理辦法後，系統只保存新的 `MP-xxxx`、標題、章節、流程階段、原子步驟、工作事項關聯、責任投影、結構化要求及相關資源連結。
- 不保存舊文件代碼、舊版次、原始檔名、來源檔案、來源章節、匯入時間、匯入者、舊文件狀態或新舊欄位對照表；不得為追溯新增 UI、metadata、附件或查詢。
- 舊文件中的頁首頁尾、頁碼、列印編號、版面與截圖位置不轉入；確認後的制度內容直接依新電子架構重建，System of Record 是新的 Management Method。
- Current Phase 不建立 DOCX 上傳、批次匯入、OCR／AI 自動拆解或來源檔並排校對工作流；制度規劃者先以完整編輯頁整理。未來 AI 原生編修是高價值方向，但須等 stable block、ChangeSet、模型／隱私／成本及人類審查契約成熟後另行實作。
- Related Resource 只連結管理辦法運作時仍需使用的表單、參考文件或範例，不得拿來保存被淘汰的來源 DOCX 或舊文件追溯資料。

### UX Design Brief：單一完整編輯頁（技術原型互動已通過／代表使用者評估待進行）

#### UX Intent

- 使用者／任務：制度規劃者在桌面或筆電自由編寫含文字、表格與圖片的管理辦法；只有需要同步責任時才插入語意區塊或引用工作事項，必要時到組織圖配置職位後返回原內容位置。
- 成功結果：使用者不需要同時開三份文件或人工比對，即可在同一管理辦法上下文看見「制度步驟—工作事項—責任職位」的最新關係。
- 主物件／主焦點：目前選定的一份 `MP` 建置中草稿；正文編輯區是唯一主焦點。
- 預設刪除：獨立管理辦法清單頁、永久第三欄、右側文件 Inspector、儀表板摘要卡、合規分數、核准／發布工具列、AI 推薦區、常駐教學、每章卡片外框及正常成功通知。
- 保留舉證：永久代碼避免編錯制度；單一草稿標示避免誤認為正式文件；按實際標題產生的章節導覽避免長文失去位置；工作事項關聯與責任摘要避免人工比對；返回 stable block context 避免跨頁後重新尋找內容。
- 非語言修復：以頁面位置、章節順序、單一選取狀態、就地展開與淡分隔線表達層級；不靠說明卡、重複 badge 或框中框補救。
- 風險與驗證：必須驗證錯誤文件、未保存切換、共用工作事項誤改、解除引用誤刪主檔、跨頁返回失焦、只靠顏色辨識責任，以及手機誤出現編輯控制。

#### 最小頁面架構

只新增一個「管理辦法完整編輯頁」，不另建管理辦法清單頁：

```text
既有應用程式頁首
└─ 管理辦法完整編輯頁
   ├─ 頁面列：管理辦法切換器｜新增管理辦法
   ├─ 文件識別：MP-xxxx｜可編輯標題｜建置中草稿
   ├─ 按需章節導覽：由實際標題產生，只負責定位
   └─ 單一正文捲動區
      ├─ 一般內容：標題／段落／清單／表格／圖片／連結
      ├─ 選填語意區塊：流程／品質／控制／證據／工作事項引用
      ├─ 相關資源：表單／參考文件／範例連結
      ├─ 受控互動：抽屜／折疊／說明／燈箱／關聯明細
      └─ ISO／創櫃板：選填且待確認的參考對照
```

頁面規則：

- 管理辦法切換器位於頁面列；打開後才顯示搜尋與 `MP-xxxx＋標題` 清單。它不是永久側欄，也不產生另一個 route。
- 「新增管理辦法」是頁面列唯一主要動作；以短流程先取得標題，確認建立後才配置永久 `MP-xxxx` 並開啟草稿，不因取消建立而消耗代碼。
- 文件識別區只顯示一次永久代碼、標題與「建置中草稿」狀態；不得再疊加頁頂警告卡、第二個狀態列或合規徽章。
- 章節導覽由正文實際標題即時產生，可收合或按需開啟，與正文共用一個頁面捲動脈絡；目前章節只以單一選取狀態辨識，不顯示完成率、錯誤數或合規計分。
- 正文以標題、留白與分隔線分組；一般內容不得卡片包卡片。只有流程步驟、表格、圖片或互動元件等具有獨立選取／操作邊界的內容可使用最小容器。
- 閱讀模式與編輯模式使用同一內容權威；編輯器只在桌面／筆電及符合權限時顯示工具，閱讀模式依 presentation configuration 渲染受控互動元件。
- 編輯版面只針對桌面／筆電設計；手機閱讀改為單欄章節內容與按需目錄，不等比例壓縮雙欄編輯器，也不顯示新增、編輯、排序、關聯或配置控制。

#### 選填語意模組的資料權威與避免重複編輯

下表是制度規劃者可按需插入的語意模組，不是每份管理辦法的固定章節或完成清單。空白／原則型辦法可完全以自由正文表達；只有出現跨視角同步、責任配置或關聯檢查需求時，才使用對應模組。

| 章節 | Current Phase 編輯方式 | 權威與投影規則 |
|---|---|---|
| 目的、範圍、輸入輸出、異常處理、監督指標 | 自由正文或選填模板段落 | 只屬目前管理辦法草稿，不複製到工作事項 |
| 相關職位與責任 | 顯示辦法負責職位及由各步驟工作事項彙整的責任 | 執行／審核／協作來源是 Responsibility Assignment；正文不得再輸入一份職位名單 |
| 流程階段與步驟 | 階段分組及其內有順序的原子步驟；階段／步驟編號由順序產生 | 階段只分組；步驟擁有情境操作描述與 Work Item reference，不複製 Work Item 身分或共用名稱 |
| 品質要求與驗收標準 | 結構化要求，可選擇關聯一或多個步驟 | 條目只在本章編輯；步驟內只顯示摘要與反向連結 |
| 風險與內部控制點 | 結構化控制條目，可關聯步驟或工作事項 | 不建立 Current Phase 自動風險評分；其他章節只投影摘要 |
| 核准權限及職責分離 | 編寫業務流程本身的授權規則 | 不觸發文件核准工作流，也不建立品質／內控審核者角色 |
| 紀錄與執行證據要求 | 結構化證據條目，可關聯步驟或控制點 | 只定義應留下什麼證據，不管理實際執行紀錄 |
| 相關資源與附件連結 | 就地維護顯示名稱、類型、連結及可選步驟關聯 | 只連到目前仍使用的表單／參考文件／範例；不建立 `WI`／`FM`／`REC`、檔案版次或舊文件追溯 |
| ISO／創櫃板／法規對照 | 結構化待確認參考對照 | 不寫入正文自由文字、不計分、不形成符合性結論 |
| 文件識別與建置註記 | 系統產生，只讀 | 顯示永久識別與草稿定位；正式版次、核准、生效留待 Future Phase |

#### 選填流程階段、原子步驟與共用工作事項互動

只有程序型內容需要結構化流程時才建立 Method Stage／Method Step。每個 Method Stage 只保存階段名稱與排序；每個 Method Step 只保留完成原子步驟編寫所需的資訊：步驟順序、情境操作描述、引用的工作事項、責任摘要，以及其品質／控制／證據／相關資源的按需摘要。原則型或說明型管理辦法不因缺少 Stage／Step 而形成缺口。

1. 使用者可把既有正文區塊轉為流程階段／原子步驟，或直接插入新的流程結構；系統依目前順序產生顯示編號，編號不是人工輸入的永久識別。
2. 一個原子步驟表達一個可辨識的主要動作。原文件段落若同時包含發布、請購、採購或考核、決議、調薪等不同動作，人工整理時拆成多個步驟；階段用來保留原流程脈絡。
3. 作業提醒、溝通原則、品質標準、控制要求及應留證據不建立為虛假 Work Item，分別放入情境操作描述或品質／控制／證據章節，再關聯到適用步驟。
4. 使用者輸入此管理辦法中的情境操作描述，再從就地選擇器搜尋並引用既有工作事項。
5. 若沒有合適項目，選擇器可用目前輸入的名稱快速建立一筆共用工作事項並立即引用；建立前先顯示精確或正規化同名項目，避免重複主檔。這是工作事項選擇，不是責任職位的替代選位功能。
6. 已引用的工作事項以可展開列顯示。使用者可在原步驟就地修改共用名稱與簡要內容；同一列必須以一個最小「共用工作事項」訊號表明修改會同步所有引用。
7. 「用人單位主管」等情境角色可留在步驟操作描述中，但不自動轉成 Position。步驟中的執行／審核／協作只顯示同一 Work Item 的即時責任投影，不提供職位下拉選單或人員 picker。
8. 使用者選擇「配置責任」後，系統先完成草稿保存，再進入既有組織架構頁；由人類直接點選實際適用 Position，系統不得依角色文字自動推薦或指派。
9. 表單、參考文件或範例可在步驟中選擇既有 Related Resource，或回到「相關資源與附件連結」章節新增顯示名稱、類型及連結；不得上傳或保存來源 DOCX 作為追溯附件。
10. 解除步驟引用只移除 Method Step → Work Item 關係，不刪除 Work Item、責任配置或其他管理辦法引用；可由同一編輯 session 復原。

#### 組織圖往返上下文

從管理辦法進入組織圖時，最小任務列保留以下可見上下文：

```text
返回 MP-0001／來源內容區塊
工作事項：出貨作業
責任類型：主執行／共同執行／審核／協作／會簽
```

- `MP-xxxx／stable block identity` 只負責返回與辨識來源；來源若是 Method Step 可另顯示步驟編號，但不在組織圖中複製管理辦法正文。
- 若工作事項尚無主執行，使用中性「尚未配置」作為可操作空白狀態，不升級為紅色合規異常。
- 完成責任配置後返回同一管理辦法、同一內容區塊與原捲動／焦點位置；責任摘要從同一權威關係重新投影。
- 使用瀏覽器返回、取消或完成都不得遺失來源上下文。直接由一般入口進入組織圖時，不顯示不存在的管理辦法返回列。
- 配置頁的 organization autosave／Undo 與管理辦法草稿的編輯復原屬不同作用範圍，不建立跨頁共用 Undo stack；返回後只顯示各自已保存的權威結果。

#### 儲存、回饋與錯誤恢復

- 管理辦法草稿採自動保存方向，不建立常駐「儲存」主要按鈕；正常成功不顯示 toast 或常駐「已儲存」。
- 儲存進行中只在文件識別附近顯示短暫狀態；失敗時在同一位置顯示最短原因與重試，並保留使用者輸入。
- 管理辦法切換、前往組織圖或離開頁面前若仍有待保存內容，必須先完成保存；保存失敗則停留原頁，不得帶著未保存的 step context 導航。
- 章節載入失敗只標示受影響章節，不以整頁遮罩阻擋其他已載入內容；若整份草稿不可取得，才使用頁級錯誤與單一重試動作。
- 尚無管理辦法時只顯示「尚無管理辦法」與一個「新增管理辦法」動作，不保留空章節導覽、工具列或摘要卡。
- 步驟重新排序與解除引用需支援鍵盤操作、可見焦點與 session 內復原；責任標記不得只靠顏色辨識。

#### 受控互動閱讀元件

閱讀呈現不是另一份正文。`Presentation Configuration` 只引用 Content Block identity 並描述允許的顯示方式；移除呈現設定後，所有原始內容仍能依正文順序完整閱讀。

| 元件 | Current Phase 用途 | 最小行為與限制 |
|---|---|---|
| 章節目錄／深層連結 | 長文定位與分享指定章節 | 由實際 heading 產生；桌面可按需展開，手機為下拉或 bottom sheet |
| 補充抽屜 | 表單範例、詳細計算、大型參考內容 | 只在觸發後出現，不常駐第三欄；關閉後焦點回到觸發位置 |
| 折疊補充內容 | 範例、背景、延伸說明 | 預設只折疊非必要內容；展開狀態不改正文資料 |
| 點擊／焦點說明 | 名詞、縮寫與短定義 | 不以 hover 作唯一入口；支援鍵盤 Escape 關閉及觸控 |
| 圖片燈箱 | 流程圖、表單圖例及設備圖片 | 保留替代文字／說明；原圖失效時正文仍顯示可理解占位 |
| 關聯明細 | Work Item、Position、Related Resource | 只顯示同一權威資料的投影，不複製關聯內容 |

編輯模式只需在選取內容時提供最小呈現選項，例如「一般顯示／補充抽屜／折疊補充／短說明／圖片放大」；正常狀態不常駐 presentation inspector。高風險內容若被設為隱藏型呈現，系統拒絕套用並說明必須保留正文可見，而不是只顯示警告後允許發布。

Current Phase 不接受自訂 JavaScript、自由 CSS、任意 iframe、遠端 script、文件專屬主題或每份文件獨立 component code。若日後新增互動型流程圖、角色化閱讀、文件問答或動畫，須擴充同一 declarative component registry，不得開放任意程式注入。

#### 原型必驗證的主要任務

1. 建立第一份 `MP`，選擇空白／原則型／程序型起始方式，不經清單頁即可進入完整編輯頁並辨識其草稿性質；模板不產生不可刪除的必填章節。
2. 在長內容中由實際標題產生章節導覽；建立文字、表格、圖片與說明，程序型內容可另建立／排序階段及原子步驟，返回後仍維持原內容區塊與位置。
3. 把同一段中的多個主要動作拆成多個步驟，並把作業提醒、品質要求、控制點及證據要求放入正確章節，沒有為了保留原段落而建立過大的 Work Item。
4. 從步驟搜尋既有工作事項、快速建立新工作事項、就地修改共用內容，且所有引用同步顯示。
5. 面對「用人單位主管」等情境角色時，規劃者可閱讀步驟語意後進入組織圖人工配置實際 Position；系統不推薦職位，返回後可看到最新責任摘要。
6. 建立表單、參考文件與範例的輕量 Related Resource 連結並關聯步驟；不出現舊代碼、舊版次、原始檔、來源章節或來源追溯欄位。
7. 解除引用不刪除工作事項；儲存失敗不丟失文字，也不錯誤切換文件或跨頁。
8. 桌面沒有等權重多焦點、永久第三欄或框中框；手機只有單欄閱讀與關聯導覽，不存在 mutation 控制。
9. 閱讀模式可使用章節定位、補充抽屜、折疊說明、點擊／鍵盤說明與圖片燈箱；必要責任、控制、時限與證據要求不會被隱藏型呈現收起。
10. 修改一般段落、移動圖片或在前方插入內容後，stable block identity、工作事項關聯、互動呈現及跨頁返回仍指向正確內容，不依賴舊字元位置。

### 決策狀態總表

本表區分使用者已確認原則、可由原型調整的 AI assumption 與刻意延後範圍，避免後續把版面假設誤當成人類核准的長期契約：

| 主題 | 狀態 | Current Phase 規則 | 允許重新進入／調整的條件 |
|---|---|---|---|
| Work Item → Responsibility Assignment → Position | `Human Confirmed` | 工作事項是共用主體，責任類型是第二層關係，職位工作職掌由此投影 | 除非使用者明確改變資料語意，不因版面測試推翻 |
| 管理辦法完整編輯頁＋組織圖責任配置 | `Human Confirmed` | 管理辦法使用完整頁；責任配置只在既有組織圖直接選 Position | 原型可調整排列與導覽，不得新增責任配置頁或替代職位清單 |
| `MP`、永久代碼、單一建置中草稿 | `Human Confirmed` | 第一階段只做 `MP`；不綁 organization version、不提供正式生命週期 | 正式發布、ISO 輔導／預稽核或歷史有效版本需求出現時進入 Future Phase |
| 既有文件不建立追溯 | `Human Confirmed` | 只轉入確認後的新制度內容；不保存舊代碼、版次、檔名、來源檔或章節對照 | 只有使用者另行提出法規／稽核要求並明確要求追溯時，另立 DEV，不回填 Current Phase |
| 自由多媒體正文＋按需結構化 | `Human Confirmed / Intentional Replacement` | 固定14章只作選填模板；原則型辦法可不建 Stage／Step，只有需要同步或配置責任的內容才結構化 | 只有實際關聯、檢查或導覽需求證明自由區塊不足時，才增加新的受控語意元件 |
| OrgMaster 草稿正文權威＋Workspace 輔助 | `Human Confirmed` | OrgMaster 保存系統內草稿正文／關聯；Workspace 用於登入、來源、附件、備份與外部協作，不做雙向同步 | 若日後多數受控文件編輯必須在 Google Docs 完成，另立整合 DEV 並重新決定唯一權威 |
| AI 90% 編修目標 | `Human Confirmed Future Direction` | Current Phase 預留 stable block／ChangeSet 相容邊界，不實作 AI 自動覆寫；人類保留全部套用決定 | 內容／關聯／呈現模型與人工編輯已穩定，且另行確認模型、成本、隱私及審查治理時進入 Future Phase |
| 受控互動閱讀元件 | `Human Confirmed / Prototype Required` | 只允許 declarative TOC、drawer、collapse、popover、lightbox 與 relation detail；必要控制不得隱藏 | 真實任務證明需要新互動且可維持安全、可存取與正文完整時才擴充 registry |
| 文件切換器、按實際標題產生章節導覽、單一正文捲動區 | `AI Assumption / Prototype Required` | 不新增管理辦法清單頁或永久文件側欄 | 真實測試出現可重現的文件尋找失敗或長文定位失敗時調整，但先改同頁結構 |
| 選填 Method Stage＋每步驟最多一個主要 Work Item reference | `AI Assumption / Real-sample Supported / Prototype Required` | 只供程序型內容；草稿步驟可暫時未連結，需要多個獨立動作時優先拆步驟 | 若代表性程序證明拆步驟失真，才重新評估；非程序型辦法不受此規則限制 |
| Related Resource 輕量連結 | `AI Assumption / Real-sample Supported / Prototype Required` | 只保存目前使用資源的顯示名稱、類型、連結及可選步驟關聯 | 需要檔案版次、正式表單物件、執行紀錄或來源追溯時另立 Future Phase DEV |
| Work Item 快速建立、就地基本編輯與精確返回 | `AI Assumption / Prototype Required` | 以同一權威主檔完成，不新增另一套資料 | 原型顯示誤改共用主檔或頻繁跨頁失焦時，調整互動而不複製資料 |
| 正式核准、版次、合規維護及其他制度物件 | `Future Phase Captured / Not Requested` | Current Phase 不建立 | 依既有 Future Phase re-entry triggers 另立 DEV／phase contract |

### 概念物件契約（Brief 層，不是 schema）

| 概念物件 | Current Phase 用途與身分 | 自己擁有的內容 | 不得保存或取代的內容 |
|---|---|---|---|
| Management Method | 一份具有永久 identity 與 `MP-xxxx` 的管理辦法建置中草稿 | 標題、自由多媒體正文、流程分類、選填語意元件及參考對照 | 不保存人員姓名副本、責任職位文字副本、舊文件追溯、正式版次或合規結論 |
| Content Block | Management Method 內可穩定定位的內容單位 | stable identity、類型、正文內容、順序及必要的內容屬性 | 不以畫面 DOM path 或易漂移字元 index 作唯一 identity，不直接保存任意 script／style |
| Presentation Configuration | Content Block 的宣告式閱讀呈現 | 允許元件類型、觸發 block、內容 block、標籤與最小顯示參數 | 不複製正文，不保存任意 HTML／CSS／JavaScript，不得隱藏必要控制內容 |
| Method Stage | 程序型 Management Method 的選填有序流程群組 | 階段名稱、排序及其 Method Step 關係 | 不直接引用 Work Item、不擁有責任配置、不成為所有辦法必填結構 |
| Method Step | 選填且只屬於一個 Method Stage 的有序原子步驟 | 情境操作描述、排序及零或一個主要 Work Item reference | 不複製 Work Item 名稱／說明，不直接擁有 Position 或 Employee 責任 |
| Work Item（現行 Duty） | 跨管理辦法與職位共用的工作責任主體 | 永久 identity、共用名稱與簡要內容 | 不擁有特定管理辦法的步驟順序或情境敘述 |
| Responsibility Assignment（現行 DutyPositionRelation） | Work Item 與 Position 間的責任關係 | 責任類型、主執行語意、目標 Position 及既有排序資訊 | 不綁 Employee，不因管理辦法不同複製同一職位責任 |
| Position／Assignment／Employee | 既有組織權威與目前任職投影 | 組織位置、任職關係及人員資料 | Management Method 不複製或改寫其主資料 |
| Quality Requirement | 管理辦法中的品質要求條目 | 要求內容及可選 Method Step 關聯 | 步驟內只投影摘要，不另存第二份要求正文 |
| Control Point | 管理辦法中的風險／控制條目 | 控制內容及可選 Method Step／Work Item 關聯 | 不在 Current Phase 計算風險分數或自動判斷職責分離 |
| Evidence Requirement | 管理辦法中「應留下什麼」的證據定義 | 證據要求及可選 Method Step／Control Point 關聯 | 不保存實際執行紀錄、附件或控制測試結果 |
| Related Resource | 管理辦法目前仍使用的表單／參考文件／範例連結 | 顯示名稱、資源類型、連結及可選 Method Step 關聯 | 不建立正式 `WI`／`FM`／`REC`、檔案版次、實際紀錄、舊文件來源或追溯欄位 |
| Compliance Reference | ISO／創櫃板／法規的待確認參考關聯 | 外部要求識別、參考版本及可選章節／條目關聯 | 不寫進 `MP-xxxx`、不成為正文副本、不形成合規結論 |
| Process Category | 可調整的企業流程分類 | 分類 identity、代碼與名稱 | 不成為 Management Method 永久身分的一部分 |

概念不變條件：

1. 一般 Content Block 可單獨存在；只有程序型內容才使用 Method Stage／Method Step。Method Stage 只負責組織步驟；Method Step 表達一個主要動作，作業提醒／品質／控制／證據不得為了套模型而建立成虛假 Work Item。
2. 同一 Work Item 可以被多份管理辦法、同一管理辦法中的多個步驟引用；改名後所有視角顯示同一新名稱。
3. Method Step 在編寫中可以暫時沒有 Work Item reference，並顯示中性待補缺口；不得自動建立或猜測關聯。
4. Responsibility Assignment 只屬於 Work Item；Management Method 與 Method Step 只能投影責任，不得另存「本辦法專用責任」副本。
5. 情境角色文字不等於 Position identity；實際責任由人類在組織圖選取，系統不自動推薦或指派。
6. 管理辦法中的 Position 由責任關係取得，Employee 由 active Assignment 取得；換人不改制度責任，停用職位不自動轉給上級。
7. Quality Requirement、Control Point、Evidence Requirement 與 Related Resource 各自在自己的章節維護唯一內容；流程步驟只顯示摘要與反向連結。
8. `MP-xxxx`、流程分類、ISO 對照及組織層級彼此獨立；任一分類或對照變更都不得更換管理辦法 identity。
9. 新 Management Method 不保存舊文件代碼、舊版次、原始檔名、來源檔、來源章節或匯入資訊；Current Phase 不存在 legacy source/provenance domain。
10. Content、Relation 與 Presentation 各自只有一個權威；presentation 移除後正文仍完整可讀，Content Block 重新排序後所有關聯仍以 stable identity 保持正確。
11. AI change proposal 只能引用現存 identity 或建立新 identity，未經人類接受不得修改正文、關聯或呈現權威。

### 共用資料刪改與參照完整性

| 使用者動作／事件 | Current Phase 預期結果 | 明確禁止 |
|---|---|---|
| 修改 Work Item 名稱或簡要內容 | 所有管理辦法步驟、職位工作職掌與工作事項視角同步顯示新值 | 只修改目前步驟中的文字副本 |
| 解除 Method Step → Work Item 引用 | 只解除目前步驟關係；Work Item、Responsibility Assignment 及其他引用保留 | 把「解除引用」當成「刪除工作事項」 |
| 刪除已被 Method Step 引用的 Work Item | 阻擋刪除，顯示被哪些 `MP-xxxx／步驟` 引用，要求先逐一解除引用 | 沿用既有 cascade 而讓管理辦法留下空白或斷鏈 |
| 刪除未被管理辦法引用的 Work Item | 可沿用既有 Duty 刪除確認及責任關係影響提示 | 在沒有提示下連帶刪除責任配置 |
| 移除含品質／控制／證據／資源關聯的 Method Step | 先顯示受影響條目；解除 step 關聯後條目與 Related Resource 保留在原章節，除非使用者另行刪除 | 靜默連鎖刪除要求、控制點、證據定義或相關資源 |
| Position 停用、刪除或失去有效任職 | 沿用既有 pending／缺口語意；管理辦法顯示待重新指派或目前無任職人員 | 靜默改派上級、刪除 Work Item 或改寫管理辦法正文 |
| Employee 調職或 Assignment 結束 | Position 責任不變，只更新目前任職投影 | 把制度責任永久綁在人員身上 |
| Compliance Reference 更新或失效 | 顯示新的待確認對照狀態，`MP-xxxx` 與正文不變 | 自動宣告管理辦法不符合或重編文件代碼 |

現行 `DELETE_DUTY` 只認識 Duty 與 DutyPositionRelation，會一併刪除該 Duty 的責任關係；DEV-032 實作後必須把 Method Step reference 納入刪除前驗證。這是 future `Intentional replacement`，不是本 Brief 已完成的程式保護。

### 主要缺口、例外與恢復語意

| 情境 | 使用者可見結果 | 恢復入口 |
|---|---|---|
| 步驟尚未引用 Work Item | 步驟內顯示中性「尚未連結工作事項」 | 就地搜尋、建立或引用 Work Item |
| 階段尚無步驟 | 階段內顯示中性空白狀態，不建立缺責任或合規警示 | 在目前階段新增步驟或刪除空階段 |
| Work Item 沒有主執行 | 責任摘要顯示「尚未配置主執行」，不標示合規失敗 | 前往組織圖配置目前 Work Item |
| 步驟只寫情境角色但尚未配置 Position | 保留情境操作描述，責任摘要顯示「尚未配置」；不把角色文字自動轉成職位 | 前往組織圖，由人類選取實際 Position |
| Work Item reference 指向不存在資料 | 顯示可辨識的「工作事項已無法取得」，不得以空白代替 | 保留 Method Step 並提供重新連結；同時記錄資料完整性缺口供後續修復 |
| Position inactive／pending reassignment | 顯示原責任類型及待重新指派，不隱藏歷史來源名稱 | 進入同一 Work Item 的組織圖配置模式修復 |
| 快速建立名稱與既有 Work Item 相同或近似 | 先列出可能重複項目，讓人類選擇既有項目或明確繼續建立 | 返回選擇器，不由 AI 自動合併 |
| 管理辦法保存失敗 | 保留所有輸入、停留原文件且禁止跨頁帶走未保存 context | 就地重試；成功後才允許切換或前往組織圖 |
| Related Resource 連結無法開啟 | 在該資源列顯示「連結無法使用」，不阻擋其他章節閱讀 | 編輯連結或解除資源關聯；不得回退成保存來源 DOCX |
| 返回 context 中的步驟已被移除 | 返回該 `MP-xxxx` 的流程步驟章節並顯示最短原因 | 由章節內選擇仍存在的步驟，不導向空白頁 |
| deep link 的 Management Method／Work Item 不存在 | 返回可辨識的管理辦法入口或組織圖一般模式 | 顯示一次性錯誤與可行入口，不產生新的替代資料 |
| 手機或唯讀狀態進入編輯 deep link | 顯示同一資料的唯讀閱讀面 | 不呈現可觸發 mutation 的控制或 client command path |

### 原型驗證計畫（產品決策，不是 QA 計畫）

- 原型資料：至少使用三種代表樣本：原則型辦法、程序型人員增補情境、含表格／圖片的說明型辦法。程序型樣本包含複合段落拆步驟、表單／範例、情境角色、重複 Work Item、缺少主執行及 inactive Position；原則型樣本不得被迫建立 Stage／Step。
- 代表使用者：制度規劃者、熟悉實際流程的部門主管，以及需要閱讀責任關係的人員；由同一人兼任兩種角色時仍分開記錄任務觀察。
- 驗證任務：建立／切換 `MP`、自由編寫文字／表格／圖片、由實際標題定位、按需建立 Stage／Step、引用 Work Item、設定受控互動呈現、人工選位、精確返回、解除引用、刪除阻擋、保存失敗恢復及手機唯讀。
- 通過方向：使用者不需常駐教學即可辨識管理辦法、草稿狀態與主要動作；原則型內容保有創作空間，程序型內容仍能理解 Stage／Step／Work Item／要求／資源；閱讀互動提高定位與補充說明效率，又不隱藏必要控制。
- 失敗判定：若代表使用者被迫填入不適用章節、為原則文字建立虛假步驟／工作事項、互動元件讓必要規定被忽略、stable block 關聯在一般編輯後漂移，或必須增加第二份清單／永久面板才能完成任務，回到 document model 或資訊架構重新設計。
- 證據形式：任務腳本、原型畫面、每步觀察結果、失敗點與調整決策；未經真實互動驗證不得宣稱 UX 通過。

### 可操作原型執行結果（2026-08-24）

狀態：`Interactive Prototype Implemented / Technical Interaction Passed / Human Evaluation Pending`。本輪原型是產品概念驗證，不是正式 DEV-032 domain／API／persistence 實作，也未取代 DEV-031 現行產品基線。

2026-08-24 後續產品決策已將原型中的「固定14章＋流程優先」改為「自由多媒體正文＋按需語意結構」。下列證據仍可證明跨頁返回、Work Item 共用、組織圖配置與手機唯讀等互動，但不能作為固定章節、每份辦法都拆 Stage／Step、rich-text 表格／圖片或受控互動閱讀已通過的證據。

- 管理辦法完整頁已建立於 `/management-methods`，以 `MP-0001 人員增補管理辦法` 呈現固定 14 章、七個流程階段、九個原子步驟、共用 Work Item、責任投影與 Related Resource。
- 桌面可編輯標題與正文、建立／排序階段及步驟、切換或快速建立主要 Work Item、就地修改共用內容與新增 Related Resource；同一 Work Item 在步驟 01、02 重複引用時顯示同一名稱與責任摘要。
- 「配置責任」會進入既有組織架構頁的最小任務模式，不新增責任配置頁、第三欄或職位清單；任務列保留辦法、階段、步驟、Work Item 與責任類型，由人類直接點 Position。
- Position 使用「主執行／共同執行／審核／協作／會簽」文字標記，不只靠顏色；再次點選取消。主執行在 prototype model 中維持每個 Work Item 最多一個。
- 實測由試用考核步驟 08 進入組織圖、把管理部經理設為主執行，再完成返回；URL 精確恢復 `/management-methods?step=step-probation-review`、焦點回到步驟 08，責任摘要同步為「主執行：管理部經理」。
- 390×844 手機使用條件式唯讀 composition：正文 mutation control 0、editable field 0、`scrollWidth=viewport=390`；直接進入 responsibility deep link 會回到同一步驟唯讀頁，不呈現配置 task bar。
- 技術證據：`npm test`（38 files／212 tests）與 `npm run build` 通過；主要桌面／手機流程 console 0 error／0 warning；畫面與 runtime 記錄位於 `output/playwright/dev032-prototype/manifest.md`。

原型驗證後保留的產品判斷：

1. 「一個新完整頁＋既有組織圖配置模式」可完成既有主要技術任務，現階段沒有證據需要責任配置專用頁、永久第三欄或第二份職位清單。
2. 階段＋原子步驟可表達人員增補程序，但不能推論所有管理辦法都適用；後續原則型及含表格／圖片樣本必須驗證自由正文與按需結構化。
3. 最小任務列足以維持跨頁上下文；責任文字直接標在 Position 上，比只用顏色更容易辨識。
4. 本輪仍沒有真實制度規劃者／主管的代表性使用證據，因此只能宣告技術互動通過，不得宣稱正式 UX 通過。
5. 正式保存、錯誤恢復、被引用 Work Item 刪除阻擋、多文件建立／切換及舊 `/duty-planning*` 相容退場仍須在 RD Contract 前定義與驗證；session-only prototype 不得成為正式資料權威。
6. stable Content Block、rich-text 表格／圖片、Presentation Configuration、必要控制不得隱藏及 AI ChangeSet 尚未進入原型驗證，不得宣稱 AI 原生文件或互動閱讀已完成。

### 複雜度控制與電子閱讀原則

第一階段不建立三套重複資料的文件中心，而是提供兩個必要工作表面及三個互相可導覽的資料視角：

1. 管理辦法視角：由完整編輯頁閱讀及編輯建置中草稿的章節與步驟，查看相關工作事項、責任職位、目前任職人員、控制要求與待確認參考對照。
2. 工作事項視角：由組織架構頁的配置模式閱讀共用內容及完整責任配置，並查看它被哪些管理辦法步驟引用。
3. 組織架構視角：在同一組織架構頁選取職位後查看由責任配置投影的工作職掌與相關管理辦法，不複製工作事項或制度正文。

本階段不提供 DOCX 匯入／匯出、來源檔附件、舊文件追溯、PDF、紙本版面、頁首頁尾、列印編號或為列印而存在的欄位。流程圖若需要，應由結構化階段與步驟投影產生，不另存一份必須人工同步的流程圖正文。

所有 DEV-032 編輯與治理操作只提供於符合既有治理條件的桌面／筆電環境；手機依專案最高產品原則及 DEV-033 只提供完整唯讀閱讀、搜尋、篩選與關聯導覽，不建立手機版管理辦法或責任配置編輯流程。

### 建議內容範本（非強制章節）

為協助 AI 或制度規劃者起草，可提供下列原則型／程序型範本模組，同時承載品質系統與內控系統要求。它們不是固定 schema、必填清單或合規計分依據；使用者可以刪除、改名、重排、合併或完全從空白文件開始：

1. 目的與預期結果
2. 適用範圍
3. 輸入與輸出
4. 相關職位與責任
5. 流程步驟
6. 品質要求與驗收標準
7. 風險與內部控制點
8. 核准權限及職責分離
9. 異常、退回與矯正處理
10. 監督指標與檢查頻率
11. 紀錄與執行證據要求
12. 相關資源與附件連結
13. ISO／創櫃板／法規對照
14. 文件識別與建置註記

品質與內控不是兩份正文：同一份管理辦法可依實際情境描述流程有效性、品質標準、改善閉環、風險、授權、職責分離、證據及監督；不適用的章節不得為了模板完整而填入空泛內容。Current Phase 只支援內容編製與參考對照，不建立品質／內控角色的正式檢視結果或文件核准工作流。

#### 既有管理辦法的人工內容轉換規則

| 既有內容型態 | 新系統落點 | Current Phase 判斷規則 |
|---|---|---|
| 目的、範圍、輸入輸出、例外與監督文字 | 自由正文或選填範本模組 | 依語意保留新正文，不要求對應固定章節，也不保留來源頁碼、段落編號或舊文件欄位 |
| 程序內容中的「階段一／階段二」等流程群組 | 選填 Method Stage | 只有需要流程導覽／關聯時才建立；保存新階段名稱與排序，由系統重新編號 |
| 程序內容中的主要可執行動作 | 選填 Method Step＋零或一個 Work Item reference | 需要責任同步時才結構化；多個主要動作人工拆步驟，不為一般原則文字建立虛假 Work Item |
| 權責單位或「用人單位主管」等情境角色 | 步驟操作描述＋Work Item 責任投影 | 角色文字只供人理解情境；實際 Position 必須由規劃者在組織圖選取 |
| 作業要點、品質提醒、控制要求、應留資料 | 操作描述、Quality Requirement、Control Point 或 Evidence Requirement | 依語意分流，不一律建立成工作事項 |
| 表單、參考文件、作業範例或平台畫面 | Related Resource | 只保存目前仍使用資源的名稱、類型與連結；不保存來源 DOCX、舊代碼、版次或檔名追溯 |

人工轉換完成後，新的 Management Method 是唯一權威；系統不提供新舊文件逐欄比較、差異報告或回看來源檔入口。

### 合規涵蓋方向

- ISO 9001 對照面向：組織處境、領導、規劃、支援、運作、績效評估與改善。
- 創櫃板內控最低涵蓋方向：銷售及收款、採購及付款、生產及存貨、固定資產、財務收支，並能支持內控檢查、會計制度、財務報表與法令遵循。
- 製造業可在流程分類中另含借款、投資及財務報表編製，但實際適用範圍仍須由公司、會計師與現行申請要求確認。
- ISO 條文與創櫃板循環在 Current Phase 只作可選、待確認的多對多參考對照，不寫進文件代碼，也不把對照存在正文自由文字中。
- Current Phase 不計算合規分數、不把對照缺漏判定為不符合，也不宣稱取得 ISO 驗證、創櫃板登錄資格或取代會計師／驗證機構判定。

參考權威來源：

- ISO 9001:2015 官方標準頁：<https://www.iso.org/standard/62085.html>
- ISO 9001 第六版開發狀態：<https://www.iso.org/standard/88464.html>
- ISO documented information guidance：<https://www.iso.org/files/live/sites/isoorg/files/standards/docs/en/iso_9001_2015_guidance_documented_information.pdf>
- 證券櫃檯買賣中心創櫃板 FAQ：<https://www.tpex.org.tw/zh-tw/about/company/faq.html>
- 創櫃板內部控制制度範例：<https://dsp.tpex.org.tw/web/gisa/sample.php>

### 管理辦法編碼原則

文件顯示代碼只承載「文件類型＋永久流水號」：

- 管理辦法：`MP-0001`、`MP-0002`。
- 第一階段只建立 `MP`；`SYS`（系統／手冊）、`POL`（政策）、`WI`（作業指導）、`FM`（表單定義）、`REC`（執行紀錄）只保留為 Future Phase 的類型方向，不構成目前 schema、介面或資料建置範圍。
- 代碼由系統產生、全域唯一、建立後不可修改；代碼一經使用即不得回收重用，不依賴目前尚未建立的失效或作廢狀態。
- 改名、部門異動、流程改分類、合規條文改版及版本升版，均維持同一文件代碼。
- 文件拆分、合併、正式版本與取代／被取代關係留待 Future Phase；恢復時不得改變既有永久代碼規則。

不得放進代碼的內容：部門、職位、流程名稱、組織階層、ISO 條文、創櫃板循環、年份、版次、生效日及機密等級。Current Phase 實際需要的可變資訊以獨立 metadata 或關聯保存；舊文件代碼、舊版次與原始檔名不遷移、不另建追溯 metadata。

Current Phase metadata 方向僅供產品語意確認，不構成 RD schema 契約：永久內部識別、`MP-xxxx` 顯示代碼、標題、流程分類、適用範圍、owner position、責任關係、相關管理辦法、相關工作事項、Related Resource 連結、ISO／創櫃板待確認參考對照及固定草稿標示。版次、文件狀態、生效日、取代版次、核准職位及正式變更原因屬 Future Phase。

### 流程分類原則

流程分類是可維護主檔，不是文件身分。第一版可用下列企業流程作為分類起點：

- P01 經營策略與管理審查
- P02 銷售與收款
- P03 設計開發與變更
- P04 採購與付款
- P05 生產與存貨
- P06 不合格、客訴與改善
- P07 設備與資產
- P08 財務與資金
- P09 人力資源
- P10 文件、稽核與管理系統

一份管理辦法可對應多個流程；流程可改名或重整而不改變 `MP-xxxx`。流程代碼本身是否沿用 `P01` 格式，留待 RD Contract 前確認。

### 主要資料互動

- 工作事項改名：所有職位工作職掌與管理辦法引用位置同步顯示新名稱，引用識別不變。
- 責任配置移轉：職位工作職掌與管理辦法中的責任職位同步改變，管理辦法正文及工作事項內容不需重寫。
- Employee 調職或 Assignment 結束：制度規定的責任職位不變，只更新「目前由誰任職」。
- Position 停用且仍被管理辦法草稿引用：管理辦法與職掌視角顯示待重新指派缺口，不把責任靜默移給上級。
- 程序型內容結構化：Current Phase 由人類決定是否建立 Stage／Step 並從工作事項主檔選取引用，可補充操作指示、控制點與證據要求，但不得複製工作事項身分；Future Phase 的 AI 可提出關聯建議，仍須人類接受後才套用。
- 參考對照調整：更新待確認的 ISO／創櫃板參考對照，不修改管理辦法永久代碼或產生符合性結論。

### 第一階段初步範圍

- 管理辦法完整編輯頁，承載 `MP` 建置中草稿的自由多媒體建立、閱讀與修改，至少支援文字、標題、清單、表格、圖片、圖片說明與連結；流程階段、原子步驟、工作事項引用及相關資源皆為按需語意元件，不得以 Inspector、Drawer 或 modal 取代主要編輯面。
- 第一階段制度物件只包含 `MP` 管理辦法；每份管理辦法具有不綁定 organization version 的永久身分與不可重用的 `MP-xxxx`。
- stable Content Block identity、由實際標題產生的章節定位，以及程序型內容可選擇使用的 Method Stage／Method Step；Method Step 仍最多引用一個主要 Work Item，一般 Content Block 可不建立流程關聯。
- 工作事項與執行／協作／審核等責任配置的共用權威，並由同一編輯面操作、由職位視角投影工作職掌。
- 既有組織架構頁內的工作事項配置模式：選定工作事項與責任類型後，以 Position 節點直接加入或移除責任；工作事項清單與完整配置使用既有左側表面及 Inspector，不建立新頁面或永久第三欄。
- 需要責任同步的 Content Block／Method Step 可引用既有工作事項，並投影責任職位與目前任職人員；一般正文不要求引用。
- 管理辦法、工作事項、Position 三個視角的雙向導覽與關聯查詢。
- ISO 9001、創櫃板內控與企業流程的可選多對多參考對照，預設標示為待確認。
- 表單、參考文件與作業範例的 Related Resource 輕量連結；不建立正式文件物件、檔案版次或執行紀錄。
- 缺少 owner position、工作事項引用、主執行或責任職位時的可見客觀缺口提示；不提示核准角色或合規涵蓋缺口。
- 永久代碼與「建置中草稿／非正式受控文件」標示；不建立正式文件生命週期。
- 受控互動閱讀 registry：章節定位／深層連結、補充抽屜、折疊補充內容、點擊／鍵盤說明、圖片燈箱及關聯明細；正文移除互動後仍須完整可讀。
- Content、Relation、Presentation 分離的概念邊界，讓未來 AI 能以 stable identity 產生可審查 ChangeSet；Current Phase 不實作 AI 自動編修。

### 明確不在第一階段

- DOCX 匯入／匯出、來源檔保存、舊文件代碼／版次／檔名／章節追溯、PDF、列印排版、紙本表單與電子簽章憑證。
- 手機建立、修改、配置、核准或發布管理辦法、工作事項及責任關係；手機只讀由 DEV-033 治理。
- 交易系統自動取證、實際控制測試、稽核抽樣及 CAPA 全流程。
- 自動判定 ISO 符合性、創櫃板申請通過或法律合規結論。
- AI 自動推薦、判斷或建立工作事項與管理辦法步驟的關聯；第一階段由人類判斷，系統只提供同步編輯、搜尋、引用與客觀缺口。
- AI 自動起草、改寫、ChangeSet orchestration、模型／提示版本、AI 成本與自動套用；上述能力屬 Future Phase，Current Phase 只保留相容資料邊界。
- Google Docs 作為正式正文權威、Google Docs／OrgMaster 雙向同步，或讓 AI 直接以字元 index 覆寫外部文件；Workspace 本階段只作輔助環境。
- 任意 HTML／CSS／JavaScript、遠端 script、任意 iframe、文件專屬程式碼或自由互動元件；呈現只能使用受控 registry。
- 正式身分提供者、跨公司多租戶、外部會計師入口、通知與排程。
- 文件版次、organization snapshot、審核／核准角色與流程、生效／失效／取代狀態、正式發布及文件職責分離管制。
- ISO／創櫃板對照的正式維護責任、獨立檢視結果、定期確認、符合率或合規判定。
- `SYS`、`POL`、`WI`、`FM`、`REC` 等其他制度物件及其專用介面、資料或流程。
- Related Resource 的檔案上傳、內容解析、版本管理、有效性檢查、正式文件身分或實際填寫紀錄；Current Phase 只保存人工維護的顯示名稱、類型與連結。
- 詳細資料庫 schema、API route、migration、元件檔案與測試案例；這些在升級 `RD Contract Ready` 後定義。
- 新增獨立責任配置頁、永久第三欄、第二份全職位清單或為組織選位另建 modal；現行 `/duty-planning*` 只保留到 DEV-032 實作建立相容入口為止。
- 工作事項／流程專用的職責重疊風險分級、替代控制、例外理由、自動職責分離判斷或新警示系統；本階段只沿用既有兼任風險設定及資料完整性驗證。
- 責任配置專用的職位搜尋、部門篩選、職位清單、鍵盤選位或其他組織圖替代選位表面；本階段直接點選既有組織圖 Position。

### 驗收方向（Brief 層級）

- 管理辦法具有完整編輯頁，可自由承載長篇文字、表格、圖片、清單與說明；需要時才加入流程階段、原子步驟、工作事項引用、品質／內控要求、紀錄／證據要求與相關資源連結，不得要求使用者在組織圖 Inspector、Drawer 或 modal 中完成整份編輯。
- 每份管理辦法在所有編輯與閱讀入口均清楚標示「建置中草稿／非正式受控文件」，且不存在核准、發布、生效、失效、合規分數或符合性徽章。
- 管理辦法清單由完整編輯頁的按需切換器承載，不建立另一個清單 route、永久清單側欄或儀表板；頁面正文是唯一主焦點。
- 章節導覽依實際標題定位長文但不顯示完成率或合規計分；固定14章只可作起始範本，不得要求填滿。正文不以每章卡片框住，只有具獨立操作邊界的流程、表格、圖片或互動元件使用最小容器。
- 使用者只建立一次工作事項，即可在同一編輯面設定執行、協作與審核等責任；不得要求為每種責任建立重複工作事項。
- 使用者可在需要責任同步的 Content Block／Method Step 就地搜尋／引用既有工作事項、快速建立共用工作事項及編輯其基本內容；任何修改都操作同一 Work Item identity，並以最小訊號表明會同步其他引用。
- Method Stage 可包含多個原子 Method Step；一個 Method Step 在 Current Phase 最多引用一個主要 Work Item，草稿可暫時未連結並顯示待補缺口。若原型證明階段分組或拆步驟造成流程失真，須回到產品決策，不得由 RD 私自改成任意多引用。
- 作業提醒、品質標準、控制要求與證據要求能關聯適用步驟，但不得為了符合一對一引用而被建立成虛假的 Work Item。
- 「用人單位主管」等情境角色不會被系統自動轉成 Position；規劃者由步驟前往組織圖人工選位後，返回原步驟看見同一 Work Item 的責任投影。
- Related Resource 可保存目前使用表單／參考文件／範例的名稱、類型、連結及步驟關聯；介面不存在上傳來源 DOCX、舊代碼、舊版次、原始檔名、來源章節或差異追溯欄位。
- 桌面／筆電使用者不離開既有組織架構頁，即可選定一項工作事項、切換責任類型並直接從組織圖選擇 Position；流程不得再產生一份全職位複製清單。
- 工作事項選定後，大型清單可收合為最小任務列；組織圖持續是主焦點，完整責任配置只由既有 Inspector 按需呈現，不得同時疊加第二個 Drawer 或永久第三欄。
- 配置模式下點選 Position 只改目前工作事項的明確責任關係，不得同時移動組織階層、調職員工或修改職位；離開模式後原本組織操作恢復。
- 每次配置沿用自動保存與 Undo／Redo；一般成功不需另一個批次套用動作，主執行衝突、inactive target 或 stale state 則維持零錯誤提交及可理解恢復路徑。
- 舊 `/duty-planning*` deep link 在目標實作後能回到組織架構頁並恢復工作事項配置上下文，不呈現第二套主要工作流。
- 使用者編輯一次工作事項名稱後，管理辦法、工作事項及職位工作職掌視角不得出現舊名稱副本。
- 使用者調整責任配置後，可從同一管理辦法步驟看見新的責任職位；不得要求人工修改制度正文或另一份職掌主檔。
- 從管理辦法前往組織圖前必須完成草稿保存；完成／取消／瀏覽器返回後均恢復原管理辦法、步驟、捲動與焦點上下文，保存失敗則保留輸入並停留原頁。
- 解除工作事項引用不得刪除 Work Item 或任何 Responsibility Assignment，且同一編輯 session 可復原。
- 已被任何 Method Step 引用的 Work Item 不得刪除；系統須顯示引用位置並要求先解除引用，既有 `DELETE_DUTY` cascade 不得跨越管理辦法參照邊界。
- 任一職位的工作職掌都可由「責任類型＋工作事項」投影，並能反查同一工作事項的其他執行、協作及審核職位。
- 系統能以同一工作事項為邊界，顯示缺少主執行、職位停用及無人任職等既有客觀缺口；兼任風險只沿用既有設定，不新增工作事項層級的職責重疊風險判斷。
- 責任配置只能直接點選組織圖 Position，不出現 DEV-032 新增的職位清單、搜尋、部門篩選、鍵盤選位或另一套選位結果；既有組織圖的一般功能不受影響。
- 使用者更換職位任職人員後，管理辦法規定的職位不變，而目前任職人員正確更新。
- 任一管理辦法皆可同時建立 ISO 及創櫃板內控的待確認參考對照，且兩種對照不產生兩份管理辦法正文或符合性結論。
- `MP-xxxx` 不因部門、流程或參考條文改變而變更；代碼一經使用不得配給另一份管理辦法。
- 由既有文件人工整理建立的新管理辦法只顯示新的 `MP-xxxx` 與新電子內容，不要求也不提供舊文件追溯入口。
- 三個視角均可反查關聯與缺口；電子閱讀不依賴可列印文件。
- 手機可完整閱讀三個視角與關聯，但不存在可成功寫入的 UI 或 client mutation path；桌面／筆電仍須符合既有 workspace mode 與編輯條件才可修改草稿或責任配置。
- 空白、局部載入、保存失敗與無責任配置狀態都在受影響位置提供單一、可恢復的回饋；正常成功沒有常駐通知，責任及狀態不只靠顏色辨識。
- 閱讀模式可使用受控章節定位、抽屜、折疊、點擊／鍵盤說明、圖片燈箱及關聯明細；移除 presentation configuration 後正文仍完整可讀，執行責任、必要動作、核准條件、時限、必留紀錄及品質／安全／法令／內控要求不能被隱藏型元件收起。
- Content Block 移動、前方插入內容或正文一般修改後，工作事項關聯、受控呈現及跨頁返回仍指向同一 stable identity；系統不得把易漂移的字元位置作唯一關聯鍵。

### 已確認假設與升級 RD Contract 前工作

已確認且不得再作為 Current Phase 人類決策阻塞：

1. 管理辦法具有獨立永久身分，不與 organization version 共用生命週期；Current Phase 不建立文件 revision 或 organization snapshot。
2. 第一階段全部為單一建置中草稿，不建立核准角色、狀態轉換、發布、生效、失效或取代語意。
3. 品質檢視者、內控檢視者、最終核准者及其職責分離規則延後；Current Phase 不建立文件簽核權限。
4. ISO／創櫃板對照只作人工、待確認的參考資料；正式維護責任、確認週期、依據版本與檢視結果延後。
5. 第一階段制度物件只納入 `MP` 管理辦法；`POL`、`WI`、`FM`、`REC` 等類型延後。
6. 既有文件只供人工整理內容，不建立舊代碼、版次、檔名、來源檔、章節對照或其他追溯資料；新的 Management Method 是唯一權威。
7. 管理辦法採自由多媒體正文；固定14章降為選填模板，Method Stage／Method Step 只供程序型內容按需使用。
8. 正文與結構化關聯由 OrgMaster 保存；Google Workspace 只作登入、來源、附件、備份與外部協作，不建立雙向正文同步。
9. 長期採 AI 90% 編修工作量目標，但人類保留100%制度決策與變更套用權；Current Phase 不實作 AI 自動編修。

PM 升級 `RD Contract Ready` 前仍須完成的工程／原型工作；第 3、4 項已完成技術原型，仍待代表使用者評估：

1. 定義 Management Method、stable Content Block、選填 Method Stage／Method Step、Work Item reference、Presentation Configuration、Related Resource 與現行 organization state 的 domain authority、資料邊界、保存及失敗恢復契約。
2. 把「一般內容不強制結構化」、「程序型階段只分組」、「一個步驟零或一個主要 Work Item」、「被引用 Work Item／Content Block 禁止破壞性刪除」、「解除關聯不連鎖刪除要求／控制／證據／資源」及 stale／missing reference 恢復，轉成可驗證的 domain／command 邊界。
3. `Technical prototype complete / Human evaluation pending`：人員增補管理情境已驗證章節導覽、階段與原子步驟、共用 Work Item 重複引用／快速建立／就地編輯、Related Resource、人工選位及步驟／焦點恢復；仍須由制度規劃者與部門主管執行代表性任務，證據見 `output/playwright/dev032-prototype/manifest.md`。
4. `Technical prototype complete / Compatibility contract pending`：已確認直接點組織圖 Position、文字化責任標記與最小任務列可用，未新增責任配置專用搜尋／清單／篩選／鍵盤選位；舊 `/duty-planning*` deep-link 的正式對應、DEV-031 退場與保存邊界仍待 RD Contract。
5. 定義草稿標示、待確認參考對照、桌面編輯／手機只讀、永久代碼不可重用、Related Resource 失效、保存失敗、解除引用不刪主檔，以及不存在舊文件追溯欄位的可驗收行為。
6. 以至少一份原則型辦法、一份程序型辦法及一份含表格／圖片的辦法驗證自由正文與選填語意元件；驗證固定模板不是完成前提。
7. 定義 declarative presentation registry、必要內容不可隱藏分類、鍵盤／觸控等價操作、內容清理與任意 code injection 阻擋邊界。
8. 比較可嵌入編輯器與現有 repo 的相容性、授權、內容輸出、表格／圖片、stable identity 擴充及未來 ChangeSet 操作能力；不得只因前次概念提到特定套件就固定 provider。

上述工作完成後，PM 才可補足 migration、API/UI 契約、驗證策略與檔案 allowlist，升級為 `RD Contract Ready`。OrgMaster／Workspace 權威邊界、stable Content Block、Presentation Configuration、未來 ChangeSet 及 revision 擴充會影響長期資料相容性；待編輯器候選與實際資料模型可比較時，再判斷建立或合併 ADR。本輪仍維持 `Brief Ready`，不預先固定套件、模型供應商或 schema，也不建立 ADR。

### Future Phase Capsule

`Future Phase Captured / Not Requested`：把系統升級為正式受控文件系統，包括文件 revision、organization snapshot 引用、審核／核准流程、生效／失效／取代狀態、品質／內控／最終核准職責分離、合規對照維護責任與確認紀錄，以及 `POL`、`WI`、`FM`、`REC` 等制度物件。只有公司準備發布第一份正式生效管理辦法、進入 ISO 9001 輔導／預稽核、需要多人分工審核，或必須保留系統內歷史有效版本時才重新進入；回補時須另立 DEV 或 phase contract，且沿用既有 `MP-xxxx` 與工作事項／職位關係，不得重建重複主檔。正式版本治理只從系統啟用後的新 revision 開始，不預設回補舊 DOCX 的代碼、版次、檔名或來源追溯。

`Future Phase Captured / Not Requested`：建立 AI 原生編修能力，使 AI 讀取 Content、Relation、Presentation 與適用組織關係後，產生可逐項審查的 ChangeSet，目標承擔約90%的文字起草、改寫、表格整理、一致性檢查、關聯與閱讀呈現建議；人類保留全部套用、責任職位、制度目的與例外決策。重新進入條件為 stable Content Block／presentation registry／人工編輯保存已穩定，且使用者另行確認模型供應、資料外送／隱私、成本、提示與模型版本留存、失敗回復及驗證門檻。AI 不得直接覆寫 system of record 或注入任意 HTML／CSS／JavaScript。

高影響但不納入 Current Phase：把執行紀錄、控制測試、稽核發現、矯正措施與管理辦法控制點串成證據鏈；觸發條件為正式受控文件 phase 的發布語意已穩定，且使用者另行確認要管理「實際執行證據」而不只管理制度定義。回補時須另立 DEV 與驗證策略，不得直接擴張 DEV-032。

`Future Phase Captured / Not Requested`：新增工作事項／流程專用的職責重疊風險分級、替代控制與例外原因。只有現有兼任風險設定無法支援已確認的內控情境，且使用者另行要求流程層級治理時才重新進入；目前不得預先建立規則或警示。

`Future Phase Captured / Not Requested`：新增組織圖以外的責任選位方式，例如職位清單、責任配置專用搜尋／部門篩選或鍵盤選位。只有真實使用證據顯示組織圖節點選位已造成可重現的尋找失敗或效率問題時才重新進入；目前不得作為成長預留而先行實作。

### 變更紀錄

- 2026-08-24：Human-confirmed freeform／AI-native／interactive-reading direction：管理辦法改以自由多媒體電子正文為第一權威，固定14章降為選填模板，Method Stage／Step 只供程序型內容按需使用；OrgMaster 保存正文／關聯，Google Workspace 只作登入、來源、附件、備份與外部協作。Current Phase 新增 stable Content Block 與 declarative presentation 的架構限制及受控 TOC／drawer／collapse／popover／lightbox／relation detail 驗收方向，禁止任意 code injection 與隱藏必要控制。AI 約90%編修工作量與 ChangeSet 審查列入 Future Phase，人類保留100%制度決策與套用權。本輪只更新 `Brief Ready` 文件與索引，未修改產品程式、schema、API、測試或原型。
- 2026-08-24：Interactive prototype implementation：依使用者要求執行 DEV-032 可操作原型。新增 `/management-methods` 的 14 章人員增補管理辦法、七階段／九原子步驟、共用 Work Item、Related Resource 與既有組織圖 responsibility mode；Position 以文字顯示責任並精確返回原步驟，手機為條件式唯讀且 deep link 不可進入配置。`npm test` 38 files／212 tests、`npm run build`、桌面／390px Chromium flow 與 console 檢查通過；證據在 `output/playwright/dev032-prototype/manifest.md`。原型資料為 session-only，未建立正式 schema／API／persistence，狀態仍非 `RD Contract Ready`。
- 2026-08-24：Real management-method refinement／Human-confirmed no legacy trace：以人員增補管理情境檢查 DEV-032，新增 Method Stage、原子步驟分類、情境角色人工選位及 Related Resource 輕量連結方向；Current Phase 明確不保存舊代碼、舊版次、原始檔名、來源檔、來源章節或差異追溯，也不建立 DOCX 匯入。本輪只更新 `Brief Ready` 文件與索引，未建立 spec／ADR、schema、API、UI 或修改產品程式。
- 2026-08-24：Brief detail continuation：新增決策狀態總表、概念物件契約、零或一個主要 Work Item reference 假設、共用資料刪改／參照完整性、缺口與恢復語意及真實流程原型計畫。確認既有 `DELETE_DUTY` cascade 在 DEV-032 實作後不得刪除仍被 Method Step 引用的 Work Item，列為 future `Intentional replacement`；本輪仍是 Brief 文件工作，未建立 schema／API/spec 或修改產品程式。
- 2026-08-24：Design-thinking refinement：以「一個新頁面、兩個既有工作表面」補齊管理辦法 UX；完整編輯頁用按需文件切換器、章節導覽與單一正文捲動區，工作事項可在步驟中搜尋／快速建立／就地編輯，責任只在組織圖配置。定義保存後跨頁、精確返回步驟、權威投影、解除引用不刪主檔、空白／錯誤／鍵盤／手機唯讀及原型驗證方向；均為 Brief 層 AI assumption，未建立 spec、未修改產品程式。
- 2026-08-24：Human-confirmed draft-first scope：Current Phase 定位為「制度內容編製與職掌關聯工具」，只支援 `MP` 管理辦法及單一建置中草稿；保留獨立永久身分與 `MP-xxxx`，但不建立 revision、organization snapshot、核准／生效／失效／取代、合規維護責任或其他制度物件。正式受控文件治理已改列 Future Phase，並以首次正式發布、ISO 輔導／預稽核、多人審核或歷史有效版本需求作為重新進入條件。本輪只更新 Brief，未修改產品程式。
- 2026-08-24：Human-confirmed scope convergence：管理辦法確定使用完整編輯頁；「不新增頁面」只限制責任配置，後者維持既有組織架構頁直接點選 Position。本階段不新增責任配置專用搜尋／清單／篩選／鍵盤選位，也不新增工作事項層級的職責重疊風險規則，只沿用既有兼任風險設定及資料完整性驗證；兩項擴充能力已保存為 Future Phase。本輪只更新 Brief，未修改產品程式。
- 2026-08-24：Human-confirmed future `Intentional replacement`：責任配置沿用既有組織架構頁，不新增頁面、永久第三欄或全職位複製清單；工作事項清單選定後收合為最小任務列，以責任類型＋Position 節點完成配置，既有 Inspector 按需顯示完整內容。一般變更沿用 organization autosave／Undo，配置模式暫停衝突的組織 mutation；DEV-031 在 DEV-032 實作前仍是現行產品與歷史證據基線。本輪只更新 Brief，未修改產品程式。
- 2026-08-23：套用專案最高產品原則與 DEV-033；DEV-032 的管理辦法、工作事項及責任配置只在桌面／筆電提供編輯，手機僅完整唯讀。本輪未修改產品程式。
- 2026-08-23：Human-confirmed `Intentional replacement`：產品語意固定為「工作事項→責任配置→職位」，各職位工作職掌由關係投影；資料採兩層但在同一編輯面完成，不採角色文字各自成為獨立工作事項。AI 推薦／語意判斷降為 Future Phase 輔助；本輪維持 `Brief Ready`，不建立 spec／ADR、不進入 RD。
- 2026-08-22：依使用者確認的三類資料整合、ISO 9001／創櫃板雙重架構與穩定文件編碼原則，建立 `Brief Ready`；未進入 RD。

## DEV-031：同頁待處理來源欄與全職位展開式職掌編輯器

狀態：完成（`RD Implementation Complete / QA-QC Passed`）  
文件成熟度：`RD Implementation Complete`  
節點類型：交付點  
優先級：P1  
來源 ID：`USER-2026-08-21-DUTY-ONE-PAGE-LEFT-TO-RIGHT-EXPANDED-EDITOR`  
父任務：DEV-029、DEV-030  
計入交付：是  
風險等級：Medium（替換主要職掌資訊架構、三 route 呈現、異常分類、Pointer target 與 scroll ownership；不改 Duty／relation 資料、保存或權限契約）  
執行邊界：本輪已完成 S0–S4 本機實作、automated tests、build 與真實 Chromium QA／QC；未授權 deploy 或 release。

權威契約：`ai-doc/specs/DEV-031-duty-master-detail-editor.md`

Supersession update：DEV-032 的新簡化 Current Phase 已撤回「以組織圖責任配置模式取代本 DEV」的規劃；該方向現由 DEV-034 的獨立 RD Contract 承接。DEV-031 的 `/duty-planning*` 工作檯、程式、測試與完成證據繼續作為現行產品基線，直到 DEV-034 另行達到實作與驗證完成；不得引用 DEV-032 的歷史段落直接實作。

### 原始需求

現行責任矩陣讓「執行／審核／協作」各占完整欄位，長執掌難以閱讀。後續 Human-confirmed 修訂要求待處理職掌位於最左、以由左到右完成拖拉；刪除選取單一職位的統一執掌區，右側直接攤開全部職位與職掌；職位責任 counts 不顯示，待處理原因改以分類 heading 呈現而不逐項重複。

### 問題與使用者價值

規劃者的主要任務是從待處理來源出發，把 Duty 放到合適職位，同時掃描其他職位的完整內容。分頁與 selected-position 都增加情境切換；數量摘要及逐卡異常標籤則占用掃描注意力，卻不改變放置決策。

本 DEV 以「左側分類來源＋右側全職位展開」建立單一工作流：來源與目標同頁，責任類型改為職位內縱向群組與必要 exact-lane Badge，長文使用右側完整寬度；桌面拖拉、edge auto-scroll、鍵盤／觸控配置與 Undo 共同保障可操作性。

### Human Direction（已確認）

- 不再讓執行、審核、協作各自占一個完整內容欄。
- 待處理職掌固定在最左側，使用者由左到右完成配置。
- 刪除 selected-position 統一執掌區、職位 selector 與責任 filter；右側一次展開所有符合條件的 active 職位與職掌。
- 不顯示 `執 n｜審 n｜協 n`、責任總數或 group count。
- 待處理項目依「無執行職位／缺少主執行／待重新分配」分類；分類文字只在 heading 顯示一次，不逐 item 重複 Badge。
- 優先保障長文閱讀、全局掃描及高效率拖拉；以 edge auto-scroll 控制全展開帶來的垂直長度。

### UX Intent

- 使用者與情境：總經理、主管或組織治理人員，在組織版本中查看並調整各職位的工作執掌責任。
- 主要工作方式：由左側待處理分類找到來源，向右拖到任一展開職位；也能掃描長執掌並移動或複製既有 relation。
- 主要工作物件：單一 anomaly source 或單一 Duty-position exact relation；不是整個 Duty 的全部責任關係。
- 成功結果：使用者能在五秒內辨識左側來源、右側所有職位目標與可拖控制；不靠分頁或 selected state 即可完成配置。
- 最可能誤解：以為拖到另一職位會搬移整個 Duty、以為分類標籤可任意改變精確 relation type，或把審核／會簽當成真正送審流程。
- 安全預設：拖放保留來源的精確責任 lane；無效目標零變更；非主執行仍明確選擇移動／複製；成功後不導頁並沿用 organization state、Undo／Redo、500ms autosave、Ctrl+S 與 version CAS。

### 建議資訊架構

```text
┌─ 待處理職掌 ──────────┬─ 全部職位與職掌 ─────────────────────────┐
│ 無執行職位             │ 總經理｜管理部                              │
│ ⠿ 年度產能規劃        │   執行                                      │
│ ⠿ 客訴原因追蹤        │   ⠿ [主責] 制定年度經營策略與資源配置…    │
│                        │   審核                                      │
│ 缺少主執行             │   ⠿ [審核] 核定重大資本支出與政策…        │
│ ⠿ 設備保養制度        │                                             │
│                        │ 生產部經理｜生產部                          │
│ 待重新分配             │   執行                                      │
│ ⠿ 月度庫存盤點        │   ⠿ [主責] 建立年度生產計畫並依訂單…      │
│   原職位：倉儲專員     │   協作                                      │
│                        │   ⠿ 與業務及採購協調交期與物料…            │
│                        │                                             │
│                        │ 設備技師｜工程部                            │
│                        │   尚無職掌                                  │
└────────────────────────┴─────────────────────────────────────────────┘
```

- 左側是待處理來源，依 anomaly type 分類；分類名稱只顯示一次，item只放 Duty title，待重新分配才補原職位 context。
- 右側一次展開所有符合職位／部門 filter 的 active positions；每個 position 只顯示非空責任群組，完全空白仍保留安靜 drop row。
- 職位 heading與group heading均不顯示 counts；不存在 selected position、selector、tabs或責任 filter。
- 執行群組以「主責／共同」短標籤保留精確語意；審核群組以「審核／會簽」短標籤保留精確語意；協作不重複顯示群組名稱。
- 每筆執掌自然換行並允許完整閱讀；不以固定單行省略號解決長文問題。點擊／Enter 仍開啟既有工作執掌明細，不在每列常駐第二套表單或設定按鈕。
- 版面使用對齊、留白、群組標題及必要分隔線建立層級，不把每筆執掌做成卡片，也不建立框中框。

### 拖拉與編輯方向

1. 左側 anomaly source row與右側 relation row在editable desktop均提供專用drag handle；handle恢復原生 HTML `draggable`，title click只開明細；Pointer事件保留作瀏覽器／裝置 fallback。
2. 右側整個 position section是大範圍target；drop只決定職位，來源exact lane由current state還原，不依游標位於哪個group推測類型。
3. 主執行跨職位固定移動；其他relation沿用move／copy chooser，取消時零變更並回來源、分類heading或target heading。
4. pointerup重新以current state hit-test與validate；invalid、same-position、inactive、duplicate、cancel、blur與stale均零變更。
5. 右editor啟用edge auto-scroll，pointer接近上下48px時最高14px／frame，讓viewport外職位可成為target；drop／cancel後立即停止。
6. 鍵盤或觸控以列級配置選單搜尋全部active positions，使用同一validator及move／copy分流；390px不要求touch drag。
7. 成功drop不導頁或改selected state，只就地更新分類／position sections並短暫highlight目標；現有order不足以跨Duty排序，人工排序仍不在本期。

### Current Scope

- `/duty-planning`為canonical unified workbench；`/duty-planning/matrix`與`/duty-planning/anomalies`只作同composition相容alias，不再是獨立編輯頁。
- 建立最左側待處理分類來源欄，右側一次展開所有active positions及非空縱向責任群組。
- 移除職位選取、職位selector、執／審／協數量、責任總數、分類filter與逐item異常Badge。
- 保留五種精確 lane：主執行、其他執行、審核、協作、會簽；只改可見資訊架構，不合併 domain 語意。
- 保留 anomaly／relation跨職位移動／複製、position-section有效目標、edge auto-scroll、取消、焦點回復與Undo／Redo。
- 保留點擊開啟既有工作執掌明細；不新增逐列常駐設定 CTA。
- 390px採待處理在上、全部position sections在下的單一document flow；是否可編輯仍由workspace／version決定，不由viewport決定。

### Out of Scope

- 不以拖放或單擊分類標籤改變 relation type；不自動決定主責／共同、審核／會簽的轉換。
- 不改 Duty、DutyPositionRelation、organization document schema、API route、保存生命週期、version CAS、權限或異常規則。
- 不搬移整個 Duty 的全部 relations，不新增多選、批次配置、AI 建議或自動負荷平衡。
- 不新增 selected position、職位tab、責任filter、position／group counts、負荷KPI或逐item異常label。
- 不新增送審、approve／reject、通知、登入 principal、版本 ACL、跨裝置或 production／release 工作。
- Current Phase 不要求觸控拖拉；窄版與觸控裝置必須保留可完成同一任務的明確選單入口。

### 效用取捨

評估權重以長文閱讀30%、拖拉配置30%、全局掃描20%、分類辨識10%、RWD 10%為基準：

| 方案 | 預估效用 | 主要取捨 |
| --- | ---: | --- |
| 現有四欄矩陣 | 3.0／5 | 類型比較直接，但長文與窄版成本最高 |
| 獨立master-detail頁 | 3.7／5 | 文字寬，但待處理來源與目標被拆開 |
| 同頁左來源＋單一選取職位 | 4.0／5 | 拖拉直接，但跨職位閱讀仍需切換 |
| 同頁左分類來源＋右全職位展開 | 4.6／5 | 同時最大化長文、全局與拖拉效用；以垂直捲動承擔成本 |

Current Phase 採最後一案；用固定職位排序、搜尋、部門filter、sticky heading與edge auto-scroll控制垂直長度，不用counts、tab或selected detail折回資訊。

### 驗收方向

- 同一頁左側為待處理分類來源，右側為全部符合條件的active position sections；三個route呈現相同composition。
- 不存在selected-position editor、職位selector、四欄matrix、責任filter或前往獨立矩陣／異常頁的入口。
- position／group不顯示任何責任counts；三種異常label只在分類heading顯示，item不重複Badge或數量。
- 1440×900與1024×768下，長執掌自然換行、完整閱讀；左右scroll owner清楚且沒有document水平overflow。
- 390×844採單一flow，待處理在上、全部positions在下；不靜默改唯讀，也不要求touch drag才能完成配置。
- 所有active positions一次展開；空group省略，完全空position仍保留可drop row，Duty query零match不移除position target。
- 主責／共同、審核／會簽精確標籤正確；分類標籤不是唯一顏色訊號。
- 桌面可由左側anomaly或右側relation handle拖到任一position section；title click不誤觸drag。
- 右editor edge auto-scroll可到達viewport外職位；drop後不導頁，只就地更新與highlight。
- 無效目標、Escape、pointer cancel、blur、stale release與取消move／copy均零資料變更。
- 主執行固定移動，其他 relation 明確選擇移動／複製；完成後可由同一 organization Undo 復原。
- 鍵盤／觸控配置選單可搜尋全部active positions並與pointer使用相同validator，不得繞過exact lane或active限制。
- Browser QC至少覆蓋三分類、長文、空group／position、搜尋、遠端position auto-scroll、anomaly／relation move／copy、無效放置、Undo、focus recovery、readonly、三route及三viewport。

### Historical Implementation Evidence（Superseded）

- 舊master-detail版曾完成`DutyMasterDetailEditor`、relation row與placement menu；35 files／200 tests、build及1440／1024／390 browser QC通過，證據位於`output/playwright/dev031/`。
- 後續Human-confirmed方向已取代其主要UI flow，故上述證據只保留為歷史，不支撐本版done判定。
- 新版完成證據為`output/playwright/dev031-revision/manifest.md`，覆蓋同頁分類來源、全職位sections、無counts／重複label、edge auto-scroll契約與三route同composition。

### Spec Impact Preflight

- 分類：`Intentional replacement`。修訂版取代DEV-029緊湊matrix＋右anomaly的composition、DEV-030逐item異常Badge，以及舊DEV-031獨立master-detail／selected position／counts；不回寫或否定歷史完成證據。
- 保持相容：五個精確責任 lane、來源 operation unit、drop validator、主執行固定移動、其他 relation 移動／複製、currentState、Undo／Redo、500ms autosave、Ctrl+S 與 version CAS。
- 不受影響：anomaly identity／repair semantics、Duty明細、organization command與保存生命週期。
- ADR：不新增；本期不改資料權威、schema、route ownership或保存。若實作必須改 relation ordering data contract、schema、API或保存權威，立即回 PM 判定 ADR／spec amendment。
- 權威文件：`ai-doc/specs/DEV-031-duty-master-detail-editor.md`；本段保留 PM 摘要與人類方向，不建立平行成熟度文件。

### 限制、假設與下一步

- 程式事實（已完成）：三route現均 render 同一`DutyPlanningWorkbench`composition；兩個舊明細route只作相容alias，舊`DutyMasterDetailEditor`已移除。
- 程式事實：現有資料／command 足以表達跨職位移動／複製，但不足以表達同 lane 不同 Duties 的人工排序；排序已移出 Current Phase。
- 下一步：DEV-031 已完成；若提出同lane人工排序或跨責任類型轉換，依Future Phase另立DEV。任何domain／API／schema／保存或ordering authority變更先停止回PM。

### Future Phase Capsule：跨 Duty 的同 lane 人工排序

狀態：`Future Phase Captured / Not Requested`

- 目的：在同職位、同 exact lane 內手動排列不同 Duties。
- 邊界：先定義 order scope、stable key、dense normalization、move／copy插入位置、migration、CAS conflict與keyboard等價操作。
- Re-entry trigger：使用者明確要求上移／下移、同欄插入或自訂排序時另立 DEV，不得直接擴張 DEV-031 Current Phase。

### Future Phase Capsule：跨責任類型轉換

狀態：`Future Phase Captured / Not Requested`

- 目的：允許使用者把 relation 拖到其他責任群組或透過分類控制變更責任類型。
- 邊界：必須先定義主責／共同、審核／會簽的明確轉換選擇、唯一主執行不變量、duplicate handling、Undo 與 audit 語意；系統不得依放置位置自行猜測。
- 依賴：DEV-031 Current Phase 穩定、relation conversion contract 與對應 validator／確認 UI。
- 驗收方向：每次轉換都有明確來源、目標精確 lane、影響摘要與可復原結果；取消及無效轉換零變更。
- Re-entry trigger：使用者明確要求跨責任群組拖放、點標籤改類型或批次轉換時，另行升級契約。

### 變更紀錄

- 2026-08-21：升級為 `RD Implementation Ready / RD Not Started`；建立 `ai-doc/specs/DEV-031-duty-master-detail-editor.md`，完成 route-specific component、position-row hit-test、release revalidation、keyboard／touch替代操作、RWD、file allowlist、S0–S4、QA／QC與runtime cleanup契約。程式盤點確認現有 order 無法跨 Duty 排序，因此移出 Current Phase。
- 2026-08-21：完成 S0–S4 實作與 QA／QC；新增 route-specific master-detail components、long-text rows、placement menu、position hit-test、release revalidation、focus recovery與responsive CSS。`npm test` 35 files／200 tests、`npm run build`、Chromium三 viewport與compact/anomaly regression通過；未 deploy／release，測試 fixture 已清理。
- 2026-08-21：依使用者提供的責任矩陣截圖與效用理論方向建立 `Brief Ready`；固定職位主清單、統一全寬執掌區、縱向責任群組、桌面專用拖拉把手、跨職位保留精確 lane、RWD替代操作與跨類型轉換 Future Phase。本輪未修改產品程式、資料、runtime、deploy或release。
- 2026-08-21：Human-confirmed `Intentional replacement`：待處理來源移至最左並改為三類heading，右側全active positions攤開；刪除selected-position editor、獨立頁面、position／group counts與逐item異常label，新增position-section target與edge auto-scroll契約。DEV-031改為`RD Implementation Ready / Implementation Needs Correction`；舊`output/playwright/dev031/`降為歷史證據，本輪未修改產品程式。
- 2026-08-22：完成 DEV-031 S0–S4：新增 unified workbench、分類來源列、全職位展開 sections、position target、rAF edge auto-scroll、keyboard／touch placement menu、三 route alias convergence；移除舊 `DutyMasterDetailEditor` 與 dead CSS。`npm test -- --run` 36 files／205 tests、`npm run build`、1440／1024／390 Chromium QC、drag smoke（含復原）與 console error sweep 通過；證據位於 `output/playwright/dev031-revision/`，未 deploy／release。
- 2026-08-22：依使用者回報「拖曳功能遺失」補回 editable desktop 的原生 HTML `draggable` fallback。source handle 以 `dragstart`／`dragover`／`drop`／`dragend` 接回既有 position hit-test、validator、move／copy與Undo；Pointer／鍵盤／觸控路徑不改，readonly仍不建立寫入入口。Chromium `dragTo` smoke 成功後移除測試關係並確認來源恢復；`npm test -- --run` 36 files／205 tests、`npm run build`、console error 0 通過。證據位於 `output/playwright/dev031-drag-recovery/`，未 deploy／release。
- 2026-08-22：依使用者要求將右側職位 editor 調整為桌面密集版：header／group／row／empty-state 垂直留白約減半，長文仍自然換行，390px 觸控版不壓縮。`npm test -- --run` 36 files／205 tests、`npm run build`、1440／1024／390 Chromium 截圖、compact drag smoke 與 console error 0 通過；證據位於 `output/playwright/dev031-compact-right/`，未 deploy／release。

## DEV-030：異常職掌卡片精簡與點擊／長按互動

狀態：完成（`RD Implementation Complete / QA-QC Passed`）  
文件成熟度：`RD Implementation Complete`  
節點類型：交付點  
優先級：P1  
來源 ID：`USER-2026-08-19-DUTY-ANOMALY-CARD-CLICK-LONG-PRESS`  
父任務：DEV-029  
計入交付：是  
風險等級：Medium  
執行邊界：已完成S0–S5本機實作／QA／QC；未執行部署或 release，Human Confirmed仍待使用者確認。

權威契約：`ai-doc/specs/DEV-030-duty-anomaly-card-press-interaction.md`

### 原始需求

將右側異常佇列的卡片改為參考圖左側的緊湊配置；紅線標示的左側操作區與「設定」入口刪除。使用者不再依賴拖曳把手或逐卡設定按鈕，而是以單擊卡片開啟與職掌矩陣一致的工作執掌明細、長按卡片啟動移動。

### 問題與使用者價值

現行卡片把職掌名稱、異常 Badge、拖曳把手與「設定」按鈕拆成多層容器。每張卡都重複顯示操作入口，使異常佇列看起來像表單而不是可直接處理的工作物件；在大量職掌下，也增加視線移動與窄欄位的擁擠。

DEV-030 要把卡片本身變成唯一操作表面：規劃者先看見職掌與異常，再透過短按開啟工作執掌明細或長按移動。價值是減少重複控制項、放大命中範圍、提升掃描速度，同時保留 DEV-029 的草案、驗證、預覽與原子套用保護。

### Human Direction（已確認）

- 右側異常卡片採參考圖左側的緊湊資訊配置。
- 紅線標示的拖曳把手、可見「設定」文字／按鈕與其專用操作區刪除。
- 單擊卡片取代「設定」按鈕，並沿用職掌矩陣的工作執掌明細入口。
- 長按卡片取代拖曳把手。
- 本次只改互動入口與卡片呈現，不改工作執掌、責任關係或草案套用的業務語意。

### UX Intent

- 使用者與情境：總經理或主管在桌面版責任配置工作台掃描並處理異常職掌。
- 主要工作物件：右側單一 Duty 卡中的明確異常項目；不是整個共用 Duty record。
- 成功結果：使用者能在五秒內辨識職掌、異常與卡片可操作性，且單擊與長按不互相誤觸。
- 操作主權：短按開啟工作執掌明細，長按負責選取移動來源；卡片不再提供配置 Popover，拖曳後必要的 move／copy 決策與全域草案工具列仍維持既有正式套用邊界。
- 安全預設：短按只開明細、長按只進入移動準備；放置前不修改草案，正式資料仍須經預覽與套用。
- 不得發生：單擊同時啟動拖曳、長按結束後又開啟明細、無效放置產生草案，或多重異常由系統猜測修復項目。

### 卡片視覺語法

```text
┌────────────────────────────────┐
│ 治具設計與發包   [無執行職位] │
└────────────────────────────────┘
```

- 職掌名稱與異常 Badge 同列；空間不足時 Badge 可自然換行，但不得裁切名稱或製造水平捲動。
- 移除左側嚴重度色條、拖曳把手、內層空白操作框與可見「設定」CTA；異常嚴重度只由 Badge 的文字、形狀與色彩共同表達。
- 常態卡片不畫外框、圓角或常駐底色；以所在清單／矩陣的水平分隔線建立層級，hover只做輕微底色，focus使用清楚且不改變尺寸的外框。
- 長按期間以漸進外框或輕微浮起表達 `pressed`；進入移動後顯示 `picked-up`／ghost 與 `grabbing` 狀態，不用永久教學文字佔據卡片。
- `待處理` 卡可操作；`已規劃`、唯讀或窄版卡片不得顯示可移動游標或啟動寫入手勢。
- 同一 Duty 有多個異常時仍只顯示一張外層卡片；標題只出現一次，各異常保留獨立且可辨識的手勢區，避免系統猜測修復語意。

### 主要互動流程

1. 使用者單擊異常卡片／異常手勢區，系統開啟與職掌矩陣相同的工作執掌明細；短按本身不建立草案。
2. 使用者按住同一操作區，卡片先顯示 `pressed` 回饋；達長按門檻後進入 `picked-up`，後續移動才開始拖曳。
3. 一旦進入長按移動，本次 pointer sequence 必須抑制 click，不得在放開時再開啟工作執掌明細。
4. 移動期間只標示 DEV-029 validator 判定可接受的矩陣儲存格；放在有效目標時沿用既有 move／copy／repair 分流。
5. 放在空白或無效目標、按 `Escape`、發生 pointer cancel 或失去操作主權時，回到 idle 且零草案變更。
6. 鍵盤不模擬長按；`Enter`與`Space`均開啟工作執掌明細，`Escape`依明細層行為關閉並將焦點還給來源卡片。
7. 卡片級配置 Popover、目標職位選擇與「設定」入口移除；`不再指派`仍由完整異常頁既有流程處理，拖曳後必要的 move／copy 決策 Popover不由卡片短按觸發。

### 互動狀態

| 狀態 | 可見回饋 | 可用行為 |
| --- | --- | --- |
| `idle` | 中性卡片、標題與異常 Badge | 單擊或開始長按 |
| `hover / focus` | 穩定邊框、陰影或 focus ring | 提示卡片可操作 |
| `pressed` | 漸進外框或輕微浮起 | 等待長按門檻；尚未修改草案 |
| `detail` | 工作執掌明細接管操作與焦點 | 查看／編輯名稱、說明與職位關係 |
| `picked-up / dragging` | ghost、來源選取與有效 drop target | 放置或取消；不觸發 click |
| `planned / readonly` | 安靜狀態 Badge，無拖曳暗示 | 沿用既有查看／復原流程，不可啟動新寫入 |

### Current Scope

- 改造 `/duty-planning` 右側異常佇列的卡片資訊層級與操作入口。
- 單擊卡片開啟與矩陣一致的工作執掌明細，長按卡片進入既有配置拖放流程。
- 將左側矩陣的可編輯職掌關係卡接入相同的長按 Pointer 拖曳 surface，放置仍共用同一 validator 與 move／copy chooser。
- 保留一 Duty 一張外層卡、多重異常明確分流、待處理／已規劃分區與同一 plan lifecycle。
- 保留 DEV-029 的 drop validator、move／copy 規則、草案投影、autosave、預覽與原子套用。
- 保留鍵盤等價操作、焦點回復、取消與錯誤恢復。
- 建立 hover、focus、pressed、picked-up、dragging、planned 與 readonly 的穩定視覺狀態。

### Out of Scope

- 不改變左側矩陣的責任欄位限制與 move／copy 語意；本輪移除矩陣／異常卡片級配置 Popover，並將矩陣卡片接入與異常卡相同的 Pointer 長按 surface。
- 不重設 `/duty-planning/anomalies` 完整明細頁的表格／篩選資訊架構。
- 不改 Duty、relation、plan V2、API、資料格式、CAS、receipt、journal 或 apply transaction。
- 不新增手機／窄版編輯、觸控拖曳、多選、批次配置或自動建議。
- 不新增送審、主管核准、權限、登入 principal、跨裝置或 release 工作。

### 驗收方向

- 右側單一異常卡片的職掌名稱與 Badge 同列；畫面不存在左側色條、拖曳把手、可見「設定」CTA或空白操作框。
- 卡片在 hover、focus、pressed 與 dragging 時有穩定且非僅顏色的回饋，不因狀態切換造成尺寸跳動。
- 短按只開啟工作執掌明細；不建立草案，也不開啟卡片級配置 Popover。
- 長按進入移動後不再觸發 click；有效放置沿用 DEV-029 validator，無效放置與所有取消路徑零變更。
- 同一 Duty 有多重異常時，標題不重複、各異常仍可分辨且操作來源明確，系統不得自行猜測。
- 工作執掌明細開啟時由其接管 pointer、鍵盤與輔助科技操作；關閉後焦點回到原卡片。
- `Enter`、`Space`均可開啟工作執掌明細，`Escape`可關閉；唯讀／已規劃狀態不暴露可成功寫入的長按手勢。
- `1440×900`、`1024×768` 與 `390×844` 無重疊、裁切、非預期 overflow 或捲動責任混亂；窄版維持唯讀。
- Browser QC 必須涵蓋短按開啟明細、長按未移動、長按有效放置、長按無效放置、pointer cancel、Escape、明細 focus recovery與多重異常。
- UI 不得出現可見 API／HTTP／raw error、Not Found、Internal Server Error 或未提供恢復方式的 alert。

### 限制、風險與固定工程決策

- 長按在桌面不是最常見的拖曳入口；可發現性以 hover／pressed／picked-up 回饋與 panel 層級可及提示補足，不在每張卡永久放教學文字。
- 長按門檻固定為`450ms`，啟動前移動容差固定為`6px`；超過容差取消gesture並抑制pointer click。
- 原生 HTML `draggable` 無法可靠表達「計時達標後才開始拖曳」；右側anomaly固定採Pointer Events狀態控制器，並於pointerup以current state／plan重新呼叫既有drop validator。
- 多重異常時，一 Duty 維持一張外層卡，但每個異常是獨立手勢區；這是沿用DEV-029 `HD-029-03`，不是系統猜測或整Duty搬移。
- 異常佇列與矩陣關係卡共用 `DutyCardDragSurface`；兩者均使用450ms Pointer 長按，來源仍由 `DutyPlacementSource` 區分，touch／pen不啟動寫入型長按，窄版維持唯讀。

### Spec Impact Preflight

- 分類：`Intentional replacement`。使用者本輪明確以卡片單擊／長按取代 DEV-029 右側 anomaly item 的可見設定按鈕與 drag handle。
- 保持相容：DEV-029 的操作單位、drop validator、move／copy／repair、plan V2、投影、CAS、preview與atomic apply不變。
- 受影響權威契約：`ai-doc/specs/DEV-030-duty-anomaly-card-press-interaction.md`已明確supersede DEV-029第6.3、7.1、13.4、14.2節中右側異常來源的handle／native drag／keyboard入口描述；DEV-029既有完成證據不回寫。
- ADR：不需要。此變更是局部、可逆的互動入口替換，不改資料權威、跨模組資料流或外部契約。

### 下一步與執行邊界

已完成`RD Implementation Complete / QA-QC Passed`。新增純手勢模組、卡片與Popover互動、Pointer拖放 bridge、ghost、rAF hit-test、release revalidation、focus recovery與多異常回歸；定向3 files／12 tests、完整39 files／207 tests、build及五viewport browser QC均通過。不得自動deploy或release；Human Confirmed待使用者確認。

### 完成證據

- 測試：`npm test -- --run src/dutyAnomalyPressInteraction.test.ts src/dutyPlacement.test.ts src/dutyPlanningPresentation.test.ts`（3 files／12 tests）；`npm test -- --run`（39 files／207 tests）。
- 建置：`npm run build` 通過；僅有既有 Vite native extension 與 bundle size warning。
- Browser：重用既有 localhost:5000，1440px 完成單擊工作執掌明細、450ms 長按、ghost、候選 cell、有效放置與 plan count 還原；1279／1024／1023／390px 完成版面、唯讀邊界、overflow、visible error與console/network sweep。
- Evidence：`output/playwright/dev-030/wide-1440.png`、`medium-1279.png`、`desktop-boundary-1024.png`、`readonly-boundary-1023.png`、`readonly-mobile-390.png`、`readonly-1440.png`、`anomaly-click-duty-detail.png`。
- Runtime／資料：既有 OrgMaster localhost:5000（PID 42456，非本任務建立，未停止）；測試用 current plan intent 已透過 API 還原為原始4筆；未deploy／release。

### 變更紀錄

- 2026-08-19：完成 DEV-030 S1–S5 實作與驗證：新增純手勢狀態模組與測試、單一卡片／多異常呈現、單擊工作執掌明細、Pointer 長按拖放 bridge、ghost、rAF hit-test、release revalidation、拖曳後 move／copy 決策 focus recovery與回歸測試；39 files／207 tests、build與五viewport browser QC通過，未deploy／release。
- 2026-08-19：依使用者指示移除矩陣／異常卡片級「配置」入口、目標職位欄位與其 Popover；保留單擊明細、長按拖曳及非主執行放置後必要的 move／copy 決策，不改資料模型或套用邊界。
- 2026-08-19：依使用者後續指示，以異常佇列卡片為權威新增共用`DutyCard`；異常佇列、矩陣、完整異常頁與職位側欄不再各自繪製Duty卡片，只由容器提供Pointer長按、唯讀或導覽行為。完整異常頁單擊可開同一工作執掌明細；39 files／207 tests、build與localhost:5000 browser／console QC通過，未deploy／release。
- 2026-08-19：依使用者後續指示，將異常卡片單擊入口改為與職掌矩陣一致的工作執掌明細；planned／readonly卡片同樣可點擊查看，長按移動流程維持不變，完成瀏覽器 snapshot驗證。
- 2026-08-19：依使用者後續指示補上工作執掌明細 Escape 關閉；關閉後回復原觸發卡片焦點，完整測試、build與瀏覽器鍵盤驗證通過。
- 2026-08-20：依使用者指示移除頁首「完整職掌矩陣」與「完整異常」兩個導覽入口；兩個完整 URL 明細頁保留直接網址與既有內容，不改工作台資料或規劃流程。
- 2026-08-20：依使用者後續版面指示，連同頁首剩餘的「責任配置工作台」導覽按鈕與其佔位列一併移除；頁首改為品牌、工具列與返回操作的單行排列，完整明細頁仍保留直接網址。
- 2026-08-20：依版面比對結果，矩陣搜尋與部門篩選固定收斂在左側矩陣標題列；移除編輯狀態下仍會出現的「新增工作執掌」入口，避免頁首／矩陣工具列出現額外操作區塊。
- 2026-08-20：依最新左右圖方向校正版面：搜尋／部門篩選移至頁首，矩陣區移除標題工具列；刪除黃色唯讀提示與「職掌矩陣」標題佔位區，編輯模式的「新增工作執掌」入口改由頁首工具列承載。
- 2026-08-20：依使用者要求移除工作台的框中框視覺；左右區塊改以單一分欄線、矩陣列／異常項目／同欄多職掌改以水平線分隔，常態DutyCard不再有外框、圓角、陰影或底色。輸入控制、Badge與拖曳／鍵盤暫態回饋保留；分類為DEV-030視覺契約的`Intentional replacement`，不改資料、API或業務流程。完整39 files／209 tests、build、1440×900／1024×768／390×844 browser QC與console error sweep通過。
- 2026-08-20：依使用者要求將左側矩陣改為密集Y軸排版；資料列上下留白縮至4px、矩陣compact DutyCard最小高度縮至26px，右側異常佇列與文字尺寸不變。1280×720同畫面完整可見列由15增至22，1024×768／390×844無水平溢出、職掌文字裁切或可見錯誤；39 files／209 tests與build通過，不改資料、API與拖曳／明細互動。
- 2026-08-20：依使用者後續要求移除同一責任欄內相鄰執掌的中間線，gap縮為0，compact DutyCard最小高度由26px降至24px；雙執掌列由61.6px降至56.8px，文字大小、右側異常佇列及拖曳／明細互動不變；39 files／209 tests與build通過。
- 2026-08-19：依使用者後續指示開放職掌矩陣卡片拖曳；矩陣關係卡與異常卡共用 `DutyCardDragSurface`／`DutyCardDragPreview`，統一 Pointer 長按、非主執行 move／copy chooser與同一 release validator，並補上矩陣 pressed／picked-up 視覺回饋；未改資料模型、API或套用邊界。
- 2026-08-19：依使用者回報「仍然無法拖曳」完成根因修正：移除矩陣對原生HTML5 drag啟動的依賴，矩陣卡與異常卡統一450ms Pointer長按；待套用關係來源可替換同一來源plan intent或拖回原位撤銷，異常卡與矩陣卡共用validator。
- 2026-08-19：依使用者提供的左右參考圖建立 DEV-030 `Brief Ready`；固定單一卡片表面、刪除紅線控制項、單擊設定、長按移動、鍵盤替代與既有草案安全邊界。本輪未修改產品程式、runtime data、deploy或release。

## DEV-029：工作執掌責任配置工作台

狀態：完成（`RD Implementation Complete / QA-QC Passed / Human Confirmed`）  
文件成熟度：`RD Implementation Complete`  
節點類型：交付點  
優先級：P1  
來源 ID：`USER-2026-08-19-DUTY-ALLOCATION-WORKBENCH-DRAG-DROP`、`USER-2026-08-19-DEV-029-RD-IMPLEMENTATION-READY`  
父任務：DEV-028  
計入交付：是  
風險等級：Medium

權威契約：`ai-doc/specs/DEV-029-duty-allocation-workbench.md`  
架構決策：沿用並修訂 `ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`

### 原始需求

將既有「職掌矩陣」與「異常與規劃」降為明細層；主層改為兩者的合併頁。左側顯示職掌責任矩陣，右側顯示有異常的職掌。規劃者可把右側異常職掌拖到左側矩陣，也可在左側矩陣的職位／責任欄位間拖曳移動職掌關係。

### 問題與使用者價值

現況把「看全貌」與「處理缺口」拆成兩個頁籤。總經理或主管必須反覆切換，才能判斷某項職掌目前由誰執行、缺少哪種責任，以及應移交給哪個職位。這使組織責任配置變成逐頁查找，而不是同一個決策畫面。

本交付點要建立「責任配置工作台」：讓規劃者在同一視野比較現況與異常，直接以空間操作形成配置草案，並在正式寫入前檢查整體影響。核心價值是降低搜尋、記憶與誤配成本；不是增加一套送審流程。

### Human Direction（已確認）

- `/duty-planning` 為主層合併頁，不再以兩個頁籤作為主要操作入口。
- 左側為職掌矩陣，右側為有異常的職掌。
- 可將右側異常職掌拖入左側矩陣進行配置。
- 可在左側矩陣內拖曳，將職掌責任關係移到其他職位／位置。
- 原「職掌矩陣」及「異常與規劃」保留，但降為明細層。
- 拖曳單位不是整個共用 `Duty`：右側拖曳卡片內的個別異常項目；左側拖曳單一 `DutyPositionRelation`。
- 主執行關係拖到其他職位時固定為永久移動；其他執行、審核、協作與會簽關係放下後，由使用者選擇「移動」或「複製」。
- 第一階段只允許在相同責任欄跨職位拖曳，不允許用拖曳改變責任類型。
- 放下後只建立暫存草案，不立即寫入正式組織版本；所有變更最後共用一次「預覽並套用」。
- `1024–1279 CSS px` 維持左右分欄，右側異常區可由使用者收合；`<1024 CSS px` 維持唯讀。
- 右側分成「待處理」與「已規劃」：只要職掌仍有未處理異常，整張卡留在待處理區；全部異常都已有修復草案後，整張卡才移到已規劃區。同一職掌不得在兩區重複顯示。
- `1024–1279 CSS px` 首次進入時右側異常區預設展開；之後記住同一瀏覽器的上次展開／收合狀態。
- 非主執行關係放下後，在目標儲存格旁顯示小型「移動／複製」選擇框；取消時回到拖曳前狀態，不建立草案。
- 「已規劃」區預設收合並顯示職掌數量，使用者可手動展開檢查。

### 工程與可用性邊界

- 拖曳之外必須提供鍵盤／選單操作，確保可及性與精準操作。
- 平板與手機延續 DEV-028 的保護界線；窄版不以觸控拖曳作為正式配置入口。

完整 UI 行為、資料／API、相容性、錯誤、恢復與驗收以權威契約為準。

### 資訊架構

```text
/duty-planning                         主層：責任配置工作台
├─ 左：職掌矩陣（職位 × 責任類型）
│  └─ DutyPositionRelation chips
├─ 右：異常職掌佇列
│  ├─ 待處理：至少一個異常尚無修復草案
│  └─ 已規劃：全部異常均已有修復草案
├─ 全域：草案狀態、捨棄、預覽並套用
├─ /duty-planning/matrix               明細層：完整矩陣
└─ /duty-planning/anomalies            明細層：完整異常與規劃
```

主層負責決策與配置；兩個明細層負責大量查看、搜尋及診斷。明細層不得另建互不相容的草案，三個頁面必須讀寫同一個 organization version plan。

### 主流程

1. 規劃者進入 `/duty-planning`，同時看到左側責任矩陣與右側異常佇列。
2. 規劃者從右側選取一個異常修復項目，或從左側選取一筆既有責任關係；不得拖動整個共用職掌。
3. 拖曳期間，系統只標示可接受該項目的目標儲存格；無效目標不接受放下。
4. 主執行關係放下後建立「移動」草案；其他關係放下後先選擇「移動／複製」，再建立對應草案。右側異常則依該異常的修復語意建立草案；任何放下都不立即寫入正式資料。
5. 系統更新矩陣投影與異常卡狀態。尚有未處理異常的卡留在待處理區；全部異常已規劃的卡移到已規劃區。規劃者可繼續配置、逐項復原或捨棄全部草案。
6. 規劃者使用單一全域入口預覽影響，確認後再原子套用；若失敗，保留草案與可理解的錯誤狀態。

### 第一階段範圍

- 將 `/duty-planning` 改為左右合併的責任配置工作台。
- 保留 `/duty-planning/matrix` 與 `/duty-planning/anomalies` 作為明細層完整 URL。
- 左側以職位為列，僅顯示執行、審核、協作三個責任欄；執行卡以主責／共同區分，審核欄卡片以審核／會簽區分，底層五種精確責任關係不變。
- 職位列依既有部門順序分組，各部門內以`parentPositionId`做主管在前的前序排列，同一主管下的平行職位沿用`OrgMember.order`；未設定部門最後顯示，排序不改寫正式資料。
- 右側每項職掌永遠只顯示一張卡；若有多個異常，卡內分別顯示，不得合併嚴重程度或在待處理／已規劃兩區重複整張卡。
- 支援右側異常修復項目拖到左側有效目標。
- 支援左側單一責任關係在同責任欄跨職位配置；主執行固定移動，其他責任關係由使用者選擇移動或複製。
- 放下後形成暫存計畫並投影結果；支援逐項復原、捨棄全部、預覽及整批套用。
- 拖曳與鍵盤／選單替代操作共用相同驗證與命令語意。
- `>=1024 CSS px` 顯示左右分欄；在 `1024–1279 CSS px` 右側異常區可收合，`<1024 CSS px` 維持唯讀且不提供觸控拖曳。
- `1024–1279 CSS px` 首次預設展開右側異常區，後續保存同一瀏覽器的最後狀態；已規劃區預設收合並顯示數量。

### 初步行為矩陣

| 來源 | 可放置目標 | 草案語意 | 第一階段 |
|---|---|---|---|
| 右側「無執行職位」 | 目標職位的執行欄 | 建立主執行關係 | 納入 |
| 右側「缺少主執行」 | 目標職位的執行欄 | 指定主執行；不得產生兩個主執行 | 納入 |
| 右側「待重新分配」 | 目標職位中與原精確責任lane相容的可見欄 | 以同責任類型重建失效關係 | 納入 |
| 左側主執行關係 | 另一職位的執行欄 | 固定永久移動；來源移除、目標新增 | 納入 |
| 左側其他責任關係 | 另一職位的相同可見欄 | 保留原精確責任lane，放下後選擇移動或複製；複製時保留來源 | 納入 |
| 左側任一責任關係 | 不同責任類型欄 | 不接受放下；不得用拖曳變更責任類型 | 不納入 |

若一張右側職掌卡同時有多個異常，每個異常項目各自提供拖曳起點；本次修復意圖由起點決定，不得靠目標欄位或系統猜測。

### 驗收摘要

- 主入口呈現合併工作台，原兩個頁面可由明確入口進入明細層，不再以主頁籤互斥顯示。
- 桌面主畫面可同時看見矩陣與異常佇列，且三個頁面使用同一版本、同一草案資料。
- 同一職掌即使有多個異常仍只占一張右側卡，卡內可分辨每個異常及其嚴重程度。
- 開始拖曳後只有符合規則的儲存格顯示可放置狀態；無效放置不改變草案或正式資料，並提供非僅顏色的原因提示。
- 主執行放到另一職位時不出現複製選項；其他責任關係放到同欄有效目標後，必須明確選擇「移動」或「複製」，取消選擇時不得產生草案。
- 非主執行關係的選擇框顯示在目標儲存格旁；開啟時不遮蔽來源與目標，按 `Escape`、點擊取消或關閉選擇框都恢復拖曳前狀態並回復焦點。
- 有效放置只更新草案投影；來源顯示「將移出」，目標顯示「待套用」。右側個別異常顯示規劃狀態；只有整張卡的所有異常均已規劃，才移到已規劃區。
- 所有暫存變更共用一個「預覽並套用」入口；套用必須維持 DEV-028 的 version CAS、plan CAS、單一主執行及原子性約束。
- 套用失敗或版本衝突時不得遺失草案；使用者能看見錯誤、重新載入／調和或返回修改。
- 每個拖曳動作都有等價的鍵盤或選單操作，且通過相同驗證。
- 響應式版面不產生雙重捲動陷阱；`1024–1279 CSS px` 可收合右側異常區，`<1024 CSS px` 不開放編輯或觸控拖曳。
- 同一瀏覽器會保存中型版面異常區的最後展開狀態；清除本機資料或首次使用時採預設展開。已規劃區預設收合並顯示正確職掌數量。

### 不在第一階段

- 放下即直接寫入正式組織版本。
- 拖動整個共用職掌並隱含移除所有責任關係。
- 新增送審、核准、通知或工作流程引擎。
- 登入 principal、版本 ACL、每人私有草稿、跨裝置同步或 lease／接手。
- 職掌版本比較、獨立移轉歷程或新的細粒度職掌權限。
- 手機／窄版的編輯與觸控拖曳。
- 多選、批次拖曳或自動最佳化配置。

### 限制、依賴與主要風險

- **分流操作複雜度**：主執行固定移動，其他責任關係須於放下後選擇移動或複製；鍵盤替代操作、取消與焦點回復必須使用相同分流規則。
- **關係不是職掌本體**：`Duty` 是版本內共用資料；可移動的是責任關係，否則可能誤刪其他職位的審核／協作／會簽。
- **複合異常**：同一職掌可同時有多個異常。畫面維持一張卡，但命令必須針對一個明確修復意圖。
- **單一主執行約束**：所有預覽、鍵盤操作與拖曳都必須共用同一 invariant，不得由 UI 自行繞過。
- **計畫模型擴充**：權威契約已固定plan V2 additive union、exact symbols、outer V1＋record V1／V2 parser、target-only lazy migration與V1→V2 verifier；RD不得另建第二個store或順帶升級其他version plan。
- **畫面密度**：矩陣本身可能水平與垂直溢出，右側佇列也需要捲動；工作台須指定單一頁面捲動責任及區域 sticky 行為。
- **合併欄誤轉風險**：矩陣雖精簡為三個可見責任欄，拖放仍必須由來源保留五個精確lane；不得把主責轉成共同或把審核轉成會簽。

### Human Decision Brief

決策來源：使用者於 2026-08-19 以引導模式回覆 `1C 2A 3A`、`4B 5A 6B`、`7C 8A 9B`、`10A`，其後明確要求「補到 RD 可實作」。

- `HD-029-01`：主執行固定為移動；其他責任關係放下後讓使用者選擇移動或複製。拒絕「所有關係固定移動」及「非主執行固定複製」。
- `HD-029-02`：第一階段只允許同責任欄跨職位拖曳。跨欄改變責任類型保留為 Future Phase。
- `HD-029-03`：複合異常以卡片內個別異常項目為拖曳單位。拒絕放下後再選異常及由系統自動猜測。
- `HD-029-04`：`1024–1279 CSS px` 維持左右分欄，右側異常區可收合。拒絕改為 drawer 或上下排列。
- `HD-029-05`：拖曳只建立暫存草案，最後統一預覽並套用。拒絕每次拖曳立即寫入或離頁自動套用。
- `HD-029-06`：仍有未處理異常的職掌留在待處理區；全部異常已規劃後，整張卡移到已規劃區。同一職掌仍只顯示一張卡。
- `HD-029-07`：中型版面首次預設展開右側異常區，之後記住同一瀏覽器的上次狀態。拒絕每次固定展開或固定收合。
- `HD-029-08`：非主執行關係放下後，在目標儲存格旁顯示小型移動／複製選擇框；取消不建立草案。拒絕中央 modal 或移至右側屬性區。
- `HD-029-09`：已規劃區預設收合並顯示職掌數量，可手動展開。拒絕永遠展開或完全不可展開。
- `HD-029-10`：文件下一成熟度採`RD Contract Ready`，先供RD評估、估工與排程，不直接展開為可修改程式的Implementation Ready。
- `HD-029-11`：使用者後續明確要求「補到 RD 可實作」，因此在不改`HD-029-01`至`09`產品語意下，沿用同一spec升級為`RD Implementation Ready`；這是文件成熟度續階，不代表授權本輪直接修改產品程式。

### Human Decision Status

P0／P1產品語意與Current Phase implementation contract均已確認，沒有待人類決策項目。若RD實作發現必須改變已確認的move／copy、同欄、草案、responsive或apply語意，命中stop condition並重新請Human Decision。

### RD Implementation Contract Summary

- Spec Impact：以`Intentional replacement`把DEV-028兩頁籤主流程改成合併工作台；V6、plan authority、CAS與atomic apply為`Compatible extension`。
- Plan：新增schema V2 union，既有repair intent不變，placement intent保存source snapshot、move／copy、target與copy relation ID；合法V1 plan須無損讀取並於下次成功保存延遲升級。
- Projector：使用immutable base與canonical intent set，先做touch conflict檢查，再處理pending repair、active relation placement、primary gap及dense order normalization；不得靠畫面順序選winner。
- API／transaction：沿用既有GET／PUT／DELETE／preview／apply、600ms autosave、雙CAS、receipt、idempotency與journal roll-forward，不新增正式schema或第二個store。
- UX／QA：固定三個完整URL、三個可見責任cell／五個精確lane、drag＋keyboard等價操作、兩個scroll owner與五個viewport gate；可見runtime error直接判定QC失敗。
- ADR：不新增；ADR-006已補記repair＋placement plan V2及僅含boolean的presentation preference。
- File boundary：固定17個必要修改檔、10個允許新增檔與2個條件式測試檔；禁止修改V6、`src/types.ts`、dependency、Vite、真實`data/`及deploy／release。
- Exact mapping：固定`DutyPlanIntent`、`DutyRelationPlacementIntent`、issue identity、pure drop validator、view model、preference helper、route surface、V1／V2 parser及server apply normalize落點。
- Delivery slices：S0 baseline→S1 domain→S2 persistence→S3 route/shell→S4 workbench→S5 regression/QC；每階段有targeted command與stop gate。
- Recovery：V2 placement plan不可降成V1；rollback前備份plan store，invalid/newer fail closed，migration fixture只使用temp directory，apply仍以journal roll-forward收斂。

### Future Phase Capsule

- 跨責任欄拖曳，明確把既有關係轉換為另一責任類型。
- 多選與批次配置、依負荷或職能提出非自動套用的建議。
- 窄版觸控編輯，以及更完整的無障礙拖放模式。
- 若未來加入跨裝置／多人協作，另立 plan ownership、lease、presence 與衝突調和契約。

### 下一步與執行邊界

已完成 `RD Implementation Complete / QA-QC Passed / Human Confirmed`。2026-08-21 依 `USER-2026-08-21-UNIFIED-SAVE-FLOW` 完成 Current Contract Replacement：保留左右合併工作台、完整 URL 明細、pointer drag 共用 validator 與 move／copy chooser；移除 plan V2 runtime、草案工具列、預覽／套用／捨棄、600ms plan autosave、plan API／store 與 responsive 唯讀邊界。現在所有職掌操作直接提交 organization command，與樹狀圖共用 Undo／Redo、500ms autosave、Ctrl+S、DocumentMenu 與 version CAS。本階段未部署、未 release，也未加入登入 principal、版本 ACL 或送審審核流程。

### 變更紀錄

- 2026-08-21：依使用者要求統整保存流程。移除 `useDutyPlan`、plan client API／mutation queue、`DutyPlanToolbar`、server plan API／store 掛載與其測試；拖放、move／copy 與異常修復改為單一 `COMMIT_DUTY_PLANNING_CHANGE` organization command，直接進入目前 state 與共用 Undo／Redo。執掌頁重用全域 `DocumentMenu`、500ms autosave、Ctrl+S 與 version CAS；移除預覽／套用／捨棄／待套用／已規劃 UI，並取消 `<1024 CSS px` 編輯控制的 CSS 停用。既有 `data/orgmaster-duty-plans.v1.json` 保留但不再讀寫。36 files／202 tests、production build、1440×900／1024×768／390×844 browser QC、舊 API 404 與 console sweep 通過；證據位於 `output/playwright/unified-save-flow/`。未部署或 release。
- 2026-08-20：依使用者要求將矩陣職位列改為「部門＋主從關係」排序；部門沿用既有catalog階層／顯示順序，部門內由主管到直屬／下層前序排列，平行職位沿用member order，跨部門parent作局部根。完整39 files／213 tests、production build及localhost:5000全體／生產部篩選頁面QC通過；未部署或release。
- 2026-08-20：依使用者要求移除頁首compact規劃工具列的「唯讀規劃」與待套用數量文字；唯讀頁面不再保留空白工具列，仍保留可編輯模式的捨棄／預覽套用動作及錯誤alert。未改plan資料、API或套用流程。
- 2026-08-20：依使用者要求新增頁首「搜尋職位」；只篩選矩陣職位名稱，與「搜尋工作執掌」分開，並補上中型寬度的頁首堆疊避免水平溢出。未改資料、API、拖曳或套用流程。
- 2026-08-20：依使用者要求移除矩陣底部的規劃說明與異常統計文字，避免與右側異常佇列重複；未改矩陣資料、篩選、拖曳或異常判定邏輯。
- 2026-08-20：依使用者要求再移除完整異常頁副標說明、唯讀窄版的規劃草案工具列，以及員工清單的操作提示；保留必要的異常篩選、可編輯套用流程與資料列操作。
- 2026-08-20：依使用者要求移除組織圖底部的 `canvas-tip` 操作提示膠囊（含無層級排版、拖曳與磁吸說明）；不改組織圖拖曳、定位、磁吸或其他控制項。首頁 Browser QC 確認提示不存在、React Flow／控制列／縮圖仍可用，無 alert 或水平溢出。
- 2026-08-20：依使用者要求移除員工、職位與部門清單卡片上的「⋯」操作按鈕，避免與右鍵選單重複；保留滑鼠右鍵、ContextMenu 鍵與 Shift+F10 操作，並將職位／部門提示改為「右鍵查看操作」。清單卡片改為無多餘操作欄的緊湊兩欄版面。
- 2026-08-20：修正員工、職位、部門與組織層級清單開啟右鍵選單時同步觸發左鍵選取／定位的副作用；滑鼠右鍵、ContextMenu 鍵與 Shift+F10 現在只開啟情境選單，左鍵選取與選單內明確命令維持原行為。完整 39 files／213 tests、production build，以及 1440×900、1024×768、390×844 真實瀏覽器互動與浮層邊界驗證通過；未部署或 release。
- 2026-08-20：依使用者要求為職位清單的「部門名稱」標題加上獨立外框；移除整個部門章節的外框，同一部門跨 L2/L3/L4/L5 時仍只顯示一次標題框，層級內保留細分隔線。未改排序、搜尋、選取、右鍵選單或資料模型。
- 2026-08-20：依使用者標註移除職位清單中層級群組之間的水平分隔線；保留部門名稱標題框與各層級標題底線，不改排序、搜尋、選取或右鍵操作。
- 2026-08-20：依使用者紅線標註移除職位清單與部門清單標題下方的操作提示文字；保留新增、搜尋、清單操作與右鍵選單，不改資料與互動邏輯。
- 2026-08-24：依使用者要求將左側清單抽屜內容寬度縮為原本約 2/3；桌面清單面板由 286px 調整為 190px，窄版由 190px 調整為 142px，保留 rail、清單內容與既有操作。
- 2026-08-20：依紅線標註精簡組織層級清單：移除層級數量、說明提示、常駐新增列、職位使用數與卡片內上下移／刪除按鈕；保留頁首「新增」入口，並將重新命名、上下移與刪除集中至層級卡片右鍵選單。層級資料與預覽排序流程不變。
- 2026-08-20：依使用者要求調整職位清單分組標題；同一部門跨多個組織層級時只顯示一次部門名稱，各層仍保留 L／層級標籤，避免重複文字與不必要的垂直佔位。搜尋、排序、選取與右鍵操作不變。
- 2026-08-20：依使用者要求移除四個主資料清單的圖像化元素：側邊清單導覽圖示、員工／職位／部門卡片頭像與層級 L 編號徽章；保留清單文字、層級名稱、搜尋、選取、拖曳及右鍵操作，並同步收斂卡片欄位與導覽列高度。
- 2026-08-20：依使用者修正要求復原層級清單卡片左側的 `L1／L2／L3…` 層級徽章；側邊導覽圖示、員工／職位／部門頭像仍維持移除，層級資料與右鍵操作不變。
- 2026-08-20：依使用者要求統整矩陣欄位；可見欄改為「職位／執行／審核／協作」，卡片保留主責／共同與審核／會簽短標籤。正式relation資料與五個精確責任lane不變，拖放從source解析原lane，不新增預設值或責任轉換。完整39 files／211 tests、production build與localhost:5000主頁／矩陣明細頁QC通過；未部署或release。
- 2026-08-19：使用者要求「補到 RD 可實作」；沿用DEV-029同一spec補齊workspace file allowlist、exact symbols、outer V1＋record V1／V2 parser、target-only lazy migration、現行API route、component wiring、native drag＋keyboard validator、S0–S5、targeted commands、browser evidence、runtime cleanup及rollback，升級為`RD Implementation Ready / RD Not Started`。Pre-implementation baseline為`npm test` 35 files／187 tests通過；本輪未修改產品程式、runtime data、deploy或release。
- 2026-08-19：完成DEV-029 RD實作與QA／QC；`npm test -- --run` 38 files／201 tests、`npm run build`、五viewport browser QC與manifest證據通過，狀態升級為`RD Implementation Complete / QA-QC Passed / Human Confirmed`。未部署或release。
- 2026-08-19：使用者確認`10A`；建立DEV-029 RD Handoff Contract，固定plan V2、V1相容、projector、route／UX、API／transaction沿用、QA／QC與stop conditions；ADR-006同步amendment。本輪未修改產品程式、runtime data、deploy或release。
- 2026-08-19：Human Confirmed `7C 8A 9B`；固定中型異常區首次展開並記住狀態、目標旁移動／複製選擇框及已規劃區預設收合顯示數量。Brief 升級為 `Brief Ready / Human Confirmed`。
- 2026-08-19：Human Confirmed `4B 5A 6B`；固定中型版面左右分欄且右側可收合、拖曳只進暫存草案並整批套用，以及待處理／已規劃分區規則。
- 2026-08-19：Human Confirmed `1C 2A 3A`；固定主執行移動、其他責任關係放下後選擇移動／複製、第一階段同欄拖曳及個別異常項目拖曳。
- 2026-08-19：依使用者提出的合併工作台與拖曳構想建立 DEV-029 Brief；保留已確認方向，將暫存套用、同欄移動、拖曳單位與窄版策略標示為待確認建議。

## DEV-028：工作執掌責任關係與永久移轉

狀態：完成（`RD Implementation Complete / QA-QC Passed / Human Confirmed`）  
文件成熟度：`RD Implementation Complete`  
節點類型：交付點  
父交付點：DEV-008、DEV-020、DEV-021  
是否計入產品交付完成：是  
原始需求邊界：在每個職位提供條列式工作執掌，讓治理使用者自行設定執行、審核、協作與會簽職位，並先交付永久移轉能力。

權威契約：`ai-doc/specs/DEV-028-duty-responsibility-planning.md`  
架構決策：`ai-doc/adr/ADR-006-versioned-duty-and-local-plan-storage-boundary.md`  
執行邊界：本輪依權威spec完成S1–S5本地產品程式、測試、API與UI；未修改production data、deploy或release。

完成證據：`npm test -- --run`（35 files／187 tests）、`npm run build`、V5→V6／Duty／commands／projector／store／API targeted tests、preview／atomic apply／plan removal、`/duty-planning` direct-load／reload／browser-back／`?position=`、localhost:5000 1440×900與390×844 browser QC；證據位於`output/playwright/dev-028/`及本輪 `.playwright-cli` 截圖。

## Human Decision Brief

- 決策日期：2026-08-18。
- 決策來源：使用者針對工作執掌規劃的直接確認與回饋。
- `Human Confirmed`：第一階段只做永久移轉，不做暫時代理或協作支援型移轉。
- `Human Confirmed`：系統不得依直屬主管、職位階層或其他組織資料自動帶入預設關係。
- `Human Confirmed`：每項工作執掌由治理使用者明確設定 `執行`、`審核`、`協作`、`會簽` 四種職位關係。
- `Human Confirmed / 1A`：同一執掌可有多個執行職位，但必須明確指定且只指定一個主執行職位。
- `Human Confirmed / 2 自訂`：第一階段的審核、協作與會簽只供關係設定及文字顯示；不產生送審、待辦、核駁、順序、法定人數或通過條件。
- `Human Confirmed / 3C`：同一職位可以同時具有執行、審核或會簽等重疊關係；系統只顯示非阻擋提醒，不要求例外理由。
- `Human Confirmed / 4A`：審核、協作與會簽三種關係都允許設定零至多個職位。
- `Human Confirmed / 5A`：每項工作執掌包含一行條列名稱與選填補充說明；第一階段不擴張為完整 SOP。
- `Human Confirmed / 6A（由 8A 補充收斂）`：每個組織版本各自保存工作執掌及職位關係，後續版本修改不得回寫舊版本；現階段不開發工作執掌的版本比較。
- `Human Confirmed / 使用情境`：現階段功能只協助總經理與主管規劃全員職掌，不作為員工工作待辦或正式簽核執行工具。
- `Human Confirmed / 7B`：同時提供全公司職掌清單／矩陣與個別職位細節入口；主管可先看全局，再進入個別職位調整。
- `Human Confirmed / 8A 補充`：不建立獨立永久移轉紀錄；現階段也不開發工作執掌的版本比較功能。每個組織版本仍各自保存，舊版本不受新版本修改影響。
- `Human Confirmed / 9A`：刪除只影響目前編輯中的組織版本，舊版本仍保留該工作執掌。
- `Human Confirmed / 10B`：全公司職掌矩陣以「每個職位一列」呈現，各關係群組內列出該職位參與的工作執掌。
- `Human Confirmed / 11A`：個別職位內依主執行、其他執行、審核、協作、會簽分組，且每組允許手動調整條列順序。
- `Human Confirmed / 12A`：永久移轉只處理主執行責任；目標職位成為主執行，來源職位移出執行關係，其他執行、審核、協作及會簽關係不變。
- `Human Confirmed / 13A`：同一職掌在同一組織版本內是單一共用資料；從任何可編輯入口修改名稱或說明，所有相關職位同步顯示，不建立職位專屬文字副本。
- `Human Confirmed / 14B 自訂`：允許刪除仍有職掌關係的職位；相關職掌與關係不得自動刪除，失效關係保留並標示為「待重新分配」，中央職掌規劃頁集中顯示這些異常。
- `Human Confirmed / 15A`：沿用組織版本既有的可編輯／唯讀狀態；可編輯該版本者可管理全部職掌，第一階段不建立職掌專屬權限或主管轄區限制。
- `Human Confirmed / 16A`：「待重新分配」只作明確警示，不阻擋儲存、其他編輯或版本使用；異常可存在於草稿或現行版，但必須持續可見。
- `Human Confirmed / 17A`：每筆待重新分配關係保留刪除當下的原職位名稱、原部門及原關係類型；不保存或顯示任職人姓名。
- `Human Confirmed / 18C`：中央異常集合允許勾選多筆待重新分配關係後批次改派，選取範圍可跨工作執掌及關係類型。
- `Human Confirmed / 19B 自訂`：批次修復使用同一張規劃表；每筆待重新分配關係可在表內指定不同目標職位，規劃者可同時查看與調整完整改派方案。
- `Human Confirmed / 20A 補充`：系統自動顯示同一職掌目前由哪些其他職位、以哪些關係共同承擔；若目標已具有同一職掌的相同關係則自動去重，規劃者也可為該異常選擇「不再指派」。
- `Human Confirmed / 21A`：套用前顯示完整影響預覽；確認後整批採全有或全無的原子更新，Undo／redo 將整批視為一個操作。
- `Human Confirmed / 22B 自訂（由 26A 細分）`：「不再指派」適用於所有待重新分配關係，包含原主執行關係；套用後移除該筆失效關係。若職掌因此沒有有效主執行，職掌仍保留，並依是否尚有其他有效執行職位轉為非阻擋的「缺少主執行」或「無執行職位」，持續集中顯示及允許後續修復。
- `Human Confirmed / 23A（由 27A、36 自訂補全）`：規劃表不提供目標職位預設值；同一職掌列內的待重新分配異常項目必須由規劃者明確選擇目標職位或「不再指派」，系統不得依主管、組織階層、其他承擔職位或前一異常選擇自動帶入。責任缺口異常項目同樣不得預填目標，並依 `27A／29A` 提供明確修復動作。
- `Superseded / 24A`：原確認的「每個異常一列」由 `36 自訂` 明確取代；異常仍各自保留，但表格改為每個工作職掌一列。
- `Human Confirmed / 25B`：新增或編輯工作職掌時，即使尚未指定主執行也允許保存；系統立即建立非阻擋異常並持續顯示，不得自動猜測或補派主執行。
- `Human Confirmed / 26A`：零個有效主執行時，依有效執行關係數量分成兩類非阻擋異常：尚有一個以上其他執行職位為「缺少主執行」，完全沒有有效執行職位為「無執行職位」。兩者須有不同文字、計數與篩選值。
- `Human Confirmed / 27A`：修復「缺少主執行」時，可將既有其他執行職位提升為主執行，也可選擇任一有效職位新增為執行並設為主執行；目標不預填。未處理時異常持續保留，不提供「不再指派」來消除警示。
- `Partially Superseded / 28B 自訂（由 31A、36 自訂收斂）`：失效關係與當前責任缺口的嚴重程度及管理意義仍必須分開顯示，不得合併成單一異常；但 `36 自訂` 取代「分成不同表格列」，改在同一職掌列的異常欄中分項呈現。所有異常仍維持非阻擋，嚴重程度依 `31A` 固定。
- `Human Confirmed / 29A`：修復「無執行職位」時，可直接選擇任一有效職位，由系統以單一原子操作建立執行關係並設為唯一主執行；不要求先另建一般執行關係，目標同樣不得預填。
- `Human Confirmed / 30A`：「待重新分配」、「缺少主執行」及「無執行職位」可跨職掌、跨關係類型混合選入同一張規劃表，完成整體預覽後以單一原子操作套用及 Undo／redo。
- `Human Confirmed / 31A`：異常嚴重程度固定為「無執行職位＝高」、「缺少主執行＝中」、「待重新分配＝提醒」。嚴重程度用於辨識及排序依據，不改變三者皆為非阻擋異常的規則。
- `Human Confirmed / 32A（依 36 自訂調整文案）`：中央頁同時顯示「異常筆數」與依工作職掌去重後的「受影響職掌數」；同一職掌包含兩種異常時，計為兩筆異常、一項受影響職掌，而表格仍只占一列。
- `Human Confirmed / 33A（依 36 自訂調整呈現）`：混合規劃中任一異常的規劃若已解除同職掌的另一項異常，另一異常仍在同列異常欄中保留可見並即時標示「將由相關規劃解除」，其衝突目標輸入停用；移除或修改前項規劃後，相關異常立即重新計算並在仍有異常時恢復可操作。最終結果不得依異常顯示順序或逐項套用順序而改變。
- `Human Confirmed / 34A（由 38A 補全）`：中央異常表預設先依高、中、提醒排序，同一排序層級再依工作職掌名稱排序；單列含多個嚴重程度時，依 `38A` 取該列目前最高嚴重程度作為列級排序鍵。
- `Human Confirmed / 35A`：套用篩選後，同時顯示全體與目前篩選結果的「異常筆數／受影響職掌數」，不得讓使用者把目前畫面誤認為全部異常。
- `Human Confirmed / 36 自訂 / Intentional replacement`：一個工作職掌不論包含多少異常，在中央規劃表永遠只顯示一列；其中一個「異常」欄位分項顯示該職掌目前有哪些異常及各自嚴重程度。此決策取代 `24A` 與 `28B` 的每異常分列方式，但不合併異常 identity、統計、修復語意或解除條件。
- `Human Confirmed / 37B`：中央表的異常欄只顯示該職掌全部異常的短標籤、嚴重程度及必要數量；原職位／部門快照、關係細節、目標選擇、「不再指派」與相依結果等詳細資料及修復操作移至右側明細。主表仍是批次規劃的全局入口，右側明細不得自行逐筆套用版本資料。
- `Human Confirmed / 38A`：單一職掌列以目前最高嚴重程度作為列級排序鍵；列內異常及右側明細依高、中、提醒排列，同一最高嚴重程度的職掌再依工作職掌名稱排序。
- `Human Confirmed / 39A`：異常類型篩選命中某職掌時，該列仍顯示該職掌全部異常標籤，符合篩選的項目提高辨識度，未命中項目不得隱藏；目前篩選的異常筆數只計命中項目，受影響職掌數則依命中職掌去重。命中狀態不得只靠顏色表達。
- `Human Confirmed / 40A`：右側明細採 fixed overlay drawer，不推擠、不縮窄中央表；開啟時可直接點選另一職掌列切換內容。關閉明細、切換職掌或改變篩選只改變目前畫面，不得清除尚未套用的批次規劃。
- `Human Confirmed / 41A`：整批「預覽並套用」只有一個入口，固定在中央表的持續可見工具列；右側明細只編輯規劃，不提供逐項、逐列或第二個整批套用入口。
- `Partially Superseded / 42B（由 56A 收斂）`：尚未套用的 batch plan 仍須自動保存；關閉明細、切換職掌、改變篩選及同機頁面重新整理後保留，恢復草稿不得等同自動套用。原「登出再登入後續接」移至 Future Phase。
- `Future Phase Captured / 43A（由 56A 延後）`：每位規劃者、每個組織版本一份私人草稿、登入身分隔離及真正跨裝置續接不在第一階段；未來建立可信 principal 與版本 ACL 後重新進入。
- `Human Confirmed / 44A`：草稿所依據的組織版本、異常集合或職掌關係被其他寫入改變時，系統重新計算 projected state；仍有效且不衝突的規劃輸入保留，衝突或已失效項目明確標示並要求重新選擇。所有衝突解除且重新預覽前，不得套用，也不得以舊草稿靜默覆蓋新資料。
- `Human Confirmed / 45A（依 56A 收斂）`：每次修改本機草稿後以短暫延遲自動保存；中央表工具列集中顯示「儲存中／已儲存／儲存失敗」。保存失敗時保留目前輸入並自動重試，離開頁面前警告；未完成持久化時不得顯示「已儲存」。
- `Human Confirmed / 46A（依 56A 收斂）`：整批套用成功後立即刪除該本機草稿；使用者也可主動「捨棄草稿」，但必須先確認。兩種情況都不保留或建立草稿歷史；正式批次資料的 Undo／redo 仍依既有 command 處理，不以草稿歷史替代。
- `Human Confirmed / 47A（依 56A 收斂）`：未完成本機草稿不因最後修改時間自動到期，持續保留到成功套用、使用者確認捨棄，或 future organization version permanent delete。長時間未使用後仍須依 `44A` 重新檢查基準及衝突。
- `Partially Superseded / 48A（由 56A 收斂）`：組織版本的mode／status轉為唯讀時，本機草稿同步唯讀且不得套用；恢復可編輯後先依 `44A` 重算。使用者version access撤銷屬Future Phase；版本永久刪除的草稿cleanup保留為future integration constraint。
- `Future Phase Captured / 49A（由 56A 延後）`：active editor lease、跨裝置／分頁唯讀與「在此接手」不在第一階段。Current Phase以plan revision CAS拒絕stale writer，不做last-write-wins。
- `Partially Superseded / 50A（由 56A 收斂）`：同機重新整理或重新進入中央頁時，自動載入該版本本機草稿，不先顯示阻斷式Modal；工具列輕量顯示「已恢復草稿」及最後成功保存時間。重新登入與另一裝置恢復移至Future Phase。
- `Human Confirmed / 51A（依 56A 收斂）`：整批套用成功後執行正式 command Undo，只復原組織版本資料，不重建已刪除的本機草稿；既有 redo 仍保持可用。若要重新規劃，從新的空白草稿開始。
- `Partially Superseded / 52A（由 56A 收斂）`：只要目前 batch plan 至少有一項規劃變更，即可由唯一入口開啟整批預覽；預覽須列出未完成項目與其他阻擋原因。只有所有選取項目完整、最新草稿保存成功、沒有基準衝突、組織版本mode／status可編輯且receipt仍有效時才可套用；使用者權限與active lease gate移至Future Phase。
- `Human Confirmed / 53A（依 56A 收斂）`：第一階段 desktop／laptop 支援完整檢視、規劃、預覽與套用；tablet／mobile 只提供響應式唯讀檢視，不允許編輯草稿、捨棄草稿或套用批次。
- `Human Confirmed / 54A（依 56A 收斂）`：「捨棄草稿」放在中央工具列的次要選單，不與主要「預覽並套用」並列；確認視窗顯示受影響職掌數及規劃變更數，確認後刪除整批本機草稿且無法恢復。第一階段不要求輸入文字確認，也不提供逐列捨棄。
- `Human Confirmed / 55A`：沿用同一 DEV-028 升級至 `RD Contract Ready`，供 RD 評估與估工；本輪不進入產品實作。
- `Human Confirmed / 56A / Intentional replacement`：第一階段採本機單一工作區草稿；保留autosave、同機重新整理恢復、stale reconciliation、plan／version CAS、preview／atomic apply與discard。可信登入principal、版本ACL、每人私有草稿、登出／登入、真正跨裝置及lease／接手移至Future Phase，不阻擋Current Phase。
- `Human Confirmed / 57 / Intentional replacement`：工作執掌規劃由彈窗升級為固定 URL `/duty-planning` 完整頁面；保留同一矩陣、異常規劃、保存與套用流程，直接開啟、重新整理、分享及瀏覽器返回均可用，從個別職位入口可用 `?position=<positionId>` 聚焦來源職位。不新增資料模型、API 或第二保存路徑。
- `Brief Decision Complete / RD Implementation Ready`：第一階段產品語意、主要流程、異常與修復、本機持久草稿、批次安全及裝置範圍已完成Human Confirmed；schema、API、儲存、CAS、debounce、transaction、repo修改點、可執行migration與recovery已固定，不再回問工程選擇。
- `Historical stage note`：前一文件階段只建立開發文件，不進入產品程式修改、migration、deploy 或 release；其後本輪已依同一契約完成S1–S5實作與驗證，仍未執行deploy或release。

## Spec Impact Preflight

分類：`Intentional replacement`（`56A`取代Current Phase的私人／跨裝置／lease契約）；其餘與DEV-008／020／021／027的結構關係維持`Compatible exception`。

- DEV-008 的 Role／Position／Assignment 分工保持不變；工作執掌關係連到職位，不直接綁定目前任職人員。
- `14B 自訂` 對 DEV-008 的職位刪除增加相容例外：刪除職位不得 cascade delete 工作執掌或關係；既有`DELETE_POSITION`會把職位設為inactive，RD Contract要求同一command把branch內每筆active relation轉為pending並與Undo／redo一起原子處理。
- `17A` 要求失效關係保存刪除當下的職位名稱與部門快照，不依賴已不存在的 Position 或 Department 才能顯示；V6 relation target已固定active／pending discriminated union及凍結快照欄位。
- DEV-020 的組織版本、草稿與現行版保護邊界保持有效；每個組織版本獨立保存工作執掌及關係，但 DEV-028 現階段不擴充 DEV-020 的版本比較功能。
- DEV-021 的直屬主管仍只代表組織匯報事實，不能自動成為本 DEV 的審核者或會簽者。
- DEV-027 仍是應用權限、delegation 與 approval policy 的治理權威；本 DEV 只描述職位對工作執掌的組織責任關係，不建立 approval work item、核駁交易或外部系統授權。
- `15A` 只沿用組織版本既有可編輯／唯讀狀態，不新增依主管層級或部門推導的授權規則，因此不擴張 DEV-027。
- `18C` 是失效關係修復，不擴張 `12A` 的有效關係永久移轉範圍：有效關係的主動永久移轉仍只處理主執行；批次修復則依每筆失效關係原類型重新指定目標。
- `19B` 與 `21A` 要求把多筆不同目標的修復計畫作為單一原子command；RD Contract已固定version＋draft CAS、apply receipt、idempotency、crash recovery及一次Undo／redo，不得以逐列即時寫入取代。
- `22B 自訂` 刻意收斂「唯一主執行」為完整狀態規則，而不是所有寫入的阻擋條件：刪除主執行職位或對其失效關係選擇「不再指派」後，可保留職掌並依 `26A` 形成非阻擋的「缺少主執行」或「無執行職位」。此例外不得被誤作第二個主執行、不得自動補派，也不改變有效關係永久移轉仍只處理主執行的邊界。
- `23A` 的不預填目標契約保持有效；`24A` 的每異常一列已由 `36 自訂` 取代。中央表改為每個職掌一列，列內異常項目仍各自保留原職位／原部門／原關係快照（若適用）、目標或「不再指派」動作及規劃結果。
- `25B` 刻意把零個主執行改為可保存的不完整狀態，但不放寬唯一性上限：完整狀態仍恰有一個主執行，同一職掌同時出現兩個以上主執行仍不得成立。此決策把資料完整度從 save gate 改為可見且可修復的治理訊號。
- `26A` 將職掌層級的不完整狀態細分為「缺少主執行」與「無執行職位」；RD Contract採純衍生狀態，不另存可漂移欄位，UI、計數、篩選及projected state共用同一resolver。
- `27A` 允許修復動作同時新增執行關係並指定主執行，或提升既有其他執行；這是職掌異常修復，不是擴張有效關係的一般永久移轉，也不得自動選取目標。
- `28B 自訂` 的語意分離要求仍有效：關係層級與職掌層級異常可同時存在及顯示，並不是重複關係；`36 自訂` 只將它們收進同一職掌列。RD Contract已分別固定`relation:<relationId>`及`duty:<dutyId>:<gap>` identity、衍生條件與解除條件。
- `29A` 對「無執行職位」採與 `27A` 一致的最小修復結果：一次建立執行關係及唯一主執行；不引入中間的無主執行寫入，也不改變零個主執行仍可保存的既有規則。
- `30A` 將 `18C` 的批次範圍明確擴張至三種異常類型；`21A` 的整批原子套用及復原仍適用。同一職掌同時選取相依異常時，依 `33A` 以完整 projected state 即時重算，不得以逐列非原子提交規避。
- `31A` 固定的是產品內的治理提示層級，不是 Dev PM 風險 lane、approval gate 或阻擋權限；三種異常仍可保存於草稿或現行版並持續使用。
- `32A` 要求統計同時維護 anomaly-level 與 duty-level 兩種口徑；`36 自訂` 後表格列數等於受影響職掌數，但異常筆數仍可能較高。RD Contract固定以版本內Duty ID去重，不得用可能重名的文字去重。
- `33A` 要求批次規劃以整體 projected state 計算同列異常的相依結果，而非依異常顯示順序逐項模擬寫入。標示「將由相關規劃解除」的異常項目是衍生預覽狀態，不是已提前修改版本資料；移除上游規劃後必須可逆地恢復。
- `34A` 固定 severity-first 的排序意圖，並由 `38A` 補全多異常職掌的列級排序鍵為目前最高嚴重程度。
- `35A` 要求全體與篩選結果兩組統計並存；這是篩選範圍的必要辨識資訊，但應維持 compact summary，不擴張為大型 KPI 卡。
- `36 自訂` 是主要資訊架構的 `Intentional replacement`：表格 row identity 由 anomaly 改為 duty，異常改為列內集合。資料模型仍須保留個別異常 identity，以支援多個待重新分配關係、不同嚴重程度、獨立修復、相依重算及異常筆數。
- `37B` 將詳細資訊與修復控制降層至右側明細，但不改變 `19B／30A` 的同一批規劃邊界：主表持續呈現所有職掌、異常及規劃摘要，右側明細只編輯尚未套用的 batch plan，不得產生 per-duty commit。
- `38A` 補全 `34A` 在一列多異常時的排序鍵：取該列目前最高嚴重程度。此為衍生排序狀態，不需要另存一份可漂移的列級嚴重程度。
- `39A` 固定 filter semantics 為「row inclusion by any match, context preservation by showing all anomalies」；目前篩選異常數只計 match，受影響職掌數按命中職掌去重，全體統計保持不變。
- `40A` 固定右側明細為不改變主表寬度的 overlay drawer；列切換、關閉與篩選變更都只是導航狀態，不得變成提交或丟棄 batch plan 的隱性命令。
- `41A` 固定主表工具列為唯一整批 commit 入口，直接排除 drawer 內 per-duty commit 或重複 primary CTA；預覽仍涵蓋目前整批規劃。
- `42B` 經 `56A` 收斂後，未套用batch plan仍從純前端暫態提升為本機workspace持久資料；以organization version歸屬並跨同機重新整理恢復，但不再與登入狀態銜接。
- `43A` 的 `planner identity × organization version`私人所有權與跨裝置續接由`56A`移至Future Phase。Current Phase不建立owner欄位，也不宣稱不同使用者間的隱私隔離。
- `44A` 固定 optimistic concurrency 的產品結果：草稿保存base organization revision；load、version change、preview及apply前以stable anomaly identity重算，安全item保留，stale／conflict item要求清除或重選，禁止last-write-wins。
- `45A` 將自動保存狀態放在中央工具列作為批次共用資訊，不在每列或 drawer 重複；保存失敗是可見且可恢復的例外狀態。畫面記憶體中的未持久化輸入與最後一次成功保存的本機草稿必須可區分。
- `46A` 固定本機草稿不是 audit history：成功套用與確認捨棄都使 active plan 不再存在。成功套用後的 cleanup 必須與 command 結果收斂，不能留下可被再次套用的殘留草稿；正式 command 的 Undo／redo 仍是另一條資料狀態機。
- `47A` 排除時間型 TTL；每個organization version最多一份本機草稿，第一階段以明確生命週期事件控制數量。長期保存不免除 stale-base 重算。
- `48A` 經`56A`只保留workspace mode／version status gate及future version-delete cleanup；登入者的read／edit authorization與access撤銷改列Future Phase。
- `49A` 的active editor lease與takeover由`56A`移至Future Phase。Current Phase以plan revision CAS處理同機多分頁：先成功save者產生新revision，stale writer必須reload／reconcile，禁止last-write-wins。
- `50A` 在Current Phase只保留同機重新整理／重新進入時的低干擾自動恢復；不得用Modal把正常續接誤呈現為風險。重新登入與另一裝置恢復不在驗收範圍。
- `51A` 固定 command history 與 local plan lifecycle 正交：Undo／redo 操作正式組織資料，不能隱式建立或刪改本機草稿；因此套用後 Undo 的後續規劃起點為新草稿。
- `52A` 將 preview availability 與 commit eligibility 分離：有規劃變更即可預覽並看見缺口，但 commit 必須通過完整性、成功持久化、無衝突、version mode／status可編輯及receipt current等gate。使用者權限與active lease gate由`56A`延後。
- `53A` 固定第一階段 write-capable viewport boundary 為 desktop／laptop；tablet／mobile 必須有可用的響應式唯讀畫面及明確 disabled／restricted 狀態，不能只依 CSS 縮放完整編輯器，也不能繞過server mode／status或CAS gate。
- `54A` 將整批草稿刪除降層為工具列 secondary menu action，並以影響摘要確認；因刪除的是可重建且未正式套用的本機規劃，不採 typed confirmation，但仍禁止無確認刪除與 per-row discard。
- 本輪使用者決策刻意取代初版 Brief 對審核／會簽成立條件與自審阻擋的假設；目前只保存可見文字關係與非阻擋提醒，因此不擴張 DEV-027。
- `8A 補充` 刻意取代 `6A` 中「現階段可比較工作執掌差異」的範圍；只保留版本獨立保存與舊版本不被回寫，職掌比較列為本 DEV 現階段 Out of Scope。
- `55A` 已完成資料邊界檢查並建立 DEV-028 spec及ADR-006；與DEV-020／021／027的分類為 `Compatible exception`。
- `56A` 是目前階段草稿ownership與concurrency的`Intentional replacement`：將登入／ACL／每人私有／跨裝置／lease移至Future Phase，並以本機workspace plan＋CAS取代。其餘Duty、anomaly、preview與atomic apply契約不變。

## 問題與使用者價值

目前職位只能表達名稱、部門、上下級、層級與任職，無法保存「這個職位實際做什麼」以及其他職位在同一執掌中負責審核、協作或會簽的關係。總經理與主管也缺少可共同規劃全員職掌的文字工具。若只把所有內容存成一段文字，單一執掌無法被獨立調整、移轉、檢查或追溯。

DEV-028 的使用者價值是：

1. 每個職位能看到自己參與的工作執掌及關係類型。
2. 工作從口頭分配轉為可見、可維護的組織責任資料。
3. 工作永久改由另一職位承擔時，可以只移轉主執行責任，不必重寫整份職位說明或改動其他關係。
4. 審核與會簽不再被錯誤等同於直屬主管，而由治理使用者依實際流程設定。
5. 不同組織版本各自保存職掌規劃，舊版本不被後續修改污染；現階段不要求職掌差異比較。
6. 刪除職位不會讓尚未重新規劃的工作責任靜默消失；主管能從中央頁集中看到待重新分配項目。
7. 多筆異常能在同一張規劃表看見整體分工、其他承擔職位與預定結果，再一次確認套用。
8. 規劃者可以明確結束已失效且不再需要的關係；若職掌因此沒有主執行，系統保留職掌並依剩餘執行關係揭露「缺少主執行」或「無執行職位」，不以阻擋操作迫使使用者虛假指派。
9. 總經理與主管可先保存尚未規劃完成的職掌，再從清楚區分的異常集合逐步補齊；系統不會為了形式完整而捏造責任人。

風險等級：Medium（產品關係本身不含正式核准交易或外部副作用；整體交付新增V6版本化主資料、職位失效保留、本機持久草稿、plan／version CAS及跨檔原子批次，但不含登入、版本ACL或跨裝置協作）。

## 主要流程

1. 總經理或主管由全公司職掌矩陣查看全局；矩陣以每個職位一列，分別列出主執行、其他執行、審核、協作與會簽職掌，也可進入個別職位細節。
2. 使用者從中央清單／矩陣或任一相關職位細節進入同一份共用執掌，新增或編輯一行條列名稱與選填補充說明；修改後所有相關職位同步呈現。
3. 使用者明確選擇相關職位並指定為執行、審核、協作或會簽；系統不預填直屬主管或任何其他職位。
4. 保存時若沒有有效主執行，系統仍保存職掌：尚有其他有效執行職位則標示「缺少主執行」，沒有任何有效執行職位則標示「無執行職位」；兩者都立即顯示但不阻擋保存、其他編輯或版本使用。
5. 系統維持主執行唯一性上限及無效職位檢查；不得讓兩個以上有效職位同時成為主執行。同一職位的其他關係重疊只顯示提醒，不阻擋儲存。
6. 永久移轉時，使用者為一項執掌選擇不同於來源的目標職位；目標成為唯一主執行，來源移出執行關係。
7. 儲存後，除來源與目標的執行關係依前項更新外，既有其他執行、審核、協作與會簽關係保持不變；舊組織版本中的原狀態仍保留。
8. 刪除執掌時只從目前可編輯的組織版本移除；其他版本保存的內容不受影響。
9. 刪除仍有職掌關係的職位時，系統保留該版本內的職掌及原關係並將關係標示為「待重新分配」；中央規劃頁集中顯示異常，不自動刪除職掌、猜測替代職位或改派關係。
10. 使用者可從中央異常集合跨職掌、跨關係類型及跨異常類型選取需要規劃的工作職掌，進入同一張修復規劃表；每個工作職掌不論異常數量永遠只占一列。
11. 每列包含一個「異常」欄，以短標籤顯示該職掌全部待重新分配、缺少主執行及無執行職位異常與各自嚴重程度；詳細快照與修復控制不塞入主表儲存格。
12. 使用者選取職掌列後，在不推擠中央表的右側 overlay drawer 查看各異常的原職位／部門及原關係類型（若適用）、目前承擔關係與規劃結果，並設定獨立且預設留白的修復動作：待重新分配可指定目標或選擇「不再指派」；缺少主執行可提升或新增主執行；無執行職位可新增執行及主執行。使用者可直接點另一職掌列切換明細。
13. 主表顯示該職掌的異常標籤、其他承擔職位摘要及整列規劃摘要，右側明細提供完整關係內容；目標已具有相同職掌與相同關係時，結果預覽採去重而非新增副本。異常嚴重程度固定為無執行職位「高」、缺少主執行「中」、待重新分配「提醒」。
14. 「不再指派」會解除所選失效關係；若解除的是待重新分配的主執行，系統依剩餘有效執行關係轉為或維持「缺少主執行」或「無執行職位」，職掌仍保留。
15. 使用者調整任一異常項目後，系統以整體規劃方案即時重算同列相依異常；已被其他規劃解除的異常仍在異常欄中可見並標示「將由相關規劃解除」，衝突目標輸入停用。移除或改變解除來源後，該異常若仍存在就恢復可操作。
16. 中央頁同時顯示全體及目前篩選結果的異常總數與受影響職掌數；一項職掌即使含兩項異常仍只占一列，但統計為「2 筆異常／1 項職掌」。篩選異常類型時，列保留全部異常標籤並以文字或非顏色單一訊號標出命中項；篩選異常數只計命中項。
17. 主表依列內最高嚴重程度按高、中、提醒排序，同級再按工作職掌名稱；同列異常與右側明細也按高、中、提醒排列。
18. 同一本機workspace在每個組織版本維護一份 batch plan 草稿；每次修改後短暫延遲自動保存，可跨同機頁面重新整理續接。恢復草稿只恢復規劃內容，不得提前改寫組織版本，也不宣稱依登入者隔離或跨裝置同步。
19. 中央表工具列以單一共用狀態顯示「儲存中／已儲存／儲存失敗」。失敗時目前輸入留在畫面並自動重試；在尚未成功持久化的情況下離開頁面，系統先警告可能只保留到最後一次成功保存的內容。
20. 載入草稿、產生預覽及套用前，系統比較草稿基準與目前組織版本並重新計算 projected state；仍有效的輸入保留，衝突或失效項目要求重新選擇。衝突未全部解除或尚未重新預覽時，「預覽並套用」不得完成提交。
21. 使用者只能從中央表持續可見工具列的唯一「預覽並套用」入口啟動整批提交；drawer 內沒有逐項、逐列或重複的套用按鈕。
22. 套用前，系統顯示整體影響預覽及每筆預定結果，包括將新增、解除或轉換的異常；使用者確認後以單一原子操作完成全部變更，任一項失敗則整批不寫入，Undo／redo 也整批處理。相同規劃內容不得因列排序不同而得到不同結果。
23. 整批套用成功後，系統刪除該組織版本的本機草稿；正式批次仍可依既有 command 做整批 Undo／redo。使用者也可主動捨棄草稿，但須在確認後才刪除，且不保留草稿歷史。
24. 未完成草稿沒有時間到期；版本mode／status轉唯讀時只能查看，恢復可編輯後先重算再續接。Future permanent version delete須一併刪除該版本草稿。
25. 同機重新整理或重新進入中央頁時，系統自動恢復該版本本機草稿，並在工具列顯示「已恢復草稿」與最後成功保存時間；正常恢復不中斷流程，有衝突或其他限制才顯示較高權重警示。
26. 同機多分頁／視窗不使用active editor lease。若另一分頁先完成保存，持舊plan revision的工作階段保存或套用會被拒絕，保留memory input並要求reload／reconcile，不得last-write-wins。
27. 套用成功後若使用者執行正式批次 Undo，只復原正式組織資料並保留 command redo，不恢復舊草稿；下一次規劃從新的空白本機草稿開始。
28. batch plan 至少有一項規劃變更後，「預覽並套用」可開啟整批預覽；預覽顯示所有未完成、未保存、衝突、version mode／status或stale receipt阻擋。只有全部 gate 通過時，預覽中的「套用」才可使用，不能略過部分項目。
29. desktop／laptop 可完成全部流程；tablet／mobile 只顯示響應式唯讀中央表、明細與既有規劃狀態，不提供編輯、捨棄或套用控制。
30. 使用者從中央工具列次要選單選擇「捨棄草稿」時，確認視窗顯示受影響職掌數與規劃變更數；確認後刪除整批草稿且無法恢復，取消則保持原草稿不變。

## 初步產品範圍

- 提供以職位為列的全公司職掌矩陣作為主管的主要全局規劃入口；每列依主執行、其他執行、審核、協作與會簽分組列出職掌，並保留職位細節中的條列檢視與編輯入口。
- 中央入口與職位細節必須編輯同一份版本內資料，不得建立兩份可分別修改的職掌副本。
- 同一職掌跨多個相關職位顯示時仍是單一共用資料；任何可編輯入口對名稱或說明的修改都更新同一筆版本內內容。
- 每項執掌保存一行條列名稱及選填補充說明；完整 SOP、附件與逐次工作紀錄不在第一階段。
- 每項執掌可分別連結一個或多個職位關係，關係類型固定為執行、審核、協作、會簽。
- 執行關係可有多個職位；完整職掌必須明確指定且只指定一個主執行職位，但零個主執行仍可保存為非阻擋的不完整狀態。兩個以上有效主執行不得成立。
- 零個有效主執行且尚有其他有效執行職位時標示「缺少主執行」；零個有效主執行且沒有任何有效執行職位時標示「無執行職位」。兩類異常都不得觸發自動補派。
- 新增、編輯、刪除職位及失效關係修復後都使用相同分類規則；主執行職位被刪除時，原主執行關係以「待重新分配」保留，同時依剩餘有效執行職位數量顯示「缺少主執行」或「無執行職位」。兩項異常在同一職掌列內分項表達失效關係與責任缺口；關係解除後只移除「待重新分配」項目，職掌層級異常依修復後狀態重算。
- 審核、協作與會簽都允許零至多個職位。
- 審核、協作與會簽只作為可設定、可保存、可顯示的文字關係，不計算順序、通過條件、法定人數或工作狀態。
- 同一職位可以同時具有多種關係；系統只提供非阻擋提醒，不要求填寫例外理由。
- 關係完全由治理使用者明確設定，不依 `parentPositionId`、直屬主管或目前任職人員自動推導或預填。
- 每個職位內依主執行、其他執行、審核、協作與會簽分組；各組條列順序可由使用者手動調整並獨立保存。
- 第一階段的永久移轉只處理主執行：目標成為唯一主執行，來源移出執行關係；若目標原為其他執行則直接提升且不得產生重複關聯，其他職位與其他關係均維持不變。
- 延續既有組織版本的可編輯、維護中、唯讀與比較唯讀限制，不另開隱性寫入入口。
- 每個組織版本各自保存工作執掌、補充說明、條列順序與職位關係；修改新版本不得改變舊版本，現階段不開發職掌版本比較。
- 保存與重新載入後，條列順序、關係類型、關聯職位及永久移轉結果維持一致。
- 刪除只修改目前可編輯的組織版本，舊版本仍保留原工作執掌及關係。
- 刪除有職掌關係的職位時，該版本內每一筆受影響關係都保留為「待重新分配」；中央職掌規劃頁提供集中異常集合，不依賴已刪除職位列才能發現。
- 「待重新分配」、「缺少主執行」與「無執行職位」都是非阻擋警示；可存在於草稿或現行版，不阻擋版本保存、其他編輯或使用，但在異常解除前必須持續出現在中央集合及受影響職掌附近，且以不同文字標籤、計數與篩選值區分。
- 異常嚴重程度固定為：無執行職位「高」、缺少主執行「中」、待重新分配「提醒」。標籤必須使用文字傳達，不得只靠顏色；層級不產生阻擋、送審或額外權限。
- 每筆失效關係保存刪除當下的原職位名稱、原部門及原關係類型作為可見快照；不保存任職人姓名，也不要求已刪除職位或部門仍存在才能顯示。
- 中央異常集合以每個工作職掌一列，列內「異常」欄以短標籤顯示全部異常及嚴重程度；多個待重新分配關係仍保留不同 identity，必要時以數量或可辨識標籤表達，不得因同列而遺失。詳細快照、目標與修復控制統一降層至右側明細。
- 每個職掌列至少顯示工作職掌、全部異常標籤、目前其他有效承擔摘要及規劃摘要。右側明細逐項顯示待重新分配異常的原職位／原部門及原關係類型、完整承擔關係及修復控制；欄位不適用時不虛構快照，主表與明細也不得無判斷價值地重複相同內容。
- 右側明細採 fixed overlay drawer，不改變中央表欄寬或可掃描範圍；開啟後可直接切換其他職掌列。關閉 drawer、切換列或改變篩選只改變檢視狀態，不得清除規劃。
- 對待重新分配關係選擇「不再指派」後解除該失效關係；若因此沒有有效主執行，保留職掌，並依是否仍有其他有效執行職位建立或維持「缺少主執行」或「無執行職位」。這項結果不阻擋保存、其他編輯或版本使用。
- 修復「缺少主執行」時，提升既有其他執行只改變其主執行標記；選擇尚未具有執行關係的有效職位時，同一原子操作新增執行關係並指定為唯一主執行。成功後解除該職掌層級異常。
- 修復「無執行職位」時，選定任一有效職位後，以同一原子操作新增執行關係並指定為唯一主執行；成功後解除「無執行職位」，不得留下中間的「缺少主執行」。
- 規劃表必須顯示同一職掌目前所有其他有效承擔職位及其關係類型；目標已具有相同職掌與相同關係時自動去重，不能建立重複關係。
- 三種異常可跨職掌與關係類型混合選入同一張規劃表。規劃期間只建立尚未套用的完整方案，不逐列改寫版本資料；影響預覽確認後才以單一原子操作套用，整批同成同敗並作為一個 Undo／redo 單位。
- 右側明細只編輯目前批次的尚未套用方案；主表必須同步呈現各職掌的規劃摘要。開啟、關閉或切換明細不得形成逐筆 commit，也不得破壞整批原子套用邊界。
- 尚未套用的完整方案自動保存為可恢復草稿，須跨 drawer 關閉、職掌切換、篩選變更及同機頁面重新整理保留；草稿與已套用的組織版本資料必須清楚分離，恢復草稿不得自動提交。
- 同一本機workspace在每個組織版本最多一份active plan。草稿只保存organization version ID、base revision、intent、opaque plan revision及last-saved time；不保存principal、owner、lease或裝置資料，也不宣稱使用者間隱私或跨裝置續接。
- 草稿每次修改後短暫延遲自動保存，工具列只顯示一次共用保存狀態。保存失敗保留目前輸入、自動重試並在離開頁面前警告；不得將尚未持久化的內容誤標為已保存。
- 組織版本或異常基準改變時重新計算草稿；仍有效且不衝突的輸入保留，衝突與失效項目個別標示並要求重新選擇。衝突全部解除且重新預覽前不得套用，禁止 last-write-wins。
- 整批套用成功或使用者確認捨棄後，刪除該 active local plan 且不建立草稿歷史；正式批次的 Undo／redo 不依賴草稿紀錄。草稿未成功套用或捨棄前不設定時間型到期。
- 草稿可編輯狀態不得高於所屬組織版本mode／status：唯讀時草稿唯讀，恢復可編輯後須先重算；future permanent version delete時清除該版本草稿。
- 同機多分頁／視窗以plan revision CAS處理競爭；先成功者為準，stale writer保留memory input並reload／reconcile，不使用active editor lease或接手，也不得last-write-wins。
- 重新進入中央頁自動載入本機草稿，工具列只顯示一次恢復狀態與最後成功保存時間；正常恢復不使用 Modal。command Undo／redo 與草稿生命週期分離，Undo 不重建草稿。
- 有至少一項規劃變更即可開啟整批預覽；預覽呈現未完成與所有 blocked reasons。正式套用只在整批完整、最新草稿保存成功、無衝突、version mode／status可編輯且receipt current時啟用，不能部分套用。
- 第一階段完整規劃僅支援 desktop／laptop；tablet／mobile 提供響應式唯讀中央表、drawer／明細及規劃狀態，不提供任何草稿或正式資料寫入控制。
- 「捨棄草稿」位於中央工具列次要選單；確認內容顯示受影響職掌數與規劃變更數。確認後刪除整批草稿且無法恢復，不採 typed confirmation，也不提供逐列捨棄。
- 中央表持續可見工具列只提供一個「預覽並套用」主要動作；drawer 不重複提供套用入口。該動作永遠以目前整批規劃為範圍，不得縮成目前明細列。
- 中央頁對全體及目前篩選結果分別顯示異常筆數及受影響職掌數；異常筆數逐項計算，受影響職掌數及表格列數依目前組織版本內的工作職掌穩定識別去重，不得以可能重名的職掌文字作為統計鍵。
- 主表列級排序鍵取該職掌目前最高嚴重程度，依高、中、提醒排列，同級再依職掌名稱；同列異常標籤及右側明細亦依高、中、提醒排列，不另保存可漂移的列級 severity 欄位。
- 異常類型篩選以「任一異常命中即納入該職掌列」判斷；納入後仍顯示全部異常標籤，命中項使用文字、icon、形狀或等效可及訊號提高辨識度，不能只變更顏色。篩選異常筆數只計命中項，篩選職掌數依命中列去重。
- 規劃表每次輸入都以尚未套用的完整方案計算 projected state。若一項異常的預定結果將解除同列另一異常，後者保持可見、標示「將由相關規劃解除」並停用衝突目標；解除來源被撤回後，後者依 projected state 恢復異常及操作。計算不得依異常顯示順序決定結果。
- 職掌編輯狀態沿用組織版本既有的可編輯／唯讀mode與status；第一階段不新增總經理、主管轄區或職掌層級的專屬權限模型。

## 關係語意

| 關係 | Brief 定義 | 初步完整性方向 |
| --- | --- | --- |
| 執行 | 實際承擔工作 | 可有多個職位；完整狀態恰有一個主執行，零個可保存但形成非阻擋異常，兩個以上不得成立 |
| 審核 | 顯示哪些職位負責審核 | 允許零至多個；只保存文字關係，不產生核准權、核駁結果或通過條件 |
| 協作 | 顯示哪些職位提供資料、專業或資源支援 | 允許零至多個；只保存文字關係，不具核准效果 |
| 會簽 | 顯示哪些職位需要參與會簽 | 允許零至多個；只保存文字關係，不計算全部／任一／依序同意 |

關係完整性例外：關聯職位被刪除時，原關係類型不變，但關聯目標轉為失效並標示「待重新分配」，同時保留刪除當下的職位名稱與部門快照。若失效的是主執行，該職掌暫時沒有有效主執行；同一職掌列的「異常」欄同時分項顯示待重新分配的主執行關係，以及依剩餘有效執行數量判定的「缺少主執行」或「無執行職位」。各異常嚴重程度及管理意義不同，不得合併或隱藏，但整個職掌永遠只占一列。所有狀態都只警示、不阻擋版本保存、編輯或使用。關係解除後移除待重新分配項目，職掌層級異常依新狀態重算。

修復語意：中央異常集合以每個工作職掌一列，主表異常欄顯示全部短標籤，右側明細保留個別異常內容及操作；三種異常可混合進同一批次，各目標預設留白。待重新分配關係項目可設定不同目標或選擇「不再指派」；指定目標時，只替換該筆已選失效關係的目標職位並保留原關係類型，若目標已有同一職掌的相同關係則去重。修復「缺少主執行」時，可把既有其他執行提升為唯一主執行，也可把任一有效職位新增為執行並設為唯一主執行；修復「無執行職位」時，可選任一有效職位並一次建立執行及唯一主執行。後兩類未處理就保留異常，不允許用「不再指派」消除。任一規劃輸入後，以整體 projected state 即時重算同列相依項目；將被相關規劃解除的項目仍顯示但停用衝突輸入，解除來源撤回後再恢復。右側明細只修改 batch plan，整批預覽後才原子套用，最終結果不得依異常顯示順序改變。此流程不是把有效的審核、協作或會簽關係開放為一般永久移轉。

## Out of Scope

- 暫時代理、到期自動復原、請假代理及協作支援型移轉。
- 依直屬主管、組織層級、部門或職稱自動產生執行、審核、協作或會簽關係。
- approval request、工作項、approve／reject、通知、SLA、催簽、簽核交易 audit 或領域狀態套用。
- 審核／會簽順序、全部或任一通過、法定人數、待辦狀態與送審按鈕。
- AI-PDM、ERP 或其他外部系統串接與資料雙寫。
- 以工作執掌數量進行績效評分、排名、獎懲或薪酬計算。
- 完整 SOP、附件、表單、工作證據或逐次執行紀錄管理。
- 員工個人待辦、完成回報、進度追蹤或依員工操作的工作管理。
- 工作執掌的版本差異比較、差異摘要、比較篩選或視覺標示。
- 獨立永久移轉紀錄、移轉原因、移轉日期、操作者或移轉 audit panel。
- 依總經理、主管轄區、部門或職掌建立新的細粒度編輯權限；第一階段只沿用組織版本既有mode／status。
- 可信登入principal、版本read／edit ACL、每人私有草稿、登出／登入續接與真正跨裝置同步。
- Active editor lease、heartbeat、跨分頁／裝置唯讀接手與舊工作階段強制失效。
- 刪除職位時 cascade delete 工作執掌或關係，以及依組織階層自動猜測替代職位。

## 驗收方向

- 每個職位可看到條列式工作執掌；同一執掌能獨立編輯，不必重寫整段職位說明。
- 同一職掌出現在多個相關職位時，從任一可編輯入口修改名稱或說明後，所有入口顯示一致且不存在互相漂移的職位專屬副本。
- 總經理與主管可由全公司職掌清單／矩陣掃描所有執掌與職位關係，再進入個別職位細節；兩個入口顯示及修改同一份版本內資料。
- 每項執掌可顯示一行條列名稱及選填補充說明；未填補充說明不影響保存。
- 使用者可為每項執掌明確設定執行、審核、協作與會簽職位，且畫面與資料均不出現系統自動帶入的主管預設值。
- 新增或編輯職掌時即使零個主執行也可成功保存；若仍有其他有效執行職位，中央集合及職掌附近顯示「缺少主執行」，若沒有任何有效執行職位則顯示「無執行職位」，兩者都不阻擋後續保存、編輯或版本使用。
- 同一職掌不得同時保存兩個以上有效主執行；嘗試新增第二個主執行時，系統必須拒絕該衝突關係並保留原有唯一主執行，不得只以非阻擋提醒放行。
- 同一職位同時被設定為執行、審核或會簽時，系統顯示非阻擋提醒，但仍允許保存且不要求例外理由。
- 審核、協作與會簽只呈現使用者設定的文字關係；畫面不得產生送審、核准、駁回、待辦或通過狀態。
- 審核、協作與會簽可分別保存零至多個職位，重複職位的去重方式須一致且可驗證。
- 全公司職掌矩陣以每個職位一列；主執行、其他執行、審核、協作與會簽職掌可在五秒內辨識，不得混成無法判斷關係的單一文字段落。
- 各職位的五個關係群組可手動調整條列順序；保存、重新載入及切換版本後，該版本內的分組與順序維持一致。
- 永久移轉只改變主執行責任：目標成為唯一主執行、來源不再是執行職位；既有其他執行、審核、協作、會簽、職位階層、部門及人員任職均保持不變。
- 永久移轉後，來源與目標職位的顯示一致，保存、重新載入與版本切換後結果不漂移；舊組織版本仍保留移轉前內容。
- 唯讀、比較唯讀與非維護中的現行版不得修改工作執掌或執行永久移轉。
- 同一執掌在不同組織版本可有不同文字與關係；切換版本會顯示該版本自己的內容，編輯新版本不會改變舊版本。現階段不驗收職掌差異比較。
- 從目前可編輯版本刪除執掌後，該版本不再顯示；切換到保有該執掌的舊版本時仍可查看，且不提供跨版本永久刪除。
- 刪除仍有職掌關係的職位後，受影響職掌及原關係數量不得減少；每筆失效關係標示「待重新分配」，且不得自動改派其他職位。
- 若被刪除職位是主執行，該職掌保留待重新分配的主執行關係並可由中央異常集合找到；不得因缺少有效主執行而自動刪除整項職掌。
- 中央職掌規劃頁以每個受影響職掌一列，列內「異常」欄分項顯示全部「待重新分配」關係、「缺少主執行」及「無執行職位」，並提供異常類型篩選；使用者不需尋找已不存在的職位列，狀態必須有可讀文字標籤，不得只靠顏色表達。
- 主表異常欄只保留全部異常的短標籤、嚴重程度及必要數量；選取職掌列後，可在右側明細看到每項異常的快照、完整關係、目標與修復控制。右側明細不得推動逐筆版本寫入，主表必須保留批次上下文及各職掌規劃摘要。
- 開啟右側明細時中央表寬度與欄位配置保持穩定；使用者可直接點另一職掌列切換明細。關閉明細、切換列或變更篩選後重新開啟，先前尚未套用的規劃仍存在。
- 每列嚴重程度與文字符合固定對應：無執行職位為「高」、缺少主執行為「中」、待重新分配為「提醒」；任何一類都不得因此禁止保存、編輯或版本使用。
- 主執行職位失效且目前零個有效主執行時，中央頁在同一職掌列的異常欄同時顯示「待重新分配」及「缺少主執行」或「無執行職位」；各項保留自己的異常類型及嚴重程度，不得合併成一個模糊狀態。
- 同一職掌包含兩項異常時，表格只顯示一列，摘要同時顯示「2 筆異常／1 項受影響職掌」；受影響職掌數依職掌識別去重，即使職掌名稱相同但識別不同仍分別計數。
- 職掌列依其最高異常嚴重程度排序：包含任一高嚴重程度異常即排在高層級，否則依中、提醒；同層按職掌名稱，異常標籤與右側明細也依高、中、提醒排列。
- 篩選某異常類型時，只要一項異常命中就保留整個職掌列及全部異常標籤；命中項須有非顏色單一訊號可辨識。全體統計保持不變，篩選異常數只計命中項，篩選職掌數對命中職掌去重。
- 每筆異常可辨識原職位名稱、原部門及原關係類型；刪除職位或其原部門後重新載入，快照仍可顯示且不得改以任職人姓名替代。
- 「待重新分配」、「缺少主執行」或「無執行職位」存在時，草稿或現行版仍可保存、編輯及使用；畫面不得將警示誤呈現為無法操作的阻擋狀態。
- 使用者可勾選跨職掌、跨關係類型的多筆異常執行批次重新分配；每筆修復後關係類型不變，未選取異常及所有未選取有效關係保持不變。
- 所有選取職掌可在同一張規劃表同時查看，每個職掌永遠只占一列；列內各異常項目可有不同預定結果，切換或修改其中一項不得非預期改寫不相依異常的規劃。
- 各異常項目的目標職位初始為空，不得依主管、階層、其他承擔職位或其他項目選擇自動預填；尚未完成的異常項目應有可辨識狀態，但不得在使用者尚未提交整批套用前偷偷寫入資料。
- 待重新分配異常項目可辨識原職位、原部門及原關係類型；職掌列共用顯示工作職掌、目前其他承擔職位及整列規劃結果。「缺少主執行」與「無執行職位」不虛構原職位／部門／關係資料。
- 每個職掌列可看見目前所有其他有效承擔職位及其關係類型；待重新分配異常項目也可選擇「不再指派」。資訊不得只顯示總人數而隱藏現有分工。
- 對非主執行的待重新分配關係選擇「不再指派」後，該失效關係解除且不建立替代關係；對待重新分配主執行選擇「不再指派」後，該失效關係解除、職掌保留，並依剩餘有效執行關係顯示非阻擋的「缺少主執行」或「無執行職位」。
- 「缺少主執行」列可明確選擇既有其他執行並提升為唯一主執行，或選擇任一有效職位並在同一操作中新增執行關係及設為唯一主執行；目標預設留白，未處理時異常持續存在，且沒有「不再指派」或隱藏警示的完成方式。
- 「無執行職位」列可選擇任一有效職位，並在同一原子操作中新增執行關係及設為唯一主執行；目標預設留白，套用成功後不得短暫或持續留下「缺少主執行」。
- 使用者可將三種異常跨職掌、跨關係類型混合選入同一張規劃表；影響預覽、套用失敗回復及一次 Undo／redo 必須涵蓋整個混合批次，不得依異常類型拆成部分成功。
- 使用者從右側明細完成多個職掌的規劃後，主表仍可同時掃描所有選取職掌、異常標籤及規劃摘要；右側明細的任何單項操作不得跳過整批影響預覽或提前套用。
- 畫面只有中央表持續可見工具列的一個「預覽並套用」入口；右側明細不得出現會讓使用者誤認為逐列生效或另一條提交路徑的主要動作。由該入口開啟的預覽涵蓋目前整批規劃。
- 尚未套用的規劃會自動保存；同機重新整理頁面後可恢復該organization version的相同 batch plan。恢復後組織版本仍維持套用前狀態，必須再次由唯一入口完成預覽與確認才會寫入。
- 第一階段不驗收登入者隔離、登出／登入續接或另一裝置恢復；畫面與文件不得把本機workspace草稿標示為「私人」或「跨裝置同步」。
- 修改規劃後可觀察工具列依序進入「儲存中」及「已儲存」；模擬保存失敗時顯示「儲存失敗」、目前輸入不消失並發生自動重試。失敗尚未恢復時離開頁面會收到警告。
- 草稿基準資料被另一合法寫入改變後，重新開啟草稿仍保留不衝突輸入，衝突或已失效項目有明確文字狀態及恢復控制；衝突存在時不能完成套用。處理所有衝突並重新預覽後才可提交，且不得復原或覆蓋未包含在草稿預覽中的新資料。
- 整批套用成功後，重新整理不再恢復已套用草稿；使用者確認「捨棄草稿」後亦相同，且不存在草稿歷史或再次套用入口。正式批次仍能一次 Undo 及 redo，不能因草稿已刪除而失效。
- 未完成草稿經長時間未使用仍可由同一本機workspace恢復；恢復時依目前基準重算，不得因沒有時間到期而略過衝突檢查。
- 組織版本mode／status為唯讀時，草稿內容可查看但所有編輯、保存與套用控制均不可用且原因可辨識；恢復可編輯後先重算。Future permanent version delete完成後不得再恢復該version草稿。
- 分頁B先保存相同version plan後，分頁A以舊plan revision執行保存、捨棄或套用皆被拒絕；A目前memory input不消失，reload／reconcile後保留安全項目並標示衝突，不得last-write-wins。
- 同機重新整理或重新進入時，本機草稿自動載入且工具列顯示「已恢復草稿」與最後成功保存時間；沒有衝突時不出現 Modal。若有衝突、唯讀或保存失敗，例外訊息能說明限制及恢復方式。
- 套用成功後執行一次 Undo，可完整復原正式批次結果且 redo 仍可使用，但本機草稿保持不存在；再次進入規劃時建立空白草稿，不能同時恢復舊草稿造成重複套用。
- batch plan 有一項變更但仍有未完成項目時，可以開啟預覽並看見具體缺口；預覽中的「套用」為 disabled 且有可辨識原因。完成全部選取項目、最新保存成功、衝突為零、version mode／status可編輯且receipt current後才可套用，任一 gate 失效即重新 disabled。
- 在 desktop／laptop 可完成中央表、overlay drawer、預覽與套用；在 tablet／mobile 相同資料以可讀且不溢出的響應式唯讀形式呈現，且 DOM／互動上不存在可成功寫入、捨棄或套用的入口。
- 「捨棄草稿」不與主要 CTA 並列，從工具列次要選單啟動；確認視窗中的受影響職掌數與規劃變更數符合目前整批草稿。取消不改資料，確認刪除整批且重新整理後不能恢復，不要求輸入確認文字。
- 任一異常項目的規劃已解除同列另一項異常時，另一項仍顯示「將由相關規劃解除」且不能設定衝突目標；撤回解除來源後，該項若仍異常必須立即恢復操作，不能永久停用或遺失。
- 相同初始版本及相同整體規劃內容，在表格排序、選取順序或畫面列位置不同時，影響預覽及套用後結果完全一致。
- 目標已具有同一職掌與同一關係時，預覽與套用結果只保留一筆有效關係並解除所選異常，不得產生重複關係。
- 套用前預覽可逐筆辨識原狀態與預定結果，並彙總目標職位、職掌數及各關係類型數；確認後全部成功或全部失敗，不得留下部分改派。
- 成功批次改派可由一次 Undo 完整回復，再由一次 redo 完整重做；不得要求逐筆復原或產生半套狀態。
- 可編輯組織版本者可從中央頁或職位細節管理全部職掌；唯讀、比較唯讀及非維護中的現行版均不得因職掌功能取得額外寫入入口。
- OrgMaster 不因本 DEV 保存實際核駁決定、外部 approval transaction 或 AI-PDM 領域資料。

## RD Implementation Handoff

- ADR-006固定正式Duty／relation進入organization document V6、local batch plan使用獨立workspace-side store；不得把未套用plan放入版本文件或把正式Duty另建第二個版本權威。
- Duty／relation／三種anomaly／batch intent具穩定identity；兩個以上active primary為blocking invariant，零primary則保持可保存的非阻擋異常。
- Position失效、永久移轉與batch apply均固定為完整state的原子command；batch使用version＋plan CAS、apply receipt、idempotency與crash recovery，不能逐列部分寫入。
- V5→V6只加入空Duty集合，不依Role、Position或主管關係猜測；DEV-020 comparison忽略Duty，DEV-027 governance snapshot不納入Duty。
- Autosave固定600ms debounce與bounded backoff；同機多分頁以opaque plan revision CAS拒絕stale writer。`>=1024 CSS px`為完整規劃驗收基準，窄viewport唯讀。
- 第一階段明確為本機單一workspace，沒有可信登入principal、版本server ACL、每人私有、跨裝置或lease／接手承諾；這些均為Future Phase，不是升至`RD Implementation Ready`的P0依賴。
- 第一階段產品決策無待確認；若未來要把review／countersign變成審核資格或外部系統權限，必須重新進入DEV-027 policy boundary。
- 權威spec第21–26節已固定`src/duties.ts`／`src/dutyPlanning.ts`、8個organization commands、V6 explicit legacy migration、shared root lock、local plan store、固定HTTP routes、10分鐘receipt、journal roll-forward、client hook／UI wiring、完整file allowlist與S1–S5 gate。
- Entry baseline：2026-08-18 `npm test -- --run`通過28 files／167 tests；初次完成為33 files／183 tests；2026-08-19生命週期競賽回歸修正後為34 files／185 tests；URL page upgrade後為35 files／187 tests。既有Vite native config loader extension warnings與bundle chunk warning不納入DEV-028 scope。
- 完成狀態：S1 Domain＋V6→S2 Commands＋projector→S3 Store＋API＋recovery→S4 Hook＋UI→S5 QA／QC均已通過；沒有產品決策、identity或version ACL blocker；未執行deploy/release。

## 變更紀錄

- 2026-08-19：依使用者要求將工作執掌規劃由 full-screen dialog 升級為固定 `/duty-planning` 完整 URL 頁面；App 保留同一 `useDutyPlan`、矩陣／異常規劃與保存路徑，新增 direct-load、reload、browser-back 與 `?position=` 聚焦驗證，未新增資料模型或 API。
- 2026-08-19：徹查持續出現的 `PLAN_REVISION_CONFLICT`，以隔離 5001 runtime 及延遲 PUT 證實單一頁面切換 matrix／planner 時，`DutyPlanningView` 會卸載 `useDutyPlan`，但舊 PUT 繼續完成；新 hook 先讀到舊 CAS token，下一筆保存即 409。修正為 `App.tsx` 在中央 dialog 外持有 plan，並新增依 organization version 共用、可跨 hook instance 等待的 mutation queue；server-authoritative plan revision 不再被 React render 的舊 state 回寫，409 改顯示可理解的恢復訊息。相同延遲案例由 PUT 200→409 改為 PUT 200→200，最終顯示「已保存」；`npm test -- --run` 為 34 files／185 tests，`tsc --noEmit`、`npm run build` 及 browser regression 通過。
- 2026-08-19：修正 DEV-028 Duty 本機草稿的同頁 autosave 競賽與過期 organization base revision 重算後未自動保存：PUT／DELETE 改為同一序列執行，reload 等待既有寫入完成，reconcile 後自動保存無衝突結果；另修正 governance unchanged-status command 不應因 `updatedAt` 變更而誤判為 applied。`npm test -- --run`、`tsc --noEmit`、`npm run build` 與 browser smoke 通過。
- 2026-08-18：依使用者要求把DEV-028由`RD Contract Ready`補至`RD Implementation Ready`；補齊repo/file allowlist、domain symbols、V6 migration、deterministic projector、8個commands、shared root lock、plan store／routes／receipt、journal roll-forward、App／UI wiring、S1–S5與可執行驗證命令。Baseline為28 files／167 tests通過；本輪未修改產品程式、runtime data、deploy或release。
- 2026-08-18：使用者確認`56A`；以`Intentional replacement`把第一階段收斂為本機單一workspace plan，保留autosave、reload restore、stale reconciliation、plan／version CAS、preview／atomic apply與discard；登入principal、版本ACL、每人私有、登出／登入、跨裝置及lease／接手移至Future Phase。ADR-006同步更新，風險由High降為Medium，移除identity P0；本輪未修改產品程式。
- 2026-08-18：使用者確認`55A`；沿用同一DEV升級至`RD Contract Ready`，當時建立V6／private plan／lease／API／transaction／migration／UX／QA-QC契約及ADR-006，並識別identity＋version authorization依賴；Current Phase草稿／lease部分及該P0後由`56A`取代。本輪未修改產品程式。
- 2026-08-18：使用者確認 `52A`、`53A`、`54A` 並完成 Brief 產品決策：有規劃變更即可預覽，但整批完整、成功保存、無衝突、具可編輯權與 active lease 才能套用；desktop／laptop 可完整規劃，tablet／mobile 唯讀；「捨棄草稿」位於工具列次要選單並以職掌數及變更數確認。
- 2026-08-18：使用者確認 `49A`、`50A`、`51A`：同一私人草稿採單一跨裝置編輯權，可明確接手且舊工作階段立即停止保存／套用；重新進入頁面自動恢復並在工具列輕量顯示最後保存時間；正式 Undo 不重建已刪除草稿，redo 保持可用。
- 2026-08-18：使用者確認 `46A`、`47A`、`48A`：整批套用成功或確認捨棄後刪除私人草稿且不保留草稿歷史；未完成草稿不因時間自動到期；草稿可見與可編輯狀態不高於所屬組織版本及使用者權限，版本永久刪除時一併清除草稿。
- 2026-08-18：使用者確認 `43A`、`44A`、`45A`：每位規劃者在每個組織版本各有一份私人且可跨裝置續接的草稿；基準資料變動後保留不衝突輸入、標示衝突並在重新處理與預覽前禁止套用；每次修改短暫延遲自動保存，工具列顯示保存狀態，失敗時保留輸入、自動重試並在離開前警告。
- 2026-08-18：使用者確認 `40A`、`41A`、`42B`：右側明細採不推擠中央表的 overlay drawer，切換或關閉不清除規劃；整批「預覽並套用」只有中央表工具列一個入口；未套用 batch plan 自動保存為跨重新整理及登出／重新登入可恢復的持久草稿，但不會自動套用。
- 2026-08-18：使用者確認 `37B`、`38A`、`39A`：中央表異常欄只顯示全部異常短標籤，詳細資料與修復控制移至右側明細；職掌列依最高嚴重程度排序，同級按職掌名稱；篩選命中時保留同列全部異常並標出命中項，篩選統計只計命中異常及命中職掌。
- 2026-08-18：使用者確認 `34A`、`35A`，並以 `36 自訂` 明確取代每異常一列：中央表採 severity-first、同層按職掌名稱排序，並同時顯示全體及篩選後的雙統計；每項工作職掌永遠只占一列，異常欄分項顯示全部異常，個別 identity、嚴重程度、修復及相依重算仍保留。
- 2026-08-18：使用者確認 `31A`、`32A`、`33A`：嚴重程度固定為無執行職位高、缺少主執行中、待重新分配提醒；中央頁同時顯示異常筆數與去重後受影響職掌數；相依異常依完整規劃即時重算，已被相關規劃解除者仍顯示但停用衝突輸入，且結果不受顯示順序影響。原分列呈現後由 `36 自訂` 收斂為同一職掌列內分項。
- 2026-08-18：使用者確認 `28B 自訂`、`29A`、`30A`：同一職掌的失效關係與責任缺口語意及嚴重程度分開顯示；無執行職位可直接選任一有效職位並原子建立執行及主執行；三種異常可混合進同一規劃表、整體預覽及原子套用。原不同表格列呈現後由 `36 自訂` 取代。
- 2026-08-18：使用者確認 `25B`、`26A`、`27A`：新建或編輯職掌可在零個主執行時保存並產生非阻擋異常；依是否仍有其他有效執行職位區分「缺少主執行」與「無執行職位」；缺少主執行可提升既有其他執行或選任一有效職位新增為執行及主執行，未處理不得消除警示。
- 2026-08-18：使用者確認 `22B 自訂`、`23A`、`24A`：所有失效關係都可選擇不再指派；若因此沒有主執行，保留職掌並顯示非阻擋異常（異常名稱後由 `26A` 細分）。修復表不預填目標；`24A` 原採每個異常一列，後由 `36 自訂` 取代為每個職掌一列、異常欄分項呈現。
- 2026-08-18：使用者確認 `19B 自訂`、`20A 補充`、`21A`：多筆異常在同一張表分別指定目標；顯示同一職掌的其他承擔職位並可選擇不再指派；相同關係自動去重；完整預覽後整批原子套用及復原。
- 2026-08-18：使用者確認 `16A`、`17A`、`18C`：待重新分配只警示不阻擋版本使用；保留原職位名稱、原部門與關係類型快照；中央異常集合支援跨職掌及跨關係類型多選批次改派。
- 2026-08-18：使用者確認 `13A`、`14B 自訂`、`15A`：同一職掌為版本內共用資料；刪除關聯職位時不刪職掌或關係，改保留「待重新分配」並在中央頁集中顯示；編輯權限沿用組織版本既有狀態。
- 2026-08-18：使用者確認 `10B`、`11A`、`12A`：全公司矩陣以職位為列並依五種責任群組列出職掌；各組可手動排序；永久移轉只轉移主執行，來源移出執行，其他關係保持不變。
- 2026-08-18：使用者確認 `7B`、`8A 補充`、`9A`：提供全公司職掌清單／矩陣及職位細節雙入口；不建立獨立移轉紀錄且現階段不開發職掌比較；刪除只影響目前編輯版本，舊版本保留。
- 2026-08-18：使用者確認 `4A`、`5A`、`6A`，並補充目前用途是協助總經理與主管規劃全員職掌：三種非執行關係皆允許零至多個職位；執掌採一行名稱加選填說明；各組織版本獨立保存。`6A` 原含比較假設，後由 `8A 補充` 排除於現階段。
- 2026-08-18：使用者在 HCS 引導模式確認 `1A`、`2 自訂`、`3C`：多執行者但唯一主執行；其餘關係只設定與顯示，不串接送審；允許關係重疊並只提供非阻擋提醒。
- 2026-08-18：依使用者確認建立 `Brief Ready`；固定無主管預設值、四種明確職位關係與第一階段只做永久移轉。本輪未修改產品程式、spec、ADR、migration、deploy 或 release。

## DEV-027：OrgMaster 權限與審核治理中心

狀態：完成（`RD Implementation Complete / QA-QC Passed / Historical Local MVP / Target Boundary Superseded by ADR-007`）
文件成熟度：`RD Implementation Complete`（歷史 local V1）；新目標 DEV-037 Current Phase 已為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending / OrgMaster Only`
節點類型：交付點  
父交付點：DEV-008、DEV-017、DEV-019、DEV-020、DEV-021  
是否計入產品交付完成：是  
原始需求邊界：讓 OrgMaster 未來承擔與 AI-PDM 串接所需的權限及審核規則治理；目前只修改 OrgMaster，不修改 AI-PDM。

權威契約：`ai-doc/specs/DEV-027-orgmaster-access-approval-governance.md`  
架構決策：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md`（目前目標）、`ai-doc/adr/ADR-004-authorization-approval-policy-boundary.md`（歷史／已取代）、`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`
QA／QC：`ai-doc/qa/DEV-027-governance-foundation-validation-plan.md`

## Human Decision Brief

- 原決策日期：2026-08-18；最新修訂日期：2026-08-27。
- 決策來源：使用者先依 HCS `#引導模式` 回覆 `1B 2A`，其後明確確認外部系統自行設定權限細節、OrgMaster 只負責分配角色。
- `Superseded / 1B external policy authority`：OrgMaster 擁有 AI-PDM 應用角色、permission 與領域審核規則的條款已由 2026-08-27 ADR-007 取代，只保留為 DEV-027 local V1 歷史來源。
- `Human Confirmed / 2026-08-27`：外部系統擁有自己的 Application Role／Permission／Role-Permission mapping／領域審核政策；OrgMaster 擁有 principal mapping、角色指派、assignment scope／有效期間／代理、指派審核與治理 audit。
- `Human Confirmed / 2A`：正式身分採共用 IAM 的不可變 `issuer + subject UID`；OrgMaster 只保存身分連結與狀態，不保存密碼、MFA secret、recovery secret 或長期登入 token。
- `Human Confirmed`：本次實作只修改 OrgMaster；AI-PDM 僅可作唯讀契約參考，不得修改其程式、schema、設定、資料或文件。
- `Engineering Completed`：local governance MVP 已完成 Phase 1 Foundation 與 Phase 2 Policy MVP；未執行跨 repo 串接、migration、deploy 或 release。
- `Engineering Completed / DEV-035`：2026-08-26 依使用者可見 `GOVERNANCE_VALIDATION_FAILED` 重新開啟 QC，補齊 global role assignment、publish blockers／mandatory reason、manage＋publish continuity、可恢復 concurrent revision 與手機治理 mutation default-deny；完成後恢復父交付點的 QA-QC Passed 狀態。
- `Engineering Contract`：OrgMaster 的組織職務 `Role` 與應用授權角色分開建模，避免職稱或部門異動直接產生高風險權限。
- `Engineering Contract`：OrgMaster 可以保存自身角色、身分連結、外部角色 assignment 與指派審核異動的治理 audit，但不得保存 AI-PDM 的 approval transaction audit；兩者不可混稱為同一稽核權威。

## Spec Impact Preflight

分類：`Intentional replacement（2026-08-27 target authority）`

- DEV-021 已完成的主職、兼任與直屬主管路徑保持不變；DEV-027 只取代其對未來 Auth／簽核的 deferred 假設，不回寫或改寫 DEV-021 的歷史交付。
- ADR-004 外部 policy authority 由 ADR-007 取代；DEV-027／035 實作與證據只保留為 historical local V1，產品差距登錄 DEV-037。
- AI-PDM 既有權限及審核契約不在本輪修改範圍；未來若進入實際串接，必須先建立跨 repo integration ADR，明確指定 adapter、相容期、failure mode 與切換方式。
- 本輪產品程式、API、資料與 UI 變更均落在 DEV-027 allowlist；完成 targeted／full regression、build 與 browser QC，未產生 unresolved implementation drift。

## 問題與使用者價值

OrgMaster 已能保存員工、部門、職位、任職有效期間與組織版本，但跨系統仍需穩定 principal mapping 與可追溯角色指派。外部系統的 Permission 與領域審核語意不應在 OrgMaster 重複定義；若直接用職稱、部門、姓名或 email 控制 AI-PDM，組織異動仍可能意外擴權。

DEV-027 的價值是讓管理者在 OrgMaster 用同一治理入口回答：

1. 哪一個穩定人員／系統身分取得哪個外部 Application Role？
2. 角色指派適用於哪個工作區、部門、專案、產品或時間區間？
3. 誰核准、撤銷或代理這次角色指派，引用哪個外部 catalog version？
4. AI-PDM 如何依自身 Role-Permission mapping 消費已發布 assignment，留待跨 repo integration contract。

風險等級：High（身分、權限、審核責任、跨系統契約、稽核與未來正式環境邊界）

## 主要流程

1. 管理者在 OrgMaster 維護員工、職位、部門與有效任職。
2. 管理者以共用 IAM 的不可變 `issuer + subject UID` 連結 OrgMaster principal；名稱與 email 只作顯示或人工核對，不作授權 key。
3. OrgMaster 讀取外部系統提供的唯讀 Application Role catalog；管理者只設定員工角色指派、適用範圍、有效期間與代理。
4. 高風險角色指派依 OrgMaster 治理流程核准並發布；AI-PDM 的領域 action、審核資格、自審與 quorum 規則仍由 AI-PDM 管理。
5. 草稿完成後發布新的角色指派治理版本；只有已發布且 catalog reference 有效的 assignment 可供外部系統消費。
6. AI-PDM 未來依自身 Role-Permission mapping 與 OrgMaster assignment 執行 enforcement，並自行保存領域工作項、核駁決策／交易 audit 與核准後動作。

## 初步產品範圍

- 建立穩定 Person／Employee／External Principal 對應概念，並保留唯一性、停用與衝突拒絕原則。
- 建立與組織職務分離的外部 application role catalog reference，以及 OrgMaster 可寫的 assignment、scope、有效期間與角色代理概念。
- 建立角色指派申請／核准／撤銷與 unresolved catalog reference 概念；不建立 AI-PDM 領域 approval policy。
- 建立只有已發布 assignment version 才可供外部系統消費的治理語意；草稿、比較與封存版本不得改變正式角色指派。
- 建立 OrgMaster 自身 principal mapping、角色、permission 與政策異動的治理 audit 方向；不接管 AI-PDM 的審核交易 audit。
- 為未來外部系統串接保留 provider-neutral API／event adapter 邊界；目前只定義責任，不連線 AI-PDM。
- 第一個產品切片以單一工作區、內部員工、管理者、研發與研發主管角色族群為驗收方向；外部專員與跨工作區列入 future scope。
- 明確禁止 OrgMaster 在 ADR-007 邊界下持久化 AI-PDM approval request、work item、approve／reject decision 或 PDM domain apply 狀態。

## Out of Scope

- 本 phase 不修改 `C:\VIBE CODING\AI_PDM` 下任何程式、schema、migration、設定、資料或文件。
- 不將 AI-PDM 現有審核資料移除、搬移或切換權威，不建立雙寫或直接資料庫存取。
- 不在 OrgMaster 直接執行 PDM 圖面、BOM、檔案、發布或狀態機副作用。
- 不以 OrgMaster 現有 `Role`、部門、職稱、姓名或 email 自動授予外部系統高風險權限。
- 不自行建立帳號密碼、MFA 或 recovery authority；不實作 production identity provider、正式憑證、遠端資料庫、live migration、部署或 release。
- Current executable boundary 已在權威 spec 固定 local governance V1 schema、route、module／file、migration、recovery、QA／QC；正式 provider、production topology 與 cross-repo cache仍屬 Phase 3／4 gate。

## 驗收方向

- 文件明確區分組織職務、登入身分、外部角色目錄、角色指派、外部 Permission authority、適用範圍、指派審核與領域副作用。
- 任一正式角色指派均可追溯到唯一 principal、stable role ID、catalog version、organization version 與 assignment version。
- 草稿組織或草稿 assignment 異動不會改變已發布角色指派。
- 身分衝突、角色未知／停用／不可指派、catalog stale、範圍不符或過期代理預設拒絕，且有可理解恢復方式。
- 外部系統是自身角色／Permission／Role-Permission mapping／領域審核政策 authority；OrgMaster 是人員角色指派及其治理 audit authority，兩者不得雙寫同一事實。
- DEV-027 local MVP 的 allow／deny 與 reviewer simulator 只作歷史 evidence；DEV-037 必須用新的唯讀 catalog／assignment delivery path 重新驗證。
- OrgMaster 只保存自身治理設定異動 audit；AI-PDM 的 transaction audit 不寫回 OrgMaster。
- 文件完成不代表產品完成；只有後續 RD、QA/QC 與適用的 release gate 全部通過才計入交付完成。

## 限制與工程待定

- 現況使用 Vite middleware 與本機 JSON；要承擔正式角色指派治理，後續 phase 必須有可認證的 server boundary、持久化資料庫、append-only audit、備份與可用性設計。
- OrgMaster 已是 Git repo；目前工作樹含多項既有未提交變更，DEV-037 實作前必須先確認本輪檔案邊界，不能覆蓋其他進行中工作。
- `HD-027-01` 原 1B 外部 policy authority 已由 ADR-007 取代；`HD-027-02` 共用 IAM 2A 繼續有效。新目標的產品責任、V2 schema／API、migration／recovery、UI、allowlist 與 executable QA/QC 已由 DEV-037 完成並通過 QA/QC。
- Current implementation沿用 Vite development middleware＋獨立 local JSON governance store；組織文件維持 V5，published policy依 ADR-005保存最小 immutable organization snapshot。
- 正式 IAM provider、durable database、service auth、cache／revocation與availability不阻塞local MVP，但不得在本DEV內自行實作或宣稱production ready。
- 上述工程選擇不得改變 ADR-007／2A；若需要讓 OrgMaster 編輯外部 Permission／領域 Approval Policy、保存 AI-PDM 審核工作項／核駁決策或自建身分 authority，必須回到 Human Decision Gate 並修訂 ADR。

使用思考習慣：#問對問題、#限制條件、#可驗證性

## Architecture Memory Capsule

- OrgMaster 是角色指派治理平面：人員／組織、IAM principal mapping、外部角色 assignment／scope／有效期間／角色代理、指派審核、已發布 assignment version 與自身設定異動 audit。
- AI-PDM 是角色／Permission／領域審核及執行平面：定義自己的 catalog 與 Role-Permission mapping，在敏感 API 執行 enforcement，保存工作項、target snapshot、核駁決策、transaction audit 與冪等，並負責領域狀態及核准後副作用。
- 共用 IAM 是 authentication authority；OrgMaster 不保存 credential 或 MFA secret，授權 key 使用不可變 `issuer + subject UID`。
- 組織職務與應用角色是不同主資料；前者可作人工指派候選與治理檢核資訊，但不得直接等同或自動產生外部 Application Role。
- 只有已發布且 catalog reference 有效的 assignment version 可供外部系統消費；AI-PDM 在自身 server boundary 依其 Permission／Approval Policy 重新驗證。
- 跨系統整合使用具版本 API、event／outbox 與 idempotency，不允許直接跨資料庫寫入。

## All-Phase Coverage Matrix

| Phase / DEV | 執行邊界 | 文件狀態 | Scope | Out of scope | 進入條件 | 驗收方向 |
|---|---|---|---|---|---|---|
| Phase 0 / DEV-027 Historical Contract | OrgMaster 文件 only | `RD Implementation Complete / Historical` | 原 1B／2A、schema／API／file／migration／recovery／QA／QC | AI-PDM 修改 | 當時使用者確認 1B／2A；外部 authority 後由 ADR-007 取代 | 歷史文件治理與 evidence 保留 |
| Phase 1 / DEV-027 Foundation | OrgMaster only | `Completed / QA-QC Passed` | IAM link、application role／permission／scope、published snapshot、governance-change audit、local store／API／UI | approval transaction 與 AI-PDM 串接 | baseline clean | targeted tests、API smoke、audit／CAS evidence |
| Phase 2 / DEV-027 Policy MVP | OrgMaster only | `Completed / QA-QC Passed` | permission evaluator、reviewer resolver、self-approval／delegation rule 與 ephemeral adapter simulator | 持久化 work item／approve-reject decision、AI-PDM live request | Phase 1 targeted gate通過 | engine tests、full regression、build、High-risk browser QC |
| Phase 2.5 / DEV-037 權責重整 | OrgMaster only | `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending` | 外部 catalog 唯讀、角色指派治理、舊 V1 compatibility | AI-PDM live effect、外部 Permission／領域 Approval Policy 編輯 | S1→S4 fresh gates 通過；未授權 deploy／release | forbidden mutation、catalog reference、assignment、migration、normal delivery path 與三 viewport evidence |
| Phase 3 / 跨 repo integration | OrgMaster + 外部系統 | `Future Phase Captured / Not Requested` | catalog delivery、assignment consumption、compatibility window、分批 cutover | 一次性全路由切換 | 使用者另行授權修改 AI-PDM，跨 repo ADR 完成 | 單一權威、mismatch 清零、AI-PDM enforcement 與可回復切換 |
| Phase 4 / release | 正式 target | `Release Gate Required` | migration、備份、可用性、資安、production smoke | 未授權遠端操作 | 明確 target、credential、release scope 與人類授權 | release gate、rollback 與正式 smoke 通過 |

## Future Phase Re-entry Triggers

- 要依新權責開始修改 OrgMaster 產品程式：DEV-037 Current Phase 已完成；後續變更需另開 DEV 或明確回 PM，不得直接依 DEV-027 舊 Permission／reviewer contract 擴張。
- 要開始串接 AI-PDM：使用者必須另行授權修改 AI-PDM，建立跨 repo ADR，並確認相容期與唯一權威切換規則。
- 要接正式身分、資料庫或部署：進入 release gate，確認 provider、正式 target、備份／還原與 rollback；本文件不預寫可執行 release artifacts。

## 規格治理結論

- DEV-027 已完成歷史 local V1 的 `RD Implementation Complete / QA-QC Passed`；Phase 1／2 依序通過，不表示 ADR-007 新目標已實作、AI-PDM 已串接或可直接部署。
- DEV-035 已針對 2026-08-26 可見錯誤完成同一 normal delivery path 的修復與重驗；證據位於 `ai-doc/specs/DEV-035-governance-safe-management-loop.md` 與 `output/playwright/dev035/manifest.md`。
- 權威契約已建立於 `ai-doc/specs/DEV-027-orgmaster-access-approval-governance.md`；本節只保留 PM 摘要，不建立第二套實作真相。
- ADR-004 的外部 policy authority 已由 ADR-007 supersede；共用 IAM 2A 與 AI-PDM transaction／domain apply 邊界保留。
- ADR-007 已 Accepted：外部系統擁有角色／Permission／Role-Permission mapping／領域審核政策，OrgMaster 擁有角色指派治理。
- ADR-005 已 Accepted：治理store與organization V5分離，publish保存immutable organization snapshot。
- 高影響 deferred scope 已以 Phase 2.5～4 capsule、re-entry trigger 與 release gate 收斂，沒有未登錄的跨系統實作授權。

## 變更紀錄

- 2026-08-27：建立 DEV-037 Brief 與 ADR-007，將外部角色／Permission／領域 Approval Policy authority 移回各外部系統；DEV-027／035 保留歷史 local V1 evidence，未修改產品程式或 AI-PDM。
- 2026-08-27：DEV-037 升級為 `RD Contract Ready`；權威契約位於 `ai-doc/specs/DEV-037-external-role-catalog-assignment-governance.md`。DEV-027 仍為 historical local V1，未修改產品程式或 AI-PDM。
- 2026-08-27：DEV-037 完成 RD Readiness Review並升級為 `RD Implementation Ready / RD Not Started`；V2 schema、catalog manifest／hash、V1 migration／recovery、API／UI、allowlist、S1～S4 與 High-risk QA／QC 已固定。未修改產品程式或 AI-PDM。
- 2026-08-27：完成 DEV-037 S1～S4 implementation 與 QA/QC；`122 test files／553 tests`、build、normal Toolbar UI、1440×900／1024×768／390×844、stale catalog、legacy migration、API negative、forbidden scan、AI-PDM before／after unchanged 與 runtime cleanup 均通過；證據：`output/playwright/dev037/manifest.md`。升級為 `RD Implementation Complete / QA-QC Passed / Local Release Gate Pending / OrgMaster Only`，未 deploy／release。
- 2026-08-26：DEV-035 完成治理角色指派與安全發布閉環；typecheck、governance 7 files／18 tests、full regression 60 files／271 tests、build、API smoke、two-session conflict recovery、1440×900／1024×768／390×844 browser QC 與 temporary runtime cleanup 通過。DEV-027 的 QA-QC 完成狀態恢復；AI-PDM 未修改。
- 2026-08-18：依使用者要求建立 `Brief Ready`；固定本輪只修改 OrgMaster，AI-PDM 保持唯讀、不修改。
- 2026-08-18：使用者在 `#引導模式` 確認 `1B 2A`；新增 DEV-027 spec 與 ADR-004，升級為 `RD Contract Ready / Human Confirmed / RD Not Started`。
- 2026-08-18：完成 OrgMaster-only Phase 1／2 實作；targeted tests 9/9、full regression、build、API smoke、browser QC 與五項 evidence artifacts 通過，狀態更新為 `RD Implementation Complete / QA-QC Passed`。
- 2026-08-18：完成RD Readiness Gate，新增ADR-005與High-risk QA／QC plan，補齊local V1 schema、API、file allowlist、migration／recovery、UI與evidence，升級為`RD Implementation Ready`；未修改產品程式或AI-PDM。

## DEV-016：部門刪除改為警示可執行

狀態：完成  
節點類型：交付點  
父交付點：DEV-005、DEV-012  
是否計入產品交付完成：是  
原始需求邊界：部門仍有員工或職位時，畫面改成警示即可，不再因沒有替代部門而阻擋刪除。

## 任務目標

讓管理者可在看見影響範圍後繼續刪除部門；若無替代部門，受影響員工與職位進入明確的「未設定部門」狀態，後續可從編輯欄位重新指定。

風險等級：Medium（破壞性刪除流程與員工／職位部門資料契約變更，需驗證警示、可執行 CTA、Undo 與重新指定）

## UX intent

- 使用者：維護組織與主資料的主管、人資與幕僚。
- 心智模型：警示是影響提示，不是不可執行的錯誤；使用者可選擇轉移，或確認刪除後稍後補設定。
- 主要任務：確認影響數量、選擇轉移或直接刪除，並能在事後重新指定部門。
- 成功狀態：刪除按鈕在無替代部門時仍可用；員工／職位顯示「未設定部門」；任職紀錄與 ID 保留。
- 安全預設：警示明確說明刪除後影響與恢復路徑；有替代部門時預設提供轉移選擇；操作仍納入 Undo。

## Current phase implementation contract

### Scope

- `removeDepartmentFromDirectory` 刪除部門時，從受影響員工的 `Employee.departmentIds` 移除該 ID；若有替代部門則加入替代 ID，保留員工其他部門。
- `Employee.departmentIds` 支援零至多個部門 ID；空陣列統一顯示為「未設定部門」。`Position.departmentId` 與 `PositionView.departmentId` 維持 `string | null`。
- 部門刪除對話框在無替代部門時顯示 warning，不再 disabled CTA；有替代部門時維持轉移並刪除。
- 員工與職位編輯對話框、職位右側屬性提供「未設定部門」選項，讓刪除後資料可重新指定。

### Out of scope

- 自動猜測替代部門、批次重新指定、後端持久化、權限與審批流程。

## 驗收標準

- [x] 部門仍有員工／職位且無替代部門時，警示可見，刪除按鈕 enabled。
- [x] 有替代部門時仍可先轉移再刪除，既有轉移流程不回歸。
- [x] 直接刪除後，受影響員工與職位顯示「未設定部門」，不留下不存在的部門 ID。
- [x] 任職 Assignment、員工 ID、職位 ID 與畫布階層均保留。
- [x] 員工與職位可從編輯入口重新指定現有部門。
- [x] `npm test`（31 項）與 `npm run build` 通過。
- [x] 實際瀏覽器驗證警示、刪除結果、重新指定與 390×844 無水平溢出、無 console error。

## Stop conditions and evidence

- 若無替代部門時 CTA 仍 disabled、刪除後資料遺失／留下無效部門 ID、任職被關閉，或手機版對話框溢出，停止宣告完成並回送 RD。
- 必要證據：部門刪除純函式測試、資料型別 build、警示 DOM snapshot、刪除後「未設定部門」與重新指定操作、390×844 尺寸與 console error 掃描。

## 變更紀錄

- 2026-08-12：依使用者指示將無替代部門的阻擋訊息改為 warning；刪除後關聯資料明確寫入 `null` 未設定狀態。
- 2026-08-12：完成員工／職位重新指定入口、31 項測試與 production build；瀏覽器驗證警示可見、CTA 可用、資料可重新指定且手機版無水平溢出。

## DEV-012：既有職位手動改部門

狀態：完成  
節點類型：交付點  
父交付點：DEV-006、DEV-008、DEV-011  
是否計入產品交付完成：是  
原始需求邊界：既有職位尚不能手動改部門；補齊既有職位的部門選擇與保存功能，不改變員工所屬部門或任職資料。

## 任務目標

讓管理者可以直接調整既有職位的 `departmentId`，並讓組織圖、職位清單、右側屬性與任職細節即時反映新的所屬部門。

風險等級：Medium（既有資料編輯流程與視圖同步變更，需驗證部門 ID、任職保留與 responsive 版面）

## UX intent

- 使用者：維護組織與職務配置的主管、人資與幕僚。
- 心智模型：職位主檔的所屬部門可獨立調整；員工主檔的所屬部門與職位任職不因本操作被改寫。
- 主要任務：選取職位後在右側屬性快速切換部門，或從職位清單的編輯對話框完成名稱與部門一起保存。
- 成功狀態：兩個入口使用相同更新驗證，職位新部門可見，原有 active assignments、員工 ID 與職位 ID 均保留。
- 安全預設：部門下拉只列出目前存在的部門；不存在的部門 ID 不允許寫入。

## Current phase implementation contract

### Scope

- 新增 `updatePositionInDirectory`，集中處理職位名稱、部門與多人任職設定更新，驗證目標部門存在。
- 右側 `Inspector` 新增「所屬部門」選擇器，變更後立即套用並同步任職細節顯示。
- `EditPositionDialog` 新增「所屬部門」選擇器，與職位名稱一起保存。
- 部門變更只更新 `Position.departmentId`，不重建、不關閉、不移除 `Assignment`。

### Out of scope

- 員工所屬部門批次調整、主管／直線匯報關係、容量限制與後端持久化。

## 驗收標準

- [x] 既有職位右側屬性可手動選擇目前存在的部門。
- [x] 職位清單的編輯對話框可同時修改職位名稱與所屬部門。
- [x] 部門變更後組織圖、右側屬性、職位清單與任職細節使用新部門名稱。
- [x] 部門變更不會刪除或重建原有 assignments，員工與職位 ID 維持不變。
- [x] 不存在的部門 ID 會被拒絕，state 維持不變。
- [x] `npm test`（25 項）與 `npm run build` 通過。
- [x] 1280×720 與 390×844 真實瀏覽器畫面無水平溢出、可見錯誤或 console error。

## Stop conditions and evidence

- 若職位改部門造成任職遺失、員工主檔被誤改、下拉可寫入不存在部門，或手機版出現水平溢出，停止宣告完成並回送 RD。
- 必要證據：職位更新純函式單元測試、`npm run build`、右側屬性與編輯對話框 DOM snapshot、1280×720 與 390×844 尺寸檢查、console error 掃描。

## 變更紀錄

- 2026-08-11：補上既有職位的右側部門選擇與職位編輯對話框部門選擇，兩者共用 `updatePositionInDirectory`。
- 2026-08-11：25 項測試、production build 通過；瀏覽器驗證右側切換、對話框保存、任職保留與 1280×720／390×844 無水平溢出。

## DEV-011：同一職位多人任職與任職細節層

狀態：完成  
節點類型：交付點  
父交付點：DEV-002、DEV-008、DEV-010  
是否計入產品交付完成：是  
原始需求邊界：目前一個職位只能放一個人；部分職位需支援複數人。先不做容量上限，只區分單人職位與不限人數多人職位。

## 任務目標

讓組織圖可以表達「同一個職位由多人共同任職」，並保留每一筆目前任職的正式、兼任、代理類型；同一員工原有的一人多職能力不回歸。

風險等級：Medium（資料視圖、指派演算法、畫布節點高度與右側細節同步變更，需單元測試、build 與真實瀏覽器驗證）

## UX intent

- 使用者：維護組織與職務配置的主管、人資與幕僚。
- 心智模型：職位是主檔，Assignment 是目前與歷史任職；多人職位新增人員不會取代既有人員。
- 主要任務：把職位切換為多人模式、加入多位員工、單獨移動或解除其中一位，查看任職類型。
- 成功狀態：職位卡與右側屬性同時顯示所有 active 任職；每位員工仍可獨立拖曳與解除。
- 安全預設：既有職位預設單人；多人模式不設定數字容量；單人職位沿用原本的替換行為。
- 直覺性證據：選取職位後可在 5 秒內找到多人切換、看到目前人數與每位員工的解除入口。

## Current phase implementation contract

### Scope

- `Position.allowMultipleAssignees`：`false` 為單人職位，`true` 為不限人數多人職位。
- `Assignment` 維持員工與職位的關聯資料來源，保留 `assignmentType`、`validFrom` 與 `validTo`。
- `PositionView.activeAssignments` 保存目前有效的完整任職紀錄，不再以單一 `employeeId` 作為職位展示來源。
- 多人職位新增指派時保留既有人員；移動員工時只關閉該員工在來源職位的 active Assignment。
- 職位卡逐一顯示目前員工，右側屬性顯示正式／兼任／代理與單獨解除操作。
- 多人職位節點高度依 active 任職數調整，避免員工列與連線重疊。

### Out of scope

- 數字容量、員額預算、職缺席次、後端持久化、多人協作、權限與任職類型編輯。
- 主管／直線匯報關係與新的 PositionSeat 實體。

## 驗收標準

- [x] 既有職位預設為單人，右側屬性可切換「允許多人同時任職」。
- [x] 多人職位可連續加入兩位以上員工，不會關閉或取代既有人員，且不檢查容量上限。
- [x] 單人職位維持既有單人替換行為；同一員工重複指派不會產生重複 active Assignment。
- [x] 從多人職位移動其中一位員工，只關閉該員工的來源任職，其他人仍保留。
- [x] 職位卡、右側屬性、員工細節與搜尋可正確使用多筆 activeAssignments。
- [x] `npm test`（23 項）與 `npm run build` 通過。
- [x] 1440×900 與 390×844 真實瀏覽器畫面無水平溢出、文字裁切、重疊或可見錯誤。

## Stop conditions and evidence

- 若多人新增取代既有任職、解除操作一次關閉多人、任職類型遺失、節點高度造成連線／卡片重疊，停止宣告完成並回送 RD。
- 必要證據：assignment 與 position view 單元測試、`npm run build`、多人切換／新增／解除的 DOM snapshot、1440×900 與 390×844 截圖／尺寸檢查、console／可見錯誤掃描。

## 變更紀錄

- 2026-08-11：使用者確認先不設容量限制，採 `allowMultipleAssignees` 二元規則；多人模式不限人數。
- 2026-08-11：完成 `activeAssignments` 視圖、多人指派演算法、逐人解除、動態節點高度與右側多人任職細節；23 項測試與 build 通過，瀏覽器 targeted QC 證實多人新增、各自顯示與手機版無水平溢出。
- 2026-08-11：QC 完成；1440×900 與 390×844 均無水平溢出、可見錯誤或 console error，標記 DEV-011 完成。

## DEV-010：三清單唯一主檔與關聯細節層

狀態：完成  
節點類型：交付點  
父交付點：DEV-008、DEV-009  
是否計入產品交付完成：是  
原始需求邊界：三個主清單不可重複展示跨主檔關聯；每個員工、職位、部門仍是唯一主檔，重複需求只在細節層呈現。

## 任務目標

讓清單先回答「有哪些唯一主檔」，再由細節層回答「它和哪些資料有關」，避免同一員工、職位或部門在主清單中被關聯摘要重複呈現。

## Current phase implementation contract

### Scope

- 員工清單只顯示員工唯一主檔名稱；部門與任職職位移至員工細節。
- 職位清單只顯示職位唯一主檔名稱；任職員工、部門與子職位資訊由既有職位屬性面板承載。
- 部門清單只顯示部門唯一主檔名稱與階層縮排；員工與職位清單移至部門細節。
- 右側細節可由員工、部門與職位互相導覽；導覽只引用既有 ID，不建立副本。
- 畫布是組織關係的視覺化，不是第二份主檔清單；畫布可引用主檔名稱，但不新增重複資料。

### Out of scope

- 主管／直線匯報關係、資料庫 schema、後端持久化、權限與新的主檔種類。

## 驗收標準

- [x] 三類主清單的資料列不再顯示跨主檔的部門、員工、任職、子職位或統計摘要。
- [x] 點選員工後，右側細節可查看所屬部門與任職職位，並可導向職位。
- [x] 點選部門後，右側細節可查看階層路徑、部門員工與部門職位，並可互相導向。
- [x] 點選職位後，既有職位屬性面板仍可查看任職員工、部門脈絡與子職位設定。
- [x] 三類清單仍保留搜尋、選取、`⋯` 操作、員工拖曳指派與安全 CRUD。
- [x] `npm test`（20 項）與 `npm run build` 通過；1440×900 與 390×844 真實瀏覽器畫面無水平溢出或可見錯誤。

## 變更紀錄

- 2026-08-11：將主清單由「名稱＋關聯摘要」收斂為唯一主檔名稱，關聯資料改由右側細節層呈現。
- 2026-08-11：新增員工／部門細節面板，完成主檔與關聯資料的互相導覽，並通過桌機與手機 viewport 驗證。

## DEV-009：三清單 UI/UX 互動一致性

狀態：完成  
節點類型：交付點  
父交付點：DEV-004、DEV-006、DEV-007、DEV-008  
是否計入產品交付完成：是  
原始需求邊界：改善員工、職位、部門三個清單的 UI/UX 邏輯一致性，讓使用者能形成穩定操作習慣；主管／直線匯報關係不在本次範圍。

## 任務目標

以同一套互動語法降低記憶成本：使用者在任一清單都能預期新增、選取、更多操作與鍵盤行為的位置及結果。

## Current phase implementation contract

### Scope

- 三個清單標題列固定在相同位置提供「新增」按鈕。
- 每筆資料列支援點擊／Enter／Space 選取；目前選取以一致的藍色狀態呈現。
- 每筆資料列固定在右側提供可見 `⋯` 操作按鈕；右鍵、`ContextMenu` 與 `Shift+F10` 維持為等價替代入口。
- `F2` 開啟編輯、`Delete` 進入既有安全刪除流程、`Escape` 關閉操作選單；員工拖曳指派與職位畫布定位不被取代。
- 部門搜尋使用完整階層路徑，支援以父部門／子部門路徑找到目標部門。

### Out of scope

- 主管／直線匯報關係、權限模型、後端持久化與新的資料型別。

## 驗收標準

- [x] 員工、職位、部門標題列的新增入口位置與視覺語法一致。
- [x] 三類資料列均可點擊選取，並以相同 `⋯` 按鈕開啟對應操作選單。
- [x] 三類資料列均支援 Enter／Space 選取、F2 編輯、Delete 刪除與 ContextMenu／Shift+F10 開啟選單。
- [x] 操作選單可用 Escape 關閉；員工拖曳指派、職位定位與既有安全刪除確認維持可用。
- [x] `npm test`（20 項）與 `npm run build` 通過；1440×900 與 390×844 真實瀏覽器檢查無水平溢出或新增的可見錯誤。

## 變更紀錄

- 2026-08-11：將三清單由「右鍵才可發現操作」調整為標題列固定新增、資料列可見 `⋯`，並保留右鍵與鍵盤替代路徑。
- 2026-08-11：完成共同選取狀態、部門階層搜尋、Enter／Space／F2／Delete／Escape 操作與 1440×900、390×844 瀏覽器驗證。

## DEV-008：員工、職位、部門資料模型收斂

狀態：完成  
節點類型：交付點  
父交付點：DEV-002、DEV-004、DEV-006  
是否計入產品交付完成：是  
原始需求邊界：依使用者決策先完成員工、職位、部門與任職配置的資料基礎，不建立主管／直線匯報關係。

## 任務目標

讓三類主資料不再以顯示名稱互相耦合，後續可支援部門移動、職位空缺、員工多職與任職歷史。

## Current phase implementation contract

### Scope

- `Employee.departmentIds`：員工以零至多個部門 ID 歸屬，不保存部門名稱副本；刪除部門時只移除該 ID，空陣列表示未設定部門。
- `Department.parentId`：部門支援父子階層；新增與編輯阻擋自我／子部門循環。
- `Role`：保存角色定義；`Position` 保存實際職位席位、角色、部門與 active/inactive 狀態。
- `Assignment`：保存員工與職位的任職配置，包含 `assignmentType`、`validFrom`、`validTo`；指派、移動與解除以關閉舊紀錄並建立新紀錄處理。
- 畫布 `OrgMember.parentId` 僅作畫布配置與自動排版資料，暫不視為主管或直線匯報關係。
- 部門清單顯示階層路徑；部門統計分開計算員工數、職位數與已指派職位數。

### Out of scope

- `reportsToPositionId`、`managerEmployeeId`、虛線主管、矩陣匯報與主管權限範圍。
- 後端持久化、匯入匯出、權限與多人協作。

## 驗收標準

- [x] 初始資料以部門 ID、角色 ID、職位 ID 與任職配置 ID 連接，畫布顯示仍與原資料一致。
- [x] 員工多職、移動、解除與刪除會更新目前視圖，並保留任職有效期間資料。
- [x] 部門清單能呈現父子路徑；部門新增／編輯可設定上層部門，循環會被阻擋。
- [x] 職位建立、複製、編輯與刪除不會留下無效職位或目前任職引用；刪除職位會標記 inactive 並關閉目前任職。
- [x] UI 不提供新增主管或主管插入入口；程式資料型別沒有主管／直線匯報欄位。
- [x] `npm test` 與 `npm run build` 通過；本機瀏覽器初始畫布、三清單與職位選取無可見 runtime/console error。

## 變更紀錄

- 2026-08-11：依使用者指示先不建立主管關係，將員工、職位、部門與任職配置拆成可追蹤的資料層；部門父子階層獨立於主管關係。
- 2026-08-11：完成資料模型、任職有效期間演算法、部門循環防呆、三清單與畫布整合；20 項測試與 production build 通過，瀏覽器 smoke check 無可見錯誤。

## DEV-001：組織架構圖畫布 MVP

狀態：完成  
節點類型：交付點  
是否計入產品交付完成：是  
原始需求邊界：畫布編輯、任一階層橫向／縱向、自動生成與避讓線條、職位＋姓名、自由拖曳階層與位置。

## 任務目標

讓熟悉一般辦公軟體或 XMind 的管理者，在不用先學複雜圖形工具的前提下，能以鍵盤或拖曳快速建立、改組並閱讀組織架構。

風險等級：Medium（核心互動跨多個元件，需真實瀏覽器驗證）

## UX intent

- 使用者：公司主管、人資與幕僚；從新手到熟悉 XMind 的進階使用者。
- 心智模型：選取一個職位後新增同階或下屬；拖到另一張卡即改變歸屬；版面由系統整理。
- 主要任務：建立職位、填入員工、改變上下屬、切換下層排列軸向、快速找到職位。
- 成功狀態：每次結構變動後階層清楚，節點與連線不重疊，錯誤操作可復原。
- 自然下一步：選取節點後，工具列與屬性面板只呈現對該節點有效的動作。
- 安全預設：自動排版始終開啟；刪除含下屬的節點必須選擇「下屬上移」或「整個分支刪除」。
- 直覺性證據：5 秒內辨識畫布、主要新增動作、選取狀態與右側屬性；不看說明也能用 Enter／Tab 建圖。

## Current phase RD handoff contract

### Scope

- React 單頁畫布與示範組織資料。
- 節點顯示職位、員工姓名、頭像縮寫與分支收合狀態。
- 每個節點獨立設定下一階為「橫向排列」或「縱向排列」；子樹可混合排列軸向。
- 遞迴自動排版以子樹包圍盒避讓節點；正交連線只走節點間距區。
- 新增畫布子職位、同階職位；職位與員工指派編輯；搜尋、收合、刪除。主管／匯報關係延後。
- 游標在明確放置區且目標／方式穩定後，才以自動排版位置磁吸預覽新的下屬關係／同階順序；線條與其他卡片只在穩定預覽時更新，放開後才寫入結構歷史，不顯示額外定位標籤。
- Undo/redo 與 XMind 類快捷鍵。

### Out of scope

- 登入、多人即時協作、後端儲存、權限、匯入／匯出、列印與正式部署。
- 完全自由座標模式；MVP 以結構正確與自動整齊為優先。

### Data and state contract

- `OrgMember`: `id`, `parentId`, `order`, `childrenAxis`, `collapsed`；`parentId` 僅代表畫布配置，不代表主管／匯報關係。
- `Position`: 以 `roleId`、`departmentId`、`title` 與 `status` 保存實際職位；`departmentId` 可為 `null` 表示未設定部門；畫布節點以同一 ID 引用職位。
- `Assignment`: 以 `employeeId`、`positionId`、`assignmentType`、`validFrom`、`validTo` 保存任職配置。
- `childrenAxis=horizontal`：主管在上方，直接下屬位於節點下方，以水平幹線由左至右分支排列。
- `childrenAxis=vertical`：主管維持在子樹上方，直接下屬從主管下方稍微右移開始，以垂直幹線往下排列，再以水平分支接到各子卡片。
- 自動排版採高密度間距：卡片 `176×60px`、父子層距 `20px`、同層距 `6px`、根節點距 `20px`；仍須保留線路不穿過卡片的最小走道。
- 結構或方向變更必須進入歷史紀錄；選取、搜尋與 viewport 不列入資料歷史。
- 不允許把節點移入自己的子孫；同一父節點的 `order` 在每次搬移後正規化。

### Shortcuts

| 快捷鍵 | 行為 |
| --- | --- |
| `Enter` | 新增同階職位 |
| `Tab` | 新增直接下屬 |
| `Space` / `F2` | 編輯職位 |
| `Alt+↑/↓` | 同階往前／往後排序 |
| `Alt+V` / `Alt+H` | 切換下層橫排／縱排 |
| `Ctrl+Z` / `Ctrl+Y` | 復原／重做 |
| `/` | 搜尋職位或姓名 |
| `Ctrl+0` | 顯示完整組織圖 |

補充：DEV-023 已覆蓋原有畫布刪除快捷鍵契約；組織圖不再綁定 `Delete`／`Backspace`，職位刪除改由右鍵選單或 Inspector 明確啟動。

## 驗收標準

- [x] 新增、編輯與刪除後，卡片立即顯示正確職位與姓名。
- [x] 任意節點切換方向後，其直接下屬與連線同步切換，其他子樹方向保持不變。
- [x] 下層橫向與下層縱向拓撲符合參考圖：前者為下方水平分支，後者為主管下方稍右移的垂直幹線與水平分支。
- [x] 下層縱向時，第一層子卡片的上緣位於父卡片下緣之後，再依序向下排列。
- [x] 混合排列相鄰時，橫排使用淺色細水平幹線，縱排使用低飽和色略粗垂直主幹與接點，灰階或 100% 縮放下仍可辨識且不搶過格子。
- [x] 卡片與線路間距採高密度預設，主要畫布在相同 viewport 可呈現約兩倍的組織資訊，且文字仍可讀、線路不穿過卡片。
- [x] 節點包圍盒互不重疊；父子連線不穿過任何節點卡片。
- [x] 拖曳可改成目標下屬，或插入目標同階的前／後位置，且不可形成循環階層。
- [x] 穩定預覽成立後卡片與正交連線依預覽階層一次重排，拖曳中的原始游標位置不驅動連線連續重算，不依賴「成為下屬／插入前方／插入後方」定位指示。
- [x] 擦邊或短暫經過其他卡片時不啟動預覽，避免預覽位置來回跳動。
- [x] Enter、Tab、Space/F2、Alt+方向、Undo/redo、搜尋與 fit-view 可操作；職位刪除改由明確的右鍵選單或 Inspector 入口啟動。
- [x] 1440×900 與 1024×768 可完成主要流程，無面板或控制項裁切。
- [x] 畫面無可見 runtime error、HTTP 錯誤或工程識別碼。

## Stop conditions and evidence

- 若混合方向排版產生節點重疊或循環階層，停止宣告完成並回送 RD 修正。
- 必要證據：`npm test`、`npm run build`、本機 URL、拓撲截圖與主要互動人工檢查。

## Future phase capsule

多人協作、資料持久化、匯入／匯出與列印只有在 MVP 編輯手感通過後重新進入規劃；屆時需另補資料所有權、版本衝突與權限契約。目前標記為 `Future Phase Captured / Not Requested`。

## 變更紀錄

- 2026-08-10：由原始需求建立 RD Implementation Ready 契約並開始實作。
- 2026-08-10：完成 MVP；3 項版面測試、production build、兩個 viewport 與主要瀏覽器互動均通過，乾淨 console 為 0 error / 0 warning。
- 2026-08-10：依參考圖修正向右展開拓撲；主管上移至子樹頂端，改用垂直幹線向下接水平分支，並補上雙模式截圖證據。
- 2026-08-10：依使用者截圖收緊自動排版間距，將父子層／同層／根節點間距調整為 `48px`／`18px`／`48px`。
- 2026-08-10：補強向右展開版面測試，固定驗證第一層子卡片必須接在父卡片下緣之後。
- 2026-08-10：依最新參考圖調整向右展開，改為父卡片下方稍右移的子卡片堆疊，垂直幹線靠近父卡片左側。
- 2026-08-10：拖曳改為即時預覽重排，移除卡片上的定位標籤，並以游標畫布座標判斷放開時的目標。
- 2026-08-10：修正拖曳閃爍；改用同步版面提交並保留未變更節點實例，避免拖曳時整批節點被重建。
- 2026-08-10：預覽啟動改為明確放置區加連續穩定命中；放開時沿用最後已確認的穩定候選，避免邊界抖動造成預覽與套用結果不一致。
- 2026-08-10：拖曳預覽改為穩定版面磁吸；拖曳中的原始游標位置不再驅動連線與版面連續重算。
- 2026-08-10：放置定位改採結構槽位候選；子階使用卡片中央區，同階使用兄弟卡片間隙的插入 index，並加入 120ms 穩定確認與 10px 候選遲滯。
- 2026-08-10：拖曳未命中穩定槽位時改用游標卡片＋原位藍框雙層呈現；穩定預覽成立後移除藍框，切換至完整自動排版預覽。
- 2026-08-10：將分支語意由空間方向改為下一階排列軸向，資料欄位改為 `childrenAxis`，UI 改為下層橫排／縱排並加入結構縮圖。
- 2026-08-10：強化混合排列的非語言辨識；橫排採淺色細線，縱排採低飽和色略粗主幹並加入分支接點，維持畫布美觀與拓撲差異。
- 2026-08-10：將畫布調整為高密度版；卡片縮至 `176×60px`，父子／同階／根節點間距縮至 `20px`／`6px`／`20px`，並同步縮小線路走道與背景網格。

## DEV-002：員工清單與多職指派

狀態：完成  
節點類型：交付點  
父交付點：DEV-001  
是否計入產品交付完成：是  
原始需求邊界：新增員工清單；員工可拖入、拖離或移動到其他職位；同一員工可身兼多職。

## 任務目標

讓管理者從固定可見的員工清單，以直接拖放完成職位指派與調整，不再把姓名當成職位文字欄位；同一員工可被多個職位引用。

風險等級：Medium（修改核心資料模型、搜尋、節點互動與版面，需 targeted test/build 與真實瀏覽器 QC）

## UX intent

- 使用者：負責維護組織與職務配置的主管、人資與幕僚。
- 心智模型：員工清單是人員來源；從清單拖入是新增指派，從職位拖曳則是移動，拖到畫布空白處是解除指派。
- 成功狀態：職位卡立即顯示正確員工；員工清單保留所有員工並顯示任職數；同一人可再次由清單拖到另一職位。
- 安全預設：拖曳職位上的員工不改變組織節點階層；取代或解除指派可用既有 Undo 復原。
- 可發現性：員工清單與未指派職位都有拖放提示；職位上的員工提供明確移除按鈕與鍵盤替代操作。

## Current phase RD handoff contract

### Scope

- 新增固定員工清單、姓名搜尋、每位員工的任職數與拖曳來源。
- 職位改為引用獨立員工 ID；一個職位同時最多一位員工，同一員工可被多個職位引用。
- 從員工清單拖入職位會新增／取代該職位指派，不移除同一員工的其他職位。
- 從職位拖到另一職位會移動該次指派；拖到畫布空白處或使用移除按鈕會解除該次指派。
- 指派、移動、取代與解除納入既有 Undo/redo；搜尋同時支援職位與已指派員工姓名。

### Out of scope

- 員工 CRUD、匯入、後端持久化、權限、多人同職位與行動裝置觸控拖曳。

### Data and state contract

- `Employee`: `id`, `name`, `departmentId`。
- `Position` 與 `Assignment` 分離職位席位及員工任職；同一員工可有多筆 active 任職配置。
- `OrgMember`: 以 `employeeId: string | null` 取代姓名文字；多個 `OrgMember` 可引用同一 `Employee.id`。
- 員工清單是完整來源，不因指派而移除；任職數由目前 active `Assignment` 即時計算。
- 由清單拖曳的語意為 copy assignment；由職位拖曳的語意為 move assignment。

## 驗收標準

- [x] 員工清單可搜尋，並顯示每位員工目前任職數。
- [x] 從員工清單拖到未指派或已指派職位，可正確新增或取代指派。
- [x] 同一員工可由清單依序指派到至少兩個職位，兩處都保留。
- [x] 從職位上的員工拖到另一職位，只移動該次指派，不影響該員工的其他職位。
- [x] 從職位拖到畫布空白處或按移除按鈕，可解除指派，且員工仍存在清單。
- [x] 指派異動可用 Undo/redo 復原與重做；原有組織節點拖曳階層不回歸。
- [x] 1440×900 與 1024×768 可完成主要流程，無重疊、裁切、非預期水平 overflow 或可見 runtime error。

## Stop conditions and evidence

- 若員工拖曳觸發組織節點搬移、同一員工無法多職、拖離造成員工從清單消失，停止宣告完成並回送 RD。
- 必要證據：assignment 單元測試、既有測試、`npm run build`、本機 URL、兩個 viewport 與拖入／多職／移動／解除的互動截圖。

## 變更紀錄

- 2026-08-10：建立 RD Implementation Ready 契約並開始實作；Spec Impact Preflight 判定為使用者明示的 `Intentional replacement`。
- 2026-08-10：RD 完成獨立員工資料、員工清單、拖入／移動／解除與快捷指派；3 個 assignment 測試與 6 個既有版面／拖曳測試通過。
- 2026-08-10：targeted QC 通過；1440×900 與 1024×768 無文件溢出或可見錯誤，並以真實拖曳驗證一人多職、移動、拖離、Undo/redo 與組織節點拖曳回歸。Spec Drift / Convergence Check：`In sync`。

## DEV-003：職位右鍵選單與複製

狀態：完成  
節點類型：交付點  
父交付點：DEV-001  
是否計入產品交付完成：是  
原始需求邊界：新增右鍵清單功能，其中一個功能為「職位複製」。

## 任務目標

讓管理者直接在職位卡上按右鍵取得與該職位相關的常用操作，並能快速建立同階職位副本，不必從工具列反覆新增與重填設定。

風險等級：Medium（新增浮層、鍵盤焦點與結構寫入行為，需 targeted test/build 與真實瀏覽器 QC）

## UX intent

- 使用者：以滑鼠密集維護組織圖的主管、人資與幕僚。
- 心智模型：在物件上按右鍵，選單只顯示對該職位有效的常用動作。
- 成功狀態：右鍵位置附近顯示選單；選擇「職位複製」後，同階下一格立即出現可編輯副本。
- 安全預設：只複製單一職位的名稱與下層排列，不複製員工指派或下屬，避免意外重複人事關係與分支。
- 錯誤恢復：複製進入既有 Undo/redo；點擊選單外、按 Escape、捲動或調整視窗會關閉選單。

## Current phase RD handoff contract

### Scope

- 職位卡右鍵開啟 context menu，並同步選取該職位。
- 選單整合「新增下屬」、「新增同階」、「職位複製」、「編輯職位」與「刪除職位」。
- 「職位複製」建立同父節點、緊接來源之後的單一職位，保留 `title` 與 `childrenAxis`。
- 複本使用新 ID、不建立任職配置、不含來源下屬，並將後續同階 `order` 順延。
- 選單具備 viewport 邊界避讓、Escape 關閉、點擊外部關閉與基本鍵盤焦點。
- 複製行為納入既有 Undo/redo，完成後選取副本並聚焦職位名稱。

### Out of scope

- 複製整個分支、複製員工指派、剪下／貼上、跨組織貼上與自訂右鍵選單項目。

## 驗收標準

- [x] 在任一職位卡按右鍵，原生選單不出現，OrgMaster 選單在游標附近開啟且職位被選取。
- [x] 選單包含新增下屬、新增同階、職位複製、編輯職位與刪除職位，危險動作有明確視覺區隔。
- [x] 職位複製會在同階下一格建立同名副本，保留排列設定，但不複製員工與下屬。
- [x] 複製後同階順序連續，Undo/redo 可完整還原與重做。
- [x] 點擊外部、Escape、捲動與視窗縮放可關閉選單；鍵盤焦點不會留在已關閉浮層。
- [x] 1440×900 與 1024×768 的邊角職位開啟選單時無裁切、重疊、水平 overflow 或可見 runtime error。

## Stop conditions and evidence

- 若複製帶入員工、下屬、重複 ID、非連續 order，或選單超出 viewport，停止宣告完成並回送 RD。
- 必要證據：position duplication 單元測試、既有測試、`npm run build`、兩個 viewport、右鍵選單與複製後畫面截圖。

## 變更紀錄

- 2026-08-10：建立 RD Implementation Ready 契約；Spec Impact Preflight 判定 `No conflict`。
- 2026-08-10：RD 完成職位 context menu、單一職位安全複製、同階 order 順延、鍵盤導覽與 Undo/redo；新增 2 個 duplication 單元測試，連同既有測試共 11 項通過。
- 2026-08-10：修正複製後標題欄切換職位時的焦點競態，避免未完成的舊草稿誤寫到新選取職位。
- 2026-08-10：targeted QC 通過；1440×900 與 1024×768 實測右鍵、鍵盤複製、Escape／外部點擊／捲動關閉、Undo/redo 與右下角 viewport 避讓，文件尺寸等於 viewport，console 0 error / 0 warning。Spec Drift / Convergence Check：`In sync`。

## DEV-004：三類主資料清單與獨立收合

狀態：完成  
節點類型：交付點  
父交付點：DEV-002  
是否計入產品交付完成：是  
原始需求邊界：新增職位清單與部門清單，資料及 UI 架構比照員工清單；員工、職位、部門清單皆可由各自按鈕收起。

## 任務目標

讓管理者在同一個左側主資料入口快速搜尋員工、職位與部門，並能按工作需要開啟、切換或收起清單，避免清單長期占用組織圖畫布。

風險等級：Medium（改變工作區主要側欄、加入兩類資料摘要與響應式收合行為，需 targeted test/build 與真實瀏覽器 QC）

## UX intent

- 使用者：維護組織圖的主管、人資與幕僚。
- 心智模型：左側三個具名按鈕分別代表員工、職位與部門；點擊目前項目即收起，點擊其他項目即切換。
- 主要任務：搜尋及定位主資料；不需要清單時釋放畫布寬度。
- 成功狀態：三份清單資訊骨架一致，切換不影響組織資料或選取；收起後畫布立即取得更多空間。
- 自然下一步：從員工清單指派人員、從職位清單定位節點、從部門清單查看人數與已指派職位數。
- 安全預設：初始開啟員工清單；同時間只呈現一份完整清單，避免多欄擠壓畫布。
- 錯誤恢復：任一清單收起後，其固定具名按鈕仍可立即重新開啟；搜尋無結果時保留明確空狀態。
- 直覺性證據：5 秒內可辨識三類清單按鈕、目前開啟項目及收合方式；鍵盤可切換並收合。

## Current phase RD handoff contract

### Scope

- 新增左側主資料清單列，提供「員工」、「職位」、「部門」三個具名 toggle button。
- 同時間最多顯示一份完整清單；點擊目前按鈕或面板收合按鈕會關閉，點擊其他按鈕直接切換。
- 三份清單共用標題、數量、短用途句、搜尋欄、資料卡、計數 badge 與空結果的資訊骨架。
- 員工清單保留既有拖曳指派、多職計數與快捷指派行為。
- 職位清單由目前 `OrgMember[]` 即時產生，可依職位、員工或部門搜尋；選取資料卡會在畫布定位該職位。
- 部門使用獨立 `Department[]` 主資料，含 `parentId` 部門階層；清單顯示部門員工數、職位數與目前已指派職位數；可依部門名稱搜尋。
- 清單開關及搜尋屬 UI state，不進入組織 Undo/redo 歷史。

### Out of scope

- 員工、職位或部門 CRUD、拖曳新增職位、拖曳調整部門、部門階層、後端持久化與權限。
- 同時展開多份完整清單；本階段以維持畫布可用寬度為優先。

### Data and state contract

- `Department`: `id`, `name`, `parentId`；`initialDepartments` 為完整部門來源。
- 職位清單引用即時 `OrgMember[]`，不得建立會與組織圖分歧的第二份職位狀態。
- 部門員工數由包含該 ID 的 `Employee.departmentIds` 計算；職位數由 active `Position.departmentId` 計算；已指派職位數由 active `Assignment` 計算。
- active directory 為 `employees | positions | departments | null`；`null` 代表三份完整清單皆收起，但三個重開按鈕保持可見。

## 驗收標準

- [x] 左側固定顯示員工、職位、部門三個具名按鈕，能辨識目前開啟項目。
- [x] 三份清單皆有標題、數量、搜尋、資料卡、計數 badge、空結果與面板收合按鈕。
- [x] 點擊目前清單按鈕或面板收合按鈕可收起；收起後畫布寬度增加，按鈕仍可重新開啟。
- [x] 點擊另一清單按鈕會直接切換，且不改變組織資料、Undo/redo 或目前職位選取。
- [x] 員工拖入、多職、移動與解除指派維持可用；職位清單能定位節點；部門統計與示範資料一致。
- [x] 三份搜尋各自保留查詢狀態，無結果時顯示對應空狀態，不影響其他清單。
- [x] 1440×900、1024×768 與 390×844 下可操作，無重疊、裁切、非預期水平 overflow 或可見 runtime error。

## Stop conditions and evidence

- 若新增清單造成員工拖曳回歸、職位清單與組織圖資料分歧、部門計數錯誤、收起後無法重開，或關鍵 viewport 破版，停止宣告完成並回送 RD。
- 必要證據：directory summary 單元測試、既有測試、`npm run build`、三清單切換／搜尋／收合操作、三個 viewport、DOM 尺寸與 console／可見錯誤掃描。

## 變更紀錄

- 2026-08-10：建立 RD Implementation Ready 契約；Spec Impact Preflight 判定為使用者明示的 `Intentional replacement`，將 DEV-002 的「固定可見員工清單」改為可收合的三類主資料入口。
- 2026-08-10：RD 完成三類具名切換按鈕、共用清單骨架、職位定位、獨立部門資料與即時部門統計；新增 2 個 department summary 測試，連同既有測試共 13 項通過。
- 2026-08-10：targeted QC 通過；實測三清單切換、各自搜尋狀態、職位定位、部門轉看員工、員工指派與 Undo 回歸。1440×900 收合後畫布由 846px 增至 1072px，390×844 由 152px 增至 342px；1440×900、1024×768、390×844 均無文件溢出、可見錯誤或 console error。Spec Drift / Convergence Check：`In sync`。

## DEV-005：三類主資料新增與安全刪除

狀態：完成  
節點類型：交付點  
父交付點：DEV-004  
是否計入產品交付完成：是  
原始需求邊界：員工、職位、部門三個清單都要有新增及刪除功能。

## 任務目標

讓管理者可在目前的三類主資料清單直接建立或移除資料，同時避免刪除主資料留下無效的任職或部門引用。

風險等級：Medium（操作會同時影響主資料與組織圖引用，需純函式關係測試、建置與真實瀏覽器 QC）

## UX intent

- 心智模型：三份清單的標題列都有「新增」，每筆資料都有「刪除」；相同動作位置一致。
- 成功狀態：新資料立即出現於對應清單，刪除後不存在懸空引用，且可用 Undo 還原。
- 安全預設：刪除均需確認；刪除員工時明示將解除的任職數；刪除仍有員工或職位的部門時，若有替代部門可先轉移，若沒有則警示後可刪除並改為未設定部門。
- 錯誤恢復：表單保留原地驗證與明確的下一步，關聯資料變更作為單一 Undo/redo 交易。

## Current phase RD handoff contract

### Scope

- 員工、職位、部門清單標題列各有具名「新增」按鈕，資料列各有刪除按鈕。
- 新增員工需輸入姓名並可複選現有部門；未勾選表示未設定部門。刪除員工時同步解除該員工的所有職位指派。
- 從職位清單新增職位：有選取職位時新增為同階，未選取時新增為根節點；刪除沿用既有「下屬上移／整個分支」安全流程。
- 新增部門名稱不可為空白或與現有部門重複；刪除有員工或職位的部門可選擇另一部門承接，沒有替代部門時改為未設定部門。
- 三類 CRUD 及其關聯資料變更共用單一組織狀態歷史，一次操作只產生一個 Undo/redo 節點。

### Out of scope

- 編輯現有員工或部門、批次新增或刪除、匯入匯出、後端持久化、權限與審批。

## 驗收標準

- [x] 員工、職位、部門清單皆可從標題列新增，並可從對應資料列刪除。
- [x] 員工姓名、所屬部門選項與部門名稱有驗證；員工所屬部門可複選，部門名稱有重複驗證。
- [x] 刪除員工會解除其所有職位指派；刪除部門不會留下無效部門引用。
- [x] 職位刪除保留下屬上移與整個分支確認，從清單開啟時可正確對應目標職位。
- [x] 新增、刪除與關聯變更可由 Undo/redo 來回撤銷，且不產生懸空員工或部門引用。
- [x] 1440×900、1024×768 與 390×844 下對話框、按鈕與資料列可操作，無重疊、裁切、溢出或可見錯誤。

## Stop conditions and evidence

- 若刪除造成懸空引用、Undo/redo 無法原子還原關聯資料、三清單操作不一致，或關鍵 viewport 不可操作，停止宣告完成並回送 RD。
- 必要證據：directory mutation 單元測試、全部既有測試、`npm run build`、三類新增與刪除操作、Undo/redo、三個 viewport、DOM 尺寸與 console／可見錯誤掃描。

## 變更紀錄

- 2026-08-11：建立 RD Implementation Ready 契約；Spec Impact Preflight 判定為使用者明示的 `Intentional replacement`，取代 DEV-004 將三類 CRUD 列為 out of scope 的階段邊界。
- 2026-08-11：RD 完成三清單一致的標題列新增與資料列刪除；員工刪除原子解除所有任職，部門刪除先轉移員工或在無替代部門時改為未設定部門，職位刪除沿用分支防呆，並整合至統一 Undo/redo 歷史。
- 2026-08-11：QA/QC 通過；5 個測試檔共 17 項通過，`npm run build` 成功。真實瀏覽器實測新增員工、員工解除任職式刪除、部門重名驗證、部門轉移刪除、職位新增／刪除與 Undo。1440×900、1024×768、390×844 均無文件溢出、可見 runtime error 或 console error；390px 對話框完整位於 viewport 內。Spec Drift / Convergence Check：`In sync`。

## DEV-006：三類主資料編輯

狀態：完成  
節點類型：交付點  
父交付點：DEV-005  
是否計入產品交付完成：是  
原始需求邊界：員工、職位、部門三份清單皆新增編輯功能。

## 任務目標

讓管理者可直接從三份主資料清單修正員工、職位與部門資料，且修改後組織圖、搜尋、統計與關聯引用立即一致。

風險等級：Medium（部門改名需原子更新所有員工引用，三清單的密集操作區需 RWD 驗證）

## UX intent

- 心智模型：每筆資料的編輯與刪除位於同一操作區，三份清單使用同一支鉛筆 icon 與「編輯」對話框節奏。
- 主要任務：修正名稱或員工所屬部門，儲存後原地繼續掃描清單。
- 安全預設：表單預填現值，必填與重名錯誤留在原對話框；資料未變時不產生新歷史節點。
- 錯誤恢復：修改為單一 Undo/redo 交易，部門改名與員工引用同時復原。
- 直覺性證據：5 秒內可辨識三類資料列的編輯入口；390px 保留編輯與刪除，不讓次要動作擠壓資料名稱。

## Current phase RD handoff contract

### Scope

- 員工資料列新增編輯按鈕，對話框預填姓名與所屬部門；儲存後保留員工 ID 及全部職位指派。
- 職位資料列新增編輯按鈕，對話框預填職位名稱；儲存後組織圖卡片與搜尋立即同步。
- 部門資料列新增編輯按鈕，對話框預填部門名稱與上層部門；改名不改變 ID，移動會阻擋自我／子部門循環。
- 員工姓名、職位名稱、部門名稱不得為空白；部門名稱不得與其他部門重複。
- 三類編輯納入現有統一 Undo/redo 歷史；取消或無變更儲存不改動資料。
- Desktop/laptop 顯示既有次要動作、編輯與刪除；mobile 可降層隱藏可由整列操作取代的次要按鈕，但編輯與刪除必須保留。

### Out of scope

- 修改主資料 ID、批次編輯、內聯編輯、後端持久化、權限、審批與編輯歷程明細。

## 驗收標準

- [x] 員工、職位、部門每筆資料皆有鍵盤可達的編輯按鈕，開啟後預填正確現值。
- [x] 員工編輯可更改姓名與所屬部門，不改變其 ID 或任職關係。
- [x] 職位編輯可更改名稱，組織圖、清單、搜尋與屬性面板即時同步。
- [x] 部門改名會同步更新該部門全部員工的所屬部門，不留下舊名引用；重名被阻擋。
- [x] 三類必填錯誤有貼近欄位的可見說明；取消、Escape 與點擊背景可安全關閉。
- [x] 各類編輯只產生一個 Undo/redo 節點，復原後關聯資料與畫面一致。
- [x] 1440×900、1024×768、390×844 的資料列、對話框與操作按鈕無重疊、裁切、不可讀或非預期 overflow；無可見 runtime/console error。

## Stop conditions and evidence

- 若部門改名留下舊名員工引用、任一編輯破壞 ID 或任職關係、Undo/redo 無法原子復原，或 mobile 無法辨識主要操作，停止宣告完成並回送 RD。
- 必要證據：directory edit 單元測試、全部既有測試、`npm run build`、三類編輯流程與 Undo、三個 viewport 截圖、DOM 溢出、可見錯誤與 console 掃描。

## 變更紀錄

- 2026-08-11：建立 RD Implementation Ready 契約；Spec Impact Preflight 判定為使用者明示的 `Intentional replacement`，取代 DEV-005 將「編輯現有員工或部門」列為 out of scope 的階段邊界。
- 2026-08-11：RD 完成三類預填編輯對話框與一致的資料列入口；員工編輯保留 ID／任職，職位名稱同步畫布／搜尋／屬性面板，部門改名原子更新全部員工引用，並納入統一 Undo/redo。
- 2026-08-11：UI QC 修正桌機清單操作區擠壓資料名稱，以及輸入框聚焦時 Escape 無法關閉對話框的鍵盤事件優先序；mobile 保留編輯與刪除並隱藏可替代的次要操作。
- 2026-08-11：QA/QC 通過；5 個測試檔共 20 項通過，`npm run build` 成功。真實瀏覽器實測三類預填、必填提示、職位搜尋／屬性面板同步、部門重名防呆與員工引用連動、Undo、Escape／背景關閉。1440×900、1024×768、390×844 均無文件水平溢出或可見錯誤，390px 對話框完整位於 viewport 內，console 0 error / 0 warning。Spec Drift / Convergence Check：`In sync`。
- 2026-08-14：依使用者要求將 `Employee.departmentId` 替換為 `Employee.departmentIds`；新增／編輯員工改用可複選部門清單，員工細節逐項顯示部門，舊 V2 文件載入時自動升級單值欄位；73 項測試、前端 build 與 390×844／1024×768／1440×900 UI smoke 通過。Spec Impact：`Intentional replacement`；Spec Drift：`In sync`。

## DEV-007：三清單操作收進右鍵選單

狀態：完成  
節點類型：交付點  
父交付點：DEV-006  
是否計入產品交付完成：是  
互動策略備註：本交付點原先「操作僅由右鍵發現」的限制，已由 DEV-009 有意替換為「可見 `⋯` ＋右鍵／鍵盤替代入口」；本節保留右鍵選單的功能契約與歷史驗證證據。  
原始需求邊界：這三個清單的功能入口都收到右鍵清單裡，不要佔第一層 UI 版面。

## 任務目標

讓管理者在掃描三份清單時先看到資料本身；新增、指派／定位、編輯與刪除等功能改放到每筆資料的右鍵選單，並維持鍵盤與觸控替代路徑。

風險等級：Medium（移除既有可見操作入口，需確保右鍵、ContextMenu 鍵、Shift+F10 與手機長按／替代操作仍可發現及操作）

## UX intent

- 心智模型：資料列是瀏覽與選取主體；動作集中在該列的「操作選單」。
- 資訊分層：第一層保留名稱、部門／指派摘要、數量、搜尋與拖曳／選取；動作降到右鍵選單。
- 可發現性：每份清單提示可右鍵查看操作；選單在滑鼠右鍵、ContextMenu 鍵、Shift+F10 都能開啟。
- 安全預設：刪除仍在右鍵選單中進入原有確認流程；無選取職位時，員工指派維持 disabled 與原因。

## Current phase RD handoff contract

### Scope

- 員工、職位、部門資料列移除列內指派／定位／查看、編輯、刪除按鈕；表頭新增按鈕也改由清單右鍵選單提供。
- 三類清單共用右鍵選單視覺與鍵盤導覽；選單提供新增及該資料類型的可用操作。
- 清單空白區右鍵可開啟新增入口；資料列右鍵顯示該列的完整操作。
- `ContextMenu` 鍵與 `Shift+F10` 可在鍵盤焦點資料列開啟選單，Escape／點擊外部／滾輪安全關閉。
- 保留員工拖曳、職位選取與部門查看摘要，不以右鍵取代主要資料瀏覽行為。

### Out of scope

- 不改變員工、職位、部門資料模型、編輯／刪除交易、Undo/redo 或拖曳邏輯。
- 不新增後端、權限、批次操作或長按專用手勢。

## 驗收標準

- [x] 三份清單第一層資料列不再渲染動作按鈕；資料名稱、摘要、數量與搜尋仍可讀。
- [x] 三份清單空白區右鍵可開啟新增入口；資料列右鍵可開啟對應操作入口。
- [x] 員工可由右鍵選單指派、編輯、刪除；職位可定位、編輯、刪除；部門可查看員工、編輯、刪除。
- [x] 右鍵選單可由滑鼠右鍵、ContextMenu 鍵、Shift+F10 開啟，並可用方向鍵循環、Escape 關閉。
- [x] 1440×900、1024×768、390×844 無動作按鈕殘留、重疊、裁切或水平溢出；無 console error。

## Stop conditions and evidence

- 若任一清單失去新增、編輯或刪除可達入口，或鍵盤無法開啟／關閉選單，停止宣告完成並回送 RD。
- 必要證據：完整測試、`npm run build`、三類右鍵流程、鍵盤開啟／Escape、三個 viewport 截圖、DOM 溢出與 console 掃描。

## 變更紀錄

- 2026-08-11：建立 RD Implementation Ready 契約；Spec Impact Preflight 判定為 `Intentional replacement`，將 DEV-006 的列內動作入口降層至右鍵選單。
- 2026-08-11：RD 完成共用清單右鍵選單；三類清單的新增、指派／定位／查看、編輯與刪除從第一層列內操作移除，保留資料摘要、搜尋、拖曳與選取。
- 2026-08-11：QA/QC 通過；5 個測試檔共 20 項通過，`npm run build` 成功。真實瀏覽器驗證空白區新增、三類資料列右鍵操作、Shift+F10、Escape、方向鍵導覽與 1440×900、1024×768、390×844；第一層動作按鈕數為 0、文件無水平溢出、console 0 error / 0 warning。Spec Drift / Convergence Check：`In sync`。

## DEV-013：樹狀圖節點寬度縮至 60%

狀態：完成  
節點類型：交付點  
父交付點：DEV-001  
是否計入產品交付完成：是  
原始需求邊界：樹狀圖格子寬度縮小到 60%。

## 任務目標

降低樹狀圖節點的橫向佔用，讓同一畫布可同時閱讀更多分支；節點文字需仍可辨識，連線、拖曳命中與收合互動不可回歸。

風險等級：Low（局部視覺與幾何基準調整，不改資料模型與操作流程）

## Scope / Acceptance

- 節點寬度基準由 176px 調整為 106px（約 60%），並同步 CSS 節點、拖曳 placeholder 與排版計算。
- 樹狀圖標題、員工姓名、未指派提示使用既有 ellipsis 規則，不得超出節點。
- 1440×900、1024×768、390×844 無節點重疊、連線斷裂、裁切、水平溢出或可見 runtime／console error。
- 既有節點拖曳、員工拖入／拖離、收合與選取測試維持通過。

## 變更紀錄

- 2026-08-11：建立局部 UI 幾何調整契約；Spec Impact Preflight：`Compatible exception`，不改變既有資料與互動契約。
- 2026-08-11：RD 將 `ORG_NODE_WIDTH` 由 176px 調整為 106px，並同步 React Flow wrapper、節點卡片與拖曳 placeholder。
- 2026-08-11：QA/QC 通過；6 個測試檔共 25 項通過，`npm run build` 成功。1440×900、1024×768、390×844 實測所有節點 CSS 寬度 106px、無節點重疊、無文件水平溢出或可見錯誤，console 0 error / 0 warning。Spec Drift / Convergence Check：`In sync`。

## DEV-014：移除節點內下層方向圖示

狀態：完成
節點類型：交付點  
父交付點：DEV-013  
是否計入產品交付完成：是  
原始需求邊界：格子裡顯示「縱向／橫向下層關係的 icon」皆刪掉。

## 任務目標

讓樹狀圖格子只保留職位、員工與必要的收合控制，移除不參與操作的下層方向圖示，降低視覺雜訊並增加文字可用空間。

風險等級：Low（移除純視覺欄位，不改變資料、排版方向設定或互動操作）

## Scope / Acceptance

- 從 `OrgNode` 移除 `.org-node__direction` 與下層方向圖示渲染。
- 節點改為單欄內容，既有職位／員工文字、收合、拖曳、連線與選取維持可用。
- 其他工具列或預覽元件仍可使用共用 `ChildrenLayoutPreview`，不做全域刪除。
- 1440×900、1024×768、390×844 無圖示殘留、節點重疊、文字裁切、水平溢出或可見 runtime／console error。

## 變更紀錄

- 2026-08-11：建立局部 UI 可見內容調整契約；Spec Impact Preflight：`Compatible exception`，保留方向設定資料與互動，只移除節點內非操作圖示。
- 2026-08-11：RD 移除 `OrgNode` 內 `.org-node__direction` 及其 20px 版面欄位，節點改為單欄內容；工具列／預覽仍保留共用 `ChildrenLayoutPreview`。
- 2026-08-11：QA/QC 通過；6 個測試檔共 25 項通過，`npm run build` 成功。1440×900、1024×768、390×844 實測 `directionIcons=0`、`directionTitles=0`、節點 CSS 寬度 106px、文字內容寬度 88.4px、無水平溢出或可見錯誤，console 0 error／0 warning。Spec Drift / Convergence Check：In sync。

## DEV-015：組織圖本機文件操作

狀態：完成  
節點類型：交付點  
父交付點：DEV-001  
是否計入產品交付完成：是  
原始需求邊界：在地端編輯組織架構圖時，提供儲存、上一步、存副本與備份功能。

## 任務目標

讓使用者能在同一台電腦的不同瀏覽器視窗持續編輯組織架構圖，明確知道目前是否有未儲存變更，並能將可編輯副本或完整備份帶離本機。

補充目標：即使程式熱重載、瀏覽器刷新或頁面離開前未按「儲存」，最新組織圖仍可由本機自動草稿恢復。

風險等級：Medium（新增本機持久化與檔案下載，但不連接後端、不覆寫外部資料）

## Scope / Acceptance

- 文件操作入口收在頂端「儲存與備份」選單，提供「儲存」、「存副本」與「備份下載」；`Ctrl+S` 可直接儲存，`Ctrl+Shift+S` 可下載副本。
- 「儲存」透過 `localhost:5000` 的本機文件 API 寫入版本化 `data/orgmaster-document.v3.json`，重新載入頁面或開啟其他 Chrome 視窗會載入同一份狀態；V3 不存在時才讀 V2 並在記憶體遷移，無法儲存時顯示可執行的備份替代路徑。
- 組織狀態變更後以約 500ms debounce 自動寫入目前 V3 文件；localStorage 相容 key 依 V3→V2→V1 順序讀取，成功遷移不刪除舊來源。
- 自動保存與正式文件使用相同 V3 parser／validation；V1／V2 可正規化遷移，V3 損壞時 fail closed，保留原始 payload並進入既有復原流程，不靜默載入範例資料。
- 正式「儲存」成功後清除已升版的草稿，避免舊草稿覆蓋較新的正式版本。
- 「存副本」下載 `orgmaster-copy-*.json`；「備份下載」下載含版本與完整組織資料的 `orgmaster-backup-*.json`。
- 既有「復原／重做」與 `Ctrl+Z`／`Ctrl+Y` 維持可用，且不把清單 UI state 寫入組織文件歷史。
- 儲存選單在 1440×900、1024×768、390×844 可辨識、可操作，無定位出界、重疊、水平溢出、可見 runtime error 或 console error。

## Out of scope

- 不新增後端、登入、多人協作、權限、雲端同步或正式資料庫。
- 本輪不提供備份檔匯入／還原 UI；備份檔格式已版本化，後續可獨立建立還原流程。
- 不改變員工／職位／部門資料模型、拖曳、清單 CRUD 或職位複製行為。

## 驗收標準

- [x] 儲存後專案 `data/orgmaster-document.v3.json` 出現版本化文件，重新載入後選單顯示「目前版本已儲存到電腦」且資料可讀回；既有 V2 保留為 migration／recovery 來源。
- [x] 未按「儲存」的變更會由本機文件 API 自動保存；重新載入或其他 Chrome 視窗會讀回最新版本，且文件選單顯示「已自動保存到電腦」。
- [x] 自動草稿格式錯誤時不退回範例資料，原始 payload 可保留至 draft recovery key。
- [x] 存副本與備份下載產生不同檔名且內容包含完整 `OrgDirectoryState`。
- [x] 既有復原／重做按鈕與快捷鍵未回歸；文件操作快捷鍵不攔截文字輸入欄位。
- [x] 1440×900、1024×768、390×844 文件入口與選單無重疊、裁切或水平溢出。

## Stop conditions and evidence

- 若儲存後重新載入無法讀回、下載檔案缺少資料、或手機版文件入口與工具列重疊，停止宣告完成並回送 RD。
- 必要證據：文件儲存單元測試、全部既有測試、`npm run build`、三尺寸文件選單截圖、本機文件 API round-trip、兩個 Chrome 視窗同步、兩種實際下載檔案與 console 掃描。

## 變更紀錄

- 2026-08-11：建立本機文件操作契約；Spec Impact Preflight：`Compatible exception`，沿用既有組織狀態與 Undo/redo，只增加持久化與輸出邊界。
- 2026-08-11：RD 新增版本化 `documentStorage`、頂端 `DocumentMenu`、儲存狀態提示、`Ctrl+S`／`Ctrl+Shift+S` 與本機 JSON 副本／備份下載。
- 2026-08-11：QA/QC 通過；7 個測試檔共 29 項通過，`npm run build` 成功。三尺寸實測文件選單皆有 3 個動作、選單可見、無水平溢出；儲存後 reload status 為「目前版本已儲存」、副本與備份下載事件成功，console 0 error／0 warning。Spec Drift / Convergence Check：`In sync`。
- 2026-08-12：依使用者要求補上自動草稿保存；新增 draft key、以時間戳選取較新文件、頁面離開 flush、草稿 fail-closed recovery 與正式儲存後清除草稿；68 項測試與 build 通過。真實瀏覽器已驗證自動保存、重新載入保留、1440×900／390×844 選單與 console 0 error／0 warning。
- 2026-08-15：DEV-019 將目前文件升為 V3，GET 僅在 V3 不存在時 fallback V2，PUT 只寫 V3 並保留 V2；同內容的跨視窗 revision 不再清空本視窗 Undo history。

## DEV-017：正式組織圖：職位樹與部門分組整合

狀態：完成（RD 實作；待正式 QA/QC）  
文件成熟度：`RD Implementation Ready`  
節點類型：交付點  
父交付點：DEV-001、DEV-008、DEV-009、DEV-012  
是否計入產品交付完成：是  
原始需求邊界：截至 2026-08-12 的產品討論，V1 先把正式組織圖畫清楚；不在本階段建立完整組織治理、跨部門匯報或矩陣關係。

## 權威文件

- RD Contract：`ai-doc/specs/DEV-017-position-tree-department-groups.md`
- Architecture Decision：`ai-doc/adr/ADR-001-position-hierarchy-authority.md`

## 契約摘要

- 組織圖以 `Position.parentPositionId` 的職位樹為主；V2 `OrgMember` 只保存 order、children axis 與 collapsed 等排版狀態，不再保存第二份 parent。
- `Position.departmentId` 與 `Position.parentPositionId` 分別是部門歸屬與主要上下級的權威欄位；修改其中之一不得靜默改寫另一個。
- 每個非空實體部門必須形成單一 connected position region；`departmentId = null` 為未設定狀態，不產生跨圖部門框。
- 所有 add、move、edit、duplicate、delete、promote 與 department replacement 先建立 proposed snapshot，通過 hierarchy／department validator 後才單次 commit；失敗不寫入、不增加 Undo history。
- `Department.parentId` 保持部門主檔階層，不由職位樹推算或同步；畫布部門框只表示 membership。
- 合法本機 V1 文件可遷移至 V2；不合法文件 fail closed、保留原始 payload 並提供備份，不做靜默修正。
- Inspector 是職位唯一主要編輯入口；部門清單 depth 只影響名稱內容區，不推移整列與 `⋯`。

## RD implementation handoff

- 狀態：`RD Implementation Complete / QA-QC Handoff`
- 實作範圍：Slice 1–3 已落地，Slice 4 已完成 targeted browser smoke；不含部署／release。
- 實作契約：Spec 已指定 repo/module/file、target types、公開函式、command union、App wiring、V2 migration/recovery、group algorithm、CSS/render boundary與逐項測試矩陣。
- Phase gate：type/adapter/validator/V1→V2 migration、command/UI、單一完整部門 frame layout 與 recovery 已通過本地 build/test；`npm test` 11 files／68 tests passed，`npm run build` 成功。
- Browser evidence：`output/playwright/orgmaster-department-frames-1440.png`、`output/playwright/orgmaster-department-frames-1024.png`、`output/playwright/orgmaster-department-frames-390.png`；三尺寸各 10 個完整 frame、任兩框交集 0、`band` DOM 0、水平 overflow 0、console error 0。既有 migration/recovery 與 Inspector 證據仍有效。
- Blocker：無。
- Release：未授權。

## Spec governance

- Preflight：`Intentional replacement`。DEV-017 完成後，由 ADR-001 取代 DEV-008 對 `OrgMember.parentId` 的暫時畫布語意。
- Cross-spec consistency：`No unresolved conflict`。
- ADR：已建立，原因為此決策跨資料模型、畫布、drag/layout、文件 migration 與長期擴充邊界。
- Deferred scope：複雜匯報保留於 RD Contract 的 Future Phase Capsule，不阻擋 V1。

## 變更紀錄

- 2026-08-12：彙整部門清單對齊、部門／職位／階層關係、共用編輯器、部門分組框與 V1 簡化邊界，建立 `Brief Ready` 開發文件。
- 2026-08-12：Human Confirmed：V1 採單一部門單一連續職位子樹；`departmentId` 與 `parentPositionId` 保持獨立，非法分裂操作以驗證阻擋，不做隱性連動。
- 2026-08-12：升級為 `RD Contract Ready`；建立 authoritative spec 與 ADR-001，收斂 parent authority、V2 migration、原子 command、UI/UX、QA/QC evidence 與 stop conditions。
- 2026-08-12：通過 RD Readiness Review，升級為 `RD Implementation Ready`；補齊實際檔案、型別／函式簽章、command defaults、App wiring、group/render、migration recovery、unit/browser test matrix 與 slice gates。
- 2026-08-12：RD 完成 DEV-017 Slice 1–3 實作；`Position.parentPositionId` 成為唯一主要階層來源，V2 migration、原子 command、Inspector 上級欄位、部門 group layer 與 recovery gate 已接入。
- 2026-08-12：完成 recovery keyboard gate、legacy position write bypass 移除、MOVE order normalization、department replacement invariant 與 validator/command/storage/group 回歸案例；本地驗證通過 `npm test`（10 files／60 tests）與 `npm run build`。Playwright smoke 覆蓋三尺寸、Inspector 上級編輯、部門清單對齊、非法部門切換就地錯誤與無效文件 recovery gate；三尺寸均無水平溢出，console error 0。狀態維持 `RD Implementation Complete / QA-QC Handoff`。
- 2026-08-13：Human Confirmed：所有非空部門只使用完整 frame，不採 band/badge fallback；frame 鬆散不能直接判定資料錯誤，資料合法性仍由 connected-subtree invariant 判斷。Spec Impact Preflight：`Intentional replacement`。
- 2026-08-13：layout 加入跨部門 spacing 與 branch collision resolution，移除 `rendering` variant／band CSS；11 files／68 tests 與 build 通過，三 viewport 實測 frame overlap 0、水平 overflow 0、console error 0。Spec Drift / Convergence Check：`In sync`。

## DEV-018：部門轉移刪除按鈕可執行與錯誤回饋

狀態：完成  
節點類型：交付點  
父交付點：DEV-016、DEV-017  
是否計入產品交付完成：是  
原始需求邊界：部門刪除對話框中的紅色「轉移並刪除」按鈕按下後沒有可見結果；明確選擇替代部門時應完成轉移與刪除，不因部門分組區塊分裂而靜默阻擋。

## 任務目標

讓部門刪除的轉移 CTA 具備可完成的結果；轉移只更新員工／職位的部門歸屬，不改動職位上下級。其他仍不合法的命令要在原對話框顯示原因，不能讓使用者面對無反應畫面。

## Current phase implementation contract

- `DELETE_DEPARTMENT` 搭配明確 `replacementDepartmentId` 時，允許目標部門在職位樹上形成多個區塊；仍驗證 ID、階層循環、缺少父節點與 layout 完整性。
- 部門刪除不改寫 `Position.parentPositionId`，員工與職位只改為替代部門或 `null` 未設定部門。
- `DeleteDepartmentDialog` 接收 command rejection 並以 alert 文字顯示，不再靜默保留原畫面。
- 本機文件儲存與載入接受此明確轉移產生的部門分區狀態；職位拖曳、換上級與一般職位部門變更仍維持 `DEPARTMENT_DISCONNECTED` 阻擋。

## 驗收標準

- [x] 選擇替代部門後按「轉移並刪除」，對話框關閉、部門被刪除、員工／職位完成轉移。
- [x] 職位 `parentPositionId` 與既有 assignment 不被改寫。
- [x] 明確轉移產生的部門多區塊狀態可以儲存與重新載入。
- [x] 其他 command rejection 會在部門刪除對話框顯示可理解原因。
- [x] `npm test`（64 項）與 `npm run build` 通過。

## 變更紀錄

- 2026-08-12：定位根因為 `DEPARTMENT_DISCONNECTED` 驗證拒絕未被部門刪除對話框呈現；明確轉移改為可套用，並補上錯誤回饋與文件 round-trip 測試。

## DEV-019：職務兼任風險視覺監控

狀態：完成  
文件成熟度：`RD Implementation Complete / QA-QC Passed`  
節點類型：交付點  
父交付點：DEV-002、DEV-008、DEV-011、DEV-017  
是否計入產品交付完成：是  
原始需求邊界：建立職務兼任風險設定平台；當系統偵測同一員工兼任具有風險的職務組合時，只在組織架構圖渲染 UI 視覺效果，不顯示風險文字，也不阻擋組織或任職設定。

## 權威文件

- RD Implementation Contract：`ai-doc/specs/DEV-019-dual-role-risk-visual-monitoring.md`

## 契約摘要

- 規則採無方向 `Role` pair；同一 pair 只有一條規則，風險分為低／中／高三級。
- 系統以同一員工目前有效的 Assignment 比對 active Position.roleId；所有 assignmentType 均參與。
- 比對結果只形成 derived visual state，不持久化，也不參與 assignment、hierarchy、department 或 save validity。
- 組織圖常態只顯示不影響幾何的虛線／雙層外框；互動聚焦時才顯示可見 counterpart 關係，不顯示風險文字。
- 設定平台包含 Role A、Role B、等級、選填原因與啟用；沒有負責人、期限、狀態、歷程、核准或通知。
- 鉦富機械現階段基準保留 10 組重大職務不相容（高 8／中 2）；不把一般主管跨職能、跨部門協調或沒有最終核准／放行權的自檢列入監控。
- 文件升至 V3；V1／V2 migration 加入空規則集合，既有 `data/orgmaster-document.v2.json` 必須保留。

## Current Phase Completion Handoff

- Completion：原二級模型已完成三級模型、規則選填原因欄位與載入保存競態修正；鉦富機械現行版採使用者確認的 10 組可執行規則。
- 實作邊界：新增 pure domain、設定面板、暫時關係層、server tests 與 runtime-generated V3；修改 state、App、Toolbar、OrgNode、CSS、V3 storage／API、fixtures 與 README。既有 V2 data file 保留。
- QA／QC：原版 targeted 3 files／41 tests；本輪完整 14 files／105 tests、正式 build、三級規則與選填原因欄位三 viewport QC 及 console error sweep 均通過。
- UI 證據：`output/playwright/dev-019/dev019-settings-rules-1440x900.png`、`dev019-risks-1440x900.png`、`dev019-risk-relation-1440x900.png`、`dev019-settings-1024x768.png`、`dev019-settings-390x844.png`。
- Runtime：本輪 5000 用於三級模型瀏覽器 QC；完成後依 runtime boundary 清理，並確認 protected 4173 仍 listening。
- 風險等級：Medium；duplicate／orphan、V3 fail-closed、文件保護、React Flow layer、幾何、Undo sync 與鍵盤焦點均已有 FMEA 控制及通過證據。
- Blocker：無；未授權 deploy／release。
- Spec Impact Preflight：`Intentional replacement`；依使用者本輪指示將二級風險改為低／中／高三級；不改 DEV-002／008／011 assignment 契約，也不改 DEV-017／ADR-001 hierarchy authority。
- Spec Drift／Convergence Check：`In sync`；無高影響 deferred scope。
- 2026-08-18 基準更新：`Intentional replacement`；使用者明確核准現行版改為 10 組（高 8／中 2），資料／API／偵測／UI 契約不變。QC 證實規則完整、現況命中 0、草稿隔離、API 200、22 files／158 tests、build 與三 viewport 均通過。

## 變更紀錄

- 2026-08-15：依使用者確認建立 `Brief Ready`；移除責任、期限、例外、狀態與歷程等管理機制，將產品收斂為規則設定、即時偵測與純視覺渲染。與 DEV-002、DEV-008、DEV-011、DEV-017 判定為相容擴充，未修改產品程式。
- 2026-08-15：完成現況程式與文件契約檢查，建立 authoritative RD Contract；選定 Role pair、純衍生偵測、固定視覺語法與 V3 fail-closed migration，升級為 `RD Contract Ready`。
- 2026-08-15：完成 implementation readiness review；補齊 repo／file boundary、domain API、App／UI wiring、V3 檔案演算法、S1–S4 gate、RISK-D／S／U executable test matrix 與 QA/QC runtime cleanup，升級為 `RD Implementation Ready`。未修改產品程式。
- 2026-08-15：使用者要求完成 DEV-019，Spec Impact Preflight 判定 `No conflict`；進入 S1→S4 的 RD／QA／QC 本機開發，未授權 deploy／release。
- 2026-08-15：完成 Role pair domain、V3 fail-closed migration／V2 preservation、規則設定 overlay、非文字二級外框與互動關係層；加入初始啟用規則作為實際 V3 資料。
- 2026-08-15：QC 發現並修正「相同內容的多視窗 revision 清空 Undo history」與「取消內嵌表單後 Escape 焦點遺失」；重驗停用、編輯、刪除、拖入、解除、Undo、collapsed counterpart 與三 viewport。
- 2026-08-15：原版 `npm test` 13 files／98 tests、`npm run build`、console Errors 0／Warnings 0、in-scope HTTP 全 200；5000 runtime 清理完成，protected 4173 HTTP 200。
- 2026-08-16：依使用者指示將一般／高二級規則改為低／中／高三級；新增低、中、高視覺語法、舊 `warning` → `medium` 載入相容、初次載入自動保存競態修正，現有 16 組規則分類為高 7／中 8／低 1；本輪自動測試、建置與三 viewport QC 通過，DEV-019 恢復完成狀態。
- 2026-08-16：依使用者要求為每組規則加入選填風險原因；設定介面允許留白，V3 保留既有原因，舊 V3 缺少原因時正規化為空字串；未改變組織圖純 UI 提示、不阻擋設定的邊界。
- 2026-08-16：依鉦富機械 14 人規模與實際分工重新制定基準；刪除會把必要跨職能誤判為異常的 11 組規則，保留／新增 6 組涉及資金、薪資、採購入帳與最終品質放行的不相容職務（高 4／中 2／低 0）。
- 2026-08-18：依使用者確認的兼任風險計畫，將現行版基準由 6 組調整為 10 組（高 8／中 2／低 0），新增採購與倉儲、財務覆核、存貨帳實及業務收款等重大不相容組合；未修改草稿、任職、階層或產品程式。

## DEV-020：組織架構多草稿與版本比較

狀態：已完成（RD Implementation Complete / QA-QC Passed）  
文件成熟度：`RD Implementation Complete / QA-QC Passed`  
節點類型：交付點  
父交付點：DEV-015、DEV-017、DEV-019  
執行前置：DEV-021 已完成 RD／QA／QC，V4 canonical document 與 V1–V3 migration 已成為 repo 基準  
權威規格：`ai-doc/specs/DEV-020-organization-version-workspace.md`  
權威 ADR：`ai-doc/adr/ADR-002-version-workspace-storage-boundary.md`  
是否計入產品交付完成：是  
原始需求邊界：總經理需要從現行組織圖發展多個規劃草稿，反覆切換並與現行版比較；Current phase 已實作多草稿、獨立自動儲存、版本切換、現行版保護、多方案摘要與兩版本視覺差異，未授權 deploy／release。

## 問題與使用者價值

- 交付前以單一 V3 組織文件為主要儲存來源；DEV-021 已升為 V4 canonical，但系統仍需要可命名、可切換、可集中比較的方案工作區。
- 總經理的真正任務不是保存更多檔案，而是在不破壞現行資料的前提下探索多個組織方案，快速判斷結構與人員影響。
- 完成後，現行版作為共同基準；每個方案草稿獨立自動儲存，使用者可先做多方案摘要比較，再選兩版查看詳細差異。

風險等級：Medium（改變本機文件生命週期、主要 UI 流程與多視窗同步邊界；比較錯誤或草稿隔離失效可能造成錯誤決策或資料覆蓋）

## UX Intent

- 使用者與情境：總經理、管理幕僚或人資在規劃組織調整時，需要同時保留數個候選方案並以現行版為基準比較。
- 主要任務與成功結果：建立具名草稿、在草稿間切換編輯、確認每份草稿已獨立保存，並辨識多方案摘要與兩版本的結構差異。
- 主要工作物件：一份現行版、數份具名草稿、比較選取集合與兩版差異結果。
- 共用資訊：目前工作版本、版本類型與保存狀態在工作區層顯示一次；各草稿只呈現名稱、更新時間與必要例外。
- 操作方向：先從版本工作區選擇或建立草稿；多方案比較用清單／表格掃描，詳細比較固定選兩版，避免多張組織圖並排失去可讀性。
- 最可能誤解點：`OrgDocumentFile.version` 資料格式不等於使用者看到的組織版本；自動儲存不是新版本；目前選到現行版或草稿必須在五秒內可辨識。
- 安全預設：規劃草稿的任何編輯與自動儲存不得寫入現行版或其他草稿；現行版在規劃情境預設唯讀。
- 阻擋或失敗時的恢復：保存失敗要標示受影響草稿並保留目前畫面；單一草稿損壞時不得連帶覆蓋或阻擋現行版與其他合法草稿。
- 不可發生：切換版本造成未保存資料遺失、在草稿中編輯卻改到現行版、以顏色作為唯一差異訊號，或把每次自動儲存顯示為一個新版本。

## 主要流程

1. 使用者進入版本工作區，先看見現行版與既有草稿清單。
2. 從現行版或指定草稿建立新草稿並命名；新草稿保留來源版本關係。
3. 使用者切換到草稿編輯，變更只寫入該草稿並獨立自動儲存。
4. 使用者在多方案摘要中選擇現行版與數個草稿，比較核心結構指標。
5. 使用者從摘要結果選定兩個版本，查看組織圖視覺差異與可篩選的變更清單。
6. 使用者返回任一草稿繼續調整；本交付不提供採用、發布或升為現行版。

## 初步開發範圍

### A. 多草稿與版本工作區

- 建立一份明確的現行版識別，並支援三份以上具名草稿共存。
- 支援從現行版或既有草稿建立新草稿、重新命名、切換與查看更新時間。
- 每份草稿具有獨立自動儲存與恢復邊界；自動儲存歷程屬內部恢復資料，不進入使用者可見版本清單。
- 重新載入後回到最後使用的合法版本；若該版本無法載入，必須清楚指出影響並提供返回現行版或其他草稿的恢復路徑。
- 保留既有副本下載、備份下載與 fail-closed 文件復原能力；具體相容契約由 DEV-020 spec 第 10、14、18 節約束。

### B. 現行版保護

- 規劃工作區中的現行版預設為唯讀基準，草稿的編輯、Undo／redo、自動保存與跨視窗同步不得改變現行版。
- 版本類型與目前選取狀態必須由位置、標籤與控制項狀態共同呈現，不只依賴顏色。
- 現行版日常維護採獨立 `current-maintenance` 模式；一般選取仍為唯讀，必須先確認才可直接維護現行版。

### C. 多方案摘要比較

- 同一比較集合可包含現行版與多份草稿；預設先比較部門數、職位數、員工數、管理層級、空缺職位與啟用兼任風險命中數。
- 摘要介面優先支援掃描、排序與選取，不用大型 KPI 卡重述同一資訊。
- 桌面與筆電可使用比較表；窄 viewport 可改為逐方案選取或堆疊摘要，但不得造成文件層水平溢出。

### D. 兩版本詳細差異

- 詳細比較一次固定兩版，支援現行版對草稿或草稿對草稿。
- 差異以穩定資料 ID 計算，不以畫面座標或像素作為版本差異來源。
- 初步差異分類包含新增、移除、改名、部門移動、上下級移動、任職變更與風險命中變化。
- 組織圖使用圖示、線型、位置、短標籤與適度色彩共同表達差異；同步提供可篩選的變更清單，讓使用者定位受影響部門、職位或員工。
- 比較結果只讀，不提供發布、合併或直接覆寫任一來源版本的操作。

## Out of Scope

- 候選草稿發布為新現行版、舊現行版封存、回復／rollback 與版本合併。
- 決策理由、評論、核准、簽核、通知、責任人與完整稽核歷程。
- 多人即時協作、帳號、角色權限、雲端同步、外部資料庫或第三方服務。
- AI 差異摘要、方案推薦、成本模擬與自動組織設計。
- 備份檔匯入／還原 UI、production deploy、release 或正式環境遷移。

## 驗收方向

- [x] 使用者可從同一現行版建立至少三份具名草稿，重新載入後草稿內容、名稱與最後使用版本仍正確。
- [x] 編輯草稿 A 並觸發自動儲存，不會改變現行版或草稿 B；切換版本不遺失任一草稿內容。
- [x] 在規劃工作區選取現行版時，使用者可在五秒內辨識其為現行基準，且一般草稿編輯控制項不可誤寫現行版。
- [x] 多方案摘要可同時比較現行版與多份草稿的核心指標，並可選定兩版進入詳細比較。
- [x] 兩版本詳細比較正確顯示新增、移除、改名、移動、任職與風險變化，且可依差異類型及主要物件篩選。
- [x] 差異呈現不只依賴顏色；鍵盤與輔助科技可辨識目前版本、比較來源與差異類型。
- [x] 單一草稿保存或載入失敗時，畫面說明受影響範圍與恢復方式，現行版及其他合法草稿不被覆蓋。
- [x] DEV-021 完成後的 V4 canonical 文件可無資料損失地成為現行版來源，V3／V2 migration source bytes 保留；既有備份／副本下載、Undo／redo、部門分組、主／兼／代、行政核准責任與兼任風險能力不回歸。
- [x] 1440×900、1024×768、390×844 的主要流程可操作，無重疊、裁切、文件層水平溢出、可見 runtime error 或 console error。

## 限制、假設與已確認決策

- AI assumption：第一版維持本機單使用者／同電腦多視窗，優先沿用現有本機 API 與檔案式保存，不引入特定資料庫或雲端 provider。
- AI assumption：使用者可見版本只包含現行版與具名草稿；高頻自動保存快照只服務失敗恢復，不出現在版本清單。
- AI assumption：多方案摘要的初始六項指標可由既有組織狀態衍生，不建立新的管理評分或推薦演算法。
- 已確認：現行版日常維護採明確且隔離的 `current-maintenance` 模式；草稿移除只提供可恢復封存／還原，Current phase 不提供永久刪除。
- 執行 gate：DEV-021 V4 canonical baseline 已完成 drift check；S1–S4 已在本機完成。後續若 V4 接點與 DEV-021 spec 漂移，仍須先回 PM 做 drift check，不得改回 V3 shape。

## Architecture Memory Capsule

- 使用者業務版本（現行版／草稿）與 `OrgDocumentFile.version` 的資料格式版本是兩個不同概念；契約使用不同識別、檔名與升版規則，DEV-020 包覆前置交付的 current schema，預期為 V4。
- 版本工作區應包覆既有完整 `OrgDirectoryState`，不要把草稿狀態散入 Employee、Department、Position、Assignment 或風險規則的領域欄位。
- 後續發布與回復會依賴穩定版本 ID、來源版本關係與不可誤寫的現行版識別；本交付雖不實作發布，資料邊界不得封死該擴充方向。

## Future Phase Capsule：發布與回復

狀態：`Future Phase Captured / Not Requested`

- 目的：讓選定草稿經影響預覽後成為新現行版，舊現行版可封存並安全回復。
- 邊界：DEV-020 不提供發布、升版、舊版封存或 rollback UI，也不建立核准流程。
- 依賴：DEV-020 必須先建立穩定版本識別、來源關係與現行版保護，且兩版本比較可作為後續發布前的影響預覽基礎。
- 驗收方向：發布不覆寫唯一可恢復來源；新舊現行版關係可追溯，回復不破壞既有草稿。
- Re-entry trigger：使用者要求把候選草稿採用為現行版、需要復原舊現行版，或要求決策／核准流程時另行升級規劃。

## 文件與驗證邊界

- 本輪已完成 `RD Implementation Complete / QA-QC Passed`；產品程式、測試與工作區 API 已實作，未執行 deploy／release。
- RD 執行順序已完成：S1 domain／store／migration／API／CAS → S2 hydration／版本切換／獨立 autosave／現行保護 → S3 摘要／差異引擎／比較 UI → S4 QA／QC。
- 證據：`npm test -- --run`（19 files／126 tests）、`npm run build`、workspace API round-trip、草稿建立／切換／現行維護／2 版比較 browser flow，以及 `output/playwright/dev020-compare.png`；完整 matrix 與 stop conditions 以權威 spec 第 17–19 節為準。

## 變更紀錄

- 2026-08-16：依使用者指定範圍建立 `Brief Ready`；交付止於多草稿、獨立自動儲存、版本切換、現行版保護、多方案摘要、兩版本視覺差異與差異篩選，未修改產品程式。
- 2026-08-16：Spec Governance 判定為對 DEV-015 的 `Compatible exception`，不改寫 DEV-017 的正式職位樹或 DEV-019 的風險規則契約；Brief 階段不建立額外 spec 或 ADR，發布／回復以 future capsule 保留擴充邊界。
- 2026-08-16：依使用者要求補上 RD 可實作內容，建立 DEV-020 RD Implementation Contract 與 ADR-002，收斂 current-maintenance、封存／還原、manifest＋每版本獨立文件、CAS、migration、UI mutation gate、比較領域、S1–S4、QA／QC 與 stop conditions；成熟度升為 `RD Implementation Ready`。DEV-021 為 required predecessor，未修改產品程式。
- 2026-08-16：DEV-021 V4 baseline 完成後執行 DEV-020 S1–S4；完成 workspace manifest／per-version files／CAS、V4 migration、版本 API、獨立 autosave 與跨視窗同步、現行版唯讀／維護 gate、封存／還原、2–5 版摘要與兩版差異 UI；19 files／126 tests、build、API 與 browser flow 通過，DEV-020 升為 `RD Implementation Complete / QA-QC Passed`。

## DEV-021：主職、兼任與直屬主管路徑（行政核准暫緩）

狀態：已調整完成（直屬主管路徑；行政核准功能暫緩）  
文件成熟度：`RD Implementation Complete / QA-QC Passed`  
節點類型：交付點  
父交付點：DEV-002、DEV-008、DEV-011、DEV-017、DEV-019  
是否計入產品交付完成：是  
原始需求邊界：整合主職與兼任功能，在不增加員工操作複雜度的前提下，讓系統顯示唯一主職與唯讀直屬主管路徑；本期不建立行政核准、請假或完整簽核交易。

## 任務目標

讓管理者可在員工細節指定最多一個主職，其他目前任職自動呈現為兼任或代理；系統依主職的直接上級職位顯示唯讀直屬主管路徑。行政核准人、例外核准人與完整簽核鏈暫不開發。

風險等級：Medium（任職語意分離、V4 文件 migration、assignment／employee reference 原子性、主要員工細節 UI 與既有兼任風險回歸）

## Human Confirmed decisions

- Current phase：主職／兼任與唯讀直屬主管路徑；不建立請假申請、行政核准、通知或簽核歷程。
- Direct supervisor：由主職 `Position.parentPositionId` 的目前任職者推導；無法唯一推導時只顯示未設定原因，不提供例外核准人欄位。
- Legacy ambiguity：V3 若同一員工有多個 open legacy primary assignments，V4 `primaryAssignmentId = null`，由管理者選定，不自動猜測。

## Current phase execution boundary

- 新增 Employee 主職 reference 與例外核准人 reference，將 AssignmentType 收斂為一般／代理，主職與任職性質分開保存。
- 新增責任 validator、原子 mutation 與直屬主管 pure resolver；行政核准 resolver 僅保留既有 V4 相容程式，不由 UI 使用。
- 本機文件與 server canonical document 升為 V4，保留 V1–V3 source 並 fail closed migration。
- 員工細節只提供主職寫入；OrgNode／Inspector 與員工細節顯示衍生的主／兼／代標籤及直屬主管路徑。
- 不新增 Auth、ReportingLine、工作流、申請紀錄、通知、外部 provider、deployment 或 release 行為。

## 驗收摘要

- [x] 每位員工最多一個主職；有任職但無主職時可載入、可保存並顯示「主職待設定」。
- [x] 唯一上級任職者可被穩定顯示為直屬主管；空缺、多人、根職位與 self-only 不猜測或跳級。
- [x] 直屬主管路徑為唯讀衍生資訊；主職變更後依新主職重新判定。
- [x] assignment move／replace／unassign／delete 不留下 primary dangling reference。
- [x] V3 恰一筆 open primary 才自動指定；多筆或零筆保持 null，原始文件與完整組織／風險資料保留。
- [x] 員工細節五秒內可辨識主職、其他任職與直屬主管；正常狀態無多重 CTA 或重複主管資訊。
- [x] `npm test -- --run`（20 files／129 tests）、`npm run build`、V4 round-trip、browser QC、visible error／console sweep 與既有一人多職／多人任職／兼任風險回歸通過。

## RD handoff

- 權威規格：`ai-doc/specs/DEV-021-primary-role-administrative-approval-route.md`。
- 實作順序：Slice 1 V4／validator／resolver／migration → Slice 2 原子任職 mutation → Slice 3 員工細節與衍生標籤 → Slice 4 round-trip／QC／drift check。
- Stop conditions：任何主職雙來源、legacy migration 猜測、直屬主管自動跳祖先、assignment bypass、V3 source 覆寫、scope 擴張到行政核准／workflow／Auth／ReportingLine，或必要 gate 失敗即停止回 PM。
- Evidence required：spec 第 14 節 unit/browser matrix、實際 test count、build、三 viewport、V3 preservation、V4 canonical round-trip 與 console 0 error。

## Future phase capsule

實際請假／加班／出差申請、核准狀態、會簽／知會、代理、SLA、通知與稽核屬 `Future Phase Captured / Not Requested`；使用者要求交易功能時另建 DEV，先確認 Auth、資料所有權、法規規則與流程狀態機，不得直接擴張 DEV-021。

## 變更紀錄

- 2026-08-16：使用者以 `1B 2A 3A` 確認 current phase、主管推導與 legacy ambiguity 原則；完成 `RD Implementation Ready` spec。
- 2026-08-16：完成 DEV-021 Slice 1–4 實作與驗證：V4 canonical model／migration、責任 validator、原子 mutation、行政核准 resolver、員工細節唯一維護入口與衍生標籤；19 個測試檔／126 項通過，build 成功，1440×900／1024×768／390×844 browser QC 通過，未授權 deploy／release。
- 2026-08-17：依使用者要求暫緩行政核准功能，撤下行政流程路徑與例外核准人 UI／互動，改為唯讀「直屬主管路徑」；新增 direct supervisor resolver／測試，20 個測試檔／129 項通過，1440×900／390×844 browser QC 通過，未授權 deploy／release。

## DEV-022：左右側欄關閉與快捷鍵一致性

狀態：執行中（RD Implementation Ready／Intentional replacement）  
節點類型：交付點  
父交付點：DEV-001、DEV-004、DEV-009、DEV-010、DEV-019  
是否計入產品交付完成：是  
原始需求邊界：統一左右欄關閉按鈕與快捷鍵邏輯及 UI；本輪完成 RD 實作、targeted QA 與三 viewport UI QC，不含 deploy／release。

## 任務目標

讓使用者以同一視覺語法與 `Escape` 心智模型關閉左側主資料欄、右側屬性／細節欄及兼任風險欄；每次只解除一層，編輯中先取消／退出控制項，關閉後焦點回到可見入口。

風險等級：Medium（跨 `App`、DirectoryDock、Inspector、Detail、Role-risk、Toolbar 與 CSS 的主要 UI flow，需 pure resolver、targeted regression 與三 viewport 真實 UI QC）

## Current phase execution boundary

- 新增共用 `PanelDismissButton`，統一左右方向 icon、32px desktop／44px mobile target、hover、focus-visible、tooltip 與 ARIA。
- 將 `activeDirectory` 提升為 App controlled UI state，新增 pure `resolveEscapeDismissAction` 與 last-interacted panel boundary。
- `Escape` 採 recovery／dialog／menu／editor／role-risk／focused panel／last panel 的逐層優先序，一次最多執行一個 action。
- 編輯或草稿中第一次 `Escape` 只還原／取消／blur，第二次才關 panel；mouse 與 keyboard 使用相同 close action。
- 左欄關閉回對應 rail；右欄回資料列／畫布節點；risk／shortcut 回 Toolbar 入口；不得落到 `body`。
- `<=1100px` primary 左欄與 inspector/detail 一次只顯示一個；role-risk 保留 higher-order overlay 與既有草稿保護。
- 不改 domain state、Undo／redo、V3/V4 文件、API、migration、權限、儲存或 release 行為。

## 驗收摘要

- [x] 四類 side panel header 使用同一共用 dismiss component，沒有文字 `×` 或重複 close CSS。
- [x] 一次 `Escape` 只取消／關閉一個最上層 surface；左右同開時依 focus 或 last-interacted 關閉。
- [x] search、title、native select 與 role-risk draft 都通過 editor-first、panel-second 的連續 Escape。
- [x] 所有 mouse／keyboard 關閉路徑回到指定可見入口，`document.activeElement` 不為 `body`。
- [x] 快捷鍵 dialog 與 README 顯示 `Escape` 規則，既有畫布、清單、文件與 Undo／redo 快捷鍵不回歸。
- [x] `npm test`、`npm run build`、1440×900／1024×768／390×844、visible error／console／overflow／scroll owner 掃描通過。

## RD handoff

- 權威規格：`ai-doc/specs/DEV-022-panel-dismissal-shortcut-consistency.md`。
- 實作順序：S1 state／resolver → S2 shared UI／focus → S3 responsive／communication → S4 regression／QC（已完成）。
- Stop conditions：一次關閉多層、草稿丟失、焦點落 `body`、panel state 進入資料／Undo、既有快捷鍵回歸、三 viewport 缺陷、visible error 或誤動 protected 4173 runtime時停止回 PM。
- Evidence required：spec 第 13 節 resolver unit matrix、完整 test/build、三 viewport、active-element、DOM target size、visible-error 與 console evidence。

## Governance

- Spec Impact Preflight：`Compatible exception`；延伸 DEV-001、DEV-004、DEV-009、DEV-010 與 DEV-019 的既有互動，不改資料或主要產品語意。
- ADR：不需要；本變更為可逆前端 UI 契約，無 schema、API、權限或外部契約。
- Deferred Scope Audit：直接左右欄 toggle shortcut、持久化 panel layout 與全產品 overlay manager 均不在本期，且不阻塞目前實作。
- 執行邊界：本輪已完成本機 RD／QA／QC；未授權 deploy／release。

## 變更紀錄

- 2026-08-16：完成 `RD Implementation Ready` spec、DEV 索引、文件地圖與 QA/QC handoff；因既有 DEV-021 同步建立，依連續 ID 規則改編為 DEV-022，未覆蓋其他任務。
- 2026-08-16：完成 DEV-022 S1→S4 實作與驗證；19 files／126 tests、resolver targeted 7／7、build 與 1440×900／1024×768／390×844 browser QC 通過。證據包含三尺寸 screenshot、active-element／DOM target size／overflow／fresh console 0 error／0 warning；temporary 5010 已清理，protected 4173 保持可用。

## DEV-023：取消組織圖職位 Delete 快捷鍵

狀態：完成（RD Implementation Complete / QA-QC Passed；Intentional replacement 已完成）  
節點類型：開發點  
父交付點：DEV-001、DEV-003、DEV-022  
是否計入產品交付完成：否  
原始需求邊界：在架構圖點選職位後按 `Delete` 容易誤觸，取消該直接刪除行為；其他明確刪除入口維持。

## 任務目標

讓畫布選取與刪除操作分離：單純按鍵不再打開刪除流程，使用者必須從右鍵選單或右側職位屬性明確啟動刪除。

風險等級：Low（局部前端鍵盤與 React Flow 設定，可逆，不改資料模型、API 或儲存契約）

## Current phase execution boundary

- 移除 App 全域在選取職位時攔截 `Delete` 並開啟刪除對話框的分支。
- 將 React Flow `deleteKeyCode` 設為 `null`，同步停用其預設 `Backspace` 節點移除行為。
- 保留右鍵選單與右側職位屬性的「刪除職位」入口；移除右鍵選單上已不再有效的 `Del` 鍵提示。
- 更新 README 快捷鍵說明，區分清單資料列的 `Delete` 與組織圖畫布的安全刪除入口。

## 驗收摘要

- [x] 架構圖選取職位後按 `Delete` 不開啟刪除對話框、不刪除節點。
- [x] 架構圖選取職位後按 `Backspace` 不觸發 React Flow 預設刪除、不刪除節點。
- [x] 右鍵選單仍可開啟並保留「刪除職位」項目。
- [x] 右側職位屬性仍保留「刪除此職位」按鈕。
- [x] `npm test -- --run`（19 files／126 tests）、`npm run build` 通過；localhost:5000 真實畫布操作驗證 22 個節點數未變且無可見刪除對話框。

## RD handoff

- 受影響檔案：`src/App.tsx`、`src/components/PositionContextMenu.tsx`、`README.md`。
- Stop conditions：畫布 Delete／Backspace 仍可移除節點、右鍵／Inspector 刪除入口消失、清單 Delete 回歸失效、build/test 失敗或出現可見錯誤時停止回 PM。
- 證據：Playwright localhost:5000；22 個 `.react-flow__node` 在按 Backspace 前後維持不變；選取職位後按 Delete 未出現刪除對話框；context menu 的「刪除職位」仍可見。

## Governance

- Spec Impact Preflight：`Compatible exception`；延伸既有畫布快捷鍵契約，明確收窄高風險刪除入口，不改資料、API、權限或版本工作區。
- ADR：不需要；局部可逆 UI 防誤觸修正。
- 執行邊界：本輪完成本機 RD／QA／QC；未授權 deploy／release。

## 變更紀錄

- 2026-08-16：依使用者要求取消組織圖選取職位後的 `Delete`／`Backspace` 直接刪除行為；保留右鍵與 Inspector 明確刪除入口，19 files／126 tests、build 與 localhost:5000 畫布操作驗證通過。

## DEV-024：右上角版本模式狀態顯示

狀態：完成（RD Implementation Complete / QA-QC Passed）  
節點類型：開發點  
父交付點：DEV-020、DEV-022、DEV-023  
是否計入產品交付完成：否  
原始需求邊界：使用者不易知道目前是唯讀或編輯模式，需在右上角提供明確狀態顯示。

## 任務目標

讓使用者在版本切換器旁立即辨識目前工作模式及其寫入語意，降低誤以為可編輯或誤以為變更已寫入現行版的風險。

風險等級：Low（局部前端狀態溝通與 responsive CSS，不改資料、API、權限或儲存契約）

## Current phase execution boundary

- 在右上角版本切換器旁新增模式狀態 pill，依 `WorkspaceMode` 顯示 `唯讀`、`可編輯`、`維護中` 或 `比較唯讀`。
- 以文字搭配色點傳達狀態，不依賴顏色單獨辨識；不同模式同步提供寫入語意的 `title` 與 `aria-label`。
- 使用 `role="status"` 讓輔助技術可感知模式變更；狀態元件維持非按鈕，避免與版本切換動作混淆。
- 於 `<=760px` 收斂間距與字級，保留右上角版本操作與狀態可讀性，不造成水平溢出。

## 驗收摘要

- [x] 現行版瀏覽模式顯示 `唯讀`，並說明目前只能查看。
- [x] 草稿編輯模式顯示 `可編輯`，並說明變更會自動儲存至草稿。
- [x] 現行版維護模式顯示 `維護中`，並說明變更會直接寫入現行版。
- [x] 版本比較畫面顯示 `比較唯讀`，並說明不會寫入任何版本。
- [x] 1440×900、1024×768、390×844 真實瀏覽器畫面均可見狀態，無重疊、水平溢出或可見錯誤。
- [x] `npm test -- --run`（19 files／126 tests）與 `npm run build` 通過。

## RD handoff

- 受影響檔案：`src/components/VersionSwitcher.tsx`、`src/index.css`。
- Stop conditions：模式文字與實際 `WorkspaceMode` 不一致、狀態與版本切換器重疊、手機寬度造成水平溢出、ARIA／可見說明缺失、測試或 build 失敗時停止回 PM。
- 證據：localhost:5000 真實瀏覽器三尺寸 screenshot（`output/playwright/orgmaster-mode-status-1440x900.png`、`output/playwright/orgmaster-mode-status-1024x768.png`、`output/playwright/orgmaster-mode-status-390x844.png`）、DOM snapshot、可見錯誤／console sweep，以及 19 files／126 tests 與 build 結果。

## Governance

- Spec Impact Preflight：`Compatible exception`；只補強 DEV-020 版本工作區的模式溝通，不改 domain、API、儲存或權限契約。
- ADR：不需要；局部可逆 UI 狀態呈現。
- Deferred Scope Audit：未新增模式權限、流程鎖定、操作導覽或跨頁持久化偏好，均不在本期且不阻塞目前實作。
- 執行邊界：本輪完成本機 RD／QA／QC；未授權 deploy／release。

## 變更紀錄

- 2026-08-16：完成右上角版本模式狀態 pill、響應式樣式與三尺寸瀏覽器 QC；19 files／126 tests、build 通過，未授權 deploy／release。

## DEV-025：組織層級與垂直層帶排版

狀態：完成（RD Implementation Complete / QA-QC Passed）  
節點類型：交付點  
父交付點：DEV-004、DEV-008、DEV-017、DEV-020、DEV-021、DEV-022  
是否計入產品交付完成：是  
來源 ID：`USER-2026-08-17-ORGANIZATION-LEVEL-BANDS`

## 任務目標

在不改變 `Position.parentPositionId` 唯一上下級權威的前提下，建立每版本獨立的組織層級主檔、逐職位指派、V5 migration 與垂直層帶排版，避免小型公司跨層直報使基層職務與主管誤排在同一 Y 軸。

風險等級：High（跨 domain schema、migration、command validation、layout、主資料 UI、版本比較與三尺寸互動；需完整 RD→QA→QC gate）

## Current phase execution boundary

- 完整契約：`ai-doc/specs/DEV-025-organization-level-bands.md`。
- 架構決策：`ai-doc/adr/ADR-003-organization-level-layout-authority.md`。
- 本輪只做本機開發、測試與 QC；不做薪資／職等制度、不做 ReportingLine、不 deploy／release。
- 工作目錄不是 Git repository；以規格列出的檔案邊界、測試與 browser evidence 控制變更。

## 驗收摘要

- [x] 層級主檔可增刪改排，使用中刪除與非法排序 fail closed。
- [x] 職位逐一設定層級，同層／反向父子拒絕；新增子職位預設下一層且最低層阻擋。
- [x] 全部 active position 完成後仍須明確啟用；tree／levels 可逆且資料保留。
- [x] levels mode 的低層完整位於高層下方，guide label／line 可獨立隱藏。
- [x] V1–V4 可升 V5；V4 依報告深度產生正式指派但保持 tree mode。
- [x] 各組織版本隔離保存層級主檔、指派、mode 與 guide preference，版本比較可辨識差異。
- [x] 自動測試、build 與 1440×900／1024×768／390×844 真實 browser QC 通過。

## RD handoff

- Domain／migration：V5 schema、V1–V4 fail-closed migration、預設四層、每版本獨立保存與版本比較已完成。
- Command／UI：層級主檔增刪改排、原子排序預覽、職位逐一指派、同層／反向拒絕、下一層新增規則、tree／levels 與 guide preference 已完成。
- Layout：`parentPositionId` 繼續決定連線；`organizationLevelId` 只控制 Y 軸層帶。跨層直報案例量測為經理 L2、組級主管 L3、直報專員 L4，報告邊仍存在。
- Evidence：`npm test -- --run`（21 files／151 tests）、`npm run build`、`output/playwright/orgmaster-shared-parent-trunk-fit-1440x900.png`、1024×768 與 390×844 viewport DOM 量測、console error sweep 0、三 viewport 無 document overflow；生產部經理的三條直接下屬線（含降至 L5 的倉儲物流作業員）共用 `bendY = 177.4`，卡片無重疊。
- Runtime：重用既有 OrgMaster localhost:5000（非本任務擁有，不停止）；Playwright `dev025` session 已關閉；protected ProJED 4173 未停止或重啟。

## Governance

- Spec Impact Preflight：`Compatible exception / Intentional layout extension`；保留 ADR-001 的上下級權威，新增的 `organizationLevelId` 只控制垂直層帶。
- ADR：需要，已建立 ADR-003，規範 parent relation 與 vertical band authority 的長期邊界。
- Deferred Scope Audit：薪資參考、Job Grade、Pay Grade、ReportingLine、多重匯報、發布與部署均不在本期，且不阻塞目前實作。
- 執行邊界：未授權 deploy／release；protected ProJED 4173 不得停止、重啟或清除。

## 變更紀錄

- 2026-08-17：完成 1B–13B 需求決策、Spec Impact Preflight、ADR-003 與 RD Implementation Ready contract，進入本機實作。
- 2026-08-17：完成 V5 domain／migration、command invariants、層級主檔與職位 UI、垂直層帶 layout、版本比較及 QA/QC；20 files／142 tests、build 與三 viewport 驗證通過。瀏覽器 QC 的測試改動採隔離回應；初次攔截造成的現行版 mode 變更已精確還原並驗證為 `tree`、4 層、26/26 指派，未 deploy／release。
- 2026-08-17：依附圖回饋修正 levels layout：保留分支原始 Y 相對位置、同層加入錯落、重疊卡片採固定 20px 間距；新增同層錯落與全圖不重疊 layout 測試，完整回歸為 21 files／150 tests，browser QC 以新截圖通過。
- 2026-08-17：補上 levels mode 全圖卡片不重疊回歸測試；完整回歸為 21 files／150 tests，build 與既有三 viewport QC 維持通過。
- 2026-08-17：依使用者新定義調整 levels layout：同層卡片以該層 guide line 為共同 Y 軸起始基準，取消原始 tree Y 差異與刻意錯落；只有水平範圍實際重疊時才向下保留固定 20px 間距，並更新 baseline layout 測試與文件契約。
- 2026-08-17：依使用者回饋縮小階層間 Y 軸留白：`ORGANIZATION_LEVEL_BAND_GAP` 由 48px 調整為 20px，新增固定層間距回歸驗證，並完成三 viewport compact layout QC。
- 2026-08-17：依附圖修正橫向 reporting edge 的路徑：分支改在父卡片下緣附近產生，避免跨過同階主管卡片造成「倉儲物流作業員」誤看成連到工務組主管；資料關係仍由 `parentPositionId` 唯一決定，browser DOM 驗證 edge 指向生產部經理。
- 2026-08-18：完成跨層直報線根因修正：不再由每條 edge 的 target Y 各自決定轉折點，改由父職位依最近直接下屬計算一次 shared branch offset；新增「同父職位的近層與降階直接下屬共用 bendY」回歸測試。完整回歸 21 files／151 tests、build 與三 viewport browser QC 通過。
- 2026-08-18：依使用者 UI 回饋，將職位設定進度、tree／levels 排版與層級標籤／引導線控制集中移至頂部「顯示設定」入口；左側「層級」面板保留主檔 CRUD／排序。完成 build 與 1440×900／1024×768／390×844 browser QC，未 deploy／release。
- 2026-08-18：依使用者回饋開放現行版唯讀模式切換顯示設定；唯讀採本次檢視覆寫，不改版本資料、不標記 dirty，編輯／維護模式仍沿用版本保存，完成 21 files／151 tests、build 與三 viewport browser QC。
- 2026-08-18：依使用者 UI 回饋移除「顯示層級標籤與引導線」勾選入口；保留既有 `organizationLayout.showLevelGuides` 資料與渲染相容性，顯示設定改為僅保留排版模式切換。
- 2026-08-18：依使用者 UI 回饋調整 levels mode Y 軸間距：跨層 `ORGANIZATION_LEVEL_BAND_GAP` 由 20px 增至 30px（+50%），同層重疊避讓 `ORGANIZATION_LEVEL_NODE_GAP` 由 20px 降至 10px（-50%），新增精確數值回歸測試。

## DEV-026：職位拖曳命中、磁吸退出與渲染穩定性

狀態：完成（RD Implementation Complete / QA-QC Passed；Intentional replacement 已完成）  
節點類型：開發點  
父交付點：DEV-001、DEV-017、DEV-020、DEV-025  
是否計入產品交付完成：否  
來源 ID：`USER-2026-08-17-POSITION-DRAG-INTERACTION-HEALTH`

## 任務目標

讓使用者以職位卡 pointer gesture 啟動拖曳：按住並移動超過門檻後穩定完成跨部門平行職位排序、合法跨上級移動、候選退出與空白取消；短按仍保留選取語意，同時修正 pointer move 造成非拖曳節點全量更新的 render path。

風險等級：Medium（局部 UI interaction、React Flow drag wiring、candidate state 與 render identity；不改 schema／API／migration，但需 targeted regression 與三尺寸 QC）

## 健檢結論

- 基線 `npm test -- --run` 為 20 files／142 tests，`npm run build` 通過；三 viewport 無 document overflow 或 console error。
- `findDropCandidate`、`MOVE_POSITION`、`REORDER_POSITION` 與 `Alt+Arrow` 已可處理目前 fixture 的跨部門同 parent sibling 案例，問題不是資料模型全面阻擋。
- P0 根因包含兩項 render identity 問題：`samePosition(undefined, undefined)` 錯誤回 false，以及每次 effect 重建 `employees` array；兩者必須一起修。
- 已顯示 preview 後移出候選時，現行流程可能保留 stale confirmed candidate；drop 必須以 release pointer 與 current state 重算，不可直接信任舊 ref。
- 前版以專用 position handle 作為唯一入口，壓縮職位卡可拖曳面積；本輪依使用者決策改為卡片 gesture threshold，title、employee、collapse 仍以 `nodrag` 排除。

## Current phase execution boundary

- 完整契約：`ai-doc/specs/DEV-026-position-drag-interaction-stability.md`。
- P0：gesture entry／`nodeDragThreshold`、node data stability、明確 drag state、candidate exit／cancel、release revalidation、跨部門 sibling regression。
- P1：只有 P0 後 profile 仍出現 >50ms long task、pointer 明顯落後或非 dragged node 持續 render，才加入 rAF／drop-zone cache。
- 不改 domain schema、migration、workspace API、版本權限、部門／層級權威；不 deploy／release。

## 驗收摘要

- [x] 職位拖曳由卡片 gesture threshold 判定；短按不移動，title、employee、collapse 不誤觸。
- [x] 跨部門、同 parent 的平行職位可移到正確 sibling slot；current state 的 MOVE commit 與三尺寸畫面驗證通過。
- [x] preview 離開 exit radius 後清除，空白 release 不提交 stale candidate。
- [x] invalid drop 回原位、保留選取並顯示原因；成功 drop 僅一筆 Undo，且不改部門／組織層級／任職。
- [x] free drag 時非 dragged node 的 object／data／employees references 穩定，無全圖抖動。
- [x] current-view／compare 無法 mutation；draft-edit／current-maintenance 正常。
- [x] 完整 tests、build 與 1440×900／1024×768／390×844 真實 browser QC 通過。

## 完成證據

- `npm test -- --run`：21 files／148 tests passed。
- `npm run build`：TypeScript check 與 Vite production build passed；既有 Vite extension warning／bundle size warning 保留，不在本 DEV 擴張處理。
- Browser：localhost:5000 draft-edit 驗證卡片空白區移動超過 6px 會進入拖曳、3×3px 短按不啟動、title／employee／collapse 不啟動、跨部門同 parent sibling reorder 可 commit 並以 Undo 還原；1440×900、1024×768、390×844 無水平溢出，console error／warning 為 0。
- Evidence：`output/playwright/dev-026/position-drag-1440x900.png`、`output/playwright/dev-026/position-drag-1024x768.png`、`output/playwright/dev-026/position-drag-390x844.png`。
- Runtime：沿用既有 localhost:5000；未停止或重啟 protected ProJED 127.0.0.1:4173；未 deploy／release。

## RD handoff

- 首要順序：後續若有變更，先更新 gesture contract，再同步實作、regression 與三 viewport QC；P1 只在 profiling gate 失敗時再啟動。
- 預計邊界：`src/App.tsx`、`src/components/OrgNode.tsx`、`src/drag.ts`、必要時新增 `src/positionDragInteraction.ts`、`src/index.css` 及對應 tests。
- Stop conditions：需要自動改部門／層級、position drag 與 employee drag 無法互斥、release 無法防 stale commit、既有 version／Undo／layout regression、tests/build/QC 失敗時停止回 PM／QA。
- 證據：完整 test/build、candidate／command／interaction pure tests、三 viewport 實際拖曳、preview exit／空白取消、唯讀 gate 與 console sweep。
- Runtime：可重用既有 OrgMaster localhost:5000；本任務建立的暫時 runtime 交接前必須清理；protected ProJED 4173 不得停止、重啟或清除。

## Governance

- Spec Impact Preflight：`Intentional replacement`；移除專用 handle contract，改為卡片 pointer gesture／`nodeDragThreshold=6`，並保留 DEV-017 command／preview、DEV-020 editability 與 DEV-025 level authority。
- ADR：不需要；局部、可逆的互動與效能修正，沒有新的長期資料或架構權威。
- Deferred Scope Audit：rAF／drop-zone cache 受量測 gate 控制；ReportingLine、多上級、部門自動搬移、層級自動改派、deploy／release 均不在本期。
- Git boundary：工作目錄不是 Git repository；以規格檔案邊界、測試與 browser evidence 管制。

## 變更紀錄

- 2026-08-17：完成系統健檢與 RD 主管審查，建立 `RD Implementation Ready` contract；確認 command／candidate 基礎可用，P0 收斂為完整 candidate state、release revalidation、node data reference stability 與可測的 gesture threshold。
- 2026-08-17：完成 DEV-026 P0 實作；新增 `src/positionDragInteraction.ts` pure state helpers、drag-start geometry snapshot、preview stability／exit hysteresis、strict release validation 與 memoized employee references；補 5 個 drag interaction／geometry regression tests。
- 2026-08-17：依使用者明確要求執行 `Intentional replacement`，移除專用拖曳把手，改為卡片 pointer gesture／`nodeDragThreshold=6`；完成 21 files／148 tests、production build 與三 viewport browser QC，未 deploy／release。
- 2026-08-21：依使用者要求調整職掌矩陣「職位」欄寬：workbench table 改用 auto layout，職位欄以 `width: 1%` 搭配 `white-space: nowrap` 依最長職位名稱與內距收斂；執行／審核／協作欄與水平溢出邊界維持不變，完成本機瀏覽器量測。
- 2026-09-01：DEV-039 完成 paired Duty→ProcessNode strict native evidence 與正式 QA-QC。`ProcessDutyBridge` 只將 source `effectAllowed` 由`copy`對齊既有 target `link`；全新 fixture `draft-4af67fa3-4e33-4644-8768-cb65d4642396`完成完整 native event chain、strict MIME、UI成功結果、API `200`／revision變化／canonical readback與cleanup，artifact=`output/playwright/dev039/F039-S7-E1-duty-process-native-strict.json`。E1四個 minimum directions、E2五案`historyEvidence`與E3兩案均通過正式 QA-QC；full regression `160 files／664 tests passed／1 skipped`、typecheck、build、source scan與文件一致性均通過。DEV-039現為`QA-QC Passed / E4 Candidate Freeze Ready / Authorization Pending`；未取得使用者／PM明確授權前，不commit、merge、deploy或release。
