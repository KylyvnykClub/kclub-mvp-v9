import type { Metadata } from "next";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
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

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <DashboardChrome>{children}</DashboardChrome>
    </div>
  );
}
