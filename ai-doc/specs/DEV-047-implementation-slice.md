# DEV-047 實作切片紀錄：Managed Identity 員工編號

## 狀態

`RD Implementation In Progress`。本文件記錄本 worktree 已完成的實作與可重現證據；PostgreSQL disposable target 尚未提供，因此不宣稱 production migration 或 release 已完成，也不代表已取得 production release authority。

## 本次範圍

1. `JFS0001`～`JFS9999` 固定格式解析、正規化與 `jfs####@jenfu.com.tw` derived username；編號逐筆建立，變更後舊編號永久 tombstone。
2. OrgMaster managed identity registry：CAS revision、跨員工碰撞、append-only audit、candidate lease、principal reservation 與 recovery journal。
3. 員工明細的唯一公司登入身分區塊：顯示編號、derived username、`待連結`／`已啟用` 狀態；具權限者逐筆設定編號、以 read-only Directory candidate 完成 Cloud Identity 連結、排程刷新。
4. 本機與 PostgreSQL repository/API：
   - `GET /api/orgmaster/employees/:employeeId/managed-identity`
   - `PUT /api/orgmaster/employees/:employeeId/employee-number`
   - `POST /api/orgmaster/employees/:employeeId/managed-identity/candidate`
   - `POST /api/orgmaster/employees/:employeeId/managed-identity/confirm`
   - `POST /api/orgmaster/employees/:employeeId/managed-identity/refresh`
   - `POST /api/orgmaster/employees/:employeeId/activation-check`
5. Firebase Google popup first-login bridge：登入流程先解析 JFS alias，再以 verified Google identity 完成首次 bind；不提供 OrgMaster provider-write。
6. local deterministic Directory adapter 使用 `orgmaster.test`；production adapter 僅讀取 Google Admin Directory，固定 `admin.directory.user.readonly` scope、customer/domain/DWD subject 驗證與 rate/timeout handling。
7. local development admin profile 擁有 managed identity mutation 權限；production mutation 另外要求 active `human_privileged` admission。治理管理者在無 mutation 權限時僅可讀取。

## 明確不在本切片

- Google Admin 建立／刪除／升降級 Cloud Identity、license、password、MFA、session 與任何 provider write。
- PostgreSQL migration 的實際套用與 disposable PostgreSQL execution evidence（migration 檔已建立，尚未套用任何 production target）。
- 生產環境 feature flag、credential、部署或 release。

## 驗收命令

```text
npm run test:dev-047
npm exec -- tsc --noEmit
npm run build
npm run check:db-boundary
npm run qc:dev-047:contract
npm run qc:dev-047:browser
npm run qc:dev-047:postgres
```

## 2026-09-15 驗收證據

- `npm run test:dev-047`：4 個 test files、12 個 tests 全部通過。
- `npm run test:dev-004:auth`：4 個 test files、19 個 tests 全部通過。
- `npm run test:dev-009`：14 個 test files、72 個 tests 全部通過。
- `npm exec -- tsc --noEmit`：通過。
- `npm run build`：client/server production build 通過。
- `npm run check:db-boundary`：`DEV010_DB_RULESET_V1 PASS`；012 migration 為 forward-only 且只建立 `orgmaster_core`／`orgmaster_contract` 物件。
- `npm run qc:dev-047:contract`：`PASS`；migration header、required tables/routines、fixed scope、zero provider-write、normal Employee entry、canonical principal fixture 與 A17–A22 manifest 檢查通過。
- `npm run qc:dev-047:browser`：`PASS`；1440×900、1024×768、390×844 三個 viewport，managed section、無 legacy account CTA、無水平溢位，provider read/write counts 均為 0；臨時 server/browser/temp root 已清理。
- `npm run qc:dev-047:postgres`：`NOT_RUN`；未提供 `DEV047_POSTGRES_URL`，沒有把未執行誤報成通過。
- 本機 UI 可由 local admin 逐筆設定編號，顯示 derived username 與 `待連結`；確認連結後顯示 `已啟用`，治理管理者在無 mutation 權限時仍僅可讀取。

`npm test -- --testTimeout=30000`：140 個 test files 通過、1 個 skipped，541 個 tests 通過、1 個 skipped。Vite native config 與 React `act(...)` 僅輸出既有 warning，不影響 exit 0。

## 主要檔案

- `src/managedIdentity/employeeNumber.ts`
- `src/managedIdentity/types.ts`
- `server/orgmasterManagedIdentityStore.ts`
- `server/orgmasterManagedIdentityService.ts`
- `server/orgmasterManagedIdentityApi.ts`
- `server/orgmasterManagedDirectoryPort.ts`
- `server/orgmasterManagedIdentitySync.ts`
- `server/orgmasterManagedIdentityAuthBridge.ts`
- `server/orgmasterManagedIdentityRepository.ts`
- `src/components/EmployeeManagedIdentitySection.tsx`
- `src/components/DirectoryDetailPanel.tsx`

## 安全與邊界

local registry 只保存 Employee ID、JFS 編號、tombstone、managed identity reference、lease/outbox 與稽核欄位，不複製姓名、部門或職位。API 仍要求 server-verified identity；Node flag `ORGMASTER_MANAGED_IDENTITY_ENABLED` 與 DB admission authority 分離且預設關閉。Directory adapter 沒有 create/update/delete user 方法。既有 DEV-045 account-enrollment 程式保留作歷史 evidence，但正常員工明細不再 render invite/create/Email 操作。
