import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getSupportMetricsAction } from "@/actions/admin-support";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  UserCheck,
  UserPlus,
  Building,
  Handshake,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { KpiCard } from "../_components/kpi-card";

/**
 * The mockup behind this redesign shows a support ticket queue. No ticket
 * entity exists anywhere in the schema, so this screen stays what it already
 * was - the metrics a support agent starts their day with, plus a way into the
 * two queues that do exist. Inventing a queue with no backing table would have
 * been a screen that could never show a real row.
 */
export default async function AdminSupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin.support");
  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "read", "moderation")) {
    redirect(`/${locale}/dashboard`);
  }

  const metrics = await getSupportMetricsAction();

  const queues = [
    {
      key: "companies",
      href: `/${locale}/dashboard/admin/companies?status=pending`,
      label: t("pendingCompanies"),
      count: metrics.pendingCompanies,
      icon: Building,
    },
    {
      key: "referrals",
      href: `/${locale}/dashboard/admin/referrals?status=pending_review`,
      label: t("pendingReferrals"),
      count: metrics.pendingReferrals,
      icon: Handshake,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={t("totalMembers")}
          value={String(metrics.totalMembers)}
          icon={Users}
        />
        <KpiCard
          label={t("activeMembers")}
          value={String(metrics.activeMembers)}
          icon={UserCheck}
        />
        <KpiCard
          label={t("newMembers")}
          value={String(metrics.newMembers)}
          icon={UserPlus}
          footnote={t("last7Days")}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("queuesTitle")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {queues.map((queue) => (
            // Each link lands on the queue already filtered, so the count on
            // the card and the rows on the next screen are the same set.
            <Link key={queue.key} href={queue.href} className="group">
              <Card className="border-border/50 bg-card/50 transition-colors group-hover:border-accent/60">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {queue.label}
                  </CardTitle>
                  <queue.icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-2xl font-bold">{queue.count}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {queue.count > 0 ? t("clickToReview") : t("queueClear")}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
