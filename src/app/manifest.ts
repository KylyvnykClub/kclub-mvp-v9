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
    // Square files whose real size is the one declared - a constraint test
    // reads the PNG headers. The crown logos used before were 81x103 and
    // 596x418 but claimed 512x512, which browsers reject.
    icons: [
      {
        src: "/brand/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
