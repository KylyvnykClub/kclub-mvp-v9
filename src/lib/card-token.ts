import { createHash, createHmac } from "node:crypto";

/**
 * Derives the public QR bearer token from card id and server secret without
 * storing that bearer token in the database.
 */
export function createCardPublicToken(cardId: string, secret: string): string {
  const signature = createHmac("sha256", `kclub.card.signing.v1.${secret}`)
    .update(cardId)
    .digest("base64url");

  return `card_v1_${cardId}_${signature}`;
}

export function createCardPublicTokenWithEnv(cardId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required to derive card tokens");
  }

  return createCardPublicToken(cardId, secret);
}

/**
 * Derives a stable lookup hash for QR card verification tokens.
 */
export function hashCardToken(token: string): string {
  return createHash("sha256").update(`kclub.card.v1.${token}`).digest("hex");
}
