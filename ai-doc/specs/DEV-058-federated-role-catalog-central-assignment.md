# DEV-058：各系統管理角色、OrgMaster 集中配人

修訂：2026-10-23。Owner：`ORGMASTER/DEV-058`；協作：`AIPDM/DEV-123#role-permission-editor`。

[任務](../dev_task.md#dev-058-federated-role-catalog-central-assignment) · [驗收、狀態與證據](../qa/DEV-058-dynamic-role-assignment-validation-plan.md) · [ADR-007](../adr/ADR-007-external-role-catalog-assignment-boundary.md#2026-10-12-b-dev058)。PDM 工程契約為其 `.ai-doc/specs/DEV-123-role-permission-editor-contract.md`；實際工作樹與證據來源只記在 QA。本輪不執行正式 migration、部署或正式資料寫入。

<a id="0-本輪可獨立交付切片"></a>

## 1. 目的與責任

**B方案：PDM 定義角色與能力 → OrgMaster 管理者配人並發布 → PDM 依當前政策判權。**

| Owner | 責任 |
|---|---|
| AI-PDM DEV-123 | 角色／能力矩陣、registry／範本／優先序與 deny、原子 apply、最終業務判權 |
| OrgMaster DEV-058 | 任用、scope／期間、推薦／採用、代理、撤銷、任用發布及 audit |
| 合格管理者 | 任用是否適當、調職後保留哪些角色、恢復及例外判斷；系統就地提醒 |

PDM 流程為保存草稿 → 唯讀預覽差異 → 單一 apply 生效；OrgMaster 只讀 committed current，沿自己的任用草稿／發布。延用既有入口與交易，只做這次 AI-PDM 對接；不另建 permission service、組織圖自動授權、maker-checker、風險分數或提醒逾期凍結，也不加入 SaaS／多租戶條件。

## 2. 角色身份與呈現

以 `applicationId + stableRoleId` 識別角色。改顯示名不換 ID；停用保留身份與歷史，語意換成另一角色才用新 ID／重新任用。七個日常 profile 不得刪成只有七個歷史身份：九個既有 ID／code／原名稱與 catalog 順序保留。

| 日常選項 | stableRoleId／roleCode | 限制 |
|---|---|---|
| RD | role-rd／rd | 原「研發人員」身份保留 |
| RD主管 | role-rd-manager／rd_manager | 原「研發主管」身份保留 |
| QA/QC | role-qa／qa | 名稱不代表審核／管理資格 |
| 生產人員 | role-manufacturing／manufacturing | 沿原 scope／期間 |
| 採購／生管 | role-procurement／procurement | 新任用只用此 canonical ID |
| 外部專員 | role-external-specialist／external_specialist | project-only、manual direct、有限到期、不可代理 |
| PDM管理員 | role-pdm-admin／pdm_admin | 不因名稱取得特權 Principal |
| active custom | `role-custom-<uuid>`／`custom_<uuid去hyphen>` | producer 生成；workspace／employee／app_admin；排在日常角色後 |

`role-production-planning/production_planning` 為 `legacy-only`，`permissionRoleId=role-procurement`：原任用可讀、可撤銷，仍合法時由 PDM 按 canonical 政策判權；不新增／restore 此別名任用，不改原 ID、catalogVersion、scope、期間或 priority，不合併任用／union scope。alias 與 canonical 停用／恢復同步。

`role-system-admin/system_admin` 為 `hidden-protected`，只走既有特權入口：當前 exact human_privileged Principal、direct global、禁止自授；同 Employee 的另一 Principal 不繼承。custom 不可指定 alias／global／principal／特權 metadata。

新任用須 `selectable + active + assignable` 且 subject／scope／期間合法；完整身份 9..64 列、唯一性及合法字串等輸入邊界保留。legacy current 維持原九身份語意；grouped dynamic current 才套 profile／disposition，不由 UI／環境變數猜格式。

## 3. 讀取契約

| versioned 物件 | 用途 |
|---|---|
| `ai_pdm_contract.v_application_role_catalog_v2` | 唯一 current；完整身份，含 inactive／alias／system_admin |
| `ai_pdm_contract.v_role_policy_publications_v1` | immutable 歷史；按必要 catalogVersion 去重讀取 |
| `orgmaster_contract` manager v1 lock／eligibility | 035 獨立管理資格 fence |
| `orgmaster_contract.v_ai_pdm_principal_effective_grants_v4` | 現行任用投影；欄位／manifest／applied029 不改，grant 存在不等於能力 Allow |

current／history 的固定 **34 欄、順序及 signature**只以 PDM `config/access-control/ai-pdm-role-policy-contract-v2.manifest.json` 的 producer 為準，不在文件重抄。必須包含 `lifecycle`，不含 `activation_generation`。固定 SELECT、snake_case→camelCase；不用 SELECT * 或 client 指定來源。版本保留真 bigint 非負十進位字串，不轉成不安全 Number。

單操作一次讀 current：驗全列 header／身份唯一／catalog 順序；UI 另按 presentationOrder 排序。current v1／v2 指向同一 active pointer；history 驗 version→hash 唯一及原 identity，只有 active／retired 可作 provenance，draft 不可授權。

dynamic 使用 `ai-pdm.role-schema.flexible.v2`、`ai-pdm.role-profile-schema.v1`、`jenfu.canonical-json.v1`。驗來源 ACL、schema、identity／profile／alias／status、subject／scope、canonical contentHash／roleDefinitionHash／identityHash 及受控 baseline／protected 綁定；不能只信 DB 自報 hash 或從 payload 自學基線。roleProfiles 按 catalog 身份順序重建，不按 UI 順序算 hash。

legacy v5／v6／v7 用各自 exact artifact，更早 pinned history 只作原 provenance；舊 bytes／hash 不重算，新增 header 不進舊 preimage。registryHash 保留規範語意，不含 route／helper 路徑、測試名或時間；合法 custom／能力變更不需逐版 source allowlist。

OrgMaster 不複製 PDM 的 20 動作、editor／route／範本規則引擎。schema／授權語意不相容時停止依賴它的新授權並修契約；禁止 static fallback、union 或用舊能力補權。

## 4. DTO、命令與結果

角色 metadata 沿既有身份／scope／任用限制，增加 `permissionRoleId,presentationName,presentationOrder,assignmentDisposition`；status 取 role_status，畫面用 presentationName，歷史保留原名稱。current binding 只用 `{catalogVersion,catalogSha256}`（hash=64hex）；schema／registry／identity／profile／protected 驗證留在 server。

沿 `ExternalRoleCatalogSnapshotV2` 承接新 metadata；舊 V1 snapshot、GovernanceDocumentV3/schemaVersion3、assignment-governance-v3、snapshotHash／audit bytes 不重寫。內部 UI／API 同批升級，不加協商 header 或平行封套；已對外發布的 closed projection／特權 DTO 保留原版，真有外部需求才另版。

API 前綴 `/api/orgmaster/governance`，沿 verified session／Origin／JSON、manage／simulate／publish 與特權資格：

| 入口 | 契約 |
|---|---|
| POST /validate/assignment | 普通任用輸入 → valid／issues／current tuple；預檢不授權 |
| PATCH /draft | expectedRevision、expectedOrganizationRevision、expectedCatalog、原 command；server 重驗 |
| POST /versions | commandId、reason、上述 CAS／tuple、organizationVersionId；任用／snapshot／audit 原子發布 |
| POST /active-version | commandId、reason、versionId/null、上述 CAS／tuple；依實際差異區分擴權／減權 |
| GET /commands/{commandId} | 當前 manage 資格查 own audit 原結果，不依賴 PDM current |
| 原推薦／adoption／特權入口 | 共用 current context／history；保留各自資格與 receipt |

一般新增／擴權必填 expectedCatalog，舊 client 缺值或 tuple 不符回 409／重新載入。manual 只收 id/applicationId/employeeId/roleId、scope、validFrom/validTo 及受控 metadata；身份、provenance、actor／audit 由 server 產生。更新保留原身份，換人／role 另撤銷再新任用；代理從原 sourceAssignment 推得身份／catalogVersion，再驗 scope／期間包含。

沿原 command／audit 防重：新 commandHash 納 operation、verified actor、normalized payload、治理／組織 CAS 與 expectedCatalog；舊 preimage 不回算。結果併原 audit 的 `commandResult={operation,outcome,entityType,entityId,versionId?}` 並納新 eventHash，成功 noop 也留可查紀錄；不加第二份命令／receipt 表。

結果 shape 沿 `{status:committed|not_observed,commandId,commandHash,auditReference,entityType,entityId,occurredAt,result}`。committed 回原結果，legacy 無結果則 null 並只宣稱有提交證據；not_observed 的證據欄為 null，不代表已證明未提交。丟回應先查原 ID／同 ID 同內容重送，異 actor／內容拒絕，不換 ID 盲重試。合法 replay 仍驗當前資格，先於新操作 CAS／current 檢查；response revision 是現在值，UI 另 reload，不當原 commit revision。沿 401/403/409/422/503、no-store；HTTP 成功不代表 PDM 業務 Allow。

## 5. 授權與交易不變條件

- 能力變更不重寫任用；inactive 禁新增／擴權，但可讀可撤銷，其他 active role 繼續判權。角色恢復只讓未撤銷、未到期、scope／來源仍合法者可能再生效；不等於 assignment restore。
- manual 調職／改名由人檢視，不自動授撤；position_adoption 來源失效仍 Deny，不轉永久 manual。身份 inactive／撤權／到期／非法 scope 必須拒絕，不能只提醒放行。
- ordinary assignment restore 沿 DEV-037 ID-only manual／有效 Employee／current selectable；舊 catalogVersion 可由可信 history 驗證。revoked-only REMOVE 須無 delegation 引用，只移 draft 列，history／audit 保留。
- 發布／切回版本若新增 active、revoked→active、擴 scope／延長期間，需重驗新授權；未變 inactive 原列可留。減權仍驗當前 actor、可信原資料與 continuity／特權 guard。
- 單操作沿 existing mutex／persistence transaction：own audit＋fresh actor → 合法 replay → 新操作 CAS → 凍結一次已驗 current／必要 history → validate／mutate／audit → fresh actor／組織 fence → COMMIT。保持 READ COMMITTED，同 context 傳 read／preview／persist，不跨 request cache，不跨 owner core 取鎖。
- PDM 先 apply D2、Org 才讀 current：舊 tuple 409、零寫入。Org 先凍結 D1、PDM 後 apply D2：合法任用可依 D1 provenance 完成，PDM 新請求依 D2；不承諾跨 owner 同時 commit。actor 等鎖期間被撤權仍須取鎖後拒絕。
- PDM current／history 不可用時拒絕新授權。查閱／減權只有 own 原資料、已存可信 snapshot、audit、當前 actor 及既有 guard 可核實才繼續；不足停止該操作。Org 管理 HTTP 故障暫停配人，PDM 不新增此 HTTP 依賴；共享 DB／IdP 仍是依賴，沒有 stale ACL 保底。

## 6. DDL 與回復

不再以 readiness／compatibility 宣告、generation、enablement receipt 作日常任用／PDM apply 前置；首次 dynamic 或外部契約改變才做實際 consumer 相容驗證，證據沿既有 QA／CI／release。

034／035 保留原文；035 manager v1 的取鎖後 Principal／session／link／direct global grant 與最小 ACL 保留。新增 036 **只可退役未配置初始單列**（NOT_READY／revision0、hash／source／enablement 全空）的舊宣告 view／table／manifest；configured／READY 拒絕整筆交易，不 CASCADE、不刪任用／audit／manager 函式、不授 runtime DDL。實際正式狀態／依賴不符時停止這項 DDL，在原 DEV 釐清。

首次交付沿雙方既有流程：**PDM 086–088 schema-only（保留 v1／legacy 判權）→ Org 034–036 相容 consumer → 真實相容驗證 → PDM writer → 管理者 apply**。Org 沿 `deploy:production` 的固定 `--dev058-role-policy-append`／`--dev058-infra-ref`；精確 prefix、追加、續跑及 checksum 只由 [既有 profile](../../config/release/dev040-orgmaster-independent-production-v3.json) 與執行器維護，不接受任意 SQL。後續普通發布仍 `UNCHANGED_VERIFIED`／零 DDL；不新增 mode、workflow、IAM 或人工關卡。

legacy 新寫入於受控 dynamic 切換後退場，保留歷史 decoder／原 bytes；不留長期雙可寫模式或環境開關 fallback。dynamic 後回復用相容 reader／新 policy 版本，不部署 static-only、不 down migration。正式來源、相容窗口、發布及回復沿 [AGENTS](../../AGENTS.md)／DEV-040 既有控制。

## 7. 開發與驗收

修改既有 reader、types／validation、store／API、推薦與指派 UI，重用發布／persistence。[QA §4](../qa/DEV-058-dynamic-role-assignment-validation-plan.md#4-單一驗證路徑與證據重用) 是唯一選驗入口：引用有效證據，只補受影響缺口，回填原 24 項目的。OM-C／H／CG 都是交接或覆蓋索引，不另設 runner、報告或簽核；required CI 共用既有 QC，純文件走同一 check 的 diff 分支。

<a id="8-關卡與驗收"></a>
<a id="9-ai-pdm-交接"></a>

## 8. AI-PDM 交接

| 原交接編號 | 雙方責任 |
|---|---|
| H1／H2 | PDM 提供 34 欄 manifest、published canonical vectors／registry 語意；Org 驗任用需要的 identity／profile／hash／scope／protected；同一次真 SQL 往返確認相容 |
| H3 | PDM 移除日常 state／readiness 依賴；Org 保留 035 manager fence，036 僅冷狀態退役；首次／契約變更共用有效相容證據 |
| H4／H5 | 一次正常雙端旅程對應 Org 24 目的及 PDM 29/30/44/52；Org 17/18/19 真時序另有斷言。兩方各管自己的 writer／QA／release；首次正式操作須有各自既有授權 |

工作樹、待補項目與結果只見 QA；雙方各自的既有授權不互相擴張。

<a id="10-後續邊界"></a>
<a id="11-2026-10-21-本機實作與證據"></a>

其餘 app 接入與調職待檢視清單留後續需求；進度與歷史證據統一在 QA，不在本規格另列執行日誌。
