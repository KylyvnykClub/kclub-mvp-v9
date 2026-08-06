import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentMember } from "@/actions/session";
import { DashboardHeader } from "./_components/dashboard-header";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
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
      <DashboardHeader isAdmin={result.member.role === "admin"} />
      <main className="flex-1">
        <div className="container mx-auto py-8">{children}</div>
      </main>
    </div>
  );
}
