import type { Metadata } from "next";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { countUnreadForMember } from "@/data/notifications";
import { buildActor, staffAtLeast } from "@/domain/actor";
import { DashboardChrome } from "./_components/dashboard-chrome";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function DashboardLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const result = await getCurrentMember();
  if (!result || !result.member) {
    redirect(`/${locale}/login`);
  }
  const actor = buildActor(result.member);
  const canAccessAdmin = staffAtLeast(actor, "staff_support");

  // The badge count is fetched here rather than inside SiteHeader, because that
  // header is also the marketing header on every public page - giving it a
  // query of its own would put one on routes that have no member at all
  // (FR-099). Public pages render it with no prop and no badge.
  const unreadCount = await countUnreadForMember(db, result.member.id);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <DashboardChrome admin={canAccessAdmin} unreadCount={unreadCount}>
        {children}
      </DashboardChrome>
    </div>
  );
}
