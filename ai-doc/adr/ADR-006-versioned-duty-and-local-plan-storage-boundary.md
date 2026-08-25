# ADR-006：正式職掌隨組織版本保存（本機規劃草稿決策已撤銷）

狀態：Accepted / Amended  
日期：2026-08-18  
決策來源：DEV-028 Human Decision Brief `6A、13A、21A、42B–56A` 與 `RD Implementation Ready` 架構檢查  
適用範圍：DEV-028／DEV-029 第一階段的工作執掌版本、本機異常修復／責任配置草稿與批次套用

## Superseding Amendment（2026-08-21）

來源：`USER-2026-08-21-UNIFIED-SAVE-FLOW`

本節以 `Intentional replacement` 取代本文後續所有關於獨立 local plan、plan revision、600ms plan autosave、preview receipt、discard、跨檔 journal 與 atomic apply 的 Current Phase 決策；後續章節只保留為歷史決策脈絡，不得再作為目前實作依據。

- 樹狀圖、Duty CRUD、職掌矩陣拖放與異常修復全部直接透過 organization command 修改目前 `OrgDirectoryState`。
- 所有修改共用 `useOrgHistory` 的 Undo／Redo、同一 `isDirty`、500ms organization autosave、`Ctrl+S` 與 organization version revision CAS。
- `/duty-planning`、`/duty-planning/matrix`、`/duty-planning/anomalies` 不再建立或恢復規劃草稿，不顯示預覽、套用、捨棄、待套用或已規劃狀態。
- `/api/orgmaster/duty-plans/:versionId` 與其 client hook／mutation queue／server store 不再掛載。既有 `data/orgmaster-duty-plans.v1.json` 僅保留作為可回復歷史資料，不再讀寫，避免未經授權破壞資料。
- 一次完成的拖放、移動／複製選擇或異常修復是一個 organization history commit；反悔使用 Undo，不使用「捨棄草案」。
- 編輯能力只由 workspace mode／version status 決定，不再依 viewport 寬度降級為唯讀。

仍維持有效的 ADR 決策：正式 `Duty` 與 `DutyPositionRelation` 位於 organization V6、各版本獨立、同一 Duty 文字只有一份、version CAS 與既有權限邊界不變。

## Context

工作執掌名稱、說明與 Position 責任關係是組織設計的一部分。使用者已確認每個 organization version 各自保存，修改新版不能回寫舊版；同一 version 內一項 Duty 又必須是中央矩陣與各 Position 共用的單一資料。

尚未套用的異常修復或責任配置方案不是正式組織資料，但第一階段仍需要在同一台電腦、同一個 OrgMaster 本機工作區中跨頁面重新整理恢復。現有 repo 沒有可信登入 principal 或版本層 server authorization；使用者以 `56A` 明確將私人帳號隔離、登出／登入續接、真正跨裝置、lease 與接手移到 future phase。

現有架構已由 ADR-002 固定為 workspace manifest＋每 version 獨立完整 OrgDocumentFile，並由 ADR-005 固定 governance policy 使用獨立 store。DEV-028 需要在不破壞這兩個邊界下，決定正式 Duty 與本機未套用 plan 的權威位置。

## Options considered

1. 正式 Duty、relations 與 plan 全部加入 organization document。版本複製簡單，但任何 organization save、Undo、download 或比較都會攜帶未套用意圖，並讓草稿提前成為正式版本資料。
2. 正式 Duty 與 relations 加入下一版 OrgDocumentFile；未套用 plan 放在版本外的本機 workspace store，以 organization version ID 關聯。正式資料沿用 version lifecycle，plan 可獨立 autosave、discard 與 apply；代價是 batch apply 需協調 version 與 plan 兩個檔案及 crash recovery。
3. 採每位登入 principal 私有的 server-side plan store，加入版本 ACL、跨裝置同步與 active editor lease。可支援多人環境，但目前缺少可信 identity／authorization，且超出使用者指定的第一階段。
4. 直接導入 production database，把 organization versions、duties 與 plans 放在同一 transactional schema。長期可簡化跨資料交易，但目前 provider、IAM、hosting、credential 與 release target 未定，超出本機 OrgMaster 文件升級範圍。

## Decision

採 Option 2；Option 3 保留為 Future Phase，不作為第一階段依賴。

- 正式 Duty 與 DutyPositionRelation 進入 OrgDocumentFile V6 的 OrgDirectoryState，與 Employee、Department、Role、Position、Assignment、Member、Risk Rule 及 Layout 一起隨 organization version 完整保存。
- 同一 version 內 Duty 文字只有一份；Position 只透過 relation 引用，不保存文字副本。
- 建立 organization draft 時完整複製 Duty identity 與 relations；此後各 version 獨立。現階段 DEV-020 comparison 明確忽略 Duty 差異。
- 尚未套用的 batch plan 不進入 V6、workspace manifest、browser localStorage 或 governance store；使用獨立的本機 workspace plan store，以 organization version ID 作為唯一 active-plan key。
- Plan store 只保存未套用的異常修復／責任配置 intent、base organization revision、opaque plan revision 與 last-saved time；不保存 principal、lease、approval transaction、Employee 姓名、credential 或完整 organization copy。
- 同機多分頁／視窗不建立 lease。所有 save、preview、apply 與 discard 使用 plan revision CAS；先成功者為準，stale writer 收到 conflict 後必須 reload／reconcile，不得 last-write-wins。
- Batch apply 是本機 server-side 單一 logical transaction：workspace與plan共用同一root lock，驗證workspace mode／version status、plan／version revisions、receipt與projected state後，以prepared write-ahead journal保存兩檔before／after image及hash，固定roll-forward V6 version與plan-store after image，驗證完成後才刪journal並回success。
- Regular Duty CRUD、relation 編輯、Position invalidation 與有效 primary transfer 沿用 organization command／history 與 whole-document version CAS。
- `current-view`、`current-maintenance`、`draft-edit`、`compare` 與 version status 繼續決定目前 UI／server 是否接受編輯意圖；這不是登入驗證或安全授權，第一階段不得宣稱已提供帳號隔離或 ACL。
- Version 永久刪除目前不存在；未來若新增，必須在 version delete transaction 中 cascade 相關 local plan 與 in-flight apply records。

## Consequences

- OrgDocument schema 需 V5→V6 migration；舊文件只加入空 Duty 集合，不從 Role、Position、主管或既有文字猜測。
- Duty CRUD、Position delete 與 batch projector 能在完整 state 上驗證，Undo／redo 及 version switch 不需讀第二份正式資料。
- Downloaded organization copy／backup 包含正式 Duty 與 relations，但不包含未套用 local plan。
- 第一階段能在同一台電腦重新整理後恢復最後一次成功保存的 plan；不保證登出／登入後依帳號取回、跨裝置續接或不同使用者互相不可見。
- 同機多視窗以 CAS 防止靜默覆寫；不提供 active editor、唯讀接手或即時共同編輯語意。
- Apply 跨 organization file 與 local plan store，需要 idempotency 與 crash recovery；這是必要複雜度，不能退回逐列 PUT 或 last-write-wins。
- DEV-027 governance snapshot 保持最小欄位挑選；V6 Duty 不自動成為 permission 或 reviewer policy input。
- 第一階段不再被 identity／version ACL 阻擋，整體風險降為 Medium；未來要進入 shared／multi-user phase 時，仍須先建立可信 identity 與一致的 version authorization。

## Migration / compatibility impact

- Workspace manifest 仍為 V1；organization business version ID 不因 inner schema 升 V6 改變。
- V1–V5 organization files 經既有 migration 後補空 Duty 集合；legacy bytes 保留，合法 version 在下一次 save 才寫回 V6。
- DEV-020 比較器需明確忽略 Duty fields 並加 regression，避免「現階段不做職掌比較」被 schema 升級意外突破。
- DEV-027 snapshot builder 需維持 explicit field selection；不得 spread 整份 V6 state 進 governance policy version。
- Local plan store 不存在時視為empty且讀取不建立檔；第一次成功plan save才lazy-create V1，不匯入browser draft、organization data或governance data。
- 若 future phase 要加入每人私有 plan、登出／登入續接、跨裝置、lease／takeover 或真正版本 ACL，必須先固定可信 principal、server authorization、ownership migration 與既有 local plan 的採用／捨棄策略，再 supersede 本 ADR。

## DEV-029 Amendment（2026-08-19）

- DEV-029 不改變本 ADR 的資料權威：正式結果仍寫入 organization V6；未套用的 anomaly repair 與 active relation move／copy 都留在同一份 version-scoped local plan。
- Plan record 由 schema V1 擴充為可同時保存 repair intent 與 relation placement intent 的 V2；合法 V1 plan 必須無損讀取並在下一次成功保存時延遲升級，不建立第二個 store。
- Implementation Ready決定維持外層`DutyPlanStoreV1.version = 1`及原檔名；外層`plans`可保存record V1或V2。Reader保留各record原schema，只在API讀取目標plan時memory-normalize為V2；save只升級該organization version的record，不能連帶改寫其他version的V1 plan。
- `/duty-planning`、`/matrix` 與 `/anomalies` 三個 surface 共用同一 plan lifecycle、revision與apply transaction；route或panel切換不改變plan ownership。
- `1024–1279 CSS px` 的panel展開偏好可以保存於browser presentation preference，但只能包含feature-scoped boolean，不得包含Duty、relation、plan、version或principal資料；這不取代workspace-side plan store。
- CAS、receipt、idempotency、journal roll-forward與Future Phase identity／ACL re-entry均維持原決策。
