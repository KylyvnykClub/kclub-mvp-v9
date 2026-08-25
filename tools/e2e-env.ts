import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, Network } from "testcontainers";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runMigrations } from "../tests/setup/migrations";
import { startFakeUpstash } from "../tests/e2e/fake-upstash";
import { seedE2eFixtures } from "../tests/e2e/fixtures/seed";

/**
 * Brings up everything the e2e suite needs, then serves the application.
 *
 * This is Playwright's `webServer.command`, and it deliberately owns the
 * database as well as the server. Playwright's webServer is a plugin and its
 * ordering relative to globalSetup is not something to depend on - doing both
 * here means there is no order to get wrong: nothing serves a request until the
 * schema exists and the fixtures are committed.
 *
 * It writes .playwright/e2e-env.json so the specs know the connection string
 * and the fixture ids without guessing.
 */

const PORT = Number(process.env["E2E_PORT"] ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MANIFEST = join(process.cwd(), ".playwright", "e2e-env.json");

/**
 * Values that only have to be present and well-shaped. The suite never reaches
 * Stripe: no test in it starts a checkout, and a key that is obviously not real
 * is better than one that might be.
 */
const PLACEHOLDER_ENV = {
  BETTER_AUTH_SECRET: "e2e-harness-auth-secret-not-a-real-secret",
  STRIPE_SECRET_KEY: "sk_e2e_harness_not_a_real_key",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_harness_not_a_real_key",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_e2e_harness_not_a_real_key",
  NEXT_PUBLIC_APP_URL: BASE_URL,
  BETTER_AUTH_URL: BASE_URL,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
} as const;

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
  });
}

async function main(): Promise<void> {
  console.log("[e2e] starting PostgreSQL...");
  const network = await new Network().start();
  const container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("kclub_e2e")
    .withUsername("test")
    .withPassword("test")
    .withNetwork(network)
    .withNetworkAliases("postgres")
    .start();

  // Two views of the same database. Migrations and seeding run from the host
  // over plain TCP; the application reaches it through the proxy below, under
  // the alias the proxy can resolve on the shared network.
  const databaseUrl = container.getConnectionUri();
  const appDatabaseUrl = "postgresql://test:test@postgres:5432/kclub_e2e";

  console.log("[e2e] starting the Neon WebSocket proxy...");
  const proxy = await new GenericContainer(
    "ghcr.io/neondatabase/wsproxy:latest",
  )
    .withNetwork(network)
    .withExposedPorts(80)
    .withEnvironment({
      APPEND_PORT: "postgres:5432",
      ALLOW_ADDR_REGEX: ".*",
      LOG_TRAFFIC: "false",
    })
    .start();
  const wsProxy = `${proxy.getHost()}:${proxy.getMappedPort(80)}/v1`;

  console.log("[e2e] applying migrations...");
  await runMigrations(databaseUrl, join(process.cwd(), "db", "migrations"));

  console.log("[e2e] seeding fixtures...");
  const fixtures = await seedE2eFixtures(
    databaseUrl,
    PLACEHOLDER_ENV.BETTER_AUTH_SECRET,
  );

  console.log("[e2e] starting the Upstash stand-in...");
  const upstash = await startFakeUpstash();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...PLACEHOLDER_ENV,
    DATABASE_URL: appDatabaseUrl,
    DATABASE_URL_DIRECT: appDatabaseUrl,
    NEON_WS_PROXY: wsProxy,
    UPSTASH_REDIS_REST_URL: upstash.url,
    UPSTASH_REDIS_REST_TOKEN: "e2e",
    PORT: String(PORT),
  };

  await mkdir(join(process.cwd(), ".playwright"), { recursive: true });
  await writeFile(
    MANIFEST,
    JSON.stringify({ baseUrl: BASE_URL, databaseUrl, ...fixtures }, null, 2),
  );

  // NEXT_PUBLIC_* are inlined at build time, so the build has to see the same
  // base URL the server will answer on - the production incident where card QR
  // codes encoded localhost came from exactly this property.
  if (process.env["E2E_SKIP_BUILD"] !== "1") {
    console.log("[e2e] building...");
    await run("pnpm", ["exec", "next", "build"], {
      ...env,
      KCLUB_SKIP_DB_PRERENDER: "1",
    });
  }

  console.log(`[e2e] serving on ${BASE_URL}`);
  const server = spawn(
    "pnpm",
    ["exec", "next", "start", "--port", String(PORT)],
    {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  const shutdown = async () => {
    server.kill();
    await upstash.close().catch(() => undefined);
    await proxy.stop().catch(() => undefined);
    await container.stop().catch(() => undefined);
    await network.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  server.on("exit", (code) => {
    void upstash.close().catch(() => undefined);
    void proxy.stop().catch(() => undefined);
    void container.stop().catch(() => undefined);
    void network.stop().catch(() => undefined);
    process.exit(code ?? 0);
  });
}

main().catch((error: unknown) => {
  console.error("[e2e] environment failed to start:", error);
  process.exit(1);
});
