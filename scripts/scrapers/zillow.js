// PraskForce1 — Zillow Recently Sold Scraper (puppeteer-core)
//
// Discovery source. Pulls the "recently sold" search results for
// Miami, filtered by price floor, and returns each sale as a
// candidate row in the permits table (portal_source='zillow_sold',
// permit_type='Recent Sale').
//
// ⚠ ANTI-BOT WARNING
// Zillow aggressively fingerprints automated traffic. Run this from
// a RESIDENTIAL IP (your local machine), not from GHA/cloud VMs.
// Datacenter IPs will get you the Press & Hold captcha within
// minutes.
//
// STATUS: FIRST PASS / DIAGNOSTIC
// Extracts from the article[data-test="property-card"] cards using
// Zillow's late-2025 markup. Iterate on selectors after the first
// real run shows what's actually on the page.

const { launchBrowser, dumpPage } = require('./_puppeteer')

const PORTAL_ID = 'zillow_sold'
const DEFAULT_SEARCH_URL = 'https://www.zillow.com/homes/recently_sold/Miami-FL/'

async function extractSales(page, priceFloor, logger) {
  return await page.evaluate((floor) => {
    const cards = Array.from(document.querySelectorAll('article[data-test="property-card"]'))
    if (cards.length === 0) {
      return { debug: 'no data-test property cards found', sales: [] }
    }

    const sales = []
    for (const card of cards) {
      const priceEl = card.querySelector('[data-test="property-card-price"]')
      const addrEl = card.querySelector('[data-test="property-card-addr"], address')
      const linkEl = card.querySelector('a[href*="/homedetails/"], a[href*="/b/"]')
      const detailsEl = card.querySelector('ul')
      const photoEl = card.querySelector('img')

      const priceText = priceEl ? priceEl.textContent.trim() : ''
      const priceRaw = priceText.replace(/[^0-9]/g, '')
      const price = priceRaw ? parseInt(priceRaw, 10) : null

      if (floor && price && price < floor) continue

      sales.push({
        price,
        price_text: priceText,
        address: addrEl ? addrEl.textContent.trim() : null,
        detail_url: linkEl ? linkEl.href : null,
        details_text: detailsEl ? detailsEl.textContent.trim() : null,
        photo_url: photoEl ? photoEl.src : null,
      })
    }
    return { debug: `found ${cards.length} cards, ${sales.length} passed filter`, sales }
  }, priceFloor)
}

async function scrapeZillowSold({ filters = {}, logger = console.log } = {}) {
  logger(`[zillow] starting`)
  const priceFloor = filters.price_floor || 0
  const searchUrl = filters.zillow_search_url || DEFAULT_SEARCH_URL
  logger(`[zillow] URL: ${searchUrl}`)
  logger(`[zillow] price floor: $${(priceFloor / 1_000_000).toFixed(1)}M`)

  let browser
  try {
    browser = await launchBrowser(logger)
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    logger(`[zillow] navigating`)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // Wait for the card grid. If we hit the anti-bot gate, the
    // selector never appears and we time out — caught by the
    // bot-gate check below.
    try {
      await page.waitForSelector('article[data-test="property-card"], [data-test="search-results-list"]', { timeout: 15000 })
    } catch {
      // fall through to diagnostic dump
    }

    await dumpPage(page, 'zillow-results', logger)

    // Bot-gate detection
    const pageText = (await page.content()).toLowerCase()
    if (pageText.includes('press & hold') || pageText.includes('are you a human') || pageText.includes('captcha')) {
      logger(`    ⚠ hit Zillow's anti-bot gate`)
      return {
        portal_id: PORTAL_ID,
        status: 'failed',
        permits_found: 0,
        new_permits: 0,
        summary: null,
        error: 'Hit Zillow anti-bot gate (Press & Hold / captcha). Run with PF1_HEADLESS=false and solve interactively, or add a residential proxy.',
        permits: [],
      }
    }

    const { debug, sales } = await extractSales(page, priceFloor, logger)
    logger(`    ${debug}`)

    // Map sales → permits shape. Zillow discovery emits rows into the
    // permits table with portal_source='zillow_sold' so they surface
    // on /leads and can be converted to curated target properties.
    const discovered = sales.map(s => ({
      portal_id: PORTAL_ID,
      permit_number: s.detail_url
        ? `ZILLOW-${s.detail_url.split('/').filter(Boolean).pop()}`
        : `ZILLOW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      permit_type: 'Recent Sale',
      permit_status: 'closed',
      date_filed: null,
      valuation: s.price,
      scope_description: s.details_text,
      address: s.address,
      raw_link: s.detail_url,
    }))

    const status = discovered.length > 0 ? 'success' : 'partial'
    const summary = discovered.length > 0
      ? `Found ${discovered.length} recent sales at or above $${(priceFloor / 1_000_000).toFixed(1)}M`
      : `Diagnostic run — page loaded but no sale cards matched. Inspect .agent-runs/scrapers/zillow-results-*.html to see what's on the page.`

    return {
      portal_id: PORTAL_ID,
      status,
      permits_found: discovered.length,
      new_permits: discovered.length,
      summary,
      error: null,
      permits: discovered,
    }
  } catch (e) {
    logger(`[zillow] FAILED: ${e.message}`)
    return {
      portal_id: PORTAL_ID,
      status: 'failed',
      permits_found: 0,
      new_permits: 0,
      summary: null,
      error: `Puppeteer error: ${e.message}`,
      permits: [],
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

module.exports = { scrapeZillowSold }
