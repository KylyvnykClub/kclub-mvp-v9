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

async function main() {
  const rawBaseUrl = process.argv[2] ?? process.env["SMOKE_BASE_URL"];

  if (!rawBaseUrl) {
    throw new Error("Usage: pnpm smoke:deployment https://preview-or-prod-url");
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl);
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

  if (results.some((result) => !result.ok)) {
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
