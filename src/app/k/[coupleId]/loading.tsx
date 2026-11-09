/**
 * Shown at once while the next page of the portal loads (feedback: page
 * changes felt slow). With this boundary Next.js can also prefetch the menu
 * links up to here, so a click answers immediately.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Laden">
      <div className="h-4 w-24 rounded bg-cream-deep" />
      <div className="h-8 w-64 rounded bg-cream-deep" />
      <div className="h-40 rounded-2xl bg-white/70" />
      <div className="h-24 rounded-2xl bg-white/70" />
    </div>
  );
}
