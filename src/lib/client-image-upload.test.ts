import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadImageSafely } from "@/lib/client-image-upload";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/image-limits";

/** A File of a given size without allocating the bytes twice over. */
function fileOfSize(bytes: number): File {
  const file = new File([], "photo.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadImageSafely (ADR 0021-0024)", () => {
  it("returns the action's result when the upload succeeds", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });

    const guarded = await uploadImageSafely(fileOfSize(1024), run);

    expect(guarded).toEqual({ ok: true, result: { success: true } });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("passes a failed action result through untouched, so the server's own error code still reaches the member", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ success: false, error: "unsupported_format" });

    const guarded = await uploadImageSafely(fileOfSize(1024), run);

    expect(guarded).toEqual({
      ok: true,
      result: { success: false, error: "unsupported_format" },
    });
  });

  it("rejects a file over the limit without calling the action at all", async () => {
    const run = vi.fn();

    const guarded = await uploadImageSafely(
      fileOfSize(MAX_IMAGE_UPLOAD_BYTES + 1),
      run,
    );

    expect(guarded).toEqual({ ok: false, code: "too_large" });
    // The point of the local check: the oversized body is never sent, so it
    // cannot be rejected in transport for exceeding the Server Action limit.
    expect(run).not.toHaveBeenCalled();
  });

  it("accepts a file exactly at the limit, which the server still validates", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });

    const guarded = await uploadImageSafely(
      fileOfSize(MAX_IMAGE_UPLOAD_BYTES),
      run,
    );

    expect(guarded).toEqual({ ok: true, result: { success: true } });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected request instead of rethrowing it", async () => {
    // The regression this exists for: an unhandled rejection here escaped the
    // `startTransition` callback it was awaited in and reached the root error
    // boundary, replacing the whole page with "Application error: a
    // client-side exception has occurred".
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const guarded = await uploadImageSafely(fileOfSize(1024), run);

    expect(guarded).toEqual({ ok: false, code: "upload_failed" });
  });

  it("reports a non-Error rejection rather than letting it through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue("413");

    await expect(uploadImageSafely(fileOfSize(1024), run)).resolves.toEqual({
      ok: false,
      code: "upload_failed",
    });
  });
});
