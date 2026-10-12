import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // tsconfig keeps JSX for Next ("preserve"); a test that renders a component
  // to markup needs it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    name: "unit",
    include: ["src/**/*.test.ts", "tests/constraints/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    testTimeout: 5_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.integration.test.ts",
        "src/app/**",
      ],
    },
  },
});
