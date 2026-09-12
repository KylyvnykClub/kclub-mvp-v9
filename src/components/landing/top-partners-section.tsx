import { ArrowRight, Crown } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Reveal } from "./reveal";

import { getPublicShowcasePartners } from "@/actions/company";
import type { PartnerCompanyView } from "@/data/companies";
import { Link } from "@/i18n/navigation";

/**
 * The three partners staff put in the "top" block, on the landing page.
 *
 * This is FR-035's curated showcase, not the catalogue: it shows at most what
 * `showcaseType = 'top'` names, so the landing page never becomes a way to read
 * the whole partner list by scrolling.
 *
 * The discount is the loudest thing on the card on purpose - it is what the
 * client asked to lead with, and what a visitor is here to find out.
 */
function flagSrc(code: string | null): string | null {
  return code && /^[A-Za-z]{2}$/.test(code)
    ? `/flags/${code.toLowerCase()}.png`
    : null;
}

function taxonomyLabel(partner: PartnerCompanyView): string | null {
  const first = partner.categories?.[0]?.businessCategory;
  return first?.category ?? first?.block ?? null;
}

export async function TopPartnersSection() {
  const { top } = await getPublicShowcasePartners();
  if (top.length === 0) return null;

  const t = await getTranslations("home.landing.topPartners");

  return (
    <section className="border-t border-white/10 bg-[#0b0d14] py-12 text-white sm:py-16">
      <div className="kclub-shell">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-3 text-xl font-black uppercase tracking-[0.08em] text-[#e8c66a] sm:text-2xl">
            <Crown className="size-7 shrink-0" aria-hidden />
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

        <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((partner, index) => {
            const flag = flagSrc(partner.registrationCountryCode);
            const taxonomy = taxonomyLabel(partner);

            return (
              <li key={partner.id} className="contents">
                <Reveal
                  delay={index * 80}
                  className="group h-full overflow-hidden rounded-xl border border-[#d4af37]/25 bg-[#11141c] transition-colors hover:border-[#d4af37]/60"
                >
                  <div className="relative h-44 overflow-hidden bg-black">
                    {partner.logoUrl ? (
                      <Image
                        src={partner.logoUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
                        className="object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="kc-fintech-grid absolute inset-0 flex items-center justify-center bg-[#0d1017]">
                        <span className="font-serif text-6xl font-bold text-[#d4af37]/60">
                          {partner.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                    {flag && (
                      <span className="absolute left-3 top-3 block overflow-hidden rounded border border-white/25 shadow-lg">
                        <Image
                          src={flag}
                          alt=""
                          width={42}
                          height={28}
                          className="h-7 w-auto"
                        />
                      </span>
                    )}

                    {partner.discount && (
                      <span className="absolute right-3 top-3 max-w-[55%] truncate rounded-md bg-[#d92d20] px-3 py-1.5 text-sm font-bold text-white shadow-lg">
                        {partner.discount}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 p-5">
                    <h3 className="truncate font-serif text-xl font-semibold">
                      {partner.name}
                    </h3>
                    {taxonomy && (
                      <p className="truncate text-sm text-white/60">
                        {taxonomy}
                      </p>
                    )}

                    <Link
                      href={`/directory/${partner.slug}`}
                      className="mt-4 inline-flex w-fit items-center gap-2 self-end rounded-md border border-[#d4af37]/45 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4af37] hover:text-black"
                    >
                      {t("details")}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
