# DEV-058：動態角色與集中指派驗證計畫

日期：2026-10-12。Owner：`ORGMASTER/DEV-058`。來源：`AIPDM/DEV-123#orgmaster-compatibility`。
依據：[唯一 SPEC](../specs/DEV-058-federated-role-catalog-central-assignment.md)。
狀態：`QA Plan Defined / RD Implementation Ready Aligned / Documents Only`；QA058-01..24 全部 `NOT_RUN`。本輪只補固定runner／schema／DDL負例計畫，沒有執行產品測試、PG、browser、停機或正式操作；文件自查不是產品QC。

## 1. 範圍、角色及資料

驗證 OM-C1..4，維持原 B058-01..08 驗收方向。AI-PDM 的 44 案、QA123-29/30/44 與本 DEV 分母各自獨立；OrgMaster 不能因 mock PDM 宣告 true producer-consumer 或 peer L4 完成。

角色：
- O-MANAGER：當前合法 OrgMaster治理 manage/simulate/publish；正常任用入口。
- O-READ：只讀管理者，無 mutation；O-PRIV：既有 exact privileged Principal 特權資格。
- P-EDITOR：PDM 當前 direct global system_admin／human_privileged；P-DAILY：同 Employee 的 daily Principal，不能替代特權。
- E1/E2 為 active Employee，E3 inactive；其 ID及Principal由隔離 fixture 正常 owner 機制建立。上述是別名，不指定正式員工或帳號。

fixture 群組：
| 名稱 | 前置內容 | 邊界 |
|---|---|---|
| F-L | 合法 legacy active v5/v6/v7、既有九身份、原 hash、舊任用及audit | 不以 source v7 猜正式 baseline；不同已支援legacy另參數化 |
| F-D | producer受控profile/vectors；D1新增C1並授至少一個合法editable能力、D2能力改變、D3停用、D4同ID恢復，保留完整tombstones/history | 至少連續兩版，正常發布由PDM正常UI/API建立；零能力custom不可被測成Allow。純validator負例可fixture建立 |
| F-A | 同一角色的有效、撤銷、到期、scope錯誤、position來源失效與代理任用 | 測試對象指派由 OrgMaster 正常流程建立；不能 seed 預期發布成功結果 |
| F-C | NOT_READY／READY、來源binding、最小ACL及wrong多列/格式 | PG simulator只證明契約負例，不證明 live consumer 已升級 |
| F-R | 可控制先讀catalog／先activate／撤權／回應遺失的隔離 transaction案例 | 必須記SQL/操作時序及freeze tuple；不對正式環境注入故障 |

shared PG test物件各由自己owner建立，僅經versioned contract。Org單repoPG simulator以own測試物件＋test-onlyQueryable adapter供catalogfixture，不建立任何siblingcore／原生producer表，不能沿用會建ai_pdm_core的歷史DEV-057fixture當本DEV命令。兩owner原生producer／contract時序屬DUAL，需另外人類授權。

## 2. 證據層級與正常交付

| 層級 | 能證明 | 不能代替 |
|---|---|---|
| U：unit／contract fixture | canonical、metadata、validation、DTO、錯誤語意 | 真PG／正常入口／雙端／正式 |
| PG：task-owned disposable PostgreSQL | writer fence、transaction、CAS、current/history view、ACL | browser及實際對方runtime |
| UI：OrgMaster正常入口與實際API | 新增、發布、撤銷、歷史與viewport／keyboard | PDM protected operation的結果 |
| DUAL：兩個真實owner runtime及契約 | 角色policy→Org指派→PDM使用／停用／恢復 | 原source QA所要求的正式L4 |
| PROD：另有明確owner/environment/action授權的目標環境 | 該source／角色／路徑的正式行為 | 其他app、全DEV或歷史所有案例 |

正常路徑：PDM「設定→流程→角色與權限」建立／啟用 C1 → OrgMaster工作台「角色指派」選C1/E1/scope/期間 → 發布頁預覽及發布 → PDM正常登入與protected操作。角色停用／恢復由PDM正常UI，撤銷由OrgMaster正常UI。direct URL、seed、DB mutation或fixture畫面不能替代這條交付路徑。

UI記錄1440×900、1024×768及390×844；窄版依DEV-033唯讀。記actor／Principal、URL與起始入口、source/dirty boundary、fixture ID、版本tuple、正常操作、可見結果、截圖及console/API error。不存在預期空fixture時，空白角色清單／全零critical count為失敗。

## 3. FMEA 與先找失敗的案例

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／案例 |
|---|---|---|---|---|---|
| custom遭拒 | 固定九reader | 新角色無法配人 | 合法第十角色讀取／配人 | P1 | format decoder；02/08 |
| protected/profile未驗 | 只放寬數量 | 偽造特權／錯角色 | hash／template負例 | P0 | 受控profile；03/04/22 |
| inactive使整份失效 | 將歷史當新任用驗 | 撤銷被阻、其他角色受累 | inactive讀取及撤銷 | P0 | intent分離；10/11 |
| provenance改寫／混版 | current代替history | 原任用失效／歷史失真 | 原bytes/hash／版本比對 | P0 | trusted history；05/06/09 |
| 操作混catalog | RC多次取active | 並行結果不一致 | 雙連線兩時序 | P0 | operation context；17/18 |
| actor也被freeze | 捕捉舊資格 | 撤權後仍commit | 等鎖後撤權 | P0 | fresh writer fence；19 |
| READY僅marker | 缺live source證據 | 舊reader誤啟用 | static-only/ACL負例 | P0 | owner evidence；20/21 |
| 警告隱藏／假空資料 | UI或依賴狀態混淆 | 誤配／不能撤銷 | error sweep/keyboard/viewport/sanity | P1 | 就地風險狀態；23 |
| 管理API停機拖停PDM | 新增HTTP授權依賴 | 業務不可用 | 只隔離OrgAPI | P1 | SQL權威／不增加callback；24 |

## 4. 固定案例

下表所有操作均為未來QC計畫，結果一律 NOT_RUN。表中的操作資格、fixture與層級為必要前置；不足時判未充分驗證／阻塞，不縮小判定。

| ID | 前置及操作 | 預期／失敗判定 | 層級／對照 |
|---|---|---|---|
| QA058-01 | F-L；讀支援legacy current及治理歷史 | 原bytes/hash／九身份可驗，原audit與任用未變；未部署v7不能被猜為active | U/PG；B058-01/05 |
| QA058-02 | F-D；合法9..64角色含custom及inactive | header/prefix/template/status完整，decoder接受並供UI顯示 | U/PG；B058-01 |
| QA058-03 | F-D改role/status/content hash、canonical排序或sidecar | 拒絕錯payload，不降級static或補另一版本 | U/PG；B058-06 |
| QA058-04 | 缺builtin/重複ID/code/name/65角色/非法scope/custom特權 | 拒絕，不接受越界或物理DELETE；system_admin必須合法active | U/PG；B058-06 |
| QA058-05 | F-A原catalogVersion與current不同，history完整 | 可信原snapshot合法，能力變化不要求hash與current相等；原provenance不回填／改寫 | U/PG；B058-05 |
| QA058-06 | history缺失、同version多hash、身份不符 | 契約錯誤；顯示來源不可核實，不以name/code或clienthash保底 | U/PG；B058-05/06 |
| QA058-07 | O-READ/O-MANAGER/O-PRIV及P-DAILY各送read/write | 原資格界線維持；無資格403或session失效401，body actor不能提升資格 | U/API/PG；B058-06 |
| QA058-08 | P-EDITOR正常建立啟用C1；O-MANAGER正常選E1、配人、發布 | PDM protected操作實際依scope/能力Allow；UI顯示草稿／已發布，不靠seed造結果 | UI/DUAL；B058-02、QA123-29 |
| QA058-09 | 已有C1任用，PDM啟用D2只改合法能力 | 不改Org任用snapshot/audit/ID；PDM下一操作讀新能力 | PG/DUAL；B058-05 |
| QA058-10 | PDM停用C1；讀Org列表並嘗試新任用／代理 | 原人員可見，新增拒絕422/invalid；其他角色仍可讀可用，不毒化whole document | U/PG/UI/DUAL；B058-03 |
| QA058-11 | O-MANAGER由inactive列撤銷既有任用並發布 | 撤銷成功、audit來源正確；inactive不阻擋撤銷，沒有修改其他任用 | UI/PG/DUAL；B058-03 |
| QA058-12 | C1 inactive、原direct＋delegated及另一合法角色 | PDM不授C1能力，另一角色按既有priority/deny規則判權；v4presence不被單獨當Allow | PG/DUAL；B058-03、QA123-44 |
| QA058-13 | 恢復同C1，原有效、撤銷、到期／錯scope／失效來源各一筆 | 只仍合法者可能恢復；撤銷／到期者不復活，不新增／rewrite任用；不把角色恢復混為指派重新啟用 | PG/UI/DUAL；B058-04、QA123-44 |
| QA058-14 | manual與position_adoption，改職稱／部門及結束來源任職 | 改名不改role；manual不連帶撤銷，來源失效維持既有denial | U/PG/DUAL；B058-05 |
| QA058-15 | 恢復inactive source後代理仍expired/revoked或source revoked | 不恢復已失效代理；原scope、subject、來源鏈完整驗證 | U/PG/DUAL；B058-04/05 |
| QA058-16 | 同commandId重播、同ID改catalogbinding、治理revision stale、commit後current換版及回應遺失；GET /commands/{id} | 當前資格下原結果可查／同內容replay，已commit不被新catalog否認；not_observed不當成未commit證明；異內容及新操作CAS衝突拒絕，不盲目新ID | API/PG；B058-07 |
| QA058-17 | 預檢D1；PDM D2先activate，Org後取catalog／送write | 舊expectedtuple拒絕409，保持未提交輸入；沒有half write | PG/DUAL；B058-07、QA123-30 |
| QA058-18 | Org先freeze合法D1；其後PDM D2停用C1，再完成Org交易 | 同操作只用D1context；若其他fence成立可保存D1provenance，PDM下一操作仍依D2deny | PG/DUAL；B058-07、QA123-30/44 |
| QA058-19 | catalog已freeze後，actor/lifecycle撤權在writer等待期間commit | fresh post-lock／precommit fence拒絕，整筆回滾；catalogfreeze不替actor授權 | PG；B058-06/07 |
| QA058-20 | missing/多列/NOT_READY/wrongprofile/source相容宣告 | PDM拒絕publish/activate／enablement；真consumer不足不能只靠READY過關 | PG/DUAL；B058-06、QA123-28 |
| QA058-21 | readiness NOT_READY預設；測PUBLIC、ownruntime、PDM、owner ACL | 僅精確SELECT；只有owner維護，runtime不可UPDATE/core/DDL；active/history/grants owner隔離 | PG；B058-06 |
| QA058-22 | dedicated system_admin；ordinary/selfgrant／同Employee另一Principal/workload | dedicated合法路徑及v4subject資格維持；其餘拒絕，不借custom自授 | U/API/PG/DUAL；B058-06 |
| QA058-23 | 正常入口、loading/非空/明確空/錯誤/inactive/history/conflict；三viewport及keyboard | 名稱/來源/期間可辨，inactive可撤銷；無未預期visibleerror/假空/overflow，手機唯讀 | UI；B058-01/03 |
| QA058-24 | Org管理API不可達，sharedDB/IdP仍可用；PDM正常業務及Org配人 | PDM無新增OrgHTTP依賴，既有操作依SQLcontract；配人清楚不可用，不開localACL。sharedDB故障另判拒絕，不能宣稱全獨立 | DUAL；B058-08 |

schema/ACL視為行為：需實際effective privileges與負例；GRANT文字不是PASS。case18允許合法舊provenance不是把舊能力帶入runtime；若實作把D1能力當D2authorizingcache即FAIL。

## 5. QC 固定入口與結果紀錄

固定package scripts／完整16檔unit命令及runner輸入以[SPEC§10.1](../specs/DEV-058-federated-role-catalog-central-assignment.md#101-實作檔案順序與固定驗證入口)為唯一來源，RD實作時建立，本輪不修改package/scripts/tests、不執行。以下是後續固定執行順序，命令缺失／無測試／skipped不能當PASS：

```powershell
npm run test:dev-058
npm run qc:dev-058:contract
npm run qc:dev-058:postgres
npm run qc:dev-058:browser
npm run check:db-boundary
npm run build
# 兩owner具名授權與真實runtime完成後才可執行：
npm run qc:dev-058:dual -- --manifest=output/dev-058/inputs/dual-owner-manifest.v1.json
```

local aggregate `qc:dev-058`只含unit/contract/PG/browser，不含DUAL／PROD，不完成peer QA123-29/30/44。既有build內含tsc，無typecheck script。PG／UI環境限task-owned；runtime cleanup／origin／profile/evidence manifest schema沿SPEC。

| 固定案例群 | executor及必要補充 | 通過資料 |
|---|---|---|
| 01–06 | contract＋unit＋PG simulator；active profile/root/vector來源核實 | original bytes／canonical bytes／hash；current19+9欄及metadata mapping；history同version唯一hash；未知欄／null錯誤／UTF／順序／64邊界拒絕；GET新header／舊client409及write body discriminator |
| 07／22 | API/store／privileged現行負例，PG writer fence | body actor不授權，另一Principal、workload、self grant、ordinary system_admin拒絕；既有特權workspace/schema與AAL保留 |
| 08–15 | 正常UI與DUAL，並行存留／恢復／scope／delegation | unchanged published snapshot/audit；角色inactive與assignment revoked不同；restore ID-only及legacy provenance；removal無引用／歷史不刪 |
| 16 | command-query新測試與API、PG；commit後drop HTTP／改current；legacy audit／noop／不同actor／同ID異payload | complete原result及HTTPstatus；replay先於new CAS；own可讀而PDM不可達仍查commit；not_observed不換ID；new audit hash含result／舊event hash不變 |
| 17–19 | PG雙連線時序＋DUAL native producer | SQLstatement freeze兩順序／取鎖後撤權／fresh writer fence；no mixed-context。simulator不填真producerPASS |
| 20–21 | own新migration、native information_schema/ACL及runtime負例 | 12公開欄順序／NOT_READY／owner/PK/CHECK／COALESCE缺discriminator拒絕、manifestbytes；PUBLIC/sibling/DML拒絕；明確legacy-v1/flexible-v2及startup負例、view故障不fallback、READY source/profile/evidence gate |
| 23 | browser正常工作台入口、keyboard、3viewports、session切換／pending | screenshots/route/roles/CTA/error sweep/data sanity；390唯讀、無溢出；舊response不套到新Principal |
| 24 | explicit雙端授權後僅停止verified Org API task-ownedtree；DB/IdP仍可用 | PDM正常protected操作/SQL權威繼續；Org配人明示不可用；sharedDB故障另denial；cleanup與port釋放 |

DDL補充負例：角色不存在、profile占位hash、非法baseline/protected、NOT_READY帶ref/binding、READY缺完整binding、stale compatibility CAS／bigint overflow、重跑shape漂移及appliedmigration變更均拒絕；runtime不得直接table／列DML或繼承migrator。DDL設計的owner typed validator需驗full binding，DB CHECK discriminator不等於完整owner證據通過。

開始temporary runtime前記專案、purpose、port、process tree、資料目錄／mutation scope及cleanup條件；結束時只清理本task所有的process／UI與port。AI-PDM runtime、測試、修改與跨repo整合需具名專案／動作授權，文件來源引用不構成授權。

每個結果至少記：QA ID、source revision及dirty boundary、artifact/fixture hash、環境、actor／Principal、API/route/viewport、catalog current/history tuple、操作或SQL順序、before/after、audit/receipt/denial、判定及失敗證據。不得把unit、simulator或build的PASS填入UI、DUAL或PROD欄。

固定判定：
- PASS：指定層級及正常delivery path符合預期；UI另有可見錯誤掃描、資料sanity及畫面證據。
- FAIL：unexpected Allow/Deny、丟失歷史、inactive阻斷整份、混版、半寫入或正常入口不可用；回RD，變更後重驗受影響案例。
- 未充分驗證：只驗部分層級或無必要UI／雙端證據；產品維持未驗收。
- Blocked：source/fixture/runtime/權限或實作路徑不可得；先只讀定位有效阻擋，不推測使用者缺條件。

## 6. 本輪文件狀態

QA058-01..24及peer必要整合均NOT_RUN。固定DTO/preimage／readback／own DDL／runner／資料及證據契約已對齊SPEC的RD Implementation Ready；腳本及fixture仍由後續RD建立。無產品／PG／UI／雙端／正式PASS。

本輪RD文件自查：QA24 ID唯一且連續；SPEC／QA直接local links存在；fence成對、無trailing whitespace；新readiness view的12欄與DEV-123§7.2逐欄一致；DEV/map/ADR成熟度已同步；tracked文件git diff --check無錯。工作樹修改範圍為本DEV的五份Markdown，未新增SQL／JSON schema／runner／tests、未執行產品驗證。這些只證明文件結構及契約對照，不是QC／runtime正確性或owner啟用證據。

使用思考習慣：#可驗證性、#證據基礎、#多層次分析
