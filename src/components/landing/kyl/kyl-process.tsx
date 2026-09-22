import {
  BadgePercent,
  Handshake,
  IdCard,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { KylReveal } from "./kyl-reveal";

/**
 * The four steps from registering to using a benefit.
 *
 * An ordered list with icons and no printed numerals, which is what
 * DESIGN_RULES.md asks for: the sequence is carried by the `<ol>`, so a screen
 * reader announces it without the page drawing "1 2 3 4" twice.
 */
const STEPS: { key: string; Icon: LucideIcon }[] = [
  { key: "step1", Icon: UserRoundPlus },
  { key: "step2", Icon: IdCard },
  { key: "step3", Icon: Handshake },
  { key: "step4", Icon: BadgePercent },
];

export async function KylProcess() {
  const t = await getTranslations("home.kyl.process");

  return (
    <section
      className="process section"
      id="how-it-works"
      aria-labelledby="process-title"
    >
      <div className="shell">
        <KylReveal className="section-heading centered">
          <h2 id="process-title">{t("title")}</h2>
          <p>{t("lede")}</p>
        </KylReveal>

        <ol className="process-grid">
          {STEPS.map(({ key, Icon }) => (
            <KylReveal as="li" className="process-card" key={key}>
              <div className="step-icon">
                <Icon aria-hidden="true" />
              </div>
              <h3>{t(`${key}.title`)}</h3>
              <p>{t(`${key}.description`)}</p>
            </KylReveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
