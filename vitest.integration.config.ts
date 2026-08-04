import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    name: "integration",
    include: ["src/**/*.integration.test.ts", "tests/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    maxWorkers: 1,
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/integration-setup.ts"],
  },
});
