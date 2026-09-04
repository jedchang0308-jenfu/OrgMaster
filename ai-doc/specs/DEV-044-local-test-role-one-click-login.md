# DEV-044：地端測試角色一鍵登入

狀態：`RD Implementation Complete / Targeted Gates Passed / Browser QA-QC Passed / Full Regression Passed`
日期：2026-09-04
風險：Medium
節點類型：開發點
父交付點：DEV-040、DEV-043

## 1. 目標

在 OrgMaster 的 Vite development loopback 環境提供後端定義的測試角色選單，讓開發者不需 Firebase、Cloud SQL 或密碼即可一鍵建立地端測試工作階段，並能驗證 DEV-043 的員工－登入身分關係與既有治理／管理辦法權限差異。

## 2. Spec Impact Preflight

判定：`Compatible exception`。

- DEV-004 的 production Firebase token exchange、opaque `orgmaster_session`、active principal 與 central epoch 每 request 驗證維持不變。
- DEV-004 既有 loopback＋exact header 入口保留給自動化 fixture；一般瀏覽器不再自動注入固定 `local-admin` header。
- 新增的測試角色 cookie 只能在 Vite `development` command、loopback request 與 same-origin POST 同時成立時簽發及接受。
- Vite preview、production Node BFF、正式 Firebase／DB、production identity link、role assignment、policy publish與release均不在本任務範圍。
- DEV-043 的 Employee唯一真相與「員工明細 → 登入身分」唯一關係設定入口不變。

ADR：`Not needed`。這是 local-only、可移除且不改 production authority 的開發介面；production identity與role authority仍由DEV-040及ADR-007治理。

## 3. 地端測試角色

這四個角色是可重現的地端權限情境，不寫入 governance document，也不冒充正式 role assignment evidence。

| Profile ID | 顯示角色 | 對應Employee | 地端權限 |
|---|---|---|---|
| `administrator` | OrgMaster 管理者 | `employee-shijie`／張仕杰 | 全部OrgMaster governance與management-method permissions；可作local bootstrap |
| `governance-manager` | 人員治理者 | `employee-youhao`／張祐豪 | `governance.manage`、`governance.simulate`、閱讀已提供管理辦法；不可發布治理政策 |
| `method-manager` | 管理辦法維護者 | `employee-chenghan`／張成漢 | 建立、閱讀、編輯、提供及維護管理辦法；不可管理身分／角色或發布治理政策 |
| `employee` | 一般員工 | `37e8e57e-a0d1-4280-b815-d209aa629380`／游世賢 | 僅閱讀已提供的管理辦法；治理操作唯讀 |

角色邊界：現行組織workspace的可寫性仍由版本狀態、裝置能力與既有workspace boundary決定；本任務不新增`organization.manage` permission，也不得把上述角色宣稱為完整production RBAC。

DEV-045相容銜接（2026-09-04）：[員工帳號邀請與登入身分設定](DEV-045-employee-account-enrollment.md)已達`RD Implementation Ready`。其local／isolated Current Phase將`orgmaster.identity.view`、`orgmaster.identity.invite`、`orgmaster.identity.link`與`orgmaster.identity.invitation.manage`加入`administrator`及`governance-manager`的server allowlist；`method-manager`與`employee`維持deny-by-absence。這是DEV-045的產品實作範圍，不回開DEV-044既有登入完成狀態，也不代表production role assignment已發布。

## 4. 後端契約

### 4.1 Profile registry

- 角色ID、principal、subject、Employee mapping、顯示資料與permission codes只能由server allowlist定義。
- client只提交`profileId`，不得提交principal、Employee、role或permission內容。
- local identity issuer固定為`urn:orgmaster:dev`，每個profile使用不同subject與principal。

### 4.2 API

- `GET /api/auth/development/profiles`
  - 僅development＋loopback回`200`、redacted profile list，以及目前有效的development session或`null`；未選角色時不需先以401探測`/me`。
  - preview／production回`404`，不得洩漏或啟用地端登入。
- `POST /api/auth/development/session`
  - 要求development＋loopback、same-origin、JSON及allowlisted`profileId`。
  - 成功回AuthSessionView並簽發host-only、HttpOnly、SameSite=Strict的`orgmaster_dev_profile` cookie。
  - 未知profile或格式錯誤回`400 auth_request_invalid`；origin錯誤回`403 auth_origin_invalid`。
- `GET /api/auth/me`
  - 有有效development cookie時回選定principal／Employee及development profile顯示資料。
  - development且未設定正式Auth runtime／未選profile時回`401 auth_session_invalid`，讓AuthGate進入角色選單；不得回503阻斷地端登入。
- `POST /api/auth/logout`
  - development session不依賴正式Auth runtime即可清除development cookie並回`200 completed`。
  - Firebase／production logout流程不變。

### 4.3 權限

- governance與management-method server gate先查development profile permission；非development identity維持既有published policy evaluation。
- `administrator`保留既有local privileged／bootstrap能力。
- `governance-manager`不得取得`governance.publish`或cross-app privileged override。
- `method-manager`及`employee`不得取得`governance.manage`。
- 地端permission override不得在preview／production成立。

## 5. UI Entry Contract

- Target actor：在`npm run dev:local`啟動、尚未選擇地端角色的開發者。
- 起始畫面：AuthGate「地端測試登入」。
- 主要工作物件：四個測試角色；每個選項顯示角色名、Employee姓名與一行權限差異。
- 主要操作：直接點擊某角色，一次操作建立session並進入OrgMaster。
- 登入後左側登入狀態顯示Employee姓名與測試角色；development按鈕顯示「切換角色」。
- 點擊「切換角色」成功後直接回角色選單；失敗時保留既有session並顯示就地錯誤。
- Firebase帳密登入畫面、blocked與unavailable畫面保持既有行為。

## 6. Out of Scope

- 建立Firebase／Google Workspace／Cloud Identity帳號。
- 修改正式principal mapping、production role assignment、active policy或Employee主檔。
- 用地端profile作production／release／cross-repo entitlement通過證據。
- 新增組織workspace CRUD permission、跨app角色、MFA或privileged production bootstrap。

## 7. Failure Recovery

- cookie不存在、過期或profile ID未知：`/me`回401並回到角色選單，不載入protected data。
- login POST失敗：保留角色選單與最短錯誤訊息，可重試其他角色。
- logout失敗：維持舊session及protected內容，顯示「切換失敗，工作階段仍有效」。
- profile對應Employee日後不存在：session仍可建立供auth／permission測試，但與Employee關係操作應依既有Employee validation拒絕；更新fixture mapping另立維護紀錄。

## 8. QA／QC Gate

| ID | 操作 | 預期 |
|---|---|---|
| A1 | 無cookie由正常`/`進入 | 顯示四個地端測試角色，protected organization data未先render |
| A2 | 點擊每個角色 | `/me`回對應principal、Employee與role；重新整理維持選定角色 |
| A3 | 讀governance／management-method session | 四個profile的capability矩陣與第3節一致 |
| A4 | 管理者／人員治理者開員工明細 | DEV-043登入身分區可見；只有具manage者可見適用操作，publish僅管理者 |
| A5 | 點擊切換角色 | cookie清除、無「登出失敗」、立即回角色選單並可選另一角色 |
| A6 | production／preview gate | development endpoints不可用；production auth source與build不含client-sidepermission injection |
| A7 | 1440×900、1024×768、390×844與鍵盤 | 角色名稱／Employee／差異可讀，無水平overflow，Tab＋Enter可登入與切換 |
| A8 | visible-error sweep | 主要流程無alert、HTTP 4xx／5xx文字或critical empty；錯誤注入時protected內容不先render |

Automated gate：auth server／AuthGate／management authorization／governance targeted tests、typecheck與client＋server build。UI gate：Playwright正常入口、角色切換、capability API readback、三viewport、鍵盤與screenshot。

## 9. FMEA

| 失效模式 | 使用者影響 | 偵測 | 優先級 | 對策 |
|---|---|---|---|---|
| 地端入口被production接受 | 權限繞過 | preview／server negative test＋source scan | P0 | command＋loopback雙gate |
| client可自填permission | 測試結果失真 | API negative test | P0 | server allowlist只收profileId |
| 切換後仍使用舊角色 | 權限判斷錯誤 | cookie／`/me`／capability readback | P1 | logout清cookie、reload-independent state transition |
| 一般員工仍可管理治理 | 權限過寬 | governance session negative case | P1 | server permission lookup先於UI顯示 |
| 登出依賴未配置DB | 重現使用者截圖錯誤 | unconfigured runtime logout test | P1 | dev logout獨立完成 |
| 角色選單窄版截斷 | 無法選擇 | 390×844 screenshot／scrollWidth | P2 | 單欄flat action list |

## 10. Readiness

- P0 gap：0。
- P1 gap：0。
- RD順序：server profile registry／cookie與API → server permission adapter → AuthGate／launcher UI → targeted tests → typecheck／build → frozen browser QC →文件收斂。
- Stop conditions：需要production credential、正式role／identity寫入、`organization.manage`新權限、跨repo契約變更、deploy或release時停止並回DEV-040／release gate。

## 11. Implementation Result（2026-09-04）

- S1～S3完成：server allowlist、HttpOnly SameSite=Strict cookie、同源登入／切換、development session hydration、governance與management-method server gate、AuthGate與launcher角色顯示均已落地。
- UI capability邊界同步完成：治理發布表單／重新啟用只依`governance.publish`顯示，指派檢查依`governance.simulate`啟用；後端仍是最終授權者。
- 四profile API readback與第3節一致；重新整理保留角色，切換成功直接回角色選單，未再出現「登出失敗」。
- 員工－帳號關係UI已在真實畫面確認：`員工 → 選擇員工 → 右側員工明細 → 登入身分`；現行版只讀，進入可寫草稿後才提供具權限者的設定操作。
- browser QC：1440×900、1024×768、390×844皆無document horizontal overflow；Tab＋Enter登入通過；happy path console為0 error／0 warning，alert為0。
- automated gate：targeted 7 files／36 tests PASS；`tsc --noEmit` PASS；client＋server build PASS；可執行full regression 185 files／776 tests PASS、1 skipped。兩個既有Node fixture因不含Vitest suite，以已記錄exclude執行，不屬DEV-044功能失敗。
- 證據：`output/playwright/dev044/manifest.md`與同資料夾4張PNG。
- runtime cleanup：只建立並關閉本任務Playwright session；安全重用既有`localhost:5000`（PID 12468）且保持運行，未建立或遺留其他app server。
- Spec drift：`In sync`；DEV-004／DEV-040 production Firebase/BFF authority與DEV-043 Employee唯一真相未變。
