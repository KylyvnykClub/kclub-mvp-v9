import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getJoinLinkAction } from "@/actions/join-link";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { env } from "@/env";
import { countInviteTrialFunnel } from "@/data/business-applications";
import { db } from "@/data/db";

import { PageHeader } from "../_components/page-header";
import { JoinLinkPanel } from "./_components/join-link-panel";

/**
 * The club's join link, where the owner can read it, rotate it and revoke it
 * (FR-106, ADR 0033).
 *
 * Owner-only, like the other two screens that change what the club sells. The
 * secret is shown in full and on purpose: the whole point of the screen is to
 * hand the link to somebody.
 */
export default async function AdminJoinLinkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!can(actor, "manage_join_link", "join_link")) {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("admin.joinLink");
  const [memberLink, partnerLink, funnel] = await Promise.all([
    getJoinLinkAction("member"),
    getJoinLinkAction("partner"),
    countInviteTrialFunnel(db),
  ]);
  const tFunnel = await getTranslations("admin.inviteFunnel");
  const shown = (link: typeof memberLink) =>
    link
      ? { secret: link.secret, createdAt: link.createdAt.toISOString() }
      : null;

  // One card per kind of door (ADR 0040): each has its own link, and
  // rotating or revoking one leaves the other as it is.
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader title={t("title")} description={t("description")} />
      <JoinLinkPanel
        kind="member"
        initialLink={shown(memberLink)}
        baseUrl={env.server.NEXT_PUBLIC_APP_URL}
        locale={locale}
      />
      <JoinLinkPanel
        kind="partner"
        initialLink={shown(partnerLink)}
        baseUrl={env.server.NEXT_PUBLIC_APP_URL}
        locale={locale}
      />
      {/* ADR 0044 §7: the invite route, each step counted on its own. */}
      <section className="space-y-4 rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold">{tFunnel("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {tFunnel("description")}
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(
            [
              ["registered", funnel.registered],
              ["applied", funnel.applied],
              ["approved", funnel.approved],
              ["activated", funnel.activated],
              ["firstPaid", funnel.firstPaid],
              ["activeNow", funnel.activeNow],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {tFunnel(key)}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
