# ──────────────────────────────────────────────────────────────
# Vercel Project
# ──────────────────────────────────────────────────────────────

resource "vercel_project" "app" {
  name      = var.project_name
  framework = "nextjs"

  git_repository = {
    type              = "github"
    repo              = "KylyvnykClub/kclub-mvp-v9"
    production_branch = "main"
  }

  build_command    = "pnpm build"
  install_command  = "pnpm install --frozen-lockfile"
  output_directory = ".next"

  serverless_function_region = "iad1"
}

# ── Domains ───────────────────────────────────────────────────

resource "vercel_project_domain" "apex" {
  project_id = vercel_project.app.id
  domain     = var.primary_domain
}

resource "vercel_project_domain" "www" {
  project_id   = vercel_project.app.id
  domain       = "www.${var.primary_domain}"
  redirect     = var.primary_domain
  redirect_status_code = 308
}

resource "vercel_project_domain" "admin" {
  project_id = vercel_project.app.id
  domain     = "admin.${var.primary_domain}"
}

resource "vercel_project_domain" "card" {
  project_id = vercel_project.app.id
  domain     = "card.${var.primary_domain}"
}

# ── Environment Variables (wired from other providers) ────────

resource "vercel_project_environment_variable" "database_url" {
  project_id = vercel_project.app.id
  key        = "DATABASE_URL"
  value      = neon_project.main.connection_uri
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "database_url_direct" {
  project_id = vercel_project.app.id
  key        = "DATABASE_URL_DIRECT"
  value      = neon_project.main.connection_uri
  target     = ["production"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "upstash_redis_rest_url" {
  project_id = vercel_project.app.id
  key        = "UPSTASH_REDIS_REST_URL"
  value      = "https://${upstash_redis_database.main.endpoint}"
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "upstash_redis_rest_token" {
  project_id = vercel_project.app.id
  key        = "UPSTASH_REDIS_REST_TOKEN"
  value      = upstash_redis_database.main.rest_token
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "r2_bucket_name" {
  project_id = vercel_project.app.id
  key        = "R2_BUCKET_NAME"
  value      = cloudflare_r2_bucket.media.name
  target     = ["production", "preview"]
  sensitive  = false
}
