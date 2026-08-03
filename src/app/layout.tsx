import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "KCLUB",
  description: "A closed international business club.",
  // Nothing is indexable until the marketing site exists and the member area,
  // staff console and verification page have their own rules — FR-024, FR-089.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// The locale is hard-coded until next-intl arrives in T-0.14, at which point it
// comes from the route segment. Leaving it unset is worse: a missing lang
// attribute breaks screen readers, and docs/ux.md §8 commits to WCAG 2.1 AA.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
