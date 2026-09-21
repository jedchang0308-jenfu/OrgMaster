variable "project_id" {
  type    = string
  default = "jenfu-platform-prod"
  validation {
    condition     = var.project_id == "jenfu-platform-prod"
    error_message = "Wrong production project."
  }
}

variable "runtime_service_account_id" {
  type    = string
  default = "orgmaster-prod-runtime"
  validation {
    condition     = var.runtime_service_account_id == "orgmaster-prod-runtime"
    error_message = "Wrong OrgMaster runtime identity."
  }
}

variable "dwd_service_account_id" {
  type    = string
  default = "orgmaster-prod-directory-dwd"
  validation {
    condition     = var.dwd_service_account_id == "orgmaster-prod-directory-dwd"
    error_message = "Wrong Directory DWD signer identity."
  }
}

variable "project_number" {
  type    = string
  default = "9536592944"
  validation {
    condition     = var.project_number == "9536592944"
    error_message = "Wrong production project number."
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

variable "source_revision" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be an exact Git commit."
  }
}

variable "foundation_manifest_sha256" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.foundation_manifest_sha256))
    error_message = "foundation_manifest_sha256 must be an exact receipt hash."
  }
}

variable "operator_email" {
  type    = string
  default = "jedchang0308@jenfu.com.tw"
  validation {
    condition     = var.operator_email == "jedchang0308@jenfu.com.tw"
    error_message = "Wrong protected release operator."
  }
}
