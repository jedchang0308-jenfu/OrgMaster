# DEV-050：員工編號或公司 Email 單一 Google 身分登入

> **2026-09-24 ownership／command 修訂引用**：authority資料、唯一CAS命令及receipt／outbox由本owner擁有，typed身分事實供其他投影重用；Platform只做invalidation，取消Platform v3，舊入口ACL cleanup後置。 以 [現行native契約](DEV-057-identity-and-grant-contract-boundary.md#principal-owner-command-amendment)為B目標；本文件下方保留歷史行為、驗收分母與evidence，不代表B已上線。

> **2026-09-24 B 實作定案對齊（Documents Only）**：雙識別入口不改產品流程；解析後必須經已發布pair→principal與typed account，不能以email或employee列數授權。新session／epoch與writer invariant由DEV-057承接。目前架構與精確實作依 [principal-first契約](DEV-057-identity-and-grant-contract-boundary.md#principal-implementation-contract)，成熟度 `Architecture Finalized / RD Implementation Ready`；下方evidence原樣保留，不表示已發布B。

文件成熟度：`RD Implementation Complete / Architecture Contract Implemented 2026-09-18`
架構審查：`Architecture Finalized — R2 / Implemented and Verified / 2026-09-18`
交付狀態：`Production Released / Canonical-first Correction Complete / Workspace Google + Employee Number Current Evidence / Free + Full Browser Pending`
風險：`High`（首次身分綁定、登入授權與共用資料庫相容性）
父交付點：DEV-049；相容基線：DEV-047／ADR-007

本文件是 DEV-050 的單一設計權威。R2 修正前版 Email 一致性、並行重試及共用 view 邊界的錯誤，取代前版「closure PASS／P0=0／P1=0」宣告。OrgMaster產品實作、本機QA／QC、provider、migration、DWD、admission、base release及canonical-first correction owner release均已完成；Workspace Google／工號current evidence已取得，目前只剩Free-only／無Gmail、negative／rate／race與完整Production browser matrix。

查證基準：`codex/dev-049-existing-google-account@0ff634f2373b388703d9124b3c09d48a1dd3d978`。父 owner receipt 的來源仍記錄 `b839003` 的受控工作樹；不能把該歷史 receipt 改寫成目前 commit 的驗證報告，詳見 §9。

決策來源：使用者要求免費身分方案、同一 Google 帳號可用員編／公司 Email 登入，並要求開發文件、架構定案及技術主管優化。
追溯 ID：`USER-2026-09-17-CLOUD-IDENTITY-FREE-DUAL-IDENTIFIER-LOGIN-BRIEF`、`USER-2026-09-17-DEV050-DEVELOPMENT-DOCUMENT`、`USER-2026-09-17-DEV050-ARCHITECTURE-CONFIRMATION`、`USER-2026-09-17-DEV050-RD-TECH-LEAD-OPTIMIZATION`。
父契約：[DEV-049](DEV-049-existing-google-primary-account-link.md)、[DEV-047](DEV-047-permanent-managed-identity-link-and-login-alias.md)、[ADR-007](../adr/ADR-007-external-role-catalog-assignment-boundary.md)。

## 1. 產品結果與非目標

一位 Employee 只連結一個公司 Google 主帳號。使用者在同一欄輸入 current `JFS####` 或已連結的公司 primary Email，完成 Google 驗證後取得同一 principal／Employee session。員編沒有另一組密碼。

- identifier 是本人核對值，不是 credential、principal key 或查詢其他人的權限。
- 身分權威維持 verified Firebase issuer＋subject、Google Directory customer＋stable user ID，以及有效 Employee／admission／OrgMaster role；Firebase UID 不得當成 Directory user ID。
- Cloud Identity Free-only 與已有 Workspace 帳號共用此流程；OrgMaster 不建立 Google 帳號、不讀寫 license、不管理密碼／MFA、不改 primary Email。「免費」指避免額外購買不需要的 Workspace 授權，不承諾雲端與維運總成本為零。
- 只接受 configured company domain 的 exact linked primary Email；不接受 Email alias、舊員編、模糊搜尋、跨 customer、一般 rebind 或一人多 daily identity。
- 只修改 OrgMaster app-local 登入。SSO handoff 啟用時仍優先使用 DEV-013 平台入口；不修改平台 UI、broker、owner 公開契約或其他 repo。
- 不修改管理員設定員編的橘／綠格式提示、常駐編號清單或排序；登入頁不得顯示帳號存在性。
- Google Admin 授權營運、primary Email 更名後的受控重新同步、legacy password 移除及正式部署不在本 DEV。更名時可安全拒絕，但不能宣稱既有「重新整理狀態」就能修復，見 §5。

## 2. 本次審查決策與直接證據

| 問題與證據 | 風險／修正決策 |
|---|---|
| 前版以 token Email＝live primary，以及 observation＝last-verified，推論四者相等；`read_managed_login_identity_v1` 沒回傳 Email | 兩組相等不能建立交叉相等。新增 private repository snapshot，在同一資料快照取得 identity＋stored primary；明確要求 token＝live＝stored。owner DTO 不變 |
| migration 013 先驗 expected revision，再查 receipt；local store 另有 same-pair 收斂 | 舊 pending snapshot 不能直接重放 SQL。app-local verifier 最多一次受控重讀與重試，保留原 request ID／hash；未知寫入結果不盲重試 |
| 共用 `v_active_principal_mappings_v1` 已授權 platform／AI-PDM 讀取（migration 012 的 GRANT） | 不能把 OrgMaster role 當成所有應用的 identity admission。新增 app-scoped view，不 replace 共用 view，不改其 rows／ACL |
| migration 013 managed 分支缺 OrgMaster role；legacy 分支也未驗 application active | OrgMaster repository 改讀 app-scoped view，讓此 app 的新 session、既有 session 驗證及 SSO callback 一起受 application／role gate；不是只在新 UI 補判斷 |
| 前版 shared core 接 optional 授權 callback，owner 與 app-local 授權語意不同 | 不抽泛用 core、不改 owner orchestration。只重用既有 repository、parser、digest、pure snapshot matcher；app-local service 的 role guard 不可選 |
| `qc-dev-047-contract.mjs`／`qc-dev-049-contract.mjs` 硬編碼舊 bridge／`resolveFirebaseIdentity` | 實作必須更新被取代的斷言並保留其安全意圖；不能一面刪 fallback、一面要求舊 source-string 檢查原封不動通過 |
| 前版瀏覽器只渲染 AuthGate harness，為此新增 production port | 改用正常 `src/main.tsx` 入口與 test-build-only Firebase module replacement；不新增 production test flag／可選 port |

查證檔案：`orgmasterAuthApi.ts`、`orgmasterPrincipalAdmissionRepository.ts`、`orgmasterSsoHandoff.ts`、`orgmasterManagedIdentityService.ts`、`orgmasterManagedLoginService.ts`、`orgmasterManagedIdentityRepository.ts`、`orgmasterManagedIdentityStore.ts`、migration 012／013。以上為 source inspection，不是新產品測試證據。

維持前輪刪除決策：不採 HMAC attempt endpoint、60 秒 app TTL、額外 secret／cookie、Email／員編 SQL resolver、pre-auth 帳號存在性查詢或端到端 exactly-once 協定。

## 3. 最小責任與資料流

```text
單欄 JFS／Email → Google popup → Firebase token＋凍結的 identifier
 → 既有 POST /api/auth/firebase/session：驗 token／auth_time／epoch
 → app-local service：以 verified stable key 讀 live Directory＋本人 repository snapshot
 → 核對 identifier／Email 三方一致／Employee／OrgMaster role
 → 既有 verify write：鎖、revision、pair、receipt，必要時 pending → active
 → post-read＋OrgMaster canonical admission＋再次 epoch read
 → 既有 session store／cookie
```

- Auth API 擁有 transport、origin／rate limit、token verifier、epoch、canonical admission、session。
- `ManagedIdentityServiceV1.verifyManagedLoginIdentifier` 擁有 app-local identifier 與 bind 前 role guard。取代舊 Email-search fallback，不建立另一套 Firebase verifier。
- Repository 只新增 private snapshot read；沿用既有 write routine／local store 交易，不把 Directory 網路呼叫放進 transaction。
- OrgMaster 專用 principal view 擁有此 app 的 session admission；共用 identity view 與 owner API 繼續原職責。角色仍來自同一 published governance，不複製權限資料。

Browser 不送 Employee ID、Directory key、expected revision、request ID、actor 或權限旗標；popup hint 不是驗證證據。

## 4. HTTP、分支與錯誤契約

沿用 `POST /api/auth/firebase/session`：

```ts
type FirebaseSessionRequest = {
  idToken: string
  managedIdentifier?: string
}
```

- 沿用 JSON body 32 KiB、ID token 16 KiB、same-origin、rate limit、no-store 與 cookie 防護。
- 欄位存在時必須為 trim 後非空、UTF-8 ≤254 bytes 的 string；null、非字串、空白、過長回 400，不能當成 omitted。
- provided：先查 verified issuer＋subject 的 canonical active principal；存在時直接沿用，identifier不得迫使既有principal重綁。只有exact `principal_not_active`才要求managed mode啟用並進managed verifier；其他canonical錯誤不得fallback，也不得用Email搜尋bind。
- omitted：僅保留既有 canonical principal 登入，包括既存 password／Google principal；不得 managed fallback、首次 bind 或以 token Email 搜尋 mapping。
- 相容分支不承諾每次登入都 live-check Directory；identifier 不是第二認證因子。任何日後「全入口必須 live-check」政策另行規劃，不能暗中改本分支。
- 成功 response／session cookie shape 不變。public `/api/auth/managed/alias` 統一 404、zero lookup，前端移除呼叫；這是明示的 app-local 相容性變更，舊頁需重新載入。
- `/api/internal/managed-login/v1` 保留 caller 驗證、action／DTO 與既有授權；Browser 不得呼叫它，app-local 不偽造 platform caller。

固定順序：

1. 解析 body、凍結 identifier；驗 Firebase token／auth_time；讀第一次 auth epoch。server 另產生 `randomUUID()` 作 write request ID，不沿用 client 可提供的 correlation ID。
2. 先呼叫 `resolveActivePrincipal`。Existing principal直接沿用且zero managed write；`principal_ambiguous`、contract mismatch與directory unavailable等錯誤原樣fail closed。
3. 只有provided且canonical精確回`principal_not_active`時，檢查Google provider、verified company Email、唯一Google user ID並呼叫managed verifier；verifier後重查app-scoped view，逐一比對principalId、employeeId與mappingVersion。保留repository的safe-integer檢查，再以`String(principal.mappingVersion)`對verifier decimal string；不可先對不安全值取Number。Omitted＋not-active維持zero fallback。
4. 讀第二次 epoch；authEpoch／revokedBefore 有變化或 token 已失效即 zero session。session 使用第二次 state。
5. 建 session／cookie。合法 bind 已完成而後續 role、epoch、canonical 或 session store 失敗時，不自動 unbind；該 request 不發 cookie，下一次登入重新驗證。

| 失敗類別 | HTTP／code | Browser 資料邊界 |
|---|---|---|
| body 無效／前置 token 或 epoch 無效／rate limit | 400／既有 request code；401／既有 auth code；429／既有 rate-limit code | 不查 Directory 或 mapping |
| token 通過後 identifier、pair、Employee、role、admission、lifecycle、Directory known-negative | 403 `login_not_available` | 不回存在性／Email／revision；zero session |
| Directory／repository／governance／canonical 不可用，或受控 retry 後仍 revision conflict／receipt collision | 503 `principal_directory_unavailable` | 不把內部 409 或原始 DB error 傳 Browser |
| session store 不可用 | 503 `auth_server_not_configured` | 已合法 bind 不補償回滾 |

所有 error body 保持 `{code, correlationId}`。錯誤分類在 service／Auth API 顯式映射；不得以 catch-all「繼續 legacy」處理。

## 5. 身分快照、寫入與重試

### 5.1 不擴張 owner DTO 的 private snapshot

`ManagedIdentityRepositoryV1` 新增：

```ts
type ManagedLoginSnapshot = {
  identity: ManagedLoginIdentity
  primaryEmail: string
}
readManagedLoginSnapshot(customerId: string, userId: string):
  Promise<ManagedLoginSnapshot | null>
```

- PostgreSQL：**單一 SQL statement** 將既有 STABLE `read_managed_login_identity_v1($1,$2)` 結果，LATERAL join 同一 Employee 的 STABLE `read_employee_managed_identity_v1`。讀 raw row，不能經會丟失 identityRecordId 的 UI read model。
- join 必須核對 identityRecordId、employeeNumber、registryRevision（以 text 比較）及 link state；detail 必須 active／admission enabled，primaryEmail 非空。0 筆拒絕；多筆或 malformed row fail closed。
- 第一個 routine 已限制 observation primary＝identity last-verified、present、有效 Employee／admission／lifecycle；第二個 routine 提供 last-verified primary。同 statement 使用同一快照，不作兩次分離 await。
- local-json：一次 `readExisting()`，沿用 local identity guard，從同一 document／record 取 lastVerifiedPrimaryEmail；多筆 stable-key match 拒絕，不用 `find` 靜默選一筆。
- 保留公開 `ManagedLoginIdentity` DTO、`readManagedLoginIdentity` 及 owner read/write behavior；不新增 SQL function、table grant 或另一份儲存狀態。

### 5.2 必須實際建立的相等關係

server 先用既有 `parseEmployeeNumber`（trim／uppercase，JFS0001～JFS9999），否則用 `parseManagedPrimaryEmail`（trim／lowercase、configured domain）。解析失敗 generic deny，不查其他帳號。

兩 branch 都必須滿足：

```text
verified token Email = live Directory primary Email = snapshot.primaryEmail
verified Google user ID = live Directory user ID = snapshot.identity.directoryUserId
configured customer = live customer = snapshot.identity.directoryCustomerId
```

JFS 另比對 snapshot 的 current employeeNumber；Email 另要求 normalized input＝上述 primary。stable identity、pair shape、Employee active、published active OrgMaster application、有效 active global role、admission 與 lifecycle 都必須通過。

更名反例必測：token／live 都是 new Email，observation／last-verified 都是 old Email；舊 predicate 兩組各自成立，但本設計必須拒絕兩種 identifier。現有 refresh 只更新 observation，不能承諾更新 last-verified；更名後的受控修復另行規劃，不允許自動 rebind、舊 alias 或略過一致性。

### 5.3 App-local verifier 與有限重試

方法：`ManagedIdentityServiceV1.verifyManagedLoginIdentifier({requestId, managedIdentifier, identity})`；identity 為 Auth API 已驗證的 `VerifiedFirebaseIdentity`。回傳 `{principalId, employeeId, mappingVersion}`。

固定流程：claims／parser → reserve Directory budget → stable-key live read → private snapshot → §5.2 核對 → 必要的 Employee／published app＋role guard → digest → existing verify write → post-read／role guard。

- 以原始 accepted snapshot 固定 `managedLoginRequestDigest` 的 expected；authenticatedAt 取 verified token，actor 由 server verified issuer＋subject 組成。同一 server 操作內 request ID／hash 不變。
- 重用 `expectedManagedLoginIdentityMatches` 的 pure 判斷，不移動 owner orchestration，也不新增 optional role callback。app-local guard 必做；既有 `hasPublishedOrgmasterAccess` 補 application active 檢查。
- 第一次 write 收到**確切 revision conflict**，最多重讀一次。只有 snapshot 完全相同，或同 stable identity／current number／registry revision、同 issuer＋subject、pending→active 且 identity revision 正好＋1，才允許重試。
- 重試前重新驗 snapshot Email、pair、Employee／role；傳新 read 的 current，但保留原 request ID／hash。不同 pair、員編、Email、其他 revision drift 或 idempotency conflict，不重試。
- 此順序是必要條件：013 SQL 的 revision gate 在 receipt lookup **之前**。不能拿舊 pending snapshot 重送並聲稱會命中 receipt。
- 連線中斷等未知 commit 結果回 503，不盲目另建 request ID 寫入。使用者再次登入是新操作，重新讀 active 同 pair 即可；不保證重用上次 session。
- write 回來後重讀 private snapshot，要求與 returned active identity 完全一致且 Email／role 仍符合，再交 Auth API canonical／epoch gate。觀察到任何 drift 就不發 session。

交易保證：同 Employee／pair 最多一次永久 bind；同 request＋hash 的**有效 fresh snapshot replay**不重複該 request audit；新 request 可新增 active verification audit。受控 barrier 驗同 pair 可收斂、不同 pair 至多一個成功；不能以 sleep 或 local behavior 推論 PostgreSQL。

Directory、governance、mapping、epoch 與 session 不是單一分散式 transaction。本設計只承諾明示 read／write fence 觀察到的狀態，不宣稱消滅最後一次讀取後的所有撤權競態；既有每 request session verification／revocation 機制保留。

## 6. Migration 014：OrgMaster 專用 session admission

新增 `db/migrations/014_dev050_orgmaster_session_admission.sql`，只新增 `orgmaster_contract.v_orgmaster_session_principals_v1` 與它的最小 ACL。**不 replace** `v_active_principal_mappings_v1`；001～013 bytes、既有 routine／view／owner／ACL 不變。

- 新 view 用 `security_barrier=true`，從既有 shared view 投影 identity，再以當前 active published governance 做 OrgMaster eligibility。來源仍是單一 published authority，不複製 identity 或 role 資料。
- eligibility：application id＝orgmaster 且 active；相同 Employee 的 active global OrgMaster assignment 在有效期間；所指 applicationRole 同 app 且 active。缺失、停用、expired、不合法 policy 都不得放行。
- 用 EXISTS／eligible Employee 集合，避免兩個有效 role 複製 identity row。不得對 identity rows 用 DISTINCT 隱藏多重 mapping；canonical repository 保留 0／1／多筆拒絕語意。
- 新 contract version 固定 `orgmaster.session-principal.v1`；**八欄**為 contract_version、principal_issuer、principal_subject、principal_id、employee_id、employee_status、mapping_version、published_at，型別／identity 值沿用來源；不可改 mappingVersion 表示角色版本。
- owner 為既有 migrator；僅 grant SELECT 給 `jenfu_orgmaster_runtime`。對新 view 檢查並移除 PUBLIC／platform／AI-PDM 的 default ACL，既有 shared view grants 不動；不加 runtime DDL／owner／migrator 權限。
- `orgmasterPrincipalAdmissionRepository.ts` 改查新 view 並驗新 version，API shape 不變。因此 session creation、每 request `verifySession` 及 OrgMaster 既有 SSO callback 自動一致；不改 DEV-013 wire protocol 或平台 consumer。
- fixture 必須證明「managed identity 只有其他 app role」仍存在 shared view，但不存在 OrgMaster view；撤銷 OrgMaster role 只改此 app admission，不使其共用 identity 消失。
- 新 view 不存在時 repository fail closed，不 fallback 舊 view。部署前由 release gate處理 schema 先於新 app、既有 session 影響與 rollback；回舊 app 會失去此 hardening，不能標為安全等價 rollback。

### 2026-09-24 projection contract correction

Production preflight 發現 managed identity 的 active row 已在 `orgmaster_contract.v_active_principal_mappings_v1`，但舊 `access_governance.v_active_principal_links_v1` 仍是 Platform-owned、只投影舊 governance `identityLinks` 的 view。因此舊 runner 看到 0 principal 並在 CAS 前安全停止；這不是把 managed identity 重綁一次即可修復的資料問題，也不代表 canonical identity mapping 不存在。

Migration `022_dev014_managed_login_session_admission.sql` 以 additive `orgmaster_contract.v_orgmaster_session_principals_v2` 修正 session bootstrap：eligible set 接受已發布且有效的 `orgmaster` 或 `ai-pdm` assignment，OrgMaster permission enforcement 仍由原有 app-scoped permission gate 決定。Migration `023_dev014_authority_principal_projection_contract.sql` 建立明確帶 `account_type` 的 OrgMaster-owned `orgmaster_contract.v_active_principal_accounts_v1` adapter。它以 exact employee／principal／issuer／subject／mapping revision／published timestamp 連接 canonical mapping 與 managed identity，並要求 admission enabled、Directory observation present、無未完成 lifecycle event；legacy principal 則必須有 active governance admission。未知分類 fail closed。OrgMaster 不改寫 Platform-owned `access_governance.v_active_principal_links_v1`。Authority runner 同時比對 `v_active_principal_mappings_v1` 與 `v_active_principal_accounts_v1` 的唯一列，之後呼叫 Platform-owned `platform_contract.switch_ai_pdm_employee_authority_v2`；舊 Platform projection 是否包含 managed row不再是新切換流程的前置條件。

這兩個 migration 都是 forward-only；不改既有 migration bytes，不寫人工 production data，不新增 Employee／principal／assignment／permission，也不改 IAM、Secret、service 或 traffic。OrgMaster DB boundary 檢查已確認 migration 023 只變更 `orgmaster_contract`；Platform 的 CAS function 由 Platform migration 擁有。新的 owner release 與 Production readback必須先證明每個 Free fixture 在 canonical mapping 與 accounts adapter 各只有一列且 issuer、subject、principal、Employee 完全一致，且 account type 正確；之後才可重新評估 authority switch。讀回未通過時維持 fail-closed，不重跑同一切換。

本機隔離測試可套 exact 001～014；正式 migration／activation 必須另有 release authority。DEV-040 現行 normal release 只接受 001～011，不能因本文件宣稱 Ready 就套 012～014、修改 runner ledger 或部署。

## 7. UI 與驗收

入口：SSO enabled 仍只顯示平台入口；否則 managed enabled 顯示一個「員工編號或公司 Email」text input 與「使用 Google 登入」。JFS 直接 account chooser；Email 最多用自己輸入的值作 hint，不解析他人 Email 回前端。

- submit 當下凍結輸入；busy 防重複送出。可鍵盤 submit、有 label／focus ring、aria-busy；不以顏色標示帳號存在。
- popup cancel／blocked／network failure 恢復按鈕與焦點、保留輸入；不新增會截斷正常 MFA 的 60 秒 app clock。
- 拒絕文案統一「無法登入，請確認帳號或聯絡管理員。」；managed／legacy 各自維護訊息，觸發表單只顯示一個 alert。取消不是「帳號不存在」。
- managed mode 下既有 password form 放在預設收合、可鍵盤操作的 `details / summary：既有帳號登入`；managed off 仍顯示原入口，不刪帳號或停用 provider。
- 不為測試增加 AuthGate optional port、production query flag、全域 setter 或測試 token。一般 log／URL／localStorage 不存 token、identifier、raw Email／Directory response；受控 audit 保留原邊界。
- 隱私驗收是無 pre-auth lookup、認證後只查本人、他人存在與否同 error shape／文案；不承諾網路 strict constant-time。

### 7.1 驗收矩陣

| ID | 情境 | 必須成立 |
|---|---|---|
| V1 | 同 pending Employee 分別以 JFS／exact Email 登入 | 同 stable key／principal／Employee；一次 bind，zero provider／license write |
| V2 | Active A token＋A input；A token＋B existing／nonexistent input | 正確成功；其餘 generic deny、zero bind/session，不能 active shortcut 或查 B |
| V3 | 舊 JFS、0000、alias、外域、大小寫／空白、empty/null/oversize | 按 parser／transport 契約正規化或拒絕；provided invalid 不降級 |
| V4 | provider／verified Email／googleUserId／issuer／audience／auth_time／epoch 無效 | 前置否決 zero Directory、bind、session；不拿 Firebase UID 作 stable key |
| V5 | live=new／stored=old、Directory negative、duplicate mapping、inactive／role missing／lifecycle pending | 拒絕且 zero session；已知負例先於 bind；refresh 不冒充更名修復 |
| V6 | 同 pair／不同 pair barrier、讀後換員編、revision drift、receipt replay／collision、lost response | local＋PG 安全性一致；最多一次受控 retry；核對 bind／audit／session 各自數量 |
| V7 | omitted legacy、omitted pending、managed off、SSO on、bind 後 role／epoch／session 失敗 | 相容邊界、zero fallback；post-bind 不發 cookie且不 unbind；SSO contract 保持 |
| V8 | 1440×900、1024×768、390×844：normal／busy／cancel／blocked／error／legacy disclosure | 正常入口、單 alert、keyboard／focus 恢復、無遮擋或水平 overflow；慢速 MFA clock 用 component fake time 驗無 60 秒閘門 |
| V9 | alias／attempt／source／log 邊界 | public alias 所有輸入同 404、zero lookup；無新 attempt／secret／resolver，無一般 log 洩漏 |
| V10 | 新 view／shared view／ACL／owner contract；兩個有效 roles；既有 session | shared rows／ACL 不變；此 app role／application 撤銷立刻使下一次 admission 拒絕；role 不複製 row、identity ambiguity不被隱藏 |

### 7.2 測試入口、替身與證據

以下 runner／新增 cases 是本輪已建立並執行的本機驗收入口；其 evidence 仍不等同正式 provider 或 production release：

- Unit／component：`orgmasterManagedIdentityRepository.test.ts` 驗 one-statement／one-document snapshot；`orgmasterManagedIdentityService.test.ts` 驗 mandatory guards／retry；`orgmasterAuthApi.test.ts` 驗分支／epoch／canonical；`orgmasterPrincipalAdmissionRepository.test.ts` 驗新 view/version／safe integer／ambiguity；AuthGate／authApiClient tests 驗正常 submit與 error。owner service tests 保留原契約。
- `scripts/qc-dev-050-contract.mjs`：完成 source contract checks，涵蓋 Auth API ordering、snapshot／retry、app-only view、ACL、legacy alias 404 與 UI allowlist；輸出 `qa/dev-050/contract/manifest.json`，不冒充 PostgreSQL。
- `scripts/qc-dev-047-postgres.mjs --suite=dev050`：沿用 disposable PostgreSQL 能力，實際套用 001～014；D50-01～04 驗證八欄 view、OrgMaster role 篩選、runtime-only ACL 與 shared view 相容性。輸出 `dev-050/postgres/manifest.json`。
- `scripts/qc-dev-050-browser.mjs`：以正常 production build 的 `src/main.tsx`→App→AuthGate 入口，development auth bypass 關閉；只對 `/api/auth/me`／`/api/auth/mode` 做 Playwright route isolation 以固定未登入 capability response，不攔截產品資料路徑、不呼叫 provider。桌面 1440×900 與手機 390×844 均驗單一 managed 欄位、legacy disclosure 收合、無水平 overflow；輸出 `qa/dev-050/browser/manifest.json` 與截圖。
- production bundle smoke：另驗正常 build 的入口／SSO／managed flag rendering及無 fixture route／synthetic token；不拿替身 bundle 證明真 Google popup。real provider驗證與正式帳號操作需另行範圍，不在本文件工作。
- 舊 gate 相容：047 contract 的 bridge／fallback 字串斷言與049／050的auth ordering gate均固定為「epoch→canonical→僅exact not-active時provided verifier→canonical readback→second epoch；omitted zero fallback」。只替換被本DEV及2026-09-22 Production continuity correction明示取代的checks，其他owner／caller／provider-write／schema checks保留。歷史`qa/dev-047/**` receipt不覆寫；本次current contract manifest更新於`qa/dev-049/contracts/manifest.json`與`qa/dev-050/contract/manifest.json`。

package 新增 `test:dev-050`、`qc:dev-050:contract`、`qc:dev-050:postgres`、`qc:dev-050:browser`。本輪最終 gate 全部通過：

```text
npm run test:dev-050
npm run qc:dev-050:contract
npm run qc:dev-050:postgres
npm run build
npm run qc:dev-050:browser
npm run qc:dev-047:contract
npm run qc:dev-049:contract
npm run test:dev-049
npm run test:dev-047
npm run test:dev-013
npm run check:db-boundary
npm test -- --testTimeout=30000
```

另已重跑修訂後的 047／049 contract checks。所有 required assertion 均 PASS；manifest 記錄各 runner 的替身邊界、assertion、mutation／call counts、viewport／截圖與 cleanup。V1～V10 中涉及真實 Google popup／provider 的部分仍需另行 provider 操作驗證，不能由本機替身證明。

臨時 DB／server／port／browser surface 啟動前記錄 task owner，完成後只清理自身 process tree／tab並確認 port 釋放。非預期 console error、pageerror、4xx／5xx 必須處理；刻意負例需有對應 UI 與 assertion。作者自測不等於獨立 QC。

## 8. 實作切片與精確影響面

| Slice | 修改／產出 | 交接條件 |
|---|---|---|
| S0 契約鎖定 | 固定父 source／001～013 baseline；先寫 Email反例、shared-view 相容、retry／active shortcut failing assertions | 重現既有缺口，盤點 alias／舊 bridge consumer；發現外部 consumer 停止相容性切片並回 spec |
| S1 資料／service | private snapshot read、app-local mandatory verifier、一次 retry／post-read；不抽 shared owner core | local／PG snapshot、same/different-pair、receipt assertions 通過 |
| S2 Admission／BFF | 新 view 014、principal repository 接線、HTTP branches／UUID／double epoch／alias 404 | 新舊 view／ACL、既有 session／SSO callback、HTTP negative gates 通過 |
| S3 UI | 單欄 managed form、輸入凍結、legacy disclosure、錯誤／focus | component＋正常入口 browser；零 production test hook |
| S4 證據 | 相容 checks、targeted／PG／browser／full tests／build／boundary | fresh manifest＋獨立 QA／QC；才可列 Implementation Complete，仍非 release |

實作 allowlist（本輪已依此範圍完成）：

- `src/auth/AuthGate.tsx`、`authApiClient.ts` 與 tests、必要的 `src/index.css`；既有 `firebaseClient.ts` 函式足夠，不新增 port。
- `server/orgmasterManagedIdentityService.ts`、`orgmasterManagedIdentityRepository.ts`、`orgmasterPrincipalAdmissionRepository.ts`、`orgmasterAuthApi.ts` 與 tests。pure matcher／digest 重用，不要求更動 owner service／API／contract。
- 刪除 `server/orgmasterManagedIdentityAuthBridge.ts` 的條件是 repo consumer inventory 確認僅舊 gate 引用；若仍有 runtime caller，先完成同入口遷移，不留下繞過新政策的 Email-search bind。
- 新 migration `014_dev050_orgmaster_session_admission.sql`。
- 新 050 runners、`scripts/fixtures/dev050/**`、`qa/dev-050/**`、package scripts；047 PG suite與047／049 contract checks 的上述有限更新。local store write／owner public API／server runtime wiring預設不改；若 failing test 證明必要，先在本 spec 補依據與影響。
- 文件：本 spec、dev_task、documentation_map、ADR-007 及父 spec 的後續設計註記。不得把來源 DEV ID 宣稱為另一 repo 的 native task。

禁止面：其他 repo、provider／Licensing write、正式 credentials／DB／IAM／traffic、001～013 bytes、shared view rows／ACL、owner wire contract、公開 identifier resolver、attempt secret／cookie、production test hook。

## 9. Readiness、證據與 release 邊界

| 項目 | 本輪能主張 | 不能主張 |
|---|---|---|
| 設計／實作 | R2 private snapshot、mandatory app-local verifier、有限 retry、新 app-scoped view、正常入口與 allowlist 已落地 | 將本機證據誤作零風險或正式 provider 已驗證 |
| 父基線 | 本輪核對 [owner receipt](../../qa/dev-049/producer/owner-receipt.json) 的 16 個 controlled source 與 3 個 evidence hashes；controlled tree＝`3d04c52fc648e2b061a13286b606e0f74a22e0c13fc07b15e3659aab18e8ba1a` | 父 receipt 等同 DEV-050 或目前 HEAD 全量驗證 |
| 歷史測試 | 父 receipt 的 DEV-049 targeted／owner evidence 仍保留其原始來源 | 不把父 receipt 改寫成 DEV-050 evidence |
| 產品／QC | DEV-050 targeted 39／39、contract 6／6、PG D50-01～04、browser 2 viewport、full regression 209 files／863 passed／1 skipped、build／DB boundary 均 PASS | 將 fake provider 或本機自動化證據標成正式 Google／production PASS |
| 正式環境 | 2026-09-18 首次 G2 在舊 profile 以 migration unchanged執行，candidate smoke因014 view缺失安全停止；fresh G2 run `35307497175` 已追加012–014，隨後由`app_sessions` runtime ACL缺失再次於切流前安全停止。現由 DEV-040 §37 定義repository-owned 015 fix-forward與精確001～015 recovery | 重用舊授權／capsule、人工GRANT、down migration或把本機PASS當正式完成 |

本輪驗收記錄：`npm run test:dev-050` 39／39；DEV-050 contract 6／6；isolated PostgreSQL 18.4 D50-01～04；正常建置入口 browser 1440×900／390×844；DEV-047／049 contract、DEV-013／047 tests、full regression 209 files／863 passed／1 skipped、build、DB boundary 均 PASS。`git diff --check` 通過；各 runner 的 temporary root／port／browser 均已清理。這些是本機產品與自動化 QA／QC 證據，不是正式 provider 或 release authorization。

Release impact：app-local alias 行為與 OrgMaster session admission 改變，新增 app-only view／SELECT grant；沒有新 secret。DEV-013 production recovery另以migration 015恢復既有app-session repository的最小DML ACL，不改本產品契約。正式 gate依 DEV-040 §37處理 exact 001～015 ledger、相容窗口、existing-session拒絕影響與安全 rollback／fix-forward；human authorization只綁定production target、resources、allowed／forbidden actions、risk與expiry，修正後exact revision及其migration／artifact／candidate provenance由machine-verifiable receipts重新綁定。本文件本身不產生 release authority。

RD 開始前重新核對 branch／HEAD／dirty state、父 receipt 與 migration bytes。未預期的受控來源 drift 先做 impact review；本 DEV allowlist 內的預期變更記入新 evidence，不要求實作後仍匹配父 source hash，不重寫歷史 receipt。fixture 掩蓋真 repo、用 unsafe cast 繞過 contract、修改 applied migration、放寬 role gate 均是停止條件。

## 10. 變更紀錄

- 前輪：採 token-first，撤回 HMAC attempt／60 秒 app TTL／Email或員編 resolver；此方向保留。
- 前版 Architecture Closure：曾規劃 replace shared view、optional shared core／Firebase port，並聲稱 snapshot／receipt已閉合。**以上方案與過度的 PASS／P0-P1=0 結論由本 R2 取代，不作 RD 依據。**
- 2026-09-17 R2：以可重現 Email反例補 private 同快照讀取；依 SQL 真實順序固定有限 retry；新增 OrgMaster 專用 view 保留 shared consumer；刪除非必要 core／production port；補 principal repository、舊 gate 更新與正常入口證據。同步六份 OrgMaster 文件；沒有產品或 migration 變更。
- Spec Impact：`Intentional replacement / Documents Only`；只取代 DEV-047 A9／DEV-049 §9 後續 app-local 登入設計；one-managed-identity、stable-key、zero-provider-write及 owner 契約不變。
- Future Phase Captured／Not Requested：Google Admin 授權營運、primary Email 更名的受控恢復、legacy password 移除。不得以既有 refresh、人工直接改資料或此次架構定案替代另外的設計與操作授權。
- 2026-09-18 implementation complete：S0～S4 已落地；private same-snapshot repository、mandatory dual-identifier verifier、one retry／post-read、014 app-only admission view、double epoch BFF、legacy disclosure UI 與 fresh contract／PG／browser／full regression evidence 全部通過。正式 migration／activation／deploy 仍維持 gated。
- 2026-09-18 Production L4 correction：首次 OrgMaster G2 run `35299453716` 在切流前以缺014 view安全停止。DEV-040 §36已定案以 sealed DEV-013 transition追加012–014，owner migration receipt必須先於candidate；一般發布仍零DDL。修正後source需另行 exact authorization，未宣稱 production完成。

使用思考習慣：#第一性原理、#多層次分析、#驗收閉環


## 2026-09-22 Production execution readback（historical pre-release checkpoint；current由下段取代）

DEV-050 release commit `e15121af6b579a339a109c1125214bf4d29624e8`是Production service source `4b512a4d48e306cef8d1371d7a354e50a3e8f05c`的ancestor，owner run `35587433590`已發布該source lineage。DWD、migration、雙admission及Firebase Google provider均完成。Platform canonical-first correction發布後，受控Workspace帳號已由Platform normal entry建立session並免二次登入進入AI-PDM，reload與管理權限PASS；這只算target partial evidence。OrgMaster correction source `9c660e210adfec82865167397e97e28a16b8b356`仍待owner dispatch；完成後依Platform LOGIN六案補Google／工號、Free、OrgMaster target、deny-path與global logout。

### 2026-09-22 current Production owner/L4 checkpoint

OrgMaster master `3588eb69ed0b47a588d120801d18adaa68dc27d2`已由owner run `35666554078`發布至`orgmaster-prod-fda3dbbe8347`，image=`sha256:4fd3ae63692cdbda2b20ce0dfa865cea48de194440035e42217e32144f638618`且100% traffic。Platform R3 fresh conformance已完成第二次bounded refresh：OrgMaster admission revision 5、Platform revision 6均enabled且apply＋replay PASS，Platform support revision升為4，其餘未漂移support維持3，affected identity／outbox=0。Workspace Google-first及`JFS0005`工號起手皆已完成Platform session、AI-PDM handoff／reload與管理權限；refresh後重驗仍不需第二次Google登入，global logout POST=200且兩target舊session protected requests均401。`PDM-W-G`及`PDM-W-E`具current evidence；Free-only／無Gmail fixture及negative／rate／race required cells仍未齊，因此本DEV的Production owner交付已完成，但DEV-014 LOGIN六案仍為0／6 full cases。權威browser證據見Platform `ai-doc/qc/qc-dev-014-production-l4-2026-09-22.md`。

剩餘跨app驗收改由Platform `config/dev-014/login-production-fixture-plan.json` v2固定零新增付費席次方案：唯讀重用既有`employee-shijie / jedchang0308@jenfu.com.tw`的Workspace active證據，不修改其帳號、Employee、binding、assignment或permission；只新建`dev014-fp-google`與`dev014-fp-number`兩個Cloud Identity Free-only／無Gmail disposable identities及各自標記的OrgMaster fixture Employee。直接執行`W-A-G／W-A-E／F-P-G／F-P-E／F-A-G／F-A-E`，並以`W-P-G-EQV／W-P-E-EQV`明示同一post-Google-claim managed bridge的account-class-independent equivalence；equivalence只覆蓋pending Workspace cells，不冒充browser PASS。共同finalizer升為`jenfu.dev014.login-production-completion.v2`，仍要求四個AI-PDM target cells、六個LOGIN cases、七個deny fixtures、rate／race／logout與完整cleanup。只有self-hashed final receipt通過，才同步關閉DEV-014、DEV-049／050與AI-PDM DEV-118。

2026-09-22 fixture readback已固定 `dev014-fp-google → Employee 01a0c82b-11c6-77ab-887f-58df9d243e63 → JFS9014`、`dev014-fp-number → Employee 01a0c82b-372c-7d20-ba3b-6e3b892d2f63 → JFS9015`；兩個Google使用者均為`/OrgMaster`的Cloud Identity Free-only且未指派Workspace授權。JFS assignment尚未執行，必須由source-bound `dev014-production-login-fixture-runner.mjs`先做exact-target `assign`，UI以activation gate將兩筆fixture轉active後才可做`link`，最後以`readback`封存pending狀態。任一既有alias、Employee、mapping、Directory drift或source／workspace revision不符即停止，不得改用人工SQL或修改其他既有資料。
