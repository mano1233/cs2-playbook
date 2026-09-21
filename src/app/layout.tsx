import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Playbook",
  description: "CS2 team strategies, per map and side.",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&" +
  "family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
