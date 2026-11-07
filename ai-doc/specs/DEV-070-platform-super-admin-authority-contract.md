# DEV-070：平台超級管理員權威與首次初始化

日期：2026-11-05；更新：2026-11-07（Asia/Taipei）。Native：ORGMASTER/DEV-070；來源：JENFU/DEV-022#authority-and-bootstrap。成熟度：IMPLEMENTING／完整本人驗收待續。主控已回報正式 Org `d81eda07e789a50c229b977aea258467583b229e`（PR #221）已經 normal full run `42269131015` RELEASED，047 actual ledger43；static-v8 reader與fresh enrollment-status已隨該source發布。Primary-local Org43及local046、PDM local096／097已正常 installed，local catalog仍v7。§28 optional status metadata已隨D81發布；§29 scalar projection source尚未發布。指定 Google personal／張仕杰 JFS0005，最低 AAL1、AAL2亦接受、中文姓名不變；正式root的人類同意仍有效，Google manual handoff目前受阻／視窗逾時，本人Google完成、root／app-admin grants、native ack或UI完成仍未驗證，不把admit或source測試當初始化成功。人類四專案完整實作至真實地端與正式發布的授權及完整驗收分母維持；既有capacity CPU FAIL與所有歷史首敗保留。

總控權威契約：`C:/VIBE CODING/.worktrees/Jenfu-Platform/dev022-platform-super-admin-20261105/ai-doc/specs/DEV-022-platform-super-admin-cross-project-plan.md`（Platform owner 開發 root；發布使用獨立 clean source checkout）；`C:/VIBE CODING/Jenfu-Platform` 原 root 僅作協調鏡本，不作 release source。相鄰責任沿 DEV-057 Principal／writer fencing 及 DEV-058 集中任用；不重開原驗收或替它們結案。[架構決策](../adr/ADR-007-external-role-catalog-assignment-boundary.md#platform-super-admin-20261105)。

## 1. 人類決策與範圍

指定 jedchang0308@jenfu.com.tw（張仕杰／JFS0005）在正式及地端取得平台超管。沿用同一 Google personal；最低接受 AAL1，AAL2 亦接受，中文姓名不變，不另建 privileged 帳號。兩環境各自綁定 exact Principal，不複製 local UID／Employee／Principal 到 production。

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

Manager lock 使用 `orgmaster_contract.lock_ai_pdm_role_policy_authority_v2()`，與 eligible_v2 的 runtime/migrator ACL 同步；OrgMaster verifier 查 PDM v3 current/history 的 app 限定 SELECT 由 PDM owner migration096 提供。042 中文顯示既有三欄 wire／bytes 不變，Platform/PDM 繼續讀 `orgmaster_contract.v_principal_display_profiles_v1`。FMS 僅可讀新增 versioned `orgmaster_contract.v_fms_principal_display_profiles_v1`，由 `read_fms_principal_display_profiles_v1()` 窄 SECURITY DEFINER／pg_catalog search_path 提供同形 principal_id／employee_id／employee_name；只保留 current `v_fms_authority_v3` exact Principal+Employee 資格的列。FMS 不得 SELECT generic display view 或 EXECUTE generic reader，無 app 資格的 root／同 Employee 不同 Principal 不能取得姓名。每 app 以 verified Principal+Employee 查自己的列；root-only 首次初始化可無 name，來源不可用或無列保留普通 login 並顯示「員工」，不增加 SSO name 欄或另寫身份資料。

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

本節保留當時設計／施工 checkpoint；其中未提交、待CI、待merge等進度不代表現況。最新source與實際owner準備以§22末尾為準，完整產品驗收仍未完成；既有安全與相容限制繼續適用。

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

deployer 使用 `npm run deploy:production -- --dev070-administration-append`，保留 `--check`／`--prepare-only` 語意；若工具已由獨立正常 image-only rotation 套用，可沿既有 `--tool-image-rotation-ref=<own immutable receipt>` 消費該 direct `OWNER_SEALED_TOOL_IMAGE_ROTATION`。readiness／authorization／intent 必須綁同一 ref、source／release／baseline；prepare 重驗完整 APPLIED proof，migrate 以原 deployer 身分 fresh 讀回相同 Job UID／generation／template／digest，缺漏或漂移在 migration Job／candidate 前拒絕。此處不執行 rotation，不接受 tool predecessor、smoke／infra reuse 組合、runtime enablement、repair、Secret／credential、data import 或 bootstrap inputs。typed readiness/authorization 限 OrgMaster／DEV-070／070-ADMINISTRATION、精確 remediation entries。runner 明示接收固定 migration mode，target 仍 exact production Org migrator/jenfu_prod，無其他 DB/core schema 權。

planner 只接受原 contract 已允許的31–39完整 exact prefix，以及本次 partial forward 的40／41 readback；逐項比對全部 source/applied/name/order，未知 count/row/hash 於寫入前拒絕。完整42 ledger 可由同一已綁舊 prefix 的執行包安全 replay，但 baseline 已是完整42時不得再次使用 append 宣告；其後 ordinary release 維持 `UNCHANGED_VERIFIED`／零 DDL。stage 只接受42-row receipt、合法 pending/applied/replayed 計數、同manifest/source及 jenfu_dev/stg CONNECT拒絕。

migration runner image 已補新 helper COPY；獨立 PDM catalog reader tool 補 v3 pinned JSON COPY／Node import attributes，current query/sourcePath 明確為 v3，v1 history decoder保留。獨立 image-only rotation 來源檢查只新增認識已定案042/044/045 metadata（無DDL、無 resource/IAM/address放寬）；append 本身不繼承 combined tool/smoke rotation 例外。必要工具映像須先經既有獨立 rotation 及 sealed baseline/provenance；實際 baseline 若仍帶無法分離的 rotation receipt，保持明確 blocker，由主控唯讀釐清後收斂 verified reuse，不能跳過 provenance。

045 會撤除 runtime v1/v2 writer EXECUTE。既定 migrate→candidate 順序保留，**045 commit 到新 v3-compatible caller activation 之間，舊 serving revision 的治理寫入會42501，讀取維持既有路徑**；採本次已接受的有界寫入中斷，不宣稱零中斷、不開舊 writer fallback。migrate 前 build stage 必須已有同 source 的 immutable app artifact/provenance；失敗不 down SQL，不以舊 revision 當作完整 schema rollback。既有 traffic→tag→entrypoint 回復順序不變。DEV070 rollback/terminal 另記 `administrationRecovery`：legacy writer denied/unknown、禁止 schema rollback/fallback、ledger readback＋v3-compatible forward repair，附已 sealed deployment/source/image（若存在）。未產migration receipt 時明列 `UNKNOWN_REQUIRES_LEDGER_READBACK`，不推論 NOT_APPLIED；ROLLED_BACK 僅指 traffic，不能作為舊治理寫入已恢復的證據。

定向 source gate 六檔220項曾通過；後續 recovery source補強的兩項正反已通過。`npm run test:dev-070:contracts`（CI normal source-QC 入口內選中）核 producer packages/source seed/point-only package、migration與privateCLI；目前新增 A/B/C 後共18項通過。完整應用213 files／1303 tests PASS＋既有Node61 PASS，current catalog定向49 PASS/1skip、TypeScript/client/server build PASS。production tool hermetic staging3項及database/readback10項已用task-owned exact pg8.21.0 closure驗證，既有驗證 TEMP／lease已清理；本輪新 mode 的 exact pg8.21 closure 13項再驗通過，606,223-byte task-owned TEMP 因自動核准審查拒絕刪除而保留，lease已釋放，共享node_modules不變。最後 source 將由 draft PR 的 required `Production Source QC` 再驗；以上不替代正式 schema/Google/primary local/readback/部署。

### FMS 首次目錄初始化的 point-only 契約

`orgmaster_contract.read_fms_administration_initialization_v1(text,text)` 固定8欄：contract_version=`orgmaster.fms-administration-initialization.v1`、administration_version(bigint)、root_grant_id(uuid)、principal_id(text)、employee_id(text)、published_policy_id(text)、published_at(timestamptz)、read_at(timestamptz)，全非空。STABLE SECURITY DEFINER／pg_catalog search_path，同 snapshot 讀state及effective root，需initialized/nonrecovery、exactPrincipal/Employee、version/publication匹配。無資格0row、pending不可見、依賴故障拋錯；無rawpolicy/reason/roster。只fms_runtime及必要Org owner執行，FMS無rootview/app-roster SELECT。

獨立 package `contracts/orgmaster-fms-administration-initialization/v1` 的 manifest raw LF SHA為 `497fc31083e70998f5d9a9d5699020a107e66c5d988c3ebbb6ac83f18054e819`，含projection-signature與conformance-vectors；不改既有administration v1（df24e788…）及FMS authority v3（0d7e8dc…）hash。此proof僅FMS owner首個source-protected catalog初始化，不冒充app assignment/protectedGrant；normal writer mode=normal保留。Org/Platform與FMS正式各自DB不同，FMS adapter每preview/execute/readback跨庫freshpoint／server-onlyproof；FMS own SQL只驗strict envelope/own facts/exactdelta，沿既有10秒admission信任邊界，不宣稱distributed atomic或SQL驗外部root，不新增crossDB鎖／加密infra。

真PG已驗zero/pending/exact root/same Employee other Principal/nonroot appadmin、FMS只EXECUTE與其他runtime拒絕、private roster隔離及dependency fault不假0；仍非正式驗收。跨ownerfixture可選 `ordinaryFinancialViewer:true`，只據accepted dynamic catalog exact role-viewer/hash及現native加入readonly普通任用，不給Owner/admin/write；同Principal行政event pending時ordinary資格也依既有contract暫隱、reader可unavailable，ack後再判健康，不能假造healthy grant。

### PR213 姓名投影範圍修正

獨立 source review 在8ecb85d指出 FMS 可枚舉 generic active-Principal 姓名 roster（P2）。044 已撤其generic view SELECT與generic function EXECUTE，改§8.2 app-scoped新物件；042及Platform/PDM相容、原administration/FMSv3/point-only package hash皆不變。`scripts/qc-dev070-fms-display-postgres.mjs` 以explicit FMS owner已發布artifact經Org normalizer、Platform owner adapter及task-owned PG驗 ordinary readonly viewer／新 appadmin 中文名、pending／撤權失效、root-only optional name、同Employee active native clone無FMS任用不得姓名、ACL／definer與dependencyfault rollback後仍不洩globalroster。前兩次fixture先缺name、再於initialized後直接改policy被ADMINISTRATION_CONFLICT；已改pre-init安排中文／clone，未放寬production guard。affected migration source/applied/profile hashes與release checks同步；後續CI結果以PR為準。

## 15. 真實地端 administration activation bridge 待定

本節保留當時設計／施工 checkpoint；其中未提交、待CI、待merge等進度不代表現況。最新source與實際owner準備以§22末尾為準，完整產品驗收仍未完成；既有安全與相容限制繼續適用。

主控已唯讀確認 authenticated local profile 使用既有非正式 Google project、loopback primary DB 與各 app 的 local runtime login；該 DB 的舊 031 workload binding 仍指向正式身份，與實際非正式 SA/SESSION_USER 不合。既有 primary profile 不能冒充 task-owned disposable fixture；已存在 native Principal 時應重用，不造新 Principal 或複製他環境 ID。這些是目前診斷，不是完成 bind 或 activation 的證據。

最小候選方案尚待主控收斂並補 source guard：private local-only CLI 驗 validated profile／metadata hash、固定非正式 project／issuer／audience、精確 loopback DB 與 current_database/SESSION_USER，使用既有 SA 的 keyless impersonation 及真 Google OIDC proof；主控已唯讀驗證：沿既有 private cluster operator connection 對現存 NOLOGIN `jenfu_orgmaster_migrator` 做限域 `SET SESSION AUTHORIZATION` 可用，無新增 LOGIN／role／password／持久 ACL；候選沿這個 existing group-session 入口，不預設創新 LOGIN，也不移植 migrator 權給 runtime。owner plan 仍綁 environment／command／plan hash／target，prepare/initialize 保留真 human proof 與不可變 Directory key。

一次性 drain 僅容該 administration command receipt 引用的 event IDs、reason=administration_changed；固定經 validated profile 得出的 Platform loopback origin/audience，不接受任意 endpoint override。Org service OIDC subject、Platform verified consumer、實際 runtime SESSION_USER、typed registry、consumer receipt 及 Org ack 必須一致；不開常駐 Directory sync 或舊 L4 全流程。HTTP loopback 例外也只能落在已驗 development/test profile，正式 HTTPS canonical literal 不變。上述僅是 readonly 前置證據；private group-session 的 source wrapper／validated target／實際 owner proof、OIDC transport 與 consumer local target admission 尚未完整實作／驗證，不代表 primary migration或business write。

**在上述 closed source guard 就緒前，不得啟用目前硬編碼正式 origin 的 worker 處理 local events。** 不修改 fixture guard 讓它接 primary、不塞 GITHUB flags、不假造 SA owner/human/session，也不把 Google IAM metadata lookup 當成已成功 impersonation。此限制只保護尚未完成的 bridge；完整真實地端與正式驗收仍是後續交付範圍。


## 16. Readiness 未決事項與續接順序

本節保留當時設計／施工 checkpoint；其中未提交、待CI、待merge等進度不代表現況。最新source與實際owner準備以§22末尾為準，完整產品驗收仍未完成；既有安全與相容限制繼續適用。

目前定案的是新 authority／consumer 邊界及上述已實作切片，並非所有環境的執行包都已 Ready。仍須收斂：

1. **首次目錄完整鏈**：FMS owner root-only 初次安裝、Org strict typed adoption、新 FMS app-admin、native ack、五個明示 operation grant 是不同步驟。C 已有正常 UI／HTTP source、bounded owner handoff 與獨立 confirmation 契約（§19）；隔離 PG／實際 FMS TS consumer 已驗一個有界鏈。真實 FMS own publish ledger、Google service OIDC、generation-pinned artifact、local 與正式整鏈仍須各 owner 核對，不能以合成 issuance 替代；不給目標 Financial Owner。 FMS owner另回報容量未閉合：human root lane額外≤3 connections，前次readonly handoff每並行再+2且未有shared gate；本輪未readback後續容量修正，總上界仍須owner證據確認，不能宣稱readiness通過。
2. **真實 local bridge**：Org production factory 保持精確正式 target，local counterpart 只可由主控的 validated local profile／真 Google OIDC／實際 SESSION_USER 注入。Org新增未提交 local composition（§21）；尚無actual profile／OS／DB／provider PASS；不將 task-owned fixture adapter 或 prod literal worker 當成 primary 支援，詳§15。
3. **首次初始化與發布 source gate**：A owner-admitted intent＋獨立 completion、B admin-only native worker 已進 source（§17–18）；這修補 stdin／private DB 與 fullflag-off 的已知缺口，新 owner Job sealed-input/receipt、metadata/ledger join、unknown-execution readback與新 mode production-tool packaging已由隔離真runner/transport測試；實際 Job／native provider transport 與正常本人登入仍待環境驗證。PR213 `9dcd8d7` required CI42097390030 SUCCESS已覆蓋A/B/C；後續local composition是未提交新delta，不在該CI證據內。045 bytes 已變，source/applied pins 已隨工作樹同步；不得套舊執行包或誤稱正式已 applied。
4. **相容與驗收**：本次指定本人轉換須驗 legacy 相容的允許／拒絕；不以批次遷移其他管理者或全部 caller 退場作本次前置。若之後移除兼容，才須滿足 §13 的逐位明確遷移與退場條件。完整 producer→PDM/FMS real-consumer catalog upgrade/history/app-grant/撤權矩陣、真 Google 本人各 app 正常入口、中文姓名與正式 smoke 尚待完成。已完成有界證據可重用，只刷新受影響部分。

前次文件回合的完整成果授權延續；本次實際已執行source／隔離測試／commit/push/draft PR，尚未merge/deploy/provider或primary DB寫入；這是執行現況，不縮減先前完整開發至兩環境發布的授權。之後從已保留 source 與有效證據續接，不重置 dirty tree、不重跑已完成外部寫入、不縮四專案驗收分母。private CLI 目前只有 `plan / verify / commit / status`；`verify` 內部呼叫 owner identity prepare，不存在獨立 `prepare` action。


## 17. A：owner-admitted intent → 正常 Google 完成

此切片源於已查明的可執行性缺口：原 private CLI 需 human token stdin＋migrator DB，不能直接作為 Cloud Run Job／private-IP 正式入口。v1 CLI 保留診斷與既有相容；新 intent lane 不將 raw human token放進 Job args／env／Secret／檔案。

- owner 非互動入口為 `scripts/dev070-enrollment-owner-operation.mjs` 的 `plan / admit / revoke / status`；只接受 nonsensitive intent file、own immutable released capsule ref。沿 clean reviewed protected source、既有 owner transport、固定 migration Job、exact sealed runner image／SA／socket／env／no-retry template、source／manifest／ledger pins；job 由 `--operation-mode DEV070_ENROLLMENT_INTENT` 分流，與 DDL append 分開，不能帶任意 SQL／bootstrap／human token。輸入沿既有 `source/migration-bundles/enrollment-intents/`、輸出沿 `receipts/administration-enrollment/`，未改 IAM／Secret／infra。此處記 source 接線，不是該 Job 已正式執行的證據。
- SQL `admit_administration_enrollment_intent_v1` 只准 migrator，綁 actual SESSION_USER、environment／source／CAS、immutable Employee＋Directory key、可 pin 或 null 的 Principal、command ID、reason 與最多15分鐘 TTL。它只追加 private typed intent receipt，不授 root、不建 session、不偽造 Directory 觀測；runtime 不能建立、換 target 或撤回 intent。撤回另追加 tombstone；status 不重寫 terminal。
- `POST /api/internal/administration-enrollment/v1/complete` 重用 exact Platform Google service caller verifier，禁止 browser Origin／Cookie／query。strict body 只有 contractVersion／requestId／directoryCustomerId／idToken。先真 Firebase Google crypto 驗證，以 immutable Google user ID＋customer 查 exact admitted intent；無 intent 回 `not_applicable`，不掃 Directory、不自升。命中後才檢 genuine AAL1／AAL2、auth age≤300秒、fresh Google Directory key／email／state、Employee、pair／reservation／歷史衝突。
- verified provider pair 已有唯一 canonical Principal 時重用；Principal unresolved 只能在本次真 pair 校驗後一次 resolve。新 native 分支於 verified completion 內建立真 managed identity／present observation／native bind；已有 legacy Principal 不塞進 managed-login.v1 DTO、不 rekey／reset。global admission 不暗開：fresh 仍需原有 admission／registry readiness；未成立明確拒絕，沒有 native／root／flag side effect。
- owner wrapper與runtime admitted-intent wrapper共用 private prepare／initialize、相同 global lock／CAS、一次 marker／typed command receipt／audit。grant actor保留實際 admitting workload；另外記 verified human，兩者不混成假 human actor。SQL只接 verified facts，raw token僅在 HTTP 記憶體，不持久化；SQL不聲稱自己驗 Google crypto。

獨立 package `contracts/orgmaster-administration-enrollment/v1`，manifest raw LF SHA `01e8e82e2df133d50df4c3d16972a16a458a253f3d4ddde4f41035b5950f167f`。success union 固定 `not_applicable | activation_pending | completed`；後兩者帶 commandId／exactPrincipal／Employee／issuer／subject／同 token authenticatedAt。`activation_pending` 不得發可用 root／session；Portal 在 completed 後仍須重 resolve actualPrincipal 與 epoch，再沿正常 session issuance。 Platform Portal consumer目前只有parser/client初稿，尚未接 normal exchange或測試；本段是producer交接規則，不能寫成consumer已完成。

## 18. B：administration-only native dispatch／ack

既有 full lifecycle flag 預設 false，原 worker 會 enqueue／執行 Directory refresh 與泛用 native queue；本 goal 不藉此開啟已 deferred 的 full L4。新 `orgmasterAdministrationLifecycle.ts` 預設只在 exact production target composition 建立行政 lane，normal administration commit 後、admitted completion 及 private service retry route會執行有界 cycle；server close取消本任務 dispatcher，無 Directory refresh／常駐 timer。

045 的 private eligibility predicate 只認 immutable `administrative_command_receipts_v1.result.outboxIds`、reason=`administration_changed` 與 exact snapshot hash；`claim_administration_lifecycle_v1` 共用它，以既有 actual workload registry／SESSION_USER、lease／generation／retry、Platform verified receipt與 `complete_principal_lifecycle_v2` 完成 ack。當前 native prepare／bind 不另產獨立 native event；若未來新增必要 prepare event，必先由同 initialization 的 immutable prepare/enrollment receipt明列 IDs，不泛收 principal_bound。無關歷史 pending 如實阻塞，不偷 ack。

`POST /api/internal/administration-lifecycle/v1` 只接受既有 exact Platform service Google OIDC、空 body，無 Cookie／Origin／query；它可明示恢復這個 scoped lane 的 blocked delivery，再作 bounded claim／consume／ack。恢復只改 mutable delivery，不改 frozen event或terminal receipt、不重置其他 native／Directory queue；每個 cycle最多兩筆。正常 command／completion即使已寫入也不因 transport未知結果假造 acknowledged；依 owner receipt readback 衍生 activation，temporary outage保留 pending與正常 retry入口。

供主控 closed-local receiver的獨立 point predicate：`orgmaster_contract.administration_lifecycle_event_eligible_v1(uuid,text)`→boolean，只給 Platform runtime EXECUTE，PUBLIC／Org／PDM／FMS不得呼叫；非本次行政事件或 hash不合為false，依賴壞則throw。它和producer claim用同一 SQL predicate，不以JS猜reason或另造grant store。package `contracts/orgmaster-administration-lifecycle/v1` manifest SHA `013c3e49deb78664c8d47de859cb750471d8629ffc2ca5171bb9f3a66218947b`。production HTTPS canonical不改；local只有主控 validated profile／real OIDC permit 可接，不接受自由endpoint override。

Pending replay的私有 intrinsic exact-pair檢查僅略過該 initialization command自己的 native barrier；仍驗 Employee／human account／pair／Directory／admission與無關 pending。這只讓已驗 human查初始化結果，不讓公開 root/app projection 或 session提早生效。

## 19. C：FMS 首次 protected catalog 的窄 typed adoption

root-only 已能從 FMS owner安裝 fixed system-admin source catalog，但 Org active仍舊 catalog時，不能先取得尚不存在 profile的 app grant；也不能假造正常 catalog.import/publish/activate grant來採用。新 server-private admission僅容 first-install：fresh exact root＋Org entry、實際同 publisher、current缺 protected role、exact release/version/content/artifact hashes、原六角色及 custom normalized definitions皆原封保留，唯一新增 owner固定 `role-system-admin`。ordinary assignments、未發布業務 draft與administration保持，不能一般 root就通過所有 catalog guard。

實作沿 `financialCatalogActivationStore` 原 inactive import／preview／activate／audit／immutable owner receipt；normal `assertFinancialAuthority` 未泛開root。新 `actorProof.kind=platform_root_catalog_initialization` 與 normal protected_operations區分，不填假三項grant IDs，不冒原 v1 activation wire。Org正常已驗 session衍生 actor／authenticatedAt／assurance／principal epoch；正式 default client以 existing Org runtime Google service OIDC、exact FMS canonical＋SID，呼叫 owner唯讀、op-specific committed publish ledger＋generation-pinned artifact handoff。無來源、錯 actor／epoch／op／hash／delta、逾時均fail closed；不轉cross-app Cookie、human Google token、SSO claim，service proof不冒human SDK writer proof。

正常 Org 管理員 UI 已有 root first-install下一步，只有 exact preview可採用；採用後才走 normal root FMS app-admin grant→native ack→正常明示 catalog.read/edit/publish/import/activate 五權。新獨立 `read_fms_catalog_initialization_activation_v1` 七參數point-only reader核 typed receipt／audit／publication／root issuance來源與current binding；只FMSruntime EXECUTE，舊v1／24cb projection與現有administration／FMSv3 packages保持。原始 immutable issuance provenance不與之後current publication/admin version/epoch混為一體，不重寫完成terminal。

package `contracts/orgmaster-fms-catalog-initialization-activation/v1` 的 `manifest.json` SHA `3ceb1923576b054e17213bffb5557f74bb1bb1042068cb4fe07aae4103ab50ad`；FMS actual readonly handoff transport另沿其owner package。local沒有closed validated profile時保留fail closed，不借production SID／origin。

## 20. 本輪來源、證據與續接

本節保留當時設計／施工 checkpoint；其中未提交、待CI、待merge等進度不代表現況。最新source與實際owner準備以§22末尾為準，完整產品驗收仍未完成；既有安全與相容限制繼續適用。

| 受測切片 | 實際證據 | 不支持的宣稱 |
| --- | --- | --- |
| 已提交 P2／既有 administration | HEAD `6146162f73ffdf0550af794661adc7e11a6532cb`、draft [PR213](https://github.com/jedchang0308-jenfu/OrgMaster/pull/213)；required [Production Source QC](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42084560779) SUCCESS；P2真PG scoped name／ACL／fault rollback | 不涵蓋其後本次A/B/C delta，不是merge／release／formal本人驗收 |
| A/B domain／contracts／Job source | 新12項Vitest、7項owner-operation Node tests PASS；contracts共18項、release Node458項（合計476）、Job override定向3項、新 mode exact pg8.21 production-tool packaging3＋database/readback10項、TypeScript/build/boundary PASS | sealed-provider服務由隔離HTTP doubles提供，未dispatch實際Job；A/B/C已由9dcd8d7 requiredCI驗證，local新delta另見§21 |
| A/B 真HTTP＋restricted PG＋Platform consumer | 三 task-owned clusters PASS：legacy reuse、fresh noPublication／concurrent one Principal＋one terminal receipt、globaladmissionoff／ownerrevoke；行政pending→scoped worker→actual Platform owner consumer＋typedack→completed，無token持久化；B exacthash bool／非行政拒絕、blocked scoped resume且無關queue不動 | HTTP測試從注入的Firebase／Directory／service verifier邊界開始；native consumption採Platform owner fixture adapter，不是真Google／實際正式HTTPS transport |
| C focused／PG consumer | 12 files／76項focused與TypeScript PASS；1項HTTP→production preview/activate/audit/receipt→restricted runtime v3writer→新pointSQL→FMS actual TS confirmation consumer PASS | fixture替換minimal JSON IO，ownerHTTP提供隔離合成issuance；未驗產品raw-document parse、真Google或實際FMS ownledger |

A/B/C已提交到同PR213：HEAD `9dcd8d70008e498f585579f717f6fe67b6e17c24`，required [CI42097390030](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42097390030) SUCCESS；app218files／1346passed、7conditional skips、Node61、release458＋contracts18、toolrotation61＋protocol26、packaging3＋readback10、abort6、build／DBboundary與runtime／三toolimagebuild-import均PASS。新C PostgreSQL case在一般CI略過，另有上述本機真PG證據，不混稱CI執行。該checkpoint後的local delta續接見§21–22；未merge／部署。044維持P2 source `e065b940f224589b8ed7e0c2f73abba510e40b543c6f76f0f4e53f4af0f60042`；045本輪source `2cdbd914251c8874cfafbcae108ffb4a8b8c6f8c1c8db381db2ca845802d7f7f`／applied `334c287a8f038e1b33cf934642bd724f7d3939b09c41f95c213800c82889d663`，已對齊profile/helper，原39 prefix／042 bytes與043排除不變。最初一次pin人工轉錄不符曾使contract gate `MIGRATION_CHECKSUM_MISMATCH`，已改從actual bytes機算同步並重驗18項PASS；不能用錯pin執行包。

其他保留失敗：A/B最初SQL JSON operator 42725、timezone 42883已修；HTTP缺auth欄的oracle改為strict shape拒絕；fresh concurrent replay一度被自己的pending barrier拒403，後改上述私有intrinsic判定並真PG通過；C point函數current_catalog名稱撞PG內建name，已改catalog_current且consumer PG通過。這些不是正式重放或provider mutation。

本回合已完成owner Job/transport/sealed evidence、unknown-output recovery、affected packaging/source-gate與12秒dispatcher deadline檢查，更新契約、直接索引與既有QA計畫。A/B/C已同PR提交／requiredCI通過，source review仍依正常流程；local增量另見§21，再由主控協調closed local counterpart、actual Google／Directory／IAM metadata／SESSION_USER／native ledger／catalog readback與各app正常本人入口；正式owner workflow與有界42501轉換／forward repair不變。完整四專案、兩環境分母與指定本人範圍保留，不批次遷移其他legacy管理者作前置。

本輪固定 Job 新 mode 測試使用 actual runner 與 owner transport，GCS／metadata／Run API採隔離 doubles，涵蓋 exact sealed input、terminal/deployment/bundle/source join、actual DB SESSION_USER/42-row ledger shape、readonly plan、跨來源／非 RELEASED／runtime-as-migrator拒絕及已產output/unknown execution重用；不宣稱真 Cloud Run Job 已執行。dispatcher每cycle至多2筆且12秒有界，deadline後不開始新的 claim/dispatch。Task-owned closure保留位置：`C:/Users/user/AppData/Local/Temp/orgmaster-dev070-tool-lock-final-43bb810996384124bba0576774ef2ca8`，無active process／reparsepoint／port；清理遭自動核准審查拒絕，未改用其他工具繞過。

<a id="21-local-trusted-composition-source-增量2026-11-06未提交未驗-primary"></a>

## 21. Local trusted composition（2026-11-06，未驗 primary）

本節記錄既有已授權source與產品邊界；本輪聚焦四份既有文件及安全在途source收斂，完整兩環境／四專案成果授權與驗收分母延續。未啟動實際local app或做primary寫入；owner只讀前置的實際證據見§22。

`server/orgmasterLocalAdministrationRuntime.ts` 由 `ORGMASTER_DEV070_LOCAL_ADMINISTRATION_CONFIG` 僅選 own canonical `ownerRoot/.next/dev-local/**` 的 server-owned側檔，不接受HTTP body/header選檔或自由endpoint。exact格式為 `jenfu.dev022.local-administration-runtime.v1`、owner=`orgmaster`、project=`jenfu-platform-nonprod`、audience=`http://localhost:1010`，含profile／SQL rawref+SHA、own runtime tuple、postmaster PID/startToken/dataDirectory與exact Platform nonprod email/SID。只限development、無K_SERVICE、非prod；檔案／所有祖先不得symlink/junction，有限size、同bytes parse/hash，原始SQL URL/password與ADC不得輸出。

reader核 `jenfu.dev-local-auth-profile.v1` 的own root／exactnonprod identities、privateRoot `dev069-real-nonprod-<32hex>`；SQLref固定privateRoot/private/owner-runtime-logins.json，其format/runId/tuple及apps.orgmaster URL匹配。每次行政call fresh核OS原生PID／完整FILETIME startToken／postgres.exe與exact `-D`、postmaster.pid的PID/datadir/port，再核actualDB current_database/host/port、SESSION_USER=current_user、Org runtime membership，以及非owner/migrator/super/createrole/createdb/replication/bypassrls／無schema CREATE。漂移或依賴壞throw；loader不開owner連線、不啟停cluster、不DML。所有delivery／executor的local workload registry binding、必要Org040/045／ACL與owner wrapper仍由Org owner控制；Platform只消費orgmaster_contract，不跨core代改binding。

真provider source接既有privateRoot/private/google-adc/application_default_credentials.json，canonical/noLinks、authorized_user與quotaProject非prod，SDK僅記憶體使用Firebase refreshToken credential及GoogleAuth credentials；不讀失效global ADC、不新增credential、不改production拒GAC規則。Firebase仍驗真Google token，Directory仍google-admin-readonly DWD；outbound固定Org nonprodSA，沿GoogleAuth／Impersonated取得真OIDC，Platform=`http://localhost:1000`、FMS=`http://localhost:1030`。inbound固定Platform nonprod email/SID＋own audience。測試以SDK/transport doubles驗接線，沒有本輪真provider PASS。

AuthRuntime組合同一guarded runtime／dispatcher給enrollment與scoped cycle；正常administrators command在commit前guard、commit後同dispatcher cycle，不能只接internal route。實際Vite plugins共用同AuthRuntime，掛兩internal ports及shutdown；獨立HTTP server同接線。FMS local readonlyhandoff重用同packet parser／8秒deadline／boundedbody／failclosed；provenance用既有 `local_test` 環境值，由server capability決定，並非HTTP flag或合成ownerreceipt；formal production HTTPS/default factory不變。

local composition已提交，包含新runtime reader／tests、AuthApi／AdministrationApi／GovernanceApi／Server、Firebase／Directory／lifecycle client／FMS owner reader、Vite config及QC source snapshot。若guard跨過dispatcher deadline，恢復後不開始新SQL claim；noLinks仍拒Windows junction，保留初次file-symlink EPERM。受影響8files134 mocked tests、TypeScript／diffcheck通過；current committed CI及後續intent delta統一見§22。

actual sidecar／OS／DB角色及private ADC的owner OIDC已由§22 readonly plan驗證；尚待真local app服務Google本人登入、Firebase／DWD、OIDC HTTP→Platform eligibility／consume→Orgack、FMS sameactor／ownledger handoff及normal adoption。mock與readonly前置不替代這些產品驗收；未merge／deploy／primary mutation。

<a id="dev070-local-owner-db-bridge"></a>

<a id="dev070-local-owner-bridge"></a>

## 22. Local owner DB bridge／exact owner bootstrap（2026-11-06，source／CI通過，環境未驗）

歷史 checkpoint：owner bridge 與 local composition 曾提交於 HEAD 78076616d893f1dc828731a1079a793021528938，當時 PR213 為 draft；PR 狀態與最新驗證以本節末「合併後最新 checkpoint」為準。工具 scripts/dev070-local-administration-owner.mjs 與 library scripts/lib/dev070-local-administration-owner.mjs 提供 schema plan／status／commit 及 intent 增量。plan/status 是 SQL 只讀，無 SQL DDL／data 寫入；既有 neutral inspect 可刷新同 owned cluster 的 control record metadata，plan 也會 create-only 寫 own plan output。這不改 profile／SQL target、不啟停 runtime 或 cluster；control record 仍以同次讀取的 actual bytes 綁 SHA，不新增 inspect API。commit 未對 primary 執行。本次 HEAD 包含 local intent adapter 增量，當時由 required CI 覆蓋；不把 schema migration 或 intent admission 當作已授 root。

source入口重用§21 own canonical sidecar／profile/raw SHA/noLinks／private authorized-user ADC，以及既有neutral cluster inspector（只該source及其process-ownership dependency入pin，不importPlatform app runtime）。owner另取得並crypto驗證真Google非正式migratorSA，固定email `dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com`、SID `109035753048386897825`、audience localhost:1010、fresh≤300秒；不接caller選SA／PID／SQL／URL／human token。私有operator必須是ownedcluster的actual postgres session，之後以既有NOLOGIN jenfu_orgmaster_migrator session操作，runtime不拿owner connection。

實際readonly診斷：primaryDB61312／ownedpostmaster20904；Org兩schema及其relations已由migrator持有、USAGE/CREATE為true；唯三個現有函數仍owner=postgres。Org不得代修PDM或其他owner物件。只有下列固定完整signature可進owner-bootstrap：

- `orgmaster_core.read_active_persistence_artifact_v1(text)`
- `orgmaster_core.read_active_persistence_authority_v1()`
- `orgmaster_core.write_active_persistence_artifacts_v1(jsonb,text,text,text)`

exact neutral/local source路徑為 `db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql`，只允許固定三函數 `ALTER FUNCTION ... OWNER TO jenfu_orgmaster_migrator`；不改definition/body、其他owner或business data，不創角色/password／CloudIAM／Secret。plan逐一pin完整signature、owner、definition/body與各SHA、securityDefiner/config/ACL。commit CAS相同before snapshot，僅把owner及ACL內對應owner角色轉交，內容／設定／其他ACL不變；immutable `orgmaster_core.administration_local_owner_bootstrap_receipts_v1`存command/plan/source hash與before/after。未知第三方owner或這三項以外的DDL資格缺口failclosed，不擴成全schema ownership重寫。

單一transaction順序：fresh target/source／ledger／runtime roles／before bindings／三函數CAS＋advisory lock → 私有original operator只執行上述exact bootstrap → 切現存NOLOGIN migrator → 套缺少的042/044/045原bytes對應renderedSQL與append-only ledger → local-only `db/migrations/local/046_dev070_local_administration_bridge_v1.sql` → 固定兩workload bind／FMS窄ACL → ledger/binding/receipt readback → COMMIT。bootstrap及後續failure全部rollback；COMMIT unknown先用同command status讀回，不自動重送、不改舊receipt。commit另要求source clean；plan綁HEAD及working inputs／兩neutral dependency SHA、profile/SQL/cluster record SHA、OS PID/startToken/datadir、actual DB/session及15分鐘expiry。

ledger目前40 rows：原39至041與既有042。local042的checksum是raw source84955e…，source_revision=`LOCAL_GENESIS:16930fa3-b7cd-4c7c-947d-c3203e59178c`，不同formal rendered19e676…。wrapper只精確承認此known raw042／genesis與database suffix一致的local variant，保留原row，不重套042、不重寫checksum；formal profile及042/044/045 pins不改。local wrapper要求原39 exact prefix／已接受40–42 forward狀態，unknown version/name/hash/count拒絕。046另有immutable installation與command receipts，不塞進正式42-row profile，不帶入043。

046只更新原031兩個固定workload的provider subject／actual runtime SESSION_USER pair與binding version：Org為nonprod102985156037283277347／dev069_orgmaster_<run-prefix>，Platform delivery為117743617824418208171／dev069_platform_<run-prefix>。先驗三個runtime LOGIN的exactgroup、非owner/migrator／高權及無schema CREATE，且FMS已存在restricted login為fms_test_runtime_<run-prefix>、member=fms_runtime。FMS只補v2 admission、v3 authority、scoped Chinese-name、catalog binding／normal receipt與兩個point reader所需versionedcontract ACL；不給generic roster／private publication。generic claim EXECUTE維持既有相容，full lifecycle flag仍off，僅本goal filtered admin dispatcher及Platform eligible predicate作本lane consume，不復活Directory／全queue。

歷史隔離 CI checkpoint（78076616）：required [CI42121234195](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42121234195) terminal SUCCESS，app 220 files／1397 passed／7 conditional skips、Node 61、release 458＋contracts 31（共 489）、rotation 61＋26、packaging 3＋10、abort 6、build／DB boundary／runtime 及三 tool image build-import 通過。Source QC 必跑 ephemeral PostgreSQL 18 component：hash-guarded 031／045 片段＋完整 exact-3 bootstrap／046，真 runtime／migrator／restricted FMS roles、body／ACL CAS、2-row binding、replay／rollback、窄 ACL 及 immutable receipts PASS；輸出 bindingRows=2／terminalReceipts=2、046 source SHA 9ec0aceaf3ec746ddb48bd1cc06fc827e85f0faca1a881a81711a60be719c509。FMS objects 是明示 ABI stubs，非完整 Platform foundation／FMS reader／Windows primary／provider 鏈。

runner scripts/qc-dev070-local-administration-owner-postgres.mjs僅Linux/GHA exactservice，驗freshDocker label／PID／publishedport／system_identifier／create-only DB與role marker；固定own runner只進該service networknamespace。explicit env-i allowlist只傳PATH/HOME、CI/GHA run／attempt／container ID及synthetic PG參數，namespace port5432與published host port分驗，不帶整份environment／GitHub token／cloud credentials。cleanup只本次成功建立且marker/systemID吻合目標。前一checkpoint 913d431／CI42119330925 terminal SUCCESS保留；首CI42116668770因sudo -E環境遺失、SQL前DEV070_CI_DISPOSABLE_TARGET_REQUIRED的失敗；修正後同required gate真SQL通過，沒有放寬046 loopback。DB boundary僅放行本節exact db/dev-010 bootstrap path，PR/base選檔／self-test8通過；不放開整目錄。舊2欄SQLprofile mock已修成actual producer v1五欄user/password/group/url/pepper；私有檔未改寫。本機newPG容量阻擋只移交同CI，不用primary當fixture。

actual readonly CLI plan已通過canonical sidecar/rawrefs、真OS ownedpostmaster、least-privilege runtime／NOLOGIN owner資格及fresh真Google非正式migrator OIDC；結果PLANNED／ledger40／raw042=true／pending044+045。首次CLI UNAVAILABLE保留，schema查詢保留字CREATE alias改schema_create後成功。當時plan綁dirty source，不能直接commit，後續必fresh plan。此證據只支持owner服務身分與只讀前置；未驗本人Google Firebase／DWD／normal session，未做primary ownership／DDL／registry／ledger／intent／grant寫入。

新增local intent source：同CLI只開intent-plan／intent-admit／intent-status／intent-revoke，固定--config選own側檔，--intent只能讀own output/dev070/local-owner/*.json；plan另--output create-only，bounded JSON／noLinks，無SQL／URL／human token／grants旗標。輸入沿045完整orgmaster.administration-enrollment-intent.v1（commandId、actual environmentKey、sourceRevision、Employee、immutable DirectoryKey、knownPrincipal或null、expiresAt≤15min、reason；初始expected／admittingWorkload為null）。plan依實際CAS及真migrator proof補入expected／admittingWorkload，Directory customer固定validated profile，knownPrincipal必exact current Employee；null留待真Google pair解析，不按Employee廣播或造Principal。local envelope只封存source／profile／OS／DB／ledger／role／owner及intent hash，不是第二任用store。

intent-admit／revoke要求clean exactsource、fresh相同profile／OS／owner proof、42-row ledger與046已安裝，沿045三個窄owner函數及同transaction advisory lock／CAS／readback；到期／撤銷／漂移拒絕。重送讀原immutable receipt，unknown COMMIT只報INTENT_COMMIT_UNKNOWN_REQUIRES_STATUS，不自動重播；status允許讀舊source／到期intent以定位結果，但仍驗同target／profile／OS／owner，區分ADMITTED／REVOKED／EXPIRED／ACTIVATION_PENDING／INITIALIZED，不把pending當ack。新增source已由owner Node13（原7＋新增6）、contracts31、local runtime/composition 2files51項、TypeScript／diffcheck通過，均為source/mock，已提交78076616／required CI42121234195 terminal SUCCESS。045／046與所有producer packets bytes不變，既有native SQL證據可重用。

歷史 P2 status readback checkpoint（780 之後增量）：standard status --plan 與 commit replay 共用 readLocalOwnerBridgeReceipt，核 input plan 自 hash、column plan_sha256、046 response.planSha256 及 commandId／database／sourceRevision／beforeBindingsSha256 與完整 response shape；same-command 換 plan 重算 hash、partial／不一致 stored receipt 回 RECEIPT_CONFLICT，查無仍 null。未知 COMMIT 先 status、不重送語意維持。當時 Node 15／contracts 33、syntax／diffcheck PASS，PG18 component 新增 actual 046 receipt 原 plan 讀回及變造 plan 拒絕，尚待新 CI；此「待新 CI」只描述當時狀態。

歷史續接計畫（780 checkpoint）：原 Luna reviewer 複核 P2 delta CLOSED；當時計畫為同 PR fresh CI、主控 join local preconditions、fresh schema plan、精確 owner bridge，再處理指定本人短效 intent／正常 Google 完成／native ack／四 app 入口與 FMS normal adoption。

### 合併後 source 與 owner 準備 checkpoint（2026-11-06）

PR [#213](https://github.com/jedchang0308-jenfu/OrgMaster/pull/213) 已受保護合併。修正後 PR head `66c0c9e57dacff15c99edac8fa2e4d0cbe926f7f` 的 required CI [42124604384](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42124604384) 與合併後 master `26d691c572f34ab42e24819c6b1ab5a816c9d719` 的 CI [42130394177](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42130394177) 均 terminal SUCCESS。P2 reviewer review 已 CLOSED，沒有剩餘必修 P1／P2。`status --plan` 只依 `commandId` 尋找 receipt 的缺陷已修正；標準讀回使用 `readLocalOwnerBridgeReceipt` 驗證 plan SHA、target、source、046 response 與完整 receipt binding。Node 15／contracts 33、原完整 required CI 及真實 046 PostgreSQL component 均成功。046 測試中的外部 FMS ABI stubs 不代表完整 FMS／Platform 整鏈或地端正式驗收。

release clone `C:/VIBE CODING/.worktrees/OrgMaster/release-dev070-production-20261106` 已更新為clean master `a66992509746c0d6e628936410e05e3cfdf48086`。首次缺pg的`ERR_MODULE_NOT_FOUND`保留；canonical永久依賴junction已核。原26d release `ORGMASTER-DEV070-20261106001657361-26D691C5` 的source-lock SHA `73f8132d31f0818c15735fe391c7debc5cbc192626b3b8f66da54d3bd7cdc1d9`及runtime-config SHA `42d0106d7b98d9c19ae5eb325504181b52aa96e62ed9fbaf8c3c6541e6325432`為歷史immutable準備物，保留不覆寫；新source另有新freeze見下文。

正常 append check 首敗 `SMOKE_REUSE_RECEIPT_INVALID`；獨立 tool rotation check 首敗 `TOOL_ROTATION_STATE_BASELINE_CHANGED`。actual released service／data source 為6045133，已消費 `APP_INFRA_REUSE` 的 immutable anchor 是4f6429b；native state 仍是該 sealed after-state。工具 executable closure20→22、6項變動，不能重用舊runner。release correction 在 branch `codex/dev070-tool-rotation-reuse-basis-20261106` 收斂：prepare／resume／apply fence／receipt replay 共用 resolver，只能由原 reuse ref 推導 anchor；以原 source lock／歷史 baseline 驗完整 immutable smoke-reuse 證據、Git ancestry、75-address state／manifest／封存 bytes，prepare 另驗 fresh provider。service／data baseline 不改寫，沒有任意 anchor/source 選項；direct APP_INFRA 原路徑保留。獨立 delta review 隨後重現 P2：canonical tool ref 若實體只是 APPLIED raw infra、缺少／null toolRotation，native routine 曾通過而漏掉 live Job gate；直接 native probe 的修前失敗已保留。修正要求 DEV070 宣告 ref 或出現 proof 時必有 verified toolRotation，並核 resolved ref／readiness／authorization／intent 雙向 join；無 ref 的既有 raw infra lane 保留。修後 routine／native stage／authority三檔154項、syntax／diffcheck PASS；修前 R2 459＋contracts33與未變 tool library63＋protocol26有效範圍保留，不把重疊案例加總。修正版commit `42a120bdc79c2efb2db5403ca3383957f30e8fa0`已由[PR214](https://github.com/jedchang0308-jenfu/OrgMaster/pull/214)正常protected merge為master `a66992509746c0d6e628936410e05e3cfdf48086`；PR CI42140408887及[main CI42141287180](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42141287180)均terminal SUCCESS。P2 delta source複核CLOSED（無剩餘P1／P2）；source／CI不證明tool rotation已APPLIED。

local bridge 044／045／046 與正式原39＋042／044／045 append均未執行；046限local，不進formal profile。intent、root／app grant、本人 Google 核身、native ack、正常 UI、正式 migration、runtime 與 traffic亦未執行；兩環境產品驗收仍是 NOT_RUN。下一步須沿原 owner workflow 完成必要 tool rotation，取得 fresh source-bound inputs 並重跑正常 release check，local則fresh owner plan與exact bridge，再依原完整四專案驗收分母續行；本節的 CI／readonly preflight 不取代那些驗收。

#### a669 正常 owner 準備（2026-11-06；尚未 apply）

新release `ORGMASTER-DEV070-20261106010830187-A6699250`，共同prefix `gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-DEV070-20261106010830187-A6699250/`。normal producer已建立並provider讀回 `source-lock.json` SHA `faed1404d5d0e0a7496fdc8e090b634ff8c7a9e177618ed0a51db94cfe1df949`／generation1793927312744459，以及 `runtime-config.json` SHA `f05f2782c627d2b905e560ec161bebcab161064a15bf8bdcb08afe7261e259e6`／generation1793927323592306。driver首次把stage誤作object名的404保留，之後只讀正確source-lock，未覆寫物件。

正常tool `--check`實際PASS：READY_FOR_IMAGE_BUILD、75 addresses、DDL0、releaseAuthority=false；604 service/data baseline→4f sealed consumed-reuse anchor及fresh provider已通過修正版原gate。log：release clone的 `output/dev-012/inputs/dev070-a669-tool-check.log`。其後沿既有standalone normal builder完成 exact a669來源／CI與provider artifact／scan／SBOM／provenance驗證，build `189027fd-1ab5-4e78-aec0-b3e4b39d5e08`，runner digest `73c25bcc29c060a3ebc0902d40380edb004287911023573ec39f72b83d866988`；proof位於該clone的 `output/tool-rotation-native/a66992509746c0d6e628936410e05e3cfdf48086/standalone-normal-build-proof.json`。

既有exported builder／Terraform plan產生review-only saved plan（不改source）：`output/tool-rotation-native/a66992509746c0d6e628936410e05e3cfdf48086/review-plan/review-plan.json`，SHA `fdafc7d10592592edf8aa5f4faa09beb2e73d7f9b2c5e18e2dabea1b421a34bc`；75actions僅migration Job image update、其餘74no-op，releaseAuthority=false。state serial137／lineage5034b410-f6e4-812b-d9a6-b096bee8e1f8及fresh provider／source-control CAS已核。最後provider readback確認normal prepared／apply fence／APPLIED均MISSING，Job仍gen276／舊digest6af3、service仍gen395／e459。

normal CLI的`--check`在image build前返回，`--apply`才走build／sealed plan／fence／apply，不能把獨立build或review-only plan當normal PREPARED／APPLIED收據；未新增prepare-only source seam或改fence。未apply Org Job／service／traffic、未SQL migration／首位intent／root／app grants。下一步沿既有normal流程取得必要rotation APPLIED／fresh Job readback，再接DEV070 append；本輪只更新文件，完整本人兩環境驗收NOT_RUN。


<a id="dev070-catalog-reader-compatibility-repair"></a>

## 23. Candidate smoke失敗後的catalog reader相容修復（2026-11-06）

本節接續並更新§22末段當時的NOT_APPLIED狀態。主控已provider讀回正常tool rotation APPLIED（a669 app-infra SHA `d84ebf900af4181c98b974938ea78c6874b1136b58c0d7f2733865429e502595`）、runner digest `73c25bcc29c060a3ebc0902d40380edb004287911023573ec39f72b83d866988`。正式normal release `ORGMASTER-REL-20261106014712921-A669925`／[run42146303437](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/42146303437)，capsule SHA `6d924397295708f69545895b5678d6183e4fd1200a00b550b9fd498560ae909a`，migration Job `orgmaster-prod-migration-runner-qkl56`成功、ledger42／manifest SHA `a54dd092ff0b79977823346aa7765e05deddb686f79c32ac27480ea46bb546db`。candidate及entrypoint完成，verify `INTERNAL_CANDIDATE_SMOKE_FAILED`；workflow execution `010157b6-ccea-411e-b9a4-cb57d2416ba9`的governance_session回`ORGMASTER_SOURCE_UNAVAILABLE`。terminal recovery SHA `d59ce6a56590e20bf230a964202c1b3ed477dcc7153b153daf6af4ab9bd025b7`記FORWARD_APPLIED／PRE_ACTIVATION_ABORTED／legacy writes DENIED_AFTER045／noSQLrollback。provider servicegen398、舊e459100%／candidate93aa0%／無tags。以上是主控實際收據與provider facts，不是本source writer重新dispatch所得。

直接失效機制：a669 current PDM reader只查`ai_pdm_contract.v_application_role_catalog_v3`，PDM正式096尚未部署、僅合法v2。原unit多為無條件回catalog rows，沒有模擬relation不存在；現行必跑PG18 component只證046 ABI，未涵蓋此pre096讀取。新增pre096 unit先重現EXTERNAL_CATALOG_UNAVAILABLE，真PG18中直接舊v3 SQL產42P01、同BEGIN READ ONLY後續SELECT產25P02，證明不能catch缺表後在同交易降版。

修復固定由`pg_catalog.to_regclass`探測完整v3 relation名。probe必須一筆boolean；只有不存在才查固定v2 view，存在即嚴格只讀固定v3。不接受caller SQL/path或根據任何SELECT／decode error降版；probe／schema ACL／dependency、v3 ACL／缺資料／hash／wrong application／protected role不符均failclosed。v2 view不得承接dynamic-policy-v2，history reader與v3 current active-pointer／新protected app administrator守門保留；sourcePath綁實際被選view。這是Org先dual-reader、再由PDM096／catalog-v2部署的相容窗口；只有PDM正式v3與跨owner原完整驗收成立、受支援producer不再需v2時才可移除fallback，不以反轉部署順序掩蓋缺口。

新增`scripts/lib/dev070-ai-pdm-catalog-reader-postgres-qc.mjs`接同一required Source QC的既有owned PG18 service，使用canonical owner向量與真SQL v2/v3投影、runtime SELECT ACL、BEGIN READ ONLY及後續SELECT。10案含原42P01／25P02、v2-only可續交易、v3優先且protected admin存在、empty／hash／wrong-app／protected異常、v3與probe schema42501不降版、v2拒接新格式。明列projection-shaped SQL contract fixture，**非完整PDM producer DDL、真人或正式驗收**；既有跨owner／PDM096／真本人兩環境分母未縮。本機一次使用既有disposable manager執行10案PASS，finally已清理並由主控唯讀確認PID／port釋放；後續只交既有GHAservice，不碰primary。

source自查：完整app221files／1409passed／7conditional skips，local sandbox Node61；release Node460＋contracts33；TypeScript／app build／DBboundary與tool packaging3＋readback/database10通過。Packaging首輪失敗保留：兩處無條件query mock未識別probe、以及本地缺exact pg8.21 dependency closure；修正mocks並只在此worktree工具prefix裝locked closure後重跑通過。required CI／review及正常continuation的正式candidate smoke尚未完成；本slice只commit／push／draft PR；未merge、正式release或更動provider／primary SQL／Job／runtime／traffic／IAM／Secret。app reader TS改變需新app artifact；migration-runner closure未受此TS影響時沿既有gate驗證73c provenance重用，catalog-readback工具自身COPY closure包含reader，依其實際使用需要判定，不把不同工具closure混同。


<a id="dev070-local-bootstrap-acl-v2"></a>

## 24. Local neutral owner bootstrap v2：合法 ACL 合併修復（2026-11-06）

本節只接 local owner forward；主控已回報正式 OrgMaster protected master `24ff019` RELEASED／100% traffic，正式發布不由本 slice 重開。真實地端 normal CLI fresh plan `primary-forward-2026-11-06T04-19-49.712Z.json`（plan SHA `7fe8982ff97a00ca693d8144d3197e71332d110d602d24494f452d4dac43daa9`、source a0d4e9b）通過40-row／raw042／待044045，隨後 commit對外generic `DEV070_LOCAL_OWNER_UNAVAILABLE`；主控已取得native PG ERROR `DEV070_LOCAL_BOOTSTRAP_READBACK_INVALID`（04:20:24 UTC）。立即normal唯讀status讀回ledger40／raw042=true／localBridgeInstalled=false／receipt=null，沒有blind retry。原失敗收據、過期plan、raw042／identity／history／業務資料保留；本source修復未重送primary SQL，也不改private pointer。

原plan的三函數都是owner=postgres、SECURITY DEFINER及search_path=pg_catalog。兩個reader的ACL各2筆，owner替換後仍2筆；writer已對`jenfu_orgmaster_migrator`授EXECUTE，其postgres自grant與existing migrator grant在ALTER OWNER後變成相同grantor／grantee，native會合併為1筆。原070用jsonb_array_length相等而誤拒；既有CI fixture曾對三函數都grant runtime，未覆蓋new owner已是grantee的實際形狀。官方[PostgreSQL 18 aclnewowner實作](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/acl.c#L1061)會替換ACL兩端old owner、合併相同grantor／grantee並聯集權限及grant-option位元；[ALTER FUNCTION OWNER](https://www.postgresql.org/docs/18/sql-alterfunction.html)仍要求既有owner／SET ROLE與schema CREATE資格，SECURITY DEFINER後續沿new owner執行。

保留已發布`db/dev-010/070_local_orgmaster_administration_owner_bootstrap_v1.sql`原bytes（raw SHA `040cdccabc25d55ac0f94efa772386ef1575fe4f11a231a99bbc9e018ca9445c`），新增唯一forward source `db/dev-010/071_local_orgmaster_administration_owner_bootstrap_v2.sql`。normal owner `LOCAL_OWNER_BOOTSTRAP_PATH`只選071，exact `.gitattributes`固定071 LF（raw SHA `77ad814406203e3dd73d111e1241c4594addae0a699846dd992bc6bd7f564ab4`），Windows／CI source snapshot及plan帶同bytes的exact path、raw及rendered SHA；舊070過期plan不能改寫或重用，後續必須新source的fresh plan。DB boundary只在既有exact070白名單增加exact071，不放行整個db/dev-010。044／045／046與正式migration manifest不變。

071仍只准§22的固定三完整signature，existing NOLOGIN `jenfu_orgmaster_migrator`、同loopback／jenfu_local_*／private postgres operator／fresh真Google owner proof與source／target／OS postmaster／ledger／runtime／before-functions CAS。只有函數實際owner由postgres轉migrator時，expected ACL的grantor／grantee才各自替換exact postgres；再依grantor＋grantee＋privilege分組，grantable取bool_or，與actual同規格化結果精確相等。owner已是migrator時不替換ACL中的postgres引用。不得忽略ACL、額外授權、遺失授權或grant-option漂移；definition／body各SHA、SECURITY DEFINER、configuration其餘欄完全相同。第三方owner仍拒絕。

執行順序沿單一原transaction／advisory lock：normal preflight及before CAS → private original postgres執行exact071／三函數owner change＋readback → 切existing NOLOGIN migrator → 只補缺044／045及append-only原ledger（保留known raw042 row）→ exact046／two-workload bind → readback → COMMIT。071不進正式42-row migration ledger；既有immutable `administration_local_owner_bootstrap_receipts_v1`以新command／plan／071 source SHA append，記exact before／after，既有046 receipt格式不變。任何失敗rollback全transaction；unknown COMMIT仍normal status讀回，不重送、不改舊收據。首次失敗的primary仍40 rows，**source／fixture PASS不表示已安裝071／046、已授root或本人驗收通過**。

驗證：owner Node16、DEV070 contracts34、TypeScript、boundary與8項boundary self-tests通過。新增必跑existing required GHA owned PG18 lane的13個native案例，明確原070在actual2→1形狀失敗且rollback、071 false／true grant-option合併、兩reader正常／第四函數不動、already-owned保留postgres引用與receipt replay要求status、wrong database／port／path、foreign owner、ALTER後native event-trigger fault注入額外／遺失ACL／grant-option／body、body CAS與非operator session拒絕。測試使用原完整071 bytes，fault只在owned CI transaction、finally rollback，沒有primary fixture；初始head2ae0352／required CI42164369159 SUCCESS並已取得native13案完整log；其後僅補071 exact LF checkout規則與rawbytes回歸，保留該未變SQL native證據，新HEAD required CI仍正常執行。已有unknown COMMIT→status、raw042、target/source／CAS回歸維持。此次沒有新增本機PG、npm ci、full app build或production／primary寫入。


<a id="dev070-scoped-principal-readers"></a>
## 25. AI-PDM scoped Principal readers 與 legacy projection 共用（2026-11-06）

本次為 OrgMaster provider source 修正；新增 forward-only `db/migrations/047_dev070_scoped_ai_pdm_principal_readers.sql`，正式 manifest order 43／version `dev070-orgmaster-047`。001–045 applied bytes、既有42-row收據、local046及neutral bootstrap071均保留。047 source SHA-256=`b6837188519c403004c1bbbd4e70e91af35b9f366842707f115f7f6dcac251ce`；unwrapped applied SHA-256=`7dd50c0485301bf8c58a36ac630b467152fdc2a456459dc586e1e87e902974bf`。既有 owner append gate 只增加這個 exact entry；目前42-row prefix只待047一筆，已完成migration不重播DDL。local owner與intent runner的完成數改綁 exact manifest count，仍比對逐列version/name/hash，不接受自由count或未知prefix。

新增三個固定AI-PDM consumer入口：`orgmaster_contract.read_ai_pdm_active_principal_accounts_v1(text)`、`read_ai_pdm_active_principal_identity_v1(text,text)`、`read_ai_pdm_principal_effective_grants_v5(text,text)`。回傳既有V1／V5 tuple，僅給既有 `jenfu_ai_pdm_runtime` EXECUTE；PUBLIC、Platform、FMS無新增權限，私有helper不對runtime開放。accounts／identity只沿原023／031的identity、typed admission、managed-directory、employee與lifecycle條件，沒有增加administration故障依賴。grants reader保留所有target aliases、ownership／歧義、direct／delegated、scope／期限、catalog binding與global administration validation；unknown／無grant target仍先驗完整policy及所有原來會評估的eligible administrator catalog依賴。NULL不屬合法typed caller，仍先fail closed驗publication；原NULL equality可能短路SRF，這個收緊單獨列證，不冒稱舊error完全相同。AAL1、session／epoch與request guard不變，沒有跨request cache。

新private projection在JSON candidate／聚合前套入typed target，沒有呼叫舊zero-argument reader再外加WHERE。舊V1 accounts view保持可展開SQL與security_barrier，重用同statement governance／workspace；舊V5 zero-argument reader走同private projection的all-target分支，讓既有PDM source可先使用共用投影。SECURITY DEFINER、固定search_path及既有ACL維持；catalog dependency函數仍依原契約即時查驗。PostgreSQL 17同樣禁止SECURITY DEFINER或SET-config SQL SRF內聯，見[REL_17_STABLE optimizer](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/optimizer/util/clauses.c#L4884)。

驗證使用既有 `withAdministrationPostgresFixture`／disposable manager及500人口fixture，PostgreSQL **18.4**，雙側`jit=off`；不是正式17.11測試。新runner `scripts/qc-dev070-scoped-principal-readers-postgres.mjs` 在套047前保存原views的每案rows/error oracle，套後對typed與legacy做雙向EXCEPT ALL／error對照：24 cases、380等價比較及4個另列NULL validation checks通過。涵蓋有效legacy/admin、revoked／expired／future／no grant、catalog drift、unrelated malformed policy／duplicate ID／eligible catalog exception、identity、alias歧義／duplicate、真delegation、position_adoption有效position／assignment／sourceScope snapshot與referenced assignment到期拒絕、managed disabled／directory suspended、inactive employee及pending lifecycle。accounts在malformed administration時仍保留原rows/error；新入口ACL另證只有PDM runtime可執行。Corrupt-policy注入僅在該disposable cluster短暫停用單一artifact trigger，觀察前即恢復，各case rollback；不碰primary／production。

500人口隔離EXPLAIN（非production CPU結論）：original inner 1,800,122 row×loops／maxLoops1002，scoped 1,068／2，shared legacy 527,069／1002。該次時間1047.134／7.579／519.058ms；public invocation另一輪為938.507／17.358／508.921ms。accounts shared view的row×loops1550→2052、shared hits60→40、2.558→2.626ms，因此沒有宣稱accounts latency改善。真Cloud Insights top1 grants占73.094%、三個accounts SELECT合計26.865%，是execution time而非純CPU。正式CPU／Insights效果與capacity PASS仍須normal owner發布後native量測；原capacity CPU FAIL保留。

本機原22-case `.codex-work/scoped-qc-r4.log` 保留（SHA-256 `4a637bd7b3cfbfdc8ea0c3a412106d695e9393040db3e25993435b73e5af68aa`）；補兩個position_adoption案例後，以create-only `.codex-work/scoped-qc-r5.log` 實跑24-case／380比較＋NULL4（SHA-256 `74e4258f64cde41fb1d68492a4a0a2a5d03fd0aa6d6e16b3c091630ce8f67f4c`）。合法案在pre047 oracle先assert非空且scope正確，到期assignment案先assert拒絕，再對typed／legacy比對。`scoped-reader-inner-plans-r1.json`及原43／34／127／22 checks、lint／typecheck證據因SQL／runtime未變而重用；這是RD自查。完整owner差分沿現有Windows disposable harness執行；現有required Linux PG18 ABI／local bootstrap lane與source checks仍照常，未建立跨repo CI框架或放寬local min18。Provider先review／required CI／protected normal owner migration，再由AI-PDM部署typed consumer；本source slice未執行正式DDL、grant、Job或traffic mutation。


<a id="dev070-migration-only-continuation"></a>
## 26. 047 normal migration-only 與同capsule full接續（2026-11-06）

047核心source／applied hash及R5 oracle不變。為先由provider047改善legacy PDM讀取，再做fresh capacity量測，本slice追加既有Org owner執行器必要修正，詳[DEV040 normal migration-only amendment](DEV-040-jenfu-platform-entitlement-user-integration.md#dev040-normal-migration-only)。原workflow_ref/WIF／SA／concurrency不變，closed migration_only只執行prepare→build→migrate；不建立任何candidate、不寫runtime／traffic／control／terminal、不rollback，也不把MIGRATION_APPLIED稱RELEASED。

Normal CLI沿exact DEV070 append gate／manifest43／tool proof準備新protected source capsule；既有master/source QC不可省。三階段封存後，full continuation只收同immutable capsule，重新驗official source＋exact-head latest Source QC SUCCESS、原4h expiry、source identity／manifest／baseline及sealed chain，才dispatch原full。新run重用sealed build與migration，candidate階段才取得原control lease與執行完整後續gates。缺receipt／source漂移／expired／已有candidate或terminal均拒，不能手呼stage或改capsule冒normal CLI。migration-only失敗不證明DB未commit，unknown先native readonly readback再依正常runner處理。

原capacity CPU FAIL保持；source／mock／Node PASS不代表正式047已套、fresh31 PASS或PDM新consumer已deploy。執行由coordinator沿既有goal與各owner normal flow完成，沒有新增人工approval gate。CI42213054164首輪458/460及兩個舊42假設保留；本次runner修正prefix31–43／pending12，以真unknown-044 row證明44拒絕且零write；routine42→047合法、43無append拒絕，不以slice fixture另宣稱routine44-row證據。不修改任何applied migration或舊正式收據。

### 26.1 Enrollment owner沿current exact manifest（2026-11-06）

主控後續已回報047正式套用、ledger43；續查official `496d50c70d9fc7a5233c8ab14aa5f57c22aec939` source，發現host `executeEnrollmentOwnerOperation` 仍以 `entries.length!==42` 拒絕baseline，會在建立enrollment artifact／Job之前阻擋新43-row release。此項是source查出的必要blocker，尚未執行該次normal enrollment plan，沒有新增Job／intent／SQL或假造provider failure；先完成496同capsule normal full release仍是獨立前提，MIGRATION_APPLIED不冒稱RELEASED。

owner現在沿既有 `assertDev070MigrationEntries` 驗current exact43，包括001–039 prefix與042／044／045／047的order、version、path、source／applied hashes及bundle entry name。actual validator及production enrollment runner在496已是strict43，並非42／43雙版；本次不改共享validator、不擴歷史compat。舊42屬舊source歷史，不能以current source接受；未知44、錯prefix／path／hash仍拒絕。原clean official source、exact baseline.source equality、RELEASED／sealed manifest與receipt chain、own service／normal Job template guard及typed intent／SESSION_USER／逐列ledger檢查全保留，不加source alias或CLI override。

同family掃描：production runner已以 `bundle.entries.length` 及每列version／name／checksum驗live ledger；local source同樣先驗current manifest，local bridge可從39–43的合法exact prefix forward，但installed receipt／intent readiness必須等於 `source.entries.length`。首位初始化owner未另設42完成數，因此未發現第二個同類metadata-count blocker；沒有把未完成local forward說成installed。新回歸直接走sealed routine baseline＋owner adapter，驗四個closed action current43及receipt reuse、42／44／prefix與047 hash/path/SQL tamper零publish／零Job、source漂移與非RELEASED拒絕。runner source及其migration image COPY closure未改；是否重建／reuse仍沿正常artifact gate，不因本host adapter修正自行rotation。此source修復不表示enrollment或首位root已完成，既有capacity CPU FAIL與本人驗收分母保留。

<a id="dev070-static-v8-reader"></a>
## 27. PDM exact static-v8／v3 consumer 相容（2026-11-06）

新PDM local static publication只在原九角色後追加既有protected `role-application-system-admin`。Org原normal DB reader在非dynamic分支把未列入approved的十列送入v7九列相容檢查，故合法v8得到 `EXTERNAL_CATALOG_INVALID`；治理metadata converter亦只接受v1來源的九列static。此為source確認的必要caller修復；正式既有dynamic publication不是此失敗分母。

Own-vendor `config/catalogs/ai-pdm-role-catalog.v8.json` 原封複製自PDM fixed development root `C:/VIBE CODING/.worktrees/AI_PDM/dev127-platform-super-admin-20261105/config/access-control/jenfu-role-catalog.v8.json`，raw SHA-256=`799b6d138d614bd737b49818e02f6a31b1810c42e01801f845401fb7ad3146e1`，catalog version=`ai-pdm.role-catalog.2026-11-06.v8`，aggregate SHA-256=`320b259f0f0b4a51f24227cff37313bcb5fa3834d7736df3c43a1e178b878a73`。該PDM切片尚未commit時，artifact已由Root及獨立SQL/source review凍結；本vendoring不是PDM整slice已發布證明。Git對此artifact固定LF，正常Org讀取不依賴sibling checkout。完整九角色prefix／hash／permissions不變，第十角色與Org既有vendored protected source的11 permissions完全一致，保留其 `e7ff57ed1ca6d2d99e6e052f1f48829365093a32a1d6bb9f8503490a3e7bcbfc` protected hash，不以legacy role hash算法重算。Static aggregate不包含publishedAt；允許producer實際clock_timestamp，僅要求各列同一合法publication instant。

新增closed static-v8分支獨立驗十列完整v3投影、順序、全部active role、static publication format、每個原生NULL metadata、static profile schema／hash與每列profile。前九仍native self binding，沒有套dynamic生管／採購alias；第十使用原registry.v3 hidden protected profile，profile aggregate=`6cbc0346701146191fca929354883eb04a758daa7a695cc22c41c7bb5dfb5fe9`。Current source只准固定 `ai_pdm_contract.v_application_role_catalog_v3`，v2結果的static-v8、retired current、混版、未知／缺少欄位、額外／缺少角色、permission／hash／profile tamper均拒；沒有fallback。Historical reader仍只經固定versioned history view驗同一immutable artifact，允正常retired publication但role仍全active。既有legacy content相容與dynamic validators／baseline集合不擴張。

Normal DB reader驗證後，`createAiPdmRoleCatalog`及`validateExternalRoleCatalog`沿exact-v8／v3 metadata分支保留原九profile與第十protected definition hash；顯式錯v1／v2來源、未知version、錯hash／身份／active status／scope／profile拒絕。Pure metadata轉換不自行建立live provenance或授權；exact Principal direct grant、AAL／session／epoch／lifecycle與protected writer／SQL不變。本slice不改任何SQL、IAM或正式runtime，也不宣稱local v8 publication、管理任用、本人UI或capacity PASS。

### 27.1 Enrollment status 是fresh observation，不是immutable command replay

同branch續查current first-root owner入口，確認 `status` 也沿manifest deterministic hash決定output URI；首次native receipt為NULL的合法PASS觀察一旦封存，後續同CLI會永久回舊pending，初始化或撤銷後亦不再查native。新regression在修前重現pending→native changed仍讀NULL；這是source／fixture證據，主控沒有以正式status重送來假造首敗。

Host只對status在固定own `receipts/administration-enrollment/<commandId>/status-<manifestHash>-<hostUUID>.json` 建新觀察輸出；UUID由source-owned host產生，不接受CLI selector。原sealed input manifest／inputRef、admitted intent與commandId不變；plan／admit／revoke仍重用原immutable receipt。既有normal Job transport把exact output-ref納入完整args，unknown submission沿同一observation的provider execution readback，不重送同observation；runner原exact output-ref create-only receipt及strict43／same-source RELEASED／target／SESSION_USER guards不改。新測例驗pending後initialized／revoked會各取fresh observation、runs2、原觀察bytes不可覆寫，另三action仍runs1。此host修復不改runner COPY closure；是否reuse仍由正常artifact gate判定，不手工宣稱reuse或初始化完成。

<a id="dev070-static-v8-packaging"></a>
### 27.2 PR220 容器與封裝 closure 修正

R1 source後追加確認：app runner只literal COPY v5／v6／v7，v8 file-backed reader在正式image將缺asset；catalog-readback operator則COPY了新增import的repository，未COPY `aiPdmStaticV8Catalog.ts`及v8 JSON。PR220 HEAD `9e54cbdaf533b1bcdc0ffaa86003ab0a626bd4f9` 的required CI `42249301756` 保留兩個實際首敗：readback image native import `ERR_MODULE_NOT_FOUND`；required Node runtime資產測試掃到v8卻硬認九角色，`10 !== 9`（465／466）。這些不是本機tool pg版本前置不足，也不是已發布runtime失敗。

App runner與readback recipe現明列COPY v8資產，readback另補新helper及其原有v7／protected source／registry import closure。兩recipe執行同一 `scripts/dev070-catalog-runtime-smoke.mjs`：保留v5／v6／v7九角色檢查，另驗exact v8 raw799b6d、aggregate320b及九角色prefix／第十protected11permissions／e7hash。Repo外hermetic staging只依各Docker literal COPY投影，不借工作樹import；原生Node讀完整static-v8 v3 projection，缺helper／JSON不能import，缺asset／permission tamper拒絕。Scoped catalog attributes在實際Git LF／Windows CRLF archive下均保留同一raw799b6d，不做caller bytes normalization。SSR bundle／完整Docker build仍由原required CI驗證，不以staging冒稱完整image PASS。

原22 inputs是 `toolExecutableInputs` **預設migration-runner** manifest，並非三工具總closure。Source-owned helper現只允既有三個固定recipe分別盤點，包含各COPY source及影響它的ancestor `.gitattributes`；migration既有caller仍選預設0，沒有新增CLI recipe／image override。此次7bf→R2 source盤點為migration22→22、pair-diagnostic8→8、catalog-readback17→21；後者新增helper／v8 JSON／build smoke／scoped attributes，並改recipe與repository inputs。舊readback image不能被重新標示為此source。Catalog-readback是獨立固定operator diagnostic，未被current Terraform／release profile或普通owner workflow部署／調用；本slice沒有查provider現存operator image，也沒有build／deploy它。未來使用此新工具前仍須normal source-bound build／provenance／scan，不因migration22相同而省略。

Ordinary release與APP_INFRA_REUSE原resource tree會因這個非provisioned diagnostic recipe改動而漂移。僅允固定Git blob `fd44c040271d74ac370c61746b5d4d73c4313b77` → `a00ab7ae4c128acf2fe518d3cd268c71d585dbb1` 的resource-equivalence：共同helper只把該path／100644 mode／exact AFTER entry映至BEFORE供resource fingerprint比較；source blob讀取、原manifest／archive／build provenance及分recipe executable inputs仍保留原bytes。Unknown recipe、mode或任何`.tf`／profile drift不在例外內；既有66ce→4645歷史Principal切片不改。Pure tests從actual7bf tracked infra建立task-owned Git fixture，加入exact R2 recipe後驗普通full routine planner與prior APP_INFRA_REUSE接續，並拒unknown recipe／mode／Terraform drift，不跑provider或替代正式release gates。

本機獨立的full pg-entrypoint staging若缺tool lock的pg8.21.0仍標前置不足（現有app依賴8.23.0），保留first failure，不改lock／install／stub／skip；既有CI先安裝該exact tool closure再build/import三image的required gate保持。這輪沒有PG、SQL、IAM／Secret、provider或人類grant操作，沒有native history量測／capacity PASS或本人UI結論。

## 28. Status 的 optional capacity metadata observation（2026-11-07）

本切片只在既有 `status` action 的已知native結果追加 `observations`，保留原 `intent`、`revoked`、`receipt` 內容及未知command的 `null`。它不依賴current administrationVersion仍為0；原admitted intent／expected CAS輸入、15分鐘TTL、strict43 ledger、same-source RELEASED、固定Job／target／SESSION_USER與auth guards不變。未採用的plan metadata測試WIP已另存private patch與原檔副本；bootstrap plan及readiness gate沒有新增欄位或條件。

`observations` 為封閉union：成功固定 `status=AVAILABLE`、`scope=owner_session` 及下列五欄；SQL／投影驗型失敗則只有 `status=UNAVAILABLE`、`code=DEV070_STATUS_CAPACITY_OBSERVATION_UNAVAILABLE`，不回原生error／SQL內容、不以0補未知。

- `ownerSessionJitSetting`：`pg_catalog.current_setting('jit')`，只接受字串 `on`／`off`。
- `ownerSessionJitAvailable`：`pg_catalog.pg_jit_available()`，只接受boolean。依[PostgreSQL 17官方定義](https://www.postgresql.org/docs/17/functions-info.html)，須JIT擴充可用且本session的jit為on才為true；false不單獨證明LLVM缺失。
- `governancePublishedVersionCount`：active `orgmaster-governance.v3.json` 的 `jsonb_array_length(payload->'publishedVersions')`，包括該array中的歷史版本。
- `governancePayloadLogicalBytes`：同一active payload的 `octet_length(payload::text)`，是PostgreSQL JSONB文字表示的bytes，不是JS canonical JSON大小。
- `governancePayloadColumnBytes`：同一active payload的 `pg_column_size(payload)`；依[官方datum size定義](https://www.postgresql.org/docs/17/functions-admin.html)，反映該column datum的儲存大小／壓縮，不是整表或完整TOAST overhead。後三欄皆要求原生number、非負safe integer；NULL、字串、缺欄、分數、非有限或越界數字及非單列結果均為UNAVAILABLE。

Status先在 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` 內查原owner function；已知結果才建立固定savepoint，從同snapshot的active authority/artifact直接回五項純aggregate／session metadata，不傳出payload。Optional SQL或typing error先 `ROLLBACK TO SAVEPOINT`，再返回原status附UNAVAILABLE；成功及失敗皆在finally執行整個transaction的ROLLBACK。原status／身份或release guard失敗仍為失敗，不被diagnostic catch吞掉；unknown command不查metadata。原create-only observation output／unknown execution readback保持，新的host status呼叫仍取fresh output，不覆寫舊觀察。Plan／admit／revoke的SQL、結果與immutable replay不變，不增加action、flag、target、自由SQL或權限。

五欄只反映此Org owner Job的session及active artifact，不能推成PDM actual runtime session的JIT設定、特定query實際使用JIT或CPU根因；[JIT是否啟用於查詢也取決於planning時的成本門檻](https://www.postgresql.org/docs/17/jit-decision.html)。首次source驗證當時，本機focused Node以actual runner＋provider/DB doubles驗known/null／AVAILABLE／UNAVAILABLE／rollback與其他actions保持，沒有PG或provider實測，也未取得native數值或capacity PASS。此次runner檔位於既有migration image literal COPY closure，後續須正常新runner build及APP_INFRA_IMAGE_ROTATION，再沿current gate正常app build／full owner release；不加artifact reuse例外、不重用舊image冒稱新source。此status切片已隨D81 normal build／rotation／full release發布；native observation的證據範圍另見§29，不能替代性能或本人驗收。


## 29. Governance scalar projection forward048（2026-11-07）

D81正式status在2026-11-06 18:25Z讀回AVAILABLE：governance history29、logical JSONB text 1,755,738 bytes、column datum 479,625 bytes；owner session jit=on但pg_jit_available=false，原native receipt仍NULL。它只代表Org owner Job的session／artifact，不證明PDM實際session或CPU根因；本slice不加入JIT設定。既有quiet CPU與capacity未通過的事實、本人Google／root UI分母及歷史首敗保留。

隔離R4使用PostgreSQL18.4、jit=off／plan auto、6人口G0，同一history29合成artifact；padding僅inactive publication的non-authority欄，active publication SHA-256 1b1dd18…與non-history欄位保持。Logical／column bytes為1,753,233／518,652（pglz），不是正式payload或完整PDM producer模型。完整public accounts三次execution ms為39.263／40.195／39.193→10.335／8.440／9.129；grants為96.433／102.371／96.272→81.715／76.574／64.012。兩側row count及canonical multiset hash（保留duplicates）相同；source-derived protected PDM catalog與Org native bootstrap seed preflight通過。R4僅支持此合成模型的方向性，未驗G2×history29、PG17、native500ms根因、正式optimization或capacity PASS。保留結果 `.codex-work/history-toast-active-id-projection-r4.json` raw SHA256 `1369ff7592fe83444ecf2414831d7587476e2157198922cdd9404bd8edc363fd`，source raw SHA256 `da51b9a75754d36b5df1bfe1049d9cd5bbfd413e8a53b1771f5d6d9db49d6283`；R1–R3首敗不重寫。

新增forward-only `db/migrations/048_dev070_governance_scalar_projection.sql`，只CREATE OR REPLACE兩個既有helper，內容與R4兩段prototype完全相符：044 administration publication reader把activePolicyVersionId讀成local text一次；047 accounts在原有MATERIALIZED active_governance CTE一次投影active id及publishedVersions array。完整policy／global catalog validation、NULL／missing／duplicate publication錯誤、Principal／Employee／alias／p_all／session／epoch／cross-contract predicates保持；不改其他body、owner、ACL、SECURITY DEFINER／search_path／default args，不新增cache／generated column、JIT GUC或資料rewrite。044／045／047所有applied bytes不改。

正式profile及DEV070 shared module新增exact order44／versiondev070-orgmaster-048／source75c56c01a50c9aec50c6fc6cba25d3c01993631ad48aff9300182aa23891e1c2／appliede817ca52e4e52c67fa3f43885fbfb99334067dc6e670ab129752933b38ea7179。Normal append為已驗43→44或既有合法prefix forward；已完整44不再宣告append，ordinary零DDL／owner操作接受exact44；未知45拒絕，舊source歷史43不被重標。Production runner、normal migration-only／full continuation、enrollment owner／runner沿共享validator；local39–44 exact ledger allowlist同步，raw042 genesis與046 bridge／071 owner bootstrap規則保持。Full fixture預設安裝047／048；scoped oracle明示停在045以收pre047 rows/errors，再分別驗047／048，保留原24cases／380雙向EXCEPT ALL與NULL4及新增publication邊界／pg_proc metadata界線。

本slice的驗證屬source／task-owned disposable PG，正式048尚未套用或發布，未新增primary／production寫入。後續依正常review／required CI、source-bound runner build與exact image-only rotation，再用原DEV070 controlled append gate及normal full owner flow；不將R4當正式PASS、不略過原migration／source／receipt／recovery guards。

048本機source／隔離驗證：R3各phase保留原24cases／380 comparisons＋NULL4；新增5publication edges逐scoped／legacy ABI保存actual047的80份rows或code/message，048對該literal oracle的80次duplicate-preserving multiset／error比較通過，原global-validation檢查保留。7個pg_proc metadata不變、僅上述2個body改變；原R2的914 comparisons／NULL14與R3結果均另存。R3 raw result SHA256 `7dc006d9bec90bff45dee81282783ec6ccf1b99d31e24643751bf26e0d3021f8`；PID25732／port65101已停止／釋放、owned cluster temp移除，runtime／lease released、session ended。R1最早Python import shadowing及衍生release TypeError保留，沒有當成SQL產品錯誤或倒填未記錄的PID／port。

Boundary首檢確認header須列出RETURNS SETOF引用的own orgmaster_contract，後僅補該schema宣告；pre-header raw48a781…及metadata-only diff保留。既有unwrap保留header comments，因此raw與applied pins都重新綁定，兩helper body及BEGIN起所有SQL statements bytes完全不變，重用上述native語義證據。Local required QC整體仍未通過：本機缺少tool lock的pg8.21.0 closure，保留既有及本次實際failure；此次本機未另外安裝exact工具依賴，也未改lock、使用stub或跳過guard冒稱PASS，正常required CI仍須安裝exact closure並驗三image。已通過的Node／tool-rotation／runtime packaging子範圍與安全獨立abort、app tests、build另列來源及log；known自有plan-WIP rawcopy因test suffix被誤收的失敗亦保留，bytes保留並以forward mapping改存非test副檔名，未改Vitest exclusions或未知資料。


<a id="dev070-scoped-pdm-manager-eligibility"></a>
## 30. AI-PDM manager eligibility scoped grant lookup（forward049）

Org 3d395ab 的正常 owner release 已套用048、正式 ledger44。AI-PDM 5d23ab5 在 2026-11-07 02:41:59Z 的本人「流程」workspace GET 回503，request latency 8.31秒，同一登入另讀到安全碼 ROLE_POLICY_DEPENDENCY_UNAVAILABLE。正式 Cloud SQL 在 02:42:08Z 記錄同一 AI-PDM runtime backend 的 statement timeout、context 的 read_ai_pdm_principal_effective_grants_v5 與 ai_pdm_role_policy_manager_eligible_v2，及同一 statement 呼叫 manager v2。正式 DEV127 f19 catalog 已有 ACTIVE 與後續 ALREADY_CURRENT 收據。無 PDM 任用仍按原政策拒絕，不能以補任用來處理 SQL timeout。

<a id="dev070-initialization-adoption-priority"></a>

## 30. 首次 FMS 目錄採用的明示 operation 優先序（2026-11-07）

正式 `master@9621f29f3689980e592782d738c79496467c6bc6` 已由 owner run `42376362230` 全十階段 RELEASED，provider revision `orgmaster-prod-14a059783cff` 為 Ready／100% traffic。更新後正常本人 session 已可讀 FMS handoff；預覽結果為新增固定 `role-system-admin`、移除0、修改0，四筆既有任用全部保留。FMS own status 亦回讀既有 committed publication，不重建或重寫初始化收據。

實際首次中央採用仍暴露一個 source 缺陷：同一 root principal 同時持有一般 FMS `catalog.import/publish/activate` grants 時，preview 先以一般 grant 分流，忽略 request 已帶的 source-bound `initializationOperationId`；UI 因而要求 normal FMS checkpoint，而初始化頁只支援 owner-bound root adoption，15秒後轉 unknown。原 command receipt readback 為不存在，故沒有 catalog activation 寫入，依 unknown-write規則不重送。

修正只調整 admission 優先序：帶 `initializationOperationId` 必須先驗 owner handoff、同 operation、同 publisher、固定 additive release及 root point，產生 `platform_root_catalog_initialization` actor proof；沒有 operation id 的普通／partial-grant activation維持原 grant與checkpoint路徑。這不讓一般 root 繞過 normal catalog guard，也不建立 Owner、app grant或五項 protected operation grant。新增同 actor 已有 ordinary grants 的回歸，並保留缺 publish／activate grant的既有反向案例；相關 FMS activation/handoff/UI 61／61、DEV-070 contracts 48／48及 client/server build PASS。正式採用仍以 protected merge、required CI、owner release及同 operation readback為準。

044 manager v2 直接讀取 v_ai_pdm_principal_effective_grants_v5 view。該 view 經044既有 narrow-reader 建立步驟指向無參數函式，047把無參數函式移到共用計算後仍以 p_all=true 掃描全部 grants。048只替換兩個 helper 並保留此路徑。049只以同簽章 CREATE OR REPLACE manager v2，把內層 grants 改由既有二參數 v5 reader 依 exact Principal／Employee 查詢。保留 outer account、issuer／subject、active human、direct／global、protected app-admin 或 privileged legacy system_admin 條件。Typed reader 保留全域 administration publication／eligible catalog 檢查。原 SECURITY DEFINER、STABLE、search_path、owner 與 exact PDM runtime／migrator EXECUTE 權限保持。PDM GET／create／save／apply 沿同一 ABI，原 session／epoch、lifecycle、AAL、讀寫隔離、鎖與稽核維持。

正式 profile／DEV070 validator 固定 order45、version dev070-orgmaster-049、source ae4f3730525417b638cb65175606f7d6d8589c1a89cf61125ffbdd629f4f0e9b、applied 3c4a56696e2f224a7911fd45d2e2d3579657a8a941ac9de39c20c87f4f2212f1。正常44→45 append 保留全部原已套用 bytes；完整45可依原 ordinary／enrollment gate 讀回，未知46拒絕；local39–45 exact ledger 仍保留 raw042 與既有 owner bridge。049 後續依正常 source-bound runner build／image-only rotation、required CI 及 owner release；不採用擴大權限、提高 timeout、降低授權重驗頻率或跳過 catalog 驗證。隔離 fixture 比較已安裝048／049行為，不能作本人授權、正式延遲或共用容量驗收。

同一正式來源另觀察到本人 `GET /api/orgmaster/governance/session` 503，與上述 PDM SQL timeout 分開保留。相同 revision 的 current workspace 讀取成功，隔離 native root 寫入／JS 讀取證明可在有效目錄下成功；正式失敗階段尚未定位。本次只為已驗證的非沙盒 session GET 加入有界診斷，每次失敗一筆，僅含固定 stage、錯誤分類及固定驗證代碼，不記錄身分、資料、路徑、SQL、message 或 stack。既有 503 回應、判權、資料及寫入流程不變。

本機 owner Node 與 tool rotation regression、DB boundary、上述診斷 middleware regression 及 TypeScript 檢查已通過。此機隔離 PostgreSQL fixture 在啟動前被容量保護拒絕；未放寬門檻。既有 required CI 的 disposable PG18 步驟另執行實際 044／049 SQL、11 組資格案例與 ACL metadata 比較；上游 account／grant 投影是明示 ABI fixture。同一既有 CI service 的另一個明確標記 DB 另安裝完整 047／048／049 reader，並以固定上游資料／PDM 合約 fixture 驗 13 組 048→049 授權及錯誤結果、ACL 和 metadata；不是正式效能或真實跨 App 資料驗收。較大本機 fixture 與效能觀察保持未執行。049 尚未套用正式，也未重新初始化本人或寫入新授權。

## 31. 地端持久化相容 ACL（forward072）

原任務地端 PostgreSQL 上，4acfcf7 的 runtime 身分沿 `readExistingGovernanceStore` 讀取既存治理文件時，在 `persistence_artifact_read` 失敗。read-only native transaction 另證實治理及組織 workspace 的同一 wrapper 均回 `42501 permission denied for schema orgmaster`。071 已將三支 `orgmaster_core` wrapper 交予 `jenfu_orgmaster_migrator`，該角色沒有歷史 `orgmaster` 相容 schema 的 USAGE 與三支被委派函式的 EXECUTE。地端舊兩支寫入函式也仍可由 runtime 直接執行，繞開 045 指定的 v3 actor fence。地端 readback 僅記 ABI 與權限布林值，未擷取文件或執行寫入。正式原 revision 的管理頁 503 仍需獨立定位。

唯一新增來源 `db/dev-010/072_local_orgmaster_persistence_compatibility.sql` 為 neutral local bootstrap。normal owner plan 的 `ownershipBootstrap.compatibility` 綁 exact path、raw 與 unwrapped SHA，既有計畫及收據仍由原 plan SHA 驗證。沿原本 verified local owner、loopback 目標、OS postmaster、ledger、runtime 及 advisory lock，在原交易內先執行未變更的 071 並讀到本次 owner bootstrap 收據，再執行 072。072 校驗本次 plan／收據、三支既有 wrapper 的 owner、委派內容與固定 search path。只補 NOLOGIN migrator 對既有相容 schema 的 USAGE 和三支必要函式的 EXECUTE，同時撤回 runtime／PUBLIC 對兩支舊寫入函式的 EXECUTE，讀回當前 runtime login 的實際拒絕結果。既有 core reader、v3 writer、函式內容與歷史 owner 保持，未新增 runtime 授權或搬移資料。

072 不列正式 migration manifest、不改 070／071／046 或已套用 ledger。失敗由正常 owner 交易整體回復，未知 COMMIT 沿原 immutable receipt status 讀回。隔離 Windows PostgreSQL 18.4 已用實際 071／072 source 與明示 fixture 通過八項對照，涵蓋正常 runtime 讀取、兩支 legacy writer 從可用到拒絕、ABI 漂移、NOLOGIN 及未觸及的 ACL／owner。這次驗證未寫入任務原資料庫。既有 v3 writer 契約仍由原 DEV-070 原生項目驗證，正式 503 依原 owner release 路徑獨立追查。
