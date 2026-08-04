import { Inter, Playfair_Display } from "next/font/google";

export const fontHeading = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-heading",
  weight: ["400", "700"],
  display: "swap",
});

export const fontBody = Inter({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
  display: "swap",
});
