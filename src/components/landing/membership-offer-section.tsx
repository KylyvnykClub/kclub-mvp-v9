import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { MembershipCard } from "./membership-card";
import { Reveal } from "./reveal";

import { Link } from "@/i18n/navigation";
import { CURRENCY, monthlyPrice } from "@/domain/pricing";

/**
 * What membership costs and what it buys, beside the card itself.
 *
 * The amount comes from `@/domain/pricing` rather than from a translation
 * string, so the three locales cannot disagree about the price - and so raising
 * it is one edit rather than nine (ADR 0033, FR-102).
 *
 * The note under the button says a link, not an invitation. There is no
 * invitation mechanic in this product and there is not going to be one: the
 * join link waives dues and credits nobody, which is the difference between a
 * club and a referral scheme (ADR 0033, ADR 0009).
 */
export async function MembershipOfferSection() {
  const t = await getTranslations("home.landing.membership");
  const locale = await getLocale();

  const benefits = [
    "discounts",
    "connections",
    "opportunities",
    "events",
  ] as const;

  return (
    <section className="border-t border-white/10 bg-[#07090f] py-12 text-white sm:py-16">
      <div className="kclub-shell">
        <Reveal>
          <div className="grid items-center gap-9 rounded-2xl border border-[#d4af37]/30 bg-[#0d1017] p-6 sm:p-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] lg:gap-10">
            <MembershipCard caption={t("cardCaption")} tier={t("cardTier")} />

            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-white/60">
                {t("eyebrow")}
              </p>
              <p className="mt-1 font-serif text-3xl font-bold text-[#e8c66a] sm:text-4xl">
                {t("brand")}
              </p>

              <ul className="mt-6 space-y-3">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <Check
                      className="mt-0.5 size-5 shrink-0 text-[#d4af37]"
                      aria-hidden
                    />
                    <span className="text-base leading-6 text-white/85">
                      {t(`benefits.${benefit}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-xl border border-[#d4af37]/35 bg-black/45 p-6 text-center lg:w-72">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
                {t("priceLabel")}
              </p>
              <p className="text-3xl font-black text-white sm:text-4xl">
                {monthlyPrice("membership", locale)}
                <span className="ml-1 text-lg font-medium text-white/65">
                  {t("perMonth")}
                </span>
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                {CURRENCY}
              </p>

              <Link
                href="/register"
                className="kclub-brand-button mt-2 w-full !bg-[#d4af37] !text-black hover:!bg-[#e8c66a]"
              >
                {t("cta")}
              </Link>

              <p className="text-xs leading-5 text-white/55">{t("note")}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
