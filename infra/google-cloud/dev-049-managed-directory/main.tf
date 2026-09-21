data "google_service_account" "runtime" {
  project    = var.project_id
  account_id = var.runtime_service_account_id
}

resource "google_service_account" "directory_dwd" {
  project      = var.project_id
  account_id   = var.dwd_service_account_id
  display_name = "OrgMaster production Directory DWD signer"
  description  = "Keyless, read-only Google Admin Directory domain-wide delegation signer for OrgMaster."

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account_iam_member" "runtime_token_creator" {
  service_account_id = google_service_account.directory_dwd.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${data.google_service_account.runtime.email}"
}
