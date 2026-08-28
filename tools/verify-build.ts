/**
 * Runs `next build` into a directory of its own, for `pnpm verify`.
 *
 * `next build` and `next dev` both use `.next`. Running verify while a dev
 * server is up therefore replaces the chunks that server has already resolved,
 * and its next page load fails with `Cannot find module './vendor-chunks/...'`.
 * That reads like a broken dependency, and the only way out is to stop the
 * server, delete `.next` and pay for a cold compile.
 *
 * Verify is meant to be run often, so it must not be expensive to run. It
 * builds into `.next-verify` instead, and `next.config.ts` reads the directory
 * from NEXT_BUILD_DIR. Nothing else sets that variable, so Vercel and a plain
 * `pnpm build` are untouched.
 *
 * A wrapper rather than `NEXT_BUILD_DIR=... next build` in the script, because
 * that syntax is a parse error in the Windows shells this repository is
 * developed on, and rather than a `cross-env` dependency for one variable.
 */

import { spawn } from "node:child_process";

const BUILD_DIR = ".next-verify";

const child = spawn("next", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_BUILD_DIR: BUILD_DIR },
});

child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) {
    console.error(`next build was killed by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on("error", (error: Error) => {
  console.error(`could not start next build: ${error.message}`);
  process.exit(1);
});
