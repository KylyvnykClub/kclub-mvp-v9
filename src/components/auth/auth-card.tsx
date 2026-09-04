"use client";

import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The bordered panel the authentication screens put their form in.
 *
 * Extracted when the recovery screens were added: sign-in and registration had
 * each written this markup out, and the three new screens would have made five
 * copies of it — the point at which the next one drifts. The heading repeats
 * what `AuthShell` shows in the left column on purpose, because that column is
 * hidden below `lg` and the card is then the only thing on the page.
 */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="w-full border-white/10 bg-background text-foreground shadow-none">
      <CardHeader className="space-y-3 border-b border-border p-6 sm:p-8">
        <CardTitle className="text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-sm font-light leading-6 text-muted-foreground">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5 p-6 sm:p-8">{children}</CardContent>
    </Card>
  );
}
