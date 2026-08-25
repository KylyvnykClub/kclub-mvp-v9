"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export function DashboardChrome({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.includes("/dashboard/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <SiteHeader member admin={admin} />
      <main className="flex-1">
        <div className="kclub-shell py-8 sm:py-10">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
