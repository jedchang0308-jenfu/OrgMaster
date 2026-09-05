variable "project_id" {
  description = "Existing neutral non-production project."
  type        = string
  default     = "jenfu-platform-nonprod"

  validation {
    condition     = var.project_id == "jenfu-platform-nonprod"
    error_message = "DEV-010 N1C OrgMaster is fixed to jenfu-platform-nonprod."
  }
}

variable "region" {
  description = "Existing shared staging region."
  type        = string
  default     = "asia-east1"

  validation {
    condition     = var.region == "asia-east1"
    error_message = "DEV-010 N1C OrgMaster is fixed to asia-east1."
  }
}

variable "iac_service_account_email" {
  description = "Keyless deployment identity; never a runtime or migration identity."
  type        = string
}

variable "foundation_connection_name" {
  description = "Content-addressed output from the Platform foundation state."
  type        = string
  default     = "jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg"

  validation {
    condition     = var.foundation_connection_name == "jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg"
    error_message = "Unexpected Cloud SQL foundation connection."
  }
}

variable "foundation_manifest_sha256" {
  description = "SHA-256 of the reviewed Platform foundation output manifest."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.foundation_manifest_sha256))
    error_message = "foundation_manifest_sha256 must be SHA-256."
  }
}

variable "migration_image" {
  description = "OrgMaster migration image pinned by Artifact Registry digest."
  type        = string

  validation {
    condition     = can(regex("^asia-east1-docker\\.pkg\\.dev/jenfu-platform-nonprod/dev010-n1c/orgmaster-migration@sha256:[0-9a-f]{64}$", var.migration_image))
    error_message = "migration_image must be the exact N1C Artifact Registry repository and an immutable digest."
  }
}

variable "source_revision" {
  description = "Clean committed OrgMaster candidate HEAD."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be a Git SHA-1."
  }
}

variable "migration_service_account_email" {
  description = "Existing staging-only OrgMaster migrator from the Platform foundation state."
  type        = string
  default     = "dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com"

  validation {
    condition     = var.migration_service_account_email == "dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com"
    error_message = "Unexpected OrgMaster migration identity."
  }
}

variable "enable_job" {
  description = "Provider re-entry gate. False keeps the app state source-only."
  type        = bool
  default     = false
}
