import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { KylReveal } from "./kyl-reveal";

export async function KylAbout() {
  const t = await getTranslations("home.kyl.about");

  return (
    <section className="about section" id="about" aria-labelledby="about-title">
      <div className="shell about-grid">
        <KylReveal className="about-visual">
          <Image
            src="/brand/landing/about-boardroom.webp"
            alt={t("photoAlt")}
            width={900}
            height={1200}
            loading="lazy"
          />
        </KylReveal>
        <KylReveal className="about-copy">
          <h2 id="about-title">{t("title")}</h2>
          <p className="lede">{t("lede")}</p>
          <p>{t("body")}</p>
          <a className="button-tertiary arrow-link" href="#membership">
            {t("cta")}
          </a>
        </KylReveal>
      </div>
    </section>
  );
}
