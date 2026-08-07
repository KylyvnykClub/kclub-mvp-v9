import { setRequestLocale } from "next-intl/server";
import { getPendingCompaniesAction } from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { ModerateActions } from "./_components/moderate-actions";
import { Badge } from "@/components/ui/badge";

export default async function AdminCompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await getCurrentMember();
  if (!auth?.member || auth.member.role !== "admin") {
    redirect(`/${locale}/dashboard/profile`);
  }

  const result = await getPendingCompaniesAction();
  const companies = result.data || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">
          Company Moderation
        </h1>
        <p className="text-muted-foreground mt-2">
          Review and approve companies submitted by members. Approved companies
          appear in the public Partners directory.
        </p>
      </div>

      <div className="bg-card border border-border/50">
        {companies.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No pending companies to moderate.
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
                      PENDING
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      <strong>Owner:</strong> {company.owner?.displayName}
                    </p>
                    <p>
                      <strong>Category:</strong>{" "}
                      {company.businessCategory?.block} /{" "}
                      {company.businessCategory?.category}
                    </p>
                    <p>
                      <strong>Slug:</strong> {company.slug}
                    </p>
                    {company.discount && (
                      <p>
                        <strong>Discount:</strong>{" "}
                        <span className="text-accent">{company.discount}</span>
                      </p>
                    )}
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
