# ──────────────────────────────────────────────────────────────
# Neon PostgreSQL
# ──────────────────────────────────────────────────────────────

resource "neon_project" "main" {
  name      = var.project_name
  region_id = var.neon_region

  default_endpoint_settings {
    autoscaling_limit_min_cu = 0.25
    autoscaling_limit_max_cu = 2
    suspend_timeout_seconds  = 300
  }
}

# The default branch created by neon_project is "main" and serves as
# the production database. Preview branches are created per-PR by the
# GitHub Action (see .github/workflows/preview.yml).

output "neon_project_id" {
  value       = neon_project.main.id
  description = "Neon project ID — used by the preview workflow to create branches."
}

output "database_url" {
  value       = neon_project.main.connection_uri
  sensitive   = true
  description = "Pooled connection string for the primary branch."
}

output "database_url_direct" {
  value       = neon_project.main.connection_uri
  sensitive   = true
  description = "Direct (non-pooled) connection string for migrations."
}
