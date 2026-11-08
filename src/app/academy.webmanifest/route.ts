/**
 * Web app manifest for students, linked from the student layout. With it a
 * student can put the Academy on the home screen; on iPhone and iPad that is
 * the only way to get push notifications of the community (iOS 16.4+).
 */
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/dashboard",
    name: "Wedding Plan Academy",
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
    icons: [
      { src: "/pwa/beheer-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/beheer-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/beheer-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
