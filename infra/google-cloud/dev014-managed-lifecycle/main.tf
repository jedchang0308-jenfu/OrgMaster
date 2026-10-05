locals {
  project_id                        = "jenfu-platform-prod"
  project_number                    = "9536592944"
  region                            = "asia-east1"
  runtime_service_account_id        = "orgmaster-prod-runtime"
  runtime_service_account_email     = "orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com"
  runtime_service_account_unique_id = "109928765105400231333"
  canonical_origin                  = "https://orgmaster-prod-9536592944.asia-east1.run.app"
  lifecycle_path                    = "/api/internal/managed-identity-lifecycle/v2"
}

variable "source_revision" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.source_revision))
    error_message = "Use the verified clean official source-freeze revision."
  }
}

variable "foundation_manifest_sha256" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.foundation_manifest_sha256))
    error_message = "Use the provider-readback applied foundation manifest hash."
  }
}

output "release_binding" {
  value = {
    source_revision            = var.source_revision
    foundation_manifest_sha256 = var.foundation_manifest_sha256
    project_id                 = local.project_id
    project_number             = local.project_number
    region                     = local.region
  }
}

data "google_project" "current" {
  project_id = local.project_id
}

data "google_service_account" "runtime" {
  project    = local.project_id
  account_id = local.runtime_service_account_id
}

resource "google_cloud_scheduler_job" "managed_identity_lifecycle" {
  project          = local.project_id
  region           = local.region
  name             = "orgmaster-prod-managed-identity-lifecycle"
  description      = "DEV-014 managed identity lifecycle worker trigger"
  schedule         = "* * * * *"
  time_zone        = "Asia/Taipei"
  attempt_deadline = "60s"
  paused           = true

  http_target {
    http_method = "POST"
    uri         = "${local.canonical_origin}${local.lifecycle_path}"

    oidc_token {
      service_account_email = data.google_service_account.runtime.email
      audience              = local.canonical_origin
    }
  }

  lifecycle {
    prevent_destroy = true
    # Terraform creates the fixed job PAUSED. The protected-source operator
    # alone owns later pause/resume; plans must join its live readback receipt.
    ignore_changes = [paused]

    precondition {
      condition     = tostring(data.google_project.current.number) == local.project_number
      error_message = "The resolved project number does not match the fixed OrgMaster production target."
    }

    precondition {
      condition = (
        data.google_service_account.runtime.email == local.runtime_service_account_email &&
        data.google_service_account.runtime.unique_id == local.runtime_service_account_unique_id
      )
      error_message = "The runtime service account identity does not match the fixed OrgMaster production binding."
    }
  }
}
