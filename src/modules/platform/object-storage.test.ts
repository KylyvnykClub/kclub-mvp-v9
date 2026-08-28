import { describe, expect, it, vi } from "vitest";
import { objectStorageFrom, type S3Like } from "./object-storage";

function fakeClient(send: (command: { input: unknown }) => unknown): S3Like & {
  send: ReturnType<typeof vi.fn>;
} {
  return {
    send: vi.fn((command: { input: unknown }) =>
      Promise.resolve(send(command)),
    ),
  };
}

describe("objectStorageFrom", () => {
  it("putObject sends a PutObjectCommand with the bucket, key and body", async () => {
    const client = fakeClient(() => ({}));
    const storage = objectStorageFrom(client, "kclub");

    await storage.putObject(
      "avatars/m1.webp",
      Buffer.from("bytes"),
      "image/webp",
    );

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as { input: unknown };
    expect(command.input).toMatchObject({
      Bucket: "kclub",
      Key: "avatars/m1.webp",
      ContentType: "image/webp",
    });
  });

  it("deleteObject sends a DeleteObjectCommand for the key", async () => {
    const client = fakeClient(() => ({}));
    const storage = objectStorageFrom(client, "kclub");

    await storage.deleteObject("avatars/m1.webp");

    const command = client.send.mock.calls[0]?.[0] as { input: unknown };
    expect(command.input).toMatchObject({
      Bucket: "kclub",
      Key: "avatars/m1.webp",
    });
  });

  it("getObject returns the body as a Buffer", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const client = fakeClient(() => ({
      Body: { transformToByteArray: () => Promise.resolve(bytes) },
    }));
    const storage = objectStorageFrom(client, "kclub");

    const result = await storage.getObject("avatars/m1.webp");

    expect(result).toEqual(Buffer.from(bytes));
  });

  it("getObject returns null when the key does not exist", async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error("not found"), { name: "NoSuchKey" });
    });
    const storage = objectStorageFrom(client, "kclub");

    const result = await storage.getObject("avatars/missing.webp");

    expect(result).toBeNull();
  });

  it("getObject rethrows errors that are not NoSuchKey", async () => {
    const client = fakeClient(() => {
      throw new Error("access denied");
    });
    const storage = objectStorageFrom(client, "kclub");

    await expect(storage.getObject("avatars/m1.webp")).rejects.toThrow(
      "access denied",
    );
  });
});
