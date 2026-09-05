import { getTranslations } from "next-intl/server";

/**
 * The operator's identity and contact address, stated once.
 *
 * Each document used to carry its own cover block repeating this — in a
 * different shape every time, and in only some of the nine. It is the same
 * legal entity for all of them, so it is rendered from here and every document
 * ends the same way.
 */
export const LEGAL_OPERATOR = {
  name: "Kylyvnyk Consulting LLC",
  address: ["6 Pauline Pl", "Palm Coast, FL 32164-7535", "United States"],
  email: "kylyvnykclub@gmail.com",
} as const;

export async function LegalOperator() {
  const t = await getTranslations("legal");

  return (
    <footer className="mt-16 border-t border-border/60 pt-8">
      <dl className="grid gap-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("operator")}
          </dt>
          <dd className="mt-2 text-[0.9375rem] leading-7 text-foreground/80">
            <span className="block font-medium text-foreground">
              {LEGAL_OPERATOR.name}
            </span>
            {LEGAL_OPERATOR.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("contact")}
          </dt>
          <dd className="mt-2 text-[0.9375rem] leading-7">
            <a
              href={`mailto:${LEGAL_OPERATOR.email}`}
              className="font-medium text-accent-ink underline decoration-accent-ink/30 underline-offset-4 transition-colors hover:decoration-accent-ink"
            >
              {LEGAL_OPERATOR.email}
            </a>
          </dd>
        </div>
      </dl>
    </footer>
  );
}
