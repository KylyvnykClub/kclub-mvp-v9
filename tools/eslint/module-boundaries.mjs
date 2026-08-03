/**
 * Custom ESLint rules enforcing the module boundaries described in
 * docs/architecture.md §2 and CLAUDE.md.
 *
 * Three rules, three invariants:
 *
 *   kclub/no-cross-module-internals
 *     A module may import from another module's public surface (the barrel
 *     export at modules/<name>/index.ts) but never from its internal/
 *     directory. Without this, a modular monolith becomes a monolith within
 *     one sprint.
 *
 *   kclub/no-db-outside-data
 *     Database imports (drizzle-orm, @neondatabase/serverless, and the local
 *     src/data barrel) are forbidden outside src/data/**. SQL exists in
 *     exactly one layer.
 *
 *   kclub/no-framework-in-domain
 *     React, Next.js HTTP primitives, and database imports are forbidden
 *     inside src/domain/**. The domain layer knows about neither the view
 *     nor the storage engine.
 */

import { resolve, dirname } from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────

/** Normalise Windows backslashes so path checks work on every OS. */
const norm = (p) => p.replace(/\\/g, "/");

/** Extract the module name from a file path like src/modules/billing/internal/foo.ts → "billing". */
function owningModule(filename) {
  const m = norm(filename).match(/src\/modules\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * Resolve an import source to an absolute normalised path when relative,
 * so that `../billing/internal/secret` from within src/modules/identity/
 * becomes `.../src/modules/billing/internal/secret`.
 */
function resolvedSource(source, filename) {
  if (source.startsWith(".")) {
    return norm(resolve(dirname(filename), source));
  }
  return norm(source);
}

/** True when an import targets another module's internal directory. */
function isCrossModuleInternal(resolvedSrc, ownModule) {
  const match = resolvedSrc.match(/modules\/([^/]+)\/internal/);
  if (!match) return false;
  return match[1] !== ownModule;
}

// ── Rules ────────────────────────────────────────────────────────────

const noCrossModuleInternals = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid importing from another module's internal/ directory.",
    },
    messages: {
      forbidden:
        "Do not import from {{ target }}'s internals. Use the module's public barrel export instead.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const own = owningModule(filename);

    function check(node) {
      const source = node.source?.value;
      if (!source) return;
      const resolved = resolvedSource(source, filename);
      if (isCrossModuleInternal(resolved, own)) {
        const target = resolved.match(/modules\/([^/]+)/)?.[1] ?? source;
        context.report({
          node: node.source,
          messageId: "forbidden",
          data: { target },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ImportExpression(node) {
        if (node.source?.type === "Literal") {
          check({ source: node.source });
        }
      },
    };
  },
};

const DB_PACKAGES = [
  "drizzle-orm",
  "@neondatabase/serverless",
  "postgres",
  "pg",
];
const DB_LOCAL = /src\/data/;

const noDbOutsideData = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid database imports outside src/data/.",
    },
    messages: {
      forbidden:
        "Database import '{{ source }}' is only allowed inside src/data/. SQL exists in exactly one layer.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (norm(filename).includes("src/data/")) return {};

    function check(node) {
      const source = node.source?.value;
      if (!source) return;
      const n = norm(source);
      const resolved = resolvedSource(source, filename);
      const isDbPkg = DB_PACKAGES.some(
        (pkg) => n === pkg || n.startsWith(pkg + "/"),
      );
      const isDbLocal = DB_LOCAL.test(resolved);
      if (isDbPkg || isDbLocal) {
        context.report({
          node: node.source,
          messageId: "forbidden",
          data: { source },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ImportExpression(node) {
        if (node.source?.type === "Literal") {
          check({ source: node.source });
        }
      },
    };
  },
};

const FRAMEWORK_PACKAGES = [
  "react",
  "react-dom",
  "react/",
  "react-dom/",
  "next/server",
  "next/headers",
  "next/navigation",
  "next/router",
  "next/image",
  "next/link",
  "next/font",
];

const noFrameworkInDomain = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid React and Next.js HTTP imports inside src/domain/.",
    },
    messages: {
      forbidden:
        "Framework import '{{ source }}' is forbidden in domain code. src/domain imports neither React nor HTTP.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!norm(filename).includes("src/domain/")) return {};

    function check(node) {
      const source = node.source?.value;
      if (!source) return;
      const n = norm(source);
      const resolved = resolvedSource(source, filename);
      const isFramework = FRAMEWORK_PACKAGES.some(
        (pkg) => n === pkg || n.startsWith(pkg),
      );
      const isDb =
        DB_PACKAGES.some((pkg) => n === pkg || n.startsWith(pkg + "/")) ||
        DB_LOCAL.test(resolved);

      if (isFramework || isDb) {
        context.report({
          node: node.source,
          messageId: "forbidden",
          data: { source },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ImportExpression(node) {
        if (node.source?.type === "Literal") {
          check({ source: node.source });
        }
      },
    };
  },
};

// ── Plugin export ────────────────────────────────────────────────────

export default {
  meta: { name: "eslint-plugin-kclub", version: "0.1.0" },
  rules: {
    "no-cross-module-internals": noCrossModuleInternals,
    "no-db-outside-data": noDbOutsideData,
    "no-framework-in-domain": noFrameworkInDomain,
  },
};
