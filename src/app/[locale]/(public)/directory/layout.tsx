import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

/**
 * The catalogue and a partner's detail page carry the same chrome as the
 * marketing site.
 *
 * It lives in a layout rather than in each page because the two pages are one
 * journey: a visitor lands on the listing, opens a partner, and goes back. A
 * header that appears on one and not the other reads as a broken page.
 *
 * Deliberately scoped to `directory` rather than the whole `(public)` group:
 * `card/[token]` is a verification view shown to whoever scans a member's QR,
 * and wrapping that in site navigation would invite the scanner to wander into
 * the product instead of reading the one answer they came for.
 */
export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
