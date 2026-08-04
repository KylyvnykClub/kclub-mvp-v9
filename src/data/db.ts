import { drizzle } from "drizzle-orm/neon-http";

import { env } from "../env.js";

export const db = drizzle(env.server.DATABASE_URL);
