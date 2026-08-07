import { Titillium_Web } from "next/font/google";

export const fontBody = Titillium_Web({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  weight: ["200", "300", "400", "600", "700", "900"],
  display: "swap",
});

export const fontHeading = fontBody;
