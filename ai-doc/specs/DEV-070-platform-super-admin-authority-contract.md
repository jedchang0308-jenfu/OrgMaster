# DEV-070：平台超級管理員權威與首次初始化

日期：2026-11-05；更新：2026-11-06（Asia/Taipei）。Native：ORGMASTER/DEV-070；來源：JENFU/DEV-022#authority-and-bootstrap。成熟度：IMPLEMENTING / RD Readiness Review；administration authority／consumer 切片已定案，所有環境的完整執行契約尚未 Ready。人類最新授權為四專案完整實作至真實地端與正式發布。已完成前次文件收斂並恢復同一已授權工程；source／隔離測試與 exact owner append gate 持續交付。真實 Google 核身、地端／正式 schema、任用及發布尚未執行，不視為完成。

總控權威契約：`C:/VIBE CODING/.worktrees/Jenfu-Platform/dev022-platform-super-admin-20261105/ai-doc/specs/DEV-022-platform-super-admin-cross-project-plan.md`（clean Platform owner root）；`C:/VIBE CODING/Jenfu-Platform` 原 root 僅作協調鏡本，不作 release source。相鄰責任沿 DEV-057 Principal／writer fencing 及 DEV-058 集中任用；不重開原驗收或替它們結案。[架構決策](../adr/ADR-007-external-role-catalog-assignment-boundary.md#platform-super-admin-20261105)。

## 1. 人類決策與範圍

指定 jedchang0308@jenfu.com.tw（張仕杰／JFS0005）在正式及地端取得平台超管。沿用同一 Google personal、真 AAL1、中文姓名，不另建 privileged 帳號。兩環境各自綁定 exact Principal，不複製 local UID／Employee／Principal 到 production。

OrgMaster 是身分核實、root／app 管理員任免、發布及 audit 的唯一權威。Platform 處理認證／SSO／epoch 與顯示；各 app 保留能力及業務判權。root 不是 Cloud IAM、DB owner、Secret 或業務免驗證權。本輪須完成產品實作與發布；「正式沒有此 user」仍須 owner 唯讀核實，再依同一已授權 target 準備 native mapping 或重用既有 Principal。

## 2. 現況與受影響 source

- src/governance/privilegedAssignments.ts 分別讀 roleAssignments 與 managementGrants；hasCrossAppOverride 限 exact Principal／Employee、ai-pdm 與 orgmaster.cross_app_override，授 PDM system_admin 不會產生 root。
- 同檔、validation.ts 與 PDM consumer 仍有 human_privileged 專用資格。fresh session 現行接受 AAL1／AAL2；AAL1 與 personal 是否適格是兩條獨立條件，須一起改正確的資格來源。
- GovernanceCenter.tsx 把 pdm_admin 與 orgmaster_admin 合列「系統管理員」，另外顯示「特權設定」，使普通業務 profile 和系統管理資格混淆。
- 真實核身沿 server/orgmasterManagedIdentityService.ts 的 signed Google token、googleUserId、live Directory immutable key、active Employee 與 managed link；orgmasterAccountProvisioningPort.ts 的 simulated adapter 不是正式 Google 建帳器。
- 舊 DEV-012 production-data 要求空初始治理；DEV-057 local first-admin seed 會搬移特定 Employee／重建批次，均不得用於追加超管。

工程面包括治理 types／validation／published evaluator／assignment surface、API／store／writer、managed identity、GovernanceCenter／管理表單、各 app projection，以及 db/migrations 新 producer／ACL。§7–§11 凍結本輪 current source 的資料、wire、ledger 候選、caller 及驗證；這些是本輪實作契約；下列 source 自查僅支持已列範圍。

## 3. 權威模型

平台管理 grant 與普通 app assignment 明確分型。新 root code 為 platform_super_admin，scope={kind:platform}、subjectKind=principal、basis=manual（直接授權、無委派），grant 與發布／command receipt 關聯。首次 root 有效期不另設自動到期，採明示撤銷；完整欄位見 §7。

目標須唯一解析到 current active 個人人類 admission（human_personal 或 human_privileged）及 active Employee。shared／service／inactive／unresolved 拒絕；root 不依 Employee、職位、推薦、委派、email／domain 或同人其他 Principal 推導。不全面放寬所有 personal 使用者的特權條件。

沿既有治理 snapshot、publication、receipt、audit／outbox；需要不相容欄位時另版並保留明確 reader 窗口。平台 projection 只供所需 consumer 讀 opaque Principal／Employee／role／scope／有效期與發布資料；Platform 不另存可修改的 root 名單。

root 管理後續 root 及各 app 管理員任免；各 app 管理員只能管理自己系統的設定及普通業務任用。管理身份與等效管理能力不可從普通角色編輯器產生；舊 PDM system_admin 持有人不自動成 root。

本次本人預覽明列 OrgMaster、PDM、FMS 的必要管理任用。FMS 依 JF-FMS/DEV-070 的管理專用定義，不能用 Owner 全財務角色代替。目錄尚未接入或版本不相容時不硬塞未知 role。

FMS 管理角色使用 administration grant 派生的 v3 Principal assignment（§8）；現有普通 Employee assignment 語意保持原樣。現有 financialInitialAuthorityStore 的固定 Owner／FinanceManager 初始 role set 不能重播或代替新窄管理任用。

## 4. 首位初始化的 owner 命令

只追加指定對象缺少的身分、admission／必要 profile 與授權；不覆蓋治理、不清空 audit／commands、不搬移別人任用。初始化由有界 owner 執行包核實指定目標，不公開 first-login 自授入口，也不以 actor.bootstrap=true 令普通 runtime 自授。

| 階段 | 契約 |
| --- | --- |
| plan／preview | 讀 active publication／組織 revision、平台 root 狀態與 app catalog；列 reused／created／granted 差異並鎖環境及核身 selector。 |
| identity verified | 核實指定 Google 的 live Directory immutable key 與真實簽章 provider token。解決缺 published login access／既有 root 的循環，不能要求先完成依賴它的普通登入。 |
| commit | environment／目標／org／governance／catalog 無漂移；共用初始化序列化與 CAS，保證首次平台 root 只有一筆結果。同 owner transaction 保存 grant、publication、audit 及 durable outbox。 |
| readback | 固定 command ID、request hash、preview binding；相同操作回原 receipt，異 payload 拒絕；unknown commit 查原結果，不另造 operation。 |
| activation | 逐 owner 讀回 app profile／epoch acknowledgment，必要 invalidation 後以真實重新登入確認。跨 owner 分別交易及收據，不宣稱全系統原子 transaction。 |

初始化檢查新的平台 root 及操作收據。既有 app admin／舊 bootstrap 不等於新平台 root 已初始化，也不是重跑舊 bootstrap 的理由；已消耗的命令不能換人重用。兩環境分開 CAS／receipt，不接受 nonprod token 向 prod 提交。

不能重跑 DEV-012 import／password wizard 或 DEV-057 local rekey/reset。Google 公司帳號既有就不重建，正式只建立缺少的環境身份；Employee 歸屬歧義只停止該寫入，不猜測。token 僅供當次核身，不存入文件、receipt 或 log。

一般任免沿 authenticated root、active admission、近期真實 provider authentication、same-snapshot CAS、防重送及 audit。refresh 不更新 auth_time。禁止普通人自我升權及無替代／受控 recovery 時移除最後一位 active root；首次 owner 授權是單次明示例外，不全面取消 self-grant 保護。

有效 root 計數須包含 Employee／Principal／admission 與管理入口資格。治理內停用身分、移除 root、撤關鍵 OrgMaster 管理入口須共用連續性檢查，並驗撤 grant 與停用資格競爭；不可只看 grant.status。外部 Google 停用仍 fail closed，不能假裝帳號可用；由有界 owner recovery 處理。合法 provider alias 若仍屬同一 Principal，沿既有 canonical binding；不同 Principal 即使同 Employee 也不繼承。

## 5. API、UI 與相容

現有治理 API 加入平台管理 workspace、preview、commit、command-result 語意，復用 request identity／write actor；首次 owner command 與一般 UI 共用純驗證及提交邏輯，但有不同的、只允許指定初始化的 admission。不得只擴大 ai-pdm override 的 applicationId allowlist。

缺權拒絕、revision／hash drift 回 conflict、目標／catalog 無效回 validation、權威不可用回 dependency error。中文訊息分清未初始化、無權、不適格、草稿／未發布及未知結果；§9 固定 wire／path／error code。

UI 清楚分「平台超級管理員」與每欄唯一的「某系統管理員」。尚無 root 時說明一次性初始化入口，不能只顯示「需要已有 root」；成功及 command recovery 後都有可辨識的待發布／生效下一步，不自動跳到無關面板。

DDL 僅 orgmaster_core／orgmaster_contract、db/migrations forward-only，exact consumer ACL；runtime 不得取得 owner／DDL。先有相容 reader 再啟用新 publication；舊 hash／receipt／applied migration／角色歷史不改寫，正常授權始終只有一份 published authority。

回復以本次 operation 的 grant/profile ID 為範圍，先查結果再由相應 owner 撤銷與 invalidation。撤 root 不代表獨立 app 任用也失效；若回復整批新增內容，須逐 owner 明示撤回。不得由舊 snapshot 復活已撤權身分、整庫還原或恢復 UID/email fallback。

## 6. 必要驗收與下一階段

| AC | 可判定結果 |
| --- | --- |
| O01 | 指定 personal＋AAL1 可初始授權；普通 personal、同 Employee 另一 Principal 不取得 root。 |
| O02 | 已有業務治理但空 root 可追加；原資料／任用／audit 保留。沒有既有 app grant 的新正式身分也能沿受控初始核身完成。 |
| O03 | 並發只有一次、相同 replay 不新增、衝突／unknown outcome 可查；失敗 rollback、最後 root 及 protected role 保護成立。 |
| O04 | 普通角色不能複製管理能力；app admin 跨 app／改 root 拒絕，舊 system_admin 不自動成 root。 |
| O05 | 正常 UI 清楚區分草稿／發布／初始化／不可用，原加入草稿及查結果後有下一步。 |
| O06 | 真實 Google→Portal→OrgMaster／reload／管理與撤權結果符合 owner readback；isolated、地端、正式證據分層。 |

本階段只查文件與引用，以上未執行。下列工程契約供後續 coding；資料／授權結果不以 UI badge／HTTP200 取代。正式 executable release package 由當次 owner workflow 產生。

## 7. Administration document 與不可變條件

保留 `GovernanceDocumentV3`／`GovernancePolicyDataV3`，以可選 administration extension 演進，不建立第二份 grant store 或全治理 V4：

```ts
type AdministrationPolicyV1 = {
  contractVersion: 'orgmaster.administration-policy.v1'
  version: number // positive safe integer; absent extension normalizes to 0
  initializedByCommandId: string | null // UUID; once set never cleared
  grants: AdministrativeGrantV1[]
}
type AdministrativeGrantV1 = {
  id: string // UUID, immutable
  principalId: string // existing opaque Principal ID, never an email selector
  employeeId: string // existing environment-local Employee ID
  roleCode: 'platform_super_admin' | 'application_system_admin'
  applicationId: null | 'orgmaster' | 'ai-pdm' | 'financial-management-system'
  subjectKind: 'principal'
  basis: 'manual'
  scope: { kind: 'platform' | 'global' }
  status: 'active' | 'revoked'
  validFrom: string // canonical UTC ISO instant
  validTo: string | null // [validFrom, validTo)
  createdBy: { kind: 'principal' | 'owner_workload'; id: string }
  reason: string // NFC normalized, trimmed nonblank, <=240 Unicode code points
  catalogBinding: null | {
    catalogVersion: string
    contentSha256: string // lowercase hex64
    stableRoleId: string
    roleDefinitionHash: string // lowercase hex64, owner-normalized definition
  }
}
```

Root 只容許 applicationId=null／platform scope／catalogBinding=null；本版 root `validTo=null`，不容許以期限屆滿繞過最後管理員保護。app-admin 只容許已列 app／global scope／該 app canonical catalog binding。OrgMaster 使用 `role-orgmaster-admin`、PDM 使用 `role-application-system-admin`、FMS 使用 `role-system-admin`；不可互換。app grant 可有有效期，但最後有效 root 的 OrgMaster entry grant 不得有早於替代入口的到期點；檢查 prospective 時間邊界，避免排程到期造成零入口。

同 Principal／roleCode／applicationId 不得有重疊有效 active grant；不同角色或 app 是不同 grant。撤銷將原 id 改為 revoked，createdBy/原 reason/validFrom 保持；撤銷者、撤銷原因及時間留 command/audit。app 續期用 `replace_application_administrator` 同交易撤舊授新 id；不覆寫歷史 grant。新 version 單調加一，空 no-op 回 existing receipt／`no_change`，不新增 publication。未知欄位／型別、錯誤 role/scope 組合、grant ID 重複、invalid timestamp/hash、非唯一 active target 一律拒絕。

舊 snapshot 缺 extension 讀為 version0／initializedByCommandId=null／grants=[]；不改其原 bytes、snapshotHash 或 terminal receipt。新 publication hash 使用既有 canonical sorted JSON 並包含 administration。初始化以後所有普通治理寫入、import/reduction、workspace切換、publication及歷史恢復必須保留目前 administration；不得以選舊 batch 或備份重設初始化。legacy `managementGrants`／`roleAssignments` 不保存新 root/app-admin grants。

OrgMaster source-owned admin profile固定沿 `role-orgmaster-admin` 的現有管理 permission mapping；將 definition/hash 納入 protected registry。evaluator 只在 exact Principal app-admin grant 有效時派生此 role，沿既有 permission/explicit deny 計算，不加 root allow-all。管理型 stable ID、能力集合與指派入口受伺服器保護。既有 legacy OrgMaster 管理任用維持既有含義；新管理任用只走 administration。舊 PDM system_admin／cross_app_override 及 FMS Owner/protected-management-grant 寫入入口須辨認初始化狀態：初始化後新授／恢復受保護管理資格只准 root，不能由普通 governance.manage 或 app admin 繞入。舊有效任用不自動轉 root，也不批次重寫。

## 8. DB／projection／ACL 與 writer fence

### 8.1 Forward-only 範圍

新 source 檔案為 `db/migrations/044_dev070_administration_projection_v1.sql`、`045_dev070_administration_commands_v1.sql`，尚未正式套用。clean writer base 已有 040／041，042 prerequisite 為 `042_dev057_principal_display_profiles.sql`；另有 actual local native 043，因此本 goal 不占 043。續接工程仍須核檔案／ledger／hash；已套 043 不重放或改 hash。044 僅 producer views/functions/manifests/ACL，045 是私有 receipt 與受控 writer，均限 orgmaster_core/contract。不能修改 applied 021/024/029/031/042。

Producer-owned package `contracts/orgmaster-administration/v1/{contract-manifest.json,policy.schema.json,command.schema.json,errors.json,projection-signatures.json,conformance-vectors.json}` 由 OrgMaster source 生成與檢查；用既有 canonical JSON/SHA256，不手填 PASS hash。manifest 固定 SQL欄位順序、nullability、權限及版本；consumer vendor 精確 bytes/hash。沒有 identity token、email 及 raw subject。

### 8.2 版本化只讀 producer

| Object | wire／用途／ACL |
| --- | --- |
| `orgmaster_contract.read_administration_state_v1()` | 一列 `contract_version text, administration_version bigint, initialized_by_command_id uuid nullable, published_policy_id text nullable, published_at timestamptz nullable, effective_root_count bigint, recovery_required boolean`；權威缺失/損壞拋 dependency error，不能回 version0 偽裝未初始化。SELECT/EXECUTE 僅 OrgMaster runtime、Platform runtime及確切 owner verifier |
| `v_platform_administrator_grants_v1` | `contract_version,administration_version,grant_id,principal_id,employee_id,role_code,scope_kind,status,valid_from,valid_until,published_policy_id,published_at`；只回 current published、current active identity/employee及有效時間 root；OrgMaster／Platform runtime SELECT，無其他 app SELECT |
| `v_application_administrator_grants_v1` | `contract_version,administration_version,grant_id,application_id,principal_id,employee_id,role_code,subject_kind,target_principal_id,basis,scope_kind,scope_key,status,valid_from,valid_until,created_by_kind,created_by_id,reason,catalog_version,catalog_content_sha256,stable_role_id,role_definition_hash,published_at`；root 不入此 view；OrgMaster runtime；Platform 只讀 Portal 必要派生 view，不讀含 reason 的全 app roster |
| `v_ai_pdm_principal_effective_grants_v5` | v4 的原 19 欄順序及 ordinary semantics，加 administration provenance 尾欄（以 PDM DEV-127 精確表為準）；app-admin row direct/無 delegation/exact Principal，舊 assignment v4 不改；只授 PDM runtime、OrgMaster verifier |
| `ai_pdm_role_policy_manager_eligible_v2(text,text,text,text)` | 參數 Principal/Employee/issuer/subject；回 boolean；active personal或privileged＋新direct app-admin，或明列 privileged legacy direct global system_admin；與現有 authority fence 同鎖，PDM runtime 及執行 SECURITY DEFINER domain apply 的 PDM migrator EXECUTE，不能缺 v2 fallback v1 |
| `v_fms_authority_v3` 與 v3 reader manifest | 保留 current `v_fms_authority_v2` envelope/普通assignment欄位，完整 snapshot 加新 Principal admin rows；每 assignment 加 subjectKind,basis,targetPrincipalId,sourceKind,sourceGrantId,administrativeDefinitionHash。新 admin sourceAssignmentId=sourceGrantId=grant.id，workspace/company-jenfu；v2 wire 不變，新 consumer 不雙讀重複普通列；只授 FMS runtime/owner verifier |

state contract_version 固定 `orgmaster.administration-state.v1`、root 固定 `orgmaster.platform-administrator-grants.v1`、app 固定 `orgmaster.application-administrator-grants.v1`。未初始化 version0/marker=null 可以已有 ordinary current publication，published_policy_id/published_at 因此可非空；version>0 必有 initialized command UUID 與 publication id/time。root valid_until 永遠 null。Platform 同 snapshot 一次讀 state() LEFT JOIN exact Principal/Employee root projection，不讀含 reason 的 generic app roster，不寫 SSO root claim。

Manager lock 使用 `orgmaster_contract.lock_ai_pdm_role_policy_authority_v2()`，與 eligible_v2 的 runtime/migrator ACL 同步；OrgMaster verifier 查 PDM v3 current/history 的 app 限定 SELECT 由 PDM owner migration096 提供。042 中文顯示既有三欄 wire 不變，044 將 `orgmaster_contract.v_principal_display_profiles_v1` 窄讀權給 Platform/FMS/PDM 真 runtime；每 app 以 verified Principal+Employee 查自己的列，來源不可用保留普通 login 並顯示「員工」，不增加 SSO name 欄或另寫身份資料。

Named root/app/PDM/FMS/display views 內部讀 private publication 時必由各自欄位／app 限定的 SECURITY DEFINER reader 包裝，固定 pg_catalog search_path、撤 PUBLIC 並只授 exact consumer EXECUTE/SELECT。不得把原始 publication function 的 EXECUTE 給 Platform/PDM/FMS 以修 permission denied。

列中 grant_id 為 uuid、version 為 bigint（JS parser safe integer 範圍）、valid times為timestamptz、其他識別字串為text；status active、subject principal、basis manual、scope global/platform依上表；catalog hash hex64。PDM/FMS 只讀 app-specific contract，不讀其他 core 或泛用 roster。view security_barrier／固定 search_path／owner 為 OrgMaster migrator，PUBLIC 全 revoke、無 runtime DDL/owner/raw-core table權。FMS runtime exact lifecycle login沿既有owner合同解析，不手填臨時帳號名。

授權時 binding 必須精確對應當前 OrgMaster 已接受的 application role catalog/version/content hash/protected role hash；PDM 來源是 current dynamic v3 projection；FMS 同樣綁已接受的 current dynamic CatalogDocument version/content SHA，static v5 entitlement source 僅固定 protected role identity／定義，active dynamic catalog 的 owner-normalized protected role hash 必須與它相同。FMS v3 envelope/current assignment catalogVersion/SHA 指當前 dynamic artifact；authoringCatalogVersion/SHA 指 issuance 時的 dynamic artifact，不混為 static v5 source pin。後續 ordinary catalog update 可延續 grant，條件是 authoring immutable artifact 仍可核其 provenance，且 current protected role definition hash 未變。不得把 authoring catalog 內舊 permissions 當 current fallback。catalog/authority row 必須同 snapshot 驗證，不容許 publication TOCTOU。既有 Portal visibility view 只 additive union 有效 app-admin 派生入口，deduplicate provider pair/app；root-only 不給其他 app，wire 不破壞舊 consumer。

### 8.3 Durable 命令 ledger 與提交

045 新私有 `orgmaster_core.administrative_command_receipts_v1`：`command_id uuid PRIMARY KEY, contract_version text CHECK='orgmaster.administration-command.v1', environment_key text, operation text, actor_kind text CHECK IN(principal,owner_workload), actor_id text, request_sha256 char(64), preview_sha256 char(64), target_principal_id text, target_employee_id text, result_kind text CHECK IN(applied,no_change), administration_version bigint, administration_sha256 char(64), published_policy_id text, transaction_id xid8, result jsonb, committed_at timestamptz`。除 nullable target（revoke由 grant 解析）、其他欄位 NOT NULL；hash均hex64、version為非負safe integer，operation限§9五種human命令及initialize。result 僅 redacted grant IDs、版本、outbox IDs/status，不含核身 token/subject/email。terminal row immutable；partial unique index `ON(environment_key) WHERE operation='initialize_platform_administrator'`，保證換批次或零有效 root 也不會重開首次初始化。私有 ledger是命令真相，不是權限真相；不在 legacy JSON commandReceipts 再寫一份 terminal authority。新 audit 只引用 commandId。

新增 SQL interfaces（planned；不代表現存）：

- `write_active_persistence_artifacts_with_identity_fence_v3(jsonb,text,text,text,text,jsonb,jsonb)`：原 v2 六參數＋verified actor context。ordinary human context `{kind:'principal',sessionId,principalAuthEpoch,authenticatedAt,assuranceLevel}` 必須對 app_sessions、current admission/provider canonical binding、epoch逐欄相等；freshness 依原操作規則，root mutation另要求0≤age≤300000ms且AAL1/2。既有合法 lifecycle worker 用 `{kind:'owner_workload'}`，須以 SESSION_USER 及現有 binding查得 identity，不接受呼叫者宣稱 actor_id。此普通 writer 拒絕任何 administration差異或初始化marker變更。
- `apply_administration_command_v1(jsonb,jsonb)`：command envelope＋上述 human context；自己驗當前 root、session及同 snapshot revisions/catalog，構造只含 administration 的新 published policy，寫 publication/audit/outbox/ledger。runtime EXECUTE 只有此 human入口；不能傳 bootstrap=true 或 owner actor通過。
- `prepare_administration_identity_owner_v1(jsonb)`、`initialize_administration_owner_v1(jsonb)`、`read_administration_command_owner_v1(uuid)`：只授確切 OrgMaster owner migration workload使用的DB IAM login；SESSION_USER、受控執行包 environment/command/plan hash及既有owner purpose必須匹配。prepare 只用當次真實核身結果沿 managed identity invariants追加缺少的 native mapping/admission，不能改已有衝突歸屬；initialize 共用純command驗證與private submit，但完全不要求已存在human app_session/root。

owner bootstrap 不冒用humanactor或目前僅允許lifecycle的`assert_lifecycle_executor_v2`。045 對 `workload_principal_bindings` forward-only 增加 orgmaster `administration-initialize` purpose；保留目前 principal/provider subject/db_session_user/owner-purpose 唯一性，不把現有 runtime lifecycle identity 升為初始化者。新 binding 必須指向原已存在的 OrgMaster owner migration workload IAM subject/DBlogin；新增 nullable `bound_command_id uuid,bound_plan_sha256 char(64),bound_target_principal_id text,bound_target_employee_id text,bound_environment_key text,consumed_at timestamptz`，只在此purpose使用並有完整性CHECK。受控owner包讀回實際provider/SESSION_USER後啟用exactcommand/plan/target綁定；提交時同交易消耗並關閉。無新增Cloud IAM/Secret/DBlogin；既有owner無此能力時停止owner執行，不把權限下放runtime。prepared核身proof由owner process真實驗證，DB只接受此獨立owner入口及已準備的nativefacts，不以一般JSON self-assertion充當Google驗證。

共同鎖順序維持031：managed_identity_admission_authority→persistence_authority→admin command checkpoint/receipt→target/session及相關catalog；READ COMMITTED，鎖後重讀 current actor/target/revisions。新增 grant 前驗 publication仍是 preview基礎、root/app資格、既有管理授權及catalog。root mutation以 `current published policy` 建構新version，不publish unrelated draft；draft只rebase administration/basePolicyVersionId，保留業務變更。若尚無published policy，bootstrap用source-owned governance seed結構、已核實的nativeidentity及新administration建立最小首次publication，不抄working draft的business assignments；原draft仍保留。metadata/audit使用discriminated actor kind（owner_workload不填成假的actorPrincipalId），event含grant diff/commandId/prev/newversion/hash。session invalidation與security alert沿既有durable outbox追加，無同步provider呼叫在DBtransaction內。

private提交鏈新增僅migrator可EXECUTE的 `write_active_persistence_artifacts_with_administration_fence_v1(jsonb,text,text,text,text,jsonb)`；重用031的lock/before-facts→private v1 persistence writer→after-facts/lifecycle及managed refresh enqueue順序，actor准入在各public wrapper完成。owner不直接呼叫會拒絕它的human/lifecycle v2 wrapper，也不跳過其資料一致性邏輯。行政入口在同交易先insert完整terminalreceipt（未commit不可見），再寫精確新policy；artifact/active-batch guard只接受與`pg_current_xact_id()`、新administration hash/version/publication ID匹配的私有receipt，普通runtime不能insert receipt，亦不能用可自行set的GUC當授權。任何失敗整筆receipt/publication回滾；no_change只寫receipt、不改policy。

共同private writer統一校驗prospective有效root/OrgMasterentry連續性。所有一般workspace停用、Principal/admissionwithdrawal、role removal及admin撤銷均取相同鎖；兩個並發撤/停用不能各看見另一root而同時提交。外部Directory observation確實suspended/missing時仍記錄並fail closed；不得以連續性檢查拒絕外部真實狀態，改標recovery_required。受控owner恢復只能恢復指定既有歸屬／明示替代，需另綁恢復計畫，不重啟initialize。

所有 `writePersistenceArtifacts` caller改v3；撤runtime對v2及更舊writer EXECUTE，private owner/internal鏈可用。identity/lifecycle既有worker的typedcontext一起遷移，不破壞原fencing；禁止先留舊runtimewriter再依賴UI阻止adminextension被覆寫。SQL check/trigger對新/既有active批次與初始化checkpoint一致性、unrecognizedadminshape、protectedrole及administration保留做最後防護。

## 9. HTTP／UI／owner CLI 固定契約

以下都是新增、待實作，沿 `server/orgmasterGovernanceApi.ts` 的 `/api/orgmaster/governance` prefix；origin/CSRF、本人cookie驗證沿目前server規則，不能只信任body/headerPrincipal。

| 方法／路徑 | 內容與准入 |
| --- | --- |
| GET `/api/orgmaster/governance/administrators` | `{contractVersion:'orgmaster.administration-workspace.v1',governanceRevision,organizationRevision,administrationVersion,initialized,grants,catalogBindings,admission:{read,mutate},correlationId}`；既有governance read／exact OrgMaster app-admin可讀，mutate只current root；不返回provider subject/token |
| POST `/api/orgmaster/governance/administrators/preview` | command payload（無previewHash）→`{contractVersion:'orgmaster.administration-preview.v1',commandId,requestHash,previewHash,expiresAt,diff,expected,catalogBindings,correlationId}`；fresh root；5分鐘preview上限不延長auth_time |
| POST `/api/orgmaster/governance/administrators/commands` | command＋previewHash；fresh root，200 receipt：`{contractVersion:'orgmaster.administration-receipt.v1',commandId,result:'applied'|'no_change',administrationVersion,publishedPolicyId,grantIds,outboxIds,activation:'pending'|'acknowledged',correlationId}`；DBcommitted不等於跨owneractivation已ack |
| GET `/api/orgmaster/governance/administrators/commands/:commandId` | current root或同一原humanactor的active session可讀自己的redacted terminal receipt；查不到已提交receipt一律`COMMAND_NOT_COMMITTED`409（包含尚在提交、未曾執行或已rollback，不猜測）；依賴不可用503；owner用privateCLI查自己的receipt |

command envelope固定 `{contractVersion:'orgmaster.administration-command.v1',commandId,operation,target,grantId,reason,expected:{governanceRevision,organizationRevision,administrationVersion},catalogBindings,previewHash}`。commandId UUID；operation只`grant_platform_administrator|revoke_platform_administrator|grant_application_administrator|revoke_application_administrator|replace_application_administrator`；grant target `{principalId,employeeId,applicationId,validFrom,validTo}`且grantId=null，root applicationId=null且validTo=null；revoke只grantId，target=null；replace必帶舊grantId及新target，Principal/Employee/app與舊grant相同，同交易撤舊授新。各operation多餘欄位拒絕。canonical requestHash排除previewHash/correlationId、含actor/environment及全payload；previewHash再綁same-snapshotexpected/catalog/targetfacts，commit重算。Idempotent commandId既有receipt先比requestHash/actor/environment再回原結果；payload異409，不因重試另建grant。沒有grant的新普通human呼叫者不能利用grant自己的target越權；已是root者可以明示授予自己的app管理資格，重複同資格為no_change。

Receipt 的 grant/publication/hash/result 不可變；response 的 `activation` 是由該receipt引用outbox的當前readback派生，不回寫terminalreceipt或把pending改寫成applied。查無receipt時保留同commandId，最多三次有界readback後顯示未知/未提交及查結果入口；只有取得明確未提交與暫時原因才依重送規則重試，不以新的ID掩蓋未知結果。

Bootstrap privateCLI才接受`initialize_platform_administrator`，無public初始化HTTP。其 envelope 為 `{contractVersion,commandId,operation,environmentKey,target:{principalId,employeeId,directoryKey,identityFactsHash},expected,catalogBindings,grants:[{roleCode,applicationId,validFrom,validTo}],plannedProtectedOperations,reason,previewHash}`；`expected/catalogBindings`沿human形狀，grants強制root＋OrgMasterappadmin、每個app最多一筆，只容已就緒catalog；實際providerpair只在ownerprocess核身，receipt僅留facts hash。`plannedProtectedOperations` 是後續FMS catalog.*明示命令清單，不在admin transaction寫managementGrants；root正常登入後各自preview/commit並讀回獨立receipt，亦只發布該操作差異、不帶出無關業務draft。

plan使用公司Directoryimmutablekey作selector，email只是人類提示；verify用liveDirectory＋正確環境Firebase/Google真實簽章token及fresh auth_time，不在尚無root時要求依賴root的普通Portal登入。缺該環境provider user時由正常Googleprovider互動建立nativeuser，不建立Workspace帳號、不passwordwizard。prepare可獨立commitidentity收據但沒有admin；initialize的核身proof逾5分鐘須重驗，不刷新舊auth_time。已初始化其餘app用正常rootcommand補grant，不重跑bootstrap。

Error wire `{code,correlationId,commandId?}`／private,no-store：缺/失效session401沿原sessioncodes；`PLATFORM_ADMIN_REQUIRED`403；`ADMINISTRATION_CONFLICT`409（revision/preview expired）；`ADMINISTRATION_COMMAND_CONFLICT`409（同ID異payload）；`ADMINISTRATION_ALREADY_INITIALIZED`409；`CATALOG_BINDING_CONFLICT`409；`ADMIN_TARGET_INVALID`422；`LAST_PLATFORM_ADMIN`422；`ADMINISTRATION_DEPENDENCY_UNAVAILABLE`503。`AUTH_RECENT_REQUIRED`401引導本人重新Google驗證。預期拒絕無publication/epoch副作用；unknown transport先查原command，不能自動換ID再寫。只有一次有辨識暫時原因的相同command重送；CAS drift重新preview/newcommand；DB rollback無terminalreceipt，不能補寫applied假收據。

普通FMS任用沿現有 `/api/orgmaster/governance/applications/financial-management-system/role-assignments` GET、`/preview`、`/publish`、`/commands/:id`；增加exact FMSapp-admin判斷且限制ordinaryroleallowlist，Owner/system-admin不可透過此普通入口自授。FMS `management-grants` 相鄰路徑的 protected catalog read/edit/publish/import/activate 五項授權仍須分別明示。只有 root 且已有 exact FMS app-admin 者可明示給自己的對應 catalog 操作；FMS app-admin 單獨不能自授。原合法 Financial Owner 只保留既有受限相容路徑，不新增給指定目標人；workflow 等其他 protected operations 不隨 catalog 自授例外放寬。OrgMaster身份連結沿目前明示identity.link權限，保留允許personal管理員操作的人類決策；新root不自動繞過managedidentity/Employee/Directory檢查。

UI在角色治理增加「平台管理員」頁與各app管理列；以preview→「確認套用管理授權」→receipt/生效進度及reload，不叫「加入草稿」後無下一步。原普通業務角色草稿仍走既有發布，pending清楚標示；administration不用業務草稿。尚未初始化只顯示需owner一次性初始化及dependency狀態，不開自授按鈕。失敗留同頁、差異及correlationId；unknown顯示查操作結果，終態再顯示已提交/尚待activation。只顯示中文姓名，缺中文名不自行翻譯或用email充姓名。

## 10. 檔案與coding順序

| Source surface | 必要變更 |
| --- | --- |
| `src/governance/types.ts`、`validation.ts`、`commands.ts`、`evaluatePermission.ts`、`assignmentSurface.ts`、`privilegedAssignments.ts` | administration schema、protectedrole/legacywriteboundaries、exactPrincipal派生、普通draft保留；不重釋legacyassignment |
| 新 `src/governance/administration.ts`、`server/orgmasterAdministrationStore.ts`、`server/orgmasterAdministrationOwner.ts` | 純grant/continuity判斷、preview/commit/receipt、typedownerinitialization；共用驗證而不共用假humanactor |
| `server/orgmasterGovernanceStore.ts`、`orgmasterPersistenceRepository.ts`、`orgmasterGovernanceWriteActor.ts`、`orgmasterGovernanceApi.ts` | v3writer上下文、DB/TS同步guard、adminroute、只提交admin差異、receipt及outbox |
| `server/orgmasterManagedIdentityService.ts`、`orgmasterManagedIdentityStore.ts`、`orgmasterPrincipalAdmissionRepository.ts` | ownerprepare重用真實核身invariants；身份停用連續性guard／外部真實撤權分流 |
| `server/financialCatalogReleaseStore.ts`、`financialInitialAuthorityStore.ts`及governance store的FMSassignment/managementgranthandlers | app-scopedordinary委派、protectedOwner/admin/rootboundary，v3manifest/hash；不重跑initialauthority |
| `src/components/GovernanceCenter.tsx`、`src/governance/apiClient.ts`與新 `GovernanceAdministrators.tsx` | 管理員獨立UI／preview/receipt/recovery；不跳無關panel |
| 新044/045、`contracts/orgmaster-administration/v1`、PDM/FMSproducer manifests及sourcepin檢查 | source-controlledDML/DDL/ACL、typedprojections、conformancevectors，更新直接consumer同步入口 |
| 新 `scripts/dev070-initialize-platform-administrator.mjs`、`scripts/lib/dev070-administration-owner.mjs` | 私有plan/verify/commit/status，exactenvironment/owner/proof，redactedreceipts；非public服務 |

順序：共享types/schema/fixtures→044只讀projection與appconsumer（包括protectedcatalogupgrade）→045fencedwriter/ledger/ownerprepare及全部ordinarycaller→HTTP/UI→隔離PG→真實地端。平台root初始化不等相依FMSbackend修復，但FMS不可就緒時完整驗收維持BLOCKED。正式只記releaseimpact：producer/consumer需可共存、045撤舊writer前caller已升版、catalogrole先於grant、existingIAMpurpose不擴新cloudprivilege；本文件不提供正式執行包。

## 11. Fixtures、可執行驗證與readiness結論

驗收 fixtures：A activehuman_personal正確本人，B同Employee不同Principal，Croot-only，Dapp-admin-only，Ebusiness-only，Flegacyhuman_privilegeddirectglobalsystem_admin，Gservice/shared/inactive，H同Principal合法provideralias。至少兩名可用root作撤權競爭；空root但有既有業務policy/customroles/未發布草稿；FMS 原六角色與保留的 custom，加 source v5 的 protected system administrator；PDM 原九 legacy 與保留的 custom，再 append protected application administrator；真AAL1及AAL2、過期/未來auth_time、缺view/wronghash。

新focused測試：`src/governance/administration.test.ts`（schema/grants/continuity/到期邊界）、`server/orgmasterAdministrationStore.test.ts`（preview/CAS/replay/unknown、未發布業務draft保留）、`server/orgmasterAdministrationOwner.test.ts`（無humanroot/session、真實provideradaptercontract、typedowner拒runtime、partialprepare）、`server/orgmasterAdministrationApi.test.ts`（CSRF/session/root/appboundary/receipt/error）、`src/components/GovernanceAdministrators.test.tsx`（正常preview/確認/receipt下一步），加既有privilegedAssignments／managedidentity定向回歸。

新增隔離runner `scripts/qc-dev070-administration-postgres.mjs` 及其contracttest，建task-own disposable PostgreSQL、套適用migrationmanifest並seed真實typedrow形狀（不是persistentjenfu_dev/stg/prod）。案例必含：PUBLIC/app/runtime無owner入口和rawledger權、直接舊writer拒絕；runtime假ownercontext拒絕；兩個initialize競爭只有一個成功、bootstrapcheckpoint跨batch持續；commandreplay無新publication、異payload衝突、commit後斷線查回；lockwait後freshsession/revision/target再驗；兩root並發撤/停用只允許安全結果；外部invalidations記錄且recovery_required；v5/FMSv3exactPrincipal、不fanout、缺view不fallback、catalog普通更新保留admin/hashdrift拒絕；publication/audit/outbox/receipt同transactionrollback；未發布業務draft原diff保留。

以下是已存在的 source 自查入口；本次文件回合不重跑。實際已執行範圍與待補項見 §12；不得因命令列存在即視為 PASS。

```powershell
npx tsc --noEmit
npx vitest run src/governance/administration.test.ts server/orgmasterAdministrationStore.test.ts server/orgmasterAdministrationOwner.test.ts server/orgmasterAdministrationApi.test.ts src/components/GovernanceAdministrators.test.tsx src/governance/privilegedAssignments.test.ts server/orgmasterManagedIdentityService.test.ts
node --test scripts/dev070-initialize-platform-administrator.test.mjs
# 由 Platform owner 提供真 consumer adapter；只准 task-owned disposable PG。
$env:DEV070_PLATFORM_FIXTURE_MODULE="C:/VIBE CODING/.worktrees/Jenfu-Platform/dev022-platform-super-admin-20261105/scripts/lib/dev022-administration-lifecycle-fixture.mjs"
node scripts/qc-dev070-administration-postgres.mjs
$env:DEV070_RUN_POSTGRES="1"
npx vitest run server/orgmasterAdministrationHttp.postgres.test.tsx
npm run check:db-boundary
```

正常地端由authenticatedPortal入口以本人GoogleAAL1登入，OrgMaster平台管理員頁→本人及各app明示grant→preview/確認→查receipt及activation→reload/重新登入。另驗原Google連結/停用Employee提示、原加入業務草稿可看待發布與下一步；不將testfixture身份/alias當本人驗收。正式同路徑另驗，不由isolatedPG/地端推論。

TL結論：資料/API/SQL fence、actor、transaction、idempotency、UI 與驗證契約已有工程定案；既有 source 已進入實作並有下列隔離自查，產品尚未正式驗收或發布；整體維持 IMPLEMENTING / RD Readiness Review，無 Owner 的 FMS 首次目錄安裝、真 local bridge、release gate 仍未閉合。本次回合聚焦文件，未實作與待複驗項明列，不把原文件階段或部分 PASS 當成整體完成。coding可決定局部命名/函式拆分/fixture寫法，不能改Principal-boundauthority、AAL1minimum、protectedrolecapabilities、只提交admin差異、oncecheckpoint/last-root或schema責任。currentledger/catalog/provider/runtime事實需實作時讀回；發現契約/constraint不相容先回TL修同文件，不繞過guard或宣稱PASS。

## 12. 2026-11-06 RD source 進度與證據邊界

目前工作樹 `codex/dev070-platform-super-admin-20261105` 基於正式 `origin/master@6045133`；僅移入本目標 source 與必要 042 中文顯示 prerequisite，不改已發布 040／041。新 044／045 尚未套正式資料庫。

- 已實作 administration 唯一權威、private owner plan/bind/identity prepare/initialize、五種 human commands、v3 writer fence、current-publication administration delta、不可變命令收據與 audit、native lifecycle durable queue／typed acknowledgment、既有 security-alert durable queue 的 typed owner actor、平台與 app 的窄投影及中文姓名 reader。API canonical prefix 為 `/api/orgmaster/governance`；無額外 alias。
- PostgreSQL 隔離案例已通過既有 publication＋未發布 business draft 保留、並行首次初始化去重、last-root／last-Org-entry 撤銷 rollback、no-change／異內容 replay、原 private ledger ACL、真 runtime 窄 view SELECT、typed native consumption 與 activation 衍生。新 native／無 current publication 走 source seed，applications 僅 `source-owned seed ∩ active invalidation appregistry`，不抄 draft，不隱式加入 FMS、不關 admission。完整 Org admin capabilities 與 exact Principal 正常 app session 已在隔離 fixture 驗證；unresolved 歷史 pair 明確阻擋 prepare。
- PDM current reader 已接 v3／dynamic-policy-v2；完整 PDM owner-domain 向量保留原 custom 後 append protected administrator，Org decoder 與 snapshot 驗證通過。歷史 v1 decoder 保留。FMS static v5 只固定 protected role 定義；grant issuance 綁已接受的 dynamic CatalogDocument version/content hash，當前投影與 issuance provenance 分開，正常 catalog 更新可沿不可變歷史 artifact 驗證。
- root／一般 Org admin 不得代替 FMS app-admin。FMS catalog read/edit/publish/import/activate 五個明示 protected operations 各自驗證；既有 Financial Owner 僅保留 legacy compatibility，不新增給目標人。
- native event pending 時投影仍 fail-closed；若 intrinsic 資格有效且僅待本次有界 administration barrier，`recovery_required=false`。外部停用或永久無可用 root 才回 recovery。

已驗範圍為 RD source／task-owned disposable PG，不是獨立 QC 或正式驗收。最新在途 runner 已安全完成：兩 root 並發撤權一筆提交、一筆 CAS conflict；root revoke 與 native quarantine 競爭不可同時移除最後可用 root；voluntary native withdrawal／quarantine rollback；外部 Directory missing 經實際 v2 worker claim/complete、typed invalidation/ack，投影失效且 recovery_required=true。首 cluster PID=43440／port=56483／database=dev014_a5700ed035b24d5fbd99，其餘 cluster 同 runner finally 關閉；所有 fixture client／task-owned cluster 已清理。

另有真 HTTP server＋管理員 React component→production administration store→restricted runtime SQL 的單一整合案例 PASS：預覽、明示確認 app-admin replace、版本 2 receipt、pending→typed ack，原 epoch session 查詢回 401。此案例的 HTTP 身分入口從已驗證 session middleware 之後開始，採真 stored fixture session，不是互動 Google/provider 驗收；不以 mounted component 推論真 Chrome 或本人日常登入已通。

先前完整 `npm test` 為 212 files／1302 tests PASS、6 skipped，既有 local-sandbox Node 61 PASS；之後修改過的 UI／FMS protected-operation／persistence actor 定向四檔 19 PASS，TypeScript PASS。PDM v2 decoder 27 PASS；source seed、兩 producer package hashes 與 DB-boundary 自查 PASS。這是先前波次的紀錄；後續完整應用、release executor／runner contracts與tool packaging結果見§14。跨 app catalog/app-grant 真 consumer 完整矩陣與環境驗收仍待完成，不以分波次 RD 自查宣稱整體正式 PASS。

保留的有效失敗與修正：主控 cross-owner 初次 044 曾出 SQL42702 ambiguous value，隨後窄 view runtime 遇 SQL42501 private publication EXECUTE，均由後續實際 runtime query 驗證修正；fresh-native／無 publication 案例先遇 INVALIDATION_APPLICATION_SET_CHANGE_REQUIRES_ADMISSION_OFF，已改 source seed ∩ active registry；其後 employee-one 的 PRINCIPAL_ALIAS_HISTORY_UNRESOLVED 未放寬 Platform guard，改用無歷史的 employee-two 正向資料，並保留 employee-one prepare 拒絕負向案例。一次誤用 `npx vitest run` 掃到 node:test scripts 產生無 Vitest suite 的執行入口錯誤；其中三個實際 v2 persistence mock 失敗已升級為 v3/full actor 並定向通過，正式完整測試入口為 `npm test`。不刪除前次失敗或將它們改成原本就成功。

真實 Google／地端／正式 target、正式 migrations、merge、部署與本人 native 使用者操作均尚無本輪 PASS。完整四專案分母保留；前次文件聚焦回合未新增非文件工程變更，先前完整成果授權延續；本次工程續接的 source／隔離驗證見§14。


## 13. 新舊管理權威相容窗口

| 對象 | 窗口內保留 | 明確禁止 |
| --- | --- | --- |
| 既有 legacy Org admin 指派 | 原有業務／原管理能力暫留；只讀相容既有已發布列與歷史，不自動撤除既有人權。舊列可見不代表新 authority。 | 不得新增或還原 protected legacy 指派，不得用它呼叫新 administration/bootstrap 或當 cross-app root。 |
| 新 administration root／app-admin | 新 root/app-admin 的任免與五種 human commands 只依已發布 administration、exact Principal 與當前 native 資格判定；root 另需有效 OrgMaster entry。 | 不從 legacy Org/PDM system-admin、Employee、email、domain、職位或普通管理 capability 推導。 |
| 既有 Financial Owner／PDM legacy business roles | 原受限業務／原判權語意及歷史 provenance 保留；正常 additive catalog upgrade 仍走 owner 的合法前置。 | 不把 Financial Owner 換成新管理員、不新增給指定目標人、不把 legacy role 改名成 root/app-admin。 |

本窗口的「只讀相容」是指既有 legacy 權威列的消費相容，既有能力是否可操作仍依其原 server guard；不是把原管理者突然改成只能看畫面。普通 role editor 不得藉複製 protected permission／role、restore 或繞 v3 writer 建立新的管理資格。新 administration command 即使由既有 legacy Org admin 呼叫，仍須滿足新 root 條件。

退場必須逐一完成：每位 legacy 管理者有明確且合適的新 grant、原等效允許行為及應拒絕情境已驗證、已確認沒有 runtime/UI/worker caller 依賴舊 authority。三者缺一即保留相容，不以一次 migration 全部撤權，也不把相容窗口永久當成新 grant 的替代來源。

## 14. Owner release source：精確 DEV070 append

source 已新增 `DEV070_ADMINISTRATION_APPEND`，正式 profile 由原 39 entries 至041，只追加 042 display prerequisite／044 administration producer（含 FMS point-only 初始化 reader）／045 command writer/ledger，為第40／41／42 entries。001–041 identity/source/applied SHA 不變；043 不在包內、不重放、不編造 ledger。這是 source 與隔離驗證，尚未正式 applied。

唯一 deployer 選項為 `npm run deploy:production -- --dev070-administration-append`，保留 `--check`／`--prepare-only` 語意；不得混用其他 controlled mode、tool/smoke/infra rotation、Secret／credential、data import 或 bootstrap inputs。typed readiness/authorization 限 OrgMaster／DEV-070／070-ADMINISTRATION、精確 remediation entries、同 source/release/baseline。runner 明示接收固定 migration mode，target 仍 exact production Org migrator/jenfu_prod，無其他 DB/core schema 權。

planner 只接受原 contract 已允許的31–39完整 exact prefix，以及本次 partial forward 的40／41 readback；逐項比對全部 source/applied/name/order，未知 count/row/hash 於寫入前拒絕。完整42 ledger 可由同一已綁舊 prefix 的執行包安全 replay，但 baseline 已是完整42時不得再次使用 append 宣告；其後 ordinary release 維持 `UNCHANGED_VERIFIED`／零 DDL。stage 只接受42-row receipt、合法 pending/applied/replayed 計數、同manifest/source及 jenfu_dev/stg CONNECT拒絕。

migration runner image 已補新 helper COPY；獨立 PDM catalog reader tool 補 v3 pinned JSON COPY／Node import attributes，current query/sourcePath 明確為 v3，v1 history decoder保留。獨立 image-only rotation 來源檢查只新增認識已定案042/044/045 metadata（無DDL、無 resource/IAM/address放寬）；append 本身不繼承 combined tool/smoke rotation 例外。必要工具映像須先經既有獨立 rotation 及 sealed baseline/provenance；實際 baseline 若仍帶無法分離的 rotation receipt，保持明確 blocker，由主控唯讀釐清後收斂 verified reuse，不能跳過 provenance。

045 會撤除 runtime v1/v2 writer EXECUTE。既定 migrate→candidate 順序保留，**045 commit 到新 v3-compatible caller activation 之間，舊 serving revision 的治理寫入會42501，讀取維持既有路徑**；採本次已接受的有界寫入中斷，不宣稱零中斷、不開舊 writer fallback。migrate 前 build stage 必須已有同 source 的 immutable app artifact/provenance；失敗不 down SQL，不以舊 revision 當作完整 schema rollback。既有 traffic→tag→entrypoint 回復順序不變。DEV070 rollback/terminal 另記 `administrationRecovery`：legacy writer denied/unknown、禁止 schema rollback/fallback、ledger readback＋v3-compatible forward repair，附已 sealed deployment/source/image（若存在）。未產migration receipt 時明列 `UNKNOWN_REQUIRES_LEDGER_READBACK`，不推論 NOT_APPLIED；ROLLED_BACK 僅指 traffic，不能作為舊治理寫入已恢復的證據。

定向 source gate 六檔220項曾通過；後續 recovery source補強的兩項正反已通過。`npm run test:dev-070:contracts`（CI normal source-QC 入口內選中）核 producer packages/source seed/point-only package、migration與privateCLI；目前10項通過。完整應用213 files／1303 tests PASS＋既有Node61 PASS，current catalog定向49 PASS/1skip、TypeScript/client/server build PASS。production tool hermetic staging3項及database/readback10項已用task-owned exact pg8.21.0 closure驗證，TEMP與lease已清理，共享node_modules不變。最後 source 將由 draft PR 的 required `Production Source QC` 再驗；以上不替代正式 schema/Google/primary local/readback/部署。

### FMS 首次目錄初始化的 point-only 契約

`orgmaster_contract.read_fms_administration_initialization_v1(text,text)` 固定8欄：contract_version=`orgmaster.fms-administration-initialization.v1`、administration_version(bigint)、root_grant_id(uuid)、principal_id(text)、employee_id(text)、published_policy_id(text)、published_at(timestamptz)、read_at(timestamptz)，全非空。STABLE SECURITY DEFINER／pg_catalog search_path，同 snapshot 讀state及effective root，需initialized/nonrecovery、exactPrincipal/Employee、version/publication匹配。無資格0row、pending不可見、依賴故障拋錯；無rawpolicy/reason/roster。只fms_runtime及必要Org owner執行，FMS無rootview/app-roster SELECT。

獨立 package `contracts/orgmaster-fms-administration-initialization/v1` 的 manifest raw LF SHA為 `497fc31083e70998f5d9a9d5699020a107e66c5d988c3ebbb6ac83f18054e819`，含projection-signature與conformance-vectors；不改既有administration v1（df24e788…）及FMS authority v3（0d7e8dc…）hash。此proof僅FMS owner首個source-protected catalog初始化，不冒充app assignment/protectedGrant；normal writer mode=normal保留。Org/Platform與FMS正式各自DB不同，FMS adapter每preview/execute/readback跨庫freshpoint／server-onlyproof；FMS own SQL只驗strict envelope/own facts/exactdelta，沿既有10秒admission信任邊界，不宣稱distributed atomic或SQL驗外部root，不新增crossDB鎖／加密infra。

真PG已驗zero/pending/exact root/same Employee other Principal/nonroot appadmin、FMS只EXECUTE與其他runtime拒絕、private roster隔離及dependency fault不假0；仍非正式驗收。跨ownerfixture可選 `ordinaryFinancialViewer:true`，只據accepted dynamic catalog exact role-viewer/hash及現native加入readonly普通任用，不給Owner/admin/write；同Principal行政event pending時ordinary資格也依既有contract暫隱、reader可unavailable，ack後再判健康，不能假造healthy grant。

## 15. 真實地端 administration activation bridge 待定

主控已唯讀確認 authenticated local profile 使用既有非正式 Google project、loopback primary DB 與各 app 的 local runtime login；該 DB 的舊 031 workload binding 仍指向正式身份，與實際非正式 SA/SESSION_USER 不合。既有 primary profile 不能冒充 task-owned disposable fixture；已存在 native Principal 時應重用，不造新 Principal 或複製他環境 ID。這些是目前診斷，不是完成 bind 或 activation 的證據。

最小候選方案尚待主控收斂並補 source guard：private local-only CLI 驗 validated profile／metadata hash、固定非正式 project／issuer／audience、精確 loopback DB 與 current_database/SESSION_USER，使用既有 SA 的 keyless impersonation 及真 Google OIDC proof；local neutral bootstrap 僅綁受控 local LOGIN 與既有 migrator group，不擴 cloud IAM／Secret。owner plan 仍綁 environment／command／plan hash／target，prepare/initialize 保留真 human proof 與不可變 Directory key。

一次性 drain 僅容該 administration command receipt 引用的 event IDs、reason=administration_changed；固定經 validated profile 得出的 Platform loopback origin/audience，不接受任意 endpoint override。Org service OIDC subject、Platform verified consumer、實際 runtime SESSION_USER、typed registry、consumer receipt 及 Org ack 必須一致；不開常駐 Directory sync 或舊 L4 全流程。HTTP loopback 例外也只能落在已驗 development/test profile，正式 HTTPS canonical literal 不變。具體 local LOGIN 憑證/neutral bootstrap guard、OIDC transport 與 consumer local target admission 尚未實作／未驗證。

**在上述 closed source guard 就緒前，不得啟用目前硬編碼正式 origin 的 worker 處理 local events。** 不修改 fixture guard 讓它接 primary、不塞 GITHUB flags、不假造 SA owner/human/session，也不把 Google IAM metadata lookup 當成已成功 impersonation。此限制只保護尚未完成的 bridge；完整真實地端與正式驗收仍是後續交付範圍。


## 16. Readiness 未決事項與續接順序

目前定案的是新 authority／consumer 邊界及上述已實作切片，並非所有環境的執行包都已 Ready。仍須收斂：

1. **FMS 首次 source-owned catalog 安裝**：既有合法 Financial Owner 是原正常 additive upgrade 的前置；無Owner時已由TL定案§14 point-only root初始化例外，Org producer已有source/PG證據，FMS owner adapter/strict envelope與實際首次安裝仍待其owner驗證。root 不能憑自身或普通 Org admin 代替 FMS config actor，更不能造一個 human Owner／先給指定人 Owner 來解循環。須由 FMS owner 根據 target 唯讀事實完成上述最小受控首次安裝路徑，保留 exact artifact/hash/role/capability 與 audit。完成後才可經 Org 接受 dynamic catalog、發 exact FMS app grant、逐項發五個明示 catalog operation grants。這仍是完整四專案驗收的一部分。
2. **真實 local bridge**：§15 只有候選方案，neutral bootstrap／實際 Google OIDC／SESSION_USER／typed registry 的 closed guards 尚未工程落地；不啟用正式 hardcoded worker、不將隔離 adapter 視為 primary 支援。
3. **正式發布 source gate**：§14 的 exact append與tool packaging已有source及有界驗證；required CI、正式來源審查／master merge、provider sealed baseline/provenance與owner workflow尚待完成，不得以文件或本機 PG 代替。正式 target 的 current ledger/catalog/native 身分仍須 owner 唯讀核對，未知不補成 PASS。
4. **相容與驗收**：本次指定本人轉換須驗 legacy 相容的允許／拒絕；不以批次遷移其他管理者或全部 caller 退場作本次前置。若之後移除兼容，才須滿足 §13 的逐位明確遷移與退場條件。完整 producer→PDM/FMS real-consumer catalog upgrade/history/app-grant/撤權矩陣、真 Google 本人各 app 正常入口、中文姓名與正式 smoke 尚待完成。已完成有界證據可重用，只刷新受影響部分。

前次文件回合的完整成果授權延續；本次已恢復工程，限source／隔離測試／commit/push/draft PR，尚未merge/deploy/provider或primary DB寫入。之後從已保留 source 與有效證據續接，不重置 dirty tree、不重跑已完成外部寫入、不縮四專案驗收分母。private CLI 目前只有 `plan / verify / commit / status`；`verify` 內部呼叫 owner identity prepare，不存在獨立 `prepare` action。
