"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Slow vertical drift against the scroll direction. Runs on rAF, writes only
 * a transform, and stays inert for reduced-motion users.
 */
export function ParallaxLayer({
  children,
  factor = 0.12,
  className,
}: {
  children: ReactNode;
  /** Fraction of the scroll delta the layer moves by (0..1). */
  factor?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      // Offset of the element's centre from the viewport centre.
      const delta = rect.top + rect.height / 2 - window.innerHeight / 2;
      node.style.transform = `translate3d(0, ${(-delta * factor).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [factor]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
