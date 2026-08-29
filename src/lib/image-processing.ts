import sharp, { type Sharp } from "sharp";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const AVATAR_DIMENSION = 512;
const GALLERY_MAX_DIMENSION = 1600;
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
 * Decoding through sharp *is* the content-type check that matters — a file
 * that merely claims to be an image in its browser-reported Content-Type
 * fails here regardless, because sharp has to actually parse pixel data to
 * produce a result. The re-encode strips all EXIF/metadata as a side effect:
 * only pixel data survives a decode-resize-encode round trip.
 */
async function decodeValidated(input: Buffer): Promise<Sharp> {
  if (input.byteLength > MAX_UPLOAD_BYTES) {
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

  return image;
}

/** A fixed square, cover-cropped to 512×512 WebP. */
async function processSquareImage(input: Buffer): Promise<Buffer> {
  const image = await decodeValidated(input);

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

/** Member avatar (ADR 0021). */
export const processAvatarImage = processSquareImage;

/** Company logo (ADR 0023): same square slot shape as the avatar. */
export const processLogoImage = processSquareImage;

/**
 * A gallery photo keeps its aspect ratio: bounded to 1600px on the longest
 * side, never enlarged. Same decode-as-validation and EXIF stripping as the
 * avatar path (ADR 0022).
 */
export async function processGalleryImage(input: Buffer): Promise<Buffer> {
  const image = await decodeValidated(input);

  try {
    return await image
      .rotate()
      .resize(GALLERY_MAX_DIMENSION, GALLERY_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new InvalidImageError("processing_failed");
  }
}
