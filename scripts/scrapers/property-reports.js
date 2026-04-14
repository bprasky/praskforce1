// PraskForce1 — PropertyReports.us Scraper (puppeteer-core)
//
// Discovery source. Requires a paid PropertyReports.us login, read
// from env vars PF1_PROPERTY_REPORTS_USERNAME / _PASSWORD.
//
// Use Configuration → Credentials → "Export to .env.local" to
// sync vault entries into these env vars automatically.
//
// STATUS: FIRST PASS / DIAGNOSTIC
// Tries generic login selectors against the landing page, dumps
// screenshots + HTML at every step. After you run it once, we'll
// tighten the post-login navigation based on what the .agent-runs
// dumps show.

const { launchBrowser, dumpPage, sleep } = require('./_puppeteer')

const PORTAL_ID = 'property_reports'
const LANDING_URL = 'https://www.propertyreports.us/'

async function attemptLogin(page, username, password, logger) {
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
  ]

  let userField = null
  for (const sel of userSelectors) {
    userField = await page.$(sel).catch(() => null)
    if (userField) { logger(`    found user field: ${sel}`); break }
  }
  if (!userField) {
    logger(`    no username field found`)
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

  await userField.type(username)
  await passField.type(password)

  let submitted = false
  for (const sel of submitSelectors) {
    const btn = await page.$(sel).catch(() => null)
    if (btn) {
      logger(`    submitting via ${sel}`)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        btn.click(),
      ])
      submitted = true
      break
    }
  }

  if (!submitted) {
    logger(`    no submit button — trying Enter key`)
    await passField.press('Enter')
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
  }

  return true
}

async function scrapePropertyReports({ filters = {}, logger = console.log } = {}) {
  logger(`[propertyreports] starting`)

  const username = process.env.PF1_PROPERTY_REPORTS_USERNAME
  const password = process.env.PF1_PROPERTY_REPORTS_PASSWORD

  if (!username || !password) {
    const msg = 'Missing credentials. Set PF1_PROPERTY_REPORTS_USERNAME and PF1_PROPERTY_REPORTS_PASSWORD in .env.local, or click "Export to .env.local" on the Credentials tab to mirror your vault automatically.'
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
    browser = await launchBrowser(logger)
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    logger(`[propertyreports] opening ${LANDING_URL}`)
    await page.goto(LANDING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await dumpPage(page, 'propertyreports-landing', logger)

    logger(`[propertyreports] attempting login as ${username}`)
    const attempted = await attemptLogin(page, username, password, logger)

    if (attempted) {
      await sleep(2000)
      await dumpPage(page, 'propertyreports-post-login', logger)
    }

    return {
      portal_id: PORTAL_ID,
      status: 'partial',
      permits_found: 0,
      new_permits: 0,
      summary: `Diagnostic run complete. Login ${attempted ? 'attempted' : 'not attempted (no form found)'}. Inspect .agent-runs/scrapers/propertyreports-*.{png,html} to see the post-login state, then tighten the search navigation in property-reports.js.`,
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
      error: `Puppeteer error: ${e.message}`,
      permits: [],
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

module.exports = { scrapePropertyReports }
