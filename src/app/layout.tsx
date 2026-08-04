import type { ReactNode } from "react";

// Root layout exists only as the required top-level entry point.
// Locale-specific rendering (html lang, messages, metadata) lives
// in src/app/[locale]/layout.tsx. This wrapper must not set <html>
// or <body> — that is the locale layout's job.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
