variable "project_id" {
  type    = string
  default = "jenfu-platform-prod"
  validation {
    condition     = var.project_id == "jenfu-platform-prod"
    error_message = "Wrong production project."
  }
}
variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "Wrong production region."
  }
}
variable "application_service_name" {
  type    = string
  default = "orgmaster-prod"
  validation {
    condition     = var.application_service_name == "orgmaster-prod"
    error_message = "Wrong application service."
  }
}
variable "runtime_service_account_id" {
  type    = string
  default = "orgmaster-prod-runtime"
  validation {
    condition     = var.runtime_service_account_id == "orgmaster-prod-runtime"
    error_message = "Wrong runtime identity."
  }
}
variable "release_repository_id" {
  type    = string
  default = "orgmaster-release"
  validation {
    condition     = var.release_repository_id == "orgmaster-release"
    error_message = "Wrong release repository."
  }
}
variable "release_bucket_name" {
  type    = string
  default = "jenfu-platform-prod-orgmaster-release"
  validation {
    condition     = var.release_bucket_name == "jenfu-platform-prod-orgmaster-release"
    error_message = "Wrong release bucket."
  }
}
variable "workload_identity_pool_id" {
  type    = string
  default = "jenfu-prod-release"
}
variable "github_repository_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "Use provider-readback numeric repository id."
  }
}
variable "github_repository_owner_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_owner_id))
    error_message = "Use provider-readback numeric owner id."
  }
}
variable "controller_image_digest" {
  type     = string
  nullable = true
  default  = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-prod/orgmaster-release/orgmaster-abort-controller@sha256:[a-f0-9]{64}$", coalesce(var.controller_image_digest, "")))
    error_message = "APP_INFRA_B requires an immutable controller digest."
  }
}
variable "incident_runtime_enabled" {
  type    = bool
  default = false
}

variable "github_read_token_secret_version" {
  type     = string
  nullable = true
  default  = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^[1-9][0-9]*$", coalesce(var.github_read_token_secret_version, "")))
    error_message = "Stage B requires an exact numeric GitHub read-token Secret version."
  }
}
variable "migration_service_account_id" {
  type    = string
  default = "orgmaster-prod-migrator"
}
variable "cloud_sql_connection_name" {
  type    = string
  default = "jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg"
  validation {
    condition     = var.cloud_sql_connection_name == "jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg"
    error_message = "Wrong production Cloud SQL instance."
  }
}
variable "migration_runner_image_digest" {
  type     = string
  nullable = true
  default  = null
  validation {
    condition     = !var.incident_runtime_enabled || can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-prod/orgmaster-release/orgmaster-migration-runner@sha256:[a-f0-9]{64}$", coalesce(var.migration_runner_image_digest, "")))
    error_message = "APP_INFRA_B requires the exact immutable migration runner image."
  }
}
variable "approved_notification_email" {
  description = "S2-approved destination; never inferred from the logged-in actor."
  type        = string
  sensitive   = true
  nullable    = true
  default     = null
  validation {
    condition     = !var.incident_runtime_enabled || (var.approved_notification_email != null && length(var.approved_notification_email) > 3)
    error_message = "APP_INFRA_B requires the approved notification destination."
  }
}
