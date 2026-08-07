# ──────────────────────────────────────────────────────────────
# KCLUB Infrastructure — Input Variables
# ──────────────────────────────────────────────────────────────

# ── Provider credentials ──────────────────────────────────────

variable "vercel_api_token" {
  type        = string
  sensitive   = true
  description = "Vercel API token — Settings → Tokens."
}

variable "vercel_team_id" {
  type        = string
  default     = null
  description = "Vercel team ID (null for personal account)."
}

variable "neon_api_key" {
  type        = string
  sensitive   = true
  description = "Neon API key — console.neon.tech → Account → API keys."
}

variable "upstash_email" {
  type        = string
  description = "Upstash account email."
}

variable "upstash_api_key" {
  type        = string
  sensitive   = true
  description = "Upstash Management API key."
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with DNS:Edit and R2:Admin permissions."
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for the primary domain."
}

# ── Project configuration ─────────────────────────────────────

variable "project_name" {
  type    = string
  default = "kclub-mvp"
}

variable "neon_region" {
  type    = string
  default = "aws-us-east-1"
}

variable "primary_domain" {
  type        = string
  default     = "kclub.com"
  description = "Primary domain — to be confirmed by client."
}

variable "environment" {
  type    = string
  default = "production"
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Environment must be 'production' or 'staging'."
  }
}
