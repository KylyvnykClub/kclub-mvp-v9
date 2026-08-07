# ──────────────────────────────────────────────────────────────
# Upstash Redis (rate limiting, cache)
# ──────────────────────────────────────────────────────────────

resource "upstash_redis_database" "main" {
  database_name = var.project_name
  region        = "us-east-1"
  tls           = true
  eviction      = true
}

output "upstash_redis_rest_url" {
  value       = "https://${upstash_redis_database.main.endpoint}"
  sensitive   = true
  description = "Upstash Redis REST URL."
}

output "upstash_redis_rest_token" {
  value       = upstash_redis_database.main.rest_token
  sensitive   = true
  description = "Upstash Redis REST token."
}
