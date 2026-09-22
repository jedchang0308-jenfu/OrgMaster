# DEV-054：DEV-014 Employee activation database contract correction

> 2026-09-23 Production follow-up：governance v4 發布後的 activation 重播因 active workspace canonical revision 已前進而在寫入前以 `DEV014_LOGIN_FIXTURE_WORKSPACE_REVISION_CONFLICT` 停止。既有 fixture operator 的 `readback` phase 補回 `workspaceVersionId／workspaceRevision`，讓下一次 operation 使用 provider／database readback 的 fresh machine binding；此修正只有受控 readback，未新增 mutation phase、schema、IAM、Secret、service 或人工 SQL。

狀態：`RD Implementation Verified / Production 018 Applied / 019 Fix-forward Gated`

來源：`Jenfu-Platform / DEV-014 / zero-paid-seat fixture activation`。Production execution `orgmaster-prod-migration-runner-xqp5k` 在 transaction write 前以 PostgreSQL `42883` 停止，證明 service repository 已呼叫 `orgmaster_core.assert_employee_activation_v1(text,text)`，但正式 001～017 ledger 未建立該 routine。

第一階段追加 forward-only migration `018_dev014_employee_activation_contract.sql`。Routine 以 current workspace Employee 與 exact canonical revision 為第一道 fence；只有既有 JFS assignment 或 unresolved one-time legacy Employee exemption 才可通過。Assignment 回傳 `true／false`，legacy exemption 回傳 `true／true` 以持續提示補正，存在但缺 eligibility 回傳 `false／true`，Employee／revision 不符回傳 `false／false`。Application invalidation registry 不是 Employee exemption，嚴禁以 application-wide 狀態放寬此 fence。Routine 為 `STABLE SECURITY DEFINER`，owner 固定 migrator，只授予 OrgMaster runtime EXECUTE；Platform、AI-PDM 與 PUBLIC 均不得執行。

Production owner run `35724507823` 已將 018 套用並以 revision `orgmaster-prod-08e8673c3ef9` 承接 100% traffic。其後 bounded activation execution `orgmaster-prod-migration-runner-sbjsk` 在 workspace write 前回傳 `DEV014_LOGIN_FIXTURE_ACTIVATION_FENCE_REJECTED` 並完整 rollback。Readback 證明兩筆 assignment、admission 與 inactive target 均正確，但 routine 對 exact artifact SHA 回傳 `false／false`。根因是 migration 012 的 `v_current_workspace_employees_v1.workspace_revision` 實際取自 persistence batch `source_revision`，違反本 DEV、service 與 fixture runner 所使用的 current workspace artifact `canonical_sha256` 契約。

第二階段只追加 forward-only migration `019_dev014_workspace_revision_contract.sql`，以同 active batch 的 manifest 精確定位 current workspace artifact，並把 view 的 `workspace_revision` 修正為該 artifact 的 validated canonical SHA；欄位、型別、Employee集合、ACL與所有已套用 migration bytes均不改。隔離 PostgreSQL fixture刻意使batch source與artifact SHA不同，證明canonical SHA可通過而batch source被拒絕，防止再次被等值fixture遮蔽。

Production 後續順序固定為：本地 migration／ACL／release gates → merge → source-bound immutable runner rotation → owner migration 18→19 apply＋replay → candidate／traffic與 smoke → activation fence readback → 兩筆 bounded fixture activation apply＋replay。禁止人工 SQL、修改 001～018、down migration、其他 Employee、IAM、Secret、service deletion或跨 application core access。

驗收：

- exact Employee＋revision＋assignment：`allowed=true / correction_required=false`。
- exact Employee＋revision＋unresolved legacy exemption：`true / true`。
- exact Employee＋revision但無 assignment／exemption：`false / true`。
- Employee 或 revision drift：`false / false`。
- batch source revision 與 artifact canonical SHA不同時，只接受artifact canonical SHA。
- runtime可執行；Platform／AI-PDM runtime不可執行。
- migration receipt 必須 `ledgerCount=19`、`applied=0..1`、`replayed=19-applied`，並證明 dev／staging cross-database denial。
