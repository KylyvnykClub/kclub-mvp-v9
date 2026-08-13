import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  createCategoryAction,
  createCityAction,
  createCountryAction,
  deleteCategoryAction,
  deleteCityAction,
  deleteCountryAction,
  toggleCategoryStatusAction,
  toggleCityStatusAction,
  toggleCountryStatusAction,
} from "@/actions/admin";
import { getCurrentMember } from "@/actions/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/data/db";
import { listAllCategories, listCountries } from "@/data/companies";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminCategoriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.categories");

  const result = await getCurrentMember();
  if (!result?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(result.member);
  if (!can(actor, "manage_reference_data", "reference_data")) {
    redirect(`/${locale}/dashboard`);
  }

  const [categories, countries] = await Promise.all([
    listAllCategories(db),
    listCountries(db),
  ]);

  const cityRows = countries.flatMap((country) =>
    country.cities.map((city) => ({
      ...city,
      countryName: country.name,
    })),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("categoriesTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("categoriesDescription")}
            </p>
          </div>
        </div>
        <form
          action={createCategoryAction}
          className="grid gap-3 border border-border/50 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <Input name="block" placeholder={t("blockPlaceholder")} required />
          <Input
            name="category"
            placeholder={t("categoryPlaceholder")}
            required
          />
          <Input
            name="subcategory"
            placeholder={t("subcategoryPlaceholder")}
            required
          />
          <Button className="rounded-none">{t("create")}</Button>
        </form>
        <div className="overflow-hidden border border-border/50">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border/50 bg-muted/50">
                  <TableHead>{t("colId")}</TableHead>
                  <TableHead>{t("colBlock")}</TableHead>
                  <TableHead>{t("colCategory")}</TableHead>
                  <TableHead>{t("colSubcategory")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">
                    {t("colActions")}
                  </TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 bg-card/30">
                {categories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <td className="p-4 font-mono text-sm">{cat.id}</td>
                    <td className="p-4 text-sm font-medium">{cat.block}</td>
                    <td className="p-4 text-sm">{cat.category}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {cat.subcategory}
                    </td>
                    <StatusCell status={cat.status} />
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <form
                          action={async () => {
                            "use server";
                            await toggleCategoryStatusAction(
                              cat.id,
                              cat.status,
                            );
                          }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-none text-xs"
                          >
                            {t("toggle")}
                          </Button>
                        </form>
                        <form
                          action={async () => {
                            "use server";
                            await deleteCategoryAction(cat.id);
                          }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-none text-xs"
                          >
                            {t("delete")}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("countriesTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("countriesDescription")}
            </p>
          </div>
          <form
            action={createCountryAction}
            className="grid gap-3 border border-border/50 p-4 sm:grid-cols-[7rem_1fr_auto]"
          >
            <Input
              name="code"
              placeholder={t("countryCode")}
              maxLength={2}
              required
            />
            <Input name="name" placeholder={t("countryName")} required />
            <Button className="rounded-none">{t("create")}</Button>
          </form>
          <ReferenceTable
            emptyLabel={t("noCountries")}
            headers={[
              t("colCode"),
              t("colName"),
              t("colStatus"),
              t("colActions"),
            ]}
          >
            {countries.map((country) => (
              <tr
                key={country.code}
                className="transition-colors hover:bg-muted/20"
              >
                <td className="p-4 font-mono text-sm">{country.code}</td>
                <td className="p-4 text-sm font-medium">{country.name}</td>
                <StatusCell status={country.status} />
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <form
                      action={async () => {
                        "use server";
                        await toggleCountryStatusAction(
                          country.code,
                          country.status,
                        );
                      }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none text-xs"
                      >
                        {t("toggle")}
                      </Button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await deleteCountryAction(country.code);
                      }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none text-xs"
                      >
                        {t("delete")}
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </ReferenceTable>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("citiesTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("citiesDescription")}
            </p>
          </div>
          <form
            action={createCityAction}
            className="grid gap-3 border border-border/50 p-4 sm:grid-cols-[10rem_1fr_auto]"
          >
            <select
              name="countryCode"
              required
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              defaultValue=""
            >
              <option value="" disabled>
                {t("selectCountry")}
              </option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.code} - {country.name}
                </option>
              ))}
            </select>
            <Input name="name" placeholder={t("cityName")} required />
            <Button className="rounded-none">{t("create")}</Button>
          </form>
          <ReferenceTable
            emptyLabel={t("noCities")}
            headers={[
              t("colCountry"),
              t("colName"),
              t("colStatus"),
              t("colActions"),
            ]}
          >
            {cityRows.map((city) => (
              <tr key={city.id} className="transition-colors hover:bg-muted/20">
                <td className="p-4 text-sm font-medium">
                  {city.countryCode} - {city.countryName}
                </td>
                <td className="p-4 text-sm">{city.name}</td>
                <StatusCell status={city.status} />
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <form
                      action={async () => {
                        "use server";
                        await toggleCityStatusAction(city.id, city.status);
                      }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none text-xs"
                      >
                        {t("toggle")}
                      </Button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await deleteCityAction(city.id);
                      }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none text-xs"
                      >
                        {t("delete")}
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </ReferenceTable>
        </div>
      </section>
    </div>
  );

  function StatusCell({ status }: { status: string }) {
    return (
      <td className="p-4">
        <Badge
          variant={status === "ACTIVE" ? "default" : "secondary"}
          className="rounded-none"
        >
          {status === "ACTIVE" ? t("statusActive") : t("statusInactive")}
        </Badge>
      </td>
    );
  }

  function TableHead({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <th
        className={`p-4 text-sm font-medium uppercase tracking-wider text-muted-foreground ${className ?? ""}`}
      >
        {children}
      </th>
    );
  }

  function ReferenceTable({
    children,
    emptyLabel,
    headers,
  }: {
    children: React.ReactNode;
    emptyLabel: string;
    headers: string[];
  }) {
    const rows = Array.isArray(children) ? children.length : 1;

    return (
      <div className="overflow-hidden border border-border/50">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/50 bg-muted/50">
                {headers.map((header, index) => (
                  <TableHead
                    key={header}
                    className={index === headers.length - 1 ? "text-right" : ""}
                  >
                    {header}
                  </TableHead>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 bg-card/30">
              {rows > 0 ? (
                children
              ) : (
                <tr>
                  <td
                    colSpan={headers.length}
                    className="p-4 text-sm text-muted-foreground"
                  >
                    {emptyLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}
