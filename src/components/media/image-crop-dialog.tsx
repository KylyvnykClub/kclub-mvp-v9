"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/image-limits";
import {
  LOGO_SHAPES,
  MAX_ZOOM,
  OUTPUT_MAX_SIDE,
  allowsPadding,
  clampView,
  cropOutput,
  frameAspect,
  initialView,
  minScale,
  panView,
  wholeOutput,
  zoomView,
  type CropKind,
  type LogoShape,
  type Size,
  type View,
} from "@/lib/image-crop";

/**
 * Framing an image before it is uploaded (ADR 0039, FR-120).
 *
 * The owner drags the image under a frame the shape of where it will be shown
 * - the 3:1 banner, a 4:3 gallery photo, or a logo shape of their choosing -
 * and zooms with the slider, the wheel or the keyboard. What is inside the
 * frame is drawn to a canvas and uploaded in place of the original, through
 * the same server pipeline as before; the server re-encodes it as it always
 * did. "Use as is" skips framing entirely, and a logo starts whole, so nothing
 * is ever cut without the owner doing the cutting.
 *
 * The output is bounded to the server's own size limits, which also means a
 * phone photo over the 5 MB upload cap is no longer refused: the framed copy
 * is a fraction of it.
 */

const STAGE_MARGIN = 24;
const STAGE_MAX_FRAME_HEIGHT = 340;
const KEY_STEP = 12;

/** A logo keeps its transparency; a photo does not have any to keep. */
function encodingFor(kind: CropKind) {
  return kind === "logo"
    ? { type: "image/png", extension: "png", quality: undefined }
    : { type: "image/jpeg", extension: "jpg", quality: 0.92 };
}

async function render(
  image: HTMLImageElement,
  kind: CropKind,
  geometry: {
    width: number;
    height: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  },
  name: string,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const encoding = encodingFor(kind);
  if (encoding.type === "image/jpeg") {
    // A photo with an alpha channel would otherwise turn black where it is
    // transparent.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, geometry.width, geometry.height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, geometry.dx, geometry.dy, geometry.dw, geometry.dh);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, encoding.type, encoding.quality),
  );
  if (!blob) return null;

  const base = name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.${encoding.extension}`, {
    type: encoding.type,
  });
}

function ImageCropDialog({
  file,
  kind,
  onDone,
}: {
  file: File;
  kind: CropKind;
  onDone: (file: File | null) => void;
}) {
  const t = useTranslations("dashboard");
  const padding = allowsPadding(kind);

  const [url, setUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shape, setShape] = useState<LogoShape>("original");
  const [stageWidth, setStageWidth] = useState(0);
  const [view, setView] = useState<View | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    const element = new Image();
    element.onload = () => setImage(element);
    element.onerror = () => setFailed(true);
    element.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [image]);

  const size: Size | null = image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : null;

  const aspect = size ? frameAspect(kind, shape, size) : 1;
  let frameWidth = Math.max(0, stageWidth - 2 * STAGE_MARGIN);
  let frameHeight = frameWidth / aspect;
  if (frameHeight > STAGE_MAX_FRAME_HEIGHT) {
    frameHeight = STAGE_MAX_FRAME_HEIGHT;
    frameWidth = frameHeight * aspect;
  }
  const frame: Size = { width: frameWidth, height: frameHeight };
  const frameLeft = (stageWidth - frameWidth) / 2;

  // A new frame - first measure, a resize, another logo shape - starts over
  // from the whole image rather than keeping a view the frame no longer fits.
  useEffect(() => {
    if (!size || frame.width <= 0) return;
    setView(initialView(size, frame, padding));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the numbers, not the objects rebuilt every render
  }, [size?.width, size?.height, frame.width, frame.height, padding]);

  const floor = size && frame.width > 0 ? minScale(size, frame, padding) : 1;
  const zoom = view ? view.scale / floor : 1;

  // Functional updates: several pointer moves can land between two renders,
  // and each must build on the last rather than on the render's stale view.
  const pan = (dx: number, dy: number) => {
    if (!size) return;
    setView((current) =>
      current ? panView(current, dx, dy, size, frame, padding) : current,
    );
  };
  const zoomTo = (next: number) => {
    if (!size) return;
    setView((current) =>
      current ? zoomView(current, floor * next, size, frame, padding) : current,
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    pan(event.clientX - drag.x, event.clientY - drag.y);
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    zoomTo(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      pan(move[0], move[1]);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(zoom * 1.1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomTo(zoom / 1.1);
    }
  };

  const apply = async () => {
    if (!image || !size || !view) return;
    setBusy(true);
    const settled = clampView(view, size, frame, padding);
    const framed = await render(
      image,
      kind,
      cropOutput(settled, size, frame, OUTPUT_MAX_SIDE[kind]),
      file.name,
    );
    setBusy(false);
    onDone(framed ?? file);
  };

  // Unframed: the original as picked, unless it is over the upload cap, in
  // which case a bounded copy of the whole image goes instead.
  const keepWhole = async () => {
    if (file.size <= MAX_IMAGE_UPLOAD_BYTES || !image || !size) {
      onDone(file);
      return;
    }
    setBusy(true);
    const whole = await render(
      image,
      kind,
      wholeOutput(size, OUTPUT_MAX_SIDE[kind]),
      file.name,
    );
    setBusy(false);
    onDone(whole ?? file);
  };

  const titles: Record<CropKind, string> = {
    logo: t("cropTitleLogo"),
    banner: t("cropTitleBanner"),
    photo: t("cropTitlePhoto"),
  };
  const hints: Record<CropKind, string> = {
    logo: t("cropHintLogo"),
    banner: t("cropHintBanner"),
    photo: t("cropHintPhoto"),
  };
  const shapeLabels: Record<LogoShape, string> = {
    original: t("cropShapeOriginal"),
    square: t("cropShapeSquare"),
    wide: t("cropShapeWide"),
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onDone(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titles[kind]}</DialogTitle>
          <DialogDescription>{hints[kind]}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {t("cropUnreadable")}
          </p>
        ) : (
          <>
            {kind === "logo" && (
              <div
                role="radiogroup"
                aria-label={t("cropShapeLabel")}
                className="flex flex-wrap gap-2"
              >
                {LOGO_SHAPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={shape === option}
                    onClick={() => setShape(option)}
                    className={`rounded border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] transition-colors ${
                      shape === option
                        ? "border-accent-ink text-accent-ink"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {shapeLabels[option]}
                  </button>
                ))}
              </div>
            )}

            {/* A two-dimensional drag surface has no ARIA widget role that
                fits; it is focusable and fully keyboard-operable (arrows pan,
                + and - zoom), and the slider below zooms as well. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above */}
            <div
              ref={stageRef}
              role="application"
              aria-label={t("cropStageLabel")}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-operable, see above
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              onKeyDown={onKeyDown}
              className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-md bg-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              style={{ height: frameHeight + 2 * STAGE_MARGIN || 240 }}
            >
              {url && view && (
                <>
                  {/* The frame; a logo's transparent padding shows as a
                      checkerboard so the owner can see it is empty. */}
                  <div
                    aria-hidden="true"
                    className="absolute"
                    style={{
                      left: frameLeft,
                      top: STAGE_MARGIN,
                      width: frameWidth,
                      height: frameHeight,
                      background: padding
                        ? "repeating-conic-gradient(#3f3f46 0 25%, #27272a 0 50%) 0 0 / 16px 16px"
                        : undefined,
                    }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview of a file that has not been uploaded */}
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none origin-top-left"
                    style={{
                      left: frameLeft + view.x,
                      top: STAGE_MARGIN + view.y,
                      width: (size?.width ?? 0) * view.scale,
                      height: (size?.height ?? 0) * view.scale,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-sm border-2 border-white/90"
                    style={{
                      left: frameLeft,
                      top: STAGE_MARGIN,
                      width: frameWidth,
                      height: frameHeight,
                      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
                    }}
                  />
                </>
              )}
            </div>

            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="shrink-0">{t("cropZoom")}</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                disabled={!view}
                onChange={(event) => zoomTo(Number(event.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </label>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onDone(null)}
          >
            {t("cropCancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void keepWhole()}
          >
            {t("cropUseAsIs")}
          </Button>
          {!failed && (
            <Button
              type="button"
              disabled={busy || !view}
              onClick={() => void apply()}
            >
              {t("cropApply")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `const { frame, cropDialog } = useImageCrop()`; render `cropDialog`, then
 * `const picked = await frame(file, "banner")` - the framed file, the original
 * if the owner chose "use as is", or null if they cancelled.
 */
export function useImageCrop(): {
  frame: (file: File, kind: CropKind) => Promise<File | null>;
  cropDialog: ReactNode;
} {
  const [request, setRequest] = useState<{
    file: File;
    kind: CropKind;
    resolve: (file: File | null) => void;
  } | null>(null);

  const frame = useCallback(
    (file: File, kind: CropKind) =>
      new Promise<File | null>((resolve) =>
        setRequest({ file, kind, resolve }),
      ),
    [],
  );

  const cropDialog = request ? (
    <ImageCropDialog
      file={request.file}
      kind={request.kind}
      onDone={(file) => {
        request.resolve(file);
        setRequest(null);
      }}
    />
  ) : null;

  return { frame, cropDialog };
}
