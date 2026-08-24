import { ArrowRight, BadgeCheck, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PartnerCompanyView } from "@/data/companies";

function locationLabel(partner: PartnerCompanyView) {
  return [partner.city, partner.country].filter(Boolean).join(", ");
}

function OverlayBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded border border-white/20 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85 backdrop-blur">
      <span className="truncate">{children}</span>
    </span>
  );
}

export function PartnerCard({
  partner,
  href,
  view,
  noDescription,
  detailsLabel,
  verifiedLabel,
}: {
  partner: PartnerCompanyView;
  href: string;
  view: "grid" | "list";
  noDescription: string;
  detailsLabel: string;
  verifiedLabel: string;
}) {
  const location = locationLabel(partner);
  const category =
    partner.businessCategory?.subcategory ??
    partner.businessCategory?.category ??
    partner.businessCategory?.block;
  const description = partner.description || noDescription;
  const initial = partner.name.charAt(0).toUpperCase();

  const media = (
    <div
      className={
        view === "list"
          ? "relative min-h-44 overflow-hidden border border-border bg-black md:w-72"
          : "relative h-44 overflow-hidden border border-border bg-black"
      }
    >
      {partner.logoUrl ? (
        <Image
          src={partner.logoUrl}
          alt=""
          fill
          unoptimized
          sizes={view === "list" ? "288px" : "420px"}
          className="object-cover opacity-85 transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 kc-fintech-grid flex items-center justify-center bg-card">
          <span className="font-serif text-6xl font-bold text-accent-ink">
            {initial}
          </span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      <div className="absolute left-3 top-3">
        <OverlayBadge>
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-3.5 text-accent-ink" aria-hidden />
            {verifiedLabel}
          </span>
        </OverlayBadge>
      </div>

      {partner.country && (
        <div className="absolute right-3 top-3 max-w-[35%]">
          <OverlayBadge>{partner.country}</OverlayBadge>
        </div>
      )}

      {category && (
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
          <OverlayBadge>{category}</OverlayBadge>
        </div>
      )}
    </div>
  );

  return (
    <Link
      href={href}
      className={`group rounded-xl border border-border bg-card/70 p-3 text-card-foreground transition-colors duration-200 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        view === "list"
          ? "grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]"
          : "flex min-h-[400px] flex-col"
      }`}
    >
      {media}

      <div className="flex min-w-0 flex-1 flex-col pt-5">
        {location && (
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{location}</span>
          </p>
        )}

        <h2 className="mt-2 font-serif text-xl font-semibold leading-tight tracking-normal text-foreground transition-colors group-hover:text-accent-ink">
          {partner.name}
        </h2>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          {partner.discount ? (
            <span className="min-w-0 truncate font-mono text-lg font-semibold tracking-normal text-foreground">
              {partner.discount}
            </span>
          ) : (
            <span />
          )}

          <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-accent-ink">
            {detailsLabel}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              strokeWidth={1.25}
              aria-hidden
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
