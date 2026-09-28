/**
 * An uploaded image shown whole and filling its box (ADR 0038).
 *
 * A logo or a cover is the partner's face, and every box on the site has a
 * shape of its own that no upload is guaranteed to match. `object-fit: cover`
 * fills the box by cutting the image; `contain` keeps the image whole and
 * leaves empty bands. This does both: the image itself is contained, in full
 * and never cropped, over a blurred, cover-fitted copy of the same image that
 * fills whatever the shape left over. A logo on a white background extends its
 * own white; a photograph extends its own colours.
 *
 * Both layers point at the same URL, so the browser fetches the bytes once.
 * The box's size belongs to the caller: pass the sizing classes in `className`.
 * No `'use client'` - it renders from a Server Component and inside a client
 * one alike.
 */
export function FilledImage({
  src,
  alt,
  className = "",
  imageClassName = "",
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Extra classes for the whole image, e.g. padding for a logo. */
  imageClassName?: string;
  loading?: "lazy" | "eager";
}) {
  return (
    <div className={`kc-fill ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes (ADR 0022) */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={loading}
        className="kc-fill-backdrop"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- own-origin, already re-encoded bytes (ADR 0022) */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={`kc-fill-image ${imageClassName}`}
      />
    </div>
  );
}
