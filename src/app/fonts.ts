import {
  Geist,
  Manrope,
  Oxanium,
  Playfair_Display,
  Prata,
} from "next/font/google";

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

/**
 * The two faces the client's landing design is set in.
 *
 * `DESIGN_RULES.md` in the Kylyvnyk-Landing prototype names them: Prata for the
 * headline and every section heading, Geist for body copy and controls. Both
 * ship Cyrillic, which is the reason they survived the check - the landing is
 * read in three languages and a Latin-only display face drops the other two to
 * a system fallback mid-page.
 *
 * Scoped to the landing by `src/app/kylyvnyk-landing.css`, which maps them onto
 * the prototype's own `--display` / `--body` variables. The rest of the site
 * keeps Manrope and Oxanium.
 */
export const fontLandingDisplay = Prata({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-prata",
  weight: ["400"],
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const fontLandingBody = Geist({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-geist",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
