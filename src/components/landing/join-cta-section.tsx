import { Briefcase, Gem, UserPlus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Reveal } from "./reveal";

import { Link } from "@/i18n/navigation";
import { monthlyPrice } from "@/domain/pricing";

/**
 * The three ways into the club, as the reference lays them out: member, VIP,
 * partner listing.
 *
 * Every amount comes from `@/domain/pricing`, not from the reference and not
 * from a translation string. The reference labelled standard membership
 * "бесплатная регистрация участника", which stopped being true when membership
 * became paid dues (ADR 0033) - and the two references disagreed with each
 * other about the figure anyway. The free path is the club's join link, which
 * waives dues and credits nobody, and that is what the note under the first
 * tile says (ADR 0009).
 */
export async function JoinCtaSection() {
  const t = await getTranslations("home.landing.join");
  const locale = await getLocale();

  const tiles = [
    {
      key: "member",
      icon: UserPlus,
      href: "/register",
      price: monthlyPrice("membership", locale),
      accent: true,
    },
    {
      key: "vip",
      icon: Gem,
      href: "/pricing",
      price: monthlyPrice("vip", locale),
      accent: false,
    },
    {
      key: "listing",
      icon: Briefcase,
      href: "/dashboard/company",
      price: monthlyPrice("listing", locale),
      accent: false,
    },
  ] as const;

  return (
    <section className="border-t border-white/10 bg-[#07090f] py-10 text-white sm:py-14">
      <div className="kclub-shell">
        <ul className="grid gap-4 sm:grid-cols-3">
          {tiles.map(({ key, icon: Icon, href, price, accent }, index) => (
            <li key={key} className="contents">
              <Reveal delay={index * 80} className="h-full">
                <Link
                  href={href}
                  className={`flex h-full flex-col gap-3 rounded-xl border p-5 transition-colors ${
                    accent
                      ? "border-[#d4af37] bg-[#151009] hover:bg-[#1c1508]"
                      : "border-[#d4af37]/35 bg-[#0d1017] hover:border-[#d4af37]/70"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <Icon
                      className="size-8 shrink-0 text-[#d4af37]"
                      aria-hidden
                    />
                    <span className="text-sm font-bold uppercase leading-tight tracking-[0.12em] text-[#e8c66a]">
                      {t(`${key}.title`)}
                    </span>
                  </span>

                  <span className="mt-auto block">
                    <span className="block font-serif text-xl font-bold text-white">
                      {price}
                      <span className="text-sm font-semibold text-white/55">
                        {t("perMonth")}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-white/55">
                      {t(`${key}.note`)}
                    </span>
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
