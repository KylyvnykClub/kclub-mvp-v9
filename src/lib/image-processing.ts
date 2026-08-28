import sharp from "sharp";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_DIMENSION = 512;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/** Machine-readable so callers can translate it; see messages/*.json "dashboard.avatarError*". */
export type InvalidImageCode =
  "too_large" | "unreadable" | "unsupported_format" | "processing_failed";

export class InvalidImageError extends Error {
  constructor(public readonly code: InvalidImageCode) {
    super(code);
  }
}

/**
 * Decodes, validates and re-encodes an uploaded avatar to a fixed-size WebP.
 *
 * Decoding through sharp *is* the content-type check that matters — a file
 * that merely claims to be an image in its browser-reported Content-Type
 * fails here regardless, because sharp has to actually parse pixel data to
 * produce a result. The re-encode strips all EXIF/metadata as a side effect:
 * only pixel data survives a decode-resize-encode round trip.
 */
export async function processAvatarImage(input: Buffer): Promise<Buffer> {
  if (input.byteLength > MAX_AVATAR_BYTES) {
    throw new InvalidImageError("too_large");
  }

  const image = sharp(input, { failOn: "error" });

  let format: string | undefined;
  try {
    ({ format } = await image.metadata());
  } catch {
    throw new InvalidImageError("unreadable");
  }

  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new InvalidImageError("unsupported_format");
  }

  try {
    return await image
      .rotate() // apply EXIF orientation before the encode strips it
      .resize(AVATAR_DIMENSION, AVATAR_DIMENSION, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new InvalidImageError("processing_failed");
  }
}
