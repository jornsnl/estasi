import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Your Wedding Space", template: "%s · Your Wedding Space" },
  description: "Jullie persoonlijke omgeving bij Estasi Weddings.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${inter.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
