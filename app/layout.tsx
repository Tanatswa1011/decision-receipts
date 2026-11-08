import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Receipts",
  description: "Every AI-agent decision gets a receipt. Code checks each fact against the systems of record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
