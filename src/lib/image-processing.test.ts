import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImageError, processAvatarImage } from "./image-processing";

async function pngFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

describe("processAvatarImage", () => {
  it("re-encodes a valid image to a 512x512 webp", async () => {
    const input = await pngFixture(100, 100);

    const output = await processAvatarImage(input);
    const outputMeta = await sharp(output).metadata();

    expect(outputMeta.format).toBe("webp");
    expect(outputMeta.width).toBe(512);
    expect(outputMeta.height).toBe(512);
  });

  it("crops non-square images to a square", async () => {
    const input = await pngFixture(800, 200);

    const output = await processAvatarImage(input);
    const outputMeta = await sharp(output).metadata();

    expect(outputMeta.width).toBe(512);
    expect(outputMeta.height).toBe(512);
  });

  it("rejects a file that is not a decodable image", async () => {
    const notAnImage = Buffer.from(
      "this is a text file pretending to be a photo",
    );

    await expect(processAvatarImage(notAnImage)).rejects.toThrow(
      InvalidImageError,
    );
  });

  it("rejects a file over the size limit before attempting to decode it", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024);

    let error: unknown;
    try {
      await processAvatarImage(oversized);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(InvalidImageError);
    expect((error as InvalidImageError).code).toBe("too_large");
  });
});
