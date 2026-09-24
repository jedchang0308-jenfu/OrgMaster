# DEV-014／015／057／118／121 consumer completion audit

日期：2026-09-24  
專案：ORGMASTER；跨專案引用 JENFU／AIPDM。  
用途：記錄 OrgMaster owner 的本地契約證據、Production readback 邊界與仍待真人互動的條件；不新增 gate、不改變資料或權限範圍。

## 已證實

- DEV-057 contract QC PASS，source hash `9c925bd36b357ef2d3997eb362cbbef566fbd4308acd22e647b72d1f2adb3d5`。
- DEV-057 task-owned PostgreSQL D57-01～D57-06 PASS；無 primary-data writes，隔離 runtime 與暫存資源已清理。
- OrgMaster managed-login owner suite `44/44`、DEV-014 fixture `10/10`、authority `12/12` PASS；managed bridge targeted tests `37/37` 與 client/server build PASS。
- Production owner release run `35902145983` 的十階段均成功，`orgmaster-prod` 維持 100% canonical traffic；未修改 schema、data、IAM、Secret 或其他 service。
- 既有 `employee-shijie` session 可讀取 OrgMaster normal entry 與角色治理；此證據只代表既有帳號，不代表 Free-only fixture 已完成。

## 尚未完成

- `dev014-fp-google@jenfu.com.tw` 與 `dev014-fp-number@jenfu.com.tw` 尚未各自完成首次 Google／Firebase 驗證，因此 managed-identity bridge 尚無 active link。
- 在 bridge readback 前，authority switch、receipt／outbox、完整 LOGIN 分母、Production L4、negative／rate／race 與 cleanup 均維持 fail-closed，不能以 local PASS 代替。
- 最近 authority Job 在 CAS 前以 `DEV014_LOGIN_AUTHORITY_AUTH_BRIDGE_REQUIRED` 停止，已恢復 `--bundle-ref-required` baseline，沒有 authority、receipt、outbox 或資料 mutation。

## Projection contract finding and fix-forward

這次停止的根因已與「managed identity 是否已連結」分開確認：managed bridge 的 active row 已存在於發布者契約 `orgmaster_contract.v_active_principal_mappings_v1`，但 authority runner 依賴 Platform-owned 舊 `access_governance.v_active_principal_links_v1`，它仍只投影治理 `identityLinks`。因此只有 managed identity mapping 的 Free fixture在舊 view 回傳 0 列；runner 在 CAS 前拒絕是正確的 fail-closed 行為，之前反覆重跑沒有解決 producer／consumer 投影斷點。

修正採 forward-only、契約分層方式：

- migration `022_dev014_managed_login_session_admission.sql` 新增 `orgmaster_contract.v_orgmaster_session_principals_v2`，以已發布的 `v_active_principal_mappings_v1` 加上 `orgmaster`／`ai-pdm` active assignment 作 OrgMaster session bootstrap eligibility；不放大 OrgMaster permission。
- migration `023_dev014_authority_principal_projection_contract.sql` 新增帶 `account_type` 的 OrgMaster-owned `orgmaster_contract.v_active_principal_accounts_v1`。Managed row 必須 exact match canonical employee／principal／issuer／subject／revision／published time，且 admission enabled、Directory observation present、無未完成 lifecycle event；legacy row 必須有明確 active governance admission。OrgMaster 不改寫 Platform-owned `access_governance` schema。
- Platform migration `008_dev014_platform_authority_switch_contract.sql` 在 `platform_contract` 提供 Platform-owned CAS v2，transaction 內重新檢查 OrgMaster accounts adapter，僅允許 `human_personal`，再原子寫入 Platform authority／receipt／outbox。OrgMaster runner 先比對 canonical mapping 與 accounts adapter，再呼叫此 function；它不再依賴舊 Platform view作為新流程的身份來源。
- 舊 v1 migration bytes、既有資料、assignment、authority、receipt、outbox、IAM、Secret 與 service 均未修改；本輪只做 local contract／build／targeted test 與文件修正。

在 OrgMaster 與 Platform owner release 及 Production readback 證明兩個 Free fixture 的 issuer／subject／principal／Employee 在 canonical producer 與 accounts adapter 中各恰一列、欄位完全一致且帳戶類型正確以前，禁止再次執行 authority switch。舊 `access_governance` view 是否包含 managed fixture不作為新流程通過條件。readback 未通過時維持 fail-closed，不以手工 SQL、operator bypass 或猜測映射繞過。

## 邊界與後續序列

只使用兩個核准的 Free-only disposable fixture；不修改其他 Employee、七個付費帳號、既有 binding 或 permission，不購買席次。完成真人 Google 互動後，依序重新讀回 source／image／Job binding、bridge → authority switch／replay → Platform／AI-PDM L4 → negative／rate／race／logout → observation／cleanup。跨專案彙總見 Platform [completion audit](../../../../Jenfu-Platform/ai-doc/reports/pm/DEV-014-015-057-118-121-completion-audit-2026-09-24.md)。

