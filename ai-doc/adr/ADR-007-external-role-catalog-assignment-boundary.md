# ADR-007：外部應用角色目錄與角色指派治理分離

狀態：Accepted
日期：2026-08-27
修訂日期：2026-09-02（Jenfu Platform `system_admin` exact privileged-principal治理；前次含account taxonomy `1B / 2A / 3D`、`040-ID1` one-time direct UUIDv7 rekey）
決策來源：使用者確認「各系統權限細節應由該系統設定，OrgMaster 只負責分配角色」
適用範圍：DEV-027、DEV-035、DEV-037、DEV-040 與後續 OrgMaster／外部應用權限串接
取代：`ai-doc/adr/ADR-004-authorization-approval-policy-boundary.md` 的外部應用角色／權限／審核政策權威條款
保留：ADR-004 的共用 IAM `2A`、AI-PDM approval transaction／domain apply 邊界；ADR-005 的獨立治理 store 與不可變發布快照原則

## 2026-08-30 Jenfu Platform Amendment

分類：`Human Confirmed / Intentional Replacement / Documents Only`

使用者確認 `4A / 5A / 6B`，下一輪確認 `1B / 2A / 3A`（本 ADR 對應 `7B / 8A / 9A`）、`4A / 5A / 6A`（本 ADR 對應 `10A / 11A / 12A`），再於本輪確認 `7B / 8A / 9A`（本 ADR 對應 `13B / 14A / 15A`），因此對本 ADR 的 future live integration 語意作以下有意取代：

1. `4A`：Phase 1 允許在同一 Cloud SQL logical database 由 OrgMaster 發布 `access_governance.v_effective_role_assignments_v1`，作為版本化唯讀 pull adapter。這不是 app 直接查詢 `organization`、`orgmaster` 或 local governance store 私有 table；app 只能以 app-scoped runtime DB role 經 `EntitlementRepository` 讀取自己的有效指派，且不得跨 schema DML。
2. `5A`：人類互動式共同IAM subject必須唯一對應active OrgMaster employee／principal。AI-PDM既有帳號保留Firebase UID與`pdm_user_id`納入inventory；human identity進mapping migration，shared account依2026-09-01 amendment退場。不得以email、姓名或員工編號單獨替換stable subject，也不得first-login自動建立employee。
3. `6B`：所有外部應用角色由具授權的角色管理者保存／發布後直接生效；Phase 1 不依 high-risk metadata 另設 maker-checker。risk metadata 仍須顯示及進 audit，但不構成第二人核准 gate。
4. 直接生效 audit 至少包含 actor、reason、before / after、employee / principal reference、application、role、scope、validity、catalog version、assignment version 與 timestamp。此政策不取代 AI-PDM 的 permission mapping、server enforcement 或任何領域審核流程。
5. DEV-037 local-only V2、published versions 與 QA/QC 保留為歷史證據；live view、既有使用者 migration 與直接生效閉環另由 DEV-040 追蹤，不能以 DEV-037 evidence 宣稱已實作。
6. `7B`：AI-PDM 既有 role 全部重設，不建立 role mapping、不匯入 OrgMaster，也不給全員預設角色。切換後只有 OrgMaster 已發布 assignment 是角色權威；legacy role 只能作 inventory／歷史對帳及依後續 retention 決策保存的資料。
7. `8A`：authority cutover 採 dry-run、exception 處理、短暫 freeze、分批 switch、session invalidation、reconciliation 與 rollback point。一次性全切與無期限 legacy / OrgMaster 雙權威都不採用。
8. `9A`：直接生效管理權採 app-scoped role administrator。管理員只能管理被授權 application；一般 OrgMaster admin 或其他 app 管理員不自然取得 AI-PDM 指派權。
9. `10A`：cutover 前可建立已驗證但待生效的 OrgMaster assignment；它只能在所屬 batch authority switch 時原子啟用，切換前不得出現在 effective view 或影響 AI-PDM authorization。
10. `11A`：先以涵蓋一般使用者、主管與管理員的小型 cross-role pilot 驗證登入、allow / deny、撤銷、session invalidation、audit、reconciliation 與 rollback；全部通過後才按部門分批擴大。
11. `12A`：AI-PDM legacy role 欄位於 cutover 後保留唯讀觀察，不得被 UI、API、job、repository 或 cache 用於授權；完成約定 observation window、簽核 reconciliation 與 rollback dependency release 後才可移除。
12. `13B`：OrgMaster super administrator 永久具有跨 app role-management override，成為 `9A` app-scoped 管理邊界的唯一例外。一般 OrgMaster admin、Portal admin 與 app-scoped 管理員仍不得跨 app；每次 override 必須有 reason、before / after、immutable audit 與即時安全告警，但不採 time-limited activation 或雙人取用。
13. `14A`：P0／P1 authorization mismatch或非預期擴權／失權零容忍。session refresh pending停止下一批並由durable outbox重試，不回滾已提交撤權；只有protected request仍出現錯誤授權才回到reviewed rollback point。rollback只能切回單一legacy authority，不得同時接受兩套權威。
14. `15A`：legacy role 自最後一批通過起唯讀保留 30 日或兩個 production release cycle，取較晚者；期限屆滿、OrgMaster 與 AI-PDM owner 簽核 reconciliation、無未解 P0／P1 且解除 rollback dependency 後才可 archive／remove。

本 amendment 取代下文原先把 live adapter 限定為 API／manifest／event，以及要求高風險外部角色另行申請／核准的 future target；不改變 OrgMaster 自有內部權限、publish authorization 或 app-owned permission authority。

## 2026-09-01 Account Identity Amendment

分類：`Human Confirmed / Intentional Replacement / Documents Only`

使用者確認`1B / 2A / 3D`，因此補充並取代「所有既有AI-PDM帳號均為employee principal」及「以泛用管理員帳號承接管理角色」的舊假設：

1. 每位互動使用者使用唯一、公司可管理的個人身分。需Gmail／Calendar者配置Google Workspace，只需內部系統者可配置Cloud Identity Free；個人Gmail只可作有owner、到期日與定期複核的遷移例外。
2. `employeeNumber`與姓名、部門一樣是可變attribute；登入若支援員工編號，只能把它解析到唯一managed identity，不能作canonical Employee ID、密碼或免MFA credential。
3. 移除泛用／共用「管理員帳號」類型。一般app-scoped role administrator與OrgMaster組織資料維護者直接把capability指派employee，使用日常個人identity；發布／撤權等敏感mutation要求近期re-auth／step-up、reason與before／after preview。
4. OrgMaster super administrator、cross-app override、授予管理能力，以及Workspace／GCP／Cloud SQL／Secret Manager／production deploy／traffic／authority switch等高權限行為，必須由同一employee下另一個person-specific `privileged_admin` principal行使。它採強MFA、較短session與最小權限，高權限不得自動傳播到同employee的其他linked identity。
5. `info@jenfu.com.tw`、`sales@jenfu.com.tw`等共用信箱不是employee principal，不得登入Platform／OrgMaster／AI-PDM、取得角色或被綁到任一employee；mail用途可保留為delegated mailbox、group或Collaborative Inbox，禁止多人共用密碼。
6. 現有AI-PDM `info@`採非破壞退場：先盤點實際使用者、補個人managed identities與employee roles、驗證mail／業務替代流程，再停用shared platform login並標記`retired_legacy_shared`。帳號與歷史actor保留，不刪除、不改寫。
7. 新Employee canonical ID目標為OrgMaster建立時一次產生的UUIDv7、不可變且不含姓名／部門／員編語意。既有semantic IDs的遷移方式已由同日`040-ID1 One-time Rekey Amendment`取代；production identity links只可指向完成直接rekey後的UUIDv7 Employee ID。

本amendment不改變`13B`「cross-app override capability永久存在」的決策；它新增的是誰可行使該capability及如何隔離personas。本輪不建立／停用帳號、不改Employee資料、不發布角色、不部署。

## 2026-09-01 `040-ID1` One-time Rekey Amendment

分類：`Human Confirmed / Intentional Replacement / One-time Exception / Documents Only`

使用者確認現有 OrgMaster Employee 資料可直接遷移乾淨，舊ID、舊organization version及舊ID追溯不是產品保留要求。因此取代上述Account Identity Amendment原先的additive bridge設計：

1. `040-ID1`只為非UUIDv7 Employee產生新UUIDv7；既有有效UUIDv7原值保留。workspace、governance、management-method中所有受影響reference依同一execution plan重寫。
2. 輸出只保留一份新V8 canonical baseline；產品不保留legacy-ID mapping、semantic-ID alias、雙讀resolver、舊organization version或舊Employee-ID audit chain。
3. old→new mapping只能短暫存在task-owned migration context與rollback snapshot，不可出現在產品資料、一般evidence或Platform reconciliation receipt。
4. 一次性豁免只取代Employee-ID／organization baseline的retention策略；不取代`info@`共用帳號非破壞退場、AI-PDM actor資料、legacy-role observation window或分批authority cutover。
5. 實際apply仍需source freeze、全reference closure、repo外敏感execution plan／rollback snapshot、maintenance sentinel、crash-recovery journal、session revoke、restart readback與cleanup receipt。local JSON三個store沒有共同transaction，不宣稱單一commit point；任一unknown reference或partial write均fail closed並整體rollback，不以豁免理由降低操作安全。

權威exact schema、file allowlist、commands、recovery與QA／QC見`ai-doc/specs/DEV-040-jenfu-platform-entitlement-user-integration.md`第20節。本修訂只更新文件，不代表已遷移資料、已建立identity link、已部署或已release。

## 2026-09-01 Position-to-Application-Role Amendment

分類：`Human Confirmed / Compatible Refinement / Documents Only`

使用者選擇`User → Position → Application Role → Permission`，不採`User → Position = Role → Permission`。此amendment細化「組織異動與角色指派之間的可追溯治理」，不改變app-owned role／permission或OrgMaster assignment authority：

1. Position是OrgMaster組織事實，Application Role是外部app能力包；兩者保有不同stable ID與生命週期。禁止依職位名稱、部門名稱或同名role字串自動授權。
2. OrgMaster保存versioned Position-to-Application-Role recommendation policy；只有OrgMaster內部治理能力`orgmaster.position_role_recommendation.manage`可修改，單純Position／組織資料維護權及AI-PDM app administrator均不包含此能力。
3. Employee取得Position時只更新可檢視的組織投影，不產生entitlement。app-scoped role administrator必須在AI-PDM「角色能力」經BFF檢視Role、permission摘要、scope、validity、risk、before／after與reason並發布，才形成有效Employee-to-Application-Role assignment。
4. 一個Position可建議零到多個Role，多個Position可重用同一Role；兼任、代理、外部專員與個人例外仍以Role assignment＋scope＋validity表達，不建立Employee-to-Permission直連。
5. Position改名不改Role／Permission；新增Position或mapping擴權不自動授權。position-based assignment的來源Position assignment失效時，effective entitlement與受影響session／cache必須fail closed；manual assignment不連帶撤銷。
6. Policy變更不回寫歷史published assignment，只建立新建議與需複核清單。current phase不啟用任何低風險Role全自動provisioning；未來如需自動化須另做Human Decision Gate、reconciliation與rollback。
7. 對外effective assignment view維持既有V1欄位；管理UI另只透過app-scoped role capability projection取得必要的Position／Employee、recommended／adopted／assigned與source摘要。完整provenance／audit仍屬OrgMaster私有資料，不開放AI-PDM直接讀表。

完整跨系統契約見[Jenfu Platform DEV-005](../../../Jenfu-Management-system/ai-doc/specs/DEV-005-position-derived-application-role-assignment.md)。`#效用理論`

### RD Implementation Ready refinement

本 amendment 的實作邊界已在 Platform DEV-005 與 OrgMaster DEV-040 §21 固定；以下條款是本 ADR 的相容細化，不另建第二套 authority：

1. AI-PDM current target catalog固定為`ai-pdm.role-catalog.2026-09-03.v3`，依序包含`role-rd`、`role-rd-manager`、`role-qa`、`role-manufacturing`、`role-production-planning`、`role-procurement`、`role-external-specialist`、`role-pdm-admin`、`role-system-admin`九個stable ID，exact SHA=`46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8`；`role-document-admin`與已退役`bom.review.*`不在active catalog。OrgMaster只保存帶vendor-lock的唯讀snapshot與reference，不可修改role或permission內容。request time以AI-PDM active catalog作policy authority；assignment catalog version只作provenance，version不同本身不deny，missing／retired／code drift／subject-scope不相容才deny。
2. Current Phase的scope只接受：一般內部role=`workspace`；`role-external-specialist`=`project`、manual direct，使用零department／零Position的active Employee identity anchor並必須有另一位active internal sponsor／review metadata／finite hard expiry；`role-system-admin`=`global`、`subjectKind=principal`且只可直接指向同employee的active `human_privileged` principal。External與system admin均禁止Position recommendation／delegation；system admin另禁止self-assignment與employee-wide傳播。AI-PDM尚未具備一致的department resource evaluator，因此不得以文件宣稱department scope已受server enforcement。
3. `GovernanceDocumentV3`新增versioned `positionRolePolicies`、`applicationPositionAdoptions`、`managementGrants`與assignment provenance；assignment另固定`basis=manual|position_adoption`、`subjectKind`及`targetPrincipalId`。Target V3不保存per-employee recommendation ID／accept／dismiss decision或legacy basis；未上線local foundation在`005-S2`前刪除／重構並重建fixture，不建立production migration相容層。
4. Assignment生命週期分為兩軸：immutable published assignment的`active | revoked`與依authority source即時計算的`pending | active`。來源Position assignment失效時只關閉該position-based assignment；manual assignment不受連帶撤銷。
5. 每一Employee／application在任一request只可由`legacy`或`orgmaster`單一authority source決定，不做business request雙讀或union。切換／撤權順序固定為validation／CAS成功、authority mutation＋durable outbox同transaction commit、再呼叫Platform employee→principal auth-epoch refresh。Platform outage保留pending outbox並停止下一批，但不得回滾已提交撤權或讓舊role繼續effective。
6. 管理能力授予principal而非只授予Employee，以隔離daily與privileged persona；`ai-pdm.position_adoption.manage`與`orgmaster.position_role_recommendation.manage`分離，高權限role禁止self-assignment。Position／組織資料編輯權不隱含role-management capability。
7. 實作順序固定為Platform migration`002`、AI-PDM migration`055`、OrgMaster migration`005`；候選／切換前gate失敗保留legacy authority，已提交撤權後的refresh故障則由outbox重試，不以回復legacy重新擴權。
8. AI-PDM BFF read model只合併`GET /applications/ai-pdm/role-capabilities/{stableRoleId}`與AI-PDM active catalog；四個mutation route收斂為preview／publish兩個facade，以operation discriminator保留兩種交易。OrgMaster只發布`orgmaster.application_projection.changed.v1`，AI-PDM透過cursor change feed at-least-once拉取；gap／expired時full projection reconciliation，event不作授權依賴。

狀態：`RD Implementation Ready / RD Not Started / Documents Only / Production Release Gated`。本段不代表schema、程式、資料、runtime或release已變更。

## 2026-09-02 System Administrator Privileged Governance Amendment

分類：`Human Confirmed / Compatible Security Refinement / 009-S0～S4 Local-Isolated Complete / Targeted QA-QC PASS / 009-R1 Release Gate Required / Production Release Gated`

使用者確認不把 AI-PDM `system_admin` 移出 OrgMaster 治理，而是把它從一般 Position／Employee 指派流程抽離，建立 exact privileged principal 的單一路徑：

1. OrgMaster 保留 `human_privileged` principal admission、`system_admin` assignment／revoke／version／audit authority；AI-PDM 保留 role／Permission mapping 與每個 protected request 的最終 Allow／Deny。這是控制面與資料面的分工，不是雙權威。
2. OrgMaster 不新增獨立頁面；既有「角色指派」選到 `role-system-admin` 時，隱藏一般 V2 表單並就地顯示「特權設定」。validation、command 與 generic publish path仍不得接受該角色；固定回 `PRIVILEGED_ASSIGNMENT_SURFACE_REQUIRED`。
3. 共用role selector可列出`system_admin`作mode trigger，但UI、V2 validation與command guard必須共用同一full-policy classifier；只有role identity、active／assignable、critical risk、principal／cross-app tier、global-only scope及recommendation／delegation=false全部一致才進privileged renderer。任何缺欄或drift固定`CATALOG_ROLE_CONTRACT_MISMATCH`，不得回退一般表單。歷史V1 snapshot不回填、只讀；current bundled／live adapter必須保留完整canonical role metadata。
4. `system_admin` 只接受 `basis=manual`、`subjectKind=principal`、`scope=global`、exact active `human_privileged` admission。Browser 只傳 `principalAdmissionId`；server 經 active identity link解析 `targetPrincipalId`，不接受 raw issuer／subject／fingerprint，也不把權限傳播到同 Employee 的 daily principal。
5. Phase 1維持既有決策：不新增 maker-checker、限時啟用或倒數等待；grant／revoke仍須 exact privileged actor、近期強驗證、非空 reason、before／after、immutable audit與 durable security alert intent。近期強驗證重用verified OrgMaster session；`authenticatedAt`只取provider `auth_time`，AAL2且距server commit不超過5分鐘，不另建step-up receipt／store。Self-grant拒絕；初始零管理者只能走 reviewed release bootstrap。
6. V2→V3 migration對一般role補employee subject；既有V2 `system_admin`不得猜測principal或grandfather，進 `SYSTEM_ADMIN_PRINCIPAL_REQUIRED` exception且產生零effective row。
7. OrgMaster不可用時只凍結治理mutation。AI-PDM runtime只讀Tier-0 app-filtered effective entitlement，不同步呼叫OrgMaster HTTP；AI-PDM可永久顯示last-known-good holder snapshot，但必須標示authority資料時間且不得拿snapshot參與授權或mutation precondition。
8. AI-PDM `system_admin`頁不顯示「尚未採用職位」或Position控制，只顯示「由 OrgMaster 管理」、redacted特權身分、資料時間與前往既有「角色指派」的導引。principal role計數單位是「特權身分 N 個」，不是自然人數。

跨系統權威契約見[Jenfu Platform DEV-009](../../../Jenfu-Management-system/ai-doc/specs/DEV-009-system-admin-privileged-principal-governance.md)；OrgMaster direct implementation contract見DEV-040 §23。`009-S0～S4`已完成local／isolated implementation與targeted QA-QC；S1 PostgreSQL、S2 OrgMaster normal-path browser、S3 AI-PDM aggregate與S4 cross-repo均有frozen report／candidate SHA，S4另逐檔驗章S1～S3 receipt。此狀態不代表production schema已apply、真實principal／grant已建立、bootstrap、deploy或release已完成；下一步固定為`009-R1 Release Gate Required`。

## Context

DEV-027 local MVP 依原 `1B` 把 OrgMaster 建成 Application Role、Permission、Role-Permission mapping、Scope、Delegation 與 Approval Policy 的可編輯 policy authority。這可以在單一 local sandbox 驗證授權與 reviewer resolver，但若 OrgMaster 未來連接多個應用，每個應用的 action、risk、permission code、角色組成與領域審核語意都不同。

讓 OrgMaster 人工定義外部應用的 Permission 或 Role-Permission mapping，會造成下列問題：

- 外部應用改版時，OrgMaster catalog 可能過期或錯誤擴權。
- OrgMaster 必須理解每個外部系統的內部功能與敏感操作，形成跨產品耦合。
- 外部應用仍必須在自己的 server boundary enforcement，卻可能與 OrgMaster 的角色定義產生雙重權威。
- 「角色分配審核」與「AI-PDM 領域文件／BOM／發布審核」容易被混為同一種 approval。

原始ADR當時只授權修改OrgMaster；2026-09-01本輪已取得跨repo開發文件同步要求，因此只同步AI-PDM active spec／task／documentation map的相容性amendment。產品程式、schema、角色、權限、資料與runtime仍未授權修改，不宣稱live catalog sync或實際授權已完成。

## Options considered

1. **OrgMaster 集中定義所有外部角色與權限**：單一 UI 最集中，但 OrgMaster 必須跟著每個系統的權限細節改版，並形成雙重權威。
2. **外部系統擁有角色／權限目錄，OrgMaster 集中治理角色指派**：各系統保有領域語意與 enforcement，OrgMaster 統一回答誰在何種範圍與期間取得哪個角色，責任清楚且可擴充。
3. **外部系統同時擁有角色定義與人員指派**：耦合最低，但每個系統重複維護員工／組織對應、到離職撤權與指派稽核，失去 OrgMaster 的組織治理價值。

## Decision

採 Option 2：**角色目錄聯邦、角色指派集中治理**。

### 外部應用（包含 AI-PDM）擁有

- Application Role 定義、穩定 role code／ID、說明、狀態與可指派性。
- Permission catalog、Permission 的操作語意與風險等級。
- Role-Permission mapping。
- 該應用的領域審核政策、工作項、核駁決策、交易 audit、冪等與 domain apply。
- 所有敏感 API／資料操作的最終 authorization enforcement。

### OrgMaster 擁有

- 共用 IAM `issuer + subject UID` 與 OrgMaster employee／principal mapping。
- 員工到外部 Application Role 的 assignment。
- assignment 的 scope、有效期間、撤銷／重新啟用與角色代理；這些都是角色指派治理資料，不改寫外部 Permission 語意。
- 外部角色指派由具授權的角色管理者直接保存／發布；Phase 1 不依風險另設 maker-checker。OrgMaster 擁有發布版本、risk metadata 與 governance-change audit。
- 組織異動、到離職與角色指派之間的可追溯治理，但不得用職稱、部門或同名字串自動授權。

### 目錄與整合契約

- OrgMaster 對外部 Application Role 目錄只讀；UI 不提供新增、刪除或 Permission Matrix 編輯。
- 外部目錄必須帶來源 application、catalog version、stable role ID／code、display name、status、assignable 與必要風險提示。未知、停用、不可指派或版本無法確認時 fail closed。
- OrgMaster 可以保存具來源與版本的唯讀 catalog snapshot／manifest，但它是同步快照，不是第二份可編輯權威。
- OrgMaster 自己是 `orgmaster` application 的 owner，因此 OrgMaster 內部系統角色／權限仍由 OrgMaster 定義及 enforcement；外部角色目錄規則不反向移除自我治理能力。
- Phase 1 assignment consumption 採同一 logical database 的 `access_governance.v_effective_role_assignments_v1` versioned read-only view。它是正式 pull adapter；禁止讀取 OrgMaster 私有 table、跨 schema DML 或瀏覽器直連。若未來拆 database／instance，改用版本化 API／event projection，但不得改變 `EntitlementRepository` 上層語意。
- AI-PDM 未修改前，OrgMaster 可使用明確標示來源／版本的本機唯讀 fixture 驗證指派 UI，但不得宣稱角色已同步或在 AI-PDM 生效。

## Consequences

- OrgMaster 的 Application Role 畫面改為「外部角色目錄唯讀＋角色指派」，不再是外部權限設計器。
- OrgMaster 的角色指派／撤權由授權管理者直接生效並稽核，不建立外部角色 maker-checker；AI-PDM 文件、BOM、發布或其他領域審核仍由 AI-PDM 定義與執行。
- DEV-027 現有 AI-PDM role／permission seed、Permission evaluator、reviewer resolver 與 Permission Matrix domain commands保留為已完成 local MVP 的歷史實作證據，但不再代表 future target authority。
- DEV-027／035 的既有 QA/QC 只能證明當時 local V1 delivery path，不能作為新責任邊界已實作的證據。
- 後續 OrgMaster-only 產品重整由 DEV-037 追蹤；其 `RD Implementation Ready / RD Not Started` 契約已固定於 `ai-doc/specs/DEV-037-external-role-catalog-assignment-governance.md`，QA／QC 位於 `ai-doc/qa/DEV-037-external-role-assignment-validation-plan.md`。RD 只可依 V2 非破壞 migration／recovery 與 file allowlist 修改 OrgMaster，不直接刪除既有 V1 bytes、歷史 published snapshot或 audit。

## Migration / compatibility impact

- 原始ADR只修改OrgMaster；2026-09-01 Position amendment另同步Platform與AI-PDM開發文件，但不修改任何產品程式、local governance store、schema、角色／權限資料或runtime。
- DEV-037 的既有published policy／audit／snapshot繼續作為當時local V2 evidence，不回寫成live-integration已完成；但`040-ID1`的新canonical baseline依上述one-time exception只重建當前有效業務語意，不將舊Employee-ID history帶入產品。
- 未來 OrgMaster 重整至少需處理：external catalog source metadata、唯讀 UI、禁止外部 role／permission mutation、assignment reference validation、catalog stale／missing recovery 與現有 draft／published version 相容策略。
- live AI-PDM integration 已獲准納入平台開發規劃，但本 amendment 只授權修改開發文件。Human Decision Gate與DEV-005 Implementation Readiness已完成；catalog delivery、view DDL／grant、identity migration、app-scoped capability、privileged principal、P0／P1 detector、failure mode與cutover／rollback contract以Platform DEV-005及DEV-040 §21為準。狀態是`RD Implementation Ready / RD Not Started`；production migration、authority activation、deploy與release仍須另行授權。
