// PraskForce1 — Shared Puppeteer launcher for scripts/scrapers/*
//
// Uses the full `puppeteer` package, which ships with a bundled
// Chromium that's version-matched to the library — so CI and fresh
// machines work without any browser pre-install. Set
// PUPPETEER_EXECUTABLE_PATH to override (useful for local dev to
// reuse your installed Chrome instead of waiting for the bundled
// Chromium to start).
//
// This file is CommonJS — the scripts/ directory mixes CJS and ESM,
// and scripts/runner.js (CJS) requires these scraper modules.

const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

async function launchBrowser(logger = console.log) {
  const puppeteer = require('puppeteer')

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || null
  const headless = (process.env.PF1_HEADLESS || process.env.PUPPETEER_HEADLESS || 'false').toLowerCase() === 'true'
  const slowMo = Number(process.env.PUPPETEER_SLOWMO || '50')

  if (executablePath && !existsSync(executablePath)) {
    throw new Error(
      `PUPPETEER_EXECUTABLE_PATH is set to "${executablePath}" but that file does not exist. Unset it to use the bundled Chromium, or fix the path.`
    )
  }

  logger(`    launching Chrome (headless=${headless}, slowMo=${slowMo}, ${executablePath ? `path=${executablePath}` : 'bundled Chromium'})`)
  return puppeteer.launch({
    ...(executablePath ? { executablePath } : {}),
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
}
