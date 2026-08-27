import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://checkout.stripe.com",
      "object-src 'none'",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,

  /**
   * Where the build output goes. `.next` unless NEXT_BUILD_DIR says otherwise.
   *
   * `pnpm verify` sets it, because `next build` writing into `.next` is the
   * same directory `next dev` is serving from: running verify while a dev
   * server is up replaces the chunks that server has already resolved, and the
   * next page load dies with `Cannot find module './vendor-chunks/...'`. That
   * reads like a broken dependency and is not one, and recovering costs a stop,
   * an rm -rf and a cold compile.
   *
   * Unset everywhere else, so Vercel and a plain `pnpm build` keep writing to
   * `.next` exactly as before.
   */
  distDir: process.env.NEXT_BUILD_DIR || ".next",

  // A type or lint error must fail the build, not be deferred to CI and then
  // ignored. Next.js defaults both of these to false; they are set explicitly
  // so nobody has to remember that the default is the safe one.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // docs/security.md §6: the member area and the staff console are never
  // cached, never framed, and never sent as a referrer to a third party.
  // Per-route headers arrive with the routes; these are the floor.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const nextConfig = withNextIntl(config);
const sentryEnabled = Boolean(
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      // Suppresses source map uploading logs during build
      silent: true,

      // Hides source maps from generated client bundles
      sourcemaps: {
        disable: true,
      },

      // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      tunnelRoute: "/monitoring",

      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : nextConfig;
