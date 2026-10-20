# DEV-058：各系統管理角色、OrgMaster 集中配人

修訂：2026-10-21（Asia/Taipei）。Owner：`ORGMASTER/DEV-058`；來源：`AIPDM/DEV-123#orgmaster-compatibility`。
狀態：`Local Implementation In Progress / Rollout Disabled`。2026-10-21已完成OrgMaster dynamic current/history reader、compatibility_v2、指派CAS/UI及AI-PDM真實vector的本機協同驗證；不含正式migration、發布、traffic或資料寫入。
DEV-058本機dynamic consumer與集中指派首版已實作並取得部分驗證；整體為`IN_PROGRESS`；QA058-01..24的完整case closure仍保持`NOT_RUN`；原生schema/ACL只有已記錄source的局部smoke，正常browser、真實兩端連續旅程、故障注入與正式L4尚未完成。局部證據見§11及QA§7。

本版沿用已確認的B分工與自用精簡。AI-PDM已交付35欄producer、registry/profile、真實vector與本機editor/API/UI；OrgMaster已交付reader、compatibility_v2及人員指派。§9的H1～H3已在source層對齊，H4仍缺完整真實旅程，H5仍缺具名環境的首次切換；不另設第二人核准。

入口：[任務](../dev_task.md#dev-058-federated-role-catalog-central-assignment)、[QA24案](../qa/DEV-058-dynamic-role-assignment-validation-plan.md)、[ADR-007](../adr/ADR-007-external-role-catalog-assignment-boundary.md#2026-10-12-b-dev058)。
共同契約依據：[DEV-123](../../../AI_PDM/.ai-doc/specs/DEV-123-role-permission-editor-contract.md) §5.2–5.3、§7.2、§9、§14.5及§15；本次AI-PDM實作在`codex/dev123-role-policy-editor`隔離分支。文件、原始碼及目前部署版本分開記錄，本機PASS不代表已啟用。

## 0. 本輪可獨立交付切片

- OrgMaster讀取、普通撤銷／已撤列移除及純減權發布可依有效owner publication的完整snapshotHash＋audit afterHash/entityId綁定，保持原資料、當前actor、CAS及管理者連續性；混有新指派、restore、scope擴大／期間延長或內部資格變更仍需原正常授權路徑。
- 正常HTTP與原介面均保留撤權；目錄故障以unavailable顯示原metadata，不假裝current有效，不開新增／restore或離線歷史版本啟用。合法同actor同命令重送先於新CAS；發布回傳原命令版本而非後來的最新版本。
- 既有v1九身份契約可接受owner產生的後續能力內容版本：逐角色／整catalog重算hash、九身份順序與全部任用metadata固定、system_admin完整能力及baseline false保持；已知v5/v6/v7繼續exact artifact驗證。不是略過hash，也不接受custom／grouped格式。JSONB鍵順序以同一producer序列化規則正規化。
- 舊任用跨內容版本以可信、audit-bound自有publication快照驗provenance；同一版本不同hash拒絕。AI-PDM已提供registry builder、runtime editor/API與35欄current/history migration source；OrgMaster不寫PDM資料，仍以versioned contract唯讀。
- 本輪驗證涵蓋OrgMaster七檔37 PASS／1 SKIP、AI-PDM 48檔401 PASS＋Node 6 PASS、雙邊schema/vector、型別、DB boundary及兩邊build；仍不能填完整QA24／peer52、完整原生PG案例、正常browser或正式L4 PASS。既有release gate不改，Platform登入與DEV-122其他業務未被改寫。
- 原始失敗、修復及最終命令結果記於QA§6；沒有量測不宣稱工時或延遲改善。

## 1. 目的與責任

角色流程：PDM 定義並啟用角色 → OrgMaster 讀清單及狀態、由管理者配人／發布 → PDM 以目前角色政策判權。

PDM最新流程是保存草稿→唯讀預覽→單一apply原子生效，不再要求先發布待啟用版本、獨立activate或preview持久化。OrgMaster只讀已提交current；自己的任用草稿／發布流程維持，兩種流程不可混為同一操作。

| 責任 | Owner |
|---|---|
| 角色定義、能力矩陣、動作合併、預設範本、能力優先序／deny、業務最後判權 | AI-PDM |
| 任用人員、scope、期間、推薦／採用、代理、撤銷、發布與任用紀錄 | OrgMaster |
| 調職後保留哪些角色、恢復前檢視哪些人、例外是否調整 | 合格管理者決定，系統顯示就地提醒 |

只做 AI-PDM 此次對接，延用既有入口與交易。排除其他 app 接入、組織圖自動授權、人員／身分模型重建、跨 app core 存取、permission service、多租戶／計費／公開 SLA、正式 migration／發布。沒有 maker-checker、風險分數阻擋、提醒逾期凍結或獨立需求單。

## 2. 對齊七個日常角色與歷史身份

七個日常角色是呈現與政策 profile；九個既有 stable ID／code／身份名稱及 catalog 順序仍保留，不能直接將九列刪成七列。

| 新增一般任用的選項 | stableRoleId／roleCode | 顯示／來源規則 |
|---|---|---|
| RD | role-rd／rd | presentationName=RD，原「研發人員」身份不改 |
| RD主管 | role-rd-manager／rd_manager | 原「研發主管」身份不改 |
| QA/QC | role-qa／qa | 不從名稱推論審核或管理資格 |
| 生產人員 | role-manufacturing／manufacturing | 原 scope／期間約束 |
| 採購／生管 | role-procurement／procurement | 新任用只用此 canonical ID |
| 外部專員 | role-external-specialist／external_specialist | project-only、manual direct、有限到期、不可代理 |
| PDM管理員 | role-pdm-admin／pdm_admin | 不因名稱取得特權 Principal |
| active custom | role-custom-&lt;uuid&gt;／custom_&lt;uuid去hyphen&gt; | producer 生成身份，workspace／employee／app_admin，依 presentationOrder 加在日常角色後 |

`role-production-planning/production_planning`為 `legacy-only`，其 `permissionRoleId=role-procurement`。原任用可讀、可撤銷、仍合法時由 PDM 按 canonical 政策判權；不新增此別名任用，不改舊 ID/code/catalogVersion/scope/期間/priority、不合併兩筆任用或 union scope。兩種身份停用／恢復同步。

`role-system-admin/system_admin`為 `hidden-protected`：一般選單不列，只沿既有特權入口，以當前 exact human_privileged Principal、direct global、禁止自授等既有保護處理；同 Employee 另一 Principal 不繼承。首次 dynamic 的固定保護能力由 PDM source 處理，OrgMaster 不從一般業務矩陣授予管理資格。

新任用必須 `assignmentDisposition=selectable`、roleStatus=active、assignable=true，且 subject/scope/期間合法。custom 不可指定 alias/global/principal 或特權 metadata。完整身份上限64及合法字串／hash／唯一性等輸入邊界保留，並不增加一套風險審批。

**格式時點**：legacy current 沿原九身份及既有任用語意，不能在 dynamic 啟用前提前套用七角色／legacy-only；grouped dynamic current 才使用上述 presentation/disposition。格式由已核實 current 決定，不由 UI 或環境變數猜測。

## 3. 一份對接契約與必要驗證

| versioned DB 物件 | 用途／本版要求 |
|---|---|
| `ai_pdm_contract.v_application_role_catalog_v2` | 唯一 current；legacy 與 grouped dynamic，完整9..64身份 |
| `ai_pdm_contract.v_role_policy_publications_v1` | 原版本 immutable 內容與 lifecycle；只讀任用所需歷史 |
| `orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2` | OrgMaster 相容宣告，對齊 DEV-123 §7.2 |
| `orgmaster_contract.v_ai_pdm_principal_effective_grants_v4` | 延用現行任用投影；欄位、manifest、applied029不改 |

current v1/v2須同 active pointer，inactive／alias／system_admin不能從身份投影漏掉；v4有grant列不等於某個業務能力Allow。沒有每個業務request回呼OrgMaster HTTP。

### 3.1 讀取欄位及轉換

v2沿原19欄，保留原型別及 snake_case→camelCase：
`contract_version,application_id,catalog_version,published_at,catalog_sha256,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash`。
另讀下列三組，按 producer 固定 SELECT，不用 SELECT * 或 client 選 source：

| 群組 | 欄位 |
|---|---|
| 格式及版本 | publication_format,canonicalization_version,role_schema_id,activation_generation |
| 內容綁定 | baseline_role_identity_hash,role_identity_hash,protected_policy_hash,registry_hash,role_profile_schema_id,role_profile_hash |
| 生命週期與呈現 | role_status,permission_role_id,presentation_name,presentation_order,assignment_disposition |

dynamic：`role_schema_id=ai-pdm.role-schema.flexible.v2`，`role_profile_schema_id=ai-pdm.role-profile-schema.v1`，canonicalization=`jenfu.canonical-json.v1`；profile/disposition值只允許source規定的selectable／legacy-only／hidden-protected關係。legacy的profile schema/hash為NULL、permission_role_id為自身ID，presentation沿原顯示值；新增header不加入舊hash。activation_generation是真DB bigint的非負十進位字串，不能假造0或轉成不安全Number。

一次SQL讀完current並驗全列header一致、身份唯一、display_order完整；UI另依presentation_order排序。history以必要catalogVersion去重查詢，逐版核實version→hash唯一及原identity；lifecycle=active/retired才可作任用來源，draft不能用於新任用。base tuple由PDM啟用流程使用，不進OrgMaster配人前置。

### 3.2 驗證責任收斂

保留來源ACL、schema/header、角色身份／profile關係／status、scope/subject、來源版本、canonical內容完整性及特權metadata檢查。legacy v5/v6/v7沿各自exact artifact，既有更早pinned history只用於原provenance，不重算舊bytes/hash，不以source v7猜正式基線。

dynamic完整contentHash依最新DEV-123 §5.2，包含roleProfileSchemaId、roleProfileHash及roleProfiles；按catalog身份順序重建roleProfiles，不用presentation順序算hash。原roleDefinitionHash／identity hash仍驗，不能只比較DB自報hash。registryHash只覆蓋規範性語意，不含route/caller檔案路徑、helper／測試名稱、證據引用或時間；純實作重命名不觸發跨app相容更新。受控來源提供canonical vectors與固定consumer schema/baseline/protected綁定，不能從未核實payload自動學習基線。動態版本新增custom或改合法能力不需逐版source allowlist。

**OrgMaster不另建PDM能力編輯規則引擎**：不複製20個動作的勾選、legacy合併、業務route/caller對應及預設範本判定。H2已由雙邊manifest與AI-PDM domain builder產生的v7 vector確認：OrgMaster只驗任用需要的schema/profile/alias/lifecycle、canonical hashes與protected/baseline綁定。若未來投影不足或registry語意改版，維持NOT_READY並補新版契約，不猜欄位／省略hash。

## 4. 延用資料與 API

### 4.1 角色 metadata 與歷史

對browser的角色metadata延用既有stableRoleId、code、displayName、status、assignable、riskLevel、subjectKind、scope及任用限制，增加 `permissionRoleId,presentationName,presentationOrder,assignmentDisposition`。status映射role_status；畫面名稱用presentationName，歷史身份仍用原displayName／code。

current附 `{catalogVersion,catalogSha256,activationGeneration}`，dynamic另保留schema／registry／identity／profile／protected綁定供server驗證。browser不持有policy authority或完整registry。新動態catalog snapshot可用原規劃的ExternalRoleCatalogSnapshotV2承接必要metadata、來源與hash；不為未發布的規劃再疊V3。舊V1 snapshot、GovernanceDocumentV3/schemaVersion3、assignment-governance-v3、歷史snapshotHash及audit bytes不重寫。

內部UI/API同批升級，沿GET /的document/catalogs/revision/activeVersionId/versions與既有錯誤shape；不新增讀取協商header或多組write/result封套。dynamic舊client缺expectedCatalog時409要求重新載入，不能默默用舊九角色寫入。已對外發布的closed projection／特權DTO仍原版；確有外部consumer需breaking變更時才另立版本，不把custom塞進system_admin專用欄位。

### 4.2 寫入與結果查詢

API前綴沿 `/api/orgmaster/governance`；verified session／Origin／JSON、manage/simulate/publish、特權專用資格與連續性保護保持。

| 入口 | 最小request／效果 |
|---|---|
| POST /validate/assignment | 普通任用輸入；回valid/invalid、issues及current tuple，預檢不授權 |
| PATCH /draft | expectedRevision、expectedOrganizationRevision、expectedCatalog、既有command；server重驗／存草稿 |
| POST /versions | commandId、reason、expectedRevision、expectedOrganizationRevision、organizationVersionId、expectedCatalog；發布原子保存任用／來源快照／audit |
| POST /active-version | commandId、reason、versionId/null及上述CAS；沿既有continuity，逐項判斷是否新增授權 |
| GET /commands/{commandId} | 只查本owner audit的原結果，當前manage資格；不依賴PDM current |
| 原推薦／adoption／特權入口 | 重用同一current context、profile及history；保留各自資格／receipt，不建平行配人表 |

expectedCatalog=`{catalogVersion,catalogSha256,activationGeneration}`；hash為64hex，generation為合法bigint字串。一般新／擴權命令必填；純撤銷等減權操作在§5所列可信原資料條件下不以PDM current可用作額外前置。

普通manual輸入只有id/applicationId/employeeId/roleId、scope（沿kind/value）、validFrom/validTo及現有受控metadata。server產生role/code/name/catalogVersion、basis/subject/sources及actor/audit；body不能指定特權或來源權威。更新保留原身份/provenance；換人或換role另撤銷及新任用。代理從sourceAssignment推得role與原catalogVersion，再驗source、scope及期間包含。metadata及外部專員限制沿既有validator。

commandId／reason沿既有機制；新hash包含operation、verified actor、normalized payload、治理／組織CAS與expectedCatalog，legacy preimage不回算。以受影響既有audit欄位擴充 `commandResult={operation,outcome,entityType,entityId,versionId?}`即可，新欄納eventHash，舊event preimage保持；不建立通用命令平台或第二份receipt表。無domain變更的noop若回成功亦記最小audit以供查詢。

結果查詢沿 `{status:committed|not_observed,commandId,commandHash,auditReference,entityType,entityId,occurredAt,result}`：committed只回原已記錄結果，legacy缺結果則result=null且顯示僅有提交證據；not_observed各證據欄null，不等於已證實未提交。回應遺失保留原ID、查原結果／同ID同內容重送，不換ID盲重試。相同ID異內容／actor拒絕；合法replay仍fresh admission並先於新操作CAS/current檢查。回應帶現在的revision，UI另reload最新狀態，不宣稱它是原commit revision。沿原401/403/409/422/503及no-store，不把HTTP成功當PDM能力已生效。

## 5. 授權、狀態與交易安全

| 情境 | 系統把關／人控 |
|---|---|
| 新任用／推薦／代理／重新啟用任用 | current selectable＋active、身份／scope／期間／資格合法；人決定選誰 |
| 角色能力改變 | 原任用及provenance不重寫；PDM讀current policy判權，人檢視原人選 |
| inactive | 禁新增或擴權；原資料可讀可撤銷，其他active角色繼續判權 |
| 恢復同角色ID | 只有未撤銷、未到期、scope／來源仍有效者可能再生效；顯示原任用與恢復影響提醒 |
| manual調職／改名 | 不自動授撤；管理者檢視是否保留 |
| position_adoption來源失效 | 現有來源失效保護繼續，不轉永久manual |
| 身分inactive、到期、撤銷或非法scope | 拒絕授權；不能只提醒後放行 |

ROLE restore與ASSIGNMENT restore不同。沿DEV-037 ID-only ordinary manual、有效Employee／期間／scope及current selectable角色；legacy-only舊生管只能維持既有有效任用或撤銷，不以restore新增回授。舊catalogVersion可由可信history驗證，不要求等於current。revoked-only REMOVE仍需無delegation引用，只移draft列，history/audit保留。

publish／切回歷史版本與目前active policy比較：新active、revoked→active、scope擴張或期間延長需新授權條件；未變inactive原列可留。縮scope／縮期間／撤銷可走減權路徑，仍受操作者、原來源與既有continuity保護。

一個寫入操作沿existing mutex／persistence transaction／writer fence：先讀own audit與fresh actor → 合法replay → 新操作CAS → 一次讀已驗current並補必要immutable history → validate／mutate／audit → fresh actor與組織fence → COMMIT。保持READ COMMITTED，傳同一context給read/preview/persist，不跨request/cache重用；不改全域隔離層級、不跨owner core取鎖。

PDM先apply再SELECT，舊tuple409；Org先讀current而PDM稍後apply，可依原provenance完成合法任用，但PDM新開始的授權請求依新policy/status。已合法通過的一般短請求可完成；PDM長任務最終採用／下一次檔案交付依其fresh guard。OrgMaster不新增全app business鎖或承諾跨owner同時commit。

PDM current／history失敗時不補舊能力、不放行新授權；保留可核實的原任用查閱及減權。減權需own原資料／可信已存snapshot、audit與當前actor均可核實，且既有特權／continuity檢查成立；不足則停止該操作，不因服務不可用猜資料。own identity／artifact不可信仍拒絕。避免一個app目錄錯誤拖垮無關組織功能。

## 6. 精簡的相容宣告與 DDL 設計

沿最新DEV-123 §7.2提供 `orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2`。v1不足以啟用grouped v2；未曾建立的舊規劃直接改v2，已套用物件若有則保留相容窗口，以新migration追加。

| 公開欄位（固定順序，共14欄） | 型別／規則 |
|---|---|
| application_id, consumer_id | text，固定ai-pdm／orgmaster，複合PK確保單列 |
| contract_version | text，ai-pdm.role-policy-consumer-compatibility.v2 |
| compatibility_revision | bigint>=0，owner更新CAS並+1，DTO用字串 |
| supported_publication_format | text，dynamic-policy-v1 |
| supported_canonicalization_version | text，jenfu.canonical-json.v1 |
| supported_role_schema_id | text，ai-pdm.role-schema.flexible.v2 |
| supported_role_profile_schema_id | text，ai-pdm.role-profile-schema.v1 |
| accepted_registry_hash, accepted_baseline_role_identity_hash, accepted_protected_policy_hash | text，首輪啟用時核實的語意registry與受控基線，64hex |
| consumer_source_revision | text，經owner核實source，40hex |
| enablement_ref | text，NOT_READY可NULL；READY必為可查既有owner紀錄 |
| readiness | text，NOT_READY／READY，預設NOT_READY |

只需own一表（如orgmaster_core.ai_pdm_role_policy_compatibility）、此view、必要既有contract manifest登錄及最小ACL；表可另有updated_at。**刪除前版額外private enablement_binding JSON、自訂owner receipt schema與獨立profile證據發布流程**。證據沿既有發布／QC紀錄，enablement_ref引用；PDM本身現行enablement binding不在本repo刪除或繞過，需H3協調其證據重用。此14欄對齊DEV-123 §7.2；accepted_registry_hash只綁首次啟用或registry語意變更時的相容性，不作OrgMaster逐catalog版本核可。一般合法角色／能力內容更新不需OrgMaster source、部署或相容列更新。

owner migrator擁有表/view，runtime不寫表、不具DDL／owner權。PDM與OrgMaster runtime僅此view精確SELECT／必要contract USAGE，無關角色／PUBLIC無權；不撤既有own writer的必要權限，不授跨core。初始NOT_READY，常數缺失或來源未核實不填0hash，不發布READY。READY需schema/profile/alias、實際雙端行為與live consumer相容證據，單一marker不能證明這些事實。

owner狀態變更在同交易驗目前revision與受控綁定，+1更新；前版不同列數／shape／owner/ACL漂移需拒絕並調查。manifest只記真實公開欄、owner/consumer及signature，不新增一般規則登錄系統。`db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql`已交付forward-only單交易DDL與最小ACL，初始NOT_READY/revision0；本輪只驗source與boundary，未套用shared DB或改值。

相容依賴仍是producer可供讀取 → consumer能解legacy/grouped/profile/history → 真實驗證及live consumer相容 → owner READY／PDM首次rollout → dynamic apply。PDM最新§7.2已允許共用有效CI／release／整合證據，不為每次角色變更重辦發布；實際source/readiness綁定與owner紀錄仍須核實。本輪不產生正式操作指令，不自行改值或宣稱豁免未滿足條件。

## 7. 最小開發範圍與相容退場

- 修改現有catalog reader／registry、governance types/validation／assignmentSurface、store/API、推薦及角色指派UI，重用原發布／receipt／persistence；不先建立通用adapter、獨立policy validator或四套專用runner。
- peer對照保留OM-C1 reader、C2任用／provenance、C3 compatibility_v2、C4七角色UI、C5真實往返；實作按真正依賴推進，不要求多一輪文件審查或每個slice人工批准。
- 新snapshot與contract decoder沿必要格式版本；內部UI/API同批更新。legacy現行語意只維持到首次受控dynamic啟用；之後停用legacy新寫入，保留歷史decoder／bytes與復原所需證據。不是永久雙套可寫權威，不以設定開關／錯誤自動回退。
- PDM尚無v2時仍由原部署提供合法legacy流程；新版dynamic reader必待producer契約可用。完成切換不保留ORGMASTER_AI_PDM_ROLE_CATALOG_CONTRACT長期雙模式開關。dynamic後回復必須仍是相容reader／新policy版本，不能部署static-only。
- 外部版本化closed contract不能任意加欄，特權入口維持；只有實際外部consumer要求才規劃新projection版本。一般UI的新增角色能力不等待未用投影改造。

## 8. 關卡與驗收

唯一驗證路徑在[QA計畫](../qa/DEV-058-dynamic-role-assignment-validation-plan.md#4-單一驗證路徑與證據重用)。三個必要結果：
1. 相關decoder/API/任用正反案例與舊資料回歸可重現；安全案例不能用提醒取代。
2. 本次改到的SQL/ACL、交易、replay與兩個時序以真PG驗；既有可重用證據只補受影響部分。
3. 初次整合以兩真owner跑正常新增／配人／能力變更／停用／恢復／撤銷及別名往返，UI可辨狀態；不是每次修改重做整套。

保留原B058-01..08及QA058-01..24的安全／功能目的，沒有刪減分母；一段測試可支援多案，case只在其必要層有證據才PASS。peer固定52案與本DEV分開，QA123-29/30/44/52需要真consumer；mock或build不能完成它們。

移除「固定16檔／四個專用runner／一套versioned evidence JSON全部先建好」的前置。使用既有npm test、相關PG驗證與browser控制，缺某個規劃檔名不代表產品失敗；缺行為證據仍不能通過。資料／版面未變則沿有效證據重用；UI正常入口、inactive撤銷、錯誤／鍵盤及390唯讀等受影響行為仍驗，無必然每案三viewport重跑要求。

## 9. AI-PDM 交接項目

以下記錄2026-10-21雙邊source交接現況；完成表示本機契約已對齊，不代表migration、live runtime或正式啟用。

| ID | 要交付／確認 | 完成前的處理 |
|---|---|---|
| H1 | v2 current/history含全部profile欄、alias/disposition、generation／lifecycle範例；grouped-v2完整canonical preimage／vectors、受控consumer schema/baseline/protected綁定及精確SELECT ACL | **本機完成**：AI-PDM 35欄migration/manifest及domain builder v7 vector；OrgMaster reader與雙邊測試通過。已於隔離PG18套用，初始NOT_READY；正式DB未套用 |
| H2 | OrgMaster驗任用schema、identity/profile、來源完整性、scope及protected約束；PDM驗完整業務registry/editor/enforcement。contentHash含完整registryHash但consumer不逐版固定核可 | **本機完成**：責任分界、registry/baseline/protected hash及dynamic vector已由真實兩邊程式交叉驗證；OrgMaster未複製editor引擎 |
| H3 | compatibility_v2 14欄一致、owner實際source/readiness／首次rollout紀錄可查。accepted_registry_hash只綁語意registry相容性，不逐版核可普通角色變更；沿既有QC/release紀錄，不增receipt schema | **schema/source完成**：migration 034、manifest與AI-PDM contract test一致；**live狀態待辦**：仍NOT_READY，consumer_source_revision/enablement_ref需首次具名rollout證據 |
| H4 | 將AIPDM/DEV-123 §9對應到ORGMASTER/DEV-058／OM-C1..5，對齊QA123-29/30/44/52與QA058同一次真實驗證；確認別名restore／新推薦禁止legacy-only | **部分完成**：雙邊schema/vector與Org指派CAS已驗；原生atomic apply及domain停用/恢復/撤銷已PASS；正常登入HTTP/browser仍待辦，不批量改寫舊生管任用 |
| H5 | 為首次legacy→grouped切換安排producer可讀、consumer升級及舊寫入退場；列明實際目標／測試資料／執行者，重用同次live consumer讀回 | **部分完成**：本機positive ENABLED apply及domain雙端旅程PASS，正常登入HTTP/browser仍待驗；正式具名環境另依授權套migration、live readback及首次READY/ENABLED；本輪無正式授權 |

H1/H2/H3是跨owner契約收斂條件，不是要求人類逐欄核准。技術owner可在既定範圍解決；真正產品／權限衝突才回人類決策。資料可信度不足只停止依賴它的工作，獨立本地整理繼續。

## 10. 保留、移除與後續邊界

| 處理 | 本版決定 |
|---|---|
| 保留 | stable identity與歷史、停用／撤銷／到期、scope/subject及exact Principal、CAS／同ID冪等／交易audit、ACL／forward migration／現有release gate |
| 合併 | owner相容證據併入既有發布/QC紀錄；同一次正常整合支援多案；重用既有驗證工具 |
| 移除 | 複製PDM editor規則的預設要求、自訂讀取協商header、多組內部命令封套、長期legacy寫入模式、四套runner及固定16檔gate、private enablement_binding／新receipt體系 |
| 待peer同步 | H4/H5、正向ENABLED apply與正常雙端旅程；現行producer安全限制仍有效 |

本輪human決策已授權兩repo本機修復、測試及必要文件；原先僅文件限制是前一階段歷史。OrgMaster dynamic reader/指派與AI-PDM editor/producer已本機交付；首次啟用仍受H4/H5、`NOT_READY`／`DISABLED`及DEV-058/123尚待完整整合驗證的限制，不以精簡豁免。

調職待檢視清單及其他app接入保留為後續需求，沒有新DEV／CAPA／ADR。Release Impact：已新增尚未套用的own compatibility view/forward migration及reader切換source；正式操作維持AGENTS與DEV-040既有保護，不沿此文件擴當前31-row發布模式。共享DB／IdP故障仍可能拒絕業務；Org管理API停機暫停配人，PDM不增加HTTP依賴。

歷史：2026-10-12 Brief→Contract→Implementation Ready及2026-10-19精簡階段保留Git歷史。2026-10-21本機實作與證據見§11；既有production receipt、正式完成率與release狀態均未改。

## 11. 2026-10-21 本機實作與證據

### 11.1 OrgMaster已完成

- `aiPdmRoleCatalogRepository`以固定35欄讀v2 current/history；dynamic decoder驗publication/profile/identity/protected/registry/content hashes、七canonical/legacy-only/hidden profile、custom模板及lifecycle。
- governance命令、store、API與client DTO加入expected `(catalogVersion,catalogSha256,activationGeneration)`及Org revision CAS；新指派、改派、停用/撤銷沿同一交易與audit，inactive/legacy-only不提供新任用，UI顯示presentationName及風險提醒。
- migration 034建立owner-owned compatibility table與14欄versioned view、revision0/NOT_READY及manifest；035補definer-owner最小唯讀ACL及versioned管理授權fence。隔離PG已套，正式DB未套。
- 固定入口`npm run test:dev-058:contracts`鎖定dynamic decoder、assignment、compatibility、legacy相容與減權回歸。

### 11.2 驗證結果

| 入口 | 2026-10-21結果 |
|---|---|
| `npm run test:dev-058:contracts` | PASS：7檔，37 passed／1 skipped；skip為未設定隔離PG連線的原生案例 |
| `npm run check:db-boundary` | PASS：`DEV010_DB_RULESET_V1`，25 governed files |
| AI-PDM `npm run test:dev-123:contracts`以本工作樹作`ORGMASTER_DEV058_ROOT` | PASS：真實14欄consumer migration/signature與v7 vector |
| OrgMaster `npm run build` | PASS（本輪程式最後變更後已執行；既有Vite警告保留） |

### 11.3 未完成

- QA058-01..24保留原目的與分母；正常browser、真實兩端新增→任用→停用→撤銷→恢復、positive ENABLED apply／CAS／replay／rollback已有局部PG18證據，正式L4尚未完整驗證。
- 新manager鎖等待撤權／grant到期／identity-link到期原生證據已取得；fixture用owner DML與合成本機session，不當正常v2命令或H4/H5整案完成。
- submission／file／ZIP／export讀取／Preview／recognition caller已補，固定入口取得正反證據；20action全caller與CG驗收未完整關閉。未知target拒絕、owner／指定審核者限制保持；不以保守AND或build取代功能驗收。
- 正式migration與啟用未執行；初始NOT_READY/DISABLED保持。本機可繼續的整合工作不依賴DEV121/122正式結案。

### 11.4 較早本機快照（HISTORY_ONLY）

以下保留各輪當時結果、原始失敗及hash；其中「待驗」不代表目前狀態。目前續接以§11.5為準。

2026-10-21 forward-only修正：staged DB boundary首次拒絕修改已提交034/086（即使未正式套用），原始失敗保留；未放寬checker。034/086已恢復HEAD原文，新增OrgMaster 035_dev058_ai_pdm_compatibility_definer_read.sql與PDM 087_dev123_role_policy_candidate_validation.sql。035只授PDM受控apply owner唯讀contract權；087補候選DB驗證及source profiles，僅在DISABLED/generation0且無dynamic publication時，以table lock復原086導入的衍生project_scope_key，pre-087分享保持NULL，tokens/packages/其他業務欄位不變，新分享仍由DB綁定且不可修改。正式執行仍在本任務排除範圍。新序列staged boundary已PASS（OrgMaster25／PDM25 governed files），原生PG18重驗已PASS（下段）。先前只改034/086的native PASS是舊source實驗證據，不移用成新序列PASS。


2026-10-21新035/087原生PG18 fresh replay PASS：schema/ACL、雙邊contract read、候選內容正反、DISABLED拒絕及share binding/immutable均通過，維持NOT_READY/DISABLED。原始logs、fixtures、source hashes與cleanup統一引用OrgMaster QA§7及實作工作樹 output/qa/dev-058/native-pg-forward-only-20261021-010919/report.json，不重建多份證據台帳；非PG17 release、enabled atomic apply、正常登入UI、L4或production驗收。原始失敗及舊source結果保留。

管理授權contract直接入口：`contracts/ai-pdm-role-policy-manager/v1/contract-manifest.json`（PDM保存byte相同的consumer copy）；兩個函式只提供鎖與boolean資格，不暴露OrgMaster core資料，也不擴張到所有business request。新source固定驗證與原生競爭狀態以QA§7「鎖後管理授權修正」為準，舊source的01:09 smoke仍保留原hash。

最新035/087 source的原生schema/ACL/validator smoke已PASS；首次loader啟動失敗、重跑結果及cleanup見OrgMaster QA§7與 output/qa/dev-058/native-pg-manager-schema-20261021-0133/report.json。新manager資格正例及鎖等待後的撤權/到期競爭仍未驗，不以schema成功冒充fresh授權行為已通過。


### 11.5 本輪續接（2026-10-21，0254）

本機核心整合已驗證，整體 DEV 仍 In Progress／正式 rollout disabled。

| 現行入口 | 實際結果與證據範圍 |
|---|---|
| OrgMaster test:dev-058:contracts | 7檔37 PASS／1 SKIP；包含三類發布入口、JSONB roundtrip、legacy／未知hash格式及減權／舊draft回歸。SKIP是未帶獨立PG環境的原案例；另有下列native實證，不改其原SKIP旗標 |
| AI-PDM test:dev-123:contracts | 48檔401 PASS＋Node6 PASS；typecheck／route map亦PASS，真實v7 vector及35／14欄契約一致 |
| Build／DB boundary | PDM0227 isolated build PASS（126頁、artifact/primary/cleanup=true，主SQLite原本不存在且仍不存在、容量lease已釋放）；OrgMaster final audit-id build PASS；另有受影響governance store/API/command三檔32 PASS；最終staged DB boundary PASS（OrgMaster25／AI-PDM26 governed files），diff/cached diff check均PASS |
| 隔離PG18 | actual PDM service create/save/preview/apply、同ID併發／重播、draft CAS、stale base與末端audit故障rollback PASS；actual OrgMaster decoder／v2-fenced指派與發布／PDM evaluator完整角色生命週期PASS |
| Targeted browser | PDM role editor actual component/mock API：10 checks、27 screenshots；share actual page/mock API：4 cases、4 screenshots，1440/390無console error／水平overflow。正常登入／HTTP全旅程不在此主張內 |

Native直接證據：OrgMaster實作工作樹 output/qa/dev-058/native-pg-bilateral-audit-id-20261021/report.json（最新共用append guard與最新PDM主線後重驗）。正常domain命令完成PDM新增角色→OrgMaster任用→PDM停用且立即不授權（Org任用歷史保留）→Org撤銷→PDM恢復且不復活任用→Org明確恢復，PDM才重新允許；最後generation=3。任用寫入走actual applyDraftCommand／publishGovernance與identity-fenced v2 writer，沒有用owner DML直接改測試中的任用。初始化workspace／governance／READY／ENABLED是明示owner fixture，Platform auth-state是stub、session為合成；不是正常HTTP／登入browser／Platform／PG17 release／production proof。先前八次執行保留於 native-pg-bilateral-20261021-final/report.json；最新第9次因harness缺PDM_DATA_DIR而失敗，第10次只補task-owned資料目錄後PASS，沒有為此改產品。原始log、實際來源hash及兩個PID/start token／port／task root清理readback均已保存。

這輪實證找到並修正JSONB key重排造成的歷史來源誤拒。新V3 publication與audit使用optional hashFormat=orgmaster.sorted-json.v1，先JSON value roundtrip再排序object keys，array順序保留；三類TS publisher均在同交易補綁版本ID／snapshotHash的audit；版本綁定使用獨立UUID commandId，原business commandId／auditReference／receipt不改。共用append在同一write lock／transaction拒絕任何已存在commandId；實際FMS重用內部publication ID回COMMAND_ID_REUSED且零寫入，原命令重送仍回原receipt。無marker的舊版本及audit沿原exact hash，unknown marker拒絕；commandHash／舊commands.canonicalJson、已套migration與舊receipt未改。部署前須唯讀確認既有未標記V3 audit是否含巢狀detail.scope等資料且仍能通過原exact chain驗證；若JSONB排序已失去原preimage，需先另行處理相容性，不以新marker補算或放寬舊驗證；本輪未讀正式資料，不能假稱已確認無此舊資料；既有bootstrap／rekey producer保持legacy且未執行。Legacy catalog metadata只忽略object key順序，欄位集合／值及array順序仍須完全相同。

純減權發布依actual isGovernanceReduction與owner-bound歷史驗證，不把舊stored generation當live catalog CAS；新增／恢復仍驗current tuple、fresh actor及revision。切換active version時，舊draft只能用可信owner歷史證明可讀；authority仍取已發布版本，draft不能自行授權。

PDM已補submission list/detail/search的canonical group與分頁前過濾、原檔／ZIP逐成員view+download及storage前後重驗、numbering export讀取的實際內容群組、Preview／recognition完整verified initiator及worker當前Principal/session/grant／實際來源重驗。088保留舊job NULL且提醒重試；089將transfer metadata綁定新registry hash。Org035與PDM086～089只套於task-owned PG18，正式migration／資料／部署／traffic／IAM／Secret均未操作；source初始仍NOT_READY/revision0及DISABLED/generation0。

尚未關閉：正常登入HTTP/browser旅程、20action全部caller與CG01/02逐案驗收、QA24/52完整case closure、required CI及另行授權的正式首次切換。上述局部PASS只支持實際層級；不以mock browser或native synthetic session冒充正式L4。DEV121/122最新遠端main=02239aaeaac82702bbc8c4d58b38d47fca051afe已合入PDM分支540a0013b3bc8dbb6f4751f15d87494c159126f5；這次主線差異只有兩個release-recovery程式／測試，app／worker／SQL未變。任務120條path在合併未改，0227 build的app輸入維持，無須重建；先前77檔raw SHA保存紀錄仍是歷史證據。同範圍待驗不推成外部任務阻塞。
