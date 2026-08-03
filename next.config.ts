import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

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
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
