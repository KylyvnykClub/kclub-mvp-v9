/**
 * The geometry behind framing an image at upload (ADR 0039).
 *
 * Pure, so the rules that decide what survives a crop are tested without a
 * browser. Everything is in frame pixels: the frame is the on-screen box the
 * owner frames into, and `View` places the image under it - `scale` screen
 * pixels per image pixel, `x`/`y` the image's top-left corner relative to the
 * frame's.
 *
 * Two regimes:
 *  - a photo must cover the frame, so the smallest scale fills it and the image
 *    can never be dragged off an edge - a banner never has an empty band;
 *  - a logo may sit inside the frame, so the smallest scale shows it whole and
 *    whatever the frame has left over becomes transparent padding. Nothing is
 *    cut from a logo unless its owner zooms in to cut it.
 */

export type CropKind = "logo" | "banner" | "photo";
export type LogoShape = "original" | "square" | "wide";

export type Size = { width: number; height: number };
export type View = { scale: number; x: number; y: number };

/** The partner page's banner is 3:1 from `sm` up (ADR 0038). */
export const BANNER_ASPECT = 3;
/** Gallery thumbnails on the partner page are 4:3. */
export const PHOTO_ASPECT = 4 / 3;
export const LOGO_SHAPES: readonly LogoShape[] = ["original", "square", "wide"];

/** How far past the smallest scale the owner can zoom in. */
export const MAX_ZOOM = 5;

/** The server's bounds (`image-processing.ts`); sending more is waste. */
export const OUTPUT_MAX_SIDE: Record<CropKind, number> = {
  logo: 1024,
  banner: 2560,
  photo: 2560,
};

export function frameAspect(
  kind: CropKind,
  shape: LogoShape,
  image: Size,
): number {
  if (kind === "banner") return BANNER_ASPECT;
  if (kind === "photo") return PHOTO_ASPECT;
  if (shape === "square") return 1;
  if (shape === "wide") return 2;
  return image.width / image.height;
}

/** Whether empty space inside the frame is allowed (and made transparent). */
export function allowsPadding(kind: CropKind): boolean {
  return kind === "logo";
}

export function minScale(image: Size, frame: Size, padding: boolean): number {
  const sx = frame.width / image.width;
  const sy = frame.height / image.height;
  return padding ? Math.min(sx, sy) : Math.max(sx, sy);
}

/**
 * On each axis the image either overhangs the frame, and may slide until an
 * edge meets the frame's, or fits inside it, and may slide until it touches
 * one. Either way it never leaves.
 */
function clampAxis(offset: number, frameSide: number, imageSide: number) {
  const slack = frameSide - imageSide;
  return Math.min(Math.max(offset, Math.min(0, slack)), Math.max(0, slack));
}

export function clampView(
  view: View,
  image: Size,
  frame: Size,
  padding: boolean,
): View {
  const floor = minScale(image, frame, padding);
  const scale = Math.min(Math.max(view.scale, floor), floor * MAX_ZOOM);
  return {
    scale,
    x: clampAxis(view.x, frame.width, image.width * scale),
    y: clampAxis(view.y, frame.height, image.height * scale),
  };
}

/** The smallest scale, centred: a photo covering the frame, a logo whole. */
export function initialView(image: Size, frame: Size, padding: boolean): View {
  const scale = minScale(image, frame, padding);
  return {
    scale,
    x: (frame.width - image.width * scale) / 2,
    y: (frame.height - image.height * scale) / 2,
  };
}

export function panView(
  view: View,
  dx: number,
  dy: number,
  image: Size,
  frame: Size,
  padding: boolean,
): View {
  return clampView(
    { ...view, x: view.x + dx, y: view.y + dy },
    image,
    frame,
    padding,
  );
}

/** Zoom about the frame's centre, so what the owner is looking at stays put. */
export function zoomView(
  view: View,
  scale: number,
  image: Size,
  frame: Size,
  padding: boolean,
): View {
  const floor = minScale(image, frame, padding);
  const next = Math.min(Math.max(scale, floor), floor * MAX_ZOOM);
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const ratio = next / view.scale;
  return clampView(
    {
      scale: next,
      x: cx - (cx - view.x) * ratio,
      y: cy - (cy - view.y) * ratio,
    },
    image,
    frame,
    padding,
  );
}

/**
 * The canvas to draw and where the image goes on it. The frame, measured in
 * source pixels, is the output - reduced to `maxSide` if larger, never
 * enlarged, because an upscale adds bytes and no detail.
 */
export function cropOutput(
  view: View,
  image: Size,
  frame: Size,
  maxSide: number,
): {
  width: number;
  height: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
} {
  const sourceWidth = frame.width / view.scale;
  const sourceHeight = frame.height / view.scale;
  const k = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const toOutput = k / view.scale;
  return {
    width: Math.max(1, Math.round(sourceWidth * k)),
    height: Math.max(1, Math.round(sourceHeight * k)),
    dx: view.x * toOutput,
    dy: view.y * toOutput,
    dw: image.width * k,
    dh: image.height * k,
  };
}

/** The whole image, bounded to `maxSide` - "use without framing". */
export function wholeOutput(image: Size, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * k));
  const height = Math.max(1, Math.round(image.height * k));
  return { width, height, dx: 0, dy: 0, dw: width, dh: height };
}
