# DEV-013 OrgMaster managed staging IaC

This root owns only the OrgMaster non-production state prefix, Artifact Registry repository, evidence bucket, exact IAM members, and `orgmaster-stg` Cloud Run service.

The source-frozen package uses two plans in the same state:

1. `OWNER_INFRA_A` sets `runtime_enabled=false` and creates only the repository/evidence boundary.
2. Run `npm run bootstrap:dev-013:l3:secret` as the read-only empty-version preflight. Only a separately authorized non-production run may add `--execute --authorization=DEV013-L3-ORGMASTER-FIRST-SECRET-VERSION --output <new-path>` from a clean committed OrgMaster source; it refuses any existing version, generates 64 bytes of entropy, converts it to UTF-8-safe base64url, and streams the payload to the exact Secret through stdin without persisting or printing it. The provider metadata readback must be exact version `1`; the resulting self-hashed `jenfu.dev013.secret-version-bootstrap-receipt.v1 / FIRST_VERSION_CREATED` receipt binds source revision/tree and records `secretPayloadCaptured=false`.
3. Build the exact committed tree with the source-freeze receipt's root `Dockerfile` SHA and exact `SOURCE_REVISION`, `SOURCE_TREE`, `SOURCE_CREATED_AT`, `SOURCE_VERSION`, and `SOURCE_STATE` arguments; push to the new repository and record the provider digest.
4. Create the `OWNER_RUNTIME_B` source freeze with `--runtime-secret-receipt <FIRST_VERSION_CREATED receipt>`; direct `--runtime-secret-version` input is rejected. The freeze verifies the same source revision/tree, derives exact version `1`, stores the receipt SHA-256, and then gates the plan that sets `runtime_enabled=true` with the immutable digest.

Both saved plans must pass `npm run verify:dev-013:l3:plan`. Apply, image build/push, deploy, migration, and traffic changes are intentionally not performed by the local package checks.

`ORGMASTER_PUBLIC_BASE_URL` and `ORGMASTER_JENFU_SSO_BROKER_ORIGIN` use the Cloud Run v2 project-number URL template from the frozen Platform manifest. After `OWNER_RUNTIME_B`, `npm run receipt:dev-013:l3:owner -- bootstrap-receipt ...` emits only the v2 `TARGET_BOOTSTRAP_READY`: it proves the exact provider URI, attached identity, numeric Secret reference, active off-mode revision and rollback floor so Platform can be created without a circular final-receipt dependency. It is not browser-ready evidence.

After Platform exists, the OrgMaster owner publishes a same-source／same-digest `on` candidate with no traffic, produces `candidate-receipt` from provider readback, and activates only that exact revision with a traffic-only plan. `owner-receipt` is available only after post-activation readback proves `mode=on` and 100% revision-pinned traffic. The resulting `OWNER_READY_FOR_L3_BROWSER` receipt is the only OrgMaster receipt accepted by the final L3 browser gate.
