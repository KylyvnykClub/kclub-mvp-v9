import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Reveal } from "./reveal";

export function IntroductionsSection() {
  const t = useTranslations("home");

  return (
    <section id="introductions" className="kclub-section bg-background">
      <div className="kclub-shell">
        <Reveal>
          <p className="kclub-eyebrow">{t("introductions.eyebrow")}</p>
          <p className="kclub-copy mt-8 max-w-3xl text-xl leading-9 sm:text-2xl sm:leading-10">
            {t("introductions.lead")}
          </p>
          <p className="mt-6 max-w-2xl border-l border-accent pl-4 text-sm leading-6 text-muted-foreground">
            {t("introductions.disclaimer")}
          </p>
          <div className="mt-10">
            <Link href="/legal/terms-of-use" className="kclub-outline-button">
              {t("introductions.cta")}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
