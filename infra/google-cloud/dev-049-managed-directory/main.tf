data "google_service_account" "runtime" {
  project    = var.project_id
  account_id = var.runtime_service_account_id
}

resource "terraform_data" "provenance" {
  input = {
    project_id                 = var.project_id
    project_number             = var.project_number
    region                     = var.region
    source_revision            = var.source_revision
    foundation_manifest_sha256 = var.foundation_manifest_sha256
    operator_email             = var.operator_email
    signer_email               = "${var.dwd_service_account_id}@${var.project_id}.iam.gserviceaccount.com"
    delegated_scope            = "https://www.googleapis.com/auth/admin.directory.user.readonly"
  }

  lifecycle {
    prevent_destroy = true
  }
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
