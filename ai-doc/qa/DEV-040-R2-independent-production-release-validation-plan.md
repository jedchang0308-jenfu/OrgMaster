# QA-DEV-040-R2：OrgMaster independent continuous production release

> **2026-09-11 R27 amendment（current）**：R27 artifact gates PASS後，migration在execution建立前因exact Job readback缺viewer而安全停止；provider executions=0，DB／candidate／entrypoint／traffic=0。新增固定oracle：APP_INFRA_B complete-set須含google_cloud_run_v2_job_iam_member.migration_runner_viewer[0]，role=roles/run.viewer、resource為own exact Job、member為own deployer；project-wide或sibling binding均FAIL。Rollback／terminal必以immutable migrate receipt區分NOT_APPLIED與FORWARD_APPLIED。

> **2026-09-10 R26 staged-IaC amendment（current）**：provider dry-run證實A／B錯誤分類會分別觸發B-mutates-A或A destroy既有B，兩者均已安全拒絕。SBOM IAM三地址現須為APP_INFRA_B additional `[0]`並由`incident_runtime_enabled=true`啟用；fresh B只允許三個SBOM＋exact-job override create，其他完整set read/no-op。

> **2026-09-10 R25 IAM regression amendment（current）**：§8新增own-prefix SBOM、exact migration Job override與無人工介入oracle。R25 migration execution=0且不計production PASS；修正後須fresh source-frozen APP_INFRA及owner evidence。

> **2026-09-10 R22 amendment（current）**：R22 Cloud Build及provider SLSA Level 3 provenance PASS；Artifact Analysis pre-discovery SBOM request以HTTP 400安全停止，terminal=`PRE_ACTIVATION_ABORTED`，無DB／candidate／entrypoint／traffic mutation。Provider scan為3 Critical＋15 High，依門檻阻擋。新增oracle：四kind＋exact digest occurrence分頁與scope readback、discovery-before-SBOM HTTP-400-only bounded retry、其他status立即FAIL、BUILD＋SBOM reference必備；production runner須為pinned Node 24 Distroless、UID/GID 65532且無global npm／不必要OS toolchain。Fresh aggregate `2026-09-10T074043-640Z`已含OrgMaster audit／DB boundary／build＋typecheck／diff check全PASS；R22不得計入production PASS。

> **2026-09-10 R20 amendment**：R20證實source identity、source upload及migration bundle PASS；Cloud Build create因custom builder缺own `iam.serviceAccounts.actAs`回403，failure recovery PASS，後續stage未執行。新增固定oracle：APP_INFRA_B additional complete-set含`google_service_account_iam_member.builder_act_as_self`且stage A不得含，role/member/resource精確綁`orgmaster-prod-builder`自身，且不得含sibling/runtime/deployer/verifier。R21舊分類source lock作廢；fresh app-infra apply/readback前R20／R21不可計為production PASS。

> **2026-09-08 DEV-012 S1C amendment（V2 historical；current見§7）**：當時新增official repo=`jedchang0308-jenfu/OrgMaster`／branch=`master`、owner source/runtime/intent chain、shared-LB host binding、internal verifier job、numeric smoke Secret、local data inventory→encrypted handoff→import→reconcile／restore，以及一筆明確human principal one-time bootstrap的驗證。Public `run.app`在該V2方案為FAIL；此入口判定已由§7 V3 direct-run contract取代。其data／principal與source provenance仍保留，local結果不得作current release authority。

- 文件成熟度：`V3 Architecture Finalized / RD Tech Lead PASS / Owner QA Contract Executed；V1／V2 Historical`
- 狀態：`V3 Owner PASS / S1B-21 PASS / DEV-012 S1C 8／8 PASS / S2 In Progress / Production NOT_RUN`
- 日期：2026-09-09
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
