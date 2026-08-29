import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Narrower than `S3Client` on purpose: a real `S3Client` satisfies this
 * structurally, and a test can hand in a plain `{ send: vi.fn() }` without
 * fighting the SDK's overloaded `send` signature.
 */
export interface S3Like {
  // The real S3Client.send is generic over the AWS SDK's Command union, which
  // a plain test double cannot structurally satisfy. `any` here is the seam:
  // production always passes a real S3Client, tests always pass a simple
  // `{ send: vi.fn() }`, and neither side needs to agree on the SDK's types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (command: any) => Promise<unknown>;
}

/**
 * A generic S3-compatible object store, narrowed to the operations this
 * product needs. Cloudflare R2 speaks the S3 API, so the same interface backs
 * every object-storage consumer (avatars, galleries, logos, draft staging)
 * without any of them depending on the AWS SDK directly.
 */
export interface ObjectStorage {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Returns null when the key does not exist, rather than throwing. */
  getObject(key: string): Promise<Buffer | null>;
  /** Server-side copy within the bucket; the source is left in place. */
  copyObject(fromKey: string, toKey: string): Promise<void>;
  /** Every key under a prefix (one page - prefixes here hold at most tens). */
  listKeys(prefix: string): Promise<string[]>;
}

function isNoSuchKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "NoSuchKey"
  );
}

/**
 * Built from an already-constructed S3Client rather than from config, so a
 * test can inject a fake `{ send }` and this file never has to know how R2
 * credentials are shaped or where they come from (that wiring lives in
 * `r2-client.ts`, the only place that reads `@/env`).
 */
export function objectStorageFrom(
  client: S3Like,
  bucket: string,
): ObjectStorage {
  return {
    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async getObject(key) {
      try {
        const result = (await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
        if (!result.Body) return null;
        const bytes = await result.Body.transformToByteArray();
        return Buffer.from(bytes);
      } catch (error) {
        if (isNoSuchKey(error)) return null;
        throw error;
      }
    },

    async copyObject(fromKey, toKey) {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${fromKey}`,
          Key: toKey,
        }),
      );
    },

    async listKeys(prefix) {
      const result = (await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
      )) as { Contents?: { Key?: string }[] };
      return (result.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => typeof k === "string");
    },
  };
}
