import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { getFeatureFlagsAction } from "@/actions/feature-flags";
import { redirect } from "next/navigation";
import { FlagRow } from "./_components/flag-row";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";

export default async function AdminFlagsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.flags");

  const session = await getCurrentMember();
  if (!session?.member || session.member.role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }

  const flags = await getFeatureFlagsAction();

  // We explicitly list known flags even if they don't exist in DB yet
  const knownFlags = ["public_catalogue"];

  const flagMap = new Map(flags.map((f) => [f.name, f.enabled]));

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <Alert className="rounded-none border-primary/50 bg-primary/5">
        <InfoIcon className="h-4 w-4 text-primary" />
        <AlertTitle>{t("warning")}</AlertTitle>
        <AlertDescription>{t("warningText")}</AlertDescription>
      </Alert>

      <div className="space-y-4">
        {knownFlags.map((flagName) => (
          <FlagRow
            key={flagName}
            name={flagName}
            enabled={flagMap.get(flagName) ?? false}
          />
        ))}
      </div>
    </div>
  );
}
