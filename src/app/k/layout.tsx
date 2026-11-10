import type { Metadata } from "next";
import { metadataIcons } from "@/lib/brand-logo-urls";

// Couples see the logo of Estasi Weddings as icon and can put the portal on the home screen.
export const metadata: Metadata = {
  manifest: "/wedding.webmanifest",
  icons: metadataIcons("estasi"),
  appleWebApp: { capable: true, title: "Wedding Space", statusBarStyle: "default" },
};

export default function CoupleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
