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
