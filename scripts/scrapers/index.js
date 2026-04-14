// PraskForce1 — Scraper Registry
//
// Maps portal_id (from src/lib/config.js) to a real Playwright-based
// scraper function. The runner dispatches through this registry —
// portals without an entry get marked "skipped" so the UI knows to
// offer the Claude-in-Chrome copy-paste fallback for them.
//
// To add a new portal scraper:
//   1. Create scripts/scrapers/<portal-name>.js with a default export
//      that takes { filters, logger } and returns a result object
//      (see miami-dade.js for the contract).
//   2. Register it here.
//   3. That's it — the runner and UI will automatically pick it up.

const { scrapeMiamiDade } = require('./miami-dade')

const SCRAPERS = {
  dade_county: scrapeMiamiDade,
  // TODO: add scrapers for other portals as we build them
  // cg_eden: scrapeCoralGablesEden,
  // sunbiz: scrapeSunbiz,
  // property_appraiser: scrapePropertyAppraiser,
  // mb_civic: scrapeMiamiBeachCivic,       // needs credentials
  // miami_ibuild: scrapeCityOfMiamiIBuild, // needs credentials
  // property_reports: scrapePropertyReports, // needs credentials
}

/** Returns true if a real scraper is registered for this portal_id. */
function hasScraper(portalId) {
  return portalId in SCRAPERS
}

/** Returns the scraper function for this portal_id, or null. */
function getScraper(portalId) {
  return SCRAPERS[portalId] || null
}

/** Returns the list of portal_ids with registered scrapers. */
function listScraperPortalIds() {
  return Object.keys(SCRAPERS)
}

module.exports = { SCRAPERS, hasScraper, getScraper, listScraperPortalIds }
