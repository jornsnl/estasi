/**
 * Web app manifest for students, linked from the student layout. With it a
 * student can put the Academy on the home screen; on iPhone and iPad that is
 * the only way to get push notifications of the community (iOS 16.4+).
 */
import { manifestIcons } from "@/lib/brand-logo-urls";

// The icons follow the logo Sabine uploads in Instellingen, Logo's (src/app/api/logo).
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/dashboard",
    name: "Future Weddings Academy",
    short_name: "Academy",
    description: "De online opleiding van Estasi Weddings.",
    lang: "nl",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAF8F3",
    theme_color: "#FFFFFF",
    icons: manifestIcons("academy"),
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=600" },
  });
}
