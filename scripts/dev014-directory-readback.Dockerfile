# Runtime-only, zero-database Directory readback. Reuse the verified
# OrgMaster runtime base; no new dependencies or private keys are installed.
FROM asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:9927dd5508f398d21e3ed6412845583ef49387aa8b5c628e41c99dd565b5ae92
ARG SOURCE_REVISION
# ARG is build-only; do not change the verified image environment.
USER 0:0
RUN ["/nodejs/bin/node", "-e", "const s=process.env.SOURCE_REVISION; if (!/^[a-f0-9]{40}$/.test(s || '')) process.exit(1); require('node:fs').writeFileSync('/app/dev014-directory-source-revision.txt', s+'\\n', {mode: 292})"]
COPY --chown=65532:65532 scripts/dev014-directory-readback-canary.mjs /app/scripts/dev014-directory-readback-canary.mjs
LABEL com.jenfu.orgmaster.operator="dev014-directory-readback"
USER 65532:65532
# Preserve the verified base ENTRYPOINT/CMD and native loader configuration.
# The task-owned Job selects the fixed canary with an explicit command override;
# this operator image is never an application-service release.
