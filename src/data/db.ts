import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "../env";
import * as schema from "./schema";

const pool = new Pool({ connectionString: env.server.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
