import { setRequestLocale, getTranslations } from "next-intl/server";
import { getPendingCompaniesAction } from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { ModerateActions } from "./_components/moderate-actions";
import { Badge } from "@/components/ui/badge";

function formatAge(createdAt: Date): string {
  const diffMs = Date.now() - createdAt.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "<1h";
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export default async function AdminCompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.companies");

  const auth = await getCurrentMember();
  if (!auth?.member) {
    redirect(`/${locale}/login`);
  }
  const actor = buildActor(auth.member);
  if (!can(actor, "read", "company")) {
    redirect(`/${locale}/dashboard`);
  }

  const result = await getPendingCompaniesAction();
  const companies = result.data || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <div className="bg-card border border-border/50">
        {companies.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {companies.map((company) => (
              <div
                key={company.id}
                className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-lg">{company.name}</h2>
                    <Badge
                      variant="outline"
                      className="bg-muted/50 text-xs text-muted-foreground uppercase"
                    >
                      {t("statusPending")}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      <strong>{t("ownerLabel")}</strong>{" "}
                      {company.owner?.displayName}
                    </p>
                    <p>
                      <strong>{t("categoryLabel")}</strong>{" "}
                      {company.businessCategory?.block} /{" "}
                      {company.businessCategory?.category}
                    </p>
                    <p>
                      <strong>{t("slugLabel")}</strong> {company.slug}
                    </p>
                    {company.discount && (
                      <p>
                        <strong>{t("discountLabel")}</strong>{" "}
                        <span className="text-accent">{company.discount}</span>
                      </p>
                    )}
                    <p>
                      <strong>{t("ageLabel")}</strong>{" "}
                      {formatAge(company.createdAt)}
                    </p>
                  </div>
                  {company.description && (
                    <p className="text-sm mt-2 max-w-2xl line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  <ModerateActions companyId={company.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
