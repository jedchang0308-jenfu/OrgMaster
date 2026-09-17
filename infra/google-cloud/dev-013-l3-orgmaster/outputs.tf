output "owner_infra_manifest" {
  value = {
    project_id                 = var.project_id
    project_number             = data.google_project.target.number
    region                     = var.region
    source_revision            = var.source_revision
    source_tree                = var.source_tree
    platform_manifest_sha256   = var.platform_manifest_sha256
    canonical_contract_sha256  = var.canonical_contract_sha256
    foundation_manifest_sha256 = var.foundation_manifest_sha256
    artifact_repository        = google_artifact_registry_repository.orgmaster.repository_id
    image_uri                  = "${var.region}-docker.pkg.dev/${var.project_id}/${local.artifact_repository}/orgmaster"
    evidence_bucket            = google_storage_bucket.evidence.name
    evidence_prefix            = local.evidence_prefix
    runtime_enabled            = var.runtime_enabled
  }
}

output "orgmaster_staging_manifest" {
  value = var.runtime_enabled ? {
    project_id                    = var.project_id
    project_number                = data.google_project.target.number
    region                        = var.region
    service_name                  = google_cloud_run_v2_service.orgmaster[0].name
    provider_uri                  = google_cloud_run_v2_service.orgmaster[0].uri
    expected_orgmaster_origin     = local.orgmaster_origin
    expected_platform_origin      = local.platform_origin
    runtime_service_account       = data.google_service_account.runtime[0].email
    runtime_service_subject       = data.google_service_account.runtime[0].unique_id
    application_image             = var.orgmaster_image
    min_instances                 = 0
    max_instances                 = 1
    database_pool_max             = 2
    deletion_protection           = true
    ingress                       = "INGRESS_TRAFFIC_ALL"
    default_uri_disabled          = false
    invoker_iam_disabled          = true
    sso_handoff_mode              = "off"
    runtime_config_secret_id      = local.runtime_secret
    runtime_config_secret_version = var.runtime_config_secret_version
  } : null
}
