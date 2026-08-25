# DEV-027：OrgMaster 權限與審核規則治理契約

文件成熟度：`RD Implementation Complete / QA-QC Passed / Human Confirmed`  
狀態：完成（OrgMaster-only local governance MVP）  
節點類型：交付點  
優先級：P0  
風險等級：High  
日期：2026-08-18  
來源 ID：`USER-2026-08-18-ORGMASTER-AI-PDM-AUTHORIZATION-APPROVAL`  
父任務：DEV-008、DEV-017、DEV-019、DEV-020、DEV-021  
架構決策：`ai-doc/adr/ADR-004-authorization-approval-policy-boundary.md`、`ai-doc/adr/ADR-005-governance-policy-snapshot-boundary.md`

## 1. Outcome

OrgMaster 成為 AI-PDM 未來可引用的權限與審核規則治理中心，但不接管 AI-PDM 的審核交易或產品領域狀態。

- 共用 IAM 是 authentication authority。
- OrgMaster 是 principal mapping、應用角色／permission／scope、delegation 與審核規則的 policy authority。
- AI-PDM 未來仍是 enforcement point、approval runtime、審核交易 audit 與 PDM domain apply authority。

本文件已把 OrgMaster-only Phase 1 Foundation 與 Phase 2 Policy MVP 補成並完成實作。AI-PDM 仍未修改，不執行 migration、deploy 或 release。

## 2. Human Decision Brief

決策日期：2026-08-18  
決策來源：使用者依 HCS `#引導模式` 回覆 `1B 2A`

- `Human Confirmed / 1B`：OrgMaster 管理角色、權限、scope 與審核規則；AI-PDM 保存審核申請／工作項、核駁決策、審核交易稽核及領域套用。
- `Human Confirmed / 2A`：採共用 IAM 的不可變 provider UID；OrgMaster 不保存密碼或 MFA secret。
- `Human Confirmed`：目前只修改 OrgMaster；AI-PDM 僅可唯讀參考。
- Rejected：OrgMaster 接管 approval work item／approve-reject decision／PDM apply；OrgMaster 自建帳號密碼或 MFA authority；用姓名、email、部門或職稱作授權 key。
- `Engineering Confirmed`：目前實作沿用現有 Vite development middleware 與本機檔案能力，建立 local governance MVP；不宣稱這是 production IAM／database 架構。
- `Engineering Confirmed`：治理資料與組織文件 V5／版本工作區分開保存；發布版本內含最小不可變組織快照，依 ADR-005 執行。
- Allowed RD decisions：不改變 schema、API、狀態機、檔案邊界與驗收的前提下，局部函式命名、CSS 細節、測試 fixture 值與元件內部拆分可由 RD 決定。

使用思考習慣：#問對問題、#限制條件、#可驗證性

## 3. Spec Impact Preflight

分類：`Intentional replacement（future direction）`

- DEV-021 已完成的主職、兼任與直屬主管路徑保持有效；DEV-027 只取代其對未來 Auth／簽核的 deferred 假設，不改寫歷史交付。
- ADR-001～003 的職位階層、版本工作區與排版權威不變。
- AI-PDM 現行實作與文件不屬於本輪受控修改範圍；本契約不宣稱 AI-PDM 已採用 OrgMaster policy。
- 未來跨 repo 串接必須另建 integration ADR，並由使用者明確授權 AI-PDM 修改。

## 4. Authority and data ownership

| 事實／能力 | 唯一權威 | 契約 |
| --- | --- | --- |
| 登入驗證、密碼、MFA、recovery | 共用 IAM | OrgMaster 不複製 credential，不從 email 推導身分 |
| IAM subject 與 OrgMaster employee／principal 連結 | OrgMaster | 以不可變 `issuer + subject UID` 唯一對應；衝突或停用時 fail closed |
| 組織、職位、任職與已發布 organization version | OrgMaster | 沿用既有 OrgMaster version boundary |
| 應用角色、permission、scope、有效期間、delegation | OrgMaster | 與組織職務 `Role` 分開；組織資料只能成為明確政策輸入 |
| 審核資格、路由規則、quorum、自審限制、代理規則 | OrgMaster | 回傳版本化 policy resolution，不建立工作項 |
| principal／角色／政策設定異動 audit | OrgMaster | 只稽核 OrgMaster 自身治理設定異動 |
| API enforcement 與領域狀態驗證 | AI-PDM | 未來在敏感操作前消費 OrgMaster policy result；目前不修改 |
| 審核申請、工作項、target snapshot、核駁決策 | AI-PDM | OrgMaster 不持久化、不雙寫 |
| 審核交易 audit、冪等、核准後 PDM apply | AI-PDM | OrgMaster 不接管圖面、BOM、檔案、發布或狀態機 |

稽核必須分成兩種，不可使用模糊的單一 `audit` 宣稱雙方同時擁有同一事實：

1. `Governance Change Audit`：OrgMaster 保存誰在何時變更或發布哪一版身分連結、角色、permission 或審核規則。
2. `Approval Transaction Audit`：AI-PDM 保存誰送出、系統產生哪些工作項、誰核准／駁回、引用哪一版 policy、以及 apply 結果。

## 5. Identity contract（2A）

### 5.1 Stable key

- 授權主鍵是共用 IAM 的 `issuer + subject UID` 組合；UID 必須由 provider 保證在其 issuer 內不可變。
- OrgMaster principal link 至少表達 provider／issuer、subject UID、OrgMaster employee、外部 application、狀態、有效期間與版本。
- email、姓名、工號可作顯示或人工核對證據，但不得單獨授權，也不得在 email 改名時靜默重綁。
- 同一 active `issuer + subject UID + application` 只能對應一個 OrgMaster principal；一個 application principal 也不得同時連到多位 active employee。

### 5.2 Credential boundary

OrgMaster 不得保存或要求：

- 密碼或 password hash；
- MFA／TOTP／WebAuthn secret；
- recovery code／recovery secret；
- 共用 IAM 的 private signing key；
- 可長期重播的登入 token。

Current local MVP 只使用第 18.1 節的 loopback development identity adapter。正式 provider、JWKS／introspection、session 與 key rotation屬Phase 3／4 re-entry，不得在本DEV內假定或宣稱完成。

### 5.3 Failure behavior

下列情境一律不得 fallback 到姓名、email、部門或職稱：

- identity link 不存在、重複、停用、尚未生效或已過期；
- issuer 不符、subject UID 缺失或 token 無法驗證；
- employee、application principal 或必要 organization version 不存在；
- mapping version 衝突或資料完整性驗證失敗。

結果必須為 deny／unresolved 並提供穩定 reason code；不得猜測最接近的人員。

## 6. Authorization policy contract

### 6.1 Model boundary

- `Organization Role`：既有組織中的職務／角色事實，例如研發主管；它不是應用授權本身。
- `Application Role`：特定 application 的權限集合，例如 AI-PDM Reviewer；只能由治理設定明確指派或由已發布政策明確推導。
- `Permission`：穩定的 application action code，不使用 UI 文案作 key。
- `Scope`：工作區、專案、產品、部門或其他受控範圍；未提供必要 scope 時預設拒絕。
- `Delegation`：有來源、代理人、適用 permission／review rule、有效期間與撤銷狀態的明確資料，不等同一般任職。

組織職務、Application Role、Permission 與 Scope 不得共用同一可寫欄位或靠同名字串隱式連動。

### 6.2 Logical operation: permission evaluation

未來 OrgMaster adapter 必須提供等價的邏輯操作；HTTP route 名稱可在 Implementation Ready 決定。

輸入至少包含：

- application code；
- verified `issuer + subject UID`；
- action／permission code；
- resource scope；
- evaluation time；
- 必要的 resource／request context，但不得要求 OrgMaster 直接讀取 AI-PDM database。

輸出至少包含：

- `allow` 或 `deny`；
- 穩定 reason code；
- principal／identity-link reference；
- organization version、policy version 與 mapping version；
- evaluation receipt ID 與 evaluated-at；
- 被採用的 role／scope／delegation reference，必要時為空。

OrgMaster 的 permission evaluation 是 policy evaluation，不是 AI-PDM approval decision。AI-PDM 未來可以保存 receipt snapshot，但不得以 receipt 建立第二套可編輯 policy。

### 6.3 Decision rules

- 只有 active 且已生效的 identity link、application role、permission assignment、scope 與 delegation 可參與判斷。
- 草稿、compare、archived 或未生效的 organization／policy version 不得改變正式結果。
- 缺少任何必要事實、scope 不符、時間過期、版本衝突或 resolver error 都預設 `deny`。
- deny 優先；不得因使用者同時擁有另一個較寬角色而掩蓋明確 prohibition，實際 precedence 必須在 Implementation Ready 固定並測試。
- cache 不得成為第二份權威；revocation 與最大 stale window 必須在進入 live integration 前定案。

## 7. Approval-policy resolution contract（1B）

### 7.1 OrgMaster responsibility

OrgMaster 只回答「依指定 action、scope、requestor 與已發布版本，哪些人具有審核資格、需要幾人、是否允許自審、代理是否有效、以及無法解析的原因」。

邏輯輸入至少包含 application、workflow／action code、requestor stable identity、target scope、submitted-at 與必要 context。輸出至少包含：

- eligible reviewer principal references；
- policy version 與 organization version；
- quorum／sequence 規則；
- self-approval rule；
- 採用的 delegation reference；
- resolved 或 unresolved；
- 穩定 reason code 與 resolver receipt ID。

### 7.2 AI-PDM responsibility in a future integration

AI-PDM 仍負責：

- 建立 request、work item 與 immutable target／impact snapshot；
- 在送出或工作項建立時保存 OrgMaster resolution receipt／policy version；
- 執行 assign、claim、approve、reject、withdraw、cancel、timeout 與通知；
- 保存 approval decision、transaction audit、idempotency 與 apply 結果；
- 在決策或 apply 前依跨 repo integration contract 重新驗證必要權限／資格。

### 7.3 Prohibited persistence in OrgMaster

在 1B 邊界下，OrgMaster 產品資料不得持久化：

- AI-PDM approval request 或 work item；
- approve／reject／withdraw decision；
- PDM target snapshot、domain status 或 apply result；
- AI-PDM transaction audit 的鏡像或雙寫副本。

OrgMaster-only simulator 可使用測試 fixture 或記憶體中的 ephemeral request 驗證 resolver；測試結束後不得成為正式產品資料。

## 8. Version and publication semantics

- 管理者只能在 draft 編輯治理設定；只有明確 publish 後的 immutable policy version 可供正式 evaluation。
- published version 必須能引用其基準 organization version；後續組織草稿不得改變既有 published policy 的結果。
- 修改已發布政策必須產生新版本，不得 in-place rewrite 歷史版本。
- OrgMaster governance-change audit 至少記錄 actor、timestamp、before／after reference、reason、organization version、policy version 與 publish／revoke action。
- AI-PDM 未來保存 submitted-at／evaluated-at 所採用的 receipt 與 policy version；如何處理進行中 request 的 re-evaluation，必須由 future integration ADR 固定。

## 9. Current phase scope

### 9.1 本輪文件升級

- 確認 1B／2A 的產品責任與身分邊界。
- 完整指定 local governance MVP 的 schema、API、檔案、狀態機、migration、recovery、UI、測試與 evidence。
- 建立 ADR-005 與 High-risk QA／QC 計畫。
- 只更新 OrgMaster 開發文件。

### 9.2 Current executable boundary：Phase 1 Foundation

- OrgMaster principal／IAM link、Application Role、Permission、Scope、Delegation 與 published policy version 的基礎。
- OrgMaster 自身 governance-change audit。
- 管理者可理解的 conflict、inactive、draft 與 unresolved 狀態。
- 建立獨立 `orgmaster-governance.v1.json` store、CAS、idempotency、atomic write、tamper-evident audit chain 與 local development identity adapter。

### 9.3 Current executable boundary：Phase 2 Policy MVP

- provider-neutral permission evaluator 與 reviewer-policy resolver。
- OrgMaster-only adapter simulator，以 fixture 驗證 allow／deny／unresolved 與版本 receipt。
- 不保存 approval work item、核駁 decision 或 AI-PDM transaction audit。
- Phase 2 必須等 Phase 1 targeted tests 通過後才可開始；兩個 phase 屬同一 DEV 的順序執行，不是 High-risk bounded batch。

## 10. Out of scope

- 修改 AI-PDM 程式、schema、migration、設定、資料或文件。
- AI-PDM live adapter、shadow mode、雙寫、cutover 或 production traffic。
- OrgMaster 自建 credential／MFA authority。
- relational／remote database、production service account、queue、outbox 或跨 repo event。
- production IAM、credential、遠端 database、backup／restore、availability、deploy、release 或 smoke test。
- OrgMaster 直接執行 PDM 圖面、BOM、檔案、發布或狀態機副作用。

## 11. Acceptance contract

1. 文件與未來實作明確分離 shared IAM、OrgMaster policy authority 與 AI-PDM approval runtime authority。
2. 使用不可變 `issuer + subject UID`；email、姓名、職稱或部門不能成為授權 key。
3. OrgMaster 不保存密碼、MFA secret、recovery secret 或長期登入 token。
4. Organization Role 與 Application Role／Permission 是不同主資料，不因職稱變動自動授予高風險權限。
5. identity conflict、inactive mapping、scope mismatch、expired assignment／delegation、draft policy、missing version 與 resolver error 一律 fail closed 並提供 reason code。
6. 只有已發布、已生效且可追溯的 policy version 能產生 permission evaluation 或 reviewer resolution。
7. self-approval、quorum、delegation、多人與 no-reviewer 都有明確 resolved／unresolved 結果，不猜測審核人。
8. OrgMaster 只稽核自身治理設定；不持久化 AI-PDM work item、核駁 decision、transaction audit 或 apply state。
9. AI-PDM 保持未修改；文件不得把 future contract 宣稱為已完成 integration。
10. 文件完成不代表產品完成；只有後續 RD、QA/QC 與適用 release gate 全部通過才可計入交付完成。

## 12. QA／QC contract

至少覆蓋：

- 相同 email／姓名但不同 UID 不得互相授權；UID 重複映射拒絕。
- inactive、future、expired、revoked link／role／permission／delegation。
- required scope 缺失、跨 workspace／project scope 與 explicit deny。
- draft versus published policy；舊 receipt 的 version pinning。
- requestor 也是唯一 reviewer、自審禁止、多人候選、quorum、代理有效／過期與 no reviewer。
- evaluator／resolver exception、timeout、stale cache 與 version mismatch 均 fail closed。
- simulator 不產生正式 approval transaction 資料。
- governance-change audit 完整；AI-PDM transaction audit 不出現在 OrgMaster persistence。

完整 QA／QC 計畫與 FMEA：`ai-doc/qa/DEV-027-governance-foundation-validation-plan.md`。

實作完成時須提供 targeted tests、full regression、build、migration／recovery、三個 viewport 的真實 browser UI QC、visible-error sweep 與 security boundary evidence；命令與 artifact 路徑見第 21 節。

## 13. RD prerequisite and stop conditions

開始修改產品程式前，必須：

- 以 `C:\VIBE CODING\OrgMaster` 作 canonical source root；本目錄目前不是 Git worktree，因此 RD 必須以第 19 節 allowlist 保護檔案邊界，不得把未列檔案視為可改範圍。
- 先執行第 21 節 baseline test／build；baseline 失敗即停止，不以 DEV-027 掩蓋既有錯誤。
- 保持 OrgMaster-only execution boundary。

遇到以下情況立即停止並回到 PM／Human Decision Gate：

- 實作需要修改 AI-PDM 或直接讀寫 AI-PDM database；
- 需要 OrgMaster 保存 approval work item、核駁 decision、transaction audit 或 PDM apply state；
- 需要 OrgMaster 自建密碼／MFA authority；
- shared IAM 無法提供穩定 immutable UID；
- 多對多 identity conflict 無法 fail closed；
- 需要 production credential、遠端 migration、deploy 或 release。

## 14. Phase and re-entry

| Phase | 邊界 | 進入條件 | 完成證據 |
| --- | --- | --- | --- |
| Phase 0 / Contract | OrgMaster docs only | 1B／2A confirmed | 本 spec、ADR-004／005、QA plan、map 與 DEV 狀態一致 |
| Phase 1 / Foundation | OrgMaster only | `RD Implementation Ready`；baseline clean | principal／role／permission／version／governance audit targeted tests |
| Phase 2 / Policy MVP | OrgMaster only | Phase 1 targeted tests passed | evaluator／resolver／ephemeral simulator tests、build 與 browser QC |
| Phase 3 / Integration | OrgMaster + AI-PDM | 使用者另行授權；integration ADR | shadow／compatibility／rollback／single-authority evidence |
| Phase 4 / Release | 明確 production target | release gate、credential、backup／restore、rollback 授權 | production smoke 與 release evidence |

## 15. Current architecture impact and implementation profile

### 15.1 Confirmed current stack

- Client：React 19、TypeScript、Vite 8。
- Local server：Vite `configureServer`／`configurePreviewServer` middleware。
- Persistence：`data/*.json`、SHA-256 revision、in-process lock、temporary file＋rename。
- Test：Vitest；build gate 為 `tsc --noEmit && vite build`。
- 沒有已確認的 relational database、ORM、production IAM SDK 或 server framework；本 DEV 不新增第三方 dependency。

因此目前可執行版本明確命名為 `local governance MVP`，不是 production authorization service。正式 IAM、database、service authentication、availability 與 AI-PDM adapter 留在 Phase 3／4 gate。

### 15.2 Storage boundary

- 既有 `OrgDirectoryState`、組織文件 V5、workspace manifest 與 version files完全不加 governance 欄位，也不升 V6。
- 新增 `data/orgmaster-governance.v1.json` 作 local governance source of truth；previous snapshot 為 `data/orgmaster-governance.v1.previous.json`。
- governance draft 可引用現行組織資料；publish 時必須把 resolver 所需的最小 organization snapshot 放入 immutable policy version。
- published snapshot 不依賴日後可能被 current-maintenance 改寫的 workspace bytes；不得只保存 mutable `currentVersionId`。
- UI localStorage 不保存 governance authority、identity link、role、policy 或 audit；client state 只作顯示與未送出表單草稿。

### 15.3 AI-PDM compatibility fixtures

不得從另一 repo runtime import 或直接讀取 AI-PDM 檔案。RD 在 OrgMaster `aiPdmCatalog.ts` 保存唯讀 fixture，來源與基準為：

- `C:\VIBE CODING\AI_PDM\src\lib\numbering-permission-codes.ts`，SHA-256 `0560A929FDA8D9123B65CDB51577F89C65E2EBA7CCD327454F403D9E1E647362`；完整複製當下 page／action code arrays。
- `C:\VIBE CODING\AI_PDM\src\lib\pdm-approval-owner-route.ts`，SHA-256 `E0ADDE9998F7737324CB67D73EB60E93E0BC05EFD95EA3A84767C754E1C58986`；approval action fixture 固定為：
  - `numbering.candidate_bundle_review`
  - `numbering.candidate_publication_review`
  - `numbering.drawing_revision_lifecycle_review`
  - `numbering.drawing_revision_impact_review`
  - `numbering.same_drawing_variant_after_release`
  - `numbering.main_drawing_restore`
  - `numbering.obsolete_part_number`
  - `numbering.obsolete_ma_drawing`
  - `numbering.obsolete_part_root`
  - `numbering.release`
  - `numbering.release_missing_ma_confirm`
  - `drawing_package.supplement_review`

fixture 只是 compatibility seed，不代表 live synchronization。外部檔案 hash 改變時，Phase 3 必須做 contract drift review；本 DEV 不自動覆寫已發布政策。

## 16. Authoritative V1 data contract

### 16.1 Root and lifecycle objects

```ts
export interface GovernanceDocumentV1 {
  app: 'OrgMaster'
  schemaVersion: 1
  draft: GovernanceDraftV1
  activePolicyVersionId: string | null
  publishedVersions: GovernancePolicyVersionV1[]
  auditEvents: GovernanceAuditEventV1[]
}

export interface GovernanceDraftV1 extends GovernancePolicyDataV1 {
  basePolicyVersionId: string | null
  updatedAt: string
}

export interface GovernancePolicyVersionV1 {
  id: string
  versionNumber: number
  publishedAt: string
  publishedByPrincipalId: string
  publishReason: string
  snapshotHash: string
  policy: GovernancePolicyDataV1
  organizationSnapshot: GovernanceOrganizationSnapshotV1
}

export interface GovernancePolicyDataV1 {
  applications: GovernanceApplicationV1[]
  identityLinks: GovernanceIdentityLinkV1[]
  applicationRoles: GovernanceApplicationRoleV1[]
  permissions: GovernancePermissionV1[]
  rolePermissionGrants: GovernanceRolePermissionGrantV1[]
  roleAssignments: GovernanceRoleAssignmentV1[]
  delegations: GovernanceDelegationV1[]
  approvalPolicies: GovernanceApprovalPolicyV1[]
}
```

整份 document 的 CAS revision 由 server 對 canonical JSON bytes 計算 SHA-256，放在 response `X-OrgMaster-Governance-Revision`；revision 不寫入 document 形成自我引用。

### 16.2 Identity, role and permission

```ts
export type GovernanceRecordStatus = 'active' | 'inactive'
export type GovernancePermissionKind = 'page' | 'action' | 'system'
export type GovernancePermissionEffect = 'allow' | 'deny'
export type GovernanceRisk = 'normal' | 'high'

export interface GovernanceApplicationV1 {
  id: 'orgmaster' | 'ai-pdm'
  name: string
  status: GovernanceRecordStatus
}

export interface GovernanceIdentityLinkV1 {
  id: string
  principalId: string
  issuer: string
  subject: string
  employeeId: string
  status: GovernanceRecordStatus
  validFrom: string
  validTo: string | null
}

export interface GovernanceApplicationRoleV1 {
  id: string
  applicationId: GovernanceApplicationV1['id']
  code: string
  name: string
  status: GovernanceRecordStatus
  systemDefined: boolean
}

export interface GovernancePermissionV1 {
  id: string
  applicationId: GovernanceApplicationV1['id']
  kind: GovernancePermissionKind
  code: string
  name: string
  risk: GovernanceRisk
  status: GovernanceRecordStatus
}

export interface GovernanceRolePermissionGrantV1 {
  id: string
  roleId: string
  permissionId: string
  effect: GovernancePermissionEffect
}
```

Identity constraints：

- active `issuer + subject` 全域唯一；active `issuer + employeeId` 也唯一。
- `issuer`／`subject` trim 後長度為 1–255，case-sensitive；不得從 email 正規化或合併。
- `principalId` 一經建立不可變；停用、到期或重綁必須建立 audit，不做 silent replacement。
- link 必須指向 current organization document 中存在的 employee；publish 時再次驗證。

Code constraints：application role／permission code 使用 `^[a-z0-9][a-z0-9._-]{0,79}$`，同 application 內唯一且建立後不可改 code；名稱可改。Seed：

- `orgmaster` system permissions：`orgmaster.governance.manage`、`orgmaster.governance.publish`、`orgmaster.governance.simulate`。
- system role：`orgmaster_admin`，預設只授予上述三項；AI-PDM role templates `pdm_admin`、`rd_manager`、`rd` 建立為空 permission template，避免自動擴權。
- AI-PDM permission catalog 依第 15.3 節建立，但不自動 grant 給任何員工。

`DEV-032 Compatible Amendment / RD Implementation Ready / Product Implementation Not Started`：管理辦法 Current Phase 將在同一 `orgmaster` application 新增 `orgmaster.management_method.create`、`orgmaster.management_method.read_readable`、`orgmaster.management_method.read_draft`、`orgmaster.management_method.edit_draft`、`orgmaster.management_method.manage_read_availability`、`orgmaster.management_method.manage_metadata`。新 seed 的 `orgmaster_admin` 取得六項 allow grant；既有 V1 store 只對 draft 做帶 audit 的 compatible catalog sync，active published snapshot 不自動改變，須重新 publish 後才影響正式 evaluation。穩定 ID、risk、migration conflict 與 negative contract 以 `ai-doc/specs/DEV-032-management-method-system.md` 第 10、18、19 節為權威；DEV-032 實作完成前，本段不得解讀為現行產品已有這些權限。

### 16.3 Scope, assignment and delegation

```ts
export type GovernanceScopeV1 =
  | { kind: 'global' }
  | { kind: 'workspace' | 'department' | 'project' | 'product'; value: string }

export interface GovernanceRoleAssignmentV1 {
  id: string
  employeeId: string
  roleId: string
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
}

export interface GovernanceDelegationV1 {
  id: string
  applicationId: GovernanceApplicationV1['id']
  fromEmployeeId: string
  toEmployeeId: string
  permissionIds: string[]
  scope: GovernanceScopeV1
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string
  reason: string
}
```

- `global` 只匹配同 application；其他 scope 只作 exact kind＋value match，不建立隱含 department hierarchy／wildcard。
- `validFrom < validTo`；role assignment 的 `validTo = null` 代表無預定結束，delegation 必須有 `validTo`。
- delegation 不撤銷來源人的原權限，只增加代理人於指定 permission／scope／時間內的候選能力。
- from／to 不可相同；revoked record 不刪除、不重新啟用，需新增新 delegation。

### 16.4 Approval policy

```ts
export type GovernanceReviewerSelectorV1 =
  | { kind: 'application_role'; roleId: string }
  | { kind: 'organization_role'; organizationRoleId: string }
  | { kind: 'direct_supervisor' }
  | { kind: 'employee'; employeeId: string }

export interface GovernanceApprovalPolicyV1 {
  id: string
  applicationId: 'ai-pdm'
  actionCode: string
  name: string
  scope: GovernanceScopeV1
  reviewerSelectors: GovernanceReviewerSelectorV1[]
  quorum: number
  sequence: 'parallel'
  selfApproval: 'deny'
  unresolvedBehavior: 'deny'
  status: GovernanceRecordStatus
  validFrom: string
  validTo: string | null
}
```

- MVP 只支援 parallel、deny self-approval、deny unresolved；不得用 UI 建立 sequential 或 allow-self 但後端仍要拒絕未知值。
- 同 application＋action＋scope＋重疊有效期間只允許一筆 active policy；重疊直接 validation failure，不用建立 priority。
- `quorum` 為 1–9；resolver 過濾後 eligible reviewer 少於 quorum 即 unresolved。
- `direct_supervisor` 沿用 DEV-021 的主職與直接上級職位語意；根職位、主職缺失、上級空缺、上級多人或只有本人時不猜測。

### 16.5 Organization snapshot

```ts
export interface GovernanceOrganizationSnapshotV1 {
  workspaceVersionId: string
  workspaceRevision: string
  capturedAt: string
  employees: Array<{ id: string; primaryAssignmentId: string | null }>
  departments: Array<{ id: string; parentId: string | null }>
  organizationRoles: Array<{ id: string }>
  positions: Array<{
    id: string
    roleId: string
    departmentId: string | null
    parentPositionId: string | null
    status: 'active' | 'inactive'
  }>
  assignments: Array<{
    id: string
    employeeId: string
    positionId: string
    assignmentType: 'regular' | 'acting'
    validFrom: string
    validTo: string | null
  }>
}
```

不保存 employee name、email 或 UI layout；snapshot 只保留 evaluator／reviewer resolver 所需結構。Publish 只能使用 workspace manifest 的 `currentVersionId` 且該 version 可成功載入；draft／archived／failed version 禁止發布。

### 16.6 Audit and idempotency

```ts
export interface GovernanceAuditEventV1 {
  id: string
  commandId: string
  commandHash: string
  occurredAt: string
  actorPrincipalId: string
  action: string
  entityType: string
  entityId: string | null
  reason: string
  beforeHash: string | null
  afterHash: string | null
  previousEventHash: string | null
  eventHash: string
}
```

- 每次有效 mutation／publish／activate／revoke 在同一 store transaction append 一筆 event；noop 不新增 event。
- `commandId` 全文件唯一。相同 commandId＋相同 canonical payload hash 回 `replayed` 且不重複 mutation／audit；相同 ID＋不同 `commandHash` 回 `COMMAND_ID_REUSED`。
- `eventHash = SHA-256(previousEventHash + canonical event payload)`；載入時驗證整條 chain。這是 local tamper-evident control，不宣稱具備 production non-repudiation。
- audit event 不保存 password、token、MFA secret、完整 request body 或 AI-PDM transaction detail。

## 17. Command, publication and evaluation contract

### 17.1 Draft command union

`PATCH /draft` 只接受以下 command；所有 command 都含 `type`、`commandId`、`reason` 與對應 payload：

- `UPSERT_IDENTITY_LINK`、`SET_IDENTITY_LINK_STATUS`
- `UPSERT_APPLICATION_ROLE`、`SET_APPLICATION_ROLE_STATUS`
- `UPSERT_PERMISSION`、`SET_PERMISSION_STATUS`
- `SET_ROLE_PERMISSION_GRANT`、`REMOVE_ROLE_PERMISSION_GRANT`
- `UPSERT_ROLE_ASSIGNMENT`、`REVOKE_ROLE_ASSIGNMENT`
- `UPSERT_DELEGATION`、`REVOKE_DELEGATION`
- `UPSERT_APPROVAL_POLICY`、`SET_APPROVAL_POLICY_STATUS`

Identity、role、permission、assignment、delegation與policy不存在hard delete command；`REMOVE_ROLE_PERMISSION_GRANT`只移除draft中的join relation，仍須留下audit且歷史published snapshot不變。任何command都必須對current draft執行完整reference／uniqueness／effective-period validation；失敗不得部分寫入、不得增加audit、不得改revision。

### 17.2 Publication lifecycle

狀態轉換：

1. `draft(base = active or null)`：可編輯，不參與正式 evaluation。
2. `publish`：驗證 current organization、publisher、所有 references、identity uniqueness、admin continuity、policy overlap、quorum 與 audit chain；成功產生 immutable version 並把 `activePolicyVersionId` 指向新版本。
3. `superseded`：不是可寫 status；凡不等於 active ID 的歷史 published version由 UI 衍生顯示。
4. `revoke active`：把 active ID 設為 null；所有 evaluation fail closed，但 snapshot 不刪除。
5. `reactivate historical`：指定既有 version 為 active；不修改 snapshot，必須 reason＋確認＋audit。

首次 publish 前，local bootstrap actor 可編輯 draft；publish gate 必須確認該 actor 已有 active identity link，且其 employee 經 draft role assignment 得到 `orgmaster.governance.publish`。不得僅因 dev bootstrap 身分而跳過 publish validation。

### 17.3 Evaluation I/O

```ts
export interface PermissionEvaluationRequestV1 {
  applicationId: 'orgmaster' | 'ai-pdm'
  issuer: string
  subject: string
  permissionCode: string
  scope: GovernanceScopeV1
  asOf?: string
}

export interface PermissionEvaluationResultV1 {
  status: 'allowed' | 'denied'
  reason: string
  receiptId: string
  policyVersionId: string | null
  policySnapshotHash: string | null
  organizationVersionId: string | null
  organizationRevision: string | null
  principalId: string | null
  matchedRoleIds: string[]
  delegationId: string | null
  evaluatedAt: string
  timeSource: 'server' | 'local-simulator'
}

export interface ReviewerResolutionRequestV1 {
  applicationId: 'ai-pdm'
  actionCode: string
  requestor: { issuer: string; subject: string }
  scope: GovernanceScopeV1
  asOf?: string
}

export interface ReviewerResolutionResultV1 {
  status: 'resolved' | 'unresolved'
  reason: string
  receiptId: string
  policyVersionId: string | null
  policySnapshotHash: string | null
  organizationVersionId: string | null
  organizationRevision: string | null
  requestorPrincipalId: string | null
  reviewerPrincipalIds: string[]
  delegationIds: string[]
  quorum: number | null
  sequence: 'parallel' | null
  evaluatedAt: string
  timeSource: 'server' | 'local-simulator'
}
```

API未提供`asOf`時使用server UTC now；local simulator可指定合法ISO timestamp並把`timeSource`標為`local-simulator`。這個override只存在development loopback endpoint，Phase 3 live adapter不得接受caller-controlled authorization time。Receipt為ephemeral response，不寫入governance store。

### 17.4 Permission algorithm

固定順序：

1. 驗證 request shape 與 active policy version；無 active version回 deny。
2. 以 case-sensitive `issuer + subject` 找到一筆當下有效 identity link；零筆或衝突回 deny。
3. 找 employee 當下有效、scope matching 的 role assignments。
4. 展開 role grants；任何 matching explicit deny 立即 deny。
5. 若有 matching allow，回 allow；否則檢查有效 delegation，且來源 employee 本身必須能由直接 role assignment得到該 permission。
6. delegate 命中則 allow 並回 delegation ID；全部未命中回 deny。

不得遞迴 delegation、不得 permission inheritance、不得模糊 scope match。Response receipt 必須包含 active policy ID／hash、organization version／revision、principal ID、matched role／delegation references、evaluatedAt 與 reason code。

Permission domain reason codes：`ALLOWED_ROLE`、`ALLOWED_DELEGATION`、`NO_ACTIVE_POLICY`、`IDENTITY_NOT_LINKED`、`IDENTITY_INACTIVE`、`PRINCIPAL_CONFLICT`、`PERMISSION_UNKNOWN`、`SCOPE_REQUIRED`、`EXPLICIT_DENY`、`NO_MATCHING_ROLE`、`DELEGATION_INVALID`、`POLICY_DATA_INVALID`。

### 17.5 Reviewer resolver algorithm

固定順序：

1. 驗證 requestor identity、active version、application／action／scope。
2. 以 exact scope 優先、global fallback 找唯一 active policy；同 specificity 多筆視為 data invalid。
3. 對每個 selector 建立 employee candidate：application role、organization role、DEV-021 direct supervisor 或 explicit employee。
4. 只保留在requestor同一issuer下有active identity link且當下有效的candidate，依principal ID去重；不同issuer不得猜測或自動轉換。
5. 套用有效 delegation；來源 candidate 保留，delegate 另加入並附 delegation reference。
6. 移除 requestor 本人；若剩餘人數少於 quorum，回 unresolved。

Reviewer reason codes：`RESOLVED`、`NO_ACTIVE_POLICY`、`REQUESTOR_NOT_LINKED`、`POLICY_NOT_FOUND`、`POLICY_CONFLICT`、`NO_PRIMARY_ASSIGNMENT`、`SUPERVISOR_UNRESOLVED`、`NO_ELIGIBLE_REVIEWER`、`SELF_APPROVAL_ONLY`、`INSUFFICIENT_REVIEWERS`、`POLICY_DATA_INVALID`。

Resolver 只回 candidates／quorum／receipt；不得建立或保存 AI-PDM work item／decision。

## 18. Local API and security boundary

### 18.1 Identity adapter

- 新增 `DevelopmentIdentityAdapter`，只在 Vite `command=serve`、`mode=development` 且 request socket 是 loopback 時啟用。
- client 固定送 `X-OrgMaster-Dev-Issuer: urn:orgmaster:dev` 與 `X-OrgMaster-Dev-Subject: local-admin`；server 在不符合上述條件時忽略 header 並回 `IDENTITY_PROVIDER_NOT_CONFIGURED`。
- adapter將該subject映射為固定actor principal `dev-principal-local-admin`；首次建立identity link時必須使用同一principal ID，initial system audit actor固定為`system`。
- dev header 不是 production authentication；UI 必須在 governance center header 顯示一次「本機治理沙盒」。不得顯示 raw header 或 subject。
- adapter 只產生 actor context，不保存 credential。Tests 直接注入 actor，不依賴 process-global header。

### 18.2 Endpoints

Base path：`/api/orgmaster/governance`

| Method / path | Purpose | Request | Success |
| --- | --- | --- | --- |
| `GET /session` | local runtime／actor capability | dev identity headers | `200 { runtimeMode, actor, capabilities }` |
| `GET /` | draft、active／history summaries、revision | headers | `200`＋revision header；published snapshot detail 不內嵌 |
| `PATCH /draft` | 執行單一 command | `{ expectedRevision, command }` | `200 { status: applied|noop|replayed, document, revision }` |
| `POST /versions` | publish draft | `{ expectedRevision, commandId, reason, organizationVersionId }` | `201 { versionSummary, revision }` |
| `GET /versions/:id` | 讀 immutable published snapshot | headers | `200 { version }` |
| `POST /active-version` | reactivate 或 revoke | `{ expectedRevision, commandId, reason, versionId: string|null }` | `200 { activePolicyVersionId, revision }` |
| `GET /audit?cursor=&limit=` | audit reverse chronological page | headers；limit 1–100，default 50 | `200 { items, nextCursor }` |
| `POST /evaluate/permission` | local permission simulator／future adapter contract | evaluation request | `200` domain allow／deny receipt |
| `POST /evaluate/reviewers` | local reviewer simulator／future adapter contract | resolution request | `200` resolved／unresolved receipt |

Management endpoints require `orgmaster.governance.manage`；publish／active-version additionally require `orgmaster.governance.publish`。Local bootstrap actor只在尚無active policy時可繞過manage，以建立初始draft或進入recovery；首次publish仍須由draft證明actor有active identity link與publish permission。Revoke後要reactivate歷史version時，target snapshot也必須證明同一actor具有publish permission，不得只靠header。Simulator requires `orgmaster.governance.simulate` or local bootstrap mode。

### 18.3 API behavior

- JSON body hard limit 1 MiB；超過回 `413 PAYLOAD_TOO_LARGE`。
- Unsupported content type／malformed JSON 回 `400 INVALID_JSON`；unknown fields may be ignored only at envelope level，domain payload須 strict validation。
- Domain deny／unresolved 是 `200`，不是 server error；malformed request 才是 `400`。
- `X-OrgMaster-Governance-Revision` 與 body revision 必須一致。
- Cache-Control 固定 `no-store`；response 不回 token、credential 或完整 subject。
- Store domain type只存在server。Management response將identity subject轉為`subjectHint`（只保留最後4碼；短值顯示`••••`）與`subjectFingerprint = SHA-256(issuer + NUL + subject).slice(0, 12)`；create command可送完整subject但server不echo，subject建立後不可in-place修改。
- API error mapping：401 `IDENTITY_CONTEXT_REQUIRED`、403 `GOVERNANCE_ADMIN_REQUIRED`、404 `POLICY_VERSION_NOT_FOUND`、409 `REVISION_CONFLICT`／`COMMAND_ID_REUSED`、413 `PAYLOAD_TOO_LARGE`、422 `GOVERNANCE_VALIDATION_FAILED`、500 `AUDIT_CHAIN_INVALID`／`GOVERNANCE_READ_FAILED`／`GOVERNANCE_WRITE_FAILED`、503 `IDENTITY_PROVIDER_NOT_CONFIGURED`。

## 19. UI implementation contract

### 19.1 UX intent

- 使用者：本機治理管理者；不是一般 AI-PDM 審核者。
- 主要任務：維護身分連結、角色權限、指派／代理與審核規則，發布政策，再以 simulator 驗證結果。
- 成功：使用者能看出目前 active version、draft 是否有異動、哪些設定可編輯及發布影響；錯誤時知道哪個 record 被阻擋與如何修正。
- 危險動作：publish、revoke、reactivate、explicit deny、high-risk permission grant；需影響摘要與確認。

### 19.2 Surface and information architecture

- `Toolbar` 新增 `ShieldCheck` icon button「權限與審核治理」，按下開啟 fixed full-viewport `GovernanceCenter`，關閉後 focus 回到按鈕。
- GovernanceCenter不使用目前canvas可能開啟的organization draft作主資料；它固定依workspace manifest的`currentVersionId`重新載入canonical current organization。Canvas位於draft／compare時，header只顯示一次「治理依現行版組織發布」。
- GovernanceCenter header 只顯示頁名、一次性的「本機治理沙盒」、active version／draft dirty 狀態、關閉與 publish action；不顯示 DEV ID、API route、hash 或 raw status。
- Section navigation：`身分連結`、`應用角色`、`角色指派`、`代理`、`審核規則`、`發布版本`、`稽核`、`測試器`。
- 主資料以 compact table／list 為第一視覺；選 row 開右側 fixed detail drawer，drawer 不壓縮 table。Mobile 改成全寬 detail view。
- audit raw hash、完整 version receipt 與 catalog source hash 只在 audit／advanced details 顯示，不常駐主畫面。

### 19.3 Editing and safety

- 每次表單 submit 只送一個 command；成功更新 row／revision 並用低干擾 status 回饋。Validation 靠近欄位；revision conflict 顯示受影響資料與「重新載入」恢復入口，不自動覆蓋。
- Publish modal 顯示 organization current version、identity／role／grant／assignment／delegation／policy counts、validation blockers 與 mandatory reason；blocker 存在時 primary CTA disabled。
- Revoke／reactivate 需二次確認與 mandatory reason；不使用 typed confirmation。
- high-risk permission 在 role permission matrix 以文字＋icon 標示；顏色不是唯一訊號。Explicit deny 與 allow 不得只靠 checkbox 三態，使用清楚的 `未設定／允許／拒絕` control。
- simulator input 與 result 不持久化；result 明確標示「只驗證政策，不會建立審核工作項」。
- loading、empty、locked、validation error、revision conflict、no active policy 與 provider unavailable 均有就近、可發現的恢復方式；不得直接顯示 HTTP 或 API path。

### 19.4 Accessibility and responsive

- GovernanceCenter 使用 `role=dialog`、`aria-modal=true`、可見標題、focus trap 與 `Escape`；confirm modal 位於最上層，Escape 先關 modal 再關 detail／center。
- table row 必須可 keyboard focus，Enter 開 detail；所有 icon button 有可理解 aria-label／title；error 使用 `role=alert`，非錯誤結果使用 `role=status`。
- Desktop `1440x900`、laptop `1024x768`、mobile `390x844` 不得水平 overflow、重疊、裁切或產生不明 scroll owner；center body 與 detail drawer 各自管理垂直捲動並阻止意外 chaining。

## 20. Repo, module and file allowlist

Canonical source root：`C:\VIBE CODING\OrgMaster`（非 Git worktree，本輪以檔案 allowlist 保護使用者內容）。

### 20.1 New production modules

- `src/governance/types.ts`：第 16 節 domain types。
- `src/governance/aiPdmCatalog.ts`：第 15.3 節 compatibility fixture 與 source hashes。
- `src/governance/validation.ts`：shape、reference、uniqueness、time、publish validators。
- `src/governance/commands.ts`：pure command union、apply／noop／reject。
- `src/governance/evaluatePermission.ts`：第 17.4 節 pure evaluator。
- `src/governance/resolveReviewers.ts`：第 17.5 節 pure resolver。
- `src/governance/apiClient.ts`：client fetch、dev headers、typed results、error translation。
- `server/orgmasterGovernanceIdentity.ts`：local development identity adapter。
- `server/orgmasterGovernanceStore.ts`：V1 init／read／CAS／lock／atomic write／previous snapshot／audit chain。
- `server/orgmasterGovernanceApi.ts`：body limit、route、authorization、error mapping。
- `src/components/GovernanceCenter.tsx`：shell、sections、load／reload state。
- `src/components/GovernanceDetailDrawer.tsx`：row detail／form。
- `src/components/GovernanceDialogs.tsx`：publish／revoke／reactivate confirmation。
- `src/components/GovernanceSimulator.tsx`：ephemeral permission／reviewer simulator。

### 20.2 Modified production modules

- `vite.config.ts`、`vite.config.js`：註冊 governance API plugin；既有 API plugin 順序保持（本 workspace 的 local runtime 實際載入 `vite.config.js`）。
- `src/App.tsx`：GovernanceCenter open state、dismiss／focus arbitration；不把治理資料加入 organization undo/history。
- `src/components/Toolbar.tsx`：新增治理入口與 focus ref／pressed state。
- `src/index.css`：governance shell、table、drawer、modal、states、RWD。

### 20.3 Tests

- `src/governance/validation.test.ts`
- `src/governance/commands.test.ts`
- `src/governance/evaluatePermission.test.ts`
- `src/governance/resolveReviewers.test.ts`
- `server/orgmasterGovernanceStore.test.ts`
- `server/orgmasterGovernanceApi.test.ts`
- 視需要更新 `src/panelDismissal.test.ts`，只覆蓋新 overlay 的 dismiss priority。

### 20.4 Runtime data

- `data/orgmaster-governance.v1.json` 與 `.previous.json` 只能由 store 建立／更新，不手動編輯、不放進組織 workspace manifest。
- Tests 只能用 `mkdtemp` 自己的 root；不得讀寫 canonical `data/`。

除上述檔案、DEV-027 文件與 QA evidence 目錄外均為 out of scope。特別禁止修改 `src/types.ts`、`src/documentStorage.ts`、既有 V5 fixtures與 `C:\VIBE CODING\AI_PDM`。

## 21. Migration, transaction and failure recovery

### 21.1 First-run migration

1. Store file不存在時，在 process-local lock 內建立 safe V1 seed：兩個 applications、三個 OrgMaster system permissions、四個 role templates、AI-PDM catalog fixture、空 identity／assignment／delegation／policy、無 active version、初始 audit event `GOVERNANCE_INITIALIZED`。
2. Seed 寫入 temporary file，重新 parse＋validate＋verify audit chain 後 rename。
3. 不掃描、不匯入、不修改 AI-PDM role／permission／approval data；不修改 organization V5 或 workspace files。
4. 既有 V1 file 若 schema／audit／reference invalid，fail closed；不得自動 reset 或覆寫。
5. schemaVersion 非 1 回 `GOVERNANCE_SCHEMA_UNSUPPORTED`，等 follow-up migration spec。

DEV-032 後續相容 migration 不提高 schemaVersion：若 V1 store 缺少管理辦法六項 system permissions／`orgmaster_admin` grants，於同一 root lock 內驗證 stable ID／code／kind 無碰撞後，只補入 draft、append `ORGMASTER_SYSTEM_CATALOG_SYNCED` audit 並原子保存；任一碰撞 fail closed。已有 active policy 時不得修改其 immutable snapshot或自動 publish。

### 21.2 Write transaction

- 同 root 所有 mutation 共用一個 in-process queue lock。
- Lock 內重新讀 current bytes、驗證 expected revision、idempotency 與完整 document。
- pure command產生 candidate；candidate完整驗證後 append audit，canonical serialize，寫 unique temp，讀回驗證。
- existing current bytes 先寫／更新 `.previous.json`，再 rename temp 到 current；successful write 後重新讀取並回傳新 revision。
- 任一步失敗不得回 success；best-effort 刪除本次 exact temp，不碰其他 `.tmp` 或未知檔案。

### 21.3 Recovery behavior

- `REVISION_CONFLICT`：client 保留未送出表單，顯示 reload；不 retry mutation、不 last-write-wins。
- Current file read／audit failure：所有 management／evaluation fail closed；UI 顯示治理資料無法驗證並停止寫入。
- `.previous.json` 只作人工 recovery evidence；本 DEV 不提供未授權的 restore API。若需恢復，停止 RD／QC，保留 current＋previous bytes與 hash，交 PM 決定 focused recovery。
- Publish validator failure：回 structured field／entity blockers，不改 draft、active version 或 audit。
- Evaluator internal error：回 deny receipt `POLICY_DATA_INVALID`；server log 只記 correlation ID／error code，不記 subject 或 request body。
- Vite server restart 後 idempotency 仍由 audit commandId 生效；process lock 只保證單一 process，本 MVP 不支援多 instance。

## 22. QA, QC and evidence gate

### 22.1 RD baseline and targeted commands

RD 動手前：

```powershell
npm test -- --run
npm run build
```

Phase 1 targeted gate：

```powershell
npx vitest run src/governance/validation.test.ts src/governance/commands.test.ts server/orgmasterGovernanceStore.test.ts server/orgmasterGovernanceApi.test.ts
```

Phase 2 targeted gate：

```powershell
npx vitest run src/governance/evaluatePermission.test.ts src/governance/resolveReviewers.test.ts src/panelDismissal.test.ts
```

Final regression：

```powershell
npm test -- --run
npm run build
```

### 22.2 Required automatic evidence

- V1 seed、repeat init noop、invalid／unsupported file fail closed。
- CAS conflict、command replay、command ID payload mismatch、concurrent serialization、atomic write failure、previous snapshot、audit chain tamper。
- identity uniqueness／expiry／inactive、code immutability、reference validation、overlapping policy、invalid quorum。
- explicit deny precedence、scope exact/global、expired assignment、valid／revoked delegation、no recursive delegation。
- reviewer selectors、DEV-021 unresolved supervisor、self removal、quorum、policy conflict、no work item persistence。
- API body limit、method／route、status mapping、no-store／revision headers、non-loopback／non-dev identity rejection。
- Source scan／fixture assertion證明 governance store不含 `approvalRequest`、`workItem`、`approvalDecision` 或 AI-PDM transaction payload type。

### 22.3 Browser QC

- Runtime：既有 `npm run dev:local`／`http://localhost:5000`；啟動與清理遵守 workspace runtime lifecycle，且不得碰 `127.0.0.1:4173` 的 protected ProJED。
- Viewports：`1440x900`、`1024x768`、`390x844`。
- Flow：開啟治理中心→建立 local-admin identity link→確認 orgmaster_admin assignment→建立 role／grant／approval policy→publish→permission simulator allow／deny→reviewer resolved／unresolved→audit／version detail→revoke 後 fail closed→reactivate 恢復。
- 必測例外：revision conflict、duplicate UID、policy overlap、self-approval-only、provider unavailable、corrupt-store locked screen。
- Visible Error Sweep：正常 flow 不得出現 `.inline-error`、`[role=alert]`、HTTP 4xx／5xx、Not Found、Internal Server Error 或可見 `/api/` route 字串；刻意 error case 必須顯示人類影響與恢復方式而非 raw response。
- Accessibility：focus trap／restore、Escape priority、keyboard row/detail、labels、status／alert、color-independent risk。
- Artifacts：`output/playwright/dev-027/governance-1440x900.png`、`governance-1024x768.png`、`governance-390x844.png`、`governance-publish-confirm.png`、`governance-simulator-results.png`。

QC 只驗證不修改產品；任一 High-risk targeted test、full regression、build、visible-error sweep、publish／revoke flow 或主要 viewport 未通過，回送 RD，不把 DEV 標完成。

## 23. Release feasibility and deferred scope

- Current implementation不新增 dependency、remote service、database或 production credential；local development可行。
- 它不是 production release candidate：dev header、single-process lock、local JSON、tamper-evident hash chain與 manual previous snapshot recovery不足以承擔正式權限服務。
- Phase 3（`Future Phase Captured / Not Requested`）：使用者另行授權修改 AI-PDM 後，建立 integration ADR，決定 real shared IAM validation、service-to-service auth、adapter version、shadow comparison、receipt persistence、cache／revocation、timeout、retry、idempotency與 cutover／rollback。
- Phase 4（`Release Gate Required`）：選定 durable database／hosting、append-only audit enforcement、backup／restore、HA、monitoring、key rotation、security review、正式 migration與 production smoke；由 `$deployment-release-gate` 產生 release artifacts。
- 不得因本 DEV local QA/QC 通過，就宣稱 AI-PDM 已串接或正式權限治理可上線。

## 24. Change log

- 2026-08-18：使用者確認 `1B 2A`；建立 `RD Contract Ready` 行為契約，固定 OrgMaster policy authority、AI-PDM approval runtime authority 與 shared IAM boundary。
- 2026-08-18：依使用者要求升級為 `RD Implementation Ready`；固定 local governance V1 store、immutable organization snapshot、API、UI、file allowlist、migration／recovery、High-risk QA／QC 與 Phase 3／4 re-entry gate。
- 2026-08-18：完成 OrgMaster-only Phase 1／2；domain／store／API／UI、targeted tests 9/9、full regression、build、API smoke、三 viewport browser QC 與五項 evidence artifacts 通過；AI-PDM 保持未修改。
