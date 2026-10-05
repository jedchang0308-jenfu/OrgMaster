# DEV-057 員工 Google 連結狀態與 candidate 錯誤矯正

日期：2026-10-05。Owner：ORGMASTER／DEV-057#identity-grants。來源：使用者正常 SSO 登入 OrgMaster 後，employee-shijie 明細仍顯示「待連結」，再次查詢 Google 主帳號失敗。本批沒有 AI-PDM／Platform 修改，沒有身分資料變更或新 migration。

## 正式訊號與因果界線

- provider readback：`orgmaster-prod-2e665c16ba0b`，source `5840bbc5b7195d33f7c0e3a998bbed3725a1626c`，image `sha256:d2e9f777d096952f75a867115927e889d9c35e052272d0bd6dc35b5e485acdb0`。
- SSO callback 303、`/api/auth/me` 200 在 2026-10-05 01:02:16–17Z 及 01:05:36–37Z；登入不是尚未完成。
- candidate POST 在 01:02:50.812006Z、01:03:01.542325Z、01:06:11.304393Z、01:10:06.992269Z 均 503，同 revision。最後 trace `b3c39bf701e912b0c44125e91988e43e`。歷史 request log 沒有 application cause，故不能把所有 503 定案為同一 DB exception。
- 使用者畫面已有 Google email 且顯示等待首次登入，對應 `directory_linked_pending_auth`。舊 UI 只有 `active` 算 linked，其他一律待連結且提供 link action。migration 013 的既有 lease 正確拒絕 employee 或 Directory key 已存在；service candidate 漏掉 mapStoreError，raw PostgreSQL conflict 被 API 包成 `MANAGED_IDENTITY_READ_FAILED / 503`。本機已重現這條確定的缺陷鏈，未宣稱取得歷史 live exception。
- managed registration 與 published Principal 不是同一狀態。修復不從 email／目前 session 推定待驗證 Directory row 的 pair，也不把 pending 改 active。

## 同批修正与驗收

1. pending 顯示已連結，conflict 顯示連結衝突；不再提示重做首次登入。已保存連結不顯示重複 CTA，包括 stale capability。
2. service capability 與 candidate precheck 僅接受 not_linked；已存 link 在 Directory RPC 前拒絕，不產生 candidate lease。
3. concurrent identity／revision／admission error 經原安全映射，identity conflict HTTP 409；真正 5xx 僅記錄安全 event／action／code。
4. 初次合法連結仍可取得 candidate；缺 permission 拒絕；原 confirm、同源、published privileged、CAS、session 與 DB fence 不變。

QA 入口：管理者正常 SSO → 員工明細 → 員工編號與登入身分。對既有 pending／active／conflict 驗證正確標示、無重複連結按鈕；對未連結的合成 fixture 驗證正常 candidate；並行衝突及無權限以服務／HTTP 測試驗證，不以 production 員工重綁建立 fixture。

## 驗證層級與交付狀態

- BEFORE：兩份聚焦 regression 8 FAIL／18 PASS，重現 UI pending/conflict 誤標、重複 capability 與三種 raw DB error 漏映射。
- AFTER：service／repository／UI 28 PASS；加入 HTTP 409 及 safe 5xx log 後 service／UI 28 PASS。證據：`output/dev057-managed-link-before.log`、`output/dev057-managed-link-after.log`、`output/dev057-managed-link-api.log`。均為本機合成測試，不冒充 real PostgreSQL 或 Production L4。
- 完整本機回歸：703 PASS／3 原有 SKIP（157 files PASS／2 原有 SKIP）；owner release Node 250 PASS，abort 6 PASS，TypeScript noEmit及DB boundary PASS。沒有新增 skip。證據：`output/dev057-managed-link-regression-full.log`、`output/dev057-managed-link-owner-tests.log`、`output/dev057-managed-link-abort.log`、`output/dev057-managed-link-types.log`。
- 本機完整建置因容量預檢 BLOCKED（無 lease／未執行）；既有 required Production Source QC的原生qc入口會執行相同full app tests、abort、boundary及npm build，採此CI出口，不減少必需檢查。
- Codex source review：檢查 UI＋capability＋service precheck＋concurrent DB error chain；未修改 pair／Employee／admission／role／schema，原限制保留。RD自測與同執行者review，不冒充獨立人工QC。
- required CI、PR、owner release、provider readback、正式 UI：尚在執行／未驗，不算 PASS。
- 保留原 dirty `ai-doc/qa/DEV-057-gcc-pbds-applicability-2026-10-01.json` raw SHA `b4c43cbc9c2a5c0fed27b59c8d43d5c7bd10fccbe4d28b3376200a27f7a319c3`，排除本批 PR。

回復沿現行 Principal-only RELEASED baseline；只發布 OrgMaster 新 application source，29 applied migrations 原樣，零新 DDL。不使用舊 UID 授權版本回復，不修改帳號、Employee、權限或 Principal 歸屬。

## 2026-10-05 已合併與候選安全中止 checkpoint

本節取代上方施工時「required CI、PR 尚在執行」的交付狀態；先前訊號及本機證據保留。現況為 **MERGED_NOT_PUBLISHED**，不得稱正式修復完成。

- PR [#104](https://github.com/jedchang0308-jenfu/OrgMaster/pull/104) 已合併。head `2f30b03256dcd61e8ec8501c9e47bf6b1363d321`；master merge `7ca9978d5c36b04ec38e48be9a36b3a84d9ae26a`。exact-head Codex review 已記錄，沒有獨立人工核准之主張。
- 必需 CI：PR run [37252900912](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/37252900912) 與 exact master run [37253024065](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/37253024065) 均 success，包括 full build。官方來源乾淨、正式分支保護及零 bypass 已核對。
- 新 candidate image `sha256:dc5a3ea1bad850e238a9a79aeb8f62bb4e7fe2c77ecdb575e73d14c0953dfcb4`；Cloud Build `bed224a1-6cdd-4066-9d11-bdfae39a52ed` success；29 applied migrations unchanged verified，沒有新 migration 或 live identity mutation。
- Owner run [37253271544](https://github.com/jedchang0308-jenfu/OrgMaster/actions/runs/37253271544)，release `ORGMASTER-REL-20261005015338254-7CA9978`，prepare/build/migrate/candidate/entrypoint 成功；verify 失敗，未 activate。smoke execution `97185d5a-2c67-466d-b785-5ec019233ca9` 在 Platform `platform_session` step 收到 HTTP 401 / `auth_token_invalid`；correlation `de657b53-345d-47cb-a7cf-8081f17e16cf`。尚未呼叫 OrgMaster authenticated probes，不能歸為本批 OrgMaster regression 失敗。
- 錯誤目前能證明 smoke token 被 Platform 拒絕，尚不能只靠該錯誤確定是 Firebase provider revocation 或 Platform Principal revokedBefore。舊重新驗證 receipt 的 authTime 為 `1791126425`；不要把重新 refresh 當成新的 interactive auth，也不降低 session 驗證。
- Native failure handler success；control FINALIZED / PRE_ACTIVATION_ABORTED。2026-10-05T02:05:32.033Z provider readback：原 revision `orgmaster-prod-2e665c16ba0b` 100%，無 candidate tag，generation 229。正式使用者仍看到舊畫面；不得要求重新綁定 Employee 作為修復。
- Sealed terminal `gs://jenfu-platform-prod-orgmaster-release/receipts/releases/ORGMASTER-REL-20261005015338254-7CA9978/e22216b7030da83722cead740576df2623127b517469b9073f4591f1c5c76cca/terminal.json`，SHA `ce4ac4939f818a7ea488d1892ef2f06665a455b3145fb6b0a3ac6e9e931a4628`，result PRE_ACTIVATION_ABORTED。
- 下一步：沿既有 own smoke reauth 8→9，使用者親自輸入原 smoke 密碼；驗證同一 provider pair / principal、更新原 owner Secret 與 GitHub secret、以受控 APP_INFRA_SMOKE_CREDENTIAL_ROTATION 更新 exact Workflow numeric version。產生新執行綁定，利用原生 sealed-abort continuation 解析正式 baseline 後發布；不原樣重跑舊 capsule，不繞過必需 smoke，不修改員工綁定、role、schema或授權資料。
- 正式修正 API / UI 及 Production L4 尚未驗證；候選安全中止 PASS 不等於功能 PASS。原有 dirty PBDS evidence 仍保存，不納入此 PR。

## smoke 版本9與已發布reuse鏈的續行修正

- 首次使用者提交native結果FAILED / FIREBASE_REQUEST_FAILED，沒有receipt且provider latest仍8；原raw原因不明，不宣稱密碼錯誤。該本機程序／埠及獨立Chrome已確認退出。第二次成功：2026-10-05T02:40:32.836Z原生reauth COMMITTED，same pair／Principal／Employee、AAL1，existing Secret 8→9及own GitHub secret；receipt `gs://jenfu-platform-prod-orgmaster-release/receipts/credential-reauth/2026-10-05T02-40-32.836Z-d2c2320b4d1fc6dd.json` SHA `9e9a10a2fa11cced2d4351fea8a9fba3e02d26c62c037f1c08d1d345a0a2b9d6`。安全operator觀測只記stage/http/whitelisted reason，密碼、token及request body均未寫檔。native source未修改；觀測器不改admission。
- 受控`APP_INFRA_SMOKE_CREDENTIAL_ROTATION` PASS：`gs://jenfu-platform-prod-orgmaster-release/receipts/releases/DEV057-SMOKE-REAUTH-20261005-R37/app-infra.json` SHA `2f721f707665db48f4fe9ecceb61e317c90d27be4338589dd5242e116b76a792`。只更新own exactWorkflow的numeric version9，保留完整75地址、其他fields及provider readback；不改application traffic／Employee／role／database。
- R38 source-freeze後infra-reuse以SMOKE_REUSE_SOURCE_INVALID停止，因新rotation與應用同source，不應選cross-source reuse。依新證據改用原生same-source `--smoke-rotation-ref`，R39 CLI check以SMOKE_ROTATION_INFRA_INVALID停止：目前RELEASED baseline為app-infra-reuse，原continuation僅接受舊原始infra的direct rotation。兩者均未產生新application dispatch；沒有原樣重試。
- 集中補齊：先驗原已RELEASED reuse所錨定的APPLIED rotation、credential和有限歷史chain，再驗新rotation相鄰numeric／serial／source／完整infra。另移除reuse validator硬編碼的numeric8，改為receipt-bound正整數、safe integer及exact provider一致性；native routine把既有infrastructure reader沿相同邊界傳遞，確保完整caller驗證可注入受控fixture。current baseline／control CAS與所有歷史receipt不變，無新migration或IAM。
- BEFORE：新增5案前的4案聚焦為3 FAIL／1 PASS，direct新rotation與後續source-only reuse缺口重現；tamper案的transport使用assertion拒絕，原reason匹配過窄，改保留拒絕／零provider read及原baseline不動的實質斷言。第一輪完整routine69/72 PASS，未冒充完成；infrastructure reader、歷史numeric8兩個缺口均依新增證據補齊，既有全部案例不新增skip。
- AFTER、protected PR、required CI及新owner release依下方實際證據續記；此段本身不算正式修正PASS。原共同Principal-only結案與PBDS dirty bytes保留。

## 續行候選的本機出口

- 另補驗新版本9的reuse正式發布後再source前進：BEFORE以`SMOKE_REUSE_CHAIN_ROTATION_DRIFT`重現同一歷史版本假設；不是正常登入或Principal授權失敗。證據`output/dev057-consecutive-fresh-before.log`。
- 同一批修正保留每個rotation era的原sealed source／credential／state及逐層RELEASED terminal；跨era只接受相鄰遞減numeric、strictly older serial及同lineage，並限制歷史descents。所有歷史只作apply-time proof，current RELEASED baseline／control CAS不換成歷史release。新增第三個相鄰版本8→9→10與跨兩個era的連續source reuse驗證。
- AFTER：完整`npm run test:dev-040:r2` **257/257 PASS，0 skip**；DB boundary及diff whitespace PASS。證據`output/dev057-fresh-rotation-owner-complete.log`。本批共新增7個回歸案例，包含CLI、原native owner prepare及異常拒絕；沒有删減既有案例。
- source review：同owner immutable byte hash/self seal、exact published intent與source lock、RELEASED terminal／previousRevision、完整75地址與16個COPY inputs、歷史apply-time TTL、今日operator live double read、native prepare權限邊界與current CAS均保留。未修改runtime登入／role／schema、舊identity branch或發布來源規則。這是同執行者Codex review，不宣稱獨立人工QC。
- 本節僅為本機修正出口；required CI、exact master來源、新owner release及正式行為readback仍須取得實際證據。

- PR105首輪required CI `37259004603`：runtime container、完整257 owner tests、catalog測試及boundary均PASS；QC固定子集合實際214/214 PASS，但入口仍要求舊207分母，故在app tests/build之前退出1。不是測試失敗，也未發布。依該精確log將原固定分母同步至214，保留固定完整分母／fail0要求，在同PR續修；不直接重跑原提交或跳過CI。證據`JENFU/output/dev-012/inputs/dev057-rotation-pr105-ci-failure.log`。
