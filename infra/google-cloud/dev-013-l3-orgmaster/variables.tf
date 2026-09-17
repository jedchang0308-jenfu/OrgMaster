variable "project_id" {
  type    = string
  default = "jenfu-platform-nonprod"
  validation {
    condition     = var.project_id == "jenfu-platform-nonprod"
    error_message = "DEV-013 OrgMaster L3 is fixed to jenfu-platform-nonprod."
  }
}

variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "DEV-013 OrgMaster L3 is fixed to asia-east1."
  }
}

variable "source_revision" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "Use the exact clean committed OrgMaster source revision."
  }
}

variable "source_tree" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_tree))
    error_message = "Use the exact Git tree for source_revision."
  }
}

variable "platform_manifest_sha256" {
  type = string
  validation {
    condition     = var.platform_manifest_sha256 == "7538ab12e02566eb9de107c592d6cbb43045f4a00bc94a969a84eae8a424d96c"
    error_message = "Use the frozen DEV-013 L3 Platform manifest SHA-256."
  }
}

variable "canonical_contract_sha256" {
  type = string
  validation {
    condition     = var.canonical_contract_sha256 == "e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483"
    error_message = "Use the frozen jenfu.sso-handoff.v1 aggregate SHA-256."
  }
}

variable "foundation_manifest_sha256" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.foundation_manifest_sha256))
    error_message = "Use the exact provider-readback DEV-010 N1C foundation manifest SHA-256."
  }
}

variable "runtime_enabled" {
  type        = bool
  description = "False for OWNER_INFRA_A; true only for source-frozen OWNER_RUNTIME_B."
}

variable "orgmaster_image" {
  type    = string
  default = null
  validation {
    condition = !var.runtime_enabled || (
      var.orgmaster_image != null &&
      can(regex("^asia-east1-docker[.]pkg[.]dev/jenfu-platform-nonprod/dev013-orgmaster-staging/orgmaster@sha256:[0-9a-f]{64}$", var.orgmaster_image))
    )
    error_message = "OWNER_RUNTIME_B requires the exact app-owned immutable image digest."
  }
}

variable "runtime_config_secret_version" {
  type    = string
  default = null
  validation {
    condition     = !var.runtime_enabled || (var.runtime_config_secret_version != null && can(regex("^[1-9][0-9]*$", var.runtime_config_secret_version)))
    error_message = "OWNER_RUNTIME_B requires an exact numeric runtime Secret version."
  }
}

variable "firebase_public_api_key" {
  type      = string
  default   = null
  sensitive = true
  validation {
    condition     = !var.runtime_enabled || (var.firebase_public_api_key != null && length(trimspace(var.firebase_public_api_key)) >= 20)
    error_message = "OWNER_RUNTIME_B requires the provider-readback non-production Firebase public API key."
  }
}

variable "firebase_public_app_id" {
  type    = string
  default = null
  validation {
    condition     = !var.runtime_enabled || (var.firebase_public_app_id != null && can(regex("^[0-9]+:[0-9]+:web:[0-9A-Za-z]+$", var.firebase_public_app_id)))
    error_message = "OWNER_RUNTIME_B requires the provider-readback non-production Firebase public app id."
  }
}

variable "firebase_public_config_sha256" {
  type    = string
  default = null
  validation {
    condition     = !var.runtime_enabled || (var.firebase_public_config_sha256 != null && can(regex("^[0-9a-f]{64}$", var.firebase_public_config_sha256)))
    error_message = "OWNER_RUNTIME_B requires the source-frozen Firebase public config SHA-256."
  }
}
