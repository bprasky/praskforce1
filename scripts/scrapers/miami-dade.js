// PraskForce1 — Miami-Dade County Permit Scraper
//
// Public portal, no login required. Notoriously ASP.NET WebForms under
// the hood, with ViewState postbacks that would be miserable to replay
// with raw HTTP. Playwright handles it by running the real JS and
// letting us click through the forms.
//
// STATUS: FIRST PASS / DIAGNOSTIC
// =================================
// The exact search URL and DOM structure vary by portal redesign, and
// I couldn't verify them from the sandbox (Miami-Dade.gov blocks
// automated fetches from unknown user-agents). This first-pass
// implementation takes the "instrument everything" approach:
//
//   1. Open the portal landing page
//   2. Dump a full-page screenshot + HTML to scripts/scrapers/.debug/
//   3. Try a few reasonable search interactions using heuristic selectors
//   4. Dump the result page if anything loads
//   5. Return whatever permits we could extract, with status=partial if
//      the search didn't produce clean results so we know to iterate
//
// After the first real run, inspect the .debug/ directory, paste me
// the filenames and any console output, and I'll tighten the selectors.
//
// CONTRACT:
// Input:  { filters, logger }
// Output: {
//   portal_id: 'dade_county',
//   status: 'success' | 'partial' | 'failed',
//   permits_found: number,
//   new_permits: number,
//   summary: string | null,
//   error: string | null,
//   permits: Array<{ portal_id, permit_number, address, permit_type, ... }>,
// }

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const PORTAL_ID = 'dade_county'
const PORTAL_LANDING_URL = 'https://www.miamidade.gov/global/service.page?Mduid_service=ser1526416920257510'
const DEBUG_DIR = path.join(__dirname, '.debug')

function ensureDebugDir() {
  fs.mkdirSync(DEBUG_DIR, { recursive: true })
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function dumpPage(page, label, logger) {
  ensureDebugDir()
  const stamp = ts()
  const pngPath = path.join(DEBUG_DIR, `miami-dade-${label}-${stamp}.png`)
  const htmlPath = path.join(DEBUG_DIR, `miami-dade-${label}-${stamp}.html`)
  try {
    await page.screenshot({ path: pngPath, fullPage: true })
    logger(`    📸 screenshot: ${pngPath}`)
  } catch (e) {
    logger(`    ⚠ screenshot failed: ${e.message}`)
  }
  try {
    const html = await page.content()
    fs.writeFileSync(htmlPath, html)
    logger(`    📄 html: ${htmlPath}`)
  } catch (e) {
    logger(`    ⚠ html dump failed: ${e.message}`)
  }
  return { pngPath, htmlPath }
}

// Heuristic extractors — these work on generic HTML tables and can be
// tightened per portal once we see the real DOM.
async function extractPermitsFromTable(page, logger) {
  const rows = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'))
    // Prefer tables that look like permit result tables — have headers
    // containing "permit" and more than 3 rows
    const scored = tables.map(t => {
      const headerText = t.querySelector('thead')?.innerText?.toLowerCase() || t.rows?.[0]?.innerText?.toLowerCase() || ''
      const score = (headerText.includes('permit') ? 10 : 0) +
                    (headerText.includes('address') ? 5 : 0) +
                    (headerText.includes('status') ? 3 : 0) +
                    (t.rows?.length > 3 ? 2 : 0)
      return { t, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    if (!best || best.score < 5) return { headers: [], rows: [], debug: 'no table matched permit heuristics' }

    const rowsOut = []
    const headerCells = Array.from(best.t.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map(c => c.innerText.trim())
    for (const tr of Array.from(best.t.querySelectorAll('tbody tr, tr')).slice(1)) {
      const cells = Array.from(tr.querySelectorAll('td')).map(c => c.innerText.trim())
      if (cells.length > 0) rowsOut.push(cells)
    }
    return { headers: headerCells, rows: rowsOut, debug: `matched table score=${best.score}` }
  })

  logger(`    ${rows.debug}`)
  if (!rows.headers.length || !rows.rows.length) {
    return []
  }

  // Try to normalize — find column indices by header name
  const findIdx = (...names) => {
    const normed = rows.headers.map(h => h.toLowerCase())
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

  return rows.rows.map(cells => {
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
  }).filter(p => p.permit_number) // drop rows without a permit number
}

async function scrapeMiamiDade({ filters = {}, logger = console.log } = {}) {
  logger(`[miami-dade] starting`)
  logger(`[miami-dade] filters: price_floor=${filters.price_floor}, days_lookback=${filters.days_lookback}`)

  let browser
  try {
    browser = await chromium.launch({
      headless: process.env.PF1_HEADLESS !== '0',
      timeout: 30000,
    })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1400, height: 900 },
    })
    const page = await context.newPage()

    logger(`[miami-dade] opening ${PORTAL_LANDING_URL}`)
    await page.goto(PORTAL_LANDING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      logger(`    networkidle timed out — continuing anyway`)
    })

    // Dump landing page for inspection
    await dumpPage(page, 'landing', logger)

    // Heuristic: try to find and click a "search permits" link/button
    const searchLinkCandidates = [
      'a:has-text("Permit Search")',
      'a:has-text("Search Permits")',
      'a:has-text("Permit")',
      'button:has-text("Search")',
      'a[href*="permit"][href*="search"]',
    ]

    let clickedSearch = false
    for (const selector of searchLinkCandidates) {
      try {
        const el = await page.$(selector)
        if (el) {
          logger(`    found candidate: ${selector}`)
          await Promise.all([
            page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}),
            el.click(),
          ])
          clickedSearch = true
          break
        }
      } catch (e) {
        // try next candidate
      }
    }

    if (clickedSearch) {
      await page.waitForTimeout(2000)
      await dumpPage(page, 'after-search-click', logger)
    }

    // Try to extract any visible permit data from whatever page we're on
    const permits = await extractPermitsFromTable(page, logger)
    logger(`[miami-dade] extracted ${permits.length} permit rows`)

    // Status logic: if we got real rows, success. If we got HTML dumps
    // but no rows, partial (need to iterate on selectors). If we
    // couldn't load the page, failed.
    const status = permits.length > 0 ? 'success' : 'partial'
    const summary = permits.length > 0
      ? `Extracted ${permits.length} permits from Miami-Dade portal`
      : `Diagnostic run complete. Landing page loaded and ${clickedSearch ? 'search link clicked' : 'NO search link found'}. No permit rows extracted yet — inspect screenshots + HTML in scripts/scrapers/.debug/ and tighten the selectors in miami-dade.js.`

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
      error: `Playwright error: ${e.message}`,
      permits: [],
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

module.exports = { scrapeMiamiDade }
