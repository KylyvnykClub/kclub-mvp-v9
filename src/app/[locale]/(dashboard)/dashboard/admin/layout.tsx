import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { getSupportMetricsAction } from "@/actions/admin-support";
import { buildActor, staffAtLeast } from "@/domain/actor";
import { AdminSidebar } from "./_components/admin-sidebar";
import { AdminTopbar } from "./_components/admin-topbar";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCurrentMember();
  if (!session?.member) {
    redirect(`/${locale}/login`);
  }

  const actor = buildActor(session.member);
  if (!staffAtLeast(actor, "staff_support")) {
    redirect(`/${locale}/dashboard`);
  }

  const metrics = await getSupportMetricsAction();

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar
        actor={actor}
        displayName={session.member.displayName}
        roleLabel={actor.type === "staff" ? actor.role.replace("_", " ") : ""}
        counts={{
          pendingCompanies: metrics.pendingCompanies,
          pendingReferrals: metrics.pendingReferrals,
        }}
      />
      <div className="lg:pl-60">
        <AdminTopbar />
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
