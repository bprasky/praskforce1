// PraskForce1 — PropertyReports.us Scraper
//
// Discovery source. Requires a paid PropertyReports.us login. Scrapes
// the "recent transactions" view for high-value Miami-area closings.
//
// CREDENTIALS
// Reads from environment variables. Put them in .env.local for local
// runs, or in GitHub Actions secrets for CI runs:
//
//   PF1_PROPERTY_REPORTS_USERNAME="..."
//   PF1_PROPERTY_REPORTS_PASSWORD="..."
//
// STATUS: FIRST PASS / DIAGNOSTIC
// The exact login flow and post-login URL structure isn't documented
// publicly, so this first pass:
//   1. Opens the landing page
//   2. Tries to find and submit a login form (generic selectors)
//   3. Dumps screenshots + HTML at every step into .debug/
//   4. Tries to land on a recent-sales page and extract transactions
//   5. Returns whatever it finds
//
// Run it once with PF1_HEADLESS=0 so you can see exactly where it
// lands, then tighten the selectors based on the .debug/ output.

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const PORTAL_ID = 'property_reports'
const LANDING_URL = 'https://www.propertyreports.us/'
const DEBUG_DIR = path.join(__dirname, '.debug')

function ensureDebugDir() { fs.mkdirSync(DEBUG_DIR, { recursive: true }) }
function ts() { return new Date().toISOString().replace(/[:.]/g, '-') }

async function dumpPage(page, label, logger) {
  ensureDebugDir()
  const stamp = ts()
  const pngPath = path.join(DEBUG_DIR, `propertyreports-${label}-${stamp}.png`)
  const htmlPath = path.join(DEBUG_DIR, `propertyreports-${label}-${stamp}.html`)
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

async function attemptLogin(page, username, password, logger) {
  // Try generic login selectors — iterate if the real page uses
  // something weirder.
  const userSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[id*="email" i]',
    'input[id*="user" i]',
  ]
  const passSelectors = [
    'input[type="password"]',
    'input[name="password"]',
  ]
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    'button:has-text("Login")',
  ]

  let userField = null
  for (const sel of userSelectors) {
    userField = await page.$(sel).catch(() => null)
    if (userField) { logger(`    found user field: ${sel}`); break }
  }
  if (!userField) {
    logger(`    no username field found — portal may not require login or uses non-standard markup`)
    return false
  }

  let passField = null
  for (const sel of passSelectors) {
    passField = await page.$(sel).catch(() => null)
    if (passField) { logger(`    found pass field: ${sel}`); break }
  }
  if (!passField) {
    logger(`    no password field found`)
    return false
  }

  await userField.fill(username)
  await passField.fill(password)

  let submitted = false
  for (const sel of submitSelectors) {
    const btn = await page.$(sel).catch(() => null)
    if (btn) {
      logger(`    submitting via ${sel}`)
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}),
        btn.click(),
      ])
      submitted = true
      break
    }
  }

  if (!submitted) {
    logger(`    no submit button — trying Enter key`)
    await passField.press('Enter')
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
  }

  return true
}

async function scrapePropertyReports({ filters = {}, logger = console.log } = {}) {
  logger(`[propertyreports] starting`)

  const username = process.env.PF1_PROPERTY_REPORTS_USERNAME
  const password = process.env.PF1_PROPERTY_REPORTS_PASSWORD

  if (!username || !password) {
    const msg = 'Missing credentials. Set PF1_PROPERTY_REPORTS_USERNAME and PF1_PROPERTY_REPORTS_PASSWORD in .env.local or as environment variables.'
    logger(`[propertyreports] ${msg}`)
    return {
      portal_id: PORTAL_ID,
      status: 'failed',
      permits_found: 0,
      new_permits: 0,
      summary: null,
      error: msg,
      permits: [],
    }
  }

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

    logger(`[propertyreports] opening ${LANDING_URL}`)
    await page.goto(LANDING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await dumpPage(page, 'landing', logger)

    logger(`[propertyreports] attempting login as ${username}`)
    const loggedIn = await attemptLogin(page, username, password, logger)

    if (loggedIn) {
      await page.waitForTimeout(2000)
      await dumpPage(page, 'post-login', logger)
    }

    // At this point we don't know the post-login URL structure for
    // PropertyReports.us (Claude-in-Chrome couldn't reach the previous
    // URL pattern). This diagnostic first-pass returns a partial
    // status with debug hints. After running, paste me what you see
    // in the post-login screenshot and we'll tighten the search logic.
    return {
      portal_id: PORTAL_ID,
      status: 'partial',
      permits_found: 0,
      new_permits: 0,
      summary: `Diagnostic run complete. Login ${loggedIn ? 'attempted' : 'not attempted (no form found)'}. Inspect scripts/scrapers/.debug/propertyreports-*.{png,html} to see the post-login state, then tighten the search navigation in property-reports.js.`,
      error: null,
      permits: [],
    }
  } catch (e) {
    logger(`[propertyreports] FAILED: ${e.message}`)
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

module.exports = { scrapePropertyReports }
