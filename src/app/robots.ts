import { MetadataRoute } from "next";
import { env } from "@/env";
import { indexingAllowedHere } from "@/lib/seo";

/**
 * Paths no crawler has a reason to fetch. Routes are locale-prefixed (/en/…,
 * /ru/…, /uk/…), so an unprefixed "/dashboard/" pattern never matches; the
 * "*\/" prefix covers every locale.
 *
 * - The card page carries a member's QR token and must never be crawled even
 *   though it is unauthenticated.
 * - Join and invite links carry a secret or a member's code (ADR 0033,
 *   ADR 0042); a crawled one would be a published door.
 * - The account screens are forms with nothing to index. They are noindex in
 *   their own layouts as well, so either guard alone is enough.
 *
 * The partner application stays crawlable: it is how a business finds the way
 * in, and its layout's noindex keeps the form itself out of results.
 */
const PRIVATE_PATHS = [
  "/*/dashboard/",
  "/*/login",
  "/*/register",
  "/*/membership",
  "/*/forgot-password",
  "/*/reset-password/",
  "/*/verify-email",
  "/*/card/",
  "/*/join/",
  "/*/r/",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  const origin = env.server.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const sitemap = `${origin}/sitemap.xml`;

  // A preview deployment is a copy of the site on another host. Closed
  // outright, so it never competes with the real domain in search.
  if (!indexingAllowedHere()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_PATHS,
    },
    sitemap,
    // The canonical host, with its scheme: the apex redirects to www, and
    // this names the one crawlers should index. Only Yandex reads it; the
    // rest take the canonical from each page.
    host: origin,
  };
}
