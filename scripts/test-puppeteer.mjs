#!/usr/bin/env node
// PraskForce1 — Puppeteer Smoke Test
// Standalone script: launches your local Chrome, navigates to google.com,
// takes a screenshot, and exits. No Next.js required.
//
// Usage:
//   npm install
//   node scripts/test-puppeteer.mjs
//
// Reads:
//   PUPPETEER_EXECUTABLE_PATH (defaults to common Windows Chrome path)
//   PUPPETEER_HEADLESS        (default "false")
//   PUPPETEER_SLOWMO          (default "50")

import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'node:process'

// Tiny .env.local loader so this script works without next dev running.
async function loadDotEnv() {
  try {
    const { readFile } = await import('node:fs/promises')
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(here, '..', '.env.local')
    const raw = await readFile(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const [, k, vRaw] = m
      if (process.env[k]) continue
      const v = vRaw.replace(/^["']|["']$/g, '')
      process.env[k] = v
    }
  } catch {
    // No .env.local — fine, fall back to process.env / defaults.
  }
}

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
  return WINDOWS_CHROME_DEFAULTS[0] // best guess; will fail loudly if missing
}

async function main() {
  await loadDotEnv()

  const executablePath = pickChromePath()
  const headless = (process.env.PUPPETEER_HEADLESS || 'false').toLowerCase() === 'true'
  const slowMo = Number(process.env.PUPPETEER_SLOWMO || '50')

  console.log('━━━ PraskForce1 Puppeteer Smoke Test ━━━')
  console.log('Chrome path :', executablePath)
  console.log('Headless    :', headless)
  console.log('SlowMo      :', slowMo, 'ms')

  if (!existsSync(executablePath)) {
    console.error('\n[FAIL] Chrome not found at the path above.')
    console.error('Fix: set PUPPETEER_EXECUTABLE_PATH in .env.local to your chrome.exe.')
    process.exit(1)
  }

  let browser
  try {
    console.log('\n[1/4] Launching Chrome...')
    browser = await puppeteer.launch({
      executablePath,
      headless,
      slowMo,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-first-run', '--no-default-browser-check'],
    })
    console.log('       OK  — browser launched')

    console.log('[2/4] Opening new page...')
    const page = await browser.newPage()
    console.log('       OK')

    console.log('[3/4] Navigating to https://www.google.com ...')
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    const title = await page.title()
    console.log('       OK  — page title:', JSON.stringify(title))

    console.log('[4/4] Taking screenshot...')
    const here = dirname(fileURLToPath(import.meta.url))
    const outDir = resolve(here, '..', '.agent-runs')
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    const outPath = resolve(outDir, `smoke-${Date.now()}.png`)
    await page.screenshot({ path: outPath, fullPage: false })
    console.log('       OK  — saved to', outPath)

    await browser.close()
    console.log('\n[PASS] Puppeteer is working. You can now run the agent engine.')
    process.exit(0)
  } catch (err) {
    console.error('\n[FAIL]', err.message)
    if (browser) {
      try { await browser.close() } catch {}
    }
    process.exit(1)
  }
}

main()
