import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Davi & Dani Photo Studio",
  description: "AI product photography studio — Zara-inspired images from iPhone uploads",
};

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${instrumentSerif.variable} ${jetBrainsMono.variable} min-h-screen bg-neutral-50 text-neutral-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
