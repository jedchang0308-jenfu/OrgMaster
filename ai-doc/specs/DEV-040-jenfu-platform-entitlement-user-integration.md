# DEV-040：鉦富平台角色生效與 AI-PDM 既有使用者整合

文件成熟度：`040-R2 V3 = RD Implementation Ready + 架構定案：已定案 / RD Tech Lead PASS / P0=0 / P1=0 / Implementation Complete / DEV-012 S1B-21 PASS / S1C 8／8 PASS / S2 Unlocked；其餘DEV-040 slices維持既有狀態`
狀態：`040-R2 continuous production release owner slice`已依Platform DEV-012 §29完成V3 owner profile、ten-stage workflow、exact candidate origin、entrypoint／rollback與本機驗證；其餘既有local／isolated完成證據不變。S1C完成只解鎖S2，不代表Billing／quota、正式migration、candidate、entrypoint或traffic已完成。Production data／principal、persistent authority與release仍受S2／S3 gate。
節點類型：開發點
優先級：P0
風險等級：High
日期：2026-09-09
來源 ID：`USER-2026-08-30-JENFU-PLATFORM-HCS-4A-5A-6B`、`USER-2026-08-30-JENFU-PLATFORM-HCS-ROLE-RESET-CUTOVER-ADMIN-SCOPE`、`USER-2026-08-30-JENFU-PLATFORM-HCS-PRESTAGE-PILOT-LEGACY-OBSERVATION`、`USER-2026-08-30-JENFU-PLATFORM-HCS-SUPERADMIN-ZERO-TOLERANCE-OBSERVATION-WINDOW`、`USER-2026-09-01-JENFU-ACCOUNT-TAXONOMY-1B-2A-3D`、`USER-2026-09-01-DEV040-ONE-TIME-DIRECT-UUIDV7-REKEY-EXCEPTION`
父開發點：DEV-037
跨 repository 交付：`C:\VIBE CODING\Jenfu-Management-system\ai-doc\dev_task.md` 的 DEV-001／DEV-004～009
架構決策：`ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md` 2026-08-30 amendment

## 2026-09-03 DEV-010 Physical-Topology Successor Notice

- 本契約的OrgMaster domain、identity、role assignment、entitlement、fail-closed與existing-user reconciliation語意不變，既有local／isolated證據仍可使用。
- 三系統共用資料庫的physical target與schema end state由Platform [DEV-010 direct spec](../../../Jenfu-Management-system/ai-doc/specs/DEV-010-three-system-database-consolidation-contract.md)接管：現有`orgmaster`及私有`access_governance`物件映射至`orgmaster_core`；跨app `organization`與publication views映射至`orgmaster_contract`，consumer遷移完成前保留compatibility adapters。
- DEV-010的Platform-only `010-N1A`與三repo `010-N2`均達RD Implementation Ready；N1A只寫`jenfu_infra` bootstrap ledger，不建立OrgMaster migration receipt。OrgMaster app ledger、010 migration、required producer signatures、fixture與single-pool contract由N2C package負責，須先取得N1A 10 unit＋30 QC PASS並完成N2A freeze才可實作。[DEV-010 QA／QC plan](../../../Jenfu-Management-system/ai-doc/qa/DEV-010-three-system-database-consolidation-validation-plan.md)的N2 fixed 48案尚未執行，N1B 10案與R1 15案仍未授權。因此DEV-040 production switch與DEV-006 S4B不得沿舊AI-PDM-named target或尚未驗證的新target直接執行。

## 1. Outcome

讓 OrgMaster 從 local-only 角色指派治理，演進為鉦富管理平台的外部 app role assignment authority：

- OrgMaster 在共同 Cloud SQL logical database 發布版本化唯讀 effective assignment view。
- AI-PDM 以 repository boundary 讀取自己的有效角色指派，仍由 AI-PDM 決定 permission 與最終 allow / deny。
- AI-PDM既有帳號保留Firebase UID、`pdm_user_id`與生命週期；human identity對帳至active OrgMaster employee，legacy shared account非破壞退場，不重建或刪除帳號。
- 具授權的角色管理者發布後，所有外部 app role 直接生效；不依 high-risk metadata 增加第二人核准，但每次異動必須可稽核、可撤銷、可對帳。

本文件固定 OrgMaster 在Phase 1的直接RD Contract；跨系統主契約與QA／QC由 Jenfu Management System DEV-001持有。第20節是`040-ID1A／040-ID1B`、第21節是`JMS-PLATFORM-005`、第22節是`JMS-PLATFORM-008`、第23節是`JMS-PLATFORM-009` OrgMaster slice的exact implementation contract；其餘phase仍不是DDL、migration runbook、AI-PDM implementation contract或release authorization。

## 2. Human Decision Brief

- `4A / Human Confirmed`：Phase 1 採 `access_governance.v_effective_role_assignments_v1` 作為同一 logical database 的 versioned read-only pull adapter。
- `5A / Human Confirmed`：human共同IAM subject必須唯一對應active OrgMaster employee；AI-PDM現有帳號全部納入inventory，再依account taxonomy分流migration／retirement。
- `6B / Human Confirmed`：所有外部 app role 由具授權的角色管理者直接生效；Phase 1 不設 maker-checker。
- `7B / Human Confirmed`：AI-PDM 既有 role 全部重設，不 mapping、不匯入、不給全員預設 role；切換後只有 OrgMaster assignment 能授權。
- `8A / Human Confirmed`：cutover 採 dry-run、freeze、分批 authority switch、session invalidation、reconciliation 與 rollback point，不採一次切換或長期雙權威。
- `9A / Human Confirmed`：可直接生效的管理能力採 app-scoped role administrator；管理員只能治理被授權 application。
- `10A / Human Confirmed`：cutover 前可建立待生效 OrgMaster assignment，但不得出現在 effective view 或提前授權；只在所屬 batch authority switch 時原子啟用。
- `11A / Human Confirmed`：第一批採涵蓋一般使用者、主管與管理員的小型 cross-role pilot；pilot 通過 gate 後再按部門分批。
- `12A / Human Confirmed`：AI-PDM legacy role 欄位於切換後保留唯讀觀察期，不再參與授權；完成 reconciliation 與 rollback window 且通過移除 gate 後才移除。
- `13B / Human Confirmed`：OrgMaster 超級管理員永久具有跨 app role-management override；這是 app-scoped 管理邊界的唯一例外，一般 OrgMaster admin 仍不得跨 app。
- `14A / Human Confirmed＋Safety Refinement`：任何P0／P1 authorization mismatch或非預期擴權／失權零容忍；session refresh pending停止下一批並由durable outbox重試，只有protected request仍出現錯誤授權才rollback，不回滾已提交撤權。
- `15A / Human Confirmed`：legacy role 自最後一批通過起唯讀保留 30 日或兩個 production release cycle，取較晚者；雙方 owner 簽核 reconciliation 且 rollback dependency 解除後才移除。
- `1B / Human Confirmed`：互動使用者一人一個公司managed identity；需公司郵件者使用Google Workspace，只需內部系統者可用Cloud Identity Free。個人Gmail僅作有期限例外，員工編號只可作登入alias。
- `2A / Human Confirmed`：移除泛用／共用管理員帳號；一般管理角色直接指派employee。`info@`／`sales@`等共用信箱退出平台登入、principal mapping與role assignment，mail用途可保留。
- `3D / Human Confirmed`：一般app-scoped管理與組織資料維護使用日常個人identity＋step-up；基礎設施、production switch、OrgMaster super-admin／cross-app override與授予管理能力使用同一employee下person-specific privileged identity。
- `Position-to-Role / Human Confirmed`：採`User → Position → Application Role → Permission`，不採`Position = Role`；Position只產生角色建議，經app-scoped role administrator發布後才形成有效assignment。`#效用理論`
- `App-local Role UI / Human Confirmed`：一般角色指派治理放在各app；AI-PDM採`Role → adopted Position → Employee`與集中職位設定。AI-PDM BFF呼叫OrgMaster governance API，OrgMaster仍是canonical assignment／version／audit authority。
- `Intentional Replacement`：取代 ADR-007 原本只列 API／manifest／event adapter，以及 high-risk 外部角色另行申請／核准的 future target。
- `Intentional Replacement`：取代「四筆AI-PDM帳號都必須映射employee」與「`info@`可承接管理角色」的舊假設；歷史`ready=0 / missing_employee=4` evidence保留，不回寫。
- `Intentional Replacement / One-time Exception`：`040-ID1`只對目前 OrgMaster 資料集中的非UUIDv7 Employee ID執行一次性直接rekey，既有有效UUIDv7原值保留；同步重寫所有受影響reference，並以一份新V8 baseline取代舊版本。舊 Employee ID、舊 organization version與舊變更追溯不是本次保留條件；不建立產品級 legacy mapping。此豁免不改變 AI-PDM `info@`非破壞退場及 role authority cutover 決策。
- `Evidence Preserved`：DEV-037 local-only V2 程式、版本、audit 與 QA/QC 不回寫，也不作為 DEV-040 已完成的證據。

決策來源：2026-08-30 使用者於 HCS 引導模式完成原角色／cutover決策；2026-09-01確認帳號治理`1B、2A、3D`，並對`040-ID1`確認一次性直接 UUIDv7 rekey 豁免。

## 3. Current-state Evidence

AI-PDM 已具備可遷移的 identity bridge：

- `db/schema.sql` 與 PostgreSQL schema 的 `platform_principal_mappings` 以 `pdm_user_id` 唯一連回既有 `users`，並可保存 `mapping_source='shared_iam'`、`mapping_status` 與 `external_subject`。
- `src/lib/firebase-platform-principal-repository.ts` 以 Firebase UID 查詢 `external_subject`，再解析既有 AI-PDM user、company、account lifecycle 與 role。
- Firebase session contract 的 `subject` 是 Firebase UID；既有邀請流程也以 `firebase_uid ↔ pdm_user_id` 保存關聯。

因此 migration 預設保留 Firebase UID 與 `pdm_user_id`。email、姓名與員工編號可能協助對帳，但不是 stable identity key。各環境仍須在implementation／release preflight驗證共同issuer；canonical identity必須是 `issuer + subject`，不得只因UID字串相同就跨issuer合併。

2026-08-30初始規劃只讀schema／code；2026-09-01 production-bound read-only reconciliation另盤點4筆帳號但未輸出個資。後續人工情境確認其中3筆為可歸責個人身分，`info@jenfu.com.tw`為多人行政共用帳號；此分類仍待新classifier與owner gate落實，未修改AI-PDM repository或production資料。

## 4. Responsibility Contract

| 事實／動作 | Authority | Phase 1 contract |
|---|---|---|
| IAM credential、MFA、stable subject | 共同 IAM | OrgMaster 與 app 驗證相同 issuer；不保存密碼／MFA secret |
| Employee canonical ID | OrgMaster | 新建時產生UUIDv7、immutable、無業務語意；employeeNumber分離；既有非UUIDv7資料以一次性直接rekey、有效UUIDv7原值保留，受影響reference重寫後形成新V8 baseline，不保留legacy-ID mapping |
| employee active / inactive 與 human principal mapping | OrgMaster | 平台准入的必要條件；一employee可連多個person-specific identity，但每個human issuer+subject只屬一employee |
| shared mailbox／legacy shared account | Google Workspace／AI-PDM legacy | 不作employee principal、不登入平台、不取得role；mail delegation／group可保留，歷史actor不可改寫 |
| 既有 AI-PDM user 與 Firebase UID 關聯 | AI-PDM migration source | 保留 `pdm_user_id`／UID；只經 migration contract 連到 OrgMaster employee |
| Position與employee-to-Position assignment | OrgMaster | 組織事實與角色建議來源；不等於Application Role或Permission |
| Position-to-Application-Role recommendation policy | OrgMaster governance | 由目標app的role administrator管理；只產生建議／預填，不直接授權 |
| employee → external app role assignment | OrgMaster | 建立、發布、撤銷、有效期、scope、delegation 與 immutable audit |
| cross-app role-management override | OrgMaster super administrator | 永久 capability；只接受person-specific privileged principal，每次使用需強驗證、reason、before / after、immutable audit 與即時安全告警 |
| effective assignment read model | OrgMaster | 發布 versioned access view；app-scoped read-only grant |
| Application Role catalog | 各 app | stable role ID／code、version、status、assignable、risk metadata |
| role → permission 與最終 enforcement | 各 app | AI-PDM 每次敏感操作 server-side fail closed |
| app registry／入口 | Jenfu Platform | 依有效 assignment 顯示 app；不是授權 authority |

## 5. Target Flow

### 5.1 Existing user reconciliation

1. 由 migration job 讀取 AI-PDM 既有 `pdm_user_id ↔ Firebase UID` 關聯，產生不含 credential 的 dry-run inventory，先分類`human_personal`、`human_privileged`、`legacy_shared`與`service`。
2. human identity以 `issuer + subject` 對帳 OrgMaster principal；員工編號／email／姓名只形成候選與人工核對依據。每個identity只可連一個employee，一個employee可連多個person-specific identities。
3. human identity唯一對應active employee者標為`human_ready`；無對應、多重對應、inactive、重複subject、資料衝突者進exception report。`legacy_shared`不得為通過gate而映射employee。
4. 人工處理例外後重跑dry-run；結果必須冪等且counts可重現。新gate固定為`human_accounts_expected=3`、`human_accounts_ready=3`、`legacy_shared_accounts=1`、`legacy_shared_login_enabled=0`、`unresolved=0`。
5. 正式切換只建立／更新human mapping，不重建Firebase identity、不改`pdm_user_id`、不要求使用者重設密碼；mapping只可指向已完成UUIDv7 canonical migration的Employee。
6. 既有AI-PDM role只進inventory／對帳，不建立role mapping、不匯入OrgMaster，也不轉成預設role。若切換時沒有有效OrgMaster assignment，該使用者在新權威下一律無AI-PDM role。
7. 現有`info@`先盤點實際使用者、補個人managed identities與employee roles、驗證mail／業務替代流程；之後才停用shared platform login並標記`retired_legacy_shared`。不得刪除帳號、重寫歷史actor或綁到employee。

### 5.2 Assignment direct activation

1. app-scoped role administrator 在 OrgMaster 選 employee、application、role、scope 與 validity。
2. Server 驗證管理者具有該 application 的角色治理 capability，employee active、role catalog/version 有效、scope 合法且不存在 self-elevation / privilege escalation；一般 OrgMaster admin 或其他 app 管理員不能跨 app 指派。一般app-scoped管理者使用日常個人identity，但敏感mutation需近期re-auth／step-up。只有同一employee下明確person-specific privileged principal可行使OrgMaster super-administrator／永久cross-app override，且每次需強MFA、短session、reason、before / after、immutable audit與即時安全告警。
3. 同一位具權限管理者可直接發布，不需第二人核准；發布理由必填。
4. OrgMaster 原子保存 assignment version 與 immutable audit，並發布 effective view。
5. AI-PDM 透過 `EntitlementRepository` 讀取自己的有效 assignment，再套用 app-owned permission mapping。
6. 撤銷、到期、employee inactive、catalog role invalid 或 view contract mismatch 時 fail closed；session cache 必須依 version / TTL / revoke policy 失效。

### 5.2A Position-assisted role assignment

1. OrgMaster以stable `position_id`與active Position assignment作為建議來源；Position名稱、部門名稱或同名Role字串都不能作授權join。
2. versioned Position-to-Role policy可讓一個Position建議零到多個Application Role，也允許多個Position重用同一Role；policy只能引用app role catalog，不包含Permission或Role-Permission mapping。
3. Employee新任Position或policy新增／擴權只產生recommendation／draft。管理者在5.2流程檢視來源Position、Role、permission摘要、scope、validity、risk、before／after與reason後，才能發布。
4. recommendation、dismissed、stale、draft與pending review不得進effective view、claim、cache或Portal visibility。相同Role可去重但須保留所有來源；scope衝突不得自動取聯集。
5. published assignment私有provenance至少保存`assignment_basis`、`source_position_id`、`source_position_assignment_id`、`source_position_revision`、`position_role_policy_id/version`與publisher evidence；V1對外view欄位維持不變。
6. Position改名不改Role／Permission。position-based assignment的source Position assignment結束時，該entitlement立即不再effective並失效session／cache；manual assignment不連帶撤銷。
7. Policy變更不回寫歷史published assignment，只建立新建議與需複核清單。current phase不啟用自動provisioning；任何未來低風險自動化需另過Human Decision Gate。

完整跨系統契約與效用比較以[Jenfu Platform DEV-005](../../../Jenfu-Management-system/ai-doc/specs/DEV-005-position-derived-application-role-assignment.md)為準。

### 5.3 Staged authority cutover

1. 先執行不寫入的 identity／assignment dry-run，將 ready、exception、待重配與 batch counts 對帳。
2. app-scoped role administrator 可在 cutover 前建立待生效 assignment；建立時即驗證 identity、catalog version、scope、validity 與 completeness，但資料不得出現在 effective view，也不得影響任何 AI-PDM authorization。
3. exception 達到人類接受門檻後，進入短暫角色異動 freeze；freeze 期間禁止 AI-PDM legacy role 與 OrgMaster assignment 發生未納入 cutover 的競爭寫入。
4. 第一批採涵蓋一般使用者、主管與管理員的小型 cross-role pilot；pilot 通過登入、allow / deny、撤銷、session invalidation、audit、reconciliation 與 rollback gate 後，才依部門切後續 batch。
5. 每一批 authority switch 必須在同一受控切換邊界中啟用該批預先配置的 assignment，使 legacy role 退出授權並更新 effective view；不得先啟用 assignment 再等待 app 切權威。
6. 每批切換後使受影響 session 失效，再從正常 Portal／AI-PDM delivery path 驗證 identity count、assignment count、deny cases、audit 與可觀察 UI / API 結果，通過後才能進下一批。
7. 任一 P0／P1 mismatch、非預期失權／擴權或 session 未失效時，容忍值為零：立即停止該批與後續 batch，並原子回到該批 rollback point。rollback 可使受影響 batch 切回單一 `legacy-authority` adapter，但不得同時接受 legacy role 與 OrgMaster assignment。
8. 正常 cutover 狀態下，legacy role 欄位只可唯讀供 reconciliation 與 rollback observation 使用，任何 UI、API、job、repository 或 cache 都不得再以它授權。自最後一批通過起保留 30 個日曆日或兩個 production release cycle，取較晚者；期限屆滿、OrgMaster 與 AI-PDM owner 簽核 reconciliation、無未解 P0／P1 且 rollback dependency release 後才可 archive／remove。

### 5.4 Read-only view boundary

`access_governance.v_effective_role_assignments_v1` 的canonical欄位已由跨系統主契約固定為 `contract_version`、`assignment_version`、`assignment_id`、`application_id`、`principal_issuer`、`principal_subject`、`employee_id`、`stable_role_id`、`role_code`、`catalog_version`、`scope_kind`、`scope_key`、`valid_from`、`valid_until`與`published_at`。時間區間採 `[valid_from, valid_until)`；view只輸出當下effective row。

canonical底層table不授權app runtime。每個app只能取得server-owned、security-barrier的app-filtered projection／grant；AI-PDM只能看`application_id='ai-pdm'`。確切DDL、index與physical wrapper name留待RD Implementation Ready，不得因此改變column／row visibility contract。

AI-PDM runtime role只能取得本 app 的 contract read 權限；不能讀 OrgMaster 私有 table、取得其他 app assignment、寫入 `access_governance` 或依任意跨 schema join 繞過 contract。

## 6. Current Phase Scope

### In scope

- OrgMaster Cloud SQL persistence repository adapter已完成default-off實作與candidate驗證；`access_governance` publisher contract仍待DEV-040後續slice。
- 版本化 effective assignment view、app-scoped DB grants 與 repository replacement boundary。
- AI-PDM 既有 principal inventory、active employee reconciliation、exception report、冪等 migration 與對帳。
- account taxonomy classifier、非UUIDv7 Employee一次性直接rekey／有效UUIDv7保留／受影響reference完整重寫與`legacy_shared`非破壞退場gate。
- 外部角色單一授權管理者直接發布、reason、before / after、revoke 與 immutable audit。
- Position-to-Application-Role recommendation policy、來源provenance、需複核與source Position失效fail-closed契約。
- AI-PDM role catalog／permission enforcement integration contract。
- dry-run、cutover、session invalidation、rollback、reconciliation 與 cross-repo QA/QC plan。
- app-scoped role-administrator capability 與跨 app deny boundary。

### Out of scope

- AI-PDM產品程式、existing-user migration、entitlement projection、production Firebase／OrgMaster deploy與persistent Cloud SQL authority switch仍不在已完成範圍；OrgMaster persistence產品程式只依DEV-006 direct spec實作default-off adapter。
- 以 email／姓名自動合併 identity，或 first-login 自動建立 employee。
- 立即刪除／停用現有`info@`、重寫歷史actor，或把共用信箱綁到employee以取得PASS。
- 讓日常personal identity繼承同employee的privileged capability，或用泛用／多人共用管理帳號行使高權限。
- 讓 OrgMaster 定義 AI-PDM permissions 或 role-permission mapping。
- 把Position當成Application Role、以職位／部門名稱自動授權，或讓新任職自動取得effective entitlement。
- 將 legacy AI-PDM role 自動映射／匯入 OrgMaster，或讓 legacy role 與 OrgMaster assignment 長期雙權威。
- 讓 Portal 成為所有 app API gateway 或授權判斷者。
- high-risk maker-checker、多階段角色審核或把 app 領域審核搬到 OrgMaster。
- ProJED integration、production deploy、remote migration、release 或 production smoke。

## 7. Acceptance Contract

- 每位 ready AI-PDM 使用者保留原 Firebase UID 與 `pdm_user_id`，且唯一對應一筆 active OrgMaster employee。
- Employee canonical ID對新建與遷移後資料皆為immutable UUIDv7；當前資料內的Employee reference必須同步改寫為UUIDv7，新V8 baseline不得殘留semantic ID或legacy-ID mapping，employeeNumber不作PK或credential。
- fresh reconciliation為3筆human ready、1筆legacy shared且shared platform login disabled、unresolved=0；舊`ready=0 / missing_employee=4` receipt只是當時快照，不是新baseline保留或activation驗收條件。
- 共用信箱無employee mapping、role或新app session；非破壞退場完成前保留現有使用，不得造成AI-PDM或行政mail中斷。
- migration dry-run、正式執行與重跑有可對帳 counts；例外不被靜默忽略或自動合併，evidence 不洩露個資。
- 無 active employee mapping、無有效 assignment、role / catalog invalid、撤銷、到期與 scope mismatch 時 AI-PDM 後端拒絕受保護操作。
- 既有 AI-PDM role 即使仍存在於歷史資料，只要沒有 OrgMaster assignment，就不能在新權威下取得 AI-PDM 權限。
- 具授權管理者的角色發布可直接反映到 effective view；沒有第二人核准，但 unauthorized actor、self-elevation 或越 app scope 一律拒絕。
- AI-PDM app-scoped role administrator 不能指派 OrgMaster 或其他 app role；一般 OrgMaster admin 不自然擁有 AI-PDM 角色治理 capability。
- OrgMaster super administrator 是唯一跨 app override；每次 override 均有 reason、before / after、immutable audit 與即時告警，一般 OrgMaster admin 不得因職稱相近取得該 capability。
- app-scoped管理者以日常person-specific identity＋step-up操作；super-admin／infra／production switch只接受同一employee下獨立privileged principal，且capability不傳播到其他linked identity。
- 待生效 assignment 可被審閱與計數，但在所屬 batch switch 前不得出現在 effective view、session claim、cache 或 AI-PDM allow decision。
- audit 可重建 actor、reason、before / after、app、role、scope、validity、catalog / assignment version 與時間。
- AI-PDM runtime DB role只能讀自己的 versioned contract，不能跨 schema 寫入或看到其他 app entitlement。
- staged cutover 每批都有 dry-run baseline、freeze boundary、session invalidation、pass / rollback gate 與 reconciliation；rollback 不刪除 identity、歷史 assignment 或 audit，也不形成無期限雙權威。
- P0／P1 mismatch或非預期擴權／失權的容忍值為零；session refresh pending停止後續batch並重試，只有protected request仍錯誤授權才將受影響batch回復至reviewed單一前一權威。
- cross-role pilot 必須同時覆蓋一般使用者、主管與管理員，且登入、allow / deny、撤銷、session invalidation、audit、reconciliation 與 rollback evidence 全部通過後才能開始部門 batch。
- legacy role 在正常觀察狀態唯讀、不可修改且不參與 authorization；自最後一批通過起滿 30 日或兩個 production release cycle（取較晚者），並由 OrgMaster／AI-PDM owner 簽核對帳、解除 rollback dependency 後才能 archive／remove。
- Position與Application Role保持不同stable entity；新任職／mapping擴權只產生recommendation，未發布不生效。
- Position改名不改權限；position-based assignment的來源Position assignment失效時，effective row、session與cache均fail closed；AI-PDM不得直接依Position／department授權。

## 8. Human Decision Gate Result

1. `13B`：OrgMaster 超級管理員永久具跨 app override；不採 time-limited activation 或雙人取用。
2. `14A`：P0／P1授權mismatch零容忍；session refresh pending停止下一批並由outbox重試，只有錯誤授權才rollback。
3. `15A`：legacy role 唯讀保留 30 日或兩個 production release cycle（取較晚者），由雙方 owner 簽核 reconciliation 且解除 rollback dependency 後移除。
4. `1B`：互動使用者採一人一個公司managed identity；Workspace與Cloud Identity依是否需要mail分級，個人Gmail只作有期限例外。
5. `2A`：共用／泛用管理帳號退出平台identity與role model；`info@`採非破壞退場，mail resource可保留。
6. `3D`：一般管理用日常identity＋step-up，高權限用同一employee下獨立person-specific privileged identity。

Phase 1 已無剩餘P0／P1人類產品決策。view／grant語意、migration lifecycle、account taxonomy、shared-account retirement、super-admin capability、alert receipt、P0／P1 detector、UI Entry與QA／QC契約均已固定；非UUIDv7 Employee一次性直接rekey、有效UUIDv7保留、taxonomy authority與redacted projection的exact schema／file／command／recovery／evidence由第20節補到`RD Implementation Ready`。環境principal、實際告警channel與production owner receipt仍留待各自data／release gate。

## 9. OrgMaster Data and State Contract

### 9.0 Employee canonical identifier

- target rule：`Employee.id = UUIDv7`，只由OrgMaster在建立Employee時產生一次，required、unique、immutable、never reused且不含姓名／英文名／部門／到職年／員編語意。
- `employeeNumber`、name、email、department與IAM subject皆為可變attribute／relation；不得反向成為Employee PK。
- 依2026-09-01一次性豁免，`employee-shijie`等非UUIDv7 ID依已封存execution plan同步重寫成UUIDv7；既有有效UUIDv7原值保留。所有目前作業空間、governance當前draft／active policy、management method及其snapshot內有效Employee reference同步收斂。
- apply輸出一份V8 baseline；舊organization version、舊Employee-ID audit與legacy mapping不進新baseline。local JSON三個store不具共同transaction，故以maintenance sentinel＋crash-recovery journal保證最終全成或全退，不宣稱單一原子commit。任一未知reference、重複目標UUID或寫入中斷即fail closed並由task-owned rollback snapshot還原。
- migration完成前，不得建立production human identity link。新Employee建立流程與一般UI不得允許人工輸入canonical ID。

### 9.1 Published assignment lifecycle

OrgMaster draft不是授權事實。published assignment只保存三種生命週期：

- `pending_activation`：cutover前完成驗證與發布，但所屬batch尚未切換；不得進effective projection。
- `active`：所屬batch已是`orgmaster-authority`；仍須通過employee、catalog、scope與validity判斷。
- `revoked`：以新published version撤銷；不得進effective projection。

`not_yet_valid`、`expired`、inactive employee、invalid catalog與scope invalid是計算狀態，不可輸出成effective entitlement。DEV-037的AI-PDM external assignment若為`active + not-synchronized`，migration一律映射成`pending_activation`；舊`revoked`保持revoked。無法唯一映射者進exception，不依名稱猜測。

published version持續immutable，至少保存publisher、reason、catalog version、organization snapshot／reference、before／after assignments、authority batch reference與snapshot hash。catalog或employee後續變更不得回寫歷史version。

### 9.2 Role catalog input

外部app role catalog只讀，至少包含`contract_version`、`application_id`、`catalog_version`、`stable_role_id`、`role_code`、`display_name`、`status`、`assignable`、`risk_level`、`allowed_scope_kinds`與`published_at`。OrgMaster不建立或修改外部permission與role-permission mapping。

catalog stale／invalid／unavailable時，歷史資料可讀，但新增、重新啟用與發布fail closed；不得退回bundled fixture並把它宣稱為live資料。

## 10. Permission and Direct-activation Contract

OrgMaster server必須區分以下能力，UI visibility不能代替server gate：

1. `app-scoped manage`：只可編輯被授權application的assignment draft。
2. `app-scoped publish`：只可發布被授權application；同一位管理者可直接生效，不設maker-checker。
3. `cross-app override`：只由明確OrgMaster super-administrator capability提供；不得由一般OrgMaster admin、Portal admin、職稱或app admin推導。

一般actor不可self-elevation。app-scoped管理者由日常個人identity行使，publish／revoke等敏感mutation要求近期re-auth／step-up。super-admin使用既有override capability不視為self-elevation，但只接受同employee下獨立person-specific privileged principal，且每次必須有強MFA／短session、非空reason、target app／employee／role／scope／validity、before／after、immutable audit與同步安全告警receipt。告警失敗時operation不得顯示或留下已成功狀態；`info@`等共用帳號一律拒絕。

## 11. UI Entry Contract

- Employee identity primary entry（DEV-043 amendment）：Employee仍是人員唯一真相；由正常頂部「員工」進入清單，選定Employee後在相鄰明細「登入身分」查看與管理Employee ↔ identity relation，不新增平行「帳號」主資料module。
- Global governance entry（DEV-043 amendment）：沿用正常頂部／工具列的「角色指派治理」；既有`identity` route key保留但可見名稱改為「帳號治理」，只作跨Employee檢視、異常定位與open-or-focus Employee明細。其後依序為應用角色目錄、角色指派、角色代理、發布版本、稽核、指派檢查。
- Provisioning boundary（DEV-043 amendment）：OrgMaster UI只管理identity relation與狀態；建立、邀請、刪除、停用或搜尋Firebase／Google Workspace／Cloud Identity帳號仍由共同IAM／provider流程與production release gate負責，不得由Employee明細或帳號治理建立第二份credential authority。
- Provisioning orchestration successor（DEV-045 RD Implementation Contract／2026-09-04）：Employee明細的「設定登入帳號」可發起邀請或既有帳號連結，但Browser只提交Employee上下文與非敏感選擇，實際帳號／邀請／驗證由server-side BFF透過provider port執行。投影與UI必須保留本契約的一Employee對多個person-specific identities，不能壓成單一帳號；account type仍由OrgMaster governance admission判定，provider classification不得成為第二權威。DEV-045顯式啟用後，account-enrollment API是identity link mutation的唯一產品HTTP入口，舊current／generic governance identity HTTP mutations fail closed，但server-internal canonical governance command仍共用同一store boundary；Current Phase production server flag預設false且沒有environment activation，不得在正式release gate前先替換production入口。DEV-045已固定exact local ledger、server port／service／route、permission、Employee UI與S0→S4 Gate，Current Phase只可執行local／isolated enrollment foundation；正式共同IAM／Firebase provisioning、Email、production persistence與release仍由本契約的production gate控制。這是UI與治理編排責任的相容細化與intentional successor surface replacement，不表示OrgMaster成為credential authority，也不得以local deterministic adapter宣稱正式帳號或邀請已成立。直接契約：[DEV-045](DEV-045-employee-account-enrollment.md)。
- Normal actor：只看見有權管理的application；role由valid catalog選取，不接受自由輸入external role ID／code。
- Position assistant：顯示目前Position、建議Role、已發布Role、manual Role與需複核原因；接受建議只更新draft，不使用「已授權」文案。
- Position impact：mapping變更前顯示受影響人數、Role差異與來源；多Position scope衝突不得靜默取聯集。
- Publish preview：顯示employee、application、role、scope、validity、catalog version、effect state與before／after，reason必填。
- Result copy：active顯示「已發布並生效」；pending顯示「已發布，將於所屬批次切換時生效」。不得把pending說成已生效。
- Privileged entry：只有super-admin看見分開的「跨應用override」模式；必須有文字風險提示、target、reason、before／after與單次確認，成功顯示audit reference與alert receipt。
- Responsive：遵守OrgMaster最高產品原則。只有至少1024px、hover＋fine pointer且server authorization通過才可mutation；其他viewport read-only，直接進edit URL仍不可寫入。

loading、empty、pending、effective、revoked、expired、catalog unavailable、denied與error皆需文字／icon，不得只靠顏色。keyboard focus、accessible name、錯誤focus recovery與heading順序納入驗收。

## 12. Persistence and Migration Contract

OrgMaster local JSON → Cloud SQL依序執行inventory、dry-run、shadow import、count／canonical hash／version-chain reconciliation、mutation freeze、final import、repository switch與observation。不得雙寫。

- source local document在rollback gate解除前保持唯讀，不刪除、不改寫published bytes。
- 相同source revision重跑不得產生duplicate或新version number；每次有migration receipt。
- switch後服務重啟必須讀到相同active published version、draft與audit。
- failure時target不得成authority，source保持可用；不得用忽略unresolved record取得PASS。

AI-PDM既有principal reconciliation只保存／比對account type、`issuer + subject`、`pdm_user_id`與active employee relation，不移轉credential。結果至少分類`human_ready`、`human_missing_employee`、`human_ambiguous_employee`、`duplicate_subject`、`inactive_employee`、`inactive_pdm_account`、`issuer_mismatch`、`legacy_shared_pending_retirement`、`legacy_shared_login_enabled`、`service_out_of_scope`與`invalid_source`；一般log與文件evidence不得含完整UID、email或姓名。

### 12.1 DEV-006 歷史shadow G1／candidate與cleanup evidence（2026-08-31）

- Platform direct implementation contract：`../../../Jenfu-Management-system/ai-doc/specs/DEV-006-cloud-sql-orgmaster-persistence-implementation.md`。
- additive migration：`db/migrations/002_dev006_orgmaster_persistence.sql`；SHA-256=`253f82d8ab2d3d861dc8c56e96840e9916d6f37ae8743a02455631f008648ac0`。
- CLI完成source inventory、dry-run、shadow import、idempotent replay、isolated activation與runtime active read；production activation guard未開放。
- 固定12／12、P0／P1=0，包含invalid source recovery、restart persistence、OrgMaster runtime direct table deny、Platform／AI-PDM cross-app deny、redaction與owned Compose cleanup。
- 當時G1 evidence：`../../../Jenfu-Management-system/output/dev-006/DEV006-G1-20260831T110155230Z-bb41efa2/`；12／12、P0／P1=0，frozen source為13 artifacts／2 media／784066 bytes。
- 歷史R1 capsule `DEV006-R1-be8d4e071328`以fixed allowlist封裝16項input／4項ordered migrations，逐檔bytes＋SHA-256與aggregate fingerprint通過；dirty worktree不進artifact，unknown artifact risk=0。
- exact target的private-only、zero-traffic restore candidate完成Cloud SQL相容bootstrap、低權限shadow import／replay、rollback-only role verifier與RCN-01～08；Lane 3 preflight blockers=0，decision=`DATABASE_SHADOW_CANDIDATE_VERIFIED_NO_ACTIVATION`。
- 歷史R1 evidence：`../../../Jenfu-Management-system/output/dev-006/releases/DEV006-R1-be8d4e071328/`。完成後Job、candidate、task secrets/images/build sources/local contexts全數刪除；未切repository authority、未deploy、未改traffic或activation。
- 後續activation candidate與default-off product repository adapter已由第18節取代此歷史成熟度；現行authority仍是local JSON。

## 13. Batch Authority and Rollback Contract

每個AI-PDM user batch同時只有`legacy-authority`或`orgmaster-authority`。OrgMaster在cutover前可發布`pending_activation`；batch switch必須在同一受控邊界啟用assignment並切換authority，之後觸發受影響principal session／auth epoch失效。

第一批必須涵蓋一般使用者、主管、app管理員與同employee daily／privileged雙principal；登入、allow／deny、撤銷、session refresh、Platform outage outbox、audit、reconciliation與rollback全部通過後才可進部門batch。任一授權P0／P1容忍值為零，立即停止後續batch；refresh pending保留已提交authority mutation並重試，只有錯誤授權才把受影響batch切回reviewed單一authority。不得雙讀或人工臨時補權代替rollback。

legacy role在正常`orgmaster-authority`下只讀且零authorization read。自最後一批通過起至少30日或兩個production release cycle取較晚者，且OrgMaster／AI-PDM owner都簽核、未解P0／P1為零、reconciliation通過並解除rollback dependency後，才可另案archive／remove。

## 14. QA／QC and Evidence Contract

跨系統驗證計畫為 [Jenfu Management System DEV-001 QA／QC](../../../Jenfu-Management-system/ai-doc/qa/DEV-001-phase1-platform-integration-validation-plan.md)。OrgMaster至少須提供：

- normal role-governance entry與desktop mutation／mobile read-only evidence；
- app-scoped allow、cross-app deny、self-elevation deny與super-admin override evidence；
- daily／privileged persona isolation、shared login deny、UUIDv7全reference closure與shared-account non-destructive retirement evidence；
- pending／active／revoked／expired與catalog failure evidence；
- Cloud SQL migration dry-run／rerun／restart／failure recovery evidence；
- immutable audit、alert receipt、effective projection與app isolation evidence；
- pilot／department batch gate、P0／P1 detector與rollback rehearsal evidence。

DEV-037 local-only evidence只作regression baseline，不可替代DEV-040 fresh evidence。API／DB證據不可替代normal UI Entry，截圖不可替代server authorization。

## 15. Cross-repository Authority

跨系統欄位、Session、Portal、AI-PDM enforcement、delivery slices與總體acceptance以 [Jenfu Management System DEV-001主契約](../../../Jenfu-Management-system/ai-doc/specs/DEV-001-phase1-platform-integration-contract.md) 為準；本文件是OrgMaster直接契約。若兩者出現相反語意，停止implementation並回PM／ADR，不以較新的commit時間自行覆寫。

## 16. Stop Conditions and Re-entry

- DEV-004可依第17節及Platform direct spec allowlist執行；其他選定slice未補到RD Implementation Ready、未固定repo／module／file boundary與可執行驗證前，不得修改OrgMaster／AI-PDM程式或schema。
- 若現有 Firebase UID 無法穩定取得、同一 subject 對應多個 AI-PDM user、需要合併／刪除 production account，停止並回 Human Decision Gate。
- 若需要把shared account綁到employee、在替代identity／role／mail流程未驗證前停用`info@`、改寫歷史actor或直接重編既有Employee references，停止並回PM／data owner。
- 若privileged capability會傳播到同employee其他identity、能由共用帳號行使，或員工編號被當作credential／canonical ID，停止並回ADR／security review。
- 若 access view 無法以 DB grant 隔離 app、需要 app 讀 OrgMaster 私有 table，停止並重新評估 API / event projection。
- 若super-admin告警無receipt、一般admin可取得override、mobile需開放mutation，或cutover必須雙權威，停止並回PM／ADR。
- deploy、production credential、remote Cloud SQL migration 或 release 必須另進 release gate。

### 16.1 下一個 implementation slices：`040-ID1A → 040-ID1B`

`040-ID1A／040-ID1B`目前為`Local Implementation Complete / Targeted QA-QC PASS`。ID1A固定非UUIDv7 Employee一次性direct rekey、有效UUIDv7保留、reference closure與單一V8 baseline；ID1B固定account taxonomy、redacted projection、owner baseline與跨repo IAR v2 generator。RD成果僅限local／isolated gate；不得停用`info@`、建立production identity link、發布role、切repository／authority、改traffic或deploy。

下游consumer contract為[Platform DEV-006第13節](../../../Jenfu-Management-system/ai-doc/specs/DEV-006-cloud-sql-orgmaster-persistence-implementation.md)：ID1B依第20.4～20.6節擁有projection、AI-PDM read-only reconciliation與IAR v2 receipt；Platform DEV-006 `006-S4A`只vendor receipt schema並驗證hash／freshness／PASS，再與PCR組合。DEV-006不得讀projection、推測taxonomy、建立Employee或寫OrgMaster資料。

## 17. DEV-004 OrgMaster Auth Adapter Implementation Boundary

使用者選擇平台引導題`11B`，共同IAM／app-local session先於完整Cloud SQL persistence切片進入Implementation Readiness。跨repo權威為 [Jenfu Platform DEV-004實作契約](../../../Jenfu-Management-system/ai-doc/specs/DEV-004-common-iam-app-local-session-implementation.md)；本節只固定OrgMaster app-owned影響：

- 建立production-capable Node BFF／static server，讓既有Vite middleware factory可同時註冊於dev與production entry；`vite preview`不得作production runtime。
- auth middleware必須先於document／workspace／governance／management-method API，除auth mode／Firebase exchange外，未驗證request在任何business data read前即deny。
- Firebase verified `issuer + subject`只經`organization.v_active_principal_mappings_v1`解析；0筆／多筆／inactive皆deny，不以email／工號／name fallback。
- `Employee.status='active'|'inactive'`加入type／parser。舊local文件缺欄位只在local adapter讀成active並計數；production migration仍需data owner確認。
- OrgMaster session使用`orgmaster_session` host-only opaque cookie與`orgmaster.app_sessions`；每個protected request重查local revoke、active employee與Platform central auth epoch。
- `server/orgmasterGovernanceIdentity.ts`固定dev identity只可在development＋loopback＋exact headers；preview／production actor只能來自verified request identity。
- UI從正常`App`入口提供loading、login、expired、inactive／ambiguous、service unavailable、logout processing／failed／complete；不得先render protected data再隱藏。

Exact dependency、file allowlist、env、API／cookie／error、S0～S5、commands、failure recovery與acceptance以DEV-004 direct spec第5～16節為準。此slice P0／P1 readiness gap為0；`004-S0` contract layer、`004-S1` isolated PostgreSQL foundation與OrgMaster `004-S3`皆已在本機通過。這不等於真實Cloud SQL mapping、production credential、S5跨app或release完成。

### 17.1 `004-S0` OrgMaster contract snapshot evidence

- vendor root：`contracts/jenfu-platform-auth/v1/`；只供compile-time／fixture／conformance使用，runtime不得讀兄弟repo。
- lock：`contract-lock.json`；source固定`Jenfu-Management-system/contracts/jenfu-platform-auth/v1`。
- aggregate SHA-256：`4d27c1e297b516207f931f57e443ecda99e260c56369132f9a269d11920cda96`。
- `npm.cmd run contracts:check`、`test:dev-004`、`qc:dev-004`皆PASS，包含4個fixture、14個decision code與one-byte drift self-test。
- 尚未建立Node BFF、Employee status、auth runtime或UI；不得引用S0 evidence宣稱OrgMaster auth已完成。

### 17.2 `004-S1` OrgMaster session schema evidence

- migration：`db/migrations/001_dev004_orgmaster_app_sessions.sql`，只建立`orgmaster.app_sessions`、必要index及最小runtime grant；由`jenfu_platform_migrator`擁有DDL。
- isolated evidence：Platform `output/dev-004/DEV004-S1-20260831T013347578Z-25fcb8b8/`；43／43 PostgreSQL cases與cleanup PASS。
- 已驗證migration apply＋立即重跑、`jenfu_orgmaster_runtime` own DML、Platform／AI-PDM cross-app deny、hash／app／expiry constraint及restart readback。
- 本證據不包含OrgMaster BFF、cookie、active employee parser、API gate或UI，也不是production／Cloud SQL migration apply。

### 17.3 App-specific stop conditions

- 需要讓dev header進入preview／production、只保護governance API而其他business API裸露，或只能部署`vite preview`；
- 需要把Firebase ID token保存在localStorage／URL或作business bearer；
- 需要以current local JSON直接宣稱production active employee authority；
- 要修改production Firebase／Cloud SQL、真實員工、credential、deploy或release。

命中時停止DEV-004 OrgMaster slice並回平台PM。完整OrgMaster Cloud SQL persistence／migration與真實employee view安裝仍由DEV-006／DEV-040後續slice負責，isolated fixture PASS不得冒充live evidence。

### 17.4 `004-S3` Local Complete evidence

- production-capable entry：`vite.server.config.ts`建置`dist-server/server.mjs`；`npm start`只執行Node BFF，production缺auth env時preflight fail，不以`vite preview`替代。
- server auth：global middleware先於document／workspace／governance／management-method；opaque `orgmaster_session`只存peppered SHA-256 hash，每個protected request重查session revoke／expiry、active principal與central epoch。
- identity／lifecycle：exact issuer＋subject查active-principal view且最多取兩筆；Employee lifecycle為required `active|inactive`，local legacy缺值補active並回報`implicitActiveEmployeeCount`。
- UI：`AuthGate`在session驗證前不mount `ProtectedApp`，具loading、login、inactive／ambiguous、unavailable、logout processing／failed／complete；development fallback只在Vite development＋loopback＋exact headers，production bundle不含可用fallback path。
- automated evidence：contract gate PASS；S3 focused 4 files／14 tests PASS；full regression 159 files／651 tests PASS；TypeScript、client＋server build與server restart test PASS。
- browser evidence：正常local development在1440×900、1024×768、390×844均無document overflow；mocked 401 login與503 fail-closed皆無protected-data flash。local artifacts：`output/playwright/dev004-s3/manifest.md`。
- DEV-044 local test amendment（2026-09-04）：正式Firebase/BFF、opaque `orgmaster_session`及production fail-closed不變；Vite development＋loopback可由server allowlist提供四個地端profile及HttpOnly `orgmaster_dev_profile` cookie，供一鍵登入與權限差異測試。一般browser不再自動注入固定admin header，既有exact-header只保留給自動化fixture；preview／production不得列出或接受development profile。權威契約：`ai-doc/specs/DEV-044-local-test-role-one-click-login.md`。
- runtime cleanup：Playwright task session已關閉；5000為09:09既有同專案runtime（PID 23840），本輪安全重用且未停止。未建立production runtime、未連live DB、未deploy。
- 安全殘餘：`npm audit --omit=dev`為0 high／0 critical、6 moderate，均由`firebase-admin -> @google-cloud/storage`未使用的Storage依賴鏈引入；contract固定Firebase Admin 14，不在S3以不相容降版掩蓋，列為release前dependency gate。

### 17.5 Platform `004-S4` cross-system evidence

- Platform已建立Next.js 16.3 production auth shell、Firebase exchange、opaque `jenfu_portal_session`、每request active-principal／central epoch gate、local／global logout與authenticated placeholder。
- global epoch bump失敗時不清Portal cookie、不顯示完成；focused 6 files／24 tests、production build、fresh isolated PostgreSQL 43／43、HTTP fail-closed與1440／1024／390 UI／keyboard／focus recovery均PASS。
- Platform S4 evidence：`../../../Jenfu-Management-system/output/playwright/dev004-s4/manifest.md`。Cross-repo S5 evidence：`../../../Jenfu-Management-system/output/dev-004/DEV004-S5-20260831T054317661Z-75bb1fcc/`；三repo regression／build、fresh PostgreSQL、redaction／cleanup與10張browser evidence均PASS，P0／P1=0。此結果不代表live Firebase／Cloud SQL、entitlement、migration或release完成。

## 18. DEV-006 Activation／Repository-Switch Implementation Evidence

- product adapter：新增`server/orgmasterPersistenceRepository.ts`，`ORGMASTER_PERSISTENCE_MODE`只接受`local-json|cloud-sql`且預設local；workspace、governance、management-methods與media stores已接Cloud SQL CAS／immutable batch functions。現行local開發與5000 runtime不因程式存在而切換。
- schema：`003_dev006_orgmaster_runtime_repository.sql`新增active authority、CAS write與media read/write/delete functions；OrgMaster runtime只有EXECUTE，persistence tables direct access仍deny，Platform／AI-PDM runtime跨app呼叫deny。
- local verification：targeted 10 files／26 tests、full 159 files／661 tests、TypeScript、client＋server build與fresh G1 `DEV006-G1-20260831T130255787Z-c4530e09` 12／12 PASS。
- production-like candidate：capsule=`DEV006-R1-c617c6cf9e0d`、frozen revision=`4660c115cf9d9b096b4cbfbe3e44bc0b6b12cced00e3fd3ec57f7f4c5855e52c`；13 artifacts／2 media／784435 bytes。private-only／zero-traffic candidate完成4 migrations×2、shadow import／replay與RCN-01～09。
- repository probe：在單一transaction暫時模擬active pointer，驗證active read、CAS write、stale-CAS reject及media round-trip；rollback後authority version=0、active pointer=null、batch=1、probe media=0、永久membership=0。
- provider prerequisite：專案原缺Google-managed Cloud SQL service identity；已建立`sqladmin.googleapis.com` service agent且只保留`roles/cloudsql.serviceAgent`，未新增人類或app runtime權限。
- cleanup／non-impact：4 jobs、candidate、task secret、image、Cloud Build source、local runtime context與temp snapshot全數刪除；production Cloud SQL source metadata與AI-PDM traffic hash不變，既有OrgMaster `5000/PID 23840`保留。未部署、未持久切authority、未改traffic或production source DB。
- live source drift：既有autosave使live revision在candidate期間變為`89fc980c031532607e8131d3c2ce8d8a5b73370aac8cb003ebda553b0df02169`，與frozen capsule不同；這是被排除的並行工作，不是本任務寫入。production activation必須重新maintenance freeze與final import。
- evidence：`../../../Jenfu-Management-system/output/dev-006/releases/DEV006-R1-c617c6cf9e0d/cloud-candidate/`。

此節為前一個activation candidate基線。現行production-bound app／principal結果與新的阻塞條件由第19.4節取代；不得再以「先建service」作為直接下一步。

## 19. DEV-040 Principal Admission Projection — RD Implementation Ready

本slice只關閉DEV-004 production auth所需`organization.v_active_principal_mappings_v1`未被正式migration建立的P0 gap，不改UI、Firebase credential、治理發布行為、AI-PDM role或production authority：

- exact migration：`db/migrations/004_dev040_active_principal_view.sql`；additive建立`organization` schema與security-barrier view。
- canonical source：只能讀`orgmaster.persistence_authority`目前active batch中的`orgmaster-governance.v2.json`與該published version精確引用的workspace-version artifact。
- draft與未active published version永不輸出；只接受`assignment-governance-v2`、active且在有效期間內的identity link，以及workspace中明確`status='active'`的employee。
- workspace artifact的key必須符合published `organizationSnapshot.workspaceVersionId`，且其source或canonical SHA-256必須符合`workspaceRevision`；revision mismatch零輸出，不讀current workspace猜測。
- output欄位固定為DEV-004 contract的8欄；重複issuer＋subject不得`DISTINCT`或自動合併，保留多筆讓repository回`principal_ambiguous`。
- runtime只取得schema USAGE與view SELECT；三個runtime role均不得direct read OrgMaster persistence tables或write projection。
- local legacy employee缺status的相容只留在local adapter；Cloud SQL projection將缺值視為inactive，不以預設active放寬。

### 19.1 File boundary

- `db/migrations/004_dev040_active_principal_view.sql`
- `scripts/qc-dev-040-active-principal.mjs`
- `package.json`只新增`qc:dev-040:principal` command
- 本文件第19節與對應evidence；不得藉此修改產品route、畫面、role assignment或AI-PDM程式。

### 19.2 Required verification

- PostgreSQL 17 fresh apply與立即重跑都PASS。
- no authority、draft-only、無active version、inactive／expired identity、inactive／缺status employee、workspace revision mismatch皆零列。
- exact active mapping輸出欄位／大小寫／version／published timestamp正確；duplicate subject保留兩列供app fail closed。
- Platform／OrgMaster／AI-PDM runtime均只可SELECT view；direct persistence table與view write皆deny。
- QC runtime必須task-owned，完成後刪除container／volume並確認port釋放；不得接production DB。

### 19.3 Stop conditions

- 若view需要讀AI-PDM私有table、以email／姓名／工號自動配對、使用draft或current workspace取代published snapshot，停止並回ADR／PM。
- 若production既有Firebase UID無法在AI-PDM以stable subject取得、subject重複、issuer不同、employee mapping不唯一，停止該筆並列exception，不以資料修補取得PASS。
- 本slice PASS只表示projection可部署；production migration、repository switch、governance publish、Cloud Run deploy與traffic仍須release gate。

### 19.4 Production-bound principal／application evidence（2026-09-01）

- local PostgreSQL 17 fresh／replay／ACL QC=`DEV040-PRINCIPAL-20260831T161049193Z-ae5a8078`，19／19 PASS；draft、inactive／expired、missing status、revision mismatch皆零輸出，duplicate保留，三runtime roles只可SELECT view且direct table／view write deny。
- current capsule=`DEV006-R1-47ea0fd49e2c`；migration 004 SHA=`e96acc37eb528bac3883edccf1ab856f3bd700d31d7f51b706a3dc00b2bce93a`。private-only restore candidate完成5 migrations×2與candidate-only authority version=1；active artifact read PASS、active principal rows=0、draft excluded。
- 真實redacted reconciliation只輸出筆數與分類：AI-PDM accounts=4、active shared-IAM mappings=4、OrgMaster employees=12、draft identity links=1；當時classifier結果`ready=0 / missing_employee=4`，其他分類0。這是2026-09-01帳號taxonomy決策前歷史evidence，不回寫；production Firebase project已確認，但現有OrgMaster issuer未對齊，active policy=false、published versions=0。
- exact app image digest=`sha256:9bcb04327018d93bb2c908e2ea53f57678e0e39fbf4f91933afcb8b125566a16`。runtime SA以automatic IAM DB auth驗證active read與direct table deny；task-owned zero-traffic Cloud Run Job驗證server startup、app shell、Firebase auth mode與unauthenticated fail-closed。
- Cloud Run CLI不允許新service首revision使用`--no-traffic`，所以沒有建立`orgmaster-prod`或假baseline；provider-native Job evidence不涵蓋external service ingress及positive authenticated admission。
- release decision=`BLOCKED_PRE_ACTIVATION`。不得以email／姓名／工號推測對應、不得auto-publish draft、不得以臨時super-admin繞過positive admission。
- 現行恢復條件：先完成`040-ID1A`的非UUIDv7 Employee direct rekey、有效UUIDv7保留、reference closure與單一V8 baseline，再完成`040-ID1B` taxonomy／IAR；owner人工確認3筆human `issuer + subject -> employee` exact link，issuer固定為production Firebase issuer；依第21節發布active `assignment-governance-v3`；1筆`legacy_shared`完成替代使用者／角色／mail流程驗證後停用platform login並保留AI-PDM actor資料。fresh reconciliation必須`human_accounts_expected=3`、`human_accounts_ready=3`、`legacy_shared_accounts=1`、`legacy_shared_login_enabled=0`、`unresolved=0`。之後才建立canonical service、maintenance freeze、final import、positive authenticated smoke與rollback／observation。
- cleanup PASS：9 jobs、candidate、2 secrets、2 images、Cloud Build source、runtime SA／IAM、isolated worktree與local temp均刪除；`orgmaster-prod` service不存在、AI-PDM原revision／100% traffic與production Cloud SQL source設定不變、OrgMaster `5000/PID 23840`保留。
- evidence：`../../../Jenfu-Management-system/output/dev-006/releases/DEV006-R1-47ea0fd49e2c/cloud-candidate/`。

## 20. `040-ID1A／040-ID1B` Canonical Employee Rekey 與 Identity Admission — RD Implementation Ready

### 20.0 Human-confirmed exception and execution boundary

- `Human Confirmed / 2026-09-01`：目前資料採一次性直接遷移；既有歷史版本、舊ID追溯與legacy mapping不列為產品保留條件。這項決策取代本文件較早的additive bridge假設。
- `RD Tech Lead Review / 2026-09-01`：已關閉migration boundary（跨store假原子性、V3／跨app session漏列）、UUIDv7 plan不可重現、有效ID無效輪替、admission重複Employee權威與多餘fingerprint五項設計缺口；優化後維持`RD Implementation Ready`。
- `RD Tech Lead Ownership Review / 2026-09-01`：原`040-ID1`同時承擔一次性Employee rekey與持續性identity admission，並把IAR classifier誤交給DEV-006。現拆為`040-ID1A`（Employee rekey）與`040-ID1B`（taxonomy／projection／IAR），DEV-006只消費receipt；產品決策與production gate不變。
- 文件判定：`040-ID1A／040-ID1B Local Implementation Complete / Targeted QA-QC PASS`；兩個slice的P0／P1 readiness gap皆為`0`。JMS-PLATFORM-005 OrgMaster slice已完成`005-S0～S4B Local-Isolated PASS / S5 Local Targeted PASS`；exact catalog adapter、role capability API／UI、migration 005、effective／authority views、durable invalidation、route enforcement與change-feed consumer均已完成，production persistence apply與正式authority switch仍為`Not Implemented`。
- `040-ID1A`可實作：current canonical資料的非UUIDv7 Employee rekey planner／local isolated apply、既有有效UUIDv7保留、所有current employee reference驗證與受影響reference同步改寫、單一乾淨V8 baseline。
- `040-ID1B`可實作：governance account taxonomy、redacted PostgreSQL projection、owner-approved baseline、跨repo read-only IAR v2 classifier／receipt與targeted QA／QC。
- 兩個slice的fixture／isolated apply與read-only classifier已完成；仍不可執行真實local／production資料apply、3筆human live link、停用shared login、production active-policy publish、remote Cloud SQL migration、repository／authority／traffic switch、deploy或release。
- 最新 local evidence：ID1A QC 已驗證 task-owned fixture marker、runtime-state 非空 fail-closed、V7→V8 clean baseline、reference closure、exact plan 二次套用 `NOOP`、rollback journal 與 fixture cleanup；ID1B 已驗證 3 human＋1 legacy shared redacted receipt、classified-count 守恆與 baseline denominator mismatch reject。`apply-local` 的 session 撤銷僅在明確 `ORGMASTER_DATABASE_URL` 與 local write gate 下執行，未連接或修改任何正式資料庫。
- UI entry：`Out of scope`。本slice不新增畫面或導覽；資料重鍵由專用migration runner執行，taxonomy先沿用既有治理command API。若後續新增可見管理入口，另補UI Entry與browser evidence。

工程實作可分兩個slice驗證，但真實資料順序固定：先執行`040-ID1A` Employee rekey，再由owner建立`040-ID1B` human／shared admission與active policy，最後才產生production IAR。actual rekey亦必須先於JMS-PLATFORM-005的live management grant、per-employee authority override、switch receipt與outbox建立。V3 schema可先存在，但上述Employee-scoped runtime tables／queues必須為空；非空即BLOCKED並回release migration。

一次性豁免只取消「保留歷史ID與歷史追溯」的產品要求，不取消操作安全。實際apply仍須先凍結source、產生可驗證的task-owned rollback snapshot、通過全reference preflight，並在單一受控邊界完成；成功觀察期後才清理暫存rollback artifact。

### 20.1 `040-ID1A` Clean V8 baseline and UUIDv7 contract

1. UUID格式固定RFC 9562 UUIDv7：小寫canonical字串，version nibble=`7`、variant=`8|9|a|b`；不得以UUIDv4、員工編號、email、姓名或semantic slug替代。
2. migration freeze時，先驗證current canonical workspace每一筆distinct `Employee.id`。已是有效UUIDv7者原值保留；semantic ID、UUIDv4或其他非UUIDv7值才建立一對一`oldEmployeeId -> newUuidV7`。這仍是一次性直接clean migration，不建立產品級bridge。
3. sensitive mapping與完整target artifact hashes必須先寫入repo外、限制ACL的task-owned execution plan；不得只放在process memory。mapping不寫回產品資料、不進一般evidence或Platform receipt，cleanup gate通過後移除。
4. 新增Employee時，`src/App.tsx#createEmployee`只呼叫`createUuidV7()`；生成失敗即拒絕建立，不回退`crypto.randomUUID()`。
5. UUIDv7含時間／隨機成分，因此fresh planning不得宣稱可重建相同new ID。同一frozen source要重跑或apply，必須重用exact execution plan並驗證plan SHA；plan遺失或bytes不同即建立新`planId`、使舊approval失效。apply receipt存在、plan SHA與target revision一致時才回idempotent no-op。
6. migration完成後產品內不得保存`legacyEmployeeId`、legacy mapping、semantic Employee ID alias或雙讀resolver。任何current reference仍含舊ID即整批FAIL並回復pre-migration snapshot。

`createUuidV7()`在同一毫秒內須維持單process單調排序；測試可注入clock／random bytes，但production不得接受caller指定Employee ID。

### 20.2 `040-ID1A` Authoritative source reduction and reference rewrite matrix

Current canonical input只取：

- `data/orgmaster-workspace.v1.json`指向的current workspace-version artifact；
- 最高supported governance current artifact：V2時為`data/orgmaster-governance.v2.json`，DEV-005已實作V3時為`data/orgmaster-governance.v3.json`；只能有一個current authority。其current draft及active policy存在時的該一筆有效policy語意納入；V2／V3同時宣稱current即FAIL；
- `data/orgmaster-management-methods.v1.json`的current methods／working draft／readable snapshot；
- Cloud SQL模式下，同一frozen active persistence batch內上述三類exact artifacts。

一次性migration輸出單一clean baseline：

| Artifact／reference | Required rewrite／reset |
|---|---|
| current workspace `state.employees[].id` | 非UUIDv7依plan換鍵；有效UUIDv7原值保留 |
| `state.assignments[].employeeId` | 依同一mapping改寫；unknown old ID即FAIL |
| `employees[].administrativeApproverOverrideEmployeeId` | null保留；非null依mapping改寫 |
| workspace version manifest／versions | 只保留一筆新V8 current baseline；舊current／archived versions移出canonical source |
| governance current draft（V2／V3）`identityLinks[].employeeId` | 依mapping改寫；link的issuer／subject／principalId不變 |
| governance draft `roleAssignments[].employeeId` | 依mapping改寫 |
| governance V3 `roleAssignments[].metadata.sponsorEmployeeId` | null保留；非null依mapping改寫 |
| governance draft `roleDelegations[].fromEmployeeId／toEmployeeId` | 依mapping改寫 |
| governance V3 `managementGrants[].employeeId` | 依mapping改寫；`principalId`不變，且仍須與該Employee的exact personal identity一致 |
| retained active policy | 若原本有active V2／V3，以目前最高supported governance version重建唯一一筆migration baseline version並重算organization snapshot／snapshotHash；不得將V3降級為V2；若原本無active policy則維持null |
| governance historical versions／audit／migration provenance | 不帶入新baseline；重新建立一筆`ONE_TIME_EMPLOYEE_UUIDV7_REKEY` system migration audit |
| governance organization snapshot `employees[].id`／`assignments[].employeeId` | 由新V8 workspace重新產生，不直接搬舊snapshot |
| governance unresolved assignment／delegation | 依mapping改寫；任一unknown reference即FAIL，不可靜默丟棄current unresolved item |
| management methods `ownerEmployeeId` | null保留；非null依mapping改寫 |
| management readable snapshot `ownerEmployeeId` | null保留；非null依mapping改寫 |
| local `orgmaster.app_sessions.employee_id` | 不改寫；local apply readback後撤銷全部既有OrgMaster sessions，要求重新登入取得新Employee ID |
| production Portal／OrgMaster／AI-PDM sessions與central auth epoch | 不由local runner處理；release gate依execution plan中的affected old IDs撤銷／bump全部app session，任一app未失效即不得完成 |
| browser local selection／panel context／recovery keys | server不得宣稱同步清除所有browser；V8 client於下次載入忽略並移除Employee-scoped V1～V7 key，再從新baseline建立 |
| legacy／previous／recovery／archived data files | 不進new canonical source；暫存在task-owned rollback snapshot，觀察期通過後依cleanup gate移除 |

current business facts必須保持：Employee count／status／name／department、assignment count／position／validity、administrative override關係、governance current draft語意、active policy effective role語意、management-method內容與owner關係在ID替換外一致。歷史version number、歷史audit chain、舊snapshot hash與舊Employee ID不要求保留。

### 20.3 `040-ID1A` Migration planner, crash recovery and receipts

新增`scripts/dev040-rekey-employee-ids.mjs`，固定模式：

- `--mode plan`：預設且唯讀；凍結source inventory，驗證所有reference closure，建立不含direct identifier的plan receipt。
- `--mode apply-fixture`：只接受task-owned isolated fixture root與explicit `--allow-fixture-write`；用於RD／QC。
- `--mode apply-local`：程式可實作但預設拒絕；只有之後明確資料遷移指令、exact root、exact execution plan、verified rollback snapshot與`--allow-local-write`同時存在才可執行。
- `--mode recover-local --action rollback`：只處理同一exact root中未完成的DEV-040 journal，依original bytes／SHA還原；不得產生新mapping或roll-forward猜測。
- 不提供`apply-production`。Cloud SQL remote apply與repository switch屬release gate。

CLI輸入固定為absolute path；`plan`與`apply`未提供repo-external artifact root或exact plan時須fail closed：

```text
npm run plan:dev-040:id1 -- --source-root <absolute-root> --artifact-root <absolute-repo-external-root>
node scripts/dev040-rekey-employee-ids.mjs --mode apply-fixture --source-root <absolute-fixture-root> --plan <absolute-execution-plan> --allow-fixture-write
node scripts/dev040-rekey-employee-ids.mjs --mode apply-local --source-root <absolute-local-root> --plan <absolute-execution-plan> --artifact-root <absolute-repo-external-root> --allow-local-write
node scripts/dev040-rekey-employee-ids.mjs --mode recover-local --source-root <absolute-local-root> --plan <absolute-execution-plan> --artifact-root <absolute-repo-external-root> --action rollback
```

plan identity固定為：

```text
planId = SHA-256(
  contractVersion
  + frozenSourceRevision
  + sorted current artifact key／bytes／SHA inventory
  + executionPlanSha256
)
contractVersion = jenfu.dev040.employee-rekey.v1
```

`executionPlanSha256`涵蓋old→new mapping（有效UUIDv7為identity mapping）、每個target artifact bytes／SHA、source inventory與contract version。execution plan是敏感task artifact，不是產品資料或一般evidence；receipt只保存contract version、planId、execution plan SHA、source／target revision、artifact／Employee／reference分類counts、before／after hashes、validation cases、status與cleanup，不得保存old／new Employee ID mapping、issuer、subject、email、姓名、員編或payload。

apply流程固定：

1. 要求OrgMaster進maintenance。若canonical root已有sentinel或repo外已有同plan的`applying` journal，只允許recovery；不得另啟apply。
2. 把exact input bytes及manifest存入repo外`<artifact-root>/OrgMaster/dev040-id1/<planId>/rollback/`並驗證可讀回；同root建立`migration-journal.json`，狀態只可`prepared -> applying -> applied`或`prepared|applying -> rolled_back`。此時尚未改canonical bytes。
3. 以exclusive-create在canonical data root建立`data/.dev040-id1-migration-in-progress.json`，內容只含contract version、planId與journal SHA。`server/orgmasterMigrationGate.ts`須讓所有business API回`503 { error: 'EMPLOYEE_REKEY_IN_PROGRESS' }`，且workspace／governance／management-method mutation在actual write前再次檢查sentinel並以同code拒絕；避免已進入handler的請求於freeze後落盤。journal留在repo外artifact root，不要求server解析敏感artifact。
4. sentinel建立後重新驗證全部source SHA仍等於execution plan；drift時零canonical寫入、標記rolled_back並移除本次sentinel。通過後才在task-owned temp root依exact plan產生new baseline，執行V8 parser、reference closure、governance／management owner validation與target hash gate。
5. local JSON的三個store沒有共同transaction／manifest，因此不得宣稱原子切換。journal轉`applying`後，runner記錄每個replace前後SHA，再依workspace → governance → management-method固定順序替換；任何同步錯誤或process crash均由`recover-local`使用original bytes還原全部，恢復前business API持續fail closed。
6. 全部artifact readback與target revision驗證成功後撤銷既有local OrgMaster sessions；session撤銷失敗時還原canonical files，已撤銷session不補發。production Portal／OrgMaster／AI-PDM session與central epoch屬release gate，必須以affected old IDs全數失效。browser Employee-scoped V1～V7 state由V8 client下次載入時version-invalidate，不列入server-side atomicity。
7. journal=`applied`、restart readback通過後才移除sentinel並解除maintenance。觀察gate前保留execution plan與rollback snapshot；成功後由獨立cleanup receipt移除task artifacts。Cloud SQL正式apply另以單一DB transaction建立／驗證新active batch並切pointer，不沿用local file replace語意。

### 20.4 `040-ID1B` Account taxonomy authority

`GovernancePolicyDataV2`新增backward-compatible `principalAdmissions?: GovernancePrincipalAdmissionV1[]`；若JMS-PLATFORM-005第21節V3已實作，`GovernancePolicyDataV3`必須保留同一欄位，V2→V3 migration逐筆copy且不改fingerprint／identity-link reference。舊policy沒有此欄位時只讀成空集合，不能通過IAR v2；new clean baseline會在當前最高supported governance version materialize空array，後續由owner建立3＋1資料。

```ts
type PrincipalAccountTypeV1 =
  | 'human_personal'
  | 'human_privileged'
  | 'legacy_shared'
  | 'service'

type SharedRetirementStateV1 =
  | 'not_applicable'
  | 'pending_replacement'
  | 'replacement_verified'
  | 'login_disabled'
  | 'retired'

interface GovernancePrincipalAdmissionV1 {
  id: string
  principalFingerprintSha256: string
  issuerFingerprintSha256: string
  accountType: PrincipalAccountTypeV1
  identityLinkId: string | null
  sharedRetirementState: SharedRetirementStateV1
  status: 'active' | 'inactive'
  recordedAt: string
  evidenceRefSha256: string
}
```

- `human_personal`／`human_privileged`必須以`identityLinkId`指向唯一active identity link；canonical Employee只由該link的`employeeId`衍生，且必須是active UUIDv7 Employee。admission不得再存第二份`employeeId`權威。daily與privileged identity可屬同一Employee，但fingerprint與link必須不同，privileged capability不得因employee相同而傳播。
- `legacy_shared`與`service`必須`identityLinkId=null`；不得為取得PASS而建立Employee。
- `legacy_shared`狀態只可`pending_replacement -> replacement_verified -> login_disabled -> retired`前進；退回或跳過business evidence須停止回owner。
- production 3＋1分類不由程式猜測。Email domain、display name、role或員編不能自動決定account type。
- fingerprint使用exact issuer／subject，case-sensitive且不lowercase：

```text
principalFingerprintSha256 = SHA-256(UTF-8("jenfu.identity-admission.principal.v1\0" + issuer + "\0" + subject))
issuerFingerprintSha256    = SHA-256(UTF-8("jenfu.identity-admission.issuer.v1\0" + issuer))
```

新增commands只有`UPSERT_PRINCIPAL_ADMISSION`與`SET_PRINCIPAL_ADMISSION_STATUS`。沿用既有`commandId + commandHash + reason + immutable audit`與`orgmaster.governance.manage`server authorization；fingerprint不可原地修改，須停用舊record再新增。Publish仍走既有`orgmaster.governance.publish`；bootstrap／UI visibility不能替代權限。

### 20.5 `040-ID1B` PostgreSQL redacted projection contract

Migration固定為`db/migrations/006_dev040_identity_admission_projection.sql`，additive建立security-barrier view `organization.v_identity_admission_reconciliation_v2`。Migration ordinal `005`已由JMS-PLATFORM-005第21節預留給entitlement-governance；本file的isolated QC可在001～004後單獨套用，production bundle則必須依immutable filename順序套用005→006。本view與第19節`v_active_principal_mappings_v1`用途不同：V1供app session admission；V2只供Platform S4A read-only reconciliation，不能作登入或授權來源。

V2欄位固定如下，不得增列raw issuer、subject、principal ID、Employee ID、email、姓名或員編：

| Column | Type／rule |
|---|---|
| `contract_version` | text，固定`organization.identity-admission.v2` |
| `source_revision_sha256` | 64位小寫hex，來自active persistence batch |
| `policy_version` | bigint，active `assignment-governance-v2|v3.versionNumber` |
| `published_at` | timestamptz |
| `principal_fingerprint_sha256` | 64位小寫hex |
| `issuer_fingerprint_sha256` | 64位小寫hex |
| `account_type` | 四種taxonomy之一 |
| `admission_status` | `active|inactive` |
| `shared_retirement_state` | 第20.4節enum |
| `identity_link_match_count` | bigint；human正常值=1 |
| `employee_match_count` | bigint；human正常值=1 |
| `employee_active` | boolean；非human固定false |
| `employee_id_is_uuid_v7` | boolean；非human固定false |

View只讀active persistence batch、其中current governance artifact的active V2／V3 policy，以及該policy organization snapshot精確指定且SHA相符的V8 workspace artifact。V3只讀與V2相同的`principalAdmissions`／identity-link／employee fields，不以recommendation或management grant推導admission。draft、inactive／legacy policy、V7 workspace、revision mismatch、缺artifact或未知shape皆零列；不得退回current workspace猜測。

human link以`identityLinkId`連到唯一active identity link，再由該link取得Employee；principal／issuer fingerprint均以link的exact issuer／subject重算。Employee ID必須直接是UUIDv7，不設legacy resolver。SQL不得`DISTINCT`或用email／名稱補洞；duplicate admission／identity link保留counts，由Platform判ambiguous／invalid。Migration fresh apply與立即重跑都必須PASS。

PUBLIC無權限；只有`jenfu_platform_runtime`取得schema USAGE與view SELECT。OrgMaster／AI-PDM runtime對V2 view與direct persistence tables皆deny；所有runtime對view write／DDL皆deny。

### 20.6 `040-ID1B` IAR v2 generator and downstream receipt contract

OrgMaster view不讀AI-PDM資料，也不單獨宣稱final PASS。DEV-040的cross-repo integration runner由Platform repo託管，以read-only方式讀AI-PDM inventory、本view與owner-approved baseline receipt，依fingerprint join後輸出`jenfu.dev040.existing-user-reconciliation.v2`：

- `humanReady`只在AI-PDM account active、唯一shared-IAM subject、production issuer aligned、唯一active human admission、link／employee match各1、Employee active且ID為UUIDv7時加一；
- 無row、human缺link／Employee、inactive Employee、duplicate fingerprint、issuer hash不符、unknown account type、invalid retirement state各進其v2分類，不得忽略；
- `legacy_shared`是否仍可登入由AI-PDM account lifecycle實測；OrgMaster `login_disabled`／`retired`記錄不能單獨宣稱登入已停用；
- classified count必須等於`inventory.accountsTotal`；任何unknown、duplicate或未分類帳號都計入`readiness.unresolved`；
- IAR source revision只綁identity來源，不依賴PCR，避免identity與persistence互相成為循環前置：

```text
sourceRevision = SHA-256(
  OrgMaster view source revision
  + AI-PDM inventory SHA
  + owner baseline receipt SHA
  + contractVersion
)
```

owner baseline receipt是human／data-owner gate的redacted machine input，固定為：

```text
contractVersion = jenfu.dev040.identity-admission-baseline.v1
inventoryRevisionSha256
humanAccountsExpected
legacySharedAccountsExpected
serviceAccountsExpected
approvedAt
approvalEvidenceRefSha256
containsDirectIdentifiers = false
```

expected counts總和必須等於該inventory revision的帳號總數；approval evidence只存不可逆SHA reference，不存姓名、email或簽核內容。inventory revision不同、欄位不守恆或approval hash缺失即拒絕產生IAR。

IAR v2 exact receipt schema由DEV-040擁有，固定只含version／timestamp／hash／counts／boolean：

```text
contractVersion = jenfu.dev040.existing-user-reconciliation.v2
classifierVersion / sourceRevision / completedAt
baseline.ownerReceiptSha256
baseline.inventoryRevisionSha256
baseline.humanAccountsExpected
baseline.legacySharedAccountsExpected
inventory.accountsTotal
classifiedCount
classification.humanReady
classification.humanMissingEmployee
classification.humanAmbiguousEmployee
classification.duplicateSubject
classification.inactiveEmployee
classification.inactivePdmAccount
classification.issuerMismatch
classification.legacySharedAccounts
classification.legacySharedPendingRetirement
classification.legacySharedLoginEnabled
classification.serviceOutOfScope
classification.invalidSource
authority.productionIssuerAligned
authority.activePolicy
authority.publishedVersionPresent
canonicalEmployee.allHumanLinksUseUuidV7
readiness.unresolved
readiness.activationReady
status = PASS | FAIL
containsDirectIdentifiers = false
databaseWrites = 0
```

目前production rollout的owner-approved baseline與唯一PASS公式為：

```text
accountsTotal = 4
humanAccountsExpected = 3
humanReady = 3
legacySharedAccountsExpected = 1
legacySharedAccounts = 1
legacySharedLoginEnabled = 0
serviceAccountsExpected = 0
serviceOutOfScope = 0
classifiedCount = accountsTotal
unresolved = 0
productionIssuerAligned = true
activePolicy = true
publishedVersionPresent = true
allHumanLinksUseUuidV7 = true
containsDirectIdentifiers = false
databaseWrites = 0
```

baseline count、帳號集合或owner evidence任一改變，舊baseline receipt與IAR立即失效，必須重新freeze inventory並由owner簽核；不得為維持`3＋1`忽略新增／停用帳號。IAR v1固定`historical／unsupported-for-activation`，不得自動升級。

DEV-006 `006-S4A`只vendor `iar-receipt.schema.json`並驗證contract lock、receipt hash、freshness與PASS；不讀projection／AI-PDM inventory、不重算taxonomy，也不硬編`3＋1`。PCR與IAR各自fresh後，release capsule只綁兩份receipt SHA。

### 20.7 Exact allowlists by owner slice

- `040-ID1A`只可修改Employee UUIDv7、V8 clean baseline、reference rewrite、maintenance／recovery與rekey QC相關列。
- `040-ID1B`只可修改`principalAdmissions`、projection、IAR schema／generator與identity-domain QC相關列。
- Shared files只允許`src/governance/migrateGovernanceV1ToV2.ts`、`migrateGovernanceV2ToV3.ts`、`validation.ts`、`server/orgmasterGovernanceStore.ts`、`package.json`與本任務文件；先由ID1B固定schema，再由ID1A驗證rekey compatibility。

| Owner slice | File | 允許變更 |
|---|---|---|
| ID1A | `src/employeeIdentity.ts`（新增）、`employeeIdentity.test.ts` | UUIDv7 generate／validate；不放admission fingerprint |
| ID1A | `src/types.ts` | Employee ID仍為string；補UUIDv7 contract註記，不新增legacy alias |
| ID1A | `src/App.tsx` | 只把`createEmployee`改用`createUuidV7()` |
| ID1A | `src/documentStorage.ts`、`documentStorage.test.ts` | OrganizationDocument V8、current frozen V7→V8 migration/read validation與client recovery-key version invalidation |
| ID1A | `src/versionWorkspace.ts`、`versionWorkspace.test.ts` | single clean V8 baseline與舊version不進new canonical manifest |
| ID1A | `server/orgmasterWorkspaceStore.ts`、相鄰test | actual write前sentinel gate、temp baseline write／readback |
| ID1A | `server/orgmasterMigrationGate.ts`（新增）、`server/orgmasterServer.ts`、相鄰test | temporary sentinel fail-closed middleware、exclusive create／ownership validation |
| ID1B | `src/governance/identityAdmission.ts`（新增）、相鄰test | principal／issuer fingerprint pure functions；不產生Employee ID |
| ID1B | `src/governance/types.ts` | principal-admission types／commands；不新增legacy mapping |
| Shared | `src/governance/migrateGovernanceV1ToV2.ts`、`migrateGovernanceV2ToV3.ts`及相鄰test | ID1B materialize／保留`principalAdmissions`；ID1A只做clean baseline reference rewrite |
| ID1B | `src/governance/commands.ts`、`commands.test.ts` | admission command apply、idempotency、audit metadata |
| Shared | `src/governance/validation.ts`、`validation.test.ts` | ID1A UUIDv7 reference closure；ID1B taxonomy／fingerprint validation |
| Shared | `server/orgmasterGovernanceStore.ts`、`orgmasterGovernanceStore.test.ts` | ID1A sentinel／baseline readback；ID1B既有auth／publish path接admission commands |
| ID1A | `src/managementMethods/types.ts`、`server/managementMethodStore.ts`及相鄰test | owner UUIDv7 readback validation與actual write前sentinel gate |
| ID1A | `scripts/dev040-rekey-employee-ids.mjs`（新增） | plan／fixture apply／gated local apply／rollback recovery、execution-plan hash與journal |
| ID1B | `db/migrations/006_dev040_identity_admission_projection.sql`（新增） | 第20.5節view／grant／comment；`005` reserved by JMS-PLATFORM-005 |
| ID1B | `contracts/jenfu-platform-identity-admission/v2/orgmaster-projection.schema.json`（新增） | machine-readable exact row schema，`additionalProperties=false` |
| ID1B | `contracts/jenfu-platform-identity-admission/v2/iar-receipt.schema.json`（新增） | DEV-040擁有的IAR v2 exact receipt schema |
| ID1B | `contracts/jenfu-platform-identity-admission/v2/fixtures/three-human-one-shared.json`（新增） | redacted 3＋1與negative fixture；不得含真實identifier |
| ID1A | `scripts/qc-dev-040-id1.mjs`（新增） | task-owned V8 migration／recovery／cleanup QC |
| Shared | `package.json` | ID1A只新增`plan／test／qc:dev-040:id1`；ID1B的OrgMaster tests用existing Vitest command，cross-repo runner commands在Platform repo |
| Shared | 本spec、`ai-doc/dev_task.md`、`ai-doc/documentation_map.md` | 狀態、證據與交接同步 |

#### 20.7.1 Platform-hosted `040-ID1B` integration allowlist

下列檔案位於Platform repo，但task owner仍是DEV-040；它們產生IAR，不屬DEV-006 S4A：

| File | 允許變更 |
|---|---|
| `scripts/dev040-local-existing-user-reconcile.mjs` | 取代v1 direct-JSON classifier；改成explicit fixture／source-readonly mode，讀IAR projection、AI-PDM read-only inventory與owner baseline receipt |
| `scripts/lib/dev040-identity-admission.mjs`（新增） | pure fingerprint join、taxonomy classifier、IAR source revision與receipt builder |
| `scripts/dev040-identity-admission.test.mjs`（新增） | 第20.9節identity-domain cases |
| `scripts/qc-dev-040-id1b.mjs`（新增） | task-owned fixture／read-only source、redaction、zero-write與cleanup QC |
| Platform `package.json` | 只新增`test:dev-040:id1b`、`qc:dev-040:id1b`；不新增dependency |
| Platform DEV-006 spec／task／map／QA | 只同步consumer dependency與evidence，不收編classifier ownership |

不在一般RD apply範圍：真實`data/**`、production Cloud SQL、session rows、AI-PDM／Platform產品、env、provider config、deploy與release scripts。Runner能力可實作，但對真實data的apply必須另有明確資料遷移指令與gate。若實作需要越出allowlist，先回PM做spec drift判定。

### 20.8 Failure recovery and stop conditions

- plan遇到Employee ID collision、unknown／dangling reference、同一old ID代表不同person、current artifact invalid、active policy無法重建、management-method owner無法對應或並行source drift：零寫入並BLOCKED。
- temp baseline任一parser、reference、hash、governance或owner validation失敗：刪除task-owned temp，canonical source bytes不變。
- local replace中任一失敗或runner中斷：sentinel保持、business API 503；只可用exact journal與rollback manifest執行`recover-local --action rollback`，讀回original hashes後才解除。不得把跨store序列replace描述為atomic。
- commit成功後readback／smoke失敗：回復全部source與authority，撤銷新session；不得用legacy alias、雙讀或手工補reference取得PASS。
- view／inventory contract失敗時ID1B只輸出FAIL／零寫入，DEV-006 S4A維持BLOCKED；不得降級IAR v1或由consumer直接讀任一私有source補洞。
- actual local／production apply、rollback snapshot cleanup、remote migration、authority／traffic switch仍需各自明確指令；本文件不預寫production命令或provider artifact。

### 20.9 Slice-specific QA／QC gate and evidence

`040-ID1A`最小可重現命令（OrgMaster repo）：

```text
npm run test:dev-040:id1
npm run qc:dev-040:id1
npm run build
git diff --check
```

`package.json` script value固定為：

```text
plan:dev-040:id1 = node scripts/dev040-rekey-employee-ids.mjs --mode plan
test:dev-040:id1 = vitest run src/employeeIdentity.test.ts src/governance/identityAdmission.test.ts src/governance/validation.test.ts src/governance/commands.test.ts server/orgmasterMigrationGate.test.ts
qc:dev-040:id1 = node scripts/qc-dev-040-id1.mjs
```

若實作時JMS-PLATFORM-005 V3已存在，`test:dev-040:id1`必須再納入`src/governance/migrateGovernanceV2ToV3.test.ts`；這是受控cross-slice compatibility addition，不得藉機擴大其他DEV-005範圍。

`040-ID1B`最小可重現命令：

```text
# OrgMaster repo
npm test -- --run src/governance/identityAdmission.test.ts src/governance/commands.test.ts src/governance/validation.test.ts src/governance/migrateGovernanceV1ToV2.test.ts src/governance/migrateGovernanceV2ToV3.test.ts server/orgmasterGovernanceStore.test.ts
npm run build

# Platform repo
npm run test:dev-040:id1b
npm run qc:dev-040:id1b
npm run contracts:check:dev-040
git diff --check
```

`package.json` script value固定為：

```text
test:dev-040:id1b = node --test scripts/dev040-identity-admission.test.mjs
qc:dev-040:id1b = node scripts/qc-dev-040-id1b.mjs
```

`test:dev-040:id1`至少覆蓋：

- UUIDv7 version／variant／same-millisecond monotonicity與new Employee不再產生v4；
- V7 current fixture把非UUIDv7值一次rekey成全UUIDv7 V8，既有有效UUIDv7保持不變；exact plan第二次apply為idempotent no-op，遺失plan不得重建同一組new ID；
- workspace assignment／admin override、governance identity／assignment／delegation／snapshot／unresolved、management-method owner完整rewrite；
- V3存在時，assignment sponsor與management grant完整rewrite；target schema不得出現per-employee recommendation decision或legacy basis；employee authority override／switch receipt／outbox非空時BLOCKED；
- dangling／duplicate／cross-person old ID、source drift與partial write fail closed；
- active policy有／無兩種clean baseline；舊history／audit不進new baseline；
- ID1A不得以taxonomy fixture代替rekey／reference closure證據。

`qc:dev-040:id1`使用task-owned fixture root，至少驗證：

1. plan完全唯讀、sensitive execution plan／redacted receipt分離、apply-fixture同成同敗、local journal crash-point recovery、source backup hash、V8 restart readback、跨app session失效契約與rollback rehearsal；
2. current business counts／relations在ID替換外一致，new baseline只一筆current version，全部Employee及current references皆UUIDv7；
3. task-owned process／temp／rollback fixture清理完成且port released；不觸碰5000或其他runtime。

`test／qc:dev-040:id1b`至少驗證：

1. taxonomy欄位矩陣、fingerprint case sensitivity、command replay與publisher permission；
2. no authority、draft-only、legacy policy、V7 workspace、revision mismatch皆使V2 view零列；
3. redacted 3 human＋1 legacy shared baseline、shared誤綁Employee、human缺link、inactive Employee、duplicate admission、unknown taxonomy、issuer mismatch、shared login仍enabled與baseline drift皆fail closed；
4. classified count守恆，IAR source revision只綁OrgMaster view、AI-PDM inventory、owner baseline與contract version，不依賴PCR；
5. view／receipt無raw issuer、subject、principal／Employee ID、email、name或employeeNumber，亦不輸出subject-only或Employee UUID fingerprint；schema拒絕額外欄位且redaction scan命中0；
6. Platform runtime只可SELECT V2 view；OrgMaster／AI-PDM runtime SELECT、所有runtime DML／DDL與direct table access皆deny；
7. read-only file bytes／mtime或DB revision／audit不變，task-owned process／Compose／volume／temp清理完成且port released。

DEV-006 S4A只執行consumer aggregate cases：PCR PASS＋IAR missing、IAR PASS＋PCR stale、IAR v1、schema／hash drift、upstream FAIL、classified-count mismatch與redaction violation。它不重跑issuer、Employee、taxonomy或shared-retirement分類。ID1A／ID1B local QC均不證明AI-PDM production account state或final activation。

### 20.10 Deferred scope and re-entry

- `Blocked Human／Data-owner Re-entry — production 3＋1`：3筆human exact link、1筆legacy shared taxonomy／replacement／login disable與active policy須由owner提供evidence；AI不能依email、姓名、角色或fixture推測。
- `Release Gate Required — actual apply／remote activation`：真實local data rekey、production migration、repository／authority／traffic switch、canonical service與positive authenticated smoke，需fresh frozen source、明確target與使用者執行指令。
- `Future Phase Captured / Not Requested — historical import`：若日後需要重新匯入V1～V7 historical／backup files，採獨立單檔rekey，不恢復legacy alias或產品內歷史追溯。Re-entry trigger是使用者明確要求匯入某一exact artifact。
- 若直接rekey無法以journal＋fail-closed recovery保證最終全成或全退、active business語意無法保留、需要雙權威或必須對外暴露old→new mapping，停止並回PM；不得恢復已被本次Human Decision取代的additive bridge。

ADR判定：ADR-007已記錄`040-ID1 One-time Rekey Amendment`。本次ID1A／ID1B工程拆分不改identity authority、role ownership、migration policy或外部契約，因此不新增ADR；若未來重新要求legacy identity、雙權威或把IAR authority移出DEV-040，才需新ADR／amendment。

使用思考習慣：#問對問題、#多層次分析、#系統描繪、#限制條件

## 21. JMS-PLATFORM-005 Position-to-Role — OrgMaster RD Implementation Contract

分類：`Human Confirmed / Compatible V3 Upgrade / RD Implementation Complete / Local-Isolated Targeted QA-QC PASS / Production Release Gated`

跨repo authority為[Platform DEV-005](../../../Jenfu-Management-system/ai-doc/specs/DEV-005-position-derived-application-role-assignment.md)第14～27節；本節固定OrgMaster直接實作，不重複改變AI-PDM Role-to-Permission authority。

### 21.1 Target outcome and compatibility

- `GovernanceDocumentV2` non-destructive升為`GovernanceDocumentV3`，published kind新增`assignment-governance-v3`。V1／V2歷史、audit與source bytes保留，但migration後不得重新activate legacy version。
- V3 local current artifact／Cloud SQL artifact key固定為`orgmaster-governance.v3.json`；V2只作migration source／rollback evidence，V2與V3不得同時宣稱current。
- 現有AI-PDM bundled catalog只保留為historical fixture／validator，runtime改讀`ai_pdm_contract.v_application_role_catalog_v1`；OrgMaster不得讀AI-PDM `roles`／`role_permissions`私表。
- Position recommendation只提供唯讀`（建議）`與首次adoption draft預填。AI-PDM另發布app-scoped adopted Position，再逐人發布Position source；`POST /applications/ai-pdm/versions`後仍須該employee authority切到OrgMaster才可能effective。
- Published assignment固定`status=active|revoked`，batch activation由authority state計算，不修改immutable published JSON。

### 21.2 Exact V3 model

`GovernancePolicyDataV3`新增`positionRolePolicies`、`applicationPositionAdoptions`與`managementGrants`；`GovernanceRoleAssignmentV3`新增`basis=manual|position_adoption`、`subjectKind=employee|principal`、`targetPrincipalId`、`sources[]`、external metadata與created audit snapshot。`PositionRolePolicyV1`是recommendation；`ApplicationPositionAdoptionV1`是AI-PDM app-scoped採用，兩者不得共用status／version／audit。Target V3沒有per-employee recommendation ID／accept／dismiss decision或legacy basis；未上線local foundation在`005-S2`前刪除／重構，fixture直接重建，不建立production migration相容層。若`040-ID1B`已實作，V3同時保留第20.4節`principalAdmissions`契約。完整欄位見Platform direct spec第17節與[角色能力UI契約](../../../Jenfu-Management-system/ai-doc/specs/DEV-005-ai-pdm-role-capability-ui.md)。

OrgMaster只接受AI-PDM active catalog，並使用每個entry的`role_definition_hash`驗證recommendation policy與permission preview：internal roles為`workspace=company-jenfu`；external specialist固定manual direct、exact project且必填另一位active internal sponsor／review date／finite hard expiry，其active Employee identity anchor必須`departmentIds=[]`、`primaryAssignmentId=null`且無active Position assignment，不進內部組織樹或recommendation；system admin為`principal` subject、exact active `human_privileged` target及global scope，固定manual direct且禁止recommendation／delegation／self-assignment。一般內部role為`employee` subject且只投影active `human_personal` principal。`department` scope在Current phase拒絕；不得用Position／department名稱取代resource scope。assignment catalog version只作核准時provenance；active catalog仍有相同stable ID／code且subject／scope相容時，version不同本身不阻擋effective。missing／retired／code drift／subject-scope不相容deny，catalog unavailable回503，payload／lock／hash mismatch回409。

V2→V3 migration：

1. 完整複製identity links、`principalAdmissions`（若存在）、OrgMaster internal policy、audit與published history；human admission的`identityLinkId`必須唯一解析到active link與UUIDv7 Employee，不接受admission內重複employee欄位或legacy resolver。
2. V2 AI-PDM一般employee-subject assignment轉`basis=manual`、`subjectKind=employee`、`targetPrincipalId=null`、`sources=[]`、published active但computed pending activation；不形成effective row。V2 `system_admin`是DEV-009明定例外：進`SYSTEM_ADMIN_PRINCIPAL_REQUIRED`、零effective，不猜測exact principal或grandfather。
3. unresolved assignment／delegation仍阻擋publish；不從AI-PDM legacy assignment反向匯入。
4. management grant預設空；首次app publish前由reviewed bootstrap建立person-specific principal grant，不能從OrgMaster admin或職稱推導。

`040-ID1A` actual rekey必須在第4點bootstrap及任何per-employee authority state之前完成；V3 schema可先存在，但live grant／override／receipt／outbox非空即停止並回獨立release migration。

### 21.3 Domain and API files

```text
contracts/jenfu-platform-entitlement/v1/**
src/governance/types.ts
src/governance/aiPdmCatalog.ts
src/governance/positionRoleRecommendations.ts              (new)
src/governance/migrateGovernanceV2ToV3.ts                  (new)
src/governance/commands.ts
src/governance/validation.ts
src/governance/apiClient.ts
src/governance/*.test.ts                                   (affected/new)
server/aiPdmRoleCatalogRepository.ts
server/aiPdmRoleCapabilityStore.ts
server/orgmasterGovernanceStore.ts
server/orgmasterGovernanceApi.ts
server/orgmasterWorkspaceStore.ts
server/orgmasterEntitlementInvalidationDispatcher.ts
server/orgmasterGovernanceStore.test.ts
server/orgmasterGovernanceApi.test.ts
src/components/GovernanceCenter.tsx
src/components/GovernanceCenter.css
db/migrations/005_dev005_entitlement_governance.sql         (new)
scripts/qc-dev-005-entitlement-postgres.mjs
package.json                                               (scripts only)
```

API新增`GET /catalogs/ai-pdm`、`GET /applications/ai-pdm/role-capabilities/{stableRoleId}`、`GET /applications/ai-pdm/change-feed`、`SET_APPLICATION_POSITION_ADOPTIONS`、`SET_POSITION_ROLE_ASSIGNMENT_SOURCES`與`POST /applications/ai-pdm/versions`。normal AI-PDM read不得以recommendation endpoint或private schema自行拼裝；recommendation policy mutation只供OrgMaster內部治理，target沒有legacy recommendation decision command。既有`/versions`只處理OrgMaster internal governance；app-scoped publisher不可發布其他app diff或management grant。所有mutation要求verified actor、expected revision、organization revision、stable command ID、preview hash、server recompute與before／after；reason為選填，缺值正規化為空字串，非空時trim後最多240字元並寫入audit。Decision code與HTTP mapping以Platform direct spec第18節為準。

### 21.4 Capability and self-elevation gate

management grant綁`principalId + employeeId + applicationId + capability`，不是只綁employee：

- daily personal principal可持有`ai-pdm.position_adoption.manage`、assignment manage、assignment publish；publish要求近期step-up。
- `orgmaster.position_role_recommendation.manage`只給OrgMaster內部治理角色，不提供給一般AI-PDM role administrator。
- person-specific privileged principal才可持有cross-app override、management grant授予與authority switch。
- app manager不可修改grant、不可把自己升成PDM／system admin、不可碰其他app；server判斷，不靠UI隱藏。
- bootstrap是一個reviewed one-time command；fixture可測，真實principal apply屬release/data-owner gate。

### 21.5 Migration and views

`005_dev005_entitlement_governance.sql` additive新增，並預留ordinal `005`；`040-ID1B`的identity-admission projection固定為`006_dev040_identity_admission_projection.sql`，production bundle依005→006順序套用：

- `access_governance.application_authority_state`
- `access_governance.employee_authority_overrides`
- immutable `access_governance.authority_switch_receipts`
- durable `access_governance.entitlement_change_outbox`
- `access_governance.v_ai_pdm_entitlement_authority_v1`
- owner-only `access_governance.v_effective_role_assignments_v1`
- runtime-only `access_governance.v_ai_pdm_effective_role_assignments_v1`
- V3-compatible replacement of`organization.v_active_principal_mappings_v1`

effective view讀active governance V3 assignment，但以active persistence batch的current workspace manifest／version核對current employee、Position與Position assignment，並以AI-PDM active catalog驗證role code、subject、scope與metadata。draft、V1／V2、legacy authority、revoked、expired、inactive、subject mismatch、invalid role／scope、全部position sources失效與invalid delegation皆零列。Position rename及assignment catalog provenance與active version不同本身不影響；不得`DISTINCT`掩蓋ambiguity或把missing status預設active。

runtime ACL固定：AI-PDM只能SELECT兩個ai-pdm filtered views；Platform／AI-PDM不得讀private governance／workspace／authority tables；OrgMaster runtime只可經既有persistence functions與受限API寫治理資料。Authority switch function只給migration／release operator，不給三個normal runtime。

### 21.6 Commit-first entitlement mutation and durable session refresh

OrgMaster在publish／revoke role、Position source結束、Position inactive／刪除、workspace scope source失效、authority switch／rollback時計算受影響employee，並把authority mutation與outbox row放在同一DB transaction。outbox以`operation_id + employee_id + application_id`唯一去重，保存pending／processing／completed／failed、attempt、next attempt與redacted error，不保存raw subject。

安全順序：candidate＋CAS驗證→workspace／governance／authority state＋outbox同transaction commit→dispatcher呼叫`invalidate_employee_app_sessions_v1`→回寫receipt。Current phase無positive entitlement cache，故source失效或撤權在commit後即由view deny，不等待session refresh或TTL。Platform unavailable／timeout時保留outbox pending並idempotent重送，同command不得重複bump epoch；不得回滾已提交撤權或讓舊role繼續effective。API成功固定回`authorizationEffect=committed`與`sessionRefresh=completed|pending`；pending停止下一批，但不是授權mutation失敗。

Dispatcher以`FOR UPDATE SKIP LOCKED`＋短lease claim due rows；crash後可reclaim。重試節奏固定1／5／15／60分鐘後每60分鐘持續，不因attempt上限丟棄；第5次失敗與pending超過24小時送deduplicated alert。Platform成功但response lost必須以原operation ID replay並得到同receipt；完成後保存receipt與completed time。雙worker、lease recovery與outage recovery均列入PostgreSQL QC。

OrgMaster另以durable outbox只發布`orgmaster.application_projection.changed.v1`，欄位為event ID、`applicationId=ai-pdm`、opaque server-ordered cursor、time、organization version／revision、position IDs與`changeKinds[]`，不帶姓名、email、subject或完整assignment。AI-PDM server以`GET /applications/ai-pdm/change-feed?after={cursor}&limit={1..100}` at-least-once拉取；重送以event ID冪等，cursor gap／expired或revision不連續時須列舉AI-PDM active catalog所有stable Role，取得同一current organization revision的完整projection後才從server current cursor續讀。event只invalidate並pull `GET /applications/ai-pdm/role-capabilities/{stableRoleId}`，延遲不能讓已失效source繼續effective。

### 21.7 UI contract

- AI-PDM一般角色管理者在AI-PDM`/settings/workflow`的「角色能力」操作；OrgMaster Governance Center不再提供AI-PDM normal assignment editor，只保留組織資料、recommendation governance、audit與super-admin cross-app override。
- AI-PDM正常層級為Role → adopted Position → Employee；所有Position增刪集中在單一「職位設定」。`（建議）`與adopted checkbox分離，建議只在uninitialized draft預勾。
- AI-PDM browser只呼叫AI-PDM BFF；OrgMaster server仍重算Position／Employee、source、before／after與preview hash，拒絕client actor／impact count。
- Position adoption與Employee assignment分別publish。相同role＋scope可合併sources；移除Position只撤銷失去最後active source者，scope conflict明確阻擋，不自動union。
- 390×844只讀；desktop mutation仍需server capability與step-up。成功文案只在authorization commit receipt存在時顯示；authority尚未切換標示「已發布，尚未生效」，refresh pending標示「權限已生效，登入狀態更新中」。

### 21.8 Required commands and gates

現行commands與結果：

```text
# OrgMaster
npm run test:dev-005                 PASS（5 files／16 tests）
npm run qc:dev-005:postgres          PASS（7／7）
npm run build                        PASS

# Jenfu-Management-system
npm run contracts:dev-005:check      PASS
npm run qc:dev-005:cross-repo        PASS
npm run qc:dev-005:postgres          PASS（7／7）

# AI_PDM
npm run qc:jms-dev-005:contract      PASS
npm run qc:jms-dev-005:repository    PASS
npm run qc:jms-dev-005:change-feed-consumer PASS
npm run qc:jms-dev-005:authorization-boundary PASS
npm run qc:jms-dev-005:runtime-boundary PASS
npm run qc:jms-dev-005:migration     PASS
npm run typecheck:app                PASS
npm run build:isolated               PASS
npm run qc:jms-dev-005:postgres      PASS（7／7）
```

固定驗證至少涵蓋：V2→V3 byte-preserving history、target V3不存在recommendation decision／legacy basis、active catalog hash／unavailable／retired／version provenance、recommended／adopted／assigned三態、首次預填、建議漂移不覆寫、nonrecommended adoption、新Employee預設未勾選、manual／position／delegated、multi-source與最後source撤銷、position rename／end、system-admin與external負例、management grant isolation、self-elevation、CAS／idempotency、mutation＋outbox原子性、app-scoped projection redaction、change-feed重送／cursor gap／expired recovery、Platform outage pending／replay、authority rollback、fresh／replay migration、runtime ACL及三viewport。

### 21.9 Recovery and stop conditions

- switch前保留legacy authority；V3 draft／published pending不影響allow。
- catalog unavailable／payload或lock mismatch、source drift、ambiguous authority、private table grant、unsupported department scope或app manager跨scope時，禁止候選publish／切換並立即BLOCKED。已提交撤權後的session refresh failure不回滾authority mutation，outbox持續重試並停止下一批。
- pilot授權失敗時以reviewed operation把per-employee authority與outbox原子commit為legacy，commit後refresh session；保留V3、catalog、audit、receipt與legacy資料，不union兩來源。
- 不得以重新啟用不實Position恢復權限；必要存取另建有期限manual assignment。
- production migration、真實grant、catalog publish、authority switch、traffic、legacy removal與release仍需獨立gate。

本節 ID1A／ID1B 已完成程式、migration、contract package、fixture與targeted QA／QC；JMS-PLATFORM-005 `005-S0～S4B`與`005-S5` local／isolated implementation／targeted gate、Platform DEV-006 S4A consumer亦已完成。上述僅證明local／isolated capability，不增加production交付完成率；production migration、真實資料／grant、repository／authority switch、traffic、legacy retirement、deploy與release仍受獨立gate阻塞。

使用思考習慣：#效用理論、#系統描繪、#當責

## 22. JMS-PLATFORM-008 Governance Availability — OrgMaster RD Implementation Contract

分類：`Human Confirmed / Compatible Reliability Amendment / RD Tech Lead Re-review PASS / RD Implementation Ready / Local S0～S3＋C1 Implemented / Targeted QA-QC PASS / Production Release Gated`

跨repo authority為[Platform DEV-008](../../../Jenfu-Management-system/ai-doc/dev_task.md)。本節只固定OrgMaster bulk read、command receipt與isolated test runtime邊界；不改canonical assignment、recommended／adopted／assigned、effective entitlement或DEV-005 transaction語意。

### 22.1 Bulk projection and authority time

新增：

```text
GET /api/orgmaster/governance/applications/ai-pdm/role-capabilities
contractVersion = ai-pdm.role-capability-workspace.v2
applicationId = ai-pdm
catalogVersion
catalogPayloadHash
governanceRevision
organizationVersionId
organizationRevision
changeCursor
sourceDataAt
roles[9]
```

`server/aiPdmRoleCapabilityStore.ts`在單一store lock／synchronized read中，以同一governance document與organization workspace建立九個projection；不得由API連續呼叫九次per-role read後拼裝。九角色stable ID／metadata必須與AI-PDM active catalog request一致且revision／cursor完全相同，`catalogVersion + catalogPayloadHash`必須來自同一Platform published／bundled artifact並與request expected值相符，否則整包fail、零partial response。`sourceDataAt=workspaceVersion.savedAt`且必須為RFC3339 authority timestamp，不以request時間或revision hash代替。原per-role GET保留相容但不再是normal whole-page delivery path。

`readOrganizationSource()` product path必須移除workspace read錯誤後的legacy fallback與`test-current`／`test-revision`合成資料。legacy／test fixture只可透過明確注入的test adapter；manifest、version、source bytes缺失、損壞、read throw或不相容時，統一回dependency／contract error，`current state`、cursor、events與consumer最後成功snapshot bytes不得被寫入或推進。

### 22.2 Command receipt and post-dispatch uncertainty

新增查詢與終態收斂endpoint：

```text
GET /api/orgmaster/governance/applications/ai-pdm/commands/{commandId}
POST /api/orgmaster/governance/applications/ai-pdm/commands/{commandId}/resolve-unknown
     { requestHash, action = cancel_if_absent_or_expired }

receipt = {
  commandId, requestHash?,
  receiptStatus = processing | applied | rejected | not_found,
  acceptedAt?, leaseUntil?, terminalAt?, decisionCode,
  auditReference?, changeCursor?, governanceRevision?,
  replayed, attempt
}
```

- Durable ledger只保存`processing | applied | rejected`；absence由GET project成`not_found`。Existing stable `commandId` idempotency延伸為可查receipt；terminal exact replay回同decision／audit／cursor／revision且`replayed=true`，不得重複mutation或audit。同command不同`requestHash`固定409。
- `requestHash`是`jenfu.canonical-json.v1`序列化的immutable publish command body之SHA-256 lowercase hex；只含stable Role、operation／payload、normalized reason、preview hash、expected catalog version／payload hash及expected governance／organization revisions，不含token、actor display data、correlation ID或transport metadata。
- processing具`acceptedAt`、`leaseUntil=acceptedAt+30s`、`terminalAt=null`；processing轉terminal時保留前兩者並填server UTC RFC3339 `terminalAt`。absent resolve tombstone固定`requestHash=resolve request hash / acceptedAt=null / leaseUntil=null / terminalAt=resolve time / attempt=0`；GET not_found為null hash／timestamps、attempt=0且不寫ledger。首次接受publish為attempt=1，duplicate／GET／resolve不增加；只有publish handler回既存terminal時`replayed=true`。
- Lifecycle decision固定為`COMMAND_PROCESSING`、`COMMAND_APPLIED`、`COMMAND_NOOP`、`COMMAND_NOT_FOUND`、`COMMAND_NOT_OBSERVED`、`COMMAND_PROCESSING_LEASE_EXPIRED`；validation rejection保留deterministic domain decision。`COMMAND_STILL_PROCESSING`與`COMMAND_REQUEST_HASH_MISMATCH`只作409 response且不改ledger。
- publish handler接受command時第一個durable write為`absent → processing`，processing lease固定30秒並以fake clock測試；正常流程只可`processing → applied|rejected`，terminal receipt immutable。no-op亦保存為`applied / COMMAND_NOOP`，`auditReference=null`且cursor／revision不變。
- governance mutation與`applied` receipt須在同一atomic state commit；processing先於該commit持久化且使用同一command scope。process在兩者之間crash時mutation尚未commit；late commit必須在同一store lock重查ledger仍是該attempt的active processing，否則拒絕。
- `resolve-unknown`在相同store lock內處理：absent→建立immutable `rejected / COMMAND_NOT_OBSERVED` tombstone並阻擋遲到原request；active processing lease→`409 COMMAND_STILL_PROCESSING`且不改狀態；expired processing→`rejected / COMMAND_PROCESSING_LEASE_EXPIRED`且阻擋late commit；已terminal→回原receipt。resolve只改command ledger，不改governance／assignment。
- response lost時AI-PDM只查原command並由人工觸發resolve；不得因client timeout自動取消已commit mutation，也不得讓另一command越過unknown command或自動replay。terminal後AI-PDM仍須reload current並重新preview才可建立新command。
- receipt只回opaque command ID／request hash、狀態時間／lease／attempt、decision、audit reference、cursor與revision，不回actor subject、email、token、before／after個資或raw payload；request／response echo同一`x-correlation-id`，operational log只記redacted decision。

### 22.3 Exact file／command boundary

```text
package.json                                                   (scripts only)
src/governance/aiPdmRoleCapability.ts
src/governance/aiPdmRoleCapability.test.ts
server/aiPdmRoleCapabilityStore.ts
server/aiPdmRoleCapabilityStore.test.ts                        (new)
server/orgmasterGovernanceApi.ts
server/orgmasterGovernanceApi.test.ts
contracts/jenfu-platform-governance-availability/v1/**          (new vendor snapshot＋contract-lock.json)
ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md
```

已執行命令（Local targeted evidence）：

```text
npm run test:dev-008
npx tsc --noEmit
npm run build
```

`npm run test:dev-008` 已通過 3 個測試檔、15 個測試；`npx tsc --noEmit`、`npm run build`、AI-PDM `typecheck:app`／`build:isolated`、兩 repo targeted QC 與 Platform cross-repo contract QC 均已通過。這些是 local／isolated evidence；response-loss drill、Cloud SQL 同交易 durability、Tier-0 outage、SLO／RTO／RPO／rollback 仍屬 `008-R1`，未宣稱 production PASS。

`contracts/.../**`只含Platform DEV-008第6節逐檔列出的3 schemas／error codes／manifest／9 fixtures／lock；除lock外須與canonical package逐檔byte-identical。`test:dev-008`固定涵蓋：九角色同revision／cursor、catalog version／payload hash、authority time、角色缺漏、store lock一致性、workspace manifest／version missing／corrupt／read throw時零legacy／test fallback、bulk redaction、correlation echo、command applied／exact replay／hash mismatch／rejected／processing／not_found、30秒lease、absent／active／expired resolve、late request／commit拒絕、no-op terminal、response-loss recovery及API status mapping。不得修改DEV-005 effective entitlement view、private DB grants、production adapter或role catalog來取得PASS。

DEV-008 core不新增`dev:local:no-browser`或Platform三repo launcher。OrgMaster test runner可在configurable non-primary port啟動task-owned isolated runtime，固定task-owned `ORGMASTER_GOVERNANCE_DATA_DIR`，記錄PID／tree／port／purpose／cleanup並於結束時只清理該tree；不得管理或重啟primary 5000／AI-PDM 3000／Platform 3100。

### 22.4 Recovery／acceptance／stop

- OrgMaster process不可用時沒有新mutation可由本repo執行；AI-PDM已知離線preflight應零dispatch。若request已送達後才失聯，OrgMaster可能已commit，故只能以receipt收斂，禁止宣稱零寫入。
- Bulk read、receipt或publish不得讀寫AI-PDM display snapshot；snapshot由AI-PDM擁有且永不參與OrgMaster authorization。
- 同command response lost、process restart後仍須從durable ledger取得相同terminal receipt；local JSON state不得只把receipt留在memory。Cloud SQL target日後必須讓mutation與terminal receipt同一transaction，但屬DEV-006／release integration，不在本地JSON slice切authority。
- 無法保證source fail-closed、九角色同revision、catalog version／hash、command idempotency／receipt持久化、固定lease後terminal recovery、late commit deny、payload hash mismatch deny、redaction或unknown-outcome freeze時立即BLOCKED。需要production migration、Cloud SQL switch、traffic、deploy或release時轉release gate。

本節已關閉RD技術主管指出的source fail-open、永久unknown receipt、contract drift與launcher過度設計，並完成 mandatory catalog／governance／organization precondition、authority timestamp、timeout／correlation、snapshot metadata 與 durable receipt／resolve 邊界；`RD Tech Lead Re-review=PASS / P0=0 / P1=0`。OrgMaster local `S0～S3＋C1` code、15 項 targeted tests 與 build 已完成；production state、cross-DB durability、Tier-0 outage evidence、runtime ownership與release仍受`008-R1` gate限制。

使用思考習慣：#批判思考、#多層次分析、#系統描繪、#當責

## 23. JMS-PLATFORM-009 System Administrator Privileged Governance — OrgMaster RD Implementation Contract

分類：`Human Confirmed / Compatible Security Refinement / RD Implementation Ready / 009-S0～S4 Local-Isolated Complete / Targeted QA-QC PASS / 009-R1 Release Gate Required / Production Release Gated`

RD技術主管複審：`PASS after correction / P0=0 / P1=0`。本節以shared full-policy classifier取代分散五欄判斷，並以既有verified OrgMaster session＋provider `auth_time`取代未落地的獨立step-up receipt。

跨repo authority為[Platform DEV-009](../../../Jenfu-Management-system/ai-doc/specs/DEV-009-system-admin-privileged-principal-governance.md)。本節只固定OrgMaster direct implementation；不改AI-PDM role／Permission ownership、不新增runtime同步HTTP dependency，也不推翻第21節的一般Role → Position → Employee流程。

### 23.1 Product boundary and normal entry

- `GovernanceCenter`不新增section；沿用既有`assignments`。application=`ai-pdm`且role=`system_admin`時，隱藏一般Employee／scope／validity表單並在原位置顯示「特權設定」，先列redacted exact privileged principals，再提供單筆授予／撤銷。generic V2 submit仍不得接受principal-only role。
- 管理者先選active Employee，再從其active `human_privileged` admissions選exact target；若有多個不得預選或猜測。沒有eligible principal時導向既有身分連結／准入流程，OrgMaster不在此頁建立IAM帳號。
- Browser只接觸`principalAdmissionId`與server redacted hint；raw issuer、subject、完整fingerprint、token、cookie不得進response、URL、DOM、log、screenshot或evidence。
- 具view capability但沒有`orgmaster.cross_app_override`者只讀；390×844由client interaction gate固定只讀，1440×900與1024×768才render並驗證完整grant／revoke。Server不信任viewport／user-agent，只依verified actor、capability、fresh AAL2 session與request contract授權。
- View capability固定為`orgmaster.governance.manage`或`orgmaster.cross_app_override`；只回redacted workspace。`orgmaster.governance.manage`本身不得grant／revoke，mutation仍只接受exact active privileged principal的`orgmaster.cross_app_override`。
- Normal-entry route沿用`/?panels=governance&focus=governance&details=none&governanceSection=assignments`；不新增typed governance section或route key。Route不得接受actor／employee／principal／assignment／command等target參數；進頁後由使用者選擇AI-PDM／`system_admin`，並按目前登入身分重新授權與讀current。
- 共用application／role selector之後只允許一種renderer。UI、V2 validation與command guard共同呼叫`classifyAssignmentSurface`：internal／完整employee-app-admin policy進既有ordinary renderer；只有AI-PDM `role-system-admin／system_admin`同時為active、assignable、critical、principal、cross-app override、global-only且recommendation／delegation=false，才進`GovernancePrivilegedAssignments`。其餘缺欄或矛盾組合固定`CATALOG_ROLE_CONTRACT_MISMATCH`且零submit。
- `ExternalRoleCatalogRoleV1`已存在於歷史published snapshot，新增canonical policy欄位採optional相容；current bundled／live adapter必須全部填入，歷史缺欄snapshot不得回填且只能唯讀。`aiPdmCatalog.ts`與live catalog adapter mapping不得丟欄。切離privileged mode時清除reason／preview／selected admission並取消或忽略late response，禁止污染ordinary mode。
- 一般`AssignmentForm`、一般assignment清單與其revoke control屬ordinary renderer；privileged holder清單、grant／revoke、preview與drawer只屬`GovernancePrivilegedAssignments`。選到`system_admin`時兩者不得同時render。

### 23.2 Read, preview and publish API

```text
GET  /api/orgmaster/governance/privileged-assignments?applicationId=ai-pdm&stableRoleId=role-system-admin
POST /api/orgmaster/governance/privileged-assignments/preview
POST /api/orgmaster/governance/privileged-assignments/publish
```

Read contract固定為`orgmaster.privileged-assignment-workspace.v1`，回catalog version／payload hash、governance與organization revisions、`sourceDataAt`、mutation capability／blockers、eligible principal summaries與active／revoked assignments。Assignment顯示employee reference、`principalAdmissionId`、redacted hint、status、validity與audit reference；不得回raw principal。

Operation只接受：

```text
grant_system_admin  { employeeId, principalAdmissionId }
revoke_system_admin { assignmentId }
```

共同preconditions為exact application／stable role、expected catalog version／hash與expected governance／organization revisions。Publish另要求stable`commandId`、canonical`requestHash`、`previewHash`與非空reason；不新增第二套`stepUpReceipt`或browser bearer credential。Server重算並固定`basis=manual`、`subjectKind=principal`、`scope=global`、`sources=[]`、grant `validFrom=committedAt`、`validTo=null`；client不可自訂scope、subject、target、source或validity。

Fresh-session gate重用既有Firebase→OrgMaster session exchange：Firebase adapter從verified token `auth_time`產生`authenticatedAt`，session repository保存它；不得用session `issuedAt`、exchange時間或client clock代替。只有provider MFA／reauthentication可建立新的authentication window；force refresh ID token或重送舊token仍保留原`auth_time`，不得被視為step-up。Publish從verified request context要求AAL2、exact actor principal與`serverCommitAt-authenticatedAt<=5分鐘`。Legacy null、future time、AAL1、過期或actor mismatch固定`STEP_UP_REQUIRED`、零寫入。Server以actor＋operation＋expected versions重算request hash，並由既有command ledger綁定command／request／preview；相同terminal command replay只回原receipt、不重做mutation，新command仍須在fresh window內。這是re-auth window，不是role期限。

Actor必須以exact active `human_privileged` principal持有`orgmaster.cross_app_override`；同Employee daily principal仍deny。Grant self-assignment固定`PRIVILEGED_SELF_ASSIGNMENT_DENIED`；revoke仍須override但不受self-grant條款阻擋。Preview回before／after、holder delta、redacted target、受影響session數、alert行為、blockers與hash；publish沿用第22節durable command receipt、unknown-outcome freeze與resolve流程。

### 23.3 V2 guard and V3 migration

- AI-PDM catalog可保留`assignable=true`，共用role selector也可列出`system_admin`作mode trigger；但一般Employee／scope／period form與generic V2 submit必須排除`subjectKind=principal`或`assignmentTier=cross_app_override`。
- V2 `/validate/assignment`、`UPSERT_ROLE_ASSIGNMENT`與所有generic publish path收到`role-system-admin`／`system_admin`時固定回`PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED`，零version、audit、event或effective effect。
- V2→V3 migration對一般role補`subjectKind=employee`、`targetPrincipalId=null`；既有V2 `system_admin`進`SYSTEM_ADMIN_PRINCIPAL_REQUIRED` exception，零effective，不猜target、不grandfather。
- Privileged path只寫`GovernanceDocumentV3`／`GovernanceCommandV3`；不得downcast回V2。既有migration 005 effective projection仍是唯一授權資料面；新增additive `007_dev009_privileged_governance.sql`只增加OrgMaster session `authenticated_at`與redacted alert intent／delivery receipt，不建立第二assignment或step-up receipt table。

### 23.4 Atomic effects, alert and outage behavior

每個grant／revoke以單一transaction提交Governance V3 version、immutable audit、`orgmaster.application_projection.changed.v1` outbox、session invalidation outbox與redacted privileged security alert intent。成功receipt必須含governance version、audit reference、`securityAlertReference`與`sessionRefresh=completed|pending`。

Durable alert intent寫入失敗固定`SECURITY_ALERT_PERSIST_FAILED`且整個authority mutation rollback。外部alert delivery可pending並idempotent重試；撤權一旦authority commit，effective view立即deny，不等待session refresh或外部通知送達，也不因dispatcher失敗回滾。OrgMaster unavailable時全mutation deny；AI-PDM既有業務authorization不呼叫OrgMaster HTTP，last-known-good display snapshot永不參與allow／deny。

### 23.5 Projection and display semantics

OrgMaster role capability projection升為`orgmaster.role-capability-projection.v2`；`manualAssignments`可回redacted principal holder摘要，AI-PDM workspace同步升為`ai-pdm.role-capability-workspace.v3`。舊v1／workspace v2 snapshot只能由相容renderer唯讀顯示，不得作current或mutation precondition。

`effectiveHolderCount`對principal role依distinct exact target principal計算，不依Employee去重；consumer對`system_admin`固定顯示「特權身分 N 個」，不得稱「持有人 N 人」，也不得把同Employee daily identity列入。

### 23.6 Exact OrgMaster file boundary

```text
contracts/jenfu-platform-governance-availability/v2/**          (vendored)
src/governance/types.ts
src/governance/aiPdmCatalog.ts
src/governance/aiPdmCatalog.test.ts
src/governance/assignmentSurface.ts                              (new shared pure classifier)
src/governance/assignmentSurface.test.ts                         (new)
src/governance/validation.ts
src/governance/commands.ts
src/governance/evaluatePermission.ts                          (V3 current-document compatibility only)
src/governance/apiClient.ts
src/governance/governancePresentation.ts
src/governance/migrateGovernanceV2ToV3.ts                       (new)
src/governance/privilegedAssignments.ts                         (new)
src/governance/*.test.ts                                        (focused)
src/components/GovernanceCenter.tsx
src/components/GovernanceCenter.css
src/components/GovernanceDialogs.tsx
src/components/GovernancePrivilegedAssignments.tsx               (new)
    src/components/GovernancePrivilegedAssignments.test.tsx             (new focused privileged mode tests)
src/auth/firebaseClient.ts
src/auth/authApiClient.ts
server/orgmasterGovernanceStore.ts
server/orgmasterGovernanceApi.ts
server/aiPdmRoleCatalogRepository.ts
server/aiPdmRoleCatalogRepository.test.ts
server/aiPdmRoleCapabilityStore.ts
server/orgmasterFirebaseIdentityProvider.ts
server/orgmasterAuthApi.ts
server/orgmasterAuthApi.test.ts
server/orgmasterRequestIdentity.ts
server/orgmasterSessionRepository.ts
server/orgmasterSessionRepository.test.ts
server/privilegedAssignmentStore.ts                             (new)
server/privilegedSecurityAlertDispatcher.ts                     (new)
server/*.test.ts                                                (focused)
db/migrations/007_dev009_privileged_governance.sql               (new authenticated_at＋alert outbox)
scripts/qc-dev-009-privileged-postgres.mjs                      (new)
output/qa/dev-009/browser-real/<run>/report.json                (frozen production artifact browser evidence)
package.json                                                    (scripts only)
ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md
ai-doc/adr/ADR-007-external-role-catalog-assignment-boundary.md
ai-doc/dev_task.md
ai-doc/documentation_map.md
```

Allowlist外產品檔案先回PM補why／risk／test；不得順手重構一般role治理或工作台。

`009-S1` allowlist convergence：current governance store升為單一V3後，既有management-method authorization仍需讀OrgMaster內部active policy，因此`src/governance/evaluatePermission.ts`必須接受V3。變更不擴張權威：外部application仍回`EXTERNAL_PERMISSION_EVALUATION_UNSUPPORTED`，不由OrgMaster計算AI-PDM Permission。風險由focused evaluator regression、固定`test:dev-009`分母及client＋server build覆蓋；Spec Drift=`In sync`。

### 23.7 Delivery, acceptance and gates

| Slice | OrgMaster work | Exit |
|---|---|---|
| `009-S0` | vendor v2 contract、current catalog完整projection、shared classifier、V2 generic deny、migration fixture | one-byte drift、完整policy drift、principal-only負例、legacy V2 exception PASS |
| `009-S1` | V3 migration／validation、provider-authenticated fresh AAL2 session、read／preview／publish、alert outbox | `auth_time`、exact principal、self-grant、CAS、idempotency、audit／alert atomicity PASS |
| `009-S2` | 既有「角色指派」內嵌「特權設定」、grant／revoke、empty／denied／stale | 條件式renderer與generic submit隔離；1440／1024完整操作、390只讀、keyboard與redaction PASS |
| `009-S3` | AI-PDM consumer 讀取OrgMaster redacted privileged workspace，投影workspace v3並與一般V2 renderer隔離 | system_admin只顯示OrgMaster管理、特權身分數與固定導引；stale／unavailable唯讀；contract／repository／typecheck／isolated build／real Chromium PASS |
| `009-S4` | 配合Platform cross-repo entitlement／session／outage regression | daily deny、exact privileged allow、revoke immediate deny、OrgMaster outage isolation PASS |
| `009-R1` | initial bootstrap、production target、alert channel、fresh smoke | 獨立release gate；本節不執行 |

`009-S0` evidence：canonical denominator=`7 root files＋12 fixtures／18 manifest entries`，OrgMaster／AI-PDM vendor bytes與locks一致；current aggregate SHA-256=`21db33b350f8908402e405c870eb2cf269cee85c57b56ef762b66f36d91b04a3`。

`009-S1` evidence：OrgMaster current `test:dev-009`=`19 files／75 tests PASS`；isolated PostgreSQL `QA-009-S1-DB-01～05 PASS`。Frozen report=`output/qa/dev-009/postgres/DEV009-S1-2026-09-02T18-10-44-005Z/report.json`，report SHA=`c195ffc190c4b7df0d1ee0f5c7f37e05851c55a0424ed8d8ade925a9584bde38`，candidate SHA=`653dff38e45e634af3e4e691f89cc00149c2c2551592860cc2f05a9b40c9165c`；task-owned cluster／port／temp cleanup全為`true`。

`009-S2` evidence：OrgMaster frozen production artifact real Chromium `8／8 PASS`，由正常launcher進入角色指派，覆蓋grant／revoke、late response、empty／denied／stale／error、1440／1024／390、keyboard、overflow、served artifact parity與cleanup。Frozen report=`output/qa/dev-009/browser-real/DEV009-S2-2026-09-02T18-09-45-579Z/report.json`，report SHA=`a1750d90bfba6476c05c2090605b205f81ffea1fc0857eb826561d2bd515ec8d`，candidate SHA=`e9c2c42365a9865785698e87ae4fc2918085650a60ac4d4ee3317078586f9527`。這取代早期`output/playwright/dev009-s2/manifest.md` mock transport作為現行S2 UI evidence。

`009-S3` evidence：AI-PDM contract＋repository＋real Chromium aggregate PASS；browser `7／7 PASS`涵蓋current／stale last-success data time／unavailable／invalid navigation、1440／1024／390與runtime cleanup。Frozen aggregate=`../../../AI_PDM/output/qa/dev-009/aggregate/DEV009-S3-AGGREGATE-2026-09-02T18-19-00-268Z/report.json`，report SHA=`c93b124b79824bb76271aadb32aa27899527b4b9ddc5a97a77d6b31091951502`，candidate SHA=`4ea4689cd9579f3aa4bf26f77fdba4e21ce01386b3abce163173bc1c7381eb0a`。

`009-S4` evidence：Platform cross-repo `QA-009-S4-01～04`與employee-wide negative guard PASS，並逐檔驗章S1～S3 report／candidate SHA。Frozen report=`../../../Jenfu-Management-system/output/qa/dev-009/cross-repo/DEV009-S4-2026-09-02T18-21-31-904Z/report.json`，report SHA=`f8fa0128ba7304efd4cd326cbe4f94952be3095986ad3006b86a61acce213a9b`，candidate SHA=`4ab63077b3425028c9ffc0df7be84126c199cd10856ce82db746b4de106c554f`。此為local-isolated evidence，不替代`009-R1 Release Gate Required`。

Minimum acceptance：一般V2 UI／API無法建立`system_admin`；完整role policy drift fail closed；只有exact active privileged principal取得effective row；daily／shared／service／inactive及self-grant皆deny；provider `auth_time`→session `authenticatedAt`可證明AAL2五分鐘freshness，且不以issuedAt假冒；grant／revoke只有一個authority effect並可由command receipt replay；alert intent persist失敗零commit；revoke後下一個protected request deny；OrgMaster離線時治理零mutation但AI-PDM非治理route仍可依Tier-0運作；evidence無raw identity／credential。P0／P1容忍值為0。

初始環境沒有任何active override actor時，只能由reviewed bootstrap manifest建立第一個principal-scoped management grant；bootstrap不進一般UI、不接受daily／shared principal，且只在`009-R1`授權後執行。需要production credential、真實principal／role mutation、schema apply、deploy或release時立即轉release gate。

本節文件已達`RD Implementation Ready`，且`009-S0～S4` local／isolated implementation／targeted QA-QC已完成。下一步固定為`009-R1` production release gate；bootstrap、真實production authority、schema apply、runtime切換、deploy與release仍未授權，不得越過相應gate。

使用思考習慣：#設計思考、#效用理論、#系統描繪、#風險導向思考、#當責

## 24. `040-R2` OrgMaster independent continuous production release（2026-09-08）

本節保留DEV-012 S1B OrgMaster owner slice的歷史v1內容；current V3 authority為§30，不建立DEV-048，也不得修改或完成DEV-047。V1／V2的transport與data契約保留歷史，入口與owner stage由Platform DEV-012 §29及本文件§30前向取代。

### 24.1 Owner boundary and exact target

- OrgMaster 只凍結、建置、驗證、部署及回復自己的 source、artifact、`orgmaster-prod` service、hostname、numeric Secret versions、`orgmaster_core／orgmaster_contract`、migration ledger與owner receipt；不得持有 Platform／AI-PDM deploy權限或變更 sibling traffic／state。
- Target 固定 project=`jenfu-platform-prod`、region=`asia-east1`、service=`orgmaster-prod`、runtime SA=`orgmaster-prod-runtime`、origin=`https://org.jenfu.com.tw`、CPU=`1`、memory=`512Mi`、concurrency=`20`、timeout=`60s`、max instances=`1`、pool=`6`。Release resources固定 registry=`orgmaster-release`、image=`orgmaster`、bucket=`jenfu-platform-prod-orgmaster-release`、state key=`dev-040-r2/production-release/default.tfstate`。
- `requiredNewBillingLinks=0` 只表示沿用既有 production project；Billing account、budget、quota、usage、reserve與planned release／incident資源必須在DEV-012 S2 fresh readback，UNKNOWN不得上線。

### 24.2 Runtime and migration contract

Production migration profile是新 v2，不修改 `config/dev-010/n1c-orgmaster.json` 或 staging runner。Manifest逐項複製該profile既有001～010 exact order／checksum，再唯一append `db/migrations/011_dev046_workbench_list_width_preferences.sql`，總數 exactly 11，ledger=`orgmaster_core.schema_migrations`；不得glob、字母排序、修改applied SQL或把execution done冒充ledger／schema readback。

`server/orgmasterDatabase.ts` production guard只接受 environment=`production`、project/instance/database=`jenfu-platform-prod / jenfu-platform-prod-pg / jenfu_prod`與production migrator/runtime；staging guard保持原行為。Runtime fixed env／timeout與Secret names依Platform DEV-012 §23.17；account enrollment及未具正式授權receipt的通知／webhook／outbox／file delivery保持disabled。正常入口驗收固定 login→employee／entitlement update→reload，並證明schema／role／cross-database deny。

### 24.3 Single-capsule workflow, provider and recovery

`.github/workflows/deploy-orgmaster-independent-production.yml` 只有 `workflow_dispatch.releaseCapsuleRef`。Job固定 `prepare→build→candidate→verify→decision→activate→canonical→finalize`，concurrency=`production-release-orgmaster-prod`；禁止 stage／approve／skip／receipt JSON／target override及run中真人GO。Machine decision只在inactive exact candidate與全部PRE_ACTIVATION evidence完成後發布。

Candidate只允許Cloud Run `updateMask=template`且general traffic=0；activation／rollback只允許`updateMask=traffic`。任何write unknown outcome都先provider readback，不blind retry。Incident固定own Pub/Sub→private abort controller，controller只接受`POST /events`與`POST /watchdog`，依owner control head、fresh etag與exact previous revision冪等rollback；錯owner／candidate、重送、412、crash前後與舊worker仍活都要fail closed或readback，不得碰sibling／全DB。

### 24.4 Exact implementation boundary and exit

新增只限：`config/release/dev040-orgmaster-independent-production.json`、`config/release/dev040-production-release-infra-plan.json`、`scripts/lib/dev040-orgmaster-independent-release.mjs`、對應CLI／test／QC、production migration runner與test、owner workflow、`tools/dev-040/abort-controller/{package.json,package-lock.json,server.mjs,server.test.mjs,Dockerfile}`，以及 `infra/google-cloud/dev-040-production-release/` 的 `versions.tf,variables.tf,locals.tf,artifact.tf,storage.tf,identity.tf,workload-identity.tf,incident.tf,service-bindings.tf,outputs.tf,README.md,terraform.tfvars.example,backend.production.hcl.example`。修改只限 Platform DEV-012 §23.13.4 列出的六個 server／test files、`package.json`與`AGENTS.md`及本節 direct docs；產品UI、DEV-047、既有migration SQL與staging profile均no-touch。

Owner commands固定 `npm run test:dev-040:r2`、`npm run qc:dev-040:r2`、`npm run test:dev-040:abort`、`npm run check:db-boundary`、`npm test -- --testTimeout=30000`、`npm run build`、IaC `terraform fmt -check／init -backend=false／validate`與`git diff --check`。S1B完成後最多標示 `040-R2 Implementation Complete / S1B-21 PASS / DEV-012 S2 Gated`；未取得fresh managed與production證據不得寫Release Ready、Deployed或DEV-012 Complete。

## 25. `040-R2 CONTINUOUS_NO_DWELL_V2` executable amendment（2026-09-08）

本節依Platform DEV-012 §25前向取代§24中預先完整capsule、八階段、no-tag candidate與缺少migration job的衝突部分。第一次S1B owner local PASS保留為歷史但標`SUPERSEDED_BY_CONTRACT_V2`。

- 唯一輸入`releaseCapsuleRef`指向OrgMaster immutable release intent，不含artifact／candidate／decision。Build以同source產生application digest與content-addressed migration bundle，綁APP_INFRA_B pinned generic runner digest後發布deployment capsule。
- Workflow固定`prepare→build→migrate→candidate→verify→decision→activate→canonical→finalize`。Migration job runtime固定production `orgmaster-prod-migrator`，exact target `jenfu_prod`，依001～011順序；runner與ledger／schema／ACL readback共同決定PASS，不能把execution done或staging receipt當完成。
- Candidate先建立template-only inactive revision，再以traffic-only加入唯一temporary exact tag且general traffic不變；透過provider-readback tag URL完成login→employee／entitlement update→reload及負例。Activation／rollback traffic-only，finalize／rollback移除tag；migration不down-migrate且必須與previous serving revision相容。
- 既有`scripts/dev040-production-migration-runner.mjs`及test繼續作owner runner；允許新增`infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile`與`migration.tf`，並修改040-R2 profile／lib／CLI／test／QC、workflow、該IaC既有檔及本spec／QA／task／map／AGENTS。產品UI、既有migration SQL、staging profile與DEV-047仍no-touch。
- 正式CLI必須完成GCS／Cloud Build／Artifact Registry／Cloud Run Job／Run service與operation／candidate smoke／traffic／receipt transport；throw-only或echo-only正式路徑不得通過owner QC。

V2完成最多標`040-R2 Implementation Complete / S1B-21 PASS / S2 Gated`；fresh Billing／quota／auth與production release證據仍另驗。

## 26. DEV-012 §§25.6～25.8 implementation conformance（V3 supporting baseline）

OrgMaster production transport已對齊官方regional Cloud Build operation、Artifact Analysis `v1beta1 exportSBOM`與`discoveryOccurrenceId`、Cloud Run exact service/revision URI及GCS generation-bound immutable publication。Cloud Run service必須`reconciling=false`、terminal success且`observedGeneration=generation`；candidate revision缺Ready success或image digest不合即FAIL。Owner workflow維持唯一`releaseCapsuleRef`、九階段、Firebase refresh-token smoke、temporary tag cleanup與own-only rollback。

首次cohort由Platform coordinator依`OrgMaster → AI-PDM → Platform`首先dispatchOrgMaster exact run；coordinator只讀OrgMaster terminal，OrgMaster deployer仍無sibling權限。OrgMaster APP_INFRA_A/B、controller及migration-runner digests、numeric Secret versions、WIF／GitHub production environment與S2 provider receipts必須在首次dispatch前完成；日常OrgMaster release不讀sibling source、state或build。Local owner PASS最多解鎖S2，不能冒充production readiness或LIVE_VERIFIED；DEV-047仍不在本次scope。
## 27. DEV-012 §26 runtime template bridge（V3 supporting baseline）

OrgMaster continuous v2 candidate不再複製R1-04F的一容器holding template。`runtimeConfigRef`須由`config/release/dev040-orgmaster-independent-production.json`決定性建立完整`orgmaster`＋digest-pinned `cloud-sql-proxy`兩容器template，plain environment必須exact complete-set，Postgres URL與session pepper只允許own Secret ID及enabled numeric version。Owner build只可將`APPLICATION_IMAGE_DIGEST`替換為本repo immutable digest；holding traffic在candidate建立與0% tag加入後逐項不變。

## 28. DEV-012 §27 production-entry closure owner amendment（V2 predecessor；current見§30）

OrgMaster official release repository固定為`jedchang0308-jenfu/OrgMaster`、branch=`master`。本owner新增source-freeze／runtime-config／release-intent producer、Workflows internal candidate smoke，以及production data inventory／import／reconciliation與one-time first-principal bootstrap。所有工具只讀own tree、明列local authority paths、own bucket／schema及verified shared receipts；producer input path固定在own `output/dev-012/inputs`且resolved path不可越界，不讀或修改sibling source／state。

Canonical `org.jenfu.com.tw`由DEV-012 shared global HTTPS load balancer穩定路由至`orgmaster-prod`；ordinary OrgMaster release不得修改shared URL map或sibling backend。Service ingress固定`internal-and-cloud-load-balancing`，candidate由own verifier job以ID token存取exact tagged revision；Firebase refresh token只存own numeric Secret version且只授權verifier job讀取。

Local ignored business data不得進image或git archive。S2先建立self-hashed inventory與encrypted handoff，再由owner import job寫`orgmaster_core`，以row/hash/file reconciliation及restore rehearsal驗證。第一個production principal必須由使用者明確指定employee、登入email及Firebase UID；本次bootstrap只允許一筆已驗信Email/Password的active human AAL1 principal、one-time CAS、`system_admin`管理grant與不可變audit，禁止猜用目前登入者、DEV draft、共用或service principal。既有要求fresh AAL2的特權publish／mutation維持fail closed，在未來另立並完成第二因素方案前不可使用，也不得把本次AAL1 bootstrap當成AAL2證據。

本節屬`012-S1C`；owner source與tests完成最多標`S1C owner PASS / S2 Gated`。正式data apply、principal mutation、DNS／TLS、traffic及LIVE_VERIFIED仍須native S2／S3 evidence。

## 29. DEV-012 §28 executable production-entry amendment（V2 predecessor；current由§30取代）

OrgMaster owner source現已實作own prerequisite producer、source-frozen Terraform saved-plan gate／executor、完整兩容器runtime config、Workflows internal OIDC candidate smoke、production data inventory／import／CAS／reconciliation與Email/Password前端；本次production profile不啟用TOTP。正式source只接受clean、remote-reachable的`jedchang0308-jenfu/OrgMaster@master` exact commit；APP_INFRA_B plan必綁該revision、provider-readback foundation manifest及Artifact Registry immutable controller／migration-runner digests。

Production data authority固定盤點116個workspace versions、current manifest、governance、management methods及2個media；1個無法可靠歸屬principal的preference固定排除為`EXCLUDED_UNATTRIBUTABLE_PRINCIPAL`。同一production migration job先驗immutable data/bootstrap hashes，再套forward-only DDL、import與one-time active-policy CAS，最後做row/hash/media reconciliation；不得以容器filesystem、DDL-only execution或DEV issuer資料冒充完成。

第一位production principal由本機identity bootstrap建立並驗證exactly one verified password user、沒有enrolled MFA factor且production TOTP provider為disabled，再輸出不含PII/Secret的first-principal input。Firebase refresh token只以payload存在OrgMaster GCP Secret Manager numeric version與GitHub `production` environment secret：前者僅供candidate Workflows smoke SA，後者僅供owner canonical smoke；source、一般runtime env、log、receipt、coordinator與sibling不得取得值。

OrgMaster是61-connection序列的第一個owner。Fresh Billing固定驗linked projects=5、planned new links=0、TWD3,200 budget與15-row quota；R1 capacity及N1C staging須用current denominator。V2當時production intent另等待DNS／TLS；V3 current由§30移除此custom-domain前置，但identity/data、notification、foundation、OrgMaster APP_INFRA_A/B native receipts及`remainingHumanAction=0`仍必須完成，正式run中不得要求真人ack或固定觀察期。

## 30. `040-R2 CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP` architecture-final amendment（current authority）

分類：`Human Confirmed / Intentional replacement / Architecture Finalized / RD Tech Lead PASS / P0=0 / P1=0 / V3 Implementation Complete / S1B-21 PASS / DEV-012 S1C 8／8 PASS / S2 In Progress / Production NOT_RUN`。本節前向取代§§24～29中custom-domain、shared edge、nine-stage與缺少`entrypoint` stage的current指令；source-freeze、兩容器runtime、001～011 migration、production data／principal bootstrap、Billing／quota、Secret與provider provenance契約仍有效。上游唯一architecture authority為Platform DEV-012 §29。

- 真正問題是OrgMaster release不應依賴第三方DNS或central edge authority。最小架構固定使用provider readback所得`https://orgmaster-prod-9536592944.asia-east1.run.app`；V3 owner profile=`config/release/dev040-orgmaster-independent-production-v3.json`，canonical Git blob SHA-256=`5233c5f7d425f0ec48413f9d105649429a7b7d292441b51a8634ee9058f2767c`。此profile是OrgMaster endpoint、entry policy與production runtime identity tuple唯一deploy authority；Platform只hash-ref及join receipt。profile checksum一律取source revision內Git blob的原始位元，不得取受工作目錄換行轉換影響的檔案位元。256 MiB abort controller固定request-based CPU（`cpu_idle=true`）。Runtime receipt須在provider write前驗`fixedValues`，包含Cloud SQL模式／pool／timeouts、direct origin與共同Firebase project／issuer／audience；漂移即FAIL。
- Workflow固定`prepare→build→migrate→candidate→entrypoint→verify→decision→activate→canonical→finalize`。Candidate只建立inactive exact revision與0% tag，並注入唯一`ORGMASTER_RELEASE_CANDIDATE_ORIGIN`；canonical及candidate拒絕wildcard、legacy hash-host、wrong project／service／tag／region、port、userinfo與path。
- `entrypoint`以fresh etag PATCH exact mask `ingress,defaultUriDisabled,invokerIamDisabled`，target為ingress all、default URL enabled、`invokerIamDisabled=true`；before／after template與traffic必須相同。No-op不PATCH，412／timeout／unknown outcome先readback。失敗固定own traffic rollback→tag cleanup→entry baseline restore，中央及sibling不得代改。
- Public Cloud Run entry只解除infrastructure IAM攔截；OrgMaster既有Firebase identity、host-only session、CSRF、permission、001～011 forward-only migration、`orgmaster_core／orgmaster_contract`、one-time principal CAS、production data reconciliation與AAL2-only fail-closed契約不變。TOTP、DEV-047、existing product UI與migration SQL均no-touch。
- Existing custom domain、Hosting、shared LB／DNS／certificate只作`RETAINED_UNUSED_EDGE`，不在serving或rollback path，本次不刪除、不修改、不解除Billing。移除需三app `LIVE_VERIFIED`、zero traffic／reference與另案exact-resource retirement gate。
- 實作模型可決定不改契約的局部命名、純函式分解與fixture；不得改endpoint、stage order、entry mask、origin allowlist、migration／data authority、principal semantics、owner權限或candidate順序。命中任一項即停止回送Platform DEV-012規劃authority。

Fresh evidence由Platform `output/dev-012/s1c/2026-09-09T142739-410Z/qc-report.json`提供，SHA-256=`07217dcd3f331253a9d998db6e66e8cd1fe3de0c46c5caa29736d7bfceefb556`；contract=`857f8a94ab13f63071156f85e76e5c675b348588b1126c147e0e54b431b6e8c5`。S1A 32／32、S1B 24／24、S1C 8／8，OrgMaster DB boundary、build／typecheck及diff check PASS，V3 Terraform validation PASS，provider／DB／traffic／credential mutation與runtime residue=0。技術主管結論=`PASS / Architecture Finalized / P0=0 / P1=0`，但`releaseAuthority=false`。

Current execution boundary只到DEV-012 S2：fresh remote source freeze、Billing／budget／quota／capacity、Identity／entry baseline、notification／numeric Secret、foundation、OrgMaster APP_INFRA_A/B、encrypted data handoff及first-principal inputs。S3才可執行production migration／data import／CAS、candidate、entrypoint、traffic與canonical smoke；任一UNKNOWN、source/profile drift、`remainingHumanAction>0`或需要改上述架構契約即停止。

2026-09-10 shared-foundation handoff correction：shared foundation維持Platform單一apply authority，但Platform native readiness必將相同canonical foundation receipt鏡像到OrgMaster own release bucket，供owner intent與prepare讀取。Receipt原樣保留`ownerApplicationId=shared-foundation`與Platform `sourceRevision`；`foundation`是唯一豁免OrgMaster owner／source equality的prerequisite，OrgMaster source lock、infra、runtime與production data不得豁免，且app-infra必hard-join OrgMaster owner／source與同一foundation manifest。缺mirror、bytes/provenance drift或豁免擴張均在provider write前FAIL。

2026-09-10 cross-OS source identity correction：OrgMaster `sourceSha256`只接受clean official revision的未壓縮`git archive --format=tar --prefix=source/` bytes SHA；owner build先重算驗章，再gzip上傳Cloud Build source object，壓縮物件GCS SHA獨立記錄。R18 prepare PASS後因舊gzip identity安全停止；production data已建立但未migration，必由fresh source/cohort重建。
