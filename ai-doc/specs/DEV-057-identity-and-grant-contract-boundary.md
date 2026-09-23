# DEV-057：身分與權限發布契約邊界

- 狀態：`Producer RD Complete / Local QA-QC Passed / Consumer Integration Pending / Production release／L4 NOT_RUN`
- 日期：2026-09-23
- Native owner：`ORGMASTER/DEV-057#identity-grants`
- 來源：`JENFU/DEV-015#identity-grants`；同群目標任務 `AIPDM/DEV-121#target-authorization`
- 主責決策：`JENFU/DEV-015` 的 ADR-005；跨 repo 文件以固定 Project Key 與 native DEV 追溯，不依賴工作樹相對路徑。
- Spec Impact：與 [DEV-055](DEV-055-current-projection-contract.md)、[DEV-056](DEV-056-orgmaster-system-permission-catalog-sync.md) 的目前 producer 行為為 `Compatible exception`；保留 v1 欄位／ACL，但以 forward-only migration 修正 active-principal legacy 分支的 OrgMaster-role 依賴、AI-PDM Portal visibility 對 `orgmaster_authority` 的錯誤依賴，並補足 managed bind／legacy governance publish 共用的資料庫 writer fence 與永久 pair reservation。已套用 013／014／020 保持不變；producer contract 與 release profile 同步更新。

## 目標與 owner 邊界

OrgMaster 是 active employee／principal、AI-PDM 授權來源與 published grants 的 producer。此 DEV 只定義 producer 可對外保證的唯一性、一致性與版本語意；不把 AI-PDM role catalog、route policy 或 Platform SSO broker 移入 OrgMaster，也不讓 consumer 讀 `orgmaster_core`。

現有 `orgmaster_contract.v_active_principal_mappings_v1`、`v_orgmaster_session_principals_v1`、`v_ai_pdm_entitlement_authority_v1`、`v_ai_pdm_effective_role_assignments_v1`、`v_portal_app_visibility_v1` 為起點。DEV-055／056 及 migrations 001–020 的既有實作／驗證保持原狀；修正只能追加 migration 021，不修改已套用 migration 或重寫歷史 evidence。

| Producer projection | 它回答的問題 | 不可代替 |
| --- | --- | --- |
| `v_active_principal_mappings_v1` | issuer＋subject 是否唯一連到 active employee；**不要求任何 app role**。Platform 與 AI-PDM 的身分 admission 使用它。 | OrgMaster session、Portal visibility、AI-PDM permission。 |
| `v_orgmaster_session_principals_v1` | active mapping 之上是否另有有效 OrgMaster app／global role；OrgMaster callback 使用它。 | 其他目標的身分或權限。 |
| `v_portal_app_visibility_v1` | 已發布、有效且匹配 active principal 的某 app **入口指派**是否讓 Portal 啟動；對 AI-PDM 不以 `authority_source` 分流。 | 目標業務 route allow；local ACL 不能自行產生入口。 |
| AI-PDM authority／effective-grant views | 目標的來源與 OrgMaster published grants。 | AI-PDM local resource／role／route policy。 |

## 契約不變條件

1. 對一個 `(issuer, subject)`，接受的 active principal 解析結果必須**恰為一筆**；零表示未獲 admission，超過一筆是契約歧義並拒絕。現有 v1 view 以 `UNION ALL` 暴露 legacy 與 managed 來源；producer 不得用 `DISTINCT`、`LIMIT 1` 或來源優先序藏掉衝突。所有可建立或發布該 pair 的 writer 必須先取得同一 `managed_identity_admission_authority` singleton row lock；legacy governance writer 在 lock 內檢查並寫入 append-only `principal_identity_reservations`，managed bind／verify 在同一 lock 內檢查該 reservation。consumer 仍以零筆／多筆 fail closed。
2. AI-PDM 的 `(employee, application)` authority 必須恰為一個有效來源，且每筆 effective grant 的 `authorityVersion`、employee、application、principal 與 authority row 一致。`legacy_authority` 不得與 `orgmaster_authority` 合併或在 producer 故障時自動回退。
3. `mappingVersion` 是身分映射版本；`authorityVersion` 是應用授權來源版本；assignment／catalog 另有其版本。任何版本只在同一 authority＋object＋scope 比較，不提供跨域相等承諾。
4. 既有 v1 views 是定案 producer contract：`v_active_principal_mappings_v1` 保留衝突列；`v_ai_pdm_entitlement_authority_v1` 發布 `(application_id, employee_id)` 的唯一有效來源及版本；`v_ai_pdm_effective_role_assignments_v1` 僅在 `orgmaster_authority` 時發布 grants，且其列攜帶同一 `authority_version`。consumer 用同一短暫 PostgreSQL `REPEATABLE READ READ ONLY` transaction 分次讀這些 view，所有讀取在同一資料快照；OrgMaster 寫入側的 authority mutation 與 outbox 必須原子 commit。producer 不提供跨域版本相等、業務 route policy 或讀 `orgmaster_core` 的例外。
5. DEV-037 定義手動 workspace 指派 key `current`；現行 v3 producer 在 migration 020 直接發布 assignment `scope.value`，而 position-adoption source 條件要求 `company-jenfu`。兩者都是目前 producer 的有效來源語意，不能宣稱只有一個 key。OrgMaster 只發布 canonical grant，不替 AI-PDM 判定本地公司或資源歸屬；目標端先以可信 server-side membership／resource read 約束資料，再用 owner 明列的 company＋source-key 映射。若實際已發布 grant key 未被 consumer contract 覆蓋，owner 先讀回治理版本與投影並釐清，不讓 consumer 猜測或把 URL 參數當 project grant。
6. Portal AI-PDM visibility 是**入口指派**，不是 AI-PDM business entitlement。有效治理版本中的 AI-PDM 直接指派或有效委派，須沿用現行 effective-grant view 的 position 來源、catalog role／scope、subject type、app／role 狀態與時間判定，匹配 active employee／principal；唯獨不以 `authority_source` 篩掉 legacy 使用者。不能改為直接掃未驗證的 raw assignment JSON。`assignment_version` 仍取該 active governance `publishedVersions.versionNumber`，使 Platform code 發行／兌換只比較同一 app 的入口版本。若只有 AI-PDM local ACL、沒有 OrgMaster 已發布入口指派，Portal 不顯示；若只有入口指派、沒有目標權限，AI-PDM API 拒絕。OrgMaster 自身入口仍由自己的 app-specific role 判斷。

## RD 範圍與停止條件

- 架構審查已確認 migration 013 的 active-principal view 以 `UNION ALL` 保留兩來源列，但 legacy 候選仍額外要求 OrgMaster global role；migration 014 已另有 OrgMaster app-scoped session view；migration 020 的 effective-grant view 依 authority view 篩出 OrgMaster 權威，而 Portal AI-PDM visibility 又只從該 effective view 讀取，使 `legacy_authority` 使用者缺入口。另發現 current bind／verify 會鎖 `managed_identity_admission_authority`，但現行 `write_active_persistence_artifacts_with_identity_fence_v1` 只經 base writer 鎖 `persistence_authority`，沒有共同 fence；DEV-047 A9a 的原始要求未由目前組合實作維持。沿用 v1 欄位／ACL，以 migration 021 一次修正兩個 view 與 writer fence，不新增 v2 producer view。
- RD 實作時以 current source、view definition、writer、ACL 及 consumer manifest 建立固定 contract vectors；重現 legacy＋managed 競爭、員工停用／重新連結、governance publish、authority switch、outbox 未消費及 grant 有效期邊界。分別判定正確零筆、歧義及 producer 不可用，不能把後兩者當作未指派。
- Shared writer 必須採固定鎖順序：先鎖 `managed_identity_admission_authority(singleton=true)`，再呼叫會鎖 `persistence_authority` 的 owner writer；在同一 transaction 驗證 active governance version、拒絕重複 pair／reservation owner 漂移／managed pair 重疊，並為已發布 legacy identity pair 寫入 reservation。migration 套用前也以相同順序鎖兩列並做候選 projection preflight；既有資料有歧義即 rollback。
- role-neutral v1 是有意的身分接受範圍擴充；啟用前稽核 consumer manifest／code，若任何 consumer 把 active mapping 當作 OrgMaster app-role 證明，先修該 consumer或制定新版契約，不得直接開放其 app session。OrgMaster `v_orgmaster_session_principals_v1` 必須仍要求 OrgMaster app role。contract 欄位與 ACL 不變，因此既有 v1 schema manifest hash 保持；語意變更與 compatibility evidence 記錄於此 DEV。
- 任何 sibling core、共享登入資料庫 writer、新 IAM／Secret、正式資料修改或 Cloud Run 變更均不屬本機 RD／QC；Production release／L4 另依 owner gate 與明確授權執行。

## 驗收規劃

`O01` role-neutral active principal、AI-PDM-only admission及 OrgMaster session隔離；`O02` managed bind／legacy publish雙向競態與永久pair reservation；`O03` 同版authority＋grants；`O04` switch／revoke race；`O05` consumer僅讀明列版本化contract；`O06` v1欄位／ACL與雙版SSO parser回復；`O07` authority-independent Portal入口、委派、assignment version及scope mapping。2026-09-23 producer QC結果：`O01 PASS`（D57-01／02）；`O02 PASS`（D57-05／06）；`O03 PASS`（D57-03）；`O04 NOT_RUN`；`O05 NOT_RUN`；`O06 PARTIAL`（producer三個view的欄位／owner／ACL前後相同，OrgMaster session仍以app role隔離；跨repo v1／v2 parser recovery尚未跑）；`O07 PARTIAL`（直接／委派入口、assignment version及visibility不替代target allow已通過D57-02～04；AI-PDM company/resource mapping、`current`／`company-jenfu`完整normal-entry驗收待AIPDM/DEV-121）。證據為Platform工作樹 `.task-dev014/orgmaster/dev057-postgres-qc-r2.json`，task-owned PostgreSQL 18.4、6／6 checks、cleanup全PASS、Production writes=false。

## Architecture Closure Review：owner 可直接執行的邊界

審查基線 HEAD `c8a2e42e211be16142d9c60c3abc866361237003`（工作樹已有其他未提交文件，不是 release source lock）。原始 migration 013 的 shared active-principal view 把 OrgMaster-role 條件放入 legacy 身分分支；migration 014 另有 OrgMaster 專用 session admission；migration 020 的 Portal AI-PDM visibility 又只從 OrgMaster effective grants 生成。migration 021 已修正這三項 owner 邊界；D57-06 已在隔離 PostgreSQL 對 bind-first 與 publish-first 兩種順序實測鎖等待及衝突拒絕，不形成雙 mapping。

| 實作入口（repo-relative） | 本 DEV 固定工作 |
| --- | --- |
| `server/orgmasterSsoHandoff.ts`、`server/orgmasterSsoHandoff.test.ts`、`contracts/jenfu-sso-handoff/v2/` | target-first v1／v2 精確 parser。v1 assignmentVersion 僅驗格式，不與 mappingVersion 比；v2 無 `authorization`。保留 exact issuer／audience、source expiry、epoch、一次性 code 與 local session 上限。 |
| `server/orgmasterManagedIdentityRepository.ts`、`server/orgmasterManagedIdentityStore.ts`、`server/orgmasterPrincipalAdmissionRepository.ts`、`server/orgmasterPersistenceRepository.ts` 及既有 tests；migration 013／017 **唯讀參照** | managed bind／verify 與 legacy governance publish 共鎖 `managed_identity_admission_authority` singleton row；publisher 對 active proposed `identityLinks` 驗證 duplicate／managed collision／reservation owner，並原子新增 legacy reservations。任一順序的併發測試都不得提交雙 mapping。 |
| `server/applicationRoleAssignmentStore.ts`、`server/employeeAuthoritySwitchStore.ts`、相關 tests；`db/migrations/013_dev049_existing_google_primary_account_link.sql`、`014_dev050_orgmaster_session_admission.sql`、`020_dev014_current_projection_contract.sql` **只讀參照** | 驗 authority switch 的 CAS、row／outbox 同 commit、發佈後 grant 與 authorityVersion 同版；已套用 migrations 不可修改。 |
| `db/migrations/021_dev057_identity_grant_writer_fence.sql`、`scripts/lib/dev040-routine-release.mjs`、`config/release/dev040-orgmaster-independent-production-v3.json`、contract／PostgreSQL tests | 同一 forward-only migration 更新 producer writer fence與兩個 v1 view：active-principal legacy 分支移除 OrgMaster-role `EXISTS`；Portal AI-PDM visibility 從與 effective-grant 同等的有效 published 直接／委派 app 指派投影，移除 authority join。保留 active employee、link／assignment 有效期、lifecycle barrier、position／catalog／subject／scope、governance `versionNumber`→`assignment_version`、輸出欄位、`UNION ALL`、owner／SELECT ACL。更新完整 migration bundle 與 source-bound owner release gate；不改 OrgMaster 專用 session view 或其他 app 資料。 |

### Producer 修正的進入與停止條件

在 task-owned PostgreSQL 套用歷史 001–020 後，migration 021 先用固定鎖順序鎖 admission／persistence authority，再以**修正後候選投影**檢查每個 `(issuer, subject)` 的 active row count、principal／employee 對應與 legacy＋managed 交集；若既有 pair 歧義即 rollback。此後 managed bind／verify 與 governance publish 共用 admission row lock，publisher 在該 lock 內驗證 proposed active version、重複 pair、managed reservation 與 owner 漂移，再與治理 artifact 同 transaction 寫入 append-only reservations。競態 fixture 要雙向測試：先 bind 後 publish、先 publish 後 bind，各自最多一方成功且無中間雙列。

Portal visibility 的 AI-PDM 分支須從 active governance 的直接／有效委派、position 與 catalog-valid app 指派取有效入口，join active principal，遵守 employee／principal subject、有效期及 allowed scope；`authority_source` 不是入口條件，也不得直接從 local ACL 造入口。`assignment_version` 與同一 governance versionNumber 綁定，不能取 authorityVersion 或 mappingVersion。成功後讀回兩 view definition、欄位／ACL、OrgMaster session view 與 AI-PDM authority，證明 AI-PDM-only 角色不被 OrgMaster session 接受、legacy／OrgMaster 兩種 authority 有相同入口判定、無指派者不可見、target deny 不因 Portal 可見而被跳過。另讀回 scope key，確保 consumer 的 owner mapping 涵蓋有效發布值；未知值由 owner 處理 contract/data drift，不放寬為任意 scope。正式 Production migration 僅能經 owner-native bundle／manifest 與當時適用 authorization；未知 outcome 先讀 ledger／view 再判 replay，不做 down migration或人工 SQL。

精確不變條件：producer 對 `(issuer, subject)` 的 active mapping 正常結果恰一筆；`UNION ALL` 保留所有衝突列，consumer 使用上限兩筆查詢並將零筆、歧義、查詢失敗分開。`(employee, ai-pdm)` authority 必須恰一個；grant 只在 `orgmaster_authority` 有效，所有有效列的 employee／application／principal／authorityVersion 與同快照 authority row 一致。切換寫入及 outbox 同一 DB commit，未知結果以 durable operation receipt readback 再決定 replay；不得改成分次提交或在 outbox 未消費時回退舊權威。consumer 的唯讀 transaction 保護跨 view 的讀取一致性，不能補救 producer 自身分次 commit。

本輪已在 task-owned PostgreSQL 18.4 執行 migration 001–021及 synthetic fixtures：D57-01前置歧義拒絕、D57-02 role-neutral mapping／OrgMaster session deny／Portal入口與v1 surface相容、D57-03 authority 4與grant同版、D57-04 delegated recipient可見但沒有target grant、D57-05 historical pair reassignment與duplicate pair拒絕、D57-06雙向writer競態。證據manifest為 `C:\VIBE CODING\Jenfu-Platform\.task-dev014\orgmaster\dev057-postgres-qc-r2.json`；6／6 PASS、cleanup五項全true、`productionWrites=false`。另外 contract QC、DB boundary與57個 owner-release／migration tests PASS。未涵蓋O04 authority switch/revoke race、O05跨consumer ACL/read audit、O06跨repo parser rollback及O07 consumer scope mapping/browser；由AIPDM/DEV-121與JENFU/DEV-015剩餘整合驗收承接。Production build／release與L4目前不在本機 RD/QC 階段。

## 2026-09-24 local recheck

在同一 task-owned PostgreSQL 18.4 runner 重新執行 `npm run qc:dev-057:postgres`：D57-01～D57-06 全部 PASS，`executedCaseCount=6`，client／auxiliary clients 已關閉、cluster 已停止、port 已釋放、temporary root 已移除，`productionWrites=false`。同步執行 `npm run qc:dev-057:contract`，migration 021 source／applied hashes、schema owner、forward-only 與無人工 GRANT／REVOKE 檢查 PASS。這是 producer local recheck，不升格為 consumer browser、Production release 或 L4 evidence；O04～O07 仍由跨 owner 驗收承接。
