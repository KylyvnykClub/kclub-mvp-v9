import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { KylReveal } from "./kyl-reveal";

import { Link } from "@/i18n/navigation";

export async function KylFinalCta({ member }: { member: boolean }) {
  const t = await getTranslations("home.kyl.cta");

  return (
    <section className="final-cta" aria-labelledby="cta-title">
      <KylReveal className="shell">
        <Image
          src="/brand/logo/crown-gold-logo.png"
          alt=""
          width={47}
          height={44}
        />
        <h2 id="cta-title">
          {t("titleLine1")}
          <br />
          {t("titleLine2")}
        </h2>
        <Link className="button" href={member ? "/dashboard" : "/register"}>
          {t("button")}
        </Link>
      </KylReveal>
    </section>
  );
}
