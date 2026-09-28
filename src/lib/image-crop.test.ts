import { describe, expect, it } from "vitest";

import {
  BANNER_ASPECT,
  MAX_ZOOM,
  clampView,
  cropOutput,
  frameAspect,
  initialView,
  panView,
  wholeOutput,
  zoomView,
  type Size,
} from "@/lib/image-crop";

const frame: Size = { width: 600, height: 200 }; // a 3:1 banner frame
const photo: Size = { width: 4000, height: 3000 }; // a 4:3 phone photo
const wordmark: Size = { width: 1600, height: 400 }; // a 4:1 logo

describe("FR-120: framing a photo at upload (ADR 0039)", () => {
  it("starts with the photo covering the whole frame, centred", () => {
    const view = initialView(photo, frame, false);

    expect(view.scale).toBeCloseTo(600 / 4000);
    expect(view.x).toBeCloseTo(0);
    expect(photo.height * view.scale + 2 * view.y).toBeCloseTo(200);
    expect(view.y).toBeLessThan(0);
  });

  it("never lets a photo be dragged off an edge, so a banner has no empty band", () => {
    const start = initialView(photo, frame, false);

    const down = panView(start, 0, 10_000, photo, frame, false);
    const up = panView(start, 0, -10_000, photo, frame, false);
    const side = panView(start, 500, 0, photo, frame, false);

    expect(down.y).toBe(0);
    expect(up.y).toBeCloseTo(200 - photo.height * start.scale);
    expect(side.x).toBe(0);
  });

  it("never zooms a photo out below covering the frame", () => {
    const start = initialView(photo, frame, false);

    expect(zoomView(start, start.scale / 10, photo, frame, false).scale).toBe(
      start.scale,
    );
  });

  it("caps zoom at MAX_ZOOM times the starting scale", () => {
    const start = initialView(photo, frame, false);

    expect(zoomView(start, start.scale * 100, photo, frame, false).scale).toBe(
      start.scale * MAX_ZOOM,
    );
  });

  it("zooms about the frame's centre", () => {
    const start = initialView(photo, frame, false);
    const centreBefore = (300 - start.x) / start.scale;

    const zoomed = zoomView(start, start.scale * 2, photo, frame, false);

    expect((300 - zoomed.x) / zoomed.scale).toBeCloseTo(centreBefore);
  });

  it("outputs the framed region at the frame's shape, bounded to the server's size", () => {
    const view = initialView(photo, frame, false);

    const out = cropOutput(view, photo, frame, 2560);

    expect(out.width).toBe(2560);
    expect(out.height).toBe(Math.round(2560 / BANNER_ASPECT));
    expect(out.dx).toBeCloseTo(0);
    expect(out.dw).toBeCloseTo(2560);
  });

  it("never enlarges a small crop", () => {
    const start = initialView(photo, frame, false);
    const zoomed = zoomView(start, start.scale * 5, photo, frame, false);

    const out = cropOutput(zoomed, photo, frame, 2560);

    expect(out.width).toBe(800); // 4000 / 5 source pixels across
    expect(out.height).toBe(267);
  });
});

describe("FR-120: framing a logo at upload never cuts it by default (ADR 0039)", () => {
  const square: Size = { width: 300, height: 300 };

  it("starts with the whole logo inside the frame", () => {
    const view = initialView(wordmark, square, true);

    expect(view.x).toBeCloseTo(0);
    expect(wordmark.width * view.scale).toBeCloseTo(300);
    expect(wordmark.height * view.scale).toBeLessThan(300);
  });

  it("keeps the logo inside the frame when it is smaller than it", () => {
    const view = initialView(wordmark, square, true);

    const moved = panView(view, 0, 10_000, wordmark, square, true);

    expect(moved.y + wordmark.height * moved.scale).toBeCloseTo(300);
  });

  it("outputs the padding around a whole logo as part of the square", () => {
    const view = initialView(wordmark, square, true);

    const out = cropOutput(view, wordmark, square, 1024);

    expect(out.width).toBe(1024);
    expect(out.height).toBe(1024);
    expect(out.dw).toBeCloseTo(1024);
    expect(out.dh).toBeCloseTo(256);
    expect(out.dy).toBeCloseTo((1024 - 256) / 2);
  });

  it("offers the logo's own shape, which leaves no padding at all", () => {
    const aspect = frameAspect("logo", "original", wordmark);
    const own: Size = { width: 400, height: 400 / aspect };

    const view = initialView(wordmark, own, true);

    expect(aspect).toBe(4);
    expect(view.x).toBeCloseTo(0);
    expect(view.y).toBeCloseTo(0);
  });

  it("reads a banner and a photo at their fixed shapes whatever the logo shape", () => {
    expect(frameAspect("banner", "square", wordmark)).toBe(3);
    expect(frameAspect("photo", "wide", wordmark)).toBeCloseTo(4 / 3);
  });

  it("clamps a view that no longer fits after the frame changed", () => {
    const view = { scale: 0.01, x: -900, y: 900 };

    const clamped = clampView(view, wordmark, square, true);

    expect(clamped.scale).toBeCloseTo(300 / 1600);
    expect(clamped.x).toBeCloseTo(0);
  });
});

describe("FR-120: using an image without framing it", () => {
  it("keeps the whole image, bounded to the server's size", () => {
    expect(wholeOutput(photo, 2560)).toMatchObject({
      width: 2560,
      height: 1920,
    });
    expect(wholeOutput({ width: 300, height: 100 }, 1024)).toMatchObject({
      width: 300,
      height: 100,
    });
  });
});
