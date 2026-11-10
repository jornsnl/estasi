/**
 * Where Sabine's logos are served (src/app/api/logo), kept free of server imports
 * for the manifests and the metadata of the layouts. See src/lib/brand-logos.ts.
 */
export const LOGO_KINDS = ["academy", "estasi", "app"] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

/** The icons of a web app manifest, made from one logo. */
export const manifestIcons = (kind: LogoKind) => [
  { src: `/api/logo/${kind}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: `/api/logo/${kind}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
  { src: `/api/logo/${kind}/maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  { src: `/api/logo/${kind}/icon-180.png`, sizes: "180x180", type: "image/png" },
];

/** The favicon and home screen icon of a layout (Next metadata `icons`). */
export const metadataIcons = (kind: LogoKind) => ({
  icon: [{ url: `/api/logo/${kind}/icon-32.png`, sizes: "32x32", type: "image/png" }, { url: `/api/logo/${kind}/icon-192.png`, sizes: "192x192", type: "image/png" }],
  apple: [{ url: `/api/logo/${kind}/icon-180.png`, sizes: "180x180", type: "image/png" }],
});
