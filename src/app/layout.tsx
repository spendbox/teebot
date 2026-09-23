import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teebot",
  description: "Your cautious crypto trading bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
