# DEV-057：DEV-014 員工編號命令有效義務收尾

來源：`JENFU/DEV-014/QA-014-05、06、18、19`，承接 `ORGMASTER/DEV-057#employee-number-command`；沒有新增主任務，也不擴大到 AIPDM/DEV-122 一般功能。現行架構在 [current contract](../specs/DEV-057-identity-and-grant-contract-boundary.md#dev-014-有效義務收尾員工編號命令)。原 DEV-014 20／LOGIN 六案的歷史結果保持不變，本批只補其中仍有效的要求。

## 發布前交付狀態（歷史）

發布前，本文件曾記錄 **LOCAL_FIX / TASK_OWNED_POSTGRES_PASS；未合併、未發布、正式行為未驗**。這是當時的本機快照，現由下方 2026-10-05 原生 owner release 與正式功能探測更新；下方原始 LOCAL evidence 與其驗證限制仍保留，不得用 LOCAL 結果替代 Production 證據。

## 共同根因與修正

1. 編號 UI／API 的可用性誤用 DWD `managedLoginEnabled`。新增由實際 service 決定的 `employeeNumberManagementEnabled`；原 `managedIdentityEnabled` 的 Employee activation-check 語義保留。Directory 不可用時，number permission 與 Principal admission 仍各自判斷，link／refresh 不提供假可用入口；直接 refresh caller 也在權限檢查後拒絕缺 port。
2. 正常 PUT 傳入 command ID，但舊 service 丟棄 ID，v1 寫入沒有 durable receipt。正常 caller 改用 `assign_employee_number_v2`，只接受已驗證 Principal，對 actor／target／正規化 number／原 workspace 與 registry CAS 綁定 fingerprint。同 ID 相同請求回原 receipt；改 payload 拒絕。新 noop command 有 receipt、沒有假稽核變更。
3. number write 使用現有治理 transaction 與 final session／epoch fence；receipt、assignment、tombstone、audit 同一 DB transaction。獲取既有 admission→persistence 鎖後重新讀有效角色，replay 也不跳過當下授權。
4. forward-only 030 只新增 OrgMaster-owned function；001–029 不改寫。controlled owner release 必須在任何 ledger 初始化／DDL 前確認現有 ledger 恰 29 或 30 並核對原 prefix；29 只追加030，30只重播。更新 executable runner 後按既有 image rotation，不重用舊 runner digest。既有普通 release 仍 zero-DDL。
5. DWD 啟用時，runtime parser 拒絕非空的 credential-file 設定；ADC client 若為 JWT／service-account key，在任何 token／signJwt／Directory HTTP 使用前拒絕並回既有 `DIRECTORY_DELEGATION_INVALID`。Compute metadata 與 UserRefresh keyless client 保留；這是來源防護修正，不代表正式環境曾使用 key。

## 已取得的證據

- [原始 PostgreSQL manifest](evidence/DEV014-NUMBER-COMMAND-20261005/postgres-manifest.json)，SHA256 `b0836883093eaae6398fbd0e68d821fba023bee439aaa12f449f16086d1c7080`。PG 18.4、task-owned cluster，D57-01／10 migration invariant 與 NUM-01～10 實際執行 PASS；未寫 primary data。source `c65dd31` 加 manifest 明載的未提交候選修正；不是 clean released source。
- NUM-01～05：assignment／canonical actor／receipt／audit、原 CAS 重送、ID payload 衝突、失效 CAS、invalid number、correction／tombstone、禁止重用、noop receipt。
- NUM-06～07：兩個真實 DB clients 的相同 command convergence 與唯一 number race，證明 one winner／one receipt／one audit。
- NUM-08～09：在 disposable DB 的 audit／receipt insert 注入失敗，整筆 number／tombstone／receipt／audit 回滾。
- NUM-10：sibling runtime execute 與直接 table DML 拒絕；Employee workspace 與 provider identity records 原樣保留。
- 五項 runtime cleanup 均 true：clients、auxiliary clients、cluster、port、temporary root；governor 自有 process registration 與 lease 已釋放。
- service orchestration／UI capability／native release tests分別留存其實際輸出；mock fence 只證 caller 協調，不冒充 PostgreSQL session／epoch 原子性。既有 shared fence 的真 PG 撤權證據沿原 DEV-057 D57-22，未修改其鎖與 session 語義。
- 最終聚焦 service／store 45／45、DirectoryPort 9／9 與 TypeScript 檢查通過。Directory 測試使用合成 ADC clients，證明拒絕 key 的路徑沒有取得 token 或 HTTP；不替代 QA014-14／15 的真 provider 證據。
- 發布前 owner package 的 22-file Node 回歸為 264／264、fail／skip 皆 0；原 QC 的 19-file selection 為其中 221 案，另外三份測例為 5＋11＋27。QC 保留完整 application tests／build 與退出條件。這些數字是發布前本機回歸證據，僅證明所列 Node 測例，不單獨宣稱 required CI、正式功能或 L4 通過；後續 owner release 與正式探測見下節。

## 原生 owner release 與正式功能探測（2026-10-05）

- PR #106 已合併至 source revision `9e3473cf096fce4e420df29d49143675bb568023`。OrgMaster owner-release run `37276140867` 的正式收據結果為 `RELEASED`；release ID `ORGMASTER-REL-20261005070500819-9E3473C`，migration disposition `FORWARD_APPLIED`。Production service generation `237` 的 effective revision 為 `orgmaster-prod-8edb9dffe61f`，流量為 100%，tag 數為 0；收據列出 `remainingHumanAction: 0`（僅該 owner release 收據欄位）。
- Terminal receipt：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20261005070500819-9E3473C/e5ad4640309ea40ef8d34c573f93bdf68e2fe4d78b7e77d2e24b6ef04232b642/terminal.json`，SHA-256 `7859f95d6c88b0ecb06a5ca3829e078e8ee4677e55b19b689e697ea134903c83`。Migration receipt：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20261005070500819-9E3473C/e5ad4640309ea40ef8d34c573f93bdf68e2fe4d78b7e77d2e24b6ef04232b642/migrate.json`，SHA-256 `db330f470c299efbad1cfc96d49f5039954d47e051b8e21c46d72453ac69c0fe`。
- 對應 Platform output readbacks：`dev014-number-release-readback-20261005.json` SHA-256 `bd1648e5f417f2b5577030b9abe069900da936b9527df1320908f9ad2da45774`；`dev014-number-native-migration-20261005.json` SHA-256 `db330f470c299efbad1cfc96d49f5039954d47e051b8e21c46d72453ac69c0fe`；`dev014-number-functional-probe-20261005.json` SHA-256 `034f020e8de5b37bf4a892013787c3b5a9a02ef7b0b6b42af228c987267086e6`。三檔位於 Platform repo `output/dev-012/inputs/`；它們是此段狀態依據，沒有搬動或改寫。
- `jenfu_prod` 的 `orgmaster_core.schema_migrations` ledger 為 30 筆：本次套用 1 筆、驗證重播 29 筆，migration boundary 為 PASS；`jenfu_dev` 與 `jenfu_stg` cross-database denial 均為 denied。原 001–029 prefix 保持不變，受控模式只新增 030。
- 後續 production functional probe 在同一 source revision、同一 effective revision 與 release ID 上為 `PASS`。Platform Principal session 為 200，OrgMaster SSO start／authorize／callback 各為 303，session reload 與 number capability 為 200。Number no-op／精確 replay 為 200，變更同 command payload 為 409，未認證為 401，缺 Origin／CSRF probe 為 403。
- Probe 未改 Employee binding、既有 number 或 provider pair，也未增加 Employee audit；no-op command receipt 有寫入。JENFU-owned probe session logout 為 200、logout 後 `/me` 為 401；OrgMaster probe native session 已撤銷，user-owned sessions 未變，且未擷取 credential material。
- 歷史 07:28Z／07:34Z 快照中的 Production 瀏覽器 UI 尚未驗證：release readback 與後續 functional probe 的 `browserUiVerified` 均為 `false`。Release readback 是 07:28Z 的階段快照，當時 functional probe 尚未執行；07:34Z 的 probe 雖 PASS，仍不含正常員工明細的瀏覽器畫面證據。故本節只記錄 owner release 與 API／session probe，不宣稱 QA014-05／06／18／19 全數結案或 DEV-014 完整 Production L4。

## 發布與回復

先前等待 protected source、required CI、owner terminal、provider readback 與正常員工明細證據的續點已更新：PR #106 與 run `37276140867` 完成本次原生 owner release，migration receipt 及正式 API／session probe 見上節。R40 `orgmaster-prod-367d239442e2` 仍是記錄中的回復 baseline；若回復至 R40，必須如實記錄 employee-number command v2 回到舊版本，且不 down migrate、不重寫 030 或既有 receipt。原 release/API 收據本身不涵蓋瀏覽器 UI；後續限定 UI 證據見下節。DEV-014 的其他義務及完整 L4 狀態仍依各自證據判定。

## 正常員工明細補驗與 Directory 唯讀證據邊界（2026-10-05）

- 同一正式 source `9e3473cf096fce4e420df29d49143675bb568023`／revision `orgmaster-prod-8edb9dffe61f` 已補驗正常 Platform Principal SSO → OrgMaster 員工 → 張仕杰 → 登入身分明細；顯示已連結、JFS0005，沒有錯誤的首次登入／重綁／candidate 控制。1440／1024／390 viewport 無水平溢出，page／console error 為 0，Employee／binding／number mutation 為 0。兩個自有 probe sessions 已 local logout，後續 `/me` 為 401，臨時 browser/process/ports 已收束。
- 原始 masked UI receipt `JENFU/output/playwright/dev014-number-ui-masked-20261005092048-3ecc1e-evidence.json` SHA-256 `1ceeddf410771036a94ea6cce74e23bd658e022112c1aa8f8a5050108f847ca0`；受控投影在 JENFU PR #94 merge `e9f7033621d8bbd20b35edcd565ade8f03ce2a35` 的 `ai-doc/qa/evidence/DEV014-REMAINING-DELIVERY-20261005/orgmaster-number-rendered-ui-masked-projection.json`，SHA-256 `0f6ffa8bf77077950c03da459a772116b0b9eccef0c53299b6416b12e2a34809`。畫面只引用遮罩後明細；舊投影與原始歷史不改写。
- QA014-19 為 saved-link／一般明細部分 Production PASS；pending/conflict、鍵盤與 ARIA 仍待補驗。QA014-18 正向 UI save 及 DWD-off 的正式證據仍 NOT_VERIFIED；same-value Save disabled 不代表正向 save。編號更正會永久 tombstone 舊值，不以改正式員工編號或強制 DOM 控制作測試。

新增 source-owned `scripts/dev014-directory-readback-canary.mjs`、26 案內建 Node 測試及 `scripts/dev014-directory-readback.Dockerfile`，用於剩餘 QA014-14／15 的實際 provider 只讀補證。此批不部署 application、不修改 migration 或角色／Employee；不混入同期 role-catalog 修正。

執行邊界：image 來源必須是 required CI／Codex review 已通過的 protected master exact merge；Dockerfile 重用已讀回的 immutable OrgMaster runtime base。source revision、operation ID、最長八小時 expiry 為執行綁定，image ENV 與 CLI source 必須相符。臨時 Job 只掛既有 `orgmaster-prod-runtime` identity，metadata 必須吻合 project number `9536592944` 與該 identity。以既有 `orgmaster-prod-directory-dwd` signer、固定 delegated subject `jedchang0308@jenfu.com.tw` 和唯一 `admin.directory.user.readonly` scope，完成 keyless signJwt／OAuth exchange／單次固定 users.get；customer `C015t4buc`、domain、primary email、active 狀態只作 provider claim 核對，不作 Principal mapping fallback。禁止 credential aliases／key file，無 SQL、Cloud SQL proxy、Secret 讀取或 Employee mutation；不得使用會建立 candidate/link 的舊 operator 替代。

每階段五秒 deadline 包含 response body，設大小上限，redirect 拒絕；錯誤只回 phase／HTTP status／retry class，token、JWT、user ID、email、etag、provider error body 不輸出或保存。僅在記錄 build/image/source、實際 runtime fingerprint、safe receipt 與 Job terminal 後刪除自有 Job。26/26 synthetic tests 只證這些 guard；正式 users.get 尚未執行，不得提前記 PASS。即使此 canary PASS，也只證現行 runtime identity 下的 keyless provider read，不替代 app caller 的 identity lifecycle、背景撤銷或完整 DEV-014 L4。
