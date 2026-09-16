# QA-DEV-040-R2：OrgMaster independent continuous production release

- 文件成熟度：`V2 Historical QA Contract；V3 Production Level 4 Complete`
- 狀態：`R60 LIVE_VERIFIED / DEV012-R78 RETAINED_LIVE / production PASS`
- 日期：2026-09-15
- 規格 authority：[DEV-040 §27](../specs/DEV-040-jenfu-platform-entitlement-user-integration.md)
- 上游 authority：Platform DEV-012 §26；contract SHA-256=`d88b9aaa8a5e27082746221fc5b473abd8a78da712409279baf5ecdb0e176f05`

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

## 6. `CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP` current QA contract and result

本節前向取代§4～5中把九階段、`jenfu.com.tw`或shared edge視為current release條件的部分；原12案仍保留作owner基線，V3 delta由Platform DEV-012 `S1C-01～08`固定驗證。

| Gate | Current oracle | 結果 |
|---|---|---|
| Owner authority | V3 profile由OrgMaster擁有；V2 profile bytes不變；中央只驗hash與receipt | PASS |
| Control flow | `prepare→build→migrate→candidate→entrypoint→verify→decision→activate→canonical→finalize` exactly once | PASS |
| Entrypoint mutation | exact mask `ingress,defaultUriDisabled,invokerIamDisabled`；fresh etag；template／traffic零漂移；unknown outcome只readback一次 | PASS |
| Origin／Auth | canonical加一個exact candidate origin；wildcard／legacy hash-host／port／userinfo／path拒絕；session／CSRF／permission不降級 | PASS |
| Recovery | own traffic rollback→tag cleanup→entry-baseline restore；412、timeout、candidate-live與already-direct baseline均有負例 | PASS |
| Edge／scope | Hosting／LB／DNS=`RETAINED_UNUSED_EDGE`且ordinary mutation=0；TOTP、DEV-047與sibling source均no-touch | PASS |
| Aggregate | S1A 32／32、S1B 24／24、S1C 8／8；三repo build／boundary／diff PASS；runtime residue=0 | PASS |

Current evidence：Platform `output/dev-012/s1c/2026-09-09T070233-600Z/qc-report.json`，SHA-256=`30dc6014c516a024a26556712881f219d1cdac84d4e7acce595eecced181a4ae`。Scope=`LOCAL_RECORDED_PROVIDER`、`releaseAuthority=false`，因此只證明Architecture Finalized與V3 source implementation完成。

Exit判定：`RD Tech Lead Architecture PASS / P0=0 / P1=0 / S2 Unlocked`。S2仍須fresh provider readback證明Billing link count／limit、budget headroom、B01～B10 quota、Identity authorized domains、APP_INFRA_A/B complete-set、immutable digests與numeric Secret versions；任一UNKNOWN或不符即FAIL。正式migration、candidate、entrypoint、traffic、canonical smoke與production closure仍為`NOT_RUN`，不得由本節推論已上線。

## 7. R60正式結果與R78 retained closure（2026-09-15）

- R60 owner terminal=`RELEASED`，source=`dba1d4d3aa9f9bb947d56745b14c50ebd26674e5`，revision=`orgmaster-prod-3f9aa8c7818d`，immutable artifact=`asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:5f1b11cd78e506a5b40e8f1da04f2019e327133d6e7976f09e8c37167e3b4373`。
- Cloud Run provider readback：Ready、generation=72、100% traffic指向上述revision；ingress=`all`、default URL enabled、`invokerIamDisabled=true`，canonical=`https://orgmaster-prod-9536592944.asia-east1.run.app`。
- Canonical smoke：root=200、`/api/auth/mode`=200；R60 owner既有authenticated、DB、deny、rollback與cleanup分母維持PASS。
- R78 coordinator只驗immutable R60 terminal並給`RETAINED_LIVE`；沒有建立OrgMaster release intent、沒有dispatch或重部署，也沒有因AI-PDM／Platform release調整OrgMaster traffic。
- Boundary：後續ordinary OrgMaster release只需本repo own source／artifact／migration／service／Secret／traffic／rollback，不需siblings。DEV-047與edge／legacy retirement是分離範圍，不列為040-R2缺件。

最終判定=`040-R2 Production Level 4 Complete / R78 retained validation PASS`。本節以R60 terminal、R78 cohort join及2026-09-15 provider readback為證據；§6的`Production NOT_RUN`只保留2026-09-09歷史範圍。
