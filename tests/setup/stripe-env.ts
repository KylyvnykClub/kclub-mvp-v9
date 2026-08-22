import { config } from "dotenv";

/**
 * The Stripe rehearsal needs a test-mode secret key, which lives in .env.local
 * next to the rest of the developer's credentials. The integration suite never
 * loads it - it only needs the container database - so this setup file is
 * scoped to vitest.stripe.config.ts alone.
 *
 * Nothing here fails when the file is absent: the suite itself decides whether
 * a usable key was found and skips loudly rather than silently passing.
 */
config({ path: ".env.local", quiet: true });
