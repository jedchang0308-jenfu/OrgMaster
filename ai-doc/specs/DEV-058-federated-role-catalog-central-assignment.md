# DEV-058：B 方案動態角色目錄與集中人員指派契約

日期：2026-10-12（Asia/Taipei）。Owner：`ORGMASTER/DEV-058`。
文件成熟度：`RD Implementation Ready / Human Confirmed / Documents Only`。
產品：`NOT_IMPLEMENTED`；UI、DB、雙端、故障隔離及正式啟用：`NOT_RUN`。
來源：`AIPDM/DEV-123#orgmaster-compatibility`；協作主鍵 `AIPDM/DEV-123#role-permission-editor`。

本文件沿用 DEV-058 的唯一產品／技術契約；[任務索引](../dev_task.md#dev-058-federated-role-catalog-central-assignment)只記狀態及交接，[QA 計畫](../qa/DEV-058-dynamic-role-assignment-validation-plan.md)記案例及固定入口。工程契約已足以供後續 OrgMaster RD 實作；本輪人類明確限定文件，成熟度不構成程式實作或正式啟用授權。

## 1. 人類決策與範圍

決策來源：先前選 B／與 AI-PDM DEV-123 協作及「繼續補齊開發文件」；本輪「繼續把 DEV-058 補到 RD Implementation Ready，完成 DTO／命令／結果查詢 schema、DDL 設計及固定驗證入口，並對齊 AI-PDM DEV-123。本輪只修改 OrgMaster 文件，暫不開始程式實作」。

- B 分工確定：各系統定義角色、能力與 current policy；OrgMaster 管人員指派、scope、期間、代理、撤銷、發布及治理紀錄。C 的本地可編輯指派與組織圖自動授權不採用。
- 採人控與提醒：合格管理者直接操作；不增加第二人核准、風險計分阻擋、提醒逾期凍結或獨立需求單。
- 本輪僅 OrgMaster 文件；AI-PDM／DEV-123 為相關只讀對照。未授權產品實作、測試／build／runtime、其他專案修改或正式環境操作。
- 第一版限定 AI-PDM 動態目錄相容 OM-C1..4；OrgMaster 自用角色、Principal-only、既有任職來源失效及撤權保護沿用現行契約。

| 包含 | 排除 |
|---|---|
| legacy＋dynamic current／history 讀取；custom、停用、恢復；正常配人及歷史撤銷；相容宣告；雙端驗收 | OrgMaster 編輯 PDM 能力、任意 application 接入、角色物理刪除、身分模型重建、本地 ACL／legacy fallback、跨 owner core DML |
| 角色停用狀態、版本資料時間及既有指派提示 | 整個治理工作台重設計、financial assignment、JF-FMS／Platform 產品變更、組織圖同步新增角色 |
| 必要 versioned projection／owner ACL 設計 | 已套用 migration 修改、正式資料重寫、IAM／Secret／traffic／release 執行 |

## 2. 現況、失效機制與目標資料流

本輪開始讀取 branch `codex/topbar-account-menu`／HEAD `681d058f85a25f61d67f29cd9d0b8462ceb97987`；寫作期間其他工作切到 `master / 24cbf0f6c71cf619565c3e5789b75e3505c3564d`（PR131 合併）。本輪未切分支／commit。先前 DEV-058 文件由該工作保存在 stash「preserve unrelated DEV-058 docs while deploying 681d058」，本輪只取回本任務內容續補，未 pop／drop stash或覆蓋其他文件增補。AI-PDM文件在 `C:/VIBE CODING/AI_PDM/.ai-doc`，其記錄source為 `d3fc1bf72b3630f8a748746c40584e595d396dac`，本輪Git readback受限、current HEAD／dirty UNKNOWN；實際DEV-123文件SHA256=`260b1e15bcde999d72f8e636ac800f643b85245a076d2cee67e595b8ca62d3cb`。來源／文件狀態都不是部署證據。

DEV-037 restore/remove 及 DEV-039 帳號選單已在上述 PR131 source；本輪只讀產品程式，保留其原契約／證據。PDM「恢復角色」與 OrgMaster「重新啟用已撤銷指派」不同：前者不解除 revoked，後者需 explicit 合格管理者、active 人員／角色及合法期間／scope；REMOVE 只移出 revoked 草稿列，歷史保留。DEV-058 僅將 restore 的固定 catalogVersion equality 改為可信歷史驗證（§6.1），不推翻其其他資格條件。

| 現行責任面 | 已確認現況 | 本 DEV 的調整 |
|---|---|---|
| catalog reader／registry | approved v5/v6/v7、exact artifact/hash、roles.length=9 | 依 publication format 分派 legacy／dynamic；active 不補入其他版本 |
| metadata／治理 validation | current metadata 固定版本；歷史 allowlist；inactive 會進一般錯誤 | 可信歷史上下文與新任用／既有完整性分開驗證 |
| governance write／persistence | `withActorWrite`＋writer fence、revision CAS、READ COMMITTED | 操作內凍結目錄上下文，維持最新 actor／組織 fence |
| grants producer | migration 029 的 v4 依 stable ID／code、subject、scope／period，join PDM v1；沒有九角色數量限制 | 保留 v4 schema、欄位、manifest；PDM current lifecycle 決定實際能力 |
| UI | 正常指派、草稿／發布、歷史與特權入口 | 支援 custom／停用狀態及可撤銷歷史，保留既有布局 |

主要失效機制：只改畫面會讓 server 拒絕新角色；只放寬九角色限制會失去來源／protected 驗證；把停用當成任用損壞會阻斷整份治理；READ COMMITTED 下多次重讀 current 可能混用目錄版本。

目標流向：AI-PDM role-policy 編輯／發布啟用 → PDM versioned current／history → OrgMaster 可信目錄及歷史 → 人員任用／發布 → 既有 Principal grants v4 → PDM current policy／lifecycle／資源判權。角色清單就是配人需求；不存在第二份可編輯目錄或每 request OrgMaster HTTP permission service。

## 3. 角色與任用的行為契約

| 事件 | OrgMaster | AI-PDM／人控 |
|---|---|---|
| custom 首次 active | current 中合法角色可選，名稱及來源可讀 | 人員由合格管理者在 OrgMaster 指派，初始能力由 PDM 決定 |
| 角色能力變更 | 保留原 catalogVersion／任用，顯示 current 摘要 | 下一次 PDM protected 操作讀當前能力；管理者檢視人選 |
| inactive | 禁新任用／新推薦／新代理；原合法指派及代理可讀，可撤銷 | direct／delegated 不授予該角色能力；其他角色繼續正常判權 |
| 恢復同 ID | 不複製、重建或重寫原任用 | 僅未撤銷、未到期、scope／來源仍合法的任用可能再生效，提醒管理者檢視 |
| manual 調職 | 不依名字／職稱自動 grant／revoke | 人決定是否保留，完整調職待檢視清單為後續 capsule |
| position_adoption 來源失效 | 維持既有任職來源 gate | 原來源失效仍停止該指派；不默默轉成永久 manual |
| Employee inactive／Principal 不合法／指派撤銷或到期 | 既有有效授權條件生效 | 提醒不能取代實際停止存取 |

角色 status `active/inactive`、指派 status `active/revoked` 與業務 effective 是三個不同事實。inactive 不是損壞資料；缺歷史、錯身份／scope、hash 不符仍是契約錯誤。

custom 模板、九起始身份、順序與 64 上限沿 [DEV-123 §1.1](../../../AI_PDM/.ai-doc/specs/DEV-123-role-permission-editor-contract.md)：server 生成 ID/code、employee/workspace/app_admin、零初始 permissions、無特權 metadata。第一版不允許改 builtin 身份、custom scope 模板、physical DELETE、重排或 `system_admin` 停用／複製。不可把任用管理權從 PDM role 名稱推導出來。

## 4. 跨 owner 資料與 API 邊界

詳細 source 欄位及 canonical 定義以 DEV-123 §5.2–5.3 為 producer authority；OrgMaster decoder 必須完整對照，不只讀顯示欄位。

| 契約 | owner／用途 | 存取 |
|---|---|---|
| `ai_pdm_contract.v_application_role_catalog_v2` | PDM 唯一 current，legacy／dynamic 完整角色與 lifecycle | OrgMaster runtime 精確 SELECT／必要 USAGE |
| `ai_pdm_contract.v_role_policy_publications_v1` | PDM immutable history／待啟用 publication；歷史驗證 | OrgMaster 精確 SELECT，按必要 catalogVersion 查詢 |
| `orgmaster_contract.v_ai_pdm_role_policy_compatibility_v1` | OrgMaster consumer 相容宣告 | PDM 精確 SELECT；owner migrator 維護 |
| `orgmaster_contract.v_ai_pdm_principal_effective_grants_v4` | 既有 Principal 任用投影 | 現行 ACL／欄位維持，不新增 roleStatus 或改 manifest |

PDM 的 v1 與 v2 必須投影同一 active pointer；v1 在 dynamic 後仍保留完整身份與 assignable，不以移除 inactive 列替代 roleStatus。PDM evaluator 依 v2 status 排除 inactive；v4 有列不能單獨代表某 capability Allow。此項是雙端必驗前提，違反時回送 producer；不修改已套用 029。

### 4.1 current／history header 與角色映射

| DB 欄位／群組 | 驗證及使用 |
|---|---|
| contract_version／application_id | 精確 owner contract、ai-pdm；不接受 client 自選來源 |
| catalog_version／catalog_sha256／published_at | 完整版本、64hex digest、合法時間；所有列 header 一致 |
| publication_format／canonicalization_version | legacy-static-v1／legacy-artifact-v1，或 dynamic-policy-v1／jenfu.canonical-json.v1，精確成對 |
| role_schema_id／baseline_role_identity_hash／protected_policy_hash／registry_hash | dynamic 必填，符合已審查 consumer profile；legacy 新欄位的 null 規則沿 producer |
| role_identity_hash | 當前完整身份重算；允許合法新增 custom 造成變化，不能當固定 readiness 值 |
| activation_generation | current 為 bigint 範圍非負十進位字串；history 依 producer 的版本／base tuple，不假造 current generation |
| display_order／stable_role_id／role_code／display_name | 0..N-1、唯一身份／名稱、九起始 prefix＋custom append；與歷史身份一致 |
| role_status | active/inactive；完整 tombstones，system_admin 必須 active |
| assignable／risk／subject_kind／recommendation_allowed／delegation_allowed／allowed_scope_kinds／assignment_tier／metadata | 全量驗證 builtin 或 custom 模板，不能只以 ID/name 對上就接受 |
| permissions／role_definition_hash | 完整 canonical payload 重算，不把 checkbox 摘要作可信 payload |
| history lifecycle／base tuple | lifecycle 作曾生效來源驗證；base tuple由PDM啟用流程使用，OrgMaster不需讀它；未啟用publication不能供任用 |

傳輸 DTO：
- 外部新 dynamic snapshot 使用可辨識的 `orgmaster.external-role-catalog.v2`；sourceKind=`contract-publication`，記來源物件、publication 格式及 hash binding，角色既有 `status` 映射 role_status。legacy V1 保持原 shape／bytes；新 reader 同時支援兩者。
- server 內完整可信 payload 與對 browser 的 role metadata 分離；browser 不持有歷史驗證上下文、registry authority 或 readiness 寫入能力。
- 已有封閉 role-capability projection V2 不直接塞欄位；一般入口用治理 V2 metadata status，必要投影另以 §4.5 V3 交付；legacy 讀取保持。
- 不改寫舊 publishedVersions 的外部 snapshot、snapshotHash、任用 code/name/catalogVersion、audit chain；新發布才使用新 DTO。display 姓名可來自現有人員資料，不能改歷史身份證據。

### 4.2 hash 與信任

legacy current 的 v5/v6/v7 保留現有 exact artifact deep equality 及原 hash；既有 legacy history allowlist／fixture 保留其已支援範圍。不能把 dynamic 失敗當成讀 legacy 的理由。

dynamic 依 producer 的 canonical-json.v1 重算 roleDefinitionHash、完整 roleIdentityHash 及 contentHash；ASCII 排序／UTF-8／metadata null／roleStatus 都須一致，不用 localeCompare 或 jsonb::text 另算。OrgMaster 的已審查 consumer profile 持有合法 baseline 身份、protected/reference-only/explicit-deny 基線及 registry binding；不能從未核實 current 自動學習 trusted baseline。profile 的固定內容變更回到 owner 契約審查；一般 custom／33 editable 能力變更不要求每個新版本都部署 OrgMaster。

canonical 實作及 consumer profile 必須由 OrgMaster 自己的受控來源／artifact 交付，與 producer 測試向量對照；不能在 runtime 或 release recipe import sibling checkout 作執行輸入。

history 按 persisted assignment／delegation 的 catalogVersion 批次查 immutable publication，驗完整 payload、唯一 version→hash 及原角色快照。既有任用未存 hash 時使用此唯一 binding，不批量回填；client expected hash 不是歷史證據。新的 command 記錄 expected version/hash，snapshotHash 及 audit 保留 source binding。

### 4.3 完整 DTO schema

本節是後續實作契約，本輪不建立程式／JSON。新DTO為closed object（additionalProperties=false），必填欄不可省略，nullable明寫null。Hash=lowercase 64hex；BigintString為非負十進位字串且<=9223372036854775807，不經Number。Id沿既有穩定ID；Time為合法UTC ISO instant。JSON duplicate key、unknown欄、U+0000／孤立surrogate拒絕，metadata number只允許safe integer。Reason NFC/trim後1..240 Unicode scalar。新commandId由client生成lowercase UUID；結果查詢亦支援歷史非UUID commandId，UTF-8<=200bytes並encode URL segment。

```ts
type CatalogBinding = {
  applicationId: 'ai-pdm'; catalogVersion: string;
  catalogSha256: Hash; activationGeneration: BigintString;
};
type PublicationHeader = {
  contractVersion: 'jenfu.platform-entitlement.v1'; applicationId: 'ai-pdm';
  catalogVersion: string; catalogSha256: Hash; publishedAt: Time;
  publicationFormat: 'legacy-static-v1' | 'dynamic-policy-v1';
  canonicalizationVersion: 'legacy-artifact-v1' | 'jenfu.canonical-json.v1';
  roleSchemaId: string | null; baselineRoleIdentityHash: Hash | null;
  roleIdentityHash: Hash | null; protectedPolicyHash: Hash | null;
  registryHash: Hash | null;
};
type RoleIdentity = {
  stableRoleId: Id; roleCode: string; displayName: string;
  assignable: boolean; risk: 'normal' | 'high' | 'critical';
  subjectKind: 'employee' | 'principal';
  recommendationAllowed: boolean; delegationAllowed: boolean;
  allowedScopeKinds: Array<'workspace' | 'project' | 'global'>;
  assignmentTier: 'app_admin' | 'cross_app_override';
  metadata: Record<string, string | boolean | number | null> | null;
};
type PublishedRole = RoleIdentity & {
  roleStatus: 'active' | 'inactive';
  permissions: Array<{kind: 'page' | 'action'; code: string; allowed: boolean}>;
  roleDefinitionHash: Hash;
};
type VerifiedPublication = PublicationHeader & {roles: PublishedRole[]};
type CurrentCatalogContext = {
  current: VerifiedPublication; binding: CatalogBinding;
  historyByVersion: ReadonlyMap<string, VerifiedPublication>; profileId: string;
};
type CatalogRoleMetadataV2 = {
  stableRoleId: Id; code: string; displayName: string;
  status: 'active' | 'inactive'; assignable: boolean;
  riskLevel: 'normal' | 'high' | 'critical';
  subjectKind: 'employee' | 'principal'; recommendationAllowed: boolean;
  delegationAllowed: boolean; allowedScopeKinds: RoleIdentity['allowedScopeKinds'];
  assignmentTier: RoleIdentity['assignmentTier'];
  metadata: RoleIdentity['metadata']; roleDefinitionHash: Hash;
};
type ExternalRoleCatalogSnapshotV2 = {
  contractVersion: 'orgmaster.external-role-catalog.v2';
  applicationId: 'ai-pdm'; catalogVersion: string;
  sourceKind: 'contract-publication';
  sourceRefs: Array<{path: string; range: string; sha256: Hash}>;
  capturedAt: Time; payloadHash: Hash; catalogSha256: Hash;
  validationState: 'valid'; effectState: 'not-synchronized';
  publicationFormat: 'dynamic-policy-v1';
  canonicalizationVersion: 'jenfu.canonical-json.v1';
  roleSchemaId: 'ai-pdm.role-schema.flexible.v1';
  baselineRoleIdentityHash: Hash; roleIdentityHash: Hash;
  protectedPolicyHash: Hash; registryHash: Hash;
  activationGeneration: BigintString; roles: CatalogRoleMetadataV2[];
};
type ExternalCatalogSnapshot =
  | ExternalRoleCatalogSnapshotV1 // 舊shape不加discriminator、不重算hash
  | ExternalRoleCatalogSnapshotV2;
```

上列Hash／Time／Id／BigintString為驗證後primitive alias。server-only context不能由HTTP反序列化成trusted；browser只拿metadata，不拿registry／historical authority。roles順序即display_order，scope與permissions依producer ASCII排序；role_code→roleCode、risk→risk、metadata SQL NULL／JSON null→null，顯示DTO另映射code/riskLevel/status。

V2 `payloadHash=SHA256(canonical-json.v1({applicationId,catalogVersion,catalogSha256,publicationFormat,canonicalizationVersion,roleSchemaId,baselineRoleIdentityHash,roleIdentityHash,protectedPolicyHash,registryHash,roles}))`。不含capture時間、sourceRefs、generation；同內容重讀不換hash，ABA由generation防止。PDM `catalogSha256`是全permission payload contentHash；Org metadata payloadHash不能代替它。既有facade expectedCatalogPayloadHash繼續指metadatahash，新任用expectedCatalog指完整CatalogBinding。

V2 sourceRefs一筆：path=`postgres:ai_pdm_contract.v_application_role_catalog_v2`、range=`catalogVersion=<exact version>`、sha256=catalogSha256，代表已驗publication引用，不是view DDL bytes hash。historical reference使用history view。

GovernanceDocumentV3保持app/schemaVersion=OrgMaster/3；新GovernanceAssignmentVersionV3保持kind=assignment-governance-v3，externalRoleCatalogs擴為union。舊publishedVersion bytes／snapshotHash、migration及audit不改，不創governance V4或更改v4 SQL的kind條件。新快照preimage維持現行OrgMaster snapshot算法；V2欄位以本節順序建構，PG roundtrip仍用既有persistence canonicalization。**PDM canonical helper不能取代全域commands.canonicalJson**。

GET / browser新envelope=`orgmaster.governance-workspace.v2`，全部必填欄：contractVersion、document（GovernanceDocumentViewV3）、catalogs（union）、catalogBindings（此期僅ai-pdm一筆）、revision、activeVersionId、versions。GovernanceDocumentViewV3沿types.ts的完整V3所有欄，draft／所有published policy之identityLinks使用governancePresentation.ts既有裁剪型別；externalRoleCatalogs改為union，audit加入可選commandResult；其餘versioned policy／assignment／組織欄沿原shape，不從V2 presentation漏掉V3來源／management／outbox。versions沿apiClient.ts原GovernanceVersionSummary九欄（id/kind/versionNumber/publishedAt/publishedByPrincipalId/publishReason/snapshotHash/organizationVersionId/effectState），不新增PII。

workspace與version-detail的GET以`X-OrgMaster-Governance-Contract: orgmaster.governance-workspace.v2`選擇新schema，由新apiClient統一送；未知header值400，缺header只在current及所讀version均legacy shape時沿原response。dynamic／V2 snapshot向舊client回409 GOVERNANCE_CLIENT_UPDATE_REQUIRED，不能篩掉custom／inactive假裝九列。write用body discriminator，不用header替代expectedCatalog；session／原專用privileged DTO保持原版。歷史明細新封套為`{contractVersion:'orgmaster.governance-version.v2',version}`，version沿上述完整sanitized union；原歷史bytes不變。

### 4.4 decoder 與受控 consumer profile

固定v1 SELECT的19欄：contract_version, application_id, catalog_version, published_at, catalog_sha256, display_order, stable_role_id, role_code, display_name, assignable, risk, subject_kind, recommendation_allowed, delegation_allowed, allowed_scope_kinds, assignment_tier, permissions, metadata, role_definition_hash。v2加§4.1的九欄。固定SELECT list，不用SELECT *／client選source；legacy新欄不加入舊hash preimage。

current單SQLstatement、ORDER BY display_order，驗header／publishedAt／generation全列一致、9..64、order=0..N-1、唯一ID/code/NFC名稱及完整hash後才建context。history按所有必要任用／代理／推薦／adoption／選中policy的catalogVersion去重，用ANY($1::text[])分批，每批最多128版，ORDER BY catalog_version,display_order；每版完整驗證。current不在分批時重讀，immutable內容可分批；同version多hash／missing sidecar／identity mismatch拒絕。

dynamic header的roleSchemaId／baseline/full identity／protected／registry全部非null、schema精確flexible.v1；版本為`ai-pdm.role-policy.<lowercase UUID>`。custom ID/code須同UUID映射；完整candidate canonical UTF-8<=1MiB、每role permission最多registry的66 unique key（custom至多33）；builtin新能力仍需scope合格及readonly guards。legacy exact artifact的九列不變、roleStatus皆active、format/canonical精確legacy pair；新增profile欄可null或合法owner header，但不進舊hash／不取代exact artifact驗證。v2 current的generation無論format都必須合法BigintString。

history只SELECT共同role/header欄及`lifecycle`（draft/active/retired）；base tuple為producer metadata的base_version/base_hash/base_generation，僅PDM preview/activation使用，**不加入OrgMaster必要DTO／SELECT或任用權威**。歷史activation_generation不作原版本generation；lifecycle為可變封套，不入contentHash。persisted任用來源需active/retired（曾生效），draft不能供任用。較早已支援v3沿pinned fixture核實，v5/v6/v7各自exact artifact；不簽認unsupported history／不回填新hash。

新增source-controlled `config/catalogs/ai-pdm-role-policy-consumer-profile.v1.json`（本輪僅設計），closed且必填：

| 欄位 | 固定規則／取得方式 |
|---|---|
| contractVersion/profileId/roleSchemaId/canonicalizationVersion | orgmaster.ai-pdm-role-policy-consumer-profile.v1／受控ID／flexible.v1／canonical-json.v1 |
| baselineCatalogVersion/catalogSha256 | owner實際選定且已核實v5/v6/v7其中一版，不默認source v7 |
| baselineRoles/baselineRoleIdentityHash/protectedPolicyHash | 完整九baseline role，dynamic roleStatus=active；固定身份／凍結內容及owner vectors |
| registryPayload/registryHash | producer受控完整registry root，非從未核實DB自動學習 |
| producerSourceRevision/producerArtifacts | 40hex及path/sha256清單，runtime/build不讀sibling checkout |
| canonicalVectors | input、expectedCanonicalUtf8、expectedSha256；原bytes及來源可追溯 |

profile自身digest為exact LF UTF-8 bytes，不寫self-hash。baseline身份preimage=RoleIdentity array；roleDefinitionHash=RoleIdentity＋roleStatus＋permissions；contentHash依DEV-123§5.2的九欄object，candidateCatalogVersion用catalogVersion。registryHash驗完整本地root／vectors。

protectedPolicyHash等於受控profile；builtin protected/reference-only及原allowed=false entries逐值比較，systemAdmin全量比較，custom只33editable true、無false，metadata=null、template精確。**不猜producer未展開的frozenEntries容器編碼**：expected protectedHash及canonical vector由受控package交付，本地重算vector匹配後，再驗候選與同一baseline的structural equality。不能只信header宣告hash。

一般custom／editable／inactive／restore不換profile；schema／registry／protected基線改才換受控profile與compatibility revision。具體SHA／vector bytes是RD取得後凍結的資產binding，不是新產品決策；尚缺producer package可實作decoder／負例，不能完成OM-C1或以占位hash宣告READY。

### 4.5 既有 projection／facade 相容

availability/v2為closed schema，AI-PDM舊workspace聚焦system_admin；保留privileged projection／receipt，只從完整current取已驗system_admin，不把custom塞進systemAdminRole。DEV-123改角色走PDM /role-policies，舊410 mutation不復活。

Org一般指派由governance-workspace.v2/write.v2承接。任職採用facade保留URL／operation及原body欄，新dynamic使用`orgmaster.ai-pdm-role-capability-operation.v2`並增必填expectedCatalog；requestHash/previewHash包含該tuple。回應=`orgmaster.role-capability-operation-result.v2`，closed欄contractVersion、phase=preview/publish、operation、stableRoleId、expectedCatalog、roleStatus、data（原preview／receipt）、requestHash、previewHash（publish為null）；原receipt/resolve-unknown與processing persistence保持。

若Org readonly role projection需status/generation，另用`orgmaster.role-capability-projection.v3`（原v2 shape＋catalogBinding，roles加roleStatus），schema另存availability/v3；不修改v2歷史／向未升級跨appconsumer送breaking shape。普通治理UI不用此投影也可完成主路徑，只有實際使用才建立新schema。

custom無position mapping時不依名稱自動配人，顯示無推薦並可manual指派。推薦/adoption新來源只current active；inactive已有選中來源可取消／撤銷，不能新增或擴張，service按before/after驗removal，不以inactive一概拒絕清除。

### 4.6 固定 contract 選擇／啟動條件

新增server設定`ORGMASTER_AI_PDM_ROLE_CATALOG_CONTRACT=legacy-v1|flexible-v2`，default=legacy-v1、未知值startup拒絕。它是operator明確選擇的契約相容窗口，不是browser輸入／錯誤fallback；query前確定operation模式，transaction內不變。

- legacy-v1沿已核實v1及exact artifacts／pinned history；readiness必NOT_READY，沒有generation不能假造0。新版workspace回catalogBindings=[]，frontend使用原legacy命令／預檢；資料只會是合法legacy，未知dynamic version立即拒絕。
- flexible-v2固定current v2＋history SELECT，source-controlled profile完整才能啟動；legacy current由v2提供真generation，新V2命令同樣適用。view不存在／profile不符／dynamic驗證失敗則503或startup拒絕，不嘗試v1。workspace catalogBindings只有ai-pdm一筆。
- owner READY須證明live consumer設定flexible-v2及exact profile，所有仍服務的reader均相容；設定／文件／startup成功單獨不構成READY。dynamic後不得切回legacy-v1作復原。

這是必要runtime配置面，只有契約切換或profile基線改動才需owner程序；角色增減／能力／lifecycle仍由PDM版本流程處理，不增加每版的operator操作。

## 5. 新任用、既有資料與操作資格

| 操作／資料 | 檢查 |
|---|---|
| read 治理及歷史 | 結構／audit 完整，可信 current＋必要 history；inactive 不造成整份失效 |
| 新增／變更任用、推薦或代理 | current active、assignable、模板／subject／scope／期間合法；不得借 history 選 inactive 或待啟用版本 |
| 既有任用／代理保存與查閱 | 驗原 provenance、身份及來源；不要求舊 roleDefinitionHash 等於 current 能力 hash |
| 撤銷 inactive 指派／代理 | 依 ID 找原資料、驗可信歷史及操作資格；不套「新任用必須 active」條件 |
| 發布一般草稿 | 未變既有 inactive 任用可保留；新增／修改的 grant 在本次 current 下須合格 |
| 改用歷史治理版本 | 既有 continuity gate 保留，逐項驗來源；不能以歷史版本恢復已不合法 Principal、到期任用或停用角色能力 |

一般指派沿現有 verified actor、orgmaster.governance.manage／simulate／publish；role-capability facade 沿現有 app-scoped management grant 路徑，不新增授權捷徑。特權沿 DEV-057 現行 exact human_privileged Principal、direct global、禁止自授及 dedicated surface；ordinary endpoint 不收 system_admin。daily 與 privileged Principal 的業務任用規則維持 v4；workload、body actor、email 或同 Employee 另一 Principal 不取得資格。

主張適用於最終業務資格的「active」由 runtime 判斷；expired／inactive Employee 的歷史紀錄可讀不等於可用。現行 global administrator／published policy continuity 保護維持，不以可編輯草稿授予自己發布權。

## 6. 交易、並行與冪等

本 DEV 保留 persistence 的 READ COMMITTED，因 writer 需在取鎖後讀到已提交撤權。不得全域改 REPEATABLE READ 而削弱既有 actor／lifecycle fence。

一個 OrgMaster 寫入操作：
1. 由 `withActorWrite` 開啟既有 transaction／writer identity fence，核對可信 actor及own audit；先查合法同ID replay，再比較新操作的治理 revision與組織前置。
2. 用該 transaction database 以一個 SQL statement 讀 current v2 全列，驗一致 header／完整 payload；freeze 為本操作唯一 catalog context，包含 tuple(version/hash/generation)、format/profile 及必要歷史。
3. readV3Raw、candidate／command validation、preview、persist、回傳與 audit 使用同一 context；不在同次操作重新讀 active 來拼另一版本。context 不跨請求、Principal 或 transaction 重用。
4. 新任用的 expected tuple 在該讀取時間點比較。已在查詢前啟用新版本則衝突；查詢後 PDM 並行 activate 可讓合法舊版本任用以舊 provenance 完成，但下一次 PDM protected request 讀最新能力／status。
5. actor 在提交前、組織 revision 及 persistence CAS 的 fresh fence 照現行機制重新檢查；凍結 catalog 不凍結 actor admission，也不跨 owner core 取鎖。
6. 任用／治理發布、audit、必要既有 outbox 在同 owner 交易生效。refresh 失敗保留 pending 重試；不得回滾已提交撤銷或擴權保底。

不宣稱兩個 owner 同時 commit 或全域一致 snapshot。read-only workspace 也一次取得完整 current／immutable history context，不能混版。

commandId、reason、治理／組織 revision 及內容 hash 維持；新 dynamic command 的 expected catalog binding 納入冪等內容，legacy command 原 hash 不回算。同 ID 同內容、當前操作資格仍成立時依原結果重播，異內容拒絕；合法已提交 replay 先於「新操作」的 revision／catalog 比較，不能因 current 已換版否認原操作結果。

generic draft/publish 增加唯讀 GET /commands/{commandId}，從既有 immutable audit／publishedVersions 查結果，不新增另一份 command authority。合格的當前治理 manage actor 才能查；回 status=committed/not_observed、commandId、已提交者的 commandHash、auditReference、entityType/entityId、occurredAt，無人員全表或私有 token。not_observed 不代表已證實未提交；client 保留原 ID，資格重新成立後同 ID／同內容重試。查詢失敗顯示依賴失敗，不能重建新 ID。role-capability facade 沿原 receipt／resolve 機制。HTTP 成功不單獨證明下游能力已生效。

### 6.1 完整 command schema

新branch由body.contractVersion分派。legacy無version request僅供legacy catalog；OrgMaster自用命令沿原路徑。ai-pdm dynamic mutation缺新envelope／binding回409 CATALOG_BINDING_REQUIRED，不補造缺欄。原method／Origin／JSON／verified session／資格保持，body上限沿MAX_BODY=1MiB。expectedRevision為governance artifact CAS、expectedOrganizationRevision為組織workspace CAS，不可互代。

```ts
type ManualAssignmentInput = {
  id: Id; applicationId: 'ai-pdm'; employeeId: Id; roleId: Id;
  scope: {kind: 'workspace' | 'project'; value: string};
  validFrom: Time; validTo: Time | null;
  metadata: {sponsorEmployeeId: Id | null; reviewDueAt: Time | null};
};
type DelegationInput = {
  id: Id; sourceAssignmentId: Id; toEmployeeId: Id;
  scope: {kind: 'workspace' | 'project'; value: string};
  validFrom: Time; validTo: Time;
};
type OrdinaryRoleCommand =
  | {type: 'UPSERT_ROLE_ASSIGNMENT'; commandId: Id; reason: Reason;
     value: ManualAssignmentInput}
  | {type: 'REVOKE_ROLE_ASSIGNMENT' | 'RESTORE_ROLE_ASSIGNMENT'
      | 'REMOVE_ROLE_ASSIGNMENT' | 'REVOKE_ROLE_DELEGATION';
     commandId: Id; reason: Reason; id: Id}
  | {type: 'UPSERT_ROLE_DELEGATION'; commandId: Id; reason: Reason;
     value: DelegationInput};
type DraftWriteV2 = {
  contractVersion: 'orgmaster.governance-write.v2';
  expectedRevision: string; expectedOrganizationRevision: string;
  expectedCatalog: CatalogBinding; command: OrdinaryRoleCommand;
};
type PublishWriteV2 = {
  contractVersion: 'orgmaster.governance-write.v2';
  commandId: Id; reason: Reason;
  expectedRevision: string; expectedOrganizationRevision: string;
  organizationVersionId: Id; expectedCatalog: CatalogBinding;
};
type ActiveVersionWriteV2 = {
  contractVersion: 'orgmaster.governance-write.v2';
  commandId: Id; reason: Reason;
  expectedRevision: string; expectedOrganizationRevision: string;
  versionId: Id | null; expectedCatalog: CatalogBinding;
};
type AssignmentValidationV2 = {
  contractVersion: 'orgmaster.assignment-validation.v2';
  expectedCatalog: CatalogBinding; value: ManualAssignmentInput;
};
type AssignmentValidationResultV2 = {
  contractVersion: 'orgmaster.assignment-validation-result.v2';
  status: 'valid' | 'invalid';
  issues: Array<{code: string; path: string; message: string}>;
  catalogBinding: CatalogBinding; payloadHash: Hash;
  effectState: 'not-synchronized'; checkedAt: Time;
};
```

所有object closed；scope沿現有value，不能改為key。ManualAssignmentInput不是完整V3 assignment：server新任用產生code/name/catalogVersion、status=active、basis=manual、subjectKind=employee、targetPrincipalId=null、sources=[]、createdBy/Reason及effectState。不收client的role snapshot、來源／actor／audit。external_specialist仍project-only、有限期間、sponsor及manual direct／不可代理，不因新DTO取消guard。

更新manual僅scope／期間／受控metadata；employee/role/application不改，換人／換role另撤銷及新任用。原catalogVersion/code/name/createdBy/Reason不重寫。position_adoption走qualified facade，system_admin不進OrdinaryRoleCommand。delegation的fromEmployee/application/role/catalogVersion由sourceAssignment／可信history取得；source合法、scope/period包含及delegationAllowed沿原validator，revoked／expired不能新代理。

RESTORE沿DEV-037 ID-only manual ordinary Employee、未到期／active人員與角色／scope；舊catalogVersion由trusted history核實，**不再要求字串等於current**（DEV-058對既有restore版本條件的compatible replacement）。status-only保持provenance，角色restore不執行此command。REMOVE仍revoked-only、無任何delegation引用、只移除draft列，history/audit不刪。REVOKE／REMOVE不套「角色active」新任用條件，仍驗原來源及操作者。

publish與目前active治理版本逐項比對：未變inactive任用可保留；新active／revoked→active／scope擴張／期間延長／新代理為新增授權意圖，需current active與全部資格。縮scope／縮期間／撤銷可maintenance，不可移除position source限制。新draft成功只stage=draft_only；POST versions才發布並啟用治理版本。active-version（含null）保持continuity，舊policy啟用亦逐項比較，不能新增停用角色授權或繞last administrator。

新requestHash精確preimage：
`{contractVersion:'orgmaster.governance-write.v2',operation,actorPrincipalId,expectedRevision,expectedOrganizationRevision,expectedCatalog,payload}`。
operation=patch-draft/publish-version/set-active-version；payload為對應body去contractVersion、expected*、commandId（nested command亦去commandId），保留type、normalized reason、target/value。用新增局部canonical-json.v1及UTF-8 SHA256；不含serverID、時間、結果或commandId，browser不傳generic requestHash。legacy hash不回算；V2撞legacy ID回409 COMMAND_ID_REUSED，不能用legacy窄preimage重播新命令。

### 6.2 成功／結果查詢 schema 與 audit

V2結果附在**既有**GovernanceAuditEventV3的可選commandResult，與domain artifact同交易保存；不新增receipt table或worker。auditEventHashInput對新欄置detail之後納入preimage，缺欄的舊event仍原bytes/hash。結果不存整份document／人員PII／current revision，避免自身artifact revision循環hash。

```ts
type VersionSummaryResult = {
  id: Id; kind: 'assignment-governance-v3'; versionNumber: number;
  publishedAt: Time; snapshotHash: Hash;
  organizationVersionId: Id; effectState: 'not-synchronized';
};
type GenericCommandResult = {
  contractVersion: 'orgmaster.governance-command-result.v1';
  operation: 'patch-draft' | 'publish-version' | 'set-active-version';
  outcome: 'applied' | 'noop'; originalHttpStatus: 200 | 201;
  stage: 'draft_only' | 'published_policy' | 'policy_pointer';
  expectedRevision: string; expectedOrganizationRevision: string;
  expectedCatalog: CatalogBinding;
  result:
    | {kind: 'draft'; entityType: 'roleAssignment' | 'roleDelegation'; entityId: Id}
    | {kind: 'published'; versionSummary: VersionSummaryResult}
    | {kind: 'active-version'; activePolicyVersionId: Id | null};
};
type CommandQueryV1 = {
  contractVersion: 'orgmaster.governance-command-query.v1';
  status: 'committed' | 'not_observed'; commandId: Id;
  commandHash: Hash | null; auditReference: Id | null;
  entityType: string | null; entityId: Id | null; occurredAt: Time | null;
  resultAvailability: 'complete' | 'legacy_provenance_only' | 'none';
  result: GenericCommandResult | null;
};
type WriteResponseV2 = {
  contractVersion: 'orgmaster.governance-write-result.v2';
  commandId: Id; status: 'applied' | 'noop' | 'replayed';
  commandHash: Hash; auditReference: Id; result: GenericCommandResult;
  revision: string; // 此刻CAS，不是原commit的revision
};
type GovernanceError = {
  error: string; issues?: Array<{code: string; path: string; message: string}>;
};
```

closed schema的oneOf強制operation/stage/result配對：patch-draft→draft_only/draft／HTTP200；publish-version→published_policy/published／201；set-active-version→policy_pointer/active-version／200。成功必有同交易audit；noop記outcome=noop、beforeHash=afterHash，domain不變但audit使revision更新。legacy noop無terminal證據，不倒填。

GET `/api/orgmaster/governance/commands/{commandId}`無body／未知query拒絕；當前verified human與governance.manage可查此治理audit。committed時hash/audit/time/entityType非null（entityId可null）；V2完整result，legacy僅provenance/result=null，不造原HTTP/result。not_observed時證據欄全null、resultAvailability=none，HTTP200；不是REJECTED或零commit證明。語法／admission／CAS拒絕不保證寫audit。

query只讀own artifact、驗audit chain及當前OrgMaster資格，**不要求PDMcurrent/history可用**；外部目錄故障仍能確認own commit。own依賴失效503、session401、無資格403。facade／privileged沿專用receipt，不由generic查詢假造processing結果。

同ID／operation／actor／hash的合法replay回原GenericCommandResult及原HTTP，revision另為現在CAS；仍fresh admission，先於新操作CAS及catalog載入。不同內容／actor／operation409。query合格管理者不等於可代原actor重送。V2 API outer precheck亦須調整，不能在store查audit前先拒舊revision或要求PDMcurrent。

所有回應no-store及原revision header。error沿既有shape；413 oversized、400 malformed、401身份、403資格、409revision/tuple/hash、422inactive/subject/scope/validity、503source。預檢200須看status。UI將原commit結果與新workspace分開，不把draft success或HTTP當PDM能力已生效。

### 6.3 固定鎖順序／context入口

沿withActorWrite：governance mutex→READ COMMITTED transaction及verified writer fence→own artifact/audit／fresh actor→同ID結果檢查→governance/org CAS→一次loadCurrentCatalogContext→validation/mutation/audit result→persist及freshactor/org fence→COMMIT。必要DB serialization沿既有writer，不加跨ownerlock。readV3Raw/persistV3/preview/facade明傳context，不在操作途中再讀active；context不跨請求／Principal／transaction。own envelope read與外部完整validation分兩phase，query/replay只需前者。

authorizeBeforeCommit需用fresh權威而非捕捉原document；READ COMMITTED取鎖後看到已提交撤權，submission前Principal/lifecycle fence沿既有DBwriter，凍結catalog不凍結admission。不宣稱排除所有同時事件。CatalogBinding以單SQLstatement讀取時點為準，非transaction BEGIN snapshot：先activate→SELECT拒舊tuple；先SELECT→activate可commit原provenance，PDM下一操作依新status。

unknown transport查原ID／同ID同payload重送，不能force或新ID盲重送。JSON local mode僅隔離用途，mutex/atomicfile不等價PG transaction／freshfence。

## 7. 正常 UI／API 交付

現有 `/api/orgmaster/governance`：
| 路徑 | 本 DEV 行為 |
|---|---|
| GET / | catalog 列出合法 custom／inactive，document 歷史不被 current 覆寫；可信資料載入失敗明示 |
| POST /validate/assignment | 新任用預檢，回 catalog version/hash（dynamic 加 generation binding）；預檢不授權 |
| PATCH /draft | 沿既有 command，server 重驗 expected catalog binding，寫草稿；inactive 原資料可撤銷 |
| POST /versions、/active-version | 維持發布及 continuity；逐項驗新增／既有意圖，保存 source snapshot |
| GET /commands/{commandId} | 當前 manage 資格下查 generic command 的既有 audit 結果，read-only committed/not_observed；不是任用入口 |
| /applications/ai-pdm/role-capabilities/{id}、preview／publish／receipt | 沿既有任用／職位來源 facade，支持 custom、history及 inactive 撤銷，保留各自 reason/CAS/receipt |
| 既有特權入口 | system_admin 專用，不加 capability checkbox 或 ordinary fallback |

完整 body／result／snapshot schema已在§4.3及§6.1–6.2，固定test surface在§10.1；client snapshot／stale hash不能作authority。401身分、403資格、409revision／binding、422inactive／subject／scope、503source語意保持；預檢200看valid/invalid，不構成授權。

UI Entry Contract：
- 一般治理管理者由 OrgMaster 正常工作台的「角色指派」入口進入，角色列看名稱／系統及必要狀態；新角色可加入人員、設定期間／scope，再由發布入口檢視差異並發布。
- inactive 列保留指派人員，標示「角色已停用」，停用新增控制，合格管理者仍可查看／撤銷。沒有可信全 scope 影響人數時不猜值，也不把 effective=0 顯示成沒有指派。
- 特權在既有專用入口以 Principal 計數。歷史版本顯示原名稱／期間／原因，current 狀態另作提示。
- 正常／loading／空資料／依賴失敗／衝突／無權限狀態皆可辨；載入失敗不是空白矩陣。純展示 last-known 資料須帶時間，不能操作或參與任用 precondition。
- 不加新常駐解說卡或多層確認；提醒與受影響角色放在一起。恢復可能重新授權的提示沿 source policy 流程，OrgMaster 可檢視原人選。
- 1440×900、1024×768 桌面依既有 mutation gate；390×844 沿 DEV-033 唯讀，可看 inactive／歷史，不能為此功能打開手機 mutation。鍵盤／focus／label 可操作，無可見未預期錯誤、水平溢出或資料異常空白。

## 8. OrgMaster 相容宣告與資料庫邊界

OrgMaster 擁有一筆 ai-pdm/orgmaster 的 readiness 狀態，對外發布 `orgmaster_contract.v_ai_pdm_role_policy_compatibility_v1`。其 storage 放 orgmaster_core，精確 view 放 orgmaster_contract；不讀任何 sibling core。

| 欄位 | 契約 |
|---|---|
| application_id／consumer_id | ai-pdm／orgmaster，唯一一列 |
| contract_version | ai-pdm.role-policy-consumer-compatibility.v1 |
| compatibility_revision | 非負 bigint，傳輸十進位字串；owner 更新遞增，client 不能指定生效值 |
| supported_publication_format | dynamic-policy-v1 |
| supported_canonicalization_version | jenfu.canonical-json.v1 |
| supported_role_schema_id | ai-pdm.role-schema.flexible.v1 |
| accepted_baseline_role_identity_hash／accepted_protected_policy_hash | 已核實、固定的 consumer profile；不綁會變動的完整 roleIdentityHash |
| consumer_source_revision | 有效 consumer 的 source binding |
| enablement_ref | source-bound owner enablement 證據；初始 NOT_READY 可空，READY 必填 |
| readiness | NOT_READY／READY；初始 NOT_READY |

只由 OrgMaster owner migrator 維護；runtime 只讀，無 UPDATE／DDL；PDM runtime 只授此 view 精確 SELECT／必要 USAGE。PUBLIC／非相關 sibling 拒絕；不設 admin UI、heartbeat／lease worker 或風險人工核准。

READY 的前提：來源／profile 可追溯、真實 legacy＋dynamic consumer／history／inactive／custom 案例、各 live runtime/source 相容證據、無仍接流量的 static-only reader，以及 owner enablement binding。單一 marker、合成 PASS、git HEAD 或文件狀態不能替代以上證據。PDM rollout DISABLED／ENABLED 與最後 activation 由 PDM owner 管理；不由 OrgMaster browser 寫入。

只追加 OrgMaster 自有 forward migration 建立 readiness storage/view／manifest與最小 ACL；本輪不占 ordinal、不建立 SQL、不修改 applied migrations。v4 grants 契約維持。若實作發現必要欄位或既有 view 語意必須變更，先收斂新版本及相容窗口，不能直接改已套用 029 或藉此進 sibling schema。

### 8.1 確定的 DDL 設計／owner 更新

只新增 `orgmaster_core.ai_pdm_role_policy_compatibility`一表、一versioned view；無新授權table、worker、RLS租戶規則或SECURITY DEFINER寫入API。該表為單一app/consumer技術相容狀態，無人員PII，owner-only ACL已足夠。以下是設計schema，不是本輪執行SQL：

```sql
CREATE TABLE orgmaster_core.ai_pdm_role_policy_compatibility (
  application_id text NOT NULL CHECK (application_id = 'ai-pdm'),
  consumer_id text NOT NULL CHECK (consumer_id = 'orgmaster'),
  contract_version text NOT NULL
    CHECK (contract_version = 'ai-pdm.role-policy-consumer-compatibility.v1'),
  compatibility_revision bigint NOT NULL DEFAULT 0 CHECK (compatibility_revision >= 0),
  supported_publication_format text NOT NULL CHECK (supported_publication_format = 'dynamic-policy-v1'),
  supported_canonicalization_version text NOT NULL CHECK (supported_canonicalization_version = 'jenfu.canonical-json.v1'),
  supported_role_schema_id text NOT NULL CHECK (supported_role_schema_id = 'ai-pdm.role-schema.flexible.v1'),
  accepted_baseline_role_identity_hash text NOT NULL CHECK (accepted_baseline_role_identity_hash ~ '^[a-f0-9]{64}$'),
  accepted_protected_policy_hash text NOT NULL CHECK (accepted_protected_policy_hash ~ '^[a-f0-9]{64}$'),
  consumer_source_revision text NOT NULL CHECK (consumer_source_revision ~ '^[a-f0-9]{40}$'),
  enablement_ref text NULL CHECK (enablement_ref IS NULL OR length(btrim(enablement_ref)) BETWEEN 1 AND 2048),
  readiness text NOT NULL DEFAULT 'NOT_READY' CHECK (readiness IN ('NOT_READY','READY')),
  consumer_profile_sha256 text NOT NULL CHECK (consumer_profile_sha256 ~ '^[a-f0-9]{64}$'),
  registry_hash text NOT NULL CHECK (registry_hash ~ '^[a-f0-9]{64}$'),
  enablement_binding jsonb NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (application_id,consumer_id),
  CHECK ((readiness = 'NOT_READY' AND enablement_ref IS NULL AND enablement_binding IS NULL)
    OR (readiness = 'READY' AND enablement_ref IS NOT NULL AND enablement_binding IS NOT NULL
      AND jsonb_typeof(enablement_binding) = 'object'
      AND COALESCE(enablement_binding->>'contractVersion' = 'orgmaster.ai-pdm-role-policy-enablement.v1', false)))
);
CREATE VIEW orgmaster_contract.v_ai_pdm_role_policy_compatibility_v1 AS
SELECT application_id, consumer_id, contract_version, compatibility_revision,
       supported_publication_format, supported_canonicalization_version,
       supported_role_schema_id, accepted_baseline_role_identity_hash,
       accepted_protected_policy_hash, consumer_source_revision, enablement_ref, readiness
FROM orgmaster_core.ai_pdm_role_policy_compatibility;
```

SQL CHECK使用COALESCE避免缺discriminator時SQL NULL通過。其餘binding欄以owner typed validator核對，不另加複雜JSON trigger。PK＋固定app/consumer CHECK即唯一一筆，不增多餘索引／sequence。owner更新用同交易SELECT FOR UPDATE、核對expected compatibility_revision、profile／schema／baseline/protected、source與evidence，再UPDATE revision=revision+1（bigint overflow拒絕）；row缺失拒絕，不能runtime INSERT補生。migration只初始revision0/NOT_READY，不自動READY。

enablement_binding必填封閉schema：
`{contractVersion:'orgmaster.ai-pdm-role-policy-enablement.v1',consumerSourceRevision,consumerProfileSha256,registryHash,roleSchemaId,baselineRoleIdentityHash,protectedPolicyHash,producerSourceRevision,producerConsumerEvidence:{ref,sha256},liveConsumerEvidence:{ref,sha256},ownerReceipt:{ref,sha256},enabledAt}`。
consumerSourceRevision／producerSourceRevision為40hex、digest64hex、time UTC、ref非空<=2048；欄位與同列一致，公開compatibility_revision仍為非負PG bigint。ownerReceipt證明有效consumer/source及精確profile，live evidence盤點所有仍服務的consumer含舊revision，不含static-only，DUAL至少D1/D2；不存在證據時仍NOT_READY。owner更換profile或withdraw readiness必須revision+1；READY→NOT_READY清enablement_ref/binding，歷史owner receipt保留immutable，不建永久READY marker。實際source digest/ref是實作／owner程序凍結binding，不是本輪新的人工核准點。

ACL／manifest（實作必須原生負例確認）：
- table/view OWNER=`jenfu_orgmaster_migrator`。新table對PUBLIC及runtime／siblings REVOKE ALL，無inherited或column DML例外；本DEV只新增精確view SELECT及必要orgmaster_contract USAGE，不授readiness core/table讀寫或EXECUTE。OrgMaster runtime既有owncore writer權保持，不能為此撤整個schema ACL；PDM無跨ownercore權。PDM migrator沿既有精確manifest讀ACL，**不給readiness table寫權**。
- view PUBLIC、Platform及無關sibling REVOKE ALL；GRANT SELECT僅 `jenfu_orgmaster_runtime,jenfu_ai_pdm_runtime`；owner本身可讀。不得CREATE ROLE或把runtime加入migrator，已有角色缺失abort並回owner，不偷偷補IAM。
- 新source manifest位置 `contracts/orgmaster-ai-pdm-role-policy-compatibility/v1/contract-manifest.json`，schemaVersion=`orgmaster.role-policy-consumer-compatibility-manifest.v1`、contractVersion與view相同、owner=orgmaster、consumer=ai-pdm、view全名、columns按SELECT的12欄、key=[application_id,consumer_id]、readinessInitial=NOT_READY、writeAuthority=owner-only。既有 `orgmaster_core.contract_manifest`插入contract_id=`orgmaster.ai-pdm-role-policy-compatibility-v1`及version，signature_sha256=exact LF manifest bytes SHA256，payload_sha256=NULL；經現有versioned manifest projection讀取，不另公開core。
- private registry_hash／profileSha／enablement_binding／updated_at不投影，public欄位不額外加key，與DEV-123 §7.2逐欄一致。versioned DB bigint仍是PG bigint；DTO轉十進位字串，PDM既有reader自行decode。
- grants v4的19欄、manifest／029、現有position來源／Principal fence全部不變。新audit結果只擴artifact JSON，不新增SQLcolumns或改grant view。

migration logical name=`dev058_role_policy_consumer_compatibility_v1`。本輪讀到repository已有032/033候選；不可把031當repo最大值，實作當時依index/branch重新選下一未使用ordinal（目前下個候選034，**不保留／占用**）。一個forward-only交易，依README DB-CHANGE header指定own兩schema、contract-impact新view、compatibility=additive；取既有migration ledger／lock並驗applied prefix，檢查existing角色／profile／manifestdigest，建表/view/ACL及初始NOT_READY。不改appliedmigration、authorities、employee／assignment、active catalog或非ownschema。local migration需跑check:db-boundary及PG；正式owner profile是否已准新ordinal屬後續release gate，本期不能把031受控release模式直接擴到034。

既有view／table若存在但shape/owner/ACL不符，abort而非CREATE OR REPLACE覆蓋；修正只能後續forward migration。migration失敗交易rollback；已安裝後維持NOT_READY也可服務legacy。沒有down migration、資料cleanup或自動刪除。這是新增相容事實，不是人員授權控制。

## 9. 相容窗口、失敗恢復與可用性

| 狀況 | 行為 |
|---|---|
| producer 尚未具 v2/history | 保持明確 legacy-only 模式，readiness NOT_READY；以已核實 legacy 證據讀舊 contract。不能因 dynamic 查詢錯誤降級 |
| 兩端已支援，current 尚 legacy | 新 reader 驗原 hash；dynamic 只能在 rollout 前置成立後啟用 |
| dynamic current 已生效 | current 及歷史全走相符 format，禁止 static-only downgrade／multi-version union |
| 雜湊／身份／sidecar 不完整 | 拒絕相關讀取／mutation，保持最後已提交資料，顯示依賴失敗 |
| catalog／治理 revision 衝突 | 保留未提交輸入，重讀及重新預檢；不 force overwrite |
| 交易失敗或結果未知 | 失敗無半寫入；未知查原 ID，不能推測未 commit |
| OrgMaster 管理 API 停機 | 配人／發布暫停；PDM 沿既有 SQL contract 操作，不增加 HTTP 回呼 |
| shared DB／IdP／必要 current contract 故障 | 仍可能拒絕操作；沒有 stale entitlement 或本地 ACL 保底 |

相容順序是 producer v2/history 在 rollout 未啟用狀態可供讀取 → consumer 能處理 legacy/dynamic 及完整歷史 → 真實雙端及 live source 證據 → owner readiness／PDM enablement → dynamic active。這是依賴條件，不是本輪正式部署操作表。既有 snapshot／history 永久只讀；內容需修正透過新的 owner 版本。

## 10. RD 交接與階段

| 切片 | 目的／輸出 | 退出條件 |
|---|---|---|
| OM-C1 | format decoder、驗證 profile、可信 current／history context、版本化 snapshot DTO | 正常／tamper／legacy 負例；沒有 active fallback |
| OM-C2 | 新任用與既有完整性分離、操作內 catalog context、scope／period／Principal／history | inactive 可讀可撤銷；並行及冪等不變條件 |
| OM-C3 | own readiness contract／NOT_READY 預設及最小 ACL 設計 | 實際 schema／manifest／ACL 驗證；未經 owner evidence 不 READY |
| OM-C4 | 正常 UI、發布、角色生命週期及雙端 Allow／Deny | QA058 真實層級及 peer QA123-29/30/44 的必要閉環 |

本輪已完成RD Implementation Ready工程契約：§4 DTO/profile、§6 command/readback/transaction、§8 DDL/manifest/ACL、§10固定surface/runner及peer對照。下一步須由使用者要求產品RD後才開始OrgMaster切片；producer資產與雙端證據按各slice取得，不擴他方scope。

機會成本控制：不建立角色需求服務、額外 queue、permission service 或通用跨 app framework；現有 transaction／API／UI 能承接的責任直接擴充。必要新 context 的作用是避免同一操作混版；必要 history adapter 的作用是保留合法任用；readiness contract 是 DEV-123 的既定啟用依賴。

### 10.1 實作檔案、順序與固定驗證入口

本節是完整 RD execution contract；**本輪仍只寫文件，沒有實作授權**。使用者後續明確要求OrgMaster RD後，才可執行OM-C1→C2→C3→C4；同範圍續行不重問工程命名／machine binding。雙端runtime、對方資料mutation及正式owner enablement另需人類指定專案／動作／環境，不能由manifest或本spec自行授權。

| 順序 | 後續修改／新增surface | 固定輸出及gate |
|---|---|---|
| OM-C1 | 修改 `server/aiPdmRoleCatalogRepository.ts`、`applicationRoleCatalogRegistry.ts`、`src/governance/aiPdmCatalog.ts`；新 `src/governance/roleCatalogContract.ts`／`roleCatalogCanonical.ts`、profile JSON | closed decoder／profile／vectors／metadata V2；current一次讀，批次verified history。profile未交付不能完成此slice |
| OM-C2 | `src/governance/types.ts,commands.ts,validation.ts,assignmentSurface.ts,governancePresentation.ts,apiClient.ts`；`server/orgmasterGovernanceStore.ts,orgmasterGovernanceApi.ts,employeeRecommendationService.ts,aiPdmRoleCapabilityStore.ts` | write/query schema／audit-result／操作context／existing-vs-newgrant驗證；preserve03xx／DEV-037 restore/remove，ordinary/privileged、replay、race原生負例 |
| OM-C2 特權共用reader | `server/privilegedAssignmentStore.ts`及實際current reader呼叫點（以rg定位） | 只傳verified dynamic中的凍結system_admin；已有special DTO／receipt／資格不改，不能順手改AAL或Privileged模型 |
| OM-C3 | `db/migrations/<next>_dev058_role_policy_consumer_compatibility_v1.sql`／README；新compatibility manifest／schema；既有db-boundary新增物件allowlist | owner-only表/view，initialNOT_READY，manifest exact，read ACL negative；不改v4或appliedSQL |
| OM-C4 | `src/components/GovernanceCenter.tsx,.css`及原角色指派表單／preview；closedcontracts新增局部schema及availability/v3（有使用該projection才建立） | normal入口可選custom，inactive可見／撤銷；pending原ID查詢，publish確認及viewport／keyboard；勿改頂列帳號選單 |
| 驗證 | existing相應.test.ts加案例；新 `server/aiPdmDynamicRoleCatalog.test.ts`、`server/orgmasterGovernanceCommandQuery.test.ts`；新 `scripts/qc-dev-058-{contract,postgres,browser,dual}.mjs`及必要runner單元負例 | 按下列固定入口執行／輸出，不能no-tests、skipped或mock冒充上層PASS |

新增模組只負責canonical格式及closedDTO、單一reader中的context/history維持既有責任，不新增通用跨appframework／repository層。檔案在實作時若既有名稱有差異，以同責任面收斂並更新此表，不擴scope。persistence transaction不改隔離層級；必要hook僅傳既有transactiondb/context，不替換writer／lifecycle權威。

**後續package.json確定新增scripts；本輪package未修改：**

| 固定入口 | 實作後對應命令 | 證據範圍 |
|---|---|---|
| `npm run test:dev-058` | `vitest run server/aiPdmRoleCatalogRepository.test.ts server/aiPdmRoleCatalogRepository.v7.test.ts server/aiPdmDynamicRoleCatalog.test.ts server/applicationRoleCatalogRegistry.test.ts server/orgmasterGovernanceStore.test.ts server/orgmasterGovernanceApi.test.ts server/orgmasterGovernanceCommandQuery.test.ts server/orgmasterAssignmentLifecycle.test.ts src/governance/aiPdmCatalog.test.ts src/governance/commands.test.ts src/governance/validation.test.ts src/governance/assignmentLifecycle.test.ts src/components/GovernanceAssignmentActions.test.tsx server/privilegedAssignmentStore.test.ts server/orgmasterGovernanceWriteActor.test.ts src/governance/assignmentSurface.test.ts` | U/API，精確16檔，新增檔缺失則fail，沒有passWithNoTests |
| `npm run qc:dev-058:contract` | `node scripts/qc-dev-058-contract.mjs` | own schema／profile vectors／manifest／legacy bytes及payload preimage |
| `npm run qc:dev-058:postgres` | `node scripts/qc-dev-058-postgres.mjs` | task-owned PG，own DDL／ACL／transaction／race／audit；producer為simulator時明示PG-simulator |
| `npm run qc:dev-058:browser` | `node scripts/qc-dev-058-browser.mjs` | OrgMaster正常UI＋真正本ownermiddleware/store，viewports／pending／errors；不證明真PDM |
| `npm run qc:dev-058:dual -- --manifest=<path>` | `node scripts/qc-dev-058-dual.mjs --manifest=<path>` | explicit授權後兩個真owner正常入口、至少D1/D2，無simulator替代 |
| `npm run qc:dev-058` | `npm run test:dev-058 && npm run qc:dev-058:contract && npm run qc:dev-058:postgres && npm run qc:dev-058:browser` | 順序fail-fast本地gate，**不含DUAL／PROD**；不得用aggregate PASS完成OM-C4雙端 |
| 既有 `npm run check:db-boundary`、`npm run build` | 沿目前scripts | SQLboundary及tsc/Vite；無typecheckscript、build不替代behavior |

runner對不完整fixture／缺腳本／scope不符／cleanup失敗exit非零並判BLOCKED或FAIL，不回PASS；啟動前只讀檢查environment，不能自動安裝或下載PG／啟動sibling。所有runner接受 `--output=<OrgMaster/output/dev-058/...>`（預設按層級與UTC runId），生成append-only `orgmaster.dev058.validation-evidence.v1`。body含runId、sourceRevision＋dirtyFiles與testedFileHashes、suite、profileHash、caseId/status/evidenceLayer、catalog current/history tuples、actorAlias／非敏感Principal reference、artifact refs/hashes、effectivefailure、cleanup及started/finishedAt。狀態PASS/FAIL/BLOCKED/NOT_RUN明確；任何既有有效證據重用保留原時間/source/layer，不重新簽成當前UI／DUALPASS。

PG runner重用 `scripts/lib/dev014-disposable-postgres.mjs`的 `startDisposablePostgres/stopDisposablePostgres`（targetClass=task-owned-local、127.0.0.1、一次性cluster），已有runtime不明就不占用／關閉。它只安裝OrgMaster自有migration及task-owned fixture；外部catalog simulator使用own test namespace與test-only注入Queryable，不建／寫ai_pdm_core或冒充對方native migration。測試producer SELECT adapter只供隔離runner，正式reader固定contract名稱。真實跨owner view/native producer的交易證據歸DUAL，由各owner交付，不沿用會建立siblingcore的歷史DEV-057fixture。

browser runner先記project／purpose／port／process tree／cleanup及tab ID，安全重用同任務runtime，否則啟動loopback task-owned preview；使用現有local startup配置或等效隔離Vite參數，資料目錄限taskowned，不能指向repo/data或正式設定。正常入口從工作台到角色指派，不以evaluate API單點當UI。QC可使用已啟用CUA surface操作同tasktab收集畫面；synthetic auth／JSON persistence需標UI-harness，不能通過PG/DUAL。最後finally只清理verified task-ownedprocess/tab並確認port釋放，既有5000／userwindow不碰。

DUAL manifest schema=`orgmaster.dev058.dual-owner-input.v1`：
`{source:{orgmaster,aiPdm},profiles:{consumerSha256,registryHash},targets:{orgmasterOrigin,aiPdmOrigin},authorizationReferences,fixtureAliases,evidenceOutput}`；
source兩端各40hex／testedinputs，origin為exact已核對URL，authrefs可追到人類原訊息及允許兩owner動作／環境，fixture只含隔離aliases與透過正常ownerflow建立的IDs，不含tokens/passwords。manifest不能代表授權。runner不建／啟動／migration／修改對方repo，只在已授權同環境操作兩端正常UI/API；不可得則雙端BLOCKED。連續dynamic D1（新增C1、至少一項合法能力及配人）→D2（能力變更）→D3（停用）→D4（同ID恢復）閉環，滿足至少兩版要求；race另在隔離fixture用D1/D2表示先後版本，不與此sequence混淆。所有版本tuple與原assignment/audit一一對帳；peer QA123-29/30/44結果由peer owner登錄，不由此runner改對方文件。

### 10.2 與 AI-PDM DEV-123 的對照與交接出口

| producer定案來源 | OrgMaster本文件承接 | 不可互相代替的出口 |
|---|---|---|
| §1.1／§3，九prefix＋custom／64上限／停用恢復／33editable | §3、§4.3–4.4、§5／6.1 | 不新增OrgMaster role editor或PDM配人功能 |
| §5.2–5.3 canonical／v2current與history | §4.3–4.4、OM-C1 | profile/root/vectors須producer受控資產；header hash聲明或名稱對上不夠 |
| §7.2單列compatibility／flexible schema | §8／8.1、OM-C3 | twelve public欄一致，owner-only NOT_READY；dynamic roleIdentityHash不鎖readiness |
| §9 OM-C1..4，history／snapshot race | §5／6.3、QA058-05/06/17/18/19 | READ COMMITTED statement freeze對齊producer允許重疊任用；不引跨corelock |
| QA123-29 trueconsumer、30兩版整合、44生命週期 | QA058-08/12/13/17/18及DUALgate | 真雙端與正式L4仍待owner證據；文件ready不是產品PASS |

開發依賴與未決架構分開：producer registry/profile vectors、actual v2/history、精確schema ACL及true runtime尚未交付，是後續slice進入／驗收條件；本輪已決定處理方式，不以mock／猜hash解缺資產。當producer實際輸出與已定shape或canonical vectors不符，停止相應slice並回owner契約，不放寬decoder。文件可交RD直接依此實作OrgMaster受控切片；目前人類「暫不開始程式實作」限制優先。

Readiness review：資料shape／command結果／history與race／DDL及ACL／migrationboundary／正常入口與固定runner／humanreminders／peer範圍均已收斂，無待裁決P0/P1架構選擇；source資產及runtimegate仍NOT_RUN/NOT_DELIVERED，不是已完成產品。本輪沒有要求模型間架構定案Gate，狀態為RD Implementation Ready，**不是Architecture Finalized／Release Ready或已准READY寫入**。

## 11. 驗收與 QA/QC

保留原 B058-01..08：正常角色入口、真實配人／PDM 判權、inactive 可讀可撤銷、恢復不復活已失效者、可信歷史、非法來源／hash／scope 拒絕、並行兩順序、管理 API 停機隔離。對應 [QA058-01..24](../qa/DEV-058-dynamic-role-assignment-validation-plan.md)。

OrgMaster 與 AI-PDM 不合併 QA 分母；peer QA123-29、30、44 要真實 consumer 層級，local mock不能完成其要求。歷史 PASS 不回寫，本輪全為 NOT_RUN。沒有 runtime／browser／PG 產物，不宣稱獨立 QC、L4、相容啟用或產品完成。

## 12. 後續 scope、停止條件與 release 影響

- 調職待檢視清單 capsule：以既有組織異動及 manual 任用列清單，由人保留／調整／撤銷；不變更授權。第一個動態角色閉環完成且使用者要求後補工程契約，不是 DEV-123 的隱含前置。
- 其他 app capsule：重用 B 分工，取得各 owner versioned 角色契約及人類專案／動作範圍後接入；本期沒有 generic registry 改造。
- 停止相應實作：producer current/history shape 或 identity/protected/profile 無法驗證、grant v4 語意不相容、需要更改 Principal／scope／任職失效模型、需未知 schema ownership／其他專案或正式資料、企圖以 READY marker代替 live evidence。
- Release Impact Note：可能增加 own readiness forward migration、consumer DTO及runtime reader；新 consumer 必須與 producer 格式相容，dynamic 後不能部署 static-only reader。正式 migration／enablement／deploy 另依 owner 既有 release gate；本文件不提供 target、指令、traffic 或 rollback 執行包。

啟動配置新增§4.6契約模式與受控profile輸入；不得把legacy-v1 default當dynamic恢復路徑。

## 13. 文件治理與狀態

沿 [ADR-007 增補](../adr/ADR-007-external-role-catalog-assignment-boundary.md#2026-10-12-b-dev058)，B ownership為 Compatible refinement；dynamic reader／歷史／inactive 是已確認未來產品目標，legacy 格式保護維持。無需新 ADR，不覆蓋 [DEV-057 現行 Principal 契約](DEV-057-identity-and-grant-contract-boundary.md)。

2026-10-12：Brief Ready→RD Contract Ready（同一SPEC/QA24）→本輪RD Implementation Ready。補足closedDTO、三類命令／audit結果查詢、profile資產binding、own readiness DDL／ACL／manifest、固定runner及DEV-123逐項對照。尚無Architecture Finalized／產品QC／Release Ready；AI-PDM只讀，狀態由其owner管理。

文件自查範圍為引用、QA24唯一連續、fence、DTO/preimage/DDL欄位及成熟度一致；結果另記QA§6。這些是RD文件自查，不能代替runtime／DB／UI／雙端正確性；產品案例全部NOT_RUN。

使用思考習慣：#模型建構、#當責、#可驗證性
