import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KYLYVNYK CLUB",
    short_name: "KCLUB",
    description:
      "Private membership card, partner directory, and referral dashboard.",
    start_url: "/en/dashboard/profile",
    scope: "/",
    display: "standalone",
    background_color: "#090909",
    theme_color: "#090909",
    orientation: "portrait",
    categories: ["business", "lifestyle"],
    icons: [
      {
        src: "/brand/logo/card-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/logo/crown-gold-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
