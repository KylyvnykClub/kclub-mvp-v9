import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/data/db";
import { listAllCategories, listCountries } from "@/data/companies";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { PageHeader } from "../_components/page-header";
import { ConsoleSection } from "../_components/console-section";
import { ConfirmActionButton } from "../_components/confirm-action-button";
import { StatusBadge } from "../_components/status-badge";
import {
  DataTable,
  DataTableEmpty,
  DataTableHeader,
} from "../_components/data-table";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

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

  function StatusCell({ status }: { status: string }) {
    return (
      <TableCell>
        <StatusBadge
          tone={status === "ACTIVE" ? "positive" : "neutral"}
          label={status === "ACTIVE" ? t("statusActive") : t("statusInactive")}
        />
      </TableCell>
    );
  }

  /** Activate/deactivate is reversible, so it stays a plain one-click form. */
  function ToggleButton({
    action,
    status,
  }: {
    action: () => Promise<void>;
    status: string;
  }) {
    return (
      <form action={action}>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          {status === "ACTIVE" ? t("deactivate") : t("activate")}
        </Button>
      </form>
    );
  }

  function RowTable({ children }: { children: ReactNode }) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <DataTable containerClassName="max-h-[28rem]">{children}</DataTable>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <ConsoleSection
        title={t("categoriesTitle")}
        description={t("categoriesDescription")}
        contentClassName="space-y-4"
      >
        <form
          action={createCategoryAction}
          className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <div className="space-y-2">
            <Label htmlFor="cat-block">{t("colBlock")}</Label>
            <Input id="cat-block" name="block" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-category">{t("colCategory")}</Label>
            <Input id="cat-category" name="category" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-subcategory">{t("colSubcategory")}</Label>
            <Input id="cat-subcategory" name="subcategory" required />
          </div>
          <div className="flex items-end">
            <Button type="submit">{t("create")}</Button>
          </div>
        </form>

        <RowTable>
          <DataTableHeader>
            <TableRow>
              <TableHead className="hidden md:table-cell">
                {t("colId")}
              </TableHead>
              <TableHead>{t("colBlock")}</TableHead>
              <TableHead>{t("colCategory")}</TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("colSubcategory")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </DataTableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <DataTableEmpty colSpan={6} message={t("noCategories")} />
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {cat.id}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {cat.block}
                  </TableCell>
                  <TableCell className="text-sm">{cat.category}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {cat.subcategory}
                  </TableCell>
                  <StatusCell status={cat.status} />
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <ToggleButton
                        status={cat.status}
                        action={async () => {
                          "use server";
                          await toggleCategoryStatusAction(cat.id, cat.status);
                        }}
                      />
                      <ConfirmActionButton
                        action={async () => {
                          "use server";
                          await deleteCategoryAction(cat.id);
                        }}
                        label={t("delete")}
                        icon={<Trash2 className="size-4" aria-hidden="true" />}
                        title={t("deleteCategoryTitle")}
                        description={t("deleteCategoryDescription", {
                          name: `${cat.block} / ${cat.category} / ${cat.subcategory}`,
                        })}
                        confirmLabel={t("delete")}
                        successMessage={t("deletedToast")}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </RowTable>
      </ConsoleSection>

      <div className="grid items-start gap-8 xl:grid-cols-2">
        <ConsoleSection
          title={t("countriesTitle")}
          description={t("countriesDescription")}
          contentClassName="space-y-4"
        >
          <form
            action={createCountryAction}
            className="grid gap-4 sm:grid-cols-[7rem_1fr_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="country-code">{t("countryCode")}</Label>
              <Input id="country-code" name="code" maxLength={2} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country-name">{t("countryName")}</Label>
              <Input id="country-name" name="name" required />
            </div>
            <div className="flex items-end">
              <Button type="submit">{t("create")}</Button>
            </div>
          </form>

          <RowTable>
            <DataTableHeader>
              <TableRow>
                <TableHead>{t("colCode")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </DataTableHeader>
            <TableBody>
              {countries.length === 0 ? (
                <DataTableEmpty colSpan={4} message={t("noCountries")} />
              ) : (
                countries.map((country) => (
                  <TableRow key={country.code}>
                    <TableCell className="font-mono text-sm">
                      {country.code}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {country.name}
                    </TableCell>
                    <StatusCell status={country.status} />
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <ToggleButton
                          status={country.status}
                          action={async () => {
                            "use server";
                            await toggleCountryStatusAction(
                              country.code,
                              country.status,
                            );
                          }}
                        />
                        <ConfirmActionButton
                          action={async () => {
                            "use server";
                            await deleteCountryAction(country.code);
                          }}
                          label={t("delete")}
                          icon={
                            <Trash2 className="size-4" aria-hidden="true" />
                          }
                          title={t("deleteCountryTitle")}
                          description={t("deleteCountryDescription", {
                            name: country.name,
                          })}
                          confirmLabel={t("delete")}
                          successMessage={t("deletedToast")}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </RowTable>
        </ConsoleSection>

        <ConsoleSection
          title={t("citiesTitle")}
          description={t("citiesDescription")}
          contentClassName="space-y-4"
        >
          <form
            action={createCityAction}
            className="grid gap-4 sm:grid-cols-[10rem_1fr_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="city-country">{t("colCountry")}</Label>
              <select
                id="city-country"
                name="countryCode"
                required
                className={SELECT_CLASS}
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="city-name">{t("cityName")}</Label>
              <Input id="city-name" name="name" required />
            </div>
            <div className="flex items-end">
              <Button type="submit">{t("create")}</Button>
            </div>
          </form>

          <RowTable>
            <DataTableHeader>
              <TableRow>
                <TableHead>{t("colCountry")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </DataTableHeader>
            <TableBody>
              {cityRows.length === 0 ? (
                <DataTableEmpty colSpan={4} message={t("noCities")} />
              ) : (
                cityRows.map((city) => (
                  <TableRow key={city.id}>
                    <TableCell className="text-sm font-medium">
                      {city.countryCode} - {city.countryName}
                    </TableCell>
                    <TableCell className="text-sm">{city.name}</TableCell>
                    <StatusCell status={city.status} />
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <ToggleButton
                          status={city.status}
                          action={async () => {
                            "use server";
                            await toggleCityStatusAction(city.id, city.status);
                          }}
                        />
                        <ConfirmActionButton
                          action={async () => {
                            "use server";
                            await deleteCityAction(city.id);
                          }}
                          label={t("delete")}
                          icon={
                            <Trash2 className="size-4" aria-hidden="true" />
                          }
                          title={t("deleteCityTitle")}
                          description={t("deleteCityDescription", {
                            name: city.name,
                          })}
                          confirmLabel={t("delete")}
                          successMessage={t("deletedToast")}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </RowTable>
        </ConsoleSection>
      </div>
    </div>
  );
}
