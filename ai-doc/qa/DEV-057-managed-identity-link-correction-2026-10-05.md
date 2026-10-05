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
