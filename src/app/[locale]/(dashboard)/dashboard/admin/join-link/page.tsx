import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getJoinLinkAction } from "@/actions/join-link";
import { getCurrentMember } from "@/actions/session";
import { buildActor } from "@/domain/actor";
import { can } from "@/domain/authorization";
import { env } from "@/env";

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
  const link = await getJoinLinkAction();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader title={t("title")} description={t("description")} />
      <JoinLinkPanel
        initialLink={
          link
            ? { secret: link.secret, createdAt: link.createdAt.toISOString() }
            : null
        }
        baseUrl={env.server.NEXT_PUBLIC_APP_URL}
        locale={locale}
      />
    </div>
  );
}
