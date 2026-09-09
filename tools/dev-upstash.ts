/**
 * The Upstash stand-in, as a long-running process (docker-compose.yml).
 *
 * The application refuses to boot without UPSTASH_REDIS_REST_URL, and the card
 * verification path fails closed when the limiter throws, so a local stack
 * needs something answering on that URL. This is the same in-memory server the
 * e2e harness starts - one implementation, two callers - bound to an address
 * another container can reach.
 *
 * Counters live in memory: restarting this service clears every rate limit,
 * which is how a throttled sign-in is recovered from while testing.
 */

import { startFakeUpstash } from "../tests/e2e/fake-upstash";

const host = process.env["DEV_UPSTASH_HOST"] ?? "127.0.0.1";
const port = Number(process.env["DEV_UPSTASH_PORT"] ?? 8079);

async function main(): Promise<void> {
  const upstash = await startFakeUpstash({ host, port });
  console.log(`[upstash] answering on ${upstash.url}`);

  const shutdown = () => {
    void upstash.close().then(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("[upstash] failed to start", error);
  process.exit(1);
});
