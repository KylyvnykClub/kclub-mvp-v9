"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

/**
 * The account's own acknowledgements, as boxes the applicant ticks: the
 * Terms with their arbitration clause and the Privacy Policy, and being 18 or
 * older. They used to be implied by pressing "Create account"; the client's
 * spec asks for empty boxes, ticked by the person, and the server refuses a
 * registration without them (`ACCOUNT_CONSENT_FIELDS`).
 *
 * Each document is still recorded in `legal_acceptances` at the version
 * published at submit time (FR-093, FR-097).
 */
export function useAccountConsents() {
  const [terms, setTerms] = useState(false);
  const [age, setAge] = useState(false);
  return { terms, setTerms, age, setAge, complete: terms && age };
}

export function AccountConsents({
  state,
}: {
  state: ReturnType<typeof useAccountConsents>;
}) {
  const t = useTranslations("register");
  const locale = useLocale();
  const doc = (slug: string) => (chunks: React.ReactNode) => (
    <Link
      href={`/${locale}/legal/${slug}`}
      target="_blank"
      rel="noopener"
      className="font-bold underline hover:text-accent-ink"
    >
      {chunks}
    </Link>
  );
  const box = (
    name: string,
    checked: boolean,
    onChange: (next: boolean) => void,
    label: React.ReactNode,
  ) => (
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-foreground">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
        aria-required
        className="mt-1 size-4 shrink-0 accent-[#d8b261]"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="space-y-3 border-t border-border pt-5">
      {box(
        "accountTerms",
        state.terms,
        state.setTerms,
        t.rich("consentTerms", {
          terms: doc("terms-of-use"),
          privacy: doc("privacy-policy"),
        }),
      )}
      {box("accountAge", state.age, state.setAge, t("consentAge"))}
    </div>
  );
}
