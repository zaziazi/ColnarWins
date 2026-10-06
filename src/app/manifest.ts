import type { MetadataRoute } from "next";

/**
 * Makes the app installable to the home screen — on iPhone that is the only
 * way web push works at all (iOS 16.4+), so drivers must install it once.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Colnix",
    short_name: "Colnix",
    description: "Naročila, dostava in računi",
    start_url: "/dostava",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3ef",
    theme_color: "#7a1230",
    lang: "sl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
