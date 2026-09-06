resource "google_cloud_run_v2_job" "migration" {
  count = var.enable_job ? 1 : 0

  project             = var.project_id
  name                = local.job_name
  location            = var.region
  deletion_protection = true
  labels              = local.labels

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account       = var.migration_service_account_email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      max_retries           = 0
      timeout               = "1800s"

      vpc_access {
        egress = "ALL_TRAFFIC"
        network_interfaces {
          network    = var.foundation_network_name
          subnetwork = var.foundation_subnetwork_name
          tags       = ["orgmaster-n1c-staging-migration"]
        }
      }

      containers {
        name       = "orgmaster-migration"
        image      = var.migration_image
        command    = ["node"]
        args       = ["scripts/dev010-n1c-orgmaster-package.mjs", "--execute"]
        depends_on = ["cloud-sql-proxy"]

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name  = "DEV010_N1C_EXECUTION_ACK"
          value = "ORGMASTER_STAGING_MIGRATION"
        }
        env {
          name  = "DEV010_N1C_SOURCE_REVISION"
          value = var.source_revision
        }
        env {
          name  = "ORGMASTER_DEPLOYMENT_ENV"
          value = "staging"
        }
        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }
        env {
          name  = "GOOGLE_CLOUD_REGION"
          value = var.region
        }
        env {
          name  = "ORGMASTER_CLOUD_SQL_INSTANCE"
          value = "jenfu-platform-nonprod-pg"
        }
        env {
          name  = "ORGMASTER_CLOUD_SQL_CONNECTION_NAME"
          value = var.foundation_connection_name
        }
        env {
          name  = "ORGMASTER_POSTGRES_DATABASE"
          value = "jenfu_stg"
        }
        env {
          name  = "ORGMASTER_POSTGRES_IAM_LOGIN"
          value = "dev010-stg-orgmaster-migrator@jenfu-platform-nonprod.iam"
        }
      }

      containers {
        name  = "cloud-sql-proxy"
        image = var.cloud_sql_proxy_image
        args = [
          "--unix-socket=/cloudsql", "--private-ip", "--auto-iam-authn",
          "--lazy-refresh", "--structured-logs", "--max-connections=2",
          "--health-check", "--http-address=0.0.0.0", "--http-port=9090",
          var.foundation_connection_name,
        ]

        resources {
          limits = {
            cpu    = "1"
            memory = "256Mi"
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        startup_probe {
          initial_delay_seconds = 1
          timeout_seconds       = 2
          period_seconds        = 3
          failure_threshold     = 20
          http_get {
            path = "/startup"
            port = 9090
          }
        }
      }

      volumes {
        name = "cloudsql"
        empty_dir {
          medium = "MEMORY"
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.foundation_manifest_sha256 != sha256("")
      error_message = "A real content-addressed Platform foundation manifest is required."
    }
  }
}
