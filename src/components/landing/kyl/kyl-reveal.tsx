"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * The prototype's `.reveal` / `.is-visible` pair, as a component.
 *
 * `src/components/landing/reveal.tsx` does the same job for the rest of the
 * site, but against `kc-reveal` and a `data-revealed` attribute; this page is
 * styled by the client's own stylesheet, which names the class `is-visible`.
 * Rather than teach one component two vocabularies, the landing gets its own.
 *
 * `as` exists because the markup reveals articles, list items and sections, and
 * wrapping any of those in a div would break the grid they sit in.
 */
export function KylReveal({
  as: Tag = "div",
  children,
  className = "",
  ...rest
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      node.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`reveal ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
