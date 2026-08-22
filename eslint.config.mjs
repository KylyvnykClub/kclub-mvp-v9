import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

import kclub from "./tools/eslint/module-boundaries.mjs";

/**
 * Flat config.
 *
 * The plugins are wired individually rather than through `eslint-config-next`,
 * which still loads @rushstack/eslint-patch and fails outright on ESLint 9 flat
 * config. Taking the plugins directly also makes the accessibility and React
 * rules visible here instead of inherited from a wrapper - and docs/ux.md §8
 * commits to WCAG 2.1 AA, which is not a thing to inherit silently.
 *
 * Module-boundary rules (T-0.7) live in tools/eslint/module-boundaries.mjs.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-stale-*/**",
      "next-env.d.ts",
      "coverage/**",
      "docs/**",
      "public/sw.js",
      // Claude Design canvas mockups (.dc.html prototypes + their runtime) -
      // design references, not application code.
      "src/admin/**",
      // Playwright output, regenerated on every run.
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  security.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs["recommended-latest"],

  {
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // docs/technology.md §3: "`any` is a lint error, not a style preference".
      "@typescript-eslint/no-explicit-any": "error",

      // An unawaited promise in a Server Action is a write that may never
      // happen, and nothing observes it. This is the failure mode described in
      // docs/testing.md §1 as "something silently stops".
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Unused code is either a mistake or a leftover. Prefixing with _ is the
      // way to say "deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // console.log in a server component ships to the platform log with no
      // structure and no redaction. docs/observability.md defines how to log.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // ── Module boundary rules (T-0.7, docs/architecture.md §2) ────────
  {
    plugins: { kclub },
    rules: {
      "kclub/no-cross-module-internals": "error",
      "kclub/no-db-outside-data": "error",
      "kclub/no-framework-in-domain": "error",
      "kclub/no-non-async-export-in-use-server": "error",
    },
  },

  {
    // Configuration files run outside the typed project.
    files: ["*.config.{js,mjs,ts}", "tools/**"],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    // Infrastructure scripts may use database and console APIs directly.
    files: ["tools/**"],
    rules: {
      "kclub/no-db-outside-data": "off",
      "no-console": "off",
    },
  },

  {
    // Test files and test infrastructure.
    files: ["**/*.test.ts", "tests/**"],
    rules: {
      "kclub/no-db-outside-data": "off",
      "no-console": "off",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
);
