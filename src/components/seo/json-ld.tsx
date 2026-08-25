import { absoluteUrl } from "@/lib/seo";

/**
 * Renders a JSON-LD structured-data block. `<` is escaped to `<` so a
 * value carried in from company-supplied text (name, description) can never
 * break out of the script element.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** The publisher node, reused as the site identity across pages. */
export function organizationLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "KYLYVNYK CLUB",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/brand/logo/crown-gold-logo.png"),
  };
}

/** WebSite node for the home page. */
export function websiteLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "KYLYVNYK CLUB",
    url: absoluteUrl("/"),
  };
}

/**
 * Organization node for a partner's public landing page. Address parts are
 * included only when present; the club never exposes a member, so nothing here
 * derives from the owning member's identity.
 */
export function partnerLd(partner: {
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  country?: string | null;
  city?: string | null;
}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: partner.name,
    url: absoluteUrl(`/directory/${partner.slug}`),
  };
  if (partner.description) node.description = partner.description;
  if (partner.website) node.sameAs = [partner.website];
  if (partner.logoUrl) node.logo = partner.logoUrl;

  if (partner.country || partner.city) {
    const address: Record<string, unknown> = { "@type": "PostalAddress" };
    if (partner.country) address.addressCountry = partner.country;
    if (partner.city) address.addressLocality = partner.city;
    node.address = address;
  }
  return node;
}
