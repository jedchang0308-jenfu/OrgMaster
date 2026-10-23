# DEV-058：驗收與證據

修訂：2026-10-23。OrgMaster DEV-058 統籌，AI-PDM DEV-123 管理角色／能力。**In Progress／Not Released**；[規格](../specs/DEV-058-federated-role-catalog-central-assignment.md)不另記進度。文件精簡已完成，現接續隔離開發／驗證；不執行正式 migration、部署或正式資料寫入。

## 1. 最少前置與資料

重用 task-owned 隔離環境與既有 fixture：legacy 九身份、dynamic 七 profile／custom／inactive、採購／舊生管、不同 scope／期限／代理、reader／manager／exact 特權 Principal。只補缺少基線，不 seed 欲驗的角色新增／任用／apply 成功，不碰 primary／正式資料。正常旅程需真實非正式 SSO／IdP／兩端程式；demo、stub、合成 session 只證明其所在層。

## 2. 判定與原目的

QA058-01..24、PDM 52 QA／17 AC／CG123-01/02 保留目的與編號，數量不是執行次數。一份實證可支持多案；PASS 只指必要主張已有適用證據，PARTIAL／BLOCKED／NOT_RUN 如實保留，不以單元／build 假冒正常登入、獨立 QC 或正式驗收。

原 B058-01..08 依序對應：正常角色入口（02/23）、真實配人／PDM 判權（08/09）、inactive 可讀可撤（10–12）、恢復不復活失效者（13/15）、可信歷史（01/05/06）、非法來源／hash／scope 拒絕（03/04/07/22）、並行兩順序（17/18，另保留 actor 撤權19）、管理 HTTP 停機隔離（24）。這是原目的索引，不增加八次驗證。

## 3. 唯一驗收表：目的、狀態與待補

U／API=契約與資格；PG=真 SQL／交易／ACL／競爭；UI／DUAL=正常操作／真實雙端。用能發現該失效的最低必要層；證據代碼見§5。以下沿用原狀態，不因文件精簡批量改 PASS。

| ID | 必須證明的結果 | 狀態、已有證據與待補 |
|---|---|---|
| QA058-01 | legacy 原 bytes/hash、九身份、治理歷史／audit 保留；不提前套新 disposition 或猜 active v7 | PARTIAL：U21/N；補原歷史／audit 適用斷言 |
| QA058-02 | 完整9..64身份與七 profile／alias／system／custom；一般 UI 只列 canonical＋active custom | PARTIAL：U21/U23、N mapping、V；正常 UI 併23 |
| QA058-03 | 錯 schema／profile／canonical hash／來源綁定拒絕，不能只信自報 hash 或 fallback／union | PASS：U21/U23 竄改正反與 N 原 producer→reader；新34欄真 SQL 由20補 |
| QA058-04 | 缺 builtin、重複身份／code／name、65列、非法 custom／scope／alias／protected metadata 拒絕；64正例 | PASS：U21/U23；身份不刪除／重用，custom 不得變 principal／global／任意 alias |
| QA058-05 | 舊任用／snapshot／改名可讀；ID/code/name/catalogVersion/scope/期間/priority 不回填或合併 | PARTIAL：U21/N；補採購／舊生管及改名差異斷言 |
| QA058-06 | 缺 history、同 version 多 hash、identity 不符時拒絕依賴它的新授權 | PARTIAL：U21；對照實際 SQL 分支，只補不同 mapping／來源失敗；減權依 SPEC§5 |
| QA058-07 | reader／manager／exact privileged／普通人／workload 及偽 body actor 各資格線維持、401/403 | PARTIAL：既有 API；fresh admission 併19，不因同 Employee 或名稱繼承 |
| QA058-08 | PDM 正常建立合法 custom→Org 配人/scope/期間並發布→PDM 真 protected 操作 Allow | BLOCKED：N 僅 domain 往返；缺正常 SSO/UI/API 證據，併 PDM29/52 |
| QA058-09 | D1任用後D2能力變更，原任用/snapshot/audit 不改、無 Org source／部署變更；下一請求採新政策 | PARTIAL：U21/N；補採購／舊生管各按原scope/priority判權、不 union；併 PDM29/52 |
| QA058-10 | inactive 禁新任用／推薦／代理／擴權，原人員可見，alias 同步，其他角色／資料不受污染 | PARTIAL：U21/N/V；正常雙端及 alias 分支併旅程 |
| QA058-11 | inactive 原列可撤銷／發布，actor/provenance/audit 正確，不影響其他任用 | PARTIAL：N/V；補舊生管及缺 current 時以可信 own 原資料減權 |
| QA058-12 | 停用角色的 direct/delegated 都不授能力，另一 active role 正常；v4 presence 不等於 Allow | PARTIAL：U21；補 direct/delegated/alias 混合差異結果，併 PDM44 |
| QA058-13 | 同ID角色恢復只採仍合法任用，不復活 revoked/expired/錯scope/失效來源；legacy-only 不新增回授 | PARTIAL：N 已驗 revoked 與明確 assignment restore；其他差異＋正常 UI 待補，併 PDM44/52 |
| QA058-14 | manual 調職／改名由人檢視，不自動授撤／改role；position_adoption 來源失效仍 Deny | PARTIAL：重用原提醒／來源 guard；核對適用斷言，不逐次組織更名重跑雙端 |
| QA058-15 | source revoked/expired 或 scope 不含，代理不得隨角色恢復復活；舊生管 identity 不變 | PARTIAL：既有 U；只補不同原生／雙端負例 |
| QA058-16 | 同ID同內容 replay、異actor/內容拒絕、CAS、commit後丟回應／換current；原結果可查且不重複 | PARTIAL：U/API/N；補 Org 真 HTTP 丟回應→原ID查回；not_observed不當未commit證明，PDM故障仍可查own結果 |
| QA058-17 | Org 預檢D1→PDM commit D2→Org取current，舊 tuple 409、零 half write | NOT_RUN：真雙連線時序待補，不能只用 U stale tuple；併 PDM30 |
| QA058-18 | Org 先凍結D1→PDM停用角色D2→Org依D1完成；PDM下一請求依D2 Deny | NOT_RUN：真重疊時序待補，不承諾跨owner同時commit；併 PDM30/44 |
| QA058-19 | Org writer 等鎖時 actor 撤權已commit，取鎖後fresh資格拒絕並全部rollback | NOT_RUN：真PG雙連線；F 的 PDM manager fence 不代替此 writer |
| QA058-20 | 首次dynamic／外部契約變更有真consumer相容；schema/registry不符拒絕首次上線 | PARTIAL：U；新34欄真讀回及雙端待補，日常無readiness/revision/marker/Org HTTP前置 |
| QA058-21 | immutable034/035；036只退役冷狀態，configured/READY零損失拒絕；最小有效ACL與manager fence保留 | PARTIAL：R23 四項PASS；035 PUBLIC/inherited／不同grant/helper與新雙端SQL待對照；不逐欄重演同一拒絕 |
| QA058-22 | 專用system_admin入口；ordinary/selfgrant/另一Principal/workload拒絕，hidden不進一般選單，custom不自授 | PARTIAL：U/API；真特權任用及不同雙端結果待補 |
| QA058-23 | 正常導航與 loading/非空/明確空/error/inactive/history/conflict/pending、keyboard、來源/名稱/期間可辨 | PARTIAL：V mock1440×900/390×844無overflow；補正常入口與缺少狀態。390唯讀；1024寫入邊界沿DEV-033有效證據，門檻/接線變更才補；不同layout才加寬度 |
| QA058-24 | 只停task-owned Org管理HTTP、DB/IdP仍可用，PDM業務不受新增HTTP依賴影響，Org明示不可配人 | NOT_RUN：真雙端故障旅程待補；source掃描不足。共享DB/IdP失效仍拒絕、不開local ACL |

## 4. 單一驗證路徑與證據重用

三類是選測方式，不是三個串行簽核；初次交付補齊相關目的，後續只刷新受影響主張。

| 變更／主張 | 最少充分驗證 |
|---|---|
| 契約、轉換、資格、scope及狀態差異 | 既有 U/API 參數化正反；`npm run test:dev-058:contracts` 為集合入口，日常可直接選相關 Vitest 檔。PDM 沿 `test:dev-123:contracts`＋實際 `ORGMASTER_DEV058_ROOT`，無固定檔案數 |
| 真 SQL／ACL、CAS、防重、rollback、17/18/19時序 | 重用原生PG環境與適用斷言；改SQL/DB boundary才跑 `check:db-boundary`。同交易末端失敗＋狀態回原值及交易邊界核對即可證原子性，不逐DML注入同一abort；不同owner／transaction另驗 |
| 正常UI、業務授權／配送及雙端整合 | 一次連續正常旅程：legacy→dynamic A→B→停用→撤銷→恢復，併custom、採購／生管差異、UI狀態／keyboard及Org HTTP故障，對應多QA/AC/CG；不同guard、target、長任務最終採用與實際bytes仍有各自斷言，不逐route重跑整段UI |

commit前rollback不證明commit後丟HTTP回應；後者仍須原ID查回／安全重送及零重複。Org用原command/audit，PDM用create UUID／save revision CAS／成功apply ledger，不要求已取消的create/save ledger。等價權限類別可共用有效ACL與一次實際拒絕，不同grant/helper仍補驗。

同失效機制、責任邊界及判定條件一致，且來源／fixture／環境／假設仍有效，就引用原證據與時間；新SHA、回合、文件或私有改名不使全部失效。新SQL／caller只能重用其未變子斷言。run層共用來源及環境資訊，case只留相關結果／引用；不加receipt格式、專用runner或逐案截圖包。

純文件不重建app；app/build輸入改變或缺有效證據才build，release executor未改不加release測試。既有required CI照執行器；沒有另設「整包本機重跑→獨立QC→第二人核准」流程。CG是覆蓋索引，引用同一適用結果，不額外再跑一包。缺正常登入只阻塞相關旅程，安全獨立驗證繼續。

<a id="6-本輪局部切片驗證"></a>
<a id="7-2026-10-21-dynamic-consumer本機證據"></a>
<a id="8-2026-10-21-正常旅程續接與逐案狀態"></a>
<a id="7-2026-10-23-接續對齊最新pdm精簡契約"></a>

## 5. 可重用證據

當前續作產品樹=`C:/VIBE CODING/.worktrees/OrgMaster/dev058-completion-20261023`，branch=`codex/dev058-completion-20261023`，HEAD定位=`35a28e10fae115d35bbcddf0515d715f0ce7c5ae`，含未提交差異；PDM session持有產品／native writer。下列原實作樹保留既有證據，不把新HEAD當成舊報告的受測版本。

Org 實作樹=`C:/Users/user/Documents/Codex/2026-10-19/saas-ai-skill/work/OrgMaster-release`，`codex/dev058-dynamic-pdm-consumer`，HEAD定位=`f30eef0bd1a1e1553481ae610af650f2b3d13026`；含未提交變更，以各原始log／source hash為受測來源。證據根=`output/qa/dev-058/`。新 PDM writer 位於 `C:/VIBE CODING/.worktrees/AI_PDM/dev123-completion-20261023`；產品與文件由其session維護，本輪不覆寫。

| 引用 | 已驗結果／原證據 | 適用限制 |
|---|---|---|
| U23／B23 | 2026-10-23 version/hash pair、34欄decoder、input／API序列化：固定入口11檔82 PASS／1原SKIP，typecheck／build／DB boundary PASS；build=`build-version-hash-pair-20261023.log` | 沿本機原執行紀錄；非正常SSO或新PDM原生交易。DB boundary初次header格式失敗及修正、destructive警告保留 |
| R23 | `native-retirement-1792759101959-d83c37e1/report.json`：cold退役、configured保留、READY保留、真runtime login拒DDL共4PASS；client/cluster/port/temp清理全PASS | 只證036隔離PG18／ACL；非035 manager行為／雙端／正式DDL |
| U21 | `normal-journey-20261021/continuation-summary.json`及原log：Org70 PASS/1SKIP；PDM494＋Node9，末次接線Node9/domain10 | 舊source的未變轉換／資格子斷言；不作新SQL PASS |
| N | `native-pg-bilateral-audit-id-20261021/report.json` attempt10：舊PDM actual apply、防重/CAS/末端rollback、actual Org v2任用→停用→撤銷→恢復 | PG18、owner bootstrap、Platform stub／synthetic session；舊generation/apply結論不移用新PDM交易，attempt9等原失敗保留 |
| F／D | `native-pg-enabled-20261021-0226/report.json` managerFence、`native-pg-manager-schema-20261021-0133/report.json`及原088/089報告 | 舊PDM post-wait／034/035 schema/ACL子證據；舊readiness不是日常gate，不代替Org17/18/19或新PDM086/087/088 |
| V／S | Org `ui-targeted-20261021/ui-targeted-results.json`與PDM原UI；`normal-journey-20261021/cookie-transport-report.md` | mock元件／真Chrome start cookie修復；非IdP callback、正常session issuance或完整旅程 |

保留raw logs、原時間／source／首次及獨立失敗，不另複製台帳或重寫舊結論。較早容量EMERGENCY、READY/ENABLED初始化、舊HEAD與UI截圖都是當時事實，不變成現行前置／授權；舊runtime／port／lease已結束，未知5432未干擾。

## 6. 剩餘工作與逐案狀態

缺口與狀態只維護§3，共用一個隔離環境補相關旅程／時序／ACL／配送，不逐案重建。新證據核對來源後併§5；舊 N 不整包移用新 PDM 交易。歷史 V3 audit 缺 exact preimage 時唯讀確認相容，不補算舊 hash／改收據；文件完成不關閉產品或正式驗收。

2026-10-23文件精簡自查：兩個 Org 工作樹的 24 個 QA ID、原目的與狀態保留；AGENTS／SPEC／QA 共 26 個本機連結／anchor 及 diff check 通過。PDM 34 欄 manifest、52 QA／17 AC／兩個 CG 目的與無檔案數配額已核對；雙方以三類選驗、一次旅程與適用證據對照，不增設 H／OM-C／CG 關卡。精確 migration 清單只留既有 profile／執行器，SPEC 保留首次相容交付順序。此輪未重跑未變 app、PG 或正常 SSO，亦未執行正式操作；產品結果另依實證更新。

### 2026-10-23 正常登入準備：provider唯讀實證

`jenfu-platform-nonprod / asia-east1` 的 `orgmaster-stg`、`ai-pdm-stg`、`jenfu-platform-stg` 均經Cloud Run metadata確認Ready=True；三者公開 `GET /api/auth/mode` 均200 JSON，兩app的ssoHandoffEnabled=true。provider URL分別為 `https://orgmaster-stg-vfdbhti6ua-de.a.run.app`、`https://ai-pdm-stg-vfdbhti6ua-de.a.run.app`、`https://jenfu-platform-stg-vfdbhti6ua-de.a.run.app`；配置canonical為對應的 `*-1055054506544.asia-east1.run.app`。region內相關服務清單只有這三個，沒有另找到既有v2測試服務；不再將「缺本機.env」誤寫成非正式環境不存在。

但provider來源Platform=`d33c214b0c53fe69d1b65e2dcaf60ec97c88c581`、PDM=`03216712c1104b5998079717acee07cc2a8d6379`；對應Git物件的實際SSO producer/consumer均為 `jenfu.sso-handoff.v1`，本次current兩app要求v2。舊staging登入不證明新source整合；正常入口仍需匹配的v2 broker／兩app／Principal映射與真Google服務身分，不能恢復v1或用合成token補過。callback為exact origin且exchange驗service email/sub/aud，本機改URL不足以接上既有broker。

授權帳密檔由指定luna在process記憶體解析，無帳號／密碼／Email／token輸出或複製；只讀nonprod `projects.accounts.lookup` 回HTTP403即停止，未使用密碼、未登入、未重試／變更IAM或帳號。因此測試帳號在nonprod的存在性與Principal/grant仍UNKNOWN，不是密碼錯誤，也不要求人類重新貼帳密。此輪僅provider metadata／公開GET／source核對，沒有session、schema、business data或正式寫入，不提升08/20/23為PASS。
