# DEV-049：既有 Google 主帳號連結與員工編號登入

文件成熟度：`RD Implementation Complete / Local QA-QC Passed / Architecture Contract Implemented 2026-09-17`
交付狀態：`Production Released / DWD + Admission + Single-employee Link Complete / Canonical-first Correction Ready`
風險：`High`（錯綁會影響自然人登入身分）
查證基準：`codex/dev-049-existing-google-account@b839003c4f0bcebb282d02d927a0fb5e5c5f065b`＋owner receipt controlled tree `3d04c52fc648e2b061a13286b606e0f74a22e0c13fc07b15e3659aab18e8ba1a`

本文件是 DEV-049 的唯一直接實作契約；task index 只保留摘要。2026-09-17 已依人類明確跨專案授權完成本機產品、migration 013、`jenfu.managed-login.v1` owner producer 與隔離 QA/QC；這些證據不等於 provider、target、shared DB、staging、production、traffic 或 release 授權。

> **DEV-050 app-local login replacement（2026-09-18 implementation）**：[DEV-050](DEV-050-dual-identifier-managed-login.md) 已採 token-first stable-key 本人核對；private 同快照 read 要求 token／live／stored primary Email 一致。forward migration 014 新增 OrgMaster session view，不 replace 共用 identity view 或改其 rows／ACL；本 DEV migration bytes、owner 公開契約及 provider 邊界不變。前版 replace-view／optional shared core 與 closure PASS 已撤回，重試依 SQL revision-before-receipt 順序定義；不新增 HMAC attempt、60 秒 app TTL、Email／員編 resolver 或 production test port。DEV-050 本機產品與自動化 QA／QC 已 PASS；正式 provider／migration／deploy／release 仍 gated，父 receipt 保持歷史證據，不冒充 DEV-050 驗證。

> **Production activation amendment（2026-09-18，2026-09-21 同步現行 ledger）**：先前「012／013不能進入現行 DEV-040 release」限制由 [DEV-040 §36～38](DEV-040-jenfu-platform-entitlement-user-integration.md) 的受控例外取代。歷史DEV-013 transition只可保留001–011 prefix並追加精確012～015；DEV-014 producer remediation只可由exact 001–015追加016。DEV-053的application-registration remediation再以exact 001–016→017修正正式`id`欄位與mandatory consumers；形成新baseline後一般發布要求完整001–017 unchanged、零DDL。本文件不提供migration授權，亦不允許人工SQL或down migration。

> **DEV-014 keyless DWD correction（2026-09-21）**：人類已明確授權為完成 DEV-014 繼續開發 OrgMaster DEV-049。正式 Directory adapter 的 credential path 改為 runtime ADC → IAM Credentials `signJwt` → OAuth JWT bearer exchange；assertion 固定 issuer signer、具名 delegated subject、唯一 `admin.directory.user.readonly` scope 與最長 3600 秒有效期。新增專用 signer 的 app-owned Terraform 定義與 signer-level Token Creator binding，禁止 service-account key、Secret 或 project-wide Token Creator。五個 canonical keys 是唯一啟用入口，舊 alias 不再接受。Google Admin read-only核對已固定customer ID=`C015t4buc`與delegated subject=`jedchang0308@jenfu.com.tw`，後者為有效超級管理員；owner-native production profile固定這兩值、`enabled=true`、domain、signer與caller identity。這項 source／infra contract 修正不等於 production 建立 signer、Admin Console DWD、runtime config、deploy、traffic、DB admission 或 provider 驗收授權。

決策來源：

- `USER-2026-09-17-EXISTING-WORKSPACE-ACCOUNT-MAPPING-BRIEF`
- `USER-2026-09-17-DEV049-ARCHITECTURE-FINALIZATION`
- `USER-2026-09-17-DEV049-RD-TECH-LEAD-DOC-OPTIMIZATION`
- [ADR-007 amendment](../adr/ADR-007-external-role-catalog-assignment-boundary.md)、[DEV-047 相容基線](DEV-047-permanent-managed-identity-link-and-login-alias.md)

## 1. 交付目標與責任邊界

張仕杰已有 `jedchang0308@jenfu.com.tw` 時，管理者可將 `JFS0005` 連結至該既有帳號，不必另建 `jfs0005@jenfu.com.tw`。員工輸入 JFS 後取得 Google login hint；只有完成既有 Google／Firebase 驗證及 OrgMaster admission，才能建立 session。

| 資料／動作 | 唯一權威與用途 |
|---|---|
| Employee ID | OrgMaster canonical employee key |
| current JFS | OrgMaster 登入別名；舊號永久 tombstone，不可重用 |
| Directory customer ID＋user ID | 公司 managed principal 的 stable key，僅 server 持有 |
| Google primary Email | 可變的 exact lookup、顯示與最近可信 login hint；不是關聯鍵 |
| Firebase issuer＋subject | verified auth key；不得假設等於 Directory user ID |
| Google 帳號、密碼、MFA、改名、停用、license | Google Admin；OrgMaster 不建立、不變更、不配置授權 |
| Employee↔principal mapping、唯讀驗證、稽核 | OrgMaster；一位 Employee 最多一個 daily managed identity，一個 Directory key 最多一位 Employee |

DEV-049 有意取代 DEV-047 的 JFS 衍生 Email 限制、lexical `identity_alias_mismatch`、candidate／confirm 與首次登入接線缺口；其 stable key、tombstone、lifecycle、sync、role admission、privileged identity 與 production gate 不放寬。

本期包含：既有主帳號輸入、redacted preview、actor-bound confirm、local／PostgreSQL 一致行為、pending 身分首次登入、正常 UI 入口驗證。
不包含：Google provisioning／write scope、個人 Gmail、跨 customer、模糊搜尋、一般 unlink／rebind／delete、多 daily identity、SSO broker 改造、正式 migration／部署或跨專案實作。

## 2. 技術審查更正與最小方案

前版 `Architecture Closure Review PASS` 漏掉以下端到端缺口；本版更正「只有 UI／candidate 需要調整」的判斷。下表是已查證的 source 問題及定案修法，全部仍待 RD 實作，不能計為已修復。

| ID | 來源與因果 | 本版定案 |
|---|---|---|
| A1 | service/local store 把整份 JSON hash 當 registry revision；寫 lease 後 hash 改變，自己的 confirm 即衝突。SQL detail 用跨 Employee 的 max revision，也不是可靠 CAS | §4：員編 assignment revision 與檔案 CAS 分離 |
| A2 | PostgreSQL repository 將 candidate／alias flat row `as never`，service 卻讀 `created.lease`／`resolved.assignment` | §6：明確 DTO 與 row decoder，不偽造 local document |
| A3 | confirm 先拒絕 consumed lease；缺 actor 比對、完整 receipt hash、transaction current-state 檢查，且既有不同 mapping 可能被當成功 | §7：receipt-first replay、live read、鎖內再驗證、單一成功 audit |
| A4 | alias resolver 要求 active＋Firebase key，但首次 Google 登入才會綁該 key；auth API 又以假 mappingVersion 回傳 session principal | §9：pending 可取 hint，live bind 後重查 canonical admission |
| A5 | Directory parser 可用 configured customer 補缺值，stable-key read 未核對回傳 user ID，candidate 未拒絕 suspended | §5：缺值與不一致 fail closed；雙次 exact read |
| A6 | 前版把 migration 013 當成未受保護的一般 release 內容，與當時 DEV-040 ledger gate 衝突 | §13：只有 DEV-040 §36～37 的受控012～015 recovery可套用；一般發布維持001～015 unchanged |

保留現有 API path、Directory adapter、journal、DB admission fence 與 QC runtime lifecycle；不引入第二個身分服務、generic repository framework、provider write、分散式鎖或新資料表。Local base64url／PostgreSQL hex token 都保留 32 random bytes；Browser 只把它當 opaque capability，沒有為了編碼一致而重寫的必要。

查證入口：`server/orgmasterManagedIdentityService.ts`、`orgmasterManagedIdentityStore.ts`、`orgmasterManagedIdentityRepository.ts`、`orgmasterManagedDirectoryPort.ts`、`orgmasterAuthApi.ts` 及 `db/migrations/012_dev047_managed_identity_bridge.sql`。引用的是查證基準，不是新版本完成證據。

## 3. 安全不變量與完整資料流

```text
管理者輸入 primary Email
  → 權限／員工／版本驗證 → Directory exact read → 短效 preview
  → 同 actor confirm → receipt replay 檢查 → Directory stable-key live read
  → 本地交易再驗證 → mapping pending_auth＋observation＋receipt＋audit

員工輸入 current JFS
  → 已連結 pending／active + admission／角色／lifecycle guard → login hint
  → verified Google／Firebase token → pending 時 live Directory read＋首次 bind
  → canonical principal 再查詢＋既有授權 → session
```

- Lookup／confirm 只接受 `orgmaster.identity.link` 加既有 human-privileged guard；只有 `employee-number.manage` 不可旁路。UI capability 與 server enforcement 使用相同判斷。
- Candidate 與首次 confirm 要求現行 active Employee、已配置 JFS、相符 workspace／assignment revision。只有正常 current Employee 入口可以 mutation，不操作未發布的模擬身分。
- Candidate 為 256-bit entropy、5 分鐘、actor-bound、single-use；同 Employee＋actor 最新成功 lookup 使舊 lease 失效，其他 actor 不互相撤銷。
- Browser 不提交或取得 Directory customer ID、user ID、etag、credential、raw payload；只收到員工編號、primary Email、短效 token 與版本。
- 任何失敗不得留下部分成功 mapping／Firebase bind／admission／成功 audit；lookup 成功可以寫入短效 lease，不等於身分已連結。
- Email 字串不同於 JFS 衍生值是正常狀態。Employee number 變更不要求 Google rename；Google rename 仍由既有 stable-key sync 更新最近可信 Email。
- 已有 mapping 不得覆蓋；新 command 對已連結 Employee 一律衝突。只有相同成功 command 的 replay 可重取結果。

## 4. Revision 與並行語意

### 4.1 一個名稱，一種命令版本

`ManagedIdentityReadModelV1.registryRevision` 改為「該 Employee 的 current employee-number assignment revision」的十進位字串；未配置為 `"0"`。Local 取 `assignment.revision`，PostgreSQL 取該 Employee 的 `a.revision`，不可取跨 Employee 的 max。兩端既有數值增長方式可不同，但同 Employee 每次實際員編變更必須遞增，no-op 不變。

- Detail、assign-number response、candidate response、lease 與 confirm 比對同一語意；`employeeNumber.revision` 與其一致。
- Local 整份 JSON SHA 只留在 journal／file CAS 內部，不能作上述公開版本。
- 候選、receipt、audit、refresh 寫入不能改 assignment revision；lookup 後直接 confirm 必須成功。
- 員編清單的 `registryRevision` 僅是既有列表快照資訊，不作命令 CAS 或增量正確性證明；mutation 一律使用最新 Employee detail 的版本。
- 修改另一位 Employee 的員編不應使本 Employee candidate 失效；workspace 本身變更則仍由 workspace revision 保護。
- 舊 Browser 版本或舊 lease revision 不符合新語意時要求重新讀 detail／lookup，不猜測或自動轉換。

### 4.2 檢查位置

Service 先驗 request；repository 在最終寫入鎖內重新讀 Employee、workspace revision、current JFS／assignment revision。不得僅比「request == lease」而未比現行 authority。

Local 使用現有 root lock＋owner file＋journal；把需要的讀取與提交放入同一 critical section，private unlocked helper 避免重入 root lock。Local workspace／Employee 從既有 `loadOrganizationSource` 路徑鎖內重讀；不是使用 UI snapshot。既有 workspace writer 的 root lock 邊界不變。

PostgreSQL 用現有 `managed_identity_admission_authority` singleton `FOR UPDATE` 作 workspace／identity admission fence，再讀 assignment／lease／identity；所有本次改寫的 mutation routine 均先取 fence。不得持 DB lock 等 Directory 網路回應。角色／human-privileged 授權沿既有 service guard，外部 read 返回後、呼叫 mutation 前再驗一次；lease 不攜帶可延續的授權。

## 5. Email、Directory 與設定契約

1. Server 正規化順序：trim → lower-case → 長度／格式 → configured domain。只接受 ASCII、全長 3–254、恰一個 @、非空 local/domain，拒絕空白與控制字元；Current Phase local part 採一般 dot-atom，不接受 quoted address／display name。
2. 公司 domain 取同一 server 設定：production `jenfu.com.tw`；既有 local 預設 `orgmaster.test`。Read model 的 `managedDomain`、client validation、service、Directory fixture 必須相符；不得把 production domain 硬編進 local UI。
3. `findExactCandidate(primaryEmail)` 用 `users.get`。Google 的 userKey 可命中 alias，所以 response primaryEmail 必須再次 exact normalized 比對；alias-only 不可連結。
4. `readByDirectoryKey(customerId,userId)` 必須同時核對 response customerId 與 user.id；customerId 缺少不可用設定值補成「已驗證」。ID／primaryEmail 缺漏、回傳不同 stable key、suspended、archived 均拒絕。
5. Lookup／confirm 只接受 `directoryState=present`。Confirm 比對 lease 的 customer、user ID、normalized primaryEmail；lease 有 etag 時也須一致。保留既有 5 秒 request timeout 與 retryable failure 分類。
6. 唯一 provider scope 為 `admin.directory.user.readonly`。users.get 不加未定義的 customer query；tenant boundary 靠設定與 response 驗證，不能靠 URL 參數宣稱隔離。
7. 不傳輸 Google 密碼、不呼叫 Licensing API、不推論 license 類別。無公司帳號者仍去 Google Admin 建立；本 UI 僅連結既有帳號。

### 5.1 正式 keyless DWD credential path

唯一 runtime keys：

- `ORGMASTER_MANAGED_IDENTITY_ENABLED`
- `ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID`
- `ORGMASTER_GOOGLE_DIRECTORY_DOMAIN`
- `ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT`
- `ORGMASTER_GOOGLE_DIRECTORY_DWD_SERVICE_ACCOUNT_EMAIL`

只有第一鍵為 exact `true` 且其餘四鍵語法完整時才建構正式 Directory／managed-login bridge；缺值或無效值 fail closed。舊 `ORGMASTER_DIRECTORY_CUSTOMER_ID`、`ORGMASTER_MANAGED_DOMAIN`、`ORGMASTER_DIRECTORY_DWD_SUBJECT` 不得 fallback。

Production signer 固定為 `orgmaster-prod-directory-dwd@jenfu-platform-prod.iam.gserviceaccount.com`。OrgMaster runtime ADC 只用於呼叫該 signer 的 IAM Credentials `signJwt`；signed payload 固定 `iss`、`sub`、`scope`、`aud=https://oauth2.googleapis.com/token`、`iat` 與 `exp<=iat+3600`，再以 JWT bearer exchange 取得短效 delegated access token。token 只保存在 process memory 並於到期前刷新，不寫 response、log、receipt、檔案或 Secret。

`infra/google-cloud/dev-049-managed-directory` 只定義該 signer、`prevent_destroy` 與 runtime 在該 signer resource 上的 `roles/iam.serviceAccountTokenCreator`。Google Workspace 管理者仍須將 output `oauth2_client_id` 只授予上述 read-only scope；Terraform 不管理 Admin Console delegation。不得加入 `google_service_account_key`、downloaded JSON、project-level Token Creator 或 Directory write scope。

官方查證：[users.get](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/get)、[User resource](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users)。這些規則只授權唯讀驗證，不授權正式 Directory credential／DWD 設定。

## 6. API 與 Repository 契約

### 6.1 Browser API

沿用：

- `POST /api/orgmaster/employees/:employeeId/managed-identity/candidate`
- `POST /api/orgmaster/employees/:employeeId/managed-identity/confirm`

```ts
type Revisions = {
  expectedWorkspaceRevision: string | null
  expectedRegistryRevision: string // detail 的 assignment revision；必填
}
type FindRequest = Revisions & { primaryEmail: string }
type FindResponse = {
  candidateToken: string
  expiresAt: string
  employee: { id: string; employeeNumber: string }
  directory: { primaryEmail: string }
  workspaceRevision: string | null
  registryRevision: string
}
type ConfirmRequest = Revisions & {
  commandId: string // 非空，<=255；同一次不確定結果重試必須沿用
  candidateToken: string
}
// confirm 成功／replay：回傳目前 ManagedIdentityReadModelV1
```

Workspace null 只在 authority 本身也是 null 時可相等，不是 bypass；不存在 Employee／workspace authority 必須拒絕。Candidate 要求 current JFS，因此 assignment revision 必為正整數字串。Employee number mutation 使用同一版本語意。

移除 response／read model 的 `expectedUsername`、`derivedUsername` 與 provider identifiers；不新增永遠為 eligible 的冗餘欄位。屬尚未 production activation 的同 app client／server 原子升級，舊 request 不默默降級成 JFS-derived lookup。

維持既有 same-origin／session boundary、8 KiB body 上限與 `Cache-Control: no-store`。嚴格驗欄位型別，不用 `String(object)` 當驗證；非預期 provider-key 欄位不得參與判斷。

### 6.2 受影響 repository 方法的 server-only DTO

```ts
type ConfirmContext = ConfirmRequest & { employeeId: string; actor: string }
type CandidateSnapshot = {
  employeeId: string; employeeNumber: string
  workspaceRevision: string | null; registryRevision: string
  directoryCustomerId: string; directoryUserId: string
  primaryEmail: string; sourceEtag: string | null; expiresAt: string
}
type ConfirmationRead =
  | { kind: 'candidate'; snapshot: CandidateSnapshot }
  | { kind: 'replayed'; identityRecordId: string }
type AliasResolution = {
  employeeId: string; employeeNumber: string
  identityRecordId: string; loginHint: string
  linkState: 'directory_linked_pending_auth' | 'active'
}
```

- `createCandidate`：回 `{ token, expiresAt, workspaceRevision, registryRevision }`。Input 沿既有 candidate fields，由 server 提供 verified Directory facts。
- `readCandidateForConfirmation(ConfirmContext)`：回 `ConfirmationRead`；不接受 caller 的 clock／now。
- `confirmCandidate(ConfirmContext)`：回 `{ identityRecordId, employeeId }`，不要求 PostgreSQL 偽造 local document；同 request replay 回同 identity。
- `resolveAlias(employeeNumber)`：回 `AliasResolution`；repository 執行 §9 的 stored-state guard，service 再驗目前 Employee／有效角色。
- `appendAssignment` 回 `{ disposition: 'applied' | 'noop', assignment: EmployeeNumberAssignmentV1, revision: string }`；`bindAuth` 回 `{ identityRecordId, employeeId }` 後由 service readback。PostgreSQL 不可以 `as never` 代替 snake_case→camelCase 或偽造 local document。
- Local-only `readExisting/commit` 與既有 refresh 方法不需整體重寫；本次僅收斂受影響的方法、型別及 caller。任何 raw SQL row 不得直接冒充上述 DTO。

PostgreSQL candidate decoder 明確映射 `candidate_token→token`、`expires_at→expiresAt`，版本取已被 routine 驗證的 request；alias decoder 映射 `employee_id/login_hint/identity_record_id/link_state`，員編取已解析的 current JFS。Row count、必要欄位、日期與 enum 不合法一律 fail closed。Tests 必須以真實 repository 接 service，不能只測 SQL 單函式。

### 6.3 公開錯誤

| Code | HTTP | 回復方式 |
|---|---:|---|
| `MANAGED_PRIMARY_EMAIL_INVALID`／`MANAGED_PRIMARY_EMAIL_DOMAIN_NOT_ALLOWED` | 422 | 欄位修正 |
| `DIRECTORY_CANDIDATE_NOT_FOUND` | 409 | 沿用現行分類，確認 primary Email |
| `DIRECTORY_CANDIDATE_MISMATCH` | 409 | primary／stable key／etag 已變，重新 lookup |
| `DIRECTORY_USER_INELIGIBLE` | 422 | Google Admin 檢查帳號狀態 |
| `DIRECTORY_IDENTITY_CONFLICT` | 409 | 不覆蓋 mapping，不揭露對方姓名 |
| `CANDIDATE_INVALID` | 409 | actor／TTL／consume／invalidate／Employee 不符，重新 lookup |
| `IDEMPOTENCY_CONFLICT` | 409 | commandId 不得換 payload 或 actor |
| `REVISION_CONFLICT` | 409 | 重新載入 Employee，再 lookup |
| `IDENTITY_LINK_REQUIRED`／`HUMAN_PRIVILEGED_REQUIRED` | 403 | 無權 mutation |
| `DIRECTORY_READ_UNAVAILABLE` | 503 | 保留輸入或同 command 安全重試 |

Store／SQL 的 `MANAGED_IDENTITY_CANDIDATE_*` 統一映射 `CANDIDATE_INVALID`，不是 Browser code；新增錯誤須同步 union、service mapper、API status 與 UI。其他既有 auth／employee 錯誤不改；登入端仍 generic `LOGIN_NOT_AVAILABLE`，不洩漏判斷細節。

## 7. Lookup、Confirm 與 Idempotency

### 7.1 Lookup

Service 驗目前 Employee／link 權限／human privileged／JFS／版本 → 正規化 Email → Directory exact read → 再驗 actor 授權 → repository 在 §4 鎖內重查 authority 與版本、確認 Employee 尚未連結及 Directory key 未占用 → 原子建立 lease 並 invalidate 同 Employee＋actor 舊 lease → redacted preview。

只有 lookup 成功才替換前一候選。失敗不得建立 mapping，也不得因 client 提交 provider ID 而跳過 Directory。

### 7.2 Confirm 固定順序

1. 驗 session、Employee context、目前 link 權限與 human privileged、request 格式；此時不先用舊 revisions 或 consumed 狀態擋 receipt。
2. Repository preflight 先查 command receipt。相同完整 fingerprint 回 replay，跳過 TTL、consumed、版本新舊與 provider read；service 回目前 detail，不復原舊狀態。不具目前權限者仍拒絕。
3. 無 receipt 才驗 lease 的 token SHA、actor SHA、Employee、TTL、invalidated／consumed、request revisions，以及 current active Employee／JFS／authority。
4. Service 按 snapshot stable key live read；比對 §5 全部 facts。無 adapter、timeout、失敗或不一致都不能 confirm。
5. 重驗目前 actor 授權，呼叫 confirm transaction；先取 §4 fence，再查 receipt（處理並行同 command），無 receipt 才再次驗 current state／lease。
6. 確認 Employee 無 mapping、Directory key 未占用，單次 transaction 寫 identity pending_auth、present observation、consume lease、receipt 與一筆成功 audit。
7. 交易成功後讀目前 detail。若回應遺失，同 command／原 payload 重試，不能換 command 偷做第二次。

兩個不同 command／actor 對同 Employee 競爭，最多一個建立 mapping；另一個衝突，不能回傳另一份 mapping 當自己的成功。DB unique constraint 是最後防線，不能取代鎖內檢查。

### 7.3 Receipt fingerprint 與保存

沿用既有 command_receipts，不新增表。Fingerprint 固定欄位順序：
`dev049.confirm.v1, actor, employeeId, SHA256(candidateToken), expectedWorkspaceRevision, expectedRegistryRevision`。
每個非 null 欄位轉 UTF-8 lowercase hex，null 用 `-`，以 `|` 串接後 SHA-256；SQL／TypeScript 共用測試向量，消除拼接歧義。Receipt 以 `response_payload.contractVersion="dev049.confirm.v1"` 辨識新版，保存 identity result，不保存 raw token。

相同 commandId 不同 fingerprint／舊版無法驗證 fingerprint：`IDEMPOTENCY_CONFLICT`，不重建 receipt。相同新版 receipt 可在 token 過期／consume 後 replay；不重新觸發 audit、provider call 或 admission。Replay 至少保留既有 receipt 生命週期；receipt 日後若依既有政策刪除，已 consume token 仍只能拒絕，不能再次 apply。

Local replay 在鎖內辨識後直接回傳，不重寫檔案、不改 updatedAt。SQL preflight 為 read-only snapshot，最終 confirm 必須在 fence 內重驗 receipt，不能把 preflight 當交易保證。

### 7.4 失敗與 TOCTOU

Directory 可重試失敗保留 lease 到 TTL；永久 mismatch 不 consume，但 UI 丟棄 preview 並重新 lookup。Transaction 任一步失敗均 rollback；不可只寫 receipt 或只寫 identity。失敗 telemetry 只存 code、stage、correlation／必要 hash；不記 token、credential 或 raw provider response。

外部 Directory read 與本地交易無分散式原子性。策略是立即 readback 再 transaction，並在首次 bind 再讀 Directory；後續 lifecycle sync 繼續適用。不得宣稱這使 provider 競態完全消失，也不引入 provider write 或跨服務鎖。

## 8. Forward-only Migration 契約

計畫檔：`db/migrations/013_dev049_existing_google_primary_account_link.sql`。實作前重查本地 migration index；若 013 已被其他工作占用，依本 repo 分配下一個 ID 並同步本文件，不覆蓋既有 migration。

不修改 001–012 bytes／ledger、不新增 table／column／public object，不引用其他應用 core schema、不修改外部 contract shape。既有 extension 函式可沿用既定 fully-qualified 呼叫；不是建立 public-owned 物件。

| Routine | 最小改動 |
|---|---|
| 新增 `read_managed_identity_candidate_v1` | 參數順序：commandId、employeeId、candidateToken、expectedWorkspaceRevision、expectedRegistryRevision、actor（全 text）；`RETURNS jsonb`，JSON 精確為 §6.2 ConfirmationRead；先 receipt，再 lease／current guards；用 DB clock，無 p_now |
| 替換 `read_employee_managed_identity_v1` | 保留 signature／return columns；registry_revision 改為該 Employee assignment revision，未配置為 0 |
| 替換 `assign_employee_number_v1` | 保留 signature；先 admission fence，再比 workspace／assignment revision；回 revision 為 assignment revision，no-op 同樣驗版本；保留 tombstone／uniqueness |
| 替換 `lease_managed_identity_candidate_v1` | 保留 signature／return columns／hex token；鎖內驗 current Employee、JFS、版本、尚未 link；只 invalidate 同 Employee＋actor |
| 替換 `confirm_managed_identity_link_v1` | 保留 signature／return columns；receipt-first、actor binding、current-state／cardinality、atomic receipt＋audit；replay 從成功 receipt 找同 identity |
| 替換 `resolve_managed_identity_alias_v1` | 保留 signature／return columns；允許 eligible pending／active，不要求 pending 已有 auth key；補 present observation／lifecycle guards |
| 替換 `bind_managed_identity_auth_v1` | 保留 signature／return columns；先相同 admission fence，驗 current Employee、present observation、pending／active、invalidation、token Email 等於 current last-verified Email 與 stable auth uniqueness；同 auth 的 active bind no-op，conflict 不可被改回 active；首次 bind 成功 audit 與 mapping 同交易 |

Bind 的雙鍵 collision 包含 legacy active mapping 與所有 managed record，不只「其他 Employee」：同 Employee 的 legacy active row 尚在時也不可新增第二個同 issuer＋subject 的 active row。沿用 DEV-047 的 append-only reservation 與「先完成既有治理撤銷才可 continuity」原則；本 DEV 不提供自動撤銷、personas 合併或帳號接管。

新 routine 的 runtime 只有 exact EXECUTE，PUBLIC 無 EXECUTE；所有 routine owner 沿用 `jenfu_orgmaster_migrator`、`SECURITY DEFINER SET search_path=pg_catalog`，runtime `jenfu_orgmaster_runtime` 無 table SELECT／DDL／owner。DAO 用 `SELECT ...read_managed_identity_candidate_v1(...) AS result` 明確解 JSON；其他 routine 依保留形狀逐欄 decode。

Migration 一次性 invalidate 尚未 consumed 的舊 candidate leases（含 actor hash 既有但版本語意未確定的租約）；不改永久 mapping、員編、tombstone 或歷史 receipt。Local 舊 file-hash revision leases 不接受新版 assignment revision，要求重查，不需搬移永久資料。

只在 task-owned disposable PostgreSQL 驗證 001–012＋013；DB-CHANGE header、boundary check、owner/grant、rollback failure probes 必須通過。這是未來 RD migration 檔設計，不代表本輪已建立 SQL 或可套用 shared／production。

## 9. 登入、首次 Bind 與既有相容性

### 9.1 Alias 不是授權

沿現行 `POST /api/auth/managed/alias`，不另增舊文件中的 login-alias route。Repository 僅對 current JFS、active Employee、admission enabled、present trusted observation、無未完成 lifecycle barrier、linkState pending／active 回 hint；service 再驗目前有效的 OrgMaster Employee role／application access（依現有 published policy、scope 與時間，不採 draft）。

pending 不需要 Firebase issuer／subject 才能取得 hint，否則無法首次登入。只有 hint，不建立 session、不把 pending 當 active principal；hint 仍 60 秒、no-store、generic failure，沿用既有登入節流與 stale-read guard。

### 9.2 首次 Google／Firebase 登入

現行 `POST /api/auth/firebase/session` 驗 token 後，先完成既有 auth_time 合法性與 authEpoch／revokedBefore 檢查，再做任何 managed bind；不能等 mapping 已寫入才拒絕過期或已撤銷的登入證據。原 canonical principal lookup 保留；只有 managed-login enabled 且原查詢為 principal_not_active，才進既有 managed fallback：

1. 只接受已驗證的 Google provider、verified Email 與 issuer／subject；不能使用 client 自報 identity。
2. Email 只作尋找既有 pending relation 的索引，不自動新增 relation。找不到或不唯一即 generic deny；直接呼叫 session endpoint 同樣須驗 §9.1 的目前有效 OrgMaster role，不能只在 alias endpoint 檢查。
3. Directory adapter 必須存在；按已保存 stable key live read，同時驗 customer、user ID、present 與 verified token Email exact match。缺 adapter 不可略過。
4. Bind 在 §8 fence／local root lock 內再次驗 active Employee、admission、observation、invalidation barrier、pending 狀態、token Email 與 current last-verified Email 相同及 issuer／subject 唯一關係；不同 auth key 不可覆蓋。Local／SQL 同步實作，首次成功 audit 與 mapping 同一交易。
5. Bind 成功後重新呼叫 `principals.resolveActivePrincipal(issuer,subject)`，以 canonical 回傳的 mappingVersion／publishedAt 建 session；不得用 `1` 或當下時間補造。該查詢或目前有效角色檢查失敗時不建立 session；不假設現行 managed contract branch 已代做全部角色檢查。
6. 已成功 bind 但後續 session 建立失敗可重試；同 stable auth key bind no-op，不撤回永久 mapping、不新增重複 audit／admission revision。

DEV-013 SSO handoff mode、broker、redirect contract 與原有已 admission 的 principal 路徑保持不變；DEV-049 不另建登入系統。測試必須跑目前受控 Firebase fallback，而不是只直接呼叫 bind helper。

「已有 Workspace 帳號」不等於「該帳號已是 OrgMaster legacy／human_privileged principal」。前者可直接 exact link；後者沿既有 canonical 登入，不自動轉 daily 身分。若同 auth pair 需要 continuity，先依 DEV-047 既有治理處理 legacy active mapping，不由此 UI 刪除或重綁；任何額外 persona 政策另行決策。

## 10. UI 契約

一般入口：`功能 → 員工 → 選取員工 → 員工編號與登入身分`。分兩項呈現「OrgMaster 登入編號」與「Google 主帳號」，未連結時顯示尚未連結，已連結顯示最近可信 Email。員編 dialog 保留既有已存在編號／姓名／排序／卷軸與格式顏色，不重做；只移除 Google 衍生 Email 與必須同步改名的文案。

連結操作限既有 desktop mutation gate：至少 1024px、hover＋fine pointer、具 link permission＋human privileged。其他情境唯讀；不能用 CSS 隱藏取代 server 授權。

兩步驟單一 dialog：

1. 輸入：`Google 主帳號`、不預填 JFS 衍生值；主動作「查詢帳號」。
2. 確認：員工姓名、JFS、exact primary Email；主動作「確認連結」，次動作「返回修改」／「取消」。不顯示 provider identifiers，不堆正常狀態教學卡。

空白未操作為中性框；非空且格式／domain 錯誤為橘框＋精簡 inline error；符合格式為綠框，但不使用「帳號可用」或「驗證成功」。透過 label、aria-invalid／describedby 提供非色彩資訊，格式成功說明可採 screen-reader-only，不常駐多段提示。

進入 preview 後修改輸入即丟棄 token；token／command 只存該 dialog memory，不放 URL／localStorage。Confirm 網路不確定失敗保留同 command＋payload 供重試；版本／candidate 永久失敗才回 lookup。Busy 阻重複提交，請求有 timeout，失敗可恢復操作。Focus trap、Enter、Escape／backdrop busy 規則與關閉後 focus return 以既有 modal pattern 驗證。

## 11. 實作範圍與切片

以下 allowlist 已在本輪實作；跨出此範圍仍需更新契約與重新授權：

- `src/managedIdentity/types.ts`、`apiClient.ts`、`apiClient.test.ts`。
- `src/components/ManagedIdentityLinkDialog.tsx` 與新增同名 test；`EmployeeManagedIdentitySection.tsx`／test、`EmployeeNumberDialog.tsx`、`src/index.css`。
- `server/orgmasterManagedIdentity{Api,Service,Repository,Store}.ts` 及各自 tests（Api／Service／Repository test 新增）。
- `server/orgmasterManagedDirectoryPort.ts` 與新增同名 test。
- `.env.example`、`infra/google-cloud/dev-049-managed-directory/**`：canonical runtime schema、專用 signer 與 exact signer-level impersonation boundary；不建立 key、Secret 或 project IAM。
- `server/orgmasterAuthApi.ts`／test；`server/orgmasterServer.test.ts` 驗證 runtime 接線，不改 SSO consumer。
- 計畫 migration 013。
- `scripts/qc-dev-047-{contract,postgres,browser}.mjs`、`scripts/lib/dev047-postgres-qc-contract.mjs`、`scripts/dev047-postgres-qc-contract.test.mjs`、`package.json`：新增明確 `--suite=dev049` 分支，共用 runtime lifecycle，不複製 DB／browser process manager。DEV-047 預設入口與未被取代的 guard 保留；與本 spec 衝突的 derived-Email／版本／route 舊 assertion 明確更新並註明新權威，不要求新版產品通過已作廢的行為，也不改歷史 evidence。
- 新 evidence `qa/dev-049/**`；本 spec、DEV-047／ADR-007 amendment、task index、documentation map。

| Slice | 實作內容 | 出口 |
|---|---|---|
| S0 | A1–A6 failing contract tests、DTO／error、revision語意 | 測試可重現真實斷點，不只靜態 grep |
| S1 | Directory exact guards、local transaction、PG decoder、migration | 同一 adapter contract suite、DB boundary／concurrency pass |
| S2 | candidate／confirm service、API／client、receipt replay | 查詢後直接確認、negative matrix 與 rollback pass |
| S3 | pending alias、first bind、canonical requery | 真正 auth endpoint 首次／重試登入 pass |
| S4 | UI 正常入口、validation／a11y／failure recovery | 三 viewport 與有權／無權角色證據 |
| S5 | targeted／完整 regression、build、文件收斂 | 可追溯 source／fixture／命令／結果；無未處理 P0/P1 |

RD 可決定 helper 名稱、同檔拆分及 test builder；不得改 identity ownership、放寬授權、增加 provider write 或 broad refactor。新文件／依賴檔超出 allowlist 時先更新本契約；跨 repo、正式 credential、shared DB 與 release 一律另取人類授權。

## 12. 驗證契約與完成判定

| ID | 必測情境／層級 | 不能省略的斷言 |
|---|---|---|
| V1 | local＋PG service→repository：設定 JFS、lookup、confirm | lease 自己不改 assignment revision；兩端 DTO 可被 service 真正使用 |
| V2 | Email／Directory transport：trim、case、格式、domain、alias、missing customer／user ID、不同 customer／ID、suspended／archived、404／429／500／timeout | 失敗無 candidate 或無 mapping；configured value 不補 provider 缺值 |
| V3 | authz：僅 number-manage、無 link、非 human privileged、inactive Employee | devEnabled=false＋受控依賴驗證真 guard；不能全用 dev bypass |
| V4 | actor／lease：錯 actor／Employee、過期、invalidate、consume、同 Employee 不同 actor lookup | hash 綁定、latest-only 範圍正確，Browser 無 raw identifiers |
| V5 | 競態：Directory read 等待期間改 JFS／workspace／停用 Employee／撤權／新增 mapping；跨 Employee 改員編 | 寫入前拒絕過期 authority；無關 Employee number 修改不造成假衝突 |
| V6 | 同 command 並行、回應遺失重試、過 TTL replay、command 改 actor／payload、新 command 重用 token | 只一筆 mapping／consume／receipt／成功 audit；replay 無 provider call；hash 向量 SQL／TS 一致 |
| V7 | confirm 前同 Email 改為另一 stable ID、rename、etag 改變、停用；交易各步注入失敗 | exact live read、unique 與全 transaction rollback，無半成功 |
| V8 | 真 auth endpoint：pending JFS hint→verified token mock→live Directory transport mock→bind→canonical requery→session；缺 adapter／不同 user／無有效角色／auth 衝突／canonical 拒絕／auth_time 或 epoch 已失效 | 不以 active 預置資料替代首次登入；無假 mappingVersion；失效憑證 zero bind，否決無 session；同 Employee legacy active pair 不可重複 admission |
| V9 | JFS 變更與 Google rename、舊 JFS tombstone、既有 JFS 命名 Google user | JFS／Email 分軸、舊 alias 拒絕、stable relation 不變、已啟用 SSO 模式不回歸 |
| V10 | 正常 Employee UI：1440×900、1024×768、390×844 | desktop 授權正負流程；mobile 唯讀、無水平 overflow；鍵盤／focus／可讀錯誤／retry |
| V11 | DB migration／grants／compatibility | 001–012 不變；013 invalidate 舊 ephemera；runtime 無 direct table 權限；DEV-047 未被取代的 guards 保持，新版 assertion 可追溯 intentional replacement |

UI 正向 fixture 使用張仕杰／JFS0005／jedchang0308@jenfu.com.tw；在 task-owned server 注入一致 managedDomain／customer／Directory fixture，不為此改使用者常用 local 設定。不預置成功 mapping、不攔截 OrgMaster candidate／confirm API 回假成功；Directory 與 verified-token mock 只取代外部邊界。至少包含 duplicate link、actor mismatch、confirm 前 rename 三種 fail-seeking。

QC 必須記錄 source commit／dirty diff、fixture、實際執行 command、exit code、原始 assertion 與 screenshot／console evidence；預期錯誤需被 UI 消費，不可忽略未處理 rejection／pageerror。Mock／isolated evidence 不能宣稱正式 Google integration 已驗證，也不因此否定其 local 合約測試用途。

RD 已新增並執行以下 script；結果與 manifest 見本節後方 evidence：
```text
npm run test:dev-049
npm run qc:dev-049:contract
npm run qc:dev-049:postgres
npm run qc:dev-049:browser
npm run check:db-boundary
npm run test:dev-047
npm test -- --testTimeout=30000
npm run build
```

DEV-049 QC script 呼叫 §11 共用 runner 的 dev049 suite，必含新 repository→service 與 auth endpoint 測試。臨時 runtime 啟動前記錄 root／port／process tree／cleanup owner，優先安全重用；任務結束只清掉自己建立的 runtime／UI，確認 ports released。不得覆寫 DEV-047 歷史 evidence。

## 13. Release 可行性與停止條件

本輪完成本機工程實作與可驗證 owner receipt。DEV-040現行一般app release在DEV-053完成後要求既定001–017 bundle unchanged、零DDL；DEV-013歷史transition與DEV-014 migration 016 remediation分別由§36～38的exact受控模式處理。不能以本文件或local receipt當migration／activation授權。

未來 re-entry：

- 本 DEV local／isolated QA/QC、可重現 controlled source 與相容性 evidence 已完成；release re-entry 必須重新驗證 receipt freshness 與 exact source。
- 由另外明確授權的 release 工作處理 DEV-047 migration 012＋本 DEV 013、Directory read-only credential／customer／domain、admission／invalidation readiness 與 forward-only recovery 設計；不在本 feature spec 預造 release plan。
- 若採 feature disabled 的相容 app-only delivery，仍遵守當時 DEV-040 release authority；不可宣稱功能已 production active。
- 正式 Google／cloud／DB 操作、額外專案或 expanded action/environment 需人類明確授權。

停止並回架構審查：需要 provider write／Browser credential／一般 rebind、canonical key 改為 Email、無法 exact stable-key readback、無法以既有鎖保護 current authority、必須修改已套用 migration，或動到 SSO broker／sibling source。失敗不能用 mock success、跳過負例或擴權消除。

## 14. Readiness 與本輪證據邊界

- 架構／RD contract：本版定案；已知 P0／P1「設計待決項」為 0，來源缺陷 A1–A6 已實作並由 targeted／full regression 驗證。
- 前版 PASS 更正：漏列 revision、DTO、replay、首次登入及 release 邊界；本版契約取代，不回寫歷史 QA/QC 成功。
- RD／產品 tests／browser QC：`PASS`。`test:dev-049`=`50／50`、contract=`6／6`、task-owned PostgreSQL 18.4=`D49-01～06 PASS`、real Chromium local fixture=`3 viewports PASS / provider write 0`、full regression=`853 PASS / 1 skipped`、build／DB boundary PASS。
- `jenfu.managed-login.v1` owner route、Firebase revoked-token verification、unique Google provider ID、Directory stable-key read、owner CAS／receipt與legacy＋managed lifecycle barrier已實作；Platform runtime無 core routine權限。
- 2026-09-21 keyless DWD source correction：runtime ADC→exact signer `signJwt`→JWT bearer exchange、canonical five-key fail-closed config、delegated token cache、permanent／retryable auth failure classification與 signer-only Terraform boundary均已加入；targeted=`55／55`、contract=`7／7`、full regression=`875 PASS／1 skipped`、TypeScript／build／DB boundary／Terraform validate=`PASS`。正式 provider 與 Production proof 仍為 `NOT_RUN`。
- 2026-09-21 owner-native release handoff：`config/release/dev040-orgmaster-independent-production-v3.json`與validator已納入DEV-049五個Directory keys及兩個Platform caller keys；`ORGMASTER_MANAGED_IDENTITY_ENABLED=true`、customer ID=`C015t4buc`、domain=`jenfu.com.tw`、delegated subject=`jedchang0308@jenfu.com.tw`、dedicated signer與Platform runtime email／subject均由profile固定。DEV-040 owner tests `68／68`、abort `6／6`、full regression `875 PASS／1 skipped`、DB boundary及雙build PASS。
- 2026-09-21 production admission operator：`scripts/dev049-production-admission-runner.mjs`與其library／tests嵌入source-matched immutable `orgmaster-prod-migration-runner` image，並只允許由既有Job command override執行。Self-hashed operation固定exact production target、source revision／source bytes SHA-256、deadline、expected admission revision、三份consumer origin＋own-bucket mirror evidence reference／raw hash及GCS operation／receipt prefixes；runner只用既有migrator own-bucket權限重驗mirror完整內容，再重算`{platform, orgmaster} UNION active governance app IDs`，最後才呼叫既有migrator-only attestation與CAS routine。Apply可由exact readback重播；active-set、revision、source或evidence drift在mutation前fail closed。禁止跨bucket IAM、人工SQL、新Job、runtime DDL與任何sibling `*_core` access；activation須先產生OrgMaster PASS receipt再交Platform，rollback則反向CAS。
- 2026-09-21 DEV-052 producer correction：Platform migration 006揭露001–015沒有發布managed identity lifecycle consumer views。Migration 016以Platform-only security-barrier views與migrator-only ACL補正，principal來源固定append-only reservation；不改本DEV的Directory、link、admission或zero-provider-write契約。詳細以[DEV-052](DEV-052-managed-identity-lifecycle-producer-contract.md)為準。
- Owner receipt：`qa/dev-049/producer/owner-receipt.json`，schema=`jenfu.managed-login.owner-receipt.v1`；fresh PG重驗後receipt SHA-256=`79a489833141d7773f845ba1e8cb608d1be9faf4276be9e344e1e102ee5b23b7`、controlled tree=`3d04c52fc648e2b061a13286b606e0f74a22e0c13fc07b15e3659aab18e8ba1a`。
- Evidence：`qa/dev-049/contracts/manifest.json`、`qa/dev-049/postgres/manifest.json`、`qa/dev-049/browser/manifest.json`；所有 task-owned PostgreSQL、server、Chromium、port 與 temp root 已清理。
- Production authority：依2026-09-21人類授權限DEV-014 exact target執行；仍須逐項通過本節machine gate，不以local PASS直接視為provider／target完成。

### 14.1 DEV-014 Production plan／evidence amendment（2026-09-21）

專用 signer state固定為`tfstate-jenfu-platform-prod / dev-049/managed-directory/default.tfstate`。Terraform state新增`terraform_data.provenance`，綁定exact project／number／region、merged source revision、provider-readback foundation manifest SHA-256、具名operator、signer email、唯一read-only scope與必要`admin.googleapis.com`。`dev049-managed-directory-plan-gate`要求configuration完整包含五地址；因Terraform會在plan階段完成runtime data read，gate從`prior_state`驗exact enabled runtime identity，`resource_changes`則必須恰為Admin SDK API、provenance、signer與signer-level Token Creator四個managed地址。API只允許`create`／`no-op`且`disable_on_destroy=false`＋`deletion_policy=ABANDON`＋`prevent_destroy`；provenance僅允許由exact legacy shape in-place更新corrective source與已驗證foundation receipt，其餘update／delete／replace、缺址或readback漂移均fail closed。Google Admin DWD grant仍由外部管理介面執行並readback，Terraform不建立key、Secret或project IAM。

Owner release finalize會發布source／artifact-bound `jenfu.dev014.consumer-conformance.v1`。DEV-049 admission operation固定每個consumer的source revision、artifact digest、owner origin ref、OrgMaster own-bucket mirror ref與raw SHA；受控operator先逐byte讀回origin並用generation-create-only建立相同bytes的mirror。Runner在任何transaction前只讀own bucket mirror，驗raw-object SHA-256、schema、app、source、artifact、guard及content hash，DB內保存的support evidence仍指向origin ref＋SHA。只有全部PASS才進入dynamic active-set、support revision、attestation與CAS；origin app/bucket錯置、mirror prefix錯誤或內容漂移均不得寫DB，也不得以跨bucket IAM繞過。跨專案完整順序見Platform [DEV-014 Production runbook](../../Jenfu-Platform/ai-doc/runbooks/DEV-014-production-protected-release.md)。Production第一次admission於attestation前以`DEV049_ACTIVE_CONSUMER_SET_MISMATCH`回滾；根因與fix-forward以[DEV-053](DEV-053-invalidation-application-registration.md)為準。

Production fail-seeking evidence `orgmaster-prod-migration-runner-ct65x`在DB mutation前以`MIGRATION_GCS_METADATA_FAILED`停止，證明原跨bucket read設計與migrator最小權限衝突；Job已由finally回復baseline command／args。此own-bucket mirror amendment取代該未套用operation；後續registry缺口只由DEV-053 migration 017 fix-forward，不修改migration 001–016、IAM、service或runtime權限。

使用思考習慣：#第一性原理、#證據基礎、#驗收閉環


## 2026-09-22 Production execution readback

Exact DWD signer／client／readonly scope已由Google Admin readback確認；包含本DEV與DEV-050／051的service source `4b512a4d48e306cef8d1371d7a354e50a3e8f05c`已由OrgMaster owner run `35587433590`發布到`orgmaster-prod-6e65121a2875`並承接100% traffic。OrgMaster admission R3與Platform admission R4均為`APPLIED`後`REPLAY`。Firebase `google.com` provider已啟用且Platform Google popup可回到`POST /api/auth/firebase/session`。較早read-only execution `orgmaster-prod-migration-runner-bp5z9`曾證明link前零狀態；其後§15 operator已完成單一員工managed link。最新callback 403另由§15.4證明是兩app未遵守canonical-first登入順序，並非provider、DWD、admission或link缺失。部署或DB readback仍不代替browser acceptance。

## 15. Production zero-state correction（2026-09-22）

### 15.1 問題與決策

Production provider、DWD、service、migration與admission皆已通過，但`employee-shijie / JFS0005`尚未建立managed identity。正常管理UI需要已成立的managed登入session，未連結員工則無法登入，形成一次性bootstrap循環。此缺口不能以人工SQL、provider write、放寬IAM或繞過登入解決。

現行修正採`source-controlled owner-native operator`：`scripts/dev014-production-managed-link-runner.mjs`固定唯一target `employee-shijie / JFS0005 / jedchang0308@jenfu.com.tw`，先以runtime ADC及既有resource-level signer取得read-only Directory token，再呼叫migration 013既有security-definer employee-number／candidate／read／confirm routines。它不新增DDL、不直接DML table、不改其他Employee或application。

2026-09-22 exact read-only execution `orgmaster-prod-migration-runner-2pbf2`進一步證明真實zero-state為active employee、admission enabled、`employee_number=NULL`、registry revision `0`、identity=`not_linked`、alias 0筆，workspace revision=`7662edbd7be56b4d4c6c7c66337ec8e29308b97c273e8360067ffe86aeea4b0a`。因此「JFS0005已預先存在」不是可成立的Production前置條件；同一個單一員工operator須先經既有CAS routine指派JFS0005，再建立managed link。去識別化read-only Directory execution `orgmaster-prod-migration-runner-pvqnr`另證明signJwt與DWD交換成功，但Directory `users.get`因project尚未啟用`admin.googleapis.com`而回403 `accessNotConfigured`；此必要API改由上述同一managed-directory Terraform state與complete-set gate管理。

### 15.2 Fail-closed 與重播契約

- 執行環境必須精確符合`jenfu-platform-prod / 9536592944 / asia-east1 / jenfu-platform-prod-pg / jenfu_prod / orgmaster-prod-runtime`，且`OWNER_SOURCE_REVISION`等於命令source revision。
- 前置必須為active employee、admission enabled及identity=`not_linked`。employee number只接受未指派且registry revision=`0`，或已精確為`JFS0005`且revision非0；其他既有號碼、revision矛盾、號碼／tombstone衝突或多筆alias均停止。
- Directory先依primary Email讀取，再於candidate lease後依stable user ID重讀；customer、stable ID、primary Email或etag漂移均不confirm。
- zero-state apply先以exact workspace／registry CAS呼叫`assign_employee_number_v1`，readback精確`JFS0005`後才經`lease_managed_identity_candidate_v1 → read_managed_identity_candidate_v1 → confirm_managed_identity_link_v1`；成功readback必須為`directory_linked_pending_auth`。若精確mapping已存在則只回傳`REPLAY`，不再寫入。
- receipt只輸出employee target、revision、disposition與敏感識別值的SHA-256；不輸出Email、Directory stable ID、token或candidate capability。
- 執行只暫時覆寫既有`orgmaster-prod-migration-runner`的immutable image、command、runtime service identity、runtime DB login與source binding；完成或失敗後都必須回復並readback既有migrator baseline，不建立新Job。

### 15.3 Local gate與Production下一步

operator 5項targeted tests與routine-release 22項組合測試PASS；前一版DEV-040 R2 release套件另有82項PASS、abort 6／6、DB boundary PASS、full regression 875 PASS／1 skipped、production build PASS。第一版immutable runner與APP_INFRA_IMAGE_ROTATION已完成，但read-only preflight揭露employee-number zero-state後即停止mutation；須先合併本修正、重建source-bound immutable runner並再做exact image rotation，才以已讀得的workspace revision執行apply＋replay。成功後才從normal entry重跑Google首次bind、JFS alias、session persistence、AI-PDM SSO及global logout。

### 15.4 Canonical-first continuity correction（2026-09-22 historical pre-release checkpoint；current由下段取代）

單一員工operator後續已完成apply＋replay；最新read-only execution `orgmaster-prod-migration-runner-k8zvm`讀回`employee-shijie / JFS0005`為`directory_linked_pending_auth`、admission enabled、registry revision 1，且verified Firebase issuer＋subject另有一筆指向同一Employee的active legacy principal（mapping version 2）。同一Production callback logs為`resolveAlias=200 → verifyIdentity=403`。這項證據更正§15.1的歷史零狀態判斷：link已存在，403來自app auth在canonical lookup前呼叫managed bind，碰到既有principal collision guard。

§9.2既定順序現明確落到產品source：verified token完成epoch檢查後，先呼叫`resolveActivePrincipal(issuer, subject)`；只有精確`PrincipalAdmissionError('principal_not_active')`且有managed identifier時才呼叫`verifyManagedLoginIdentifier`，成功後再查canonical principal。其他admission error不得fallback。Existing canonical principal直接建立既有session且managed bind呼叫為0；managed path仍保留bind後canonical一致性檢查。

新增回歸覆蓋existing principal直通與`principal_not_active`後bind；`test:dev-049`為9 files／56 tests、full regression為210 files／876 tests（另1 file／1 test skipped），DEV-049／050 contract、DB boundary及production build均PASS。此修正不改schema、migration、managed link、Employee、application authority、IAM或Directory。Platform canonical-first source `63395409f8ac1abc7b7fd2a3149c7944e0265d73`已發布至`jenfu-platform-prod-a5ca329fffe2`並取得Workspace→AI-PDM免二次登入、reload與管理權限partial evidence；OrgMaster source `9c660e210adfec82865167397e97e28a16b8b356`、immutable runner與preflight已READY，仍待owner-native dispatch。兩app修正均在canonical後，再完成LOGIN六案、C01／C02、Free、OrgMaster target、deny-path與global logout。

### 2026-09-22 current Production owner/L4 checkpoint

OrgMaster master `3588eb69ed0b47a588d120801d18adaa68dc27d2`已由owner run `35666554078`發布至`orgmaster-prod-fda3dbbe8347`，image=`sha256:4fd3ae63692cdbda2b20ce0dfa865cea48de194440035e42217e32144f638618`且100% traffic。Latest conformance已納入OrgMaster admission revision 3與Platform revision 4的apply＋replay。Workspace normal entry已證明Platform→OrgMaster／AI-PDM免二次登入、target reload與AI-PDM管理權限；global logout POST=200，兩target舊session protected requests均401。Workspace工號callback、Cloud Identity Free及negative／race required cells仍未齊，因此本DEV的Production owner交付已完成，但DEV-014 LOGIN六案仍為0／6 full cases。權威browser證據見Platform `ai-doc/qc/qc-dev-014-production-l4-2026-09-22.md`。
