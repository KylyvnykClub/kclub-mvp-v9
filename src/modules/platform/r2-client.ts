import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { objectStorageFrom, type ObjectStorage } from "./object-storage";

/**
 * The only file that turns R2 env vars into a live client. Everything else
 * — the generic object-storage interface, the avatar key convention — stays
 * free of `@/env` so it can be imported and unit-tested without secrets.
 */
let cached: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (cached) return cached;

  if (
    !env.server.R2_ACCOUNT_ID ||
    !env.server.R2_ACCESS_KEY_ID ||
    !env.server.R2_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      "R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.server.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.server.R2_ACCESS_KEY_ID,
      secretAccessKey: env.server.R2_SECRET_ACCESS_KEY,
    },
  });

  cached = objectStorageFrom(client, env.server.R2_BUCKET_NAME);
  return cached;
}
