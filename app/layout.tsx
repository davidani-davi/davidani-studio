import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Davi & Dani Photo Studio",
  description: "AI product photography studio — Zara-inspired images from iPhone uploads",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
