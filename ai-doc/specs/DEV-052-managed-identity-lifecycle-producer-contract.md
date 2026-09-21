# DEV-052：Managed identity lifecycle producer contract 補正

狀態：`Production Migration + Owner Release Complete / DEV-014 Provider L4 Pending`

來源：`Jenfu-Platform / DEV-014 / 014-PRODUCER-CONTRACT`

Owner：OrgMaster
日期：2026-09-21

## 1. 問題與決策

DEV-014 Platform protected release run `35579062204` 在 migration 006 的 prerequisite check 以 SQLSTATE `55000` 安全停止；execution=`platform-prod-migration-runner-8ztzn`。該 migration 需要 OrgMaster 發布下列既有文件所定義的 consumer contract，但 production ledger 001–015 並未建立它們：

- `orgmaster_contract.v_managed_identity_lifecycle_events_v1`
- `orgmaster_contract.v_managed_identity_lifecycle_event_principals_v1`
- `orgmaster_core.contract_manifest` 中 `orgmaster.identity-lifecycle = jenfu.orgmaster-contract.managed-identity-lifecycle.v1`

Platform candidate、service revision與traffic均未建立或修改。重試 Platform release不能補出缺少的 producer object，因此定案由 OrgMaster 以 repository-owned forward migration 016 完成 producer contract，再重跑 Platform migration 006／007。

## 2. 架構與資料邊界

OrgMaster仍是 Employee、principal reservation與managed identity lifecycle outbox的唯一資料 owner；Platform只消費版本化 `orgmaster_contract` view，不讀取 `orgmaster_core`。

事件 view只投影 `application_id='platform'` 的 `event_id`、`employee_id`、`event_kind`。Principal view以相同 Platform event連接append-only `principal_identity_reservations`，確保 Employee／identity從active projection消失後，Platform仍能失效先前已建立的session。此設計不依賴active-only mapping view，避免 lifecycle barrier期間遺失舊principal。

兩個view使用`security_barrier=true`，owner為`jenfu_orgmaster_migrator`。只有`jenfu_platform_migrator`取得直接`SELECT`；`PUBLIC`與三個runtime identities均無直接view權限，Platform runtime仍只能透過自己的SECURITY DEFINER consumer routine工作。Migration不得參照或修改任何 sibling `*_core` schema。

## 3. Forward migration 016

唯一 migration：`db/migrations/016_dev014_managed_identity_lifecycle_contract.sql`。

- version：`dev014-orgmaster-016`
- source SHA-256：`447acb8ce030495cae20ac1d22be005ea265be75893676d165502c409c3db185`
- applied SHA-256：`a25aae3dd8c86af2ec5cfb5f943d97dd47d4d4934a230bc8838ebe1365065790`
- contract signature SHA-256：`57771a5c7f2406245f724ee07f2c80ef95bd918dc9dbc66a2823a7a1626de5ee`

001–015必須逐欄、逐hash保持不變。016只新增兩個view、manifest row與最小grant；不改table、data、runtime、Directory、service、traffic或其他application。Applied migration不可修改；後續修正必須另增forward migration。

## 4. Release contract

新增唯一受控模式`DEV014_PRODUCER_CONTRACT_REMEDIATION`。CLI必須同時提供：

```text
--dev014-contract-remediation
--dev014-infra-ref=gs://.../app-infra.json#sha256=<64 hex>
```

Readiness與authorization均須綁定`DEV-014 / 014-PRODUCER-CONTRACT`及下列exact payload：

```json
{
  "kind": "MANAGED_IDENTITY_LIFECYCLE_CONTRACT_COMPLETION",
  "migrationVersion": "dev014-orgmaster-016",
  "contractVersion": "jenfu.orgmaster-contract.managed-identity-lifecycle.v1",
  "consumerApplicationId": "platform"
}
```

受控release只接受exact 001–015 baseline追加016，runtime template必須不變，並要求同source的`APP_INFRA_IMAGE_ROTATION` migration-runner receipt。Owner workflow維持`prepare → build → migrate → candidate → entrypoint → verify → decision → activate → canonical → finalize`；migration receipt未PASS前不得建立candidate。Ordinary release在形成001–016 baseline後恢復`UNCHANGED_VERIFIED`、零DDL。

## 5. 驗證與證據

| ID | 驗證 | PASS條件 |
|---|---|---|
| D52-01 | schema／manifest | view欄位、版本與signature exact |
| D52-02 | lifecycle semantics | 只看Platform event；active barrier後仍能由reservation取得舊principal |
| D52-03 | ACL | Platform migrator可讀；PUBLIC與三runtime不可讀；Platform migrator不可讀core |
| R52-01 | source gate | profile固定001–016與exact hashes；DB boundary PASS |
| R52-02 | release gate | 只有DEV-014 exact remediation接受15→16；其他mode／hash／runtime drift拒絕 |
| R52-03 | failure safety | migrate失敗時candidate／traffic mutation=0；無down migration |
| R52-04 | consumer join | OrgMaster conformance PASS後，Platform 006／007與Production L4才可續行 |

本機結果：`qc:dev-052:contract=PASS`、隔離PostgreSQL 18.4 `D52-01～03 PASS`、`test:dev-040:r2=74／74 PASS`、abort `6／6 PASS`、完整產品回歸`875 PASS／1 skipped`、client／server build與`check:db-boundary=PASS`。PostgreSQL runner已確認client closed、cluster stopped、port released、temp removed；所有本機證據`productionWrites=false`。

## 6. Production gate 與第一次執行

人類已於2026-09-21明確授權`jenfu-platform-prod / asia-east1 / jenfu-platform-prod-pg / jenfu_prod / OrgMaster migration 016 / owner release`。Source `0d5b7a937c7ef397fb35bd1035d2dae6e654221d`、runner `sha256:e2954a98834c6f2d95704e0ee90e225bd40f63c60223ce017a837dc479cf1be7`及APP_INFRA image rotation R5通過後，run `35583624698`完成prepare與build，但migration execution `orgmaster-prod-migration-runner-g276r`在取得bundle後、連線資料庫前以`MIGRATION_SET_DRIFT`停止。Failure path完成；candidate、revision與traffic mutation均為0，Production ledger仍為001–015。

根因是migration profile已擴成001–016，但`dev040-production-migration-runner.mjs`的`TARGET.entryCount`仍為15；此外owner-stage forward receipt validator仍只接受DEV-013的15-row receipt。修正固定runner為16，並依prepare所證明的release mode區分receipt：DEV-013維持`ledgerCount=15／applied=0..4`，DEV-014 remediation只接受`ledgerCount=16／applied=0..1／replayed=16-applied`。新增測試直接比較runner entry count與正式profile entries，避免日後再次只更新profile。Fresh source、immutable runner及APP_INFRA rotation完成後才可重試；失敗capsule不得重用。禁止人工SQL、改已套migration、down migration、擴張IAM、service deletion或sibling資料變更。

使用思考習慣：#第一性原理、#證據基礎、#驗收閉環


## 2026-09-22 Production execution readback

Migration 016已由source-bound owner release套用；run `35587433590`以source `4b512a4d48e306cef8d1371d7a354e50a3e8f05c`完成十階段並啟用`orgmaster-prod-6e65121a2875`。Platform 006／007、consumer conformance與雙admission其後均完成。DEV-052 producer contract已交付；DEV-014整體仍待provider browser L4。
