/**
 * Web app manifest for couples (Your Wedding Space), linked from src/app/k/layout.tsx,
 * so a couple can put their portal on the home screen with the logo of Estasi Weddings
 * (feedback Sabine: couples see the Estasi logo, students the Future Weddings Academy logo).
 */
import { manifestIcons } from "@/lib/brand-logo-urls";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/k",
    name: "Your Wedding Space",
    short_name: "Wedding Space",
    description: "Jullie bruiloft met Estasi Weddings.",
    lang: "nl",
    dir: "ltr",
    // /k sends a couple on to their own portal.
    start_url: "/k",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAF8F3",
    theme_color: "#FFFFFF",
    icons: manifestIcons("estasi"),
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=600" },
  });
}
