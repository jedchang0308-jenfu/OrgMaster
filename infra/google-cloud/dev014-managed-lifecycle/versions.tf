terraform {
  required_version = ">= 1.14.0, < 1.17.0"

  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.45.0"
    }
  }
}

provider "google" {
  project = local.project_id
  region  = local.region
}
