# DEV-058：驗收與證據

修訂：2026-10-23。OrgMaster DEV-058 統籌，AI-PDM DEV-123 管理角色／能力。**In Progress／Not Released**；[規格](../specs/DEV-058-federated-role-catalog-central-assignment.md)不另記進度。本文件只維護驗收目的、缺口及證據；正式操作僅限人類另行授權的 `orgmaster-prod` 034–036 相容 migration／reader部署，須先有PDM schema成功及既有release條件；不改寫人員指派、IAM或Secrets。

## 1. 最少前置與資料

重用 task-owned 隔離環境與既有 fixture：legacy 九身份、dynamic 七 profile／custom／inactive、採購／舊生管、不同 scope／期限／代理、reader／manager／exact 特權 Principal。只補缺少基線，不 seed 欲驗的角色新增／任用／apply 成功，不碰 primary／正式資料。正常旅程需真實非正式 SSO／IdP／兩端程式；demo、stub、合成 session 只證明其所在層。

## 2. 判定與原目的

QA058-01..24、PDM 52 QA／17 AC／CG123-01/02 保留目的與編號，數量不是執行次數。一份實證可支持多案；PASS 只指必要主張已有適用證據，PARTIAL／BLOCKED／NOT_RUN 如實保留，不以單元／build 假冒正常登入、獨立 QC 或正式驗收。

原 B058-01..08 依序對應：正常角色入口（02/23）、真實配人／PDM 判權（08/09）、inactive 可讀可撤（10–12）、恢復不復活失效者（13/15）、可信歷史（01/05/06）、非法來源／hash／scope 拒絕（03/04/07/22）、並行兩順序（17/18，另保留 actor 撤權19）、管理 HTTP 停機隔離（24）。這是原目的索引，不增加八次驗證。

## 3. 唯一驗收表：目的、狀態與待補

U／API=契約與資格；PG=真 SQL／交易／ACL／競爭；UI／DUAL=正常操作／真實雙端。用能發現該失效的最低必要層；證據代碼見§5。狀態只依適用實證更新，文件精簡不改判定。

| ID | 必須證明的結果 | 狀態、已有證據與待補 |
|---|---|---|
| QA058-01 | legacy 原 bytes/hash、九身份、治理歷史／audit 保留；不提前套新 disposition 或猜 active v7 | PASS：U26 exact legacy snapshot／hash與原audit正反，合併S26原v1九身份／publication不變；沿原preimage，不重算舊hash。不另加九次登入或同目的native旅程 |
| QA058-02 | 完整9..64身份與七 profile／alias／system／custom；一般 UI 只列 canonical＋active custom | PARTIAL：U21/U23、N mapping、V；正常 UI 併23 |
| QA058-03 | 錯 schema／profile／canonical hash／來源綁定拒絕，不能只信自報 hash 或 fallback／union | PASS：U21/U23 竄改正反與 N 原 producer→reader；新34欄真 SQL 由20補 |
| QA058-04 | 缺 builtin、重複身份／code／name、65列、非法 custom／scope／alias／protected metadata 拒絕；64正例 | PASS：U21/U23；身份不刪除／重用，custom 不得變 principal／global／任意 alias |
| QA058-05 | 舊任用／snapshot／改名可讀；ID/code/name/catalogVersion/scope/期間/priority 不回填或合併 | PASS：U26 Org兩身份持久化／撤銷readback與名稱／presentation分離，PDM原roleCode priority、deny及scope隔離；本版不開放已發布身份改名，不新增rename功能或重演同一pair。正常入口見08/23 |
| QA058-06 | 缺 history、同 version 多 hash、identity 不符時拒絕依賴它的新授權 | PASS：C26真history SQL三種失敗均拒；H26證error傳回，非減權Store在mutate前await current/history，無fallback。減權仍依SPEC§5，不另重演同一reader失敗的HTTP旅程 |
| QA058-07 | reader／manager／exact privileged／普通人／workload 及偽 body actor 各資格線維持、401/403 | PASS：原資格／identity-fenced writer正反與J26 fresh actor，合併O26 mounted API：ordinary／provider_pair fixture偽造body actor均403、artifact／audit零變更；入站驗證仍沿原auth/writer證據，不冒稱真provider登入 |
| QA058-08 | PDM 正常建立合法 custom→Org 配人/scope/期間並發布→PDM 真 protected 操作 Allow | BLOCKED：N 僅 domain 往返；缺正常 SSO/UI/API 證據，併 PDM29/52 |
| QA058-09 | D1任用後D2能力變更，原任用/snapshot/audit 不改、無 Org source／部署變更；下一請求採新政策 | PASS：J26真D1/D2與下一PDM請求改判，合併U26 A→B原任用／audit及採購／舊生管priority／scope不union；不要求所有斷言重演於同一旅程。正常SSO／UI仍見08/23與PDM29/52 |
| QA058-10 | inactive 禁新任用／推薦／代理／擴權，原人員可見，alias 同步，其他角色／資料不受污染 | PARTIAL：U21/N/V、J26/D26/O26已驗inactive read/revoke、新任用／推薦／代理／擴權拒絕、原published grant不改，direct/delegated Deny而active sibling Allow；producer alias停用／恢復差異待補，畫面統一23 |
| QA058-11 | inactive 原列可撤銷／發布，actor/provenance/audit 正確，不影響其他任用 | PASS：U26/D26 inactive canonical／legacy與delegation撤銷、原provenance持久化，合併原reduction的離線own snapshot發布／actor及audit hash正反與J26真提交；共用同一publisher／audit機制，不再要求同一inactive案例重驗全部audit欄位 |
| QA058-12 | 停用角色的 direct/delegated 都不授能力，另一 active role 正常；v4 presence 不等於 Allow | PASS：J26 r15真PDM request guard/evaluator，inactive direct/delegated均Deny，新增active RD sibling後該人Allow、僅inactive代理者仍Deny；v4 direct/delegated身份／scope欄位保留。非正常SSO／UI；alias差異仍由09/10追蹤 |
| QA058-13 | 同ID角色恢復只採仍合法任用，不復活 revoked/expired/錯scope/失效來源；legacy-only 不新增回授 | PARTIAL：N、U26/O26已驗有效custom恢復與revoked／expired／legacy-only拒絕、角色恢復不重建revoked source；失效來源的PDM投影差異與15共用，正常畫面統一23 |
| QA058-14 | manual 調職／改名由人檢視，不自動授撤／改role；position_adoption 來源失效仍 Deny | PARTIAL：原職位改名／異動不重寫manual任用、推薦不等於採用與偽造position_adoption拒絕可重用；仍補既有position-adoption有效mutation與來源失效guard，不逐次組織改名重跑雙端 |
| QA058-15 | source revoked/expired 或 scope 不含，代理不得隨角色恢復復活；舊生管 identity 不變 | PARTIAL：O26以真command撤代理再撤source，角色inactive→active後同ID重建仍拒；expired delegation無效、source不含期間／scope拒絕，legacy identity沿U26；仍需適用PDM原生投影的失效source／expiry證據，不重演已驗domain分支 |
| QA058-16 | 同ID同內容 replay、異actor/內容拒絕、CAS、commit後丟回應／換current；原結果可查且不重複 | PASS：J26/O26真HTTP commit後丟回應→原ID查回／相同body-CAS唯一重送／異內容409／producer離線仍查own結果，合併U26 store/API異actor、CAS與catalog binding拒絕及401/403；不再重演同store hash oracle |
| QA058-17 | Org 預檢D1→PDM commit D2→Org取current，舊 tuple 409、零 half write | PASS：J26 真producer apply D2後，Org舊tuple回409；artifact/batch/audit/outbox均未改，不以U stale tuple代替 |
| QA058-18 | Org 先凍結D1→PDM停用角色D2→Org依D1完成；PDM下一請求依D2 Deny | PASS：J26 觀察到真PG鎖與blocker PID；Org凍結D1、PDM inactive D2先commit，Org仍發布D1，v4 grant在且PDM新request guard/evaluator為permission_not_granted；非正常SSO |
| QA058-19 | Org writer 等鎖時 actor 撤權已commit，取鎖後fresh資格拒絕並全部rollback | PASS：J26 Org writer實際等admission鎖時，以真session repository撤銷並commit；取鎖後401/IDENTITY_CONTEXT_REQUIRED，artifact/audit/outbox全rollback；不移用PDM manager fence |
| QA058-20 | 首次dynamic／外部契約變更有真consumer相容；schema/registry不符拒絕首次上線 | PASS：C26真producer正常create/save/preview/apply→OrgRuntime fixed34欄current/history；schema／registry及缺欄位真SQL失敗均拒、無static fallback。限隔離PG契約相容，不代表正常SSO／UI或正式上線 |
| QA058-21 | immutable034/035；036只退役冷狀態，configured/READY零損失拒絕；最小有效ACL與manager fence保留 | PASS：R23未變036四項、A26現行035 ACL九子斷言及P26真post-wait manager撤權零效果；只證隔離PG／migration／ACL，非正式或正常SSO。migrator為NOLOGIN角色SET LOCAL ROLE，不冒稱provider登入 |
| QA058-22 | 專用system_admin入口；ordinary/selfgrant/另一Principal/workload拒絕，hidden不進一般選單，custom不自授 | PARTIAL：U/API；真特權任用及不同雙端結果待補 |
| QA058-23 | 正常導航與 loading/非空/明確空/error/inactive/history/conflict/pending、keyboard、來源/名稱/期間可辨 | PARTIAL：V mock兩寬度與O26初次network failure提醒／無任用矩陣／既有reload恢復已驗；正常入口、鍵盤及其餘狀態仍待補。390唯讀；1024沿DEV-033有效證據，門檻／接線或layout改變才補 |
| QA058-24 | 只停task-owned Org管理HTTP、DB/IdP仍可用，PDM業務不受新增HTTP依賴影響，Org明示不可配人 | PASS：O26 r19實停Org listener／任用API ECONNREFUSED，PDM真GET submissions handler在停機前後均200且同筆非空資料；DB、fixture IdP state、grants／audit不變，Org HTTP恢復；合併component失敗提醒。限隔離synthetic issuance，不代08/23正常SSO |

## 4. 單一驗證路徑與證據重用

先引用§5仍適用的證據，只執行§3缺少或受影響的斷言，再回填原表。以下三類可合併執行，不是串行簽核。

| 受影響主張 | 最少充分驗證 |
|---|---|
| 契約／資格／scope／狀態 | 選相關既有 Vitest 正反案例；`test:dev-058:contracts` 是集合入口，不在全量 CI 後再跑一次。PDM 沿自己的 contracts／bilateral 入口，雙邊才指定實際 `ORGMASTER_DEV058_ROOT`，不設測試檔案數配額 |
| SQL／ACL／防重／交易／競爭 | 共用隔離 PG；同交易一次末端失敗及狀態回原值可證原子性，不逐 DML 注入相同 abort。不同 owner／transaction、17／18 兩種時序與19撤權保留各自斷言；改 SQL／DB boundary 才跑 `check:db-boundary` |
| 正常 UI／雙端／業務配送 | 共用一段正常登入旅程完成 custom、能力變更、停用／撤銷／恢復、採購／生管差異及24停 HTTP；各 QA／AC／CG 引用同份結果。不同授權 guard／target、長任務最終採用及實際 bytes 保留差異斷言，不逐 route 重走 UI |

同失效機制、責任邊界及判定條件一致，來源／fixture／環境／假設仍有效即可重用；新 SHA、文件或回合不使全部證據失效。新 SQL／caller 只刷新受影響部分。commit 前 rollback 不代替 commit 後丟回應：後者仍驗原 ID 查回／安全重送及零重複；不同資格／grant/helper 仍驗各自拒絕。

來源、環境及限制在同次 run 記一次，個案引用結果，不加 receipt 格式、逐案報告／截圖包或第二人核准。`Production Source QC` 永遠保留：僅 `AGENTS.md`／`ai-doc/**/*.md` 變更時只查 diff；其他或未知變更沿原完整 QC。日常本機不再複跑 CI 已涵蓋的檢查；build／release 測試只在其輸入受影響或證據不足時補。缺正常登入只阻塞相關旅程。

<a id="6-本輪局部切片驗證"></a>
<a id="7-2026-10-21-dynamic-consumer本機證據"></a>
<a id="8-2026-10-21-正常旅程續接與逐案狀態"></a>
<a id="7-2026-10-23-接續對齊最新pdm精簡契約"></a>

## 5. 可重用證據

當前產品樹=`C:/VIBE CODING/.worktrees/OrgMaster/dev058-completion-20261023`；PDM=`C:/VIBE CODING/.worktrees/AI_PDM/dev123-completion-20261023`。J26／H26 位於當前 Org 樹；其餘舊證據位於 `C:/Users/user/Documents/Codex/2026-10-19/saas-ai-skill/work/OrgMaster-release`。證據均以原 `output/qa/dev-058/` log／source hash 為準，不把現在 HEAD 當成舊報告受測版本，不另維護即時 HEAD／writer 台帳。

| 引用 | 已驗結果／原證據 | 適用限制 |
|---|---|---|
| O26 | `native-org-journey-20261023-r19.log`：9PASS，新增真Org HTTP停機＋PDM cookie guard／非空業務API與恢復；同名runtime-release.json零未釋放process。Luna原工具輸出：API18、dynamic assignment9、GovernanceCenter7共34PASS；`outage-actor-lifecycle-typecheck-20261023-r1.log` exit0。PDM CAST修正另有`nullable-submission-focused-20261023-r1.log`兩檔10PASS及DB boundary PASS | native直接input前後hash不變，PDM query原始hash見各log；身份／Platform state為fixture，不是正常SSO。r16公司fixture與r17/18真42P08失敗保留，r19明示修正後來源；PG／HTTP／port／temp與capacity lease/session全清。三個focused test只證各自layer，不稱獨立QC |
| U26 | 當前Org `contracts-final-source-20261023.log`：15檔102PASS／1原SKIP；PDM `dev123-contracts-final-20261023-1792763201613.log`：55檔520PASS及Node8PASS。Org compatible／provenance journey／reduction及PDM entitlement repository測試；v7 exact snapshot另由§6完整CI的同名10項PASS支持，分別覆蓋legacy hash／原audit、任用及兩身份priority／scope隔離 | 依各owner原斷言合併01/05/09，不新增同機制native驗證；更名只驗identity與presentation分離，不擴增已發布角色改名功能。PDM log位於當前PDM樹，非正常SSO／UI或正式驗收 |
| U23／B23 | 2026-10-23 version/hash pair、34欄decoder、input／API序列化：固定入口11檔82 PASS／1原SKIP，typecheck／build／DB boundary PASS；build=`build-version-hash-pair-20261023.log` | 沿本機原執行紀錄；非正常SSO或新PDM原生交易。DB boundary初次header格式失敗及修正、destructive警告保留 |
| J26 | `native-org-journey-20261023-r15.log`：8項PASS，含原HTTP drop/query/replay、正例、17/18/19、未發布draft歷史與QA12 direct/delegated inactive＋active sibling；validation.ts納入直接inputs且前後hash相同；HTTP/PG/port/temp清理及同名runtime-release.json成功 | 真兩owner服務／cookie auth／PG及PDM session guard/evaluator；Platform state與session issuance為合成fixture，非正常SSO／UI／正式環境。r9/r11與r14代理歷史讀取產品失敗、r13 fixture失敗保留，不以新PASS刪舊失敗 |
| H26 | `history-provenance-regression-20261023-r2.log`：6檔38PASS；`history-provenance-typecheck-20261023-r1.log`對應tsc exit0；native API import PASS | helper補讀只驗provenance，current仍為新授權來源；wrong app/version/invalid/missing來源拒絕，無static fallback |
| D26 | `delegation-inactive-regression-20261023-r1.log`：validation／commands／surface／privileged／lifecycle／dynamic assignment共6檔41PASS；`delegation-inactive-typecheck-20261023-r1.log`對應tsc exit0 | 補retained delegation可信歷史可讀可撤；新代理、scope擴張、錯source catalog仍拒絕。真失敗重現見r14，unit未另外執行未修版本，不宣稱獨立QC |
| A26／P26 | `native-manager-acl-20261023-r1.mjs`與`.log`：現行035 definer owner/search_path／最小EXECUTE、真runtime合法／wrongPrincipal false、migrator角色合法、兩角色core DML拒絕、OrgRuntime／未授權inherited helper拒絕共九子斷言PASS；`native-policy-20261023-final-r5.log`含真post-wait manager撤權零效果及原生current/history pair | task-owned PG18；034當前raw CRLF hash明列，不冒稱R23舊bytes；036 bytes未變才重用R23。migrator以NOLOGIN角色在owner交易SET ROLE驗有效ACL。source bytes前後相同，PG／port／temp全清、lease/session已結束；非provider／SSO證據 |
| C26 | `native-catalog-integrity-20261023-r2.mjs`與`.log`共7PASS：真PDM producer→Org actual runtime current/history固定34欄；schema／registry、history缺版本／同版異hash／identity及缺欄位SQL均拒絕；各fault後restore回原hash、受測source前後不變 | fault injection只在task-owned producer views，未修改已套用SQL／產品；PG18／synthetic identity／production=false。PG／port／temp清理及lease/session結束；r1 clientRoleId fixture拒絕原檔/log保留。非正常SSO／UI／正式驗收 |
| S26 | `schema-first-20261023-r3.log`、`schema-first-runner-20261023-r2.mjs`及bootstrap複本r2：先PDM086–088時Org035兩helper不存在；v1九列／19欄、原manifest子集／pointer／publication／舊read ACL不變，再Org034–036成功，兩真runtime讀取v2/history34欄及legacy九列 | 原tracked bootstrap／SQL未改；原manifest之外可新增manifest，所以整份metadata digest可不同。9個受測source於run後逐hash一致，PG／port／temp與lease/session全清。r1 loader及r2 metadata-query fixture失敗保留；只證冷安裝recipe，合併C26作reader相容證據，不代provider retained-worker／正式GO或正常SSO |
| R23 | `native-retirement-1792759101959-d83c37e1/report.json`：cold退役、configured保留、READY保留、真runtime login拒DDL共4PASS；client/cluster/port/temp清理全PASS | 只證036隔離PG18／ACL；非035 manager行為／雙端／正式DDL |
| U21 | `normal-journey-20261021/continuation-summary.json`及原log：Org70 PASS/1SKIP；PDM494＋Node9，末次接線Node9/domain10 | 舊source的未變轉換／資格子斷言；不作新SQL PASS |
| N | `native-pg-bilateral-audit-id-20261021/report.json` attempt10：舊PDM actual apply、防重/CAS/末端rollback、actual Org v2任用→停用→撤銷→恢復 | PG18、owner bootstrap、Platform stub／synthetic session；舊generation/apply結論不移用新PDM交易，attempt9等原失敗保留 |
| F／D | `native-pg-enabled-20261021-0226/report.json` managerFence、`native-pg-manager-schema-20261021-0133/report.json`及原088/089報告 | 舊PDM post-wait／034/035 schema/ACL子證據；舊readiness不是日常gate，不代替Org17/18/19或新PDM086/087/088 |
| V／S | Org `ui-targeted-20261021/ui-targeted-results.json`與PDM原UI；`normal-journey-20261021/cookie-transport-report.md` | mock元件／真Chrome start cookie修復；非IdP callback、正常session issuance或完整旅程 |

保留raw logs、原時間／source／首次及獨立失敗，不另複製台帳或重寫舊結論。較早容量EMERGENCY、READY/ENABLED初始化、舊HEAD與UI截圖都是當時事實，不變成現行前置／授權；舊runtime／port／lease已結束，未知5432未干擾。

## 6. 剩餘工作與逐案狀態

缺口與狀態只維護§3，共用一個隔離環境補相關旅程／時序／ACL／配送，不逐案重建。新證據核對來源後併§5；舊 N 不整包移用新 PDM 交易。歷史 V3 audit 缺 exact preimage 時唯讀確認相容，不補算舊 hash／改收據；文件完成不關閉產品或正式驗收。

2026-10-23 精簡保留 Org 24 目的及 PDM 52 QA／17 AC／CG；H／OM-C／CG 不另設關卡，後續結果只依§3實證更新。本機 CI 選擇器10情境、既有入口測試1項、YAML／JS syntax、26個本機連結／anchor及diff check通過。provider實證：產品來源 `27ebc427` 的 `Production Source QC` run `39972931885` 完整Docker／工具匯入／QC均SUCCESS；純文件來源 `229f521d` 的run `39974113140` 同一required job SUCCESS，六個建置／測試步驟按文件分支skipped。這兩份證據保留各自來源，不因後續文件SHA重跑未變app，也不等同正式發布。

### 2026-10-23 正常登入準備：provider唯讀實證

`jenfu-platform-nonprod / asia-east1` 的 `orgmaster-stg`、`ai-pdm-stg`、`jenfu-platform-stg` 均經Cloud Run metadata確認Ready=True；三者公開 `GET /api/auth/mode` 均200 JSON，兩app的ssoHandoffEnabled=true。provider URL分別為 `https://orgmaster-stg-vfdbhti6ua-de.a.run.app`、`https://ai-pdm-stg-vfdbhti6ua-de.a.run.app`、`https://jenfu-platform-stg-vfdbhti6ua-de.a.run.app`；配置canonical為對應的 `*-1055054506544.asia-east1.run.app`。region內相關服務清單只有這三個，沒有另找到既有v2測試服務；不再將「缺本機.env」誤寫成非正式環境不存在。

但provider來源Platform=`d33c214b0c53fe69d1b65e2dcaf60ec97c88c581`、PDM=`03216712c1104b5998079717acee07cc2a8d6379`；對應Git物件的實際SSO producer/consumer均為 `jenfu.sso-handoff.v1`，本次current兩app要求v2。舊staging登入不證明新source整合；正常入口仍需匹配的v2 broker／兩app／Principal映射與真Google服務身分，不能恢復v1或用合成token補過。callback為exact origin且exchange驗service email/sub/aud，本機改URL不足以接上既有broker。

授權帳密檔由指定luna在process記憶體解析，無帳號／密碼／Email／token輸出或複製；只讀nonprod `projects.accounts.lookup` 回HTTP403即停止，未使用密碼、未登入、未重試／變更IAM或帳號。因此測試帳號在nonprod的存在性與Principal/grant仍UNKNOWN，不是密碼錯誤，也不要求人類重新貼帳密。這份provider前置查核只有metadata／公開GET／source，沒有session、schema、business data或正式寫入，不提供08/23的正常SSO／UI PASS；20的獨立PG證據另見C26／S26。

2026-10-23 已核對PDM聊天原始人類回答（`call_b8ebc1c4d3c1404c818d33f5ad43e3d8`）：允許 `jenfu-platform-prod / orgmaster-prod` 034–036相容migration與reader部署，不含人員指派改寫／IAM／Secrets；等待PDM086–088成功readback後才執行。另人類在本聊天已批准Platform非正式v2 SSO配合；隔離樹=`C:/VIBE CODING/.worktrees/Jenfu-Platform/dev058-nonprod-v2-sso-20261023`，其他既有工作樹不變。正常SSO仍待實證，授權不是PASS。
