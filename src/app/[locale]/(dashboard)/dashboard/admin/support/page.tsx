import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { redirect } from "next/navigation";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { getSupportMetricsAction } from "@/actions/admin-support";
import { Users, UserCheck, UserPlus, Building, Handshake } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../_components/page-header";
import { SectionLabel } from "../_components/section-label";
import { StatTile } from "../_components/stat-tile";

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
  const numberFormatter = new Intl.NumberFormat(locale);

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
    <div className="w-full space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <section className="space-y-3">
        <SectionLabel>{t("membersTitle")}</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label={t("totalMembers")}
            value={numberFormatter.format(metrics.totalMembers)}
            icon={Users}
          />
          <StatTile
            label={t("activeMembers")}
            value={numberFormatter.format(metrics.activeMembers)}
            icon={UserCheck}
          />
          <StatTile
            label={t("newMembers")}
            value={numberFormatter.format(metrics.newMembers)}
            icon={UserPlus}
            footnote={t("last7Days")}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("queuesTitle")}</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          {queues.map((queue) => (
            // Each link lands on the queue already filtered, so the count on
            // the tile and the rows on the next screen are the same set.
            <Link
              key={queue.key}
              href={queue.href}
              className="group rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <StatTile
                label={queue.label}
                value={numberFormatter.format(queue.count)}
                icon={queue.icon}
                footnote={
                  queue.count > 0 ? t("clickToReview") : t("queueClear")
                }
                className="h-full transition-colors group-hover:border-accent/60"
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
