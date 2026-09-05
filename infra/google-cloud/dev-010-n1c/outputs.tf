output "state_contract" {
  value = {
    remote_state_prefix        = "dev-010/n1c/orgmaster"
    foundation_manifest_sha256 = var.foundation_manifest_sha256
    project_id                 = var.project_id
    region                     = var.region
    database                   = "jenfu_stg"
    runtime_service_count      = 0
  }
}

output "migration_job_name" {
  value = var.enable_job ? google_cloud_run_v2_job.migration[0].name : local.job_name
}
