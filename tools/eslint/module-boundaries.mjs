/**
 * Custom ESLint rules enforcing the module boundaries described in
 * docs/architecture.md §2 and CLAUDE.md.
 *
 * Four rules, four invariants:
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
 *
 *   kclub/no-non-async-export-in-use-server
 *     A "use server" file may export async functions and nothing else -
 *     every named export becomes a callable server endpoint. The Next.js
 *     compiler enforces this, but only during `next build`, which
 *     `pnpm verify` does not run: a shared constant exported from
 *     src/actions/company.ts broke main and no local gate saw it.
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

/** True when the file opens with a top-level "use server" directive. */
function hasUseServerDirective(programNode) {
  for (const statement of programNode.body) {
    if (
      statement.type !== "ExpressionStatement" ||
      statement.expression?.type !== "Literal" ||
      typeof statement.expression.value !== "string"
    ) {
      return false; // directive prologue is over
    }
    if (statement.expression.value === "use server") return true;
  }
  return false;
}

/** True for `async function` / `async () => {}` / `async function () {}`. */
function isAsyncFunction(node) {
  return (
    node?.async === true &&
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression")
  );
}

/**
 * Declarations that vanish before the compiler sees them. Exporting a type
 * from a "use server" file is legal because nothing is exported at runtime.
 */
const ERASED_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSDeclareFunction",
  "TSModuleDeclaration",
]);

const noNonAsyncExportInUseServer = {
  meta: {
    type: "problem",
    docs: {
      description: 'Forbid non-async exports from a "use server" file.',
    },
    messages: {
      forbidden:
        'Only async functions may be exported from a "use server" file, and {{ name }} is not one. Move it to a plain module and import it from both sides.',
    },
    schema: [],
  },
  create(context) {
    let active = false;
    /** Top-level name → is it bound to an async function. */
    const topLevelAsync = new Map();

    function report(node, name) {
      context.report({ node, messageId: "forbidden", data: { name } });
    }

    return {
      Program(node) {
        active = hasUseServerDirective(node);
        if (!active) return;

        for (const statement of node.body) {
          const decl =
            statement.type === "ExportNamedDeclaration"
              ? statement.declaration
              : statement;
          if (decl?.type === "FunctionDeclaration" && decl.id) {
            topLevelAsync.set(decl.id.name, decl.async === true);
          } else if (decl?.type === "VariableDeclaration") {
            for (const d of decl.declarations) {
              if (d.id.type === "Identifier") {
                topLevelAsync.set(d.id.name, isAsyncFunction(d.init));
              }
            }
          }
        }
      },

      ExportNamedDeclaration(node) {
        if (!active || node.exportKind === "type") return;

        const decl = node.declaration;

        if (!decl) {
          // `export { a, b }` - a re-export from another file says nothing
          // about what it holds, so only local bindings are judged.
          if (node.source) return;
          for (const spec of node.specifiers) {
            if (spec.exportKind === "type") continue;
            const known = topLevelAsync.get(spec.local?.name);
            if (known === false) report(spec, spec.local.name);
          }
          return;
        }

        if (ERASED_DECLARATIONS.has(decl.type)) return;

        if (decl.type === "FunctionDeclaration") {
          if (!decl.async) report(decl.id ?? decl, decl.id?.name ?? "it");
          return;
        }

        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (!isAsyncFunction(d.init)) {
              report(d, d.id.type === "Identifier" ? d.id.name : "it");
            }
          }
          return;
        }

        if (decl.type === "TSEnumDeclaration") {
          report(decl.id ?? decl, decl.id?.name ?? "it");
        }
      },

      ExportDefaultDeclaration(node) {
        if (!active || node.exportKind === "type") return;
        if (ERASED_DECLARATIONS.has(node.declaration?.type)) return;
        if (!isAsyncFunction(node.declaration)) {
          report(node.declaration ?? node, "the default export");
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
    "no-non-async-export-in-use-server": noNonAsyncExportInUseServer,
  },
};
