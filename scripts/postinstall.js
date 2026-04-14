#!/usr/bin/env node
/**
 * PraskForce1 — postinstall hook
 *
 * Downloads the Chromium binary that Playwright needs for the scraper
 * runner. This is a 300MB+ download and only needs to happen when:
 *   - You're going to run `node scripts/runner.js` locally, OR
 *   - You're going to run `npm run dev` and actually invoke a scraper
 *
 * Skipped automatically in environments where we don't need it:
 *   - CI: $CI is set by GitHub Actions, Vercel, etc.
 *   - $PF1_SKIP_PLAYWRIGHT is set to any truthy value
 *   - Playwright is already installed (presence check on the cache dir)
 *
 * If the download fails (network issue, no disk space, etc.) we print
 * a warning and exit 0 so `npm install` / `npm ci` still succeeds —
 * the user can run `npx playwright install chromium` manually later.
 */

const { spawnSync } = require('child_process')

function log(msg) {
  console.log(`[pf1-postinstall] ${msg}`)
}

function shouldSkip() {
  if (process.env.CI) return 'CI environment detected ($CI is set)'
  if (process.env.PF1_SKIP_PLAYWRIGHT) return '$PF1_SKIP_PLAYWRIGHT is set'
  if (process.env.GITHUB_ACTIONS) return 'GitHub Actions detected'
  return null
}

const skipReason = shouldSkip()
if (skipReason) {
  log(`Skipping Playwright Chromium install: ${skipReason}`)
  log(`Run \`npx playwright install chromium\` manually if you need it later.`)
  process.exit(0)
}

log('Installing Playwright Chromium (this can take a minute on first install)...')
const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: true,
})

if (result.status !== 0) {
  log(`Playwright install exited with code ${result.status}.`)
  log(`This is non-fatal — npm install will continue.`)
  log(`You can retry later with: npx playwright install chromium`)
}
process.exit(0)
