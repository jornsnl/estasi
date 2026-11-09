/**
 * Web app manifest for Sabine's admin portal, so she can put it on the home
 * screen of her iPhone (Safari, Share, "Zet op beginscherm") and open it
 * full screen like an app. Only linked from the /beheer layout, so students
 * and couples never get an "install" for the admin.
 */
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/beheer",
    name: "Estasi Beheer",
    short_name: "Estasi",
    description: "Beheer van de Future Weddings Academy en Your Wedding Space.",
    lang: "nl",
    dir: "ltr",
    start_url: "/beheer",
    // The whole site, so the couple portals (/k/...) and the login stay inside the app.
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
    shortcuts: [
      { name: "Cursisten", url: "/beheer", icons: [{ src: "/pwa/beheer-192.png", sizes: "192x192" }] },
      { name: "Bruidsparen", url: "/beheer/bruidsparen", icons: [{ src: "/pwa/beheer-192.png", sizes: "192x192" }] },
      { name: "Mijn takenbord", url: "/beheer/bruidsparen/takenbord", icons: [{ src: "/pwa/beheer-192.png", sizes: "192x192" }] },
      { name: "Mijn agenda", url: "/beheer/bruidsparen/agenda", icons: [{ src: "/pwa/beheer-192.png", sizes: "192x192" }] },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
