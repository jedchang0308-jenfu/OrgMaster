# DEV-054：DEV-014 Employee activation database contract correction

狀態：`RD Implementation Ready / Production Fix-forward Gated`

來源：`Jenfu-Platform / DEV-014 / zero-paid-seat fixture activation`。Production execution `orgmaster-prod-migration-runner-xqp5k` 在 transaction write 前以 PostgreSQL `42883` 停止，證明 service repository 已呼叫 `orgmaster_core.assert_employee_activation_v1(text,text)`，但正式 001～017 ledger 未建立該 routine。

本修正只追加 forward-only migration `018_dev014_employee_activation_contract.sql`。Routine 以 current workspace Employee 與 exact canonical revision 為第一道 fence；只有既有 JFS assignment 或 unresolved one-time legacy Employee exemption 才可通過。Assignment 回傳 `true／false`，legacy exemption 回傳 `true／true` 以持續提示補正，存在但缺 eligibility 回傳 `false／true`，Employee／revision 不符回傳 `false／false`。Application invalidation registry 不是 Employee exemption，嚴禁以 application-wide 狀態放寬此 fence。Routine 為 `STABLE SECURITY DEFINER`，owner 固定 migrator，只授予 OrgMaster runtime EXECUTE；Platform、AI-PDM 與 PUBLIC 均不得執行。

Production 順序固定為：本地 migration／ACL／release gates → merge → source-bound immutable runner rotation → owner migration 17→18 apply＋replay → candidate／traffic與 smoke → 兩筆 bounded fixture activation apply＋replay。禁止人工 SQL、修改 001～017、down migration、其他 Employee、IAM、Secret、service deletion或跨 application core access。

驗收：

- exact Employee＋revision＋assignment：`allowed=true / correction_required=false`。
- exact Employee＋revision＋unresolved legacy exemption：`true / true`。
- exact Employee＋revision但無 assignment／exemption：`false / true`。
- Employee 或 revision drift：`false / false`。
- runtime可執行；Platform／AI-PDM runtime不可執行。
- migration receipt 必須 `ledgerCount=18`、`applied=0..1`、`replayed=18-applied`，並證明 dev／staging cross-database denial。
