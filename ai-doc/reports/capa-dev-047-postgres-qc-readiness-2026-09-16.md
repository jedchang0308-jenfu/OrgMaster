# DEV-047 PostgreSQL QC 實作缺口與阻擋原因誤判 — CAPA 方案

## 1. 狀態與結論

- CAPA ID：**未編號 CAPA（既有 DEV-047 內結案）**。未另占正式流水號；若日後需納入正式 Register，再以本文件與 Git evidence 登錄，不回頭阻擋本次工程結案。
- 文件成熟度：`CA/PA Implemented / Effectiveness Verified / Closed`，限本文件已確認的 R1～R3 與改善措施；不等於 DEV-047 production release 已完成。
- 工作狀態：C0、CA1～CA3、PA1～PA3 已在同一修復批次完成；V1～V3 於 2026-09-16 通過，因此本 CAPA 結案。
- 日期／專案：2026-09-16／OrgMaster。
- 來源：使用者要求釐清「未提供 disposable DB」是否推翻既有正式／測試架構，查證後要求制定 CAPA，再依技術審查要求「優化 CAPA」，希望快速結案。
- 問題類型：驗證工具未完成、阻擋原因分類缺口、部分驗證證據失真。
- 後續責任：無 CAPA 未完成工程項；DEV-047 後續 production migration／release 仍依原 release gate，不能把本機 evidence 當 release authority。
- 下一個動作：回到 DEV-047 原交付流程；不新增 CAPA 觀察期、簽核或另一張 DEV。
- Register evidence：無；本文件不是正式立案紀錄。未來要求正式登錄時，須先查明專案唯一 Register 與 Git 歷史再發號。

**結論：保留既定資料庫分工與隔離測試底線，補齊工程能力及可信回報；不增建永久資料庫、不重做平台、不新增人工核准關卡。**

## 2. 不符合事實、影響與證據

問題查證基線：`master@eb0d6bd22c6c55f3f0612f5058e60d7afca661b0`。E1～E6 保留為修復前事實；結案證據另見第 6 節，仍不是 production evidence。

| 證據 | 可重現事實 | 判讀界線 |
| --- | --- | --- |
| E1：[PostgreSQL runner](../../scripts/qc-dev-047-postgres.mjs) | 未提供 URL／disposable flag 時寫 `NOT_RUN` 並 exit 0；提供兩者仍無條件寫 `BLOCKED` 並 exit 2。全檔沒有 DB 連線、migration 或 SQL assertion。 | 不是補一條連線就能完成 QC。exit 0 存在誤用風險，但未證明已有 release 因此錯誤放行。 |
| E2：[實作切片紀錄](../specs/DEV-047-implementation-slice.md)、[歷史 manifest](../../qa/dev-047/postgres/manifest.json) | 原說明只列「未提供 disposable target／URL」，沒有揭露執行器未完成。 | 保留歷史 `NOT_RUN`，更正解釋；不得改寫舊 receipt 偽造已驗證。 |
| E3：[contract runner](../../scripts/qc-dev-047-contract.mjs) | A17～A22 使用 `assert.ok(caseId)`，只驗固定非空字串；不讀取案例結果或驗證對應行為。 | 這六筆不能當成 A17～A22 功能／DB 行為通過；不因此推翻其他獨立測試。 |
| E4：[既定資料庫架構 §2026-09-06 amendment](../../../Jenfu-Platform/ai-doc/decisions/ADR-002-phase1-identity-session-cloudsql-topology.md)、[OrgMaster staging profile](../../config/dev-010/n1c-orgmaster.json) | 已有 `jenfu_dev` 工程演練、`jenfu_stg` 持久驗收、`jenfu_prod` 正式分工；ADR 亦明定 PR／CI／故障注入／破壞性 migration 使用 task-owned disposable PostgreSQL。 | 「未規劃測試 DB」不成立；既有設定不等於當下可連線、具憑證或已套用 012。 |
| E5：[DEV-009 隔離 runner](../../scripts/qc-dev-009-privileged-postgres.mjs) | 已有 temporary cluster、loopback 動態 port、啟停與清理機制。預設 PostgreSQL 18；現行 nonprod 契約為 17。 | 可重用機制，不得整支照搬舊 fixtures、跨 repo source 或把版本差異抹除。 |
| E6：[DEV-047 direct spec §21.1～22](../specs/DEV-047-permanent-managed-identity-link-and-login-alias.md) | 已要求隔離 target、001～012 replay、競態／回滾／權限等實測與逐案例證據；缺少 target 不可假 PASS。 | 既有安全規則本身不需推翻；目前是實作及證據不足。 |

本機工作檔 SHA-256（供本次靜態查證辨識，不冒充 release artifact）：

- `scripts/qc-dev-047-postgres.mjs`：`22ff9f55cd5d2b4afbfe1cb4c4a312c36f3520c8fb54af111f62bd0be3a91bad`
- `scripts/qc-dev-047-contract.mjs`：`002c75bb99378856b250e60ea3821d90a0ad5616f2bff450f6d882cad5e73743`

實際影響：DEV-047 缺少 PostgreSQL 行為證據；使用者被引導去補不能解除阻擋的環境條件；部分案例標籤產生表面 PASS，增加交接誤判風險。

未知與不推論：本輪未查證雲端連通性、登入權限、最新 ledger、是否曾有自動化 consumer 把 exit 0 當放行、其他專案是否重複發生。沒有證據顯示已造成正式資料損壞或錯誤部署。

## 3. 根因分析

方法：直接套用 `$hcs #多層次分析` 與 `$first-principles-thinking`，區分症狀、直接原因、控制失效與架構限制。分析限 E1～E6 支持的範圍，不以「疏忽／再小心一點」作根因。

| 根因 | 因果機制與確認依據 | 反事實檢查／控制點 |
| --- | --- | --- |
| R1：測試命令的交付只到占位輸出，沒有可執行的 DB 驗證路徑 | 直接原因是 E1 無 SQL 路徑；控制缺口是配置看似具備命令入口，但完成連線設定後仍不能進入測試。E5 的既有生命週期機制未被接入本 runner。 | 若 runner 具備受控啟動、migration、真實 assertions 與 cleanup，同一使用者不必先提供一個仍無法使用的 DB。控制點：RD runner 實作與可執行性測試。 |
| R2：阻擋原因以第一個環境條件代替完整的能力判定 | E1 先檢查環境變數，尚未區分「執行器未完成」便結束；E2 將該條件作為主要原因。回報未把 runner readiness、target suitability、connection result 分開，因此把工程缺口表述成使用者環境不足。 | 若原因分類先識別本地能力缺口，並區分既有環境用途／實際存取限制，仍可保持 fail-closed，但不會要求使用者重做已存在的架構。控制點：runner 診斷結果與 QC 交接說明。 |
| R3：部分案例的 PASS 條件與待驗證行為脫鉤 | E3 的條件對固定非空案例 ID 永遠為真；「案例名稱存在」被列入 checks 的 PASS。這允許尚無實測結果的案例出現在成功清單。 | 若必須有對應 assertion／結果來源，移除實測證據或注入錯誤就應失敗，不能只靠案例名稱成功。控制點：contract checker、case evidence 與結果消費端。 |

架構層判斷：正式／開發／staging 與臨時隔離用途原已明確，不是本次根因。全公司制度或個人能力不足目前均無證據，不新增教育訓練或跨專案稽核任務。

使用思考習慣：#多層次分析、#變數控制、#限制條件

## 4. 立即矯正與遏止 C0

- 將現行交接原因更正為「DEV-047 PostgreSQL runner 尚未完成；未取得實際 DB 證據。既有環境是否可承接對應用途須依契約判定，不能歸責為使用者未建立測試 DB」。本輪已在實作切片紀錄與文件地圖補記。
- 修復前 PostgreSQL manifest 的 `NOT_RUN` 由 E2 與 Git 歷史保留，不升格為 PASS；既有 latest manifest 路徑在真實重跑後更新為新 receipt。A17～A22 的舊字串檢查 PASS 不作行為／DB 放行依據。
- 不為消除阻擋而把破壞性測試指向 `jenfu_dev`／`jenfu_stg`／正式環境，也不新建 Cloud SQL instance。
- 只限制依賴這些缺失證據的 DEV-047 驗收，不暫停無關開發或要求重跑所有既有驗證。

## 5. 一個修復批次：CA／PA 一起落實

依 `$hcs #效用理論`，將修復與防再發測試合併在既有 DEV-047，不分別開工、送審或結案。以下三列是責任與證據追溯，不是三個新任務。

| 根因 | CA：修復 | PA：防再發控制／目標層 | 效用判斷 | 驗證證據 | Owner／建議流向 |
| --- | --- | --- | --- | --- | --- |
| R1 | CA1：補完既有 PostgreSQL runner，重用臨時 DB 啟停機制，對齊 PostgreSQL 17、repo-owned migrations／contract fixtures，執行既定真實 SQL 案例。 | PA1：runner 自行準備及清理可證明由本次任務持有的 target；所有權不能只靠 disposable flag。正常、失敗及受控中斷的 cleanup 納入既有測試。 | 必要工程成本；重用既有機制，不建通用框架或永久環境。 | V1、V2 | RD／既有 DEV-047 runner 與測試；每次 disposable QC 適用。 |
| R2 | CA2：回報真實受阻層：runner、runtime、target、連線／權限或 assertion；不以第一個缺失的環境變數歸責使用者。 | PA2：既有 runner 結果與 project ai-doc 固定用途路由；受控失敗測試直接驗證原因、exit code 與交接摘要一致，不建新的診斷平台。 | 低成本，減少誤判與反覆詢問；無額外人工確認。 | V3 | RD、QC／現有回報格式與測試說明；每次宣告外部阻擋時適用。 |
| R3 | CA3：移除 A17～A22 恆真判定，區分靜態契約與行為證據；缺實測不得列行為 PASS。 | PA3：在既有 checker／實際存在的結果 consumer 加負向測試，缺案例、錯誤／過期證據、零覆蓋、NOT_RUN、BLOCKED 不得冒充 required-QC PASS。 | 直接防止假綠燈；不重複搬移產品案例或新增 release stage。 | V3 | RD、QA、QC／既有測試與 QC gate；case 或結果 consumer 變更時適用。 |

責任安排：RD 在同一批次完成三項修復及回歸測試；QA 使用下節既定判定，不另寫一份計畫；QC 在修復版本執行與查證，不修改產品；PM 依同一份結果更新狀態。可由同一執行者依序切換角色，不要求增加人數或簽核輪次，RD 自測不冒充獨立 QC。

環境分工不變：全新 replay、PR／CI、故障注入及破壞性測試使用 task-owned disposable；`jenfu_dev` 用於受控工程／前向演練，`jenfu_stg` 用於持久正常流程驗收。共享環境須確認 exact target、身份與 ledger，不得清空或任意重播歷史 migration；本 CAPA 不授權遠端寫入或正式發布。

使用思考習慣：#效用理論、#可驗證性、#限制條件

## 6. 三個結案出口：共用一次有效驗證

原八項檢查合併如下；必要測試保留，取消重複執行與未來交接等待。V1～V3 已在同一修復版本完成，不代表產品驗收分母被縮減。

| 出口 | 通過標準／必要證據 | 原檢查對應 |
| --- | --- | --- |
| V1 真實 DB 驗證 | 在 PostgreSQL 17 contract-compatible runtime（接受 17 或 18，必須記錄 exact version，migration 不得依賴 17 之後才新增的語法／行為），既有命令自行建立 owned target，套用 repo 契約及 001～012，真正執行 direct spec §21.1 必要 DB cases 並通過。保存版本、migration／fixture hashes、逐案例 expected／actual、非零執行數與相關回歸結果；不能只印 manifest。 | Q1＋Q7，共用同一組 PostgreSQL 與回歸證據。 |
| V2 目標與清理安全 | 以本地 mock／參數測試證明 shared dev、staging、production 或未知 target 即使 flag=true 仍被拒絕，不連線那些實際環境。真實自有 cluster 在正常、SQL 失敗與受控中斷後均清理；預先記錄 project／purpose／port／PID tree／cleanup condition，只停止自有 process tree，確認 port 釋放，cleanup 失敗不得 PASS。 | Q3＋Q4。 |
| V3 結果與原因可信 | 模擬 runtime 缺失／版本不符／runner 不可用、NOT_RUN／BLOCKED／FAIL／零案例、A17～A22 缺證據／錯誤／舊來源。原因須符合實際受阻層，required QC 不得 exit 0、改成 N/A 或列行為 PASS；現有 consumer 同步驗證，沒有 consumer 不另造一個。以本次正常與受控失敗輸出立即確認交接摘要，不再歸責使用者未規劃 DB。 | Q2＋Q5＋Q6＋Q8；原 Q8 改為本次驗證，不等待下一次交接。 |

結案證據（2026-09-16）：

- V1 `PASS`：[PostgreSQL manifest](../../qa/dev-047/postgres/manifest.json) 記錄 PostgreSQL `18.4`、001～012 的逐檔 SHA-256、fixture／runner fingerprint、A17～A22 六項非零 SQL 行為結果；本機安裝沒有 PostgreSQL 17，因此以 17/18 相容 gate 執行，production target 仍固定 PostgreSQL 17。
- V2 `PASS`：runner 只接受 `task-owned-local` 並拒絕所有外部 URL；負向測試涵蓋 shared-dev／staging／production／unknown。正常執行與本輪多次 migration／SQL 失敗均回報 `clientClosed`、`clusterStopped`、`portReleased`、`tempRemoved=true`，且每輪在啟動前列出 project／purpose／port／process tree／cleanup condition。
- V3 `PASS`：`npm run test:dev-047:qc` 驗證 runtime 缺失、16／19 版本、NOT_RUN／BLOCKED／FAIL／零案例、缺 A17～A22 與 cleanup 不完整皆不得 PASS；contract checker 已用實際 source evidence 取代六個 `assert.ok(caseId)`。
- 相關 QA：`npm run test:dev-047` 為 4 files／12 tests PASS；`npm test -- --testTimeout=30000` 為 200 files／812 tests PASS、1 file／1 test skipped；`npm run qc:dev-047:contract` 為 12 checks PASS；`npm run check:db-boundary -- --base=origin/master` 與 production build PASS。全量回歸另修正一筆既有 Windows CRLF/LF 測試誤判，未改產品行為。所有資料庫寫入只發生在 task-owned temp cluster，沒有 shared／staging／production 寫入。

執行規則：

- 同一修復版本完成 runner／checker 相關測試，以及 `npm run test:dev-047`、`npm run qc:dev-047:contract`、`npm run check:db-boundary`、`npm run qc:dev-047:postgres`；每個適用案例只執行所需次數，SQL 失敗／中斷測試使用各自隔離 fixture，不以「一次」省略負向情境。
- **CAPA 與 DEV-047 共用同一份有效證據，不為 CAPA 重跑整套產品 QC。** 來源／測試實作／依賴／環境與 fixture 未變、覆蓋相同且無新失敗或漂移時可重用；修復使證據失效時，只重跑受影響檢查及下游。既定產品／release 驗證義務不由本方案豁免。
- 沿用 `qa/dev-047/postgres/manifest.json` 與既有 QA 證據位置，記錄 source／工作檔 fingerprint、sanitized server version、target class、migration／fixture hashes、案例結果、命令／exit code、失敗原因與 cleanup；不另建平行報告平台。保留首個失敗，不記 DSN、密碼、token 或正式個資。

**結案條件：C0 已完成，CA1～CA3／PA1～PA3 已落實，且同一修復版本的 V1～V3 有有效通過證據，即可在本次修復工作結束時結案。** 不等待下一次任務／交接，不設觀察期，不追加人工批准；正式 Register 編號不作工程修復與有效性驗證的前置條件。結案狀態只回寫本文件與直接索引，不另建結案報告。

若有任一必要出口未通過，保留首個失敗與最小修復項，不宣稱結案。文件縮短、只更正文案或只補環境變數不能取代 runner 修復。CAPA 結案不等於 DEV-047 全功能、production migration 或 release 已完成；未驗證的其他範圍仍維持原狀。

再觸發：同類誤歸因、無實測的行為 PASS、錯誤 target 被接受或自有 runtime 殘留時重開對應措施；不用預先等待再發才能證明本次控制有效。

## 7. 既有任務內執行，不增加治理分支

Routing recommendation：回既有 DEV-047 的開發點／驗證缺口修復，沿用本文件的 QA 判定與既有 QC 證據。原因是同一驗證鏈的三項修復，不是新產品交付點；不發新 DEV、不增加完成率分母，也不要求新增 QA／QC／SOP 文件。

DEV registration draft（既有任務內的交接摘要，不新增登錄）：

- DEV ID／Parent／Type：DEV-047／DEV-047／開發點。
- Scope：既有 PostgreSQL runner、contract checker、必要測試與直接文件，保留產品契約與 migrations。
- Acceptance／Evidence required：V1～V3；上一節原始結果與 manifest，只對驗證版本有效。
- Owner／完成時點：RD 修復、QA 判定、QC 取證、PM 回寫；三出口通過即完成本修復批次與 CAPA，不等待未來輪次。
- Stop conditions：需要共享 DB 清空／重播、改已套用 migration、讀取 sibling source、擴張 schema ownership、付費資源、憑證操作、正式 side effects 或改變原驗收時，只停止受影響部分並回主任務判定；不能藉 CAPA 隱藏已知失敗。
- Human decision needed：本次文件精簡無待決選項；正式 Register 登錄、跨專案 skill 修改與超出既有邊界的遠端／成本變更不由此自動執行。

PA 只落在第 5 節已列的 runner／測試、project ai-doc 與現有 QC gate。Skill 層不修改：既有技能已有證據適用範圍與真實驗證規則，先補專案可執行控制；若修復後其他專案仍重現同一機制，才提最小 skill 修訂，不回寫 `hcs`。

範圍外：資料庫重新配置、平台重建、把 012 加入 production release runner、其他專案、部署、額外人工簽核與無關產品缺陷。本輪已執行 CAPA 所需的 targeted regression、contract、DB boundary、production build 與隔離 PostgreSQL QC；未執行部署或 production release。

使用思考習慣：#效用理論、#限制條件、#可驗證性
