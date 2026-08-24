import { ArrowUpRight, BadgeCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PartnerCompanyView } from "@/data/companies";

/**
 * One partner, in whichever of the two catalogue layouts is active.
 *
 * Both layouts live here rather than in two components so they cannot drift:
 * the same fields, the same link target and the same hover and focus treatment,
 * differing only in arrangement. Below `md` the list collapses to the same
 * single column as the grid, because a horizontal row has nowhere to go on a
 * phone.
 */
export function PartnerCard({
  partner,
  href,
  view,
  noDescription,
}: {
  partner: PartnerCompanyView;
  href: string;
  view: "grid" | "list";
  noDescription: string;
}) {
  const logo = partner.logoUrl ? (
    <div className="relative flex size-16 shrink-0 items-center justify-center border border-border bg-muted/20 p-2">
      <Image
        src={partner.logoUrl}
        alt={partner.name}
        fill
        unoptimized
        sizes="64px"
        className="object-contain p-2"
      />
    </div>
  ) : (
    <div className="flex size-16 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 text-2xl font-black text-accent-ink">
      {partner.name.charAt(0).toUpperCase()}
    </div>
  );

  const verified = (
    <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      <BadgeCheck className="size-4 text-accent-ink" aria-hidden="true" />
      KCLUB
    </span>
  );

  const shared =
    "group relative border-b border-r border-border bg-background transition-colors duration-200 hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  if (view === "list") {
    return (
      <Link
        href={href}
        className={`${shared} flex flex-col gap-5 p-6 md:flex-row md:items-center sm:p-7`}
      >
        {logo}

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {partner.businessCategory?.block}
            {partner.businessCategory?.category
              ? ` · ${partner.businessCategory.category}`
              : ""}
          </p>
          <h2 className="mt-2 text-xl font-black uppercase leading-tight tracking-[-0.025em] transition-colors group-hover:text-accent-ink">
            {partner.name}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm font-light leading-6 text-muted-foreground">
            {partner.description || noDescription}
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-5 md:w-64 md:justify-end">
          {partner.discount && (
            <span className="text-xs font-black uppercase tracking-[0.12em] text-accent-ink">
              {partner.discount}
            </span>
          )}
          {verified}
          <ArrowUpRight
            className="size-5 text-muted-foreground transition-colors group-hover:text-accent-ink"
            aria-hidden="true"
          />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`${shared} flex min-h-[360px] flex-col justify-between p-6 sm:p-7`}
    >
      <div>
        <div className="flex items-start justify-between gap-5">
          {logo}
          <ArrowUpRight
            className="size-5 text-muted-foreground transition-colors group-hover:text-accent-ink"
            aria-hidden="true"
          />
        </div>

        <div className="mt-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {partner.businessCategory?.block}
          </p>
          <h2 className="mt-3 text-2xl font-black uppercase leading-tight tracking-[-0.025em] transition-colors group-hover:text-accent-ink">
            {partner.name}
          </h2>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {partner.businessCategory?.category}
          </p>
          <p className="mt-5 line-clamp-4 text-sm font-light leading-6 text-muted-foreground">
            {partner.description || noDescription}
          </p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
        {verified}
        {partner.discount && (
          <span className="max-w-[55%] text-right text-xs font-black uppercase tracking-[0.12em] text-accent-ink">
            {partner.discount}
          </span>
        )}
      </div>
    </Link>
  );
}
