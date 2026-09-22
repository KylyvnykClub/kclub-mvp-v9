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

  /**
   * Server Actions carry image uploads, and Next.js caps their body at 1MB by
   * default - well under the 5MB `MAX_IMAGE_UPLOAD_BYTES` the image pipeline
   * validates against. A phone photo sits between the two, so the request was
   * rejected in transport before the action ran, the rejection surfaced inside
   * a `startTransition` callback, and the page died with "Application error: a
   * client-side exception has occurred" instead of showing "that image is over
   * 5MB".
   *
   * 6MB, not 5MB: the limit counts the whole multipart body, so the envelope
   * around a file exactly at the cap must still fit. The real ceiling stays
   * `MAX_IMAGE_UPLOAD_BYTES`, enforced server-side on the decoded bytes and
   * checked client-side before anything is sent.
   */
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },

  /**
   * No persistent webpack cache in `next dev`.
   *
   * On this Windows machine the filesystem cache under `.next/cache/webpack`
   * and the on-demand route compiler race each other: two tabs hitting two
   * not-yet-compiled routes within the same second leave `.next/server/
   * vendor-chunks/*.js` half-written, and every page then dies with
   * `Cannot find module './vendor-chunks/...'` until `.next` is wiped and the
   * server cold-started. It happened four times in one day. Memory caching
   * keeps HMR fast within a running server; what is lost is only the warm
   * start across restarts, which is cheaper than the recovery this replaces.
   *
   * Production builds are untouched: `dev` is false there and the default
   * filesystem cache stays on.
   */
  webpack(webpackConfig, { dev }) {
    if (dev) {
      webpackConfig.cache = { type: "memory" };
    }
    return webpackConfig;
  },

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
