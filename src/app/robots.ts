import { MetadataRoute } from "next";
import { env } from "@/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Routes are locale-prefixed (/en/…, /ru/…, /uk/…), so an unprefixed
      // "/dashboard/" pattern never matches. The "*/" prefix covers every
      // locale. The card page carries a member's QR token and must never be
      // crawled even though it is unauthenticated.
      disallow: [
        "/*/dashboard/",
        "/*/login",
        "/*/register",
        "/*/card/",
        "/api/",
      ],
    },
    sitemap: `${env.server.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
