import type { MetadataRoute } from "next";

/**
 * Makes the app installable to the home screen (Android Chrome and iPhone). On iPhone that is also
 * the only way web push works at all (iOS 16.4+). Opens at "/", which lands on each person's own Pregled.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Colnix",
    short_name: "Colnix",
    description: "Naročila, dostava in računi",
    id: "/",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    categories: ["business", "productivity"],
    shortcuts: [
      { name: "Novo naročilo", url: "/pisarna/novo", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Dostava", url: "/dostava", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    background_color: "#f6f3ef",
    theme_color: "#7a1230",
    lang: "sl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
