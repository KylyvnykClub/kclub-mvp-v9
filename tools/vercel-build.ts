/**
 * The production build, with the migrations in front of it.
 *
 * `docs/data-storage.md` §3 says a migration is applied by the deployment
 * pipeline, as an explicit step **before** the new version receives traffic,
 * against the database the old version is still using — and that nobody runs
 * one in production by hand. Until now no such step existed for production:
 * preview branches were migrated by `.github/workflows/preview.yml` and
 * production was left to somebody with the connection string in their
 * clipboard, which is the thing the document forbids.
 *
 * A Vercel build is exactly that step. It runs with the Production environment
 * injected — including `DATABASE_URL_DIRECT`, whose value stays unreadable to
 * people — and it finishes before the deployment is promoted, so the old
 * version is still serving while the schema changes underneath it. That is why
 * every migration must stay additive (§3's expand/migrate/contract rule): the
 * previous version keeps running against the new schema for the length of the
 * build.
 *
 * Nothing is applied twice. `drizzle-kit migrate` records every file it has
 * applied in the database itself and skips those on the next run, so a rebuild,
 * a redeploy and a rollback-then-forward all leave the schema where it was.
 *
 * A failed migration fails the build, and a failed build is never promoted —
 * so a broken schema change cannot reach traffic.
 *
 * Only production. Preview deployments get their own Neon branch, already
 * migrated by the pull-request workflow; a preview build migrating whatever
 * database its environment happens to name is how a preview quietly writes to
 * production.
 */

import { spawnSync } from "node:child_process";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const vercelEnv = process.env["VERCEL_ENV"] ?? "unset";

if (vercelEnv === "production") {
  console.log("[build] applying migrations before this version takes traffic");
  run("pnpm", ["exec", "drizzle-kit", "migrate"]);
} else {
  console.log(
    `[build] VERCEL_ENV=${vercelEnv}: migrations are not this build's job`,
  );
}

run("pnpm", ["exec", "next", "build"]);
