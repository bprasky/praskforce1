// PraskForce1 — Miami-Dade County Permit Scraper (puppeteer-core)
//
// Public enrichment portal. Given a set of target addresses, this
// scraper looks up permits for each one via the Miami-Dade
// ePermitting system.
//
// STATUS: FIRST PASS / DIAGNOSTIC
// The exact DOM structure isn't documented publicly. This first
// pass opens the landing page, dumps a screenshot + HTML to
// .agent-runs/scrapers/, tries some heuristic selectors for the
// permit search, and extracts whatever looks like a permits table.
//
// After you run it once, paste me the console output + screenshot
// and I'll tighten the selectors.
//
// Migrated from Playwright to puppeteer-core so it lives in the
// same browser-automation stack as src/lib/agent-engine.js and
// scripts/test-puppeteer.mjs.

const { launchBrowser, dumpPage, sleep } = require('./_puppeteer')

const PORTAL_ID = 'dade_county'
const PORTAL_LANDING_URL = 'https://www.miamidade.gov/Apps/RER/ePermittingMenu'

// Heuristic extractor — scans all tables on the page and picks the
// one whose header row looks most like a permits table. Tightens
// column mapping by keyword matching.
async function extractPermitsFromTable(page, logger) {
  const extracted = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'))
    const scored = tables.map(t => {
      const headerText = (t.querySelector('thead')?.innerText || t.rows?.[0]?.innerText || '').toLowerCase()
      const score =
        (headerText.includes('permit') ? 10 : 0) +
        (headerText.includes('address') ? 5 : 0) +
        (headerText.includes('status') ? 3 : 0) +
        ((t.rows?.length || 0) > 3 ? 2 : 0)
      return { t, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    if (!best || best.score < 5) {
      return { headers: [], rows: [], debug: 'no table matched permit heuristics' }
    }

    const headerCells = Array.from(
      best.t.querySelectorAll('thead th, tr:first-child th, tr:first-child td')
    ).map(c => c.innerText.trim())

    const rowsOut = []
    for (const tr of Array.from(best.t.querySelectorAll('tbody tr, tr')).slice(1)) {
      const cells = Array.from(tr.querySelectorAll('td')).map(c => c.innerText.trim())
      if (cells.length > 0) rowsOut.push(cells)
    }
    return { headers: headerCells, rows: rowsOut, debug: `matched table score=${best.score}` }
  })

  logger(`    ${extracted.debug}`)
  if (!extracted.headers.length || !extracted.rows.length) return []

  const findIdx = (...names) => {
    const normed = extracted.headers.map(h => h.toLowerCase())
    for (const n of names) {
      const i = normed.findIndex(h => h.includes(n))
      if (i >= 0) return i
    }
    return -1
  }

  const idx = {
    number: findIdx('permit', 'number'),
    type: findIdx('type', 'description'),
    status: findIdx('status'),
    filed: findIdx('filed', 'applied', 'date'),
    issued: findIdx('issued'),
    address: findIdx('address', 'location', 'site'),
    valuation: findIdx('value', 'valuation', 'cost'),
    contractor: findIdx('contractor'),
    scope: findIdx('scope', 'description', 'work'),
  }

  return extracted.rows.map(cells => {
    const get = i => (i >= 0 && i < cells.length ? cells[i] : null)
    const vRaw = get(idx.valuation)
    const valuation = vRaw ? parseFloat(String(vRaw).replace(/[$,\s]/g, '')) : null
    return {
      portal_id: PORTAL_ID,
      permit_number: get(idx.number),
      permit_type: get(idx.type),
      permit_status: get(idx.status),
      date_filed: get(idx.filed),
      date_issued: get(idx.issued),
      valuation: Number.isFinite(valuation) ? valuation : null,
      scope_description: get(idx.scope),
      contractor_name: get(idx.contractor),
      address: get(idx.address),
      raw_link: null,
    }
  }).filter(p => p.permit_number)
}

async function scrapeMiamiDade({ filters = {}, logger = console.log } = {}) {
  logger(`[miami-dade] starting`)
  logger(`[miami-dade] filters: price_floor=${filters.price_floor}, days_lookback=${filters.days_lookback}`)

  let browser
  try {
    browser = await launchBrowser(logger)
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    logger(`[miami-dade] opening ${PORTAL_LANDING_URL}`)
    await page.goto(PORTAL_LANDING_URL, { waitUntil: 'networkidle2', timeout: 45000 }).catch(async e => {
      logger(`    networkidle2 failed: ${e.message} — retrying with domcontentloaded`)
      await page.goto(PORTAL_LANDING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    })

    await dumpPage(page, 'miami-dade-landing', logger)

    // Heuristic click: try anchor text containing permit-related keywords.
    // puppeteer-core doesn't support :has-text selectors, so we iterate
    // via page.evaluate to find the best matching link.
    const clickedSearch = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'))
      const candidates = ['permit search', 'search permits', 'permit history', 'open permit']
      for (const kw of candidates) {
        const el = links.find(l => (l.innerText || '').toLowerCase().includes(kw))
        if (el) {
          el.click()
          return kw
        }
      }
      return null
    })

    if (clickedSearch) {
      logger(`    clicked link containing "${clickedSearch}"`)
      await sleep(2000)
      await dumpPage(page, 'miami-dade-after-search-click', logger)
    }

    const permits = await extractPermitsFromTable(page, logger)
    logger(`[miami-dade] extracted ${permits.length} permit rows`)

    const status = permits.length > 0 ? 'success' : 'partial'
    const summary = permits.length > 0
      ? `Extracted ${permits.length} permits from Miami-Dade portal`
      : `Diagnostic run complete. Landing page loaded and ${clickedSearch ? `link "${clickedSearch}" clicked` : 'NO search link found'}. No permit rows extracted yet — inspect debug dumps in .agent-runs/scrapers/ and tighten selectors in miami-dade.js.`

    return {
      portal_id: PORTAL_ID,
      status,
      permits_found: permits.length,
      new_permits: permits.length,
      summary,
      error: null,
      permits,
    }
  } catch (e) {
    logger(`[miami-dade] FAILED: ${e.message}`)
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

module.exports = { scrapeMiamiDade }
