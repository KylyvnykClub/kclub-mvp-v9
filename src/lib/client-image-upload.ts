import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/image-limits";

export type GuardedUpload<T> =
  { ok: true; result: T } | { ok: false; code: "too_large" | "upload_failed" };

/**
 * Calls an image-upload Server Action without letting it take the page down.
 *
 * Two failures reach the browser before the action's own error handling ever
 * runs, and both used to reject inside a `startTransition` callback, where an
 * unhandled rejection escapes to the root error boundary and renders
 * "Application error: a client-side exception has occurred" over the whole app:
 *
 *   - the file is larger than the Server Action body limit, so the request is
 *     rejected in transport and the action is never invoked. Phone cameras
 *     routinely produce such files, which is how a member hit this by simply
 *     picking a photo;
 *   - the request fails outright — a dropped mobile connection, a proxy
 *     timeout, a 5xx from the edge.
 *
 * The size check runs first and locally, so an oversized file costs no upload
 * at all and reports the same `too_large` the server would have. Everything
 * else becomes `upload_failed`, which the caller translates like any other
 * code. The page stays up either way, which is the point.
 */
export async function uploadImageSafely<T>(
  file: File,
  run: () => Promise<T>,
): Promise<GuardedUpload<T>> {
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return { ok: false, code: "too_large" };
  }

  try {
    return { ok: true, result: await run() };
  } catch (err) {
    console.error(
      `[image-upload] request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return { ok: false, code: "upload_failed" };
  }
}
