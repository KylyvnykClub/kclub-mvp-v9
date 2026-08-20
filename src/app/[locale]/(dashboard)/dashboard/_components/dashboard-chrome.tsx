"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardHeader } from "./dashboard-header";
import type { Actor } from "@/domain/actor";

export function DashboardChrome({
  actor,
  children,
}: {
  actor: Actor;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.includes("/dashboard/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <DashboardHeader actor={actor} />
      <main className="flex-1">
        <div className="kclub-shell py-8 sm:py-10">{children}</div>
      </main>
    </>
  );
}
