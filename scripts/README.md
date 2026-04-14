# PraskForce1 Background Runner

This is the piece that turns PraskForce1 from a copy-paste workflow into a real
automated system. It polls the `agent_jobs` table in Supabase for queued work
and dispatches each job to a handler — portal scans, IG rundowns, StoneProfits
quotes, etc.

## Current state: foundation

The dispatch loop, job claiming (with race protection), error handling, and
result writing are **complete**. What's **stubbed** is the actual per-portal
scraping logic. Each handler currently logs "would run X" and marks the job
done with a dry-run result. Real scrapers plug in at the handler functions
marked `TODO` in `runner.js`.

This split is intentional: we wanted the plumbing committed and verifiable
against a real Supabase instance before wiring up browser automation, which is
significantly more fragile and needs portal-by-portal iteration.

## Prerequisites

1. **Supabase connected.** The runner reads and writes `agent_jobs` directly
   from a Node process — it cannot use the localStorage fallback the web app
   uses. Connect Supabase in Configuration → Database and run the schema from
   `supabase/schema.sql` (see main README for the SQL blocks that need to be
   applied).
2. **Service role key.** The runner uses the service role key, not the anon
   key, because it needs to bypass row-level security. Get it from Supabase
   Dashboard → Project Settings → API → `service_role` (secret). Never commit
   this key or ship it to the browser.

## Running it locally

```bash
# One-shot: process all queued jobs and exit
export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
node scripts/runner.js

# Daemon mode: poll every 60s, keep running
node scripts/runner.js --daemon

# Limit to one kind of job (useful for targeted retries)
node scripts/runner.js --kind portal_scan
```

## Running it on a schedule

There are three reasonable options. The repo includes a GitHub Actions
workflow for the most universal one.

### Option 1: GitHub Actions (recommended to start)

See `.github/workflows/portal-sync.yml`. Runs the script on a cron schedule
(default: every hour). To enable:

1. In the repo on GitHub, add two secrets under Settings → Secrets and
   variables → Actions:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. The workflow triggers automatically on schedule, and you can manually
   trigger a run from the Actions tab with `workflow_dispatch`.
3. Logs appear in the Actions tab.

Good for: running without any servers, simple credential management, cheap
(free for public repos, generous minutes for private).

### Option 2: Local cron on your Mac/Windows machine

```bash
# Mac — edit crontab
crontab -e
# Add (runs every hour on the top of the hour):
0 * * * * cd /path/to/praskforce1 && NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/runner.js >> /tmp/pf1-runner.log 2>&1
```

Good for: running with local 1Password integration, fastest iteration on
credentialed portals, no need to ship secrets to GitHub.

### Option 3: Always-on daemon on a small VM

```bash
# systemd unit file — /etc/systemd/system/pf1-runner.service
[Unit]
Description=PraskForce1 Background Runner
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/praskforce1
Environment=NEXT_PUBLIC_SUPABASE_URL=https://...
Environment=SUPABASE_SERVICE_ROLE_KEY=eyJ...
ExecStart=/usr/bin/node scripts/runner.js --daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Good for: low-latency job pickup, running through credentials vaults accessible
to the VM, handling background jobs more aggressively.

## Adding real portal scrapers

The handler functions in `runner.js` are where the real work lives. Open
`handlePortalScan` and look at the `TODO` block. Recommended approach:

**For public portals** (Miami-Dade County, Coral Gables EdenWeb, Sunbiz,
Property Appraiser):

```js
const cheerio = require('cheerio')

async function scrapeMiamiDadeCounty(filters) {
  const url = 'https://www.miamidade.gov/permits/search.asp?...'
  const html = await fetch(url).then(r => r.text())
  const $ = cheerio.load(html)
  const permits = []
  $('.permit-row').each((_, el) => {
    permits.push({
      portal_id: 'dade_county',
      permit_number: $(el).find('.number').text().trim(),
      // ... etc
    })
  })
  return permits
}
```

Add `cheerio` to `package.json` when you ship a real scraper:
`npm install cheerio`

**For credentialed portals** (Miami Beach Civic, City of Miami iBuild,
PropertyReports): use Playwright. Add `playwright` to `package.json` and
install browsers: `npx playwright install chromium`. Write per-portal login
flows that pull credentials from environment variables (GitHub Actions
secrets, or a local 1Password CLI shim).

Each new scraper goes in its own file under `scripts/scrapers/` and gets
wired into `handlePortalScan` by a switch on `portal_id`. Keep handlers
small and testable — one function per portal.

## Safety notes

- **Service role key has full DB access.** Treat it like a password. Never
  commit it. Never log it. Use GitHub Actions secrets or a local `.env` file
  (already gitignored).
- **Claim-before-run race protection.** The claim query uses
  `eq('status', 'queued')` as a guard, so two runners can't pick up the same
  job. If you run the daemon and GHA simultaneously, at most one will win
  each job.
- **Failed jobs stay failed.** The runner doesn't auto-retry. If a scrape
  fails, the job is marked `failed` with the error message. Fix it and re-
  queue from the web UI (the Pipeline/Leads page has retry buttons).
- **Idempotency.** The permits upsert uses
  `(portal_source, permit_number)` as the dedup key, so re-running a scan
  over the same day won't create duplicate permit rows. Scan runs on the
  `scan_log` table are always appended though — that's the audit trail.
