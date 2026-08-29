/**
 * Forward Stripe test webhooks to the local dev server.
 *
 * Usage:
 *   pnpm stripe:listen            (in a second terminal, beside `pnpm dev`)
 *
 * Why a wrapper and not a bare `stripe listen`: the CLI's interactive login may
 * point at a different Stripe account than the keys in .env.local, and then it
 * forwards events from the wrong account — a checkout stays UNPAID with no
 * error anywhere. Passing the key from .env.local pins the forwarder to the
 * same account the application talks to.
 *
 * The signing secret the CLI prints must equal STRIPE_WEBHOOK_SECRET in
 * .env.local; the script checks that and refuses to run otherwise. Nothing
 * here is ever used in production — Stripe delivers to the public endpoint
 * there (docs/integration.md §2.1).
 */

import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const key = process.env["STRIPE_SECRET_KEY"];
const expectedSecret = process.env["STRIPE_WEBHOOK_SECRET"];

if (!key?.startsWith("sk_test_")) {
  console.error(
    "STRIPE_SECRET_KEY in .env.local must be a test-mode key (sk_test_…) to forward webhooks locally.",
  );
  process.exit(1);
}

const port = process.env["PORT"] ?? "3000";
const child = spawn(
  "stripe",
  [
    "listen",
    "--api-key",
    key,
    "--forward-to",
    `localhost:${port}/api/webhooks/stripe`,
  ],
  {
    stdio: ["inherit", "pipe", "inherit"],
    shell: process.platform === "win32",
  },
);

child.stdout.on("data", (chunk: Buffer) => {
  const text = chunk.toString();
  const match = /whsec_[A-Za-z0-9]+/.exec(text);
  if (match && expectedSecret && match[0] !== expectedSecret) {
    console.error(
      "\nThe CLI's signing secret differs from STRIPE_WEBHOOK_SECRET in .env.local.",
      "Every forwarded event would fail signature verification.",
      "Copy the whsec_… printed above into .env.local and restart the dev server.\n",
    );
  }
  process.stdout.write(text);
});

child.on("exit", (code) => process.exit(code ?? 0));
