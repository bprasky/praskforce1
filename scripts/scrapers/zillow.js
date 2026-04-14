// PraskForce1 — Zillow Recently Sold Scraper
//
// Discovery source. Pulls the "recently sold" search results for a
// geographic area (Miami by default), filtered by price floor, and
// returns each sale as a candidate for the pipeline.
//
// ⚠ ANTI-BOT WARNING
// Zillow aggressively fingerprints and rate-limits automated traffic.
// This scraper is designed to run from a RESIDENTIAL IP (your local
// machine), not from cloud VMs (GitHub Actions, Vercel, AWS). Running
// it from a datacenter IP will get you served a Press & Hold CAPTCHA
// or a 403 within minutes.
//
// Mitigations:
//   - Realistic user-agent, normal viewport
//   - Reads from the site's normal search URL (no private API)
//   - One page fetch per run, no pagination hammer
//   - Headless=false by default on first pass for debugging
//
// If we start getting blocked, the next step is a residential proxy
// (Bright Data, Smartproxy etc), which costs ~$10/mo and is worth it
// for daily discovery.
//
// This first pass is DIAGNOSTIC: it opens the search URL, dumps a
// screenshot + HTML to scripts/scrapers/.debug/, tries to extract
// sale cards using heuristic selectors, and returns whatever it finds.
// Iterate on selectors after you see the real output.

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const PORTAL_ID = 'zillow_sold'
const DEFAULT_SEARCH_URL = 'https://www.zillow.com/homes/recently_sold/Miami-FL/'
const DEBUG_DIR = path.join(__dirname, '.debug')

function ensureDebugDir() { fs.mkdirSync(DEBUG_DIR, { recursive: true }) }
function ts() { return new Date().toISOString().replace(/[:.]/g, '-') }

async function dumpPage(page, label, logger) {
  ensureDebugDir()
  const stamp = ts()
  const pngPath = path.join(DEBUG_DIR, `zillow-${label}-${stamp}.png`)
  const htmlPath = path.join(DEBUG_DIR, `zillow-${label}-${stamp}.html`)
  try {
    await page.screenshot({ path: pngPath, fullPage: true })
    logger(`    📸 ${pngPath}`)
  } catch (e) { logger(`    ⚠ screenshot failed: ${e.message}`) }
  try {
    const html = await page.content()
    fs.writeFileSync(htmlPath, html)
    logger(`    📄 ${htmlPath}`)
  } catch (e) { logger(`    ⚠ html dump failed: ${e.message}`) }
}

// Extract sales using Zillow's standard card structure. These selectors
// are the ones Zillow uses as of late 2025 — verify after each redesign.
async function extractSales(page, priceFloor, logger) {
  return await page.evaluate(({ priceFloor: floor }) => {
    // Primary: the article cards on the search results page
    const cards = Array.from(document.querySelectorAll('article[data-test="property-card"]'))
    if (cards.length === 0) {
      // Fallback: older card structure
      return { debug: 'no data-test property cards found', sales: [] }
    }

    const sales = []
    for (const card of cards) {
      const priceEl = card.querySelector('[data-test="property-card-price"]')
      const addrEl = card.querySelector('[data-test="property-card-addr"], address')
      const linkEl = card.querySelector('a[href*="/homedetails/"], a[href*="/b/"]')
      const detailsEl = card.querySelector('ul.StyledPropertyCardHomeDetailsList-c11n-8-109-3__sc-1j0som5-0, ul')
      const photoEl = card.querySelector('img')

      const priceText = priceEl?.textContent?.trim() || ''
      const priceRaw = priceText.replace(/[^0-9]/g, '')
      const price = priceRaw ? parseInt(priceRaw, 10) : null

      if (floor && price && price < floor) continue

      sales.push({
        price,
        price_text: priceText,
        address: addrEl?.textContent?.trim() || null,
        detail_url: linkEl?.href || null,
        details_text: detailsEl?.textContent?.trim() || null,
        photo_url: photoEl?.src || null,
      })
    }
    return { debug: `found ${cards.length} cards, ${sales.length} passed filter`, sales }
  }, { priceFloor })
}

async function scrapeZillowSold({ filters = {}, logger = console.log } = {}) {
  logger(`[zillow] starting`)
  const priceFloor = filters.price_floor || 0
  const searchUrl = filters.zillow_search_url || DEFAULT_SEARCH_URL
  logger(`[zillow] URL: ${searchUrl}`)
  logger(`[zillow] price floor: $${(priceFloor / 1_000_000).toFixed(1)}M`)

  let browser
  try {
    browser = await chromium.launch({
      headless: process.env.PF1_HEADLESS !== '0',
      timeout: 30000,
    })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1400, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    })
    const page = await context.newPage()

    logger(`[zillow] navigating`)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // Wait for the card grid to render. If we get the anti-bot gate
    // we'll see "Press & Hold" or a captcha iframe and we abort.
    try {
      await page.waitForSelector('article[data-test="property-card"], [data-test="search-results-list"]', { timeout: 15000 })
    } catch {
      // Fall through to diagnostic dump — we'll see why in the HTML
    }

    await dumpPage(page, 'results', logger)

    // Bot-gate check
    const pageText = (await page.content()).toLowerCase()
    if (pageText.includes('press & hold') || pageText.includes('are you a human') || pageText.includes('captcha')) {
      logger(`    ⚠ hit Zillow's anti-bot gate`)
      return {
        portal_id: PORTAL_ID,
        status: 'failed',
        permits_found: 0,
        new_permits: 0,
        summary: null,
        error: 'Hit Zillow anti-bot gate (Press & Hold / captcha). Run with PF1_HEADLESS=0 to solve it once interactively, or add a residential proxy.',
        permits: [],
      }
    }

    const { debug, sales } = await extractSales(page, priceFloor, logger)
    logger(`    ${debug}`)

    // Map sales → permits shape. Zillow discovery doesn't produce
    // permits directly — it produces candidate addresses that feed the
    // enrichment step. For now we emit them through the same permits
    // channel with portal_id='zillow_sold' so they land in the
    // permits table as "discovered" rows, tagged by source. We can
    // evolve this later to write to a separate properties table.
    const discovered = sales.map(s => ({
      portal_id: PORTAL_ID,
      permit_number: s.detail_url ? `ZILLOW-${s.detail_url.split('/').filter(Boolean).pop()}` : `ZILLOW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      : `Diagnostic run — page loaded but no sale cards matched. Inspect scripts/scrapers/.debug/zillow-results-*.html to see what's on the page.`

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
      error: `Playwright error: ${e.message}`,
      permits: [],
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

module.exports = { scrapeZillowSold }
