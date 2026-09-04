"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { claimEmailAction, type EmailClaimState } from "@/actions/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  /** What the account holds now, masked, or `null` if it holds nothing. */
  maskedEmail: string | null;
  verified: boolean;
}

const initialState: EmailClaimState = { status: "idle" };

/**
 * Claim an email address and ask for the link that proves it (ADR 0028).
 *
 * The address a member has proved is the only way back into the account when
 * the phone number is gone, so the screen says which of the two states it is
 * in rather than showing an address and leaving "verified" to be guessed.
 */
export function EmailForm({ maskedEmail, verified }: Props) {
  const t = useTranslations("dashboard");
  const [state, formAction] = useActionState(claimEmailAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {maskedEmail && (
        <p className="text-sm text-muted-foreground">
          {t("currentEmail")}: <span className="font-mono">{maskedEmail}</span>{" "}
          <span className={verified ? "text-green-500" : "text-amber-500"}>
            {verified ? t("emailVerified") : t("emailUnverified")}
          </span>
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="member-email">{t("emailLabel")}</Label>
        <Input
          id="member-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={255}
        />
        <p className="text-xs text-muted-foreground">{t("emailHelp")}</p>
      </div>

      <Submit label={maskedEmail ? t("emailResend") : t("emailSubmit")} />

      {state.status !== "idle" && (
        <p
          className={
            state.status === "sent"
              ? "text-sm text-green-500"
              : "text-sm text-destructive"
          }
          role="status"
        >
          {t(`emailStatus.${state.status}`)}
        </p>
      )}
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("common");

  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("loading") : label}
    </Button>
  );
}
