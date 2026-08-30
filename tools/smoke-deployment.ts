import { pathToFileURL } from "node:url";

export type SmokeTarget = {
  name: string;
  path: string;
  expectedStatuses: number[];
};

export const DEPLOYMENT_SMOKE_TARGETS = [
  { name: "live health", path: "/health/live", expectedStatuses: [200] },
  { name: "ready health", path: "/health/ready", expectedStatuses: [200] },
  { name: "home", path: "/en", expectedStatuses: [200] },
  { name: "login", path: "/en/login", expectedStatuses: [200] },
  { name: "register", path: "/en/register", expectedStatuses: [200] },
  { name: "legal index", path: "/en/legal", expectedStatuses: [200] },
  { name: "directory", path: "/en/directory", expectedStatuses: [200] },
  {
    name: "member dashboard gate",
    path: "/en/dashboard/profile",
    expectedStatuses: [200, 302, 307, 308],
  },
] satisfies SmokeTarget[];

export function normalizeBaseUrl(value: string): URL {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function smokeUrl(baseUrl: URL, path: string): string {
  return new URL(path, baseUrl).toString();
}

async function checkTarget(baseUrl: URL, target: SmokeTarget) {
  const startedAt = performance.now();
  const response = await fetch(smokeUrl(baseUrl, target.path), {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  return {
    ...target,
    status: response.status,
    ok: target.expectedStatuses.includes(response.status),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

export interface SmokeArgs {
  baseUrl: string | undefined;
  /** From --expect-database-environment <name>; undefined when not asked. */
  expectDatabaseEnvironment: string | undefined;
}

export function parseSmokeArgs(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): SmokeArgs {
  const positional: string[] = [];
  let expectDatabaseEnvironment: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--expect-database-environment") {
      expectDatabaseEnvironment = argv[i + 1];
      i++;
    } else {
      positional.push(arg);
    }
  }
  return {
    baseUrl: positional[0] ?? env["SMOKE_BASE_URL"],
    expectDatabaseEnvironment,
  };
}

/**
 * The `environment` the database check on `/health/ready` reports
 * (ADR 0026), or undefined when the body does not carry one — an older
 * deployment, or a failed check.
 */
export function databaseEnvironmentOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const checks = (body as { checks?: unknown }).checks;
  if (!Array.isArray(checks)) return undefined;
  const database = checks.find(
    (check): check is { name: string; environment?: unknown } =>
      typeof check === "object" &&
      check !== null &&
      (check as { name?: unknown }).name === "database",
  );
  return typeof database?.environment === "string"
    ? database.environment
    : undefined;
}

async function checkDatabaseEnvironment(
  baseUrl: URL,
  expected: string,
): Promise<boolean> {
  const response = await fetch(smokeUrl(baseUrl, "/health/ready"), {
    signal: AbortSignal.timeout(10_000),
  });
  const actual = databaseEnvironmentOf(await response.json());
  const ok = actual === expected;
  console.log(
    `[${ok ? "ok" : "fail"}] database environment: ${actual ?? "(not reported)"} (expected ${expected})`,
  );
  return ok;
}

async function main() {
  const args = parseSmokeArgs(process.argv.slice(2), process.env);

  if (!args.baseUrl) {
    throw new Error(
      "Usage: pnpm smoke:deployment https://preview-or-prod-url [--expect-database-environment production]",
    );
  }

  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const results = await Promise.all(
    DEPLOYMENT_SMOKE_TARGETS.map((target) => checkTarget(baseUrl, target)),
  );

  for (const result of results) {
    const expected = result.expectedStatuses.join("/");
    const label = result.ok ? "ok" : "fail";
    console.log(
      `[${label}] ${result.name}: ${result.status} in ${result.latencyMs}ms (expected ${expected})`,
    );
  }

  let environmentOk = true;
  if (args.expectDatabaseEnvironment) {
    environmentOk = await checkDatabaseEnvironment(
      baseUrl,
      args.expectDatabaseEnvironment,
    );
  }

  if (results.some((result) => !result.ok) || !environmentOk) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
