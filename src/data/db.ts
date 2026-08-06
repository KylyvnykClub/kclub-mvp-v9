import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "../env";
import * as schema from "./schema";

const pool = new Pool({ connectionString: env.server.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbClient = Db | DbTx;

/** Structural type for anything that can insert (schema-less test dbs included). */
export type InsertClient = { insert: Db["insert"] };
