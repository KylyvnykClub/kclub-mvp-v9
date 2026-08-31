"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll reveal: children rise and fade in the first time they enter the
 * viewport. The hidden initial state lives in globals.css under
 * `prefers-reduced-motion: no-preference`, so reduced-motion users and
 * environments without IntersectionObserver simply see the content.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Stagger offset in milliseconds. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.dataset["revealed"] = "true";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.dataset["revealed"] = "true";
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `kc-reveal ${className}` : "kc-reveal"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
