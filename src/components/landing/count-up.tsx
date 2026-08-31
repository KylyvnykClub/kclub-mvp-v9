"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from zero when it first scrolls into view, formatted for
 * the locale. Reduced-motion users (and no-JS crawlers via SSR) get the final
 * value immediately - the server renders the finished number as the initial
 * markup.
 */
export function CountUp({
  value,
  locale,
  durationMs = 1200,
}: {
  value: number;
  locale: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const startedAt = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3);
          setShown(Math.round(value * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        setShown(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return <span ref={ref}>{new Intl.NumberFormat(locale).format(shown)}</span>;
}
