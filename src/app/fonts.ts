import { Manrope, Oxanium, Playfair_Display } from "next/font/google";

export const fontBody = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const fontHeading = Oxanium({
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/**
 * The club's display serif, for the landing page's wordmark and section
 * headings.
 *
 * The reference design sets the brand in Roman inscriptional capitals with
 * hairline serifs; Oxanium, the heading face everywhere else, is a squared
 * techno sans and cannot carry that. Playfair Display is the closest face on
 * Google Fonts that also ships Cyrillic - Cinzel, Marcellus and Gilda Display
 * are all a better shape and all Latin-only, which rules them out for a club
 * whose subtitle is "Международный бизнес-клуб".
 *
 * Scoped to the landing rather than swapped in for `--font-heading`: changing
 * that variable restyles the catalogue, the dashboard and the staff console
 * too, which is a separate decision.
 */
export const fontDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-display-serif",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
