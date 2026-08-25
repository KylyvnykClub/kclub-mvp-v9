import { createServer, type Server } from "node:http";

/**
 * An in-memory stand-in for Upstash's REST API, for the e2e harness only.
 *
 * The card verification path fails *closed*: if the limiter throws, middleware
 * returns 429 rather than serving the page (src/middleware.ts). That is the
 * right call in production - a rate limiter that fails open is not a rate
 * limiter - but it means `/[locale]/card/[token]` cannot be audited at all
 * unless something answers on the Upstash URL.
 *
 * Pointing the harness at the real Upstash would make an accessibility run
 * depend on a vendor being up, and share a counter between concurrent runs.
 * This speaks the three commands `redisRestRateLimiter` actually issues -
 * INCR, PEXPIRE, PTTL - and nothing else, so an unexpected command fails
 * loudly rather than being silently treated as success.
 */

interface Entry {
  count: number;
  expiresAt: number | null;
}

export interface FakeUpstash {
  url: string;
  close: () => Promise<void>;
  /** Drops every counter. Lets a test exercise a limit without leaking to the next. */
  reset: () => void;
}

export async function startFakeUpstash(): Promise<FakeUpstash> {
  const store = new Map<string, Entry>();

  function live(key: string): Entry | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  function handle(command: unknown[]): { result: unknown } | { error: string } {
    const [name, key, arg] = command as [string, string, string | undefined];

    switch (name?.toUpperCase()) {
      case "INCR": {
        const entry = live(key) ?? { count: 0, expiresAt: null };
        entry.count += 1;
        store.set(key, entry);
        return { result: entry.count };
      }
      case "PEXPIRE": {
        const entry = live(key);
        if (!entry) return { result: 0 };
        entry.expiresAt = Date.now() + Number(arg);
        return { result: 1 };
      }
      case "PTTL": {
        const entry = live(key);
        if (!entry) return { result: -2 };
        if (entry.expiresAt === null) return { result: -1 };
        return { result: Math.max(0, entry.expiresAt - Date.now()) };
      }
      default:
        return { error: `fake-upstash: unsupported command ${String(name)}` };
    }
  }

  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let payload: { result: unknown } | { error: string };
      try {
        payload = handle(JSON.parse(body) as unknown[]);
      } catch (error) {
        payload = {
          error: error instanceof Error ? error.message : "bad request",
        };
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("fake-upstash: could not determine the listening port");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    reset: () => store.clear(),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
