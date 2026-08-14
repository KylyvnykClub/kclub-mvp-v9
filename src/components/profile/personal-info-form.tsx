"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updatePersonalInfoAction } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COUNTRIES = [
  "UA",
  "PL",
  "DE",
  "US",
  "GB",
  "CZ",
  "FR",
  "IT",
  "ES",
  "PT",
] as const;
const LANGUAGES = ["en", "uk", "ru"] as const;

interface Props {
  displayName: string;
  language: string;
  country: string;
}

export function PersonalInfoForm({ displayName, language, country }: Props) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tReg = useTranslations("register");
  const [state, action, pending] = useActionState(
    updatePersonalInfoAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-500">{t("personalInfoUpdated")}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="displayName">{t("name")}</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          maxLength={255}
          defaultValue={displayName}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="country">{t("country")}</Label>
          <select
            id="country"
            name="country"
            defaultValue={country}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {tReg(`countries.${code}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">{t("language")}</Label>
          <select
            id="language"
            name="language"
            defaultValue={language}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {tReg(`languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tCommon("saving") : t("savePersonalInfo")}
      </Button>
    </form>
  );
}
