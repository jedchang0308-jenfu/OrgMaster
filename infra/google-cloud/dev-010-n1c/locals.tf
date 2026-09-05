locals {
  job_name = "orgmaster-stg-migration-runner"
  labels = {
    app         = "orgmaster"
    dev_id      = "dev-010"
    environment = "staging"
    managed_by  = "terraform"
  }
}
