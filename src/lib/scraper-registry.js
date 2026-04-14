// PraskForce1 — Scraper Registry (web-side mirror)
//
// The actual scrapers live in scripts/scrapers/ (CommonJS, Node-only,
// runs in the local Playwright runner). This file mirrors the list of
// portal_ids that have a registered scraper so the web UI can show
// "🤖 Auto" vs "📋 Manual" badges and skip the copy-paste flow for
// automated portals.
//
// KEEP IN SYNC with scripts/scrapers/index.js:SCRAPERS. Only portal_ids.

export const AUTO_SCRAPER_PORTAL_IDS = new Set([
  'dade_county',
  // Add portal_ids here as we add real scrapers in scripts/scrapers/index.js
])

export function isAutoPortal(portalId) {
  return AUTO_SCRAPER_PORTAL_IDS.has(portalId)
}
