data "google_project" "target" {
  project_id = var.project_id
}

data "google_service_account" "iac" {
  project    = var.project_id
  account_id = local.iac_account
}

data "google_service_account" "qc" {
  project    = var.project_id
  account_id = local.qc_account
}

data "google_service_account" "runtime" {
  count      = var.runtime_enabled ? 1 : 0
  project    = var.project_id
  account_id = local.runtime_account
}

data "google_compute_network" "runtime" {
  count   = var.runtime_enabled ? 1 : 0
  project = var.project_id
  name    = local.network
}

data "google_compute_subnetwork" "runtime" {
  count   = var.runtime_enabled ? 1 : 0
  project = var.project_id
  region  = var.region
  name    = local.subnetwork
}

data "google_secret_manager_secret" "runtime_config" {
  count     = var.runtime_enabled ? 1 : 0
  project   = var.project_id
  secret_id = local.runtime_secret
}

resource "google_artifact_registry_repository" "orgmaster" {
  project       = var.project_id
  location      = var.region
  repository_id = local.artifact_repository
  format        = "DOCKER"
  description   = "DEV-013 OrgMaster managed staging immutable runtime images"
  labels        = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_artifact_registry_repository_iam_member" "iac_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.orgmaster.location
  repository = google_artifact_registry_repository.orgmaster.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${data.google_service_account.iac.email}"
}

resource "google_storage_bucket" "evidence" {
  project                     = var.project_id
  name                        = local.evidence_bucket
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels

  retention_policy {
    retention_period = 2592000
    is_locked        = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "iac_writer" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${data.google_service_account.iac.email}"
}

resource "google_storage_bucket_iam_member" "qc_reader" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${data.google_service_account.qc.email}"
}

resource "google_project_iam_member" "runtime_firebase_auth_viewer" {
  count   = var.runtime_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/firebaseauth.viewer"
  member  = "serviceAccount:${data.google_service_account.runtime[0].email}"
}

resource "google_cloud_run_v2_service" "orgmaster" {
  count                = var.runtime_enabled ? 1 : 0
  project              = var.project_id
  location             = var.region
  name                 = local.service_name
  ingress              = "INGRESS_TRAFFIC_ALL"
  default_uri_disabled = false
  invoker_iam_disabled = true
  deletion_protection  = true
  labels               = local.labels

  template {
    service_account                  = data.google_service_account.runtime[0].email
    timeout                          = "60s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = data.google_compute_network.runtime[0].name
        subnetwork = data.google_compute_subnetwork.runtime[0].name
      }
    }

    containers {
      name       = "orgmaster"
      image      = var.orgmaster_image
      depends_on = ["cloud-sql-proxy"]

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = local.runtime_environment
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "ORGMASTER_SESSION_HASH_PEPPER"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.runtime_config[0].secret_id
            version = var.runtime_config_secret_version
          }
        }
      }

      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }

      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 3
        period_seconds        = 5
        failure_threshold     = 24
        http_get {
          path = "/api/auth/mode"
          port = 8080
        }
      }

      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 3
        period_seconds        = 30
        failure_threshold     = 3
        http_get {
          path = "/api/auth/mode"
          port = 8080
        }
      }
    }

    containers {
      name  = "cloud-sql-proxy"
      image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f"
      args = [
        "--address=0.0.0.0",
        "--port=5432",
        "--private-ip",
        "--auto-iam-authn",
        "--lazy-refresh",
        "--structured-logs",
        "--max-connections=2",
        "${var.project_id}:${var.region}:${local.cloud_sql_instance}",
      ]
      resources {
        limits   = { cpu = "1", memory = "256Mi" }
        cpu_idle = true
      }
      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 20
        tcp_socket {
          port = 5432
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    precondition {
      condition = (
        var.runtime_enabled &&
        startswith(local.orgmaster_origin, "https://orgmaster-stg-") &&
        startswith(local.platform_origin, "https://jenfu-platform-stg-") &&
        !strcontains(local.orgmaster_origin, "-prod-") &&
        !strcontains(local.platform_origin, "-prod-")
      )
      error_message = "Only provider project-number-derived staging run.app origins are allowed."
    }
  }

  depends_on = [
    google_artifact_registry_repository.orgmaster,
    google_project_iam_member.runtime_firebase_auth_viewer,
  ]
}
