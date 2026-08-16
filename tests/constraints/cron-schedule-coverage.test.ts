import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Constraint: every cron route is actually scheduled.
 *
 * A route under `src/app/api/cron/` that no schedule invokes is the worst kind
 * of dead code: it exists, it is tested, it reads as done, and in production it
 * never runs. `/api/cron/referrals` was exactly that - written for FR-077,
 * absent from `vercel.json`, so delivered referrals never expired and the
 * client contact details they hold were never deleted.
 *
 * Nothing failed. That is why this suite exists.
 */

const CRON_DIR = join(process.cwd(), "src/app/api/cron");

type VercelConfig = { crons?: { path: string; schedule: string }[] };

function cronRoutePaths(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(CRON_DIR, entry.name, "route.ts")),
    )
    .map((entry) => `/api/cron/${entry.name}`)
    .sort();
}

function scheduled(): { path: string; schedule: string }[] {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
  ) as VercelConfig;

  return config.crons ?? [];
}

describe("constraint: every cron route is scheduled", () => {
  it("finds cron routes to check", () => {
    expect(cronRoutePaths().length).toBeGreaterThan(0);
  });

  it("schedules every route that exists", () => {
    const scheduledPaths = new Set(scheduled().map((cron) => cron.path));
    const unscheduled = cronRoutePaths().filter(
      (path) => !scheduledPaths.has(path),
    );

    expect(
      unscheduled,
      `cron routes that nothing invokes: ${unscheduled.join(", ")}`,
    ).toHaveLength(0);
  });

  it("does not schedule a path with no route behind it", () => {
    const routes = new Set(cronRoutePaths());
    const orphans = scheduled()
      .map((cron) => cron.path)
      .filter((path) => !routes.has(path));

    expect(
      orphans,
      `scheduled paths with no route: ${orphans.join(", ")}`,
    ).toHaveLength(0);
  });

  it("gives every schedule five cron fields", () => {
    for (const cron of scheduled()) {
      expect(
        cron.schedule.trim().split(/\s+/),
        `${cron.path} has a malformed schedule: ${cron.schedule}`,
      ).toHaveLength(5);
    }
  });

  it("schedules each path once, so two entries cannot disagree", () => {
    const paths = scheduled().map((cron) => cron.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  describe("proved to fail", () => {
    it("detects a route that no schedule invokes", () => {
      const scheduledPaths = new Set(scheduled().map((cron) => cron.path));
      const withUnscheduled = [...cronRoutePaths(), "/api/cron/forgotten"];

      const unscheduled = withUnscheduled.filter(
        (path) => !scheduledPaths.has(path),
      );

      expect(unscheduled).toEqual(["/api/cron/forgotten"]);
    });
  });
});
