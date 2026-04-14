// PraskForce1 — Shared Puppeteer launcher for scripts/scrapers/*
//
// All standalone scrapers import this so they pick up the user's
// system Chrome via PUPPETEER_EXECUTABLE_PATH and behave consistently
// with scripts/test-puppeteer.mjs and src/lib/agent-engine.js (the
// server-side sibling that runs recipes via Next.js API routes).
//
// This file is CommonJS — the scripts/ directory mixes CJS and ESM,
// and scripts/runner.js (CJS) requires these scraper modules.

const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const WINDOWS_CHROME_DEFAULTS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

function pickChromePath() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH
  if (fromEnv) return fromEnv
  for (const p of WINDOWS_CHROME_DEFAULTS) {
    if (existsSync(p)) return p
  }
  return WINDOWS_CHROME_DEFAULTS[0]
}

async function launchBrowser(logger = console.log) {
  // puppeteer-core is an ESM default export; require works via
  // Node's CJS-ESM interop since it ships a CJS entry.
  const puppeteer = require('puppeteer-core')

  const executablePath = pickChromePath()
  const headless = (process.env.PF1_HEADLESS || process.env.PUPPETEER_HEADLESS || 'false').toLowerCase() === 'true'
  const slowMo = Number(process.env.PUPPETEER_SLOWMO || '50')

  if (!existsSync(executablePath)) {
    throw new Error(
      `Chrome not found at "${executablePath}". Set PUPPETEER_EXECUTABLE_PATH in .env.local to your chrome.exe path.`
    )
  }

  logger(`    launching Chrome (headless=${headless}, slowMo=${slowMo})`)
  return puppeteer.launch({
    executablePath,
    headless,
    slowMo,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check'],
  })
}

// Shared debug dump: saves PNG + HTML under .agent-runs/ (matches
// the agent engine's location) so both the standalone runner and the
// server-side engine write to the same place.
const DEBUG_DIR = path.resolve(__dirname, '..', '..', '.agent-runs', 'scrapers')

function ensureDebugDir() {
  if (!existsSync(DEBUG_DIR)) mkdirSync(DEBUG_DIR, { recursive: true })
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function dumpPage(page, label, logger) {
  ensureDebugDir()
  const stamp = ts()
  const pngPath = path.join(DEBUG_DIR, `${label}-${stamp}.png`)
  const htmlPath = path.join(DEBUG_DIR, `${label}-${stamp}.html`)
  try {
    await page.screenshot({ path: pngPath, fullPage: true })
    logger(`    📸 ${pngPath}`)
  } catch (e) {
    logger(`    ⚠ screenshot failed: ${e.message}`)
  }
  try {
    const html = await page.content()
    writeFileSync(htmlPath, html)
    logger(`    📄 ${htmlPath}`)
  } catch (e) {
    logger(`    ⚠ html dump failed: ${e.message}`)
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  launchBrowser,
  dumpPage,
  sleep,
  pickChromePath,
}
