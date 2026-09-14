import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Reveal } from "./reveal";

import { getPublicShowcasePartners } from "@/actions/company";
import type { PartnerCompanyView } from "@/data/companies";
import { Link } from "@/i18n/navigation";
import { countryName } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";

/**
 * The "featured" showcase, as a compact grid under the search block.
 *
 * The reference printed a padlock and "discount available after registration"
 * on every card. That is no longer how this product works: the catalogue was
 * opened to signed-out visitors, and FR-030 says they see the partner list and
 * the discounts - only contact details and gallery photos stay behind sign-in.
 * A padlock over a discount the visitor can read one click away on the partner
 * page would be theatre, so the card shows the real discount.
 *
 * Like the top row, this is a curated block and not the catalogue: it renders
 * what staff marked `showcaseType = 'featured'` and nothing else, so scrolling
 * the landing page never becomes a way to read the whole partner list.
 */
function taxonomyLabel(partner: PartnerCompanyView): string | null {
  const first = partner.categories?.[0]?.businessCategory;
  return first?.category ?? first?.block ?? null;
}

export async function RecommendedPartnersSection() {
  const { featured } = await getPublicShowcasePartners();
  if (featured.length === 0) return null;

  const t = await getTranslations("home.landing.recommended");
  const locale = (await getLocale()) as Locale;

  return (
    <section className="border-t border-white/10 bg-[#07090f] py-12 text-white sm:py-16">
      <div className="kclub-shell">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-black uppercase tracking-[0.16em] text-[#e8c66a] sm:text-2xl">
            {t("title")}
          </h2>

          <Link
            href="/directory"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/75 transition-colors hover:text-[#e8c66a]"
          >
            {t("seeAll")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((partner, index) => {
            const taxonomy = taxonomyLabel(partner);
            const place = [
              partner.city,
              partner.registrationCountryCode
                ? countryName(partner.registrationCountryCode, locale)
                : null,
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <li key={partner.id} className="contents">
                <Reveal delay={index * 60} className="h-full">
                  <Link
                    href={`/directory/${partner.slug}`}
                    className="flex h-full gap-4 rounded-xl border border-[#d4af37]/25 bg-[#0d1017] p-4 transition-colors hover:border-[#d4af37]/70"
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {partner.logoUrl ? (
                        <Image
                          src={partner.logoUrl}
                          alt=""
                          width={48}
                          height={48}
                          unoptimized
                          className="size-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="font-serif text-xl font-bold text-[#d4af37]/70"
                        >
                          {partner.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-lg font-semibold text-white">
                        {partner.name}
                      </span>
                      {taxonomy && (
                        <span className="block truncate text-sm text-white/60">
                          {taxonomy}
                        </span>
                      )}
                      {place && (
                        <span className="block truncate text-xs text-white/55">
                          {place}
                        </span>
                      )}
                      {partner.discount && (
                        <span className="mt-2 inline-block rounded border border-[#d4af37]/50 px-2 py-0.5 text-xs font-bold text-[#e8c66a]">
                          {partner.discount}
                        </span>
                      )}
                    </span>
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
