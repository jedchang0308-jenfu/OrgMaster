# OrgMaster 分支部署前驗證紀錄 — 2026-10-07

## 範圍與基準

- 專案：OrgMaster
- 分支：`持續優化`
- 驗證基準：`88248e5b3a06835c14f02efce34ebee5b3924e11` 加本輪工作樹；browser report保存八份實際source SHA-256。Git提交後需維持相同產品source內容。
- 變更範圍：DEV-037 Governance published version 展示、DEV-039 viewport fit、DEV-042 launcher 再次點擊關閉，以及 DEV-046 八個模組的 200/66/200 寬度配置、274 threshold 與 66..800 preferences。
- 證據位置：`output/predeploy/20261007-branch-validation/`
- 本報告只整理分支與本地驗證證據。它不代表 Production readiness、Production L4 或發布授權；本次未執行 Production deploy。

## 驗證結果

| 項目 | 結果 | 證據與限制 |
|---|---|---|
| DEV-040 R2 測試（`npm run test:dev-040:r2`） | 通過 | `r2.log`：355 passed、0 failed、0 skipped。 |
| 全套 Vitest（`npm test -- --testTimeout=30000`） | 通過，含既有 skip | `vitest.log`：224 個 test files passed、2 skipped；1144 tests passed、4 skipped。 |
| DEV-040 R2 continuous QC（`npm run qc:dev-040:r2`） | 通過 | `qc-r2.log` 結尾為 `DEV-040 R2 continuous QC PASS`，receipt：`output/dev-040-r2/s1b/DEV040-R2-S1B-20261007T071056597Z-1A12D9CB`。同一 log 記錄 QC 子測試 339 passed、0 failed。 |
| Abort 測試（`npm run test:dev-040:abort`） | 通過 | `qc-r2.log`：6 passed、0 failed。 |
| DB boundary（`npm run check:db-boundary`） | 通過 | 完整37檔staged集合（含032／033）獨立重跑，`db-boundary.log`為`DEV010_DB_RULESET_V1 PASS app=orgmaster governedFiles=23 diffMode=staged`；001–031 diff=0。 |
| Production build（`npm run build`） | 通過，含 chunk 警告 | `build.log`：TypeScript 檢查完成；Vite client 2191 modules、server 85 modules 均完成。Client 有 minified chunk 大於 500 kB 的既有警告。 |
| 最新 browser QC | 追加範圍通過 | `browser.log`、`ui/observations.json`：八個模組、launcher toggle、1024px桌面投影／drag split及390px touch檢查通過；19份截圖已實際覆核。非18節完整normal-entry gate重簽。 |
| Read-only deploy preflight（`npm run deploy:production -- --check`） | **阻擋** | sandbox初次返回`SOURCE_GIT_READ_FAILED`；升權重跑返回`SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE`（exit 1），見`preflight-before-commit-elevated.log`。目前分支不是官方`master`來源；尚未進入token／Cloud Run／GCS readback或release流程。 |

## 失敗與修正追溯

| 初始問題 | 處置 | 可確認結果 |
|---|---|---|
| Windows sandbox 的 TEMP 環境造成 SSR rename `EPERM` | 改用 task-specific TEMP 後重跑 | 後續驗證結果記入本次分支驗證。 |
| loopback fetch 遇到 `EACCES` | 以升權方式執行該測試 | 後續測試完成；此項是本地測試執行條件，不是 Production 網路證據。 |
| 本機 `source-map-js` 為 1.2.1，與 lockfile 1.2.2 不一致 | 使用 `npm --no-save` 同步本機依賴 | package manifest 與 lockfile 未變；focused tests 5/5 通過。 |
| DEV-046 舊 fixture 的條件不再低於 274 threshold | 調整 fixture 以符合目前 threshold 規則 | 更新後相關驗證通過。 |
| workspace split 寬度計算未納入實際 5 px divider | 將 divider 納入計算 | 邊界驗證為 564/565。 |
| lifecycle 031 fixture 的 CRLF/LF byte 差異造成 fixture 比對問題 | 測試讀檔時 normalize CRLF | 未修改 migration 或 Production binding；focused tests 12/12 通過。 |
| PR #124 首次 Linux QC 的兩個日期斷言失敗（run `37589351379`） | Intl 的日期／時間 literal 會因 ICU 版本產生 U+2009；改用 `formatToParts` 擷取數字欄位並明確組成 `YYYY/MM/DD HH:mm` | 保留 Asia/Taipei、跨 UTC 日期及 invalid-date 斷言；另加入異序 parts／U+2009 literal 測試，不放寬原斷言。原失敗日誌為 `pr-124-qc-failed.log`。 |

### 日期格式修正後的追加驗證

驗證基準為 `7196fedd2b455f957ebf551e427619fbc7809cd7` 加日期 formatter 與其測試修正。Targeted Vitest 為 16 passed／3 files（也含現行 discovery 找到的歷史拷貝），完整 Vitest 為 1145 passed／4 skipped、224 files passed／2 skipped；build 通過，R2 355/355，DB boundary 對原分支基準 `88248e5b` 通過（23 governed files）。證據為 `date-format-targeted.log`、`retry-vitest.log`、`retry-build.log`、`retry-r2.log`、`retry-db-boundary.log`。

R2 continuous QC 再次通過（339 tests、receipt `output/dev-040-r2/s1b/DEV040-R2-S1B-20261007T075353992Z-DFF56884`），獨立 abort 6/6；證據為 `retry-qc-r2.log`、`retry-abort.log`。所有驗證命令 exit 0，task-specific TEMP 在命令結束後清理。

原 scoped browser 的八份 source hash 對應 workspace／width source，未受此 formatter 修正影響；不把原 browser 紀錄改寫成日期 formatter 的 Production 驗證。

## Migration 與 Production 證據界線

工作樹中新增的 `032_dev046_employee_list_min_width.sql` 與 `033_dev046_shared_list_min_width.sql` 是 source 變更，依本次任務提供的狀態尚未套用。Production ordinary release 的 bundle ceiling 仍為 31；本報告沒有 migration Job、資料庫套用或 Production readback 證據。

- 官方來源要求clean exact `master`、HEAD等於官方remote `master`及provider保護；本分支提交不等於該條件完成。依據：`scripts/lib/dev012-owner-prerequisite-producer.mjs`與`config/release/dev040-orgmaster-independent-production-v3.json`。
- Ordinary release固定驗證完整001–031 migration bundle，要求`UNCHANGED_VERIFIED`、零DDL且不啟動migration Job；release archive可以包含032／033 source，但它們不會進入bundle或被套用。現有controlled append mode不含032／033，只限制不能在本次套用這兩筆，不阻擋普通zero-DDL UI release；未來要套用時才需新的受控forward-only流程。依據：`scripts/lib/dev040-orgmaster-independent-release.mjs`、`scripts/lib/dev040-routine-release.mjs`與`AGENTS.md`。本次preflight實際阻擋仍是官方source freeze，不是migration manifest。
- Migration 011 SQL source定義的資料庫constraint為160–800px；目前`workbenchPreference` API使用local JSON，沒有PostgreSQL／Cloud SQL persistence path，因此該constraint不影響本次UI路徑。032／033仍未套用；後續若要套用它們，需走受控migration流程。
- 001–031沒有本輪修改；未執行任何migration、provider寫入、push、merge或deploy。現行production serving revision／live constraint未在本輪讀回。

後續人類已於2026-10-07授權Production部署與切流。本報告記錄的preflight結果仍是當時的`SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE`；目前待clean protected master source及正式read-only preflight。032／033未套用不構成本次普通zero-DDL UI release的阻擋。

自動化測試、QC與build只證明各自涵蓋的本地／來源檢查；Vitest命令依現行設定也掃描`output/playwright/dev035/runtime-20260826`歷史拷貝，因此1144不是本次新增測試數。本紀錄不宣稱整體發布條件完成，不升級歷史receipt或生命週期證據。

## 最新 browser 追加範圍

- Edge隔離browser使用最新build，1440×900正常launcher進入employees、positions、departments、levels、duties、processes、management-methods、role-risks。各模組存在實際清單資料；Process原本零筆，只在本次copied data補一筆明示synthetic fixture。
- 八個模組透過實際外層splitter縮窄至約259px，皆變list-only／detail closed；放大至約647px自動恢復open。手動關閉後再縮窄／放大皆保持closed。
- 每個模組內層separator ArrowRight只送一次PUT且status 200，reload保存相同preferred；container resize不送PUT。八個模組無可見alert與document水平溢出。
- 員工launcher第二次點擊關閉panel。此無編輯browser個案不替代guard拒絕／pending／hidden component cases；相關component及layout targeted驗證合計19 tests通過，完整Vitest亦通過。
- 1024×768 fine-pointer桌面的六panel saved split投影為一stack，tab可拖且saved layout unchanged；原生tab edge drop形成兩region／一separator、保留六tabs，明確drop後才更新saved layout。390×844 touch單區、draggable=false；兩尺寸document寬度等於viewport。
- 實際覆核八份normal、八份narrow、desktop projection／drag及mobile共19份截圖。清單長文字依既有ellipsis／換行呈現；沒有將本輪量測解讀為所有domain編輯控制或整份文件內容已驗證。提交前重算report內八份source SHA-256，source drift=0。
- `pageerror=0`；未登入`/api/auth/me`401一次與未配置正式auth mode的`/api/auth/mode`503二十次保留原始記錄，不能宣稱console零error。
- Runtime owner PID=40988、loopback port=54415；task-owned browser／server已close，portReleased與temporaryRootRemoved均true。既有使用者runtime／browser未操作。
- `ui/observations.json` SHA-256：`ee266970ecec1d4ab137e81eba55d2ef10babf0ad91140324419cbdb479149eb`。

## 完成狀態

- [x] 暫存新SQL後重跑`npm run check:db-boundary`通過。
- [x] 補上最新browser追加範圍結果與證據位置。
- [x] 唯讀deploy preflight已執行；source freeze阻擋如上，並非READY。
