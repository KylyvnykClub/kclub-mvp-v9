import Link from "next/link";

/**
 * The 404 for a path that never reached a locale segment — a stray link to
 * `/dashbord`, a crawler guessing. It renders outside `[locale]/layout.tsx`, so
 * it carries its own document and cannot use next-intl: there is no locale to
 * translate into. English, and one link into the localised site.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            404
          </p>
          <h1 className="max-w-xl text-3xl font-black uppercase leading-none tracking-[-0.02em] text-foreground sm:text-4xl">
            This page does not exist
          </h1>
          <Link
            href="/en"
            className="mt-2 flex h-12 items-center justify-center bg-accent px-8 text-xs font-black uppercase tracking-[0.16em] text-accent-foreground hover:bg-[#b49126]"
          >
            Go to the home page
          </Link>
        </main>
      </body>
    </html>
  );
}
