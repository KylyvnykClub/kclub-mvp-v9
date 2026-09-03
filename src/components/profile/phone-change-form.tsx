"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  initiatePhoneChangeAction,
  verifyOldPhoneAction,
  verifyNewPhoneAction,
  type PhoneChangeState,
} from "@/actions/profile";
import { PhoneInput } from "@/components/auth/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  maskedPhone: string;
}

const initialState: PhoneChangeState = { step: "idle" };

export function PhoneChangeForm({ maskedPhone }: Props) {
  const t = useTranslations("dashboard");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [initState, initAction, initPending] = useActionState(
    initiatePhoneChangeAction,
    initialState,
  );

  const activeState = initState;

  if (activeState.step === "done") {
    return <p className="text-sm text-green-500">{t("phoneChanged")}</p>;
  }

  if (activeState.step === "verify_new" && activeState.newPhone) {
    return (
      <VerifyNewStep
        newPhone={activeState.newPhone}
        error={activeState.error}
      />
    );
  }

  if (activeState.step === "verify_old" && activeState.newPhone) {
    return (
      <VerifyOldStep
        newPhone={activeState.newPhone}
        maskedPhone={maskedPhone}
        error={activeState.error}
      />
    );
  }

  return (
    <form action={initAction} className="space-y-4">
      {activeState.error && (
        <p className="text-sm text-red-500">{activeState.error}</p>
      )}

      <p className="text-sm text-muted-foreground">
        {t("currentPhone")}: <span className="font-mono">{maskedPhone}</span>
      </p>

      <div className="space-y-2">
        <Label htmlFor="newPhone">{t("newPhone")}</Label>
        <PhoneInput
          id="newPhone"
          name="newPhone"
          countryLabel={tAuth("phoneCountryLabel")}
          required
        />
      </div>

      <Button
        type="submit"
        disabled={initPending}
        variant="outline"
        className="w-full"
      >
        {initPending ? tCommon("saving") : t("changePhone")}
      </Button>
    </form>
  );
}

function VerifyOldStep({
  newPhone,
  maskedPhone,
  error,
}: {
  newPhone: string;
  maskedPhone: string;
  error?: string;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(verifyOldPhoneAction, {
    step: "verify_old" as const,
    newPhone,
  });

  if (state.step === "verify_new" && state.newPhone) {
    return <VerifyNewStep newPhone={state.newPhone} error={state.error} />;
  }

  const displayError = state.error || error;

  return (
    <form action={action} className="space-y-4">
      {displayError && <p className="text-sm text-red-500">{displayError}</p>}

      <p className="text-sm text-muted-foreground">
        {t("verifyOldPhoneDesc", { phone: maskedPhone })}
      </p>

      <input type="hidden" name="newPhone" value={newPhone} />

      <div className="space-y-2">
        <Label htmlFor="code">{t("verificationCode")}</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          placeholder="000000"
          required
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tCommon("saving") : t("verifyCode")}
      </Button>
    </form>
  );
}

function VerifyNewStep({
  newPhone,
  error,
}: {
  newPhone: string;
  error?: string;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(verifyNewPhoneAction, {
    step: "verify_new" as const,
    newPhone,
  });

  if (state.step === "done") {
    return <p className="text-sm text-green-500">{t("phoneChanged")}</p>;
  }

  const displayError = state.error || error;

  return (
    <form action={action} className="space-y-4">
      {displayError && <p className="text-sm text-red-500">{displayError}</p>}

      <p className="text-sm text-muted-foreground">
        {t("verifyNewPhoneDesc", { phone: newPhone })}
      </p>

      <input type="hidden" name="newPhone" value={newPhone} />

      <div className="space-y-2">
        <Label htmlFor="code">{t("verificationCode")}</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          placeholder="000000"
          required
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tCommon("saving") : t("verifyCode")}
      </Button>
    </form>
  );
}
