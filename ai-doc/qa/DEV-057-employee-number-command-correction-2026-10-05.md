# DEV-057：DEV-014 員工編號命令有效義務收尾

來源：`JENFU/DEV-014/QA-014-05、06、18`，承接 `ORGMASTER/DEV-057#employee-number-command`；沒有新增主任務，也不擴大到 AIPDM/DEV-122 一般功能。現行架構在 [current contract](../specs/DEV-057-identity-and-grant-contract-boundary.md#dev-014-有效義務收尾員工編號命令)。原 DEV-014 20／LOGIN 六案的歷史結果保持不變，本批只補其中仍有效的要求。

## 當前交付層級

**LOCAL_FIX / TASK_OWNED_POSTGRES_PASS；未合併、未發布、正式行為未驗。** 後續按本節追加 protected source、required CI、owner terminal、provider readback 與正常員工明細證據；本機 PASS 不能代替 Production PASS。

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
- owner package 的 22-file Node 回歸 264／264、fail／skip 皆 0；原 QC 的 19-file selection 為其中 221 案，另外三份測例為 5＋11＋27。QC 保留既有完整 application tests／build 與退出條件，待 required CI 執行；沒有以 Node 結果宣稱完整 CI 或正式發布通過。

## 發布與回復

R40 `orgmaster-prod-367d239442e2` 為本批 Principal-only serving／traffic rollback baseline。新來源須先經 protected master、Codex QC、required CI，再同 source immutable runner rotation、native 29→30 release、candidate number reads/denials、正式 details。不要重綁正式員工、變更 provider pair 或自動啟用帳號作測試 setup。

回復僅可回 Principal-only source；030 與既有 receipt 不 down migrate、不重寫。若回到 R40，須如實記錄 number command 新功能退回舊版本，不能宣稱仍有 v2 receipts。正常 principal session／角色與 scope 的既有整合結案不撤回；新缺陷交付與原共同邊界完成度分開。
