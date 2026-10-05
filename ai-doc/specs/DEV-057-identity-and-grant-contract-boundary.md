# DEV-057：Principal 身分與角色發布（現行契約）

<a id="architecture-final"></a>

## 唯一施工入口

文件角色：CURRENT_CONTRACT。本地 `ORGMASTER/DEV-057#identity-grants`／`#principal-producer-impact` 參與 `JENFU/DEV-015`，consumer為 `AIPDM/DEV-121#target-authorization`。沿既有任務，架構已定案；不從歷史測試或文件成熟度推論正式交付完成。

原文完整保存於 [HISTORY_ONLY快照](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md)；逐人authority switch、雙版正常session、AAL2強制及舊catalog發布步骤均不再是施工入口。當輪來源／receipt仍可追溯，應用中的已套用migration不可改寫。

本地進度只在 [DEV-057任務](../dev_task.md#dev-057-current-contract)維護；共同根因、授權出口與延期業務判定、跨專案階段及下一交付在 [JENFU既有盤點](../../../Jenfu-Platform/ai-doc/qa/DEV-015-principal-only-authorization-inventory-2026-09-29.md)，不在規格複製Rxx狀態。

<a id="system-admin-catalog-v6-reader"></a>

## 本批 v5／v6 目錄讀取契約（2026-10-05，RD Implementation Ready）

參與 `AIPDM/DEV-121#system-admin-capabilities` 的新修正批次；source 實作、整合與正式發布證據尚未完成。人類允許 Jed 全部有效應用能力；AI-PDM 產生 immutable `ai-pdm.role-catalog.2026-10-05.v6`，其他八角色不擴權。OrgMaster 只維持 stable 角色／scope／Principal 指派，不解釋各 API 業務能力。

正常 server 讀寫先從 active producer version/hash 選取一份 source-controlled exact v5/v6 artifact，完整驗證九角色及其 metadata／permission/hash。registry、governance validation／publish 與 role-capability workspace 必須引用同次 active artifact；不能只放寬 registry，仍使用 bundled v4/v5 workspace，也不使用 process-global mutable catalog。未知版本、mixed rows 或 tamper 仍 fail closed。前端顯示當前 server readback，不自行決定 active 版本。

AI-PDM 的角色能力顯示改為只讀 v4：consumer 在自己的 verified Principal/company PostgreSQL snapshot 讀已發布 catalog 及唯一 grant v4；持有人統計限目前公司 active profile 的 global/workspace 有效 Principal。不呼叫沒有 OrgMaster session 的 HTTP workspace、不轉傳 cookie、不合成治理草稿或 publication revision。OrgMaster 繼續提供身分／指派／scope 與正常治理 UI；此顯示讀取不寫 owner 資料，也不增加授權來源。

歷史 v3/v5 assignment snapshot 只核對 stableRoleId／roleCode／subject／scope 等未變角色語義；原 catalogVersion 保持 provenance，不重新寫入 published policy 或提供旧版 permissions。新的指派仍須綁 exact active catalog。實際有效授權仍使用唯一 `v_ai_pdm_principal_effective_grants_v4`，保留 direct/global exact target、委派、有效期、Employee eligibility 與撤權。

發布順序為 OrgMaster ordinary owner release（既有 30 筆 migration unchanged／zero DDL）先支援 v5/v6，讀回 v5 治理及拒絕成功後，再由 AI-PDM 在既有受控停用窗口發布081與v6候選。v6後OrgMaster需證明current workspace／activecatalog一致及相同exactPrincipal grant；不把短窗failclosed當正常可用。失敗沿既有Principal-only maintenance回復，不能重設AI-PDM activepointer或回UID版本。完整共同驗收以 [AI-PDM本批契約](../../../AI_PDM/.ai-doc/specs/DEV-121-target-authorization-boundary.md#system-admin-capability-batch)為準；原DEV-057結案與其他修正保留，這一批另驗。

## Owner 與現行資料契約

OrgMaster是Principal、provider pair、Employee狀態、account type、已發布角色與scope／委派的權威；不實作AI-PDM細部能力、resource predicate、worker用途或Platform登入。consumer只經版本化 `orgmaster_contract`，不得讀寫 `orgmaster_core`。

| 正式producer | 回答的問題 | 不代表 |
| --- | --- | --- |
| `v_active_principal_mappings_v1` | exact pair對canonical Principal及active Employee的role-neutral歸屬 | account classification、OrgMaster app role或業務能力 |
| `v_active_principal_accounts_v1` | 同一mapping的可信type／managed admission／Directory／lifecycle eligibility | Portal入口、AI-PDM capability |
| `v_principal_alias_history_v1` | resolved/unresolved、active/inactive的永久pair歸屬與歷史撤銷覆蓋 | active admission或其他employee的歸屬推定 |
| `v_orgmaster_session_principals_v1` | OrgMaster自有app/global role admission | AI-PDM入口或permission |
| `v_portal_app_visibility_v1` | 已發布且有效的exact app入口指派及其assignment version | 目標业務API allow；raw草稿不算 |
| `v_ai_pdm_principal_effective_grants_v4` | 已發布Principal的AI-PDM role、scope、委派及版本來源 | AI-PDM本地catalog能力與資源歸屬 |

現行唯一grant接口為 [orgmaster.ai-pdm-principal-effective-grants.v4 manifest](../../contracts/orgmaster-ai-pdm-principal-effective-grants/v4/contract-manifest.json)。不存在時fail closed，不fallback v2/v3或local ACL。歷史one-shot operator及舊authority receipt只作其原operation追溯，不冒充正常runtime。Portal、OrgMaster app role及AI-PDM permission分開判斷，但引用同一身分eligibility事實，不能各自重算一套分類。

<a id="principal-implementation-contract"></a>

## 身分發布、交易及分類不變條件

1. `(issuer,subject)` 對active binding須恰一筆，且Principal／Employee／account type一致。零筆未獲admission；多筆是歧義，不以 `DISTINCT`、`LIMIT 1` 或來源優先序遮蔽。Employee可有不同日常／特權Principal，同一Principal的多aliases必須同Employee/type。
2. `principal_ownership_reservations`永久固定Principal→Employee/type；`principal_identity_reservations`永久固定pair→Principal。未知歷史reserved＋NULL維持隔離；只能首次核實補值，不能從email／姓名猜測、轉派、刪除後重用或預設class。Principal text 1..255，不截斷。
3. publication、managed bind/verify、reactivation與其他仍可寫入identity的caller須取得同一transaction lock：`managed_identity_admission_authority` singleton → `persistence_authority` → 按鍵排序Principal/pair reservations。鎖後重讀publication／Directory／lifecycle／reservation；invariant、publication、receipt與outbox在同一owner transaction。runtime不得直接改reservation或以caller旗標跳過檢查。
4. managed typed row須與已核實identity的Employee／Principal／issuer／subject／admission revision／publication time完全一致，admission enabled、Directory present且沒有未完成lifecycle事件。UI「已連結」不是正式讀回；identity-only mapping不可用作app角色或補class。停止狀態即阻斷，恢復須依既有lifecycle完成Platform invalidation後才admit。
5. alias history保留inactive及unresolved，無email/token/角色；manifest與exact consumer ACL明列。Platform需完整歷史以初始化／撤銷，AI-PDM正常consumer不因此擴大到全alias history ACL。consumer無權建立OrgMaster或Platform狀態。
6. published typed eligibility是一套權威投影，Portal visibility、session admission、effective roles／grants從其衍生。JSON草稿與歷史版本保留；草稿不授權，position、effective-time、role/catalog狀態與委派來源須在發布及讀回皆可核對。

### 員工 Google 連結的現行呈現及重複操作

`managed-identity.v1.identity.state` 描述 Directory registration 的既有紀錄，不是 Principal 登入／授權裁定。`directory_linked_pending_auth` 已保存 Directory 連結；即使該 Employee 已經由另一筆核實、已發布的 Principal 正常登入，也不得從 email、登入者或頁面選取自動補寫該紀錄的 provider pair，不能把它重標為 `active`。

員工明細分別顯示 `not_linked → 待連結`、`directory_linked_pending_auth → 已連結`、`active → 已啟用`、`conflict → 連結衝突`。pending 提示改為連結已保存、登入與權限依已發布的 Principal 判定，不要求重做首次 Google 登入。初次連結入口只對 `not_linked` 且符合原 actor／權限／Employee／registry 規則者提供；前端亦拒絕 stale capability 的重複連結。已存／衝突的紀錄不可透過此入口覆寫。

candidate 查詢取得既有連結時，在外部 Directory RPC 與 lease 前回 `409 / DIRECTORY_IDENTITY_CONFLICT`。並行操作仍由既有 PostgreSQL lease fence 裁定；原生 identity／revision／admission errors 必須映射為相應服務錯誤，不包成 generic read 503。真正的 5xx 在 API 記錄固定 event、action、code，禁止 raw exception、SQL、email、provider ID 或 credential。原同源／session／published permission／privileged admission／CAS／confirm fence 均維持；無新 schema、migration、身分 bridge 或綁定寫入。

聚焦重現、production 原始訊號與驗證層級見 [DEV-057 連結狀態矯正](../qa/DEV-057-managed-identity-link-correction-2026-10-05.md)。這是既有 owner 的同根因修復，不回寫既有整合 L4 或重開 AI-PDM 業務分母。

## 角色、範圍及治理入口

沿現有治理session、managed-identity、帳號管理、角色指派／委派、發布與查核入口。OrgMaster發布stable角色ID及scope，AI-PDM擁有角色定義／能力catalog；不把每個HTTP method或Document Manager用途推給OrgMaster，不新增中央決策服務。

新的指派須核對AI-PDM當前active catalog；歷史assignment的原catalog provenance保持不可變，effective能力只由AI-PDM現行catalog決定。PostgreSQL `jsonb`欄位順序不是內容差異；catalog核對按source-controlled canonical/hash契約，不重新用原序列化字串誤判。治理session、managed-identity讀取及無權拒絕須納入候选驗證，底層錯誤保留redacted因果，不把 `GOVERNANCE_READ_FAILED` 視為員工尚未綁定。

scope保留exact source語意、company/resource與effective-time；`current`／`company-jenfu`只由AI-PDM可信company映射，不由URL推定。直接指派、position來源與委派的subject/application/role狀態須完整；Portal assignment version來自已發布治理版本，不拿mapping／catalog版本互比。撤權須真實PG producer→consumer證明當下權限消失。

Jed同一已驗Principal可承接已發布的rd／rd_manager／pdm_admin及scope，執行日常PDM；沒有管理bypass。system_admin仍限exact target Principal／direct／global，不以Employee-wide傳播或委派授權，也不能自審。

人類及管理員允許真實AAL1，不使用逐人pilot，不偽造AAL2。Google／GitHub／Cloud／Workspace MFA不變。即使Platform驗證登入成功，OrgMaster仍要自己的app role及治理權限；所有人類protected requests重驗session、epoch、active typed identity、當前role及業務範圍。

### 已驗 Principal 的 own governance decision 與交易責任

正常治理 evaluator、publish／activation 及 UI readiness 以 server verified canonical Principal／Employee 加目前 active published V3 OrgMaster role／permission 判定，不再要求 managed Principal 重複存在於治理 JSON `identityLinks`。session DTO 明列可信 `employeeId`，UI 使用該欄位；空／錯 actor 不能從 URL、body、草稿或 aliases 補成可信身分。JSON identity 與歷史模擬資料保留原用途；Employee-based assignment 可適用於各自已驗 exact pair、且 native eligibility 為同一 Employee 的 Principals，不接受任意 body P／E 作 verified input。other Employee、空 actor及 Principal-target assignment 的不相符 exact P／E仍拒絕；特權 target／admission 與候選 payload 驗證不因此放寬。

generic Financial role／management-grant 與 privileged assignment 的 actor authority 同樣只查 exact active published V3 policy；未發布 draft 的 owner role／management grant／privileged admission 不授權 actor。正常 activation 只切 active policy 時，殘留 draft 也不能恢復已撤回的 actor authority。候選 draft、deny、scope、effective-time、Employee status、organization version、續任與禁止自授權仍依原規則核對。

Cloud SQL mutation 使用同一 runtime client 的 `READ COMMITTED` write transaction，包含目前政策／workspace read、原 published actor decision、既有 024 writer 的 admission→persistence locks 與 governance CAS。writer 取得鎖後重新核對 workspace revision／version；COMMIT 前以 own schema2 session row `FOR SHARE` 核對 exact pair／P／E／epoch／authentication time／AAL、expiry／revocation，再經 native session-principal v2 及 Platform `read_principal_auth_state_v3` 重驗 eligibility、epoch／revoked-before，最後重驗原 published authority 的有效時間。拒絕須 rollback 候選、audit／receipt／outbox，不給 runtime raw singleton、migrator 或跨 owner core ACL。

managed bind／verify、quarantine／admission、workspace withdrawal 與 publication 依既有 common locks 序列化；session revoke 的 own row UPDATE 與 `FOR SHARE` 序列化。Platform epoch 僅經既有版本契約，在該讀取 snapshot 線性化 authentication；不宣稱鎖住 Platform core，亦不宣稱 epoch 在最後授權讀取之後更新能取消已授權的 in-flight commit。

驗證沿既有 unit／API 及 D57-22 真 PostgreSQL 入口：`scripts/qc-dev-047-postgres.mjs --suite=dev057` 的 cross-owner 組合須顯式給 `DEV057_CROSS_OWNER_AI_PDM_ROOT`、`DEV057_PLATFORM_PRODUCER_ROOT` 及 task-owned target。Platform epoch 使用其官方 migrations／既有 008→009 atomic supersession producer 及 010 manifest，記錄來源與 bytes，不能自建仿官方函式。產品測例使用 native managed Principal、無 JSON alias、實際 persisted schema2 UUID session；verified SSO 輸入仍為合成，不冒充 provider SSO 或 Production L4。published CAS／workspace／managed quarantine／admission／session／epoch 撤回的真交錯與寫入先取得 session lock 的反序由原 case 覆蓋，不新增 gate 或 DEV。測例以獨立 autocommit observer 觀察 exact writer／session lock，保留每鎖5秒及原拒絕／零副作用斷言；固定50筆scalar checkpoint由直接stdout傳送，runner只投影 stage／elapsedMs／withdrawal／forStage／status，不保存成功child的完整warnings或identity／DSN。

各 forced race 的 disposable fixture 從當時 current active batch讀回／還原baseline artifacts，不改retired batch或倒退epoch／mapping revision。quarantine及admission所新增lifecycle事件須在common lock內核對exact operation、當時完整 Employee×active application集合、pending及原事件IDs；winner commit／候選拒絕與零副作用證明後，才刪本case新增且整row仍相等的synthetic事件，所有baseline事件保持不變。還原後以consumer typed accounts、own session-principal v2 resolver及actual write actor guard重驗positive再進下一case。這是測試隔離，不冒充真正lifecycle consumer完成或Platform invalidation receipt；正式恢復仍依既有lifecycle契約。

## Session、錯誤與所有權

只接受正常SSO v2，由 [Platform精確wire及vectors](../../../Jenfu-Platform/ai-doc/specs/DEV-015-authentication-authorization-boundary-refactor.md#principal-implementation-contract)取得verified Principal／pair／Employee／原authentication time／facts／epoch與source expiry。cookie opaque；target expiry取既有app maxAge及source expiry最小值，不能用assertion TTL、不能刷新原authTime。

驗固定proof後，session row／revocation、Platform principal state、active pair／typed eligibility及OrgMaster app role，在同一REPEATABLE READ READ ONLY snapshot、同client與decision time核對。治理mutation在自己的write transaction再驗當前actor、publication/CAS及範圍，不復用交易外allow；網络I/O不放SQL transaction。缺／過期／撤銷為401，明確缺role/scope為403，歧義／producer讀取失敗／缺state為503；503不降級，不無限loading。

OrgMaster擁有治理資料、receipt、outbox及命令交易；Platform只擁有session invalidation。Platform以contract命名舊函式不代表可寫OrgMaster core或compatibility view。新runtime不再建立／使用legacy_authority切換狀態；歷史operation的readback與已授權恢復沿原receipt input處理，不能新增平行授權來源。未知commit outcome先讀原receipt／同input replay，同ID異hash或actor拒絕。

## Smoke 憑證 freshness 的 owner 邊界

原生入口為 `npm run reauth:dev-057:smoke -- --previous-version 7 --new-version 8 --commit`，只在本 owner 已審查、乾淨且與遠端 `master` 完全一致的 source 執行；預設無 `--commit` 只驗證，不寫 Secret／GitHub／receipt。固定 Org profile、production GitHub repository/environment、`orgmaster-prod-smoke-firebase-refresh-token` 與 `jenfu-platform-prod-orgmaster-release/receipts/credential-reauth/`，不接受另一 owner、Secret、bucket、環境或 API origin。程式重用 AI 原生 reauth 演算法的固定 owner 副本（來源 `18cebab1870f00e76d206a4748cfdb41c49f2c03`），執行時不 import sibling checkout。

先從 exact ENABLED prior numeric Secret 在 RAM refresh，驗固定 project／issuer／audience 的 RS256、password provider 與 same-subject self lookup，鎖定既有 own provider pair。人類輸入既有 email／密碼後只做 signInWithPassword；fresh auth_time 最大 300 秒、same pair、enabled/email-verified self account，經固定 Platform 正常 session 建立、兩次 Principal＋Employee＋AAL1 me、local logout 及舊 cookie 401。這不是 bootstrap，不建立帳號、不重設密碼、不發 verification email、不改 provider config、Employee、pair、角色或 first Principal。

commit 只允許 canonical safe numeric 相鄰版本（預設 7→8）；等待人類輸入後再驗 source，寫入前核 latest=prior、寫入後及 GitHub 同步前後核 latest=new/ENABLED，並用 constant-time exact bytes readback及 signed refresh/self lookup核對。Secret Manager addVersion 不提供此流程的跨服務 atomic CAS；這些 optimistic pre/post 檢查偵測競態，未知或部分寫入只能輸出 PARTIAL，不自動補寫、刪除或停用版本。GitHub 同步僅 own production Secret，檢查 command success與 own secret updatedAt metadata，不宣稱能讀回 GitHub secret payload。

PASS receipt 固定 `jenfu.dev057.smoke-credential-reauth.v1`、`APP_SMOKE_CREDENTIAL_REAUTH`、`releaseAuthority=false`、AAL1、exact source／pair hash／Principal／Employee／版本／GitHub及 self hash；不含 password、token、cookie、API key、email 或 raw provider response。consumer 必須驗 current source、exact adjacent versions、300 秒 auth_time與 authenticatedAt→observedAt 120 秒內，再在既有 source-only smoke Workflow rotation preplan／apply時重驗；receipt 不授予 release 或 Production L4。

頁面只 bind 127.0.0.1 隨機埠、random capability path、exact Host/Origin、CSRF、8 KiB、單次單筆提交、CSP/no-store，15 分鐘 TTL；到期前後禁止開始新 mutation，若已有部分寫入保留 PARTIAL。結束或到期關閉 task-owned listener，暫存 Buffer 清零並縮短 token／password引用；不宣稱 JavaScript 字串的嚴格 RAM zeroization。沒有自動 retry 或通用設定 wizard。

## Ordinary release 的 own smoke rotation 續接

source-only smoke Workflow rotation 完成後，正常入口可使用 `npm run deploy:production -- --check --smoke-rotation-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/releases/<rotation-release-id>/app-infra.json#sha256=<actual-byte-sha256>`；正式執行使用相同參數並移除 `--check`。只有本 owner 的 exact immutable ref可替換 current RELEASED baseline 的舊 infra ref，不使用歷史 remediation mode或新增 authority。無此選項的普通路徑及原 controlled remediation 保持原行為。

CLI 與既有 workflow prepare 共用 native routine decision，要求 migration、runtime及完整 infrastructure fingerprint不變；新 receipt必須是同 source／project／region的原生 `APP_INFRA_SMOKE_CREDENTIAL_ROTATION` APPLIED及self seal，原 infra 的 foundation、runner/controller digest、state lineage與完整地址集合不得漂移、serial必須增加。完整集合由本 owner 的 `dev040-production-release-infra-plan.json` stageA＋stageBAdditional導出（現行75項），並比對原 receipt；兩份 profile及原 infra source、active baseline source、新 source的實際 Docker COPY executable bytes必須一致。錯誤來源、缺失／額外地址、不同 executable、forward migration或歷史 mode都拒絕。

prepare只重新讀同 own bucket immutable native APPLIED receipt與其 credential ref，驗 exact hash、verified Principal／Employee／AAL1、相鄰 numeric及原 apply completed observedAt時的300秒auth_time／120秒reauth結果時窗。這是驗歷史已完成 mutation的證據，沒有放寬未來 reauth／rotation mutation的即時TTL。原 apply觀測早於 credential receipt、未來時間、PARTIAL／偽造seal或到apply時已過期皆拒絕。

operator CLI precheck另以現有權限唯讀當下 own Workflow 的name／serviceAccount／ACTIVE／revision及完整 source bytes，精確重建 source-frozen Terraform recipe與numeric版本；exact version及latest的Secret metadata都必須同new numeric且ENABLED，不access payload。結果標為 `OPERATOR_PROVIDER_CURRENT_METADATA`。prepare層標為 `OWNER_SEALED_APPLIED_ROTATION`，不要求verifier新增Workflow／Secret／tfstate讀權，不將operator snapshot當永久live proof。既有 ten-stage smoke與失敗回復仍必要，receipt續接不授予Production L4。

新一輪 own smoke rotation 接在已 RELEASED 的 infra-reuse baseline 時，continuation 必須先完整重驗該 baseline 所錨定的原 APPLIED rotation／credential／逐層 published source、lock、terminal與immutable ref；再將該已驗 rotation 作為新的 **apply-time predecessor**，驗新rotation的同owner／target／foundation／完整addresses／runner與controller、serial遞增、相鄰numeric及freshness。跨歷史rotation era亦保留各自原封存numeric／credential／state並完整重驗；只能向相鄰較小numeric及strictly older serial／同lineage下降，rotation歷史下降與每era reuse chain均限制在32內，錯序、cycle及過深拒絕。current RELEASED baseline、previousRevision及當輪control CAS不得改選較舊release。新rotation同source使用原生 `--smoke-rotation-ref`；source前進則由原producer建立source-bound reuse。reuse numeric綁定取自sealed receipt並與provider exact version一致，必須是正整數且在safe integer範圍；不固定在歷史版本8。prepare仍只讀immutable證據，不新增provider權限、Secretpayload、schema或人工gate。

## 已完成 smoke rotation 的 source-only infra reuse

當 own APPLIED rotation 已完成而 app source 前進，原 rotation／credential receipt保持原 source、版本及 bytes。現有 `produce:dev-040:prerequisite` 新增 `infra-reuse` stage，從同 owner clean official `master` source-lock、retained RELEASED baseline及原 APPLIED rotation建立新的 `jenfu.dev012.app-infra-reuse-receipt.v1`；不用舊 receipt直接作新 source authority，也不再輪替Secret或延長原 mutation TTL。原 credential仍按 rotation.sourceRevision及原 apply observedAt校驗。

輸入為 `jenfu.dev012.app-infra-reuse-input.v1`，只有 `schemaVersion`、`sourceLockRef`、`baselineIntentRef`、`existingInfraReceiptRef` 四個欄位，refs皆為own immutable byte hashes。入口為 `npm run produce:dev-040:prerequisite -- --stage infra-reuse --release-id <own-infra-package-id> --input output/dev-012/inputs/<own-input>.json`。producer對 source-lock／remote／HEAD／完整source identity前後重驗；baseline、原 infra、原 rotation及新 source 的完整IaC tree與16份Docker COPY executable bytes須一致。

連續 source-only release 可沿 current RELEASED baseline 的 infra-reuse receipt，有限度回讀 prior reuse chain 至原 APPLIED predecessor；current baseline／control CAS不退選較舊release。每層要求同own bucket immutable raw byte hash與self seal，receipt source／package source-lock／對應published intent及其release source-lock一致；package releaseId和application releaseId各自與自己的lock／terminal對齊，不假定兩者同名。對應terminal必須是sealed RELEASED、零remainingHumanAction及沿previousRevision相符的candidate；最終原predecessor亦須同published source、lock與RELEASED terminal。每層保持同rotation ref／source、原credential ref／apply observedAt、該層封存的 numeric version、foundation、完整75 addresses、state／manifest、runner／controller digest及實際COPY executable／完整IaC tree／profile／Workflow source。原rotation相對原predecessor的嚴格serial遞增與apply-time freshness仍驗證；後續已採該rotation的baseline則與rotation state精確等值，不要求再次116→更大serial。历史control snapshot不等同今日mutable head，當輪control與provider雙讀CAS仍沿原責任點重驗。

鏈驗證最多接受32層reuse，重複URI／cycle、缺失／wrong ref／seal／source／owner／state／版本／credential／executable／terminal均fail closed，第33層以 `SMOKE_REUSE_CHAIN_DEPTH_EXCEEDED` 明確停止。這是可診斷的運維限制，不宣稱未來可無限續接；本批不新增receipt schema、扁平anchor或新gate。prepare只新增own immutable歷史證據讀取，不新增provider／registry GET。

operator producer只讀已初始化的own `infra/google-cloud/dev-040-production-release`，要求backend `tfstate-jenfu-platform-prod`及profile exact prefix；只執行 `terraform show -json`、`state pull`及`output -json app_release_infra_manifest`，不init／plan／apply、不保存或列印完整state。解析後完整75 addresses（69 managed＋6 data）逐址唯一，完整集合及hash、state canonical hash、lineage／serial、manifest與原 rotation完全相符；不得篩除data或把原receipt／profile分母降至69，missing／extra／duplicate均拒絕。state保存的完整Job／controller模板投影至Cloud Run API格式，唯讀比較actual template、UID、etag／generation、image、identity、commands／args、env／Secret refs、SQL／volumes／VPC及其他非空字段；controller另要求100% serving的ready revision為current latest template且service account相符。own Workflow完整source、account／ACTIVE／revision及Secret receipt exact numeric／latest ENABLED metadata亦重驗，禁止讀Secret payload。雙讀snapshot任何binding漂移均拒絕。

controller template image與serving revision image可直接同digest，或由own `orgmaster-release/orgmaster-abort-controller` exact parent OCI index／Docker manifest list解析到唯一 `linux/amd64` child；不得接受任意resolved image。現有owner transport只向同image repository的兩個exact digest manifest URL發GET，禁止redirect；核對每份raw bytes SHA256、`Docker-Content-Digest`、media type、4 MiB body上限及parent descriptor的child digest／media type／size／platform。封存 `jenfu.dev057.controller-image-resolution.v1` 的raw manifest bytes及hash/header摘要，prepare純資料離線重驗唯一child membership，無registry GET或credential output。主工作已取得own diagnostic `dev057-r33-controller-manifest-diagnostic.json`：parent `a9532645f7ca5787125267872eabe9a7f7d55067cca331f7129e39cb480b4e6b`解析到child `bd6db105fa808ced90098b377be5005df6fcc633df598cb03f3f9ef3ce95c1a0`，100% ready revision `orgmaster-prod-abort-controller-00006-5m2`；此為本次合法解析的來源證據，未取代正式native producer及CLI的fresh雙讀。original `a6ed901`、current official `abed898`與施工HEAD `62c9903`的16份Git COPY blob再次核對相同，owner-runtime不在其集合。

普通CLI以 `--infra-reuse-ref=gs://jenfu-platform-prod-orgmaster-release/receipts/releases/<own-infra-package-id>/app-infra-reuse.json#sha256=<actual-byte-sha256>` 選取新receipt，可搭既有Principal-only recovery ref，禁止混用historical remediation／rotation mutation模式；CLI再讀完整state與live templates／serving／Workflow／Secret metadata並比較封存binding。prepare使用既有verifier，其run.viewer僅涵蓋own app，沒有Job／controller／Workflow／Secret metadata viewer；prepare與同capsule重入只重驗own immutable proof必填形狀／hash、exact current protected source與file閉包、原apply evidence、app readback及finalized aborted control／terminal／rollback generation CAS，不新增上述provider GET或IAM。operator snapshot不是永久live proof，prepare標 `providerCurrentReadback=false`。完整IAM只證明original verified TF recorded-state hash不變，沒有逐resource即時IAM readback判定。

R35B本批只修改既有continuation／合成Node harness／QC固定數及文件，無Cloud mutation；當輪本機完整owner250/250、QC Node子集207/207通過，source／PBDS保留。主工作歷史chain／source-lock診斷確認R34 reuse與原APPLIED source／RELEASED terminal形狀，仍不替代新protected source的fresh provider雙讀與正式prepare。R35B已以protected source `5840bbc5b7195d33f7c0e3a998bbed3725a1626c`、fresh sealed source-bound reuse及run `37240015601`十階段RELEASED發布；本輪正式授權scope依[owner安全結案投影](../qa/DEV-057-principal-authorization-production-closure-2026-10-05.json)與共同證據接受，文件收尾不啟動新Production release，不新增DEV、gate或變更grant counter責任。

## Owner GCC aligned-new applicability 續接

沿 `ORGMASTER/DEV-057` 與既有 owner build／scan 責任點處理 `CVE-2026-95619`。只接受 provider 原始 `HIGH`、Debian 13 OS `gcc-14 / 14.2.0-19` 的 exact occurrence；其他 HIGH／CRITICAL 仍阻斷。PBDS 與 aligned-new 使用同一批完整 native inventory，aligned-new 另取 nonroot Node TLS／crypto loader、全部實際 `.node`、file-backed bytes、vDSO、loader controls／aliases及 image config，固定 `dist-server/server.mjs`，不啟動 app、DB或網路。

reviewed own policy／immutable assessment須固定Org repository、target、artifact、bucket、調查source／image、完整native及loader fingerprints。R65A／R66b／R66c只引用已實證同 `libstdc++.so.6.0.33` SHA-256 `972bb2a18b71140dab0240f8a1f68ab3fb1d56bcd4c4f824a91b70888faf5a00` 的POSIX source／disassembly及aligned operator probe方法，不是Org判定；另外必須有own SUCCESS inspection、own log ref／readback及本owner exact inspection program hash。`fullElfCount`須等於實際完整inventory，沒有固定AI集合數。不能只用版本或缺少symbol判定 `NOT_AFFECTED`；任何缺失／額外／未載入native module、loader byte／control漂移或錯owner／source／artifact／ref均fail closed。

每次current source／immutable candidate image重跑該隔離inspection。正常candidate、verify及canonical將revision的完整environment／Secret numeric versions、service account、command／args／volume對sealed runtime config核對；禁止loader environment注入。缺少own policy／provider evidence時不得發布。只沿既有owner required checks及十階段發布，不新增DEV、CI job、severity豁免或Production L4判定；本機合成測試只證明拒絕契約。

## 固定驗收及交接

O01–O07沿原編號；失效雙軌斷言改驗終態與Principal-only恢復，過去結果不改寫：

| ID | 現行出口 |
| --- | --- |
| O01 | role-neutral binding、AI-PDM-only入口與OrgMaster app session隔離 |
| O02 | 全部正常identity writer共鎖、pair／Principal永久歸屬、兩向併發及未核實隔離 |
| O03 | 真實PG發布role/scope/delegation→唯一grant v4→AI-PDM allow；撤權/expired無allow |
| O04 | 發布、撤權、停用／重新admit、outbox競態同版本／同snapshot，未知outcome安全readback |
| O05 | 所有consumer只用明列contract及最小ACL，無跨core讀寫 |
| O06 | exact v2 producer/consumer conformance、session/current epoch、Principal-only recovery，v1正常caller退役 |
| O07 | Portal入口≠業務能力；scope／company映射、position／委派有效期與assignment version整鏈 |

共同 [F01–F10、發布與回復出口](../../../Jenfu-Platform/ai-doc/specs/DEV-015-authentication-authorization-boundary-refactor.md#architecture-final)保留原案例 ID 與授權出口，不由本機O案例代替。OrgMaster 可在完成正式 Principal／Employee／角色／scope 發布、Producer／Consumer PostgreSQL readback，以及本 owner 的 login/session／治理 allow-deny／Principal-only recovery 證據後，獨立結案自己的出口。Platform 的責任限於正式 login、SSO、Portal session 與入口 allow-deny；業務 capability／resource allow-deny 由各 consumer owner 驗證。本輪只處理 Principal-only 身分／授權整合；Principal command 稽核與回復納入整合 Production L4。一般 AI-PDM 業務 lifecycle／附件由 AI-PDM/DEV-122 延後，不阻擋 OrgMaster。共同 DEV-015 仍須彙整所有 owner 證據後才能判定聯合 Production L4，不由單一 owner PASS 推定；本輪該授權scope已由[共同安全結案](../../../Jenfu-Platform/ai-doc/qa/DEV-015-principal-authorization-production-closure-2026-10-05.json)及[owner投影](../qa/DEV-057-principal-authorization-production-closure-2026-10-05.json)接受，尚需文件QC／protected documentation PR；goalComplete當時為false，不能將PG、held workload或DEV122未測業務冒稱全Production PASS。

本輪正式證據含normal UI角色publish、無JSONLink可信session管理write200與persisted Principal audit、published revoke後同cached enabled UI POST403且無新version／denied command或額外document效果。temporary有效Org角色歸0但revoked history／可信audit保留，未exact回填整份原document；其他policy保留。global三old session401與正常Google／Portal三owner200／AAL1支持效果，raw CLI click transportUNKNOWN／POST未capture仍保留。retained source70d3只證Principal-only recovery compatibility，不含新R35治理race guard的宣稱；既有PG／task UI cleanup均已完成，歷史DEV014／DEV118原驗證結論不改。

正常source、forward-only migrations與manifest沿本owner current release profile核對，不複製歷史ordinal為新allowlist。首次共同主體轉換或有實際共享啟用依賴時協調共同停用視窗；已生效且未變的共享契約不要求每次單owner修正重開三系統切換或重發siblings。已套用migration、固定receipt與凍結release artifact不變；caller退役與exact ACL cleanup須有實際consumer證據。候選需驗證治理session、managed identity、published projection、撤權及無權拒絕，不能以operator Job讀回當正式service已修復。單owner本地證據與跨ownerProduction L4各自記錄；本契約不自行啟動正式變更。

[AIPDM現行consumer契約](../../../AI_PDM/.ai-doc/specs/DEV-121-target-authorization-boundary.md#architecture-final)。SQLite／release工具共用留後續，不擴大本DEV。

<a id="employee-number-command-v2-current"></a>

## DEV-057 current correction：DEV-014 員工編號 command v2

來源為 JENFU/DEV-014 QA014-05／06／18／19；沿 ORGMASTER/DEV-057 子任務修正，不新增主任務。編號是 Employee domain identifier，不能決定 Principal 或登入權限。Directory/DWD port 的設定不控制編號管理入口；可用 DTO 與已發布 Principal permission 決定操作能力，未配置 Directory 不提供連結／refresh capability。現行員工啟用資格規則不因此改寫。

正常 PUT employee-number 必須保存原 commandId，僅呼叫 assign_employee_number_v2。既有 command receipt table 保存正規化 request fingerprint（target／number／Principal／原 workspace、registry CAS；不含重試時間）、原結果及 command audit。相同命令先讀 receipt 再判原 CAS；不同內容／Principal 使用同 ID 拒絕。新的命令仍驗唯一、退役號碼、workspace／registry CAS。assignment／tombstone／audit／receipt 同 transaction；audit 或 receipt 失敗則全部回復。response 保持原 DTO，讀回目前 Employee 明細，不能由 receipt 自動改 Employee 或 provider binding。

沿既有治理 write transaction，在寫入前及 commit 前重驗 verified session／pair／Principal epoch；取得 admission→persistence owner lock 後重讀目前角色與 Employee 狀態，撤權或失效時整筆 rollback。local-json 只作明確開發 fixture；已套用 v1 保留歷史及舊來源回復相容性，正常 caller 不再呼叫它。forward-only 030 僅新增此 owner function，重用既有表；001–029 bytes 不變。發布前完成真實 disposable PostgreSQL 的重播、衝突、併發、audit/receipt 故障 rollback 及未授權拒絕；source-bound migration runner 必須先依既有 APP_INFRA_IMAGE_ROTATION 換成同一 frozen source 的 immutable image，受控 29→30 只追加 exact 030，之後一般發布仍 zero-DDL。回復僅限 Principal-only 來源；回復時不得改已發布 receipt 或 Employee／provider 歸屬，須明記本次功能修正是否隨回復撤回，不能以舊 UID 來源回復。
特定發布模式與前置檢查：`DEV057_EMPLOYEE_NUMBER_COMMAND_RECEIPT_V2` 僅接受既有 ledger 為 29 列且 001–029 prefix checksum 全部吻合後追加 exact 030，或 ledger 已為 30 列且完整 bundle checksum 驗證後作無 DDL replay。runner 在任何 migration SQL、DDL 或 ledger INSERT 前先讀取既有 ledger並套用 29／30 exact-count fence；missing ledger、10／28／31 等其他列數或同列數 checksum drift 均零寫入失敗。optional policy 僅由 OrgMaster source-bound TARGET 啟用；generic caller 未帶 policy 的原行為不變。

generic helper `scripts/lib/dev012-production-migration-runner.mjs` 已由 `infra/google-cloud/dev-040-production-release/migration-runner.Dockerfile` COPY；因此 owner Job 必須使用同一 frozen source 所產生、經既有 `APP_INFRA_IMAGE_ROTATION` provider readback 的 immutable image，不可沿用舊 digest。Migration receipt 必須證明完整 30 列及 apply/replay readback；ordinary release 僅驗 full 30-entry bundle unchanged 並保持 zero DDL。

## 歷史引用入口（非施工指令）

<a id="production-r3-release"></a>

歷史段落：[production-r3-release](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#production-r3-release)；查明舊決策或證據時才讀取。

<a id="production-r2-correction"></a>

歷史段落：[production-r2-correction](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#production-r2-correction)；查明舊決策或證據時才讀取。

<a id="principal-producer-impact"></a>

歷史段落：[principal-producer-impact](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#principal-producer-impact)；查明舊決策或證據時才讀取。

<a id="principal-review-20260924"></a>

歷史段落：[principal-review-20260924](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#principal-review-20260924)；查明舊決策或證據時才讀取。

<a id="principal-owner-command-amendment"></a>

歷史段落：[principal-owner-command-amendment](DEV-057-identity-and-grant-contract-boundary-history-2026-10-03.md#principal-owner-command-amendment)；查明舊決策或證據時才讀取。
