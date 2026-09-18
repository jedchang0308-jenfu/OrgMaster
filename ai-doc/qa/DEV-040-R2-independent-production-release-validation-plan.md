# QA-DEV-040-R2：OrgMaster independent continuous production release

> **現行驗收／正式結果**：發布生命週期驗收見 §12；已部署版本的正式證據見 §13（run `35063120604`）。本次重構的本地驗證不改寫已部署版本。下列早期事件與 oracle 為歷史，不是初始化重播要求。

> **歷史事件｜2026-09-11 R38 pre-auth amendment（歷史）**：R34 exact execution `orgmaster-prod-migration-runner-pfnz7`為production migration與data evidence：`7 applied／4 replayed／ledgerCount=11`且data PASS。此結果不等於candidate、entrypoint、traffic或QA-012 PASS；三者仍NOT_RUN。Current回歸要求以`conditions[type=Completed]`判定Cloud Run v2 execution，並驗own exact Job resource-scoped viewer。R37因AI-PDM source drift整體作廢且無OrgMaster app apply；fresh R38須以idempotent replay確認migration，不得人工rollback已套用DDL。

> **歷史事件｜2026-09-11 R28 amendment（歷史）**：R28 exact OrgMaster migration execution已建立，但在001～011、data import與principal CAS前因缺shared DB roles／schemas以SQLSTATE `42704`停止，generic operation GET另回403；candidate／entrypoint／traffic=0。新增oracle：禁止operations endpoint，Service PATCH改驗exact Service settled state，Job run以run前後child execution差集＋current args唯一匹配取得exact execution。Platform production DB bootstrap receipt未通過source／target／隔離數值與task-owned Job cleanup前不得dispatch。R28不計production PASS。

> **歷史事件｜2026-09-11 R27 amendment（歷史）**：R27 artifact gates PASS後，migration在execution建立前因exact Job readback缺viewer而安全停止；provider executions=0，DB／candidate／entrypoint／traffic=0。新增固定oracle：APP_INFRA_B complete-set須含google_cloud_run_v2_job_iam_member.migration_runner_viewer[0]，role=roles/run.viewer、resource為own exact Job、member為own deployer；project-wide或sibling binding均FAIL。Rollback／terminal必以immutable migrate receipt區分NOT_APPLIED與FORWARD_APPLIED。

> **歷史事件｜2026-09-10 R26 staged-IaC amendment（歷史）**：provider dry-run證實A／B錯誤分類會分別觸發B-mutates-A或A destroy既有B，兩者均已安全拒絕。SBOM IAM三地址現須為APP_INFRA_B additional `[0]`並由`incident_runtime_enabled=true`啟用；fresh B只允許三個SBOM＋exact-job override create，其他完整set read/no-op。

> **歷史事件｜2026-09-10 R25 IAM regression amendment（歷史）**：§8新增own-prefix SBOM、exact migration Job override與無人工介入oracle。R25 migration execution=0且不計production PASS；修正後須fresh source-frozen APP_INFRA及owner evidence。

> **歷史事件｜2026-09-10 R22 amendment（歷史）**：R22 Cloud Build及provider SLSA Level 3 provenance PASS；Artifact Analysis pre-discovery SBOM request以HTTP 400安全停止，terminal=`PRE_ACTIVATION_ABORTED`，無DB／candidate／entrypoint／traffic mutation。Provider scan為3 Critical＋15 High，依門檻阻擋。新增oracle：四kind＋exact digest occurrence分頁與scope readback、discovery-before-SBOM HTTP-400-only bounded retry、其他status立即FAIL、BUILD＋SBOM reference必備；production runner須為pinned Node 24 Distroless、UID/GID 65532且無global npm／不必要OS toolchain。Fresh aggregate `2026-09-10T074043-640Z`已含OrgMaster audit／DB boundary／build＋typecheck／diff check全PASS；R22不得計入production PASS。

> **歷史事件｜2026-09-10 R20 amendment**：R20證實source identity、source upload及migration bundle PASS；Cloud Build create因custom builder缺own `iam.serviceAccounts.actAs`回403，failure recovery PASS，後續stage未執行。新增固定oracle：APP_INFRA_B additional complete-set含`google_service_account_iam_member.builder_act_as_self`且stage A不得含，role/member/resource精確綁`orgmaster-prod-builder`自身，且不得含sibling/runtime/deployer/verifier。R21舊分類source lock作廢；fresh app-infra apply/readback前R20／R21不可計為production PASS。

> **歷史事件｜2026-09-08 DEV-012 S1C amendment（V2 historical；current見§7）**：當時新增official repo=`jedchang0308-jenfu/OrgMaster`／branch=`master`、owner source/runtime/intent chain、shared-LB host binding、internal verifier job、numeric smoke Secret、local data inventory→encrypted handoff→import→reconcile／restore，以及一筆明確human principal one-time bootstrap的驗證。Public `run.app`在該V2方案為FAIL；此入口判定已由§7 V3 direct-run contract取代。其data／principal與source provenance仍保留，local結果不得作current release authority。

- 文件成熟度：`V3 Architecture Finalized / RD Tech Lead PASS / Owner QA Contract Executed；V1／V2 Historical`
- 狀態：`V3 Owner PASS / S1B-21 PASS / DEV-012 S1C 8／8 PASS / S2 Paused for Operator Re-auth / Production Migration and Data PASS / Candidate、Entrypoint、Traffic NOT_RUN`
- 日期：2026-09-11
- 規格 authority：[DEV-040 §30](../specs/DEV-040-jenfu-platform-entitlement-user-integration.md)
- 上游 authority：Platform DEV-012 §29；contract SHA-256=`857f8a94ab13f63071156f85e76e5c675b348588b1126c147e0e54b431b6e8c5`

## 1. 目標與證據層級

證明 OrgMaster 可在沒有 sibling checkout／credential／traffic authority的情況下，持有自己的production profile、ordered migration、artifact、candidate、machine activation、canonical verification與rollback。固定案例只提供DEV-012 S1B owner implementation evidence；local fixture標`LOCAL_CONTRACT`、受控non-serving target標`CONTROLLED_PROVIDER`，不得標`PRODUCTION`或取代S2／S3的Billing、quota、正式DB／candidate／traffic證據。

## 2. Fixed owner denominator

| Case | 正向 oracle | 必驗負向／失敗 |
|---|---|---|
| `040-R2-01` | profile exact project／region／service／origin／runtime SA／pool6 | legacy／staging target、extra key、CLI override在I/O前拒絕 |
| `040-R2-02` | migration manifest逐項複製001～010並唯一append 011，exactly 11與checksum正確 | glob／字母排序、漏011、改applied SQL、execution done冒ledger PASS |
| `040-R2-03` | production DB guard只接受`jenfu-platform-prod/jenfu-platform-prod-pg/jenfu_prod`及exact identities | staging login、local writable fallback、wrong DB／schema、cross-core access拒絕 |
| `040-R2-04` | required env names、numeric Secret references、account enrollment與side effects disabled | Secret payload落證據、任意env、通知／outbox未授權即啟用 |
| `040-R2-05` | single `releaseCapsuleRef`、同hash job handoff、service-wide concurrency | stage／approve／skip／receipt／target input、人工GO、sibling checkout |
| `040-R2-06` | own source→own builder/log bucket→own registry immutable digest | sibling SA／repo、mutable tag、builder有Run／Secret／DB權限 |
| `040-R2-07` | candidate template-only且traffic0；activation traffic-only且exact revision | mixed mask、LATEST承接、HTTP200即LIVE、create service／IAM |
| `040-R2-08` | five identities、OIDC numeric IDs／workflow/ref/audience與own resource conditions | organization-only、wrong repo/workflow、sibling bucket／service／state |
| `040-R2-09` | APP_INFRA_A→immutable controller digest→B complete-set，B保留A | B刪A、wrong state、mutable tag、DB／runtime Secret／sibling resource混入 |
| `040-R2-10` | CAS create-if-absent、generation update、unknown outcome先readback | 412覆寫、lease偷鎖、不同input共用op、刪歷史重試 |
| `040-R2-11` | event→controller action≤120秒、重送／crash只一筆verified own rollback | email當action、錯owner／candidate、blind PATCH、sibling／全DB rollback |
| `040-R2-12` | login→employee／entitlement update→reload、schema/role/cross-DB deny、publication與cleanup完整 | default enrollment開啟、ephemeral file authority、中央代寫PASS、runtime residue |

分母固定12案；少一案即NOT_RUN，任一正向或負向oracle失敗即FAIL。`040-R2-01～12`整體對應DEV-012 `S1B-21`，並由中央 `S1B-22～24` 再驗migration authority、ordinary independent release與cross-repo closure。

## 3. Commands and execution order

```text
npm run test:dev-040:r2
npm run qc:dev-040:r2
npm run test:dev-040:abort
npm run check:db-boundary
npm test -- --testTimeout=30000
npm run build
terraform fmt -check / init -backend=false / validate（dev-040-production-release）
git diff --check
```

執行順序固定 profile／migration／DB guard→workflow／provider→IaC／IAM→controller fault→normal-entry／closure。Provider deny與candidate測試只可在明示task-owned／non-serving target；serving production不做可能成功的越權測試。所有暫時runtime必先記錄owner／port／process tree／cleanup condition，結束時只清自己並證明port／process／container／tmp residue=0。

## 4. Exit

十二案、owner commands、Terraform validate／plan fixture、direct docs與cleanup全部同source PASS後，owner結果最多為`040-R2 Implementation Complete / DEV-012 S1B-21 PASS / S2 Gated`。Fresh Billing／quota／authorization、正式migration、candidate、canonical與traffic仍為NOT_RUN；不得以本文件或fixture宣稱上線。

## 5. `CONTINUOUS_NO_DWELL_V2` QA amendment

原十二案分母不變，但040-R2-05～12依DEV-012 §25重跑：single input須自動交接release intent→application digest＋migration bundle＋pinned runner→deployment capsule→migration→inactive candidate/tag→machine decision→activation→canonical→tag cleanup；IaC必含own production migration job與run binding；001～011 ledger／schema／ACL readback在candidate前完成；temporary tag只指exact inactive revision且不改general traffic。

新增負例固定涵蓋intent預填未知facts、漏migration stage／job、staging runner冒production、execution done冒PASS、deployer取得migrator actAs／DDL、candidate無HTTP驗證入口、任意tag或LATEST authority、tag流量漂移／殘留、run中真人GO與CLI／workflow placeholder。第一次local owner PASS標`SUPERSEDED_BY_CONTRACT_V2`，全部v2 oracle與owner commands同source PASS前不得恢復S1B-21。
## 6. DEV-012 §26 runtime bridge 驗證補充

S1B-21／S1B-15須證明一容器holding baseline可透過已驗章runtime config建立`orgmaster`＋固定Cloud SQL proxy的兩容器0% candidate；缺proxy、mutable tag、非numeric Secret、漏plain env、錯VPC／runtime SA／probe／resource或一般traffic變更皆在provider write前FAIL。

## 7. `CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP` current QA contract and result

本節依SPEC §30及Platform DEV-012 §29前向取代§§4～6中custom-domain、shared edge與nine-stage的current oracle；原12 owner cases保留基線，V3 delta由Platform S1C-01～08固定驗證。

| Gate | Current oracle | 結果 |
|---|---|---|
| Owner authority | V3 profile由OrgMaster擁有且hash exact；central只hash-ref；V2 bytes不變 | PASS |
| Control flow | 十stage，`candidate→entrypoint→verify` receipt鏈不斷，run中human action=0 | PASS |
| Entrypoint | fresh etag、exact三欄mask、template／traffic零漂移、no-op與unknown readback | PASS |
| Origin／Auth | canonical＋單一exact `ORGMASTER_RELEASE_CANDIDATE_ORIGIN`；wildcard／legacy host拒絕；session／CSRF／permission不退化 | PASS |
| Data／migration | 001～011、data inventory／reconciliation、first-principal CAS及cross-schema denial不被entry變更繞過 | PASS |
| Recovery | own traffic rollback→tag cleanup→entry baseline restore；already-direct baseline為no-op | PASS |
| Edge／scope | Hosting／LB／DNS=`RETAINED_UNUSED_EDGE`；TOTP、DEV-047、product UI及sibling均no-touch | PASS |
| Engineering exit | owner test、DB boundary、build／typecheck、diff、central S1C aggregate與cleanup | PASS |

Current evidence=`../../../Jenfu-Platform/output/dev-012/s1c/2026-09-09T111340-014Z/qc-report.json`，SHA-256=`bbd767fffb6364a770586cfe6122269ef1095184244a5ed4b2047d05d48b2b7f`。結果S1A 32／32、S1B 24／24、S1C 8／8，V3 Terraform validation PASS，scope=`LOCAL_RECORDED_PROVIDER`、`releaseAuthority=false`；只證明Architecture Finalized與V3 source implementation。正式data apply、principal mutation、Billing／quota、candidate、entrypoint、traffic與canonical仍`NOT_RUN`。

2026-09-10 shared-foundation handoff oracle：OrgMaster intent只接受own-bucket foundation mirror，bytes須等於Platform provider receipt；只有foundation可保留`shared-foundation` owner與Platform source provenance，infra/runtime/data owner或source drift仍FAIL。R15／R16安全停止不算正式PASS，須由fresh cohort重證。

2026-09-10 cross-OS／cross-Git source identity oracle：source lock與GitHub runner必對同一`git ls-tree -r -z --full-tree <revision>` canonical tree manifest取得相同SHA；manifest逐項綁mode／type／object ID／path，build上傳gzip則另有GCS bytes SHA。任何gzip／raw-tar跨環境bytes比較、tree manifest drift、空archive或identity fail後仍執行Cloud Build／migration／traffic都FAIL；R18／R19安全停止不算正式PASS。

## 8. R25 IAM correction oracle

S1B-21重跑必證明IaC／complete-set含`roles/storage.bucketViewer`、`roles/containeranalysis.notes.attacher`、只限encoded `orgmaster-release` prefix的`roles/storage.objectAdmin`，以及只限`orgmaster-prod-migration-runner`＋`orgmaster-prod-deployer`的`roles/run.jobsExecutorWithOverrides`。Sibling prefix／job／principal、無condition、project-wide object role、只有`run.invoker`或Terraform update／delete／replace均FAIL。

Managed build須由OrgMaster builder自行取得SBOM_REFERENCE與0 High／Critical scan，不接受human-generated SBOM。Managed migration須建立exact execution、完成001～011與data／principal readback，且在其PASS前traffic不變；R25只證明fail closed，不增加最終分子。

## 9. R28 exact provider readback／shared bootstrap oracle

Owner runtime須證明不呼叫`/operations/`；Service mutation只由exact Service settled readback、requested entry fields及零template／traffic drift判定。Migration POST前後完整分頁列出child executions，只接受唯一new＋exact current args match並輪詢該execution terminal；零筆、多筆、舊latest、args drift、unreadable或deadline均FAIL。沒有有效immutable migrate PASS receipt時，failure terminal不得標`FORWARD_APPLIED`，也不得進candidate／entrypoint／traffic。

Upstream negative gate須在production DB bootstrap receipt缺失、self-hash／Platform source／release／target漂移、8 group roles／8 IAM logins／8 memberships／11 schemas／1 extension／8 direct CONNECT不符、group CONNECT非0、PUBLIC CONNECT、`public` business object或task-owned Job cleanup未完成時，於OrgMaster dispatch前FAIL。Bootstrap PASS只建立shared prerequisites；001～011、data import、principal CAS、reconciliation、canonical smoke與最終QA仍須本owner獨立完成。

## 10. R40 one-time authority replay oracle

R34的成功data／principal CAS是唯一active authority；R39／R40失敗收據只證明candidate、entrypoint與traffic均未執行。Fresh source測試必新增以下固定oracle：

- 相同原始artifact inventory、governance source、catalog、media、preferences disposition及同一principal重跑時PASS，回傳`replayed=true／oneTimeAuthorityPreserved=true`，active data revision不變，requested revision另列。
- Replay前後`persistence_batches`筆數、`persistence_authority.active_batch_id／authority_version`與active governance bytes不變；不得把新release envelope當新business-data authority。
- 任一非governance artifact hash、governance原始source hash、catalog、media、preference、issuer／subject／employee、human admission或兩筆admin assignment漂移時，在candidate前FAIL且transaction rollback。
- Active batch缺失／非active、authority懸空或governance artifact缺失時固定`PRODUCTION_DATA_ACTIVE_AUTHORITY_INVALID`；不得fallback建立第二個authority。

Managed acceptance須以fresh owner run的migrate receipt及provider／DB readback證明上述正向不變量；local unit PASS只解鎖新source freeze，不冒充production結果。

## 11. R60正式結果與R78 retained validation（2026-09-15）

- R60 owner terminal=`RELEASED`；source=`dba1d4d3aa9f9bb947d56745b14c50ebd26674e5`；artifact=`asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:5f1b11cd78e506a5b40e8f1da04f2019e327133d6e7976f09e8c37167e3b4373`；revision=`orgmaster-prod-3f9aa8c7818d`。
- Provider readback：Ready generation 72，100% traffic；ingress all、default URL enabled、invoker IAM disabled；canonical `https://orgmaster-prod-9536592944.asia-east1.run.app`。
- Smoke：root=200、`/api/auth/mode`=200；R60既有authenticated、DB、deny、rollback與cleanup分母維持PASS。
- R78只驗immutable terminal並給`RETAINED_LIVE`；無新intent、dispatch、deploy或traffic mutation。
- Boundary：ordinary release不需siblings；DEV-047與edge／legacy retirement分離，不是040-R2缺件。

Final=`040-R2 Production Level 4 Complete / R78 retained validation PASS`。本節以R60 terminal、R78 cohort join與2026-09-15 provider readback為authority，不由早期local evidence升格。

## 12. 發布生命週期回歸（2026-09-16，現行）

正向：來源 SHA 改變、001–011/infra/runtime 不變，可沿用已過期但不可變的歷史 RELEASED 證據；完整十階段且 migration job/data import/bootstrap 呼叫數為 0，terminal DB disposition=`UNCHANGED_VERIFIED`。下一次更新使用最近成功版本，不能回到首次建置；不再要求 `APPLICATION_ONLY` 旗標。基礎設施指紋只忽略已移除的 productionData metadata，其餘設定與未知新欄位均納入。

Schema runner：實際 `runMain` 的注入式 provider/PG harness 必須能只帶 bundle/output refs 執行及發布 schema receipt，不讀資料包、不建立 principal。既有十筆 ledger 只追加 011 一次，第二次為 no-op；空 ledger、缺 relation、歷史 checksum 變更在任何 DDL/INSERT 前失敗。Data/bootstrap 參數在 credential/network/DB 前拒絕。此 harness 為本地證據，不冒充 live PostgreSQL 或正式 runner image 驗證。

恢復：舊 intent 缺 baseline 不可進入任一成功發布階段，但 rollback 與歷史證據讀取仍可用；候選 smoke 失敗維持原流量，activation 後 rollback 回到前版並清除 candidate tag，DB disposition 不得誤記成 FORWARD_APPLIED。Rollback 不逆轉已套用 schema。

反向：SQL、infra/config、runtime/Secret version、current revision、owner/source/ref hash、未 RELEASED terminal、殘留 tag、缺 baseline/verifier 或 fresh authorization 不符均須失敗；新 candidate 仍須通過 build/scan/內部 smoke 才能取得流量。不能把 baseline DB evidence 記成本次 live ledger QC。

UI：resume session 同樣載入 server capability；flag=false 或 capability discovery 失敗時不呼叫 managed API，保留既有 session 與唯讀身分；flag=true/dev profile 才開啟新區塊。後端權限與 fenced writer 不變。

執行：`npm run qc:dev-040:r2` 一次涵蓋 owner/prerequisite/routine tests、abort、DB boundary、全量 Vitest 與 client/server build。正式驗收以本次 workflow terminal 與 provider readback 為準；local PASS 不升格為部署完成。

本次本地結果（2026-09-16，生命週期重構工作樹）：`qc:dev-040:r2` PASS，報告=`output/dev-040-r2/s1b/DEV040-R2-S1B-20260916T075205273Z-2AFA5D49/owner-report.json`。涵蓋 `test:dev-040:r2` 55/55、`test:dev-040:abort` 6/6、DB boundary、全量 Vitest 200 files／815 tests PASS（既有 1 file／1 test skipped）、TypeScript 與 client/server production build PASS；另 `test:dev-012:production-data` 4/4、`git diff --check` PASS。這是同一執行者的本地驗證，`releaseAuthority=false`，不冒稱獨立 QC 或正式部署。既有 Vite 未來 native loader 相容性與 chunk size 提示不影響本次建置成功。

容量歷史：上輪固定 25 GiB 預留導致預檢 BLOCKED；本輪使用者於單次例外提案後指示「提交及部屬」，依該續行指示執行既有依賴的小型 Vite 建置（先前 dist/dist-server 共 2,215,465 bytes，執行前 C 槽約 33.5 GiB）。沒有安裝套件、建置本機容器、清理資料或修改全域容量政策。正式發布只更新應用程式，migration runner image 不重建、不執行。

## 13. 2026-09-16 ordinary release 實測結案

### 13.1 現行：生命週期分離發布

- 結果：`RELEASED / LIVE_VERIFIED`；[protected workflow 35070877802](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/35070877802) 十階段全數成功，2026-09-16 16:03:55（Asia/Taipei）finalized，remainingHumanAction=0。本次一次 dispatch 成功，沒有重播初始化或新增人工關卡。
- Release：`ORGMASTER-REL-20260916075344615-5E35167`；source=`5e3516737f7fc98cf0e2a1a30bdb2852a0817b0e`，已提交及推送 `master`；revision=`orgmaster-prod-293bc6b9e677`，provider Ready、100% traffic、candidate tags=0。前版／rollback reference=`orgmaster-prod-0adafd3cce7d`。
- Artifact：`asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:bb5981eb368b6f01de4080a717b0afc5a48c4db00e5833bb072dd726e1e54f08`；build/provenance/SBOM/scan PASS，20 findings、blocking findings=0。
- Capsule：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20260916075344615-5E35167/release-intent.json#sha256=dd89d32bab4606e15ba261307ce947b3158e1f2cce2c30d6f9f525517b588746`。Terminal 在上述 release 目錄的 `dd89d32bab4606e15ba261307ce947b3158e1f2cce2c30d6f9f525517b588746/terminal.json`，object SHA-256=`be5bce4f528344b011a7d1182aef94e198e3a196dd06e14bd9cfdcf22a660dbf`。
- DB：`UNCHANGED_VERIFIED`；migrationsExecuted=0、dataImportsExecuted=0、liveLedgerRead=false；未執行 DDL、資料／principal bootstrap、Terraform apply、IAM 或 sibling 變更。Schema runner 原始碼已提交，但正式 runner image 未重建／執行，不能宣稱已驗證該 image。
- Smoke：inactive candidate 6/6 與 canonical 6/6 PASS，涵蓋 auth-mode、session create/reload、authenticated DB read、unauthenticated 401、logout 後 401。Canonical=`https://orgmaster-prod-9536592944.asia-east1.run.app`。
- 瀏覽器：Playwright 1440×1000 真實載入[登入頁截圖](../../output/playwright/dev040-35070877802/login.png)，HTML/JS/CSS/favicon/auth-mode 均 200，畫面無可見錯誤；console 唯一錯誤是乾淨未登入 session 的 `/api/auth/me=401`（預期拒絕存取），沒有 module/chunk/runtime 載入錯誤。暫時 session=`dev040-release-35070877802`／owner PID=37796 已關閉並確認 process/ports 不存在，未干擾使用者分頁。
- 本地驗證見 §12；QC 後僅補寫證據文字，受測程式／設定／測試未變。Vite 未來 native loader/chunk 提示、GitHub checkout/setup-node 的 Node 20 棄用提示為非阻擋警告，未混入本次修正。
- 發布後 `npm run deploy:production -- --check`=`READY`，自動採用本次 RELEASED capsule 與 `orgmaster-prod-293bc6b9e677` 為下一次 baseline；未再次 dispatch。原有未追蹤 `scripts/tmp-button-drag.mjs`、`test-results/` 保留且排除提交／archive。
- 範圍：DEV-040 發布生命週期精簡已完成；DEV-047 012／Directory／admission 仍未啟用。本段為事後 evidence-only 更新，不另部署文件提交。

### 13.2 歷史：前次 ordinary release

- 結果：`RELEASED / LIVE_VERIFIED`；[protected workflow 35063120604](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/35063120604) 十階段全數成功，2026-09-16 14:28:50（Asia/Taipei）finalized，remainingHumanAction=0。
- Release：`ORGMASTER-REL-20260916061820313-22566AC`；source=`22566ac41cd1324e0dece1cd06f6a33cd595a00f`；revision=`orgmaster-prod-0adafd3cce7d`；provider Ready、100% traffic、candidate tags=0。
- Artifact：`asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:e2bee43c498669ecbe34c364f5b30e2b5b695e1aadbddd16987b658069029beb`；build/provenance/SBOM/scan PASS，20 findings、blocking findings=0（不宣稱零弱點）。
- Capsule：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20260916061820313-22566AC/release-intent.json#sha256=7161e1e96d803a0e5e4ff1a983fc8a0c760cfc1eb4f9b20707743405b149636a`。
- Terminal：上述 release 目錄內 `7161e1e96d803a0e5e4ff1a983fc8a0c760cfc1eb4f9b20707743405b149636a/terminal.json`；object SHA-256=`e535140df29040a3a21b9824bf53c0f99b52f62ddfdf142170447f60ddfc83bb`，self receipt SHA-256=`9c1a7ec35355aba90ffedc2bdf9a0fc3a5e35e759a747d8dffe3ca84a988a48f`。
- DB：`UNCHANGED_VERIFIED`，migrationsExecuted=0、dataImportsExecuted=0、liveLedgerRead=false；沿用 R60 migration 證據，本次 canonical `preference-db-read=200`。沒有重新 bootstrap、Terraform apply、權限變更或 sibling 操作。
- Smoke：inactive candidate 6/6 與 canonical 6/6 PASS，涵蓋 auth-mode、session create/reload、authenticated DB read、unauthenticated 401、logout 後 401。Public `/api/auth/mode=200`、`managedLoginEnabled=false`。
- 瀏覽器：Playwright Chromium 1440×1000 已實際載入並人工視覺檢視[正式登入頁](../../output/playwright/dev040-35063120604-login/login.png)。一次性 CLI exit=0、task owner PID 1264 已結束；未啟動 local server。另識別的 `dev068-title-child-drop-*` browser daemon 屬其他工作，未觸碰，cleanup 由原 owner 負責。
- RD 回歸：owner release/prerequisites 49/49、abort 6/6、DB boundary PASS、Vitest 200 files／815 tests PASS（既有 1 file／1 test skipped）、client/server build PASS；DEV-047 contract 12/12 PASS。最後 local gate report=`output/dev-040-r2/s1b/DEV040-R2-S1B-20260916T061751543Z-E87F4D44/owner-report.json`，其 releaseAuthority=false；正式完成依上列 managed evidence，不冒稱獨立 QC。
- 首次 run `35062309077` 因 provider tag hostname 誤判，在 activation 前停止；failure cleanup PASS，原版仍 100% traffic。修正後重跑成功，失敗證據保留，非人工取消或放寬 hostname wildcard。
- 成功後再跑 `npm run deploy:production -- --check`=`READY`，已自動採用新正式版為下次 baseline，沒有 dispatch 第二次。原 `scripts/tmp-button-drag.mjs`、`test-results/` 保留且不納入 archive。
- 範圍：相容程式已部署；DEV-047 的 012／正式 Directory 憑證／admission 啟用未執行，不混算成本次已交付功能。這些不再阻擋一般程式更新。本文為事後 evidence-only 更新，不產生另一輪程式部署。

## 14. DEV-013 Production L4 012–014 controlled append validation（2026-09-18，current）

G2 failed-attempt oracle：GitHub run `35299453716` 的 verify 以 `principal_directory_unavailable` 終止；Workflow execution `f6d56dae-2b1b-415a-a748-dc1f621285a4` 在 session create 取得 503，Cloud Run DB proxy連線成功，production traffic保持 `orgmaster-prod-bd2c2ccb8291` 100%。這證明缺的是 owner migration admission view，不得以重試 smoke、人工改 DB或直接切流處理。

驗證分母：

| ID | Oracle | PASS |
|---|---|---|
| M14-01 | Profile exact set | 001–014 path/order/source/applied hash精確；baselineCount=10 |
| M14-02 | Prefix preservation | production baseline bundle前 11 entries與新 bundle逐欄相同 |
| M14-03 | Controlled append | 只有 DEV-013 sealed transition接受 012／013／014；ordinary release對相同差異拒絕 |
| M14-04 | Runner target | fresh source-matched APP_INFRA_IMAGE_ROTATION digest；exact project／region／job／DB／IAM login，bundle entryCount=14；bootstrap/data args在任何 credential/network前拒絕 |
| M14-05 | Ledger | 001–010缺失或任一 checksum不符時零寫入；既有011 replay，依序套用012–014，readback=14；第二次為0 applied |
| M14-06 | Stage order | raw migration receipt PASS前不得建立 candidate；成功 terminal=`FORWARD_APPLIED` |
| M14-07 | Failure recovery | migration後 candidate／smoke失敗時traffic維持或回復前版、tag清除、無 down migration |
| M14-08 | Subsequent release | forward receipt可作immutable baseline；完整001–014 unchanged回到零DDL ordinary path |
| M14-09 | Boundaries | sibling schema、DB、service、retained edge、Billing、Hosting、LB與service deletion mutation=0 |
| M14-10 | Product | candidate與canonical session create／reload、DB read、logout後401及DEV-013 global logout PASS |

本地必跑命令與正式 provider證據依 DEV-040 §36。Fresh source、migration-runner digest、root authorization與 predecessor re-attestation必須互相 hash-bound；舊 `e15121a` authorization及 failed release capsule不可重用。

2026-09-18 local result：M14 source gates PASS；`test:dev-040:r2` 62／62、abort 6／6、DEV-050 targeted 39／39、contract 6／6、full regression 209 files／863 passed／1 skipped、DB boundary、client/server build與diff check PASS。Owner report=`output/dev-040-r2/s1b/DEV040-R2-S1B-20260918T030624987Z-13CD50E6/owner-report.json`，evidenceScope=`LOCAL_CONTRACT`、releaseAuthority=false。M14-09～10的production provider結果仍待fresh exact authorization後執行。
