import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Playfair Display is the heading font of Your Wedding Space (its own house style, see .ws-theme).
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-playfair", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Future Weddings Academy", template: "%s · Future Weddings Academy" },
  description: "De online opleiding tot weddingplanner van Estasi Weddings.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${inter.variable} ${cormorant.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
