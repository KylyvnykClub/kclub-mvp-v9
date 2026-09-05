/**
 * One typographic scale for every legal document.
 *
 * The documents are plain prose — headings, paragraphs and bullet lists, no
 * tables, no emphasis, no links — so the map stays small on purpose. Styling
 * them here rather than in the MDX keeps the source free of presentation and
 * guarantees that nine documents in three locales read as one set.
 *
 * Heading contract, enforced by the content itself:
 *   `##`  a numbered section, or a preamble callout
 *   `###` a subsection (`9.1`) or a named block inside a section
 */
type Slot = { children?: React.ReactNode };

export const legalProse = {
  h2: ({ children }: Slot) => (
    <h2 className="mt-14 scroll-mt-24 border-t border-border/60 pt-8 font-serif text-xl font-semibold leading-snug tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0 sm:text-2xl">
      {children}
    </h2>
  ),
  h3: ({ children }: Slot) => (
    <h3 className="mt-8 mb-3 font-serif text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
      {children}
    </h3>
  ),
  h4: ({ children }: Slot) => (
    <h4 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-foreground uppercase">
      {children}
    </h4>
  ),
  p: ({ children }: Slot) => (
    <p className="my-4 text-[0.9375rem] leading-7 text-foreground/80">
      {children}
    </p>
  ),
  ul: ({ children }: Slot) => (
    <ul className="my-4 list-disc space-y-1.5 pl-5 marker:text-accent-ink/60">
      {children}
    </ul>
  ),
  ol: ({ children }: Slot) => (
    <ol className="my-4 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }: Slot) => (
    <li className="pl-1 text-[0.9375rem] leading-7 text-foreground/80">
      {children}
    </li>
  ),
  a: ({ children, href }: Slot & { href?: string }) => (
    <a
      href={href}
      className="font-medium text-accent-ink underline decoration-accent-ink/30 underline-offset-4 transition-colors hover:decoration-accent-ink"
    >
      {children}
    </a>
  ),
  strong: ({ children }: Slot) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  hr: () => <hr className="my-10 border-border/60" />,
};
