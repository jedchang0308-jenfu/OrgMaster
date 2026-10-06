# DEV-057：DEV-014 lifecycle build-abort infrastructure continuation

Status: LOCAL_FIX / NOT_RELEASED; DEV-014 remains OPEN.

The latest R4 native owner attempt stopped in build on CVE-2026-93749. Prepare and safe failure finalized; migrate, candidate and activation did not run. Its prior image-only Terraform rotation had already moved the existing migration Job to c7360e09. The successful f3e313 service and installed 31-row ledger remain the application/data baseline. The previous verifier incorrectly used that successful release’s older runner digest as the before-image of every new rotation, so a legitimate subsequent source-bound rotation would fail.

## Current implementation

Keep `baselineIntentRef` and `previousRevision` on the successful RELEASED chain. The native CLI automatically derives `appliedAbortInfraBaseline` from the exact fresh finalized abort and freezes identical immutable refs and the sealed control snapshot in both source-bound readiness and authorization. No operator-selectable continuation URI or Boolean is introduced. Existing quiescence verifies the unchanged head under CAS before dispatch; native stages later read these immutable prerequisite refs rather than mutable active control.

Verify the prior intent/prepare/terminal and source joins, full 31-row stable migration inputs, exact prerequisite refs, prior runtime default-off mode, candidate-null control and absence of migration/candidate/deployment. Verify every bounded predecessor’s APPLIED native complete-set image-only proof; the next rotation’s before must equal the validated prior after. A repeated build abort carries the previous immutable anchor, with cycle/depth checks. The current source’s normal complete-set image gate and fresh native 0/31 replay remain mandatory. Runtime enablement and ordinary release cannot consume this anchor. No migration, IAM, Secret, service or traffic authority changes.

## Evidence and limits

The original regression fails with DEV014_LIFECYCLE_REPLAY_INFRA_INVALID. Four groups exercise valid single/repeated abort continuation and reject malformed sealed control/ref/source, already-migrated/candidate state, bad prepare, incomplete native proof, non-image changes and normal/enablement bypass. A read-only call of the candidate verifier accepted the actual provider-sealed R4 intent/prepare/terminal and R2→R4 infra chain, retaining orgmaster-prod-a48a05dc0080 as service baseline and c7360e09 as runner baseline. This check has zero cloud mutations and is not release authority or L4.

The same 27-file owner Node suite now has 337 cases (prior 333 plus these four); full regression/build and every required CI remain. Remote protected CI validates all mandatory checks before merge. R5 source119 runner ab7fdaac and recovery6021d80d are retained provenance and will not be falsely reused as the changed release executable. Next release requires new exact merged source, runner, rotation, recovery and native owner capsule; Scheduler stays PAUSED until runtime-only enablement finalizes.

Final local checks: owner Node 337/337, abort suite 6/6, final four focused groups 4/4, database boundary PASS and completed verifier accepted the actual immutable provider receipts read-only. All original failures remain indexed, including a test-iteration syntax typo corrected before delivery. The source hashes and exact logs are in `evidence/DEV057-LIFECYCLE-ABORT-INFRA-20261006/index.json`; this is LOCAL_FIX, not Production completion.
