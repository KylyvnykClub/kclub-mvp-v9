import { defineConfig, devices } from "@playwright/test";

/**
 * AC-06's harness: axe over the ten screens recorded in
 * docs/delivery/production-launch-evidence.md, plus keyboard-only traversal of
 * the four flows in ux.md §3.
 *
 * The web server owns the database as well as the application (tools/e2e-env.ts)
 * so that nothing serves a request before the schema and fixtures exist.
 */

const PORT = Number(process.env["E2E_PORT"] ?? 3100);
const BASE_URL =
  process.env["PLAYWRIGHT_BASE_URL"] ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // A failing accessibility assertion is a real finding, not a flake. Retrying
  // it would only hide an intermittent one.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env["CI"]
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: process.env["PLAYWRIGHT_BASE_URL"]
    ? undefined
    : {
        command: "pnpm exec tsx tools/e2e-env.ts",
        url: BASE_URL,
        // The command builds the app first, because NEXT_PUBLIC_* are inlined
        // at build time and must carry this base URL.
        timeout: 420_000,
        reuseExistingServer: !process.env["CI"],
        stdout: "pipe",
        stderr: "pipe",
      },
});
