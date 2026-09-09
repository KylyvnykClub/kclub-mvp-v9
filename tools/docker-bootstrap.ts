/**
 * What the container's database needs before the application serves a request
 * (docker-compose.yml).
 *
 * Three steps, all idempotent, so the entrypoint can run this on every start:
 * apply the migrations, mark the database `dev` (ADR 0026), and seed the
 * fixtures the e2e harness uses when the database is still empty.
 *
 * It talks to PostgreSQL over plain TCP with `pg`, not through `src/data/db`:
 * that module's driver reaches this server through the WebSocket proxy, which
 * is a dependency this script does not need and would have to wait for.
 *
 * Not guarded by `assertDatabaseEnvironment` for the same reason
 * `tools/e2e-env.ts` is not: the database it opens is a container that this
 * stack created and destroys with `docker compose down -v`. It refuses outright
 * to touch one that says `production`.
 */

import { join } from "node:path";
import pg from "pg";

import { runMigrations } from "../tests/setup/migrations";
import { E2E, seedE2eFixtures } from "../tests/e2e/fixtures/seed";

const databaseUrl =
  process.env["DATABASE_URL_DIRECT"] ?? process.env["DATABASE_URL"];

if (!databaseUrl) {
  console.error("[bootstrap] DATABASE_URL is not set");
  process.exit(1);
}

const authSecret = process.env["BETTER_AUTH_SECRET"];

if (!authSecret) {
  console.error("[bootstrap] BETTER_AUTH_SECRET is not set");
  process.exit(1);
}

/**
 * Whether the schema is already here.
 *
 * `runMigrations` replays every file in `db/migrations` unconditionally - it
 * was written for a database that Testcontainers threw away afterwards, and
 * `create table` on the second run is an error, not a no-op. The container's
 * database outlives a restart, so the replay happens once, against an empty
 * one. A migration added later reaches this stack through
 * `docker compose down -v`, which is also how the e2e harness gets a schema:
 * from zero.
 */
async function schemaExists(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query<{ present: boolean }>(
    `select to_regclass('public.members') is not null as present`,
  );
  return rows[0]?.present === true;
}

async function refuseProduction(client: pg.Client): Promise<void> {
  const { rows: table } = await client.query<{ present: boolean }>(
    `select to_regclass('public.database_environment') is not null as present`,
  );
  // A database with no marker table has not been migrated yet, so there is
  // nothing it could be but empty.
  if (table[0]?.present !== true) return;

  const { rows } = await client.query<{ name: string }>(
    `select name from database_environment limit 1`,
  );
  const marker = rows[0]?.name;

  if (marker === "production") {
    throw new Error(
      "this database is marked production - the docker stack will not touch it",
    );
  }
}

async function main(): Promise<void> {
  const probe = new pg.Client({ connectionString: databaseUrl });
  await probe.connect();
  let alreadyRaised: boolean;
  try {
    await refuseProduction(probe);
    alreadyRaised = await schemaExists(probe);
  } finally {
    await probe.end();
  }

  if (alreadyRaised) {
    console.log(
      "[bootstrap] schema is already here; " +
        "`docker compose down -v` rebuilds it from the migrations",
    );
  } else {
    console.log("[bootstrap] applying migrations...");
    await runMigrations(databaseUrl!, join(process.cwd(), "db", "migrations"));
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let seeded: boolean;
  try {
    await client.query(
      `insert into database_environment (singleton, name, marked_by)
       values (true, 'dev', 'docker-compose')
       on conflict (singleton) do nothing`,
    );

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from members`,
    );
    seeded = rows[0]?.count !== "0";
  } finally {
    await client.end();
  }

  if (seeded) {
    console.log("[bootstrap] members already exist; leaving the data alone");
    return;
  }

  console.log("[bootstrap] seeding fixtures...");
  const fixtures = await seedE2eFixtures(databaseUrl!, authSecret!);

  console.log(
    `[bootstrap] seeded member ${E2E.memberPhone} and VIP ${E2E.vipPhone}, ` +
      `password "${E2E.password}", card token ${fixtures.cardToken}`,
  );
}

main().catch((error: unknown) => {
  console.error("[bootstrap] failed", error);
  process.exit(1);
});
