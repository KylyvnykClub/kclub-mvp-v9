import { test as setup } from "@playwright/test";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { hashSessionToken } from "@/lib/session-token";
import { readE2eEnv, STORAGE_STATE } from "./env";

/**
 * Mints a session for each seeded member and saves it as storage state.
 *
 * Signing in through the form would be a slower way to test the login form
 * twice - once here and once in the keyboard flow that actually audits it. The
 * session is created the way the application creates one: a random bearer
 * token, stored only as a SHA-256 hash, presented in the `session` cookie
 * (src/actions/session.ts reads exactly that).
 *
 * A setup project rather than globalSetup, so it is guaranteed to run after the
 * web server - and therefore after the fixtures are committed.
 */

async function mintSession(
  databaseUrl: string,
  memberId: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const hash = hashSessionToken(token);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO sessions (member_id, token, token_hash, user_agent, ip_address, is_partial_session)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [memberId, hash, hash, "playwright", "127.0.0.1"],
    );
  } finally {
    await client.end();
  }

  return token;
}

async function saveState(
  role: "member" | "vip",
  memberId: string,
): Promise<void> {
  const env = readE2eEnv();
  const token = await mintSession(env.databaseUrl, memberId);
  const { hostname } = new URL(env.baseUrl);

  const state = {
    cookies: [
      {
        name: "session",
        value: token,
        domain: hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 60 * 60,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  const { writeFile } = await import("node:fs/promises");
  await writeFile(STORAGE_STATE[role], JSON.stringify(state, null, 2));
}

setup("mint a session for the seeded member", async () => {
  await saveState("member", readE2eEnv().memberId);
});

setup("mint a session for the seeded VIP member", async () => {
  await saveState("vip", readE2eEnv().vipId);
});
