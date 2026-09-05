import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The frame every legal page sits in: one measure, one rhythm, one way back.
 */
export function LegalShell({
  backHref,
  backLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <article className="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-3xl duration-700">
        <Link
          href={backHref}
          className="mb-8 inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-accent-ink"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Link>
        {children}
      </article>
    </div>
  );
}

/**
 * The masthead: eyebrow, title, then a row of facts about the document.
 * `meta` is a list so a page with nothing to state simply omits it.
 */
export function LegalHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-12 border-b border-border/60 pb-8">
      <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-accent-ink uppercase">
        {eyebrow}
      </p>
      <h1 className="font-serif text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
        {title}
      </h1>
      {children}
    </header>
  );
}
