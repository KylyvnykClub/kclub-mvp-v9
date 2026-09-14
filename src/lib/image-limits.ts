/**
 * The one number both sides of an image upload agree on.
 *
 * It lives apart from `image-processing.ts` because that module imports sharp,
 * and a client component that needs to check a file's size before sending it
 * cannot pull sharp into the browser bundle. Both the server-side validator and
 * the client-side guard read this constant, so raising the cap is one edit.
 *
 * `next.config.ts` sets the Server Action body limit above this figure. If that
 * limit ever drops below it, an oversized file stops producing a translated
 * error and starts producing a failed request instead.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
