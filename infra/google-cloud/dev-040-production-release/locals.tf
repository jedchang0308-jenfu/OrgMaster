locals {
  app                            = "orgmaster"
  github_repository              = "jedchang0308-jenfu/OrgMaster"
  github_workflow_ref            = "jedchang0308-jenfu/OrgMaster/.github/workflows/deploy-orgmaster-independent-production.yml@refs/heads/master"
  pool_resource_name             = "projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${var.workload_identity_pool_id}"
  github_principal_set           = "principalSet://iam.googleapis.com/${local.pool_resource_name}/attribute.repository_id/${var.github_repository_id}"
  controller_service             = "orgmaster-prod-abort-controller"
  controller_audience            = "https://release-controller.jenfu.internal/orgmaster"
  controller_github_token_secret = "orgmaster-prod-controller-github-read-token"
  incident_topic                 = "orgmaster-prod-release-incident"
  receipt_prefix                 = "projects/_/buckets/${var.release_bucket_name}/objects/receipts/"
  control_prefix                 = "projects/_/buckets/${var.release_bucket_name}/objects/control/"
  source_prefix                  = "projects/_/buckets/${var.release_bucket_name}/objects/source/"
  logs_prefix                    = "projects/_/buckets/${var.release_bucket_name}/objects/logs/"
  labels                         = { owner = "orgmaster", contract = "dev-012", environment = "production" }
}
