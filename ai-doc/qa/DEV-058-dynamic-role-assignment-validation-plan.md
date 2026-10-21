# DEV-058：動態角色與集中指派驗證計畫

修訂：2026-10-21。Owner：`ORGMASTER/DEV-058`；來源：`AIPDM/DEV-123#orgmaster-compatibility`。
依據：[唯一SPEC](../specs/DEV-058-federated-role-catalog-central-assignment.md)；對齊grouped-v2／七日常角色／九歷史身份／alias及compatibility_v2。
狀態：`Local Contract Slice Verified / Full Case Closure Pending`。2026-10-21本機結果見§7；24案仍需依各自必要層級關閉，不等同完整dynamic驗收。
**保留QA058-01..24原ID及安全／功能目的；目前完整case closure為2/24（03、04），其餘逐案狀態見§8。** 已執行的部分證據記PARTIAL，尚未執行的必要時序記NOT_RUN；AI-PDM固定52案獨立，QA123-29/30/44/52的真consumer要求仍有效。

本版取代四個專用runner、固定16檔、獨立versioned evidence JSON及重複逐層證明的前置。使用同一次可信操作支援多個案例，補受影響部分；沒有該層證據的案例仍不能PASS。2026-10-19文件階段沒有產品操作；後續本機原生PG、browser與故障注入的實際範圍見§7／§8，不稱正常登入、正式環境或獨立QC。

## 1. 最少前置與資料

- 角色：O-MANAGER具當前OrgMaster manage/simulate/publish；O-READ無mutation；O-PRIV沿exact privileged入口。P-EDITOR具PDM政策管理資格，P-DAILY不能代同Employee的特權Principal。身分不能從body/名稱/workload推導。
- 人員E1/E2 active、E3 inactive；只用隔離環境或另經授權的指定資料，不指定正式員工／帳號。業務父資料可預備，預期配人／發布結果由正常owner流程建立。
- F-L：已核實legacy v5/v6/v7及原任用／audit，不猜source v7已active。
- F-D：producer實際grouped-v2 current/history、受控schema/registry/protected綁定及canonical vectors；七canonical、舊生管alias、hidden system_admin、custom C1。
- F-A：有效／revoked／expired／scope錯誤／position來源失效及代理；含原採購與原生管兩種任用，不合併或改寫ID。
- F-R：可控制兩交易時序、撤權及commit後回應遺失；只在task-owned環境故障注入。
- F-C：compatibility_v2 NOT_READY／READY、多列／錯綁定及ACL負例。marker fixture不能證明live consumer已相容。

跨owner物件由各自owner處理。OrgMaster單repo測試不建寫sibling core；contract simulator清楚標示，只證明decoder或本owner交易，不能完成真雙端案例。H1/H2/H3未收斂時只停依賴它的整合／READY，本地獨立工作可繼續。

## 2. 必須看到的結果與失敗

正常路徑：PDM「設定→流程→角色與權限」建立／保存、唯讀預覽及單一apply → OrgMaster正常工作台「角色指派」選人／範圍／期間並發布 → PDM正常protected操作。停用／恢復由PDM同一apply流程，撤銷在OrgMaster；不新增PDM待啟用版本／獨立activate。direct URL/API或seed可補技術證據，不能代替正常入口可用。

證據只記實際層級：U/API（decoder／service／middleware）；PG（原生交易／DDL／ACL）；UI（正常頁面與own API）；DUAL（兩個真owner及contract）；PROD（另具正式授權的實際環境）。本地或模擬不能填DUAL／PROD的PASS，build不能填UI的PASS。相關輸入與假設未變的有效證據可重用，保留原來源與時間。

必要失敗涵蓋：錯來源/hash/profile；inactive毒化整份治理；舊來源被current覆寫；scope/Principal越權；重送重複寫；交易混版／撤權後提交；假READY。這些直接對應下列案例，不另建立必填FMEA或新增審查流程。

## 3. 保留的24案

「U/PG/UI/DUAL」是各主張所需層級；目前逐案關閉狀態見§8。已取得的有效證據可重用，但必要PG/UI/DUAL主張未被證明時仍不計整案完成。

| ID | 操作／資料 | 預期與失敗判定 | 必要證據 |
|---|---|---|---|
| QA058-01 | F-L讀current及原治理歷史 | 原bytes/hash、九身份及audit保持；legacy期間不提前套七role/disposition，不能猜v7 active | U；受影響DB mapping用PG |
| QA058-02 | F-D合法9..64身份、七日常profile、alias、system及custom | reader接受完整身份，UI只提供七canonical＋active custom，一般選單不列system_admin／legacy-only | U/PG mapping；UI併23 |
| QA058-03 | 改role/status/profile/content hash、canonical／來源綁定 | 拒絕錯payload，不static fallback／union；不能只驗DB自報hash。完整policy語意由PDM驗，不在Org複製editor引擎 | U；實際contract併DUAL |
| QA058-04 | 缺builtin、duplicate ID/code/name、65列、非法custom/scope/profile/alias | identity不得物理刪除／重用；custom不可變principal/global或任意alias；system保護及alias關係不合法拒絕 | U/API |
| QA058-05 | 原version≠current，含舊採購／生管及presentation改名 | 原snapshot合法可讀，code/name/catalogVersion/scope/期間不回填；按原identity驗history，不用新顯示名比對舊證據 | U/PG；原grant結果併DUAL |
| QA058-06 | 缺history、同version多hash或identity不符 | 依賴該證據的新授權拒絕、顯示來源問題，不以姓名／client hash保底；維護若另有可信own原snapshot則按SPEC§5，仍不能擴權 | U/API；來源失敗併PG |
| QA058-07 | O-READ/MANAGER/PRIV、P-DAILY、body actor／workload | 原資格線維持，401/403；不能以同Employee另一Principal或role名稱提升資格 | API；fresh admission併19 |
| QA058-08 | P-EDITOR正常建立有合法能力的custom；Org正常配E1/scope/期間並發布 | PDM正常protected操作依scope/能力實際Allow；draft與published可辨，不靠seed產生成功結果 | UI/DUAL；QA123-29/52 |
| QA058-09 | D1任用後PDM啟用D2合法能力變更 | Org原任用/snapshot/audit與compatibility revision不變，無OrgMaster source／部署變更，PDM下一操作讀新policy；兩種採購／生管按原scope/priority分別判，不union | PG/DUAL；QA123-29/52 |
| QA058-10 | PDM停用C1或採購／生管，Org讀列表並嘗試新任用/推薦/代理 | 新增／擴權拒絕，既有人可見；alias與canonical狀態同步，其他角色及治理資料不被毒化 | U/API；UI/DUAL |
| QA058-11 | 從inactive列撤銷並發布，含舊生管原列 | 操作資格／原來源及audit正確，inactive不阻擋合法減權，不改其他任用；缺current時只依可信own原資料及既有guard | UI/PG；效果併DUAL |
| QA058-12 | inactive的direct＋delegated與另一active role並存 | PDM只停止停用角色能力，另一角色仍正常；v4 presence不是capability Allow，不因alias漏status | PG/DUAL；QA123-44 |
| QA058-13 | 恢復同ID；原有效／revoked／expired／錯scope／失效來源 | 只仍合法者可能再生效，不復活失效任用；角色restore不等於任用restore，legacy-only已撤舊列不以restore新增回授 | PG/UI/DUAL；QA123-44/52 |
| QA058-14 | manual/position_adoption調職、改職稱／部門、來源任職結束 | manual由人檢視、不自動授撤；position來源失效仍Deny；不依presentation/職稱改role或重寫原source | U/PG；雙端結果併整合 |
| QA058-15 | 恢復角色但代理/source已revoked/expired或scope不含 | 原來源鏈、subject及期間仍驗，無代理復活或scope合併；舊生管代理保持原identity | U/PG；DUAL負例 |
| QA058-16 | 同ID同內容/異內容/異actor、新CAS衝突、commit後換current/丟回應 | 合法replay先於新操作CAS；原結果可查，not_observed不當未commit證明；不新ID盲重送。PDM故障仍可查own commit，legacy缺結果不假造 | API/PG |
| QA058-17 | Org預檢後PDM先apply D2，Org才取current | 原expected tuple409，零half write、不force；新格式/profile不能被舊預檢省略 | PG雙連線/DUAL；QA123-30 |
| QA058-18 | Org先freeze D1，PDM再啟用停用角色的D2，Org完成 | 同操作只用D1context；其他guard成立可保存舊provenance，PDM下一操作依D2拒停用能力；不宣稱跨owner同時commit | PG/DUAL；QA123-30/44 |
| QA058-19 | current已freeze，actor撤權於writer等待時commit | 取鎖後fresh身份／資格fence拒絕、全部rollback；catalog context不凍結admission | 真PG雙連線 |
| QA058-20 | compatibility缺失／多列／NOT_READY／錯schema/profile/source | grouped-v2不能用v1 READY；PDM單一apply／首次rollout仍拒絕。已同意的證據重用不另核准，缺實際H1/H2/H3資料不以mock marker通過 | PG；真source與runtime併DUAL |
| QA058-21 | 自有NOT_READY初始化；PUBLIC/ownruntime/PDM/owner權限及revision | 正確14欄，僅精確SELECT；runtime不可寫table/DDL或繼承owner；owner CAS、manifest／初始狀態及forward migration符合邊界 | 原生PG/ACL；SQL改動才db-boundary |
| QA058-22 | dedicated system_admin、ordinary/selfgrant/另一Principal/workload | 原特權入口成功與負例邊界維持；hidden-protected不進一般選單，PDM管理員名字不給權，custom不能自授 | U/API/PG；真任用併DUAL |
| QA058-23 | 正常入口及loading/非空/明確空/error/inactive/history/conflict/pending、keyboard | 有來源/名稱/期間，inactive可撤銷，錯誤不假空；舊response不套新session。1440×900/1024×768/390×844首次受影響UI核對，390沿唯讀；無overflow/visibleerror | 真UI，畫面與操作記錄 |
| QA058-24 | 只讓task-owned Org管理API不可達，DB/IdP可用 | PDM正常業務仍沿SQLcontract無新增HTTP依賴；Org配人明示不可用，不開localACL。sharedDB/IdP失效另拒絕；只清自己資源 | DUAL；既有等價故障證據可重用 |

case17/18的D1/D2表示兩時序的前後版本；完整正常往返可用legacy→grouped A→B能力變更→C停用→D恢復，撤銷後再操作確認Deny。同一輪同時核對新任用只選procurement、舊production_planning保持、alias status同步，完成peer QA52所需主張，不另建第二套整合流程。

## 4. 單一驗證路徑與證據重用

**本節是DEV-058唯一驗證入口。** 沿既有工具依下列順序收集結果，不預先要求新test:dev-058、四個qc runner或自訂manifest/evidence格式。需要重現既有工具無法控制的安全時序時，才補最小fixture/helper，不能因精簡取消該時序案例。

| 步驟 | 使用既有入口／操作 | 何時執行與出口 |
|---|---|---|
| A 受影響回歸 | `npm test -- <相關測試檔>`；沿現有Vitest/API測試 | 改decoder／任用／API的正反例與原始失敗；不按固定16個檔名判完成。新增/移檔後重新對照case涵蓋 |
| B 資料與交易 | 既有task-owned PG harness／相關suite；必要時只補本slice fixture | SQL/ACL、CAS、audit/replay、fresh fence及17/18/19真時序。模擬producer只記其實際層，不當native雙端 |
| B SQL邊界／建置 | `npm run check:db-boundary`；`npm run build` | 實際SQL／boundary變更才跑前者；app/type/package改動或缺有效證據才跑build，不因docs變更重跑 |
| C 一次完整整合 | 兩個已具名授權的真owner、正常UI/API及versioned DB contract | 正常往返／別名／scope／撤銷與角色生命週期，含必要失敗，對照24案及peer29/30/44/52；不自動啟動或修改對方repo |
| C UI檢查 | 既有browser/CUA、正常工作台入口，受影響畫面與操作 | 首次七角色呈現／互動改動驗上述3viewport、鍵盤、錯誤與資料sanity；後續無關變更沿有效結果，不逐case重截全套 |

H1/H2/H3未交付或對方環境不可得，保留相應NOT_RUN／BLOCKED，不能把本地證據改標DUAL。只暫停受阻項，不因一個未用projection或無關歷史證據缺漏拖住獨立切片。

最少記錄：執行來源／相關輸入、環境及層級、actor/fixture別名、case ID、版本tuple、操作／SQL時序、實際結果及log／畫面／audit引用。可沿既有QC／發布紀錄，不建專用receipt平台。案例對應表可用同一段log支援多個ID；該案例需要的主張缺證據則不計PASS。沒有行為證據不因檔案存在、build成功或marker READY通過。

一般人控風險（調職後是否保留、人選是否適當、恢復前檢視）以現有就地提醒及管理者決定驗收，沒有第二人簽核、分數計算／逾期凍結測試前置。越權、撤銷／到期、scope、來源與資料完整性仍是系統拒絕條件。

暫時環境只用task-owned資料／process/tab，記PID/port及必要識別；結束確認自己資源與port清理，既有user runtime不碰。不得指向正式資料或由OrgMaster建寫siblingcore；runtime／雙端操作需在當時具名授權範圍。前一文件階段未啟動資源；本次隔離測試及清理見§6。

判定：必要主張及層級皆有證據才PASS；有反例FAIL並回修；缺部分證據未充分驗證；缺依賴／執行路徑BLOCKED或維持NOT_RUN。第一個有效失敗保留，修復後只重驗受影響範圍。

## 5. 前一文件階段自查（HISTORY_ONLY）

本輪只更新SPEC、此QA及直接索引／ADR；產品、PG／UI／雙端／正式驗證均NOT_RUN。文件自查檢查24個案例ID及原目的保留、peer v2/profile/alias與14欄宣告一致、交接未被假稱已完成、引用與Markdown及變更範圍；實際結果在本輪交付回報，不使用產品PASS標籤。

2026-10-19文件自查：24 ID唯一且與原版完全相同，直接引用檔存在、14公開欄與H1..H5齊全，diff whitespace正常；最後peer文件hash與SPEC記錄一致。只改既有五份Markdown，AGENTS原修改內容保持；這些結果不證明runtime／DB／UI或雙端相容已完成。

2026-10-12文件自查與原來的Implementation Ready註記是歷史；2026-10-19按人類指示修訂為精簡契約／peer待交接。未修改AI-PDM52案或歷史驗證，沒有更改AGENTS／required CI／release gate。

## 6. 本輪局部切片驗證

2026-10-19後續使用者授權本機修復；原§5的文件限定屬歷史。本節記錄當時既有九身份相容／撤權切片，不更改24案ID、目的或whole狀態；2026-10-21完整dynamic consumer增量另見§7。

- `server/orgmasterGovernanceReduction.test.ts`：實際owner publish產生snapshotHash/audit綁定；PDM current故障後正常HTTP工作台仍可讀（標unavailable），PATCH撤權及發布／同命令重送不讀live catalog；混合新增、restore、scope／期間／身份或內部資格變更不走減權捷徑。原發布重送回原版本，不誤報後續版本。
- `server/aiPdmRoleCatalogRepository.compatible.test.ts`：接受後續九身份能力內容版本，仍拒絕hash竄改、任用metadata、順序、protected變更；舊任用只有可信自有history才可續讀，同version不同hash拒絕。
- 原生PG案例由AI-PDM實際owner artifact builder產生A/B，再經真jsonb view由SELECT-only OrgMaster consumer讀取；直接core存取與DELETE權限拒絕。這是隔離SQL契約／ACL證據，不是正常雙端UI配人／L4或正式驗收。
- `GovernanceAssignmentActions.test.tsx`及`GovernanceCenter.test.tsx`：目錄不可用時保留撤銷／已撤列移除／發布入口；新增、restore及歷史activate仍受限制。這是DOM元件互動，不冒充實機browser／視覺QC。
- 原身分fresh actor、管理者連續性、既有v5/v6/v7、命令及API測試維持；型別與最終聚合回歸結果以本次交付紀錄為準。未改SQL或required CI／release executor。
- 第一輪曾發現future JSONB欄位順序被誤判、HTTP重複CAS擋合法重送；已修正並補回歸。PG唯讀view先回55000而非42501的oracle，改為實查DELETE privilege=false加實際拒絕；未改產品權限求PASS。

最終聚合：18檔、133 PASS／1 SKIP（未設定隔離PG連線時的原生案例）；同一原生案例另以實際AI-PDM builder與隔離PostgreSQL執行，9／9 PASS，不與聚合重複加總。TypeScript、前後端隔離build及既有DB boundary通過；Luna唯讀源碼審查未發現P1/P2，但未執行測試且不稱正式QC。AI-PDM builder自身7／7與既有v7 fixture檢查通過。

臨時PG僅本任務cluster與動態port，停止後確認port釋放並移除測試data；保留工具log。未操作既有或正式資料。該輪整體QA24、peer52、完整dynamic與正式啟用保持NOT_RUN／NOT_IMPLEMENTED；未執行真實browser、required CI或production驗證。後續source實作狀態以§7為準。

## 7. 2026-10-21 dynamic consumer本機證據

固定入口：`npm run test:dev-058:contracts`。它涵蓋dynamic v2 decoder、真實AI-PDM vector、current/history與舊任用provenance、角色/profile/lifecycle錯誤、指派tuple CAS、compatibility_v2 14欄及既有減權回歸。

| 執行 | 結果 | 支持的部分案例 | 尚缺層級 |
|---|---|---|---|
| `npm run test:dev-058:contracts` | PASS：7檔，37 passed／1 skipped | QA01–06、09–18、20–22的U/API/contract部分 | skip的原生PG、UI、DUAL |
| `npm run check:db-boundary` | PASS：25 governed files | QA21 source boundary部分 | migration/ACL實際readback |
| AI-PDM固定入口讀實際migration 034與v7 vector | PASS：Node contract 6/6；Vitest 48檔401/401 | QA02/03/20/21及H1～H3 source前置 | live DB與正常往返 |
| OrgMaster `npm run build` | PASS | app編譯與UI接線 | browser操作與視覺 |

### 較早本機快照（HISTORY_ONLY）

以下保留各輪source、失敗與當時待驗狀態；目前結果見本節最後「本輪續接」。

正式migration 034/035仍未套用，compatibility初始NOT_READY；AI-PDM正式086/087亦未套用且mode為DISABLED。H4還缺正常PDM新增角色→OrgMaster指派→PDM停用→OrgMaster撤銷→PDM恢復的真實兩端旅程；H5還缺DEV-058/123新fresh fence的原生競爭驗證、PDM剩餘caller target適配、具名環境owner readback及首次切換。這些只阻止依賴它們的完整案例與啟用，不抹除已通過的本機證據。
2026-10-21後續修正：PDM固定入口擴為25檔227/227＋Node4/4 PASS，actual component/mock API browser 10 checks/27 screenshots PASS；不當正常登入、OrgMaster browser或L4。native PG18 schema/ACL smoke及PDM最後build結果待補。新增fence與剩餘caller屬DEV058/123範圍，DEV121/122最新source已納基線，不能記成只等外部任務的阻塞。管理fence必須涵蓋撤權/quarantine及等待後identity/session/grant期限，見SPEC§11.3；全案仍In Progress。

歷史來源（01:09前版035/087，source hash見原報告）：2026-10-21 forward-only修正：staged DB boundary首次拒絕修改已提交034/086（即使未正式套用），原始失敗保留；未放寬checker。034/086已恢復HEAD原文，新增OrgMaster 035_dev058_ai_pdm_compatibility_definer_read.sql與PDM 087_dev123_role_policy_candidate_validation.sql。035只授PDM受控apply owner唯讀contract權；087補候選DB驗證及source profiles，僅在DISABLED/generation0且無dynamic publication時，以table lock復原086導入的衍生project_scope_key，pre-087分享保持NULL，tokens/packages/其他業務欄位不變，新分享仍由DB綁定且不可修改。正式執行仍在本任務排除範圍。新序列staged boundary已PASS（OrgMaster25／PDM25 governed files），原生PG18重驗已PASS（下段）。先前只改034/086的native PASS是舊source實驗證據，不移用成新序列PASS。


2026-10-21新035/087原生PG18 fresh replay PASS：實際PDM35項predecessor至085＋086/087，OrgMaster001–035；雙runtime跨app view read、PDM definer-owner view read及core/UPDATE拒絕、真builder正例與4個候選竄改負例、runtime helper EXECUTE拒絕、DISABLED apply拒絕、舊share新欄NULL且token/business欄不變、新share DB binding/immutable皆通過。保持NOT_READY/revision0與DISABLED/generation0；沒有fake READY/ENABLED。只用task-owned角色/既有native fixtures，Platform auth-session manifest是明示stub；不當Platform、PG17 release profile、positive enabled atomic apply、正常登入browser或L4證據。PID15844/port51601已停止、listener=0、scratch root移除。證據：output/qa/dev-058/native-pg-forward-only-20261021-010919/report.json（OrgMaster實作工作樹；同目錄保留兩phase原始log及native-pg-smoke.mjs）
035 SHA=0c94c9b7507be4b8bc10b1d91d5ab7024074780f0a2785a3a369779bc702f53f；087 SHA=7d0897bfd14087936edd5e88bff7ab291234f2f73e3db4cedd8cd464a2b80b6b。034/086逐byte等於原HEAD，未改已提交migration。舊source實驗及harness失敗保留；historical view的45列未刪，按baseline version驗9角色。

### 鎖後管理授權修正（2026-10-21，原生競爭待驗）

OrgMaster035新增 ai-pdm.role-policy-manager.v1 manifest 與兩個contract函式；PDM087新增受控apply鎖定helper。apply專用READ COMMITTED，所有等待後另一statement重新驗account、session、epoch、exact Principal/direct/global system_admin及identity-link/grant/session期限。一般business request不新增policy鎖，create/save維持原隔離，沒有人工簽核。

新source固定入口：PDM Node4/4＋Vitest25檔227/227 PASS；OrgMaster5檔29 PASS/1 SKIP；typecheck、route map及雙邊staged DB boundary PASS。本次fresh-fence app隔離build PASS（126頁、artifact/primary/cleanup=true）；新source原生schema/ACL/validator smoke PASS（下段）；manager正向與鎖等待撤權/到期競爭仍NOT_RUN，不把01:09舊source證據移用成fresh fence PASS；whole52/24與正式環境維持未完成。

新source原生PG18兩段smoke已PASS：034/035、086/087、雙邊runtime SELECT、owner SELECT與foreign core/UPDATE拒絕、真builder候選與4個竄改負例、runtime helper拒絕、DISABLED apply拒絕及share binding/immutable。035 SHA=80ae5123812f9909ca17b2581fe2638576cf182905bc11761f937595ec9271ee；087 SHA=8ce23faf5e6bc3ca05d7e497ba9d3da5d1ca1394467d4e124c22e6b744750012。首次resume未使用PDM cwd/alias loader而ERR_MODULE_NOT_FOUND，原log保留；改用既有loader重跑，沒有為此改產品。證據統一在OrgMaster實作工作樹 output/qa/dev-058/native-pg-manager-schema-20261021-0133/report.json；包括4份原始logs與runner。PID41724/port61062及首次PID46188/port55237均已停止/釋放，task cluster已刪。

這是schema/ACL/validator smoke，不是新manager資格正例或鎖等待撤權/identity-link到期競爭，也未執行positive ENABLED apply、正常雙端browser或正式L4。NOT_READY/revision0、DISABLED/generation0不變；首次失敗與01:09舊source證據未改寫。


### 本輪續接（2026-10-21，0254）

本輪本機可整合實作目標已達成；DEV-058／DEV-123整案仍 In Progress／正式 rollout disabled。

| 現行入口 | 實際結果與證據範圍 |
|---|---|
| OrgMaster test:dev-058:contracts | 7檔37 PASS／1 SKIP；包含三類發布入口、JSONB roundtrip、legacy／未知hash格式及減權／舊draft回歸。SKIP是未帶獨立PG環境的原案例；另有下列native實證，不改其原SKIP旗標 |
| AI-PDM test:dev-123:contracts | 48檔401 PASS＋Node6 PASS；typecheck／route map亦PASS，真實v7 vector及35／14欄契約一致 |
| Build／DB boundary | PDM0227 isolated build PASS（126頁、artifact/primary/cleanup=true，主SQLite原本不存在且仍不存在、容量lease已釋放）；OrgMaster final audit-id build PASS；另有受影響governance store/API/command三檔32 PASS；最終staged DB boundary PASS（OrgMaster25／AI-PDM26 governed files），diff/cached diff check均PASS |
| 隔離PG18 | actual PDM service create/save/preview/apply、同ID併發／重播、draft CAS、stale base與末端audit故障rollback PASS；actual OrgMaster decoder／v2-fenced指派與發布／PDM evaluator完整角色生命週期PASS |
| Targeted browser | OrgMaster actual GovernanceCenter＋adapter/mock API：8 checks、9 screenshots（自訂角色、普通配人隔離system_admin、expectedCatalog tuple、inactive可撤銷、390唯讀與1440/390無overflow）；PDM role editor：10 checks、27 screenshots，share page：4 cases、4 screenshots。正常登入／HTTP全旅程不在此主張內 |

OrgMaster畫面直接證據：實作工作樹 output/qa/dev-058/ui-targeted-20261021/ui-targeted-results.json，使用actual consumer驗證frozen v7與domain-builder inactive fixture；原harness失敗log保留。

Native直接證據：OrgMaster實作工作樹 output/qa/dev-058/native-pg-bilateral-audit-id-20261021/report.json（最新共用append guard與最新PDM主線後重驗）。正常domain命令完成PDM新增角色→OrgMaster任用→PDM停用且立即不授權（Org任用歷史保留）→Org撤銷→PDM恢復且不復活任用→Org明確恢復，PDM才重新允許；最後generation=3。任用寫入走actual applyDraftCommand／publishGovernance與identity-fenced v2 writer，沒有用owner DML直接改測試中的任用。初始化workspace／governance／READY／ENABLED是明示owner fixture，Platform auth-state是stub、session為合成；不是正常HTTP／登入browser／Platform／PG17 release／production proof。先前八次執行保留於 native-pg-bilateral-20261021-final/report.json；最新第9次因harness缺PDM_DATA_DIR而失敗，第10次只補task-owned資料目錄後PASS，沒有為此改產品。原始log、實際來源hash及兩個PID/start token／port／task root清理readback均已保存。

這輪實證找到並修正JSONB key重排造成的歷史來源誤拒。新V3 publication與audit使用optional hashFormat=orgmaster.sorted-json.v1，先JSON value roundtrip再排序object keys，array順序保留；三類TS publisher均在同交易補綁版本ID／snapshotHash的audit；版本綁定使用獨立UUID commandId，原business commandId／auditReference／receipt不改。共用append在同一write lock／transaction拒絕任何已存在commandId；實際FMS重用內部publication ID回COMMAND_ID_REUSED且零寫入，原命令重送仍回原receipt。無marker的舊版本及audit沿原exact hash，unknown marker拒絕；commandHash／舊commands.canonicalJson、已套migration與舊receipt未改。部署前須唯讀確認既有未標記V3 audit是否含巢狀detail.scope等資料且仍能通過原exact chain驗證；若JSONB排序已失去原preimage，需先另行處理相容性，不以新marker補算或放寬舊驗證；本輪未讀正式資料，不能假稱已確認無此舊資料；既有bootstrap／rekey producer保持legacy且未執行。Legacy catalog metadata只忽略object key順序，欄位集合／值及array順序仍須完全相同。

純減權發布依actual isGovernanceReduction與owner-bound歷史驗證，不把舊stored generation當live catalog CAS；新增／恢復仍驗current tuple、fresh actor及revision。切換active version時，舊draft只能用可信owner歷史證明可讀；authority仍取已發布版本，draft不能自行授權。

PDM已補submission list/detail/search的canonical group與分頁前過濾、原檔／ZIP逐成員view+download及storage前後重驗、numbering export讀取的實際內容群組、Preview／recognition完整verified initiator及worker當前Principal/session/grant／實際來源重驗。088保留舊job NULL且提醒重試；089將transfer metadata綁定新registry hash。Org035與PDM086～089只套於task-owned PG18，正式migration／資料／部署／traffic／IAM／Secret均未操作；source初始仍NOT_READY/revision0及DISABLED/generation0。

尚未關閉：正常登入HTTP/browser旅程、20action全部caller與CG01/02逐案驗收、QA24/52完整case closure、required CI及另行授權的正式首次切換。上述局部PASS只支持實際層級；不以mock browser或native synthetic session冒充正式L4。DEV121/122最新遠端main=02239aaeaac82702bbc8c4d58b38d47fca051afe已合入PDM分支540a0013b3bc8dbb6f4751f15d87494c159126f5；這次主線差異只有兩個release-recovery程式／測試，app／worker／SQL未變。任務120條path在合併未改，0227 build的app輸入維持，無須重建；先前77檔raw SHA保存紀錄仍是歷史證據。同範圍待驗不推成外部任務阻塞。

## 8. 2026-10-21 正常旅程續接與逐案狀態

本次沿用既有隔離分支與有效證據，不操作正式環境。下表的 PASS 只代表該案原定必要主張已取得證據，不表示整案 DEV、正常登入或正式驗收完成；PARTIAL 不是 NOT_RUN，也不計為完整關閉。

共用證據：

- **U**：固定 `test:dev-058:contracts` 與原有回歸；本次補 `server/aiPdmDynamicRoleCatalog.test.ts`，含實際 PDM builder 產生的 64 身份正例、19 種獨立非法 identity/scope/profile/alias/protected 負例，共 26 PASS。新邊界向量的 provenance 記 producer source hash，不改原 v5/v6/v7 vectors。
- **N**：§7 的 `native-pg-bilateral-audit-id-20261021/report.json` 及原生 manager/schema/ACL 報告。可重用未改的 SQL、policy service 與角色生命週期主張；合成 session、Platform stub、bootstrap owner fixture 的限制保持，不改稱正常登入。
- **V**：§7 的 targeted browser 報告；使用真實元件、mock API，不能完成正常導航、真 SSO 或全雙端 UI 主張。
- **S**：`output/qa/dev-058/normal-journey-20261021/` 保存真 Chrome 的 Cookie before/after、兩端 actual SSO start 薄型 HTTP probe、SSO guard 測試及來源 hash。兩端原本 HTTP 使用缺 Secure 的 `__Host-jenfu_sso_tx`，瀏覽器皆未帶回；修正後 local name 分別為 `orgmaster_sso_tx`／`ai_pdm_sso_tx`，皆已帶回。HTTPS 仍用 Secure 的原名稱，callback 不讀 local-name fallback。OrgMaster SSO/config 13 PASS；PDM SSO 16 PASS。probe 沒有 callback、IdP、broker exchange、DB 或 session issuance，**normalLogin=false**。

下表 ID 欄為 QA058 的編號尾碼；分母仍 24。

| ID | 狀態 | 已有證據／確切缺項 |
|---|---|---|
| 01 | PARTIAL | U/N 可讀 legacy、保持 bytes/hash；完整舊治理／audit 資料組尚未逐組關閉 |
| 02 | PARTIAL | U 的 9..64 與完整 profile、N 的真 JSONB mapping、V 的七角色/custom；正常 UI 併23仍缺 |
| 03 | PASS | U 拒絕內容/hash/schema/profile/來源及 self-consistently rehashed identity 竄改，無 fallback；N 實際 producer→versioned DB contract→Org reader 已成功，未以 DB 自報 hash 當唯一驗證 |
| 04 | PASS | U 包含缺 builtin、重複 ID/code/name、65 列、custom principal/global/metadata/code、alias/status/profile 與 protected 負例；64 正例排除一律拒絕的假通過 |
| 05 | PARTIAL | U 的可信舊 history、N 的 custom provenance；原採購/生管各 scope/priority/改名的原生組合仍缺 |
| 06 | PARTIAL | U 的 missing history／錯 identity／same version different hash；相應真 DB 來源失敗仍缺 |
| 07 | PARTIAL | 既有 API 身分/資格拒絕；真 post-wait admission 併19未執行 |
| 08 | BLOCKED | N 有 actual domain 角色往返；缺非正式 SSO 設定與正常登入 UI/API 完整旅程 |
| 09 | PARTIAL | U 能力版本相容、N inactive 後下一判權拒絕且任用不改；採購/生管 A→B 能力變更整組仍缺 |
| 10 | PARTIAL | U 阻止 inactive 新增/恢復/推薦；N 停用與 V 既有列可見；正常兩端新任用/代理與 alias 組仍缺 |
| 11 | PARTIAL | N actual Org command 撤銷/發布及 PDM deny、V inactive 可撤；舊生管與缺 current 組尚未完整合驗 |
| 12 | PARTIAL | U 有 inactive skip 與另一 active role；direct/delegated/alias 混合原生結果仍缺 |
| 13 | PARTIAL | N 同 ID 恢復不復活已撤任用、明確 Org restore 才恢復；expired/wrong-scope/invalid-source 與正常 UI 仍缺 |
| 14 | PARTIAL | 原人控提醒/來源 guard 證據可重用；實際調部門及職稱、manual/position 兩組原生旅程仍缺 |
| 15 | PARTIAL | 既有 U 驗來源鏈/scope/期間；原生 revoked/expired delegation 與恢復後雙端負例仍缺 |
| 16 | PARTIAL | U/API replay/reuse/CAS，N concurrent/replay/command readback；Org commit 後 drop HTTP/換 current 整組仍缺 |
| 17 | NOT_RUN | 尚未執行 Org preflight D1→PDM commit D2→Org 取 current 的真雙連線順序；不能用 U stale tuple 代替 |
| 18 | NOT_RUN | 尚未執行 Org freeze D1→PDM D2→同 Org writer 完成的真順序；正常逐步 lifecycle 不等同重疊 |
| 19 | NOT_RUN | 尚未執行 Org writer 等鎖時撤權並 commit 的競爭；既有 PDM apply-manager fence 證據不是此案 |
| 20 | PARTIAL | U compatibility 矩陣與 N NOT_READY/DISABLED；缺全部 invalid marker 的原生拒絕及正常 source/runtime readback |
| 21 | PARTIAL | 真 PG18 034/035、14 欄/manifest、NOT_READY/revision0、雙 runtime/owner SELECT 與 foreign core/UPDATE 拒絕已驗；完整 PUBLIC/inherited/owner-CAS 負例尚未全部對照。不額外要求 production 或 PG17 |
| 22 | PARTIAL | U/API exact Principal/global、hidden profile、custom 不自授；全組真 privileged 任用與雙端結果仍缺 |
| 23 | PARTIAL | V 有 1440/390/custom/inactive/tuple/no-overflow；仍缺正常登入導航、1024、keyboard 及 loading/empty/error/history/pending 全組 |
| 24 | NOT_RUN | 尚未執行僅停止 Org HTTP、保持 DB/IdP 的真雙端業務故障旅程；source 無 HTTP 依賴不算運行證據 |

目前完整關閉 **2/24（03、04）**；其餘沒有刪除或改寫預期目的。PDM 的52案／17AC／CG01/02保持獨立追蹤。

### 環境限制與續接順序

非正式 SSO broker/IdP 設定與測試帳號尚未提供；本機 Platform DB URL 空白，沒有可沿用的非正式 auth runtime。不得改用正式 session 或 demo/quick-login 冒充 Principal 正常登入。待提供非正式入口及既有測試帳號識別後，沿正常入口完成08/23及 peer 29/30/44/52；不需提供密碼到文件或聊天。

C 槽約13 GiB，Governor `dev058-dev123-auth-http-qa-20261021` 回 EMERGENCY；已依 skill 只讀盤點，沒有可安全執行的清理候選，未繞過。Next/Vite build/runtime compilation 尚未啟動；先前一次容量風險接受不適用此請求。需先釋放空間或指定其他足夠容量的本機磁碟，再重新檢查相同容量請求。普通 source 修改與有界小測試已繼續；新 app source 的完整 build 待驗，不能把舊 build 標成此次修正後 PASS。

正式 migration、部署、正式資料寫入、traffic/IAM/Secret 均未執行。SQL 未改；本次不因文件/SSO修改重跑未變的 migration 或 release executor。
