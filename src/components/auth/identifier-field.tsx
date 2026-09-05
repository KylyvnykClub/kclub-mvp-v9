"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PhoneField } from "@/components/auth/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The one place a member chooses which identifier they are typing (FR-005,
 * ADR 0032).
 *
 * Shared by sign-in and by the reset request, because those two screens have
 * to agree: a member who signs in with an address and then asks for a reset
 * with the same address must not find that the second screen only understands
 * numbers.
 *
 * Only the chosen field is mounted, so exactly one identifier is ever posted
 * and `readLoginIdentifier` never has to break a tie. Phone is the default
 * because it is the identifier every member has — including the accounts that
 * predate ADR 0032 and hold no address at all.
 */
export function IdentifierField() {
  const t = useTranslations("auth");
  const [kind, setKind] = useState<"phone" | "email">("phone");

  return (
    <div className="space-y-2 text-left">
      <div
        role="group"
        aria-label={t("identifierLabel")}
        className="grid grid-cols-2 gap-1 rounded-md border border-input p-1"
      >
        {(["phone", "email"] as const).map((option) => (
          <button
            // type="button" or the segmented control submits the form on every
            // switch.
            type="button"
            key={option}
            onClick={() => setKind(option)}
            aria-pressed={kind === option}
            className={cn(
              "rounded-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors",
              kind === option
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "phone" ? t("identifierPhone") : t("identifierEmail")}
          </button>
        ))}
      </div>

      {kind === "phone" ? (
        <PhoneField
          id="phone"
          name="phone"
          label={t("phoneLabel")}
          autoComplete="username"
          required
          className="h-12 bg-background"
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={t("emailPlaceholder")}
            required
            maxLength={255}
            className="h-12 bg-background"
          />
        </div>
      )}
    </div>
  );
}
