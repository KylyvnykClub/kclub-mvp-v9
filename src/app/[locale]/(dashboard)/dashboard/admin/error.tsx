"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { reset: () => void }) {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-lg font-medium text-foreground">{t("error")}</p>
      <Button onClick={reset} variant="outline">
        {t("tryAgain")}
      </Button>
    </div>
  );
}
