# DEV-058：動態角色與集中指派驗證計畫

修訂：2026-10-21。Owner：`ORGMASTER/DEV-058`；來源：`AIPDM/DEV-123#orgmaster-compatibility`。
依據：[唯一SPEC](../specs/DEV-058-federated-role-catalog-central-assignment.md)；對齊grouped-v2／七日常角色／九歷史身份／alias及compatibility_v2。
狀態：`Local Contract Slice Verified / Full Case Closure Pending`。2026-10-21本機結果見§7；24案仍需依各自必要層級關閉，不等同完整dynamic驗收。
**保留QA058-01..24原ID及安全／功能目的；完整case closure仍0/24，全部維持NOT_RUN。** §7的單元/契約斷言只作部分層級證據，不提前填整案PASS；AI-PDM固定52案獨立，QA123-29/30/44/52的真consumer要求仍有效。

本版取代四個專用runner、固定16檔、獨立versioned evidence JSON及重複逐層證明的前置。使用同一次可信操作支援多個案例，補受影響部分；沒有該層證據的案例仍不能PASS。2026-10-19文件階段沒有產品操作；2026-10-21已執行本機契約/單元、build與DB boundary，仍沒有原生PG migration、browser、故障注入或L4，且不稱獨立QC。

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

所有案例的完整關閉狀態均NOT_RUN；「U/PG/UI/DUAL」是各主張所需層級。§7已取得的U/contract證據可被後續案例重用，但必要PG/UI/DUAL主張未被證明時仍不計整案完成。

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
| `npm run test:dev-058:contracts` | PASS：5檔，28 passed／1 skipped | QA01–06、09–18、20–22的U/API/contract部分 | skip的原生PG、UI、DUAL |
| `npm run check:db-boundary` | PASS：24 governed files | QA21 source boundary部分 | migration/ACL實際readback |
| AI-PDM固定入口讀實際migration 034與v7 vector | PASS：Node contract 3/3；Vitest整體69/69 | QA02/03/20/21及H1～H3 source前置 | live DB與正常往返 |
| OrgMaster `npm run build` | PASS | app編譯與UI接線 | browser操作與視覺 |

migration 034仍未套用，compatibility保持NOT_READY；AI-PDM migration 086亦未套用且mode為DISABLED。H4還缺正常PDM新增角色→OrgMaster指派→PDM停用→OrgMaster撤銷→PDM恢復的真實兩端旅程；H5還缺DEV-121／122精確多資源target action、具名測試環境、owner readback及首次切換。這些只阻止依賴它們的完整案例與啟用，不抹除已通過的本機證據。