# DEV-045：員工帳號邀請與登入身分設定

文件成熟度：`RD Implementation Ready`

狀態：`Executable / RD Tech Lead Re-review Passed / RD Not Started / Documents Only / Local-Isolated Current Phase / Production Provisioning Gated`

風險等級：`Medium`。本交付新增使用者入口、帳號邀請狀態、細分權限及跨Employee UI／OrgMaster BFF／共同IAM資料路徑；正式provider、郵件與production資料仍屬High release boundary。

決策來源：

- `USER-2026-09-04-EMPLOYEE-ACCOUNT-PROVISIONING-PLACEMENT`
- `USER-2026-09-04-DEV045-DEVELOPMENT-DOCUMENT`
- `USER-2026-09-04-DEV045-UPGRADE-RD-CONTRACT`
- `USER-2026-09-04-DEV045-RD-TECH-LEAD-REMEDIATION`
- `USER-2026-09-04-DEV045-ARCHITECTURE-COMPLETION`

父契約：

- [DEV-043](DEV-043-employee-identity-link-management.md)：Employee明細登入身分關係入口與既有identity-link安全不變量。
- [DEV-040](DEV-040-jenfu-platform-entitlement-user-integration.md)：Employee、principal、identity admission、Firebase authentication與production authority boundary。
- [DEV-044](DEV-044-local-test-role-one-click-login.md)：四種地端角色與development＋loopback一鍵登入。
- [DEV-033](DEV-033-mobile-readonly-desktop-mutation-boundary.md)：桌面可寫、窄版與手機唯讀。
- [ADR-007](../adr/ADR-007-external-role-catalog-assignment-boundary.md)：共同IAM擁有authentication；OrgMaster擁有Employee ↔ principal mapping與角色指派治理。

## 1. 目標與完成定義

DEV-043目前只能把「正在操作的管理者身分」連到選定Employee。當管理者替另一名Employee設定帳號時，既有畫面會以管理者自己的link判斷並顯示衝突，資料保護雖然正確，卻不是管理者正在執行的任務。

DEV-045要把正常任務改為：授權管理者在選定Employee的上下文中，發起新帳號邀請或連結已存在的公司帳號。完成後：

- 不會把管理者自己的verified identity誤當成目標帳號。
- Employee仍是人員唯一真相；帳號不是第二份人員主檔。
- OrgMaster保存開通意圖、Employee關係、治理狀態與audit；共同IAM／provider保存帳號、credential、Email驗證、MFA與authentication session。
- 帳號建立或連結不自動授予Application Role。

## 2. Human-confirmed產品契約

1. 主要入口固定為「員工 → 員工明細 → 登入帳號」。
2. Empty state只顯示「尚未設定登入帳號」與唯一主動作「設定登入帳號」。
3. 點擊後才在短Modal中選擇「邀請新帳號」或「連結既有帳號」；邀請新帳號為預設路徑。
4. OrgMaster可以發起、追蹤與稽核provider工作，但不得保存或驗證密碼、MFA secret、token或其他credential。
5. Provider完成驗證後，OrgMaster才以server取得的exact `issuer + subject`建立Employee identity link；Browser不得提交raw subject或principal ID。
6. 已屬另一Employee的帳號不得靜默改綁。「移轉帳號」是獨立高風險future flow，不屬Current Phase。
7. 共用信箱、service account、供應商與客戶帳號不從Employee入口建立或綁定。

## 3. Current-state evidence

- `package.json`已使用`firebase 12.16.0`與`firebase-admin 14.2.0`，production authentication provider已確認為Firebase。
- `server/orgmasterFirebaseIdentityProvider.ts`目前只封裝`verifyIdToken`；沒有directory search、`createUser`、邀請link或Email delivery能力。
- Repo內沒有`createUser`、`getUserByEmail`、`generateEmailVerificationLink`、邀請repository或Firebase Emulator設定。
- `server/orgmasterAuthApi.ts`只處理Firebase ID token換取OrgMaster BFF session、session read／logout及development profiles。
- `src/types.ts#Employee`目前不保存Email；帳號Email不能被文件誤寫成既有Employee欄位。
- `server/orgmasterGovernanceApi.ts`現有`POST /identity-links/current`只把verified actor連到Employee；不能替另一Employee選擇或建立身分。
- `src/components/EmployeeIdentitySection.tsx`以current actor link決定衝突提示，正是本DEV要取代的正常管理流程。
- 現行workspace共12筆Employee：9筆為UUIDv4、3筆為legacy alias、0筆為UUIDv7。DEV-045不得把DEV-040 future rekey的目標狀態誤當成Current Phase輸入前置；它只接受Organization source當下回傳的opaque exact ID。

結論：現況具備authentication verification與Employee identity-link基線，但沒有account provisioning能力。本DEV不得只改CTA後假裝provider流程已存在。

## 4. 權威與架構邊界

| 事實／動作 | 權威 | Current Phase規則 |
|---|---|---|
| Employee存在、狀態與canonical ID | OrgMaster organization workspace | 只接受active Employee；不以Email、姓名或員編取代Employee ID |
| 帳號開通／連結意圖、狀態與audit | OrgMaster account-enrollment ledger | 獨立workflow state，不是帳號或Employee主檔 |
| Credential、managed Email、驗證、MFA、account lifecycle | 共同IAM／provider | 只由server-side adapter呼叫；Browser不直連 |
| Stable `issuer + subject` | 共同IAM／provider | 驗證完成後才可供mapping使用 |
| `principalId`與Employee identity link | OrgMaster governance | principal ID由server mapping boundary產生或解析；Browser不可指定 |
| Application Role與Permission | 各應用／OrgMaster既有治理 | 帳號完成不授權；另走角色指派 |

### 4.1 Architecture Memory Capsule

~~~text
Employee detail / Account setup modal
  -> browser-safe accountEnrollment/apiClient
       -> account-enrollment HTTP boundary [auth / origin / parse / serialize]
            -> AccountEnrollmentService [唯一跨邊界orchestrator]
                 -> OrganizationSourceReader [Employee read-only]
                 -> AccountEnrollmentStore [intent / state / audit]
                 -> AccountProvisioningPort [server-only account authority adapter]
                      -> local deterministic adapter [Current Phase]
                      -> shared IAM / provider adapter [Future Production Phase]
                 -> IdentityLinkPolicy + applyDraftCommand
                      -> GovernanceStore [Employee ↔ principal mapping authority]
~~~

三個狀態來源不得混合：

- Provider是「帳號是否存在、是否完成驗證」的權威。
- Enrollment ledger是「誰替哪個Employee要求什麼、目前處理到哪裡」的權威。
- Governance identity link是「哪個verified principal屬於哪個Employee」的權威。

Enrollment ledger具有獨立非同步生命週期、重試與reconciliation責任，因此可建立獨立server repository；它不是第二份帳號主檔，也不得複製完整provider directory。

### 4.2 Component responsibility and dependency direction

| Component | 唯一責任 | 禁止事項 |
|---|---|---|
| `EmployeeIdentitySection`／setup Modal | 顯示Employee-scoped sanitized projection、收集模式與Email | 不join raw governance／provider、不保存canonical account state |
| `accountEnrollment/apiClient` | typed HTTP與request sequencing | 不做permission、狀態轉換或reconciliation |
| Account enrollment HTTP boundary | auth、same-origin、body／route validation、HTTP mapping | 不重做domain判斷、不直接讀寫store或provider |
| `AccountEnrollmentService` | 唯一跨Organization／ledger／provider／governance的workflow orchestrator | 不成為Employee、account或role authority |
| `AccountEnrollmentStore` | enrollment、candidate lease、command replay與audit persistence | 不呼叫provider／governance、不保存credential |
| `AccountProvisioningPort` | account exact lookup、invite operation與observation | 不知道Employee permission、role或governance schema |
| `IdentityLinkPolicy` | 共用principal雙鍵唯一性、同Employee reuse／reactivate與status guard | 不做I/O、不做permission、不依賴HTTP |
| Governance store／`applyDraftCommand` | identity link canonical mutation、CAS與governance audit | 不管理invite狀態、Email或provider operation |

依賴只可由外向內：UI → API client → HTTP boundary → service → ports／policies。Store、provider adapter與policy不得import UI／HTTP；account service不得import governance API handler，只能import純`IdentityLinkPolicy`與既有governance store command boundary。Server composition root每個runtime只建立一個service及一個provider adapter instance，HTTP requests不得自行new adapter或service。

## 5. Current Phase RD Handoff Contract

Current Phase固定為`Local／Isolated Employee Account Enrollment Foundation`。它用真實產品入口、真實OrgMaster permission與identity-link command，搭配deterministic development provider adapter完成可驗收流程；不發送真實Email、不建立Firebase production user，也不證明production IAM可用。

### 5.1 In scope

1. Employee明細把可見區段名稱收斂為「登入帳號」，並以server account-access view投影狀態。
2. 有權限且Employee active時，empty顯示唯一「設定登入帳號」CTA；已有帳號或邀請時，區段只保留一個低權重「新增登入帳號」入口，以符合一名Employee可有多個person-specific identities的不變量。
3. Modal提供邀請新帳號與連結既有帳號兩種模式；既有帳號只允許exact managed Email查詢，不提供可瀏覽的全公司帳號清單或模糊姓名搜尋。
4. 建立server-only `AccountProvisioningPort`與deterministic local／isolated adapter；production adapter不在Current Phase。
5. 建立account-enrollment ledger及read／invite／candidate／link／resend／cancel契約。
6. Provider驗證結果只由server reconciliation取得，成功後重用DEV-043既有governance identity-link command、CAS、audit與唯一性驗證。
7. 新增identity-specific permission codes，更新DEV-044四種地端角色的權限矩陣。
8. 正常、loading、empty、pending、linked、expired／failed、conflict、permission deny、窄版、鍵盤與visible-error QA／QC。

### 5.2 Out of scope

- Firebase／Google Workspace／Cloud Identity production account建立、真實邀請信、外部Email服務、正式credential或production provider設定。
- production schema migration、Cloud SQL apply、authority／traffic switch、deploy或release。
- 在Employee新增`email`／`workEmail`欄位；Current Phase邀請Email屬provider request，不成為Employee canonical identity。
- 自動角色授權、職位／部門推測角色、shared mailbox、service account或外部人員帳號。
- 帳號移轉、cascade revoke、跨app session撤銷、批次到職／離職與全域邀請工作佇列。
- 讓Browser或一般evidence取得raw `issuer`、`subject`、完整fingerprint、provider operation secret、token或credential。

## 6. Domain contract

### 6.1 EmployeeAccountEnrollmentV1

Account-enrollment ledger依第16節exact schema、檔案與migration contract實作，至少表達下列語意：

| Field | Contract |
|---|---|
| `id` | server-generated UUIDv7，immutable |
| `employeeId` | Organization source回傳的opaque canonical Employee ID；只作exact字串比對，不假設UUID版本或格式 |
| `kind` | `invite_new`或`link_existing` |
| `providerKey` | server allowlist provider identifier |
| `targetEmail` | server-only normalized Email；response、URL與一般log只回hint |
| `targetEmailHash`／`targetEmailHint` | duplicate detection與UI辨識；不得反推Employee ID |
| `providerOperationRef` | server-only opaque reference，不得回Browser |
| `providerRequestKey` | 呼叫provider前持久化的server-only idempotency／lookup key；初次invite由enrollment ID衍生，resend另納入command ID，均不含Email |
| `status` | `requested`、`dispatching`、`pending_acceptance`、`accepted_pending_link`、`linked`、`outcome_unknown`、`expired`、`failed`、`cancelled`、`conflict` |
| `statusReasonCode` | allowlisted machine code；不保存provider raw error |
| `candidateLeaseId` | `link_existing`進入`accepted_pending_link`前固定綁定的server-only lease ID；invite flow為null |
| `identityLinkId` | linked後指向唯一governance identity link，否則null |
| `commands[]` receipt | command idempotency與reuse detection；不把可重送的多次操作覆寫成enrollment單一欄位 |
| `createdByPrincipalId`／`createdAt`／`updatedAt`／`expiresAt` | server audit與生命週期 |
| `revision` | enrollment CAS；resend／cancel必須帶expected revision |

`targetEmail`是必要的provider工作資料，不是Employee主檔欄位。Production persistence必須具存取限制與at-rest保護；一般API、audit摘要、DOM、console與evidence只使用hint／hash。Local fixture只使用synthetic company domain。

Email衍生規則固定：`normalizedEmail = email.trim().toLowerCase()`；`targetEmailHash = sha256(normalizedEmail)`且只留server；`targetEmailHint`保留完整allowlisted domain，local-part長度大於2時為「首字元＋`•••`＋末字元」，長度不大於2時整段為`••••`。Hint只供人類區分，不得用於lookup、唯一性或重新建立Email。

### 6.2 State machine

邀請新帳號：

~~~text
requested -> dispatching -> pending_acceptance
pending_acceptance -> accepted_pending_link -> linked
requested / dispatching -> outcome_unknown --reconcile--> pending_acceptance | failed
pending_acceptance -> expired | cancelled
pending_acceptance / expired -> dispatching --resend--> pending_acceptance | accepted_pending_link | outcome_unknown | failed
outcome_unknown -> cancelled
accepted_pending_link -> conflict | linked
~~~

連結既有帳號：

~~~text
candidate lease --link command--> accepted_pending_link -> linked
accepted_pending_link -> conflict | linked
~~~

規則：

- `linked`、`failed`、`cancelled`與`conflict`為terminal；`expired`是已關閉的provider observation，但可由具權限者以新resend command顯式重新進入`dispatching`。同一command＋同request hash replay不得產生新side effect，回當下canonical view；同command不同hash拒絕。
- `outcome_unknown`禁止盲目重送provider create／invite；必須先以既有request key查詢。只有provider明確回`not_found`時，reconciliation才可用同一request key送出一次相同logical request。
- Open enrollment固定指`requested`、`dispatching`、`pending_acceptance`、`accepted_pending_link`或`outcome_unknown`；duplicate-open invariant及projection皆使用此集合，不各自發明定義。
- 任一Employee同一provider＋Email hash最多一筆open enrollment；同一`issuer + subject`最多一筆active Employee link。
- Provider驗證成功但governance CAS失敗時停在`accepted_pending_link`，由reconciliation重試link；不得再建立第二個provider帳號。
- Employee在流程中變inactive時，不建立link；open enrollment轉`cancelled`或`failed: employee_inactive`，Current Phase不自動停用provider帳號。

### 6.3 UI projection

Employee與identity是one-to-many。Read model不得把多筆governance links壓成單一account，也不得因第一個account存在就禁止新增第二個person-specific identity。

| Row／summary state | Projection |
|---|---|
| 尚未設定 | 無active／inactive link且無open／attention enrollment |
| 邀請待接受 | enrollment為`requested`／`dispatching`／`pending_acceptance` |
| 正在確認 | enrollment為`outcome_unknown`；顯示「正在確認結果」且不提供重送 |
| 已啟用 | 一列active identity link；同Employee可有多列 |
| 邀請過期／失敗 | `expired`或`failed`，顯示最短原因與適用恢復動作 |
| 已停用 | 一列inactive identity link |
| 連結衝突 | enrollment `conflict`或candidate已屬其他Employee |

Aggregate `state`只依下方projection計算並固定依序判斷：資料不變量破壞→`contract_mismatch`；投影中任一`outcome_unknown`／`expired`／`failed`／`conflict`→`attention`；任一open enrollment→`in_progress`；任一active account→`ready`；只有inactive account→`inactive_only`；其餘→`empty`。Active account與另一個不同target的open enrollment可合法共存，不得誤判contract mismatch；只有cancelled history且無link時才回`empty`。

`accounts[]`投影該Employee全部identity links，active優先，再依`accountHint + identityLinkId`穩定排序。每個link沒有principal admission時`accountType='unclassified'`；通過governance validation的唯一human admission則不論active／inactive都投影其`human_personal`／`human_privileged` taxonomy。多筆admission或nonhuman admission違規引用link會先由既有governance validator拒絕並回`GOVERNANCE_READ_FAILED`，account service不得自行寬容解析。`enrollments[]`含全部non-terminal enrollment；只有該`providerKey + targetEmailHash`目前沒有non-terminal時，才另投影最新一筆displayable terminal `expired`／`failed`／`conflict`，避免重試成功進行中仍顯示舊失敗。排序固定依status rank `outcome_unknown → failed → conflict → accepted_pending_link → dispatching → requested → pending_acceptance → expired`，再依`emailHint + enrollmentId`。`linked`由account row表達，`cancelled`不常駐顯示。UI先依`accounts[]`順序渲染account rows，再依`enrollments[]`順序渲染enrollment rows，不得自行重排或去重。相同Email多筆open、linked enrollment指向不存在／錯Employee的link、candidate lease錯綁、同principal或`issuer + subject`跨Employee，皆回contract mismatch並停用所有mutation。

## 7. Permission contract

新增的mutation不得只沿用廣泛`orgmaster.governance.manage`：

| Permission | 能力 |
|---|---|
| `orgmaster.identity.view` | 讀Employee帳號狀態與redacted辨識值 |
| `orgmaster.identity.invite` | 建立新帳號邀請 |
| `orgmaster.identity.link` | 搜尋exact managed Email候選並連結既有帳號 |
| `orgmaster.identity.invitation.manage` | 重送或取消尚未完成的邀請 |

角色矩陣：

| 角色 | view | invite | link | manage invitation |
|---|---:|---:|---:|---:|
| OrgMaster管理者 | Allow | Allow | Allow | Allow |
| 人員治理者 | Allow | Allow | Allow | Allow |
| 管理辦法維護者 | Deny | Deny | Deny | Deny |
| 一般員工 | Deny | Deny | Deny | Deny |

`ORGMASTER_PERMISSIONS`新增record固定如下；RD不得自行變更ID、kind或risk：

| ID | Code | Name | Kind | Risk |
|---|---|---|---|---|
| `permission-orgmaster-identity-view` | `orgmaster.identity.view` | 查看員工登入帳號 | `page` | `normal` |
| `permission-orgmaster-identity-invite` | `orgmaster.identity.invite` | 邀請員工登入帳號 | `action` | `high` |
| `permission-orgmaster-identity-link` | `orgmaster.identity.link` | 連結既有登入帳號 | `action` | `high` |
| `permission-orgmaster-identity-invitation-manage` | `orgmaster.identity.invitation.manage` | 管理登入帳號邀請 | `action` | `high` |

- DEV-044 development profiles須由server allowlist取得相同permission，不接受Client自填。
- `orgmaster.governance.manage`不自動代表identity invite／link權，避免未來角色擴張時默默取得帳號生命週期能力。
- Response中的`capabilities.manageLinkStatus`只由既有`orgmaster.governance.manage`精確評估，僅控制DEV-043既有link啟用／停用能力；它不授予invite、existing lookup或link。Client再與desktop mutation environment及Employee active相交後才render status control。
- Client visibility與handler依DEV-033檢查desktop mutation environment；server無可信viewport／pointer訊號，因此API不接受也不信任Browser提交的裝置宣告，只重新驗證verified session、exact permission、Employee active與request contract。裝置邊界是UX fail-closed gate，不取代server authorization。
- 沒有`identity.view`時不render「登入帳號」區段，不以顯示`0個連結`洩漏帳號狀態。

## 8. UI Entry Contract

### 8.1 Primary entry

- Target actor：OrgMaster管理者或人員治理者。
- Normal start：由頂部「員工」開啟Employee清單，再點選Employee列。
- Destination：既有相鄰Employee明細；「登入帳號」維持在「直屬主管路徑」之後。
- Read permission：無`identity.view`時整個區段不存在。
- Empty：`尚未設定登入帳號`＋唯一primary CTA`設定登入帳號`。
- Pending：顯示Email hint、`邀請待接受`與到期資訊；正常狀態不顯示教學卡。
- Active／mixed：每個account或enrollment一列，顯示redacted hint、帳號類型／邀請狀態與必要情境動作；區段標題旁只保留一個quiet「新增登入帳號」，不得為每列重複建立CTA。
- Failure：錯誤靠近帳號區段或Modal欄位，保留輸入與Employee selection。
- Mobile／narrow：390×844只讀；無CTA、Modal入口或mutation control。1024×768與1440×900依permission顯示完整流程。

### 8.2 Setup modal

Modal只承擔必須完成或取消的短流程，最多兩個步驟：

1. 選擇模式：`邀請新帳號`預選、`連結既有帳號`次選。
2. 輸入exact公司Email並確認Employee名稱；submit動作依模式顯示`寄送邀請`或`連結帳號`。

設計限制：

- Modal不提供帳號總表、模糊搜尋、角色指派、權限設定、稽核歷史或長捲動。
- Existing-account search使用POST body避免Email出現在URL，結果只回一個或少量exact eligible redacted candidate及短期opaque candidate token。
- 取消後回Employee明細並保留選取；成功後關閉Modal並由canonical readback更新帳號區段。
- DEV-043的「連結目前登入身分」不再是正常主CTA；一般空白狀態不得顯示目前管理者已連結其他Employee的警告。
- 只有使用者選定candidate且發生衝突時，顯示「此帳號已連結〔Employee名稱〕」與「查看該員工」。

### 8.3 Global account governance

Current Phase不在全域「帳號治理」重複建立設定表單。全域頁維持跨Employee檢視與進入Employee明細；邀請佇列、批次與異常工作台屬Future Phase。

## 9. Server and API contract

路由名稱與行為固定如下；不得在RD中另創平行route或把Email放進query string。

### 9.1 Read employee account access

~~~http
GET /api/orgmaster/account-enrollments/employees/{employeeId}
~~~

`employeeId`是單一percent-encoded path segment；Client必須用`encodeURIComponent`，Server只decode一次並以結果做Organization source exact lookup。Malformed encoding、空值或超過255 UTF-8 bytes回`INVALID_REQUEST`；不得把decode後的`/`當成第二層route或用UUID regex篩選。

只回：

- Employee ID與status。
- 全部active／inactive identity links的sanitized `accounts[]` view。
- 全部non-terminal與每個provider＋Email最新一筆displayable terminal的`enrollments[]` projection；不回完整歷史。
- exact capabilities：`view`、`invite`、`link`、`manageInvitation`。
- enrollment revision與governance revision。
- development時可回`deliveryMode=simulated`；production不得偽稱已寄信。

### 9.2 Invite new account

~~~http
POST /api/orgmaster/account-enrollments/invitations

{
  "commandId": "<uuid>",
  "employeeId": "<opaque canonical employee ID>",
  "email": "<exact managed email>"
}
~~~

Server：

1. 驗證verified actor、`identity.invite`、Employee active、Email格式與server allowlist domain；desktop boundary由Client以DEV-033既有deterministic gate負責，API不接受可偽造的viewport header或body欄位。
2. 正規化Email，只在server request／protected ledger／provider boundary使用；log與response redacted。
3. 先以provider exact lookup確認Email尚無active／verified account；已存在即回`ACCOUNT_ALREADY_EXISTS`並建議切換既有帳號模式，不建立enrollment。Lookup與後續invite間若發生競態，provider `requestInvitation`仍須回同一allowlisted conflict，不能另建重複帳號。
4. 先持久化`requested`、command hash與`providerRequestKey='account-enrollment:'+enrollmentId`，再持久化`dispatching`，之後才可呼叫provider mutation。
5. Provider成功後記錄operation reference與`pending_acceptance`；timeout／response loss即使沒有operation reference，也以已持久化request key轉`outcome_unknown`並進reconciliation，不盲目建立第二筆邀請。
6. 回sanitized account-access view，不回invitation link、raw provider reference或subject。

### 9.3 Search and link existing account

~~~http
POST /api/orgmaster/account-enrollments/existing-candidates

{
  "employeeId": "<opaque canonical employee ID>",
  "email": "<exact managed email>"
}
~~~

Search要求`identity.link`，只回redacted eligible result與server-generated opaque `candidateToken`。Production entropy固定至少32 random bytes後base64url；store只保存SHA-256，不需要另做可解析／可簽章token。Token綁actor session、Employee、provider candidate、query hash與5分鐘TTL；Browser不能由token推導UID。

~~~http
POST /api/orgmaster/account-enrollments/existing-links

{
  "commandId": "<uuid>",
  "employeeId": "<opaque canonical employee ID>",
  "candidateToken": "<opaque>",
  "expectedGovernanceRevision": "<revision>"
}
~~~

Server重新解析candidate並驗證Employee active、token binding、provider account active／verified、`issuer + subject`唯一性及governance revision。成功只經既有governance command boundary建立link；candidate已屬其他Employee回conflict且零mutation。

### 9.4 Manage invitation

`resend`與`cancel`必須帶`commandId`、`enrollmentId`與`expectedEnrollmentRevision`。Resend只允許`pending_acceptance`或`expired`；`outcome_unknown`先reconcile。Cancel只關閉OrgMaster enrollment intent；是否停用provider account不在Current Phase。

### 9.5 Provider port

Server-only `AccountProvisioningPort`至少需要：

- exact Email eligibility／existing-account lookup。
- idempotent invite／provision request。
- 以預先持久化的provider request key查詢invite operation；response loss後不得依賴尚未取得的operation reference。
- resend／cancel support declaration。
- operation status lookup。
- verified account result：server-only `issuer`、`subject`、verification／active state。

Current Phase使用deterministic local adapter及synthetic accounts。Production adapter owner、mail delivery與credential policy是Future Phase entry condition；不能因`firebase-admin`套件存在就宣稱能力完成。

## 10. Transaction, idempotency and reconciliation

- Browser mutation都使用UUID command ID；同command＋同hash replay回`disposition='replayed'`與當下canonical view且零新side effect，同ID不同hash回`COMMAND_ID_REUSED`。
- Provider call與OrgMaster ledger／governance store無法假裝成單一transaction；採persist-before-dispatch saga。
- Current Phase provider必須以`providerRequestKey`同時支援idempotent dispatch與lookup；若future provider不支援此能力，production re-entry不得沿用V1 port，也不得以Email lookup猜測邀請是否成立。
- `accepted_pending_link`到`linked`必須以governance CAS完成；CAS conflict只重讀與重試同一link意圖，不重新provision。
- Reconciliation只能由server-owned internal boundary或development test harness直接呼叫service觸發；不提供Browser route，也不能由GET間接觸發。Browser不能提交raw provider result。
- Account-access GET只做canonical store讀取；它會偵測同Employee＋provider＋Email多筆open request、linked enrollment懸空／錯Employee、candidate lease錯綁、同principal或同subject跨Employee等可由Organization／ledger／governance bytes直接證明且未先被既有store validator拒絕的矛盾，回contract mismatch並停用mutation，但不得呼叫provider或改寫任何store。Active link與另一筆open enrollment本身不是矛盾；governance schema／admission不合法則沿用`GOVERNANCE_READ_FAILED`，不降級成可讀projection。
- 跨store流程不得巢狀持有enrollment root lock與governance lock。固定順序為「ledger CAS後釋鎖 → provider call／observation → governance CAS後釋鎖 → ledger CAS finalize」；每一步都可由deterministic command／request key重放。任何失敗只留下可reconcile狀態，不以刪除provider account或回寫governance歷史作補償。
- DEV-045啟用後，建立／重新啟用identity link與link status mutation的唯一產品HTTP入口是account-enrollment API。既有`POST /api/orgmaster/governance/identity-links/current`與generic governance `UPSERT_IDENTITY_LINK`／`SET_IDENTITY_LINK_STATUS` HTTP command回`IDENTITY_ACCOUNT_FLOW_REQUIRED`且零mutation；`applyDraftCommand`仍保留為server-internal canonical store boundary，由account service使用。其他governance commands完全不變。

## 11. Error and recovery contract

| Code | HTTP | UI／Recovery |
|---|---:|---|
| `IDENTITY_CONTEXT_REQUIRED` | 401 | 回到正常登入入口，不顯示帳號資料 |
| `IDENTITY_VIEW_REQUIRED` | 403 | 區段不呈現；直接API拒絕 |
| `IDENTITY_INVITE_REQUIRED` | 403 | 移除邀請操作，保留有權限的read |
| `IDENTITY_LINK_REQUIRED` | 403 | 移除既有帳號連結操作 |
| `IDENTITY_INVITATION_MANAGE_REQUIRED` | 403 | 移除重送／取消 |
| `GOVERNANCE_ADMIN_REQUIRED` | 403 | 移除link status controls；不影響identity view／invite capability |
| `IDENTITY_ORIGIN_INVALID` | 403 | 不執行mutation；由正常同源OrgMaster入口重試 |
| `EMPLOYEE_NOT_FOUND` | 404 | 關閉失效明細或重新載入Employee |
| `ACCOUNT_ENROLLMENT_NOT_FOUND` | 404 | 重讀Employee account view，移除失效row |
| `IDENTITY_LINK_NOT_FOUND` | 404 | 重讀Employee account view，移除失效account row |
| `EMPLOYEE_NOT_ACTIVE` | 422 | 顯示「停用員工不能設定登入帳號」 |
| `WORK_EMAIL_INVALID` | 422 | Email欄位就地錯誤並保留輸入 |
| `WORK_EMAIL_DOMAIN_NOT_ALLOWED` | 422 | 顯示最短公司帳號限制 |
| `ACCOUNT_ALREADY_EXISTS` | 409 | 保留Email並建議切換「連結既有帳號」；preflight命中時不建立enrollment，dispatch競態命中時保留`conflict` receipt供audit |
| `INVITATION_ALREADY_PENDING` | 409 | 讀回既有pending request，不建立第二筆 |
| `ACCOUNT_CANDIDATE_NOT_FOUND` | 404 | 保留Email，允許切換為邀請新帳號 |
| `ACCOUNT_NOT_ELIGIBLE` | 422 | 顯示無法連結，不洩漏provider細節 |
| `CANDIDATE_TOKEN_INVALID` | 409 | 清除candidate確認，保留Email並重新搜尋 |
| `CANDIDATE_TOKEN_EXPIRED` | 409 | 回到Email確認並重新搜尋 |
| `IDENTITY_LINK_CONFLICT` | 409 | 零mutation；顯示已連結Employee及查看入口 |
| `IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN` | 422 | 不停用；提示先處理該身分的有效准入 |
| `SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN` | 422 | 不停用目前登入身分；由另一治理管理者處理 |
| `INVITATION_STATE_INVALID` | 409 | 重讀canonical row；只顯示目前狀態允許的操作 |
| `PROVIDER_OUTCOME_UNKNOWN` | 409 | 顯示正在確認；停用重送直到reconcile |
| `COMMAND_ID_REUSED` | 409 | 不重試該command ID；產生新ID後由使用者重新確認動作 |
| `ACCOUNT_ENROLLMENT_REVISION_CONFLICT` | 409 | 重讀account enrollment canonical view；不得重送provider mutation |
| `ACCOUNT_ENROLLMENT_CONTRACT_MISMATCH` | 409 | 整段唯讀並顯示資料需處理；不嘗試Client修復 |
| `IDENTITY_PROVISIONING_UNAVAILABLE` | 503 | 保留輸入與Employee；可在恢復後重試 |
| `REVISION_CONFLICT` | 409 | governance CAS衝突；重讀canonical view並保留Employee上下文 |
| `IDENTITY_ACCOUNT_FLOW_REQUIRED` | 409 | 舊identity mutation HTTP入口已由Employee帳號設定流程取代；零mutation |
| `ACCOUNT_ENROLLMENT_STORE_INVALID` | 500 | 只有帳號區段顯示讀取失敗；其他模組維持可用 |
| `ACCOUNT_ENROLLMENT_WRITE_FAILED` | 500 | 保留當下canonical view；不得呼叫下一個跨系統side effect |
| `GOVERNANCE_READ_FAILED` | 500 | 帳號區段fail closed；不得由GET初始化或覆寫governance store |
| `INVALID_JSON`／`INVALID_REQUEST` | 400 | 不送service；修正Client request contract |
| `PAYLOAD_TOO_LARGE` | 413 | 不送service；Client不得重送超過64 KiB body |
| `METHOD_NOT_ALLOWED` | 405 | 使用固定route method；response含`Allow` |
| `ROUTE_NOT_FOUND` | 404 | 不落入SPA或其他API；修正Client route |

Provider raw error不得直出。可重試性、使用者文案與audit reason均由allowlisted mapping決定。

## 12. QA／QC contract

### 12.1 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| 管理者自己的身分被連到目標Employee | 重用DEV-043 current actor流程 | 人員與帳號歸屬錯誤 | 管理者選另一Employee後設定 | P0 | target candidate只由server provider result決定 |
| Provider已建立帳號但OrgMaster顯示失敗並重建 | 跨系統response loss且沒有可查詢request key | 重複帳號／邀請 | crash-window＋timeout-after-commit fixture | P0 | pre-dispatch持久化request key＋idempotent lookup／reconciliation |
| 重送邀請在timeout後重複寄送／遺失命令身分 | 只保存初次invite command或重用舊request key | 重複provider side effect、audit不可追 | resend crash-window＋same-ID-different-action | P0 | append-only command receipt＋每次resend獨立pre-dispatch request key |
| 同一identity連兩名Employee | candidate token或唯一性失效 | 越權與audit失真 | existing link conflict | P0 | server CAS＋issuer-subject唯一檢查 |
| Email／UID／subject洩漏 | response或log直接使用provider model | 個資與安全風險 | response／DOM／console／artifact scan | P0 | sanitized DTO＋forbidden scan |
| 一般員工可見或操作帳號設定 | 只靠UI或沿用廣泛manage | 權限過寬 | 四角色API／UI矩陣 | P1 | exact identity permissions＋server gate |
| outcome unknown仍可重送 | UI只看error | 重複provider side effect | unknown state action test | P1 | 重送disabled＋先reconcile |
| 帳號建立後自動取得角色 | 把identity與entitlement混用 | 非預期擴權 | before／after role snapshot | P0 | role assignments byte-equivalent |
| 第二個登入身分被第一筆覆蓋／隱藏 | read DTO或UI誤建成one-to-one | privileged／personal identity遺失或無法管理 | multi-account projection case | P1 | `accounts[]`／`enrollments[]` one-to-many projection |
| 舊governance API繞過enrollment安全流程 | 新舊mutation surface同時可寫 | 無ledger、無provider audit或競態 | legacy／generic route negative tests | P0 | HTTP single-writer fence＋internal command reuse |
| Current Phase程式一部署就替換production入口 | feature flag預設開啟或從未核准env暗啟用 | 正式帳號流程中斷 | server default／start path test | P0 | `accountEnrollmentEnabled=false` default＋Future release gate顯式activation |
| Modal或狀態文字過密／窄版破版 | 把內部狀態直接顯示 | 誤判或無法操作 | 1440／1024／390 visual QC | P1 | 單一CTA、短狀態、窄版唯讀 |

### 12.2 Acceptance cases

1. `A1 Empty entry`：管理者由正常員工入口選active Employee，只看到`尚未設定登入帳號`與一個`設定登入帳號`。
2. `A2 Invite happy path`：synthetic company Email建立一筆request；API／UI顯示`deliveryMode=simulated`與pending，未寫Firebase production或角色資料。
3. `A3 Command replay／duplicate`：invite、link-existing、resend、cancel皆先查append-only command receipt；同command replay回當下canonical view且零新side effect，同ID不同hash／action拒絕。不同invite command＋同Employee／Email只回既有pending或409，不建立第二筆；preflight發現既有帳號時ledger零mutation，lookup後provider競態則保留唯一`conflict` receipt；link replay不因candidate已consumed而誤敗。
4. `A4 Unknown outcome／crash windows`：分別注入「requested後、provider前中斷」、「provider已接受但response loss」；兩案都以預先持久化request key安全收斂，前者最多一次logical dispatch，後者不建立第二筆邀請。UI在unknown期間顯示正在確認且無重送控制。
5. `A5 Accept and link`：development harness模擬server-side verified result，狀態經`accepted_pending_link`到`linked`，產生唯一identity link。
6. `A6 Existing account`：exact Email搜尋只回redacted候選；inactive／unverified／unclassified account不eligible，expired／cross-session token拒絕，合法token建立唯一link且不自動建立principal admission。
7. `A7 Conflict`：candidate已屬另一Employee時零mutation，只在選定candidate後顯示正確Employee與查看入口；一般empty state沒有current actor衝突提示。
8. `A8 Permission／Employee ID compatibility`：管理者／人員治理者依矩陣可用；管理辦法維護者與一般員工無區段且API 403；inactive Employee與390×844無mutation。至少以一筆現行legacy alias、一筆既有UUIDv4 Employee及一筆含需percent-encode字元的synthetic opaque ID，證明Client單segment encoding、Server單次decode並只依Organization source exact ID驗證，不誤套UUIDv7限制。
9. `A9 Role isolation`：帳號流程前後Application Role assignments、management grants與effective entitlement不變。
10. `A10 Recovery／pure read`：read 500、provider 503、revision conflict、Employee切換競態均保留正確Employee上下文且不套用stale response；GET前後ledger與governance raw bytes完全一致，provider call count為0。
11. `A11 Accessibility／visual`：Modal焦點進入、返回、Escape、Tab、Enter、live error、reduced motion及1440×900、1024×768、390×844無重疊、截斷、水平溢出或雙重捲動。
12. `A12 Visible error sweep`：非錯誤測試狀態不得有可見alert、HTTP 4xx／5xx文字、`Not Found`、`Internal Server Error`、console error或pageerror；fixture預期有資料時關鍵count不得全零。
13. `A13 Origin／CSRF`：所有mutation POST只接受`Origin`與`Host`完全同源；missing Origin、不同port、非loopback development origin與host mismatch均403且provider／ledger／governance零mutation。GET不要求Origin。

14. `A14 One-to-many／mixed projection`：同一Employee同時有`human_personal`與`human_privileged`兩筆identity links，並對另一個provider＋Email target有一筆pending enrollment；GET固定回`accounts.length=2`、`enrollments.length=1`及deterministic排序，aggregate為`in_progress`（若另有attention則依優先序為`attention`）。UI完整顯示三列且只有一個quiet「新增登入帳號」，不得覆寫或隱藏第二身分。Provider回傳的account type不能自行新增或改寫governance principal admission。
15. `A15 Single-writer／runtime isolation`：Server flag未啟用時不建立account runtime且DEV-043 routes保持歷史行為；DEV-045啟用時，舊`identity-links/current`與generic `UPSERT_IDENTITY_LINK`／`SET_IDENTITY_LINK_STATUS` HTTP mutations全回409 `IDENTITY_ACCOUNT_FLOW_REQUIRED`，governance／ledger raw bytes不變；其他governance command仍可正常執行。每個Vite／server composition只建立一個service、一個provider與一個startup recovery promise；GET不另啟recovery。即使ledger損壞，只有account routes fail closed，Employee其他明細、document API及非identity governance routes仍可用。

### 12.3 Fixture and evidence boundary

- Parent fixture可建立active／inactive Employee、四個DEV-044 actor及synthetic provider accounts；不得直接建立案例預期的enrollment或identity link。
- A5的verified result只能由server-owned development harness產生，Browser不得送issuer／subject。
- A14的兩筆identity links必須由account service flow建立；需要的`human_personal`／`human_privileged` admissions再由server fixture透過既有governance command建立。不得把provider `accountType`直接寫進projection或由Browser注入admission。
- Automated evidence：permission、state machine、idempotency、candidate binding、saga／reconciliation、governance CAS、role byte-equivalence與redaction tests。
- Browser evidence：正常入口、Modal互動、狀態投影、角色可見性、鍵盤、viewport、visible-error、console／pageerror與截圖。
- API／store evidence證明持久化與唯一性；Browser畫面不證明真實Email送達。Production invite delivery只能由未來provider／release gate evidence證明。
- 可控browser存在時由QC操作並收集證據，不把刷新、viewport或截圖轉交使用者。

## 13. Execution boundary and gates

### Current Phase

- 文件已達`RD Implementation Ready`；RD可依第16～18節的exact file／symbol、slice與Gate直接開始local／isolated實作。
- 本輪仍為`Documents Only`；沒有產品程式、測試、schema、provider、資料或runtime變更。
- Current Phase只允許local deterministic provider與ignored local JSON ledger；正式provider、Email、Cloud SQL、migration、deploy與release仍須另進Future Phase／release gate。

### Stop conditions

- 需要Browser接觸raw identity、credential、provider admin token或invitation link。
- 無法保證provider重試冪等、outcome unknown reconciliation或identity跨Employee唯一性。
- 需要修改production Firebase／Cloud SQL、真實帳號、正式Email服務、authority、traffic、deploy或release。
- 要求帳號完成即自動授權、允許shared account綁Employee或靜默移轉既有帳號。
- Dirty worktree無法隔離DEV-045產品檔案邊界；回PM重新固定allowlist，不覆寫既有變更。

### Evidence required before completion

- Current Phase所有A1～A15在對應evidence layer通過。
- Targeted tests、typecheck、client／server build與受影響回歸通過。
- Frozen local candidate的browser evidence具source revision／dirty boundary、角色、fixture、route、viewport、操作、screenshot、console／pageerror及runtime cleanup。
- local simulated evidence明確標示`productionWrites=false`、`emailDelivered=false`，不得被重用為production pass。

## 14. Deferred Scope Audit

### Future Phase Capsule：Production provisioning

- 目的：以Jenfu Platform共同IAM／provider真正建立或找到managed account、寄送邀請並回傳verified principal。
- 邊界：OrgMaster維持orchestrator與mapping authority；provider維持credential authority。
- 依賴：共同IAM provisioning owner、Firebase／Workspace account policy、Email delivery、production persistence、callback／polling與data retention。
- 驗收方向：真實邀請送達、接受後登入、唯一mapping、MFA／session、reconciliation、rollback與audit。
- Re-entry trigger：共同IAM owner與正式provider／mail能力確認，並明確進入production release gate。

### Future Phase Capsule：Joiner／Mover／Leaver

- 目的：Employee inactive後協調帳號停用、session／auth epoch撤銷及跨app entitlement失效。
- 邊界：OrgMaster發出生命週期意圖；共同IAM與各app執行各自停用與enforcement。
- Re-entry trigger：production account provisioning與跨app revoke receipt契約完成。

### Future Phase Capsule：Global account governance

- 目的：處理邀請佇列、過期／失敗、重複／衝突、批次與audit。
- 邊界：只作跨Employee工作台與異常入口，不複製Employee明細設定流程。
- Re-entry trigger：Employee主流程完成且有可觀察的跨人員處理需求。

## 15. Governance result

- Spec Impact：`Compatible future successor / Compatible security and implementation refinement / Intentional successor surface replacement`。DEV-043完成基線與既有證據不回開；DEV-045取代其out-of-scope中的後續正常流程，並在啟用時有意封鎖DEV-043舊current-actor與generic identity HTTP mutation surface，避免雙寫入者。
- Current Architecture Impact：新增account-enrollment workflow、server provider port與identity-specific permission；不改Employee canonical ID、角色權威或Firebase authentication驗證流程。
- ADR：`Not needed`。OrgMaster治理／共同IAM authentication的長期權責已由ADR-007固定；shared policy、one-to-many projection、single-writer fence與runtime composition只是該權責下的可逆實作收斂。只有改成第二credential authority或允許雙權威時才重新進ADR Gate。
- Schema／migration：Current Phase 只新增第 17.2 節固定的 ignored local V1 ledger 與 lazy seed；不改 governance／OrganizationDocument／Cloud SQL schema，production migration 未授權。
- Human blocker：RD估工與契約評估無缺口。
- Implementation readiness：`RD Implementation Ready`；P0 gap=`0`、P1 gap=`0`。RD依第18節S0→S4執行，任一Gate失敗即回送RD，不跳階段。
- Release boundary：production account、Email、provider、database migration、deploy與release均未要求。

## 16. Exact repository and file contract

Canonical repo：`C:\VIBE CODING\OrgMaster`，branch=`master`，readiness review基準=`c8cc16f`加既有dirty worktree。RD不得回復、覆寫或格式化不屬DEV-045的既有修改；若下列檔案出現無法逐段隔離的同區變更，依Stop conditions回PM，不使用reset或checkout清除。

### 16.1 新增檔案

| File | Required exports／責任 |
|---|---|
| `src/accountEnrollment/types.ts` | 共用sanitized DTO、request type、status union；不得放server-only issuer／subject／Email record |
| `src/accountEnrollment/apiClient.ts` | `ACCOUNT_ENROLLMENT_API_PATH`、typed request helper與七個產品API client；所有Email mutation使用POST body |
| `src/accountEnrollment/apiClient.test.ts` | route、method、body、error DTO與Email不進URL測試 |
| `src/components/EmployeeAccountSetupDialog.tsx` | 邀請／既有帳號短Modal、focus lifecycle、欄位錯誤、candidate確認 |
| `src/components/EmployeeAccountSetupDialog.test.tsx` | mode、submit、candidate、錯誤保留、Escape／focus測試 |
| `server/orgmasterAccountProvisioningPort.ts` | server-only provider interface、`createLocalAccountProvisioningAdapter()`與allowlisted provider error |
| `server/orgmasterAccountProvisioningPort.test.ts` | synthetic domain、exact lookup、冪等operation與raw identity不外洩測試 |
| `server/orgmasterIdentityLinkPolicy.ts` | 純domain `resolveIdentityLinkUpsert()`與`assertIdentityLinkStatusMutationAllowed()`；共用principal／issuer-subject唯一性，不做I/O |
| `server/orgmasterIdentityLinkPolicy.test.ts` | create／noop／reactivate／雙鍵衝突／active-admission與deterministic ID測試 |
| `server/orgmasterAccountEnrollmentStore.ts` | ignored local JSON ledger、validation、record CAS、append-only command receipts、candidate lease與atomic write |
| `server/orgmasterAccountEnrollmentStore.test.ts` | lazy seed、CAS、duplicate、四action command reuse、resend key integrity、invalid file fail-closed與parallel write測試 |
| `server/orgmasterAccountEnrollmentService.ts` | permission、Employee、invite saga、candidate binding、identity link、reconciliation與sanitized projection |
| `server/orgmasterAccountEnrollmentService.test.ts` | A2～A10、A14的domain／one-to-many／cross-store整合測試 |
| `server/orgmasterAccountEnrollmentApi.ts` | 單一runtime composition、startup recovery、middleware／Vite plugin、HTTP parser、route dispatch、status mapping與sanitized error response |
| `server/orgmasterAccountEnrollmentApi.test.ts` | 真實loopback HTTP的auth、permission、route、payload、replay、redaction、startup isolation與404／409／422／503測試 |
| `scripts/qc-dev-045-browser.mjs` | task-owned Playwright browser harness、artifact provenance、四角色／三viewport／visible-error與cleanup Gate |

### 16.2 修改檔案

| File | Exact change |
|---|---|
| `src/components/EmployeeIdentitySection.tsx` | 改讀account-access view；移除current-actor empty warning與`連結目前登入身分`主流程；保留DEV-043既有link status能力但改走account API compatibility endpoint |
| `src/components/EmployeeIdentitySection.test.tsx` | 改為account-access fixtures並覆蓋empty／multi-account／mixed／pending／linked／forbidden／stale response |
| `src/components/DirectoryDetailPanel.tsx` | prop改為`accountMutationEnvironmentAllowed`，傳入`onOpenEmployee`供conflict導覽 |
| `src/components/DirectoryDetailPanel.test.tsx` | 保留部門測試並補Employee account wiring回歸 |
| `src/App.tsx` | 建立`accountMutationEnvironmentAllowed = isDesktopMutationEnvironment(workspaceEnvironment)`；不得再把帳號治理綁到`workspaceMutationAllowed`／`current-view` |
| `src/index.css` | 在既有`.employee-identity-section`附近新增扁平狀態、Modal與responsive selectors；不得新增`position: fixed` |
| `src/governance/aiPdmCatalog.ts` | 在`ORGMASTER_PERMISSIONS`加入四個identity permission definitions；fresh seed的OrgMaster管理者依既有mapping取得allow grants |
| `src/governance/aiPdmCatalog.test.ts` | 固定permission ID／code唯一性與risk／kind |
| `server/orgmasterGovernanceIdentity.ts` | `administrator`與`governance-manager`加入四個identity permissions；其餘profile維持deny-by-absence |
| `server/orgmasterGovernanceApi.ts` | 改用共用`IdentityLinkPolicy`；DEV-045啟用時fence舊current／generic identity HTTP mutations，其他governance command不變 |
| `server/orgmasterGovernanceApi.test.ts` | 保留未啟用DEV-045時的歷史current-actor安全契約；另驗證啟用後舊current／generic identity routes 409零mutation及active admission guard |
| `server/orgmasterGovernanceStore.ts` | additive export `readExistingGovernanceStore()`，只讀現存V3 canonical bytes，不呼叫`ensureGovernanceStore()`、migration或seed；既有`readGovernanceStore()`語意不變 |
| `server/orgmasterGovernanceStore.test.ts` | 現存V3 pure-read bytes不變、缺檔fail closed且不seed的回歸 |
| `server/orgmasterServer.ts` | additive `accountEnrollmentEnabled` option預設false；啟用時在auth之後、其他business API之前掛載account middleware，並把同一flag傳給governance middleware |
| `server/orgmasterServer.test.ts` | 證明default-disabled相容、enabled runtime在listen前建立、account request受startup readiness／auth保護、其他route不受recovery failure影響且close後port釋放 |
| `vite.config.ts` | 在auth plugin之後加入`orgmasterAccountEnrollmentApiPlugin()`；不改production auth設定 |
| `package.json` | 新增`test:dev-045`、`qc:dev-045:browser`、`qc:dev-045`；不新增dependency |
| `ai-doc/dev_task.md`、`ai-doc/documentation_map.md`、DEV-040／043／044 direct specs | 實作與QC後只回寫實際狀態、證據與未完成release boundary |

禁止修改：`src/types.ts#Employee`、Firebase credential／auth session實作、Cloud SQL migration、entitlement contracts、角色指派資料、production環境設定及`package-lock.json`。本DEV不新增dependency，因此`package-lock.json`變更視為scope drift。

## 17. Exact implementation contract

### 17.1 Shared browser-safe types

`src/accountEnrollment/types.ts`固定export：

~~~ts
export type AccountEnrollmentStatus =
  | 'requested' | 'dispatching' | 'pending_acceptance'
  | 'accepted_pending_link' | 'linked'
  | 'outcome_unknown' | 'expired' | 'failed' | 'cancelled' | 'conflict'

export type AccountEnrollmentReasonCode =
  | 'invite_requested' | 'provider_dispatch_started'
  | 'provider_pending_acceptance' | 'provider_accepted'
  | 'provider_outcome_unknown' | 'provider_rejected' | 'provider_unavailable'
  | 'employee_inactive' | 'invitation_expired' | 'operator_cancelled'
  | 'candidate_resolved' | 'candidate_token_expired'
  | 'account_already_exists' | 'identity_link_conflict' | 'governance_revision_conflict'
  | 'identity_link_applied' | 'identity_link_status_changed'
  | 'reconciliation_advanced'

export type EmployeeAccountAccessState =
  | 'empty' | 'ready' | 'in_progress' | 'attention' | 'inactive_only' | 'contract_mismatch'

export interface EmployeeAccountAccessViewV1 {
  contractVersion: 'orgmaster.employee-account-access.v1'
  employee: { id: string; status: 'active' | 'inactive' }
  state: EmployeeAccountAccessState
  deliveryMode: 'simulated' | 'unavailable'
  accounts: Array<{
    identityLinkId: string
    accountHint: string
    providerLabel: string
    accountType: 'human_personal' | 'human_privileged' | 'unclassified'
    status: 'active' | 'inactive'
    linkStatusMutable: boolean
  }>
  enrollments: Array<{
    id: string
    kind: 'invite_new' | 'link_existing'
    status: AccountEnrollmentStatus
    emailHint: string
    statusReasonCode: AccountEnrollmentReasonCode | null
    expiresAt: string | null
    revision: number
    actions: Array<'resend' | 'cancel'>
  }>
  capabilities: {
    view: true
    invite: boolean
    link: boolean
    manageInvitation: boolean
    manageLinkStatus: boolean
  }
  governanceRevision: string
}

export interface ExistingAccountCandidateViewV1 {
  contractVersion: 'orgmaster.existing-account-candidate.v1'
  candidateToken: string
  candidate: { emailHint: string; providerLabel: string; status: 'eligible' }
  expiresAt: string
}

export type AccountEnrollmentErrorCodeV1 =
  | 'IDENTITY_CONTEXT_REQUIRED'
  | 'IDENTITY_VIEW_REQUIRED' | 'IDENTITY_INVITE_REQUIRED'
  | 'IDENTITY_LINK_REQUIRED' | 'IDENTITY_INVITATION_MANAGE_REQUIRED'
  | 'GOVERNANCE_ADMIN_REQUIRED' | 'IDENTITY_ORIGIN_INVALID'
  | 'EMPLOYEE_NOT_FOUND' | 'EMPLOYEE_NOT_ACTIVE'
  | 'ACCOUNT_ENROLLMENT_NOT_FOUND' | 'IDENTITY_LINK_NOT_FOUND'
  | 'WORK_EMAIL_INVALID' | 'WORK_EMAIL_DOMAIN_NOT_ALLOWED'
  | 'ACCOUNT_ALREADY_EXISTS' | 'INVITATION_ALREADY_PENDING'
  | 'ACCOUNT_CANDIDATE_NOT_FOUND' | 'ACCOUNT_NOT_ELIGIBLE'
  | 'CANDIDATE_TOKEN_INVALID' | 'CANDIDATE_TOKEN_EXPIRED'
  | 'IDENTITY_LINK_CONFLICT' | 'IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN'
  | 'SELF_IDENTITY_LINK_DEACTIVATION_FORBIDDEN' | 'INVITATION_STATE_INVALID'
  | 'PROVIDER_OUTCOME_UNKNOWN' | 'COMMAND_ID_REUSED'
  | 'ACCOUNT_ENROLLMENT_REVISION_CONFLICT' | 'ACCOUNT_ENROLLMENT_CONTRACT_MISMATCH'
  | 'IDENTITY_PROVISIONING_UNAVAILABLE' | 'REVISION_CONFLICT'
  | 'IDENTITY_ACCOUNT_FLOW_REQUIRED' | 'ACCOUNT_ENROLLMENT_STORE_INVALID'
  | 'ACCOUNT_ENROLLMENT_WRITE_FAILED' | 'GOVERNANCE_READ_FAILED'
  | 'INVALID_JSON' | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE' | 'METHOD_NOT_ALLOWED' | 'ROUTE_NOT_FOUND'

export type AccountEnrollmentErrorBodyV1 = {
  error: AccountEnrollmentErrorCodeV1
  retryable?: boolean
  field?: 'email'
  conflictingEmployee?: { id: string; name: string }
}

export interface InviteAccountRequestV1 {
  commandId: string
  employeeId: string
  email: string
}

export interface ExistingCandidateRequestV1 {
  employeeId: string
  email: string
}

export interface LinkExistingAccountRequestV1 {
  commandId: string
  employeeId: string
  candidateToken: string
  expectedGovernanceRevision: string
}

export interface ManageInvitationRequestV1 {
  commandId: string
  enrollmentId: string
  expectedEnrollmentRevision: number
}

export interface SetIdentityLinkStatusRequestV1 {
  commandId: string
  employeeId: string
  identityLinkId: string
  status: 'active' | 'inactive'
  expectedGovernanceRevision: string
}

export interface InviteAccountResultV1 {
  disposition: 'created' | 'replayed'
  view: EmployeeAccountAccessViewV1
}
~~~

Raw Email只允許存在於使用者正在編輯的Email欄位與`InviteAccountRequestV1`／`ExistingCandidateRequestV1` request body，送出後不得寫入Client persistence、URL、response DTO、DOM狀態摘要、console或evidence。`issuer`、`subject`、`principalId`、完整hash、provider request／operation reference、credential與invitation link不得出現在此檔的Browser response types或任何HTTP response。

Error body欄位亦為closed contract：`field='email'`只可用於`WORK_EMAIL_INVALID`／`WORK_EMAIL_DOMAIN_NOT_ALLOWED`；`conflictingEmployee`只可用於已通過`identity.view`且candidate已選定後的`IDENTITY_LINK_CONFLICT`；`retryable=true`只可用於`IDENTITY_PROVISIONING_UNAVAILABLE`、`REVISION_CONFLICT`、`ACCOUNT_ENROLLMENT_REVISION_CONFLICT`或`GOVERNANCE_READ_FAILED`。其他code省略這些optional欄位，不回raw cause、stack或provider detail。

### 17.2 Server-only ledger schema

`server/orgmasterAccountEnrollmentStore.ts`固定使用：

- Path：`<root>/data/orgmaster-account-enrollments.v1.json`。
- Previous：`<root>/data/orgmaster-account-enrollments.v1.previous.json`。
- `schemaVersion: 1`、`updatedAt`、`enrollments[]`、`commands[]`、`candidateLeases[]`、`auditEvents[]`。
- Store revision為完整raw bytes的SHA-256；record `revision`為從1開始的整數，每次狀態或provider reference改變加1。
- 所有寫入經`withOrgMasterRootLock(root, ...)`、重讀revision、先保存previous、再`writeVerifiedAtomicFile(current, raw)`；同root並行寫入不得lost update。
- 檔案不存在時，pure GET以記憶體中的empty projection回應且不建立檔案；只有第一個合法mutation可在local JSON mode lazy seed空store。Cloud SQL mode或`devEnabled=false`不得建立local shadow store。
- schema、欄位、Email、日期、狀態轉換、command ID／hash唯一性、重複open enrollment、token hash與audit chain不合法時丟`AccountEnrollmentStoreError('ACCOUNT_ENROLLMENT_STORE_INVALID')`，不得自動清空或覆寫。

Server-only record固定為：

~~~ts
export interface EmployeeAccountEnrollmentV1 {
  id: string // UUIDv7 from createUuidV7()
  employeeId: string
  kind: 'invite_new' | 'link_existing'
  providerKey: 'local-deterministic'
  providerRequestKey: string | null
  targetEmail: string
  targetEmailHash: string
  targetEmailHint: string
  providerOperationRef: string | null
  status: AccountEnrollmentStatus
  statusReasonCode: AccountEnrollmentReasonCode | null
  candidateLeaseId: string | null
  identityLinkId: string | null
  createdByPrincipalId: string
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  revision: number
}

export interface AccountEnrollmentCommandReceiptV1 {
  commandId: string
  requestHash: string
  action: 'invite_new' | 'link_existing' | 'resend_invitation' | 'cancel_invitation'
  employeeId: string
  enrollmentId: string
  providerRequestKey: string | null
  createdAt: string
}

export interface ExistingAccountCandidateLeaseV1 {
  id: string // server-generated UUIDv7
  tokenHashSha256: string
  actorBinding: string
  employeeId: string
  providerKey: 'local-deterministic'
  targetEmail: string
  targetEmailHash: string
  targetEmailHint: string
  issuer: string
  subject: string
  verified: true
  active: true
  createdAt: string
  expiresAt: string
  consumedAt: string | null
}

export interface AccountEnrollmentAuditEventV1 {
  id: string
  commandId: string
  occurredAt: string
  actorPrincipalId: string
  action:
    | 'ENROLLMENT_REQUESTED' | 'PROVIDER_DISPATCH_STARTED'
    | 'PROVIDER_OUTCOME_OBSERVED' | 'CANDIDATE_LEASED'
    | 'IDENTITY_LINK_REQUESTED' | 'IDENTITY_LINK_APPLIED'
    | 'INVITATION_RESENT' | 'INVITATION_CANCELLED'
    | 'IDENTITY_LINK_STATUS_CHANGED' | 'RECONCILIATION_COMPLETED'
  enrollmentId: string | null
  reasonCode: AccountEnrollmentReasonCode
  beforeHash: string | null
  afterHash: string | null
  previousEventHash: string | null
  eventHash: string
}

export interface AccountEnrollmentDocumentV1 {
  app: 'OrgMaster'
  schemaVersion: 1
  updatedAt: string
  enrollments: EmployeeAccountEnrollmentV1[]
  commands: AccountEnrollmentCommandReceiptV1[]
  candidateLeases: ExistingAccountCandidateLeaseV1[]
  auditEvents: AccountEnrollmentAuditEventV1[]
}

export interface AccountEnrollmentStoreReadV1 {
  exists: boolean
  raw: string | null
  revision: string | null
  document: AccountEnrollmentDocumentV1
}

export type AccountEnrollmentStoreErrorCode =
  | 'ACCOUNT_ENROLLMENT_STORE_INVALID'
  | 'ACCOUNT_ENROLLMENT_REVISION_CONFLICT'
  | 'ACCOUNT_ENROLLMENT_WRITE_FAILED'

export class AccountEnrollmentStoreError extends Error {
  constructor(readonly code: AccountEnrollmentStoreErrorCode)
}

export interface AccountEnrollmentStoreV1 {
  readExisting(): Promise<AccountEnrollmentStoreReadV1>
  commit(
    expectedRevision: string | null,
    mutate: (current: AccountEnrollmentDocumentV1) => AccountEnrollmentDocumentV1,
  ): Promise<AccountEnrollmentStoreReadV1>
}

export function createAccountEnrollmentStore(input: {
  root: string
  devEnabled: boolean
  now?: () => Date
}): AccountEnrollmentStoreV1
~~~

`readExisting()`在檔案不存在時回`exists=false`、`raw=null`、`revision=null`及記憶體empty document，不寫檔；`devEnabled=false`時也固定回相同empty shape且完全不probe local path。`commit(null, ...)`只允許檔案仍不存在的首次合法mutation，存在時或revision不符都丟`ACCOUNT_ENROLLMENT_REVISION_CONFLICT`。`mutate`型別刻意是同步pure callback；不得在callback內呼叫provider、governance或任何async I/O。Commit在同一`withOrgMasterRootLock`臨界區重讀、驗證current、執行callback、驗證next、保存previous並atomic write，返回重新讀取的canonical bytes；atomic／previous保存失敗統一映射`ACCOUNT_ENROLLMENT_WRITE_FAILED`。Service在`devEnabled=false`先回`IDENTITY_PROVISIONING_UNAVAILABLE`；store的defensive commit仍固定以`ACCOUNT_ENROLLMENT_WRITE_FAILED`拒絕且不得碰local path。

`commands[]`是append-only idempotency receipt；`requestHash = sha256(canonicalJson({ action, canonical request fields }))`，action必須納入hash。任何mutation先以全ledger command ID查詢：同ID＋同hash＋同action直接回當下canonical view且零新side effect，同ID但hash或action不同丟`COMMAND_ID_REUSED`。Invite／link-existing建立receipt時，必須與新enrollment在同一store transaction落盤；resend／cancel receipt必須與該次狀態轉換同次落盤。Invite／resend receipt保存與enrollment當次值相同的`providerRequestKey`，link／cancel為null；任何non-null enrollment key找不到exact receipt或同key落在多筆receipt即store invalid。Candidate search不是外部side effect command；其audit `commandId`固定使用`candidate-lease:${lease.id}`。

初次invite的`providerRequestKey`固定為`account-enrollment:${enrollment.id}`，在任何provider call前與`requested`同次寫入。每次resend先把`providerRequestKey`改為`account-enrollment-resend:${enrollment.id}:${commandId}`，並與command receipt及`dispatching`同次持久化，再呼叫provider；因此process crash與response loss均由目前record上的key收斂。`link_existing.providerRequestKey`固定為`null`。`actorBinding`為verified session ID的SHA-256；development profile沒有正式session ID時使用`dev:${actor.principalId}`後hash。Store只保存上述closed union的reason code，不保存provider raw error、token明文或Email於audit event。Reconciliation使用固定system actor `system:account-enrollment-reconciler`寫audit，查無進展時不新增event或revision。

Audit event的`beforeHash`／`afterHash`只對不含raw Email、issuer、subject、token及provider reference的sanitized enrollment projection計算。`eventHash = sha256(canonicalJson(event without eventHash))`，第一筆`previousEventHash=null`，其後必須exact連到前一筆`eventHash`；任何斷鏈均fail closed且保留檔案供調查。

### 17.3 Provider port and deterministic adapter

`server/orgmasterAccountProvisioningPort.ts`固定export：

~~~ts
export interface ProviderAccount {
  providerKey: 'local-deterministic'
  normalizedEmail: string
  accountType: 'human_personal' | 'human_privileged' | 'unclassified'
  issuer: string
  subject: string
  active: boolean
  verified: boolean
}

export interface ProviderInvitationResult {
  disposition: 'created' | 'replayed'
  operationRef: string
  state: 'pending_acceptance' | 'accepted'
  expiresAt: string
  emailDelivered: false
  verifiedAccount: ProviderAccount | null
}

export interface ProviderInvitationObservation {
  state: 'not_found' | 'pending_acceptance' | 'accepted' | 'expired' | 'failed' | 'cancelled'
  operationRef: string | null
  expiresAt: string | null
  verifiedAccount: ProviderAccount | null
}

export type AccountProvisioningErrorCode =
  | 'WORK_EMAIL_INVALID' | 'WORK_EMAIL_DOMAIN_NOT_ALLOWED'
  | 'ACCOUNT_ALREADY_EXISTS' | 'ACCOUNT_NOT_ELIGIBLE'
  | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_REJECTED' | 'PROVIDER_RESPONSE_LOST'

export class AccountProvisioningError extends Error {
  constructor(readonly code: AccountProvisioningErrorCode)
}

export interface LocalAccountProvisioningOptions {
  now?: () => Date
  inviteFault?: 'none' | 'timeout_before_commit' | 'timeout_after_commit' | 'unavailable' | 'failed' | 'accepted'
}

export interface AccountProvisioningPort {
  readonly providerKey: 'local-deterministic'
  readonly deliveryMode: 'simulated'
  findExistingByExactEmail(email: string): Promise<ProviderAccount | null>
  requestInvitation(input: { requestKey: string; enrollmentId: string; email: string }): Promise<ProviderInvitationResult>
  resendInvitation(input: { requestKey: string; enrollmentId: string; operationRef: string }): Promise<ProviderInvitationResult>
  readInvitation(input: { requestKey: string; enrollmentId: string; operationRef: string | null }): Promise<ProviderInvitationObservation>
}

export function createLocalAccountProvisioningAdapter(
  options?: LocalAccountProvisioningOptions,
): AccountProvisioningPort
~~~

Local adapter規則：

- 唯一允許domain為RFC保留測試domain `orgmaster.test`；正規化採`trim().toLowerCase()`，不得猜測或改寫local-part。
- Seed existing accounts固定為`existing.admin@orgmaster.test`與`existing.employee@orgmaster.test`，均為active／verified synthetic identity。
- `existing.admin@orgmaster.test`的account type固定`human_privileged`，`existing.employee@orgmaster.test`固定`human_personal`；invite產生的synthetic account固定`human_personal`。
- Provider `accountType`只作server-side eligibility與fixture斷言；linked account的UI type仍只由governance principal admission投影，provider結果不得自動建立admission或成為第二taxonomy authority。
- Existing candidate只有`active=true`、`verified=true`且account type為`human_personal`或`human_privileged`才eligible；`unclassified`固定回`ACCOUNT_NOT_ELIGIBLE`，不得由service猜測類型。
- `issuer='urn:orgmaster:local-account-provider'`；subject由adapter以normalized Email deterministic產生，只能留在server。
- 同`requestKey`重放回相同operation reference與logical operation；local operation reference固定為`local-invite-`加`sha256(requestKey)`前24碼，因此即使response loss，`readInvitation`仍可只靠request key定位結果。不同request key對同Email仍由service open-enrollment uniqueness阻擋。
- 預設invite回`pending_acceptance`、有效期72小時，`emailDelivered=false`；測試可注入timeout、unavailable、failed、accepted observation，不得加入Browser可控制的raw provider result API。
- `ProviderAccount`與observation只可由server service接收；任何序列化到HTTP response的路徑均為測試失敗。

此V1 port刻意只服務local deterministic provider，並非production adapter的永久介面。Future Production Phase必須重新驗證provider是否支援request-key idempotency／lookup並以版本化port銜接；不得只擴大literal union後直接宣稱production-ready。

### 17.4 Shared identity-link policy

`server/orgmasterIdentityLinkPolicy.ts`固定為無I/O、無HTTP、無permission判斷的純domain module；DEV-043 current-actor compatibility與DEV-045 provider-account flow必須共用，禁止各自複製唯一性邏輯：

~~~ts
export interface VerifiedIdentityTargetV1 {
  employeeId: string
  principalId: string
  issuer: string
  subject: string
  newIdentityLinkId: string
}

export function resolveIdentityLinkUpsert(
  document: GovernanceDocumentV3,
  target: VerifiedIdentityTargetV1,
  at?: string,
): GovernanceIdentityLinkV1

export function assertIdentityLinkStatusMutationAllowed(
  document: GovernanceDocumentV3,
  input: {
    identityLinkId: string
    employeeId: string
    status: 'active' | 'inactive'
    actor: GovernanceActorContext
  },
): void
~~~

`resolveIdentityLinkUpsert`以principal ID與`issuer + subject`雙鍵找全部link；兩個key未落在同一筆、任一exact link已屬其他Employee、或多筆exact link一律`IDENTITY_LINK_CONFLICT`。同Employee active回同一value形成governance noop；inactive沿用原ID與`validFrom`，改為`status='active'`、`validTo=null`；只有無既有link時才採caller提供的deterministic `newIdentityLinkId`。`assertIdentityLinkStatusMutationAllowed`對不存在ID回`IDENTITY_LINK_NOT_FOUND`，link不屬request Employee回`IDENTITY_LINK_CONFLICT`；只有目標為`inactive`時才拒絕目前actor自我停用及被active principal admission引用的link，後者回`IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN`。同status可由governance command形成noop，inactive→active可重新啟用。Service仍須在locked governance precondition內重跑全部policy檢查。

### 17.5 Service ownership and transitions

`server/orgmasterGovernanceStore.ts`先以additive export提供純讀接點；實作只能return既有private `readV3Raw(root)`結果，不得轉呼叫seed／migration API：

~~~ts
export async function readExistingGovernanceStore(
  root?: string,
): Promise<GovernanceStoreRead>
~~~

`server/orgmasterAccountEnrollmentService.ts`固定export下列interface與factory；HTTP層不得重做domain判斷：

~~~ts
export interface AccountEnrollmentRecoveryReportV1 {
  inspected: number
  advanced: number
  remaining: number
}

export interface AccountEnrollmentServiceV1 {
  readEmployeeAccess(actor: GovernanceActorContext, employeeId: string): Promise<EmployeeAccountAccessViewV1>
  invite(actor: GovernanceActorContext, request: InviteAccountRequestV1): Promise<InviteAccountResultV1>
  findExisting(actor: GovernanceActorContext, request: ExistingCandidateRequestV1, actorBinding: string): Promise<ExistingAccountCandidateViewV1>
  linkExisting(actor: GovernanceActorContext, request: LinkExistingAccountRequestV1, actorBinding: string): Promise<EmployeeAccountAccessViewV1>
  resend(actor: GovernanceActorContext, request: ManageInvitationRequestV1): Promise<EmployeeAccountAccessViewV1>
  cancel(actor: GovernanceActorContext, request: ManageInvitationRequestV1): Promise<EmployeeAccountAccessViewV1>
  setIdentityLinkStatus(actor: GovernanceActorContext, request: SetIdentityLinkStatusRequestV1): Promise<EmployeeAccountAccessViewV1>
  reconcileEnrollment(enrollmentId: string): Promise<void>
  recoverIncompleteEnrollments(): Promise<AccountEnrollmentRecoveryReportV1>
}

export function createAccountEnrollmentService(input: {
  root: string
  provider: AccountProvisioningPort | null
  devEnabled: boolean
  now?: () => Date
  token?: () => string
}): AccountEnrollmentServiceV1
~~~

固定行為：

1. `readEmployeeAccess`先讀organization與既存governance canonical state，驗證`identity.view`；固定呼叫additive `readExistingGovernanceStore()`，不得呼叫會seed／migration的`readGovernanceStore()`或`ensureGovernanceStore()`。該純讀接點拋出的schema、audit、缺檔或I/O內部code在account service邊界一律收斂為`GOVERNANCE_READ_FAILED`，不把store細節送到Browser。只有`devEnabled=true`才讀「若已存在」的local ledger，檔案不存在視為空且不建立；`devEnabled=false`完全跳過local ledger並固定`enrollments=[]`。依第6.3節投影該Employee全部`accounts[]`，development另投影non-terminal與每個target最新displayable terminal `enrollments[]`。它是pure read：不得呼叫provider、建立ledger、推進狀態或呼叫governance command。Account hint優先取同`identityLinkId` linked enrollment的`targetEmailHint`，沒有才用governance sanitized subject hint；provider label只由issuer allowlist映射，unknown issuer顯示「其他公司帳號」。Account type只讀通過validator的governance principal admission：無admission為`unclassified`，唯一human admission不論status投影其taxonomy；governance invalid直接fail closed。不得採信provider classification成為第二權威。無view丟`IDENTITY_VIEW_REQUIRED`，Client收到後整段不render。
2. Permission解析為`developmentPermissionForActor(actor, code) ?? evaluatePermission(active governance version, exact code)`；identity permission不使用bootstrap fallback，也不由`governance.manage`推導。
3. `invite`的第一個domain動作是查全ledger command receipt：同command＋hash回`{ disposition:'replayed', view: currentView }`且零provider call，同command不同hash丟`COMMAND_ID_REUSED`。非replay才檢查同Employee＋provider＋Email open request，命中丟`INVITATION_ALREADY_PENDING`；之後以provider exact Email lookup確認沒有active／verified account，若已存在則丟`ACCOUNT_ALREADY_EXISTS`且ledger／governance零mutation，讓Client保留Email並切換既有帳號模式。只有lookup確認可邀請後，才以同一次store mutation持久化command receipt、`requested`與`providerRequestKey`，再以CAS推進`dispatching`，之後才呼叫provider mutation。Lookup後若provider因競態回`ACCOUNT_ALREADY_EXISTS`，該enrollment轉`conflict: account_already_exists`後回409，不得刪除receipt或建立第二帳號；其他已知拒絕轉`failed`。Timeout／response loss先轉`outcome_unknown`並在同一service flow以相同request key做一次reconcile，仍不可觀察才保留unknown；成功記錄operation reference並轉`pending_acceptance`。
4. `findExisting`只接受exact Email且要求`identity.link`。找到active／verified且provider account type為`human_personal`或`human_privileged`的account後建立5分鐘candidate lease，HTTP只回隨機token；store只存token hash。找不到回`ACCOUNT_CANDIDATE_NOT_FOUND`，unclassified／inactive／unverified回`ACCOUNT_NOT_ELIGIBLE`；不得回可枚舉帳號清單或讓provider type直接建立governance admission。
5. `linkExisting`也先查command receipt；合法replay即使candidate lease已consumed仍回當下canonical view，同ID不同hash拒絕。非replay才以token hash找到未過期、未使用且actor／Employee綁定一致的lease；command receipt與綁定`candidateLeaseId`的`accepted_pending_link` enrollment同次落盤，再以`applyDraftCommand`執行`UPSERT_IDENTITY_LINK`。`principalId`只在local phase由`sha256(issuer + '\0' + subject)` deterministic產生；production principal mapping仍由DEV-040共同IAM接管。
6. Governance command ID固定為`account-enrollment-link:${enrollment.id}`。在`applyDraftCommand`的locked precondition內，以principal ID及`issuer + subject`雙鍵檢查：同Employee既有link沿用原link ID並重新啟用／noop，無既有link才使用`identity-account-enrollment:${enrollment.id}`建立；任何鍵已屬其他Employee即丟`IDENTITY_LINK_CONFLICT`。Governance CAS conflict保留`accepted_pending_link`，reconcile依invite的provider observation或existing flow的exact `candidateLeaseId`重試同一identity；成功後才把lease標為consumed並將enrollment更新為`linked`。任何重試不得產生第二個link ID或第二次provider provision。
7. `reconcileEnrollment`是唯一可推進`requested`、`dispatching`、`outcome_unknown`或`accepted_pending_link`的單筆reconciliation入口，只能由server-owned invite continuation、startup recovery或development test harness直接呼叫。Provider流程先以enrollment的非null `providerRequestKey`找到exact invite／resend command receipt，再用該key查詢；找不到或多筆命中直接store invalid。`requested`／`dispatching`／`outcome_unknown`只有在provider明確回`not_found`後，才依receipt action以同一key呼叫一次`requestInvitation`或`resendInvitation`，單次reconcile不得迴圈重送且永遠不得改用新key。Provider觀察為accepted時，先驗證verified account與Employee仍active，再推進`accepted_pending_link`並走同一identity-link policy；`accepted_pending_link`只重試同一governance link意圖，不查provider。Cancelled enrollment永不reconcile或自動link。Browser與GET均不可觸發。
8. `resend`只允許`pending_acceptance`或`expired`，先查command receipt，再以record revision CAS把receipt、新resend request key與`dispatching`同次落盤，之後才呼叫provider；response loss轉`outcome_unknown`並由同一reconciliation規則收斂，`outcome_unknown`直接resend回`PROVIDER_OUTCOME_UNKNOWN`。`cancel`允許`pending_acceptance`、`expired`或`outcome_unknown`，只以單次CAS把receipt與enrollment intent改為`cancelled`，不呼叫provider；後續provider即使完成也不得自動建立link。兩者均要求`identity.invitation.manage`；合法replay在revision檢查前回當下canonical view，同ID不同hash拒絕。
9. `setIdentityLinkStatus`是DEV-043 compatibility path，要求`orgmaster.governance.manage`，並以`assertIdentityLinkStatusMutationAllowed()`套用既有self-link與active admission guard後，才經`applyDraftCommand`執行同一canonical status command；它不授予invite／link能力、不建立provider side effect，也不得建立、修改或補寫enrollment history。
10. Employee inactive會使新mutation fail closed；同Employee＋provider＋Email多筆open、linked enrollment懸空／錯Employee、candidate lease錯綁、同principal或同subject跨Employee等service可見矛盾均fail closed；governance validator拒絕的schema／admission錯誤沿用`GOVERNANCE_READ_FAILED`。Active link與不同target enrollment可共存；不得由Client自行壓成單筆或選擇忽略矛盾。
11. Employee ID只驗證為非空、UTF-8 byte length不超過255，並exact命中`loadOrganizationSource()`回傳的Employee；不得呼叫`isUuidV7()`或以格式推斷Employee是否canonical。只有server新建的enrollment ID要求UUIDv7。
12. `recoverIncompleteEnrollments`只在`devEnabled=true`掃描`requested`、`dispatching`、`outcome_unknown`與`accepted_pending_link`，逐筆呼叫同一reconciliation入口並回傳計數；production／preview回零計數且不讀寫local ledger。每筆錯誤隔離並保留remaining，不得因一筆壞資料跳過store整體validation。

### 17.6 Fixed HTTP and runtime composition contract

`server/orgmasterAccountEnrollmentApi.ts`固定`ACCOUNT_ENROLLMENT_API_PATH='/api/orgmaster/account-enrollments'`，route如下：

| Method／path | Body | Success |
|---|---|---|
| `GET /employees/:employeeId` | none | `200 EmployeeAccountAccessViewV1` |
| `POST /invitations` | `{ commandId, employeeId, email }` | `201`新建；`200`replay，皆回account view |
| `POST /existing-candidates` | `{ employeeId, email }` | `200 ExistingAccountCandidateViewV1` |
| `POST /existing-links` | `{ commandId, employeeId, candidateToken, expectedGovernanceRevision }` | `200 EmployeeAccountAccessViewV1` |
| `POST /invitations/:enrollmentId/resend` | `{ commandId, expectedEnrollmentRevision }` | `200 EmployeeAccountAccessViewV1` |
| `POST /invitations/:enrollmentId/cancel` | `{ commandId, expectedEnrollmentRevision }` | `200 EmployeeAccountAccessViewV1` |
| `POST /identity-links/:identityLinkId/status` | `{ commandId, employeeId, status, expectedGovernanceRevision }` | `200 EmployeeAccountAccessViewV1` |

同檔固定export單一composition root：

~~~ts
export type AccountEnrollmentRuntimeReadinessV1 =
  | { status: 'ready'; report: AccountEnrollmentRecoveryReportV1 }
  | { status: 'failed'; code: 'ACCOUNT_ENROLLMENT_STORE_INVALID' }

export interface AccountEnrollmentHttpRuntimeV1 {
  service: AccountEnrollmentServiceV1
  middleware: Connect.NextHandleFunction
  startupRecovery: Promise<AccountEnrollmentRuntimeReadinessV1>
}

export function createOrgmasterAccountEnrollmentRuntime(input: {
  root: string
  devEnabled: boolean
  provider?: AccountProvisioningPort | null
  now?: () => Date
  token?: () => string
}): AccountEnrollmentHttpRuntimeV1

export function orgmasterAccountEnrollmentApiPlugin(options?: {
  runtime?: AccountEnrollmentHttpRuntimeV1
}): Plugin
~~~

Factory每次只建立一個service與一個provider instance；`devEnabled=true`且未注入provider時使用local adapter，`devEnabled=false`強制provider=`null`。`startupRecovery`在factory建立時立即且只啟動一次，將store validation failure收斂成`failed`結果而非unhandled rejection。Middleware只攔`ACCOUNT_ENROLLMENT_API_PATH`，await同一readiness後才處理；其他API／static route直接`next()`且不得等待account recovery。Readiness失敗時只有account routes回`ACCOUNT_ENROLLMENT_STORE_INVALID`，Employee其他明細與其他module仍可用。Vite plugin若注入runtime必須原樣重用；未注入則在各自`configureServer`／`configurePreviewServer`生命週期只建立一次，不能在request handler內建立。

- Invitation API以service的`InviteAccountResultV1.disposition`決定201／200，HTTP body只序列化`result.view`；HTTP層不得自行查ledger猜測replay，也不得重做command hash判斷。
- Middleware先使用`verifiedGovernanceActor(request)`，只有Vite development／`devIdentityEnabled=true`才允許`resolveDevelopmentIdentity`；未驗證回401。
- `actorBinding`由`readVerifiedRequestIdentity(request)?.id`或development principal建立，Client不得提交。
- 所有POST在parse body與任何service／provider call前執行`assertAccountMutationOrigin(request, devEnabled)`：`Origin`與`Host`必須存在、protocol只允許`http:`／`https:`且`new URL(origin).host === Host`；development另要求origin hostname為loopback。missing／malformed／不同port／host mismatch回`IDENTITY_ORIGIN_INVALID` 403且零mutation。GET不要求Origin。
- Vite plugin與`createOrgmasterServer`都在註冊／listen前建立一次runtime，因此recovery在任何request前已開始；account middleware只await既有`startupRecovery`，不得按request再次呼叫recovery。Standalone與browser harness可注入runtime並在案例前await readiness；GET不建立或啟動recovery。Production／preview readiness回零計數且不得讀寫local ledger。
- Middleware順序固定為migration gate → auth/request identity → account-enrollment →既有document／governance／management method APIs。Account runtime啟用時，composition同時以`accountEnrollmentEnabled=true`建立governance middleware，啟用第10節single-writer fence；不得靠plugin排列碰巧遮蔽舊route。
- Governance integration保持既有呼叫相容，exact signatures固定為`createOrgmasterGovernanceMiddleware(root = process.cwd(), devEnabled = false, accountEnrollmentEnabled = false)`與`orgmasterGovernanceApiPlugin(options: { accountEnrollmentEnabled?: boolean } = {})`。`vite.config.ts`同時註冊account plugin並對governance plugin明確傳`{ accountEnrollmentEnabled: true }`，使serve與preview的route／fence flag一致；preview runtime仍以`devEnabled=false`fail closed。`OrgmasterServerOptions` additive加入`accountEnrollmentEnabled?: boolean`與可測試注入的`accountEnrollmentRuntime?: AccountEnrollmentHttpRuntimeV1`；flag預設false，只有true時才掛account middleware、未注入則以`createOrgmasterAccountEnrollmentRuntime({ root, devEnabled: devIdentityEnabled })`建立一次，並把同一值作為governance middleware第三參數。`startOrgmasterServer()`本階段不讀新environment variable，因此production default仍停用，未經Future release gate不能切換。
- Governance fence仍先完成verified actor與既有`canManage` authorization，避免向未授權者揭露route狀態；current-actor route在revision檢查或command建構前回`IDENTITY_ACCOUNT_FLOW_REQUIRED`。Generic`PATCH /api/orgmaster/governance/draft`在body／command shape與既有manage權限確認後，若type為`UPSERT_IDENTITY_LINK`或`SET_IDENTITY_LINK_STATUS`即回相同錯誤，且不得進入shared policy或`applyDraftCommand`。`governanceErrorStatus()`明確映射該code為409；account service直接呼叫internal policy／store command，不受HTTP fence阻擋。
- POST只接受`application/json`，body上限64 KiB；unknown field、空command、非法command／enrollment UUID、非法status／revision、Email超過254字元均400或422。Employee ID只作非空、255 bytes上限與Organization source exact existence驗證，不套UUID格式。
- GET Employee route只接受base path後一個raw segment並decode一次；Client以`encodeURIComponent(employeeId)`組路徑。Malformed percent encoding回`INVALID_REQUEST`，decode後的任何opaque字元只交給Organization exact lookup，不再做route split或normalization。
- Response一律`Cache-Control: no-store`；不得在header、URL、error、correlation metadata或log回Email與provider identity。
- 只有composition顯式`accountEnrollmentEnabled=true`時account routes才存在；其中`devEnabled=false`的GET可投影既有sanitized identity link與`deliveryMode='unavailable'`，所有provider／ledger mutation回`IDENTITY_PROVISIONING_UNAVAILABLE`且不得建立local JSON shadow authority。Current Phase production server預設flag=false，不因程式部署自行啟用或封鎖DEV-043入口。
- 不提供Browser reconciliation、accept invitation、provider status injection或raw identity endpoint。

錯誤HTTP mapping完整沿用第11節。Governance `governanceErrorStatus()`另必須加入`IDENTITY_ACCOUNT_FLOW_REQUIRED`→409、`IDENTITY_LINK_NOT_FOUND`→404、`IDENTITY_LINK_ACTIVE_ADMISSION_FORBIDDEN`→422；account與governance兩邊不得各自給同code不同status。403 response只回error code，不回目前帳號狀態。

### 17.7 Client and UI wiring

1. `src/accountEnrollment/apiClient.ts`使用`credentials:'same-origin'`及JSON body；GET Employee path固定以`encodeURIComponent(employeeId)`產生單一segment。`AccountEnrollmentApiError`保存`code`、HTTP status、`field`與sanitized conflict Employee。Client不得設定development identity header；DEV-044 cookie session仍是正常路徑。
2. `App.tsx`新增`accountMutationEnvironmentAllowed = isDesktopMutationEnvironment(workspaceEnvironment)`並傳入Employee detail。它不看`workspaceMode`，所以桌面「現行版／唯讀」仍可依server identity capability設定帳號；organization document依舊不可編輯。
3. `DirectoryDetailPanel`只負責位置與Employee導覽，`onOpenEmployee(id)`轉呼叫既有`onSelectEntity({kind:'employees', id})`；不保存account state。
4. `EmployeeIdentitySection`以`employee.id + refreshToken`作request sequence key，stale response不得覆蓋新Employee。403 `IDENTITY_VIEW_REQUIRED`回`null`；其他load error才顯示就地alert＋「重新載入」。
5. 區段標題固定「登入帳號」，不顯示`0個連結`。Empty只有「尚未設定登入帳號」與一個「設定登入帳號」primary CTA；非empty依`accounts[]`與`enrollments[]`渲染扁平rows，區段標題旁最多一個quiet「新增登入帳號」。刪除current actor warning、`連結目前登入身分`及常駐說明。
6. CTA顯示條件為`accountMutationEnvironmentAllowed && employee.active && (capabilities.invite || capabilities.link)`；click handler再次檢查最新props與view，避免能力在操作中失效仍送出。
7. `EmployeeAccountSetupDialog`透過`WorkspacePortal scope='global'`掛載，不直接import `createPortal`。Overlay child使用absolute inset，不在`index.css`新增fixed viewport rule。
8. Modal只顯示capability允許的mode；兩者皆可時顯示兩個radio／segmented options並預選邀請，只有link權時直接選existing。畫面只顯示一個Email欄位與一個primary submit。`deliveryMode='simulated'`保留最短必要提示「地端模擬，不會寄出Email」，避免把fixture誤認正式寄送。
9. Existing模式第一次submit為「搜尋帳號」；找到後同一Modal就地顯示唯一redacted candidate，primary改為「連結帳號」。返回Email輸入不關閉Modal，成功才close並read back canonical view。
10. Modal open後focus Email；Escape／backdrop在not busy時取消，Tab留在dialog，關閉後回trigger。成功後若trigger消失，focus回登入帳號heading。Error保留Email與mode，欄位錯誤靠近Email，provider／conflict錯誤靠近action。
11. Pending rows只顯示hint、狀態與到期；`resend`／`cancel`是低權重情境動作。`outcome_unknown`顯示「正在確認結果」且不render重送。Account rows顯示hint、帳號類型與已啟用／已停用；多筆保持同一row骨架，不能只render第一筆。一般成功不顯示常駐成功訊息。
12. Conflict只在選定candidate後顯示Employee名稱與「查看該員工」；操作後使用既有Employee selection route。390×844完整只讀且無Modal入口；1024×768與1440×900不得overflow、重疊或雙重捲動。

### 17.8 Local migration and recovery

- 本DEV是additive local artifact，不改`OrganizationDocument`、governance schema version或Cloud SQL schema；首次合法local mutation才lazy seed V1空ledger，pure GET在檔案不存在時回empty projection且不落盤，不讀寫Employee Email欄位。
- Existing `data/`為gitignored使用者runtime data。RD／QA unit與API測試一律使用`mkdtemp()` root；不得寫repo `data/orgmaster-account-enrollments.v1.json`。
- Browser QC使用in-process task-owned HTTP harness與temporary root，並以已建置`dist/`byte manifest證明served artifact；不得操作或清除使用者目前`localhost:5000`資料。
- Current檔損壞時fail closed並保留current／previous供調查；不自動回復previous。Local人工恢復只在使用者另行要求時處理，不寫進產品按鈕。
- Provider outcome unknown只可read/reconcile；store寫失敗時不得呼叫下一個provider mutation。Development啟動時先執行`recoverIncompleteEnrollments()`，使「persist requested後process crash」與「provider commit後response loss」都能在重新啟動後用原request key收斂。Governance link成功而ledger final write失敗時，下次reconcile以existing exact identity link收斂為`linked`，不重建帳號。

### 17.9 Release Impact Note

- Change type：新增local account-enrollment API、ignored local JSON artifact、server middleware、identity permissions與使用者Modal。
- Compatibility：production authentication、Employee ID、governance V3、Cloud SQL與role assignment不變；`accountEnrollmentEnabled`預設false，未啟用時DEV-043 route行為保持原狀，顯式啟用後才套single-writer replacement；preview／production provisioning仍fail closed。
- Environment／dependency：不新增dependency、不新增必要environment variable、不修改Firebase設定。正式provider、Email與production persistence必須另進DEV-040／Future Phase release gate。
- 本節不包含production target、deploy command、traffic switch、rollback或production smoke。

## 18. RD slices, QA and QC executable plan

### S0 — Contract types, permissions and local provider

修改／新增：shared types、`ORGMASTER_PERMISSIONS`、DEV-044 profile permissions、provider port、shared identity-link policy與各自tests。

Gate：

- 四個permission code／ID唯一且administrator、governance-manager allow；method-manager、employee deny-by-absence。
- Local provider只接受`@orgmaster.test`，existing lookup exact，inactive／unverified／unclassified不eligible；同request key必須回同一operation，`timeout_after_commit`後可只靠request key讀回，且raw issuer／subject無Browser export。
- `IdentityLinkPolicy`的create／noop／reactivate、principal與issuer-subject雙鍵衝突、status self-link／active-admission guard及deterministic identity-link ID tests通過；policy不做I/O、不import HTTP／UI／store。
- `npm run test:dev-045`在S0可先以已存在檔案子集執行，不得用stub pass取代後續Gate。

### S1 — Ledger and orchestration service

修改／新增：store、service及其tests。

Gate：

- persist-before-dispatch、append-only command receipt、四種action replay、same-ID-different-hash／action、duplicate open、outcome unknown、reconcile、candidate TTL／actor binding與CAS tests通過；另固定「requested後中斷→模擬restart startup recovery」、「provider commit後response loss→同flow或restart recovery」及「resend key落盤後中斷／response loss」crash-window cases。
- Invite在建立ledger前先做provider exact lookup；已有active／verified account回`ACCOUNT_ALREADY_EXISTS`且ledger／governance零mutation，lookup後競態亦由provider conflict安全收斂。
- Provider success＋governance failure不觸發第二次provision；同identity跨Employee維持零mutation。
- GET在ledger不存在及存在兩種fixture下皆為pure read：provider call count=0，ledger／governance bytes不變。現行legacy alias、UUIDv4及含需encode字元的synthetic opaque Employee exact source ID均可讀寫；不存在ID與malformed path encoding拒絕。
- `readExistingGovernanceStore()`在現存V3下bytes／revision不變，缺檔時fail closed且不建立V1／V2／V3；DEV-045 read path source scan不得引用`ensureGovernanceStore`或舊`readGovernanceStore`。
- A14 fixture固定兩筆不同account type的identity links加一筆不同target pending enrollment；projection完整、排序固定、aggregate依優先序、provider classification不改governance admission。
- 跨store測試證明不巢狀取得enrollment與governance locks；任一CAS／finalize fault只留下可reconcile狀態，不做破壞性補償。
- 所有test root於afterEach移除且沒有repo `data/`寫入。

### S2 — HTTP boundary and server composition

修改／新增：account API、Vite／production server mount、API／server tests。

Gate：

- 真實loopback驗證401／403／404／409／422／503、64 KiB、Content-Type、no-store及route methods；所有POST覆蓋missing Origin、不同port、host mismatch、非loopback development origin與合法same-origin。另證明runtime factory在任何request前只建立一次service／provider並啟動一個startup recovery promise，account route await該promise，而GET request不建立或重啟recovery。
- 四角色API矩陣通過；production／preview mutation fail closed且不建立ledger。
- `createOrgmasterServer()`未傳flag時不建立account runtime、不掛account routes且DEV-043既有route維持；顯式`accountEnrollmentEnabled=true`才建立一次runtime並同步啟用governance fence。`startOrgmasterServer()`不得暗讀或預設開啟新production flag。
- 啟用DEV-045時，舊current-actor與兩個generic identity HTTP mutations都409 `IDENTITY_ACCOUNT_FLOW_REQUIRED`且bytes不變；非identity governance command仍成功。未啟用時保留DEV-043歷史契約。
- 注入invalid ledger時只有account routes回store invalid；Employee其他明細、document API與非identity governance route仍成功且不等待account recovery。
- Response／URL／header／captured console string forbidden scan不含raw Email、issuer、subject、principalId或provider ref。

### S3 — Employee UI and account setup Modal

修改：App、Directory detail、Employee section、Modal、API client、CSS及jsdom tests。

Gate：

- 「現行版／唯讀」桌面仍顯示有權帳號CTA；organization editing control仍維持唯讀。
- Empty只一個primary CTA，無current-actor warning或`連結目前登入身分`。
- Invite／existing／pending／unknown／linked／inactive／failed／conflict、stale response、403 hidden、focus／Escape／Tab與390只讀測試通過。
- Multi-account／mixed fixture完整渲染全部`accounts[]`與`enrollments[]`，保持deterministic row order且只顯示一個quiet新增入口；不得只取第一筆或把active＋pending誤判contract mismatch。
- `WorkspaceArchitecturePolicy.test.ts`通過，確認沒有raw portal import或`index.css position:fixed`。

### S4 — Aggregate QA／QC and candidate freeze

`package.json`固定新增：

~~~json
{
  "test:dev-045": "vitest run src/accountEnrollment/apiClient.test.ts src/components/EmployeeIdentitySection.test.tsx src/components/EmployeeAccountSetupDialog.test.tsx src/components/DirectoryDetailPanel.test.tsx src/governance/aiPdmCatalog.test.ts src/components/workspace/WorkspaceArchitecturePolicy.test.ts server/orgmasterAccountProvisioningPort.test.ts server/orgmasterIdentityLinkPolicy.test.ts server/orgmasterAccountEnrollmentStore.test.ts server/orgmasterAccountEnrollmentService.test.ts server/orgmasterAccountEnrollmentApi.test.ts server/orgmasterGovernanceApi.test.ts server/orgmasterGovernanceStore.test.ts server/orgmasterServer.test.ts",
  "qc:dev-045:browser": "node scripts/qc-dev-045-browser.mjs",
  "qc:dev-045": "npm run test:dev-045 && npm run build && npm test -- --testTimeout=30000 && npm run qc:dev-045:browser"
}
~~~

Browser harness固定：

- 不使用目前`localhost:5000`；以OS配置的ephemeral loopback port建立task-owned server，記錄PID／port／purpose／cleanup condition，完成後close並確認port released。
- 使用`dist/`frozen artifact，report記錄Git HEAD、dirty file list、每個served source file bytes／SHA、aggregate SHA、Node／Chromium版本與`productionWrites=false`、`emailDelivered=false`。
- Evidence path：`output/qa/dev-045/browser/<runId>/report.json`、`screenshots/*.png`與`output/qa/dev-045/browser/latest.json`。
- 正常入口一律從功能列開啟「員工」再選Employee；direct URL只能補route reload，不取代入口可發現性。
- 1440×900與1024×768：administrator、governance-manager各完成empty→Modal→invite pending；administrator另完成existing exact search→link、conflict→查看Employee。
- Administrator另以A14 fixture驗證兩筆account＋一筆pending enrollment全部可見、順序穩定且只保留一個quiet新增入口。
- method-manager與employee：登入帳號區段不存在；直接account API為403。
- 390×844：admin可讀account狀態但無任何設定、重送、取消或status mutation control。
- 每個非錯誤案例執行visible-error sweep：`.inline-error`、`[role=alert]`、HTTP 4xx／5xx、Not Found、Internal Server Error、console error、pageerror與預期fixture critical count全零任一成立即Fail。
- 鍵盤案例覆蓋CTA、mode、Email、submit、candidate、cancel、Escape、focus return；截圖至少含desktop empty、invite modal、pending、existing candidate、conflict及mobile read-only。

QC判定：targeted、build、full regression、browser任一新失敗即回送RD。DEV-043既有test-discovery例外只有在source與failure signature可證明完全未受DEV-045影響時才可單列follow-up；不得用它豁免DEV-045 targeted或UI Gate。

## 19. Traceability and readiness verdict

| Acceptance | Implementation owner | Automated evidence | Browser evidence |
|---|---|---|---|
| A1／A7 | Employee section＋account service | component／service tests | empty、conflict、Employee導覽 |
| A2～A5 | provider＋store＋service | saga／replay／reconcile tests | invite pending；accepted link以server harness證明 |
| A6 | candidate lease＋existing link | binding／TTL／CAS／redaction tests | exact search與candidate確認 |
| A8 | profile permission＋server authorization＋DEV-033 client gate | 四角色API／component tests | 四角色＋三viewport |
| A9 | governance command boundary | before／after role／grant byte-equivalence | linked後角色UI不變 |
| A10 | request sequence＋pure read／recovery | stale／503／409／store bytes與provider call-count tests | reload與保留上下文 |
| A11／A12 | Modal／CSS／QC harness | jsdom＋architecture policy | focus、keyboard、viewport、visible-error sweep |
| A13 | account API origin guard | same-origin／missing／mismatch Origin HTTP tests與zero-mutation snapshot | 正常same-origin UI流程 |
| A14 | account service projection＋Employee section | one-to-many DTO／ordering／admission authority tests | 兩account＋一pending完整rows與唯一quiet CTA |
| A15 | account runtime＋governance HTTP fence | singleton／readiness isolation／legacy route zero-mutation／nonidentity route tests | account failure時其他Employee明細仍可用 |

RD Technical Lead缺口關閉：

| Review finding | 最小修正 | Closure evidence contract |
|---|---|---|
| P0：response loss後缺reconciliation key | provider call前持久化`providerRequestKey`；port可用key做idempotent lookup；development startup recovery處理process crash | A3／A4同flow＋restart兩個crash-window tests |
| P1：Employee UUIDv7假設不符現況 | Employee ID改為Organization source opaque exact ID；只有enrollment ID要求UUIDv7 | A8 alias＋UUIDv4 fixture |
| P1：GET可能觸發ledger或governance seed／migration | `readEmployeeAccess`固定pure read並只用`readExistingGovernanceStore()`；reconcile只有server-owned direct service entry | A10兩store bytes＋missing-governance零建檔＋provider call count |
| P1：201／200無法由service判定 | `InviteAccountResultV1.disposition`由service產生；HTTP只負責mapping | API create／replay test |
| P1：型別／audit／Origin安全契約不完整 | 固定request／provider／audit types、permission records與same-origin guard | compile＋store chain＋A13 HTTP tests |
| P1：一對多domain被DTO／UI壓成單筆 | `accounts[]`／`enrollments[]`完整投影、deterministic ordering與mixed-state優先序 | A14 service／component／browser evidence |
| P0：新舊identity HTTP surface同時可寫 | account API成為唯一產品寫入入口；governance HTTP fence但保留internal canonical command | A15 legacy／generic negative與其他governance positive tests |
| P1：啟動恢復可能重複或擴大故障面 | composition root singleton＋單一readiness promise；只有account route await／fail closed | A15 factory call-count與route isolation tests |
| P0：resend沒有durable action identity | append-only command receipt＋每次resend獨立pre-dispatch provider request key | A3 management replay＋resend crash-window tests |
| P0：local successor可能未經release gate自動啟用production | server flag預設false、start path不讀新env；只有Vite／QA或顯式option啟用 | A15 default-disabled／enabled雙模式tests |

Readiness結果：

- P0 gap=`0`：authority、raw identity boundary、initial／resend pre-dispatch request key、response-loss reconciliation、identity唯一性、role isolation、single-writer HTTP fence、production default-disabled activation、exact files與failure recovery皆已固定。
- P1 gap=`0`：opaque Employee ID、pure GET、create／replay disposition、request／provider／audit DTO、one-to-many projection、shared policy、runtime singleton／failure isolation、exact permission records、same-origin Gate、local migration、UI state／focus、test commands、browser provenance與runtime cleanup皆已固定。
- Human decision blocker=`0`：公司正式Email domain、production provider owner、mail與production persistence尚未要求，已由Future Phase re-entry gate承接，不阻塞local Current Phase。
- RD Technical Lead re-review=`PASS`：前次1個P0與4個P1，以及本次architecture completion識別的3個P0／2個P1皆已以最小契約修正關閉；error／pure-read細節併入既有finding，無新增產品scope或ADR需要。
- RD可開始：是，只限S0→S4 local／isolated implementation。`RD Implementation Ready`不代表產品已完成、QA／QC已通過或可release。

使用思考習慣：#責任歸屬、#系統描繪、#驗收閉環
