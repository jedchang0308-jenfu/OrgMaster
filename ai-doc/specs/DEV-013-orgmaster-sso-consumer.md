# DEV-013 OrgMaster consumer capsule

- Owner: OrgMaster
- Source task: `Jenfu-Platform / DEV-013 / 013-S2`（SSO consumer）；managed staging successor: `013-S4-L3-ORGMASTER-ENV`
- Native tracking: `OrgMaster / DEV-048`（managed staging owner package；一併索引既有 consumer 前置實作，不追溯改寫原任務編號）
- Contract lock: `contracts/jenfu-sso-handoff/v1/contract-lock.json`
- Status: `Local implementation complete / mode off / release gated`

## 來源、任務索引與歷史補正（2026-09-17）

- 本文件位於 **OrgMaster repository** 的 `ai-doc/specs/DEV-013-orgmaster-sso-consumer.md`；「DEV-013 OrgMaster consumer」是跨專案 consumer capsule 名稱，不是 OrgMaster 本地 DEV-013，也不是另外建立的 Codex 執行緒。保留檔名以維持既有引用。
- 初始實作由 Jenfu-Platform 的 Codex 執行緒「修復跨系統單一登入」（thread ID: `01a0a8b2-1d1d-7243-baee-0567f90cbcdc`）執行；工具事件 `exec-ebbebecf-9707-4c20-b0d2-1d6bc5337711` 在 OrgMaster 執行 `git switch -c codex/dev-013-orgmaster` 及提交。初始 commit: `2c1a8dc50a21882e7fda9fab149f6a311ee7ef5b`（`feat(dev-013): add OrgMaster SSO consumer`）。Git author／committer 署名不能用來判定是人類操作。
- Branch reflog 的建立事件時間為 **2026-09-16 23:28:46 +08:00**；先前回覆的 22:13:54 是起點 commit 的時間，不是 branch 建立時間。原始 branch 與 commit 均保留，不以補正文件改寫歷史。
- 原 capsule 的 `Native task: DEV-013-S2` 為錯誤標示。OrgMaster 本地 DEV-013 是既有「樹狀圖節點寬度縮至 60%」UI 任務，維持原狀；目前 managed staging owner package 由 [dev_task 的 DEV-048](../dev_task.md#dev-048dev-013-013-s4-l3-orgmaster-env-managed-staging-owner-package) 追蹤，本段只補齊它的 consumer 前置實作來源，不新增或回填另一個歷史 DEV。
- 授權紀錄與技術必要性分開判斷：不能以「跨應用整合需要」或後續 owner 工作授權，直接認定先前跨專案操作已獲授權；本段也不把未核對到的原始授權補寫為已核准。本次人類「執行修改」授權限於已討論的文件補正與全域防再發設定，不授權新的 consumer 開發、branch 操作或 release。
- 本次文件補正依全域跨專案授權規則執行；後續跨專案開發須先取得人類明確指定目標與動作範圍的授權，讀取目標 AGENTS 並重新確認 Git 狀態。任務來源／本地 ID／文件地圖須同步，不能只留在來源專案的對話內。

## Boundary

OrgMaster consumes Platform `jenfu.sso-handoff.v1` for the fixed `orgmaster` audience. It keeps the OrgMaster host-only session cookie, local account and permission checks, central auth epoch read, and local logout authority. It does not read Portal cookies, accept Firebase bearer tokens from another host, create shared session keys, or modify Platform or AI-PDM schemas.

## Implemented surface

- `server/orgmasterSsoHandoff.ts`: signed transaction cookie, exact callback／state／PKCE validation, attached service identity exchange, stale principal／epoch guard, account conflict handling, and local session creation.
- `server/orgmasterAuthApi.ts`／`orgmasterAuthEpochRepository.ts`: `authState v2` on direct Firebase exchange and every protected request; SSO mode discovery remains default-off.
- `src/auth/AuthGate.tsx`／`authApiClient.ts`: when the owner mode is enabled, show only the Platform login entry and preserve local／development modes otherwise.

## Runtime and release inputs

`ORGMASTER_JENFU_SSO_HANDOFF_MODE` is `off` by default. Enabling requires the exact Platform broker origin and provider-readback OrgMaster `run.app` callback in the owner release profile. The attached service account is obtained through Application Default Credentials; no service-account key is accepted. Rollback is `target off` after `launch → accept` drain, retaining the auth-state and original-auth-time guards.

## Verification entrypoints

`npm run test:dev-013`, `npm run check:db-boundary`, and `npm run build` are the owner-local checks. Local PASS does not close QA-013 or authorize managed non-production／production release.

## 013-S4-L3-ORGMASTER-ENV owner package

Local tracking ID: `DEV-048`（the repository-native `DEV-013` is an older UI task; this alias prevents identifier collision without changing the Platform task ID）.

Status: `READY_FOR_NONPROD_APPLY / releaseAuthority=false / exact provider preflight confirms service missing`. Platform current source-bound read-only preflight confirms the runtime identity exists and is enabled, while exact `jenfu-platform-nonprod / asia-east1 / orgmaster-stg` is absent. No Terraform apply, Cloud Run deploy, migration, candidate creation, activation, rollback, or traffic mutation has been run by this slice. This status does not mean L3, production, or DEV-013 is complete.

The applyable profile is `config/dev-013/l3-orgmaster-staging.json`; the Terraform root is `infra/google-cloud/dev-013-l3-orgmaster`. Both lock the Platform machine-readable manifest `jenfu.dev013.l3-managed-staging.v2` SHA-256 `bc51a29b28a34a6316f41e3a2cfb0bc399c07befc8fc61334014f24627bae30d` and canonical contract aggregate SHA-256 `e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483`. Any drift is a hard stop.

The package uses one app-owned state prefix, `dev-013/orgmaster-staging`, and two exact same-state stages:

1. `OWNER_INFRA_A` creates only the OrgMaster Artifact Registry repository, evidence bucket, and their exact owner/QC IAM bindings.
2. After the frozen source is built and provider-read back as an immutable digest, `OWNER_RUNTIME_B` adds the existing runtime identity readbacks, Firebase viewer binding, and `orgmaster-stg` Cloud Run service.

The runtime target is exactly `jenfu-platform-nonprod / asia-east1 / orgmaster-stg / jenfu_stg`, attached to `dev010-stg-orgmaster-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com`. It has `min_instance_count=0`, deletion protection, a pinned Cloud SQL Auth Proxy sidecar on the exact private connection, IAM database authentication, and no owner／DDL／migrator identity or migration job. `ORGMASTER_JENFU_SSO_HANDOFF_MODE=off`; the broker origin and public base URL are derived from provider readback inputs and are rejected if they are placeholders, custom domains, legacy origins, or not the exact `run.app` authorities allowed by the Platform manifest.

Receipt與release順序固定如下：

1. `OWNER_RUNTIME_B` provider hard join只能產生`jenfu.dev013.l3-target-bootstrap-receipt.v2 / TARGET_BOOTSTRAP_READY`；此時`ORGMASTER_JENFU_SSO_HANDOFF_MODE=off`，receipt同時保存exact active revision作rollback security floor，並以`boundaries.secretReferences`綁定`ORGMASTER_SESSION_HASH_PEPPER → dev010-stg-orgmaster-runtime-config:<numeric version>`。它只供Platform source freeze v3使用，不能進L3 browser gate。
2. Platform broker建立後，candidate plan只接受與security floor相同source revision／tree及相同immutable digest，並把handoff mode設為`on`；candidate建立時保持原off revision承擔100% traffic。
3. `candidate-receipt`以provider readback證明新revision、etag、origin、broker、callback、identity與mode，但狀態只有`ENABLED_REVISION_READY`。
4. activate plan只接受該candidate receipt並只修改OrgMaster traffic。Post-activation readback必須證明`mode=on`、exact candidate revision承擔100% traffic、numeric Secret reference不漂移且etag已更新，才可產生`jenfu.dev013.l3-owner-receipt.v2 / OWNER_READY_FOR_L3_BROWSER`。

Candidate／activate／rollback planning is owner-native and read-only by default. Every plan is constrained to the OrgMaster service, revision, runtime environment, and traffic. Activation retains auth-state v2 and the original-auth-time guard；rollback只回同source／同digest的off security floor，不得回pre-DEV-013 artifact。

Owner commands:

- `npm run freeze:dev-013:l3 -- --stage OWNER_INFRA_A|OWNER_RUNTIME_B ...`（`OWNER_RUNTIME_B`必須提供`--runtime-secret-receipt`；`--runtime-secret-version`一律拒絕）
- `npm run verify:dev-013:l3:plan -- --stage OWNER_INFRA_A|OWNER_RUNTIME_B ...`
- `npm run receipt:dev-013:l3:owner -- bootstrap-receipt ...`
- `npm run receipt:dev-013:l3:owner -- candidate-receipt ...`
- `npm run receipt:dev-013:l3:owner -- owner-receipt ...`
- `npm run release:dev-013:l3 -- --operation candidate|activate|rollback ...`（read-only plan unless a future separately authorized run passes `--execute`）
- `npm run bootstrap:dev-013:l3:secret`（固定target的read-only empty-version preflight）；只有另行nonprod授權後才可加`--execute --authorization=DEV013-L3-ORGMASTER-FIRST-SECRET-VERSION --output <new-path>`
- `npm run test:dev-013:l3`

Required Secret Manager object: `dev010-stg-orgmaster-runtime-config`, consumed only through a numeric version as `ORGMASTER_SESSION_HASH_PEPPER`. Manifest v2 defines `versionBootstrap.mode=OWNER_GENERATED_IF_EMPTY` and `minimumEntropyBytes=64`; the executor refuses any existing version and requires the exact execute capability plus a clean committed OrgMaster source. It encodes 64 bytes of entropy as UTF-8-safe base64url, streams the payload through stdin, zeroes the in-memory buffers after the provider call, and emits a self-hashed `jenfu.dev013.secret-version-bootstrap-receipt.v1 / FIRST_VERSION_CREATED` receipt bound to source revision/tree, exact target, version `1`, provider state and `secretPayloadCaptured=false`. `OWNER_RUNTIME_B` source freeze verifies this receipt, requires the same revision/tree, derives the numeric version from it and stores its SHA-256; caller-provided version input is forbidden. No secret value belongs in source, Terraform variables, plans, receipts, or logs.

If an independently preserved governance-only `AGENTS.md` commit advances the same branch after version 1 is created, the first-version executor must not run again. The owner may instead use the exact `DEV013-L3-ORGMASTER-SECRET-CONTINUITY` capability to produce `jenfu.dev013.secret-version-continuity-receipt.v1`: the original source must be a Git ancestor; the changed paths must equal `AGENTS.md` plus this continuity specification, executor, verifier, and their two tests; the current worktree must be clean; and provider metadata must still report exact numeric version 1 as `ENABLED`. The fixed set is encoded as `ORGMASTER_SECRET_CONTINUITY_CHANGED_PATHS`; it contains no application runtime, dependency, image, Terraform, or release-target input. This receipt records zero mutations and no payload; any other path change fails closed and requires a new architecture decision.
