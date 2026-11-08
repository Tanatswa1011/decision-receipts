import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Receipts",
  description: "Every AI-agent decision gets a receipt. Code checks each fact against the systems of record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
