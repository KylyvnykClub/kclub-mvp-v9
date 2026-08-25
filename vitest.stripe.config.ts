import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * AC-03's billing rehearsal, kept out of `pnpm test:integration` on purpose.
 *
 * It talks to real Stripe test mode and advances a test clock, so a single run
 * costs minutes of wall clock rather than seconds, and it needs a test-mode
 * secret key that CI does not currently hold. Run it with
 * `pnpm test:stripe-lifecycle`.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    name: "stripe-lifecycle",
    include: ["tests/**/*.stripe.test.ts"],
    // A clock advance settles in tens of seconds; a whole lifecycle is minutes.
    testTimeout: 600_000,
    hookTimeout: 300_000,
    pool: "forks",
    maxWorkers: 1,
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: [
      "tests/setup/stripe-env.ts",
      "tests/setup/integration-setup.ts",
    ],
  },
});
