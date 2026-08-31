import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

  // The collapsed/expanded choice survives reloads the way the sidebar
  // primitive persists it: a plain (non-sensitive) cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar
        actor={actor}
        displayName={session.member.displayName}
        roleLabel={actor.type === "staff" ? actor.role.replace("_", " ") : ""}
        counts={{
          pendingCompanies: metrics.pendingCompanies,
          pendingReferrals: metrics.pendingReferrals,
        }}
      />
      <SidebarInset className="min-w-0 overflow-x-clip">
        <AdminTopbar />
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
