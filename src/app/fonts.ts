import { Manrope, Oxanium } from "next/font/google";

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
