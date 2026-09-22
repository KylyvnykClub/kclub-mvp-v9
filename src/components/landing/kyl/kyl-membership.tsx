import Image from "next/image";
import { BriefcaseBusiness, Gem, UsersRound } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { KylReveal } from "./kyl-reveal";

import { Link } from "@/i18n/navigation";
import { monthlyPrice, type PricedPlan } from "@/domain/pricing";

/**
 * What membership costs and what it buys, beside the card itself.
 *
 * Every amount comes from `@/domain/pricing`, never from a translation string,
 * so the three locales cannot disagree about a price and raising one is a
 * single edit (ADR 0033, FR-102). The prototype wrote "$4.99" and "$19.99" into
 * the markup three times; that is exactly the drift the pricing module exists
 * to prevent.
 *
 * The three destinations mirror the pricing page's, so a visitor who lands on
 * either is sent to the same place: a signed-out reader registers first, and a
 * member goes straight to the screen that sells the thing.
 */
const PLANS = [
  {
    key: "member",
    plan: "membership" as PricedPlan,
    Icon: UsersRound,
    className: "plan-card",
    signedIn: "/membership",
  },
  {
    key: "vip",
    plan: "vip" as PricedPlan,
    Icon: Gem,
    className: "plan-card plan-featured",
    signedIn: "/dashboard/profile",
  },
  {
    key: "business",
    plan: "listing" as PricedPlan,
    Icon: BriefcaseBusiness,
    className: "plan-card plan-business",
    signedIn: "/dashboard/company",
  },
] as const;

export async function KylMembership({ member }: { member: boolean }) {
  const t = await getTranslations("home.kyl.membership");
  const locale = await getLocale();

  return (
    <section
      className="membership section"
      id="membership"
      aria-labelledby="membership-title"
    >
      <div className="shell membership-grid">
        <KylReveal className="membership-copy">
          <h2 id="membership-title">{t("title")}</h2>
          <p className="lede">{t("lede")}</p>
          <ul className="benefit-list">
            <li>{t("benefit1")}</li>
            <li>{t("benefit2")}</li>
            <li>{t("benefit3")}</li>
            <li>{t("benefit4")}</li>
          </ul>
        </KylReveal>

        <KylReveal
          className="hero-visual membership-pass"
          aria-label={t("cardLabel")}
        >
          <div className="hero-orbit hero-orbit-outer" aria-hidden="true" />
          <div className="hero-orbit hero-orbit-inner" aria-hidden="true" />
          <div className="hero-card-back" aria-hidden="true" />
          <article
            className="club-card hero-club-card"
            aria-label={t("passLabel")}
          >
            <div className="hero-card-grain" aria-hidden="true" />
            <div className="hero-card-pattern" aria-hidden="true" />
            <div className="card-top">
              <span>Kylyvnyk Club</span>
              <span>{t("cardKind")}</span>
            </div>
            <div className="hero-card-mark">
              <Image
                src="/brand/logo/crown-gold-logo.png"
                alt=""
                width={36}
                height={34}
              />
            </div>
            <div className="hero-card-title">
              {t("cardTitleLine1")}
              <br />
              {t("cardTitleLine2")}
            </div>
            <div className="hero-card-divider" aria-hidden="true">
              <span>✦</span>
            </div>
            <div className="card-bottom">
              <span>{t("cardFooter")}</span>
            </div>
          </article>
        </KylReveal>
      </div>

      <KylReveal className="shell plan-grid">
        {PLANS.map(({ key, plan, Icon, className, signedIn }) => {
          const body = (
            <>
              <div className="plan-icon">
                <Icon aria-hidden="true" />
              </div>
              <h3>{t(`${key}.name`)}</h3>
              <p>{t(`${key}.description`)}</p>
              <div className="price">
                <strong>{monthlyPrice(plan, locale)}</strong>
                <span>{t("perMonth")}</span>
              </div>
              <span className="plan-card-action">{t(`${key}.action`)}</span>
            </>
          );

          return (
            <Link
              key={key}
              className={className}
              href={member ? signedIn : "/register"}
              aria-label={t(`${key}.action`)}
            >
              {key === "business" ? (
                <>
                  <div className="business-card-photo">
                    <Image
                      src="/brand/landing/membership-business.jpg"
                      alt={t("business.photoAlt")}
                      width={640}
                      height={264}
                      loading="lazy"
                    />
                  </div>
                  <div className="business-card-content">{body}</div>
                </>
              ) : (
                body
              )}
            </Link>
          );
        })}
      </KylReveal>
    </section>
  );
}
