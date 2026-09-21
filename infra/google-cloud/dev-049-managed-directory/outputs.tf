output "directory_dwd" {
  value = {
    email                 = google_service_account.directory_dwd.email
    oauth2_client_id      = google_service_account.directory_dwd.unique_id
    token_creator_member  = google_service_account_iam_member.runtime_token_creator.member
    admin_directory_scope = "https://www.googleapis.com/auth/admin.directory.user.readonly"
  }
}
