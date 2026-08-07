import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { listAllCategories } from "@/data/companies";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleCategoryStatusAction } from "@/actions/admin";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminCategoriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.categories");

  const result = await getCurrentMember();
  if (!result || !result.member || result.member.role !== "admin") {
    redirect(`/${locale}/dashboard/profile`);
  }

  const categories = await listAllCategories(db);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <div className="border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/50">
                <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("colId")}
                </th>
                <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("colBlock")}
                </th>
                <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("colCategory")}
                </th>
                <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("colSubcategory")}
                </th>
                <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("colStatus")}
                </th>
                <th className="p-4 font-medium text-sm text-muted-foreground uppercase tracking-wider text-right">
                  {t("colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 bg-card/30">
              {categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="p-4 font-mono text-sm">{cat.id}</td>
                  <td className="p-4 text-sm font-medium">{cat.block}</td>
                  <td className="p-4 text-sm">{cat.category}</td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {cat.subcategory}
                  </td>
                  <td className="p-4">
                    <Badge
                      variant={
                        cat.status === "ACTIVE" ? "default" : "secondary"
                      }
                      className="rounded-none"
                    >
                      {cat.status === "ACTIVE"
                        ? t("statusActive")
                        : t("statusInactive")}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <form
                      action={async () => {
                        "use server";
                        await toggleCategoryStatusAction(cat.id, cat.status);
                      }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none text-xs h-8"
                      >
                        {t("toggle")}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
