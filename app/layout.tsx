import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./paper.css";

export const metadata: Metadata = {
  title: "Davi & Dani Studio",
  description: "Your workspace for product photography, creative experiments, and seasonal design.",
};

const inter = Inter({ subsets: ["latin"], display: "swap", weight: ["400", "500"], variable: "--font-inter" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} paper-app min-h-screen bg-neutral-50 text-neutral-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
