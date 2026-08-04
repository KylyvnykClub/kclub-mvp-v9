# ──────────────────────────────────────────────────────────────
# Cloudflare — R2 bucket and DNS
# ──────────────────────────────────────────────────────────────

# ── R2 object storage (partner images) ────────────────────────

resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-media"
  location   = "ENAM"
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.media.name
}

# ── DNS records pointing to Vercel ────────────────────────────
# Vercel requires an A record for the apex domain and CNAME for subdomains.

resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  content = "76.76.21.21"
  type    = "A"
  proxied = false
  ttl     = 1
  comment = "Vercel apex — managed by Terraform"
}

resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  content = "cname.vercel-dns.com"
  type    = "CNAME"
  proxied = false
  ttl     = 1
  comment = "Vercel www redirect — managed by Terraform"
}

resource "cloudflare_record" "admin" {
  zone_id = var.cloudflare_zone_id
  name    = "admin"
  content = "cname.vercel-dns.com"
  type    = "CNAME"
  proxied = false
  ttl     = 1
  comment = "Vercel admin subdomain — managed by Terraform"
}

resource "cloudflare_record" "card" {
  zone_id = var.cloudflare_zone_id
  name    = "card"
  content = "cname.vercel-dns.com"
  type    = "CNAME"
  proxied = false
  ttl     = 1
  comment = "Vercel card subdomain — managed by Terraform"
}
