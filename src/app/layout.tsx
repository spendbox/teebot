import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "./pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teebot",
  description: "Your Bitcoin trading bot",
  applicationName: "Teebot",
  appleWebApp: { capable: true, title: "Teebot", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
