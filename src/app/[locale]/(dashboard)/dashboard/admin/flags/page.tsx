import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { getFeatureFlagsAction } from "@/actions/feature-flags";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { FlagRow } from "./_components/flag-row";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { PageHeader } from "../_components/page-header";

/**
 * Every known flag renders even before its row exists in the database, and
 * each carries a description of what it gates - a switch labelled only by
 * its internal name is a switch someone flips to find out.
 */
const KNOWN_FLAGS = ["public_catalogue"] as const;

export default async function AdminFlagsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.flags");

  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }
  const actor = buildActor(session.member);
  if (!can(actor, "manage_flags", "feature_flag")) {
    redirect(`/${locale}/dashboard`);
  }

  const flags = await getFeatureFlagsAction();
  const flagMap = new Map(flags.map((f) => [f.name, f.enabled]));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <Alert className="border-primary/50 bg-primary/5">
        <InfoIcon className="size-4 text-primary" aria-hidden="true" />
        <AlertTitle>{t("warning")}</AlertTitle>
        <AlertDescription>{t("warningText")}</AlertDescription>
      </Alert>

      <div className="space-y-4">
        {KNOWN_FLAGS.map((flagName) => (
          <FlagRow
            key={flagName}
            name={flagName}
            enabled={flagMap.get(flagName) ?? false}
            description={t(`flagDescriptions.${flagName}`)}
          />
        ))}
      </div>
    </div>
  );
}
