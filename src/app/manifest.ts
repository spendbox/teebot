import type { MetadataRoute } from "next";

// Lets phones and computers install Teebot as an app (Add to Home Screen).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Teebot",
    short_name: "Teebot",
    description: "Your Bitcoin trading bot",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b14",
    theme_color: "#0b0b14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
