# DEV-047：永久公司身分連結與員工編號登入別名

文件成熟度：`RD Implementation Complete / Local QA-QC Passed / CAPA Closed 2026-09-16`

狀態：`RD Implementation Complete / Round 1～13 Human Confirmed / I0～I6 Implemented / Local QA-QC Passed / External IAM Activation Gated / Production Release Gated`

風險等級：`High`。本交付同時影響 Employee 主資料、登入身分、外部目錄唯讀整合、權限、稽核與登入路徑；任何把 Email、員工編號、Firebase UID、Google Directory user ID 混為同一主鍵，或讓 OrgMaster 取得 Google provider write scope 的做法都必須停止。

決策來源：

- `USER-2026-09-07-EMPLOYEE-NUMBER-MANAGED-ACCOUNT-DESIGN`
- `USER-2026-09-07-DEV047-DEVELOPMENT-BRIEF`
- `USER-2026-09-07-DEV047-GUIDED-ROUND1～8`
- `USER-2026-09-08-DEV047-GUIDED-ROUND9～13`
- `USER-2026-09-08-DEV047-CLOUD-IDENTITY-BASELINE-WORKSPACE-ENTITLEMENT`
- `USER-2026-09-08-DEV047-RD-CONTRACT-READY`
- `USER-2026-09-08-DEV047-RD-IMPLEMENTATION-READY`
- `USER-2026-09-08-DEV047-RD-TECH-LEAD-DOCUMENT-OPTIMIZATION`
- `USER-2026-09-14-DEV047-DOCUMENT-REVIEW-OPTIMIZATION`
- `USER-2026-09-16-DEV047-CAPA-COMPLETION`

父契約與權威：

- [ADR-007](../adr/ADR-007-external-role-catalog-assignment-boundary.md)：公司 managed identity、person-specific privileged identity、Google Admin／OrgMaster責任邊界的架構權威。
- [DEV-045](DEV-045-employee-account-enrollment.md)：保留 Employee↔principal one-to-many projection、identity-link single-writer、冪等、衝突與 local deterministic evidence；其 invite／create provider 不得升格為 production Cloud Identity provisioning。
- [DEV-040](DEV-040-jenfu-platform-entitlement-user-integration.md)：保留登入 principal、Jenfu 應用角色／權限與跨系統 authority；本 DEV 不授予角色、不部署 production。
- DEV-047 本文件是 Employee number、`human_daily_managed`、Google Directory 唯讀連結、登入 alias 與外部狀態投影的直接契約。若摘要文件與本文件衝突，以本文件為準。

> **DEV-049 intentional replacement（2026-09-17）**：[DEV-049](DEV-049-existing-google-primary-account-link.md) 是初次 primary Email 輸入、redacted response、assignment revision／file CAS 分離、typed repository DTO、receipt-first／actor-bound confirm 及 pending 首次登入接線的後續 RD 權威。本文件的 JFS-derived Email、lexical `identity_alias_mismatch`、員編變更需 Google 改名，以及與上述新契約衝突的 route／版本／首次登入細節不再沿用。Directory stable key、獨立 Firebase key、one-Employee／one-managed-identity、zero-provider-write、tombstone、lifecycle、sync 與 admission 不放寬。DEV-049 §2 已列出本基線的實作缺口，歷史 local QA/QC 不證明新需求完成；其 RD、驗證及另行 release 前不得宣稱產品已切換。正式 migration 012／013 與 activation 仍需獨立授權，不能併入現行 DEV-040 固定 001–011 app release。

> **DEV-050 intentional replacement（2026-09-17 架構定案）**：[DEV-050](DEV-050-dual-identifier-managed-login.md) 採token-first：Google驗證後以stable key找本人，再核對current JFS或exact linked primary Email；不先回傳resolved login hint。HMAC attempt／60秒app TTL／Email或員編resolver已撤回。source closure另確認migration 013的managed canonical分支缺published application／role guard，DEV-050以forward migration 014只replace contract view補齊legacy／managed parity，不改012／013 bytes、owner public contract或provider邊界。DEV-050現為RD Implementation Ready／Architecture Finalized，但產品與QA／QC未完成；本註記不修改DEV-047完成狀態。

Spec Impact Preflight：`Intentional replacement / Cross-spec convergence`。本契約取代「OrgMaster 建立或邀請 Google 帳號」、「Workspace／Cloud Identity 是兩種互斥帳號」、「員工編號或 Email 是 canonical identity」及任何 provider lifecycle intent；不回開 DEV-045 已完成的 local slice。

## 1. Current Phase 成果與執行邊界

Current Phase 已依本文件固定的 I0～I6 execution boundary 完成實作、測試與 local／isolated evidence：

1. Employee 可有受治理且永久不重用的 `JFS####` 員工編號；新 active transition 必須有有效編號。
2. Google Admin 先建立 Cloud Identity managed user；OrgMaster 只搜尋、人工確認並連結該 Employee 的唯一日常公司身分。
3. 員工輸入 current `JFS####` 可登入；員編更正但 Google username 尚未改名時，仍解析至原本同一個 principal。
4. OrgMaster 自動同步 Google Directory 的最小唯讀事實，呈現 alias／lifecycle mismatch 與 freshness，不建立任何 Google write path。
5. 登入授權仍同時要求 live identity-provider authentication、current active Employee 與 current effective role。

2026-09-16 已完成明列產品程式、`012` source repair、local deterministic／mocked HTTP／isolated PostgreSQL／browser evidence；隔離 DB 寫入只存在於 task-owned temp cluster。此完成狀態不授權連線 production Directory、套用 shared production migration、開啟 production feature flag、部署或 release。

## 2. Current Architecture Impact

- 現行 `Employee` domain 沒有 `employeeNumber`，且 Employee／組織版本在 Browser workspace 編輯。為避免把永久號碼 ledger 綁進可回復、可匯入的組織版本，Current Slice 固定由 OrgMaster server-owned employee identity registry 保存 `employeeNumber`、歷史 tombstone 與 legacy exemption；registry 只能持有 Employee ID 與身分欄位，不得複製姓名、部門、職位或 Employee status，因此不形成第二份員工清單。
- 現行 server 以 Firebase verified token 的 `issuer + Firebase uid` 解析登入 principal。Firebase `sub` 是 Firebase project 內的 UID；它不是本契約中的 Google Directory user ID。
- Google Directory `User.id` 與 `primaryEmail`具有不同語意：前者是目錄穩定鍵，後者會因改名而變動。初次搜尋可用預期 Email，但 link 與後續同步不得以 Email 當主鍵。
- Google Directory `users.get` 的 `userKey` 可接受 primary Email、alias 或 unique user ID；因此以預期 Email 查到結果後，仍必須驗證回傳的 normalized `primaryEmail` 精確相同，不能把 alias 命中當成初次連結成功。
- Firebase 登入鍵與 Google Directory 鍵採雙鍵 bridge：登入授權使用 verified Firebase `issuer + subject`；外部目錄同步使用 configured customer＋Directory `user.id`。兩者只可經本文件第 8 節的首次登入證據原子綁定。
- 現行 `orgmaster_contract.v_active_principal_mappings_v1`只投影 published governance identity links；`012` migration 必須以相同欄位的 additive union 納入 active managed-daily registry，並在寫入函式內排除與既有 mapping 的雙鍵衝突。舊 view 名稱與欄位不變，既有 consumer 不需同步部署。
- Employee lifecycle 的唯一 database authority 是 active persistence batch 中 `orgmaster-workspace.v1.json.currentVersionId`所指向、`kind=document`的 current workspace artifact；governance version 內的 organization snapshot、draft workspace與Browser state都不是 principal admission authority。`012`必須建立一個 private current-workspace Employee projection，供seed、mutation guard及contract內legacy／managed兩支共用，避免舊privileged mapping在Employee停用後由舊snapshot復活。
- 現行 entitlement outbox底層enqueue只接受`application_id='ai-pdm'`；只放寬event-kind constraint仍無法失效OrgMaster session。`012`必須在owned schema內提供multi-application enqueue／lease implementation，並保留`orgmaster_contract.claim／complete／retry_entitlement_change_outbox_v1`的既有signature作相容轉接，不得修改舊`access_governance` schema。
- `organization.active-principal.v1`的JSON schema、欄位與version不變，因此既有`orgmaster.identity-visibility`manifest signature／payload hash也不變；新增managed row必須用DEV-047 producer fixture通過既有frozen canonical-principal schema，不能藉producer expansion重寫vendor contract lock。
- 現行 server permission evaluator以治理文件中的 `issuer + subject`找 Employee。對已經 auth middleware 解析成功的 managed-daily session，Current Slice 新增 server-only verified-Employee evaluator；Browser／公開 permission API 不接受 Employee ID 取代登入證據，特權 mutation 仍要求 person-specific `human_privileged` link。
- Google Workspace Licensing API 公開契約只提供 `apps.licensing` scope，沒有可供本 DEV 使用的 read-only licensing scope。為維持 OrgMaster zero provider writes，本階段不得授予該 scope，也不得宣稱 Workspace license 狀態可被權威讀取。

外部技術依據：

- [Google Directory User resource](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users)
- [Google Directory users.get](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/get)
- [Google Directory OAuth scopes](https://developers.google.com/workspace/admin/directory/v1/guides/authorizing)
- [Google Directory limits and retry](https://developers.google.com/workspace/admin/directory/v1/limits)
- [Google Workspace LicenseAssignment](https://developers.google.com/workspace/admin/licensing/reference/rest/v1/licenseAssignments)
- [Firebase verified ID token](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Google OpenID Connect identity claims](https://developers.google.com/identity/openid-connect/reference)
- [Google Workspace service credentials and domain-wide delegation](https://developers.google.com/workspace/guides/create-credentials)
- [Google Workspace change a user email address](https://support.google.com/a/answer/182084)

## 3. Scope

### 3.1 In scope

- 單一 Employee 的 `employeeNumber`設定、更正、格式驗證、active gate、併發唯一性與永久 tombstone。
- `employeeNumber → lower(employeeNumber)@jenfu.com.tw` 的 deterministic username 衍生。
- 一位 Employee 最多一個 `human_daily_managed` Cloud Identity 基礎身分。
- Google Directory server-side read-only exact candidate search、人工確認、candidate expiry 與衝突防護。
- Directory identity 先連結、首次成功 Google／Firebase 登入再綁定 Firebase principal 的雙鍵 bridge。
- current JFS login alias、員編更正期間的同-principal continuity，以及OrgMaster正常登入UI／resolver對舊JFS的永久拒絕。
- Directory presence／suspension／archive、alias mismatch、lifecycle mismatch 與 freshness 投影。
- 定期、領域 commit 後事件與人工重新整理三種 read-only sync trigger。
- Employee 明細中的「設定員工編號」「連結公司帳號」「重新整理狀態」與唯讀狀態。
- 權限、稽核、冪等、錯誤語意及 QA／QC 驗收契約。

### 3.2 Out of scope

- Cloud Identity／Workspace user create、invite、credential、password、MFA、rename、suspend、reactivate、session、license、資料移轉或任何 provider write。
- Google Admin／Workspace 流程、核准、資料承接、授權管理或其操作 audit 的複製品。
- `apps.licensing` scope、Workspace LicenseAssignment API 及以 Gmail mailbox 等間接訊號推測 Workspace SKU／license。
- 員工編號自動產生、預留、批次匯入、CSV、貼上多列、清單多選或 bulk API。
- 第二個 `human_daily_managed`、shared mailbox／group／service account 綁 Employee、個人 Gmail 正常化。
- 自動授予 OrgMaster、AI-PDM 或 Jenfu Management 角色；角色仍由既有治理契約決定。
- production credential material、tenant mutation、shared production migration apply、feature activation、deploy、release、rollback execution或 production smoke artifact。
- Google Admin 操作介面、Platform／AI-PDM consumer 改版，以及非現行 `organization.active-principal.v1`相容 consumer 的跨 repo migration。

## 4. Authority 與資料流

~~~text
OrgMaster Employee owner
  -> 管理 current Employee、JFS 編號、active 與 Jenfu 應用角色
  -> 依 current JFS 衍生預期 Google username

Google Admin identity owner
  -> 建立／改名／停用 Cloud Identity managed user
  -> 管理 credential、MFA、session 與 Workspace 服務

OrgMaster read-only bridge
  -> Directory read-only exact lookup
  -> 具權管理者人工確認 Directory user
  -> 建立 directory_linked_pending_auth
  -> 首次 live Google/Firebase sign-in 以同一 Directory user 證據綁定 Firebase issuer+subject
  -> active governance identity link
  -> 後續 Directory 同步只用 customer+Directory user.id
~~~

單一寫入責任：Employee、JFS、Employee↔principal link、link audit 與 Jenfu application entitlement 只由 OrgMaster domain command 寫入；所有 Google provider 物件只由 Google Admin／identity provider 寫入。Browser 不得持有 Directory credential，也不得直接呼叫 Google Admin API。

## 5. Logical Data Contract V1

以下是對UI／service公開的logical語意；physical table、index、routine與local repository固定於第16節，兩者欄位語意不得漂移。

### 5.1 `EmployeeNumberAssignmentV1`

| 欄位 | 契約 |
| --- | --- |
| `employeeId` | 既有 opaque Employee canonical ID；不可由員編衍生 |
| `employeeNumber` | nullable；有值時 canonical display 必為 `^JFS[0-9]{4}$` 且不得為 `JFS0000` |
| `normalizedEmployeeNumber` | `trim → uppercase`；唯一性與 resolver 使用此值 |
| `revision` | compare-and-swap；所有變更須帶 expected revision |
| `assignedAt／assignedBy` | 首次成功配置的 audit fact |
| `updatedAt／updatedBy` | 最近一次合法更正的 audit fact |

### 5.2 `EmployeeNumberTombstoneV1`

| 欄位 | 契約 |
| --- | --- |
| `normalizedEmployeeNumber` | 全域 case-insensitive 唯一且永久保留 |
| `firstEmployeeId` | 首次成功取得該號碼的 Employee；不得改指他人 |
| `firstAssignedAt` | 第一次成功 commit 時建立 |
| `retiredAt` | current number 更正時記錄；未 retired 可為 null |

任何曾成功 commit 的號碼均不得再分配給另一 Employee；刪除投影、離職、帳號停用或更正都不能移除 tombstone。同一 Employee 更正回歷史舊號也不在 Current Phase，必須 fail closed。

### 5.3 `ManagedDailyIdentityV1`

| 欄位 | 契約 |
| --- | --- |
| `identityRecordId` | OrgMaster UUIDv7 opaque immutable ID |
| `principalId` | 建立 record 時固定為 `principal-managed:<identityRecordId>`；不可由 Employee ID、JFS、Email或provider ID衍生，之後不可變更 |
| `employeeId` | 每位 Employee 在 `kind=human_daily_managed` 下最多一筆 |
| `directoryCustomerId` | production 設定的 Google customer；不得由 Browser 提交 |
| `directoryUserId` | Google Directory stable user key；初次人工確認後不可改綁 |
| `lastVerifiedPrimaryEmail` | 最近 fresh Directory readback 的可變顯示／login hint，不是 identity key |
| `authIssuer／authSubject` | 首次登入成功前為 null；之後為 Firebase verified issuer＋UID，且組合全域唯一 |
| `linkState` | `directory_linked_pending_auth`、`active` 或 `conflict` |
| `createdAt／createdBy` | 人工確認 link 的 audit fact |
| `boundAt` | 首次成功 auth bridge 時間；尚未綁定為 null |
| `revision` | link／projection 競態控制 |
| `admissionRevision` | 首次eligible前為null；auth bind及其後會改變active-principal row的事實變更時，由database sequence配置safe-integer monotonic revision |
| `admissionChangedAt` | 首次eligible前為null；最近一次admission-relevant transition時間，對外投影為`published_at` |

### 5.4 `ExternalIdentityObservationV1`

只保存完成本契約所需的最小欄位：`source=google_admin_directory_v1`、directory customer／user key、normalized `primaryEmail`、`directoryState`、`trustedObservedAt`、`lastAttemptAt`、source `etag`、`lastAppliedRequestSequence`、adapter outcome、freshness 與 sanitized error code。只有成功且可驗證、且request sequence大於current applied sequence的provider outcome可更新`primaryEmail／directoryState／trustedObservedAt／etag`；`trustedObservedAt`由server在收到該HTTP結果時產生，provider etag只供內容一致性／candidate CAS，不作排序權威。timeout、429、5xx或permission error只更新attempt／error metadata，不得覆寫最後可信事實；只有針對已連結stable Directory user ID的authoritative `users.get` 404可投影`directoryState=missing`，candidate Email查無資料不得修改既有identity observation。姓名、復原 Email／電話、組織欄位、credential、token 與 provider response body 不得持久化。

Workspace entitlement 在 Current Phase 固定為 `unavailable_by_policy` 或 `unknown`；沒有經核准的真正 read-only authority 前，不得投影 `licensed／unlicensed`。未來若取得不具 write capability 的受治理來源，須以新 contract version 與 compatibility window 加入。

### 5.5 不變量

1. `normalizedEmployeeNumber`在 current assignment 與所有 tombstone 間 case-insensitive 唯一。
2. 每位 Employee 最多一個 `human_daily_managed` record；每個 Directory identity 最多綁一位 Employee。
3. 非 null 的 `authIssuer + authSubject`最多綁一筆 active managed daily identity。
4. Employee number commit 與 tombstone 必須在同一 OrgMaster transaction 中成功或全部失敗。
5. Directory confirmation 與 pending-auth link／audit 必須原子寫入；provider read 失敗不得留下 partial link。
6. projection 只接受比 current observation 新且可追溯的結果；舊 response 不得覆寫新狀態。
7. link 永遠不得因 Email 改名自動換成另一個 Directory user 或 Firebase principal。
8. legacy governance與managed registry的active mapping在`issuer+subject`及`principalId`兩個維度皆不得重複；兩個writer必須使用同一database transaction lock protocol。
9. Employee active→inactive／移除時，依交易前可見的legacy或managed mapping建立session invalidation，不得以managed DB gate=false略過legacy。Directory／managed link失效只影響原可見managed mapping；gate disable亦只針對managed。既有未完成event不可刪除，receipt全完成前不得重新投影該Employee的active principal。
10. current Employee存在、status與workspace revision只能由current-workspace Employee projection讀取；draft或governance snapshot不得覆寫此事實。
11. `missing`只能由stable Directory key authoritative 404產生；permission、timeout、quota、5xx、candidate miss與response parse error永遠不是known-negative。
12. 自012 migration起，Firebase issuer＋subject永久歸屬以append-only `principal_identity_reservations`為唯一保留authority；seed現存governance draft／published history及managed record，後續所有writer同步封存old＋proposed pair。移除草稿、還原artifact、inactive或quarantine均不得釋放；同Employee continuity仍須先撤legacy active row。Migration以前已遺失／依040-ID1核准移除的歷史不宣稱可還原，seed coverage須另記證據。

## 6. State Contract

狀態採正交 axes，不以單一 `accountStatus` 混合：

| Axis | States | 語意 |
| --- | --- | --- |
| Employee number | `unassigned`、`assigned` | 是否有合法 current JFS |
| Link | `unlinked`、`directory_linked_pending_auth`、`active`、`conflict` | Directory link 與 Firebase auth bridge 狀態 |
| Directory | `missing`、`present`、`suspended`、`archived`、`unknown` | 最近一次可信 Directory 事實 |
| Alias | `matched`、`identity_alias_mismatch`、`unknown` | current JFS 衍生 username 與 last verified primary Email 是否一致 |
| Lifecycle | `matched`、`identity_lifecycle_mismatch`、`unknown` | Employee active 與外部目錄可用狀態是否一致 |
| Freshness | `fresh`、`stale`、`unknown` | observation 是否仍在本契約的 SLO 內 |
| Workspace | `unavailable_by_policy`、`unknown` | Current Phase 不讀 licensing API，不得宣稱有／無授權 |

狀態規則：

- `link=active`只表示 auth bridge 已完成，不表示 Employee active、角色有效或 Google user 未 suspended。
- 最後可信Directory state為`present`時，`freshness=stale`或最近attempt error不自動撤銷legitimate access；allow仍需live token＋active Employee＋effective role。從未可信的`directory=unknown`不admit，Employee inactive或role revoke永遠立即fail closed。
- `stale／unknown`禁止新 link、禁止清除 mismatch、禁止把外部操作標成完成。
- `directory=suspended／archived／missing`是可信known-negative：同commit移除managed mapping；若交易前該managed row可見，須逐affected application寫入lifecycle invalidation。沒有前一managed admission不虛造新event，既有event不能因此刪除；Employee停用對legacy／managed另依第5.5節第9點判斷。
- known-negative、Employee inactive或active link轉非active後，即使後來恢復`present／active`，只要該Employee仍有`pending／processing／failed` lifecycle invalidation event，就不得重新出現在active-principal view。全部receipt完成後中央epoch已更新，才可重新admit，舊session因此不能復活。
- `identity_alias_mismatch`期間current JFS由OrgMaster resolver解析至同一已綁principal的`lastVerifiedPrimaryEmail`；舊JFS在該resolver維持generic拒絕。

### 6.1 Admission-relevant transition matrix

| Transition | 唯一writer／guard | 同一commit必做 | Managed mapping結果 |
| --- | --- | --- | --- |
| 無號→current JFS／current JFS→新JFS | `assign_employee_number_v1`；Employee與registry CAS、tombstone | assignment、tombstone、receipt、audit；有identity時enqueue refresh | 原mapping保留；alias可能進入mismatch，不更換principal |
| unlinked→pending-auth | `confirm_managed_identity_link_v1`；fresh candidate lease與stable-key readback | identity、initial observation、receipt、audit、refresh event | 不admit |
| pending-auth→active | `bind_managed_identity_auth_v1`；live verified Firebase＋Directory readback、pair/principal fence | auth pair、link、admission revision、receipt、audit | DB gate開且其餘predicate成立才admit |
| present→suspended／archived／missing | `complete_managed_identity_refresh_v1`；newer sequence與trusted outcome | observation、admission revision、audit；前一mapping在DB gate下可見時逐verified active app寫lifecycle outbox | 同commit移除 |
| known-negative→present | 同上 | observation、admission revision；先檢查舊invalidation receipts | receipts未全完成前仍不admit |
| current Employee active→inactive／移除 | identity-fenced persistence writer；old／proposed current workspace | artifact、managed admission revision（如有）、audit；old legacy或managed可見即逐affected app建立lifecycle outbox，與managed gate無關 | 同commit移除；legacy同樣適用 |
| current Employee inactive→active | identity-fenced persistence writer；號碼／exemption與receipt barrier | artifact、admission revision、audit/outbox（如有狀態變更） | 全部predicate與receipt成立後才admit |
| DB gate true→false／false→true | release-authority CAS routine | revision；disable時逐app outbox；enable時重作collision、catalog readiness與pending-event preflight | disable同commit移除；enable通過後才加入 |
| 任一已知invariant破壞→conflict | release-authority quarantine routine；incident reference必填 | link=`conflict`、admission revision、append-only audit；前一mapping在DB gate下可見時逐verified active app寫lifecycle outbox | 同commit移除且Current Slice不可恢復 |

`directory_linked_pending_auth／active／conflict`沒有一般UI或runtime unlink、rebind、delete transition。Email／JFS改名不改Directory user或Firebase pair；偵測到可能錯綁時先quarantine，重新指定自然人或provider identity屬新的治理DEV，禁止人工改表。

## 7. Directory Read-only Adapter Contract

### 7.1 Required operations

- `findExactCandidate(expectedPrimaryEmail)`：只供新 link preview；server 由 current Employee number 衍生 Email，不接受 Browser 指定任意 lookup Email。
- `readByDirectoryKey(directoryCustomerId, directoryUserId)`：供確認、sync 與 auth bridge readback。

### 7.2 Candidate rules

1. production authority、customer 與 verified domain 未啟用時 fail closed。
2. 使用 Directory `users.get` 查詢預期 Email 後，必須驗證 response customer、normalized `primaryEmail`精確等於預期值，且 user 非 archived／deleted。
3. alias 命中、零候選、非精確 primary Email、不同 customer 或 Directory user 已綁他人均不得產生可確認 candidate。
4. Browser 只取得 redacted candidate、opaque `candidateToken`、到期時間與可顯示狀態；不取得 provider credential、raw payload 或可修改欄位。
5. confirmation 必須以 Directory user ID 再 readback，並比對 candidate token 內的 Employee、預期 username、Directory key、source etag 與 actor。

`candidateToken`固定為CSPRNG產生的256-bit random bytes之base64url opaque capability；database只存SHA-256與actor binding，不是JWT、不是含payload的signed token，也不得可由command ID推導。每次成功搜尋在保存新lease時原子使同Employee＋actor尚未consume的舊lease失效；網路遺失時重新搜尋取得新token，不重送或持久化raw token。

### 7.3 Scope and credential boundary

- 唯一允許的 Google Directory scope 是 `https://www.googleapis.com/auth/admin.directory.user.readonly`；credential 只存在 server-side secret boundary，Browser、repo、log、audit 與 response 均不可見。
- 允許 service account＋domain-wide delegation 只作經 Google Admin 授權的 read-only Directory access；production 必須有具名 primary／backup operational owner 與 scope receipt。
- 禁止 `admin.directory.user`、`apps.licensing` 或任何 user／license／session write capability。若平台 credential 無法隔離為精確 read-only scope，本 DEV 停止，不以程式內「不呼叫 write method」取代權限隔離。

## 8. First-login Auth Bridge and Alias Resolver

### 8.1 First-login bridge

人工確認後只建立 `directory_linked_pending_auth`，不捏造尚未知的 Firebase UID。第一次登入時 server 必須：

1. 驗證 Firebase ID token 的 signature、issuer、audience、expiry、auth time 與 revocation policy，並取得 Firebase `issuer + subject`。
2. 確認本次 sign-in provider 為 `google.com`、token Email 已驗證，且不存在已綁其他 Employee 的相同 Firebase principal。
3. 以 token 中已驗證 Email 執行 live Directory read，確認回傳的 customer＋Directory user ID 精確等於該 Employee 已人工確認的 pending link。Email 只作這次 lookup input，不作 link key。
4. 在同一repository transaction（local journal或PostgreSQL routine）內以compare-and-swap綁定`authIssuer／authSubject`、把link改為`active`、配置admission revision並留下actor／time／evidence revision；任一不一致全部fail closed且zero partial mutation。

不假設 Firebase `sub`等於 Google Directory `user.id`，也不要求以 Email 作永久 join。若 sandbox 證明可取得額外 stable Google provider subject，可作 observation 保存，但不能取代上述雙鍵與 Directory readback，除非另版契約明確核准。

### 8.2 Alias resolver

1. `POST /api/auth/login-alias/resolve`輸入先`trim → uppercase`；只接受current `^JFS[0-9]{4}$`。
2. OrgMaster resolver只查current assignment；tombstone／舊JFS一律回generic `LOGIN_NOT_AVAILABLE`，不提供歷史alias fallback。此保證只涵蓋OrgMaster正常登入UI與resolver，不能宣稱Google／Firebase provider本身拒絕使用者直接輸入舊Email或保留的provider alias。
3. 必須取得唯一active Employee、唯一pending-auth或active managed record、DB admission enabled、最後可信Directory state=present、非conflict且無pending lifecycle barrier、可用的last verified primary Email與目前OrgMaster登入資格；pending-auth不要求auth pair或已存在active-principal row，否則無法啟動首次登入。此資格固定為current active V3 policy中`orgmaster` application仍active，且該Employee至少有一筆時間有效、`status=active`、`applicationId=orgmaster`、role仍active且global scope的role assignment；resolver不把「任何application曾有角色」誤當OrgMaster存取權。
4. matched 時使用 current derived username；alias mismatch 時使用同一 Directory identity 的 last verified primary Email 作 provider `login_hint`，不得直接拼接尚未存在的新 username。
5. UI 只收到完成 provider sign-in 所需的短期結果；失敗回傳 generic `LOGIN_NOT_AVAILABLE`，不得說明 Employee、帳號或角色哪一項不存在。需有 rate limit、短期 expiry 與 security telemetry。
6. 最終 session 建立仍只接受 live verified token；login hint 不是 authentication，也不得授權。

Google Admin完成username改名後，OrgMaster只有在`readByDirectoryKey` fresh readback同一Directory user且`primaryEmail`等於current衍生username時才清除`identity_alias_mismatch`。Google對舊地址的mail alias、登入可用性與最長propagation時間屬provider行為與production readback證據，不是OrgMaster可控制的驗收承諾。

## 9. Service／API Behavior Contract V1

下列路徑是Current Slice exact V1 HTTP contract；response固定`Cache-Control: no-store`、JSON與correlation ID。Employee namespace全部要求既有verified session及permission；mutation另驗same-origin。`/api/auth/login-alias/resolve`及`/api/auth/firebase/session`是pre-session入口，要求same-origin、body上限與rate limit，但不能要求既有session，否則首次登入循環阻塞。

| Method／route | Request | Success | 核心限制 |
| --- | --- | --- | --- |
| `GET /api/orgmaster/employees/:id/managed-identity` | Employee ID | number、link、projection、freshness、`workspaceRevision`、nullable `registryRevision`、allowed actions | `orgmaster.identity.view`；redacted read model；pure read |
| `POST /api/orgmaster/employees/:id/employee-number/preview` | `{employeeNumber}` | canonical JFS、derived username、local validation | 不占號、不讀 Google、不產生 audit success |
| `PUT /api/orgmaster/employees/:id/employee-number` | `{commandId, expectedWorkspaceRevision, expectedRegistryRevision, employeeNumber}` | committed Employee number＋registry revision | `expectedRegistryRevision=null`只供首次配置；單一 Employee；原子 tombstone |
| `POST /api/orgmaster/employees/:id/activation-check` | `{expectedWorkspaceRevision}` | `{allowed:true, employeeNumber, registryRevision}` | 僅作 server gate；不改 Employee；legacy exemption 可通過但回 `correctionRequired=true` |
| `POST /api/orgmaster/employees/:id/managed-identity/candidates` | `{expectedWorkspaceRevision, expectedRegistryRevision}` | redacted exact candidate＋single-use `candidateToken` | server 衍生 Email；read-only Directory；5 分鐘到期 |
| `POST /api/orgmaster/employees/:id/managed-identity/link` | `{commandId, expectedWorkspaceRevision, expectedIdentityRevision, candidateToken}` | `directory_linked_pending_auth` readback | person-specific privileged actor；重新 readback；零 provider write |
| `POST /api/orgmaster/employees/:id/managed-identity/refresh` | `{commandId}` | `{requestId, disposition: queued\|deduplicated}` | 只代表排入，不代表 Google 狀態成功 |
| `POST /api/auth/login-alias/resolve` | `{employeeNumber}` | 短期 login hint response | generic failure、rate limit、不回傳權限／Employee診斷 |
| existing Firebase session endpoint | verified Firebase ID token | session 或首次 bridge＋session | 第 8.1 節全部驗證；不得 email-only link |

所有domain mutation／enqueue request使用`commandId`冪等；相同command＋payload回傳相同redacted結果，不同payload重用command ID回`IDEMPOTENCY_CONFLICT`。`activation-check`是pure guard；candidate搜尋是短命capability issuance，刻意不接受command ID也不承諾重送raw token，其重試依第7.2節作廢舊lease。`expectedWorkspaceRevision`是GET read model中的authoritative current-workspace revision；`expectedRegistryRevision`是員編assignment revision，首次配置固定null；兩者任一漂移都回`REVISION_CONFLICT`。Candidate token綁定Employee、兩個revision、expected username、Directory key、etag、actor與expiry，single-use；過期、被新搜尋取代或已消耗不得重放。

## 10. Permission and Audit Contract

| Permission | 能力 |
| --- | --- |
| `orgmaster.identity.view` | 讀取 redacted managed identity 與 projection |
| `orgmaster.employee_number.manage` | 單筆設定／更正 JFS；不能批次 |
| `orgmaster.identity.link` | 搜尋 exact candidate 並人工確認 link |
| `orgmaster.identity.refresh` | 要求 read-only refresh；不能改 Employee、link 或 Google |

- `orgmaster.employee_number.manage`與`orgmaster.identity.link`只授予以 person-specific `human_privileged`登入的 OrgMaster 超級管理者；shared identity、一般治理管理者、主管與 daily identity 不得持有。
- Google Admin 權限與 OrgMaster 權限完全獨立；在 OrgMaster 是超級管理者不代表能在 Google 建立或修改帳號。
- server 必須重新授權，不能依 UI 隱藏控制。桌面 mutation gate 仍要求至少 1024px＋hover＋fine pointer；窄版只讀。
- audit 至少含 action、commandId、actor principal、Employee ID、old／new JFS（若適用）、Directory key fingerprint、before／after state、revision、time、result 與 sanitized reason；不得含 token、credential、raw provider payload 或 recovery data。

## 11. Sync, Freshness and Failure Contract

Current operating envelope 固定為最多 500 個 active／pending／attention managed identities；超過前須以實測重訂 SLO，不得直接線性放大。

- periodic：active、pending-auth 或 mismatch 每 15 分鐘；inactive 且 matched 每 24 小時。
- event：link confirm、employeeNumber與Employee active status等外部於sync的domain command，在同transaction持久化refresh demand；Directory refresh completion不能再觸發同類refresh形成回授迴圈。Lifecycle invalidation另依第5.5節，不與refresh demand混用。Commit後dispatch失敗只重試outbox；應寫outbox卻失敗時整筆domain rollback。
- manual／periodic dedup：同identity已有queued／retry request時合併；leased時manual只回原request，domain event另設`rerun_requested=true`。無in-flight時manual／periodic可合併60秒內最新request；domain event不得被已完成的60秒窗口吞掉，必須新建request。Leased row complete／dead時，在同transaction先終結它，再依rerun bit建立唯一successor（new sequence、attempt=0）並清bit；partial unique index不放寬。
- freshness：active／pending／mismatch observation 在 30 分鐘內為 `fresh`，超過為 `stale`；從未成功觀察為 `unknown`。inactive matched 使用 25 小時 threshold。
- adapter guard：每worker最多2 concurrent；所有OrgMaster instances、candidate、confirm、first-bind及background read共用DB `reserve_managed_directory_read_v1` budget，每60秒最多60次request grant，單HTTP timeout10秒、無SDK額外retry。Budget不可用或未取得grant不得發HTTP；local fixture用同一fake-clock contract，不能用per-process limiter冒稱project ceiling。此預算不涵蓋Google Admin或其他app的流量。
- retry：一個request最多5個lease attempts（初次＋最多4次重試），失敗間隔1s、2s、4s、8s加0～1s jitter；不存在第5次後的16s重試。Claim遞增attempt，worker crash／過期lease亦消耗attempt；第5個attempt失敗或到期轉dead。每attempt最多一次HTTP，僅429／quota／可恢復5xx可重試；4xx validation／permission直接dead，stable-key 404為成功known-negative。全域budget不足在lease前延後available_at，不消耗HTTP attempt；已claim後遇budget競爭則仍計attempt，保留可信值並可由下一periodic重新排程。
- projector：server monotonic request sequence是唯一完成排序authority，timestamp／etag只作顯示與比較。舊sequence只記superseded不更新observation／admission。Complete鎖內以當下current JFS重算mismatch，不用provider read開始時的舊assignment清除；讀取途中number改變由rerun successor再次確認。Error不抹可信值、不推論missing、不清mismatch。

上述 ceiling 比 Google 公開 quota 更保守，屬本應用自我保護值，不是供應商配額保證。若 live sandbox／production quota、使用者量或營運 SLO 不符，production activation前必須回 PM 調整本契約，而不是取得 write-capable scope或建立第二 adapter；不影響在固定500人envelope內完成source implementation。

## 12. UI Contract

唯一設定位置是正常「員工 → 單一員工明細 → 登入帳號」區段：

| 狀態 | 具權桌面主動作 | 所有人可見內容 |
| --- | --- | --- |
| 無 employeeNumber | `設定員工編號` | 尚未設定原因、active／link 阻擋說明 |
| 有號、未連結 | `連結公司帳號` | JFS、預期 username、Google Admin-first 說明 |
| 找不到／不符 | `重新搜尋` | 請至 Google Admin 建立／修正；不得有建立帳號 CTA |
| pending auth | `重新整理狀態` | 已連結目錄、等待首次登入，不宣稱啟用 |
| active matched | `重新整理狀態` | redacted username、目錄狀態、observedAt／freshness |
| alias mismatch | `重新整理狀態` | current JFS、last verified username、Google Admin 改名導引 |
| lifecycle mismatch | `重新整理狀態` | Employee／Directory差異與 Google Admin 待辦 |
| stale／unknown | `重新整理狀態` | 最後可信值、來源時間、警告與受限動作 |

- 不顯示 account-type selector、個人 Email 輸入、密碼、invite、create、rename、suspend、reactivate、session 或 Workspace mutation。
- 連結 modal 顯示 Employee、JFS、預期 username、唯一 redacted candidate、狀態與明確確認；candidate 不唯一或已失效時不可確認。
- refresh 顯示「已排入重新整理」而非「Google 狀態已更新」。
- 手機／窄版可閱讀完整狀態與導引，但不顯示設定、連結或 refresh 控制，也不能以直接 API 旁路 server permission。
- Section維持既有扁平資訊層級，不再包第二層card；JFS、redacted username、Directory／alias／lifecycle／freshness、observedAt每項只顯示一次。正常狀態不用常駐教學文，異常才顯示最短可行下一步。
- Dialog開啟時焦點進入第一個可操作欄位或確認鍵，Tab不得離開modal；Escape／取消關閉後回到原trigger。Server validation error以`role=alert`顯示、焦點移到summary或first invalid field，busy時主動作disabled且不可重複送出。
- 1440px與1024px桌面完整顯示唯一主動作；390px沒有水平overflow、截斷關鍵狀態或mutation controls。文字／icon不得只靠顏色表意，warning／error需有可讀標籤。
- 每次Browser QC完成visible error sweep：console error、page error、failed API request、未處理promise、hydration warning皆為失敗；read model的Employee、JFS、link與projection必須與API readback一致，空畫面或placeholder不算PASS。

## 13. Error Contract

| Code | HTTP | 語意 |
| --- | --- | --- |
| `EMPLOYEE_NUMBER_INVALID` | 422 | 不符合 JFS 格式／範圍 |
| `EMPLOYEE_NUMBER_REQUIRED` | 422 | active transition／link 缺 current JFS |
| `EMPLOYEE_NUMBER_CONFLICT` | 409 | current number 已被使用 |
| `EMPLOYEE_NUMBER_RETIRED` | 409 | tombstone，永久不可重用 |
| `EMPLOYEE_NOT_ACTIVE` | 422 | link／login 的 Employee 非 active |
| `DIRECTORY_AUTHORITY_UNVERIFIED` | 503 | tenant／domain／credential authority 未就緒 |
| `DIRECTORY_USER_NOT_FOUND` | 404 | 未找到精確 managed candidate；只在管理 UI 使用 |
| `DIRECTORY_PRIMARY_EMAIL_MISMATCH` | 409 | alias 命中或 primary Email 不精確 |
| `DIRECTORY_USER_INELIGIBLE` | 422 | archived／不屬 configured customer 等 |
| `DIRECTORY_IDENTITY_CONFLICT` | 409 | Directory identity 已綁他人／candidate 改變 |
| `AUTH_PROVIDER_MISMATCH` | 403 | 首次 bridge 不是合法 Google sign-in |
| `AUTH_DIRECTORY_SUBJECT_MISMATCH` | 403 | live Directory user 與 pending link 不同 |
| `IDENTITY_LINK_CONFLICT` | 409 | Employee daily singleton 或 auth principal 衝突 |
| `IDENTITY_QUARANTINED` | 409 | identity已進入conflict containment；Current Slice不可由UI恢復 |
| `IDENTITY_INVALIDATION_PENDING` | 409 | lifecycle receipt尚未完成，禁止重新admit或宣稱恢復 |
| `INVALIDATION_APPLICATION_UNREADY` | 409 | active application缺release-attested central epoch support |
| `MANAGED_IDENTITY_ADMISSION_DISABLED` | 503 | database admission authority關閉；只在受控管理／telemetry語意使用 |
| `PROJECTION_STALE` | 409 | 需要 fresh fact 的 link／clear 操作被阻擋 |
| `DIRECTORY_RATE_LIMITED` | 429 | adapter application／provider limit |
| `DIRECTORY_UNAVAILABLE` | 503 | timeout、quota exhausted 或 recoverable provider failure |
| `REVISION_CONFLICT` | 409 | Employee／identity compare-and-swap 失敗 |
| `IDEMPOTENCY_CONFLICT` | 409 | command ID 被不同 payload 重用 |
| `WORKSPACE_AUTHORITY_INVALID` | 503 | current manifest／current workspace不唯一、shape或revision無效 |
| `REFRESH_LEASE_NOT_OWNED` | 409 | worker ID／lease version／expiry不符；不得套用response |
| `LOGIN_NOT_AVAILABLE` | 404 | pre-auth resolver唯一對外negative；body不帶內部reason |

登入入口不回傳上表的 Employee／Directory診斷，只回 generic `LOGIN_NOT_AVAILABLE`或標準 authentication failure；詳細 reason 只進受控 telemetry。

## 14. Concurrency, Recovery and Security

- Employee number collision 由 database-level unique／tombstone invariant 加 transaction 保護；不能靠 preview 或 in-memory check。
- candidate 搜尋與確認間以第7.2節5分鐘random opaque capability防TOCTOU；確認時必須重新讀取Directory stable key。
- link、首次 auth bridge 與所有 Employee mutation 採 expected revision；衝突後 read current state 再由使用者重試，不自動覆寫。
- Employee identity／status、governance artifact、managed bind、gate與application support mutation必須遵守第16.2節同一singleton-row transaction fence；鎖內重讀current authority及old／proposed state，application-level precheck不能取代database fence。
- domain commit 後的 refresh 使用 durable local outbox／equivalent recoverable queue；外部 outage 不回滾 Employee，未處理 event 可安全重送。
- refresh claim每次遞增`leaseVersion`；complete／retry必須同時比對request ID、worker ID、lease version、`state=leased`且lease未到期。過期leased row可由另一worker reclaim並取得新version，舊worker response永遠不得落地。
- log、URL、Browser state、analytics、audit 與 screenshots 均不得包含 bearer token、service-account JSON、raw Directory response 或 credential。
- adapter 必須能以 fake／sandbox 證明所有 Google write methods 不可呼叫；runtime identity 也不得取得 write scope。
- PostgreSQL persistence 固定由 forward-only `db/migrations/012_dev047_managed_identity_bridge.sql`交付，只建立或修改 `orgmaster_core`／`orgmaster_contract`物件；001～011 不得修改，runtime 不得取得 table DML／owner／DDL／migrator privilege，且必須通過 `npm run check:db-boundary`。

## 15. Current Slice and Non-negotiable Implementation Decisions

Current Slice 固定為 `I0 Contract guards → I1 Registry persistence → I2 Directory read port → I3 API／UI → I4 First-login bridge／alias → I5 Sync → I6 QA／QC closure`。RD 可分 commit，但不得跳過前一 slice 的 gate 後把後段標為完成。

1. Employee canonical ID 仍是 `Employee.id`；`employeeNumber`是 OrgMaster-owned operational master-data extension，不加入 Firebase custom claims、不當 principal ID，也不成為其他系統的 foreign key。
2. Current employee number、tombstone、daily identity、projection、candidate lease、command receipt、outbox與 audit 共用單一 `ManagedIdentityRepositoryV1` transaction boundary。local-json 與 PostgreSQL adapter 必須通過同一 contract suite。
3. 新 Employee 由 `src/App.tsx`建立時固定 `inactive`。`inactive → active` 的 UI submit 必須先通過 server `activation-check`；workspace publish／server persistence 再執行同一 invariant，不能只靠按鈕流程。
4. 既有 active 無號 Employee 只由一次性 legacy exemption 保持相容：可閱讀、可維持 active，但不能 link。設定合法號碼後 exemption 永久結束；不得為新 Employee 建 exemption。
5. managed-daily link 不寫入可手動發布的 governance `identityLinks[]`，避免首次登入必須偽造管理者 publish。它由 managed identity registry 單一寫入，透過 `orgmaster_contract.v_active_principal_mappings_v1`的 additive union 成為 authentication mapping；既有 governance links 繼續承擔 `human_privileged`、legacy與其他非 daily 身分。
6. Current Slice 不擴充 `PrincipalAccountTypeV1`。`human_daily_managed`是 managed registry 的 `identityKind`；既有 admission enum與 DEV-045 mixed-account projection不重寫。未來若 consumer 需要顯示該分類，另開 additive contract version。
7. 一般已驗證 managed-daily session 的 OrgMaster read／ordinary action permission，以 auth middleware 已解析的 `employeeId`對 active published role assignment求值；只有 server-internal evaluator可走此路徑。治理 publish、身分 link、員編更正及其他 privileged mutation仍要求既有 `human_privileged` identity，不能用 daily identity升權。
8. DEV-045 local account-enrollment程式與測試保留為歷史 evidence，不刪資料、不改完成結論；正常 Employee UI、Vite local composition與 DEV-047 QC 改由 managed-identity API 接管，不再 render invite／create／Email輸入。Production server既有 `accountEnrollmentEnabled=false`預設保持不變。
9. Google adapter source可以交付並以 mocked HTTP驗證，但 production construction與 auth bridge flag預設關閉。沒有 tenant／domain／DWD receipt 時，啟用要求必須 fail closed，不得退回 local deterministic provider。
10. `012`只擴充現行 active-principal mapping producer，不改DEV-040 application entitlement欄位或授權語意。Production activation前必須由每個in-scope consumer readback證明「managed principal → Employee → current effective role」完整成立；若任一consumer直接依賴legacy internal view或無法接受現行V1 additive rows，應另建versioned contract／cross-repo migration，不能在DEV-047內暗改consumer。
11. Database的`managed_identity_admission_authority.admission_enabled`是managed mapping的唯一跨consumer kill switch；`ORGMASTER_MANAGED_IDENTITY_ENABLED`只控制OrgMaster process的route、worker與bridge construction，其他consumer不讀此flag。DB authority=false時所有consumer不得取得managed mapping；Node flag=false但DB authority=true不能保證跨app拒絕，因此不得把Node flag冒充backout或database admission authority。
12. Invalidation依第5.5節第9點區分legacy與managed；Employee停用／移除涵蓋兩者，不以managed gate推論legacy無session。Affected applications取變更前active catalog，與同commit提出的active catalog聯集去重；不能先移除application再遺漏其event。只有原本沒有可見principal且沒有既有obligation時可省略新event。恢復仍受全部既有receipt barrier約束。
13. local-json與PostgreSQL共用相同collision／admission／invalidation contract；local跨workspace artifact與managed registry的mutation使用root-level coordinator＋write-ahead transaction journal，不以兩次獨立atomic replace偽裝成一個transaction。
14. 所有Employee存在／status判斷共用current-workspace projection；任何引用governance organization snapshot或draft作principal admission的實作直接視為contract failure。
15. `012`不得修改舊`access_governance`物件。multi-application lifecycle event由`orgmaster_core`實作，既有`orgmaster_contract` V1 claim／complete／retry signature只換owned body；舊AI-PDM authority-switch path仍可用原相容函式。
16. `012`必須撤銷runtime對兩個unfenced persistence writer的EXECUTE，並把所有artifact write收斂到identity-fenced writer；rolling-compatible新code只在SQLSTATE=`42883`且managed feature明確disabled時，才可在`012`尚未套用前fallback舊writer，任何permission／contract error不得fallback。
17. managed producer仍符合frozen`organization.active-principal.v1`，故contract manifest既有hash保持不變。Migration執行前須assert該manifest row version／signature／payload為DEV-010已核准值，漂移即rollback；DEV-047另產producer fixture，不改vendor contract檔。
18. Directory user與Firebase pair是永久link：一般runtime沒有unlink／rebind／delete API。只有release-authority quarantine可把可疑identity轉`conflict`並失效session；恢復或換人必須另立治理DEV。

## 16. Physical Persistence Contract

### 16.1 PostgreSQL migration `012`

唯一允許新增的 migration 是 `db/migrations/012_dev047_managed_identity_bridge.sql`，header 固定：

~~~text
-- DB-CHANGE
-- owner: orgmaster
-- schemas: orgmaster_core, orgmaster_contract
-- contract-impact: orgmaster.identity-visibility / organization.active-principal.v1 managed-row expansion and current-employee enforcement
-- compatibility: additive
-- governance-review: DEV-047
~~~

Migration 必須以 `BEGIN`／`COMMIT`與 `SET LOCAL ROLE jenfu_orgmaster_migrator`執行，建立下列物件。文字 ID 上限 255；time 一律 `timestamptz`；所有 JSONB 只容許本表列出的 sanitized response／details，不保存 provider payload。

| Table | Required columns and constraints |
| --- | --- |
| `orgmaster_core.employee_number_assignments` | `employee_id text PK`、`employee_number text UNIQUE CHECK ^JFS[0-9]{4}$ and != JFS0000`、`revision bigint >=1`、`assigned_at/by`、`updated_at/by`；號碼只存 uppercase canonical value |
| `orgmaster_core.employee_number_tombstones` | `employee_number text PK`、`first_employee_id`、`first_assigned_at`、`retired_at nullable`；沒有 delete routine；current correction只可把舊號設 retired並新增新 tombstone |
| `orgmaster_core.employee_number_legacy_exemptions` | `employee_id text PK`、`source_workspace_revision`、`created_at`、`resolved_at nullable`；migration只從當時 authority workspace 的 active、無 assignment Employee seed；新 Employee不得新增 |
| `orgmaster_core.managed_identity_directory_read_budget` | singleton boolean PK／CHECK true、`granted_at timestamptz[] NOT NULL DEFAULT '{}'`且CHECK cardinality<=60；routine只保留最近60秒grant time，runtime無table DML；全OrgMaster共用，不按process配置獨立budget |
| `orgmaster_core.managed_identity_admission_authority` | singleton boolean PK／CHECK true、`admission_enabled boolean NOT NULL DEFAULT false`、`revision bigint >=1`、`updated_at/by`、`reason_code`；migration seed false，不授予runtime table DML |
| `orgmaster_core.managed_identity_invalidation_applications` | `application_id text PK`、`status CHECK active/inactive`、`support_state CHECK pending/verified`、`support_revision bigint >=1`、nullable `support_evidence_ref/support_verified_at/support_verified_by`、nullable `source_governance_version_id`、`updated_at`；CHECK要求active row必有source governance version，verified row三個support evidence欄位皆非null。Migration從唯一active governance policy的applications seed並強制含active `orgmaster`，初始support為pending。Release routine可預先建立`inactive/verified` support row；只有identity-fenced governance writer可依proposed active policy改`status/source_governance_version_id`，避免「必須先啟用才可認證、但未認證又不能啟用」的循環依賴 |
| `orgmaster_core.managed_daily_identities` | `identity_record_id uuid PK`、`employee_id UNIQUE`、`principal_id text UNIQUE`且CHECK固定`principal-managed:<identity_record_id>`、`directory_customer_id`、`directory_user_id`、`last_verified_primary_email`、nullable `auth_issuer/auth_subject/bound_at`、`link_state CHECK directory_linked_pending_auth/active/conflict`、`revision`、nullable `admission_revision bigint CHECK >=1`、nullable `admission_changed_at`、`created_at/by`、`updated_at`；`UNIQUE(customer,user)`與 non-null auth pair partial unique；兩個admission欄位必須同null或同時non-null |
| `orgmaster_core.managed_identity_observations` | `identity_record_id PK/FK`、nullable可信`primary_email`、`directory_state CHECK missing/present/suspended/archived/unknown`、nullable `source_etag`、`last_applied_request_sequence bigint >=0`、`adapter_outcome`、nullable sanitized `error_code`、nullable `trusted_observed_at`、`last_attempt_at`；error只更新attempt metadata，成功且sequence較新才更新可信欄位 |
| `orgmaster_core.managed_identity_candidate_leases` | `lease_id uuid PK`、`token_hash_sha256 UNIQUE`、`actor_binding_sha256`、Employee／employeeNumber／Directory key／expected primary Email／etag snapshot、`created_at`、`expires_at <= created+5m`、`invalidated_at nullable`、`consumed_at nullable`；不存raw token，同Employee＋actor只有最新未失效lease可confirm |
| `orgmaster_core.managed_identity_command_receipts` | `command_id text PK`、`request_hash_sha256`、`action`、`employee_id`、nullable `identity_record_id`、`response_payload jsonb`、`created_at`；同 command不同 hash拒絕，response payload須通過 redaction check |
| `orgmaster_core.managed_identity_refresh_outbox` | `request_id uuid PK`、`identity_record_id FK`、`trigger`、`state CHECK queued/leased/completed/retry/dead`、`request_sequence bigint UNIQUE`、`attempt_count CHECK 0..5`、`available_at`、`lease_version bigint DEFAULT 0`、nullable lease worker/time、`rerun_requested boolean NOT NULL DEFAULT false`、nullable `completion_disposition`、`created_at/updated_at/completed_at`、sanitized last error；single in-flight partial unique index，rerun規則見第11節 |
| `orgmaster_core.managed_identity_audit_events` | `event_id uuid PK`、nullable `command_id`、action、actor principal、Employee／identity refs、result、reason code、before／after hash、sanitized `details jsonb`、previous／event hash、`occurred_at`；append-only，沒有 runtime update/delete routine |

另建立`orgmaster_core.managed_identity_mapping_version_seq`及`orgmaster_core.managed_identity_refresh_request_seq`，兩者皆為`AS bigint MINVALUE 1 MAXVALUE 9007199254740991 NO CYCLE`。前者在auth pair、link eligibility、Employee active status、可信Directory state或global admission gate改變managed active-principal row時配置下一值；後者在真正新增refresh request時配置排序值；任一耗盡皆fail closed。Refresh outbox的partial unique index確保每identity最多一筆`state IN ('queued','leased','retry')`；60秒manual dedup與event rerun由同一transaction fence執行，不使用time bucket。

`012`建立private security-barrier view `orgmaster_core.v_current_workspace_employees_v1(workspace_version_id, workspace_revision, employee_id, employee_status)`：只讀active persistence batch、驗證唯一`orgmaster-workspace.v1.json` manifest、唯一`kind=current/status=active/id=currentVersionId` entry，再join同batch的`orgmaster-versions/<currentVersionId>.json`且要求payload `kind=document`、version為7或8、Employee ID唯一及status為active/inactive。`workspace_revision`固定為current workspace artifact的trimmed `canonical_sha256`。View不授予任何cross-app identity；managed routines與projection若讀不到exactly-one authority或Employee重複，一律`WORKSPACE_AUTHORITY_INVALID`。`employee_number_assignments.employee_id`與managed identity`employee_id`不得建立指向JSON artifact的假FK；migration seed與所有mutation只可使用此projection／同一套proposed-state extractor。Migration seed若找不到唯一current workspace，整個migration fail closed，不產生partial exemption。

`012`建立private append-only table `orgmaster_core.principal_identity_reservations(principal_issuer text, principal_subject text, employee_id text, first_seen_at timestamptz, source_kind text, source_revision text)`，PK為`(principal_issuer, principal_subject)`，所有欄位NOT NULL且非空，無runtime UPDATE／DELETE或release回收routine。Seed只讀active batch中現存V3 draft、全部published versions與managed record；同pair若曾屬不同Employee整個migration fail closed，輸出source hash／範圍／pair count，不能捏造已遺失的pre-migration歷史。Fenced writer在所有artifact寫入（含draft save／restore）把old與proposed pair以insert-if-same-owner封存，再檢查active雙維度collision；managed bind同transaction寫入此table。刪除／還原artifact不刪reservation。不同Employee永遠衝突；同Employee continuity只在legacy active mapping已撤銷時允許。此table取代易隨草稿移除而遺失保留的reservation view，且不授予cross-app consumer讀取。

`012`以forward-only方式重建`orgmaster_core.entitlement_change_outbox_event_kind_check`，加入`managed_identity_lifecycle_changed`，沿用同一session invalidation outbox。Lifecycle event依第5.5節第9點判斷affected principal，application set必須在鎖內保留old active catalog並聯集proposed active catalog（無policy變更則相同），每Employee／application一筆。舊application同commit改inactive不能刪event或support row。需要失效但affected app沒有verified support、缺active orgmaster或authority不唯一，一律整筆rollback；managed gate=false不能豁免legacy Employee lifecycle。為避免012剛套用就阻塞既有Employee停用，I0以contract fixture驗證legacy invalidation語意；正式切換前另須取得各legacy active app的真實support evidence，套用012後先以release authority attestation完成這些support，才放行新fenced writer服務；gate可仍維持false。沒有前一可見principal的準備資料不需新event，既有obligation仍保留。Owned core新增multi-app enqueue／claim／complete／retry，owned contract V1 wrappers保持signature並同時處理舊AI-PDM event；不alter舊access_governance object。派送仍使用`platform_contract.invalidate_employee_app_sessions_v1`。

Migration在變更contract view前assert`orgmaster_core.contract_manifest`中的`orgmaster.identity-visibility`仍為version `jenfu.orgmaster-contract.identity-visibility.v1`、signature `e400a51351fc1b5fab083ed94bcf0c62efdd0606d4316f354b2893f9bf82cf15`及payload `4d27c1e297b516207f931f57e443ecda99e260c56369132f9a269d11920cda96`；不update該row。Migration末尾撤銷runtime對`orgmaster_core.write_active_persistence_artifacts_v1`與`write_active_persistence_artifacts_with_entitlement_outbox_v1`的EXECUTE，並明列重grant所需read/media/alert/new fenced／managed routines；禁止沿用`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA orgmaster_core`。

### 16.2 Required database routines and contract object

Runtime不得直接DML上表。下列routine都必須為`SECURITY DEFINER SET search_path=pg_catalog`且逐一revoke PUBLIC、platform runtime與AI-PDM runtime；表後另依runtime／release／internal三類明列grant，不得整個schema批次授權：

| Routine | Atomic responsibility |
| --- | --- |
| `orgmaster_core.read_employee_managed_identity_v1(employee_id)` | 讀 Employee、assignment、link、projection、freshness與 allowed-action inputs；無資料時不建立 row |
| `orgmaster_core.read_managed_identity_activation_preflight_v1()` | release read-only preflight；回active catalog readiness、eligible count、pair/principal collision與pending invalidation count，不切gate、不建立row |
| `orgmaster_core.assign_employee_number_v1(...)` | workspace readback、格式／CAS／permission-input guard、current/tombstone uniqueness、舊 tombstone retire、新 tombstone insert、command receipt與 audit 同 transaction |
| `orgmaster_core.assert_employee_activation_v1(employee_id, workspace_revision)` | assignment存在或 unresolved legacy exemption才通過；回傳 correction flag；不 mutate Employee |
| `orgmaster_core.lease_managed_identity_candidate_v1(...)` | 驗證 current JFS、Employee active、fresh exact candidate、singleton與Directory collision後保存 5 分鐘 lease |
| `orgmaster_core.confirm_managed_identity_link_v1(...)` | consume lease、再次比對 Directory key／etag／Employee revision，建立 pending-auth identity、初始 observation、outbox、receipt與 audit |
| `orgmaster_core.bind_managed_identity_auth_v1(...)` | pending＋live verified readback；singleton fence內重查current authority、append-only pair reservation、legacy active與managed全部record collision，原子寫reservation、auth pair、active state、admission revision、receipt、audit；只允許同Employee continuity |
| `orgmaster_core.reserve_managed_directory_read_v1()` | budget singleton row lock下，以DB clock清除<=now-60s的grant；不足60筆才append now並回`allowed=true,retry_at=null`，否則回false及oldest+60s；獨立短transaction，不持domain／queue鎖或進行HTTP |
| `orgmaster_core.enqueue_managed_identity_refresh_v1(...)` | singleton fence下依第11節區分manual dedup與domain rerun，只有真正新request才配置sequence；不宣稱provider完成 |
| `orgmaster_core.claim_managed_identity_refresh_v1(...)` | FOR UPDATE SKIP LOCKED租用最多2筆，每lease同時遞增lease version與attempt；過期attempt<5才可reclaim；第5次到期由terminal handler取得singleton再處理dead／rerun，不持queue鎖反取singleton |
| `orgmaster_core.complete_managed_identity_refresh_v1(...)` | singleton→queue fence、typed outcome與sequence guard；鎖內重算current JFS mismatch，可信state變更原子寫admission revision／必要lifecycle event；終結request並消化rerun bit成一筆successor，不對自己再enqueue event |
| `orgmaster_core.retry_managed_identity_refresh_v1(...)` | singleton→lease fence；attempt1～4按1/2/4/8s排retry，第5次／不可恢復錯誤轉dead並消化rerun；expired-final-lease只由本routine terminal分支處理，CAS expiry＋lease version，不套用失效worker response |
| `orgmaster_core.prune_managed_identity_ephemera_v1(limit)` | bounded清理符合第19.4節retention的candidate／completed refresh rows；不得刪identity、receipt、audit或未解dead evidence |
| `orgmaster_core.write_active_persistence_artifacts_with_identity_fence_v1(...)` | 所有artifact write先取得singleton fence；從old／proposed artifacts推導current Employee、draft／published pair及catalog；封存reservation、檢查collision、保存old affected apps，再呼叫既有writer；Employee失效與multi-app outbox同commit |
| `orgmaster_core.attest_managed_identity_invalidation_support_v1(...)` | release authority可預先建立inactive verified support row，或以support revision CAS把既有pending→verified；不啟用application、不自行開gate |
| `orgmaster_core.quarantine_managed_identity_v1(...)` | release authority以identity revision＋incident ref CAS轉conflict、配置admission revision與audit；只有前一mapping在DB gate下可見時逐app invalidation，不可用來rebind |

OrgMaster runtime只可EXECUTE：read、directory-read-budget reserve、assign-number、activation-assert、candidate-lease、confirm-link、bind-auth、refresh enqueue／claim／complete／retry、bounded ephemera prune、identity-fenced artifact writer，以及既有read/media/alert routines；release preflight、support attestation、admission switch與quarantine只授予`jenfu_orgmaster_migrator`及明列的non-login release verifier（read-only preflight除外不得有mutation）；internal lifecycle/outbox functions不直接grant任何login role。既有unfenced artifact writers明確revoke runtime。

Refresh SQL介面固定為：`enqueue_managed_identity_refresh_v1(p_employee_id text, p_trigger text, p_command_id text, p_actor text)`；`claim_managed_identity_refresh_v1(p_worker_id text, p_limit integer DEFAULT 2, p_lease_seconds integer DEFAULT 30)`並回`claim_kind=leased|terminal_due`、request、identity、Directory key、request sequence、attempt、lease version／until；terminal_due不配置新lease、不發HTTP，只由第5次過期分支終結；`complete_managed_identity_refresh_v1(p_request_id uuid, p_worker_id text, p_lease_version bigint, p_directory_customer_id text, p_directory_user_id text, p_directory_state text, p_primary_email text, p_source_etag text, p_adapter_outcome text)`，可信時間由DB `clock_timestamp()`產生並回`applied|superseded`；`retry_managed_identity_refresh_v1(p_request_id uuid, p_worker_id text, p_lease_version bigint, p_error_code text)`，retryable分類由DB固定allowlist決定，caller不能傳布林改變策略。Worker以固定`LEASE_EXHAUSTED`呼叫retry時，DB僅允許attempt=5且leased已過期的terminal分支，仍CAS request／lease version但不要求過期owner仍存活；若已被reclaim或完成則no-op，不接受provider結果。Claim必須另回此類terminal-due request讓worker掃尾，不能靜默略過留下永久leased row。Complete只接受`present/suspended/archived`的成功user resource或stable-key 404映射的`missing`；customer／user ID不符、candidate miss與transport error不得走complete。

新增writer的SQL signature固定為`write_active_persistence_artifacts_with_identity_fence_v1(p_changes jsonb, p_source_revision text, p_updated_by text, p_reason_code text, p_operation_id text, p_entitlement_changes jsonb DEFAULT '[]') RETURNS TABLE(authority_version bigint, source_revision text, outbox_count integer)`；`p_operation_id`長度1～255且重試不變。先取得singleton fence，再把active batch與p_changes組成proposed set；以同一private extractor解析old／new current workspace、V3 active policy、draft／published pairs與catalog。Draft save不產生Employee lifecycle transition，但必須封存pair reservation。先計算old principal eligibility與old＋new affected apps，再同步catalog及artifact／既有entitlement outbox。所有新增active application均須已有verified support，包含managed gate=false但legacy仍服務的情境；不接受caller提供「已檢查collision」或affected Employee／application清單。

新Node repository在每次artifact write先呼叫fenced writer；只有收到SQLSTATE `42883`、managed feature明確disabled且啟動時尚未偵測到`012` capability，才可為pre-migration rolling window呼叫舊writer。`012`套用後舊writer對runtime已revoke，因此SQLSTATE `42501`、revision conflict、validation、catalog readiness或任何其他錯誤一律向上fail closed，不得fallback。這個相容分支在未來production release完成後應由新DEV移除，不能成為永久雙writer。

`set_managed_identity_admission_v1(p_expected_revision bigint, p_enabled boolean, p_actor text, p_reason_code text) RETURNS TABLE(revision bigint, admission_enabled boolean, affected_identity_count integer, outbox_count integer)`使用CAS；相同state為no-op且不bump revision，不同expected revision回`REVISION_CONFLICT`。內部`enqueue_managed_identity_lifecycle_invalidations_v1(employee_id, operation_id, actor, reason_code)`只可由上述fenced writer、refresh-complete及admission-switch routines呼叫，不授予runtime直接EXECUTE，避免caller任意偽造Employee lifecycle event。Operation ID分別使用caller command ID、`managed-refresh:<request_id>`及`managed-admission:<next_authority_revision>`，現有`UNIQUE(operation_id, employee_id, application_id)`提供replay去重；同operation但actor／reason不同須fail closed。

`orgmaster_core.set_managed_identity_admission_v1(expected_revision, enabled, actor, reason_code)`只授予migrator。先取得singleton fence，再作CAS及preflight；false→true鎖內重查current authority、legacy／managed collision、active catalog全部verified、active orgmaster及全部lifecycle receipts；任一失敗不切gate。true→false先保存old eligible managed Employees／active apps，於同transaction關gate、配置admission revisions並建立outbox。Gate切換、new bind、catalog publish互斥，不能只鎖查詢時已存在的employee集合而漏掉新row。Routine不是應用啟動時可自動執行的DML。

`attest_managed_identity_invalidation_support_v1(p_application_id text, p_expected_support_revision bigint, p_evidence_ref text, p_actor text)`只授予migrator；不存在的application只允許以`p_expected_support_revision=0`在同一call建立`inactive/verified/revision=1` row；既有pending或需更新evidence的row須精確匹配support revision，成功轉verified並遞增revision；已verified且evidence ref相同則回目前row且不bump。Mismatch一律`REVISION_CONFLICT`。Evidence ref是release capsule內可驗證receipt的opaque reference，不保存credential或raw response；routine永遠不能把status改active。Identity-fenced writer遇到新增active application但沒有verified support須回`INVALIDATION_APPLICATION_UNREADY`且整筆governance write rollback；成功後由writer寫入proposed governance version作source，不要求support evidence與尚未發布的version互相引用。移除application只把catalog row改inactive，不刪support history。`quarantine_managed_identity_v1(p_identity_record_id uuid, p_expected_revision bigint, p_incident_ref text, p_actor text, p_reason_code text)`同樣只授予migrator，沒有reverse routine；DB gate已關時仍可完成隔離，不因application support/outbox狀態而失敗。

Lifecycle outbox compatibility實作固定為private `orgmaster_core.enqueue_entitlement_change_v2(...)`、`claim_entitlement_change_outbox_v2(...)`、`complete_entitlement_change_outbox_v2(...)`、`retry_entitlement_change_outbox_v2(...)`；只有三個`orgmaster_contract.*_v1` wrapper授予OrgMaster runtime。Claim必須同時處理舊AI-PDM與新managed event，含expired processing lease reclaim；complete／retry保留既有worker lease fence、receipt更新與alert語意。V1 contract signature、return columns與dispatcher call site不變。

所有identity／Employee-status／governance artifact writer與gate／support routines共用短交易鎖序：先`SELECT ... FROM orgmaster_core.managed_identity_admission_authority WHERE singleton FOR UPDATE`，再取得persistence authority／batch、domain／reservation及outbox row locks。使用READ COMMITTED，所有old／proposed判斷在取得第一把鎖後重新讀取；鎖前read／preflight不具commit authority。已持queue row鎖的claim／prune不再要求singleton；complete／retry需要兩者時必須singleton在先。Migration及release mutation遵守同序；routine內不進行Google HTTP、等待provider budget或呼叫Platform。500人envelope採單一writer序列化，移除per-key advisory集合、NUL key encoding與phantom preflight風險；unique constraints仍保留。一般SELECT不受此row lock阻擋，故admission／receipt barrier本身仍須正確。[PostgreSQL row-lock規則](https://www.postgresql.org/docs/current/explicit-locking.html)是鎖定依據；原`\u0000`若解碼為文字亦不合法，PostgreSQL text不支援NUL。[文字型別限制](https://www.postgresql.org/docs/current/datatype-character.html)

`orgmaster_contract.v_active_principal_mappings_v1`維持既有八欄、version、manifest hash與grant；owned body改為`legacy-current UNION ALL managed-current`。Legacy branch直接從owned active persistence batch選唯一`orgmaster-governance.v3.json`、唯一`activePolicyVersionId`對應published `assignment-governance-v3`，讀取其`policy.identityLinks`，再join current-workspace Employee；不讀draft作admission，也不從舊`organization.v_active_principal_mappings_v1`再join，因舊view已先依snapshot workspace hash濾掉變更後的資料。Legacy link需status active、四個identity key非空、validFrom<=now且validTo為null或>now；mapping_version及published_at沿用active published version。Migration preflight必須確認V3 authority存在且唯一，不能默默改回V2。兩branch皆要求current Employee active且該Employee無pending／processing／failed lifecycle event；同pair或principalId重複保留既有consumer ambiguous拒絕，writer須事前阻止。不得alter舊organization／access_governance view。

Managed-current的其他exact predicate為：database authority enabled、`link_state='active'`、auth pair non-null、admission revision／changed time non-null且revision介於1與JavaScript safe-integer上限、最後可信`directory_state='present'`。`fresh／stale`不在predicate內；從未取得可信observation的`unknown`不admit。managed欄位固定映射：`contract_version='organization.active-principal.v1'`、`principal_issuer=auth_issuer`、`principal_subject=auth_subject`、`principal_id=managed_daily_identities.principal_id`、`employee_id=managed_daily_identities.employee_id`、`employee_status='active'`、`mapping_version=admission_revision`、`published_at=admission_changed_at`。Legacy欄位原值保持不變，只增加current Employee與invalidation barrier。`server/orgmasterPrincipalAdmissionRepository.ts`原有zero／ambiguous guard保留；managed row是additive expansion，legacy inactive row移除是既有`employee_status=active`語意的安全性落實，不是contract schema break。

DEV-040的application entitlement contract仍以Employee及既有效角色為權威，`012`不新增或重算role assignment。I6只需證明OrgMaster本repo的mapping與permission chain；Platform／AI-PDM等cross-repo consumer readback屬production activation gate。任何consumer若不能透過versioned contract取得managed mapping，須先建立相容版本與遷移證據，DEV-047不得以讀取`orgmaster_core`或legacy internal view繞過。

### 16.3 Local deterministic repository

`server/orgmasterManagedIdentityStore.ts`以`data/orgmaster-managed-identities.v1.json`保存與上述表對應的collections、schemaVersion=1及hash-chain audit。Local每個data root只允許一個writer process：啟動時取得exclusive owner file（PID、process start identity、root），僅在能驗證原process已不存在時清理stale owner；無法證明時拒絕第二writer，不能把in-process mutex當跨process鎖。取得既有root mutex後先持久化`data/orgmaster-managed-identity-txn.v1.json` prepare journal（operation、before／after hashes、可驗證after payload temp refs），再作verified atomic replaces，完成後標committed／清理。Startup或異常恢復只依完整journal roll-forward至同一after state；payload缺失／hash不符即整個workspace、governance及auth read/write fail closed，不能各自讀不同版本。所有共享資料讀取在prepare期間由coordinator阻擋，含auth／workspace GET，不只managed routes。內層repository不重取root mutex。第一次明確初始化才seed當下active無號Employee exemption與現存pair reservations；read不得建立空檔，後續不得補新exemption或移除reservation。

Local document同樣保存append-only `principalIdentityReservations`、fake-clock共用Directory budget、refresh rerun bit、`admissionAuthority`、current-workspace authority hash、application support state、admission／refresh sequences、candidate invalidation、refresh lease version與lifecycle invalidation events。一般初始化預設disabled且application support pending；只有`NODE_ENV=development`、loopback request且由`dev:local`明確注入的deterministic fixture可用`actor=system:local-fixture`建立verified synthetic support與enabled初始state，並在manifest標為`LOCAL_ISOLATED`。Preview、production start、任意environment string或Browser input均不得開啟local admission；local enabled evidence不能替代PostgreSQL default-off或production release-authority evidence。

Local deterministic Directory adapter只接受server依local fixture domain衍生的`jfs####@orgmaster.test`，為fixture回傳opaque Directory user ID；它不寄信、不建立Firebase／Google user、不呼叫網路。production adapter才固定`jenfu.com.tw`。Test可注入zero／alias-hit／archived／customer mismatch／429／5xx／timeout／out-of-order結果；產品UI不能切換adapter或輸入Email，local screenshot不得把synthetic username標為正式帳號。

## 17. Runtime, Auth and API Composition

### 17.1 Exact runtime flags and credential boundary

| Configuration | Contract |
| --- | --- |
| `ORGMASTER_MANAGED_IDENTITY_ENABLED` | production default／missing=`false`；只有exact `true`才可 mount managed routes與 auth bridge |
| database admission authority | `managed_identity_admission_authority.admission_enabled`預設false；只有release-authority routine可切換，active-principal managed branch必須讀此值 |
| `ORGMASTER_GOOGLE_DIRECTORY_CUSTOMER_ID` | production必填；固定 expected customer，Browser不得提交 |
| `ORGMASTER_GOOGLE_DIRECTORY_DOMAIN` | production必填且 Current Phase exact `jenfu.com.tw` |
| `ORGMASTER_GOOGLE_DIRECTORY_DELEGATED_SUBJECT` | production必填；只作受管 read-only DWD subject，不回傳／log |
| credential source | `google-auth-library`以 Application Default Credentials boundary取得；credential檔、JSON或secret值不得進 repo／argument／response／audit |
| OAuth scope | source constant硬編碼為唯一 `admin.directory.user.readonly`；不得由 environment放寬 |

`package.json`與 lockfile必須把目前已解析的 `google-auth-library@10.9.1`提升為 direct runtime dependency，不能依賴 `firebase-admin` transitive install。Adapter內部分離 `GoogleDirectoryAuthPort.getRequestHeaders()`與read-only HTTP transport；default factory以ADC＋delegated subject＋固定scope建client，若credential type無法證明delegation／exact scope便在preflight拒絕。Tests只注入fake auth headers與mock transport，不讀本機credential。Google adapter只宣告 `findExactCandidate`與`readByDirectoryKey`兩個 read method，沒有 generic request、create、update、delete、license或batch method。Source／AST contract test若出現 Admin Directory write path或 write-capable scope直接失敗。

Vite`dev:local`由明確plugin options以synthetic customer＋`orgmaster.test`建立local deterministic adapter；preview固定disabled。`startOrgmasterServer()`只有flag true且auth、PostgreSQL、customer、production exact domain、delegated subject與credential preflight均通過才建立Google runtime，任何缺項整個managed identity feature fail closed，不改用local adapter。Route／worker可在database admission false時建立候選與pending link，但session bridge的最後readback及所有consumer mapping仍由database gate fail closed。這個code path存在不代表production已核准啟用。

### 17.2 First-login integration

`VerifiedFirebaseIdentity`新增`signInProvider`、nullable normalized `email`與`emailVerified`，只取server已驗簽token的`firebase.sign_in_provider`、`email`、`email_verified`；Email trim＋ASCII lowercase。Request body、JFS、login hint或Browser profile不得指定Employee或覆寫claims。

Auth middleware必須在`pathname.startsWith('/api/auth')`的既有404／session guard前明確掛載alias POST；不能只在下游managed API新增handler。GET `/api/auth/mode` additive回`managedLoginEnabled:boolean`，由server runtime ready與DB admission決定；舊client／missing field視false，不能由Browser開feature。既有Firebase session endpoint流程固定：

1. 驗證revoked Firebase ID token；只嘗試resolve active principal，不在此建立session。
2. Active principal fast path不讀Directory；若server registry證明是managed pair，仍要求Google provider及verified Email。Legacy mapping維持原受支援認證方式，不將daily升格privileged。
3. 僅`principal_not_active`可進first-bind fallback，且runtime bridge及DB admission均須enabled；ambiguous、contract error、invalid token不能進fallback。
4. Fallback要求Google provider＋verified Email，先live Directory lookup取得customer／user ID，再以該stable key找唯一pending row；不是先以client Employee選row。Atomic bind在singleton fence內重查current Employee、pending revision、pair reservation與gate，成功再重走resolve。
5. 兩條路徑匯合後以同次current workspace／active V3 policy檢查OrgMaster有效role，再讀central epoch、建立session／cookie。任何失敗不發cookie；bind已commit而role隨後失效時保留正確link但拒絕session，不把永久pair rollback給他人。
6. Token invalid、Directory mismatch／unavailable、invalidation pending、gate disabled或無有效role皆回generic auth failure；sanitized telemetry才記內部reason。每次受保護request仍檢查mapping、role／epoch，不以登入時一次通過取代現行撤權機制。

Alias resolver只回`{provider:'google.com', loginHint, expiresAt}`，TTL 60秒；不回Employee、principal、Directory ID或角色診斷。沿用auth rate guard，並同時限制每IP及每normalized JFS各10次／分鐘（不是只限IP＋JFS tuple）；所有失敗分支同一`LOGIN_NOT_AVAILABLE` body。成功200會揭露可登入hint，故這不是「無法枚舉」保證；不得把JFS或Email當秘密或authorization evidence。跨application alias解析不在本slice。

### 17.2.1 Normal login UI and compatibility

`src/auth/AuthGate.tsx`在managedLoginEnabled時以JFS單欄位開始，狀態為`input → resolving → provider-ready → signing-in → exchanging → authenticated`；各階段僅一個主動作。輸入提交只呼叫alias resolver；provider-ready顯示「使用 Google 登入」，Firebase client在進入provider-ready前先完成`setPersistence(auth, inMemoryPersistence)`，不沿用SDK預設持久化；之後由使用者點擊產生user gesture，再用`GoogleAuthProvider`＋`signInWithPopup`與login_hint取得ID token並exchange。此managed path不收公司密碼、不自動account-link；login_hint只協助選帳號，Google實際驗證身分才是authority，session顯示實際登入Employee。

Popup取消回provider-ready；被阻擋顯示可重試提示；hint到期回input重新resolve；Google不同credential衝突回generic error，不自動合併Firebase使用者。登出沿用BFF cookie撤銷及Firebase client signOut。JFS、hint、ID token只留component memory，不入URL／localStorage／analytics；busy時防double-submit。此登入UI在390px仍可操作，「窄版唯讀」只限制Employee管理操作。

既有Email／密碼認證保留在次要「既有身分登入」入口及feature-disabled模式，確保尚未遷移的legacy／person-specific privileged身分可登入；它不是新managed帳號建立或改綁入口。Server依真實principal及provider決定admission，不信任前端入口標籤。Local deterministic四profile入口維持，另外用mocked Firebase client覆蓋JFS完整UI流程，不能以一鍵profile代替Google橋接證據。

SDK流程依[Firebase Google sign-in官方文件](https://firebase.google.com/docs/auth/web/google-signin)及[Auth state persistence文件](https://firebase.google.com/docs/auth/web/auth-state-persistence)。Google provider enable、authorized domains、popup於支援瀏覽器的live sandbox readback是production activation gate；本slice不加入redirect fallback所需的另一套持久化／hosting流程。

### 17.3 Permission evaluation boundary

新增pure `evaluatePermissionForEmployee(document, organizationSource, employeeId, request, options)`；`organizationSource`必須是同次server read取得的current workspace ID／revision／state，不接受caller手寫active布林，函式先確認Employee current active，再依active published policy沿用deny-overrides、scope、validity與role status規則。另新增pure `hasEffectiveOrgmasterRoleForEmployee(document, organizationSource, employeeId, now)`，只判斷第8.2節role資格，不把某一個permission grant當登入資格。兩者都不驗證身分，故前者只可由已經`readVerifiedRequestIdentity()`取得server session的authorization adapter呼叫，後者只可由server auth／alias adapter呼叫；公開governance evaluation endpoint繼續只接受issuer＋subject。

`orgmaster.employee_number.manage`與`orgmaster.identity.refresh`加入 `ORGMASTER_PERMISSIONS`；OrgMaster admin seed role取得兩者。`orgmaster.identity.invite`保留為DEV-045歷史permission但DEV-047沒有route／CTA。Local profiles固定：admin有 view／employee-number.manage／link／refresh；governance-manager只有 view／refresh；method-manager與employee沒有 identity view。Production的 link與number service額外驗證 active `human_privileged` admission，不能因 admin role或 daily session單獨通過。

## 18. Exact Repository and File Impact

下表是 Current Slice唯一允許的產品改動面；若 RD 發現必須越界，先更新本 DEV並經 Tech Lead review，不得順手擴張。

| File／module | Required change |
| --- | --- |
| `db/migrations/012_dev047_managed_identity_bridge.sql` | 新增第16節table／sequence／private current-workspace view／functions／index／explicit grants、legacy seed、DB admission authority、multi-app lifecycle outbox相容實作與active-principal additive union；revoke runtime舊unfenced writers，不改001～011或舊schema |
| `package.json`、`package-lock.json` | direct `google-auth-library`；新增DEV-047 test／QC scripts |
| `src/managedIdentity/types.ts` | exact read model、state axes、requests、responses、error union；無raw provider payload |
| `src/managedIdentity/employeeNumber.ts` | pure trim／uppercase／regex／derived username與generic alias input validation |
| `src/auth/AuthGate.tsx`、`src/auth/firebaseClient.ts`、`src/auth/authApiClient.ts` | 第17.2節JFS→Google popup→session完整client chain、additive mode flag、錯誤／取消／到期、既有身分與local profile相容；managed path不得使用email-password token |
| `src/managedIdentity/apiClient.ts` | 第9節exact routes、same-origin credentials、correlation/error mapping |
| `src/components/EmployeeIdentitySection.tsx` | 以managed read model完整取代invite/create UI；每個狀態只render一個主動作、唯讀facts與可見錯誤 |
| `src/components/EmployeeNumberDialog.tsx` | 單一JFS欄位、client preview、server submit、focus／error contract |
| `src/components/ManagedIdentityLinkDialog.tsx` | 自動搜尋唯一candidate、read-only details、明確confirm；零Email輸入與provider write CTA |
| `src/components/DirectoryDialogs.tsx`、`src/directories.ts`、`src/App.tsx` | 新Employee預設inactive；編輯Employee支援status；inactive→active先呼叫activation-check，失敗不commit local state |
| `src/index.css` | 重用既有dialog／identity styles，補狀態、warning與RWD；不得另做巢狀card或水平overflow |
| `src/governance/aiPdmCatalog.ts`、`src/governance/evaluatePermission.ts` | 新permission constants、帶current organizationSource的server-only verified Employee evaluator與OrgMaster login-role predicate |
| `server/orgmasterGovernanceIdentity.ts`、`server/managementMethodAuthorization.ts`、`server/orgmasterGovernanceApi.ts` | local role矩陣；一般verified session使用Employee evaluator；privileged store path不變 |
| `server/orgmasterFileStore.ts` | local root owner guard、shared read/write coordinator及prepare-journal fail-closed入口，所有跨artifact讀取遵守同一barrier |
| `server/orgmasterManagedIdentityStore.ts` | local-json repository、CAS、hash-chain audit、single-writer owner guard、read barrier、shared root lock、cross-file transaction journal、legacy exemption與startup recovery |
| `server/orgmasterManagedIdentityRepository.ts` | local／PostgreSQL repository port與routine adapter；business service不直接寫SQL |
| `server/orgmasterManagedDirectoryPort.ts` | disabled／local deterministic／Google read-only adapters、timeout、rate、retry；zero-write surface |
| `server/orgmasterManagedIdentityService.ts` | permission、Employee／revision guard、number、candidate、confirm、projection、refresh與idempotency orchestration |
| `server/orgmasterManagedIdentitySync.ts` | periodic/event/manual共用outbox worker、sliding dedup、lease-version fence、single-call durable backoff、request-sequence ordering與freshness projector |
| `server/orgmasterManagedIdentityAuthBridge.ts` | pending lookup、Firebase claims guard、live Directory stable-key match與atomic bind |
| `server/orgmasterManagedIdentityApi.ts` | exact HTTP router、origin/body/rate/error/redaction、single runtime composition |
| `server/orgmasterWorkspaceStore.ts`、`server/orgmasterApi.ts` | draft/current workspace save前呼叫registry activation invariant；新active Employee缺號回422且zero artifact mutation，legacy exemption維持可讀相容 |
| `server/orgmasterPersistenceRepository.ts`、`server/orgmasterGovernanceStore.ts`、`server/orgmasterIdentityLinkPolicy.ts` | feature-enabled PostgreSQL artifact write改走identity-fenced routine；把command ID傳入DB，解析proposed active links，共享singleton transaction fence與永久pair reservation／managed collision；local path由同一root coordinator保護 |
| `server/orgmasterFirebaseIdentityProvider.ts`、`server/orgmasterAuthApi.ts` | verified claims、pre-session alias route及mode flag、first-login fallback與共用role／epoch final gate；managed fast path仍驗Google provider但不讀Directory |
| `server/orgmasterPrincipalAdmissionRepository.ts` | contract query不改欄位；保留zero／ambiguous／employee-active guards並增加managed mapping tests |
| `server/orgmasterServer.ts`、`vite.config.ts` | additive`managedIdentityEnabled/runtime` composition；normal local掛DEV-047，production default false；明確分離Node feature flag與database admission authority，不提供runtime自動開gate |
| `qa/dev-047/contracts/active-principal.managed.json`、`scripts/qc-dev-047-contract.mjs` | managed producer fixture驗證既有frozen canonical-principal schema／manifest hash；檢查current-workspace authority、multi-app outbox wrapper與舊writer revoke |
| tests／QC listed in §21 | 同名unit、service、API、migration、auth、component與browser evidence；DEV-045 historical suite仍需PASS |

`src/accountEnrollment/*`、`server/orgmasterAccountEnrollment*`與`EmployeeAccountSetupDialog.tsx`本 slice不刪除、不由normal Employee入口import；它們只供DEV-045 regression。不得修改DEV-040 release infrastructure、production profile、migration ledger 001～011或其他repository。

## 19. Execution Order, Failure Recovery and Backout

### 19.1 I0～I6 gates

| Slice | Done condition |
| --- | --- |
| I0 Contract guards | types、scope／write denylist、frozen manifest、migration／explicit grants；回讀001～011／active V3 authority與legacy app catalog，固定seed coverage、無mapping仍可失效既有epoch的support requirement；無法成立須停止整合，不以gate=false繞過 |
| I1 Registry persistence | local與PostgreSQL contract suite通過format、CAS、tombstone、legacy exemption、singleton、cross-authority active collision＋historical pair reservation、DB admission default-off、mapping／refresh sequence、sliding dedup、lease reclaim fence、application support pre-registration／CAS、lifecycle outbox、gate-off quarantine、idempotency、audit hash、local journal recovery與explicit routine grants |
| I2 Directory read port | disabled／local／mocked Google adapter通過exact primary Email、stable key、timeout、429/5xx retry、4xx no-retry與no secret logging |
| I3 API／UI | number、activation、candidate、confirm、refresh routes與Employee normal entry完成；四local role與三viewport矩陣通過 |
| I4 Auth／alias | JFS pre-session resolver→Google popup→verified bridge→current mapping／role／epoch→session；pending-auth無pair可開始；popup取消／到期／錯誤與legacy入口相容通過 |
| I5 Sync | manual60秒dedup＋domain rerun、全instances共用60 grants／60s budget、concurrency2、5次lease attempts上限、expired-lease終結／reclaim、sequence及current JFS projector、stale preservation與dead可見性通過 |
| I6 Closure | targeted、DEV-004／009／045 regression、full suite、build、DB boundary、isolated PostgreSQL與browser evidence全綠，diff只含第18節 |

### 19.2 Crash and retry rules

- Provider read發生在 candidate lease／observation transaction之前；read成功但DB失敗不建立link，重新搜尋可安全重試。
- confirm transaction失敗時 lease未consume或整筆rollback；Browser read current state後重試同command。相同command與payload replay原response，不再讀Google；不同payload拒絕。
- first-login live read成功但bind失敗時不建session、不改principal mapping；相同token重試仍須重新驗證Firebase token與live Directory，不能用舊response補寫。
- transaction內的domain write、admission revision與durable outbox insert視為一個commit unit；任一insert／constraint／collision失敗，整個database transaction或local journal transaction都不commit。commit成功後的dispatch失敗不回滾domain state，而由同一outbox保留重試；定期sweeper只補refresh queue，不可事後猜測或補造遺失的lifecycle invalidation event。
- worker crash後row維持leased；attempt<5且lease到期才由新version reclaim，第5次到期由LEASE_EXHAUSTED terminal分支轉dead。舊worker response不得套用；complete／dead消化rerun bit成唯一新request。Request sequence只能防舊完成覆寫，不能取代domain rerun；細節以第11、16.2節為唯一規則。
- local store atomic replace失敗保留舊檔；invalid新檔另存 recovery evidence且managed routes fail closed，不影響Employee只讀、非identity治理與管理辦法。

### 19.3 Backout boundary

Current Slice的production安全backout不是只關Node flag。順序固定為：release authority先以expected revision呼叫`set_managed_identity_admission_v1(..., false, ...)`，在同transaction使managed branch不可見、bump admission revision並enqueue lifecycle invalidation；確認database state=false後，再關閉`ORGMASTER_MANAGED_IDENTITY_ENABLED`與回復application traffic。若DB disable失敗，不得宣稱backout完成。`012`是additive forward-only migration，不提供down migration、不drop table、不刪tombstone／audit，也不把舊V1 account routes自動打開。若view／routine有schema bug，以新的`013` forward migration修正，不能修改或回滾`012`。Production apply、enable、backout、traffic、smoke與receipt readback屬未來release capsule，本文件只固定contract、不授權執行。

Production activation順序固定為：先部署所有instance皆具`42883`限定fallback且能使用identity-fenced writer的相容code並確認舊instance已drain；套用`012`，驗證舊writer對runtime為`42501`且DB authority仍false；再開Node flag讓route／worker可做不具admission效果的準備，為每個active application完成central-epoch support attestation與invalidation drain；執行migration checksum、activation preflight、managed producer fixture及每個consumer的非production contract-conformance readback。之後保持managed入口／一般traffic封閉，由release authority以expected revision把DB admission切為true，立即執行production contract row／consumer mapping readback與受控session smoke；全部通過才開managed入口。因consumer看不到gate=false的managed row，文件不得把「live managed mapping readback」虛列為pre-gate證據；post-gate任一readback失敗立即依前段順序把DB gate切false並完成invalidation，再回復traffic。任何舊instance、unverified app、pending invalidation或preflight collision存在時都不得開gate。

現行DEV-040 R2 production runner仍依其frozen contract只驗證001～010 ledger並套用011；DEV-047不得修改該runner、release capsule或把012塞入現有release。未來production apply必須以新的release authorization明列012 hash、target、preflight、consumer compatibility與forward-fix程序。

### 19.4 Retention and bounded cleanup

- Employee number tombstone、managed identity、command receipt及hash-chain audit屬永久治理證據，Current Slice沒有automatic delete；raw token、provider body與credential從未保存。
- Candidate lease只有在expired／consumed／invalidated滿7天後可由bounded prune刪除；仍有效lease不可刪。
- Refresh `completed`（含superseded）滿30天可刪；`dead`只有同identity已有更高request sequence成功applied，且該dead row滿90天才可刪。queued／retry／leased與最新未解dead永遠不可prune。
- 每次sync worker完成batch後最多prune 500筆，使用`FOR UPDATE SKIP LOCKED`且獨立短transaction；prune失敗不改domain fact、不重試provider，但須產生sanitized telemetry。Retention clock只用database time，Browser／provider timestamp不可參與。

## 20. Acceptance Contract

### 20.1 Product and domain

- A1：Employee 可無號保存；新 active transition 缺號 fail closed；既有 active 無號保留 active、標示待補正且不可 link。
- A2：只接受 `JFS0001～JFS9999`，case-insensitive；單筆 commit 原子占號並建立 tombstone，跳號合法，批次與舊號重用拒絕。
- A3：同一自然人復職沿用原 Employee、current JFS、Directory link 與 audit；只依 current Position／adoption重算角色。
- A4：每位 Employee 最多一個 daily managed identity；Directory key 與 Firebase principal 皆不得綁他人。
- A4a：`principalId`由identity record永久決定；`mapping_version=admissionRevision`、`published_at=admissionChangedAt`，任何admission-relevant transition皆單調更新且不超過safe integer。
- A4b：legacy與managed principal的Employee存在／status都只讀current workspace manifest所指的document；draft或舊governance snapshot無法讓inactive Employee重新admit，既有lifecycle receipt未完成也無法在復職後提前恢復。
- A4c：一般runtime無unlink／rebind／delete；release quarantine同commit轉conflict且不可自行恢復；前一mapping曾在DB gate下可見時，同commit建立全部active app session invalidation，gate已關則隔離不得被outbox readiness阻塞。
- A4d：Firebase issuer＋subject一旦曾屬於某Employee，legacy與managed任何inactive／quarantined／published-history row都永久保留該歸屬；只能在舊active mapping移除後由同Employee延續，永不得轉給不同Employee。

### 20.2 Directory link and authentication

- A5：candidate endpoint 只能 server 衍生 current username；`users.get` alias 命中但 primary Email 不精確時拒絕。
- A6：Google Admin user 不存在、不符、archived、不同 customer、candidate 變更或已綁他人皆為 zero link mutation、zero provider write。
- A7：人工確認只建立 pending-auth Directory link；首次 live Google/Firebase authentication 經 Directory readback 相符後才原子綁定 Firebase principal。
- A8：Firebase UID、Directory user ID、Employee ID、JFS 與 Email 在 persistence、API、audit 與測試中不可混用。
- A9：OrgMaster正常登入UI／resolver只接受current JFS；matched與alias mismatch皆導向同一principal。舊JFS、inactive Employee、無唯一link或無current effective OrgMaster role均回generic拒絕；不把其他application或provider直接輸入舊Email的行為誤列為OrgMaster保證。
- A9a：legacy governance publish與managed bind併發時，共享database lock保證最多一方commit；不可能在active-principal contract留下同pair或同principal兩列。
- A9b：migration／activation preflight會掃描legacy current draft＋published history及managed所有record；歷史pair跨Employee重複即fail closed，同Employee legacy→managed continuity也必須先撤掉舊active mapping。

### 20.3 Projection and boundary

- A10：三種 trigger 共用同一 adapter／projector、dedup、rate limit、backoff 與 freshness；out-of-order response 不覆寫新 observation。
- A10a：同identity最多一筆in-flight；manual／periodic60秒dedup不吞domain event，leased時rerun、terminal時唯一successor；expired lease有5次attempt上限，舊worker／sequence不能改可信值；retention不刪未完成或最新dead。
- A11：最後可信Directory state為present的stale observation不單獨癱瘓既有合法access；never-observed unknown不admit。兩者皆使新link、mismatch clear與外部完成聲明fail closed。
- A12：Workspace entitlement 顯示 `unavailable_by_policy／unknown`，不得以 Licensing API、Gmail mailbox 或手動勾選宣稱 licensed／unlicensed。
- A13：OrgMaster UI、API、credential、runtime scope 與 mock call log 均證明 provider write count 為 0；預期外 mutation route 為 403／404。
- A13a：migration後database admission預設false；Node flag單獨開啟不產生managed active-principal row。已知Directory negative、Employee inactive、link失效或DB gate disable皆立即移除row並原子enqueue所有active application invalidation；receipt完成前重新active／present也不得readmit。
- A13b：`orgmaster`及每個active application都必須先有release-attested invalidation support；新multi-app event由owned core implementation enqueue並可由不變的contract V1 dispatcher完成，舊AI-PDM event不退化。
- A13c：`012`後runtime不能EXECUTE舊unfenced writers；contract manifest hash保持DEV-010核准值，managed producer fixture通過frozen canonical-principal schema。

### 20.4 UI and permission

- A14：超級管理者由正常 Employee 明細逐步看見正確唯一主動作；一般角色、shared identity 與窄版只有唯讀狀態。
- A15：refresh 成功只顯示 queued／deduplicated；只有 fresh readback 改變 projection 或清除 mismatch。
- A16：登入錯誤不暴露 Employee、帳號、角色或 mismatch 是否存在；管理 UI 才顯示可操作診斷。

### 20.5 Correction-review regression cases

| Case | 必測失敗模式與通過條件 |
| --- | --- |
| A17 登入端到端 | 無session＋pending-auth無Firebase pair可resolve；Google popup取得google.com token並只在role／epoch完成後發cookie；password token不能bind／登入managed pair；popup取消、blocked、hint過期、其他Google身分與legacy入口各有fixture |
| A18 Current Employee authority | 不改governance，只保存current workspace無關欄位、變更canonical hash，legacy mapping仍保留；current Employee inactive／移除則legacy及managed都消失；managed gate=false仍建立legacy lifecycle event |
| A19 永久保留 | Draft pair在012 seed或writer保存後刪除、還原舊artifact、identity inactive／quarantine，再分配不同Employee必拒絕；同Employee continuity僅舊active row撤銷後可通過；seed歷史覆蓋範圍不可誇大 |
| A20 併發及affected apps | Gate enable與new bind／application publish同時進行，新row不繞preflight；Employee停用同commit移除application，舊app仍收到event；outbox insert失敗全rollback；所有writer鎖序一致且無deadlock |
| A21 Sync不丟事件 | Leased read途中更正JFS，舊read完成不得用舊JFS清mismatch且必有一個successor；completed60秒內domain event不得去重掉；連續crash第5次到期為dead且不重複發HTTP；rerun等待retry成功或terminal再生successor，不能自行把attempt歸零；多instance＋inline read合計60秒grant<=60 |
| A22 恢復與舊session | Local在第一個artifact已replace後crash，所有讀取先阻擋再從journal roll-forward；第二writer拒絕。Central invalidation在mapping已移除時仍需更新曾發session的principal epoch，復職後舊session拒絕而新session可用 |

A22的Platform語意不能只用「function存在／回200／affectedPrincipalCount=0」代替。Support attestation必須附「先發session→移除mapping→呼叫invalidation→恢復→舊epoch拒絕」證據；若Platform實際以current mapping查principal而漏失，停止production整合並交由其owner提供versioned contract修正，不在OrgMaster讀sibling core或改dispatcher target冒充完成。Mock證據僅證明本repo遵守要求，不證明Platform已相容。

## 21. QA／QC Gate and Evidence

風險分級為 High，驗證依序為：

1. `S0 Contract`：狀態、資料鍵、API、permission、error、database admission default-off、active-principal exact predicate與zero-provider-write靜態契約互相一致。
2. `S1 Domain`：JFS格式、active gate、tombstone、singleton、CAS、idempotency、principal／mapping version、cross-authority lock、lifecycle invalidation、復職與角色重算單元／服務測試。
3. `S2 Adapter/Auth`：local deterministic＋mocked Google HTTP的exact primary Email、alias rejection、Directory key readback、first-login bridge、timeout／quota／retry與scope-negative tests；live nonproduction sandbox為production activation evidence，不是假造source gate。
4. `S3 API/UI`：正常 Employee 入口、權限矩陣、pending／active／mismatch／stale／unknown、generic login error 與三 viewport browser evidence。
5. `S4 Integration`：current JFS → provider sign-in → Firebase session → Employee／role allow；rename transition、inactive、known-negative、DB gate disable、invalidation retry、reactivation no-old-session-resurrection、role revoke、outage與out-of-order fail-seeking cases。
6. `S5 Boundary`：targeted tests、受影響 full regression、typecheck、client／server build、DB boundary（若有 migration）與 diff check。

FMEA至少覆蓋：把Firebase UID當Directory ID、Email-only link、alias命中誤連、候選token可推導／重送、候選確認競態、managed bind與legacy publish雙寫競態、inactive／quarantined／legacy published-history pair被轉讓他人、同Employee legacy→managed尚未撤active row就形成雙列、併發號碼碰撞、Node flag誤作DB authority、用舊governance snapshot或draft判Employee active、known-negative仍留active row、把candidate miss／403誤寫missing、停用再復職讓舊session復活、gate已關時quarantine被unready outbox阻塞、舊JFS resolver復活、把其他app role誤當OrgMaster登入資格、把provider舊Email行為誤當OrgMaster保證、永久dedupe key讓refresh餓死、expired lease舊worker覆寫、雙層retry放大quota、etag／timestamp誤作排序、`orgmaster` lifecycle event被AI-PDM-only enqueue拒絕、support認證與新application發布互相等待、新application未具invalidation support仍發布、unfenced writer繞過collision、contract manifest被不必要改hash、stale投影誤授權／誤撤權、Licensing write-capable scope被加入、retention刪除未解dead evidence及credential落入Browser／log。

真實瀏覽器 QC 最少使用 1440px、1024px、390px，從正式功能入口驗證狀態與 permission；API／DOM snapshot 不能取代互動證據。Google sandbox read-only evidence 不得冒充 production tenant、production mapping、deploy 或 release pass。

### 21.1 Exact test files and commands

`test:dev-047`固定涵蓋：

- `src/auth/AuthGate.managedIdentity.test.tsx`
- `src/auth/firebaseClient.managedIdentity.test.ts`
- `src/auth/authApiClient.managedIdentity.test.ts`
- `server/orgmasterFileStore.managedIdentity.test.ts`
- `src/managedIdentity/employeeNumber.test.ts`
- `src/managedIdentity/apiClient.test.ts`
- `src/governance/evaluatePermission.managedIdentity.test.ts`
- `src/components/EmployeeIdentitySection.test.tsx`
- `src/components/EmployeeNumberDialog.test.tsx`
- `src/components/ManagedIdentityLinkDialog.test.tsx`
- `src/components/DirectoryDialogs.employee-status.test.tsx`
- `server/orgmasterManagedIdentityStore.test.ts`
- `server/orgmasterManagedIdentityRepository.test.ts`
- `server/orgmasterManagedDirectoryPort.test.ts`
- `server/orgmasterManagedIdentityService.test.ts`
- `server/orgmasterManagedIdentitySync.test.ts`
- `server/orgmasterEntitlementInvalidationDispatcher.managedIdentity.test.ts`
- `server/orgmasterManagedIdentityAuthBridge.test.ts`
- `server/orgmasterManagedIdentityApi.test.ts`
- `server/orgmasterWorkspaceStore.managedIdentity.test.ts`
- `server/orgmasterPersistenceRepository.managedIdentity.test.ts`
- `server/orgmasterAuthApi.test.ts`
- `server/orgmasterPrincipalAdmissionRepository.test.ts`
- `server/dev047DatabaseContract.test.ts`
- `server/orgmasterServer.test.ts`

RD／QA完成順序與 pass evidence固定為：

~~~powershell
npm run test:dev-047
npm run qc:dev-047:contract
npm run test:dev-004:auth
npm run test:dev-009
npm run test:dev-045
npm run check:db-boundary
npm run build
npm test -- --testTimeout=30000
npm run qc:dev-047:postgres
npm run qc:dev-047:browser
~~~

`qc:dev-047:contract`執行`scripts/qc-dev-047-contract.mjs`，檢查route、scope、write-method denylist、frozen principal schema／manifest hash、managed producer fixture、current-workspace projection、legacy／managed共同Employee＋invalidation barrier、multi-app outbox V1 wrapper、migration object／explicit grant manifest、舊writer revoke、Node與DB兩層default false、active-principal欄位映射與old account UI未被normal entry import。A17～A22各自必須列在contract／postgres／browser manifest，附fixture、command、expected／actual與證據路徑，不可因舊測試總數通過而省略。

`qc:dev-047:postgres`只對明確提供的disposable PostgreSQL target依序套用001～012，執行managed bind／legacy publish同時競爭、legacy current＋published history與managed inactive／quarantined pair reservation、同Employee continuity、legacy與managed current workspace versus draft／old snapshot、DB gate enable／disable、gate-off quarantine、known-negative與stable-key 404、candidate miss／403 preservation、Employee inactive、multi-app support pre-registration／pending／verified／activate、舊AI-PDM event相容、outbox insert failure rollback、invalidation未完成不readmit、receipt完成後new session可建立而old epoch session拒絕、60秒sliding dedup、expired lease reclaim／old worker rejection、sequence supersede、retention safety、mapping version monotonic、舊writer42501、routine-only runtime與contract union cases；缺少isolated target時不得假裝PASS，也不得指向staging／production。`qc:dev-047:browser`使用task-owned ephemeral server／temp root，依AGENTS runtime規則記錄port、PID、purpose與cleanup，結束時關閉該process tree並確認port釋放。

### 21.2 Acceptance traceability

| Acceptance | Minimum owning evidence |
| --- | --- |
| A1～A4d | number policy、store/repository contract、activation-check、current-workspace authority、principal/mapping-version、conditional quarantine outbox、historical pair reservation、PostgreSQL concurrency、legacy exemption cases |
| A5～A8 | Directory adapter、candidate lease、service、auth bridge與ID-type negative fixtures |
| A9～A9b | alias resolver＋auth API＋current-workspace Employee／OrgMaster-role integration；rename／old JFS resolver scope／other-app role negative／inactive／role revoke／shared database lock collision／same-Employee continuity／cross-Employee historical pair rejection |
| A10～A12 | sync worker fake clock／failure injection、sliding dedup、lease-version／sequence、retention、read-model projection與Workspace unavailable-by-policy UI |
| A13～A13c | source contract scan、mock call log `read=expected/write=0`、unexpected route 403／404、scope preflight、DB authority、view predicate、multi-app support／outbox、old-writer revoke、frozen contract fixture與no-old-session-resurrection |
| A14～A16 | component tests＋normal-entry Playwright四profile／三viewport／keyboard focus／generic login error |
| A17～A22 | auth client＋middleware integration、current hash變更／gate-off legacy、append-only reservation、singleton concurrent transactions、fake clock worker／budget、journal讀取barrier；Platform live語意另以release-attested support receipt證明 |

Browser evidence固定輸出 `qa/dev-047/browser/manifest.json`及 1440x900、1024x768、390x844 screenshots；manifest含git HEAD、dirty files、served artifact hashes、profile、viewport、state、route results、provider read/write count、task-owned runtime與cleanup結果。PostgreSQL evidence輸出 `qa/dev-047/postgres/manifest.json`，只記target class、migration hashes、case結果與sanitized server version，不記connection string／credential。Mocked Google HTTP與local deterministic PASS只能標 `LOCAL_ISOLATED`。

## 22. RD Handoff, Stop Conditions and Evidence Ownership

### 22.1 RD 可開始的工作

- 依第18節直接建立types、repository、read adapter、service、API、UI、auth bridge、sync、`012` migration source與tests。
- 依 I0～I6逐slice交付；每一slice保存可重跑命令與原始結果，不把mock、local或isolated PostgreSQL證據升格為production evidence。
- 非production Google Workspace sandbox若已由owner提供，可追加live read-only feasibility evidence；沒有credential不阻塞I0～I6 source implementation，但阻塞production activation。

### 22.2 Stop conditions

遇到下列任一情況立即停止並回 PM／Tech Lead：

- 需要 Google／Firebase user、credential、session、license 或 Workspace data write。
- 無法以 read-only scope 隔離 Directory credential，或被要求加入 `apps.licensing`。
- 必須用 Email、JFS 或 Directory ID 取代現行 Firebase principal，或無法安全建立雙鍵 bridge。
- 現有 schema 無法在 `orgmaster_core`內以 forward migration 維持唯一性／tombstone／CAS。
- 需要批次、第二daily identity、OrgMaster resolver接受舊JFS、初次username例外或窄版mutation。
- production domain、tenant、credential、mapping、deploy 或 release 被當作 local／sandbox驗證的一部分。

### 22.3 Evidence ownership

- RD：contract tests、implementation evidence、sandbox adapter readback、build／regression與 zero-write proof。
- QA：驗證矩陣、負向案例、資料與狀態轉換、scope／credential boundary。
- QC：真實 browser、API readback、競態／故障注入與 evidence integrity。
- Google Admin／Platform owner：production tenant/domain、primary／backup owner、DWD read-only scope receipt、quota、credential custody 與 production mapping／release evidence。

## 23. Maturity Verdict

判定：`RD Implementation Complete / Local QA-QC Passed / CAPA Closed / Production Release Gated`。Round 1～13產品決策不變；I0～I6、A17～A22 與 CAPA 三出口已有本機／隔離證據，任何未預見的跨repo／權限邊界仍按第22節停止，不把 local evidence 宣稱為 production release authority。

### 23.1 2026-09-14 review findings and closure

| 原缺口 | 影響 | 本版契約修正 | 必要驗證 |
| --- | --- | --- | --- |
| P1：AuthGate只產password token；alias route會被auth middleware提前404 | Pending使用者無法走首次Google bridge | §9、17.2及18補完整client chain、pre-session route與共用session final gate | A17 |
| P1：對舊snapshot-filtered view再join current Employee | 普通workspace保存就可能使legacy全部消失 | §16.2 owned producer直接取active V3 links＋current Employee | A18 |
| P1：可變JSON上的reservation view／managed-only gate判斷 | 草稿移除可釋放pair；gate-off漏legacy失效 | §5.5、16.1 append-only reservation、old principal／old＋new affected apps | A18～A20 |
| P1：per-key鎖只涵蓋已查到的row；local mutex不隔離第二process／半寫入read | New bind／catalog phantom、local torn read | §16.2 singleton writer fence；§16.3 single-writer owner＋全read barrier | A20、A22 |
| P1：60秒dedup吞leased期間event；retry次數與per-project limiter未落地 | 同步需求丟失、crash無限reclaim、跨instance超budget | §11、16.2 domain rerun、5次attempt、DB共用read budget | A21 |

以上是文件層關閉，A17～A22均`NOT_RUN`，不能計入RD implementation／QA／QC完成率。新增物件只服務既有slice；未新增IAM寫入、批次匯入、第二同步管線或provider帳號遷移。

### 23.2 Evidence and remaining gates

- Review baseline：Git HEAD `5ee7968572db`；001～011既有migration及本輪開始時dirty檔均保留，DEV-047產品module與012仍未建立。
- Source evidence：`src/auth/AuthGate.tsx`、`src/auth/firebaseClient.ts`、`server/orgmasterAuthApi.ts`的Email／密碼與route順序；004 principal view的snapshot hash join；010 owned contract仍包舊view；`server/orgmasterFileStore.ts`為process-local mutex。上述是本repo現況，不把spec中planned模組當成已存在。
- 驗證層級：本輪只有RD文件自檢（Markdown結構、相關引用、狀態／契約一致性、diff whitespace），未跑product tests、build、migration、runtime、browser或獨立QC。
- 文件自檢結果（2026-09-14）：6份檔案寫入後readback一致；本輪新增行whitespace、fenced blocks及direct spec table columns通過；8個相關repo內文件引用存在；tracked docs `git diff --check`通過，未追蹤的DEV-047另逐行檢查。既有索引／歷史紀錄及無關dirty檔保留。
- Production gates仍未完成：Google provider enable／domain／tenant／DWD唯讀credential／owner／live sandbox／quota、各consumer在mapping移除後仍可失效既有epoch的support receipt、012套用與seed coverage／legacy support attestation、DB admission、post-gate consumer readback及release。缺任一項不得啟用production。
- DEV-040 R2當前release runner只允許既有001～011範圍；012須另走獲准release契約，不能因DEV-047文件Ready插入現行runner。Local／mock evidence的releaseAuthority始終false。

### 23.3 2026-09-16 implementation and CAPA closure

- 實作與驗證摘要以 [implementation slice](DEV-047-implementation-slice.md) 為準；PostgreSQL evidence 位於 [qa/dev-047/postgres/manifest.json](../../qa/dev-047/postgres/manifest.json)，CAPA 結案位於 [CAPA report](../reports/capa-dev-047-postgres-qc-readiness-2026-09-16.md)。
- Task-owned PostgreSQL `18.4` 已 fresh apply 001～012；A17～A22 六項 SQL 行為、target拒絕、runtime／version／result fail-closed、cleanup、contract checker、targeted regression、build及DB boundary通過。Runner同時接受 production contract major 17 與 local compatibility major 18，並記錄 exact version；不接受其他 major。
- 真實 execution 修正 012 source 的 principal UUID、contract view欄名、routine signature、NUL hash與PL/pgSQL ambiguous-column問題。012尚未套用production；本輪未連線shared／staging／production資料庫。
- 23.1～23.2 保留為2026-09-14文件審查歷史，不得用其中的`NOT_RUN`／`RD Not Started`覆蓋本節現行狀態。

## 24. Change Log

- 2026-09-16：依 DEV-047 CAPA 完成 runner、contract checker、負向判定測試與 012 source repair；task-owned PostgreSQL 001～012、A17～A22、cleanup、targeted regression、build及DB boundary通過。CAPA三出口結案；production migration／activation／release仍gated。

- 2026-09-14：依使用者「審視及優化開發文件」完成correction review；修正auth client／pre-session路由缺口、舊snapshot view相依、永久pair reservation、gate-off legacy失效及old＋new application集合，將per-key鎖收斂為singleton短交易fence，補local owner／讀取barrier、domain rerun、5次attempt與共用Directory budget。新增A17～A22；保留Human Decisions及I0～I6、production gates。以下2026-09-08紀錄為歷史判定，不代表本輪新驗證通過。

- 2026-09-08：依RD Tech Lead第二輪失敗導向審查補齊架構。新增current-workspace Employee唯一authority並同時約束legacy／managed mapping與readmission barrier；以owned core multi-app outbox實作保留contract V1 dispatcher，修正既有AI-PDM-only enqueue限制；新增可在policy啟用前完成的application invalidation support attestation、撤銷runtime舊unfenced writers與限定42883 rolling fallback；把candidate改為random opaque capability，將refresh固定為sliding dedup、lease-version reclaim、single-call durable retry、request-sequence ordering與bounded retention；固定OrgMaster role gate、跨legacy history／managed record的permanent pair reservation、gate-aware quarantine、contract manifest hash不變及post-gate readback／backout順序。本輪仍只修改文件，未建立012、未改source、未啟動runtime或接觸production。
- 2026-09-08：依RD Tech Lead review完成correction pass。補上migration預設關閉的database admission authority及release-only enable／backout routine；固定active-principal managed branch exact predicate與欄位映射；以共享advisory lock關閉managed registry／legacy governance雙寫競態；定義immutable principal ID與monotonic mapping version；把Employee／Directory／link失效、central-epoch outbox及readmission barrier收斂為同transaction，阻止舊session在復職／恢復後復活；將「舊JFS拒絕」限縮為OrgMaster resolver保證並把Google rename／alias列為外部readback gate。前次P0=1／P1=4已在文件契約層關閉；本輪仍未修改source、migration、runtime或production。
- 2026-09-08：依使用者要求由 `RD Contract Ready`升級為 `RD Implementation Ready`。固定server-owned employee identity registry、legacy active exemption、`012` forward-only physical schema／routine-only runtime、active-principal additive union、normal UI replacement、first-login fallback、verified Employee permission boundary、I0～I6 file plan、crash/backout規則、exact tests與evidence。當輪只改文件；source、migration、sandbox、production與release尚未執行。
- 2026-09-08：依使用者要求由 `Brief Ready`升級為 `RD Contract Ready`。固定雙鍵 identity bridge、Directory exact lookup、logical data／state／API／permission／error、sync SLO、Workspace licensing read-scope限制、QA／QC與 stop conditions；只改文件，不代表實作或 production 整合完成。
