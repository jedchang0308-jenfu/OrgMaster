# DEV-049 managed Directory production identity

This state owns exactly one OrgMaster production DWD signer and the signer-level
`roles/iam.serviceAccountTokenCreator` binding for the existing
`orgmaster-prod-runtime` identity. It does not own the Cloud Run service, project
IAM, Secrets, service-account keys, Workspace users, or any sibling resource.

The Google Workspace administrator must separately authorize the output
`oauth2_client_id` for exactly
`https://www.googleapis.com/auth/admin.directory.user.readonly`. Terraform cannot
create that Workspace Admin Console delegation. Do not add key resources or
downloaded credentials; the runtime calls IAM Credentials `signJwt`.

Production plan/apply is a protected DEV-014 release action and requires its
exact project, state, source revision, operator, and rollback evidence. This
module's presence is implementation evidence only and is not release authority.

Initialize only with backend bucket `tfstate-jenfu-platform-prod` and prefix
`dev-049/managed-directory/default.tfstate`. Supply the exact merged source
revision and provider-readback foundation receipt SHA-256, export the saved plan
to JSON, then pass it through `npm run gate:dev-049:managed-directory`. The gate
requires the complete four-address set and permits only `read`, `create`, or
`no-op`; update, delete, and replacement actions fail closed.
