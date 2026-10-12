import type { DescriptionTranslations } from "@/data/schema/companies";

/**
 * ADR 0046: a partner's description in the reader's language - the version
 * the partner wrote in it, or the original when they wrote none.
 */
export function localizedDescription(
  company: {
    description: string | null;
    descriptionTranslations?: DescriptionTranslations | null;
  },
  locale: string,
): string | null {
  const translated =
    company.descriptionTranslations?.[locale as keyof DescriptionTranslations];
  return translated?.trim() ? translated : company.description;
}
