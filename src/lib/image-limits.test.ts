import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/image-limits";

/**
 * The crash this guards against was a mismatch between two numbers that are
 * declared in different files and never compared: Next.js capped a Server
 * Action body at its 1MB default while the image pipeline accepted 5MB, so
 * every file between the two was rejected in transport and took the page down.
 *
 * Reading the config as text rather than importing it keeps this a unit test -
 * `next.config.ts` pulls in the Sentry and next-intl plugins on import.
 */
describe("Server Action body limit vs MAX_IMAGE_UPLOAD_BYTES", () => {
  it("leaves room for an image at the cap plus its multipart envelope", () => {
    const config = readFileSync(
      path.resolve(import.meta.dirname, "../../next.config.ts"),
      "utf8",
    );

    const match = /bodySizeLimit:\s*"(\d+)mb"/.exec(config);
    expect(
      match,
      "next.config.ts must set serverActions.bodySizeLimit",
    ).not.toBeNull();

    const limitBytes = Number(match![1]) * 1024 * 1024;
    expect(limitBytes).toBeGreaterThan(MAX_IMAGE_UPLOAD_BYTES);
  });
});
