import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Neon's driver speaks the Postgres protocol over a WebSocket to Neon's own
 * endpoint, so it cannot talk to a plain PostgreSQL server. The e2e harness
 * needs a throwaway database, and pointing it at a second driver would mean the
 * suite exercised a connection path production never uses - a fault in the real
 * one would pass every accessibility run.
 *
 * Setting NEON_WS_PROXY routes the same driver through Neon's wsproxy instead,
 * which the harness runs beside its PostgreSQL container. Nothing changes when
 * the variable is absent, which is every deployed environment.
 */
if (process.env["NEON_WS_PROXY"]) {
  const proxy = process.env["NEON_WS_PROXY"];
  neonConfig.wsProxy = () => proxy;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const pool = new Pool({ connectionString: env.server.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbClient = Db | DbTx;

/** Structural type for anything that can insert (schema-less test dbs included). */
export type InsertClient = { insert: Db["insert"] };
